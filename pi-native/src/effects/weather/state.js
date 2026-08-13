// Ported from effects-livedata.js's weather-effect module-scope state,
// lunar-calculation helpers (wxMoonPhase/getMoonIllumination/getMoonTimes/
// calcMoonRiseSet, based on SunCalc/Jean Meeus - verbatim math, unchanged),
// wxSkyRGB, and wxInitScene (procedural skyline + creature generation,
// including all ~19 hardcoded city-landmark silhouettes).
//
// The browser keeps this as bare module-scope `let`/`const` globals; here
// it's a single mutable object (`wxState`) so multiple CubeCore instances
// (if this ever runs more than one) don't collide, and so app.js can pass
// it around explicitly rather than relying on Node having no equivalent to
// the browser's implicit `window` global (see the weather.js module
// comment for why that distinction matters - effectWeather's `this.
// _wxNextStrike` in the original relies on `this` resolving to `window` in
// a non-strict bare function call, which does NOT happen in Node).

const WX_CODES = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  77: 'Snow grains', 80: 'Showers', 81: 'Heavy showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm+hail', 99: 'Severe thunderstorm',
};

// ── Lunar calculations (based on SunCalc / Jean Meeus) - verbatim ──
const _MR = Math.PI / 180, _MD = 180 / Math.PI, _DJ = 2451545;
function _toJulian(d) { return d.valueOf() / 86400000 - 0.5 + 2440588; }
function _toDays(d) { return _toJulian(d) - _DJ; }

function _moonCoords(d) {
  const L = _MR * (218.316 + 13.176396 * d),
    M = _MR * (134.963 + 13.064993 * d),
    F = _MR * (93.272 + 13.229350 * d),
    l = L + _MR * 6.289 * Math.sin(M),
    b = _MR * 5.128 * Math.sin(F),
    dt = 385001 - 20905 * Math.cos(M),
    e = _MR * 23.4393;
  return {
    ra: Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)),
    dec: Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)),
    dist: dt,
  };
}
function _sunCoords(d) {
  const M = _MR * (357.5291 + 0.98560028 * d),
    C = _MR * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)),
    L = M + C + _MR * 282.9372,
    e = _MR * 23.4393;
  return { ra: Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L)), dec: Math.asin(Math.sin(L) * Math.sin(e)) };
}
function _siderealTime(d, lw) { return _MR * (280.16 + 360.9856235 * d) - lw; }

function getMoonIllumination(date) {
  const d = _toDays(date || new Date()),
    s = _sunCoords(d), m = _moonCoords(d),
    sdist = 149598000,
    phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)),
    inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi)),
    angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI,
    angle,
  };
}

function _hoursLater(d, h) { return new Date(d.valueOf() + h * 36e5); }
function _getMoonAltitude(date, lw, phi) {
  const d = _toDays(date), c = _moonCoords(d),
    H = _siderealTime(d, lw) - c.ra;
  return Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
}

function getMoonTimes(date, lat, lng) {
  const t = new Date(date);
  t.setHours(0, 0, 0, 0);
  const hc = 0.133 * _MR;
  const lw = -lng * _MR, phi = lat * _MR;
  let h0 = _getMoonAltitude(t, lw, phi) - hc, rise, set;
  for (let i = 1; i <= 24; i += 2) {
    const h1 = _getMoonAltitude(_hoursLater(t, i), lw, phi) - hc;
    const h2 = _getMoonAltitude(_hoursLater(t, i + 1), lw, phi) - hc;
    const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), ye = a * xe * xe + b * xe + h1;
    const disc = b * b - 4 * a * h1;
    let roots = 0, x1, x2;
    if (disc >= 0) {
      const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
      x1 = xe - dx; x2 = xe + dx;
      if (Math.abs(x1) <= 1) roots++;
      if (Math.abs(x2) <= 1) roots++;
      if (x1 < -1) x1 = x2;
    }
    if (roots === 1) {
      if (h0 < 0) rise = i + x1;
      else set = i + x1;
    } else if (roots === 2) {
      rise = i + (ye < 0 ? x2 : x1);
      set = i + (ye < 0 ? x1 : x2);
    }
    if (rise !== undefined && set !== undefined) break;
    h0 = h2;
  }
  const result = {};
  if (rise !== undefined) result.rise = _hoursLater(t, rise);
  if (set !== undefined) result.set = _hoursLater(t, set);
  result.alwaysUp = !rise && !set && h0 > 0;
  result.alwaysDown = !rise && !set && h0 <= 0;
  return result;
}

