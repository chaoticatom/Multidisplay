// Ambient Weather: the real weather outside as a mood rather than numbers
// - rain streaks, drifting snow, rolling clouds, fog, lightning flashes,
// or a clear sky with the sun (or moon and stars at night) - with the
// temperature in a corner. Uses the Weather effect's city
// (effectOptions.weather.city) and the same free Open-Meteo data.
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, drawString, textWidth } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const { createWxState } = require('./weather/state');
const { fetchWeather } = require('./weather/fetch');

const REFRESH_MS = 15 * 60 * 1000;
let wx = null, lastFetch = 0, lastCity = null, flash = 0;
const drops = [];

function kind(code) {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'cloud';
  return 'clear';
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    if (!wx) wx = createWxState();
    const city = (core.effectOptions && core.effectOptions.weather && core.effectOptions.weather.city) || 'London';
    if (city !== lastCity || Date.now() - lastFetch > REFRESH_MS) {
      lastCity = city; lastFetch = Date.now();
      fetchWeather(wx, city, core.SIZE).catch(() => {});
    }
    const k = kind(wx.code || 0);
    const now = new Date(), secs = now.getHours() * 3600 + now.getMinutes() * 60;
    const day = secs > (wx.sunriseS || 21600) && secs < (wx.sunsetS || 72000);
    const top = day ? (k === 'clear' ? [0.1, 0.3, 0.75] : [0.25, 0.3, 0.38]) : [0.01, 0.02, 0.07];
    const bot = day ? (k === 'clear' ? [0.5, 0.65, 0.9] : [0.4, 0.42, 0.48]) : [0.04, 0.05, 0.14];
    flash = Math.max(0, flash - dt * 3);
    if (k === 'storm' && Math.random() < dt * 0.4) flash = 1;
    for (let y = 0; y < c.H; y++) {
      const f = y / c.H;
      for (let x = 0; x < c.W; x++) {
        let r = top[0] + (bot[0] - top[0]) * f, g = top[1] + (bot[1] - top[1]) * f, b = top[2] + (bot[2] - top[2]) * f;
        if (k === 'cloud' || k === 'storm' || k === 'rain') {
          const n = Math.sin(x * 0.11 + t * 0.15) + Math.sin(x * 0.05 - t * 0.08 + y * 0.09) + Math.sin(y * 0.2 + x * 0.03);
          const cl = Math.max(0, n - 0.5) * (1 - f) * 0.35;
          r += cl; g += cl; b += cl;
        }
        if (k === 'fog') { const h = 0.3 + 0.15 * Math.sin(x * 0.08 + t * 0.2 + y * 0.05); r += h; g += h; b += h; }
        r += flash * 0.8; g += flash * 0.8; b += flash;
        c.set(x, y, Math.min(1, r * 0.85), Math.min(1, g * 0.85), Math.min(1, b * 0.85));
      }
    }
    if (k === 'clear') {
      const sx = c.W * 0.72, sy = c.H * 0.3, R = Math.min(c.W, c.H) * (day ? 0.12 : 0.09);
      const col = day ? [1, 0.85, 0.4] : [0.85, 0.88, 1];
      for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
        const d = Math.hypot(x - sx, y - sy), v = d < R ? 1 : Math.max(0, 1 - (d - R) / (R * 2.5)) * 0.4;
        if (v > 0) c.add(x, y, col[0] * v, col[1] * v, col[2] * v);
      }
      if (!day) for (let i = 0; i < 25; i++) { const x = (i * 53) % c.W, y = (i * 31) % (c.H * 0.7); if (Math.sin(t * 1.5 + i * 2) > -0.2) c.add(x, y, 0.6, 0.6, 0.7); }
    }
    if (k === 'rain' || k === 'storm' || k === 'snow') {
      const want = Math.round(c.W * (k === 'snow' ? 0.6 : 0.9));
      while (drops.length < want) drops.push({ x: Math.random() * c.W, y: Math.random() * c.H, v: 0.6 + Math.random() * 0.6 });
      drops.length = want;
      for (const d of drops) {
        if (k === 'snow') { d.y += dt * 9 * d.v; d.x += Math.sin(t + d.v * 10) * dt * 3; c.add(d.x, d.y, 0.9, 0.9, 1); }
        else { d.y += dt * 70 * d.v; d.x -= dt * 8; for (let i = 0; i < 3; i++) c.add(d.x + i * 0.3, d.y - i, 0.3, 0.4, 0.6); }
        if (d.y > c.H) { d.y = -2; d.x = Math.random() * c.W; }
        if (d.x < 0) d.x += c.W;
      }
    }
    if (Number.isFinite(wx.temp)) {
      const s = wx.temp + '°';
      drawString(FONT_3x5, s.replace('°', ''), c.W - textWidth(FONT_3x5, s.replace('°', '')) - 3, 2, (x, y) => c.set(x, y, 1, 1, 1));
      c.set(c.W - 2, 2, 1, 1, 1);
    }
  },
});
