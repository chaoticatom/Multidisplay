// Tests the render worker thread end to end (mock driver): ticks in,
// frames out through the shared buffers, including a wall-mode resize.
process.env.DRIVER = 'mock';
const assert = require('assert');
const path = require('path');
const { Worker } = require('worker_threads');

const { OV_DEFAULTS } = require('../src/effects/overlays');
const state = { effect: 'gradient_wash', brightness: 1, speed: 1, overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), effectOptions: {}, alarms: [] };

function nextFrame(worker, msg) {
  return new Promise((resolve, reject) => {
    const onMsg = (m) => { if (m.type === 'frame') { worker.off('message', onMsg); resolve(m); } };
    worker.on('message', onMsg);
    worker.once('error', reject);
    worker.postMessage(msg);
  });
}

(async () => {
  console.log('renderWorker');
  const worker = new Worker(path.join(__dirname, '..', 'src', 'renderWorker.js'), { workerData: { config: { size: 16, mode: '2d', panels: [] } } });
  try {
    const f1 = await nextFrame(worker, { type: 'tick', state, dt: 1 / 60, radioAudio: null });
    assert.ok(f1.colShared instanceof Float32Array && f1.colShared.buffer instanceof SharedArrayBuffer, 'first frame carries the shared colour buffer');
    assert.strictEqual(f1.colLen, f1.colShared.length);
    assert.ok(f1.colShared.some((v) => v > 0), 'frame has content');
    console.log('  ok - first frame arrives through a SharedArrayBuffer');

    const before = Float32Array.from(f1.colShared);
    const f2 = await nextFrame(worker, { type: 'tick', state: null, dt: 0.5, radioAudio: null });
    assert.strictEqual(f2.colShared, undefined, 'unchanged size: buffer is not re-sent');
    assert.ok(f1.colShared.some((v, i) => v !== before[i]), 'the same shared buffer is updated in place');
    console.log('  ok - later frames reuse the shared buffer (state omitted = last state kept)');

    worker.postMessage({ type: 'config', config: { size: 16, mode: 'wall', panels: [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }] } });
    const f3 = await nextFrame(worker, { type: 'tick', state, dt: 1 / 60, radioAudio: null });
    assert.ok(f3.wallShared instanceof Float32Array && f3.wallLen === 32 * 16 * 3, 'wall mode gets its own shared buffer');
    console.log('  ok - switching to wall mode sends a correctly sized wall buffer');
    console.log('All renderWorker tests passed');
  } catch (err) {
    console.error('  FAIL -', err.stack || err.message);
    process.exitCode = 1;
  } finally {
    await worker.terminate();
  }
})();
