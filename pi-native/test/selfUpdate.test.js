// Setup -> Software update (src/selfUpdate.js), with git faked.
'use strict';
const assert = require('assert');
const { createUpdater } = require('../src/selfUpdate');
console.log('selfUpdate');

function fakeGit(replies) {
  const calls = [];
  const run = async (cmd, args) => { calls.push(args.join(' ')); const k = Object.keys(replies).find((p) => args.join(' ').startsWith(p)); return k ? replies[k] : { code: 0, out: '' }; };
  return { run, calls };
}

(async () => {
  try {
    let g = fakeGit({ 'rev-list': { code: 0, out: '3\n' }, 'log -1 --format=%s origin/main': { code: 0, out: 'New spectrum\n' } });
    let u = createUpdater(g.run);
    let s = await u.check();
    assert.strictEqual(s.behind, 3);
    assert.strictEqual(s.latest, 'New spectrum');
    console.log('  ok - reports how many updates are waiting');

    g = fakeGit({ fetch: { code: 128, out: 'fatal: unable to access github.com' } });
    s = await createUpdater(g.run).check();
    assert.ok(/Could not reach GitHub/.test(s.error));
    console.log('  ok - says when GitHub cannot be reached');

    // Local edits on the Pi are stashed around the pull, as in the manual steps.
    g = fakeGit({ 'status --porcelain': { code: 0, out: ' M pi-native/settings.json\n' } });
    let r = await createUpdater(g.run).update();
    assert.ok(r.ok);
    assert.deepStrictEqual(g.calls.filter((c) => !c.startsWith('status')), ['stash', 'pull --ff-only origin main', 'stash pop']);
    console.log('  ok - stashes local changes, pulls, restores them');

    g = fakeGit({ pull: { code: 1, out: 'fatal: Not possible to fast-forward' } });
    r = await createUpdater(g.run).update();
    assert.ok(!r.ok);
    assert.ok(/fast-forward/.test(r.log));
    console.log('  ok - a failed pull is reported, not restarted');
  } catch (e) { console.error('  FAIL -', e.message); process.exitCode = 1; }
})();
