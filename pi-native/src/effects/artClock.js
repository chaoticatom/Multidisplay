// Art Clock: graphical clocks, each drawn on one 64 x 64 picture.
// Styles (option `style`): galaxy, solar, blackhole, nebula, constellation,
// eclipse, clockwork, fireflies, aurora, rings, hourglass - or `mix`, a new
// one every five minutes. On a cube the picture is on every side and the top;
// on a single panel it fills it; on a wall it's centred, as large as fits.
'use strict';
const { FONT_3x5, drawString, textWidth } = require('./text');

const P = 64; // picture size
const TAU = Math.PI * 2;
const STYLES = ['galaxy', 'solar', 'blackhole', 'nebula', 'constellation', 'eclipse', 'clockwork', 'fireflies', 'aurora', 'rings', 'hourglass'];

// ── A tiny raster: RGB floats, clamped when copied out.
const pic = new Float32Array(P * P * 3);
function clear(r, g, b) { for (let i = 0; i < P * P; i++) { pic[i * 3] = r; pic[i * 3 + 1] = g; pic[i * 3 + 2] = b; } }
function put(x, y, r, g, b) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= P || y >= P) return; const o = (y * P + x) * 3; pic[o] = r; pic[o + 1] = g; pic[o + 2] = b; }
function add(x, y, r, g, b, a = 1) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= P || y >= P) return; const o = (y * P + x) * 3; pic[o] += r * a; pic[o + 1] += g * a; pic[o + 2] += b * a; }
function mix(x, y, r, g, b, a) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= P || y >= P) return; const o = (y * P + x) * 3; pic[o] += (r - pic[o]) * a; pic[o + 1] += (g - pic[o + 1]) * a; pic[o + 2] += (b - pic[o + 2]) * a; }
// A soft additive glow, brightest in the middle.
function glow(cx, cy, rad, c, k = 1) {
  for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad; if (d >= 1) continue; // eslint-disable-line no-continue
    const f = (1 - d) * (1 - d) * k; add(x, y, c[0], c[1], c[2], f);
  }
}
function disc(cx, cy, rad, c) { for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad); x <= cx + rad; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad) put(x, y, c[0], c[1], c[2]); }
// An arc of a ring from angle a0 for `sweep` radians (clockwise from 12 o'clock when a0 = -PI/2).
function arc(cx, cy, rad, w, c, a0 = 0, sweep = TAU, a = 1) {
  for (let y = Math.floor(cy - rad - w); y <= cy + rad + w; y++) for (let x = Math.floor(cx - rad - w); x <= cx + rad + w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (Math.abs(d - rad) > w / 2) continue; // eslint-disable-line no-continue
    const ang = ((Math.atan2(dy, dx) - a0) % TAU + TAU) % TAU;
    if (ang <= sweep) mix(x, y, c[0], c[1], c[2], a);
  }
}
function line(x0, y0, x1, y1, c, a = 1) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)); for (let i = 0; i <= n; i++) mix(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c[0], c[1], c[2], a); }
function text(str, x, y, c) { drawString(FONT_3x5, str, x, y, (px, py) => put(px, py, c[0], c[1], c[2])); }
function textC(str, y, c) { text(str, Math.round((P - textWidth(FONT_3x5, str)) / 2), y, c); }
// Repeatable pseudo-random numbers (stars that stay put).
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function stars(n, k, t) { for (let i = 0; i < n; i++) { const tw = 0.55 + 0.45 * Math.sin(t * (1 + hash(i + 7) * 2) + i); const b = k * (0.25 + hash(i + 3) * 0.75) * tw; add(hash(i) * P, hash(i + 1.7) * P, b * 0.9, b * 0.9, b); } }

