// Time & Date: one clock effect with five styles (effectOptions.datetime):
//   style   'neon' | 'flip' | 'analogue' | 'words' | 'minimal'
//   h24     true = 24-hour (default), false = 12-hour
//   seconds show seconds (default true)
//   date    show the date (default true)
//   colour  'auto' (slow colour drift) | 'cyan' | 'amber' | 'pink' | 'green' | 'white'
// Older saved modes map onto styles: time/both/full -> neon, date ->
// minimal, analogue -> analogue, words -> words.
// Drawn once on a 2D canvas (canvas.js): the same clock on every cube side
// face, or filling a flat panel/wall.
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, FONT_5x7, drawGlyph, textWidth } = require('./text');
const { defineCanvasEffect } = require('./canvas');
const stroke = require('./strokeFont');
const { renderWords } = require('./wordClock');

const LEGACY = { time: 'neon', both: 'neon', full: 'neon', date: 'minimal', analogue: 'analogue', words: 'words' };
const COLOURS = { cyan: [0.2, 0.85, 1], amber: [1, 0.62, 0.12], pink: [1, 0.3, 0.7], green: [0.35, 1, 0.45], white: [0.95, 0.95, 1] };
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function options(core) {
  const o = (core.effectOptions && core.effectOptions.datetime) || {};
  return {
    style: ['neon', 'flip', 'analogue', 'words', 'minimal'].includes(o.style) ? o.style : (LEGACY[o.mode] || 'neon'),
    h24: o.h24 !== false, seconds: o.seconds !== false, date: o.date !== false, colour: o.colour || 'auto',
  };
}
function tint(opts, t, shift = 0) {
  return COLOURS[opts.colour] || hsl(0.55 + Math.sin(t * 0.05) * 0.12 + shift, 0.9, 0.55);
}
const pad = (n) => String(n).padStart(2, '0');
function parts(opts) {
  const d = new Date();
  let h = d.getHours();
  if (!opts.h24) h = h % 12 || 12;
  return { d, hh: opts.h24 ? pad(h) : String(h), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()), ms: d.getMilliseconds() };
}
const dateLine = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

// ── 7-segment digits (Neon) ──
//   segments a..g:  a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function rect(c, x0, y0, w, h, col) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) for (let x = Math.round(x0); x < Math.round(x0 + w); x++) c.set(x, y, col[0], col[1], col[2]);
}
function seg7(c, ch, x, y, w, h, th, on, off) {
  const lit = SEG[ch] || '', hh = (h - th) / 2;
  const S = {
    a: [x + th, y, w - 2 * th, th], d: [x + th, y + h - th, w - 2 * th, th], g: [x + th, y + hh, w - 2 * th, th],
    f: [x, y + th, th, hh - th / 2], b: [x + w - th, y + th, th, hh - th / 2],
    e: [x, y + hh + th, th, hh - th / 2], c: [x + w - th, y + hh + th, th, hh - th / 2],
  };
  for (const k of 'abcdefg') { const r = S[k]; rect(c, r[0], r[1], r[2], r[3], lit.includes(k) ? on : off); }
}
function neon(c, opts, t) {
  const { d, hh, mm, ss, ms } = parts(opts);
  const col = tint(opts, t), ghost = [col[0] * 0.07, col[1] * 0.07, col[2] * 0.07];
  const digits = (hh.length === 1 ? ' ' + hh : hh) + mm;
  const dateH = opts.date ? Math.max(6, Math.round(c.H * 0.14)) : 0;
  const barH = opts.seconds ? Math.max(2, Math.round(c.H * 0.05)) : 0;
  const availH = c.H - dateH - barH - 6;
  const dw = Math.min((c.W - 10) / 4.6, availH * 0.55), dh = Math.min(availH, dw * 1.8), th = Math.max(1, Math.round(dw / 5));
  const gap = dw * 0.18, colonW = dw * 0.5, total = 4 * dw + 3 * gap + colonW;
  let x = (c.W - total) / 2;
  const y = (c.H - dh - dateH - barH) / 2;
  for (let i = 0; i < 4; i++) {
    if (digits[i] !== ' ') seg7(c, digits[i], x, y, dw, dh, th, col, ghost);
    x += dw + gap;
    if (i === 1) {
      const blink = ms < 500 ? col : ghost, r = Math.max(1, th);
      rect(c, x + colonW / 2 - r / 2 - gap / 2, y + dh * 0.3, r, r, blink);
      rect(c, x + colonW / 2 - r / 2 - gap / 2, y + dh * 0.66, r, r, blink);
      x += colonW;
    }
  }
  if (opts.seconds) {
    const by = Math.round(y + dh + 3), frac = (Number(ss) + ms / 1000) / 60, bw = total;
    for (let i = 0; i < bw; i++) {
      const on = i / bw <= frac;
      rect(c, (c.W - bw) / 2 + i, by, 1, barH, on ? col : ghost);
    }
  }
  if (opts.date) smoothCentred(c, dateLine(d), c.H - dateH + 1, dateH - 2, [col[0] * 0.75, col[1] * 0.75, col[2] * 0.75]);
}
// Text centred across the canvas: smooth vector strokes when it's big
// enough to show curves (cap height >= 9 px), the crisp pixel font below.
function smoothCentred(c, s, y, h, col) {
  if (h < 9) { const sc = Math.max(1, Math.floor(h / 5)); return drawCentred(c, FONT_3x5, s, y + Math.round((h - 5 * sc) / 2), sc, col); }
  stroke.drawText(c, s, Math.round((c.W - stroke.textWidth(s, h)) / 2), y, h, col);
}
function drawCentred(c, font, s, y, scale, col) {
  let x = Math.round((c.W - textWidth(font, s, scale)) / 2);
  for (const ch of s) x += drawGlyph(font, ch, x, y, (px, py) => c.set(px, py, col[0], col[1], col[2]), { scale });
}

