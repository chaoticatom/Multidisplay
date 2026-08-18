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
// sv = 7 - two real reports in sequence pinned this down. First: "the
// radio text is mostly off screen" - sv=1 clipped 5 of each glyph's 7
// rows (drawGlyph's `y = sv - (6-ry)` went negative for small sv,
// silently out of bounds). That was fixed by moving sv up to SIZE-2 -
// which made the text fully visible, but at the WRONG end: the follow-up
// report ("text still at top, move to bottom") confirms empirically that
// a LARGE sv (near SIZE-1) renders near the TOP of the panel here, not
// the bottom - the opposite of what core.js's grid-Y-based faceMap
// construction would suggest in isolation, but this is the actual
// observed behaviour and takes priority over that reasoning. sv=7 is the
// smallest value that keeps drawGlyph's y range (sv-6..sv = 1..7) fully
// non-negative - full glyph, no clipping - while sitting at the LOW end,
// which the same empirical evidence says is the bottom.
// mir: face 2/3 - a real report ("radio text needs to be flipped
// [mirrored]"). Matches alarms.js's drawBigMessage() (the established
// reference for this): reverses which character occupies which on-screen
// slot (iterate the label backwards while still advancing u left-to-
// right as normal) - the matching half of font.js's drawGlyph() mirroring
// each letter's own internal columns, so the WHOLE line reads correctly
// on a face whose u-axis runs the opposite physical direction to face
// 0's, instead of either individual letters or the whole message coming
// out backwards.
function drawTicker(core, face, label, dt) {
  if (!label) return;
  const textW = label.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = 7;
  const mir = face === 2 || face === 3;
  const chars = mir ? Array.from(label).reverse() : label;
  let u = -Math.floor(scrollX);
  const rgb = [0.6, 0.85, 1];
  while (u < core.SIZE) {
    for (const ch of chars) {
      u += drawGlyph(core, face, ch, u, sv, rgb, mir);
      if (u > core.SIZE) break;
    }
  }
}

module.exports = { drawTicker, resetTicker };
