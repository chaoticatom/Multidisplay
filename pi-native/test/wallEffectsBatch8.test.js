// Smoke tests for the eighth batch of wall-mode effects: apod, epic, iss,
// neo - see gradientWashWall.js/wallEffectsBatch1-7.test.js for the
// established pattern this follows.
//
// apod is a "single continuous image stretched across the whole wall"
// effect (camWall.js's shape) so it gets a finite/non-zero check plus a
// fetch-mock smoke test. epic is a "single centered scene" (an
// orthographic globe, celestialWall.js/ghostWall.js's shape) so it gets a
// "content lit at the true wall center, radius pinned to min(W,H)" check.
// iss and neo both generalize an existing full-canvas composition to
// wallW x wallH (iss's world-map window widens with wall aspect; neo's
// Earth+radar+ticker spans the full wall) so those get "content extends
// past x=64" / half-brightness continuity checks, same family as
// wallEffectsBatch7's weather/datetime checks.
//
// Network fetches are mocked the same way test/neo.test.js and epic/iss's
// module-level fetch calls expect: a stubbed global.fetch returning
// canned JSON/binary responses, never a real network call.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectApodWall = require('../src/effects/apodWall');
const effectEpicWall = require('../src/effects/epicWall');
const effectIssWall = require('../src/effects/issWall');
const effectNeoWall = require('../src/effects/neoWall');

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
function halfSums(core) {
  const { wallW: W, wallH: H, wallBuf: buf } = core;
  let left = 0, right = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      const s = buf[o] + buf[o + 1] + buf[o + 2];
      if (x < W / 2) left += s; else right += s;
    }
  }
  return { left, right };
}

