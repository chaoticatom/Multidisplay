// public/app.js is built from public/src/ (scripts/buildApp.js): fail if
// someone edited app.js directly or forgot to rebuild.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { build } = require('../scripts/buildApp');
console.log('appBuild');
try {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8'), build(), 'public/app.js is out of step with public/src/ - edit public/src/ and run: node scripts/buildApp.js');
  console.log('  ok - public/app.js matches public/src/');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
