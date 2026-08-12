// Timer ("alarm") engine - ported from ui.js's "ALARM SYSTEM" section
// (alarmCheck/alarmFire ~line 913-1000, renderGiantSun ~line 1002,
// renderAlarmSunrise ~line 1118, the countdown/message text renderers used
// from animate() ~line 2974-3320).
//
// Architecturally the same category as effects/overlays.js: this is NOT a
// selectable effect, it's global state that runs every tick regardless of
// which effect is selected, checked on its own 2-second interval (matches
// the browser's `if(alarmT>2){alarmT=0;alarmCheck();}`), with its own
// persisted state file (alarmConfig.js) and WS commands (wsServer.js).
// See app.js's tick loop for exactly where each exported function below is
// called and why - the call ORDER matters and mirrors animate()'s order
// precisely (see that function's comments for the fidelity reasoning):
//   1. renderMainMessage()   - writes colBuf directly if phase 'main'
//   2. (app.js) skip-or-run the normal EFFECTS[state.effect], gated by isBlockingNormalEffect()
//   3. (app.js) runOverlays() - global overlays, always
//   4. applyDonePhase()      - blanks colBuf + brightness if phase 'done'
//   5. renderPrePhase()      - ramp + sunrise/giant-sun/wind-down rendering, phase 'pre' only; overwrites colBuf
//
// Scope boundaries (documented, not faked - same pattern as cam.js/
// fireworks.js/video.js's own out-of-scope pieces):
//   - triggerType==='playlist': pi-native has no playlist engine at all
//     (checked effects/index.js and app.js - neither has one). A
//     playlist-type alarm is treated exactly like alarmFire()'s own
//     else-branch for "no effect selected": message-on-black, current
//     colBuf otherwise left alone (matches the original's actual
//     behaviour for that branch, not a made-up substitute).
//   - prealarm.effectRise (browser: alarm wakes into a chosen live effect,
//     e.g. weather with a specific city, or internet radio) and
//     prealarm.wxRise (weather-specific sunrise) are NOT ported. Both
//     depend on browser-only integration points the effectRise code path
//     reaches into (radioPlay()/wxFetch()/a dozen per-effect option
//     globals saved-and-restored around a single EFFECTS[efKey] call) that
//     have no pi-native equivalent to hang the same logic off. Rather than
//     half-port a fragile save/restore-13-globals shim, an alarm with
//     effectRise or wxRise set falls back to the plain
//     renderAlarmSunrise() dawn-sky renderer - same "sensible default, not
//     a fake" spirit as the playlist boundary above. giantSun and the
//     plain sunrise are fully ported and are the two pre-alarm visuals
//     pi-native's timer editor actually offers (see index.html's
//     al-effect-rise-* markup, which was intentionally NOT copied into
//     pi-native's alarm-modal for this reason).
const { runOverlays } = require('./overlays');

const SIDE = [2, 0, 3, 1]; // east, south, west, north - panoramic side-face order, matches ui.js
const AL_CHECK_INTERVAL = 2; // seconds, matches the browser's `if(alarmT>2)`

// 5x7 bitmap font for the main-alarm/wind-down message (ui.js's _bigGlyphs,
// ported verbatim - each entry is 7 rows of a 5-bit row, MSB=left).
const BIG_GLYPHS = {
  A: [0x04, 0x0a, 0x11, 0x1f, 0x11, 0x11, 0x11], B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e], D: [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f], F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f], H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e], J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11], L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11], N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d], R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e], T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e], V: [0x11, 0x11, 0x11, 0x11, 0x0a, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11], X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04], Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e], 1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f], 3: [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02], 5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e], 7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e], 9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0], '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '.': [0, 0, 0, 0, 0, 0, 0x04], ',': [0, 0, 0, 0, 0, 0x04, 0x08],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0x00, 0x04],
};

