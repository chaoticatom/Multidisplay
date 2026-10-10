// Unsplash photo slideshow: fetches photos/random (count=30) and shows them via the
// shared gallery engine in _shared.js - a different staggered, crossfading photo per
// face in cube mode, one in 2D mode. The Access Key is stored server-side
// (unsplashConfig.js, set via setUnsplashConfig); without one a placeholder card is
// shown and nothing is fetched. Images decode via _shared.js's loadImageForPixels().
'use strict';

const unsplashConfig = require('../unsplashConfig');
const { fetchWithTimeout } = require('./net');
const {
  galleryInitFaceState, gallerySlideshowStep, galleryApplyToFace, galleryApplyBlendToFace,
  loadImageForPixels, drawLinesCentered3x5,
} = require('./_shared');

const FADE_DUR = 1.0;

let photos = [];           // [{urls:{regular}, user:{name}, description, alt_description}, ...]
let idx = 0;
let fetching = false;
let error = '';
let lastFetchMs = 0;
let t = 0;
let timer = 0;
let faceState = null;

let pixels = [];            // per-photo: RGBA buffer | 'error' | false(loading) | null(not requested)
let sizes = [];

let lastQueryUsed = null;   // detects a query change so a new search is triggered
let lastKeyUsed = null;     // detects an apiKey change (Save button) so a new search is triggered
let lastPrevToken = null;
let lastNextToken = null;
let _letterbox = true;      // driven by the shared .art-shared-panel letterbox checkbox (core.effectOptions.unsplash.letterbox), not persisted (transient, same as the browser's in-memory unsplashLetterbox)

const status = { text: 'Enter your Unsplash API key below to start' };
function getStatus() {
  return { text: status.text, count: photos.length, index: idx, error: error || null, fetching };
}

function initFaceState() {
  faceState = galleryInitFaceState(photos.length, currentSpeedSecs());
}

let _speedSecs = 8;
function currentSpeedSecs() { return _speedSecs; }

function load(i) {
  if (!photos[i] || pixels[i] != null) return;
  pixels[i] = false;
  const sz = 64; // decode at full cube resolution regardless of core.SIZE, matches the browser's Math.max(SIZE,32) intent of "always enough detail"
  const imgUrl = photos[i].urls.regular + '&w=' + (sz * 4) + '&h=' + (sz * 4);
  loadImageForPixels(imgUrl, sz, { letterbox: _letterbox })
    .then(({ pixels: px, size }) => { sizes[i] = size; pixels[i] = px; })
    .catch(() => { pixels[i] = 'error'; });
}

