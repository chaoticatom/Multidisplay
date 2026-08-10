// Interactive MuxType cycling tool - press Enter to advance to the next
// candidate, Ctrl+C to stop on whichever one looks right. Built because
// one-at-a-time manual stop/edit/restart cycles were far too slow for
// working through ~18 possible MuxType values by hand.
//
// Usage: sudo DRIVER=hardware node test-mux-cycle.js
const readline = require('readline');
const { CubeCore } = require('./src/core');
const panelConfig = require('./src/panelConfig');
const RgbMatrixDriver = require('./src/drivers/rgbMatrixDriver');
const { MuxType } = require('rpi-led-matrix');

// Ordered roughly by how common each is for cheap indoor 64x64 panels -
// most-likely candidates first, per rpi-led-matrix's own MuxType enum.
const CANDIDATES = [
  'Stripe', 'Checker', 'ZStripe', 'Coreman', 'Kaler2Scan', 'Spiral',
  'ZnMirrorZStripe', 'ZStripeUneven', 'InversedZStripe', 'QiangLiQ8',
];

const config = panelConfig.load();
const core = new CubeCore(config.size);
// Solid blue, same as test-solid-color.js - easiest to visually judge
// "is this a clean fill or still blocky/wrong".
for (let i = 0; i < core.colBuf.length; i += 3) {
  core.colBuf[i] = 0; core.colBuf[i + 1] = 0; core.colBuf[i + 2] = 1;
}

let idx = 0;
let driver = null;

function showCurrent() {
  const name = CANDIDATES[idx];
  if (driver) driver.close();
  driver = new RgbMatrixDriver({
    mode: config.mode,
    matrixOptions: { multiplexing: MuxType[name] },
    // gpioSlowdown:4 (rather than the class default 2) since that looked
    // more stable earlier - keeps timing flicker from confounding
    // whether a given MuxType is actually the right pattern or not.
    runtimeOptions: { gpioSlowdown: 4 },
  });
  console.log(`\n[${idx + 1}/${CANDIDATES.length}] MuxType.${name} - look at the panel now. Press Enter for next, Ctrl+C to stop here.`);
  driver.renderFrame(core, 1.0);
}

const timer = setInterval(() => { if (driver) driver.renderFrame(core, 1.0); }, 200);

const rl = readline.createInterface({ input: process.stdin });
console.log('Solid blue fill, cycling through MuxType candidates.');
console.log('IMPORTANT: when you find one that looks right (clean solid fill, no blocks/banding), Ctrl+C immediately and tell me which number/name it was.\n');
showCurrent();

rl.on('line', () => {
  idx++;
  if (idx >= CANDIDATES.length) {
    console.log('\nAll candidates tried. If none looked right, tell me and we\'ll try the remaining/outdoor-specific ones.');
    clearInterval(timer);
    rl.close();
    if (driver) driver.close();
    process.exit(0);
  }
  showCurrent();
});

process.on('SIGINT', () => {
  console.log(`\n[STOPPED] Last shown: MuxType.${CANDIDATES[idx]}`);
  clearInterval(timer);
  if (driver) driver.close();
  process.exit(0);
});
