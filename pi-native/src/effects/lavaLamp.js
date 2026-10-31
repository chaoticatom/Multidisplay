// Lava Lamp: soft glowing blobs that drift, merge and split (metaballs).
// The blobs swell with the bass while music plays. One definition for cube
// and wall (see ./surface.js): on the cube the blobs slide over the outside
// of the cube (there's no inside to see), flowing across faces and edges.
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
      if (!flat) {
        // Pushed out onto the cube's surface: a blob deep inside used to show
        // only as a faint smudge on every face (a real report: "the lava lamp
        // seems to be inside the cube").
        const dx = b.x - 0.5, dy = b.y - 0.5, dz = b.z - 0.5, m = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz), 1e-3), k = 0.5 / m;
        b.x = 0.5 + dx * k; b.y = 0.5 + dy * k; b.z = 0.5 + dz * k;
      }
      b.r = ((flat ? 0.085 : 0.11) + 0.02 * Math.sin(t * 1.3 + b.o)) * (1 + bass * 0.6); // a little bigger on the cube: the blobs sit on its faces
    }
  },
  pixel(p, { t }) {
    let f = 0, gx = 0, gy = 0;
    for (const b of balls) {
      const dx = p.x - b.x, dy = p.y - b.y, dz = p.flat ? 0 : p.z - b.z;
      const d2 = dx * dx + dy * dy + dz * dz + 1e-4, k = (b.r * b.r) / d2;
      f += k; gx += -2 * k * dx / d2; gy += -2 * k * dy / d2;
    }
    const hue = 0.93 + 0.12 * Math.sin(t * 0.05) + Math.min(0.05, f * 0.01);
    if (f > 1) {
      // Glossy wax: treat the field as height and light it from the top-left,
      // with a hot glow from the lamp's base and a sharp highlight.
      const s = 0.9 / (f * f), nx = -gx * s, ny = -gy * s, nl = Math.hypot(nx, ny, 1); // height 1 - 1/f: rounded, flat on top
      const lam = Math.max(0, (-nx * 0.5 - ny * 0.6 + 0.62) / nl);
      const spec = Math.pow(Math.max(0, (-nx * 0.35 - ny * 0.45 + 0.82) / nl), 30) * 0.8;
      const rim = Math.max(0, 1 - (f - 1) * 2) * 0.08; // edges glow, light passing through wax
      const base = hsl(hue, 1, 0.12 + 0.5 * lam + rim);
      const under = Math.max(0, p.y - 0.4) * 0.25; // warm light from below
      return [Math.min(1, base[0] + spec + under), Math.min(1, base[1] + spec * 0.9 + under * 0.4), Math.min(1, base[2] + spec * 0.8)];
    }
    const glow = Math.pow(f, 3) * 0.35; // soft halo outside the blob edge
    const bg = hsl(hue + 0.55, 0.8, 0.008 + p.y * 0.01); // near black, so the wax stands out
    const c = hsl(hue, 1, 0.5);
    return [bg[0] + c[0] * glow, bg[1] + c[1] * glow, bg[2] + c[2] * glow];
  },
});
