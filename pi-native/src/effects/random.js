// Ported verbatim (math unchanged) from effects-games.js's "RANDOM CHAOS"
// block: rndGenParams()/rndEval()/rndRender()/effectRandom() - the "Random 1"
// button. Fully self-contained generative visuals that never call into any
// other effect function by name (unlike what the task brief guessed) - it
// just picks a random one of 10 procedural "modes" (plasma/radial/sweep/...)
// on each new segment and cross-fades between the outgoing and incoming
// segment's params over 1.2s. Loops all 6 faces via faceMap every tick
// regardless of core.panelMode - in '2d' mode faceMap[1..5] are all -1 so
// those faces are simply skipped by the idx>=0 guard, same as every other
// ported effect that iterates faceMap unconditionally (see maze.js).
const { hsl } = require('../core');

let rndT = 0, rndSegT = 0, rndSegDur = 4;
let rndA = {}, rndB = {}, rndBlend = 0;

function rndGenParams() {
  const modes = ['plasma', 'radial', 'sweep', 'blobs', 'spiral', 'grid', 'lightning', 'interference', 'shatter', 'kaleid'];
  const palette = Math.random();
  return {
    mode: modes[Math.floor(Math.random() * modes.length)],
    speed: 0.4 + Math.random() * 3.5,
    freq1: 0.15 + Math.random() * 0.6,
    freq2: 0.1 + Math.random() * 0.5,
    phase: Math.random() * Math.PI * 2,
    hueBase: Math.random(),
    hueRange: 0.15 + Math.random() * 0.7,
    sat: 0.6 + Math.random() * 0.4,
    bright: 0.5 + Math.random() * 0.5,
    invert: Math.random() > 0.5,
    nBlobs: 3 + Math.floor(Math.random() * 6),
    nBars: 2 + Math.floor(Math.random() * 8),
    palette,
    twist: (Math.random() - 0.5) * 4,
    decay: 0.7 + Math.random() * 0.25,
    seed: Math.random() * 999,
  };
}

function rndNewSeg() {
  rndA = rndB;
  rndB = rndGenParams();
  rndBlend = 0;
  rndSegDur = 3 + Math.random() * 9;
  rndSegT = 0;
}

