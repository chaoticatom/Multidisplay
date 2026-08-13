// Persisted Unsplash settings, mirroring alarmConfig.js's/panelConfig.js's
// exact load()/save()/validate-on-load-with-fallback pattern (survive a
// restart, JSON file on disk next to this one, gitignored).
//
// Ported from the browser's unsplashApiKey()/unsplashQuery, which lived in
// per-browser localStorage (see effects-livedata.js's Unsplash section).
// There's no browser/localStorage on the Pi side and the key is meant to be
// shared by whoever controls the cube (not per-visitor), so this is a
// single server-side JSON file instead - same "user must supply a key via a
// UI text field, persisted server-side" shape as the task brief asked for.
//
// Data shape: { apiKey: string, query: string }
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'unsplash-config.json');
const DEFAULT_CONFIG = { apiKey: '', query: 'nature' };

function isValidConfig(c) {
  return !!c && typeof c === 'object' && typeof c.apiKey === 'string' && typeof c.query === 'string';
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) throw new Error('invalid stored unsplash config');
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
