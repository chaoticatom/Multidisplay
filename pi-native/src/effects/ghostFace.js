// Ghost Face, redesigned: a pale, gaunt face looming out of drifting fog -
// hollow eye sockets with glowing red pupils that wander and blink, a
// skull-like nose cavity, a stretched gaping mouth with jagged teeth, a
// slow sickly breathing glow, flicker, and now and then a sudden lurch
// towards you with a static glitch. It slowly emerges out of the screen
// and sinks back into the fog on a ~12 s loop. Same face on every cube side face;
// fills a flat panel. (Drawn upright - the old one came out upside down.)
'use strict';
const { defineCanvasEffect } = require('./canvas');

// Integer hash (0..1) for the fog noise: the usual sin()-based one was the
// biggest cost of the whole effect on a large wall.
const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function noise(x, y) { // smooth value noise for the fog
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const st = { blink: 0, nextBlink: 3, lunge: 0, nextLunge: 9, look: [0, 0], lookTo: [0, 0], nextLook: 1, cycle: -1, f: null };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
// A new face every time it sinks back into the dark: head shape, eyes, eye
// colour, skin, tilt, and one of several mouths.
function newFace() {
  return {
    width: rnd(0.25, 0.34), length: rnd(0.38, 0.46), hollow: rnd(0.02, 0.08),
    eyeGap: rnd(0.09, 0.13), eyeY: rnd(-0.13, -0.07), eyeW: rnd(0.07, 0.1), eyeH: rnd(0.055, 0.085), lopsided: rnd(-0.02, 0.02),
    eyeCol: pick([[1.1, 0.12, 0.05], [1.1, 0.12, 0.05], [0.2, 1.0, 0.25], [0.9, 0.95, 1.0], [0.3, 0.55, 1.1], [1.0, 0.6, 0.05]]),
    skin: pick([[0.82, 0.9, 0.88], [0.9, 0.88, 0.8], [0.7, 0.85, 0.95], [0.85, 0.8, 0.9]]),
    tilt: rnd(-0.12, 0.12), offX: rnd(-0.06, 0.06),
    mouth: pick(['scream', 'grin', 'gape', 'stitched']),
    mouthW: rnd(0.09, 0.15), mouthY: rnd(0.19, 0.25), teeth: Math.round(rnd(5, 9)), toothLen: rnd(0.25, 0.45), crooked: rnd(-0.04, 0.04),
    veins: Math.random() < 0.6,
  };
}

module.exports = defineCanvasEffect({
  render(c, { t, dt }) {
    // Timers: blinks, wandering gaze, the occasional lunge.
    if ((st.nextBlink -= dt) <= 0) { st.blink = 0.18; st.nextBlink = 2 + Math.random() * 4; }
    st.blink = Math.max(0, st.blink - dt);
    if ((st.nextLook -= dt) <= 0) { st.lookTo = [(Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.03]; st.nextLook = 0.8 + Math.random() * 2.5; }
    st.look[0] += (st.lookTo[0] - st.look[0]) * Math.min(1, dt * 8); st.look[1] += (st.lookTo[1] - st.look[1]) * Math.min(1, dt * 8);
    if ((st.nextLunge -= dt) <= 0) { st.lunge = 1; st.nextLunge = 10 + Math.random() * 12; }
    st.lunge = Math.max(0, st.lunge - dt * 1.4);
    const lunge = Math.sin(Math.min(1, st.lunge) * Math.PI) * (st.lunge > 0 ? 1 : 0);
    // Emerge cycle: the face slowly pushes out of the screen towards you,
    // then sinks back into the fog (about 12 s per cycle).
    const depth = 0.5 - 0.5 * Math.cos((t / 12) * Math.PI * 2); // 0 far .. 1 close
    const cyc = Math.floor(t / 12);
    if (cyc !== st.cycle || !st.f) { st.cycle = cyc; st.f = newFace(); }
    const F = st.f;
    const emerge = sm(0, 0.35, depth);
    const scale = (0.45 + depth * 0.8) * (1 + lunge * 0.35), glitch = lunge > 0.5 ? (Math.random() - 0.5) * 0.06 : 0;
    const flicker = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3) + (Math.random() < 0.02 ? -0.4 : 0);
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1);
    const S = Math.min(c.W, c.H), ox = (c.W - S) / 2, oy = (c.H - S) / 2;
    const eyeOpen = st.blink > 0 ? Math.abs(st.blink - 0.09) / 0.09 : 1;
    for (let py = 0; py < c.H; py++) for (let px = 0; px < c.W; px++) {
      // Face coordinates: centre (0,0), roughly -0.5..0.5 across, y down.
      let x0 = ((px - ox) / S - 0.5 - F.offX) / scale + glitch * (py % 3 === 0 ? 1 : 0), y0 = ((py - oy) / S - 0.45) / scale;
      const sway = Math.sin(t * 0.7) * 0.012; x0 -= sway;
      const ca = Math.cos(F.tilt), sa = Math.sin(F.tilt);
      const x = x0 * ca - y0 * sa, y = x0 * sa + y0 * ca;
      // Near-black background with only a faint wisp of fog.
      const fog = noise(px * 0.08 + t * 0.4, py * 0.08 - t * 0.15) * noise(px * 0.03 - t * 0.1, py * 0.05);
      const wisp = Math.max(0, fog - 0.35) * 0.12;
      let r = wisp * 0.6, g = wisp * 0.75, b = wisp;
      // Head: a long, narrow oval with sunken cheeks.
      const hx = x / (F.width - F.hollow * sm(0.05, 0.25, y)), hy = (y + 0.02) / F.length;
      const head = 1 - Math.hypot(hx, hy);
      if (head > -0.05) {
        const skin = sm(-0.05, 0.25, head);
        const shade = 0.55 + 0.45 * (0.5 - y) - 0.25 * Math.max(0, Math.abs(x) - 0.12) * 4; // lit from above
        const tone = (0.62 + breathe * 0.08) * shade * flicker;
        // Pallid grey-green with a hint of blue in the shadows.
        let fr = tone * F.skin[0], fg = tone * F.skin[1], fb = tone * F.skin[2];
        // Cheek hollows.
        const cheek = Math.exp(-(((Math.abs(x) - 0.17) / 0.06) ** 2) - ((y - 0.08) / 0.1) ** 2);
        fr *= 1 - cheek * 0.55; fg *= 1 - cheek * 0.55; fb *= 1 - cheek * 0.5;
        // Eye sockets: deep dark hollows.
        for (const sx of [-1, 1]) {
          const eyY = F.eyeY + sx * F.lopsided;
          const ex = (x - sx * F.eyeGap) / F.eyeW, ey = (y - eyY) / F.eyeH;
          const sock = Math.min(1, Math.exp(-(ex * ex + ey * ey) * 0.7) * 1.15);
          fr *= 1 - sock * 0.95; fg *= 1 - sock * 0.95; fb *= 1 - sock * 0.92;
          // Glowing red pupil with a hot core, wandering; lids close on blinks.
          const pxp = (x - sx * F.eyeGap - st.look[0]) / 0.028, pyp = (y - eyY - st.look[1]) / (0.028 * Math.max(0.05, eyeOpen));
          const pupil = Math.exp(-(pxp * pxp + pyp * pyp)), halo = Math.exp(-(pxp * pxp + pyp * pyp) / 4) * 0.22;
          const glow = (pupil + halo) * (0.75 + 0.25 * breathe) * eyeOpen;
          const E = F.eyeCol, core = pupil * 0.3 * eyeOpen;
          fr += glow * E[0] + core; fg += glow * E[1] + core; fb += glow * E[2] + core;
        }
        // Nose: two dark slits, skull-like.
        for (const sx of [-1, 1]) {
          const nx = (x - sx * 0.022) / 0.014, ny = (y - 0.06) / 0.035;
          const n = Math.exp(-(nx * nx + ny * ny)); fr *= 1 - n * 0.8; fg *= 1 - n * 0.8; fb *= 1 - n * 0.8;
        }
        // Mouth: a dark hole with a shaded rim and clean, evenly spaced
        // teeth (one of several shapes, chosen per appearance).
        const open = (F.mouth === 'scream' ? 0.075 : F.mouth === 'grin' ? 0.035 : F.mouth === 'stitched' ? 0.012 : 0.05) + breathe * 0.015 + lunge * 0.06;
        const mw = F.mouth === 'scream' ? F.mouthW * 0.7 : F.mouth === 'grin' ? F.mouthW * 1.35 : F.mouthW;
        const curve = F.mouth === 'grin' ? -1.6 * x * x : 0; // grin curls up at the corners
        const mcy = F.mouthY + curve + F.crooked * x / mw;
        const mx = x / mw, my = (y - mcy) / open, md = mx * mx + my * my;
        if (md < 1.35) {
          // Lips: a darker ring just outside the opening.
          const rim = sm(1.35, 1.0, md) * 0.6; fr *= 1 - rim; fg *= 1 - rim; fb *= 1 - rim;
        }
        if (md < 1) {
          const halfH = open * Math.sqrt(Math.max(0, 1 - mx * mx));
          const depthIn = 1 - md;
          let mr = 0.05 * (1 - depthIn), mg = 0, mb = 0.008; // black deep inside, a hint of red at the edges
          if (F.mouth === 'stitched') {
            // Sewn shut: pale stitches across a thin black slit.
            const k = ((mx * 0.5 + 0.5) * F.teeth) % 1;
            if (k < 0.3) { mr = 0.5 * flicker; mg = 0.45 * flicker; mb = 0.38 * flicker; }
          } else {
            const k = (mx * 0.5 + 0.5) * F.teeth, ti = Math.floor(k), u = k - ti; // which tooth, and where across it
            const shape = 1 - Math.abs(u - 0.5) * 2; // 1 in a tooth's middle, 0 at its edges
            const gap = u < 0.12 || u > 0.88; // dark gap between teeth
            const len = F.toothLen * (0.75 + 0.25 * hash(ti, st.cycle)) * shape;
            const fromTop = (y - (mcy - halfH)) / (2 * halfH), fromBot = ((mcy + halfH) - y) / (2 * halfH);
            if (!gap && (fromTop < len || fromBot < len * 0.7)) {
              const tt = (0.62 - 0.25 * Math.min(fromTop, fromBot) / Math.max(0.01, len)) * flicker;
              mr = tt * 0.92; mg = tt * 0.86; mb = tt * 0.68;
            }
          }
          fr = mr; fg = mg; fb = mb;
        }
        // Cracks / veins across the forehead.
        const vein = Math.abs(Math.sin(x * 40 + Math.sin(y * 30) * 2) * Math.sin(y * 25 + x * 10));
        if (F.veins && y < -0.18 && vein > 0.97) { fr *= 0.6; fg *= 0.55; fb *= 0.6; }
        const vis = skin * emerge; // far away it's faint, as if behind the glass
        r = r * (1 - vis) + fr * vis; g = g * (1 - vis) + fg * vis; b = b * (1 - vis) + fb * vis;
      }
      // Fog drifting in front, thicker towards the bottom.
      // ...thicker in front of the face while it's far away.
      const mist = noise(px * 0.05 - t * 0.3, py * 0.06 + t * 0.1) * (sm(0.5, 1, py / c.H) * 0.08 + (1 - depth) * 0.12);
      r += mist * 0.4; g += mist * 0.5; b += mist * 0.6;
      // Static on a lunge.
      if (lunge > 0.3 && Math.random() < 0.08 * lunge) { const n = Math.random() * 0.6; r += n; g += n; b += n; }
      c.set(px, py, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
  },
});
