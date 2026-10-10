// Every effect options panel on the page must be in WIRED_OPTION_PANELS, or
// the page greys it out ("Effect options aren't wired") - which happened to
// Weather Radar and Talking Face when they were added.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
console.log('optionPanels');
try {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const core = fs.readFileSync(path.join(__dirname, '..', 'public', 'src', '00-core.js'), 'utf8');
  const panels = [...html.matchAll(/class="effect-panel" id="panel-([a-z_0-9]+)"/g)].map((m) => m[1]);
  const wired = new Set(JSON.parse(core.match(/WIRED_OPTION_PANELS = new Set\((\[[^\]]*\])/)[1].replace(/'/g, '"')));
  const missing = panels.filter((p) => !wired.has(p));
  assert.deepStrictEqual(missing, [], 'add these to WIRED_OPTION_PANELS in public/src/00-core.js: ' + missing.join(', '));
  console.log('  ok - all ' + panels.length + ' options panels are enabled');
} catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
