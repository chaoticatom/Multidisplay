// Weather radar: live rain over a dark map of your area, looping the last
// hour like a TV weather map, with the time of each frame and a blinking
// dot at home. Location is the Weather effect's town (weatherConfig).
//   map:   CARTO dark basemap tiles (free, no key)
//   radar: RainViewer (free, no key) - the last 4 past frames
// Refreshed every 10 minutes. The area shown is cropped to the display's
// shape; option `zoom` (6 country .. 8 town, default 7).
// One module for cube and wall (fn.wall); like other fetching effects it
// fetches in the background and draws whatever it has.
'use strict';

const { fetchWithTimeout } = require('./net');
const { FONT_3x5, drawString } = require('./text');

const REFRESH_MS = 10 * 60000;
const FRAMES = 4;
const TILE = 256;
const st = { loc: null, city: null, zoom: 0, frames: [], mapKey: '', lastFetch: 0, busy: false, error: '', place: '', composed: new Map() };

function tileXY(lat, lon, z) {
  const n = 2 ** z, x = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180, y = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  return { x, y }; // fractional tile coordinates
}

async function getPng(url) {
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Multidisplay LED display' } });
  if (!res.ok) throw new Error(new URL(url).host + ': ' + res.status);
  const { Jimp } = require('jimp');
  const img = await Jimp.read(Buffer.from(await res.arrayBuffer()));
  return img.bitmap; // { width, height, data: RGBA }
}

async function geocode(city) {
  const r = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`);
  if (!r.ok) throw new Error('geocoding-api.open-meteo.com: ' + r.status);
  const d = await r.json();
  if (!d.results || !d.results.length) throw new Error('town not found: ' + city);
  return { lat: d.results[0].latitude, lon: d.results[0].longitude, place: d.results[0].name };
}

// Fetch the tiles covering a 512-px-wide window centred on home, as one
// RGBA mosaic for the map and one per radar frame.
async function refresh(city, zoom) {
  st.busy = true; st.lastFetch = Date.now();
  try {
    if (!st.loc || st.city !== city) { st.loc = await geocode(city); st.city = city; st.place = st.loc.place; }
    const c = tileXY(st.loc.lat, st.loc.lon, zoom);
    const x0 = Math.floor(c.x - 1), y0 = Math.floor(c.y - 0.5), nx = 3, ny = 2; // 768 x 512 px around home
    const mosaic = () => ({ w: nx * TILE, h: ny * TILE, data: new Uint8Array(nx * TILE * ny * TILE * 4) });
    const paste = (m, bmp, tx, ty) => {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const si = (y * bmp.width + x) * 4, di = ((ty * TILE + y) * m.w + tx * TILE + x) * 4;
        m.data[di] = bmp.data[si]; m.data[di + 1] = bmp.data[si + 1]; m.data[di + 2] = bmp.data[si + 2]; m.data[di + 3] = bmp.data[si + 3];
      }
    };
    const mapKey = zoom + '/' + x0 + '/' + y0;
    if (st.mapKey !== mapKey) {
      const map = mosaic();
      for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) paste(map, await getPng(`https://a.basemaps.cartocdn.com/dark_nolabels/${zoom}/${x0 + tx}/${y0 + ty}.png`), tx, ty);
      st.map = map; st.mapKey = mapKey;
    }
    const meta = await (await fetchWithTimeout('https://api.rainviewer.com/public/weather-maps.json')).json();
    const past = ((meta.radar && meta.radar.past) || []).slice(-FRAMES);
    const frames = [];
    for (const f of past) {
      const m = mosaic();
      for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) paste(m, await getPng(`${meta.host}${f.path}/256/${zoom}/${x0 + tx}/${y0 + ty}/2/1_1.png`), tx, ty);
      frames.push({ time: f.time, radar: m });
    }
    st.frames = frames;
    st.home = { x: (c.x - x0) * TILE, y: (c.y - y0) * TILE };
    st.composed.clear();
    st.error = '';
  } catch (e) {
    st.error = e.message;
  } finally { st.busy = false; }
}

