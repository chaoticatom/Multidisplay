// Lava Lamp: soft glowing blobs that drift, merge and split (metaballs).
// The blobs swell with the bass while music plays. One definition for cube
// and wall (see ./surface.js): on the cube the blobs move through the
// cube's volume, so they flow across faces and edges.
'use strict';
const { hsl } = require('../core');
const { defineFieldEffect } = require('./surface');

const N = 6;
const balls = Array.from({ length: N }, (_, i) => ({ x: 0, y: 0, z: 0, r: 0, s: 0.37 + i * 0.13, o: i * 1.7 }));

module.exports = defineFieldEffect({
  smooth: true, // slowly varying field: see surface.js
  speed: 0.35,
  frame({ t, core, flat }) {
    const bass = core.audio && core.audio.bass ? core.audio.bass : 0;
    for (const b of balls) {
      b.x = 0.5 + 0.34 * Math.sin(t * b.s + b.o);
      b.y = 0.5 + 0.38 * Math.sin(t * b.s * 0.71 + b.o * 2.1);
      b.z = flat ? 0.5 : 0.5 + 0.34 * Math.cos(t * b.s * 0.53 + b.o * 0.6);
      b.r = (0.085 + 0.02 * Math.sin(t * 1.3 + b.o)) * (1 + bass * 0.6);
    }
  },
  pixel(p, { t }) {
    let f = 0;
    for (const b of balls) {
      const dx = p.x - b.x, dy = p.y - b.y, dz = p.flat ? 0 : p.z - b.z;
      f += (b.r * b.r) / (dx * dx + dy * dy + dz * dz + 1e-4);
    }
    const hue = 0.93 + 0.12 * Math.sin(t * 0.05) + Math.min(0.15, f * 0.02);
    if (f > 1) {
      const core = Math.min(1, (f - 1) * 0.6);
      return hsl(hue, 1, 0.42 + core * 0.18);
    }
    const glow = Math.pow(f, 3) * 0.35; // soft halo outside the blob edge
    const bg = hsl(hue + 0.55, 0.8, 0.04 + p.y * 0.03);
    const c = hsl(hue, 1, 0.5);
    return [bg[0] + c[0] * glow, bg[1] + c[1] * glow, bg[2] + c[2] * glow];
  },
});
