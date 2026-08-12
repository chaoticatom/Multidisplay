// Internet Radio - unit tests for the parts that don't need real ffmpeg/
// paplay/Bluetooth hardware or real network access (none present in this
// sandbox - see ffmpegAudio.js/search.js module comments). Mirrors
// wifiSetup.test.js's "inject a fake command runner" pattern: RadioAudio
// takes an injectable spawn function (same shape as ../src/effects/video/
// ffmpegSource.js's FfmpegSource), so the ENOENT / successful-decode /
// playback-unavailable paths are all exercised against fake EventEmitter-
// based child processes instead of real binaries.
const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { RadioAudio } = require('../src/effects/radio/ffmpegAudio');
const { computeBands, fft, BAND_COUNT } = require('../src/effects/radio/fft');
const { renderSpectrumStyle, createSpectrumState } = require('../src/effects/radio/spectrum');
const { searchStations } = require('../src/effects/radio/search');
const { CubeCore } = require('../src/core');
const radioEffect = require('../src/effects/radio');

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms: ${label}`)), ms)),
  ]);
}

async function test(name, fn) {
  try {
    await withTimeout(Promise.resolve().then(fn), 5000, name);
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// Fake child_process.spawn(): returns an EventEmitter with .stdout/.stderr
// (real PassThrough streams, so .on('data')/.write() behave like the real
// thing) and .stdin (a PassThrough too, so paplay-mock writes can be
// inspected). `behavior` decides what happens per binary name.
function makeFakeSpawn(behavior) {
  const calls = [];
  return (cmd, args, opts) => {
    calls.push({ cmd, args });
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.kill = () => { proc.emit('exit', null); };
    const b = behavior(cmd, args) || {};
    if (b.enoent) {
      setImmediate(() => { const e = new Error('spawn ' + cmd + ' ENOENT'); e.code = 'ENOENT'; proc.emit('error', e); });
    } else if (b.dataChunks) {
      setImmediate(() => { for (const c of b.dataChunks) proc.stdout.write(c); });
    }
    return proc;
  };
}

async function run() {
console.log('RadioAudio - ffmpeg missing');
await test('ensure() with no ffmpeg installed surfaces a clear status, never throws', () => {
  const spawnFn = makeFakeSpawn((cmd) => (cmd === 'ffmpeg' ? { enoent: true } : { enoent: true }));
  const audio = new RadioAudio(spawnFn);
  assert.doesNotThrow(() => audio.ensure('http://example.invalid/stream'));
  return new Promise((resolve) => setTimeout(() => {
    assert.match(audio.getStatus(), /ffmpeg not found/);
    audio.close();
    resolve();
  }, 20));
});

console.log('RadioAudio - ffmpeg present, paplay missing');
await test('decode succeeds and updates band levels even when playback (paplay) is unavailable', () => {
  // A 2048-sample stereo s16le frame of a 440Hz-ish tone, just needs to be
  // non-silent so computeBands() produces non-zero energy somewhere.
  const frameSamples = 2048;
  const buf = Buffer.alloc(frameSamples * 4);
  for (let i = 0; i < frameSamples; i++) {
    const v = Math.round(Math.sin(i * 0.2) * 20000);
    buf.writeInt16LE(v, i * 4);
    buf.writeInt16LE(v, i * 4 + 2);
  }
  const spawnFn = makeFakeSpawn((cmd) => {
    if (cmd === 'ffmpeg') return { dataChunks: [buf] };
    if (cmd === 'paplay') return { enoent: true }; // simulates "no Bluetooth sink / pulseaudio-utils installed"
    return {};
  });
  const audio = new RadioAudio(spawnFn);
  audio.ensure('http://example.invalid/stream');
  return new Promise((resolve) => setTimeout(() => {
    assert.strictEqual(audio.getStatus(), 'Playing');
    assert.match(audio.getPlaybackStatus(), /paplay not found/);
    let hasEnergy = false;
    for (let b = 0; b < BAND_COUNT; b++) if (audio.spec[b] > 0.01) hasEnergy = true;
    assert.ok(hasEnergy, 'expected at least one non-silent band after decoding a non-silent PCM frame');
    for (let b = 0; b < BAND_COUNT; b++) assert.ok(Number.isFinite(audio.spec[b]) && Number.isFinite(audio.peak[b]));
    audio.close();
    resolve();
  }, 30));
});

await test('ensure(falsy url) tears down and resets status - decode can be verified independently of playback', () => {
  const spawnFn = makeFakeSpawn(() => ({}));
  const audio = new RadioAudio(spawnFn);
  audio.ensure('http://example.invalid/stream');
  audio.ensure(null);
  assert.strictEqual(audio.getStatus(), 'Stopped');
  assert.strictEqual(audio.decodeProc, null);
  audio.close();
});

console.log('fft/computeBands');
await test('computeBands on silence returns all-zero-ish bands, no NaN/throw', () => {
  const silence = new Float32Array(2048);
  const bands = computeBands(silence, 44100);
  assert.strictEqual(bands.length, BAND_COUNT);
  for (const v of bands) assert.ok(Number.isFinite(v) && v >= 0 && v <= 1);
});

await test('computeBands on a loud tone produces some non-zero energy', () => {
  const samples = new Float32Array(2048);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 0.3) * 0.8;
  const bands = computeBands(samples, 44100);
  assert.ok(bands.some((v) => v > 0.05));
});

await test('fft() on a DC-only signal concentrates energy in bin 0, no throw', () => {
  const n = 64;
  const re = new Float32Array(n).fill(1);
  const im = new Float32Array(n);
  assert.doesNotThrow(() => fft(re, im));
  assert.ok(Math.abs(re[0]) > Math.abs(re[10]));
});

console.log('spectrum render styles');
await test('all 14 styles render ~100 ticks of synthetic band data with no NaN/throw and non-zero colBuf', () => {
  const core = new CubeCore(16);
  core.panelMode = 'cube';
  const state = createSpectrumState();
  const styles = ['bars', 'mirror', 'dots', 'blocks', 'outline', 'radial', 'vu', 'waterfall', 'waveform', 'tunnel', 'storm', 'plasma', 'rings', 'fire'];
  for (const style of styles) {
    const spec = new Float32Array(256).map(() => Math.random());
    const peak = spec.map((v) => Math.min(1, v + 0.1));
    const ctx = { amp: (b) => spec[b % 256], peak: (b) => peak[b % 256], bands: 64, theme: 6, t: 0, dt: 1 / 30 };
    for (let i = 0; i < 100; i++) {
      ctx.t += 1 / 30;
      renderSpectrumStyle(core, ctx, style, state);
      for (const v of core.colBuf) assert.ok(Number.isFinite(v), `${style}: non-finite colBuf value`);
    }
    assert.ok(core.colBuf.some((v) => v > 0), `${style}: expected non-zero colBuf content`);
  }
});

console.log('search.searchStations');
await test('degrades cleanly (no throw/hang) when the directory is unreachable', async () => {
  const realFetch = global.fetch;
  global.fetch = () => Promise.reject(new Error('simulated network failure'));
  try {
    const { results, error } = await searchStations('jazz');
    assert.deepStrictEqual(results, []);
    assert.ok(error);
  } finally {
    global.fetch = realFetch;
  }
});

console.log('effectRadio - full tick, no ffmpeg installed');
await test('selecting and playing a station never throws/NaNs even with nothing installed', () => {
  const core = new CubeCore(16);
  core.panelMode = 'cube';
  core.effectOptions = { radio: { spectrumOn: true, bands: 64, style: 'bars', theme: 6 } };
  radioEffect.playStation({ name: 'Test Station', genre: 'Test Genre', url: 'http://example.invalid/stream' });
  for (let i = 0; i < 10; i++) assert.doesNotThrow(() => radioEffect(core, 1 / 30));
  for (const v of core.colBuf) assert.ok(Number.isFinite(v));
  const status = radioEffect.getStatus();
  assert.strictEqual(status.playing, true);
  assert.strictEqual(status.station.name, 'Test Station');
  radioEffect.stopStation();
});

if (process.exitCode) {
  console.log('\nFAILED');
} else {
  console.log('\nAll radio tests passed');
}
process.exit(process.exitCode || 0);
}

run();
