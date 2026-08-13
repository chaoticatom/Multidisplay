// Ported from effects-livedata.js's effectISS() (line ~5026) plus its
// supporting helpers (issFetch/issUpdateCountryFlag/issApplyFlagToFace/
// issIsLand/issBuildMapBuf/issApplyMapToFace/issDrawStation), lines
// ~4715-5024. Live ISS position tracker: polls wheretheiss.at every 5s
// (matches the browser's `(Date.now()/1000-issLastFetch)>5` gate - the ISS
// moves ~7.66km/s, fast enough that a 5s cadence is deliberate, unlike
// weather's 15-minute one), reverse-geocodes the fix to a country (throttled
// to every 8s, same as the browser) via BigDataCloud, and loads that
// country's flag via flagcdn.com.
//
// No shared Earth-bitmap helper exists to reuse: this effect's world map is
// its own digitized 200x100 1-bit landmass mask (ISS_WORLD_MASK_B64 below,
// copied verbatim from the browser source), unrelated to
// celestial/celestial.js's moon-phase renderer (procedural craters/maria on
// a disc, not a lat/lon world map) or any EPIC imagery - there is nothing to
// share here.
//
// No DOM canvas is available server-side, so the browser's two
// canvas-rendered text elements (the "ISS TRACKER / lat / lon" info card via
// issBuildTitleBuf(), and the scrolling ticker via issBuildTicker()) are
// replaced with the same PIXEL_FONT bitmap-glyph approach weather.js and
// celestial.js already use for on-face text - same visual language as every
// other ported effect, not a new one. The flag image (a real photo, not
// stylized) is decoded with jimp, same as cam.js/video.js's image pipeline.
const { PIXEL_FONT } = require('./weather/font');
const { Jimp, ResizeStrategy } = require('jimp');

// ── Live position state ─────────────────────────────────────────────────
let issLat = 0, issLon = 0, issTimestamp = 0, issFetching = false, issLastFetch = 0, issError = '';
let issHasFix = false, issT = 0, issTrail = [];

function issFetch() {
  if (issFetching) return;
  issFetching = true; issError = '';
  fetch('https://api.wheretheiss.at/v1/satellites/25544')
    .then((r) => { if (!r.ok) throw new Error('ISS API error: ' + r.status); return r.json(); })
    .then((d) => {
      issLat = parseFloat(d.latitude);
      issLon = parseFloat(d.longitude);
      issTimestamp = d.timestamp || Math.floor(Date.now() / 1000);
      issHasFix = true;
      issLastFetch = Date.now() / 1000;
      issTrail.push({ lat: issLat, lon: issLon });
      if (issTrail.length > 30) issTrail.shift();
      issUpdateCountryFlag();
    })
    .catch((e) => {
      issError = e.message || 'ISS fetch failed - check internet connection';
      issLastFetch = Date.now() / 1000;
      console.warn('[iss] fetch error:', issError);
    })
    .finally(() => { issFetching = false; });
}

// ── Country flag currently being overflown ──────────────────────────────
// ~70% of the ISS's ground track is over ocean, so "no country" is the
// common case, not an error - same comment as the browser source.
let issCountryCode = '', issCountryName = '', issFlagPixels = null, issFlagSize = 0, issFlagState = 'idle'; // idle|loading|ok|error
let issFlagFetching = false, issGeoLastFetch = 0;

function issUpdateCountryFlag() {
  if (issFlagFetching) return;
  const now = Date.now() / 1000;
  if (now - issGeoLastFetch < 8) return; // throttle - don't hammer the geocoder every 5s tick
  issGeoLastFetch = now;
  issFlagFetching = true;
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${issLat}&longitude=${issLon}&localityLanguage=en`;
  fetch(url)
    .then((r) => { if (!r.ok) throw new Error('geocode HTTP ' + r.status); return r.json(); })
    .then((d) => {
      const cc = (d.countryCode || '').toUpperCase();
      if (cc !== issCountryCode) {
        issCountryCode = cc;
        issCountryName = d.countryName || '';
        issFlagPixels = null; issFlagSize = 0;
        if (cc) {
          issFlagState = 'loading';
          const flagUrl = `https://flagcdn.com/w320/${cc.toLowerCase()}.png`;
          const S = 32; // small - it's only ever displayed at cube face resolution
          fetch(flagUrl)
            .then((r) => { if (!r.ok) throw new Error('flag HTTP ' + r.status); return r.arrayBuffer(); })
            .then((ab) => Jimp.read(Buffer.from(ab)))
            .then((img) => {
              img.resize({ w: S, h: S, mode: ResizeStrategy.NEAREST_NEIGHBOR });
              issFlagPixels = img.bitmap.data;
              issFlagSize = S;
              issFlagState = 'ok';
            })
            .catch((e) => { issFlagState = 'error'; console.warn('[iss] flag load failed:', e.message); });
        } else {
          issFlagState = 'idle'; // over ocean - not an error
        }
      }
    })
    .catch((e) => console.warn('[iss] reverse geocode failed:', e.message))
    .finally(() => { issFlagFetching = false; });
}

