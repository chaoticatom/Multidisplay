// Remembers what the display is doing - effect, its options, overlays,
// brightness, speed, React to music, and the playing radio station - so
// it comes back the same after the app restarts (a panel layout change on
// real hardware, the Restart button, a crash or a reboot). Before this,
// all of that lived only in memory: a real report found the spectrum
// analyser 'stopped' after a layout-change restart, because the radio
// station and the spectrum settings had silently reset to defaults.
// Stored in settings.json's 'session' section.
'use strict';
const { readSectionJson, writeSection } = require('./settingsStore');

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function load() {
  try { const s = JSON.parse(readSectionJson('session')); return s && typeof s === 'object' ? s : null; } catch (e) { return null; }
}

// radioStatus: the radio's getStatus() ({ playing, station }), if known.
function snapshot(state, radioStatus) {
  return {
    effect: state.effect,
    effectOptions: clone(state.effectOptions),
    overlays: clone(state.overlays),
    brightness: state.brightness,
    speed: state.speed,
    musicReact: clone(state.musicReact),
    radio: radioStatus && radioStatus.playing && radioStatus.station && radioStatus.station.url && !/^debug/.test(radioStatus.station.url)
      ? { station: clone(radioStatus.station) } : null,
  };
}

function save(state, radioStatus) {
  try { writeSection('session', snapshot(state, radioStatus)); } catch (e) { console.warn('[session] save failed:', e.message); }
}

// Merges a saved session into a freshly-built state (mutates it). Returns
// the station to resume, if one was playing. `effects` validates the
// saved effect key still exists.
function restore(state, effects) {
  const s = load();
  if (!s) return null;
  if (typeof s.effect === 'string' && effects[s.effect]) state.effect = s.effect;
  if (s.effectOptions && typeof s.effectOptions === 'object') {
    state.effectOptions = { ...(state.effectOptions || {}), ...s.effectOptions };
  }
  if (s.overlays && typeof s.overlays === 'object' && state.overlays) {
    for (const k of Object.keys(state.overlays)) if (s.overlays[k]) Object.assign(state.overlays[k], s.overlays[k]);
  }
  if (Number.isFinite(s.brightness)) state.brightness = s.brightness;
  if (Number.isFinite(s.speed)) state.speed = s.speed;
  if (s.musicReact && typeof s.musicReact === 'object') state.musicReact = { ...state.musicReact, ...s.musicReact };
  return s.radio && s.radio.station ? s.radio.station : null;
}

module.exports = { load, save, snapshot, restore };
