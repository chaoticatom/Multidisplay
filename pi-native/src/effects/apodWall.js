// Wall-mode counterpart to apod.js ("Astronomy Pic of the Day").
//
// Shape check (per the batch brief): apod.js paints the SAME letterboxed
// image on all 5 non-ticker faces (`for f=0..6, f!==1) applyImageToFace`) -
// no per-face variation, no centered-scene math, just "one image, shown
// everywhere". That's the coinflipWall.js/camWall.js "single continuous
// image stretched across the whole wallW x wallH canvas" shape, not a
// centered scene - so this follows camWall.js's pattern directly: decode
// the fetched image straight at (wallW, wallH) rather than re-stretching a
// SIZE x SIZE decode, and keep its own siloed fetch/decode state separate
// from apod.js's (same "own state, don't collide across registries"
// reasoning as camWall.js's module comment - NASA APOD only changes once a
// day, so a second independent poller here costs nothing worth sharing a
// module for, unlike epic.js/iss.js's 5s-60s cadence 3rd-party APIs which
// this batch DID wire up to share fetch state via ensureFetches()).
//
// Ticker: same 5x7 bitmap-font scrolling technique apod.js's drawTicker
// uses (radio/font.js's drawGlyph/CHAR_W), just addressed through
// core.setWallPixel across the full wall width/height band instead of one
// SIZE x SIZE face - title+explanation scroll along a band near vertical
// center of the whole wall, one continuous ticker, not duplicated per panel.
'use strict';

const { Jimp } = require('jimp');
const { drawGlyph, CHAR_W } = require('./radio/font');
const { PIXEL_FONT } = require('./weather/font');

const nasaConfig = require('../nasaConfig');
// Live-read (not a frozen constant) so a key entered via the UI takes
// effect on the next fetch without a restart - see nasaConfig.js's module
// comment for the real report this fixes.
function NASA_API_KEY() { return nasaConfig.currentKey(); }
const APOD_REFRESH_SEC = 24 * 60 * 60;

let apodData = null;
let fetching = false;
let lastAttemptMs = -Infinity;
let lastFetchMs = 0;
let error = '';
let retryAfterMs = 60000;

let imgPixels = null;   // RGBA Buffer, wallW*wallH*4, letterboxed onto black
let imgW = 0, imgH = 0; // resolution the buffer above was decoded at
let imgReady = false;
let imgError = '';

let tickerLabel = '';
let scrollX = 0;
let t = 0;
let lastRefreshToken = null;

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

