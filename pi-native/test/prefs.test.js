// Night dimming wraps past midnight and eases in/out; prefs are cleaned.
'use strict';
const assert = require('assert');
const prefs = require('../src/prefs');
const at = (h, m = 0) => new Date(2026, 0, 1, h, m);
function ok(name, fn) { try { fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } }
const p = prefs.clean({ nightDim: { on: true, from: 22, to: 7, level: 0.3 } });
ok('full brightness in the day', () => assert.strictEqual(prefs.nightFactor(p, at(12)), 1));
ok('dimmed after midnight', () => assert.strictEqual(prefs.nightFactor(p, at(2)), 0.3));
ok('dimmed late evening', () => assert.strictEqual(prefs.nightFactor(p, at(23)), 0.3));
ok('eases in before it starts', () => { const v = prefs.nightFactor(p, at(21, 45)); assert.ok(v < 1 && v > 0.3, String(v)); });
ok('eases out before it ends', () => { const v = prefs.nightFactor(p, at(6, 45)); assert.ok(v < 1 && v > 0.3, String(v)); });
ok('off means 1', () => assert.strictEqual(prefs.nightFactor(prefs.clean({}), at(2)), 1));
ok('cleans bad values', () => { const c = prefs.clean({ favourites: [1, 'aurora'], playlist: { minutes: 9999 }, nightDim: { from: 30, level: 5 } }); assert.deepStrictEqual(c.favourites, ['aurora']); assert.strictEqual(c.playlist.minutes, 120); assert.strictEqual(c.nightDim.from, 22); assert.strictEqual(c.nightDim.level, 1); });
