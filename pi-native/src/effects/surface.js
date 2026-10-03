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
// smooth: true - for slowly varying fields: pixel() runs only on every
// other row and column (a quarter of the pixels) and the rest are blended
// from those samples, which looks the same on a smooth pattern at a
// quarter of the cost. detail(p, ctx, rgb), if given, then runs for EVERY
// pixel with the blended colour (cheap per-pixel extras such as twinkling
// stars) and returns the final [r, g, b].
//
// Returns the cube-mode effect function, with the wall-mode one attached
// as .wall - index.js registers both.
'use strict';

// Colour fields drift a little faster with the bass while music plays.
const tempoField = (core) => (core.audio && core.audio.active ? 1 + core.audio.bass * 0.5 : 1);

// Sample positions (every 2nd index, always including the last) for one
// axis of length n, and per index the two samples to blend and the weight.
const axisCache = new Map();
function axis(n) {
  let a = axisCache.get(n);
  if (a) return a;
  const pos = [];
  for (let k = 0; k < n; k += 2) pos.push(k);
  if (pos[pos.length - 1] !== n - 1) pos.push(n - 1);
  const s0 = new Int32Array(n), s1 = new Int32Array(n), w = new Float32Array(n);
  for (let x = 0, k = 0; x < n; x++) {
    while (k + 1 < pos.length - 1 && pos[k + 1] <= x) k++;
    const a0 = pos[k], a1 = pos[Math.min(k + 1, pos.length - 1)];
    s0[x] = k; s1[x] = Math.min(k + 1, pos.length - 1); w[x] = a1 === a0 ? 0 : (x - a0) / (a1 - a0);
  }
  a = { pos, s0, s1, w };
  axisCache.set(n, a);
  return a;
}

function defineFieldEffect({ speed = 1, frame, pixel, smooth = false, detail = null }) {
  const p = { x: 0, y: 0, z: 0, i: 0, flat: false };
  let samples = new Float32Array(64 * 64 * 3);
  const out = [0, 0, 0];
  // Bilinear blend of the four samples around a pixel (stride K samples/row).
  function blend(K, a0, a1, wu, b0, b1, wv) {
    const o00 = (b0 * K + a0) * 3, o10 = (b0 * K + a1) * 3, o01 = (b1 * K + a0) * 3, o11 = (b1 * K + a1) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const top = samples[o00 + ch] + (samples[o10 + ch] - samples[o00 + ch]) * wu;
      const bot = samples[o01 + ch] + (samples[o11 + ch] - samples[o01 + ch]) * wu;
      out[ch] = top + (bot - top) * wv;
    }
    return out;
  }
  const ctx = { t: 0, dt: 0, count: 0, flat: false, core: null };

  function cube(core, dt) {
    core.t += dt * speed * tempoField(core);
    const { N, surfX, surfY, surfZ } = core;
    Object.assign(ctx, { t: core.t, dt, count: N, flat: false, core });
    p.flat = false;
    if (frame) frame(ctx);
    if (!smooth) {
      for (let i = 0; i < N; i++) {
        p.x = surfX[i]; p.y = surfY[i]; p.z = surfZ[i]; p.i = i;
        const c = detail ? detail(p, ctx, pixel(p, ctx)) : pixel(p, ctx);
        core.setLED(i, c[0], c[1], c[2]);
      }
      return;
    }
    // Smooth: sample each face on a half-resolution grid, blend the rest.
    const S = core.SIZE, ax = axis(S), K = ax.pos.length;
    if (samples.length < K * K * 3) samples = new Float32Array(K * K * 3);
    for (let f = 0; f < 6; f++) {
      const map = core.faceMap[f];
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
        const i = map[ax.pos[b] * S + ax.pos[a]], o = (b * K + a) * 3;
        if (i < 0) { samples[o] = samples[o + 1] = samples[o + 2] = 0; continue; }
        p.x = surfX[i]; p.y = surfY[i]; p.z = surfZ[i]; p.i = i;
        const c = pixel(p, ctx);
        samples[o] = c[0]; samples[o + 1] = c[1]; samples[o + 2] = c[2];
      }
      for (let v = 0; v < S; v++) {
        const b0 = ax.s0[v], b1 = ax.s1[v], wv = ax.w[v];
        for (let u = 0; u < S; u++) {
          const i = map[v * S + u]; if (i < 0) continue;
          const c = blend(K, ax.s0[u], ax.s1[u], ax.w[u], b0, b1, wv);
          if (detail) { p.x = surfX[i]; p.y = surfY[i]; p.z = surfZ[i]; p.i = i; const d = detail(p, ctx, c); core.setLED(i, d[0], d[1], d[2]); }
          else core.setLED(i, c[0], c[1], c[2]);
        }
      }
    }
  }

  function wall(core, dt) {
    core.t += dt * speed * tempoField(core);
    const { wallW, wallH } = core;
    if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
    Object.assign(ctx, { t: core.t, dt, count: wallW * wallH, flat: true, core });
    p.flat = true;
    if (frame) frame(ctx);
    if (!smooth) {
      for (let yy = 0; yy < wallH; yy++) {
        const y = yy / wallH;
        for (let xx = 0; xx < wallW; xx++) {
          p.x = xx / wallW; p.y = y; p.z = y; p.i = yy * wallW + xx;
          const c = detail ? detail(p, ctx, pixel(p, ctx)) : pixel(p, ctx);
          core.setWallPixel(xx, yy, c[0], c[1], c[2]);
        }
      }
      return;
    }
    // Smooth: sample a half-resolution grid, blend the rest.
    const axX = axis(wallW), axY = axis(wallH), KX = axX.pos.length, KY = axY.pos.length;
    if (samples.length < KX * KY * 3) samples = new Float32Array(KX * KY * 3);
    for (let b = 0; b < KY; b++) {
      const yy = axY.pos[b];
      for (let a = 0; a < KX; a++) {
        const xx = axX.pos[a];
        p.x = xx / wallW; p.y = yy / wallH; p.z = p.y; p.i = yy * wallW + xx;
        const c = pixel(p, ctx), o = (b * KX + a) * 3;
        samples[o] = c[0]; samples[o + 1] = c[1]; samples[o + 2] = c[2];
      }
    }
    for (let yy = 0; yy < wallH; yy++) {
      const b0 = axY.s0[yy], b1 = axY.s1[yy], wv = axY.w[yy];
      for (let xx = 0; xx < wallW; xx++) {
        let c = blend(KX, axX.s0[xx], axX.s1[xx], axX.w[xx], b0, b1, wv);
        if (detail) { p.x = xx / wallW; p.y = yy / wallH; p.z = p.y; p.i = yy * wallW + xx; c = detail(p, ctx, c); }
        core.setWallPixel(xx, yy, c[0], c[1], c[2]);
      }
    }
  }

  cube.wall = wall;
  return cube;
}

module.exports = { defineFieldEffect };
