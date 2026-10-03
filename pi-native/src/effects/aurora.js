// Ported verbatim (math unchanged) from effects-motion.js's effectAurora().
//
// One definition for cube and wall (see ./surface.js). Wall notes:
//   Wall-mode counterpart to aurora.js - same idea as gradientWashWall.js vs
//   gradientWash.js. x flattened to unshifted x=x/wallW (matching
//   prismWall.js/tideWall.js's convention, and aurora.js's own unshifted x).
//   y flattened to ny = 1 - y/wallH so "up" still means the same thing it
//   did in the cube version: aurora.js's y=1 is the cube's top face, and
//   `fade` brightens the curtains toward it, so this remaps wall row 0
//   (top of the stitched image) to ny=1 to keep that "brighter near the
//   top" character rather than inverting it.
//   
//   aurora.js's curtain shape (c1/c2) reads x for its horizontal drift and
//   z for a second, independent horizontal axis that gives the curtains
//   their fold/twist - a flat wall only has one horizontal axis, and unlike
//   wave.js/plasma.js's z terms (which read genuinely interchangeable
//   spatial axes), reusing wall-y for aurora's z would tie the curtain fold
//   to vertical position, which reads as a completely different (and
//   wrong-looking) effect from cube aurora's horizontal fold. So z is
//   dropped spatially (not reused) but its *time* component is kept, so the
//   curtains still shimmer/breathe over time instead of the fold pattern
//   going fully static - closer in spirit to the original than either
//   alternative.
'use strict';

const { hsl, lerp, sm } = require('../core');
const { defineFieldEffect } = require('./surface');

// Twinkling background stars, one array per mode (cube LEDs / wall pixels).
const stars = { cube: null, wall: null };

module.exports = defineFieldEffect({
  smooth: true, // slowly varying curtains; stars are added per pixel in detail()
  speed: 0.35,
  frame(ctx) {
    const key = ctx.flat ? 'wall' : 'cube';
    if (!stars[key] || stars[key].length !== ctx.count) {
      stars[key] = new Float32Array(ctx.count);
      for (let i = 0; i < ctx.count; i++) stars[key][i] = Math.random() < 0.014 ? Math.random() : 0;
    }
    ctx.stars = stars[key];
  },
  pixel(p, ctx) {
    const { t } = ctx;
    // On a wall: height runs bottom-up (y flipped) and there's no depth
    // axis (z = 0, so the curtain only moves in time along it).
    const x = p.x, y = p.flat ? 1 - p.y : p.y, z = p.flat ? 0 : p.z;
    const c1 = Math.sin(x * Math.PI * 3.5 + t * 0.65) * Math.sin(z * Math.PI * 2.8 + t * 0.42);
    const c2 = Math.sin(x * Math.PI * 2.2 - t * 0.38) * Math.cos(z * Math.PI * 1.9 + t * 0.55) * 0.6;
    const curtain = c1 + c2;
    const fade = Math.pow(Math.max(0, y), 0.45);
    const bright = Math.max(0, curtain) * fade * 0.88;
    if (bright > 0.02) {
      const hue = lerp(0.30, 0.82, sm(0, 1, x + Math.sin(t * 0.28) * 0.25)) + Math.sin(t * 0.1) * 0.04;
      const sat = 0.9 + Math.sin(t * 0.8 + x * 2) * 0.1;
      const [r, g, b] = hsl(hue, sat, bright);
      const [r2, g2, b2] = hsl(hue + 0.45, sat, bright * 0.4 * Math.max(0, c2));
      return [Math.min(1, r + r2), Math.min(1, g + g2), Math.min(1, b + b2)];
    }
    return [0, 0, 0];
  },
  // Stars twinkle in the dark sky between the curtains (per pixel, on top
  // of the blended curtain colour).
  detail(p, ctx, c) {
    const s = ctx.stars[p.i];
    if (s > 0 && c[0] + c[1] + c[2] < 0.06) { const tw = 0.5 + 0.5 * Math.sin(ctx.t * 2.3 + s * 12.7); return [tw * 0.55, tw * 0.55, tw * 0.65]; }
    return c;
  },
});
