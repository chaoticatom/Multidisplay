// Fireworks: a full show. Rockets climb on sparking tails and burst into
// one of eight shells (peony, chrysanthemum, golden willow, ring, heart,
// palm, crossette, crackle), plus star shapes and text spelled in sparks.
// Each burst lights the sky, the drifting smoke and the backdrop (water
// with reflections, a city skyline or open sky); stars fade through warm
// colours as they die. Same on every cube side face; fills a flat panel.
//
// Options (effectOptions.fireworks):
//   mode      'random' | 'sync' (salvos of matching shells) | 'mic' (launch on the beat)
//   quantity  1-10 launch rate
//   style     'mixed' | 'classic' | 'willow' | 'shapes' | 'crackle'
//   palette   'rainbow' | 'gold' | 'rwb' | 'neon'
//   backdrop  'water' | 'city' | 'sky' | 'none'
//   size      1-3 burst size
//   finale    'off' | '2' (every 2 minutes) | 'beat' (on a big beat)
//   smoke     true/false
//   textOn, text  spell the text in sparks now and then
'use strict';
const { defineCanvasEffect } = require('./canvas');
const { hsl } = require('../core');
const { FONT_5x7 } = require('./text');

const PAL = {
  rainbow: () => hsl(Math.random(), 1, 0.6),
  gold: () => (Math.random() < 0.6 ? [1, 0.75, 0.3] : [0.9, 0.92, 1]),
  rwb: () => [[1, 0.15, 0.2], [1, 1, 1], [0.25, 0.4, 1]][Math.floor(Math.random() * 3)],
  neon: () => [[1, 0.1, 0.8], [0.1, 1, 0.9], [0.6, 1, 0.1], [1, 0.9, 0.1]][Math.floor(Math.random() * 4)],
};
const STYLE_TYPES = {
  mixed: ['peony', 'chrys', 'willow', 'ring', 'heart', 'palm', 'crossette', 'crackle'],
  classic: ['peony', 'chrys'],
  willow: ['willow', 'palm'],
  shapes: ['ring', 'heart', 'star'],
  crackle: ['crackle', 'crossette'],
};
const RATE = [2.6, 2.2, 1.8, 1.5, 1.2, 1.0, 0.8, 0.6, 0.45, 0.32]; // quantity 1..10 -> seconds between launches

