// Persisted "Custom Cube" state, mirroring panelConfig.js's/alarmConfig.js's
// exact load()/save()/validate-on-load-with-fallback pattern (see
// panelConfig.js's module comment for why: survive a restart, JSON file on
// disk next to this one, gitignored).
//
// Ported from the browser's Panel Editor (ui.js's perFaceEffect[0..5] +
// buildPanelEditor()) and the Custom Cube effect's saved-cube library
// (effects-scenes.js's _customCubeData, ui.js's peGetLibrary()/
// peSaveLibrary() - localStorage key 'ledcube_cubes'). The browser split
// this into TWO pieces of state: perFaceEffect (the live editor "draft")
// and _customCubeData (a snapshot loaded into the running Custom Cube
// effect via its own #cc-select dropdown) - editing the draft never
// affected what was actually rendering until you explicitly picked it again
// from the Custom Cube effect's own panel.
//
// pi-native unifies these into ONE `faces` array: whatever you set via
// setFaceEffect/setFaceOpts/setFaceOverlays takes effect immediately, same
// as every other option in this project's setEffectOption pattern - there's
// no separate "draft vs running" UI concept here to justify the original's
// extra indirection. `library` is unchanged in spirit: named snapshots of
// `faces` you can save/load/delete, now stored server-side instead of
// browser localStorage (there's no browser-side persistence on the Pi).
//
// Data shape:
//   { faces: [FaceConfig|null, ...6], library: [{name, faces:[FaceConfig|null, ...6]}, ...] }
//   FaceConfig = { effect: string, overlayKeys: string[], opts: object }
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'custom-cube-config.json');
const NUM_FACES = 6;

// Structural validation only (does not know about the EFFECTS/OVERLAY_KEYS
// registries - that's wsServer.js's job, same split as alarmConfig.isValidAlarm
// vs wsServer.js's _sanitizeAlarm doing the registry-aware checks on top).
function isValidFaceConfig(fc) {
  if (fc === null) return true; // unassigned face
  if (!fc || typeof fc !== 'object') return false;
  if (typeof fc.effect !== 'string' || !fc.effect) return false;
  if (!Array.isArray(fc.overlayKeys) || fc.overlayKeys.some((k) => typeof k !== 'string')) return false;
  if (!fc.opts || typeof fc.opts !== 'object' || Array.isArray(fc.opts)) return false;
  return true;
}

function isValidFaces(faces) {
  return Array.isArray(faces) && faces.length === NUM_FACES && faces.every(isValidFaceConfig);
}

function isValidLibraryEntry(entry) {
  return !!entry && typeof entry === 'object' && typeof entry.name === 'string' && !!entry.name && isValidFaces(entry.faces);
}

function isValidLibrary(library) {
  return Array.isArray(library) && library.every(isValidLibraryEntry);
}

function emptyFaces() {
  return [null, null, null, null, null, null];
}

const DEFAULT_CONFIG = { faces: emptyFaces(), library: [] };

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const faces = isValidFaces(parsed.faces) ? parsed.faces : emptyFaces();
    const library = isValidLibrary(parsed.library) ? parsed.library : [];
    return { faces, library };
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file, same spirit as
    // panelConfig.load()/alarmConfig.load()'s catch branches.
    return { faces: emptyFaces(), library: [] };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
  load, save, isValidFaceConfig, isValidFaces, isValidLibraryEntry, isValidLibrary,
  NUM_FACES, DEFAULT_CONFIG, CONFIG_PATH,
};
