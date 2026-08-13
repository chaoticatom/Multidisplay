// Wall-mode counterpart to depthRings.js - same idea as gradientWashWall.js
// vs gradientWash.js. The cube version derives dist/ang from surfX/Y/Z (3D
// cube-surface coords) around the cube's center; a flat wall has no such
// surface, so this uses plain 2D coords instead: nx/ny centered on the
// stitched wall canvas (same nx/ny convention as gradientWashWall.js),
// dist = sqrt(nx*nx+ny*ny)*2 with the z term simply dropped (a genuinely
// flat 2D ripple, not a fake-3D one), ang = atan2(ny,nx). The actual
// ring/twist/hue math below is otherwise identical to depthRings.js's,
// just fed dist/ang from 2D instead of 3D.
const { hsl } = require('../core');

function effectDepthRingsWall(core, dt) {
  core.t += dt * 0.75;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let y = 0; y < wallH; y++) {
    const ny = y / wallH - 0.5;
    for (let x = 0; x < wallW; x++) {
      const nx = x / wallW - 0.5;
      const dist = Math.sqrt(nx * nx + ny * ny) * 2;
      const ang = Math.atan2(ny, nx);
      const twist = ang * 1.6 + dist * 2.5;
      const ring = Math.sin(dist * Math.PI * 9 - t * 2.4 + twist);
      const ring2 = Math.sin(dist * Math.PI * 4.5 + t * 1.1 + ang);
      const bright = ((ring * 0.6 + ring2 * 0.4) * 0.5 + 0.5) * (1 - dist * 0.42) * 0.88;
      const hue = (dist * 0.65 + ang / (Math.PI * 2) * 0.3 + t * 0.055) % 1;
      const [r, g, b] = hsl(hue, 1, Math.max(0, bright));
      core.setWallPixel(x, y, r, g, b);
    }
  }
}

module.exports = effectDepthRingsWall;
