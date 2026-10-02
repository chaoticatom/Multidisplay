// My Photos: a slideshow of pictures uploaded from the phone (Play > My
// Photos > Add photos; stored in pi-native/photos/ by src/httpApi.js).
// Crossfades every `secs` seconds (effectOptions.my_photos.secs, default
// 8). Cube: a different photo on each side face. Wall: one photo filling
// the wall. Shows an "ADD PHOTOS" hint when there are none.
'use strict';
const fs = require('fs');
const path = require('path');
const { defineCanvasEffect } = require('./canvas');
const { FONT_3x5, drawLinesCentered } = require('./text');

const DIR = path.join(__dirname, '..', '..', 'photos');
const IMG = /\.(jpe?g|png|gif|bmp|webp)$/i;
let files = [], listedAt = 0, idx = 0, timer = 0, fade = 1;
const cache = new Map(); // `${file}|${w}x${h}` -> Uint8Array RGBA, or 'loading'

function list() {
  if (Date.now() - listedAt < 5000) return files;
  listedAt = Date.now();
  try { files = fs.readdirSync(DIR).filter((f) => IMG.test(f)).sort(); } catch (e) { files = []; }
  return files;
}
function image(file, w, h) {
  const key = `${file}|${w}x${h}`;
  const c = cache.get(key);
  if (c && c !== 'loading') return c;
  if (!c) {
    cache.set(key, 'loading');
    const { Jimp } = require('jimp');
    Jimp.read(path.join(DIR, file)).then((img) => {
      img.cover({ w, h });
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      cache.set(key, img.bitmap.data);
    }).catch(() => cache.delete(key));
  }
  return null;
}

module.exports = defineCanvasEffect({
  panorama: true,
  render(c, { dt, core }) {
    const list_ = list();
    c.clear();
    if (!list_.length) {
      drawLinesCentered(FONT_3x5, ['ADD PHOTOS', 'ON THE PHONE'], c.W, c.H, (x, y) => c.set(x, y, 0.25, 0.55, 0.9), { scale: Math.max(1, Math.floor(c.H / 48)) });
      return;
    }
    const secs = Math.max(2, Number(core.effectOptions && core.effectOptions.my_photos && core.effectOptions.my_photos.secs) || 8);
    timer += dt; fade = Math.min(1, fade + dt * 1.5);
    if (timer > secs) { timer = 0; idx = (idx + 1) % list_.length; fade = 0; }
    // One tile per cube side face, or the whole wall.
    const tiles = c.W > c.H * 2 ? 4 : 1, tw = c.W / tiles;
    for (let k = 0; k < tiles; k++) {
      const cur = image(list_[(idx + k) % list_.length], tw, c.H);
      const prev = fade < 1 ? image(list_[(idx + k - 1 + list_.length) % list_.length], tw, c.H) : null;
      if (!cur) continue;
      for (let y = 0; y < c.H; y++) for (let x = 0; x < tw; x++) {
        const o = (y * tw + x) * 4;
        let r = cur[o] / 255, g = cur[o + 1] / 255, b = cur[o + 2] / 255;
        if (prev) { r = prev[o] / 255 + (r - prev[o] / 255) * fade; g = prev[o + 1] / 255 + (g - prev[o + 1] / 255) * fade; b = prev[o + 2] / 255 + (b - prev[o + 2] / 255) * fade; }
        c.set(k * tw + x, y, r, g, b);
      }
    }
  },
});
module.exports.PHOTO_DIR = DIR;
