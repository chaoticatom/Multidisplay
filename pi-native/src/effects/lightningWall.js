// Wall-mode counterpart to lightning.js. The cube version paths each bolt
// across up to 6 faces via tronMove() (_shared.js), which wraps a bolt
// that walks off one face's edge onto the adjacent face. A flat wall has
// no adjacent face to wrap onto - it's one bounded plane - so bolts here
// just walk in wallW x wallH pixel space and clamp at the canvas edges
// (a strike that reaches an edge keeps its jagged wander but simply can't
// cross it, same as how tronMove's own S-1 clamp already limited jag noise
// near a face's edge in the cube version). Everything else (jag noise,
// recursive branching, per-bolt life/decay, thunder flash, storm
// background pulse, shimmer sparks) is unchanged, just re-expressed in
// wallW/wallH/wallBuf via core.setWallPixel instead of SIZE/N/colBuf via
// core.setFaceLED.
const { hsl } = require('../core');

let wallBolts = [], wallLightningT = 0, wallStormT = 0, wallThunder = 0;
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function boltJagWall(core, x, y, dx, dy, steps, depth) {
  const { wallW, wallH } = core;
  const pts = [[x, y]];
  let cx = x, cy = y;
  const px = -dy, py = dx; // perpendicular
  for (let i = 0; i < steps; i++) {
    const jag = Math.round((Math.random() - 0.5) * 5);
    cx = Math.max(0, Math.min(wallW - 1, cx + dx + px * jag));
    cy = Math.max(0, Math.min(wallH - 1, cy + dy + py * jag));
    pts.push([cx, cy]);
    if (depth > 0 && Math.random() < 0.4) {
      const bd = DIRS4[Math.floor(Math.random() * 4)];
      const sub = boltJagWall(core, cx, cy, bd[0], bd[1], Math.max(2, steps >> 1), depth - 1);
      wallBolts.push({ pts: sub, life: 1, decay: 7 + Math.random() * 5, branch: true, hue: 0.62 + Math.random() * 0.1 });
    }
  }
  return pts;
}

function spawnStrikeWall(core) {
  const { wallW, wallH } = core;
  const sx = 4 + Math.floor(Math.random() * Math.max(1, wallW - 8));
  const sy = 4 + Math.floor(Math.random() * Math.max(1, wallH - 8));
  const dir = DIRS4[Math.floor(Math.random() * 4)];
  const len = Math.floor(Math.max(wallW, wallH) * 0.5 + Math.random() * Math.max(wallW, wallH) * 1.0);
  const hc = Math.random();
  const hue = hc < 0.35 ? 0 : hc < 0.6 ? 0.62 : hc < 0.78 ? 0.75 : 0.08;
  const pts = boltJagWall(core, sx, sy, dir[0], dir[1], len, 2);
  wallBolts.push({ pts, life: 1, decay: 3.5 + Math.random() * 3, branch: false, hue, width: 2 });
  wallThunder = Math.max(wallThunder, 0.65 + Math.random() * 0.35);
}

function effectLightningWall(core, dt) {
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const speedMult = core.speedMult || 1;
  wallLightningT += dt * speedMult;
  wallStormT += dt * speedMult;

  // Dark electric storm background — deep blue-purple base
  const pulse = 0.03 + 0.02 * Math.sin(wallStormT * 0.7);
  const nPixels = wallW * wallH;
  for (let i = 0; i < nPixels; i++) {
    wallBuf[i * 3] = Math.max(wallBuf[i * 3] * 0.82, pulse * 0.18);
    wallBuf[i * 3 + 1] = Math.max(wallBuf[i * 3 + 1] * 0.82, pulse * 0.22);
    wallBuf[i * 3 + 2] = Math.max(wallBuf[i * 3 + 2] * 0.82, pulse * 0.65);
  }

  // Thunder flash — whole canvas white bloom
  if (wallThunder > 0.01) {
    for (let i = 0; i < nPixels; i++) {
      wallBuf[i * 3] = Math.min(1, wallBuf[i * 3] + wallThunder * 0.85);
      wallBuf[i * 3 + 1] = Math.min(1, wallBuf[i * 3 + 1] + wallThunder * 0.90);
      wallBuf[i * 3 + 2] = Math.min(1, wallBuf[i * 3 + 2] + wallThunder);
    }
    wallThunder = Math.max(0, wallThunder - dt * 8);
  }

  // Strikes — random intervals roughly around the speed setting
  const baseRate = 0.8 / Math.max(0.1, speedMult);
  const rate = baseRate * (0.3 + Math.random() * 1.4);
  if (wallLightningT > rate) {
    wallLightningT = 0; spawnStrikeWall(core);
    if (Math.random() < 0.4) setTimeout(() => spawnStrikeWall(core), 70);
    if (Math.random() < 0.2) setTimeout(() => spawnStrikeWall(core), 140);
  }

  // Draw bolts
  for (let k = wallBolts.length - 1; k >= 0; k--) {
    const bolt = wallBolts[k];
    bolt.life -= dt * bolt.decay;
    if (bolt.life <= 0) { wallBolts.splice(k, 1); continue; }
    const bright = Math.pow(Math.max(0, bolt.life), 0.6);
    const isMain = !bolt.branch;
    for (const [x, y] of bolt.pts) {
      if (x < 0 || x >= wallW || y < 0 || y >= wallH) continue;
      const coreB = bright * (isMain ? 1.0 : 0.55);
      const [hr, hg, hb] = hsl(bolt.hue, 0.65, coreB * 0.8);
      const wr = isMain ? Math.min(1, hr + coreB * 0.5) : hr;
      const wg = isMain ? Math.min(1, hg + coreB * 0.6) : hg;
      const wb = isMain ? Math.min(1, hb + coreB * 0.7) : hb;
      core.setWallPixel(x, y, wr, wg, wb);
      const gr = isMain ? 2 : 1;
      for (let gv = -gr; gv <= gr; gv++) for (let gu = -gr; gu <= gr; gu++) {
        if (gu === 0 && gv === 0) continue;
        const gd = Math.sqrt(gu * gu + gv * gv); if (gd > gr + 0.5) continue;
        const gb = bright * 0.45 / (gd + 0.6) * (isMain ? 0.7 : 0.35);
        const [gr2, gg2, gb2] = hsl(bolt.hue, 1, gb);
        core.setWallPixel(x + gu, y + gv, gr2, gg2, gb2);
      }
    }
  }

  // Electric shimmer sparks
  const sparks = Math.floor(dt * 25 * (1 + wallThunder * 6));
  for (let s = 0; s < sparks; s++) {
    const i = Math.random() * nPixels | 0;
    const sp = 0.03 + Math.random() * 0.1;
    wallBuf[i * 3] = Math.min(1, wallBuf[i * 3] + sp * 0.25);
    wallBuf[i * 3 + 1] = Math.min(1, wallBuf[i * 3 + 1] + sp * 0.3);
    wallBuf[i * 3 + 2] = Math.min(1, wallBuf[i * 3 + 2] + sp);
  }
}

module.exports = effectLightningWall;
