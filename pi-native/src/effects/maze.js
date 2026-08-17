// Ported verbatim (math unchanged) from effects-games.js's buildMaze()/
// genRunnerSeq()/respawnRunners()/mazeMark()/effectMaze() - "Maze Runner".
// Uses surfIdx() from ./_shared.js (effects-core.js's shared (x,y,z)->LED
// helper). Same is2d threading as weather.js: panel2dMode is TRUE for
// pi-native's own single-2D-panel hardware mode (core.panelMode==='2d'),
// not hardcoded false - a single flat panel builds one face's perfect
// maze instead of stitching a maze across all 6 cube faces via edge
// doorways, same as the browser's flat-panel preview.
//
// mazeRunnerCount is read from core.effectOptions.maze.runners (the
// sidebar's "Runners" slider, via the generic setEffectOption mechanism -
// see rain.js/lightspeed.js for the pattern) with the browser's default of
// 3. A runner-count change only takes effect on the next buildMaze() call
// (button/reselect), matching how the browser's own #mz-runners listener
// just mutates the module var without forcing a rebuild. The "⟳ NEW MAZE"
// button forces an immediate rebuild via core.effectOptions.maze.newMaze
// (a monotonically-increasing counter/token - see app.js's public/app.js
// wiring - so the tick loop can detect "the user clicked New Maze" without
// a dedicated one-shot WS command).
const { hsl } = require('../core');
const { surfIdx } = require('./_shared');

let mazeOpen = null, mazeVisited = null, mazeRunners = [], mazeBFS = [];
let mazeState = 'run', mazeStateT = 0, mazeWinner = -1;
let mazeStartI = -1, mazeEndI = -1, mazeWallIdx = 0;
let lastRebuildToken = null; // tracks core.effectOptions.maze.newMaze to detect the "NEW MAZE" button
const NB6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const MAZE_WALLS = [
  [0.030, 0.120, 0.180],
  [0.170, 0.030, 0.105],
  [0.165, 0.085, 0.012],
  [0.025, 0.140, 0.045],
  [0.095, 0.030, 0.170],
  [0.105, 0.105, 0.115],
];
const MZ_HUES = [0.50, 0.08, 0.85, 0.16, 0.70, 0.42];

// Up to 6 "start" candidate cells - one per cube face (near face-center,
// spiral search outward) in cube mode, or one per fixed corner (nearest
// open cell to it) in 2D flat-panel mode. Shared between buildMaze()'s
// goal placement (farthest from ALL of these - see farthestFromAll()
// below) and respawnRunners()'s actual runner spawn points, so the goal
// is always measured against exactly where runners really start, not a
// separately-computed approximation of it.
function computeStartCandidates(core) {
  const S = core.SIZE, faceMap = core.faceMap;
  const is2D = core.panelMode === '2d';
  const C = (S >> 1) - 1;
  if (is2D) {
    const corners = [[1, 1], [2 * C - 1, 1], [1, 2 * C - 1], [2 * C - 1, 2 * C - 1], [C, 1], [1, C]];
    return corners.map((corner) => {
      let best = -1, bd = 1e9;
      for (let cj = 0; cj < C; cj++) for (let ci = 0; ci < C; ci++) {
        const u = 2 * ci + 1, v = 2 * cj + 1;
        const idx = faceMap[0][v * S + u];
        if (idx >= 0 && mazeOpen[idx]) {
          const d = Math.abs(u - corner[0]) + Math.abs(v - corner[1]);
          if (d < bd) { bd = d; best = idx; }
        }
      }
      return best;
    });
  }
  return [0, 1, 2, 3, 4, 5].map((f) => {
    let found = -1;
    for (let r = 0; r < C && found < 0; r++) {
      for (let ci = Math.max(0, C / 2 - r) | 0, ce = Math.min(C - 1, (C / 2 + r) | 0); ci <= ce && found < 0; ci++) {
        for (let cj = Math.max(0, C / 2 - r) | 0, cje = Math.min(C - 1, (C / 2 + r) | 0); cj <= cje && found < 0; cj++) {
          const idx = faceMap[f][(2 * cj + 1) * S + (2 * ci + 1)];
          if (idx >= 0 && mazeOpen[idx]) found = idx;
        }
      }
    }
    if (found < 0) {
      for (let v = 1; v < S - 1 && found < 0; v += 2)
        for (let u = 1; u < S - 1 && found < 0; u += 2) {
          const idx = faceMap[f][v * S + u];
          if (idx >= 0 && mazeOpen[idx]) found = idx;
        }
    }
    return found;
  });
}

