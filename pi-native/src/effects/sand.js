// Ported verbatim (math unchanged) from effects-physics.js's
// buildSandNeighbours()/resetSand()/effectGravitySand() - "Gravity Sand".
// No option panel in index.html (data-effect="sand" has no `has-panel`
// class) - registered as a plain effect, nothing to wire.
//
// panel2dMode -> core.panelMode==='2d'. getLocalGravity() -> _shared.js's
// fixed-down-vector helper (see its module comment) - the browser's
// non-2D branch reads getLocalGravity(1) each frame to let a dragged/
// tilted cube (or live gyro) redirect which way sand falls; pi-native has
// neither, so gravity is always straight down in cube-local space, same as
// an idle un-rotated browser cube.
const { hsl } = require('../core');
const { getLocalGravity } = require('./_shared');

let sand = [];
let sandHues = null;
let sandNeighbours = null;
let sandNeighboursN = -1;
let sandLevelT = 0;

function buildSandNeighbours(core) {
  const { N, gridX, gridY, gridZ, faceMap, SIZE } = core;
  sandNeighbours = new Array(N);
  const S = SIZE, S1 = S - 1;
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (let i = 0; i < N; i++) {
    const x = gridX[i], y = gridY[i], z = gridZ[i];
    const nb = [];
    for (const [dx, dy, dz] of dirs) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (nx < 0 || nx >= S || ny < 0 || ny >= S || nz < 0 || nz >= S) continue;
      if (nx !== 0 && nx !== S1 && ny !== 0 && ny !== S1 && nz !== 0 && nz !== S1) continue;
      let found = -1;
      if (nz === S1 && found < 0) found = faceMap[0][ny * S + nx];
      if (nz === 0 && found < 0) found = faceMap[1][ny * S + (S1 - nx)];
      if (nx === S1 && found < 0) found = faceMap[2][ny * S + (S1 - nz)];
      if (nx === 0 && found < 0) found = faceMap[3][ny * S + nz];
      if (ny === S1 && found < 0) found = faceMap[4][nz * S + nx];
      if (ny === 0 && found < 0) found = faceMap[5][nz * S + nx];
      if (found >= 0) nb.push(found);
    }
    sandNeighbours[i] = nb;
  }
  sandNeighboursN = N;
}

function resetSand(core) {
  const { N, faceMap, SIZE } = core;
  if (!N || !faceMap) return;
  buildSandNeighbours(core);
  const panel2dMode = core.panelMode === '2d';
  const pool = [];
  if (panel2dMode) {
    const S = SIZE;
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const idx = faceMap[0][v * S + u]; if (idx >= 0) pool.push(idx);
    }
  } else {
    for (let i = 0; i < N; i++) pool.push(i);
  }
  const target = Math.floor(pool.length / 3);
  const indices = new Int32Array(pool);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
  sandHues = new Float32Array(N);
  for (let i = 0; i < N; i++) sandHues[i] = 0.04 + Math.random() * 0.10;
  sand = Array.from(indices.subarray(0, target));
}

function effectGravitySand(core, dt) {
  const { N, gridX, gridY, gridZ, colBuf } = core;
  const panel2dMode = core.panelMode === '2d';
  core.t += dt;
  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;
  if (!sandNeighbours || sandNeighboursN !== N) buildSandNeighbours(core);
  if (!sand.length || sandHues?.length !== N) resetSand(core);

  let gx, gy, gz;
  if (panel2dMode) {
    gx = 0; gy = 1; gz = 0;
  } else {
    const rawG = getLocalGravity();
    const gLen = Math.sqrt(rawG.x * rawG.x + rawG.y * rawG.y + rawG.z * rawG.z) || 1;
    gx = -rawG.x / gLen; gy = -rawG.y / gLen; gz = -rawG.z / gLen;
  }

  function gravHeight(i) {
    return gridX[i] * gx + gridY[i] * gy + gridZ[i] * gz;
  }

  const occ = new Uint8Array(N);
  for (const i of sand) occ[i] = 1;

  const PASSES = 3;
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = sand.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = sand[i]; sand[i] = sand[j]; sand[j] = tmp;
    }

    for (let gi = 0; gi < sand.length; gi++) {
      const idx = sand[gi];
      const h0 = gravHeight(idx);
      const nb = sandNeighbours[idx];

      let bestIdx = -1, bestH = h0 - 0.001;
      for (const n of nb) {
        if (occ[n]) continue;
        const hn = gravHeight(n);
        if (hn < bestH) { bestH = hn; bestIdx = n; }
      }

      if (bestIdx >= 0) {
        occ[idx] = 0; occ[bestIdx] = 1; sand[gi] = bestIdx;
      } else {
        let slideIdx = -1, slideScore = Infinity;
        for (const n of nb) {
          if (occ[n]) continue;
          const hn = gravHeight(n);
          if (hn > h0 + 1.5) continue;
          let lowestFromN = hn;
          for (const nn of sandNeighbours[n]) {
            if (occ[nn] && nn !== idx) continue;
            const hnn = gravHeight(nn);
            if (hnn < lowestFromN) lowestFromN = hnn;
            for (const nnn of sandNeighbours[nn]) {
              if (occ[nnn] && nnn !== idx && nnn !== n) continue;
              const hnnn = gravHeight(nnn);
              if (hnnn < lowestFromN) lowestFromN = hnnn;
            }
          }
          if (lowestFromN < slideScore) { slideScore = lowestFromN; slideIdx = n; }
        }
        if (slideIdx >= 0 && slideScore < h0 - 0.5) {
          occ[idx] = 0; occ[slideIdx] = 1; sand[gi] = slideIdx;
        }
      }
    }
  }

  sandLevelT = (sandLevelT || 0) + 1;
  if (sandLevelT % 6 === 0) {
    for (let i = sand.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = sand[i]; sand[i] = sand[j]; sand[j] = tmp;
    }
    for (let gi = 0; gi < sand.length; gi++) {
      const idx = sand[gi];
      const h0 = gravHeight(idx);
      const nb = sandNeighbours[idx];
      let occupied = 0;
      for (const n of nb) if (occ[n]) occupied++;
      if (occupied < 2) continue;
      let levelIdx = -1, levelH = h0 - 0.25;
      for (const n of nb) {
        if (occ[n]) continue;
        const hn = gravHeight(n);
        if (hn < levelH) { levelH = hn; levelIdx = n; }
      }
      if (levelIdx >= 0) {
        occ[idx] = 0; occ[levelIdx] = 1; sand[gi] = levelIdx;
      }
    }
  }

  for (let gi = 0; gi < sand.length; gi++) {
    const i = sand[gi];
    const hue = sandHues ? sandHues[gi] : 0.07;
    const bright = 0.45 + Math.random() * 0.20;
    const [r, g, b] = hsl(hue, 0.82, bright);
    colBuf[i * 3] = r; colBuf[i * 3 + 1] = g; colBuf[i * 3 + 2] = b;
  }
}

module.exports = effectGravitySand;
