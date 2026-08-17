// Ported from effects-livedata.js's effectEPIC() (~line 4679) and its
// supporting epicFetch()/epicFetchEq()/epicProjectGlobe() helpers
// (~line 4435-4677). NASA's EPIC instrument on the DSCOVR satellite (L1,
// ~1.5M km from Earth) photographs the full sunlit disc a few times a day;
// the browser version does a genuine two-step fetch (metadata listing ->
// image URL built from date+filename) PLUS a second, independent image
// source (NASA GIBS MODIS true-colour equirectangular map, ~24h-old real
// clouds) that it re-projects onto an orthographic globe using the current
// sub-solar point, so the globe you see keeps rotating/terminator-tracking
// between the hourly-ish EPIC refreshes even though the underlying cloud
// photo itself is a day old. Both sources feed the SAME projection
// (epicProjectGlobe): GIBS equirect is preferred when available, the raw
// EPIC disc photo is a fallback simple radial mapping. Ported faithfully:
// - epicFetch(): metadata endpoint (api.nasa.gov/EPIC/api/natural[/date/D])
//   -> pick latest item -> build image URL from its date+image fields
//   -> download PNG (api.nasa.gov/EPIC/archive/natural/Y/M/D/png/NAME.png)
// - epicFetchEq(): GIBS WMS GetMap, walking back up to 4 days for a date
//   that actually has imagery
// - epicProjectGlobe(): orthographic sphere projection w/ sub-solar camera
//   frame + bilinear sampling of the equirect map + limb darkening
//
// No DOM/Canvas here - Jimp decodes both PNG/JPEG sources (see cam.js for
// the established Jimp decode pattern this follows). No word-cascade/canvas
// text engine either - the browser's scrolling ticker is reproduced with
// radio/ticker.js's existing 5x7-font ticker helper (already used by
// radio.js; reused rather than building a new font table per CLAUDE.md's
// "check for reusable font tables" guidance).
'use strict';

const { Jimp } = require('jimp');
const { drawTicker } = require('./radio/ticker');

const nasaConfig = require('../nasaConfig');
// Live-read (not a frozen constant) so a key entered via the UI takes
// effect on the next fetch without a restart - see nasaConfig.js's module
// comment for the real report this fixes.
function NASA_API_KEY() { return nasaConfig.currentKey(); }

// ── EPIC natural-image metadata + PNG fetch state ───────────────────────
let epicData = null;         // {caption, date, lat, lon, url}
let epicFetching = false;
let epicLastFetch = 0;       // seconds
let epicError = '';
let epicRetryAfter = 60;     // seconds, adjusted on 429/5xx like the original
let epicImgReady = false;
let epicImgPixels = null;    // RGBA Buffer
let epicImgSize = 0;
let epicImgError = '';

// ── GIBS MODIS equirectangular cloud map (refreshed every 6h) ──────────
let epicEqPixels = null;     // RGBA Buffer
let epicEqWidth = 0, epicEqHeight = 0;
let epicEqFetching = false;
let epicEqLastFetch = 0;     // seconds
let epicEqDate = '';
let epicEqError = '';

let lastRefreshOpt = null;   // tracks core.effectOptions.epic.refreshRequestedAt

// Current sub-solar position + orthographic camera frame vectors — exact
// port of epicGetSubSolar().
function getSubSolar() {
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const doy = (now - start) / 86400000;
  const decl = -23.45 * Math.PI / 180 * Math.cos(2 * Math.PI * (doy + 10) / 365.25);
  const lonRad = (12 - utcH) * 15 * Math.PI / 180;
  const sinL = Math.sin(lonRad), cosL = Math.cos(lonRad);
  const sinD = Math.sin(decl), cosD = Math.cos(decl);
  return {
    rx: -sinL, ry: 0, rz: cosL,
    ux: -sinD * cosL, uy: cosD, uz: -sinD * sinL,
    fx_: cosD * cosL, fy_: sinD, fz_: cosD * sinL,
  };
}

async function fetchEq() {
  if (epicEqFetching) return;
  epicEqFetching = true;
  const now = new Date();
  const W = 512, H = 256;
  let lastErr = null;
  for (let d = 1; d <= 4; d++) {
    const dt = new Date(now.getTime() - d * 86400000);
    const dateStr = dt.toISOString().slice(0, 10);
    const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&WIDTH=${W}&HEIGHT=${H}&CRS=CRS:84&BBOX=-180,-90,180,90&TIME=${dateStr}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buf = Buffer.from(await resp.arrayBuffer());
      const img = await Jimp.read(buf);
      img.resize({ w: W, h: H });
      epicEqPixels = img.bitmap.data;
      epicEqWidth = W; epicEqHeight = H;
      epicEqDate = dateStr;
      epicEqLastFetch = Date.now() / 1000;
      epicEqError = '';
      epicEqFetching = false;
      return;
    } catch (e) {
      lastErr = e;
      // try previous day
    }
  }
  epicEqError = lastErr ? (lastErr.message || 'fetch failed') : 'fetch failed';
  epicEqFetching = false;
}

