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

// Flat panel / wall: the sunrise draws, then the timer fires; a finished
// wind-down switches the display off and frees the timer slot.
{
  const { CubeCore } = require('../src/core');
  const { tick } = require('../src/tick');
  const { EFFECTS, WALL_EFFECTS } = require('../src/effects');
  const { runOverlays, OV_DEFAULTS } = require('../src/effects/overlays');
  const mk = () => { const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64); return c; };
  const wallState = (al) => ({ effect: 'plasma', overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), effectOptions: {}, brightness: 0.8, speed: 1, alarms: [al], activeAlarm: null });
  const cfg = { mode: 'wall', size: 64 };
  try {
    const core = mk();
    const al = { ...base, triggerType: 'effect', effect: 'aurora', message: 'Hello', prealarm: { enabled: true, preMinutes: 15, startBright: 5 } };
    const st = wallState(al);
    alarms.alarmCheck(st, new Date(2026, 9, 3, 7, 20, 0));
    st.activeAlarm.startMs = Date.now() - 7.5 * 60000; // halfway through the sunrise
    tick(core, st, cfg, EFFECTS, WALL_EFFECTS, alarms, runOverlays, 1 / 60);
    let lit = 0; for (let i = 0; i < core.wallBuf.length; i += 3) if (core.wallBuf[i] > 0.2) lit++;
    assert.ok(lit > 100, 'sunrise should light the wall: ' + lit);
    st.activeAlarm.startMs = Date.now() - 16 * 60000; // past the end
    tick(core, st, cfg, EFFECTS, WALL_EFFECTS, alarms, runOverlays, 1 / 60);
    assert.strictEqual(st.effect, 'aurora', 'the wake-up effect must start after the sunrise on a wall');
    assert.strictEqual(st.activeAlarm.phase, 'main');
    console.log('  ok - wall sunrise draws and then fires the timer');

    const wd = { ...base, id: 'w', triggerType: 'effect', prealarm: { windDown: true, wdMinutes: 15 } };
    const st2 = wallState(wd);
    alarms.alarmCheck(st2, new Date(2026, 9, 3, 7, 31, 0));
    assert.strictEqual(st2.activeAlarm.phase, 'pre');
    st2.activeAlarm.startMs = Date.now() - 16 * 60000;
    tick(mk(), st2, cfg, EFFECTS, WALL_EFFECTS, alarms, runOverlays, 1 / 60);
    assert.strictEqual(st2.activeAlarm, null, 'a finished wind-down must free the timer slot');
    assert.strictEqual(st2.blank, true);
    assert.strictEqual(st2.brightness, 0.8, 'brightness comes back for next time');
    console.log('  ok - finished wind-down turns the display off and frees the slot');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
}
