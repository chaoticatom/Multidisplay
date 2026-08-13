// Ported from effects-livedata.js's neoObjects/neoFetch/neoRisk/
// neoBuildTicker/neoApplyTickerToFace/neoBuildTitleBuf/neoApplyBufToFace/
// effectNEO (lines ~2899-3422). NASA NeoWs "feed" API: one JSON call
// returns up to a 6-day window of near-Earth objects; this keeps the
// closest 12 (by lunar-distance miss), computes a per-object and overall
// risk level (green/yellow/red) from the hazardous flag + miss distance,
// and re-fetches once an hour (matches the browser's
// `(Date.now()/1000-neoLastFetch)>3600` gate).
//
// Shares the same NASA_API_KEY env-var convention apod.js established
// (process.env.NASA_API_KEY || 'DEMO_KEY') instead of duplicating the
// browser's apodApiKey()/localStorage lookup.
//
// No DOM canvas server-side, so both text surfaces the browser built with
// <canvas> (the face-4 "NEO WATCH" title/summary card, and the face-1
// scrolling ticker of tracked objects) are replaced with the same 3x5
// PIXEL_FONT bitmap-glyph approach weather.js/iss.js already use for
// on-face text - same local-glyph-helper convention as iss.js's
// issGlyph/issText, not a new pattern. The 2D-panel bottom ticker
// explicitly reuses that same 3x5 font + scrolling-glyph technique
// weather.js's wxGlyph/wxText use for its city-name ticker, per the
// browser source's own comment ("same 3×5 bitmap font as weather city
// name").
'use strict';

const { PIXEL_FONT } = require('./weather/font');

const NASA_API_KEY = process.env.NASA_API_KEY || 'DEMO_KEY';
const NEO_REFRESH_SEC = 3600; // matches the browser's 1-hour re-fetch gate

// ── State ────────────────────────────────────────────────────────────────
let neoObjects = [];
let neoFetching = false;
let neoLastFetch = 0; // seconds
let neoError = '';
let neoT = 0;
let neoTickerScrollX = 0;
let neo2dTickerX = 0;
let lastRefreshOpt = null;

const status = { text: 'Not fetched yet' };
function getStatus() {
  const closest = neoObjects[0];
  return {
    text: status.text,
    count: neoObjects.length,
    closest: closest ? { name: closest.name, missLD: closest.missLD } : null,
    risk: neoOverallRisk(),
    fetching: neoFetching,
    error: neoError || null,
  };
}

// ── Risk classification ─────────────────────────────────────────────────
function neoRisk(o) {
  if (o.hazardous && o.missLD < 5) return 'red';
  if (o.hazardous || o.missLD < 10) return 'yellow';
  return 'green';
}
function neoRiskRGB(level) {
  if (level === 'red') return [1, 0.08, 0.08];
  if (level === 'yellow') return [1, 0.78, 0.05];
  return [0.1, 0.95, 0.25];
}
// Softer palette for the 2D panel (amber instead of garish yellow).
function neo2dRiskRGB(level) {
  if (level === 'red') return [1, 0.1, 0.05];
  if (level === 'yellow') return [0.9, 0.45, 0.05];
  return [0.1, 0.75, 0.2];
}
function neoOverallRisk() {
  if (!neoObjects.length) return 'green';
  if (neoObjects.some((o) => neoRisk(o) === 'red')) return 'red';
  if (neoObjects.some((o) => neoRisk(o) === 'yellow')) return 'yellow';
  return 'green';
}

