// Re-implementation (not a byte-for-byte port) of effects-games.js's "COIN
// FLIP" effect (coinReset/coinStartFlip/coinFaceStartFlip/coinInitFaces/
// coinRenderFace/coinRenderTopFace/effectCoinFlip, ~line 4960-5205). The
// browser version rendered onto an offscreen <canvas> (gradients, rounded
// rects, ellipse squash-transform, shadowBlur text) and read the pixels
// back with getImageData - there's no DOM/Canvas in pi-native (see cam.js's
// module comment for the project's general canvas-replacement approach; here
// there's no image to decode so jimp doesn't help either), so this redraws
// the same *elements* - shimmering background, a squash-animated coin
// circle, a gold/blue radial-ish fill, a border ring, the H/T letter, and
// running head/tail tallies - directly into colBuf per pixel via
// core.setFaceLED(), using the weather effect's existing 3x5 PIXEL_FONT
// (bundled turnkey glyphs already include 'H'/'T'/digits) instead of canvas
// text. Radial "gradients" are approximated with a 2-stop linear lerp by
// distance from coin centre, which reads the same at 64x64.
//
// core.panelMode==='2d' selects the single-coin-on-face-0 branch (mirrors
// the browser's `typeof panel2dMode!=='undefined' && panel2dMode` check);
// otherwise every side face (0-3) gets its own independent flip cycle/tally
// exactly like the original's 4-entry coinFaces array, the top face (4)
// shows the aggregated H/T totals, and the bottom face (5) is left dark.
const { PIXEL_FONT } = require('./weather/font');

let coinFaces = null;      // 3D mode: per-face {heads,tails,flipping,result,flipT,flipDur,angle,showResult}
let coin2d = null;         // 2D mode: single coin state (same shape)

function newCoinState() {
  const s = { heads: 0, tails: 0, flipping: false, result: '', flipT: 0, flipDur: 0, angle: 0, showResult: 0 };
  startFlip(s, 1.0, 1.0);
  return s;
}

function startFlip(s, durMin, durRange) {
  s.flipping = true; s.flipT = 0;
  s.flipDur = durMin + Math.random() * durRange;
  s.result = Math.random() < 0.5 ? 'H' : 'T';
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawGlyph(core, face, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  const S = core.SIZE;
  if (rows) {
    for (let row = 0; row < 5; row++) {
      const bits = rows[row];
      for (let col = 0; col < 3; col++) {
        if (!((bits >> (2 - col)) & 1)) continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const u = su + col * scale + sx, v = sv + row * scale + sy;
          if (u < 0 || u >= S || v < 0 || v >= S) continue;
          core.setFaceLED(face, u, v, r, g, b);
        }
      }
    }
  }
  return 4 * scale; // 3-wide glyph + 1 column spacing
}

function textWidth(str, scale) { return str.length * 4 * scale - scale; }

function drawText(core, face, str, su, sv, scale, r, g, b) {
  let u = su;
  for (const ch of str) u += drawGlyph(core, face, ch, u, sv, scale, r, g, b);
}

function drawTextCentered(core, face, str, cx, sv, scale, r, g, b) {
  drawText(core, face, str, Math.round(cx - textWidth(str, scale) / 2), sv, scale, r, g, b);
}

// Renders one coin state onto one face: shimmering background, squash-
// animated coin disc (gold while flipping, gold/blue result once landed),
// H/T letter, and a heads/tails tally underneath.
function drawCoinFace(core, face, s, t) {
  const S = core.SIZE;
  const headsWinning = s.heads >= s.tails;
  const cx = S * 0.5, cy = S * 0.4, R = S * 0.30;
  const scaleX = s.flipping ? Math.cos(s.angle) : 1;
  const absSx = Math.max(0.05, Math.abs(scaleX));

  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const dx = (u - cx) / (R * absSx), dy = (v - cy) / R;
      const rad2 = dx * dx + dy * dy;
      let r, g, b;
      if (rad2 <= 1) {
        const rad = Math.sqrt(rad2);
        if (s.flipping) {
          r = lerp(0.87, 0.53, rad); g = lerp(0.67, 0.4, rad); b = lerp(0.2, 0.07, rad);
        } else {
          const isH = s.result === 'H';
          if (isH) { r = lerp(0.93, 0.53, rad); g = lerp(0.73, 0.4, rad); b = lerp(0.2, 0.07, rad); }
          else { r = lerp(0.47, 0.2, rad); g = lerp(0.53, 0.27, rad); b = lerp(0.8, 0.47, rad); }
          if (rad > 0.82) { // border ring
            if (isH) { r = 1; g = 0.87; b = 0.33; } else { r = 0.67; g = 0.73; b = 1; }
          }
        }
      } else {
        const shimmer = Math.sin(t * 2 + u * 0.08 + v * 0.1) * 0.5 + 0.5;
        const bl = shimmer * 0.22;
        if (headsWinning) { r = bl * 1.1; g = bl * 0.85; b = bl * 0.3; } else { r = bl * 0.6; g = bl * 0.7; b = bl * 1.1; }
      }
      core.setFaceLED(face, u, v, r, g, b);
    }
  }

  if (!s.flipping) {
    const sc = Math.max(1, Math.round(R / 6));
    const gw = 3 * sc, gh = 5 * sc;
    drawText(core, face, s.result, Math.round(cx - gw / 2), Math.round(cy - gh / 2), sc, 1, 1, 1);
  }

  const tsc = Math.max(1, Math.round(S / 32));
  drawTextCentered(core, face, 'H' + s.heads, S * 0.28, S * 0.82, tsc, 1, 0.8, 0.27);
  drawTextCentered(core, face, 'T' + s.tails, S * 0.72, S * 0.82, tsc, 0.6, 0.73, 1);
}

