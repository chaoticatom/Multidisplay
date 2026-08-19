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
// Wall grid: up to WALL_MAX_PANELS physical panels total (matches this
// project's 6-panel hardware budget - same count cube mode's 6 faces
// use), arranged in ANY rectangular shape up to WALL_MAX_COLS x
// WALL_MAX_ROWS - a straight 1-wide x 6-tall or 6-wide x 1-tall row is
// just as valid as a 2x3 block. Unlike cube mode (a FIXED 2x3 physical
// topology via rgbMatrixDriver's FACE_LAYOUT, which this does NOT
// change), wall mode's rgbMatrixDriver.js now computes chainLength/
// parallel dynamically from the actual panels layout at driver
// construction time - real hardware wiring must actually match whatever
// shape gets chosen (same "takes effect after a restart" caveat as any
// other panel mode/topology change - see rgbMatrixDriver.js's module
// comment). WALL_MAX_COLS/WALL_MAX_ROWS are the per-axis bound (generous
// enough to allow any single-row/single-column arrangement of up to
// WALL_MAX_PANELS); WALL_MAX_PANELS is the actual hardware panel count
// cap, checked separately since a WALL_MAX_COLS x WALL_MAX_ROWS bounding
// box on its own would permit far more than WALL_MAX_PANELS cells.
const WALL_MAX_COLS = 6, WALL_MAX_ROWS = 6, WALL_MAX_PANELS = 6;
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

// ---------------------------------------------------------------------------
// FACE_LAYOUT - cube mode's fixed 2x3 physical wiring (chain/pos - see
// rgbMatrixDriver.js's module comment for the full explanation and the
// real-hardware reports that calibrated these values). Lives here rather
// than in rgbMatrixDriver.js (a hardware/Node-only file requiring the
// native `rpi-led-matrix` addon, which can't be pulled into the browser
// sim bundle) so it's ONE source of truth both the real driver and the
// browser-side "Identify Panels" helper (src/effects/identify.js) can read
// - duplicating this table risked exactly the kind of silent-drift bug
// this project has hit before when the same data lived in two places.
// FACE_NAMES mirrors app.js's own copy (cube.js's face index convention:
// 0=Front 1=Back 2=Right 3=Left 4=Top 5=Bottom).
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

function isValidPhysicalCubePanels(n) {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

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

module.exports = { load, save, VALID_SIZES, VALID_MODES, WALL_MAX_COLS, WALL_MAX_ROWS, WALL_MAX_PANELS, isValidPanels, isValidPhysicalCubePanels, DEFAULT_CONFIG, CONFIG_PATH, FACE_LAYOUT, FACE_NAMES };
