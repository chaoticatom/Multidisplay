// Regressions for "timers don't save":
//  - a timer that starts a scene (or turns the display off) was dropped by
//    the stored-alarm validator, so Save did nothing;
//  - a timer must still fire if the 2 s check lands later in its minute;
//  - a "Turn off" timer blanks the display.
const assert = require('assert');
const alarmConfig = require('../src/alarmConfig');
const alarms = require('../src/effects/alarms');
console.log('timersSave');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

const base = { id: 'a', enabled: true, hour: 7, minute: 30, repeat: 'daily', days: [], overlayKeys: [] };
t('scene and off timers pass validation', () => {
  assert.ok(alarmConfig.isValidAlarm({ ...base, triggerType: 'scene', scene: 'Chill' }));
  assert.ok(alarmConfig.isValidAlarm({ ...base, triggerType: 'off' }));
  assert.ok(!alarmConfig.isValidAlarm({ ...base, triggerType: 'nonsense' }));
});
t('fires when the check lands late in the minute', () => {
  const state = { alarms: [{ ...base, triggerType: 'effect', effect: 'plasma' }], activeAlarm: null, effect: 'wave', overlays: {}, effectsRegistry: { plasma() {}, wave() {} } };
  alarms.alarmCheck(state, new Date(2026, 9, 3, 7, 30, 41));
  assert.strictEqual(state.effect, 'plasma');
});
t('turn-off timer blanks the display', () => {
  const state = { alarms: [{ ...base, triggerType: 'off' }], activeAlarm: null, effect: 'wave', overlays: {}, effectsRegistry: {} };
  alarms.alarmCheck(state, new Date(2026, 9, 3, 7, 30, 5));
  assert.strictEqual(state.blank, true);
  assert.strictEqual(state.activeAlarm, null);
});
t('render worker frames carry the state version they were computed from', () => {
  const fs = require('fs');
  const w = fs.readFileSync(require.resolve('../src/renderWorker.js'), 'utf8');
  const a = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
  assert.ok(/version: workerVersion/.test(w));
  assert.ok(/msg\.version === ws\.stateVersion/.test(a), 'main thread must ignore stale timer state from in-flight frames');
});
t('wake-up timer turns a blanked display back on (All off and Panels off)', () => {
  const state = { alarms: [{ ...base, triggerType: 'effect', effect: 'plasma' }], activeAlarm: null, effect: 'wave', overlays: {}, blank: true, panelsOff: true, effectsRegistry: { plasma() {} } };
  alarms.alarmCheck(state, new Date(2026, 9, 3, 7, 30, 5));
  assert.strictEqual(state.blank, false);
  assert.strictEqual(state.panelsOff, false);
  assert.strictEqual(state.appliedChanges.panelsOff, false, 'the main thread must hear about it');
});
t('sunrise starts on a blanked display', () => {
  const state = { alarms: [{ ...base, triggerType: 'effect', effect: 'plasma', prealarm: { enabled: true, preMinutes: 15 } }], activeAlarm: null, effect: 'wave', overlays: {}, blank: true, effectsRegistry: { plasma() {} } };
  alarms.alarmCheck(state, new Date(2026, 9, 3, 7, 20, 0));
  assert.strictEqual(state.activeAlarm.phase, 'pre');
  assert.strictEqual(state.blank, false);
});
if (failed) process.exitCode = 1;
