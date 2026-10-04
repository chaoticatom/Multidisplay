// Weekly settings backup (src/autoBackup.js): dated copies, newest 8 kept.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const settingsStore = require('../src/settingsStore');
console.log('autoBackup');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mdbk-'));
settingsStore._setStorePath(path.join(tmp, 'settings.json'));
fs.writeFileSync(path.join(tmp, 'settings.json'), '{"sections":{}}');
const bk = require('../src/autoBackup');
try {
  assert.strictEqual(bk.due(), true, 'no backup yet');
  for (let i = 0; i < 10; i++) bk.backupNow(new Date(2026, 0, 1 + i, 9, 0));
  const s = bk.status();
  assert.strictEqual(s.count, bk.KEEP);
  assert.strictEqual(s.error, '');
  assert.strictEqual(bk.due(), false, 'just backed up');
  assert.strictEqual(bk.due(Date.now() + 8 * 86400000), true, 'a week later it is due again');
  console.log('  ok - dated copies, newest kept, due weekly');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
finally { fs.rmSync(tmp, { recursive: true, force: true }); }
