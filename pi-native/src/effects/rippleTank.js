// Liquid Crystal: looking down into a shallow pool. Drops fall at random
// (and on the beat), sending out rings that spread, reflect off the sides
// and interfere. The water bends the view of a colourful pebble floor
// beneath it and catches the light in bright glints on every ripple. A
// real 2D wave simulation, lit as a 3D surface. Same on every cube side
// face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');
const { lit } = require('./shade');

const st = { W: 0, H: 0, a: null, b: null, acc: 0, drop: 0.3, floorImg: null, pad: 8 };
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// Pebble floor: cells of rounded stones in muted colours.
function floor(x, y, t) {
  const sc = 0.11, gx = x * sc, gy = y * sc, ix = Math.floor(gx), iy = Math.floor(gy);
  let best = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i + hash(ix + i, iy + j), cy = iy + j + hash(iy + j, ix + i), d = Math.hypot(gx - cx, gy - cy);
    if (d < best) { best = d; id = (ix + i) * 31 + (iy + j) * 17; }
  }
  const hue = (hash(id, 3) * 0.25 + 0.45 + t * 0.01) % 1;
  return hsl(hue, 0.55, 0.12 + 0.28 * Math.max(0, 1 - best * 1.6));
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H) {
      st.W = W; st.H = H; st.a = new Float32Array(W * H); st.b = new Float32Array(W * H);
      // The pebble floor doesn't change: draw it once (with a margin for the
      // refraction offset) and just look it up per pixel.
      const P = st.pad, FW = W + 2 * P, FH = H + 2 * P;
      st.floorImg = new Float32Array(FW * FH * 3);
      for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const c0 = floor(x - P, y - P, 0), o = (y * FW + x) * 3; st.floorImg[o] = c0[0]; st.floorImg[o + 1] = c0[1]; st.floorImg[o + 2] = c0[2]; }
    }
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    if ((st.drop -= dt) <= 0 || (beat > 0.8 && Math.random() < 0.25)) {
      st.drop = 0.4 + Math.random() * 1.2;
      const x0 = 2 + Math.floor(Math.random() * (W - 4)), y0 = 2 + Math.floor(Math.random() * (H - 4));
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) st.a[(y0 + j) * W + x0 + i] -= (i || j) ? 2.5 : 5;
    }
    // Wave equation steps at a fixed rate.
    st.acc += dt;
    while (st.acc > 1 / 60) {
      st.acc -= 1 / 60;
      const { a, b } = st;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        b[p] = ((a[p - 1] + a[p + 1] + a[p - W] + a[p + W]) * 0.5 - b[p]) * 0.985;
      }
      st.a = b; st.b = a;
    }
    const h = st.a;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const dhx = (x > 0 && x < W - 1) ? (h[p + 1] - h[p - 1]) * 0.5 : 0, dhy = (y > 0 && y < H - 1) ? (h[p + W] - h[p - W]) * 0.5 : 0;
      // Refraction: look at the floor through the slope of the water.
      const P = st.pad, FW = W + 2 * P;
      const fx = Math.max(0, Math.min(FW - 1, Math.round(x + P + dhx * 5))), fy = Math.max(0, Math.min(H + 2 * P - 1, Math.round(y + P + dhy * 5)));
      const fo = (fy * FW + fx) * 3, col = [st.floorImg[fo], st.floorImg[fo + 1], st.floorImg[fo + 2]];
      const deep = [col[0] * 0.85, col[1] * 0.95 + 0.02, col[2] + 0.05];
      const out = lit(deep, dhx, dhy, { bump: 1.6, gloss: 40, shine: 0.9, ambient: 0.75 });
      c.set(x, y, out[0], out[1], out[2]);
    }
  },
});
