// Automatic show: day parts, weather -> effect, celebrations and the
// playlist tick that applies them (src/autoShow.js, wsServer._playlistTick).
'use strict';
const assert = require('assert');
const auto = require('../src/autoShow');
const prefs = require('../src/prefs');
console.log('autoShow');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

t('parts of the day follow the start hours, wrapping past midnight', () => {
  const starts = { morning: 6, day: 10, evening: 18, night: 23 };
  assert.strictEqual(auto.partAt(starts, new Date(2026, 0, 1, 7, 0)), 'morning');
  assert.strictEqual(auto.partAt(starts, new Date(2026, 0, 1, 12, 0)), 'day');
  assert.strictEqual(auto.partAt(starts, new Date(2026, 0, 1, 19, 30)), 'evening');
  assert.strictEqual(auto.partAt(starts, new Date(2026, 0, 1, 23, 30)), 'night');
  assert.strictEqual(auto.partAt(starts, new Date(2026, 0, 1, 2, 0)), 'night');
});
t('weather picks a matching effect', () => {
  assert.strictEqual(auto.effectForWeather(95, false), 'lightning');
  assert.strictEqual(auto.effectForWeather(61, false), 'rain');
  assert.strictEqual(auto.effectForWeather(73, true), 'ambient_weather');
  assert.strictEqual(auto.effectForWeather(0, true), 'starfield');
});
t('celebrations run for 15 minutes from their time, New Year included', () => {
  const cel = { newYear: true, dates: [{ month: 5, day: 3, hour: 8, minute: 0, text: 'HAPPY BIRTHDAY SAM' }] };
  assert.strictEqual(auto.celebrationAt(cel, new Date(2026, 4, 3, 8, 5)).text, 'HAPPY BIRTHDAY SAM');
  assert.strictEqual(auto.celebrationAt(cel, new Date(2026, 4, 3, 8, 16)), null);
  assert.strictEqual(auto.celebrationAt(cel, new Date(2026, 4, 3, 7, 59)), null);
  assert.ok(/HAPPY NEW YEAR 2027/.test(auto.celebrationAt(cel, new Date(2027, 0, 1, 0, 3)).text));
  assert.strictEqual(auto.celebrationAt({ ...cel, newYear: false }, new Date(2027, 0, 1, 0, 3)), null);
});
t('a celebration switches to fireworks with the text, then puts the old effect back', () => {
  const WsServer = require('../src/wsServer');
  const now = new Date(Date.now() - 60000);
  const p = prefs.clean({ celebrations: { newYear: false, dates: [{ month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes(), text: 'PARTY' }] } });
  const fake = { state: { prefs: p, effect: 'plasma', effectOptions: {}, blank: true }, _broadcast() {}, _stateMsg() { return {}; }, _playlistSince: 0 };
  WsServer.prototype._playlistTick.call(fake);
  assert.strictEqual(fake.state.effect, 'fireworks');
  assert.strictEqual(fake.state.blank, false, 'a celebration turns the display on');
  assert.strictEqual(fake.state.effectOptions.fireworks.text, 'PARTY');
  fake.state.prefs = prefs.clean({ celebrations: { newYear: false, dates: [] } });
  WsServer.prototype._playlistTick.call(fake);
  assert.strictEqual(fake.state.effect, 'plasma');
  assert.strictEqual(fake.state.blank, true, 'and back to how it was');
});
t('day plan shows the current part\'s first effect', () => {
  const WsServer = require('../src/wsServer');
  const part = auto.partAt(null, new Date());
  const p = prefs.clean({ dayPlan: { on: true, effects: { [part]: ['starfield', 'aurora'] } } });
  const fake = { state: { prefs: p, effect: 'plasma', effectOptions: {}, blank: false }, _broadcast() {}, _stateMsg() { return {}; }, _playlistSince: 0 };
  WsServer.prototype._playlistTick.call(fake);
  assert.strictEqual(fake.state.effect, 'starfield');
});
if (failed) process.exitCode = 1;
