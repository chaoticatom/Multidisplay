// The "next-gen look": a finishing pass over every frame, after the effect
// and overlays have drawn - the same idea as a game engine's
// post-processing.
//   bloom    0..1  bright pixels glow onto their neighbours (highlights are
//                  blurred at half resolution and added back), which reads
//                  as real light on an LED panel instead of hard dots.
//   vibrance 0..1  lifts the saturation of muted colours more than already
//                  vivid ones, so pastel/greyish effects gain colour without
//                  neon effects clipping.
//   smooth   0..1  motion smoothing: blends a little of the previous frame,
//                  softening flicker in fast particle effects (0 = off).
// Cube: each face is processed as its own 64x64 image (via faceMap), so
// glow doesn't leak across an edge onto the wrong face.
'use strict';

const THRESH = 0.55; // brightness above which a pixel starts to bloom

// Colour palettes: any effect's colours are re-mapped onto these designed
// gradients (by hue, keeping brightness; whites and greys stay neutral).
const PALETTES = {
  sunset: ['#3b0a4d', '#a3216b', '#ff4e5c', '#ff9b3d', '#ffe08a'],
  ocean: ['#03124a', '#0b4fa3', '#14a8d6', '#5fe6e0', '#d8fff6'],
  neon: ['#ff00a8', '#8a00ff', '#00c8ff', '#00ffa3', '#fff200'],
  ember: ['#3d0700', '#a01d00', '#ff4d00', '#ffab1a', '#fff0b8'],
  aurora: ['#003d2a', '#00b377', '#30f0c8', '#7c5cff', '#e86bff'],
  forest: ['#0b2a10', '#2e7d32', '#8bc34a', '#d4e157', '#fff59d'],
  candy: ['#ff5fa2', '#ffa3d1', '#b388ff', '#82b1ff', '#80ffea'],
  ice: ['#0a1a3a', '#2a5ab8', '#7ab8ff', '#cfe8ff', '#ffffff'],
};
const PAL_RGB = {};
for (const [k, list] of Object.entries(PALETTES)) {
  PAL_RGB[k] = list.map((h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; });
}
// 256-entry lookup per palette, mirrored so the hue circle wraps smoothly.
const PAL_LUT = {};
for (const [k, stops] of Object.entries(PAL_RGB)) {
  const lut = new Float32Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = 1 - Math.abs((i / 255) * 2 - 1), x = t * (stops.length - 1), a = Math.min(stops.length - 2, Math.floor(x)), f = x - a;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = stops[a][c] + (stops[a + 1][c] - stops[a][c]) * f;
  }
  PAL_LUT[k] = lut;
}
function gradePalette(buf, n, name) {
  const lut = PAL_LUT[name]; if (!lut) return;
  for (let o = 0; o < n * 3; o += 3) {
    const r = buf[o], g = buf[o + 1], b = buf[o + 2], mx = Math.max(r, g, b);
    if (mx < 0.01) continue;
    const mn = Math.min(r, g, b), d = mx - mn, sat = d / mx;
    if (sat < 0.05) continue;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h / 6 + 1) % 1;
    const i = Math.round(h * 255) * 3;
    // Palette colour at the pixel's brightness, blended by its saturation.
    const pr = lut[i] * mx, pg = lut[i + 1] * mx, pb = lut[i + 2] * mx, grey = mx * (1 - sat);
    buf[o] = pr * sat + grey; buf[o + 1] = pg * sat + grey; buf[o + 2] = pb * sat + grey;
  }
}

