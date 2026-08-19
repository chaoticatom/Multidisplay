// Persisted library of named "wall mode" panel layouts, mirroring
// customCubeConfig.js's/panelConfig.js's exact load()/save()/
// validate-on-load-with-fallback pattern (see panelConfig.js's module
// comment for why: survive a restart, JSON file on disk next to this one,
// gitignored).
//
// A real request: wiring 6 physical panels into an arbitrary wall shape (L,
// star, long strip, ...) via the "+"-drag layout editor (wireWallToolbar()
// in app.js) is fiddly to redo from scratch - this lets you name and save
// the current config.panels grid arrangement and recall it later, the same
// "named snapshot library" shape as Custom Cube's saved cubes, but for the
// PHYSICAL PANEL POSITIONS themselves rather than what each face renders.
//
// Data shape: { library: [{name, panels:[{gx,gy}, ...]}, ...] }
const fs = require('fs');
const path = require('path');
const { isValidPanels } = require('./panelConfig');

const CONFIG_PATH = path.join(__dirname, '..', 'wall-layout-config.json');

function isValidLibraryEntry(entry) {
  return !!entry && typeof entry === 'object' && typeof entry.name === 'string' && !!entry.name && isValidPanels(entry.panels);
}

function isValidLibrary(library) {
  return Array.isArray(library) && library.every(isValidLibraryEntry);
}

const DEFAULT_CONFIG = { library: [] };

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const library = isValidLibrary(parsed.library) ? parsed.library : [];
    return { library };
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file.
    return { library: [] };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, isValidLibraryEntry, isValidLibrary, DEFAULT_CONFIG, CONFIG_PATH };
