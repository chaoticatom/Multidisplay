// A realistic human face, drawn per pixel with soft lighting.
//   renderFace(out, w, h, pose, look)  - writes RGB 0..1 into out (w*h*3)
//   pose: { yaw, tilt, bob, blink 0..1, gazeX, gazeY, brow, mouthOpen 0..1,
//           mouthWide -1..1 (round .. wide), smile 0..1, squint 0..1 }
//   look: { style 'man'|'woman', skin, hair, iris, shirt, bg } colours [r,g,b]
// Lighting: a warm key light from the upper left and a cool, softer fill from
// the right; shadows on skin turn a little redder (light scattering under the
// skin); soft shading round the eyes, under the nose and lip and under the
// jaw; a gentle sheen on forehead, nose and cheekbones; faint skin texture.
// Hair is shaded strand by strand along its flow, darker at the roots, with
// a band of shine, stray wisps and a rim of backlight; the hairline blends
// into the skin and casts a soft shadow on the forehead.
// Face space: u left-right, v top-bottom (-1..1), the face about 80% of the
// height; one sample per pixel. Used by talkingFace.js.
'use strict';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sm = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const mul = (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

// Signed distance to an ellipse (approximate): < 0 inside.
function ell(x, y, cx, cy, rx, ry) { const dx = (x - cx) / rx, dy = (y - cy) / ry; return (Math.sqrt(dx * dx + dy * dy) - 1) * Math.min(rx, ry); }
// Smooth 1D/2D value noise from an integer hash (fast, no sin()).
function h1(i) { let h = Math.imul(i | 0, 374761393); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function n1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) + (h1(i + 1) - h1(i)) * u; }
function n2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
  const a = h1(xi * 57 + yi * 131), b = h1((xi + 1) * 57 + yi * 131), c = h1(xi * 57 + (yi + 1) * 131), d = h1((xi + 1) * 57 + (yi + 1) * 131);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}

const KEY = [1.0, 0.95, 0.87], FILL = [0.62, 0.7, 0.9]; // warm key, cool fill
const RIM = [0.55, 0.6, 0.75]; // backlight on hair edges

// Hair colour at a point: strands run along `flow` (an angle); `t` is 0 at
// the roots, 1 at the tips; `edge` (0..1) adds rim light.
function hairShade(base, u, v, flow, t, edge, seed) {
  const px = -Math.sin(flow), py = Math.cos(flow); // across the strands
  const across = (u * px + v * py), along = (u * Math.cos(flow) + v * Math.sin(flow));
  // Clumps of hair (coarse enough to read at 64 px) with finer strands in them.
  const clump = n1(across * 24 + seed + 1.5 * n1(along * 4 + seed));
  const fine = n1(across * 70 + seed * 2);
  const strand = 0.55 + 0.45 * clump + 0.15 * (fine - 0.5);
  const depth = 0.45 + 0.55 * t; // roots darker
  const lit = 0.58 + 0.7 * clamp(-u * 0.7 - v * 0.45 + 0.25); // brighter on the light's side
  const sheen = 0.3 * clump * sm(0.16, 0, Math.abs(v + 0.36 - u * 0.15 + 0.08 * Math.sin(u * 4))) * clamp(-u * 0.6 + 0.6);
  // Shadows in hair go warmer and richer rather than grey.
  const k = depth * strand * lit, warm = clamp(1 - k);
  const c = [base[0] * k * (1 + 0.12 * warm), base[1] * k * (1 - 0.04 * warm), base[2] * k * (1 - 0.22 * warm)];
  return [c[0] + sheen * 0.6 + edge * RIM[0] * 0.12, c[1] + sheen * 0.52 + edge * RIM[1] * 0.12, c[2] + sheen * 0.4 + edge * RIM[2] * 0.12];
}

