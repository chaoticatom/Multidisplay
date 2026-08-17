// Ported from effects-livedata.js's effectAPOD() (~line 3653) and its
// surrounding APOD state/helpers (~line 3425-3651). NASA's "Astronomy
// Picture of the Day" API: one JSON call returns today's title/explanation/
// image URL; the browser then decodes that image into pixels with
// loadImageForPixels() and paints it on 5 faces (face 1 is reserved for a
// scrolling title+explanation ticker) plus a canvas-rendered marquee.
//
// Two things are deliberately NOT ported, both because they exist only to
// serve the shared ".art-shared-panel" Slideshow/Prev/Next controls that
// also drive Unsplash and Art Gallery - neither of which is ported to
// pi-native yet, so there is nothing for that shared panel to attach to
// here (see the task note: "don't invent wiring for shared controls tied
// to unported sibling effects"):
//   - apodFetchHistory()'s 30-day history browsing/slideshow mode
//     (apodBrowsingHistory/apodHistory/apodGoPrev/apodGoNext)
//   - the apodLetterbox toggle (there's no backend option for it here;
//     see below for the fixed choice this port makes instead)
// Everything else - single "today's picture" fetch, daily refresh cadence,
// retry-with-backoff on error, image-on-5-faces + ticker-on-face-1 layout -
// is a faithful port.
//
// Image decode/resize: no DOM/Canvas here, so this uses `jimp` the same way
// cam.js does. The browser's loadImageForPixels(..., {letterbox}) defaults
// to letterbox:true ("full image, preserve ratio") - reproduced here with
// Jimp's contain() (fit within SIZE x SIZE preserving aspect) composited
// onto a black SIZE x SIZE background, rather than cam.js's plain resize()
// (which stretches/crops), since letterboxed is APOD's actual default.
//
// Ticker text: the browser built a whole off-screen <canvas> glyph strip
// with the system font. No Canvas here, so this reuses radio/font.js's
// self-contained 5x7 bitmap font + the same "scroll left, wrap at text
// width" approach as radio/ticker.js, just driving it directly instead of
// importing that module (its label/placement conventions - bottom row -
// don't fit APOD's full-height marquee).
'use strict';

const { Jimp } = require('jimp');
const { drawGlyph, CHAR_W } = require('./radio/font');

const nasaConfig = require('../nasaConfig');
// Live-read (not a frozen constant) so a key entered via the UI takes
// effect on the next fetch without a restart - see nasaConfig.js's module
// comment for the real report this fixes.
function NASA_API_KEY() { return nasaConfig.currentKey(); }
const APOD_REFRESH_SEC = 24 * 60 * 60; // APOD content only changes once/day - matches the source's 86400s check

let apodData = null;       // {title, explanation, date, mediaType, url}
let fetching = false;
let lastAttemptMs = -Infinity; // fetch immediately on first tick, like cam.js
let lastFetchMs = 0;
let error = '';
let retryAfterMs = 60000;

let imgPixels = null;      // RGBA Buffer, SIZE*SIZE*4, letterboxed onto black
let imgSize = 0;           // SIZE the buffer above was decoded at
let imgReady = false;
let imgError = '';

let tickerLabel = '';      // built from apodData once it's ready
let scrollX = 0;
let t = 0; // for the "..." waiting-dots animation
let lastRefreshToken = null; // core.effectOptions.apod.refresh - see app.js's "Refresh" button

const status = { text: 'Not fetched yet' };
function getStatus() {
  return {
    text: status.text,
    title: apodData?.title || null,
    date: apodData?.date || null,
    mediaType: apodData?.mediaType || null,
    fetching, error: error || null,
  };
}