// ── tiny 2x2 opaque red PNG, base64-encoded, for jimp to decode without
// hitting the network (apod/epic/iss all decode fetched images via jimp).
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4AWP8z8DwnwEImBigAAAfFwICgH3ifwAAAABJRU5ErkJggg==';
function tinyPngArrayBuffer() {
  const buf = Buffer.from(TINY_PNG_B64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const realFetch = global.fetch;

async function main() {
  // ── apod ──
  test('apodWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectApodWall(core, 0.05);
  });

  await test('apodWall: mocked NASA fetch + tiny image renders a finite, non-zero image spanning the whole wall', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('api.nasa.gov/planetary/apod')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            title: 'Test Nebula', explanation: 'A test explanation.', date: '2026-08-13',
            media_type: 'image', url: 'https://example.com/test.png',
          }),
        });
      }
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(tinyPngArrayBuffer()) });
    };
    const core = makeWallCore();
    core.effectOptions = { apod: { refresh: Date.now() } };
    effectApodWall(core, 1 / 20); // triggers the forced fetch
    await new Promise((r) => setTimeout(r, 80)); // let the async fetch+decode chain resolve
    for (let i = 0; i < 10; i++) effectApodWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    const status = effectApodWall.getStatus();
    assert.strictEqual(status.title, 'Test Nebula');
  });

  await test('apodWall: network failure renders a centered error placeholder without throwing', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { apod: { refresh: Date.now() + 1 } };
    effectApodWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectApodWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  // ── epic ──
  test('epicWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectEpicWall(core, 0.05);
  });

  await test('epicWall: mocked GIBS equirect fetch renders a globe centered on the true wall center', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('gibs.earthdata.nasa.gov')) {
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(tinyPngArrayBuffer()) });
      }
      // EPIC natural-image metadata endpoints: no imagery, forces the
      // "GIBS-only, no natural-image fallback" path deterministically.
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    };
    const core = makeWallCore();
    core.effectOptions = { epic: { refreshRequestedAt: Date.now() } };
    for (let i = 0; i < 5; i++) effectEpicWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 150)); // let fetchEq()'s up-to-4-day retry loop resolve
    for (let i = 0; i < 10; i++) effectEpicWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    const { wallW: W, wallH: H, wallBuf: buf } = core;
    // rad = min(W,H)*0.46 = ~29.4, centered at true wall center (64,32) -
    // should be lit there, proving centering used the full wall, not a
    // single-panel-centered (32,32).
    const o = (Math.round(H / 2) * W + Math.round(W / 2)) * 3;
    assert.ok(buf[o] + buf[o + 1] + buf[o + 2] > 0, `expected the globe lit at the true wall center, got brightness=${buf[o] + buf[o + 1] + buf[o + 2]}`);
  });

  // ── iss ──
  test('issWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectIssWall(core, 0.05);
  });

  await test('issWall: mocked position fetch renders a finite world map spanning the full wall (both halves lit)', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('wheretheiss.at')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ latitude: '15.5', longitude: '-40.2', timestamp: Math.floor(Date.now() / 1000) }) });
      }
      if (u.includes('bigdatacloud.net')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ countryCode: '', countryName: '' }) }); // over ocean - common case
      }
      return Promise.resolve({ ok: false, status: 404 });
    };
    const core = makeWallCore();
    core.effectOptions = { iss: { refreshRequestedAt: Date.now() } };
    effectIssWall(core, 1 / 20); // triggers the forced position fetch
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < 15; i++) effectIssWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    // The world map is a full-canvas composition widened to the wall's own
    // aspect ratio (128x64 -> a full 360deg window) - both halves of the
    // 2-panel wall should show real landmass/ocean brightness, not just a
    // single 64px panel's worth.
    const { left, right } = halfSums(core);
    assert.ok(left > 0 && right > 0, `expected both halves lit, got left=${left} right=${right}`);
    const status = effectIssWall.getStatus();
    assert.ok(status.hasFix, 'expected a live fix after the mocked fetch resolved');
  });

  // ── neo ──
  test('neoWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    effectNeoWall(core, 0.05);
  });

  await test('neoWall: mocked NeoWs feed renders a finite Earth+radar+ticker spanning the full wall', async () => {
    const today = new Date().toISOString().slice(0, 10);
    global.fetch = (url) => {
      assert.ok(String(url).includes('api.nasa.gov/neo/rest/v1/feed'), `unexpected fetch URL: ${url}`);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          near_earth_objects: {
            [today]: [
              {
                name: '(2024 ZZ9)', is_potentially_hazardous_asteroid: true,
                estimated_diameter: { meters: { estimated_diameter_min: 30, estimated_diameter_max: 80 } },
                close_approach_data: [{ close_approach_date: today, miss_distance: { lunar: '2.1', kilometers: '800000' }, relative_velocity: { kilometers_per_second: '15.0' } }],
              },
              {
                name: '(2024 YY1)', is_potentially_hazardous_asteroid: false,
                estimated_diameter: { meters: { estimated_diameter_min: 5, estimated_diameter_max: 15 } },
                close_approach_data: [{ close_approach_date: today, miss_distance: { lunar: '30.4', kilometers: '11700000' }, relative_velocity: { kilometers_per_second: '8.2' } }],
              },
            ],
          },
        }),
      });
    };
    const core = makeWallCore();
    core.effectOptions = { neo: { refreshRequestedAt: Date.now() } };
    effectNeoWall(core, 1 / 20); // triggers the forced fetch
    await new Promise((r) => setTimeout(r, 80));
    for (let i = 0; i < 20; i++) effectNeoWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    // Earth is drawn at the LEFT edge (peeking in) and the radar/ticker
    // span the full width, so this should light up BOTH halves of a
    // 2-panel wall, unlike a single-panel-centered composition that would
    // stay entirely inside the first 64px.
    const { left, right } = halfSums(core);
    assert.ok(left > 0 && right > 0, `expected both halves lit (Earth left, radar/ticker spanning full width), got left=${left} right=${right}`);
    const status = effectNeoWall.getStatus();
    assert.ok(status.count >= 1, `expected at least 1 tracked object, got ${status.count}`);
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll wall effects batch 8 tests passed');
  }
}

main();
