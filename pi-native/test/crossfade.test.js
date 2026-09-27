// Tests for tick.js's crossfade between effects.
const assert = require('assert');
const { tick, CROSSFADE_SECS } = require('../src/tick');
const { CubeCore } = require('../src/core');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const noAlarms = { tickCheck() {}, renderMainMessage() {}, isBlockingNormalEffect: () => false, applyDonePhase() {}, renderPrePhase() {} };
const fill = (v) => (core) => core.colBuf.fill(v);
const EFFECTS = { white: fill(1), black: fill(0) };
const config = { mode: '2d' };
const run = (core, effect, dt) => tick(core, { effect, overlays: {}, effectOptions: {} }, config, EFFECTS, {}, noAlarms, () => {}, dt);

console.log('crossfade');
test('the very first effect shows immediately (no fade from nothing)', () => {
  const core = new CubeCore(8);
  run(core, 'white', 1 / 60);
  assert.strictEqual(core.colBuf[0], 1);
});
test('switching effects blends from the old frame to the new one', () => {
  const core = new CubeCore(8);
  run(core, 'white', 1 / 60);
  run(core, 'black', CROSSFADE_SECS / 2);
  const mid = core.colBuf[0];
  assert.ok(mid > 0.1 && mid < 0.9, `mid-fade value ${mid}`);
  run(core, 'black', CROSSFADE_SECS);
  assert.strictEqual(core.colBuf[0], 0, 'fully on the new effect once the fade has elapsed');
});
test('staying on the same effect never fades', () => {
  const core = new CubeCore(8);
  run(core, 'white', 1 / 60);
  run(core, 'white', 1 / 60);
  assert.strictEqual(core.colBuf[0], 1);
});
console.log(process.exitCode ? 'Some crossfade tests FAILED' : 'All crossfade tests passed');
