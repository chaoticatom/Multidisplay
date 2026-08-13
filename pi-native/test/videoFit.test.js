// Verifies the "Fit" option (Stretch vs Native Ratio) - a real report
// asked for a way to show video at its native aspect ratio on the 2D
// display instead of always being stretched to fill the square panel.
// 'contain' should add ffmpeg's scale+pad filter chain (letterbox/
// pillarbox with black bars, no separate probe step needed - see
// ffmpegSource.js's _launch() module comment); the default 'stretch'
// keeps the original plain scale=w:h behavior unchanged.
const assert = require('assert');
const { EventEmitter } = require('events');
const { FfmpegSource } = require('../src/effects/video/ffmpegSource');
const { CubeCore } = require('../src/core');
const effectVideo = require('../src/effects/video');
const effectVideoWall = require('../src/effects/videoWall');

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

function vfArg(args) { return args[args.indexOf('-vf') + 1]; }

async function run() {
  await test('default fit ("stretch") uses a plain scale filter', () => {
    let capturedArgs = null;
    const source = new FfmpegSource((cmd, args) => { capturedArgs = args; return fakeProc(); });
    source.ensure('http://x/video.mp4', 64, 64, 10);
    assert.strictEqual(vfArg(capturedArgs), 'scale=64:64');
  });

  await test('fit="contain" adds aspect-preserving scale+pad', () => {
    let capturedArgs = null;
    const source = new FfmpegSource((cmd, args) => { capturedArgs = args; return fakeProc(); });
    source.ensure('http://x/video.mp4', 64, 64, 10, 'contain');
    const vf = vfArg(capturedArgs);
    assert.ok(vf.includes('force_original_aspect_ratio=decrease'), 'expected aspect-preserving scale: ' + vf);
    assert.ok(vf.includes('pad=64:64'), 'expected a pad to the full target dims: ' + vf);
  });

  await test('changing fit for the same url/dims restarts the process (different ensure() key)', () => {
    let launches = 0;
    const source = new FfmpegSource(() => { launches++; return fakeProc(); });
    source.ensure('http://x/video.mp4', 64, 64, 10, 'stretch');
    source.ensure('http://x/video.mp4', 64, 64, 10, 'contain');
    assert.strictEqual(launches, 2, 'expected a fresh ffmpeg launch when fit changes, got ' + launches);
  });

  await test('video.js (cube) reads effectOptions.video.fit and does not throw for either value', () => {
    const core = new CubeCore(8);
    for (const fit of ['stretch', 'contain', undefined]) {
      core.effectOptions = { video: { url: '', fit } };
      assert.doesNotThrow(() => effectVideo(core, 0.05));
    }
  });

  await test('videoWall.js reads effectOptions.video.fit and does not throw for either value', () => {
    const core = new CubeCore(64);
    core.initWall([{ gx: 0, gy: 0 }], 64);
    for (const fit of ['stretch', 'contain', undefined]) {
      core.effectOptions = { video: { url: '', fit } };
      assert.doesNotThrow(() => effectVideoWall(core, 0.05));
    }
  });

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoFit tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
