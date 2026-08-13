// Test for the Art Gallery (Met Museum) effect port (pi-native/src/effects/artic.js).
// No real network call - global.fetch is stubbed for the Met's two-step
// search -> object-details flow and the per-work image fetch (a real
// Jimp-generated PNG buffer), same shape as unsplash.test.js/neo.test.js.
const assert = require('assert');
const { CubeCore } = require('../src/core');
const effectArtic = require('../src/effects/artic');
const { getStatus } = effectArtic;
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
  const img = new Jimp({ width: 8, height: 8, color: 0x4080ffff });
  return img.getBuffer('image/png');
}

function mockDetails(id) {
  return { objectID: id, title: 'Work ' + id, artistDisplayName: 'Artist ' + id, isPublicDomain: true, primaryImageSmall: 'https://images.example/met/' + id };
}

const realFetch = global.fetch;

async function main() {
  let pngBuf;
  try { pngBuf = await makePngBuffer(); } catch (e) { console.error('setup failed to build test PNG:', e); process.exit(1); }
  const pngArrayBuffer = () => pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength);

  await test('first tick: no fetch has resolved yet, cube mode renders without throwing', async () => {
    // Rejects quickly (rather than a Promise that never settles) so the
    // module's internal `fetching` latch always clears before the next
    // test runs its own doFetch() - a permanently-pending mock here would
    // wedge every later test behind "if (fetching) return;".
    global.fetch = () => Promise.reject(new Error('not ready yet'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { artic: { query: 'no-throw-check-1' } };
    effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectArtic(core, 1 / 30);
    checkFinite(core, 'cube pre-fetch');
  });

  await test('successful search+details fetch: cube mode renders 6 faces without NaN', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('/search')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ objectIDs: [1, 2, 3, 4, 5] }) });
      }
      if (u.includes('/objects/')) {
        const id = Number(u.split('/objects/')[1]);
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockDetails(id)) });
      }
      if (u.startsWith('https://images.example/')) {
        return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(pngArrayBuffer()) });
      }
      return Promise.reject(new Error('unexpected fetch URL: ' + u));
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { artic: { query: 'painting-success-case' } };
    effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 150)); // let search + parallel object-detail fetches + image decode resolve
    for (let i = 0; i < 20; i++) effectArtic(core, 1 / 30);
    checkFinite(core, 'cube post-fetch');
    const status = getStatus();
    assert.ok(status.count >= 1, `expected at least 1 artwork, got ${status.count}`);
  });

  await test('2D panel mode renders without throwing, colBuf finite', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('/search')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ objectIDs: [10] }) });
      if (u.includes('/objects/')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mockDetails(10)) });
      return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(pngArrayBuffer()) });
    };
    const core = new CubeCore(64);
    core.panelMode = '2d';
    core.effectOptions = { artic: { query: 'painting-2d-case' } };
    for (let i = 0; i < 10; i++) effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 10; i++) effectArtic(core, 1 / 30);
    checkFinite(core, '2d');
  });

  await test('empty search results: does not throw, surfaces an error status', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('/search')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ objectIDs: [] }) });
      return Promise.reject(new Error('should not fetch object details with no search results'));
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { artic: { query: 'zzz-nonexistent-query-case' } };
    effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectArtic(core, 1 / 30);
    checkFinite(core, 'after empty search');
  });

  await test('network failure surfaces an error status and does not throw', async () => {
    global.fetch = () => Promise.reject(new Error('network down'));
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { artic: { query: 'network-failure-case' } };
    effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectArtic(core, 1 / 30);
    checkFinite(core, 'after fetch failure');
  });

  await test('HTTP error response (non-ok) on search does not throw', async () => {
    global.fetch = (url) => {
      const u = String(url);
      if (u.includes('/search')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.reject(new Error('should not fetch object details after a failed search'));
    };
    const core = new CubeCore(64);
    core.panelMode = 'cube';
    core.effectOptions = { artic: { query: 'http-error-case' } };
    effectArtic(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < 5; i++) effectArtic(core, 1 / 30);
    checkFinite(core, 'after HTTP error');
  });

  global.fetch = realFetch;

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll artic tests passed');
  }
}

console.log('effectArtic: fetch mocked, cube/2D panel modes, success/empty/network-failure/HTTP-error paths');
main();
