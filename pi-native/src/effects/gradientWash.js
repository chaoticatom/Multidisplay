// Ported verbatim from effects-colour.js's effectGradientWash().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to gradientWash.js - same math, but sampling x/y
//   across the WHOLE stitched wall canvas (core.wallW/wallH) instead of one
//   cube's surfX/Y/Z, so the wash flows continuously across however many
//   panels are arranged, based on where each one was dragged in the grid.
//   
//   Only effect ported for wall mode so far (see pi-native's pending task
//   list) - proves the wall canvas end-to-end. Adapting the rest of the
//   effect library to also have a wall-aware variant is separate follow-up
//   work, one effect at a time, same pattern as the cube-effect ports.
'use strict';

const { hsl, lerp } = require('../core');
const { defineFieldEffect } = require('./surface');

const { lit } = require('./shade');

// Gradient Wash: a sheet of coloured silk, softly folded and slowly
// rippling, the colours washing across it.
function fold(x, y, t) {
  return Math.sin(x * Math.PI * 2 + t) * 0.5 + Math.sin(x * 16 + y * 5 + t * 1.3) * 0.12 + Math.sin(y * 11 - t * 0.7 + x * 3) * 0.08;
}
module.exports = defineFieldEffect({
  smooth: true, // slowly varying field: see surface.js
  speed: 0.4,
  pixel(p, { t }) {
    const { x, y, z } = p;
    const u = p.flat ? x : (x + z) / 2, e = 0.01, h = fold(u, y, t);
    const dhx = (fold(u + e, y, t) - h) / e, dhy = (fold(u, y + e, t) - h) / e;
    const bright = lerp(0.3, 0.6, h * 0.5 + 0.5);
    // The wall folds the missing z weight into x.
    const hue = (p.flat ? x * 0.6 + y * 0.3 + t * 0.08 : x * 0.4 + y * 0.3 + z * 0.3 + t * 0.08) % 1;
    return lit(hsl(hue, 1, bright), dhx, dhy, { bump: 0.35, gloss: 24, shine: 0.55, ambient: 0.3 });
  },
});
