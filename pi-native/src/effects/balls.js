// Ported verbatim (math unchanged) from effects-physics.js's
// resetBalls()/ballCrossCheck()/ballPixel()/effectBouncingBalls() -
// "Bouncing Balls". Balls live in face-local (u,v) coords and cross faces
// via ballCrossCheck()'s own geometric CW-strip/edge tables (BALL_CW/
// BALL_CWI) - this is a distinct, hand-rolled cross-face-wrap scheme from
// _shared.js's tronMove()/cubePx(), not a reuse of either, verified by
// reading both: tronMove operates on a single (face,u,v,du,dv) step and is
// built for Tron's grid-walk turning logic, while ballCrossCheck mutates a
// ball's face/u/v/du/dv in place to handle sub-pixel float positions and
// the different edge-transfer geometry a bouncing ball needs (velocity
// reflection across a shared cube edge, not just relabelling which face a
// discrete step landed on). Kept as its own local implementation, matching
// the source file's clear intent (comment: "Velocity is transformed
// between faces by projecting world-space velocity onto the new face's
// u/v axes - geometrically correct wrapping").
//
// panel2dMode -> core.panelMode==='2d' (see maze.js's module comment for
// the same threading convention). gyroEnabled/getLocalGravity's gyro
// branch has no equivalent here (headless Pi, no orbit-drag preview) - see
// _shared.js's getLocalGravity() module comment; effectively this always
// takes the "!gyroEnabled" rotChange-nudge path with a static gravity
// vector, so rotChange is always 0 and the nudge branch never fires - balls
// simply orbit/bounce under their own initial velocity plus face-to-face
// wrap, same behaviour as an idle (non-gyro, non-dragged) browser cube.
// ballCrossFaces -> core.effectOptions.balls.crossFaces (the "Cross Faces"/
// "Own Face" mode buttons), default true, matching the browser's
// `ballCrossFaces=true` module default. ballsPerFace ->
// core.effectOptions.balls.count (the "Balls per face" slider), default 3.
const { getLocalGravity } = require('./_shared');

let balls = [], ballFlashes = [];
let ballPrevGx = 0, ballPrevGy = -1, ballPrevGz = 0;
let _resetKey = null; // tracks (panelMode, SIZE, crossFaces, count) so option changes trigger a reset

const BALL_CW = [0, 2, 1, 3];
const BALL_CWI = { 0: 0, 1: 2, 2: 1, 3: 3 };

function ballCrossCheck(b, S) {
  const M = S - 1;

  if (b.face <= 3 && (b.u < 0 || b.u >= S)) {
    const su = BALL_CWI[b.face] * S + b.u;
    const total = S * 4;
    const w = ((su % total) + total) % total;
    const nqi = (w / S) | 0;
    b.face = BALL_CW[nqi];
    b.u = w - nqi * S;
  }

  if (b.face <= 3 && b.v >= S) {
    const ov = b.v - S, ou = b.u, od = b.du, od2 = b.dv;
    switch (b.face) {
      case 0: b.u = ou; b.v = M - ov; b.du = od; b.dv = -od2; break;
      case 1: b.u = M - ou; b.v = ov; b.du = -od; b.dv = od2; break;
      case 2: b.u = M - ov; b.v = M - ou; b.du = -od2; b.dv = -od; break;
      case 3: b.u = ov; b.v = ou; b.du = od2; b.dv = od; break;
    }
    b.face = 4;
  } else if (b.face <= 3 && b.v < 0) {
    const ov = -b.v, ou = b.u, od = b.du, od2 = b.dv;
    switch (b.face) {
      case 0: b.u = ou; b.v = M - ov; b.du = od; b.dv = od2; break;
      case 1: b.u = M - ou; b.v = ov; b.du = -od; b.dv = -od2; break;
      case 2: b.u = M - ov; b.v = M - ou; b.du = od2; b.dv = -od; break;
      case 3: b.u = ov; b.v = ou; b.du = -od2; b.dv = od; break;
    }
    b.face = 5;
  }

  if (b.face === 4) {
    const ou = b.u, ov2 = b.v, od = b.du, od2 = b.dv;
    if (b.u < 0) {
      const ov = -ou;
      b.face = 3; b.u = ov2; b.v = M - ov; b.du = od2; b.dv = od;
    } else if (b.u >= S) {
      const ov = ou - S;
      b.face = 2; b.u = M - ov2; b.v = M - ov; b.du = -od2; b.dv = -od;
    } else if (b.v < 0) {
      const ov = -ov2;
      b.face = 1; b.u = M - ou; b.v = M - ov; b.du = -od; b.dv = od2;
    } else if (b.v >= S) {
      const ov = ov2 - S;
      b.face = 0; b.u = ou; b.v = M - ov; b.du = od; b.dv = -od2;
    }
  }

  if (b.face === 5) {
    const ou = b.u, ov2 = b.v, od = b.du, od2 = b.dv;
    if (b.u < 0) {
      const ov = -ou;
      b.face = 3; b.u = ov2; b.v = ov; b.du = od2; b.dv = -od;
    } else if (b.u >= S) {
      const ov = ou - S;
      b.face = 2; b.u = M - ov2; b.v = ov; b.du = -od2; b.dv = od;
    } else if (b.v < 0) {
      const ov = -ov2;
      b.face = 1; b.u = M - ou; b.v = ov; b.du = -od; b.dv = -od2;
    } else if (b.v >= S) {
      const ov = ov2 - S;
      b.face = 0; b.u = ou; b.v = ov; b.du = od; b.dv = od2;
    }
  }
}

