'use strict';
// Auto-DJ split spectrum on the wall: the left half follows the song playing
// (specA), the right half the next one (specB), above the two decks.
const assert = require('assert');
const radio = require('../src/effects/radio/radio');
const { CubeCore } = require('../src/core');
const { BAND_COUNT } = require('../src/effects/radio/fft');

try {
  const loud = new Float32Array(BAND_COUNT).fill(0.9), quiet = new Float32Array(BAND_COUNT).fill(0.55);
  const fake = { spec: loud, peak: loud, specA: loud, specB: quiet, vu: new Float32Array(4), wave: new Float32Array(512),
    djInfo: { now: { title: 'Song One', bpm: 124, key: '8A', dur: 200, pos: 50 }, next: { title: 'Song Two', bpm: 124, key: '9A' }, mixing: false, mixU: 0, mixIn: 30 } };
  radio.getPlaybackState = () => ({ playing: true, currentStation: { url: 'dj:', name: 'Auto-DJ' }, title: 'Song One' });
  Object.defineProperty(radio, 'audio', { value: fake, configurable: true, writable: true });
  const effect = require('../src/effects/radioWall');
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
  core.effectOptions = { radio: { spectrumOn: true, scene: 'hifi', theme: 4, autoGain: false, gain: 1 } };
  for (let i = 0; i < 30; i++) effect(core, 1 / 30);
  const lit = (x0, x1) => { let s = 0; for (let y = 0; y < 30; y++) for (let x = x0; x < x1; x++) { const o = (y * 128 + x) * 3; s += core.wallBuf[o] + core.wallBuf[o + 1] + core.wallBuf[o + 2]; } return s; };
  const magenta = () => { let n = 0; for (let y = 0; y < 34; y++) for (let x = 0; x < 128; x++) { const o = (y * 128 + x) * 3, r = core.wallBuf[o], g = core.wallBuf[o + 1], b = core.wallBuf[o + 2]; if (r > 0.5 && b > 0.4 && g < r * 0.6) n++; } return n; };
  assert.ok(lit(0, 64) > 30 && lit(64, 128) > 30, 'the playing track fills the whole width');
  assert.ok(magenta() > 60, 'the next track rides on top as a magenta line: ' + magenta());
  // Loading the next one: no line yet.
  fake.djInfo = { ...fake.djInfo, next: { title: 'X', status: 'loading' } };
  for (let i = 0; i < 40; i++) effect(core, 1 / 30);
  assert.strictEqual(magenta(), 0, 'no line while the next track is loading');
  console.log('  ok - Auto-DJ: playing track full width, next track as a peak line on top');
} catch (e) { console.error(e); process.exitCode = 1; }
