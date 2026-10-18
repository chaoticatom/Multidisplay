// The Auto-DJ: two decks, mixed live like a DJ would.
// While a track plays on deck A, the next is chosen (the one you picked, or
// the best fit by tempo and key), analysed (tempo, beat grid, downbeat,
// intro/outro length, key, loudness - dj/analyse.js) and decoded with its
// tempo matched to A's and, when it helps, its pitch moved a semitone so the
// keys agree. The mix is planned on the bars: it starts on a phrase boundary
// of A and lands B's downbeat on A's. Its length fits both tracks (A's
// outro and B's intro, up to 128 beats) unless a fixed length is set. The
// mix is a three-band one: B's highs come in first, then its mids, the bass
// swaps on a bar half-way (two kicks never clash), then A's mids and highs
// go. Both are levelled to the same loudness. Tracks whose beat isn't clear,
// or whose tempo is too far off (> 8%), get a filtered equal-power crossfade.
// Output: stereo 44.1 kHz s16 PCM, produced just ahead of the speaker.
'use strict';

const RATE = 44100;
const MAX_STRETCH = 0.12; // tempo matched within 12% (the pitch is kept)
// Transitions where the old song goes out on an effect and the new one
// drops in after it - for songs that can't be beat-matched, and now and
// then for variety: an echo-out, a filter sweep, a vinyl brake, a loop roll.
const FX = new Set(['echo', 'filter', 'brake', 'roll']);
const LENGTHS = [256, 192, 128, 96, 64, 48, 32, 16]; // up to ~2 minutes with both songs heard
const TARGET_DB = -17;
const STYLES = ['auto', 'blend', 'short', 'cut'];
const CUT = 882; // a cut's crossfade: 20 ms, just enough to avoid a click

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

