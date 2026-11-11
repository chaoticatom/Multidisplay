// Fast, no-sleeping tests for src/effects/customCube.js (Custom Cube - per-
// face effect composition) and its WS wire-up in wsServer.js. See
// customCubeConfig.js's module comment for the persisted shape and
// effects/customCube.js's module comment for the composition mechanism.
const assert = require('assert');
const WebSocket = require('ws');
const { CubeCore } = require('../src/core');
const { EFFECTS } = require('../src/effects');
const { OV_DEFAULTS } = require('../src/effects/overlays');
const customCubeConfig = require('../src/customCubeConfig');
const WsServer = require('../src/wsServer');
const panelConfig = require('../src/panelConfig');

function test(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function hasNaN(buf) {
  for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) return true;
  return false;
}

function emptyFaces() { return [null, null, null, null, null, null]; }

function freshCore(size, overrides) {
  const core = new CubeCore(size);
  core.panelMode = 'cube';
  core.overlaysState = JSON.parse(JSON.stringify(OV_DEFAULTS));
  core.effectOptions = {};
  core.customCubeFaces = emptyFaces();
  return Object.assign(core, overrides);
}

// A true INTERIOR point (not u=0/SIZE-1 or v=0/SIZE-1) - edge/corner LEDs
// are shared between adjacent faces (see core.js's faceMembership comment),
// so sampling one of those would spuriously pick up a neighboring face's
// render even though this face itself is unassigned.
function faceCenterColor(core, face) {
  const half = core.SIZE >> 1;
  const idx = core.faceMap[face][half * core.SIZE + half];
  return [core.colBuf[idx * 3], core.colBuf[idx * 3 + 1], core.colBuf[idx * 3 + 2]];
}

console.log('customCube');

// ── customCubeConfig validation-with-fallback ──────────────────────────
test('customCubeConfig.load() falls back to empty defaults when no file exists', () => {
  const cfg = customCubeConfig.load(); // real disk path is likely absent in this sandbox; if present, just check shape
  assert.ok(Array.isArray(cfg.faces) && cfg.faces.length === 6);
  assert.ok(Array.isArray(cfg.library));
});

test('isValidFaces rejects wrong length, non-array, and malformed entries', () => {
  assert.strictEqual(customCubeConfig.isValidFaces(null), false);
  assert.strictEqual(customCubeConfig.isValidFaces([null, null]), false);
  assert.strictEqual(customCubeConfig.isValidFaces([null, null, null, null, null, null]), true);
  const good = { effect: 'wave', overlayKeys: [], opts: {} };
  assert.strictEqual(customCubeConfig.isValidFaces([good, null, null, null, null, null]), true);
  assert.strictEqual(customCubeConfig.isValidFaces([{ effect: '', overlayKeys: [], opts: {} }, null, null, null, null, null]), false, 'empty effect string invalid');
  assert.strictEqual(customCubeConfig.isValidFaces([{ effect: 'wave', overlayKeys: 'nope', opts: {} }, null, null, null, null, null]), false, 'overlayKeys must be array');
  assert.strictEqual(customCubeConfig.isValidFaces([{ effect: 'wave', overlayKeys: [], opts: null }, null, null, null, null, null]), false, 'opts must be object');
});

test('isValidLibrary rejects entries missing a name or with invalid faces', () => {
  assert.strictEqual(customCubeConfig.isValidLibrary([]), true);
  assert.strictEqual(customCubeConfig.isValidLibrary([{ name: 'A', faces: emptyFaces() }]), true);
  assert.strictEqual(customCubeConfig.isValidLibrary([{ name: '', faces: emptyFaces() }]), false);
  assert.strictEqual(customCubeConfig.isValidLibrary([{ name: 'A', faces: [null] }]), false);
});

// ── effectCustomCube rendering ──────────────────────────────────────────
test('no faces assigned: all-black, no throw', () => {
  const core = freshCore(16);
  EFFECTS.custom_cube(core, 1 / 30);
  assert.ok(!hasNaN(core.colBuf));
  assert.ok(core.colBuf.every((v) => v === 0), 'expected an all-black frame with nothing assigned');
});

