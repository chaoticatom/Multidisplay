// Auto-DJ track analysis: tempo, beat grid, and where the music really
// starts and ends. Input: the track as mono float samples at RATE (11025 Hz,
// decoded by dj/decode.js). Output (seconds):
//   { bpm, period, firstBeat, confidence 0..1, musicStart, musicEnd, duration,
//     downbeat 0..3 (which beat of the grid starts a bar), introBeats,
//     outroBeats (how long the quieter mixable intro/outro run), loudness
//     (dB, for levelling), key { pc 0-11, minor, camelot e.g. '8A', conf },
//     vocalBars: '0'/'1' per bar from the first downbeat - '1' where the
//     voice band (300 Hz - 3 kHz) stands out: singing or a busy lead, a
//     place a DJ doesn't talk over with another track }
// How: an onset curve (rises in low-to-mid energy, 23 ms steps), its
// autocorrelation for the tempo (80-180 BPM, preferring the 110-135 range
// dance music sits in, octave errors folded), then the beat phase that lines
// the most onsets up. "Music" is where the level stays above a fraction of
// the track's typical level (skipping spoken intros, silence, fades).
'use strict';

const RATE = 11025, HOP = 256, FPS = RATE / HOP; // ~43 onset frames a second
const { fft } = require('../effects/radio/fft');

function onsetCurve(x) {
  const n = Math.floor(x.length / HOP), on = new Float32Array(n), lvl = new Float32Array(n), low = new Float32Array(n), mid = new Float32Array(n);
  let lp = 0, prev = 0, s1 = 0, s2 = 0, m1 = 0, m2 = 0;
  for (let f = 0; f < n; f++) {
    let e = 0, a = 0, eb = 0, em = 0;
    for (let i = f * HOP, end = i + HOP; i < end; i++) {
      lp += (x[i] - lp) * 0.12; e += lp * lp; a += x[i] * x[i]; // ~200 Hz low-pass: kicks and bass, for onsets
      s1 += (x[i] - s1) * 0.05; s2 += (s1 - s2) * 0.05; m1 += (x[i] - m1) * 0.82; m2 += (x[i] - m2) * 0.157; em += (m1 - m2) * (m1 - m2); // 300 Hz - 3 kHz, where a voice sits
      eb += s2 * s2; // ~90 Hz, two poles: the kick and sub-bass alone, for how 'full' a section is
    }
    const le = Math.log(1e-6 + e);
    on[f] = Math.max(0, le - prev); prev = le;
    lvl[f] = Math.sqrt(a / HOP); low[f] = Math.sqrt(eb / HOP); mid[f] = Math.sqrt(em / HOP);
  }
  // Subtract a local mean so steady loudness doesn't count as onsets.
  const out = new Float32Array(n), W = 8;
  let s = 0;
  for (let f = 0; f < n; f++) { s += on[f]; if (f >= W) s -= on[f - W]; out[f] = Math.max(0, on[f] - s / Math.min(W, f + 1)); }
  return { on: out, lvl, low, mid };
}

