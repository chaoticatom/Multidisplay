// Ported (math unchanged) from effects-livedata.js's effectMoon() (line
// ~2642) - the "Celestial" effect. Renders one of 13 selectable bodies:
// Moon (with real phase/terminator calculation), the 8 planets + Pluto,
// the Sun, a Black Hole, or a multi-body Solar System orbital view - see
// bodies.js (planets/sun/blackhole/saturn) and solarsystem.js (orbit view).
//
// Body selection: the browser reads
// document.querySelector('input[name="celestial-body"]:checked'); here it
// comes from core.effectOptions.moon.body (defaults to 'moon'), wired via
// the generic setEffectOption mechanism in pi-native/public/app.js's
// wireCelestialPanel(). The Solar System view's Orbit Speed slider is
// core.effectOptions.moon.solarSpeed (see solarsystem.js).
//
// Moon-phase astronomy: getMoonIllumination() is REUSED from
// weather/state.js (already ported there verbatim from effects-livedata.js's
// SunCalc-derived math - same _moonCoords/_sunCoords/getMoonIllumination
// this file's browser counterpart calls) rather than re-derived here -
// per CLAUDE.md's reuse-first instruction. moonLat (used only to tilt the
// terminator ellipse, not for rise/set times) is hardcoded to the browser's
// own default of 52.04 - the browser's moon effect has no city-picker of
// its own (that's the separate Weather effect's moonLat/moonLon), it just
// happens to share the module-scope default.
const { getMoonIllumination } = require('../weather/state');
const { PIXEL_FONT } = require('../weather/font');
const { drawSaturn, drawPlanet } = require('./bodies');
const drawSolarSystem = require('./solarsystem');

const MOON_LAT_DEFAULT = 52.04;

// Deterministic craters/maria - ported verbatim from effects-livedata.js's
// moonInit(). Built lazily per SIZE, same "size" guard as the original.
let moonCraters = null, moonMaria = null;
function moonInit() {
  if (moonCraters && moonCraters.size === 64) return; // craters/maria are in normalized -1..1 disc space, independent of SIZE - guard just needs to run once
  const rng = (s) => ((s * 2654435761) >>> 0) / 4294967296;
  moonCraters = [];
  moonCraters.size = 64;
  for (let i = 0; i < 45; i++) {
    const cx = rng(i * 317 + 7) * 1.6 - 0.8;
    const cy = rng(i * 523 + 13) * 1.6 - 0.8;
    if (cx * cx + cy * cy > 0.85) continue;
    const r = 0.03 + rng(i * 719 + 31) * 0.12;
    const depth = 0.15 + rng(i * 911 + 47) * 0.2;
    moonCraters.push({ cx, cy, r, depth });
  }
  moonMaria = [
    { cx: -0.15, cy: 0.25, rx: 0.35, ry: 0.25, name: 'imbrium' },
    { cx: 0.2, cy: 0.35, rx: 0.2, ry: 0.18, name: 'serenitatis' },
    { cx: 0.25, cy: 0.15, rx: 0.22, ry: 0.2, name: 'tranquillitatis' },
    { cx: 0.15, cy: -0.05, rx: 0.18, ry: 0.25, name: 'fecunditatis' },
    { cx: -0.3, cy: 0.0, rx: 0.15, ry: 0.2, name: 'procellarum' },
    { cx: -0.1, cy: -0.2, rx: 0.2, ry: 0.15, name: 'nubium' },
    { cx: 0.0, cy: 0.45, rx: 0.12, ry: 0.1, name: 'frigoris' },
    { cx: 0.35, cy: 0.3, rx: 0.1, ry: 0.12, name: 'crisium' },
  ];
}

function getMoonPhase() {
  return getMoonIllumination(new Date()).phase;
}

// Local extension of weather/font.js's shared PIXEL_FONT with the two
// glyphs the moon-phase/label ticker needs that weather's ticker doesn't:
// '%' and a digit-friendly '0'-'9' set (already in PIXEL_FONT) - matches
// the browser's effectMoon() `this._mf` table exactly (that table is just
// PIXEL_FONT's digits/letters/space plus '%', minus a couple of symbols
// weather uses that moon never needed).
const MOON_FONT = { ...PIXEL_FONT, '%': [5, 1, 2, 4, 5] };

