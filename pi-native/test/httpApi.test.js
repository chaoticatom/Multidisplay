// /api/notify needs the token; backup/restore/uploads go through the
// PIN check; restore refuses anything that isn't a settings backup.
'use strict';
const assert = require('assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const store = require('../src/settingsStore');
store._setStorePath(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'api-')), 'settings.json'));
const httpApi = require('../src/httpApi');

const fake = { state: {}, broadcasts: 0, _broadcast() { this.broadcasts++; }, _stateMsg() { return {}; } };
let pinOk = true;
const server = http.createServer((req, res) => { if (!httpApi.handle(fake, req, res, () => (pinOk ? 0 : 401))) res.writeHead(404).end(); });

function call(method, p, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path: p }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d, type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const exit = process.exit;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const check = async (name, fn) => { try { await fn(); console.log('  ok -', name); } catch (e) { console.error('  FAIL -', name, e.message); process.exitCode = 1; } };
  await check('notify refuses a wrong token', async () => { assert.strictEqual((await call('GET', '/api/notify?token=nope&text=hi')).status, 401); });
  await check('notify with the token sets a banner', async () => {
    const t = httpApi.notifyToken();
    const r = await call('GET', `/api/notify?token=${t}&text=Door&secs=5&color=ff0000`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(fake.state.notice.text, 'Door'); assert.strictEqual(fake.state.notice.color, '#ff0000');
    assert.ok(fake.state.notice.until > Date.now());
  });
  await check('notify accepts a JSON POST', async () => {
    const r = await call('POST', '/api/notify', JSON.stringify({ token: httpApi.notifyToken(), text: 'Post' }));
    assert.strictEqual(r.status, 200); assert.strictEqual(fake.state.notice.text, 'Post');
  });
  await check('backup needs the PIN', async () => { pinOk = false; assert.strictEqual((await call('GET', '/api/backup')).status, 401); pinOk = true; });
  await check('backup downloads the settings file', async () => {
    store.writeSection('prefs', { favourites: ['aurora'] });
    const r = await call('GET', '/api/backup');
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(JSON.parse(r.body).sections.prefs, { favourites: ['aurora'] });
  });
  await check('restore refuses a file that is not a backup', async () => { assert.strictEqual((await call('POST', '/api/restore', '{"hello":1}')).status, 400); });
  await check('restore writes the backup and restarts', async () => {
    let code = null; process.exit = (c) => { code = c; };
    const r = await call('POST', '/api/restore', JSON.stringify({ version: 1, sections: { prefs: { favourites: ['wave'] } } }));
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(JSON.parse(store.readSectionJson('prefs')), { favourites: ['wave'] });
    await new Promise((res) => setTimeout(res, 900));
    process.exit = exit;
    assert.strictEqual(code, 75);
  });
  await check('manifest is served', async () => { const r = await call('GET', '/manifest.json'); assert.strictEqual(JSON.parse(r.body).short_name, 'Multidisplay'); });
  server.close();
})();
