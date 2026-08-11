// Ported verbatim (math unchanged) from effects-motion.js's effectNebula().
const { hsl, lerp, sm } = require('../core');

let nebStars = null;

function effectNebula(core, dt) {
  core.t += dt * 0.28;
  const { N, surfX, surfY, surfZ, t } = core;
  if (!nebStars || nebStars.length !== N) { nebStars = []; for (let i = 0; i < N; i++) nebStars.push({ last: -1, next: Math.random() * 8, bright: 0 }); }
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    let d = 0;
    d += Math.sin(x * 5.3 + t * 0.52) * Math.cos(y * 4.9 + t * 0.31) * 0.5;
    d += Math.sin(z * 6.5 - t * 0.42) * Math.sin(x * 3.4 + t * 0.21) * 0.38;
    d += Math.cos((x + y + z) * 4.2 + t * 0.58) * 0.28;
    d += Math.sin(x * 8.8 + y * 6.1 - t * 0.35) * 0.15;
    d = d * 0.48 + 0.52;
    const bright = Math.pow(Math.max(0, d - 0.08), 1.4) * 0.92;
    const hue = lerp(0.60, 0.04, sm(0.18, 0.88, d)) + Math.sin(t * 0.08) * 0.05;
    const [r, g, b] = hsl(hue, 0.85 + d * 0.15, bright);
    // bright nebula cores (highest density)
    const coreBoost = Math.max(0, d - 0.75) * 3.5;
    const ns = nebStars[i]; ns.next -= dt;
    let sr = 0, sg = 0, sb = 0;
    if (ns.next <= 0) { ns.bright = 0.6 + Math.random() * 0.4; ns.next = 4 + Math.random() * 12; ns.last = t; }
    if (ns.bright > 0) { ns.bright = Math.max(0, ns.bright - dt * 1.2); const sc = ns.bright; sr = sc; sg = sc; sb = sc + 0.2; }
    core.setLED(i, Math.min(1, r + coreBoost * 0.4 + sr), Math.min(1, g + coreBoost * 0.3 + sg), Math.min(1, b + coreBoost * 0.2 + sb));
  }
}

module.exports = effectNebula;
