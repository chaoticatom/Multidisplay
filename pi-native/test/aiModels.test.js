'use strict';
// ai.listModels: the Gemini list is filtered to chat models, with the
// recommended default first even though the API doesn't list the alias.
const assert = require('assert');
const ai = require('../src/ai');

(async () => {
  try {
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ models: [
      { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.0-pro', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    ] }) });
    const r = await ai.listModels({ provider: 'gemini', key: 'k' });
    assert.strictEqual(r.default, 'gemini-flash-latest');
    assert.deepStrictEqual(r.models, ['gemini-flash-latest', 'gemini-3.0-pro', 'gemini-2.0-flash']);
    await assert.rejects(ai.listModels({ provider: 'gemini', key: '' }), /key/);
    assert.deepStrictEqual(await ai.listModels({ provider: 'off' }), { models: [], default: '' });
    console.log('aiModels ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
