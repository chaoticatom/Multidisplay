// Regression test for a real report: loading a new image/video (or just
// changing the Fit option) kept showing the OLD content flickering in
// alongside the new one. Root cause: _teardown() SIGKILLs the old ffmpeg
// process, but its stdout 'data' listener stays registered on ITS OWN
// stream object - SIGKILL doesn't retroactively un-emit data already
// sitting in the OS pipe buffer, so a straggler 'data' event from the
// dying process could still fire and mutate this.pending/this.latestFrame
// AFTER a new process had already started, corrupting/overwriting the new
// frame with old bytes. Fixed with a generation counter each data handler
// checks before touching shared state.
const assert = require('assert');
const { EventEmitter } = require('events');
const { FfmpegSource } = require('../src/effects/video/ffmpegSource');

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {}; // deliberately does NOT actually stop stdout from emitting more 'data' - simulates the real SIGKILL-doesn't-retroactively-un-emit-buffered-data race
  return proc;
}

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function run() {
  await test('a straggling "data" event from a torn-down process does not overwrite the new process\'s frame', () => {
    const procs = [];
    const source = new FfmpegSource(() => { const p = fakeProc(); procs.push(p); return p; });

    // Launch the "old" source (e.g. the previous image).
    source.ensure('http://x/old.jpg', 2, 2, 10);
    const oldProc = procs[0];

    // Switch to a "new" source - different key, so ensure() tears down
    // the old process and launches a fresh one.
    source.ensure('http://x/new.jpg', 2, 2, 10);
    assert.strictEqual(procs.length, 2, 'expected a second ffmpeg process to have been launched');
    const newProc = procs[1];

    // The NEW process delivers its first (and only, for this test) frame.
    const newFrame = Buffer.alloc(2 * 2 * 3, 200); // e.g. a bright frame
    newProc.stdout.emit('data', newFrame);
    assert.ok(source.latestFrame, 'expected the new frame to be captured');
    assert.strictEqual(source.latestFrame[0], 200);

    // The OLD (killed) process's stdout still had buffered data in the OS
    // pipe that hadn't been delivered yet - it arrives now, AFTER the new
    // frame. Before the fix, this would silently overwrite latestFrame
    // with stale bytes from the old image.
    const staleOldFrame = Buffer.alloc(2 * 2 * 3, 50); // a dim/different frame
    oldProc.stdout.emit('data', staleOldFrame);

    assert.strictEqual(source.latestFrame[0], 200, 'expected the stale old-process frame to be ignored, not overwrite the current one');
  });

  await test('stop() also invalidates a subsequent straggling "data" event with no relaunch', () => {
    const procs = [];
    const source = new FfmpegSource(() => { const p = fakeProc(); procs.push(p); return p; });
    source.ensure('http://x/video.mp4', 2, 2, 10);
    const proc = procs[0];
    const frame = Buffer.alloc(2 * 2 * 3, 111);
    proc.stdout.emit('data', frame);
    assert.ok(source.latestFrame);

    source.stop();
    assert.strictEqual(source.latestFrame, null);

    // A straggling event from the now-stopped process arrives late.
    proc.stdout.emit('data', Buffer.alloc(2 * 2 * 3, 99));
    assert.strictEqual(source.latestFrame, null, 'expected stop() to have permanently invalidated this process\'s data handler');
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll ffmpegSourceStaleData tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