function maybeFetch(core) {
  if (fetching) return;
  const now = Date.now();
  // Manual "Refresh" button in the control page - see app.js's
  // wireApodPanel(), same monotonic-token trick as maze.js's "NEW MAZE".
  const refreshToken = core.effectOptions?.apod?.refresh;
  const forced = refreshToken != null && refreshToken !== lastRefreshToken;
  if (forced) { lastRefreshToken = refreshToken; error = ''; lastFetchMs = 0; lastAttemptMs = 0; }
  if (!forced) {
    if (apodData && now - lastFetchMs < APOD_REFRESH_SEC * 1000 && !error) return;
    if (error && now - lastAttemptMs < retryAfterMs) return;
    if (!apodData && !error && now - lastAttemptMs < 1000) return; // avoid hammering while the very first request is in flight
  }
  lastAttemptMs = now;
  fetching = true;
  status.text = 'Fetching astronomy picture of the day…';

  (async () => {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY()}`;
    let r;
    try {
      r = await fetch(url);
    } catch (fe) {
      retryAfterMs = 5000;
      throw new Error('Network error — check connection');
    }
    if (r.status === 429) { retryAfterMs = 60000; throw new Error('Rate limited — get a free key at api.nasa.gov'); }
    if (r.status === 503 || r.status === 502 || r.status === 504) { retryAfterMs = 5000; throw new Error('NASA servers down (' + r.status + ') — retrying…'); }
    if (!r.ok) throw new Error('NASA API error ' + r.status + ' — try again later');
    const d = await r.json();
    const isVideo = d.media_type === 'video';
    const imgUrl = isVideo ? (d.thumbnail_url || null) : (d.url || d.hdurl || null);
    apodData = {
      title: d.title || 'Astronomy Picture of the Day',
      explanation: d.explanation || '',
      date: d.date || '',
      mediaType: d.media_type || 'image',
      url: imgUrl,
    };
    error = '';
    lastFetchMs = Date.now();
    imgReady = false; imgError = ''; imgPixels = null; tickerLabel = '';
    status.text = apodData.title + (imgUrl ? ' — loading image…' : ' (no image)');
    if (!imgUrl) return;

    const SIZE = core.SIZE;
    const resp = await fetch(imgUrl);
    if (!resp.ok) throw new Error('Could not load image (HTTP ' + resp.status + ')');
    const buf = Buffer.from(await resp.arrayBuffer());
    const src = await Jimp.read(buf);
    src.contain({ w: SIZE, h: SIZE });
    const bg = new Jimp({ width: SIZE, height: SIZE, color: 0x000000ff });
    bg.composite(src, 0, 0);
    imgPixels = bg.bitmap.data;
    imgSize = SIZE;
    imgReady = true;
    status.text = apodData.title;
  })().catch((err) => {
    if (apodData && !apodData.url) {
      // "(no image)" branch above threw nothing - only real failures land here
    }
    error = err.message || 'fetch failed';
    lastAttemptMs = Date.now();
    if (imgPixels === null) imgError = imgError || 'Could not load image';
    status.text = '✕ ' + error;
    if (process.env.APOD_DEBUG) console.error('[apod] fetch failed:', err);
  }).finally(() => {
    fetching = false;
  });
}

// Paints the letterboxed image onto one face - same u/v -> source-pixel
// math as the browser's apodApplyImageToFace(), just addressed through
// core.setFaceLED() instead of faceMap/colBuf directly.
function applyImageToFace(core, face) {
  const S = core.SIZE, IS = imgSize;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const su = Math.min(IS - 1, Math.floor(u / S * IS));
      const sv = Math.min(IS - 1, Math.floor((S - 1 - v) / S * IS));
      const pi = (sv * IS + su) * 4;
      core.setFaceLED(face, u, v, imgPixels[pi] / 255, imgPixels[pi + 1] / 255, imgPixels[pi + 2] / 255);
    }
  }
}

// Centered placeholder/error text, 1-3 short lines, using the shared 3x5
// PIXEL_FONT via a tiny local drawer (same approach coinflip.js/celestial.js
// use) - not the 5x7 ticker font, which is sized for scrolling one line.
const { PIXEL_FONT } = require('./weather/font');
function drawGlyph3x5(core, face, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  const S = core.SIZE;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const u = su + col * scale + sx, v = sv + row * scale + sy;
        if (u < 0 || u >= S || v < 0 || v >= S) continue;
        core.setFaceLED(face, u, v, r, g, b);
      }
    }
  }
  return 4 * scale;
}
function textWidth3x5(str, scale) { return str.length * 4 * scale - scale; }
function drawLinesCentered(core, face, lines, scale, r, g, b) {
  const S = core.SIZE;
  const lineH = 6 * scale;
  const totalH = lines.length * lineH;
  let sv = Math.round((S - totalH) / 2);
  for (const line of lines) {
    let su = Math.round((S - textWidth3x5(line, scale)) / 2);
    for (const ch of line) su += drawGlyph3x5(core, face, ch, su, sv, scale, r, g, b);
    sv += lineH;
  }
}

// Builds the face-1 scrolling ticker label the first time apodData is
// ready - equivalent to apodBuildTicker() but as a plain uppercase string
// (radio/font.js is uppercase-only) instead of a canvas glyph strip.
function buildTicker() {
  if (apodData) {
    tickerLabel = `   ${apodData.title}   -   ${apodData.explanation}   `.toUpperCase();
  } else {
    tickerLabel = '   ASTRONOMY PICTURE OF THE DAY   -   LOADING...   ';
  }
}

function drawTicker(core, face, dt) {
  if (!tickerLabel) buildTicker();
  const textW = tickerLabel.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const S = core.SIZE;
  const sv = Math.round(S / 2) + 3; // vertically centered baseline, matching the source's full-face-height marquee
  const rgb = [1, 0.85, 0.48];
  let u = -Math.floor(scrollX);
  while (u < S) {
    for (const ch of tickerLabel) {
      u += drawGlyph(core, face, ch, u, sv, rgb);
      if (u > S) break;
    }
  }
}

function apod(core, dt) {
  t += dt;
  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  maybeFetch(core);

  if (imgReady && imgPixels) {
    for (let f = 0; f < 6; f++) if (f !== 1) applyImageToFace(core, f);
  } else if (error) {
    const waitLeftMs = Math.max(0, retryAfterMs - (Date.now() - lastAttemptMs));
    const dots = waitLeftMs > 0 ? '.'.repeat(1 + (Math.floor(t) % 3)) : '';
    for (let f = 0; f < 6; f++) if (f !== 1) drawLinesCentered(core, f, ['API', 'ERROR', dots], 2, 1, 0.25, 0.25);
  } else if (imgError) {
    for (let f = 0; f < 6; f++) if (f !== 1) drawLinesCentered(core, f, ['IMAGE', 'ERROR'], 2, 1, 0.4, 0.1);
  } else {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    for (let f = 0; f < 6; f++) if (f !== 1) drawLinesCentered(core, f, ['APOD', dots], 2, 0.35, 0.65, 1);
  }

  const is2D = core.panelMode === '2d';
  if (!is2D) drawTicker(core, 1, dt * (core.speedMult || 1));
}

module.exports = apod;
module.exports.getStatus = getStatus;
