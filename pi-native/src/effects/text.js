// Shared bitmap-text primitives - the ONE place glyph bitmaps get walked.
//
// Before this module, ~23 effects each hand-rolled their own copy of the
// same "for each row, for each col, test a bit, scale it, write a pixel"
// loop, differing only in which font, which pixel target, and which
// coordinate convention. That duplication had a real cost: a text-
// orientation bug took a dozen rounds to fix because each fix landed in
// one copy while a different, independent copy was the one actually
// rendering. Every caller now goes through blitGlyph() and differs only in
// the parts that genuinely differ per effect:
//
//   - the FONT (glyph table, cell size, advance) - see the *_FONT
//     descriptors below, or pass any {w, h, adv, get} object;
//   - the PLOT callback - where a lit pixel goes and how it blends
//     (setFaceLED, setWallPixel, max-blend into colBuf/wallBuf, a raw
//     intensity buffer, a shadow-darken pass...). Bounds checking lives in
//     the plot callback, not here, since targets differ in what "in bounds"
//     means (e.g. setWallPixel also skips unoccupied grid cells, while some
//     wall effects deliberately write wallBuf directly);
//   - the ORIGIN and FLIPS. Every existing convention reduces to "the
//     glyph's cells form a top-down block at (x0, y0), optionally with rows
//     and/or columns reversed": e.g. `v = sv + (4 - row)` is origin (su,
//     sv) with flipY, `y = sv - (6 - ry)` is origin (su, sv - 6), and
//     `v = S - 1 - (sv + (4 - row))` is origin (su, S - 5 - sv). Each glyph
//     is drawn in a single colour, so only the SET of pixels written
//     matters, not the order they're visited in.
//
// Glyph bitmaps are arrays of per-row bitmasks, most-significant bit =
// leftmost column (bit w-1 is column 0).
'use strict';

// Walks one glyph bitmap, calling plot(x, y) once per lit output pixel.
// rows: per-row bitmasks (row 0 = top of the glyph as authored).
// w, h: glyph cell size in bitmap pixels. scale: integer pixel scale.
// flipX/flipY: reverse column/row order within the glyph's own cell.
function blitGlyph(rows, w, h, x0, y0, scale, plot, flipX = false, flipY = false) {
  for (let row = 0; row < h; row++) {
    const bits = rows[row];
    if (!bits) continue;
    const cy = flipY ? h - 1 - row : row;
    for (let col = 0; col < w; col++) {
      if (!((bits >> (w - 1 - col)) & 1)) continue;
      const cx = flipX ? w - 1 - col : col;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) plot(x0 + cx * scale + sx, y0 + cy * scale + sy);
      }
    }
  }
}

// ── Font descriptors ─────────────────────────────────────────────────────
// get(ch) returns the glyph's row bitmasks, or undefined for "no glyph"
// (callers still advance past it). Lookup rules intentionally differ per
// font and are preserved exactly: PIXEL_FONT has real lowercase glyphs, so
// it tries the character as-is first; the radio font is uppercase-only
// and falls back to '?'; the fireworks font falls back to a space.
const { PIXEL_FONT } = require('./weather/font');
const { FONT: RADIO_GLYPHS, CHAR_W: RADIO_CHAR_W } = require('./radio/font');

const FONT_3x5 = { w: 3, h: 5, adv: 4, get: (ch) => PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()] };
const FONT_5x7 = { w: 5, h: 7, adv: RADIO_CHAR_W, get: (ch) => RADIO_GLYPHS[ch.toUpperCase()] || RADIO_GLYPHS['?'] };
// Same 5x7 glyphs, but a missing glyph draws a blank cell instead of '?' -
// the date/time text renderer's long-standing behavior.
const FONT_5x7_BLANK = { ...FONT_5x7, get: (ch) => RADIO_GLYPHS[ch.toUpperCase()] };
// PIXEL_FONT plus a '%' glyph, looked up uppercase-only - the celestial
// moon-phase ticker's font (matches the browser's effectMoon() table).
const MOON_GLYPHS = { ...PIXEL_FONT, '%': [5, 1, 2, 4, 5] };
const FONT_MOON = { w: 3, h: 5, adv: 4, get: (ch) => MOON_GLYPHS[ch.toUpperCase()] };

// Draws one glyph with its top-left cell corner at (x, y). Returns the
// horizontal advance (font.adv * scale), including for a missing glyph.
function drawGlyph(font, ch, x, y, plot, { scale = 1, flipX = false, flipY = false } = {}) {
  const rows = font.get(ch);
  if (rows) blitGlyph(rows, font.w, font.h, x, y, scale, plot, flipX, flipY);
  return font.adv * scale;
}

// Draws a string left to right starting at x. If maxX is given, stops once
// the pen position reaches it (the `u += glyph; if (u >= S) break;` idiom
// several effects use to skip off-panel characters). Returns the final
// pen position.
function drawString(font, str, x, y, plot, { scale = 1, flipY = false, maxX = Infinity, outline = null } = {}) {
  if (outline) drawString(font, str, x, y, outlineOf(outline), { scale, flipY, maxX });
  let u = x;
  for (const ch of str) {
    u += drawGlyph(font, ch, u, y, plot, { scale, flipY });
    if (u >= maxX) break;
  }
  return u;
}

