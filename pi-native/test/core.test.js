// Minimal assertion-based tests, no framework dependency (kept deliberately
// tiny - this is a proof-of-concept port, not asking for a full test
// harness yet). Run with `npm test`.
const assert = require('assert');
const { CubeCore, hsl, lerp } = require('../src/core');
const { EFFECTS } = require('../src/effects');

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

console.log('CubeCore');
test('64^3 shell has the expected surface LED count (64^3 - 62^3)', () => {
  const core = new CubeCore(64);
  assert.strictEqual(core.N, 64 ** 3 - 62 ** 3);
});
test('colBuf length is N*3', () => {
  const core = new CubeCore(64);
  assert.strictEqual(core.colBuf.length, core.N * 3);
});
test('faceMap has 6 faces of SIZE*SIZE entries', () => {
  const core = new CubeCore(64);
  assert.strictEqual(core.faceMap.length, 6);
  for (const f of core.faceMap) assert.strictEqual(f.length, 64 * 64);
});
test('every faceMap entry is either -1 or a valid LED index', () => {
  const core = new CubeCore(64);
  for (const f of core.faceMap) {
    for (const v of f) {
      assert.ok(v === -1 || (v >= 0 && v < core.N), `face entry ${v} out of range`);
    }
  }
});
test('setLED writes into colBuf at the right offset', () => {
  // colBuf is a Float32Array (matches the browser's colBuf) - compare with
  // tolerance, not strictEqual, since 0.1 etc. aren't exactly representable
  // in float32 (e.g. 0.1 round-trips as ~0.10000000149011612).
  const core = new CubeCore(8);
  core.setLED(5, 0.1, 0.2, 0.3);
  assert.ok(Math.abs(core.colBuf[15] - 0.1) < 1e-6);
  assert.ok(Math.abs(core.colBuf[16] - 0.2) < 1e-6);
  assert.ok(Math.abs(core.colBuf[17] - 0.3) < 1e-6);
});
test('setFaceLED out-of-range u/v is a silent no-op', () => {
  const core = new CubeCore(8);
  core.colBuf.fill(0);
  core.setFaceLED(0, -1, 0, 1, 1, 1);
  core.setFaceLED(0, 999, 0, 1, 1, 1);
  assert.ok(core.colBuf.every((v) => v === 0));
});

console.log('hsl/lerp');
test('hsl(0,0,l) is achromatic (r=g=b=l)', () => {
  const [r, g, b] = hsl(0.3, 0, 0.42);
  assert.strictEqual(r, 0.42); assert.strictEqual(g, 0.42); assert.strictEqual(b, 0.42);
});
test('lerp interpolates linearly', () => {
  assert.strictEqual(lerp(0, 10, 0.5), 5);
});

console.log('effects');
for (const [name, fn] of Object.entries(EFFECTS)) {
  test(`${name}: runs without throwing and writes finite, in-range colors`, () => {
    const core = new CubeCore(16); // small size, fast
    for (let i = 0; i < 5; i++) fn(core, 1 / 30);
    for (const v of core.colBuf) {
      assert.ok(Number.isFinite(v), `non-finite value ${v}`);
      assert.ok(v >= -0.01 && v <= 1.5, `color component ${v} looks out of plausible range`);
    }
  });
}

if (process.exitCode) {
  console.log('\nFAILED');
  process.exit(1);
} else {
  console.log('\nAll tests passed');
}
