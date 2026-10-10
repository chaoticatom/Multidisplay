// Health watch (src/health.js) and the power LED (src/powerLed.js).
'use strict';
const assert = require('assert');
const { createHealth } = require('../src/health');
const { renderPowerLed, level } = require('../src/powerLed');
const { CubeCore } = require('../src/core');
console.log('healthPower');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }
const MB = 1048576;
const quiet = { log() {}, warn() {}, error() {} };

t('logs a sample and keeps history', () => {
  const h = createHealth({ read: () => ({ rss: 150 * MB, heap: 60 * MB, free: 900 * MB, total: 1900 * MB, load: 0.7, children: 3 }), exit: () => { throw new Error('should not restart'); }, log: quiet });
  const s = h.check();
  assert.strictEqual(s.rssMB, 150); assert.strictEqual(s.freeMB, 900); assert.strictEqual(s.children, 3);
  assert.strictEqual(h.history.length, 1);
});
t('restarts only after two low-memory checks in a row', () => {
  let exited = null, free = 50 * MB;
  const h = createHealth({ read: () => ({ rss: 300 * MB, heap: 100 * MB, free, total: 1900 * MB, load: 3, children: 4 }), exit: (c) => { exited = c; }, log: quiet });
  h.check(); assert.strictEqual(exited, null, 'one spike is tolerated');
  free = 800 * MB; h.check(); free = 50 * MB; h.check(); assert.strictEqual(exited, null, 'not consecutive');
  h.check(); assert.strictEqual(exited, 1);
});
t('restarts when child processes pile up', () => {
  let exited = null;
  const h = createHealth({ read: () => ({ rss: 100 * MB, heap: 50 * MB, free: 900 * MB, total: 1900 * MB, load: 1, children: 60 }), exit: (c) => { exited = c; }, log: quiet });
  h.check(); h.check(); assert.strictEqual(exited, 1);
});
t('display off: only a dim red LED bottom-left reaches the panels; the frame is kept', () => {
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }], 64);
  core.wallBuf.fill(0.7);
  let pushed = null, bright = null;
  renderPowerLed({ renderFrame: (c, b) => { pushed = Float32Array.from(c.wallBuf); bright = b; } }, core, 1500); // the top of the pulse
  const i = ((core.wallH - 1) * core.wallW) * 3;
  assert.deepStrictEqual([pushed[i], pushed[i + 1], pushed[i + 2]], [0.5, 0, 0]);
  assert.strictEqual(pushed.reduce((a, v) => a + v, 0), 0.5, 'everything else dark');
  assert.strictEqual(bright, 1);
  assert.ok(Math.abs(core.wallBuf[0] - 0.7) < 1e-6, 'the real frame (and so the preview) is untouched');
});
if (failed) process.exitCode = 1;
t('the power LED pulses slowly between 20% and 50%', () => {
  const { level } = require('../src/powerLed');
  const vals = []; for (let ms = 0; ms < 3000; ms += 50) vals.push(level(ms));
  assert.ok(Math.abs(Math.min(...vals) - 0.2) < 0.005 && Math.abs(Math.max(...vals) - 0.5) < 0.005, Math.min(...vals) + '..' + Math.max(...vals));
  assert.ok(Math.abs(level(0) - level(3000)) < 1e-9, 'repeats every 3 s');
});
if (failed) process.exitCode = 1;
