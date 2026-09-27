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
const { drawLinesCentered, FONT_3x5, wallPlot } = require('./text');
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

function renderIdentifyWall(core, config) {
  if (!core.wallBuf) return;
  core.wallBuf.fill(0);
  const S = core.wallPanelSize;
  config.panels.forEach((p, idx) => {
    const lines = ['PANEL ' + (idx + 1), 'OUT ' + (p.gy + 1), 'POS ' + (p.gx + 1)];
    // Centered within this one panel's own S x S cell of the wall canvas.
    drawLinesCentered(FONT_3x5, lines, S, S, wallPlot(core, 0.2, 1, 0.4), { scale: pickScale(lines, S, 4), ox: p.gx * S, oy: p.gy * S });
  });
}

function renderIdentify(core, config) {
  if (config.mode === 'wall') renderIdentifyWall(core, config);
  else renderIdentifyCube(core, config);
}

module.exports = { renderIdentify };
