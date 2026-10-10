// Render-loop worker thread (RENDER_WORKER=1). Runs tick() and
// driver.renderFrame() off the main thread so they don't compete with the
// WS/HTTP server. Only this thread owns the hardware driver; app.js must not
// create a second one (they would fight over GPIO/DMA).
//
// Message protocol (see app.js for the other side):
//   main -> worker: {type:'config', config} - panel size/mode/panels changed
//                   {type:'tick', state, dt} - a cloned state snapshot
//                   (functions such as onAlarmsChanged are stripped)
//   worker -> main: {type:'frame', colBuf, wallBuf, activeAlarm, alarms,
//                   blank, effectStatus} - this thread owns whatever tick()
//                   mutates; app.js owns whatever WS commands mutate.
//   main -> worker: {type:'effectCommand', cmd, payload} - effect modules
//                   are per-thread singletons, so direct calls must be
//                   relayed here (see wsServer.js effectCommandRelay).
//                   Commands: radioPlay {station}, radioStop {},
//                   radioDebugTone {kind, freq}, radioSearch {query},
//                   videoStop {}, videoFrame {payload, w, h, kind}.
'use strict';

const { parentPort, workerData } = require('worker_threads');
const { CubeCore } = require('./core');
const prefs = require('./prefs');
const { EFFECTS, WALL_EFFECTS } = require('./effects');
const { runOverlays } = require('./effects/overlays');
const alarms = require('./effects/alarms');
let workerVersion = null;
const { tick } = require('./tick');
const { loadDriver } = require('./loadDriver');
const radio = require('./effects/radio');
const remoteAudio = radio.useRemoteAudio(); // real decode/FFT runs on the main thread - see ffmpegAudio.js's RemoteAudio
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

let workerState = null;
const shared = { col: null, wall: null };
// Copies `src` into this slot's shared view (reallocating on size change);
// returns { view, fresh } where fresh means app.js hasn't seen this view yet.
function sharedView(slot, src) {
  let fresh = false;
  if (!shared[slot] || shared[slot].length !== src.length) {
    shared[slot] = new Float32Array(new SharedArrayBuffer(src.length * 4));
    fresh = true;
  }
  shared[slot].set(src);
  return { view: shared[slot], fresh };
}
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
    // Mirrors wsServer.js's direct-call handlers, but on this thread's copy of
    // the singletons. Posting 'stateChanged' when a command finishes lets
    // app.js broadcast state then, as the non-worker path does at the end of
    // each command handler (frame replies alone never trigger a broadcast).
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
    } else if (cmd === 'drawOps') {
      EFFECTS.draw.applyOps(payload);
    } else if (cmd === 'videoFrame') {
      browserFrameSource.setFrame(payload.payload, payload.w, payload.h, payload.kind);
    }
    return;
  }
  if (msg.type === 'tick') {
    // app.js only sends state when it changed (see its sendTick()); keep
    // the last copy, including anything tick() mutates on it (alarms etc.)
    if (msg.state) {
      // The main thread re-sends its state every second. Its copy lags the
      // timer progress made here, so carry that over: the 2 s check clock,
      // which timers already fired this minute, and a running sunrise /
      // wind-down - unless the user cancelled it (alarmCancel changes).
      // Without this, timers never fired on the Pi (a real report).
      const prev = workerState;
      workerState = msg.state; workerVersion = msg.version;
      if (prev) {
        workerState._alarmT = prev._alarmT;
        const fired = new Map((prev.alarms || []).map((a) => [a.id, a._lastFireKey]));
        for (const a of workerState.alarms || []) if (!a._lastFireKey && fired.get(a.id)) a._lastFireKey = fired.get(a.id);
        if (!workerState.activeAlarm && prev.activeAlarm && workerState.alarmCancel === prev.alarmCancel) workerState.activeAlarm = prev.activeAlarm;
      }
    }
    const state = workerState;
    if (!state) return;
    const { dt, radioAudio } = msg;
    remoteAudio.applySnapshot(radioAudio);
    core.speedMult = state.speed;
    const frameStart = performance.now();
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
    // Display off: a dim red power LED in the corner instead of darkness (see powerLed.js).
    if (state.panelsOff || state.blank) require('./powerLed').renderPowerLed(driver, core);
    else driver.renderFrame(core, state.brightness * prefs.nightFactor(state.prefs));
    const renderMs = performance.now() - frameStart; // tick + panel push, for Diagnostics
    // Frames go back through SharedArrayBuffers instead of a fresh
    // .slice() copy per frame (which also had to be structured-cloned):
    // no per-frame allocation or garbage. A shared buffer is (re)created
    // and sent along only when its size changes; the ping-pong protocol
    // (app.js reads it before sending the next tick) means the two
    // threads never touch it at the same time.
    const col = sharedView('col', core.colBuf);
    const wall = core.wallBuf ? sharedView('wall', core.wallBuf) : null;
    parentPort.postMessage({
      type: 'frame',
      colShared: col.fresh ? col.view : undefined,
      wallShared: wall && wall.fresh ? wall.view : undefined,
      renderMs,
      colLen: core.colBuf.length,
      wallLen: core.wallBuf ? core.wallBuf.length : 0,
      activeAlarm: state.activeAlarm,
      alarms: state.alarms,
      version: workerVersion, // which main-thread state this frame was computed from
      blank: state.blank,
      brightness: state.brightness, // a sunrise/wind-down changes it here; the preview follows (see app.js)
      effectStatus: state.effectStatus,
      sfx: core.sfx && core.sfx.length ? core.sfx.splice(0) : undefined, // sound effects to play (see src/sfx.js)
      radioAudio: remoteAudio.request(),
      applied: state.appliedChanges, // set when a timer fired (see alarms.js alarmFire)
    });
    delete state.appliedChanges;
  }
});
