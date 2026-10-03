// Laser Grid: a synthwave night drive. A neon grid floor in true 3D
// perspective rushes towards you, a striped sunset sun sinks behind
// layered mountains, stars twinkle above, and laser beams sweep the sky from
// the horizon. The colours slowly cycle (magenta/cyan, orange/purple,
// green/blue) and the grid pulses with the beat. Same on every cube side
// face; fills a flat panel.
'use strict';
const { defineCanvasEffect } = require('./canvas');

const THEMES = [
  { grid: [1, 0.15, 0.85], sunTop: [1, 0.85, 0.2], sunBot: [1, 0.1, 0.55], sky: [0.25, 0.02, 0.3], mtn: [0.08, 0.0, 0.16], laser: [0.2, 0.9, 1] },
  { grid: [0.1, 0.9, 1], sunTop: [1, 0.6, 0.1], sunBot: [0.9, 0.1, 0.4], sky: [0.05, 0.05, 0.3], mtn: [0.02, 0.02, 0.12], laser: [1, 0.3, 0.8] },
  { grid: [0.2, 1, 0.4], sunTop: [0.8, 1, 0.3], sunBot: [0.1, 0.6, 0.9], sky: [0.0, 0.12, 0.2], mtn: [0.0, 0.05, 0.08], laser: [1, 0.9, 0.2] },
];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hash = (x) => { const s = Math.sin(x * 127.1) * 43758.5453; return s - Math.floor(s); };

module.exports = defineCanvasEffect({
  render(c, { t, core }) {
    const W = c.W, H = c.H, hz = Math.round(H * 0.55); // horizon
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    // Theme blends slowly between palettes.
    const tt = t / 20, i0 = Math.floor(tt) % THEMES.length, k = (tt % 1) < 0.85 ? 0 : ((tt % 1) - 0.85) / 0.15;
    const A = THEMES[i0], B = THEMES[(i0 + 1) % THEMES.length];
    const T = {}; for (const key of Object.keys(A)) T[key] = mix(A[key], B[key], k);
    // Sky: dark at the top, glowing towards the horizon; stars.
    for (let y = 0; y < hz; y++) {
      const v = y / hz;
      for (let x = 0; x < W; x++) {
        let [r, g, b] = mix([0.005, 0.0, 0.02], T.sky, v * v);
        if (v < 0.6 && hash(x * 31 + y * 977) > 0.985) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + x * y)); r += tw * 0.7; g += tw * 0.7; b += tw * 0.8; }
        c.set(x, y, r, g, b);
      }
    }
    // Sun: a disc sinking slightly behind the horizon, with stripes cut out of its lower half.
    const sR = Math.min(W, H) * 0.24, sx = W / 2, sy = hz - sR * 0.35 + Math.sin(t * 0.2) * 1.5;
    for (let y = Math.floor(sy - sR - 3); y < hz; y++) for (let x = Math.floor(sx - sR - 3); x <= sx + sR + 3; x++) {
      const d = Math.hypot(x - sx, y - sy), o = c.get(x, y); if (!o) continue;
      if (d < sR) {
        const v = (y - (sy - sR)) / (2 * sR);
        const stripeH = Math.max(1, sR * 0.12 * v), period = sR * 0.28;
        const cut = v > 0.5 && ((y - sy + t * 4) % period + period) % period < stripeH;
        if (!cut) { const [r, g, b] = mix(T.sunTop, T.sunBot, v); c.set(x, y, r, g, b); }
      } else if (d < sR + 4) { const gl = (1 - (d - sR) / 4) * 0.35; c.set(x, y, o[0] + T.sunBot[0] * gl, o[1] + T.sunBot[1] * gl, o[2] + T.sunBot[2] * gl); }
    }
    // Lasers fanning up from the horizon.
    for (let L = 0; L < 3; L++) {
      const ang = Math.sin(t * (0.4 + L * 0.17) + L * 2) * 0.9, ox = W * (0.2 + L * 0.3);
      for (let s = 0; s < hz * 1.3; s += 0.5) {
        const x = ox + Math.sin(ang) * s, y = hz - Math.cos(ang) * s; if (y < 0) break;
        const f = 0.35 * (1 - s / (hz * 1.3)); c.add(x, y, T.laser[0] * f, T.laser[1] * f, T.laser[2] * f);
      }
    }
    // Mountains: two silhouettes with neon edges.
    for (const [layer, hgt, col, edge] of [[0, 0.32, mix(T.mtn, T.sky, 0.35), 0.25], [1, 0.2, T.mtn, 0.5]]) {
      for (let x = 0; x < W; x++) {
        const u = x / W * 6 + layer * 10;
        const h = (Math.abs(Math.sin(u * 0.9)) * 0.6 + Math.abs(Math.sin(u * 2.3 + 1)) * 0.3 + hash(Math.floor(u * 4)) * 0.1) * hz * hgt;
        const top = Math.round(hz - h);
        for (let y = top; y < hz; y++) c.set(x, y, col[0], col[1], col[2]);
        c.add(x, top, T.grid[0] * edge, T.grid[1] * edge, T.grid[2] * edge);
      }
    }
    // Floor: a perspective grid. For each row below the horizon, its depth
    // z = camera height / distance below horizon; lines every 1 unit in z
    // (scrolling) and in x (fanning out from the vanishing point).
    const camH = 1, scroll = t * 2.2, pulse = 1 + beat * 0.6;
    for (let y = hz; y < H; y++) {
      const dy = (y - hz + 0.5) / (H - hz), z = camH / dy;
      const fog = Math.min(1, dy * 2.2) ** 1.5; // lines fade into the haze at the horizon
      // A cross line falls on this row if a whole-number depth lies between
      // the row's top and bottom edge: always exactly one pixel thick.
      const zTop = camH / Math.max(1e-3, (y - hz) / (H - hz)), zBot = camH / ((y - hz + 1) / (H - hz));
      const onRow = Math.floor(zTop + scroll) !== Math.floor(zBot + scroll) ? 1 : 0;
      for (let x = 0; x < W; x++) {
        const wx = (x - W / 2 + 0.5) / (W / 2) * z * 1.2;
        const xLine = Math.abs(((wx % 1) + 1) % 1 - 0.5) * 2;
        const onZ = onRow * Math.min(1, 0.7 / Math.max(1, zTop - zBot)); // dimmer where many depths share a row (far away)
        const onX = Math.max(0, (xLine - (1 - 0.06 * z)) / (0.06 * z));
        const line = Math.min(1, Math.max(onZ, onX)) * fog * pulse;
        const base = 0.02 + 0.06 * (1 - dy);
        c.set(x, y, Math.min(1, base * T.sky[0] * 4 + T.grid[0] * line), Math.min(1, base * T.sky[1] * 4 + T.grid[1] * line), Math.min(1, base * T.sky[2] * 4 + T.grid[2] * line));
      }
    }
    // Horizon glow line.
    for (let x = 0; x < W; x++) c.add(x, hz, T.grid[0] * 0.5, T.grid[1] * 0.5, T.grid[2] * 0.5);
  },
});
