// Wall-mode counterpart to balls.js ("Bouncing Balls").
//
// balls.js's cube version keeps each ball in face-local (u,v) coords and
// hands off between faces via ballCrossCheck()'s hand-rolled CW-strip/edge
// tables whenever a ball's position crosses a face boundary - that's the
// whole reason the cube file is 240+ lines for what is, underneath, just
// "integrate position, bounce off a boundary". A flat wall has no faces to
// cross, so all of ballCrossCheck/ballPixel/BALL_CW/BALL_CWI (and the
// face-axis projection tables FU/FV they exist to support) are dropped
// entirely - balls just live in flat (x,y) wallW x wallH space and reflect
// off the 4 canvas edges, exactly like the cube version's own
// `panel2dMode || !ballCrossFaces` fallback branch already does in
// face-local coords (this file is effectively that branch, generalised
// from one SxS face to the whole stitched wallW x wallH canvas).
//
// One more simplification falls out of reading balls.js closely: the
// per-frame "nudge" that would apply continuous gravity acceleration only
// fires when `rotChange > 0.005`, i.e. only when the gravity vector itself
// changed since last frame (a device tilting, or the browser's mouse-drag
// preview). getLocalGravity() here always returns the same fixed
// {x:0,y:-1,z:0} (see _shared.js's module comment), so rotChange is always
// 0 and that branch never fires on the cube either - balls already behave
// as frictionless billiards coasting on their initial velocity plus
// wall/ball collisions, never accelerating downward. So this port doesn't
// need to invent a gravity-accel term to match: it's just as absent here as
// it is on an idle, un-rotated cube.
//
// core.effectOptions.balls.count (ballsPerFace, default 3) is kept as the
// option key. The cube spawns `count` balls per cube face (6 faces) or
// `count*2` on a single face in panel2dMode; a wall is one flat rectangle
// like panel2dMode's single face, but potentially much larger (multiple
// panels), so the ball total is scaled by wall area relative to one
// 64x64 face rather than hardcoded to `count*2`, keeping ball density
// roughly constant regardless of how many panels are placed.
const { getLocalGravity } = require('./_shared');

let wBalls = [];
let _resetKey = null;

const COLORS = [
  [1, 0.15, 0.15], [0.15, 1, 0.15], [0.2, 0.4, 1], [1, 1, 0.1],
  [1, 0.4, 0], [0.9, 0.15, 0.9], [0, 0.9, 0.9], [1, 0.6, 0.7],
  [0.5, 1, 0.3], [1, 0.5, 0.1], [0.3, 0.5, 1], [0.8, 0.2, 0.5],
];

function resetWBalls(core) {
  const { wallW, wallH } = core;
  const ballsPerFace = core.effectOptions?.balls?.count ?? 3;
  const refArea = 64 * 64;
  const total = Math.max(2, Math.round(ballsPerFace * 2 * (wallW * wallH) / refArea));
  const S = Math.min(wallW, wallH); // reference scale for radius/speed, same role SIZE plays on the cube
  wBalls = [];
  let ci = 0;
  for (let k = 0; k < total; k++) {
    const R = 3 + Math.floor(Math.random() * 3);
    const ang = Math.random() * Math.PI * 2;
    const spd = S * (0.3 + Math.random() * 0.4);
    const c = COLORS[ci % COLORS.length]; ci++;
    wBalls.push({
      x: R + 1 + Math.random() * (wallW - 2 * R - 2),
      y: R + 1 + Math.random() * (wallH - 2 * R - 2),
      dx: Math.cos(ang) * spd,
      dy: Math.sin(ang) * spd,
      r: R,
      cr: c[0], cg: c[1], cb: c[2],
    });
  }
}

function effectBouncingBallsWall(core, dt) {
  core.t += dt;
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const ballsPerFace = core.effectOptions?.balls?.count ?? 3;

  const resetKey = `${wallW}|${wallH}|${ballsPerFace}`;
  if (!wBalls.length || _resetKey !== resetKey) { _resetKey = resetKey; resetWBalls(core); }

  wallBuf.fill(0);

  // getLocalGravity() is read (matching the cube file's structure so a
  // future real orientation source only needs to plug in there) but, as
  // explained in the module comment, its rotChange-nudge branch never
  // fires with a fixed gravity vector - balls coast on initial velocity
  // plus collisions only, same as the cube's idle behaviour.
  getLocalGravity();

  const W1 = wallW - 1, H1 = wallH - 1;

  for (const b of wBalls) {
    b.x += b.dx * dt;
    b.y += b.dy * dt;

    const R = b.r;
    if (b.x < R) { b.x = R; b.dx = Math.abs(b.dx); }
    if (b.x > W1 - R) { b.x = W1 - R; b.dx = -Math.abs(b.dx); }
    if (b.y < R) { b.y = R; b.dy = Math.abs(b.dy); }
    if (b.y > H1 - R) { b.y = H1 - R; b.dy = -Math.abs(b.dy); }

    const cx = Math.round(b.x), cy = Math.round(b.y);
    const R2 = R * R;
    for (let dvy = -R; dvy <= R; dvy++) {
      for (let dvx = -R; dvx <= R; dvx++) {
        const d2 = dvx * dvx + dvy * dvy;
        if (d2 > R2) continue;
        const px = cx + dvx, py = cy + dvy;
        if (px < 0 || px >= wallW || py < 0 || py >= wallH) continue;
        const dist = Math.sqrt(d2) / R;
        const shade = 1.0 - dist * 0.55;
        const edge2 = dist > 0.75 ? 0.5 : 1.0;
        const br = b.cr * shade * edge2, bg = b.cg * shade * edge2, bb = b.cb * shade * edge2;
        const o = (py * wallW + px) * 3;
        if (br > wallBuf[o]) wallBuf[o] = br;
        if (bg > wallBuf[o + 1]) wallBuf[o + 1] = bg;
        if (bb > wallBuf[o + 2]) wallBuf[o + 2] = bb;
      }
    }
  }

  for (let i = 0; i < wBalls.length; i++) {
    for (let j = i + 1; j < wBalls.length; j++) {
      const a = wBalls[i], b2 = wBalls[j];
      const dx = b2.x - a.x, dy = b2.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minD = a.r + b2.r;
      if (dist < minD && dist > 0.1) {
        const nx = dx / dist, ny = dy / dist;
        const overlap = (minD - dist) * 0.5;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b2.x += nx * overlap; b2.y += ny * overlap;
        const relV = (b2.dx - a.dx) * nx + (b2.dy - a.dy) * ny;
        if (relV < 0) {
          a.dx += relV * nx * 0.5; a.dy += relV * ny * 0.5;
          b2.dx -= relV * nx * 0.5; b2.dy -= relV * ny * 0.5;
        }
      }
    }
  }
}

module.exports = effectBouncingBallsWall;