// Orthographic globe projection — exact port of epicProjectGlobe(), writing
// through core.setFaceLED instead of colBuf/faceMap directly.
function projectGlobe(core, face, rowLimit) {
  const S = core.SIZE, cx0 = S / 2, cy0 = rowLimit ? rowLimit / 2 : S / 2;
  const rad = (rowLimit || S) * 0.48;
  const sol = getSubSolar();
  const useEq = !!epicEqPixels, useFallback = !!(epicImgReady && epicImgPixels);
  for (let v = 0; v < S; v++) {
    if (rowLimit && v >= rowLimit) continue;
    for (let u = 0; u < S; u++) {
      const dx = u - cx0, dy = v - cy0;
      if (dx * dx + dy * dy > rad * rad) continue;
      const fx = dx / rad, fy = -dy / rad;
      const fz = Math.sqrt(Math.max(0, 1 - fx * fx - fy * fy));
      const qx = fx * sol.rx + fy * sol.ux + fz * sol.fx_;
      const qy = fx * sol.ry + fy * sol.uy + fz * sol.fy_;
      const qz = fx * sol.rz + fy * sol.uz + fz * sol.fz_;
      let r, g, b;
      if (useEq) {
        const lat = Math.asin(Math.max(-1, Math.min(1, qy)));
        const lon = Math.atan2(qz, qx);
        const uf = (lon + Math.PI) / (2 * Math.PI) * epicEqWidth;
        const vf = (Math.PI / 2 - lat) / Math.PI * epicEqHeight;
        const u0 = Math.max(0, Math.min(epicEqWidth - 1, uf | 0));
        const u1 = Math.min(epicEqWidth - 1, u0 + 1);
        const v0 = Math.max(0, Math.min(epicEqHeight - 1, vf | 0));
        const v1 = Math.min(epicEqHeight - 1, v0 + 1);
        const fu = uf - u0, fv = vf - v0;
        const s = (a, bb, t) => a + (bb - a) * t;
        const px = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4];
        const py = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4 + 1];
        const pz = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4 + 2];
        r = s(s(px(v0, u0), px(v0, u1), fu), s(px(v1, u0), px(v1, u1), fu), fv) / 255;
        g = s(s(py(v0, u0), py(v0, u1), fu), s(py(v1, u0), py(v1, u1), fu), fv) / 255;
        b = s(s(pz(v0, u0), pz(v0, u1), fu), s(pz(v1, u0), pz(v1, u1), fu), fv) / 255;
      } else if (useFallback) {
        const IS = epicImgSize;
        const su = Math.min(IS - 1, Math.max(0, Math.floor((fx * 0.5 + 0.5) * IS)));
        const sv = Math.min(IS - 1, Math.max(0, Math.floor((-fy * 0.5 + 0.5) * IS)));
        const pi = (sv * IS + su) * 4;
        r = epicImgPixels[pi] / 255; g = epicImgPixels[pi + 1] / 255; b = epicImgPixels[pi + 2] / 255;
      } else {
        r = 0.04; g = 0.12; b = 0.3;
      }
      const limb = 0.55 + 0.45 * fz;
      // core.setFaceLED flips v the same way the browser's faceMap does
      // (see cam.js), so pass v directly here (matches original's v usage).
      core.setFaceLED(face, u, v, r * limb, g * limb, b * limb);
    }
  }
}

