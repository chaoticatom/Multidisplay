// Snapshot-URL camera (not a live webcam): every 1/rate seconds fetches the URL
// (cache-busted), decodes and nearest-neighbour scales it with jimp, and paints the
// same image, vertically flipped, onto all 6 faces. Black until the first success.
// Fetching is fire-and-forget and must never block the per-tick render call.
const { Jimp, ResizeStrategy } = require('jimp');
const { fetchWithTimeout } = require('./net');

let camPixels = null;   // Uint8ClampedArray-ish RGBA buffer, SIZE*SIZE*4, or null until first successful fetch
let camPixelsSize = 0;  // SIZE the buffer above was decoded at, so a mid-run size change re-fetches at the new size
let fetching = false;
let lastAttemptMs = -Infinity; // -Infinity so the very first tick (any url/rate) fetches immediately, unlike weather's 0 (which just needs to be far enough in the past - matches here too, but -Infinity is more obviously "never attempted")

// Status string polled each tick by app.js's generic
// `activeFn.getStatus === 'function'` mechanism (same convention
// weather.js's getStatus() uses - see that file) and broadcast to the
// browser via wsServer.js's _stateMsg() so `#cam-status` can mirror the
// original's "Live • N fps" / "Error — check URL / CORS" / "Idle" readout.
// CORS is a browser-only concept and doesn't apply server-side, so error
// text is adapted rather than copied verbatim.
const status = { text: 'Idle' };
function getStatus() { return status.text; }

function maybeFetch(core, url, rate) {
  if (!url || fetching) return;
  const now = Date.now();
  const interval = (1 / rate) * 1000;
  if (now - lastAttemptMs < interval) return;
  lastAttemptMs = now;
  fetching = true;

  const SIZE = core.SIZE;
  const sep = url.includes('?') ? '&' : '?';
  const fetchUrl = url + sep + '_t=' + now;

  (async () => {
    const resp = await fetchWithTimeout(fetchUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const buf = Buffer.from(await resp.arrayBuffer());
    const img = await Jimp.read(buf);
    img.resize({ w: SIZE, h: SIZE, mode: ResizeStrategy.NEAREST_NEIGHBOR });
    camPixels = img.bitmap.data;
    camPixelsSize = SIZE;
    status.text = 'Live • ' + (rate | 0) + ' fps';
  })().catch((err) => {
    status.text = 'Error — ' + (err.message || 'fetch failed');
    if (process.env.CAM_DEBUG) console.error('[cam] fetch failed:', err);
  }).finally(() => {
    fetching = false;
  });
}

function effectCam(core, dt) {
  const opts = core.effectOptions?.cam || {};
  const url = (opts.url || '').trim();
  const rate = opts.rate ?? 5;

  maybeFetch(core, url, rate);

  const { N, SIZE } = core;

  if (!camPixels || camPixelsSize !== SIZE) {
    for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);
    return;
  }

  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      const pi = (v * SIZE + u) * 4;
      const r = camPixels[pi] / 255, g = camPixels[pi + 1] / 255, b = camPixels[pi + 2] / 255;
      for (let f = 0; f < 6; f++) core.setFaceLED(f, u, SIZE - 1 - v, r, g, b);
    }
  }
}

module.exports = effectCam;
module.exports.getStatus = getStatus;
