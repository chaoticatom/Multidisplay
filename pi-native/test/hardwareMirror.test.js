// Verifies the horizontal-mirror fix in rgbMatrixDriver.js (a real
// hardware-only report: physical panels showed everything left-right
// reversed in '2d' and 'wall' modes - confirmed NOT a browser-preview bug,
// since wsServer.js's maybeStreamFrame() streams colBuf/faceMap straight
// through with no flip). Mocks the `rpi-led-matrix` native addon (can't
// construct a real LedMatrix off a Pi - its constructor throws trying to
// read /proc/device-tree) so this can run in CI/dev like every other test
// here, capturing exactly what bytes would have been pushed to real
// hardware via drawBuffer().
const assert = require('assert');

const fakeMatrixPath = require.resolve('rpi-led-matrix');
require.cache[fakeMatrixPath] = {
  id: fakeMatrixPath, filename: fakeMatrixPath, loaded: true,
  exports: {
    LedMatrix: class {
      static defaultMatrixOptions() { return {}; }
      static defaultRuntimeOptions() { return {}; }
      constructor() { this.calls = []; }
      drawBuffer(buf, w, h, x, y) { this.calls.push({ buf: Buffer.from(buf), w, h, x, y }); }
      sync() {}
    },
    GpioMapping: { Regular: 1 },
  },
};

const RgbMatrixDriver = require('../src/drivers/rgbMatrixDriver');
const { CubeCore } = require('../src/core');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function px(buf, w, u, v) { const o = (v * w + u) * 3; return [buf[o], buf[o + 1], buf[o + 2]]; }

async function run() {
  await test('2d mode: physical output is horizontally mirrored vs. the raw colBuf content', () => {
    const core = new CubeCore(64);
    for (let v = 0; v < 64; v++) {
      for (let u = 0; u < 64; u++) {
        const idx = core.faceMap[0][v * 64 + u];
        if (idx < 0) continue;
        core.setLED(idx, u < 32 ? 1 : 0, 0, u < 32 ? 0 : 1); // left half red, right half blue
      }
    }
    const d = new RgbMatrixDriver({ mode: '2d' });
    d.renderFrame(core, 1.0);
    const buf = d.matrix.calls[0].buf;
    assert.deepStrictEqual(px(buf, 64, 0, 0), [0, 0, 255], 'physical left edge should now show the original right-side (blue) content');
    assert.deepStrictEqual(px(buf, 64, 63, 0), [255, 0, 0], 'physical right edge should now show the original left-side (red) content');
  });

  await test('cube mode is untouched by the 2d mirror fix (faceMap content passes straight through)', () => {
    const core = new CubeCore(64);
    for (let v = 0; v < 64; v++) {
      for (let u = 0; u < 64; u++) {
        const idx = core.faceMap[0][v * 64 + u];
        if (idx < 0) continue;
        core.setLED(idx, u < 32 ? 1 : 0, 0, u < 32 ? 0 : 1);
      }
    }
    const d = new RgbMatrixDriver({ mode: 'cube' });
    d.renderFrame(core, 1.0);
    const buf = d.matrix.calls[0].buf; // face 0
    assert.deepStrictEqual(px(buf, 64, 0, 0), [1, 0, 0].map((v) => v * 255), 'cube mode face 0 should NOT be mirrored - left stays left');
  });

  await test('wall mode: the whole assembled multi-panel canvas is mirrored, not each panel in place', () => {
    const core = new CubeCore(64);
    const panels = [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }];
    core.initWall(panels, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 128; x++) core.setWallPixel(x, y, x < 64 ? 1 : 0, 0, x < 64 ? 0 : 1); // left panel red, right panel blue
    }
    const d = new RgbMatrixDriver({ mode: 'wall' });
    d.renderFrame(core, 1.0);
    assert.strictEqual(d.matrix.calls.length, 2);
    const byGx = {};
    for (const c of d.matrix.calls) byGx[c.x / 64] = c.buf;
    // physical panel at gx=0 (left) should now show what was originally the far-right (blue) content
    assert.deepStrictEqual(px(byGx[0], 64, 0, 0), [0, 0, 255], 'physical left panel should show the original right-side content');
    // physical panel at gx=1 (right) should now show what was originally the far-left (red) content
    assert.deepStrictEqual(px(byGx[1], 64, 63, 0), [255, 0, 0], 'physical right panel should show the original left-side content');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll hardwareMirror tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
