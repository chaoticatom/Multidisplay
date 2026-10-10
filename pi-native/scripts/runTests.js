// Runs every test/*.test.js (each in its own process, so one that calls
// process.exit or leaves a timer can't affect the others), snapshots last.
// New test files run automatically - the old hand-kept list in package.json
// silently skipped tests that weren't added to it.
//   node scripts/runTests.js [filter]   - only files whose name contains filter
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(__dirname, '..', 'test');
const filter = process.argv[2] || '';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort((a, b) => (a === 'snapshots.test.js') - (b === 'snapshots.test.js') || a.localeCompare(b));
const failed = [];
const start = Date.now();
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  if (r.status !== 0) failed.push(f + (r.signal ? ' (' + r.signal + ')' : ''));
}
const secs = Math.round((Date.now() - start) / 1000);
if (failed.length) { console.error(`\n${failed.length} of ${files.length} test files FAILED (${secs}s):\n  ` + failed.join('\n  ')); process.exit(1); }
console.log(`\nAll ${files.length} test files passed (${secs}s)`);
