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
// The cube's four sides as one band: x runs 0..4 round the cube (continuous
// across every corner, one seam where 4 meets 0), y 0 (top) .. 1 (bottom).
// Top and bottom faces return side: false with x, y across the face.
function ringUV(p) {
  const ex = Math.min(p.x, 1 - p.x), ey = Math.min(p.y, 1 - p.y), ez = Math.min(p.z, 1 - p.z);
  if (ey < ex && ey < ez) return [p.x, p.z, 4, false, p.y < 0.5]; // last: is it the bottom (p.y is up)
  const dx = p.x - 0.5, dz = p.z - 0.5;
  let s;
  if (Math.abs(dz) >= Math.abs(dx)) s = dz > 0 ? dx + 0.5 : 2 + (0.5 - dx);
  else s = dx > 0 ? 1 + (0.5 - dz) : 3 + (dz + 0.5);
  return [s, 1 - p.y, 4, true, false];
}
// One scene for the whole cube: scene(x, y, w) is called with the four sides
// as one band (x 0..4, blended over the seam), the top carrying on above
// them (y below 0, in from the edge it faces) and the bottom below them (y
// above 1). On a wall it's the plain sceneUV() picture.
function cubeScene(p, core, scene, fold = false) { // fold: the top mirrors the sides' top band instead of carrying on above it
  if (p.flat) { const [x, y, w] = sceneUV(p, core); return scene(x, y, w); }
  const [x, y, , side, bottom] = ringUV(p);
  let sx = x, sy = y;
  if (!side) {
    const dx = x - 0.5, dz = y - 0.5, d = 0.5 - Math.max(Math.abs(dx), Math.abs(dz));
    sx = ringUV({ x: p.x, y: 0.5, z: p.z })[0]; sy = bottom ? 1 + d * 0.9 : fold ? d * 0.9 : -d * 0.9;
  }
  // Clamped at 0: a scene taken past its top or bottom edge can go negative.
  const a = scene(sx, sy, 4);
  if (sx < 3.8) return [Math.max(0, a[0]), Math.max(0, a[1]), Math.max(0, a[2])];
  const b = scene(sx - 4, sy, 4), k = (sx - 3.8) / 0.2;
  return [Math.max(0, a[0] + (b[0] - a[0]) * k), Math.max(0, a[1] + (b[1] - a[1]) * k), Math.max(0, a[2] + (b[2] - a[2]) * k)];
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

module.exports = { cubeScene, ringUV, sceneUV, hash2, vnoise, fbm, clamp, smooth };
