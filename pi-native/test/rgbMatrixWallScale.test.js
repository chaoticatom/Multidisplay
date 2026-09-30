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
  console.log('  ok - 8x8 flat layout scales up to the 64x64 panel');
} catch (e) {
  console.error('  FAIL -', e.message);
  process.exitCode = 1;
}
