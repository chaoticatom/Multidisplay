// Tests for src/settingsStore.js - one settings.json with per-feature
// sections, importing the old per-feature files on first use.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/settingsStore');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
const storeFile = path.join(dir, 'settings.json');
store._setStorePath(storeFile);

console.log('settingsStore');
test('missing section with no legacy file throws (callers use their defaults)', () => {
  assert.throws(() => store.readSectionJson('weather', path.join(dir, 'nope.json')));
});
test('imports a legacy file once, keeping the old file as a backup', () => {
  const legacy = path.join(dir, 'weather-config.json');
  fs.writeFileSync(legacy, JSON.stringify({ city: 'Leeds' }));
  assert.deepStrictEqual(JSON.parse(store.readSectionJson('weather', legacy)), { city: 'Leeds' });
  assert.ok(fs.existsSync(legacy));
  fs.writeFileSync(legacy, JSON.stringify({ city: 'Ignored' }));
  assert.deepStrictEqual(JSON.parse(store.readSectionJson('weather', legacy)), { city: 'Leeds' }, 'settings.json wins after import');
});
test('sections are independent and round-trip', () => {
  store.writeSection('alarms', [{ id: 1 }]);
  store.writeSection('weather', { city: 'York' });
  assert.deepStrictEqual(JSON.parse(store.readSectionJson('alarms')), [{ id: 1 }]);
  assert.deepStrictEqual(JSON.parse(store.readSectionJson('weather')), { city: 'York' });
  assert.strictEqual(JSON.parse(fs.readFileSync(storeFile, 'utf8')).version, 1);
});
test('a corrupt settings.json is moved aside instead of crashing', () => {
  fs.writeFileSync(storeFile, '{ not json');
  assert.throws(() => store.readSectionJson('alarms'));
  assert.ok(fs.readdirSync(dir).some((f) => f.startsWith('settings.json.corrupt-')));
  store.writeSection('alarms', []);
  assert.deepStrictEqual(JSON.parse(store.readSectionJson('alarms')), []);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? 'Some settingsStore tests FAILED' : 'All settingsStore tests passed');