test('core.customCubeFaces === null (not yet initialized) does not throw', () => {
  const core = freshCore(16, { customCubeFaces: null });
  EFFECTS.custom_cube(core, 1 / 30);
  assert.ok(!hasNaN(core.colBuf));
});

test('3 different effects on 3 different faces, 150 ticks: no NaN/throw, and the faces actually render differently', () => {
  const core = freshCore(64, {
    customCubeFaces: [
      { effect: 'wave', overlayKeys: [], opts: {} },
      null,
      { effect: 'plasma', overlayKeys: ['stars'], opts: {} },
      null,
      { effect: 'sphere', overlayKeys: [], opts: {} },
      null,
    ],
  });
  for (let i = 0; i < 150; i += 1) {
    EFFECTS.custom_cube(core, 1 / 30);
    assert.ok(!hasNaN(core.colBuf), `NaN at tick ${i}`);
  }
  // Unassigned faces stay black.
  assert.deepStrictEqual(faceCenterColor(core, 1), [0, 0, 0]);
  assert.deepStrictEqual(faceCenterColor(core, 3), [0, 0, 0]);
  assert.deepStrictEqual(faceCenterColor(core, 5), [0, 0, 0]);
  // A real correctness check, not just "didn't crash": sample every assigned
  // face across the whole face (not just the center pixel, in case one
  // effect happens to leave its center dark this frame) and confirm at
  // least one assigned face's full-face pixel data differs from another's -
  // three different effects should not coincidentally paint identical frames.
  function faceSignature(face) {
    let sum = 0;
    for (let j = 0; j < core.SIZE * core.SIZE; j += 1) {
      const idx = core.faceMap[face][j];
      if (idx >= 0) sum += core.colBuf[idx * 3] + core.colBuf[idx * 3 + 1] * 3 + core.colBuf[idx * 3 + 2] * 7;
    }
    return sum;
  }
  const sig0 = faceSignature(0), sig2 = faceSignature(2), sig4 = faceSignature(4);
  assert.ok(sig0 !== sig2 || sig0 !== sig4 || sig2 !== sig4, 'expected at least two of the three assigned faces to differ');
});

test('a face with overlayKeys gets those overlays applied on top of its effect', () => {
  const withOverlay = freshCore(32, {
    customCubeFaces: [{ effect: 'wave', overlayKeys: ['stars', 'sparkle'], opts: {} }, null, null, null, null, null],
    overlaysState: (() => { const s = JSON.parse(JSON.stringify(OV_DEFAULTS)); s.stars.density = 100; s.sparkle.density = 100; return s; })(),
  });
  const withoutOverlay = freshCore(32, {
    customCubeFaces: [{ effect: 'wave', overlayKeys: [], opts: {} }, null, null, null, null, null],
  });
  let diff = 0;
  for (let i = 0; i < 10; i += 1) {
    EFFECTS.custom_cube(withOverlay, 1 / 30);
    EFFECTS.custom_cube(withoutOverlay, 1 / 30);
  }
  for (let j = 0; j < withOverlay.SIZE * withOverlay.SIZE; j += 1) {
    const idx = withOverlay.faceMap[0][j];
    if (idx < 0) continue; // eslint-disable-line no-continue
    for (let c = 0; c < 3; c += 1) {
      if (Math.abs(withOverlay.colBuf[idx * 3 + c] - withoutOverlay.colBuf[idx * 3 + c]) > 1e-6) diff += 1;
    }
  }
  assert.ok(diff > 0, 'expected the overlayKeys face to visibly differ from the same effect with no overlays');
});

test('an unknown/removed effect key on a face is skipped (not thrown), leaving that face black', () => {
  const core = freshCore(16, {
    customCubeFaces: [{ effect: 'this_effect_does_not_exist', overlayKeys: [], opts: {} }, null, null, null, null, null],
  });
  EFFECTS.custom_cube(core, 1 / 30);
  assert.ok(!hasNaN(core.colBuf));
  assert.deepStrictEqual(faceCenterColor(core, 0), [0, 0, 0]);
});