// Seven-segment digits (for the styles that show numbers).
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(plot, d, x0, y0, w, h, th) {
  const mid = y0 + Math.floor((h - th) / 2), on = SEG[d] || '';
  const hbar = (y) => { for (let yy = y; yy < y + th; yy++) for (let x = x0 + th; x < x0 + w - th; x++) plot(x, yy); };
  const vbar = (x, ya, yb) => { for (let xx = x; xx < x + th; xx++) for (let y = ya; y < yb; y++) plot(xx, y); };
  if (on.includes('a')) hbar(y0); if (on.includes('g')) hbar(mid); if (on.includes('d')) hbar(y0 + h - th);
  if (on.includes('f')) vbar(x0, y0 + th, mid); if (on.includes('b')) vbar(x0 + w - th, y0 + th, mid);
  if (on.includes('e')) vbar(x0, mid + th, y0 + h - th); if (on.includes('c')) vbar(x0 + w - th, mid + th, y0 + h - th);
}
// HH:MM centred; returns nothing, calls plot for every lit pixel.
function sevenSeg(plot, hh, mm, top, h, colon = true) {
  const s = String(hh).padStart(2, '0') + String(mm).padStart(2, '0'), th = Math.max(1, Math.round(h / 8)), w = Math.max(4, Math.round(h * 0.5)), gap = 2;
  let x = Math.floor((P - (4 * w + 3 * gap + th * 3)) / 2);
  for (let i = 0; i < 4; i++) {
    digit(plot, Number(s[i]), x, top, w, h, th); x += w + gap;
    if (i === 1) { if (colon) for (const cy of [top + Math.round(h * 0.28), top + Math.round(h * 0.68)]) for (let yy = cy; yy < cy + th; yy++) for (let xx = x; xx < x + th; xx++) plot(xx, yy); x += th + gap; }
  }
}

