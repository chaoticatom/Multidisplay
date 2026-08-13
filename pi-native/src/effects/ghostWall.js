// Wall-mode counterpart to ghost/ghost.js ("Ghost Face").
//
// Shape check: ghost.js is a single centered scene on one face (the ghost
// emerges/retreats via a growing/shrinking reveal radius from a fixed
// center point, sampling a cached 256x256 RGBA render - render.js's R,
// resolution-independent, reused verbatim) - same "single centered scene"
// shape as celestialWall.js's bodies, not a full-canvas per-pixel math
// effect like weather/datetime's ticker. So this generalizes the same way:
// center = (wallW/2, wallH/2), ledScale/maxRadius pinned to
// Math.min(wallW, wallH) so the face stays circular/proportioned instead
// of stretching across a wide wall, sampled directly via
// core.setWallPixel instead of core.faceMap/colBuf.
//
// Dropped: the cube-only "sparkle other faces green while the ghost is
// mostly revealed" flourish (ghost.js's `for f=0..6, f!==ghostFace`
// block) - there ARE no other faces on a wall, and scattering sparkle
// pixels elsewhere on the SAME canvas the ghost is drawn on would just
// look like random noise unrelated to the ghost rather than an "other
// panels reacting" effect, so it's cut rather than reinterpreted.
'use strict';

const { renderGhostFace, R } = require('./ghost/render');

let ghostT = 0, ghostState = 'hidden', ghostStateT = 0;
let ghostReveal = 0, ghostAlpha = 0;
let ghostBlinkT = 0, ghostEyeOpen = 1;
let ghostMouthOpen = 0.7, ghostMouthT = 0;
let ghostHueShift = 0;

let ghostPixelsOpen = null, ghostPixelsClosed = null, ghostPixels = null;
let ghostEyeRX = 0.20, ghostEyeRY = 0.15, ghostEyeSpread = 0.44, ghostCheekDepth = 0.48, ghostBrowAngle = 0;

let ghostDistCache = null, ghostCanvasU = null, ghostCanvasV = null, ghostCacheW = 0, ghostCacheH = 0;

function personality() {
  return { eyeRX: ghostEyeRX, eyeRY: ghostEyeRY, eyeSpread: ghostEyeSpread, cheekDepth: ghostCheekDepth, browAngle: ghostBrowAngle };
}

function buildGhostCache(W, H, cx, cy) {
  if (ghostCacheW === W && ghostCacheH === H && ghostDistCache) return;
  ghostCacheW = W; ghostCacheH = H;
  const ledScale = Math.min(W, H) * 0.72;
  ghostDistCache = new Float32Array(W * H);
  ghostCanvasU = new Int16Array(W * H);
  ghostCanvasV = new Int16Array(W * H);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const du = u - cx, dv = v - cy;
      ghostDistCache[v * W + u] = Math.sqrt(du * du + dv * dv);
      ghostCanvasU[v * W + u] = Math.round(((u - cx) / ledScale + 0.5) * R);
      ghostCanvasV[v * W + u] = Math.round(((cy - v) / ledScale + 0.5) * R);
    }
  }
}

function ghostPaintWall(core, W, H, cx, cy, revealFrac, alpha, hueShift) {
  if (alpha < 0.01) return;
  if (ghostEyeOpen > 0.5) {
    if (!ghostPixelsOpen) ghostPixelsOpen = renderGhostFace(1, ghostMouthOpen, false, ghostHueShift, personality());
    ghostPixels = ghostPixelsOpen;
  } else {
    if (!ghostPixelsClosed) ghostPixelsClosed = renderGhostFace(0, ghostMouthOpen, false, ghostHueShift, personality());
    ghostPixels = ghostPixelsClosed;
  }
  if (!ghostPixels) return;

  buildGhostCache(W, H, cx, cy);

  const maxRadius = Math.min(W, H) * 0.78;
  const revealRadius = revealFrac * maxRadius;
  const edgeBand = maxRadius * 0.15;

  const hCos = Math.cos(hueShift || 0);
  const hSin = Math.sin(hueShift || 0);

  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const pi2 = v * W + u;
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

      const o = (v * W + u) * 3;
      core.wallBuf[o] = Math.max(core.wallBuf[o], Math.max(0, cr) * 0.5);
      core.wallBuf[o + 1] = Math.max(core.wallBuf[o + 1], cg);
      core.wallBuf[o + 2] = Math.max(core.wallBuf[o + 2], bb * 0.4);
    }
  }
}

function effectGhostWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  ghostT += dt; ghostStateT += dt;
  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] *= 0.86;

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
    }
  }

  if (ghostReveal > 0.01) {
    ghostPaintWall(core, W, H, W / 2, H / 2, ghostReveal, ghostAlpha, ghostHueShift);
  }
}

module.exports = effectGhostWall;
