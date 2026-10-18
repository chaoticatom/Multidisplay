// Planes overhead - the three looks, drawn into a region of any size
// (tg: { set(x, y, r, g, b), w, h } in top-down region coordinates):
//   board    (A) a flight board: airline tail colour, airline and flight,
//            big FROM -> TO codes with cities, type / altitude / speed,
//            distance and direction, LIVE
//   radar    (B) a sweeping radar with home in the middle and each plane
//            where it is, plus the highlighted plane's details beside it
//            when there's room
//   compact  (C) the board for one 64x64 panel or cube face
'use strict';

const { FONT_3x5, FONT_5x7, drawString, drawStringSmooth, textWidth } = require('../text');
const { compass } = require('./data');

const WH = [0.92, 0.95, 1], DM = [0.55, 0.6, 0.7], AM = [1, 0.6, 0.15], CY = [0.3, 0.8, 1], GR = [0.2, 1, 0.4];
const fmtAlt = (ft) => (ft >= 10000 ? Math.round(ft / 100) * 100 : Math.round(ft / 50) * 50) + 'FT';
const mmss = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const dueText = (p, short) => (p.overhead ? (short ? 'OVERHEAD' : 'OVERHEAD NOW') : p.dueIn >= 0 ? (short ? 'OVER ' : 'OVERHEAD IN ') + mmss(p.dueIn) : '');
const fmtKm = (km) => (km < 10 ? km.toFixed(1) : Math.round(km)) + ' KM';

function txt(tg, font, s, x, y, c, a = 1, scale = 1, maxX = Infinity) {
  drawString(font, String(s).toUpperCase(), x, y, (px, py) => { if (px < maxX) tg.set(px, py, c[0] * a, c[1] * a, c[2] * a); }, { scale });
}
const w3 = (s) => textWidth(FONT_3x5, String(s).toUpperCase());
const w5 = (s, sc = 1) => textWidth(FONT_5x7, String(s).toUpperCase(), sc);
// Fit a string into maxW px (trimming it).
function fit(s, maxW, wf) { s = String(s || '').toUpperCase(); while (s.length > 1 && wf(s) > maxW) s = s.slice(0, -1); return s.trim(); }

function tail(tg, x0, y0, col, h = 9) {
  for (let y = 0; y < h; y++) for (let x = 0; x < h + 2; x++) { const inside = x >= y * 0.9 && x <= y * 0.9 + 6 + (y > h * 0.6 ? 3 : 0); if (inside) tg.set(x0 + x, y0 + h - 1 - y, col[0] * (y < 3 ? 0.7 : 1), col[1] * (y < 3 ? 0.7 : 1), col[2] * (y < 3 ? 0.7 : 1)); }
}
function arrow(tg, x, y, w, c) { for (let i = 0; i < w; i++) tg.set(x + i, y, c[0], c[1], c[2]); for (let d = 1; d <= 2; d++) { tg.set(x + w - 1 - d, y - d, c[0], c[1], c[2]); tg.set(x + w - 1 - d, y + d, c[0], c[1], c[2]); } }
function liveDot(tg, x, y, t) { const a = 0.6 + 0.4 * Math.sin(t * 4); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) tg.set(x + i, y + j, GR[0] * a, GR[1] * a, GR[2] * a); }

