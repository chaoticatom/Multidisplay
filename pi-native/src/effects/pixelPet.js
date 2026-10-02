// Pixel Pet: a little creature living on the display. It wanders and
// blinks by day, dances when music plays, curls up asleep at night (with
// floating Zzz), and jumps with hearts when you tap "Pet" on the phone
// (effectOptions.pixel_pet.poke, a counter).
'use strict';
const { hsl } = require('../core');
const { FONT_3x5, drawString } = require('./text');
const { defineCanvasEffect } = require('./canvas');

// 12x10 sprite: 1 body, 2 belly, 3 eye, 4 cheek, 5 feet.
const SPRITE = [
  '...111111...',
  '..11111111..',
  '.1131111311.',
  '.1131111311.',
  '111111111111',
  '141122221141',
  '111222222111',
  '.1122222211.',
  '..11111111..',
  '..55....55..',
];
const pet = { x: 0.5, vx: 0.08, jump: 0, lastPoke: -1, hearts: [], blink: 0 };

module.exports = defineCanvasEffect({
  render(c, { t, dt, core }) {
    const hour = new Date().getHours();
    const night = hour >= 22 || hour < 7;
    const dancing = !night && core.audio && core.audio.level > 0.08;
    const o = (core.effectOptions && core.effectOptions.pixel_pet) || {};
    if (o.poke !== undefined && o.poke !== pet.lastPoke) {
      if (pet.lastPoke !== -1) { pet.jump = 1; for (let i = 0; i < 4; i++) pet.hearts.push({ x: pet.x * c.W + (i - 1.5) * 4, y: c.H * 0.5, life: 1 }); }
      pet.lastPoke = o.poke;
    }
    // Sky by time of day, then the ground.
    const sky = night ? [0.01, 0.01, 0.05] : hour < 9 || hour > 18 ? [0.25, 0.1, 0.18] : [0.08, 0.18, 0.35];
    const groundY = Math.round(c.H * 0.8);
    for (let y = 0; y < c.H; y++) for (let x = 0; x < c.W; x++) {
      if (y >= groundY) { const k = (x + y) % 3 ? 0.12 : 0.18; c.set(x, y, k * 0.3, k, k * 0.25); continue; }
      const f = y / groundY;
      c.set(x, y, sky[0] * (0.5 + f), sky[1] * (0.5 + f), sky[2] * (0.6 + f * 0.6));
    }
    if (night) for (let i = 0; i < 12; i++) { const sx = (i * 37) % c.W, sy = (i * 23) % (groundY - 4); if (Math.sin(t * 2 + i) > 0) c.set(sx, sy, 0.7, 0.7, 0.8); }
    // Move.
    if (!night && !dancing) {
      pet.x += pet.vx * dt;
      if (pet.x > 0.8 || pet.x < 0.2) pet.vx = -pet.vx;
    }
    pet.jump = Math.max(0, pet.jump - dt * 1.6);
    const scale = Math.max(1, Math.floor(Math.min(c.W, c.H) / 32));
    const sw = 12 * scale, sh = 10 * scale;
    let bob = dancing ? Math.abs(Math.sin(t * 8)) * 3 * scale : Math.sin(t * 2) * 0.6 * scale;
    bob += Math.sin(pet.jump * Math.PI) * 10 * scale;
    const px = Math.round(pet.x * c.W - sw / 2), py = Math.round(groundY - sh - bob + (night ? 2 * scale : 0));
    pet.blink = (t % 4) < 0.15;
    const body = hsl(dancing ? (t * 0.3) % 1 : 0.08, 0.85, 0.55);
    const flip = pet.vx < 0;
    SPRITE.forEach((row, ry) => {
      for (let rx = 0; rx < 12; rx++) {
        const ch = row[flip ? 11 - rx : rx];
        if (ch === '.') continue;
        let col = body;
        if (ch === '2') col = [1, 0.85, 0.6];
        else if (ch === '3') col = night || pet.blink ? body : [0.05, 0.05, 0.1];
        else if (ch === '4') col = [1, 0.45, 0.55];
        else if (ch === '5') col = [body[0] * 0.6, body[1] * 0.6, body[2] * 0.6];
        if (ch === '3' && (night || pet.blink) && ry === 3) col = [0.05, 0.05, 0.1]; // closed eye: a line
        for (let i = 0; i < scale; i++) for (let j = 0; j < scale; j++) c.set(px + rx * scale + i, py + ry * scale + j, col[0], col[1], col[2]);
      }
    });
    if (night) drawString(FONT_3x5, 'Z', px + sw + 2, py - 6 - ((t * 4) % 6), (x, y) => c.add(x, y, 0.5, 0.6, 0.9));
    pet.hearts = pet.hearts.filter((h) => (h.life -= dt * 0.7) > 0);
    for (const h of pet.hearts) {
      h.y -= dt * 14;
      for (const [dx, dy] of [[0, 0], [2, 0], [-1, -1], [1, -1], [3, -1], [0, 1], [1, 2], [2, 1]]) c.add(h.x + dx, h.y + dy - 1, h.life, h.life * 0.2, h.life * 0.4);
    }
  },
});
