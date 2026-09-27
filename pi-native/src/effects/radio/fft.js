// Spectrum analysis for the radio visualizer: a radix-2 FFT plus a
// log-spaced band mapping, returning BAND_COUNT levels in 0..1.
//
// Redone for quality and speed (a request to "redo the spectrum analyser,
// correct any issues and make it look amazing and fast"). What changed and
// why:
//   - Levels are on a DECIBEL scale (DB_FLOOR..DB_CEIL mapped to 0..1).
//     Linear magnitude against a fixed reference made quiet detail vanish
//     and loud passages flatten against the top, leaving auto-gain to do
//     all the work. dB is what real analysers show: every band moves.
//   - A treble tilt (TILT_DB_PER_OCTAVE, pivoting at 1kHz) replaces the old
//     hand-tuned bass-cut/treble-boost curve. Music's energy falls roughly
//     3-4.5dB per octave, so this flattens typical music the same way.
//   - Range 30Hz-7kHz. It used to start at FFT bin 1 (~10Hz, sub-audible
//     rumble), wasting the leftmost bars. 7kHz is the ceiling asked for
//     earlier ("move back to max 7khz"), kept.
//   - Narrow bass bands (less than one FFT bin wide) interpolate the
//     spectrum at their centre frequency instead of several bands
//     collapsing onto the same bin (a blocky staircase at the left).
//     Wider bands take their LOUDEST bin, not the mean, so treble
//     transients aren't averaged away.
//   - Everything is precomputed once per (window, sampleRate): the Hann
//     window, twiddle factors, bit-reversal table and each band's bin
//     range. analyse() allocates nothing, so it can run 60 times a second.
//
// The main window is WINDOW real samples (46ms at 44.1kHz; bass bands use
// twice that, see BASS_SPLIT_HZ), zero-padded 2x -
// the padding interpolates extra frequency bins so the densely packed top
// bands each still get distinct bins (see git history for that report).
'use strict';

const BAND_COUNT = 256; // canonical resolution; radio.js re-samples to the displayed band count
const WINDOW = 2048;
const F_MIN = 30;
const F_MAX = 7000;
const DB_FLOOR = -72; // at or below this -> 0
const DB_CEIL = -12; // at or above this -> 1 (a full-scale sine is 0dB)
const TILT_DB_PER_OCTAVE = 3.5;

// In-place iterative radix-2 FFT (kept exported: tests use it directly).
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
    const halfLen = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curWr = 1, curWi = 0;
      for (let k = 0; k < halfLen; k++) {
        const a = i + k, b = a + halfLen;
        const vRe = re[b] * curWr - im[b] * curWi;
        const vIm = re[b] * curWi + im[b] * curWr;
        re[b] = re[a] - vRe; im[b] = im[a] - vIm;
        re[a] += vRe; im[a] += vIm;
        const nWr = curWr * wr - curWi * wi;
        curWi = curWr * wi + curWi * wr;
        curWr = nWr;
      }
    }
  }
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// One FFT "stage": a window length and everything precomputed for it.
// fill() windows the `win` samples ending at ring index `end`, runs the
// FFT and leaves the normalised power spectrum in stage.power (full-scale
// sine = 1).
function makeStage(sampleRate, win) {
  const n = nextPow2(win) * 2; // 2x zero-padding for bin density
  const half = n >> 1;
  const re = new Float32Array(n), im = new Float32Array(n);
  const power = new Float32Array(half);
  const hann = new Float32Array(win);
  let hannSum = 0;
  for (let i = 0; i < win; i++) { hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)); hannSum += hann[i]; }
  // A full-scale sine's peak bin magnitude is amplitude * sum(window) / 2.
  const refPow = (hannSum / 2) * (hannSum / 2);
  function fill(ring, end) {
    const mask = ring.length - 1, start = end - win;
    for (let i = 0; i < win; i++) { re[i] = ring[(start + i) & mask] * hann[i]; im[i] = 0; }
    for (let i = win; i < n; i++) { re[i] = 0; im[i] = 0; }
    fft(re, im);
    for (let i = 0; i < half; i++) power[i] = (re[i] * re[i] + im[i] * im[i]) / refPow;
  }
  return { win, half, binHz: sampleRate / n, power, fill };
}

