// The online demo bundle (sim/build.js) must build: when it broke (a Node-only
// module with no browser stand-in), npm run release stopped half way, so the
// demo and the effect thumbnails silently stopped updating.
'use strict';
const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');
console.log('simBuild');
try {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'sim', 'build.js')], { encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(r.status, 0, 'sim/build.js failed - add a shim in sim/shims/ for any Node-only module:\n' + (r.stderr || r.stdout).slice(-800));
  console.log('  ok - the online demo bundle builds');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
