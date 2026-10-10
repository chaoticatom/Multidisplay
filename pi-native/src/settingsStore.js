// One settings.json with a section per feature; each config module keeps its
// own validation and defaults. A missing section is imported once from its old
// file (left as a backup). Writes are atomic; an unreadable file is moved to
// settings.json.corrupt-<time>. Re-read on every access, never cached, because
// the main thread and render worker have separate module instances.
'use strict';
const fs = require('fs');
const path = require('path');
const { atomicWriteJson } = require('./atomicWrite');

const STORE_VERSION = 1;
let storePath_ = path.join(__dirname, '..', 'settings.json');

function readStore() {
  let raw;
  try { raw = fs.readFileSync(storePath_, 'utf8'); } catch (e) { return { version: STORE_VERSION, sections: {} }; }
  try {
    const s = JSON.parse(raw);
    if (s && typeof s === 'object' && s.sections && typeof s.sections === 'object') return s;
    throw new Error('not a settings store');
  } catch (e) {
    const aside = `${storePath_}.corrupt-${Date.now()}`;
    try { fs.renameSync(storePath_, aside); } catch (e2) { /* nothing to move */ }
    console.warn(`[settings] ${storePath_} was unreadable (${e.message}) - moved to ${aside}, starting fresh`);
    return { version: STORE_VERSION, sections: {} };
  }
}

// Returns the section's value serialised as JSON text (so each config
// module's existing parse-and-validate path runs unchanged), importing it
// from `legacyPath` on first use. Throws if there's nothing stored yet -
// the modules' existing catch blocks turn that into their defaults.
function readSectionJson(name, legacyPath) {
  const store = readStore();
  if (Object.prototype.hasOwnProperty.call(store.sections, name)) return JSON.stringify(store.sections[name]);
  const legacy = legacyPath && fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null;
  if (legacy === null) throw new Error(`no ${name} settings yet`);
  const value = JSON.parse(legacy); // a corrupt legacy file throws -> defaults, as before
  store.sections[name] = value;
  store.version = STORE_VERSION;
  atomicWriteJson(storePath_, store);
  return legacy;
}

function writeSection(name, value) {
  const store = readStore();
  store.sections[name] = value;
  store.version = STORE_VERSION;
  atomicWriteJson(storePath_, store);
}

// Backup/restore (see httpApi.js).
function storePath() { return storePath_; }
function replaceStore(data) { atomicWriteJson(storePath_, { version: STORE_VERSION, ...data }); }

// Tests only: point the store somewhere temporary.
function _setStorePath(p) { storePath_ = p; }

module.exports = { readSectionJson, writeSection, storePath, replaceStore, _setStorePath };
