// Custom Cube - per-face effect composition. Ported from effects-scenes.js's
// effectCustomCube() (lines 6-69), which itself reads perFaceEffect-shaped
// data via _customCubeData (see customCubeConfig.js's module comment for how
// pi-native unifies the browser's draft/active split into one `faces` array).
//
// Per-face composition mechanism - simpler than the original's per-effect
// global-swapping:
//
//   The browser had no generic "effect options" store, so to render one
//   face's assigned effect with its saved sub-options it had to save/
//   restore a handful of specific global variables by hand (fwTextOn/
//   fwTextPixels/..., rainStyle - see effects-scenes.js lines 37-46,59-60),
//   one `if` per effect that happened to have swappable state, silently
//   missing anything not on that hardcoded list.
//
//   pi-native's ported effects already read their options uniformly via
//   core.effectOptions[effectKey] (see wsServer.js's setEffectOption /
//   rain.js, lightspeed.js, etc.) - so instead of per-effect swap logic,
//   this just temporarily overrides the WHOLE core.effectOptions object for
//   the duration of one face's render: `core.effectOptions = {
//   ...savedOptions, [faceConfig.effect]: faceConfig.opts }`. Works
//   uniformly for every ported effect's options, not just a hardcoded
//   subset, and needs no per-effect knowledge here at all.
//
//   Face-restricted colBuf accumulation is unchanged from the original:
//   each face's assigned effect still writes the WHOLE colBuf (it has no
//   idea it's being composited), so after each face's render only that
//   face's own LEDs (via core.faceMap[f]) are copied into an accumulator;
//   once all 6 faces are done, colBuf = accumulator. Faces with no
//   assignment (null, or effect:'none') are simply skipped, leaving them
//   black in the accumulator.
//
// core.customCubeFaces is set once per tick by app.js (mirrors
// core.effectOptions/core.overlaysState - see that file's comment) to
// state.customCube.faces, the persisted "current assignment" from
// customCubeConfig.js.
//
// 2D/wall-mode fallback: Custom Cube is inherently a 6-face concept. In
// core.panelMode==='2d' there's only face 0 (see core.js/app.js - a single
// flat panel has no faceMap[1..5]), so this just renders face 0's assigned
// effect (if any) directly across the whole panel - a sensible degradation,
// not a crash, matching the "no WALL_EFFECTS entry, canvas left untouched"
// pattern already established for every other effect (see effects/index.js's
// module comment) for wall mode specifically.
const { applyFaceOverlays } = require('./overlays');
const { OV_DEFAULTS } = require('./overlays');

// Lazy require of the EFFECTS registry to dodge the require cycle: index.js
// requires this file to build EFFECTS, so a top-level `require('./index')`
// here would see an incomplete (still-being-built) module.exports. By the
// time this function actually RUNS (a real animation tick, always after
// index.js has finished loading and require()'s module cache has the
// complete exports object), the cycle is no longer a problem - same trick
// as any other lazy-require-to-break-a-cycle pattern.
let _effects = null;
function getEffects() {
  if (!_effects) _effects = require('./index').EFFECTS; // eslint-disable-line global-require
  return _effects;
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
    if (!faceConfig || !faceConfig.effect || faceConfig.effect === 'none') return;
    const rendered = renderFaceEffect(core, dt, faceConfig, savedOptions);
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

  for (let f = 0; f < 6; f += 1) {
    const faceConfig = faces[f];
    if (!faceConfig || !faceConfig.effect || faceConfig.effect === 'none') continue; // eslint-disable-line no-continue

    for (let i = 0; i < N * 3; i += 1) colBuf[i] = 0;
    const rendered = renderFaceEffect(core, dt, faceConfig, savedOptions);
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
