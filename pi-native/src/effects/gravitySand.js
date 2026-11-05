// Gravity Sand: coloured sand pours from three spouts that wander back and
// forth (each its own family of colours, shifting in bands), piling up in
// striped dunes that slide and settle.
// piling up in striped dunes. Each grain is shaded - grains on the surface
// catch the light from above, buried ones sit in shadow - so the heap reads
// as a 3D pile. When the box is nearly full a gap opens in the floor and it
// all drains away, then the pouring starts again with new colours. On the
// cube it's one box wrapped round the four sides - sand slides from one face
// onto the next; fills a flat panel.
'use strict';
const { defineCanvasEffect, topPlot, fillTop } = require('./canvas');
const { hsl } = require('../core');

const st = { W: 0, H: 0, g: null, col: null, phase: 'pour', hue: Math.random(), spouts: [{ x: 0.2, d: 1, s: 0.11 }, { x: 0.5, d: -1, s: 0.16 }, { x: 0.8, d: 1, s: 0.08 }], acc: 0, drainT: 0 };

function reset(W, H) {
  st.W = W; st.H = H; st.g = new Uint8Array(W * H); st.col = new Float32Array(W * H * 3);
  st.phase = 'pour'; st.hue = Math.random(); st.drainT = 0;
}

// The cube's top: a hopper glowing in the middle pours sand outwards along
// a stream to each spout, which feeds the sides (moving out, the way the
// sand goes - a mirror of the sides ran it inwards).
function sandTop(core, face, t) {
  if (face !== 4) { fillTop(core, 0, 0, 0, face); return; }
  const S = core.SIZE, half = S / 2, W = st.W || S * 4;
  fillTop(core, 0.012, 0.012, 0.016);
  const plot = topPlot(core, S, true);
  for (let x = 0; x < W; x++) for (let d = half - 4; d < half; d++) { const k = 0.06 + 0.05 * (d - half + 4); plot(x, -d, k * 1.1, k * 0.9, k * 0.6); } // the hopper
  if (st.phase !== 'pour') return;
  st.spouts.forEach((sp, si) => {
    const x = sp.x * (W - 1), [r, g, b] = hsl((Math.floor(t / 4) * 0.13 + st.hue + si * 0.33) % 1, 0.75, 0.5);
    for (let d = 0; d < half - 3; d++) {
      const flow = ((((d / (half - 3)) - t * 1.4) % 1) + 1) % 1, k = 0.35 + 0.65 * (flow < 0.5 ? 1 : 0.5); // grains running outwards
      plot(x, -(half - 4 - d), r * k, g * k, b * k);
    }
  });
}

