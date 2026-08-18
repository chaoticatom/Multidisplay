// Ported verbatim (math unchanged) from effects-games.js's tron section:
// TRON_HUES/TRON_GRIDS/tronFloodFill()/tronDecide()/tronCrash()/
// initTron()/effectTron()/tronScoreZone()/tronRenderScoreOnLEDs()/
// tronRenderWinsText() - "Tron Light Bikes". Uses tronMove() from
// ./_shared.js (core-first-arg convention, see that file's module comment)
// and TOTAL_SPAN/hsl from ../core.js for the explosion-particle physics
// (same SPACING/HALF world-unit math cube.js uses for its 3D positions -
// kept unchanged, rather than switched to raw grid units, so particle
// spread/speed matches the browser exactly at any core.SIZE).
//
// browser globals -> core.effectOptions.tron.* (generic setEffectOption
// mechanism, same pattern as maze.js/rain.js/lightspeed.js):
//   tronBikeCount    -> core.effectOptions.tron.bikes      (default 4, 2-8)
//   tronSpeedMult    -> core.effectOptions.tron.speed      (default 1)
//   tronStraightness -> core.effectOptions.tron.straight   (checkbox,
//     default checked/true) - originally ported faithfully as a dead
//     value (the browser's own #tron-straight-check has no change
//     listener either), but a real audit specifically asked for every
//     control to actually work, so tronDecide() now reads it: checked
//     keeps the original strong straight-ahead bias (straightWeight 0.8),
//     unchecked cuts it to 0.15 so bikes turn far more freely. This is a
//     deliberate departure from the browser original's own bug.
//   tronBorderWalls  -> core.effectOptions.tron.borderWalls (default false)
//   "⟳ NEW GAME" button -> core.effectOptions.tron.newGame (monotonically
//     increasing token, same one-shot-via-token trick as maze.js's newMaze)
//
// is2d threading: `core.panelMode === '2d'` replaces the browser's
// `typeof panel2dMode!=='undefined' && panel2dMode` guards, same as
// maze.js/weather.js - pi-native's own flat single-panel hardware mode,
// not hardcoded false. Border-wall mode (the red edge walls + reduced
// center-seeking AI bias) is real gameplay behaviour gated on
// `is2d && borderWalls`, exactly as in the browser.
//
// tronUpdateScoreboard() is dropped - it only ever wrote to a DOM element
// (#tron-scoreboard) that has no equivalent in pi-native's headless
// engine. tronRenderScoreOnLEDs() (the actual on-cube score boxes drawn
// into colBuf) is ported in full, since that part is real pixel output.
const { hsl, TOTAL_SPAN } = require('../core');
const { tronMove } = require('./_shared');

const TRON_HUES = [0.57, 0.08, 0.92, 0.33, 0.70, 0.15, 0.50, 0.02];
const TRON_GRIDS = [[0.01, 0.06, 0.12], [0.01, 0.06, 0.01], [0.06, 0.01, 0.06], [0.04, 0.04, 0.04]];

