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
const { RadioAudio, RemoteAudio, applyRemoteRequest } = require('../src/effects/radio/ffmpegAudio');
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
  // A stereo s16le tone - just needs to be non-silent so the analyser
  // produces non-zero energy somewhere.
  // Half a second: the analyser needs a full (bass) window of audio behind
  // its play cursor before it produces a spectrum.
  const frameSamples = 22050;
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
  }, 150));
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

await test('switching station: the old process exiting late does not disturb the new station', () => {
  // Real kill() is async - the old ffmpeg's 'exit' arrives after the new
  // station has launched. It used to kill the new paplay and null
  // decodeProc, causing relaunch churn (audible flicker on the BT speaker).
  const procs = [];
  const spawnFn = (cmd) => {
    const proc = new EventEmitter();
    proc.cmd = cmd;
    proc.stdout = new PassThrough(); proc.stderr = new PassThrough(); proc.stdin = new PassThrough();
    proc.killed = false;
    proc.kill = () => { proc.killed = true; setImmediate(() => proc.emit('exit', null)); };
    procs.push(proc);
    return proc;
  };
  const audio = new RadioAudio(spawnFn);
  audio.ensure('http://example.invalid/a');
  audio.ensure('http://example.invalid/b');
  const newDecode = audio.decodeProc, newPlay = audio.playProc;
  return new Promise((resolve) => setTimeout(() => {
    assert.strictEqual(audio.decodeProc, newDecode);
    assert.strictEqual(audio.playProc, newPlay);
    assert.strictEqual(newPlay.killed, false, 'new station playback must survive the old process exiting');
    audio.ensure('http://example.invalid/b');
    assert.strictEqual(procs.length, 4, 'no relaunch after the switch');
    audio.close();
    resolve();
  }, 20));
});

await test('RemoteAudio relays ensure/clear to the real RadioAudio only when the render side asks', () => {
  const calls = [];
  const real = { ensure: (u) => calls.push(['ensure', u]), clearDebugFinished: () => calls.push(['clear']) };
  const remote = new RemoteAudio();
  let seen = { ensureCount: 0, clearCount: 0 };
  seen = applyRemoteRequest(real, remote.request(), seen);
  assert.deepStrictEqual(calls, [], 'nothing requested yet');
  remote.clearDebugFinished();
  remote.ensure('http://example.invalid/a');
  seen = applyRemoteRequest(real, remote.request(), seen);
  assert.deepStrictEqual(calls, [['clear'], ['ensure', 'http://example.invalid/a']]);
  seen = applyRemoteRequest(real, remote.request(), seen);
  assert.strictEqual(calls.length, 2, 'no new ensure() while the radio effect is not ticking - lets the idle timeout fire');
  remote.ensure(null);
  applyRemoteRequest(real, remote.request(), seen);
  assert.deepStrictEqual(calls[2], ['ensure', null]);
});

await test('RemoteAudio serves the spectrum/status snapshot sent from the main thread', () => {
  const real = new RadioAudio(makeFakeSpawn(() => ({})));
  real.spec[5] = 0.7; real.peak[5] = 0.9; real.status = 'Playing';
  const remote = new RemoteAudio();
  remote.applySnapshot(structuredClone(real.snapshot()));
  assert.ok(Math.abs(remote.spec[5] - 0.7) < 1e-6 && Math.abs(remote.peak[5] - 0.9) < 1e-6);
  assert.strictEqual(remote.getStatus(), 'Playing');
  real.close();
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

const { F_MIN, F_MAX } = require('../src/effects/radio/fft');
const { softCeil, computeLevels, createLevelState } = require('../src/effects/radio/levels');
const tone = (f, amp, n = 8192) => { const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = amp * Math.sin((2 * Math.PI * f * i) / 44100); return s; };
const peakBand = (b) => { let mi = 0; for (let i = 1; i < b.length; i++) if (b[i] > b[mi]) mi = i; return mi; };
const expectedBand = (f) => Math.round((BAND_COUNT * Math.log(f / F_MIN)) / Math.log(F_MAX / F_MIN));

await test('a tone peaks in the log band for its frequency (30Hz-7kHz)', () => {
  for (const f of [60, 120, 440, 1000, 5000]) {
    const got = peakBand(computeBands(tone(f, 0.5), 44100));
    assert.ok(Math.abs(got - expectedBand(f)) <= 3, `${f}Hz peaked at band ${got}, expected ~${expectedBand(f)}`);
  }
});

await test('bass stays tight: a pure 60Hz tone lights well under a sixth of the bands', () => {
  const b = computeBands(tone(60, 1), 44100);
  const mx = Math.max(...b);
  const lit = b.filter((v) => v > mx / 2).length;
  assert.ok(lit < BAND_COUNT / 6, `60Hz lit ${lit} bands`);
});

await test('dB scale: a quiet tone (-40dB) still registers, silence is zero', () => {
  assert.ok(Math.max(...computeBands(tone(1000, 0.01), 44100)) > 0.2);
  assert.strictEqual(Math.max(...computeBands(new Float32Array(8192), 44100)), 0);
});

await test('softCeil is monotonic, identity below the knee, never reaches 1', () => {
  assert.strictEqual(softCeil(0.5), 0.5);
  let prev = 0;
  for (let x = 0; x <= 5; x += 0.05) { const y = softCeil(x); assert.ok(y >= prev && y < 1); prev = y; }
});

await test('computeLevels: amp/peak arrays sized to the displayed bands, peak >= amp', () => {
  const audio = { spec: new Float32Array(BAND_COUNT).fill(0.4), peak: new Float32Array(BAND_COUNT).fill(0.6) };
  const st = computeLevels(createLevelState(), audio, { bands: 64, gain: 1, autoGain: false, fitToScreen: false }, 1 / 60);
  assert.strictEqual(st.amp.length, 64);
  for (let b = 0; b < 64; b++) assert.ok(st.peak[b] >= st.amp[b] && st.amp[b] > 0.39);
});

await test('ballistics: attack reaches a new level within a few frames, release is gradual', () => {
  const ra = new RadioAudio(makeFakeSpawn(() => ({})));
  const target = new Float32Array(BAND_COUNT).fill(0.8);
  for (let i = 0; i < 4; i++) ra._applySpectrumTarget(target, 1 / 60);
  assert.ok(ra.spec[10] > 0.75, `attack too slow: ${ra.spec[10]}`);
  ra._applySpectrumTarget(new Float32Array(BAND_COUNT), 1 / 60);
  assert.ok(ra.spec[10] > 0.6, 'release should not drop instantly');
  assert.ok(ra.peak[10] >= ra.spec[10]);
  ra.close();
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
