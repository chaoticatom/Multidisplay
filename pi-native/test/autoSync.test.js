// Auto speaker sync: the speaker's own delay is the output (sink) latency the
// sound server reports for our paplay stream; the bars add paplay's fixed
// buffer (150 ms, paced) (src/effects/radio/ffmpegAudio.js).
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { RadioAudio, parseStreamLatencyMs } = require('../src/effects/radio/ffmpegAudio');
console.log('autoSync');

const PACTL = `Sink Input #41
	Driver: protocol-native.c
	Buffer Latency: 0 usec
	Sink Latency: 20000 usec
	Properties:
		application.name = "Firefox"
Sink Input #57
	Driver: protocol-native.c
	Buffer Latency: 45000 usec
	Sink Latency: 185000 usec
	Properties:
		application.name = "paplay"
		application.process.binary = "paplay"
`;

try {
  assert.strictEqual(parseStreamLatencyMs(PACTL), 185, 'the output\'s delay only - our own buffer is known');
  assert.strictEqual(parseStreamLatencyMs('Sink Input #1\n\tapplication.name = "mpv"\n'), null);
  assert.strictEqual(parseStreamLatencyMs(''), null);
  console.log('  ok - reads our stream\'s delay from pactl');

  const spawnFn = () => { const p = new EventEmitter(); p.stdout = new PassThrough(); p.stderr = new PassThrough(); p.stdin = new PassThrough(); p.kill = () => {}; return p; };
  let replies = [PACTL, PACTL.replace('185000', '385000')];
  const execFn = (cmd, args, opts, cb) => { assert.strictEqual(cmd, 'pactl'); cb(null, replies.shift() || ''); };
  const audio = new RadioAudio(spawnFn, execFn);
  audio.ensure('http://radio.example/stream');
  audio.setSyncMs('auto');
  assert.strictEqual(Math.round(audio._syncS * 1000), 150 + 200, 'the default until the first reading');
  audio.lastEnsureMs = Date.now(); audio.lastAttemptMs = Date.now();
  audio._checkIdle();
  assert.strictEqual(audio.autoSyncMs, 185);
  assert.strictEqual(Math.round(audio._syncS * 1000), 150 + 185);
  audio._measuredAt = 0; audio._checkIdle(); // the speaker gets slower: eased towards 385
  assert.ok(audio.autoSyncMs > 185 && audio.autoSyncMs < 385, 'eased: ' + audio.autoSyncMs);
  audio.setSyncMs(500); // back to manual
  assert.strictEqual(Math.round(audio._syncS * 1000), 150 + 500);
  console.log('  ok - Auto follows the measured delay; manual still works');
  audio.close();
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
