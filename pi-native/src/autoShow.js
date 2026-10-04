// Automatic show: decides what the display should be showing on its own.
// Checked every few seconds by wsServer._playlistTick, highest priority first:
//   1. Celebrations - New Year at midnight, plus your own dates (birthdays,
//      anniversaries): a firework finale with your text for 15 minutes,
//      then back to what was on before.
//   2. Match the weather - thunder brings Lightning Storm, rain brings Rain,
//      snow brings Ambient Weather, a clear night brings Starfield...
//   3. Day plan - the playlist cycles through a different set of effects in
//      the morning, during the day, in the evening and at night.
// This module is pure logic (time and weather in, decisions out) so it can
// be tested without a clock or a network; fetchWeatherCode does the fetching.
'use strict';
const { fetchWithTimeout } = require('./effects/net');

const PARTS = ['morning', 'day', 'evening', 'night'];
const DEFAULT_STARTS = { morning: 6, day: 10, evening: 18, night: 23 };
const CELEBRATION_MS = 15 * 60000;

// Which part of the day a time falls in, given each part's start hour.
function partAt(starts, date) {
  const s = { ...DEFAULT_STARTS, ...(starts || {}) };
  const h = date.getHours() + date.getMinutes() / 60;
  const order = PARTS.map((p) => [p, s[p]]).sort((a, b) => a[1] - b[1]);
  let cur = order[order.length - 1][0]; // before the first start: still the last part from yesterday
  for (const [p, start] of order) if (h >= start) cur = p;
  return cur;
}

// The celebration happening at `date`, if any: { key, text }. `key` is
// unique per occurrence so each one runs once.
function celebrationAt(cel, date) {
  if (!cel) return null;
  const list = [];
  if (cel.newYear) list.push({ month: 1, day: 1, hour: 0, minute: 0, text: 'HAPPY NEW YEAR ' + date.getFullYear() });
  for (const d of cel.dates || []) list.push(d);
  for (const d of list) {
    const start = new Date(date.getFullYear(), d.month - 1, d.day, d.hour || 0, d.minute || 0);
    const since = date - start;
    if (since >= 0 && since < CELEBRATION_MS) return { key: start.toISOString() + '|' + d.text, text: String(d.text || '').slice(0, 24), endsAt: start.getTime() + CELEBRATION_MS };
  }
  return null;
}

// WMO weather code (Open-Meteo) -> an effect that suits it.
function effectForWeather(code, night) {
  if (code >= 95) return 'lightning';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'ambient_weather';
  if (code === 45 || code === 48) return 'fluid_ink';
  if (code === 2 || code === 3) return night ? 'nebula' : 'tide';
  return night ? 'starfield' : 'ambient_weather';
}
const WEATHER_WORDS = (code) => (code >= 95 ? 'thunderstorm' : (code >= 51 && code <= 67) || (code >= 80 && code <= 82) ? 'rain' : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow' : code === 45 || code === 48 ? 'fog' : code === 2 || code === 3 ? 'cloudy' : 'clear');

// Current weather for a city: { code, isDay, place } (throws on failure).
const geoCache = new Map();
async function fetchWeatherCode(city) {
  let loc = geoCache.get(city);
  if (!loc) {
    const gr = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`);
    if (!gr.ok) throw new Error('geocoding-api.open-meteo.com: ' + gr.status);
    const gd = await gr.json();
    if (!gd.results || !gd.results.length) throw new Error(`City "${city}" not found`);
    loc = { lat: gd.results[0].latitude, lon: gd.results[0].longitude, place: gd.results[0].name };
    geoCache.set(city, loc);
  }
  const wr = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat.toFixed(3)}&longitude=${loc.lon.toFixed(3)}&current=weather_code,is_day&timezone=auto&forecast_days=1`);
  if (!wr.ok) throw new Error('api.open-meteo.com: ' + wr.status);
  const wd = await wr.json();
  return { code: Number(wd.current && wd.current.weather_code) || 0, isDay: !!(wd.current && wd.current.is_day), place: loc.place };
}

module.exports = { PARTS, DEFAULT_STARTS, partAt, celebrationAt, effectForWeather, WEATHER_WORDS, fetchWeatherCode, CELEBRATION_MS };
