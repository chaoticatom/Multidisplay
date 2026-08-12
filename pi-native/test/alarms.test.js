// Fast, no-sleeping tests for src/effects/alarms.js (Timer system) and its
// WS wire-up in wsServer.js. Time-dependent logic is tested by constructing
// explicit `Date` objects / setting `startMs` directly rather than mocking
// the global Date or sleeping - alarmCheck/alarmFire both take `now` as an
// explicit parameter for exactly this reason (see that module's comment).
const assert = require('assert');
const WebSocket = require('ws');
const { CubeCore } = require('../src/core');
const { EFFECTS } = require('../src/effects');
const { OV_DEFAULTS } = require('../src/effects/overlays');
const alarms = require('../src/effects/alarms');
const WsServer = require('../src/wsServer');
const panelConfig = require('../src/panelConfig');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function hasNaN(buf) {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) return true;
  return false;
}

function freshState(overrides) {
  return Object.assign({
    effect: 'wave', brightness: 1, speed: 1,
    overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)),
    alarms: [], activeAlarm: null,
  }, overrides);
}

function baseAlarm(overrides) {
  return Object.assign({
    id: 'a1', name: 'Test', enabled: true, hour: 7, minute: 30, repeat: 'daily', days: [],
    triggerType: 'effect', effect: 'wave', overlayKeys: [], playlistName: '', message: 'Good Morning',
    prealarm: {},
  }, overrides);
}

console.log('alarms');

// ── repeat-mode / day-matching coverage ────────────────────────────────
test('daily alarm fires at its exact minute regardless of day-of-week', () => {
  const state = freshState({ alarms: [baseAlarm({ repeat: 'daily' })] });
  const now = new Date(2026, 0, 5, 7, 30, 1); // a Monday
  alarms.alarmCheck(state, now);
  assert.ok(state.activeAlarm, 'should have fired');
  assert.strictEqual(state.activeAlarm.phase, 'main');
});

test('weekdays alarm does not fire on Saturday', () => {
  const state = freshState({ alarms: [baseAlarm({ repeat: 'weekdays' })] });
  const sat = new Date(2026, 0, 3, 7, 30, 1); // Jan 3 2026 is a Saturday
  alarms.alarmCheck(state, sat);
  assert.strictEqual(state.activeAlarm, null);
});

test('weekdays alarm fires on a Wednesday', () => {
  const state = freshState({ alarms: [baseAlarm({ repeat: 'weekdays' })] });
  const wed = new Date(2026, 0, 7, 7, 30, 1);
  alarms.alarmCheck(state, wed);
  assert.ok(state.activeAlarm);
});

test('weekends alarm fires on Sunday, not on a weekday', () => {
  const sun = new Date(2026, 0, 4, 7, 30, 1);
  const s1 = freshState({ alarms: [baseAlarm({ repeat: 'weekends' })] });
  alarms.alarmCheck(s1, sun);
  assert.ok(s1.activeAlarm);

  const s2 = freshState({ alarms: [baseAlarm({ repeat: 'weekends' })] });
  alarms.alarmCheck(s2, new Date(2026, 0, 5, 7, 30, 1)); // Monday
  assert.strictEqual(s2.activeAlarm, null);
});

test('weekly alarm only fires on its selected days array', () => {
  const state = freshState({ alarms: [baseAlarm({ repeat: 'weekly', days: [2] })] }); // Tuesday only
  alarms.alarmCheck(state, new Date(2026, 0, 5, 7, 30, 1)); // Monday
  assert.strictEqual(state.activeAlarm, null);
  alarms.alarmCheck(state, new Date(2026, 0, 6, 7, 30, 1)); // Tuesday
  assert.ok(state.activeAlarm);
});

test('once alarm fires and then disables itself', () => {
  const al = baseAlarm({ repeat: 'once' });
  const state = freshState({ alarms: [al] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 7, 30, 1));
  assert.ok(state.activeAlarm);
  assert.strictEqual(al.enabled, false);
});

