// Builds the browser-native simulator bundle: the SAME effect-rendering
// code that runs on the Pi (src/core.js + src/effects/index.js), bundled
// to run standalone in a browser tab with no server behind it. See
// sim/README.md for the full explanation of why this exists and what it
// can/can't do compared to the real Pi.
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.join(__dirname, 'entry.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'PiEngine',
  outfile: path.join(__dirname, '..', 'public', 'sim-engine.js'),
  inject: [path.join(__dirname, 'shims', 'bufferGlobal.js')],
  // 'base64' (not esbuild's 'binary' loader) for broad browser
  // compatibility - 'binary' emits Uint8Array.fromBase64(), which is too
  // new to rely on for a "just open it in any desktop browser" simulator;
  // shims/fs.js decodes the base64 string itself via atob().
  loader: { '.bin': 'base64' },
  define: {
    // Effects read the odd process.env.*_DEBUG/API_KEY flag (never set in
    // sim mode, same as an unconfigured Pi) - avoid a ReferenceError for
    // bare `process` in a browser with no Node globals.
    'process.env': '{}',
    // *Config.js modules build their localStorage key via
    // path.join(__dirname, ...) - esbuild's browser/iife output doesn't
    // provide __dirname, and the exact value doesn't matter (shims/path.js
    // just string-joins it), so a constant placeholder is fine.
    '__dirname': '"."',
  },
  alias: {
    fs: path.join(__dirname, 'shims', 'fs.js'),
    path: path.join(__dirname, 'shims', 'path.js'),
    child_process: path.join(__dirname, 'shims', 'child_process.js'),
  },
  logLevel: 'info',
}).catch(() => process.exit(1));
