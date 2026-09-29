// Ported from effects-livedata.js's On This Day section (~line 4302-4430):
// otdEvents/otdFetch/otdBuildTitleBuf/effectOnThisDay. Wikipedia's "On this
// day" REST feed (free, no key) returns up to 20 historical events for
// today's month/day; this cycles through them one at a time, each revealed
// word-by-word via the shared word-cascade engine, tagged year(amber)/
// text(cyan) instead of joke/trivia's setup/answer split (there's no "?" to
// split on here, so wcTagQA isn't used - the tagging is built directly,
// matching the browser's own bespoke tagged-word array for this effect).
//
// No DOM canvas server-side, so the browser's otdBuildTitleBuf() (a canvas
// title card drawn onto face 4) is replaced with the shared 3x5 PIXEL_FONT
// drawLinesCentered3x5() helper (_shared.js), same substitution apod.js/
// unsplash.js make elsewhere. The twinkling starfield backdrop on faces
// 0/2/3 uses the same seeded-noise trick ((idx*2654435761)>>>0)/4294967296)
// as iss.js's face-0 starfield and neo.js's neoDrawStarfield - kept local
// per-file (not promoted to _shared.js) since it's a two-line loop with no
// third caller yet, matching neo.js's own "not worth a shared helper for a
// single-effect-count reuse" precedent.
// Cube and wall modes share one fetch (the wall renderer used to be a
// separate otdWall.js with its own state and its own fetches).
'use strict';

const { wcInit, wcStep, wcDrawToFace, wcInitWall, wcStepWall, wcDrawToFaceWall, drawLinesCentered3x5 } = require('./_shared');
const { drawString, drawLinesCentered, FONT_3x5, wallPlot } = require('./text');
const { fetchWithTimeout } = require('./net');

let otdEvents = [];
let otdFetching = false;
let otdError = '';
let otdFetchedFor = '';
let lastRefreshToken = null;
// Per-mode animation state: which event is showing and its cascade (the
// layout differs per mode). The fetched events themselves are shared.
const modes = { cube: { t: 0, idx: 0, cascade: null, forKey: '' }, wall: { t: 0, idx: 0, cascade: null, forKey: '' } };

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
    try { r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }); }
    catch (fe) { otdError = 'Network error — check internet connection'; throw fe; }
    if (!r.ok) { otdError = 'Wikipedia API error ' + r.status; throw new Error(String(r.status)); }
    const d = await r.json();
    const events = (d.events || []).filter((e) => e.text).sort((a, b) => (b.year || 0) - (a.year || 0));
    if (!events.length) { otdError = 'No events found'; throw new Error('empty'); }
    otdEvents = events.slice(0, 20);
    otdFetchedFor = key;
    modes.cube.idx = 0; modes.wall.idx = 0;
    status.text = otdEvents.length + ' events for today';
  })().catch((err) => {
    status.text = '✕ ' + otdError;
    if (process.env.OTD_DEBUG) console.error('[otd] fetch error:', err);
  }).finally(() => {
    otdFetching = false;
  });
}

// Face-4 title card. drawLinesCentered3x5() centers a whole block
// vertically at a single scale, so (unlike the browser's free-form canvas
// layout with per-line font sizes) all three lines share one scale here -
// a simplification, not a faithful per-line-size port.
function drawTitleCard(core) {
  const now = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const lines = ['ON THIS DAY', monthNames[now.getMonth()] + ' ' + now.getDate(), otdEvents.length + ' EVENTS'];
  drawLinesCentered3x5(core, 4, lines, 2, 0.48, 0.82, 1);
}

function drawStarfield(core, tt) {
  const { colBuf } = core;
  for (const face of [0, 2, 3]) {
    const { SIZE, faceMap } = core;
    for (let v = 0; v < SIZE; v++) {
      for (let u = 0; u < SIZE; u++) {
        const idx = faceMap[face][v * SIZE + u]; if (idx < 0) continue;
        const seed = ((idx * 2654435761) >>> 0) / 4294967296;
        if (seed < 0.012) {
          const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.4 + seed * 60));
          const br = seed * 30 * twinkle;
          colBuf[idx * 3] = br; colBuf[idx * 3 + 1] = br; colBuf[idx * 3 + 2] = br * 1.1;
        }
      }
    }
  }
}

