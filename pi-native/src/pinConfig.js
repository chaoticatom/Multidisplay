// Optional control-page PIN. Unset by default (the page is open to anyone
// on the local network, as before). When set, a browser must send the PIN
// before it receives state or can send commands (see wsServer.js), and
// uploads must carry it in an X-Control-Pin header. Stored as a salted
// SHA-256 hash, never the PIN itself.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { atomicWriteJson } = require('./atomicWrite');

const CONFIG_PATH = path.join(__dirname, '..', 'security-config.json');

function hash(pin, salt) {
  return crypto.createHash('sha256').update(salt + ':' + pin).digest('hex');
}

function load(file = CONFIG_PATH) {
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    return c && typeof c.pinHash === 'string' && typeof c.salt === 'string' ? c : {};
  } catch (e) {
    return {};
  }
}

function isPinSet(cfg) { return !!(cfg && cfg.pinHash); }

// Constant-time comparison, so response timing doesn't leak how much of a
// guess was right.
function verifyPin(cfg, pin) {
  if (!isPinSet(cfg)) return true;
  if (typeof pin !== 'string' || !pin) return false;
  const a = Buffer.from(hash(pin, cfg.salt), 'hex'), b = Buffer.from(cfg.pinHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Empty/falsy pin clears it. Returns the new config.
function setPin(pin, file = CONFIG_PATH) {
  let cfg = {};
  if (pin) {
    const p = String(pin);
    if (!/^[0-9A-Za-z]{4,32}$/.test(p)) throw new Error('PIN must be 4-32 letters or digits');
    const salt = crypto.randomBytes(16).toString('hex');
    cfg = { salt, pinHash: hash(p, salt) };
  }
  atomicWriteJson(file, cfg);
  return cfg;
}

module.exports = { load, isPinSet, verifyPin, setPin, CONFIG_PATH };
