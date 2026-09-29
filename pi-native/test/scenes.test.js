// Tests for scenes (src/scenes.js), their commands, and timers firing a
// scene / reporting what they changed.
const assert = require('assert');
const os = require('os');
const path = require('path');
require('../src/settingsStore')._setStorePath(path.join(os.tmpdir(), `scenes-${process.pid}-${Date.now()}.json`));
const scenes = require('../src/scenes');
const { COMMANDS } = require('../src/wsCommands');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const baseState = () => ({
  effect: 'plasma', effectOptions: { plasma: { a: 1 }, rain: { style: 'matrix' } },
  overlays: { stars: { on: true } }, brightness: 0.8, speed: 1.5, musicReact: { on: true, amount: 0.4 }, scenes: [],
});

console.log('scenes');
test('capture then apply restores the display, leaving other effects\' options alone', () => {
  const st = baseState();
  const sc = scenes.capture(st, ' Party ');
  assert.strictEqual(sc.name, 'Party');
  Object.assign(st, { effect: 'rain', brightness: 0.2, speed: 1, overlays: {}, musicReact: { on: false, amount: 0.6 }, blank: true });
  scenes.apply(st, sc);
  assert.strictEqual(st.effect, 'plasma');
  assert.deepStrictEqual(st.effectOptions.plasma, { a: 1 });
  assert.deepStrictEqual(st.effectOptions.rain, { style: 'matrix' });
  assert.strictEqual(st.brightness, 0.8);
  assert.strictEqual(st.blank, false);
  assert.deepStrictEqual(st.overlays, { stars: { on: true } });
});
test('saveScene / applyScene / deleteScene commands persist and broadcast', () => {
  let broadcasts = 0;
  const server = { state: baseState(), _broadcast() { broadcasts++; }, _stateMsg: () => ({}) };
  COMMANDS.saveScene.call(server, null, { name: 'Chill' });
  assert.deepStrictEqual(scenes.load().map((s) => s.name), ['Chill']);
  server.state.effect = 'rain';
  COMMANDS.applyScene.call(server, null, { name: 'Chill' });
  assert.strictEqual(server.state.effect, 'plasma');
  COMMANDS.saveScene.call(server, null, { name: 'Chill' }); // overwrite, not duplicate
  assert.strictEqual(scenes.load().length, 1);
  COMMANDS.deleteScene.call(server, null, { name: 'Chill' });
  assert.strictEqual(scenes.load().length, 0);
  assert.ok(broadcasts >= 4);
});
test('a timer firing a scene applies it and reports the change for the main thread', () => {
  const alarms = require('../src/effects/alarms');
  const st = baseState();
  st.scenes = [scenes.capture(st, 'Wake')];
  st.effect = 'rain'; st.brightness = 0.1;
  const al = { id: 1, enabled: true, hour: 7, minute: 0, repeat: 'daily', triggerType: 'scene', scene: 'Wake' };
  alarms.alarmFire(st, al, new Date());
  assert.strictEqual(st.effect, 'plasma');
  assert.ok(st.appliedChanges && st.appliedChanges.effect === 'plasma', 'changes reported');
});
console.log(process.exitCode ? 'Some scenes tests FAILED' : 'All scenes tests passed');
