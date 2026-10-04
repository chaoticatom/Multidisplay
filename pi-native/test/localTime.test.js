// Timers follow the user's time zone, not the Pi's (src/localTime.js).
'use strict';
const assert = require('assert');
const { wallClock, isZone } = require('../src/localTime');
console.log('localTime');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }
t('reads the clock in the given zone, keeping the real instant', () => {
  const real = new Date(Date.UTC(2026, 6, 1, 12, 15, 0)); // 12:15 UTC in July
  const uk = wallClock('Europe/London', real), ny = wallClock('America/New_York', real);
  assert.strictEqual(uk.getHours(), 13); assert.strictEqual(uk.getMinutes(), 15); // BST
  assert.strictEqual(ny.getHours(), 8);
  assert.strictEqual(uk.getTime(), real.getTime(), 'durations still use the real time');
});
t('falls back to the Pi clock for a missing or bad zone', () => {
  const real = new Date();
  assert.strictEqual(wallClock('', real), real);
  assert.strictEqual(isZone('Not/AZone'), false);
  assert.strictEqual(isZone('Europe/London'), true);
});
t('a 13:15 timer fires at 13:15 UK time on a UTC Pi', () => {
  const alarms = require('../src/effects/alarms');
  const al = { id: 'a', enabled: true, hour: 13, minute: 15, repeat: 'daily', days: [], triggerType: 'effect', effect: 'plasma', overlayKeys: [] };
  const state = { alarms: [al], activeAlarm: null, effect: 'wave', overlays: {}, effectsRegistry: { plasma() {} } };
  alarms.alarmCheck(state, wallClock('Europe/London', new Date(Date.UTC(2026, 6, 1, 12, 15, 1))));
  assert.strictEqual(state.effect, 'plasma');
});
if (failed) process.exitCode = 1;
