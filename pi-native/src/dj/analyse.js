// Auto-DJ track analysis: tempo, beat grid, and where the music really
// starts and ends. Input: the track as mono float samples at RATE (11025 Hz,
// decoded by dj/decode.js). Output (seconds):
//   { bpm, period, firstBeat, confidence 0..1, musicStart, musicEnd, duration }
// How: an onset curve (rises in low-to-mid energy, 23 ms steps), its
// autocorrelation for the tempo (80-180 BPM, preferring the 110-135 range
// dance music sits in, octave errors folded), then the beat phase that lines
// the most onsets up. "Music" is where the level stays above a fraction of
// the track's typical level (skipping spoken intros, silence, fades).
'use strict';

const RATE = 11025, HOP = 256, FPS = RATE / HOP; // ~43 onset frames a second

function onsetCurve(x) {
  const n = Math.floor(x.length / HOP), on = new Float32Array(n), lvl = new Float32Array(n);
  let lp = 0, prev = 0;
  for (let f = 0; f < n; f++) {
    let e = 0, a = 0;
    for (let i = f * HOP, end = i + HOP; i < end; i++) { lp += (x[i] - lp) * 0.12; e += lp * lp; a += x[i] * x[i]; } // ~250 Hz low-pass: kicks and bass
    const le = Math.log(1e-6 + e);
    on[f] = Math.max(0, le - prev); prev = le;
    lvl[f] = Math.sqrt(a / HOP);
  }
  // Subtract a local mean so steady loudness doesn't count as onsets.
  const out = new Float32Array(n), W = 8;
  let s = 0;
  for (let f = 0; f < n; f++) { s += on[f]; if (f >= W) s -= on[f - W]; out[f] = Math.max(0, on[f] - s / Math.min(W, f + 1)); }
  return { on: out, lvl };
}

function analyse(x) {
  const duration = x.length / RATE;
  const { on, lvl } = onsetCurve(x), n = on.length;
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
  if (!bestLag) return { bpm: 0, period: 0, firstBeat: musicStart, confidence: 0, musicStart, musicEnd, duration };
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
  return { bpm: bpm2, period: period2, firstBeat, confidence, musicStart, musicEnd, duration };
}

module.exports = { analyse, RATE };
