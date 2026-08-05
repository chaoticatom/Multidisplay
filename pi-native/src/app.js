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

const PANEL_SIZE = 64;
const TICK_HZ = 30; // effect-compute + panel-push rate; independent of the driver's own PWM refresh
const WS_PORT = 8081;

function loadDriver() {
  const which = process.env.DRIVER || 'mock';
  if (which === 'hardware') {
    // eslint-disable-next-line global-require
    const RgbMatrixDriver = require('./drivers/rgbMatrixDriver');
    console.log('[app] using rgbMatrixDriver (real hardware)');
    return new RgbMatrixDriver();
  }
  // eslint-disable-next-line global-require
  const MockDriver = require('./drivers/mockDriver');
  console.log('[app] using mockDriver (no hardware output) - set DRIVER=hardware to drive real panels');
  return new MockDriver();
}

function main() {
  const core = new CubeCore(PANEL_SIZE);
  const driver = loadDriver();

  const state = { effect: 'wave', brightness: 1.0, speed: 1.0 };
  const ws = new WsServer(WS_PORT, state);
  console.log(`[app] control/preview WS server listening on :${WS_PORT}`);

  let lastMs = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - lastMs) / 1000) * state.speed; // cap dt so a stall/GC pause can't produce a huge jump
    lastMs = now;

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
