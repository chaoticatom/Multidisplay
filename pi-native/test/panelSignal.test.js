'use strict';
// Panel signal settings (src/panelConfig.js cleanSignal): defaults, limits,
// and the driver getting them.
const assert = require('assert');
const { cleanSignal } = require('../src/panelConfig');
try {
  assert.deepStrictEqual(cleanSignal(null), { slowdown: 2, panelType: '', lsbNs: 130 });
  assert.deepStrictEqual(cleanSignal({ slowdown: 4, panelType: 'FM6126A', lsbNs: 200 }), { slowdown: 4, panelType: 'FM6126A', lsbNs: 200 });
  assert.deepStrictEqual(cleanSignal({ slowdown: 9, panelType: 'bogus', lsbNs: 9999 }), { slowdown: 2, panelType: '', lsbNs: 300 });
  // The driver is built with them (checked in the source: the native addon isn't here).
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/loadDriver.js'), 'utf8');
  assert.ok(/gpioSlowdown: sig\.slowdown/.test(src) && /panelType: sig\.panelType/.test(src) && /pwmLsbNanoseconds: sig\.lsbNs/.test(src));
  console.log('panelSignal ok');
} catch (e) { console.error(e); process.exitCode = 1; }
