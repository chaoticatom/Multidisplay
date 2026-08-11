// Ported verbatim (math unchanged) from effects-motion.js's effectLightning()
// + its boltJag()/spawnStrike() helpers. Uses tronMove() from ./_shared.js
// (effects-core.js's shared cross-face-wrap helper, also used by tron).
//
// speedMult: same double-apply-by-design situation as weather.js (see that
// file's module comment) - the browser calls effects as `efn(dt*speedMult)`
// AND effectLightning does `dt*speedMult` again for its own timers, so dt
// already has speedMult baked in by the time it arrives. core.speedMult is
// set by app.js from the live speed slider value; ported faithfully rather
// than "fixed", to keep pacing identical to the browser version.
const { hsl } = require('../core');
const { tronMove } = require('./_shared');

let lightningBolts = [], lightningT = 0, lightningStormT = 0, lightningThunder = 0;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function boltJag(core, face, u, v, du, dv, steps, depth) {
  const SIZE = core.SIZE;
  const pts = [[face, u, v]];
  let cf = face, cu = u, cv = v;
  const pu = -dv, pv = du; // perpendicular
  for (let i = 0; i < steps; i++) {
    const jag = Math.round((Math.random() - 0.5) * 5);
    const nu2 = Math.max(0, Math.min(SIZE - 1, cu + du + pu * jag));
    const nv2 = Math.max(0, Math.min(SIZE - 1, cv + dv + pv * jag));
    const res = tronMove(core, cf, nu2, nv2, du || 1, dv || 1);
    cf = res[0]; cu = res[1]; cv = res[2];
    pts.push([cf, cu, cv]);
    if (depth > 0 && Math.random() < 0.4) {
      const bd = DIRS4[Math.floor(Math.random() * 4)];
      const sub = boltJag(core, cf, cu, cv, bd[0], bd[1], Math.max(2, steps >> 1), depth - 1);
      lightningBolts.push({ pts: sub, life: 1, decay: 7 + Math.random() * 5, branch: true, hue: 0.62 + Math.random() * 0.1 });
    }
  }
  return pts;
}

function spawnStrike(core) {
  const SIZE = core.SIZE;
  const face = Math.floor(Math.random() * 6);
  const su = 4 + Math.floor(Math.random() * (SIZE - 8));
  const sv = 4 + Math.floor(Math.random() * (SIZE - 8));
  const dir = DIRS4[Math.floor(Math.random() * 4)];
  const len = Math.floor(SIZE * 0.5 + Math.random() * SIZE * 1.0);
  const hc = Math.random();
  const hue = hc < 0.35 ? 0 : hc < 0.6 ? 0.62 : hc < 0.78 ? 0.75 : 0.08;
  const pts = boltJag(core, face, su, sv, dir[0], dir[1], len, 2);
  lightningBolts.push({ pts, life: 1, decay: 3.5 + Math.random() * 3, branch: false, hue, width: 2 });
  lightningThunder = Math.max(lightningThunder, 0.65 + Math.random() * 0.35);
}

function effectLightning(core, dt) {
  const speedMult = core.speedMult || 1;
  lightningT += dt * speedMult;
  lightningStormT += dt * speedMult;
  const { N, SIZE, colBuf } = core;

  // Dark electric storm background — deep blue-purple base
  const pulse = 0.03 + 0.02 * Math.sin(lightningStormT * 0.7);
  for (let i = 0; i < N; i++) {
    colBuf[i * 3] = Math.max(colBuf[i * 3] * 0.82, pulse * 0.18);
    colBuf[i * 3 + 1] = Math.max(colBuf[i * 3 + 1] * 0.82, pulse * 0.22);
    colBuf[i * 3 + 2] = Math.max(colBuf[i * 3 + 2] * 0.82, pulse * 0.65);
  }

  // Thunder flash — whole cube white bloom
  if (lightningThunder > 0.01) {
    for (let i = 0; i < N; i++) {
      colBuf[i * 3] = Math.min(1, colBuf[i * 3] + lightningThunder * 0.85);
      colBuf[i * 3 + 1] = Math.min(1, colBuf[i * 3 + 1] + lightningThunder * 0.90);
      colBuf[i * 3 + 2] = Math.min(1, colBuf[i * 3 + 2] + lightningThunder);
    }
    lightningThunder = Math.max(0, lightningThunder - dt * 8);
  }

  // Strikes — random intervals roughly around the speed setting
  const baseRate = 0.8 / Math.max(0.1, speedMult);
  const rate = baseRate * (0.3 + Math.random() * 1.4);
  if (lightningT > rate) {
    lightningT = 0; spawnStrike(core);
    if (Math.random() < 0.4) setTimeout(() => spawnStrike(core), 70);
    if (Math.random() < 0.2) setTimeout(() => spawnStrike(core), 140);
  }

  // Draw bolts
  for (let k = lightningBolts.length - 1; k >= 0; k--) {
    const bolt = lightningBolts[k];
    bolt.life -= dt * bolt.decay;
    if (bolt.life <= 0) { lightningBolts.splice(k, 1); continue; }
    const bright = Math.pow(Math.max(0, bolt.life), 0.6);
    const isMain = !bolt.branch;
    for (const [face, u, v] of bolt.pts) {
      if (u < 0 || u >= SIZE || v < 0 || v >= SIZE) continue;
      const core_ = bright * (isMain ? 1.0 : 0.55);
      const [hr, hg, hb] = hsl(bolt.hue, 0.65, core_ * 0.8);
      const wr = isMain ? Math.min(1, hr + core_ * 0.5) : hr;
      const wg = isMain ? Math.min(1, hg + core_ * 0.6) : hg;
      const wb = isMain ? Math.min(1, hb + core_ * 0.7) : hb;
      core.setFaceLED(face, u, v, wr, wg, wb);
      const gr = isMain ? 2 : 1;
      for (let gv = -gr; gv <= gr; gv++) for (let gu = -gr; gu <= gr; gu++) {
        if (gu === 0 && gv === 0) continue;
        const gd = Math.sqrt(gu * gu + gv * gv); if (gd > gr + 0.5) continue;
        const gb = bright * 0.45 / (gd + 0.6) * (isMain ? 0.7 : 0.35);
        const [gr2, gg2, gb2] = hsl(bolt.hue, 1, gb);
        core.setFaceLED(face, u + gu, v + gv, gr2, gg2, gb2);
      }
    }
  }

  // Electric shimmer sparks
  const sparks = Math.floor(dt * 25 * (1 + lightningThunder * 6));
  for (let s = 0; s < sparks; s++) {
    const i = Math.random() * N | 0;
    const sp = 0.03 + Math.random() * 0.1;
    colBuf[i * 3] = Math.min(1, colBuf[i * 3] + sp * 0.25);
    colBuf[i * 3 + 1] = Math.min(1, colBuf[i * 3 + 1] + sp * 0.3);
    colBuf[i * 3 + 2] = Math.min(1, colBuf[i * 3 + 2] + sp);
  }
}

module.exports = effectLightning;
