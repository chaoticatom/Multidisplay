// Tests for src/diagnostics.js.
const assert = require('assert');
const { createDiagnostics } = require('../src/diagnostics');

console.log('diagnostics');
const origWarn = console.warn, origError = console.error;
try {
  const d = createDiagnostics();
  for (let i = 0; i < 30; i++) d.recordFrame(2 + (i % 3));
  console.error('[test] something broke', new Error('boom'));
  const s = d.snapshot({ version: 'x' });
  assert.ok(s.fps > 0 && s.renderMsAvg >= 2 && s.renderMsMax === 4, JSON.stringify(s));
  assert.strictEqual(s.version, 'x');
  assert.ok(s.log.some((e) => e.level === 'error' && /something broke boom/.test(e.msg)));
  assert.ok(Number.isFinite(s.cpuPct) && s.rssMB > 0);
  const s2 = d.snapshot();
  assert.strictEqual(s2.renderMsAvg, null, 'frame counters reset after each snapshot');
  for (let i = 0; i < 50; i++) console.warn('w' + i);
  assert.strictEqual(d.snapshot().log.length, 20, 'log is capped');
  console.log('  ok - frame stats, resource stats, capped warning/error log');
  console.log('All diagnostics tests passed');
} catch (err) {
  console.warn = origWarn; console.error = origError;
  console.error('  FAIL -', err.stack);
  process.exitCode = 1;
}