// Below this, bands use the long window: a 46ms window can only resolve
// ~21Hz, so on a log scale one bass note smeared across a quarter of the
// display. The longer window resolves bass 2x finer; treble keeps the
// short window so it stays snappy (bass notes are slow anyway).
const BASS_SPLIT_HZ = 250;

// Builds a reusable analyser. analyse(ring, end) reads the samples ending
// just before index `end` of `ring` (a power-of-two-sized circular
// Float32Array of mono samples in -1..1) and returns a
// Float32Array(BAND_COUNT) that it reuses on every call.
function createAnalyser(sampleRate, win = WINDOW) {
  const short = makeStage(sampleRate, win);
  const long = makeStage(sampleRate, win * 2);
  const out = new Float32Array(BAND_COUNT);

  // Per band: which stage, fractional bin range [lo, hi) in that stage,
  // and its tilt in dB.
  const bStage = new Array(BAND_COUNT), bLo = new Float32Array(BAND_COUNT), bHi = new Float32Array(BAND_COUNT), bTilt = new Float32Array(BAND_COUNT);
  const fMax = Math.min(F_MAX, sampleRate / 2 - short.binHz);
  for (let b = 0; b < BAND_COUNT; b++) {
    const f0 = F_MIN * Math.pow(fMax / F_MIN, b / BAND_COUNT);
    const f1 = F_MIN * Math.pow(fMax / F_MIN, (b + 1) / BAND_COUNT);
    const fc = Math.sqrt(f0 * f1);
    const st = fc < BASS_SPLIT_HZ ? long : short;
    bStage[b] = st;
    bLo[b] = f0 / st.binHz; bHi[b] = f1 / st.binHz;
    bTilt[b] = TILT_DB_PER_OCTAVE * Math.log2(fc / 1000);
  }
  const dbRange = DB_CEIL - DB_FLOOR;

  function analyse(ring, end) {
    short.fill(ring, end);
    long.fill(ring, end);
    for (let b = 0; b < BAND_COUNT; b++) {
      const st = bStage[b], power = st.power, lo = bLo[b], hi = bHi[b];
      let p;
      if (hi - lo < 1) {
        // Narrower than one bin: interpolate at the band's centre.
        const c = (lo + hi) / 2, k = Math.floor(c), f = c - k;
        p = power[k] * (1 - f) + power[Math.min(st.half - 1, k + 1)] * f;
      } else {
        p = 0;
        const k1 = Math.min(st.half - 1, Math.ceil(hi));
        for (let k = Math.floor(lo); k < k1; k++) if (power[k] > p) p = power[k];
      }
      const db = p > 1e-12 ? 10 * Math.log10(p) + bTilt[b] : -Infinity;
      const v = (db - DB_FLOOR) / dbRange;
      out[b] = v <= 0 ? 0 : v >= 1 ? 1 : v;
    }
    return out;
  }
  // Samples the analyser needs in the ring behind `end`.
  return { analyse, win: long.win, sampleRate };
}

// One-shot convenience wrapper (tests, and anything that has a plain
// buffer rather than a ring): analyses the last WINDOW samples of
// `samples`. Returns a fresh array.
const _cache = new Map();
function computeBands(samples, sampleRate) {
  const key = String(sampleRate);
  let a = _cache.get(key);
  if (!a) { a = createAnalyser(sampleRate); _cache.set(key, a); }
  // Short inputs are treated as preceded by silence.
  const ring = new Float32Array(nextPow2(Math.max(a.win, samples.length)));
  ring.set(samples);
  return Float32Array.from(a.analyse(ring, samples.length));
}

module.exports = { fft, computeBands, createAnalyser, BAND_COUNT, WINDOW, nextPow2, F_MIN, F_MAX };
