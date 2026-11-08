// Rubik's Cube: each panel is one face of a 3x3 Rubik's cube that scrambles
// itself, then solves (the moves played back in reverse), over and over. The
// cube is modelled properly - 54 stickers with 3D positions and normals, each
// turn rotating one layer a quarter turn - so stickers move between the faces
// as a real cube's do. A turning layer swings smoothly into place. On a wall,
// each panel shows one face (Front, Right, Back, Left, Top, Bottom in turn).
'use strict';

const COLS = { '1,0,0': [1, 0.35, 0.05], '-1,0,0': [0.85, 0.05, 0.08], '0,1,0': [0.95, 0.95, 0.95], '0,-1,0': [1, 0.85, 0.05], '0,0,1': [0.05, 0.75, 0.25], '0,0,-1': [0.1, 0.3, 0.95] };
const SCRAMBLE = 22, TURN_S = 0.32, PAUSE_S = 2.5;
const st = { stickers: null, moves: [], seq: [], step: 0, phase: 'pause', tPhase: 0, cur: null, ang: 0 };

function reset() {
  st.stickers = [];
  for (const [key, col] of Object.entries(COLS)) {
    const n = key.split(',').map(Number), a = n.findIndex((v) => v !== 0);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const p = [0, 0, 0], others = [0, 1, 2].filter((k) => k !== a);
      p[a] = n[a]; p[others[0]] = i; p[others[1]] = j;
      st.stickers.push({ p, n: n.slice(), col });
    }
  }
  index();
}
// A quarter turn of the layer at coordinate `layer` (-1, 0, 1) on `axis`, by dir (+1/-1).
const rot = (v, axis, dir) => {
  const [x, y, z] = v;
  if (axis === 0) return [x, -dir * z, dir * y];
  if (axis === 1) return [dir * z, y, -dir * x];
  return [-dir * y, dir * x, z];
};
function apply(m) { for (const s of st.stickers) if (s.p[m.axis] === m.layer) { s.p = rot(s.p, m.axis, m.dir); s.n = rot(s.n, m.axis, m.dir); } index(); }
// Stickers by face (axis*2 + side) and cell, for the per-pixel lookup.
function index() {
  st.map = new Map();
  for (const s of st.stickers) { const ax = s.n.findIndex((v) => v !== 0), o = [0, 1, 2].filter((k) => k !== ax); st.map.set(ax * 2 + (s.n[ax] > 0 ? 1 : 0) + ',' + s.p[o[0]] + ',' + s.p[o[1]], s); }
}
function newScramble() {
  st.seq = []; let last = -1;
  for (let i = 0; i < SCRAMBLE; i++) {
    let axis; do axis = Math.floor(Math.random() * 3); while (axis === last);
    last = axis; st.seq.push({ axis, layer: [-1, 1][Math.floor(Math.random() * 2)], dir: Math.random() < 0.5 ? 1 : -1 });
  }
  // ...then undo it, move by move: the solve.
  st.moves = st.seq.concat(st.seq.slice().reverse().map((m) => ({ ...m, dir: -m.dir })));
  st.step = 0;
}

function update(dt) {
  if (!st.stickers) { reset(); newScramble(); }
  st.tPhase += dt;
  if (st.phase === 'pause') { if (st.tPhase > PAUSE_S) { st.phase = 'turn'; st.tPhase = 0; st.cur = st.moves[st.step]; } return; }
  st.ang = Math.min(1, st.tPhase / TURN_S);
  if (st.tPhase >= TURN_S) {
    apply(st.cur); st.step++; st.tPhase = 0; st.ang = 0;
    if (st.step >= st.moves.length) { st.phase = 'pause'; st.cur = null; newScramble(); return; }
    // A short rest when the scramble's done, before the solve starts.
    if (st.step === SCRAMBLE) { st.phase = 'pause'; st.tPhase = PAUSE_S * 0.4; st.cur = null; return; }
    st.cur = st.moves[st.step];
  }
}

