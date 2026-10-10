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

// 5-tap gaussian along one axis of a w x h RGB image (in -> out). Written
// for speed (it runs on every frame): neighbour indices are worked out once
// per row/column instead of clamping per tap and per channel. Same sums in
// the same order as a plain loop, so the result is unchanged.
const K0 = 0.375, K1 = 0.25, K2 = 0.0625;
function blur(src, dst, w, h, dx, dy) {
  if (dx) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const o = (row + x) * 3;
        const a1 = (row + (x + 1 < w ? x + 1 : w - 1)) * 3, b1 = (row + (x - 1 > 0 ? x - 1 : 0)) * 3;
        const a2 = (row + (x + 2 < w ? x + 2 : w - 1)) * 3, b2 = (row + (x - 2 > 0 ? x - 2 : 0)) * 3;
        dst[o] = src[o] * K0 + (src[a1] + src[b1]) * K1 + (src[a2] + src[b2]) * K2;
        dst[o + 1] = src[o + 1] * K0 + (src[a1 + 1] + src[b1 + 1]) * K1 + (src[a2 + 1] + src[b2 + 1]) * K2;
        dst[o + 2] = src[o + 2] * K0 + (src[a1 + 2] + src[b1 + 2]) * K1 + (src[a2 + 2] + src[b2 + 2]) * K2;
      }
    }
    return;
  }
  for (let y = 0; y < h; y++) {
    const ra1 = (y + 1 < h ? y + 1 : h - 1) * w, rb1 = (y - 1 > 0 ? y - 1 : 0) * w;
    const ra2 = (y + 2 < h ? y + 2 : h - 1) * w, rb2 = (y - 2 > 0 ? y - 2 : 0) * w;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3, a1 = (ra1 + x) * 3, b1 = (rb1 + x) * 3, a2 = (ra2 + x) * 3, b2 = (rb2 + x) * 3;
      dst[o] = src[o] * K0 + (src[a1] + src[b1]) * K1 + (src[a2] + src[b2]) * K2;
      dst[o + 1] = src[o + 1] * K0 + (src[a1 + 1] + src[b1 + 1]) * K1 + (src[a2 + 1] + src[b2 + 1]) * K2;
      dst[o + 2] = src[o + 2] * K0 + (src[a1 + 2] + src[b1 + 2]) * K1 + (src[a2 + 2] + src[b2 + 2]) * K2;
    }
  }
}

// Bilinear upscale positions for one axis (full-res index -> two half-res
// indices and a weight), cached per size.
const upCache = new Map();
function upAxis(n, hn) {
  const key = n + ':' + hn;
  let t = upCache.get(key);
  if (!t) {
    t = { i0: new Int32Array(n), i1: new Int32Array(n), w: new Float32Array(n) };
    for (let x = 0; x < n; x++) {
      const f = Math.min(hn - 1, (x - 0.5) / 2), x0 = Math.max(0, Math.floor(f));
      t.i0[x] = x0; t.i1[x] = Math.min(hn - 1, x0 + 1); t.w[x] = Math.max(0, f - x0);
    }
    upCache.set(key, t);
  }
  return t;
}

// Bloom + vibrance on one RGB image in place (buf: w*h*3).
function processImage(buf, w, h, bloom, vibrance) {
  if (bloom > 0.001) {
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    half = grow(half, hw * hh * 3); tmp = grow(tmp, hw * hh * 3);
    // Highlights, box-downsampled to half resolution.
    let any = false;
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const sx0 = x * 2, sy0 = y * 2;
      for (let j = 0; j < 2; j++) {
        const sy = sy0 + j; if (sy >= h) continue;
        for (let i = 0; i < 2; i++) {
          const sx = sx0 + i; if (sx >= w) continue;
          const o = (sy * w + sx) * 3, pr = buf[o], pg = buf[o + 1], pb = buf[o + 2];
          const m = pr > pg ? (pr > pb ? pr : pb) : (pg > pb ? pg : pb);
          if (m > THRESH) { const k = (m - THRESH) / m; r += pr * k; g += pg * k; b += pb * k; }
          n++;
        }
      }
      const o = (y * hw + x) * 3; half[o] = r / n; half[o + 1] = g / n; half[o + 2] = b / n;
      if (r + g + b > 0) any = true;
    }
    // Nothing bright enough to glow (common in dark effects): skip the rest.
    if (any) {
      // Two blur passes each way: a wide, soft glow.
      blur(half, tmp, hw, hh, 1, 0); blur(tmp, half, hw, hh, 0, 1);
      blur(half, tmp, hw, hh, 1, 0); blur(tmp, half, hw, hh, 0, 1);
      const k = bloom * 1.6, ux = upAxis(w, hw), uy = upAxis(h, hh);
      for (let y = 0; y < h; y++) {
        const r0 = uy.i0[y] * hw, r1 = uy.i1[y] * hw, wy = uy.w[y];
        for (let x = 0; x < w; x++) {
          const x0 = ux.i0[x], x1 = ux.i1[x], wx = ux.w[x];
          const o = (y * w + x) * 3, a = (r0 + x0) * 3, bq = (r0 + x1) * 3, c = (r1 + x0) * 3, d = (r1 + x1) * 3;
          // Channels written out (same arithmetic as a per-channel loop).
          let top = half[a] + (half[bq] - half[a]) * wx, bot = half[c] + (half[d] - half[c]) * wx;
          buf[o] += (top + (bot - top) * wy) * k;
          top = half[a + 1] + (half[bq + 1] - half[a + 1]) * wx; bot = half[c + 1] + (half[d + 1] - half[c + 1]) * wx;
          buf[o + 1] += (top + (bot - top) * wy) * k;
          top = half[a + 2] + (half[bq + 2] - half[a + 2]) * wx; bot = half[c + 2] + (half[d + 2] - half[c + 2]) * wx;
          buf[o + 2] += (top + (bot - top) * wy) * k;
        }
      }
    }
  }
  if (vibrance > 0.001) {
    const end = w * h * 3, vk = vibrance * 1.2;
    for (let o = 0; o < end; o += 3) {
      const r = buf[o], g = buf[o + 1], b = buf[o + 2];
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (mx < 0.02) continue;
      const mn = r < g ? (r < b ? r : b) : (g < b ? g : b), sat = (mx - mn) / mx, l = (r + g + b) / 3;
      const boost = 1 + vk * (1 - sat);
      const nr = l + (r - l) * boost, ng = l + (g - l) * boost, nb = l + (b - l) * boost;
      buf[o] = nr > 0 ? nr : 0; buf[o + 1] = ng > 0 ? ng : 0; buf[o + 2] = nb > 0 ? nb : 0;
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
