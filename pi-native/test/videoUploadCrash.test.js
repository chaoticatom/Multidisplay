// Regression test for a real crash: "loading a video file pauses for a
// couple of seconds then reverts to the default effect". Root cause was
// wsServer.js's _handleUpload() calling res.end() a second time when the
// underlying request emitted a late 'error' (mobile browsers commonly tear
// down the TCP connection slightly AFTER fetch() has already resolved)
// AFTER the upload had already finished and responded successfully -
// Node's "write after end" throws, and with no process-wide
// uncaughtException handler that crashed the whole server. systemd's
// Restart=on-failure then restarted it a few seconds later with fresh
// in-memory state (state.effect isn't persisted to disk), which is exactly
// the "pause, then back to the default effect" symptom.
//
// Uses a real PassThrough stream as `req` (so req.pipe(out) behaves like a
// real HTTP request) rather than going through fetch()/a real socket,
// since reproducing a race this specific over a real TCP connection would
// be flaky - this drives the exact sequence directly instead.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
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

function makeFakeRes() {
  const res = {
    headersSent: false,
    endCalls: 0,
    writeHead(code) { this.headersSent = true; this.statusCode = code; return this; },
    end(body) { this.endCalls++; this.body = body; },
  };
  return res;
}

async function run() {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const state = { effect: 'video', brightness: 1, speed: 1, effectOptions: {} };
  const config = { size: 64, mode: 'cube' };
  rmUploadDir();
  const server = new WsServer(port, state, config, () => {});

  await test('a late req "error" event AFTER a successful upload does not throw or double-respond', async () => {
    const req = new PassThrough();
    req.url = '/api/uploadVideo?name=clip.mp4';
    const res = makeFakeRes();

    server._handleUpload(req, res);
    req.end(Buffer.from('fake video bytes'));

    // Let the write stream's 'finish' event (and the success response it
    // triggers) actually fire before simulating the late abort.
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(res.endCalls, 1, 'expected exactly one response after the upload completed');
    assert.strictEqual(JSON.parse(res.body).ok, true);

    // This is the exact scenario that used to crash the process: emitting
    // 'error' on req after it's already been fully consumed and responded
    // to. If _handleUpload's fail() path doesn't guard against this,
    // res.end() throws "write after end" here, synchronously, with
    // nothing to catch it in a real server (an EventEmitter 'error' handler
    // throwing is normally an uncaught exception).
    assert.doesNotThrow(() => req.emit('error', new Error('simulated late connection abort')));

    // Must NOT have sent a second response.
    assert.strictEqual(res.endCalls, 1, 'expected the late error to be a no-op, not a second response');
  });

  await test('a genuine mid-upload error still responds with a failure, exactly once', async () => {
    const req = new PassThrough();
    req.url = '/api/uploadVideo?name=clip2.mp4';
    const res = makeFakeRes();

    server._handleUpload(req, res);
    req.emit('error', new Error('connection reset'));
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(res.endCalls, 1);
    assert.strictEqual(JSON.parse(res.body).ok, false);

    // A subsequent 'end' on the same (now-failed) request must not send a
    // second response either.
    req.end();
    await new Promise((r) => setTimeout(r, 20));
    assert.strictEqual(res.endCalls, 1, 'expected no second response after the request later ends');
  });

  await test('a filesystem permission error (e.g. EACCES on mkdir) responds cleanly instead of leaving the request hanging', async () => {
    // Real deployment hit exactly this: the service user couldn't create
    // UPLOAD_DIR (EACCES). Before this was guarded, the throw happened
    // before any response was sent, so the browser's fetch() just hung
    // until it timed out client-side with a bare "Failed to fetch" - no
    // usable error message anywhere. Monkeypatch fs.mkdirSync to reproduce
    // that failure deterministically.
    const orig = fs.mkdirSync;
    fs.mkdirSync = () => { const e = new Error('permission denied'); e.code = 'EACCES'; throw e; };
    try {
      const req = new PassThrough();
      req.url = '/api/uploadVideo?name=clip3.mp4';
      const res = makeFakeRes();
      server._handleUpload(req, res);
      req.end(Buffer.from('irrelevant'));
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(res.endCalls, 1, 'expected an immediate response, not a hang');
      const body = JSON.parse(res.body);
      assert.strictEqual(body.ok, false);
      assert.ok(/EACCES/.test(body.error), 'expected the error code to be surfaced: ' + body.error);
    } finally {
      fs.mkdirSync = orig;
    }
  });

  server.close();
  rmUploadDir();

  if (process.exitCode) {
    console.log('\nFAILED');
  } else {
    console.log('\nAll videoUploadCrash tests passed');
  }
  process.exit(process.exitCode || 0);
}

run();
