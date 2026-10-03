// Scenes: a named snapshot of "what's on the display" - effect, that
// effect's options, overlays, brightness, speed and React-to-music - that
// can be recalled with one tap or fired by a timer. Stored in
// settings.json's 'scenes' section.
'use strict';
const { readSectionJson, writeSection } = require('./settingsStore');

const MAX_SCENES = 50;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function load() {
  try {
    const list = JSON.parse(readSectionJson('scenes'));
    return Array.isArray(list) ? list.filter(isValidScene) : [];
  } catch (e) {
    return [];
  }
}
function save(list) { writeSection('scenes', list); }

function isValidScene(s) {
  return s && typeof s.name === 'string' && s.name.trim() && s.name.length <= 40 && typeof s.effect === 'string';
}

// Captures the current display state as a scene.
function capture(state, name) {
  const effect = state.effect;
  return {
    name: String(name).trim().slice(0, 40),
    effect,
    options: clone((state.effectOptions || {})[effect]) || {},
    overlays: clone(state.overlays),
    brightness: state.brightness,
    speed: state.speed,
    musicReact: clone(state.musicReact),
  };
}

// Applies a scene to state (mutates it). Returns the fields it changed, in
// the shape the render worker reports back to the main thread.
function apply(state, scene) {
  state.effect = scene.effect;
  state.effectOptions = { ...(state.effectOptions || {}), [scene.effect]: clone(scene.options) || {} };
  if (scene.overlays) state.overlays = clone(scene.overlays);
  if (Number.isFinite(scene.brightness)) state.brightness = scene.brightness;
  if (Number.isFinite(scene.speed)) state.speed = scene.speed;
  if (scene.musicReact) state.musicReact = clone(scene.musicReact);
  state.blank = false;
  return changedFields(state);
}

// The display fields a scene or timer can change - reported from the render
// worker to the main thread so its copy of state doesn't snap them back.
function changedFields(state) {
  return {
    effect: state.effect, effectOptions: clone(state.effectOptions), overlays: clone(state.overlays),
    brightness: state.brightness, speed: state.speed, musicReact: clone(state.musicReact), blank: !!state.blank, panelsOff: !!state.panelsOff,
  };
}

module.exports = { load, save, capture, apply, changedFields, isValidScene, MAX_SCENES };
