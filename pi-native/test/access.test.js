// Who needs the PIN (src/access.js).
'use strict';
const assert = require('assert');
const a = require('../src/access');
console.log('access');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }
const req = (ip, headers = {}) => ({ headers, socket: { remoteAddress: ip } });
t('home addresses are local, the tunnel and public addresses are remote', () => {
  assert.strictEqual(a.isRemote(req('192.168.0.20')), false);
  assert.strictEqual(a.isRemote(req('::ffff:10.0.0.5')), false);
  assert.strictEqual(a.isRemote(req('127.0.0.1', { 'cf-connecting-ip': '81.2.3.4' })), true, 'the Cloudflare tunnel connects from localhost but is remote');
  assert.strictEqual(a.isRemote(req('81.2.3.4')), true);
});
t('roles', () => {
  assert.strictEqual(a.decide({ pinSet: false, remote: true, access: {} }), 'admin');
  assert.strictEqual(a.decide({ pinSet: true, remote: false, access: { localNoPin: true } }), 'admin');
  assert.strictEqual(a.decide({ pinSet: true, remote: false, access: { localNoPin: false } }), 'auth');
  assert.strictEqual(a.decide({ pinSet: true, remote: true, access: { guests: true } }), 'guest');
  assert.strictEqual(a.decide({ pinSet: true, remote: true, access: {} }), 'auth');
});
t('guests can only pick effects and scenes', () => {
  assert.ok(a.GUEST_CMDS.has('setEffect') && a.GUEST_CMDS.has('applyScene'));
  assert.ok(!a.GUEST_CMDS.has('setControlPin') && !a.GUEST_CMDS.has('clearAll') && !a.GUEST_CMDS.has('reboot'));
});
if (failed) process.exitCode = 1;
