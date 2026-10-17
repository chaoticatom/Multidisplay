// The Auto-DJ's two decks along the bottom of the wall, under the spectrum:
// NOW PLAYING on the left half (cyan) and UP NEXT on the right (amber), like
// a DJ controller's screens. Each deck has a header (icon, label, and BPM/
// key alternating with the time left, or the countdown to the mix), the
// title (scrolling when it doesn't fit, sliding up into place when it
// changes) and a bar along the bottom: how far through the song, or how far
// through the mix. During a mix the NOW deck dims as the NEXT one lights up.
// On the wall, the decks follow the panels: a strip two or more panels wide
// splits in two; separate panels get one deck each; further strips repeat
// them. On the cube, NOW is on the front and back, NEXT on the right and
// left. On a single panel the two decks take turns. info is
// RadioAudio.djInfo: { now: {title, bpm, key, dur, pos}, next: {title, bpm,
// key, status, style, beats}, mixing, mixU 0..1, mixIn seconds or -1 }.
'use strict';

const { FONT_3x5, FONT_5x7, drawString, textWidth } = require('../text');

const ROWS = 17;
const NOW = { c: [0.15, 0.8, 1], text: [0.88, 0.96, 1], label: 'NOW PLAYING', short: 'NOW' };
const NEXT = { c: [1, 0.55, 0.12], text: [1, 0.9, 0.72], label: 'UP NEXT', short: 'NEXT' };

function createDeckState() { return { decks: [{ title: '', t: 9, s: 0 }, { title: '', t: 9, s: 0 }], t: 0 }; }

const sm = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// tg: { set(x, y, r, g, b) } in top-down rows; the deck fills x0..x0+w-1,
// rows y0..y0+ROWS-1. adv: advance the title's animation (once per frame per
// deck, though a deck may be drawn on several panels or cube faces).
function drawDeck(tg, x0, w, y0, kind, d, ds, dt, beat, adv) {
  const H = y0 + ROWS, isNow = kind === NOW, k = d.k;
  const set = (x, y, c, a) => { if (x >= x0 && x < x0 + w && a > 0.003) tg.set(x, y, c[0] * a, c[1] * a, c[2] * a); };
  // Background and a top rule that fades out to the deck's edges.
  for (let y = y0 + 1; y < H; y++) for (let x = x0; x < x0 + w; x++) set(x, y, kind.c, 0.025 * k);
  for (let x = x0; x < x0 + w; x++) { const e = Math.min(x - x0, x0 + w - 1 - x) / Math.max(1, w * 0.25); set(x, y0, kind.c, 0.5 * sm(e) * k); }
  // Header: icon + label, info on the right.
  const hy = y0 + 2, ic = 0.7 + 0.3 * beat;
  if (isNow) { for (let r = 0; r < 5; r++) for (let c = 0; c <= Math.min(r, 4 - r); c++) set(x0 + 2 + c, hy + r, kind.c, ic * k); } // a play triangle
  else { for (let r = 0; r < 5; r++) { const c = Math.min(r, 4 - r); set(x0 + 2 + c, hy + r, kind.c, ic * k); set(x0 + 4 + c, hy + r, kind.c, ic * k); } } // >>
  const right = d.right || '';
  const rw = right ? textWidth(FONT_3x5, right) : 0;
  const label = w >= 40 + rw + textWidth(FONT_3x5, kind.label) ? kind.label : kind.short;
  drawString(FONT_3x5, label, x0 + 9, hy, (x, y) => set(x, y, kind.c, 0.95 * k));
  if (right) drawString(FONT_3x5, right, x0 + w - 2 - rw, hy, (x, y) => set(x, y, d.rightC || [0.75, 0.8, 0.9], (d.rightA || 0.75) * k));
  // Title: slides up when it changes; scrolls (after a pause) when too long.
  const title = (d.title || '').toUpperCase();
  if (title !== ds.title) { ds.title = title; ds.t = 0; ds.s = 0; }
  if (adv) ds.t += dt;
  const ty = y0 + 8, area = w - 4, tw = title ? textWidth(FONT_5x7, title) : 0;
  const slide = Math.round((1 - sm(ds.t / 0.45)) * 9), clipTop = ty, clipBot = ty + 6;
  let tx = x0 + 2 + Math.max(0, Math.floor((area - tw) / 2));
  if (tw > area) {
    if (ds.t > 2 && adv) ds.s += dt * 13;
    const loop = tw + 24; if (ds.s > loop) { ds.s -= loop; }
    tx = x0 + 2 - Math.floor(ds.s);
  }
  const plotT = (x, y) => {
    const yy = y + slide; if (yy < clipTop || yy > clipBot || x < x0 + 2 || x >= x0 + 2 + area) return;
    const edge = tw > area ? sm(Math.min(x - (x0 + 2), x0 + 1 + area - x) / 4) : 1; // soft ends while scrolling
    set(x, yy, d.textC || kind.text, (d.textA || 1) * edge * k);
  };
  if (title) {
    drawString(FONT_5x7, title, tx, ty, plotT);
    if (tw > area) drawString(FONT_5x7, title, tx + tw + 24, ty, plotT);
  }
  // The bar along the bottom row: a gradient fill with a bright head.
  const by = H - 1, f = Math.max(0, Math.min(1, d.bar || 0)), fill = Math.round(f * (w - 2));
  for (let x = 1; x < w - 1; x++) {
    const on = x - 1 < fill, g = (x - 1) / Math.max(1, w - 3);
    const c = on ? [kind.c[0] * (0.55 + 0.45 * g), kind.c[1] * (0.55 + 0.45 * g), kind.c[2] * (0.55 + 0.45 * g)] : kind.c;
    set(x0 + x, by, c, on ? (d.barA || 0.8) * k : 0.07 * k);
  }
  if (d.scan !== undefined) { const sx = x0 + 1 + Math.round(d.scan * (w - 3)); for (let j = -2; j <= 2; j++) set(sx + j, by, kind.c, (1 - Math.abs(j) / 3) * k); }
  else if (fill > 0 && fill < w - 2) set(x0 + fill, by, [1, 1, 1], 0.9 * k);
}

