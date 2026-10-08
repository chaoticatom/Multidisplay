// Synced phone playback: the Pi stamps each piece of speaker audio with
// when the speaker plays it and sends it to subscribed pages.
'use strict';
const assert = require('assert');
const WsServer = require('../src/wsServer');
const { COMMANDS } = require('../src/wsCommands');
console.log('syncAudio');
try {
  const sent = [];
  const sub = { readyState: 1, bufferedAmount: 0, send: (b) => sent.push(b) }, other = { readyState: 1, bufferedAmount: 0, send: () => { throw new Error('not subscribed'); } };
  const server = { _clients: new Set([sub, other]) };
  COMMANDS.audioSub.call(server, sub, { on: true });
  // 4 stereo frames at 44.1 kHz: L/R = (1,2) (3,4) (5,6) (7,8)
  const pcm = Buffer.alloc(16); [1, 2, 3, 4, 5, 6, 7, 8].forEach((v, i) => pcm.writeInt16LE(v, i * 2));
  WsServer.prototype.sendAudio.call(server, pcm, 123456.5);
  assert.strictEqual(sent.length, 1);
  const p = sent[0];
  assert.strictEqual(p.subarray(0, 8).toString('ascii'), 'MDAUDIO1');
  assert.strictEqual(p.readDoubleLE(8), 123456.5);
  assert.deepStrictEqual([p.readInt16LE(16), p.readInt16LE(18), p.readInt16LE(20), p.readInt16LE(22)], [1, 2, 5, 6], 'every other frame: 22.05 kHz');
  console.log('  ok - subscribed pages get stamped 22 kHz stereo; others get nothing');

  sub.bufferedAmount = 1024 * 1024;
  WsServer.prototype.sendAudio.call(server, pcm, 1);
  assert.strictEqual(sent.length, 1, 'a page that cannot keep up is skipped');
  console.log('  ok - a backed-up page is skipped, not buffered');

  const replies = [];
  COMMANDS.clockPing.call(server, { readyState: 1, send: (m) => replies.push(JSON.parse(m)) }, { c: 42 });
  assert.strictEqual(replies[0].cmd, 'clockPong'); assert.strictEqual(replies[0].c, 42); assert.ok(Math.abs(replies[0].s - Date.now()) < 1000);
  console.log('  ok - clock pings are answered with the Pi time');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
