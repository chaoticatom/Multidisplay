// Cross-effect helpers ported verbatim (math unchanged) from
// effects-core.js's cubePx()/fwPx()/tronMove() - shared by more than one
// Motion & Particles effect (sphere/"Laser Grid" and lightning use cubePx;
// lightning and (later) tron use tronMove). Kept out of core.js itself
// since CubeCore is the browser's cube.js port, while these three are
// effects-core.js's cross-category helpers, per CLAUDE.md's file layout.
//
// Only the plumbing changed: reads SIZE/faceMap off the passed `core`
// instead of bare globals, and panel2dMode/tronBorderWalls (browser globals
// read via `typeof x!=='undefined'` guards, since they come from sidebar
// checkboxes that don't exist here) are hardcoded false - pi-native has no
// equivalent UI toggle yet, so tronMove always takes the real cube-wrap
// branch, never the flat/bordered-2D-net branch.
const FW_FACES = [0, 2, 1, 3];

function cubePx(core, col, v) {
  const S = core.SIZE, T = S * 4, M = S - 1;
  const faceMap = core.faceMap;
  const c = ((col % T) + T) % T;
  const qi = (c / S) | 0;
  const fu = c % S;
  if (v >= 0 && v < S) return faceMap[FW_FACES[qi]][v * S + fu];
  if (v >= S) {
    const ov = v - S;
    if (ov >= S) return -1;
    if (qi === 0) return faceMap[4][(M - ov) * S + fu];
    if (qi === 1) return faceMap[4][(M - fu) * S + (M - ov)];
    if (qi === 2) return faceMap[4][ov * S + (M - fu)];
    return faceMap[4][fu * S + ov];
  }
  const ov = -v - 1;
  if (ov >= S) return -1;
  if (qi === 0) return faceMap[5][ov * S + fu];
  if (qi === 1) return faceMap[5][fu * S + (M - ov)];
  if (qi === 2) return faceMap[5][(M - ov) * S + (M - fu)];
  return faceMap[5][(M - fu) * S + ov];
}

function fwPx(core, col, v) { return cubePx(core, col, v); }

function tronMove(core, face, u, v, du, dv) {
  const SIZE = core.SIZE, M = SIZE - 1, nu = u + du, nv = v + dv;
  if (nu >= 0 && nu <= M && nv >= 0 && nv <= M) return [face, nu, nv, du, dv];
  switch (face) {
    case 0: if (du === 1) return [2, M, v, -1, 0]; if (du === -1) return [3, M, v, -1, 0]; if (dv === 1) return [4, u, M, 0, -1]; return [5, u, M, 0, -1];
    case 1: if (du === 1) return [2, 0, v, 1, 0]; if (du === -1) return [3, 0, v, 1, 0]; if (dv === 1) return [4, u, 0, 0, 1]; return [5, u, 0, 0, 1];
    case 2: if (du === 1) return [0, M, v, -1, 0]; if (du === -1) return [1, M, v, -1, 0]; if (dv === 1) return [4, M, u, -1, 0]; return [5, M, u, -1, 0];
    case 3: if (du === 1) return [0, 0, v, 1, 0]; if (du === -1) return [1, 0, v, 1, 0]; if (dv === 1) return [4, 0, u, 1, 0]; return [5, 0, u, 1, 0];
    case 4: if (du === 1) return [2, v, M, 0, -1]; if (du === -1) return [3, v, M, 0, -1]; if (dv === 1) return [0, u, M, 0, -1]; return [1, u, M, 0, -1];
    default: if (du === 1) return [2, v, 0, 0, 1]; if (du === -1) return [3, v, 0, 0, 1]; if (dv === 1) return [0, u, 0, 0, 1]; return [1, u, 0, 0, 1];
  }
}

module.exports = { cubePx, fwPx, tronMove, FW_FACES };
