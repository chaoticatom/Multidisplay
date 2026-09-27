// Tests for src/atomicWrite.js - crash-safe config saves.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { atomicWriteJson } = require('../src/atomicWrite');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}

console.log('atomicWrite');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-'));
const file = path.join(dir, 'cfg.json');

test('writes pretty JSON and leaves no temp file behind', () => {
  atomicWriteJson(file, { a: 1 });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { a: 1 });
  assert.deepStrictEqual(fs.readdirSync(dir), ['cfg.json']);
});

test('replaces an existing file in full', () => {
  atomicWriteJson(file, { b: [1, 2, 3] });
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { b: [1, 2, 3] });
});

test('a value that fails to serialise leaves the old file untouched', () => {
  const circular = {}; circular.self = circular;
  assert.throws(() => atomicWriteJson(file, circular));
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { b: [1, 2, 3] });
  assert.deepStrictEqual(fs.readdirSync(dir), ['cfg.json']);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? 'Some atomicWrite tests FAILED' : 'All atomicWrite tests passed');
