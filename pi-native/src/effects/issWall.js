// Wall-mode counterpart to iss.js ("ISS Tracker").
//
// Shape check (per the batch brief): iss.js's cube version is a genuine
// world-map display - one whole SIZE x SIZE panel is a 180°-longitude
// window of the digitized landmass mask, centered on the ISS's current
// position, with the other cube faces used for a starfield+station icon,
// an info card, a ticker, and the overflown country's flag (six
// independent single-purpose faces - nothing to "spread across" on one
// stitched canvas the way, say, a panorama would). For the wall, that
// single map face becomes the natural whole-canvas centerpiece: the
// longitude window widens with the wall's aspect ratio
// (`lonWindowDeg = 180 * (wallW/wallH)`, so a 2-panel-wide 128x64 wall
// shows a full 360° world map instead of the cube's fixed 180°),
// generalizing the SAME map-window math iss.js's issBuildMapBuf already
// does rather than tiling/repeating the map per panel - this is the
// "generalize an existing full-canvas composition to wallW x wallH"
// shape, same family as weatherWall.js's sky/horizon or neoWall.js's
// Earth+radar, not a single small centered scene.
//
// The ground-track trail, live blinking marker, starfield, and scrolling
// info ticker are all kept and plotted across the same full-wall map. The
// per-face flag/info-card/station-icon faces are dropped (there's no
// second panel to put them on, and tiling a duplicate flag over the map
// would just occlude it) - the flag/country name are folded into the
// ticker text instead, so the information isn't lost, just reformatted
// for a single continuous display (same tradeoff apod.js's wall port made
// for its "letterbox vs many faces" difference).
//
// Fetch scheduling (live position poll, reverse-geocode, flag decode) and
// the landmass-mask decode (issIsLand) are reused as-is via iss.js's
// exports - this file only reimplements the map-window pixel loop and
// text layout against core.setWallPixel/wallW/wallH.
'use strict';

const iss = require('./iss');
const { FONT: RADIO_GLYPHS, CHAR_W } = require('./radio/font');

let scrollX = 0;
let wallT = 0;

function drawGlyphWall(core, W, H, ch, su, sv, rgb) {
  const rows = RADIO_GLYPHS[ch.toUpperCase()] || RADIO_GLYPHS['?'];
  for (let ry = 0; ry < 7; ry++) {
    const bits = rows[ry];
    const y = sv - (6 - ry);
    if (y < 0 || y >= H) continue;
    for (let rx = 0; rx < 5; rx++) {
      if (!(bits & (1 << (4 - rx)))) continue;
      const x = su + rx;
      if (x < 0 || x >= W) continue;
      core.setWallPixel(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
  return CHAR_W;
}
function drawTickerWall(core, W, H, label, dt) {
  const textW = label.length * CHAR_W;
  scrollX += dt * 16;
  if (scrollX > textW) scrollX -= textW;
  const sv = H - 2;
  const rgb = [0.48, 0.87, 1];
  let u = -Math.floor(scrollX);
  while (u < W) {
    for (const ch of label) {
      u += drawGlyphWall(core, W, H, ch, u, sv, rgb);
      if (u > W) break;
    }
  }
}

// lon/lat -> wall-window u/v, widened to the wall's own aspect ratio - see
// module comment. `centerLon` is the window's horizontal center (the ISS's
// current longitude while it has a fix).
function lonToWindowU(lon, centerLon, W, lonWindowDeg) {
  let rel = (centerLon + lonWindowDeg / 2) - lon;
  rel = ((rel % 360) + 360) % 360;
  if (rel < 0 || rel >= lonWindowDeg) return -1;
  return Math.min(W - 1, Math.floor((rel / lonWindowDeg) * W));
}
function latToV(lat, H) {
  return Math.min(H - 1, Math.max(0, Math.round(((90 - lat) / 180) * H)));
}

let mapCache = null, mapCacheKey = null;
function buildMapWall(W, H, centerLon, lonWindowDeg) {
  const rounded = Math.round(centerLon / 5) * 5;
  const key = `${W}x${H}@${rounded}`;
  if (mapCache && mapCacheKey === key) return mapCache;
  const data = new Float32Array(W * H * 3);
  for (let v = 0; v < H; v++) {
    const latFrac = v / H;
    for (let u = 0; u < W; u++) {
      let lonDeg = rounded + lonWindowDeg / 2 - (u / W) * lonWindowDeg;
      lonDeg = ((lonDeg + 180) % 360 + 360) % 360 - 180;
      const lonFrac = (lonDeg + 180) / 360;
      const land = iss.issIsLand(lonFrac, latFrac);
      const o = (v * W + u) * 3;
      if (land) { data[o] = 14 / 255; data[o + 1] = 92 / 255; data[o + 2] = 30 / 255; }
      else { data[o] = 10 / 255; data[o + 1] = 38 / 255; data[o + 2] = 110 / 255; }
    }
  }
  mapCache = data; mapCacheKey = key;
  return data;
}

function effectIssWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  wallT += dt;
  iss.ensureFetch(core);

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const st = iss.getState();
  const lonWindowDeg = Math.min(360, 180 * (W / H));
  const centerLon = st.issHasFix ? st.issLon : 0;
  const data = buildMapWall(W, H, centerLon, lonWindowDeg);
  const roundedCenter = Math.round(centerLon / 5) * 5;
  for (let i = 0; i < W * H; i++) {
    const o = i * 3;
    core.setWallPixel(i % W, (i / W) | 0, data[o], data[o + 1], data[o + 2]);
  }

  // Ground-track trail.
  st.issTrail.forEach((p, pi) => {
    const u = lonToWindowU(p.lon, roundedCenter, W, lonWindowDeg);
    if (u < 0) return;
    const v = latToV(p.lat, H);
    const age = pi / Math.max(1, st.issTrail.length - 1);
    core.setWallPixel(u, v, 0.5 * age, 0.7 * age, 1 * age);
  });

  // Live blinking marker.
  if (st.issHasFix) {
    const u = lonToWindowU(st.issLon, roundedCenter, W, lonWindowDeg);
    const v = latToV(st.issLat, H);
    const blink = 0.6 + 0.4 * Math.sin(st.issT * 5);
    if (u >= 0) for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) {
      const uu = u + du, vv = v + dv;
      if (uu < 0 || uu >= W || vv < 0 || vv >= H) continue;
      core.setWallPixel(uu, vv, 1 * blink, 1 * blink, 0.95 * blink);
    }
  }

  // Info/status text (position + country, replacing the cube's separate
  // info-card/flag faces - see module comment).
  const label = st.issHasFix
    ? `ISS LIVE  LAT ${st.issLat.toFixed(1)} LON ${st.issLon.toFixed(1)}  ALT ~408KM  ${st.issCountryCode ? 'OVER ' + st.issCountryCode : 'OVER OCEAN'}`
    : 'ISS TRACKER  ACQUIRING SIGNAL...';
  drawTickerWall(core, W, H, '   ' + label + '   ', dt);
}

module.exports = effectIssWall;
module.exports.getStatus = iss.getStatus;