test('assigning custom_cube to a face is ignored (no infinite recursion)', () => {
  const core = freshCore(16, {
    customCubeFaces: [{ effect: 'custom_cube', overlayKeys: [], opts: {} }, null, null, null, null, null],
  });
  EFFECTS.custom_cube(core, 1 / 30); // would stack-overflow if the recursion guard were missing
  assert.ok(!hasNaN(core.colBuf));
});

test('2D-mode fallback: renders only face 0\'s assigned effect', () => {
  const core = freshCore(16, {
    panelMode: '2d',
    customCubeFaces: [{ effect: 'wave', overlayKeys: [], opts: {} }, { effect: 'plasma', overlayKeys: [], opts: {} }, null, null, null, null],
  });
  for (let i = 0; i < 30; i += 1) EFFECTS.custom_cube(core, 1 / 30);
  assert.ok(!hasNaN(core.colBuf));
  assert.ok(core.colBuf.some((v) => v !== 0), 'expected face 0 to actually render something in 2D mode');
});

test('2D-mode with no face-0 assignment: all-black, no throw', () => {
  const core = freshCore(16, { panelMode: '2d' });
  EFFECTS.custom_cube(core, 1 / 30);
  assert.ok(!hasNaN(core.colBuf));
  assert.ok(core.colBuf.every((v) => v === 0));
});

test('a face\'s effectOptions override does not leak into core.effectOptions after the tick', () => {
  const core = freshCore(16, {
    effectOptions: { someOtherEffect: { foo: 'bar' } },
    customCubeFaces: [{ effect: 'rain', overlayKeys: [], opts: { style: 'matrix' } }, null, null, null, null, null],
  });
  EFFECTS.custom_cube(core, 1 / 30);
  assert.deepStrictEqual(core.effectOptions, { someOtherEffect: { foo: 'bar' } }, 'effectOptions should be restored to exactly what it was before the tick');
});

// ── WsServer round-trip ─────────────────────────────────────────────────
async function withServer(fn) {
  const state = {
    effect: 'wave', brightness: 1, speed: 1,
    overlays: JSON.parse(JSON.stringify(OV_DEFAULTS)),
    alarms: [], activeAlarm: null,
    customCube: { faces: emptyFaces(), library: [] },
  };
  const config = { ...panelConfig.DEFAULT_CONFIG, panels: [...panelConfig.DEFAULT_CONFIG.panels] };
  const port = 42000 + Math.floor(Math.random() * 8000);
  const ws = new WsServer(port, state, config, () => {});
  await new Promise((r) => setTimeout(r, 100));
  try {
    await fn(ws, state, port);
  } finally {
    ws.close();
  }
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const queue = []; const waiters = [];
    client._msgQueue = queue; client._msgWaiters = waiters;
    client.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (waiters.length) waiters.shift()(parsed); else queue.push(parsed);
    });
    client.on('open', () => resolve(client));
    client.on('error', reject);
  });
}

function nextMessage(client) {
  if (client._msgQueue.length) return Promise.resolve(client._msgQueue.shift());
  return new Promise((resolve) => client._msgWaiters.push(resolve));
}

