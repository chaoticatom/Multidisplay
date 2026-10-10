// This batch's code changes: well-formed command check, option size limits,
// photo list cache.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WsServer = require('../src/wsServer');
const { COMMANDS } = require('../src/wsCommands');
console.log('batchQuality');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

t('only well-formed commands get through', () => {
  const ok = WsServer.isWellFormed;
  assert.ok(ok({ cmd: 'setEffect', effect: 'plasma' }));
  assert.ok(!ok(null)); assert.ok(!ok([])); assert.ok(!ok({})); assert.ok(!ok({ cmd: 42 }));
  assert.ok(!ok({ cmd: '_ytStart' }), 'internal helpers are not commands');
  assert.ok(!ok({ cmd: 'x'.repeat(41) }));
  assert.ok(!ok(JSON.parse('{"cmd":"setEffect","__proto__":{"admin":true}}')));
});
t('effect options: bad keys and oversized values are refused', () => {
  const srv = { state: { effectOptions: {} }, _broadcast() {}, _stateMsg() { return {}; } };
  COMMANDS.setEffectOption.call(srv, {}, { effect: 'plasma', key: 'speed', value: 3 });
  assert.strictEqual(srv.state.effectOptions.plasma.speed, 3);
  COMMANDS.setEffectOption.call(srv, {}, { effect: 'plasma', key: '__proto__', value: { x: 1 } });
  COMMANDS.setEffectOption.call(srv, {}, { effect: 'plasma', key: 'big', value: 'x'.repeat(20000) });
  COMMANDS.setEffectOption.call(srv, {}, { effect: 'plasma', key: 'bad key!', value: 1 });
  assert.deepStrictEqual(Object.keys(srv.state.effectOptions.plasma), ['speed']);
  assert.strictEqual({}.x, undefined, 'no prototype pollution');
});
t('clock pings only echo numbers', () => {
  const out = []; const ws = { readyState: 1, send: (m) => out.push(JSON.parse(m)) };
  COMMANDS.clockPing.call({}, ws, { c: { huge: 'object' } });
  assert.strictEqual(out.length, 0);
  COMMANDS.clockPing.call({}, ws, { c: 5 });
  assert.strictEqual(out[0].c, 5);
});
t('photo list is cached and refreshed when the folder changes', () => {
  const { PHOTO_DIR } = require('../src/effects/myPhotos');
  const httpApi = require('../src/httpApi');
  const made = !fs.existsSync(PHOTO_DIR); if (made) fs.mkdirSync(PHOTO_DIR, { recursive: true });
  try {
  const before = httpApi.listPhotos();
  const f = path.join(PHOTO_DIR, 'zz-test-' + process.pid + '.png');
  fs.writeFileSync(f, 'x');
  try { assert.ok(httpApi.listPhotos().includes(path.basename(f)), 'a new file shows up'); }
  finally { fs.unlinkSync(f); }
  assert.deepStrictEqual(httpApi.listPhotos(), before);
  } finally { if (made) fs.rmSync(PHOTO_DIR, { recursive: true, force: true }); }
});
if (failed) process.exitCode = 1;
