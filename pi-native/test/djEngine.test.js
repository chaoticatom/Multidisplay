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
    // Song structure: a change of chords every 30 s shows as new sections there; loudness as heard.
    { const n = 90 * RATE, x = new Float32Array(n);
      for (let i = 0; i < n; i++) { const t = i / RATE, ph = (t - 1) % 0.5, f = [220, 330, 262][t < 30 ? 0 : t < 60 ? 1 : 2]; x[i] = t > 1 ? Math.sin(2 * Math.PI * 55 * ph) * Math.exp(-ph * 25) * 0.7 + 0.2 * Math.sin(2 * Math.PI * f * t) : 0; }
      const r = analyse(x), at = [...r.sectionBars].map((c, j) => (c === '1' ? j * 2 : -1)).filter((v) => v >= 0);
      assert.ok(at.some((s) => Math.abs(s - 30) <= 4) && at.some((s) => Math.abs(s - 60) <= 4), 'sections at 30 s and 60 s: ' + at.join(','));
      assert.ok(r.lufs < -5 && r.lufs > -40, 'LUFS ' + r.lufs); }
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
    await dj.start({ source: 'mp3', mixBeats: 16, style: 'blend' });
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
    assert.ok(tempos.some((t) => Math.abs(t - 120 / 124) < 0.01 || Math.abs(t - 120 / 122) < 0.01), 'the next track was tempo-matched to 120 (the closest one picked first): ' + tempos);
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
    const fakeL = (outro, intro) => dj._test.planMix({ ...A, pos: 0, outroBeats: outro, end: 300 * 44100, frames: 300 * 44100 }, { ...A, introBeats: intro }, 'auto');
    assert.ok(fakeL(8, 8).beats === 16 && fakeL(40, 40).beats === 32 && fakeL(64, 64).beats === 64, `auto length from intro/outro: ${fakeL(8, 8).beats} ${fakeL(40, 40).beats} ${fakeL(64, 64).beats}`);
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
    // Singing in lines (4 bars sung, 4 quiet, over and over): whatever auto
    // picks, A isn't singing once B takes over, or where a cut drops it.
    dj.configure({ style: 'auto' });
    const lines = '99990000'.repeat(40);
    const sungAt = (f0, f1) => { let m = 0; for (let j = Math.floor((f0 - A.firstDown) / A.vbBar + 0.02); j <= Math.floor((f1 - A.firstDown) / A.vbBar - 0.02); j++) m = Math.max(m, Number(lines[j] || 0)); return m; };
    const lined = { ...long, info: { ...A.info, vocalLevel: lines } };
    const pk = dj._test.planMix(lined, { ...A, introBeats: 64, info: { ...A.info, vocalLevel: '0'.repeat(200) } }, 'auto');
    const over = pk.style === 'cut' ? [pk.at, pk.at + 2 * A.bar] : pk.style === 'short' ? [pk.start, pk.start + pk.len] : [pk.start + Math.max(1, Math.round(pk.beats / 8)) * 4 * A.period, pk.start + pk.len]; // a blend may start under A's last line, but A must be done singing by the swap
    assert.strictEqual(sungAt(over[0], over[1]), 0, `${pk.style} ${pk.beats} at bar ${(pk.start - A.firstDown) / A.bar} lands on singing`);
    // Singing all the way through: a long merge (B creeps in underneath), not a cut.
    const sung = { ...long, info: { ...A.info, vocalLevel: '9'.repeat(200), energyBars: '6'.repeat(200) } };
    const s2 = dj._test.planMix(sung, { ...A, introBeats: 64, info: { ...A.info, vocalLevel: '0'.repeat(200), energyBars: '6'.repeat(200) } }, 'auto');
    assert.ok((s2.style === 'blend' || s2.style === 'mashup') && s2.beats >= 16, 'a long merge (or its vocal over the next beat) rather than a cut: ' + s2.style);
    // Entry points in the next song: after a long quiet intro, or into its
    // drop - a cut goes straight in there rather than through the intro.
    const dropB = { ...A, end: 300 * 44100, frames: 300 * 44100, introBeats: 64, info: { ...A.info, vocalLevel: '0'.repeat(200), energyBars: '1'.repeat(16) + '9'.repeat(184) } };
    const ents = dj._test.entries(dropB);
    assert.ok(ents.some((x) => x.kind === 'drop' || x.kind === 'full'), 'finds the drop: ' + JSON.stringify(ents.map((x) => x.kind)));
    dj.configure({ style: 'cut' });
    const intoDrop = dj._test.planMix({ ...long, info: { ...A.info, vocalLevel: '0'.repeat(200), energyBars: '8'.repeat(200) } }, dropB, 'auto');
    dj.configure({ style: 'auto' });
    assert.ok(intoDrop.entry !== 'intro' && intoDrop.bIn > dropB.inFrame, 'a cut lands in the next song\'s drop: ' + intoDrop.entry);
    // Rock and pop (a live drummer's drifting beat): radio-style changes - the
    // next song under the fade-out, or straight on from a dead stop.
    const live = { ...long, steady: false, endKind: 'fade', fadeStart: long.end - 10 * 44100 };
    const uf = dj._test.planMix(live, { ...A, steady: false }, 'auto');
    assert.ok(uf.style === 'underfade' && uf.start > live.fadeStart && uf.start < live.end, 'under the fade: ' + uf.style);
    const cold = dj._test.planMix({ ...live, endKind: 'cold' }, { ...A, steady: false }, 'auto');
    assert.ok(cold.style === 'segue' && Math.abs(cold.start - (live.end - 0.25 * 44100)) < 44100, 'straight on from the last hit: ' + cold.style);
    // 👍/👎 nudges the style's weight (saved by the server).
    const tasteNow = dj.rate(false);
    assert.ok(Object.values(tasteNow).some((v) => v < 0), 'a 👎 lowers the last style: ' + JSON.stringify(tasteNow));
    dj.configure({ taste: {} });
    // Every pair decides afresh: a track that starts straight in (no intro)
    // with a clashing key gets an instant cut; a smooth pair gets a blend.
    const clashA = { ...long, keyNow: { pc: 0, minor: false, camelot: '8B' } }, clashB = { ...A, introBeats: 0, keyNow: { pc: 6, minor: false, camelot: '2B' } };
    assert.strictEqual(dj._test.planMix(clashA, clashB, 'auto').style, 'cut', 'clashing keys, no intro: cut');
    assert.strictEqual(dj._test.planMix({ ...long, keyNow: clashA.keyNow }, { ...A, introBeats: 64, keyNow: clashA.keyNow }, 'auto').style, 'blend', 'matching keys with an intro: blend');
    // Skip ('now'): the quietest of the next 8 bars.
    const sk = dj._test.planMix({ ...lined, pos: long.inFrame + 32 * A.bar - 100 }, { ...A, introBeats: 16 }, 8, true);
    assert.strictEqual(sungAt(sk.start, sk.start + sk.len), 0, 'skip waits for a quiet bar');
    dj.configure({ style: 'cut' });
    assert.strictEqual(dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto').style, 'cut');
    dj.configure({ style: 'short' });
    assert.strictEqual(dj._test.planMix(long, { ...A, introBeats: 64 }, 'auto').beats, 8);
    dj.configure({ style: 'auto' });
    // Tempos too far apart to beat-match: an effect transition (echo, filter,
    // brake, roll) or a crossfade - never a beat-matched blend.
    const fx = dj._test.planMix({ ...long, matched: true }, { ...A, matched: false, bpm: 160 }, 'auto');
    assert.ok(['echo', 'filter', 'brake', 'roll', 'fade'].includes(fx.style) && fx.why, 'effect transition: ' + fx.style);
    // Removing a song from the list: not the one playing; the rest shift down.
    const before = dj.status.queue.length, nowI = dj.status.nowIdx;
    assert.strictEqual(dj.remove(nowI), false, 'the playing song stays');
    const other = dj.status.queue.findIndex((q, i) => i !== nowI && i !== dj.status.nextIdx);
    if (other >= 0) { assert.ok(dj.remove(other)); assert.strictEqual(dj.status.queue.length, before - 1); assert.ok(dj.status.nowIdx === (other < nowI ? nowI - 1 : nowI), 'the playing index follows'); }
    // Adding a song: 'next' goes straight after the one playing.
    const n0 = dj.status.queue.length, at = dj.add({ kind: 'yt', id: 'addedsong01', title: 'Added', name: 'Added', artist: 'Band' }, true);
    assert.ok(at === dj.status.nowIdx + 1 && dj.status.queue.length === n0 + 1 && dj.status.queue[at].artist === 'Band', 'added next');
    // A hint of the next song: B's most sung bars, over a quiet phrase of A,
    // well before the mix (or none - it's only sometimes).
    let tz = null;
    const hookB = { ...A, end: 300 * 44100, frames: 300 * 44100, info: { ...A.info, vocalLevel: '0'.repeat(20) + '99' + '0'.repeat(100) } };
    const quietA = { ...long, pos: 0, info: { ...A.info, vocalLevel: '0'.repeat(200) } };
    for (let k = 0; k < 20 && !tz; k++) tz = dj._test.planTease(quietA, hookB);
    assert.ok(tz, 'a hint gets planned (some of the time)');
    const hb = Math.round((tz.bFrom - hookB.firstDown) / hookB.vbBar);
    assert.strictEqual(hb, 20, 'from the next song\'s hook');
    const tph = ((tz.at - long.inFrame) / (16 * A.period)) % 1;
    assert.ok(tz.len === Math.round(2 * A.bar) && Math.min(tph, 1 - tph) < 0.01, 'two bars, on a phrase');
    assert.strictEqual(dj._test.planTease({ ...quietA, info: { ...A.info, vocalLevel: '9'.repeat(200) } }, hookB), null, 'never over singing');
    // Quick mix applies to effect transitions too: about a minute in.
    dj.configure({ quick: true });
    const qfx = dj._test.planMix({ ...long, matched: true }, { ...A, matched: false, bpm: 160 }, 'auto');
    dj.configure({ quick: false });
    assert.ok(qfx.start / 44100 > 50 && qfx.start / 44100 < 125, 'quick effect transition at ' + qfx.start / 44100 + ' s');
    dj.stop(); assert.strictEqual(dj.status.state, 'stopped');
    console.log('  ok - beat-matched mixing from one track to the next');
    // Very different tempos (100 and 150 BPM): it still gets from one to the
    // next, through an effect, with clean audio (no NaN, no silence gap).
    const far = [{ kind: 'mp3', id: 'x', title: 'X', bpm: 100 }, { kind: 'mp3', id: 'y', title: 'Y', bpm: 150 }];
    let bad = 0, styles = [];
    const dj2 = createDjEngine({ onPcm: () => {}, getQueueMs: () => 0, sources: { allTracks: async () => far.slice(), inputFor: async (t) => ({ url: t.id, bpm: t.bpm }) }, decode, log: (m) => { const mm = m.match(/\((echo out|filter sweep|brake stop|loop roll|smooth crossfade)[^)]*\)/); if (mm) styles.push(mm[1]); }, setTimer: () => 1, clearTimer: () => {} });
    await dj2.start({ source: 'mp3', style: 'auto' });
    for (let k = 0; k < 50 && !dj2._test.A; k++) await new Promise((r) => setImmediate(r));
    for (let s = 0; s < 700 && dj2.status.played < 1; s++) { const b = dj2.render(4410); for (let i = 0; i < b.length; i += 2) { const v = b.readInt16LE(i); if (!Number.isFinite(v)) bad++; } await new Promise((r) => setImmediate(r)); }
    assert.ok(dj2.status.played >= 1 && bad === 0, 'got through an effect transition: ' + styles.join(','));
    dj2.stop();
    // After a beat-matched mix the new song eases back to its own tempo (in
    // steps on phrases) before the next one is lined up.
    {
      const songs = [{ kind: 'mp3', id: 'p', title: 'P', bpm: 120 }, { kind: 'mp3', id: 'q', title: 'Q', bpm: 125 }];
      const L = 130, logs3 = [];
      const dec = { decodeAnalysis: async (inp) => clickTrack(inp.bpm, L, RATE), decodePlay: async (inp, tempo) => clickTrack(inp.bpm * tempo, L / tempo, 44100, 1.5 / tempo, true) };
      const dj3 = createDjEngine({ onPcm: () => {}, getQueueMs: () => 0, sources: { allTracks: async () => songs.slice(), inputFor: async (t) => ({ url: t.id, bpm: t.bpm }) }, decode: dec, log: (m) => logs3.push(m), setTimer: () => 1, clearTimer: () => {} });
      await dj3.start({ source: 'mp3', style: 'blend', mixBeats: 16 });
      for (let k = 0; k < 50 && !dj3._test.A; k++) await new Promise((r) => setImmediate(r));
      for (let s2 = 0; s2 < 4000 && !(logs3.some((m) => /tempo eased to/.test(m)) && dj3._test.A && Math.abs(dj3._test.A.tempo - 1) < 0.02); s2++) { dj3.render(4410); await new Promise((r) => setImmediate(r)); }
      assert.ok(logs3.some((m) => /tempo eased to/.test(m)) && Math.abs(dj3._test.A.tempo - 1) < 0.02, 'eased back to its own tempo: ' + logs3.filter((m) => /eased|mixing/.test(m)).join(' | '));
      dj3.stop();
    }
    console.log('  ok - effect transitions for tempos too far apart (' + styles.join(', ') + ')');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
