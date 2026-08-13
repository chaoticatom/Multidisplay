// Wall-mode counterpart to neo.js ("Near-Earth Objects").
//
// Shape check (per the batch brief): neo.js already carries its own
// `core.panelMode==='2d'` branch (neoDraw2D) - a single flat composition
// (Earth peeking from the left edge + a horizontal LD-distance radar +a
// bottom ticker + a pulsing risk label) built for one SIZE x SIZE panel,
// completely distinct from the cube-mode branch (Earth+ring on face 0,
// blips scattered on faces 2/3, title card on face 4, ticker on face 1 -
// nothing to generalize there, six independent faces don't map onto one
// stitched canvas). So this is the "generalize the existing is2D branch"
// case the brief calls out, following weatherWall.js's precedent exactly:
// same composition, but Earth/radar/ticker math now takes wallW and
// wallH as independent dimensions (Earth radius pinned to wallH so it
// stays circular and doesn't balloon on a many-panels-wide wall, radar
// distance axis and ticker both span the FULL wallW so a wide wall shows
// more of the timeline instead of tiling/repeating it) instead of the
// single SIZE both axes shared on a lone panel.
//
// Fetch/risk-classification logic is reused verbatim from neo.js (see its
// exports: neoFetch, neoRisk, neoRiskRGB, neo2dRiskRGB, neoOverallRisk,
// neoBuildSegments, getObjects) rather than re-implemented - both the cube
// effect and this wall effect end up sharing the SAME neoObjects array and
// the SAME NASA NeoWs rate-limited fetch pool, which is a feature (no
// double-polling the same hourly-refreshed API), not a bug, matching how
// epic.js/iss.js's ensureFetches()/ensureFetch() are shared in this batch.
// Only the fetch *scheduling gate* (when to call neoFetch()) is a small
// separate copy here - cheap non-network bookkeeping, not real duplication.
'use strict';

const { PIXEL_FONT } = require('./weather/font');
const neo = require('./neo');

const NEO_REFRESH_SEC = 3600;

let lastFetch = 0; // seconds
let lastRefreshOpt = null;
let wallT = 0;
let wallTickerX = 0;

function ensureFetch(core) {
  const opts = core.effectOptions?.neo || {};
  if (opts.refreshRequestedAt && opts.refreshRequestedAt !== lastRefreshOpt) {
    lastRefreshOpt = opts.refreshRequestedAt;
    lastFetch = 0;
  }
  const objs = neo.getObjects();
  if (!objs.length && (Date.now() / 1000 - lastFetch) > NEO_REFRESH_SEC) {
    lastFetch = Date.now() / 1000;
    neo.neoFetch();
  }
}

// ── 3x5 bitmap text helpers, same convention as weatherWall's wxGlyph but
// addressed through core.setWallPixel instead of faceMap/colBuf. ─────────
function glyphWall(core, W, H, ch, su, sv, r, g, b) {
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()]; if (!rows) return 4;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = sv + (4 - row);
      if (u < 0 || u >= W || v < 0 || v >= H) continue;
      const o = (v * W + u) * 3;
      if (r > core.wallBuf[o]) core.wallBuf[o] = r;
      if (g > core.wallBuf[o + 1]) core.wallBuf[o + 1] = g;
      if (b > core.wallBuf[o + 2]) core.wallBuf[o + 2] = b;
    }
  }
  return 4;
}
function textWall(core, W, H, str, su, sv, r, g, b) {
  let u = su;
  for (const ch of str) { u += glyphWall(core, W, H, ch, u, sv, r, g, b); if (u >= W) break; }
}
function textPulsedWall(core, W, H, str, su, sv, rgb, pulse) {
  textWall(core, W, H, str, su, sv, rgb[0] * pulse, rgb[1] * pulse, rgb[2] * pulse);
}