// ── The styles. `c` is the clock: hours, minutes, seconds (with fractions), angles, t.
const S = {
  galaxy(c) {
    clear(0.01, 0.01, 0.04); stars(60, 0.5, c.t);
    const rot = c.mA + c.t * 0.05;
    for (let arm = 0; arm < 2; arm++) for (let k = 0; k < 420; k++) {
      const f = k / 420, r = f * 28, a = rot + arm * Math.PI + f * 5.5 + (hash(k + arm * 999) - 0.5) * 0.35;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r, b = (1.1 - f) * 1.15;
      add(x, y, (0.75 + hash(k) * 0.25) * b, (0.55 + hash(k + 1) * 0.35) * b, b);
    }
    glow(32, 32, 9, [1, 0.9, 1], 1.4);
    for (let h = 0; h < 12; h++) { const a = h / 12 * TAU - Math.PI / 2, x = 32 + Math.cos(a) * 30, y = 32 + Math.sin(a) * 30; if (h === c.h12) glow(x, y, 3, [1, 0.82, 0.3], 2); else add(x, y, 0.5, 0.5, 0.6); }
  },
  solar(c) {
    clear(0.005, 0.01, 0.04); stars(45, 0.45, c.t);
    arc(32, 32, 14, 1, [0.14, 0.15, 0.2]); arc(32, 32, 27, 1, [0.14, 0.15, 0.2]);
    glow(32, 32, 10, [1, 0.6, 0.15], 1.3); glow(32, 32, 5, [1, 1, 0.85], 1.6);
    const hx = 32 + Math.cos(c.hA) * 27, hy = 32 + Math.sin(c.hA) * 27; glow(hx, hy, 4.5, [1, 0.45, 0.75], 1.8);
    const mx = 32 + Math.cos(c.mA) * 14, my = 32 + Math.sin(c.mA) * 14; glow(mx, my, 3.5, [0.4, 0.8, 1], 1.8);
    put(mx + Math.cos(c.sA) * 6, my + Math.sin(c.sA) * 6, 1, 1, 1);
  },
  blackhole(c) {
    clear(0, 0, 0.01); stars(55, 0.5, c.t);
    const spin = c.t * 0.6;
    for (let k = 0; k < 1300; k++) {
      const f = k / 1300, a = f * TAU * 3 - spin + hash(k) * 0.2, r = 27 - f * 17 + (hash(k + 5) - 0.5) * 2;
      const x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r * 0.42, b = 0.15 + f * 0.75;
      add(x, y, 1 * b, (0.55 + f * 0.35) * b, (0.2 + f * 0.3) * b, 0.5);
    }
    disc(32, 32, 6.5, [0, 0, 0]); arc(32, 32, 7, 1.2, [1, 0.82, 0.5], 0, TAU, 0.85);
    const kx = 32 + Math.cos(c.mA) * 21, ky = 32 + Math.sin(c.mA) * 21 * 0.42; glow(kx, ky, 3.5, [1, 1, 1], 2);
    line(32, 32, 32 + Math.cos(c.hA) * 30, 32 + Math.sin(c.hA) * 30, [0.55, 0.8, 1], 0.55);
  },
  nebula(c) {
    clear(0.015, 0.008, 0.04); stars(35, 0.4, c.t);
    const hand = (a, len, w, col, n) => { for (let k = 0; k < n; k++) { const f = k / n, r = f * len, sp = ((hash(k * 3.1) - 0.5) * ((1 - f) * w + 1)), wob = Math.sin(c.t * 2 + k) * 0.3; add(32 + Math.cos(a) * r + Math.cos(a + 1.57) * (sp + wob), 32 + Math.sin(a) * r + Math.sin(a + 1.57) * (sp + wob), col[0], col[1], col[2], 0.25 + (1 - f) * 0.45); } };
    hand(c.mA, 29, 9, [0.45, 0.78, 1], 260); hand(c.hA, 19, 11, [1, 0.45, 0.8], 240); hand(c.sA, 30, 2, [1, 0.85, 0.45], 90);
    glow(32, 32, 5, [1, 0.95, 1], 1.5);
    for (let h = 0; h < 12; h++) { const a = h / 12 * TAU; add(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30, 0.5, 0.5, 0.6); }
  },
  constellation(c) {
    clear(0.01, 0.02, 0.07); stars(70, 0.45, c.t);
    // The digits as star patterns: stars at the corners and middles of each seven-segment digit, joined by faint lines.
    const s = String(c.hh).padStart(2, '0') + String(c.mm).padStart(2, '0'), W = 10, H = 22, xs = [3, 17, 37, 51], top = 12;
    const node = { a: [[0, 0], [1, 0]], b: [[1, 0], [1, 1]], c: [[1, 1], [1, 2]], d: [[0, 2], [1, 2]], e: [[0, 1], [0, 2]], f: [[0, 0], [0, 1]], g: [[0, 1], [1, 1]] };
    for (let i = 0; i < 4; i++) {
      const pts = new Map();
      for (const seg of SEG[s[i]]) { const [[ax, ay], [bx, by]] = node[seg]; const p0 = [xs[i] + ax * W, top + ay * H / 2], p1 = [xs[i] + bx * W, top + by * H / 2]; line(p0[0], p0[1], p1[0], p1[1], [0.45, 0.6, 1], 0.35); pts.set(p0.join(), p0); pts.set(p1.join(), p1); }
      for (const [x, y] of pts.values()) glow(x, y, 2.6, [1, 1, 1], 1.6);
    }
    const tw = 0.6 + 0.4 * Math.sin(c.t * 4); glow(32, 17, 1.5, [0.6, 0.9, 1], tw * 1.5); glow(32, 28, 1.5, [0.6, 0.9, 1], tw * 1.5);
    for (let i = 0; i < 60; i++) add(2 + i, 58, 1, 1, 1, i <= c.ss ? 0.8 : 0.12);
  },
  eclipse(c) {
    clear(0.01, 0.008, 0.04); stars(40, 0.45, c.t);
    for (let k = 0; k < 60; k++) { const a = k / 60 * TAU + c.t * 0.05, lit = k <= c.ss, len = 14 + hash(k) * 6 + (lit ? 3 + Math.sin(c.t * 3 + k) : 0); line(32 + Math.cos(a) * 13, 28 + Math.sin(a) * 13, 32 + Math.cos(a) * len, 28 + Math.sin(a) * len, [1, 0.7 + hash(k) * 0.25, 0.35], lit ? 0.55 : 0.15); }
    glow(32, 28, 15, [1, 0.6, 0.15], 1.2); disc(32, 28, 12, [1, 0.88, 0.55]);
    disc(32 + (c.mm + c.ss / 60) / 60 * 40 - 20, 28, 12.5, [0.02, 0.015, 0.04]);
    textC(c.hhmm, 55, [1, 0.85, 0.62]);
  },
  clockwork(c) {
    clear(0.05, 0.035, 0.02);
    const gear = (cx, cy, r, teeth, rot, col) => {
      for (let y = Math.floor(cy - r - 3); y <= cy + r + 3; y++) for (let x = Math.floor(cx - r - 3); x <= cx + r + 3; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx) - rot;
        const tooth = Math.cos(a * teeth) > 0.2 ? 3 : 0;
        if (d <= r + tooth && d >= r * 0.45) { const shade = 0.75 + 0.25 * (dy < 0 ? 1 : 0.6); put(x, y, col[0] * shade, col[1] * shade, col[2] * shade); }
      }
    };
    gear(24, 37, 16, 12, c.hA, [0.75, 0.53, 0.18]); gear(48, 18, 9.5, 8, -c.mA * 1.5, [0.88, 0.67, 0.29]); gear(50, 48, 7, 6, c.sA * 2, [0.55, 0.42, 0.17]);
    line(24, 37, 24 + Math.cos(c.hA) * 12, 37 + Math.sin(c.hA) * 12, [1, 0.94, 0.8]); line(48, 18, 48 + Math.cos(c.mA) * 8, 18 + Math.sin(c.mA) * 8, [1, 1, 1]);
    disc(24, 37, 1.6, [1, 1, 1]); disc(48, 18, 1.2, [1, 1, 1]);
  },
  fireflies(c) {
    for (let y = 0; y < P; y++) { const f = y / P; for (let x = 0; x < P; x++) put(x, y, 0.012 + f * 0.02, 0.04 + f * 0.06, 0.06 - f * 0.02); }
    for (let x = 0; x < P; x += 2) for (let y = 54 + Math.floor(hash(x) * 5); y < P; y++) put(x, y, 0.03, 0.12, 0.05);
    // They gather into the time between seconds 6 and 54 and drift apart round the minute.
    const gather = Math.min(1, Math.max(0, Math.min(c.ss - 1, 59 - c.ss) / 2)); // apart for a moment round the minute
    // Every lit pixel of the digits is a firefly; all of them glow softly,
    // and each twinkles on its own.
    const pts = []; sevenSeg((x, y) => pts.push([x, y]), c.hh, c.mm, 18, 22, false);
    pts.forEach(([x, y], i) => {
      const sx = hash(i) * P, sy = hash(i + 9) * 50, e = gather * gather * (3 - 2 * gather);
      const px = sx + (x + 0.5 - sx) * e + Math.sin(c.t * 2 + i) * 0.4 * (1 - e * 0.7), py = sy + (y + 0.5 - sy) * e + Math.cos(c.t * 1.7 + i) * 0.4 * (1 - e * 0.7);
      const tw = 0.55 + 0.45 * Math.sin(c.t * 5 + i * 1.3);
      add(px, py, 1, 0.95, 0.4, 0.8 * tw); if (i % 3 === 0) glow(px, py, 2, [1, 0.97, 0.45], 0.5 * tw);
    });
    for (let i = 0; i < 9; i++) { const fx = (hash(i + 40) * P + c.t * 2 * (hash(i) - 0.5) * 8 + P) % P, fy = 6 + hash(i + 50) * 44 + Math.sin(c.t + i) * 2; glow(fx, fy, 1.8, [1, 0.97, 0.45], 0.6 + 0.4 * Math.sin(c.t * 3 + i)); }
  },
  aurora(c) {
    clear(0.008, 0.02, 0.06); stars(45, 0.45, c.t);
    const top = 46 - (c.mm + c.ss / 60) / 60 * 40;
    for (let x = 0; x < P; x++) {
      const wave = Math.sin(x / 7 + c.t * 0.6) * 4 + Math.sin(x / 3 - c.t) * 1.5, y0 = top + wave;
      for (let y = Math.max(0, Math.floor(y0)); y < 52; y++) { const f = (y - y0) / (52 - y0); add(x, y, 0.3 + f * 0.45, 1 - f * 0.3, 0.65 + f * 0.25, (1 - f) * 0.55 * (0.75 + 0.25 * Math.sin(x / 2 + c.t * 3))); }
    }
    const hill = (x) => 52 + Math.sin(x / 9) * 3 + Math.sin(x / 4) * 1.2;
    for (let x = 0; x < P; x++) for (let y = Math.floor(hill(x)); y < P; y++) put(x, y, 0.03, 0.06, 0.09);
    textC(c.hhmm, 3, [0.78, 1, 0.9]);
  },
  rings(c) {
    clear(0.01, 0.012, 0.02);
    const rs = [[29, (c.h12 + c.mm / 60) / 12, [1, 0.62, 0.77]], [24, (c.mm + c.ss / 60) / 60, [0.5, 0.9, 1]], [19, c.ss / 60, [1, 0.82, 0.3]]];
    for (const [r, f, col] of rs) {
      arc(32, 32, r, 3, [0.07, 0.08, 0.1]); arc(32, 32, r, 3, col, -Math.PI / 2, f * TAU);
      const a = -Math.PI / 2 + f * TAU; glow(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 2.5, [1, 1, 1], 1.5);
    }
    sevenSeg((x, y) => put(x, y, 1, 0.95, 0.97), c.hh, c.mm, 27, 11, c.ss % 2 < 1);
  },
  hourglass(c) {
    clear(0.05, 0.03, 0.02);
    const f = (c.mm + c.ss / 60) / 60, gold = [0.91, 0.72, 0.42];
    // The glass outline.
    for (const [x0, y0, x1, y1] of [[8, 3, 30, 3], [8, 60, 30, 60], [8, 3, 18, 31], [30, 3, 20, 31], [18, 31, 8, 60], [20, 31, 30, 60]]) line(x0, y0, x1, y1, [1, 0.86, 0.63], 0.45);
    // Sand left in the top bulb, the pile below, a thin falling stream.
    const topY = 4 + f * 26;
    for (let y = Math.ceil(topY); y < 31; y++) { const half = (31 - y) * 0.36; for (let x = Math.ceil(19 - half); x <= 19 + half; x++) put(x, y, gold[0], gold[1], gold[2]); }
    const h = f * 22;
    for (let x = 9; x <= 29; x++) { const ph = h * (1 - Math.pow((x - 19) / 10.5, 2)); for (let y = Math.floor(59 - ph); y < 60; y++) put(x, y, gold[0], gold[1], gold[2]); }
    for (let y = 32; y < 59 - h; y += 2) if ((y + Math.floor(c.t * 12)) % 3) put(19, y, 1, 0.85, 0.6);
    const big = (str, y) => drawString(FONT_3x5, str, 38, y, (px, py) => { for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(px * 2 - 38 + a, py * 2 - y + b, 1, 0.89, 0.66); });
    big(String(c.hh).padStart(2, '0'), 14); for (let x = 37; x < 59; x++) put(x, 30, 0.54, 0.41, 0.23); big(String(c.mm).padStart(2, '0'), 34);
  },
};