async function doFetch(core, apiKey, query) {
  if (fetching) return;
  fetching = true; error = '';
  status.text = 'Searching Unsplash…';
  try {
    const q = encodeURIComponent(query || 'nature');
    const url = `https://api.unsplash.com/photos/random?query=${q}&count=30&client_id=${apiKey}`;
    let r;
    try { r = await fetchWithTimeout(url); }
    catch (fe) { error = 'Network error — check connection'; throw fe; }
    if (r.status === 401) { error = 'Invalid API key'; throw new Error('401'); }
    if (r.status === 403) { error = 'Rate limited — 50 req/hr on free tier'; throw new Error('403'); }
    if (!r.ok) { error = 'Unsplash error ' + r.status; throw new Error(String(r.status)); }
    const data = await r.json();
    const found = (Array.isArray(data) ? data : []).filter((p) => p.urls && p.urls.regular);
    if (!found.length) { error = 'No photos found for "' + query + '"'; throw new Error('empty'); }
    photos = found;
    idx = 0;
    pixels = new Array(found.length).fill(null);
    sizes = new Array(found.length).fill(0);
    lastFetchMs = Date.now();
    timer = 0;
    faceState = null;
    status.text = found.length + ' photos — ' + query;
    load(0);
  } catch (e) {
    lastFetchMs = Date.now();
    status.text = '✕ ' + (error || (e && e.message) || 'fetch failed');
    if (process.env.UNSPLASH_DEBUG) console.error('[unsplash] fetch failed:', e);
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
    photos = []; pixels = []; sizes = []; faceState = null;
    lastKeyUsed = null; lastQueryUsed = null;
    return;
  }

  const queryChanged = lastQueryUsed !== null && lastQueryUsed !== query;
  const keyChanged = lastKeyUsed !== null && lastKeyUsed !== apiKey;
  if (lastKeyUsed === null || lastQueryUsed === null) { lastKeyUsed = apiKey; lastQueryUsed = query; doFetch(core, apiKey, query); return; }
  if (queryChanged || keyChanged) { lastKeyUsed = apiKey; lastQueryUsed = query; doFetch(core, apiKey, query); return; }
  if (!photos.length && !fetching && !error) doFetch(core, apiKey, query);

  // Prev/Next buttons drive monotonic tokens (same trick as apod.js's
  // "Refresh" - see core.effectOptions.unsplash.{prevToken,nextToken}).
  const opts = core.effectOptions?.unsplash || {};
  if (opts.prevToken != null && opts.prevToken !== lastPrevToken) {
    lastPrevToken = opts.prevToken;
    if (photos.length) { idx = (idx - 1 + photos.length) % photos.length; load(idx); timer = 0; }
  }
  if (opts.nextToken != null && opts.nextToken !== lastNextToken) {
    lastNextToken = opts.nextToken;
    if (photos.length) { idx = (idx + 1) % photos.length; load(idx); timer = 0; }
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

function effectUnsplash(core, dt) {
  t += dt;
  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  maybeFetch(core);

  if (!photos.length) {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    const label = error ? ['API', 'ERROR'] : (unsplashConfig.load().apiKey ? ['UNSPLASH', dots] : ['ENTER', 'API KEY']);
    for (let f = 0; f < 6; f++) drawLinesCentered3x5(core, f, label, 2, 0.1, 0.7, 0.4);
    return;
  }

  const opts = core.effectOptions?.unsplash || {};
  const slideshowOn = opts.slideshowOn !== false;
  const speedSecs = currentSpeedSecs();

  if (slideshowOn) {
    timer += dt;
    if (timer >= speedSecs) { timer = 0; idx = (idx + 1) % photos.length; }
  }

  const is2D = core.panelMode === '2d';
  if (is2D) {
    load(idx);
    load((idx + 1) % photos.length);
    const shown = galleryApplyToFace(core, pixels, sizes, 0, idx);
    if (!shown) {
      const dots = '.'.repeat(1 + (Math.floor(t) % 3));
      const lines = pixels[idx] === 'error' ? ['NO IMAGE'] : ['PHOTO', dots];
      drawLinesCentered3x5(core, 0, lines, 2, 0.1, 0.7, 0.4);
    }
    return;
  }

  const n = photos.length;
  if (!faceState || faceState.length !== 6) initFaceState();
  for (let f = 0; f < 6; f++) {
    const st = faceState[f];
    gallerySlideshowStep(st, n, dt, speedSecs, FADE_DUR, slideshowOn, load, pixels);

    let shown;
    if (st.fadeT > 0 && st.nextIdx != null) shown = galleryApplyBlendToFace(core, pixels, sizes, f, st.curIdx, st.nextIdx, Math.min(1, st.fadeT / FADE_DUR));
    else shown = galleryApplyToFace(core, pixels, sizes, f, st.curIdx);

    if (!shown) {
      const dots = '.'.repeat(1 + (Math.floor(t) % 3));
      const lines = pixels[st.curIdx] === 'error' ? ['NO IMAGE'] : ['PHOTO', dots];
      drawLinesCentered3x5(core, f, lines, 2, 0.1, 0.7, 0.4);
    }
  }
}

module.exports = effectUnsplash;
module.exports.getStatus = getStatus;
