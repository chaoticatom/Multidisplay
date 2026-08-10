// Minimal standalone diagnostic - fills the panel(s) with one solid color
// and holds it there, bypassing the effect engine/WS server/app.js
// entirely. For isolating hardware/wiring issues from software: if this
// still shows banding/garbling, the problem is definitely in the physical
// wiring or matrixOptions, not in anything effect-related.
//
// Usage: sudo DRIVER=hardware node test-solid-color.js [r] [g] [b] [muxType]
//   Color components are 0-1 floats. Defaults to blue (0,0,1).
//   muxType (optional): a MuxType name (Stripe, Checker, ZStripe, Coreman,
//   Kaler2Scan, Spiral, ZnMirrorZStripe, ZStripeUneven, InversedZStripe,
//   QiangLiQ8, Direct). Deliberately a SEPARATE PROCESS PER VALUE, not an
//   in-process cycling tool - rpi-led-matrix has no API to release/
//   reconfigure GPIO+DMA hardware within one running process (see
//   rgbMatrixDriver.js's close() comment), so swapping options between
//   multiple LedMatrix instances in the same process silently doesn't
//   take effect. Only a fresh process actually frees the hardware state.
//   Confirmed live: an in-process cycling version of this tool showed
//   zero visible change across several different MuxType values in a row.
const { CubeCore } = require('./src/core');
const panelConfig = require('./src/panelConfig');

const r = process.argv[2] !== undefined ? Number(process.argv[2]) : 0;
const g = process.argv[3] !== undefined ? Number(process.argv[3]) : 0;
const b = process.argv[4] !== undefined ? Number(process.argv[4]) : 1;
const muxTypeName = process.argv[5];

const config = panelConfig.load();
const core = new CubeCore(config.size);
for (let i = 0; i < core.colBuf.length; i += 3) {
  core.colBuf[i] = r;
  core.colBuf[i + 1] = g;
  core.colBuf[i + 2] = b;
}

const which = process.env.DRIVER || 'mock';
let driver;
if (which === 'hardware') {
  const RgbMatrixDriver = require('./src/drivers/rgbMatrixDriver');
  const { MuxType } = require('rpi-led-matrix');
  const opts = { mode: config.mode, runtimeOptions: { gpioSlowdown: 4 } };
  if (muxTypeName) {
    if (!(muxTypeName in MuxType)) {
      console.error(`Unknown MuxType "${muxTypeName}". Valid: ${Object.keys(MuxType).filter((k) => isNaN(Number(k))).join(', ')}`);
      process.exit(1);
    }
    opts.matrixOptions = { multiplexing: MuxType[muxTypeName] };
  }
  driver = new RgbMatrixDriver(opts);
  console.log(`[test] rgbMatrixDriver, mode=${config.mode}, size=${config.size}, multiplexing=${muxTypeName || 'Direct (default)'}`);
} else {
  const MockDriver = require('./src/drivers/mockDriver');
  driver = new MockDriver();
  console.log('[test] mockDriver (set DRIVER=hardware to actually drive panels)');
}

console.log(`[test] filling with RGB(${r}, ${g}, ${b}) and holding - Ctrl+C to stop`);
driver.renderFrame(core, 1.0);

// Keep re-pushing at a low rate rather than a single call - some panel
// libraries need sustained refresh calls to stay lit, and this also makes
// it trivial to Ctrl+C out cleanly at any point.
setInterval(() => driver.renderFrame(core, 1.0), 200);

process.on('SIGINT', () => {
  console.log('\n[test] stopping');
  driver.close();
  process.exit(0);
});