// Aggregated "TOTAL" view on the top face (4) in 3D mode.
function drawCoinTop(core, face, t) {
  const S = core.SIZE;
  let totalH = 0, totalT = 0;
  for (const cf of coinFaces) { totalH += cf.heads; totalT += cf.tails; }
  const headsWinning = totalH >= totalT;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const shimmer = Math.sin(t * 3 + u * 0.1 + v * 0.08) * 0.5 + 0.5;
      const bl = shimmer * 0.2;
      let r, g, b;
      if (headsWinning) { r = bl * 1.1; g = bl * 0.85; b = bl * 0.3; } else { r = bl * 0.6; g = bl * 0.7; b = bl * 1.1; }
      core.setFaceLED(face, u, v, r, g, b);
    }
  }
  const sc = Math.max(1, Math.round(S / 24));
  drawTextCentered(core, face, 'TOTAL', S * 0.5, S * 0.08, Math.max(1, sc - 1), 1, 1, 1);
  drawTextCentered(core, face, 'H' + totalH, S * 0.28, S * 0.42, sc, 1, 0.8, 0.27);
  drawTextCentered(core, face, 'T' + totalT, S * 0.72, S * 0.42, sc, 0.6, 0.73, 1);
  // pulsing border in the winning colour
  const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t * 3));
  const br = headsWinning ? 0.86 * pulse : 0.47 * pulse;
  const bg = headsWinning ? 0.67 * pulse : 0.55 * pulse;
  const bb = headsWinning ? 0.16 * pulse : 0.86 * pulse;
  const bw = Math.max(1, Math.round(S / 32));
  for (let u = 0; u < S; u++) {
    for (let k = 0; k < bw; k++) { core.setFaceLED(face, u, k, br, bg, bb); core.setFaceLED(face, u, S - 1 - k, br, bg, bb); }
  }
  for (let v = 0; v < S; v++) {
    for (let k = 0; k < bw; k++) { core.setFaceLED(face, k, v, br, bg, bb); core.setFaceLED(face, S - 1 - k, v, br, bg, bb); }
  }
}

function stepCoin(s, dt, cs) {
  if (s.flipping) {
    s.flipT += dt * cs;
    s.angle += dt * cs * 12;
    if (s.flipT >= s.flipDur) {
      s.flipping = false;
      if (s.result === 'H') s.heads++; else s.tails++;
      s.showResult = 2.0;
      s.angle = 0;
    }
  } else {
    s.showResult -= dt * cs;
    if (s.showResult <= 0) startFlip(s, 1.0, 1.0);
  }
}

function effectCoinFlip(core, dt) {
  core.t += dt;
  const t = core.t;
  const opts = core.effectOptions?.coinflip || {};
  const cs = (opts.speed ?? 1);
  const is3D = core.panelMode !== '2d';

  for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;

  if (is3D) {
    if (!coinFaces) coinFaces = [0, 1, 2, 3].map(() => newCoinState());
    for (let f = 0; f < 4; f++) {
      const cf = coinFaces[f];
      stepCoin(cf, dt, cs);
      drawCoinFace(core, f, cf, t + f * 1.7);
    }
    drawCoinTop(core, 4, t);
    // face 5 (bottom) intentionally left dark, matching the original
  } else {
    if (!coin2d) coin2d = newCoinState();
    stepCoin(coin2d, dt, cs);
    drawCoinFace(core, 0, coin2d, t);
  }
}

module.exports = effectCoinFlip;
