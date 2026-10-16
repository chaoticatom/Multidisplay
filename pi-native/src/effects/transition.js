// How one effect gives way to the next (Setup > Display > Transition).
// `from` is the last frame of the old effect, `buf` the new effect's frame
// (written in place); k runs 0 -> 1 over the transition. Styles:
//   morph    - the two melt into each other: both are pushed along one slow
//              swirling flow, the new one shows through first where both are
//              bright, softened at the midpoint (flowMorph, also used by the
//              spectrum analyser's Auto)
//   fade     - blend (the original behaviour)
//   slide    - the new effect pushes the old one off to the left
//   dissolve - the new effect appears pixel by pixel in random order
//   wipe     - a soft-edged line sweeps left to right
//   zoom     - the new effect grows out from the centre in a circle
//   none     - instant cut (handled by the caller: no transition at all)
// On a cube there is no flat left-to-right, so slide/wipe/zoom use the
// LEDs' surface positions (core.surfX/Y) instead.
'use strict';

const STYLES = ['morph', 'fade', 'slide', 'dissolve', 'wipe', 'zoom', 'none'];

// A smooth swirling flow field (unit-ish vectors), cached per size.
const flowCache = new Map();
function flowField(W, H) {
  const key = W + 'x' + H;
  let f = flowCache.get(key);
  if (f) return f;
  f = { x: new Float32Array(W * H), y: new Float32Array(W * H) };
  const s = 1 / 22; // swirl size ~22 px
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // Curl of a sum of sines: divergence-free, so the picture swirls rather than bunches up.
    const px = x * s, py = y * s;
    const dpdx = Math.cos(px * 1.3 + 0.7) * Math.sin(py * 0.9) * 1.3 + Math.cos(px * 0.6 - py * 1.1 + 2) * 0.6;
    const dpdy = Math.sin(px * 1.3 + 0.7) * Math.cos(py * 0.9) * 0.9 - Math.cos(px * 0.6 - py * 1.1 + 2) * 1.1;
    f.x[y * W + x] = dpdy; f.y[y * W + x] = -dpdx;
  }
  flowCache.set(key, f);
  return f;
}
// Bilinear sample of an RGB float buffer, into out[0..2].
function sampleRGB(src, W, H, x, y, out) {
  x = x < 0 ? 0 : x > W - 1 ? W - 1 : x; y = y < 0 ? 0 : y > H - 1 ? H - 1 : y;
  const x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < W ? x0 + 1 : x0, y1 = y0 + 1 < H ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
  const a = (y0 * W + x0) * 3, b = (y0 * W + x1) * 3, c = (y1 * W + x0) * 3, d = (y1 * W + x1) * 3;
  for (let k = 0; k < 3; k++) { const top = src[a + k] + (src[b + k] - src[a + k]) * fx, bot = src[c + k] + (src[d + k] - src[c + k]) * fx; out[k] = top + (bot - top) * fy; }
}
// The flow morph. `buf` holds the new picture and receives the result;
// `from` is the old picture; k is 0..1. W x H, RGB floats.
let mTmp = null;
const SA = [0, 0, 0], SB = [0, 0, 0];
function flowMorph(buf, from, W, H, k) {
  if (!mTmp || mTmp.length !== buf.length) mTmp = new Float32Array(buf.length);
  mTmp.set(buf);
  const e = k * k * k * (k * (k * 6 - 15) + 10); // smootherstep
  const bend = Math.sin(Math.PI * e), amp = Math.min(W, H) * 0.09 * bend; // the flow is strongest mid-way
  const fl = flowField(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, fx = fl.x[i] * amp, fy = fl.y[i] * amp;
    // The old picture carried forward along the flow, the new one arriving along it.
    sampleRGB(from, W, H, x - fx * e, y - fy * e, SA);
    sampleRGB(mTmp, W, H, x + fx * (1 - e), y + fy * (1 - e), SB);
    // Brightness-matched blend: where the new picture is brighter it shows first.
    const la = SA[0] + SA[1] + SA[2], lb = SB[0] + SB[1] + SB[2];
    let w = (e - 0.5) * 2.2 + 0.5 + 0.35 * Math.tanh((lb - la) * 2) * bend;
    w = w < 0 ? 0 : w > 1 ? 1 : w; w = w * w * (3 - 2 * w);
    const o = i * 3;
    buf[o] = SA[0] + (SB[0] - SA[0]) * w; buf[o + 1] = SA[1] + (SB[1] - SA[1]) * w; buf[o + 2] = SA[2] + (SB[2] - SA[2]) * w;
  }
  // Soften the busiest middle moment a little (a light 3-tap blur, both ways).
  const soft = 0.45 * bend * bend;
  if (soft > 0.02) {
    mTmp.set(buf);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3, l = (y * W + (x > 0 ? x - 1 : x)) * 3, r = (y * W + (x < W - 1 ? x + 1 : x)) * 3, u = ((y > 0 ? y - 1 : y) * W + x) * 3, d = ((y < H - 1 ? y + 1 : y) * W + x) * 3;
      for (let c = 0; c < 3; c++) buf[o + c] = mTmp[o + c] * (1 - soft) + (mTmp[l + c] + mTmp[r + c] + mTmp[u + c] + mTmp[d + c]) * 0.25 * soft;
    }
  }
}

// A fixed pseudo-random 0..1 per pixel, so a dissolve doesn't flicker.
function rnd(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

let tmp = null;
function applyTransition(style, core, buf, from, k) {
  const wall = buf === core.wallBuf && core.wallW;
  const W = wall ? core.wallW : 0, H = wall ? core.wallH : 0, n = buf.length / 3;
  if (style === 'morph' && wall) { flowMorph(buf, from, W, H, k); return; }
  if (style === 'morph') style = 'fade'; // a cube's faces aren't one picture: a smooth fade instead
  if (style === 'slide' && wall) {
    // Old frame moves left by s columns; the new one follows it in from the right.
    if (!tmp || tmp.length !== buf.length) tmp = new Float32Array(buf.length);
    tmp.set(buf);
    const s = Math.round(W * k);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3, src = x < W - s ? (y * W + x + s) * 3 : (y * W + x - (W - s)) * 3, img = x < W - s ? from : tmp;
      buf[o] = img[src]; buf[o + 1] = img[src + 1]; buf[o + 2] = img[src + 2];
    }
    return;
  }
  for (let p = 0; p < n; p++) {
    let m; // how much of the new frame shows at this pixel
    if (style === 'dissolve') m = clamp01((k * 1.1 - rnd(p)) * 10);
    else if (style === 'wipe' || style === 'slide' || style === 'zoom') {
      let u, r;
      if (wall) { const x = p % W, y = (p / W) | 0; u = x / Math.max(1, W - 1); r = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (W / 2)); }
      else { u = ((core.surfX ? core.surfX[p] : 0) + 1) / 2; r = Math.hypot(core.surfX ? core.surfX[p] : 0, core.surfY ? core.surfY[p] : 0) / Math.SQRT2; }
      if (style === 'zoom') m = clamp01((k * 1.25 - r) / 0.2);
      else m = clamp01((k * 1.15 - u) / 0.15); // a cube "slide" is a wipe
    } else m = k * k * (3 - 2 * k); // fade, eased
    const i = p * 3;
    buf[i] = from[i] + (buf[i] - from[i]) * m;
    buf[i + 1] = from[i + 1] + (buf[i + 1] - from[i + 1]) * m;
    buf[i + 2] = from[i + 2] + (buf[i + 2] - from[i + 2]) * m;
  }
}

module.exports = { applyTransition, flowMorph, STYLES };
