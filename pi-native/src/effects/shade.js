// Lighting for colour fields: treat a field value as the height of a
// surface and light it, so a flat gradient reads as satin, liquid or silk.
//   lit(col, dhx, dhy, { bump, gloss, shine, ambient }) -> [r, g, b]
// dhx/dhy are the height's slopes; light comes from the top-left.
'use strict';
const L = (() => { const v = [-0.45, -0.55, 0.7], n = Math.hypot(...v); return v.map((a) => a / n); })();

// Blinn-Phong with the viewer straight on: the half vector between the light
// and +z is fixed, so it's worked out once (this runs for every pixel).
const HX = L[0], HY = L[1], HZ = L[2] + 1, HL = Math.sqrt(HX * HX + HY * HY + HZ * HZ);
const NO_OPTS = {};
function lit(col, dhx, dhy, opts = NO_OPTS) {
  const bump = opts.bump ?? 1, gloss = opts.gloss ?? 30, shine = opts.shine ?? 0.6, ambient = opts.ambient ?? 0.35;
  const nx = -dhx * bump, ny = -dhy * bump, nl = Math.sqrt(nx * nx + ny * ny + 1);
  const lam = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl);
  const spec = Math.pow(Math.max(0, (nx * HX + ny * HY + HZ) / (nl * HL)), gloss) * shine;
  const k = ambient + (1 - ambient) * lam;
  return [Math.min(1, col[0] * k + spec), Math.min(1, col[1] * k + spec), Math.min(1, col[2] * k + spec)];
}

module.exports = { lit };
