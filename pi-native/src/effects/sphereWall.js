// Wall-mode counterpart to sphere.js ("Laser Grid"). This is the largest
// rewrite of the four Motion & Particles ports, so the reasoning gets a
// long comment.
//
// What sphere.js actually draws: a single vanishing-point "laser grid"
// perspective effect - a horizontal (or, once rotated by spinAngle,
// diagonal) scan-line bar sweeps back and forth, rays converge from the
// bar to a center point, a perspective grid fades in between them, all
// wrapped around the cube via cubePx()'s "unfolded net" coordinate space:
// col runs 0..4*SIZE across the 4 side faces (front/right/back/left in
// FW_FACES order) and v extends past [0,SIZE) by wrapping vertically onto
// the top face (v>=SIZE) or bottom face (v<0) with axis remaps for each of
// the 4 quadrants. None of that is "real" 3D ray-tracing through a sphere
// or scene - it's a 2D perspective-grid animation drawn into a wide virtual
// strip that cubePx happens to fold around a physical cube's 6 faces.
//
// A flat wall is exactly that same kind of 2D strip already, just without
// the fold. So rather than trying to preserve the face-wrap (which has no
// meaning on a single flat plane - there's no "top face" to wrap onto),
// this drops cubePx/setPx3d's whole wraparound branch and draws the same
// perspective-grid geometry directly in wallW x wallH pixel space: the
// vanishing point sits at the wall's own center, the scan bar spans the
// full canvas width (replacing cubePx's T=SIZE*4 "unfolded net" width with
// wallW), and anything that would have wrapped onto a top/bottom face
// (v < 0 or v >= wallH) is simply clipped at the canvas edge instead -
// same as how a real laser-grid visualizer clips at screen bounds rather
// than wrapping. This is judged the most faithful "same visual character,
// flat canvas" interpretation: every other routine in the state machine
// (expand/scan/spin/collapse/dblscan/pulse/colsweep/wave/flat-grid-overlay)
// is preserved verbatim, just re-scaled from SIZE to wallW/wallH so the
// geometry fills whatever wall size is configured.
const { hsl } = require('../core');

let _lgwScanT = 0, _lgwBaseAngle = 0, _lgwState = 'expand', _lgwStateT = 0;
let _lgwSpinTarget = 0, _lgwFlatT = -1;
let _lgwPulseT = -1, _lgwColSweepT = -1, _lgwWaveT = -1;
let _lgwDblScanT = -1, _lgwCollapsePhase = 0;
let _lgwRoutineIdx = 0;
let sphWallT = 0;

