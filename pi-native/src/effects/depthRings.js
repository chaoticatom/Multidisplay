// Ported verbatim (math unchanged) from effects-colour.js's effectDepthRings().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to depthRings.js - same idea as gradientWashWall.js
//   vs gradientWash.js. The cube version derives dist/ang from surfX/Y/Z (3D
//   cube-surface coords) around the cube's center; a flat wall has no such
//   surface, so this uses plain 2D coords instead: nx/ny centered on the
//   stitched wall canvas (same nx/ny convention as gradientWashWall.js),
//   dist = sqrt(nx*nx+ny*ny)*2 with the z term simply dropped (a genuinely
//   flat 2D ripple, not a fake-3D one), ang = atan2(ny,nx). The actual
//   ring/twist/hue math below is otherwise identical to depthRings.js's,
//   just fed dist/ang from 2D instead of 3D.
'use strict';

const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

module.exports = defineFieldEffect({
  speed: 0.75,
  pixel(p, { t }) {
    const dx = p.x - 0.5, dy = p.y - 0.5, dz = p.z - 0.5;
    // 3D distance from the cube's centre; plain 2D on a flat wall.
    const dist = p.flat ? Math.sqrt(dx * dx + dy * dy) * 2 : Math.sqrt(dx * dx + dy * dy + dz * dz) * 2;
    const ang = Math.atan2(dy, dx);
    const twist = ang * 1.6 + dist * 2.5;
    const ring = Math.sin(dist * Math.PI * 9 - t * 2.4 + twist);
    const ring2 = Math.sin(dist * Math.PI * 4.5 + t * 1.1 + ang);
    const bright = ((ring * 0.6 + ring2 * 0.4) * 0.5 + 0.5) * (1 - dist * 0.42) * 0.88;
    const hue = (dist * 0.65 + ang / (Math.PI * 2) * 0.3 + t * 0.055) % 1;
    return hsl(hue, 1, Math.max(0, bright));
  },
});
