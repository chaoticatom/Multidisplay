// Ported from effects-livedata.js's Metropolitan Museum of Art gallery
// section (effect key `artic`, ~line 3904 onward: articWorks/articFetch/
// articLoad/articApplyToFace/articApplyBlendToFace/effectArtic). Public,
// keyless collection API - two-step search (by query, default "painting")
// -> object-details fetch for up to 40 random results, keeping only
// public-domain entries with a primaryImageSmall. Same full-cube staggered
// slideshow / 2D single-photo split as unsplash.js, via the shared gallery
// engine in _shared.js.
//
// Image decode/resize: shared loadImageForPixels() helper in _shared.js
// (Jimp-based), same as unsplash.js/cam.js/apod.js.
'use strict';

const {
  galleryInitFaceState, gallerySlideshowStep, galleryApplyToFace, galleryApplyBlendToFace,
  loadImageForPixels, drawLinesCentered3x5,
} = require('./_shared');

const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const FADE_DUR = 1.0;

let works = [];    // [{id, title, artist, imageUrl}, ...]
let idx = 0;
let fetching = false;
let error = '';
let t = 0;
let timer = 0;
let faceState = null;

let pixels = [];
let sizes = [];

let lastQueryUsed = null;
let lastPrevToken = null;
let lastNextToken = null;
let _letterbox = true;
let _speedSecs = 10;

const status = { text: 'Loading random artworks…' };
function getStatus() {
  return { text: status.text, count: works.length, index: idx, error: error || null, fetching };
}

function initFaceState() {
  faceState = galleryInitFaceState(works.length, _speedSecs);
}

function load(i) {
  if (!works[i] || pixels[i] != null) return;
  pixels[i] = false;
  loadImageForPixels(works[i].imageUrl, 64, { letterbox: _letterbox })
    .then(({ pixels: px, size }) => { sizes[i] = size; pixels[i] = px; })
    .catch(() => { pixels[i] = 'error'; });
}

async function doFetch(query) {
  if (fetching) return;
  fetching = true; error = '';
  status.text = 'Searching the collection…';
  try {
    const q = (query || '').trim() || 'painting';
    const searchUrl = `${MET_API}/search?hasImages=true&q=${encodeURIComponent(q)}`;
    let r;
    try { r = await fetch(searchUrl); }
    catch (fe) { error = 'Network error — check internet connection'; throw fe; }
    if (!r.ok) { error = 'Met API error ' + r.status; throw new Error(String(r.status)); }
    const searchJson = await r.json();
    let ids = searchJson.objectIDs || [];
    if (!ids.length) { error = 'No results found for "' + q + '"'; throw new Error('empty'); }
    ids = ids.slice(); // don't mutate the parsed response in place
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[ids[i], ids[j]] = [ids[j], ids[i]]; }
    const sample = ids.slice(0, 40);
    const details = await Promise.all(sample.map((id) =>
      fetch(`${MET_API}/objects/${id}`).then((rr) => (rr.ok ? rr.json() : null)).catch(() => null)));
    const found = details.filter((d) => d && d.isPublicDomain && d.primaryImageSmall).map((d) => ({
      id: d.objectID, title: d.title || 'Untitled', artist: d.artistDisplayName || 'Unknown artist', imageUrl: d.primaryImageSmall,
    }));
    if (!found.length) { error = 'No public-domain images found for "' + q + '"'; throw new Error('empty'); }
    works = found;
    idx = 0;
    pixels = new Array(found.length).fill(null);
    sizes = new Array(found.length).fill(0);
    timer = 0;
    faceState = null;
    status.text = found.length + ' artworks — ' + q;
    load(0);
  } catch (e) {
    status.text = '✕ ' + (error || (e && e.message) || 'fetch failed');
    if (process.env.ARTIC_DEBUG) console.error('[artic] fetch failed:', e);
  } finally {
    fetching = false;
  }
}

function maybeFetch(core) {
  const opts = core.effectOptions?.artic || {};
  const query = (opts.query || '').trim();

  if (lastQueryUsed === null) { lastQueryUsed = query; doFetch(query); }
  else if (query !== lastQueryUsed) { lastQueryUsed = query; doFetch(query); }
  else if (!works.length && !fetching && !error) doFetch(query);

  if (opts.prevToken != null && opts.prevToken !== lastPrevToken) {
    lastPrevToken = opts.prevToken;
    if (works.length) { idx = (idx - 1 + works.length) % works.length; load(idx); timer = 0; }
  }
  if (opts.nextToken != null && opts.nextToken !== lastNextToken) {
    lastNextToken = opts.nextToken;
    if (works.length) { idx = (idx + 1) % works.length; load(idx); timer = 0; }
  }
  _speedSecs = Number(opts.speedSecs) > 0 ? Number(opts.speedSecs) : 10;

  const wantLetterbox = opts.letterbox !== false;
  if (wantLetterbox !== _letterbox) {
    _letterbox = wantLetterbox;
    pixels = new Array(works.length).fill(null);
    sizes = new Array(works.length).fill(0);
    load(idx);
  }
}

function effectArtic(core, dt) {
  t += dt;
  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  maybeFetch(core);

  if (!works.length) {
    const dots = '.'.repeat(1 + (Math.floor(t) % 3));
    const label = error ? ['API', 'ERROR'] : ['ART', 'GALLERY', dots];
    for (let f = 0; f < 6; f++) drawLinesCentered3x5(core, f, label, 2, 0.7, 0.55, 0.15);
    return;
  }

  const opts = core.effectOptions?.artic || {};
  const slideshowOn = opts.slideshowOn !== false;
  const speedSecs = _speedSecs;

  if (slideshowOn) {
    timer += dt;
    if (timer >= speedSecs) { timer = 0; idx = (idx + 1) % works.length; }
  }

  const is2D = core.panelMode === '2d';
  if (is2D) {
    load(idx);
    load((idx + 1) % works.length);
    const shown = galleryApplyToFace(core, pixels, sizes, 0, idx);
    if (!shown) {
      const dots = '.'.repeat(1 + (Math.floor(t) % 3));
      const lines = pixels[idx] === 'error' ? ['NO IMAGE'] : ['LOADING', dots];
      drawLinesCentered3x5(core, 0, lines, 2, 0.7, 0.55, 0.15);
    }
    return;
  }

  const n = works.length;
  if (!faceState || faceState.length !== 6) initFaceState();
  for (let f = 0; f < 6; f++) {
    const st = faceState[f];
    gallerySlideshowStep(st, n, dt, speedSecs, FADE_DUR, slideshowOn, load, pixels);

    let shown;
    if (st.fadeT > 0 && st.nextIdx != null) shown = galleryApplyBlendToFace(core, pixels, sizes, f, st.curIdx, st.nextIdx, Math.min(1, st.fadeT / FADE_DUR));
    else shown = galleryApplyToFace(core, pixels, sizes, f, st.curIdx);

    if (!shown) {
      const dots = '.'.repeat(1 + (Math.floor(t) % 3));
      const lines = pixels[st.curIdx] === 'error' ? ['NO IMAGE'] : ['LOADING', dots];
      drawLinesCentered3x5(core, f, lines, 2, 0.7, 0.55, 0.15);
    }
  }
}

module.exports = effectArtic;
module.exports.getStatus = getStatus;
