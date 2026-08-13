// Wall-mode counterpart to sand.js ("Gravity Sand").
//
// sand.js's buildSandNeighbours() walks the cube's 3D voxel grid and, for
// each surface cell, collects up to 4 in-plane neighbours (the 6 axis-
// aligned 3D directions, restricted to whichever stay on the cube's
// surface) - it never needs to special-case an "edge", because the cube
// surface is a closed manifold: walk off one face and buildSandNeighbours
// has already resolved the neighbour onto the next face via faceMap. A
// flat wall's grid is exactly the 2D analogue of that in-plane neighbour
// set (up/down/left/right), just without anywhere to fold onto once you
// walk off the rectangle - so this port keeps a flat wallW x wallH grid
// with plain 4-connected neighbours, clamped at the 4 edges (a cell at the
// canvas border simply has fewer neighbours, same as it would if the cube
// geometry ever produced a dead end - it doesn't here, but the algorithm
// already tolerates fewer-than-4 neighbour lists unchanged).
//
// "Down" resolution: sand.js's panel2dMode branch (a single flat cube
// face) hardcodes gx=0,gy=1,gz=0 and defines gravHeight(i) = dot(pos, g) -
// falling means moving to a *lower* gravHeight. Re-deriving what that
// means in face-local (u,v): v runs top(0)->bottom(S-1) in the same sense
// wallH's y runs top(0)->bottom(wallH-1) on a flat canvas, so "lower
// gravHeight = further down the screen" maps directly to "larger y". This
// port defines gravHeight(x,y) = -y so the same "seek a lower value"
// falling rule used verbatim below moves sand toward larger y - i.e. sand
// piles up at the bottom of the canvas, matching the browser's usual
// falling-sand look.
const { hsl } = require('../core');

let wSand = [];
let wSandHues = null;
let wSandNb = null; // Int32Array-backed flat neighbour lists, 4 slots/cell (-1 = none)
let wSandNbKey = null;
let wSandLevelT = 0;

// Panels can form a non-rectangular arrangement (core.js's initWall() docs:
// "panels don't have to fill every cell of that bounding box") - occupied()
// mirrors setWallPixel's own occupancy check so sand only lives in/moves
// through cells with a physical panel under them, rather than drifting
// through gaps in an L-shaped layout.
function occupied(core, x, y) {
  if (!core._wallOccupied) return true;
  const gx = (x / core.wallPanelSize) | 0, gy = (y / core.wallPanelSize) | 0;
  return !!core._wallOccupied[gy * core.wallCols + gx];
}

function buildWSandNeighbours(core) {
  const { wallW, wallH } = core;
  const n = wallW * wallH;
  wSandNb = new Int32Array(n * 4).fill(-1);
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      if (!occupied(core, x, y)) continue;
      const i = y * wallW + x;
      let k = 0;
      if (x + 1 < wallW && occupied(core, x + 1, y)) wSandNb[i * 4 + k++] = i + 1;
      if (x - 1 >= 0 && occupied(core, x - 1, y)) wSandNb[i * 4 + k++] = i - 1;
      if (y + 1 < wallH && occupied(core, x, y + 1)) wSandNb[i * 4 + k++] = i + wallW;
      if (y - 1 >= 0 && occupied(core, x, y - 1)) wSandNb[i * 4 + k++] = i - wallW;
    }
  }
  wSandNbKey = `${wallW}|${wallH}`;
}

function resetWSand(core) {
  const { wallW, wallH } = core;
  const n = wallW * wallH;
  if (!wSandNb || wSandNbKey !== `${wallW}|${wallH}`) buildWSandNeighbours(core);
  const pool = [];
  for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) {
    if (occupied(core, x, y)) pool.push(y * wallW + x);
  }
  const target = Math.floor(pool.length / 3);
  const indices = new Int32Array(pool);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
  wSandHues = new Float32Array(n);
  for (let i = 0; i < n; i++) wSandHues[i] = 0.04 + Math.random() * 0.10;
  wSand = Array.from(indices.subarray(0, target));
}

