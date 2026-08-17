// Wall-mode counterpart to maze.js ("Maze Runner").
//
// maze.js already has an `is2D` branch (core.panelMode === '2d') that
// builds ONE perfect maze on a single S x S flat face instead of stitching
// a maze across all 6 cube faces via edge doorways - exactly the shape
// this port generalises, per the batch brief. Everything face/cube-only
// (openFaceLocal/openFaceCell, the 12-edge doorway pass, NB6's z axis,
// surfIdx()) is dropped; the maze lives directly in flat (x,y) wallW x
// wallH pixel space, addressed via a plain Uint8Array(wallW*wallH) and
// core.setWallPixel, with a 4-neighbour NB2 replacing NB6.
//
// GRID-SIZING DECISION (the brief specifically calls this out):
// The is2D cube branch always builds its maze at a fixed cell density of
// exactly 2 pixels/cell (C = (SIZE>>1)-1 cells across an SxS face - one
// wall pixel + one corridor pixel per cell). This port keeps that SAME
// 2px/cell density rather than fixing the cell COUNT and stretching cells
// to fill wallW x wallH: Cw = (wallW>>1)-1, Ch = (wallH>>1)-1, i.e. the
// maze simply gets more cells (not bigger cells) as more panels are added,
// which is what "one maze stitched across N panels" should look like -
// same corridor width per panel as the single-panel case, just longer/
// taller. This is safe perf-wise: the recursive-backtracker generator is
// O(cells) with a handful of array ops per cell (no per-cell BFS/flood-
// fill the way tron's AI decision loop needs), so even a 4x4 grid of
// 64px panels (Cw*Ch ~= 16256 cells) generates in low single-digit
// milliseconds - nothing like the O(board) flood-fill cost that forced
// tron's non-allocating rewrite. No cap is needed or applied.
const { hsl } = require('../core');

let mazeOpen = null, mazeVisited = null, mazeRunners = [], mazeBFS = [];
let mazeState = 'run', mazeStateT = 0, mazeWinner = -1;
let mazeStartI = -1, mazeEndI = -1, mazeWallIdx = 0;
let mazeGridKey = null; // `${wallW}|${wallH}` - detects a wall-layout change
let lastRebuildToken = null;
const NB2 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MAZE_WALLS = [
  [0.030, 0.120, 0.180],
  [0.170, 0.030, 0.105],
  [0.165, 0.085, 0.012],
  [0.025, 0.140, 0.045],
  [0.095, 0.030, 0.170],
  [0.105, 0.105, 0.115],
];
const MZ_HUES = [0.50, 0.08, 0.85, 0.16, 0.70, 0.42];

// Real report: "if I have a l shaped display board, the maze should use
// only what available and not go off screen." idxAt() previously only
// bounds-checked against the wallW x wallH BOUNDING BOX - for an L-shaped
// (or any non-rectangular) layout, that box includes "gap" cells with no
// physical panel there at all. The maze generator, BFS, and runner AI all
// route exclusively through idxAt()'s return value, so making occupancy
// part of THIS one check (rather than patching every call site
// individually) makes every consumer respect the actual panel shape for
// free - a gap cell now simply doesn't exist as far as the maze is
// concerned, the same way it doesn't exist as far as setWallPixel is
// concerned.
function pixelOccupied(core, x, y) {
  const gx = (x / core.wallPanelSize) | 0, gy = (y / core.wallPanelSize) | 0;
  return !!core._wallOccupied[gy * core.wallCols + gx];
}
function idxAt(core, x, y) {
  const { wallW, wallH } = core;
  if (x < 0 || x >= wallW || y < 0 || y >= wallH) return -1;
  if (!pixelOccupied(core, x, y)) return -1;
  return y * wallW + x;
}

// Up to 6 "start" candidates (nearest open cell to each of 6 fixed
// corners) - shared between buildMaze()'s goal placement (farthest from
// ALL of these - see farthestFromAll()) and respawnRunners()'s actual
// runner spawn points, so the goal is always measured against exactly
// where runners really start. See maze.js's identical-purpose
// computeStartCandidates() for the cube-mode counterpart.
function computeStartCandidates(core, Cw, Ch) {
  const corners = [[1, 1], [2 * Cw - 1, 1], [1, 2 * Ch - 1], [2 * Cw - 1, 2 * Ch - 1], [Cw, 1], [1, Ch]];
  return corners.map((corner) => {
    let best = -1, bd = 1e9;
    for (let cj = 0; cj < Ch; cj++) {
      for (let ci = 0; ci < Cw; ci++) {
        const u = 2 * ci + 1, v = 2 * cj + 1;
        const idx = idxAt(core, u, v);
        if (idx >= 0 && mazeOpen[idx]) {
          const d = Math.abs(u - corner[0]) + Math.abs(v - corner[1]);
          if (d < bd) { bd = d; best = idx; }
        }
      }
    }
    return best;
  });
}

