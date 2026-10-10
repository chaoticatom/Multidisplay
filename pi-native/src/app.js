// Entry point. Computes the current effect into a CubeCore, pushes it to
// the LED driver every tick, and runs the local control/preview WS server.
//
// Driver selection: DRIVER=hardware uses rgbMatrixDriver.js (real panels,
// Pi-only - see that file). Defaults to DRIVER=mock (safe everywhere,
// including this dev sandbox with no ARM hardware) so a bare `npm start`
// never accidentally tries to touch GPIO on a machine that isn't a Pi.
const { CubeCore } = require('./core');
const { EFFECTS, WALL_EFFECTS } = require('./effects');
const { OV_DEFAULTS, runOverlays } = require('./effects/overlays');
const alarms = require('./effects/alarms');
const sfx = require('./sfx');
// Plays the sound effects effects asked for, when Sound effects is on (Retro panel).
function playSfx(state, names) { const o = state.prefs && state.prefs.sfx; if (!o || !o.on || !names) return; for (const n of names.slice(0, 4)) sfx.play(n, o.volume); }
const radio = require('./effects/radio');
const { createDiagnostics } = require('./diagnostics');
const scenes = require('./scenes');
const prefs = require('./prefs');
const sessionState = require('./sessionState');
const { applyRemoteRequest } = require('./effects/radio/ffmpegAudio');
const { tick } = require('./tick');
const WsServer = require('./wsServer');
const panelConfig = require('./panelConfig');
const wifiSetup = require('./wifiSetup');
const bluetooth = require('./bluetooth');
const alarmConfig = require('./alarmConfig');
const customCubeConfig = require('./customCubeConfig');
const wallLayoutConfig = require('./wallLayoutConfig');
const unsplashConfig = require('./unsplashConfig');
const weatherConfig = require('./weatherConfig');
const nasaConfig = require('./nasaConfig');
const { Worker } = require('worker_threads');
const path = require('path');

// 60 per "increase the fps of the bars". A first attempt at 60 made bar
// movement SLOWER on real hardware ("bar movement has slowed down now"):
// the radio decode/FFT shared the render worker's thread, and a render
// loop running back-to-back starved it. That pipeline now runs on the
// main thread (see ffmpegAudio.js's RemoteAudio), so 60 is back. If bars
// ever regress again, drop this to 30 first to rule the rate out.
const TICK_HZ = 60;
// Without RENDER_WORKER=1 the radio decode still shares the render loop's
// only thread - exactly the starvation above - so that path stays at 30.
const SINGLE_THREAD_TICK_HZ = 30; // effect-compute + panel-push rate; independent of the driver's own PWM refresh
const WS_PORT = 8081;

// Solid amber fill, distinct from any real effect's likely palette - a
// common embedded "still booting" convention (matches the spirit of the
// ESP32 firmware's boot-time WiFi status icon: something is shown
// immediately, not left dark, while the rest of the system comes up - see
// main.cpp's "Start the display task RIGHT AWAY, before any networking"
// comment). Rendered synchronously, directly to the driver, before the WS
// server or the animation loop exist - so real panels never sit dark
// during startup, however long driver construction or future async init
// steps end up taking. The first real animation-loop tick (a JS event-loop
// turn away, effectively instant today) naturally supersedes it - nothing
// needs to explicitly "turn it off".
const BOOT_COLOR = [0.35, 0.18, 0.0];
// A timer can choose where its radio plays (a speaker, or the Pi's own
// output): switch to it once when the timer starts. Runs here, on the main
// thread, which owns the real playback.
let timerOutputKey = null;
function routeTimerAudio(a) {
  const out = a && !a.dismissed && a.al && a.al.radio && a.al.radio.action === 'start' && a.al.radio.output;
  if (!out) return;
  const now = new Date(), key = a.al.id + '|' + now.toDateString() + '|' + now.getHours();
  if (timerOutputKey === key) return;
  timerOutputKey = key;
  console.log('[timer] sound output -> ' + out);
  bluetooth.useOutput(out)
    .then((r) => console.log('[timer] sound output ' + (r.set ? 'set' : 'NOT set: ' + r.log)))
    .catch((err) => console.warn('[timer] sound output failed:', err.message));
}

