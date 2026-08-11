// Ported verbatim (math unchanged) from effects-motion.js's effectPlasma().
const { hsl } = require('../core');

function effectPlasma(core, dt) {
  core.t += dt * 0.75;
  const { N, surfX, surfY, surfZ, t } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const cx = x - 0.5, cy = y - 0.5, cz = z - 0.5, dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const v = Math.sin(x * 7.1 + t)
            + Math.sin(y * 6.3 + t * 1.3)
            + Math.sin(z * 7.5 + t * 0.9)
            + Math.sin((x + y + z) * 4.2 + t * 0.5)
            + Math.sin(dist * 11 + t * 1.6) * 0.6;
    const bright = Math.pow((Math.sin(v * 1.3) * 0.5 + 0.5), 1.2) * 0.75;
    const hue = ((v * 0.12 + t * 0.04) % 1 + 1) % 1;
    const sat = 0.85 + Math.sin(t * 0.7 + dist * 3) * 0.15;
    const [r, g, b] = hsl(hue, sat, bright);
    // chromatic split on bright peaks
    const peak = Math.max(0, bright - 0.55) * 2;
    core.setLED(i, Math.min(1, r + peak * 0.3), g, Math.min(1, b + peak * 0.15));
  }
}

module.exports = effectPlasma;