// Multi-source BFS: the open cell with the greatest distance to its
// NEAREST start candidate - a real report ("the end target needs to be
// the furthest away from all the start points"), replacing the previous
// fixed bottom-right-ish corner goal which only ever considered the
// single top-left start.
function farthestFromAll(core, starts) {
  const { wallW } = core;
  const N = wallW * core.wallH;
  const dist = new Int32Array(N).fill(-1);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  for (const s of starts) { if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[qt++] = s; } }
  while (qh < qt) {
    const i = q[qh++];
    const x = i % wallW, y = (i / wallW) | 0;
    for (const nb of NB2) {
      const j = idxAt(core, x + nb[0], y + nb[1]);
      if (j >= 0 && mazeOpen[j] && dist[j] < 0) { dist[j] = dist[i] + 1; q[qt++] = j; }
    }
  }
  let best = -1, bd = -1;
  for (let i = 0; i < N; i++) if (mazeOpen[i] && dist[i] > bd) { bd = dist[i]; best = i; }
  return best;
}

function buildMaze(core) {
  const { wallW, wallH } = core;
  const N = wallW * wallH;
  const Cw = Math.max(1, (wallW >> 1) - 1), Ch = Math.max(1, (wallH >> 1) - 1);
  mazeOpen = new Uint8Array(N);
  mazeGridKey = `${wallW}|${wallH}`;

  function openLocal(x, y) { const i = idxAt(core, x, y); if (i >= 0) mazeOpen[i] = 1; }
  function openCell(ci, cj) { openLocal(2 * ci + 1, 2 * cj + 1); }
  // A cell "exists" for maze-generation purposes only if its pixel is on
  // an actually-occupied panel - checked up front (not just relying on
  // idxAt() during openCell()) so the recursive backtracker below never
  // wastes structure branching through/around a gap cell in the first
  // place, same spirit as the idxAt() fix above.
  function cellOccupied(ci, cj) { return pixelOccupied(core, 2 * ci + 1, 2 * cj + 1); }

  // 1 — perfect maze over the whole wall (iterative recursive backtracker)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const vis = new Uint8Array(Cw * Ch);
  // Start cell must be a real (occupied) one - a naive random (sx,sy) could
  // land in a gap on an irregular layout, which would silently generate an
  // empty maze (the backtracker's stack would have nowhere valid to go).
  const occCells = [];
  for (let cj = 0; cj < Ch; cj++) for (let ci = 0; ci < Cw; ci++) if (cellOccupied(ci, cj)) occCells.push([ci, cj]);
  const [sx, sy] = occCells.length ? occCells[(Math.random() * occCells.length) | 0] : [0, 0];
  const stack = [[sx, sy]];
  vis[sy * Cw + sx] = 1; openCell(sx, sy);
  while (stack.length) {
    const top = stack[stack.length - 1], ci = top[0], cj = top[1];
    const opts = [];
    for (const d of dirs) {
      const ni = ci + d[0], nj = cj + d[1];
      if (ni >= 0 && ni < Cw && nj >= 0 && nj < Ch && !vis[nj * Cw + ni] && cellOccupied(ni, nj)) opts.push([ni, nj]);
    }
    if (!opts.length) { stack.pop(); continue; }
    const nx = opts[(Math.random() * opts.length) | 0];
    vis[nx[1] * Cw + nx[0]] = 1;
    openLocal(ci + nx[0] + 1, cj + nx[1] + 1);
    openCell(nx[0], nx[1]);
    stack.push(nx);
  }

  // 2 — start (top-left) and goal, placed as far as possible from EVERY
  // runner's actual start point at once (farthestFromAll() over the SAME
  // candidates respawnRunners() spawns from below), not a fixed bottom-
  // right-ish corner that ignored every other runner's starting position.
  const startCandidates = computeStartCandidates(core, Cw, Ch);
  mazeStartI = startCandidates[0] >= 0 ? startCandidates[0] : idxAt(core, 1, 1);
  const farthest = farthestFromAll(core, startCandidates);
  mazeEndI = farthest >= 0 ? farthest : mazeStartI;

  // 3 — BFS shortest path (reference for capping runner wandering)
  const prev = new Int32Array(N).fill(-1);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  q[qt++] = mazeStartI; prev[mazeStartI] = mazeStartI;
  while (qh < qt) {
    const i = q[qh++];
    if (i === mazeEndI) break;
    const x = i % wallW, y = (i / wallW) | 0;
    for (const nb of NB2) {
      const j = idxAt(core, x + nb[0], y + nb[1]);
      if (j >= 0 && mazeOpen[j] && prev[j] < 0) { prev[j] = i; q[qt++] = j; }
    }
  }
  mazeBFS = [];
  if (prev[mazeEndI] >= 0) {
    let i = mazeEndI;
    while (i !== mazeStartI) { mazeBFS.push(i); i = prev[i]; }
    mazeBFS.push(mazeStartI); mazeBFS.reverse();
  } else mazeBFS = [mazeStartI];

  // 4 — spawn the runners
  respawnRunners(core, startCandidates);
}

