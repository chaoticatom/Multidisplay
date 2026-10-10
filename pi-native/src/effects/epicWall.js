// Wall-mode counterpart to epic.js ("Earth Live View"). Fetching/decoding is reused
// from epic.js (ensureFetches, getPixelState, getSubSolar, getCaption); only the
// orthographic globe projection is redone here as a centred scene: centre =
// (wallW/2, wallH/2), radius from Math.min(wallW, wallH) so the globe stays a circle.
'use strict';

const epic = require('./epic');
const { CHAR_W } = require('./radio/font');
const { drawMarquee, FONT_5x7, wallPlot } = require('./text');

let scrollX = 0;

// 5x7 marquee along the bottom of the wall (glyph spans rows sv-6..sv,
// drawn unflipped - see text.js's drawGlyph5x7Face() for why cube faces
// differ).
function drawTickerWall(core, W, H, label, dt) {
  const textW = label.length * CHAR_W;
  scrollX += dt * 14;
  if (scrollX > textW) scrollX -= textW;
  const sv = H - 2;
  drawMarquee(FONT_5x7, label, scrollX, sv - 6, W, wallPlot(core, 0.6, 0.85, 1), { outline: wallPlot(core, 0, 0, 0) });
}

// Orthographic globe projection - same math as epic.js's projectGlobe(),
// centered on the full wall and radius-pinned to min(wallW, wallH).
function projectGlobeWall(core, W, H) {
  const cx0 = W / 2, cy0 = H / 2;
  const rad = Math.min(W, H) * 0.46;
  const sol = epic.getSubSolar();
  const { epicEqPixels, epicEqWidth, epicEqHeight, epicImgReady, epicImgPixels, epicImgSize } = epic.getPixelState();
  const useEq = !!epicEqPixels, useFallback = !!(epicImgReady && epicImgPixels);
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const dx = u - cx0, dy = v - cy0;
      if (dx * dx + dy * dy > rad * rad) continue;
      const fx = dx / rad, fy = -dy / rad;
      const fz = Math.sqrt(Math.max(0, 1 - fx * fx - fy * fy));
      const qx = fx * sol.rx + fy * sol.ux + fz * sol.fx_;
      const qy = fx * sol.ry + fy * sol.uy + fz * sol.fy_;
      const qz = fx * sol.rz + fy * sol.uz + fz * sol.fz_;
      let r, g, b;
      if (useEq) {
        const lat = Math.asin(Math.max(-1, Math.min(1, qy)));
        const lon = Math.atan2(qz, qx);
        const uf = (lon + Math.PI) / (2 * Math.PI) * epicEqWidth;
        const vf = (Math.PI / 2 - lat) / Math.PI * epicEqHeight;
        const u0 = Math.max(0, Math.min(epicEqWidth - 1, uf | 0));
        const u1 = Math.min(epicEqWidth - 1, u0 + 1);
        const v0 = Math.max(0, Math.min(epicEqHeight - 1, vf | 0));
        const v1 = Math.min(epicEqHeight - 1, v0 + 1);
        const fu = uf - u0, fv = vf - v0;
        const s = (a, bb, t) => a + (bb - a) * t;
        const px = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4];
        const py = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4 + 1];
        const pz = (rv, ru) => epicEqPixels[(rv * epicEqWidth + ru) * 4 + 2];
        r = s(s(px(v0, u0), px(v0, u1), fu), s(px(v1, u0), px(v1, u1), fu), fv) / 255;
        g = s(s(py(v0, u0), py(v0, u1), fu), s(py(v1, u0), py(v1, u1), fu), fv) / 255;
        b = s(s(pz(v0, u0), pz(v0, u1), fu), s(pz(v1, u0), pz(v1, u1), fu), fv) / 255;
      } else if (useFallback) {
        const IS = epicImgSize;
        const su = Math.min(IS - 1, Math.max(0, Math.floor((fx * 0.5 + 0.5) * IS)));
        const sv = Math.min(IS - 1, Math.max(0, Math.floor((-fy * 0.5 + 0.5) * IS)));
        const pi = (sv * IS + su) * 4;
        r = epicImgPixels[pi] / 255; g = epicImgPixels[pi + 1] / 255; b = epicImgPixels[pi + 2] / 255;
      } else {
        r = 0.04; g = 0.12; b = 0.3;
      }
      const limb = 0.55 + 0.45 * fz;
      core.setWallPixel(u, v, r * limb, g * limb, b * limb);
    }
  }
}

function effectEpicWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  epic.ensureFetches(core);

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const { epicEqPixels, epicImgReady } = epic.getPixelState();
  if (epicEqPixels || epicImgReady) projectGlobeWall(core, W, H);

  drawTickerWall(core, W, H, epic.getCaption(), dt * (core.speedMult || 1));
}

module.exports = effectEpicWall;
module.exports.getStatus = epic.getStatus;
