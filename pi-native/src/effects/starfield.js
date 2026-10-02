// Starfield: a slow flight through deep space - three layers of stars
// streaming out from the centre at different depths, over a faint drifting
// nebula. On the cube the stars stream across every face around you; on a
// flat wall they fly out of the screen. Faster with the music.
'use strict';
const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
let travel = 0;

module.exports = defineFieldEffect({
  speed: 1,
  frame({ core, dt }) {
    const lvl = core.audio && core.audio.level ? core.audio.level : 0;
    travel += dt * (0.12 + lvl * 0.5);
  },
  pixel(p, { t, core }) {
    // Angle around the view direction, and distance from it (0 centre .. 1 edge).
    let ang, rad;
    if (p.flat) {
      const asp = core.wallW / core.wallH, dx = (p.x - 0.5) * asp, dy = p.y - 0.5;
      ang = Math.atan2(dy, dx); rad = Math.sqrt(dx * dx + dy * dy) * 1.6;
    } else {
      const dx = p.x - 0.5, dy = p.y - 0.5, dz = p.z - 0.5, l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      ang = Math.atan2(dz / l, dx / l); rad = Math.acos(Math.max(-1, Math.min(1, dy / l))) / Math.PI * 1.6;
    }
    let r = 0, g = 0, b = 0;
    const bg = hsl(0.66 + 0.08 * Math.sin(ang * 2 + t * 0.05), 0.7, 0.03 + 0.03 * Math.max(0, Math.sin(ang * 3 + rad * 4 - t * 0.1)));
    r += bg[0]; g += bg[1]; b += bg[2];
    for (let layer = 0; layer < 3; layer++) {
      const spokes = 70 + layer * 40;
      const cell = Math.floor((ang / (Math.PI * 2) + 0.5) * spokes);
      const seed = hash(cell, layer);
      const z = (seed + travel * (0.6 + layer * 0.4)) % 1;     // 0 far .. 1 near
      const starR = z * z * 1.6;                               // perspective: speeds up as it nears
      const width = 0.02 + z * 0.08;
      const d = Math.abs(rad - starR);
      if (d < width && hash(cell, layer + 9) > 0.35) {
        const cAng = ((cell + 0.5) / spokes - 0.5) * Math.PI * 2;
        const across = Math.abs(((ang - cAng + Math.PI) % (Math.PI * 2)) - Math.PI) * rad * spokes / 6;
        const v = (1 - d / width) * Math.max(0, 1 - across) * Math.min(1, z * 2.2);
        const tint = hash(cell, layer + 3);
        r += v * (0.8 + tint * 0.2); g += v * 0.85; b += v * (1 - tint * 0.2 + 0.15);
      }
    }
    return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
  },
});
