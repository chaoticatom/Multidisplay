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
// Baseline sv = 7: on the panels a small sv is the BOTTOM, and 7 is the
// smallest value that keeps all 7 glyph rows (sv-6..sv) on screen.
// Characters are drawn in plain forward order (reversing gives mirror text).
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
