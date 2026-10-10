// Persistent panel-layout config: cube sizes (all 6 faces), "2D" (one flat
// panel) or "wall" (a grid of flat panels stitched into one canvas). Saved to
// panel-config.json so it survives a restart, and sent to every WS client on
// connect so the UI shows what was last chosen on the Pi.
const fs = require('fs');
const { readSectionJson, writeSection } = require('./settingsStore'); // CONFIG_PATH is now only the pre-settings.json legacy file, imported once
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'panel-config.json');
const VALID_SIZES = [8, 16, 64];
const VALID_MODES = ['cube', '2d', 'wall'];
// Wall grid: any rectangular arrangement of up to WALL_MAX_PANELS panels
// (the hardware budget), e.g. 1x6, 6x1 or 2x3. COLS/ROWS bound each axis;
// the panel count is checked separately. The driver derives chainLength/
// parallel from the layout, so the real wiring must match, and changes take
// effect after a restart.
const WALL_MAX_COLS = 6, WALL_MAX_ROWS = 6, WALL_MAX_PANELS = 6;
// Defaults to "2d" (1 panel) rather than the full 6-face cube - a fresh
// install shouldn't assume you've already got all 6 panels wired up and
// FACE_LAYOUT calibrated; safer to start from the simplest possible
// physical setup and have you explicitly opt into "cube"/"wall" once
// you're ready, via setPanelConfig (see wsServer.js).
const DEFAULT_CONFIG = { size: 64, mode: '2d', panels: [{ gx: 0, gy: 0 }] };

// ---------------------------------------------------------------------------
// FACE_LAYOUT: cube mode's fixed 2x3 physical wiring (see rgbMatrixDriver.js
// for how it was calibrated). Kept here, not in the driver (which needs the
// native addon), so the driver and the browser "Identify Panels" helper share
// one copy. Faces: 0=Front 1=Back 2=Right 3=Left 4=Top 5=Bottom.
const FACE_NAMES = ['Front', 'Back', 'Right', 'Left', 'Top', 'Bottom'];
const FACE_LAYOUT = [
  // Front/Back swapped from the original chain:0 pos:0/pos:1 guess - a real
  // report ("front and back are swapped": Front showed Back's content and
  // vice versa) - the physical panel at chain 0 pos 0 is actually wired as
  // Back, not Front.
  { chain: 0, pos: 1 }, // 0 Front
  { chain: 0, pos: 0 }, // 1 Back
  { chain: 1, pos: 0 }, // 2 Right
  { chain: 1, pos: 1 }, // 3 Left
  // rotateCW90 - a real report: "on cube mode, the top panel is reversed,
  // the flow from side panels does not flow to top correctly" - a 180°
  // flip was tried first and wasn't right; a single 90° clockwise turn
  // matched the follow-up report. Classic cause: the physical Top panel
  // mounted in a different orientation than the 4 vertical side panels.
  { chain: 2, pos: 0, rotateCW90: true }, // 4 Top
  { chain: 2, pos: 1 }, // 5 Bottom
];

// Shared by load() and wsServer.js's setPanelConfig/addPanel/
// setPanelPositions handlers, so a malformed layout can never reach
// core.initWall() or the driver.
function isValidPanels(panels) {
  if (!Array.isArray(panels) || panels.length === 0 || panels.length > WALL_MAX_PANELS) return false;
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

// 'Panel 2D' and a one-panel wall are the same physical setup, so there is
// one flat mode: a '2d' config (saved by older versions, or sent by an old
// page) becomes a one-panel wall. Flat panels then always run the wall
// versions of effects, whether there's one panel or several.
function normalizeFlat(config) {
  if (config && config.mode === '2d') return { ...config, mode: 'wall', panels: [{ gx: 0, gy: 0 }] };
  // Shift the layout so it starts at the top-left cell. The hardware chain
  // always starts there: removing the first panel used to leave e.g. one
  // panel at (0,2), which the driver drew on a chain position with no
  // panel attached - a blank physical display.
  if (config && config.mode === 'wall' && Array.isArray(config.panels) && config.panels.length) {
    const mx = Math.min(...config.panels.map((p) => p.gx)), my = Math.min(...config.panels.map((p) => p.gy));
    if (mx || my) return { ...config, panels: config.panels.map((p) => ({ gx: p.gx - mx, gy: p.gy - my })) };
  }
  return config;
}

function load() {
  try {
    const raw = readSectionJson('panel', CONFIG_PATH);
    const parsed = JSON.parse(raw);
    if (!VALID_SIZES.includes(parsed.size) || !VALID_MODES.includes(parsed.mode)) {
      throw new Error('invalid stored config');
    }
    if (!isValidPanels(parsed.panels)) parsed.panels = [...DEFAULT_CONFIG.panels];
    return normalizeFlat(parsed);
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file.
    return normalizeFlat({ ...DEFAULT_CONFIG, panels: [...DEFAULT_CONFIG.panels] });
  }
}

function save(config) {
  writeSection('panel', config);
}

module.exports = { normalizeFlat, load, save, VALID_SIZES, VALID_MODES, WALL_MAX_COLS, WALL_MAX_ROWS, WALL_MAX_PANELS, isValidPanels, DEFAULT_CONFIG, CONFIG_PATH, FACE_LAYOUT, FACE_NAMES };