// Non-allocating counterpart of _shared.js's tronMove(), used only inside
// this file's hot AI-decision loops (floodfill BFS + the runway/escape/
// future-options probes in tronDecide()). Those loops call this thousands
// of times per bike per frame; tronMove()'s [face,u,v,du,dv] array return
// was measured allocating enough garbage to make tronDecide() take ~150ms/
// tick on ordinary desktop hardware (worse on a Pi) - by far the slowest
// thing in the whole tick loop. None of these callers read the
// post-wrap du/dv tronMove() also returns (verified against the original
// effects-games.js source: floodfill and the runway/escape/future-options
// probes only ever destructure [nf,nu,nv], never [,,,ndu,ndv]), so writing
// face/u/v into a single reused scratch object is behaviourally identical,
// just without the per-call array allocation. The real per-substep bike
// move in effectTron() still uses the original tronMove() (needs the
// rotated direction, and only runs once or twice per bike per frame, so
// its allocation cost is negligible).
const _mv = { face: 0, u: 0, v: 0 };
function tronMoveFast(core, face, u, v, du, dv) {
  const SIZE = core.SIZE, M = SIZE - 1, nu = u + du, nv = v + dv;
  if (nu >= 0 && nu <= M && nv >= 0 && nv <= M) { _mv.face = face; _mv.u = nu; _mv.v = nv; return _mv; }
  switch (face) {
    case 0:
      if (du === 1) { _mv.face = 2; _mv.u = M; _mv.v = v; } else if (du === -1) { _mv.face = 3; _mv.u = M; _mv.v = v; }
      else if (dv === 1) { _mv.face = 4; _mv.u = u; _mv.v = M; } else { _mv.face = 5; _mv.u = u; _mv.v = M; }
      return _mv;
    case 1:
      if (du === 1) { _mv.face = 2; _mv.u = 0; _mv.v = v; } else if (du === -1) { _mv.face = 3; _mv.u = 0; _mv.v = v; }
      else if (dv === 1) { _mv.face = 4; _mv.u = u; _mv.v = 0; } else { _mv.face = 5; _mv.u = u; _mv.v = 0; }
      return _mv;
    case 2:
      if (du === 1) { _mv.face = 0; _mv.u = M; _mv.v = v; } else if (du === -1) { _mv.face = 1; _mv.u = M; _mv.v = v; }
      else if (dv === 1) { _mv.face = 4; _mv.u = M; _mv.v = u; } else { _mv.face = 5; _mv.u = M; _mv.v = u; }
      return _mv;
    case 3:
      if (du === 1) { _mv.face = 0; _mv.u = 0; _mv.v = v; } else if (du === -1) { _mv.face = 1; _mv.u = 0; _mv.v = v; }
      else if (dv === 1) { _mv.face = 4; _mv.u = 0; _mv.v = u; } else { _mv.face = 5; _mv.u = 0; _mv.v = u; }
      return _mv;
    case 4:
      if (du === 1) { _mv.face = 2; _mv.u = v; _mv.v = M; } else if (du === -1) { _mv.face = 3; _mv.u = v; _mv.v = M; }
      else if (dv === 1) { _mv.face = 0; _mv.u = u; _mv.v = M; } else { _mv.face = 1; _mv.u = u; _mv.v = M; }
      return _mv;
    default:
      if (du === 1) { _mv.face = 2; _mv.u = v; _mv.v = 0; } else if (du === -1) { _mv.face = 3; _mv.u = v; _mv.v = 0; }
      else if (dv === 1) { _mv.face = 0; _mv.u = u; _mv.v = 0; } else { _mv.face = 1; _mv.u = u; _mv.v = 0; }
      return _mv;
  }
}

let tronTrail = null, tronBikes = [], tronExplosions = [], tronState = 'run', tronStateT = 0;
let tronBikeCount = 4, tronWinner = -1, tronGridTheme = 0;
let tronVisited = null;   // reusable buffer - allocated once per initTron
let tronBFSQueue = null;
let tronDeaths = null;    // death count per bike (index matches bike slot)
let tronScoreFill = null; // animated fill level per bike (0 to tronMaxFill)
let tronMaxFill = 0;      // pixels in each score box
let tronWinFlash = 0;
let tronWinBike = -1;
let tronRoundWinner = -1;
// Tracks the option-panel inputs that require a full initTron() reset when
// changed mid-game (same "the browser listener sets tronTrail=null" trick,
// just centralised here instead of scattered across DOM listeners).
let lastBikeCount = -1, lastBorderWalls = null, lastNewGameToken = undefined;

function tronScoreZone(core) {
  const SIZE = core.SIZE;
  const boxW = 4, boxH = 4, gap = 1;
  const startU = SIZE - boxW - 2;
  const totalH = 2 + tronBikeCount * (boxH + gap);
  return { u0: startU - 2, v0: 0, u1: SIZE - 1, v1: totalH };
}

// dx/dy pairs for the 4-neighbour BFS step below, hoisted out of the loop
// body (was a fresh array-of-arrays literal re-created and re-iterated via
// for-of on every single queue node - see tronMoveFast's comment for why
// this hot path is written to avoid allocation).
const TRON_BFS_DIRS_U = [1, -1, 0, 0];
const TRON_BFS_DIRS_V = [0, 0, 1, -1];

