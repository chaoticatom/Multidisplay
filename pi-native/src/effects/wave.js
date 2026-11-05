// Colour Falls (was Wave Cascade): a waterfall of colour. Ribbons of light
// pour from the top edge across the width, rippling as they fall, each its
// own hue drifting along the rainbow; at the foot they burst into glowing
// mist with spray rising, over a pool of shimmering reflections. With music
// the falls run brighter. One definition for cube and wall (see ./surface.js).
'use strict';

const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');
const { ringUV, sceneUV, vnoise, hash2, clamp, smooth } = require('./sceneKit');

module.exports = defineFieldEffect({
  fine: true,
  speed: 0.7,
  pixel(p, { t, core }) {
    const lvl = core && core.audio && core.audio.active ? core.audio.level : 0;
    if (p.flat) { const [x, y, w] = sceneUV(p, core); return scene(x, y, w, t, lvl, 0.85); }
    // The cube: one rainbow of falls wrapped round the sides (blended over
    // the one seam), fed from the top - water spreading out from its centre
    // over all four edges, each edge the colour of the side below it - and
    // the pool's mist across the bottom.
    const [x, y, , side, bottom] = ringUV(p);
    if (side) {
      if (x < 3.8) return scene(x, y, 4, t, lvl, 1);
      const a = scene(x, y, 4, t, lvl, 1), b = scene(x - 4, y, 4, t, lvl, 1), k = (x - 3.8) / 0.2;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
    // Top or bottom: where on the cube's edge this point looks out to, and how far in from it.
    const dx = x - 0.5, dz = y - 0.5, d = 0.5 - Math.max(Math.abs(dx), Math.abs(dz));
    const [s] = ringUV({ x: p.x, y: 0.5, z: p.z });
    return bottom ? scene(s, 0.97 + 0.03 * (1 - 2 * d), 4, t, lvl, 1) : scene(s, -d * 0.9, 4, t, lvl, 1);
  },
});

// One pixel of the falls at (x, y): x 0..w across, y 0 at the top, below 0
// above it (the cube's top, flowing out to its edges). span: the share of the
// rainbow across w (1 = all the way round, for the cube).
function scene(x, y, w, t, lvl, span) {
    const LEDGE = 0, POOL = 0.78;
    const hue = (((x / w * span + t * 0.03) % 1) + 1) % 1, [hr, hg, hb] = hsl(hue, 0.9, 0.5);
    if (y < POOL) { // the falling water: streaks rushing down, rippling sideways
      const col = Math.floor(x * 40), sp = 0.7 + hash2(col, 7) * 0.6;
      const wob = 0.015 * Math.sin(y * 20 + t * 3 + col);
      const streak = 0.35 + 0.65 * Math.pow(vnoise((x + wob) * 40, y * 6 - t * 4.5 * sp), 1.6);
      const fall = (y - LEDGE) / (POOL - LEDGE), k = streak * (0.55 + 0.35 * (1 - fall)) * (0.9 + 0.4 * lvl);
      const mist = smooth(0.7, 1, fall) * 0.35;
      return [hr * k + mist, hg * k + mist, hb * k + mist];
    }
    // The foot: glowing mist and rising spray over a rippling pool.
    const d = (y - POOL) / (1 - POOL), mist = Math.exp(-d * 4) * (0.5 + 0.3 * vnoise(x * 10 + t * 0.5, y * 10 - t)) ;
    const spray = hash2(Math.floor(x * 60), Math.floor((y * 60 + t * 20))) > 0.985 ? 0.6 * (1 - d) : 0;
    const ripple = Math.pow(0.5 + 0.5 * Math.sin(d * 40 - t * 3 + Math.sin(x * 9) * 2), 8) * 0.25 * (1 - d * 0.5);
    const k = 0.25 * (1 - d) + ripple;
    return [Math.min(1, hr * k + mist + spray), Math.min(1, hg * k + mist + spray), Math.min(1, hb * k + mist * 1.1 + spray)];
}

