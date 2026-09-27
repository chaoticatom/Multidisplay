// Date & Time helpers shared by the cube (datetime.js) and wall
// (datetimeWall.js) renderers - previously copied into both files.
// Everything here draws into an explicit W x H intensity buffer; the cube
// renderer passes its square size for both (a cube face is W = H = S).
'use strict';

const { drawString, FONT_5x7_BLANK } = require('./text');
const { WC_CHAR_W } = require('./_shared');

function setPx(buf, W, H, x, y, v) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  if (v > buf[i]) buf[i] = v;
}

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

// Anti-aliased rectangle fill - a real report ("use a much nicer font. I
// see massive pixels"): the old version rounded x0/y0/x1/y1 to the nearest
// whole pixel and hard-filled it, so every segment edge landed on a
// visible stair-step boundary (0 or full intensity, nothing between) - the
// "massive pixel" blocky look. This instead computes each touched pixel's
// FRACTIONAL coverage by the true (sub-pixel) rectangle and writes
// intensity proportional to that coverage, so edges fall off smoothly
// across 1-2 pixels instead of snapping - the standard fix for
// blocky-looking vector shapes on a low-res grid, and the biggest lever
// available here (a real LED matrix can't get "smoother" than its
// physical pixel pitch, but the EDGES of each shape can still read as
// smooth curves/diagonals instead of jagged blocks).
function fillRect(buf, W, H, x0, y0, x1, y1, v) {
  const xs = Math.floor(x0), xe = Math.ceil(x1), ys = Math.floor(y0), ye = Math.ceil(y1);
  for (let y = ys; y < ye; y++) {
    const covY = Math.min(y + 1, y1) - Math.max(y, y0);
    if (covY <= 0) continue;
    for (let x = xs; x < xe; x++) {
      const covX = Math.min(x + 1, x1) - Math.max(x, x0);
      if (covX <= 0) continue;
      setPx(buf, W, H, x, y, v * covX * covY);
    }
  }
}

// x,y,w,h: digit's bounding box. val: intensity (0-255).
function drawSegDigit(buf, W, H, x, y, w, h, ch, val) {
  const segs = SEG[ch] || '';
  if (!segs) return;
  const has = (s) => segs.includes(s);
  const t = Math.max(1, Math.round(w * 0.24));
  const midY = y + h / 2;
  if (has('a')) fillRect(buf, W, H, x + t, y, x + w - t, y + t, val);
  if (has('g')) fillRect(buf, W, H, x + t, midY - t / 2, x + w - t, midY + t / 2, val);
  if (has('d')) fillRect(buf, W, H, x + t, y + h - t, x + w - t, y + h, val);
  if (has('f')) fillRect(buf, W, H, x, y, x + t, midY + t / 2, val);
  if (has('b')) fillRect(buf, W, H, x + w - t, y, x + w, midY + t / 2, val);
  if (has('e')) fillRect(buf, W, H, x, midY - t / 2, x + t, y + h, val);
  if (has('c')) fillRect(buf, W, H, x + w - t, midY - t / 2, x + w, y + h, val);
}

function drawSegColon(buf, W, H, x, y, w, h, val) {
  const t = Math.max(1, Math.round(w * 0.55));
  const cx = x + w / 2 - t / 2;
  fillRect(buf, W, H, cx, y + h * 0.26, cx + t, y + h * 0.26 + t, val);
  fillRect(buf, W, H, cx, y + h * 0.64, cx + t, y + h * 0.64 + t, val);
}

// Draws a digits/colons string centered on (cx, topY), each digit
// digitW x digitH with `gap` between characters and colons at 0.42x the
// digit width - returns the string's total rendered width (used to size-
// check it against the available panel width before committing to a
// digitW, see fitDigitWidth()).
function drawSegString(buf, W, H, str, cx, topY, digitW, digitH, gap, val) {
  const colonW = digitW * 0.42;
  let total = 0;
  for (const ch of str) total += (ch === ':' ? colonW : digitW) + gap;
  total -= gap;
  let x = cx - total / 2;
  for (const ch of str) {
    const w = ch === ':' ? colonW : digitW;
    if (ch === ':') drawSegColon(buf, W, H, x, topY, w, digitH, val);
    else drawSegDigit(buf, W, H, x, topY, w, digitH, ch, val);
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
  let h = idealH * (maxW / widthAt(idealH));
  while (widthAt(h) > maxW && h > 1) h -= 0.5;
  return Math.max(1, h);
}

// Draws `text` (upper-cased) centered horizontally on `cx`, top edge at `cy`,
// each glyph cell `6*scale` wide / `7*scale` tall - same cell layout as
// retro/title.js's drawText(), just writing intensity instead of RGB.
function fontDrawText(buf, W, H, text, cx, cy, scale) {
  const w = text.length * FONT_5x7_BLANK.adv * scale;
  drawString(FONT_5x7_BLANK, text, cx - w / 2, cy, (x, y) => setPx(buf, W, H, x, y, 255), { scale });
}

function drawLine(buf, W, H, x1, y1, x2, y2, val, thickness) {
  const dx = x2 - x1, dy = y2 - y1;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let s = 0; s <= steps; s++) {
    const x = x1 + (dx * s) / steps, y = y1 + (dy * s) / steps;
    for (let ox = -((thickness - 1) / 2); ox <= (thickness - 1) / 2; ox++)
      for (let oy = -((thickness - 1) / 2); oy <= (thickness - 1) / 2; oy++)
        setPx(buf, W, H, x + ox, y + oy, val);
  }
}