function wxMoonPhase(d) { return getMoonIllumination(d).phase; }
function calcMoonRiseSet(lat, lon, tzOffsetSec) {
  const now = new Date();
  const local = new Date(now.getTime() + tzOffsetSec * 1000 + now.getTimezoneOffset() * 60000);
  const mt = getMoonTimes(local, lat, lon);
  const toSecs = (d) => { if (!d) return -1; const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds(); return h * 3600 + m * 60 + s; };
  return { rise: mt.rise ? toSecs(mt.rise) : -1, set: mt.set ? toSecs(mt.set) : -1 };
}

// Verbatim from effects-livedata.js. Needs wxState.sunriseS/sunsetS bound
// via closure at call time - see wxSkyRGB below, which reads them off the
// passed-in state object instead of module-scope globals.
function wxSkyRGB(df, wxState) {
  const srFrac = wxState.sunriseS / 86400, ssFrac = wxState.sunsetS / 86400;
  const noon = (srFrac + ssFrac) / 2;
  let mapped;
  if (df < srFrac) mapped = 0.25 * (df / srFrac);
  else if (df < noon) mapped = 0.25 + 0.25 * ((df - srFrac) / (noon - srFrac));
  else if (df < ssFrac) mapped = 0.5 + 0.25 * ((df - noon) / (ssFrac - noon));
  else mapped = 0.75 + 0.25 * ((df - ssFrac) / (1 - ssFrac));
  const s = [
    [0.00, [0, 2, 20]], [0.20, [2, 4, 25]], [0.22, [25, 15, 40]],
    [0.25, [180, 90, 40]], [0.27, [240, 160, 60]], [0.30, [100, 180, 240]],
    [0.40, [20, 130, 245]], [0.50, [15, 120, 255]], [0.60, [20, 130, 245]],
    [0.70, [80, 160, 240]], [0.73, [240, 160, 50]], [0.75, [220, 80, 30]],
    [0.80, [30, 10, 30]], [1.00, [0, 2, 20]],
  ];
  let a = s[0], b = s[s.length - 1];
  for (let i = 0; i < s.length - 1; i++) { if (mapped >= s[i][0] && mapped < s[i + 1][0]) { a = s[i]; b = s[i + 1]; break; } }
  const m = (mapped - a[0]) / (b[0] - a[0] || 1);
  return [(a[1][0] + (b[1][0] - a[1][0]) * m) / 255, (a[1][1] + (b[1][1] - a[1][1]) * m) / 255, (a[1][2] + (b[1][2] - a[1][2]) * m) / 255];
}

