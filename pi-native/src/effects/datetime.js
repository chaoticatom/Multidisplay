// Ported from effects-livedata.js's effectDateTime() (~line 235-999) plus its
// module-scope dtRender()/dtWords*()/dtBuildWordClockToFace() helpers -
// "Time & Date". The browser version draws every non-"words" mode (time,
// date, both, full, analogue) onto an offscreen 512x512 <canvas> using real
// font/arc/line drawing APIs, then samples that canvas per-LED (with a hue
// remap) in paintFace() - including wrapping the sample x-coordinate modulo
// the canvas width to support the SCROLL ticker across all 4 side faces.
// Node has no canvas here (see radio/font.js's module comment for the same
// constraint), so this port replaces the canvas with a plain SIZE x SIZE
// intensity buffer (`dtBuf`, one byte per LED-aligned pixel, scale=1
// wherever the original used `DT_RES/SIZE`) filled by a small bitmap-font
// rasterizer (reusing ../radio/font.js's 5x7 FONT table, which already has
// the full digit/colon/letter set the clock needs - unlike retro/title.js's
// font, which is missing digits 4-7). paintFace()'s modulo-wrap sampling
// logic is otherwise unchanged, just with DT_RES replaced by SIZE.
//
// "Words" mode bypasses dtBuf entirely in the original (fixed white/amber/
// blue colours via the word-cascade WC_FONT engine, not the hue-remapped
// canvas pipeline) and does the same here: WC_FONT/WC_CHAR_W/WC_LINE_H and
// the dtWords*()/dtDrawWordLines()/dtBuildWordClockToFace() helpers are
// ported verbatim below since no equivalent word-cascade engine exists yet
// in pi-native (see CLAUDE.md's Jokes/Trivia/On This Day port status -
// effects-core.js's WC_FONT has no pi-native port to reuse).
//
// _peTargetFace/_peTargetOpts (browser Panel Editor per-face override) have
// no pi-native equivalent (no Panel Editor here - see strobe.js/tron.js's
// module comments for the same omission) and are dropped; every mode always
// targets the same face(s) the ALL PANELS/SCROLL options say to.
//
// core.panelMode==='2d' (single flat panel, no faceMap[1..5]) collapses
// ALL PANELS/SCROLL down to "just paint face 0", since there are no other
// side faces to spread across or scroll a ticker through - SCROLL still
// animates the ticker within face 0's own width instead of doing nothing.
const { hsl } = require('../core');
const { FONT } = require('./radio/font');

// ─── Numeric clock modes: bitmap-font-into-buffer + hue-remap sampling ────
let dtBuf = null, dtLastSec = -1, dtScrollX = 0;

function setPx(buf, S, x, y, v) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= S || y < 0 || y >= S) return;
  if (v > buf[y * S + x]) buf[y * S + x] = v;
}

