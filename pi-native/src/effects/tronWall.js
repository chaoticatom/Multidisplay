// Wall-mode counterpart to tron.js ("Tron Bikes").
//
// tron.js already has an `is2d` branch (border-wall mode: real red edge
// walls + a reduced center-seeking AI bias) which is exactly the shape
// this port generalises, per the batch brief - except for a flat wall
// canvas the border walls are NOT optional the way they are on the cube
// (where `borderWalls` picks between "wrap past the edge onto another
// face" and "die at the edge"): a wall has no other face to wrap onto, so
// this port always plays with edges-are-walls, unconditionally. The
// `core.effectOptions.tron.borderWalls` option key is read for
// compatibility (a stray truthy/falsy value from the shared options
// object won't throw) but has NO EFFECT here - the wall is always
// bordered - and the sidebar's border-walls toggle is simply moot in wall
// mode, same as it's already moot/hardcoded-false on the full 6-face cube.
//
// bikes/speed/newGame option keys are preserved unchanged (same meaning
// as tron.js).
//
// SIMPLIFIED WALL-NATIVE MOVEMENT (the brief specifically calls this out):
// tron.js's tronMoveFast()/tronMove() exist ONLY because the cube has 6
// faces that a bike can cross between mid-move, which needs a per-face
// axis-remapping switch statement. A flat wall has no faces at all, so
// "move and wrap-or-not" collapses to plain bounds-checked (x,y) arithmetic
// - no switch, no face argument, nothing to remap. tronMoveFastWall() below
// is the wall-native equivalent of tronMoveFast(): same non-allocating
// reused-scratch-object contract (for the identical reason documented in
// tron.js - the flood-fill/runway/escape/future-options probes in
// tronDecide() call this thousands of times per bike per frame), just
// returning null instead of wrapping when a move would leave the canvas -
// null means "wall/edge, illegal move", handled by callers exactly like an
// occupied-trail cell.
const { hsl } = require('../core');

const TRON_HUES = [0.57, 0.08, 0.92, 0.33, 0.70, 0.15, 0.50, 0.02];
const TRON_GRIDS = [[0.01, 0.06, 0.12], [0.01, 0.06, 0.01], [0.06, 0.01, 0.06], [0.04, 0.04, 0.04]];

// Non-allocating: returns a reused scratch {x,y} on success, or null at a
// canvas edge (there is nothing to wrap onto in wall mode).
const _mv = { x: 0, y: 0 };
function tronMoveFastWall(core, x, y, du, dv) {
  const { wallW, wallH } = core;
  const nx = x + du, ny = y + dv;
  if (nx < 0 || nx >= wallW || ny < 0 || ny >= wallH) return null;
  _mv.x = nx; _mv.y = ny;
  return _mv;
}

let tronTrail = null, tronBikes = [], tronExplosions = [], tronState = 'run', tronStateT = 0;
let tronBikeCount = 4, tronWinner = -1, tronGridTheme = 0;
let tronVisited = null;   // reusable buffer - allocated once per initTronWall
let tronBFSQueue = null;
let tronDeaths = null;    // death count per bike (index matches bike slot)
let tronScoreFill = null; // animated fill level per bike (0 to tronMaxFill)
let tronMaxFill = 0;      // pixels in each score box
let tronWinFlash = 0;
let tronWinBike = -1;
let tronRoundWinner = -1;
let tronGridKey = null; // `${wallW}|${wallH}` - detects a wall-layout change
let lastBikeCount = -1, lastNewGameToken = undefined;

function tronScoreZone(core) {
  const { wallW } = core;
  const boxW = 4, boxH = 4, gap = 1;
  const startU = wallW - boxW - 2;
  const totalH = 2 + tronBikeCount * (boxH + gap);
  return { u0: startU - 2, v0: 0, u1: wallW - 1, v1: totalH };
}

const TRON_BFS_DIRS_U = [1, -1, 0, 0];
const TRON_BFS_DIRS_V = [0, 0, 1, -1];