// Draws both decks; returns the rows used (so the spectrum keeps clear of them).
function drawDjDecks(core, info, st, dt, beat = 0, where = 'wall') {
  if (!info) return 0;
  st.t += dt;
  const W = core.wallW || 0, t = st.t, mixing = !!info.mixing, u = info.mixU || 0;
  const now = info.now, next = info.next;
  const alt = Math.floor(t / 4) % 2 === 1; // header info alternates every 4 s
  const keyBpm = (x) => [x.bpm ? x.bpm + (W >= 192 ? ' BPM' : '') : '', x.key || ''].filter(Boolean).join(' ');
  const dNow = now ? {
    title: now.title, k: mixing ? 1 - 0.55 * sm(u) : 1,
    right: alt && now.dur ? '-' + mmss(now.dur - now.pos) : keyBpm(now),
    bar: now.dur ? now.pos / now.dur : 0,
  } : { title: 'LOADING', k: 0.6, right: '', scan: (Math.sin(t * 3) + 1) / 2 };
  let dNext;
  if (!next) dNext = { title: '', k: 0.5, right: '', bar: 0 };
  else if (next.status === 'loading') dNext = { title: next.title, k: 0.75, textA: 0.6, right: 'LOADING' + '...'.slice(0, 1 + Math.floor(t * 2) % 3), rightA: 0.55, scan: (Math.sin(t * 2.4) + 1) / 2 };
  else {
    const soon = info.mixIn >= 0 && info.mixIn < 60;
    dNext = {
      title: next.title, k: mixing ? 0.75 + 0.25 * sm(u) : 0.8, textA: mixing ? 0.75 + 0.25 * u : 0.8,
      right: mixing ? (next.style === 'cut' ? 'CUT' : 'MIXING') : soon && alt ? 'IN ' + mmss(info.mixIn) : keyBpm(next),
      rightC: mixing ? NEXT.c : undefined, rightA: mixing ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 8)) : 0.75,
      bar: mixing ? u : soon ? 1 - info.mixIn / 60 : 0, barA: mixing ? 1 : 0.45,
    };
  }
  const drawn = [false, false];
  const deck = (tg, x0, w, y0, which) => {
    drawDeck(tg, x0, w, y0, which ? NEXT : NOW, which ? dNext : dNow, st.decks[which], dt, beat, !drawn[which]);
    drawn[which] = true;
  };
  const turn = next && (mixing || (t % 11) > 7) ? 1 : 0; // one screen only: the decks take turns (the next stays up while mixing)
  if (where === 'wall' && core.wallW && core.wallPanels) {
    // Panels: along the bottom edge of each column of the wall; runs of
    // side-by-side panels whose bottoms line up share a strip.
    const S = core.wallPanelSize, tg = { set: (x, y, r, g, b) => core.setWallPixel(x, y, r, g, b) };
    const bottom = new Array(core.wallCols).fill(-1);
    for (const p of core.wallPanels) bottom[p.gx] = Math.max(bottom[p.gx], p.gy);
    const runs = [];
    for (let gx = 0; gx < core.wallCols; gx++) {
      if (bottom[gx] < 0) continue;
      const last = runs[runs.length - 1];
      if (last && last.gy === bottom[gx] && last.gx1 === gx - 1) last.gx1 = gx; else runs.push({ gy: bottom[gx], gx0: gx, gx1: gx });
    }
    runs.sort((a, b) => (b.gy - a.gy) || ((b.gx1 - b.gx0) - (a.gx1 - a.gx0)) || (a.gx0 - b.gx0));
    const span = (r) => ({ x0: r.gx0 * S, w: (r.gx1 - r.gx0 + 1) * S, y0: (r.gy + 1) * S - ROWS });
    if (runs.length === 1 && runs[0].gx0 === runs[0].gx1 && core.wallPanels.length > 1) {
      // One column of panels (a stack): NEXT goes on the panel above.
      const up = core.wallPanels.filter((p) => p.gx === runs[0].gx0 && p.gy < runs[0].gy).sort((a, b) => b.gy - a.gy)[0];
      if (up) runs.push({ gy: up.gy, gx0: up.gx, gx1: up.gx });
    }
    const r0 = runs[0] && span(runs[0]);
    if (!r0) return 0;
    if (r0.w >= 96) { // a strip two panels or more wide: NOW on the left half, NEXT on the right
      const half = Math.floor(r0.w / 2 / 8) * 8 || Math.floor(r0.w / 2);
      deck(tg, r0.x0, half, r0.y0, 0); deck(tg, r0.x0 + half, r0.w - half, r0.y0, 1);
    } else if (runs.length > 1) { // single panels apart (a stack, an L, ...): NOW on the lowest, NEXT on the next
      const r1 = span(runs[1]);
      deck(tg, r0.x0, r0.w, r0.y0, 0); deck(tg, r1.x0, r1.w, r1.y0, 1);
    } else deck(tg, r0.x0, r0.w, r0.y0, turn);
    // Any further strips repeat the decks, so every side of the wall shows them.
    for (let i = 1; i < runs.length; i++) {
      if (i === 1 && r0.w < 96) continue;
      const r = span(runs[i]);
      if (r.w >= 96) { const half = Math.floor(r.w / 2); deck(tg, r.x0, half, r.y0, 0); deck(tg, r.x0 + half, r.w - half, r.y0, 1); }
      else deck(tg, r.x0, r.w, r.y0, i % 2);
    }
  } else if (where === 'wall' && core.wallW) {
    const W = core.wallW, H = core.wallH, tg = { set: (x, y, r, g, b) => core.setWallPixel(x, y, r, g, b) };
    if (W >= 96) { const half = Math.floor(W / 2); deck(tg, 0, half, H - ROWS, 0); deck(tg, half, W - half, H - ROWS, 1); }
    else deck(tg, 0, W, H - ROWS, turn);
  } else if (where === 'cube') {
    // The cube: NOW along the bottom of the front and back, NEXT on the right
    // and left, so turning the corner from one face to the next goes from the
    // song playing to the one coming up. A lone flat panel ('2d') takes turns.
    const SZ = core.SIZE || 64, face = (f) => ({ set: (x, y, r, g, b) => core.setFaceLED(f, x, SZ - 1 - y, r, g, b) });
    if (core.panelMode === '2d') deck(face(0), 0, SZ, SZ - ROWS, turn);
    else { deck(face(0), 0, SZ, SZ - ROWS, 0); deck(face(2), 0, SZ, SZ - ROWS, 1); deck(face(1), 0, SZ, SZ - ROWS, 0); deck(face(3), 0, SZ, SZ - ROWS, 1); }
  }
  return ROWS;
}

module.exports = { drawDjDecks, createDeckState, ROWS };
