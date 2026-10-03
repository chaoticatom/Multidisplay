// The Waveform style: a real oscilloscope of the sound (ctx.wave - the
// actual audio, see ffmpegAudio.js's _updateWave), drawn as a continuous
// glowing trace over a faint graticule, with phosphor-style persistence.
// Shared by the cube (wrapped round the side faces) and flat panels.
//   c = { W, H, get(x,y)->[r,g,b], set(x,y,r,g,b) } with y counted UP.
'use strict';
const { hsl } = require('../../core');

function drawScope(c, wave, t) {
  const { W, H } = c, mid = (H - 1) / 2, amp = (H - 1) * 0.45;
  // Graticule: faint dots on an 8 x 4 grid, plus the centre line.
  const gx = Math.max(4, Math.round(W / 8)), gy = Math.max(4, Math.round(H / 4));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const onGrid = (x % gx === 0 && y % 2 === 0) || (y % gy === 0 && x % 2 === 0) || (Math.round(mid) === y && x % 4 === 0);
    if (onGrid) lift(c, x, y, 0.02, 0.06, 0.04);
  }
  if (!wave) return;
  const N = wave.length;
  let prev = null;
  for (let x = 0; x < W; x++) {
    const f = (x * (N - 1)) / Math.max(1, W - 1), i = Math.floor(f), fr = f - i;
    const v = i + 1 < N ? wave[i] + (wave[i + 1] - wave[i]) * fr : wave[N - 1];
    const y = mid + v * amp;
    // Colour: cyan near the centre, through violet to hot pink at the peaks.
    const [r, g, b] = hsl(0.52 + Math.min(1, Math.abs(v)) * 0.38 + Math.sin(t * 0.2) * 0.03, 1, 0.55);
    // Join to the previous column so steep edges stay a solid line.
    const y0 = prev === null ? y : prev, lo = Math.round(Math.min(y0, y)), hi = Math.round(Math.max(y0, y));
    for (let yy = lo; yy <= hi; yy++) {
      lift(c, x, yy, Math.min(1, r * 0.6 + 0.45), Math.min(1, g * 0.6 + 0.45), Math.min(1, b * 0.6 + 0.45)); // white-hot core
      for (let d = 1; d <= 3; d++) {
        const k = [0, 0.45, 0.18, 0.07][d];
        lift(c, x, yy + d, r * k, g * k, b * k); lift(c, x, yy - d, r * k, g * k, b * k);
      }
    }
    prev = y;
  }
}
function lift(c, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= c.W || y >= c.H) return;
  const o = c.get(x, y);
  if (!o) return;
  c.set(x, y, Math.max(o[0], r), Math.max(o[1], g), Math.max(o[2], b));
}

module.exports = { drawScope };
