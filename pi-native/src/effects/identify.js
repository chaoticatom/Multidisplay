// "Identify Panels" - a calibration overlay, not a selectable effect (see
// tick.js's early-return for state.identifyPanels). A real user request:
// wiring 6 physical panels across 3 HAT/Active-3 outputs (2 panels chained
// per output) into an arbitrary shape (L, star, long strip, or the fixed
// cube) leaves no way to tell WHICH physical panel is being addressed as
// which face/grid-cell without trial and error (HUB75 is write-only, no
// return signal - this project can't auto-probe wiring, see panelConfig.js's
// module comment). This renders each panel's own identity directly onto
// itself - the same "solid color per face" calibration technique the
// README already recommends, but self-labeling instead of requiring you to
// memorize a color->face mapping.
//
// Cube/2D mode: labels each face with its name (Front/Back/.../Bottom, or
// "PANEL 1" for 2d) plus which physical HAT output ("chain") and position
// within that chain it's wired to - reads panelConfig.js's FACE_LAYOUT, the
// SAME table rgbMatrixDriver.js uses to address real hardware, so this is
// never able to drift out of sync with what the driver actually does.
//
// Wall mode: labels each configured panel with its 1-based index (order in
// config.panels - what saveCube/setPanelPositions etc. already key off) plus
// its {gx,gy} grid position, translated into the identical "output/position"
// language via the same gx->pos, gy->chain mapping rgbMatrixDriver.js's
// _renderWallFrame() comment documents (gx = position within a chain, gy =
// which of the 3 parallel outputs).
const { FACE_LAYOUT, FACE_NAMES } = require('../panelConfig');
const { PIXEL_FONT } = require('./weather/font');
const { drawLinesCentered3x5 } = require('./_shared');

// Largest integer scale that still fits every line's width within `size`
// px (3x5 glyph cell is 4*scale-scale wide per char, see textWidth3x5 in
// _shared.js) - picked per-face/per-panel rather than one fixed constant so
// short labels ("Top"/"OUT 1") render bigger while a long one ("Bottom")
// still fits instead of clipping off the edge of the panel.
function pickScale(lines, size, maxScale) {
  const longest = Math.max(...lines.map((l) => l.length));
  return Math.max(1, Math.min(maxScale, Math.floor(size / (4 * longest - 1))));
}

function renderIdentifyCube(core, config) {
  core.colBuf.fill(0);
  const faceCount = config.mode === '2d' ? 1 : 6;
  for (let face = 0; face < faceCount; face++) {
    const lines = config.mode === '2d'
      ? ['PANEL 1']
      : [FACE_NAMES[face], 'OUT ' + (FACE_LAYOUT[face].chain + 1), 'POS ' + (FACE_LAYOUT[face].pos + 1)];
    drawLinesCentered3x5(core, face, lines, pickScale(lines, core.SIZE, 4), 0.2, 1, 0.4);
  }
}

// Own glyph writer (not drawLinesCentered3x5, which is setFaceLED/cube-only)
// - plain top-down row-major addressing straight onto setWallPixel, same as
// every other from-scratch wall-mode drawer in this codebase; no v-flip
// needed since nothing here assumes a v-up convention to begin with (see
// CLAUDE.md's "write-time v-flip" note - only effects PORTED from a v-up
// source need that per-effect fix, this is native top-down text).
function wallGlyph(core, ox, oy, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      // rgbMatrixDriver's _buildWallPanelBuffer() mirrors the whole wall
      // canvas left-right before pushing to the physical panels (see
      // radioWall.js's glyphWall() for the same fix, verified there with a
      // local draw+mirror simulation). This function had the same bug:
      // `col` placed the leftmost bit at the leftmost pixel, which is
      // correct pre-mirror but comes out backwards on the physical panel.
      // Placing at (2-col) instead - a LOCAL mirror within each glyph's 3px
      // box, leaving `su` (the per-character advance) untouched - cancels
      // the driver's mirror for glyph shape without affecting character
      // order/spacing.
      const localCol = 2 - col;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          core.setWallPixel(ox + su + localCol * scale + sx, oy + sv + row * scale + sy, r, g, b);
        }
      }
    }
  }
  return 4 * scale;
}
function wallLineWidth(str, scale) { return str.length * 4 * scale - scale; }
function wallLinesCentered(core, ox, oy, panelSize, lines, scale, r, g, b) {
  const lineH = 6 * scale;
  const totalH = lines.length * lineH;
  let sv = Math.round((panelSize - totalH) / 2);
  for (const line of lines) {
    let su = Math.round((panelSize - wallLineWidth(line, scale)) / 2);
    for (const ch of line) su += wallGlyph(core, ox, oy, ch, su, sv, scale, r, g, b);
    sv += lineH;
  }
}

function renderIdentifyWall(core, config) {
  if (!core.wallBuf) return;
  core.wallBuf.fill(0);
  const S = core.wallPanelSize;
  config.panels.forEach((p, idx) => {
    const lines = ['PANEL ' + (idx + 1), 'OUT ' + (p.gy + 1), 'POS ' + (p.gx + 1)];
    wallLinesCentered(core, p.gx * S, p.gy * S, S, lines, pickScale(lines, S, 4), 0.2, 1, 0.4);
  });
}

function renderIdentify(core, config) {
  if (config.mode === 'wall') renderIdentifyWall(core, config);
  else renderIdentifyCube(core, config);
}

module.exports = { renderIdentify };