function rndEval(p, SIZE, u, v, t2) {
  const cx = u / SIZE - 0.5, cy = v / SIZE - 0.5;
  const rad = Math.sqrt(cx * cx + cy * cy);
  const ang = Math.atan2(cy, cx);

  if (p.mode === 'plasma') {
    const s1 = Math.sin(cx * p.freq1 * 20 + t2 * p.speed + p.phase);
    const s2 = Math.sin(cy * p.freq2 * 20 + t2 * p.speed * 0.7);
    const s3 = Math.sin((cx + cy) * p.freq1 * 15 + t2 * p.speed * 1.3 + p.seed);
    const s4 = Math.sin(rad * p.freq2 * 25 - t2 * p.speed * 0.9);
    return (s1 + s2 + s3 + s4) * 0.25 + 0.5;
  } else if (p.mode === 'radial') {
    const rings = Math.sin(rad * p.freq1 * 40 - t2 * p.speed * 2 + p.phase);
    const spokes = Math.sin(ang * Math.ceil(p.nBars) + t2 * p.speed + p.seed);
    return (rings * 0.5 + spokes * 0.5) * 0.5 + 0.5;
  } else if (p.mode === 'sweep') {
    const bar = ((cx * Math.cos(t2 * p.twist) + cy * Math.sin(t2 * p.twist) + t2 * p.speed * 0.5 + 5) % 1);
    return Math.pow(Math.abs(Math.sin(bar * Math.PI * p.nBars)), 1.5);
  } else if (p.mode === 'blobs') {
    let val = 0;
    for (let b = 0; b < p.nBlobs; b++) {
      const bx = Math.sin(t2 * p.speed * (0.3 + b * 0.17) + b * 2.1 + p.phase) * 0.4;
      const by = Math.cos(t2 * p.speed * (0.25 + b * 0.13) + b * 1.7 + p.seed) * 0.4;
      const d = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
      val += Math.max(0, 1 - d / 0.25);
    }
    return Math.min(1, val);
  } else if (p.mode === 'spiral') {
    const spiralV = ((ang / (Math.PI * 2) + rad * p.freq1 * 8 + t2 * p.speed + 5) % 1);
    return Math.pow(Math.abs(Math.sin(spiralV * Math.PI * 3)), 0.8);
  } else if (p.mode === 'grid') {
    const gx = Math.abs(Math.sin(cx * p.freq1 * 30 + t2 * p.speed * 0.5));
    const gy = Math.abs(Math.sin(cy * p.freq2 * 30 + t2 * p.speed * 0.5 + p.phase));
    return Math.max(gx, gy) > 0.85 ? 1 : 0;
  } else if (p.mode === 'lightning') {
    let val = 0;
    for (let b = 0; b < 4; b++) {
      const lx = cx - Math.sin(t2 * p.speed * 0.4 + b * 1.5 + p.seed) * 0.3;
      const d = Math.abs(lx) + Math.abs(cy * 0.1) * b * 0.3;
      val += Math.max(0, 1 - d * p.freq1 * 20) * Math.pow(Math.random(), 0.1);
    }
    return Math.min(1, val * 0.6);
  } else if (p.mode === 'interference') {
    const w1 = Math.sin(cx * p.freq1 * 25 + t2 * p.speed + p.phase);
    const w2 = Math.sin(cy * p.freq2 * 25 - t2 * p.speed * 1.1 + p.seed);
    const w3 = Math.sin(rad * p.freq1 * 30 - t2 * p.speed * 0.8);
    return (w1 * w2 + w3) * 0.5 + 0.5;
  } else if (p.mode === 'shatter') {
    const cell = Math.floor(cx * p.nBlobs * 2 + p.seed) ^ Math.floor(cy * p.nBlobs * 2);
    const phase2 = (cell * 0.618 + t2 * p.speed * 0.3) % 1;
    return Math.abs(Math.sin(phase2 * Math.PI + p.phase));
  } else { // kaleid
    const sym = Math.ceil(p.nBars * 0.5 + 2);
    const a2 = ((ang / (Math.PI / sym)) % 2);
    const a3 = a2 > 1 ? 2 - a2 : a2;
    const k = Math.sin(a3 * Math.PI * p.freq1 * 5 + rad * p.freq2 * 20 - t2 * p.speed + p.phase);
    return k * 0.5 + 0.5;
  }
}

function rndRender(core, p, tOff, bright) {
  const { SIZE, faceMap, colBuf } = core;
  for (let face = 0; face < 6; face++) {
    const faceHueShift = face * 0.07;
    for (let v = 0; v < SIZE; v++) for (let u = 0; u < SIZE; u++) {
      const idx = faceMap[face][v * SIZE + u];
      if (idx < 0) continue;
      const val = rndEval(p, SIZE, u, v, tOff);
      const inv = p.invert ? 1 - val : val;
      const h = (p.hueBase + faceHueShift + inv * p.hueRange) % 1;
      const l = inv * p.bright * bright;
      if (l < 0.02) continue;
      const [r, g, b] = hsl(h, p.sat, l);
      const b3 = idx * 3;
      if (r > colBuf[b3]) colBuf[b3] = r;
      if (g > colBuf[b3 + 1]) colBuf[b3 + 1] = g;
      if (b > colBuf[b3 + 2]) colBuf[b3 + 2] = b;
    }
  }
}

function effectRandom(core, dt) {
  const { N, colBuf } = core;
  core.t += dt;
  rndT += dt;
  rndSegT += dt;
  if (rndSegT >= rndSegDur || !rndB.mode) rndNewSeg();
  rndBlend = Math.min(1, rndSegT / 1.2); // 1.2s crossfade

  for (let i = 0; i < N * 3; i++) colBuf[i] = 0;

  if (rndA.mode) rndRender(core, rndA, rndT, 1 - rndBlend);
  if (rndB.mode) rndRender(core, rndB, rndT, rndBlend > 0 ? rndBlend : 1);
}

module.exports = effectRandom;
