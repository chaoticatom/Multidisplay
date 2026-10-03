// Ported verbatim (math unchanged) from effects-motion.js's effectWarp().
const { hsl } = require('../core');
const { trailFade } = require('./trail');

let warpStars = [];

function resetWarp(core) {
  warpStars = [];
  const N = core.N;
  for (let i = 0; i < Math.max(120, N * 0.12) | 0; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = 0.08 + Math.random() * 0.35;
    warpStars.push({ x: 0.5, y: 0.5, z: 0.5, ox: Math.sin(ph) * Math.cos(th) * 0.001, oy: Math.sin(ph) * Math.sin(th) * 0.001, oz: Math.cos(ph) * 0.001, sp, hue: Math.random() * 0.2 + 0.55, life: Math.random() });
  }
}

function effectWarp(core, dt) {
  core.t += dt;
  const { SIZE, N, colBuf } = core;
  if (!warpStars.length) resetWarp(core);
  const fade = trailFade(0.78, dt); // was a fixed *= 0.78 per frame - see trail.js
  for (let i = 0; i < N * 3; i++) colBuf[i] *= fade;
  for (const s of warpStars) {
    s.life += dt; s.x += s.ox * s.sp * SIZE * dt * 60; s.y += s.oy * s.sp * SIZE * dt * 60; s.z += s.oz * s.sp * SIZE * dt * 60;
    const wx = s.x, wy = s.y, wz = s.z;
    if (wx < 0 || wx > 1 || wy < 0 || wy > 1 || wz < 0 || wz > 1) { s.x = 0.5; s.y = 0.5; s.z = 0.5; s.sp = 0.08 + Math.random() * 0.35; s.life = 0; s.hue = Math.random() * 0.2 + 0.55; continue; }
    // brightness ramps with distance from center (speed illusion)
    const dist = Math.sqrt((wx - 0.5) ** 2 + (wy - 0.5) ** 2 + (wz - 0.5) ** 2) * 2;
    const bright = dist * 0.75 * Math.min(1, s.life * 3);
    // Project the star onto each face: one colour for the centre, one for
    // the glow ring (worked out once per star - it was 54 hsl() calls and
    // 7 small arrays per star per frame).
    const core1 = bright * 0.85, glow1 = bright * 0.25 * 0.85;
    if (core1 < 0.01) continue;
    const cc = hsl(s.hue + dist * 0.15, 0.8, core1);
    const gc = glow1 >= 0.01 ? hsl(s.hue + dist * 0.15, 0.8, glow1) : null;
    for (let f = 0; f < 6; f++) {
      const fu = f < 2 ? wx : f < 4 ? wz : wx, fv = f < 4 ? wy : wz;
      const pu = (fu * SIZE) | 0, pv = (fv * SIZE) | 0;
      for (let sx = -1; sx <= 1; sx++) for (let sy = -1; sy <= 1; sy++) {
        const c = sx === 0 && sy === 0 ? cc : gc;
        if (c) core.setFaceLED(f, pu + sx, pv + sy, c[0], c[1], c[2]);
      }
    }
  }
}

module.exports = effectWarp;
