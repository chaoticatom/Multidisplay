// Talking Face: the conversation logic (src/faceTalk.js) and the face effect
// (src/effects/talkingFace.js, faceRender.js).
'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { createFaceTalk } = require('../src/faceTalk');
const tf = require('../src/effects/talkingFace');
const { CubeCore } = require('../src/core');
console.log('talkingFace');

(async () => {
  try {
    // Saying a typed line: queued with a start time and a speaking rate.
    let broadcasts = 0, t = 1e12;
    const state = { effect: 'talking_face', effectOptions: { talking_face: { voice: 'off' } } };
    const offAi = { chat: async () => ({ off: true }) };
    let talk = createFaceTalk({ state, broadcast: () => broadcasts++, ai: offAi, now: () => t });
    talk.say('  Hello   there  ');
    assert.strictEqual(state.faceTalk.say.text, 'Hello there');
    assert.ok(state.faceTalk.say.at > t && state.faceTalk.say.cps > 0 && broadcasts > 0);
    console.log('  ok - a typed line is said');

    // Chat with no AI: a friendly fallback that says how to turn it on.
    await talk.chat('How are you?');
    assert.ok(/AI assistant in Setup/.test(state.faceTalk.say.text));
    assert.deepStrictEqual(state.faceTalk.log.slice(-2).map((m) => m.who), ['you', 'face']);
    assert.strictEqual(state.faceTalk.thinking, false);
    // With an AI: its reply is said, and it gets the conversation so far.
    let seen = null;
    talk = createFaceTalk({ state, broadcast() {}, ai: { chat: async (hist, text) => { seen = { hist, text }; return { say: 'I am well, thanks!' }; } }, now: () => t });
    await talk.chat('And you?');
    assert.strictEqual(state.faceTalk.say.text, 'I am well, thanks!');
    assert.strictEqual(seen.text, 'And you?'); assert.ok(seen.hist.length >= 2);
    console.log('  ok - chat answers through the AI assistant, or a fallback without it');

    // Idle: starts a topic by itself after the quiet gap, not before; never when "only when asked".
    state.effectOptions.talking_face.chatty = 20;
    talk = createFaceTalk({ state, broadcast() {}, ai: offAi, now: () => t });
    const before = state.faceTalk.say.id;
    talk.tick(); await new Promise((r) => setImmediate(r));
    t += 25000; talk.tick(); await new Promise((r) => setImmediate(r));
    assert.notStrictEqual(state.faceTalk.say.id, before, 'a new topic after 20 s quiet');
    state.effectOptions.talking_face.chatty = 0;
    const id2 = state.faceTalk.say.id; t += 600000; talk.tick(); await new Promise((r) => setImmediate(r));
    assert.strictEqual(state.faceTalk.say.id, id2);
    state.effect = 'plasma'; state.effectOptions.talking_face.chatty = 20; t += 600000; talk.tick(); await new Promise((r) => setImmediate(r));
    assert.strictEqual(state.faceTalk.say.id, id2, 'not while another effect is on screen');
    state.effect = 'talking_face';
    console.log('  ok - chats by itself when quiet, only while on screen');

    // Pi voice: espeak-ng piped to paplay, the text passed as an argument (not in the shell line).
    const calls = [];
    const spawnFn = (cmd, args) => { calls.push({ cmd, args }); const p = new EventEmitter(); p.stderr = new EventEmitter(); p.kill = () => {}; return p; };
    state.effectOptions.talking_face.voice = 'pi';
    talk = createFaceTalk({ state, broadcast() {}, ai: offAi, spawnFn, now: () => t });
    talk.say('Hi "there"; rm -rf /');
    assert.strictEqual(calls[0].cmd, 'sh');
    assert.ok(/espeak-ng .*"\$1" \| paplay/.test(calls[0].args[1]));
    assert.strictEqual(calls[0].args[3], 'Hi "there"; rm -rf /', 'text goes as $1, never into the command');
    console.log('  ok - the Pi voice runs espeak-ng safely');

    // Lips: open on vowels, closed on m/b/p; speech index follows the clock.
    const { viseme, speechIndex } = tf._test;
    assert.ok(viseme('a')[0] > 0.6 && viseme('m')[0] === 0 && viseme('o')[1] < 0);
    assert.strictEqual(speechIndex({ text: 'hello', at: 1000, cps: 10 }, 1250), 2);
    assert.strictEqual(speechIndex({ text: 'hello', at: 1000, cps: 10 }, 5000), -1, 'finished');
    console.log('  ok - lip shapes and timing');

    // The effect draws a face, and its mouth opens while speaking a vowel.
    const core = new CubeCore(64); core.initWall([0, 1, 2, 3, 4, 5].map((g) => ({ gx: g, gy: 0 })), 64); core.effectOptions = {};
    core.faceTalk = { say: { id: 9, text: 'aaaaaaaaaaaaaaaaaaaa', at: Date.now() - 300, cps: 15 } };
    for (let i = 0; i < 15; i++) tf.wall(core, 1 / 30);
    let lit = 0; for (let i = 0; i < core.wallBuf.length; i += 3) if (core.wallBuf[i] > 0.3) lit++;
    assert.ok(lit > 800, 'a face and captions are drawn: ' + lit);
    assert.ok(tf._test.st.open > 0.4, 'mouth open on "a": ' + tf._test.st.open);
    console.log('  ok - the face is drawn and talks');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
})();
