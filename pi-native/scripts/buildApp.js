// Builds public/app.js (the page's one script, as served and as copied into
// the online demo) by joining the files in public/src/ in name order. Edit
// those, not app.js - the test suite fails if app.js is out of step.
//   node scripts/buildApp.js          - write public/app.js
//   node scripts/buildApp.js --check  - exit 1 if public/app.js is stale
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'public');
function build() {
  return fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.js')).sort()
    .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('');
}
if (require.main === module) {
  const out = build(), file = path.join(root, 'app.js');
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(file, 'utf8') !== out) { console.error('public/app.js is out of step with public/src/ - run: node scripts/buildApp.js'); process.exit(1); }
    console.log('public/app.js matches public/src/');
  } else { fs.writeFileSync(file, out); console.log('built public/app.js from public/src/'); }
}
module.exports = { build };