// ─── Seven-segment main clock digits ───────────────────────────────────
// Redesign of the main HH:MM display - a real report: "the time & date
// looks terrible... redesign with smooth font text that fits the
// screen... make it look good". The tiny 5x7 bitmap FONT (still used
// below for the smaller seconds/day/date sub-lines, where it reads fine)
// looked cramped and blocky scaled up to be the headline element; large
// seven-segment digits are the standard, genuinely good-looking treatment
// for a prominent LED clock display, and only need filled rectangles
// (no fine bitmap detail) so they stay crisp at any panel size.
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};
function fillRect(buf, S, x0, y0, x1, y1, v) {
  const xs = Math.round(x0), xe = Math.round(x1), ys = Math.round(y0), ye = Math.round(y1);
  for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) setPx(buf, S, x, y, v);
}
// x,y,w,h: digit's bounding box. val: intensity (0-255).
function drawSegDigit(buf, S, x, y, w, h, ch, val) {
  const segs = SEG[ch] || '';
  if (!segs) return;
  const has = (s) => segs.includes(s);
  const t = Math.max(1, Math.round(w * 0.24)); // segment thickness
  const midY = y + h / 2;
  if (has('a')) fillRect(buf, S, x + t, y, x + w - t, y + t, val);
  if (has('g')) fillRect(buf, S, x + t, midY - t / 2, x + w - t, midY + t / 2, val);
  if (has('d')) fillRect(buf, S, x + t, y + h - t, x + w - t, y + h, val);
  if (has('f')) fillRect(buf, S, x, y, x + t, midY + t / 2, val);
  if (has('b')) fillRect(buf, S, x + w - t, y, x + w, midY + t / 2, val);
  if (has('e')) fillRect(buf, S, x, midY - t / 2, x + t, y + h, val);
  if (has('c')) fillRect(buf, S, x + w - t, midY - t / 2, x + w, y + h, val);
}
function drawSegColon(buf, S, x, y, w, h, val) {
  const t = Math.max(1, Math.round(w * 0.55));
  const cx = x + w / 2 - t / 2;
  fillRect(buf, S, cx, y + h * 0.26, cx + t, y + h * 0.26 + t, val);
  fillRect(buf, S, cx, y + h * 0.64, cx + t, y + h * 0.64 + t, val);
}
// Draws a digits/colons string centered on (cx, topY), each digit
// digitW x digitH with `gap` between characters and colons at 0.42x the
// digit width - returns the string's total rendered width (used to size-
// check it against the available panel width before committing to a
// digitW, see fitDigitWidth()).
function drawSegString(buf, S, str, cx, topY, digitW, digitH, gap, val) {
  const colonW = digitW * 0.42;
  let total = 0;
  for (const ch of str) total += (ch === ':' ? colonW : digitW) + gap;
  total -= gap;
  let x = cx - total / 2;
  for (const ch of str) {
    const w = ch === ':' ? colonW : digitW;
    if (ch === ':') drawSegColon(buf, S, x, topY, w, digitH, val);
    else drawSegDigit(buf, S, x, topY, w, digitH, ch, val);
    x += w + gap;
  }
  return total;
}
// Largest digitH (digitW = digitH*0.56, gap = digitW*0.3) whose rendered
// string width still fits within maxW - the same "measure the real string,
// don't just guess a ratio" fix as fitScale() below, applied to the seg
// font. idealH is the height we'd like if width weren't a constraint
// (shrinks further only if the string is too wide at that height).
function fitDigitHeight(str, idealH, maxW) {
  const widthAt = (h) => {
    const dW = h * 0.56, gap = dW * 0.3, colonW = dW * 0.42;
    let total = 0;
    for (const ch of str) total += (ch === ':' ? colonW : dW) + gap;
    return total - gap;
  };
  if (widthAt(idealH) <= maxW) return idealH;
  // Scale down proportionally, then nudge down further if rounding left it
  // still slightly over (fine at this size, avoids an iterative search).
  let h = idealH * (maxW / widthAt(idealH));
  while (widthAt(h) > maxW && h > 1) h -= 0.5;
  return Math.max(1, h);
}

// Draws `text` (upper-cased) centered horizontally on `cx`, top edge at `cy`,
// each glyph cell `6*scale` wide / `7*scale` tall - same cell layout as
// retro/title.js's drawText(), just writing intensity instead of RGB.
function fontDrawText(buf, S, text, cx, cy, scale) {
  const advance = 6 * scale;
  const w = text.length * advance;
  let x0 = cx - w / 2;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].toUpperCase();
    const rows = FONT[ch];
    if (rows) {
      for (let ry = 0; ry < 7; ry++) {
        const bits = rows[ry];
        for (let rx = 0; rx < 5; rx++) {
          if (!(bits & (0x10 >> rx))) continue;
          for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
            setPx(buf, S, x0 + rx * scale + sx, cy + ry * scale + sy, 255);
          }
        }
      }
    }
    x0 += advance;
  }
}

