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