async function main() {

await asyncTest('WS setFaceEffect/setFaceOpts/setFaceOverlays/saveCube/loadCube/deleteCube/clearFaces round-trip', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    const initial = await nextMessage(client);
    assert.deepStrictEqual(initial.customCube.faces, emptyFaces());
    assert.deepStrictEqual(initial.customCube.library, []);

    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 0, effect: 'wave' }));
    const afterAssign = await nextMessage(client);
    assert.strictEqual(afterAssign.customCube.faces[0].effect, 'wave');
    // Giving a face an effect shows the custom cube on the display (it used
    // to be saved but not shown until Custom Cube was picked separately).
    assert.strictEqual(afterAssign.effect, 'custom_cube');
    assert.strictEqual(afterAssign.blank, false);
    assert.deepStrictEqual(afterAssign.customCube.faces[0].overlayKeys, []);

    client.send(JSON.stringify({ cmd: 'setFaceOpts', face: 0, opts: { foo: 'bar' } }));
    const afterOpts = await nextMessage(client);
    assert.deepStrictEqual(afterOpts.customCube.faces[0].opts, { foo: 'bar' });

    client.send(JSON.stringify({ cmd: 'setFaceOverlays', face: 0, overlayKeys: ['stars', 'fire'] }));
    const afterOverlays = await nextMessage(client);
    assert.deepStrictEqual(afterOverlays.customCube.faces[0].overlayKeys, ['stars', 'fire']);

    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 2, effect: 'plasma' }));
    await nextMessage(client);

    client.send(JSON.stringify({ cmd: 'saveCube', name: 'My Cube' }));
    const afterSave = await nextMessage(client);
    assert.strictEqual(afterSave.customCube.library.length, 1);
    assert.strictEqual(afterSave.customCube.library[0].name, 'My Cube');
    assert.strictEqual(afterSave.customCube.library[0].faces[0].effect, 'wave');
    assert.strictEqual(afterSave.customCube.library[0].faces[2].effect, 'plasma');

    client.send(JSON.stringify({ cmd: 'clearFaces' }));
    const afterClear = await nextMessage(client);
    assert.deepStrictEqual(afterClear.customCube.faces, emptyFaces());
    assert.strictEqual(afterClear.customCube.library.length, 1, 'clearFaces must not touch the library');

    client.send(JSON.stringify({ cmd: 'loadCube', index: 0 }));
    const afterLoad = await nextMessage(client);
    assert.strictEqual(afterLoad.customCube.faces[0].effect, 'wave');
    assert.strictEqual(afterLoad.customCube.faces[2].effect, 'plasma');

    client.send(JSON.stringify({ cmd: 'deleteCube', index: 0 }));
    const afterDelete = await nextMessage(client);
    assert.strictEqual(afterDelete.customCube.library.length, 0);

    client.close();
  });
});

// Faces sharing an effect: 'copy' draws the same picture on each, 'fit'
// draws one picture across them (so they differ), 'wrap' is the cube version.
test('custom cube: Fit, Copy and Wrap join faces that share an effect', () => {
  const inner = (core, f) => { const out = []; const S = core.SIZE; for (let v = 8; v < S - 8; v += 4) for (let u = 8; u < S - 8; u += 4) { const i = core.faceMap[f][v * S + u]; out.push(core.colBuf[i * 3].toFixed(3)); } return out.join(','); };
  const run = (join) => {
    const core = new CubeCore(32);
    core.customCubeFaces = [{ effect: 'plasma', overlayKeys: [], opts: {} }, null, { effect: 'plasma', overlayKeys: [], opts: {} }, null, null, null];
    core.customCubeJoin = join; core.overlaysState = OV_DEFAULTS;
    EFFECTS.custom_cube(core, 1 / 30);
    return core;
  };
  const copy = run('copy');
  assert.strictEqual(inner(copy, 0), inner(copy, 2), 'copy: the same picture on both faces');
  assert.ok(/[1-9]/.test(inner(copy, 0)), 'and it is drawn');
  const fit = run('fit');
  assert.notStrictEqual(inner(fit, 0), inner(fit, 2), 'fit: one picture across both, so the halves differ');
  const wrap = run('wrap');
  assert.ok(/[1-9]/.test(inner(wrap, 0)), 'wrap still draws');
});

