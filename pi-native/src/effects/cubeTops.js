// Pictures for the cube's top face, for effects whose sides carry text or
// information and so had little to show above (a real request: "add some top
// to these, use your imagination"). Each draws the whole top face from its
// own position (core.surfX/surfZ, 0..1 across it), after the effect has drawn
// the sides. withTop(fn, top) wraps a cube effect, keeping its .wall and
// .getStatus.
'use strict';
const { hsl } = require('../core');
const { wallClock } = require('../localTime');

const TAU = Math.PI * 2;
const topPixels = (core) => {
  if (!core._topPx || core._topPx.n !== core.N) {
    const list = [];
    for (const i of core.faceMap[4]) if (i >= 0) list.push(i);
    core._topPx = { n: core.N, list };
  }
  return core._topPx.list;
};
// Distance from the line a-b (all in face units).
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9, k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return Math.hypot(px - ax - vx * k, py - ay - vy * k);
}

// An analogue clock: a dark dial with a glowing rim, hour marks, hour and
// minute hands and a sweeping second hand, at the user's local time.
function clockTop(core) {
  const now = wallClock(core.tz), s = now.getSeconds() + now.getMilliseconds() / 1000, m = now.getMinutes() + s / 60, h = (now.getHours() % 12) + m / 60;
  const hand = (frac, len) => { const a = frac * TAU; return [0.5 + Math.sin(a) * len, 0.5 - Math.cos(a) * len]; };
  const H = hand(h / 12, 0.22), M = hand(m / 60, 0.34), S = hand(s / 60, 0.38);
  const X = core.surfX, Z = core.surfZ, cb = core.colBuf;
  for (const i of topPixels(core)) {
    const x = X[i], y = Z[i], r = Math.hypot(x - 0.5, y - 0.5), o = i * 3;
    let R = 0.01, G = 0.012, B = 0.025;
    if (r < 0.46) { R = 0.025; G = 0.03; B = 0.06; } // the dial
    const rim = Math.exp(-(((r - 0.46) / 0.012) ** 2)); R += rim * 0.25; G += rim * 0.45; B += rim * 0.8;
    const ang = (Math.atan2(x - 0.5, 0.5 - y) / TAU + 1) % 1, mark = Math.abs(((ang * 12) % 1) - 0.5) > 0.45 && r > 0.38 && r < 0.44;
    if (mark) { R += 0.6; G += 0.65; B += 0.7; }
    const hk = Math.max(0, 1 - segDist(x, y, 0.5, 0.5, H[0], H[1]) / 0.022), mk = Math.max(0, 1 - segDist(x, y, 0.5, 0.5, M[0], M[1]) / 0.016), sk = Math.max(0, 1 - segDist(x, y, 0.5, 0.5, S[0], S[1]) / 0.01);
    R += hk * 0.95 + mk * 0.8 + sk * 1; G += hk * 0.95 + mk * 0.85 + sk * 0.25; B += hk * 0.9 + mk * 0.9 + sk * 0.2;
    if (r < 0.025) { R = 1; G = 0.9; B = 0.6; }
    cb[o] = Math.min(1, R); cb[o + 1] = Math.min(1, G); cb[o + 2] = Math.min(1, B);
  }
}

// Tonight's moon: a shaded disc at today's phase, among a few stars.
function moonTop(core) {
  const { getMoonIllumination } = require('./weather/state');
  const phase = getMoonIllumination(new Date()).phase; // 0 new, 0.5 full
  const X = core.surfX, Z = core.surfZ, cb = core.colBuf, R0 = 0.3, t = core.t || 0;
  for (const i of topPixels(core)) {
    const x = X[i] - 0.5, y = Z[i] - 0.5, d = Math.hypot(x, y), o = i * 3;
    let R = 0.004, G = 0.006, B = 0.02;
    const st = Math.sin(X[i] * 913.1 + Z[i] * 371.7) * 43758.5; if (d > R0 + 0.04 && st - Math.floor(st) > 0.985) { const tw = 0.4 + 0.3 * Math.sin(t * 2 + st); R += tw; G += tw; B += tw; }
    if (d < R0) {
      // Lit where the sphere faces the sun: the terminator sweeps across with the phase.
      const nx = x / R0, nz = Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (R0 * R0))), a = phase * TAU;
      const lit = Math.max(0, nx * Math.sin(a) - nz * Math.cos(a)); // sun behind at new moon (a 0), facing us at full (a pi)
      const crater = 0.85 + 0.15 * Math.sin(X[i] * 60) * Math.sin(Z[i] * 53);
      const k = (0.04 + 0.85 * Math.min(1, lit * 1.4)) * crater;
      R = k * 0.95; G = k * 0.93; B = k * 0.85;
    } else { const glow = Math.exp(-(d - R0) / 0.04) * 0.08 * (1 - Math.abs(phase - 0.5) * 2 * 0.7); R += glow; G += glow; B += glow * 1.1; }
    cb[o] = Math.min(1, R); cb[o + 1] = Math.min(1, G); cb[o + 2] = Math.min(1, B);
  }
}

// A record on a turntable: grooves catching the light, a coloured label,
// spinning while music plays (and pulsing with the beat).
function recordTop(core) {
  const playing = core.audio && core.audio.active, beat = playing ? core.audio.beat || 0 : 0;
  core._recAng = (core._recAng || 0) + (playing ? 0.035 : 0.004);
  const X = core.surfX, Z = core.surfZ, cb = core.colBuf, lab = hsl(((core.t || 0) * 0.01) % 1, 0.8, 0.5);
  for (const i of topPixels(core)) {
    const x = X[i] - 0.5, y = Z[i] - 0.5, d = Math.hypot(x, y), o = i * 3, a = Math.atan2(y, x) + core._recAng;
    let R = 0.008, G = 0.008, B = 0.012;
    if (d < 0.46) {
      const groove = 0.5 + 0.5 * Math.sin(d * 260), sheen = Math.pow(Math.max(0, Math.cos(a * 2)), 6) * 0.35;
      const k = 0.03 + groove * 0.03 + sheen * (0.4 + d);
      R = k; G = k; B = k * 1.1;
      if (d < 0.15) { const kk = 0.8 + 0.2 * Math.cos(a * 3) + beat * 0.3; R = lab[0] * kk; G = lab[1] * kk; B = lab[2] * kk; }
      if (d < 0.02) { R = 0.7; G = 0.7; B = 0.75; }
    }
    cb[o] = Math.min(1, R); cb[o + 1] = Math.min(1, G); cb[o + 2] = Math.min(1, B);
  }
}

function withTop(fn, top) {
  const g = (core, dt) => { const r = fn(core, dt); try { top(core); } catch (e) { /* the sides still show */ } return r; };
  for (const k of Object.keys(fn)) g[k] = fn[k];
  return g;
}

module.exports = { withTop, clockTop, moonTop, recordTop };
