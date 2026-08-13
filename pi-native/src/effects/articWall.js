// Wall-mode counterpart to artic.js ("Art Gallery" / Met Museum). Same
// treatment as unsplashWall.js (near-identical structure per this project's
// history - both cube effects were built together off the shared gallery
// engine, and their wall counterparts follow the same "one big photo across
// the whole wall, not staggered per panel" shape). See unsplashWall.js's
// header comment for the full reasoning; only the fetch/query source
// differs (Met Museum's public keyless collection API vs Unsplash's keyed
// one).
'use strict';

const {
  loadImageForPixels, galleryApplyToWall, galleryApplyBlendToWall,
} = require('./_shared');

const MET_API = 'https://collectionapi.metmuseum.org/public/collection/v1';
const FADE_DUR = 1.0;

let works = [];
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
let lastPrevToken = null;
let lastNextToken = null;
let _letterbox = true;
let _speedSecs = 10;

const status = { text: 'Loading random artworks…' };
function getStatus() {
  return { text: status.text, count: works.length, index: idx, error: error || null, fetching };
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
    ids = ids.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[ids[i], ids[j]] = [ids[j], ids[i]]; }
    const sample = ids.slice(0, 40);
    const details = await Promise.all(sample.map((id) =>
      fetch(`${MET_API}/objects/${id}`).then((rr) => (rr.ok ? rr.json() : null)).catch(() => null)));
    const found = details.filter((d) => d && d.isPublicDomain && d.primaryImageSmall).map((d) => ({
      id: d.objectID, title: d.title || 'Untitled', artist: d.artistDisplayName || 'Unknown artist', imageUrl: d.primaryImageSmall,
    }));
    if (!found.length) { error = 'No public-domain images found for "' + q + '"'; throw new Error('empty'); }
    works = found;
    idx = 0; nextIdx = null; fadeT = 0;
    pixels = new Array(found.length).fill(null);
    sizes = new Array(found.length).fill(0);
    timer = 0;
    status.text = found.length + ' artworks — ' + q;
    load(0);
  } catch (e) {
    status.text = '✕ ' + (error || (e && e.message) || 'fetch failed');
    if (process.env.ARTIC_DEBUG) console.error('[articWall] fetch failed:', e);
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
    if (works.length) { idx = (idx - 1 + works.length) % works.length; load(idx); timer = 0; nextIdx = null; fadeT = 0; }
  }
  if (opts.nextToken != null && opts.nextToken !== lastNextToken) {
    lastNextToken = opts.nextToken;
    if (works.length) { idx = (idx + 1) % works.length; load(idx); timer = 0; nextIdx = null; fadeT = 0; }
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

function effectArticWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  maybeFetch(core);

  if (!works.length) return; // blank canvas while waiting, same idle gap unsplashWall.js leaves

  const opts = core.effectOptions?.artic || {};
  const slideshowOn = opts.slideshowOn !== false;
  const n = works.length;

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
  if (!shown) return;
}

module.exports = effectArticWall;
module.exports.getStatus = getStatus;
