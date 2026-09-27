// Version bump + simulator rebuild in one step: `npm run release` bumps the
// patch version, `npm run release -- 0.7.0` sets an exact one. Every change
// used to need the same three hand edits (package.json's "version",
// public/app.js's APP_VERSION, public/index.html's app.js?v= cache-bust),
// then `node sim/deploy.js` - easy to leave one out of step. This does all
// four and fails loudly if any of the expected strings isn't found.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PI_NATIVE = path.join(__dirname, '..');
const pkgPath = path.join(PI_NATIVE, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const from = pkg.version;

let to = process.argv[2];
if (!to) {
  const parts = from.split('.').map(Number);
  parts[2] += 1;
  to = parts.join('.');
}
if (!/^\d+\.\d+\.\d+$/.test(to)) {
  console.error(`[release] not a version: ${to}`);
  process.exit(1);
}

// [file, text before, text after] - each must match exactly once.
const EDITS = [
  ['package.json', `"version": "${from}"`, `"version": "${to}"`],
  ['public/app.js', `const APP_VERSION = '${from}';`, `const APP_VERSION = '${to}';`],
  ['public/index.html', `app.js?v=${from}"`, `app.js?v=${to}"`],
];
const updated = EDITS.map(([rel, before, after]) => {
  const file = path.join(PI_NATIVE, rel);
  const text = fs.readFileSync(file, 'utf8');
  const count = text.split(before).length - 1;
  if (count !== 1) {
    console.error(`[release] expected exactly one "${before}" in ${rel}, found ${count} - versions out of step?`);
    process.exit(1);
  }
  return [file, text.replace(before, after)];
});
for (const [file, text] of updated) fs.writeFileSync(file, text);
console.log(`[release] ${from} -> ${to}`);

execFileSync(process.execPath, [path.join(PI_NATIVE, 'sim', 'deploy.js')], { stdio: 'inherit' });
