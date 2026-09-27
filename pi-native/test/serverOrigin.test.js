// Tests for wsServer.js's isSameOrigin() - the cross-site guard on the
// control WebSocket and the upload route.
const assert = require('assert');
const { isSameOrigin } = require('../src/wsServer');

function test(name, fn) {
  try { fn(); console.log(`  ok - ${name}`); } catch (err) { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; }
}
const req = (origin, host) => ({ headers: origin === undefined ? { host } : { origin, host } });

console.log('serverOrigin');
test('the control page itself is allowed (http and https ports)', () => {
  assert.ok(isSameOrigin(req('http://192.168.1.20:8081', '192.168.1.20:8081')));
  assert.ok(isSameOrigin(req('https://multidisplay.local:8082', 'multidisplay.local:8082')));
});
test('non-browser clients with no Origin header are allowed', () => {
  assert.ok(isSameOrigin(req(undefined, '192.168.1.20:8081')));
});
test('another site, or the same host on another port, is refused', () => {
  assert.ok(!isSameOrigin(req('https://evil.example', '192.168.1.20:8081')));
  assert.ok(!isSameOrigin(req('http://192.168.1.20:3000', '192.168.1.20:8081')));
});
test('a malformed or opaque Origin is refused', () => {
  assert.ok(!isSameOrigin(req('null', '192.168.1.20:8081')));
  assert.ok(!isSameOrigin(req('not a url', '192.168.1.20:8081')));
});
console.log(process.exitCode ? 'Some serverOrigin tests FAILED' : 'All serverOrigin tests passed');