function dtDrawAnalogue(buf, W, H, now) {
  const cx = W / 2, cy = H / 2, half = Math.min(W, H) * 0.42;
  drawLine(buf, W, H, cx - half, cy - half, cx + half, cy - half, 130, 1);
  drawLine(buf, W, H, cx - half, cy + half, cx + half, cy + half, 130, 1);
  drawLine(buf, W, H, cx - half, cy - half, cx - half, cy + half, 130, 1);
  drawLine(buf, W, H, cx + half, cy - half, cx + half, cy + half, 130, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 - Math.PI / 2;
    const isCardinal = i % 3 === 0;
    const r = isCardinal ? half : half * 0.92;
    setPx(buf, W, H, cx + Math.cos(a) * r, cy + Math.sin(a) * r, isCardinal ? 255 : 150);
  }
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  const ha = ((h + m / 60) * Math.PI) / 6 - Math.PI / 2;
  const ma = ((m + s / 60) * Math.PI) / 30 - Math.PI / 2;
  const sa = (s * Math.PI) / 30 - Math.PI / 2;
  drawLine(buf, W, H, cx, cy, cx + Math.cos(ha) * half * 0.5, cy + Math.sin(ha) * half * 0.5, 255, 3);
  drawLine(buf, W, H, cx, cy, cx + Math.cos(ma) * half * 0.75, cy + Math.sin(ma) * half * 0.75, 220, 2);
  drawLine(buf, W, H, cx, cy, cx + Math.cos(sa) * half * 0.85, cy + Math.sin(sa) * half * 0.85, 200, 1);
  setPx(buf, W, H, cx, cy, 255);
}

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
function fitScale(availW, text, maxScale, widthFrac = 0.94) {
  const fit = Math.floor((availW * widthFrac) / (text.length * 6));
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
function dtGlow(buf, W, H) {
  const src = buf.slice();
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = src[y * W + x];
      if (v < 60) continue;
      const g = v * 0.4;
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const i = ny * W + nx;
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
function dtLayoutStack(buf, W, H, lines) {
  const gap = Math.max(1, H * 0.04);
  const resolved = lines.map((ln) => {
    if (ln.type === 'seg') return { ...ln, h: fitDigitHeight(ln.str, H * ln.idealHFrac, W * 0.94) };
    return { ...ln, h: 7 * ln.scale };
  });
  let totalH = resolved.reduce((a, l) => a + l.h, 0) + gap * (resolved.length - 1);
  // See datetime.js's dtLayoutStack for why: per-line width-fit alone
  // doesn't guarantee the whole stack's height fits H - shrink proportionally
  // if it doesn't ("Clock. Full mode goes off screen").
  let stackGap = gap;
  if (totalH > H * 0.98) {
    const k = (H * 0.98) / totalH;
    for (const ln of resolved) {
      if (ln.type === 'text') ln.scale = Math.max(0.5, ln.scale * k);
      ln.h *= k;
    }
    stackGap = gap * k;
    totalH = resolved.reduce((a, l) => a + l.h, 0) + stackGap * (resolved.length - 1);
  }
  let y = (H - totalH) / 2;
  for (const ln of resolved) {
    if (ln.type === 'seg') {
      const digitW = ln.h * 0.56, dgap = digitW * 0.3;
      drawSegString(buf, W, H, ln.str, W / 2, y, digitW, ln.h, dgap, 255);
    } else {
      fontDrawText(buf, W, H, ln.str, W / 2, y, ln.scale);
    }
    y += ln.h + stackGap;
  }
}

const DT_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const DT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// How many sub-samples per axis to render digits/text at internally before
// downsampling - see the module comment on the supersampling block below.
const DT_SS = 3;

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

function dtWrapTokens(tokens, maxW, scale = 1) {
  const lines = []; let cur = [], curW = 0;
  const charW = WC_CHAR_W * scale;
  tokens.forEach((tok) => {
    const w = tok.t.length * charW;
    const addW = (cur.length ? charW : 0) + w;
    if (curW + addW > maxW && cur.length) { lines.push(cur); cur = [tok]; curW = w; }
    else { cur.push(tok); curW += addW; }
  });
  if (cur.length) lines.push(cur);
  return lines;
}

const DT_STAGGER_FRACS = [0.04, 0.5, 0.8, 0.15, 0.6, 0.3, 0.75];

module.exports = {
  setPx,
  SEG,
  fillRect,
  drawSegDigit,
  drawSegColon,
  drawSegString,
  fitDigitHeight,
  fontDrawText,
  drawLine,
  dtDrawAnalogue,
  fitScale,
  dtGlow,
  dtLayoutStack,
  DT_DAYS,
  DT_MONTHS,
  DT_SS,
  DT_WORDS_NUM,
  DT_WORDS_ORDINAL,
  DT_WORDS_DAY,
  DT_WORDS_MONTH,
  DT_WORDS_ONES,
  DT_WORDS_TEENS,
  DT_WORDS_TENS,
  dtNumberWord,
  dtWordsForTime,
  dtWordsForDate,
  dtWrapTokens,
  DT_STAGGER_FRACS,
};
