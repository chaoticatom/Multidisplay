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

function dtRenderBuf(core, now, mode) {
  const S = core.SIZE;
  if (!dtBuf || dtBuf.length !== S * S) dtBuf = new Uint8Array(S * S);
  else dtBuf.fill(0);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];

  const scaleBig = Math.max(1, Math.round(S / 22));
  const scaleSm = Math.max(1, Math.round(S / 40));

  if (mode === 'date') {
    fontDrawText(dtBuf, S, dayStr, S / 2, S * 0.28, scaleSm);
    fontDrawText(dtBuf, S, dateStr, S / 2, S * 0.55, scaleSm);
  } else if (mode === 'both') {
    fontDrawText(dtBuf, S, hh + ':' + mm, S / 2, S * 0.12, scaleBig);
    fontDrawText(dtBuf, S, dayStr, S / 2, S * 0.58, scaleSm);
    fontDrawText(dtBuf, S, dateStr, S / 2, S * 0.76, scaleSm);
  } else if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, S, now);
  } else if (mode === 'full') {
    fontDrawText(dtBuf, S, hh + ':' + mm, S / 2, S * 0.04, scaleBig);
    fontDrawText(dtBuf, S, ':' + ss, S / 2, S * 0.38, scaleSm);
    fontDrawText(dtBuf, S, dayStr, S / 2, S * 0.6, scaleSm);
    fontDrawText(dtBuf, S, dateStr, S / 2, S * 0.78, scaleSm);
  } else { // 'time' (default)
    fontDrawText(dtBuf, S, hh + ':' + mm, S / 2, S * 0.24, scaleBig);
    fontDrawText(dtBuf, S, ':' + ss, S / 2, S * 0.62, scaleSm);
  }
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
      const [r, g, b] = hsl(hue, 1, pv);
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

function wcDrawGlyph(core, face, ch, su, sv, rgb) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W;
  const S = core.SIZE;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      const u = su + col, v = sv + (6 - row);
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
