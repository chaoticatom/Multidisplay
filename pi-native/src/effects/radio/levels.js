// Per-frame display levels for the spectrum renderers, shared by the cube
// (radio.js) and wall (radioWall.js) front-ends - this chain (re-sample to
// the displayed band count -> gain x auto-gain x fit-to-screen -> soft
// ceiling -> neighbour bloom) used to be duplicated in both, and evaluated
// through closures for EVERY pixel that asked for a band's level (several
// thousand times a frame at 60Hz). Now it runs once per frame into two
// arrays and the renderers just index them.
'use strict';

// Re-samples the canonical 256-band log spectrum down to `bands` display
// bands, taking the MAX across the contiguous range of canonical bands each
// displayed bar represents, so no band's peak falls through a gap (see
// radio.js's history for the reports behind this).
function sample(arr, b, bands, total = arr.length) {
  if (bands <= 1) return arr[total - 1];
  // More bars than measured bands (e.g. 384 across a 6-panel wall): blend
  // the two nearest bands so neighbouring bars change smoothly.
  if (bands > total) {
    const x = (b * (total - 1)) / (bands - 1), i = Math.floor(x), f = x - i;
    return i + 1 < total ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[total - 1];
  }
  const start = Math.floor((b * total) / bands);
  const end = b === bands - 1 ? total - 1 : Math.floor(((b + 1) * total) / bands) - 1;
  let v = arr[start];
  for (let i = start + 1; i <= end; i++) if (arr[i] > v) v = arr[i];
  return v;
}

// Values above KNEE are compressed smoothly toward 1 instead of being hard
// clipped - loud passages keep some shape at the top instead of every bar
// flat-lining against the ceiling.
const KNEE = 0.85;
function softCeil(x) {
  if (x <= KNEE) return x < 0 ? 0 : x;
  return KNEE + (1 - KNEE) * (1 - Math.exp(-(x - KNEE) / (1 - KNEE)));
}

function createLevelState() {
  return { autoGainMult: 1, levelSmoothed: 0, fitScale: 1, amp: new Float32Array(0), peak: new Float32Array(0), rawAmp: new Float32Array(0), rawPeak: new Float32Array(0) };
}

// Auto-gain: a slow multiplier steering the AVERAGE band level toward
// AUTO_TARGET (average, not max - one persistently loud bass band used to
// crush every other band). Deliberately slow (settles over several seconds,
// a real request); bar motion itself stays fast.
const AUTO_TARGET = 0.45;

// opts: { bands, gain, autoGain, fitToScreen }. Returns the state, whose
// .amp / .peak Float32Arrays (length `bands`) hold this frame's levels.
function computeLevels(st, audio, opts, dt) {
  const { bands, gain } = opts;
  if (st.amp.length !== bands) {
    st.amp = new Float32Array(bands); st.peak = new Float32Array(bands);
    st.rawAmp = new Float32Array(bands); st.rawPeak = new Float32Array(bands);
  }
  const total = audio.spec.length;
  let sum = 0;
  for (let b = 0; b < bands; b++) {
    st.rawAmp[b] = sample(audio.spec, b, bands, total);
    st.rawPeak[b] = sample(audio.peak, b, bands, total);
    sum += st.rawAmp[b];
  }
  st.levelSmoothed += (sum / bands - st.levelSmoothed) * Math.min(1, dt * 3);
  if (opts.autoGain) {
    if (st.levelSmoothed > 0.01) {
      const desired = AUTO_TARGET / Math.max(0.05, st.levelSmoothed * gain);
      st.autoGainMult += (desired - st.autoGainMult) * Math.min(1, dt * 0.2);
      st.autoGainMult = Math.max(0.3, Math.min(10, st.autoGainMult));
    }
  } else {
    st.autoGainMult = 1;
  }
  let g = gain * st.autoGainMult;

  // Fit to Screen: scale so the loudest band reaches (just under) the top,
  // eased over time (dt-based, so it behaves the same at any frame rate).
  if (opts.fitToScreen) {
    let mx = 0;
    for (let b = 0; b < bands; b++) if (st.rawAmp[b] * g > mx) mx = st.rawAmp[b] * g;
    const target = mx > 0.015 ? Math.min(3.5, 0.99 / mx) : st.fitScale;
    st.fitScale += (target - st.fitScale) * Math.min(1, dt * 4);
  } else {
    st.fitScale = 1;
  }
  g *= st.fitScale;

  for (let b = 0; b < bands; b++) { st.rawAmp[b] = softCeil(st.rawAmp[b] * g); st.rawPeak[b] = softCeil(st.rawPeak[b] * g); }
  // Display-only bloom onto each bar's neighbours (a real request: a tone
  // between two bands should still visibly light the bars either side).
  for (let b = 0; b < bands; b++) {
    let a = st.rawAmp[b], p = st.rawPeak[b];
    if (b > 0) { a = Math.max(a, st.rawAmp[b - 1] * 0.5); p = Math.max(p, st.rawPeak[b - 1] * 0.5); }
    if (b < bands - 1) { a = Math.max(a, st.rawAmp[b + 1] * 0.5); p = Math.max(p, st.rawPeak[b + 1] * 0.5); }
    st.amp[b] = a; st.peak[b] = Math.max(a, p);
  }
  return st;
}

module.exports = { sample, softCeil, createLevelState, computeLevels };