function analyse(x) {
  const duration = x.length / RATE;
  const { on, lvl, low, mid } = onsetCurve(x), n = on.length;
  // Where the music is: level above 25% of the track's median "loud" level.
  const sorted = Float32Array.from(lvl).sort(), ref = sorted[Math.floor(sorted.length * 0.6)] || 0;
  let s0 = 0, s1 = n - 1;
  while (s0 < n - 1 && lvl[s0] < ref * 0.25) s0++;
  while (s1 > s0 && lvl[s1] < ref * 0.25) s1--;
  const musicStart = s0 / FPS, musicEnd = (s1 + 1) / FPS;
  // Tempo by autocorrelation of the onset curve over the music.
  const a = s0, b = Math.min(n, Math.max(s0 + 1, s1));
  let best = 0, bestLag = 0, mean = 0;
  for (let f = a; f < b; f++) mean += on[f];
  mean /= Math.max(1, b - a);
  const minLag = Math.floor(FPS * 60 / 180), maxLag = Math.ceil(FPS * 60 / 80), score = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let f = a + lag; f < b; f++) sum += (on[f] - mean) * (on[f - lag] - mean);
    score[lag] = sum / Math.max(1, b - a - lag);
  }
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 * FPS / lag, pref = Math.exp(-(((bpm - 124) / 40) ** 2)) * 0.35 + 0.65; // gently prefer ~124 BPM
    const v = score[lag] * pref;
    if (v > best) { best = v; bestLag = lag; }
  }
  if (!bestLag) return { bpm: 0, period: 0, firstBeat: musicStart, confidence: 0, musicStart, musicEnd, duration, downbeat: 0, introBeats: 0, outroBeats: 0, loudness: -20, key: null, vocalBars: '', vocalLevel: '', energyBars: '' };
  // Refine to a fractional lag (parabola through the peak).
  const y0 = score[bestLag - 1] || 0, y1 = score[bestLag], y2 = score[bestLag + 1] || 0, den = y0 - 2 * y1 + y2;
  const lag = bestLag + (den !== 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (y0 - y2) / den)) : 0);
  const period = lag / FPS, bpm = 60 / period;
  // Confidence: how far the peak stands out from the typical score.
  let avg = 0, cnt = 0;
  for (let l = minLag; l <= maxLag; l++) { avg += Math.abs(score[l]); cnt++; }
  avg /= cnt;
  const confidence = Math.max(0, Math.min(1, (best / Math.max(1e-9, avg) - 1.2) / 2.5));
  // Lock tempo and phase together, finely, over the whole track: a grid that
  // drifts by even 0.5% would put two kicks audibly apart within a mix.
  const at = (f) => { const i = Math.floor(f), u = f - i; return i < a || i + 1 >= b ? 0 : on[i] * (1 - u) + on[i + 1] * u; };
  let bestLagF = lag, bestPh = 0, bestS = -1;
  const fit = (lagF, ph) => { let sm = 0; for (let f = a + ph; f < b; f += lagF) sm += at(f) + 0.6 * (at(f - 1) + at(f + 1)); return sm; };
  for (let l = lag - 0.8; l <= lag + 0.8; l += 0.05) for (let ph = 0; ph < l; ph += 0.5) { const v = fit(l, ph); if (v > bestS) { bestS = v; bestLagF = l; bestPh = ph; } }
  for (let l = bestLagF - 0.05; l <= bestLagF + 0.05; l += 0.005) for (let ph = bestPh - 0.5; ph <= bestPh + 0.5; ph += 0.1) { if (ph < 0) continue; const v = fit(l, ph); if (v > bestS) { bestS = v; bestLagF = l; bestPh = ph; } }
  const period2 = bestLagF / FPS, bpm2 = 60 / period2;
  // The onset curve marks a kick's attack about half a hop late.
  const firstBeat = Math.max(0, (a + bestPh - 0.5) / FPS);
  // Per-beat energy and bass onsets: bars (the downbeat is where the bass
  // hits hardest every 4 beats), and the quieter intro/outro to mix over.
  const nb = Math.max(0, Math.floor((musicEnd - firstBeat) / period2));
  const be = new Float32Array(nb), bo = new Float32Array(nb);
  for (let k = 0; k < nb; k++) {
    const f0 = Math.round((firstBeat + k * period2) * FPS), f1 = Math.round((firstBeat + (k + 1) * period2) * FPS);
    let e = 0; for (let f = f0; f < f1 && f < n; f++) e += low[f]; be[k] = e / Math.max(1, f1 - f0); // the bass/kick: what makes a section 'full'
    let pk = 0; for (let f = Math.max(0, f0 - 1); f <= f0 + 2 && f < n; f++) pk = Math.max(pk, low[f]); bo[k] = pk;
  }
  let downbeat = 0, dbS = -1;
  for (let p = 0; p < 4; p++) { let sm = 0; for (let k = p; k < nb; k += 4) sm += bo[k] + be[k] * 0.3; if (sm > dbS) { dbS = sm; downbeat = p; } }
  // A section's fullness: the bass energy averaged over a bar (so one accented
  // beat doesn't count), against the track's fullest sections.
  const bar = new Float32Array(nb);
  for (let k = 0; k < nb; k++) { let sm = 0, c = 0; for (let j = Math.max(0, k - 1); j <= Math.min(nb - 1, k + 2); j++) { sm += be[j]; c++; } bar[k] = sm / c; }
  const sortedE = Float32Array.from(bar).sort(), full = sortedE[Math.floor(nb * 0.85)] || 0;
  let introBeats = 0; while (introBeats < nb && bar[introBeats] < full * 0.72) introBeats++;
  let outroBeats = 0; while (outroBeats < nb && bar[nb - 1 - outroBeats] < full * 0.72) outroBeats++;
  // Loudness (dB) over the music, for levelling tracks against each other.
  let sq = 0, cnt2 = 0;
  for (let f = s0; f <= s1 && f < n; f++) { sq += lvl[f] * lvl[f]; cnt2++; }
  const loudness = 20 * Math.log10(Math.sqrt(sq / Math.max(1, cnt2)) + 1e-9);
  // Voice/lead per bar: the 300 Hz - 3 kHz band against the bass (so a
  // louder section alone doesn't count), above the track's quieter bars.
  const vb = [];
  for (let k0 = downbeat; k0 + 4 <= nb; k0 += 4) {
    const f0 = Math.round((firstBeat + k0 * period2) * FPS), f1 = Math.min(n, Math.round((firstBeat + (k0 + 4) * period2) * FPS));
    let m = 0, l = 0; for (let f = f0; f < f1; f++) { m += mid[f]; l += low[f]; }
    vb.push(m / Math.max(1e-6, l * 0.5 + m * 0.5));
  }
  // Syllables: a voice rises and falls several times a second in its band,
  // more than the drums move the bass - the bar's average change in the
  // (log) voice-band level, less some of the bass's.
  const fl = [];
  for (let k0 = downbeat; k0 + 4 <= nb; k0 += 4) {
    const f0 = Math.max(1, Math.round((firstBeat + k0 * period2) * FPS)), f1 = Math.min(n, Math.round((firstBeat + (k0 + 4) * period2) * FPS));
    let fm = 0, fb = 0; for (let f = f0; f < f1; f++) { fm += Math.abs(Math.log(mid[f] + 1e-4) - Math.log(mid[f - 1] + 1e-4)); fb += Math.abs(Math.log(low[f] + 1e-4) - Math.log(low[f - 1] + 1e-4)); }
    fl.push((fm - 0.5 * fb) / Math.max(1, f1 - f0));
  }
  const norm = (arr) => { const s = Float32Array.from(arr).sort(), lo = s[Math.floor(s.length * 0.2)] || 0, hi = s[Math.floor(s.length * 0.92)] || 1; return arr.map((v) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-6, hi - lo)))); };
  const rN = norm(vb), fN = norm(fl);
  const sv = Float32Array.from(vb).sort(), base = sv[Math.floor(sv.length * 0.25)] || 0;
  // How much singing each bar has, 0-9 (a string: one digit a bar).
  const vocalLevel = vb.map((v, j) => Math.round(9 * Math.max(0, Math.min(1, (0.6 * rN[j] + 0.4 * fN[j]) * (v > base * 1.12 ? 1 : 0.4))))).join('');
  const vocalBars = vb.map((v) => (v > base * 1.3 ? '1' : '0')).join('');
  // Energy per bar, 0-9 (same bars as the singing): the overall level and
  // the bass, against the track's loudest bars - quiet intros and
  // breakdowns low, full sections and drops high.
  const eb = [], bb = [];
  for (let k0 = downbeat; k0 + 4 <= nb; k0 += 4) {
    const f0 = Math.round((firstBeat + k0 * period2) * FPS), f1 = Math.min(n, Math.round((firstBeat + (k0 + 4) * period2) * FPS));
    let l = 0, b2 = 0; for (let f = f0; f < f1; f++) { l += lvl[f]; b2 += low[f]; }
    eb.push(l / Math.max(1, f1 - f0)); bb.push(b2 / Math.max(1, f1 - f0));
  }
  const top = (arr) => { const s = Float32Array.from(arr).sort(); return s[Math.floor(s.length * 0.95)] || 1e-6; };
  const tl = top(eb), tb = top(bb);
  const energyBars = eb.map((v, j) => Math.round(9 * Math.max(0, Math.min(1, 0.6 * (v / tl) + 0.4 * (bb[j] / tb)) ** 1.5))).join('');
  // Steady or live: how far the beat wanders from one even grid, section by
  // section (a drum machine stays put; a live drummer drifts).
  const offs = [], lagF = bestLagF;
  for (let w0 = a + bestPh; w0 + 16 * lagF < b; w0 += 16 * lagF) {
    let bs = -1, bo = 0;
    for (let o = -0.3 * lagF; o <= 0.3 * lagF; o += 0.1) { let sm = 0; for (let k = 0; k < 16; k++) sm += at(w0 + o + k * lagF); if (sm > bs) { bs = sm; bo = o; } }
    offs.push(bo / FPS * 1000);
  }
  const mOff = offs.reduce((x, y) => x + y, 0) / Math.max(1, offs.length);
  const drift = Math.sqrt(offs.reduce((x, y) => x + (y - mOff) ** 2, 0) / Math.max(1, offs.length));
  const steady = confidence > 0.35 && drift < 20;
  // How it ends: fading out (the level sliding down over seconds) or a cold
  // stop. fadeStart: where the fade begins (seconds).
  let endKind = 'cold', fadeStart = musicEnd;
  {
    const sec = Math.round(FPS), dbAt = (s) => { let q = 0, c = 0; for (let f = Math.max(0, s - sec); f < Math.min(n, s); f++) { q += lvl[f] * lvl[f]; c++; } return 10 * Math.log10(q / Math.max(1, c) + 1e-12); };
    const endF = s1, from = Math.max(s0, endF - 14 * sec);
    let peak = -999, peakAt = from;
    for (let f = from; f <= endF; f += Math.round(sec / 4)) { const v = dbAt(f); if (v >= peak) { peak = v; peakAt = f; } }
    const last = dbAt(endF);
    if (peak - last >= 9 && (endF - peakAt) >= 3 * sec) { endKind = 'fade'; fadeStart = peakAt / FPS; }
  }
  return { steady, drift: Math.round(drift), endKind, fadeStart, vocalBars, vocalLevel, energyBars, bpm: bpm2, period: period2, firstBeat, confidence, musicStart, musicEnd, duration, downbeat, introBeats, outroBeats, loudness, key: detectKey(x, s0 * HOP, (s1 + 1) * HOP) };
}