// A: the flight board (any width from 96 up; 64-tall).
// The bottom line: its own overhead countdown; else (taking turns) the next
// plane due over home; else distance, direction from home and heading.
function lastLine(p, t, nextDue, short) {
  const own = dueText(p, short);
  if (own) return [own, AM, p.overhead];
  if (nextDue && nextDue !== p && Math.floor(t / 4) % 2) return [(short ? 'NEXT ' : 'NEXT OVER: ') + (nextDue.cs || nextDue.hex.toUpperCase()) + ' ' + (nextDue.overhead ? 'NOW' : mmss(nextDue.dueIn)), AM, false];
  const vr = p.vr > 300 ? (short ? ' UP' : ' CLIMB') : p.vr < -300 ? (short ? ' DN' : ' DESCEND') : '';
  return [short ? fmtKm(p.dist).replace(' ', '') + ' ' + compass(p.brg) + ' >' + compass(p.track) : fmtKm(p.dist) + ' ' + compass(p.brg) + ', FLYING ' + compass(p.track) + vr, DM, false];
}
function drawBoard(tg, p, t, info = '', nextDue = null) {
  const W = tg.w, r = p.route;
  tail(tg, 1, 1, p.color);
  const cs = p.cs || p.hex.toUpperCase(), csW = w5(cs);
  // The airline: scrolls (smoothly, after a pause) only when it doesn't fit.
  const name = String(p.airline || p.type || 'AIRCRAFT').toUpperCase(), nx0 = 15, nw = W - nx0 - csW - 6, tw = w5(name);
  if (tw <= nw) txt(tg, FONT_5x7, name, nx0, 2, WH);
  else {
    const loop = tw + 18, off = Math.max(0, (t % (loop / 12 + 2.5)) - 2.5) * 12;
    const plot = (px, py, a = 1) => { if (px < nx0 || px >= nx0 + nw) return; const e = Math.min(1, (Math.min(px - nx0, nx0 + nw - 1 - px) + 1) / 3); tg.set(px, py, WH[0] * a * e, WH[1] * a * e, WH[2] * a * e); };
    plot.alpha = true;
    drawStringSmooth(FONT_5x7, name, nx0 - off, 2, plot); drawStringSmooth(FONT_5x7, name, nx0 - off + loop, 2, plot);
  }
  txt(tg, FONT_5x7, cs, W - 2 - csW, 2, WH);
  const from = r && r.from ? r.from.iata : '', to = r && r.to ? r.to.iata : '';
  if (from && to) {
    txt(tg, FONT_5x7, from, 2, 14, WH, 1, 2);
    const aw = Math.max(9, Math.min(20, W - 4 - w5(from, 2) - w5(to, 2) - 16)), ax = Math.round(W / 2 - aw / 2);
    arrow(tg, ax, 20, aw, DM);
    txt(tg, FONT_5x7, to, W - 2 - w5(to, 2), 14, WH, 1, 2);
    const half = Math.floor(W / 2) - 4;
    txt(tg, FONT_3x5, fit(r.from.city, half, w3), 2, 32, DM);
    const tc = fit(r.to.city, half, w3); txt(tg, FONT_3x5, tc, W - 2 - w3(tc), 32, DM);
  } else {
    // No route known: the type and registration large instead.
    txt(tg, FONT_5x7, fit(p.type || 'AIRCRAFT', W - 4, (s) => w5(s, 2)), 2, 14, WH, 1, 2);
    txt(tg, FONT_3x5, fit(p.reg ? 'REG ' + p.reg : 'ROUTE UNKNOWN', W - 4, w3), 2, 32, DM);
  }
  for (let x = 0; x < W; x += 2) tg.set(x, 40, DM[0] * 0.4, DM[1] * 0.4, DM[2] * 0.4);
  const alt = fmtAlt(p.alt), spd = Math.round(p.gs) + 'KT';
  txt(tg, FONT_5x7, p.type || '', 2, 44, WH);
  txt(tg, FONT_5x7, alt, Math.round(W / 2 - w5(alt) / 2), 44, AM);
  txt(tg, FONT_5x7, spd, W - 2 - w5(spd), 44, CY);
  const [ll, lc, flash] = lastLine(p, t, nextDue, false);
  txt(tg, FONT_3x5, fit(ll, W - 14 - w3(info || 'LIVE'), w3), 2, 56, lc, flash ? 0.6 + 0.4 * Math.sin(t * 8) : 1);
  const live = info || 'LIVE', lw = w3(live);
  if (!info) liveDot(tg, W - 7 - lw, 57, t);
  txt(tg, FONT_3x5, live, W - 2 - lw, 56, info ? DM : GR);
}

