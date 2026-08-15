// Persistent panel-layout config, mirroring the browser's cube-size picker
// (8x8 / 16x16 / 64x64 / 2D) - a settings UI users already know from the
// browser, reused here instead of inventing a new one. All 3 cube sizes
// mean the same physical layout (6 faces); "2D" means something different
// (1 flat panel); "wall" is a pi-native-only addition on top of that - an
// arbitrary grid of N flat panels stitched into one big canvas (see
// core.js's initWall()/setWallPixel(), rgbMatrixDriver.js's wall topology).
//
// Persisted to disk (panel-config.json next to this file) so it survives a
// restart, and sent to every WS client on connect (see wsServer.js) so a
// freshly-connected remote browser's UI reflects whatever was last chosen
// on the Pi, rather than defaulting to something stale.
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'panel-config.json');
const VALID_SIZES = [8, 16, 64];
const VALID_MODES = ['cube', '2d', 'wall'];
// Wall grid is capped at the same 2-wide x 3-tall physical topology already
// wired for cube mode (rgbMatrixDriver's chainLength:2, parallel:3) - a
// wall panel just reuses that same 6-panel wiring, read as a flat grid
// instead of 6 cube faces, rather than needing separate wiring/topology.
const WALL_MAX_COLS = 2, WALL_MAX_ROWS = 3;
// Defaults to "2d" (1 panel) rather than the full 6-face cube - a fresh
// install shouldn't assume you've already got all 6 panels wired up and
// FACE_LAYOUT calibrated; safer to start from the simplest possible
// physical setup and have you explicitly opt into "cube"/"wall" once
// you're ready, via setPanelConfig (see wsServer.js).
// How many of the 6 cube faces are ACTUALLY wired to real hardware, as
// opposed to the always-full-6-face browser preview - independent of
// `mode`/`size`. A real report: cube mode with only 1 physical panel
// wired gave no indication in the UI that 5 of the 6 faces being shown
// in the 3D preview are pure simulation, not anything a real panel would
// display. Only meaningful in mode==='cube' (rgbMatrixDriver.js's
// FACE_LAYOUT always assumes the full 6 when mode is 'cube' - this is a
// purely informational flag surfaced in the UI, it doesn't change what
// the driver actually tries to push). Defaults to 6 (assume fully wired)
// rather than 1, matching this project's existing "assume the more
// capable setup, let the user dial back" convention for VALID_SIZES/
// DEFAULT_CONFIG.mode's own reasoning.
const DEFAULT_CONFIG = { size: 64, mode: '2d', panels: [{ gx: 0, gy: 0 }], physicalCubePanels: 6 };

function isValidPhysicalCubePanels(n) {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

// Shared by load() and wsServer.js's setPanelConfig/addPanel/
// setPanelPositions handlers, so a malformed layout can never reach
// core.initWall() or the driver.
function isValidPanels(panels) {
  if (!Array.isArray(panels) || panels.length === 0 || panels.length > WALL_MAX_COLS * WALL_MAX_ROWS) return false;
  const seen = new Set();
  for (const p of panels) {
    if (!p || !Number.isInteger(p.gx) || !Number.isInteger(p.gy)) return false;
    if (p.gx < 0 || p.gx >= WALL_MAX_COLS || p.gy < 0 || p.gy >= WALL_MAX_ROWS) return false;
    const key = p.gx + ',' + p.gy;
    if (seen.has(key)) return false; // no two panels on the same cell
    seen.add(key);
  }
  return true;
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!VALID_SIZES.includes(parsed.size) || !VALID_MODES.includes(parsed.mode)) {
      throw new Error('invalid stored config');
    }
    if (!isValidPanels(parsed.panels)) parsed.panels = [...DEFAULT_CONFIG.panels];
    if (!isValidPhysicalCubePanels(parsed.physicalCubePanels)) parsed.physicalCubePanels = DEFAULT_CONFIG.physicalCubePanels;
    return parsed;
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file.
    return { ...DEFAULT_CONFIG, panels: [...DEFAULT_CONFIG.panels] };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, VALID_SIZES, VALID_MODES, WALL_MAX_COLS, WALL_MAX_ROWS, isValidPanels, isValidPhysicalCubePanels, DEFAULT_CONFIG, CONFIG_PATH };
