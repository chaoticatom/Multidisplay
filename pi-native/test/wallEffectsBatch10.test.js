// Smoke tests for the tenth (final) batch of wall-mode effects: retro,
// radio - see wallEffectsBatch1-9.test.js for the established pattern.
//
// retro: no network, no audio - just runs the mosaic-tiled game render for
// several ticks and checks content spans past x=64 (mirrors retro.test.js's
// non-existence: this project doesn't have a cube-mode retro.test.js
// either, so this is the first automated coverage of the retro pixel path
// at all).
//
// radio: mirrors radio.test.js's approach of writing synthetic band data
// directly rather than spinning up real ffmpeg (no such binary in this
// sandbox - see radio.test.js's module comment). Since radioWall.js reads
// the SAME audio instance radio.js exports (module.exports.audio), tests
// write synthetic spec/peak values directly into that shared instance
// instead of going through decode.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectRetroWall = require('../src/effects/retroWall');
const effectRadioWall = require('../src/effects/radioWall');
const radioEffect = require('../src/effects/radio/radio');

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
  core.t = 0;
  core.speedMult = 1;
  core.effectOptions = {};
  return core;
}

function assertFiniteThroughout(core) {
  for (let i = 0; i < core.wallBuf.length; i++) {
    assert.ok(Number.isFinite(core.wallBuf[i]), 'expected finite wallBuf value at ' + i);
  }
}
function assertFiniteAndNonZero(core) {
  assertFiniteThroughout(core);
  assert.ok(core.wallBuf.some((v) => v !== 0), 'expected the effect to have drawn something');
}
// Sum of brightness in the columns at/after x=64 (the second panel) - proves
// content genuinely spans the full wall width, not just the first 64px panel.
function pastX64Sum(core) {
  const { wallW: W, wallH: H, wallBuf: buf } = core;
  let sum = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 64; x < W; x++) {
      const o = (y * W + x) * 3;
      sum += buf[o] + buf[o + 1] + buf[o + 2];
    }
  }
  return sum;
}

async function main() {
  // ── retro ──
  test('retroWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { retro: {} };
    effectRetroWall(core, 0.05);
  });

  test('retroWall: auto-rotate mode tiles a game mosaic spanning the full wall width', () => {
    const core = makeWallCore();
    core.effectOptions = { retro: {} };
    let maxPastX64 = 0;
    for (let i = 0; i < 200; i++) {
      effectRetroWall(core, 1 / 20);
      assertFiniteThroughout(core);
      maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
    }
    assertFiniteAndNonZero(core);
    assert.ok(maxPastX64 > 0, 'expected tiled game pixels past x=64, not crammed into the first panel');
  });

  test('retroWall: pinned single game (jetpac, idx 0) also renders across the whole wall', () => {
    const core = makeWallCore();
    core.effectOptions = { retro: { selectedGame: 0 } };
    for (let i = 0; i < 150; i++) effectRetroWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    assert.ok(pastX64Sum(core) > 0, 'expected pinned game content past x=64');
  });

  test('retroWall: multiple different games in rotation all render without throwing/NaN', () => {
    const core = makeWallCore();
    core.effectOptions = { retro: { rotate: 0.5, autoGames: [0, 1, 2, 3, 6, 9, 10, 12, 13] } };
    for (let i = 0; i < 400; i++) {
      effectRetroWall(core, 1 / 15);
      assertFiniteThroughout(core);
    }
  });

  // ── radio ──
  function seedSyntheticAudio() {
    for (let b = 0; b < radioEffect.audio.spec.length; b++) {
      radioEffect.audio.spec[b] = 0.2 + 0.7 * Math.random();
      radioEffect.audio.peak[b] = Math.min(1, radioEffect.audio.spec[b] + 0.1);
    }
  }

  test('radioWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { radio: {} };
    effectRadioWall(core, 0.05);
  });

  test('radioWall: spectrum off + nothing playing stays a blank finite canvas', () => {
    const core = makeWallCore();
    core.effectOptions = { radio: { spectrumOn: false } };
    for (let i = 0; i < 10; i++) effectRadioWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  const stylesToTest = ['bars', 'mirror', 'dots', 'radial', 'tunnel', 'fire'];
  for (const style of stylesToTest) {
    test(`radioWall: spectrum style "${style}" renders finite content spanning the full wall width`, () => {
      seedSyntheticAudio();
      const core = makeWallCore();
      core.effectOptions = { radio: { spectrumOn: true, bands: 64, style, theme: 6 } };
      let maxPastX64 = 0;
      for (let i = 0; i < 60; i++) {
        seedSyntheticAudio();
        effectRadioWall(core, 1 / 20);
        assertFiniteThroughout(core);
        maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
      }
      assertFiniteAndNonZero(core);
      assert.ok(maxPastX64 > 0, `${style}: expected spectrum content past x=64, not crammed into the first panel`);
    });
  }

  test('radioWall: now-playing ticker scrolls across the whole wall width while a station plays', () => {
    seedSyntheticAudio();
    const core = makeWallCore();
    core.effectOptions = { radio: { spectrumOn: false } };
    radioEffect.playStation({ name: 'Test Station With A Long Name', genre: 'Testing Genre', url: 'http://example.invalid/stream' });
    let maxPastX64 = 0;
    for (let i = 0; i < 300; i++) {
      effectRadioWall(core, 1 / 15);
      assertFiniteThroughout(core);
      maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
    }
    radioEffect.stopStation();
    assertFiniteAndNonZero(core);
    assert.ok(maxPastX64 > 0, 'expected ticker glyphs past x=64 at some point during the scroll');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll wall effects batch 10 tests passed');
  }
}

main();
