// Port of effects-scenes.js's ghost-face effect (buildGhostCache()/
// ghostPaintFace()/effectGhost(), lines ~74-430). The canvas-drawing part
// (ghostRenderCanvas) is translated separately in ./render.js - this file
// is the ordinary plumbing port: state machine, blink/mouth timers, and
// the LED-surface sampling/compositing step, using core.setLED()/
// core.faceMap instead of bare globals, same convention as maze.js.
'use strict';

const { renderGhostFace, R } = require('./render');

let ghostT = 0, ghostFace = 0, ghostState = 'hidden', ghostStateT = 0, ghostNextFace = 1;
let ghostReveal = 0, ghostAlpha = 0;
let ghostBlinkT = 0, ghostEyeOpen = 1;
let ghostPosX = 0, ghostPosY = 0;
let ghostMouthOpen = 0.7, ghostMouthT = 0;
let ghostHueShift = 0;

let ghostPixelsOpen = null, ghostPixelsClosed = null, ghostPixels = null;
let ghostEyeRX = 0.20, ghostEyeRY = 0.15, ghostEyeSpread = 0.44, ghostCheekDepth = 0.48, ghostBrowAngle = 0;

let ghostDistCache = null, ghostCanvasU = null, ghostCanvasV = null, ghostCacheSize = 0;

function personality() {
  return { eyeRX: ghostEyeRX, eyeRY: ghostEyeRY, eyeSpread: ghostEyeSpread, cheekDepth: ghostCheekDepth, browAngle: ghostBrowAngle };
}

function buildGhostCache(core, cx, cy) {
  const S = core.SIZE;
  if (ghostCacheSize === S && ghostDistCache) return;
  ghostCacheSize = S;
  const ledScale = S * 0.72;
  ghostDistCache = new Float32Array(S * S);
  ghostCanvasU = new Int16Array(S * S);
  ghostCanvasV = new Int16Array(S * S);
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const du = u - cx, dv = v - cy;
      ghostDistCache[v * S + u] = Math.sqrt(du * du + dv * dv);
      ghostCanvasU[v * S + u] = Math.round(((u - cx) / ledScale + 0.5) * R);
      ghostCanvasV[v * S + u] = Math.round(((cy - v) / ledScale + 0.5) * R);
    }
  }
}

function ghostPaintFace(core, face, cx, cy, revealFrac, alpha, hueShift) {
  if (alpha < 0.01) return;
  if (ghostEyeOpen > 0.5) {
    if (!ghostPixelsOpen) ghostPixelsOpen = renderGhostFace(1, ghostMouthOpen, false, ghostHueShift, personality());
    ghostPixels = ghostPixelsOpen;
  } else {
    if (!ghostPixelsClosed) ghostPixelsClosed = renderGhostFace(0, ghostMouthOpen, false, ghostHueShift, personality());
    ghostPixels = ghostPixelsClosed;
  }
  if (!ghostPixels) return;

  buildGhostCache(core, cx, cy);

  const S = core.SIZE, faceMap = core.faceMap, colBuf = core.colBuf;
  const maxRadius = S * 0.78;
  const revealRadius = revealFrac * maxRadius;
  const edgeBand = maxRadius * 0.15;

  const hCos = Math.cos(hueShift || 0);
  const hSin = Math.sin(hueShift || 0);

  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const pi2 = v * S + u;
      const dist = ghostDistCache[pi2];
      if (dist > revealRadius) continue;

      const ci = ghostCanvasU[pi2], cv = ghostCanvasV[pi2];
      if (ci < 0 || ci >= R || cv < 0 || cv >= R) continue;
      const pi = (cv * R + ci) * 4;
      const pa = ghostPixels[pi + 3] / 255;
      if (pa < 0.02) continue;

      const edgeFade = dist > revealRadius - edgeBand ? (revealRadius - dist) / edgeBand : 1;
      const brightness = pa * alpha * edgeFade;

      const rr = ghostPixels[pi] / 255 * brightness;
      const gg = ghostPixels[pi + 1] / 255 * brightness;
      const bb = ghostPixels[pi + 2] / 255 * brightness;

      const cr = rr * hCos - gg * hSin * 0.3;
      const cg = gg + rr * hSin * 0.15;

      const idx = faceMap[face][v * S + u];
      if (idx >= 0) {
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], Math.max(0, cr) * 0.5);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], cg);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], bb * 0.4);
      }
    }
  }
}

