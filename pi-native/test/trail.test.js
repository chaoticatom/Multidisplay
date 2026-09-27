// Tests for src/effects/trail.js - frame-rate-independent trail fades.
const assert = require('assert');
const { trailFade } = require('../src/effects/trail');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const close = (a, b) => Math.abs(a - b) < 1e-9;

console.log('trail');
test('at 30Hz the factor is exactly the tuned per-frame constant', () => {
  assert.ok(close(trailFade(0.78, 1 / 30), 0.78));
});
test('one second of fading is the same at 30Hz and 60Hz', () => {
  let a = 1, b = 1;
  for (let i = 0; i < 30; i++) a *= trailFade(0.78, 1 / 30);
  for (let i = 0; i < 60; i++) b *= trailFade(0.78, 1 / 60);
  assert.ok(close(a, b), `${a} vs ${b}`);
});
test('dt = 0 (paused) does not fade at all', () => {
  assert.strictEqual(trailFade(0.5, 0), 1);
});
console.log(process.exitCode ? 'Some trail tests FAILED' : 'All trail tests passed');
