// The Auto-DJ's two decks along the bottom of the wall, under the spectrum:
// NOW PLAYING on the left half (cyan) and UP NEXT on the right (amber), like
// a DJ controller's screens. Each deck has a header (icon, label, BPM and
// key, or the countdown to the mix), the title (scrolling when it doesn't
// fit, sliding up into place when it changes), two lines of detail - NOW:
// time played / length and when and how the mix will happen; NEXT: tempo,
// key, any speed or key change, and the planned mix and why - and a
// timeline along the bottom: NOW's shows the song with the mix window
// marked in amber; NEXT's fills as the mix approaches and runs. During a
// mix the NOW deck dims as the NEXT one lights up.
// On the wall, the decks follow the panels: a strip two or more panels wide
// splits in two; separate panels get one deck each; further strips repeat
// them. On the cube, NOW is on the front and back, NEXT on the right and
// left. On a single panel the two decks take turns. info is
// RadioAudio.djInfo: { now: {title, bpm, key, dur, pos}, next: {title, bpm,
// key, status, style, beats}, mixing, mixU 0..1, mixIn seconds or -1 }.
'use strict';

const { FONT_3x5, FONT_5x7, drawString, textWidth } = require('../text');

const ROWS = 30;
const NOW = { c: [0.15, 0.8, 1], text: [0.88, 0.96, 1], label: 'NOW PLAYING', short: 'NOW' };
const NEXT = { c: [1, 0.55, 0.12], text: [1, 0.9, 0.72], label: 'UP NEXT', short: 'NEXT' };

function createDeckState() { return { decks: [{ title: '', t: 9, s: 0, s2: 0, l2: '' }, { title: '', t: 9, s: 0, s2: 0, l2: '' }], t: 0 }; }

const sm = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// tg: { set(x, y, r, g, b) } in top-down rows; the deck fills x0..x0+w-1,
// rows y0..y0+ROWS-1. adv: advance the animations (once per frame per deck,
// though a deck may be drawn on several panels or cube faces).
const DIM = [0.62, 0.68, 0.8];
function drawDeck(tg, x0, w, y0, kind, d, ds, dt, beat, adv) {
  const H = y0 + ROWS, isNow = kind === NOW, k = d.k;
  const set = (x, y, c, a) => { if (x >= x0 && x < x0 + w && a > 0.003) tg.set(x, y, c[0] * a, c[1] * a, c[2] * a); };
  const text3 = (str, x, y, c, a) => drawString(FONT_3x5, str, x, y, (px, py) => set(px, py, c, a * k));
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
  text3(label, x0 + 9, hy, kind.c, 0.95);
  if (right) text3(right, x0 + w - 2 - rw, hy, d.rightC || DIM, d.rightA || 0.8);
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
  // Detail line 1: left text, right text.
  const l1 = y0 + 17;
  if (d.line1) text3(d.line1, x0 + 2, l1, [0.85, 0.9, 1], 0.85);
  if (d.line1R) text3(d.line1R, x0 + w - 2 - textWidth(FONT_3x5, d.line1R), l1, d.line1RC || kind.c, 0.9);
  // Detail line 2: what will happen (scrolls when long).
  const l2 = y0 + 23, line2 = (d.line2 || '').toUpperCase(), l2w = line2 ? textWidth(FONT_3x5, line2) : 0;
  if (line2 !== ds.l2) { ds.l2 = line2; ds.s2 = 0; ds.t2 = 0; }
  if (line2) {
    let lx = x0 + 2;
    if (l2w > w - 4) { if (adv) { ds.t2 = (ds.t2 || 0) + dt; if (ds.t2 > 2) ds.s2 += dt * 11; } const loop = l2w + 16; if (ds.s2 > loop) ds.s2 -= loop; lx -= Math.floor(ds.s2); }
    const plot2 = (px, py) => { if (px < x0 + 2 || px >= x0 + w - 2) return; set(px, py, d.line2C || kind.c, (d.line2A || 0.85) * k); };
    drawString(FONT_3x5, line2, lx, l2, plot2);
    if (l2w > w - 4) drawString(FONT_3x5, line2, lx + l2w + 16, l2, plot2);
  }
  // The timeline: two rows; marked windows (the coming mix) under the fill.
  const by = H - 2, f = Math.max(0, Math.min(1, d.bar || 0)), span = w - 3, fill = Math.round(f * span);
  for (let x = 0; x <= span; x++) {
    const fx = x / span, on = x < fill, g = 0.55 + 0.45 * fx;
    let c = kind.c, a = on ? (d.barA || 0.8) : 0.08;
    for (const m of d.marks || []) if (fx >= m.from && fx <= m.to) { c = m.c; a = on ? 1 : 0.35 + 0.15 * Math.sin(ds.t * 4); }
    const cc = on && c === kind.c ? [c[0] * g, c[1] * g, c[2] * g] : c;
    set(x0 + 1 + x, by, cc, a * k); set(x0 + 1 + x, by + 1, cc, a * 0.6 * k);
  }
  for (const m of d.marks || []) { const mx = x0 + 1 + Math.round(m.from * span); set(mx, by - 1, m.c, 0.9 * k); set(mx, by - 2, m.c, 0.5 * k); } // a notch where the mix begins
  if (d.scan !== undefined) { const sx = x0 + 1 + Math.round(d.scan * span); for (let j = -2; j <= 2; j++) { set(sx + j, by, kind.c, (1 - Math.abs(j) / 3) * k); set(sx + j, by + 1, kind.c, (1 - Math.abs(j) / 3) * 0.6 * k); } }
  else if (fill > 0 && fill < span) { set(x0 + 1 + fill, by, [1, 1, 1], 0.95 * k); set(x0 + 1 + fill, by + 1, [1, 1, 1], 0.7 * k); }
}

