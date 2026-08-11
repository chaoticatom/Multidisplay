// Ported verbatim (math unchanged) from effects-motion.js's effectSphere()
// ("Laser Grid" in the sidebar). Uses cubePx() from ./_shared.js
// (effects-core.js's shared (col,v)->LED-index helper).
//
// One deliberate scope cut: the browser has two render paths gated on
// `panel2dMode` - a browser-only "view the cube unfolded flat" toggle with
// no equivalent hardware mode here (not to be confused with pi-native's
// own 2d/cube panel-count config, which is a different thing entirely).
// panel2dMode is always false/undefined without that missing UI, so only
// the else-branch (the real 3D cube wrap, via cubePx) is reachable - the
// panel2dMode-true branch was ported-but-dead code, so it's cut rather
// than carried across.
const { cubePx } = require('./_shared');

let _lgScanT = 0, _lgBaseAngle = 0, _lgState = 'expand', _lgStateT = 0;
let _lgSpinTarget = 0, _lgFlatT = -1;
let _lgPulseT = -1, _lgColSweepT = -1, _lgWaveT = -1;
let _lgDblScanT = -1, _lgCollapsePhase = 0;
let _lgRoutineIdx = 0;
let sphT = 0;

function effectSphere(core, dt) {
  core.t += dt; sphT += dt;
  const { SIZE: S, N, colBuf } = core;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.75;
  const time = sphT;
  const cx = (S - 1) / 2, cy = (S - 1) / 2;
  const nRays = 6;
  const nHLines = 8;

  const hp = time * 0.15;
  const flicker = 0.92 + 0.08 * Math.sin(time * 47.3) * Math.sin(time * 31.7);
  let hpOff = 0;
  if (_lgColSweepT >= 0) {
    _lgColSweepT += dt;
    const sweepDur = 4.0;
    if (_lgColSweepT >= sweepDur) _lgColSweepT = -1;
    else hpOff = _lgColSweepT * 2.5;
  }
  const hpFinal = hp + hpOff;
  let pulseMul = 1;
  if (_lgPulseT >= 0) {
    _lgPulseT += dt;
    const pulseDur = 5.0;
    if (_lgPulseT >= pulseDur) _lgPulseT = -1;
    else pulseMul = 0.4 + 0.6 * Math.abs(Math.sin(_lgPulseT * Math.PI * 2.5));
  }
  const cR = (0.15 + 0.85 * Math.max(0, Math.sin(hpFinal))) * flicker * pulseMul;
  const cG = (0.3 + 0.7 * Math.max(0, Math.sin(hpFinal + 2.094))) * flicker * pulseMul;
  const cB = (0.1 + 0.9 * Math.max(0, Math.sin(hpFinal + 4.189))) * flicker * pulseMul;

  let waveOffset = 0;
  if (_lgWaveT >= 0) {
    _lgWaveT += dt;
    const waveDur = 5.0;
    if (_lgWaveT >= waveDur) _lgWaveT = -1;
    else waveOffset = _lgWaveT;
  }

  // State machine
  _lgStateT += dt;
  const expandDur = 2.0, scanPeriod = 3.0, spinDur = 1.5;
  const collapseDur = 1.2, reExpandDur = 1.5;
  let expandEase = 1, scanV = cy, spinAngle = _lgBaseAngle;
  let scanV2 = -1;

  if (_lgState === 'expand') {
    const p = Math.min(_lgStateT / expandDur, 1);
    expandEase = p * p;
    _lgScanT += dt;
    const sp = (_lgScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
    scanV = Math.max(0, Math.min(S - 1, scanV));
    if (p >= 1) { _lgState = 'scan'; _lgStateT = 0; }
  }

  if (_lgState === 'scan') {
    _lgScanT += dt;
    const sp = (_lgScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    scanV = cy + (raw - 0.5) * 2 * (S - 1) / 2;
    scanV = Math.max(0, Math.min(S - 1, scanV));
    if (_lgDblScanT >= 0) {
      _lgDblScanT += dt;
      const dblDur = 6.0;
      if (_lgDblScanT >= dblDur) _lgDblScanT = -1;
      else {
        const sp2 = ((_lgScanT + scanPeriod / 2) % scanPeriod) / scanPeriod;
        const raw2 = sp2 < 0.5 ? sp2 * 2 : 2 - sp2 * 2;
        scanV2 = cy + (raw2 - 0.5) * 2 * (S - 1) / 2;
        scanV2 = Math.max(0, Math.min(S - 1, scanV2));
      }
    }
    if (_lgStateT > 6.0 && Math.abs(scanV - cy) < 2) {
      const routines = ['spin', 'collapse', 'dblscan', 'pulse', 'colsweep', 'wave', 'flat', 'spin'];
      const pick = routines[_lgRoutineIdx % routines.length];
      _lgRoutineIdx++;
      if (pick === 'spin') {
        _lgState = 'spin';
        _lgStateT = 0;
        _lgSpinTarget = ((_lgScanT * 7 | 0) % 3 === 0) ? Math.PI / 2 : Math.PI * 2;
        scanV = cy;
      } else if (pick === 'collapse') {
        _lgState = 'collapse';
        _lgStateT = 0;
        _lgCollapsePhase = 0;
      } else if (pick === 'dblscan') {
        _lgDblScanT = 0;
        _lgStateT = 0;
      } else if (pick === 'pulse') {
        _lgPulseT = 0;
        _lgStateT = 0;
      } else if (pick === 'colsweep') {
        _lgColSweepT = 0;
        _lgStateT = 0;
      } else if (pick === 'wave') {
        _lgWaveT = 0;
        _lgStateT = 0;
      } else if (pick === 'flat') {
        _lgFlatT = 0;
        _lgStateT = 0;
      }
    }
  }

  if (_lgState === 'spin') {
    scanV = cy;
    const p = Math.min(_lgStateT / spinDur, 1);
    const ease = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    spinAngle = _lgBaseAngle + ease * _lgSpinTarget;
    if (p >= 1) {
      _lgBaseAngle = _lgBaseAngle + _lgSpinTarget;
      while (_lgBaseAngle > Math.PI * 2) _lgBaseAngle -= Math.PI * 2;
      _lgState = 'scan';
      _lgStateT = 0;
    }
  }

  if (_lgState === 'collapse') {
    _lgScanT += dt;
    const sp = (_lgScanT % scanPeriod) / scanPeriod;
    const raw = sp < 0.5 ? sp * 2 : 2 - sp * 2;
    if (_lgCollapsePhase === 0) {
      const p = Math.min(_lgStateT / collapseDur, 1);
      expandEase = 1 - p * p;
      scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
      scanV = Math.max(0, Math.min(S - 1, scanV));
      if (p >= 1) { _lgCollapsePhase = 1; _lgStateT = 0; }
    } else {
      const p = Math.min(_lgStateT / reExpandDur, 1);
      expandEase = p * p;
      scanV = cy + (raw - 0.5) * 2 * expandEase * (S - 1) / 2;
      scanV = Math.max(0, Math.min(S - 1, scanV));
      if (p >= 1) { _lgState = 'scan'; _lgStateT = 0; }
    }
  }

  // Flat grid overlay timer (runs independently)
  const flatSweepDur = 2.0, flatHoldDur = 2.5, flatFadeDur = 1.5;
  const flatTotalDur = flatSweepDur + flatHoldDur + flatFadeDur;
  if (_lgFlatT >= 0) {
    _lgFlatT += dt;
    if (_lgFlatT >= flatTotalDur) _lgFlatT = -1;
  }

  const cosA = Math.cos(spinAngle), sinA = Math.sin(spinAngle);

  // 3D: one vanishing point, rays and scan line wrap across all 4+2 faces via cubePx
  const T = S * 4, M = S - 1;
  const ccx = Math.round(S / 2);
  let _lgIsVert = false;
  function setPx3d(col, v, r, g, b) {
    if (_lgIsVert) {
      const c = ((col % T) + T) % T;
      const qi = (c / S) | 0;
      const fu = c % S;
      if (v >= 0 && v < S && (qi === 1 || qi === 3)) return;
      if (v < 0 && v >= -S) v = -(M - (-v - 1)) - 1;
      if (v >= 2 * S || v < -S) {
        col = 2 * S + (M - fu);
        v = v >= 2 * S ? 3 * S - 1 - v : -v - S - 1;
        if (v < 0 || v >= S) return;
        const idx2 = cubePx(core, col, v); if (idx2 < 0) return;
        colBuf[idx2 * 3] = Math.max(colBuf[idx2 * 3], r);
        colBuf[idx2 * 3 + 1] = Math.max(colBuf[idx2 * 3 + 1], g);
        colBuf[idx2 * 3 + 2] = Math.max(colBuf[idx2 * 3 + 2], b);
        return;
      }
    }
    const idx = cubePx(core, col, v); if (idx < 0) return;
    colBuf[idx * 3] = Math.max(colBuf[idx * 3], r);
    colBuf[idx * 3 + 1] = Math.max(colBuf[idx * 3 + 1], g);
    colBuf[idx * 3 + 2] = Math.max(colBuf[idx * 3 + 2], b);
  }
  function drawLine3d(x0, y0, x1, y1, bright) {
    const ldx = x1 - x0, ldy = y1 - y0;
    const ls = Math.max(Math.abs(ldx), Math.abs(ldy), 1) | 0;
    for (let i = 0; i <= ls; i++) {
      const ft = i / ls;
      const u = Math.round(x0 + ldx * ft), v = Math.round(y0 + ldy * ft);
      if (v < -2 * S || v >= 3 * S) continue;
      setPx3d(u, v, cR * bright, cG * bright, cB * bright);
    }
  }

  const absS = Math.abs(sinA), absC = Math.abs(cosA);
  _lgIsVert = absS > absC;
  const scanFrac = (scanV - cy) / ((S - 1) / 2);
  const scanCU3d = _lgIsVert ? ccx + scanFrac * ((S - 1) / 2) : ccx;
  const scanCV3d = _lgIsVert ? cy : scanV;
  const barHalfU = cosA * (T / 2);
  const barHalfV = sinA * (S * 2.5);
  const sl3U0 = scanCU3d + barHalfU, sl3V0 = scanCV3d + barHalfV;
  const sl3U1 = scanCU3d - barHalfU, sl3V1 = scanCV3d - barHalfV;

  const slB3 = 0.9 * expandEase;
  const normU3 = -sinA, normV3 = cosA;
  drawLine3d(sl3U0, sl3V0, sl3U1, sl3V1, slB3);
  for (let dv = -3; dv <= 3; dv++) {
    if (dv === 0) continue;
    const gb = (1 - Math.abs(dv) / 4) * 0.18 * expandEase;
    drawLine3d(sl3U0 + normU3 * dv, sl3V0 + normV3 * dv, sl3U1 + normU3 * dv, sl3V1 + normV3 * dv, gb);
  }

  if (scanV2 >= 0) {
    const sf2 = (scanV2 - cy) / ((S - 1) / 2);
    const sCU2 = _lgIsVert ? ccx + sf2 * ((S - 1) / 2) : ccx;
    const sCV2 = _lgIsVert ? cy : scanV2;
    const s2U0 = sCU2 + barHalfU, s2V0 = sCV2 + barHalfV;
    const s2U1 = sCU2 - barHalfU, s2V1 = sCV2 - barHalfV;
    drawLine3d(s2U0, s2V0, s2U1, s2V1, slB3 * 0.7);
    for (let dv = -2; dv <= 2; dv++) {
      if (dv === 0) continue;
      const gb = (1 - Math.abs(dv) / 3) * 0.12 * expandEase;
      drawLine3d(s2U0 + normU3 * dv, s2V0 + normV3 * dv, s2U1 + normU3 * dv, s2V1 + normV3 * dv, gb);
    }
  }

  const nRays3d = 6;
  for (let ri = 0; ri < nRays3d; ri++) {
    const frac = ri / (nRays3d - 1);
    const tU = sl3U0 + (sl3U1 - sl3U0) * frac;
    const tV = sl3V0 + (sl3V1 - sl3V0) * frac;
    const endU = ccx + (tU - ccx) * expandEase;
    const endV = cy + (tV - cy) * expandEase;
    const dx = endU - ccx, dy = endV - cy;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1) | 0;
    if (steps < 2) continue;
    for (let s = 0; s <= steps; s++) {
      const ft = s / steps;
      const u = Math.round(ccx + dx * ft);
      const v = Math.round(cy + dy * ft);
      const b = 0.2 + 0.6 * ft;
      setPx3d(u, v, cR * b, cG * b, cB * b);
    }
  }

  if (expandEase > 0.3) {
    const gridB3 = 0.25 * (expandEase - 0.3) / 0.7;
    for (let hi = 1; hi <= nHLines; hi++) {
      const frac = hi / (nHLines + 1);
      let pFrac = frac * frac;
      if (waveOffset > 0) {
        const wAmp = 0.15 * Math.sin(waveOffset * 3 - hi * 0.8);
        pFrac = Math.max(0.01, Math.min(0.99, pFrac + wAmp));
      }
      for (let ri = 0; ri < nRays3d - 1; ri++) {
        const fA = ri / (nRays3d - 1), fB = (ri + 1) / (nRays3d - 1);
        const aU = sl3U0 + (sl3U1 - sl3U0) * fA, aV = sl3V0 + (sl3V1 - sl3V0) * fA;
        const bU = sl3U0 + (sl3U1 - sl3U0) * fB, bV = sl3V0 + (sl3V1 - sl3V0) * fB;
        const eaU = ccx + (aU - ccx) * expandEase, eaV = cy + (aV - cy) * expandEase;
        const ebU = ccx + (bU - ccx) * expandEase, ebV = cy + (bV - cy) * expandEase;
        const guA = ccx + (eaU - ccx) * pFrac, gvA = cy + (eaV - cy) * pFrac;
        const guB = ccx + (ebU - ccx) * pFrac, gvB = cy + (ebV - cy) * pFrac;
        drawLine3d(guA, gvA, guB, gvB, gridB3);
      }
    }
  }

  // Center dot glow (single point on front face)
  for (let dv = -2; dv <= 2; dv++) for (let du = -2; du <= 2; du++) {
    const v = Math.round(cy) + dv;
    if (v < 0 || v >= S) continue;
    const r = Math.sqrt(du * du + dv * dv);
    const b = Math.max(0, 1 - r / 2.5) * 0.7;
    setPx3d(ccx + du, v, b, b * 0.95, b);
  }

  // Bright dots where rays meet scan line
  for (let ri = 0; ri < nRays3d; ri++) {
    const frac = ri / (nRays3d - 1);
    const tU = sl3U0 + (sl3U1 - sl3U0) * frac;
    const tV = sl3V0 + (sl3V1 - sl3V0) * frac;
    const eu = Math.round(ccx + (tU - ccx) * expandEase);
    const ev = Math.round(cy + (tV - cy) * expandEase);
    for (let ddv = -1; ddv <= 1; ddv++) for (let ddu = -1; ddu <= 1; ddu++) {
      const v = ev + ddv;
      if (v < -2 * S || v >= 3 * S) continue;
      const r = Math.sqrt(ddu * ddu + ddv * ddv);
      const b = Math.max(0, 1 - r / 1.5) * 0.8 * expandEase;
      setPx3d(eu + ddu, v, cR * b, cG * b, cB * b);
    }
  }

  // Flat 2D grid overlay (always on all 4 side faces)
  if (_lgFlatT >= 0 && _lgFlatT < flatTotalDur) {
    const gridSpacing = Math.round(S / 8);
    let flatAlpha = 0, reach = 0;
    if (_lgFlatT < flatSweepDur) {
      reach = _lgFlatT / flatSweepDur;
      flatAlpha = 0.4;
    } else if (_lgFlatT < flatSweepDur + flatHoldDur) {
      reach = 1;
      flatAlpha = 0.4;
    } else {
      reach = 1;
      flatAlpha = 0.4 * (1 - (_lgFlatT - flatSweepDur - flatHoldDur) / flatFadeDur);
    }
    const maxDist = Math.round(reach * (S / 2));
    for (let gi = 1; gi < S / gridSpacing; gi++) {
      const gv = gi * gridSpacing; if (gv >= S) continue;
      if (Math.abs(gv - Math.round(cy)) > maxDist) continue;
      for (let col = 0; col < T; col++) setPx3d(col, gv, cR * flatAlpha, cG * flatAlpha, cB * flatAlpha);
    }
    for (let gi = 0; gi < T / gridSpacing; gi++) {
      const gu = gi * gridSpacing;
      for (let v = 0; v < S; v++) {
        if (Math.abs(v - Math.round(cy)) > maxDist) continue;
        setPx3d(gu, v, cR * flatAlpha, cG * flatAlpha, cB * flatAlpha);
      }
    }
    if (_lgFlatT < flatSweepDur) {
      const sw1 = Math.round(cy - maxDist), sw2 = Math.round(cy + maxDist);
      for (let col = 0; col < T; col++) {
        if (sw1 >= 0 && sw1 < S) setPx3d(col, sw1, cR * 0.8, cG * 0.8, cB * 0.8);
        if (sw2 >= 0 && sw2 < S) setPx3d(col, sw2, cR * 0.8, cG * 0.8, cB * 0.8);
      }
    }
  }
}

module.exports = effectSphere;
