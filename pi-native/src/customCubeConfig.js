// Persisted Custom Cube state, same load/save/validate-with-fallback pattern
// as panelConfig.js. Face changes apply immediately (no draft/active split);
// `library` holds named snapshots of `faces`.
// Shape: { faces: [FaceConfig|null, ...6], library: [{name, faces}, ...] }
//   FaceConfig = { effect: string, overlayKeys: string[], opts: object }
const fs = require('fs');
const { readSectionJson, writeSection } = require('./settingsStore'); // CONFIG_PATH is now only the pre-settings.json legacy file, imported once
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
    const raw = readSectionJson('customCube', CONFIG_PATH);
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
  writeSection('customCube', config);
}

module.exports = {
  load, save, isValidFaceConfig, isValidFaces, isValidLibraryEntry, isValidLibrary,
  NUM_FACES, DEFAULT_CONFIG, CONFIG_PATH,
};
