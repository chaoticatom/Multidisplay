// Cross-effect helpers ported verbatim (math unchanged) from
// effects-core.js's cubePx()/fwPx()/tronMove() - shared by more than one
// Motion & Particles effect (sphere/"Laser Grid" and lightning use cubePx;
// lightning and (later) tron use tronMove). Kept out of core.js itself
// since CubeCore is the browser's cube.js port, while these three are
// effects-core.js's cross-category helpers, per CLAUDE.md's file layout.
//
// Only the plumbing changed: reads SIZE/faceMap off the passed `core`
// instead of bare globals, and panel2dMode/tronBorderWalls (browser globals
// read via `typeof x!=='undefined'` guards, since they come from sidebar
// checkboxes that don't exist here) are hardcoded false - pi-native has no
// equivalent UI toggle yet, so tronMove always takes the real cube-wrap
// branch, never the flat/bordered-2D-net branch.
const FW_FACES = [0, 2, 1, 3];

// FW_FONT - 7x6 bitmap font (6 rows, glyph strokes in columns 0-5, column 6
// always blank as built-in letter-spacing) for the fireworks scrolling
// text overlay (fireworks.js/fireworksWall.js) - a real request, after an
// earlier 6x5 version, for a bigger glyph CELL (not a pixel-scale
// multiplier - text must stay rendered at a flat 1:1 scale, one font bit
// per physical pixel, per a separate "should be 1 width" report). Row
// values are 6-bit (0-63, MSB = leftmost of the 6 stroke columns);
// FW_CHAR_W (7) is the full advance width per character including the
// spacer column.
const FW_FONT = {
  '0': [30, 33, 33, 33, 33, 30], '1': [4, 12, 4, 4, 4, 14], '2': [30, 33, 2, 12, 16, 63], '3': [30, 33, 6, 2, 33, 30],
  '4': [4, 12, 20, 36, 63, 4], '5': [63, 32, 62, 1, 33, 30], '6': [7, 16, 48, 39, 33, 30], '7': [63, 2, 4, 8, 8, 8],
  '8': [30, 33, 30, 33, 33, 30], '9': [30, 33, 33, 31, 2, 14],
  A: [30, 33, 33, 63, 33, 33], B: [62, 33, 62, 33, 33, 62], C: [30, 33, 32, 32, 33, 30], D: [62, 33, 33, 33, 33, 62],
  E: [63, 32, 62, 32, 32, 63], F: [63, 32, 62, 32, 32, 32], G: [30, 32, 39, 33, 33, 30], H: [33, 33, 63, 33, 33, 33],
  I: [30, 4, 4, 4, 4, 30], J: [7, 2, 2, 2, 34, 14], K: [33, 34, 52, 52, 34, 33], L: [32, 32, 32, 32, 32, 63],
  M: [33, 51, 45, 33, 33, 33], N: [33, 49, 41, 37, 35, 33], O: [30, 33, 33, 33, 33, 30], P: [62, 33, 62, 32, 32, 32],
  Q: [30, 33, 33, 37, 34, 30], R: [62, 33, 62, 36, 34, 33], S: [30, 32, 30, 1, 1, 62], T: [63, 4, 4, 4, 4, 4],
  U: [33, 33, 33, 33, 33, 30], V: [33, 33, 33, 33, 18, 12], W: [33, 33, 45, 45, 51, 33], X: [33, 18, 12, 12, 18, 33],
  Y: [33, 18, 12, 4, 4, 4], Z: [63, 2, 4, 8, 16, 63],
  ' ': [0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 4, 8], "'": [4, 4, 0, 0, 0, 0],
  '"': [18, 18, 0, 0, 0, 0], '?': [30, 33, 2, 4, 0, 4], '!': [4, 4, 4, 4, 0, 4], ':': [0, 4, 0, 0, 4, 0],
  ';': [0, 4, 0, 0, 4, 8], '-': [0, 0, 63, 0, 0, 0], '(': [4, 8, 32, 32, 8, 4], ')': [4, 2, 1, 1, 2, 4],
};
const FW_CHAR_W = 7;

