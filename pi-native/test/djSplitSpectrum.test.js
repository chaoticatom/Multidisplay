'use strict';
// Auto-DJ split spectrum on the wall: the left half follows the song playing
// (specA), the right half the next one (specB), above the two decks.
const assert = require('assert');
const radio = require('../src/effects/radio/radio');
const { CubeCore } = require('../src/core');
const { BAND_COUNT } = require('../src/effects/radio/fft');

try {
  const loud = new Float32Array(BAND_COUNT).fill(0.9), quiet = new Float32Array(BAND_COUNT);
  const fake = { spec: loud, peak: loud, specA: loud, specB: quiet, vu: new Float32Array(4), wave: new Float32Array(512),
    djInfo: { now: { title: 'Song One', bpm: 124, key: '8A', dur: 200, pos: 50 }, next: { title: 'Song Two', bpm: 124, key: '9A' }, mixing: false, mixU: 0, mixIn: 30 } };
  radio.getPlaybackState = () => ({ playing: true, currentStation: { url: 'dj:', name: 'Auto-DJ' }, title: 'Song One' });
  Object.defineProperty(radio, 'audio', { value: fake, configurable: true, writable: true });
  const effect = require('../src/effects/radioWall');
  const core = new CubeCore(64); core.initWall([{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }], 64);
  core.effectOptions = { radio: { spectrumOn: true, scene: 'hifi', autoGain: false, gain: 1 } };
  for (let i = 0; i < 30; i++) effect(core, 1 / 30);
  const sum = (x0, x1) => { let s = 0; for (let y = 0; y < 40; y++) for (let x = x0; x < x1; x++) { const o = (y * 128 + x) * 3; s += core.wallBuf[o] + core.wallBuf[o + 1] + core.wallBuf[o + 2]; } return s; };
  const left = sum(0, 64), right = sum(64, 128);
  assert.ok(left > 50, 'the playing song shows on the left: ' + left);
  assert.ok(right < left * 0.4, `the next song (quiet here) on the right: ${right} vs ${left}`);
  // Swap: a loud next song shows on the right.
  fake.specB = loud; fake.specA = quiet;
  for (let i = 0; i < 60; i++) effect(core, 1 / 30);
  assert.ok(sum(64, 128) > sum(0, 64), 'the right half follows the next song');
  console.log('  ok - split spectrum: playing on the left, next on the right');
} catch (e) { console.error(e); process.exitCode = 1; }
