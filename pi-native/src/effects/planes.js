// Planes Overhead: live aircraft near home - flight board (A), radar (B)
// and a compact board (C) - on any panel layout and on the cube.
//   Wall: each row of side-by-side panels is a region. The first shows the
//   main view (style: board, radar or auto, which shows the board and
//   switches to the radar when several planes are about); a region three
//   or more panels wide shows the board with the radar beside it. Further
//   regions show the radar (if not already shown) and then the next
//   nearest planes. A single panel gets the compact board.
//   Cube: radar on the top (the sky above), the nearest planes on the
//   front, right, back and left, and the count on the bottom.
// Options (core.effectOptions.planes): lat/lon or city, radiusKm, maxAltFt,
// style ('auto' | 'board' | 'radar').
'use strict';

const { createPlaneData } = require('./planes/data');
const { drawBoard, drawCompact, drawRadar, drawEmpty, drawDue, drawSummary, drawGlow } = require('./planes/draw');

const data = createPlaneData();
const view = { t: 0, focus: 0, focusT: 0, radarT: 0, fade: 1, lastHex: '' };
const CYCLE_S = 8;

function step(opts, dt, core) {
  // No location of its own: the weather's city.
  const w = core && core.effectOptions && core.effectOptions.weather;
  data.update(!opts.city && !(opts.lat || opts.lon) && w && w.city ? { ...opts, city: w.city } : opts);
  view.t += dt; view.focusT += dt; view.radarT += dt;
  const planes = data.planes();
  if (view.focusT >= CYCLE_S && planes.length > 1) { view.focusT = 0; view.focus = (view.focus + 1) % Math.min(planes.length, 6); view.fade = 0; }
  if (view.focus >= planes.length) view.focus = 0;
  const over = planes.findIndex((p) => p.overhead);
  if (over >= 0 && over !== view.focus) { view.focus = over; view.focusT = 0; view.fade = 0; } // right overhead: that one, now
  view.fade = Math.min(1, view.fade + dt * 2.5);
  return planes;
}
const radius = (o) => ([5, 10, 20, 40, 80].includes(Number(o.radiusKm)) ? Number(o.radiusKm) : 20);
const emptyMsg = () => { const s = data.status(); return /^No planes|^\d/.test(s) ? 'SKIES CLEAR\n' + s.replace(/^No planes /, '') : 'PLANES\n' + s; };

// Draw one region with the given look.
function region(tg, look, planes, k, opts) {
  const p = planes[k];
  const fadeTg = { ...tg, set: (x, y, r, g, b) => tg.set(x, y, r * view.fade, g * view.fade, b * view.fade) };
  if (!planes.length) { drawEmpty(tg, view.t, emptyMsg()); return; }
  if (look === 'due') { drawDue(tg, planes, view.t); return; }
  if (look === 'summary') { drawSummary(tg, data.summary(), view.t); return; }
  if (look === 'radar') drawRadar(tg, planes, view.focus, view.t, radius(opts), true);
  else if (!p) drawRadar(tg, planes, view.focus, view.t, radius(opts), false);
  else if (tg.w >= 96) drawBoard(fadeTg, p, view.t, planes.length > 1 ? (k + 1) + '/' + planes.length : '');
  else drawCompact(fadeTg, p, view.t, planes.length > 1 ? (k + 1) + '/' + planes.length : '');
}
function sub(tg0, x0, w) { return { w, h: tg0.h, set: (x, y, r, g, b) => { if (x >= 0 && x < w && y >= 0 && y < tg0.h) tg0.set(x0 + x, y, r, g, b); } }; }

