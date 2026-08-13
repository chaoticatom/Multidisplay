// Wall-mode counterpart to tide.js - same idea as gradientWashWall.js vs
// gradientWash.js. The cube version blends three sine waves driven by
// surfX/Y/Z (3D cube-surface coords, 0-1); flattened here to 2D wall coords
// using the same x=x/wallW, y=y/wallH convention as prismWall.js (0-1,
// unshifted, matching tide.js's own unshifted x/y/z). The z-driven wave
// (w2, originally out of phase with the x wave) has no z axis to read on a
// flat wall, so it's re-derived from y instead (a second wave off the
// perpendicular axis, keeping the same "three waves, three phases" blend
// shape) - see the w2 comment below. Hue/brightness math is unchanged.
const { hsl, lerp } = require('../core');

function effectTideWall(core, dt) {
  core.t += dt * 0.6;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let yy = 0; yy < wallH; yy++) {
    const y = yy / wallH;
    for (let xx = 0; xx < wallW; xx++) {
      const x = xx / wallW;
      const w1 = Math.sin(x * Math.PI * 2 + t * 0.8) * 0.5 + 0.5;
      // w2 originally read surfZ (depth axis); no z on a flat wall, so this
      // reuses y with the same frequency/phase-offset shape as the cube's z wave
      const w2 = Math.sin(y * Math.PI * 2 - t * 0.6) * 0.5 + 0.5;
      const w3 = Math.sin(y * Math.PI * 1.5 + t * 0.4) * 0.5 + 0.5;
      const blend = (w1 + w2 + w3) / 3;
      const [r, g, b] = hsl((x * 0.3 + y * 0.3 + blend * 0.25 + t * 0.04) % 1, 0.95, lerp(0.18, 0.72, blend));
      core.setWallPixel(xx, yy, r, g, b);
    }
  }
}

module.exports = effectTideWall;