function issApplyFlagToFace(core, face) {
  if (!issFlagPixels || issFlagSize === 0) return false;
  const { SIZE: S, faceMap, colBuf } = core;
  const IS = issFlagSize;
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
    const su = Math.min(IS - 1, Math.floor(u / S * IS));
    const sv = Math.min(IS - 1, Math.floor((S - 1 - v) / S * IS));
    const pi = (sv * IS + su) * 4;
    colBuf[idx * 3] = issFlagPixels[pi] / 255;
    colBuf[idx * 3 + 1] = issFlagPixels[pi + 1] / 255;
    colBuf[idx * 3 + 2] = issFlagPixels[pi + 2] / 255;
  }
  return true;
}

// ── World landmass mask (real digitized 200x100, 1 bit/px, MSB-first,
// base64) - verbatim from the browser source, decoded once. ────────────
const ISS_WORLD_MASK_W = 200, ISS_WORLD_MASK_H = 100;
const ISS_WORLD_MASK_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/4AgAAAAAAAAAAAAAAAAAAAAAAAAAAAACf+B+AAAAAACAAAAAAAAAAAAAAAAAAAAAB3+Y/wAAAAAA4AAAAAAAAAAAAAAAAAAABMf+P/wAAAAAADQAA8AAAAAAAAAAAAAAAchn/P/+IAAAAAAEAAGAAAAAAAAAAAAAAAFAB/D//+AAAIAAAQAAAAAAAAAAAAAAAAAAwAPn//+AAAAAAAH4AAAADwQAAAAAAGAAAPsnj///gAOAAAAB+AAPCA/8AAAAAAPwAB4BIQ///wAOAAAAB/gMD/z//AAAAAAP/AA+ALAP//8ADgAAAA/73j////4AAAAAD/8APiQeAf//AAQAAMAf//9////wAAAAAA//gA/NgAD//wAAAAGAH///////8AAAAABv/94PzTwA//4AAAADAD////////AAAAAAf///n8JeAP//AAAAAwA////////4AAAAAB///8/G/gD//gAAAAIEX////////AAAAAA////ixn8A//wAAAACB/////////gAAAAB////+xY/gP/8AAAAAwb////////wAAAAA////P+2Z4D//AAAAAAH///////+8AAAAAP//////sOAf/wAADAAG3//////8MAAAAAB///////DgP/4AAD8AH+///////CAAAAAAfz////+B+H/4AAB/4P/f//////wgAAAAABgf////Z9B/wAAA//P////////gYAAAAAAwD/+f/EHAfwAAAP+P////////gHAAAAAAgAf///gB4HwB4AH3z////////wBwAAAAAAAH///wDAA8AcAD5/////////8AeAAAAAAAA///4A4AOAAAB8//////////ADAAAAAAAAP//+AeABgAAA/PX////////gAwAAAAAAAB///gHkAAAAAPzf////////9AEAAAAAAAAf//+B/AAAAAD8f/////////8AAAAAAAAAH///wf4AAAAQHH//////+///gAAAAAAAAB////f+AAAAECj//////////sAAAAAAAAAf///n/wAAABggf/////////9AAAAAAAAAH///9/+AAABsP///////////AAAAAAAAAA/////+AAAAXP///////////wAAAAAAAAAP//7/4IAAAAn///////////4AAAAAAAAAH//8f+HAAAAD///////////+MAAAAAAAAB///x/wAAAAD////3///////DAAAAAAAAA///6f8AAAAAf//T57//////AAAAAAAAAAP////wAAAAAH9/g+f//////wIAAAAAAAAD////4AAAAAfhnwDj/////+sCAAAAAAAAA////8AAAAAH4M+98f/////BAgAAAAAAAAH///+AAAAAB8Is//H/////+IYAAAAAAAAB////AAAAAAeABP/5//////CcAAAAAAAAAP///wAAAAAAPgAX///////wMAAAAAAAAAB///4AAAAAA/4AB///////+CAAAAAAAAAAX//4AAAAAAf/BAf///////wAAAAAAAAAAB//OAAAAAAP/+f////////8AAAAAAAAAAAv8AgAAAAAD/////v/////+AAAAAAAAAAAB+AIAAAAAB////v5//////gAAAAAAAAAABfgAAAAAAA////7/AH////wAAAAAAAAAAAD4AAAAAAAf////f/g////4AAAAAAAAAAAA+AGAAAAAP////z/4H/j/AAAAAAAAAAAAAHxgGAAAAB////+/8AfwfyAAAAAAAAAAAAA/wAAAAAAf////n+AH4H8AgAAAAAAAAAAAAdAAAAAAP////8+AA8AfwIAAAAAAAAAAAAD4AAAAAD/////uAAOAD8AAAAAAAAAAAAAAEAAAAAAf////8AABgAPAAAAAAAAAAAAAAAh/gAAAD/////+AAYABgAAAAAAAAAAAAAAG/8AAAAf/////AABACAAwAAAAAAAAAAAAAP/wAAAD8////wAAAAQCEAAAAAAAAAAAAAD//gAAAAB///4AAAAWBgAAAAAAAAAAAAAB//4AAAAAf//8AAAADg4AAAAAAAAAAAAAA///AAAAAH//8AAAAA4+AAAAAAAAAAAAAAP//8AAAAB//eAAAAAHHsGAAAAAAAAAAAAD///8AAAAP//AAAAAA4zA+AAAAAAAAAAAA////wAAAB//wAAAAAEAAD8AAAAAAAAAAAH///8AAAAf/8AAAAAAcAAfAAAAAAAAAAAB////AAAAH//AAAAAAAAQAIAAAAAAAAAAAP///gAAAB//4AAAAAAAAAAAAAAAAAAAAAD///wAAAAf/+EAAAAAAAPEAAAAAAAAAAAAf//8AAAAP//jAAAAAAAfjAAAAAAAAAAAAB///AAAAD//jwAAAAAAP84AAAAAAAAAAAAP//wAAAAf/w4AAAAAAH/+AAAAAAAAAAAAD//4AAAAH/4OAAAAAAH//wAAAAAAAAAAAA//8AAAAB//DgAAAAAP//8AAAAAAAAAAAAP/8AAAAAP/gwAAAAAD///gAAAAAAAAAAAD/+AAAAAD/wAAAAAAA///8AAAAAAAAAAAA//gAAAAAf4AAAAAAAP///AAAAAAAAAAAAP/wAAAAAH+AAAAAAAD///wAAAAAAAAAAAD/4AAAAAB/AAAAAAAA///8AAAAAAAAAAAA/+AAAAAAPAAAAAAAAP///AAAAAAAAAAAAP+AAAAAAAAAAAAAAAD4P/gAAAAAAAAAAAD/gAAAAAAAAAAAAAAAgB/wAAAAAAAAAAAA/4AAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAPwAAAAAAAAAAAAAAAAAB+AAgAAAAAAAAAD8AAAAAAAAAAAAAAAAAAfAAIAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAABwAAAAAAAAADwAAAAAAAAAAAAAAAAAAOAAYAAAAAAAAAA+AAAAAAAAAAAAAAAAAADAAcAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAcEAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
let issWorldMaskBits = null;
function issDecodeWorldMask() {
  issWorldMaskBits = Buffer.from(ISS_WORLD_MASK_B64, 'base64');
}
function issIsLand(lonFrac, latFrac) {
  if (!issWorldMaskBits) issDecodeWorldMask();
  const x = Math.min(ISS_WORLD_MASK_W - 1, Math.max(0, (lonFrac * ISS_WORLD_MASK_W) | 0));
  const y = Math.min(ISS_WORLD_MASK_H - 1, Math.max(0, (latFrac * ISS_WORLD_MASK_H) | 0));
  const bitIdx = y * ISS_WORLD_MASK_W + x;
  const byte = issWorldMaskBits[bitIdx >> 3];
  return ((byte >> (7 - (bitIdx & 7))) & 1) === 1;
}

