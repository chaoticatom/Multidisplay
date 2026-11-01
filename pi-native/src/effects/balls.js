// Bouncing Balls: glossy 3D spheres in a dark box. They fall under gravity,
// bounce off the floor and walls and knock into each other, squashing a
// little against whatever they hit, and knock
// into each other, each lit from the top-left with a sharp highlight, a
// coloured rim and a soft shadow on the floor that tightens as it lands.
// Bigger bounces with the music. On the cube, Cross Faces (the default) is
// one box wrapped round the four sides - balls roll from face to face - and
// Own Face gives every side its own copy; fills a flat panel.
// Options: effectOptions.balls.count (1-8, per face), crossFaces.
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');

const st = { balls: [], n: 0 };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT = (() => { const l = [-0.5, -0.65, 0.6], n = Math.hypot(...l); return l.map((v) => v / n); })();

function spawn(n, asp = 1) {
  st.n = n;
  st.balls = Array.from({ length: n }, (_, i) => ({
    x: (0.15 + Math.random() * 0.7) * asp, y: 0.1 + Math.random() * 0.4,
    vx: (Math.random() - 0.5) * 0.9, vy: 0,
    r: 0.07 + Math.random() * 0.05, hue: (i / n + Math.random() * 0.1) % 1, squash: 0, sqx: 0, sqy: 1,
  }));
}

// A squash on impact: flattened along (nx, ny) - the direction of whatever
// it hit - by an amount from the impact speed. A bigger hit takes over.
function hit(b, nx, ny, speed) {
  const k = Math.min(0.35, speed * 0.25);
  if (k > b.squash) { b.squash = k; b.sqx = nx; b.sqy = ny; }
}

