// Wall-mode counterpart to fluid.js ("Liquid Crystal").
//
// fluid.js runs a damped wave equation over the cube surface: each cell's
// height diffuses toward its neighbours' average (via surfIdx()'s 6 axis-
// aligned 3D directions, restricted to the surface - up to 4 useful
// in-plane neighbours per cell, same shape as sand.js's neighbour set) and
// is nudged by a gravity-projected slope term so the whole fluid slopes
// "downhill". Like sand.js, none of that needs edge-wrapping logic on the
// cube because the surface has no edges; unlike lifeWall's toroidal
// choice, this port keeps the wall bounded (edge cells just average over
// however many in-bounds neighbours they have, same as core.js's own
// occupancy-aware setWallPixel would only ever paint inside the panels
// anyway) - a liquid contained by real physical panel edges naturally has
// walls, not wraparound, so bounded is the more faithful "liquid crystal
// tank" reading of a flat rectangle.
//
// "Down" resolution: fluid.js projects world gravity onto each cell's
// surfX/Y/Z (normalised 0-1 position) minus the surface's own centre
// (0.5,0.5,0.5) to get a signed slope. A flat wall has no z, and gravity is
// always the fixed straight-down vector (see _shared.js's
// getLocalGravity() module comment), so the x-component of gravity is
// always 0 and only the y-component (-1) ever contributes - this port
// keeps the same dot-product shape but with normalised wall-canvas (x,y)
// in place of (surfX,surfY), which reduces to the fluid sloping toward the
// bottom of the canvas (larger y), matching "down" the same way sandWall.js
// does.
const { hsl } = require('../core');
const { getLocalGravity } = require('./_shared');

let wFluidH = null, wFluidV = null, wFluidT2 = 0;
let wFluidKey = null;

function resetWFluid(core) {
  const { wallW, wallH } = core;
  wFluidH = new Float32Array(wallW * wallH);
  wFluidV = new Float32Array(wallW * wallH);
  wFluidKey = `${wallW}|${wallH}`;
}

function effectFluidWall(core, dt) {
  const { wallW, wallH, wallBuf } = core;
  core.t += dt;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const n = wallW * wallH;
  if (!wFluidH || wFluidKey !== `${wallW}|${wallH}`) resetWFluid(core);
  wFluidT2 += dt;
  const grav = getLocalGravity();
  const gl = Math.sqrt(grav.x * grav.x + grav.y * grav.y + grav.z * grav.z) || 1;
  const gx = grav.x / gl, gy = grav.y / gl; // gz has no flat-canvas axis to project onto - see module comment

  const SPEED = 28, DAMP = 0.96, GRAV_STR = 14;
  const newH = new Float32Array(n);
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const i = y * wallW + x;
      let lap = 0, cnt = 0;
      if (x + 1 < wallW) { lap += wFluidH[i + 1]; cnt++; }
      if (x - 1 >= 0) { lap += wFluidH[i - 1]; cnt++; }
      if (y + 1 < wallH) { lap += wFluidH[i + wallW]; cnt++; }
      if (y - 1 >= 0) { lap += wFluidH[i - wallW]; cnt++; }
      if (cnt) {
        const avg = lap / cnt;
        const slope = gx * (x / (wallW - 1) - 0.5) + gy * (y / (wallH - 1) - 0.5);
        wFluidV[i] = (wFluidV[i] + dt * (SPEED * (avg - wFluidH[i]) - GRAV_STR * slope)) * DAMP;
      }
      newH[i] = Math.max(-1, Math.min(1, wFluidH[i] + wFluidV[i] * dt));
    }
  }
  for (let i = 0; i < n; i++) wFluidH[i] = newH[i];

  if (Math.random() < dt * 1.5) {
    const i = Math.random() * n | 0;
    wFluidH[i] += 0.8 + Math.random() * 0.6;
  }

  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const i = y * wallW + x, o = i * 3;
      const h = wFluidH[i];
      const abs = Math.abs(h);
      if (abs < 0.03) { wallBuf[o] = 0; wallBuf[o + 1] = 0; wallBuf[o + 2] = 0.02; continue; }
      const posPhase = (x / wallW + y / wallH) * 2.1 + wFluidT2 * 0.15;
      const hue = (h > 0
        ? 0.55 + abs * 0.15 + Math.sin(posPhase) * 0.08
        : 0.02 + abs * 0.12 + Math.sin(posPhase) * 0.06)
        % 1;
      const sat = 0.85 + abs * 0.15;
      const bright = Math.pow(abs, 0.5) * 0.9;
      const [r, g, b] = hsl(hue, sat, bright);
      const glint = Math.max(0, abs - 0.75) * 4;
      wallBuf[o] = Math.min(1, r + glint * 0.7);
      wallBuf[o + 1] = Math.min(1, g + glint * 0.8);
      wallBuf[o + 2] = Math.min(1, b + glint);
    }
  }
}

module.exports = effectFluidWall;