// 180°-longitude window centered on the ISS's current position - see the
// browser source's comment on issApplyMapToFace for why (true 1:1
// degree-per-pixel aspect at any SIZE, following the ISS as it moves).
function issLonToWindowU(lon, centerLon, S) {
  let rel = (centerLon + 90) - lon;
  rel = ((rel % 360) + 360) % 360;
  if (rel < 0 || rel >= 180) return -1;
  return Math.min(S - 1, Math.floor((rel / 180) * S));
}
function issLatToV(lat, S) {
  return Math.min(S - 1, Math.max(0, Math.round(((90 - lat) / 180) * S)));
}
function issBuildMapBuf(SIZE, centerLon) {
  const S = Math.max(SIZE, 16);
  const data = new Uint8ClampedArray(S * S * 4);
  for (let v = 0; v < S; v++) {
    const latFrac = v / S;
    for (let u = 0; u < S; u++) {
      let lonDeg = centerLon + 90 - (u / S) * 180;
      lonDeg = ((lonDeg + 180) % 360 + 360) % 360 - 180;
      const lonFrac = (lonDeg + 180) / 360;
      const land = issIsLand(lonFrac, latFrac);
      const i = (v * S + u) * 4;
      if (land) { data[i] = 14; data[i + 1] = 92; data[i + 2] = 30; }
      else { data[i] = 10; data[i + 1] = 38; data[i + 2] = 110; }
      data[i + 3] = 255;
    }
  }
  return { data, S, centerLon };
}
let issMapBuf = null, issMapBuiltCenter = null;
function issGetMapBuf(SIZE, centerLon) {
  const rounded = Math.round(centerLon / 5) * 5;
  if (!issMapBuf || issMapBuiltCenter !== rounded || issMapBuf.S !== Math.max(SIZE, 16)) {
    issMapBuf = issBuildMapBuf(SIZE, rounded);
    issMapBuiltCenter = rounded;
  }
  return issMapBuf;
}

