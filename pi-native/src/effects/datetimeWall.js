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

function dtRenderBuf(core, W, H, now, mode) {
  if (!dtBuf || dtBufW !== W || dtBufH !== H) { dtBuf = new Uint8Array(W * H); dtBufW = W; dtBufH = H; }
  else dtBuf.fill(0);

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];

  const M = Math.min(W, H);
  const scaleBig = Math.max(1, Math.round(M / 22));
  const scaleSm = Math.max(1, Math.round(M / 40));

  if (mode === 'date') {
    fontDrawText(dtBuf, W, H, dayStr, W / 2, H * 0.28, scaleSm);
    fontDrawText(dtBuf, W, H, dateStr, W / 2, H * 0.55, scaleSm);
  } else if (mode === 'both') {
    fontDrawText(dtBuf, W, H, hh + ':' + mm, W / 2, H * 0.12, scaleBig);
    fontDrawText(dtBuf, W, H, dayStr, W / 2, H * 0.58, scaleSm);
    fontDrawText(dtBuf, W, H, dateStr, W / 2, H * 0.76, scaleSm);
  } else if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, W, H, now);
  } else if (mode === 'full') {
    fontDrawText(dtBuf, W, H, hh + ':' + mm, W / 2, H * 0.04, scaleBig);
    fontDrawText(dtBuf, W, H, ':' + ss, W / 2, H * 0.38, scaleSm);
    fontDrawText(dtBuf, W, H, dayStr, W / 2, H * 0.6, scaleSm);
    fontDrawText(dtBuf, W, H, dateStr, W / 2, H * 0.78, scaleSm);
  } else { // 'time' (default)
    fontDrawText(dtBuf, W, H, hh + ':' + mm, W / 2, H * 0.24, scaleBig);
    fontDrawText(dtBuf, W, H, ':' + ss, W / 2, H * 0.62, scaleSm);
  }
}

function paintWall(core, W, H, srcOffsetPx, hue) {
  for (let v = 0; v < H; v++) {
    const row = v * W;
    for (let u = 0; u < W; u++) {
      const srcPx = Math.floor(u + srcOffsetPx);
      const cx = ((srcPx % W) + W) % W;
      const pv = dtBuf[row + cx] / 255;
      if (pv < 0.04) continue;
      const [r, g, b] = hsl(hue, 1, pv);
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

function wcDrawGlyphWall(core, W, H, ch, su, sv, rgb) {
  const rows = WC_FONT[ch] || WC_FONT[ch.toUpperCase()];
  if (!rows) return WC_CHAR_W;
  for (let row = 0; row < 7; row++) {
    const bits = rows[row];
    for (let col = 0; col < 4; col++) {
      if (!((bits >> (3 - col)) & 1)) continue;
      const u = su + col, v = sv + (6 - row);
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      core.setWallPixel(u, v, rgb[0], rgb[1], rgb[2]);
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
function dtDrawWordLines(core, W, H, lines, startRow) {
  let row = startRow;
  lines.forEach((line) => {
    const lineW = line.reduce((a, t) => a + t.t.length * WC_CHAR_W, 0) + Math.max(0, line.length - 1) * WC_CHAR_W;
    const margin = Math.max(0, W - lineW);
    const sv = (H - 1) - 1 - 6 - row * WC_LINE_H;
    if (sv + 6 < 0) { row++; return; }
    let su = Math.round(margin * DT_STAGGER_FRACS[row % DT_STAGGER_FRACS.length]);
    line.forEach((tok) => {
      let u = su;
      for (const ch of tok.t) u += wcDrawGlyphWall(core, W, H, ch, u, sv, tok.c);
      su += tok.t.length * WC_CHAR_W + WC_CHAR_W;
    });
    row++;
  });
  return row;
}

function dtBuildWordClockWall(core, W, H, now) {
  let row = 0;
  row = dtDrawWordLines(core, W, H, dtWrapTokens(dtWordsForTime(now.getHours(), now.getMinutes()), W), row);
  row += 1;
  row = dtDrawWordLines(core, W, H, dtWrapTokens(dtWordsForDate(now), W), row);
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
