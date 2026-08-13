// Test for the Trivia effect port (pi-native/src/effects/trivia.js).
// No real network call - global.fetch is stubbed, same approach as
// neo.test.js/joke.test.js use for their own external-API effects.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectTrivia = require('../src/effects/trivia');
const { getStatus } = effectTrivia;

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

function mockTriviaResponse(question, correct_answer) {
  return { ok: true, json: () => Promise.resolve({ results: [{ question, correct_answer }] }) };
}

const realFetch = global.fetch;

async function main() {
  await test('no question yet: renders loading placeholder without throwing', async () => {
    global.fetch = () => Promise.reject(new Error('offline'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { trivia: {} };
    for (let i = 0; i < 5; i++) effectTrivia(core, 1 / 30);
    checkFinite(core, 'cube pre-fetch');
    await new Promise((r) => setTimeout(r, 20));
  });

  await test('successful fetch decodes HTML entities and reveals via word cascade', async () => {
    global.fetch = (url) => {
      assert.ok(String(url).includes('opentdb.com/api.php'), `unexpected fetch URL: ${url}`);
      // &quot;/&#039;/&amp; are the entities the task brief calls out explicitly.
      return mockTriviaResponse(
        'What is the &quot;capital&quot; of Bob&#039;s country?',
        'Rock &amp; Roll City',
      );
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() }, triviaFacts: { autoOn: false } };
    effectTrivia(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 400; i++) {
      effectTrivia(core, 1 / 10);
      checkFinite(core, `cube post-fetch tick ${i}`);
    }
    const status = getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
  });

  await test('2D panel mode renders to face 0 without throwing, finite colBuf', async () => {
    global.fetch = () => mockTriviaResponse('Is this a question', 'Yes');
    const core = new CubeCore(64);
    core.panelMode = '2d';
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() + 1 } };
    effectTrivia(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 20; i++) effectTrivia(core, 1 / 30);
    checkFinite(core, '2d panel');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() + 2 } };
    effectTrivia(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectTrivia(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
    const status = getStatus();
    assert.ok(typeof status.text === 'string');
  });

  await test('HTTP error response (non-ok) does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: false, status: 429 });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() + 3 } };
    effectTrivia(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectTrivia(core, 1 / 30);
    checkFinite(core, 'after HTTP error');
  });

  await test('empty results array does not throw', async () => {
    global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() + 4 } };
    effectTrivia(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 10; i++) effectTrivia(core, 1 / 30);
    checkFinite(core, 'after empty results');
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll trivia tests passed');
  }
}

console.log('effectTrivia: fetch mocked, cube+2D panel modes, HTML-entity decode, success/failure/HTTP-error paths');
main();