function issApplyMapToFace(core, face, rowLimit) {
  const { SIZE, faceMap, colBuf } = core;
  const mirrorU = (face === 1);
  const outCol = (u) => mirrorU ? (SIZE - 1 - u) : u;
  const centerLon = issHasFix ? issLon : 0;
  const { data, S } = issGetMapBuf(SIZE, centerLon);
  const rows = rowLimit || SIZE;
  for (let v = 0; v < rows; v++) {
    const sv = Math.min(S - 1, Math.floor((rows - 1 - v) / rows * S));
    for (let u = 0; u < SIZE; u++) {
      const idx = faceMap[face][v * SIZE + outCol(u)]; if (idx < 0) continue;
      const su = Math.min(S - 1, Math.floor(u / SIZE * S));
      const pi = (sv * S + su) * 4;
      colBuf[idx * 3] = data[pi] / 255;
      colBuf[idx * 3 + 1] = data[pi + 1] / 255;
      colBuf[idx * 3 + 2] = data[pi + 2] / 255;
    }
  }
  // Trail + marker
  issTrail.forEach((p, pi) => {
    const u = issLonToWindowU(p.lon, issMapBuiltCenter, SIZE);
    if (u < 0) return;
    const dataV = Math.round(issLatToV(p.lat, SIZE) * (rows / SIZE));
    const v = rows - 1 - dataV;
    if (v < 0 || v >= rows) return;
    const age = pi / Math.max(1, issTrail.length - 1);
    const idx = faceMap[face][v * SIZE + outCol(u)]; if (idx < 0) return;
    colBuf[idx * 3] = Math.max(colBuf[idx * 3], 0.5 * age);
    colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], 0.7 * age);
    colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], 1 * age);
  });
  if (issHasFix) {
    const u = issLonToWindowU(issLon, issMapBuiltCenter, SIZE);
    const dataV = Math.round(issLatToV(issLat, SIZE) * (rows / SIZE));
    const v = rows - 1 - dataV;
    const blink = 0.6 + 0.4 * Math.sin(issT * 5);
    if (u >= 0) for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const uu = ((u + du) % SIZE + SIZE) % SIZE, vv = v + dv;
      if (vv < 0 || vv >= rows) continue;
      const idx = faceMap[face][vv * SIZE + outCol(uu)]; if (idx < 0) continue;
      colBuf[idx * 3] = 1 * blink; colBuf[idx * 3 + 1] = 1 * blink; colBuf[idx * 3 + 2] = 0.95 * blink;
    }
  }
}