// ── Flip (split-flap cards) ──
const flipState = { shown: '', from: '', t0: 0 };
function flip(c, opts, t) {
  const { d, hh, mm, ss } = parts(opts);
  // Seconds cards only when there's room for them (a wall two panels wide+).
  const text = pad(hh) + mm + (opts.seconds && c.W >= 128 ? ss : '');
  const n = text.length;
  if (text !== flipState.shown) { flipState.from = flipState.shown || text; flipState.shown = text; flipState.t0 = t; }
  const p = Math.min(1, (t - flipState.t0) / 0.45);
  const col = tint(opts, t), card = [0.07, 0.07, 0.09], edge = [0.18, 0.18, 0.22];
  const dateH = opts.date ? Math.max(6, Math.round(c.H * 0.14)) : 0;
  const gap = Math.max(1, Math.round(c.W / 64)), groupGap = gap * 3;
  const cw = Math.floor((c.W - 4 - (n - 1) * gap - (n / 2 - 1) * groupGap) / n);
  const ch = Math.min(Math.round(cw * 1.5), c.H - dateH - 6);
  const sc = Math.max(1, Math.floor(Math.min(cw / 6, ch / 8)));
  let x = Math.round((c.W - (n * cw + (n - 1) * gap + (n / 2 - 1) * groupGap)) / 2);
  const y = Math.round((c.H - ch - dateH) / 2), mid = y + Math.floor(ch / 2);
  for (let i = 0; i < n; i++) {
    const changing = flipState.from[i] !== text[i] && p < 1;
    rect(c, x, y, cw, ch, card);
    for (let k = 0; k < cw; k++) c.set(x + k, mid, edge[0], edge[1], edge[2]);
    const glyph = (chr, clipTop, clipBot, squash) => {
      const gh = Math.round(ch * 0.66), gx = x + Math.round((cw - stroke.textWidth(chr, gh)) / 2), gy = y + Math.round((ch - gh) / 2);
      if (gh < 9) { // too small for curves: pixel font
        const gw = 5 * sc, gh2 = 7 * sc, bx = x + Math.round((cw - gw) / 2), by = y + Math.round((ch - gh2) / 2);
        drawGlyph(FONT_5x7, chr, bx, by, (px, py) => { const yy = squash !== 1 ? Math.round(mid + (py - mid) * squash) : py; if (yy >= clipTop && yy <= clipBot) c.set(px, yy, col[0], col[1], col[2]); }, { scale: sc });
        return;
      }
      // The flap: draw through a view that squashes towards the card's middle and clips to one half.
      const view = {
        get: (px, py) => { const yy = squash !== 1 ? Math.round(mid + (py - mid) * squash) : py; return yy < clipTop || yy > clipBot ? null : c.get(px, yy); },
        set: (px, py, r, g, b) => { const yy = squash !== 1 ? Math.round(mid + (py - mid) * squash) : py; if (yy >= clipTop && yy <= clipBot) c.set(px, yy, r, g, b); },
      };
      stroke.drawText(view, chr, gx, gy, gh, col);
    };
    if (!changing) glyph(text[i], y, y + ch, 1);
    else {
      // New digit's top half is revealed behind the falling flap; the old
      // digit's bottom half stays until the flap lands on it.
      glyph(text[i], y, mid - 1, 1);
      glyph(flipState.from[i], mid + 1, y + ch, 1);
      if (p < 0.5) glyph(flipState.from[i], y, mid - 1, 1 - p * 2); // old top flap folding down
      else glyph(text[i], mid + 1, y + ch, (p - 0.5) * 2); // new bottom flap unfolding
    }
    x += cw + gap + (i % 2 === 1 ? groupGap : 0);
  }
  if (opts.date) smoothCentred(c, dateLine(d), c.H - dateH + 1, dateH - 2, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]);
}