// Multi-source BFS: the open cell with the greatest distance to its
// NEAREST start candidate, i.e. as far as possible from ALL of them at
// once - a real report ("the end target needs to be the furthest away
// from all the start points"), replacing the previous single-corner/
// random-face goal placement which only ever considered one start point
// (or none at all).
function farthestFromAll(core, starts) {
  const N = core.N;
  const dist = new Int32Array(N).fill(-1);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  for (const s of starts) { if (s >= 0 && dist[s] < 0) { dist[s] = 0; q[qt++] = s; } }
  while (qh < qt) {
    const i = q[qh++];
    const x = core.gridX[i], y = core.gridY[i], z = core.gridZ[i];
    for (const nb of NB6) {
      const j = surfIdx(core, x + nb[0], y + nb[1], z + nb[2]);
      if (j >= 0 && mazeOpen[j] && dist[j] < 0) { dist[j] = dist[i] + 1; q[qt++] = j; }
    }
  }
  let best = -1, bd = -1;
  for (let i = 0; i < N; i++) if (mazeOpen[i] && dist[i] > bd) { bd = dist[i]; best = i; }
  return best;
}

function buildMaze(core) {
  const S = core.SIZE, N = core.N, faceMap = core.faceMap;
  const M = S - 1, C = (S >> 1) - 1;
  mazeOpen = new Uint8Array(N);
  const is2D = core.panelMode === '2d';
  const faces2d = is2D ? [0] : [0, 1, 2, 3, 4, 5];

  function openFaceLocal(f, u, v) { const i = faceMap[f][v * S + u]; if (i >= 0) mazeOpen[i] = 1; }
  function openFaceCell(f, ci, cj) { openFaceLocal(f, 2 * ci + 1, 2 * cj + 1); }
  function openV(x, y, z) { const i = surfIdx(core, x, y, z); if (i >= 0) mazeOpen[i] = 1; }

  // 1 — perfect maze on each face (iterative recursive backtracker)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const f of faces2d) {
    const vis = new Uint8Array(C * C);
    const sx = (Math.random() * C) | 0, sy = (Math.random() * C) | 0;
    const stack = [[sx, sy]];
    vis[sy * C + sx] = 1; openFaceCell(f, sx, sy);
    while (stack.length) {
      const top = stack[stack.length - 1], ci = top[0], cj = top[1];
      const opts = [];
      for (const d of dirs) {
        const ni = ci + d[0], nj = cj + d[1];
        if (ni >= 0 && ni < C && nj >= 0 && nj < C && !vis[nj * C + ni]) opts.push([ni, nj]);
      }
      if (!opts.length) { stack.pop(); continue; }
      const nx = opts[(Math.random() * opts.length) | 0];
      vis[nx[1] * C + nx[0]] = 1;
      openFaceLocal(f, ci + nx[0] + 1, cj + nx[1] + 1);
      openFaceCell(f, nx[0], nx[1]);
      stack.push(nx);
    }
  }

  if (!is2D) {
    // 2 — doorways across all 12 cube edges (stitches faces into one maze)
    const axes = [0, 1, 2];
    const doorN = Math.max(1, Math.round(C / 10));
    for (const a of axes) {
      const rest = axes.filter((q) => q !== a), b1 = rest[0], b2 = rest[1];
      for (const v1 of [0, M]) for (const v2 of [0, M]) {
        for (let d = 0; d < doorN; d++) {
          const p = 1 + 2 * ((Math.random() * C) | 0);
          const co = [0, 0, 0]; co[a] = p; co[b1] = v1; co[b2] = v2;
          openV(co[0], co[1], co[2]);
          if (v1 === M) { const c2 = co.slice(); c2[b1] = M - 1; openV(c2[0], c2[1], c2[2]); }
          if (v2 === M) { const c2 = co.slice(); c2[b2] = M - 1; openV(c2[0], c2[1], c2[2]); }
        }
      }
    }
  }

  // 3 — start and goal. The goal is placed as far as possible from EVERY
  // runner's actual start point at once (farthestFromAll() over the SAME
  // candidates respawnRunners() spawns from below - see
  // computeStartCandidates()'s own comment), not a fixed opposite corner
  // (2D) or a single random face (cube) that ignored every other runner's
  // starting position.
  const startCandidates = computeStartCandidates(core);
  // Reference "the" start point for the runner-length BFS cap below and as
  // a last-resort fallback - corner 0 ([1,1]) in 2D, face 4 (Top) in cube
  // mode, matching this effect's traditional single-start-point framing.
  const primaryStart = startCandidates[is2D ? 0 : 4];
  mazeStartI = primaryStart >= 0 ? primaryStart : (is2D ? faceMap[0][1 * S + 1] : faceMap[4][1 * S + 1]);
  const farthest = farthestFromAll(core, startCandidates);
  mazeEndI = farthest >= 0 ? farthest : mazeStartI;

  // 4 — BFS shortest path (reference for capping runner wandering)
  const prev = new Int32Array(N).fill(-1);
  const q = new Int32Array(N); let qh = 0, qt = 0;
  q[qt++] = mazeStartI; prev[mazeStartI] = mazeStartI;
  while (qh < qt) {
    const i = q[qh++];
    if (i === mazeEndI) break;
    const x = core.gridX[i], y = core.gridY[i], z = core.gridZ[i];
    for (const nb of NB6) {
      const j = surfIdx(core, x + nb[0], y + nb[1], z + nb[2]);
      if (j >= 0 && mazeOpen[j] && prev[j] < 0) { prev[j] = i; q[qt++] = j; }
    }
  }
  mazeBFS = [];
  if (prev[mazeEndI] >= 0) {
    let i = mazeEndI;
    while (i !== mazeStartI) { mazeBFS.push(i); i = prev[i]; }
    mazeBFS.push(mazeStartI); mazeBFS.reverse();
  } else mazeBFS = [mazeStartI];

  // 5 — spawn the runners
  respawnRunners(core, startCandidates);
}

