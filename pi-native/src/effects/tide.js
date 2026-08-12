// Ported verbatim (math unchanged) from effects-colour.js's effectTide().
const { hsl, lerp } = require('../core');

function effectTide(core, dt) {
  core.t += dt * 0.6;
  const { N, surfX, surfY, surfZ, t } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const w1 = Math.sin(x * Math.PI * 2 + t * 0.8) * 0.5 + 0.5;
    const w2 = Math.sin(z * Math.PI * 2 - t * 0.6) * 0.5 + 0.5;
    const w3 = Math.sin(y * Math.PI * 1.5 + t * 0.4) * 0.5 + 0.5;
    const blend = (w1 + w2 + w3) / 3;
    const [r, g, b] = hsl((x * 0.3 + z * 0.3 + blend * 0.25 + t * 0.04) % 1, 0.95, lerp(0.18, 0.72, blend));
    core.setLED(i, r, g, b);
  }
}

module.exports = effectTide;