// Ported verbatim from effects-core.js's VID_FACE_ORDER - front→left→right→
// back ordering for a seamless panorama across 4 side faces. Used by
// retro.js (and effects-media.js's video effect in the browser, not yet
// ported here).
const VID_FACE_ORDER = [0, 3, 1, 2];

function cubePx(core, col, v) {
  const S = core.SIZE, T = S * 4, M = S - 1;
  const faceMap = core.faceMap;
  const c = ((col % T) + T) % T;
  const qi = (c / S) | 0;
  const fu = c % S;
  if (v >= 0 && v < S) return faceMap[FW_FACES[qi]][v * S + fu];
  if (v >= S) {
    const ov = v - S;
    if (ov >= S) return -1;
    if (qi === 0) return faceMap[4][(M - ov) * S + fu];
    if (qi === 1) return faceMap[4][(M - fu) * S + (M - ov)];
    if (qi === 2) return faceMap[4][ov * S + (M - fu)];
    return faceMap[4][fu * S + ov];
  }
  const ov = -v - 1;
  if (ov >= S) return -1;
  if (qi === 0) return faceMap[5][ov * S + fu];
  if (qi === 1) return faceMap[5][fu * S + (M - ov)];
  if (qi === 2) return faceMap[5][(M - ov) * S + (M - fu)];
  return faceMap[5][(M - fu) * S + ov];
}

function fwPx(core, col, v) { return cubePx(core, col, v); }

// (x,y,z) -> surface LED index, or -1. Ported verbatim from
// effects-core.js's surfIdx() - used by maze.js (and any future effect
// that needs to walk the cube surface via integer voxel coords rather
// than per-face u,v).
function surfIdx(core, x, y, z) {
  const SIZE = core.SIZE, faceMap = core.faceMap, M = SIZE - 1;
  if (x < 0 || y < 0 || z < 0 || x > M || y > M || z > M) return -1;
  if (z === M) return faceMap[0][y * SIZE + x];
  if (z === 0) return faceMap[1][y * SIZE + (M - x)];
  if (x === M) return faceMap[2][y * SIZE + (M - z)];
  if (x === 0) return faceMap[3][y * SIZE + z];
  if (y === M) return faceMap[4][z * SIZE + x];
  if (y === 0) return faceMap[5][z * SIZE + x];
  return -1;
}

function tronMove(core, face, u, v, du, dv) {
  const SIZE = core.SIZE, M = SIZE - 1, nu = u + du, nv = v + dv;
  if (nu >= 0 && nu <= M && nv >= 0 && nv <= M) return [face, nu, nv, du, dv];
  switch (face) {
    case 0: if (du === 1) return [2, M, v, -1, 0]; if (du === -1) return [3, M, v, -1, 0]; if (dv === 1) return [4, u, M, 0, -1]; return [5, u, M, 0, -1];
    case 1: if (du === 1) return [2, 0, v, 1, 0]; if (du === -1) return [3, 0, v, 1, 0]; if (dv === 1) return [4, u, 0, 0, 1]; return [5, u, 0, 0, 1];
    case 2: if (du === 1) return [0, M, v, -1, 0]; if (du === -1) return [1, M, v, -1, 0]; if (dv === 1) return [4, M, u, -1, 0]; return [5, M, u, -1, 0];
    case 3: if (du === 1) return [0, 0, v, 1, 0]; if (du === -1) return [1, 0, v, 1, 0]; if (dv === 1) return [4, 0, u, 1, 0]; return [5, 0, u, 1, 0];
    case 4: if (du === 1) return [2, v, M, 0, -1]; if (du === -1) return [3, v, M, 0, -1]; if (dv === 1) return [0, u, M, 0, -1]; return [1, u, M, 0, -1];
    default: if (du === 1) return [2, v, 0, 0, 1]; if (du === -1) return [3, v, 0, 0, 1]; if (dv === 1) return [0, u, 0, 0, 1]; return [1, u, 0, 0, 1];
  }
}

