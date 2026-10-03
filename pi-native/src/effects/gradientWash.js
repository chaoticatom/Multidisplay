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

module.exports = defineFieldEffect({
  smooth: true, // slowly varying field: see surface.js
  speed: 0.4,
  pixel(p, { t }) {
    const { x, y, z } = p;
    const wave = Math.sin(x * Math.PI * 2 + t) * 0.5 + 0.5;
    const bright = lerp(0.22, 0.72, wave);
    // The wall folds the missing z weight into x.
    const hue = (p.flat ? x * 0.6 + y * 0.3 + t * 0.08 : x * 0.4 + y * 0.3 + z * 0.3 + t * 0.08) % 1;
    return hsl(hue, 1, bright);
  },
});