function effectNeoWall(core, dt) {
  const { wallW: W, wallH: H } = core;
  if (!W) return; // core.initWall() hasn't run yet (wall mode not active)
  wallT += dt;
  ensureFetch(core);

  for (let i = 0; i < core.wallBuf.length; i++) core.wallBuf[i] = 0;

  const tt = Date.now() * 0.001;
  // Starfield background, scattered across the whole wall.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const seed = ((i * 2654435761) >>> 0) / 4294967296;
    if (seed < 0.014) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.4 + seed * 60));
      const br = seed * 36 * twinkle;
      core.setWallPixel(x, y, br, br, br * 1.1);
    }
  }

  const level = neo.neoOverallRisk();
  const riskRGB = neo.neoRiskRGB(level);
  const pulse = 0.55 + 0.45 * Math.sin(wallT * (level === 'red' ? 6 : level === 'yellow' ? 3 : 1.4));

  const ecx = Math.round(W * -0.14), ecy = Math.round(H * 0.5);
  const earthRad = Math.round(H * 0.55);
  const atmRad = earthRad + Math.round(H * 0.07);
  const maxLD = 60;
  const xOrigin = ecx + earthRad + Math.round(W * 0.01);
  const xMax = W - 2;

  // Distance rings every 10 LD, spanning the full wall height.
  for (let ring = 10; ring <= maxLD; ring += 10) {
    const rxi = Math.round((ring / maxLD) * (xMax - xOrigin) + xOrigin);
    if (rxi < 0 || rxi >= W) continue;
    for (let v = 0; v < H; v++) {
      if (Math.floor(v / 3) % 2 === 0) core.setWallPixel(rxi, v, 0.04, 0.04, 0.02);
    }
  }

  // Earth, radius pinned to wallH so it stays circular regardless of how
  // wide the stitched wall is.
  for (let v = 0; v < H; v++) {
    for (let u = 0; u < W; u++) {
      const dx = u - ecx, dy = v - ecy, d = Math.sqrt(dx * dx + dy * dy);
      const yOut = H - 1 - v;
      if (d < atmRad && d >= earthRad) {
        const t2 = 1 - (d - earthRad) / (atmRad - earthRad);
        const atm = t2 * t2 * 0.35;
        const o = (yOut * W + u) * 3;
        core.wallBuf[o] = Math.max(core.wallBuf[o], atm * 0.3);
        core.wallBuf[o + 1] = Math.max(core.wallBuf[o + 1], atm * 0.6);
        core.wallBuf[o + 2] = Math.max(core.wallBuf[o + 2], atm);
        continue;
      }
      if (d >= earthRad) continue;
      const nx = dx / earthRad, ny = dy / earthRad;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = Math.max(0.02, Math.min(1, (nx * 0.35 + ny * -0.25 + nz * 0.9) * 1.1));
      const lon = Math.atan2(ny, nx) + tt * 0.04;
      const lat = Math.asin(Math.max(-1, Math.min(1, nz)));
      const land = (Math.sin(lon * 3.1 + 1.2) * Math.cos(lat * 2.8 + 0.5) > 0.18)
        || (Math.sin(lon * 5.3 - 0.7) * Math.cos(lat * 4.1 + 1.1) > 0.35)
        || (Math.sin(lon * 1.9 + 2.5) * Math.cos(lat * 6.2 - 0.8) > 0.45);
      const ice = Math.abs(nz) > 0.82;
      let r, g, b;
      if (ice) { r = 0.82; g = 0.88; b = 0.92; }
      else if (land) { r = 0.12; g = 0.38 + Math.sin(lon * 7) * 0.06; b = 0.08; }
      else { r = 0.04; g = 0.15; b = 0.55 + Math.sin(lat * 4) * 0.1; }
      core.setWallPixel(u, yOut, r * lit, g * lit, b * lit);
    }
  }

  const objs = neo.getObjects().slice(0, 12);
  const charW = 4;
  const segments = neo.neoBuildSegments(neo.neo2dRiskRGB);
  const totalTickerChars = segments.reduce((s, seg) => s + seg.str.length, 0);
  const totalW = totalTickerChars * charW + W;
  wallTickerX = (wallTickerX + dt * 22) % totalW;

  const targetPx = (Math.floor(wallTickerX) + Math.floor(W * 0.5)) % totalW;
  let activeIdx = -1, cp = 0;
  for (const seg of segments) {
    const segPx = cp * charW;
    if (targetPx >= segPx && targetPx < segPx + seg.str.length * charW) {
      if (seg.neoIdx >= 0) activeIdx = seg.neoIdx;
      break;
    }
    cp += seg.str.length;
  }

  // NEO radar dots, spread across the full wall height/width.
  objs.forEach((o, oi) => {
    const risk = neo.neoRisk(o);
    const rgb = neo.neo2dRiskRGB(risk);
    const ld = Math.min(o.missLD, maxLD);
    const px = Math.round(xOrigin + (ld / maxLD) * (xMax - xOrigin));
    const rows = Math.min(objs.length, 10);
    const ySpacing = Math.round((H * 0.82) / rows);
    const py = Math.round(H * 0.09 + oi * ySpacing + ySpacing * 0.5);
    const diaFrac = Math.min(1, Math.max(0, (o.diaM || 50) / 500));
    const baseRad = o.hazardous ? 2 + Math.round(diaFrac * 2) : 1 + Math.round(diaFrac * 1.5);
    const isActive = oi === activeIdx;
    const flashPulse = 0.5 + 0.5 * Math.sin(wallT * 10);
    const blink = risk === 'red' ? (0.5 + 0.5 * Math.sin(wallT * 8 + oi))
      : risk === 'yellow' ? (0.7 + 0.3 * Math.sin(wallT * 3 + oi)) : 1;
    const rad = isActive ? baseRad + 1 : baseRad;
    for (let dv = -rad; dv <= rad; dv++) {
      for (let du = -rad; du <= rad; du++) {
        const dist2 = du * du + dv * dv;
        if (dist2 > rad * rad + 0.5) continue;
        const pu = px + du, pv = py + dv;
        if (pu < 0 || pu >= W || pv < 0 || pv >= H) continue;
        if (isActive && dist2 > (baseRad - 0.5) * (baseRad - 0.5)) {
          core.setWallPixel(pu, H - 1 - pv, flashPulse, flashPulse, flashPulse);
        } else {
          core.setWallPixel(pu, H - 1 - pv, rgb[0] * blink, rgb[1] * blink, rgb[2] * blink);
        }
      }
    }
    if (px > xOrigin) {
      const steps = px - Math.round(xOrigin);
      for (let s = 2; s < steps; s++) {
        const lu = Math.round(xOrigin) + s, lv = H - 1 - py;
        if (lu < 0 || lu >= W || lv < 0 || lv >= H) continue;
        const dim = isActive ? 0.12 : 0.05;
        const o = (lv * W + lu) * 3;
        core.wallBuf[o] = Math.max(core.wallBuf[o], rgb[0] * dim);
        core.wallBuf[o + 1] = Math.max(core.wallBuf[o + 1], rgb[1] * dim);
        core.wallBuf[o + 2] = Math.max(core.wallBuf[o + 2], rgb[2] * dim);
      }
    }
  });

  // Bottom ticker strip, spanning the full wall width.
  for (let fv = 0; fv < 8; fv++) for (let fu = 0; fu < W; fu++) {
    const o = (fv * W + fu) * 3;
    core.wallBuf[o] *= 0.12; core.wallBuf[o + 1] *= 0.12; core.wallBuf[o + 2] *= 0.12;
  }
  const sv = 3;
  let charPos = 0;
  for (const seg of segments) {
    for (const ch of seg.str) {
      for (let tile = 0; tile < 2; tile++) {
        const u = charPos * charW - Math.floor(wallTickerX) + tile * totalW;
        if (u + 3 >= 0 && u < W) glyphWall(core, W, H, ch, u, sv, seg.r, seg.g, seg.b);
      }
      charPos++;
    }
  }

  // Top-right pulsing risk label.
  const labelStr = level === 'red' ? 'DANGER' : level === 'yellow' ? 'WATCH' : 'CLEAR';
  const labelW = labelStr.length * 4;
  textPulsedWall(core, W, H, labelStr, W - 1 - labelW, Math.round(H * 0.06), riskRGB, pulse);
}

module.exports = effectNeoWall;
module.exports.getStatus = neo.getStatus;
