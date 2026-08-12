// Real PCM spectrum analysis - a small radix-2 Cooley-Tukey FFT plus a
// log-spaced band aggregation step, mirroring effects-core.js's
// readMicSpectrum() (log-spaced bins, finer resolution at the bass end,
// a fixed treble-compensation curve) but driven by an actual decoded PCM
// buffer instead of the Web Audio API's AnalyserNode. Doesn't need to be
// broadcast-quality - this drives a 64-pixel LED visualizer, not audio
// production, per the task brief - so a plain non-windowed radix-2 FFT
// (input padded/truncated to the next power of two) is a deliberate,
// documented simplification over a proper windowed/overlapped analyser.
'use strict';

const BAND_COUNT = 256; // matches effects-core.js's AUDIO_BANDS - canonical resolution; spectrum.js re-samples this down for smaller displayed band counts

// In-place iterative radix-2 FFT. `re`/`im` are Float32Arrays of length n
// (a power of two). Standard bit-reversal + butterfly implementation.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curWr - im[i + k + len / 2] * curWi;
        const vIm = re[i + k + len / 2] * curWi + im[i + k + len / 2] * curWr;
        re[i + k] = uRe + vRe; im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe; im[i + k + len / 2] = uIm - vIm;
        const nWr = curWr * wr - curWi * wi;
        curWi = curWr * wi + curWi * wr;
        curWr = nWr;
      }
    }
  }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// samples: Float32Array of mono PCM in [-1,1]. Returns a Float32Array of
// BAND_COUNT levels in [0,1], log-spaced across the audible range the same
// way effects-core.js's readMicSpectrum() bins the AnalyserNode's
// frequency data, with the same fixed treble-boost compensation curve.
function computeBands(samples, sampleRate) {
  const n = nextPow2(samples.length);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  // Simple Hann window - cheap and meaningfully reduces spectral leakage
  // for a non-overlapped single-shot FFT like this one.
  for (let i = 0; i < samples.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (samples.length - 1));
    re[i] = samples[i] * w;
  }
  fft(re, im);

  const half = n >> 1;
  const mag = new Float32Array(half);
  let maxMag = 0;
  for (let i = 0; i < half; i++) {
    const m = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
    mag[i] = m;
    if (m > maxMag) maxMag = m;
  }

  const bands = new Float32Array(BAND_COUNT);
  const minBin = 1, maxBin = half - 1;
  let lo = minBin;
  for (let b = 0; b < BAND_COUNT; b++) {
    const frac = (b + 1) / BAND_COUNT;
    let hi = Math.round(minBin * Math.pow(maxBin / minBin, frac));
    if (hi <= lo) hi = lo + 1;
    hi = Math.min(hi, maxBin);
    let sum = 0, count = 0;
    for (let k = lo; k <= hi; k++) { sum += mag[k]; count++; }
    const raw = count > 0 ? sum / count : 0;
    // Normalize against a fixed reference amplitude rather than the
    // frame's own max (a per-frame max would make quiet passages look as
    // "loud" as loud ones) - 0.05 is an empirically reasonable ceiling for
    // Hann-windowed FFT bin magnitude of typical compressed-stream audio.
    const norm = Math.min(1, raw / 0.05);
    const trebleBoost = 1 + frac * 1.8;
    bands[b] = Math.min(1, norm * trebleBoost);
    lo = hi + 1;
    if (lo > maxBin) lo = maxBin;
  }
  return bands;
}

module.exports = { fft, computeBands, BAND_COUNT, nextPow2 };
