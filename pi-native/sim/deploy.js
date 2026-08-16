// Builds the full static GitHub Pages deploy folder for the browser
// simulator: sim-engine.js (via build.js), effects.json (static snapshot
// of EFFECT_NAMES - wsServer.js serves this dynamically on the real Pi,
// there's no server here to do that), and a copy of public/{index.html,
// app.js, three.min.js, sim-loopback.js} into <repo root>/pi-sim/, with
// index.html patched to load the two extra sim-only scripts and set
// window.MULTIDISPLAY_SIM before app.js runs. See sim/README.md.
//
// Run this (`node sim/deploy.js` from pi-native/) any time public/app.js,
// public/index.html, src/core.js, src/tick.js, or anything under
// src/effects/ changes - the deployed pi-sim/ folder is a build output,
// not hand-edited, and needs regenerating + committing like any other
// build artifact this project ships (see build.sh at the repo root for the
// precedent - the original browser app's own asset bundling step).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..'); // repo root
const PI_NATIVE = path.join(__dirname, '..');
const PUBLIC = path.join(PI_NATIVE, 'public');
const DEPLOY = path.join(ROOT, 'pi-sim');

execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });

const { EFFECT_NAMES } = require('../src/effects');
fs.writeFileSync(path.join(PUBLIC, 'effects.json'), JSON.stringify(EFFECT_NAMES));
console.log('[deploy] wrote public/effects.json (' + Object.keys(EFFECT_NAMES).length + ' effects)');

fs.mkdirSync(DEPLOY, { recursive: true });
const COPY_FILES = ['app.js', 'three.min.js', 'sim-loopback.js', 'sim-engine.js', 'effects.json'];
for (const f of COPY_FILES) {
  fs.copyFileSync(path.join(PUBLIC, f), path.join(DEPLOY, f));
}

let html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const SIM_INJECT = `<script>window.MULTIDISPLAY_SIM = true;</script>
<script src="sim-engine.js"></script>
<script src="sim-loopback.js"></script>
<script src="app.js"></script>`;
if (!html.includes('<script src="app.js"></script>')) {
  throw new Error('deploy.js: index.html\'s <script src="app.js"> tag not found where expected - check public/index.html hasn\'t changed shape');
}
html = html.replace('<script src="app.js"></script>', SIM_INJECT);
fs.writeFileSync(path.join(DEPLOY, 'index.html'), html);

fs.writeFileSync(path.join(DEPLOY, '.nojekyll'), '');

console.log('[deploy] wrote ' + DEPLOY);
