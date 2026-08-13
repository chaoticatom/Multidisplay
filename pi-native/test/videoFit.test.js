// Verifies the "Fit" option (Stretch vs Native Ratio) and the '2d'-mode
// panorama/perspective clamp - both real reports:
//   1. "Fit": a way to show video at its native aspect ratio on the 2D
//      display instead of always being stretched to fill the square panel.
//   2. "image and video need to be able to fit on one display 64x64":
//      the default "Panorama" layout decodes a 4S-wide composite meant to
//      wrap around 4 cube faces, but in '2d' single-panel mode only face 0
//      is ever physically shown - without a clamp, that meant a single
//      panel only displayed a cropped 1/4-width slice of the actual
//      image/video instead of the whole frame fitting on the one panel.
//
// Patches child_process.spawn BEFORE requiring video.js/videoWall.js (both
// own a module-level FfmpegSource singleton created at require time using
// the real spawn by default) so these exercise the actual singleton
// video.js/videoWall.js use, not a second throwaway instance.
const assert = require('assert');
const { EventEmitter } = require('events');
const childProcess = require('child_process');

let capturedArgs = null;
const realSpawn = childProcess.spawn;
childProcess.spawn = (cmd, args, opts) => {
  capturedArgs = args;
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
};

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
    let args = null;
    const source = new FfmpegSource((cmd, a) => { args = a; return fakeProc(); });
    source.ensure('http://x/video.mp4', 64, 64, 10);
    assert.strictEqual(vfArg(args), 'scale=64:64');
  });

  await test('fit="contain" adds aspect-preserving scale+pad', () => {
    let args = null;
    const source = new FfmpegSource((cmd, a) => { args = a; return fakeProc(); });
    source.ensure('http://x/video.mp4', 64, 64, 10, 'contain');
    const vf = vfArg(args);
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

  await test('cube mode with layout=panorama decodes a 4S-wide composite (unclamped baseline)', () => {
    capturedArgs = null;
    const core = new CubeCore(8);
    core.panelMode = 'cube';
    core.effectOptions = { video: { url: 'http://x/video.mp4', layout: 'panorama' } };
    effectVideo(core, 0.05);
    assert.ok(capturedArgs, 'expected ffmpeg to be spawned');
    assert.ok(capturedArgs.includes('scale=32:8'), 'expected a 4×8=32 wide decode in cube mode: ' + capturedArgs.join(' '));
  });

  await test('2D panel mode clamps layout=panorama to a single S×S tile, not a cropped 4S-wide slice', () => {
    capturedArgs = null;
    const core = new CubeCore(8);
    core.panelMode = '2d';
    core.effectOptions = { video: { url: 'http://x/video2.mp4', layout: 'panorama' } };
    effectVideo(core, 0.05);
    assert.ok(capturedArgs, 'expected ffmpeg to be spawned');
    assert.ok(capturedArgs.includes('scale=8:8'), 'expected a single 8×8 tile decode in 2d mode, not a 4x-wide composite: ' + capturedArgs.join(' '));
  });

  childProcess.spawn = realSpawn;

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoFit tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