function ballPixel(core, face, pu, pv, S) {
  if (pu >= 0 && pu < S && pv >= 0 && pv < S) return core.faceMap[face][pv * S + pu];
  const tmp = { face, u: pu, v: pv, du: 0, dv: 0 };
  ballCrossCheck(tmp, S);
  const ru = Math.round(tmp.u), rv = Math.round(tmp.v);
  if (ru >= 0 && ru < S && rv >= 0 && rv < S) return core.faceMap[tmp.face][rv * S + ru];
  return -1;
}

function resetBalls(core) {
  const S = core.SIZE, panel2dMode = core.panelMode === '2d';
  const ballsPerFace = core.effectOptions?.balls?.count ?? 3;
  balls = []; ballFlashes = [];
  const COLORS = [
    [1, 0.15, 0.15], [0.15, 1, 0.15], [0.2, 0.4, 1], [1, 1, 0.1],
    [1, 0.4, 0], [0.9, 0.15, 0.9], [0, 0.9, 0.9], [1, 0.6, 0.7],
    [0.5, 1, 0.3], [1, 0.5, 0.1], [0.3, 0.5, 1], [0.8, 0.2, 0.5],
  ];
  let ci = 0;
  const faceList = panel2dMode ? [0] : [0, 1, 2, 3, 4, 5];
  for (const f of faceList) {
    const count = panel2dMode ? ballsPerFace * 2 : ballsPerFace;
    for (let k = 0; k < count; k++) {
      const R = 3 + Math.floor(Math.random() * 3);
      const ang = Math.random() * Math.PI * 2;
      const spd = S * (0.3 + Math.random() * 0.4);
      const c = COLORS[ci % COLORS.length]; ci++;
      balls.push({
        face: f,
        u: R + 1 + Math.random() * (S - 2 * R - 2),
        v: R + 1 + Math.random() * (S - 2 * R - 2),
        du: Math.cos(ang) * spd,
        dv: Math.sin(ang) * spd,
        r: R,
        cr: c[0], cg: c[1], cb: c[2],
      });
    }
  }
}

