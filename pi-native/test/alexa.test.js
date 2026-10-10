'use strict';
// Alexa via Hue bridge emulation (src/alexa.js): discovery answers, the
// Echo's pairing, the light list, and on/off/brightness doing the right thing.
const assert = require('assert');
const { EventEmitter } = require('events');
const { createAlexa, lightId } = require('../src/alexa');

function call(alexa, method, url, body) {
  return new Promise((resolve) => {
    const req = new EventEmitter(); req.method = method; req.url = url; req.destroy = () => {};
    const res = { writeHead(code, h) { this.code = code; this.type = h['Content-Type']; }, end(b) { resolve({ code: this.code, type: this.type, body: this.type === 'application/json' ? JSON.parse(b) : b }); } };
    alexa._test.handle(req, res);
    setImmediate(() => { if (body) req.emit('data', JSON.stringify(body)); req.emit('end'); });
  });
}

(async () => {
  try {
    const state = { effect: 'plasma', blank: false, brightness: 0.75, prefs: { volume: 0.5, favourites: ['fireworks'] }, scenes: [{ name: 'Party' }] };
    const ran = [];
    const alexa = createAlexa({ state, names: () => ({ plasma: 'Plasma', fireworks: 'Fireworks 🎆' }), run: (m) => ran.push(m), ip: () => '192.168.0.185', log() {} });

    const d = await call(alexa, 'GET', '/description.xml');
    assert.ok(/BSB002/.test(d.body) && /192\.168\.0\.185:80/.test(d.body));
    assert.deepStrictEqual((await call(alexa, 'POST', '/api', { devicetype: 'Echo' })).body, [{ success: { username: 'multidisplay' } }]);

    const lights = (await call(alexa, 'GET', '/api/multidisplay/lights')).body;
    const names = Object.values(lights).map((l) => l.name);
    assert.deepStrictEqual(names.sort(), ['Display', 'Fireworks', 'Party', 'Volume']);
    assert.strictEqual(lights[lightId('display')].state.bri, 127, 'brightness 0.75 of 1.5 = half');

    await call(alexa, 'PUT', `/api/x/lights/${lightId('display')}/state`, { on: false });
    assert.deepStrictEqual(ran.pop(), { cmd: 'clearAll' });
    const r = await call(alexa, 'PUT', `/api/x/lights/${lightId('display')}/state`, { bri: 254 });
    assert.deepStrictEqual(ran.pop(), { cmd: 'setBrightness', value: 1.5 });
    assert.ok(r.body[0].success, 'Hue-style success reply');
    await call(alexa, 'PUT', `/api/x/lights/${lightId('volume')}/state`, { on: true, bri: 76 });
    assert.strictEqual(ran.pop().value.toFixed(2), '0.30');
    await call(alexa, 'PUT', `/api/x/lights/${lightId('fx:fireworks')}/state`, { on: true });
    assert.deepStrictEqual(ran.pop(), { cmd: 'setEffect', effect: 'fireworks' });
    await call(alexa, 'PUT', `/api/x/lights/${lightId('scene:Party')}/state`, { on: true });
    assert.deepStrictEqual(ran.pop(), { cmd: 'applyScene', name: 'Party' });

    // SSDP: an Echo's search gets our address; other searches are ignored.
    const sent = [];
    const a2 = createAlexa({ state, names: () => ({}), run() {}, ip: () => '10.0.0.5', log() {},
      createSocket: () => Object.assign(new EventEmitter(), { bind(p, cb) { cb(); }, addMembership() {}, send(b) { sent.push(b.toString()); }, close() {} }),
      createServer: (h) => Object.assign(new EventEmitter(), { listen() {}, close() {} }) });
    a2.start();
    a2._test.onSearch(Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: urn:schemas-upnp-org:device:basic:1\r\n\r\n'), { port: 5000, address: '10.0.0.9' });
    assert.ok(sent.length >= 1 && sent.every((s) => /LOCATION: http:\/\/10\.0\.0\.5:80\/description\.xml/.test(s) && /hue-bridgeid/.test(s)));
    sent.length = 0;
    a2._test.onSearch(Buffer.from('M-SEARCH * HTTP/1.1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n'), { port: 5000, address: '10.0.0.9' });
    assert.strictEqual(sent.length, 0);
    a2.stop();
    console.log('alexa ok');
  } catch (e) { console.error(e); process.exitCode = 1; }
})();
