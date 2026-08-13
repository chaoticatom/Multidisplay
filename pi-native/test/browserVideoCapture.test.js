// Verifies the "live browser webcam/screen capture" video source: the
// wsServer.js binary-frame wire protocol (see its module comment for the
// format), browserFrameSource.js's stale/exact-dims-match contract, and
// that video.js/videoWall.js actually render from it when
// effectOptions.video.source==='browser'.
const assert = require('assert');
const WebSocket = require('ws');
const WsServer = require('../src/wsServer');
const { CubeCore } = require('../src/core');
const { browserFrameSource } = require('../src/effects/video/browserFrameSource');
const effectVideo = require('../src/effects/video');
const effectVideoWall = require('../src/effects/videoWall');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

// Builds a wire-format frame: [type=1][wLE16][hLE16][kind][RGB...]
function buildFrame(w, h, kind, fill) {
  const header = Buffer.alloc(6);
  header[0] = 1;
  header.writeUInt16LE(w, 1);
  header.writeUInt16LE(h, 3);
  header[5] = kind === 'screen' ? 1 : 0;
  const payload = Buffer.alloc(w * h * 3, fill);
  return Buffer.concat([header, payload]);
}

async function run() {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'video', brightness: 1, speed: 1, effectOptions: {} };
  const config = { size: 64, mode: 'cube' };
  const server = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));

  await test('a well-formed binary frame lands in browserFrameSource via the real WS connection', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    ws.send(buildFrame(4, 3, 'cam', 200));
    await new Promise((r) => setTimeout(r, 50));
    const frame = browserFrameSource.getFrame(4, 3);
    assert.ok(frame, 'expected a frame to have landed');
    assert.strictEqual(frame.length, 4 * 3 * 3);
    assert.strictEqual(frame[0], 200);
    ws.close();
  });

  await test('_handleBinaryFrame ignores malformed frames without throwing', () => {
    assert.doesNotThrow(() => {
      server._handleBinaryFrame(Buffer.alloc(2)); // too short
      server._handleBinaryFrame(Buffer.from([2, 0, 0, 0, 0, 0])); // wrong type byte
      const bad = Buffer.alloc(6 + 5); // header says 4x3 but payload is only 5 bytes, not 36
      bad[0] = 1; bad.writeUInt16LE(4, 1); bad.writeUInt16LE(3, 3);
      server._handleBinaryFrame(bad);
    });
  });

  await test('getFrame() returns null once a frame goes stale', () => {
    browserFrameSource.setFrame(Buffer.alloc(3 * 2 * 3), 3, 2, 'cam');
    browserFrameSource.lastFrameMs = Date.now() - 10000; // force staleness without a real 3s sleep
    assert.strictEqual(browserFrameSource.getFrame(3, 2), null);
  });

  await test('video.js (cube) renders from the browser source when effectOptions.video.source is "browser"', () => {
    const core = new CubeCore(8); // small SIZE so an 8x8 test frame is cheap to build
    browserFrameSource.setFrame(Buffer.alloc(8 * 8 * 3, 128), 8, 8, 'cam');
    core.effectOptions = { video: { source: 'browser', layout: 'mirror' } };
    effectVideo(core, 0.05);
    let sawNonZero = false;
    for (let i = 0; i < core.colBuf.length; i++) { if (core.colBuf[i] > 0) { sawNonZero = true; break; } }
    assert.ok(sawNonZero, 'expected the browser frame to actually render onto colBuf');
    assert.ok(getStatusFor(effectVideo).includes('browser') || getStatusFor(effectVideo).toLowerCase().includes('camera'));
  });

  await test('video.js (cube) clamps panorama/perspective layout to mirror for browser sources', () => {
    const core = new CubeCore(8);
    browserFrameSource.setFrame(Buffer.alloc(8 * 8 * 3, 77), 8, 8, 'cam');
    core.effectOptions = { video: { source: 'browser', layout: 'panorama' } };
    assert.doesNotThrow(() => effectVideo(core, 0.05)); // would index out-of-bounds against an 8x8 buffer if layout weren't clamped
  });

  await test('videoWall.js renders from the browser source at the full wall dims', () => {
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64); // 128x64
    browserFrameSource.setFrame(Buffer.alloc(128 * 64 * 3, 90), 128, 64, 'screen');
    core.effectOptions = { video: { source: 'browser' } };
    effectVideoWall(core, 0.05);
    let sawNonZero = false;
    for (let i = 0; i < core.wallBuf.length; i++) { if (core.wallBuf[i] > 0) { sawNonZero = true; break; } }
    assert.ok(sawNonZero, 'expected the browser frame to actually render onto wallBuf');
  });

  server.close();

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll browserVideoCapture tests passed');
  }
  process.exit(process.exitCode || 0);
}

function getStatusFor(fn) { return fn.getStatus(); }

run();
