// Ported verbatim (math unchanged) from effects-motion.js's effectNebula().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to nebula.js - same idea as gradientWashWall.js vs
//   gradientWash.js. x/y flattened to unshifted x=x/wallW, y=y/wallH (same
//   convention as prismWall.js/tideWall.js, matching nebula.js's own
//   unshifted x/y/z). Like auroraWall.js, nebula.js's z terms drive cloud
//   density shape from a genuinely separate horizontal axis that a flat
//   wall doesn't have a matching stand-in for, so - rather than reusing
//   wall-y and warping the density field toward a vertical bias that isn't
//   in the original - z is dropped spatially (set to 0) but its time
//   component is kept, so the same number of interfering density terms
//   keep shimmering over time instead of one going fully static. Star-core
//   twinkle state is unchanged, just re-sized to wallW*wallH cells instead
//   of N cube LEDs.
'use strict';

const { hsl, lerp, sm } = require('../core');
const { defineFieldEffect } = require('./surface');

// Per-pixel twinkle state, one array per mode.
const stars = { cube: null, wall: null };

module.exports = defineFieldEffect({
  smooth: true, // slowly varying cloud; stars are added per pixel in detail()
  speed: 0.28,
  frame(ctx) {
    const key = ctx.flat ? 'wall' : 'cube';
    if (!stars[key] || stars[key].length !== ctx.count) {
      stars[key] = [];
      for (let i = 0; i < ctx.count; i++) stars[key].push({ last: -1, next: Math.random() * 8, bright: 0 });
    }
    ctx.stars = stars[key];
  },
  pixel(p, ctx) {
    const { t } = ctx;
    // A flat wall has no depth: z = 0 (its terms keep moving in time only).
    const x = p.x, y = p.y, z = p.flat ? 0 : p.z;
    let d = 0;
    d += Math.sin(x * 5.3 + t * 0.52) * Math.cos(y * 4.9 + t * 0.31) * 0.5;
    d += Math.sin(z * 6.5 - t * 0.42) * Math.sin(x * 3.4 + t * 0.21) * 0.38;
    d += Math.cos((x + y + z) * 4.2 + t * 0.58) * 0.28;
    d += Math.sin(x * 8.8 + y * 6.1 - t * 0.35) * 0.15;
    d = d * 0.48 + 0.52;
    const bright = Math.pow(Math.max(0, d - 0.08), 1.4) * 0.92;
    const hue = lerp(0.60, 0.04, sm(0.18, 0.88, d)) + Math.sin(t * 0.08) * 0.05;
    const [r, g, b] = hsl(hue, 0.85 + d * 0.15, bright);
    const coreBoost = Math.max(0, d - 0.75) * 3.5;
    return [r + coreBoost * 0.4, g + coreBoost * 0.3, b + coreBoost * 0.2];
  },
  // Twinkling stars, per pixel on top of the (blended) cloud colour.
  detail(p, ctx, c) {
    const { t, dt } = ctx;
    const ns = ctx.stars[p.i]; ns.next -= dt;
    let sr = 0, sg = 0, sb = 0;
    if (ns.next <= 0) { ns.bright = 0.6 + Math.random() * 0.4; ns.next = 4 + Math.random() * 12; ns.last = t; }
    if (ns.bright > 0) { ns.bright = Math.max(0, ns.bright - dt * 1.2); const sc = ns.bright; sr = sc; sg = sc; sb = sc + 0.2; }
    return [Math.min(1, c[0] + sr), Math.min(1, c[1] + sg), Math.min(1, c[2] + sb)];
  },
});
