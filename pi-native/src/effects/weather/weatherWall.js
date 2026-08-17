// Wall-mode counterpart to weather.js's effectWeather().
//
// weather.js has ~10 is2d (core.panelMode==='2d') branch points because a
// single flat panel needs fundamentally different placement math than the
// 6-face cube (no face wraparound, sun/moon arc across ONE width instead
// of orbiting a cube, text drawn once instead of duplicated per face,
// etc). That is2d shape - "one flat panorama, width w / height h, no face
// concept at all" - is exactly what a wall canvas already is, just with w
// and h no longer forced equal (a cube's is2d mode is always one square
// SIZExSIZE panel). So this port takes is2d's code paths as the base and
// generalizes S (used for both axes since the cube's panel is square) to
// wallW horizontally / wallH vertically wherever the two diverge, while
// dropping every cube-only construct entirely rather than branching on
// is2d at runtime:
//   - SIDE/faceMap/creaturePx/setCreature (4-face wraparound addressing)
//     -> gone; every pixel is addressed directly via wp(x,y).
//   - panXOfFaceU/uOfFacePanX/uOfFacePanIdx (per-face panorama-column math)
//     -> gone; a wall position IS already a panorama column, no face to
//     convert through.
//   - drawBody's face-based zenith special-case (sun/moon straight
//     overhead crossing between the top face and a side face) -> gone,
//     not applicable without a top face; the is2d sun/moon block (weather.js
//     lines ~549-591, a simple horizontal arc) is what's ported instead.
//   - Face 4 (top/"sky dome") and Face 5 (bottom/"ground") separate fill
//     passes -> gone, already covered by the single sky+ground gradient
///    loop below (every column has both a ground row range and a sky row
//     range, same as is2d's face 0 did).
//
// What's genuinely spatial (not fixed UI chrome) and DOES need to track
// wallW/wallH: horizon line, sky/ground gradient, sun/moon arc position
// and radius-relative-to-canvas glow falloff, cloud/particle/creature
// placement, skyline silhouette baseline, city-name ticker scroll bounds.
//
// What stays FIXED pixel size (deliberately NOT scaled by wallW/wallH),
// matching the batch brief's "fixed UI chrome" guidance:
//   - PIXEL_FONT glyph size (3x5px) - scaling text with wall size would
//     make it either illegibly tiny (many panels) or absurdly blocky (one
//     panel); a 3x5 glyph reads fine at any wall size the same way it does
//     on a single 64px panel, so text height/temp/ticker rows are placed
//     at fixed pixel offsets from the top, not fractions of wallH.
//   - Sun/moon disc radius (3.8px / 2.5px cube values below) and cloud
//     puff pixel radii - these come from wxState.clouds[].sz (already a
//     canvas-fraction from wxInitSceneWall) so they DO scale with wallW/
//     wallH already via the existing sz*wallW/sz*wallH math; the sun/moon
//     radius constants are the one genuinely-fixed exception, matching
//     weather.js's own cube values exactly (a sun that grew with wall
//     width would look wrong long before the ticker text would).
const { wxSkyRGB, wxMoonPhase } = require('./state');
const { PIXEL_FONT } = require('./font');

