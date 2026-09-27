// Scrolling now-playing ticker - behaviourally faithful port of
// effects-core.js's radioDrawTicker() (same 14px/sec scroll speed, same
// wrap-at-text-width math, same bottom-row placement), drawn in the shared
// 5x7 font via ../text.js (the original's WC_FONT word-cascade engine is
// explicitly out of scope - see ./font.js).
'use strict';

const { CHAR_W } = require('./font');
const { drawMarquee, FONT_5x7, facePlot } = require('../text');

let scrollX = 0;

function resetTicker() { scrollX = 0; }

// label: plain text, e.g. "SomaFM Groove Salad  •  Ambient/Downtempo    ".
// Draws onto `face`'s bottom row, advancing scrollX by dt*14px each call -
// call once per face per tick while a station is playing.
//
// Baseline sv = 7 (glyph rows 1..7) - two real reports in sequence pinned
// this down. First: "the radio text is mostly off screen" - sv=1 clipped
// 5 of each glyph's 7 rows (the glyph spans sv-6..sv, which went negative
// for small sv, silently out of bounds). That was fixed by moving sv up
// to SIZE-2 - which made the text fully visible, but at the WRONG end: the
// follow-up report ("text still at top, move to bottom") confirms
// empirically that a LARGE sv (near SIZE-1) renders near the TOP of the
// panel here, not the bottom - the opposite of what core.js's grid-Y-based
// faceMap construction would suggest in isolation, but this is the actual
// observed behaviour and takes priority over that reasoning. sv=7 is the
// smallest value that keeps the glyph's y range fully non-negative - full
// glyph, no clipping - while sitting at the LOW end, which the same
// empirical evidence says is the bottom.
//
// Characters are drawn in plain forward order. They used to be reversed
// to counteract an old full-180-rotation-per-letter glyph drawer; with
// correctly-shaped letters, reversing the order just produces backwards
// READING order, which a blocky pixel font makes look exactly like
// mirror-writing (verified directly with "HELLO").
function drawTicker(core, face, label, dt) {
  if (!label) return;
  const textW = label.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = 7;
  // Cube faces draw this font row-flipped - see text.js's drawGlyph5x7Face().
  drawMarquee(FONT_5x7, label, scrollX, sv - 6, core.SIZE, facePlot(core, face, 0.6, 0.85, 1), { flipY: true, outline: facePlot(core, face, 0, 0, 0) });
}

module.exports = { drawTicker, resetTicker };