function effectGravitySandWall(core, dt) {
  const { wallW, wallH, wallBuf } = core;
  core.t += dt;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  wallBuf.fill(0);
  const n = wallW * wallH;
  if (!wSandNb || wSandNbKey !== `${wallW}|${wallH}`) buildWSandNeighbours(core);
  if (!wSand.length || wSandHues?.length !== n) resetWSand(core);

  function gravHeight(i) { return -(i / wallW | 0); } // -y: larger y (further down canvas) = lower height = falls toward it

  const occ = new Uint8Array(n);
  for (const i of wSand) occ[i] = 1;

  function nbOf(i) {
    const base = i * 4, out = [];
    for (let k = 0; k < 4; k++) { const v = wSandNb[base + k]; if (v >= 0) out.push(v); }
    return out;
  }

  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = wSand.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = wSand[i]; wSand[i] = wSand[j]; wSand[j] = tmp;
    }

    for (let gi = 0; gi < wSand.length; gi++) {
      const idx = wSand[gi];
      const h0 = gravHeight(idx);
      const nb = nbOf(idx);

      let bestIdx = -1, bestH = h0 - 0.001;
      for (const nIdx of nb) {
        if (occ[nIdx]) continue;
        const hn = gravHeight(nIdx);
        if (hn < bestH) { bestH = hn; bestIdx = nIdx; }
      }

      if (bestIdx >= 0) {
        occ[idx] = 0; occ[bestIdx] = 1; wSand[gi] = bestIdx;
      } else {
        let slideIdx = -1, slideScore = Infinity;
        for (const nIdx of nb) {
          if (occ[nIdx]) continue;
          const hn = gravHeight(nIdx);
          if (hn > h0 + 1.5) continue;
          let lowestFromN = hn;
          for (const nn of nbOf(nIdx)) {
            if (occ[nn] && nn !== idx) continue;
            const hnn = gravHeight(nn);
            if (hnn < lowestFromN) lowestFromN = hnn;
            for (const nnn of nbOf(nn)) {
              if (occ[nnn] && nnn !== idx && nnn !== nIdx) continue;
              const hnnn = gravHeight(nnn);
              if (hnnn < lowestFromN) lowestFromN = hnnn;
            }
          }
          if (lowestFromN < slideScore) { slideScore = lowestFromN; slideIdx = nIdx; }
        }
        if (slideIdx >= 0 && slideScore < h0 - 0.5) {
          occ[idx] = 0; occ[slideIdx] = 1; wSand[gi] = slideIdx;
        }
      }
    }
  }

  wSandLevelT = (wSandLevelT || 0) + 1;
  if (wSandLevelT % 6 === 0) {
    for (let i = wSand.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = wSand[i]; wSand[i] = wSand[j]; wSand[j] = tmp;
    }
    for (let gi = 0; gi < wSand.length; gi++) {
      const idx = wSand[gi];
      const h0 = gravHeight(idx);
      const nb = nbOf(idx);
      let occupied = 0;
      for (const nIdx of nb) if (occ[nIdx]) occupied++;
      if (occupied < 2) continue;
      let levelIdx = -1, levelH = h0 - 0.25;
      for (const nIdx of nb) {
        if (occ[nIdx]) continue;
        const hn = gravHeight(nIdx);
        if (hn < levelH) { levelH = hn; levelIdx = nIdx; }
      }
      if (levelIdx >= 0) {
        occ[idx] = 0; occ[levelIdx] = 1; wSand[gi] = levelIdx;
      }
    }
  }

  for (let gi = 0; gi < wSand.length; gi++) {
    const i = wSand[gi];
    const hue = wSandHues ? wSandHues[gi] : 0.07;
    const bright = 0.45 + Math.random() * 0.20;
    const [r, g, b] = hsl(hue, 0.82, bright);
    const o = i * 3;
    wallBuf[o] = r; wallBuf[o + 1] = g; wallBuf[o + 2] = b;
  }
}

module.exports = effectGravitySandWall;