function tronFloodFill(core, x, y, du, dv) {
  if (!tronVisited) return 0;
  const { wallW, wallH } = core;
  const N = wallW * wallH;
  const start = tronMoveFastWall(core, x, y, du, dv);
  if (!start) return 0;
  const nx = start.x, ny = start.y;
  const startIdx = ny * wallW + nx;
  if (tronTrail[startIdx] > 0) return 0;

  // Capped well below the full canvas size, same rationale as tron.js's
  // cube-side cap (`Math.min(N, SIZE*SIZE)` there): this only needs to
  // distinguish "wide open" from "cramped", not measure exact reachable
  // area. tron.js's cap is a FIXED absolute pixel count (one panel's
  // worth, SIZE*SIZE) regardless of how many faces/panels exist, so this
  // uses the same fixed budget - one panel's worth of cells
  // (wallPanelSize^2) - rather than scaling with wallW*wallH, otherwise a
  // bigger wall (more panels) would silently defeat the whole point of
  // capping by making CAP >= N again.
  const panelCells = core.wallPanelSize * core.wallPanelSize;
  const CAP = Math.min(N, panelCells);
  const dirty = [];
  const Q = tronBFSQueue;
  tronVisited[startIdx] = 1; dirty.push(startIdx);
  Q[0] = nx; Q[1] = ny;
  let qi = 0, qe = 2, count = 1;

  while (qi < qe && count < CAP) {
    const cx = Q[qi++], cy = Q[qi++];
    for (let d = 0; d < 4; d++) {
      const m = tronMoveFastWall(core, cx, cy, TRON_BFS_DIRS_U[d], TRON_BFS_DIRS_V[d]);
      if (!m) continue;
      const idx = m.y * wallW + m.x;
      if (tronTrail[idx] > 0 || tronVisited[idx]) continue;
      tronVisited[idx] = 1; dirty.push(idx);
      Q[qe++] = m.x; Q[qe++] = m.y;
      count++;
      if (count >= CAP) break;
    }
  }
  for (const idx of dirty) tronVisited[idx] = 0;
  return count;
}

