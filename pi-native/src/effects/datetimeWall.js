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
// Words mode shares its phrasing/wrap helpers with datetime.js (both
// import them from datetimeCommon.js, along with the seven-segment/glow/
// layout drawing helpers), just writing
// through core.setWallPixel(x,y,...) instead of core.setFaceLED(face,u,v,...)
// and wrapping/staggering lines against wallW/wallH instead of SIZE.
const { hsl } = require('../core');
const { drawGlyph, wallPlot } = require('./text');

let dtBuf = null, dtBufW = 0, dtBufH = 0, dtLastSec = -1, dtScrollX = 0;

const {
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
} = require('./datetimeCommon');

function dtRenderBuf(core, W, H, now, mode) {
  if (!dtBuf || dtBufW !== W || dtBufH !== H) { dtBuf = new Uint8Array(W * H); dtBufW = W; dtBufH = H; }
  else dtBuf.fill(0);

  if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, W, H, now);
    return;
  }

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];
  const timeStr = hh + ':' + mm;
  const secStr = ':' + ss;

  const bigW = W * DT_SS, bigH = H * DT_SS, bigM = Math.min(bigW, bigH);
  const bigBuf = new Uint8Array(bigW * bigH);

  const daySc = fitScale(bigW, dayStr, Math.max(1, Math.round(bigM / 16)));
  const dateSc = fitScale(bigW, dateStr, Math.max(1, Math.round(bigM / 14)));
  const secSc = fitScale(bigW, secStr, Math.max(1, Math.round(bigM / 10)));

  if (mode === 'date') {
    dtLayoutStack(bigBuf, bigW, bigH, [
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'both') {
    dtLayoutStack(bigBuf, bigW, bigH, [
      { type: 'seg', str: timeStr, idealHFrac: 0.36 },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'full') {
    dtLayoutStack(bigBuf, bigW, bigH, [
      { type: 'seg', str: timeStr, idealHFrac: 0.30 },
      { type: 'text', str: secStr, scale: secSc },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else { // 'time' (default)
    dtLayoutStack(bigBuf, bigW, bigH, [
      { type: 'seg', str: timeStr, idealHFrac: 0.46 },
      { type: 'text', str: secStr, scale: secSc },
    ]);
  }

  for (let y = 0; y < H; y++) {
    const by0 = y * DT_SS;
    for (let x = 0; x < W; x++) {
      const bx0 = x * DT_SS;
      let sum = 0;
      for (let sy = 0; sy < DT_SS; sy++) {
        const row = (by0 + sy) * bigW;
        for (let sx = 0; sx < DT_SS; sx++) sum += bigBuf[row + bx0 + sx];
      }
      dtBuf[y * W + x] = sum / (DT_SS * DT_SS);
    }
  }

  dtGlow(dtBuf, W, H);
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

// ─── "Words" mode - same wrap/stagger logic as datetime.js's (shared
// WC_FONT from _shared.js), pointed at core.setWallPixel/wallW/wallH
// instead of setFaceLED/SIZE. ──────────────────────────────────────────
const { WC_FONT, WC_CHAR_W, WC_LINE_H } = require('./_shared'); // shared word-cascade font

// v is flipped (H-1-v) at the point of writing - same fix/root cause as
// datetime.js's wcDrawGlyph (see its module comment).
// scale multiplies both the glyph cell and its advance width - real report
// ("for the word clock, if space is available 1 or more displays, increase
// font size to fit"): dtBuildWordClockWall picks the largest scale whose
// wrapped text still fits the wall (see wcPickScale) before drawing.
const DT_WC_FONT = { w: 4, h: 7, adv: WC_CHAR_W, get: (ch) => WC_FONT[ch] || WC_FONT[ch.toUpperCase()] };
function wcDrawGlyphWall(core, W, H, ch, su, sv, rgb, scale = 1) {
  // Cell spans rows H-sv-7*scale .. H-1-sv (the v flip described above).
  return drawGlyph(DT_WC_FONT, ch, su, H - sv - 7 * scale, wallPlot(core, rgb[0], rgb[1], rgb[2]), { scale });
}

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
