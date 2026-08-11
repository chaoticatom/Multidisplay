// Entry point matching the effect registry's (core, dt) => void convention
// (see ../core.js's module comment / wave.js for the pattern). Owns the
// weather effect's persistent state (wxState) and periodic re-fetching -
// the browser version ties fetching to a UI button/interval timer outside
// the effect function itself; this folds an equivalent "fetch if stale"
// check directly into the tick, since there's no separate UI layer here
// yet to own that timer.
const effectWeather = require('./weather/weather');
const { createWxState } = require('./weather/state');
const { fetchWeather } = require('./weather/fetch');

const DEFAULT_CITY = process.env.WEATHER_CITY || 'London';
const WX_REFRESH_SEC = 15 * 60; // matches STANDALONE_WX_INTERVAL_MIN in the ESP32 firmware

let wxState = null;
// Separate from wxState.lastFetch (which fetchWeather only updates on
// SUCCESS) - gating retries on lastFetch alone meant a failed fetch left
// it stuck at -9999 forever, so "fetch if stale" was true on every single
// tick (30/sec) once the API started failing, hammering it instead of
// backing off. Confirmed live: with network access blocked in this sandbox,
// this fired a fetch (and a console.warn) on every tick. lastAttemptMs
// tracks the last attempt regardless of outcome.
let lastAttemptMs = 0;
let lastCity = null; // the city fetchWeather() was last called with - see weather() below

function maybeFetch(core, city) {
  const now = Date.now();
  if (now - lastAttemptMs < WX_REFRESH_SEC * 1000) return;
  lastAttemptMs = now;
  fetchWeather(wxState, city, core.SIZE).catch((err) => console.warn('[weather] fetch failed:', err.message));
}

function weather(core, dt) {
  if (!wxState) wxState = createWxState();
  const city = core.effectOptions?.weather?.city || DEFAULT_CITY;
  // A city change from the control page's search box should refetch right
  // away, not wait up to WX_REFRESH_SEC - same "force it now" idea as
  // clicking the browser panel's GO button.
  if (city !== lastCity) { lastCity = city; lastAttemptMs = 0; }
  // effectWeather() works fine with the default state (London-ish fallback
  // values from createWxState()) until a fetch actually succeeds -
  // fire-and-forget, never blocks the render tick.
  maybeFetch(core, city);
  effectWeather(core, dt, wxState, core.speedMult || 1);
}

// Polled by app.js each tick into state.effectStatus.weather, broadcast to
// clients in wsServer.js's "state" message - lets the control page's
// #wx-status/#wx-info panel show live fetch results, the same information
// the browser app reads directly off its own module-scope wx* globals.
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

module.exports = weather;
module.exports.getStatus = getStatus;
