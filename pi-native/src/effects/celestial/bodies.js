// Ported verbatim (math unchanged) from effects-livedata.js's drawSaturn()
// (line ~2029) and drawPlanet() (line ~2215) - the per-body renderers used
// by celestial.js's effectMoon() port for every "Celestial" body other than
// the Moon itself and the multi-body Solar System view (see solarsystem.js
// for that one). Same plumbing swap as every other ported effect: SIZE/
// faceMap/colBuf come from `core`, and the one bit of real UI state each
// function used to read directly off the DOM (document.getElementById) now
// comes through core.effectOptions.moon instead - see celestial.js's
// dispatch for how that's threaded in.
//
// Earth's real-time cloud cover fetch (_earthFetchClouds) uses the global
// `fetch`/`atob` Node 18+ already provides - no DOM needed, unlike the
// browser's Image/canvas-based tickers elsewhere in this codebase.
const EARTH_MAP_B64 = require('./earthMap');

const _EARTH_W = 360, _EARTH_H = 180;
let _earthMapBuf = null;
function _earthInitMap() {
  if (_earthMapBuf) return;
  const b = atob(EARTH_MAP_B64);
  _earthMapBuf = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) _earthMapBuf[i] = b.charCodeAt(i);
}
function _earthIsLand(lonDeg, latDeg) {
  _earthInitMap();
  const x = Math.floor(((lonDeg + 180) % 360 + 360) % 360) % _EARTH_W;
  const y = Math.max(0, Math.min(_EARTH_H - 1, Math.floor(89.5 - latDeg + 0.5)));
  const i = y * _EARTH_W + x;
  return (_earthMapBuf[i >> 3] >> (7 - (i & 7))) & 1;
}
const _cloudLats = [-75, -45, -15, 15, 45, 75], _cloudLons = [-165, -135, -105, -75, -45, -15, 15, 45, 75, 105, 135, 165];
const _cloudCache = { grid: null, ts: 0 };
function _earthFetchClouds() {
  if (Date.now() - _cloudCache.ts < 1800000 && _cloudCache.grid) return;
  _cloudCache.ts = Date.now();
  const la = [], lo = [];
  for (const lat of _cloudLats) for (const lon of _cloudLons) { la.push(lat); lo.push(lon); }
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}&current=cloud_cover&forecast_days=1`)
    .then((r) => r.json()).then((d) => {
      if (!Array.isArray(d)) return;
      const g = new Float32Array(72);
      for (let i = 0; i < 72; i++) g[i] = (d[i]?.current?.cloud_cover ?? 50) / 100;
      _cloudCache.grid = g;
    }).catch(() => {});
}
function _earthCloudAt(lonD, latD) {
  const g = _cloudCache.grid;
  if (!g) return -1;
  const la = _cloudLats, lo = _cloudLons;
  let yi = 0; for (; yi < la.length - 1; yi++) if (latD < la[yi + 1]) break;
  let nl = ((lonD + 180) % 360 + 360) % 360 - 180;
  let xi = 0; for (; xi < lo.length - 1; xi++) if (nl < lo[xi + 1]) break;
  const yi2 = Math.min(yi + 1, la.length - 1), xi2 = (xi + 1) % lo.length;
  let lw = lo[xi2 < xi ? xi2 + 12 : xi2] - lo[xi]; if (lw <= 0) lw += 360;
  const fx = Math.max(0, Math.min(1, lw ? ((nl - lo[xi] + 360) % 360) / lw : 0));
  const fy = Math.max(0, Math.min(1, la[yi2] !== la[yi] ? (latD - la[yi]) / (la[yi2] - la[yi]) : 0));
  return g[yi * 12 + xi] * (1 - fx) * (1 - fy) + g[yi * 12 + xi2] * fx * (1 - fy) + g[yi2 * 12 + xi] * (1 - fx) * fy + g[yi2 * 12 + xi2] * fx * fy;
}

function drawSaturn(core, faces, W, H, tt) {
  const { colBuf, faceMap } = core;
  const textTop = 7, topLimit = H - 3;
  const cy = Math.round((textTop + topLimit) / 2);
  const cx = W / 2;
  const halfW = cx - 2;
  const halfH = Math.min(cy - textTop, topLimit - cy);
  const now = new Date();
  const daysSinceJ2000 = (now.getTime() - 946728000000) / 86400000;
  const satLonDeg = (50.077 + 0.03346 * daysSinceJ2000) % 360;
  const ringIncl = 26.73 * Math.PI / 180, ringNode = 169.5;
  const B = Math.asin(Math.sin(ringIncl) * Math.sin((satLonDeg - ringNode) * Math.PI / 180));
  const tiltY = Math.max(0.06, Math.abs(Math.sin(B)));
  const ringFromNorth = B > 0;
  const stilt = 26.7 * Math.PI / 180;
  const sct = Math.cos(stilt), sst = Math.sin(stilt);
  const satRot = (daysSinceJ2000 / 0.44401) * Math.PI * 2;
  const satCosR = Math.cos(satRot), satSinR = Math.sin(satRot);
  const rng = (s) => ((s * 2654435761) >>> 0) / 4294967296;
  const ringMult = 1.95;
  const horizExtent = ringMult * Math.abs(sct) + ringMult * tiltY * Math.abs(sst);
  const vertExtent = ringMult * Math.abs(sst) + ringMult * tiltY * Math.abs(sct);
  const pRad = Math.max(4, Math.round(Math.min(halfW / horizExtent, halfH / Math.max(1, vertExtent))));
  const ringInner = pRad * 1.25, ringOuter = pRad * ringMult;

  for (const face of faces) {
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
      const px = u - cx, py = v - cy;
      const dx = px / pRad, dy = py / pRad;
      const d2 = dx * dx + dy * dy;

      const rpx = px * sct + py * sst, rpy = -px * sst + py * sct;
      const ringDx = rpx, ringDy = rpy / tiltY;
      const ringDist = Math.sqrt(ringDx * ringDx + ringDy * ringDy);
      const onRing = ringDist >= ringInner && ringDist <= ringOuter;
      const ringBehind = ringFromNorth ? (rpy > 0) : (rpy < 0);

      let pr = -1, pg = -1, pb = -1;

      if (onRing && ringBehind && d2 > 1) {
        const ringFrac = (ringDist - ringInner) / (ringOuter - ringInner);
        const gap1 = Math.abs(ringFrac - 0.22) < 0.03;
        const gap2 = Math.abs(ringFrac - 0.60) < 0.02;
        const gap3 = Math.abs(ringFrac - 0.85) < 0.015;
        if (!(gap1 || gap2 || gap3)) {
          const bri = 0.45 + 0.3 * (1 - ringFrac);
          const noise = ((rng(u * 7919 + v * 6271) * 2 - 1) * 0.04);
          let rr = 0.76 + noise, rg = 0.68 + noise, rb = 0.55 + noise;
          if (ringFrac < 0.3) { rr *= 0.85; rg *= 0.75; rb *= 0.65; }
          else if (ringFrac > 0.7) { rr *= 0.7; rg *= 0.65; rb *= 0.55; }
          const shadowFade = Math.min(1, Math.abs(ringDist - pRad * 1.05) / (pRad * 0.2));
          pr = rr * bri * shadowFade; pg = rg * bri * shadowFade; pb = rb * bri * shadowFade;
        } else {
          pr = 0.01; pg = 0.01; pb = 0.015;
        }
      }

      if (d2 <= 1) {
        const nz = Math.sqrt(1 - d2);
        const limb = 0.7 + 0.3 * nz;
        const stdx = dx * sct + dy * sst, stdy = -dx * sst + dy * sct;
        const srdx = stdx * satCosR - nz * satSinR;
        const band = stdy;
        pr = 0.82; pg = 0.72; pb = 0.52;
        const b1 = Math.sin(band * 12) * 0.08;
        const b2 = Math.sin(band * 25 + 1.5) * 0.04;
        const b3 = Math.sin(band * 50 + 3) * 0.02;
        pr += b1 + b2 + b3;
        pg += b1 * 0.8 + b2 * 0.7 + b3;
        pb += b1 * 0.3 + b2 * 0.2 + b3 * 0.5;
        const storm1 = Math.exp(-Math.pow((band - 0.15) * 8, 2)) * 0.12;
        const storm2 = Math.exp(-Math.pow((band + 0.3) * 10, 2)) * 0.08;
        pr += storm1 + storm2; pg += storm1 * 0.6 + storm2 * 0.5; pb -= storm1 * 0.1;
        const polar = Math.exp(-Math.pow(band * 1.8, 4)) * 0.15;
        pr -= polar * 0.3; pg -= polar * 0.2; pb += polar * 0.1;
        const noise = ((rng(u * 3571 + v * 2411) * 2 - 1) * 0.025);
        pr += noise; pg += noise; pb += noise;
        const illum = 0.6 + 0.4 * (dx * 0.5 + nz * 0.7);
        pr *= limb * illum; pg *= limb * illum; pb *= limb * illum;
        const shadowOff = ringFromNorth ? -tiltY * 0.4 : tiltY * 0.4;
        const shadowBand = Math.exp(-Math.pow((stdy + shadowOff) * 6, 2)) * 0.25;
        if (stdx < 0.3) { pr -= shadowBand; pg -= shadowBand; pb -= shadowBand; }
      }

      if (onRing && !ringBehind) {
        const ringFrac = (ringDist - ringInner) / (ringOuter - ringInner);
        const gap1 = Math.abs(ringFrac - 0.22) < 0.03;
        const gap2 = Math.abs(ringFrac - 0.60) < 0.02;
        const gap3 = Math.abs(ringFrac - 0.85) < 0.015;
        if (!(gap1 || gap2 || gap3)) {
          const bri = 0.5 + 0.3 * (1 - ringFrac);
          const noise = ((rng(u * 7919 + v * 6271) * 2 - 1) * 0.04);
          let rr = 0.78 + noise, rg = 0.70 + noise, rb = 0.56 + noise;
          if (ringFrac < 0.3) { rr *= 0.85; rg *= 0.75; rb *= 0.65; }
          else if (ringFrac > 0.7) { rr *= 0.7; rg *= 0.65; rb *= 0.55; }
          pr = rr * bri; pg = rg * bri; pb = rb * bri;
        }
      }

      if (pr >= 0) {
        colBuf[idx * 3] = Math.max(0, Math.min(1, pr));
        colBuf[idx * 3 + 1] = Math.max(0, Math.min(1, pg));
        colBuf[idx * 3 + 2] = Math.max(0, Math.min(1, pb));
      }
    }
  }

  const axDx = -Math.sin(stilt), axDy = Math.cos(stilt);
  const axLen = pRad * 0.35;
  for (const face of faces) {
    for (let pole = -1; pole <= 1; pole += 2) {
      const startX = cx + pole * axDx * (pRad + 1);
      const startY = cy + pole * axDy * (pRad + 1);
      const endX = cx + pole * axDx * (pRad + axLen);
      const endY = cy + pole * axDy * (pRad + axLen);
      const steps = Math.ceil(axLen * 1.5);
      for (let s = 0; s <= steps; s++) {
        const frac = s / steps;
        const u = Math.round(startX + (endX - startX) * frac);
        const v = Math.round(startY + (endY - startY) * frac);
        if (u < 0 || u >= W || v < 0 || v >= H) continue;
        const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
        const textDim = v <= 6 ? 0.2 : 1.0;
        const fade = 0.7 * (1 - frac * 0.3) * textDim;
        colBuf[idx * 3] = Math.max(colBuf[idx * 3], fade);
        colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], fade);
        colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], fade * 1.2);
      }
    }
  }
}

function drawPlanet(core, body, faces, W, H, tt) {
  const { colBuf, faceMap } = core;
  const textTop = 7;
  const topLimit = H - 3;
  const cy = Math.round((textTop + topLimit) / 2);
  const cx = W / 2;
  const halfH = Math.min(cy - textTop, topLimit - cy);
  const halfW = cx - 2;
  const extent = body === 'blackhole' ? 1.5 : 1.0;
  const pRad = Math.max(4, Math.round(Math.min(halfH, halfW) / extent));
  const rng = (s) => ((s * 2654435761) >>> 0) / 4294967296;
  const tilts = { mercury: 0.03, venus: 177.4, earth: 23.4, mars: 25.2, jupiter: 3.1, uranus: 97.8, neptune: 28.3, pluto: 122.5, sun: 7.25 };
  const tiltRad = (tilts[body] || 0) * Math.PI / 180;
  const ct = Math.cos(tiltRad), st = Math.sin(tiltRad);
  const rotPeriods = {
    mercury: 58.646, venus: -243.025, earth: 0.99727, mars: 1.02596,
    jupiter: 0.41354, saturn: 0.44401, uranus: -0.71833, neptune: 0.67125, pluto: -6.38718, sun: 25.38,
  };
  const now = new Date();
  const daysSinceJ2000 = (now.getTime() - 946728000000) / 86400000;
  const period = rotPeriods[body] || 1;
  const rot = (daysSinceJ2000 / period) * Math.PI * 2;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);

  if (body === 'earth') {
    _earthFetchClouds();
  }

  for (const face of faces) {
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
      const px = u - cx, py = v - cy;
      const dx = px / pRad, dy = py / pRad;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const limb = 0.7 + 0.3 * nz;
      const illum = 0.6 + 0.4 * (dx * 0.5 + nz * 0.7);
      const tdx = dx * ct + dy * st, tdy = -dx * st + dy * ct;
      const rdx = tdx * cosR - nz * sinR;
      const rnz = tdx * sinR + nz * cosR;
      const noise = (rng(u * 7919 + v * 6271) * 2 - 1) * 0.03;
      let pr, pg, pb;

      if (body === 'sun' || body === 'blackhole') continue;

      if (body === 'mercury') {
        pr = 0.55 + noise; pg = 0.53 + noise; pb = 0.50 + noise;
        for (let ci = 0; ci < 20; ci++) {
          const ccx = (rng(ci * 1237) * 2 - 1) * 0.7, ccy = (rng(ci * 3571) * 2 - 1) * 0.7;
          const cr = 0.04 + rng(ci * 4919) * 0.08;
          const cdx = rdx - ccx, cdy = tdy - ccy;
          const cd = Math.sqrt(cdx * cdx + cdy * cdy);
          if (cd < cr) { const f = 0.12 * (1 - cd / cr); pr -= f; pg -= f; pb -= f; }
          else if (cd < cr * 1.3) { const f = 0.06; pr += f; pg += f; pb += f; }
        }
        pr += Math.sin(rdx * 8 + tdy * 6) * 0.03;
        pg += Math.sin(rdx * 6 - tdy * 8) * 0.02;
      } else if (body === 'venus') {
        pr = 0.90 + noise * 0.5; pg = 0.85 + noise * 0.5; pb = 0.70 + noise * 0.5;
        const cloud1 = Math.sin(tdy * 10 + Math.sin(rdx * 4) * 2) * 0.06;
        const cloud2 = Math.sin(tdy * 18 + rdx * 3) * 0.03;
        const cloud3 = Math.sin((rdx + tdy) * 7) * 0.04;
        pr += cloud1 + cloud2; pg += cloud1 + cloud2 + cloud3; pb += cloud1 * 0.5 + cloud3;
        const limbGlow = (1 - nz) * 0.15;
        pr += limbGlow * 0.8; pg += limbGlow * 0.7; pb += limbGlow * 0.5;
      } else if (body === 'earth') {
        const eLat = Math.asin(tdy), eLon = Math.atan2(rdx, rnz);
        const eLatD = eLat * 180 / Math.PI, eLonD = eLon * 180 / Math.PI;
        const eAbsLat = Math.abs(eLatD);
        const eLand = _earthIsLand(eLonD, eLatD);
        if (eLand) {
          if (eAbsLat > 72) { pr = 0.82; pg = 0.86; pb = 0.90; }
          else if (eAbsLat > 58) { pr = 0.28; pg = 0.38; pb = 0.22; }
          else if (eAbsLat < 28 && ((eLonD > -18 && eLonD < 42 && eLatD > 15) || (eLonD > 42 && eLonD < 62 && eLatD > 14 && eLatD < 32) || (eLonD > 118 && eLonD < 152 && eLatD < -14 && eLatD > -32))) {
            pr = 0.72; pg = 0.58; pb = 0.32;
          } else if (eAbsLat < 18) { pr = 0.10; pg = 0.36; pb = 0.08; }
          else { pr = 0.20; pg = 0.42; pb = 0.14; }
          pr += noise * 0.8; pg += noise * 0.8; pb += noise * 0.5;
          const elev = Math.sin(eLon * 5 + eLat * 7) * 0.5 + Math.sin(eLon * 11 - eLat * 9) * 0.3;
          if (elev > 0.3) { const ef = (elev - 0.3) * 0.08; pr += ef; pg += ef * 0.7; pb += ef * 0.5; }
        } else {
          pr = 0.04; pg = 0.08; pb = 0.32;
          const wd = (Math.sin(eLon * 7 + eLat * 5) * 0.5 + 0.5) * 0.06;
          pr += wd * 0.1; pg += wd * 0.3; pb += wd;
        }
        let cc = _earthCloudAt(eLonD, eLatD);
        const cn1 = Math.sin(rdx * 9 + tdy * 7 + tt * 0.3) * 0.5 + 0.5;
        const cn2 = Math.sin(rdx * 16 - tdy * 11 + tt * 0.15) * 0.5 + 0.5;
        const cn3 = Math.sin((rdx + tdy) * 6 - tt * 0.2) * 0.5 + 0.5;
        if (cc < 0) cc = cn1 * 0.4 + cn2 * 0.25 + cn3 * 0.15;
        else cc = cc * 0.6 + (cn1 * 0.3 + cn2 * 0.2) * 0.4;
        if (cc > 0.25) {
          const cf = Math.min(0.85, (cc - 0.25) * 1.2);
          pr = pr * (1 - cf) + 0.92 * cf; pg = pg * (1 - cf) + 0.94 * cf; pb = pb * (1 - cf) + 0.97 * cf;
        }
        const atm = (1 - nz) * (1 - nz) * 0.3;
        pr += atm * 0.25; pg += atm * 0.45; pb += atm * 0.9;
      } else if (body === 'mars') {
        pr = 0.75 + noise; pg = 0.35 + noise * 0.7; pb = 0.15 + noise * 0.4;
        const m1 = Math.exp(-((rdx - 0.1) * (rdx - 0.1) + (tdy + 0.1) * (tdy + 0.1)) * 8) * 0.15;
        const m2 = Math.exp(-((rdx + 0.3) * (rdx + 0.3) + (tdy - 0.2) * (tdy - 0.2)) * 6) * 0.12;
        const m3 = Math.exp(-((rdx - 0.4) * (rdx - 0.4) + (tdy + 0.3) * (tdy + 0.3)) * 10) * 0.10;
        pr -= m1 + m2 + m3; pg -= m1 * 0.5 + m2 * 0.4 + m3 * 0.3;
        if (tdy < -0.7) { const f = Math.min(1, (-0.7 - tdy) * 4); pr += f * 0.25; pg += f * 0.25; pb += f * 0.30; }
        if (tdy > 0.75) { const f = Math.min(1, (tdy - 0.75) * 5); pr += f * 0.20; pg += f * 0.20; pb += f * 0.25; }
        const dust = Math.sin(rdx * 6 + tdy * 4) * 0.04;
        pr += dust; pg += dust * 0.5;
      } else if (body === 'jupiter') {
        pr = 0.80 + noise; pg = 0.70 + noise; pb = 0.55 + noise;
        const b1 = Math.sin(tdy * 14) * 0.10;
        const b2 = Math.sin(tdy * 28 + 1.5) * 0.06;
        const b3 = Math.sin(tdy * 55 + 3) * 0.03;
        const b4 = Math.sin(tdy * 7) * 0.08;
        pr += b1 + b2 + b3 + b4;
        pg += b1 * 0.7 + b2 * 0.6 + b3 + b4 * 0.8;
        pb += b1 * 0.2 + b2 * 0.1 + b3 * 0.5 + b4 * 0.3;
        const turb = Math.sin(rdx * 15 + Math.sin(tdy * 20) * 3) * 0.03;
        pr += turb; pg += turb * 0.8;
        const spotDx2 = (rdx - 0.3) / 0.18, spotDy = (tdy - 0.2) / 0.12;
        const spotD = spotDx2 * spotDx2 + spotDy * spotDy;
        if (spotD < 1) {
          const sf = (1 - spotD) * 0.3;
          pr += sf * 0.4; pg -= sf * 0.15; pb -= sf * 0.2;
          const swirl = Math.sin(Math.atan2(spotDy, spotDx2) * 3) * 0.05;
          pr += swirl; pg += swirl * 0.3;
        }
        const polar = Math.exp(-Math.pow(tdy * 1.8, 4)) * 0.12;
        pr -= polar * 0.2; pg -= polar * 0.15; pb += polar * 0.05;
      } else if (body === 'uranus') {
        pr = 0.60 + noise * 0.5; pg = 0.82 + noise * 0.5; pb = 0.85 + noise * 0.5;
        const ub = Math.sin(tdy * 12) * 0.03;
        pr += ub * 0.5; pg += ub; pb += ub;
        const atm = Math.sin(rdx * 5 + tdy * 3) * 0.02;
        pg += atm; pb += atm;
      } else if (body === 'neptune') {
        pr = 0.20 + noise * 0.5; pg = 0.35 + noise * 0.5; pb = 0.80 + noise * 0.5;
        const nb1 = Math.sin(tdy * 12) * 0.05;
        const nb2 = Math.sin(tdy * 24 + 2) * 0.03;
        pr += nb1 * 0.3; pg += nb1 * 0.5 + nb2 * 0.4; pb += nb1 + nb2;
        const dsDx = (rdx - 0.2) / 0.15, dsDy = (tdy + 0.15) / 0.10;
        const dsD = dsDx * dsDx + dsDy * dsDy;
        if (dsD < 1) {
          const sf = (1 - dsD) * 0.15;
          pr -= sf * 0.5; pg -= sf * 0.3; pb -= sf * 0.1;
        }
        const atm = Math.sin(rdx * 8) * 0.03;
        pg += atm * 0.5; pb += atm;
      } else if (body === 'pluto') {
        pr = 0.68 + noise; pg = 0.58 + noise; pb = 0.48 + noise;

        const spX = rdx + 0.18, spY = tdy + 0.05;
        const spD = Math.sqrt(spX * spX * 1.3 + spY * spY * 1.6);
        const spR = 0.28;
        if (spD < spR) {
          const f = Math.pow(1 - spD / spR, 0.6);
          const poly = Math.sin(spX * 40) * Math.sin(spY * 35) * 0.015;
          pr = pr * (1 - f) + (0.88 + poly) * f;
          pg = pg * (1 - f) + (0.85 + poly) * f;
          pb = pb * (1 - f) + (0.78 + poly) * f;
        }
        const rlX = rdx - 0.12, rlY = tdy + 0.02;
        const rlD = Math.sqrt(rlX * rlX * 1.8 + rlY * rlY * 1.4);
        const rlR = 0.22;
        if (rlD < rlR) {
          const f = Math.pow(1 - rlD / rlR, 0.5) * 0.75;
          const rough = (rng(Math.floor(rdx * 30) * 997 + Math.floor(tdy * 30) * 631) * 2 - 1) * 0.04;
          pr = pr * (1 - f) + (0.82 + rough) * f;
          pg = pg * (1 - f) + (0.78 + rough) * f;
          pb = pb * (1 - f) + (0.70 + rough) * f;
        }

        const cmX = rdx + 0.55, cmY = tdy + 0.05;
        const cmD = Math.sqrt(cmX * cmX * 0.6 + cmY * cmY * 2.5);
        if (cmD < 0.4) {
          const f = Math.pow(1 - cmD / 0.4, 0.8) * 0.55;
          pr = pr * (1 - f) + 0.30 * f;
          pg = pg * (1 - f) + 0.18 * f;
          pb = pb * (1 - f) + 0.12 * f;
        }

        const eqBand = Math.exp(-tdy * tdy * 12) * 0.18;
        const heartMask = Math.max(0, 1 - Math.max(0, 1 - spD / spR) * 2 - Math.max(0, 1 - rlD / rlR) * 2);
        const eqF = eqBand * heartMask;
        pr -= eqF * 0.6; pg -= eqF * 0.8; pb -= eqF * 0.9;

        if (Math.abs(tdy) > 0.55) {
          const pf = Math.min(1, (Math.abs(tdy) - 0.55) * 3) * 0.2;
          pr += pf * 0.9; pg += pf * 0.85; pb += pf * 0.75;
        }

        const t1 = Math.sin(rdx * 14 + tdy * 11) * 0.025;
        const t2 = Math.sin(rdx * 23 - tdy * 17) * 0.015;
        pr += t1 + t2; pg += (t1 + t2) * 0.7; pb += (t1 + t2) * 0.4;

        for (let ci = 0; ci < 10; ci++) {
          const ccx2 = (rng(ci * 8731) * 2 - 1) * 0.7, ccy2 = (rng(ci * 4217) * 2 - 1) * 0.7;
          const cr2 = 0.03 + rng(ci * 2917) * 0.05;
          const cd2 = Math.sqrt((rdx - ccx2) * (rdx - ccx2) + (tdy - ccy2) * (tdy - ccy2));
          if (cd2 < cr2) {
            const cf = 0.06 * (1 - cd2 / cr2);
            pr -= cf; pg -= cf * 0.8; pb -= cf * 0.6;
          }
        }
      }

      pr *= limb * illum; pg *= limb * illum; pb *= limb * illum;
      colBuf[idx * 3] = Math.max(0, Math.min(1, pr));
      colBuf[idx * 3 + 1] = Math.max(0, Math.min(1, pg));
      colBuf[idx * 3 + 2] = Math.max(0, Math.min(1, pb));
    }
  }

  if (body !== 'sun' && body !== 'blackhole' && body !== 'solarsystem') {
    const axDx = -Math.sin(tiltRad), axDy = Math.cos(tiltRad);
    const axLen = pRad * 0.35;
    for (const face of faces) {
      for (let pole = -1; pole <= 1; pole += 2) {
        const startX = cx + pole * axDx * (pRad + 1);
        const startY = cy + pole * axDy * (pRad + 1);
        const endX = cx + pole * axDx * (pRad + axLen);
        const endY = cy + pole * axDy * (pRad + axLen);
        const steps = Math.ceil(axLen * 1.5);
        for (let s = 0; s <= steps; s++) {
          const frac = s / steps;
          const u = Math.round(startX + (endX - startX) * frac);
          const v = Math.round(startY + (endY - startY) * frac);
          if (u < 0 || u >= W || v < 0 || v >= H) continue;
          const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
          const textDim = v <= 6 ? 0.2 : 1.0;
          const fade = 0.7 * (1 - frac * 0.3) * textDim;
          colBuf[idx * 3] = Math.max(colBuf[idx * 3], fade);
          colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], fade);
          colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], fade * 1.2);
        }
      }
    }
  }

  if (body === 'sun') {
    const sunTilt = 7.25 * Math.PI / 180;
    const sunCt = Math.cos(sunTilt), sunSt = Math.sin(sunTilt);
    for (const face of faces) {
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
        const dx2 = (u - cx) / pRad, dy2 = (v - cy) / pRad;
        const d2 = dx2 * dx2 + dy2 * dy2;
        const d = Math.sqrt(d2);
        if (d > 1.8) continue;
        if (d <= 1) {
          const nz = Math.sqrt(1 - d2);
          const limbDark = 0.85 + 0.15 * nz;
          const stx = dx2 * sunCt - dy2 * sunSt;
          const sty = dx2 * sunSt + dy2 * sunCt;
          const srx = stx * cosR - nz * sinR;
          let sr = 1.0, sg = 0.85, sb = 0.25;
          const g1 = Math.sin(srx * 25 + sty * 18) * 0.04;
          const g2 = Math.sin(srx * 40 - sty * 30) * 0.02;
          sr += g1 + g2; sg += g1 * 0.8 + g2; sb += g1 * 0.3;
          for (let si = 0; si < 5; si++) {
            const sx = (rng(si * 7129) * 2 - 1) * 0.5, sy = (rng(si * 6131) * 2 - 1) * 0.35;
            const sd = ((srx - sx) * (srx - sx) + (sty - sy) * (sty - sy));
            const srad = 0.015 + rng(si * 3917) * 0.025;
            if (sd < srad) { const sf = 1 - sd / srad; sr -= sf * 0.5; sg -= sf * 0.4; sb -= sf * 0.15; }
            if (sd < srad * 2.5) { const pf = Math.pow(1 - sd / (srad * 2.5), 2) * 0.08; sr -= pf * 0.3; sg -= pf * 0.2; }
          }
          const prom = Math.sin(Math.atan2(sty, srx) * 5) * 0.5 + 0.5;
          if (d > 0.85 && prom > 0.7) { sr += 0.1; sg += 0.02; }
          sr *= limbDark; sg *= limbDark; sb *= limbDark;
          colBuf[idx * 3] = Math.max(0, Math.min(1, sr));
          colBuf[idx * 3 + 1] = Math.max(0, Math.min(1, sg));
          colBuf[idx * 3 + 2] = Math.max(0, Math.min(1, sb));
        } else {
          const glow = Math.pow(1 - (d - 1) / 0.8, 2) * 0.4;
          const flicker = 1 + Math.sin(Math.atan2(dy2, dx2) * 8 + tt) * 0.15;
          colBuf[idx * 3] += glow * 1.0 * flicker;
          colBuf[idx * 3 + 1] += glow * 0.7 * flicker;
          colBuf[idx * 3 + 2] += glow * 0.15 * flicker;
        }
      }
    }
  }

  if (body === 'blackhole') {
    const bhRad = Math.round(Math.min(W, H) * 0.15);
    const discInner = bhRad * 1.8, discOuter = bhRad * 4;
    for (const face of faces) {
      for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
        const idx = faceMap[face][v * W + u]; if (idx < 0) continue;
        const px = u - cx, py = v - cy;
        const dist = Math.sqrt(px * px + py * py);
        const discDy = py / 0.3;
        const discDist = Math.sqrt(px * px + discDy * discDy);
        if (discDist >= discInner && discDist <= discOuter && dist > bhRad * 1.3) {
          const df = (discDist - discInner) / (discOuter - discInner);
          const bri = (1 - df) * 0.7;
          const ang = Math.atan2(py, px) + tt * 0.5;
          const spiral = Math.sin(ang * 3 + df * 10) * 0.3 + 0.7;
          const hot = 1 - df;
          colBuf[idx * 3] += bri * spiral * (0.9 + hot * 0.1);
          colBuf[idx * 3 + 1] += bri * spiral * (0.4 + hot * 0.2);
          colBuf[idx * 3 + 2] += bri * spiral * (0.1 + hot * 0.5);
        }
        if (Math.abs(dist - bhRad * 1.4) < bhRad * 0.15) {
          const rf = 1 - Math.abs(dist - bhRad * 1.4) / (bhRad * 0.15);
          const pulse = 0.8 + Math.sin(tt * 3) * 0.2;
          colBuf[idx * 3] += rf * 0.6 * pulse; colBuf[idx * 3 + 1] += rf * 0.45 * pulse; colBuf[idx * 3 + 2] += rf * 0.2 * pulse;
        }
        if (dist < bhRad * 1.2) {
          colBuf[idx * 3] = 0; colBuf[idx * 3 + 1] = 0; colBuf[idx * 3 + 2] = 0;
        }
        if (dist > bhRad * 1.2 && dist < bhRad * 1.6) {
          const lf = Math.pow(1 - Math.abs(dist - bhRad * 1.4) / (bhRad * 0.2), 3) * 0.15;
          const la = Math.sin(Math.atan2(py, px) * 12 + tt) * 0.5 + 0.5;
          colBuf[idx * 3] += lf * la; colBuf[idx * 3 + 1] += lf * la; colBuf[idx * 3 + 2] += lf * la * 1.2;
        }
      }
    }
  }
}

module.exports = { drawSaturn, drawPlanet };
