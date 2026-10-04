// ISS Tracker (flat panel / wall): the station over a world map.
//   - the map shows real day and night: a terminator moving with the sun,
//     dark oceans and city lights on the night side
//   - the ground track: where it has been (dim) and where it goes next
//     (bright dashes, about one orbit ahead), from its orbit (51.6°
//     inclination, 92.7 min) fitted to the live position
//   - a ring showing the area that can see it, and the station itself,
//     white in sunlight, blue in Earth's shadow
//   - a ticker: country below (with its flag), altitude, speed, sunlit
// Live data comes from iss.js (wheretheiss.at every 5 s, country and flag).
'use strict';
const { defineCanvasEffect } = require('./canvas');
const iss = require('./iss');
const { FONT_3x5, drawMarquee, drawString, textWidth } = require('./text');

const INC = 51.64 * Math.PI / 180, PERIOD = 92.68 * 60, EARTH_RATE = 360 / 86164; // deg per second
const D2R = Math.PI / 180;
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
let scroll = 0;

// Where the sun is overhead right now (approximate).
function subsolar(now) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0), doy = (now - start) / 86400000;
  const dec = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10));
  const hours = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return { lat: dec, lon: (12 - hours) * 15 };
}

// Ground track point dt seconds from now, from the current fix.
function trackAt(lat, lon, ascending, dt) {
  let u = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat * D2R) / Math.sin(INC))));
  if (!ascending) u = Math.PI - u;
  const node = lon - Math.atan2(Math.cos(INC) * Math.sin(u), Math.cos(u)) / D2R;
  const u2 = u + 2 * Math.PI * dt / PERIOD;
  const lat2 = Math.asin(Math.sin(INC) * Math.sin(u2)) / D2R;
  let lon2 = node + Math.atan2(Math.cos(INC) * Math.sin(u2), Math.cos(u2)) / D2R - EARTH_RATE * dt;
  lon2 = ((lon2 + 540) % 360) - 180;
  return [lat2, lon2];
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    iss.ensureFetch(core);
    const S = iss.getState(), W = c.W, H = c.H, barH = 7, mapH = H - barH;
    const X = (lon) => ((lon + 180) / 360) * W, Y = (lat) => ((90 - lat) / 180) * mapH;
    const sun = subsolar(new Date()), sd = sun.lat * D2R;
    // Map with day/night.
    for (let y = 0; y < mapH; y++) {
      const lat = 90 - ((y + 0.5) / mapH) * 180, la = lat * D2R;
      for (let x = 0; x < W; x++) {
        const lon = ((x + 0.5) / W) * 360 - 180;
        const cosz = Math.sin(la) * Math.sin(sd) + Math.cos(la) * Math.cos(sd) * Math.cos((lon - sun.lon) * D2R);
        const day = Math.max(0, Math.min(1, (cosz + 0.08) / 0.16)); // soft twilight band
        const land = iss.issIsLand((lon + 180) / 360, (90 - lat) / 180), ice = Math.abs(lat) > 66;
        let dr, dg, db, nr, ng, nb;
        if (land) {
          if (ice) { dr = 0.75; dg = 0.8; db = 0.85; } else { const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 23) / 15); dr = 0.12 + dry * 0.35; dg = 0.42 + dry * 0.1; db = 0.1; }
          nr = 0.03; ng = 0.05; nb = 0.05;
          if (!ice && hash(x, y) > 0.93) { const tw = 0.5 + 0.5 * Math.sin(t * 2 + x * y); nr += 0.6 * tw; ng += 0.45 * tw; nb += 0.12 * tw; } // city lights
        } else { dr = 0.04; dg = 0.18; db = 0.5; nr = 0.01; ng = 0.025; nb = 0.09; }
        c.set(x, y, nr + (dr - nr) * day, ng + (dg - ng) * day, nb + (db - nb) * day);
      }
    }
    // Grid lines: equator and tropics, faint.
    for (const lat of [0, 23.4, -23.4]) for (let x = 0; x < W; x += 2) { const p = c.get(x, Y(lat)); if (p) c.set(x, Y(lat), p[0] + 0.05, p[1] + 0.05, p[2] + 0.08); }
    if (!S.issHasFix) {
      const msg = S.issError ? 'NO SIGNAL' : 'FINDING ISS';
      drawString(FONT_3x5, msg, Math.round((W - textWidth(FONT_3x5, msg)) / 2), Math.round(mapH / 2) - 2, (x, y) => c.set(x, y, 1, 1, 1));
      return;
    }
    const lat = S.issLat, lon = S.issLon;
    // Ground track: past 45 min dim, next 95 min as bright dashes.
    let prev = null;
    for (let s = -45 * 60; s <= 95 * 60; s += 20) {
      const [la, lo] = trackAt(lat, lon, S.issAscending, s), x = X(lo), y = Y(la);
      if (prev && Math.abs(prev[0] - x) < W / 2) {
        const future = s > 0, dash = Math.floor(s / 120) % 2 === 0;
        if (!future) c.add(x, y, 0.25, 0.2, 0.08);
        else if (dash) c.add(x, y, 0.9, 0.75, 0.2);
      }
      prev = [x, y];
    }
    // Visibility ring (about 20° of arc), stretched with latitude.
    const R = 20, stretch = 1 / Math.max(0.3, Math.cos(lat * D2R));
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2, la = lat + Math.sin(ang) * R, lo = lon + Math.cos(ang) * R * stretch;
      const x = X(((lo + 540) % 360) - 180), y = Y(Math.max(-89, Math.min(89, la)));
      if (a % 2 === 0) c.add(x, y, 0.15, 0.35, 0.45);
    }
    // The station.
    const sx = Math.round(X(lon)), sy = Math.round(Y(lat)), lit = S.issVis !== 'eclipsed', pulse = 0.6 + 0.4 * Math.sin(t * 5);
    const body = lit ? [1, 1, 1] : [0.5, 0.75, 1];
    for (let k = -3; k <= 3; k++) if (Math.abs(k) >= 2) c.set(sx + k, sy, 0.3, 0.55, 1); // solar panels
    c.set(sx - 1, sy, ...body); c.set(sx, sy, ...body); c.set(sx + 1, sy, ...body); c.set(sx, sy - 1, ...body); c.set(sx, sy + 1, ...body);
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) c.add(sx + dx, sy + dy, 0.4 * pulse, 0.35 * pulse, 0.1 * pulse);
    // Ticker bar with the flag.
    for (let y = mapH; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.02, 0.02, 0.05);
    let tx0 = 1;
    if (S.issFlagPixels && S.issFlagSize && S.issCountryCode) {
      const IS = S.issFlagSize;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { const pi = (Math.floor(y / 5 * IS) * IS + Math.floor(x / 8 * IS)) * 4; c.set(1 + x, mapH + 1 + y, S.issFlagPixels[pi] / 255, S.issFlagPixels[pi + 1] / 255, S.issFlagPixels[pi + 2] / 255); }
      tx0 = 11;
    }
    const over = S.issCountryName ? S.issCountryName.toUpperCase() : 'OCEAN';
    const label = `ISS OVER ${over}   ALT ${Math.round(S.issAlt)} KM   ${Math.round(S.issVel).toLocaleString('en-GB')} KM/H   ${lit ? 'IN SUNLIGHT' : 'IN EARTH\'S SHADOW'}   LAT ${lat.toFixed(1)} LON ${lon.toFixed(1)}      `;
    scroll += dt * 14;
    const tw = W - tx0;
    drawMarquee(FONT_3x5, label, scroll % (textWidth(FONT_3x5, label) + 4), mapH + 1, tw, (x, y) => c.set(tx0 + x, y, 0.85, 0.85, 0.95));
  },
});