function tronFloodFill(core, face, u, v, du, dv) {
  if (!tronVisited) return 0;
  const SIZE = core.SIZE, N = core.N, faceMap = core.faceMap;
  const start = tronMoveFast(core, face, u, v, du, dv);
  const nf = start.face, nu = start.u, nv = start.v;
  const startIdx = faceMap[nf][nv * SIZE + nu];
  if (startIdx < 0 || tronTrail[startIdx] > 0) return 0;

  // Capped well below the full board size - this only needs to tell "wide
  // open" apart from "cramped", not measure exact reachable area, and the
  // full-board cap (browser's Math.min(N,SIZE*SIZE*3)) made this BFS the
  // single most expensive thing in the tick loop on real (especially Pi-
  // class) hardware. All candidates are scored with the same cap, so the
  // relative comparisons tronDecide() actually uses are unaffected.
  const CAP = Math.min(N, SIZE * SIZE);
  const dirty = [];
  const Q = tronBFSQueue;
  tronVisited[startIdx] = 1; dirty.push(startIdx);
  Q[0] = nf; Q[1] = nu; Q[2] = nv;
  let qi = 0, qe = 3, count = 1;

  while (qi < qe && count < CAP) {
    const cf = Q[qi++], cu = Q[qi++], cv = Q[qi++];
    for (let d = 0; d < 4; d++) {
      const m = tronMoveFast(core, cf, cu, cv, TRON_BFS_DIRS_U[d], TRON_BFS_DIRS_V[d]);
      const idx = faceMap[m.face][m.v * SIZE + m.u];
      if (idx < 0 || tronTrail[idx] > 0 || tronVisited[idx]) continue;
      tronVisited[idx] = 1; dirty.push(idx);
      Q[qe++] = m.face; Q[qe++] = m.u; Q[qe++] = m.v;
      count++;
      if (count >= CAP) break;
    }
  }
  for (const idx of dirty) tronVisited[idx] = 0;
  return count;
}

