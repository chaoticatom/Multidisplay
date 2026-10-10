// Wall-mode counterpart to life.js ("Crystal Life"). Neighbour lookups wrap
// toroidally at the canvas edges so every cell has a full neighbour count, like on
// the edgeless cube surface. life.js's 18-neighbour thresholds scaled to 8 neighbours
// land on classic Conway B3/S23, so that rule is used directly.
const { hsl, lerp } = require('../core');

let wLifeGrid = null, wLifeNext = null, wLifeAge = null, wLifeGenT = 0;
let wLifeKey = null;

// Cells are 2x2 pixels, drawn as little bevelled gems (lit top-left), so
// the colony reads as 3D beads rather than single flat pixels.
const CELL = 2;
const gridOf = (core) => ({ wallW: Math.max(4, Math.floor(core.wallW / CELL)), wallH: Math.max(4, Math.floor(core.wallH / CELL)) });
const BEVEL = [1.6, 1.0, 1.0, 0.4]; // top-left, top-right, bottom-left, bottom-right

function initWLife(core) {
  const { wallW, wallH } = gridOf(core);
  const n = wallW * wallH;
  wLifeGrid = new Uint8Array(n); wLifeNext = new Uint8Array(n); wLifeAge = new Uint8Array(n);
  for (let i = 0; i < n; i++) wLifeGrid[i] = Math.random() < 0.35 ? 1 : 0;
  wLifeKey = `${wallW}|${wallH}`;
}

function stepWLife(core) {
  const { wallW, wallH } = gridOf(core);
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const i = y * wallW + x;
      let nb = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = ((x + dx) % wallW + wallW) % wallW;
          const ny = ((y + dy) % wallH + wallH) % wallH;
          if (wLifeGrid[ny * wallW + nx]) nb++;
        }
      }
      const alive = wLifeGrid[i];
      wLifeNext[i] = alive ? (nb === 2 || nb === 3 ? 1 : 0) : (nb === 3 ? 1 : 0);
      if (wLifeNext[i] && !alive) wLifeAge[i] = 0;
      else if (wLifeNext[i]) wLifeAge[i] = Math.min(255, wLifeAge[i] + 1);
      else wLifeAge[i] = Math.max(0, wLifeAge[i] - 3);
    }
  }
  const tmp = wLifeGrid; wLifeGrid = wLifeNext; wLifeNext = tmp;
}

function effectLifeWall(core, dt) {
  core.t += dt;
  if (!core.wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const { wallW, wallH } = gridOf(core);
  const t = core.t;
  const n = wallW * wallH;
  if (!wLifeGrid || wLifeKey !== `${wallW}|${wallH}`) initWLife(core);
  wLifeGenT += dt;
  if (wLifeGenT > 0.06) { wLifeGenT = 0; stepWLife(core); }
  let pop = 0; for (let i = 0; i < n; i++) pop += wLifeGrid[i];
  if (pop < n * 0.008 || pop > n * 0.88) initWLife(core);

  for (let i = 0; i < n; i++) {
    let r, g, b, gem = false;
    if (wLifeGrid[i]) {
      const age = wLifeAge[i] / 255;
      const hue = age < 0.33
        ? lerp(0.50, 0.62, age * 3)
        : age < 0.66
        ? lerp(0.62, 0.75, (age - 0.33) * 3)
        : lerp(0.75, 0.13, (age - 0.66) * 3);
      const bright = 0.45 + age * 0.35;
      const sat = 1 - age * 0.15;
      [r, g, b] = hsl(hue, sat, bright);
      const pulse = age > 0.5 ? 0.06 * Math.sin(t * 3 + i * 0.1) : 0;
      r += pulse; g += pulse; b += pulse; gem = true;
    } else if (wLifeAge[i] > 0) {
      const fade = wLifeAge[i] / 255;
      [r, g, b] = hsl(0.06, 1, fade * 0.35); // a dying ember
    } else { r = 0; g = 0; b = 0.012; }
    const cx = (i % wallW) * CELL, cy = Math.floor(i / wallW) * CELL;
    for (let k = 0; k < 4; k++) {
      const sh = gem ? BEVEL[k] : 1;
      core.setWallPixel(cx + (k & 1), cy + (k >> 1), Math.min(1, r * sh), Math.min(1, g * sh), Math.min(1, b * sh));
    }
  }
}

module.exports = effectLifeWall;
