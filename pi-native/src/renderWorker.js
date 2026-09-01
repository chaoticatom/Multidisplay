// Opt-in (RENDER_WORKER=1) render-loop worker thread - a real request:
// "can you use multiple cores for this?" (the CPU contention behind
// choppy radio spectrum bars, per the FFT-throttle fix's own comment -
// this app's own render loop was already using ~85% of one CPU core as a
// baseline before radio audio was even involved).
//
// Moves the CPU-heavy part - tick() (effect/overlay/alarm computation into
// colBuf/wallBuf) and driver.renderFrame() (the actual native
// rpi-led-matrix GPIO/DMA push) - onto a separate OS thread from
// src/app.js's own WS/HTTP server and all its command handling, so they
// stop competing for the same thread's time slices. Only this file ever
// touches the real hardware driver when RENDER_WORKER=1 - app.js does NOT
// also construct one, since two driver instances would fight over the
// same GPIO/DMA resources.
//
// Message protocol (see app.js's worker wiring for the other side):
//   main -> worker: {type:'config', config}  - panel size/mode/panels changed
//                    {type:'tick', state, dt} - one frame's worth of state
//                    (state is a plain serializable snapshot - NOT the same
//                    object identity as app.js's own `state`, since
//                    structured-clone across the thread boundary always
//                    copies; app.js's onAlarmsChanged function reference is
//                    stripped before sending, since functions can't clone)
//   worker -> main: {type:'frame', colBuf, wallBuf, activeAlarm, alarms,
//                    blank, effectStatus} - alarms/activeAlarm/blank/
//                    effectStatus are round-tripped back because tick()
//                    itself can mutate them (alarms.tickCheck() firing an
//                    alarm, e.g.) - this worker, not app.js, is the thread
//                    actually running tick(), so it's the source of truth
//                    for anything tick() mutates; app.js remains the
//                    source of truth for anything a WS command mutates
//                    (effect/brightness/overlays/customCube/...), relayed
//                    to this worker via the next 'tick' message's `state`.
'use strict';

const { parentPort, workerData } = require('worker_threads');
const { CubeCore } = require('./core');
const { EFFECTS, WALL_EFFECTS } = require('./effects');
const { runOverlays } = require('./effects/overlays');
const alarms = require('./effects/alarms');
const { tick } = require('./tick');
const { loadDriver } = require('./loadDriver');

let config = workerData.config;
const core = new CubeCore(config.size);
if (config.mode === 'wall') core.initWall(config.panels, config.size);
const driver = loadDriver(config);
const driverKind = process.env.DRIVER || 'mock';

// Same boot-screen purpose as app.js's own renderBootScreen() (real panels
// should never sit dark, however long anything else takes) - duplicated
// rather than shared, since it's 15 lines and pulling app.js's version in
// would mean requiring app.js itself (which immediately runs main() at
// module scope) into this worker, which is not what we want.
const BOOT_COLOR = [0.35, 0.18, 0.0];
for (let i = 0; i < core.colBuf.length; i += 3) {
  core.colBuf[i] = BOOT_COLOR[0]; core.colBuf[i + 1] = BOOT_COLOR[1]; core.colBuf[i + 2] = BOOT_COLOR[2];
}
if (core.wallBuf) {
  for (let i = 0; i < core.wallBuf.length; i += 3) {
    core.wallBuf[i] = BOOT_COLOR[0]; core.wallBuf[i + 1] = BOOT_COLOR[1]; core.wallBuf[i + 2] = BOOT_COLOR[2];
  }
}
driver.renderFrame(core, 1.0);

parentPort.on('message', (msg) => {
  if (msg.type === 'config') {
    const newConfig = msg.config;
    core.resize(newConfig.size);
    if (newConfig.mode === 'wall') core.initWall(newConfig.panels, newConfig.size);
    if (driverKind === 'hardware') {
      console.warn('[renderWorker] panel mode changed to', newConfig.mode, '- restart the process to apply this to the physical panel driver (rgbMatrixDriver.js\'s panel topology is fixed at startup)');
    }
    config = newConfig;
    return;
  }
  if (msg.type === 'tick') {
    const { state, dt } = msg;
    core.speedMult = state.speed;
    tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt);
    driver.renderFrame(core, state.brightness);
    parentPort.postMessage({
      type: 'frame',
      // .slice() copies (not transfers) - state/core stay valid here for
      // the next tick; the small fixed copy cost (a few hundred KB at
      // most) is negligible next to what moving this whole computation
      // off the main thread saves it.
      colBuf: core.colBuf.slice(),
      wallBuf: core.wallBuf ? core.wallBuf.slice() : null,
      activeAlarm: state.activeAlarm,
      alarms: state.alarms,
      blank: state.blank,
      effectStatus: state.effectStatus,
    });
  }
});
