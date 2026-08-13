// Smoke tests for the ninth batch of wall-mode effects: unsplash, artic,
// joke, trivia, otd - see wallEffectsBatch1-8.test.js for the established
// pattern this follows.
//
// unsplash/artic are "one photo, stretched across the whole wall, with
// crossfade" (apodWall.js's shape) so they get a finite/non-zero check plus
// an "image data present past x=64" spanning check. joke/trivia/otd all
// reveal text via the wall-aware word-cascade siblings (wcInitWall/
// wcStepWall/wcDrawToFaceWall in _shared.js) so they get "revealed glyphs
// present past x=64" checks after running enough ticks to finish the
// cascade, same "run many ticks to reach done" approach joke.test.js/
// trivia.test.js/otd.test.js already use for the cube versions.
//
// Network fetches are mocked the same way unsplash.test.js/artic.test.js/
// joke.test.js/trivia.test.js/otd.test.js already mock them: a stubbed
// global.fetch returning canned JSON/binary responses, never a real network
// call. unsplash additionally stubs unsplashConfig.load/save (see
// unsplash.test.js's comment on why - never touch the real on-disk config).
const assert = require('assert');
const { CubeCore } = require('../src/core');
const { Jimp } = require('jimp');
const effectUnsplashWall = require('../src/effects/unsplashWall');
const effectArticWall = require('../src/effects/articWall');
const effectJokeWall = require('../src/effects/jokeWall');
const effectTriviaWall = require('../src/effects/triviaWall');
const effectOtdWall = require('../src/effects/otdWall');
const unsplashConfig = require('../src/unsplashConfig');

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

async function makePngBuffer() {
  const img = new Jimp({ width: 8, height: 8, color: 0xff8040ff });
  return img.getBuffer('image/png');
}

const realFetch = global.fetch;
const realConfigLoad = unsplashConfig.load;
const realConfigSave = unsplashConfig.save;

