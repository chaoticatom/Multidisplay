// Update from the app: check GitHub for a newer version and pull it,
// instead of running git by hand on the Pi.
//   check()  -> { behind, latest, current, checkedAt, error }
//               `git fetch origin main`, then how many commits HEAD is behind.
//   update() -> { ok, log }
//               the same steps as the manual update: stash local changes
//               (settings files edited on the Pi), pull, put them back.
//               The caller restarts the service afterwards.
// git runs in the repository that holds this app. `run` is injectable for
// the tests.
'use strict';

const path = require('path');
const { execFile } = require('child_process');

const REPO = path.join(__dirname, '..', '..');

function defaultRun(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: REPO, timeout: 120000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: String(stdout || '') + String(stderr || '') });
    });
  });
}

function createUpdater(run = defaultRun) {
  const status = { behind: 0, latest: '', current: '', checkedAt: 0, error: '', updating: false };

  async function check() {
    const fetch = await run('git', ['fetch', '--quiet', 'origin', 'main']);
    status.checkedAt = Date.now();
    if (fetch.code !== 0) { status.error = 'Could not reach GitHub: ' + fetch.out.trim().split('\n').pop(); return { ...status }; }
    const count = await run('git', ['rev-list', '--count', 'HEAD..origin/main']);
    const latest = await run('git', ['log', '-1', '--format=%s', 'origin/main']);
    const current = await run('git', ['log', '-1', '--format=%s', 'HEAD']);
    status.behind = parseInt(count.out, 10) || 0;
    status.latest = latest.out.trim().slice(0, 120);
    status.current = current.out.trim().slice(0, 120);
    status.error = '';
    return { ...status };
  }

  async function update() {
    if (status.updating) return { ok: false, log: 'An update is already running.' };
    status.updating = true;
    const log = [];
    try {
      const step = async (args) => { const r = await run('git', args); log.push('$ git ' + args.join(' '), r.out.trim()); return r; };
      const dirty = (await run('git', ['status', '--porcelain', '--untracked-files=no'])).out.trim() !== '';
      if (dirty) await step(['stash']);
      const pull = await step(['pull', '--ff-only', 'origin', 'main']);
      if (dirty) {
        const pop = await step(['stash', 'pop']);
        if (pop.code !== 0) log.push('Your local changes are kept in `git stash` - they clashed with the update.');
      }
      if (pull.code !== 0) return { ok: false, log: log.join('\n') };
      status.behind = 0;
      return { ok: true, log: log.join('\n') };
    } finally {
      status.updating = false;
    }
  }

  return { check, update, status };
}

module.exports = { createUpdater, REPO };
