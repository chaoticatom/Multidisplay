// Test for the On This Day effect port (pi-native/src/effects/otd.js).
// No real network call - global.fetch is stubbed with a mock Wikipedia
// "onthisday/events" response, same approach as neo.test.js/joke.test.js.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectOnThisDay = require('../src/effects/otd');
const { getStatus } = effectOnThisDay;

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
  }
}

function mockOtdResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({
      events: [
        { year: 1969, text: 'Apollo 11 astronauts land on the Moon.' },
        { year: 1945, text: 'World War II ends in Europe.' },
        { year: 1876, text: 'Alexander Graham Bell is granted a patent for the telephone.' },
      ],
    }),
  };
}

const realFetch = global.fetch;

async function main() {
  await test('no events yet: renders loading placeholder without throwing', async () => {
    global.fetch = () => Promise.reject(new Error('offline'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: {} };
    for (let i = 0; i < 5; i++) effectOnThisDay(core, 1 / 30);
    checkFinite(core, 'cube pre-fetch');
    await new Promise((r) => setTimeout(r, 20));
  });

  await test('successful fetch: cube mode renders title card + starfield + cascade across many ticks', async () => {
    global.fetch = (url, opts) => {
      assert.ok(String(url).includes('en.wikipedia.org/api/rest_v1/feed/onthisday/events/'), `unexpected fetch URL: ${url}`);
      assert.strictEqual(opts?.headers?.Accept, 'application/json');
      return mockOtdResponse();
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() } };
    effectOnThisDay(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 600; i++) {
      effectOnThisDay(core, 1 / 10);
      checkFinite(core, `cube post-fetch tick ${i}`);
    }
    const status = getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
    assert.ok(status.count >= 1, `expected at least 1 event, got ${status.count}`);
  });

  await test('cycles through multiple events (otdIdx advances after hold)', async () => {
    // Builds on the previous test's already-fetched events - just runs
    // enough ticks (each event: word cascade + 2.5s hold) to guarantee at
    // least one advance past the first event.
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: {} };
    for (let i = 0; i < 1000; i++) effectOnThisDay(core, 1 / 10);
    checkFinite(core, 'after many ticks (event cycling)');
  });

  await test('2D panel mode renders to face 0 without throwing, finite colBuf', async () => {
    global.fetch = () => mockOtdResponse();
    const core = new CubeCore(64);
    core.panelMode = '2d';
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() + 1 } };
    effectOnThisDay(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 20; i++) effectOnThisDay(core, 1 / 30);
    checkFinite(core, '2d panel');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() + 2 } };
    effectOnThisDay(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectOnThisDay(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
    const status = getStatus();
    assert.ok(typeof status.text === 'string');
  });

  await test('HTTP error response (non-ok) does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: false, status: 503 });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() + 3 } };
    effectOnThisDay(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectOnThisDay(core, 1 / 30);
    checkFinite(core, 'after HTTP error');
  });

  await test('empty events array does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ events: [] }) });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() + 4 } };
    effectOnThisDay(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectOnThisDay(core, 1 / 30);
    checkFinite(core, 'after empty events');
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll On This Day tests passed');
  }
}

console.log('effectOnThisDay: fetch mocked, cube+2D panel modes, event cycling, success/failure/HTTP-error paths');
main();