function effectSphereWall(core, dt) {
  core.t += dt; sphWallT += dt;
  const { wallW, wallH, wallBuf } = core;
  if (!wallW) return; // core.initWall() hasn't run yet (wall mode not active)
  for (let i = 0; i < wallBuf.length; i++) wallBuf[i] *= 0.75;
  const time = sphWallT;
  const cx = (wallW - 1) / 2, cy = (wallH - 1) / 2;
  const S = Math.min(wallW, wallH); // reference scale for radii/thresholds that were SIZE-relative
  const nHLines = 8;

  const hp = time * 0.15;
  const flicker = 0.92 + 0.08 * Math.sin(time * 47.3) * Math.sin(time * 31.7);
  let hpOff = 0;
  if (_lgwColSweepT >= 0) {
    _lgwColSweepT += dt;
    const sweepDur = 4.0;
    if (_lgwColSweepT >= sweepDur) _lgwColSweepT = -1;
    else hpOff = _lgwColSweepT * 2.5;
  }
  const hpFinal = hp + hpOff;
  let pulseMul = 1;
  if (_lgwPulseT >= 0) {
    _lgwPulseT += dt;
    const pulseDur = 5.0;
    if (_lgwPulseT >= pulseDur) _lgwPulseT = -1;
    else pulseMul = 0.4 + 0.6 * Math.abs(Math.sin(_lgwPulseT * Math.PI * 2.5));
  }
  const cR = (0.15 + 0.85 * Math.max(0, Math.sin(hpFinal))) * flicker * pulseMul;
  const cG = (0.3 + 0.7 * Math.max(0, Math.sin(hpFinal + 2.094))) * flicker * pulseMul;
  const cB = (0.1 + 0.9 * Math.max(0, Math.sin(hpFinal + 4.189))) * flicker * pulseMul;

  let waveOffset = 0;
  if (_lgwWaveT >= 0) {
    _lgwWaveT += dt;
    const waveDur = 5.0;
    if (_lgwWaveT >= waveDur) _lgwWaveT = -1;
    else waveOffset = _lgwWaveT;
  }

  // State machine (unchanged from sphere.js, just SIZE -> S)
  _lgwStateT += dt;
  const expandDur = 2.0, scanPeriod = 3.0, spinDur = 1.5;
  const collapseDur = 1.2, reExpandDur = 1.5;
  let expandEase = 1, scanV = cy, spinAngle = _lgwBaseAngle;
  let scanV2 = -1;

  if (_lgwState === 'expand') {
    const p = Math.min(_lgwStateT / expandDur, 1);
    expandEase = p * p;
    _lgwScanT += dt;
    const sp = (_lgwScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
    scanV = Math.max(0, Math.min(wallH - 1, scanV));
    if (p >= 1) { _lgwState = 'scan'; _lgwStateT = 0; }
  }

  if (_lgwState === 'scan') {
    _lgwScanT += dt;
    const sp = (_lgwScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    scanV = cy + (raw - 0.5) * 2 * (S - 1) / 2;
    scanV = Math.max(0, Math.min(wallH - 1, scanV));
    if (_lgwDblScanT >= 0) {
      _lgwDblScanT += dt;
      const dblDur = 6.0;
      if (_lgwDblScanT >= dblDur) _lgwDblScanT = -1;
      else {
        const sp2 = ((_lgwScanT + scanPeriod / 2) % scanPeriod) / scanPeriod;
        const raw2 = sp2 < 0.5 ? sp2 * 2 : 2 - sp2 * 2;
        scanV2 = cy + (raw2 - 0.5) * 2 * (S - 1) / 2;
        scanV2 = Math.max(0, Math.min(wallH - 1, scanV2));
      }
    }
    if (_lgwStateT > 6.0 && Math.abs(scanV - cy) < 2) {
      const routines = ['spin', 'collapse', 'dblscan', 'pulse', 'colsweep', 'wave', 'flat', 'spin'];
      const pick = routines[_lgwRoutineIdx % routines.length];
      _lgwRoutineIdx++;
      if (pick === 'spin') {
        _lgwState = 'spin';
        _lgwStateT = 0;
        _lgwSpinTarget = ((_lgwScanT * 7 | 0) % 3 === 0) ? Math.PI / 2 : Math.PI * 2;
        scanV = cy;
      } else if (pick === 'collapse') {
        _lgwState = 'collapse';
        _lgwStateT = 0;
        _lgwCollapsePhase = 0;
      } else if (pick === 'dblscan') {
        _lgwDblScanT = 0;
        _lgwStateT = 0;
      } else if (pick === 'pulse') {
        _lgwPulseT = 0;
        _lgwStateT = 0;
      } else if (pick === 'colsweep') {
        _lgwColSweepT = 0;
        _lgwStateT = 0;
      } else if (pick === 'wave') {
        _lgwWaveT = 0;
        _lgwStateT = 0;
      } else if (pick === 'flat') {
        _lgwFlatT = 0;
        _lgwStateT = 0;
      }
    }
  }

  if (_lgwState === 'spin') {
    scanV = cy;
    const p = Math.min(_lgwStateT / spinDur, 1);
    const ease = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    spinAngle = _lgwBaseAngle + ease * _lgwSpinTarget;
    if (p >= 1) {
      _lgwBaseAngle = _lgwBaseAngle + _lgwSpinTarget;
      while (_lgwBaseAngle > Math.PI * 2) _lgwBaseAngle -= Math.PI * 2;
      _lgwState = 'scan';
      _lgwStateT = 0;
    }
  }

  if (_lgwState === 'collapse') {
    _lgwScanT += dt;
    const sp = (_lgwScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    if (_lgwCollapsePhase === 0) {
      const p = Math.min(_lgwStateT / collapseDur, 1);
      expandEase = 1 - p * p;
      scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
      scanV = Math.max(0, Math.min(wallH - 1, scanV));
      if (p >= 1) { _lgwCollapsePhase = 1; _lgwStateT = 0; }
    } else {
      const p = Math.min(_lgwStateT / reExpandDur, 1);
      expandEase = p * p;
      scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
      scanV = Math.max(0, Math.min(wallH - 1, scanV));
      if (p >= 1) { _lgwState = 'scan'; _lgwStateT = 0; }
    }
  }

  // Flat grid overlay timer (runs independently)
  const flatSweepDur = 2.0, flatHoldDur = 2.5, flatFadeDur = 1.5;
  const flatTotalDur = flatSweepDur + flatHoldDur + flatFadeDur;
  if (_lgwFlatT >= 0) {
    _lgwFlatT += dt;
    if (_lgwFlatT >= flatTotalDur) _lgwFlatT = -1;
  }

  const cosA = Math.cos(spinAngle), sinA = Math.sin(spinAngle);

  // Flat wall: no faces to wrap onto, so setPx2d is just a clamped direct
  // write into wallW x wallH space (cubePx's wraparound branch is dropped
  // entirely - see module comment).
  const ccx = cx;
  function setPx2d(x, y, r, g, b) {
    if (x < 0 || x >= wallW || y < 0 || y >= wallH) return;
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= wallW || yi < 0 || yi >= wallH) return;
    const o = (yi * wallW + xi) * 3;
    if (r > wallBuf[o]) wallBuf[o] = r;
    if (g > wallBuf[o + 1]) wallBuf[o + 1] = g;
    if (b > wallBuf[o + 2]) wallBuf[o + 2] = b;
  }
  function drawLine2d(x0, y0, x1, y1, bright) {
    const ldx = x1 - x0, ldy = y1 - y0;
    const ls = Math.max(Math.abs(ldx), Math.abs(ldy), 1) | 0;
    for (let i = 0; i <= ls; i++) {
      const ft = i / ls;
      const x = x0 + ldx * ft, y = y0 + ldy * ft;
      setPx2d(x, y, cR * bright, cG * bright, cB * bright);
    }
  }

  // Scan bar spans the full wall width (replacing cubePx's T=SIZE*4
  // "unfolded net" width - see module comment), rotated by spinAngle
  // around the vanishing point.
  const barHalfU = cosA * (wallW / 2);
  const barHalfV = sinA * (wallH / 2);
  const scanCU = ccx;
  const scanCV = scanV;
  const sl0U = scanCU + barHalfU, sl0V = scanCV + barHalfV;
  const sl1U = scanCU - barHalfU, sl1V = scanCV - barHalfV;

  const slB = 0.9 * expandEase;
  const normU = -sinA, normV = cosA;
  drawLine2d(sl0U, sl0V, sl1U, sl1V, slB);
  for (let dv = -3; dv <= 3; dv++) {
    if (dv === 0) continue;
    const gb = (1 - Math.abs(dv) / 4) * 0.18 * expandEase;
    drawLine2d(sl0U + normU * dv, sl0V + normV * dv, sl1U + normU * dv, sl1V + normV * dv, gb);
  }

  if (scanV2 >= 0) {
    const s2CV = scanV2;
    const s2U0 = ccx + barHalfU, s2V0 = s2CV + barHalfV;
    const s2U1 = ccx - barHalfU, s2V1 = s2CV - barHalfV;
    drawLine2d(s2U0, s2V0, s2U1, s2V1, slB * 0.7);
    for (let dv = -2; dv <= 2; dv++) {
      if (dv === 0) continue;
      const gb = (1 - Math.abs(dv) / 3) * 0.12 * expandEase;
      drawLine2d(s2U0 + normU * dv, s2V0 + normV * dv, s2U1 + normU * dv, s2V1 + normV * dv, gb);
    }
  }

  const nRays = 6;
  for (let ri = 0; ri < nRays; ri++) {
    const frac = ri / (nRays - 1);
    const tU = sl0U + (sl1U - sl0U) * frac;
    const tV = sl0V + (sl1V - sl0V) * frac;
    const endU = ccx + (tU - ccx) * expandEase;
    const endV = cy + (tV - cy) * expandEase;
    const dx = endU - ccx, dy = endV - cy;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1) | 0;
    if (steps < 2) continue;
    for (let s = 0; s <= steps; s++) {
      const ft = s / steps;
      const x = ccx + dx * ft;
      const y = cy + dy * ft;
      const b = 0.2 + 0.6 * ft;
      setPx2d(x, y, cR * b, cG * b, cB * b);
    }
  }

  if (expandEase > 0.3) {
    const gridB = 0.25 * (expandEase - 0.3) / 0.7;
    for (let hi = 1; hi <= nHLines; hi++) {
      const frac = hi / (nHLines + 1);
      let pFrac = frac * frac;
      if (waveOffset > 0) {
        const wAmp = 0.15 * Math.sin(waveOffset * 3 - hi * 0.8);
        pFrac = Math.max(0.01, Math.min(0.99, pFrac + wAmp));
      }
      for (let ri = 0; ri < nRays - 1; ri++) {
        const fA = ri / (nRays - 1), fB = (ri + 1) / (nRays - 1);
        const aU = sl0U + (sl1U - sl0U) * fA, aV = sl0V + (sl1V - sl0V) * fA;
        const bU = sl0U + (sl1U - sl0U) * fB, bV = sl0V + (sl1V - sl0V) * fB;
        const eaU = ccx + (aU - ccx) * expandEase, eaV = cy + (aV - cy) * expandEase;
        const ebU = ccx + (bU - ccx) * expandEase, ebV = cy + (bV - cy) * expandEase;
        const guA = ccx + (eaU - ccx) * pFrac, gvA = cy + (eaV - cy) * pFrac;
        const guB = ccx + (ebU - ccx) * pFrac, gvB = cy + (ebV - cy) * pFrac;
        drawLine2d(guA, gvA, guB, gvB, gridB);
      }
    }
  }

  // Center dot glow
  for (let dv = -2; dv <= 2; dv++) for (let du = -2; du <= 2; du++) {
    const y = Math.round(cy) + dv;
    if (y < 0 || y >= wallH) continue;
    const r = Math.sqrt(du * du + dv * dv);
    const b = Math.max(0, 1 - r / 2.5) * 0.7;
    setPx2d(ccx + du, y, b, b * 0.95, b);
  }

  // Bright dots where rays meet scan line
  for (let ri = 0; ri < nRays; ri++) {
    const frac = ri / (nRays - 1);
    const tU = sl0U + (sl1U - sl0U) * frac;
    const tV = sl0V + (sl1V - sl0V) * frac;
    const eu = Math.round(ccx + (tU - ccx) * expandEase);
    const ev = Math.round(cy + (tV - cy) * expandEase);
    for (let ddv = -1; ddv <= 1; ddv++) for (let ddu = -1; ddu <= 1; ddu++) {
      const y = ev + ddv;
      if (y < 0 || y >= wallH) continue;
      const r = Math.sqrt(ddu * ddu + ddv * ddv);
      const b = Math.max(0, 1 - r / 1.5) * 0.8 * expandEase;
      setPx2d(eu + ddu, y, cR * b, cG * b, cB * b);
    }
  }

  // Flat 2D grid overlay (spans the entire wall width)
  if (_lgwFlatT >= 0 && _lgwFlatT < flatTotalDur) {
    const gridSpacing = Math.max(1, Math.round(S / 8));
    let flatAlpha = 0, reach = 0;
    if (_lgwFlatT < flatSweepDur) {
      reach = _lgwFlatT / flatSweepDur;
      flatAlpha = 0.4;
    } else if (_lgwFlatT < flatSweepDur + flatHoldDur) {
      reach = 1;
      flatAlpha = 0.4;
    } else {
      reach = 1;
      flatAlpha = 0.4 * (1 - (_lgwFlatT - flatSweepDur - flatHoldDur) / flatFadeDur);
    }
    const maxDist = Math.round(reach * (S / 2));
    for (let gi = 1; gi < wallH / gridSpacing; gi++) {
      const gv = gi * gridSpacing; if (gv >= wallH) continue;
      if (Math.abs(gv - Math.round(cy)) > maxDist) continue;
      for (let x = 0; x < wallW; x++) setPx2d(x, gv, cR * flatAlpha, cG * flatAlpha, cB * flatAlpha);
    }
    for (let gi = 0; gi < wallW / gridSpacing; gi++) {
      const gu = gi * gridSpacing;
      for (let y = 0; y < wallH; y++) {
        if (Math.abs(y - Math.round(cy)) > maxDist) continue;
        setPx2d(gu, y, cR * flatAlpha, cG * flatAlpha, cB * flatAlpha);
      }
    }
    if (_lgwFlatT < flatSweepDur) {
      const sw1 = Math.round(cy - maxDist), sw2 = Math.round(cy + maxDist);
      for (let x = 0; x < wallW; x++) {
        if (sw1 >= 0 && sw1 < wallH) setPx2d(x, sw1, cR * 0.8, cG * 0.8, cB * 0.8);
        if (sw2 >= 0 && sw2 < wallH) setPx2d(x, sw2, cR * 0.8, cG * 0.8, cB * 0.8);
      }
    }
  }
}

module.exports = effectSphereWall;
