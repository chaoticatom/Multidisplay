// Re-implementation (not a byte-for-byte port) of effects-games.js's "DICE
// ROLL" effect (diceStartRoll/diceDotPositions/diceDrawFace/diceRenderPanel/
// diceRenderRolling/effectDice, ~line 5211-5391). Like coinflip.js, the
// browser drew onto an offscreen <canvas> (rounded rects, radial-gradient
// glow, spin/scale transforms) and read pixels back; here the die face -
// rounded square, 1-6 dot pattern, glow border - is drawn straight into
// colBuf via core.setFaceLED(). The "rolling" animation drops the canvas
// version's spin/motion-blur transform (no 2D context to rotate) in favour
// of a fast-cycling random face + flashing background, which reads the same
// at a glance on a 64x64 panel and needs no transform math.
//
// The "ROLL DICE" button and "AUTO ROLL" checkbox are backed by
// core.effectOptions.dice.rollToken/autoRoll via the generic setEffectOption
// mechanism - rollToken follows the exact same monotonically-increasing-
// token pattern as maze.js's "NEW MAZE" button (see that file's module
// comment) so a button click can be detected without a dedicated one-shot
// WS command; autoRoll is read directly every tick, same as any other
// checkbox-backed option (see rain.js's style option for the pattern).
let diceValues = [1, 2, 3, 4, 5, 6];
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

// Draws one die face (rounded square + dot pattern + optional glow border)
// straight into colBuf for the given cube face.
function drawDieFace(core, face, val, isResult, glow) {
  const S = core.SIZE;
  const half = S * 0.45;
  const cx = S * 0.5, cy = S * 0.5;
  const border = S * 0.045;
  const dotR = S * 0.09;
  const dots = DOT_PATTERNS[val] || DOT_PATTERNS[1];
  const inner = S * 0.72;
  const ox = cx - inner / 2, oy = cy - inner / 2;

  const bgOut = isResult ? 0.06 + glow * 0.1 : 0.03;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const dx = Math.abs(u - cx), dy = Math.abs(v - cy);
      let r, g, b;
      if (dx <= half && dy <= half) {
        const edge = Math.max(dx, dy);
        if (edge > half - border) {
          // border ring
          if (isResult) { r = 0.4 + glow * 0.6; g = 0.7 + glow * 0.3; b = 1; }
          else { r = 0.7; g = 0.7; b = 0.78; }
        } else {
          r = isResult ? 0.94 : 0.9; g = isResult ? 0.94 : 0.9; b = isResult ? 0.96 : 0.93;
        }
      } else {
        r = bgOut * 0.9; g = bgOut; b = bgOut * 1.3;
      }
      core.setFaceLED(face, u, v, r, g, b);
    }
  }

  const dotCol = isResult ? [0.1, 0.1, 0.16] : [0.13, 0.13, 0.2];
  for (const [fx, fy] of dots) {
    const px = ox + fx * inner, py = oy + fy * inner;
    const r0 = Math.ceil(dotR);
    for (let dv = -r0; dv <= r0; dv++) for (let du = -r0; du <= r0; du++) {
      if (du * du + dv * dv > dotR * dotR) continue;
      const u = Math.round(px + du), v = Math.round(py + dv);
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      core.setFaceLED(face, u, v, dotCol[0], dotCol[1], dotCol[2]);
    }
  }
}

// Fast-cycling flash + random face value, standing in for the canvas
// version's spin/scale/motion-blur transform (see module comment).
function drawDieRolling(core, face, t) {
  const S = core.SIZE;
  const flash = Math.abs(Math.sin(t * 12));
  const hue = (t * 200) % 360;
  const bg = 0.05 + flash * 0.12;
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) core.setFaceLED(face, u, v, bg * 0.7, bg * 0.6, bg);
  const randomVal = 1 + Math.floor((t * 11) % 6);
  drawDieFace(core, face, randomVal, false, 0);
}

function effectDice(core, dt) {
  core.t += dt;
  const t = core.t;
  const opts = core.effectOptions?.dice || {};
  const rollToken = opts.rollToken;
  const autoRoll = !!opts.autoRoll;

  if (!diceRolling && rollToken !== undefined && rollToken !== lastRollToken) {
    lastRollToken = rollToken;
    diceStartRoll();
  }

  const is3D = core.panelMode !== '2d';

  if (autoRoll && !diceRolling) {
    diceAutoTimer += dt;
    if (diceAutoTimer >= 4) { diceAutoTimer = 0; diceStartRoll(); }
  }

  if (diceRolling) {
    diceRollT += dt;
    if (diceRollT >= diceRollDur) {
      diceRolling = false;
      const shuffled = [1, 2, 3, 4, 5, 6].filter((v) => v !== diceResult);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      diceValues = [shuffled[0], shuffled[1], shuffled[2], shuffled[3], diceResult, shuffled[4]];
      diceGlowT = 3.0;
      diceShowT = 0;
    }
  }
  if (!diceRolling && diceGlowT > 0) diceGlowT -= dt;
  if (!diceRolling) diceShowT += dt;

  for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;

  if (is3D) {
    for (let f = 0; f < 6; f++) {
      if (diceRolling) {
        drawDieRolling(core, f, t + f * 0.7);
      } else {
        const isTop = f === 4;
        const glow = isTop ? Math.max(0, diceGlowT / 3.0) : 0;
        drawDieFace(core, f, diceValues[f], isTop, glow);
      }
    }
  } else if (diceRolling) {
    drawDieRolling(core, 0, t);
  } else {
    const glow = Math.max(0, diceGlowT / 3.0);
    drawDieFace(core, 0, diceResult, true, glow);
  }
}

module.exports = effectDice;
