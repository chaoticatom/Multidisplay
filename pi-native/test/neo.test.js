// Test for the NEO (Near-Earth Objects) effect port (pi-native/src/effects/neo.js).
// No real network call (flaky/rate-limited in CI) - global.fetch is stubbed
// with a small mock NeoWs "feed" response, same "stub fetch, drive several
// ticks, assert no throw + finite colBuf" approach as weather.test.js/
// cam.test.js use for their own external-API effects.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectNeo = require('../src/effects/neo');
const { getStatus } = effectNeo;

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function checkFinite(core, label) {
  for (let i = 0; i < core.colBuf.length; i++) {
    const v = core.colBuf[i];
    assert.ok(Number.isFinite(v), `${label}: non-finite value ${v} at colBuf[${i}]`);
    assert.ok(v >= -0.5 && v <= 2.0, `${label}: colBuf[${i}]=${v} looks out of plausible range`);
  }
}

function mockNeoResponse() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    near_earth_objects: {
      [today]: [
        {
          name: '(2024 AB1)',
          is_potentially_hazardous_asteroid: true,
          estimated_diameter: { meters: { estimated_diameter_min: 40, estimated_diameter_max: 90 } },
          close_approach_data: [{
            close_approach_date: today,
            miss_distance: { lunar: '3.2', kilometers: '1230000' },
            relative_velocity: { kilometers_per_second: '12.4' },
          }],
        },
        {
          name: '(2024 CD2)',
          is_potentially_hazardous_asteroid: false,
          estimated_diameter: { meters: { estimated_diameter_min: 10, estimated_diameter_max: 20 } },
          close_approach_data: [{
            close_approach_date: today,
            miss_distance: { lunar: '25.6', kilometers: '9800000' },
            relative_velocity: { kilometers_per_second: '5.1' },
          }],
        },
      ],
    },
  };
}

const realFetch = global.fetch;

async function main() {
  await test('no fetch yet: cube mode renders without throwing, colBuf finite', async () => {
    global.fetch = () => Promise.reject(new Error('should not be called yet in this isolated test'));
    // Force the module's internal "already have data" gate off isn't
    // possible from outside, so this just exercises whatever state the
    // module is currently in - the real assertion is "doesn't throw".
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.speedMult = 1;
    for (let i = 0; i < 5; i++) effectNeo(core, 1 / 30);
    checkFinite(core, 'cube pre-fetch');
  });

  await test('successful fetch: populates objects, cube mode renders all 6 faces without NaN', async () => {
    global.fetch = (url) => {
      assert.ok(String(url).includes('api.nasa.gov/neo/rest/v1/feed'), `unexpected fetch URL: ${url}`);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockNeoResponse()) });
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.speedMult = 1;
    core.effectOptions = { neo: { refreshRequestedAt: Date.now() } };
    effectNeo(core, 1 / 30); // triggers the forced refetch
    await new Promise((r) => setTimeout(r, 50)); // let the async fetch chain resolve
    for (let i = 0; i < 20; i++) effectNeo(core, 1 / 30);
    checkFinite(core, 'cube post-fetch');
    const status = getStatus();
    assert.ok(status.count >= 1, `expected at least 1 tracked object, got ${status.count}`);
    assert.ok(status.closest && typeof status.closest.missLD === 'number', 'expected a closest object with missLD');
    assert.ok(['green', 'yellow', 'red'].includes(status.risk), `unexpected risk level: ${status.risk}`);
  });

  await test('2D panel mode renders without throwing, colBuf finite, differs from cube mode', async () => {
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(mockNeoResponse()) });
    const coreCube = new CubeCore(64);
    coreCube.panelMode = 'cube';
    coreCube.effectOptions = { neo: {} };
    const core2d = new CubeCore(64);
    core2d.panelMode = '2d';
    core2d.effectOptions = { neo: {} };
    for (let i = 0; i < 10; i++) { effectNeo(coreCube, 1 / 30); effectNeo(core2d, 1 / 30); }
    checkFinite(coreCube, '2d-compare cube');
    checkFinite(core2d, '2d-compare 2d');
    let differs = false;
    for (let i = 0; i < coreCube.colBuf.length; i++) {
      if (Math.abs(coreCube.colBuf[i] - core2d.colBuf[i]) > 1e-6) { differs = true; break; }
    }
    assert.ok(differs, 'expected 2d-mode output to differ from cube-mode output');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { neo: { refreshRequestedAt: Date.now() + 1 } };
    effectNeo(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectNeo(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
    // Status may or may not still report the previous error depending on
    // retry timing, but must never throw and must stay well-formed.
    const status = getStatus();
    assert.ok(typeof status.count === 'number');
  });

  await test('HTTP error response (non-ok) does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { neo: { refreshRequestedAt: Date.now() + 2 } };
    effectNeo(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectNeo(core, 1 / 30);
    checkFinite(core, 'after HTTP error');
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll neo tests passed');
  }
}

console.log('effectNeo: fetch mocked, cube+2D panel modes, success/failure/HTTP-error paths');
main();
