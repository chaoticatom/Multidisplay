'use strict';
// Gemini 429 (free limit used up): rests for the time Google asks instead
// of retrying every call; speech quietly falls back to the basic voice.
const assert = require('assert');
const aiConfig = require('../src/aiConfig');
aiConfig.load = () => ({ provider: 'gemini', key: 'k', model: '' });
const ai = require('../src/ai');

(async () => {
  try {
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: false, status: 429, json: async () => ({ error: { message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '120s' }] } }) }; };
    await assert.rejects(ai.chat([], 'hi'), (e) => e.quota && /free limit/.test(e.message));
    const after = calls;
    await assert.rejects(ai.chat([], 'hi again'), (e) => e.quota);
    assert.strictEqual(calls, after, 'no request while resting');
    assert.ok(ai.resting('text') > 100000 && ai.resting('text') <= 120000);
    assert.strictEqual(await ai.speech('hello'), null, 'speech: basic voice instead');
    assert.strictEqual(await ai.speech('hello'), null);
    assert.strictEqual(calls, after + 1, 'speech rests too');
    console.log('aiQuota ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
