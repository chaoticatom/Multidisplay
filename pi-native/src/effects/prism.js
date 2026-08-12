// Ported verbatim (math unchanged) from effects-colour.js's effectPrism().
const { hsl, sm } = require('../core');

function effectPrism(core, dt) {
  core.t += dt * 0.55;
  const { N, surfX, surfY, surfZ, t } = core;
  const beamAng = t * 0.6, beamW = 0.18;
  for (let i = 0; i < N; i++) {
    const x = surfX[i], y = surfY[i], z = surfZ[i];
    const diag = (x + y + z) / 3;
    const cross = Math.abs(x - z);
    const base = 0.28 + Math.sin(diag * Math.PI * 5.5 + t) * 0.28;
    const hue = (diag * 0.92 + t * 0.065) % 1;
    let [r, g, b] = hsl(hue, 0.78 + sm(0, 1, cross) * 0.22, Math.max(0, base));
    // sweeping white diamond beam that disperses into rainbow
    const bDist = Math.abs(((x - 0.5) * Math.cos(beamAng) + (z - 0.5) * Math.sin(beamAng)));
    const beam = Math.max(0, 1 - bDist / beamW) * 0.8;
    if (beam > 0) {
      const dispHue = (hue + bDist * 1.5) % 1;
      const [dr, dg, db] = hsl(dispHue, 1, beam * 0.9);
      r = Math.min(1, r + dr * beam + beam * 0.3);
      g = Math.min(1, g + dg * beam + beam * 0.3);
      b = Math.min(1, b + db * beam + beam * 0.3);
    }
    core.setLED(i, r, g, b);
  }
}

module.exports = effectPrism;
