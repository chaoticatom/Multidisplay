// Manual smoke test - not part of `npm test` (that's core.test.js). Run
// against a live `node src/app.js` to verify the WS control/preview
// protocol actually works end to end: connect, receive state, send a
// command, receive binary preview frames of the expected shape.
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:8081');
let textMsgs = 0, binMsgs = 0, faceSeen = new Set();

ws.on('open', () => {
  console.log('connected');
  setTimeout(() => {
    ws.send(JSON.stringify({ cmd: 'setEffect', effect: 'gradient_wash' }));
    console.log('sent setEffect gradient_wash');
  }, 200);
});

ws.on('message', (data, isBinary) => {
  if (isBinary) {
    binMsgs++;
    const expectedLen = 1 + 64 * 64 * 3;
    if (data.length !== expectedLen) {
      console.error(`FAIL: frame length ${data.length}, expected ${expectedLen}`);
      process.exit(1);
    }
    faceSeen.add(data[0]);
  } else {
    textMsgs++;
    console.log('text:', data.toString());
  }
});

setTimeout(() => {
  console.log(`textMsgs=${textMsgs} binMsgs=${binMsgs} facesSeen=${[...faceSeen].sort().join(',')}`);
  if (textMsgs < 2) { console.error('FAIL: expected at least 2 text messages (initial state + setEffect ack)'); process.exit(1); }
  if (binMsgs < 6) { console.error('FAIL: expected at least 6 binary frames (one per face)'); process.exit(1); }
  if (faceSeen.size !== 6) { console.error(`FAIL: expected 6 distinct face IDs, got ${faceSeen.size}`); process.exit(1); }
  console.log('PASS');
  process.exit(0);
}, 2000);
