'use strict';
// Auto-DJ (src/dj): analysis finds tempo and beats; the engine plays a
// track, prepares the next with its tempo matched, and mixes it in on the
// beat (bass swap), then carries on to the next.
const assert = require('assert');
const { analyse, RATE } = require('../src/dj/analyse');
const { createDjEngine } = require('../src/dj/engine');

function clickTrack(bpm, secs, rate, off = 1.5, stereo = false) {
  const n = Math.floor(secs * rate), x = stereo ? new Int16Array(n * 2) : new Float32Array(n), period = 60 / bpm;
  for (let i = 0; i < n; i++) {
    const t = i / rate; let v = 0;
    if (t >= off && t < secs - 1) { const ph = (t - off) % period; v = Math.sin(2 * Math.PI * 55 * ph) * Math.exp(-ph * 25) * 0.7 + 0.1 * Math.sin(2 * Math.PI * 330 * t); }
    if (stereo) { x[i * 2] = x[i * 2 + 1] = Math.round(v * 30000); } else x[i] = v;
  }
  return x;
}

(async () => {
  try {
    // Analysis.
    for (const bpm of [118, 126, 132]) {
      const r = analyse(clickTrack(bpm, 40, RATE));
      assert.ok(Math.abs(r.bpm - bpm) < 0.1, `tempo ${bpm} -> ${r.bpm}`);
      const ph = ((r.firstBeat - 1.5) / r.period) % 1;
      assert.ok(Math.min(Math.abs(ph), 1 - Math.abs(ph)) < 0.1, 'beat phase');
      assert.ok(Math.abs(r.musicStart - 1.5) < 0.1 && r.confidence > 0.5);
    }
    console.log('  ok - tempo, beats and where the music is');

    // Engine with fake tracks (no ffmpeg/YouTube): 120 and 124 BPM, 40 s each.
    const tracks = [{ kind: 'mp3', id: 'a', title: 'A', bpm: 120 }, { kind: 'mp3', id: 'b', title: 'B', bpm: 124 }, { kind: 'mp3', id: 'c', title: 'C', bpm: 122 }];
    const tempos = [];
    const sources = { allTracks: async () => tracks.slice(), inputFor: async (t) => ({ url: t.id, bpm: t.bpm }) };
    const decode = {
      decodeAnalysis: async (inp) => clickTrack(inp.bpm, 40, RATE),
      decodePlay: async (inp, tempo) => { tempos.push(tempo); return clickTrack(inp.bpm * tempo, 40 / tempo, 44100, 1.5 / tempo, true); },
    };
    let queued = 0; const logs = [];
    const dj = createDjEngine({ onPcm: (b) => { queued += b.length; }, getQueueMs: () => 0, sources, decode, log: (m) => logs.push(m), setTimer: () => 1, clearTimer: () => {} });
    await dj.start({ source: 'mp3', mixBeats: 16 });
    for (let k = 0; k < 50 && !dj._test.B && !dj._test.A; k++) await new Promise((r) => setImmediate(r));
    // Play ~70 s, letting the background preparation run between blocks.
    let mixedAligned = null;
    for (let s = 0; s < 700; s++) {
      dj.render(4410);
      const A = dj._test.A, B = dj._test.B;
      if (dj.status.mixing && mixedAligned === null) {
        // B's beat grid lands on A's: both a whole number of beats from their grid starts.
        const pa = ((A.pos - A.firstBeat) / A.period) % 1, pb = ((B.pos - B.firstBeat) / B.period) % 1;
        const d = Math.abs(pa - pb); mixedAligned = Math.min(d, 1 - d);
      }
      await new Promise((r) => setImmediate(r));
    }
    assert.ok(dj.status.played >= 1, 'mixed into the next track: ' + logs.join(' | '));
    assert.ok(mixedAligned !== null && mixedAligned < 0.03, 'beats line up during the mix: ' + mixedAligned);
    assert.ok(tempos.some((t) => Math.abs(t - 120 / 124) < 0.01), 'the 124 BPM track was slowed to 120: ' + tempos);
    void queued;
    dj.stop(); assert.strictEqual(dj.status.state, 'stopped');
    console.log('  ok - beat-matched mixing from one track to the next');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