const DIGIT_PATTERNS = {
  0: [[1, 1, 1], [1, 0, 1], [1, 0, 1], [1, 0, 1], [1, 1, 1]],
  1: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
  2: [[1, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 0], [1, 1, 1]],
  3: [[1, 1, 1], [0, 0, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1]],
  4: [[1, 0, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1], [0, 0, 1]],
  5: [[1, 1, 1], [1, 0, 0], [1, 1, 1], [0, 0, 1], [1, 1, 1]],
  6: [[1, 1, 1], [1, 0, 0], [1, 1, 1], [1, 0, 1], [1, 1, 1]],
  7: [[1, 1, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]],
  8: [[1, 1, 1], [1, 0, 1], [1, 1, 1], [1, 0, 1], [1, 1, 1]],
  9: [[1, 1, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1]],
  ':': [[0, 0, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0], [0, 0, 0]],
};

function cleanMessage(msg) {
  return (msg || 'Good Morning').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^\w\s!.,?]/g, '');
}

function wrapTwoLines(msg) {
  const words = cleanMessage(msg).trim().split(/\s+/);
  const line1 = [], line2 = [];
  const half = Math.ceil(words.length / 2);
  for (let i = 0; i < words.length; i++) (i < half ? line1 : line2).push(words[i]);
  const lines = [line1.join(' ')];
  if (line2.length) lines.push(line2.join(' '));
  return lines;
}

// Draws a two-line big-glyph message on the 4 side faces. `shadowed`
// matches the main-alarm renderer's dark drop-shadow pass (ui.js draws a
// shadow pass then a bright pass); the wind-down message renderer skips
// the shadow pass and always draws unmirrored (mir=false) - ported
// faithfully, not unified, since the two call sites genuinely differ.
function drawBigMessage(core, message, brightVal, { shadow = true, mirrored = true } = {}) {
  const { SIZE: S, faceMap, colBuf } = core;
  const lines = wrapTwoLines(message);
  const charW = 6, lineH = 9;
  const totalH = lines.length * lineH;
  const vStart = Math.round((S + totalH) / 2);

  for (let fi = 0; fi < 4; fi++) {
    const face = SIDE[fi];
    const mir = mirrored && (face === 2 || face === 3);

    if (shadow) {
      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineW = line.length * charW - 1;
        const startU = Math.round((S - lineW) / 2);
        const lineV = vStart - li * lineH;
        for (let ci = 0; ci < line.length; ci++) {
          const glyph = BIG_GLYPHS[line[ci]]; if (!glyph) continue;
          const charU = mir ? startU + (line.length - 1 - ci) * charW : startU + ci * charW;
          for (let row = 0; row < 7; row++) {
            const bits = glyph[row];
            const pv = lineV - (row + 1);
            for (let col = 0; col < 5; col++) {
              if (!((bits >> (4 - col)) & 1)) continue;
              const pu = mir ? charU + (4 - col) : charU + col;
              for (let sy = -1; sy <= 1; sy++) for (let sx = -1; sx <= 1; sx++) {
                if (sy === 0 && sx === 0) continue;
                const fv = pv + sy, fu = pu + sx;
                if (fu < 0 || fu >= S || fv < 0 || fv >= S) continue;
                const idx = faceMap[face][fv * S + fu]; if (idx < 0) continue;
                colBuf[idx * 3] *= 0.15; colBuf[idx * 3 + 1] *= 0.15; colBuf[idx * 3 + 2] *= 0.15;
              }
            }
          }
        }
      }
    }

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const lineW = line.length * charW - 1;
      const startU = Math.round((S - lineW) / 2);
      const lineV = vStart - li * lineH;
      for (let ci = 0; ci < line.length; ci++) {
        const glyph = BIG_GLYPHS[line[ci]]; if (!glyph) continue;
        const charU = mir ? startU + (line.length - 1 - ci) * charW : startU + ci * charW;
        for (let row = 0; row < 7; row++) {
          const bits = glyph[row];
          const pv = lineV - (row + 1);
          if (pv < 0 || pv >= S) continue;
          for (let col = 0; col < 5; col++) {
            if (!((bits >> (4 - col)) & 1)) continue;
            const pu = mir ? charU + (4 - col) : charU + col;
            if (pu < 0 || pu >= S) continue;
            const idx = faceMap[face][pv * S + pu]; if (idx < 0) continue;
            colBuf[idx * 3] = brightVal; colBuf[idx * 3 + 1] = brightVal; colBuf[idx * 3 + 2] = brightVal;
          }
        }
      }
    }
  }
}

