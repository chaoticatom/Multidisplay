// A flat (wall) layout with a logical panel size below 64 must be scaled up
// to fill the 64x64 hardware panel - the driver used to throw, killing the
// render worker at startup when the saved size was 8x8.
'use strict';
const assert = require('assert');
const Module = require('module');
const path = require('path');

const draws = [];
class FakeMatrix {
  drawBuffer(buf, w, h, x, y) { draws.push({ buf: Uint8Array.from(buf), w, h, x, y }); }
  sync() {}
}
FakeMatrix.defaultMatrixOptions = () => ({});
FakeMatrix.defaultRuntimeOptions = () => ({});
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (req === 'rpi-led-matrix') return { LedMatrix: FakeMatrix, GpioMapping: {}, RuntimeFlag: {} };
  return origLoad.call(this, req, ...rest);
};
const RgbMatrixDriver = require(path.join('..', 'src', 'drivers', 'rgbMatrixDriver.js'));
Module._load = origLoad;
const CubeCore = require('../src/core');
const Core = CubeCore.CubeCore || CubeCore;

try {
  const core = new Core(8);
  core.panelMode = 'wall';
  core.initWall([{ gx: 0, gy: 0 }], 8);
  core.wallBuf.fill(1);
  const d = new RgbMatrixDriver({ mode: 'wall', panels: [{ gx: 0, gy: 0 }] });
  d.renderFrame(core, 1);
  assert.strictEqual(draws.length, 1);
  assert.strictEqual(draws[0].w, 64);
  assert.strictEqual(draws[0].h, 64);
  assert.ok(draws[0].buf[(63 * 64 + 63) * 3] > 0, 'bottom-right pixel lit (scaled up)');
  // Vertical flip: the canvas's top-right pixel lands bottom-right.
  draws.length = 0;
  core.wallBuf.fill(0);
  core.wallBuf[(0 * core.wallW + 0) * 3] = 1; // top-left, mirrored to the right by the existing horizontal mirror
  d.renderFrame(core, 1);
  assert.ok(draws[0].buf[(63 * 64 + 63) * 3] > 0, 'flipped: shows at bottom-right');
  assert.strictEqual(draws[0].buf[0], 0, 'flipped: top-left dark');
  console.log('  ok - 8x8 flat layout scales up to the 64x64 panel');

  // L-shape (two on top, one bottom-left): the bottom panel shows its own
  // picture - it used to read the empty cell to its right and freeze.
  const L = [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }, { gx: 0, gy: 1 }];
  const cl = new Core(64); cl.panelMode = 'wall'; cl.initWall(L, 64);
  const dl = new RgbMatrixDriver({ mode: 'wall', panels: L });
  for (let y = 64; y < 128; y++) for (let x = 0; x < 64; x++) cl.setWallPixel(x, y, 0, 1, 0);
  draws.length = 0; dl.renderFrame(cl, 1);
  const bottom = draws.find((q) => q.y === 64);
  assert.ok(bottom && bottom.x === 0, 'bottom panel is the first on its chain');
  assert.ok(bottom.buf[1] > 0, 'bottom panel shows its own (green) picture');
  // A full row keeps the old order: the left panel's picture goes to the second slot.
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) cl.setWallPixel(x, y, 1, 0, 0);
  draws.length = 0; dl.renderFrame(cl, 1);
  assert.ok(draws.find((q) => q.y === 0 && q.x === 64).buf[0] > 0, 'top row: left picture in slot 2');
  assert.strictEqual(draws.find((q) => q.y === 0 && q.x === 0).buf[0], 0, 'top row: slot 1 has the right picture');
  console.log('  ok - L-shaped layout: every panel shows its own picture');
} catch (e) {
  console.error('  FAIL -', e.message);
  process.exitCode = 1;
}
