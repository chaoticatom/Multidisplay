// Test for the Camera effect port (pi-native/src/effects/cam.js). No
// real external network call (that would be flaky in CI) - the "live
// fetch" case spins up a real local http.Server on 127.0.0.1 serving a
// jimp-generated PNG, exercising the actual fetch()->decode->resize->
// face-projection path end to end without depending on anything outside
// this process. The bad-URL/no-URL cases need no server at all.
const assert = require('assert');
const http = require('http');
const { CubeCore } = require('../src/core');
const effectCam = require('../src/effects/cam');
const { getStatus } = effectCam;
const { Jimp } = require('jimp');

function test(name, fn) {
  return fn().then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function checkRange01(core, label) {
  for (let i = 0; i < core.colBuf.length; i++) {
    const v = core.colBuf[i];
    assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${label}: colBuf[${i}]=${v} out of range`);
  }
}

async function main() {
  await test('no URL configured: stays black across several ticks, never throws', async () => {
    const core = new CubeCore(64);
    core.effectOptions = { cam: {} };
    for (let i = 0; i < 10; i++) effectCam(core, 1 / 30);
    checkRange01(core, 'no-url');
    assert.ok(core.colBuf.every((v) => v === 0), 'expected all-black colBuf before any successful fetch');
  });

  await test('unreachable URL: fetch failure does not throw and surfaces an error status', async () => {
    const core = new CubeCore(64);
    // Port 1 is blocked by Node's fetch (undici) as a "bad port", a cheap
    // way to force a fetch failure with zero real network activity.
    core.effectOptions = { cam: { url: 'http://127.0.0.1:1/nope', rate: 5 } };
    for (let i = 0; i < 5; i++) effectCam(core, 1 / 30);
    await new Promise((r) => setTimeout(r, 200));
    for (let i = 0; i < 5; i++) effectCam(core, 1 / 30);
    checkRange01(core, 'bad-url');
    assert.ok(getStatus().startsWith('Error'), `expected an Error status, got "${getStatus()}"`);
  });

  await test('local HTTP fetch: decode+resize+identical-6-face projection', async () => {
    const img = new Jimp({ width: 20, height: 20, color: 0x00ff00ff });
    const pngBuf = await img.getBuffer('image/png');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(pngBuf);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const core = new CubeCore(64);
    core.effectOptions = { cam: { url: `http://127.0.0.1:${port}/snap`, rate: 15 } };
    let attempts = 0;
    while (!getStatus().startsWith('Live') && attempts < 50) {
      effectCam(core, 1 / 30);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 20));
      attempts++;
    }
    effectCam(core, 1 / 30);
    server.close();

    assert.ok(getStatus().startsWith('Live'), `expected Live status, got "${getStatus()}"`);
    checkRange01(core, 'live-fetch');

    const { SIZE, faceMap, colBuf } = core;
    const u = 32, v = 32;
    const refIdx = faceMap[0][(SIZE - 1 - v) * SIZE + u];
    assert.ok(refIdx >= 0, 'expected a valid LED index at u=32,v=32 on face 0');
    const refColor = [colBuf[refIdx * 3], colBuf[refIdx * 3 + 1], colBuf[refIdx * 3 + 2]];
    for (let f = 1; f < 6; f++) {
      const idx = faceMap[f][(SIZE - 1 - v) * SIZE + u];
      if (idx < 0) continue;
      const c = [colBuf[idx * 3], colBuf[idx * 3 + 1], colBuf[idx * 3 + 2]];
      assert.deepStrictEqual(c, refColor, `face ${f} pixel differs from face 0 at the same u,v`);
    }
  });

  if (process.exitCode) {
    console.log('\nFAILED');
    process.exit(1);
  } else {
    console.log('\nAll cam tests passed');
  }
}

main();