// Fixed "down" gravity vector, in cube-local coordinates. Ported in spirit
// (not verbatim) from cube.js's getLocalGravity() - the browser version
// resolves gravity through either live device-orientation (gyroEnabled) or
// the mouse-drag pivotGroup's inverse quaternion, so a dragged/tilted cube
// tips its sand/balls/fluid accordingly. pi-native has no orbit-drag preview
// and no device-orientation sensor (headless Pi), so there is nothing for
// either branch to read - gravity is just a fixed world-down vector,
// matching the browser's own untouched-cube default (pivotGroup identity ->
// {x:0,y:-1,z:0}). Used by balls.js/sand.js/fluid.js.
function getLocalGravity() {
  return { x: 0, y: -1, z: 0 };
}

// ═══════════════════════════════════════════════════
//  Shared photo-gallery slideshow engine
// ═══════════════════════════════════════════════════
// Ported verbatim (math unchanged) from effects-core.js's
// galleryInitFaceState()/gallerySlideshowStep()/galleryApplyToFace()/
// galleryApplyBlendToFace() - the shared engine behind any "cycle through a
// set of loaded photos, one per face, staggered and crossfading" effect
// (Unsplash, Art Gallery, and future ones). Only the plumbing changed:
// galleryApplyToFace/galleryApplyBlendToFace take `core` (for SIZE/faceMap/
// setLED) instead of reading bare globals.
function galleryInitFaceState(n, periodSecs) {
  const stagger = periodSecs / 6;
  return Array.from({ length: 6 }, (_, f) => ({
    curIdx: n ? f % n : 0, nextIdx: null, fadeT: 0, timer: f * stagger,
  }));
}

function gallerySlideshowStep(state, n, dt, periodSecs, fadeDur, slideshowOn, loadFn, pixelsArr) {
  loadFn(state.curIdx);
  if (state.nextIdx != null) loadFn(state.nextIdx);
  if (state.fadeT > 0) {
    const nextPixels = pixelsArr[state.nextIdx];
    if (nextPixels === 'error') {
      state.nextIdx = (state.nextIdx + 1) % n;
      loadFn(state.nextIdx);
    } else if (nextPixels) {
      state.fadeT += dt;
      if (state.fadeT >= fadeDur) { state.curIdx = state.nextIdx; state.nextIdx = null; state.fadeT = 0; }
    }
  } else if (slideshowOn) {
    state.timer += dt;
    if (state.timer >= periodSecs) {
      state.timer -= periodSecs;
      state.nextIdx = n > 6 ? (state.curIdx + 6) % n : (state.curIdx + 1) % n;
      loadFn(state.nextIdx);
      state.fadeT = 0.0001;
    }
  }
}

function galleryApplyToFace(core, pixelsArr, sizesArr, face, idx) {
  const pixels = pixelsArr[idx];
  if (!pixels || pixels === 'error') return false;
  const S = core.SIZE, IS = sizesArr[idx];
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const su = Math.min(IS - 1, Math.floor(u / S * IS));
      const sv = Math.min(IS - 1, Math.floor((S - 1 - v) / S * IS));
      const pi = (sv * IS + su) * 4;
      core.setFaceLED(face, u, v, pixels[pi] / 255, pixels[pi + 1] / 255, pixels[pi + 2] / 255);
    }
  }
  return true;
}