// Cube depth: soft light from above-front so the faces read as a solid
// object (top brightest, bottom darkest), plus a gentle darkening towards
// each face's edges. Per-LED factors, cached per cube size.
let depthKey = '', depthF = null;
function depthFactors(core) {
  const key = core.N + '|' + core.SIZE;
  if (depthKey === key) return depthF;
  depthKey = key; depthF = new Float32Array(core.N).fill(1);
  const L = [0.35, 0.8, 0.48], ll = Math.hypot(...L);
  for (let i = 0; i < core.N; i++) {
    const p = [core.surfX[i] - 0.5, core.surfY[i] - 0.5, core.surfZ[i] - 0.5];
    const ax = [Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])], k = ax.indexOf(Math.max(...ax));
    const n = [0, 0, 0]; n[k] = Math.sign(p[k]);
    const diffuse = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll);
    const others = [0, 1, 2].filter((j) => j !== k), edge = Math.max(ax[others[0]], ax[others[1]]) * 2; // 0 centre .. 1 edge
    depthF[i] = (0.62 + 0.38 * diffuse) * (1 - 0.18 * Math.pow(edge, 4));
  }
  return depthF;
}

// Scratch buffers, grown on demand.
let src = new Float32Array(0), img = new Float32Array(0), half = new Float32Array(0), tmp = new Float32Array(0), prevWall = null, prevCube = null;
const grow = (a, n) => (a.length >= n ? a : new Float32Array(n));

// 5-tap gaussian along one axis of a w x h RGB image (in -> out).
function blur(src, dst, w, h, dx, dy) {
  const K0 = 0.375, K1 = 0.25, K2 = 0.0625;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      for (let c = 0; c < 3; c++) {
        let s = src[o + c] * K0;
        for (let k = 1; k <= 2; k++) {
          const wk = k === 1 ? K1 : K2;
          const xa = Math.min(w - 1, x + dx * k), ya = Math.min(h - 1, y + dy * k);
          const xb = Math.max(0, x - dx * k), yb = Math.max(0, y - dy * k);
          s += (src[(ya * w + xa) * 3 + c] + src[(yb * w + xb) * 3 + c]) * wk;
        }
        dst[o + c] = s;
      }
    }
  }
}

// Bloom + vibrance on one RGB image in place (buf: w*h*3).
function processImage(buf, w, h, bloom, vibrance) {
  if (bloom > 0.001) {
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    half = grow(half, hw * hh * 3); tmp = grow(tmp, hw * hh * 3);
    // Highlights, box-downsampled to half resolution.
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = x * 2 + i, sy = y * 2 + j;
        if (sx >= w || sy >= h) continue;
        const o = (sy * w + sx) * 3, m = Math.max(buf[o], buf[o + 1], buf[o + 2]);
        if (m > THRESH) { const k = (m - THRESH) / m; r += buf[o] * k; g += buf[o + 1] * k; b += buf[o + 2] * k; }
        n++;
      }
      const o = (y * hw + x) * 3; half[o] = r / n; half[o + 1] = g / n; half[o + 2] = b / n;
    }
    // Two blur passes each way: a wide, soft glow.
    blur(half, tmp, hw, hh, 1, 0); blur(tmp, half, hw, hh, 0, 1);
    blur(half, tmp, hw, hh, 1, 0); blur(tmp, half, hw, hh, 0, 1);
    const k = bloom * 1.6;
    for (let y = 0; y < h; y++) {
      const fy = Math.min(hh - 1, (y - 0.5) / 2), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(hh - 1, y0 + 1), wy = Math.max(0, fy - y0);
      for (let x = 0; x < w; x++) {
        const fx = Math.min(hw - 1, (x - 0.5) / 2), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(hw - 1, x0 + 1), wx = Math.max(0, fx - x0);
        const o = (y * w + x) * 3, a = (y0 * hw + x0) * 3, bq = (y0 * hw + x1) * 3, c = (y1 * hw + x0) * 3, d = (y1 * hw + x1) * 3;
        for (let ch = 0; ch < 3; ch++) {
          const top = half[a + ch] + (half[bq + ch] - half[a + ch]) * wx, bot = half[c + ch] + (half[d + ch] - half[c + ch]) * wx;
          buf[o + ch] += (top + (bot - top) * wy) * k;
        }
      }
    }
  }
  if (vibrance > 0.001) {
    for (let o = 0; o < w * h * 3; o += 3) {
      const r = buf[o], g = buf[o + 1], b = buf[o + 2];
      const mx = Math.max(r, g, b);
      if (mx < 0.02) continue;
      const mn = Math.min(r, g, b), sat = (mx - mn) / mx, l = (r + g + b) / 3;
      const boost = 1 + vibrance * (1 - sat) * 1.2;
      buf[o] = Math.max(0, l + (r - l) * boost); buf[o + 1] = Math.max(0, l + (g - l) * boost); buf[o + 2] = Math.max(0, l + (b - l) * boost);
    }
  }
}