// C: one 64x64 panel.
function drawCompact(tg, p, t, info = '', nextDue = null) {
  const r = p.route;
  tail(tg, 1, 1, p.color);
  txt(tg, FONT_3x5, fit(p.airline || p.type || 'AIRCRAFT', 48, w3), 14, 1, WH);
  txt(tg, FONT_3x5, p.cs || p.hex.toUpperCase(), 14, 8, WH);
  const from = r && r.from ? r.from.iata : '', to = r && r.to ? r.to.iata : '';
  if (from && to) {
    txt(tg, FONT_5x7, from, 2, 18, WH); txt(tg, FONT_3x5, 'TO', 26, 19, DM); txt(tg, FONT_5x7, to, 62 - w5(to), 18, WH);
    txt(tg, FONT_3x5, fit(r.from.city, 30, w3), 2, 28, DM);
    const tc = fit(r.to.city, 28, w3); txt(tg, FONT_3x5, tc, 62 - w3(tc), 28, DM);
  } else { txt(tg, FONT_5x7, fit(p.type || 'AIRCRAFT', 60, (s) => w5(s)), 2, 18, WH); txt(tg, FONT_3x5, fit(p.reg || 'ROUTE UNKNOWN', 60, w3), 2, 28, DM); }
  for (let x = 0; x < 64; x += 2) tg.set(x, 35, DM[0] * 0.4, DM[1] * 0.4, DM[2] * 0.4);
  txt(tg, FONT_3x5, p.type || '', 2, 39, WH); const alt = fmtAlt(p.alt); txt(tg, FONT_3x5, alt, 62 - w3(alt), 39, AM);
  txt(tg, FONT_3x5, Math.round(p.gs) + 'KT', 2, 47, CY); const hd = 'TO ' + compass(p.track); txt(tg, FONT_3x5, hd, 62 - w3(hd), 47, DM);
  const [ll, lc, flash] = lastLine(p, t, nextDue, true);
  txt(tg, FONT_3x5, fit(ll, info ? 44 : 60, w3), 2, 56, lc, flash ? 0.6 + 0.4 * Math.sin(t * 8) : 1);
  if (info) txt(tg, FONT_3x5, info, 62 - w3(info), 56, DM, 0.8);
}

