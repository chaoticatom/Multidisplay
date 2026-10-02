// The AI assistant only ever applies validated actions: unknown effects,
// overlays and malformed pixel art are dropped or repaired, and the key
// never appears in what the page is sent.
'use strict';
const assert = require('assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const store = require('../src/settingsStore');
store._setStorePath(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-')), 'settings.json'));
const ai = require('../src/ai');
const aiConfig = require('../src/aiConfig');

function ok(name, fn) { try { fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } }

ok('drops unknown effects and overlays, clamps brightness', () => {
  const r = ai.cleanReply({ say: 'hi', actions: [{ type: 'effect', key: 'nope' }, { type: 'effect', key: 'aurora' }, { type: 'overlay', key: 'bogus', on: true }, { type: 'overlay', key: 'stars', on: 1 }, { type: 'brightness', value: 9 }, { type: 'run', code: 'x' }] });
  assert.deepStrictEqual(r.actions, [{ type: 'effect', key: 'aurora' }, { type: 'overlay', key: 'stars', on: true }, { type: 'brightness', value: 1.5 }]);
});
ok('repairs pixel art to the declared size and palette', () => {
  const r = ai.cleanReply({ actions: [{ type: 'art', w: 4, h: 3, palette: ['#ff0000', 'bad'], frames: [['01', '0zz10', '1']] }] });
  const art = r.actions[0].art;
  assert.deepStrictEqual(art.frames[0], ['01..', '0..1', '1...', '....']); // h is at least 4
  assert.deepStrictEqual(art.palette, ['#ff0000', '#ffffff']);
});
ok('limits art to 32x32 and 8 frames', () => {
  const art = ai.cleanArt({ w: 999, h: 999, palette: ['#fff000'], frames: Array(20).fill(['0']) });
  assert.strictEqual(art.w, 32); assert.strictEqual(art.h, 32); assert.strictEqual(art.frames.length, 8);
});
ok('extracts JSON wrapped in prose', () => {
  assert.deepStrictEqual(ai.extractJson('Sure! {"say":"x","actions":[]} hope that helps'), { say: 'x', actions: [] });
});
ok('the key is stored but never exposed', () => {
  aiConfig.save({ provider: 'groq', key: 'secret-123' });
  const v = aiConfig.publicView();
  assert.strictEqual(v.keySet, true);
  assert.ok(!JSON.stringify(v).includes('secret-123'));
  aiConfig.save({ model: 'x' });
  assert.strictEqual(aiConfig.load().key, 'secret-123', 'an empty key field keeps the saved key');
});
aiConfig.save({ provider: 'off' });
ai.ask('hello', {}).then((r) => { assert.deepStrictEqual(r, { off: true }); console.log('  ok - switched off returns off without calling out'); })
  .catch((e) => { console.error('  FAIL - switched off', e.message); process.exitCode = 1; });
