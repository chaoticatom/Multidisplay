// Persisted "last selected city" for the Weather effect, mirroring
// unsplashConfig.js's exact load()/save()/validate-on-load-with-fallback
// pattern (survive a restart, JSON file on disk next to this one,
// gitignored).
//
// Real report: the weather effect always reverted to London on every
// restart instead of remembering whatever city was last picked.
// effects/weather.js's `core.effectOptions.weather.city` lives only in
// wsServer.js's in-memory `state` (never persisted, unlike alarms/
// customCube/panelConfig/unsplashConfig), so a restart always fell back to
// DEFAULT_CITY='London'. This gives the last-picked city somewhere to
// survive a restart - loaded into state.effectOptions.weather.city at
// startup (see app.js) and saved every time setEffectOption sets
// effect:'weather', key:'city' (see wsServer.js).
//
// Data shape: { city: string } - empty string means "nothing picked yet,
// use weather.js's own DEFAULT_CITY fallback".
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'weather-config.json');
const DEFAULT_CONFIG = { city: '' };

function isValidConfig(c) {
  return !!c && typeof c === 'object' && typeof c.city === 'string';
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) throw new Error('invalid stored weather config');
    return parsed;
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file, same spirit as
    // panelConfig.load()'s catch branch.
    return { ...DEFAULT_CONFIG };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = { load, save, isValidConfig, DEFAULT_CONFIG, CONFIG_PATH };
