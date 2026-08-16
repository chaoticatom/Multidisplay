// Builds the full static GitHub Pages deploy folder for the browser
// simulator: sim-engine.js (via build.js), effects.json (static snapshot
// of EFFECT_NAMES - wsServer.js serves this dynamically on the real Pi,
// there's no server here to do that), and a copy of public/{index.html,
// app.js, three.min.js, sim-loopback.js} into <repo root>, with index.html
// patched to load the two extra sim-only scripts and set
// window.MULTIDISPLAY_SIM before app.js runs. See sim/README.md.
//
// Deploys to the REPO ROOT (not a pi-sim/ subfolder) - the ESP32+browser
// architecture this root URL used to serve is retired, this is the only
// simulator now. The old root-level browser app files (ui.js, cube.js,
// effects-*.js, sw.js/service-worker.js, three.part*.js) were removed in
// the same commit that introduced this; if you're looking for that
// architecture, it's still in git history before that commit.
//
// Run this (`node sim/deploy.js` from pi-native/) any time public/app.js,
// public/index.html, src/core.js, src/tick.js, or anything under
// src/effects/ changes - the deployed root files are a build output, not
// hand-edited, and need regenerating + committing like any other build
// artifact this project ships.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..'); // repo root
const PI_NATIVE = path.join(__dirname, '..');
const PUBLIC = path.join(PI_NATIVE, 'public');
const DEPLOY = ROOT;

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