function shade(u, v, p, L) {
  const woman = L.style === 'woman';
  // Background: dark, warm in the middle, a soft halo behind the head.
  let col = scale(L.bg, 1.1 - 0.5 * clamp(Math.hypot(u * 0.7, v * 0.55)));
  col = [col[0] + 0.05 * RIM[0] * sm(1.3, 0.5, Math.hypot(u * 0.8, v * 0.7 + 0.15)), col[1] + 0.05 * RIM[1] * sm(1.3, 0.5, Math.hypot(u * 0.8, v * 0.7 + 0.15)), col[2] + 0.05 * RIM[2] * sm(1.3, 0.5, Math.hypot(u * 0.8, v * 0.7 + 0.15))];

  // Shoulders and top, lit from the left, with a soft shadow from the head.
  const shoulder = v - (0.93 + 0.22 * u * u);
  if (shoulder > 0) {
    const folds = 0.92 + 0.08 * n1(u * 9 + v * 3);
    let shirt = scale(L.shirt, (0.55 + 0.35 * clamp(0.6 - u * 0.5)) * folds);
    shirt = scale(shirt, 1 - 0.35 * sm(0.35, 0, Math.abs(u)) * sm(0.2, 0, shoulder));
    col = mix(col, shirt, sm(0, 0.04, shoulder));
  }

  // Long hair behind (woman): falls past the shoulders in loose waves, with a
  // darker under-layer.
  if (woman) {
    const half = 0.78 + 0.05 * Math.sin(v * 4.5 + 0.5) - 0.12 * Math.max(0, v - 0.45);
    const long = Math.max(Math.abs(u) - half, v - (1.18 - 0.2 * (u / 0.8) * (u / 0.8) + 0.05 * Math.sin(u * 14)), -0.3 - v);
    if (long < 0.02) {
      const t = clamp((v + 0.3) / 1.4), flow = Math.PI / 2 + 0.25 * Math.sin(v * 4 + u * 3) * Math.sign(u);
      let hc = hairShade(L.hair, u, v, flow, 0.45 + 0.55 * t, sm(-0.06, 0, long), 11);
      hc = scale(hc, 0.6 + 0.4 * sm(0.5, 0.78, Math.abs(u))); // the inner layer, by the neck, is in shade
      col = mix(col, hc, sm(0.02, -0.02, long));
    }
  }

  // Neck: shaded, darker just under the jaw where the face casts a shadow.
  const neck = Math.max(Math.abs(u) - 0.26, 0.52 - v);
  if (neck < 0.01) {
    let nk = scale(L.skin, 0.62 + 0.22 * clamp(0.5 - u));
    nk = mul(nk, [1, 0.9, 0.86]);
    nk = scale(nk, 1 - 0.45 * sm(0.14, 0, v - 0.6));
    col = mix(col, nk, sm(0.01, -0.02, neck));
  }

  // Hair behind the head (the crown).
  const crown = woman ? ell(u, v, 0, -0.2, 0.8, 0.86) : ell(u, v, 0, -0.3, 0.68, 0.68) + 0.015 * (n1(Math.atan2(v + 0.3, u) * 9) - 0.5); // a slightly uneven outline
  if (crown < 0.02) {
    const ang = Math.atan2(v + 0.25, u);
    col = mix(col, hairShade(L.hair, u, v, ang + Math.PI / 2, 0.5, sm(-0.08, 0, crown), 3), sm(0.02, -0.02, crown));
  }

  // Ears (a man's; hidden by a woman's hair).
  if (!woman) for (const s of [-1, 1]) {
    const e = ell(u, v, s * 0.62, 0.03, 0.095, 0.16);
    if (e < 0.01) {
      let ec = scale(mul(L.skin, [1, 0.86, 0.8]), 0.66 - 0.12 * clamp(s * 0.5 + 0.5));
      ec = scale(ec, 1 - 0.3 * sm(0.06, 0, Math.hypot(u - s * 0.63, v - 0.04))); // inner ear
      col = mix(col, ec, sm(0.01, -0.015, e));
    }
  }

  // Face shape: an egg, narrower and softer at the jaw on a woman.
  const jaw = woman ? (v > 0 ? 0.57 - v * 0.22 : 0.57) : (v > 0 ? 0.6 - v * 0.15 : 0.6);
  const face = ell(u, v, 0, 0.02, jaw, 0.8);
  if (face > 0.02) return col;

  // --- Skin lighting ---
  const nx = u / 0.64, ny = (v - 0.02) / 0.86, nz = Math.sqrt(clamp(1 - nx * nx * 0.8 - ny * ny * 0.7, 0.04));
  const key = clamp(-nx * 0.45 - ny * 0.32 + nz * 0.83), fill = clamp(nx * 0.55 - ny * 0.1 + nz * 0.7);
  // Shadowed skin turns warmer/redder (light scattering under the skin).
  const sss = [1, 0.78, 0.7];
  let skin = mul(L.skin, mix(sss, [1, 1, 1], key));
  skin = [skin[0] * (key * KEY[0] * 0.95 + fill * FILL[0] * 0.3 + 0.12), skin[1] * (key * KEY[1] * 0.95 + fill * FILL[1] * 0.3 + 0.11), skin[2] * (key * KEY[2] * 0.95 + fill * FILL[2] * 0.3 + 0.12)];
  skin = scale(skin, 0.97 + 0.06 * (n2(u * 22, v * 22) - 0.5)); // faint texture
  // Colour in the cheeks, nose and chin; more on a woman, and with a smile.
  const blush = Math.max(sm(0.24, 0, Math.hypot(Math.abs(u) - 0.3, v - 0.17)), 0.5 * sm(0.1, 0, Math.hypot(u, v - 0.17)), 0.35 * sm(0.13, 0, Math.hypot(u, v - 0.66)));
  skin = mix(skin, mul(skin, [1.1, 0.8, 0.8]), blush * ((woman ? 0.7 : 0.45) + 0.25 * p.smile));
  // Soft shading: round the edge of the face, the eye sockets, the temples.
  skin = scale(skin, 1 - 0.38 * sm(-0.14, 0.02, face));
  for (const s of [-1, 1]) {
    skin = scale(skin, 1 - 0.22 * sm(1.25, 0.35, Math.hypot((u - s * 0.24) / 0.2, (v + 0.08) / 0.13)));
    skin = scale(skin, 1 - 0.12 * sm(0.18, 0, Math.hypot(u - s * 0.5, v + 0.25)));
  }
  // Cheekbones lift a little with a smile.
  for (const s of [-1, 1]) skin = scale(skin, 1 + 0.06 * p.smile * sm(0.15, 0, Math.hypot(u - s * 0.3, v - 0.1)));

  // Nose: lit bridge, shadow on the side away from the light, nostril wings,
  // a shadow underneath and a bright tip.
  if (v > -0.15 && v < 0.32) {
    skin = scale(skin, 1 + 0.12 * sm(0.045, 0, Math.abs(u + 0.015)) * sm(-0.15, -0.05, v) * sm(0.24, 0.16, v));
    skin = mul(skin, mix([1, 1, 1], [0.78, 0.68, 0.66], sm(0.07, 0.02, Math.abs(u - 0.07)) * sm(-0.1, 0.05, v) * sm(0.3, 0.22, v)));
    for (const s of [-1, 1]) skin = scale(skin, 1 - 0.18 * sm(0.05, 0.015, Math.hypot(u - s * 0.075, (v - 0.21) * 1.2)));
    for (const s of [-1, 1]) skin = mix(skin, mul(L.skin, [0.32, 0.2, 0.18]), 0.85 * sm(0.03, 0.008, Math.hypot(u - s * 0.045, (v - 0.245) * 1.8)));
    skin = scale(skin, 1 + 0.16 * sm(0.05, 0, Math.hypot(u + 0.012, v - 0.19)));
  }
  skin = scale(skin, 1 - 0.2 * sm(0.12, 0, Math.hypot(u, (v - 0.29) * 1.7))); // under the nose
  skin = scale(skin, 1 - 0.18 * sm(0.1, 0, Math.hypot(u, (v - 0.56) * 2.2))); // under the lower lip
  // Sheen: forehead, nose tip, cheekbone on the lit side.
  const gloss = 0.1 * sm(0.18, 0, Math.hypot(u + 0.12, v + 0.42)) + 0.12 * sm(0.04, 0, Math.hypot(u + 0.015, v - 0.18)) + 0.07 * sm(0.1, 0, Math.hypot(u + 0.3, v - 0.07));
  skin = [skin[0] + gloss * KEY[0] * key, skin[1] + gloss * KEY[1] * key, skin[2] + gloss * KEY[2] * key];
  col = mix(col, skin, sm(0.02, -0.015, face));

  // Hair in front.
  if (woman) {
    // A side-swept fringe and long curtains framing the face.
    const fringe = v - (-0.42 + 0.1 * Math.sin((u + 0.3) * 2.3) + 0.12 * u + 0.025 * n1(u * 25));
    const top = Math.max(fringe, ell(u, v, 0, -0.22, 0.7, 0.74));
    const curtains = [-1, 1].map((s) => ell(u, v, s * 0.6, 0.15, 0.1 + 0.02 * Math.sin(v * 6), 0.66));
    const front = Math.min(top, curtains[0], curtains[1]);
    if (front < 0.02) {
      const flow = front === top ? -0.35 + 0.6 * clamp(u + 0.2) : Math.PI / 2 + 0.2 * Math.sin(v * 5);
      const t = front === top ? clamp((u + 0.6) / 1.2) : clamp((v + 0.3) / 1.2);
      let hc = hairShade(L.hair, u, v, flow, 0.4 + 0.6 * t, sm(-0.05, 0, front) * 0.6, 21);
      if (front !== top) hc = scale(hc, 0.75 + 0.25 * sm(0.48, 0.66, Math.abs(u))); // curtains darker beside the cheeks
      col = mix(col, hc, sm(0.02, -0.02, front));
    }
    // Shadow of the fringe on the forehead.
    if (front >= 0.02 && face < 0) col = scale(col, 1 - 0.25 * sm(0.07, 0.02, front));
  } else {
    // Short hair with a side parting; the hairline is soft, with a little
    // texture, and sits above the temples.
    const line = -0.47 + 0.1 * u * u + 0.08 * sm(0.3, 0.55, Math.abs(u)) - 0.04 * sm(0.25, 0, Math.abs(u - 0.12)) + 0.03 * (n1(u * 26) - 0.5); // receding a touch at the temples, a soft forelock
    const top = Math.max(v - line, ell(u, v, 0, -0.3, 0.66, 0.6));
    if (top < 0.02) {
      const part = -0.22, flow = u < part ? Math.PI * 0.85 : -0.25 + 0.3 * clamp((u - part) * 2);
      col = mix(col, hairShade(L.hair, u, v, flow, clamp(0.35 + Math.abs(u - part)), sm(-0.06, 0, top) * 0.5, 31), sm(0.02, -0.025, top));
    }
    if (top >= 0.02 && face < 0) col = scale(col, 1 - 0.2 * sm(0.06, 0.015, top));
    // Short sideburns.
    for (const s of [-1, 1]) {
      const sb = ell(u, v, s * 0.565, -0.16, 0.06, 0.2);
      if (sb < 0.01) col = mix(col, hairShade(L.hair, u, v, Math.PI / 2, 0.5, 0, 41), sm(0.01, -0.02, sb) * 0.9);
    }
  }
  // A few stray wisps over the hair edge.
  if (v > -0.8 && v < -0.4) for (let k = 0; k < 3; k++) {
    const wx = -0.5 + k * 0.45 + 0.05 * Math.sin(v * 9 + k), wy = (woman ? -0.62 : -0.55) + 0.12 * k % 0.2;
    const d = Math.abs(u - wx - 0.08 * Math.sin(v * 12 + k * 2)) - 0.006;
    if (d < 0.004 && Math.abs(v - wy) < 0.12) col = mix(col, scale(L.hair, 1.1), 0.35);
  }

  // Eyebrows: tapered, made of short strokes; finer and more arched on a woman.
  // (Each feature below is only worked out inside its own small area.)
  if (v > -0.38 && v < -0.12 && Math.abs(u) < 0.42) for (const s of [-1, 1]) {
    const bx = u - s * 0.24, rel = clamp((s * bx + 0.13) / 0.26); // 0 inner .. 1 outer
    const arch = woman ? 0.04 * Math.sin(rel * Math.PI) : 0.02 * Math.sin(rel * Math.PI);
    const by = v - (-0.24 - p.brow * 0.05 - arch + 0.01 * rel);
    const thick = (woman ? 0.015 : 0.024) * (1 - 0.55 * rel);
    const d = Math.max(Math.abs(bx) - 0.13, Math.abs(by) - thick);
    if (d < 0.01) {
      const strokes = 0.75 + 0.25 * n1(bx * 140 + s * 3);
      const bc = scale(woman ? mix(L.hair, [0.32, 0.22, 0.14], 0.55) : mix(L.hair, [0.12, 0.09, 0.07], 0.35), 0.75 * strokes);
      col = mix(col, bc, sm(0.01, -0.006, d) * 0.92);
    }
  }

  // Eyes.
  if (v > -0.2 && v < 0.04 && Math.abs(u) < 0.4) for (const s of [-1, 1]) {
    const ex = u - s * 0.24, ey = v + 0.08;
    const open = clamp(1 - p.blink) * (1 - 0.6 * p.squint);
    const hw = 0.115, hh = 0.056 * open + 0.002, q = 1 - (ex / hw) * (ex / hw);
    const top = -hh * q, bot = hh * 0.78 * q;
    // Upper lid crease (a soft line above the eye) and a faint lower lid line.
    if (Math.abs(ex) < hw * 1.05) {
      col = scale(col, 1 - 0.18 * sm(0.014, 0, Math.abs(ey - (-0.075 * Math.sqrt(clamp(q)) - 0.012))));
      col = scale(col, 1 - 0.1 * sm(0.01, 0, Math.abs(ey - (bot + 0.012))));
    }
    if (Math.abs(ex) < hw && ey > top && ey < bot) {
      let e = mix([0.95, 0.9, 0.86], [0.85, 0.62, 0.6], sm(0.6, 1, Math.abs(ex) / hw) * 0.6); // pinker in the corners
      e = scale(e, 0.66 + 0.34 * sm(top, top + hh * 1.2, ey)); // the upper lid's shadow
      const ix = ex - p.gazeX * 0.04, iy = ey - p.gazeY * 0.02, ir = Math.hypot(ix, iy * 1.1);
      if (ir < 0.052) {
        const rays = 0.85 + 0.3 * (n1(Math.atan2(iy, ix) * 9 + s * 5) - 0.5);
        let iris = scale(L.iris, rays * (0.75 + 0.35 * sm(0.05, 0.02, ir)));
        iris = mix(iris, scale(L.iris, 0.35), sm(0.038, 0.05, ir)); // dark outer ring
        iris = mix(iris, [0.02, 0.015, 0.015], sm(0.022, 0.014, ir)); // pupil
        e = mix(e, iris, sm(0.052, 0.045, ir));
      }
      if (Math.hypot(ix + 0.016, iy + 0.016) < 0.011) e = mix(e, [1, 1, 1], 0.92); // catch-light
      col = e;
    }
    // Lashes along the upper lid (thicker on a woman), a closed lid when blinking.
    const lash = (woman ? 0.017 : 0.011);
    if (Math.abs(ey - top) < lash && Math.abs(ex) < hw * 1.04) col = mix(col, [0.1, 0.07, 0.06], woman ? 0.92 : 0.8);
    if (woman && s * ex > hw * 0.85 && s * ex < hw * 1.15 && Math.abs(ey - (top - (s * ex - hw * 0.85) * 0.5)) < 0.008) col = mix(col, [0.12, 0.07, 0.07], 0.6);
    if (Math.abs(ex) < hw && ey < top && ey > top - 0.05 && open < 0.25) col = mix(col, scale(L.skin, 0.72), 0.55);
  }

  // Mouth: a cupid's bow on the top lip, lighter lower lip with a highlight,
  // a dark line between them; inside (teeth, tongue) when open.
  if (v > 0.3 && v < 0.62 && Math.abs(u) < 0.3) {
    const wide = 0.15 * (1 + 0.25 * p.mouthWide) + 0.04 * p.smile, open = p.mouthOpen;
    const mx = u, my = v - 0.43, t = clamp(1 - (mx / wide) * (mx / wide));
    const curve = -p.smile * 0.065 * (mx / wide) * (mx / wide); // corners lift with the smile
    const gapTop = -0.006 - open * 0.055 * t + curve, gapBot = 0.006 + open * 0.1 * t + curve;
    const full = woman ? 1.3 : 1;
    const bow = 0.012 * sm(0.05, 0, Math.abs(Math.abs(mx) - 0.035)); // two peaks on the top lip
    const upTop = gapTop - 0.035 * full * Math.sqrt(t) - bow, lowBot = gapBot + 0.046 * full * Math.sqrt(t);
    if (Math.abs(mx) < wide && my > upTop - 0.01 && my < lowBot + 0.01) {
      const lipBase = woman ? [0.84, 0.36, 0.44] : mix([0.72, 0.38, 0.36], L.skin, 0.3);
      if (my > gapTop && my < gapBot && open > 0.05) {
        let inner = [0.2, 0.05, 0.06];
        if (my > gapBot - 0.025 * open) inner = [0.55, 0.22, 0.26]; // tongue
        if (my < gapTop + 0.022 * open + 0.008) inner = scale([0.88, 0.85, 0.78], 0.85 + 0.15 * (1 - Math.abs(mx) / wide)); // top teeth
        col = inner;
      } else if (my > upTop && my < lowBot) {
        const upper = my < gapTop;
        let lc = scale(lipBase, upper ? 0.72 : 1.0);
        if (!upper) lc = [lc[0] + 0.12 * sm(0.02, 0, Math.hypot(mx + 0.03, my - (gapBot + 0.018))), lc[1] + 0.08 * sm(0.02, 0, Math.hypot(mx + 0.03, my - (gapBot + 0.018))), lc[2] + 0.08 * sm(0.02, 0, Math.hypot(mx + 0.03, my - (gapBot + 0.018)))];
        lc = mix(lc, col, sm(0.008, -0.004, Math.min(my - upTop, lowBot - my)) * 0.5 + 0.5 * sm(wide * 0.75, wide, Math.abs(mx))); // soft edges
        if (Math.abs(my - (gapTop + gapBot) / 2) < 0.005 && open <= 0.05) lc = scale(lc, 0.55); // the line between the lips
        col = lc;
      }
    }
    for (const s of [-1, 1]) col = scale(col, 1 - 0.28 * sm(0.03, 0, Math.hypot(mx - s * wide, my - curve))); // corners
  }
  return col;
}

