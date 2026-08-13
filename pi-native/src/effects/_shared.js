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
function drawGlyph3x5(core, face, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  const S = core.SIZE;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const u = su + col * scale + sx, v = sv + row * scale + sy;
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

module.exports = {
  cubePx, fwPx, tronMove, surfIdx, FW_FACES, VID_FACE_ORDER, getLocalGravity,
  galleryInitFaceState, gallerySlideshowStep, galleryApplyToFace, galleryApplyBlendToFace,
  loadImageForPixels, drawLinesCentered3x5,
};