// ── Analogue ──
function analogue(c, opts, t) {
  const { d, ms } = parts(opts);
  const col = tint(opts, t), cx = (c.W - 1) / 2, cy = (c.H - 1) / 2, R = Math.min(c.W, c.H) / 2 - 1;
  const sec = d.getSeconds() + ms / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
  // Hour and minute hands: slim, tapering to a point, with a dark outline
  // and a lighter centre line; the seconds hand stays a thin red needle.
  const light = (k) => [Math.min(1, col[0] * (1 - k) + k), Math.min(1, col[1] * (1 - k) + k), Math.min(1, col[2] * (1 - k) + k)];
  const hands = [
    { a: hr / 12, len: R * 0.52, w: Math.max(1.3, R * 0.075), tip: 0.3, col, outline: true },
    { a: min / 60, len: R * 0.82, w: Math.max(1.1, R * 0.055), tip: 0.25, col: light(0.45), outline: true },
  ];
  if (opts.seconds) hands.push({ a: sec / 60, len: R * 0.9, w: 0.7, tip: 1, col: [1, 0.25, 0.3] });
  for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
    const dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy);
    let r = 0, g = 0, b = 0;
    // Dial: soft face, a bright rim, 12 hour marks and 60 minute dots.
    if (dist <= R) { const f = 0.03 * (1 - dist / R); r += col[0] * f; g += col[1] * f; b += col[2] * f; }
    const rim = Math.max(0, 1 - Math.abs(dist - R) * 1.4) * 0.5; r += col[0] * rim; g += col[1] * rim; b += col[2] * rim;
    const ang = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
    const tick12 = Math.abs(((ang * 12 + 0.5) % 1) - 0.5), tick60 = Math.abs(((ang * 60 + 0.5) % 1) - 0.5);
    if (dist > R * 0.8 && dist < R - 1 && tick12 * dist * Math.PI * 2 / 12 < 0.9) { r = Math.max(r, 0.9); g = Math.max(g, 0.9); b = Math.max(b, 0.95); }
    else if (dist > R * 0.88 && dist < R - 1 && tick60 * dist * Math.PI * 2 / 60 < 0.45) { r += 0.12; g += 0.12; b += 0.14; }
    // Hands: distance from each pixel to each hand's segment, anti-aliased.
    for (const h of hands) {
      const ex = Math.sin(h.a * Math.PI * 2) * h.len, ey = -Math.cos(h.a * Math.PI * 2) * h.len;
      const tt = Math.max(-0.12, Math.min(1, (dx * ex + dy * ey) / (h.len * h.len)));
      const dd = Math.hypot(dx - ex * tt, dy - ey * tt);
      const w = h.w * (tt < 0 ? 0.8 : 1 - (1 - h.tip) * tt); // tapers towards the tip
      if (h.outline) { // a dark rim keeps the hands crisp against the dial and each other
        const rim = Math.max(0, Math.min(1, w + 1.3 - dd));
        if (rim > 0) { r *= 1 - rim * 0.85; g *= 1 - rim * 0.85; b *= 1 - rim * 0.85; }
      }
      const cover = Math.max(0, Math.min(1, w - dd + 0.5));
      if (cover > 0) {
        const hi = h.outline ? Math.max(0, 1 - dd / Math.max(0.6, w * 0.5)) * 0.35 : 0; // lighter centre line
        const cr = Math.min(1, h.col[0] + hi), cg = Math.min(1, h.col[1] + hi), cb = Math.min(1, h.col[2] + hi);
        r = r * (1 - cover) + cr * cover; g = g * (1 - cover) + cg * cover; b = b * (1 - cover) + cb * cover;
      }
    }
    if (dist < Math.max(1.2, R * 0.07)) { r = 1; g = 1; b = 1; }
    c.set(x, y, Math.min(1, r), Math.min(1, g), Math.min(1, b));
  }
  if (opts.date && R > 20) {
    smoothCentred(c, String(d.getDate()), Math.round(cy + R * 0.3), Math.max(5, Math.round(R * 0.22)), [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
  }
}

// ── Minimal ──
function minimal(c, opts, t) {
  const { d, hh, mm, ss, ms } = parts(opts);
  const col = tint(opts, t);
  const timeStr = hh + ':' + mm;
  // Biggest smooth time that fits, the date at a third of its height.
  let th = Math.floor(c.H * (opts.date ? 0.42 : 0.6));
  while (th > 6 && stroke.textWidth(timeStr, th) > c.W - 6) th--;
  const dh = Math.max(5, Math.round(th * 0.36));
  const block = th + (opts.date ? Math.round(th * 0.3) + dh : 0);
  const y0 = Math.round((c.H - block) / 2);
  smoothCentred(c, timeStr, y0, th, col);
  if (ms >= 500) { // blink: dim the colon by redrawing it dark
    const cx0 = Math.round((c.W - stroke.textWidth(timeStr, th)) / 2) + stroke.textWidth(hh, th) + th / 6 * 1.2;
    for (let yy = y0; yy < y0 + th + 2; yy++) for (let xx = Math.floor(cx0 - th / 8); xx <= cx0 + th / 4; xx++) { const o = c.get(xx, yy); if (o) c.set(xx, yy, o[0] * 0.15, o[1] * 0.15, o[2] * 0.15); }
  }
  if (opts.date) smoothCentred(c, dateLine(d), y0 + th + Math.round(th * 0.3), dh, [0.7, 0.72, 0.8]);
  if (opts.seconds) {
    // Seconds as a dot travelling round the panel's edge.
    const per = 2 * (c.W + c.H) - 4, pos = ((Number(ss) + ms / 1000) / 60) * per;
    for (let k = 0; k < per; k += 1) {
      const [x, y] = k < c.W ? [k, 0] : k < c.W + c.H - 1 ? [c.W - 1, k - c.W + 1] : k < 2 * c.W + c.H - 2 ? [c.W - 1 - (k - c.W - c.H + 2), c.H - 1] : [0, c.H - 1 - (k - 2 * c.W - c.H + 3)];
      const behind = pos - k, v = k <= pos ? 0.12 + Math.max(0, 1 - behind / 6) * 0.88 : 0.03;
      c.set(x, y, col[0] * v, col[1] * v, col[2] * v);
    }
  }
}

module.exports = defineCanvasEffect({
  render(c, ctx) {
    const opts = options(ctx.core);
    c.clear();
    if (opts.style === 'words') return renderWords(c, ctx, COLOURS[opts.colour] || null);
    ({ neon, flip, analogue, minimal })[opts.style](c, opts, ctx.t);
  },
});
module.exports.getStatus = () => null;
