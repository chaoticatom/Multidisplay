// Colour Falls (was Wave Cascade): a waterfall of colour. Ribbons of light
// pour over a dark ledge across the width, rippling as they fall, each its
// own hue drifting along the rainbow; at the foot they burst into glowing
// mist with spray rising, over a pool of shimmering reflections. With music
// the falls run brighter. One definition for cube and wall (see ./surface.js).
'use strict';

const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');
const { sceneUV, vnoise, hash2, clamp, smooth } = require('./sceneKit');

module.exports = defineFieldEffect({
  fine: true,
  speed: 0.7,
  pixel(p, { t, core }) {
    const [x, y, w] = sceneUV(p, core), lvl = core && core.audio && core.audio.active ? core.audio.level : 0;
    const LEDGE = 0.14, POOL = 0.78;
    const hue = (x / w * 0.85 + t * 0.03) % 1, [hr, hg, hb] = hsl(hue, 0.9, 0.5);
    if (y < LEDGE) { // the ledge: dark rock with the water's bright lip
      const lip = smooth(LEDGE - 0.03, LEDGE, y) * 0.8, rock = 0.03 + 0.04 * vnoise(x * 12, y * 30);
      return [rock + hr * lip, rock + hg * lip, rock * 1.2 + hb * lip];
    }
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
  },
});