function effectPlanesWall(core, dt) {
  if (!core.wallW) return;
  core.wallBuf.fill(0);
  const opts = (core.effectOptions && core.effectOptions.planes) || {};
  const planes = step(opts, dt, core), style = opts.style || 'auto', S = core.wallPanelSize || 64;
  // Regions: rows of side-by-side panels.
  const regs = [];
  if (core.wallPanels && core.wallPanels.length) {
    const rows = new Map();
    for (const p of core.wallPanels) { if (!rows.has(p.gy)) rows.set(p.gy, []); rows.get(p.gy).push(p.gx); }
    [...rows.keys()].sort((a, b) => a - b).forEach((gy) => {
      const xs = rows.get(gy).sort((a, b) => a - b); let s = xs[0], prev = xs[0];
      for (let i = 1; i <= xs.length; i++) { if (i === xs.length || xs[i] !== prev + 1) { regs.push({ x: s * S, y: gy * S, w: (prev - s + 1) * S, h: S }); s = xs[i]; } prev = xs[i]; }
    });
  } else regs.push({ x: 0, y: 0, w: core.wallW, h: Math.min(core.wallH, 64) });
  const tgFor = (r) => ({ w: r.w, h: r.h, set: (x, y, rr, g, b) => { if (x >= 0 && y >= 0 && x < r.w && y < r.h) core.setWallPixel(r.x + x, r.y + y, rr, g, b); } });
  // The main region: Auto moves between the board, the radar (several
  // planes), the planes due overhead (when there are) and, every ten
  // minutes, today's tally.
  const due = planes.some((p) => p.overhead || p.dueIn >= 0), summaryTime = (Date.now() / 1000) % 600 < 10;
  let mainLook = 'board';
  if (style === 'radar') mainLook = 'radar';
  else if (style === 'auto') {
    const looks = ['board']; if (planes.length > 1) looks.push('radar'); if (due) looks.push('due');
    mainLook = summaryTime ? 'summary' : looks[Math.floor(view.t / 10) % looks.length];
  }
  const shown = new Set(); let next = 0;
  regs.forEach((r, i) => {
    const tg = tgFor(r);
    if (i === 0) {
      if (r.w >= 3 * S && planes.length) { // board with the radar beside it
        const rw = Math.min(r.w - 2 * S, 2 * S);
        region(sub(tg, 0, r.w - rw), mainLook === 'radar' ? 'board' : mainLook, planes, view.focus, opts); drawRadar(sub(tg, r.w - rw, rw), planes, view.focus, view.t, radius(opts), rw >= 108);
        shown.add('radar'); shown.add(mainLook);
      } else { region(tg, r.w < 2 * S && mainLook === 'radar' ? 'board' : mainLook, planes, view.focus, opts); shown.add(mainLook); }
      next = view.focus + 1;
    } else if (!shown.has('radar') && planes.length > 1) { region(tg, 'radar', planes, 0, opts); shown.add('radar'); }
    else if (!shown.has('due') && due) { region(tg, 'due', planes, 0, opts); shown.add('due'); }
    else if (!shown.has('summary') && i === regs.length - 1 && regs.length >= 3) { region(tg, 'summary', planes, 0, opts); shown.add('summary'); }
    else { region(tg, 'board', planes, planes.length ? next % Math.max(1, planes.length) : 0, opts); next++; }
    if (planes.some((p) => p.overhead)) drawGlow(tg, view.t); // one right overhead: every panel glows
  });
}

// The cube: radar on the top, the nearest planes around the sides, the count underneath.
function effectPlanes(core, dt) {
  const opts = (core.effectOptions && core.effectOptions.planes) || {};
  const planes = step(opts, dt, core), SZ = core.SIZE || 64;
  core.colBuf.fill(0);
  const face = (f) => ({ w: SZ, h: SZ, set: (x, y, r, g, b) => { if (x >= 0 && y >= 0 && x < SZ && y < SZ) core.setFaceLED(f, x, SZ - 1 - y, r, g, b); } });
  if (core.panelMode === '2d') { region(face(0), 'board', planes, view.focus, opts); return; }
  const n = Math.max(1, planes.length);
  drawRadar(face(4), planes, view.focus, view.t, radius(opts), false);
  [0, 2, 1, 3].forEach((f, i) => region(face(f), 'board', planes, planes.length ? (view.focus + i) % n : 0, opts));
  // Underneath: the planes due overhead, or today's tally.
  const b = face(5);
  if (planes.some((p) => p.overhead || p.dueIn >= 0)) drawDue(b, planes, view.t);
  else if (planes.length) drawSummary(b, data.summary(), view.t);
  else drawEmpty(b, view.t, emptyMsg());
  if (planes.some((p) => p.overhead)) for (const f of [0, 1, 2, 3, 4, 5]) drawGlow(face(f), view.t);
}
effectPlanes.wall = effectPlanesWall;
effectPlanes.getStatus = () => data.status();
effectPlanesWall.getStatus = effectPlanes.getStatus;
effectPlanes._data = data;

module.exports = effectPlanes;
