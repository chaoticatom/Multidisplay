// One frame of effect computation - core.colBuf/core.wallBuf in, nothing
// else. Extracted out of app.js's setInterval body (which also does
// driver.renderFrame()/ws.maybeStreamFrame(), i.e. transport/hardware
// concerns this function deliberately excludes) so the exact same tick
// logic can run two places: the real Pi (app.js) and the browser-native
// simulator bundle (sim/entry.js -> public/sim-loopback.js), instead of the
// simulator hand-duplicating this and silently drifting out of sync with
// real behavior over time. Any future change to what a tick actually does
// belongs HERE, not copy-pasted into app.js and the simulator separately.
const { renderIdentify } = require('./effects/identify');
const radio = require('./effects/radio');
const { createFeatureState, updateFeatures, reactDt, pulseBuffer } = require('./effects/audioFeatures');
const musicFeatures = createFeatureState();
// Crossfade between effects: switching used to hard-cut, often to a blank
// first frame while the new effect warmed up. When state.effect changes,
// the last displayed frame is kept and blended out over CROSSFADE_SECS on
// top of the new effect's output. Only the effect itself is faded -
// overlays/alarms run after and are unaffected. A buffer size change (panel
// resize/mode switch) just cuts, since the old frame no longer lines up.
const CROSSFADE_SECS = 0.4;

function beginCrossfade(core, effect, buf) {
  if (!buf) return;
  if (core._xfEffect === undefined) { core._xfEffect = effect; return; } // first frame ever: nothing to fade from
  if (core._xfEffect === effect) return;
  core._xfEffect = effect;
  if (!core._xfFrom || core._xfFrom.length !== buf.length) core._xfFrom = new Float32Array(buf.length);
  core._xfFrom.set(buf);
  core._xfT = 0;
}

function applyCrossfade(core, buf, dt) {
  if (!buf || core._xfT === undefined || core._xfT >= CROSSFADE_SECS) return;
  const from = core._xfFrom;
  if (from.length !== buf.length) { core._xfT = CROSSFADE_SECS; return; }
  core._xfT += Math.max(0, dt);
  const a = Math.min(1, core._xfT / CROSSFADE_SECS); // weight of the NEW effect
  const k = a * a * (3 - 2 * a); // smoothstep - eases in and out
  for (let i = 0; i < buf.length; i++) buf[i] = from[i] + (buf[i] - from[i]) * k;
}

function tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt) {
  core.panelMode = config.mode;
  core.effectOptions = state.effectOptions;
  core.customCubeFaces = state.customCube && state.customCube.faces;
  core.overlaysState = state.overlays;

  // "Identify Panels" calibration mode - see identify.js's module comment.
  // Bypasses everything else (effect/alarms/overlays) entirely, same as the
  // state.blank branch below, since it's a wiring-diagnostic view, not
  // something that should ever be composited with real content.
  if (state.identifyPanels) {
    renderIdentify(core, config);
    return;
  }

  const activeFn = config.mode === 'wall' ? WALL_EFFECTS[state.effect] : EFFECTS[state.effect];
  if (typeof activeFn?.getStatus === 'function') {
    if (!state.effectStatus) state.effectStatus = {};
    state.effectStatus[state.effect] = activeFn.getStatus();
  }

  alarms.tickCheck(state, dt, EFFECTS);
  const cubeMode = config.mode !== 'wall';
  if (!state.blank) {
    if (cubeMode) alarms.renderMainMessage(core, state); // step 1

    const alarmBlocking = cubeMode && alarms.isBlockingNormalEffect(state);
    const fn = config.mode === 'wall' ? WALL_EFFECTS[state.effect] : EFFECTS[state.effect];
    const buf = cubeMode ? core.colBuf : core.wallBuf;
    // Music: keep a playing station alive in the background, and give
    // every effect the live features (core.audio). With "React to music"
    // on, effects also speed up with the bass and the frame breathes /
    // flashes with the level and beats (not applied to the radio's own
    // spectrum, which is already the music).
    if (state.effect !== 'radio' && typeof radio.keepAlive === 'function') radio.keepAlive();
    core.audio = updateFeatures(musicFeatures, radio.audio && radio.audio.spec, dt);
    const react = state.musicReact && state.musicReact.on && state.effect !== 'radio' ? Math.max(0, Math.min(1, Number(state.musicReact.amount) || 0.6)) : 0;
    beginCrossfade(core, state.effect, buf);
    if (fn && !alarmBlocking) fn(core, reactDt(core.audio, dt, react)); // step 2
    pulseBuffer(core.audio, buf, react);
    applyCrossfade(core, buf, dt);
  } else {
    core.colBuf.fill(0);
    if (core.wallBuf) core.wallBuf.fill(0);
  }

  if (config.mode !== 'wall') runOverlays(core, dt, state.overlays); // step 3

  if (cubeMode) {
    alarms.applyDonePhase(core, state); // step 4
    alarms.renderPrePhase(core, dt, state, EFFECTS); // step 5 - overwrites colBuf, matches browser order exactly
  }
}

module.exports = { tick, CROSSFADE_SECS };
