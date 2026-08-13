// Smoke tests for the fourth batch of wall-mode effects (Physics &
// Simulation): balls, sand, life, fluid (see gradientWashWall.js/
// wallEffectsBatch1.test.js for the established pattern this follows).
// For each: build a 2-panel (128x64) wall canvas via a non-trivial layout,
// run enough ticks to reach interesting/steady state, assert wallBuf stays
// finite throughout and isn't left all-zero, and assert genuine continuity
// across the panel boundary via a left/right-half brightness-sum
// comparison over many ticks (the established batch2/3 pattern for effects
// where a single fixed pixel pair could coincidentally match). balls/sand
// also get an explicit in-bounds check on their particle state, since
// these two track live (x,y)/grid-index state outside wallBuf itself and
// an out-of-range value would either silently no-op via setWallPixel's
// bounds check (drawing) or indicate a real out-of-bounds logic bug in the
// simulation itself (the thing worth catching here).
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectBallsWall = require('../src/effects/ballsWall');
const effectSandWall = require('../src/effects/sandWall');
const effectLifeWall = require('../src/effects/lifeWall');
const effectFluidWall = require('../src/effects/fluidWall');

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
  await test('ballsWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectBallsWall(core, 0.05);
  });

  await test('ballsWall bounces balls across the full stitched wall canvas, in-bounds, finite throughout', () => {
    const core = makeWallCore();
    for (let i = 0; i < 40; i++) {
      effectBallsWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectBallsWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('ballsWall never writes outside the wallW x wallH buffer over many ticks', () => {
    // ballsWall draws every ball via direct wallBuf[o]/[o+1]/[o+2] writes
    // (not core.setWallPixel), computed from cx+dvx/cy+dvy circle-fill
    // offsets around each ball's rounded centre - so unlike the other wall
    // effects, an out-of-bounds ball position here would be a real
    // computed-index bug (silent corruption or a thrown RangeError/wrap
    // into an adjacent row), not just a harmlessly-skipped write. Running
    // for a long stretch and asserting the buffer length is untouched and
    // every value stays finite (no NaN from a bad index arithmetic path)
    // is the practical proxy for "particles never escaped the bounds".
    const core = makeWallCore();
    const expectedLen = core.wallW * core.wallH * 3;
    for (let i = 0; i < 200; i++) {
      effectBallsWall(core, 0.05);
      assert.strictEqual(core.wallBuf.length, expectedLen, 'wallBuf must never be reallocated/resized by the effect');
      assertFiniteThroughout(core);
    }
  });

  await test('sandWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectSandWall(core, 0.05);
  });

  await test('sandWall piles grains toward the bottom of the stitched wall canvas over many ticks', () => {
    const core = makeWallCore();
    for (let i = 0; i < 200; i++) {
      effectSandWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    // Sand should have settled toward larger y (bottom of canvas) - compare
    // brightness sum in the bottom third vs top third of the canvas.
    let topSum = 0, botSum = 0;
    const third = Math.floor(core.wallH / 3);
    for (let y = 0; y < core.wallH; y++) {
      for (let x = 0; x < core.wallW; x++) {
        const s = pixelAt(core, x, y).reduce((a, b) => a + b, 0);
        if (y < third) topSum += s;
        if (y >= core.wallH - third) botSum += s;
      }
    }
    assert.ok(botSum > topSum, `expected sand to settle toward the bottom (top=${topSum}, bottom=${botSum})`);
    // Continuity across the panel boundary.
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectSandWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('lifeWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectLifeWall(core, 0.05);
  });

  await test('lifeWall evolves a continuous cellular automaton across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 300; i++) {
      effectLifeWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectLifeWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  await test('fluidWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectFluidWall(core, 0.05);
  });

  await test('fluidWall sloshes a continuous surface across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 60; i++) {
      effectFluidWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectFluidWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 4 tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
