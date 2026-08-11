// Ported verbatim (math unchanged) from effects-motion.js's effectAurora().
const { hsl, lerp, sm } = require('../core');

let auroraStar = null;

function effectAurora(core, dt) {
  core.t += dt * 0.35;
  const { N, surfX, surfY, surfZ, t } = core;
  if (!auroraStar || auroraStar.length !== N) {
    auroraStar = new Float32Array(N);
    for (let i = 0; i < N; i++) auroraStar[i] = Math.random() < 0.014 ? Math.random() : 0;
  }
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const c1 = Math.sin(x * Math.PI * 3.5 + t * 0.65) * Math.sin(z * Math.PI * 2.8 + t * 0.42);
    const c2 = Math.sin(x * Math.PI * 2.2 - t * 0.38) * Math.cos(z * Math.PI * 1.9 + t * 0.55) * 0.6;
    const curtain = c1 + c2;
    const fade = Math.pow(Math.max(0, y), 0.45);
    const bright = Math.max(0, curtain) * fade * 0.88;
    if (bright > 0.02) {
      const hue = lerp(0.30, 0.82, sm(0, 1, x + Math.sin(t * 0.28) * 0.25)) + Math.sin(t * 0.1) * 0.04;
      const sat = 0.9 + Math.sin(t * 0.8 + x * 2) * 0.1;
      const [r, g, b] = hsl(hue, sat, bright);
      // second curtain color (magenta hints)
      const [r2, g2, b2] = hsl(hue + 0.45, sat, bright * 0.4 * Math.max(0, c2));
      core.setLED(i, Math.min(1, r + r2), Math.min(1, g + g2), Math.min(1, b + b2));
    } else {
      // starfield on dark areas
      const s = auroraStar[i];
      if (s > 0) { const tw = 0.5 + 0.5 * Math.sin(t * 2.3 + s * 12.7); core.setLED(i, tw * 0.55, tw * 0.55, tw * 0.65); }
      else core.setLED(i, 0, 0, 0);
    }
  }
}

module.exports = effectAurora;