// Ported verbatim from ui.js's renderCountdown() - small mm:ss digits.
function renderCountdown(core, timeStr, mirFaces) {
  const { SIZE: S, faceMap, colBuf } = core;
  if (!mirFaces) mirFaces = [2, 3];
  const scale = 2;
  for (let fi = 0; fi < 4; fi++) {
    const face = SIDE[fi];
    const mir = mirFaces.includes(face);
    const chars = timeStr.length;
    const charW = 3 * scale + scale;
    const totalW = chars * charW - scale;
    const startU = Math.round((S - totalW) / 2);
    for (let ci = 0; ci < chars; ci++) {
      const ch = timeStr[ci];
      const pattern = DIGIT_PATTERNS[ch] || [];
      const charIdx = mir ? chars - 1 - ci : ci;
      const baseU = startU + charIdx * charW;
      for (let row = 0; row < 5; row++) {
        const bits = pattern[row] || [0, 0, 0];
        for (let col = 0; col < 3; col++) {
          if (!bits[col]) continue;
          const srcCol = mir ? 2 - col : col;
          for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
            const pu = baseU + srcCol * scale + dx;
            const pv = (4 - row) * scale + dy + 1;
            if (pu < 0 || pu >= S || pv < 0 || pv >= S) continue;
            const idx = faceMap[face][pv * S + pu]; if (idx < 0) continue;
            colBuf[idx * 3] = 1.0; colBuf[idx * 3 + 1] = 1.0; colBuf[idx * 3 + 2] = 1.0;
          }
        }
      }
    }
  }
}

