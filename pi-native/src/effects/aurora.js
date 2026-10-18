// Aurora Borealis: real flowing curtains over a dark range of hills. Three
// ribbons wave sideways across a starry sky; each hangs light upwards in fine
// shimmering rays that run green at the foot, through teal, to pink and violet
// at the top. The hills catch a faint green rim, and the light breathes with
// the music. One definition for cube and wall (see ./surface.js).
'use strict';

const { defineFieldEffect } = require('./surface');
const { sceneUV, hash2, vnoise, clamp, smooth } = require('./sceneKit');

const RIBBONS = [
  { base: 0.55, a: 0.1, f: 1.3, s: 0.22, h: 0.45, k: 1 },
  { base: 0.45, a: 0.08, f: 2.1, s: -0.17, h: 0.35, k: 0.75 },
  { base: 0.62, a: 0.09, f: 0.8, s: 0.12, h: 0.5, k: 0.55 },
];

module.exports = defineFieldEffect({
  fine: true,
  speed: 0.6,
  pixel(p, { t, core }) {
    const [x, y] = sceneUV(p, core), lvl = core && core.audio && core.audio.active ? core.audio.level : 0;
    // Night sky, lighter at the horizon.
    let r = 0.005 + 0.02 * y, g = 0.01 + 0.03 * y, b = 0.03 + 0.05 * y;
    // Stars (fainter behind the light).
    const cx = Math.floor(x * 46), cy = Math.floor(y * 46), sh = hash2(cx, cy);
    if (sh > 0.975 && y < 0.7) { const tw = 0.5 + 0.5 * Math.sin(t * (1.5 + sh * 4) + sh * 50); const dx = x * 46 - cx - 0.5, dy = y * 46 - cy - 0.5; const k = Math.max(0, 1 - (dx * dx + dy * dy) * 6) * 0.45 * tw; r += k; g += k; b += k; }
    // The curtains.
    let ar = 0, ag = 0, ab = 0;
    for (const R of RIBBONS) {
      const foot = R.base + R.a * Math.sin(x * R.f + t * R.s) + 0.03 * Math.sin(x * R.f * 2.7 - t * R.s * 1.7) + 0.02 * (vnoise(x * 3 + t * 0.2, R.base * 10) - 0.5);
      const d = foot - y; // how far above the curtain's foot
      if (d < -0.02 || d > R.h) continue;
      const rays = 0.15 + 1.1 * Math.pow(vnoise(x * 30 + Math.sin(t * 0.7 + x * 2) * 1.5, t * 0.4), 2.4); // fine vertical rays, shimmering
      const up = d < 0 ? Math.max(0, 1 + d / 0.02) : Math.exp(-d / (R.h * 0.45)) * (1 - smooth(R.h * 0.7, R.h, d));
      const k = up * rays * R.k * (0.85 + 0.5 * lvl), hgt = clamp(d / R.h);
      // green foot -> teal -> pink/violet top
      ar += k * (0.15 + 0.85 * smooth(0.45, 1, hgt)); ag += k * (1 - 0.75 * smooth(0.3, 1, hgt)); ab += k * (0.35 + 0.55 * smooth(0.2, 0.9, hgt));
    }
    r += ar * 0.85; g += ag * 0.9; b += ab * 0.85;
    // Hills: a dark ridge with a faint green rim lit by the aurora.
    const hill = 0.8 + 0.06 * Math.sin(x * 2.3 + 1) + 0.04 * Math.sin(x * 5.1) + 0.02 * vnoise(x * 9, 3);
    if (y > hill) { const rim = Math.exp(-(y - hill) * 90) * 0.18; return [0.004 + rim * 0.2, 0.008 + rim, 0.012 + rim * 0.5]; }
    return [Math.min(1.2, r), Math.min(1.2, g), Math.min(1.2, b)];
  },
});
