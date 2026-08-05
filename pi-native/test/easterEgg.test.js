const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CubeCore } = require('../src/core');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('easterEgg image data');
test('img1.bin/img2.bin are each exactly 64*64*3 bytes', () => {
  const img1 = fs.readFileSync(path.join(__dirname, '../src/effects/easterEgg/img1.bin'));
  const img2 = fs.readFileSync(path.join(__dirname, '../src/effects/easterEgg/img2.bin'));
  assert.strictEqual(img1.length, 64 * 64 * 3);
  assert.strictEqual(img2.length, 64 * 64 * 3);
});
test('img1.bin matches firmware/src/easter_egg_images.h byte-for-byte', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../firmware/src/easter_egg_images.h'), 'utf8');
  const startMarker = 'static const uint8_t EASTER_EGG_IMG1[12288] PROGMEM = {';
  const bodyStart = src.indexOf(startMarker) + startMarker.length;
  const endIdx = src.indexOf('};', bodyStart);
  const expected = src.slice(bodyStart, endIdx).split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  const actual = fs.readFileSync(path.join(__dirname, '../src/effects/easterEgg/img1.bin'));
  assert.strictEqual(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.strictEqual(actual[i], expected[i], `byte ${i} differs`);
  }
});

console.log('easterEgg effect');
test('at t~0 (phase<15), a center pixel matches img1 exactly (alpha=0)', () => {
  const core = new CubeCore(64);
  const easterEgg = require('../src/effects/easterEgg');
  const img1 = fs.readFileSync(path.join(__dirname, '../src/effects/easterEgg/img1.bin'));
  easterEgg(core, 0.001);
  const led = core.faceMap[0][32 * 64 + 32]; // center pixel - not shared with other faces
  const pi = (32 * 64 + 32) * 3;
  assert.ok(Math.abs(core.colBuf[led * 3] - img1[pi] / 255) < 1e-5);
  assert.ok(Math.abs(core.colBuf[led * 3 + 1] - img1[pi + 1] / 255) < 1e-5);
  assert.ok(Math.abs(core.colBuf[led * 3 + 2] - img1[pi + 2] / 255) < 1e-5);
});
test('runs a full 36s cycle without throwing, stays in valid range', () => {
  const core = new CubeCore(64);
  delete require.cache[require.resolve('../src/effects/easterEgg')];
  const easterEgg = require('../src/effects/easterEgg');
  for (let i = 0; i < 36 * 30; i++) easterEgg(core, 1 / 30);
  for (const v of core.colBuf) {
    assert.ok(Number.isFinite(v), `non-finite ${v}`);
    assert.ok(v >= 0 && v <= 1.01, `out of range ${v}`);
  }
});
test('shown identically on all 6 faces (same crossfade state)', () => {
  const core = new CubeCore(64);
  delete require.cache[require.resolve('../src/effects/easterEgg')];
  const easterEgg = require('../src/effects/easterEgg');
  for (let i = 0; i < 17 * 30; i++) easterEgg(core, 1 / 30); // mid-crossfade
  const centerVals = [];
  for (let face = 0; face < 6; face++) {
    const led = core.faceMap[face][32 * 64 + 32];
    centerVals.push([core.colBuf[led * 3], core.colBuf[led * 3 + 1], core.colBuf[led * 3 + 2]]);
  }
  for (let f = 1; f < 6; f++) {
    for (let c = 0; c < 3; c++) {
      assert.ok(Math.abs(centerVals[f][c] - centerVals[0][c]) < 1e-4, `face ${f} channel ${c} differs from face 0`);
    }
  }
});

if (process.exitCode) {
  console.log('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll easterEgg tests passed');
}