function maybeRefresh(opts) {
  const city = (require('../weatherConfig').load() || {}).city;
  const zoom = [6, 7, 8].includes(Number(opts.zoom)) ? Number(opts.zoom) : 7;
  if (!city) { st.error = 'Set your town in the Weather effect first'; return; }
  const due = Date.now() - st.lastFetch > REFRESH_MS || city !== st.city || zoom !== st.zoom;
  if (due && !st.busy && Date.now() - st.lastFetch > 20000) { st.zoom = zoom; refresh(city, zoom); }
}

// The map plus one radar frame, cropped round home to w x h (cached).
function compose(i, w, h) {
  const key = i + ':' + w + 'x' + h;
  if (st.composed.has(key)) return st.composed.get(key);
  const map = st.map, rad = st.frames[i].radar, home = st.home;
  const cropW = Math.min(map.w, 512), cropH = cropW * h / w;
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.max(0, Math.min(map.w - 1, Math.round(home.x - cropW / 2 + (x + 0.5) * cropW / w)));
    const sy = Math.max(0, Math.min(map.h - 1, Math.round(home.y - cropH / 2 + (y + 0.5) * cropH / h)));
    const si = (sy * map.w + sx) * 4, a = rad.data[si + 3] / 255, o = (y * w + x) * 3;
    // Map brightened a little (it's very dark on LEDs), radar on top.
    for (let k = 0; k < 3; k++) out[o + k] = (map.data[si + k] / 255) * 1.6 * (1 - a) + (rad.data[si + k] / 255) * a;
  }
  st.composed.set(key, out);
  return out;
}

let clock = 0;
function frameNow(dt) {
  clock += dt;
  const n = st.frames.length, cycle = n * 0.7 + 1.5; // hold on the latest frame
  const t = clock % cycle;
  return Math.min(n - 1, Math.floor(t / 0.7));
}
function label(plot, w, i, tz) {
  const d = require('../localTime').wallClock(tz, new Date(st.frames[i].time * 1000)); // the user's time, not the Pi's (often UTC)
  const hhmm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  drawString(FONT_3x5, hhmm, 1, 1, plot);
  if (w >= 96 && st.place) drawString(FONT_3x5, st.place.toUpperCase().slice(0, Math.floor((w - 30) / 4)), 26, 1, plot);
}
function waiting(plot, w, h) {
  const text = st.error ? 'RADAR: ' + st.error.toUpperCase() : 'LOADING RADAR';
  drawString(FONT_3x5, text.slice(0, Math.floor(w / 4)), 1, Math.floor(h / 2) - 3, plot);
}

function radarWall(core, dt) {
  if (!core.wallW) return;
  maybeRefresh((core.effectOptions && core.effectOptions.radar) || {});
  const W = core.wallW, H = core.wallH;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;
  const plotText = (x, y) => core.setWallPixel(x, y, 0.9, 0.95, 1);
  if (!st.frames.length || !st.map) { waiting(plotText, W, H); return; }
  const i = frameNow(dt), img = compose(i, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; core.setWallPixel(x, y, img[o], img[o + 1], img[o + 2]); }
  if (Math.floor(clock * 2) % 2 === 0) core.setWallPixel(Math.round(W / 2), Math.round(H / 2), 1, 1, 1); // home
  label(plotText, W, i, core.tz);
}

function radarCube(core, dt) {
  maybeRefresh((core.effectOptions && core.effectOptions.radar) || {});
  const S = core.SIZE;
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  if (!st.frames.length || !st.map) return;
  const i = frameNow(dt), img = compose(i, S, S);
  // The same view on each side face; face rows run bottom-up (see text.js).
  for (let face = 0; face < 4; face++) for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const o = ((S - 1 - v) * S + u) * 3; core.setFaceLED(face, u, v, img[o], img[o + 1], img[o + 2]);
  }
}

radarCube.wall = radarWall;
radarCube._test = { st, tileXY }; // for the tests
radarCube.getStatus = () => ({ place: st.place, frames: st.frames.length, updated: st.lastFetch, error: st.error, busy: st.busy });
module.exports = radarCube;
