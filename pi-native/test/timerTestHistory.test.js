// Timer list: Test runs a shortened copy now; each run is recorded as the
// timer's lastRun (shown under it in the list).
'use strict';
const assert = require('assert');
const { COMMANDS } = require('../src/wsCommands');
const alarms = require('../src/effects/alarms');
const { CubeCore } = require('../src/core');
console.log('timerTestHistory');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

const base = { id: 'w1', enabled: false, hour: 7, minute: 0, repeat: 'once', days: [], kind: 'wake', triggerType: 'effect', effect: '', overlayKeys: [], message: 'Morning', prealarm: { enabled: true, preMinutes: 15 }, radio: { action: 'none' } };
const core = () => { const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64); return c; };

t('Test runs a 15 s sunrise copy, then the timer, without changing the saved timer', () => {
  const srv = { state: { alarms: [JSON.parse(JSON.stringify(base))], blank: true, brightness: 0.7, effectOptions: {}, overlays: {}, effectsRegistry: {} }, _broadcast() {}, _stateMsg() { return {}; } };
  COMMANDS.testAlarm.call(srv, {}, { id: 'w1' });
  const a = srv.state.activeAlarm;
  assert.ok(a && a.test && a.phase === 'pre' && a.preMs === 15000);
  assert.strictEqual(srv.state.blank, false, 'the display is switched on to show it');
  a.startMs -= 16000; // the sunrise is over
  alarms.renderPrePhase(core(), 1 / 30, srv.state, {}, true);
  assert.strictEqual(srv.state.activeAlarm.phase, 'main');
  assert.ok(srv.state.activeAlarm.endMs - srv.state.activeAlarm.startMs === 15000, 'a short message');
  assert.strictEqual(srv.state.alarms[0].enabled, false, 'saved timer unchanged');
  assert.ok(/tested$/.test(srv.state.alarms[0].lastRun.text), 'history says it was tested: ' + srv.state.alarms[0].lastRun.text);
});
t('a real run is recorded with what happened', () => {
  const al = { ...JSON.parse(JSON.stringify(base)), enabled: true, prealarm: {}, radio: { action: 'start', station: { name: 'Jazz FM', url: 'http://x' } } };
  const state = { alarms: [al], activeAlarm: null, effect: 'wave', overlays: {}, effectsRegistry: {}, effectOptions: {} };
  const radio = require('../src/effects/radio'); const play = radio.playStation; radio.playStation = () => {};
  try { alarms.alarmCheck(state, new Date(2026, 9, 3, 7, 0, 5)); } finally { radio.playStation = play; }
  assert.ok(/^\d\d:\d\d went off · radio Jazz FM$/.test(state.alarms[0].lastRun.text), state.alarms[0].lastRun && state.alarms[0].lastRun.text);
});
t('a test wind-down records itself and leaves the timer enabled', () => {
  const al = { ...JSON.parse(JSON.stringify(base)), id: 'd1', enabled: true, repeat: 'once', kind: 'winddown', prealarm: { windDown: true, wdMinutes: 15 } };
  const srv = { state: { alarms: [al], brightness: 0.8, effectOptions: {}, overlays: {}, effectsRegistry: {} }, _broadcast() {}, _stateMsg() { return {}; } };
  COMMANDS.testAlarm.call(srv, {}, { id: 'd1' });
  srv.state.activeAlarm.startMs -= 16000;
  alarms.renderPrePhase(core(), 1 / 30, srv.state, {}, true);
  assert.strictEqual(srv.state.activeAlarm, null);
  assert.strictEqual(srv.state.alarms[0].enabled, true, 'a test does not use up a one-off timer');
  assert.ok(/wind-down tested$/.test(srv.state.alarms[0].lastRun.text));
});
if (failed) process.exitCode = 1;
