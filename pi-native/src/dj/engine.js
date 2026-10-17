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
const LENGTHS = [128, 96, 64, 48, 32, 16];
const TARGET_DB = -17;
const STYLES = ['auto', 'blend', 'short', 'cut'];
const CUT = 882; // a cut's crossfade: 20 ms, just enough to avoid a click

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

function createDjEngine({ onPcm, getQueueMs = () => 0, sources = require('./sources'), decode = require('./decode'), analyser = require('./analyse'), log = console.log, setTimer = setInterval, clearTimer = clearInterval }) {
  const st = { tease: null, eq: [1, 1, 1, 0, 0, 0], mixLen: 0, mixSwap: -1, doneAt: 0, state: 'stopped', error: '', now: null, next: null, mixing: false, played: 0, queue: [], nowIdx: -1, nextIdx: -1 };
  let wantNext = null, prepToken = 0;
  let cfg = { source: 'both', youtube: '', mixBeats: 'auto', quick: false, style: 'auto' };
  let list = [], idx = 0, A = null, B = null, preparing = null, timer = null, mix = null, gen = 0;
  let known = {}; const recent = [], played = new Set(); let extending = null, lastStyle = '';

  function deckFrom(track, info, pcm, tempo, matched, semis = 0) {
    const k = RATE / tempo; // original seconds -> played frames
    const d = { track, info, pcm, frames: pcm.length / 2, tempo, matched, semis, pos: 0, lp: new Float32Array(8), plan: null };
    d.period = info.period * k; d.firstBeat = info.firstBeat * k; d.start = info.musicStart * k; d.end = Math.min(d.frames, info.musicEnd * k);
    d.bpm = info.bpm * tempo; d.bar = 4 * d.period;
    d.introBeats = info.introBeats || 0; d.outroBeats = info.outroBeats || 0;
    d.gain = info.loudness ? Math.max(0.5, Math.min(2.5, Math.pow(10, (TARGET_DB - info.loudness) / 20))) : 1;
    if (matched && d.period > 0) {
      const gp = (info.gridPeriod || info.period) * k; // the analysed beat (the grid may be at half/double time)
      d.firstDown = d.firstBeat + ((info.downbeat || 0) % 4) * gp; d.vbBar = 4 * gp;
      d.inFrame = d.firstDown + Math.ceil((d.start - d.firstDown - d.period * 0.5) / d.bar) * d.bar; // the first bar of the music
      if (d.inFrame < 0) d.inFrame += d.bar;
    } else { d.firstDown = d.firstBeat; d.inFrame = d.start; }
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

  // A hint of the next song, now and then: B's catchiest bars (its most
  // sung, past its intro) laid over A for two bars where A isn't singing,
  // on a phrase, well before the mix - beat-matched, bass out, half volume.
  function planTease(a, b) {
    if (!(a.matched && b.matched) || !b.info.vocalLevel || !a.vbBar || !b.vbBar || Math.random() < 0.35) return null;
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
    const lo = now ? a.pos + CUT : Math.max(a.pos + CUT, a.inFrame + 0.55 * (a.end - a.inFrame));
    const ratio = a.bpm > 0 && b.bpm > 0 ? Math.max(a.bpm / b.bpm, b.bpm / a.bpm) : 1;
    const calm = a.outroBeats >= 16 && b.introBeats >= 16; // both ends quiet: a long crossfade suits
    const opts = [['echo', 0.2], ['filter', a.matched ? 0.3 : 0.55], ['brake', ratio > 1.12 ? 0.35 : 0.7], ['roll', a.matched ? 0.4 : 9], ['fade', calm ? 0.15 : 0.6]];
    let best = null, bestCost = Infinity;
    const first = a.matched ? nextBar(a, lo) : lo;
    for (let f = first; f < a.end - 2 * RATE; f += step) {
      for (const [style, base] of opts) {
        let pl;
        if (style === 'fade') { const len = Math.min(cfg.quick ? 8 * RATE : 12 * RATE, Math.max(3 * RATE, (a.end - f) * 0.8)); pl = { start: Math.round(f), len, beat: false, beats: 0, style: 'fade', bStart: 0 }; }
        else pl = fxPlan(style, f, a);
        if (pl.start + pl.len > a.end + RATE) continue;
        const out = pl.start + pl.len * (pl.bStart || 0.5);
        const where = now ? (f - first) / RATE * 0.05 : 0.15 * (1 - (f - first) / Math.max(1, a.end - first));
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
    if (!(a.matched && b.matched)) return planFx(a, b, now);
    const p = a.period, style = cfg.style || 'auto', bIn = b.inFrame;
    const blendPlan = (start, L) => { const half = Math.max(1, Math.round(L / 8)) * 4; return { start: Math.round(start), len: L * p, beat: true, beats: L, swapU: Math.min(0.85, half / L), style: L <= 8 ? 'short' : 'blend' }; };
    const cutPlan = (at) => ({ start: Math.round(at) - CUT / 2, len: CUT, beat: true, beats: 0, style: 'cut', at: Math.round(at) });
    // Candidate bars and the window to choose in.
    const first = nextBar(a, Math.max(a.pos + CUT, a.inFrame + 16 * p));
    let lo, hi, early = false;
    if (now) { lo = nextBar(a, a.pos + CUT); hi = lo + 8 * a.bar; }
    else if (cfg.quick) { lo = Math.max(first, a.inFrame + Math.max(55 * RATE, Math.max(16, a.introBeats || 0) * p)); hi = lo + 60 * RATE; early = true; }
    else { lo = Math.max(first, a.inFrame + 0.5 * (a.end - a.inFrame)); hi = a.end; }
    if (lo >= a.end - 2 * p) { lo = first; hi = a.end; }
    const bars = [];
    for (let f = nextBar(a, lo - 1); f < Math.min(hi, a.end - 2 * p); f += a.bar) bars.push(f);
    if (!bars.length) bars.push(nextBar(a, a.pos + CUT));
    const span = Math.max(1, bars[bars.length - 1] - bars[0]);
    const place = (f) => {
      const beatsIn = Math.round((f - a.inFrame) / p);
      const phrase = beatsIn % 16 === 0 ? 0 : beatsIn % 8 === 0 ? 0.08 : 0.18;
      const where = now ? (f - bars[0]) / span * 0.3 : 0.12 * (early ? (f - bars[0]) / span : 1 - (f - bars[0]) / span);
      return phrase + where;
    };
    const fits = (f, L) => f + L * p <= a.end + p;
    const autoMax = Math.min(Math.max(a.outroBeats, 32), Math.max(b.introBeats, 16));
    let lengths = want === 'auto' ? LENGTHS.filter((L) => L <= Math.max(16, autoMax)) : [Number(want) || 32];
    if (cfg.quick || now) lengths = lengths.map((L) => Math.min(L, now ? 8 : 32));
    // Per track pair: what makes blending worse and an instant cut better.
    // Keys that clash sound sour layered (a cut avoids it); a track with no
    // intro (straight in with full beat or voice) has nothing to blend over;
    // a track with no outro has nothing quiet to blend out of.
    const kd = analyser.keyDistance && a.keyNow && b.keyNow ? analyser.keyDistance(a.keyNow, b.keyNow) : 0;
    const blendExtra = 0.22 * Math.max(0, kd - 1) + (b.introBeats < 8 ? 0.3 : 0) + (a.outroBeats < 8 ? 0.12 : 0);
    let best = null, bestCost = Infinity;
    const offer = (cost, plan) => { if (plan.style === lastStyle) cost += 0.08; if (cost < bestCost) { bestCost = cost; best = plan; } }; // a little variety
    for (const f of bars) {
      const pl = place(f);
      if ((style === 'auto' || style === 'blend') && !now) {
        for (const L of lengths) {
          if (L < 16 || !fits(f, L)) continue;
          // A blend: A's voice may carry on while B comes in quietly underneath
          // (B's bass and mids held back) - it must not still be singing after
          // the swap, when B takes over; and B's intro must not sing over A.
          const sw = Math.max(1, Math.round(L / 8)) * 4 * p;
          const c = 2.2 * vocalAt(a, f + sw, f + L * p) + 0.25 * vocalAt(a, f, f + sw) + 0.9 * vocalAt(b, bIn, bIn + sw * b.period / p) + 0.3 * vocalAt(b, bIn + sw * b.period / p, bIn + L * b.period) + pl - 0.1 * Math.log2(L / 16) + blendExtra;
          offer(style === 'blend' ? pl - 0.1 * Math.log2(L / 16) + 0.3 * vocalAt(a, f, f + L * p) : c, blendPlan(f, L));
        }
      }
      if ((style === 'auto' || style === 'short' || (now && style !== 'cut')) && fits(f, 8)) {
        offer(2.5 * vocalAt(a, f, f + 8 * p) + 0.5 * vocalAt(b, bIn, bIn + 8 * b.period) + 0.5 * blendExtra + pl + (style === 'auto' ? 0.25 : 0), blendPlan(f, 8)); // short: a little more noticeable than a blend
      }
      if (style === 'auto' && !now) {
        // Now and then an effect instead (echo out, filter sweep, loop roll).
        for (const fx of ['echo', 'filter', 'roll']) {
          const pl2 = fxPlan(fx, f, a); if (pl2.start + pl2.len > a.end + p) continue;
          const out = pl2.start + pl2.len * pl2.bStart;
          offer(1.9 * vocalAt(a, out, out + a.bar) + 0.4 * vocalAt(b, bIn, bIn + a.bar) + pl + 0.85 + (fx === 'roll' ? 0.05 : 0), pl2);
        }
      }
      if (style === 'auto' || style === 'cut') {
        // A cut drops what A would have sung next; best just after a line ends.
        const after = vocalAt(a, f, f + 2 * a.bar), before = vocalAt(a, f - a.bar, f);
        const lineEnds = before > 0.4 && after < 0.15 ? 0.15 : 0; // a vocal line has just finished: the classic place to drop the next track in
        offer(1.6 * after + 0.3 * before * after + 0.4 * vocalAt(b, bIn, bIn + a.bar) - lineEnds + pl + (style === 'auto' ? 0.6 : 0), cutPlan(f)); // a cut is the most noticeable: only when nothing smoother fits
      }
    }
    if (!best) best = style === 'cut' ? cutPlan(bars[0]) : blendPlan(bars[0], 8);
    best.cost = Math.round(bestCost * 100) / 100;
    if (FX.has(best.style)) { best.why = { echo: 'echo out into the drop', filter: 'filter sweep into the drop', roll: 'loop roll into the drop', brake: 'brake stop' }[best.style]; return best; }
    best.why = best.style === 'cut' ? (kd >= 3 ? 'keys clash' : b.introBeats < 8 ? 'no intro to blend over' : 'cut where the singing stops') : best.style === 'short' ? 'quick blend between vocals' : 'long blend under the vocals';
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
    if (info && info.vocalLevel === undefined) info = null; // analysed by an older version: no singing map
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
    if (info.bpm > 0 && info.confidence > 0.25 && target > 0) {
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
      if (s < bs) { bs = s; best = ti; }
    });
    if (best === cands[0]) idx = best + 1;
    return best;
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
    lastStyle = p.style;
    if (p.style === 'echo') { echo.d = Math.round(mix.period * 0.75); echo.fb = 0.55; echo.until = A.pos + mix.len + 5 * RATE; }
    B.pos = Math.round(B.inFrame);
    if (p.beat) {
      // Line B's beats up with A's from the audio itself (the grids can be a few ms out).
      const aF = p.style === 'cut' ? p.at : A.pos, lag = lagBetween(aF, B.inFrame, 8 * A.period, A.period / 4);
      B.pos = Math.round(B.inFrame + lag - (aF - A.pos));
      mix.check = A.pos + Math.round(A.bar);
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
    prepareNext();
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
  let rmsSlow = 0, rmsFast = 0, mixGain = 1;
  const A_SLOW = 1 / (3 * RATE), A_FAST = 1 / (0.5 * RATE), A_GAIN = 1 / (1.2 * RATE);
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
          if (mix.beat && mix.style !== 'cut' && A.pos >= mix.check) {
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
              if (!mix.bOn) { mix.bOn = true; B.pos = Math.round(B.inFrame); }
              sampleDeck(B, mix.style === 'echo' ? smooth((u - bS) / 0.12) : smooth((u - bS) / 0.02), 1, 1, 1, OUT); B.pos++;
            }
            if ((A.pos & 1023) === 0) { const qq = st.eq; qq[0] = lo * gA; qq[1] = mi * gA; qq[2] = Math.min(1, hi) * gA; const bv = mix.bOn ? 1 : 0; qq[3] = qq[4] = qq[5] = bv; }
            A.pos++;
            if (u >= 1) { st.played++; st.doneAt = Date.now(); if (!mix.bOn) B.pos = Math.round(B.inFrame); promote(); }
          } else {
          if (mix.style === 'cut') { // A stops, B's downbeat takes over
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1, 1, 1, OUT); sampleDeck(B, Math.sin(c * Math.PI / 2), 1, 1, 1, OUT);
          } else if (mix.beat) {
            const s = mix.swapU;
            const bHi = smooth(u / (s * 0.7)), bMi = smooth((u - s * 0.25) / (s * 0.7)), bLo = smooth((u - s) / 0.03);
            const aLo = 1 - bLo, aMi = 1 - smooth((u - s) / ((1 - s) * 0.8)), aHi = 1 - smooth((u - s - (1 - s) * 0.2) / ((1 - s) * 0.8));
            const aVol = 1 - smooth((u - 0.85) / 0.15);
            sampleDeck(A, aVol, aLo, aMi, aHi, OUT); sampleDeck(B, 1, bLo, bMi, bHi, OUT);
            if ((A.pos & 1023) === 0) { const q = st.eq; q[0] = aLo * aVol; q[1] = aMi * aVol; q[2] = aHi * aVol; q[3] = bLo; q[4] = bMi; q[5] = bHi; }
          } else { // an equal-power crossfade, the outgoing track's bass going first
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1 - smooth(c / 0.6), 1, 1, OUT);
            sampleDeck(B, Math.sin(c * Math.PI / 2), smooth((c - 0.4) / 0.6), 1, 1, OUT);
          }
          A.pos++; B.pos++;
          if (u >= 1) { st.played++; st.doneAt = Date.now(); promote(); }
          }
        } else {
          // The next track isn't ready yet: loop A's last four bars on the beat rather than fall silent.
          if (!B && A.matched && preparing && A.loopAt && A.pos >= A.loopAt && A.loops < 12) { A.pos -= Math.round(4 * A.bar); A.loops++; }
          sampleDeck(A, 1, 1, 1, 1, OUT);
          // A hint of the next song: its hook laid over this one for a moment.
          const tz = A.tease;
          if (tz && B && A.pos >= tz.at && A.pos < tz.at + tz.len) {
            if (A.plan && tz.at > A.plan.start - 20 * RATE) A.tease = null; // too near the mix after all
            else {
              if (!tz.deck) { tz.deck = { pcm: B.pcm, frames: B.frames, lp: new Float32Array(8), gain: B.gain }; tz.off = lagBetween(A.pos, tz.bFrom, 4 * A.period, A.period / 4, A, B); st.tease = { active: true }; log(`[dj] a hint of ${B.track.title}`); }
              const q = (A.pos - tz.at) / tz.len, env = smooth(q / 0.25) * (1 - smooth((q - 0.75) / 0.25));
              sampleAt(tz.deck, tz.bFrom + tz.off + (A.pos - tz.at), 0.55 * env, 0, 0.8, 1, OUT); // no bass: the two kicks never clash
            }
          } else if (tz && tz.deck && A.pos >= tz.at + tz.len) { A.tease = null; st.tease = null; }
          A.pos++;
        }
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
      if (!mix) rmsSlow += (pw - rmsSlow) * A_SLOW;
      const want = mix && mix.ref > 1e-6 && rmsFast > 1e-7 ? Math.max(0.75, Math.min(1.6, Math.sqrt(mix.ref / rmsFast))) : 1;
      mixGain += (want - mixGain) * A_GAIN;
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
    st.mixIn = A && B && !mix && A.plan ? Math.max(0, Math.round((A.plan.start - A.pos) / RATE)) : -1;
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
    idx = 0; wantNext = null; recent.length = 0; played.clear();
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
    if (STYLES.includes(c.style)) cfg.style = c.style;
    if (A && !mix) A.plan = null;
  }
  // Skip: mix into the next track from A's next bar, over 8 beats.
  function skip() { if (A && !mix) { A.force = 8; A.plan = null; if (!B) prepareNext(); } }

  return { start, stop, configure, deckFeed, remove, add, skip, seek, playNext, render, status: st, _test: { deckFrom, planMix, planTease, lagBetween, vocalAt, cfg: () => cfg, known: () => known, get A() { return A; }, get B() { return B; } } };
}

module.exports = { createDjEngine, RATE };
