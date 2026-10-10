// Wall-mode counterpart to apod.js ("Astronomy Pic of the Day"). Decodes the image
// straight at (wallW, wallH) as one continuous picture, with its own fetch state (APOD
// changes daily, so a second poller costs nothing). The title+explanation scroll as one
// 5x7 ticker band near the wall's vertical centre.
'use strict';

const { Jimp } = require('jimp');
const { CHAR_W } = require('./radio/font');
const { drawLinesCentered: drawLinesCenteredText, drawMarquee, FONT_3x5, FONT_5x7, wallPlot } = require('./text');

const nasaConfig = require('../nasaConfig');
const { fetchWithTimeout } = require('./net');
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
    try { r = await fetchWithTimeout(url); }
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

    const resp = await fetchWithTimeout(imgUrl);
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
function drawLinesCentered(core, W, H, lines, scale, r, g, b) {
  drawLinesCenteredText(FONT_3x5, lines, W, H, wallPlot(core, r, g, b), { scale });
}

function buildTicker() {
  tickerLabel = apodData
    ? `   ${apodData.title}   -   ${apodData.explanation}   `.toUpperCase()
    : '   ASTRONOMY PICTURE OF THE DAY   -   LOADING...   ';
}

function drawTicker(core, W, H, dt) {
  if (!tickerLabel) buildTicker();
  const textW = tickerLabel.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = Math.round(H / 2) + 3;
  // The wall draws this font unflipped, glyph spanning rows sv-6..sv.
  drawMarquee(FONT_5x7, tickerLabel, scrollX, sv - 6, W, wallPlot(core, 1, 0.85, 0.48), { outline: wallPlot(core, 0, 0, 0) });
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