// ── Fetch ────────────────────────────────────────────────────────────────
function neoFetch() {
  if (neoFetching) return;
  neoFetching = true; neoError = '';
  status.text = 'Fetching near-Earth object data…';
  const start = new Date();
  const end = new Date(start.getTime() + 6 * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${fmt(start)}&end_date=${fmt(end)}&api_key=${NASA_API_KEY}`;

  (async () => {
    let r;
    try { r = await fetch(url); }
    catch (fe) { throw new Error('NEO fetch failed — check internet connection'); }
    if (!r.ok) throw new Error('NASA API error: ' + r.status);
    const d = await r.json();
    const byDate = d.near_earth_objects || {};
    let list = [];
    for (const dateKey in byDate) {
      for (const o of byDate[dateKey]) {
        const cad = (o.close_approach_data && o.close_approach_data[0]) || null;
        if (!cad) continue;
        const dEst = o.estimated_diameter && o.estimated_diameter.meters;
        const diaM = dEst ? (dEst.estimated_diameter_min + dEst.estimated_diameter_max) / 2 : 0;
        list.push({
          name: (o.name || '').replace(/[()]/g, ''),
          hazardous: !!o.is_potentially_hazardous_asteroid,
          missLD: parseFloat(cad.miss_distance.lunar),
          missKm: parseFloat(cad.miss_distance.kilometers),
          velKmS: parseFloat(cad.relative_velocity.kilometers_per_second),
          diaM: Math.round(diaM),
          date: cad.close_approach_date,
        });
      }
    }
    list.sort((a, b) => a.missLD - b.missLD);
    neoObjects = list.slice(0, 12);
    neoLastFetch = Date.now() / 1000;
    status.text = `${neoObjects.length} objects tracked`;
  })().catch((err) => {
    neoError = err.message || 'fetch failed';
    neoLastFetch = Date.now() / 1000 - (NEO_REFRESH_SEC - 60); // retry in ~60s, matching the browser's -3540 trick
    status.text = '✕ ' + neoError;
    if (process.env.NEO_DEBUG) console.error('[neo] fetch error:', neoError);
  }).finally(() => {
    neoFetching = false;
  });
}

// ── 3x5 bitmap text helpers (same convention as iss.js's issGlyph/issText) ─
function neoGlyph(core, face, ch, su, sv, tr, tg, tb) {
  const { SIZE: S, faceMap, colBuf } = core;
  const rows = PIXEL_FONT[ch] || PIXEL_FONT[ch.toUpperCase()]; if (!rows) return 4;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = sv + (4 - row);
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
      if (tr > colBuf[idx * 3]) colBuf[idx * 3] = tr;
      if (tg > colBuf[idx * 3 + 1]) colBuf[idx * 3 + 1] = tg;
      if (tb > colBuf[idx * 3 + 2]) colBuf[idx * 3 + 2] = tb;
    }
  }
  return 4;
}
function neoText(core, face, str, su, sv, tr, tg, tb) {
  let u = su;
  for (const ch of str) { u += neoGlyph(core, face, ch, u, sv, tr, tg, tb); if (u >= core.SIZE) break; }
}
function neoTextCentered(core, face, str, sv, tr, tg, tb) {
  const w = str.length * 4;
  neoText(core, face, str, Math.floor((core.SIZE - w) / 2), sv, tr, tg, tb);
}

// Builds the scrolling-ticker segment list (used by both the cube face-1
// ticker and the 2D bottom ticker) — same "name  LD  dia  vel" line the
// browser's neoBuildTicker() canvas text produced, one segment per object.
function neoBuildSegments(rgbFn) {
  const objs = neoObjects.slice(0, 12);
  const segments = [];
  objs.forEach((o, oi) => {
    const risk = neoRisk(o);
    const rgb = rgbFn(risk);
    const flag = risk === 'red' ? '!!' : risk === 'yellow' ? '!' : '.';
    segments.push({ str: `${flag} ${o.name} ${o.missLD.toFixed(1)}LD ${o.diaM}m ${o.velKmS.toFixed(1)}KM/S`, r: rgb[0], g: rgb[1], b: rgb[2], neoIdx: oi });
    if (oi < objs.length - 1) segments.push({ str: '   /   ', r: 0.25, g: 0.25, b: 0.25, neoIdx: -1 });
  });
  if (!segments.length) segments.push({ str: 'NO DATA', r: 0.5, g: 0.5, b: 0.5, neoIdx: -1 });
  return segments;
}

// Cube face-1 scrolling ticker (single risk-coloured line, like the
// browser's neoApplyTickerToFace, just drawn with neoGlyph instead of a
// pre-rendered canvas strip).
function neoDrawTicker(core, face, dt) {
  const level = neoOverallRisk();
  const rgb = neoRiskRGB(level);
  let text;
  if (!neoObjects.length) {
    text = '   NEO WATCH  -  NO DATA   ';
  } else {
    text = neoObjects.map((o) => {
      const r = neoRisk(o);
      const flag = r === 'red' ? '!!' : r === 'yellow' ? '!' : '.';
      return `${flag} ${o.name}  ${o.missLD.toFixed(1)}LD  ${o.diaM}M  ${o.velKmS.toFixed(1)}KM/S`;
    }).join('   ///   ') + '   ///   ';
  }
  text = ('   ' + text).toUpperCase();
  const S = core.SIZE;
  const textW = text.length * 4;
  neoTickerScrollX = (neoTickerScrollX + dt * 22) % (textW + S);
  const offset = Math.floor(S - neoTickerScrollX);
  neoText(core, face, text, offset, Math.floor(S / 2) - 2, rgb[0], rgb[1], rgb[2]);
}

// Cube face-4 "NEO WATCH" title/summary card — replaces the browser's
// canvas-rendered neoBuildTitleBuf().
function neoDrawTitleCard(core, face, level) {
  const S = core.SIZE;
  const rgb = neoRiskRGB(level);
  neoTextCentered(core, face, 'NEO WATCH', 1, 1, 1, 1);
  neoTextCentered(core, face, level.toUpperCase(), Math.floor(S * 0.42), rgb[0], rgb[1], rgb[2]);
  const closest = neoObjects[0];
  if (closest) {
    neoTextCentered(core, face, `${closest.missLD.toFixed(1)}LD`, Math.floor(S * 0.68), 0.73, 0.73, 0.73);
    neoTextCentered(core, face, `${closest.diaM}M DIA`, Math.floor(S * 0.84), 0.73, 0.73, 0.73);
  } else {
    neoTextCentered(core, face, 'NO DATA', Math.floor(S * 0.68), 0.73, 0.73, 0.73);
  }
}

// ── Starfield background (shared seeded-noise trick used elsewhere in the
// codebase, e.g. iss.js's face-0 starfield — not worth a shared helper for
// a single-effect-count reuse, so kept local per the task note). ─────────
function neoDrawStarfield(core, tt) {
  const { N, colBuf } = core;
  for (let i = 0; i < N; i++) {
    const seed = ((i * 2654435761) >>> 0) / 4294967296;
    if (seed < 0.014) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.4 + seed * 60));
      const br = seed * 36 * twinkle;
      colBuf[i * 3] = br; colBuf[i * 3 + 1] = br; colBuf[i * 3 + 2] = br * 1.1;
    }
  }
}

// ── 2D panel mode: Earth peeking from the left, radar view + ticker ─────
function neoDraw2D(core, dt, tt, level, riskRGB, pulse) {
  const { SIZE: S, faceMap, colBuf } = core;
  const face = 0;
  const ecx = Math.round(S * -0.28), ecy = Math.round(S * 0.5);
  const earthRad = Math.round(S * 0.55);
  const atmRad = earthRad + Math.round(S * 0.07);
  const maxLD = 60;
  const xOrigin = ecx + earthRad + Math.round(S * 0.02);
  const xMax = S - 2;

  // Distance rings every 10 LD
  for (let ring = 10; ring <= maxLD; ring += 10) {
    const rx = (ring / maxLD) * (xMax - xOrigin) + xOrigin;
    const ringBr = 0.04;
    const rxi = Math.round(rx);
    if (rxi < 0 || rxi >= S) continue;
    for (let v = 0; v < S; v++) {
      const idx = faceMap[face][v * S + rxi]; if (idx < 0) continue;
      if (Math.floor(v / 3) % 2 === 0) { colBuf[idx * 3] = ringBr; colBuf[idx * 3 + 1] = ringBr; colBuf[idx * 3 + 2] = ringBr * 0.5; }
    }
  }

  // Earth
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const idx = faceMap[face][(S - 1 - v) * S + u]; if (idx < 0) continue;
      const dx = u - ecx, dy = v - ecy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < atmRad && d >= earthRad) {
        const t2 = 1 - (d - earthRad) / (atmRad - earthRad);
        const atm = t2 * t2 * 0.35;
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], atm * 0.3);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], atm * 0.6);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], atm);
        continue;
      }
      if (d >= earthRad) continue;
      const nx = dx / earthRad, ny = dy / earthRad;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = nx * 0.35 + ny * (-0.25) + nz * 0.9;
      const lightFactor = Math.max(0.02, Math.min(1, lit * 1.1));
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
      colBuf[idx * 3] = r * lightFactor;
      colBuf[idx * 3 + 1] = g * lightFactor;
      colBuf[idx * 3 + 2] = b * lightFactor;
    }
  }

  // Build ticker segments & determine active NEO
  const objs = neoObjects.slice(0, 12);
  const charW = 4;
  const segments = neoBuildSegments(neo2dRiskRGB);
  const totalTickerChars = segments.reduce((s, seg) => s + seg.str.length, 0);
  const totalW = totalTickerChars * charW + S;
  neo2dTickerX = (neo2dTickerX + dt * 22) % totalW;

  const targetPx = (Math.floor(neo2dTickerX) + Math.floor(S * 0.5)) % totalW;
  let activeNeoIdx = -1, cp2 = 0;
  for (const seg of segments) {
    const segPx = cp2 * charW;
    if (targetPx >= segPx && targetPx < segPx + seg.str.length * charW) {
      if (seg.neoIdx >= 0) activeNeoIdx = seg.neoIdx;
      break;
    }
    cp2 += seg.str.length;
  }

  // NEO radar dots
  objs.forEach((o, oi) => {
    const risk = neoRisk(o);
    const rgb = neo2dRiskRGB(risk);
    const ld = Math.min(o.missLD, maxLD);
    const px = Math.round(xOrigin + (ld / maxLD) * (xMax - xOrigin));
    const rows = Math.min(objs.length, 10);
    const ySpacing = Math.round((S * 0.82) / rows);
    const py = Math.round(S * 0.09 + oi * ySpacing + ySpacing * 0.5);
    const diaFrac = Math.min(1, Math.max(0, (o.diaM || 50) / 500));
    const baseRad = o.hazardous ? 2 + Math.round(diaFrac * 2) : 1 + Math.round(diaFrac * 1.5);
    const isActive = oi === activeNeoIdx;
    const flashPulse = 0.5 + 0.5 * Math.sin(neoT * 10);
    const blink = risk === 'red' ? (0.5 + 0.5 * Math.sin(neoT * 8 + oi))
      : risk === 'yellow' ? (0.7 + 0.3 * Math.sin(neoT * 3 + oi)) : 1;
    const rad = isActive ? baseRad + 1 : baseRad;
    for (let dv = -rad; dv <= rad; dv++) {
      for (let du = -rad; du <= rad; du++) {
        const dist2 = du * du + dv * dv;
        if (dist2 > rad * rad + 0.5) continue;
        const pu = px + du, pv = py + dv;
        if (pu < 0 || pu >= S || pv < 0 || pv >= S) continue;
        const idx = faceMap[face][(S - 1 - pv) * S + pu]; if (idx < 0) continue;
        if (isActive && dist2 > (baseRad - 0.5) * (baseRad - 0.5)) {
          colBuf[idx * 3] = flashPulse; colBuf[idx * 3 + 1] = flashPulse; colBuf[idx * 3 + 2] = flashPulse;
        } else {
          colBuf[idx * 3] = rgb[0] * blink; colBuf[idx * 3 + 1] = rgb[1] * blink; colBuf[idx * 3 + 2] = rgb[2] * blink;
        }
      }
    }
    if (px > xOrigin) {
      const steps = px - Math.round(xOrigin);
      for (let s = 2; s < steps; s++) {
        const lu = Math.round(xOrigin) + s, lv = py;
        if (lu < 0 || lu >= S || lv < 0 || lv >= S) continue;
        const idx = faceMap[face][(S - 1 - lv) * S + lu]; if (idx < 0) continue;
        const dim = isActive ? 0.12 : 0.05;
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], rgb[0] * dim);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], rgb[1] * dim);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], rgb[2] * dim);
      }
    }
  });

  // Bottom ticker strip (3x5 font, same technique as weather's wxGlyph/wxText)
  for (let fv = 0; fv < 8; fv++) for (let fu = 0; fu < S; fu++) {
    const idx = faceMap[face][fv * S + fu]; if (idx < 0) continue;
    colBuf[idx * 3] *= 0.12; colBuf[idx * 3 + 1] *= 0.12; colBuf[idx * 3 + 2] *= 0.12;
  }
  const sv = 3;
  let charPos = 0;
  for (const seg of segments) {
    for (const ch of seg.str) {
      for (let tile = 0; tile < 2; tile++) {
        const u = charPos * charW - Math.floor(neo2dTickerX) + tile * totalW;
        if (u + 3 >= 0 && u < S) neoGlyph(core, face, ch, u, sv, seg.r, seg.g, seg.b);
      }
      charPos++;
    }
  }

  // Top-right pulsing risk label
  const labelStr = level === 'red' ? 'DANGER' : level === 'yellow' ? 'WATCH' : 'CLEAR';
  const labelW = labelStr.length * 4;
  const labelSu = S - 1 - labelW;
  neoTextPulsed(core, face, labelStr, labelSu, Math.round(S * 0.06), riskRGB, pulse);
}

// Like neoText but scales all three channels by `pulse` — used for the 2D
// panel's flashing risk label (the browser drew this with an rgba() alpha
// via canvas; here we just dim the glyph colour directly).
function neoTextPulsed(core, face, str, su, sv, rgb, pulse) {
  neoText(core, face, str, su, sv, rgb[0] * pulse, rgb[1] * pulse, rgb[2] * pulse);
}

// ── Cube (3D) mode: Earth+ring on face 0, blips on faces 2/3, title on
// face 4, ticker on face 1. ──────────────────────────────────────────────
function neoDrawCube(core, level, riskRGB, pulse, tt) {
  const { SIZE: S, faceMap, colBuf } = core;
  const cx0 = S / 2, cy0 = S / 2;
  const earthRad = S * 0.3, ringRad = S * 0.42;
  for (let v = 0; v < S; v++) {
    for (let u = 0; u < S; u++) {
      const idx = faceMap[0][v * S + u]; if (idx < 0) continue;
      const dx = u - cx0, dy = v - cy0, d = Math.sqrt(dx * dx + dy * dy);
      if (d < earthRad) {
        const nx = dx / earthRad, ny = dy / earthRad;
        const land = Math.sin(nx * 5 + tt * 0.15) * Math.cos(ny * 4) > 0.25;
        if (land) { colBuf[idx * 3] = 0.07; colBuf[idx * 3 + 1] = 0.45; colBuf[idx * 3 + 2] = 0.12; }
        else { colBuf[idx * 3] = 0.05; colBuf[idx * 3 + 1] = 0.18; colBuf[idx * 3 + 2] = 0.55; }
        const shade = 1 - Math.max(0, d / earthRad) * 0.3;
        colBuf[idx * 3] *= shade; colBuf[idx * 3 + 1] *= shade; colBuf[idx * 3 + 2] *= shade;
      } else if (d > ringRad - 1.2 && d < ringRad + 1.2) {
        colBuf[idx * 3] = riskRGB[0] * pulse; colBuf[idx * 3 + 1] = riskRGB[1] * pulse; colBuf[idx * 3 + 2] = riskRGB[2] * pulse;
      }
    }
  }

  const sideFaces = [2, 3];
  for (let f = 0; f < sideFaces.length; f++) {
    const face = sideFaces[f];
    const objs = neoObjects.slice(0, 6);
    objs.forEach((o, oi) => {
      const r = neoRisk(o);
      const rgb = neoRiskRGB(r);
      const closeness = Math.max(0, 1 - Math.min(1, o.missLD / 40));
      const bx = 2 + ((oi * 7 + f * 3) % (S - 4));
      const by = Math.round(S * 0.15 + (S * 0.7) * (oi / Math.max(1, objs.length - 1)));
      const rad = 1 + Math.round(closeness * 2.5);
      const blink = 0.6 + 0.4 * Math.sin(neoT * (2 + oi) + oi);
      for (let dv = -rad; dv <= rad; dv++) {
        for (let du = -rad; du <= rad; du++) {
          if (du * du + dv * dv > rad * rad) continue;
          const u = bx + du, v = by + dv;
          if (u < 0 || u >= S || v < 0 || v >= S) continue;
          const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
          colBuf[idx * 3] = rgb[0] * blink; colBuf[idx * 3 + 1] = rgb[1] * blink; colBuf[idx * 3 + 2] = rgb[2] * blink;
        }
      }
    });
  }

  neoDrawTitleCard(core, 4, level);
}

// ── Effect entry point ───────────────────────────────────────────────────
function effectNEO(core, dt) {
  neoT += dt;

  const opts = core.effectOptions?.neo || {};
  if (opts.refreshRequestedAt && opts.refreshRequestedAt !== lastRefreshOpt) {
    lastRefreshOpt = opts.refreshRequestedAt;
    neoLastFetch = 0;
    if (!neoFetching) neoFetch();
  }
  if (!neoObjects.length && !neoFetching && (Date.now() / 1000 - neoLastFetch) > NEO_REFRESH_SEC) neoFetch();

  const { N, colBuf } = core;
  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  const tt = Date.now() * 0.001;
  neoDrawStarfield(core, tt);

  const level = neoOverallRisk();
  const riskRGB = neoRiskRGB(level);
  const pulse = 0.55 + 0.45 * Math.sin(neoT * (level === 'red' ? 6 : level === 'yellow' ? 3 : 1.4));

  const is2D = core.panelMode === '2d';
  if (is2D) {
    neoDraw2D(core, dt, tt, level, riskRGB, pulse);
  } else {
    neoDrawCube(core, level, riskRGB, pulse, tt);
    neoDrawTicker(core, 1, dt * (core.speedMult || 1));
  }
}

module.exports = effectNEO;
module.exports.getStatus = getStatus;
// Reused by neoWall.js, which generalizes neoDraw2D's composition to
// wallW x wallH (same approach weatherWall.js used for weather's is2D
// branch) rather than re-deriving the fetch/risk-classification logic
// that composition depends on.
module.exports.neoFetch = neoFetch;
module.exports.neoRisk = neoRisk;
module.exports.neoRiskRGB = neoRiskRGB;
module.exports.neo2dRiskRGB = neo2dRiskRGB;
module.exports.neoOverallRisk = neoOverallRisk;
module.exports.neoBuildSegments = neoBuildSegments;
module.exports.getObjects = () => neoObjects;
