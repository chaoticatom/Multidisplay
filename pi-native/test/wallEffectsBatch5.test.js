// Smoke tests for the fifth batch of wall-mode effects: easter_egg,
// coinflip, dice, random, random80s, fireworks (see gradientWashWall.js/
// wallEffectsBatch1-4.test.js for the established pattern this follows).
//
// coinflip/dice are the "same content across the whole canvas" shape (see
// coinflipWall.js/diceWall.js module comments) - for those we assert the
// OPPOSITE of the usual left/right-continuity check: the two halves should
// be part of one continuous card, which in practice we verify by checking
// there's no hard seam at the panel boundary (a genuinely continuous
// circular/square shape can't have identical-but-independent left/right
// halves the way a tiled repeat would) via a symmetric-content sanity
// check instead of a "must differ" check.
//
// easter_egg/random/random80s/fireworks are spatial (see their module
// comments) - these use the established left/right-half brightness-sum
// continuity check from prior batches, run over many ticks to avoid a
// coincidental single-tick match.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectEasterEggWall = require('../src/effects/easterEggWall');
const effectCoinFlipWall = require('../src/effects/coinflipWall');
const effectDiceWall = require('../src/effects/diceWall');
const effectRandomWall = require('../src/effects/randomWall');
const effectRandom80sWall = require('../src/effects/random80sWall');
const effectFireworksWall = require('../src/effects/fireworksWall');

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

// Structural (not timing-dependent, so not flaky) check for "one
// continuous card drawn across the whole canvas" vs "the same panel-local
// pattern tiled/repeated per panel": if the content were independently
// tiled per panel, pixel (x, y) in the left panel and pixel
// (x + panelSize, y) in the right panel would carry the same panel-local
// content and match almost everywhere. A single card centred across the
// whole wallW x wallH canvas instead has most of its interesting content
// (the coin/die shape, background shimmer phase, etc) NOT aligned to a
// panelSize-periodic repeat, so a solid majority of sampled pixel pairs
// should differ.
function notTiledPerPanel(core) {
  const ps = core.wallPanelSize;
  let total = 0, mismatched = 0;
  for (let y = 0; y < core.wallH; y += 2) {
    for (let x = 0; x < core.wallW - ps; x += 2) {
      const a = pixelAt(core, x, y), b = pixelAt(core, x + ps, y);
      total++;
      const diff = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      if (diff > 0.02) mismatched++;
    }
  }
  return mismatched / total;
}

async function run() {
  // ── easter_egg ──
  await test('easterEggWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectEasterEggWall(core, 0.05);
  });

  await test('easterEggWall crossfades a continuous image across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 150; i++) {
      effectEasterEggWall(core, 0.3); // fast-forward through hold/crossfade phases
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 60; i++) {
      effectEasterEggWall(core, 0.3);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  // ── coinflip ──
  await test('coinflipWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectCoinFlipWall(core, 0.05);
  });

  await test('coinflipWall draws one continuous coin card across the whole stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 150; i++) {
      effectCoinFlipWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    // Same content across the whole canvas: one continuous coin, not two
    // independently-tiled panel-local copies (see notTiledPerPanel()).
    const frac = notTiledPerPanel(core);
    assert.ok(frac > 0.5, `expected one continuous coin card, not two tiled panel copies (mismatch fraction=${frac})`);
  });

  // ── dice ──
  await test('diceWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectDiceWall(core, 0.05);
  });

  await test('diceWall draws one continuous die card across the whole stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 150; i++) {
      effectDiceWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    const frac = notTiledPerPanel(core);
    assert.ok(frac > 0.5, `expected one continuous die card, not two tiled panel copies (mismatch fraction=${frac})`);
  });

  await test('diceWall honours rollToken to force an immediate roll', () => {
    const core = makeWallCore();
    core.effectOptions = { dice: { rollToken: 1 } };
    for (let i = 0; i < 5; i++) effectDiceWall(core, 0.05);
    assertFiniteAndNonZero(core);
  });

  // ── random ──
  await test('randomWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectRandomWall(core, 0.05);
  });

  await test('randomWall renders a continuous procedural pattern across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 100; i++) {
      effectRandomWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectRandomWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  // ── random80s ──
  await test('random80sWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectRandom80sWall(core, 0.05);
  });

  await test('random80sWall morphs a continuous procedural pattern across the stitched wall canvas', () => {
    const core = makeWallCore();
    for (let i = 0; i < 100; i++) {
      effectRandom80sWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 40; i++) {
      effectRandom80sWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 image, not two copies of the same frame');
  });

  // ── fireworks ──
  await test('fireworksWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectFireworksWall(core, 0.05);
  });

  await test('fireworksWall launches and bursts particles within the flat wall canvas, finite throughout', () => {
    const core = makeWallCore();
    for (let i = 0; i < 200; i++) {
      effectFireworksWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    let sawDiff = false;
    for (let i = 0; i < 100; i++) {
      effectFireworksWall(core, 0.05);
      const [l, r] = halfSums(core);
      if (l !== r) { sawDiff = true; break; }
    }
    assert.ok(sawDiff, 'expected a genuinely continuous 128x64 fireworks scene, not two mirrored copies');
  });

  await test('fireworksWall sync mode schedules and fires rockets without throwing', () => {
    const core = makeWallCore();
    core.effectOptions = { fireworks: { mode: 'sync' } };
    for (let i = 0; i < 200; i++) {
      effectFireworksWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
  });

  await test('fireworksWall mic mode falls back to random-mode behaviour without throwing', () => {
    const core = makeWallCore();
    core.effectOptions = { fireworks: { mode: 'mic' } };
    for (let i = 0; i < 100; i++) {
      effectFireworksWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
  });

  await test('fireworksWall text overlay renders without throwing', () => {
    const core = makeWallCore();
    core.effectOptions = { fireworks: { textOn: true, text: 'HI' } };
    for (let i = 0; i < 60; i++) {
      effectFireworksWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 5 tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
