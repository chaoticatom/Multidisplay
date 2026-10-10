// Gemini retires model names ("This model ... is no longer available"): the
// app asks which models the key can use, switches to the best and remembers it.
'use strict';
const assert = require('assert');
console.log('geminiFallback');
const aiConfig = require('../src/aiConfig');
aiConfig.load = () => ({ provider: 'gemini', key: 'k', model: '', url: '' });
const calls = [];
global.fetch = async (url, opts = {}) => {
  calls.push(String(url));
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (/\/models\?/.test(url)) return json(200, { models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ] });
  if (/gemini-flash-latest|gemini-2\.5-flash:|gemini-2\.5-flash-preview-tts/.test(url)) return json(404, { error: { message: 'This model models/x is no longer available to new users.' } });
  if (/gemini-3-flash-preview-tts:/.test(url)) return json(200, { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.alloc(9600).toString('base64') } }] } }] });
  if (/gemini-3-flash:/.test(url)) return json(200, { candidates: [{ content: { parts: [{ text: '{"say":"Hello!","laugh":"none"}' }] } }] });
  return json(500, {});
};
const ai = require('../src/ai');
(async () => {
  try {
    const r = await ai.chat([], 'hi');
    assert.strictEqual(r.say, 'Hello!');
    assert.strictEqual(ai._geminiWorking.text, 'gemini-3-flash', 'picked the newest plain flash model');
    const n = calls.length; await ai.chat([], 'again');
    assert.ok(calls.slice(n).every((u) => /gemini-3-flash:/.test(u)), 'remembered: no more failed tries');
    console.log('  ok - a retired text model is replaced automatically');
    const pcm = await ai.speech('hello', 'Kore');
    assert.ok(pcm && pcm.length === 9600);
    assert.strictEqual(ai._geminiWorking.speech, 'gemini-3-flash-preview-tts');
    console.log('  ok - a retired speech model is replaced automatically');

    // A model that refuses the "no thinking" setting gets the request again without it.
    let n2 = 0;
    global.fetch = async (url, o) => { n2++; const b = JSON.parse(o.body); if (b.generationConfig.thinkingConfig) return { ok: false, status: 400, json: async () => ({ error: { message: 'Thinking is not supported by this model.' } }) }; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"say":"ok"}' }] } }] }) }; };
    const r2 = await ai.chat([], 'hi');
    assert.strictEqual(r2.say, 'ok'); assert.strictEqual(n2, 2);
    console.log('  ok - retried without the thinking setting when a model refuses it');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
})();