// B: radar (a square on the left) with the focus plane's details beside it.
function drawRadar(tg, planes, focus, t, radiusKm, details = true) {
  const S = Math.min(tg.h, tg.w), cx = Math.floor(S / 2), cy = Math.floor(tg.h / 2), R = S / 2 - 2;
  const g = (x, y, a) => tg.set(Math.round(x), Math.round(y), GR[0] * a, GR[1] * a, GR[2] * a);
  for (const f of [1 / 3, 2 / 3, 1]) for (let a = 0; a < 360; a += 3) { const r = a * Math.PI / 180; g(cx + R * f * Math.cos(r), cy + R * f * Math.sin(r), 0.22); }
  for (let d = -R; d <= R; d += 2) { g(cx + d, cy, 0.12); g(cx, cy + d, 0.12); }
  const sweep = (t * 1.6) % (Math.PI * 2);
  for (let k = 0; k < 8; k++) { const a = sweep - k * 0.06; for (let r = 2; r < R; r++) g(cx + r * Math.sin(a), cy - r * Math.cos(a), 0.5 - k * 0.055); }
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) tg.set(cx + i, cy + j, 1, 1, 1);
  const pos = (p) => { const d = Math.min(1, p.dist / radiusKm) * R, b = p.brg * Math.PI / 180; return [cx + d * Math.sin(b), cy - d * Math.cos(b)]; };
  planes.forEach((p, i) => {
    const [x, y] = pos(p), c = i === focus ? AM : WH, sel = i === focus;
    // A short trail behind it, back along its track.
    const tr = p.track * Math.PI / 180;
    for (let k = 1; k <= 4; k++) g(x - Math.sin(tr) * k, y + Math.cos(tr) * k, 0.35 - k * 0.07);
    if (p.dueIn >= 0) { const steps = Math.min(R * 2, (p.dueIn * p.gs * 1.852 / 3600) / radiusKm * R + 3); for (let k = 3; k < steps; k += 2) tg.set(Math.round(x + Math.sin(tr) * k), Math.round(y - Math.cos(tr) * k), AM[0] * 0.5, AM[1] * 0.5, AM[2] * 0.5); } // its path over home
    // The plane: a dot with a short line pointing the way it's flying.
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) tg.set(Math.round(x) + i, Math.round(y) + j, c[0], c[1], c[2]);
    for (let k = 2; k <= 4; k++) tg.set(Math.round(x + 0.5 + Math.sin(tr) * k), Math.round(y + 0.5 - Math.cos(tr) * k), c[0] * (1.2 - k * 0.2), c[1] * (1.2 - k * 0.2), c[2] * (1.2 - k * 0.2));
    const due = p.overhead || p.dueIn >= 0, lab = (p.cs || '') + (due ? ' ' + (p.overhead ? 'OVER' : mmss(p.dueIn)) : '');
    const lx = Math.round(x) + 4 + w3(lab) > S - 1 ? Math.round(x) - 3 - w3(lab) : Math.round(x) + 4; // near the right edge: the label goes on the left
    if (sel || S >= 64 || due) txt(tg, FONT_3x5, lab, Math.max(0, lx), Math.round(y) - 2, due ? AM : c, sel || due ? 1 : 0.7, 1, S);
  });
  if (!details || tg.w < S + 44) return;
  const p = planes[focus]; if (!p) return;
  const x0 = S + 4, mw = tg.w - x0 - 1, r = p.route;
  txt(tg, FONT_5x7, p.cs || p.hex.toUpperCase(), x0, 2, AM);
  txt(tg, FONT_3x5, fit(p.airline || p.type, mw, w3), x0, 11, WH);
  if (r && r.from && r.to) { txt(tg, FONT_5x7, r.from.iata, x0, 20, WH); txt(tg, FONT_3x5, 'TO', x0 + w5(r.from.iata) + 3, 21, DM); txt(tg, FONT_5x7, r.to.iata, x0 + w5(r.from.iata) + 14, 20, WH); }
  txt(tg, FONT_3x5, p.type || '', x0, 32, WH); txt(tg, FONT_3x5, fmtAlt(p.alt), x0, 39, AM); txt(tg, FONT_3x5, Math.round(p.gs) + ' KT', x0, 46, CY);
  txt(tg, FONT_3x5, fmtKm(p.dist) + ' ' + compass(p.brg), x0, 53, DM);
}

// Nothing overhead (or still finding out): a slow sweep and a word.
function drawEmpty(tg, t, msg) {
  drawRadar(tg, [], -1, t * 0.5, 1, false);
  const lines = String(msg || 'SKIES CLEAR').toUpperCase().split('\n');
  lines.forEach((l, i) => { const s = fit(l, tg.w - 4, w3); txt(tg, FONT_3x5, s, Math.round(tg.w / 2 - w3(s) / 2), Math.round(tg.h / 2) - 4 + i * 7, i ? DM : WH, 0.9); });
}

