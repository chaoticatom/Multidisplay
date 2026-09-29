// Music features for any effect: bass / mid / treble / overall level (0..1)
// and a beat pulse (jumps to 1 on a detected kick, decays to 0), computed
// once per tick from the radio's live spectrum. tick.js puts them on
// core.audio for every effect, and uses them for the "React to music"
// option (see applyMusicReact below) so every effect can pulse with the
// music without effect-specific code.
'use strict';

const { F_MIN, F_MAX, BAND_COUNT } = require('./radio/fft');

// Canonical band index for a frequency (bands are log-spaced F_MIN..F_MAX).
const bandFor = (hz) => Math.max(0, Math.min(BAND_COUNT - 1, Math.round((BAND_COUNT * Math.log(hz / F_MIN)) / Math.log(F_MAX / F_MIN))));
const BASS_END = bandFor(150);
const MID_END = bandFor(2000);

function mean(arr, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += arr[i];
  return b > a ? s / (b - a) : 0;
}

function createFeatureState() {
  return { level: 0, bass: 0, mid: 0, treble: 0, beat: 0, active: false, bassSlow: 0, sinceBeat: 1 };
}

// spec: the radio's smoothed 256-band spectrum (0..1), or null when no
// radio audio is available. Updates and returns `st`.
function updateFeatures(st, spec, dt) {
  if (!spec) spec = null;
  const bass = spec ? mean(spec, 0, BASS_END) : 0;
  const mid = spec ? mean(spec, BASS_END, MID_END) : 0;
  const treble = spec ? mean(spec, MID_END, BAND_COUNT) : 0;
  st.bass = bass; st.mid = mid; st.treble = treble;
  st.level = (bass * 1.2 + mid + treble * 0.8) / 3;
  const wasActive = st.active;
  st.active = st.level > 0.02;
  // Seed the slow average when music starts, or the first half-second of
  // any loud passage reads as a stream of kicks against an average of 0.
  if (st.active && !wasActive) st.bassSlow = bass;

  // Beat: bass jumps clearly above its own recent average (a kick), with a
  // short refractory period so one kick doesn't fire several beats.
  st.sinceBeat += dt;
  if (st.active && bass > 0.25 && bass > st.bassSlow * 1.25 && st.sinceBeat > 0.22) {
    st.beat = 1;
    st.sinceBeat = 0;
  } else {
    st.beat *= Math.exp(-dt * 7);
  }
  st.bassSlow += (bass - st.bassSlow) * Math.min(1, dt * 2.5);
  return st;
}

// "React to music": effects run faster on bass and loud passages, and the
// frame brightness breathes with the level and flashes on beats.
// amount 0..1. Returns the effective dt for this frame; call
// pulseBuffer() after the effect has drawn.
function reactDt(f, dt, amount) {
  if (!f.active || amount <= 0) return dt;
  return dt * (1 + amount * (f.bass * 1.2 + f.beat * 0.8));
}

function pulseBuffer(f, buf, amount) {
  if (!f.active || amount <= 0 || !buf) return;
  const k = Math.max(0.2, Math.min(1.6, 1 - 0.45 * amount + amount * (0.45 * Math.min(1, f.level * 1.4) + 0.35 * f.beat)));
  if (Math.abs(k - 1) < 0.005) return;
  for (let i = 0; i < buf.length; i++) buf[i] *= k;
}

module.exports = { createFeatureState, updateFeatures, reactDt, pulseBuffer, BASS_END, MID_END };