// Goal-biased randomized DFS that records the FULL walk including
// backtracking out of dead ends — each runner visibly explores.
function genRunnerSeq(core, bias, startI) {
  const N = core.N;
  startI = startI ?? mazeStartI;
  const visited = new Uint8Array(N);
  const stack = [startI];
  const seq = [startI];
  visited[startI] = 1;
  const gx = core.gridX[mazeEndI], gy = core.gridY[mazeEndI], gz = core.gridZ[mazeEndI];
  let guard = N * 6;
  while (stack.length && guard-- > 0) {
    const i = stack[stack.length - 1];
    if (i === mazeEndI) break;
    const x = core.gridX[i], y = core.gridY[i], z = core.gridZ[i];
    const opts = [];
    for (const nb of NB6) {
      const j = surfIdx(core, x + nb[0], y + nb[1], z + nb[2]);
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
        const d = Math.abs(core.gridX[j] - gx) + Math.abs(core.gridY[j] - gy) + Math.abs(core.gridZ[j] - gz) + Math.random() * 2;
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
  const SIZE = core.SIZE, N = core.N;
  mazeVisited = new Uint8Array(N);
  mazeRunners = [];
  const base = 6 + SIZE * 0.5;
  const maxLen = Math.max(60, mazeBFS.length * 4.5);
  const mazeRunnerCount = core.effectOptions?.maze?.runners ?? 3;
  // startCandidates (one per corner in 2D / one per face in cube mode) is
  // computed once by buildMaze() via computeStartCandidates() and threaded
  // through here - the exact same points the goal was placed farthest
  // from, so runners always spawn at what the goal placement actually
  // measured against.
  if (!startCandidates) startCandidates = computeStartCandidates(core);

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
  core.setLED(i, r, g, b);
  const x = core.gridX[i], y = core.gridY[i], z = core.gridZ[i];
  for (const nb of NB6) {
    const j = surfIdx(core, x + nb[0], y + nb[1], z + nb[2]);
    if (j >= 0) core.setLED(j, r * 0.55, g * 0.55, b * 0.55);
  }
}

function effectMaze(core, dt) {
  const { N, colBuf } = core;
  const rebuildToken = core.effectOptions?.maze?.newMaze;
  const needsRebuild = !mazeOpen || mazeOpen.length !== N || (rebuildToken !== undefined && rebuildToken !== lastRebuildToken);
  if (needsRebuild) { lastRebuildToken = rebuildToken; buildMaze(core); }
  core.t += dt; mazeStateT += dt;
  const t = core.t;
  const w = MAZE_WALLS[mazeWallIdx];

  // base: lit walls form the maze structure, corridors stay dark;
  // explored corridors tinted by whichever runner got there first
  for (let i = 0; i < N; i++) {
    if (mazeOpen[i]) {
      const vk = mazeVisited[i];
      if (vk) {
        const c = hsl(MZ_HUES[(vk - 1) % MZ_HUES.length], 1, 0.32);
        core.setLED(i, c[0], c[1], c[2]);
      } else {
        core.setLED(i, w[0] * 0.06, w[1] * 0.06, w[2] * 0.06);
      }
    } else {
      const sh = 0.7 + 0.3 * Math.sin(core.surfX[i] * 7 + core.surfY[i] * 5 + core.surfZ[i] * 6 + t * 0.8);
      core.setLED(i, Math.min(1, w[0] * sh * 3.5), Math.min(1, w[1] * sh * 3.5), Math.min(1, w[2] * sh * 3.5));
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
        const b3 = R.seq[q2] * 3;
        if (c[0] > colBuf[b3]) colBuf[b3] = c[0];
        if (c[1] > colBuf[b3 + 1]) colBuf[b3 + 1] = c[1];
        if (c[2] > colBuf[b3 + 2]) colBuf[b3 + 2] = c[2];
      }
      const hc = hsl(R.hue, 0.45, 0.88);
      core.setLED(R.seq[head], hc[0], hc[1], hc[2]);
      if (head >= R.seq.length - 1 && winner < 0) winner = k;
    }
    if (winner >= 0) { mazeState = 'win'; mazeWinner = winner; mazeStateT = 0; }
  } else {
    const R = mazeRunners[mazeWinner] || mazeRunners[0];
    const route = R.route, L = route.length;
    for (let k = 0; k < L; k++) {
      const hue = ((k / L * 2 - mazeStateT * 1.5) % 1 + 1) % 1;
      const c = hsl(hue, 1, 0.5 + 0.18 * Math.sin(t * 6));
      core.setLED(route[k], c[0], c[1], c[2]);
    }
    if (mazeStateT > 3.2) buildMaze(core);
  }

  // pulsing start (green) and goal (bright white/red pulsing cross)
  const pg = 0.5 + 0.5 * Math.sin(t * 5);
  mazeMark(core, mazeStartI, 0, 0.35 + 0.6 * pg, 0.05);

  const flash = 0.5 + 0.5 * Math.sin(t * 8);
  const gr = 0.7 + 0.3 * flash, gg = flash * 0.2, gb = flash * 0.1;
  if (mazeEndI >= 0) {
    core.setLED(mazeEndI, 1, 1, 1);
    const ex = core.gridX[mazeEndI], ey = core.gridY[mazeEndI], ez = core.gridZ[mazeEndI];
    for (const nb of NB6) {
      const j = surfIdx(core, ex + nb[0], ey + nb[1], ez + nb[2]);
      if (j >= 0) core.setLED(j, gr, gg, gb);
    }
  }
}

module.exports = effectMaze;
