// Bouncing Balls: glossy 3D spheres in a dark box. They fall under gravity,
// bounce off the floor and walls (squashing a little on impact) and knock
// into each other, each lit from the top-left with a sharp highlight, a
// coloured rim and a soft shadow on the floor that tightens as it lands.
// Bigger bounces with the music. Same on every cube side face; fills a flat
// panel. Option: effectOptions.balls.count (1-8).
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');

const st = { balls: [], n: 0 };
const LIGHT = (() => { const l = [-0.5, -0.65, 0.6], n = Math.hypot(...l); return l.map((v) => v / n); })();

function spawn(n) {
  st.n = n;
  st.balls = Array.from({ length: n }, (_, i) => ({
    x: 0.15 + Math.random() * 0.7, y: 0.1 + Math.random() * 0.4,
    vx: (Math.random() - 0.5) * 0.9, vy: 0,
    r: 0.07 + Math.random() * 0.05, hue: (i / n + Math.random() * 0.1) % 1, squash: 0,
  }));
}

module.exports = defineCanvasEffect({
  render(c, { dt, core }) {
    const n = Math.max(1, Math.min(8, Number(core.effectOptions?.balls?.count) || 5));
    if (n !== st.n) spawn(n);
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    const step = Math.min(0.05, dt);
    const asp = c.W / c.H, floor = 0.92;
    // Physics in units of the canvas height (x spans 0..asp).
    for (const b of st.balls) {
      b.vy += 1.6 * step;
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.y + b.r > floor) { b.y = floor - b.r; b.squash = Math.min(0.35, Math.abs(b.vy) * 0.25); b.vy = -Math.max(Math.abs(b.vy) * 0.86, 0.9 + beat * 0.8); }
      if (b.x - b.r < 0.02) { b.x = 0.02 + b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > asp * 0.98) { b.x = asp * 0.98 - b.r; b.vx = -Math.abs(b.vx); }
      b.squash = Math.max(0, b.squash - step * 2.5);
    }
    for (let i = 0; i < st.balls.length; i++) for (let j = i + 1; j < st.balls.length; j++) {
      const a = st.balls[i], b = st.balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) {
        const nx = dx / d, ny = dy / d, push = (m - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
      }
    }
    const H = c.H;
    // Box: dark back wall fading down to a lit floor.
    const fy = floor * H;
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      if (y < fy) { const v = 0.02 + (y / fy) * 0.05; c.set(x, y, v * 0.6, v * 0.7, v); }
      else { const v = 0.09 - (y - fy) / (H - fy + 1) * 0.04; c.set(x, y, v * 0.7, v * 0.75, v * 0.9); }
    }
    // Shadows on the floor.
    for (const b of st.balls) {
      const h = Math.max(0, floor - (b.y + b.r)), sx = b.x * H, sr = b.r * H * (1.1 - Math.min(0.6, h)), k0 = 0.6 * (1 - Math.min(0.85, h * 1.4));
      for (let y = Math.floor(fy - 2); y <= fy + 3; y++) for (let x = Math.floor(sx - sr * 1.3); x <= sx + sr * 1.3; x++) {
        const dd = Math.hypot((x - sx) / (sr * 1.2), (y - fy - 0.5) / Math.max(1, sr * 0.3)), k = Math.max(0, 1 - dd * dd) * k0, o = c.get(x, y);
        if (o && k > 0) c.set(x, y, o[0] * (1 - k), o[1] * (1 - k), o[2] * (1 - k));
      }
    }
    // Spheres, back to front by size.
    for (const b of [...st.balls].sort((p, q) => p.r - q.r)) {
      const cx = b.x * H, cy = b.y * H, R = b.r * H, sq = b.squash;
      const rx = R * (1 + sq * 0.5), ry = R * (1 - sq * 0.4), oy = cy + R * sq * 0.4;
      const col = hsl(b.hue, 0.85, 0.5);
      for (let y = Math.floor(oy - ry - 1); y <= oy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        let ar = 0, ag = 0, ab = 0, cov = 0;
        for (let s = 0; s < 4; s++) {
          const u = (x + 0.25 + (s & 1) * 0.5 - cx) / rx, v = (y + 0.25 + (s >> 1) * 0.5 - oy) / ry, d2 = u * u + v * v;
          if (d2 > 1) continue;
          const z = Math.sqrt(1 - d2), lam = Math.max(0, u * LIGHT[0] + v * LIGHT[1] + z * LIGHT[2]);
          const refl = 2 * lam * z - LIGHT[2], spec = Math.pow(Math.max(0, refl), 24) * 0.95;
          const rim = Math.pow(1 - z, 3) * 0.35; // light wrapping round the edge
          const sh = 0.18 + 0.85 * lam;
          ar += Math.min(1, col[0] * sh + spec + rim * col[0]); ag += Math.min(1, col[1] * sh + spec + rim * col[1]); ab += Math.min(1, col[2] * sh + spec + rim * col[2]); cov++;
        }
        if (!cov) continue;
        const o = c.get(x, y); if (!o) continue;
        const k = cov / 4;
        c.set(x, y, o[0] * (1 - k) + (ar / cov) * k, o[1] * (1 - k) + (ag / cov) * k, o[2] * (1 - k) + (ab / cov) * k);
      }
    }
  },
});
