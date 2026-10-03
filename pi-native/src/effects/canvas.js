// defineCanvasEffect(): write an effect once against a plain 2D canvas
// (x right, y DOWN, like the wall) and run it on both display types.
//   render(c, ctx): c = { W, H, set(x,y,r,g,b), add(x,y,r,g,b), get(x,y), clear() };
//   ctx = { t, dt, core }.
// Cube: `panorama: true` gives one canvas 4 faces wide, wrapped round the
// side faces (Front, Right, Back, Left - same order as the weather strip);
// otherwise every side face shows the same SIZE x SIZE canvas. The top and
// bottom faces get `caps(core, face, t)` if given, else stay dark.
// Wall: the canvas is the whole wall.
'use strict';

const SIDE = [0, 2, 1, 3];

function defineCanvasEffect({ panorama = false, speed = 1, render, caps }) {
  const ctx = { t: 0, dt: 0, core: null };
  function cube(core, dt) {
    core.t += dt * speed;
    Object.assign(ctx, { t: core.t, dt, core });
    const S = core.SIZE, W = panorama ? S * 4 : S;
    const toFace = (x, y) => {
      if (x < 0 || y < 0 || y >= S || x >= W) return null;
      return [panorama ? SIDE[(x / S) | 0] : -1, x % S, S - 1 - y]; // faces count v upwards
    };
    const c = {
      W, H: S,
      set(x, y, r, g, b) {
        x = Math.round(x); y = Math.round(y);
        const f = toFace(x, y); if (!f) return;
        if (f[0] >= 0) core.setFaceLED(f[0], f[1], f[2], r, g, b);
        else for (const face of SIDE) core.setFaceLED(face, f[1], f[2], r, g, b);
      },
      add(x, y, r, g, b) {
        x = Math.round(x); y = Math.round(y);
        const f = toFace(x, y); if (!f) return;
        for (const face of f[0] >= 0 ? [f[0]] : SIDE) {
          const i = core.faceMap[face][f[2] * S + f[1]]; if (i < 0) continue;
          const o = i * 3, buf = core.colBuf;
          buf[o] = Math.min(1, buf[o] + r); buf[o + 1] = Math.min(1, buf[o + 1] + g); buf[o + 2] = Math.min(1, buf[o + 2] + b);
        }
      },
      clear() { core.colBuf.fill(0); },
      get(x, y) {
        x = Math.round(x); y = Math.round(y);
        const f = toFace(x, y); if (!f) return null;
        const i = core.faceMap[f[0] >= 0 ? f[0] : SIDE[0]][f[2] * S + f[1]];
        return i < 0 ? null : [core.colBuf[i * 3], core.colBuf[i * 3 + 1], core.colBuf[i * 3 + 2]];
      },
    };
    render(c, ctx);
    if (caps) { caps(core, 4, core.t); caps(core, 5, core.t); }
  }
  cube.wall = function wall(core, dt) {
    core.t += dt * speed;
    if (!core.wallW) return;
    Object.assign(ctx, { t: core.t, dt, core });
    const W = core.wallW, H = core.wallH, buf = core.wallBuf;
    const c = {
      W, H,
      set(x, y, r, g, b) { core.setWallPixel(Math.round(x), Math.round(y), r, g, b); },
      add(x, y, r, g, b) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const o = (y * W + x) * 3;
        core.setWallPixel(x, y, Math.min(1, buf[o] + r), Math.min(1, buf[o + 1] + g), Math.min(1, buf[o + 2] + b));
      },
      clear() { buf.fill(0); },
      get(x, y) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= W || y >= H) return null;
        const o = (y * W + x) * 3; return [buf[o], buf[o + 1], buf[o + 2]];
      },
    };
    render(c, ctx);
  };
  return cube;
}

module.exports = { defineCanvasEffect };