module.exports = defineCanvasEffect({
  panorama: true,
  caps: sandTop,
  render(c, { t, dt }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H || !st.g) {
      reset(W, H);
      // One spout per face's worth of width (at least three).
      const n = Math.max(3, Math.round(W / H * 1.5));
      st.spouts = Array.from({ length: n }, (_, i) => ({ x: (i + 0.5) / n, d: i & 1 ? -1 : 1, s: 0.03 + Math.random() * 0.05 }));
    }
    const wrap = !!c.wrap, wx = (x) => (wrap ? (x + W) % W : x);
    const { g, col } = st;
    // Pour: a few grains per frame from the moving spout, colour drifting in bands.
    if (st.phase === 'pour') {
      for (const sp of st.spouts) {
        sp.x += sp.d * dt * sp.s;
        if (wrap) sp.x = (sp.x + 1) % 1; else if (sp.x > 0.92 || sp.x < 0.08) sp.d *= -1;
      }
      st.acc += dt * W * 3; // grains per second scale with the width
      for (; st.acc >= 1; st.acc--) {
        const si = Math.floor(Math.random() * st.spouts.length), sx = Math.round(st.spouts[si].x * (W - 1));
        const jx = sx + Math.round((Math.random() - 0.5) * 2), x = wrap ? wx(jx) : Math.max(0, Math.min(W - 1, jx));
        if (!g[x]) {
          g[x] = 1;
          const band = Math.floor(t / 4) * 0.13 + st.hue + si * 0.33;
          const [r, gg, b] = hsl((band + (Math.random() - 0.5) * 0.03) % 1, 0.75, 0.42 + Math.random() * 0.14);
          col[x * 3] = r; col[x * 3 + 1] = gg; col[x * 3 + 2] = b;
        }
      }
    }
    // Physics: bottom-up, grains fall straight down, else slide diagonally.
    const steps = Math.max(1, Math.round(dt * 90));
    // The drain opens wider as it runs, so the box empties in a few seconds.
    const open = st.phase === 'drain' ? Math.min(0.5, 0.1 + st.drainT * 0.08) : 0.1;
    // The hole is in the middle of each face's floor (of the panel on a wall).
    const span = wrap ? H : W, holeL = Math.floor(span * (0.5 - open)), holeR = Math.ceil(span * (0.5 + open));
    for (let s = 0; s < steps; s++) {
      for (let y = H - 1; y >= 0; y--) {
        const ltr = (y + s) & 1;
        for (let i = 0; i < W; i++) {
          const x = ltr ? i : W - 1 - i, p = y * W + x;
          if (!g[p]) continue;
          if (y === H - 1) {
            const hx = x % span;
            if (st.phase === 'drain' && hx >= holeL && hx < holeR) g[p] = 0; // falls out
            continue;
          }
          const move = (q) => { g[q] = 1; g[p] = 0; col[q * 3] = col[p * 3]; col[q * 3 + 1] = col[p * 3 + 1]; col[q * 3 + 2] = col[p * 3 + 2]; };
          const below = p + W;
          if (!g[below]) { move(below); continue; }
          const d1 = Math.random() < 0.5 ? -1 : 1;
          for (const d of [d1, -d1]) {
            const nx = wx(x + d);
            if (nx >= 0 && nx < W && !g[(y + 1) * W + nx] && !g[y * W + nx]) { move((y + 1) * W + nx); break; }
          }
        }
      }
    }
    // Fill level decides when to drain and when to start again.
    let n = 0; for (let i = 0; i < g.length; i++) n += g[i];
    if (st.phase === 'pour' && n > W * H * 0.55) { st.phase = 'drain'; st.drainT = 0; }
    if (st.phase === 'drain') { st.drainT += dt; if (n === 0 || st.drainT > 25) { st.phase = 'pour'; st.hue = Math.random(); } }
    // Draw: dark box, grains lit from above.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!g[p]) { const v = 0.015 + (y / H) * 0.02; c.set(x, y, v * 0.8, v * 0.8, v * 1.1); continue; }
      // How deep under the surface: count grains straight above (up to 4).
      let depth = 0; for (let k = 1; k <= 4 && y - k >= 0 && g[p - k * W]; k++) depth++;
      const l = wx(x - 1), r = wx(x + 1);
      const top = depth === 0, sideL = l >= 0 && !g[y * W + l], sideR = r < W && !g[y * W + r];
      let sh = 1.0 - depth * 0.13;
      if (top) sh = 1.35; else if (sideL) sh += 0.12; else if (sideR) sh -= 0.12;
      const grit = 0.92 + 0.16 * ((x * 13 + y * 7) % 5) / 4;
      c.set(x, y, Math.min(1, col[p * 3] * sh * grit), Math.min(1, col[p * 3 + 1] * sh * grit), Math.min(1, col[p * 3 + 2] * sh * grit));
    }
    // The falling stream from the spout.
    if (st.phase === 'pour') for (const sp of st.spouts) { const sx = Math.round(sp.x * (W - 1)); c.set(sx, 0, 0.95, 0.9, 0.75); c.set(sx, 1, 0.7, 0.65, 0.5); c.set(sx, 2, 0.4, 0.37, 0.3); }
  },
});