function renderBootScreen(core, driver) {
  for (let i = 0; i < core.colBuf.length; i += 3) {
    core.colBuf[i] = BOOT_COLOR[0];
    core.colBuf[i + 1] = BOOT_COLOR[1];
    core.colBuf[i + 2] = BOOT_COLOR[2];
  }
  // Wall mode's driver reads core.wallBuf, not colBuf (see rgbMatrixDriver.js's
  // _renderWallFrame) - filling only colBuf here would leave wall panels dark
  // through the whole boot/WiFi-provisioning wait, defeating the entire point
  // of this function. Only relevant once initWall() has run (main() below
  // calls it before renderBootScreen() when config.mode is 'wall').
  if (core.wallBuf) {
    for (let i = 0; i < core.wallBuf.length; i += 3) {
      core.wallBuf[i] = BOOT_COLOR[0];
      core.wallBuf[i + 1] = BOOT_COLOR[1];
      core.wallBuf[i + 2] = BOOT_COLOR[2];
    }
  }
  driver.renderFrame(core, 1.0);
}

const { loadDriver } = require('./loadDriver');

async function main() {
  const diag = createDiagnostics(); // first, so it captures startup warnings too
  const config = panelConfig.load();
  const panelCount = config.mode === 'wall' ? config.panels.length : (config.mode === '2d' ? 1 : 6);
  console.log(`[app] panel config: size=${config.size} mode=${config.mode} (${panelCount} panel(s))`);
  const core = new CubeCore(config.size);
  if (config.mode === 'wall') core.initWall(config.panels, config.size);
  const driverKind = process.env.DRIVER || 'mock';
  // Opt-in (RENDER_WORKER=1) - a real request: "can you use multiple cores
  // for this?", after measuring this app's own render loop already using
  // ~85% of one CPU core as a baseline (see ffmpegAudio.js's FFT-throttle
  // fix's own comment for the full story). See renderWorker.js's module
  // comment for the message protocol/design. Defaults OFF (unchanged
  // single-threaded behavior) - this is a bigger, less battle-tested
  // change than everything else this session, deliberately opt-in rather
  // than replacing the working default.
  const useRenderWorker = process.env.RENDER_WORKER === '1';
  let driver = null;
  let renderWorker = null;
  if (useRenderWorker) {
    console.log('[app] RENDER_WORKER=1 - running tick()/driver.renderFrame() in a separate worker thread');
    renderWorker = new Worker(path.join(__dirname, 'renderWorker.js'), { workerData: { config } });
    renderWorker.on('error', (err) => console.error('[renderWorker] error:', err));
    renderWorker.on('exit', (code) => { if (code !== 0) console.error('[renderWorker] exited unexpectedly with code', code); });
    // No renderBootScreen() call here - the worker owns the only driver
    // instance (two RgbMatrixDrivers would fight over the same GPIO/DMA
    // resources) and renders its own boot screen immediately on startup.
  } else {
    driver = loadDriver(config);
    renderBootScreen(core, driver);
  }

  // WiFi provisioning, mirroring the ESP32 firmware's WiFiManager captive
  // portal: if there's no working connection, this opens a setup AP and
  // BLOCKS here until real credentials are submitted through it - matches
  // the firmware's connectWifi() blocking-until-connected pattern. The
  // boot screen above is already showing, so real panels aren't dark
  // during this wait, however long it takes. Opt out entirely (e.g. local
  // dev on a machine you don't want this touching) with SKIP_WIFI_SETUP=1.
  if (process.env.SKIP_WIFI_SETUP !== '1') {
    // In the background: effects start straight away even if Wi-Fi is slow
    // to come up (it used to block here on the amber screen - see wifiSetup.js).
    wifiSetup.ensureWifiConnected().catch((err) => console.warn('[wifi] setup failed:', err.message));
  } else {
    console.log('[app] SKIP_WIFI_SETUP=1 - skipping WiFi provisioning check');
  }

  // state.overlays: global overlays drawn over any effect (effects/overlays.js),
  // deep-cloned from OV_DEFAULTS so edits never touch the shared defaults.
  // state.alarms/activeAlarm: global timers. alarmFire() runs from the tick loop,
  // not a WS handler, so onAlarmsChanged persists and broadcasts its changes.
  // state.customCube: only changed by WS commands, which persist it themselves.
  const state = {
    effect: 'wave', brightness: 1.0, speed: 1.0, overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)),
    musicReact: { on: false, amount: 0.6 }, // see effects/audioFeatures.js
    scenes: scenes.load(), // see ./scenes.js
    prefs: prefs.load(), // favourites, playlist, night dimming - see ./prefs.js
    alarms: alarmConfig.load(), activeAlarm: null,
    customCube: customCubeConfig.load(),
    // Named wall-mode panel-grid layouts (see wallLayoutConfig.js's module
    // comment) - a library of PHYSICAL panel arrangements, distinct from
    // customCube's per-face EFFECT assignments above. Same "no autonomous
    // engine-side mutation" shape as customCube: every change comes from a
    // WS command, wsServer.js persists+broadcasts directly.
    wallLayouts: wallLayoutConfig.load().library,
    // Unsplash's saved API key/query - persisted server-side (JSON file, no
    // browser localStorage here - see unsplashConfig.js's module comment)
    // and included in every "state" broadcast so a freshly-connected
    // client's Unsplash panel reflects whatever key was last saved, same
    // as customCube/alarms.
    unsplashConfig: unsplashConfig.load(),
    // NASA API key (shared by APOD/EPIC/NEO) - same shape/reason as
    // unsplashConfig above. See nasaConfig.js's module comment.
    nasaConfig: nasaConfig.load(),
    // Weather's last-selected city (see weatherConfig.js's module comment
    // for the real report this fixes: it always reverted to London on
    // every restart otherwise). An empty string here correctly falls
    // through to effects/weather.js's own DEFAULT_CITY fallback via its
    // `core.effectOptions?.weather?.city || DEFAULT_CITY` check - nothing
    // special needed for "never picked one yet".
    effectOptions: { weather: { city: weatherConfig.load().city } },
  };
  // Pick up where the display left off before the last restart (see
  // ./sessionState.js); the radio station resumes once the render side is up.
  const resumeStation = sessionState.restore(state, EFFECTS);
  state.onAlarmsChanged = () => { alarmConfig.save(state.alarms); ws._broadcast(ws._stateMsg()); };
  // What the panel driver's wiring depends on (see the restart in the
  // config-change handler below).
  // Only the WIRING matters: cube (2x3 chains) vs a flat grid of
  // columns x rows. 'Panel 2D' and a one-panel wall are both 1x1, so
  // switching between them (clicking Layout) no longer restarts; moving
  // panels within the same grid doesn't either.
  const driverLayoutKey = (c) => {
    if (c.mode === 'cube') return 'cube';
    const ps = c.mode === 'wall' && Array.isArray(c.panels) && c.panels.length ? c.panels : [{ gx: 0, gy: 0 }];
    return `flat:${Math.max(...ps.map((p) => p.gx)) + 1}x${Math.max(...ps.map((p) => p.gy)) + 1}`;
  };
  const startLayoutKey = driverLayoutKey(config);
  const RESTART_DELAY_MS = 2000, RESTART_EXIT_CODE = 75; // 2s: long enough to batch a couple of quick layout edits, short enough to feel like one blip
  let restartTimer = null;
  const ws = new WsServer(WS_PORT, state, config, (newConfig) => {
    // Size changes apply live - CubeCore.resize() just rebuilds faceMap/
    // colBuf, cheap and safe (mockDriver and rgbMatrixDriver both just
    // read whatever core.SIZE/faceMap say on the next tick). Note
    // rgbMatrixDriver.js currently hardcodes a SIZE===64 check and will
    // throw on the next renderFrame() if you pick 8/16 with DRIVER=hardware
    // - those sizes are browser-preview-only concepts (the ESP32 firmware
    // is hardcoded PANEL_SIZE=64 too; real HUB75 panels are a fixed
    // physical resolution, they don't "become" an 8x8 panel).
    core.resize(newConfig.size);
    // Wall layout (panel count/positions) changes just as freely as size -
    // initWall() only rebuilds JS-side buffers (wallBuf/occupancy mask),
    // same "cheap and safe" situation as core.resize() above. Covers the
    // "+" add-panel button, drag-to-rearrange, and switching into wall mode
    // via the cube/2d/wall picker, all of which land here via onConfigChange.
    if (newConfig.mode === 'wall') core.initWall(newConfig.panels, newConfig.size);
    // Panel MODE (cube vs 2d), unlike size, is not just a data-shape change
    // on real hardware - rgbMatrixDriver.js's MatrixOptions (chainLength/
    // parallel, i.e. how many physical panels the driver expects) are
    // fixed at construction time, and rpi-led-matrix exposes no API to
    // reconfigure or tear down and recreate that at runtime (see that
    // file's close() comment). So a live mode change is only fully safe
    // with the mock driver; on real hardware it's applied to core/WS
    // preview immediately, but actually changes what physical panels the
    // driver pushes to only after a process restart.
    if (useRenderWorker) {
      // The worker owns the real driver - relay the same config change so
      // its own core/driver stay in sync.
      renderWorker.postMessage({ type: 'config', config: newConfig });
    }
    // Real panels: the driver's wiring layout is fixed at startup, so a
    // change that needs different wiring (mode, or a wall's panel grid)
    // used to leave the driver pushing a stale buffer - the physical
    // display froze on the last frame (a real report: switching to Panel
    // 2D froze the panel). Restart instead, so the driver comes back up
    // with the new layout (the setting is already saved). systemd's
    // Restart=on-failure brings the service straight back and the page
    // reconnects on its own. Debounced so a burst of layout edits (adding
    // several wall panels) costs one restart, not one per click.
    if (driverKind === 'hardware' && driverLayoutKey(newConfig) !== startLayoutKey) {
      clearTimeout(restartTimer);
      console.warn(`[app] panel layout changed (${startLayoutKey} -> ${driverLayoutKey(newConfig)}) - restarting in ${RESTART_DELAY_MS / 1000}s to apply it to the panels`);
      ws.sendAll({ cmd: 'systemNotice', text: 'Applying new panel layout - back in a few seconds…' });
      restartTimer = setTimeout(() => { console.warn('[app] restarting to apply the new panel layout'); saveSession(); process.exit(RESTART_EXIT_CODE); }, RESTART_DELAY_MS);
    }
  }, useRenderWorker ? (cmd, payload) => renderWorker.postMessage({ type: 'effectCommand', cmd, payload }) : null);
  console.log(`[app] control/preview WS server listening on :${WS_PORT}`);

  // Fire-and-forget - a real request: "auto try to connect to the previous
  // paired device, even after a reboot." Never awaited: it retries in the
  // background for up to ~30s (see bluetooth.js's autoReconnectLastSpeaker())
  // without blocking the boot screen/effect engine/WS server from coming
  // up immediately.
  // A speaker became the audio output (auto-reconnect or picked on the
  // page): move the radio's playback onto it - see restartPlayback().
  // Look for a newer version on GitHub a minute after start, then every 6 h
  // (shown on the Setup tab; see selfUpdate.js).
  const checkForUpdate = () => ws.updater.check().then(() => ws._broadcast(ws._stateMsg())).catch((err) => console.warn('[update] check failed:', err.message));
  setTimeout(checkForUpdate, 60000).unref();
  setInterval(checkForUpdate, 6 * 3600000).unref();
  // Self-heal: while music plays, check once a minute that the usual
  // speaker is still connected and is the output; reconnect it if not (at
  // most every 2 minutes, so a speaker that's switched off isn't hammered).
  let lastSpeakerFix = 0;
  setInterval(async () => {
    try {
      if (!radio.audio.decodeProc || Date.now() - lastSpeakerFix < 120000) return;
      const mac = require('./btConfig').load().lastSpeakerMac;
      if (!mac) return;
      const d = (await bluetooth.listPaired()).find((x) => x.mac === mac);
      if (d && d.connected && d.isDefaultOutput) return;
      lastSpeakerFix = Date.now();
      const r = await bluetooth.useOutput(mac);
      console.warn('[radio] speaker had dropped - ' + (r.set ? 'reconnected' : 'could not reconnect (is it switched on?)'));
    } catch (err) { console.warn('[radio] speaker check failed:', err.message); }
  }, 60000).unref();
  radio.audio.onPcm = (chunk, at) => ws.sendAudio(chunk, at); // phones playing along in sync
  bluetooth.onAudioOutputChanged(() => { if (radio.audio.restartPlayback) radio.audio.restartPlayback(); });
  bluetooth.autoReconnectLastSpeaker().catch((err) => console.warn('[bluetooth] auto-reconnect failed:', err.message));
  // A real report: "it keeps adding devices to my paired device list but
  // I have never paired with them" - `pairable`/`discoverable` have no
  // automatic expiry tied to process lifetime (see
  // makeDiscoverable()/resetPairability()'s own comments), so a prior
  // crashed/killed run - or an old build without this fix at all - could
  // leave the Pi silently accepting pairing requests from any nearby
  // device indefinitely. Clean slate on every boot.
  bluetooth.resetPairability();

  // performance.now(), not Date.now(): monotonic and sub-millisecond, so
  // dt doesn't jitter by whole milliseconds (visible as judder in slow
  // scrollers at 60Hz) or jump when the system clock is adjusted (NTP sync
  // shortly after boot is routine on a Pi with no RTC).
  // Diagnostics section of the control page - see ./diagnostics.js.
  const pkgVersion = require('../package.json').version;
  // Health watch every 5 minutes (see health.js): logs memory / processes and
  // restarts the app if the Pi is about to run out of memory.
  const health = require('./health').createHealth();
  setInterval(() => ws.faceTalk.tick(), 5000).unref(); // the Talking Face chats by itself when quiet
  // The microphone runs only while something wants it: the Talking Face on
  // screen with "Listen" on, or effects reacting to the room (Setup).
  const syncMic = () => {
    const fo = (state.effectOptions && state.effectOptions.talking_face) || {};
    const wasHearing = ws.mic.status.hearing;
    ws.mic.setWanted({ speech: state.effect === 'talking_face' && !state.blank && fo.listen !== false, music: !!(state.prefs && state.prefs.mic && state.prefs.mic.music) });
    if (wasHearing !== ws.mic.status.hearing) ws._broadcast(ws._stateMsg());
  };
  if (process.env.DRIVER !== 'mock') setInterval(syncMic, 1000).unref();
  // Network watchdog (see netWatch.js): keeps Wi-Fi and the Cloudflare tunnel
  // up. Only on the real Pi - never in mock mode on a development machine.
  const netWatch = require('./netWatch').createNetWatch({ rebootStampFile: require('path').join(__dirname, '..', '.net-reboot') });
  if (process.platform === 'linux' && process.env.DRIVER !== 'mock') netWatch.start();
  setTimeout(() => health.check(), 60000).unref();
  setInterval(() => health.check(), 5 * 60000).unref();
  setInterval(() => {
    if (!ws.hasClients) { diag.snapshot(); return; }
    ws.sendAll({ cmd: 'diag', ...diag.snapshot({
      version: pkgVersion,
      renderThread: useRenderWorker ? 'worker' : 'main',
      mode: `${config.mode} ${config.size}px`,
      radio: radio.audio.getStatus(),
      radioPlayback: radio.audio.getPlaybackStatus(),
      health: health.history.slice(-12), // the last hour of health checks
      net: netWatch.status,
    }) });
  }, 1000).unref();

  // Keep the saved session current (see ./sessionState.js): checked every
  // 2s, written only when a command changed state or the radio started/
  // stopped - cheap, and a power cut loses at most a couple of seconds.
  const radioStatusNow = () => (useRenderWorker ? state.effectStatus && state.effectStatus.radio : radio.getStatus());
  const radioKey = () => { const r = radioStatusNow(); return r && r.playing && r.station ? r.station.url : ''; };
  let savedVersion = null, savedRadio = null;
  function saveSession() {
    sessionState.save(state, radioStatusNow());
    savedVersion = ws.stateVersion; savedRadio = radioKey();
  }
  ws.saveSession = saveSession; // used by the restart/reboot commands
  setInterval(() => { if (ws.stateVersion !== savedVersion || radioKey() !== savedRadio) saveSession(); }, 30000).unref(); // 30 s, not 2 s: far fewer SD-card writes; a planned restart or shutdown saves immediately anyway
  if (resumeStation) {
    console.log('[session] resuming radio station:', resumeStation.name);
    if (useRenderWorker) renderWorker.postMessage({ type: 'effectCommand', cmd: 'radioPlay', payload: { station: resumeStation } });
    else radio.playStation(resumeStation);
  }

  let lastMs = performance.now();

  if (useRenderWorker) {
    // Ping-pong instead of setInterval: the next 'tick' is sent only after the
    // worker's 'frame' reply is applied. This paces to what the worker can keep up
    // with, and applies worker-owned state (alarms, effectStatus, ...) before the
    // next snapshot so it is never overwritten by a stale main-thread copy.
    // Commands bump ws.stateVersion; this resend is only a slow backstop, since
    // frequent full copies overwrite the worker's own progress.
    const STATE_RESEND_MS = 15000;
    let sentStateVersion = -1, lastStateSendMs = -Infinity;
    const sendTick = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed;
      lastMs = now;
      core.speedMult = state.speed;
      // Structured-clone can't carry a function reference across the
      // thread boundary - strip onAlarmsChanged (main-thread-only, calls
      // back into `ws`) before sending.
      // Full state is only sent when something changed it (every incoming
      // command and every broadcast bumps ws.stateVersion) - cloning
      // the whole state (overlays, effect options, custom cube, alarms...)
      // 60 times a second was pure garbage-collector churn. The worker keeps
      // the last copy it got. A resend at least every STATE_RESEND_MS is a
      // backstop for any mutation that doesn't broadcast.
      let stateForWorker = null;
      if (ws.stateVersion !== sentStateVersion || now - lastStateSendMs > STATE_RESEND_MS) {
        const { onAlarmsChanged, ...serializableState } = state;
        stateForWorker = serializableState;
        sentStateVersion = ws.stateVersion;
        lastStateSendMs = now;
      }
      // The real radio decode/FFT runs HERE, not in the worker (see
      // ffmpegAudio.js's RemoteAudio) - ship its latest spectrum along.
      renderWorker.postMessage({ type: 'tick', state: stateForWorker, version: sentStateVersion, dt, radioAudio: radio.audio.snapshot(), micSpec: ws.mic.spec() });
    };
    // A real report ("station name never updates in the UI after picking
    // one") - set by the worker's 'stateChanged' message (see
    // renderWorker.js's effectCommand handler comment) whenever a relayed
    // command actually changed something client-visible. Deferred to the
    // NEXT 'frame' reply rather than broadcast immediately on
    // 'stateChanged' itself - that message can arrive before the frame
    // reply that actually carries the command's result, since tick()
    // messages and effectCommand messages are sent independently; waiting
    // for the following frame guarantees the broadcast reflects the
    // command's actual outcome, not a stale pre-command snapshot.
    let pendingBroadcast = false;
    let sharedCol = null, sharedWall = null;
    let renderEmaMs = 0; // smoothed render time per frame, for the adaptive frame rate below
    let radioSeen = { ensureCount: 0, clearCount: 0 };
    renderWorker.on('message', (msg) => {
      if (msg.type === 'stateChanged') { pendingBroadcast = true; return; }
      if (msg.type !== 'frame') return;
      // A resize/mode change landing between this reply being computed and
      // received could leave core's buffers a different length than what
      // the worker sent for a single frame - skip applying a mismatched
      // one rather than letting TypedArray#set throw (self-heals on the
      // very next frame once both sides agree on size again).
      // Shared frame buffers (see renderWorker.js's sharedView()): kept
      // from the frame that introduced them, read in place every frame.
      if (msg.colShared) sharedCol = msg.colShared;
      if (msg.wallShared) sharedWall = msg.wallShared;
      if (sharedCol && msg.colLen === core.colBuf.length && sharedCol.length === core.colBuf.length) core.colBuf.set(sharedCol);
      if (sharedWall && core.wallBuf && msg.wallLen === core.wallBuf.length && sharedWall.length === core.wallBuf.length) core.wallBuf.set(sharedWall);
      // Only adopt the worker's copy of timer/blank state when it was
      // computed from the latest state we sent. Otherwise a frame already in
      // flight overwrote a change made a moment ago (a real report: "timers
      // don't save" - a new timer vanished on the next frame).
      if (msg.version === ws.stateVersion) {
        state.activeAlarm = msg.activeAlarm;
        state.alarms = msg.alarms;
        state.blank = msg.blank;
      }
      state.effectStatus = msg.effectStatus;
      diag.recordFrame(msg.renderMs);
      playSfx(state, msg.sfx);
      // A timer fired on the render thread and changed what's displayed:
      // adopt it here too, or the next state hand-off would revert it.
      if (msg.applied) { Object.assign(state, msg.applied); if (msg.alarms) { state.alarms = msg.alarms; state.activeAlarm = msg.activeAlarm; alarmConfig.save(state.alarms); } ws._broadcast(ws._stateMsg()); }
      routeTimerAudio(msg.activeAlarm);
      radioSeen = applyRemoteRequest(radio.audio, msg.radioAudio, radioSeen);
      ws.maybeStreamFrame(core, Number.isFinite(msg.brightness) ? msg.brightness : state.brightness); // the worker's brightness, so a sunrise brightens the preview too
      if (pendingBroadcast) { pendingBroadcast = false; ws._broadcast(ws._stateMsg()); }
      // Adaptive frame rate: keep the render thread at most ~70% busy.
      // A heavy effect on several panels could take ~14ms of the 16.7ms a
      // 60fps frame allows (seen in Diagnostics on a 3-panel wall), leaving
      // no headroom - the next spike (spectrum, overlays) dropped frames
      // unevenly. Instead, stretch the frame interval so there's always
      // slack: 60fps when cheap, easing down (never below 20fps) when not.
      // Effects are time-based, so they don't slow down, just update a
      // little less often.
      if (Number.isFinite(msg.renderMs)) renderEmaMs += (msg.renderMs - renderEmaMs) * 0.05;
      const intervalMs = Math.min(1000 / 20, Math.max(1000 / TICK_HZ, renderEmaMs / 0.7));
      setTimeout(sendTick, Math.max(0, intervalMs - (performance.now() - lastMs)));
    });
    sendTick();
  } else {
    setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed; // cap dt so a stall/GC pause can't produce a huge jump
      lastMs = now;

      // core.speedMult: raw (not dt-multiplied) speed value, for effects that
      // need it separately from the pre-scaled dt above - see effects/weather/
      // weather.js's module comment for why (it double-applies speedMult for
      // one specific timer, faithfully matching the browser source).
      core.speedMult = state.speed;
      // core.panelMode, effectOptions, etc. and effect status snapshots are all set
      // inside tick() (src/tick.js), shared with the simulator. Effects that want
      // the old single flat panel case check `core.panelMode === '2d'`, not `!== 'cube'`.
      const frameStart = performance.now();
      core.micSpec = ws.mic.spec();
      tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt);
      if (core.sfx && core.sfx.length) playSfx(state, core.sfx.splice(0));
      if (state.appliedChanges) { delete state.appliedChanges; ws._broadcast(ws._stateMsg()); } // a timer changed the display
      routeTimerAudio(state.activeAlarm);

      // Brightness is applied at push time, not baked into core.colBuf -
      // matches the browser's non-destructive approach (mesh.material.color.
      // setScalar(brightness), see CLAUDE.md). Mutating colBuf in place here
      // would compound incorrectly for any future effect that does partial/
      // additive updates instead of rewriting every LED every frame (all
      // effects ported so far happen to do a full rewrite, so it wouldn't
      // have shown up yet - not worth relying on that staying true).
      // Display off: a dim red power LED in the corner instead of darkness (see powerLed.js).
      if (state.panelsOff || state.blank) require('./powerLed').renderPowerLed(driver, core);
      else driver.renderFrame(core, state.brightness * prefs.nightFactor(state.prefs));
      diag.recordFrame(performance.now() - frameStart);
      ws.maybeStreamFrame(core, state.brightness);
    }, 1000 / SINGLE_THREAD_TICK_HZ);
  }

  // Whenever the app exits (a restart to apply a panel layout, the Restart
  // button, systemctl stop), kill the radio's ffmpeg/paplay helpers.
  // Otherwise they could outlive the app: the old stream kept playing
  // while the restarted app's new stream - the one feeding the spectrum -
  // wasn't (a real report: after adding a panel, sound but flat bars).
  // 'exit' handlers must be synchronous; RadioAudio's teardown is (SIGKILL).
  process.on('exit', () => { try { radio.audio.close(); } catch (e) { /* already gone */ } });
  // systemctl stop / reboot: save what's showing first (see ./sessionState.js).
  process.on('SIGTERM', () => { try { if (ws.saveSession) ws.saveSession(); } catch (e) { /* best effort */ } process.exit(0); });

  process.on('SIGINT', () => {
    console.log('\n[app] shutting down');
    if (renderWorker) renderWorker.terminate(); else driver.close();
    ws.close();
    process.exit(0);
  });

  // Log uncaught exceptions and keep running. A crash-restart loses in-memory
  // state (state.effect isn't saved), and for an LED appliance a degraded but
  // running display beats a blank panel and a reset. Deliberately not re-throwing.
  process.on('uncaughtException', (err) => {
    console.error('[app] uncaught exception (continuing):', err);
  });
  process.on('unhandledRejection', (err) => {
    console.error('[app] unhandled promise rejection (continuing):', err);
  });
}

main().catch((err) => {
  console.error('[app] fatal startup error:', err);
  process.exit(1);
});
