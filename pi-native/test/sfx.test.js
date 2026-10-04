// Sound effects (src/sfx.js): synthesis, and playback through a faked paplay.
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const sfx = require('../src/sfx');
console.log('sfx');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }
t('every sound synthesises to 16-bit PCM in range', () => {
  for (const name of Object.keys(sfx.SOUNDS)) {
    const b = sfx.synth(name, 1);
    assert.ok(b && b.length > 100 && b.length % 2 === 0, name);
  }
  assert.strictEqual(sfx.synth('nope'), null);
});
t('plays through paplay --raw, and rate-limits repeats', () => {
  const calls = [];
  const spawn = (cmd, args) => { const p = new EventEmitter(); p.stdin = new EventEmitter(); p.stdin.end = (buf) => { calls.push({ cmd, args, bytes: buf.length }); setImmediate(() => p.emit('close', 0)); }; return p; };
  assert.strictEqual(sfx.play('laser', 0.5, spawn), true);
  assert.strictEqual(sfx.play('laser', 0.5, spawn), false, 'the same sound twice within 80 ms is skipped');
  assert.strictEqual(calls[0].cmd, 'paplay');
  assert.ok(calls[0].args.includes('--raw') && calls[0].args.includes('--channels=1'));
});
if (failed) process.exitCode = 1;