// Ported verbatim from ui.js's renderGiantSun().
function renderGiantSun(core, progress, startBrightPct) {
  const { SIZE: S, N, faceMap, colBuf } = core;
  const S1 = S - 1;
  const startBr = Math.max(startBrightPct / 100, 0.04);
  const bgBright = progress < 0.25
    ? startBr * 0.4 + (progress / 0.25) * (1 - startBr * 0.4) * 0.5
    : Math.min(1, 0.5 + (progress - 0.25) / 0.65 * 0.5);
  const tt = Date.now() * 0.001;

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  const p = progress;
  for (const f of [4, ...SIDE]) {
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const idx = faceMap[f][v * S + u]; if (idx < 0) continue;
      const vFrac = v / S1;
      const dBotR = 220 / 255, dBotG = 80 / 255, dBotB = 15 / 255;
      const dTopR = 10 / 255, dTopG = 8 / 255, dTopB = 35 / 255;
      const skyR = 90 / 255, skyG = 170 / 255, skyB = 255 / 255;
      const dawnR = dBotR + (dTopR - dBotR) * vFrac;
      const dawnG = dBotG + (dTopG - dBotG) * vFrac;
      const dawnB = dBotB + (dTopB - dBotB) * vFrac;
      const r = dawnR + (skyR - dawnR) * p;
      const g = dawnG + (skyG - dawnG) * p;
      const b = dawnB + (skyB - dawnB) * p;
      colBuf[idx * 3] = r * bgBright; colBuf[idx * 3 + 1] = g * bgBright; colBuf[idx * 3 + 2] = b * bgBright;
    }
  }

  if (progress > 0.08) {
    const sunP = (progress - 0.08) / 0.92;
    const sunRad = Math.round(S * 0.30);
    const sunCX = Math.round(S / 2);
    const sunCY = Math.round(-sunRad * 1.2 + sunP * (S * 0.55 + sunRad * 1.2));

    for (let fi = 0; fi < 4; fi++) {
      const face = SIDE[fi];

      const glowRad = sunRad * 3;
      for (let dv = -glowRad; dv <= glowRad; dv++) {
        const v = sunCY + dv; if (v < 0 || v >= S) continue;
        for (let du = -glowRad; du <= glowRad; du++) {
          const u = sunCX + du; if (u < 0 || u >= S) continue;
          const d = Math.sqrt(du * du + dv * dv);
          if (d > glowRad || d <= sunRad) continue;
          const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
          const gf = (d - sunRad) / (glowRad - sunRad);
          const glow = Math.pow(1 - gf, 2.2) * 0.5;
          colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + glow * 1.0);
          colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + glow * 0.65);
          colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + glow * 0.08);
        }
      }

      const numRays = 12;
      const rayLen = Math.round(sunRad * 2.5);
      for (let ri = 0; ri < numRays; ri++) {
        const baseAng = (ri / numRays) * Math.PI * 2;
        const ang = baseAng + Math.sin(tt * 0.8 + ri * 1.7) * 0.12;
        const flicker = 0.6 + 0.4 * Math.sin(tt * 1.5 + ri * 2.1);
        for (let d = sunRad + 1; d < sunRad + rayLen; d++) {
          const fade = (1 - (d - sunRad) / rayLen) * 0.25 * flicker;
          if (fade < 0.01) continue;
          const rv = Math.round(sunCY + Math.sin(ang) * d);
          const ru = Math.round(sunCX + Math.cos(ang) * d);
          if (rv < 0 || rv >= S || ru < 0 || ru >= S) continue;
          const idx = faceMap[face][rv * S + ru]; if (idx < 0) continue;
          colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + fade * 1.0);
          colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + fade * 0.8);
          colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + fade * 0.1);
        }
      }

      for (let dv = -sunRad; dv <= sunRad; dv++) {
        const v = sunCY + dv; if (v < 0 || v >= S) continue;
        for (let du = -sunRad; du <= sunRad; du++) {
          const u = sunCX + du; if (u < 0 || u >= S) continue;
          const d = Math.sqrt(du * du + dv * dv);
          if (d > sunRad) continue;
          const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
          const edge = d / sunRad;
          const e2 = edge * edge;
          const cr = 1.0, cg = 0.92 - e2 * 0.35, cb = 0.2 - e2 * 0.18;
          const shimmer = 0.96 + 0.04 * Math.sin(tt * 2.5 + du * 0.12 + dv * 0.12);
          colBuf[idx * 3] = cr * shimmer; colBuf[idx * 3 + 1] = cg * shimmer; colBuf[idx * 3 + 2] = cb * shimmer;
        }
      }
    }
  }
}