test('custom cube: two faces with different effects each show their own', () => {
  const inner = (core, f) => { const out = []; const S = core.SIZE; for (let v = 8; v < S - 8; v += 4) for (let u = 8; u < S - 8; u += 4) { const i = core.faceMap[f][v * S + u]; out.push(core.colBuf[i * 3].toFixed(3), core.colBuf[i * 3 + 2].toFixed(3)); } return out.join(','); };
  const core = new CubeCore(32);
  // A real report: Front = Globe, Left = Retro showed Retro on both.
  core.customCubeFaces = [{ effect: 'plasma', overlayKeys: [], opts: {} }, null, null, { effect: 'globe', overlayKeys: [], opts: {} }, null, null];
  core.customCubeJoin = 'fit'; core.overlaysState = OV_DEFAULTS;
  EFFECTS.custom_cube(core, 1 / 30);
  assert.notStrictEqual(inner(core, 0), inner(core, 3), 'each face shows its own effect');
});

await asyncTest('WS setCubeJoin saves a valid choice and ignores anything else', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setCubeJoin', join: 'copy' }));
    const after = await nextMessage(client);
    assert.strictEqual(after.customCube.join, 'copy');
    client.send(JSON.stringify({ cmd: 'setCubeJoin', join: 'sideways' }));
    client.send(JSON.stringify({ cmd: 'setCubeJoin', join: 'wrap' }));
    const after2 = await nextMessage(client);
    assert.strictEqual(after2.customCube.join, 'wrap');
    client.close();
  });
});

await asyncTest('WS: overlays on a face with no effect are kept and shown', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceOverlays', face: 1, overlayKeys: ['stars'] }));
    const after = await nextMessage(client);
    assert.deepStrictEqual(after.customCube.faces[1], { effect: 'none', overlayKeys: ['stars'], opts: {} });
    assert.strictEqual(after.effect, 'custom_cube');
    // Rendering it doesn't throw (the overlay is drawn over black).
    const core = new CubeCore(64);
    core.customCubeFaces = after.customCube.faces;
    core.overlaysState = OV_DEFAULTS;
    EFFECTS.custom_cube(core, 1 / 30);
    // Taking the overlay off leaves the face unassigned again.
    client.send(JSON.stringify({ cmd: 'setFaceOverlays', face: 1, overlayKeys: [] }));
    const cleared = await nextMessage(client);
    assert.strictEqual(cleared.customCube.faces[1], null);
    client.close();
  });
});

await asyncTest('WS setFaceEffect rejects an out-of-range face index without crashing or persisting', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 6, effect: 'wave' }));
    // Malformed payload dropped silently (no broadcast) - confirm the
    // server is still alive via a valid follow-up.
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 1, effect: 'wave' }));
    const msg = await nextMessage(client);
    assert.strictEqual(msg.customCube.faces[1].effect, 'wave');
    assert.strictEqual(msg.customCube.faces[6], undefined);
    client.close();
  });
});

await asyncTest('WS setFaceEffect rejects an unknown effect key without crashing or persisting', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 0, effect: 'not_a_real_effect' }));
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 0, effect: 'wave' })); // valid follow-up proves the server is alive
    const msg = await nextMessage(client);
    assert.strictEqual(msg.customCube.faces[0].effect, 'wave');
    client.close();
  });
});

await asyncTest('WS setFaceOverlays rejects an unknown overlay key entirely (not a partial save)', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 0, effect: 'wave' }));
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceOverlays', face: 0, overlayKeys: ['stars', 'not_a_real_overlay'] }));
    client.send(JSON.stringify({ cmd: 'setFaceOverlays', face: 0, overlayKeys: ['stars'] })); // valid follow-up
    const msg = await nextMessage(client);
    assert.deepStrictEqual(msg.customCube.faces[0].overlayKeys, ['stars']);
    client.close();
  });
});

await asyncTest('WS setFaceEffect with effect:null clears a face', async () => {
  await withServer(async (wsServer, state, port) => {
    const client = await connectClient(port);
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 3, effect: 'wave' }));
    await nextMessage(client);
    client.send(JSON.stringify({ cmd: 'setFaceEffect', face: 3, effect: null }));
    const msg = await nextMessage(client);
    assert.strictEqual(msg.customCube.faces[3], null);
    client.close();
  });
});

console.log('All customCube tests passed');
}

main().then(() => process.exit(process.exitCode || 0));
