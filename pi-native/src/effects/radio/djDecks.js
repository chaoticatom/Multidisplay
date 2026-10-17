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

const { FONT_3x5, FONT_5x7, drawString, drawStringSmooth, textWidth } = require('../text');

const ROWS = 36; // up to 60% of a 64-row panel
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
    tx = x0 + 2 - ds.s; // fractional: drawn smooth
  }
  const plotT = (x, y, a = 1) => {
    const yy = y + slide; if (yy < clipTop || yy > clipBot || x < x0 + 2 || x >= x0 + 2 + area) return;
    const edge = tw > area ? sm(Math.min(x - (x0 + 2), x0 + 1 + area - x) / 4) : 1; // soft ends while scrolling
    set(x, yy, d.textC || kind.text, (d.textA || 1) * edge * k * a);
  };
  plotT.alpha = true;
  if (title) {
    drawStringSmooth(FONT_5x7, title, tx, ty, plotT);
    if (tw > area) drawStringSmooth(FONT_5x7, title, tx + tw + 24, ty, plotT);
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
    if (l2w > w - 4) { if (adv) { ds.t2 = (ds.t2 || 0) + dt; if (ds.t2 > 2) ds.s2 += dt * 11; } const loop = l2w + 16; if (ds.s2 > loop) ds.s2 -= loop; lx -= ds.s2; }
    const plot2 = (px, py, a = 1) => { if (px < x0 + 2 || px >= x0 + w - 2) return; set(px, py, d.line2C || kind.c, (d.line2A || 0.85) * k * a); };
    plot2.alpha = true;
    drawStringSmooth(FONT_3x5, line2, lx, l2, plot2);
    if (l2w > w - 4) drawStringSmooth(FONT_3x5, line2, lx + l2w + 16, l2, plot2);
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

// ── The mixer strip (a strip two or more panels wide) ────────────────────
// Both titles on top (playing in cyan, next in amber); each song's LO / MID
// / HI bars - its level in each band times the mix's EQ on it - with a
// crossfader between whose knob travels from A to B over the mix; five
// stage dots (cued, blending in, bass swap, fading out, done); and one line
// in plain words of what's happening and what's next. Four panels or wider
// also get a timeline: the playing song, the next one under it, the mix
// where they overlap, and a playhead.
const STAGES = ['CUED', 'IN', 'SWAP', 'OUT', 'DONE'];
function bandLevel(spec, f0, f1) {
  if (!spec || !spec.length) return 0;
  const a = Math.floor(f0 * spec.length), b = Math.max(a + 1, Math.floor(f1 * spec.length));
  let s = 0; for (let i = a; i < b; i++) s += spec[i]; return Math.min(1, (s / (b - a)) * 1.25);
}
function scrollText(tg, font, str, x0, w, y, c, a, ds, key, dt, adv) {
  const tw = str ? textWidth(font, str) : 0;
  if (ds[key + 'S'] !== str) { ds[key + 'S'] = str; ds[key + 'X'] = 0; ds[key + 'T'] = 0; }
  let x = x0 + (font === FONT_5x7 ? 0 : 0);
  if (tw > w) { if (adv) { ds[key + 'T'] += dt; if (ds[key + 'T'] > 2) ds[key + 'X'] += dt * 12; } const loop = tw + 20; if (ds[key + 'X'] > loop) ds[key + 'X'] -= loop; x -= ds[key + 'X']; }
  const moving = tw > w && ds[key + 'X'] > 0.5; // soft ends only while it's actually scrolling
  const plot = (px, py, s = 1) => { if (px < x0 || px >= x0 + w) return; const edge = (moving ? sm((Math.min(px - x0, x0 + w - 1 - px) + 1) / 2) : 1) * s; tg.set(px, py, c[0] * a * edge, c[1] * a * edge, c[2] * a * edge); };
  plot.alpha = true;
  drawStringSmooth(font, str, x, y, plot); if (tw > w) drawStringSmooth(font, str, x + tw + 20, y, plot);
}
function drawMixer(tg, x0, w, y0, m, ms, dt, beat, adv) {
  const set = (x, y, c, a) => { if (x >= x0 && x < x0 + w && a > 0.003) tg.set(x, y, c[0] * a, c[1] * a, c[2] * a); };
  const H = y0 + ROWS;
  for (let y = y0 + 1; y < H; y++) for (let x = x0; x < x0 + w; x++) { const g = (x - x0) / w; set(x, y, [NOW.c[0] * (1 - g) + AMBER[0] * g, NOW.c[1] * (1 - g) + AMBER[1] * g, NOW.c[2] * (1 - g) + AMBER[2] * g], 0.022); }
  for (let x = x0; x < x0 + w; x++) { const g = (x - x0) / w, e = sm(Math.min(x - x0, x0 + w - 1 - x) / (w * 0.15)); set(x, y0, [NOW.c[0] * (1 - g) + AMBER[0] * g, NOW.c[1] * (1 - g) + AMBER[1] * g, NOW.c[2] * (1 - g) + AMBER[2] * g], 0.55 * e); }
  // Titles.
  const half = Math.floor(w / 2);
  scrollText(tg, FONT_5x7, (m.nowTitle || '').toUpperCase(), x0 + 1, half - 4, y0 + 2, [0.45, 0.88, 1], m.kA, ms, 'a', dt, adv);
  scrollText(tg, FONT_5x7, (m.nextTitle || '').toUpperCase(), x0 + half + 3, w - half - 4, y0 + 2, [1, 0.7, 0.3], m.kB, ms, 'b', dt, adv);
  // EQ bars: 3 a side, 6 wide, 10 tall.
  const barTop = y0 + 10, barH = 11, eqW = 22;
  const bars = (bx, col, lv, k) => lv.forEach((v, i) => { const x = bx + i * 8, h = Math.round(Math.max(0, Math.min(1, v)) * barH); for (let yy = 0; yy < barH; yy++) for (let dx = 0; dx < 6; dx++) set(x + dx, barTop + barH - 1 - yy, col, yy < h ? 0.95 * k : 0.07); });
  bars(x0 + 2, NOW.c, m.eqA, 1); bars(x0 + w - 2 - eqW, AMBER, m.eqB, 1);
  // Middle: crossfader (and the timeline on a wide strip).
  const mx0 = x0 + 2 + eqW + 6, mx1 = x0 + w - 2 - eqW - 7, mw = mx1 - mx0;
  const wide = w >= 256, fy = wide ? barTop + 2 : barTop + 4;
  drawString(FONT_3x5, 'A', mx0 - 5, fy - 2, (px, py) => set(px, py, NOW.c, 0.9));
  drawString(FONT_3x5, 'B', mx1 + 2, fy - 2, (px, py) => set(px, py, AMBER, 0.9));
  for (let x = mx0; x <= mx1; x++) set(x, fy, DIM, 0.35);
  if (adv) ms.knob = (ms.knob === undefined ? m.fader : ms.knob) + (m.fader - (ms.knob === undefined ? m.fader : ms.knob)) * Math.min(1, dt * (m.fader < (ms.knob || 0) ? 3 : 8));
  const kx = mx0 + Math.round((ms.knob || 0) * mw);
  for (let y = fy - 3; y <= fy + 3; y++) for (let dx = -2; dx <= 2; dx++) set(kx + dx, y, [1, 1, 1], dx === 0 ? 1 : 0.6 + 0.2 * beat);
  if (wide && m.tl) {
    // Timeline: A's remaining song, B under it, the overlap is the mix.
    const ty = fy + 5, t = m.tl, span = Math.max(1, t.end - t.start), X = (s) => mx0 + Math.round(((s - t.start) / span) * mw);
    const aEnd = X(t.aEnd), bStart = X(t.bStart), ph = X(t.pos);
    for (let x = mx0; x <= mx1; x++) {
      if (x <= aEnd) { set(x, ty, NOW.c, x <= ph ? 0.85 : 0.35); set(x, ty + 1, NOW.c, x <= ph ? 0.6 : 0.25); }
      if (x >= bStart) { set(x, ty + 3, AMBER, x <= ph ? 0.85 : 0.35); set(x, ty + 4, AMBER, x <= ph ? 0.6 : 0.25); }
      if (x >= bStart && x <= aEnd) set(x, ty + 2, [1, 1, 1], 0.18);
    }
    for (const s of t.marks) { const x = X(s); for (let y = ty - 1; y <= ty + 5; y += 2) set(x, y, AMBER, 0.75); }
    for (let y = ty - 2; y <= ty + 6; y++) set(ph, y, [1, 1, 1], 1);
  }
  // Stage dots.
  const sy = y0 + 23, sx0 = x0 + 4, sx1 = x0 + w - 5, sxs = STAGES.map((_, i) => sx0 + Math.round((i / 4) * (sx1 - sx0)));
  const fillTo = sx0 + Math.round(Math.min(1, m.stagePos / 4) * (sx1 - sx0));
  for (let x = sx0; x <= sx1; x++) set(x, sy, x <= fillTo ? AMBER : DIM, x <= fillTo ? 0.85 : 0.22);
  sxs.forEach((x, i) => {
    const done = i < Math.floor(m.stagePos), cur = i === Math.floor(m.stagePos) && m.stageOn, r = cur ? 1 : 1;
    const a = cur ? 0.7 + 0.3 * Math.sin(ms.t * 6) : done ? 0.85 : 0.3;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) set(x + dx, sy + dy, done || cur ? AMBER : DIM, a);
    if (w >= 120) { const lw = textWidth(FONT_3x5, STAGES[i]); drawString(FONT_3x5, STAGES[i], Math.max(x0, Math.min(x0 + w - lw, x - Math.floor(lw / 2))), sy + 2, (px, py) => set(px, py, done || cur ? AMBER : DIM, cur ? 0.95 : 0.5)); }
  });
  if (adv) ms.t = (ms.t || 0) + dt;
  // The line in plain words, with the countdown fixed at its right end.
  const cnt = (m.count || '').toUpperCase(), cw = cnt ? textWidth(FONT_3x5, cnt) : 0;
  if (cnt) drawString(FONT_3x5, cnt, x0 + w - 2 - cw, y0 + 31, (px, py) => set(px, py, AMBER, 1));
  scrollText(tg, FONT_3x5, (m.line || '').toUpperCase(), x0 + 2, w - 4 - (cw ? cw + 6 : 0), y0 + 31, m.lineC || [0.9, 0.93, 1], 0.9, ms, 'l', dt, adv);
}
const FX_NAMES = { echo: 'echo out', filter: 'filter sweep', brake: 'brake stop', roll: 'loop roll' };
const OTHER_NAMES = { underfade: 'fade-out change', segue: 'segue', mashup: 'mashup' };
const styleText = (n) => !n ? '' : FX_NAMES[n.style] || OTHER_NAMES[n.style] || (n.style === 'cut' ? 'cut on the beat' : n.style === 'fade' ? 'crossfade' : n.style === 'short' ? '8 beat mix' : n.beats ? n.beats + ' beat blend' : 'blend');

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
  } else dNow = { title: 'LOADING', k: 0.7, right: '', line1: 'first song', line2: info.error ? info.error : next && next.step ? next.step : 'finding songs', line2C: info.error ? [1, 0.35, 0.35] : undefined, scan: (Math.sin(t * 3) + 1) / 2 };
  let dNext;
  if (!next) dNext = { title: '', k: 0.5, right: '', bar: 0 };
  else if (next.status === 'loading') dNext = { title: next.title, k: 0.75, textA: 0.6, right: 'LOADING' + '...'.slice(0, 1 + Math.floor(t * 2) % 3), rightA: 0.55, line2: next.step || 'fetching and analysing', scan: (Math.sin(t * 2.4) + 1) / 2 };
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
  // The mixer strip's data.
  const eq = info.eq || [1, 1, 1, 0, 0, 0], sA = info.specA, sB = info.specB;
  const lvA = [bandLevel(sA, 0, 0.22), bandLevel(sA, 0.22, 0.62), bandLevel(sA, 0.62, 1)], lvB = [bandLevel(sB, 0, 0.22), bandLevel(sB, 0.22, 0.62), bandLevel(sB, 0.62, 1)];
  const ready = next && next.status !== 'loading';
  const sw = info.mixSwap >= 0 ? info.mixSwap : 0.5, mixSecs = info.mixLen || 0;
  let stagePos = 0, stageOn = !!ready, line = '', lineC;
  const justDone = info.doneAt && Date.now() - info.doneAt < 4000;
  if (!now) { line = info.error ? info.error : next && next.step ? 'getting ready - ' + next.step : 'finding songs'; lineC = info.error ? [1, 0.4, 0.4] : undefined; stageOn = false; }
  else if (mixing && next && next.style === 'cut') { stagePos = 2; line = 'cut on the beat'; lineC = AMBER; }
  else if (mixing && next && FX_NAMES[next.style]) {
    // Effect transitions: the old song goes out on the effect, then the drop.
    if (u < sw) { stagePos = 1 + u / sw * 0.99; line = FX_NAMES[next.style] + ' - drop in ' + mmss((sw - u) * mixSecs); }
    else { stagePos = 3 + Math.min(0.99, (u - sw) / Math.max(0.01, 1 - sw)); line = 'drop - ' + (next.title || ''); }
    lineC = AMBER;
  }
  else if (mixing) {
    if (u < sw - 0.04) { stagePos = 1 + u / sw * 0.99; line = 'blending in - bass swap in ' + mmss((sw - u) * mixSecs); }
    else if (u < sw + 0.06) { stagePos = 2; line = 'bass swap now'; }
    else { stagePos = 3 + (u - sw) / (1 - sw) * 0.99; line = 'fading out the old song - ' + mmss((1 - u) * mixSecs) + ' left'; }
    lineC = AMBER;
  } else if (justDone) { stagePos = 4; line = 'now playing ' + (now.title || ''); }
  else if (info.tease) { stagePos = 0; line = 'a hint of the next song...'; lineC = AMBER; }
  else if (ready && info.mixIn >= 0 && info.mixIn <= 30) { stagePos = 0; line = 'cued - matching tempo and beat - ' + styleText(next); lineC = AMBER; }
  else if (ready) { stagePos = 0; stageOn = false; line = 'next: ' + [styleText(next), next.shift ? 'key ' + (next.shift > 0 ? '+' : '') + next.shift : '', next.why || ''].filter(Boolean).join(' - '); }
  else if (next) { line = 'next: getting ' + (next.title || '') + (next.step ? ' - ' + next.step : ''); stageOn = false; }
  else line = 'playing ' + ((now && now.title) || '');
  // Always a countdown: to the mix, through it, or to the song's end.
  const count = !now ? '' : mixing ? mmss((1 - u) * mixSecs) : next && next.status === 'loading' ? 'loading' : info.mixIn >= 0 ? mmss(info.mixIn) : now.dur ? 'ends ' + mmss(now.dur - now.pos) : '';
  const fader = mixing ? (next && next.style === 'cut' ? 1 : u) : 0;
  let tl = null;
  if (now && now.dur && now.mixAt >= 0) {
    const mixEnd = now.mixAt + (now.mixLen || 0), start = Math.max(0, Math.min(now.pos, now.mixAt) - 30), end = mixEnd + 20;
    tl = { start, end, pos: now.pos, aEnd: Math.min(now.dur, mixEnd), bStart: now.mixAt, marks: [now.mixAt, now.mixAt + (now.mixLen || 0) * (info.mixSwap >= 0 ? info.mixSwap : 0.5), mixEnd] };
  }
  const mixerData = { nowTitle: now ? now.title : 'loading', nextTitle: next ? next.title : '', kA: mixing ? 1 - 0.4 * sm(u) : 1, kB: ready ? (mixing ? 0.75 + 0.25 * u : 0.8) : 0.45,
    eqA: lvA.map((v, i) => v * eq[i]), eqB: lvB.map((v, i) => v * (mixing ? eq[3 + i] : info.tease ? [0, 0.6, 0.8][i] : 0.35)), fader, stagePos, stageOn, line, lineC, tl, count };
  if (!st.mixer) st.mixer = {};
  let mixerDrawn = false;
  const mixer = (tg, x0, w, y0) => { drawMixer(tg, x0, w, y0, mixerData, st.mixer, dt, beat, !mixerDrawn); mixerDrawn = true; };
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
    if (r0.w >= 96) { // a strip two panels or more wide: the mixer
      mixer(tg, r0.x0, r0.w, r0.y0);
    } else if (runs.length > 1) { // single panels apart (a stack, an L, ...): NOW on the lowest, NEXT on the next
      const r1 = span(runs[1]);
      deck(tg, r0.x0, r0.w, r0.y0, 0); deck(tg, r1.x0, r1.w, r1.y0, 1);
    } else deck(tg, r0.x0, r0.w, r0.y0, turn);
    // Any further strips repeat the decks, so every side of the wall shows them.
    for (let i = 1; i < runs.length; i++) {
      if (i === 1 && r0.w < 96) continue;
      const r = span(runs[i]);
      if (r.w >= 96) mixer(tg, r.x0, r.w, r.y0);
      else deck(tg, r.x0, r.w, r.y0, i % 2);
    }
  } else if (where === 'wall' && core.wallW) {
    const W = core.wallW, H = core.wallH, tg = { set: (x, y, r, g, b) => core.setWallPixel(x, y, r, g, b) };
    if (W >= 96) mixer(tg, 0, W, H - ROWS);
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
