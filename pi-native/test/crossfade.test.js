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
  run(core, 'black', 0.5); // the default (seamless) takes at least 1 s
  const mid = core.colBuf.reduce((a, v) => a + v, 0) / core.colBuf.length;
  assert.ok(mid > 0.1 && mid < 0.9, `mid-fade value ${mid}`);
  run(core, 'black', 1);
  assert.ok(core.colBuf.every((v) => v === 0), 'fully on the new effect once the transition has elapsed');
});
test('staying on the same effect never fades', () => {
  const core = new CubeCore(8);
  run(core, 'white', 1 / 60);
  run(core, 'white', 1 / 60);
  assert.strictEqual(core.colBuf[0], 1);
});
test('the old effect keeps running underneath while it fades out', () => {
  const core = new CubeCore(8);
  let oldCalls = 0, t = 0;
  const E = { a: (c, dt) => { oldCalls++; t += dt; c.colBuf.fill(Math.min(1, t)); }, b: fill(0) };
  const go = (effect, dt) => tick(core, { effect, overlays: {}, effectOptions: {} }, config, E, {}, noAlarms, () => {}, dt);
  go('a', 0.1); go('b', 0.1); const n0 = oldCalls; go('b', 0.1); go('b', 0.1);
  assert.ok(oldCalls > n0, 'the old effect still drew during the transition');
  go('b', 5); const n1 = oldCalls; go('b', 0.1);
  assert.strictEqual(oldCalls, n1, 'and stops once it is over');
});
console.log(process.exitCode ? 'Some crossfade tests FAILED' : 'All crossfade tests passed');
