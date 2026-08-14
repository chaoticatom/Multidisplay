// Regression test for a real report: switching away from Video Display to
// another effect caused a persistent flicker between video content and
// whatever effect was just selected. Root cause: the tick loop only ever
// calls the CURRENTLY SELECTED effect's function, so once a different
// effect is selected, effectVideo()/effectVideoWall() simply stop being
// called at all - a stale decoded frame and/or a live browser camera/
// screen capture just kept sitting there (the ffmpeg process would
// eventually idle-timeout, but not immediately). Fixed with a dedicated
// "stopVideoSource" WS command that reaches past the tick loop entirely.
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

async function run() {
  await test('FfmpegSource.stop() is an immediate teardown, independent of ensure() being called again', () => {
    const { FfmpegSource } = require('../src/effects/video/ffmpegSource');
    let killed = false;
    const source = new FfmpegSource(() => {
      const { EventEmitter } = require('events');
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = () => { killed = true; };
      return proc;
    });
    source.ensure('http://x/video.mp4', 64, 64, 10);
    source.latestFrame = Buffer.alloc(3, 200); // simulate a decoded frame already sitting there
    source.stop();
    assert.strictEqual(killed, true, 'expected the ffmpeg process to be killed');
    assert.strictEqual(source.latestFrame, null, 'expected the stale frame to be cleared');
    assert.strictEqual(source.getStatus(), 'No source');
  });

  await test('browserFrameSource.clear() removes a stale frame so getFrame() returns null', () => {
    browserFrameSource.setFrame(Buffer.alloc(3, 100), 4, 4, 'cam');
    assert.ok(browserFrameSource.getFrame(4, 4), 'expected a frame to be present before clearing');
    browserFrameSource.clear();
    assert.strictEqual(browserFrameSource.getFrame(4, 4), null);
    assert.strictEqual(browserFrameSource.getStatus(), 'Waiting for browser camera/screen…');
  });

  await test('video.js and videoWall.js each export a stop() that tears down their own FfmpegSource', () => {
    assert.strictEqual(typeof effectVideo.stop, 'function');
    assert.strictEqual(typeof effectVideoWall.stop, 'function');
    assert.doesNotThrow(() => effectVideo.stop());
    assert.doesNotThrow(() => effectVideoWall.stop());
  });

  await test('the "stopVideoSource" WS command reaches all three sources without throwing', async () => {
    const port = 40000 + Math.floor(Math.random() * 10000);
    const state = { effect: 'wave', brightness: 1, speed: 1, effectOptions: {} };
    const config = { size: 64, mode: 'cube' };
    const server = new WsServer(port, state, config, () => {});
    await new Promise((r) => setTimeout(r, 100));

    browserFrameSource.setFrame(Buffer.alloc(3, 50), 4, 4, 'screen');

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    // Attach the message listener up front (not as a sequential await
    // after 'open') - the server sends its initial "state" message
    // essentially as soon as the connection is accepted, which can race
    // ahead of a listener attached only after awaiting 'open' first.
    const initialState = new Promise((resolve, reject) => {
      ws.once('message', resolve);
      ws.once('error', reject);
    });
    await initialState;
    assert.doesNotThrow(() => ws.send(JSON.stringify({ cmd: 'stopVideoSource' })));
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(browserFrameSource.getFrame(4, 4), null, 'expected stopVideoSource to also clear the browser frame source');

    ws.close();
    server.close();
  });

  await test('a full cube-mode tick after stop() renders the "no source" placeholder, not stale content', () => {
    const core = new CubeCore(8);
    core.effectOptions = { video: { url: 'http://x/video.mp4' } };
    effectVideo(core, 0.05); // may or may not have "started" a fake ensure - either way:
    effectVideo.stop();
    core.colBuf.fill(0.77); // poison the buffer so we can tell effectVideo actually rewrote it
    effectVideo(core, 0.05);
    // Placeholder path clears colBuf and draws a dim pulsing pattern - just
    // confirm it actually ran (colBuf no longer uniformly 0.77 everywhere)
    // rather than skipping/erroring.
    let allPoison = true;
    for (const v of core.colBuf) { if (Math.abs(v - 0.77) > 1e-6) { allPoison = false; break; } }
    assert.strictEqual(allPoison, false, 'expected effectVideo to have rewritten colBuf after stop()');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoStopOnSwitch tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
