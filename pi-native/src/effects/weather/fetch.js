// Ported from effects-livedata.js's wxFetch(). Same Open-Meteo geocoding +
// forecast APIs (no API key needed), adapted for Node: uses the global
// fetch() (Node 18+, no extra dependency) instead of the browser's, and
// takes a plain city-name string instead of reading a DOM input element -
// there's no city-search dropdown UI on this side (yet).
const { calcMoonRiseSet, wxInitScene, WX_CODES } = require('./state');

// wxState: object from createWxState(). size: core.SIZE, needed by
// wxInitScene to size the skyline buffer.
async function fetchWeather(wxState, city, size) {
  if (wxState.fetching) return false;
  wxState.fetching = true;
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
    let gr;
    try { gr = await fetch(geoUrl); }
    catch (fe) { throw new Error('Network error - check internet connection'); }
    if (!gr.ok) throw new Error('Geocoding failed: ' + gr.status);
    const gd = await gr.json();
    if (!gd.results?.length) throw new Error(`City "${city}" not found`);
    const loc = gd.results[0];
    wxState.lat = loc.latitude; wxState.lon = loc.longitude;
    wxState.cityDisplay = loc.country ? `${loc.name}, ${loc.country}` : loc.name;

    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${wxState.lat.toFixed(4)}&longitude=${wxState.lon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset,temperature_2m_max&timezone=auto&forecast_days=1`;
    let wr;
    try { wr = await fetch(wxUrl); }
    catch (fe) { throw new Error('Weather fetch failed - check internet connection'); }
    if (!wr.ok) throw new Error('Weather API error: ' + wr.status);
    const wd = await wr.json();
    wxState.code = wd.current?.weather_code || 0;
    wxState.temp = Math.round(wd.current?.temperature_2m || 20);
    wxState.tempMax = Math.round(wd.daily?.temperature_2m_max?.[0] || wxState.temp);
    wxState.tzOffset = wd.utc_offset_seconds || 0;
    const pt = (s) => { const p = (s || '').split('T')[1] || '00:00'; const [h, m] = (p.split(':')).map(Number); return h * 3600 + m * 60; };
    wxState.sunriseS = pt(wd.daily?.sunrise?.[0]) || 21600;
    wxState.sunsetS = pt(wd.daily?.sunset?.[0]) || 72000;
    wxState.desc = WX_CODES[wxState.code] || 'Unknown';

    const moonRS = calcMoonRiseSet(wxState.lat, wxState.lon, wxState.tzOffset);
    wxState.moonriseS = moonRS.rise;
    wxState.moonsetS = moonRS.set;
    wxInitScene(wxState.code, wxState, size);
    wxState.lastFetch = Date.now() / 1000;
    return true;
  } catch (e) {
    console.warn('[weather] fetch error:', e.message);
    return false;
  } finally {
    wxState.fetching = false;
  }
}

module.exports = { fetchWeather };
