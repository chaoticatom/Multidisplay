// A realistic human face, drawn per pixel from simple shapes with soft
// lighting: skin with warm cheeks and shading, hair, ears, neck and
// shoulders, eyebrows, eyes (white, coloured iris, pupil, catch-light,
// eyelids that blink), a shaded nose and lips that open for speech.
//   renderFace(out, w, h, pose, look)  - writes RGB 0..1 into out (w*h*3)
//   pose: { yaw, tilt, bob, blink 0..1, gazeX, gazeY, brow, mouthOpen 0..1,
//           mouthWide -1..1 (round .. wide), smile 0..1, squint 0..1 }
//   look: { skin, hair, iris, shirt, bg } colours [r,g,b]
// Coordinates: face space u (left-right) and v (top-bottom), -1..1, the
// face filling about 80% of the height. Each pixel is sampled twice for
// smooth edges. Used by talkingFace.js.
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// Signed distance to an ellipse (approximate): < 0 inside.
function ell(x, y, cx, cy, rx, ry) { const dx = (x - cx) / rx, dy = (y - cy) / ry; return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry); }

// One sample of the scene at face-space (u, v).
function shade(u, v, p, L) {
  const woman = L.style === 'woman';
  // Background: a soft warm room tone with a vignette.
  let col = scale(L.bg, 1 - 0.35 * clamp(Math.hypot(u * 0.7, v * 0.6)));

  // Shoulders and shirt.
  const shoulder = v - (0.95 + 0.25 * u * u);
  if (shoulder > 0) col = mix(col, scale(L.shirt, 0.75 + 0.25 * clamp(1 - Math.abs(u))), sm(0, 0.04, shoulder));

  // Long hair (woman): falls behind the neck, over the shoulders.
  if (woman) {
    // Starts below the crown (the round hair behind the head covers the top), soft wavy
    // sides, rounded ends.
    const long = Math.max(Math.abs(u) - (0.76 + 0.04 * Math.sin(v * 5 + u * 2) - 0.1 * Math.max(0, v - 0.4)), v - (1.12 - 0.18 * (u / 0.8) * (u / 0.8)), -0.25 - v);
    if (long < 0) {
      const strands = 0.82 + 0.13 * Math.sin(u * 45 + v * 6) + 0.05 * Math.sin(u * 140);
      const sheen = 0.25 * sm(0.18, 0, Math.abs(v - 0.05 - u * 0.15)); // a soft band of shine
      col = mix(col, scale(L.hair, (0.55 + 0.4 * clamp(0.6 - v * 0.4 - u * 0.3) + sheen) * strands), sm(0, -0.03, long));
    }
  }
  // Neck (shaded darker under the jaw).
  const neck = Math.max(Math.abs(u) - 0.27, 0.55 - v);
  if (neck < 0) col = mix(col, scale(L.skin, 0.62 + 0.18 * clamp((v - 0.6) * 2)), sm(0, -0.03, neck));

  // Hair behind the head.
  const hairBack = ell(u, v, 0, -0.18, 0.78, 0.88);
  if (hairBack < 0) col = mix(col, scale(L.hair, 0.55 + 0.25 * clamp(-v)), sm(0, -0.03, hairBack));

  // Ears.
  for (const s of woman ? [] : [-1, 1]) { // hidden by long hair on a woman
    const e = ell(u, v, s * 0.63, 0.02, 0.1, 0.17);
    if (e < 0) col = mix(col, scale(L.skin, 0.72 - 0.1 * clamp((Math.abs(u) - 0.6) * 5)), sm(0, -0.02, e));
  }

  // Face: an egg shape, narrower at the jaw.
  const jaw = woman ? (v > 0 ? 0.57 - v * 0.22 : 0.57) : (v > 0 ? 0.6 - v * 0.17 : 0.6); // softer, slimmer jaw on a woman
  const face = ell(u, v, 0, 0.02, jaw, 0.8);
  if (face > 0.03) return col;
  // Surface normal of a soft dome, lit from the upper left.
  const nx = u / 0.66, ny = (v - 0.02) / 0.85, nz = Math.sqrt(clamp(1 - nx * nx * 0.85 - ny * ny * 0.75, 0.05));
  const lam = clamp(-nx * 0.35 - ny * 0.35 + nz * 0.86);
  let skin = scale(L.skin, 0.5 + 0.6 * lam);
  // Warm cheeks and a little colour on the nose and chin.
  const cheek = Math.max(sm(0.22, 0, Math.hypot(Math.abs(u) - 0.32, v - 0.18)), 0.5 * sm(0.12, 0, Math.hypot(u, v - 0.12)), 0.4 * sm(0.14, 0, Math.hypot(u, v - 0.66)));
  skin = mix(skin, [skin[0] * 1.08, skin[1] * 0.82, skin[2] * 0.8], cheek * (woman ? 0.8 : 0.55));
  // Soft shadow round the edge of the face.
  skin = scale(skin, 1 - 0.35 * sm(-0.12, 0.02, face));

  // Eye sockets: a little darker above and round the eyes.
  for (const s of [-1, 1]) {
    const sock = Math.hypot((u - s * 0.24) / 0.2, (v + 0.1) / 0.12);
    skin = scale(skin, 1 - 0.18 * sm(1.2, 0.4, sock));
  }
  // Nose: a lit bridge, a shadow on the far side, nostrils, a lit tip.
  const nb = Math.abs(u) < 0.07 && v > -0.1 && v < 0.2;
  if (nb) skin = scale(skin, 1 + 0.1 * sm(0.07, 0, Math.abs(u + 0.01)));
  skin = scale(skin, 1 - 0.28 * sm(0.06, 0, Math.hypot(u - 0.075, (v - 0.12) * 0.45)) * (v > -0.08 && v < 0.24 ? 1 : 0));
  skin = scale(skin, 1 - 0.22 * sm(0.13, 0, Math.hypot(u, (v - 0.28) * 1.6))); // under the nose
  for (const s of [-1, 1]) skin = mix(skin, scale(L.skin, 0.25), sm(0.035, 0.01, Math.hypot(u - s * 0.05, (v - 0.235) * 1.6)) * 0.8);
  skin = scale(skin, 1 + 0.12 * sm(0.06, 0, Math.hypot(u + 0.01, v - 0.19)));
  col = mix(col, skin, sm(0.03, -0.01, face));

  // Hair in front: a fringe over the forehead with a side parting.
  const fringe = v - (-0.44 + 0.1 * Math.sin((u + 0.3) * 2.2) + 0.1 * u); // swept to one side
  const hairFront = Math.max(fringe, ell(u, v, 0, -0.22, 0.7, 0.75)); // above the line and on the head
  if (hairFront < 0.02) {
    const strands = 0.85 + 0.15 * Math.sin(u * 60 + v * 8);
    col = mix(col, scale(L.hair, (0.6 + 0.5 * clamp(-u * 0.6 - v * 0.6 + 0.4)) * strands), sm(0.02, -0.02, hairFront));
  }
  // Sideburn hair along the temples - or, on a woman, strands framing the face.
  for (const s of [-1, 1]) {
    const sb = woman ? ell(u, v, s * 0.6, 0.12, 0.09, 0.62) : ell(u, v, s * 0.57, -0.2, 0.08, 0.3);
    if (sb < 0) col = mix(col, scale(L.hair, 0.5), sm(0, -0.03, sb));
  }

  // Eyebrows (raised by pose.brow).
  for (const s of [-1, 1]) {
    const bx = u - s * 0.24, by = v - (-0.24 - p.brow * 0.05 + 0.06 * bx * bx / 0.04 * 0.25 - s * 0.01);
    const arch = woman ? 0.035 * Math.cos(bx * 11) : 0.015 * Math.cos(bx * 12), thick = woman ? 0.013 : 0.022;
    const d = Math.max(Math.abs(bx) - 0.13, Math.abs(by + arch) - thick);
    if (d < 0.01) col = mix(col, scale(woman ? mix(L.hair, [0.3, 0.2, 0.12], 0.5) : L.hair, 0.7), sm(0.01, -0.008, d)); // finer, arched brows on a woman
  }

  // Eyes.
  for (const s of [-1, 1]) {
    const ex = u - s * 0.24, ey = v + 0.08;
    const open = clamp(1 - p.blink) * (1 - 0.35 * p.squint);
    const hw = 0.115, hh = 0.055 * open + 0.002;
    // Almond: top and bottom arcs.
    const top = -hh * (1 - (ex / hw) * (ex / hw)), bot = hh * 0.8 * (1 - (ex / hw) * (ex / hw));
    const inside = Math.abs(ex) < hw && ey > top && ey < bot;
    if (inside) {
      let e = [0.92, 0.9, 0.86]; // the white
      e = scale(e, 0.75 + 0.25 * sm(-hh, hh * 0.3, ey)); // upper lid shadow
      const ix = ex - p.gazeX * 0.04, iy = ey - p.gazeY * 0.02, ir = Math.hypot(ix, iy * 1.1);
      if (ir < 0.05) {
        let iris = mix(L.iris, scale(L.iris, 0.45), sm(0.03, 0.05, ir)); // darker rim
        iris = mix(iris, [0.03, 0.02, 0.02], sm(0.024, 0.016, ir)); // pupil
        e = mix(e, iris, sm(0.05, 0.044, ir));
      }
      if (Math.hypot(ix + 0.018, iy + 0.018) < 0.012) e = mix(e, [1, 1, 1], 0.9); // catch-light
      col = e;
    }
    // Upper eyelid line / lashes, and the closed lid.
    const lidLine = Math.abs(ey - top) < (woman ? 0.018 : 0.012) && Math.abs(ex) < hw * 1.05;
    if (lidLine) col = mix(col, [0.12, 0.08, 0.07], woman ? 0.95 : 0.85);
    // Lashes flick up at the outer corner.
    if (woman && s * ex > hw * 0.85 && s * ex < hw * 1.15 && Math.abs(ey - (top - (s * ex - hw * 0.85) * 0.5)) < 0.008) col = mix(col, [0.12, 0.07, 0.07], 0.6);
    if (!inside && Math.abs(ex) < hw && ey > top - 0.05 && ey < top && open < 0.25) col = mix(col, scale(L.skin, 0.75), 0.6);
  }

  // Mouth: lips, and inside when open (teeth along the top).
  {
    const wide = 0.15 * (1 + 0.25 * p.mouthWide) + 0.02 * p.smile, open = p.mouthOpen;
    const mx = u, my = v - 0.43, t = clamp(1 - (mx / wide) * (mx / wide));
    const curve = -p.smile * 0.03 * (mx / wide) * (mx / wide);
    const gapTop = -0.006 - open * 0.05 * t + curve, gapBot = 0.006 + open * 0.07 * t + curve;
    const full = woman ? 1.3 : 1;
    const upTop = gapTop - 0.035 * full * Math.sqrt(t), lowBot = gapBot + 0.045 * full * Math.sqrt(t);
    if (Math.abs(mx) < wide && my > upTop && my < lowBot) {
      const lip = woman ? [0.86, 0.38, 0.46] : [0.72, 0.36, 0.36]; // fuller, pinker lips on a woman
      if (my > gapTop && my < gapBot && open > 0.05) {
        let inner = [0.22, 0.05, 0.06];
        if (my < gapTop + 0.025 * open + 0.008) inner = [0.86, 0.84, 0.78]; // top teeth
        col = inner;
      } else col = scale(mix(lip, L.skin, 0.25), my < gapTop ? 0.82 : 1.05); // top lip in shadow
    }
    // Corners.
    for (const s of [-1, 1]) col = scale(col, 1 - 0.25 * sm(0.03, 0, Math.hypot(mx - s * wide, my - curve)));
  }
  return col;
}

