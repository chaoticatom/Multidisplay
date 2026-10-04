// Lighting for colour fields: treat a field value as the height of a
// surface and light it, so a flat gradient reads as satin, liquid or silk.
//   lit(col, dhx, dhy, { bump, gloss, shine, ambient }) -> [r, g, b]
// dhx/dhy are the height's slopes; light comes from the top-left.
'use strict';
const L = (() => { const v = [-0.45, -0.55, 0.7], n = Math.hypot(...v); return v.map((a) => a / n); })();

function lit(col, dhx, dhy, { bump = 1, gloss = 30, shine = 0.6, ambient = 0.35 } = {}) {
  const nx = -dhx * bump, ny = -dhy * bump, nl = Math.hypot(nx, ny, 1);
  const lam = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl);
  // Blinn-Phong with the viewer straight on: half vector between light and +z.
  const hx = L[0], hy = L[1], hz = L[2] + 1, hl = Math.hypot(hx, hy, hz);
  const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + hz) / (nl * hl)), gloss) * shine;
  const k = ambient + (1 - ambient) * lam;
  return [Math.min(1, col[0] * k + spec), Math.min(1, col[1] * k + spec), Math.min(1, col[2] * k + spec)];
}

module.exports = { lit };
