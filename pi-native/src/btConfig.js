// Persisted "last used Bluetooth speaker" MAC, mirroring panelConfig.js's/
// weatherConfig.js's exact load()/save()/fallback-on-corrupt pattern (see
// panelConfig.js's module comment for why: survive a restart, JSON file on
// disk next to this one, gitignored).
//
// A real request: "auto try to connect to the previous paired device, even
// after a reboot" - bluetooth.js's autoReconnectLastSpeaker() reads this on
// startup (see src/app.js) to reconnect + re-select as audio output
// without any manual re-pairing after a Pi reboot.
const fs = require('fs');
const { readSectionJson, writeSection } = require('./settingsStore'); // CONFIG_PATH is now only the pre-settings.json legacy file, imported once
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'bt-config.json');

function isValidMac(mac) {
  return typeof mac === 'string' && /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){5}$/.test(mac);
}

function load() {
  try {
    const raw = readSectionJson('bluetooth', CONFIG_PATH);
    const parsed = JSON.parse(raw);
    return { lastSpeakerMac: isValidMac(parsed.lastSpeakerMac) ? parsed.lastSpeakerMac : null, range: parsed.range === 'long' ? 'long' : 'normal' };
  } catch (err) {
    // Missing file (first run) or corrupt content - fall back to defaults
    // rather than crashing the app over a config file.
    return { lastSpeakerMac: null, range: 'normal' };
  }
}

// Merges, so saving the speaker doesn't drop the range setting and vice versa.
function save(config) {
  writeSection('bluetooth', { ...load(), ...config });
}

module.exports = { load, save, isValidMac, CONFIG_PATH };
