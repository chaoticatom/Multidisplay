// Ported verbatim (math unchanged) from effects-physics.js's
// resetFluid()/effectFluid() - "Liquid Crystal". No option panel in
// index.html (data-effect="fluid" has no `has-panel` class) - registered
// as a plain effect, nothing to wire. Uses surfIdx() from ./_shared.js.
// getLocalGravity() -> _shared.js's fixed-down-vector helper (see its
// module comment) - the browser reads getLocalGravity(1) each frame so a
// dragged/tilted cube (or live gyro) redirects the slosh; pi-native has
// neither, so the fluid always slopes toward a fixed world-down, same as
// an idle un-rotated browser cube. Doesn't special-case panel2dMode at all
// (same as the source - the fluid sim runs over the whole surface
// regardless of panel mode, matching the browser).
const { hsl } = require('../core');
const { surfIdx, getLocalGravity } = require('./_shared');

let fluidH = null, fluidV = null, fluidT2 = 0;

function resetFluid(core) {
  fluidH = new Float32Array(core.N);
  fluidV = new Float32Array(core.N);
}

function effectFluid(core, dt) {
  const { N, gridX, gridY, gridZ, surfX, surfY, surfZ, colBuf } = core;
  core.t += dt;
  if (!fluidH || fluidH.length !== N) resetFluid(core);
  fluidT2 += dt;
  const grav = getLocalGravity();
  const gl = Math.sqrt(grav.x * grav.x + grav.y * grav.y + grav.z * grav.z) || 1;
  const gx = grav.x / gl, gy = grav.y / gl, gz = grav.z / gl;

  const SPEED = 28, DAMP = 0.96, GRAV_STR = 14;
  const newH = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = gridX[i], y = gridY[i], z = gridZ[i];
    let lap = 0, cnt = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const j = surfIdx(core, x + dx, y + dy, z + dz);
      if (j >= 0) { lap += fluidH[j]; cnt++; }
    }
    if (cnt) {
      const avg = lap / cnt;
      const slope = (gx * (surfX[i] - 0.5) + gy * (surfY[i] - 0.5) + gz * (surfZ[i] - 0.5));
      fluidV[i] = (fluidV[i] + dt * (SPEED * (avg - fluidH[i]) - GRAV_STR * slope)) * DAMP;
    }
    newH[i] = Math.max(-1, Math.min(1, fluidH[i] + fluidV[i] * dt));
  }
  for (let i = 0; i < N; i++) fluidH[i] = newH[i];

  if (Math.random() < dt * 1.5) {
    const i = Math.random() * N | 0;
    fluidH[i] += 0.8 + Math.random() * 0.6;
  }

  for (let i = 0; i < N; i++) {
    const h = fluidH[i];
    const abs = Math.abs(h);
    if (abs < 0.03) { core.setLED(i, 0, 0, 0.02); continue; }
    const posPhase = (surfX[i] + surfY[i] + surfZ[i]) * 2.1 + fluidT2 * 0.15;
    const hue = (h > 0
      ? 0.55 + abs * 0.15 + Math.sin(posPhase) * 0.08
      : 0.02 + abs * 0.12 + Math.sin(posPhase) * 0.06)
      % 1;
    const sat = 0.85 + abs * 0.15;
    const bright = Math.pow(abs, 0.5) * 0.9;
    const [r, g, b] = hsl(hue, sat, bright);
    const glint = Math.max(0, abs - 0.75) * 4;
    core.setLED(i, Math.min(1, r + glint * 0.7), Math.min(1, g + glint * 0.8), Math.min(1, b + glint));
  }
}

module.exports = effectFluid;
