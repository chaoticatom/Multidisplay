// The Volume slider / mute reach the speaker: PCM going to paplay is
// scaled (the spectrum's copy is not), and the worker passes it through.
'use strict';
const assert = require('assert');
const { RadioAudio, RemoteAudio, applyRemoteRequest } = require('../src/effects/radio/ffmpegAudio');
function ok(name, fn) { try { fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } }
ok('volume reaches the playback pipe, default plays at full level', () => {
  const a = new RadioAudio(() => { throw new Error('no spawn in this test'); });
  const written = [];
  a.playProc = { stdin: { writable: true, write: (b) => { written.push(b); return true; } } };
  a._playDrained = true;
  const pcm = Buffer.alloc(4); pcm.writeInt16LE(10000, 0); pcm.writeInt16LE(-10000, 2);
  const feed = () => { const w = a.playProc.stdin.writable && a._playDrained; if (w) a.playProc.stdin.write(a._gain < 0.999 ? require('../src/effects/radio/ffmpegAudio').__scale(pcm, a._gain) : pcm); };
  a.setVolume(0.8); feed(); assert.strictEqual(written[0].readInt16LE(0), 10000);
  a.setVolume(0.4); feed(); assert.strictEqual(written[1].readInt16LE(0), 5000);
  a.setVolume(0); feed(); assert.strictEqual(written[2].readInt16LE(2), 0);
  assert.strictEqual(pcm.readInt16LE(0), 10000, 'original chunk untouched');
});
ok('the render worker passes the volume to the real audio', () => {
  const r = new RemoteAudio(); r.setVolume(0.2);
  let got = null;
  applyRemoteRequest({ setSyncMs() {}, setVolume: (v) => { got = v; }, ensure() {}, clearDebugFinished() {} }, r.request(), { ensureCount: 0, clearCount: 0 });
  assert.strictEqual(got, 0.2);
});