const AMBER = [1, 0.55, 0.12];
const styleText = (n) => !n ? '' : n.style === 'cut' ? 'cut on the beat' : n.style === 'fade' ? 'crossfade' : n.style === 'short' ? '8 beat mix' : n.beats ? n.beats + ' beat blend' : 'blend';

// Draws both decks; returns the rows used (so the spectrum keeps clear of them).
function drawDjDecks(core, info, st, dt, beat = 0, where = 'wall') {
  if (!info) return 0;
  st.t += dt;
  const W = core.wallW || 0, t = st.t, mixing = !!info.mixing, u = info.mixU || 0;
  const now = info.now, next = info.next;
  const keyBpm = (x) => [x.bpm ? x.bpm + (W >= 192 || !W ? ' BPM' : '') : '', x.key || ''].filter(Boolean).join(' '); // a 64-wide deck has no room for 'BPM'
  let dNow;
  if (now) {
    const dur = now.dur || 0, pos = now.pos || 0, hasMix = now.mixAt >= 0 && dur > 0;
    const narrow = W > 0 && W < 160;
    dNow = {
      title: now.title, k: mixing ? 1 - 0.55 * sm(u) : 1, right: keyBpm(now),
      line1: dur ? mmss(pos) + (narrow ? '/' : ' / ') + mmss(dur) : '', line1R: dur ? '-' + mmss(dur - pos) : '',
      line2: mixing ? (next && next.style === 'cut' ? 'cutting over' : 'mixing into next') : hasMix ? styleText(next) + ' at ' + mmss(now.mixAt) : next && next.status === 'loading' ? 'getting the next song' : 'playing',
      line2C: mixing || hasMix ? AMBER : undefined,
      bar: dur ? pos / dur : 0,
      marks: hasMix ? [{ from: now.mixAt / dur, to: Math.min(1, (now.mixAt + Math.max(0.5, now.mixLen || 0)) / dur), c: AMBER }] : [],
    };
  } else dNow = { title: 'LOADING', k: 0.6, right: '', scan: (Math.sin(t * 3) + 1) / 2 };
  let dNext;
  if (!next) dNext = { title: '', k: 0.5, right: '', bar: 0 };
  else if (next.status === 'loading') dNext = { title: next.title, k: 0.75, textA: 0.6, right: 'LOADING' + '...'.slice(0, 1 + Math.floor(t * 2) % 3), rightA: 0.55, line2: 'fetching and analysing', scan: (Math.sin(t * 2.4) + 1) / 2 };
  else {
    const soon = info.mixIn >= 0 && info.mixIn < 60;
    const change = next.shift ? 'key ' + (next.shift > 0 ? '+' : '') + next.shift : next.tempoPct ? 'speed ' + (next.tempoPct > 0 ? '+' : '') + next.tempoPct : '';
    dNext = {
      title: next.title, k: mixing ? 0.75 + 0.25 * sm(u) : 0.8, textA: mixing ? 0.75 + 0.25 * u : 0.8,
      right: mixing ? (next.style === 'cut' ? 'CUT' : 'MIXING') : info.mixIn >= 0 ? 'IN ' + mmss(info.mixIn) : '',
      rightC: mixing || soon ? NEXT.c : undefined, rightA: mixing ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 8)) : 0.85,
      line1: keyBpm(next), line1R: change.toUpperCase(),
      line2: [styleText(next), next.why].filter(Boolean).join(' - ') || next.mode || '',
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
