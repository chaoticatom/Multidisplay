// Weekly automatic backup of the settings (settings.json: scenes, timers,
// day plan, celebrations, favourites...). A dated copy goes into a
// "backups" folder next to settings.json; the newest 8 are kept. Checked
// at start-up and hourly; a backup is made when the last one is a week old.
'use strict';
const fs = require('fs');
const path = require('path');
const settingsStore = require('./settingsStore');

const KEEP = 8, WEEK_MS = 7 * 86400000;
const dir = () => path.join(path.dirname(settingsStore.storePath()), 'backups');

function list() {
  try { return fs.readdirSync(dir()).filter((f) => /^settings-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (e) { return []; }
}

// Status for the page: { lastAt (ms) | null, count, error }.
let lastError = '';
function status() {
  const files = list(), last = files[files.length - 1];
  let lastAt = null;
  try { if (last) lastAt = fs.statSync(path.join(dir(), last)).mtimeMs; } catch (e) { /* gone */ }
  return { lastAt, count: files.length, error: lastError };
}

function backupNow(now = new Date()) {
  try {
    const src = settingsStore.storePath();
    if (!fs.existsSync(src)) { lastError = ''; return status(); } // nothing saved yet
    fs.mkdirSync(dir(), { recursive: true });
    const stamp = now.toISOString().slice(0, 16).replace(':', '-');
    const tmp = path.join(dir(), '.tmp-' + process.pid), out = path.join(dir(), `settings-${stamp}.json`);
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, out);
    const files = list();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(dir(), f));
    lastError = '';
  } catch (e) {
    lastError = e.message;
    console.warn('[backup] automatic backup failed:', e.message);
  }
  return status();
}

function due(now = Date.now()) { const s = status(); return !s.lastAt || now - s.lastAt >= WEEK_MS; }
function maybeBackup() { return due() ? backupNow() : status(); }

module.exports = { backupNow, maybeBackup, status, due, KEEP, _dir: dir };
