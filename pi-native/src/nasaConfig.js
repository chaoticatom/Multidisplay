// Persisted NASA API key, mirroring unsplashConfig.js's exact
// load()/save()/validate-on-load-with-fallback pattern (survive a
// restart, JSON file on disk next to this one, gitignored).
//
// Shared by every effect that calls api.nasa.gov (apod.js/apodWall.js,
// epic.js/epicWall.js reuse epic.js's fetch, neo.js/neoWall.js reuse
// neo.js's fetch) - they all previously only read process.env.NASA_API_KEY
// (falling back to the heavily-rate-limited 'DEMO_KEY'), with no way to
// set a real key without SSH access to the Pi to set an env var and
// restart. A real request: "enable the NASA apod API field. I have the
// api to enter" - same "user must supply a key via a UI text field,
// persisted server-side" shape unsplashConfig.js already established.
//
// Data shape: { apiKey: string } - empty string means "nothing entered
// yet, fall back to process.env.NASA_API_KEY || 'DEMO_KEY'" (each
// effect's own existing fallback, unchanged).
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'nasa-config.json');
const DEFAULT_CONFIG = { apiKey: '' };

function isValidConfig(c) {
  return !!c && typeof c === 'object' && typeof c.apiKey === 'string';
}

function load() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) throw new Error('invalid stored nasa config');
    return parsed;
  } catch (err) {
    return { ...DEFAULT_CONFIG };
  }
}

function save(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// The actual key any NASA-API effect should use: a saved key (via the UI)
// takes priority over the env var, which takes priority over DEMO_KEY.
function currentKey() {
  const saved = load().apiKey.trim();
  if (saved) return saved;
  return process.env.NASA_API_KEY || 'DEMO_KEY';
}

module.exports = { load, save, isValidConfig, currentKey, DEFAULT_CONFIG, CONFIG_PATH };