function tronDecide(core, bk) {
  const { wallW, wallH } = core;
  const { x, y, du, dv } = bk;
  const ldu = -dv, ldv = du;
  const rdu = dv, rdv = -du;

  const candidates = [
    { du, dv, straight: true, turnDir: 0 },
    { du: ldu, dv: ldv, straight: false, turnDir: -1 },
    { du: rdu, dv: rdv, straight: false, turnDir: 1 },
  ];

  const scored = [];
  for (const m of candidates) {
    const moved = tronMoveFastWall(core, x, y, m.du, m.dv);
    if (!moved) continue;
    const nx = moved.x, ny = moved.y;
    const idx = ny * wallW + nx;
    if (tronTrail[idx] > 0) continue;
    const space = tronFloodFill(core, x, y, m.du, m.dv);

    let runway = 0, rx = nx, ry = ny;
    for (let step = 0; step < Math.max(wallW, wallH); step++) {
      const sm = tronMoveFastWall(core, rx, ry, m.du, m.dv);
      if (!sm) break;
      const si = sm.y * wallW + sm.x;
      if (tronTrail[si] > 0) break;
      rx = sm.x; ry = sm.y; runway++;
    }

    let escapeRoutes = 0;
    {
      const em1 = tronMoveFastWall(core, nx, ny, m.du, m.dv);
      if (em1) { const ei1 = em1.y * wallW + em1.x; if (tronTrail[ei1] === 0) escapeRoutes++; }
      const em2 = tronMoveFastWall(core, nx, ny, -m.dv, m.du);
      if (em2) { const ei2 = em2.y * wallW + em2.x; if (tronTrail[ei2] === 0) escapeRoutes++; }
      const em3 = tronMoveFastWall(core, nx, ny, m.dv, -m.du);
      if (em3) { const ei3 = em3.y * wallW + em3.x; if (tronTrail[ei3] === 0) escapeRoutes++; }
    }

    let futureOptions = 0;
    let wx = nx, wy = ny, wd = m.du, wdv2 = m.dv;
    for (let step = 0; step < 4; step++) {
      const sm = tronMoveFastWall(core, wx, wy, wd, wdv2);
      if (!sm) break;
      const si = sm.y * wallW + sm.x;
      if (tronTrail[si] > 0) break;
      wx = sm.x; wy = sm.y;
      const fm1 = tronMoveFastWall(core, wx, wy, -wdv2, wd);
      if (fm1) { const fi1 = fm1.y * wallW + fm1.x; if (tronTrail[fi1] === 0) futureOptions++; }
      const fm2 = tronMoveFastWall(core, wx, wy, wdv2, -wd);
      if (fm2) { const fi2 = fm2.y * wallW + fm2.x; if (tronTrail[fi2] === 0) futureOptions++; }
    }

    const dim = Math.max(wallW, wallH);
    const centerDist = Math.abs(nx - wallW / 2) + Math.abs(ny - wallH / 2);

    scored.push({ m, space, nx, ny, escapeRoutes, runway, futureOptions, centerDist, dim });
  }
  if (!scored.length) return null;

  const maxSpace = Math.max(...scored.map((s) => s.space));
  const mySpace = scored.find((s) => s.m.straight)?.space ?? 0;

  const hist = bk._turnHist || (bk._turnHist = []);
  let spiralPenaltyDir = 0;
  if (hist.length >= 3) {
    const recent = hist.slice(-3);
    if (recent.every((d) => d === 1)) spiralPenaltyDir = 1;
    else if (recent.every((d) => d === -1)) spiralPenaltyDir = -1;
  }

  const avoidanceMap = new Map();
  const cutBonus = new Map();
  const dim = Math.max(wallW, wallH);
  for (const other of tronBikes) {
    if (!other.alive || other === bk) continue;
    for (const s of scored) {
      const dx = s.nx - other.x, dy = s.ny - other.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < dim * 0.4 && s.space > mySpace * 0.7) {
        cutBonus.set(s, (cutBonus.get(s) || 0) + (dim * 0.4 - dist) * 0.6);
      }
      if (dist < dim * 0.25 && s.space < mySpace * 0.5) {
        avoidanceMap.set(s, (avoidanceMap.get(s) || 0) + (dim * 0.25 - dist) * 1.5);
      }
    }
  }

  // Border mode is unconditionally on for a flat wall (see module comment).
  let best = null, bestScore = -Infinity;
  for (const s of scored) {
    const escapePenalty = s.escapeRoutes === 0 ? -dim * 10 : (s.escapeRoutes === 1 ? -dim * 2 : 0);
    const openBonus = s.space >= maxSpace * 0.95 ? dim * 0.5 : 0;
    const straightBonus = s.m.straight ? (Math.min(s.runway, dim / 4) * 0.8) : 0;
    const runwayPenalty = s.runway < 3 ? -dim * 3 : (s.runway < 6 ? -dim : 0);
    const futureBonus = s.futureOptions * dim * 0.15;
    const centerBonus = (dim - s.centerDist) * 0.02;
    const edgeAttract = Math.min(s.nx, wallW - 1 - s.nx, s.ny, wallH - 1 - s.ny) < 4 ? dim * 0.3 * Math.random() : 0;
    const spiralPenalty = (spiralPenaltyDir !== 0 && s.m.turnDir === spiralPenaltyDir) ? -dim * 4 : 0;
    const cut = cutBonus.get(s) || 0;
    const avoid = avoidanceMap.get(s) || 0;
    const score = s.space * 1.2 + straightBonus + cut + openBonus + escapePenalty
      + runwayPenalty + futureBonus + centerBonus + spiralPenalty + edgeAttract
      - avoid + (Math.random() - 0.5) * 1.5;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best) {
    hist.push(best.m.turnDir);
    if (hist.length > 6) hist.shift();
    return [best.m.du, best.m.dv];
  }
  return null;
}

function tronCrash(core, bk) {
  bk.alive = false;
  const idx = tronBikes.indexOf(bk);
  if (idx >= 0 && tronDeaths) tronDeaths[idx]++;
  // Flat 2D explosion (no cube-face-to-world-space mapping needed here -
  // the wall canvas IS the world space, one pixel per unit).
  for (let i = 0; i < 55; i++) {
    const th = Math.random() * Math.PI * 2;
    const sp = 2 + Math.random() * 8;
    tronExplosions.push({
      x: bk.x, y: bk.y, vx: Math.cos(th) * sp, vy: Math.sin(th) * sp, life: 1, hue: bk.hue,
    });
  }
}

