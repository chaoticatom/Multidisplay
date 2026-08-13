// Wall-mode counterpart to aurora.js - same idea as gradientWashWall.js vs
// gradientWash.js. x flattened to unshifted x=x/wallW (matching
// prismWall.js/tideWall.js's convention, and aurora.js's own unshifted x).
// y flattened to ny = 1 - y/wallH so "up" still means the same thing it
// did in the cube version: aurora.js's y=1 is the cube's top face, and
// `fade` brightens the curtains toward it, so this remaps wall row 0
// (top of the stitched image) to ny=1 to keep that "brighter near the
// top" character rather than inverting it.
//
// aurora.js's curtain shape (c1/c2) reads x for its horizontal drift and
// z for a second, independent horizontal axis that gives the curtains
// their fold/twist - a flat wall only has one horizontal axis, and unlike
// wave.js/plasma.js's z terms (which read genuinely interchangeable
// spatial axes), reusing wall-y for aurora's z would tie the curtain fold
// to vertical position, which reads as a completely different (and
// wrong-looking) effect from cube aurora's horizontal fold. So z is
// dropped spatially (not reused) but its *time* component is kept, so the
// curtains still shimmer/breathe over time instead of the fold pattern
// going fully static - closer in spirit to the original than either
// alternative.
const { hsl, lerp, sm } = require('../core');

let auroraWallStar = null;

function effectAuroraWall(core, dt) {
  core.t += dt * 0.35;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const wn = wallW * wallH;
  if (!auroraWallStar || auroraWallStar.length !== wn) {
    auroraWallStar = new Float32Array(wn);
    for (let i = 0; i < wn; i++) auroraWallStar[i] = Math.random() < 0.014 ? Math.random() : 0;
  }
  for (let yy = 0; yy < wallH; yy++) {
    const y = 1 - yy / wallH;
    for (let xx = 0; xx < wallW; xx++) {
      const x = xx / wallW;
      const c1 = Math.sin(x * Math.PI * 3.5 + t * 0.65) * Math.sin(t * 0.42);
      const c2 = Math.sin(x * Math.PI * 2.2 - t * 0.38) * Math.cos(t * 0.55) * 0.6;
      const curtain = c1 + c2;
      const fade = Math.pow(Math.max(0, y), 0.45);
      const bright = Math.max(0, curtain) * fade * 0.88;
      const idx = yy * wallW + xx;
      if (bright > 0.02) {
        const hue = lerp(0.30, 0.82, sm(0, 1, x + Math.sin(t * 0.28) * 0.25)) + Math.sin(t * 0.1) * 0.04;
        const sat = 0.9 + Math.sin(t * 0.8 + x * 2) * 0.1;
        const [r, g, b] = hsl(hue, sat, bright);
        // second curtain color (magenta hints)
        const [r2, g2, b2] = hsl(hue + 0.45, sat, bright * 0.4 * Math.max(0, c2));
        core.setWallPixel(xx, yy, Math.min(1, r + r2), Math.min(1, g + g2), Math.min(1, b + b2));
      } else {
        // starfield on dark areas
        const s = auroraWallStar[idx];
        if (s > 0) { const tw = 0.5 + 0.5 * Math.sin(t * 2.3 + s * 12.7); core.setWallPixel(xx, yy, tw * 0.55, tw * 0.55, tw * 0.65); }
        else core.setWallPixel(xx, yy, 0, 0, 0);
      }
    }
  }
}

module.exports = effectAuroraWall;
