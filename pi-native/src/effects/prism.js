// Ported verbatim (math unchanged) from effects-colour.js's effectPrism().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to prism.js - same idea as gradientWashWall.js vs
//   gradientWash.js. The cube version's x/y/z are surfX/Y/Z (3D cube-surface
//   coords, 0-1); flattened here to 2D wall coords using the same nx/ny
//   centering convention as gradientWashWall.js/depthRingsWall.js: x = x/wallW,
//   y = y/wallH (kept 0-1, unshifted, since prism.js's own x/y/z are 0-1 not
//   centered) and the z axis (used in the cube version for `cross` and the
//   beam's second sweep axis) is simply dropped - `cross` becomes 0 (no
//   second axis to compare against) and the beam sweeps purely across x.
//   Everything else (hue shift, sweep angle, dispersion) is unchanged.
'use strict';

const { hsl, sm } = require('../core');
const { defineFieldEffect } = require('./surface');

// Flat panel: a glass prism. A white beam comes in from the left, bends
// through the glass and fans out the far side as a rainbow; the beam slowly
// rises and falls so the spectrum sweeps across the dark.
const TRI = [[0.5, 0.26], [0.27, 0.72], [0.73, 0.72]];
function side(px, py, a, b) { return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]); }
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
}
function flatPrism(x, y, t) {
  const by = 0.47 + 0.12 * Math.sin(t * 0.5);
  const inX = 0.395 - (by - 0.47) * 0.45, inY = by; // where the beam meets the left face
  const outX = 0.6, outY = 0.5 + (by - 0.47) * 0.6; // and leaves the right face
  const inside = side(x, y, TRI[0], TRI[1]) <= 0 && side(x, y, TRI[1], TRI[2]) <= 0 && side(x, y, TRI[2], TRI[0]) <= 0;
  let r = 0.01 + y * 0.02, g = 0.01 + y * 0.02, b = 0.03 + y * 0.04;
  // Incoming white beam.
  const dIn = segDist(x, y, 0, by - 0.06, inX, inY);
  if (dIn < 0.03) { const k = 1 - dIn / 0.03; r += k * 0.95; g += k * 0.95; b += k * 0.95; }
  if (inside) {
    // Glass: a faint blue body with a bright internal beam.
    r += 0.03; g += 0.05; b += 0.09;
    const dMid = segDist(x, y, inX, inY, outX, outY);
    if (dMid < 0.025) { const k = (1 - dMid / 0.025) * 0.8; r += k; g += k; b += k; }
  } else if (x > outX - 0.02) {
    // The rainbow fan.
    const ang = Math.atan2(y - outY, x - outX), a0 = 0.05 + (by - 0.47) * 1.2, spread = 0.42;
    const f = (ang - (a0 - spread / 2)) / spread;
    if (f >= 0 && f <= 1) {
      const dist = Math.hypot(x - outX, y - outY), edge = Math.min(1, Math.min(f, 1 - f) * 12);
      const [cr, cg, cb] = hsl(f * 0.78, 1, 0.5), k = edge * (0.95 - dist * 0.6);
      r += cr * k; g += cg * k; b += cb * k;
    }
  }
  // Bright glass edges.
  const e = Math.min(segDist(x, y, ...TRI[0], ...TRI[1]), segDist(x, y, ...TRI[1], ...TRI[2]), segDist(x, y, ...TRI[2], ...TRI[0]));
  if (e < 0.012) { const k = (1 - e / 0.012) * 0.55; r += k * 0.7; g += k * 0.85; b += k; }
  return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
}

module.exports = defineFieldEffect({
  smooth: true, // slowly varying field: see surface.js
  speed: 0.55,
  pixel(p, { t }) {
    if (p.flat) return flatPrism(p.x, p.y, t);
    const { x, y, z } = p;
    const beamAng = t * 0.6, beamW = 0.18;
    // A flat wall has no z: the diagonal uses x/y only, and the cross term
    // and the beam's z component drop out.
    const diag = p.flat ? (x + y) / 2 : (x + y + z) / 3;
    const cross = p.flat ? 0 : Math.abs(x - z);
    const base = 0.28 + Math.sin(diag * Math.PI * 5.5 + t) * 0.28;
    const hue = (diag * 0.92 + t * 0.065) % 1;
    let [r, g, b] = hsl(hue, 0.78 + sm(0, 1, cross) * 0.22, Math.max(0, base));
    const bDist = p.flat ? Math.abs((x - 0.5) * Math.cos(beamAng)) : Math.abs(((x - 0.5) * Math.cos(beamAng) + (z - 0.5) * Math.sin(beamAng)));
    const beam = Math.max(0, 1 - bDist / beamW) * 0.8;
    if (beam > 0) {
      const dispHue = (hue + bDist * 1.5) % 1;
      const [dr, dg, db] = hsl(dispHue, 1, beam * 0.9);
      r = Math.min(1, r + dr * beam + beam * 0.3);
      g = Math.min(1, g + dg * beam + beam * 0.3);
      b = Math.min(1, b + db * beam + beam * 0.3);
    }
    return [r, g, b];
  },
});
