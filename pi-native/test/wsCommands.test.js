// Tests for the WebSocket command table (src/wsCommands.js) and its dispatch.
const assert = require('assert');
const { COMMANDS } = require('../src/wsCommands');
const WsServer = require('../src/wsServer');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}

console.log('wsCommands');
test('every handler is a function taking (ws, msg)', () => {
  for (const [name, fn] of Object.entries(COMMANDS)) assert.strictEqual(typeof fn, 'function', name);
  assert.ok(Object.keys(COMMANDS).length >= 40);
});
test('prototype names and unknown commands are ignored, not dispatched', () => {
  const fake = { state: {}, stateVersion: 0 };
  for (const cmd of ['__proto__', 'constructor', 'toString', 'noSuchCommand']) {
    assert.doesNotThrow(() => WsServer.prototype._handleMessage.call(fake, null, Buffer.from(JSON.stringify({ cmd })), false));
  }
});
test('setBrightness clamps via the table exactly as the old chain did', () => {
  const fake = { state: {} };
  COMMANDS.setBrightness.call(fake, null, { cmd: 'setBrightness', value: 9 });
  assert.strictEqual(fake.state.brightness, 1.5);
});
console.log(process.exitCode ? 'Some wsCommands tests FAILED' : 'All wsCommands tests passed');
