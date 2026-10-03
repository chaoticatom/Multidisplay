// Near-Earth Objects, redesigned: an approach radar with Earth glowing at
// the centre, the Moon's orbit as a scale ring, and each asteroid passing
// at its real miss distance (log scale), sized by diameter, coloured by
// risk (green / amber / red), moving along its approach line with a trail.
// The closest gets a pulsing target ring. Beside or below the radar, an
// info card cycles through the objects: name, distance, size, speed, day.
// Data comes from neo.js (NASA NeoWs, fetched hourly).
'use strict';
const { FONT_3x5, drawGlyph, textWidth } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const stroke = require('./strokeFont');
const neo = require('./neo');

const REFRESH_S = 3600, CARD_S = 5;
let lastFetch = 0, lastRefreshOpt = null, scrollX = 0;
const RISK = { red: [1, 0.25, 0.25], yellow: [1, 0.72, 0.15], green: [0.3, 1, 0.5] };
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function ensureFetch(core) {
  const opts = (core.effectOptions && core.effectOptions.neo) || {};
  if (opts.refreshRequestedAt && opts.refreshRequestedAt !== lastRefreshOpt) { lastRefreshOpt = opts.refreshRequestedAt; lastFetch = 0; }
  if ((!neo.getObjects().length || Date.now() / 1000 - lastFetch > REFRESH_S) && Date.now() / 1000 - lastFetch > 60) {
    lastFetch = Date.now() / 1000;
    neo.neoFetch();
  }
}
function lift(c, x, y, r, g, b) {
  const o = c.get(x, y); if (!o) return;
  c.set(x, y, Math.min(1, Math.max(o[0], r)), Math.min(1, Math.max(o[1], g)), Math.min(1, Math.max(o[2], b)));
}
function text(c, s, x, y, h, col) {
  if (h >= 9) return stroke.drawText(c, s, x, y, h, col);
  const sc = Math.max(1, Math.floor(h / 5));
  for (const ch of s) x += drawGlyph(FONT_3x5, ch, x, y, (px, py) => lift(c, px, py, col[0], col[1], col[2]), { scale: sc });
}
const textW = (s, h) => (h >= 9 ? stroke.textWidth(s, h) : textWidth(FONT_3x5, s, Math.max(1, Math.floor(h / 5))));

function radar(c, cx, cy, R, objs, t) {
  // Space backdrop with a few fixed stars.
  for (let i = 0; i < 40; i++) {
    const x = Math.round(cx + (hash('x' + i) - 0.5) * R * 2.2), y = Math.round(cy + (hash('y' + i) - 0.5) * R * 2.2);
    const tw = 0.15 + 0.1 * Math.sin(t * 2 + i);
    lift(c, x, y, tw, tw, tw * 1.2);
  }
  // Distance scale: log(LD) so the Moon (1 LD) and 50 LD both fit.
  const rOf = (ld) => R * Math.min(1, Math.log10(1 + Math.max(0.05, ld)) / Math.log10(51));
  // Range rings: Moon orbit (dashed, labelled) and 10 / 50 LD faint rings.
  for (const [ld, k, dash] of [[1, 0.35, true], [10, 0.12, false], [50, 0.1, false]]) {
    const r = rOf(ld), n = Math.max(24, Math.round(r * 7));
    for (let i = 0; i < n; i++) {
      if (dash && i % 3 === 2) continue;
      const a = (i / n) * Math.PI * 2;
      lift(c, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 0.25 * k * 2, 0.45 * k * 2, k * 2);
    }
  }
  const moonA = t * 0.08, mr = rOf(1);
  lift(c, Math.round(cx + Math.cos(moonA) * mr), Math.round(cy + Math.sin(moonA) * mr), 0.8, 0.8, 0.75);
  // Earth: shaded disc with a blue atmosphere glow.
  const er = Math.max(1.5, R * 0.1);
  for (let y = Math.floor(cy - er * 2); y <= cy + er * 2; y++) for (let x = Math.floor(cx - er * 2); x <= cx + er * 2; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= er) { const land = Math.sin(x * 1.3 + t * 0.4) * Math.cos(y * 1.1) > 0.25, k = 1 - d / er * 0.5; lift(c, x, y, (land ? 0.2 : 0.05) * k, (land ? 0.75 : 0.35) * k, (land ? 0.3 : 1) * k); }
    else if (d < er * 2) { const g = (1 - (d - er) / er) * 0.35; lift(c, x, y, g * 0.3, g * 0.6, g); }
  }
  // Asteroids, closest last so it draws on top.
  const list = objs.slice(0, 12).reverse();
  list.forEach((o, idx) => {
    const closest = idx === list.length - 1;
    const ang = hash(o.name) * Math.PI * 2, r = rOf(o.missLD);
    // Each moves across its closest-approach point: a straight path
    // tangent to its miss circle, looping slowly.
    const phase = ((t * (0.03 + hash(o.name + 'v') * 0.04) + hash(o.name + 'p')) % 1) * 2 - 1;
    const span = R * 0.9;
    const px = cx + Math.cos(ang) * r - Math.sin(ang) * phase * span, py = cy + Math.sin(ang) * r + Math.cos(ang) * phase * span;
    const col = RISK[neo.neoRisk(o)] || RISK.green;
    for (let k = 1; k <= 8; k++) { // trail behind it
      const tx = px + Math.sin(ang) * k * 1.2, ty = py - Math.cos(ang) * k * 1.2, f = 0.3 * (1 - k / 9);
      lift(c, Math.round(tx), Math.round(ty), col[0] * f, col[1] * f, col[2] * f);
    }
    const size = Math.max(0.8, Math.min(2.6, Math.log10(Math.max(10, o.diaM)) - 0.6)) * (R / 30);
    for (let y = Math.floor(py - size - 1); y <= py + size + 1; y++) for (let x = Math.floor(px - size - 1); x <= px + size + 1; x++) {
      const cover = Math.max(0, Math.min(1, size + 0.5 - Math.hypot(x - px, y - py)));
      if (cover > 0) lift(c, x, y, col[0] * cover, col[1] * cover, col[2] * cover);
    }
    if (closest) { // pulsing target ring
      const rr = size + 2 + (Math.sin(t * 4) * 0.5 + 0.5) * 2, n = Math.round(rr * 7);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; lift(c, Math.round(px + Math.cos(a) * rr), Math.round(py + Math.sin(a) * rr), 1, 1, 1); }
    }
  });
}