// Ported verbatim from ui.js's renderAlarmSunrise().
function renderAlarmSunrise(core, progress, startBrightPct) {
  const { SIZE: S, N, faceMap, colBuf } = core;
  const bright = Math.max(startBrightPct / 100, Math.pow(progress, 1.8));

  const skyStops = [
    [0.00, [2, 3, 18]], [0.15, [8, 5, 22]], [0.30, [40, 12, 8]],
    [0.50, [90, 40, 10]], [0.70, [180, 90, 20]], [0.85, [50, 130, 220]], [1.00, [20, 120, 255]],
  ];
  let sa = skyStops[0], sb = skyStops[skyStops.length - 1];
  for (let i = 0; i < skyStops.length - 1; i++) {
    if (progress >= skyStops[i][0] && progress < skyStops[i + 1][0]) { sa = skyStops[i]; sb = skyStops[i + 1]; break; }
  }
  const sm = (progress - sa[0]) / (sb[0] - sa[0] || 1);
  const skyR = ((sa[1][0] + (sb[1][0] - sa[1][0]) * sm) / 255) * bright;
  const skyG = ((sa[1][1] + (sb[1][1] - sa[1][1]) * sm) / 255) * bright;
  const skyB = ((sa[1][2] + (sb[1][2] - sa[1][2]) * sm) / 255) * bright;

  const sunElev = Math.max(0, progress * 0.5 - 0.05);
  const HORIZ = 0.32;

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[4][v * S + u]; if (idx < 0) continue;
    colBuf[idx * 3] = skyR; colBuf[idx * 3 + 1] = skyG; colBuf[idx * 3 + 2] = skyB;
  }
  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[5][v * S + u]; if (idx < 0) continue;
    colBuf[idx * 3] = 0.04 * bright; colBuf[idx * 3 + 1] = 0.06 * bright; colBuf[idx * 3 + 2] = 0.01 * bright;
  }

  for (let fi = 0; fi < 4; fi++) {
    const face = SIDE[fi];
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
      let r, g, b;
      const vf = v / S;
      if (vf < HORIZ) { r = 0.04 * bright; g = 0.07 * bright; b = 0.02 * bright; } else {
        const sf = (vf - HORIZ) / (1 - HORIZ);
        const horizGlow = Math.max(0, 1 - progress / 0.6) * 0.8;
        r = Math.min(1, (skyR + horizGlow * 0.9) * (1 - sf * 0.4));
        g = Math.min(1, (skyG + horizGlow * 0.25) * (1 - sf * 0.3));
        b = Math.min(1, skyB * (1 - sf * 0.2));
      }
      colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b;
    }
  }

  const sunV = Math.round((HORIZ + sunElev * (1 - HORIZ)) * (S - 1));
  const sunU = Math.round(S * 0.5);
  const sunR = Math.min(1, (0.6 + progress * 0.4) * bright);
  const sunGlow = Math.max(0, progress - 0.15);
  for (let dv = -8; dv <= 8; dv++) for (let du = -8; du <= 8; du++) {
    const dist = Math.sqrt(du * du + dv * dv);
    const fv = sunV + dv, fu = sunU + du;
    if (fv < 0 || fv >= S || fu < 0 || fu >= S) continue;
    const idx = faceMap[0][fv * S + fu]; if (idx < 0) continue;
    let rb = 0, gb = 0, bb = 0;
    if (dist < 2.5) { rb = sunR; gb = sunR * 0.92; bb = sunR * 0.5; } else if (dist < 4.5) {
      const f2 = (1 - (dist - 2.5) / 2) * sunR * 0.85; rb = f2; gb = f2 * 0.8; bb = f2 * 0.2;
    } else {
      const g2 = Math.max(0, (1 - (dist - 4.5) / 4) * sunGlow * 0.5); rb = g2; gb = g2 * 0.6; bb = g2 * 0.1;
    }
    colBuf[idx * 3] = Math.max(colBuf[idx * 3], rb);
    colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], gb);
    colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], bb);
  }
  if (progress > 0.3) {
    const rayB = (progress - 0.3) / 0.7 * bright * 0.4;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      for (let r2 = 3; r2 < 10; r2++) {
        const ru = sunU + Math.round(Math.cos(angle) * r2);
        const rv = sunV + Math.round(Math.sin(angle) * r2);
        if (ru < 0 || ru >= S || rv < 0 || rv >= S) continue;
        const idx = faceMap[0][rv * S + ru]; if (idx < 0) continue;
        const rb = rayB * (1 - r2 / 10);
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], rb);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], rb * 0.7);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], rb * 0.1);
      }
    }
  }
}

