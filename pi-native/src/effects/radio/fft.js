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
// BAND_COUNT levels in [0,1], log-spaced across the audible range - the
// industry-standard choice for music visualizers (comparable visual
// weight per octave, rather than per Hz) - the same way effects-core.js's
// readMicSpectrum() bins the AnalyserNode's frequency data, with the same
// fixed treble-boost compensation curve. (A linear/even-Hz-per-bar
// mapping was tried and reverted per a follow-up: "no make it industry
// standard log" - what looked like the sweep "restarting" after ~10 bars
// was actually the log spacing itself, not a bug: many low bands each
// cover a narrow Hz range, so a constant-Hz/sec sweep blows through them
// quickly before slowing down across the wider high bands - the band
// index was moving monotonically the whole time, confirmed directly by
// feeding synthetic tones at increasing frequencies through this exact
// function.)
function computeBands(samples, sampleRate) {
  // *2 zero-padding (not just nextPow2(samples.length)) - a real report:
  // even after capping the analysis range with deliberate headroom past
  // 10kHz, the rightmost several bars stayed permanently dark/unreachable
  // on a 64-bar display. Root cause was the FFT's own resolution, not the
  // range: 2048 real samples only produces ~464 usable bins up to 10kHz,
  // and 256 log-spaced canonical bands need MORE bins than that near the
  // ceiling (each successive band's bin range widens exponentially) -
  // several of the last bands ran out of distinct bins to cover and
  // collapsed onto the exact same boundary bin. Zero-padding to double
  // the FFT size is a standard technique for exactly this (interpolates
  // twice the frequency bins from the same real audio, no added latency
  // - `re`/`im` are already sized `n`, only the first samples.length
  // entries hold real data either way). Verified directly: with this,
  // capping the analysis range at a plain 10000Hz (no extra headroom
  // needed at all) now reaches band 63 - the true last bar - cleanly.
  const n = nextPow2(samples.length) * 2;
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
  // maxBin capped to ~10kHz, not 80% of Nyquist (~17.6kHz at 44.1kHz) - a
  // real report: "songs don't go to the high frequency that the sweep
  // does [...] bars are not representing the sounds correctly". Real
  // music rarely carries meaningful energy above ~8-10kHz (same reasoning
  // that narrowed the debug sweep itself to 40Hz-10kHz - see radio.js's
  // DEBUG_TONES), so the old 80%-of-Nyquist cutoff left the top third or
  // so of the displayed bars almost always dark during real playback -
  // not a bug in the analyser, just a mismatch between the display's
  // range and where real content actually lives. Capping consistently at
  // 10kHz makes the full bar width meaningful for real music instead of
  // reserving space for content that's essentially never there.
  //
  // A 10kHz test tone used to plateau across 7 bars near the boundary
  // (`hi = Math.min(hi, maxBin)` clamping the last several log-spaced
  // bands to the same bin once their computed hi exceeded maxBin), which
  // got "fixed" twice by adding headroom past 10kHz instead of fixing the
  // actual bin-density shortage - first 12000 (fixed the plateau, but
  // left ~6 bars completely unreachable by anything that tops out at
  // 10kHz), then 10500 (fewer dead bars, but still some). The real fix
  // was the *2 zero-padding above, which gives enough bin density that no
  // headroom is needed at all - reverified directly: a 10000Hz tone now
  // reaches band 63 (the true last bar) with a single clean peak.
  // Lowered 10000 -> 7000 -> 6000 -> back to 7000 across three real,
  // explicit requests ("do max of 7khz", then "do max 6khz", then "move
  // back to max 7khz"), applying uniformly to real audio and the debug
  // tools (DEBUG_TONES.sweep's own range narrowed/restored to match each
  // time).
  const minBin = 1, maxBin = Math.max(minBin + 1, Math.min(half - 1, Math.round(7000 / (sampleRate / n))));
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
    // A real report: "the first band is always so much higher than the
    // rest" - real audio naturally has more raw FFT energy at low
    // frequencies (spectral roll-off), and this curve only ever boosted
    // the TREBLE end to compensate, never attenuated the bass end - so
    // band 0 stayed pinned near its ceiling regardless of the treble
    // boost applied further up. freqBalance now ramps from well below 1
    // at the bass end up through 1 around the low-mid range to a treble
    // boost at the top, instead of starting at ~1 (no correction at all)
    // for band 0. A follow-up report ("first 5 bars need reducing a bit
    // more so auto gain works better") - the previous linear ramp still
    // left the first few bands too close to 1 (frac 0.016-0.078 only
    // scaled to ~0.38-0.49). Using frac's exponent (1.4) instead of frac
    // itself steepens the curve specifically near the bass end (band 0-5
    // now scale to roughly 0.2-0.25) while barely changing the treble end
    // (frac=1 is still 2.1 either way).
    const freqBalance = 0.2 + Math.pow(frac, 1.4) * 1.9;
    bands[b] = Math.min(1, norm * freqBalance);
    lo = hi + 1;
    if (lo > maxBin) lo = maxBin;
  }
  return bands;
}

module.exports = { fft, computeBands, BAND_COUNT, nextPow2 };
