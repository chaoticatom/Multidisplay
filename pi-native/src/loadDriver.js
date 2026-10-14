// Extracted out of app.js so both the normal single-threaded entry point
// and renderWorker.js (the opt-in RENDER_WORKER=1 render-loop worker
// thread - see that file's module comment) can pick the same driver the
// same way, without duplicating this logic in two places.
function loadDriver(config) {
  const which = process.env.DRIVER || 'mock';
  if (which === 'hardware') {
    // eslint-disable-next-line global-require
    const RgbMatrixDriver = require('./drivers/rgbMatrixDriver');
    console.log('[app] using rgbMatrixDriver (real hardware), mode=' + config.mode);
    const sig = require('./panelConfig').cleanSignal(config.signal);
    console.log(`[app] panel signal: slowdown ${sig.slowdown}, type ${sig.panelType || 'standard'}, PWM LSB ${sig.lsbNs} ns`);
    return new RgbMatrixDriver({ mode: config.mode, panels: config.panels, matrixOptions: { panelType: sig.panelType, pwmLsbNanoseconds: sig.lsbNs }, runtimeOptions: { gpioSlowdown: sig.slowdown } });
  }
  // eslint-disable-next-line global-require
  const MockDriver = require('./drivers/mockDriver');
  console.log('[app] using mockDriver (no hardware output) - set DRIVER=hardware to drive real panels');
  return new MockDriver();
}

module.exports = { loadDriver };
