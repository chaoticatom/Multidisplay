// Scrolling now-playing ticker - behaviourally faithful port of
// effects-core.js's radioDrawTicker() (same 14px/sec scroll speed, same
// wrap-at-text-width math, same bottom-row placement), with ./font.js's
// plain 5x7 bitmap font standing in for the original's WC_FONT/
// wcDrawGlyph (word-cascade engine, explicitly out of scope - see
// ./font.js's module comment).
'use strict';

const { drawGlyph, CHAR_W } = require('./font');

let scrollX = 0;

function resetTicker() { scrollX = 0; }

// label: plain text, e.g. "SomaFM Groove Salad  •  Ambient/Downtempo    ".
// Draws onto `face`'s bottom row, advancing scrollX by dt*14px each call -
// call once per face per tick while a station is playing.
//
// sv = core.SIZE - 2 - a real report ("the radio text is mostly off
// screen"). The original app's sv=1 assumed a v-up frame (row 0 = bottom)
// matching ITS OWN wcDrawGlyph, but this port's drawGlyph() (font.js)
// writes via core.setFaceLED directly, which is plain row-major top-down
// (row 0 = top) - with sv=1, drawGlyph's `y = sv - (6-ry)` put 5 of each
// glyph's 7 rows at negative y (silently clipped, out of bounds), leaving
// only a 2px sliver actually on screen, sitting near the TOP edge instead
// of the bottom. sv needs to be near SIZE-1 (bottom) in this top-down
// frame, not near 0, for the exact same formula to place a full,
// unclipped glyph just above the true bottom edge.
function drawTicker(core, face, label, dt) {
  if (!label) return;
  const textW = label.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = core.SIZE - 2;
  let u = -Math.floor(scrollX);
  const rgb = [0.6, 0.85, 1];
  while (u < core.SIZE) {
    for (const ch of label) {
      u += drawGlyph(core, face, ch, u, sv, rgb);
      if (u > core.SIZE) break;
    }
  }
}

module.exports = { drawTicker, resetTicker };