// ── alarmCheck / alarmFire ──────────────────────────────────────────────
// state: {alarms, activeAlarm, effect, overlays, brightness, ...} - the
// same shared mutable object app.js hands to everything else, augmented
// with `alarms`/`activeAlarm`/`_alarmT` fields owned by this module.
function alarmCheck(state, now) {
  const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds(), ms = now.getMilliseconds();
  const dayMs = (h * 60 + m) * 60000 + s * 1000 + ms;
  const dow = now.getDay();

  for (const al of state.alarms) {
    if (!al.enabled || state.activeAlarm) continue;
    const alMs = (al.hour * 60 + al.minute) * 60000;

    const matchesDay = al.repeat === 'daily'
      || al.repeat === 'hourly'
      || (al.repeat === 'weekdays' && dow >= 1 && dow <= 5)
      || (al.repeat === 'weekends' && (dow === 0 || dow === 6))
      || (al.repeat === 'weekly' && (al.days || []).includes(dow))
      || al.repeat === 'once';
    if (!matchesDay) continue;

    if (al.repeat === 'hourly') {
      if (m === al.minute && s < 3 && al._lastFireMin !== (h * 60 + m)) { al._lastFireMin = h * 60 + m; alarmFire(state, al, now); break; }
      continue;
    }

    if (al.prealarm?.windDown) {
      const wdMs = (al.prealarm.wdMinutes || 15) * 60000;
      if (dayMs >= alMs && dayMs < alMs + wdMs) {
        state.activeAlarm = { al, phase: 'pre', startMs: now.getTime() - (dayMs - alMs), preMs: wdMs, dismissed: false };
        break;
      }
      continue;
    }

    const preMs = (al.prealarm?.enabled ? (al.prealarm.preMinutes || 15) : 0) * 60000;
    const preStart = alMs - preMs;

    if (al.prealarm?.enabled && dayMs >= preStart && dayMs < alMs) {
      state.activeAlarm = { al, phase: 'pre', startMs: now.getTime(), preMs, dismissed: false };
      break;
    }
    if (h === al.hour && m === al.minute && s < 3 && al._lastFireMin !== (h * 60 + m)) {
      al._lastFireMin = h * 60 + m;
      alarmFire(state, al, now);
      break;
    }
  }
}

function alarmFire(state, al, now) {
  const fireMs = now ? now.getTime() : Date.now();
  // effectRise ("giantSun||effectRise" in the browser) is scoped down to
  // just giantSun here - see module comment.
  const hasPreEffect = al.prealarm?.enabled && al.prealarm?.giantSun;
  const durationMs = hasPreEffect ? 10 * 60 * 1000 : 1 * 60 * 1000;
  state.activeAlarm = { al, phase: 'main', startMs: fireMs, endMs: fireMs + durationMs, dismissed: false };

  if (al.triggerType === 'playlist') {
    // No playlist engine in pi-native - see module comment. Falls through
    // to "no effect selected" behaviour (message on whatever's already on
    // screen), same as the browser's own else-branch for that case.
  } else if (al.effect && al.effect !== '' && (state.effectsRegistry && state.effectsRegistry[al.effect])) {
    state.effect = al.effect;
  }
  if (al.overlayKeys && al.overlayKeys.length && state.overlays) {
    for (const k of al.overlayKeys) if (state.overlays[k]) state.overlays[k].on = true;
  }
  state.brightness = 1;
  if (al.repeat === 'once') al.enabled = false;
  if (state.onAlarmsChanged) state.onAlarmsChanged();
}

// Called once per app.js tick, throttled internally to the 2s interval the
// browser uses. `EFFECTS` (the cube effect registry) is stashed on `state`
// so alarmFire can validate al.effect without this module importing
// effects/index.js (avoids a require cycle - index.js doesn't need to know
// about alarms).
function tickCheck(state, dt, EFFECTS) {
  state.effectsRegistry = EFFECTS;
  state._alarmT = (state._alarmT || 0) + dt;
  if (state._alarmT > AL_CHECK_INTERVAL) {
    state._alarmT = 0;
    alarmCheck(state, new Date());
  }
}

function isBlockingNormalEffect(state) {
  const a = state.activeAlarm;
  if (!a || a.dismissed) return false;
  return a.phase === 'pre' || a.phase === 'main';
}

// Step 1 in the per-tick order (see module comment): main-phase message
// render + auto-dismiss. Called BEFORE the normal effect/overlay pipeline.
function renderMainMessage(core, state) {
  const a = state.activeAlarm;
  if (!a || a.phase !== 'main' || a.dismissed) return;
  const mainElapsed = (Date.now() - a.startMs) / 1000;
  const durationS = a.endMs ? (a.endMs - a.startMs) / 1000 : 600;
  if (mainElapsed > durationS) {
    a.dismissed = true;
    state.activeAlarm = null;
    return;
  }
  if (a.al.prealarm?.giantSun) renderGiantSun(core, 1.0, 100);
  // else: leave colBuf as whatever the previous tick left it (matches the
  // browser exactly - see module comment's step ordering: the normal
  // effect render is skipped for the whole main phase via
  // isBlockingNormalEffect, so with no giantSun the message draws over a
  // frozen last frame, not a fresh black one).
  const pulse = 0.7 + 0.3 * Math.sin(mainElapsed * 4);
  drawBigMessage(core, a.al.message || 'Good Morning', pulse, { shadow: true, mirrored: true });
}