function drawLine(buf, S, x1, y1, x2, y2, val, thickness) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let s = 0; s <= steps; s++) {
    const x = x1 + (dx * s) / steps, y = y1 + (dy * s) / steps;
    for (let ox = -((thickness - 1) / 2); ox <= (thickness - 1) / 2; ox++)
      for (let oy = -((thickness - 1) / 2); oy <= (thickness - 1) / 2; oy++)
        setPx(buf, S, x + ox, y + oy, val);
  }
}

function dtDrawAnalogue(buf, S, now) {
  const cx = S / 2, cy = S / 2, half = S * 0.42;
  drawLine(buf, S, cx - half, cy - half, cx + half, cy - half, 130, 1);
  drawLine(buf, S, cx - half, cy + half, cx + half, cy + half, 130, 1);
  drawLine(buf, S, cx - half, cy - half, cx - half, cy + half, 130, 1);
  drawLine(buf, S, cx + half, cy - half, cx + half, cy + half, 130, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    const isCardinal = i % 3 === 0;
    const r = isCardinal ? half : half * 0.92;
    setPx(buf, S, cx + Math.cos(a) * r, cy + Math.sin(a) * r, isCardinal ? 255 : 150);
  }
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  const ha = ((h + m / 60) * Math.PI) / 6 - Math.PI / 2;
  const ma = ((m + s / 60) * Math.PI) / 30 - Math.PI / 2;
  const sa = (s * Math.PI) / 30 - Math.PI / 2;
  drawLine(buf, S, cx, cy, cx + Math.cos(ha) * half * 0.5, cy + Math.sin(ha) * half * 0.5, 255, 3);
  drawLine(buf, S, cx, cy, cx + Math.cos(ma) * half * 0.75, cy + Math.sin(ma) * half * 0.75, 220, 2);
  drawLine(buf, S, cx, cy, cx + Math.cos(sa) * half * 0.85, cy + Math.sin(sa) * half * 0.85, 200, 1);
  setPx(buf, S, cx, cy, 255);
}

const DT_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Picks the largest integer scale that still fits `text` within S*widthFrac
// pixels (fontDrawText's cell is 6*scale wide per glyph, including the 1px
// gap), capped at maxScale so a short string (e.g. ":SS") doesn't blow up
// to a size that no longer reads as "the smaller line" relative to the
// main time. A real report: "time & date is rubbish... make... fit on
// screen" - the previous scale (Math.round(S/22), same fixed number
// regardless of what string it was applied to) was never actually checked
// against any string's real width - "HH:MM" at that scale came out to
// 90px on a 64px panel, running off the edge entirely (screenshot-
// confirmed). The original browser version didn't have this problem
// because it used real canvas font metrics tuned per string (e.g. "bold
// 160px" for the main time, comment: "reduced from 200px to fit with
// padding") - this is the bitmap-font equivalent of that same "make sure
// it actually fits" step, just computed instead of eyeballed since there's
// no canvas here to try font sizes against (see module comment).
function fitScale(S, text, maxScale, widthFrac = 0.94) {
  const fit = Math.floor((S * widthFrac) / (text.length * 6));
  return Math.max(1, Math.min(maxScale, fit));
}

// Cheap bloom/glow pass over the intensity buffer - a real report ("the
// font is so old fashioned, it needs to be smooth with no pixels showing,
// add a bit of glow"). A real per-pixel blur convolution is overkill (and
// this only runs once per second anyway - see dtRenderBuf's caller - so
// cost isn't really a concern either way): this instead spreads each lit
// pixel's intensity into its 4 neighbours at reduced strength (max-blended,
// never dimming a pixel something else already lit brighter), which reads
// as a soft halo around every segment/glyph edge instead of a hard-edged
// rectangle, without softening the segment's own core brightness at all.
function dtGlow(buf, S) {
  const src = buf.slice();
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = src[y * S + x];
      if (v < 60) continue;
      const g = v * 0.4;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= S || ny < 0 || ny >= S) continue;
        const i = ny * S + nx;
        if (g > buf[i]) buf[i] = g;
      }
    }
  }
}

