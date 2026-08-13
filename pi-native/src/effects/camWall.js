// Wall-mode counterpart to cam.js ("Camera").
//
// cam.js is already a "same content everywhere" effect - it paints one
// decoded snapshot onto ALL 6 cube faces identically (no per-face
// variation at all, just `for (let f=0;f<6;f++) core.setFaceLED(...)`) -
// so for the wall this is the coinflipWall.js/diceWall.js "single card,
// not tiled per panel" shape the batch brief points at: one continuous
// image stretched across the whole stitched wallW x wallH canvas, decoded
// and resized directly at the wall's own resolution (not resized once at
// SIZE and then re-stretched), same as cam.js resizes directly at
// core.SIZE rather than resizing a fixed base image per face.
//
// Own module-level state (camPixels/camPixelsSize/fetching/lastAttemptMs/
// status) is kept SEPARATE from cam.js's - the two are different registry
// entries (EFFECTS.cam vs WALL_EFFECTS.cam) that can in principle run at
// the same time under different panelConfig modes (a cube and a wall
// instance side by side isn't a supported deployment today, but keeping
// the state siloed per file costs nothing and avoids a subtle "switching
// modes mid-run reuses stale cached pixels at the wrong resolution" bug).
// Same `#cam-url`/`rate` option keys as cam.js (`core.effectOptions.cam`).
const { Jimp, ResizeStrategy } = require('jimp');

let camPixels = null;   // RGBA buffer, wallW*wallH*4, or null until first successful fetch
let camPixelsW = 0, camPixelsH = 0; // resolution the buffer above was decoded at
let fetching = false;
let lastAttemptMs = -Infinity;

const status = { text: 'Idle' };
function getStatus() { return status.text; }

function maybeFetch(core, url, rate, wallW, wallH) {
  if (!url || fetching) return;
  const now = Date.now();
  const interval = (1 / rate) * 1000;
  if (now - lastAttemptMs < interval) return;
  lastAttemptMs = now;
  fetching = true;

  const sep = url.includes('?') ? '&' : '?';
  const fetchUrl = url + sep + '_t=' + now;

  (async () => {
    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    const img = await Jimp.read(buf);
    img.resize({ w: wallW, h: wallH, mode: ResizeStrategy.NEAREST_NEIGHBOR });
    camPixels = img.bitmap.data;
    camPixelsW = wallW; camPixelsH = wallH;
    status.text = 'Live • ' + (rate | 0) + ' fps';
  })().catch((err) => {
    status.text = 'Error — ' + (err.message || 'fetch failed');
    if (process.env.CAM_DEBUG) console.error('[camWall] fetch failed:', err);
  }).finally(() => {
    fetching = false;
  });
}

function effectCamWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const opts = core.effectOptions?.cam || {};
  const url = (opts.url || '').trim();
  const rate = opts.rate ?? 5;

  maybeFetch(core, url, rate, wallW, wallH);

  if (!camPixels || camPixelsW !== wallW || camPixelsH !== wallH) {
    for (let y = 0; y < wallH; y++) for (let x = 0; x < wallW; x++) core.setWallPixel(x, y, 0, 0, 0);
    return;
  }

  for (let y = 0; y < wallH; y++) {
    for (let x = 0; x < wallW; x++) {
      const pi = (y * wallW + x) * 4;
      const r = camPixels[pi] / 255, g = camPixels[pi + 1] / 255, b = camPixels[pi + 2] / 255;
      core.setWallPixel(x, y, r, g, b);
    }
  }
}

module.exports = effectCamWall;
module.exports.getStatus = getStatus;
