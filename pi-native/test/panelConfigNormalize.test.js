// Layouts must start at the top-left cell - the hardware chain starts
// there, so a lone panel left at (0,2) after removing the others showed
// nothing on the physical display.
'use strict';
const assert = require('assert');
const { normalizeFlat } = require('../src/panelConfig');

try {
  assert.deepStrictEqual(normalizeFlat({ size: 64, mode: 'wall', panels: [{ gx: 0, gy: 2 }] }).panels, [{ gx: 0, gy: 0 }]);
  assert.deepStrictEqual(normalizeFlat({ size: 64, mode: 'wall', panels: [{ gx: 1, gy: 1 }, { gx: 1, gy: 2 }] }).panels, [{ gx: 0, gy: 0 }, { gx: 0, gy: 1 }]);
  assert.deepStrictEqual(normalizeFlat({ size: 64, mode: '2d', panels: [] }).panels, [{ gx: 0, gy: 0 }]);
  const ok = { size: 64, mode: 'wall', panels: [{ gx: 0, gy: 0 }, { gx: 1, gy: 0 }] };
  assert.strictEqual(normalizeFlat(ok), ok);
  console.log('  ok - flat layouts are shifted to start at the top-left cell');
} catch (e) {
  console.error('  FAIL -', e.message);
  process.exitCode = 1;
}