// Stacks `lines` (each {type:'seg', str, idealHFrac} for the seg-digit
// clock or {type:'text', str, scale} for small bitmap-font text)
// vertically, block-centered as a WHOLE on the panel - both axes, real
// measured heights. Real report: "when on full it overlaps each other.
// centralise vertically and horizontally" - the previous version placed
// every line at a fixed fractional Y (S*0.04, S*0.38, S*0.6, S*0.78 for
// "full") with no relationship to how TALL each line actually rendered,
// so a bigger font size (or this file's own earlier overflow bug) could
// easily push one line into the next. This computes total stack height
// first, then centers the whole block, then places each line immediately
// below the previous one - overlap becomes structurally impossible, and
// centering doesn't need per-mode tuning ever again.
function dtLayoutStack(buf, S, lines) {
  const gap = Math.max(1, S * 0.04);
  const resolved = lines.map((ln) => {
    if (ln.type === 'seg') return { ...ln, h: fitDigitHeight(ln.str, S * ln.idealHFrac, S * 0.94) };
    return { ...ln, h: 7 * ln.scale };
  });
  const totalH = resolved.reduce((a, l) => a + l.h, 0) + gap * (resolved.length - 1);
  let y = (S - totalH) / 2;
  for (const ln of resolved) {
    if (ln.type === 'seg') {
      const digitW = ln.h * 0.56, dgap = digitW * 0.3;
      drawSegString(buf, S, ln.str, S / 2, y, digitW, ln.h, dgap, 255);
    } else {
      fontDrawText(buf, S, ln.str, S / 2, y, ln.scale);
    }
    y += ln.h + gap;
  }
}

