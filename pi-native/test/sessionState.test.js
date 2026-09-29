// Tests for src/sessionState.js - the display comes back as it was after
// a restart (effect, options, overlays, brightness, radio station).
const assert = require('assert');
const os = require('os');
const path = require('path');
require('../src/settingsStore')._setStorePath(path.join(os.tmpdir(), `session-${process.pid}-${Date.now()}.json`));
const session = require('../src/sessionState');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const EFFECTS = { wave: () => {}, radio: () => {} };
const fresh = () => ({ effect: 'wave', brightness: 1, speed: 1, overlays: { stars: { on: false, density: 6 } }, musicReact: { on: false, amount: 0.6 }, effectOptions: { weather: { city: 'Leeds' } } });

console.log('sessionState');
test('nothing saved: state untouched, no station to resume', () => {
  const st = fresh();
  assert.strictEqual(session.restore(st, EFFECTS), null);
  assert.strictEqual(st.effect, 'wave');
});
test('a saved session comes back, including the playing station', () => {
  const st = fresh();
  Object.assign(st, { effect: 'radio', brightness: 0.4, effectOptions: { radio: { spectrumOn: true, style: 'vu' } } });
  st.overlays.stars.on = true;
  session.save(st, { playing: true, station: { name: 'Groove Salad', url: 'http://x/y' } });
  const back = fresh();
  const station = session.restore(back, EFFECTS);
  assert.strictEqual(back.effect, 'radio');
  assert.strictEqual(back.brightness, 0.4);
  assert.deepStrictEqual(back.effectOptions.radio, { spectrumOn: true, style: 'vu' });
  assert.strictEqual(back.overlays.stars.on, true);
  assert.strictEqual(station.name, 'Groove Salad');
});
test('debug tones are not resumed, and a removed effect falls back', () => {
  const st = fresh(); st.effect = 'gone';
  session.save(st, { playing: true, station: { name: 'Debug', url: 'debug:sine' } });
  const back = fresh();
  assert.strictEqual(session.restore(back, EFFECTS), null);
  assert.strictEqual(back.effect, 'wave');
});
console.log(process.exitCode ? 'Some sessionState tests FAILED' : 'All sessionState tests passed');