function galleryApplyBlendToFace(core, pixelsArr, sizesArr, face, idxA, idxB, alpha) {
  const pixelsA = pixelsArr[idxA], pixelsB = pixelsArr[idxB];
  const okA = pixelsA && pixelsA !== 'error', okB = pixelsB && pixelsB !== 'error';
  if (!okA && !okB) return false;
  if (!okA) return galleryApplyToFace(core, pixelsArr, sizesArr, face, idxB);
  if (!okB) return galleryApplyToFace(core, pixelsArr, sizesArr, face, idxA);
  const S = core.SIZE, ISA = sizesArr[idxA], ISB = sizesArr[idxB];
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const suA = Math.min(ISA - 1, Math.floor(u / S * ISA)), svA = Math.min(ISA - 1, Math.floor((S - 1 - v) / S * ISA));
      const piA = (svA * ISA + suA) * 4;
      const suB = Math.min(ISB - 1, Math.floor(u / S * ISB)), svB = Math.min(ISB - 1, Math.floor((S - 1 - v) / S * ISB));
      const piB = (svB * ISB + suB) * 4;
      const r = (pixelsA[piA] / 255) + ((pixelsB[piB] / 255) - (pixelsA[piA] / 255)) * alpha;
      const g = (pixelsA[piA + 1] / 255) + ((pixelsB[piB + 1] / 255) - (pixelsA[piA + 1] / 255)) * alpha;
      const b = (pixelsA[piA + 2] / 255) + ((pixelsB[piB + 2] / 255) - (pixelsA[piA + 2] / 255)) * alpha;
      core.setFaceLED(face, u, v, r, g, b);
    }
  }
  return true;
}

// ── Wall-mode siblings of galleryApplyToFace/galleryApplyBlendToFace ──────
// Wall batch (unsplashWall.js/articWall.js): a stitched wall isn't six
// independent faces, so unlike the cube version's "one photo per face,
// staggered" this shows ONE photo at a time, stretched to fill the whole
// wallW x wallH canvas (apodWall.js's "one continuous image" shape). Photo
// decode/fetch is untouched - still loadImageForPixels() at a fixed square
// size (see unsplashWall.js/articWall.js's own load()) - only this
// pixel-output/blit step needed a wallW x wallH-aware version, per the
// batch brief; the SxS decoded image is stretched (nearest-neighbour) to
// cover the wall canvas here instead of being placed 1:1 onto a SIZE-square
// face.
function galleryApplyToWall(core, pixelsArr, sizesArr, idx) {
  const pixels = pixelsArr[idx];
  if (!pixels || pixels === 'error') return false;
  const { wallW: W, wallH: H } = core;
  const IS = sizesArr[idx];
  for (let y = 0; y < H; y++) {
    const sv = Math.min(IS - 1, Math.floor(y / H * IS));
    for (let x = 0; x < W; x++) {
      const su = Math.min(IS - 1, Math.floor(x / W * IS));
      const pi = (sv * IS + su) * 4;
      core.setWallPixel(x, y, pixels[pi] / 255, pixels[pi + 1] / 255, pixels[pi + 2] / 255);
    }
  }
  return true;
}

function galleryApplyBlendToWall(core, pixelsArr, sizesArr, idxA, idxB, alpha) {
  const pixelsA = pixelsArr[idxA], pixelsB = pixelsArr[idxB];
  const okA = pixelsA && pixelsA !== 'error', okB = pixelsB && pixelsB !== 'error';
  if (!okA && !okB) return false;
  if (!okA) return galleryApplyToWall(core, pixelsArr, sizesArr, idxB);
  if (!okB) return galleryApplyToWall(core, pixelsArr, sizesArr, idxA);
  const { wallW: W, wallH: H } = core;
  const ISA = sizesArr[idxA], ISB = sizesArr[idxB];
  for (let y = 0; y < H; y++) {
    const svA = Math.min(ISA - 1, Math.floor(y / H * ISA));
    const svB = Math.min(ISB - 1, Math.floor(y / H * ISB));
    for (let x = 0; x < W; x++) {
      const suA = Math.min(ISA - 1, Math.floor(x / W * ISA));
      const piA = (svA * ISA + suA) * 4;
      const suB = Math.min(ISB - 1, Math.floor(x / W * ISB));
      const piB = (svB * ISB + suB) * 4;
      const r = (pixelsA[piA] / 255) + ((pixelsB[piB] / 255) - (pixelsA[piA] / 255)) * alpha;
      const g = (pixelsA[piA + 1] / 255) + ((pixelsB[piB + 1] / 255) - (pixelsA[piA + 1] / 255)) * alpha;
      const b = (pixelsA[piA + 2] / 255) + ((pixelsB[piB + 2] / 255) - (pixelsA[piA + 2] / 255)) * alpha;
      core.setWallPixel(x, y, r, g, b);
    }
  }
  return true;
}