const st = { W: 0, H: 0, buf: null, smoke: null, rockets: [], stars: [], flash: 0, flashX: 0.5, next: 0.2, finaleT: 0, finaleLeft: 0, textT: 6, wasBeat: 0 };

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const W = c.W, H = c.H, o = (core.effectOptions && core.effectOptions.fireworks) || {};
    if (st.W !== W || st.H !== H) { st.W = W; st.H = H; st.buf = new Float32Array(W * H * 3); st.smoke = new Float32Array(W * H); st.rockets = []; st.stars = []; }
    const opt = {
      mode: ['sync', 'mic'].includes(o.mode) ? o.mode : 'random',
      rate: RATE[Math.max(1, Math.min(10, Math.round(o.quantity) || 6)) - 1],
      style: STYLE_TYPES[o.style] ? o.style : 'mixed',
      palette: PAL[o.palette] ? o.palette : 'rainbow',
      backdrop: ['water', 'city', 'sky', 'none'].includes(o.backdrop) ? o.backdrop : 'water',
      size: [0, 0.7, 1, 1.35][Math.max(1, Math.min(3, Math.round(o.size) || 2))] * (Math.min(W, H) / 64),
      finale: ['off', '2', 'beat'].includes(String(o.finale)) ? String(o.finale) : '2',
      smoke: o.smoke !== false,
      text: o.textOn && o.text ? String(o.text).toUpperCase().slice(0, 12) : '',
    };
    const beat = core.audio && core.audio.beat ? core.audio.beat : 0;
    const horizon = opt.backdrop === 'water' ? Math.round(H * 0.72) : H;
    const { buf, smoke } = st;
    const add = (x, y, r, g, b) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3; buf[i] += r; buf[i + 1] += g; buf[i + 2] += b;
    };
    const launch = (type, at) => {
      const types = STYLE_TYPES[opt.style];
      type = type || types[Math.floor(Math.random() * types.length)];
      const tx = at !== undefined ? at : W * (0.15 + Math.random() * 0.7), ty = horizon * (0.18 + Math.random() * 0.3);
      st.rockets.push({ x: tx + (Math.random() - 0.5) * 6, y: horizon, tx, ty, vy: -(horizon - ty) * 1.9, type, col: PAL[opt.palette]() });
    };
    const burst = (r) => {
      const sz = opt.size, col = r.col, col2 = PAL[opt.palette]();
      const star = (vx, vy, extra) => st.stars.push(Object.assign({ x: r.x, y: r.y, vx, vy, life: 1, decay: 0.55 + Math.random() * 0.3, col, trail: 0, drag: 0.985, g: 9 * sz, twinkle: 0 }, extra));
      st.flash = 1; st.flashX = r.x / W;
      const n = Math.round(60 * Math.min(2, sz));
      switch (r.type) {
        case 'peony': for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (14 + Math.random() * 6) * sz; star(Math.cos(a) * v, Math.sin(a) * v); } break;
        case 'chrys': for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (15 + Math.random() * 5) * sz; star(Math.cos(a) * v, Math.sin(a) * v, { trail: 1, col: i % 3 ? col : col2 }); } break;
        case 'willow': for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (9 + Math.random() * 5) * sz; star(Math.cos(a) * v, Math.sin(a) * v, { col: [1, 0.72, 0.28], trail: 1, decay: 0.28, drag: 0.97, g: 7 * sz }); } break;
        case 'ring': { const tilt = 0.45 + 0.4 * Math.random(); for (let i = 0; i < n * 0.7; i++) { const a = (i / (n * 0.7)) * 6.283, v = 16 * sz; star(Math.cos(a) * v, Math.sin(a) * v * tilt, { decay: 0.7 }); } break; }
        case 'heart': for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); star(hx * sz, hy * sz, { col: [1, 0.25, 0.45], decay: 0.65, g: 4 * sz }); } break;
        case 'star': for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, k = 0.55 + 0.45 * Math.cos(5 * a); star(Math.cos(a) * 18 * k * sz, Math.sin(a) * 18 * k * sz, { decay: 0.65, g: 4 * sz }); } break;
        case 'palm': for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.42; for (let k = 0; k < 6; k++) star(Math.cos(a) * (16 + k * 1.5) * sz, Math.sin(a) * (16 + k * 1.5) * sz, { col: [1, 0.8, 0.4], trail: 1, decay: 0.4, g: 12 * sz }); } break;
        case 'crossette': for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, v = 14 * sz; star(Math.cos(a) * v, Math.sin(a) * v, { split: 0.55, decay: 0.8 }); } break;
        case 'crackle': for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (10 + Math.random() * 10) * sz; star(Math.cos(a) * v, Math.sin(a) * v, { col: [1, 0.95, 0.85], twinkle: 1, decay: 0.7 }); } break;
        case 'text': {
          // The word in 5x7 letters, each lit pixel a star that holds still, then sags and fades.
          const word = opt.text || 'WOW', pitch = Math.max(1, Math.min(3, Math.floor((W - 4) / (word.length * 6))));
          const total = word.length * 6 * pitch;
          [...word].forEach((ch, k) => {
            const rows = FONT_5x7.get(ch) || [], lc = PAL[opt.palette](); // one colour per letter
            rows.forEach((bits, yy) => { for (let xx = 0; xx < 5; xx++) if ((bits >> (4 - xx)) & 1) {
              const px = W / 2 - total / 2 + (k * 6 + xx) * pitch, py = r.y + (yy - 3) * pitch;
              // With drag 0.82 per 60th of a second a star travels v/10.8 in total, so
              // this speed lands each one on its letter pixel.
              st.stars.push({ x: r.x, y: r.y, vx: (px - r.x) * 10.8, vy: (py - r.y) * 10.8, life: 1.25, decay: 0.4, col: lc, trail: 0, drag: 0.82, g: 0.6, twinkle: 0 });
            } });
          });
          break;
        }
      }
      if (opt.smoke) for (let i = 0; i < 30; i++) { const a = Math.random() * 6.283, d = Math.random() * 10 * sz; const x = Math.round(r.x + Math.cos(a) * d), y = Math.round(r.y + Math.sin(a) * d); if (x >= 0 && y >= 0 && x < W && y < H) smoke[y * W + x] = Math.min(1, smoke[y * W + x] + 0.5); }
    };

    // Launching.
    const bigBeat = beat > 0.8 && st.wasBeat <= 0.8; st.wasBeat = beat;
    if (opt.mode === 'mic') { if (bigBeat) launch(); }
    else if ((st.next -= dt) <= 0) {
      if (opt.mode === 'sync') { // a salvo: matching shells across the sky
        const types = STYLE_TYPES[opt.style], type = types[Math.floor(Math.random() * types.length)], k = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < k; i++) launch(type, W * (i + 0.5) / k);
        st.next = opt.rate * 2.2;
      } else { launch(); st.next = opt.rate * (0.5 + Math.random()); }
    }
    if (opt.finale === '2') { st.finaleT += dt; if (st.finaleT > 120) { st.finaleT = 0; st.finaleLeft = 22; } }
    if (opt.finale === 'beat' && bigBeat && beat > 0.95 && st.finaleLeft <= 0 && Math.random() < 0.15) st.finaleLeft = 18;
    if (st.finaleLeft > 0 && Math.random() < dt * 14) { launch(); st.finaleLeft--; }
    if (opt.text && (st.textT -= dt) <= 0) { st.textT = 14; launch('text', W / 2); }

    // Physics.
    for (const r of st.rockets) {
      r.y += r.vy * dt; r.vy *= Math.pow(0.35, dt); r.x += (r.tx - r.x) * dt * 2;
      if (r.y <= r.ty + 1 || r.vy > -4) { r.done = true; burst(r); }
    }
    st.rockets = st.rockets.filter((r) => !r.done);
    const born = [];
    for (const p of st.stars) {
      p.vx *= Math.pow(p.drag, dt * 60); p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * p.decay;
      if (p.split && p.life < p.split) { p.split = 0; for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.785; born.push({ x: p.x, y: p.y, vx: Math.cos(a) * 8 * opt.size, vy: Math.sin(a) * 8 * opt.size, life: 0.6, decay: 1, col: [1, 0.9, 0.6], trail: 0, drag: 0.97, g: 8, twinkle: 0 }); } }
    }
    st.stars = st.stars.filter((p) => p.life > 0 && p.y < H + 4).concat(born);
    if (st.stars.length > 2500) st.stars.splice(0, st.stars.length - 2500);
    st.flash = Math.max(0, st.flash - dt * 3);

    // Sky, flash light and smoke.
    const fl = st.flash * st.flash, bd = opt.backdrop;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3, v = y / H;
      let r = 0, g = 0, b = 0;
      if (bd !== 'none') { r = 0.004 + v * 0.02; g = 0.006 + v * 0.02; b = 0.02 + v * 0.05; }
      const near = Math.exp(-(((x / W - st.flashX) / 0.4) ** 2)), lift = fl * (0.05 + 0.18 * near) * (bd === 'none' ? 0.3 : 1);
      r += lift * 0.9; g += lift * 0.8; b += lift;
      const sm = smoke[y * W + x];
      if (sm > 0) { r += sm * (0.05 + fl * 0.4); g += sm * (0.05 + fl * 0.35); b += sm * (0.07 + fl * 0.4); }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
    const keep = Math.pow(0.6, dt);
    for (let i = 0; i < smoke.length; i++) smoke[i] *= keep;
    // Rockets, then stars.
    for (const r of st.rockets) for (let k = 0; k < 5; k++) add(r.x + (Math.random() - 0.5), r.y + k * 1.4, 0.9 * (1 - k / 5), 0.6 * (1 - k / 5), 0.3 * (1 - k / 5));
    for (const p of st.stars) {
      const L = Math.max(0, Math.min(1, p.life)), warm = 1 - L;
      let k = Math.min(1, L * 1.6);
      if (p.twinkle && Math.random() < 0.45) k *= 0.1;
      const cr = p.col[0] * (1 - warm * 0.2) + warm * 0.3, cg = p.col[1] * (1 - warm * 0.5), cb = p.col[2] * (1 - warm * 0.7);
      add(p.x, p.y, cr * k, cg * k, cb * k);
      if (p.trail) for (let q = 1; q < 4; q++) add(p.x - p.vx * 0.02 * q, p.y - p.vy * 0.02 * q, cr * k * 0.35 / q, cg * k * 0.35 / q, cb * k * 0.35 / q);
    }
    // Backdrop silhouettes and the water's reflection.
    if (bd === 'city') {
      for (let x = 0; x < W; x++) {
        const hh = (Math.sin(x * 0.9) * 43758.5453) % 1, bh = (6 + (hh < 0 ? hh + 1 : hh) * 12 * (0.5 + 0.5 * Math.sin(x * 0.17))) * H / 64;
        for (let y = Math.round(H - bh); y < H; y++) { const i = (y * W + x) * 3, lit = fl * 0.12; buf[i] = 0.01 + lit; buf[i + 1] = 0.01 + lit; buf[i + 2] = 0.025 + lit * 1.2; if (((x * 7 + y * 13) % 23) === 0) { buf[i] += 0.5; buf[i + 1] += 0.4; buf[i + 2] += 0.1; } }
      }
    }
    if (bd === 'water') {
      for (let y = horizon; y < H; y++) {
        const d = y - horizon, sy = Math.round(horizon - 1 - d * 1.15);
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 3, sx = Math.round(x + Math.sin(y * 1.3 + t * 3) * (1 + d * 0.08));
          let r = 0.004, g = 0.01, b = 0.03 + d * 0.002;
          if (sy >= 0 && sx >= 0 && sx < W) { const q = (sy * W + sx) * 3, k = 0.45 * (1 - d / (H - horizon + 4)); r += buf[q] * k; g += buf[q + 1] * k; b += buf[q + 2] * k; }
          buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
        }
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; c.set(x, y, Math.min(1, buf[i]), Math.min(1, buf[i + 1]), Math.min(1, buf[i + 2])); }
  },
});
module.exports.getStatus = () => ({ rockets: st.rockets.length, stars: st.stars.length });
