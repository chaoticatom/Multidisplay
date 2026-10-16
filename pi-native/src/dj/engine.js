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
const MAX_STRETCH = 0.08;
const LENGTHS = [128, 96, 64, 48, 32, 16];
const TARGET_DB = -17;
const STYLES = ['auto', 'blend', 'short', 'cut'];
const CUT = 882; // a cut's crossfade: 20 ms, just enough to avoid a click

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

function createDjEngine({ onPcm, getQueueMs = () => 0, sources = require('./sources'), decode = require('./decode'), analyser = require('./analyse'), log = console.log, setTimer = setInterval, clearTimer = clearInterval }) {
  const st = { state: 'stopped', error: '', now: null, next: null, mixing: false, played: 0, queue: [], nowIdx: -1, nextIdx: -1 };
  let wantNext = null, prepToken = 0;
  let cfg = { source: 'both', youtube: '', mixBeats: 'auto', quick: false, style: 'auto' };
  let list = [], idx = 0, A = null, B = null, preparing = null, timer = null, mix = null, gen = 0;
  let known = {}; const recent = [];

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

  // Is the voice band quiet over frames f0..f1 of deck d (no singing to talk over)?
  function vocalFree(d, f0, f1) {
    const vb = d.info.vocalBars; if (!vb || !d.vbBar) return true;
    const j0 = Math.max(0, Math.floor((f0 - d.firstDown) / d.vbBar)), j1 = Math.floor((f1 - d.firstDown - 1) / d.vbBar);
    for (let j = j0; j <= j1 && j < vb.length; j++) if (vb[j] === '1') return false;
    return true;
  }

  // When and how A mixes into B. want: 'auto' or a number of beats (the
  // blend length); now: from A's next bar (skip). Styles (cfg.style):
  //   blend - a long EQ blend over the intro/outro (up to 128 beats)
  //   short - both play for 8 beats (a few seconds), beat-matched
  //   cut   - A stops on a phrase end and B's downbeat lands where A's next
  //           would have: the beat flows straight across
  //   auto  - a blend where neither track is singing; else a short mix where
  //           A isn't; else a cut at a phrase end
  function planMix(a, b, want, now = false) {
    if (!(a.matched && b.matched)) {
      const len = Math.min(cfg.quick ? 8 * RATE : 12 * RATE, Math.max(2 * RATE, (a.end - a.pos) * 0.5));
      let s = now ? a.pos : a.end - len;
      if (cfg.quick && !now) s = Math.min(s, a.start + 60 * RATE);
      return { start: Math.max(a.pos, s), len, beat: false, beats: 0, style: 'fade' };
    }
    const p = a.period, style = cfg.style || 'auto';
    const blendPlan = (start, L) => { const half = Math.max(1, Math.round(L / 8)) * 4; return { start: Math.round(start), len: L * p, beat: true, beats: L, swapU: Math.min(0.85, half / L), style: L <= 8 ? 'short' : 'blend' }; };
    const cutPlan = (at) => ({ start: Math.round(at) - CUT / 2, len: CUT, beat: true, beats: 0, style: 'cut', at: Math.round(at) });
    if (now) {
      const at = nextBar(a, a.pos + CUT);
      return style === 'cut' ? cutPlan(at) : blendPlan(at, Number(want) > 0 && Number(want) < 16 ? Number(want) : 8);
    }
    // Phrase starts (every 16 beats from A's first bar), in order of preference:
    // late in the track, or about a minute in for a quick mix.
    const first = Math.max(a.pos + CUT, a.inFrame + 16 * p), phrases = [];
    for (let f = a.inFrame + Math.ceil((first - a.inFrame) / (16 * p)) * 16 * p; f < a.end - 2 * p; f += 16 * p) phrases.push(f);
    if (!phrases.length) phrases.push(nextBar(a, a.pos + CUT));
    let prefs;
    if (cfg.quick) {
      const from = Math.max(a.inFrame + 55 * RATE, a.inFrame + Math.max(16, a.introBeats || 0) * p);
      prefs = phrases.filter((f) => f >= from && f < from + 60 * RATE);
      if (!prefs.length) prefs = phrases.slice(-1);
    } else {
      const late = a.inFrame + 0.55 * (a.end - a.inFrame);
      // Late first; a little earlier is allowed when a longer blend needs the room.
      prefs = phrases.filter((f) => f >= late).reverse().concat(phrases.filter((f) => f < late && f >= a.inFrame + 0.35 * (a.end - a.inFrame)).reverse());
      if (!prefs.length) prefs = phrases.slice(-1);
    }
    const fits = (f, L) => f + L * p <= a.end + p;
    const autoMax = Math.min(Math.max(a.outroBeats, 32), Math.max(b.introBeats, 16));
    const lengths = want === 'auto' ? LENGTHS.filter((L) => L <= Math.max(16, autoMax)) : [Number(want) || 32];
    if (cfg.quick) for (let i = 0; i < lengths.length; i++) lengths[i] = Math.min(lengths[i], 32);
    const bIn = b.inFrame;
    if (style === 'blend' || style === 'auto') {
      for (const L of lengths) for (const f of prefs) {
        if (!fits(f, L)) continue;
        if (style === 'blend' || (vocalFree(a, f, f + L * p) && vocalFree(b, bIn, bIn + L * b.period))) return blendPlan(f, L);
      }
      if (style === 'blend') { const L = lengths[lengths.length - 1], f = prefs.find((x) => fits(x, L)) || phrases[phrases.length - 1]; return blendPlan(f, Math.min(L, Math.max(8, Math.floor((a.end - f) / p)))); }
    }
    if (style === 'short' || style === 'auto') {
      for (const f of prefs) if (fits(f, 8) && (style === 'short' || vocalFree(a, f, f + 8 * p))) return blendPlan(f, 8);
      if (style === 'short') return blendPlan(prefs[0], 8);
    }
    // A cut: at the end of a phrase, preferably where A's singing has just finished.
    const after = prefs.find((f) => !vocalFree(a, f - a.bar, f) && vocalFree(a, f, f + a.bar));
    return cutPlan(after || prefs[0]);
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
    const input = await sources.inputFor(track);
    let info = known[track.id];
    if (info && info.vocalBars === undefined) info = null; // analysed by an older version: no singing map
    if (!info) {
      info = analyser.analyse(await decode.decodeAnalysis(input));
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
  function chooseNext() {
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
          st.next = { title: track.title, status: 'loading' }; st.nextIdx = ti;
          const d = await prepare(track, A);
          if (g !== gen || tok !== prepToken) return; // stopped, or another track was picked meanwhile
          d.qi = ti;
          if (A && !A.matched) d.matched = false;
          B = d; if (A) A.plan = null;
          const beat = d.matched && A && A.matched;
          st.next = { title: track.title, bpm: Math.round(d.bpm), key: d.keyNow ? d.keyNow.camelot : '', shift: d.semis, mode: beat ? 'beat-matched' : 'crossfade' };
          log(`[dj] next: ${track.title} (${Math.round(d.info.bpm)} BPM${d.tempo !== 1 ? ` -> ${Math.round(d.bpm)}` : ''}${d.semis ? `, ${d.semis > 0 ? '+' : ''}${d.semis} st` : ''}, ${st.next.mode})`);
          return;
        } catch (e) { log('[dj] skipped ' + track.title + ': ' + e.message); st.error = e.message; }
      }
      st.next = null; st.nextIdx = -1;
    })().finally(() => { if (tok === prepToken) preparing = null; });
  }

  function startMix() {
    const p = A.plan;
    mix = { from: A.pos, len: Math.max(1, p.len), beat: p.beat, swapU: p.swapU || 0.5, beats: p.beats, style: p.style, adj: 0, check: 0 };
    B.pos = Math.round(B.inFrame);
    if (p.beat) {
      // Line B's beats up with A's from the audio itself (the grids can be a few ms out).
      const aF = p.style === 'cut' ? p.at : A.pos, lag = lagBetween(aF, B.inFrame, 8 * A.period, A.period / 4);
      B.pos = Math.round(B.inFrame + lag - (aF - A.pos));
      mix.check = A.pos + Math.round(A.bar);
    }
    st.mixing = true;
    if (st.next) { st.next.beats = p.beats; st.next.style = p.style; }
    log(`[dj] ${p.style === 'cut' ? 'cutting' : 'mixing'} into ${B.track.title}${p.beats ? ` over ${p.beats} beats` : p.style === 'fade' ? ` over ${Math.round(p.len / RATE)} s` : ' on the beat'}`);
  }
  function promote() {
    if (A) { recent.push(A.track.id); while (recent.length > Math.max(1, Math.floor(list.length / 2))) recent.shift(); }
    A = B; B = null; mix = null; st.mixing = false;
    if (A.pos === 0) A.pos = Math.round(A.inFrame);
    A.plan = null; A.force = 0; A.loops = 0;
    A.loopAt = A.matched && A.bar > 0 ? Math.round(A.firstDown + Math.floor((A.end - A.firstDown) / A.bar) * A.bar) : 0;
    if (A.loopAt - 4 * A.bar < A.pos) A.loopAt = 0;
    st.state = 'playing'; st.nowIdx = A.qi === undefined ? -1 : A.qi; st.nextIdx = -1;
    nowStatus();
    prepareNext();
  }
  function nowStatus() {
    if (!A) return;
    st.now = { title: A.track.title, bpm: Math.round(A.bpm), key: A.keyNow ? A.keyNow.camelot : '', shift: A.semis || 0, dur: Math.round(A.frames / RATE * 10) / 10, pos: Math.round(A.pos / RATE * 10) / 10, at: Date.now() };
  }

  // Three bands per deck and channel: bass (< ~180 Hz, 2-pole), highs (> ~2.5 kHz), mids between.
  const LPL = 1 - Math.exp(-2 * Math.PI * 180 / RATE), LPH = 1 - Math.exp(-2 * Math.PI * 2500 / RATE);
  function sampleDeck(d, gain, lo, mi, hi, out) {
    const f = d.pos, s = d.lp;
    let l = 0, r = 0;
    if (f >= 0 && f < d.frames) { l = d.pcm[f * 2] / 32768; r = d.pcm[f * 2 + 1] / 32768; }
    s[0] += (l - s[0]) * LPL; s[1] += (s[0] - s[1]) * LPL; s[4] += (l - s[4]) * LPH;
    s[2] += (r - s[2]) * LPL; s[3] += (s[2] - s[3]) * LPL; s[5] += (r - s[5]) * LPH;
    const g = gain * d.gain;
    out[0] += (s[1] * lo + (s[4] - s[1]) * mi + (l - s[4]) * hi) * g;
    out[1] += (s[3] * lo + (s[5] - s[3]) * mi + (r - s[5]) * hi) * g;
  }

  const OUT = [0, 0];
  function render(frames) {
    const buf = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames; i++) {
      OUT[0] = 0; OUT[1] = 0;
      if (!A && B) promote();
      if (A) {
        if (B && !mix) {
          if (!A.plan || A.plan.start < A.pos - 1) A.plan = planMix(A, B, A.force || cfg.mixBeats, !!A.force);
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
          if (mix.style === 'cut') { // A stops, B's downbeat takes over
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1, 1, 1, OUT); sampleDeck(B, Math.sin(c * Math.PI / 2), 1, 1, 1, OUT);
          } else if (mix.beat) {
            const s = mix.swapU;
            const bHi = smooth(u / (s * 0.7)), bMi = smooth((u - s * 0.25) / (s * 0.7)), bLo = smooth((u - s) / 0.03);
            const aLo = 1 - bLo, aMi = 1 - smooth((u - s) / ((1 - s) * 0.8)), aHi = 1 - smooth((u - s - (1 - s) * 0.2) / ((1 - s) * 0.8));
            const aVol = 1 - smooth((u - 0.85) / 0.15);
            sampleDeck(A, aVol, aLo, aMi, aHi, OUT); sampleDeck(B, 1, bLo, bMi, bHi, OUT);
          } else { // an equal-power crossfade, the outgoing track's bass going first
            const c = clamp01(u);
            sampleDeck(A, Math.cos(c * Math.PI / 2), 1 - smooth(c / 0.6), 1, 1, OUT);
            sampleDeck(B, Math.sin(c * Math.PI / 2), smooth((c - 0.4) / 0.6), 1, 1, OUT);
          }
          A.pos++; B.pos++;
          if (u >= 1) { st.played++; promote(); }
        } else {
          // The next track isn't ready yet: loop A's last four bars on the beat rather than fall silent.
          if (!B && A.matched && preparing && A.loopAt && A.pos >= A.loopAt && A.loops < 12) { A.pos -= Math.round(4 * A.bar); A.loops++; }
          sampleDeck(A, 1, 1, 1, 1, OUT); A.pos++;
        }
      }
      // A soft limiter: transparent below 0.8, never clipping.
      for (let c = 0; c < 2; c++) {
        let v = OUT[c]; const a = Math.abs(v);
        if (a > 0.8) v = Math.sign(v) * (0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2));
        buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 4 + c * 2);
      }
    }
    if (A) { st.now ? (st.now.pos = Math.round(A.pos / RATE * 10) / 10, st.now.at = Date.now()) : nowStatus(); }
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
    if (!list.length) { st.state = 'empty'; st.error = cfg.source === 'youtube' ? 'No YouTube tracks found' : 'No music yet - add MP3s, or a YouTube playlist or search'; return; }
    idx = 0; wantNext = null; recent.length = 0;
    st.queue = list.slice(0, 300).map((t) => ({ title: t.title, kind: t.kind })); st.nowIdx = st.nextIdx = -1;
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
  // Mix settings changed while playing: re-plan the coming mix.
  function configure(c) {
    if (c.mixBeats !== undefined) cfg.mixBeats = [16, 32, 64].includes(Number(c.mixBeats)) ? Number(c.mixBeats) : 'auto';
    if (c.quick !== undefined) cfg.quick = !!c.quick;
    if (STYLES.includes(c.style)) cfg.style = c.style;
    if (A && !mix) A.plan = null;
  }
  // Skip: mix into the next track from A's next bar, over 8 beats.
  function skip() { if (A && !mix) { A.force = 8; A.plan = null; if (!B) prepareNext(); } }

  return { start, stop, configure, skip, seek, playNext, render, status: st, _test: { deckFrom, planMix, lagBetween, cfg: () => cfg, known: () => known, get A() { return A; }, get B() { return B; } } };
}

module.exports = { createDjEngine, RATE };