// Fetches a remote image and decodes it into an RGBA pixel buffer sized
// targetSize x targetSize, via Jimp - same decode tool cam.js/apod.js/
// epic.js already use (no DOM/Canvas here). `letterbox:true` (default,
// matches the browser's loadImageForPixels() default) fits the whole image
// within the square preserving aspect ratio, composited onto black
// (Jimp's contain()); `letterbox:false` crops to fill (Jimp's cover()).
// Only a direct fetch is attempted here - not the browser's full 4-tier
// fetch/proxy fallback chain (CLAUDE.md's image-loading note: that chain
// exists for browser CORS restrictions, which don't apply to a server-side
// fetch running with no Origin header - so tiers 3/4 (the weserv.nl proxy)
// would add complexity with no benefit here).
async function loadImageForPixels(url, targetSize, opts) {
  const { Jimp } = require('jimp');
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  const src = await Jimp.read(buf);
  const letterbox = opts && opts.letterbox === false ? false : true;
  let out;
  if (letterbox) {
    src.contain({ w: targetSize, h: targetSize });
    out = new Jimp({ width: targetSize, height: targetSize, color: 0x000000ff });
    out.composite(src, 0, 0);
  } else {
    src.cover({ w: targetSize, h: targetSize });
    out = src;
  }
  return { pixels: out.bitmap.data, size: targetSize };
}

// Small centered-text placeholder drawer (3x5 PIXEL_FONT, same font weather
// uses for its ticker) - shared by unsplash.js/artic.js for their "no
// results yet" / "API ERROR" cards, same approach as apod.js's own local
// drawLinesCentered/drawGlyph3x5 (kept separate there rather than
// refactored onto this copy, to avoid touching a file outside this task's
// scope).
const { PIXEL_FONT } = require('./weather/font');
// rgbMatrixDriver's _buildFaceBuffer() mirrors face 0's whole image
// left-right in '2d' mode only (a real-hardware fix for that single
// panel's physical mounting - see that function's module comment),
// which flips text backwards as a side effect; cube mode has no such
// mirror on face 0 and must not get this compensation. Same fix/same
// verification approach as radio/font.js's drawGlyph(): a local mirror
// within each glyph's 3px box (col -> 2-col), gated on
// core.panelMode==='2d', leaving su (the per-character advance) alone.
function drawGlyph3x5(core, face, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  const S = core.SIZE;
  const mirror = core.panelMode === '2d';
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const localCol = mirror ? (2 - col) : col;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const u = su + localCol * scale + sx, v = sv + row * scale + sy;
          if (u < 0 || u >= S || v < 0 || v >= S) continue;
          core.setFaceLED(face, u, v, r, g, b);
        }
      }
    }
  }
  return 4 * scale;
}
function textWidth3x5(str, scale) { return str.length * 4 * scale - scale; }
function drawLinesCentered3x5(core, face, lines, scale, r, g, b) {
  const S = core.SIZE;
  const lineH = 6 * scale;
  const totalH = lines.length * lineH;
  let sv = Math.round((S - totalH) / 2);
  for (const line of lines) {
    let su = Math.round((S - textWidth3x5(line, scale)) / 2);
    for (const ch of line) su += drawGlyph3x5(core, face, ch, su, sv, scale, r, g, b);
    sv += lineH;
  }
}

