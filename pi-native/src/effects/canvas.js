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

// For each top-face pixel: the canvas column of the nearest point on the top
// edge of a side, and how far in from that edge it is (0 at the edge, 0.5 at
// the middle). Worked out once per cube.
function topFoldMap(core, S, panorama) {
  const key = S + (panorama ? 'p' : 's');
  if (core._foldMap && core._foldMap.key === key) return core._foldMap;
  const X = core.surfX, Z = core.surfZ, edge = [];
  SIDE.forEach((f, k) => { for (let u = 0; u < S; u++) { const i = core.faceMap[f][(S - 1) * S + u]; if (i >= 0) edge.push([X[i], Z[i], (panorama ? k * S : 0) + u]); } });
  const top = [];
  for (const i of core.faceMap[4]) {
    if (i < 0) continue;
    let best = 0, bd = 1e9;
    for (let e = 0; e < edge.length; e++) { const d2 = (X[i] - edge[e][0]) ** 2 + (Z[i] - edge[e][1]) ** 2; if (d2 < bd) { bd = d2; best = e; } }
    top.push([i, edge[best][2], 0.5 - Math.max(Math.abs(X[i] - 0.5), Math.abs(Z[i] - 0.5))]);
  }
  return (core._foldMap = { key, top });
}
// A plot for a canvas effect's own top face: canvas point (x, y) with y
// above the sides (y < 0) lands on the top, -y in from the edge above column
// x, so things that go up over a side carry on across the top. For caps().
function topPlot(core, S, panorama, add = true) {
  const { top } = topFoldMap(core, S, panorama), W = panorama ? S * 4 : S;
  if (!core._topPlotGrid || core._topPlotGrid.key !== core._foldMap.key) {
    const grid = new Int32Array(W * S).fill(-1);
    for (const [i, cx, d] of top) grid[Math.min(S - 1, Math.round(d * S)) * W + cx] = i;
    core._topPlotGrid = { key: core._foldMap.key, grid };
  }
  const grid = core._topPlotGrid.grid, cb = core.colBuf;
  return (x, y, r, g, b) => {
    const dI = Math.round(-y); if (dI < 0 || dI >= S / 2) return;
    const cx = ((Math.round(x) % W) + W) % W, i = grid[dI * W + cx]; if (i < 0) return;
    const o = i * 3;
    if (add) { cb[o] = Math.min(1, cb[o] + r); cb[o + 1] = Math.min(1, cb[o + 1] + g); cb[o + 2] = Math.min(1, cb[o + 2] + b); } else { cb[o] = r; cb[o + 1] = g; cb[o + 2] = b; }
  };
}
// Fill a face (the top by default) with one colour: a caps() background.
function fillTop(core, r, g, b, face = 4) { for (const i of core.faceMap[face]) if (i >= 0) { const o = i * 3; core.colBuf[o] = r; core.colBuf[o + 1] = g; core.colBuf[o + 2] = b; } }

function foldTop(core, c, S, panorama) {
  const { top } = topFoldMap(core, S, panorama), cb = core.colBuf;
  // The blended middle: the average along the top rows of the sides.
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let x = 0; x < c.W; x += 2) for (let y = 0; y < 6; y += 2) { const q = c.get(x, y); if (q) { ar += q[0]; ag += q[1]; ab += q[2]; n++; } }
  if (n) { ar /= n; ag /= n; ab /= n; }
  for (const [i, cx, d] of top) {
    const q = c.get(cx, Math.min(S - 1, Math.round(d * S * 0.8))) || [0, 0, 0], fade = 1 - d * 0.9, m = d < 0.15 ? 0 : Math.min(1, (d - 0.15) / 0.3);
    const o = i * 3;
    cb[o] = (q[0] * (1 - m) + ar * m) * fade; cb[o + 1] = (q[1] * (1 - m) + ag * m) * fade; cb[o + 2] = (q[2] * (1 - m) + ab * m) * fade;
  }
}

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
    c.wrap = panorama; // the canvas runs round the cube: x wraps
    render(c, ctx);
    if (caps) { caps(core, 4, core.t); caps(core, 5, core.t); }
    else {
      // No caps: the top carries on from the sides - each point takes the
      // picture from just under the edge it faces, fading in towards a
      // blended middle (a real report: the top didn't match the sides).
      // The bottom goes dark (left alone it kept the last effect's picture).
      foldTop(core, c, S, panorama);
      for (const i of core.faceMap[5]) if (i >= 0) { const o = i * 3; core.colBuf[o] = 0; core.colBuf[o + 1] = 0; core.colBuf[o + 2] = 0; }
    }
  }
  cube.wall = function wall(core, dt) {
    core.t += dt * speed;
    if (!core.wallW) return;
    Object.assign(ctx, { t: core.t, dt, core });
    const W = core.wallW, H = core.wallH, buf = core.wallBuf;
    const c = {
      W, H, wrap: false,
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

module.exports = { defineCanvasEffect, topPlot, fillTop };
