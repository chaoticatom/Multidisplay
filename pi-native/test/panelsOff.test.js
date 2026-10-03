// 💡 LED panels off: panels get brightness 0, preview frames keep flowing;
// 👁 preview off: that one connection stops receiving frames.
const assert = require('assert');
const { COMMANDS } = require('../src/wsCommands');
console.log('panelsOff');
try {
  const srv = { state: {}, _broadcast() {}, _stateMsg() { return {}; } };
  COMMANDS.setPanelsOff.call(srv, {}, { on: true });
  assert.strictEqual(srv.state.panelsOff, true);
  COMMANDS.setPanelsOff.call(srv, {}, { on: false });
  assert.strictEqual(srv.state.panelsOff, false);
  const ws = {};
  COMMANDS.setPreviewOff.call(srv, ws, { on: true });
  assert.strictEqual(ws.previewOff, true);
  const src = require('fs').readFileSync(require.resolve('../src/renderWorker.js'), 'utf8');
  assert.ok(/renderFrame\(core, state\.panelsOff \? 0/.test(src), 'worker must push brightness 0 while panels are off');
  console.log('  ok - panels off and preview off toggles');
} catch (err) { console.error('  FAIL -', err.message); process.exitCode = 1; }