// The colour at a point on face `normal` (a unit axis vector) at (a, b) in -1.5..1.5
// across the face's other two axes: which sticker is there, with a dark gap between.
const tmp = [0, 0, 0], q2 = [0, 0, 0], qn2 = [0, 0, 0], OUT = [0, 0, 0], GAP = [0.02, 0.02, 0.025];
const OTH = [[1, 2], [0, 2], [0, 1]];
function colourAt(normal, ax, a, b) {
  const others = OTH[ax];
  // The turning layer swings: look the point up where it was before the turn started.
  tmp[ax] = normal[ax] * 1.5; tmp[others[0]] = a; tmp[others[1]] = b;
  let q = tmp, qn = normal;
  if (st.cur && st.ang > 0) {
    const m = st.cur, inLayer = Math.abs(tmp[m.axis] - m.layer) < 0.5 || (m.axis === ax && Math.sign(tmp[ax]) === m.layer);
    if (inLayer) {
      const th = -st.ang * m.dir * Math.PI / 2, c = Math.cos(th), s = Math.sin(th), [x, y, z] = tmp;
      const turn = (v, o) => { const [a0, a1, a2] = v; if (m.axis === 0) { o[0] = a0; o[1] = c * a1 - s * a2; o[2] = s * a1 + c * a2; } else if (m.axis === 1) { o[0] = c * a0 + s * a2; o[1] = a1; o[2] = -s * a0 + c * a2; } else { o[0] = c * a0 - s * a1; o[1] = s * a0 + c * a1; o[2] = a2; } return o; };
      q = turn(tmp, q2); qn = turn(normal, qn2);
    }
  }
  // The sticker there: by the face its (turned) normal points to and the cell.
  const nax = Math.abs(qn[0]) >= Math.abs(qn[1]) ? (Math.abs(qn[0]) >= Math.abs(qn[2]) ? 0 : 2) : Math.abs(qn[1]) >= Math.abs(qn[2]) ? 1 : 2, oth = OTH[nax];
  const ci = Math.max(-1, Math.min(1, Math.round(q[oth[0]]))), cj = Math.max(-1, Math.min(1, Math.round(q[oth[1]])));
  const best = st.map.get(nax * 2 + (qn[nax] > 0 ? 1 : 0) + ',' + ci + ',' + cj);
  // The black gap round each sticker.
  const fa = Math.abs(a + 1.5) % 1, fb = Math.abs(b + 1.5) % 1, gap = fa < 0.07 || fa > 0.93 || fb < 0.07 || fb > 0.93;
  if (!best || gap) return GAP;
  const shade = 0.8 + 0.2 * (1 - Math.max(Math.abs(fa - 0.5), Math.abs(fb - 0.5)) * 2);
  OUT[0] = best.col[0] * shade; OUT[1] = best.col[1] * shade; OUT[2] = best.col[2] * shade;
  return OUT;
}

// Cube: every LED's surface position tells us its face and where on it.
function rubiks(core, dt) {
  core.t += dt; update(dt);
  // Each LED's face and position on it, worked out once.
  if (!core._rubik || core._rubik.n !== core.N) {
    const N = core.N, X = core.surfX, Y = core.surfY, Z = core.surfZ, g = [];
    for (let i = 0; i < N; i++) {
      const p = [X[i] * 2 - 1, Y[i] * 2 - 1, Z[i] * 2 - 1], ax = Math.abs(p[0]) >= Math.abs(p[1]) ? (Math.abs(p[0]) >= Math.abs(p[2]) ? 0 : 2) : Math.abs(p[1]) >= Math.abs(p[2]) ? 1 : 2;
      const normal = [0, 0, 0]; normal[ax] = Math.sign(p[ax]) || 1;
      g.push({ i, ax, normal, a: p[OTH[ax][0]] * 1.5, b: p[OTH[ax][1]] * 1.5 });
    }
    core._rubik = { n: N, g };
  }
  for (const L of core._rubik.g) { const c = colourAt(L.normal, L.ax, L.a, L.b); core.setLED(L.i, c[0], c[1], c[2]); }
}
// Wall: each panel one face, in turn.
const WALL_FACES = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
rubiks.wall = function rubiksWall(core, dt) {
  core.t += dt; update(dt);
  if (!core.wallW) return;
  const S = core.wallPanelSize;
  core.wallPanels.forEach((pnl, k) => {
    const normal = WALL_FACES[k % 6], ax = normal.findIndex((v) => v !== 0), others = OTH[ax];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = ((x + 0.5) / S * 2 - 1) * 1.5, b = (1 - (y + 0.5) / S * 2) * 1.5;
      const c = colourAt(normal, ax, others[0] === 1 ? b : a, others[0] === 1 ? a : b);
      core.setWallPixel(pnl.gx * S + x, pnl.gy * S + y, c[0], c[1], c[2]);
    }
  });
};
rubiks.getStatus = () => ({ step: st.step, of: st.moves.length, solving: st.step >= SCRAMBLE });
module.exports = rubiks;
