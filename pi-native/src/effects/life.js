// Ported verbatim (math unchanged) from effects-physics.js's
// initLife()/stepLife()/effectLife() - "Crystal Life" (Conway's Game of
// Life on the cube surface, generalised to a 26->18-neighbour 3D ruleset -
// see the surfIdx() neighbour list below). No option panel in index.html
// (data-effect="life" has no `has-panel` class) - registered as a plain
// effect, nothing to wire. Uses surfIdx() from ./_shared.js (same helper
// maze.js uses).
const { hsl, lerp } = require('../core');
const { surfIdx } = require('./_shared');

const LIFE_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
  [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]];

let lifeGrid = null, lifeNext = null, lifeAge = null, lifeGenT = 0;

function initLife(core) {
  const { N } = core;
  lifeGrid = new Uint8Array(N); lifeNext = new Uint8Array(N); lifeAge = new Uint8Array(N);
  for (let i = 0; i < N; i++) lifeGrid[i] = Math.random() < 0.35 ? 1 : 0;
}

function stepLife(core) {
  const { N, gridX, gridY, gridZ } = core;
  for (let i = 0; i < N; i++) {
    const x = gridX[i], y = gridY[i], z = gridZ[i];
    let nb = 0;
    for (const [dx, dy, dz] of LIFE_NB) {
      const j = surfIdx(core, x + dx, y + dy, z + dz);
      if (j >= 0 && lifeGrid[j]) nb++;
    }
    const alive = lifeGrid[i];
    lifeNext[i] = alive ? (nb >= 4 && nb <= 6 ? 1 : 0) : (nb === 5 || nb === 6 ? 1 : 0);
    if (lifeNext[i] && !alive) lifeAge[i] = 0;
    else if (lifeNext[i]) lifeAge[i] = Math.min(255, lifeAge[i] + 1);
    else lifeAge[i] = Math.max(0, lifeAge[i] - 3);
  }
  const tmp = lifeGrid; lifeGrid = lifeNext; lifeNext = tmp;
}

function effectLife(core, dt) {
  const { N } = core;
  core.t += dt;
  const t = core.t;
  if (!lifeGrid || lifeGrid.length !== N) initLife(core);
  lifeGenT += dt;
  if (lifeGenT > 0.06) { lifeGenT = 0; stepLife(core); }
  let pop = 0; for (let i = 0; i < N; i++) pop += lifeGrid[i];
  if (pop < N * 0.008 || pop > N * 0.88) initLife(core);

  for (let i = 0; i < N; i++) {
    if (lifeGrid[i]) {
      const age = lifeAge[i] / 255;
      const hue = age < 0.33
        ? lerp(0.50, 0.62, age * 3)
        : age < 0.66
        ? lerp(0.62, 0.75, (age - 0.33) * 3)
        : lerp(0.75, 0.13, (age - 0.66) * 3);
      const bright = 0.5 + age * 0.45;
      const sat = 1 - age * 0.15;
      const [r, g, b] = hsl(hue, sat, bright);
      const pulse = age > 0.5 ? 0.06 * Math.sin(t * 3 + i * 0.1) : 0;
      core.setLED(i, Math.min(1, r + pulse), Math.min(1, g + pulse), Math.min(1, b + pulse));
    } else if (lifeAge[i] > 0) {
      const fade = lifeAge[i] / 255;
      const [r, g, b] = hsl(0.06, 1, fade * 0.5);
      core.setLED(i, r, g, b);
    } else {
      core.setLED(i, 0, 0, 0.01);
    }
  }
}

module.exports = effectLife;
