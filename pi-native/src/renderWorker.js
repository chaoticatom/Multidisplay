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
//
//   main -> worker: {type:'effectCommand', cmd, payload} - a real report:
//                    enabling this worker silently broke radio (and would
//                    have broken video stop / the browser-pushed webcam/
//                    screen-share source too) - wsServer.js calls several
//                    effect modules DIRECTLY rather than only through
//                    state/config (radio.js's playStation/stopStation/
//                    search, video.js's/videoWall.js's stop(),
//                    browserFrameSource's setFrame()/clear()), and each of
//                    those modules is its OWN singleton with its OWN
//                    require() cache entry PER THREAD - the copy
//                    wsServer.js (main thread) would call directly is a
//                    different object instance from the one this worker's
//                    tick() actually renders from, so the mutation would
//                    never reach where it mattered. See wsServer.js's
//                    effectCommandRelay constructor comment for the other
//                    side of this. Commands: radioPlay {station},
//                    radioStop {}, radioDebugTone {kind, freq}, radioSearch
//                    {query}, videoStop {}, videoFrame {payload, w, h, kind}.
'use strict';

const { parentPort, workerData } = require('worker_threads');
const { CubeCore } = require('./core');
const { EFFECTS, WALL_EFFECTS } = require('./effects');
const { runOverlays } = require('./effects/overlays');
const alarms = require('./effects/alarms');
const { tick } = require('./tick');
const { loadDriver } = require('./loadDriver');
const radio = require('./effects/radio');
const { browserFrameSource } = require('./effects/video/browserFrameSource');

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
  if (msg.type === 'effectCommand') {
    const { cmd, payload } = msg;
    // Mirrors wsServer.js's own direct-call handlers exactly (see its
    // effectCommandRelay constructor comment) - the only difference is
    // WHICH thread's copy of these singletons gets mutated: this one, the
    // same instance tick() below actually renders from.
    //
    // A real report ("station name never updates in the UI after
    // picking one"): nothing here told the main thread WHEN a command
    // actually finished being applied - the periodic 'frame' reply (see
    // below) keeps state.effectStatus fresh on the main thread, but
    // nothing ever BROADCASTS a "state" message to connected clients from
    // that alone (same as the non-worker path: every _broadcast() call in
    // wsServer.js happens at the end of a command handler, never on a
    // periodic timer - see e.g. its radioSearch handler's own `.then(() =>
    // {...; this._broadcast(...)})`). Posting 'stateChanged' back lets
    // app.js do the same thing at the same moment, just relayed through
    // the worker boundary instead of being the same synchronous call.
    if (cmd === 'radioPlay') { radio.playStation(payload.station); parentPort.postMessage({ type: 'stateChanged' }); }
    else if (cmd === 'radioStop') { radio.stopStation(); parentPort.postMessage({ type: 'stateChanged' }); }
    else if (cmd === 'radioDebugTone') { radio.playDebugTone(payload.kind, payload.freq); parentPort.postMessage({ type: 'stateChanged' }); }
    else if (cmd === 'radioSearch') {
      radio.search(payload.query)
        .then(() => parentPort.postMessage({ type: 'stateChanged' }))
        .catch((err) => console.warn('[renderWorker/radio] search failed:', err.message));
    } else if (cmd === 'videoStop') {
      if (typeof EFFECTS.video?.stop === 'function') EFFECTS.video.stop();
      if (typeof WALL_EFFECTS.video?.stop === 'function') WALL_EFFECTS.video.stop();
      browserFrameSource.clear();
    } else if (cmd === 'videoFrame') {
      browserFrameSource.setFrame(payload.payload, payload.w, payload.h, payload.kind);
    }
    return;
  }
  if (msg.type === 'tick') {
    const { state, dt } = msg;
    core.speedMult = state.speed;
    tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt);
    // A real report ("nothing on physical/website display when I play
    // internet radio") led here - radio keeps playing/searching regardless
    // of which effect is currently SELECTED (see wsServer.js's own
    // _refreshRadioStatus() comment for why: tick()'s generic "call the
    // active effect's getStatus()" only fires when radio itself is
    // selected). Computed unconditionally every tick here, taking over
    // what _refreshRadioStatus() used to do synchronously right after each
    // command on the main thread - that thread's own EFFECTS.radio is now
    // a dead copy under RENDER_WORKER=1 (see this worker's module comment).
    if (!state.effectStatus) state.effectStatus = {};
    state.effectStatus.radio = radio.getStatus();
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
