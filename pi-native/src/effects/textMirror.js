// Single source of truth for "does this glyph need a local horizontal
// mirror to counteract rgbMatrixDriver's whole-canvas mirror". Before this
// file existed, four independent from-scratch glyph drawers (radio/font.js,
// radioWall.js's glyphWall, identify.js's wallGlyph, _shared.js's
// drawGlyph3x5) each reimplemented this same yes/no logic - which is
// exactly how a real-hardware mirrored-text bug got "fixed" in one of them
// three separate times while the other three (running the actual live
// panelMode) stayed broken. Route all four through here instead.
//
// rgbMatrixDriver.js mirrors the whole assembled image for both '2d'
// (_buildFaceBuffer(), a single physical panel's mount correction) and
// 'wall' (_buildWallPanelBuffer(), same mount correction generalized to a
// multi-panel canvas) - real hardware fixes for general effect content that
// flip text backwards as a side effect. 'cube' mode's 6 FACE_LAYOUT-
// calibrated faces have no such driver-level mirror and must not get this
// compensation.
function needsTextMirror(panelMode) {
  return panelMode !== 'cube';
}

// col: 0-based column offset within a glyph's own box (0 = the box's own
// left edge). width: the glyph box's pixel width (5 for radio/font.js's
// font, 3 for weather/font.js's PIXEL_FONT). Returns the column to actually
// place that bit at - unchanged if no mirror is needed, reflected about the
// box's own center if it is. This is a LOCAL mirror (within one glyph's own
// box only) - it deliberately leaves the caller's own `su`/character-anchor
// placement untouched, so scroll motion/character order are unaffected;
// only the glyph's own pixel shape flips.
function mirrorCol(col, width, mirror) {
  return mirror ? (width - 1 - col) : col;
}

// Same idea as mirrorCol but for row order within a glyph's own box - a
// real-hardware report ("rotate 180 degrees") confirmed the horizontal-only
// local mirror wasn't enough: this panel's mount needs both axes flipped
// per glyph, not just left-right.
function mirrorRow(row, height, mirror) {
  return mirror ? (height - 1 - row) : row;
}

module.exports = { needsTextMirror, mirrorCol, mirrorRow };
