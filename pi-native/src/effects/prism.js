// Prism: a glass prism splits a glowing white beam into a rainbow fan, like
// the famous album cover. The beam slowly swings so the spectrum sweeps; it
// shimmers, sparkles drift through the light, the glass catches the beam and
// already tints it inside, the fan's seven bands fade with distance and
// reflect faintly on a floor below, and a few stars twinkle behind. Drawn in
// true proportions on any wall (not stretched), and per face on the cube.
// With music, the beam brightens with the level and the fan pulses on beats.
// One definition for cube and wall (see ./surface.js).
'use strict';

const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

const sq = (v) => v * v;
// Distance from (px,py) to segment a-b, and how far along it (0..1).
function seg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9, k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  const dx = px - ax - vx * k, dy = py - ay - vy * k;
  return [Math.sqrt(dx * dx + dy * dy), k];
}
const side = (px, py, ax, ay, bx, by) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
function hash(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }

// The scene for one frame, in units where the height is 1 and the width is
// `asp` (so the prism keeps its shape on a wide wall).
function scene(asp, t, audio) {
  const cx = asp * 0.5, h = 0.5, half = h / Math.sqrt(3);
  const A = [cx, 0.2], L = [cx - half, 0.2 + h], R = [cx + half, 0.2 + h];
  const s = 0.42 + 0.14 * Math.sin(t * 0.35); // where the beam meets the left face (0 apex .. 1 base)
  const E = [A[0] + (L[0] - A[0]) * s, A[1] + (L[1] - A[1]) * s];
  const S = [0, E[1] - 0.08 - 0.06 * Math.sin(t * 0.35)];
  const sx = 0.5 + (s - 0.42) * 0.5;
  const X = [A[0] + (R[0] - A[0]) * sx, A[1] + (R[1] - A[1]) * sx];
  const lvl = audio && audio.active ? audio.level : 0, beat = audio && audio.active ? audio.beat : 0;
  return { A, L, R, E, S, X, a0: 0.16 + (s - 0.42) * 0.9, spread: 0.34, glow: 0.85 + 0.45 * lvl, pulse: 1 + 0.5 * beat, floor: 0.2 + h + 0.06, t };
}

function rainbowAt(sc, x, y) {
  const dx = x - sc.X[0], dy = y - sc.X[1];
  if (dx < -0.01) return null;
  const d = Math.sqrt(dx * dx + dy * dy), ang = Math.atan2(dy, dx), f = (ang - (sc.a0 - sc.spread / 2)) / sc.spread;
  if (f < -0.08 || f > 1.08) return null;
  const edge = Math.max(0, Math.min(1, Math.min(f + 0.06, 1.06 - f) * 9)); // soft outer edges
  const bands = 0.78 + 0.22 * Math.cos(f * 7 * 2 * Math.PI); // seven bands, faint seams
  const shimmer = 0.88 + 0.12 * Math.sin(d * 34 - sc.t * 5 + f * 9);
  const k = edge * bands * shimmer * Math.min(1, d * 14) / (1 + d * 1.1) * sc.pulse;
  const [r, g, b] = hsl(Math.max(0, Math.min(1, f)) * 0.8, 1, 0.5);
  return [r * k, g * k, b * k];
}

