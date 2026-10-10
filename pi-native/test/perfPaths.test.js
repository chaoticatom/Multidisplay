// The faster paths keep the same behaviour: setWallPixel's panel lookup and
// the glow pass skipping frames with nothing bright.
'use strict';
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { processImage } = require('../src/effects/postfx');
console.log('perfPaths');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

t('setWallPixel: writes on a panel, skips gaps, edges and fractional positions', () => {
  const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 1 }], 64); // an L: (1,0) and (0,1) are empty
  c.setWallPixel(10, 10, 1, 0, 0); assert.strictEqual(c.wallBuf[(10 * c.wallW + 10) * 3], 1);
  c.setWallPixel(100, 10, 1, 0, 0); assert.strictEqual(c.wallBuf[(10 * c.wallW + 100) * 3], 0, 'empty cell');
  c.setWallPixel(100, 100, 0, 1, 0); assert.strictEqual(c.wallBuf[(100 * c.wallW + 100) * 3 + 1], 1);
  const before = Float32Array.from(c.wallBuf);
  c.setWallPixel(-1, 5, 1, 1, 1); c.setWallPixel(5, 999, 1, 1, 1); c.setWallPixel(3.5, 4, 1, 1, 1);
  assert.deepStrictEqual(c.wallBuf, before, 'nothing written off the wall or at a fractional x');
  assert.strictEqual(c.wallAllOccupied, false);
});
t('glow pass leaves a frame with nothing bright untouched (vibrance off)', () => {
  const w = 32, h = 16, buf = new Float32Array(w * h * 3).fill(0.3), copy = Float32Array.from(buf);
  processImage(buf, w, h, 0.65, 0);
  assert.deepStrictEqual(buf, copy);
});
t('glow pass still glows around a bright pixel', () => {
  const w = 32, h = 16, buf = new Float32Array(w * h * 3);
  const o = (8 * w + 16) * 3; buf[o] = buf[o + 1] = buf[o + 2] = 1;
  processImage(buf, w, h, 0.65, 0);
  assert.ok(buf[(8 * w + 18) * 3] > 0.005, 'light spills onto a neighbour'); // a single pixel's glow is faint by design
});
if (failed) process.exitCode = 1;