function smoothInto(buf, prev, amount) {
  const keep = amount * 0.6;
  for (let i = 0; i < buf.length; i++) { const v = buf[i] + (prev[i] - buf[i]) * keep; buf[i] = v; prev[i] = v; }
}

// The pass only changes what is SHOWN: effects with trails read their own
// buffer back next frame, and glow fed back into them blew out to white. So
// the clean frame is kept here and restorePostFx() puts it back at the start
// of the next tick, before the effect draws.
let rawBuf = null, rawTarget = null;
function restorePostFx() {
  if (rawBuf && rawTarget && rawTarget.length === rawBuf.length) rawTarget.set(rawBuf);
  rawTarget = null;
}
function keepRaw(buf) {
  if (!rawBuf || rawBuf.length !== buf.length) rawBuf = new Float32Array(buf.length);
  rawBuf.set(buf); rawTarget = buf;
}

// look: { on, bloom, vibrance, smooth } (see prefs.js).
function applyPostFx(core, mode, look) {
  if (!look || !look.on) { prevWall = prevCube = null; rawTarget = null; return; }
  keepRaw(mode === 'wall' ? core.wallBuf : core.colBuf);
  const bloom = look.bloom ?? 0.65, vib = look.vibrance ?? 0.35, sm = look.smooth ?? 0;
  if (mode === 'wall') {
    if (!core.wallBuf) return;
    if (look.palette && look.palette !== 'auto') gradePalette(core.wallBuf, core.wallW * core.wallH, look.palette);
    processImage(core.wallBuf, core.wallW, core.wallH, bloom, vib);
    if (sm > 0.01) { if (!prevWall || prevWall.length !== core.wallBuf.length) prevWall = Float32Array.from(core.wallBuf); smoothInto(core.wallBuf, prevWall, sm); } else prevWall = null;
    return;
  }
  const S = core.SIZE, buf = core.colBuf;
  img = grow(img, S * S * 3);
  // Faces read from an untouched copy: an edge LED belongs to two faces and
  // would otherwise be processed (glow added) twice.
  src = grow(src, buf.length); src.set(buf);
  if (look.palette && look.palette !== 'auto') { gradePalette(buf, core.N, look.palette); src.set(buf); }
  const faces = mode === '2d' ? [0] : [0, 1, 2, 3, 4, 5];
  for (const f of faces) {
    const map = core.faceMap[f];
    for (let j = 0; j < S * S; j++) { const i = map[j], o = j * 3; if (i < 0) { img[o] = img[o + 1] = img[o + 2] = 0; continue; } img[o] = src[i * 3]; img[o + 1] = src[i * 3 + 1]; img[o + 2] = src[i * 3 + 2]; }
    processImage(img, S, S, bloom, vib);
    for (let j = 0; j < S * S; j++) { const i = map[j]; if (i < 0) continue; const o = j * 3; buf[i * 3] = img[o]; buf[i * 3 + 1] = img[o + 1]; buf[i * 3 + 2] = img[o + 2]; }
  }
  const depth = mode === 'cube' ? (look.depth ?? 0.5) : 0;
  if (depth > 0.01) {
    const F = depthFactors(core);
    for (let i = 0; i < core.N; i++) { const f = 1 - depth * (1 - F[i]); buf[i * 3] *= f; buf[i * 3 + 1] *= f; buf[i * 3 + 2] *= f; }
  }
  if (sm > 0.01) { if (!prevCube || prevCube.length !== buf.length) prevCube = Float32Array.from(buf); smoothInto(buf, prevCube, sm); } else prevCube = null;
}

module.exports = { applyPostFx, restorePostFx, processImage, PALETTES };
