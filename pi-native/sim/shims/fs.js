// Browser shim for Node's 'fs', used only by the handful of modules the sim
// bundle pulls in for free (easterEgg's .bin assets, the *Config.js
// persistence modules). Config persistence is backed by localStorage,
// keyed by the path string the real module already builds with
// path.join(__dirname, '..', 'whatever.json') - the shimmed path.join
// below returns that string unchanged, so it doubles as a stable
// localStorage key.
//
// easterEgg.js/easterEggWall.js's img1.bin/img2.bin are a special case -
// they're read once at require() time via fs.readFileSync with no prior
// writeFileSync to seed localStorage from, so they're bundled in directly
// via esbuild's binary loader (see build.js) and matched here by filename.
const img1B64 = require('../../src/effects/easterEgg/img1.bin');
const img2B64 = require('../../src/effects/easterEgg/img2.bin');
function b64ToBytes(b64) {
  const bin = window.atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
let img1Bin = null, img2Bin = null;

function readFileSync(p, encoding) {
  if (/img1\.bin$/.test(p)) return img1Bin || (img1Bin = b64ToBytes(img1B64));
  if (/img2\.bin$/.test(p)) return img2Bin || (img2Bin = b64ToBytes(img2B64));
  const v = window.localStorage.getItem('simfs:' + p);
  if (v === null) { const e = new Error('ENOENT: ' + p); e.code = 'ENOENT'; throw e; }
  if (encoding) return v;
  return new Uint8Array(JSON.parse(v));
}
function writeFileSync(p, data) {
  window.localStorage.setItem('simfs:' + p, typeof data === 'string' ? data : JSON.stringify(Array.from(data)));
}
function existsSync(p) {
  return window.localStorage.getItem('simfs:' + p) !== null;
}
function unlinkSync(p) {
  window.localStorage.removeItem('simfs:' + p);
}
module.exports = { readFileSync, writeFileSync, existsSync, unlinkSync };