// Shared per-frame bookkeeping: refresh button, first fetch, new day.
function update(core) {
  const refreshToken = core.effectOptions?.otd?.refreshRequestedAt;
  if (refreshToken != null && refreshToken !== lastRefreshToken) {
    lastRefreshToken = refreshToken;
    otdFetch();
  }
  const { key } = todayKey();
  if ((!otdEvents.length || otdFetchedFor !== key) && !otdFetching) otdFetch();
}

function eventWords(ev) {
  return [
    { w: `${ev.year}:`, color: [1, 0.8, 0.27] },
    ...ev.text.split(/\s+/).filter(Boolean).map((w) => ({ w, color: [0.48, 0.82, 1] })),
  ];
}

function effectOnThisDay(core, dt) {
  const m = modes.cube;
  m.t += dt;
  update(core);

  const { N } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  const is2D = core.panelMode === '2d';
  const faces = is2D ? [0] : [0, 1, 2, 3, 4, 5];

  if (!otdEvents.length) {
    const dots = '.'.repeat(1 + (Math.floor(m.t) % 3));
    for (const f of faces) drawLinesCentered3x5(core, f, ['ON THIS', 'DAY' + dots], 2, 0.3, 0.65, 0.95);
    return;
  }
  if (otdError) {
    for (const f of faces) drawLinesCentered3x5(core, f, ['API', 'ERROR'], 2, 1, 0.25, 0.25);
    return;
  }

  if (m.idx >= otdEvents.length) m.idx = 0;
  const wrapKey = m.idx + '|' + otdEvents.length;
  if (m.forKey !== wrapKey) { m.cascade = wcInit(eventWords(otdEvents[m.idx])); m.forKey = wrapKey; }
  wcStep(m.cascade, dt);
  wcDrawToFace(core, m.cascade, is2D ? 0 : 1);

  if (m.cascade.done && m.cascade.holdTimer > 2.5) m.idx = (m.idx + 1) % otdEvents.length;

  if (is2D) return;

  drawTitleCard(core);
  const tt = Date.now() * 0.001;
  drawStarfield(core, tt);
}

// ── Wall mode (was otdWall.js): starfield + a title line across the top,
// the cascade below it. Shares the fetched events with cube mode.
function drawTitleCorner(core, W, H) {
  const now = new Date();
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const label = `ON THIS DAY ${monthNames[now.getMonth()]} ${now.getDate()} - ${otdEvents.length} EVENTS`;
  drawString(FONT_3x5, label, 1, 1, wallPlot(core, 0.48, 0.82, 1), { maxX: W });
}

function drawStarfieldWall(core, W, H, tt) {
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
  const m = modes.wall;
  m.t += dt;
  update(core);

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const scale = Math.max(1, Math.min(4, Math.floor(Math.min(W / 32, H / 16))));
  if (!otdEvents.length) {
    const dots = '.'.repeat(1 + (Math.floor(m.t) % 3));
    drawLinesCentered(FONT_3x5, ['ON THIS', 'DAY' + dots], W, H, wallPlot(core, 0.3, 0.65, 0.95), { scale });
    return;
  }
  if (otdError) {
    drawLinesCentered(FONT_3x5, ['API', 'ERROR'], W, H, wallPlot(core, 1, 0.25, 0.25), { scale });
    return;
  }

  const tt = Date.now() * 0.001;
  drawStarfieldWall(core, W, H, tt);
  drawTitleCorner(core, W, H);

  if (m.idx >= otdEvents.length) m.idx = 0;
  const wrapKey = m.idx + '|' + otdEvents.length;
  if (m.forKey !== wrapKey) { m.cascade = wcInitWall(eventWords(otdEvents[m.idx]), H); m.forKey = wrapKey; }
  wcStepWall(m.cascade, dt, W);
  wcDrawToFaceWall(core, m.cascade, 8); // topMarginRows=8 keeps the cascade clear of the title row

  if (m.cascade.done && m.cascade.holdTimer > 2.5) m.idx = (m.idx + 1) % otdEvents.length;
}

module.exports = effectOnThisDay;
module.exports.getStatus = getStatus;
module.exports.wall = effectOnThisDayWall;
effectOnThisDayWall.getStatus = getStatus;
