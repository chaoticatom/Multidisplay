// Ported verbatim (math unchanged) from effects-motion.js's effectWave().
// Only the plumbing changed: reads N/surfX,Y,Z/setLED/t off the passed
// `core` (a CubeCore instance) instead of bare globals, since there's no
// shared global scope here the way cube.js/effects-*.js rely on in the
// browser (all loaded as classic <script> tags into one window).
const { hsl } = require('../core');

function effectWave(core, dt) {
  core.t += dt * 1.1;
  const { N, surfX, surfY, surfZ, t } = core;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const w1 = Math.sin((x + z) * 6.2 + t) * Math.cos(y * 4.5 - t * 0.8);
    const w2 = Math.sin((x - z) * 4.8 + t * 1.4) * Math.sin(y * 5.2 + t * 0.6);
    const w3 = Math.sin((x * 0.7 + y * 0.9 + z * 0.5) * 7 + t * 0.9);
    const w = (w1 + w2 + w3) / 3;
    const bright = w * 0.5 + 0.5;
    const hue = (x * 0.35 + y * 0.25 + z * 0.35 + t * 0.045) % 1;
    let [r, g, b] = hsl(hue, 1, bright * 0.72);
    // caustic sparkle: where all 3 waves crest simultaneously
    const spark = Math.max(0, (w1 + w2 + w3 - 2.2) / 0.8);
    r = Math.min(1, r + spark * 0.9); g = Math.min(1, g + spark * 0.9); b = Math.min(1, b + spark * 0.9);
    core.setLED(i, r, g, b);
  }
}

module.exports = effectWave;