// ── Landmark silhouettes - verbatim from effects-livedata.js's wxInitScene ──
function buildLandmarks() {
  return {
    'paris': { name: 'eiffel', h: 24, w: 14, draw(li, row) {
      const mid = 7;
      if (row === 0) return li === mid - 5 || li === mid - 4 || li === mid + 4 || li === mid + 5;
      if (row === 1) return li === mid - 4 || li === mid - 3 || li === mid + 3 || li === mid + 4;
      if (row === 2) return li === mid - 3 || li === mid - 2 || li === mid + 2 || li === mid + 3;
      if (row === 3) return li === mid - 3 || li === mid + 3;
      if (row === 4) return li === mid - 2 || li === mid + 2;
      if (row === 5) return Math.abs(li - mid) <= 4;
      if (row === 6) return li === mid - 2 || li === mid - 1 || li === mid + 1 || li === mid + 2;
      if (row === 7) return li === mid - 2 || li === mid + 2;
      if (row === 8) return li === mid - 1 || li === mid + 1;
      if (row === 9) return Math.abs(li - mid) <= 3;
      if (row < 13) return li === mid - 1 || li === mid || li === mid + 1;
      if (row === 13) return Math.abs(li - mid) <= 2;
      if (row < 18) return li === mid;
      if (row === 18) return li === mid - 1 || li === mid || li === mid + 1;
      if (row < 24) return li === mid;
      return false;
    } },
    'cairo': { name: 'pyramid', h: 10, w: 28, draw(li, row) {
      const p1 = Math.abs(li - 9) <= Math.max(0, 9 - row);
      const p2 = Math.abs(li - 21) <= Math.max(0, 6 - Math.floor(row * 7 / 10));
      return p1 || p2;
    } },
    'london': { name: 'bigben', h: 22, w: 10, draw(li, row) {
      const mid = 5;
      if (row < 3) return li >= 1 && li <= 8;
      if (row === 3) return li >= 1 && li <= 8 && li !== 4 && li !== 5;
      if (row === 4) return li >= 1 && li <= 8;
      if (row < 8) return Math.abs(li - mid) <= 2;
      if (row === 8) return Math.abs(li - mid) <= 3;
      if (row === 9) return Math.abs(li - mid) <= 3 && Math.abs(li - mid) !== 0;
      if (row === 10) return Math.abs(li - mid) <= 3;
      if (row < 14) return Math.abs(li - mid) <= 2;
      if (row === 14) return Math.abs(li - mid) <= 3;
      if (row === 15) return Math.abs(li - mid) <= 2;
      if (row === 16) return Math.abs(li - mid) <= 2;
      if (row === 17) return Math.abs(li - mid) <= 1;
      if (row < 22) return li === mid;
      return false;
    } },
    'new york': { name: 'statue', h: 22, w: 12, draw(li, row) {
      const mid = 5;
      if (row < 2) return Math.abs(li - mid) <= 4;
      if (row < 4) return Math.abs(li - mid) <= 3;
      if (row < 6) return Math.abs(li - mid) <= 2;
      if (row === 6) return Math.abs(li - mid) <= 2;
      if (row === 7) return Math.abs(li - mid) <= 2;
      if (row < 10) return Math.abs(li - mid) <= 1;
      if (row === 10) return Math.abs(li - mid) <= 2;
      if (row === 11) return li === mid - 1 || li === mid || li === mid + 1 || li === mid + 3;
      if (row === 12) return li === mid || li === mid + 3;
      if (row === 13) return li === mid || li === mid + 3;
      if (row === 14) return li === mid || li === mid + 3;
      if (row === 15) return li === mid - 1 || li === mid || li === mid + 1 || li === mid + 3;
      if (row === 16) return li === mid + 2 || li === mid + 3 || li === mid + 4;
      if (row === 17) return li === mid + 3;
      return false;
    } },
    'sydney': { name: 'opera', h: 14, w: 18, draw(li, row) {
      if (row < 2) return li >= 1 && li <= 16;
      const s1 = li >= 2 && li <= 6 && row < (2 + Math.round((7 - li) * 1.6));
      const s2 = li >= 5 && li <= 9 && row < (2 + Math.round((10 - li) * 1.4));
      const s3 = li >= 9 && li <= 13 && row < (2 + Math.round((14 - li) * 1.3));
      const s4 = li >= 13 && li <= 16 && row < (2 + Math.round((17 - li) * 1.1));
      return s1 || s2 || s3 || s4;
    } },
    'rome': { name: 'colosseum', h: 12, w: 18, draw(li, row) {
      const cx = 9, rx = 9 - row * 0.3;
      if (Math.abs(li - cx) > rx) return false;
      if (row < 2) return true;
      const archOpen = (li + row) % 3 === 1 && li > 1 && li < 16;
      if (row < 5) return !archOpen;
      if (row < 8) return !archOpen && Math.abs(li - cx) < rx - 1;
      if (row < 10) return Math.abs(li - cx) < rx - 2 && !archOpen;
      if (row < 12) return Math.abs(li - cx) < rx - 3 && ((li + row) % 2 === 0);
      return false;
    } },
    'dubai': { name: 'burjkhalifa', h: 28, w: 8, draw(li, row) {
      const mid = 4;
      if (row < 3) return Math.abs(li - mid) <= 3;
      if (row < 6) return Math.abs(li - mid) <= 3;
      if (row < 10) return Math.abs(li - mid) <= 2;
      if (row === 10) return Math.abs(li - mid) <= 3;
      if (row < 15) return Math.abs(li - mid) <= 2;
      if (row === 15) return Math.abs(li - mid) <= 2;
      if (row < 20) return Math.abs(li - mid) <= 1;
      if (row < 24) return li === mid || li === mid + 1;
      if (row < 28) return li === mid;
      return false;
    } },
    'tokyo': { name: 'tokyotower', h: 22, w: 10, draw(li, row) {
      const mid = 5;
      if (row === 0) return li === mid - 4 || li === mid + 4;
      if (row === 1) return li === mid - 3 || li === mid + 3;
      if (row === 2) return li === mid - 3 || li === mid + 3;
      if (row === 3) return li === mid - 2 || li === mid + 2;
      if (row === 4) return li === mid - 2 || li === mid + 2;
      if (row === 5) return Math.abs(li - mid) <= 4;
      if (row === 6) return Math.abs(li - mid) <= 3;
      if (row < 10) return Math.abs(li - mid) <= 2;
      if (row < 12) return Math.abs(li - mid) <= 1;
      if (row === 12) return Math.abs(li - mid) <= 3;
      if (row === 13) return Math.abs(li - mid) <= 2;
      if (row < 17) return Math.abs(li - mid) <= 1;
      if (row < 22) return li === mid;
      return false;
    } },
    'san francisco': { name: 'goldengate', h: 16, w: 22, draw(li, row) {
      if (li === 6 || li === 15) return true;
      if (row === 4) return true;
      let cr;
      if (li >= 6 && li <= 15) cr = Math.round(7 + 7 * Math.pow((li - 10.5) / 4.5, 2));
      else if (li < 6) cr = Math.round(14 - (6 - li) * 1.7);
      else cr = Math.round(14 - (li - 15) * 1.7);
      if (row === cr && cr > 4) return true;
      if (li !== 6 && li !== 15 && li >= 2 && li <= 19 && li % 2 === 0 && row > 4 && row < cr) return true;
      return false;
    } },
    'rio de janeiro': { name: 'christredeemer', h: 18, w: 16, draw(li, row) {
      const mid = 8;
      if (row < 3) return Math.abs(li - mid) <= Math.max(0, 7 - row * 2);
      if (row < 5) return Math.abs(li - mid) <= 2;
      if (row < 8) return Math.abs(li - mid) <= 1;
      if (row === 8) return Math.abs(li - mid) <= 7;
      if (row === 9) return Math.abs(li - mid) <= 6;
      if (row === 10) return Math.abs(li - mid) <= 2;
      if (row < 13) return Math.abs(li - mid) <= 1;
      if (row === 13) return li === mid - 1 || li === mid || li === mid + 1;
      if (row === 14) return li === mid;
      return false;
    } },
    'pisa': { name: 'leaningtower', h: 18, w: 8, draw(li, row) {
      const lean = row * 0.22;
      const cx = 2 + lean;
      if (row % 3 === 0) return Math.abs(li - cx) <= 2.5;
      return Math.abs(li - cx) <= 1.5;
    } },
    'moscow': { name: 'kremlin', h: 20, w: 12, draw(li, row) {
      const mid = 6;
      if (row < 3) return li >= 1 && li <= 10;
      if (row < 5) return li >= 2 && li <= 9;
      if (row < 8) return Math.abs(li - mid) <= 2;
      if (row === 8) return Math.abs(li - mid) <= 3;
      if (row === 9) return Math.abs(li - mid) <= 3;
      if (row === 10) return Math.abs(li - mid) <= 2;
      if (row === 11) return Math.abs(li - mid) <= 3;
      if (row === 12) return Math.abs(li - mid) <= 3;
      if (row === 13) return Math.abs(li - mid) <= 2;
      if (row === 14) return Math.abs(li - mid) <= 1;
      if (row < 18) return li === mid;
      if (row === 18) return li === mid - 1 || li === mid || li === mid + 1;
      if (row === 19) return li === mid;
      return false;
    } },
    'washington': { name: 'monument', h: 24, w: 6, draw(li, row) {
      const mid = 3;
      if (row < 2) return Math.abs(li - mid) <= 2;
      if (row < 20) return li === mid - 1 || li === mid || li === mid + 1;
      if (row === 20) return Math.abs(li - mid) <= 2;
      if (row === 21) return Math.abs(li - mid) <= 1;
      if (row < 24) return li === mid;
      return false;
    } },
    'seattle': { name: 'spaceneedle', h: 22, w: 12, draw(li, row) {
      const mid = 6;
      if (row < 2) return Math.abs(li - mid) <= 2;
      if (row === 2) return li === mid - 1 || li === mid || li === mid + 1;
      if (row < 12) return li === mid;
      if (row === 12) return Math.abs(li - mid) <= 5;
      if (row === 13) return Math.abs(li - mid) <= 4;
      if (row === 14) return Math.abs(li - mid) <= 3;
      if (row < 17) return Math.abs(li - mid) <= 2;
      if (row === 17) return Math.abs(li - mid) <= 1;
      if (row < 22) return li === mid;
      return false;
    } },
    'athens': { name: 'parthenon', h: 12, w: 16, draw(li, row) {
      if (row < 2) return li >= 0 && li < 16;
      if (row < 8) return li >= 1 && li < 15 && (li % 2 === 1);
      if (row === 8) return li >= 0 && li < 16;
      if (row === 9) return li >= 1 && li < 15;
      if (row === 10) return li >= 3 && li < 13;
      if (row === 11) return li >= 5 && li < 11;
      return false;
    } },
    'beijing': { name: 'templeofheaven', h: 16, w: 14, draw(li, row) {
      const mid = 7;
      if (row < 2) return Math.abs(li - mid) <= 6;
      if (row < 3) return Math.abs(li - mid) <= 5;
      if (row < 5) return Math.abs(li - mid) <= 5;
      if (row === 5) return Math.abs(li - mid) <= 4;
      if (row < 8) return Math.abs(li - mid) <= 4;
      if (row === 8) return Math.abs(li - mid) <= 3;
      if (row < 11) return Math.abs(li - mid) <= 3;
      if (row === 11) return Math.abs(li - mid) <= 2;
      if (row < 14) return Math.abs(li - mid) <= 1;
      if (row < 16) return li === mid;
      return false;
    } },
    'istanbul': { name: 'mosque', h: 18, w: 16, draw(li, row) {
      const mid = 8;
      if (row < 4) return li >= 2 && li <= 13;
      if (row < 6) return li >= 3 && li <= 12;
      const dR = 5, dCy = 10;
      const inDome = (li - mid) * (li - mid) / (dR * dR) + (row - dCy) * (row - dCy) / (dR * dR) <= 1;
      if (row >= 6 && row <= 15 && inDome) return true;
      if (li === 0 && row < 14) return true;
      if (li === 15 && row < 14) return true;
      if (row === 14 && (li === 0 || li === 15)) return true;
      if (row === 15 && (li === 0 || li === 15)) return true;
      if (row === 16) return li === mid;
      return false;
    } },
    'agra': { name: 'tajmahal', h: 20, w: 16, draw(li, row) {
      const mid = 8;
      if (row < 2) return li >= 1 && li <= 14;
      if (row < 6) return li >= 3 && li <= 12 && !(row > 2 && row < 5 && Math.abs(li - mid) <= 1);
      if (row < 8) return Math.abs(li - mid) <= 4;
      if (row === 8) return Math.abs(li - mid) <= 4;
      if (row === 9) return Math.abs(li - mid) <= 5;
      if (row === 10) return Math.abs(li - mid) <= 5;
      if (row === 11) return Math.abs(li - mid) <= 4;
      if (row === 12) return Math.abs(li - mid) <= 3;
      if (row === 13) return Math.abs(li - mid) <= 2;
      if (row === 14) return Math.abs(li - mid) <= 1;
      if (row < 17) return li === mid;
      if (row < 12 && (li === 1 || li === 14)) return true;
      if (row === 12 && (li === 1 || li === 14)) return true;
      return false;
    } },
    'barcelona': { name: 'sagrada', h: 24, w: 14, draw(li, row) {
      if (row < 6) return li >= 1 && li <= 12;
      const spires = [2, 5, 9, 12];
      for (const sx of spires) {
        const h = row - 6;
        const maxH = sx === 5 || sx === 9 ? 18 : 15;
        if (h < maxH && Math.abs(li - sx) <= 0) return true;
        if (h === maxH && li === sx) return true;
      }
      if (row === 8 || row === 12) return li >= 2 && li <= 12;
      return false;
    } },
  };
}

