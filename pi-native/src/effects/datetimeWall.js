// Wall-mode counterpart to datetime.js ("Time & Date").
//
// datetime.js already collapses to a single flat-panel path under
// `is2D` (core.panelMode==='2d'): one SxS `dtBuf` intensity buffer,
// rendered once via fontDrawText/dtDrawAnalogue, then hue-remap-sampled
// onto face 0 with paintFace() (DT_PANEL_SEQ/DT_NEEDS_FLIP/allPanels/the
// 4-face SCROLL fan-out are cube-only and dropped entirely for is2D, same
// as they're dropped here). This port generalizes that is2D path from a
// square SxS buffer to a wallW x wallH one - the one genuinely
// square-shaped assumption in the original is the analogue clock's
// `cx=S/2, cy=S/2, half=S*0.42`, which the batch brief specifically flags:
// on a non-square wall a naive `half=min(W,H... wait size)*0.42` derived
// from ONE axis would either clip (using W on a short-but-wide wall) or
// look tiny (using H on a tall-but-narrow one), so this uses
// `half = Math.min(W,H) * 0.42`, i.e. the clock face is always a full
// circle sized to whichever axis is the tighter fit, centered at the
// wall's true center (W/2, H/2) - not S/2 on some assumed square panel.
// Same min(W,H)-based sizing is used for the digital-mode font scale
// (scaleBig/scaleSm), so digits stay proportioned to the SHORTER wall
// axis (typically height, e.g. one row of 64px panels) rather than
// growing absurdly wide on a many-panels-wide wall.
//
// Scroll ticker mode is kept (dtScrollX shifts the sample column with
// wraparound across the FULL wallW-wide buffer, same modulo-wrap sampling
// as paintFace() - just a wider modulus now that the "single face" is the
// whole wall).
//
// Words mode reuses the exact same WC_FONT/word-wrap/tokenization logic
// as datetime.js (copied rather than imported - datetime.js doesn't
// export its word-clock helpers, and the tables are tiny), just writing
// through core.setWallPixel(x,y,...) instead of core.setFaceLED(face,u,v,...)
// and wrapping/staggering lines against wallW/wallH instead of SIZE.
const { hsl } = require('../core');
const { FONT } = require('./radio/font');

let dtBuf = null, dtBufW = 0, dtBufH = 0, dtLastSec = -1, dtScrollX = 0;

function setPx(buf, W, H, x, y, v) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  if (v > buf[i]) buf[i] = v;
}

// ─── Seven-segment main clock digits - see datetime.js's module comment
// for the real report/root cause (cramped bitmap font, overlapping
// "full" mode). Same design, W/H-signature to match this file's setPx().
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
};
// Anti-aliased rectangle fill - see datetime.js's fillRect() module comment
// for the real report/root cause (hard-rounded edges = "massive pixels").
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

function fontDrawText(buf, W, H, text, cx, cy, scale) {
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
            setPx(buf, W, H, x0 + rx * scale + sx, cy + ry * scale + sy, 255);
          }
        }
      }
    }
    x0 += advance;
  }
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

const DT_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const DT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Same "actually fits" fix as datetime.js's fitScale() (see its module
// comment for the real report/root cause) - picks the largest scale that
// fits `text` within W*widthFrac pixels, capped at maxScale so short
// strings don't blow up relative to their role (main time vs. day/date
// subtitle). Uses W (available horizontal room across the whole wall),
// not M, for the fit check - a wide multi-panel wall has much more room
// than a single square panel; M only sets the relative-size cap baseline.
function fitScale(availW, text, maxScale, widthFrac = 0.94) {
  const fit = Math.floor((availW * widthFrac) / (text.length * 6));
  return Math.max(1, Math.min(maxScale, fit));
}

// Same block-centering fix as datetime.js's dtLayoutStack() - see its
// module comment for the real report ("full mode overlaps... centralise
// vertically and horizontally"). Fits against W (available wall width,
// can be much wider than H on a multi-panel-wide wall) but centers/stacks
// against H (actual wall height) so it stays correct whichever axis ends
// up the tighter constraint.
// Same bloom/glow pass as datetime.js's dtGlow() - see its module comment.
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

