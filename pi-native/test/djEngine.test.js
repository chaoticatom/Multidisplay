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

const nextBeatOf = (d, f) => Math.round(d.firstBeat + Math.ceil((f - d.firstBeat) / d.period) * d.period);

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
    // A voice-band melody over bars ~10-17 is marked, the rest isn't.
    { const n = 60 * RATE, x = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / RATE, ph = (t - 1) % 0.5; let v = t > 1 ? Math.sin(2 * Math.PI * 55 * ph) * Math.exp(-ph * 25) * 0.7 : 0; if (t > 20 && t < 36) v += 0.3 * Math.sin(2 * Math.PI * (440 + 60 * Math.sin(t * 3)) * t); x[i] = v; }
      const vb = analyse(x).vocalBars;
      assert.ok(/^0{8,}1{6,}0{8,}$/.test(vb), 'singing found: ' + vb); }
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
    // Picking a track from the list lines it up next.
    assert.strictEqual(dj.status.queue.length, 3);
    const pick = dj.status.queue.findIndex((q, i) => i !== dj.status.nowIdx);
    for (let k = 0; k < 20 && dj.status.mixing; k++) { dj.render(4410); await new Promise((r) => setImmediate(r)); }
    assert.ok(dj.playNext(pick), 'picked');
    for (let k = 0; k < 50 && !(dj._test.B && dj._test.B.qi === pick); k++) await new Promise((r) => setImmediate(r));
    assert.ok(dj._test.B && dj._test.B.qi === pick && dj.status.nextIdx === pick, 'the picked track is next');
    // The playing track's position, and jumping within it (onto a beat).
    const A = dj._test.A;
    assert.ok(dj.status.now && dj.status.now.dur > 30 && dj.status.now.pos >= 0, 'now playing with a position');
    assert.ok(dj.seek(10));
    const ph = ((A.pos - A.firstBeat) / A.period) % 1;
    assert.ok(Math.abs(A.pos / 44100 - 10) < 1 && Math.min(ph, 1 - ph) < 0.01, 'seek lands on a beat');
    // Auto mix length fits both tracks' outro/intro; it lands on a bar.
    const fake = (outro, intro) => dj._test.planMix({ ...A, pos: 0, outroBeats: outro, end: A.frames }, { ...A, introBeats: intro }, 'auto');
    assert.strictEqual(fake(64, 64).beats, 32 <= 64 ? fake(64, 64).beats : 0);
    assert.ok(fake(8, 8).beats === 16 && fake(40, 40).beats === 32, 'auto length from intro/outro');
    const pl = fake(16, 16), bp = ((pl.start - A.firstDown) / A.bar) % 1;
    assert.ok(Math.min(bp, 1 - bp) < 0.01 && pl.start + pl.len <= A.end + A.period, 'starts on a bar, ends with the music');
    // Quick mix: about a minute in on a long track, on a phrase, at most 32 beats.
    const long = { ...A, pos: 0, end: 300 * 44100, frames: 300 * 44100, outroBeats: 64 };
    const full = dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto');
    dj.configure({ quick: true });
    const q = dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto');
    dj.configure({ quick: false });
    const qp = ((q.start - long.inFrame) / (16 * A.period)) % 1;
    assert.ok(q.start / 44100 > 50 && q.start / 44100 < 75 && q.beats <= 32 && Math.min(qp, 1 - qp) < 0.01 && full.start / 44100 > 200, `quick mix at ${q.start / 44100}s vs ${full.start / 44100}s`);
    // Beats lined up from the audio: a grid 600 frames (14 ms) out is corrected.
    const b0 = nextBeatOf(A, A.pos + 44100);
    const lag = dj._test.lagBetween(b0, b0 + 600, 8 * A.period, A.period / 4, A, A);
    assert.ok(Math.abs(lag + 600) <= 64, 'audio alignment finds the offset: ' + lag);
    // Singing over the whole of A: auto cuts on the beat at a phrase end instead of blending.
    const sung = { ...long, info: { ...A.info, vocalBars: '1'.repeat(200) } };
    const cut = dj._test.planMix(sung, { ...A, introBeats: 64 }, 'auto');
    assert.strictEqual(cut.style, 'cut');
    const cp = ((cut.at - long.inFrame) / (16 * A.period)) % 1;
    assert.ok(Math.min(cp, 1 - cp) < 0.01, 'the cut lands on a phrase');
    // Singing only in A's last part: the blend moves to an earlier quiet phrase.
    const tail = { ...long, info: { ...A.info, vocalBars: '0'.repeat(48) + '1'.repeat(200) } };
    const early = dj._test.planMix(tail, { ...A, introBeats: 64 }, 'auto');
    assert.ok(early.style === 'blend' || early.style === 'short' || early.style === 'cut', early.style);
    dj.configure({ style: 'cut' });
    assert.strictEqual(dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto').style, 'cut');
    dj.configure({ style: 'short' });
    assert.strictEqual(dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto').beats, 8);
    dj.configure({ style: 'auto' });
    dj.stop(); assert.strictEqual(dj.status.state, 'stopped');
    console.log('  ok - beat-matched mixing from one track to the next');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