function tronDecide(core, bk, is2d, borderWalls) {
  const SIZE = core.SIZE, faceMap = core.faceMap;
  // "STRAIGHT LINES" checkbox - a real audit finding: this option
  // round-tripped through effectOptions.tron.straight but tronDecide()
  // never read it, exactly replicating an upstream browser-app bug (see
  // this file's own module comment above). First fix just weakened the
  // straight-ahead bonus, but a follow-up report ("if unchecked, the
  // bikes can curve as they race" - i.e. it wasn't visibly happening)
  // confirmed that alone isn't enough: the dominant scoring term below
  // (s.space, flood-fill territory) already favours going straight in
  // open space on its own, independent of straightBonus's weight, so
  // shrinking that one term barely changed anything observable. Bikes
  // move on a fixed grid (no true diagonal movement is possible), so
  // "curving" here means turning noticeably more often - straightOn=false
  // now ALSO adds an explicit turnBias favouring the two turning
  // candidates over going straight (applied per-candidate below), strong
  // enough to compete with the space-preservation instinct instead of
  // just slightly discounting one input to it.
  const straightOn = !!(core.effectOptions?.tron?.straight ?? 1);
  const straightWeight = straightOn ? 0.8 : 0.15;
  const { face: f, u, v, du, dv } = bk;
  const ldu = -dv, ldv = du;
  const rdu = dv, rdv = -du;

  const candidates = [
    { du, dv, straight: true, turnDir: 0 },
    { du: ldu, dv: ldv, straight: false, turnDir: -1 },
    { du: rdu, dv: rdv, straight: false, turnDir: 1 },
  ];

  const scored = [];
  for (const m of candidates) {
    const [nf, nu, nv] = tronMove(core, f, u, v, m.du, m.dv);
    const idx = faceMap[nf][nv * SIZE + nu];
    if (idx < 0 || tronTrail[idx] > 0) continue;
    const space = tronFloodFill(core, f, u, v, m.du, m.dv);

    let runway = 0, rf = nf, ru = nu, rv = nv;
    for (let step = 0; step < SIZE; step++) {
      const sm = tronMoveFast(core, rf, ru, rv, m.du, m.dv);
      const si = faceMap[sm.face][sm.v * SIZE + sm.u];
      if (si < 0 || tronTrail[si] > 0) break;
      rf = sm.face; ru = sm.u; rv = sm.v; runway++;
    }

    let escapeRoutes = 0;
    {
      const em1 = tronMoveFast(core, nf, nu, nv, m.du, m.dv);
      const ei1 = faceMap[em1.face][em1.v * SIZE + em1.u];
      if (ei1 >= 0 && tronTrail[ei1] === 0) escapeRoutes++;
      const em2 = tronMoveFast(core, nf, nu, nv, -m.dv, m.du);
      const ei2 = faceMap[em2.face][em2.v * SIZE + em2.u];
      if (ei2 >= 0 && tronTrail[ei2] === 0) escapeRoutes++;
      const em3 = tronMoveFast(core, nf, nu, nv, m.dv, -m.du);
      const ei3 = faceMap[em3.face][em3.v * SIZE + em3.u];
      if (ei3 >= 0 && tronTrail[ei3] === 0) escapeRoutes++;
    }

    let futureOptions = 0;
    let wf = nf, wu = nu, wv = nv, wd = m.du, wdv2 = m.dv;
    for (let step = 0; step < 4; step++) {
      const sm = tronMoveFast(core, wf, wu, wv, wd, wdv2);
      const si = faceMap[sm.face][sm.v * SIZE + sm.u];
      if (si < 0 || tronTrail[si] > 0) break;
      wf = sm.face; wu = sm.u; wv = sm.v;
      const fm1 = tronMoveFast(core, wf, wu, wv, -wdv2, wd);
      const fi1 = faceMap[fm1.face][fm1.v * SIZE + fm1.u];
      if (fi1 >= 0 && tronTrail[fi1] === 0) futureOptions++;
      const fm2 = tronMoveFast(core, wf, wu, wv, wdv2, -wd);
      const fi2 = faceMap[fm2.face][fm2.v * SIZE + fm2.u];
      if (fi2 >= 0 && tronTrail[fi2] === 0) futureOptions++;
    }

    const centerDist = Math.abs(nu - SIZE / 2) + Math.abs(nv - SIZE / 2);

    scored.push({ m, space, nf, nu, nv, escapeRoutes, runway, futureOptions, centerDist });
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

  let avoidanceMap = new Map();
  let cutBonus = new Map();
  for (const other of tronBikes) {
    if (!other.alive || other === bk) continue;
    for (const s of scored) {
      const dx = s.nu - other.u, dy = s.nv - other.v;
      const dist = Math.sqrt(dx * dx + dy * dy) + (s.nf === other.face ? 0 : SIZE * 0.5);
      if (dist < SIZE * 0.4 && s.space > mySpace * 0.7) {
        cutBonus.set(s, (cutBonus.get(s) || 0) + (SIZE * 0.4 - dist) * 0.6);
      }
      if (dist < SIZE * 0.25 && s.space < mySpace * 0.5) {
        avoidanceMap.set(s, (avoidanceMap.get(s) || 0) + (SIZE * 0.25 - dist) * 1.5);
      }
    }
  }

  const borderMode = is2d && borderWalls;
  let best = null, bestScore = -Infinity;
  for (const s of scored) {
    const escapePenalty = s.escapeRoutes === 0 ? -SIZE * 10 : (s.escapeRoutes === 1 ? -SIZE * 2 : 0);
    const openBonus = s.space >= maxSpace * 0.95 ? SIZE * 0.5 : 0;
    const straightBonus = s.m.straight ? (Math.min(s.runway, SIZE / 4) * straightWeight) : 0;
    // Explicit push toward turning (not just a weaker pull toward
    // straight) - see this function's module comment above for why this
    // is needed on top of straightWeight. A flat SIZE*0.5, not
    // runway-scaled like straightBonus - deliberately sized to match
    // openBonus (also SIZE*0.5), the strongest of the "soft preference"
    // terms here, so it reliably wins ties in open space instead of being
    // just another minor input the much-larger s.space*1.2 term (up to
    // ~SIZE*SIZE) swamps. escapePenalty/runwayPenalty (hundreds of units)
    // still dominate this when a direction is genuinely dangerous, so
    // this can't force a bike into an obviously bad turn, only break ties
    // between safe ones toward turning.
    const turnBias = (!straightOn && !s.m.straight) ? SIZE * 0.5 : 0;
    const runwayPenalty = s.runway < 3 ? -SIZE * 3 : (s.runway < 6 ? -SIZE : 0);
    const futureBonus = s.futureOptions * SIZE * 0.15;
    const centerWeight = borderMode ? 0.02 : 0.1;
    const centerBonus = (SIZE - s.centerDist) * centerWeight;
    const edgeAttract = borderMode
      ? (Math.min(s.nu, SIZE - 1 - s.nu, s.nv, SIZE - 1 - s.nv) < 4 ? SIZE * 0.3 * Math.random() : 0)
      : 0;
    const spiralPenalty = (spiralPenaltyDir !== 0 && s.m.turnDir === spiralPenaltyDir) ? -SIZE * 4 : 0;
    const cut = cutBonus.get(s) || 0;
    const avoid = avoidanceMap.get(s) || 0;
    const score = s.space * 1.2 + straightBonus + turnBias + cut + openBonus + escapePenalty
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
  const SIZE = core.SIZE, M = SIZE - 1;
  const SPACING = TOTAL_SPAN / (SIZE - 1), HALF = TOTAL_SPAN * 0.5;
  const [wx, wy, wz] = (() => {
    switch (bk.face) {
      case 0: return [bk.u, bk.v, M];
      case 1: return [bk.u, bk.v, 0];
      case 2: return [M, bk.v, bk.u];
      case 3: return [0, bk.v, bk.u];
      case 4: return [bk.u, M, bk.v];
      default: return [bk.u, 0, bk.v];
    }
  })();
  for (let i = 0; i < 55; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = (2 + Math.random() * 8) * (SIZE / 64);
    tronExplosions.push({
      x: wx * SPACING - HALF, y: wy * SPACING - HALF, z: wz * SPACING - HALF,
      vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.sin(ph) * Math.sin(th) * sp, vz: Math.cos(ph) * sp,
      life: 1, hue: bk.hue,
    });
  }
}

function initTron(core, is2d, borderWalls) {
  const SIZE = core.SIZE, N = core.N, faceMap = core.faceMap;
  const boxW = 4, boxH = 4;
  tronMaxFill = boxW * boxH;
  if (!tronDeaths || tronDeaths.length !== tronBikeCount) {
    tronDeaths = new Array(tronBikeCount).fill(0);
    tronScoreFill = new Array(tronBikeCount).fill(tronMaxFill);
  }
  tronTrail = new Uint8Array(N);
  tronVisited = new Uint8Array(N);
  tronBFSQueue = new Int16Array(N * 3 * 3);
  // Mark scoreboard zone as wall on face 0
  const sz = tronScoreZone(core);
  for (let v = Math.max(0, sz.v0); v <= Math.min(SIZE - 1, sz.v1); v++) {
    for (let u = Math.max(0, sz.u0); u <= Math.min(SIZE - 1, sz.u1); u++) {
      const lv = SIZE - 1 - v;
      const idx = faceMap[0][lv * SIZE + u];
      if (idx >= 0) tronTrail[idx] = 255;
    }
  }
  // In 2D border mode, mark screen edges as walls
  if (is2d && borderWalls) {
    const f = 0;
    for (let i = 0; i < SIZE; i++) {
      for (const [eu, ev] of [[i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i]]) {
        const lv = SIZE - 1 - ev;
        const idx = faceMap[f][lv * SIZE + eu];
        if (idx >= 0) tronTrail[idx] = 255;
      }
    }
  }
  tronBikes = []; tronExplosions = []; tronWinner = -1; tronState = 'run'; tronStateT = 0;
  const HDIR = [[1, 0], [-1, 0]];
  const VDIR = [[0, 1], [0, -1]];
  for (let k = 0; k < tronBikeCount; k++) {
    // Skip eliminated bikes (score already 0)
    const eliminated = (tronScoreFill && tronScoreFill[k] <= 0);
    const sf = is2d ? 0 : k % 6;
    const margin = Math.max(4, SIZE >> 3);
    let su, sv, tries = 0;
    do {
      su = margin + Math.floor(Math.random() * (SIZE - margin * 2));
      sv = margin + Math.floor(Math.random() * (SIZE - margin * 2));
      tries++;
    } while (sf === 0 && su >= sz.u0 && sv <= sz.v1 && tries < 50);
    let dir;
    if (k % 2 === 0) dir = HDIR[Math.floor(Math.random() * 2)];
    else dir = VDIR[Math.floor(Math.random() * 2)];
    tronBikes.push({
      face: sf, u: su, v: sv, du: dir[0], dv: dir[1],
      hue: TRON_HUES[k % TRON_HUES.length], alive: !eliminated, acc: 0,
      speed: (SIZE * 0.7 + SIZE * 0.3 * (k / tronBikeCount)),
    });
  }
}

function tronRenderWinsText(core, face, hue) {
  const SIZE = core.SIZE, faceMap = core.faceMap, colBuf = core.colBuf;
  const fg = hsl(hue, 1, 0.95);
  // "WIN" in 5x7 pixel font
  const W = [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1], [1, 0, 1, 0, 1], [1, 1, 0, 1, 1], [1, 0, 0, 0, 1]];
  const I = [[1, 1, 1], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [1, 1, 1]];
  const Nl = [[1, 0, 0, 1], [1, 1, 0, 1], [1, 1, 0, 1], [1, 0, 1, 1], [1, 0, 1, 1], [1, 0, 0, 1], [1, 0, 0, 1]];
  const letters = [W, I, Nl];
  const charWidths = [5, 3, 4];
  const charH = 7;
  const totalCharW = charWidths.reduce((a, b) => a + b, 0) + 2;
  const scale2 = Math.max(1, Math.floor(SIZE / totalCharW));
  const totalW = totalCharW * scale2;
  const offV = Math.floor((SIZE - charH * scale2) / 2);
  for (let f = 0; f < 6; f++) {
    const offU = Math.floor((SIZE - totalW) / 2);
    let curU = offU;
    for (let li = 0; li < letters.length; li++) {
      const letter = letters[li];
      const cw = charWidths[li];
      for (let row = 0; row < charH; row++) {
        for (let col = 0; col < cw; col++) {
          if (!letter[row][col]) continue;
          for (let sy = 0; sy < scale2; sy++) {
            for (let sx = 0; sx < scale2; sx++) {
              const u = curU + col * scale2 + sx, v = offV + row * scale2 + sy;
              if (u >= SIZE || v >= SIZE || u < 0 || v < 0) continue;
              const lv = SIZE - 1 - v;
              const idx = faceMap[f][lv * SIZE + u];
              if (idx >= 0) { colBuf[idx * 3] = fg[0]; colBuf[idx * 3 + 1] = fg[1]; colBuf[idx * 3 + 2] = fg[2]; }
            }
          }
        }
      }
      curU += (cw + 1) * scale2;
    }
  }
}

function tronRenderScoreOnLEDs(core, dt) {
  if (!tronDeaths || !tronBikes.length || !tronScoreFill) return;
  const SIZE = core.SIZE, N = core.N, faceMap = core.faceMap, colBuf = core.colBuf;

  // Each crash removes exactly 1 pixel
  for (let i = 0; i < tronBikes.length; i++) {
    const target = Math.max(0, tronMaxFill - tronDeaths[i]);
    if (tronScoreFill[i] > target) tronScoreFill[i] = Math.max(target, tronScoreFill[i] - 1);
  }

  // Check how many bikes are still in the game (have pixels left)
  const inGame = [];
  for (let i = 0; i < tronBikes.length; i++) {
    if (tronScoreFill[i] > 0) inGame.push(i);
  }

  // If only 1 bike left with pixels, that bike wins
  if (inGame.length <= 1 && tronWinFlash <= 0) {
    tronWinBike = inGame.length === 1 ? inGame[0] : 0;
    tronWinFlash = 5.0;
  }

  // Draw filled score boxes on face 0, sorted by most pixels (winner at top)
  const face = 0;
  const boxW = 4, boxH = 4, gap = 1;
  const startU = SIZE - boxW - 2;
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
        if (v >= SIZE || u >= SIZE) continue;
        const lv = SIZE - 1 - v;
        const idx = faceMap[face][lv * SIZE + u];
        if (idx >= 0) { colBuf[idx * 3] = rgb[0]; colBuf[idx * 3 + 1] = rgb[1]; colBuf[idx * 3 + 2] = rgb[2]; }
        drawn++;
      }
    }
  }

  // Win flash mode
  if (tronWinFlash > 0) {
    tronWinFlash -= dt;
    const wh = TRON_HUES[tronWinBike % TRON_HUES.length];
    const flash = 0.3 + 0.7 * Math.abs(Math.sin(tronWinFlash * 4));
    const rgb = hsl(wh, 1, flash * 0.6);
    for (let i = 0; i < N; i++) {
      colBuf[i * 3] = rgb[0]; colBuf[i * 3 + 1] = rgb[1]; colBuf[i * 3 + 2] = rgb[2];
    }
    // Pulse winner's trail brighter
    const pulse = 0.5 + 0.5 * Math.sin(tronWinFlash * 8);
    const trailRgb = hsl(wh, 1, 0.3 + pulse * 0.6);
    for (let i = 0; i < N; i++) {
      if (tronTrail[i] === tronWinBike + 1) {
        colBuf[i * 3] = trailRgb[0]; colBuf[i * 3 + 1] = trailRgb[1]; colBuf[i * 3 + 2] = trailRgb[2];
      }
    }
    tronRenderWinsText(core, 0, wh);
    if (tronWinFlash <= 0) {
      tronDeaths.fill(0);
      tronScoreFill.fill(tronMaxFill);
      tronWinBike = -1;
      initTron(core, core.panelMode === '2d', !!(core.effectOptions?.tron?.borderWalls));
    }
    return;
  }
}

