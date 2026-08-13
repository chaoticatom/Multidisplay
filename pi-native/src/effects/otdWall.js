// Wall-mode counterpart to otd.js ("On This Day"). Fetch logic reused
// verbatim in this file's own module scope (own siloed state, same
// "don't collide across registries" reasoning as camWall.js).
//
// Layout (per the batch brief - "fold the title-card content into a
// corner/header area... drop the separate starfield-only faces treatment
// in favor of a single cohesive wall composition"): the cube version puts
// its title card on its own dedicated face-4 and a starfield backdrop on
// faces 0/2/3, entirely separate from the word-cascade on face 1 - six
// independent faces with no shared canvas. A stitched wall has one
// canvas, so this composes all three elements together instead: a
// starfield (same seeded-noise trick as otd.js's drawStarfield/neoWall.js's
// backdrop) fills the WHOLE wall as a backdrop, a compact one-line title
// ("ON THIS DAY · <n> EVENTS") sits anchored in the top-left corner instead
// of a dedicated face, and the word-cascade reveals below/over the
// starfield using the wallW/wallH-aware siblings added to _shared.js
// (wcInitWall/wcStepWall/wcDrawToFaceWall - see jokeWall.js's comment on
// why these are real siblings, not reuse-with-different-args). A
// `topMarginRows` is passed to wcDrawToFaceWall so the cascade's bottom-up
// stack of lines never overlaps the top-left title row.
'use strict';

const { wcInitWall, wcStepWall, wcDrawToFaceWall } = require('./_shared');
const { PIXEL_FONT } = require('./weather/font');

let otdEvents = [];
let otdFetching = false;
let otdError = '';
let t = 0;
let otdFetchedFor = '';
let otdIdx = 0;
let cascade = null;
let cascadeForKey = '';
let lastRefreshToken = null;

const status = { text: 'Not fetched yet' };
function getStatus() {
  return { text: status.text, fetching: otdFetching, error: otdError || null, count: otdEvents.length };
}

function todayKey() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
  return { mm, dd, key: mm + '-' + dd };
}

function otdFetch() {
  if (otdFetching) return;
  otdFetching = true; otdError = '';
  status.text = 'Fetching today in history…';
  const { mm, dd, key } = todayKey();
  (async () => {
    const url = `https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
    let r;
    try { r = await fetch(url, { headers: { Accept: 'application/json' } }); }
    catch (fe) { otdError = 'Network error — check internet connection'; throw fe; }
    if (!r.ok) { otdError = 'Wikipedia API error ' + r.status; throw new Error(String(r.status)); }
    const d = await r.json();
    const events = (d.events || []).filter((e) => e.text).sort((a, b) => (b.year || 0) - (a.year || 0));
    if (!events.length) { otdError = 'No events found'; throw new Error('empty'); }
    otdEvents = events.slice(0, 20);
    otdFetchedFor = key;
    otdIdx = 0;
    status.text = otdEvents.length + ' events for today';
  })().catch((err) => {
    status.text = '✕ ' + otdError;
    if (process.env.OTD_DEBUG) console.error('[otdWall] fetch error:', err);
  }).finally(() => {
    otdFetching = false;
  });
}

// Compact top-left title strip - 3x5 PIXEL_FONT (same font weather's ticker
// and apodWall.js's placeholder text use), anchored rather than centered.
function glyph3x5Wall(core, W, H, ch, su, sv, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()]; if (!rows) return 4;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = sv + row;
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      core.setWallPixel(u, v, r, g, b);
    }
  }
  return 4;
}
function drawTitleCorner(core, W, H) {
  const now = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const label = `ON THIS DAY ${monthNames[now.getMonth()]} ${now.getDate()} - ${otdEvents.length} EVENTS`;
  let u = 1;
  for (const ch of label) { u += glyph3x5Wall(core, W, H, ch, u, 1, 0.48, 0.82, 1); if (u >= W) break; }
}

function drawStarfield(core, W, H, tt) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const seed = ((i * 2654435761) >>> 0) / 4294967296;
      if (seed < 0.012) {
        const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.4 + seed * 60));
        const br = seed * 30 * twinkle;
        core.setWallPixel(x, y, br, br, br * 1.1);
      }
    }
  }
}

function effectOnThisDayWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  t += dt;

  const refreshToken = core.effectOptions?.otd?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    otdFetch();
  }
  const { key } = todayKey();
  if ((!otdEvents.length || otdFetchedFor !== key) && !otdFetching) otdFetch();

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  if (!otdEvents.length || otdError) return; // blank canvas while loading/erroring, same gap jokeWall.js/triviaWall.js leave

  const tt = Date.now() * 0.001;
  drawStarfield(core, W, H, tt);
  drawTitleCorner(core, W, H);

  if (otdIdx >= otdEvents.length) otdIdx = 0;
  const curEvent = otdEvents[otdIdx];
  const wrapKey = otdIdx + '|' + otdEvents.length;
  if (cascadeForKey !== wrapKey) {
    const tagged = [
      { w: `${curEvent.year}:`, color: [1, 0.8, 0.27] },
      ...curEvent.text.split(/\s+/).filter(Boolean).map((w) => ({ w, color: [0.48, 0.82, 1] })),
    ];
    cascade = wcInitWall(tagged, H);
    cascadeForKey = wrapKey;
  }
  wcStepWall(cascade, dt, W);
  wcDrawToFaceWall(core, cascade, 8); // topMarginRows=8 keeps the cascade's bottom-up stack clear of the top-left title row

  if (cascade.done && cascade.holdTimer > 2.5) otdIdx = (otdIdx + 1) % otdEvents.length;
}

module.exports = effectOnThisDayWall;
module.exports.getStatus = getStatus;