// Goal-biased randomized DFS that records the FULL walk including
// backtracking out of dead ends — same as maze.js's genRunnerSeq, just
// over flat (x,y) instead of (face,x,y,z).
function genRunnerSeq(core, bias, startI) {
  const { wallW, wallH } = core;
  const N = wallW * wallH;
  startI = startI ?? mazeStartI;
  const visited = new Uint8Array(N);
  const stack = [startI];
  const seq = [startI];
  visited[startI] = 1;
  const gx = mazeEndI % wallW, gy = (mazeEndI / wallW) | 0;
  let guard = N * 4;
  while (stack.length && guard-- > 0) {
    const i = stack[stack.length - 1];
    if (i === mazeEndI) break;
    const x = i % wallW, y = (i / wallW) | 0;
    const opts = [];
    for (const nb of NB2) {
      const j = idxAt(core, x + nb[0], y + nb[1]);
      if (j >= 0 && mazeOpen[j] && !visited[j]) opts.push(j);
    }
    if (!opts.length) {
      stack.pop();
      if (stack.length) seq.push(stack[stack.length - 1]);
      continue;
    }
    let pick;
    if (Math.random() < bias) {
      let best = -1, bd = 1e9;
      for (const j of opts) {
        const jx = j % wallW, jy = (j / wallW) | 0;
        const d = Math.abs(jx - gx) + Math.abs(jy - gy) + Math.random() * 2;
        if (d < bd) { bd = d; best = j; }
      }
      pick = best;
    } else {
      pick = opts[(Math.random() * opts.length) | 0];
    }
    visited[pick] = 1;
    stack.push(pick); seq.push(pick);
  }
  return { seq, route: stack.slice() };
}

function respawnRunners(core, startCandidates) {
  const { wallW, wallH } = core;
  const N = wallW * wallH;
  mazeVisited = new Uint8Array(N);
  mazeRunners = [];
  const base = 6 + Math.max(wallW, wallH) * 0.5;
  const maxLen = Math.max(60, mazeBFS.length * 4.5);
  const mazeRunnerCount = core.effectOptions?.maze?.runners ?? 3;
  // Same up-to-6 corner-start candidates buildMaze() placed the goal
  // farthest from - threaded through so runners spawn at exactly what the
  // goal placement measured against.
  if (!startCandidates) { const Cw = Math.max(1, (wallW >> 1) - 1), Ch = Math.max(1, (wallH >> 1) - 1); startCandidates = computeStartCandidates(core, Cw, Ch); }

  for (let k = 0; k < mazeRunnerCount; k++) {
    const cand = startCandidates[k % startCandidates.length];
    const startI = cand >= 0 ? cand : mazeStartI;

    let gp = null;
    const biases = [0.75, 0.82, 0.9, 0.96];
    for (const b of biases) {
      gp = genRunnerSeq(core, b, startI);
      if (gp.seq.length <= maxLen) break;
    }
    if (!gp || gp.seq.length > maxLen) gp = { seq: mazeBFS.slice(), route: mazeBFS.slice() };
    mazeRunners.push({
      seq: gp.seq, route: gp.route, prog: 0, mark: 0,
      hue: MZ_HUES[k % MZ_HUES.length],
      speed: Math.max(base, gp.seq.length / 28) * (0.9 + Math.random() * 0.25),
    });
  }
  mazeState = 'run'; mazeStateT = 0; mazeWinner = -1;
}

function mazeMark(core, i, r, g, b) {
  if (i < 0) return;
  const { wallW, wallH } = core;
  const x = i % wallW, y = (i / wallW) | 0;
  core.setWallPixel(x, y, r, g, b);
  for (const nb of NB2) {
    const j = idxAt(core, x + nb[0], y + nb[1]);
    if (j >= 0) {
      const jx = j % wallW, jy = (j / wallW) | 0;
      core.setWallPixel(jx, jy, r * 0.55, g * 0.55, b * 0.55);
    }
  }
}

function effectMazeWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const N = wallW * wallH;
  const rebuildToken = core.effectOptions?.maze?.newMaze;
  const gridKey = `${wallW}|${wallH}`;
  const needsRebuild = !mazeOpen || mazeOpen.length !== N || mazeGridKey !== gridKey
    || (rebuildToken !== undefined && rebuildToken !== lastRebuildToken);
  if (needsRebuild) { lastRebuildToken = rebuildToken; buildMaze(core); }
  core.t += dt; mazeStateT += dt;
  const t = core.t;
  const w = MAZE_WALLS[mazeWallIdx];

  // base: lit walls form the maze structure, corridors stay dark;
  // explored corridors tinted by whichever runner got there first
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const i = y * wallW + x;
      if (mazeOpen[i]) {
        const vk = mazeVisited[i];
        if (vk) {
          const c = hsl(MZ_HUES[(vk - 1) % MZ_HUES.length], 1, 0.32);
          core.setWallPixel(x, y, c[0], c[1], c[2]);
        } else {
          core.setWallPixel(x, y, w[0] * 0.06, w[1] * 0.06, w[2] * 0.06);
        }
      } else {
        const sh = 0.7 + 0.3 * Math.sin(x / wallW * 7 + y / wallH * 5 + t * 0.8);
        core.setWallPixel(x, y, Math.min(1, w[0] * sh * 3.5), Math.min(1, w[1] * sh * 3.5), Math.min(1, w[2] * sh * 3.5));
      }
    }
  }

  if (mazeState === 'run') {
    let winner = -1;
    for (let k = 0; k < mazeRunners.length; k++) {
      const R = mazeRunners[k];
      R.prog = Math.min(R.seq.length - 1, R.prog + dt * R.speed);
      const head = R.prog | 0;
      for (let q2 = R.mark; q2 <= head; q2++) {
        const i = R.seq[q2];
        if (!mazeVisited[i]) mazeVisited[i] = k + 1;
      }
      R.mark = head;
      for (let q2 = Math.max(0, head - 8); q2 <= head; q2++) {
        const f = 1 - (head - q2) / 9;
        const c = hsl(R.hue, 1, 0.14 + f * 0.5);
        const i = R.seq[q2];
        const x = i % wallW, y = (i / wallW) | 0;
        core.setWallPixel(x, y, c[0], c[1], c[2]); // trail brightening is a max-blend on the cube; a plain overwrite here is visually equivalent since we draw oldest-to-newest
      }
      const hi = R.seq[head], hx = hi % wallW, hy = (hi / wallW) | 0;
      const hc = hsl(R.hue, 0.45, 0.88);
      core.setWallPixel(hx, hy, hc[0], hc[1], hc[2]);
      if (head >= R.seq.length - 1 && winner < 0) winner = k;
    }
    if (winner >= 0) { mazeState = 'win'; mazeWinner = winner; mazeStateT = 0; }
  } else {
    const R = mazeRunners[mazeWinner] || mazeRunners[0];
    const route = R.route, L = route.length;
    for (let k = 0; k < L; k++) {
      const hue = ((k / L * 2 - mazeStateT * 1.5) % 1 + 1) % 1;
      const c = hsl(hue, 1, 0.5 + 0.18 * Math.sin(t * 6));
      const i = route[k], x = i % wallW, y = (i / wallW) | 0;
      core.setWallPixel(x, y, c[0], c[1], c[2]);
    }
    if (mazeStateT > 3.2) buildMaze(core);
  }

  // pulsing start (green) and goal (bright white/red pulsing cross)
  const pg = 0.5 + 0.5 * Math.sin(t * 5);
  mazeMark(core, mazeStartI, 0, 0.35 + 0.6 * pg, 0.05);

  const flash = 0.5 + 0.5 * Math.sin(t * 8);
  const gr = 0.7 + 0.3 * flash, gg = flash * 0.2, gb = flash * 0.1;
  if (mazeEndI >= 0) {
    const ex = mazeEndI % wallW, ey = (mazeEndI / wallW) | 0;
    core.setWallPixel(ex, ey, 1, 1, 1);
    for (const nb of NB2) {
      const j = idxAt(core, ex + nb[0], ey + nb[1]);
      if (j >= 0) {
        const jx = j % wallW, jy = (j / wallW) | 0;
        core.setWallPixel(jx, jy, gr, gg, gb);
      }
    }
  }
}

module.exports = effectMazeWall;
