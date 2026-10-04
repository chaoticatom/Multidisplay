// Self-heal: a stream that goes quiet is reconnected, and speaker playback
// that dies is started again (src/effects/radio/ffmpegAudio.js _checkIdle).
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { RadioAudio } = require('../src/effects/radio/ffmpegAudio');
console.log('radioSelfHeal');

const calls = [], procs = [];
const spawnFn = (cmd) => {
  calls.push(cmd);
  const p = new EventEmitter();
  p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.stdin = new PassThrough();
  p.kill = () => setImmediate(() => p.emit('exit', null));
  procs.push({ cmd, p });
  return p;
};
const count = (c) => calls.filter((x) => x === c).length;

try {
  const audio = new RadioAudio(spawnFn);
  audio.ensure('http://radio.example/stream');
  assert.strictEqual(count('ffmpeg'), 1);
  assert.strictEqual(count('paplay'), 1);

  // Connected, but no audio for over 15 s: reconnect.
  audio.lastAttemptMs = Date.now() - 20000;
  audio._lastDataMs = performance.now() - 20000;
  audio.lastEnsureMs = Date.now();
  audio._checkIdle();
  assert.strictEqual(count('ffmpeg'), 2, 'the stalled stream was reconnected');
  assert.strictEqual(audio.url, 'http://radio.example/stream');
  console.log('  ok - a stream that goes quiet is reconnected');

  // Playback dies (speaker gone): started again on the next check.
  const play = procs.filter((x) => x.cmd === 'paplay').pop().p;
  play.emit('exit', 1);
  assert.strictEqual(audio.playProc, null);
  audio.lastAttemptMs = Date.now(); // fresh stream, not stalled
  audio._checkIdle();
  assert.strictEqual(count('paplay'), 3, 'playback was restarted');
  audio._checkIdle(); // not again straight away
  assert.strictEqual(count('paplay'), 3);
  console.log('  ok - speaker playback that dies is started again');
  audio.close();
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