function clockNow(t) {
  const d = new Date(), ms = d.getMilliseconds();
  const hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds() + ms / 1000;
  const h12 = hh % 12;
  return {
    hh, mm, ss, h12, t,
    hhmm: String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'),
    hA: (h12 + mm / 60) / 12 * TAU - Math.PI / 2,
    mA: (mm + ss / 60) / 60 * TAU - Math.PI / 2,
    sA: ss / 60 * TAU - Math.PI / 2,
  };
}
function styleFor(opts) {
  const want = opts && opts.style;
  if (want === 'mix') return STYLES[Math.floor(Date.now() / 300000) % STYLES.length]; // a new one every five minutes
  return STYLES.includes(want) ? want : 'galaxy';
}
function render(core, dt) {
  core.t = (core.t || 0) + dt;
  const opts = (core.effectOptions && core.effectOptions.art_clock) || {};
  S[styleFor(opts)](clockNow(core.t));
}
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Cube (and single panel): the picture on every side and the top. Face rows run bottom-up.
function artClock(core, dt) {
  render(core, dt);
  const N = core.SIZE;
  for (let i = 0; i < core.colBuf.length; i++) core.colBuf[i] = 0;
  const faces = core.panelMode === '2d' ? [0] : [0, 1, 2, 3, 4];
  for (const f of faces) for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    const o = ((Math.floor((N - 1 - v) * P / N)) * P + Math.floor(u * P / N)) * 3;
    core.setFaceLED(f, u, v, clamp(pic[o]), clamp(pic[o + 1]), clamp(pic[o + 2]));
  }
}
// Wall: centred, as large as fits.
artClock.wall = function artClockWall(core, dt) {
  render(core, dt);
  if (core.wallBuf) core.wallBuf.fill(0);
  const side = Math.min(core.wallW, core.wallH), ox = Math.floor((core.wallW - side) / 2), oy = Math.floor((core.wallH - side) / 2);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const o = (Math.floor(y * P / side) * P + Math.floor(x * P / side)) * 3;
    core.setWallPixel(ox + x, oy + y, clamp(pic[o]), clamp(pic[o + 1]), clamp(pic[o + 2]));
  }
};
artClock.STYLES = STYLES;
module.exports = artClock;