function prismPixel(x, y, sc) {
  const { A, L, R, E, S, X } = sc;
  // Background: deep blue fading up, a few twinkling stars, a soft glow round the prism.
  let r = 0.004 + 0.01 * (1 - y), g = 0.006 + 0.012 * (1 - y), b = 0.02 + 0.03 * (1 - y);
  const gx = x - A[0], gy = y - 0.55, halo = Math.exp(-(gx * gx + gy * gy) * 9) * 0.05;
  r += halo * 0.5; g += halo * 0.6; b += halo;
  const cell = Math.floor(x * 40) * 977 + Math.floor(y * 40);
  if (hash(cell) > 0.985) { const tw = 0.5 + 0.5 * Math.sin(sc.t * (1 + hash(cell + 1) * 3) + cell); const k = 0.25 * tw * Math.max(0, 1 - sq((x * 40 % 1) - 0.5) * 8 - sq((y * 40 % 1) - 0.5) * 8); r += k; g += k; b += k; }
  const inside = side(x, y, A[0], A[1], L[0], L[1]) <= 0 && side(x, y, L[0], L[1], R[0], R[1]) <= 0 && side(x, y, R[0], R[1], A[0], A[1]) <= 0;
  // The incoming white beam: a bright core, a wide glow, drifting sparkles.
  const [dIn, kIn] = seg(x, y, S[0], S[1], E[0], E[1]);
  const core = Math.exp(-sq(dIn / 0.012)) * sc.glow, wide = Math.exp(-sq(dIn / 0.045)) * 0.25 * sc.glow;
  const spark = dIn < 0.03 && hash(Math.floor((kIn * 60 - sc.t * 8)) * 31 + Math.floor(dIn * 200)) > 0.93 ? 0.5 : 0;
  r += core + wide + spark; g += core + wide + spark; b += core + wide * 1.1 + spark;
  if (inside) {
    // Glass: a cool body, brighter towards the lit left face, with the beam
    // inside already tinting towards a rainbow as it nears the far face.
    const lit = Math.max(0, 1 - Math.abs(side(x, y, A[0], A[1], L[0], L[1])) * 18);
    r += 0.03 + lit * 0.04; g += 0.05 + lit * 0.05; b += 0.1 + lit * 0.08;
    const [dM, kM] = seg(x, y, E[0], E[1], X[0], X[1]), w = 0.012 + kM * 0.025, kk = Math.exp(-sq(dM / w)) * 0.9 * sc.glow;
    const [cr, cg, cb] = hsl(Math.max(0, Math.min(1, 0.5 + (side(x, y, E[0], E[1], X[0], X[1]) > 0 ? 1 : -1) * dM / (w * 2) * 0.5)) * 0.8, 1, 0.5);
    r += kk * (1 - kM * 0.6 + cr * kM * 0.6); g += kk * (1 - kM * 0.6 + cg * kM * 0.6); b += kk * (1 - kM * 0.6 + cb * kM * 0.6);
  } else {
    const rb = rainbowAt(sc, x, y);
    if (rb) { r += rb[0]; g += rb[1]; b += rb[2]; }
    // The floor: the fan reflected faintly below, rippling.
    if (y > sc.floor) {
      const my = 2 * sc.floor - y + 0.004 * Math.sin(x * 60 + sc.t * 3), fr = rainbowAt(sc, x, my), fade = Math.max(0, 1 - (y - sc.floor) * 6) * 0.3;
      if (fr) { r += fr[0] * fade; g += fr[1] * fade; b += fr[2] * fade; }
    }
  }
  // Glass edges: crisp highlights, the lit face brightest.
  const e1 = seg(x, y, A[0], A[1], L[0], L[1])[0], e2 = seg(x, y, L[0], L[1], R[0], R[1])[0], e3 = seg(x, y, R[0], R[1], A[0], A[1])[0];
  const edge = Math.exp(-sq(e1 / 0.008)) * 0.75 + Math.exp(-sq(e2 / 0.008)) * 0.45 + Math.exp(-sq(e3 / 0.008)) * 0.55;
  r += edge * 0.7; g += edge * 0.85; b += edge;
  return [Math.min(1.4, r), Math.min(1.4, g), Math.min(1.4, b)];
}

let cache = { t: -1, asp: 0, sc: null };
function sceneFor(asp, t, audio) { if (cache.t !== t || cache.asp !== asp) cache = { t, asp, sc: scene(asp, t, audio) }; return cache.sc; }

module.exports = defineFieldEffect({
  fine: true,
  speed: 0.55,
  pixel(p, { t, core }) {
    if (p.flat) {
      const asp = core && core.wallW && core.wallH ? core.wallW / core.wallH : 2;
      return prismPixel(p.x * asp, p.y, sceneFor(asp, t, core && core.audio));
    }
    // Cube: the same prism on every face, on that face's own square.
    const sc = sceneFor(1, t, core && core.audio);
    const ex = Math.min(p.x, 1 - p.x), ey = Math.min(p.y, 1 - p.y), ez = Math.min(p.z, 1 - p.z);
    if (ez <= ex && ez <= ey) return prismPixel(p.x, 1 - p.y, sc); // front / back
    if (ex <= ey) return prismPixel(p.z, 1 - p.y, sc); // left / right
    return prismPixel(p.x, p.z, sc); // top / bottom
  },
});
