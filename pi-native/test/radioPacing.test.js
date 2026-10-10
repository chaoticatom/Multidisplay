'use strict';
// Paced speaker playback (ffmpegAudio.js _onData/_paceTick): a burst of
// decoded audio reaches paplay in real time, and each piece's timestamp for
// phones = when it's written + paplay's buffer + the speaker's delay - so the
// phone, the speaker and the bars line up.
const assert = require('assert');
const { EventEmitter } = require('events');
const { RadioAudio } = require('../src/effects/radio/ffmpegAudio');

(async () => {
  try {
    const audio = new RadioAudio(() => { throw new Error('no spawn in this test'); });
    audio.setSyncMs(250); // the speaker's own delay
    const writes = [];
    const stdin = Object.assign(new EventEmitter(), { writable: true, write(b) { writes.push({ at: Date.now(), bytes: b.length }); return true; } });
    audio.playProc = Object.assign(new EventEmitter(), { stdin });
    const stamps = [];
    audio.onPcm = (chunk, t) => stamps.push({ t, bytes: chunk.length });
    audio._startPacer();
    // A 1-second burst arriving all at once, in 100 ms pieces.
    const piece = Buffer.alloc(17640); // 100 ms of 44.1 kHz stereo s16
    for (let i = 0; i < 10; i++) audio._onData(piece);
    await new Promise((r) => setTimeout(r, 1300));
    audio._stopPacer();
    assert.ok(writes.length >= 8, 'written out over time: ' + writes.length);
    const span = writes[writes.length - 1].at - writes[0].at;
    assert.ok(span > 600, 'paced in real time, not all at once: ' + span + ' ms');
    // Each piece's phone timestamp ~ its write time + 150 (paplay) + 250 (speaker).
    for (let i = 0; i < writes.length; i++) {
      const err = stamps[i].t - (writes[i].at + 150 + 250);
      assert.ok(Math.abs(err) < 60, `piece ${i}: phone time off by ${err} ms`);
    }
    console.log('radioPacing ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