function effectGhost(core, dt) {
  const { N, SIZE, colBuf, faceMap } = core;
  ghostT += dt; ghostStateT += dt;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.86;

  if (ghostState === 'present') {
    ghostBlinkT += dt;
    if (ghostBlinkT > 2.5 + Math.random() * 4 && ghostEyeOpen === 1) {
      ghostEyeOpen = 0; ghostBlinkT = 0;
      if (!ghostPixelsClosed) ghostPixelsClosed = renderGhostFace(0, ghostMouthOpen, false, ghostHueShift, personality());
    } else if (ghostBlinkT > 0.12 && ghostEyeOpen === 0) {
      ghostEyeOpen = 1; ghostBlinkT = 0;
      if (!ghostPixelsOpen) ghostPixelsOpen = renderGhostFace(1, ghostMouthOpen, false, ghostHueShift, personality());
    }
    ghostMouthT += dt;
    if (ghostMouthT > 1.5 + Math.random() * 2.5) {
      ghostMouthOpen = 0.4 + Math.random() * 0.6; ghostMouthT = 0;
      ghostPixelsOpen = null; ghostPixelsClosed = null;
    }
  }

  if (ghostState === 'hidden') {
    if (ghostStateT > 1 + Math.random() * 2) {
      ghostState = 'emerging'; ghostStateT = 0; ghostReveal = 0;
      ghostFace = ghostNextFace;
      ghostPosX = SIZE * 0.5;
      ghostPosY = SIZE * 0.5;
      ghostEyeOpen = 1;
      ghostMouthOpen = 0.3 + Math.random() * 0.7;
      ghostEyeRX = 0.16 + Math.random() * 0.08;
      ghostEyeRY = 0.10 + Math.random() * 0.07;
      ghostEyeSpread = 0.38 + Math.random() * 0.14;
      ghostCheekDepth = 0.3 + Math.random() * 0.5;
      ghostBrowAngle = (Math.random() - 0.5) * 0.4;
      ghostPixelsOpen = null; ghostPixelsClosed = null; ghostPixels = null;
      ghostHueShift = (Math.random() - 0.5) * 1.0;
    }
  } else if (ghostState === 'emerging') {
    const p = Math.min(1, ghostStateT / 2.2);
    ghostReveal = p * p * (3 - 2 * p);
    ghostAlpha = 0.6 + ghostReveal * 0.3;
    if (ghostStateT > 2.2) { ghostState = 'present'; ghostStateT = 0; ghostReveal = 1; }
  } else if (ghostState === 'present') {
    ghostReveal = 1;
    ghostAlpha = 0.82 + 0.12 * Math.sin(ghostT * 1.8);
    if (ghostStateT > 3 + Math.random() * 3) { ghostState = 'retreating'; ghostStateT = 0; }
  } else if (ghostState === 'retreating') {
    const p = Math.min(1, ghostStateT / 2.0);
    ghostReveal = 1 - (p * p * (3 - 2 * p));
    ghostAlpha = (1 - p) * 0.88;
    if (ghostStateT > 2.0) {
      ghostState = 'hidden'; ghostStateT = 0; ghostReveal = 0; ghostAlpha = 0;
      ghostPixels = null; ghostPixelsOpen = null; ghostPixelsClosed = null;
      const others = [0, 1, 2, 3].filter((f) => f !== ghostFace);
      ghostNextFace = others[Math.floor(Math.random() * others.length)];
    }
  }

  if (ghostReveal > 0.01) {
    ghostPaintFace(core, ghostFace, ghostPosX, ghostPosY, ghostReveal, ghostAlpha, ghostHueShift);

    if (ghostReveal > 0.5) {
      for (let f = 0; f < 6; f++) {
        if (f === ghostFace) continue;
        for (let j = 0; j < SIZE * SIZE; j++) {
          const idx = faceMap[f][j];
          if (idx >= 0 && Math.random() < 0.002 * ghostReveal) {
            colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + ghostReveal * 0.1 * (0.3 + Math.random() * 0.4));
          }
        }
      }
    }
  }
}

module.exports = effectGhost;
