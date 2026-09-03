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

// Real request: "increase the fps of the bars". Raised from 30 - safe to
// do since the RENDER_WORKER ping-pong loop below already self-throttles
// to whatever rate the worker can actually sustain (it never sends the
// next tick until the current frame's reply lands, and Math.max(0, ...)
// means a slow frame just gets immediately followed by the next request,
// never queuing up or overloading) - this only raises the ceiling, actual
// achieved rate is still capped by real hardware capability either way.
const TICK_HZ = 60; // effect-compute + panel-push rate; independent of the driver's own PWM refresh
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
    await wifiSetup.ensureWifiConnected();
  } else {
    console.log('[app] SKIP_WIFI_SETUP=1 - skipping WiFi provisioning check');
  }

  // state.overlays: GLOBAL overlay config (composite on top of whatever
  // effect is selected, not tied to it like state.effectOptions) - see
  // effects/overlays.js's module comment. Deep-cloned off OV_DEFAULTS so
  // mutating one overlay's params (via the setOverlayOption WS command)
  // never mutates the shared defaults object itself.
  // state.alarms / state.activeAlarm: Timer system, same "GLOBAL, runs
  // every tick regardless of selected effect" category as state.overlays -
  // see effects/alarms.js's module comment for the persisted-state file
  // (alarmConfig.js) and the exact tick-order this composes with overlays
  // in below. onAlarmsChanged persists to disk + broadcasts state on any
  // mutation alarmFire() itself makes (e.g. a 'once' alarm disabling
  // itself, or an alarm's overlayKeys turning overlays on) - wsServer.js's
  // add/update/delete/toggle/dismiss handlers persist+broadcast too, but
  // alarmFire() runs from THIS tick loop, not from a WS handler, so it
  // needs its own hook to do the same.
  // state.customCube: Custom Cube's persisted per-face effect assignment +
  // saved-configuration library - same "GLOBAL-ish but only rendered when
  // selected as the effect" category as effectOptions, not overlays/alarms
  // (those two run every tick regardless of state.effect; Custom Cube only
  // renders when state.effect==='custom_cube', same as any other effect) -
  // see effects/customCube.js's module comment and customCubeConfig.js for
  // the persisted shape. Unlike alarms/overlays there's no autonomous
  // engine-side mutation of this state (nothing here fires on its own the
  // way an alarm does), so unlike alarmConfig there's no onXChanged hook -
  // every mutation comes from a WS command, and wsServer.js persists+
  // broadcasts directly after each one (see its _persistCustomCube()).
  const state = {
    effect: 'wave', brightness: 1.0, speed: 1.0, overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)),
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
  state.onAlarmsChanged = () => { alarmConfig.save(state.alarms); ws._broadcast(ws._stateMsg()); };
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
      // its own core/driver stay in sync (it logs the same hardware-mode
      // warning itself, see renderWorker.js).
      renderWorker.postMessage({ type: 'config', config: newConfig });
    } else if (driverKind === 'hardware') {
      console.warn('[app] panel mode changed to', newConfig.mode, '- restart the process to apply this to the physical panel driver (rgbMatrixDriver.js\'s panel topology is fixed at startup)');
    }
  }, useRenderWorker ? (cmd, payload) => renderWorker.postMessage({ type: 'effectCommand', cmd, payload }) : null);
  console.log(`[app] control/preview WS server listening on :${WS_PORT}`);

  // Fire-and-forget - a real request: "auto try to connect to the previous
  // paired device, even after a reboot." Never awaited: it retries in the
  // background for up to ~30s (see bluetooth.js's autoReconnectLastSpeaker())
  // without blocking the boot screen/effect engine/WS server from coming
  // up immediately.
  bluetooth.autoReconnectLastSpeaker().catch((err) => console.warn('[bluetooth] auto-reconnect failed:', err.message));
  // A real report: "it keeps adding devices to my paired device list but
  // I have never paired with them" - `pairable`/`discoverable` have no
  // automatic expiry tied to process lifetime (see
  // makeDiscoverable()/resetPairability()'s own comments), so a prior
  // crashed/killed run - or an old build without this fix at all - could
  // leave the Pi silently accepting pairing requests from any nearby
  // device indefinitely. Clean slate on every boot.
  bluetooth.resetPairability();

  let lastMs = Date.now();

  if (useRenderWorker) {
    // Ping-pong instead of a free-running setInterval: the next 'tick' is
    // only sent once the worker's 'frame' reply for the current one has
    // been applied. This (a) naturally paces to whatever rate the worker
    // can actually keep up with rather than flooding it with messages
    // faster than it can process them, and (b) guarantees the
    // alarms/activeAlarm/blank/effectStatus round-trip (see
    // renderWorker.js's module comment for why this needs to be
    // authoritative-from-the-worker) is applied to `state` BEFORE the next
    // outgoing snapshot is built, so nothing the worker mutated ever gets
    // silently overwritten by a stale main-thread copy.
    const sendTick = () => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed;
      lastMs = now;
      core.speedMult = state.speed;
      // Structured-clone can't carry a function reference across the
      // thread boundary - strip onAlarmsChanged (main-thread-only, calls
      // back into `ws`) before sending.
      const { onAlarmsChanged, ...serializableState } = state;
      renderWorker.postMessage({ type: 'tick', state: serializableState, dt });
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
    renderWorker.on('message', (msg) => {
      if (msg.type === 'stateChanged') { pendingBroadcast = true; return; }
      if (msg.type !== 'frame') return;
      // A resize/mode change landing between this reply being computed and
      // received could leave core's buffers a different length than what
      // the worker sent for a single frame - skip applying a mismatched
      // one rather than letting TypedArray#set throw (self-heals on the
      // very next frame once both sides agree on size again).
      if (msg.colBuf.length === core.colBuf.length) core.colBuf.set(msg.colBuf);
      if (msg.wallBuf && core.wallBuf && msg.wallBuf.length === core.wallBuf.length) core.wallBuf.set(msg.wallBuf);
      state.activeAlarm = msg.activeAlarm;
      state.alarms = msg.alarms;
      state.blank = msg.blank;
      state.effectStatus = msg.effectStatus;
      ws.maybeStreamFrame(core, state.brightness);
      if (pendingBroadcast) { pendingBroadcast = false; ws._broadcast(ws._stateMsg()); }
      setTimeout(sendTick, Math.max(0, 1000 / TICK_HZ - (Date.now() - lastMs)));
    });
    sendTick();
  } else {
    setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed; // cap dt so a stall/GC pause can't produce a huge jump
      lastMs = now;

      // core.speedMult: raw (not dt-multiplied) speed value, for effects that
      // need it separately from the pre-scaled dt above - see effects/weather/
      // weather.js's module comment for why (it double-applies speedMult for
      // one specific timer, faithfully matching the browser source).
      core.speedMult = state.speed;
      // core.panelMode: the browser's `panel2dMode` global, read by effects
      // that render differently on a single flat panel vs. a cube face (e.g.
      // weather.js's horizon/sun/moon/text placement) - see that file's
      // module comment. Only 'wall'/'2d'/'cube' as set by panelConfig; 'wall'
      // isn't a real single flat panel in the same sense (it's N panels), so
      // effects keying off "is this the old single-2D-panel case" check
      // `core.panelMode === '2d'` specifically, not `!== 'cube'`.
      // core.panelMode/effectOptions/customCubeFaces/overlaysState are set
      // inside tick() (src/tick.js) now, shared verbatim with the browser
      // simulator bundle - see that file's module comment.
      // Some effects (weather, and potentially others with their own
      // background fetch - see effects/weather.js's getStatus()) expose a
      // status snapshot (fetch in progress / last error / live values) for
      // the control page's option panel to display, since it has no other
      // way to see what a Pi-side-only fetch actually did - also computed
      // inside tick().
      tick(core, state, config, EFFECTS, WALL_EFFECTS, alarms, runOverlays, dt);

      // Brightness is applied at push time, not baked into core.colBuf -
      // matches the browser's non-destructive approach (mesh.material.color.
      // setScalar(brightness), see CLAUDE.md). Mutating colBuf in place here
      // would compound incorrectly for any future effect that does partial/
      // additive updates instead of rewriting every LED every frame (all
      // effects ported so far happen to do a full rewrite, so it wouldn't
      // have shown up yet - not worth relying on that staying true).
      driver.renderFrame(core, state.brightness);
      ws.maybeStreamFrame(core, state.brightness);
    }, 1000 / TICK_HZ);
  }

  process.on('SIGINT', () => {
    console.log('\n[app] shutting down');
    if (renderWorker) renderWorker.terminate(); else driver.close();
    ws.close();
    process.exit(0);
  });

  // Without this, ANY uncaught exception anywhere (a bad frame from
  // ffmpeg, a malformed WS payload, a bug in one specific effect) crashes
  // the whole process. systemd's Restart=on-failure (see systemd/
  // multidisplay-pi.service) brings it back up a few seconds later, but
  // with fresh in-memory `state` - state.effect isn't persisted anywhere
  // (unlike alarms/customCube/panelConfig, which ARE saved to disk), so a
  // crash-restart silently reverts whatever was selected back to the
  // 'wave' default. A real instance of this was traced to a request-
  // handler double-response bug in wsServer.js's video-upload endpoint
  // (fixed separately) - but that class of bug (a stray exception in one
  // corner of a much larger effect library) is exactly the kind future
  // code here could reintroduce elsewhere, so log-and-keep-running is a
  // more appropriate default for a physical display appliance than crash-
  // and-lose-state. Deliberately NOT re-throwing/exiting: on a Pi driving
  // real LED panels, staying up in a possibly-degraded state (worst case:
  // the current effect keeps misbehaving) is better than a naked panel and
  // a state reset every time something somewhere throws once.
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