test('hourly alarm fires every hour at the configured minute, once per minute (dedup via _lastFireMin)', () => {
  const al = baseAlarm({ repeat: 'hourly', minute: 15 });
  const state = freshState({ alarms: [al] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 3, 15, 1));
  assert.ok(state.activeAlarm, 'first hour should fire');
  state.activeAlarm = null; // simulate the previous firing having been dismissed
  alarms.alarmCheck(state, new Date(2026, 0, 5, 3, 15, 2)); // same minute again
  assert.strictEqual(state.activeAlarm, null, 'must not re-fire within the same hour/minute');
  alarms.alarmCheck(state, new Date(2026, 0, 5, 4, 15, 1)); // next hour
  assert.ok(state.activeAlarm, 'next hour should fire again');
});

test('disabled alarms never fire', () => {
  const state = freshState({ alarms: [baseAlarm({ enabled: false })] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 7, 30, 1));
  assert.strictEqual(state.activeAlarm, null);
});

// ── pre-alarm window ────────────────────────────────────────────────────
test('pre-alarm window: enters phase "pre" starting preMinutes before alarm time', () => {
  const al = baseAlarm({ hour: 7, minute: 30, prealarm: { enabled: true, preMinutes: 15, startBright: 5 } });
  const state = freshState({ alarms: [al] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 7, 20, 0)); // 10 min before, inside the 15-min window
  assert.ok(state.activeAlarm);
  assert.strictEqual(state.activeAlarm.phase, 'pre');
});

test('pre-alarm window: does not trigger before the window opens', () => {
  const al = baseAlarm({ hour: 7, minute: 30, prealarm: { enabled: true, preMinutes: 15, startBright: 5 } });
  const state = freshState({ alarms: [al] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 7, 0, 0)); // 30 min before, outside the 15-min window
  assert.strictEqual(state.activeAlarm, null);
});

// ── wind-down window ────────────────────────────────────────────────────
test('wind-down window: triggers AT alarm time and stays active through wdMinutes', () => {
  const al = baseAlarm({ hour: 22, minute: 0, prealarm: { windDown: true, wdMinutes: 20 } });
  const state = freshState({ alarms: [al] });
  alarms.alarmCheck(state, new Date(2026, 0, 5, 22, 10, 0)); // 10 min into a 20-min wind-down
  assert.ok(state.activeAlarm);
  assert.strictEqual(state.activeAlarm.phase, 'pre');
});

test('wind-down window: does not trigger before alarm time or after the window closes', () => {
  const al = baseAlarm({ hour: 22, minute: 0, prealarm: { windDown: true, wdMinutes: 20 } });
  const s1 = freshState({ alarms: [al] });
  alarms.alarmCheck(s1, new Date(2026, 0, 5, 21, 59, 0));
  assert.strictEqual(s1.activeAlarm, null);
  const s2 = freshState({ alarms: [Object.assign({}, al)] });
  alarms.alarmCheck(s2, new Date(2026, 0, 5, 22, 25, 0));
  assert.strictEqual(s2.activeAlarm, null);
});

// ── renderPrePhase full progress sweep (giant sun, plain sunrise, wind-down) ──
test('renderPrePhase (plain sunrise): 100+ ticks across the full pre-alarm window, no NaN/throw', () => {
  const core = new CubeCore(16);
  const al = baseAlarm({ prealarm: { enabled: true, preMinutes: 15, startBright: 5 } });
  const state = freshState({ alarms: [al] });
  const preMs = 15 * 60000;
  state.activeAlarm = { al, phase: 'pre', startMs: Date.now() - preMs, preMs, dismissed: false };
  for (let i = 0; i < 120; i++) {
    state.activeAlarm.startMs = Date.now() - (i / 120) * preMs; // sweep elapsed 0 -> preMs
    alarms.renderPrePhase(core, 1 / 30, state, EFFECTS);
    assert.ok(!hasNaN(core.colBuf), `NaN in colBuf at tick ${i}`);
  }
});

test('renderPrePhase (giant sun): 100+ ticks, no NaN/throw', () => {
  const core = new CubeCore(16);
  const al = baseAlarm({ prealarm: { enabled: true, preMinutes: 15, startBright: 5, giantSun: true } });
  const state = freshState({ alarms: [al] });
  const preMs = 15 * 60000;
  state.activeAlarm = { al, phase: 'pre', startMs: Date.now() - preMs, preMs, dismissed: false };
  for (let i = 0; i < 120; i++) {
    state.activeAlarm.startMs = Date.now() - (i / 120) * preMs;
    alarms.renderPrePhase(core, 1 / 30, state, EFFECTS);
    assert.ok(!hasNaN(core.colBuf), `NaN in colBuf at tick ${i}`);
  }
});

