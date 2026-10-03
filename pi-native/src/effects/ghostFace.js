// Ghost Face, redesigned: a pale, gaunt face looming out of drifting fog -
// hollow eye sockets with glowing red pupils that wander and blink, a
// skull-like nose cavity, a stretched gaping mouth with jagged teeth, a
// slow sickly breathing glow, flicker, and now and then a sudden lurch
// towards you with a static glitch. It slowly emerges out of the screen
// and sinks back into the fog on a ~12 s loop. Same face on every cube side face;
// fills a flat panel. (Drawn upright - the old one came out upside down.)
'use strict';
const { defineCanvasEffect } = require('./canvas');

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) { // smooth value noise for the fog
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const st = { blink: 0, nextBlink: 3, lunge: 0, nextLunge: 9, look: [0, 0], lookTo: [0, 0], nextLook: 1 };

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
    const emerge = sm(0, 0.35, depth);
    const scale = (0.45 + depth * 0.8) * (1 + lunge * 0.35), glitch = lunge > 0.5 ? (Math.random() - 0.5) * 0.06 : 0;
    const flicker = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3) + (Math.random() < 0.02 ? -0.4 : 0);
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1);
    const S = Math.min(c.W, c.H), ox = (c.W - S) / 2, oy = (c.H - S) / 2;
    const eyeOpen = st.blink > 0 ? Math.abs(st.blink - 0.09) / 0.09 : 1;
    for (let py = 0; py < c.H; py++) for (let px = 0; px < c.W; px++) {
      // Face coordinates: centre (0,0), roughly -0.5..0.5 across, y down.
      let x = ((px - ox) / S - 0.5) / scale + glitch * (py % 3 === 0 ? 1 : 0), y = ((py - oy) / S - 0.45) / scale;
      const sway = Math.sin(t * 0.7) * 0.012; x -= sway;
      // Fog behind and around.
      const fog = noise(px * 0.08 + t * 0.4, py * 0.08 - t * 0.15) * noise(px * 0.03 - t * 0.1, py * 0.05);
      let r = 0.02 + fog * 0.08, g = 0.03 + fog * 0.1, b = 0.04 + fog * 0.12;
      // Head: a long, narrow oval with sunken cheeks.
      const hx = x / (0.3 - 0.05 * sm(0.05, 0.25, y)), hy = (y + 0.02) / 0.42;
      const head = 1 - Math.hypot(hx, hy);
      if (head > -0.05) {
        const skin = sm(-0.05, 0.25, head);
        const shade = 0.55 + 0.45 * (0.5 - y) - 0.25 * Math.max(0, Math.abs(x) - 0.12) * 4; // lit from above
        const tone = (0.62 + breathe * 0.08) * shade * flicker;
        // Pallid grey-green with a hint of blue in the shadows.
        let fr = tone * 0.82, fg = tone * 0.9, fb = tone * 0.88;
        // Cheek hollows.
        const cheek = Math.exp(-(((Math.abs(x) - 0.17) / 0.06) ** 2) - ((y - 0.08) / 0.1) ** 2);
        fr *= 1 - cheek * 0.55; fg *= 1 - cheek * 0.55; fb *= 1 - cheek * 0.5;
        // Eye sockets: deep dark hollows.
        for (const sx of [-1, 1]) {
          const ex = (x - sx * 0.11) / 0.085, ey = (y + 0.1) / 0.07;
          const sock = Math.exp(-(ex * ex + ey * ey) * 1.3);
          fr *= 1 - sock * 0.95; fg *= 1 - sock * 0.95; fb *= 1 - sock * 0.92;
          // Glowing red pupil with a hot core, wandering; lids close on blinks.
          const pxp = (x - sx * 0.11 - st.look[0]) / 0.028, pyp = (y + 0.1 - st.look[1]) / (0.028 * Math.max(0.05, eyeOpen));
          const pupil = Math.exp(-(pxp * pxp + pyp * pyp)), halo = Math.exp(-(pxp * pxp + pyp * pyp) / 6) * 0.35;
          const glow = (pupil + halo) * (0.75 + 0.25 * breathe) * eyeOpen;
          fr += glow * 1.1; fg += glow * 0.12 + pupil * 0.25 * eyeOpen; fb += glow * 0.05;
        }
        // Nose: two dark slits, skull-like.
        for (const sx of [-1, 1]) {
          const nx = (x - sx * 0.022) / 0.014, ny = (y - 0.06) / 0.035;
          const n = Math.exp(-(nx * nx + ny * ny)); fr *= 1 - n * 0.8; fg *= 1 - n * 0.8; fb *= 1 - n * 0.8;
        }
        // Mouth: a stretched, gaping black hole with jagged teeth top and bottom.
        const open = 0.055 + breathe * 0.02 + lunge * 0.06;
        const mx = x / 0.13, my = (y - 0.22) / open;
        if (mx * mx + my * my < 1) {
          const inside = 1 - (mx * mx + my * my);
          let mr = 0.04 * inside, mg = 0.0, mb = 0.01;
          // Teeth: little pale triangles along the top and bottom lips.
          const tooth = Math.abs(((x / 0.026) % 1 + 1) % 1 - 0.5) * 2; // 0 at a tooth's middle
          const fromTop = (y - (0.22 - open * Math.sqrt(Math.max(0, 1 - mx * mx)))) / open;
          const fromBot = ((0.22 + open * Math.sqrt(Math.max(0, 1 - mx * mx))) - y) / open;
          if (fromTop < 0.35 * (1 - tooth) || fromBot < 0.3 * (1 - tooth)) { const tt = 0.55 * flicker; mr = tt * 0.9; mg = tt * 0.85; mb = tt * 0.7; }
          fr = mr; fg = mg; fb = mb;
        }
        // Cracks / veins across the forehead.
        const vein = Math.abs(Math.sin(x * 40 + Math.sin(y * 30) * 2) * Math.sin(y * 25 + x * 10));
        if (y < -0.18 && vein > 0.97) { fr *= 0.6; fg *= 0.55; fb *= 0.6; }
        const vis = skin * emerge; // far away it's faint, as if behind the glass
        r = r * (1 - vis) + fr * vis; g = g * (1 - vis) + fg * vis; b = b * (1 - vis) + fb * vis;
      }
      // Fog drifting in front, thicker towards the bottom.
      // ...thicker in front of the face while it's far away.
      const mist = noise(px * 0.05 - t * 0.3, py * 0.06 + t * 0.1) * (sm(0.3, 1, py / c.H) * 0.25 + (1 - depth) * 0.25);
      r += mist * 0.5; g += mist * 0.6; b += mist * 0.7;
      // Static on a lunge.
      if (lunge > 0.3 && Math.random() < 0.08 * lunge) { const n = Math.random() * 0.6; r += n; g += n; b += n; }
      c.set(px, py, Math.min(1, r), Math.min(1, g), Math.min(1, b));
    }
  },
});
