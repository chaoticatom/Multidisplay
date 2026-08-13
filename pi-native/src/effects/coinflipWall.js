// Wall-mode counterpart to coinflip.js.
//
// The cube variant already renders a "result card" - identical content
// drawn independently per face (4 side faces each running their own flip
// cycle/tally, a fifth face showing an aggregate, one dark) - there's no
// literal 3D coin object being simulated. For the wall there's no
// equivalent of "6 faces", just one flat stitched canvas, so this draws a
// SINGLE coin (one flip cycle, one running tally) once, centred and scaled
// across the whole wallW x wallH canvas - the wall-mode version of the
// task brief's "2D mode" branch in the original (single coin, not per-face
// tallies), which is the closest existing shape to "one wall = one view".
// This is deliberately a "draw once across the whole canvas" port, not a
// spatial/particle adaptation - there's nothing to flatten, the cube
// version was already just the same drawing done N times.
const { PIXEL_FONT } = require('./weather/font');

let coinState = null; // {heads,tails,flipping,result,flipT,flipDur,angle,showResult}

function newCoinState() {
  const s = { heads: 0, tails: 0, flipping: false, result: '', flipT: 0, flipDur: 0, angle: 0, showResult: 0 };
  startFlip(s);
  return s;
}

function startFlip(s) {
  s.flipping = true; s.flipT = 0;
  s.flipDur = 1.0 + Math.random() * 1.0;
  s.result = Math.random() < 0.5 ? 'H' : 'T';
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawGlyphWall(core, ch, su, sv, scale, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()];
  if (!rows) return 4 * scale;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        core.setWallPixel(su + col * scale + sx, sv + row * scale + sy, r, g, b);
      }
    }
  }
  return 4 * scale;
}

function textWidth(str, scale) { return str.length * 4 * scale - scale; }

function drawTextWall(core, str, su, sv, scale, r, g, b) {
  let u = su;
  for (const ch of str) u += drawGlyphWall(core, ch, u, sv, scale, r, g, b);
}

function drawTextCenteredWall(core, str, cx, sv, scale, r, g, b) {
  drawTextWall(core, str, Math.round(cx - textWidth(str, scale) / 2), sv, scale, r, g, b);
}

function stepCoin(s, dt) {
  if (s.flipping) {
    s.flipT += dt;
    s.angle += dt * 12;
    if (s.flipT >= s.flipDur) {
      s.flipping = false;
      if (s.result === 'H') s.heads++; else s.tails++;
      s.showResult = 2.0;
      s.angle = 0;
    }
  } else {
    s.showResult -= dt;
    if (s.showResult <= 0) startFlip(s);
  }
}

function effectCoinFlipWall(core, dt) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  core.t += dt;
  const t = core.t;
  const opts = core.effectOptions?.coinflip || {};
  const cs = (opts.speed ?? 1);

  if (!coinState) coinState = newCoinState();
  stepCoin(coinState, dt * cs);

  const s = coinState;
  const headsWinning = s.heads >= s.tails;
  const dim = Math.min(wallW, wallH);
  const cx = wallW * 0.5, cy = wallH * 0.4, R = dim * 0.30;
  const scaleX = s.flipping ? Math.cos(s.angle) : 1;
  const absSx = Math.max(0.05, Math.abs(scaleX));

  for (let v = 0; v < wallH; v++) {
    for (let u = 0; u < wallW; u++) {
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
          if (rad > 0.82) {
            if (isH) { r = 1; g = 0.87; b = 0.33; } else { r = 0.67; g = 0.73; b = 1; }
          }
        }
      } else {
        const shimmer = Math.sin(t * 2 + u * 0.08 + v * 0.1) * 0.5 + 0.5;
        const bl = shimmer * 0.22;
        if (headsWinning) { r = bl * 1.1; g = bl * 0.85; b = bl * 0.3; } else { r = bl * 0.6; g = bl * 0.7; b = bl * 1.1; }
      }
      core.setWallPixel(u, v, r, g, b);
    }
  }

  if (!s.flipping) {
    const sc = Math.max(1, Math.round(R / 6));
    const gw = 3 * sc, gh = 5 * sc;
    drawTextWall(core, s.result, Math.round(cx - gw / 2), Math.round(cy - gh / 2), sc, 1, 1, 1);
  }

  const tsc = Math.max(1, Math.round(dim / 32));
  drawTextCenteredWall(core, 'H' + s.heads, wallW * 0.5 - dim * 0.2, wallH * 0.82, tsc, 1, 0.8, 0.27);
  drawTextCenteredWall(core, 'T' + s.tails, wallW * 0.5 + dim * 0.2, wallH * 0.82, tsc, 0.6, 0.73, 1);
}

module.exports = effectCoinFlipWall;
