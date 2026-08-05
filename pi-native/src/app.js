// Entry point. Computes the current effect into a CubeCore, pushes it to
// the LED driver every tick, and runs the local control/preview WS server.
//
// Driver selection: DRIVER=hardware uses rgbMatrixDriver.js (real panels,
// Pi-only - see that file). Defaults to DRIVER=mock (safe everywhere,
// including this dev sandbox with no ARM hardware) so a bare `npm start`
// never accidentally tries to touch GPIO on a machine that isn't a Pi.
const { CubeCore } = require('./core');
const { EFFECTS } = require('./effects');
const WsServer = require('./wsServer');
const panelConfig = require('./panelConfig');

const TICK_HZ = 30; // effect-compute + panel-push rate; independent of the driver's own PWM refresh
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
  driver.renderFrame(core, 1.0);
}

function loadDriver(config) {
  const which = process.env.DRIVER || 'mock';
  if (which === 'hardware') {
    // eslint-disable-next-line global-require
    const RgbMatrixDriver = require('./drivers/rgbMatrixDriver');
    console.log('[app] using rgbMatrixDriver (real hardware), mode=' + config.mode);
    return new RgbMatrixDriver({ mode: config.mode });
  }
  // eslint-disable-next-line global-require
  const MockDriver = require('./drivers/mockDriver');
  console.log('[app] using mockDriver (no hardware output) - set DRIVER=hardware to drive real panels');
  return new MockDriver();
}

function main() {
  const config = panelConfig.load();
  console.log(`[app] panel config: size=${config.size} mode=${config.mode} (${config.mode === '2d' ? 1 : 6} panel(s))`);
  const core = new CubeCore(config.size);
  const driver = loadDriver(config);
  const driverKind = process.env.DRIVER || 'mock';
  renderBootScreen(core, driver);

  const state = { effect: 'wave', brightness: 1.0, speed: 1.0 };
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
    // Panel MODE (cube vs 2d), unlike size, is not just a data-shape change
    // on real hardware - rgbMatrixDriver.js's MatrixOptions (chainLength/
    // parallel, i.e. how many physical panels the driver expects) are
    // fixed at construction time, and rpi-led-matrix exposes no API to
    // reconfigure or tear down and recreate that at runtime (see that
    // file's close() comment). So a live mode change is only fully safe
    // with the mock driver; on real hardware it's applied to core/WS
    // preview immediately, but actually changes what physical panels the
    // driver pushes to only after a process restart.
    if (driverKind === 'hardware') {
      console.warn('[app] panel mode changed to', newConfig.mode, '- restart the process to apply this to the physical panel driver (rgbMatrixDriver.js\'s panel topology is fixed at startup)');
    }
  });
  console.log(`[app] control/preview WS server listening on :${WS_PORT}`);

  let lastMs = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed; // cap dt so a stall/GC pause can't produce a huge jump
    lastMs = now;

    // core.speedMult: raw (not dt-multiplied) speed value, for effects that
    // need it separately from the pre-scaled dt above - see effects/weather/
    // weather.js's module comment for why (it double-applies speedMult for
    // one specific timer, faithfully matching the browser source).
    core.speedMult = state.speed;
    const fn = EFFECTS[state.effect];
    if (fn) fn(core, dt);

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

  process.on('SIGINT', () => {
    console.log('\n[app] shutting down');
    driver.close();
    ws.close();
    process.exit(0);
  });
}

main();
