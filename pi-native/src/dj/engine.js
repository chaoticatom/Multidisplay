// The Auto-DJ: two decks, mixed live like a DJ would.
// While a track plays on deck A, the next is fetched, analysed (tempo, beat
// grid, where the music starts and ends - dj/analyse.js) and decoded with
// its tempo matched to A's (pitch kept). Near A's end, at the start of a
// musical phrase, B is started exactly on A's beat and mixed in over
// `mixBeats` beats: B fades in with its bass cut, half-way the bass swaps
// from A to B (so two kicks never clash), then A fades away. Tracks whose
// beat isn't clear, or whose tempo is too far off (> 8%), get a smooth
// equal-power crossfade instead. Output: stereo 44.1 kHz s16 PCM, produced
// just ahead of the speaker (the radio's paced feed takes it from there).
'use strict';

const RATE = 44100;
const MAX_STRETCH = 0.08;

const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };

function createDjEngine({ onPcm, getQueueMs = () => 0, sources = require('./sources'), decode = require('./decode'), analyse = require('./analyse').analyse, log = console.log, setTimer = setInterval, clearTimer = clearInterval }) {
  const st = { state: 'stopped', error: '', now: null, next: null, mixing: false, played: 0 };
  let cfg = { source: 'both', youtube: '', mixBeats: 32 };
  let list = [], idx = 0, A = null, B = null, preparing = null, timer = null, mix = null, gen = 0;

  function deckFrom(track, info, pcm, tempo, matched) {
    const k = RATE / tempo; // original seconds -> played frames
    const d = { track, info, pcm, frames: pcm.length / 2, tempo, matched, pos: 0, lp: new Float32Array(4) };
    d.period = info.period * k; d.firstBeat = info.firstBeat * k; d.start = info.musicStart * k; d.end = Math.min(d.frames, info.musicEnd * k);
    d.bpm = info.bpm * tempo;
    // Mix in on the first beat of the music; mix out at a phrase (16 beats) boundary.
    d.inFrame = matched ? d.firstBeat + Math.max(0, Math.ceil((d.start - d.firstBeat) / d.period)) * d.period : d.start;
    return d;
  }
  function outStart(d, beats) {
    if (d.matched && d.period > 0) {
      let k = Math.floor((d.end - d.inFrame) / d.period) - beats;
      k = Math.max(16, Math.floor(k / 16) * 16);
      return Math.min(d.end - beats * d.period, d.inFrame + k * d.period);
    }
    return d.end - 12 * RATE;
  }

  async function prepare(track, targetBpm) {
    const input = await sources.inputFor(track);
    const info = analyse(await decode.decodeAnalysis(input));
    let tempo = 1, matched = false;
    if (info.bpm > 0 && info.confidence > 0.25 && targetBpm > 0) {
      const opts = [targetBpm / info.bpm, targetBpm / (info.bpm * 2), targetBpm / (info.bpm / 2)];
      const r = opts.reduce((a, b) => (Math.abs(b - 1) < Math.abs(a - 1) ? b : a));
      if (Math.abs(r - 1) <= MAX_STRETCH) { tempo = r; matched = true; }
    } else if (info.bpm > 0 && info.confidence > 0.25 && !targetBpm) matched = true;
    // Half/double-time matches play the beat grid at the matched rate.
    if (matched && Math.abs(info.bpm * tempo - targetBpm) > 1 && targetBpm) {
      const ratio = (info.bpm * tempo) / targetBpm; info.period *= ratio > 1.5 ? 2 : ratio < 0.67 ? 0.5 : 1;
    }
    const pcm = await decode.decodePlay(input, tempo);
    return deckFrom(track, info, pcm, tempo, matched);
  }

  async function prepareNext() {
    if (preparing || B) return;
    const g = gen;
    preparing = (async () => {
      for (let tries = 0; tries < Math.min(5, list.length); tries++) {
        const track = list[idx % list.length]; idx++;
        if (A && list.length > 1 && track.id === A.track.id) continue;
        try {
          st.next = { title: track.title, status: 'loading' };
          const d = await prepare(track, A && A.matched ? A.bpm : 0);
          if (g !== gen) return;
          // Both tracks must have a clear beat for a beat-matched mix.
          if (A && !A.matched) d.matched = false;
          B = d; st.next = { title: track.title, bpm: Math.round(d.bpm), mode: d.matched && A && A.matched ? 'beat-matched' : 'crossfade' };
          log(`[dj] next: ${track.title} (${Math.round(d.info.bpm)} BPM${d.tempo !== 1 ? ` -> ${Math.round(d.bpm)}` : ''}, ${st.next.mode})`);
          return;
        } catch (e) { log('[dj] skipped ' + track.title + ': ' + e.message); st.error = e.message; }
      }
      st.next = null;
    })().finally(() => { preparing = null; });
  }

  // Starts the mix now (frame-exact: called on A's beat), B on its first beat.
  function startMix(beats) {
    const both = A.matched && B.matched;
    mix = { from: A.pos, len: both ? beats * A.period : 12 * RATE, beat: both };
    B.pos = Math.round(B.inFrame); st.mixing = true;
    log(`[dj] mixing into ${B.track.title} over ${both ? beats + ' beats' : '12 s'}`);
  }
  function promote() {
    A = B; B = null; mix = null; st.mixing = false;
    if (A.pos === 0) A.pos = Math.round(A.inFrame);
    A.out = Math.round(outStart(A, cfg.mixBeats)); A.mixBeats = cfg.mixBeats;
    st.now = { title: A.track.title, bpm: Math.round(A.bpm) }; st.state = 'playing';
    prepareNext();
  }
  // A's next beat at or after frame f.
  const nextBeat = (d, f) => (d.matched && d.period > 0 ? Math.round(d.firstBeat + Math.ceil((f - d.firstBeat) / d.period) * d.period) : f);

  // Two cascaded one-pole low-passes (~170 Hz): the bass, per deck and channel.
  const LPA = 1 - Math.exp(-2 * Math.PI * 170 / RATE);
  function sampleDeck(d, gain, lowGain, out) {
    const f = d.pos;
    let l = 0, r = 0;
    if (f >= 0 && f < d.frames) { l = d.pcm[f * 2] / 32768; r = d.pcm[f * 2 + 1] / 32768; }
    const s = d.lp;
    s[0] += (l - s[0]) * LPA; s[1] += (s[0] - s[1]) * LPA;
    s[2] += (r - s[2]) * LPA; s[3] += (s[2] - s[3]) * LPA;
    out[0] += (l - s[1] + s[1] * lowGain) * gain; out[1] += (r - s[3] + s[3] * lowGain) * gain;
  }

  const OUT = [0, 0];
  function render(frames) {
    const buf = Buffer.alloc(frames * 4);
    for (let i = 0; i < frames; i++) {
      OUT[0] = 0; OUT[1] = 0;
      if (!A && B) promote();
      if (A) {
        // Time to mix (on the beat), or out of track before the next was ready.
        if (B && !mix && (A.pos >= A.out || A.pos >= A.frames)) startMix(A.pos >= A.frames ? 4 : A.mixBeats);
        if (mix) {
          const u = (A.pos - mix.from) / mix.len;
          let ag, al, bg, bl;
          if (mix.beat) { // B in with its bass cut; the bass swaps half-way; then A out
            bg = smooth(u / 0.5); bl = smooth((u - 0.5) / 0.08); al = 1 - bl; ag = 1 - smooth((u - 0.5) / 0.5);
          } else { // an equal-power crossfade
            const c = Math.max(0, Math.min(1, u)); ag = Math.cos(c * Math.PI / 2); bg = Math.sin(c * Math.PI / 2); al = bl = 1;
          }
          sampleDeck(A, ag, al, OUT); sampleDeck(B, bg, bl, OUT);
          A.pos++; B.pos++;
          if (u >= 1) { st.played++; promote(); }
        } else { sampleDeck(A, 1, 1, OUT); A.pos++; }
      }
      for (let c = 0; c < 2; c++) { let v = OUT[c]; if (v > 0.9 || v < -0.9) v = Math.tanh(v); buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), i * 4 + c * 2); }
    }
    if (A && !mix && !B && A.pos >= A.frames) st.state = preparing ? 'loading' : (list.length ? 'loading' : 'empty');
    return buf;
  }

  function pump() {
    if (st.state === 'stopped') return;
    // Keep ~1.5 s of mixed audio ahead of the speaker.
    let n = 0;
    while (getQueueMs() < 1500 && n++ < 20) { if (!A && !B) break; onPcm(render(4410)); }
    if (!A && !B && !preparing && st.state === 'playing') prepareNext();
  }

  async function start(newCfg) {
    stop();
    cfg = { ...cfg, ...(newCfg || {}) };
    cfg.mixBeats = [16, 32, 64].includes(Number(cfg.mixBeats)) ? Number(cfg.mixBeats) : 32;
    const g = ++gen;
    st.state = 'loading'; st.error = ''; st.now = null; st.next = null; st.played = 0;
    try { list = await sources.allTracks(cfg); } catch (e) { if (g === gen) { st.state = 'error'; st.error = e.message; } return; }
    if (g !== gen) return;
    if (!list.length) { st.state = 'empty'; st.error = cfg.source === 'youtube' ? 'No YouTube tracks found' : 'No music yet - add MP3s, or a YouTube playlist or search'; return; }
    idx = 0;
    timer = setTimer(pump, 50);
    prepareNext();
  }
  function stop() { gen++; if (timer) clearTimer(timer); timer = null; A = B = null; mix = null; st.state = 'stopped'; st.mixing = false; st.now = st.next = null; }
  // Skip: mix into the next track now - from A's next beat, over 8 beats.
  function skip() { if (A && !mix) { A.out = nextBeat(A, A.pos + 1); A.mixBeats = 8; if (!B) prepareNext(); } }

  return { start, stop, skip, render, status: st, _test: { deckFrom, outStart, get A() { return A; }, get B() { return B; } } };
}

module.exports = { createDjEngine, RATE };