// ---- Key: a chroma profile (energy per pitch class, 55 Hz - 2 kHz) matched
// against the Krumhansl major/minor key profiles; Camelot code for mixing.
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const CAMELOT_MAJ = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B']; // C, Db, D...
const CAMELOT_MIN = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A']; // Cm, C#m...
function detectKey(x, from, to) {
  const N = 4096, re = new Float64Array(N), im = new Float64Array(N), chroma = new Float64Array(12), win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
  const binPc = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) { const f = k * RATE / N; if (f >= 55 && f <= 2000) binPc[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; } // A = 9
  const step = Math.max(N, Math.floor((to - from) / 60)); // ~60 frames over the music
  let frames = 0;
  for (let s = from; s + N <= to; s += step) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
    fft(re, im); frames++;
    for (let k = 1; k < N / 2; k++) if (binPc[k] >= 0) chroma[binPc[k]] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  }
  if (!frames) return null;
  const corr = (prof, t) => { let mx = 0, mp = 0; for (let i = 0; i < 12; i++) { mx += chroma[i]; mp += prof[i]; } mx /= 12; mp /= 12; let num = 0, dx = 0, dp = 0; for (let i = 0; i < 12; i++) { const a2 = chroma[(i + t) % 12] - mx, b2 = prof[i] - mp; num += a2 * b2; dx += a2 * a2; dp += b2 * b2; } return num / Math.sqrt(dx * dp + 1e-12); };
  let best = { r: -2 }, second = -2;
  for (let t = 0; t < 12; t++) for (const minor of [false, true]) { const r = corr(minor ? MIN : MAJ, t); if (r > best.r) { second = best.r; best = { r, pc: t, minor }; } else if (r > second) second = r; }
  return { pc: best.pc, minor: best.minor, camelot: (best.minor ? CAMELOT_MIN : CAMELOT_MAJ)[best.pc], conf: Math.max(0, Math.min(1, (best.r - second) * 8 + best.r * 0.5)) };
}

// Camelot wheel distance between two keys (0 same, 1 neighbour or relative).
function keyDistance(a, b) {
  if (!a || !b) return 1;
  const na = parseInt(a.camelot, 10), nb = parseInt(b.camelot, 10), la = a.camelot.slice(-1), lb = b.camelot.slice(-1);
  const d = Math.min((na - nb + 12) % 12, (nb - na + 12) % 12);
  return la === lb ? d : d === 0 ? 1 : d + 1;
}
// The semitone shift (-1, 0, +1) that brings key b closest to key a.
function bestShift(a, b) {
  if (!a || !b || (a.conf || 0) < 0.15 || (b.conf || 0) < 0.15) return 0;
  let best = 0, bd = keyDistance(a, b);
  for (const sft of [-1, 1]) {
    const pc = (b.pc + sft + 12) % 12, k = { pc, minor: b.minor, camelot: (b.minor ? CAMELOT_MIN : CAMELOT_MAJ)[pc] };
    const d = keyDistance(a, k); if (d < bd) { bd = d; best = sft; }
  }
  return best;
}

module.exports = { analyse, RATE, detectKey, keyDistance, bestShift, CAMELOT_MAJ, CAMELOT_MIN };
