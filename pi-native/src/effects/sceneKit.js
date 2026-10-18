// Helpers for "scene" field effects (Prism Sweep, Aurora, Lightning Storm,
// Beach Tide, Colour Falls, Light Speed): true-proportion coordinates, so a
// scene isn't stretched on a wide wall, and smooth value noise for clouds,
// water and mist.
'use strict';

// p (from defineFieldEffect) -> [x, y, w]: y 0 (top) .. 1 (bottom), x 0..w
// where w is the display's width/height (1 on a cube face). On the cube each
// face gets its own square, upright on the sides.
function sceneUV(p, core) {
  if (p.flat) { const w = core && core.wallW && core.wallH ? core.wallW / core.wallH : 2; return [p.x * w, p.y, w]; }
  const ex = Math.min(p.x, 1 - p.x), ey = Math.min(p.y, 1 - p.y), ez = Math.min(p.z, 1 - p.z);
  if (ez <= ex && ez <= ey) return [p.x, 1 - p.y, 1];
  if (ex <= ey) return [p.z, 1 - p.y, 1];
  return [p.x, p.z, 1];
}
function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

module.exports = { sceneUV, hash2, vnoise, fbm, clamp, smooth };
