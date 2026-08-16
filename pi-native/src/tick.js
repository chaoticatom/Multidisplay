// One frame of effect computation - core.colBuf/core.wallBuf in, nothing
// else. Extracted out of app.js's setInterval body (which also does
// driver.renderFrame()/ws.maybeStreamFrame(), i.e. transport/hardware
// concerns this function deliberately excludes) so the exact same tick
// logic can run two places: the real Pi (app.js) and the browser-native
// simulator bundle (sim/entry.js -> public/sim-loopback.js), instead of the
// simulator hand-duplicating this and silently drifting out of sync with
// real behavior over time. Any future change to what a tick actually does
// belongs HERE, not copy-pasted into app.js and the simulator separately.
function tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt) {
  core.panelMode = config.mode;
  core.effectOptions = state.effectOptions;
  core.customCubeFaces = state.customCube && state.customCube.faces;
  core.overlaysState = state.overlays;

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
    if (fn && !alarmBlocking) fn(core, dt); // step 2
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

module.exports = { tick };
