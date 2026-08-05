// Persistent panel-layout config, mirroring the browser's cube-size picker
// (8x8 / 16x16 / 64x64 / 2D) - a settings UI users already know from the
// browser, reused here instead of inventing a new one. All 3 cube sizes
// mean the same physical layout (6 faces); only "2D" means something
// different (1 flat panel) - see PANEL_MODE_2D below.
//
// Persisted to disk (panel-config.json next to this file) so it survives a
// restart, and sent to every WS client on connect (see wsServer.js) so a
// freshly-connected remote browser's UI reflects whatever was last chosen
// on the Pi, rather than defaulting to something stale.
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'panel-config.json');
const VALID_SIZES = [8, 16, 64];
// Defaults to "2d" (1 panel) rather than the full 6-face cube - a fresh
// install shouldn't assume you've already got all 6 panels wired up and
// FACE_LAYOUT calibrated; safer to start from the simplest possible
// physical setup and have you explicitly opt into "cube" once you're
// ready, via setPanelConfig (see wsServer.js).
const DEFAULT_CONFIG = { size: 64, mode: '2d' }; // mode: 'cube' (6 faces) | '2d' (1 panel)

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!VALID_SIZES.includes(parsed.size) || (parsed.mode !== 'cube' && parsed.mode !== '2d')) {
      throw new Error('invalid stored config');
    }
    return parsed;
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file.
    return { ...DEFAULT_CONFIG };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, VALID_SIZES, DEFAULT_CONFIG, CONFIG_PATH };