async function main() {
  let pngBuf;
  try { pngBuf = await makePngBuffer(); } catch (e) { console.error('setup failed to build test PNG:', e); process.exit(1); }
  const pngArrayBuffer = () => pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength);

  // ── unsplash ──
  let fakeConfig = { apiKey: '', query: 'nature' };
  unsplashConfig.load = () => ({ ...fakeConfig });
  unsplashConfig.save = (c) => { fakeConfig = { ...c }; };

  test('unsplashWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { unsplash: {} };
    effectUnsplashWall(core, 0.05);
  });

  await test('unsplashWall: no API key leaves a blank finite canvas, never calls fetch', async () => {
    fakeConfig = { apiKey: '', query: 'nature' };
    global.fetch = () => { throw new Error('fetch should not be called with no API key'); };
    const core = makeWallCore();
    core.effectOptions = { unsplash: {} };
    for (let i = 0; i < 5; i++) effectUnsplashWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  await test('unsplashWall: mocked fetch + real PNG renders a finite, non-zero photo spanning the whole wall', async () => {
    fakeConfig = { apiKey: 'test-key-123', query: 'nature' };
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('api.unsplash.com/photos/random')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([
            { urls: { regular: 'https://images.example/photo1' } },
            { urls: { regular: 'https://images.example/photo2' } },
          ]),
        });
      }
      if (u.startsWith('https://images.example/')) {
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(pngArrayBuffer()) });
      }
      return Promise.reject(new Error('unexpected fetch URL: ' + u));
    };
    const core = makeWallCore();
    core.effectOptions = { unsplash: {} };
    effectUnsplashWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 100)); // let search + image decode resolve
    for (let i = 0; i < 20; i++) effectUnsplashWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    assert.ok(pastX64Sum(core) > 0, 'expected photo content past x=64, not crammed into the first panel');
    const status = effectUnsplashWall.getStatus();
    assert.ok(status.count >= 1, `expected at least 1 photo, got ${status.count}`);
  });

  await test('unsplashWall: network failure does not throw, canvas stays finite', async () => {
    fakeConfig = { apiKey: 'bad-key', query: 'zzz' };
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { unsplash: {} };
    effectUnsplashWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectUnsplashWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  unsplashConfig.load = realConfigLoad;
  unsplashConfig.save = realConfigSave;

  // ── artic ──
  test('articWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { artic: {} };
    effectArticWall(core, 0.05);
  });

  await test('articWall: mocked Met API fetch + real PNG renders a finite, non-zero image spanning the whole wall', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('/search?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ objectIDs: [1, 2, 3] }) });
      }
      if (u.includes('/objects/')) {
        const id = Number(u.split('/objects/')[1]);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            objectID: id, isPublicDomain: true, primaryImageSmall: 'https://images.example/art' + id,
            title: 'Test Work ' + id, artistDisplayName: 'Tester',
          }),
        });
      }
      if (u.startsWith('https://images.example/')) {
        return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(pngArrayBuffer()) });
      }
      return Promise.reject(new Error('unexpected fetch URL: ' + u));
    };
    const core = makeWallCore();
    core.effectOptions = { artic: {} };
    effectArticWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 20; i++) effectArticWall(core, 1 / 20);
    assertFiniteAndNonZero(core);
    assert.ok(pastX64Sum(core) > 0, 'expected artwork content past x=64, not crammed into the first panel');
    const status = effectArticWall.getStatus();
    assert.ok(status.count >= 1, `expected at least 1 artwork, got ${status.count}`);
  });

  await test('articWall: network failure does not throw, canvas stays finite', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { artic: {} };
    effectArticWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectArticWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  // ── joke ──
  test('jokeWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { joke: {} };
    effectJokeWall(core, 0.05);
  });

  await test('jokeWall: mocked fetch reveals a word cascade spanning the full wall width', async () => {
    global.fetch = (url, opts) => {
      assert.ok(String(url).includes('icanhazdadjoke.com'), `unexpected fetch URL: ${url}`);
      assert.strictEqual(opts?.headers?.Accept, 'application/json');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          joke: 'Why did the scarecrow win an award because he was outstanding in his field and everyone in the whole entire county agreed completely without any hesitation whatsoever',
        }),
      });
    };
    const core = makeWallCore();
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() }, triviaFacts: { autoOn: false } };
    effectJokeWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 60));
    let maxPastX64 = 0;
    for (let i = 0; i < 400; i++) {
      effectJokeWall(core, 1 / 10);
      assertFiniteThroughout(core);
      maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
    }
    assertFiniteAndNonZero(core);
    assert.ok(maxPastX64 > 0, 'expected revealed word-cascade glyphs past x=64 at some point, not crammed into a single 64px column');
    const status = effectJokeWall.getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
  });

  await test('jokeWall: network failure does not throw, canvas stays finite', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { joke: { refreshRequestedAt: Date.now() + 1 } };
    effectJokeWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectJokeWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  // ── trivia ──
  test('triviaWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { trivia: {} };
    effectTriviaWall(core, 0.05);
  });

  await test('triviaWall: mocked fetch reveals a word cascade spanning the full wall width', async () => {
    global.fetch = (url) => {
      assert.ok(String(url).includes('opentdb.com'), `unexpected fetch URL: ${url}`);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          results: [{
            question: 'What is the &quot;capital&quot; city of a very large and historically significant European country',
            correct_answer: 'Paris, obviously the correct answer here for sure',
          }],
        }),
      });
    };
    const core = makeWallCore();
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() }, triviaFacts: { autoOn: false } };
    effectTriviaWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 60));
    let maxPastX64 = 0;
    for (let i = 0; i < 400; i++) {
      effectTriviaWall(core, 1 / 10);
      assertFiniteThroughout(core);
      maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
    }
    assertFiniteAndNonZero(core);
    assert.ok(maxPastX64 > 0, 'expected revealed word-cascade glyphs past x=64 at some point, not crammed into a single 64px column');
    const status = effectTriviaWall.getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
  });

  await test('triviaWall: network failure does not throw, canvas stays finite', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { trivia: { refreshRequestedAt: Date.now() + 1 } };
    effectTriviaWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectTriviaWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  // ── otd ──
  test('otdWall does nothing (no throw) before initWall()', () => {
    const core = new CubeCore(64);
    core.effectOptions = { otd: {} };
    effectOtdWall(core, 0.05);
  });

  await test('otdWall: mocked Wikipedia fetch renders title corner + starfield + cascade spanning the full wall width', async () => {
    global.fetch = (url, opts) => {
      assert.ok(String(url).includes('en.wikipedia.org/api/rest_v1/feed/onthisday/events/'), `unexpected fetch URL: ${url}`);
      assert.strictEqual(opts?.headers?.Accept, 'application/json');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          events: [
            { year: 1969, text: 'Apollo 11 astronauts land on the Moon in a historic first for all of humanity everywhere on this planet Earth' },
            { year: 1945, text: 'World War II ends in Europe after many long years of terrible conflict across the entire continent' },
          ],
        }),
      });
    };
    const core = makeWallCore();
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() } };
    effectOtdWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 60));
    let maxPastX64 = 0;
    for (let i = 0; i < 600; i++) {
      effectOtdWall(core, 1 / 10);
      assertFiniteThroughout(core);
      maxPastX64 = Math.max(maxPastX64, pastX64Sum(core));
    }
    assertFiniteAndNonZero(core);
    assert.ok(maxPastX64 > 0, 'expected revealed word-cascade glyphs (or starfield) past x=64 at some point, not crammed into a single 64px column');
    const status = effectOtdWall.getStatus();
    assert.ok(!status.error, `expected no error, got ${status.error}`);
    assert.ok(status.count >= 1, `expected at least 1 event, got ${status.count}`);
  });

  await test('otdWall: network failure does not throw, canvas stays finite', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = makeWallCore();
    core.effectOptions = { otd: { refreshRequestedAt: Date.now() + 1 } };
    effectOtdWall(core, 1 / 20);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectOtdWall(core, 1 / 20);
    assertFiniteThroughout(core);
  });

  global.fetch = realFetch;
  unsplashConfig.load = realConfigLoad;
  unsplashConfig.save = realConfigSave;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll wall effects batch 9 tests passed');
  }
}

main();