function issDrawStation(core, face) {
  const { SIZE: S, faceMap, colBuf } = core;
  const cx0 = S / 2, cy0 = S / 2;
  const ang = issT * 0.4;
  const cosA = Math.cos(ang), sinA = Math.sin(ang);
  const drawSeg = (x0, y0, x1, y1, r, g, b) => {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const rx = cx0 + (x - cx0) * cosA - (y - cy0) * sinA;
      const ry = cy0 + (x - cx0) * sinA + (y - cy0) * cosA;
      const u = Math.round(rx), v = Math.round(ry);
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
      colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b;
    }
  };
  const panelW = S * 0.34;
  drawSeg(cx0 - panelW, cy0, cx0 - S * 0.06, cy0, 0.15, 0.35, 0.95);
  drawSeg(cx0 + S * 0.06, cy0, cx0 + panelW, cy0, 0.15, 0.35, 0.95);
  drawSeg(cx0 - S * 0.06, cy0 - S * 0.08, cx0 + S * 0.06, cy0 - S * 0.08, 0.9, 0.9, 0.9);
  drawSeg(cx0 - S * 0.06, cy0 + S * 0.08, cx0 + S * 0.06, cy0 + S * 0.08, 0.9, 0.9, 0.9);
  drawSeg(cx0 - S * 0.06, cy0 - S * 0.08, cx0 - S * 0.06, cy0 + S * 0.08, 0.9, 0.9, 0.9);
  drawSeg(cx0 + S * 0.06, cy0 - S * 0.08, cx0 + S * 0.06, cy0 + S * 0.08, 0.9, 0.9, 0.9);
}

// ── Text - PIXEL_FONT bitmap glyphs (no DOM canvas server-side, see module
// comment). Replaces the browser's canvas-rendered title card + ticker. ──
function issGlyph(core, face, ch, su, sv, tr, tg, tb) {
  const { SIZE: S, faceMap, colBuf } = core;
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()]; if (!rows) return 4;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = sv + (4 - row);
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
      colBuf[idx * 3] = tr; colBuf[idx * 3 + 1] = tg; colBuf[idx * 3 + 2] = tb;
    }
  }
  return 4;
}
function issText(core, face, str, su, sv, tr, tg, tb) {
  let u = su;
  for (const ch of str) { u += issGlyph(core, face, ch, u, sv, tr, tg, tb); if (u >= core.SIZE) break; }
}
function issTextCentered(core, face, str, sv, tr, tg, tb) {
  const w = str.length * 4;
  issText(core, face, str, Math.floor((core.SIZE - w) / 2), sv, tr, tg, tb);
}

let _issTickerScrollX = 0;
function issDrawTicker(core, face, dt) {
  const text = issHasFix
    ? `ISS LIVE  LAT ${issLat.toFixed(1)} LON ${issLon.toFixed(1)}  ALT ~408KM  SPEED ~27600KM/H`
    : 'ISS TRACKER  ACQUIRING SIGNAL...';
  const S = core.SIZE;
  const textW = text.length * 4;
  _issTickerScrollX = (_issTickerScrollX + dt * 16) % (textW + S);
  const offset = Math.floor(S - _issTickerScrollX);
  issText(core, face, text, offset, Math.floor(S / 2) - 2, 0.48, 0.87, 1);
}

function issDrawInfoCard(core, face) {
  const S = core.SIZE;
  issTextCentered(core, face, 'ISS TRACKER', 1, 1, 1, 1);
  if (issHasFix) {
    issTextCentered(core, face, `${issLat >= 0 ? 'N' : 'S'}${Math.abs(issLat).toFixed(1)}`, Math.floor(S * 0.42), 0.48, 0.87, 1);
    issTextCentered(core, face, `${issLon >= 0 ? 'E' : 'W'}${Math.abs(issLon).toFixed(1)}`, Math.floor(S * 0.6), 0.48, 0.87, 1);
    issTextCentered(core, face, 'LIVE FIX', Math.floor(S * 0.82), 0.73, 0.73, 0.73);
  } else {
    issTextCentered(core, face, 'ACQUIRING', Math.floor(S * 0.5), 0.73, 0.73, 0.73);
  }
}

