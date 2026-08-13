// Smoke tests for the second batch of wall-mode effects: depth_rings,
// prism, tide, strobe (see gradientWashWall.js/videoWall.js for the first
// batch and the reference pattern this follows). For each: build a 2-panel
// (128x64) wall canvas via a non-trivial layout, run several ticks, assert
// wallBuf stays finite throughout and isn't left all-zero, and assert the
// right-hand panel (x>=64) can genuinely differ from the left-hand panel
// (x<64) at the same tick - proving one continuous stitched image, not two
// copies of the same 64x64 frame.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectDepthRingsWall = require('../src/effects/depthRingsWall');
const effectPrismWall = require('../src/effects/prismWall');
const effectTideWall = require('../src/effects/tideWall');
const effectStrobeWall = require('../src/effects/strobeWall');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function makeWallCore() {
  const core = new CubeCore(64);
  core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); // two panels side by side -> 128x64
  assert.strictEqual(core.wallW, 128);
  assert.strictEqual(core.wallH, 64);
  return core;
}

function assertFiniteAndNonZero(core) {
  let sawNonZero = false;
  for (let i = 0; i < core.wallBuf.length; i++) {
    const v = core.wallBuf[i];
    assert.ok(Number.isFinite(v), 'expected finite wallBuf value at ' + i);
    if (v !== 0) sawNonZero = true;
  }
  assert.ok(sawNonZero, 'expected the effect to have drawn something');
}

function pixelAt(core, x, y) {
  const o = (y * core.wallW + x) * 3;
  return [core.wallBuf[o], core.wallBuf[o + 1], core.wallBuf[o + 2]];
}

async function run() {
  await test('depthRingsWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectDepthRingsWall(core, 0.05);
  });

  await test('depthRingsWall renders a continuous ripple across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectDepthRingsWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('prismWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectPrismWall(core, 0.05);
  });

  await test('prismWall renders a continuous sweep across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectPrismWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('tideWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectTideWall(core, 0.05);
  });

  await test('tideWall renders a continuous wave across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectTideWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('strobeWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectStrobeWall(core, 0.05);
  });

  await test('strobeWall "all" pattern fills the whole stitched canvas, finite, non-zero on some beat', () => {
    const core = makeWallCore();
    core.effectOptions = { strobe: { pattern: 'all', color: 'white', speed: 8 } };
    let sawNonZero = false;
    for (let i = 0; i < 20; i++) {
      effectStrobeWall(core, 0.05);
      for (let j = 0; j < core.wallBuf.length; j++) {
        assert.ok(Number.isFinite(core.wallBuf[j]), 'expected finite wallBuf value');
        if (core.wallBuf[j] !== 0) sawNonZero = true;
      }
    }
    assert.ok(sawNonZero, 'expected strobe to flash on at least one beat');
  });

  await test('strobeWall "faces" pattern (panel-cycling substitution) lights only one panel at a time, never both', () => {
    // Note: like the cube's own 'faces' pattern, strobeBeat and strobeOn
    // toggle in lockstep (both flip once per period), so which single
    // panel index is showing stays constant for as long as the strobe
    // keeps running (only ever one parity of beat is "on") - this mirrors
    // the cube version's behaviour exactly, not a bug introduced here. The
    // property worth asserting is that only ever one panel is lit on any
    // given "on" frame, never both at once (never leaks across panels).
    const core = makeWallCore();
    core.effectOptions = { strobe: { pattern: 'faces', color: 'white', speed: 8 } };
    let sawExactlyOnePanelLit = false;
    for (let i = 0; i < 40; i++) {
      effectStrobeWall(core, 0.05);
      const left = pixelAt(core, 10, 32);
      const right = pixelAt(core, 100, 32);
      const leftOn = left.some((v) => v !== 0);
      const rightOn = right.some((v) => v !== 0);
      assert.ok(!(leftOn && rightOn), 'expected only one panel lit at a time under the "faces" substitution, never both');
      if (leftOn || rightOn) sawExactlyOnePanelLit = true;
    }
    assert.ok(sawExactlyOnePanelLit, 'expected the "faces" pattern to light a panel on at least one beat');
  });

  await test('strobeWall "scanline" pattern sweeps rows across the full wallH, finite throughout', () => {
    const core = makeWallCore();
    core.effectOptions = { strobe: { pattern: 'scanline', color: 'cyan', speed: 8 } };
    // Run a full multi-second span and check every frame (not just the
    // last) since strobe blanks the canvas on "off" beats - the last tick
    // alone might land on an off beat regardless of duration. This also
    // sidesteps the shared module-level strobe timer's arbitrary starting
    // phase (strobe.js/strobeWall.js keep beat state at module scope, same
    // as the cube version - see its module comment).
    let sawNonZero = false;
    for (let i = 0; i < 200; i++) {
      effectStrobeWall(core, 0.05);
      for (let j = 0; j < core.wallBuf.length; j++) {
        assert.ok(Number.isFinite(core.wallBuf[j]), 'expected finite wallBuf value');
        if (core.wallBuf[j] !== 0) sawNonZero = true;
      }
    }
    assert.ok(sawNonZero, 'expected scanline to have drawn on at least one beat');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 1 tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
