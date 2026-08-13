// Verifies FfmpegSource adds `-loop 1` for a still-image source (so ffmpeg
// keeps re-emitting the same decoded frame from one long-lived process
// instead of hitting a clean EOF and having to be respawned every decode
// cycle - see ffmpegSource.js's _launch() module comment). A real report
// traced choppy/inconsistent display of an uploaded image to exactly the
// missing-loop, constant-respawn behavior this fixes.
const assert = require('assert');
const { EventEmitter } = require('events');
const { FfmpegSource } = require('../src/effects/video/ffmpegSource');

function fakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

async function run() {
  await test('a still-image URL gets -loop 1 as an input option (before -i)', () => {
    let capturedArgs = null;
    const spawnFn = (cmd, args) => { capturedArgs = args; return fakeProc(); };
    const source = new FfmpegSource(spawnFn);
    source.ensure('/uploads/abc123_photo.jpg', 64, 64, 10);
    assert.ok(capturedArgs, 'expected ffmpeg to be spawned');
    const iIdx = capturedArgs.indexOf('-i');
    assert.ok(iIdx > 0, 'expected -i in the args');
    assert.strictEqual(capturedArgs[iIdx - 2], '-loop');
    assert.strictEqual(capturedArgs[iIdx - 1], '1');
  });

  await test('a video URL does NOT get -loop 1', () => {
    let capturedArgs = null;
    const spawnFn = (cmd, args) => { capturedArgs = args; return fakeProc(); };
    const source = new FfmpegSource(spawnFn);
    source.ensure('/uploads/abc123_clip.mkv', 64, 64, 10);
    assert.ok(capturedArgs, 'expected ffmpeg to be spawned');
    assert.ok(!capturedArgs.includes('-loop'), 'expected no -loop flag for a video source, got: ' + capturedArgs.join(' '));
  });

  await test('image extensions are matched case-insensitively, including a mid-upload .part suffix', () => {
    for (const url of ['/uploads/x_photo.PNG', '/uploads/x_photo.jpeg', '/uploads/x_photo.webp.part']) {
      let capturedArgs = null;
      const spawnFn = (cmd, args) => { capturedArgs = args; return fakeProc(); };
      const source = new FfmpegSource(spawnFn);
      source.ensure(url, 64, 64, 10);
      assert.ok(capturedArgs.includes('-loop'), `expected -loop for ${url}, got: ` + capturedArgs.join(' '));
    }
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll ffmpegSourceImageLoop tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
