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
// canvas pipeline) and does the same here: the font comes from _shared.js's
// word-cascade engine; the dtWords*()/dtDrawWordLines()/
// dtBuildWordClockToFace() helpers are ported verbatim below.
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
const { drawGlyph, facePlot } = require('./text');

// ─── Numeric clock modes: bitmap-font-into-buffer + hue-remap sampling ────
let dtBuf = null, dtLastSec = -1, dtScrollX = 0;

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

function dtRenderBuf(core, now, mode) {
  const S = core.SIZE;
  if (!dtBuf || dtBuf.length !== S * S) dtBuf = new Uint8Array(S * S);
  else dtBuf.fill(0);

  if (mode === 'analogue') {
    dtDrawAnalogue(dtBuf, S, S, now);
    return;
  }

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const dayStr = DT_DAYS[now.getDay()];
  const dateStr = now.getDate() + ' ' + DT_MONTHS[now.getMonth()];
  const timeStr = hh + ':' + mm;
  const secStr = ':' + ss;

  // Supersampled rendering - real report ("FONT IS AWFUL. ITS NOT SMOOTH...
  // no pixelated edges"): fillRect's per-edge fractional coverage already
  // smooths a shape's own boundary, but every glyph is still laid out and
  // drawn at native 1:1 panel resolution, so a letter's actual strokes are
  // only a few pixels wide with nothing but that single edge softening -
  // still reads as "pixelated" up close. This instead renders the WHOLE
  // layout at DT_SS times the linear resolution into a scratch buffer (all
  // the layout/fit math below is already expressed as fractions of S, so
  // handing it a bigger S "just works" - no other function needs to know)
  // and then box-filter-downsamples every DT_SS x DT_SS block back down to
  // one real pixel. That's true supersampled anti-aliasing - the standard
  // technique for smoothing rasterized vector/text shapes onto a fixed
  // pixel grid - and is as smooth as this can get short of embedding an
  // actual TrueType rasterizer (no such dependency exists in this project
  // and one can't be added here safely - see the PR/commit note for why).
  const bigS = S * DT_SS;
  const bigBuf = new Uint8Array(bigS * bigS);

  const daySc = fitScale(bigS, dayStr, Math.max(1, Math.round(bigS / 16)));
  const dateSc = fitScale(bigS, dateStr, Math.max(1, Math.round(bigS / 14)));
  const secSc = fitScale(bigS, secStr, Math.max(1, Math.round(bigS / 10)));

  if (mode === 'date') {
    dtLayoutStack(bigBuf, bigS, bigS, [
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'both') {
    dtLayoutStack(bigBuf, bigS, bigS, [
      { type: 'seg', str: timeStr, idealHFrac: 0.36 },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else if (mode === 'full') {
    dtLayoutStack(bigBuf, bigS, bigS, [
      { type: 'seg', str: timeStr, idealHFrac: 0.30 },
      { type: 'text', str: secStr, scale: secSc },
      { type: 'text', str: dayStr, scale: daySc },
      { type: 'text', str: dateStr, scale: dateSc },
    ]);
  } else { // 'time' (default)
    dtLayoutStack(bigBuf, bigS, bigS, [
      { type: 'seg', str: timeStr, idealHFrac: 0.46 },
      { type: 'text', str: secStr, scale: secSc },
    ]);
  }

  for (let y = 0; y < S; y++) {
    const by0 = y * DT_SS;
    for (let x = 0; x < S; x++) {
      const bx0 = x * DT_SS;
      let sum = 0;
      for (let sy = 0; sy < DT_SS; sy++) {
        const row = (by0 + sy) * bigS;
        for (let sx = 0; sx < DT_SS; sx++) sum += bigBuf[row + bx0 + sx];
      }
      dtBuf[y * S + x] = sum / (DT_SS * DT_SS);
    }
  }

  dtGlow(dtBuf, S, S);
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
// WC_CHAR_W/WC_LINE_H come from _shared.js's word-cascade engine.
const { WC_FONT, WC_CHAR_W, WC_LINE_H } = require('./_shared'); // shared word-cascade font

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
// scale multiplies both the glyph cell and its advance width - real report
// ("for the word clock, if space is available 1 or more displays, increase
// font size to fit"): dtBuildWordClockToFace picks the largest scale whose
// wrapped text still fits the panel (see wcPickScale) before drawing.
const DT_WC_FONT = { w: 4, h: 7, adv: WC_CHAR_W, get: (ch) => WC_FONT[ch] || WC_FONT[ch.toUpperCase()] };
function wcDrawGlyph(core, face, ch, su, sv, rgb, scale = 1) {
  // Cell spans rows S-sv-7*scale .. S-1-sv (the v flip described above).
  return drawGlyph(DT_WC_FONT, ch, su, core.SIZE - sv - 7 * scale, facePlot(core, face, rgb[0], rgb[1], rgb[2]), { scale });
}

function dtDrawWordLines(core, face, lines, startRow, scale = 1) {
  const S = core.SIZE;
  const charW = WC_CHAR_W * scale, lineH = WC_LINE_H * scale;
  let row = startRow;
  lines.forEach((line) => {
    const lineW = line.reduce((a, t) => a + t.t.length * charW, 0) + Math.max(0, line.length - 1) * charW;
    const margin = Math.max(0, S - lineW);
    const sv = (S - 1) - 1 - 6 * scale - row * lineH;
    if (sv + 6 * scale < 0) { row++; return; }
    let su = Math.round(margin * DT_STAGGER_FRACS[row % DT_STAGGER_FRACS.length]);
    line.forEach((tok) => {
      let u = su;
      for (const ch of tok.t) u += wcDrawGlyph(core, face, ch, u, sv, tok.c, scale);
      su += tok.t.length * charW + charW;
    });
    row++;
  });
  return row;
}

// Picks the largest integer glyph scale whose wrapped time+date text stack
// still fits vertically within S ("increase font size to fit" when a
// bigger panel/wall leaves room to spare, instead of always using the
// smallest-panel-safe fixed size).
function wcPickScale(S, timeTokens, dateTokens) {
  for (let s = 4; s >= 1; s--) {
    const tLines = dtWrapTokens(timeTokens, S, s);
    const dLines = dtWrapTokens(dateTokens, S, s);
    const rows = tLines.length + 1 + dLines.length;
    if (rows * WC_LINE_H * s <= S) return s;
  }
  return 1;
}

function dtBuildWordClockToFace(core, face, now) {
  const S = core.SIZE;
  const timeTok = dtWordsForTime(now.getHours(), now.getMinutes());
  const dateTok = dtWordsForDate(now);
  const scale = wcPickScale(S, timeTok, dateTok);
  let row = 0;
  row = dtDrawWordLines(core, face, dtWrapTokens(timeTok, S, scale), row, scale);
  row += 1;
  row = dtDrawWordLines(core, face, dtWrapTokens(dateTok, S, scale), row, scale);
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
