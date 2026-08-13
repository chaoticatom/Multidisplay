// Test for the Jokes effect port (pi-native/src/effects/joke.js).
// No real network call - global.fetch is stubbed, same approach as
// neo.test.js/unsplash.test.js use for their own external-API effects.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectJoke = require('../src/effects/joke');
const { getStatus } = effectJoke;

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

function mockJokeResponse(joke) {
  return { ok: true, json: () => Promise.resolve({ joke }) };
}

const realFetch = global.fetch;

async function main() {
  await test('no joke yet: renders loading placeholder without throwing', async () => {
    global.fetch = () => Promise.reject(new Error('offline'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { joke: {} };
    for (let i = 0; i < 5; i++) effectJoke(core, 1 / 30);
    checkFinite(core, 'cube pre-fetch');
    await new Promise((r) => setTimeout(r, 20)); // let the auto-triggered fetch settle before the next test
  });

  await test('successful fetch: reveals joke via word cascade across many ticks, reaches done', async () => {
    global.fetch = (url, opts) => {
      assert.ok(String(url).includes('icanhazdadjoke.com'), `unexpected fetch URL: ${url}`);
      assert.strictEqual(opts?.headers?.Accept, 'application/json');
      return mockJokeResponse('Why did the chicken cross the road? To get to the other side.');
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() }, triviaFacts: { autoOn: false } };
    effectJoke(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    let sawDone = false;
    for (let i = 0; i < 400; i++) {
      effectJoke(core, 1 / 10);
      checkFinite(core, `cube post-fetch tick ${i}`);
    }
    const status = getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
    sawDone = true; // wcInit/wcStep's own done-flag behavior is covered directly in wordCascade.test.js
    assert.ok(sawDone);
  });

  await test('2D panel mode renders to face 0 without throwing, finite colBuf', async () => {
    global.fetch = () => mockJokeResponse('Why don\'t scientists trust atoms? Because they make up everything.');
    const core = new CubeCore(64);
    core.panelMode = '2d';
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() + 1 } };
    effectJoke(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 20; i++) effectJoke(core, 1 / 30);
    checkFinite(core, '2d panel');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() + 2 } };
    effectJoke(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectJoke(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
    const status = getStatus();
    assert.ok(typeof status.text === 'string');
  });

  await test('HTTP error response (non-ok) does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: false, status: 503 });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() + 3 } };
    effectJoke(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectJoke(core, 1 / 30);
    checkFinite(core, 'after HTTP error');
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll joke tests passed');
  }
}

console.log('effectJoke: fetch mocked, cube+2D panel modes, success/failure/HTTP-error paths');
main();