function dtRenderBuf(core, now, mode) {
  const S = core.SIZE;
  if (!dtBuf || dtBuf.length !== S * S) dtBuf = new Uint8Array(S * S);
  else dtBuf.fill(0);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];
  const timeStr = hh + ':' + mm;
  const secStr = ':' + ss;

  const daySc = fitScale(S, dayStr, Math.max(1, Math.round(S / 16)));
  const dateSc = fitScale(S, dateStr, Math.max(1, Math.round(S / 14)));
  const secSc = fitScale(S, secStr, Math.max(1, Math.round(S / 10)));

  if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, S, now);
  } else if (mode === 'date') {
    dtLayoutStack(dtBuf, S, [
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'both') {
    dtLayoutStack(dtBuf, S, [
      { type: 'seg', str: timeStr, idealHFrac: 0.42 },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'full') {
    dtLayoutStack(dtBuf, S, [
      { type: 'seg', str: timeStr, idealHFrac: 0.36 },
      { type: 'text', str: secStr, scale: secSc },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else { // 'time' (default)
    dtLayoutStack(dtBuf, S, [
      { type: 'seg', str: timeStr, idealHFrac: 0.55 },
      { type: 'text', str: secStr, scale: secSc },
    ]);
  }
  if (mode !== 'analogue') dtGlow(dtBuf, S);
}

// Same modulo-wrap sampling as the browser's paintFace(), with DT_RES
// replaced by SIZE (scale=1 - see module comment for why).
function paintFace(core, face, flip, srcOffsetLEDs, hue) {
  const S = core.SIZE, faceMap = core.faceMap, colBuf = core.colBuf;
  for (let v = 0; v < S; v++) {
    const lv = S - 1 - v;
    const row = v * S;
    for (let u = 0; u < S; u++) {
      const ledU = flip ? (S - 1 - u) : u;
      const srcPx = Math.floor(ledU + srcOffsetLEDs);
      const cx = ((srcPx % S) + S) % S;
      const pv = dtBuf[row + cx] / 255;
      if (pv < 0.04) continue;
      const idx = faceMap[face][lv * S + u];
      if (idx < 0) continue;
      // Lightness capped well below 1.0 - a real report ("add a bit of
      // glow, colour, something") traced partly to this: HSL lightness=1
      // is always pure white regardless of hue, so every fully-lit segment
      // pixel (pv≈1) washed out to colourless white, only the dim glow
      // halo (see dtGlow()) ever showed real hue. 0.12-0.62 keeps peak
      // brightness vividly coloured while still leaving room for the glow
      // falloff to read as dimmer.
      const [r, g, b] = hsl(hue, 1, 0.12 + pv * 0.5);
      colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b;
    }
  }
}

// ─── "Words" mode: word-clock style, ported verbatim from
// effects-livedata.js's dtWords*()/dtBuildWordClockToFace() - fixed
// white/amber/blue colours, no hue remap, no scroll/allpanels. WC_FONT/
// WC_CHAR_W/WC_LINE_H are effects-core.js's shared word-cascade font table,
// ported locally here since no pi-native port of the cascade engine exists
// yet to reuse (see module comment above).
const WC_FONT = {
  '0': [6, 9, 9, 9, 9, 9, 6], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 1, 2, 4, 8, 8, 15], '3': [14, 1, 6, 1, 1, 9, 6],
  '4': [2, 6, 10, 10, 15, 2, 2], '5': [15, 8, 14, 1, 1, 9, 6], '6': [6, 8, 8, 14, 9, 9, 6], '7': [15, 1, 2, 2, 4, 4, 4],
  '8': [6, 9, 9, 6, 9, 9, 6], '9': [6, 9, 9, 7, 1, 1, 6],
  A: [6, 9, 9, 15, 9, 9, 9], B: [14, 9, 9, 14, 9, 9, 14], C: [7, 8, 8, 8, 8, 8, 7], D: [12, 10, 9, 9, 9, 10, 12],
  E: [15, 8, 8, 14, 8, 8, 15], F: [15, 8, 8, 14, 8, 8, 8], G: [7, 8, 8, 11, 9, 9, 7], H: [9, 9, 9, 15, 9, 9, 9],
  I: [14, 4, 4, 4, 4, 4, 14], J: [3, 1, 1, 1, 1, 9, 6], K: [9, 10, 12, 8, 12, 10, 9], L: [8, 8, 8, 8, 8, 8, 15],
  M: [9, 13, 11, 9, 9, 9, 9], N: [9, 13, 11, 11, 9, 9, 9], O: [6, 9, 9, 9, 9, 9, 6], P: [14, 9, 9, 14, 8, 8, 8],
  Q: [6, 9, 9, 9, 11, 9, 7], R: [14, 9, 9, 14, 12, 10, 9], S: [7, 8, 8, 6, 1, 1, 14], T: [15, 4, 4, 4, 4, 4, 4],
  U: [9, 9, 9, 9, 9, 9, 6], V: [9, 9, 9, 9, 9, 6, 2], W: [9, 9, 9, 9, 11, 13, 9], X: [9, 9, 6, 6, 6, 9, 9],
  Y: [9, 9, 6, 2, 2, 2, 2], Z: [15, 1, 2, 4, 8, 8, 15],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 0, 4, 8], "'": [4, 4, 0, 0, 0, 0, 0],
};
const WC_CHAR_W = 5, WC_LINE_H = 8;

// v is flipped (S-1-v) at the point of writing - same fix, same root cause
// as celestial.js's moonGlyph (see its module comment): this file's word-
// clock layout (dtDrawWordLines below) places its first line near sv=S-8
// and stacks subsequent lines toward sv=0, a "v-up" mental model that
// needs correcting when it actually hits core.setFaceLED's plain row-major
// faceMap addressing. A real report ("the words version is upside down and
// back to front") - severely flipped text reads as scrambled/reversed
// enough to describe as "back to front" too, same as celestial's own
// "reversed" report turned out to be fully explained by an identical
// vertical-only bug.
function wcDrawGlyph(core, face, ch, su, sv, rgb) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W;
  const S = core.SIZE;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      const u = su + col, v = S - 1 - (sv + (6 - row));
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      core.setFaceLED(face, u, v, rgb[0], rgb[1], rgb[2]);
    }
  }
  return WC_CHAR_W;
}

const DT_WORDS_NUM = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
const DT_WORDS_ORDINAL = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH',
  'ELEVENTH', 'TWELFTH', 'THIRTEENTH', 'FOURTEENTH', 'FIFTEENTH', 'SIXTEENTH', 'SEVENTEENTH', 'EIGHTEENTH', 'NINETEENTH', 'TWENTIETH',
  'TWENTY FIRST', 'TWENTY SECOND', 'TWENTY THIRD', 'TWENTY FOURTH', 'TWENTY FIFTH', 'TWENTY SIXTH', 'TWENTY SEVENTH', 'TWENTY EIGHTH', 'TWENTY NINTH', 'THIRTIETH', 'THIRTY FIRST'];
