// Tests for src/pinConfig.js and the WebSocket PIN gate.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pinConfig = require('../src/pinConfig');
const WsServer = require('../src/wsServer');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-'));
const file = path.join(dir, 'security-config.json');

console.log('pinConfig');
test('no PIN set: everything verifies', () => {
  assert.strictEqual(pinConfig.isPinSet(pinConfig.load(file)), false);
  assert.ok(pinConfig.verifyPin({}, undefined));
});
test('set PIN is stored hashed and verifies only the right PIN', () => {
  const cfg = pinConfig.setPin('4821', file);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('4821'));
  assert.ok(pinConfig.verifyPin(pinConfig.load(file), '4821'));
  assert.ok(!pinConfig.verifyPin(cfg, '4822'));
  assert.ok(!pinConfig.verifyPin(cfg, ''));
});
test('rejects bad PINs, empty clears', () => {
  assert.throws(() => pinConfig.setPin('12', file));
  assert.throws(() => pinConfig.setPin('12 34', file));
  pinConfig.setPin('', file);
  assert.strictEqual(pinConfig.isPinSet(pinConfig.load(file)), false);
});
test('an unauthenticated socket cannot run commands; the right PIN admits it', () => {
  const sent = [];
  const ws = { readyState: 1, send: (m) => sent.push(JSON.parse(m)), close() {} };
  const server = { _clients: new Set(), pinCfg: pinConfig.setPin('4821', file), state: { brightness: 1 }, stateVersion: 0, _stateMsg: () => ({ cmd: 'state' }) };
  server._handleAuth = WsServer.prototype._handleAuth;
  const handle = (m) => WsServer.prototype._handleMessage.call(server, ws, Buffer.from(JSON.stringify(m)), false);
  handle({ cmd: 'setBrightness', value: 0.2 });
  assert.strictEqual(server.state.brightness, 1, 'command must be ignored before auth');
  // A real report: the page had to enter the PIN several times - every
  // early command was answered with another authRequired, and each one
  // opened another PIN box. The Pi now asks once, on connect.
  assert.ok(!sent.some((m) => m.cmd === 'authRequired'), 'no second PIN request for an early command');
  handle({ cmd: 'auth', pin: '4821' });
  assert.ok(server._clients.has(ws));
  assert.ok(sent.some((m) => m.cmd === 'state'));
  handle({ cmd: 'setBrightness', value: 0.2 });
  assert.strictEqual(server.state.brightness, 0.2);
});
fs.rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? 'Some pinConfig tests FAILED' : 'All pinConfig tests passed');