// ═══════════════════════════════════════════════════
//  Word cascade — shared text-reveal engine, ported verbatim (math
//  unchanged) from effects-core.js lines ~2082-2175 (WC_FONT/WC_CHAR_W/
//  WC_LINE_H/wcWordDelay/wcDrawGlyph/wcInit/wcStep/wcDrawToFace/wcTagQA).
//  Used by joke.js/trivia.js/otd.js - words appear one at a time filling
//  rows top-down; once the face is full, rows shift up as new lines arrive.
//  Only the plumbing changed: wcDrawGlyph/wcDrawToFace take `core` (for
//  SIZE/faceMap/colBuf) instead of reading bare globals, matching every
//  other _shared.js helper's convention.
// ═══════════════════════════════════════════════════
const WC_FONT = {
  '0': [6, 9, 9, 9, 9, 9, 6], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 1, 2, 4, 8, 8, 15], '3': [14, 1, 6, 1, 1, 9, 6],
  '4': [2, 6, 10, 10, 15, 2, 2], '5': [15, 8, 14, 1, 1, 9, 6], '6': [6, 8, 8, 14, 9, 9, 6], '7': [15, 1, 2, 2, 4, 4, 4],
  '8': [6, 9, 9, 6, 9, 9, 6], '9': [6, 9, 9, 7, 1, 1, 6],
  A: [6, 9, 9, 15, 9, 9, 9], B: [14, 9, 9, 14, 9, 9, 14], C: [7, 8, 8, 8, 8, 8, 7], D: [12, 10, 9, 9, 9, 10, 12],
  E: [15, 8, 8, 14, 8, 8, 15], F: [15, 8, 8, 14, 8, 8, 8], G: [7, 8, 8, 11, 9, 9, 7], H: [9, 9, 9, 15, 9, 9, 9],
  I: [14, 4, 4, 4, 4, 4, 14], J: [3, 1, 1, 1, 1, 9, 6], K: [9, 10, 12, 8, 12, 10, 9], L: [8, 8, 8, 8, 8, 8, 15],
  M: [9, 13, 11, 9, 9, 9, 9], N: [9, 13, 11, 11, 9, 9, 9], O: [6, 9, 9, 9, 9, 9, 6], P: [14, 9, 9, 14, 8, 8, 8],
  Q: [6, 9, 9, 9, 11, 9, 7], R: [14, 9, 9, 14, 12, 10, 9], S: [7, 8, 8, 6, 1, 1, 14], T: [15, 4, 4, 4, 4, 4, 4],
  U: [9, 9, 9, 9, 9, 9, 6], V: [9, 9, 9, 9, 9, 6, 2], W: [9, 9, 9, 9, 11, 13, 9], X: [9, 9, 6, 6, 6, 9, 9],
  Y: [9, 9, 6, 2, 2, 2, 2], Z: [15, 1, 2, 4, 8, 8, 15],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 0, 4, 8], "'": [4, 4, 0, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], '?': [6, 9, 2, 2, 4, 0, 4], '!': [4, 4, 4, 4, 4, 0, 4], ':': [0, 4, 0, 0, 4, 0, 0],
  ';': [0, 4, 0, 0, 4, 8, 0], '-': [0, 0, 0, 15, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
};
const WC_CHAR_W = 5, WC_LINE_H = 8;
function wcWordDelay(word) {
  const base = 0.16;
  const perChar = 0.05;
  const symbols = (word.match(/[^a-zA-Z0-9]/g) || []).length;
  return base + word.length * perChar + symbols * 0.08;
}
function wcDrawGlyph(core, face, ch, su, sv, rgb) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W;
  const { SIZE, faceMap, colBuf } = core;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      const u = su + col, v = sv + (6 - row);
      if (u < 0 || u >= SIZE || v < 0 || v >= SIZE) continue;
      const idx = faceMap[face][v * SIZE + u]; if (idx < 0) continue;
      colBuf[idx * 3] = rgb[0]; colBuf[idx * 3 + 1] = rgb[1]; colBuf[idx * 3 + 2] = rgb[2];
    }
  }
  return WC_CHAR_W;
}
function wcInit(taggedWords) {
  const maxLines = Math.max(1, Math.floor(64 / WC_LINE_H)); // SIZE is fixed at 64 in this port's cube mode (see core.js) - matches the browser's SIZE-based cap in spirit
  return {
    words: taggedWords, idx: 0, cur: [], lines: [], timer: 0, pendingDelay: 0.3,
    done: false, holdTimer: 0, maxLines,
  };
}
function wcStep(state, dt) {
  if (state.done) { state.holdTimer += dt; return; }
  state.timer += dt;
  const maxW = 64;
  while (state.timer >= state.pendingDelay && state.idx < state.words.length) {
    state.timer -= state.pendingDelay;
    const tw = state.words[state.idx++];
    const curW = state.cur.reduce((a, t) => a + t.w.length * WC_CHAR_W, 0) + Math.max(0, state.cur.length - 1) * WC_CHAR_W;
    const addW = (state.cur.length ? WC_CHAR_W : 0) + tw.w.length * WC_CHAR_W;
    if (curW + addW > maxW && state.cur.length) {
      state.lines.push(state.cur);
      state.cur = [tw];
    } else {
      state.cur.push(tw);
    }
    state.pendingDelay = wcWordDelay(tw.w);
    if (state.idx >= state.words.length) state.done = true;
  }
}
function wcDrawToFace(core, state, face) {
  const SIZE = core.SIZE;
  const allLines = state.cur.length ? [...state.lines, state.cur] : [...state.lines];
  const visible = allLines.slice(-state.maxLines);
  const topMargin = 1;
  visible.forEach((line, i) => {
    const sv = (SIZE - 1) - topMargin - 6 - i * WC_LINE_H;
    if (sv + 6 < 0) return;
    const lineW = line.reduce((a, t) => a + t.w.length * WC_CHAR_W, 0) + Math.max(0, line.length - 1) * WC_CHAR_W;
    let su = Math.round((SIZE - lineW) / 2);
    line.forEach((tw) => {
      let u = su;
      for (const ch of tw.w) u += wcDrawGlyph(core, face, ch, u, sv, tw.color);
      su += tw.w.length * WC_CHAR_W + WC_CHAR_W;
    });
  });
}
function wcTagQA(text) {
  const splitIdx = text.indexOf('?');
  const re = /\S+/g;
  const words = []; let m;
  while ((m = re.exec(text))) {
    const isAnswer = splitIdx >= 0 && m.index > splitIdx;
    words.push({ w: m[0], color: isAnswer ? [1, 0.8, 0.27] : [1, 1, 1] });
  }
  return words;
}

