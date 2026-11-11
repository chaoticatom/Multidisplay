// Custom Cube: a different effect on each face. Each face's effect renders the
// whole colBuf with core.effectOptions temporarily set to that face's opts,
// then only that face's LEDs (core.faceMap[f]) are copied into an accumulator.
// Unassigned faces stay black. In 2D mode only face 0 exists, so its effect
// fills the panel. core.customCubeFaces is set each tick from state.customCube.
const { applyFaceOverlays } = require('./overlays');
const { OV_DEFAULTS } = require('./overlays');

// Lazy require of the EFFECTS registry to dodge the require cycle: index.js
// requires this file to build EFFECTS, so a top-level `require('./index')`
// here would see an incomplete (still-being-built) module.exports. By the
// time this function actually RUNS (a real animation tick, always after
// index.js has finished loading and require()'s module cache has the
// complete exports object), the cycle is no longer a problem - same trick
// as any other lazy-require-to-break-a-cycle pattern.
let _effects = null, _wallEffects = null;
function getEffects() {
  if (!_effects) _effects = require('./index').EFFECTS; // eslint-disable-line global-require
  return _effects;
}
function getWallEffects() {
  if (!_wallEffects) _wallEffects = require('./index').WALL_EFFECTS; // eslint-disable-line global-require
  return _wallEffects;
}

// ── Joining faces. Faces that share an effect are drawn together from the
// effect's flat (wall) version, so it works fully on a single face instead
// of showing one slice of a cube-wide picture:
//   fit  - one picture across all of them, side by side (the default)
//   copy - the whole picture on each of them
//   wrap - the cube version, wrapping round the cube (how it always was)
// Side faces in order round the cube, then top and bottom.
const RING = [0, 2, 1, 3, 4, 5];
const JOINS = ['fit', 'copy', 'wrap'];
const _canvases = new Map(); // "<effect>:<cols>x<size>" -> a CubeCore used as a flat canvas
// One canvas per effect: each group's picture is kept until its faces are
// copied (sharing one by size made every face show the last effect drawn).
function canvasFor(effectKey, cols, size) {
  const key = effectKey + ':' + cols + 'x' + size;
  if (!_canvases.has(key) && _canvases.size >= 12) _canvases.clear(); // forget old ones now and then
  let c = _canvases.get(key);
  if (!c) {
    const { CubeCore } = require('../core'); // eslint-disable-line global-require
    c = Object.create(CubeCore.prototype); // only the wall fields are needed, not the cube geometry
    c.SIZE = size; c.sfx = []; c.t = 0;
    c.initWall(Array.from({ length: cols }, (_, gx) => ({ gx, gy: 0 })), size);
    _canvases.set(key, c);
  }
  return c;
}
// Renders `fnKey`'s wall version on a canvas `cols` panels wide; returns the
// canvas, or null when there's no wall version (the caller falls back).
function renderFlat(core, dt, fnKey, cols, opts, savedOptions) {
  const fn = getWallEffects()[fnKey];
  if (!fn || fnKey === 'custom_cube') return null;
  const c = canvasFor(fnKey, cols, core.SIZE);
  // Share settings and music with the real core (each canvas keeps its own clock).
  c.audio = core.audio; c.quality = core.quality; c.panelMode = 'wall'; c.overlaysState = core.overlaysState;
  c.effectOptions = { ...savedOptions, [fnKey]: opts || {} };
  c.wallBuf.fill(0);
  fn(c, dt);
  return c;
}
// Copies panel `col` of a flat canvas onto cube face `f` in core.colBuf.
// Face rows count up from the bottom; the canvas counts down from the top.
function blitFace(core, f, canvas, col) {
  const S = core.SIZE, map = core.faceMap[f], buf = core.colBuf, src = canvas.wallBuf, W = canvas.wallW;
  for (let v = 0; v < S; v += 1) {
    const y = S - 1 - v;
    for (let u = 0; u < S; u += 1) {
      const idx = map[v * S + u];
      if (idx < 0) continue; // eslint-disable-line no-continue
      const o = (y * W + col * S + u) * 3;
      buf[idx * 3] = src[o]; buf[idx * 3 + 1] = src[o + 1]; buf[idx * 3 + 2] = src[o + 2];
    }
  }
}