function renderFace(out, w, h, pose, look) {
  const size = Math.min(w, h), ox = (w - size) / 2, oy = (h - size) / 2;
  const ca = Math.cos(pose.tilt), sa = Math.sin(pose.tilt);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0;
    for (let s = 0; s < 2; s++) {
      // Two samples per pixel on a diagonal (soft edges at half the cost of four).
      // Screen -> face space (face 80% of the height), with head turn/tilt/bob.
      const sx = s ? 0.75 : 0.25, sy = s ? 0.75 : 0.25;
      let u = ((x + sx - ox) / size - 0.5) * 2.5, v = ((y + sy - oy) / size - 0.5) * 2.5 - pose.bob;
      const ru = u * ca + v * sa, rv = -u * sa + v * ca;
      u = ru - pose.yaw * (1 - rv * rv * 0.3); v = rv;
      const c = shade(u, v, pose, look);
      r += c[0]; g += c[1]; b += c[2];
    }
    const o = (y * w + x) * 3;
    out[o] = r / 2; out[o + 1] = g / 2; out[o + 2] = b / 2;
  }
}

const LOOKS = {
  skin: { light: [0.93, 0.72, 0.6], medium: [0.8, 0.56, 0.4], tan: [0.68, 0.45, 0.3], dark: [0.42, 0.27, 0.18] },
  hair: { brown: [0.3, 0.19, 0.11], black: [0.08, 0.07, 0.07], blonde: [0.92, 0.76, 0.46], red: [0.55, 0.22, 0.1], grey: [0.6, 0.6, 0.6] },
  iris: { brown: [0.42, 0.25, 0.12], blue: [0.3, 0.52, 0.8], green: [0.33, 0.55, 0.32], hazel: [0.5, 0.42, 0.2] },
};

module.exports = { renderFace, LOOKS };
