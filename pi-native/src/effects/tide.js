// Beach Tide (was Color Tide): waves rolling onto a beach at sunset. A sky
// fading from gold to violet with the sun low over the sea and its glitter
// path on the water; swell lines rolling in, closer together towards the
// horizon; a wash that slides up the sand and drains back, white foam on its
// edge and a darker, shining band of wet sand behind it. One definition for
// cube and wall (see ./surface.js).
'use strict';

const { defineFieldEffect } = require('./surface');
const { sceneUV, vnoise, clamp, smooth } = require('./sceneKit');

module.exports = defineFieldEffect({
  fine: true,
  speed: 0.5,
  pixel(p, { t, core }) {
    const [x, y, w] = sceneUV(p, core), HOR = 0.4, sunX = w * 0.62, sunY = 0.3;
    // The wash: slides up the beach and back, rippling along its edge.
    const wash = 0.7 + 0.07 * Math.sin(t * 0.55) + 0.025 * Math.sin(x * 4 + t * 0.9) + 0.015 * (vnoise(x * 6, t * 0.3) - 0.5);
    if (y < HOR) {
      // Sky + sun.
      const k = y / HOR; let r = 0.35 + 0.6 * k, g = 0.12 + 0.45 * k, b = 0.35 - 0.15 * k;
      const ds = Math.hypot(x - sunX, (y - sunY) * 1.1), sun = smooth(0.075, 0.06, ds), glow = Math.exp(-ds * 7) * 0.5;
      r += sun + glow; g += sun * 0.85 + glow * 0.55; b += sun * 0.5 + glow * 0.15;
      const cloud = smooth(0.55, 0.75, vnoise(x * 2.5 + t * 0.03, y * 8)) * (1 - k) * 0.25; r += cloud * 0.6; g += cloud * 0.35; b += cloud * 0.4;
      return [Math.min(1, r * 0.75), Math.min(1, g * 0.75), Math.min(1, b * 0.75)];
    }
    if (y < wash) {
      // The sea: deeper blue near the horizon, swell lines rolling in.
      const d = (y - HOR) / (wash - HOR), persp = 1 / (0.15 + d);
      let r = 0.02 + 0.08 * d, g = 0.12 + 0.2 * d, b = 0.25 + 0.2 * d;
      const swell = Math.pow(0.5 + 0.5 * Math.sin(persp * 2.2 - t * 1.6 + Math.sin(x * 3 + t * 0.4) * 0.6), 6) * (0.15 + 0.35 * d);
      r += swell; g += swell; b += swell;
      // The sun's glitter path.
      const gl = Math.exp(-Math.abs(x - sunX) * (6 + 10 * (1 - d))) * Math.pow(vnoise(x * 40, y * 80 + t * 3), 4) * 1.4;
      r += gl; g += gl * 0.75; b += gl * 0.4;
      // Foam on the wash's edge.
      const foam = smooth(0.012, 0, wash - y) * (0.6 + 0.4 * vnoise(x * 30, t * 2)); r += foam; g += foam; b += foam;
      return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
    }
    // The beach: wet and shining just behind the wash, dry and warm higher up.
    const wet = Math.exp(-(y - wash) * 28), grain = 0.9 + 0.2 * vnoise(x * 70, y * 70);
    let r = (0.62 - 0.35 * wet) * grain, g = (0.47 - 0.25 * wet) * grain, b = (0.3 - 0.12 * wet) * grain;
    const shine = wet * Math.exp(-Math.abs(x - sunX) * 5) * 0.4; r += shine; g += shine * 0.75; b += shine * 0.45;
    return [r * 0.8, g * 0.8, b * 0.8];
  },
});
