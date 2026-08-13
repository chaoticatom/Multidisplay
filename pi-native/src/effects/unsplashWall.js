// Wall-mode counterpart to unsplash.js ("Unsplash Photo Slideshow").
//
// Shape check (per the batch brief): the cube version's full-cube mode
// staggers 6 independent per-face slideshows via the shared gallery engine
// - that doesn't map onto a single stitched wall canvas (a photo gallery on
// a wall should show ONE big photo, not several out-of-sync slideshows
// tiled across panels). So this follows the cube version's OWN 2D-panel
// branch in spirit (one photo, crossfading) but stretched across the full
// wallW x wallH canvas instead of one SIZE-square panel - closer to
// apodWall.js's "one continuous image" shape, per the brief.
//
// Fetch/decode/config (unsplashConfig.js, doFetch, load()) is reused
// VERBATIM from unsplash.js's own module-level logic below, just
// re-declared in this file's own module scope (own siloed state, same
// "don't collide across registries" reasoning as camWall.js's module
// comment - this can run alongside the cube effect under a different
// panelConfig mode without stepping on its `photos`/`pixels` arrays).
// Only the pixel-output step differs: galleryApplyToWall/
// galleryApplyBlendToWall (new wallW x wallH-aware siblings added to
// _shared.js) stretch the decoded SxS photo to fill the wall, in place of
// the cube version's per-face galleryApplyToFace/galleryApplyBlendToFace.
'use strict';

const unsplashConfig = require('../unsplashConfig');
const {
  loadImageForPixels, galleryApplyToWall, galleryApplyBlendToWall,
} = require('./_shared');

const FADE_DUR = 1.0;

let photos = [];
let idx = 0;
let fetching = false;
let error = '';
let t = 0;
let timer = 0;

let pixels = [];
let sizes = [];

let nextIdx = null;
let fadeT = 0;

let lastQueryUsed = null;
let lastKeyUsed = null;
let lastPrevToken = null;
let lastNextToken = null;
let _letterbox = true;
let _speedSecs = 8;

const status = { text: 'Enter your Unsplash API key below to start' };
function getStatus() {
  return { text: status.text, count: photos.length, index: idx, error: error || null, fetching };
}

function load(i) {
  if (!photos[i] || pixels[i] != null) return;
  pixels[i] = false;
  const sz = 64; // decode at full cube resolution, then stretched to the wall at blit time - see galleryApplyToWall
  const imgUrl = photos[i].urls.regular + '&w=' + (sz * 4) + '&h=' + (sz * 4);
  loadImageForPixels(imgUrl, sz, { letterbox: _letterbox })
    .then(({ pixels: px, size }) => { sizes[i] = size; pixels[i] = px; })
    .catch(() => { pixels[i] = 'error'; });
}

async function doFetch(apiKey, query) {
  if (fetching) return;
  fetching = true; error = '';
  status.text = 'Searching Unsplash…';
  try {
    const q = encodeURIComponent(query || 'nature');
    const url = `https://api.unsplash.com/photos/random?query=${q}&count=30&client_id=${apiKey}`;
    let r;
    try { r = await fetch(url); }
    catch (fe) { error = 'Network error — check connection'; throw fe; }
    if (r.status === 401) { error = 'Invalid API key'; throw new Error('401'); }
    if (r.status === 403) { error = 'Rate limited — 50 req/hr on free tier'; throw new Error('403'); }
    if (!r.ok) { error = 'Unsplash error ' + r.status; throw new Error(String(r.status)); }
    const data = await r.json();
    const found = (Array.isArray(data) ? data : []).filter((p) => p.urls && p.urls.regular);
    if (!found.length) { error = 'No photos found for "' + query + '"'; throw new Error('empty'); }
    photos = found;
    idx = 0; nextIdx = null; fadeT = 0;
    pixels = new Array(found.length).fill(null);
    sizes = new Array(found.length).fill(0);
    timer = 0;
    status.text = found.length + ' photos — ' + query;
    load(0);
  } catch (e) {
    status.text = '✕ ' + (error || (e && e.message) || 'fetch failed');
    if (process.env.UNSPLASH_DEBUG) console.error('[unsplashWall] fetch failed:', e);
  } finally {
    fetching = false;
  }
}

function maybeFetch(core) {
  const cfg = unsplashConfig.load();
  const apiKey = (cfg.apiKey || '').trim();
  const query = (cfg.query || 'nature').trim();

  if (!apiKey) {
    error = '';
    status.text = 'Enter your Unsplash API key below to start';
    photos = []; pixels = []; sizes = [];
    lastKeyUsed = null; lastQueryUsed = null;
    return;
  }

  const queryChanged = lastQueryUsed !== null && lastQueryUsed !== query;
  const keyChanged = lastKeyUsed !== null && lastKeyUsed !== apiKey;
  if (lastKeyUsed === null || lastQueryUsed === null) { lastKeyUsed = apiKey; lastQueryUsed = query; doFetch(apiKey, query); return; }
  if (queryChanged || keyChanged) { lastKeyUsed = apiKey; lastQueryUsed = query; doFetch(apiKey, query); return; }
  if (!photos.length && !fetching && !error) doFetch(apiKey, query);

  const opts = core.effectOptions?.unsplash || {};
  if (opts.prevToken != null && opts.prevToken !== lastPrevToken) {
    lastPrevToken = opts.prevToken;
    if (photos.length) { idx = (idx - 1 + photos.length) % photos.length; load(idx); timer = 0; nextIdx = null; fadeT = 0; }
  }
  if (opts.nextToken != null && opts.nextToken !== lastNextToken) {
    lastNextToken = opts.nextToken;
    if (photos.length) { idx = (idx + 1) % photos.length; load(idx); timer = 0; nextIdx = null; fadeT = 0; }
  }
  _speedSecs = Number(opts.speedSecs) > 0 ? Number(opts.speedSecs) : 8;

  const wantLetterbox = opts.letterbox !== false;
  if (wantLetterbox !== _letterbox) {
    _letterbox = wantLetterbox;
    pixels = new Array(photos.length).fill(null);
    sizes = new Array(photos.length).fill(0);
    load(idx);
  }
}

function effectUnsplashWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  maybeFetch(core);

  if (!photos.length) return; // blank canvas while waiting - same "no placeholder text yet" gap camWall.js leaves for its equivalent idle state

  const opts = core.effectOptions?.unsplash || {};
  const slideshowOn = opts.slideshowOn !== false;
  const n = photos.length;

  load(idx);
  if (nextIdx != null) load(nextIdx);

  if (fadeT > 0) {
    const nextPixels = pixels[nextIdx];
    if (nextPixels === 'error') {
      nextIdx = (nextIdx + 1) % n;
      load(nextIdx);
    } else if (nextPixels) {
      fadeT += dt;
      if (fadeT >= FADE_DUR) { idx = nextIdx; nextIdx = null; fadeT = 0; }
    }
  } else if (slideshowOn) {
    timer += dt;
    if (timer >= _speedSecs) {
      timer -= _speedSecs;
      nextIdx = (idx + 1) % n;
      load(nextIdx);
      fadeT = 0.0001;
    }
  }

  let shown;
  if (fadeT > 0 && nextIdx != null) shown = galleryApplyBlendToWall(core, pixels, sizes, idx, nextIdx, Math.min(1, fadeT / FADE_DUR));
  else shown = galleryApplyToWall(core, pixels, sizes, idx);
  if (!shown) return; // still loading first frame - leave blank rather than draw text over a partial canvas
}

module.exports = effectUnsplashWall;
module.exports.getStatus = getStatus;