function maybeFetch(core, W, H) {
  if (fetching) return;
  const now = Date.now();
  const refreshToken = core.effectOptions?.apod?.refresh;
  const forced = refreshToken != null && refreshToken !== lastRefreshToken;
  if (forced) { lastRefreshToken = refreshToken; error = ''; lastFetchMs = 0; lastAttemptMs = 0; }
  if (!forced) {
    if (apodData && now - lastFetchMs < APOD_REFRESH_SEC * 1000 && !error) return;
    if (error && now - lastAttemptMs < retryAfterMs) return;
    if (!apodData && !error && now - lastAttemptMs < 1000) return;
  }
  lastAttemptMs = now;
  fetching = true;
  status.text = 'Fetching astronomy picture of the day…';

  (async () => {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY()}`;
    let r;
    try { r = await fetch(url); }
    catch (fe) { retryAfterMs = 5000; throw new Error('Network error — check connection'); }
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

    const resp = await fetch(imgUrl);
    if (!resp.ok) throw new Error('Could not load image (HTTP ' + resp.status + ')');
    const buf = Buffer.from(await resp.arrayBuffer());
    const src = await Jimp.read(buf);
    src.contain({ w: W, h: H });
    const bg = new Jimp({ width: W, height: H, color: 0x000000ff });
    bg.composite(src, 0, 0);
    imgPixels = bg.bitmap.data;
    imgW = W; imgH = H;
    imgReady = true;
    status.text = apodData.title;
  })().catch((err) => {
    error = err.message || 'fetch failed';
    lastAttemptMs = Date.now();
    if (imgPixels === null) imgError = imgError || 'Could not load image';
    status.text = '✕ ' + error;
    if (process.env.APOD_DEBUG) console.error('[apodWall] fetch failed:', err);
  }).finally(() => {
    fetching = false;
  });
}

function applyImageToWall(core, W, H) {
  for (let y = 0; y < H; y++) {
    const sy = Math.min(imgH - 1, Math.floor(y / H * imgH));
    for (let x = 0; x < W; x++) {
      const sx = Math.min(imgW - 1, Math.floor(x / W * imgW));
      const pi = (sy * imgW + sx) * 4;
      core.setWallPixel(x, y, imgPixels[pi] / 255, imgPixels[pi + 1] / 255, imgPixels[pi + 2] / 255);
    }
  }
}

// Centered placeholder/error text (same 3x5 glyph approach apod.js's
// drawLinesCentered uses, just against core.setWallPixel).
function glyphWall(core, W, H, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        const u = su + col * scale + sx, v = sv + row * scale + sy;
        if (u < 0 || u >= W || v < 0 || v >= H) continue;
        core.setWallPixel(u, v, r, g, b);
      }
    }
  }
  return 4 * scale;
}
function textWidth3x5(str, scale) { return str.length * 4 * scale - scale; }
function drawLinesCentered(core, W, H, lines, scale, r, g, b) {
  const lineH = 6 * scale;
  const totalH = lines.length * lineH;
  let sv = Math.round((H - totalH) / 2);
  for (const line of lines) {
    let su = Math.round((W - textWidth3x5(line, scale)) / 2);
    for (const ch of line) su += glyphWall(core, W, H, ch, su, sv, scale, r, g, b);
    sv += lineH;
  }
}

function buildTicker() {
  tickerLabel = apodData
    ? `   ${apodData.title}   -   ${apodData.explanation}   `.toUpperCase()
    : '   ASTRONOMY PICTURE OF THE DAY   -   LOADING...   ';
}

// radio/font.js's drawGlyph is addressed through core.setFaceLED/core.SIZE -
// same glyph bitmap (5x7, drawn upward from a baseline at sv), reimplemented
// against core.setWallPixel/wallW/wallH instead.
const { FONT: RADIO_GLYPHS } = require('./radio/font');
function drawGlyphWall(core, W, H, ch, su, sv, rgb) {
  const rows = RADIO_GLYPHS[ch.toUpperCase()] || RADIO_GLYPHS['?'];
  for (let ry = 0; ry < 7; ry++) {
    const bits = rows[ry];
    const y = sv - (6 - ry);
    if (y < 0 || y >= H) continue;
    for (let rx = 0; rx < 5; rx++) {
      if (!(bits & (1 << (4 - rx)))) continue;
      const x = su + rx;
      if (x < 0 || x >= W) continue;
      core.setWallPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
  return CHAR_W;
}

function drawTicker(core, W, H, dt) {
  if (!tickerLabel) buildTicker();
  const textW = tickerLabel.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = Math.round(H / 2) + 3;
  const rgb = [1, 0.85, 0.48];
  let u = -Math.floor(scrollX);
  while (u < W) {
    for (const ch of tickerLabel) {
      u += drawGlyphWall(core, W, H, ch, u, sv, rgb);
      if (u > W) break;
    }
  }
}

function effectApodWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  maybeFetch(core, W, H);

  if (imgReady && imgPixels && imgW === W && imgH === H) {
    applyImageToWall(core, W, H);
  } else if (error) {
    const waitLeftMs = Math.max(0, retryAfterMs - (Date.now() - lastAttemptMs));
    const dots = waitLeftMs > 0 ? '.'.repeat(1 + (Math.floor(t) % 3)) : '';
    drawLinesCentered(core, W, H, ['API', 'ERROR', dots], 2, 1, 0.25, 0.25);
  } else if (imgError) {
    drawLinesCentered(core, W, H, ['IMAGE', 'ERROR'], 2, 1, 0.4, 0.1);
  } else {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    drawLinesCentered(core, W, H, ['APOD', dots], 2, 0.35, 0.65, 1);
  }

  drawTicker(core, W, H, dt * (core.speedMult || 1));
}

module.exports = effectApodWall;
module.exports.getStatus = getStatus;
