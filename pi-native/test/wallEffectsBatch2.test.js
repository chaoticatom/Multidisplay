// Smoke tests for the third batch of wall-mode effects: wave, plasma,
// aurora, nebula, warp, rain (see gradientWashWall.js/wallEffectsBatch1.test.js
// for the established pattern this follows). For each: build a 2-panel
// (128x64) wall canvas via a non-trivial layout, run several ticks, assert
// wallBuf stays finite throughout and isn't left all-zero, and assert the
// right-hand panel (x>=64) can genuinely differ from the left-hand panel
// (x<64) at the same tick - proving one continuous stitched image, not two
// copies of the same 64x64 frame.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectWaveWall = require('../src/effects/waveWall');
const effectPlasmaWall = require('../src/effects/plasmaWall');
const effectAuroraWall = require('../src/effects/auroraWall');
const effectNebulaWall = require('../src/effects/nebulaWall');
const effectWarpWall = require('../src/effects/warpWall');
const effectRainWall = require('../src/effects/rainWall');

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
  await test('waveWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectWaveWall(core, 0.05);
  });

  await test('waveWall renders a continuous ripple across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectWaveWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('plasmaWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectPlasmaWall(core, 0.05);
  });

  await test('plasmaWall renders a continuous field across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectPlasmaWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('auroraWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectAuroraWall(core, 0.05);
  });

  await test('auroraWall renders a continuous curtain (or starfield) across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 30; i++) effectAuroraWall(core, 0.05);
    assertFiniteAndNonZero(core);
    // Aurora is mostly dark background + bright curtain streaks, so instead
    // of asserting one fixed pixel pair differs (both could land on
    // background), scan a horizontal strip for at least one left/right
    // pair that differs, proving it's one continuous image not a tiled copy.
    let sawDiff = false;
    for (let y = 0; y < core.wallH; y += 4) {
      const left = pixelAt(core, 10, y);
      const right = pixelAt(core, 100, y);
      if (left[0] !== right[0] || left[1] !== right[1] || left[2] !== right[2]) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('nebulaWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectNebulaWall(core, 0.05);
  });

  await test('nebulaWall renders a continuous cloud field across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 10; i++) effectNebulaWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('warpWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectWarpWall(core, 0.05);
  });

  await test('warpWall renders stars flying outward across the stitched wall canvas, finite throughout', () => {
    const core = makeWallCore();
    let sawNonZero = false;
    for (let i = 0; i < 60; i++) {
      effectWarpWall(core, 0.05);
      for (let j = 0; j < core.wallBuf.length; j++) {
        assert.ok(Number.isFinite(core.wallBuf[j]), 'expected finite wallBuf value');
        if (core.wallBuf[j] !== 0) sawNonZero = true;
      }
    }
    assert.ok(sawNonZero, 'expected warp stars to have drawn something over time');
    // With stars flying outward from the canvas's own center (not
    // projected per-face), the right panel should show different star
    // positions/brightness than the left panel at the same tick.
    let sawDiff = false;
    for (let y = 0; y < core.wallH; y += 2) {
      const left = pixelAt(core, 10, y);
      const right = pixelAt(core, 100, y);
      if (left[0] !== right[0] || left[1] !== right[1] || left[2] !== right[2]) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('rainWall (colour style) does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectRainWall(core, 0.05);
  });

  await test('rainWall (colour style) renders one continuous storm across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 100; i++) effectRainWall(core, 0.05);
    assertFiniteAndNonZero(core);
    // Randomized drop columns mean any single fixed left/right pixel pair
    // could coincidentally match on a given tick - sum whole left/right
    // halves instead, which will only match if the storm is literally
    // mirrored (i.e. tiled per-panel rather than one continuous canvas).
    let sumLeft = 0, sumRight = 0;
    for (let y = 0; y < core.wallH; y++) {
      for (let x = 0; x < core.wallW / 2; x++) sumLeft += pixelAt(core, x, y).reduce((a, b) => a + b, 0);
      for (let x = core.wallW / 2; x < core.wallW; x++) sumRight += pixelAt(core, x, y).reduce((a, b) => a + b, 0);
    }
    assert.notStrictEqual(sumLeft, sumRight, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('rainWall (matrix style) renders streams across the full wallW, finite throughout', () => {
    const core = makeWallCore();
    core.effectOptions = { rain: { style: 'matrix' } };
    let sawNonZero = false;
    for (let i = 0; i < 40; i++) {
      effectRainWall(core, 0.05);
      for (let j = 0; j < core.wallBuf.length; j++) {
        assert.ok(Number.isFinite(core.wallBuf[j]), 'expected finite wallBuf value');
        if (core.wallBuf[j] !== 0) sawNonZero = true;
      }
    }
    assert.ok(sawNonZero, 'expected matrix rain to have drawn something over time');
    let sawDiff = false;
    for (let y = 0; y < core.wallH; y++) {
      const left = pixelAt(core, 10, y);
      const right = pixelAt(core, 100, y);
      if (left[0] !== right[0] || left[1] !== right[1] || left[2] !== right[2]) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 2 tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
