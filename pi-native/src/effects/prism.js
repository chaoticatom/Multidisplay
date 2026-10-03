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

module.exports = defineFieldEffect({
  smooth: true, // slowly varying field: see surface.js
  speed: 0.55,
  pixel(p, { t }) {
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
