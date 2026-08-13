// Wall-mode counterpart to dice.js.
//
// Same reasoning as coinflipWall.js: the cube variant is a "result card"
// (rounded die face + dot pattern + glow border) drawn independently per
// face with no real 3D die object, so there is nothing spatial to flatten.
// This draws a SINGLE die (mirrors the original's 2D-mode single-panel
// branch) once, centred and scaled across the whole wallW x wallH canvas -
// a "draw once across the whole canvas" port, not a particle/spatial
// adaptation. Same rollToken/autoRoll option keys as dice.js (see that
// file's module comment for why), so the existing "ROLL DICE"/"AUTO ROLL"
// UI controls drive this too with no new option plumbing.
let diceRolling = false, diceRollT = 0, diceRollDur = 0;
let diceResult = 1, diceShowT = 0, diceAutoTimer = 0, diceGlowT = 0;
let lastRollToken = null;

const DOT_PATTERNS = {
  1: [[0.5, 0.5]],
  2: [[0.2, 0.2], [0.8, 0.8]],
  3: [[0.2, 0.2], [0.5, 0.5], [0.8, 0.8]],
  4: [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]],
  5: [[0.2, 0.2], [0.8, 0.2], [0.5, 0.5], [0.2, 0.8], [0.8, 0.8]],
  6: [[0.2, 0.2], [0.8, 0.2], [0.2, 0.5], [0.8, 0.5], [0.2, 0.8], [0.8, 0.8]],
};

function diceStartRoll() {
  diceRolling = true; diceRollT = 0;
  diceRollDur = 1.5 + Math.random() * 0.5;
  diceResult = 1 + Math.floor(Math.random() * 6);
}

// Draws one die face onto the whole wallW x wallH canvas, centred and
// scaled off min(wallW,wallH) so it stays square-looking on a wide wall.
function drawDieFaceWall(core, val, isResult, glow) {
  const { wallW, wallH } = core;
  const dim = Math.min(wallW, wallH);
  const half = dim * 0.45;
  const cx = wallW * 0.5, cy = wallH * 0.5;
  const border = dim * 0.045;
  const dotR = dim * 0.09;
  const dots = DOT_PATTERNS[val] || DOT_PATTERNS[1];
  const inner = dim * 0.72;
  const ox = cx - inner / 2, oy = cy - inner / 2;

  const bgOut = isResult ? 0.06 + glow * 0.1 : 0.03;
  for (let v = 0; v < wallH; v++) {
    for (let u = 0; u < wallW; u++) {
      const dx = Math.abs(u - cx), dy = Math.abs(v - cy);
      let r, g, b;
      if (dx <= half && dy <= half) {
        const edge = Math.max(dx, dy);
        if (edge > half - border) {
          if (isResult) { r = 0.4 + glow * 0.6; g = 0.7 + glow * 0.3; b = 1; }
          else { r = 0.7; g = 0.7; b = 0.78; }
        } else {
          r = isResult ? 0.94 : 0.9; g = isResult ? 0.94 : 0.9; b = isResult ? 0.96 : 0.93;
        }
      } else {
        r = bgOut * 0.9; g = bgOut; b = bgOut * 1.3;
      }
      core.setWallPixel(u, v, r, g, b);
    }
  }

  const dotCol = isResult ? [0.1, 0.1, 0.16] : [0.13, 0.13, 0.2];
  for (const [fx, fy] of dots) {
    const px = ox + fx * inner, py = oy + fy * inner;
    const r0 = Math.ceil(dotR);
    for (let dv = -r0; dv <= r0; dv++) for (let du = -r0; du <= r0; du++) {
      if (du * du + dv * dv > dotR * dotR) continue;
      const u = Math.round(px + du), v = Math.round(py + dv);
      core.setWallPixel(u, v, dotCol[0], dotCol[1], dotCol[2]);
    }
  }
}

// Fast-cycling flash + random face value while rolling, same substitution
// for the canvas version's spin/scale transform as dice.js uses (see that
// file's module comment).
function drawDieRollingWall(core, t) {
  const { wallW, wallH } = core;
  const flash = Math.abs(Math.sin(t * 12));
  const bg = 0.05 + flash * 0.12;
  for (let v = 0; v < wallH; v++) for (let u = 0; u < wallW; u++) core.setWallPixel(u, v, bg * 0.7, bg * 0.6, bg);
  const randomVal = 1 + Math.floor((t * 11) % 6);
  drawDieFaceWall(core, randomVal, false, 0);
}

function effectDiceWall(core, dt) {
  const { wallW } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const t = core.t;
  const opts = core.effectOptions?.dice || {};
  const rollToken = opts.rollToken;
  const autoRoll = !!opts.autoRoll;

  if (!diceRolling && rollToken !== undefined && rollToken !== lastRollToken) {
    lastRollToken = rollToken;
    diceStartRoll();
  }

  if (autoRoll && !diceRolling) {
    diceAutoTimer += dt;
    if (diceAutoTimer >= 4) { diceAutoTimer = 0; diceStartRoll(); }
  }

  if (diceRolling) {
    diceRollT += dt;
    if (diceRollT >= diceRollDur) {
      diceRolling = false;
      diceGlowT = 3.0;
      diceShowT = 0;
    }
  }
  if (!diceRolling && diceGlowT > 0) diceGlowT -= dt;
  if (!diceRolling) diceShowT += dt;

  if (diceRolling) {
    drawDieRollingWall(core, t);
  } else {
    const glow = Math.max(0, diceGlowT / 3.0);
    drawDieFaceWall(core, diceResult, true, glow);
  }
}

module.exports = effectDiceWall;