const DT_WORDS_DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DT_WORDS_MONTH = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DT_WORDS_ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'];
const DT_WORDS_TEENS = ['TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const DT_WORDS_TENS = ['', 'TEN', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY'];

function dtNumberWord(n) {
  if (n < 10) return DT_WORDS_ONES[n];
  if (n < 20) return DT_WORDS_TEENS[n - 10];
  const tens = Math.floor(n / 10), ones = n % 10;
  return DT_WORDS_TENS[tens] + (ones ? ' ' + DT_WORDS_ONES[ones] : '');
}

function dtWordsForTime(h24, m) {
  const hourOffset = m > 30 ? 1 : 0;
  const h = (h24 + hourOffset) % 24;
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  const hourWord = DT_WORDS_NUM[h12 % 12];
  const AMBER = [1, 0.8, 0.27], WHITE = [1, 1, 1];
  const tokens = [];
  const pushMinutes = (n) => {
    dtNumberWord(n).split(' ').forEach((w) => tokens.push({ t: w, c: AMBER }));
    tokens.push({ t: n === 1 ? 'MINUTE' : 'MINUTES', c: AMBER });
  };
  if (m === 0) {
    tokens.push({ t: hourWord, c: WHITE }, { t: "O'CLOCK", c: WHITE });
  } else if (m === 15) {
    tokens.push({ t: 'QUARTER', c: AMBER }, { t: 'PAST', c: WHITE }, { t: hourWord, c: WHITE });
  } else if (m === 30) {
    tokens.push({ t: 'HALF', c: AMBER }, { t: 'PAST', c: WHITE }, { t: hourWord, c: WHITE });
  } else if (m === 45) {
    tokens.push({ t: 'QUARTER', c: AMBER }, { t: 'TO', c: WHITE }, { t: hourWord, c: WHITE });
  } else if (m < 30) {
    pushMinutes(m);
    tokens.push({ t: 'PAST', c: WHITE }, { t: hourWord, c: WHITE });
  } else {
    pushMinutes(60 - m);
    tokens.push({ t: 'TO', c: WHITE }, { t: hourWord, c: WHITE });
  }
  return tokens;
}

function dtWordsForDate(now) {
  const BLUE = [0.48, 0.82, 1], AMBER = [1, 0.8, 0.27];
  const tokens = [{ t: DT_WORDS_DAY[now.getDay()], c: BLUE }, { t: 'THE', c: BLUE }];
  DT_WORDS_ORDINAL[now.getDate() - 1].split(' ').forEach((w) => tokens.push({ t: w, c: AMBER }));
  tokens.push({ t: 'OF', c: BLUE }, { t: DT_WORDS_MONTH[now.getMonth()], c: BLUE });
  return tokens;
}

function dtWrapTokens(tokens, maxW) {
  const lines = []; let cur = [], curW = 0;
  tokens.forEach((tok) => {
    const w = tok.t.length * WC_CHAR_W;
    const addW = (cur.length ? WC_CHAR_W : 0) + w;
    if (curW + addW > maxW && cur.length) { lines.push(cur); cur = [tok]; curW = w; }
    else { cur.push(tok); curW += addW; }
  });
  if (cur.length) lines.push(cur);
  return lines;
}

