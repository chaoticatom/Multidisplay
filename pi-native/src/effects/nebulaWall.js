// Wall-mode counterpart to nebula.js - same idea as gradientWashWall.js vs
// gradientWash.js. x/y flattened to unshifted x=x/wallW, y=y/wallH (same
// convention as prismWall.js/tideWall.js, matching nebula.js's own
// unshifted x/y/z). Like auroraWall.js, nebula.js's z terms drive cloud
// density shape from a genuinely separate horizontal axis that a flat
// wall doesn't have a matching stand-in for, so - rather than reusing
// wall-y and warping the density field toward a vertical bias that isn't
// in the original - z is dropped spatially (set to 0) but its time
// component is kept, so the same number of interfering density terms
// keep shimmering over time instead of one going fully static. Star-core
// twinkle state is unchanged, just re-sized to wallW*wallH cells instead
// of N cube LEDs.
const { hsl, lerp, sm } = require('../core');

let nebWallStars = null;

function effectNebulaWall(core, dt) {
  core.t += dt * 0.28;
  const { wallW, wallH, t } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const wn = wallW * wallH;
  if (!nebWallStars || nebWallStars.length !== wn) { nebWallStars = []; for (let i = 0; i < wn; i++) nebWallStars.push({ last: -1, next: Math.random() * 8, bright: 0 }); }
  for (let yy = 0; yy < wallH; yy++) {
    const y = yy / wallH;
    for (let xx = 0; xx < wallW; xx++) {
      const x = xx / wallW;
      let d = 0;
      d += Math.sin(x * 5.3 + t * 0.52) * Math.cos(y * 4.9 + t * 0.31) * 0.5;
      d += Math.sin(-t * 0.42) * Math.sin(x * 3.4 + t * 0.21) * 0.38; // z dropped spatially, time kept (see header)
      d += Math.cos((x + y) * 4.2 + t * 0.58) * 0.28;
      d += Math.sin(x * 8.8 + y * 6.1 - t * 0.35) * 0.15;
      d = d * 0.48 + 0.52;
      const bright = Math.pow(Math.max(0, d - 0.08), 1.4) * 0.92;
      const hue = lerp(0.60, 0.04, sm(0.18, 0.88, d)) + Math.sin(t * 0.08) * 0.05;
      const [r, g, b] = hsl(hue, 0.85 + d * 0.15, bright);
      // bright nebula cores (highest density)
      const coreBoost = Math.max(0, d - 0.75) * 3.5;
      const idx = yy * wallW + xx;
      const ns = nebWallStars[idx]; ns.next -= dt;
      let sr = 0, sg = 0, sb = 0;
      if (ns.next <= 0) { ns.bright = 0.6 + Math.random() * 0.4; ns.next = 4 + Math.random() * 12; ns.last = t; }
      if (ns.bright > 0) { ns.bright = Math.max(0, ns.bright - dt * 1.2); const sc = ns.bright; sr = sc; sg = sc; sb = sc + 0.2; }
      core.setWallPixel(xx, yy, Math.min(1, r + coreBoost * 0.4 + sr), Math.min(1, g + coreBoost * 0.3 + sg), Math.min(1, b + coreBoost * 0.2 + sb));
    }
  }
}

module.exports = effectNebulaWall;
