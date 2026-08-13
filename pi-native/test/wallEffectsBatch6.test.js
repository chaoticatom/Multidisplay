// Smoke tests for the sixth batch of wall-mode effects: maze, tron, cam
// (see gradientWashWall.js/wallEffectsBatch1-5.test.js for the established
// pattern this follows). All three already had a `core.panelMode==='2d'`
// single-flat-panel branch in their cube-mode source, so this batch is a
// more direct generalisation than most - see mazeWall.js/tronWall.js/
// camWall.js's module comments for the reasoning (maze's grid-density
// choice, tron's simplified wall-native movement helper, cam's "single
// continuous image" shape borrowed from coinflipWall.js/diceWall.js).
//
// maze/tron are real gameplay simulations that need many ticks to develop
// structure (corridors explored, bike trails), so those run 100-300+
// ticks before asserting. tron also gets a longer stress-tick run (500+
// ticks, several bikes) to confirm the AI decision loop (tronDecide/
// tronFloodFill's wall-native non-allocating rewrite) stays fast - this is
// exactly the effect that just got a serious perf bug fixed for this kind
// of per-tick AI cost, so this test's timing assertion exists specifically
// to catch a regression back to an allocating/unbounded flood-fill.
const assert = require('assert');
const http = require('http');
const { CubeCore } = require('../src/core');
const { Jimp } = require('jimp');
const effectMazeWall = require('../src/effects/mazeWall');
const effectTronWall = require('../src/effects/tronWall');
const effectCamWall = require('../src/effects/camWall');
const { getStatus: camGetStatus } = effectCamWall;

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

function assertFiniteThroughout(core) {
  for (let i = 0; i < core.wallBuf.length; i++) {
    assert.ok(Number.isFinite(core.wallBuf[i]), 'expected finite wallBuf value at ' + i);
  }
}

function assertFiniteAndNonZero(core) {
  assertFiniteThroughout(core);
  assert.ok(core.wallBuf.some((v) => v !== 0), 'expected the effect to have drawn something');
}