// ── Wall-mode siblings of wcInit/wcStep/wcDrawToFace ──────────────────────
// joke.js/trivia.js/otd.js's cascade math is genuinely SIZE-relative:
// wcInit() hardcodes `maxLines = floor(64/WC_LINE_H)` and wcStep()
// hardcodes `maxW = 64` for its word-wrap width - both assume the fixed
// 64x64 cube-face panel the engine was written for, not a parameter core
// already carries. So per the batch brief, these are separate
// wallW/wallH-aware siblings (not a call-the-existing-helper-with-different-
// args reuse) - same wrap/reveal/line-eviction algorithm, just against
// wallW (word-wrap width) and wallH (line-count cap + vertical layout)
// instead of the hardcoded 64. wcDrawGlyphWall/wcDrawToFaceWall similarly
// mirror wcDrawGlyph/wcDrawToFace but write through core.setWallPixel
// across the full wallW x wallH canvas instead of one face's faceMap/SIZE.
function wcInitWall(taggedWords, wallH) {
  const maxLines = Math.max(1, Math.floor(wallH / WC_LINE_H));
  return {
    words: taggedWords, idx: 0, cur: [], lines: [], timer: 0, pendingDelay: 0.3,
    done: false, holdTimer: 0, maxLines,
  };
}
function wcStepWall(state, dt, wallW) {
  if (state.done) { state.holdTimer += dt; return; }
  state.timer += dt;
  const maxW = wallW;
  while (state.timer >= state.pendingDelay && state.idx < state.words.length) {
    state.timer -= state.pendingDelay;
    const tw = state.words[state.idx++];
    const curW = state.cur.reduce((a, t) => a + t.w.length * WC_CHAR_W, 0) + Math.max(0, state.cur.length - 1) * WC_CHAR_W;
    const addW = (state.cur.length ? WC_CHAR_W : 0) + tw.w.length * WC_CHAR_W;
    if (curW + addW > maxW && state.cur.length) {
      state.lines.push(state.cur);
      state.cur = [tw];
    } else {
      state.cur.push(tw);
    }
    state.pendingDelay = wcWordDelay(tw.w);
    if (state.idx >= state.words.length) state.done = true;
  }
}
function wcDrawGlyphWall(core, ch, su, sv, rgb) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W;
  const { wallW: W, wallH: H } = core;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      const u = su + col, v = sv + (6 - row);
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      core.setWallPixel(u, v, rgb[0], rgb[1], rgb[2]);
    }
  }
  return WC_CHAR_W;
}
function wcDrawToFaceWall(core, state, topMarginRows) {
  const { wallW: W, wallH: H } = core;
  const allLines = state.cur.length ? [...state.lines, state.cur] : [...state.lines];
  const visible = allLines.slice(-state.maxLines);
  const topMargin = topMarginRows == null ? 1 : topMarginRows;
  visible.forEach((line, i) => {
    const sv = (H - 1) - topMargin - 6 - i * WC_LINE_H;
    if (sv + 6 < 0) return;
    const lineW = line.reduce((a, t) => a + t.w.length * WC_CHAR_W, 0) + Math.max(0, line.length - 1) * WC_CHAR_W;
    let su = Math.round((W - lineW) / 2);
    line.forEach((tw) => {
      let u = su;
      for (const ch of tw.w) u += wcDrawGlyphWall(core, ch, u, sv, tw.color);
      su += tw.w.length * WC_CHAR_W + WC_CHAR_W;
    });
  });
}