function moonGlyph(core, face, ch, su, sv) {
  const rows = MOON_FONT[ch.toUpperCase()]; if (!rows) return 4;
  const { colBuf, faceMap, SIZE: S } = core;
  for (let row = 0; row < 5; row++) {
    const bits = rows[row];
    for (let col = 0; col < 3; col++) {
      if (!((bits >> (2 - col)) & 1)) continue;
      const u = su + col, v = sv + (4 - row);
      if (u < 0 || u >= S || v < 0 || v >= S) continue;
      const idx = faceMap[face][v * S + u]; if (idx < 0) continue;
      colBuf[idx * 3] = Math.max(colBuf[idx * 3], 0.75);
      colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], 0.8);
      colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], 0.85);
    }
  }
  return 4;
}

// Per-effect-instance scroll state (mirrors the browser's this._moonScrollX,
// which was bound per-call via EFFECTS[key].call(state,...) - pi-native has
// no equivalent "this" binding for effect functions, so it's module-scope
// here instead, same pattern as solarsystem.js's _solarLastT).
let _moonScrollX = 0;

function effectCelestial(core, dt) {
  core.t += dt;
  moonInit();
  const S = core.SIZE, N = core.N, colBuf = core.colBuf, faceMap = core.faceMap;
  const phase = getMoonPhase();
  const tt = Date.now() * 0.001;

  colBuf.fill(0);

  // Background: deep space with stars
  for (let i = 0; i < N; i++) {
    const starSeed = ((i * 2654435761) >>> 0) / 4294967296;
    if (starSeed < 0.012) {
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(tt * 1.5 + starSeed * 50));
      const br = starSeed * 40 * twinkle;
      colBuf[i * 3] = br; colBuf[i * 3 + 1] = br; colBuf[i * 3 + 2] = br * 1.1;
    }
  }

  const is2D = core.panelMode === '2d';
  const faces = is2D ? [0] : [0, 1, 2, 3];

  const body = core.effectOptions?.moon?.body || 'moon';
  if (body === 'saturn') {
    drawSaturn(core, faces, S, S, tt);
  } else if (body === 'solarsystem') {
    drawSolarSystem(core, faces, S, S, tt, core.effectOptions?.moon?.solarSpeed ?? 0);
  } else if (body !== 'moon') {
    drawPlanet(core, body, faces, S, S, tt);
  }

  const mi0 = getMoonIllumination(new Date());

  if (body === 'moon') {
    const moonRad = Math.round(S * 0.42) - 1;
    const cx = Math.round(S / 2), cy = Math.round(S / 2) + 4;

    const frac = mi0.fraction; // 0=new, 1=full
    const waxing = phase < 0.5;
    const termPos = frac * 2 - 1; // -1=new, 0=quarter, +1=full

    const lat = MOON_LAT_DEFAULT;
    const hourNow = (Date.now() % 86400000) / 3600000;
    const tiltBase = lat * Math.PI / 180 * 0.4;
    const tiltShift = Math.sin((hourNow / 24) * Math.PI * 2) * 0.3;
    const tilt = tiltBase + tiltShift;
    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);

    for (const face of faces) {
      for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
        const dx = (u - cx) / moonRad, dy = (v - cy) / moonRad;
        const d2 = dx * dx + dy * dy;
        if (d2 > 1) continue;

        const idx = faceMap[face][v * S + u]; if (idx < 0) continue;

        const nz = Math.sqrt(1 - d2);
        const ny = dy;
        const nx = dx * cosT - dy * sinT;
        const nyRot = dx * sinT + dy * cosT;

        const rowR = Math.sqrt(Math.max(0, 1 - nyRot * nyRot));
        const termAt = termPos * rowR;
        let lit;
        if (waxing) {
          lit = nx > -termAt;
        } else {
          lit = nx < termAt;
        }

        if (!lit) {
          const es = 0.06 + 0.03 * nz;
          colBuf[idx * 3] = es * 0.85;
          colBuf[idx * 3 + 1] = es * 0.85;
          colBuf[idx * 3 + 2] = es * 0.9;
          continue;
        }

        let lr = 0.72, lg = 0.70, lb = 0.65;

        for (const m of moonMaria) {
          const mdx = (dx - m.cx) / m.rx, mdy = (dy - m.cy) / m.ry;
          const md = mdx * mdx + mdy * mdy;
          if (md < 1) {
            const mf = Math.pow(1 - md, 0.8) * 0.35;
            lr -= mf * 0.15; lg -= mf * 0.12; lb -= mf * 0.05;
          }
        }

        for (const c of moonCraters) {
          const cdx = dx - c.cx, cdy = dy - c.cy;
          const cd = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cd < c.r * 1.3) {
            if (cd < c.r * 0.85) {
              const cf = c.depth * (1 - cd / (c.r * 0.85));
              lr -= cf; lg -= cf; lb -= cf;
            } else if (cd < c.r * 1.15) {
              const rimBr = 0.12 * (1 + nx * 0.5);
              lr += rimBr; lg += rimBr; lb += rimBr;
            }
          }
        }

        const noise = ((((u * 7919 + v * 6271) >>> 0) % 100) / 100 - 0.5) * 0.06;
        lr += noise; lg += noise; lb += noise;

        const limb = 0.75 + 0.25 * nz;
        lr *= limb; lg *= limb; lb *= limb;

        lr += ny * 0.02;
        lb -= ny * 0.015;

        colBuf[idx * 3] = Math.max(0, Math.min(1, lr));
        colBuf[idx * 3 + 1] = Math.max(0, Math.min(1, lg));
        colBuf[idx * 3 + 2] = Math.max(0, Math.min(1, lb));
      }
    }
  }

  // Scrolling phase/name text at bottom of face 0 (and faces 1-3 in cube mode)
  const mi = mi0;
  const illum = Math.round(mi.fraction * 100);
  const ph = mi.phase;
  const pName = ph < 0.03 ? 'New Moon' : ph < 0.22 ? 'Waxing Crescent' : ph < 0.28 ? 'First Quarter' : ph < 0.47 ? 'Waxing Gibbous' : ph < 0.53 ? 'Full Moon' : ph < 0.72 ? 'Waning Gibbous' : ph < 0.78 ? 'Last Quarter' : ph < 0.97 ? 'Waning Crescent' : 'New Moon';
  const bodyNames = { blackhole: 'Black Hole', solarsystem: 'Solar System' };
  const axisTilts = { mercury: 0.03, venus: 177.4, earth: 23.4, mars: 25.2, jupiter: 3.1, saturn: 26.7, uranus: 97.8, neptune: 28.3, pluto: 122.5, sun: 7.25 };
  const tiltDeg = axisTilts[body];
  const tiltStr = tiltDeg !== undefined ? ` ${Math.round(tiltDeg)}°` : '';
  const moonText = body === 'moon' ? `${pName} ${illum}%` : (bodyNames[body] || body.charAt(0).toUpperCase() + body.slice(1)) + tiltStr;

  const charW = 4, textW = moonText.length * charW;
  const needScroll = textW > S;
  if (needScroll) _moonScrollX = (_moonScrollX + dt * 14) % (textW + S);
  else _moonScrollX = 0;
  const textBaseV = 1;
  const scrollOff = needScroll ? Math.floor(S - _moonScrollX) : Math.floor((S - textW) / 2);
  const mFaces = is2D ? [0] : [0, 1, 2, 3];
  for (let fi = 0; fi < mFaces.length; fi++) {
    const face = mFaces[fi];
    for (let ci = 0; ci < moonText.length; ci++) {
      const cxx = scrollOff + ci * charW;
      moonGlyph(core, face, moonText[ci], cxx, textBaseV);
    }
  }
}

module.exports = effectCelestial;
