// Wall-mode counterpart to wave.js - same idea as gradientWashWall.js vs
// gradientWash.js. The cube version's x/y/z are surfX/Y/Z (3D cube-surface
// coords, 0-1); flattened here to 2D wall coords using the same unshifted
// x=x/wallW, y=y/wallH convention as prismWall.js/tideWall.js (matching
// wave.js's own unshifted x/y/z).
//
// wave.js weaves three sine terms across all three axes (w1 reads x+z,
// w2 reads x-z, w3 reads the average of all three) specifically to get
// crossing interference ripples, not a single travel direction - simply
// dropping z (à la depthRingsWall/prismWall's `cross = 0`) would collapse
// w1 and w2 into near-duplicates of each other and lose that crossing
// character. Instead this follows tideWall.js's precedent of re-deriving
// the missing z term from the wall's other spatial axis (y) rather than
// discarding it outright, so w1/w2/w3 keep reading two independent-looking
// terms each, same shape of interference as the cube version, just y
// doing double duty as both "y" and "z". Hue/sparkle math is otherwise
// unchanged, just fed the recomputed w1/w2/w3.
const { hsl } = require('../core');

function effectWaveWall(core, dt) {
  core.t += dt * 1.1;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let yy = 0; yy < wallH; yy++) {
    const y = yy / wallH;
    for (let xx = 0; xx < wallW; xx++) {
      const x = xx / wallW;
      const z = y; // no third axis on a flat wall - reuse y (see header comment)
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
      core.setWallPixel(xx, yy, r, g, b);
    }
  }
}

module.exports = effectWaveWall;