function createDjEngine({ onPcm, getQueueMs = () => 0, sources = require('./sources'), decode = require('./decode'), analyser = require('./analyse'), log = console.log, setTimer = setInterval, clearTimer = clearInterval }) {
  const st = { dropAt: 0, tease: null, eq: [1, 1, 1, 0, 0, 0], mixLen: 0, mixSwap: -1, doneAt: 0, state: 'stopped', error: '', now: null, next: null, mixing: false, played: 0, queue: [], nowIdx: -1, nextIdx: -1 };
  let wantNext = null, prepToken = 0;
  let cfg = { source: 'both', youtube: '', mixBeats: 'auto', quick: false, style: 'auto' };
  let list = [], idx = 0, A = null, B = null, preparing = null, timer = null, mix = null, gen = 0;
  let known = {}; const recent = [], played = new Set(); let extending = null, lastStyle = '', lastTease = 0, lastMixAt = 0, startedAt = Date.now(), poolBusy = false;

  function deckFrom(track, info, pcm, tempo, matched, semis = 0) {
    const k = RATE / tempo; // original seconds -> played frames
    const d = { track, info, pcm, frames: pcm.length / 2, tempo, matched, semis, pos: 0, lp: new Float32Array(8), plan: null };
    d.period = info.period * k; d.firstBeat = info.firstBeat * k; d.start = info.musicStart * k; d.end = Math.min(d.frames, info.musicEnd * k);
    d.bpm = info.bpm * tempo; d.bar = 4 * d.period;
    d.introBeats = info.introBeats || 0; d.outroBeats = info.outroBeats || 0;
    d.steady = info.steady !== false;
    d.beatF = Array.isArray(info.beatTimes) && info.beatTimes.length > 8 ? info.beatTimes.map((s) => s * k) : null; // every beat, in played frames d.endKind = info.endKind || 'cold'; d.fadeStart = (info.fadeStart || info.musicEnd) * k;
    // Level songs by loudness as heard (LUFS) when the analysis has it.
    d.gain = Number.isFinite(info.lufs) && info.lufs > -60 ? Math.max(0.5, Math.min(2.5, Math.pow(10, (-16 - info.lufs) / 20))) : info.loudness ? Math.max(0.5, Math.min(2.5, Math.pow(10, (TARGET_DB - info.loudness) / 20))) : 1;
    if (matched && d.period > 0) {
      const gp = (info.gridPeriod || info.period) * k; // the analysed beat (the grid may be at half/double time)
      d.firstDown = d.firstBeat + ((info.downbeat || 0) % 4) * gp; d.vbBar = 4 * gp;
      d.inFrame = d.firstDown + Math.ceil((d.start - d.firstDown - d.period * 0.5) / d.bar) * d.bar; // the first bar of the music
      if (d.inFrame < 0) d.inFrame += d.bar;
    } else { d.firstDown = d.firstBeat; d.inFrame = d.start; }
    // Live recordings: trim a crowd intro / applause ending (very quiet bars
    // with no music in them) from the first and last 45 s.
    const en = info.energyBars, vb = d.vbBar || 4 * (info.period || 0.5) * k;
    if (!d.steady && en && vb > 0) {
      const fd = d.firstDown, at = (j) => Number(en[j] || 0);
      let j = Math.max(0, Math.floor((d.start - fd) / vb)); const jMax = Math.floor((d.start + 45 * RATE - fd) / vb);
      while (j < jMax && at(j) <= 1) j++;
      if (j > 0 && j < jMax) { d.start = Math.max(d.start, fd + j * vb); d.inFrame = Math.max(d.inFrame, d.start); }
      let je = Math.min(en.length - 1, Math.floor((d.end - fd) / vb)); const jMin = Math.floor((d.end - 45 * RATE - fd) / vb);
      while (je > jMin && at(je) <= 1) je--;
      if (je < en.length - 1 && je > jMin) d.end = Math.min(d.end, fd + (je + 1) * vb);
    }
    return d;
  }
  const nextBeat = (d, f) => (d.matched && d.period > 0 ? Math.round(d.firstBeat + Math.ceil((f - d.firstBeat) / d.period) * d.period) : f);
  const nextBar = (d, f) => (d.matched && d.period > 0 ? Math.round(d.firstDown + Math.ceil((f - d.firstDown) / d.bar) * d.bar) : f);

  // How much singing deck d has over frames f0..f1, 0..1 (the bars'
  // average; analysis from an older version only has yes/no per bar).
  function vocalAt(d, f0, f1) {
    const lv = d.info.vocalLevel, vb = d.info.vocalBars, src = lv || vb;
    if (!src || !d.vbBar) return 0;
    const j0 = Math.max(0, Math.floor((f0 - d.firstDown) / d.vbBar + 0.02)), j1 = Math.max(j0, Math.floor((f1 - d.firstDown) / d.vbBar - 0.02)); // a hair of tolerance: frame positions land a fraction off the bar line
    let s = 0, c = 0;
    for (let j = j0; j <= j1 && j < src.length; j++) { s += lv ? Number(src[j]) / 9 : src[j] === '1' ? 1 : 0; c++; }
    return c ? s / c : 0;
  }
  const vocalFree = (d, f0, f1) => vocalAt(d, f0, f1) < 0.3;
  // Energy over frames f0..f1 of deck d, 0..1 (quiet intro low, a drop high).
  function energyAt(d, f0, f1) {
    const en = d.info.energyBars; if (!en || !d.vbBar) return 0.5;
    const j0 = Math.max(0, Math.floor((f0 - d.firstDown) / d.vbBar + 0.02)), j1 = Math.max(j0, Math.floor((f1 - d.firstDown) / d.vbBar - 0.02));
    let s = 0, c = 0; for (let j = j0; j <= j1 && j < en.length; j++) { s += Number(en[j]) / 9; c++; }
    return c ? s / c : 0.5;
  }
  // Where the next song can come in: its intro (as ever); after a long quiet
  // intro, its first full section; its first drop (a quiet bar into a loud
  // one). Each on a phrase, in its first third; skipping music costs a little.
  function entries(b) {
    const out = [{ f: Math.round(b.inFrame), kind: 'intro', cost: 0 }];
    const en = b.info.energyBars; if (!en || !b.vbBar || !b.matched) return out;
    const at = (f) => Number(en[Math.floor((f - b.firstDown) / b.vbBar + 0.02)] || 0), phrase = 16 * b.period, lim = b.inFrame + 0.35 * (b.end - b.inFrame);
    let full = 0, drop = 0;
    for (let f = b.inFrame + phrase; f < lim; f += phrase) {
      if (!full && at(f) >= 6 && at(b.inFrame) <= 4) full = f;
      if (!drop && at(f) >= 7 && at(f - b.bar) <= 4) drop = f;
    }
    const skip = (f) => Math.min(0.4, 0.1 * ((f - b.inFrame) / RATE) / 30);
    if (full) out.push({ f: Math.round(full), kind: 'full', cost: skip(full) });
    if (drop && drop !== full) out.push({ f: Math.round(drop), kind: 'drop', cost: skip(drop) });
    // Its first new section after the intro (the song structure map).
    for (let f = b.inFrame + b.bar; f < lim; f += b.bar) if (sectionAt(b, f)) { if (!out.some((o) => Math.abs(o.f - f) < b.bar)) out.push({ f: Math.round(f), kind: 'section', cost: skip(f) + 0.05 }); break; }
    return out;
  }
  // Is frame f the start of a new section (verse, chorus, breakdown) of deck d?
  function sectionAt(d, f) {
    const sb = d.info.sectionBars; if (!sb || !d.vbBar) return false;
    const j = Math.round((f - d.firstDown) / d.vbBar);
    return Math.abs((f - d.firstDown) / d.vbBar - j) < 0.05 && sb[j] === '1';
  }
  const ENTRY_WHY = { intro: '', full: ' - skipping its quiet intro', drop: ' - straight into its drop', section: ' - at its first new section' };

  // A hint of the next song, now and then: B's catchiest bars (its most
  // sung, past its intro) laid over A for two bars where A isn't singing,
  // on a phrase, well before the mix - beat-matched, bass out, half volume.
  function planTease(a, b) {
    if (!(a.matched && b.matched) || !b.info.vocalLevel || !a.vbBar || !b.vbBar || Math.random() < 0.35 - 0.25 * taste('tease')) return null;
    const lv = b.info.vocalLevel, j0 = Math.ceil((b.inFrame - b.firstDown) / b.vbBar) + 4, j1 = Math.floor(0.75 * (b.end - b.firstDown) / b.vbBar);
    let bj = -1, bs = 11; // at least an average of 6 of 9 over the two bars
    for (let j = j0; j + 1 < Math.min(j1, lv.length); j++) { const v = Number(lv[j]) + Number(lv[j + 1]); if (v > bs) { bs = v; bj = j; } }
    if (bj < 0) return null;
    const len = 2 * a.bar, from = Math.max(a.pos + 10 * RATE, a.inFrame + 0.3 * (a.end - a.inFrame)), to = a.inFrame + 0.75 * (a.end - a.inFrame);
    const spots = [];
    for (let f = a.inFrame + Math.ceil((from - a.inFrame) / (16 * a.period)) * 16 * a.period; f + len < to; f += 16 * a.period) if (vocalAt(a, f - a.bar, f + len + a.bar) < 0.12) spots.push(Math.round(f));
    if (!spots.length) return null;
    return { at: spots[Math.floor(Math.random() * spots.length)], len: Math.round(len), bFrom: Math.round(b.firstDown + bj * b.vbBar) };
  }

  // Your 👍/👎 on past changes nudge the choice (cfg.taste: -1..1 per style).
  // ...and per time of day (what you like in the morning may differ at night).
  const dayPart = () => { const h = new Date().getHours(); return h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 23 ? 'evening' : 'night'; };
  const taste1 = (k) => { const t = cfg.taste && Number(cfg.taste[k]); return Number.isFinite(t) ? Math.max(-1, Math.min(1, t)) : 0; };
  const taste = (k) => 0.6 * taste1(k) + 0.6 * taste1(k + dayPart());
  const withTaste = (p) => p;
  // Rock and pop (a live drummer, or a song that can't be beat-matched with
  // the next): radio-style. A song that fades out has the next one start
  // under its fade, at its own tempo; a song that stops dead has the next
  // start right on its last hit - no gap, barely any overlap.
  function planRadio(a, b, now) {
    if (now) return { start: a.pos + CUT, len: 2 * RATE, beat: false, beats: 0, style: 'fade', bStart: 0, bIn: Math.round(b.inFrame), why: 'crossfade' };
    if (cfg.quick) {
      let s = Math.max(a.pos + CUT, a.inFrame + 60 * RATE);
      // Within the next 40 s, the quietest-vocal moment: never mid-line.
      let bestV = Infinity, bs2 = s;
      for (let f = s; f < Math.min(a.end - 10 * RATE, s + 40 * RATE); f += RATE) { const v = vocalAt(a, f, f + 4 * RATE) + (f - s) / RATE * 0.004; if (v < bestV) { bestV = v; bs2 = f; } }
      s = bs2;
      if (s < a.end - 10 * RATE) return { start: Math.round(s), len: 4 * RATE, beat: false, beats: 0, style: 'fade', bStart: 0, bIn: Math.round(b.inFrame), why: 'quick crossfade (live drums: no beat-matching)' };
    }
    // A fade-out: the next song starts as the fade begins and rises through it.
    if (a.endKind === 'fade' && a.end - a.fadeStart > 2 * RATE) {
      const start = Math.max(a.pos + CUT, a.fadeStart - 2 * RATE);
      return { start: Math.round(start), len: Math.max(6 * RATE, a.end - start), beat: false, beats: 0, style: 'underfade', bStart: 0, bIn: Math.round(b.inFrame), why: 'rises through its fade-out, radio style' };
    }
    // A dead stop: the next song's intro comes in under the ending once the
    // last sung line is over - 8 to 15 s - and takes over on the final hit.
    let lastSung = a.inFrame;
    for (let f = a.end - RATE; f > a.end - 40 * RATE && f > a.inFrame; f -= RATE) if (vocalAt(a, f, f + RATE) > 0.35) { lastSung = f + RATE; break; }
    const ov = Math.max(8 * RATE, Math.min(15 * RATE, a.end - lastSung)), start = Math.max(a.pos + CUT, Math.round(a.end - ov));
    if (a.end - start >= 6 * RATE) return { start, len: Math.round(a.end - start + 0.5 * RATE), beat: false, beats: 0, style: 'outro', bStart: 0, bIn: Math.round(b.inFrame), why: 'its intro under the ending, radio style' };
    return { start: Math.max(a.pos + CUT, Math.round(a.end - 0.25 * RATE)), len: Math.round(0.8 * RATE), beat: false, beats: 0, style: 'segue', bStart: 0, bIn: Math.round(b.inFrame), why: 'straight on from its last hit' };
  }

  // An effect transition starting at frame f: how long it runs and when (as
  // a fraction of it) the new song drops in.
  function fxPlan(style, f, a) {
    const pb = a.period > 0 ? a.period : RATE / 2;
    const spec = { echo: [4, 0.42], filter: [8, 0.75], roll: [4, 0.999], brake: [0, 0.82] }[style];
    const len = style === 'brake' ? Math.round(1.5 * RATE) : Math.round(spec[0] * pb);
    return { start: Math.round(f), len, beat: false, beats: 0, style, bStart: spec[1], period: pb };
  }
  // Songs that can't be beat-matched (tempos too far apart, or no clear
  // beat): an effect transition chosen from what both songs are like, at a
  // point where the old song isn't singing.
  function planFx(a, b, now) {
    const pb = a.period > 0 ? a.period : RATE / 2, step = a.matched ? a.bar : 4 * pb;
    // Quick mix: about a minute in (after the intro), like the beat-matched mixes.
    const quickFrom = Math.max(a.pos + CUT, a.inFrame + Math.max(55 * RATE, Math.max(16, a.introBeats || 0) * pb));
    const quick = cfg.quick && !now && quickFrom < a.end - 8 * RATE;
    const lo = now ? a.pos + CUT : quick ? quickFrom : Math.max(a.pos + CUT, a.inFrame + 0.55 * (a.end - a.inFrame));
    const ratio = a.bpm > 0 && b.bpm > 0 ? Math.max(a.bpm / b.bpm, b.bpm / a.bpm) : 1;
    const calm = a.outroBeats >= 16 && b.introBeats >= 16; // both ends quiet: a long crossfade suits
    const opts = [['echo', 0.2], ['filter', a.matched ? 0.3 : 0.55], ['brake', ratio > 1.12 ? 0.35 : 0.7], ['roll', a.matched ? 0.4 : 9], ['fade', calm ? 0.15 : 0.6]];
    let best = null, bestCost = Infinity;
    const first = a.matched ? nextBar(a, lo) : lo;
    const last = quick ? Math.min(a.end - 2 * RATE, lo + 60 * RATE) : a.end - 2 * RATE;
    for (let f = first; f < last; f += step) {
      for (const [style, base] of opts) {
        let pl;
        if (style === 'fade') { const len = Math.min(cfg.quick ? 8 * RATE : 12 * RATE, Math.max(3 * RATE, (a.end - f) * 0.8)); pl = { start: Math.round(f), len, beat: false, beats: 0, style: 'fade', bStart: 0 }; }
        else pl = fxPlan(style, f, a);
        if (pl.start + pl.len > a.end + RATE) continue;
        const out = pl.start + pl.len * (pl.bStart || 0.5);
        const where = now ? (f - first) / RATE * 0.05 : quick ? 0.15 * (f - first) / Math.max(1, last - first) : 0.15 * (1 - (f - first) / Math.max(1, a.end - first));
        const c = base + 1.5 * vocalAt(a, out, out + 2 * pb * 4) + 0.4 * vocalAt(b, b.inFrame, b.inFrame + 4 * pb) + where + (style === lastStyle ? 0.15 : 0);
        if (c < bestCost) { bestCost = c; best = pl; }
      }
      if (now && f > first + 8 * step) break;
    }
    if (!best) best = { start: Math.max(a.pos, a.end - 4 * RATE), len: 3 * RATE, beat: false, beats: 0, style: 'fade', bStart: 0 };
    best.why = { echo: 'echo out - tempos too far apart to blend', filter: 'filter sweep - tempos too far apart', brake: 'brake stop - very different tempos', roll: 'loop roll into the next', fade: 'smooth crossfade' }[best.style];
    best.cost = Math.round(bestCost * 100) / 100;
    return best;
  }

  // When and how A mixes into B. want: 'auto' or a number of beats (the
  // blend length); now: soon (skip). Styles (cfg.style):
  //   blend - a long EQ blend over the intro/outro (up to 128 beats)
  //   short - both play for 8 beats (a few seconds), beat-matched
  //   cut   - A stops at the end of a bar and B's downbeat lands where A's
  //           next would have: the beat flows straight across
  //   auto  - whichever of these fits best
  // Every bar in the window is a candidate, scored by how much singing the
  // change would talk over or cut off (most of all), how close it is to a
  // musical phrase (16 beats), and where in the song it falls.
  function planMix(a, b, want, now = false) {
    const tracked = (!a.steady || !b.steady) && a.beatF && b.beatF && a.matched && b.matched;
    if ((!a.steady || !b.steady) && !tracked) return withTaste(planRadio(a, b, now));
    if (!(a.matched && b.matched)) return planFx(a, b, now);
    const p = a.period, style = cfg.style || 'auto', ents = entries(b);
    const blendPlan = (start, L) => { const half = Math.max(1, Math.round(L / 8)) * 4; return { start: Math.round(start), len: L * p, beat: true, beats: L, swapU: Math.min(0.85, half / L), style: L <= 8 ? 'short' : 'blend' }; };
    const cutPlan = (at) => ({ start: Math.round(at) - CUT / 2, len: CUT, beat: true, beats: 0, style: 'cut', at: Math.round(at) });
    // Candidate bars and the window to choose in.
    const first = nextBar(a, Math.max(a.pos + CUT, a.inFrame + 16 * p));
    let lo, hi, early = false;
    if (now) { lo = nextBar(a, a.pos + CUT); hi = lo + 8 * a.bar; }
    else if (cfg.quick) { lo = Math.max(first, a.inFrame + Math.max(55 * RATE, Math.max(16, a.introBeats || 0) * p)); hi = lo + 60 * RATE; early = true; }
    else { lo = Math.max(first, a.inFrame + 0.3 * (a.end - a.inFrame)); hi = a.end; } // from 30% in: a long blend needs room
    if (lo >= a.end - 2 * p) { lo = first; hi = a.end; }
    const bars = [];
    for (let f = nextBar(a, lo - 1); f < Math.min(hi, a.end - 2 * p); f += a.bar) bars.push(f);
    if (!bars.length) bars.push(nextBar(a, a.pos + CUT));
    const span = Math.max(1, bars[bars.length - 1] - bars[0]);
    const place = (f) => {
      const beatsIn = Math.round((f - a.inFrame) / p);
      const phrase = (beatsIn % 16 === 0 ? 0 : beatsIn % 8 === 0 ? 0.08 : 0.18) - (sectionAt(a, f) ? 0.12 : 0); // a real section change is the best place of all
      const where = now ? (f - bars[0]) / span * 0.3 : 0.12 * (early ? (f - bars[0]) / span : 1 - (f - bars[0]) / span);
      return phrase + where;
    };
    const fits = (f, L) => f + L * p <= a.end + p;
    // Auto: any length - how long a blend can run is decided by how well the
    // two songs sit together over it (below), not just by quiet intros/outros.
    let lengths = want === 'auto' ? LENGTHS.slice() : [Number(want) || 32];
    if (tracked) lengths = lengths.filter((L) => L <= 64).concat(lengths.some((L) => L <= 64) ? [] : [32]); // live drums: 15-30 s blends, beat by beat
    if (cfg.quick || now) lengths = lengths.map((L) => Math.min(L, now ? 8 : 32));
    // Per track pair: what makes blending worse and an instant cut better.
    // Keys that clash sound sour layered (a cut avoids it); a track with no
    // intro (straight in with full beat or voice) has nothing to blend over;
    // a track with no outro has nothing quiet to blend out of.
    const kd = analyser.keyDistance && a.keyNow && b.keyNow ? analyser.keyDistance(a.keyNow, b.keyNow) : 0;
    const blendExtra = 0.22 * Math.max(0, kd - 1) + (b.introBeats < 8 ? 0.3 : 0) + (a.outroBeats < 8 ? 0.12 : 0);
    let best = null, bestCost = Infinity;
    const offerAll = (cost, plan) => { cost -= 0.2 * taste(plan.style); if (plan.style === lastStyle) cost += 0.08; if (cost < bestCost) { bestCost = cost; best = plan; } }; // a little variety
    for (const E of ents) {
    const bIn = E.f;
    // Every exit from this song is paired with every way into the next.
    const offer = (cost, plan) => { plan.bIn = bIn; plan.entry = E.kind; offerAll(cost + E.cost, plan); };
    for (const f of bars) {
      const pl = place(f);
      const eA = (f0, f1) => energyAt(a, f0, f1), eB = (f0, f1) => energyAt(b, f0, f1);
      if ((style === 'auto' || style === 'blend') && !now) {
        for (const L of lengths) {
          if (L < 16 || !fits(f, L)) continue;
          // A blend: A's voice may carry on while B comes in quietly underneath
          // (B's bass and mids held back) - it must not still be singing after
          // the swap, when B takes over; and B's intro must not sing over A.
          const sw = Math.max(1, Math.round(L / 8)) * 4 * p;
          if (L >= 96) {
            // A long blend, both songs heard: bar by bar, how much their singing
            // clashes (both singing at once), their energies apart, and A must be
            // done singing as it leaves. Longer is better when they sit well.
            const bars = Math.round(L / 4); let clash = 0, eDiff = 0;
            for (let k = 0; k < bars; k++) { const fa = f + k * a.bar, fb = bIn + k * b.bar; clash += Math.min(vocalAt(a, fa, fa + a.bar), vocalAt(b, fb, fb + b.bar)); eDiff += Math.abs(eA(fa, fa + a.bar) - eB(fb, fb + b.bar)); }
            clash /= bars; eDiff /= bars;
            const cl = 2.4 * clash + 0.5 * eDiff + 1.2 * vocalAt(a, f + L * p - 2 * a.bar, f + L * p) + pl - 0.13 * Math.log2(L / 16) + blendExtra + (E.kind === 'intro' ? 0 : 0.1);
            offer(style === 'blend' ? pl - 0.13 * Math.log2(L / 16) + 0.6 * clash : cl, blendPlan(f, L));
            continue;
          }
          const c = 2.2 * vocalAt(a, f + sw, f + L * p) + 0.25 * vocalAt(a, f, f + sw) + 0.9 * vocalAt(b, bIn, bIn + sw * b.period / p) + 0.3 * vocalAt(b, bIn + sw * b.period / p, bIn + L * b.period) + pl - 0.1 * Math.log2(L / 16) + blendExtra
            + 0.5 * Math.abs(eA(f, f + L * p) - eB(bIn, bIn + L * b.period)) + (E.kind === 'intro' ? 0 : 0.15); // the two at a similar energy; a blend suits an intro
          offer(style === 'blend' ? pl - 0.1 * Math.log2(L / 16) + 0.3 * vocalAt(a, f, f + L * p) : c, blendPlan(f, L));
        }
      }
      if ((style === 'auto' || style === 'short' || (now && style !== 'cut')) && fits(f, 8)) {
        offer(2.5 * vocalAt(a, f, f + 8 * p) + 0.5 * vocalAt(b, bIn, bIn + 8 * b.period) + 0.5 * blendExtra + pl + (style === 'auto' ? 0.25 : 0) + 0.4 * Math.abs(eA(f, f + 8 * p) - eB(bIn, bIn + 8 * b.period)), blendPlan(f, 8)); // short: a little more noticeable than a blend
      }
      if (style === 'auto' && !now && kd <= 1 && fits(f, 16)) {
        // A mashup moment: this song's vocal line carried over the next one's
        // beat for a few bars (its drums and bass filtered out), then gone.
        const vA = vocalAt(a, f, f + 8 * p), vB = vocalAt(b, bIn, bIn + 16 * b.period);
        if (vA > 0.5 && vB < 0.2) offer(0.75 + 1.2 * (1 - vA) + 1.5 * vB + pl + 0.4 * Math.abs(eA(f, f + 16 * p) - eB(bIn, bIn + 16 * b.period)) + (Math.random() < 0.5 ? 0.3 : 0), { start: Math.round(f), len: 16 * p, beat: true, beats: 16, swapU: 0.1, style: 'mashup' });
      }
      if (style === 'auto' && !now) {
        // Now and then an effect instead (echo out, filter sweep, loop roll).
        for (const fx of ['echo', 'filter', 'roll']) {
          const pl2 = fxPlan(fx, f, a); if (pl2.start + pl2.len > a.end + p) continue;
          const out = pl2.start + pl2.len * pl2.bStart;
          offer(1.9 * vocalAt(a, out, out + a.bar) + 0.4 * vocalAt(b, bIn, bIn + a.bar) + pl + 0.85 + (fx === 'roll' ? 0.05 : 0) - (E.kind === 'drop' ? 0.15 : 0), pl2); // an effect into a drop: the classic
        }
      }
      if (style === 'auto' || style === 'cut') {
        // A cut drops what A would have sung next; best just after a line ends.
        const after = vocalAt(a, f, f + 2 * a.bar), before = vocalAt(a, f - a.bar, f);
        const lineEnds = before > 0.4 && after < 0.15 ? 0.15 : 0; // a vocal line has just finished: the classic place to drop the next track in
        offer(1.6 * after + 0.3 * before * after + 0.4 * vocalAt(b, bIn, bIn + a.bar) - lineEnds + pl + (style === 'auto' ? 0.6 : 0) - (E.kind === 'drop' || E.kind === 'full' ? 0.12 : 0) + 0.3 * Math.max(0, eA(f - a.bar, f) - eB(bIn, bIn + a.bar))
          - (E.kind === 'drop' && eA(f, f + a.bar) >= 0.75 && eA(f - a.bar, f) <= 0.45 ? 0.35 : 0), Object.assign(cutPlan(f), E.kind === 'drop' && eA(f, f + a.bar) >= 0.75 && eA(f - a.bar, f) <= 0.45 ? { dropOnDrop: true } : {})); // drop on drop: the next song's drop lands where this one's would have // a cut lands best on the next song's energy, never on a cliff down // a cut is the most noticeable: only when nothing smoother fits
      }
    }
    }
    if (!best) { best = style === 'cut' ? cutPlan(bars[0]) : blendPlan(bars[0], 8); best.bIn = Math.round(b.inFrame); best.entry = 'intro'; }
    if (tracked && best.beat) best.tracked = true;
    best.cost = Math.round(bestCost * 100) / 100;
    if (FX.has(best.style)) { best.why = { echo: 'echo out', filter: 'filter sweep', roll: 'loop roll', brake: 'brake stop' }[best.style] + (ENTRY_WHY[best.entry] || ''); return best; }
    if (tracked && best.style === 'blend') { best.why = 'beat by beat with the drummer'; return best; }
    best.why = (best.style === 'mashup' ? 'its vocal over the next beat' : best.dropOnDrop ? 'drop on drop' : best.style === 'cut' ? (kd >= 3 ? 'keys clash' : b.introBeats < 8 ? 'no intro to blend over' : 'cut where the singing stops') : best.style === 'short' ? 'quick blend between vocals' : 'long blend under the vocals') + (ENTRY_WHY[best.entry] || '');
    return best;
  }

  // Beat alignment from the audio itself: the onset curve (rises in the bass,
  // 64-frame steps) of deck d from frame f, n steps long.
  const HOP = 64;
  function onsets(d, f, n) {
    const out = new Float32Array(n);
    let lp = 0, prev = 0;
    const a = 1 - Math.exp(-2 * Math.PI * 150 / RATE);
    for (let i = -16; i < n; i++) {
      let e = 0;
      for (let j = 0; j < HOP; j++) {
        const x = f + i * HOP + j, v = x >= 0 && x < d.frames ? (d.pcm[x * 2] + d.pcm[x * 2 + 1]) / 65536 : 0;
        lp += (v - lp) * a; e += lp * lp;
      }
      e = Math.sqrt(e / HOP);
      if (i >= 0) out[i] = Math.max(0, e - prev);
      prev = e;
    }
    return out;
  }
  // How many frames B is behind A (positive: move B on), by lining up their
  // onsets over a window from aF/bF; up to maxLag frames either way. 0 if unsure.
  function lagBetween(aF, bF, win, maxLag, da = A, db = B) {
    const n = Math.ceil(win / HOP), m = Math.ceil(maxLag / HOP);
    const ea = onsets(da, aF, n), eb = onsets(db, bF - m * HOP, n + 2 * m);
    let best = -1, bestL = 0, sum = 0, cnt = 0;
    for (let l = -m; l <= m; l++) {
      let s = 0; for (let i = 0; i < n; i++) s += ea[i] * eb[i + l + m];
      sum += s; cnt++; if (s > best) { best = s; bestL = l; }
    }
    return best > (sum / cnt) * 1.5 && best > 1e-6 ? bestL * HOP : 0;
  }

  async function prepare(track, ref) {
    const step = (t) => { if (st.next && st.next.title === track.title) st.next.step = t; };
    step(track.kind === 'yt' ? 'getting it from YouTube' : 'opening');
    let input = await sources.inputFor(track);
    step('analysing the beat, key and vocals');
    let info = known[track.id];
    if (info && (info.vocalLevel === undefined || info.energyBars === undefined || info.steady === undefined || info.sectionBars === undefined || info.beatTimes === undefined)) info = null; // analysed by an older version: no singing map
    if (!info) {
      let x;
      try { x = await decode.decodeAnalysis(input); } catch (err) {
        // A downloaded file ffmpeg can't read: drop it and stream the song instead.
        if (track.kind !== 'yt' || !sources.dropCached || !/Invalid data|moov atom|End of file/i.test(err.message)) throw err;
        log('[dj] bad download of ' + track.title + ' - streaming it instead');
        sources.dropCached(track.id);
        input = { url: await sources.youtubeAudio(track.id), opts: ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'] };
        x = await decode.decodeAnalysis(input);
      }
      info = analyser.analyse(x);
      if (track.kind === 'mp3') { known[track.id] = info; try { if (sources.saveAnalysis) sources.saveAnalysis(track, info); } catch (e) { /* cache only */ } }
    }
    info = { ...info, gridPeriod: info.period };
    const target = ref && ref.matched ? ref.bpm : 0;
    let tempo = 1, matched = false;
    // A live drummer's song (its beat drifts) isn't stretched or beat-matched:
    // rock and pop get radio-style changes instead.
    // Live songs can still be beat-matched when every beat of both is known.
    const tracked = (info.steady === false || (ref && ref.steady === false)) && Array.isArray(info.beatTimes) && (!ref || ref.beatF);
    const steadyPair = (info.steady !== false && (!ref || ref.steady !== false)) || tracked;
    if (!steadyPair) { /* leave tempo alone */ } else if (info.bpm > 0 && info.confidence > 0.25 && target > 0) {
      const opts = [target / info.bpm, target / (info.bpm * 2), target / (info.bpm / 2)];
      const r = opts.reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a));
      if (Math.abs(r - 1) <= MAX_STRETCH) { tempo = r; matched = true; }
    } else if (info.bpm > 0 && info.confidence > 0.25 && !ref) matched = true;
    // Half/double-time matches play the beat grid at the matched rate.
    if (matched && target && Math.abs(info.bpm * tempo - target) > 1) {
      const ratio = (info.bpm * tempo) / target, f = ratio > 1.5 ? 2 : ratio < 0.67 ? 0.5 : 1;
      info.period *= f; info.bpm /= f;
    }
    const semis = matched && ref && analyser.bestShift ? analyser.bestShift(ref.keyNow, info.key) : 0;
    step('matching tempo' + (semis ? ' and key' : ''));
    const pcm = await decode.decodePlay(input, tempo, undefined, semis);
    const d = deckFrom(track, info, pcm, tempo, matched, semis);
    d.keyNow = shiftKey(info.key, semis);
    return d;
  }
  function shiftKey(key, s) {
    if (!key || !s || !analyser.CAMELOT_MAJ) return key;
    const pc = (key.pc + s + 12) % 12;
    return { ...key, pc, camelot: (key.minor ? analyser.CAMELOT_MIN : analyser.CAMELOT_MAJ)[pc] };
  }

  // The next track: the one picked, else the best fit by tempo and key among the next few.
  // Endless (YouTube): as the list runs out, add YouTube Music's radio of
  // the song playing - similar songs - to the end of it.
  function extendIfLow() {
    if (cfg.endless === false || extending || !list.length) return;
    const left = list.filter((t) => !played.has(t.id)).length;
    if (left > 3) return;
    const seed = A && A.track.kind === 'yt' ? A.track : [...list].reverse().find((t) => t.kind === 'yt');
    if (!seed || !sources.youtubeRadio) return;
    const g = gen;
    extending = sources.youtubeRadio(seed.id).then((more) => {
      if (g !== gen) return;
      const have = new Set(list.map((t) => t.id)), add = more.filter((t) => !have.has(t.id));
      if (!add.length) return;
      list.push(...add);
      syncQueue();
      log(`[dj] endless: added ${add.length} songs like ${seed.title}`);
    }).catch((err) => log('[dj] endless: ' + err.message)).finally(() => { extending = null; });
  }

  // The planned change from the song playing into a candidate (from its
  // analysis alone: tempo-matched as it would be), as a cost; null if unsure.
  function planCostFor(track, inf) {
    try {
      if (!(inf.bpm > 0) || inf.confidence <= 0.25 || inf.steady === false || !A.steady) return null;
      const r = [A.bpm / inf.bpm, A.bpm / (inf.bpm * 2), A.bpm / (inf.bpm / 2)].reduce((x, y) => (Math.abs(y - 1) < Math.abs(x - 1) ? y : x));
      if (Math.abs(r - 1) > MAX_STRETCH) return null;
      const frames = Math.round((inf.duration || 240) * RATE / r);
      const stub = deckFrom(track, { ...inf, gridPeriod: inf.period }, { length: frames * 2 }, r, true, 0);
      stub.keyNow = inf.key;
      const pl = planMix(A, stub, cfg.mixBeats, false);
      return Number.isFinite(pl.cost) ? pl.cost : null;
    } catch (e) { return null; }
  }
  const avgEnergy = (inf) => { const en = inf && inf.energyBars; if (!en) return 0.5; let s = 0; for (const c of en) s += Number(c); return s / (9 * en.length); };
  function chooseNext() {
    extendIfLow();
    if (wantNext !== null) { const i = wantNext; wantNext = null; idx = i + 1; return i; }
    const cands = [];
    for (let j = 0; j < list.length && cands.length < 8; j++) {
      const ti = (idx + j) % list.length, t = list[ti];
      if (list.length > 1 && A && t.id === A.track.id) continue;
      if (list.length > 3 && recent.includes(t.id)) continue;
      cands.push(ti);
    }
    if (!cands.length) { const ti = idx % list.length; idx++; return ti; }
    let best = cands[0], bs = Infinity;
    cands.forEach((ti, n) => {
      const inf = known[list[ti].id];
      let s = n * 0.15 + 1.5;
      if (inf && A && A.matched) {
        const r = Math.min(...[1, 2, 0.5].map((m) => Math.abs(A.bpm / (inf.bpm * m) - 1)));
        s = n * 0.15 + (r <= MAX_STRETCH ? r * 10 : 3) + (analyser.keyDistance ? analyser.keyDistance(A.keyNow, inf.key) * 0.4 : 0);
      }
      if (inf && A && A.matched) {
        // How good would the change into it actually be? Plan it from here.
        const pc = planCostFor(list[ti], inf); if (pc !== null) s += 0.8 * Math.min(3, pc);
      }
      if (inf && A) {
        // The energy arc: build for the first 20 minutes, hold at the peak to
        // an hour, then ease up and down a little; close to where it is now.
        const mins = (Date.now() - startedAt) / 60000, delta = mins < 20 ? 0.08 : mins < 60 ? 0 : (Math.floor(mins / 15) % 2 ? -0.06 : 0.06);
        s += 0.6 * Math.abs(avgEnergy(inf) - Math.min(1, Math.max(0, avgEnergy(A.info) + delta)));
        if ((inf.steady !== false) !== A.steady) s += 0.25; // rock with rock, dance with dance
      }
      if (s < bs) { bs = s; best = ti; }
    });
    if (best === cands[0]) idx = best + 1;
    return best;
  }

  // Analyse a few songs ahead in the background, so the order can be planned
  // on tempo, key and energy rather than taking whatever comes next.
  async function analysePool() {
    if (poolBusy || !list.length) return;
    poolBusy = true; const g = gen;
    try {
      let done = 0;
      for (let j = 0; j < Math.min(list.length, 8) && done < 3; j++) {
        const t = list[(idx + j) % list.length];
        if (!t || known[t.id] || (A && t.id === A.track.id) || (B && t.id === B.track.id)) continue;
        try {
          const info = analyser.analyse(await decode.decodeAnalysis(await sources.inputFor(t)));
          if (g !== gen) return;
          known[t.id] = info; done++;
          if (t.kind === 'mp3' && sources.saveAnalysis) { try { sources.saveAnalysis(t, info); } catch (e) { /* cache only */ } }
        } catch (e) { /* skip that one */ }
      }
    } finally { poolBusy = false; }
  }
  // After a beat-matched mix the new song is still sped up or slowed down to
  // the old one's tempo: ease it back to its own, in steps of at most ~3%,
  // each on a phrase, before the next song is lined up.
  async function easeTempo(d) {
    const g = gen;
    try {
      let tempo = d.tempo;
      while (Math.abs(tempo - 1) > 0.015 && A === d && g === gen) {
        const nextT = Math.abs(tempo - 1) <= 0.015 ? 1 : tempo + Math.sign(1 - tempo) * 0.015; // small steps: barely noticeable
        const pcm = await decode.decodePlay(await sources.inputFor(d.track), nextT, undefined, d.semis);
        if (A !== d || g !== gen || mix) break;
        const nd = deckFrom(d.track, d.info, pcm, nextT, d.matched, d.semis);
        nd.keyNow = d.keyNow; nd.qi = d.qi; nd.readyAt = d.readyAt; nd.gain = d.gain;
        d.swap = { to: nd, at: nextBar(d, d.pos + 4 * d.bar) };
        while (d.swap && A === d && g === gen) await new Promise((r) => setTimer === setInterval ? setTimeout(r, 200) : setImmediate(r));
        if (A === d) break; // swapped: A is now nd; carry on from it
        d = A; tempo = d.tempo;
      }
    } catch (e) { log('[dj] tempo ease: ' + e.message); }
    if (g === gen) prepareNext();
  }

  async function prepareNext() {
    if (preparing || B) return;
    const g = gen, tok = ++prepToken;
    preparing = (async () => {
      for (let tries = 0; tries < Math.min(5, list.length); tries++) {
        const ti = chooseNext(), track = list[ti];
        try {
          st.next = { title: track.title, status: 'loading', step: 'starting' }; st.nextIdx = ti;
          const d = await prepare(track, A);
          if (g !== gen || tok !== prepToken) return; // stopped, or another track was picked meanwhile
          d.qi = ti;
          if (A && !A.matched) d.matched = false;
          B = d; d.readyAt = Date.now(); if (A) { A.plan = null; A.tease = planTease(A, d); }
          analysePool();
          const beat = d.matched && A && A.matched;
          st.next = { title: track.title, bpm: Math.round(d.bpm), bpmFrom: Math.round(d.info.bpm), tempoPct: Math.round((d.tempo - 1) * 1000) / 10, key: d.keyNow ? d.keyNow.camelot : '', shift: d.semis, mode: beat ? 'beat-matched' : 'crossfade' };
          // Fetch the one after next meanwhile, so it's ready in time.
          if (sources.prefetch && list.length > 1) { const after = list[idx % list.length]; if (after && after.id !== track.id) sources.prefetch(after); }
          log(`[dj] next: ${track.title} (${Math.round(d.info.bpm)} BPM${d.tempo !== 1 ? ` -> ${Math.round(d.bpm)}` : ''}${d.semis ? `, ${d.semis > 0 ? '+' : ''}${d.semis} st` : ''}, ${st.next.mode})`);
          return;
        } catch (e) { log('[dj] skipped ' + track.title + ': ' + e.message); st.error = `Couldn't play ${track.title}: ${e.message}`; }
      }
      st.next = null; st.nextIdx = -1;
    })().finally(() => { if (tok === prepToken) preparing = null; });
  }

  function startMix() {
    const p = A.plan;
    mix = { from: A.pos, len: Math.max(1, p.len), beat: p.beat, swapU: p.swapU || 0.5, beats: p.beats, style: p.style, adj: 0, check: 0, ref: rmsSlow, bStart: p.bStart || 0, period: p.period || RATE / 2, vpos: A.pos, bOn: !FX.has(p.style) };
    lastStyle = p.style; lastMixAt = Date.now();
    // Keys that don't sit well together: both songs' mids are eased back while they overlap.
    mix.clash = !!(analyser.keyDistance && A.keyNow && B.keyNow && analyser.keyDistance(A.keyNow, B.keyNow) >= 2);
    // A cut, a brake or a segue: the note it cuts off rings on as a short reverb tail.
    if (p.style === 'cut' || p.style === 'brake' || p.style === 'segue') tail.plan = { deck: A, from: p.style === 'cut' ? p.at : A.pos + Math.round(p.len * (p.style === 'brake' ? 0.8 : 0.5)) };
    if (p.style === 'echo') { echo.d = Math.round(mix.period * 0.75); echo.fb = 0.55; echo.until = A.pos + mix.len + 5 * RATE; }
    const bIn = p.bIn !== undefined ? p.bIn : Math.round(B.inFrame); mix.bIn = bIn;
    B.pos = bIn;
    if (p.beat) {
      // Line B's beats up with A's from the audio itself (the grids can be a few ms out).
      const aF = p.style === 'cut' ? p.at : A.pos, lag = lagBetween(aF, bIn, 8 * A.period, A.period / 4);
      B.pos = Math.round(bIn + lag - (aF - A.pos));
      mix.check = A.pos + Math.round(A.bar);
    }
    // Live drums: B is read beat by beat against A's beats for the whole blend.
    if (p.tracked && A.beatF && B.beatF) {
      const near = (arr, f) => { let i = 0; while (i + 1 < arr.length && arr[i + 1] <= f) i++; return (f - arr[i] > (arr[Math.min(arr.length - 1, i + 1)] - arr[i]) / 2) ? Math.min(arr.length - 1, i + 1) : i; };
      mix.tracked = { ia0: near(A.beatF, A.pos), ib0: near(B.beatF, bIn), ia: 0 }; mix.tracked.ia = mix.tracked.ia0;
    }
    st.mixing = true;
    if (st.next) { st.next.beats = p.beats; st.next.style = p.style; st.next.why = p.why || ''; }
    log(`[dj] ${p.style === 'cut' ? 'cutting' : 'mixing'} into ${B.track.title}${p.why ? ' (' + p.why + ')' : ''}${p.beats ? ` over ${p.beats} beats` : p.style === 'fade' ? ` over ${Math.round(p.len / RATE)} s` : ' on the beat'}`);
  }
  function promote() {
    if (B) played.add(B.track.id);
    if (A) { recent.push(A.track.id); while (recent.length > Math.max(1, Math.floor(list.length / 2))) recent.shift(); }
    A = B; B = null; mix = null; st.mixing = false;
    if (A.pos === 0) A.pos = Math.round(A.inFrame);
    A.plan = null; A.force = 0; A.loops = 0; A.tease = null; st.tease = null;
    A.loopAt = A.matched && A.bar > 0 ? Math.round(A.firstDown + Math.floor((A.end - A.firstDown) / A.bar) * A.bar) : 0;
    if (A.loopAt - 4 * A.bar < A.pos) A.loopAt = 0;
    st.state = 'playing'; st.nowIdx = A.qi === undefined ? -1 : A.qi; st.nextIdx = -1;
    nowStatus();
    if (A.matched && Math.abs(A.tempo - 1) > 0.015 && A.frames / RATE > 120) easeTempo(A); else prepareNext();
  }
  function nowStatus() {
    if (!A) return;
    st.now = { id: A.track.kind === 'yt' ? A.track.id : '', title: A.track.title, bpm: Math.round(A.bpm), key: A.keyNow ? A.keyNow.camelot : '', shift: A.semis || 0, dur: Math.round(A.frames / RATE * 10) / 10, pos: Math.round(A.pos / RATE * 10) / 10, at: Date.now() };
  }

  // Three bands per deck and channel: bass (< ~180 Hz, 2-pole), highs (> ~2.5 kHz), mids between.
  const LPL = 1 - Math.exp(-2 * Math.PI * 180 / RATE), LPH = 1 - Math.exp(-2 * Math.PI * 2500 / RATE);
  function sampleDeck(d, gain, lo, mi, hi, out) { sampleAt(d, d.pos, gain, lo, mi, hi, out); }
  // At a fractional frame (the brake slows the old song down), interpolated.
  function sampleAt(d, fp, gain, lo, mi, hi, out) {
    const f = Math.floor(fp), t = fp - f, s = d.lp;
    let l = 0, r = 0;
    if (f >= 0 && f + 1 < d.frames) {
      l = (d.pcm[f * 2] * (1 - t) + d.pcm[f * 2 + 2] * t) / 32768; r = (d.pcm[f * 2 + 1] * (1 - t) + d.pcm[f * 2 + 3] * t) / 32768;
    } else if (f >= 0 && f < d.frames) { l = d.pcm[f * 2] / 32768; r = d.pcm[f * 2 + 1] / 32768; }
    s[0] += (l - s[0]) * LPL; s[1] += (s[0] - s[1]) * LPL; s[4] += (l - s[4]) * LPH;
    s[2] += (r - s[2]) * LPL; s[3] += (s[2] - s[3]) * LPL; s[5] += (r - s[5]) * LPH;
    const g = gain * d.gain;
    out[0] += (s[1] * lo + (s[4] - s[1]) * mi + (l - s[4]) * hi) * g;
    out[1] += (s[3] * lo + (s[5] - s[3]) * mi + (r - s[5]) * hi) * g;
  }

  // Level riding: a mix holds the loudness the listener was hearing just
  // before it began (outros and intros are often quieter), easing back
  // afterwards, so the music never dips or swells at a change.
  // The echo-out's delay line (it rings on after the new song has started).
  const ECHO_N = RATE * 2, echo = { L: new Float32Array(ECHO_N), R: new Float32Array(ECHO_N), i: 0, d: 0, fb: 0.55, until: 0, send: 0 };
  const TMP = [0, 0];
  // A small Schroeder reverb (four combs, two all-passes) for those tails.
  const COMBS = [1557, 1617, 1491, 1422].map((n) => ({ b: new Float32Array(n), i: 0, lp: 0 })), APS = [225, 556].map((n) => ({ b: new Float32Array(n), i: 0 }));
  const tail = { plan: null, deck: null, pos: 0, left: 0, ring: 0 };
  function reverb(x) {
    let y = 0;
    for (const c of COMBS) { const o = c.b[c.i]; c.lp = o * 0.7 + c.lp * 0.3; c.b[c.i] = x + c.lp * 0.8; c.i = (c.i + 1) % c.b.length; y += o; }
    y *= 0.25;
    for (const a2 of APS) { const o = a2.b[a2.i], v = y + o * 0.5; a2.b[a2.i] = v; a2.i = (a2.i + 1) % a2.b.length; y = o - v * 0.5; }
    return y;
  }
  let rmsSlow = 0, rmsFast = 0, rmsLong = 0, mixGain = 1;
  const A_SLOW = 1 / (3 * RATE), A_FAST = 1 / (0.5 * RATE), A_GAIN = 1 / (1.2 * RATE), A_LONG = 1 / (30 * RATE), A_GAIN_SLOW = 1 / (4 * RATE);
  const OUT = [0, 0];
  function render(frames) {
    const buf = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames; i++) {
      OUT[0] = 0; OUT[1] = 0;
      if (!A && B) promote();
      if (A) {
        if (B && !mix) {
          if (!A.plan || A.plan.start < A.pos - 1) { A.plan = planMix(A, B, A.force || cfg.mixBeats, !!A.force); if (st.next) { st.next.style = A.plan.style; st.next.beats = A.plan.beats; st.next.why = A.plan.why || ''; } }
          if (A.pos >= A.plan.start) startMix();
          else if (A.pos >= A.frames) { A.plan = planMix({ ...A, matched: false }, B, 4, true); A.plan.len = 2 * RATE; startMix(); }
        }
        if (mix) {
          const u = (A.pos - mix.from) / mix.len;
          // Keep the beats locked: re-check each bar and nudge B a frame at a time.
          if (mix.beat && mix.style !== 'cut' && !mix.tracked && A.pos >= mix.check) {
            mix.check = A.pos + Math.round(A.bar);
            const lag = lagBetween(A.pos, B.pos, A.bar, 1500);
            if (Math.abs(lag) >= HOP) mix.adj = Math.max(-1500, Math.min(1500, lag));
          }
          if (mix.adj && (A.pos & 31) === 0) { const s1 = Math.sign(mix.adj); B.pos += s1; mix.adj -= s1; }
          if (FX.has(mix.style)) {
            // The old song goes out on an effect, then the new one drops in.
            const bS = mix.bStart, q = clamp01(u / bS), el = A.pos - mix.from;
            let gA = 1, lo = 1, mi = 1, hi = 1, at = A.pos;
            if (mix.style === 'echo') { gA = 1 - smooth(q / 0.9); echo.send = u < bS ? 1 : 0; }
            else if (mix.style === 'filter') { lo = 1 - smooth(q / 0.6); mi = 1 - smooth((q - 0.25) / 0.75); hi = 1 + 0.5 * q; gA = u < bS ? 1 + 0.2 * q : 1 - smooth((u - bS) / 0.05); }
            else if (mix.style === 'brake') { const rate = Math.pow(Math.max(0, 1 - q), 1.6); mix.vpos += rate; at = mix.vpos; gA = 1 - smooth((q - 0.75) / 0.25); }
            else if (mix.style === 'roll') { const seg = el < mix.len * 0.4 ? mix.period : el < mix.len * 0.7 ? mix.period / 2 : el < mix.len * 0.88 ? mix.period / 4 : mix.period / 8; at = mix.from + (el % Math.max(64, Math.round(seg))); hi = 1 + 0.3 * q; }
            TMP[0] = 0; TMP[1] = 0;
            if (gA > 0.001) sampleAt(A, at, gA, lo, mi, hi, TMP);
            OUT[0] += TMP[0]; OUT[1] += TMP[1];
            if (mix.style === 'echo' && echo.send) { echo.inL = TMP[0]; echo.inR = TMP[1]; }
            if (u >= bS) {
              if (!mix.bOn) { mix.bOn = true; B.pos = mix.bIn; }
              sampleDeck(B, mix.style === 'echo' ? smooth((u - bS) / 0.12) : smooth((u - bS) / 0.02), 1, 1, 1, OUT); B.pos++;
            }
            if ((A.pos & 1023) === 0) { const qq = st.eq; qq[0] = lo * gA; qq[1] = mi * gA; qq[2] = Math.min(1, hi) * gA; const bv = mix.bOn ? 1 : 0; qq[3] = qq[4] = qq[5] = bv; }
            A.pos++;
            if (u >= 1) { st.played++; st.doneAt = Date.now(); if (!mix.bOn) B.pos = mix.bIn; promote(); }
          } else {
          if (mix.style === 'cut') { // A stops, B's downbeat takes over
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1, 1, 1, OUT); sampleDeck(B, Math.sin(c * Math.PI / 2), 1, 1, 1, OUT);
          } else if (mix.style === 'mashup') {
            // B's full mix comes in over a beat; A keeps only its voice band, then goes.
            const bIn2 = smooth(u / 0.08), aMi = 1 - smooth((u - 0.7) / 0.3);
            sampleDeck(A, 1, 0, aMi, 0.25 * aMi, OUT); sampleDeck(B, 1, bIn2, bIn2, bIn2, OUT);
            if ((A.pos & 1023) === 0) { const q = st.eq; q[0] = 0; q[1] = aMi; q[2] = 0.25 * aMi; q[3] = q[4] = q[5] = bIn2; }
          } else if (mix.beat) {
            const s = mix.swapU;
            const bHi = smooth(u / (s * 0.7)), bMi = smooth((u - s * 0.25) / (s * 0.7)), bLo = smooth((u - s) / 0.03);
            const aLo = 1 - bLo, aMi = 1 - smooth((u - s) / ((1 - s) * 0.8)), aHi = 1 - smooth((u - s - (1 - s) * 0.2) / ((1 - s) * 0.8));
            const aVol = 1 - smooth((u - 0.85) / 0.15);
            const cl = mix.clash ? 1 - 0.35 * Math.min(aMi, bMi) : 1; // clashing keys: less of both where they overlap
            sampleDeck(A, aVol, aLo, aMi * cl, aHi, OUT);
            const tk = mix.tracked;
            if (tk) {
              // Where B should be: the same fraction through the matching beat as A is.
              const af = A.beatF, bf = B.beatF;
              while (tk.ia + 1 < af.length && af[tk.ia + 1] <= A.pos) tk.ia++;
              const ib = tk.ib0 + (tk.ia - tk.ia0);
              if (tk.ia + 1 < af.length && ib >= 0 && ib + 1 < bf.length) {
                const fr = (A.pos - af[tk.ia]) / Math.max(1, af[tk.ia + 1] - af[tk.ia]), at = bf[ib] + fr * (bf[ib + 1] - bf[ib]);
                sampleAt(B, at, 1, bLo, bMi * cl, bHi, OUT); B.pos = Math.round(at) - 1;
              } else { mix.tracked = null; sampleDeck(B, 1, bLo, bMi * cl, bHi, OUT); }
            } else sampleDeck(B, 1, bLo, bMi * cl, bHi, OUT);
            if ((A.pos & 1023) === 0) { const q = st.eq; q[0] = aLo * aVol; q[1] = aMi * aVol; q[2] = aHi * aVol; q[3] = bLo; q[4] = bMi; q[5] = bHi; }
          } else if (mix.style === 'underfade') { // A fades out on its own; B rises in under it
            sampleDeck(A, 1 - smooth((u - 0.6) / 0.4), 1, 1, 1, OUT); sampleDeck(B, smooth(u / 0.3), 1, 1, 1, OUT);
          } else if (mix.style === 'outro') { // B's intro rises under A's ending; A holds then drops on the last hit
            sampleDeck(A, 1 - 0.35 * smooth(u / 0.9) - 0.65 * smooth((u - 0.88) / 0.12), 1 - smooth((u - 0.5) / 0.4), 1, 1, OUT);
            sampleDeck(B, smooth(u / 0.5), smooth((u - 0.6) / 0.35), smooth(u / 0.4), 1, OUT);
          } else if (mix.style === 'segue') { // A's last hit rings out as B starts
            sampleDeck(A, 1 - smooth(u), 1, 1, 1, OUT); sampleDeck(B, smooth(u / 0.15), 1, 1, 1, OUT);
          } else { // an equal-power crossfade, the outgoing track's bass going first
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1 - smooth(c / 0.6), 1, 1, OUT);
            sampleDeck(B, Math.sin(c * Math.PI / 2), smooth((c - 0.4) / 0.6), 1, 1, OUT);
          }
          A.pos++; B.pos++;
          if (u >= 1) { st.played++; st.doneAt = Date.now(); if (mix.style === 'cut' || mix.style === 'mashup') st.dropAt = Date.now(); promote(); }
          }
        } else {
          // The next track isn't ready yet: loop A's last four bars on the beat rather than fall silent.
          if (!B && A.matched && preparing && A.loopAt && A.pos >= A.loopAt && A.loops < 12) { A.pos -= Math.round(4 * A.bar); A.loops++; }
          if (A.swap && A.pos >= A.swap.at) {
            // Tempo ease: a quarter-beat crossfade onto the same music at the new tempo.
            const sw = A.swap, nd = sw.to;
            if (!sw.len) { sw.len = Math.max(256, Math.round(A.period / 4)); sw.i = 0; nd.pos = Math.round(A.pos * A.tempo / nd.tempo); }
            const q = sw.i / sw.len;
            sampleDeck(A, 1 - q, 1, 1, 1, OUT); sampleDeck(nd, q, 1, 1, 1, OUT); nd.pos++; sw.i++;
            if (sw.i >= sw.len) { A.swap = null; nd.plan = null; nd.loops = 0; nd.loopAt = 0; A = nd; nowStatus(); log(`[dj] tempo eased to ${Math.round(A.bpm)} BPM`); }
            A.pos++;
          } else {
          // A drop (a quiet bar into a loud one) in the song playing: for the light show.
          if (A.vbBar && A.info.energyBars && (A.pos & 255) === 0) { const j = Math.floor((A.pos - A.firstDown) / A.vbBar); if (j !== A.lastBar) { A.lastBar = j; const en = A.info.energyBars; if (j > 0 && Number(en[j]) >= 7 && Number(en[j - 1]) <= 4) st.dropAt = Date.now(); } }
          sampleDeck(A, 1, 1, 1, 1, OUT);
          // A hint of the next song: its hook laid over this one for a moment.
          const tz = A.tease;
          if (tz && B && A.pos >= tz.at && A.pos < tz.at + tz.len) {
            if (A.plan && tz.at > A.plan.start - 20 * RATE) A.tease = null; // too near the mix after all
            else {
              if (!tz.deck) { lastTease = Date.now(); tz.deck = { pcm: B.pcm, frames: B.frames, lp: new Float32Array(8), gain: B.gain }; tz.off = lagBetween(A.pos, tz.bFrom, 4 * A.period, A.period / 4, A, B); st.tease = { active: true }; log(`[dj] a hint of ${B.track.title}`); }
              const q = (A.pos - tz.at) / tz.len, env = smooth(q / 0.25) * (1 - smooth((q - 0.75) / 0.25));
              sampleAt(tz.deck, tz.bFrom + tz.off + (A.pos - tz.at), 0.55 * env, 0, 0.8, 1, OUT); // no bass: the two kicks never clash
            }
          } else if (tz && tz.deck && A.pos >= tz.at + tz.len) { A.tease = null; st.tease = null; }
          A.pos++;
          }
        }
      }
      // The reverb tail: once the change happens, feed in what the old song
      // would have played next (0.3 s), and let it ring out for a few seconds.
      if (tail.plan && (!mix || (A && A !== tail.plan.deck) || (tail.plan.deck && tail.plan.deck.pos >= tail.plan.from))) {
        if (!mix || A !== tail.plan.deck || tail.plan.deck.pos >= tail.plan.from) { tail.deck = tail.plan.deck; tail.pos = tail.plan.from; tail.left = Math.round(0.3 * RATE); tail.ring = 3 * RATE; tail.plan = null; }
      }
      if (tail.ring > 0) {
        let x = 0;
        if (tail.left > 0 && tail.deck) { const f = tail.pos++; if (f >= 0 && f < tail.deck.frames) x = (tail.deck.pcm[f * 2] + tail.deck.pcm[f * 2 + 1]) / 65536 * tail.deck.gain * (tail.left / (0.3 * RATE)); tail.left--; }
        const w = reverb(x) * 0.5; OUT[0] += w; OUT[1] += w; tail.ring--;
        if (tail.ring <= 0) { for (const c of COMBS) c.b.fill(0); for (const a2 of APS) a2.b.fill(0); tail.deck = null; }
      }
      if (echo.d > 0) {
        const j = (echo.i - echo.d + ECHO_N) % ECHO_N, wl = echo.L[j], wr = echo.R[j];
        OUT[0] += wl * 0.8; OUT[1] += wr * 0.8;
        const send = mix && mix.style === 'echo' && echo.send ? 1 : 0;
        echo.L[echo.i] = (send ? echo.inL || 0 : 0) + wl * echo.fb; echo.R[echo.i] = (send ? echo.inR || 0 : 0) + wr * echo.fb;
        echo.i = (echo.i + 1) % ECHO_N; echo.send = 0;
        if (A && A.pos > echo.until) { echo.d = 0; echo.L.fill(0); echo.R.fill(0); }
      }
      const pw = (OUT[0] * OUT[0] + OUT[1] * OUT[1]) * 0.5;
      rmsFast += (pw - rmsFast) * A_FAST;
      if (!mix) { rmsSlow += (pw - rmsSlow) * A_SLOW; rmsLong += (pw - rmsLong) * A_LONG; }
      // In a mix: hold the level heard before it. Otherwise level sections
      // gently (half the difference from the song's own long-run level, at
      // most about +-2 dB, slowly), so a quiet passage isn't lost.
      const want = mix && mix.ref > 1e-6 && rmsFast > 1e-7 ? Math.max(0.75, Math.min(1.6, Math.sqrt(mix.ref / rmsFast)))
        : !mix && rmsLong > 1e-6 && rmsFast > 1e-7 ? Math.max(0.8, Math.min(1.25, Math.pow(rmsLong / rmsFast, 0.25))) : 1;
      mixGain += (want - mixGain) * (mix ? A_GAIN : A_GAIN_SLOW);
      // A soft limiter: transparent below 0.8, never clipping.
      for (let c = 0; c < 2; c++) {
        let v = OUT[c] * mixGain; const a = Math.abs(v);
        if (a > 0.8) v = Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
        buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 4 + c * 2);
      }
    }
    if (!mix) { const q = st.eq; q[0] = q[1] = q[2] = 1; q[3] = q[4] = q[5] = 0; }
    st.mixLen = mix ? Math.round(mix.len / RATE * 10) / 10 : 0; st.mixSwap = mix && mix.beat && mix.style !== 'cut' ? mix.swapU : mix && FX.has(mix.style) ? mix.bStart : -1;
    st.mixU = mix ? Math.max(0, Math.min(1, (A.pos - mix.from) / mix.len)) : 0;
    // The countdown runs to the middle of the change (the moment the new song
    // takes over), so the change starts a little before zero.
    st.mixIn = A && B && !mix && A.plan ? Math.max(0, Math.round((A.plan.start + A.plan.len * (A.plan.swapU || A.plan.bStart || 0.5) - A.pos) / RATE)) : -1;
    if (A) {
      if (!st.now) nowStatus();
      st.now.pos = Math.round(A.pos / RATE * 10) / 10; st.now.at = Date.now();
      // Where the coming mix sits in this song (for the deck's timeline).
      const pl = mix ? { start: mix.from, len: mix.len } : B && A.plan ? A.plan : null;
      st.now.mixAt = pl ? Math.round(pl.start / RATE * 10) / 10 : -1; st.now.mixLen = pl ? Math.round(pl.len / RATE * 10) / 10 : 0;
    }
    if (A && !mix && !B && A.pos >= A.frames) st.state = list.length ? 'loading' : 'empty';
    return buf;
  }

  function pump() {
    if (st.state === 'stopped') return;
    let n = 0;
    while (getQueueMs() < 1500 && n++ < 20) { if (!A && !B) break; onPcm(render(4410)); }
    if (!A && !B && !preparing && st.state === 'playing') prepareNext();
  }

  async function start(newCfg) {
    stop();
    cfg = { ...cfg, ...(newCfg || {}) };
    cfg.mixBeats = [16, 32, 64].includes(Number(cfg.mixBeats)) ? Number(cfg.mixBeats) : 'auto';
    cfg.quick = !!cfg.quick; cfg.style = STYLES.includes(cfg.style) ? cfg.style : 'auto';
    const g = ++gen;
    st.state = 'loading'; st.error = ''; st.now = null; st.next = null; st.played = 0;
    try { if (sources.loadAnalyses) known = sources.loadAnalyses() || {}; } catch (e) { known = {}; }
    try { list = await sources.allTracks(cfg); } catch (e) { if (g === gen) { st.state = 'error'; st.error = e.message; } return; }
    if (g !== gen) return;
    if (!list.length) { st.state = 'empty'; st.error = cfg.source !== 'youtube' ? 'No music yet - add MP3s, or a YouTube playlist or search' : cfg.youtube ? `Nothing found on YouTube for "${String(cfg.youtube).slice(0, 40)}"` : 'Pick one of your playlists or type a search above'; return; }
    idx = 0; wantNext = null; recent.length = 0; played.clear(); startedAt = Date.now();
    syncQueue(); st.nowIdx = st.nextIdx = -1;
    timer = setTimer(pump, 50);
    prepareNext();
  }
  function stop() { gen++; if (timer) clearTimer(timer); timer = null; A = B = null; mix = null; st.state = 'stopped'; st.mixing = false; st.now = st.next = null; }
  // Play the queue's track i next (not while a mix is under way).
  function playNext(i) {
    if (!(i >= 0 && i < list.length) || mix) return false;
    wantNext = i; B = null; if (A) A.plan = null; st.next = { title: list[i].title, status: 'loading' }; st.nextIdx = i;
    preparing = null; prepToken++;
    prepareNext();
    return true;
  }
  // Jump within the playing track (on its beat grid); the mix is re-planned.
  function seek(sec) {
    if (!A || mix || !(sec >= 0)) return false;
    const maxF = Math.max(0, A.end - 8 * (A.period || RATE / 2));
    A.pos = Math.min(nextBeat(A, Math.min(maxF, Math.round(sec * RATE))), A.frames - 1);
    A.lp.fill(0); A.plan = null; nowStatus();
    return true;
  }
  const syncQueue = () => { st.queue = list.slice(0, 300).map((t) => ({ title: t.name || t.title, artist: t.artist || '', kind: t.kind })); };
  // Take song i out of the list (not the one playing, nor the next one mid-mix).
  function remove(i) {
    if (!(i >= 0 && i < list.length) || i === st.nowIdx || (mix && i === st.nextIdx)) return false;
    const wasNext = i === st.nextIdx, fix = (k) => (k > i ? k - 1 : k);
    list.splice(i, 1);
    if (st.nowIdx >= 0) st.nowIdx = fix(st.nowIdx);
    if (A && A.qi !== undefined) A.qi = fix(A.qi);
    if (wasNext) { B = null; st.next = null; st.nextIdx = -1; preparing = null; prepToken++; if (A) A.plan = null; }
    else { if (st.nextIdx >= 0) st.nextIdx = fix(st.nextIdx); if (B && B.qi !== undefined) B.qi = fix(B.qi); }
    if (wantNext !== null) wantNext = wantNext === i ? null : fix(wantNext);
    if (idx > i) idx--;
    if (list.length) idx %= list.length;
    syncQueue();
    if (wasNext && A) prepareNext();
    return true;
  }
  // 👍 / 👎 on the last change: nudges that style (and a hint of the next
  // song, if one played) up or down for next time. Returns the new taste.
  function rate(good) {
    const t = { ...(cfg.taste || {}) }, step = good ? 0.15 : -0.2;
    if (lastStyle) { t[lastStyle] = Math.max(-1, Math.min(1, (Number(t[lastStyle]) || 0) + step)); const kd2 = lastStyle + dayPart(); t[kd2] = Math.max(-1, Math.min(1, (Number(t[kd2]) || 0) + step)); }
    if (lastTease && Date.now() - lastTease < 10 * 60000) t.tease = Math.max(-1, Math.min(1, (Number(t.tease) || 0) + step));
    cfg.taste = t;
    return t;
  }
  // Add a song: next (straight after the one playing) or at the end.
  function add(track, next) {
    if (!track || !track.id || !list.length) return -1;
    const at = next && st.nowIdx >= 0 ? st.nowIdx + 1 : list.length, fix = (k) => (k >= at ? k + 1 : k);
    list.splice(at, 0, track);
    if (st.nextIdx >= 0) st.nextIdx = fix(st.nextIdx);
    if (B && B.qi !== undefined) B.qi = fix(B.qi);
    if (wantNext !== null) wantNext = fix(wantNext);
    if (idx > at || (idx === at && !next)) idx++;
    syncQueue();
    if (next && !mix) playNext(at);
    return at;
  }
  // The decks' audio, for the split spectrum (the next track's is previewed
  // silently before the mix): RadioAudio analyses it on the main thread.
  function deckFeed() {
    if (!A) return null;
    return { a: { pcm: A.pcm, frames: A.frames, pos: A.pos }, b: B ? { pcm: B.pcm, frames: B.frames, pos: B.pos, inFrame: B.inFrame, bar: B.bar || RATE * 2, readyAt: B.readyAt || 0 } : null, mixing: !!mix };
  }
  // Mix settings changed while playing: re-plan the coming mix.
  function configure(c) {
    if (c.mixBeats !== undefined) cfg.mixBeats = [16, 32, 64].includes(Number(c.mixBeats)) ? Number(c.mixBeats) : 'auto';
    if (c.quick !== undefined) cfg.quick = !!c.quick;
    if (c.endless !== undefined) cfg.endless = !!c.endless;
    if (c.taste && typeof c.taste === 'object') cfg.taste = c.taste;
    if (STYLES.includes(c.style)) cfg.style = c.style;
    if (A && !mix) A.plan = null;
  }
  // Skip: mix into the next track from A's next bar, over 8 beats.
  function skip() { if (A && !mix) { A.force = 8; A.plan = null; if (!B) prepareNext(); } }

  return { start, stop, configure, deckFeed, remove, add, rate, lastChange: () => ({ style: lastStyle, at: lastMixAt }), skip, seek, playNext, render, status: st, _test: { deckFrom, planMix, planTease, entries, lagBetween, vocalAt, cfg: () => cfg, known: () => known, get A() { return A; }, get B() { return B; } } };
}

module.exports = { createDjEngine, RATE };
