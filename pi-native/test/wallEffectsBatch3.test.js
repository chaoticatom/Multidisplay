// Smoke tests for the fourth batch of wall-mode effects (the remaining
// "Motion & Particles" ports): dna, lightning, lightspeed, sphere (see
// gradientWashWall.js/wallEffectsBatch1.test.js for the established pattern
// this follows). For each: build a 2-panel (128x64) wall canvas via a
// non-trivial layout, run several ticks, assert wallBuf stays finite
// throughout and isn't left all-zero, and assert the right-hand panel
// (x>=64) genuinely differs from the left-hand panel (x<64) - proving one
// continuous stitched image, not two copies of the same 64x64 frame.
// lightning/lightspeed are bursty/sparse (random strike timing, racers
// that take time to build a trail) so those run 60-120 ticks rather than
// risking a flaky low-tick-count check.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectDNAWall = require('../src/effects/dnaWall');
const effectLightningWall = require('../src/effects/lightningWall');
const effectLightspeedWall = require('../src/effects/lightspeedWall');
const effectSphereWall = require('../src/effects/sphereWall');

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

function assertFiniteThroughout(core) {
  for (let i = 0; i < core.wallBuf.length; i++) {
    assert.ok(Number.isFinite(core.wallBuf[i]), 'expected finite wallBuf value at ' + i);
  }
}

function pixelAt(core, x, y) {
  const o = (y * core.wallW + x) * 3;
  return [core.wallBuf[o], core.wallBuf[o + 1], core.wallBuf[o + 2]];
}

function halfSums(core) {
  let sumLeft = 0, sumRight = 0;
  for (let y = 0; y < core.wallH; y++) {
    for (let x = 0; x < core.wallW / 2; x++) sumLeft += pixelAt(core, x, y).reduce((a, b) => a + b, 0);
    for (let x = core.wallW / 2; x < core.wallW; x++) sumRight += pixelAt(core, x, y).reduce((a, b) => a + b, 0);
  }
  return [sumLeft, sumRight];
}

async function run() {
  await test('dnaWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectDNAWall(core, 0.05);
  });

  await test('dnaWall renders a continuous double helix across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 20; i++) effectDNAWall(core, 0.05);
    assertFiniteAndNonZero(core);
    const left = pixelAt(core, 10, 32);
    const right = pixelAt(core, 100, 32);
    assert.notDeepStrictEqual(left, right, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('lightningWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectLightningWall(core, 0.05);
  });

  await test('lightningWall renders bolts across the stitched wall canvas, finite throughout, over many ticks', () => {
    const core = makeWallCore();
    let sawNonZero = false;
    for (let i = 0; i < 120; i++) {
      effectLightningWall(core, 0.05);
      assertFiniteThroughout(core);
      for (let j = 0; j < core.wallBuf.length; j++) {
        if (core.wallBuf[j] !== 0) { sawNonZero = true; break; }
      }
    }
    assert.ok(sawNonZero, 'expected lightning to have drawn something over time');
    // Storm background alone is uniform, so a left/right sum difference
    // over many ticks (strikes/branches land at random x positions) proves
    // one continuous canvas rather than two mirrored/tiled 64x64 frames.
    let sawDiff = false;
    for (let i = 0; i < 60; i++) {
      effectLightningWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('lightspeedWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectLightspeedWall(core, 0.05);
  });

  await test('lightspeedWall renders racer trails across the stitched wall canvas, finite throughout, over many ticks', () => {
    const core = makeWallCore();
    core.effectOptions = { lightspeed: { speed: 8, trail: 32, size: 1, colour: 'multi', count: 4, nudge: 15 } };
    let sawNonZero = false;
    for (let i = 0; i < 100; i++) {
      effectLightspeedWall(core, 0.05);
      assertFiniteThroughout(core);
      for (let j = 0; j < core.wallBuf.length; j++) {
        if (core.wallBuf[j] !== 0) { sawNonZero = true; break; }
      }
    }
    assert.ok(sawNonZero, 'expected lightspeed racers to have drawn something over time');
    // Racer start positions/directions are randomized per reset, so a fixed
    // left/right pixel pair can coincidentally match on a given tick -
    // sum whole left/right halves over several more ticks instead, which
    // will only match if the racers are literally mirrored (i.e. tiled
    // per-panel rather than flying freely across one continuous canvas).
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectLightspeedWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('sphereWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectSphereWall(core, 0.05);
  });

  await test('sphereWall renders a continuous laser-grid perspective across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 60; i++) effectSphereWall(core, 0.05);
    assertFiniteAndNonZero(core);
    // Scan bar/rays converge on the wall's own center (not per-face), so a
    // horizontal strip scan for any differing left/right pixel pair proves
    // one continuous canvas, not a tiled/mirrored per-panel copy.
    let sawDiff = false;
    for (let y = 0; y < core.wallH; y += 2) {
      const left = pixelAt(core, 10, y);
      const right = pixelAt(core, 100, y);
      if (left[0] !== right[0] || left[1] !== right[1] || left[2] !== right[2]) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 3 tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
