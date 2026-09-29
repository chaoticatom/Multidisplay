// One definition, every display mode: "field" effects (a colour computed
// from a position and the time - plasma, waves, nebula...) used to be
// written twice, x.js looping over the cube's surface LEDs and xWall.js
// looping over the wall's pixel grid, with the maths copied between them.
// defineFieldEffect() owns the generic part (advancing time, the loop for
// whichever mode is running, writing pixels, per-pixel state sizing) and
// the effect supplies only its colour function.
//
// pixel(p, ctx) returns [r, g, b] (0..1) for one LED/pixel:
//   p.x, p.y, p.z - position, each 0..1. On the cube: the LED's 3D surface
//                   coordinates (core.surfX/Y/Z). On a flat wall: x/y
//                   across the whole wall, and z = y by default.
//   p.flat        - true on a wall. Effects whose maths needs a different
//                   stand-in for the missing third axis branch on this
//                   (each wall variant's choice is kept exactly as it was).
//   p.i           - index 0..ctx.count-1, for per-pixel state arrays.
// ctx: { t, dt, count, flat, core } - frame(ctx), if given, runs once per
// frame before the pixels (e.g. to (re)size per-pixel state to ctx.count).
//
// Returns the cube-mode effect function, with the wall-mode one attached
// as .wall - index.js registers both.
'use strict';

function defineFieldEffect({ speed = 1, frame, pixel }) {
  const p = { x: 0, y: 0, z: 0, i: 0, flat: false };
  const ctx = { t: 0, dt: 0, count: 0, flat: false, core: null };

  function cube(core, dt) {
    core.t += dt * speed;
    const { N, surfX, surfY, surfZ } = core;
    Object.assign(ctx, { t: core.t, dt, count: N, flat: false, core });
    p.flat = false;
    if (frame) frame(ctx);
    for (let i = 0; i < N; i++) {
      p.x = surfX[i]; p.y = surfY[i]; p.z = surfZ[i]; p.i = i;
      const c = pixel(p, ctx);
      core.setLED(i, c[0], c[1], c[2]);
    }
  }

  function wall(core, dt) {
    core.t += dt * speed;
    const { wallW, wallH } = core;
    if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
    Object.assign(ctx, { t: core.t, dt, count: wallW * wallH, flat: true, core });
    p.flat = true;
    if (frame) frame(ctx);
    for (let yy = 0; yy < wallH; yy++) {
      const y = yy / wallH;
      for (let xx = 0; xx < wallW; xx++) {
        p.x = xx / wallW; p.y = y; p.z = y; p.i = yy * wallW + xx;
        const c = pixel(p, ctx);
        core.setWallPixel(xx, yy, c[0], c[1], c[2]);
      }
    }
  }

  cube.wall = wall;
  return cube;
}

module.exports = { defineFieldEffect };
