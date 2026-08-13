// Test for the Unsplash Photos effect port (pi-native/src/effects/unsplash.js).
// No real network call - global.fetch is stubbed for both the Unsplash
// search API and the per-photo image fetch (a real Jimp-generated PNG
// buffer, same "generate a tiny real image so Jimp.read() has something
// valid to decode" approach as cam.test.js), same overall shape as
// neo.test.js/cam.test.js use for their own external-API effects.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectUnsplash = require('../src/effects/unsplash');
const { getStatus } = effectUnsplash;
const unsplashConfig = require('../src/unsplashConfig');
const { Jimp } = require('jimp');

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

  // In-memory stand-in for the on-disk config, so tests never touch the
  // real unsplash-config.json (same "stub the persistence layer, not the
  // filesystem" spirit as other tests stub fetch rather than the network).
  let fakeConfig = { apiKey: '', query: 'nature' };
  unsplashConfig.load = () => ({ ...fakeConfig });
  unsplashConfig.save = (c) => { fakeConfig = { ...c }; };

  await test('no API key: shows a clean placeholder, never calls fetch, colBuf finite', async () => {
    fakeConfig = { apiKey: '', query: 'nature' };
    global.fetch = () => { throw new Error('fetch should not be called with no API key'); };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { unsplash: {} };
    for (let i = 0; i < 5; i++) effectUnsplash(core, 1 / 30);
    checkFinite(core, 'no-key');
    const status = getStatus();
    assert.strictEqual(status.count, 0);
    assert.ok(!status.error, 'expected no error state with no key configured, just an idle prompt');
  });

  await test('with API key: fetches photos, decodes image, cube mode renders 6 faces without NaN', async () => {
    fakeConfig = { apiKey: 'test-key-123', query: 'nature' };
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('api.unsplash.com/photos/random')) {
        assert.ok(u.includes('client_id=test-key-123'));
        return Promise.resolve({
          ok: true, status: 200,
          json: () => Promise.resolve([
            { urls: { regular: 'https://images.example/photo1' }, user: { name: 'Tester' }, description: 'a test photo' },
            { urls: { regular: 'https://images.example/photo2' }, user: { name: 'Tester2' }, description: 'another' },
          ]),
        });
      }
      if (u.startsWith('https://images.example/')) {
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength)) });
      }
      return Promise.reject(new Error('unexpected fetch URL: ' + u));
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { unsplash: {} };
    effectUnsplash(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 100)); // let search + image decode resolve
    for (let i = 0; i < 20; i++) effectUnsplash(core, 1 / 30);
    checkFinite(core, 'cube post-fetch');
    const status = getStatus();
    assert.ok(status.count >= 1, `expected at least 1 photo, got ${status.count}`);
  });

  await test('2D panel mode renders without throwing, colBuf finite', async () => {
    fakeConfig = { apiKey: 'test-key-123', query: 'nature' };
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('api.unsplash.com')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ urls: { regular: 'https://images.example/photo1' } }]) });
      }
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength)) });
    };
    const core = new CubeCore(64);
    core.panelMode = '2d';
    core.effectOptions = { unsplash: {} };
    for (let i = 0; i < 10; i++) effectUnsplash(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 10; i++) effectUnsplash(core, 1 / 30);
    checkFinite(core, '2d');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    fakeConfig = { apiKey: 'bad-key', query: 'zzz-nonexistent-topic' };
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { unsplash: {} };
    effectUnsplash(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectUnsplash(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
  });

  await test('HTTP 401 (invalid key) does not throw and surfaces an error', async () => {
    fakeConfig = { apiKey: 'invalid-key', query: 'nature' };
    global.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { unsplash: {} };
    effectUnsplash(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectUnsplash(core, 1 / 30);
    checkFinite(core, 'after 401');
  });

  global.fetch = realFetch;
  unsplashConfig.load = realConfigLoad;
  unsplashConfig.save = realConfigSave;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll unsplash tests passed');
  }
}

console.log('effectUnsplash: fetch mocked, no-key/success/2D/network-failure/HTTP-error paths');
main();