test('renderPrePhase (wind-down, plain and wdUseEffect): 100+ ticks, no NaN/throw, ends in phase "done"', () => {
  const core = new CubeCore(16);
  const al = baseAlarm({ prealarm: { windDown: true, wdMinutes: 10, wdUseEffect: true, wdEffectKey: 'wave', wdOverlayKeys: ['stars'] } });
  const state = freshState({ alarms: [al] });
  const preMs = 10 * 60000;
  state.activeAlarm = { al, phase: 'pre', startMs: Date.now() - preMs + 1, preMs, dismissed: false };
  for (let i = 0; i < 100; i++) {
    if (!state.activeAlarm || state.activeAlarm.phase !== 'pre') break;
    state.activeAlarm.startMs = Date.now() - (i / 100) * preMs;
    alarms.renderPrePhase(core, 1 / 30, state, EFFECTS);
    assert.ok(!hasNaN(core.colBuf), `NaN in colBuf at tick ${i}`);
  }
  // Force completion and confirm the "done" transition blanks the frame.
  state.activeAlarm.startMs = Date.now() - preMs - 1000;
  alarms.renderPrePhase(core, 1 / 30, state, EFFECTS);
  assert.strictEqual(state.activeAlarm.phase, 'done');
  assert.strictEqual(state.brightness, 0);
});

test('renderGiantSun/renderAlarmSunrise: full 0..1 progress sweep directly, no NaN/throw', () => {
  const core = new CubeCore(16);
  for (let i = 0; i <= 100; i++) {
    const p = i / 100;
    alarms.renderGiantSun(core, p, 5);
    assert.ok(!hasNaN(core.colBuf), `renderGiantSun NaN at progress ${p}`);
    alarms.renderAlarmSunrise(core, p, 5);
    assert.ok(!hasNaN(core.colBuf), `renderAlarmSunrise NaN at progress ${p}`);
  }
});

test('renderMainMessage: main-phase message draws without NaN and auto-dismisses after its duration', () => {
  const core = new CubeCore(16);
  const al = baseAlarm({ message: 'Good Morning' });
  const state = freshState({ alarms: [al] });
  state.activeAlarm = { al, phase: 'main', startMs: Date.now(), endMs: Date.now() + 60000, dismissed: false };
  alarms.renderMainMessage(core, state);
  assert.ok(!hasNaN(core.colBuf));
  assert.ok(state.activeAlarm, 'should still be active mid-duration');
  state.activeAlarm.startMs = Date.now() - 61000; // force past its 1-minute duration
  state.activeAlarm.endMs = state.activeAlarm.startMs + 60000;
  alarms.renderMainMessage(core, state);
  assert.strictEqual(state.activeAlarm, null, 'should auto-dismiss once its duration elapses');
});

test('isBlockingNormalEffect true during pre/main phases, false when dismissed or null', () => {
  const al = baseAlarm();
  const state = freshState({ alarms: [al] });
  assert.strictEqual(alarms.isBlockingNormalEffect(state), false);
  state.activeAlarm = { al, phase: 'pre', startMs: Date.now(), preMs: 60000, dismissed: false };
  assert.strictEqual(alarms.isBlockingNormalEffect(state), true);
  state.activeAlarm.dismissed = true;
  assert.strictEqual(alarms.isBlockingNormalEffect(state), false);
});

test('dismissActive clears an in-flight activeAlarm', () => {
  const al = baseAlarm();
  const state = freshState({ alarms: [al], activeAlarm: { al, phase: 'main', startMs: Date.now(), dismissed: false } });
  alarms.dismissActive(state);
  assert.strictEqual(state.activeAlarm, null);
});

test('playlist-trigger alarmFire falls back to "no effect" (does not touch state.effect)', () => {
  const al = baseAlarm({ triggerType: 'playlist', playlistName: 'Morning Mix', effect: '' });
  const state = freshState({ alarms: [al], effect: 'plasma' });
  alarms.alarmFire(state, al, new Date());
  assert.strictEqual(state.effect, 'plasma', 'playlist trigger must not change the running effect - see module comment');
  assert.strictEqual(state.activeAlarm.phase, 'main');
});

