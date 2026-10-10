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
const { renderNotice } = require('./effects/notice');
const { applyPostFx, restorePostFx } = require('./effects/postfx');
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

// Style and length come from Setup > Display > Transition (prefs.transition);
// the default is a 0.4 s fade. See effects/transition.js for the styles.
const { applyTransition } = require('./effects/transition');
function applyCrossfade(core, buf, dt, tr) {
  const style = (tr && tr.style) || 'fade', secs = tr && Number.isFinite(tr.secs) ? tr.secs : CROSSFADE_SECS;
  if (!buf || core._xfT === undefined || core._xfT >= secs) return;
  const from = core._xfFrom;
  if (style === 'none' || from.length !== buf.length) { core._xfT = Infinity; return; }
  core._xfT += Math.max(0, dt);
  applyTransition(style, core, buf, from, Math.min(1, core._xfT / secs)); // k = progress of the NEW effect
}

function tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt) {
  restorePostFx(); // undo last frame's display-only finishing pass before drawing on it
  core.panelMode = config.mode;
  core.effectOptions = state.effectOptions;
  core.faceTalk = state.faceTalk; // what the Talking Face is saying (src/faceTalk.js)
  core.tz = state.prefs && state.prefs.tz; // the user's time zone, for effects that show a time (see localTime.js)
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

  const cubeMode = config.mode !== 'wall';
  alarms.tickCheck(state, dt, cubeMode ? EFFECTS : WALL_EFFECTS);
  // Keep a playing station alive in every mode - and while the display is
  // off (Clear All), so the screen can be dark with the music still on.
  if (typeof radio.keepAlive === 'function') radio.keepAlive(state.effectOptions && state.effectOptions.radio);
  if (!state.blank) {
    if (cubeMode) alarms.renderMainMessage(core, state); // step 1

    // On a wall only the sunrise / wind-down blocks the effect; at the alarm
    // itself the new effect runs with the message drawn on top (below).
    const alarmBlocking = cubeMode ? alarms.isBlockingNormalEffect(state) : !!(state.activeAlarm && !state.activeAlarm.dismissed && state.activeAlarm.phase === 'pre');
    const fn = config.mode === 'wall' ? WALL_EFFECTS[state.effect] : EFFECTS[state.effect];
    const buf = cubeMode ? core.colBuf : core.wallBuf;
    // Music: keep a playing station alive in the background, and give
    // every effect the live features (core.audio). With "React to music"
    // on, effects also speed up with the bass and the frame breathes /
    // flashes with the level and beats (not applied to the radio's own
    // spectrum, which is already the music).
    // Every frame, in every mode - including when Internet Radio itself is
    // showing: its WALL version only draws and never started the stream, so
    // in wall mode the Pi played nothing (a real report: radio + spectrum
    // worked on one 2D panel, then went flat once in wall mode).
    core.audio = updateFeatures(musicFeatures, radio.audio && radio.audio.spec, dt);
    // An effect's own setting (perEffect, from its options sheet) wins over the global one; 0 turns it off.
    const mr = state.musicReact, own = mr && mr.perEffect ? mr.perEffect[state.effect] : undefined;
    const react = state.effect === 'radio' || !mr ? 0 : own !== undefined && own !== null ? Math.max(0, Math.min(1, Number(own) || 0)) : mr.on ? Math.max(0, Math.min(1, Number(mr.amount) || 0.6)) : 0;
    beginCrossfade(core, state.effect, buf);
    if (fn && !alarmBlocking) fn(core, reactDt(core.audio, dt, react)); // step 2
    pulseBuffer(core.audio, buf, react);
    applyCrossfade(core, buf, dt, state.prefs && state.prefs.transition);
  } else {
    core.colBuf.fill(0);
    if (core.wallBuf) core.wallBuf.fill(0);
  }

  if (config.mode !== 'wall') runOverlays(core, dt, state.overlays); // step 3
  if (!state.blank) applyPostFx(core, config.mode, state.prefs && state.prefs.look); // bloom/vibrance/smoothing - see postfx.js

  if (cubeMode) {
    alarms.applyDonePhase(core, state); // step 4
    alarms.renderPrePhase(core, dt, state, EFFECTS); // step 5 - overwrites colBuf, matches browser order exactly
  } else {
    // Flat panel / wall: same timer phases, drawn on the wall canvas.
    if (!state.blank) alarms.renderMainMessage(core, state, true);
    alarms.applyDonePhase(core, state, true);
    alarms.renderPrePhase(core, dt, state, WALL_EFFECTS, true);
  }
  renderNotice(core, state, config.mode, dt); // a /api/notify banner sits on top of everything
}

module.exports = { tick, CROSSFADE_SECS };
