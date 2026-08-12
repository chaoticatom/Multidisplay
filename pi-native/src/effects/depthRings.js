// Ported verbatim (math unchanged) from effects-colour.js's effectDepthRings().
const { hsl } = require('../core');

function effectDepthRings(core, dt) {
  core.t += dt * 0.75;
  const { N, surfX, surfY, surfZ, t } = core;
  for (let i = 0; i < N; i++) {
    const dx = surfX[i] - 0.5, dy = surfY[i] - 0.5, dz = surfZ[i] - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) * 2;
    const ang = Math.atan2(dy, dx);
    const twist = ang * 1.6 + dist * 2.5;
    const ring = Math.sin(dist * Math.PI * 9 - t * 2.4 + twist);
    const ring2 = Math.sin(dist * Math.PI * 4.5 + t * 1.1 + ang);
    const bright = ((ring * 0.6 + ring2 * 0.4) * 0.5 + 0.5) * (1 - dist * 0.42) * 0.88;
    const hue = (dist * 0.65 + ang / (Math.PI * 2) * 0.3 + t * 0.055) % 1;
    core.setLED(i, ...hsl(hue, 1, Math.max(0, bright)));
  }
}

module.exports = effectDepthRings;
