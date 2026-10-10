'use strict';
// Pi microphone (src/mic.js): speech is cut into one utterance per sentence,
// ignored while the face talks; monitors aren't microphones. Plus the
// overall volume (src/masterVolume.js) and the face answering what it hears.
const assert = require('assert');
const { createMic, pickSource } = require('../src/mic');
const masterVolume = require('../src/masterVolume');
const { createFaceTalk } = require('../src/faceTalk');

const frame = (amp, i0 = 0) => { const b = Buffer.alloc(960); for (let i = 0; i < 480; i++) b.writeInt16LE(Math.round(amp * 32767 * Math.sin((i0 + i) * 0.2)), i * 2); return b; };

(async () => {
  try {
    assert.strictEqual(pickSource('1\talsa_output.platform.monitor\tx\n2\talsa_input.usb-mic\tx\n'), 'alsa_input.usb-mic');
    assert.strictEqual(pickSource('1\tbluez_sink.AA.monitor\tx\n'), null);

    let busy = false;
    const got2 = [];
    const execFileFn = () => {}; // never answers, so nothing spawns
    const m2 = createMic({ onUtterance: (w) => got2.push(w), isBusy: () => busy, execFileFn });
    m2.setWanted({ speech: true, music: false });
    const f2 = (amp, n) => { for (let k = 0; k < n; k++) m2._test.frame(frame(amp, k * 480)); };
    f2(0.001, 50); f2(0.3, 40); f2(0.001, 40);
    assert.strictEqual(got2.length, 1, 'one utterance');
    assert.strictEqual(got2[0].toString('ascii', 0, 4), 'RIFF');
    assert.ok(got2[0].length > 44 + 40 * 960, 'holds the speech');
    busy = true; f2(0.3, 40); f2(0.001, 40); busy = false;
    assert.strictEqual(got2.length, 1, 'ignored while the face talks');
    f2(0.3, 3); f2(0.001, 40);
    assert.strictEqual(got2.length, 1, 'a click is not speech');

    masterVolume.set(0.5);
    assert.strictEqual(masterVolume.paplayArg(), '--volume=32768');
    masterVolume.set(7); assert.strictEqual(masterVolume.get(), 1);

    // The face answers what it heard.
    let t = 1e6;
    const state = { effectOptions: { talking_face: { voice: 'phone' } } };
    const ft = createFaceTalk({ state, broadcast: () => {}, now: () => t, ai: { hear: async () => ({ heard: 'tell me a joke', say: 'Why did the LED blush? It saw the RGB.', laugh: 'after' }) } });
    await ft.hear(Buffer.alloc(100));
    assert.deepStrictEqual(state.faceTalk.log.map((l) => l.who), ['you', 'face']);
    assert.strictEqual(state.faceTalk.log[0].text, 'tell me a joke');
    assert.ok(ft.busy(), 'busy while speaking');
    const ft2 = createFaceTalk({ state: { effectOptions: {} }, broadcast: () => {}, now: () => t, ai: { hear: async () => ({ heard: '' }) } });
    await ft2.hear(Buffer.alloc(100));
    assert.ok(!ft2.busy(), 'noise: no reply');
    console.log('mic ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