function effectWeatherWall(core, dt, wxState, speedMult) {
  const { wallW, wallH } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  const is2d = true; // a wall is always the "one flat panorama" shape, never a cube
  if (!wxState.skyline) {
    require('./wallState').wxInitSceneWall(wxState.code, wxState, wallW, wallH);
  }
  wxState.t2 += dt;
  const W = wallW, W1 = W - 1, H = wallH, H1 = H - 1;

  // This whole file's internal math treats v=0 as the BOTTOM of the wall
  // (ground/horizon at small v, sky/zenith at v approaching H1) - a
  // deliberate, internally-consistent "y-up" convention inherited from
  // weather.js's cube version (surfY: 0=bottom, 1=top), not an accident.
  // core.wallBuf/setWallPixel, however, use plain row-major addressing
  // where row 0 is the TOP (matches every other wall effect, the frame
  // slicer, and the real hardware driver - none of which flip). wp()/wb()
  // are the ONLY place that mismatch gets corrected: every write in this
  // file goes through them instead of core.setWallPixel/direct wallBuf
  // access, flipping v HERE at write time so ground ends up at the bottom
  // of the actual buffer and sky at the top - while leaving the internal
  // v-up math (horizV, bldBase, sun/moon arc, ...) completely untouched.
  // A real report ("weather effect still is upside down and reversed")
  // traced to exactly this - a previous attempt fixed it with a
  // whole-canvas flip at the FRAME-SLICING stage instead, which seemed to
  // work but was actually wrong: it silently changed which OCCUPIED CELL
  // each panel's frame reads from for any layout that isn't symmetric
  // about the vertical midline (confirmed broken on an L-shaped wall) and
  // was reverted. Fixing the flip HERE, at the one effect that actually
  // needs it, doesn't have that problem - it changes WHERE this effect
  // paints, not how already-painted data gets sliced into panels, so
  // occupancy/positioning stays correct for any layout shape.
  function wp(u, v, r, g, b) { core.setWallPixel(u, H1 - v, r, g, b); }
  function wb(u, v, r, g, b) {
    if (u < 0 || u >= W || v < 0 || v >= H) return;
    const o = ((H1 - v) * W + u) * 3;
    if (r > core.wallBuf[o]) core.wallBuf[o] = r;
    if (g > core.wallBuf[o + 1]) core.wallBuf[o + 1] = g;
    if (b > core.wallBuf[o + 2]) core.wallBuf[o + 2] = b;
  }

  const localMs = Date.now() + wxState.tzOffset * 1000;
  const secsDay = Math.floor(localMs / 1000) % 86400;
  const dayFrac = secsDay / 86400;

  const isDay = secsDay > wxState.sunriseS && secsDay < wxState.sunsetS;
  const dayLen = wxState.sunsetS - wxState.sunriseS || 1;
  const dayProg = isDay ? (secsDay - wxState.sunriseS) / dayLen : 0;
  const sunElev = isDay ? Math.sin(dayProg * Math.PI) : 0;

  const nightLen = 86400 - dayLen || 1;
  const fromSunset = secsDay > wxState.sunsetS ? secsDay - wxState.sunsetS : secsDay + (86400 - wxState.sunsetS);
  const nightProg = !isDay ? fromSunset / nightLen : 0; void nightProg; // computed for parity w/ source; unused past this point there too
  const moonPh = wxMoonPhase(new Date());
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
  let moonAlpha;
  if (moonUp) {
    if (isDay) {
      const toSunset = (wxState.sunsetS - secsDay) / 3600;
      if (toSunset < 3) moonAlpha = 0.25 + 0.75 * (1 - toSunset / 3);
      else if (toSunset < 6) moonAlpha = 0.08 + 0.17 * (1 - toSunset / 6);
      else moonAlpha = 0.08;
    } else {
      moonAlpha = 1;
    }
  } else {
    moonAlpha = 0;
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
    wxState.nextStrike -= dt * speedMult; // faithful double-apply, see weather.js's comment
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

  const HORIZ = 0.26;
  const WX_CLEAR_TOP = HORIZ + (1 - HORIZ) / 3; // unused without a text-clear-zone concept on a wall, kept for skyline row math parity below

  const bldDay = isDay;
  const bldR = bldDay ? 0.12 : 0.07, bldG = bldDay ? 0.13 : 0.07, bldB = bldDay ? 0.16 : 0.1;
  const horizV = Math.round(HORIZ * H1);
  const textV = 3;
  const tempV = 10;
  const bldBase = horizV;

  const WXF = PIXEL_FONT;

  function wxGlyph(ch, su, sv, tr, tg, tb) {
    const rows = WXF[ch] || WXF[ch.toUpperCase()]; if (!rows) return 4;
    for (let row = 0; row < 5; row++) {
      const bits = rows[row];
      for (let col = 0; col < 3; col++) {
        if (!((bits >> (2 - col)) & 1)) continue;
        const u = su + col, v = sv + (4 - row);
        wb(u, v, tr, tg, tb);
      }
    }
    return 4;
  }
  function wxText(str, su, sv, tr, tg, tb) {
    let u = su; for (const ch of str) { u += wxGlyph(ch, u, sv, tr, tg, tb); if (u >= W) break; }
  }

  const txtR = isDawn || isDusk ? 0.9 : bldDay ? 0.8 : 0.6;
  const txtG = isDawn || isDusk ? 0.55 : bldDay ? 0.8 : 0.65;
  const txtB = isDawn || isDusk ? 0.1 : bldDay ? 0.85 : 0.9;

  const tempStr = (wxState.temp < 0 ? '-' : '') + Math.abs(wxState.temp) + '/' + (wxState.tempMax < 0 ? '-' : '') + Math.abs(wxState.tempMax) + '°C';
  const locStr = (wxState.cityDisplay || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  // Sky/ground gradient across the whole wall, one continuous pass instead
  // of 4 duplicated per-face passes.
  for (let v = 0; v < H; v++) {
    const vFrac = v / H1;
    if (vFrac < HORIZ) {
      for (let u = 0; u < W; u++) wp(u, v, gR, gG, gB);
      continue;
    }
    const skyFrac = (vFrac - HORIZ) / (1 - HORIZ);
    const sf2 = Math.pow(skyFrac, 0.65);
    let r = hzR + (skyCol[0] - hzR) * sf2;
    let g = hzG + (skyCol[1] - hzG) * sf2;
    let b = hzB + (skyCol[2] - hzB) * sf2;
    if (isFog) { const fga = 0.72 * (1 - skyFrac * 0.3); r = r + (0.78 - r) * fga; g = g + (0.80 - g) * fga; b = b + (0.84 - b) * fga; }
    if (wxState.lightFlash > 0) { r = Math.min(1, r + wxState.lightFlash * 0.8); g = Math.min(1, g + wxState.lightFlash * 0.8); b = Math.min(1, b + wxState.lightFlash * 0.8); }
    for (let u = 0; u < W; u++) {
      let pr = r, pg = g, pb = b;
      if (isDay && sunElev > 0 && !isOvercast && !isStorm && !isRain) {
        const px = u / W1;
        const dx = Math.abs(px - dayProg); const dxw = Math.min(dx, 1 - dx);
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
      wp(u, v, pr, pg, pb);
    }
  }

  wxText(tempStr, 1, tempV, txtR, txtG, txtB);
  {
    const localD = new Date(Date.now() + wxState.tzOffset * 1000);
    const hh = String(localD.getUTCHours()).padStart(2, '0');
    const mm = String(localD.getUTCMinutes()).padStart(2, '0');
    const ss = String(localD.getUTCSeconds()).padStart(2, '0');
    const timeStr = hh + ':' + mm + ':' + ss;
    const tx = Math.max(1, W - 1 - timeStr.length * 4);
    wxText(timeStr, tx, textV + 7, txtR * 0.7, txtG * 0.7, txtB * 0.85);
  }

  function blendLED(x, y, r, g, b) { wb(x, y, r, g, b); }

  if (locStr) {
    const textW = locStr.length * 4;
    const lr = txtR * 0.7, lg = txtG * 0.7, lb = txtB * 0.85;
    if (textW <= W) {
      wxState.scrollOff = 0;
      wxText(locStr, Math.max(0, W - textW - 1), textV, lr, lg, lb);
    } else {
      const sep = Math.max(W / 2 | 0, 16);
      const tileW = textW + sep;
      wxState.scrollOff = (wxState.scrollOff + dt * 20) % tileW;
      const off = Math.round(-wxState.scrollOff);
      for (let tile = off; tile < W; tile += tileW) {
        let col = tile;
        for (const ch of locStr) {
          const rows = WXF[ch] || WXF[ch.toUpperCase()];
          if (rows) {
            for (let row = 0; row < 5; row++) {
              const bits = rows[row];
              for (let c = 0; c < 3; c++) {
                if (!((bits >> (2 - c)) & 1)) continue;
                const u = col + c, v = textV + (4 - row);
                if (v < 0 || v >= H || u < 0 || u >= W) continue;
                blendLED(u, v, lr, lg, lb);
              }
            }
          }
          col += 4;
        }
      }
    }
  }

  const starAlpha = Math.max(0, 1 - lightLvl) * 0.95;
  if (starAlpha > 0.05) {
    for (const st of wxState.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(wxState.t2 * st.spd + st.tw);
      const sb = st.br * starAlpha * twinkle;
      if (sb < 0.04) continue;
      const tu = Math.floor(st.px * W), tv = Math.floor(st.py * H);
      blendLED(tu, tv, sb, sb * 0.9, sb);
    }
  }

  // Sun / moon - simple single arc across the whole wall (is2d's block,
  // generalized to wallW/wallH instead of the cube's square S).
  const sunDim = isDay && isStorm ? 0.35 : isDay && isRain ? 0.55 : 1;
  if (isDay) {
    const sunX = dayProg * W;
    const arc = Math.sin(dayProg * Math.PI);
    const sunY = horizV + arc * (H1 - horizV) * 0.92;
    const sunRad = 3.8; // fixed disc radius - see module comment
    const rr = Math.ceil(sunRad + 4);
    for (let dv = -rr; dv <= rr; dv++) {
      for (let du = -rr; du <= rr; du++) {
        const dist = Math.sqrt(du * du + dv * dv);
        const fu = Math.round(sunX + du), fv = Math.round(sunY + dv);
        if (fu < 0 || fu >= W || fv < horizV || fv >= H) continue;
        if (dist <= sunRad) { wp(fu, fv, sunDim, 0.98 * sunDim, 0.7 * sunDim); }
        else if (dist < sunRad + 2) { const b = (1 - (dist - sunRad) / 2) * 0.9 * sunDim; blendLED(fu, fv, b, b * 0.85, b * 0.25); }
        else if (dist < sunRad + 4) { const b = (1 - (dist - sunRad - 2) / 2) * 0.35 * sunDim; blendLED(fu, fv, b, b * 0.65, b * 0.08); }
      }
    }
  }
  if (moonUp && moonAlpha > 0.01) {
    const moonX = moonDayProg * W;
    const arc = Math.sin(moonDayProg * Math.PI);
    const moonY = horizV + arc * (H1 - horizV) * 0.75;
    const moonRad = 2.5; // fixed disc radius - see module comment
    const rr = Math.ceil(moonRad + 2);
    for (let dv = -rr; dv <= rr; dv++) {
      for (let du = -rr; du <= rr; du++) {
        const dist = Math.sqrt(du * du + dv * dv);
        const fu = Math.round(moonX + du), fv = Math.round(moonY + dv);
        if (fu < 0 || fu >= W || fv < horizV || fv >= H) continue;
        if (dist <= moonRad) {
          const illum = moonPh <= 0.5 ? moonPh * 2 : (1 - moonPh) * 2;
          const dir2d = moonPh <= 0.5 ? 1 : -1;
          const tX = du / moonRad;
          const cosA = (1 - illum) * 2 - 1;
          const lit2d = tX * dir2d > cosA ? 1 : tX * dir2d > cosA - 0.2 ? ((tX * dir2d - cosA + 0.2) / 0.2) * 0.6 : 0;
          if (lit2d > 0.05) { const mb = 0.85 * lit2d * moonAlpha; blendLED(fu, fv, mb, mb * 0.97, mb * 0.9); }
        } else if (dist < moonRad + 2) { const b = (1 - (dist - moonRad) / 2) * 0.18 * moonAlpha; blendLED(fu, fv, b, b * 0.95, b * 0.88); }
      }
    }
  }

  // Clouds
  const cloudDark = isStorm ? 0.85 : isRain ? 0.7 : isOvercast ? 0.95 : wxCode >= 3 ? 0.65 : 0.85;
  for (const cl of wxState.clouds) {
    cl.px = (cl.px + cl.spd * dt + 1) % 1;
    cl.py = cl.py + cl.spdY * dt;
    if (cl.py < 0.1) { cl.py = 0.1; cl.spdY = Math.abs(cl.spdY); }
    if (cl.py > 0.95) { cl.py = 0.95; cl.spdY = -Math.abs(cl.spdY); }
    const relCX = Math.round(cl.px * W1);
    let relCY = Math.round((HORIZ + cl.py * (1 - HORIZ)) * H1);
    const wU = Math.round(cl.sz * 0.5 * W), wV = Math.round(cl.sz * 0.28 * H);
    for (let p = 0; p < cl.puffs; p++) {
      const offU = (p - (cl.puffs - 1) / 2) * wU * (isOvercast ? 0.45 : 0.6) | 0;
      const offV = (p % 2 === 0 ? 0 : -wV * (isOvercast ? 0.5 : 0.35)) | 0;
      const pu = relCX + offU, pv = relCY + offV;
      for (let dv = -wV; dv <= wV; dv++) for (let du = -wU; du <= wU; du++) {
        const dist = Math.sqrt((du / (wU || 1)) ** 2 + (dv / (wV || 1)) ** 2);
        if (dist > 1) continue;
        const fu = pu + du, fv = pv + dv;
        if (fu < 0 || fu >= W || fv < 0 || fv >= H) continue;
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
          blendLED(fu, fv, cb + warm, cb * (1 - warm * 0.3) + blueShift, cb * (1 - warm * 0.8) + blueShift * 1.5);
        } else {
          blendLED(fu, fv, cb + warm, cb * (1 - warm * 0.3), cb * (1 - warm * 0.8));
        }
      }
    }
  }

  // Birds & planes & balloon - direct wall coords instead of creaturePx's
  // 4-face wraparound.
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
      const crV = Math.round((HORIZ + cr.py * (1 - HORIZ)) * H1);
      const baseCol = Math.round(cr.px * W);
      const c = cr.color;
      const envRows = [
        { ev: 7, w: 1 }, { ev: 6, w: 2 }, { ev: 5, w: 3 }, { ev: 4, w: 3 },
        { ev: 3, w: 3 }, { ev: 2, w: 2 }, { ev: 1, w: 1 },
      ];
      for (const { ev, w } of envRows) {
        for (let eu = -w; eu <= w; eu++) {
          const panel = (eu + 100) % 2 === 0 ? 0.75 : 1;
          const vShade = 0.8 + 0.2 * (ev - 1) / 6;
          wp(baseCol + eu, crV + ev, c[0] * panel * vShade, c[1] * panel * vShade, c[2] * panel * vShade);
        }
      }
      wp(baseCol, crV, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
      if (Math.sin(cr.phaseT * 8) > 0.2) wp(baseCol, crV, 1, 0.6, 0.1);
      wp(baseCol - 1, crV - 1, 0.25, 0.15, 0.05);
      wp(baseCol + 1, crV - 1, 0.25, 0.15, 0.05);
      for (let bu = -1; bu <= 1; bu++) wp(baseCol + bu, crV - 2, 0.45, 0.25, 0.08);
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
    const crV = Math.round((HORIZ + cr.py * (1 - HORIZ)) * H1);
    const baseCol = Math.round(cr.px * W);
    if (cr.type === 'bird') {
      cr.wingT += dt;
      const flap = Math.sin(cr.wingT * (5 + cr.wingSpeed) + cr.wing);
      const wOff = Math.round(flap * 1.5);
      const dir = cr.dx > 0 ? 1 : -1;
      const pixels = [{ du: -2, dv: -wOff }, { du: -1, dv: -wOff / 2 }, { du: 0, dv: 0 }, { du: 1, dv: -wOff / 2 }, { du: 2, dv: -wOff }];
      for (const { du, dv } of pixels) wp(baseCol + du * dir, crV + Math.round(dv), 0.08, 0.06, 0.05);
    } else {
      cr.blink += dt * 2;
      const blinkOn = Math.sin(cr.blink) > 0;
      const dir = cr.dx > 0 ? 1 : -1;
      const wobOff = cr.wobble > 0 ? Math.round(Math.sin(cr.wobble * 12) * cr.wobble * 1.5) : 0;
      const planeV = crV + wobOff;
      const isHit = cr.lightningHit > 0.15;
      if (cr.lightningHit > 0.1) {
        for (let bv = Math.min(H - 1, planeV + 1); bv < H; bv++) {
          const jitter = Math.round((Math.random() - 0.5) * 2);
          wp(baseCol + jitter, bv, 0.9, 0.9, 1);
        }
      }
      const wh = isHit;
      const body = [0.85, 0.85, 0.9];
      for (let d = -2; d <= 2; d++) wp(baseCol + d * dir, planeV, wh ? 1 : body[0], wh ? 1 : body[1], wh ? 1 : body[2]);
      wp(baseCol + 3 * dir, planeV, wh ? 1 : 0.6, wh ? 1 : 0.65, wh ? 1 : 0.75);
      wp(baseCol + 2 * dir, planeV - 1, wh ? 1 : 0.2, wh ? 1 : 0.5, wh ? 1 : 0.9);
      for (let w = 1; w <= 3; w++) {
        const sweep = w > 1 ? -1 * dir : 0;
        const wb = 0.7 - w * 0.08;
        wp(baseCol + sweep, planeV - w, wh ? 1 : wb, wh ? 1 : wb, wh ? 1 : wb + 0.05);
        wp(baseCol + sweep, planeV + w, wh ? 1 : wb, wh ? 1 : wb, wh ? 1 : wb + 0.05);
      }
      for (let tf = 1; tf <= 2; tf++) wp(baseCol - (2 + tf) * dir, planeV + tf, wh ? 1 : 0.6, wh ? 1 : 0.6, wh ? 1 : 0.65);
      if (blinkOn && !isHit) wp(baseCol - 3 * dir, planeV, 1, 0.1, 0.1);
      if (!isHit) {
        if (dir > 0) { wp(baseCol, planeV - 3, 0.1, 0.9, 0.1); wp(baseCol, planeV + 3, 0.9, 0.1, 0.1); }
        else { wp(baseCol, planeV - 3, 0.9, 0.1, 0.1); wp(baseCol, planeV + 3, 0.1, 0.9, 0.1); }
      }
    }
  }

  // Rain / snow particles
  const pSpeed = dt * Math.max(W, H) * 0.5;
  for (const p of wxState.particles) {
    p.v -= p.spd * pSpeed / Math.max(1, H / 64); // normalize fall speed to a ~64px-tall panel's feel regardless of wallH
    if (p.snow) p.u += p.drift * dt * 10;
    if (p.v < 0) { p.v = H1; p.u = Math.random() * W1; }
    if (p.u < 0 || p.u > W1) { p.u = ((p.u % W) + W) % W; }
    const iu = Math.round(p.u), iv = Math.round(p.v);
    if (iu < 0 || iu >= W || iv < 0 || iv >= H) continue;
    if (p.snow) { blendLED(iu, iv, 0.9, 0.92, 0.98); }
    else {
      blendLED(iu, iv, 0.35, 0.45, 0.65);
      if (iv + 1 < H) blendLED(iu, iv + 1, 0.2, 0.28, 0.45);
    }
  }

  // Lightning bolt on storm
  if (wxState.lightFlash > 0.5 && isStorm) {
    let bu = Math.floor(W * 0.3 + Math.random() * W * 0.4), bv = H1;
    for (let seg = 0; seg < 8 && bv > H * HORIZ; seg++) {
      const nu = bu + (Math.random() - 0.5) * 8 | 0, nv = bv - (3 + Math.random() * 5) | 0;
      for (let t2 = 0; t2 <= 1; t2 += 0.2) {
        const lu = Math.round(bu + t2 * (nu - bu)), lv = Math.round(bv + t2 * (nv - bv));
        if (lu >= 0 && lu < W && lv >= 0 && lv < H) blendLED(lu, lv, 1, 1, 0.9);
      }
      bu = nu; bv = nv;
    }
  }

  // Horizon sun glow
  if (isDay && sunElev < 0.25) {
    const glU = Math.round(dayProg * W1);
    const glV = horizV;
    for (let du = -12; du <= 12; du++) {
      const gu = glU + du; if (gu < 0 || gu >= W) continue;
      const gb = Math.max(0, 1 - Math.abs(du) / 12) * sunElev * 4 * (1 - sunElev) * 0.6;
      if (gb < 0.01) continue;
      for (let dv = 0; dv <= 3; dv++) {
        const gv = glV + dv; if (gv < 0 || gv >= H) continue;
        blendLED(gu, gv, gb, gb * 0.55, gb * 0.05);
      }
    }
  }

  // Skyline silhouettes - final pass, drawn over all weather, across the
  // full wall width (wxState.skyline/skyShapes built at wallW by
  // wxInitSceneWall - see that file's module comment).
  if (wxState.skyShapes.length > 0) {
    const night = !bldDay;
    for (const sh of wxState.skyShapes) {
      for (let li = 0; li < sh.w; li++) {
        const u = sh.x + li;
        if (u < 0 || u >= W) continue;
        for (let row = 0; row < sh.h; row++) {
          const v = bldBase + row;
          if (v < 0 || v >= H) continue;
          let inShape = true;
          const mid = Math.floor(sh.w / 2);
          if (sh.t === 2) {
            if (row < 2) inShape = Math.abs(li - mid) <= 0;
            else { const cr = sh.h - 2, cy = 2 + cr / 2, rx = Math.max(1, sh.w * 0.8); inShape = (li - mid) ** 2 / (rx * rx) + (row - cy) ** 2 / (cr * cr) <= 1; }
          } else if (sh.t === 1) {
            const roofH = Math.max(1, Math.floor(sh.h * 0.4));
            const wH = sh.h - roofH;
            if (row >= wH) { const rr = row - wH; const span = sh.w * (1 - rr / roofH); inShape = li >= Math.floor((sh.w - span) / 2) && li < Math.ceil((sh.w + span) / 2); }
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
            const wH = sh.h - domeH;
            if (row >= wH) { const dr = row - wH; const rx = sh.w / 2, ry = domeH; inShape = (li - mid) ** 2 / (rx * rx) + (dr) ** 2 / (ry * ry) <= 1; }
          } else if (sh.t === 8) {
            inShape = sh.lm.draw(li, row);
          }
          if (!inShape) continue;
          let br = bldR, bg = bldG, bb = bldB;
          if (sh.t === 8) { br = bldDay ? 0.22 : 0.10; bg = bldDay ? 0.20 : 0.08; bb = bldDay ? 0.18 : 0.06; }
          const depthVar = 0.6 + ((u * 317 + sh.x * 131) >>> 0) % 40 * 0.01;
          br *= depthVar; bg *= depthVar; bb *= depthVar;
          if (li === 0) { br += 0.03; bg += 0.03; bb += 0.04; }
          if (sh.t === 2) {
            if (row < 2) { br = bldR * 0.7; bg = bldG * 0.7; bb = bldB * 0.4; }
            else { br = 0.01; bg = bldDay ? 0.05 : 0.02; bb = 0.005; }
          }
          if (night && (sh.t === 0 || sh.t === 4) && sh.h > 3) {
            const winX = (li + sh.x * 3) % 3, winY = row % 3;
            const lit = ((u * 7 + row * 13 + sh.x) % 5) < 3;
            if (winX === 1 && winY === 1 && lit && row > 0 && row < sh.h - 1 && li > 0 && li < sh.w - 1) {
              const warmth = ((u * 31 + row * 7) % 3);
              if (warmth === 0) { br = 0.55; bg = 0.45; bb = 0.1; }
              else if (warmth === 1) { br = 0.4; bg = 0.5; bb = 0.55; }
              else { br = 0.5; bg = 0.4; bb = 0.15; }
            }
          }
          if (night && sh.t === 1 && row > 0) {
            const wH = sh.h - Math.max(1, Math.floor(sh.h * 0.4));
            if (row < wH && li > 0 && li < sh.w - 1 && ((li + row * 3) % 4) < 2) { br = 0.55; bg = 0.45; bb = 0.1; }
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
          wp(u, v, br, bg, bb);
        }
      }
    }
  }
}

module.exports = effectWeatherWall;