function renderFace(out, w, h, pose, look) {
  const size = Math.min(w, h), ox = (w - size) / 2, oy = (h - size) / 2;
  const ca = Math.cos(pose.tilt), sa = Math.sin(pose.tilt);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // One sample per pixel (each LED is a dot anyway); the shapes have soft
    // edges built in. Screen -> face space (face 80% of the height), with
    // head turn/tilt/bob.
    let u = ((x + 0.5 - ox) / size - 0.5) * 2.5, v = ((y + 0.5 - oy) / size - 0.5) * 2.5 - pose.bob;
    const ru = u * ca + v * sa, rv = -u * sa + v * ca;
    u = ru - pose.yaw * (1 - rv * rv * 0.3); v = rv;
    const c = shade(u, v, pose, look), o = (y * w + x) * 3;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
  }
}

const LOOKS = {
  skin: { light: [0.96, 0.76, 0.64], medium: [0.84, 0.6, 0.45], tan: [0.72, 0.49, 0.34], dark: [0.46, 0.3, 0.21] },
  hair: { brown: [0.36, 0.23, 0.14], black: [0.17, 0.14, 0.13], blonde: [1.0, 0.8, 0.46], red: [0.62, 0.26, 0.12], grey: [0.66, 0.66, 0.66] },
  iris: { brown: [0.45, 0.28, 0.14], blue: [0.32, 0.55, 0.85], green: [0.36, 0.6, 0.36], hazel: [0.55, 0.45, 0.22] },
};

module.exports = { renderFace, LOOKS };
