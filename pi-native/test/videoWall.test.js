// Smoke tests for videoWall.js - the wall-mode counterpart to video.js
// (see that file's module comment: same effectOptions.video.* fields,
// decodes straight to the full stitched wallW x wallH canvas instead of
// per cube face). No real ffmpeg involved here - with no url set,
// FfmpegSource.ensure() never spawns a process, so this only exercises
// the "no frame yet" placeholder path and the wallW/wallH plumbing, same
// scope as gradientWashWall's lack of its own dedicated test file (no
// existing precedent for mocking ffmpeg's subprocess in this suite).
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectVideoWall = require('../src/effects/videoWall');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function run() {
  await test('does nothing (no throw) before initWall() has run', () => {
    const core = new CubeCore(64);
    core.effectOptions = { video: { url: '' } };
    effectVideoWall(core, 0.05);
  });

  await test('renders the waiting placeholder across the full stitched wall canvas, no NaN', () => {
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); // two panels side by side -> 128x64
    assert.strictEqual(core.wallW, 128);
    assert.strictEqual(core.wallH, 64);
    core.effectOptions = { video: { url: '' } };
    for (let i = 0; i < 5; i++) effectVideoWall(core, 0.05);
    let sawNonZero = false;
    for (let i = 0; i < core.wallBuf.length; i++) {
      const v = core.wallBuf[i];
      assert.ok(Number.isFinite(v), 'expected finite wallBuf value at ' + i);
      if (v > 0) sawNonZero = true;
    }
    assert.ok(sawNonZero, 'expected the pulsing placeholder to have written something');
  });

  await test('a right-side panel (gx=1) is addressable and independent of the left panel', () => {
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
    core.setWallPixel(10, 10, 1, 0, 0);
    core.setWallPixel(70, 10, 0, 1, 0);
    const leftIdx = (10 * core.wallW + 10) * 3;
    const rightIdx = (10 * core.wallW + 70) * 3;
    assert.deepStrictEqual([core.wallBuf[leftIdx], core.wallBuf[leftIdx + 1], core.wallBuf[leftIdx + 2]], [1, 0, 0]);
    assert.deepStrictEqual([core.wallBuf[rightIdx], core.wallBuf[rightIdx + 1], core.wallBuf[rightIdx + 2]], [0, 1, 0]);
  });

  await test('getStatus() reports "No source" with an empty url', () => {
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }], 64);
    core.effectOptions = { video: { url: '' } };
    effectVideoWall(core, 0.05);
    assert.strictEqual(effectVideoWall.getStatus(), 'No source');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoWall tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
