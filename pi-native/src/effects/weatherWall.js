// Wall-mode entry point, mirroring weather.js's structure exactly (own
// wxState, own fetch-scheduling/backoff, own getStatus()) but rendering
// via effects/weather/weatherWall.js against core.wallW/wallH instead of
// core.SIZE/faceMap. Kept as a SEPARATE wxState/lastAttemptMs/lastCity
// from weather.js's module-scope copies - same "own state, don't collide
// across registries" reasoning as camWall.js's module comment.
const effectWeatherWall = require('./weather/weatherWall');
const { createWxState } = require('./weather/state');
const { fetchWeather } = require('./weather/fetch');

const DEFAULT_CITY = process.env.WEATHER_CITY || 'London';
const WX_REFRESH_SEC = 15 * 60;

let wxState = null;
let lastAttemptMs = 0;
let lastCity = null;

function maybeFetch(core, city) {
  const now = Date.now();
  if (now - lastAttemptMs < WX_REFRESH_SEC * 1000) return;
  lastAttemptMs = now;
  // fetchWeather's third arg only feeds wxInitScene's `size` (cube panel
  // side length) inside fetch.js - not applicable here since a successful
  // fetch re-inits scene state via wxInitScene(cube-shaped), which this
  // wall entry point immediately overrides on the next render tick anyway
  // (effectWeatherWall re-inits with wxInitSceneWall whenever
  // wxState.skyline is falsy - see that file). Passing core.wallW keeps
  // fetch.js's own wxInitScene call harmless-sized rather than undefined.
  fetchWeather(wxState, city, core.wallW || 64).then((ok) => {
    if (ok) wxState.skyline = null; // force effectWeatherWall to rebuild the wall-shaped scene next tick
  }).catch((err) => console.warn('[weatherWall] fetch failed:', err.message));
}

function weatherWall(core, dt) {
  if (!core.wallW) return; // core.initWall() hasn't run yet
  if (!wxState) wxState = createWxState();
  const city = core.effectOptions?.weather?.city || DEFAULT_CITY;
  if (city !== lastCity) { lastCity = city; lastAttemptMs = 0; }
  maybeFetch(core, city);
  effectWeatherWall(core, dt, wxState, core.speedMult || 1);
}

function getStatus() {
  if (!wxState) return null;
  return {
    city: wxState.cityDisplay || null,
    temp: Number.isFinite(wxState.temp) ? wxState.temp : null,
    desc: wxState.desc || null,
    sunriseS: wxState.sunriseS, sunsetS: wxState.sunsetS,
    fetching: !!wxState.fetching,
    error: wxState.error || null,
  };
}

module.exports = weatherWall;
module.exports.getStatus = getStatus;
