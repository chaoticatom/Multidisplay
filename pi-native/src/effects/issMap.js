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
    // Zoomed in and following the station: about 1.6 degrees per pixel, so a
    // single panel shows ~100 degrees (countries big enough to read) and a
    // very wide wall shows the whole world.
    const lonSpan = Math.min(360, W * 1.6), latSpan = Math.min(180, lonSpan * mapH / W);
    const cLon = S.issHasFix ? S.issLon : 0, cLat = S.issHasFix ? Math.max(-90 + latSpan / 2, Math.min(90 - latSpan / 2, S.issLat)) : 0;
    const wrap = (d) => ((d + 540) % 360) - 180;
    const X = (lon) => W / 2 + (wrap(lon - cLon) / lonSpan) * W, Y = (lat) => mapH / 2 - ((lat - cLat) / latSpan) * mapH;
    const sun = subsolar(new Date()), sd = sun.lat * D2R;
    // Map with day/night.
    for (let y = 0; y < mapH; y++) {
      const lat = cLat + (0.5 - (y + 0.5) / mapH) * latSpan, la = lat * D2R;
      for (let x = 0; x < W; x++) {
        const lon = wrap(cLon + ((x + 0.5) / W - 0.5) * lonSpan);
        const cosz = Math.sin(la) * Math.sin(sd) + Math.cos(la) * Math.cos(sd) * Math.cos((lon - sun.lon) * D2R);
        const day = 0.25 + 0.75 * Math.max(0, Math.min(1, (cosz + 0.08) / 0.16)); // soft twilight band; night stays readable
        const land = iss.issIsLand((lon + 180) / 360, (90 - lat) / 180), ice = Math.abs(lat) > 66;
        let dr, dg, db, nr, ng, nb;
        if (land) {
          if (ice) { dr = 0.85; dg = 0.9; db = 0.95; } else { const dry = Math.max(0, 1 - Math.abs(Math.abs(lat) - 23) / 15); dr = 0.15 + dry * 0.5; dg = 0.65 + dry * 0.1; db = 0.12; }
          nr = 0.1; ng = 0.2; nb = 0.12; // land stays visible at night
          if (!ice && hash(Math.round(lon * 2), Math.round(lat * 2)) > 0.975) { nr += 0.7; ng += 0.55; nb += 0.15; } // city lights, sparse
        } else { dr = 0.05; dg = 0.28; db = 0.8; nr = 0.02; ng = 0.07; nb = 0.28; }
        c.set(x, y, nr + (dr - nr) * day, ng + (dg - ng) * day, nb + (db - nb) * day);
      }
    }
    // Grid lines: equator and tropics, faint.
    for (const lat of [0, 23.4, -23.4]) for (let x = 0; x < W; x += 2) { if (Y(lat) < 0 || Y(lat) >= mapH) continue; const p = c.get(x, Y(lat)); if (p) c.set(x, Y(lat), p[0] + 0.05, p[1] + 0.05, p[2] + 0.08); }
    if (!S.issHasFix) {
      const msg = S.issError ? 'NO SIGNAL' : 'FINDING ISS';
      drawString(FONT_3x5, msg, Math.round((W - textWidth(FONT_3x5, msg)) / 2), Math.round(mapH / 2) - 2, (x, y) => c.set(x, y, 1, 1, 1));
      return;
    }
    const lat = S.issLat, lon = S.issLon;
    // Ground track: past 45 min dim, next 95 min as bright dashes.
    let prev = null;
    for (let s = -45 * 60; s <= 95 * 60; s += 8) {
      const [la, lo] = trackAt(lat, lon, S.issAscending, s), x = X(lo), y = Y(la);
      if (prev && Math.abs(prev[0] - x) < W / 2) {
        const future = s > 0, dash = Math.floor(s / 120) % 2 === 0;
        if (x >= 0 && x < W && y >= 0 && y < mapH) {
          if (!future) c.set(x, y, 0.9, 0.45, 0.1);
          else if (dash || W < 96) c.set(x, y, 1, 0.95, 0.3);
        }
      }
      prev = [x, y];
    }
    // Visibility ring (about 20° of arc), stretched with latitude.
    const R = 20, stretch = 1 / Math.max(0.3, Math.cos(lat * D2R));
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2, la = lat + Math.sin(ang) * R, lo = lon + Math.cos(ang) * R * stretch;
      const x = X(((lo + 540) % 360) - 180), y = Y(Math.max(-89, Math.min(89, la)));
      if (a % 2 === 0) c.add(x, y, 0.25, 0.5, 0.6);
    }
    // The station.
    const sx = Math.round(X(lon)), sy = Math.round(Y(lat)), lit = S.issVis !== 'eclipsed', pulse = 0.6 + 0.4 * Math.sin(t * 5);
    const body = lit ? [1, 1, 1] : [0.5, 0.75, 1];
    // A pulsing ring so it can be found at a glance, then the station.
    const rr = 4 + pulse * 2;
    for (let a = 0; a < 32; a++) { const ang = a / 32 * Math.PI * 2; c.set(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr, 1, 0.25 * pulse, 0.2 * pulse); }
    for (let k = -4; k <= 4; k++) if (Math.abs(k) >= 2) { c.set(sx + k, sy - 1, 0.35, 0.6, 1); c.set(sx + k, sy, 0.35, 0.6, 1); c.set(sx + k, sy + 1, 0.35, 0.6, 1); } // solar panels
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) c.set(sx + i, sy + j, ...body);
    // Ticker bar with the flag.
    for (let y = mapH; y < H; y++) for (let x = 0; x < W; x++) c.set(x, y, 0.05, 0.05, 0.14);
    let tx0 = 1;
    if (S.issFlagPixels && S.issFlagSize && S.issCountryCode) {
      const IS = S.issFlagSize;
      for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) { const pi = (Math.floor(y / 5 * IS) * IS + Math.floor(x / 8 * IS)) * 4; c.set(1 + x, mapH + 1 + y, S.issFlagPixels[pi] / 255, S.issFlagPixels[pi + 1] / 255, S.issFlagPixels[pi + 2] / 255); }
      tx0 = 11;
    }
    const over = S.issCountryName ? S.issCountryName.toUpperCase() : 'OCEAN';
    const label = `OVER ${over}   ${Math.round(S.issAlt)} KM UP   ${Math.round(S.issVel).toLocaleString('en-GB')} KM/H   ${lit ? 'SUNLIT' : 'IN SHADOW'}      `;
    scroll += dt * 14;
    const tw = W - tx0;
    drawMarquee(FONT_3x5, label, scroll % (textWidth(FONT_3x5, label) + 4), mapH + 1, tw, (x, y) => c.set(tx0 + x, y, 1, 1, 1));
  },
});
