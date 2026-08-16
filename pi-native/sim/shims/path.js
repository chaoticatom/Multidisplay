// Minimal browser shim for Node's 'path' - just enough for the *Config.js
// modules' `path.join(__dirname, '..', 'foo.json')` calls to produce a
// stable, unique string to use as a localStorage key (see shims/fs.js).
// __dirname itself is handled by esbuild's define at build time.
function join(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}
module.exports = { join };
