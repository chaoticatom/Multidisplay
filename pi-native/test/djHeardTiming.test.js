'use strict';
// The Auto-DJ's display follows what's HEARD: the engine mixes ahead of the
// speaker (queue + speaker delay), so its status is shown that much later.
const assert = require('assert');
const { RadioAudio } = require('../src/effects/radio/ffmpegAudio');

try {
  const ra = Object.create(RadioAudio.prototype); // no processes: just the timing logic
  ra.url = 'dj:'; ra._syncS = 0.2; ra._djQueue = () => 1800; // 1.8 s queued + 0.2 s speaker = heard 2 s later
  const st = { state: 'playing', mixing: false, mixU: 0, eq: [1, 1, 1, 0, 0, 0], now: { title: 'A', pos: 0 }, next: null, mixIn: 5 };
  ra.dj = { status: st };
  const realNow = Date.now; let t = 1e9; Date.now = () => t;
  for (let i = 0; i < 100; i++) { st.mixing = i >= 50; st.mixU = i >= 50 ? (i - 50) / 50 : 0; st.now = { title: 'A', pos: i * 0.05 }; ra.djInfo; t += 50; }
  // Now (5 s in) the engine is 50% through a mix that began 2.5 s ago; heard: 0.5 s into it.
  const heard = ra.djInfo;
  Date.now = realNow;
  assert.ok(heard.mixing && heard.mixU > 0.15 && heard.mixU < 0.3, 'shows the mix as heard, not as mixed: ' + heard.mixU);
  assert.ok(Math.abs(heard.now.pos - 2.95) < 0.15, 'song position as heard: ' + heard.now.pos);
  // Which change it is stays the same however often it's read (the light show
  // keys off it: it changed style every second when it moved).
  Date.now = () => t; st.doneAt = t; for (let i = 0; i < 60; i++) { t += 50; ra.djInfo; }
  const id1 = ra.djInfo.doneId; t += 1000; const id2 = ra.djInfo.doneId; Date.now = realNow;
  assert.ok(id1 && id1 === id2, 'the change id holds still: ' + id1 + ' / ' + id2);
  console.log('  ok - Auto-DJ display in step with the sound');
} catch (e) { console.error(e); process.exitCode = 1; }