// Ported from wxInitScene. `size` = core.SIZE (panel side length, e.g. 64).
// Populates wxState.clouds/particles/stars/skyline/skyShapes/creatures in
// place - mirrors the original mutating module-scope globals directly.
function wxInitScene(code, wxState, size, is2d) {
  wxState.clouds = []; wxState.particles = []; wxState.stars = [];
  const isRainCode = code >= 51 && code <= 55 || code >= 61 && code <= 65 || code >= 80 && code <= 82 || code >= 95;
  const isSnowCode = code >= 71 && code <= 77 || code >= 85 && code <= 86;
  const isStormCode = code >= 95;
  const isHeavyRain = code === 55 || code === 65 || code >= 81;
  const isOvercastCode = code === 3;
  const nc = code === 0 ? 0 : code === 1 ? 8 : code <= 2 ? 25 : isOvercastCode ? 160 : isStormCode ? 180 : isHeavyRain ? 80 : isRainCode ? 70 : isSnowCode ? 18 : code >= 45 && code <= 48 ? 12 : 10;
  const dark = isStormCode;
  for (let i = 0; i < nc; i++) wxState.clouds.push({
    px: Math.random(), py: isOvercastCode || isStormCode || isRainCode ? 0.2 + Math.random() * 0.75 : 0.3 + Math.random() * 0.6,
    sz: isOvercastCode || isStormCode ? 0.16 + Math.random() * 0.24 : isRainCode ? 0.14 + Math.random() * 0.22 : code <= 2 ? 0.1 + Math.random() * 0.18 : 0.07 + Math.random() * 0.14,
    spd: 0.0002 + Math.random() * 0.0004,
    spdY: (Math.random() - 0.35) * 0.00012,
    br: dark ? 0.3 + Math.random() * 0.2 : isOvercastCode ? 0.4 + Math.random() * 0.25 : isRainCode ? 0.4 + Math.random() * 0.3 : 0.6 + Math.random() * 0.4,
    puffs: isOvercastCode || isStormCode ? 6 + Math.floor(Math.random() * 6) : isRainCode ? 5 + Math.floor(Math.random() * 5) : 3 + Math.floor(Math.random() * 5), fluff: Math.random(),
    tint: 0.85 + Math.random() * 0.3, bubSeed: Math.random() * 1000,
  });
  for (let i = 0; i < 100; i++) wxState.stars.push({
    px: Math.random(), py: Math.random(),
    br: 0.3 + Math.random() * 0.7, tw: Math.random() * Math.PI * 2, spd: 1.5 + Math.random() * 3,
  });
  const np = isStormCode ? 150 : isHeavyRain ? 120 : isRainCode ? 80 : isSnowCode ? 60 : 0;
  for (let i = 0; i < np; i++) wxState.particles.push({
    face: Math.floor(Math.random() * 4),
    u: Math.random() * (size - 1), v: Math.random() * (size - 1),
    spd: isRainCode ? 3 + Math.random() * 5 : 0.4 + Math.random() * 0.8,
    snow: isSnowCode, drift: isRainCode ? (Math.random() - 0.5) * 1.5 : 0,
  });

  const panW = 4 * size;
  wxState.skyline = new Uint8Array(panW);
  const seed = Math.abs(Math.round(wxState.lat * 100 + wxState.lon * 10 + code * 7)) % 9999;
  wxState.skyShapes = [];
  function sRnd(x) { return ((x * 2654435761) >>> 0) / 4294967296; }

  const cityLower = (wxState.cityDisplay || '').toLowerCase().replace(/[^a-z ]/g, '');
  const landmarks = buildLandmarks();
  let cityLandmark = null;
  for (const [city, lm] of Object.entries(landmarks)) {
    if (cityLower.includes(city)) { cityLandmark = lm; break; }
  }

  const maxH = Math.floor(size * 0.35);
  const clusters = [];
  const nClust = 2 + ((seed * 37) % 3);
  for (let ci = 0; ci < nClust; ci++) {
    const cx = Math.floor(panW * (0.15 + ci * 0.7 / nClust + sRnd(seed * 101 + ci * 77) * 0.15));
    const cw = 12 + Math.floor(sRnd(seed * 203 + ci) * 16);
    const ch = maxH - Math.floor(sRnd(seed * 307 + ci) * 6);
    clusters.push({ cx, cw, ch });
  }
  function clusterInfluence(px) {
    let best = 0;
    for (const c of clusters) {
      const d = Math.abs(px - c.cx);
      if (d < c.cw) { const f = 1 - d / c.cw; best = Math.max(best, f * f * c.ch); }
    }
    return best;
  }
  let bx = 0;
  while (bx < panW) {
    const r0 = sRnd(bx * 1327 + seed * 43 + 13);
    const ci = clusterInfluence(bx);
    const inDowntown = ci > maxH * 0.3;
    const typeR = Math.floor(sRnd(bx * 4517 + seed * 89) * 100);
    let typ, bw, bh;
    if (inDowntown) {
      if (typeR < 10) { typ = 5; bw = 1; bh = Math.floor(ci * 1.1) + 2; }
      else if (typeR < 20) { typ = 4; bw = 3 + Math.floor(r0 * 3); bh = Math.floor(ci * 0.9) + 3; }
      else if (typeR < 35) { typ = 7; bw = 3 + Math.floor(r0 * 2); bh = Math.floor(ci * 0.6) + 2; }
      else { typ = 0; bw = 2 + Math.floor(r0 * 5); bh = Math.max(2, Math.floor(ci * 0.5 + r0 * 4)); }
    } else {
      if (typeR < 30) { typ = 2; bw = 2 + Math.floor(r0 * 2); bh = 3 + Math.floor(sRnd(bx * 7919 + seed) * 5); }
      else if (typeR < 55) { typ = 1; bw = 4 + Math.floor(r0 * 4); bh = 2 + Math.floor(sRnd(bx * 3917 + seed) * 3); }
      else if (typeR < 62) { typ = 3; bw = 2 + Math.floor(r0); bh = 5 + Math.floor(sRnd(bx * 6131 + seed) * 5); }
      else if (typeR < 68) { typ = 6; bw = 1; bh = 4 + Math.floor(r0 * 5); }
      else { typ = 0; bw = 2 + Math.floor(r0 * 4); bh = 2 + Math.floor(sRnd(bx * 7919 + seed) * 4 + ci * 0.3); }
    }
    wxState.skyShapes.push({ x: bx, w: bw, h: bh, t: typ });
    for (let i = 0; i < bw && bx + i < panW; i++) wxState.skyline[bx + i] = bh;
    const gap = inDowntown ? Math.floor(r0 * 2) : 1 + Math.floor(sRnd(bx * 31 + seed) * 3);
    bx += bw + gap;
  }

  if (cityLandmark) {
    // panel2dMode is TRUE for pi-native's own single-2D-panel hardware mode
    // (core.panelMode==='2d') - see weather.js's header comment for the
    // porting-mistake history. Single panel only has one "face" worth of
    // panorama width to place a landmark on.
    const nFaces = is2d ? 1 : 4;
    for (let fi = 0; fi < nFaces; fi++) {
      const faceCenter = fi * size + Math.floor(size / 2);
      const lx = Math.max(fi * size, Math.min((fi + 1) * size - cityLandmark.w, faceCenter - Math.floor(cityLandmark.w / 2)));
      const lx2 = lx + cityLandmark.w;
      for (let si = wxState.skyShapes.length - 1; si >= 0; si--) {
        const s = wxState.skyShapes[si];
        if (s.x + s.w > lx && s.x < lx2) wxState.skyShapes.splice(si, 1);
      }
      for (let i = 0; i < cityLandmark.w && lx + i < panW; i++) wxState.skyline[lx + i] = cityLandmark.h;
      wxState.skyShapes.push({ x: lx, w: cityLandmark.w, h: cityLandmark.h, t: 8, lm: cityLandmark });
    }
  }

  wxState.creatures = [];
  for (let i = 0; i < 4; i++) {
    const isPlane = i === 3;
    wxState.creatures.push({
      type: isPlane ? 'plane' : 'bird',
      px: isPlane ? -0.5 : Math.random(),
      py: isPlane ? 0.62 + Math.random() * 0.25 : 0.38 + Math.random() * 0.45,
      dx: (Math.random() < 0.5 ? 1 : -1) * (isPlane ? 0.0008 + Math.random() * 0.0005 : 0.0015 + Math.random() * 0.002),
      dy: isPlane ? 0 : (Math.random() - 0.5) * 0.0008,
      wing: 0, wingT: 0, blink: 0, cycleCount: 0, wingSpeed: 2 + Math.random() * 3,
      delay: isPlane ? Math.random() * 120 : Math.random() * 15,
      active: true, lightningHit: 0, wobble: 0,
    });
  }
  if (code <= 2) {
    wxState.creatures.push({
      type: 'balloon', px: Math.random(), py: 0.05,
      dx: 0.0003 + Math.random() * 0.0002, dy: 0,
      phase: 'rise', phaseT: 0, laps: 0, maxLaps: 2 + Math.floor(Math.random() * 3),
      color: [1, 0.2, 0.1],
      delay: 30 + Math.random() * 60, active: true,
    });
  }
}

// Creates a fresh mutable state object - one per CubeCore/effect instance.
// Defaults match effects-livedata.js's module-scope initial values.
function createWxState() {
  return {
    code: 0, temp: 20, tempMax: 20, desc: 'Clear', fetching: false, lastFetch: -9999,
    sunriseS: 21600, sunsetS: 72000, moonriseS: -1, moonsetS: -1, tzOffset: 0,
    lat: 52.04, lon: -0.76, cityDisplay: '',
    clouds: [], particles: [], stars: [], t2: 0, lightFlash: 0, scrollOff: 0,
    skyline: null, skyShapes: [], creatures: [],
    nextStrike: 0, // ported from effectWeather's this._wxNextStrike (see weather.js)
  };
}

module.exports = {
  WX_CODES, getMoonIllumination, getMoonTimes, calcMoonRiseSet, wxMoonPhase,
  wxSkyRGB, wxInitScene, createWxState,
  // Exported (not just used internally by wxInitScene) so weather/wallState.js
  // can build its own width/height-aware scene-init variant without
  // duplicating all ~19 hardcoded landmark silhouettes - see that file's
  // module comment.
  buildLandmarks,
};
