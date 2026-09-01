// Faithful port of effects-livedata.js's effectWeather() (lines 999-1904 in
// the browser source). Structurally line-for-line the same logic; only the
// plumbing changed:
//   - SIZE/N/faceMap/colBuf -> core.SIZE/core.N/core.faceMap/core.colBuf
//   - wxCode/wxTemp/wxSkyline/etc (bare module-scope globals in the
//     browser) -> fields on a `wxState` object (see state.js's
//     createWxState()) - Node has no equivalent of the browser's implicit
//     shared <script> scope, so this has to be explicit here.
//   - `this._wxNextStrike` -> `wxState.nextStrike`. The original relies on
//     `this` resolving to `window` inside a bare, non-strict function call
//     (effects are invoked as `efn(dt*speedMult)`, no explicit receiver) -
//     that specific behavior does NOT happen in Node (bare calls get
//     `this === undefined` in a CommonJS module, which is strict-mode-like),
//     so this was a real (not cosmetic) porting hazard, not just a rename.
//   - `speedMult` is passed explicitly rather than read off a module-scope
//     UI-slider global. NOTE: the original does `dt*speedMult` for the
//     lightning-strike timer even though the effect's own `dt` parameter
//     ALREADY has speedMult multiplied in at the call site (ui.js's
//     `efn(dt*speedMult)`) - i.e. the original double-applies speedMult
//     for this one specific timer. That looks like it could be an
//     unintentional quirk, but this is a faithful port, not a rewrite, so
//     it's preserved exactly - app.js passes both the pre-scaled `dt` and
//     the raw `speedMult` for this reason.
//   - panel2dMode is TRUE for pi-native's own single-2D-panel hardware mode
//     (core.panelMode==='2d', one physical 64x64 panel, as opposed to
//     core.panelMode==='cube' which is 6 faces) - this was incorrectly
//     assumed to have no hardware equivalent and hardcoded false in an
//     earlier version of this port; that was wrong and caused the weather
//     effect to render incorrectly (wrong horizon/text/sun/moon/cloud
//     placement) on a real single-panel setup. It's now derived each tick
//     as `const is2d = core.panelMode === '2d';` and threaded through the
//     same 10 branch points the browser source has (plus wxInitScene's
//     nFaces line in state.js).
//   - Reads that depended on a live DOM city-search input
//     (`document.getElementById('wx-city')?.value`) now just use
//     `wxState.cityDisplay`, set once by fetch.js's fetchWeather().
//
// This has NOT been visually verified (no hardware/renderer available in
// this sandbox) - see pi-native/README.md's status section. It's a
// structurally faithful transcription, checked function-by-function
// against the source, exercised for "never throws, stays in valid numeric
// range across many times of day and weather codes" (test/weather.test.js)
// but not eyeballed against real output.
const { wxSkyRGB, wxInitScene } = require('./state');
const { PIXEL_FONT } = require('./font');