function card(c, x0, y0, w, h, o, total, idx, t) {
  const col = RISK[neo.neoRisk(o)] || RISK.green;
  const lineH = Math.max(5, Math.min(Math.round(h / 4.2), Math.round(w / 7)));
  const name = o.name.toUpperCase(), nameW = textW(name, lineH);
  // Name: scrolls if it doesn't fit.
  const nx = nameW <= w ? x0 + Math.round((w - nameW) / 2) : x0 - Math.floor(scrollX % (nameW + w)) + w;
  const clip = { get: (x, y) => (x < x0 || x >= x0 + w ? null : c.get(x, y)), set: (x, y, r, g, b) => { if (x >= x0 && x < x0 + w) c.set(x, y, r, g, b); } };
  text(clip, name, nx, y0, lineH, [0.95, 0.95, 1]);
  const day = o.date ? DAYS[new Date(o.date + 'T12:00:00').getDay()] : '';
  const rows = [[`${o.missLD.toFixed(1)} LD`, col], [`${o.diaM} M  ${o.velKmS.toFixed(0)} KM/S`, [0.75, 0.8, 0.9]], [`${day}  ${idx + 1}/${total}`, [0.5, 0.55, 0.65]]];
  let y = y0 + lineH + Math.max(2, Math.round(lineH * 0.45));
  rows.forEach(([s, cc], i) => {
    let hh = i === 0 ? lineH : Math.max(5, Math.round(lineH * 0.7));
    while (hh > 5 && textW(s, hh) > w) hh--; // shrink to fit the card's width
    const sw = textW(s, hh);
    if (y + hh <= y0 + h + 1) text(c, s, x0 + Math.round((w - Math.min(w, sw)) / 2), y, hh, cc);
    y += hh + Math.max(2, Math.round(hh * 0.4));
  });
}

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    ensureFetch(core);
    c.clear();
    const objs = neo.getObjects();
    const wide = c.W >= c.H * 1.4;
    const rs = wide ? Math.min(c.H, c.W * 0.55) : Math.min(c.W, Math.round(c.H * 0.62));
    radar(c, (wide ? rs : c.W) / 2, rs / 2, rs / 2 - 1, objs, t);
    if (!objs.length) {
      const st = neo.getStatus(), msg = st && st.error ? 'NO DATA' : 'FETCHING';
      const h = Math.max(5, Math.round((wide ? c.H : c.H - rs) / 4));
      text(c, msg, Math.round(((wide ? c.W + rs : c.W) - textW(msg, h)) / 2) - (wide ? 0 : 0), wide ? Math.round(c.H / 2 - h / 2) : rs + 2, h, [0.5, 0.6, 0.8]);
      return;
    }
    scrollX += dt * 10;
    const idx = Math.floor(t / CARD_S) % objs.length;
    if (wide) card(c, rs + 2, Math.round(c.H * 0.12), c.W - rs - 4, Math.round(c.H * 0.8), objs[idx], objs.length, idx, t);
    else card(c, 1, rs + 1, c.W - 2, c.H - rs - 2, objs[idx], objs.length, idx, t);
  },
});
module.exports.getStatus = neo.getStatus;
