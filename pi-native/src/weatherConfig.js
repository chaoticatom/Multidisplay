// Persists the Weather effect's last selected city across restarts, using the
// same load()/save()/validate pattern as unsplashConfig.js. Loaded into
// state.effectOptions.weather.city at startup (app.js) and saved whenever
// setEffectOption sets the weather city (wsServer.js).
// Data shape: { city: string }; '' means use weather.js's DEFAULT_CITY.
const fs = require('fs');
const { readSectionJson, writeSection } = require('./settingsStore'); // CONFIG_PATH is now only the pre-settings.json legacy file, imported once
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'weather-config.json');
const DEFAULT_CONFIG = { city: '' };

function isValidConfig(c) {
  return !!c && typeof c === 'object' && typeof c.city === 'string';
}

function load() {
  try {
    const raw = readSectionJson('weather', CONFIG_PATH);
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
  writeSection('weather', config);
}

module.exports = { load, save, isValidConfig, DEFAULT_CONFIG, CONFIG_PATH };
