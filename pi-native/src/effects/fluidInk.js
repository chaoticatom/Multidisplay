// Fluid Ink: swirling ink clouds made by warping a smooth pattern through
// itself twice (domain warping). Bass makes the ink churn harder and the
// colours flare; it drifts calmly in silence.
'use strict';
const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

const PALETTE = [[0.02, 0.02, 0.1], [0.05, 0.25, 0.6], [0.1, 0.8, 0.9], [0.95, 0.95, 1], [0.85, 0.2, 0.75]];
function ink(v) {
  const x = Math.max(0, Math.min(0.9999, v)) * (PALETTE.length - 1), i = Math.floor(x), f = x - i;
  const a = PALETTE[i], b = PALETTE[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const wave = (x, y, z, t) => Math.sin(x * 3.1 + t) * Math.cos(y * 2.7 - t * 0.8) + Math.sin((x + z) * 2.3 + t * 0.6) * 0.6 + Math.cos((y - z) * 3.7 - t * 0.4) * 0.4;
let stir = 0;

module.exports = defineFieldEffect({
  speed: 0.4,
  frame({ core, dt }) {
    const bass = core.audio && core.audio.bass ? core.audio.bass : 0;
    stir += (bass - stir) * Math.min(1, dt * 4);
  },
  pixel(p, { t }) {
    const k = 1.25, x = p.x * k, y = p.y * k, z = (p.flat ? 0.3 : p.z) * k;
    const w = 0.9 + stir * 1.2;
    const qx = wave(x, y, z, t), qy = wave(y + 5.2, z + 1.3, x, t * 1.1);
    const rx = wave(x + w * qx, y + w * qy, z, t * 0.7 + 1.7), ry = wave(y + w * qy + 8.3, z, x + w * qx, t * 0.9);
    const v = wave(x + w * rx, y + w * ry, z + 0.5, t * 0.5);
    const c = ink(0.42 + 0.2 * v + 0.1 * rx);
    const flare = stir * 0.25 * Math.max(0, ry);
    const tint = hsl(0.55 + 0.1 * Math.sin(t * 0.07), 0.9, 0.5);
    return [c[0] + tint[0] * flare, c[1] + tint[1] * flare, c[2] + tint[2] * flare];
  },
});
