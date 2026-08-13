// Wall-mode counterpart to life.js ("Crystal Life").
//
// life.js runs a generalised Life ruleset over the cube's closed surface:
// each cell looks at 18 candidate 3D offsets (LIFE_NB) via surfIdx(), which
// resolves seamlessly across face boundaries because the cube surface has
// no edges to fall off - a cell in the corner of one face still gets a
// full 18-neighbour count, some of them living on the adjacent face(s). A
// flat wall rectangle, unlike the cube surface, *does* have edges - so to
// keep the same "every cell always has a full, uniform neighbour count"
// character (rather than cells at the border behaving differently purely
// because they're near an edge, which would visibly skew activity toward
// the middle of the canvas), this port wraps neighbour lookups toroidally
// at the 4 canvas edges instead of clamping them.
//
// Ruleset: life.js's 18-neighbour thresholds (survive on 4-6, born on 5-6)
// don't transfer numerically to a flat grid's standard 8-neighbour Moore
// neighbourhood - they were tuned for a denser neighbourhood. Scaling each
// threshold by 8/18 lands almost exactly on classic Conway's Game of Life
// (B3/S23: survive on 2-3, born on 3) - 4/18*8=1.8, 6/18*8=2.7 -> survive
// 2-3; 5/18*8=2.2, 6/18*8=2.7 -> born ~2-3, i.e. 3. So rather than force an
// odd non-standard threshold onto 8 neighbours, this port uses the
// well-known B3/S23 rule directly, which preserves the same "similar
// fraction of neighbours alive" character the original was tuned around.
const { hsl, lerp } = require('../core');

let wLifeGrid = null, wLifeNext = null, wLifeAge = null, wLifeGenT = 0;
let wLifeKey = null;

function initWLife(core) {
  const { wallW, wallH } = core;
  const n = wallW * wallH;
  wLifeGrid = new Uint8Array(n); wLifeNext = new Uint8Array(n); wLifeAge = new Uint8Array(n);
  for (let i = 0; i < n; i++) wLifeGrid[i] = Math.random() < 0.35 ? 1 : 0;
  wLifeKey = `${wallW}|${wallH}`;
}

function stepWLife(core) {
  const { wallW, wallH } = core;
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
  const { wallW, wallH, wallBuf } = core;
  core.t += dt;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const t = core.t;
  const n = wallW * wallH;
  if (!wLifeGrid || wLifeKey !== `${wallW}|${wallH}`) initWLife(core);
  wLifeGenT += dt;
  if (wLifeGenT > 0.06) { wLifeGenT = 0; stepWLife(core); }
  let pop = 0; for (let i = 0; i < n; i++) pop += wLifeGrid[i];
  if (pop < n * 0.008 || pop > n * 0.88) initWLife(core);

  for (let i = 0; i < n; i++) {
    const o = i * 3;
    if (wLifeGrid[i]) {
      const age = wLifeAge[i] / 255;
      const hue = age < 0.33
        ? lerp(0.50, 0.62, age * 3)
        : age < 0.66
        ? lerp(0.62, 0.75, (age - 0.33) * 3)
        : lerp(0.75, 0.13, (age - 0.66) * 3);
      const bright = 0.5 + age * 0.45;
      const sat = 1 - age * 0.15;
      const [r, g, b] = hsl(hue, sat, bright);
      const pulse = age > 0.5 ? 0.06 * Math.sin(t * 3 + i * 0.1) : 0;
      wallBuf[o] = Math.min(1, r + pulse); wallBuf[o + 1] = Math.min(1, g + pulse); wallBuf[o + 2] = Math.min(1, b + pulse);
    } else if (wLifeAge[i] > 0) {
      const fade = wLifeAge[i] / 255;
      const [r, g, b] = hsl(0.06, 1, fade * 0.5);
      wallBuf[o] = r; wallBuf[o + 1] = g; wallBuf[o + 2] = b;
    } else {
      wallBuf[o] = 0; wallBuf[o + 1] = 0; wallBuf[o + 2] = 0.01;
    }
  }
}

module.exports = effectLifeWall;