// Planes due to pass over home soonest first (or passing now).
function drawDue(tg, planes, t) {
  const due = planes.filter((p) => p.overhead || p.dueIn >= 0).sort((a, b) => (a.overhead ? -1 : a.dueIn) - (b.overhead ? -1 : b.dueIn));
  txt(tg, FONT_5x7, tg.w >= 96 ? 'DUE OVERHEAD' : 'OVERHEAD', 2, 1, AM);
  for (let x = 0; x < tg.w; x += 2) tg.set(x, 10, DM[0] * 0.4, DM[1] * 0.4, DM[2] * 0.4);
  if (!due.length) { txt(tg, FONT_3x5, fit('NONE IN THE NEXT 15 MIN', tg.w - 4, w3), 2, 16, DM); return; }
  due.slice(0, Math.floor((tg.h - 13) / 8)).forEach((p, i) => {
    const y = 14 + i * 8, eta = p.overhead ? 'NOW' : mmss(p.dueIn), r = p.route;
    const route = r && r.from && r.to ? r.from.iata + '-' + r.to.iata : (p.type || '');
    txt(tg, FONT_3x5, eta, tg.w - 2 - w3(eta), y, p.overhead ? AM : WH, p.overhead ? 0.6 + 0.4 * Math.sin(t * 8) : 1);
    const left = (p.cs || p.hex.toUpperCase()) + (tg.w >= 96 ? '  ' + route + (tg.w >= 160 ? '  ' + fmtAlt(p.alt) : '') : '');
    txt(tg, FONT_3x5, fit(left, tg.w - 8 - w3(eta), w3), 2, y, p.color, 1);
  });
}
// Today's tally.
function drawSummary(tg, s, t) {
  txt(tg, FONT_5x7, 'TODAY', 2, 1, AM);
  if (!s) { txt(tg, FONT_3x5, 'NO PLANES YET', 2, 14, DM); return; }
  const n = s.count + ' PLANE' + (s.count === 1 ? '' : 'S'); txt(tg, FONT_5x7, n, tg.w - 2 - w5(n), 1, WH);
  for (let x = 0; x < tg.w; x += 2) tg.set(x, 10, DM[0] * 0.4, DM[1] * 0.4, DM[2] * 0.4);
  const rows = [];
  if (s.busiest) rows.push(['BUSIEST', s.busiest.name + ' ' + s.busiest.n, WH]);
  if (s.highest) rows.push(['HIGHEST', s.highest.cs + ' ' + fmtAlt(s.highest.alt), AM]);
  if (s.fastest) rows.push(['FASTEST', s.fastest.cs + ' ' + Math.round(s.fastest.gs) + 'KT', CY]);
  if (s.interesting.length) rows.push(['SPOTTED', s.interesting.join(', '), GR]);
  rows.slice(0, 6).forEach(([k, v, c], i) => { const y = 14 + i * 8, kw = tg.w >= 96 ? 34 : 0; if (kw) txt(tg, FONT_3x5, k, 2, y, DM); txt(tg, FONT_3x5, fit(v, tg.w - 4 - kw, w3), 2 + kw, y, c); });
}
// A plane right overhead: the region's edge glows, pulsing amber.
function drawGlow(tg, t) {
  const a = 0.5 + 0.5 * Math.sin(t * 6);
  for (let x = 0; x < tg.w; x++) for (const y of [0, 1, tg.h - 2, tg.h - 1]) tg.set(x, y, AM[0] * a, AM[1] * a, AM[2] * a);
  for (let y = 0; y < tg.h; y++) for (const x of [0, 1, tg.w - 2, tg.w - 1]) tg.set(x, y, AM[0] * a, AM[1] * a, AM[2] * a);
}

// The overhead alert drawn over any effect: a banner across the middle.
function drawAlert(tg, p, t) {
  const now = p.overhead, y0 = Math.max(0, Math.round(tg.h / 2) - 11), h = 22, a = 0.55 + 0.45 * Math.sin(t * (now ? 9 : 5));
  for (let y = y0; y < y0 + h; y++) for (let x = 0; x < tg.w; x++) tg.set(x, y, 0.01, 0.01, 0.02);
  for (let x = 0; x < tg.w; x++) { tg.set(x, y0, AM[0] * a, AM[1] * a, AM[2] * a); tg.set(x, y0 + h - 1, AM[0] * a, AM[1] * a, AM[2] * a); }
  const l1 = now ? 'OVERHEAD NOW' : 'OVERHEAD IN ' + mmss(p.dueIn), big = tg.w >= 96;
  const s1 = big ? l1 : (now ? 'OVERHEAD' : 'OVER ' + mmss(p.dueIn));
  txt(tg, FONT_5x7, s1, Math.round(tg.w / 2 - w5(s1) / 2), y0 + 3, AM, 0.6 + 0.4 * a);
  const r = p.route, l2 = [p.cs || p.hex.toUpperCase(), r && r.from && r.to ? r.from.iata + '-' + r.to.iata : p.type, fmtAlt(p.alt)].filter(Boolean).join('  ');
  const s2 = fit(l2, tg.w - 4, w3); txt(tg, FONT_3x5, s2, Math.round(tg.w / 2 - w3(s2) / 2), y0 + 13, WH);
}

module.exports = { drawAlert, drawBoard, drawCompact, drawRadar, drawEmpty, drawDue, drawSummary, drawGlow };