// Tight rendered width: every glyph's advance except the trailing gap.
function textWidth(font, str, scale = 1) {
  return str.length * font.adv * scale - (font.adv - font.w) * scale;
}

// Several short lines, each centered horizontally within width W, the
// block centered vertically within height H (offset by ox/oy for a
// multi-panel wall target). Line pitch is one glyph row taller than the
// cell (h + 1).
function drawLinesCentered(font, lines, W, H, plot, { scale = 1, ox = 0, oy = 0 } = {}) {
  const lineH = (font.h + 1) * scale;
  let y = Math.round((H - lines.length * lineH) / 2);
  for (const line of lines) {
    const x = Math.round((W - textWidth(font, line, scale)) / 2);
    drawString(font, line, ox + x, oy + y, plot, { scale });
    y += lineH;
  }
}

// Endless horizontal marquee: repeats `label` across width W, shifted left
// by scrollX pixels. The caller owns scrollX (advance it and wrap it at
// label.length * font.adv). y is the glyph cell's top edge.
function drawMarquee(font, label, scrollX, y, W, plot, { flipY = false, outline = null } = {}) {
  if (!label) return; // an empty label would never advance the pen
  if (outline) drawMarquee(font, label, scrollX, y, W, outlineOf(outline), { flipY });
  let u = -Math.floor(scrollX);
  while (u < W) {
    for (const ch of label) {
      u += drawGlyph(font, ch, u, y, plot, { flipY });
      if (u > W) break;
    }
  }
}

// The 5x7 font on a cube FACE, baseline at sv (glyph occupies rows sv-6..sv),
// rows flipped. Formerly radio/font.js's drawGlyph(); used by the radio
// ticker/static label and APOD's ticker. Wall-mode users of the same font
// draw it UNflipped with origin (su, sv - 6) - a real, separately-verified
// difference, preserved as-is. Why faces flip: a full-window browser
// screenshot showed this ticker's letters upside down ("letter order is
// correct, but needs flipping top to bottom") - the 2D preview's canvas
// renderer places face rows bottom-up (fv = size-1-v), so each glyph's own
// row order has to be reversed to read correctly. If the PHYSICAL panel's
// text orientation ever regresses, the fix belongs in the driver (matching
// the preview's convention), not in reverting this flip.
function drawGlyph5x7Face(core, face, ch, su, sv, rgb) {
  return drawGlyph(FONT_5x7, ch, su, sv - 6, facePlot(core, face, rgb[0], rgb[1], rgb[2]), { flipY: true });
}

// Dark outline for text drawn over busy imagery (tickers over photos or
// spectrum bars). Pass `outline: plotFn` to drawString/drawMarquee: the
// whole string is first drawn through outlineOf(plotFn), which plots each
// lit pixel's 4 neighbours, then the text itself on top - two passes, so
// one glyph's outline can never cut into the previous glyph's strokes.
// plotFn is typically a facePlot/wallPlot with a near-black colour.
function outlineOf(plot) {
  return (x, y) => { plot(x - 1, y); plot(x + 1, y); plot(x, y - 1); plot(x, y + 1); };
}

// ── Common plot targets ──────────────────────────────────────────────────
// Overwrite a cube face pixel (setFaceLED does its own bounds/faceMap check).
const facePlot = (core, face, r, g, b) => (x, y) => core.setFaceLED(face, x, y, r, g, b);
// Overwrite a wall pixel (setWallPixel does its own bounds + occupancy check).
const wallPlot = (core, r, g, b) => (x, y) => core.setWallPixel(x, y, r, g, b);
// Brighten-only (per-channel max) into a cube face - text laid over
// imagery without darkening anything already brighter.
const faceMaxPlot = (core, face, r, g, b) => {
  const { SIZE: S, faceMap, colBuf } = core;
  return (x, y) => {
    if (x < 0 || x >= S || y < 0 || y >= S) return;
    const idx = faceMap[face][y * S + x]; if (idx < 0) return;
    const o = idx * 3;
    if (r > colBuf[o]) colBuf[o] = r;
    if (g > colBuf[o + 1]) colBuf[o + 1] = g;
    if (b > colBuf[o + 2]) colBuf[o + 2] = b;
  };
};
// Brighten-only straight into wallBuf - deliberately NOT through
// setWallPixel, so it also paints unoccupied grid cells, matching the
// wall effects that always wrote wallBuf directly.
const wallMaxPlot = (core, r, g, b) => {
  const { wallW: W, wallH: H, wallBuf } = core;
  return (x, y) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const o = (y * W + x) * 3;
    if (r > wallBuf[o]) wallBuf[o] = r;
    if (g > wallBuf[o + 1]) wallBuf[o + 1] = g;
    if (b > wallBuf[o + 2]) wallBuf[o + 2] = b;
  };
};

module.exports = {
  blitGlyph, drawGlyph, drawString, textWidth, drawLinesCentered, drawMarquee,
  drawGlyph5x7Face, outlineOf,
  FONT_3x5, FONT_5x7, FONT_5x7_BLANK, FONT_MOON,
  facePlot, wallPlot, faceMaxPlot, wallMaxPlot,
};
