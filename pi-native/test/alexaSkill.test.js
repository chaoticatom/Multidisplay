'use strict';
// Your own Alexa skill (src/alexaSkill.js): only Amazon's signed requests
// for the saved skill are accepted; each intent does the right thing.
const assert = require('assert');
const sk = require('../src/alexaSkill');

(async () => {
  try {
    // Signing certificate address: only Amazon's.
    assert.ok(sk.certUrlOk('https://s3.amazonaws.com/echo.api/echo-api-cert.pem'));
    assert.ok(sk.certUrlOk('https://s3.amazonaws.com:443/echo.api/../echo.api/echo-api-cert.pem'));
    for (const bad of ['http://s3.amazonaws.com/echo.api/c.pem', 'https://notamazon.com/echo.api/c.pem', 'https://s3.amazonaws.com/EcHo.aPi/c.pem', 'https://s3.amazonaws.com/invalid.path/c.pem', 'https://s3.amazonaws.com:563/echo.api/c.pem']) assert.ok(!sk.certUrlOk(bad), bad);

    const now = Date.parse('2026-10-10T12:00:00Z');
    const body = (o = {}) => ({ context: { System: { application: { applicationId: 'amzn1.ask.skill.abc' } } }, request: { type: 'LaunchRequest', timestamp: '2026-10-10T11:59:30Z', ...o } });
    const hdr = { signaturecertchainurl: 'https://s3.amazonaws.com/echo.api/echo-api-cert.pem', 'signature-256': 'AAAA' };
    const raw = Buffer.from('{}');
    await assert.rejects(sk.verify(hdr, raw, body(), '', { now: () => now }), /no skill ID/);
    await assert.rejects(sk.verify(hdr, raw, body(), 'amzn1.ask.skill.other', { now: () => now }), /wrong skill/);
    await assert.rejects(sk.verify(hdr, raw, body({ timestamp: '2026-10-10T11:50:00Z' }), 'amzn1.ask.skill.abc', { now: () => now }), /too old/);
    await assert.rejects(sk.verify({ ...hdr, signaturecertchainurl: 'https://evil.com/echo.api/x.pem' }, raw, body(), 'amzn1.ask.skill.abc', { now: () => now }), /bad signature headers/);
    const fakeCert = async () => ({ ok: true, text: async () => 'not a cert' });
    await assert.rejects(sk.verify(hdr, raw, body(), 'amzn1.ask.skill.abc', { now: () => now, fetchFn: fakeCert }), /no certificate/);

    // The interaction model carries the effects (and scenes) as slot values.
    const names = { none: 'None', fireworks: 'Fireworks 🎆', talking_face: 'Talking Face', datetime: 'Date & Time' };
    const m = sk.model('led wall', names, [{ name: 'Party' }]).interactionModel.languageModel;
    assert.strictEqual(m.invocationName, 'led wall');
    const vals = m.types[0].values.map((v) => v.id);
    assert.deepStrictEqual(vals, ['fireworks', 'talking_face', 'datetime', 'scene:Party']);
    assert.strictEqual(m.types[0].values[0].name.value, 'fireworks');

    // Intents.
    const ran = []; const chats = [];
    const server = { state: { effect: 'plasma', scenes: [{ name: 'Party' }] }, runCommand(msg, ws) { ran.push(msg); if (msg.cmd === 'aiAsk') ws.send(JSON.stringify({ cmd: 'aiResult', say: 'A calm sunset, coming up.' })); }, faceTalk: { chat: (t) => chats.push(t) } };
    const intent = (name, slots = {}) => ({ request: { type: 'IntentRequest', intent: { name, slots } } });
    let r = await sk.answer(server, intent('ShowIntent', { effect: { value: 'fireworks' } }), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'setEffect', effect: 'fireworks' });
    assert.strictEqual(r.response.outputSpeech.text, 'Showing Fireworks.');
    await sk.answer(server, intent('ShowIntent', { effect: { value: 'x', resolutions: { resolutionsPerAuthority: [{ status: { code: 'ER_SUCCESS_MATCH' }, values: [{ value: { id: 'scene:Party' } }] }] } } }), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'applyScene', name: 'Party' });
    r = await sk.answer(server, intent('AskIntent', { text: { value: 'a calm sunset' } }), names);
    assert.strictEqual(r.response.outputSpeech.text, 'A calm sunset, coming up.');
    r = await sk.answer(server, intent('ChatIntent', { text: { value: 'how are you' } }), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'setEffect', effect: 'talking_face' });
    assert.deepStrictEqual(chats, ['how are you']);
    assert.ok(!r.response.outputSpeech, 'the face answers, Alexa stays quiet');
    await sk.answer(server, intent('BrightnessIntent', { level: { value: '50' } }), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'setBrightness', value: 0.75 });
    await sk.answer(server, intent('VolumeIntent', { level: { value: '30' } }), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'setMasterVolume', value: 0.3 });
    await sk.answer(server, intent('TurnOffIntent'), names);
    assert.deepStrictEqual(ran.pop(), { cmd: 'clearAll' });
    r = await sk.answer(server, { request: { type: 'LaunchRequest' } }, names);
    assert.strictEqual(r.response.shouldEndSession, false);
    console.log('alexaSkill ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
