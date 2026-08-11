// Wall-mode counterpart to gradientWash.js - same math, but sampling x/y
// across the WHOLE stitched wall canvas (core.wallW/wallH) instead of one
// cube's surfX/Y/Z, so the wash flows continuously across however many
// panels are arranged, based on where each one was dragged in the grid.
//
// Only effect ported for wall mode so far (see pi-native's pending task
// list) - proves the wall canvas end-to-end. Adapting the rest of the
// effect library to also have a wall-aware variant is separate follow-up
// work, one effect at a time, same pattern as the cube-effect ports.
const { hsl, lerp } = require('../core');

function effectGradientWashWall(core, dt) {
  core.t += dt * 0.4;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let y = 0; y < wallH; y++) {
    const ny = y / wallH;
    for (let x = 0; x < wallW; x++) {
      const nx = x / wallW;
      const wave = Math.sin(nx * Math.PI * 2 + t) * 0.5 + 0.5;
      const bright = lerp(0.22, 0.72, wave);
      const hue = (nx * 0.6 + ny * 0.3 + t * 0.08) % 1;
      const [r, g, b] = hsl(hue, 1, bright);
      core.setWallPixel(x, y, r, g, b);
    }
  }
}

module.exports = effectGradientWashWall;