function initTronWall(core) {
  const { wallW, wallH } = core;
  const N = wallW * wallH;
  const boxW = 4, boxH = 4;
  tronMaxFill = boxW * boxH;
  if (!tronDeaths || tronDeaths.length !== tronBikeCount) {
    tronDeaths = new Array(tronBikeCount).fill(0);
    tronScoreFill = new Array(tronBikeCount).fill(tronMaxFill);
  }
  tronTrail = new Uint8Array(N);
  tronVisited = new Uint8Array(N);
  tronBFSQueue = new Int16Array(N * 2);
  tronGridKey = `${wallW}|${wallH}`;

  // Mark scoreboard zone as wall
  const sz = tronScoreZone(core);
  for (let v = Math.max(0, sz.v0); v <= Math.min(wallH - 1, sz.v1); v++) {
    for (let u = Math.max(0, sz.u0); u <= Math.min(wallW - 1, sz.u1); u++) {
      tronTrail[v * wallW + u] = 255;
    }
  }
  // Canvas edges are always walls in wall mode (no wrap alternative exists)
  for (let x = 0; x < wallW; x++) { tronTrail[x] = 255; tronTrail[(wallH - 1) * wallW + x] = 255; }
  for (let y = 0; y < wallH; y++) { tronTrail[y * wallW] = 255; tronTrail[y * wallW + (wallW - 1)] = 255; }

  tronBikes = []; tronExplosions = []; tronWinner = -1; tronState = 'run'; tronStateT = 0;
  const HDIR = [[1, 0], [-1, 0]];
  const VDIR = [[0, 1], [0, -1]];
  const margin = Math.max(4, Math.min(wallW, wallH) >> 3);
  for (let k = 0; k < tronBikeCount; k++) {
    const eliminated = (tronScoreFill && tronScoreFill[k] <= 0);
    let sx, sy, tries = 0;
    do {
      sx = margin + Math.floor(Math.random() * Math.max(1, wallW - margin * 2));
      sy = margin + Math.floor(Math.random() * Math.max(1, wallH - margin * 2));
      tries++;
    } while (sx >= sz.u0 && sy <= sz.v1 && tries < 50);
    let dir;
    if (k % 2 === 0) dir = HDIR[Math.floor(Math.random() * 2)];
    else dir = VDIR[Math.floor(Math.random() * 2)];
    tronBikes.push({
      x: sx, y: sy, du: dir[0], dv: dir[1],
      hue: TRON_HUES[k % TRON_HUES.length], alive: !eliminated, acc: 0,
      speed: (Math.min(wallW, wallH) * 0.7 + Math.min(wallW, wallH) * 0.3 * (k / tronBikeCount)),
    });
  }
}

function tronRenderScoreOnLEDs(core, dt) {
  if (!tronDeaths || !tronBikes.length || !tronScoreFill) return;
  const { wallW, wallH } = core;

  for (let i = 0; i < tronBikes.length; i++) {
    const target = Math.max(0, tronMaxFill - tronDeaths[i]);
    if (tronScoreFill[i] > target) tronScoreFill[i] = Math.max(target, tronScoreFill[i] - 1);
  }

  const inGame = [];
  for (let i = 0; i < tronBikes.length; i++) {
    if (tronScoreFill[i] > 0) inGame.push(i);
  }
  if (inGame.length <= 1 && tronWinFlash <= 0) {
    tronWinBike = inGame.length === 1 ? inGame[0] : 0;
    tronWinFlash = 5.0;
  }

  const boxW = 4, boxH = 4, gap = 1;
  const startU = wallW - boxW - 2;
  const sorted = tronBikes.map((_, i) => i);
  sorted.sort((a, b) => tronScoreFill[b] - tronScoreFill[a]);

  for (let rank = 0; rank < sorted.length; rank++) {
    const bi = sorted[rank];
    const h = TRON_HUES[bi % TRON_HUES.length];
    const alive = tronBikes[bi] && tronBikes[bi].alive;
    const rgb = hsl(h, 1, alive ? 0.5 : 0.15);
    const topV = 2 + rank * (boxH + gap);
    const fillPx = Math.min(tronScoreFill[bi], tronMaxFill);
    let drawn = 0;
    for (let row = boxH - 1; row >= 0 && drawn < fillPx; row--) {
      for (let col = 0; col < boxW && drawn < fillPx; col++) {
        const v = topV + row, u = startU + col;
        if (v >= wallH || u >= wallW) continue;
        core.setWallPixel(u, v, rgb[0], rgb[1], rgb[2]);
        drawn++;
      }
    }
  }

  if (tronWinFlash > 0) {
    tronWinFlash -= dt;
    const wh = TRON_HUES[tronWinBike % TRON_HUES.length];
    const flash = 0.3 + 0.7 * Math.abs(Math.sin(tronWinFlash * 4));
    const rgb = hsl(wh, 1, flash * 0.6);
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) core.setWallPixel(x, y, rgb[0], rgb[1], rgb[2]);
    const pulse = 0.5 + 0.5 * Math.sin(tronWinFlash * 8);
    const trailRgb = hsl(wh, 1, 0.3 + pulse * 0.6);
    for (let y = 0; y < wallH; y++) {
      for (let x = 0; x < wallW; x++) {
        if (tronTrail[y * wallW + x] === tronWinBike + 1) core.setWallPixel(x, y, trailRgb[0], trailRgb[1], trailRgb[2]);
      }
    }
    if (tronWinFlash <= 0) {
      tronDeaths.fill(0);
      tronScoreFill.fill(tronMaxFill);
      tronWinBike = -1;
      initTronWall(core);
    }
  }
}

function effectTronWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const N = wallW * wallH;
  const opts = core.effectOptions?.tron || {};
  const bikesOpt = Math.max(2, Math.min(8, Math.round(opts.bikes ?? 4)));
  const speedOpt = opts.speed ?? 1;
  const newGameToken = opts.newGame;
  const gridKey = `${wallW}|${wallH}`;

  const needsRebuild = !tronTrail || tronTrail.length !== N || tronGridKey !== gridKey
    || bikesOpt !== lastBikeCount
    || (newGameToken !== undefined && newGameToken !== lastNewGameToken);
  if (needsRebuild) {
    tronBikeCount = bikesOpt;
    lastBikeCount = bikesOpt;
    lastNewGameToken = newGameToken;
    initTronWall(core);
  }

  core.t += dt; tronStateT += dt;
  const g = TRON_GRIDS[tronGridTheme];

  // base: tron grid background (flat 2D checker, no z axis to fold in)
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const onGrid = x % 4 === 0 || y % 4 === 0;
      core.setWallPixel(x, y, onGrid ? g[0] * 1.5 : g[0], onGrid ? g[1] * 1.5 : g[1], onGrid ? g[2] * 1.5 : g[2]);
    }
  }

  // trail - solid 1-pixel lines per bike
  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const i = y * wallW + x;
      if (tronTrail[i] > 0 && tronTrail[i] !== 255) {
        const bk = tronBikes[tronTrail[i] - 1];
        if (!bk) continue;
        const [r, gg, b] = hsl(bk.hue, 1, 0.45);
        core.setWallPixel(x, y, r, gg, b);
      }
    }
  }

  if (tronState === 'run') {
    for (const bk of tronBikes) {
      if (!bk.alive) continue;
      bk.acc += dt * bk.speed * speedOpt * (core.speedMult || 1);
      while (bk.acc >= 1) {
        bk.acc -= 1;
        const newDir = tronDecide(core, bk);
        if (!newDir) { tronCrash(core, bk); break; }
        const [ndu, ndv] = newDir;
        const moved = tronMoveFastWall(core, bk.x, bk.y, ndu, ndv);
        if (!moved) { tronCrash(core, bk); break; }
        const nx = moved.x, ny = moved.y;
        const idx = ny * wallW + nx;
        if (tronTrail[idx] > 0) { tronCrash(core, bk); break; }
        bk.du = ndu; bk.dv = ndv;
        const bikeIdx = tronBikes.indexOf(bk) + 1;
        tronTrail[bk.y * wallW + bk.x] = bikeIdx;
        bk.x = nx; bk.y = ny;
        // Mark new position immediately to prevent other bikes entering this cell
        tronTrail[idx] = bikeIdx;
      }
    }

    // Head-on collision: if two alive bikes share the same cell, both crash
    for (let i = 0; i < tronBikes.length; i++) {
      if (!tronBikes[i].alive) continue;
      for (let j = i + 1; j < tronBikes.length; j++) {
        if (!tronBikes[j].alive) continue;
        if (tronBikes[i].x === tronBikes[j].x && tronBikes[i].y === tronBikes[j].y) {
          tronCrash(core, tronBikes[i]);
          tronCrash(core, tronBikes[j]);
        }
      }
    }

    // draw bike heads
    for (const bk of tronBikes) {
      if (!bk.alive) continue;
      const [r, gg, b] = hsl(bk.hue, 0.3, 0.95);
      core.setWallPixel(bk.x, bk.y, r, gg, b);
    }

    const nowAlive = tronBikes.filter((b) => b.alive);
    if (nowAlive.length <= 1) {
      tronRoundWinner = nowAlive.length === 1 ? tronBikes.indexOf(nowAlive[0]) : -1;
      const nonElim = [];
      for (let i = 0; i < tronBikeCount; i++) if (tronScoreFill[i] > 0) nonElim.push(i);
      if (nonElim.length > 1) {
        tronState = 'restart'; tronStateT = 0;
      } else {
        tronWinner = nonElim.length === 1 ? nonElim[0] : 0;
        tronState = 'win'; tronStateT = 0;
      }
    }
  } else if (tronState === 'restart') {
    if (tronRoundWinner >= 0) {
      const hue = (tronStateT * 2) % 1;
      const rgb = hsl(hue, 1, 0.7);
      for (let y = 0; y < wallH; y++) {
        for (let x = 0; x < wallW; x++) {
          if (tronTrail[y * wallW + x] === tronRoundWinner + 1) core.setWallPixel(x, y, rgb[0], rgb[1], rgb[2]);
        }
      }
    }
    if (tronStateT > 1.5) initTronWall(core);
  } else {
    if (tronWinner >= 0) {
      const wh = TRON_HUES[tronWinner];
      const pulse = 0.5 + 0.5 * Math.sin(tronStateT * 8);
      const [r, gg, b] = hsl(wh, 1, 0.3 + pulse * 0.5);
      for (let y = 0; y < wallH; y++) {
        for (let x = 0; x < wallW; x++) {
          if (tronTrail[y * wallW + x] === tronWinner + 1) core.setWallPixel(x, y, r, gg, b);
        }
      }
    }
    if (tronWinFlash <= 0 && tronStateT > 5) initTronWall(core);
  }

  // explosions (only during normal play, not during win flash) - flat 2D
  // additive glow, no world-space/SPACING conversion needed on a wall.
  if (tronWinFlash <= 0) {
    for (let k = tronExplosions.length - 1; k >= 0; k--) {
      const p = tronExplosions[k];
      p.x += p.vx * dt * 8; p.y += p.vy * dt * 8; p.life -= dt * 1.8;
      if (p.life <= 0) { tronExplosions.splice(k, 1); continue; }
      const R = 4;
      const x0 = Math.max(0, Math.floor(p.x - R)), x1 = Math.min(wallW - 1, Math.ceil(p.x + R));
      const y0 = Math.max(0, Math.floor(p.y - R)), y1 = Math.min(wallH - 1, Math.ceil(p.y + R));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const gx = (x / core.wallPanelSize) | 0, gy = (y / core.wallPanelSize) | 0;
          if (!core._wallOccupied[gy * core.wallCols + gx]) continue; // same panel-occupancy gate setWallPixel applies
          const dx = x - p.x, dy = y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < R) {
            const bri = Math.pow(1 - d / R, 1.2) * p.life;
            const [r, gg, bv] = hsl(p.hue, 1, bri);
            const o = (y * wallW + x) * 3;
            if (r > core.wallBuf[o]) core.wallBuf[o] = r;
            if (gg > core.wallBuf[o + 1]) core.wallBuf[o + 1] = gg;
            if (bv > core.wallBuf[o + 2]) core.wallBuf[o + 2] = bv;
          }
        }
      }
    }
  }

  // Red border walls - always on in wall mode (see module comment)
  for (let x = 0; x < wallW; x++) { core.setWallPixel(x, 0, 0.9, 0.05, 0.05); core.setWallPixel(x, wallH - 1, 0.9, 0.05, 0.05); }
  for (let y = 0; y < wallH; y++) { core.setWallPixel(0, y, 0.9, 0.05, 0.05); core.setWallPixel(wallW - 1, y, 0.9, 0.05, 0.05); }
  // Red outline around scoreboard zone
  const sz = tronScoreZone(core);
  for (let v = Math.max(0, sz.v0); v <= Math.min(wallH - 1, sz.v1); v++) {
    for (let u = Math.max(0, sz.u0); u <= Math.min(wallW - 1, sz.u1); u++) {
      const isEdge = (v === sz.v0 || v === sz.v1 || u === sz.u0 || u === sz.u1);
      if (isEdge) core.setWallPixel(u, v, 0.9, 0.05, 0.05);
    }
  }

  tronRenderScoreOnLEDs(core, dt);
}

module.exports = effectTronWall;
