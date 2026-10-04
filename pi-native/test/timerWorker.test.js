// Regression: on the Pi the main thread re-sends its whole state to the
// render worker every second; the timer check (every 2 s) kept its clock on
// that state, so it was reset each time and timers never fired. Runs the
// real worker with the same re-send pattern.
'use strict';
const assert = require('assert');
const path = require('path');
const { Worker } = require('worker_threads');
const { OV_DEFAULTS } = require('../src/effects/overlays');
const { wallClock } = require('../src/localTime');
console.log('timerWorker');

function run(alarm, frames) {
  return new Promise((resolve) => {
    const w = new Worker(path.join(__dirname, '..', 'src', 'renderWorker.js'), { workerData: { config: { size: 64, mode: 'wall', panels: [{ gx: 0, gy: 0 }] } } });
    const state = { effect: 'plasma', overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), effectOptions: {}, brightness: 0.8, speed: 1, alarms: [alarm], activeAlarm: null, blank: true, panelsOff: false, prefs: { tz: 'Europe/London' } };
    let n = 0, applied = null, phases = [];
    w.on('message', (msg) => {
      if (msg.type !== 'frame') return;
      n++;
      if (msg.applied) applied = msg.applied;
      phases.push(msg.activeAlarm && msg.activeAlarm.phase);
      if (n >= frames) { w.terminate(); resolve({ applied, phases }); return; }
      // Every 30 frames (~1 s at 30 fps) a fresh copy of the main thread's state, as app.js does.
      w.postMessage({ type: 'tick', state: n % 30 === 0 ? JSON.parse(JSON.stringify(state)) : null, dt: 1 / 30, radioAudio: null, version: n });
    });
    w.postMessage({ type: 'tick', state: JSON.parse(JSON.stringify(state)), dt: 1 / 30, radioAudio: null, version: 0 });
  });
}

(async () => {
  try {
    const now = wallClock('Europe/London');
    const al = { id: 'w1', enabled: true, hour: now.getHours(), minute: now.getMinutes(), repeat: 'daily', days: [], kind: 'start', triggerType: 'effect', effect: 'fireworks', overlayKeys: [], message: '', prealarm: {}, radio: { action: 'none' } };
    const r = await run(al, 150);
    assert.ok(r.applied, 'the timer fired despite the state being re-sent every second');
    assert.strictEqual(r.applied.effect, 'fireworks');
    assert.strictEqual(r.applied.blank, false);
    console.log('  ok - timers fire with the state re-sent every second');

    const m = now.getHours() * 60 + now.getMinutes() + 2;
    const wake = { id: 'w2', enabled: true, hour: Math.floor(m / 60) % 24, minute: m % 60, repeat: 'daily', days: [], kind: 'wake', triggerType: 'effect', effect: '', overlayKeys: [], message: '', prealarm: { enabled: true, preMinutes: 5, startBright: 5 }, radio: { action: 'none' } };
    const r2 = await run(wake, 200);
    const pre = r2.phases.filter((p) => p === 'pre').length;
    assert.ok(pre > 120, 'the sunrise keeps running across re-sends (pre frames: ' + pre + ')');
    console.log('  ok - a sunrise keeps running across re-sends');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
})();
