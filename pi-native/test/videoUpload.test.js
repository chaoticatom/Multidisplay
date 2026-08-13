// Verifies POST /api/uploadVideo (wsServer.js's _handleUpload) - the
// restored "pick a local file" flow for Video Display (see
// effects/video.js's module comment and public/app.js's
// uploadVideoFile()/wireVideoPanel()). Raw-body upload, not multipart -
// the request body IS the file's bytes, with the original filename passed
// via a query param.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const WsServer = require('../src/wsServer');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function test(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log(`  ok - ${name}`),
    (err) => { console.error(`  FAIL - ${name}`); console.error(err); process.exitCode = 1; },
  );
}

function rmUploadDir() {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
}

async function run() {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'video', brightness: 1, speed: 1, effectOptions: {} };
  const config = { size: 64, mode: 'cube' };
  rmUploadDir();
  const server = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));

  await test('uploading a file saves it to disk and returns its path', async () => {
    const bytes = Buffer.from('fake mp4 bytes for a unit test, not a real container');
    const resp = await fetch(`http://127.0.0.1:${port}/api/uploadVideo?name=${encodeURIComponent('my clip.mp4')}`, {
      method: 'POST', body: bytes,
    });
    assert.strictEqual(resp.status, 200);
    const d = await resp.json();
    assert.strictEqual(d.ok, true);
    assert.ok(d.path && fs.existsSync(d.path), 'expected the saved file to exist on disk');
    assert.ok(d.path.endsWith('.mp4'), 'expected the original extension to be preserved: ' + d.path);
    assert.ok(Buffer.compare(fs.readFileSync(d.path), bytes) === 0, 'expected saved bytes to match the upload exactly');
  });

  await test('a second upload deletes the first (only one file kept on disk)', async () => {
    const first = await (await fetch(`http://127.0.0.1:${port}/api/uploadVideo?name=first.mp4`, { method: 'POST', body: Buffer.from('one') })).json();
    assert.ok(fs.existsSync(first.path));
    const second = await (await fetch(`http://127.0.0.1:${port}/api/uploadVideo?name=second.mp4`, { method: 'POST', body: Buffer.from('two') })).json();
    assert.ok(fs.existsSync(second.path));
    assert.ok(!fs.existsSync(first.path), 'expected the first upload to have been removed once the second landed');
    const remaining = fs.readdirSync(UPLOAD_DIR);
    assert.strictEqual(remaining.length, 1, 'expected exactly one file left in the upload dir, got: ' + remaining.join(','));
  });

  await test('a path-traversal filename is sanitized, not honored', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/api/uploadVideo?name=${encodeURIComponent('../../../etc/passwd')}`, {
      method: 'POST', body: Buffer.from('x'),
    });
    const d = await resp.json();
    assert.strictEqual(d.ok, true);
    assert.strictEqual(path.dirname(d.path), UPLOAD_DIR, 'expected the saved file to be a direct child of the upload dir (no subdirectories from the traversal attempt), got: ' + d.path);
    assert.ok(fs.existsSync(d.path));
  });

  await test('GET on the upload route is rejected, not treated as a static file request', async () => {
    const resp = await fetch(`http://127.0.0.1:${port}/api/uploadVideo`);
    assert.strictEqual(resp.status, 404);
  });

  server.close();
  rmUploadDir();

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoUpload tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
