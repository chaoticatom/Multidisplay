// Gravity Sand: coloured sand pours from three spouts that wander back and
// forth (each its own family of colours, shifting in bands), piling up in
// striped dunes that slide and settle.
// piling up in striped dunes. Each grain is shaded - grains on the surface
// catch the light from above, buried ones sit in shadow - so the heap reads
// as a 3D pile. When the box is nearly full a gap opens in the floor and it
// all drains away, then the pouring starts again with new colours. Same on
// every cube side face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');

const st = { W: 0, H: 0, g: null, col: null, phase: 'pour', hue: Math.random(), spouts: [{ x: 0.2, d: 1, s: 0.11 }, { x: 0.5, d: -1, s: 0.16 }, { x: 0.8, d: 1, s: 0.08 }], acc: 0, drainT: 0 };

function reset(W, H) {
  st.W = W; st.H = H; st.g = new Uint8Array(W * H); st.col = new Float32Array(W * H * 3);
  st.phase = 'pour'; st.hue = Math.random(); st.drainT = 0;
}

module.exports = defineCanvasEffect({
  render(c, { t, dt }) {
    const W = c.W, H = c.H;
    if (st.W !== W || st.H !== H || !st.g) reset(W, H);
    const { g, col } = st;
    // Pour: a few grains per frame from the moving spout, colour drifting in bands.
    if (st.phase === 'pour') {
      for (const sp of st.spouts) { sp.x += sp.d * dt * sp.s; if (sp.x > 0.92 || sp.x < 0.08) sp.d *= -1; }
      st.acc += dt * W * 3; // grains per second scale with the width
      for (; st.acc >= 1; st.acc--) {
        const si = Math.floor(Math.random() * st.spouts.length), sx = Math.round(st.spouts[si].x * (W - 1));
        const x = Math.max(0, Math.min(W - 1, sx + Math.round((Math.random() - 0.5) * 2)));
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
    const holeL = Math.floor(W * (0.5 - open)), holeR = Math.ceil(W * (0.5 + open));
    for (let s = 0; s < steps; s++) {
      for (let y = H - 1; y >= 0; y--) {
        const ltr = (y + s) & 1;
        for (let i = 0; i < W; i++) {
          const x = ltr ? i : W - 1 - i, p = y * W + x;
          if (!g[p]) continue;
          if (y === H - 1) {
            if (st.phase === 'drain' && x >= holeL && x < holeR) g[p] = 0; // falls out
            continue;
          }
          const move = (q) => { g[q] = 1; g[p] = 0; col[q * 3] = col[p * 3]; col[q * 3 + 1] = col[p * 3 + 1]; col[q * 3 + 2] = col[p * 3 + 2]; };
          const below = p + W;
          if (!g[below]) { move(below); continue; }
          const d1 = Math.random() < 0.5 ? -1 : 1;
          for (const d of [d1, -d1]) {
            const nx = x + d;
            if (nx >= 0 && nx < W && !g[below + d] && !g[p + d]) { move(below + d); break; }
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
      const top = depth === 0, sideL = x > 0 && !g[p - 1], sideR = x < W - 1 && !g[p + 1];
      let sh = 1.0 - depth * 0.13;
      if (top) sh = 1.35; else if (sideL) sh += 0.12; else if (sideR) sh -= 0.12;
      const grit = 0.92 + 0.16 * ((x * 13 + y * 7) % 5) / 4;
      c.set(x, y, Math.min(1, col[p * 3] * sh * grit), Math.min(1, col[p * 3 + 1] * sh * grit), Math.min(1, col[p * 3 + 2] * sh * grit));
    }
    // The falling stream from the spout.
    if (st.phase === 'pour') for (const sp of st.spouts) { const sx = Math.round(sp.x * (W - 1)); c.set(sx, 0, 0.95, 0.9, 0.75); c.set(sx, 1, 0.7, 0.65, 0.5); c.set(sx, 2, 0.4, 0.37, 0.3); }
  },
});