// Tracks core.effectOptions.iss.refreshRequestedAt - same "any change forces
// a re-fetch now" trick as epic.js's lastRefreshOpt, backing the option
// panel's "Refresh Position" button (setEffectOption is a value-store, not a
// fire-once command channel - see wsServer.js's setEffectOption comment).
let lastRefreshOpt = null;

// Extracted out of effectISS() so issWall.js (wall-mode counterpart) can
// drive the exact same 5s live-position poll + reverse-geocode/flag
// fetch instead of running a second independent poller against the same
// rate-limited free APIs (wheretheiss.at / BigDataCloud / flagcdn).
function ensureFetch(core) {
  const opts = core.effectOptions?.iss || {};
  if (opts.refreshRequestedAt && opts.refreshRequestedAt !== lastRefreshOpt) {
    lastRefreshOpt = opts.refreshRequestedAt;
    issLastFetch = 0;
    if (!issFetching) issFetch();
  }
  if (!issFetching && (Date.now() / 1000 - issLastFetch) > 5) issFetch();
}

// ── Effect entry point ───────────────────────────────────────────────────
function effectISS(core, dt) {
  issT += dt;
  ensureFetch(core);

  const { N, colBuf, SIZE: S } = core;
  colBuf.fill(0);

  const is2D = core.panelMode === '2d';
  if (is2D) {
    issApplyMapToFace(core, 0);
    return;
  }

  // Face 0: starfield + orbiting station icon
  const tt = Date.now() * 0.001;
  for (let i = 0; i < N; i++) {
    const seed = ((i * 2654435761) >>> 0) / 4294967296;
    if (seed < 0.012) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.4 + seed * 60));
      const br = seed * 30 * twinkle;
      colBuf[i * 3] = br; colBuf[i * 3 + 1] = br; colBuf[i * 3 + 2] = br * 1.1;
    }
  }
  issDrawStation(core, 0);

  // Face 1: world map with ground track + live marker
  issApplyMapToFace(core, 1);

  // Face 4: info card
  issDrawInfoCard(core, 4);

  // Face 2: scrolling info ticker
  issDrawTicker(core, 2, dt);

  // Face 3: flag of the country currently being overflown
  if (issHasFix) {
    const shown = issApplyFlagToFace(core, 3);
    if (!shown) {
      if (issFlagState === 'error') {
        issTextCentered(core, 3, 'FLAG', Math.floor(S * 0.42), 0.6, 0.4, 0.1);
        issTextCentered(core, 3, 'ERROR', Math.floor(S * 0.58), 0.6, 0.4, 0.1);
      } else if (!issCountryCode) {
        issTextCentered(core, 3, 'OVER', Math.floor(S * 0.42), 0.25, 0.55, 0.95);
        issTextCentered(core, 3, 'OCEAN', Math.floor(S * 0.58), 0.25, 0.55, 0.95);
      } else {
        const dots = '.'.repeat(1 + (Math.floor(issT) % 3));
        issTextCentered(core, 3, 'LOADING', Math.floor(S * 0.42), 0.7, 0.7, 0.7);
        issTextCentered(core, 3, dots, Math.floor(S * 0.58), 0.7, 0.7, 0.7);
      }
    }
  } else {
    issTextCentered(core, 3, 'NO FIX', Math.floor(S * 0.5), 0.5, 0.5, 0.5);
  }
}

// Polled by app.js each tick into state.effectStatus.iss, broadcast to
// clients - backs the option panel's #iss-status/#iss-info readouts (see
// pi-native/public/app.js's wireIssPanel/syncIssPanel).
function getStatus() {
  return {
    hasFix: issHasFix,
    lat: issHasFix ? issLat : null,
    lon: issHasFix ? issLon : null,
    timestamp: issHasFix ? issTimestamp : null,
    fetching: issFetching,
    error: issError || null,
    countryCode: issCountryCode || null,
    countryName: issCountryName || null,
  };
}

module.exports = effectISS;
module.exports.getStatus = getStatus;
// Reused by issWall.js - same "share the fetch/decode plumbing, only
// reimplement rendering" approach as epic.js's exports above.
module.exports.ensureFetch = ensureFetch;
module.exports.issIsLand = issIsLand;
module.exports.getState = () => ({
  issLat, issLon, issHasFix, issTrail, issT,
  issFlagPixels, issFlagSize, issFlagState,
  issCountryCode,
});