async function fetchEpic() {
  if (epicFetching) return;
  epicFetching = true;
  epicError = ''; epicImgError = '';
  try {
    let arr = null;
    for (let daysAgo = 0; daysAgo <= 10; daysAgo++) {
      const d = new Date(); d.setDate(d.getDate() - daysAgo);
      const dateStr = d.toISOString().slice(0, 10);
      const url = daysAgo === 0
        ? `https://api.nasa.gov/EPIC/api/natural/images?api_key=${NASA_API_KEY()}`
        : `https://api.nasa.gov/EPIC/api/natural/date/${dateStr}?api_key=${NASA_API_KEY()}`;
      let r;
      try { r = await fetch(url); } catch (fe) { throw new Error('Network error — check connection'); }
      if (r.status === 429) { epicRetryAfter = 60; throw new Error('Rate limited — set NASA_API_KEY env var'); }
      if (r.status === 503 || r.status === 502 || r.status === 504) { epicRetryAfter = 5; throw new Error('NASA servers down (' + r.status + ') — retrying…'); }
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data) && data.length) { arr = data; break; }
      }
    }
    if (!arr || !arr.length) throw new Error('No EPIC imagery found in last 10 days');
    const item = arr[arr.length - 1];
    const d = new Date(item.date.replace(' ', 'T') + 'Z');
    const yyyy = d.getUTCFullYear(), mm = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
    const imgUrl = `https://api.nasa.gov/EPIC/archive/natural/${yyyy}/${mm}/${dd}/png/${item.image}.png?api_key=${NASA_API_KEY()}`;
    epicData = {
      caption: item.caption || 'Earth from DSCOVR',
      date: item.date,
      lat: item.centroid_coordinates ? item.centroid_coordinates.lat : null,
      lon: item.centroid_coordinates ? item.centroid_coordinates.lon : null,
      url: imgUrl,
    };
    epicImgReady = false;
    epicLastFetch = Date.now() / 1000;
    epicRetryAfter = 60;

    // Second fetch: download+decode the actual PNG (fire-and-forget, same
    // "don't block the caption/status update" split as the original's
    // loadImageForPixels callback structure).
    (async () => {
      try {
        const resp = await fetch(epicData.url);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const buf = Buffer.from(await resp.arrayBuffer());
        const img = await Jimp.read(buf);
        epicImgSize = Math.min(img.bitmap.width, img.bitmap.height);
        img.resize({ w: epicImgSize, h: epicImgSize });
        epicImgPixels = img.bitmap.data;
        epicImgReady = true;
      } catch (e) {
        epicImgReady = false;
        epicImgError = 'Could not load image';
      }
    })();
  } catch (e) {
    epicError = e.message;
    epicLastFetch = Date.now() / 1000;
    console.error('[epic] fetch error:', e.message);
  }
  epicFetching = false;
}

function buildTickerLabel() {
  return epicData
    ? `EARTH NOW  •  ${epicData.date} UTC  •  ${epicData.caption}    `
    : 'EARTH FULL-DISK IMAGERY  •  LOADING…    ';
}

// Extracted out of effectEpic() so epicWall.js (wall-mode counterpart) can
// drive the exact same fetch-scheduling/backoff/refresh-button logic
// instead of re-implementing its own copy - epic's two network sources
// (EPIC metadata+PNG, GIBS equirect) are both real external APIs worth
// sharing a single polling cadence for, unlike e.g. camWall.js's cheap
// local-network snapshot polling which is fine siloed per registry entry.
function ensureFetches(core) {
  const opts = core.effectOptions?.epic || {};
  if (opts.refreshRequestedAt && opts.refreshRequestedAt !== lastRefreshOpt) {
    lastRefreshOpt = opts.refreshRequestedAt;
    epicLastFetch = 0; epicError = '';
    if (!epicFetching) fetchEpic();
  }

  if (!epicData && !epicFetching && (Date.now() / 1000 - epicLastFetch) > 3600) fetchEpic();
  if (epicError && !epicFetching && (Date.now() / 1000 - epicLastFetch) >= epicRetryAfter) {
    epicError = ''; epicLastFetch = 0; fetchEpic();
  }
  if (!epicEqPixels && !epicEqFetching) fetchEq();
  if (epicEqLastFetch > 0 && (Date.now() / 1000 - epicEqLastFetch) > 6 * 3600 && !epicEqFetching) fetchEq();
}

function effectEpic(core, dt) {
  ensureFetches(core);

  const { N, SIZE } = core;
  for (let i = 0; i < N; i++) core.setLED(i, 0, 0, 0);

  const is2D = core.panelMode === '2d';

  if (epicEqPixels || epicImgReady) {
    projectGlobe(core, 0);
    if (!is2D) projectGlobe(core, 4);
  }
  // else: leave the disc face black (no canvas/text-engine "EARTH…"/"API
  // ERROR" placeholder here - status string carries that instead, same
  // "status text replaces on-cube text" tradeoff cam.js made).

  if (!is2D) {
    drawTicker(core, 1, buildTickerLabel(), dt * (core.speedMult || 1));
  }
}

// Polled each tick by app.js into state.effectStatus.epic (see weather.js's
// getStatus() for the established convention).
function getStatus() {
  return {
    caption: epicData?.caption || null,
    date: epicData?.date || null,
    lat: epicData?.lat ?? null,
    lon: epicData?.lon ?? null,
    fetching: epicFetching,
    error: epicError || null,
    imgError: epicImgError || null,
    eqDate: epicEqDate || null,
    eqError: epicEqError || null,
  };
}

module.exports = effectEpic;
module.exports.getStatus = getStatus;
// Reused by epicWall.js so it can drive the same fetch cadence and sample
// the same decoded pixels/caption without a second, independent poller.
module.exports.ensureFetches = ensureFetches;
module.exports.getSubSolar = getSubSolar;
module.exports.getPixelState = () => ({
  epicEqPixels, epicEqWidth, epicEqHeight,
  epicImgReady, epicImgPixels, epicImgSize,
});
module.exports.getCaption = () => (epicData
  ? `EARTH NOW  •  ${epicData.date} UTC  •  ${epicData.caption}    `
  : 'EARTH FULL-DISK IMAGERY  •  LOADING…    ');