function effectBouncingBalls(core, dt) {
  core.t += dt;
  const { N, SIZE: S, faceMap, colBuf } = core;
  const panel2dMode = core.panelMode === '2d';
  const ballCrossFaces = core.effectOptions?.balls?.crossFaces ?? true;
  const ballsPerFace = core.effectOptions?.balls?.count ?? 3;

  const resetKey = `${panel2dMode}|${S}|${ballCrossFaces}|${ballsPerFace}`;
  if (!balls.length || _resetKey !== resetKey) { _resetKey = resetKey; resetBalls(core); }

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  const S1 = S - 1;

  // No gyro/orbit-drag preview here (see _shared.js's getLocalGravity()
  // module comment) - rawG is always the fixed down vector, so rotChange
  // stays 0 and the nudge branch below never fires. Kept structurally
  // identical to the browser so a future orientation source only needs to
  // plug into getLocalGravity(), not this function.
  const rawG = getLocalGravity();
  const gLen = Math.sqrt(rawG.x * rawG.x + rawG.y * rawG.y + rawG.z * rawG.z) || 1;
  const gx = rawG.x / gLen, gy = rawG.y / gLen, gz = rawG.z / gLen;
  const dgx = gx - ballPrevGx, dgy = gy - ballPrevGy, dgz = gz - ballPrevGz;
  ballPrevGx = gx; ballPrevGy = gy; ballPrevGz = gz;
  const rotChange = Math.sqrt(dgx * dgx + dgy * dgy + dgz * dgz);

  const FU = [[1, 0, 0], [1, 0, 0], [0, 0, 1], [0, 0, 1], [1, 0, 0], [1, 0, 0]];
  const FV = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1], [0, 0, 1]];

  for (const b of balls) {
    const fu = FU[b.face], fv = FV[b.face];
    const gu = gx * fu[0] + gy * fu[1] + gz * fu[2];
    const gv = gx * fv[0] + gy * fv[1] + gz * fv[2];
    if (rotChange > 0.005) {
      const nudge = S * 8 * rotChange;
      b.du += gu * nudge;
      b.dv += gv * nudge;
    }

    b.u += b.du * dt;
    b.v += b.dv * dt;

    if (!panel2dMode && ballCrossFaces) {
      ballCrossCheck(b, S);
    }

    const R = b.r;
    if (panel2dMode || !ballCrossFaces) {
      if (b.u < R) { b.u = R; b.du = Math.abs(b.du); }
      if (b.u > S1 - R) { b.u = S1 - R; b.du = -Math.abs(b.du); }
      if (b.v < R) { b.v = R; b.dv = Math.abs(b.dv); }
      if (b.v > S1 - R) { b.v = S1 - R; b.dv = -Math.abs(b.dv); }
    }

    const cu = Math.round(b.u), cv = Math.round(b.v);
    const R2 = R * R;
    const cross = !panel2dMode && ballCrossFaces;
    for (let dv = -R; dv <= R; dv++) {
      for (let du = -R; du <= R; du++) {
        const d2 = du * du + dv * dv;
        if (d2 > R2) continue;
        const pu = cu + du, pv = cv + dv;
        const idx = cross ? ballPixel(core, b.face, pu, pv, S)
          : (pu < 0 || pu >= S || pv < 0 || pv >= S) ? -1 : faceMap[b.face][pv * S + pu];
        if (idx < 0) continue;
        const dist = Math.sqrt(d2) / R;
        const shade = 1.0 - dist * 0.55;
        const edge2 = dist > 0.75 ? 0.5 : 1.0;
        const br = b.cr * shade * edge2, bg = b.cg * shade * edge2, bb = b.cb * shade * edge2;
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], br);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], bg);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], bb);
      }
    }
  }

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b2 = balls[j];
      if (a.face !== b2.face) continue;
      const dx = b2.u - a.u, dy = b2.v - a.v;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = a.r + b2.r;
      if (dist < minD && dist > 0.1) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minD - dist) * 0.5;
        a.u -= nx * overlap; a.v -= ny * overlap;
        b2.u += nx * overlap; b2.v += ny * overlap;
        const relV = (b2.du - a.du) * nx + (b2.dv - a.dv) * ny;
        if (relV < 0) {
          a.du += relV * nx * 0.5; a.dv += relV * ny * 0.5;
          b2.du -= relV * nx * 0.5; b2.dv -= relV * ny * 0.5;
        }
      }
    }
  }
}

module.exports = effectBouncingBalls;