// ── WsServer round-trip: add/update/delete/toggle/dismiss ──────────────
async function withServer(fn) {
  const state = { effect: 'wave', brightness: 1, speed: 1, overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)), alarms: [], activeAlarm: null };
  const config = { ...panelConfig.DEFAULT_CONFIG, panels: [...panelConfig.DEFAULT_CONFIG.panels] };
  const port = 41000 + Math.floor(Math.random() * 8000); // matches webPage.test.js's pattern - a real bound port, not listen(0)+close+relisten
  const ws = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));
  try {
    await fn(ws, state, port);
  } finally {
    ws.close();
  }
}

// Queues every incoming message from the moment the client is constructed
// (not from whenever some later `await` happens to attach a listener) -
// the server sends its initial "state" message synchronously inside the
// 'connection' handler, which can otherwise race a caller that does
// `await open-promise` then only *afterwards* attaches a 'message'
// listener (a plain EventEmitter drops events with no listener attached
// at emit time, so that race silently hangs a later nextMessage() await
// forever - this queue removes the race by listening from construction).
function connectClient(port) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const queue = [];
    const waiters = [];
    client._msgQueue = queue;
    client._msgWaiters = waiters;
    client.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (waiters.length) waiters.shift()(parsed);
      else queue.push(parsed);
    });
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });
}

function nextMessage(client) {
  if (client._msgQueue.length) return Promise.resolve(client._msgQueue.shift());
  return new Promise((resolve) => client._msgWaiters.push(resolve));
}

async function main() {

await asyncTest('WS addAlarm/updateAlarm/deleteAlarm/setAlarmEnabled/dismissAlarm round-trip', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    const initial = await nextMessage(client); // initial "state" on connect
    assert.deepStrictEqual(initial.alarms, []);

    client.send(JSON.stringify({ cmd: 'addAlarm', alarm: { name: 'Wake', hour: 7, minute: 0, repeat: 'daily', triggerType: 'effect', effect: 'wave', overlayKeys: [], message: 'Hi', enabled: true, prealarm: {} } }));
    const afterAdd = await nextMessage(client);
    assert.strictEqual(afterAdd.alarms.length, 1);
    const id = afterAdd.alarms[0].id;
    assert.ok(id);

    client.send(JSON.stringify({ cmd: 'updateAlarm', id, alarm: { ...afterAdd.alarms[0], name: 'Wake Renamed' } }));
    const afterUpdate = await nextMessage(client);
    assert.strictEqual(afterUpdate.alarms[0].name, 'Wake Renamed');

    client.send(JSON.stringify({ cmd: 'setAlarmEnabled', id, enabled: false }));
    const afterToggle = await nextMessage(client);
    assert.strictEqual(afterToggle.alarms[0].enabled, false);

    state.activeAlarm = { al: afterToggle.alarms[0], phase: 'main', startMs: Date.now(), dismissed: false };
    client.send(JSON.stringify({ cmd: 'dismissAlarm' }));
    const afterDismiss = await nextMessage(client);
    assert.strictEqual(afterDismiss.activeAlarm, null);

    client.send(JSON.stringify({ cmd: 'deleteAlarm', id }));
    const afterDelete = await nextMessage(client);
    assert.strictEqual(afterDelete.alarms.length, 0);

    client.close();
  });
});

await asyncTest('WS addAlarm rejects a malformed payload (out-of-range hour) without crashing or persisting', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client); // initial state
    client.send(JSON.stringify({ cmd: 'addAlarm', alarm: { hour: 99, minute: 0, repeat: 'daily' } }));
    // Malformed payload is dropped silently (no broadcast) - confirm the
    // server is still alive and the alarm never landed by sending a valid
    // follow-up command and checking it produces exactly one alarm.
    client.send(JSON.stringify({ cmd: 'addAlarm', alarm: { hour: 8, minute: 0, repeat: 'daily', triggerType: 'effect', effect: '', overlayKeys: [], enabled: true, prealarm: {} } }));
    const msg = await nextMessage(client);
    assert.strictEqual(msg.alarms.length, 1);
    assert.strictEqual(msg.alarms[0].hour, 8);
    client.close();
  });
});

console.log('All alarms tests passed');
}

main().then(() => process.exit(process.exitCode || 0));
