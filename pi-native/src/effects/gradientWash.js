// Ported verbatim from effects-colour.js's effectGradientWash().
const { hsl, lerp } = require('../core');

function effectGradientWash(core, dt) {
  core.t += dt * 0.4;
  const { N, surfX, surfY, surfZ, t } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const wave = Math.sin(x * Math.PI * 2 + t) * 0.5 + 0.5;
    const bright = lerp(0.22, 0.72, wave);
    const hue = (x * 0.4 + y * 0.3 + z * 0.3 + t * 0.08) % 1;
    const [r, g, b] = hsl(hue, 1, bright);
    core.setLED(i, r, g, b);
  }
}

module.exports = effectGradientWash;