function effectTron(core, dt) {
  const { N, colBuf } = core;
  const opts = core.effectOptions?.tron || {};
  const is2d = core.panelMode === '2d';
  const bikesOpt = Math.max(2, Math.min(8, Math.round(opts.bikes ?? 4)));
  const speedOpt = opts.speed ?? 1;
  const borderWalls = !!opts.borderWalls;
  const newGameToken = opts.newGame;

  const needsRebuild = !tronTrail || tronTrail.length !== N
    || bikesOpt !== lastBikeCount || borderWalls !== lastBorderWalls
    || (newGameToken !== undefined && newGameToken !== lastNewGameToken);
  if (needsRebuild) {
    tronBikeCount = bikesOpt;
    lastBikeCount = bikesOpt;
    lastBorderWalls = borderWalls;
    lastNewGameToken = newGameToken;
    initTron(core, is2d, borderWalls);
  }

  core.t += dt; tronStateT += dt;
  const g = TRON_GRIDS[tronGridTheme];
  const SIZE = core.SIZE, faceMap = core.faceMap, gridX = core.gridX, gridY = core.gridY, gridZ = core.gridZ;

  // base: tron grid background
  for (let i = 0; i < N; i++) {
    const x = gridX[i], y = gridY[i], z = gridZ[i];
    const onGrid = x % 4 === 0 || y % 4 === 0 || z % 4 === 0;
    core.setLED(i, onGrid ? g[0] * 1.5 : g[0], onGrid ? g[1] * 1.5 : g[1], onGrid ? g[2] * 1.5 : g[2]);
  }

  // trail - solid 1-pixel lines per bike
  for (let i = 0; i < N; i++) {
    if (tronTrail[i] > 0 && tronTrail[i] !== 255) {
      const bk = tronBikes[tronTrail[i] - 1], h = bk.hue;
      const [r, gg, b] = hsl(h, 1, 0.45);
      core.setLED(i, r, gg, b);
    }
  }

  if (tronState === 'run') {
    // update bikes
    for (const bk of tronBikes) {
      if (!bk.alive) continue;
      // dt (passed in from app.js) is already pre-scaled by state.speed -
      // multiplying by core.speedMult here as well double-applies the same
      // speed setting (squaring it), unlike the browser original where dt
      // is unscaled and speedMult is applied exactly once inside tron's own
      // calc. At higher speed settings this caused many extra bike ticks
      // per frame, each one running tronDecide()'s flood-fills - the more
      // bikes, the more expensive each extra tick, compounding into the
      // "still very slow with many bikes" report.
      bk.acc += dt * bk.speed * speedOpt;
      while (bk.acc >= 1) {
        bk.acc -= 1;
        const newDir = tronDecide(core, bk, is2d, borderWalls);
        if (!newDir) { tronCrash(core, bk); break; }
        const [ndu, ndv] = newDir;
        const moved = tronMove(core, bk.face, bk.u, bk.v, ndu, ndv);
        if (!moved) { tronCrash(core, bk); break; }
        const [nf, nu, nv, fdu, fdv] = moved;
        const idx = faceMap[nf][nv * SIZE + nu];
        if (idx < 0 || tronTrail[idx] > 0) { tronCrash(core, bk); break; }
        bk.du = fdu; bk.dv = fdv;
        const bikeIdx = tronBikes.indexOf(bk) + 1;
        const oldIdx = faceMap[bk.face][bk.v * SIZE + bk.u];
        if (oldIdx >= 0) tronTrail[oldIdx] = bikeIdx;
        bk.face = nf; bk.u = nu; bk.v = nv;
        // Mark new position immediately to prevent other bikes entering this cell
        if (idx >= 0) tronTrail[idx] = bikeIdx;
      }
    }

    // Head-on collision: if two alive bikes share the same cell, both crash
    for (let i = 0; i < tronBikes.length; i++) {
      if (!tronBikes[i].alive) continue;
      for (let j = i + 1; j < tronBikes.length; j++) {
        if (!tronBikes[j].alive) continue;
        if (tronBikes[i].face === tronBikes[j].face && tronBikes[i].u === tronBikes[j].u && tronBikes[i].v === tronBikes[j].v) {
          tronCrash(core, tronBikes[i]);
          tronCrash(core, tronBikes[j]);
        }
      }
    }

    // draw bike heads
    for (const bk of tronBikes) {
      if (!bk.alive) continue;
      const idx = faceMap[bk.face][bk.v * SIZE + bk.u];
      if (idx >= 0) { const [r, gg, b] = hsl(bk.hue, 0.3, 0.95); core.setLED(idx, r, gg, b); }
    }

    // check round end - all alive bikes crashed
    const nowAlive = tronBikes.filter((b) => b.alive);
    if (nowAlive.length <= 1) {
      tronRoundWinner = nowAlive.length === 1 ? tronBikes.indexOf(nowAlive[0]) : -1;
      const nonElim = [];
      for (let i = 0; i < tronBikeCount; i++) {
        if (tronScoreFill[i] > 0) nonElim.push(i);
      }
      if (nonElim.length > 1) {
        tronState = 'restart'; tronStateT = 0;
      } else {
        tronWinner = nonElim.length === 1 ? nonElim[0] : 0;
        tronState = 'win'; tronStateT = 0;
      }
    }
  } else if (tronState === 'restart') {
    // Flash round winner's trail with RGB cycling
    if (tronRoundWinner >= 0) {
      const hue = (tronStateT * 2) % 1;
      const rgb = hsl(hue, 1, 0.7);
      for (let i = 0; i < N; i++) {
        if (tronTrail[i] === tronRoundWinner + 1) {
          colBuf[i * 3] = rgb[0]; colBuf[i * 3 + 1] = rgb[1]; colBuf[i * 3 + 2] = rgb[2];
        }
      }
    }
    if (tronStateT > 1.5) initTron(core, is2d, borderWalls);
  } else {
    // winner celebration - pulse whole cube in winner color, then restart
    if (tronWinner >= 0) {
      const wh = TRON_HUES[tronWinner];
      const pulse = 0.5 + 0.5 * Math.sin(tronStateT * 8);
      for (let i = 0; i < N; i++) { if (tronTrail[i] === tronWinner + 1) { const [r, gg, b] = hsl(wh, 1, 0.3 + pulse * 0.5); core.setLED(i, r, gg, b); } }
    }
    if (tronWinFlash <= 0 && tronStateT > 5) initTron(core, is2d, borderWalls);
  }

  // explosions (only during normal play, not during win flash)
  if (tronWinFlash <= 0) {
    const SPACING = TOTAL_SPAN / (SIZE - 1), HALF = TOTAL_SPAN * 0.5;
    for (let k = tronExplosions.length - 1; k >= 0; k--) {
      const p = tronExplosions[k];
      p.x += p.vx * dt * 8; p.y += p.vy * dt * 8; p.z += p.vz * dt * 8; p.life -= dt * 1.8;
      if (p.life <= 0) { tronExplosions.splice(k, 1); continue; }
      for (let i = 0; i < N; i++) {
        const dx = gridX[i] * SPACING - HALF - p.x, dy = gridY[i] * SPACING - HALF - p.y, dz = gridZ[i] * SPACING - HALF - p.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < SPACING * 4) {
          const bri = Math.pow(1 - d / (SPACING * 4), 1.2) * p.life;
          const [r, gg, bv] = hsl(p.hue, 1, bri);
          if (r > colBuf[i * 3]) colBuf[i * 3] = r;
          if (gg > colBuf[i * 3 + 1]) colBuf[i * 3 + 1] = gg;
          if (bv > colBuf[i * 3 + 2]) colBuf[i * 3 + 2] = bv;
        }
      }
    }
  }
  // Red border walls in 2D mode
  if (is2d && borderWalls) {
    const f = 0;
    for (let i = 0; i < SIZE; i++) {
      for (const [eu, ev] of [[i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i]]) {
        const lv = SIZE - 1 - ev;
        const idx = faceMap[f][lv * SIZE + eu];
        if (idx >= 0) { colBuf[idx * 3] = 0.9; colBuf[idx * 3 + 1] = 0.05; colBuf[idx * 3 + 2] = 0.05; }
      }
    }
    // Red outline around scoreboard zone
    const sz = tronScoreZone(core);
    for (let v = Math.max(0, sz.v0); v <= Math.min(SIZE - 1, sz.v1); v++) {
      for (let u = Math.max(0, sz.u0); u <= Math.min(SIZE - 1, sz.u1); u++) {
        const isEdge = (v === sz.v0 || v === sz.v1 || u === sz.u0 || u === sz.u1);
        if (!isEdge) continue;
        const lv = SIZE - 1 - v;
        const idx = faceMap[f][lv * SIZE + u];
        if (idx >= 0) { colBuf[idx * 3] = 0.9; colBuf[idx * 3 + 1] = 0.05; colBuf[idx * 3 + 2] = 0.05; }
      }
    }
  }
  tronRenderScoreOnLEDs(core, dt);
}

module.exports = effectTron;