function effectWeather(core, dt, wxState, speedMult) {
  const is2d = core.panelMode === '2d';
  if (!wxState.skyline) {
    wxInitScene(wxState.code, wxState, core.SIZE, is2d);
  }
  wxState.t2 += dt;
  const S = core.SIZE, S1 = S - 1;
  const faceMap = core.faceMap, colBuf = core.colBuf, N = core.N;

  const localMs = Date.now() + wxState.tzOffset * 1000;
  const secsDay = Math.floor(localMs / 1000) % 86400;
  const dayFrac = secsDay / 86400;

  const isDay = secsDay > wxState.sunriseS && secsDay < wxState.sunsetS;
  const dayLen = wxState.sunsetS - wxState.sunriseS || 1;
  const dayProg = isDay ? (secsDay - wxState.sunriseS) / dayLen : 0;
  const sunPX = isDay ? dayProg * 0.5 : -1;
  const sunElev = isDay ? Math.sin(dayProg * Math.PI) : 0;

  const nightLen = 86400 - dayLen || 1;
  const fromSunset = secsDay > wxState.sunsetS ? secsDay - wxState.sunsetS : secsDay + (86400 - wxState.sunsetS);
  const nightProg = !isDay ? fromSunset / nightLen : 0;
  const moonPh = require('./state').wxMoonPhase(new Date());
  let moonUp = false, moonDayProg = 0;
  if (wxState.moonriseS >= 0 || wxState.moonsetS >= 0) {
    if (wxState.moonriseS >= 0 && wxState.moonsetS >= 0) {
      if (wxState.moonsetS > wxState.moonriseS) {
        moonUp = secsDay >= wxState.moonriseS && secsDay <= wxState.moonsetS;
        if (moonUp) moonDayProg = (secsDay - wxState.moonriseS) / (wxState.moonsetS - wxState.moonriseS);
      } else {
        moonUp = secsDay >= wxState.moonriseS || secsDay <= wxState.moonsetS;
        const span = wxState.moonsetS + 86400 - wxState.moonriseS;
        if (moonUp) moonDayProg = ((secsDay - wxState.moonriseS + 86400) % 86400) / span;
      }
    } else if (wxState.moonriseS >= 0) {
      moonUp = secsDay >= wxState.moonriseS;
      if (moonUp) moonDayProg = Math.min(1, (secsDay - wxState.moonriseS) / 43200);
    } else {
      moonUp = secsDay <= wxState.moonsetS;
      if (moonUp && wxState.moonsetS > 0) moonDayProg = 0.5 + 0.5 * (1 - secsDay / wxState.moonsetS);
    }
  } else {
    const moonLag = moonPh * 24;
    const moonRiseH = (wxState.sunriseS / 3600 + moonLag) % 24;
    const moonSetH = (wxState.sunsetS / 3600 + moonLag) % 24;
    const hourNow = secsDay / 3600;
    if (moonSetH > moonRiseH) {
      moonUp = hourNow >= moonRiseH && hourNow <= moonSetH;
      if (moonUp) moonDayProg = (hourNow - moonRiseH) / (moonSetH - moonRiseH);
    } else {
      const span = moonSetH + 24 - moonRiseH;
      moonDayProg = ((hourNow - moonRiseH + 24) % 24) / span;
      moonUp = moonDayProg >= 0 && moonDayProg <= 1;
    }
  }
  let moonPX, moonElev, moonAlpha;
  if (moonUp) {
    moonPX = moonDayProg * 0.5;
    moonElev = Math.sin(moonDayProg * Math.PI) * 0.85;
    if (isDay) {
      const toSunset = (wxState.sunsetS - secsDay) / 3600;
      if (toSunset < 3) moonAlpha = 0.25 + 0.75 * (1 - toSunset / 3);
      else if (toSunset < 6) moonAlpha = 0.08 + 0.17 * (1 - toSunset / 6);
      else moonAlpha = 0.08;
    } else {
      moonAlpha = 1;
    }
  } else {
    moonPX = -1; moonElev = 0; moonAlpha = 0;
  }

  const twilS = 3600;
  const toSr = wxState.sunriseS - secsDay, fromSs = secsDay - wxState.sunsetS;
  let lightLvl = isDay ? 1 : 0;
  if (!isDay && toSr > 0 && toSr < twilS) lightLvl = 1 - toSr / twilS;
  if (!isDay && fromSs > 0 && fromSs < twilS) lightLvl = 1 - fromSs / twilS;

  let skyCol = wxSkyRGB(dayFrac, wxState);
  const wxCode = wxState.code;
  const isFog = wxCode >= 45 && wxCode <= 48;
  const isSnow = wxCode >= 71 && wxCode <= 77 || wxCode >= 85 && wxCode <= 86;
  const isRain = wxCode >= 51 && wxCode <= 65 || wxCode >= 80 && wxCode <= 82 || wxCode >= 95;
  const isStorm = wxCode >= 95;
  const isOvercast = wxCode === 3;

  if (isDay) {
    if (isStorm) {
      skyCol = [skyCol[0] * 0.3 + 0.12, skyCol[1] * 0.3 + 0.13, skyCol[2] * 0.35 + 0.15];
    } else if (isRain) {
      skyCol = [skyCol[0] * 0.4 + 0.08, skyCol[1] * 0.4 + 0.1, skyCol[2] * 0.5 + 0.1];
    } else if (isOvercast) {
      skyCol = [0.25, 0.27, 0.3];
    } else if (wxCode === 2) {
      skyCol = [skyCol[0] * 0.75 + 0.04, skyCol[1] * 0.75 + 0.04, skyCol[2] * 0.8 + 0.03];
    }
  }

  if (!wxState.nextStrike) wxState.nextStrike = 1 + Math.random() * 3;
  if (isStorm) {
    wxState.nextStrike -= dt * speedMult; // see module comment: yes, double-applies speedMult - faithful to source
    if (wxState.nextStrike <= 0) {
      wxState.lightFlash = Math.min(1, wxState.lightFlash + 0.7 + Math.random() * 0.3);
      wxState.nextStrike = (0.4 + Math.random() * 2.5) / Math.max(0.1, speedMult);
      if (Math.random() < 0.35) wxState.nextStrike *= 0.15;
    }
  }
  if (wxState.lightFlash > 0) wxState.lightFlash = Math.max(0, wxState.lightFlash - dt * 3);

  const gNight = dayFrac < 0.25 || dayFrac > 0.75;
  const gR = isSnow ? (gNight ? 0.5 : 0.9) : gNight ? 0.02 : 0.04;
  const gG = isSnow ? (gNight ? 0.52 : 0.94) : gNight ? 0.04 : 0.09;
  const gB = isSnow ? (gNight ? 0.55 : 0.98) : gNight ? 0.02 : 0.03;

  const isDawn = dayFrac > 0.22 && dayFrac < 0.32;
  const isDusk = dayFrac > 0.70 && dayFrac < 0.80;
  const glowAmt = isDawn ? Math.sin((dayFrac - 0.22) / 0.10 * Math.PI) : isDusk ? Math.sin((dayFrac - 0.70) / 0.10 * Math.PI) : 0;
  const hzR = Math.min(1, skyCol[0] + glowAmt * 0.6);
  const hzG = Math.min(1, skyCol[1] + glowAmt * 0.15);
  const hzB = Math.min(1, skyCol[2] * 0.3);

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  const CW_FACES = [0, 2, 1, 3];
  function creaturePx(stripCol, v) {
    const totalCols = S * 4;
    const col = ((stripCol % totalCols) + totalCols) % totalCols;
    const qi = (col / S) | 0;
    const fu = col % S;
    if (fu < 0 || fu >= S || v < 0 || v >= S) return -1;
    return faceMap[CW_FACES[qi]][v * S + fu];
  }
  function setCreature(idx, r, g, b) {
    if (idx < 0) return;
    colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b;
  }

  const HORIZ = 0.26;
  const WX_CLEAR_TOP = HORIZ + (1 - HORIZ) / 3;
  const SIDE = [2, 0, 3, 1];

  function panXOfFaceU(face, u) {
    const f = u / S1;
    if (face === 2) return 0.25 * f;
    if (face === 0) return 0.25 + f * 0.25;
    if (face === 3) return 0.5 + f * 0.25;
    return 0.75 + f * 0.25;
  }
  function uOfFacePanX(face, px) {
    if (face === 2) return Math.round((px / 0.25) * S1);
    if (face === 0) return Math.round(((px - 0.25) / 0.25) * S1);
    if (face === 3) return Math.round(((px - 0.5) / 0.25) * S1);
    return Math.round(((px - 0.75) / 0.25) * S1);
  }
  function uOfFacePanIdx(face, pi) {
    if (is2d) {
      if (pi < 0 || pi >= S) return -1;
      return pi;
    }
    const fIdx = SIDE.indexOf(face);
    if (fIdx < 0) return -1;
    const fStart = fIdx * S;
    const local = pi - fStart;
    if (local < 0 || local >= S) return -1;
    return local;
  }
  function vOfElevFrac(elev) {
    return Math.round((HORIZ + elev * (1 - HORIZ)) * S1);
  }

  const bldDay = isDay;
  const bldR = bldDay ? 0.12 : 0.07, bldG = bldDay ? 0.13 : 0.07, bldB = bldDay ? 0.16 : 0.1;
  const horizV = Math.round(HORIZ * S1);
  const textV = 3;
  const tempV = 10;
  const bldBase = horizV;

  const WXF = PIXEL_FONT;

  function wxGlyph(face, ch, su, sv, tr, tg, tb) {
    const rows = WXF[ch] || WXF[ch.toUpperCase()]; if (!rows) return 4;
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
  function wxText(face, str, su, sv, tr, tg, tb) {
    let u = su; for (const ch of str) { u += wxGlyph(face, ch, u, sv, tr, tg, tb); if (u >= S) break; }
  }

  const txtR = isDawn || isDusk ? 0.9 : bldDay ? 0.8 : 0.6;
  const txtG = isDawn || isDusk ? 0.55 : bldDay ? 0.8 : 0.65;
  const txtB = isDawn || isDusk ? 0.1 : bldDay ? 0.85 : 0.9;

  const tempStr = (wxState.temp < 0 ? '-' : '') + Math.abs(wxState.temp) + '/' + (wxState.tempMax < 0 ? '-' : '') + Math.abs(wxState.tempMax) + '°C';
  const locStr = (wxState.cityDisplay || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  for (let fi = 0; fi < 4; fi++) {
    const face = SIDE[fi];
    for (let v = 0; v < S; v++) {
      const vFrac = v / S1;
      let r, g, b;
      if (vFrac < HORIZ) {
        r = gR; g = gG; b = gB;
      } else {
        const skyFrac = (vFrac - HORIZ) / (1 - HORIZ);
        const sf2 = Math.pow(skyFrac, 0.65);
        r = hzR + (skyCol[0] - hzR) * sf2;
        g = hzG + (skyCol[1] - hzG) * sf2;
        b = hzB + (skyCol[2] - hzB) * sf2;
        if (isFog) { const fga = 0.72 * (1 - skyFrac * 0.3); r = r + (0.78 - r) * fga; g = g + (0.80 - g) * fga; b = b + (0.84 - b) * fga; }
        if (wxState.lightFlash > 0) { r = Math.min(1, r + wxState.lightFlash * 0.8); g = Math.min(1, g + wxState.lightFlash * 0.8); b = Math.min(1, b + wxState.lightFlash * 0.8); }
        for (let u = 0; u < S; u++) {
          const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
          let pr = r, pg = g, pb = b;
          if (isDay && sunElev > 0 && !isOvercast && !isStorm && !isRain) {
            const px = panXOfFaceU(face, u);
            const dx = Math.abs(px - sunPX); const dxw = Math.min(dx, 1 - dx);
            const sunV = HORIZ + sunElev * (1 - HORIZ);
            const dy = (vFrac - sunV) * 1.5;
            const dist = Math.sqrt(dxw * dxw * 4 + dy * dy);
            if (dist < 1.0) {
              const glow = Math.pow(1 - dist, 1.5) * 0.45;
              pr = Math.min(1, pr + glow * 1.0);
              pg = Math.min(1, pg + glow * 0.9);
              pb = Math.min(1, pb + glow * 0.45);
            }
          }
          colBuf[idx * 3] = pr; colBuf[idx * 3 + 1] = pg; colBuf[idx * 3 + 2] = pb;
        }
        continue;
      }
      for (let u = 0; u < S; u++) {
        const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
        colBuf[idx * 3] = gR; colBuf[idx * 3 + 1] = gG; colBuf[idx * 3 + 2] = gB;
      }
    }

    wxText(face, tempStr, 1, tempV, txtR, txtG, txtB);
    {
      const localD = new Date(Date.now() + wxState.tzOffset * 1000);
      const hh = String(localD.getUTCHours()).padStart(2, '0');
      const mm = String(localD.getUTCMinutes()).padStart(2, '0');
      const ss = String(localD.getUTCSeconds()).padStart(2, '0');
      const timeStr = hh + ':' + mm + ':' + ss;
      const tx = Math.max(1, S - 1 - timeStr.length * 4);
      wxText(face, timeStr, tx, textV + 7, txtR * 0.7, txtG * 0.7, txtB * 0.85);
    }
  }

  if (locStr) {
    const textW = locStr.length * 4;
    const totalW = is2d ? S : S * 4;
    const lr = txtR * 0.7, lg = txtG * 0.7, lb = txtB * 0.85;
    if (textW <= S) {
      wxState.scrollOff = 0;
      if (is2d) wxText(0, locStr, Math.max(0, S - textW - 1), textV, lr, lg, lb);
      else for (let fi = 0; fi < 4; fi++) wxText(SIDE[fi], locStr, Math.max(0, S - textW - 1), textV, lr, lg, lb);
    } else {
      const sep = Math.max(S / 2 | 0, 16);
      const tileW = textW + sep;
      wxState.scrollOff = (wxState.scrollOff + dt * 20) % tileW;
      const off = Math.round(-wxState.scrollOff);
      for (let tile = off; tile < totalW; tile += tileW) {
        let col = tile;
        for (const ch of locStr) {
          const rows = WXF[ch] || WXF[ch.toUpperCase()];
          if (rows) {
            for (let row = 0; row < 5; row++) {
              const bits = rows[row];
              for (let c = 0; c < 3; c++) {
                if (!((bits >> (2 - c)) & 1)) continue;
                const u = col + c, v = textV + (4 - row);
                if (v < 0 || v >= S) continue;
                if (u < 0 || u >= totalW) { /* skip off-screen */ }
                else if (is2d) {
                  const idx = faceMap[0][v * S + u];
                  if (idx >= 0) {
                    if (lr > colBuf[idx * 3]) colBuf[idx * 3] = lr;
                    if (lg > colBuf[idx * 3 + 1]) colBuf[idx * 3 + 1] = lg;
                    if (lb > colBuf[idx * 3 + 2]) colBuf[idx * 3 + 2] = lb;
                  }
                } else {
                  const idx = creaturePx(u, v);
                  if (idx >= 0) {
                    if (lr > colBuf[idx * 3]) colBuf[idx * 3] = lr;
                    if (lg > colBuf[idx * 3 + 1]) colBuf[idx * 3 + 1] = lg;
                    if (lb > colBuf[idx * 3 + 2]) colBuf[idx * 3 + 2] = lb;
                  }
                }
              }
            }
          }
          col += 4;
        }
      }
    }
  }

  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[4][v * S + u]; if (idx < 0) continue;
    let r = skyCol[0], g = skyCol[1], b = skyCol[2];
    if (isFog) { r = r + (0.80 - r) * 0.68; g = g + (0.82 - g) * 0.68; b = b + (0.85 - b) * 0.68; }
    if (wxState.lightFlash > 0) { r = Math.min(1, r + wxState.lightFlash); g = Math.min(1, g + wxState.lightFlash); b = Math.min(1, b + wxState.lightFlash); }
    colBuf[idx * 3] = r; colBuf[idx * 3 + 1] = g; colBuf[idx * 3 + 2] = b;
  }

  for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
    const idx = faceMap[5][v * S + u]; if (idx < 0) continue;
    colBuf[idx * 3] = gR; colBuf[idx * 3 + 1] = gG; colBuf[idx * 3 + 2] = gB;
  }

  function blendLED(idx, r, g, b) {
    if (idx < 0) return;
    if (r > colBuf[idx * 3]) colBuf[idx * 3] = r;
    if (g > colBuf[idx * 3 + 1]) colBuf[idx * 3 + 1] = g;
    if (b > colBuf[idx * 3 + 2]) colBuf[idx * 3 + 2] = b;
  }

  const starAlpha = Math.max(0, 1 - lightLvl) * 0.95;
  if (starAlpha > 0.05) {
    for (const st of wxState.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(wxState.t2 * st.spd + st.tw);
      const sb = st.br * starAlpha * twinkle;
      if (sb < 0.04) continue;
      const tu = Math.floor(st.px * S), tv = Math.floor(st.py * S);
      blendLED(faceMap[4][tv * S + tu], sb, sb * 0.9, sb);
      const fi = Math.floor(st.px * 4) % 4;
      const face = SIDE[fi];
      const lu = Math.floor((st.px * 4 % 1) * S);
      const lv = Math.floor((HORIZ + st.py * (1 - HORIZ)) * S1);
      blendLED(faceMap[face][lv * S + lu], sb * 0.75, sb * 0.68, sb * 0.78);
    }
  }

  const sunDim = isDay && isStorm ? 0.35 : isDay && isRain ? 0.55 : 1;
  // Terminator tilt - a real report: "make sure it's at the correct angle
  // depending on the location, it's not just a straight vertical
  // terminator line". Same math as celestial.js's Moon effect (see that
  // file's module comment for the full derivation/history) - the
  // day/night boundary's tilt on a real moon depends on the observer's
  // latitude (steeper near the equator, closer to vertical near the
  // poles) plus a small daily wobble as the moon arcs across the sky.
  // Reuses wxState.lat (the picked city's real latitude, already fetched
  // for sunrise/sunset/horizon math) rather than a separate location
  // input - Weather already has this, no reason to ask twice.
  const moonHourNow = (Date.now() % 86400000) / 3600000;
  const moonLat = Number.isFinite(wxState.lat) ? wxState.lat : 52.04;
  const moonTilt = moonLat * Math.PI / 180 * 0.4 + Math.sin((moonHourNow / 24) * Math.PI * 2) * 0.3;
  const moonCosT = Math.cos(moonTilt), moonSinT = Math.sin(moonTilt);
  function drawMoon(idx, du, dv, dist, radius, phase) {
    if (dist > radius + 3) return;
    if (dist < radius) {
      const illum = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
      const dir = phase <= 0.5 ? 1 : -1;
      const ndu = du / radius, ndv = dv / radius;
      const termX = ndu * moonCosT - ndv * moonSinT;
      const cosAngle = (1 - illum) * 2 - 1;
      const lit = termX * dir > cosAngle ? 1 :
        termX * dir > cosAngle - 0.15 ? ((termX * dir - cosAngle + 0.15) / 0.15) * 0.7 : 0;
      if (lit > 0.05) {
        const edge = 1 - Math.pow(dist / radius, 2) * 0.3;
        const moonB = (0.8 + 0.1 * Math.sin(du * 1.3 + dv * 0.9)) * lit * edge * moonAlpha;
        blendLED(idx, moonB, moonB * 0.97, moonB * 0.88);
      }
    } else if (dist < radius + 2) {
      const glow = (1 - (dist - radius) / 2) * 0.18 * moonAlpha;
      blendLED(idx, glow, glow * 0.95, glow * 0.88);
    }
  }
  function drawBody(panX, elevFrac, isSun, phase) {
    if (panX < 0 || elevFrac < 0) return;
    const radius = isSun ? 3.8 : 2.5;
    const normPX = ((panX % 1) + 1) % 1;
    let face = -1, faceU = -1, faceV = -1;

    if (elevFrac > 0.82) {
      const az = normPX * Math.PI * 2;
      const fromZenith = (1 - elevFrac) * 2;
      const cx = S / 2 + Math.sin(az - Math.PI * 0.5) * fromZenith * S * 0.6;
      const cz = S / 2 + Math.cos(az - Math.PI * 0.5) * fromZenith * S * 0.6;
      for (let dv = -Math.ceil(radius + 4); dv <= Math.ceil(radius + 4); dv++) for (let du = -Math.ceil(radius + 4); du <= Math.ceil(radius + 4); du++) {
        const dist = Math.sqrt(du * du + dv * dv);
        const fu = Math.round(cx + du), fv = Math.round(cz + dv);
        if (fu < 0 || fu >= S || fv < 0 || fv >= S) continue;
        const idx = faceMap[4][fv * S + fu]; if (idx < 0) continue;
        if (isSun) {
          const d = sunDim;
          if (dist <= radius) { blendLED(idx, d, 0.98 * d, 0.7 * d); }
          else if (dist < radius + 2) { const b = (1 - (dist - radius) / 2) * 0.9 * d; blendLED(idx, b, b * 0.85, b * 0.25); }
          else if (dist < radius + 5) { const b = (1 - (dist - radius - 2) / 3) * 0.3 * d; blendLED(idx, b, b * 0.6, b * 0.05); }
        } else {
          drawMoon(idx, du, dv, dist, radius, phase);
        }
      }
      if (elevFrac < 0.92) face = elevFrac > 0.88 ? -1 : SIDE[Math.floor(normPX * 4) % 4];
      if (face === -1) return;
    } else {
      face = SIDE[Math.floor(normPX * 4) % 4];
    }
    if (face < 0) return;

    faceU = uOfFacePanX(face, normPX);
    faceV = vOfElevFrac(elevFrac);

    const drawR = Math.ceil(radius + 8);
    const horizV2 = Math.round(HORIZ * S1);
    for (let dv = -drawR; dv <= drawR; dv++) for (let du = -drawR; du <= drawR; du++) {
      const dist = Math.sqrt(du * du + dv * dv);
      const fu = faceU + du, fv = faceV + dv;
      if (fu < 0 || fu >= S || fv < 0 || fv >= S || fv < horizV2) continue;
      if (fv >= Math.round(HORIZ * S) && fv <= Math.round(WX_CLEAR_TOP * S)) continue;
      const idx = faceMap[face][fv * S + fu]; if (idx < 0) continue;
      if (isSun) {
        const d = sunDim;
        if (dist <= radius) { blendLED(idx, d, 0.98 * d, 0.7 * d); }
        else if (dist < radius + 2) { const b = (1 - (dist - radius) / 2) * 0.95 * d; blendLED(idx, b, b * 0.88, b * 0.3); }
        else if (dist < radius + 5) { const b = (1 - (dist - radius - 2) / 3) * 0.5 * d; blendLED(idx, b, b * 0.7, b * 0.12); }
        else if (dist < radius + 8) { const b = (1 - (dist - radius - 5) / 3) * 0.2 * d; blendLED(idx, b, b * 0.6, b * 0.08); }
      } else {
        drawMoon(idx, du, dv, dist, radius, phase);
      }
    }
  }

  if (!is2d && isDay && sunPX >= 0) drawBody(sunPX, sunElev, true, 0);
  if (!is2d && moonUp && moonAlpha > 0.01) drawBody(moonPX, moonElev, false, moonPh);

  const cloudDark = isStorm ? 0.85 : isRain ? 0.7 : isOvercast ? 0.95 : wxCode >= 3 ? 0.65 : 0.85;
  for (const cl of wxState.clouds) {
    cl.px = (cl.px + cl.spd * dt + 1) % 1;
    cl.py = cl.py + cl.spdY * dt;
    if (cl.py < 0.1) { cl.py = 0.1; cl.spdY = Math.abs(cl.spdY); }
    if (cl.py > 0.95) { cl.py = 0.95; cl.spdY = -Math.abs(cl.spdY); }
    for (let fi = 0; fi < 4; fi++) {
      const face = SIDE[fi];
      const cpx = cl.px;
      const relCX = uOfFacePanX(face, cpx);
      let relCY = vOfElevFrac(cl.py);
      const _clrTop7 = Math.round(WX_CLEAR_TOP * S);
      const _clrBot7 = Math.round(HORIZ * S);
      const wVchk = Math.round(cl.sz * 0.28 * S);
      if (relCY - wVchk < _clrTop7 - 6) relCY = _clrTop7 - 6 + Math.round(wVchk * 0.4);
      const wU = Math.round(cl.sz * 0.5 * S), wV = Math.round(cl.sz * 0.28 * S);
      for (let p = 0; p < cl.puffs; p++) {
        const offU = (p - (cl.puffs - 1) / 2) * wU * (isOvercast ? 0.45 : 0.6) | 0;
        const offV = (p % 2 === 0 ? 0 : -wV * (isOvercast ? 0.5 : 0.35)) | 0;
        const pu = relCX + offU, pv = relCY + offV;
        for (let dv = -wV; dv <= wV; dv++) for (let du = -wU; du <= wU; du++) {
          const dist = Math.sqrt((du / wU) ** 2 + (dv / wV) ** 2);
          if (dist > 1) continue;
          const fu = pu + du, fv = pv + dv;
          if (fu < 0 || fu >= S || fv < 0 || fv >= S) continue;
          const _bubRow = _clrTop7 - 6 + Math.round(1.6 * Math.sin(fu * 0.55 + p * 2.1 + cl.bubSeed));
          if (fv >= _clrBot7 && fv < _bubRow) continue;
          const idx = faceMap[face][fv * S + fu]; if (idx < 0) continue;
          let edge;
          if (isOvercast) {
            if (dist < 0.55) edge = 1;
            else if (dist < 0.75) { const t = (dist - 0.55) / 0.2; edge = 1 + 0.2 * Math.sin(t * Math.PI); }
            else { edge = Math.max(0, (1 - dist) / 0.25); edge *= edge; }
          } else edge = 1 - dist;
          let cb = cl.br * cloudDark * edge;
          if (isOvercast) {
            const clTint = cl.tint;
            const pxVar = 0.92 + ((fu * 2657 + fv * 4391) >>> 0) % 16 * 0.01;
            const edgeLift = dist > 0.5 ? 1 + 0.15 * (dist - 0.5) / 0.5 : 1;
            cb *= clTint * pxVar * edgeLift;
          }
          const warm = (isDawn || isDusk) ? cl.fluff * 0.06 * glowAmt : 0;
          if (isOvercast) {
            const blueShift = 0.02 * ((fu * 317 + fv * 131) >>> 0) % 3 * 0.01;
            blendLED(idx, cb + warm, cb * (1 - warm * 0.3) + blueShift, cb * (1 - warm * 0.8) + blueShift * 1.5);
          } else {
            blendLED(idx, cb + warm, cb * (1 - warm * 0.3), cb * (1 - warm * 0.8));
          }
        }
      }
    }
    const tu = Math.round(cl.px * S), tv = Math.round(cl.py * S);
    const wr = Math.round(cl.sz * 0.4 * S);
    for (let dv = -wr; dv <= wr; dv++) for (let du = -wr; du <= wr; du++) {
      const dist = Math.sqrt((du / wr) ** 2 + (dv / wr) ** 2); if (dist > 1) continue;
      const fu = tu + du, fv = tv + dv;
      if (fu < 0 || fu >= S || fv < 0 || fv >= S) continue;
      const idx = faceMap[4][fv * S + fu]; if (idx < 0) continue;
      let topEdge;
      if (isOvercast) {
        if (dist < 0.55) topEdge = 1;
        else if (dist < 0.75) { const t = (dist - 0.55) / 0.2; topEdge = 1 + 0.2 * Math.sin(t * Math.PI); }
        else { topEdge = Math.max(0, (1 - dist) / 0.25); topEdge *= topEdge; }
      } else topEdge = 1 - dist;
      let cb = cl.br * cloudDark * topEdge * 0.8;
      if (isOvercast) {
        const clTint = cl.tint;
        const pxVar = 0.92 + ((fu * 2657 + fv * 4391) >>> 0) % 16 * 0.01;
        cb *= clTint * pxVar;
      }
      const warm = (isDawn || isDusk) ? cl.fluff * 0.06 * glowAmt : 0;
      if (isOvercast) {
        const blueShift = 0.02 * ((fu * 317 + fv * 131) >>> 0) % 3 * 0.01;
        blendLED(idx, cb + warm, cb * (1 - warm * 0.3) + blueShift, cb * (1 - warm * 0.8) + blueShift * 1.5);
      } else {
        blendLED(idx, cb + warm, cb * (1 - warm * 0.3), cb * (1 - warm * 0.8));
      }
    }
  }

  // For 2D panel mode, draw sun/moon on face 0 (before creatures so they appear in front)
  if (is2d) {
    const horizV2d = Math.round(HORIZ * S1);
    if (isDay) {
      const sunX = dayProg * S;
      const arc = Math.sin(dayProg * Math.PI);
      const sunY = horizV2d + arc * (S1 - horizV2d) * 0.92;
      const sunRad = Math.max(3, S * 0.06);
      for (let dv = -Math.ceil(sunRad + 4); dv <= Math.ceil(sunRad + 4); dv++) {
        for (let du = -Math.ceil(sunRad + 4); du <= Math.ceil(sunRad + 4); du++) {
          const dist = Math.sqrt(du * du + dv * dv);
          const fu = Math.round(sunX + du), fv = Math.round(sunY + dv);
          if (fu < 0 || fu >= S || fv < horizV2d || fv >= S) continue;
          const idx = faceMap[0][fv * S + fu]; if (idx < 0) continue;
          if (dist <= sunRad) { colBuf[idx * 3] = sunDim; colBuf[idx * 3 + 1] = 0.98 * sunDim; colBuf[idx * 3 + 2] = 0.7 * sunDim; }
          else if (dist < sunRad + 2) { const b = (1 - (dist - sunRad) / 2) * 0.9 * sunDim; colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + b); colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + b * 0.85); colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b * 0.25); }
          else if (dist < sunRad + 4) { const b = (1 - (dist - sunRad - 2) / 2) * 0.35 * sunDim; colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + b); colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + b * 0.65); colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b * 0.08); }
        }
      }
    }
    // 2D moon — drawn when above horizon, moonAlpha controls brightness
    if (moonUp && moonAlpha > 0.01) {
      const moonX = moonDayProg * S;
      const arc = Math.sin(moonDayProg * Math.PI);
      const moonY = horizV2d + arc * (S1 - horizV2d) * 0.75;
      const moonRad = Math.max(2, S * 0.04);
      for (let dv = -Math.ceil(moonRad + 2); dv <= Math.ceil(moonRad + 2); dv++) {
        for (let du = -Math.ceil(moonRad + 2); du <= Math.ceil(moonRad + 2); du++) {
          const dist = Math.sqrt(du * du + dv * dv);
          const fu = Math.round(moonX + du), fv = Math.round(moonY + dv);
          if (fu < 0 || fu >= S || fv < horizV2d || fv >= S) continue;
          const idx = faceMap[0][fv * S + fu]; if (idx < 0) continue;
          if (dist <= moonRad) {
            const illum = moonPh <= 0.5 ? moonPh * 2 : (1 - moonPh) * 2;
            const dir2d = moonPh <= 0.5 ? 1 : -1;
            const tX = du / moonRad;
            const cosA = (1 - illum) * 2 - 1;
            const lit2d = tX * dir2d > cosA ? 1 : tX * dir2d > cosA - 0.2 ? ((tX * dir2d - cosA + 0.2) / 0.2) * 0.6 : 0;
            if (lit2d > 0.05) { const mb = 0.85 * lit2d * moonAlpha; colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + mb); colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + mb * 0.97); colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + mb * 0.9); }
          } else if (dist < moonRad + 2) { const b = (1 - (dist - moonRad) / 2) * 0.18 * moonAlpha; colBuf[idx * 3] = Math.min(1, colBuf[idx * 3] + b); colBuf[idx * 3 + 1] = Math.min(1, colBuf[idx * 3 + 1] + b * 0.95); colBuf[idx * 3 + 2] = Math.min(1, colBuf[idx * 3 + 2] + b * 0.88); }
        }
      }
    }
  }

  // Birds & Planes
  for (const cr of wxState.creatures) {
    if (cr.delay > 0) { cr.delay -= dt; continue; }
    cr.px = (cr.px + cr.dx * dt * 60 + 1) % 1;
    if (cr.type === 'balloon') {
      if (!isDay) continue;
      cr.phaseT += dt;
      if (cr.phase === 'rise') {
        cr.py = Math.min(0.65, cr.py + dt * 0.015);
        if (cr.py >= 0.65) cr.phase = 'float';
      } else if (cr.phase === 'float') {
        cr.px = (cr.px + cr.dx * dt * 60 + 1) % 1;
        cr.py += Math.sin(cr.phaseT * 0.5) * dt * 0.003;
        cr.py = Math.max(0.45, Math.min(0.75, cr.py));
        if (cr.phaseT > 20) cr.phase = 'descend';
      } else if (cr.phase === 'descend') {
        cr.px = (cr.px + cr.dx * dt * 60 * 0.5 + 1) % 1;
        cr.py = Math.max(0.02, cr.py - dt * 0.012);
        if (cr.py <= 0.02) {
          cr.phase = 'rise'; cr.phaseT = 0; cr.py = 0.05;
          cr.px = Math.random(); cr.laps = 0;
          cr.delay = 60 + Math.random() * 120;
          continue;
        }
      }
      const _bc = [[1, 0.2, 0.1], [0.1, 0.5, 1], [0.9, 0.8, 0.1], [0.2, 0.8, 0.3], [0.8, 0.2, 0.8], [1, 0.5, 0]];
      let bestD = 0; for (const cc of _bc) { const d = (cc[0] - skyCol[0]) ** 2 + (cc[1] - skyCol[1]) ** 2 + (cc[2] - skyCol[2]) ** 2; if (d > bestD) { bestD = d; cr.color = cc; } }
      const crV = Math.round((HORIZ + cr.py * (1 - HORIZ)) * S1);
      if (!is2d && crV >= Math.round(HORIZ * S) && crV <= Math.round(WX_CLEAR_TOP * S)) continue;
      const baseCol = Math.round(cr.px * S * 4);
      const c = cr.color;
      const envRows = [
        { ev: 7, w: 1 }, { ev: 6, w: 2 }, { ev: 5, w: 3 }, { ev: 4, w: 3 },
        { ev: 3, w: 3 }, { ev: 2, w: 2 }, { ev: 1, w: 1 },
      ];
      for (const { ev, w } of envRows) {
        for (let eu = -w; eu <= w; eu++) {
          const idx = creaturePx(baseCol + eu, crV + ev);
          if (idx < 0) continue;
          const panel = (eu + 100) % 2 === 0 ? 0.75 : 1;
          const vShade = 0.8 + 0.2 * (ev - 1) / 6;
          setCreature(idx, c[0] * panel * vShade, c[1] * panel * vShade, c[2] * panel * vShade);
        }
      }
      const sk = creaturePx(baseCol, crV);
      if (sk >= 0) setCreature(sk, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      if (Math.sin(cr.phaseT * 8) > 0.2) {
        const fi = creaturePx(baseCol, crV);
        if (fi >= 0) setCreature(fi, 1, 0.6, 0.1);
      }
      const r1 = creaturePx(baseCol - 1, crV - 1);
      const r2 = creaturePx(baseCol + 1, crV - 1);
      if (r1 >= 0) setCreature(r1, 0.25, 0.15, 0.05);
      if (r2 >= 0) setCreature(r2, 0.25, 0.15, 0.05);
      for (let bu = -1; bu <= 1; bu++) {
        const bi = creaturePx(baseCol + bu, crV - 2);
        if (bi >= 0) setCreature(bi, 0.45, 0.25, 0.08);
      }
      continue;
    }
    if (cr.type === 'plane') {
      cr.flightT = (cr.flightT || 0) + dt;
      if (cr.flightT > 10) cr.py = Math.min(0.98, cr.py + dt * 0.03);
      if (cr.flightT > 15) {
        cr.delay = 40 + Math.random() * 80;
        cr.flightT = 0;
        cr.py = 0.5 + Math.random() * 0.2;
        cr.px = Math.random();
        cr.dx = (Math.random() < 0.5 ? 1 : -1) * (0.0008 + Math.random() * 0.0005);
        continue;
      }
    }
    if (cr.dy !== undefined) cr.py = Math.max(0.3, Math.min(0.92, cr.py + cr.dy * dt * 60));
    if (cr.lightningHit > 0) cr.lightningHit -= dt;
    if (cr.wobble > 0) cr.wobble = Math.max(0, cr.wobble - dt * 0.4);
    if (isStorm && cr.type === 'plane' && cr.lightningHit <= 0 && Math.random() < dt * 0.08) {
      cr.lightningHit = 0.3; cr.wobble = 2.5;
    }
    const crV = Math.round((HORIZ + cr.py * (1 - HORIZ)) * S1);
    if (!is2d && crV >= Math.round(HORIZ * S) && crV <= Math.round(WX_CLEAR_TOP * S)) continue;
    const baseCol = Math.round(cr.px * S * 4);
    if (cr.type === 'bird') {
      cr.wingT += dt;
      const flap = Math.sin(cr.wingT * (5 + cr.wingSpeed) + cr.wing);
      const wOff = Math.round(flap * 1.5);
      const dir = cr.dx > 0 ? 1 : -1;
      const pixels = [{ du: -2, dv: -wOff }, { du: -1, dv: -wOff / 2 }, { du: 0, dv: 0 }, { du: 1, dv: -wOff / 2 }, { du: 2, dv: -wOff }];
      for (const { du, dv } of pixels) {
        const idx = creaturePx(baseCol + du * dir, crV + Math.round(dv));
        if (idx >= 0) setCreature(idx, 0.08, 0.06, 0.05);
      }
    } else {
      cr.blink += dt * 2;
      const blinkOn = Math.sin(cr.blink) > 0;
      const dir = cr.dx > 0 ? 1 : -1;
      const wobOff = cr.wobble > 0 ? Math.round(Math.sin(cr.wobble * 12) * cr.wobble * 1.5) : 0;
      const planeV = crV + wobOff;
      const isHit = cr.lightningHit > 0.15;
      if (cr.lightningHit > 0.1) {
        for (let bv = Math.min(S - 1, planeV + 1); bv < S; bv++) {
          const jitter = Math.round((Math.random() - 0.5) * 2);
          const bidx = creaturePx(baseCol + jitter, bv);
          if (bidx >= 0) setCreature(bidx, 0.9, 0.9, 1);
        }
      }
      const wh = isHit ? [1, 1, 1] : null;
      const body = [0.85, 0.85, 0.9];
      for (let d = -2; d <= 2; d++) {
        const idx = creaturePx(baseCol + d * dir, planeV);
        if (idx >= 0) setCreature(idx, wh ? 1 : body[0], wh ? 1 : body[1], wh ? 1 : body[2]);
      }
      const nose = creaturePx(baseCol + 3 * dir, planeV);
      if (nose >= 0) setCreature(nose, wh ? 1 : 0.6, wh ? 1 : 0.65, wh ? 1 : 0.75);
      const cock = creaturePx(baseCol + 2 * dir, planeV - 1);
      if (cock >= 0) setCreature(cock, wh ? 1 : 0.2, wh ? 1 : 0.5, wh ? 1 : 0.9);
      for (let w = 1; w <= 3; w++) {
        const sweep = w > 1 ? -1 * dir : 0;
        const w1 = creaturePx(baseCol + sweep, planeV - w);
        const w2 = creaturePx(baseCol + sweep, planeV + w);
        const wb = 0.7 - w * 0.08;
        if (w1 >= 0) setCreature(w1, wh ? 1 : wb, wh ? 1 : wb, wh ? 1 : wb + 0.05);
        if (w2 >= 0) setCreature(w2, wh ? 1 : wb, wh ? 1 : wb, wh ? 1 : wb + 0.05);
      }
      for (let tf = 1; tf <= 2; tf++) {
        const ti = creaturePx(baseCol - (2 + tf) * dir, planeV + tf);
        if (ti >= 0) setCreature(ti, wh ? 1 : 0.6, wh ? 1 : 0.6, wh ? 1 : 0.65);
      }
      if (blinkOn && !isHit) {
        const idx = creaturePx(baseCol - 3 * dir, planeV);
        if (idx >= 0) setCreature(idx, 1, 0.1, 0.1);
      }
      if (!isHit) {
        const nav1 = creaturePx(baseCol, planeV - 3);
        const nav2 = creaturePx(baseCol, planeV + 3);
        if (dir > 0) {
          if (nav1 >= 0) setCreature(nav1, 0.1, 0.9, 0.1);
          if (nav2 >= 0) setCreature(nav2, 0.9, 0.1, 0.1);
        } else {
          if (nav1 >= 0) setCreature(nav1, 0.9, 0.1, 0.1);
          if (nav2 >= 0) setCreature(nav2, 0.1, 0.9, 0.1);
        }
      }
    }
  }

  // Rain / Snow particles
  const pSpeed = dt * S * 0.5;
  for (const p of wxState.particles) {
    p.v -= p.spd * pSpeed;
    if (p.snow) p.u += p.drift * dt * 10;
    if (p.v < 0) { p.v = S1; p.u = Math.random() * S1; }
    if (p.u < 0 || p.u > S1) { p.u = ((p.u % S) + S) % S; }
    const face = SIDE[p.face];
    const iu = Math.round(p.u), iv = Math.round(p.v);
    if (iu < 0 || iu >= S || iv < 0 || iv >= S) continue;
    if (iv >= Math.round(HORIZ * S) && iv <= Math.round(WX_CLEAR_TOP * S)) continue;
    const idx = faceMap[face][iv * S + iu]; if (idx < 0) continue;
    if (p.snow) { blendLED(idx, 0.9, 0.92, 0.98); }
    else {
      blendLED(idx, 0.35, 0.45, 0.65);
      if (iv + 1 < S) { const i2 = faceMap[face][(iv + 1) * S + iu]; blendLED(i2, 0.2, 0.28, 0.45); }
    }
    if (p.snow && iv < 3) { const bi = faceMap[5][iu * S + Math.min(S1, Math.round(p.u))]; blendLED(bi, 0.88, 0.90, 0.95); }
  }

  // Lightning bolt on storm
  if (wxState.lightFlash > 0.5 && isStorm) {
    const bFace = SIDE[Math.floor(Math.random() * 4)];
    let bu = Math.floor(S * 0.3 + Math.random() * S * 0.4), bv = S1;
    for (let seg = 0; seg < 8 && bv > S * HORIZ; seg++) {
      const nu = bu + (Math.random() - 0.5) * 8 | 0, nv = bv - (3 + Math.random() * 5) | 0;
      for (let t2 = 0; t2 <= 1; t2 += 0.2) {
        const lu = Math.round(bu + t2 * (nu - bu)), lv = Math.round(bv + t2 * (nv - bv));
        if (lu >= 0 && lu < S && lv >= 0 && lv < S && !(lv >= Math.round(HORIZ * S) && lv <= Math.round(WX_CLEAR_TOP * S))) { blendLED(faceMap[bFace][lv * S + lu], 1, 1, 0.9); }
      }
      bu = nu; bv = nv;
    }
  }

  // Horizon sun glow on adjacent faces
  if (isDay && sunElev < 0.25 && sunPX >= 0) {
    const glFace = SIDE[Math.floor(sunPX * 4) % 4];
    const glU = uOfFacePanX(glFace, sunPX);
    const glV = Math.round(HORIZ * S1);
    for (let du = -12; du <= 12; du++) {
      const gu = glU + du; if (gu < 0 || gu >= S) continue;
      const gb = Math.max(0, 1 - Math.abs(du) / 12) * sunElev * 4 * (1 - sunElev) * 0.6;
      if (gb < 0.01) continue;
      for (let dv = 0; dv <= 3; dv++) {
        const gv = glV + dv; if (gv < 0 || gv >= S) continue;
        const idx = faceMap[glFace][gv * S + gu]; if (idx < 0) continue;
        blendLED(idx, gb, gb * 0.55, gb * 0.05);
      }
    }
  }

  // Skyline silhouettes - final pass, drawn over all weather
  if (wxState.skyShapes.length > 0) {
    const _panW = 4 * S;
    const _faces = is2d ? [0] : [SIDE[0], SIDE[1], SIDE[2], SIDE[3]];
    const night = !bldDay;
    for (const face of _faces) {
      for (const sh of wxState.skyShapes) {
        for (let li = 0; li < sh.w; li++) {
          const pi = sh.x + li;
          if (pi >= _panW) break;
          const u = uOfFacePanIdx(face, pi);
          if (u < 0 || u >= S) continue;
          for (let row = 0; row < sh.h; row++) {
            const v = bldBase + row;
            if (v < 0 || v >= S) continue;
            let inShape = true;
            const mid = Math.floor(sh.w / 2);
            if (sh.t === 2) {
              if (row < 2) inShape = Math.abs(li - mid) <= 0;
              else { const cr = sh.h - 2, cy = 2 + cr / 2, rx = Math.max(1, sh.w * 0.8); inShape = (li - mid) ** 2 / (rx * rx) + (row - cy) ** 2 / (cr * cr) <= 1; }
            } else if (sh.t === 1) {
              const roofH = Math.max(1, Math.floor(sh.h * 0.4));
              const wallH = sh.h - roofH;
              if (row >= wallH) { const rr = row - wallH; const span = sh.w * (1 - rr / roofH); inShape = li >= Math.floor((sh.w - span) / 2) && li < Math.ceil((sh.w + span) / 2); }
            } else if (sh.t === 3) {
              const spireH = Math.floor(sh.h * 0.5);
              const bodyH = sh.h - spireH;
              if (row < bodyH) inShape = true;
              else { const sr = row - bodyH; const sw = Math.max(1, sh.w * (1 - sr / spireH)); inShape = li >= Math.floor((sh.w - sw) / 2) && li < Math.ceil((sh.w + sw) / 2); }
            } else if (sh.t === 4) {
              const stepH = Math.max(1, Math.floor(sh.h * 0.15));
              if (row >= sh.h - stepH) { const sw = Math.max(1, sh.w - 2); inShape = li >= Math.floor((sh.w - sw) / 2) && li < Math.ceil((sh.w + sw) / 2); }
            } else if (sh.t === 5) {
              inShape = li === mid;
              if (row === sh.h - 1) { inShape = li >= mid - 1 && li <= mid + 1; }
            } else if (sh.t === 6) {
              if (row < sh.h - 1) inShape = li === mid;
              else inShape = true;
            } else if (sh.t === 7) {
              const domeH = Math.max(1, Math.floor(sh.h * 0.4));
              const wallH = sh.h - domeH;
              if (row >= wallH) { const dr = row - wallH; const rx = sh.w / 2, ry = domeH; inShape = (li - mid) ** 2 / (rx * rx) + (dr) ** 2 / (ry * ry) <= 1; }
            } else if (sh.t === 8) {
              inShape = sh.lm.draw(li, row);
            }
            if (!inShape) continue;
            const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
            let br = bldR, bg = bldG, bb = bldB;
            if (sh.t === 8) { br = bldDay ? 0.22 : 0.10; bg = bldDay ? 0.20 : 0.08; bb = bldDay ? 0.18 : 0.06; }
            const depthVar = 0.6 + ((pi * 317 + sh.x * 131) >>> 0) % 40 * 0.01;
            br *= depthVar; bg *= depthVar; bb *= depthVar;
            if (li === 0) { br += 0.03; bg += 0.03; bb += 0.04; }
            if (sh.t === 2) {
              if (row < 2) { br = bldR * 0.7; bg = bldG * 0.7; bb = bldB * 0.4; }
              else { br = 0.01; bg = bldDay ? 0.05 : 0.02; bb = 0.005; }
            }
            if (night && (sh.t === 0 || sh.t === 4) && sh.h > 3) {
              const winX = (li + sh.x * 3) % 3, winY = row % 3;
              const lit = ((pi * 7 + row * 13 + sh.x) % 5) < 3;
              if (winX === 1 && winY === 1 && lit && row > 0 && row < sh.h - 1 && li > 0 && li < sh.w - 1) {
                const warmth = ((pi * 31 + row * 7) % 3);
                if (warmth === 0) { br = 0.55; bg = 0.45; bb = 0.1; }
                else if (warmth === 1) { br = 0.4; bg = 0.5; bb = 0.55; }
                else { br = 0.5; bg = 0.4; bb = 0.15; }
              }
            }
            if (night && sh.t === 1 && row > 0) {
              const wallH = sh.h - Math.max(1, Math.floor(sh.h * 0.4));
              if (row < wallH && li > 0 && li < sh.w - 1 && ((li + row * 3) % 4) < 2) { br = 0.55; bg = 0.45; bb = 0.1; }
            }
            if (night && sh.t === 3 && row > 0 && row < sh.h - Math.floor(sh.h * 0.5) && li === mid) { br = 0.6; bg = 0.5; bb = 0.15; }
            if (sh.t === 7 && row === sh.h - 1 && li === mid) { br += 0.04; bg += 0.04; bb += 0.05; }
            if (night && (sh.t === 4 || sh.t === 5) && row === sh.h - 1 && li === mid) {
              const blink = Math.sin(wxState.t2 * 3 + sh.x) > 0.3;
              if (blink) { br = 1; bg = 0.1; bb = 0.1; }
            }
            if (night && sh.t === 6 && row === sh.h - 1 && (li === 0 || li === sh.w - 1)) {
              br = 1; bg = 0.8; bb = 0;
            }
            colBuf[idx * 3] = br; colBuf[idx * 3 + 1] = bg; colBuf[idx * 3 + 2] = bb;
          }
        }
      }
    }
  }
}

module.exports = effectWeather;