// HTML-entity decoder for Open Trivia DB's `encode` (default "html
// entities") mode - the browser uses a throwaway <textarea>.innerHTML
// trick (wcDecodeEntities) which has no DOM equivalent here. Numeric
// entities (&#039;, &#233;, decimal or &#xNN; hex) are decoded generically;
// named entities are covered by a lookup table of what OpenTDB actually
// emits in practice (its question/category/answer text is drawn from a
// community-maintained trivia set - ampersand, quotes and a handful of
// accented Latin letters are what shows up, not the full HTML5 entity set).
const WC_NAMED_ENTITIES = {
  quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  aacute: 'á', agrave: 'à', acirc: 'â', auml: 'ä', aring: 'å',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  ntilde: 'ñ', ccedil: 'ç', ndash: '-', mdash: '-', hellip: '...',
  rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
};
function wcDecodeEntities(str) {
  return String(str)
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (WC_NAMED_ENTITIES[name] !== undefined ? WC_NAMED_ENTITIES[name] : m));
}

module.exports = {
  cubePx, fwPx, tronMove, surfIdx, FW_FACES, FW_FONT, FW_CHAR_W, VID_FACE_ORDER, getLocalGravity,
  galleryInitFaceState, gallerySlideshowStep, galleryApplyToFace, galleryApplyBlendToFace,
  galleryApplyToWall, galleryApplyBlendToWall,
  loadImageForPixels, drawLinesCentered3x5,
  WC_FONT, WC_CHAR_W, WC_LINE_H, wcWordDelay, wcDrawGlyph, wcInit, wcStep, wcDrawToFace, wcTagQA, wcDecodeEntities,
  wcInitWall, wcStepWall, wcDrawGlyphWall, wcDrawToFaceWall,
};