const DT_STAGGER_FRACS = [0.04, 0.5, 0.8, 0.15, 0.6, 0.3, 0.75];
function dtDrawWordLines(core, face, lines, startRow) {
  const S = core.SIZE;
  let row = startRow;
  lines.forEach((line) => {
    const lineW = line.reduce((a, t) => a + t.t.length * WC_CHAR_W, 0) + Math.max(0, line.length - 1) * WC_CHAR_W;
    const margin = Math.max(0, S - lineW);
    const sv = (S - 1) - 1 - 6 - row * WC_LINE_H;
    if (sv + 6 < 0) { row++; return; }
    let su = Math.round(margin * DT_STAGGER_FRACS[row % DT_STAGGER_FRACS.length]);
    line.forEach((tok) => {
      let u = su;
      for (const ch of tok.t) u += wcDrawGlyph(core, face, ch, u, sv, tok.c);
      su += tok.t.length * WC_CHAR_W + WC_CHAR_W;
    });
    row++;
  });
  return row;
}

function dtBuildWordClockToFace(core, face, now) {
  const S = core.SIZE;
  let row = 0;
  row = dtDrawWordLines(core, face, dtWrapTokens(dtWordsForTime(now.getHours(), now.getMinutes()), S), row);
  row += 1;
  row = dtDrawWordLines(core, face, dtWrapTokens(dtWordsForDate(now), S), row);
}

// ─── Main effect entry point ───────────────────────────────────────────
const DT_PANEL_SEQ = [3, 0, 2, 1];
const DT_NEEDS_FLIP = [false, false, true, true];

function effectDateTime(core, dt) {
  core.t += dt * 0.8;
  const t = core.t;
  const { N, SIZE: S, colBuf } = core;
  const now = new Date();
  const sec = now.getSeconds();
  const opts = core.effectOptions?.datetime || {};
  const mode = opts.mode || 'time';

  if (mode === 'words') {
    for (let i = 0; i < N * 3; i++) colBuf[i] = 0;
    dtBuildWordClockToFace(core, 0, now);
    return;
  }

  if (mode === 'analogue' || sec !== dtLastSec || !dtBuf || dtBuf.length !== S * S) {
    dtLastSec = sec;
    dtRenderBuf(core, now, mode);
  }

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  const is2D = core.panelMode === '2d';
  const allPanels = !is2D && !!opts.allPanels;
  const scrollOn = !!opts.scroll;
  const speed = Number(opts.scrollSpeed ?? 1);

  if (scrollOn && speed !== 0) dtScrollX = (dtScrollX + dt * speed * S * 0.5 + 4 * S) % (4 * S);

  if (is2D) {
    if (scrollOn) {
      const hue = ((dtScrollX / (4 * S)) * 0.8 + t * 0.09) % 1;
      paintFace(core, 0, false, dtScrollX, hue);
    } else {
      paintFace(core, 0, false, 0, (t * 0.09) % 1);
    }
  } else if (!allPanels && !scrollOn) {
    paintFace(core, 0, false, 0, (t * 0.09) % 1);
  } else if (allPanels && !scrollOn) {
    for (let pi = 0; pi < 4; pi++) {
      const hue = (pi / 4 * 0.8 + t * 0.09) % 1;
      paintFace(core, DT_PANEL_SEQ[pi], DT_NEEDS_FLIP[pi], 0, hue);
    }
  } else {
    for (let pi = 0; pi < 4; pi++) {
      const faceStart = pi * S;
      const srcOffsetLEDs = dtScrollX - faceStart;
      const hue = ((dtScrollX / (4 * S)) * 0.8 + t * 0.09) % 1;
      paintFace(core, DT_PANEL_SEQ[pi], DT_NEEDS_FLIP[pi], srcOffsetLEDs, hue);
    }
  }
}

module.exports = effectDateTime;
