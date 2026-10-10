// How one effect gives way to the next (Setup > Display > Transition).
// `from` is the last frame of the old effect, `buf` the new effect's frame
// (written in place); k runs 0 -> 1 over the transition. Styles:
//   fade     - blend (the original behaviour)
//   slide    - the new effect pushes the old one off to the left
//   dissolve - the new effect appears pixel by pixel in random order
//   wipe     - a soft-edged line sweeps left to right
//   zoom     - the new effect grows out from the centre in a circle
//   none     - instant cut (handled by the caller: no transition at all)
// On a cube there is no flat left-to-right, so slide/wipe/zoom use the
// LEDs' surface positions (core.surfX/Y) instead.
'use strict';

const STYLES = ['fade', 'slide', 'dissolve', 'wipe', 'zoom', 'none'];

// A fixed pseudo-random 0..1 per pixel, so a dissolve doesn't flicker.
function rnd(i) { let h = (i * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

let tmp = null;
function applyTransition(style, core, buf, from, k) {
  const wall = buf === core.wallBuf && core.wallW;
  const W = wall ? core.wallW : 0, H = wall ? core.wallH : 0, n = buf.length / 3;
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

module.exports = { applyTransition, STYLES };
