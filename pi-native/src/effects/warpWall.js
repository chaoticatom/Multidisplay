// Wall-mode counterpart to warp.js. Bigger structural change than the
// other Motion & Particles ports: warp.js's stars fly outward in 3D from
// the cube's center and get *projected* onto all 6 faces (its `faces`
// array of [face, u, v] triples per star, one star drawn up to 6 times).
// A flat wall has no faces to project onto - it IS the plane already - so
// this drops the projection step entirely: stars fly outward in 2D from
// the wall canvas's own center and are drawn directly at their own (x,y),
// once each, via core.setWallPixel. Everything else (motion integration,
// distance-based brightness ramp, trail fade via *=0.78 per frame, hue
// drift with distance, 3x3 glow kernel) is unchanged, just re-expressed
// in wallW/wallH/wallBuf instead of SIZE/N/colBuf.
const { hsl } = require('../core');

let warpWallStars = [];

function resetWarpWall(core) {
  warpWallStars = [];
  const n = Math.max(120, ((core.wallW * core.wallH) / 400) | 0);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2;
    const sp = 0.08 + Math.random() * 0.35;
    warpWallStars.push({
      x: 0.5, y: 0.5,
      ox: Math.cos(th) * 0.001, oy: Math.sin(th) * 0.001,
      sp, hue: Math.random() * 0.2 + 0.55, life: Math.random(),
    });
  }
}

function effectWarpWall(core, dt) {
  core.t += dt;
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  if (!warpWallStars.length) resetWarpWall(core);
  for (let i = 0; i < wallBuf.length; i++) wallBuf[i] *= 0.78;

  const dim = Math.max(wallW, wallH);
  for (const s of warpWallStars) {
    s.life += dt;
    s.x += s.ox * s.sp * dim * dt * 60;
    s.y += s.oy * s.sp * dim * dt * 60;
    if (s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) {
      const th = Math.random() * Math.PI * 2;
      s.x = 0.5; s.y = 0.5;
      s.ox = Math.cos(th) * 0.001; s.oy = Math.sin(th) * 0.001;
      s.sp = 0.08 + Math.random() * 0.35; s.life = 0; s.hue = Math.random() * 0.2 + 0.55;
      continue;
    }
    // brightness ramps with distance from center (speed illusion)
    const dist = Math.sqrt((s.x - 0.5) ** 2 + (s.y - 0.5) ** 2) * 2;
    const bright = dist * 0.75 * Math.min(1, s.life * 3);
    const px = (s.x * wallW) | 0, py = (s.y * wallH) | 0;
    for (let sx = -1; sx <= 1; sx++) for (let sy = -1; sy <= 1; sy++) {
      const gl = bright * (sx === 0 && sy === 0 ? 1 : 0.25) * 0.85;
      if (gl < 0.01) continue;
      const [r, g, b] = hsl(s.hue + dist * 0.15, 0.8, gl);
      core.setWallPixel(px + sx, py + sy, r, g, b);
    }
  }
}

module.exports = effectWarpWall;