async function main() {
  // ── maze ──
  await test('mazeWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectMazeWall(core, 0.05);
  });

  await test('mazeWall builds a maze structure spanning the full wallW x wallH grid, not just SIZE', () => {
    const core = makeWallCore();
    for (let i = 0; i < 30; i++) effectMazeWall(core, 0.1);
    // Reach into the module for a structural check would require exporting
    // internals we don't want to add just for tests; instead confirm the
    // maze genuinely occupies pixels across the full 128-wide canvas (not
    // just a SIZE=64-wide region left over from a naive single-face port)
    // by checking both halves of the canvas carry open-corridor content.
    let sawLeft = false, sawRight = false;
    for (let y = 0; y < core.wallH; y++) {
      for (let x = 0; x < core.wallW; x++) {
        const o = (y * core.wallW + x) * 3;
        const bright = core.wallBuf[o] + core.wallBuf[o + 1] + core.wallBuf[o + 2];
        if (bright > 0.01) { if (x < core.wallW / 2) sawLeft = true; else sawRight = true; }
      }
    }
    assert.ok(sawLeft && sawRight, 'expected the maze to draw content across both halves of the 128x64 wall canvas');
  });

  await test('mazeWall runners explore and finite/non-zero holds over many ticks', () => {
    const core = makeWallCore();
    core.effectOptions = { maze: { runners: 4 } };
    for (let i = 0; i < 250; i++) {
      effectMazeWall(core, 0.15);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
  });

  await test('mazeWall honours newMaze token to force an immediate rebuild', () => {
    const core = makeWallCore();
    core.effectOptions = { maze: { newMaze: 1 } };
    for (let i = 0; i < 10; i++) effectMazeWall(core, 0.1);
    core.effectOptions = { maze: { newMaze: 2 } };
    for (let i = 0; i < 10; i++) effectMazeWall(core, 0.1);
    assertFiniteAndNonZero(core);
  });

  // ── tron ──
  await test('tronWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectTronWall(core, 0.05);
  });

  await test('tronWall bikes race and leave trails spanning the full wallW x wallH canvas', () => {
    const core = makeWallCore();
    core.effectOptions = { tron: { bikes: 4, speed: 3 } };
    for (let i = 0; i < 200; i++) {
      effectTronWall(core, 0.05);
      assertFiniteThroughout(core);
    }
    assertFiniteAndNonZero(core);
    // Continuity check: trails/heads should appear on both halves of the
    // stitched canvas over the course of the run, not just one 64-wide panel.
    let sawLeft = false, sawRight = false;
    for (let i = 0; i < 100; i++) {
      effectTronWall(core, 0.05);
      for (let y = 0; y < core.wallH; y++) {
        for (let x = 0; x < core.wallW; x++) {
          const o = (y * core.wallW + x) * 3;
          const bright = core.wallBuf[o] + core.wallBuf[o + 1] + core.wallBuf[o + 2];
          if (bright > 0.15) { if (x < core.wallW / 2) sawLeft = true; else sawRight = true; }
        }
      }
    }
    assert.ok(sawLeft && sawRight, 'expected bike activity across both halves of the 128x64 wall canvas');
  });

  await test('tronWall border walls are always active (edges marked, no wrap)', () => {
    const core = makeWallCore();
    core.effectOptions = { tron: { bikes: 2 } };
    effectTronWall(core, 0.05);
    // top/bottom/left/right edge rows/cols should be the red border colour
    const edge = (x, y) => {
      const o = (y * core.wallW + x) * 3;
      return core.wallBuf[o] > 0.5 && core.wallBuf[o + 1] < 0.2 && core.wallBuf[o + 2] < 0.2;
    };
    assert.ok(edge(0, 0), 'expected top-left corner to be a red border wall pixel');
    assert.ok(edge(core.wallW - 1, core.wallH - 1), 'expected bottom-right corner to be a red border wall pixel');
  });

  await test('tronWall stress test: 500+ ticks with several bikes completes without throwing and stays fast', () => {
    const core = makeWallCore();
    core.effectOptions = { tron: { bikes: 8, speed: 4 } };
    const start = Date.now();
    for (let i = 0; i < 550; i++) {
      effectTronWall(core, 0.05);
    }
    const elapsedMs = Date.now() - start;
    assertFiniteAndNonZero(core);
    console.log(`    (tronWall: 550 ticks, 8 bikes, 128x64 wall took ${elapsedMs}ms, ${(elapsedMs / 550).toFixed(2)}ms/tick)`);
    // Generous ceiling - this exists to catch a regression back to an
    // allocating/unbounded flood-fill (the exact bug tronMoveFast/
    // tronFloodFill's non-allocating rewrite fixed on the cube side, see
    // tron.js's module comment), not to pin an exact perf number.
    assert.ok(elapsedMs < 15000, `expected 550 ticks of tronWall to complete well under 15s, took ${elapsedMs}ms`);
  });

  await test('tronWall honours newGame token to force an immediate reset', () => {
    const core = makeWallCore();
    core.effectOptions = { tron: { bikes: 3, newGame: 1 } };
    for (let i = 0; i < 10; i++) effectTronWall(core, 0.05);
    core.effectOptions = { tron: { bikes: 3, newGame: 2 } };
    for (let i = 0; i < 10; i++) effectTronWall(core, 0.05);
    assertFiniteAndNonZero(core);
  });

  // ── cam ──
  await test('camWall no URL configured: stays black across several ticks, never throws', () => {
    const core = makeWallCore();
    core.effectOptions = { cam: {} };
    for (let i = 0; i < 10; i++) effectCamWall(core, 1 / 30);
    assertFiniteThroughout(core);
    assert.ok(core.wallBuf.every((v) => v === 0), 'expected all-black wallBuf before any successful fetch');
  });

  await test('camWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { cam: { url: 'http://127.0.0.1:1/nope' } };
    effectCamWall(core, 0.05);
  });

  await test('camWall unreachable URL: fetch failure does not throw and surfaces an error status', async () => {
    const core = makeWallCore();
    core.effectOptions = { cam: { url: 'http://127.0.0.1:1/nope', rate: 5 } };
    for (let i = 0; i < 5; i++) effectCamWall(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 5; i++) effectCamWall(core, 1 / 30);
    assertFiniteThroughout(core);
    assert.ok(camGetStatus().startsWith('Error'), `expected an Error status, got "${camGetStatus()}"`);
  });

  await test('camWall local HTTP fetch: decode+resize stretched as one continuous image across the wall', async () => {
    const img = new Jimp({ width: 20, height: 20, color: 0x00ff00ff }); // solid green
    const pngBuf = await img.getBuffer('image/png');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(pngBuf);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const core = makeWallCore();
    core.effectOptions = { cam: { url: `http://127.0.0.1:${port}/snap`, rate: 15 } };
    effectCamWall(core, 1 / 30);
    // wait for the async fetch/decode/resize to land
    for (let i = 0; i < 50 && !core.wallBuf.some((v) => v > 0); i++) {
      await new Promise((r) => setTimeout(r, 20));
      effectCamWall(core, 1 / 30);
    }
    await new Promise((resolve) => server.close(resolve));

    assertFiniteAndNonZero(core);
    // Solid green source image -> every occupied wall pixel should be ~green
    let checked = 0;
    for (let y = 0; y < core.wallH; y += 4) {
      for (let x = 0; x < core.wallW; x += 4) {
        const o = (y * core.wallW + x) * 3;
        assert.ok(core.wallBuf[o] < 0.2, `expected low red at (${x},${y}), got ${core.wallBuf[o]}`);
        assert.ok(core.wallBuf[o + 1] > 0.8, `expected high green at (${x},${y}), got ${core.wallBuf[o + 1]}`);
        checked++;
      }
    }
    assert.ok(checked > 0, 'expected to have sampled at least one pixel');
    assert.ok(camGetStatus().startsWith('Live'), `expected a Live status, got "${camGetStatus()}"`);
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll wall-effects batch 6 tests passed');
  }
  process.exit(process.exitCode || 0);
}

main();