// Step 4: forces a blank frame + zero brightness once a wind-down alarm's
// countdown has fully elapsed (phase 'done'). Called AFTER runOverlays().
function applyDonePhase(core, state) {
  const a = state.activeAlarm;
  if (!a || a.phase !== 'done') return;
  for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;
  state.brightness = 0;
}

// Step 5: pre-alarm/wind-down ramp + sunrise rendering. Called LAST -
// overwrites whatever the normal-effect/overlay pipeline just produced,
// matching the browser exactly (see module comment).
function renderPrePhase(core, dt, state, EFFECTS) {
  const a = state.activeAlarm;
  if (!a || a.phase !== 'pre' || a.dismissed) return;
  const elapsed = Date.now() - a.startMs;
  const rawProgress = Math.min(1, elapsed / a.preMs);
  const windDown = !!a.al.prealarm?.windDown;
  const progress = windDown ? 1 - rawProgress : rawProgress;
  const startBright = a.al.prealarm?.startBright || 5;

  state.brightness = windDown ? Math.max(0, 1 - Math.pow(rawProgress, 1.5)) : Math.max(startBright / 100, Math.pow(progress, 1.5));

  if (rawProgress >= 1) {
    if (windDown) {
      for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;
      state.brightness = 0;
      a.phase = 'done';
    } else {
      a.phase = 'main'; a.justTriggered = true;
      alarmFire(state, a.al, new Date());
      state.brightness = 1.0;
    }
    return;
  }

  if (windDown && a.al.prealarm?.wdUseEffect) {
    const wdEf = a.al.prealarm.wdEffectKey || state.effect;
    if (EFFECTS[wdEf]) {
      for (let i = 0; i < core.N * 3; i++) core.colBuf[i] = 0;
      EFFECTS[wdEf](core, dt);
    }
    const wdOvKeys = a.al.prealarm.wdOverlayKeys || [];
    if (wdOvKeys.length && state.overlays) {
      const save = {};
      for (const k of wdOvKeys) if (state.overlays[k]) { save[k] = state.overlays[k].on; state.overlays[k].on = true; }
      runOverlays(core, dt, state.overlays);
      for (const k of Object.keys(save)) state.overlays[k].on = save[k];
    }
  } else if (a.al.prealarm?.giantSun) {
    renderGiantSun(core, progress, startBright);
  } else {
    // Plain sunrise - also the fallback for effectRise/wxRise, which
    // aren't ported (see module comment).
    renderAlarmSunrise(core, progress, startBright);
  }

  const remaining = Math.max(0, Math.ceil((a.preMs - elapsed) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  if (remaining > 0) renderCountdown(core, mm + ':' + ss, windDown ? [] : undefined);

  if (windDown && a.al.message) {
    drawBigMessage(core, a.al.message, 1.0, { shadow: false, mirrored: false });
  }
}

// {"cmd":"dismissAlarm"} handler support - clears an active alarm early,
// same effect as toggling the firing alarm off in the browser's list UI
// (alarmBuildList()'s '.al-tog' handler sets activeAlarm.dismissed=true).
function dismissActive(state) {
  if (state.activeAlarm) { state.activeAlarm.dismissed = true; state.activeAlarm = null; }
}

module.exports = {
  tickCheck, isBlockingNormalEffect, renderMainMessage, applyDonePhase, renderPrePhase, dismissActive,
  alarmCheck, alarmFire, renderGiantSun, renderAlarmSunrise, renderCountdown, drawBigMessage,
};
