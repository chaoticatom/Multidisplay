// Light Speed: a jump to hyperspace, again and again. Stars drift out from
// the centre, stretch into streaks as the ship speeds up, the tunnel glows
// blue, a white flash at full speed, then it drops out to a calm starfield
// and gathers for the next jump. Option speed (1-16) sets how fast it goes.
// One definition for cube and wall (see ./surface.js).
'use strict';

const { defineFieldEffect } = require('./surface');
const { ringUV, sceneUV, hash2, clamp, smooth } = require('./sceneKit');

const CYCLE = 12;
module.exports = defineFieldEffect({
  fine: true,
  speed: 1,
  pixel(p, { t, core }) {
    const opts = (core && core.effectOptions && core.effectOptions.lightspeed) || {};
    const sp = clamp((Number(opts.speed) || 8) / 8, 0.25, 2), ph = ((t * sp) % CYCLE) / CYCLE;
    // Warp factor over the cycle: calm, gather, streak, flash, drop out.
    const warp = smooth(0.15, 0.6, ph) * (1 - smooth(0.78, 0.9, ph)), flash = Math.exp(-(((ph - 0.72) / 0.025) ** 2));
    // Distance and direction from the centre of the jump. On a wall, the
    // middle of the picture; on the cube, the middle of the top, so the
    // stars stream out over its edges and down all four sides (r runs on
    // round the edge; the direction is the way round the cube).
    let r, ang;
    if (p.flat) { const [x, y, w] = sceneUV(p, core), dx = x - w / 2, dy = y - 0.5; r = Math.sqrt(dx * dx + dy * dy); ang = Math.atan2(dy, dx); }
    else {
      const [x, y, , side, bottom] = ringUV(p);
      if (side) { r = 0.27 + y * 0.6; ang = (x / 4) * 2 * Math.PI - Math.PI; }
      else if (bottom) return [0.004, 0.006, 0.02];
      else { const dx = x - 0.5, dz = y - 0.5; r = Math.max(Math.abs(dx), Math.abs(dz)) * 0.54; ang = (ringUV({ x: p.x, y: 0.5, z: p.z })[0] / 4) * 2 * Math.PI - Math.PI; }
    }
    const N = 260, idx = Math.floor((ang / (2 * Math.PI) + 0.5) * N), off = (ang / (2 * Math.PI) + 0.5) * N - idx - 0.5;
    let R = 0.004, G = 0.006, B = 0.02;
    // Tunnel glow.
    const tg = warp * Math.exp(-r * 2.5) * 0.35; R += tg * 0.3; G += tg * 0.5; B += tg;
    // Streaks: each star rides outwards; its length grows with the warp.
    for (let k = 0; k < 2; k++) {
      const id = idx * 2 + k, sd = hash2(id, 17); if (sd < 0.45) continue;
      const pos = ((t * sp * (0.15 + warp * 1.6) * (0.5 + sd) + hash2(id, 3)) % 1) * 0.9 + 0.03;
      const len = 0.004 + warp * 0.25 * (0.4 + pos), wid = 0.35 + 0.25 * k;
      if (r > pos - len && r < pos && Math.abs(off) < wid) {
        const a = (1 - (pos - r) / len) * (0.4 + pos) * (1 - Math.abs(off) / wid);
        const hue = hash2(id, 5); R += a * (0.7 + 0.3 * hue); G += a * 0.85; B += a;
      }
    }
    R += flash; G += flash; B += flash;
    return [Math.min(1.3, R), Math.min(1.3, G), Math.min(1.3, B)];
  },
});