function render(c, { dt, core }) {
    const wrap = !!c.wrap, faces = wrap ? Math.round(c.W / c.H) : 1;
    const n = Math.max(1, Math.min(8, Number(core.effectOptions?.balls?.count) || 5)) * faces;
    if (n !== st.n) spawn(n, c.W / c.H);
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    const step = Math.min(0.05, dt);
    const asp = c.W / c.H, floor = 0.92;
    // Physics in units of the canvas height (x spans 0..asp).
    for (const b of st.balls) {
      b.vy += 1.6 * step;
      b.x += b.vx * step; b.y += b.vy * step;
      if (b.y + b.r > floor) { b.y = floor - b.r; hit(b, 0, 1, Math.abs(b.vy)); b.vy = -Math.max(Math.abs(b.vy) * 0.86, 0.9 + beat * 0.8); }
      if (wrap) b.x = ((b.x % asp) + asp) % asp; // round the cube: no side walls
      else {
        if (b.x - b.r < 0.02) { b.x = 0.02 + b.r; hit(b, -1, 0, Math.abs(b.vx)); b.vx = Math.abs(b.vx); }
        if (b.x + b.r > asp * 0.98) { b.x = asp * 0.98 - b.r; hit(b, 1, 0, Math.abs(b.vx)); b.vx = -Math.abs(b.vx); }
      }
      b.squash = Math.max(0, b.squash - step * 2.5);
    }
    for (let i = 0; i < st.balls.length; i++) for (let j = i + 1; j < st.balls.length; j++) {
      const a = st.balls[i], b = st.balls[j], dx0 = b.x - a.x, dx = wrap ? dx0 - asp * Math.round(dx0 / asp) : dx0, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) {
        const nx = dx / d, ny = dy / d, push = (m - d) / 2;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) { hit(a, nx, ny, -rel); hit(b, -nx, -ny, -rel); }
        if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; b.vx -= rel * nx; b.vy -= rel * ny; }
      }
    }
    const H = c.H;
    // Box: near-black back wall fading down to a dim floor (darker on request -
    // on the panels the old levels read as a bright khaki backdrop).
    const fy = floor * H;
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      // Dithered (a 4x4 ordered pattern of under one 8-bit step): a gradient
      // this dark only spans a few output levels, which showed as bands.
      if (y < fy) { const v = 0.005 + (y / fy) * 0.03 + (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) / 255; c.set(x, y, v * 0.6, v * 0.7, v); }
      else { const v = 0.03 - (y - fy) / (H - fy + 1) * 0.012; c.set(x, y, v * 0.7, v * 0.75, v * 0.9); }
    }
    // Shadows on the floor.
    const shifts = wrap ? [0, -c.W, c.W] : [0]; // drawn again across the seam
    for (const b of st.balls) for (const sh of shifts) {
      const h = Math.max(0, floor - (b.y + b.r)), sx = b.x * H + sh, sr = b.r * H * (1.1 - Math.min(0.6, h)), k0 = 0.6 * (1 - Math.min(0.85, h * 1.4));
      for (let y = Math.floor(fy - 2); y <= fy + 3; y++) for (let x = Math.floor(sx - sr * 1.3); x <= sx + sr * 1.3; x++) {
        const dd = Math.hypot((x - sx) / (sr * 1.2), (y - fy - 0.5) / Math.max(1, sr * 0.3)), k = Math.max(0, 1 - dd * dd) * k0, o = c.get(x, y);
        if (o && k > 0) c.set(x, y, o[0] * (1 - k), o[1] * (1 - k), o[2] * (1 - k));
      }
    }
    // Spheres, back to front by size.
    for (const b of [...st.balls].sort((p, q) => p.r - q.r)) for (const shf of shifts) {
      const cx = b.x * H + shf, cy = b.y * H, R = b.r * H, sq = b.squash;
      // Squashed along the hit direction (n), widened across it, and nudged
      // towards what it hit so it stays in contact.
      const nx = b.sqx, ny = b.sqy, ra = R * (1 - sq * 0.4), rp = R * (1 + sq * 0.5), ox = cx + nx * R * sq * 0.4, oy = cy + ny * R * sq * 0.4, ext = rp + 1;
      const col = hsl(b.hue, 0.85, 0.5);
      for (let y = Math.floor(oy - ext); y <= oy + ext; y++) for (let x = Math.floor(ox - ext); x <= ox + ext; x++) {
        let ar = 0, ag = 0, ab = 0, cov = 0;
        for (let s = 0; s < 4; s++) {
          const px = x + 0.25 + (s & 1) * 0.5 - ox, py = y + 0.25 + (s >> 1) * 0.5 - oy;
          const ua = (px * nx + py * ny) / ra, up = (-px * ny + py * nx) / rp;
          const u = ua * nx - up * ny, v = ua * ny + up * nx, d2 = ua * ua + up * up;
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
}

// Two canvases: wrapped round the cube's sides, or a copy per side face.
// Cross Faces' top face: looking down into the box. Each ball shows near the
// edge it's against, bigger and brighter the higher it is (nearer the top).
const SIDE = [0, 2, 1, 3]; // the canvas's face order round the cube (canvas.js)
function topView(core, face) {
  if (face !== 4) return; // the bottom stays dark
  const S = core.SIZE, map = core.faceMap[4], X = core.surfX, Z = core.surfZ, cb = core.colBuf;
  for (const i of map) if (i >= 0) { const o = i * 3, v = 0.006; cb[o] = v * 0.6; cb[o + 1] = v * 0.7; cb[o + 2] = v; }
  for (const b of st.balls) {
    const col = ((Math.round(b.x * S) % (4 * S)) + 4 * S) % (4 * S), f = SIDE[(col / S) | 0], led = core.faceMap[f][(S >> 1) * S + (col % S)];
    if (led < 0) continue;
    const up = Math.max(0, Math.min(1, 1 - b.y)), tx = 0.5 + (X[led] - 0.5) * 0.8, tz = 0.5 + (Z[led] - 0.5) * 0.8;
    const R = b.r * (0.6 + 0.9 * up), k = 0.3 + 0.7 * up, c = hsl(b.hue, 0.85, 0.5);
    for (const i of map) {
      if (i < 0) continue;
      const dx = (X[i] - tx) / R, dz = (Z[i] - tz) / R, d2 = dx * dx + dz * dz;
      if (d2 > 1) continue;
      const z = Math.sqrt(1 - d2), sh = (0.25 + 0.75 * z) * k, spec = Math.pow(z, 18) * 0.6 * k, o = i * 3;
      cb[o] = Math.min(1, c[0] * sh + spec); cb[o + 1] = Math.min(1, c[1] * sh + spec); cb[o + 2] = Math.min(1, c[2] * sh + spec);
    }
  }
}
const cross = defineCanvasEffect({ panorama: true, render, caps: topView }), own = defineCanvasEffect({ render });
module.exports = function balls(core, dt) { return (core.effectOptions?.balls?.crossFaces === false ? own : cross)(core, dt); };
module.exports.wall = cross.wall;