// Renders one face's assigned effect into core.colBuf (full-buffer, like
// every other effect), using a temporarily-overridden core.effectOptions
// scoped to just that face's saved opts - see module comment.
function renderFaceEffect(core, dt, faceConfig, savedOptions) {
  const EFFECTS = getEffects();
  const fn = EFFECTS[faceConfig.effect];
  // Guard against an effect key that no longer exists (e.g. a saved cube
  // referencing an effect that's since been removed) and against
  // 'custom_cube' itself (would recurse infinitely).
  if (!fn || faceConfig.effect === 'custom_cube') return false;
  core.effectOptions = { ...savedOptions, [faceConfig.effect]: faceConfig.opts || {} };
  fn(core, dt);
  core.effectOptions = savedOptions;
  return true;
}

function effectCustomCube(core, dt) {
  const { N, colBuf } = core;
  const overlayState = core.overlaysState || OV_DEFAULTS;
  const savedOptions = core.effectOptions;

  if (core.panelMode === '2d') {
    for (let i = 0; i < N * 3; i += 1) colBuf[i] = 0;
    const faceConfig = core.customCubeFaces && core.customCubeFaces[0];
    if (!faceConfig || !faceConfig.effect) return;
    // 'none' with overlays: just the overlays, over black.
    const rendered = faceConfig.effect === 'none' ? true : renderFaceEffect(core, dt, faceConfig, savedOptions);
    if (rendered && faceConfig.overlayKeys && faceConfig.overlayKeys.length) {
      applyFaceOverlays(core, 0, faceConfig.overlayKeys, dt, overlayState);
    }
    return;
  }

  const faces = core.customCubeFaces;
  for (let i = 0; i < N * 3; i += 1) colBuf[i] = 0;
  if (!faces) return;

  const accumBuf = new Float32Array(N * 3);
  const SIZE = core.SIZE;
  const join = JOINS.includes(core.customCubeJoin) ? core.customCubeJoin : 'fit';

  // Faces sharing an effect, in order round the cube; rendered flat once each.
  const flat = new Map(); // face -> { canvas, col }
  if (join !== 'wrap') {
    const groups = new Map();
    for (const f of RING) {
      const fc = faces[f];
      if (!fc || !fc.effect || fc.effect === 'none') continue; // eslint-disable-line no-continue
      if (!groups.has(fc.effect)) groups.set(fc.effect, []);
      groups.get(fc.effect).push(f);
    }
    for (const [key, list] of groups) {
      const cols = join === 'copy' ? 1 : list.length;
      const canvas = renderFlat(core, dt, key, cols, faces[list[0]].opts, savedOptions);
      if (canvas) list.forEach((f, i) => flat.set(f, { canvas, col: join === 'copy' ? 0 : i }));
    }
  }

  for (let f = 0; f < 6; f += 1) {
    const faceConfig = faces[f];
    if (!faceConfig || !faceConfig.effect) continue; // eslint-disable-line no-continue
    if (faceConfig.effect === 'none' && !(faceConfig.overlayKeys && faceConfig.overlayKeys.length)) continue; // eslint-disable-line no-continue

    for (let i = 0; i < N * 3; i += 1) colBuf[i] = 0;
    // 'none' with overlays: just the overlays, over black.
    const fl = flat.get(f);
    if (fl) blitFace(core, f, fl.canvas, fl.col);
    const rendered = faceConfig.effect === 'none' || fl ? true : renderFaceEffect(core, dt, faceConfig, savedOptions);
    if (!rendered) continue; // eslint-disable-line no-continue

    if (faceConfig.overlayKeys && faceConfig.overlayKeys.length) {
      applyFaceOverlays(core, f, faceConfig.overlayKeys, dt, overlayState);
    }

    for (let j = 0; j < SIZE * SIZE; j += 1) {
      const idx = core.faceMap[f][j];
      if (idx >= 0) {
        accumBuf[idx * 3] = colBuf[idx * 3];
        accumBuf[idx * 3 + 1] = colBuf[idx * 3 + 1];
        accumBuf[idx * 3 + 2] = colBuf[idx * 3 + 2];
      }
    }
  }

  for (let i = 0; i < N * 3; i += 1) colBuf[i] = accumBuf[i];
}

module.exports = effectCustomCube;
module.exports.JOINS = JOINS;
