// 🎨 Draw (effects/drawPad.js) and 💌 Message notes (sendNote + effects/notice.js).
'use strict';
const assert = require('assert');
const { CubeCore } = require('../src/core');
const drawPad = require('../src/effects/drawPad');
const { renderNotice } = require('../src/effects/notice');
console.log('drawNote');
let failed = false;
function t(name, fn) { try { fn(); console.log('  ok - ' + name); } catch (e) { failed = true; console.error('  FAIL - ' + name, e.message); } }

const wall = () => { const c = new CubeCore(64); c.initWall([{ gx: 0, gy: 0 }], 64); c.effectOptions = {}; return c; };
const px = (c, x, y) => { const i = (y * c.wallW + x) * 3; return [c.wallBuf[i], c.wallBuf[i + 1], c.wallBuf[i + 2]].map((v) => Math.round(v * 255)); };

t('brush dabs from the phone appear on the wall', () => {
  drawPad.applyOps({ w: 64, h: 64, clear: true, ops: [[10, 12, 0xff0000, 1], [40, 40, 0x00ff00, 3]] });
  const c = wall(); drawPad.wall(c, 1 / 30);
  assert.deepStrictEqual(px(c, 10, 12), [255, 0, 0]);
  assert.deepStrictEqual(px(c, 41, 41), [0, 255, 0]); // size 3 covers 39..41
  assert.deepStrictEqual(px(c, 0, 0), [0, 0, 0]);
});
t('a whole picture replaces the drawing, clear wipes it', () => {
  const img = Buffer.alloc(64 * 64 * 3, 0); img[(5 * 64 + 6) * 3 + 2] = 200;
  drawPad.applyOps({ w: 64, h: 64, image: img.toString('base64') });
  let c = wall(); drawPad.wall(c, 1 / 30);
  assert.deepStrictEqual(px(c, 6, 5), [0, 0, 200]);
  assert.deepStrictEqual(px(c, 10, 12), [0, 0, 0]);
  drawPad.applyOps({ clear: true });
  c = wall(); drawPad.wall(c, 1 / 30);
  assert.deepStrictEqual(px(c, 6, 5), [0, 0, 0]);
});
t('junk ops are ignored', () => {
  drawPad.applyOps({ ops: ['x', null, [1e9, -5, 1, 1]] });
  drawPad.applyOps(null);
  drawPad.applyOps({ image: 'not the right size' });
});
t('a message note is drawn over the display', () => {
  const c = wall(); c.wallBuf.fill(0);
  const state = { notice: { text: 'Dinner is ready!', color: '#ffd23d', until: Date.now() + 30000, style: 'note' } };
  for (let i = 0; i < 30; i++) renderNotice(c, state, 'wall', 1 / 30);
  const [r, g] = px(c, 32, 30);
  assert.ok(r > 60 && g > 50, 'yellow paper in the middle of the display');
});
t('sendNote stores a note for the display', () => {
  const COMMANDS = require('../src/wsCommands');
  const fake = { state: {}, _broadcast() {}, _stateMsg() { return {}; } };
  (COMMANDS.sendNote || COMMANDS.COMMANDS.sendNote).call(fake, null, { text: '  Hello   there ', color: '#ff7eb6', secs: 120 });
  assert.strictEqual(fake.state.notice.text, 'Hello there');
  assert.strictEqual(fake.state.notice.style, 'note');
  assert.strictEqual(fake.state.notice.color, '#ff7eb6');
  assert.ok(fake.state.notice.until - Date.now() > 100000);
  (COMMANDS.sendNote || COMMANDS.COMMANDS.sendNote).call(fake, null, { text: '   ' });
  assert.strictEqual(fake.state.notice.text, 'Hello there', 'an empty message changes nothing');
});
if (failed) process.exitCode = 1;