function dtRenderBuf(core, W, H, now, mode) {
  if (!dtBuf || dtBufW !== W || dtBufH !== H) { dtBuf = new Uint8Array(W * H); dtBufW = W; dtBufH = H; }
  else dtBuf.fill(0);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];
  const timeStr = hh + ':' + mm;
  const secStr = ':' + ss;

  const M = Math.min(W, H);
  const daySc = fitScale(W, dayStr, Math.max(1, Math.round(M / 16)));
  const dateSc = fitScale(W, dateStr, Math.max(1, Math.round(M / 14)));
  const secSc = fitScale(W, secStr, Math.max(1, Math.round(M / 10)));

  if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, W, H, now);
  } else if (mode === 'date') {
    dtLayoutStack(dtBuf, W, H, [
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'both') {
    dtLayoutStack(dtBuf, W, H, [
      { type: 'seg', str: timeStr, idealHFrac: 0.42 },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'full') {
    dtLayoutStack(dtBuf, W, H, [
      { type: 'seg', str: timeStr, idealHFrac: 0.36 },
      { type: 'text', str: secStr, scale: secSc },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else { // 'time' (default)
    dtLayoutStack(dtBuf, W, H, [
      { type: 'seg', str: timeStr, idealHFrac: 0.55 },
      { type: 'text', str: secStr, scale: secSc },
    ]);
  }
  if (mode !== 'analogue') dtGlow(dtBuf, W, H);
}

function paintWall(core, W, H, srcOffsetPx, hue) {
  for (let v = 0; v < H; v++) {
    const row = v * W;
    for (let u = 0; u < W; u++) {
      const srcPx = Math.floor(u + srcOffsetPx);
      const cx = ((srcPx % W) + W) % W;
      const pv = dtBuf[row + cx] / 255;
      if (pv < 0.04) continue;
      // Lightness capped - see datetime.js's paintFace() module comment
      // for why (HSL lightness=1 washes fully-lit pixels to plain white).
      const [r, g, b] = hsl(hue, 1, 0.12 + pv * 0.5);
      core.setWallPixel(u, v, r, g, b);
    }
  }
}

// ─── "Words" mode - same WC_FONT table/wrap/stagger logic as
// datetime.js's, copied (not imported - not exported there) and pointed
// at core.setWallPixel/wallW/wallH instead of setFaceLED/SIZE. ──────────
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

// v is flipped (H-1-v) at the point of writing - same fix/root cause as
// datetime.js's wcDrawGlyph (see its module comment).
// scale multiplies both the glyph cell and its advance width - real report
// ("for the word clock, if space is available 1 or more displays, increase
// font size to fit"): dtBuildWordClockWall picks the largest scale whose
// wrapped text still fits the wall (see wcPickScale) before drawing.
function wcDrawGlyphWall(core, W, H, ch, su, sv, rgb, scale = 1) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W * scale;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const u = su + col * scale + sx, v = H - 1 - (sv + (6 - row) * scale + sy);
          if (u < 0 || u >= W || v < 0 || v >= H) continue;
          core.setWallPixel(u, v, rgb[0], rgb[1], rgb[2]);
        }
      }
    }
  }
  return WC_CHAR_W * scale;
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
function dtDrawWordLines(core, W, H, lines, startRow, scale = 1) {
  const charW = WC_CHAR_W * scale, lineH = WC_LINE_H * scale;
  let row = startRow;
  lines.forEach((line) => {
    const lineW = line.reduce((a, t) => a + t.t.length * charW, 0) + Math.max(0, line.length - 1) * charW;
    const margin = Math.max(0, W - lineW);
    const sv = (H - 1) - 1 - 6 * scale - row * lineH;
    if (sv + 6 * scale < 0) { row++; return; }
    let su = Math.round(margin * DT_STAGGER_FRACS[row % DT_STAGGER_FRACS.length]);
    line.forEach((tok) => {
      let u = su;
      for (const ch of tok.t) u += wcDrawGlyphWall(core, W, H, ch, u, sv, tok.c, scale);
      su += tok.t.length * charW + charW;
    });
    row++;
  });
  return row;
}

// Picks the largest integer glyph scale whose wrapped time+date text stack
// still fits vertically within H ("if space is available 1 or more
// displays, increase font size to fit" - larger multi-panel walls should
// use a bigger word-clock font, not the smallest-panel-safe fixed size).
function wcPickScale(W, H, timeTokens, dateTokens) {
  for (let s = 4; s >= 1; s--) {
    const tLines = dtWrapTokens(timeTokens, W, s);
    const dLines = dtWrapTokens(dateTokens, W, s);
    const rows = tLines.length + 1 + dLines.length;
    if (rows * WC_LINE_H * s <= H) return s;
  }
  return 1;
}

function dtBuildWordClockWall(core, W, H, now) {
  const timeTok = dtWordsForTime(now.getHours(), now.getMinutes());
  const dateTok = dtWordsForDate(now);
  const scale = wcPickScale(W, H, timeTok, dateTok);
  let row = 0;
  row = dtDrawWordLines(core, W, H, dtWrapTokens(timeTok, W, scale), row, scale);
  row += 1;
  row = dtDrawWordLines(core, W, H, dtWrapTokens(dateTok, W, scale), row, scale);
}

// ─── Main effect entry point ───────────────────────────────────────────
function effectDateTimeWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt * 0.8;
  const t = core.t;
  const now = new Date();
  const sec = now.getSeconds();
  const opts = core.effectOptions?.datetime || {};
  const mode = opts.mode || 'time';

  if (mode === 'words') {
    for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;
    dtBuildWordClockWall(core, W, H, now);
    return;
  }

  if (mode === 'analogue' || sec !== dtLastSec || !dtBuf || dtBufW !== W || dtBufH !== H) {
    dtLastSec = sec;
    dtRenderBuf(core, W, H, now, mode);
  }

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const scrollOn = !!opts.scroll;
  const speed = Number(opts.scrollSpeed ?? 1);
  if (scrollOn && speed !== 0) dtScrollX = (dtScrollX + dt * speed * W * 0.5 + 4 * W) % (4 * W);

  if (scrollOn) {
    const hue = ((dtScrollX / (4 * W)) * 0.8 + t * 0.09) % 1;
    paintWall(core, W, H, dtScrollX, hue);
  } else {
    paintWall(core, W, H, 0, (t * 0.09) % 1);
  }
}

module.exports = effectDateTimeWall;
