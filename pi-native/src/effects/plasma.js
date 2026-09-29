// Ported verbatim (math unchanged) from effects-motion.js's effectPlasma().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to plasma.js - same idea as gradientWashWall.js vs
//   gradientWash.js. x/y/z flattened to unshifted x=x/wallW, y=y/wallH (same
//   convention as prismWall.js/tideWall.js, matching plasma.js's own
//   unshifted x/y/z). `dist` (used for both the central radial ripple term
//   and the saturation shimmer) drops its z component and becomes a plain
//   2D radial distance from the wall's center, same spirit as
//   depthRingsWall.js's dist. The lone term that read z on its own
//   (`sin(z*7.5+t*0.9)`) is re-derived from y instead, following tideWall's
//   precedent, rather than dropped outright - keeps five interfering wave
//   terms instead of quietly collapsing to four.
'use strict';

const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

module.exports = defineFieldEffect({
  speed: 0.75,
  pixel(p, { t }) {
    const { x, y, z } = p;
    // Distance from centre: 3D on the cube; on a flat wall only x/y (the
    // wall's z stand-in is y, which would double-count it here).
    const cx = x - 0.5, cy = y - 0.5, cz = z - 0.5;
    const dist = p.flat ? Math.sqrt(cx * cx + cy * cy) : Math.sqrt(cx * cx + cy * cy + cz * cz);
    const v = Math.sin(x * 7.1 + t)
            + Math.sin(y * 6.3 + t * 1.3)
            + Math.sin(z * 7.5 + t * 0.9)
            + Math.sin((x + y + z) * 4.2 + t * 0.5)
            + Math.sin(dist * 11 + t * 1.6) * 0.6;
    const bright = Math.pow((Math.sin(v * 1.3) * 0.5 + 0.5), 1.2) * 0.75;
    const hue = ((v * 0.12 + t * 0.04) % 1 + 1) % 1;
    const sat = 0.85 + Math.sin(t * 0.7 + dist * 3) * 0.15;
    const [r, g, b] = hsl(hue, sat, bright);
    // chromatic split on bright peaks
    const peak = Math.max(0, bright - 0.55) * 2;
    return [Math.min(1, r + peak * 0.3), g, Math.min(1, b + peak * 0.15)];
  },
});
