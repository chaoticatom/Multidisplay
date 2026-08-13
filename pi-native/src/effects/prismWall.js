// Wall-mode counterpart to prism.js - same idea as gradientWashWall.js vs
// gradientWash.js. The cube version's x/y/z are surfX/Y/Z (3D cube-surface
// coords, 0-1); flattened here to 2D wall coords using the same nx/ny
// centering convention as gradientWashWall.js/depthRingsWall.js: x = x/wallW,
// y = y/wallH (kept 0-1, unshifted, since prism.js's own x/y/z are 0-1 not
// centered) and the z axis (used in the cube version for `cross` and the
// beam's second sweep axis) is simply dropped - `cross` becomes 0 (no
// second axis to compare against) and the beam sweeps purely across x.
// Everything else (hue shift, sweep angle, dispersion) is unchanged.
const { hsl, sm } = require('../core');

function effectPrismWall(core, dt) {
  core.t += dt * 0.55;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const beamAng = t * 0.6, beamW = 0.18;
  for (let yy = 0; yy < wallH; yy++) {
    const y = yy / wallH;
    for (let xx = 0; xx < wallW; xx++) {
      const x = xx / wallW;
      const diagFull = (x + y) / 2; // 2D stand-in for (x+y+z)/3, z dropped (no z axis on a flat wall)
      const cross = 0; // no z axis on a flat wall to diff against x
      const base = 0.28 + Math.sin(diagFull * Math.PI * 5.5 + t) * 0.28;
      const hue = (diagFull * 0.92 + t * 0.065) % 1;
      let [r, g, b] = hsl(hue, 0.78 + sm(0, 1, cross) * 0.22, Math.max(0, base));
      // sweeping white diamond beam that disperses into rainbow - beam
      // originally swept across (x,z); with no z, it sweeps purely along x
      const bDist = Math.abs((x - 0.5) * Math.cos(beamAng));
      const beam = Math.max(0, 1 - bDist / beamW) * 0.8;
      if (beam > 0) {
        const dispHue = (hue + bDist * 1.5) % 1;
        const [dr, dg, db] = hsl(dispHue, 1, beam * 0.9);
        r = Math.min(1, r + dr * beam + beam * 0.3);
        g = Math.min(1, g + dg * beam + beam * 0.3);
        b = Math.min(1, b + db * beam + beam * 0.3);
      }
      core.setWallPixel(xx, yy, r, g, b);
    }
  }
}

module.exports = effectPrismWall;
