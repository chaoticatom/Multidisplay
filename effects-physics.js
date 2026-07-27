// ═══════════════════════════════════════════════════
//  effects-physics.js — Physics & Simulation (lazy-loaded)
//  balls, sand, life, fluid, fireworks, strobe
// ═══════════════════════════════════════════════════

// ── FIREWORKS — cross-face rockets & explosions on 4 side panels ──
const fwParticles = []; // kept for reset compatibility
const fwRockets = [];
const fwBursts = [];
let fwSpawnT = 0;
let fwMode = 'random'; // 'random', 'sync', 'mic'
let fwSyncT = 0, fwSyncPhase = 0, fwSyncStep = 0;
let fwMicOn = false, fwMicCtx = null, fwMicAnalyser = null, fwMicBuf = null;
let fwMicBass = 0, fwMicMid = 0, fwMicHigh = 0, fwMicEnergy = 0;
let fwMicCooldown = 0;

function fwSet(idx, r, g, b) {
  if (idx < 0) return;
  colBuf[idx*3]   = Math.max(colBuf[idx*3],   r);
  colBuf[idx*3+1] = Math.max(colBuf[idx*3+1], g);
  colBuf[idx*3+2] = Math.max(colBuf[idx*3+2], b);
}

function fwLaunch() {
  const totalCols = panel2dMode ? SIZE : SIZE * 4;
  const sc = Math.random() * totalCols;
  fwRockets.push({
    col: sc, v: 0,
    vy: SIZE * (0.88 + Math.random() * 0.45),
    vc: (Math.random() - 0.5) * SIZE * 0.3,
    hue: Math.random(),
    hue2: Math.random(),
    trail: []
  });
}

function fwBurst(col, v, hue, hue2) {
  const mono = fwSyncForceMono ? true : Math.random() > 0.5;
  const type = fwSyncForceType >= 0 ? fwSyncForceType : Math.random();
  const sizeMul = 0.5 + Math.random() * 1.0;

  function addParticle(c, y, vc, vy, h, decay, bright) {
    fwBursts.push({ col: c, v: y, vc, vy, hue: h, life: 1, decay, bright });
  }

  if (type < 0.25) {
    const n = 30 + Math.floor(Math.random() * 50);
    const spd = SIZE * (0.25 + Math.random() * 0.35) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const r = spd * (0.4 + Math.random() * 0.6);
      const h = mono ? hue : (i % 3 === 0 ? hue2 : hue + Math.random() * 0.1) % 1;
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * (0.5 + Math.random()), h, 0.008 + Math.random() * 0.008, 0.85 + Math.random() * 0.15);
    }
  } else if (type < 0.42) {
    const n = 70 + Math.floor(Math.random() * 40);
    const spd = SIZE * (0.35 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.15;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.8, mono ? hue : (hue + i * 0.003) % 1, 0.004 + Math.random() * 0.004, 0.9);
    }
  } else if (type < 0.56) {
    const n = 40 + Math.floor(Math.random() * 30);
    const spd = SIZE * (0.2 + Math.random() * 0.25) * sizeMul;
    const wHue = mono ? hue : 0.12 + Math.random() * 0.08;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const r = spd * (0.4 + Math.random() * 0.6);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.3, wHue, 0.003 + Math.random() * 0.003, 0.8);
    }
  } else if (type < 0.73) {
    const n = 35 + Math.floor(Math.random() * 25);
    const spd = SIZE * (0.3 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const spread = (0.3 + Math.random() * 0.5) * spd;
      addParticle(col, v, Math.cos(a) * spread, spd * (0.6 + Math.random() * 0.4), mono ? hue : 0.08 + Math.random() * 0.06, 0.005 + Math.random() * 0.005, 0.85);
    }
  } else if (type < 0.88) {
    const offsets = [-SIZE * 0.12, SIZE * 0.12, 0, 0];
    const voffs  = [0, 0, -SIZE * 0.12, SIZE * 0.12];
    for (let d = 0; d < 4; d++) {
      const sc = col + offsets[d], sv = v + voffs[d];
      const n2 = 15 + Math.floor(Math.random() * 10);
      const spd2 = SIZE * (0.15 + Math.random() * 0.2) * sizeMul;
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2 + Math.random() * 0.3;
        const r = spd2 * (0.4 + Math.random() * 0.6);
        addParticle(sc, sv, Math.cos(a) * r + offsets[d] * 2, Math.sin(a) * r * 0.5 + voffs[d] * 2, mono ? hue : (hue2 + Math.random() * 0.1) % 1, 0.01 + Math.random() * 0.008, 0.9);
      }
    }
  } else {
    const n = 20 + Math.floor(Math.random() * 20);
    const spd = SIZE * (0.25 + Math.random() * 0.3) * sizeMul;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spd * (0.5 + Math.random() * 0.5);
      addParticle(col, v, Math.cos(a) * r, Math.sin(a) * r * 0.6, 0.13 + Math.random() * 0.04, 0.015 + Math.random() * 0.015, 1.0);
    }
  }
}

// Sync show: choreographed sequences with grouped styles and palettes
const FW_PALETTES = [
  [0.0, 0.03],   // reds
  [0.08, 0.14],  // golds/amber
  [0.55, 0.65],  // blues
  [0.3, 0.38],   // greens
  [0.78, 0.88],  // purples/pinks
  [0.0, 1.0],    // rainbow
];
let fwSyncQueue = [];
let fwSyncWait = 0;
let fwSyncAct = 0;
let fwSyncForceType = -1, fwSyncForceMono = false;

function fwSyncRocket(col, vy, vc, hue, hue2, delay) {
  if (delay > 0) {
    fwSyncQueue.push({ col, vy, vc, hue, hue2, delay });
  } else {
    fwRockets.push({ col, v: 0, vy, vc, hue, hue2, trail: [] });
  }
}

function fwPal() { return FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)]; }
function fwHue(pal) { return pal[0] + Math.random() * (pal[1] - pal[0]); }

// Quick fan — rapid succession fanning out from a point
function fwFan(center, pal, count, spread) {
  const n = count || 7 + Math.floor(Math.random() * 5);
  const sp = spread || SIZE * 0.07;
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2);
    const d = i * 20;
    fwSyncRocket(center + off * sp * 0.3, SIZE * (0.92 + Math.random() * 0.15), off * sp * 0.8, hue, (hue + 0.15) % 1, d);
  }
}

// Staggered volley from one face — same color family
function fwVolley(faceIdx, pal, count) {
  const base = faceIdx * SIZE;
  const n = count || 4 + Math.floor(Math.random() * 3);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const sc = base + SIZE * 0.15 + Math.random() * SIZE * 0.7;
    fwSyncRocket(sc, SIZE * (0.88 + Math.random() * 0.2), (Math.random() - 0.5) * SIZE * 0.1, hue, (hue + 0.2 + Math.random() * 0.1) % 1, i * 30);
  }
}

// Cascade — evenly spaced across all faces, staggered timing
function fwCascade(pal, dir) {
  const total = SIZE * 4;
  const n = 8 + Math.floor(Math.random() * 4);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const idx = dir > 0 ? i : (n - 1 - i);
    const sc = (total / n) * idx + SIZE * 0.1 + Math.random() * SIZE * 0.15;
    fwSyncRocket(sc, SIZE * (0.82 + Math.random() * 0.2), 0, (hue + i * 0.02) % 1, (hue + 0.4) % 1, i * 40);
  }
}

// Symmetry — matching launches from opposite faces
function fwSymmetry(pal) {
  const hue = fwHue(pal);
  const pairs = [[0, 2], [1, 3]];
  const pair = pairs[Math.floor(Math.random() * 2)];
  for (let i = 0; i < 3; i++) {
    const off = SIZE * 0.2 + Math.random() * SIZE * 0.6;
    const vy = SIZE * (0.88 + Math.random() * 0.3);
    const h = (hue + i * 0.06) % 1;
    fwSyncRocket(pair[0] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 50);
    fwSyncRocket(pair[1] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 50);
  }
}

// Waterfall — dense short bursts raining down from all 4 faces
function fwWaterfall(pal) {
  const total = SIZE * 4;
  const hue = fwHue(pal);
  for (let i = 0; i < 16; i++) {
    const sc = Math.random() * total;
    fwSyncRocket(sc, SIZE * (0.62 + Math.random() * 0.15), (Math.random() - 0.5) * SIZE * 0.05, (hue + Math.random() * 0.08) % 1, hue, i * 15);
  }
}

// Finale — massive rapid-fire barrage
function fwFinale() {
  const total = SIZE * 4;
  const pal1 = fwPal(), pal2 = fwPal();
  for (let i = 0; i < 20; i++) {
    const sc = Math.random() * total;
    const pal = i % 2 === 0 ? pal1 : pal2;
    const hue = fwHue(pal);
    fwSyncRocket(sc, SIZE * (0.72 + Math.random() * 0.3), (Math.random() - 0.5) * SIZE * 0.2, hue, (hue + 0.4) % 1, i * 25 + Math.random() * 15);
  }
}

const FW_SYNC_ACTS = [
  // Act 1: fans from each face in sequence
  () => { const pal = fwPal(); for (let f = 0; f < 4; f++) setTimeout(() => fwFan(f * SIZE + SIZE / 2, pal), f * 400); return 3.5; },
  // Act 2: volleys alternating faces, two color families
  () => { const p1 = fwPal(), p2 = fwPal(); fwVolley(0, p1, 5); setTimeout(() => fwVolley(2, p2, 5), 300); setTimeout(() => fwVolley(1, p1, 5), 600); setTimeout(() => fwVolley(3, p2, 5), 900); return 3.5; },
  // Act 3: cascade sweep then reverse
  () => { const pal = fwPal(); fwCascade(pal, 1); setTimeout(() => fwCascade(pal, -1), 1400); return 4.0; },
  // Act 4: symmetry pairs
  () => { const pal = fwPal(); fwSymmetry(pal); setTimeout(() => { const p2 = fwPal(); fwSymmetry(p2); }, 800); setTimeout(() => { const p3 = fwPal(); fwSymmetry(p3); }, 1600); return 4.0; },
  // Act 5: rapid fans from random spots
  () => { const pal = fwPal(); for (let i = 0; i < 5; i++) setTimeout(() => fwFan(Math.random() * SIZE * 4, pal, 5 + Math.floor(Math.random() * 4), SIZE * 0.06), i * 400); return 4.0; },
  // Act 6: waterfall
  () => { const pal = fwPal(); fwWaterfall(pal); setTimeout(() => fwWaterfall(fwPal()), 1000); return 3.5; },
  // Act 7: grand finale
  () => { fwFinale(); setTimeout(fwFinale, 1000); return 5.0; },
];

function fwSyncUpdate(dt) {
  // Process delayed rockets
  for (let k = fwSyncQueue.length - 1; k >= 0; k--) {
    fwSyncQueue[k].delay -= dt * 1000;
    if (fwSyncQueue[k].delay <= 0) {
      const q = fwSyncQueue[k];
      fwRockets.push({ col: q.col, v: 0, vy: q.vy, vc: q.vc, hue: q.hue, hue2: q.hue2, trail: [] });
      fwSyncQueue.splice(k, 1);
    }
  }

  fwSyncWait -= dt;
  if (fwSyncWait <= 0) {
    const unified = Math.random() < 0.5;
    if (unified) { fwSyncForceMono = true; fwSyncForceType = [0.1, 0.3, 0.5, 0.65, 0.8, 0.95][Math.floor(Math.random()*6)]; }
    else { fwSyncForceMono = false; fwSyncForceType = -1; }
    const act = FW_SYNC_ACTS[fwSyncAct % FW_SYNC_ACTS.length];
    fwSyncWait = act();
    fwSyncAct++;
  }
}

async function fwMicStart() {
  if (fwMicOn) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    fwMicCtx = fwMicCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (fwMicCtx.state === 'suspended') await fwMicCtx.resume();
    const src = fwMicCtx.createMediaStreamSource(stream);
    fwMicAnalyser = fwMicCtx.createAnalyser();
    fwMicAnalyser.fftSize = 1024;
    fwMicAnalyser.smoothingTimeConstant = 0.5;
    src.connect(fwMicAnalyser);
    fwMicBuf = new Uint8Array(fwMicAnalyser.frequencyBinCount);
    fwMicOn = true;
  } catch (e) { fwMicOn = false; }
}

function fwMicAnalyse(dt) {
  if (!fwMicOn || !fwMicAnalyser) return;
  fwMicAnalyser.getByteFrequencyData(fwMicBuf);
  const n = fwMicBuf.length;
  let bass = 0, mid = 0, high = 0;
  const bEnd = Math.floor(n * 0.1), mEnd = Math.floor(n * 0.4);
  for (let i = 0; i < bEnd; i++) bass += fwMicBuf[i];
  for (let i = bEnd; i < mEnd; i++) mid += fwMicBuf[i];
  for (let i = mEnd; i < n; i++) high += fwMicBuf[i];
  bass /= bEnd * 255; mid /= (mEnd - bEnd) * 255; high /= (n - mEnd) * 255;
  fwMicBass = fwMicBass * 0.6 + bass * 0.4;
  fwMicMid = fwMicMid * 0.6 + mid * 0.4;
  fwMicHigh = fwMicHigh * 0.6 + high * 0.4;
  fwMicEnergy = fwMicBass * 0.5 + fwMicMid * 0.3 + fwMicHigh * 0.2;

  fwMicCooldown -= dt;
  if (fwMicCooldown > 0) return;

  const totalCols = panel2dMode ? SIZE : SIZE * 4;
  if (fwMicBass > 0.35) {
    const count = fwMicBass > 0.6 ? 3 : fwMicBass > 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      fwRockets.push({ col: Math.random() * totalCols, v: 0, vy: SIZE * (0.55 + fwMicBass * 0.5), vc: (Math.random() - 0.5) * SIZE * 0.25, hue: (fwMicMid * 2) % 1, hue2: (fwMicHigh * 3) % 1, trail: [] });
    }
    fwMicCooldown = 0.15;
  } else if (fwMicMid > 0.3) {
    fwRockets.push({ col: Math.random() * totalCols, v: 0, vy: SIZE * (0.5 + fwMicMid * 0.4), vc: (Math.random() - 0.5) * SIZE * 0.15, hue: Math.random(), hue2: Math.random(), trail: [] });
    fwMicCooldown = 0.25;
  }
}

function effectFireworks(dt) {
  t += dt;
  for (let i = 0; i < N * 3; i++) colBuf[i] *= 0.80;

  if (fwMode === 'random') {
    fwSpawnT += dt;
    if (fwSpawnT > 0.4) { fwLaunch(); if (Math.random() > 0.6) fwLaunch(); fwSpawnT = 0; }
  } else if (fwMode === 'sync') {
    fwSyncUpdate(dt);
  } else if (fwMode === 'mic') {
    fwMicAnalyse(dt);
  }

  const totalCols = panel2dMode ? SIZE : SIZE * 4;
  const G = SIZE * 0.06;

  // ── Rockets ──
  for (let k = fwRockets.length - 1; k >= 0; k--) {
    const r = fwRockets[k];
    r.vy -= SIZE * 0.85 * dt;
    r.v += r.vy * dt;
    r.col += r.vc * dt;
    r.trail.push({ col: r.col, v: r.v });
    if (r.trail.length > 20) r.trail.shift();

    for (let ti = 0; ti < r.trail.length; ti++) {
      const tp = r.trail[ti];
      const fade = ti / r.trail.length;
      const [rh, gh, bh] = hsl(r.hue, 1, fade * 0.95);
      const iv = Math.max(0, Math.min(SIZE - 1, Math.round(tp.v)));
      if (panel2dMode) {
        const ic = Math.round(tp.col);
        if (ic >= 0 && ic < SIZE) { const idx = faceMap[0][iv * SIZE + ic]; if (idx >= 0) fwSet(idx, rh, gh, bh); }
      } else {
        const idx = fwPx(Math.round(tp.col), iv);
        if (idx >= 0) fwSet(idx, rh, gh, bh);
      }
    }
    if (r.vy <= 0 || r.v >= SIZE - 1) { fwBurst(r.col, r.v, r.hue, r.hue2); fwRockets.splice(k, 1); }
  }

  // ── Burst particles ──
  for (let k = fwBursts.length - 1; k >= 0; k--) {
    const b = fwBursts[k];
    b.col += b.vc * dt;
    b.v += b.vy * dt;
    b.vy -= G * dt;
    b.life -= b.decay;
    if (b.life <= 0) { fwBursts.splice(k, 1); continue; }

    const iv = Math.round(b.v);
    if (iv < 0) { fwBursts.splice(k, 1); continue; }

    const [rh, gh, bh] = hsl(b.hue, 1, b.life * (b.bright || 0.9));

    if (panel2dMode) {
      if (iv >= SIZE) { fwBursts.splice(k, 1); continue; }
      const ic = Math.round(b.col);
      if (ic < 0 || ic >= SIZE) { fwBursts.splice(k, 1); continue; }
      const idx = faceMap[0][iv * SIZE + ic];
      if (idx >= 0) fwSet(idx, rh, gh, bh);
    } else if (iv < SIZE) {
      const idx = fwPx(Math.round(b.col), iv);
      if (idx >= 0) fwSet(idx, rh, gh, bh);
    } else {
      const ov = iv - SIZE;
      if (ov >= SIZE) { fwBursts.splice(k, 1); continue; }
      const S = SIZE, total = S * 4;
      const c = ((Math.round(b.col) % total) + total) % total;
      const qi = (c / S) | 0, fu = c % S;
      let tu, tv;
      if (qi === 0)      { tu = fu;         tv = (S - 1) - ov; }
      else if (qi === 1) { tu = (S - 1) - ov; tv = (S - 1) - fu; }
      else if (qi === 2) { tu = (S - 1) - fu; tv = ov; }
      else               { tu = ov;         tv = fu; }
      if (tu >= 0 && tu < S && tv >= 0 && tv < S) {
        const idx = faceMap[4][tv * S + tu];
        if (idx >= 0) fwSet(idx, rh, gh, bh);
      }
    }
  }

  // ── Scrolling text overlay ──
  if(fwTextOn && fwTextPixels && fwTextWidth>0){
    fwScrollX=(fwScrollX+dt*SIZE*0.38)%fwTextWidth;

    const textRows=fwTextH;
    const panelSeq =[3,0,2,1];
    const needsFlip=[false,false,false,false];

    for(let pi=0;pi<4;pi++){
      const face=panelSeq[pi];
      const flip=needsFlip[pi];
      const segStart=pi*SIZE;

      // v=0 is canvas top row, lv=SIZE-1-v is faceMap row (matches datetime paintFace)
      for(let v=0;v<textRows;v++){
        const lv=SIZE-1-v; // top of panel = faceMap row SIZE-1

        for(let u=0;u<SIZE;u++){
          const ledU=flip?(SIZE-1-u):u;
          const stripX=((segStart+ledU+(fwScrollX|0))%fwTextWidth+fwTextWidth)%fwTextWidth;
          const pv=fwTextPixels[(v*fwTextWidth+stripX)*4]/255;
          if(pv<0.04) continue;
          const hue=((stripX/fwTextWidth)+t*0.04)%1;
          const [r,g,b]=hsl(hue,1,pv*0.95);
          const idx=faceMap[face][lv*SIZE+u];
          if(idx>=0) setLED(idx,r,g,b);
        }
      }
    }
  }
}

// ── STROBE FLASH ──
let strobeT=0, strobeOn=false, strobePhase=0, strobeBeat=0, strobeMode='all', strobeColor='white';
function effectStrobe(dt){
  t+=dt;
  const mode=(_peTargetOpts&&_peTargetOpts.pattern)?_peTargetOpts.pattern:strobeMode;
  const sc=(_peTargetOpts&&_peTargetOpts.color)?_peTargetOpts.color:strobeColor;
  const speed=parseFloat(document.getElementById('strobe-speed')?.value||'4');
  const period=1/Math.max(0.2,speed);
  strobeT+=dt;
  if(strobeT>=period){ strobeT%=period; strobeOn=!strobeOn; strobePhase=(strobePhase+1)%2; strobeBeat++; }

  for(let i=0;i<N*3;i++) colBuf[i]=0;
  if(!strobeOn) return;

  // Resolve colour
  const COLMAP={white:[1,1,1],red:[1,0.05,0.05],green:[0.05,1,0.05],blue:[0.1,0.2,1],cyan:[0.1,1,1]};
  const baseCol=COLMAP[sc]||[1,1,1];
  const multi=(sc==='multi');
  const hue=multi?((strobeBeat*0.13)%1):0;
  const col=(u,v,faceMod)=>{
    if(multi) return hsl((hue+faceMod)%1,1,0.5);
    return baseCol;
  };

  if(mode==='all'){
    for(let f=0;f<6;f++){
      const [r,g,b]=col(0,0,f*0.16);
      for(let j=0;j<SIZE*SIZE;j++){const idx=faceMap[f][j];if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}}
    }
  } else if(mode==='checker'){
    for(let f=0;f<6;f++){
      for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
        if((u+v)%2===strobePhase){
          const [r,g,b]=col(u,v,f*0.16);
          const idx=faceMap[f][v*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
  } else if(mode==='faces'){
    const fIdx=strobeBeat%6;
    const [r,g,b]=col(0,0,fIdx*0.16);
    for(let j=0;j<SIZE*SIZE;j++){const idx=faceMap[fIdx][j];if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}}
  } else if(mode==='rings'){
    const ring=strobeBeat%Math.ceil(SIZE/2);
    for(let f=0;f<6;f++){
      const [r,g,b]=col(0,0,f*0.16);
      for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
        if(Math.round(Math.min(u,SIZE-1-u,v,SIZE-1-v))===ring){
          const idx=faceMap[f][v*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
  } else if(mode==='diagonal'){
    // Diagonal stripes sweep across faces
    const offset=(strobeBeat*3)%(SIZE*2);
    for(let f=0;f<6;f++){
      const [r,g,b]=col(0,0,f*0.16);
      for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
        if(((u+v+offset)%(SIZE/2|0))<(SIZE/4|0)){
          const idx=faceMap[f][v*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
  } else if(mode==='scanline'){
    // Horizontal scanline sweeps up then down
    const line=strobeBeat%SIZE;
    for(let f=0;f<6;f++){
      const [r,g,b]=col(0,0,f*0.16);
      for(let u=0;u<SIZE;u++){
        const idx=faceMap[f][line*SIZE+u];
        if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        // thick line — 3 rows
        if(line>0){const i2=faceMap[f][(line-1)*SIZE+u];if(i2>=0){colBuf[i2*3]=r*0.6;colBuf[i2*3+1]=g*0.6;colBuf[i2*3+2]=b*0.6;}}
        if(line<SIZE-1){const i3=faceMap[f][(line+1)*SIZE+u];if(i3>=0){colBuf[i3*3]=r*0.6;colBuf[i3*3+1]=g*0.6;colBuf[i3*3+2]=b*0.6;}}
      }
    }
  } else if(mode==='burst'){
    // Random face burst — full face flashes then goes dark, each face independent
    for(let f=0;f<6;f++){
      if((strobeBeat+f*2)%6<2){
        const [r,g,b]=col(0,0,f*0.16);
        for(let j=0;j<SIZE*SIZE;j++){const idx=faceMap[f][j];if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}}
      }
    }
  } else if(mode==='spiral'){
    // Expanding spiral of lit pixels
    const step=strobeBeat%(SIZE*2);
    for(let f=0;f<6;f++){
      const [r,g,b]=col(0,0,f*0.16);
      for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
        const ang=Math.atan2(v-SIZE/2,u-SIZE/2);
        const rad=Math.sqrt((u-SIZE/2)**2+(v-SIZE/2)**2);
        if(Math.round((ang/(Math.PI*2)*SIZE+rad+step))%4===0){
          const idx=faceMap[f][v*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
  }
}
// ── BOUNCING BALLS — 6 balls, wall impact flashes, sparkle trails ──
// ── BOUNCING BALLS ──────────────────────────────────────────────────────────
// Balls live on face surfaces with face-local (u,v) coords.
// Velocity is transformed between faces by projecting world-space velocity
// onto the new face's u/v axes — geometrically correct wrapping.
// Gravity always pulls to the physically lowest face.

let balls=[], ballFlashes=[];
let ballCrossFaces=true;
let ballsPerFace=3;

const BALL_CW=[0,2,1,3];
const BALL_CWI={0:0,1:2,2:1,3:3};

function ballCrossCheck(b, S) {
  const M = S - 1;

  // Side faces: u wraps around CW strip [0,2,1,3]
  if (b.face <= 3 && (b.u < 0 || b.u >= S)) {
    const su = BALL_CWI[b.face] * S + b.u;
    const total = S * 4;
    const w = ((su % total) + total) % total;
    const nqi = (w / S) | 0;
    b.face = BALL_CW[nqi];
    b.u = w - nqi * S;
  }

  // Side faces: v crosses to top (4) or bottom (5)
  if (b.face <= 3 && b.v >= S) {
    const ov = b.v - S, ou = b.u, od = b.du, od2 = b.dv;
    switch (b.face) {
      case 0: b.u=ou;   b.v=M-ov; b.du=od;   b.dv=-od2; break;
      case 1: b.u=M-ou; b.v=ov;   b.du=-od;  b.dv=od2;  break;
      case 2: b.u=M-ov; b.v=M-ou; b.du=-od2; b.dv=-od;  break;
      case 3: b.u=ov;   b.v=ou;   b.du=od2;  b.dv=od;   break;
    }
    b.face = 4;
  } else if (b.face <= 3 && b.v < 0) {
    const ov = -b.v, ou = b.u, od = b.du, od2 = b.dv;
    switch (b.face) {
      case 0: b.u=ou;   b.v=M-ov; b.du=od;   b.dv=od2;  break;
      case 1: b.u=M-ou; b.v=ov;   b.du=-od;  b.dv=-od2; break;
      case 2: b.u=M-ov; b.v=M-ou; b.du=od2;  b.dv=-od;  break;
      case 3: b.u=ov;   b.v=ou;   b.du=-od2; b.dv=od;   break;
    }
    b.face = 5;
  }

  // Face 4 (top) edges → side faces
  if (b.face === 4) {
    const ou = b.u, ov2 = b.v, od = b.du, od2 = b.dv;
    if (b.u < 0) {
      const ov = -ou;
      b.face=3; b.u=ov2; b.v=M-ov; b.du=od2; b.dv=od;
    } else if (b.u >= S) {
      const ov = ou - S;
      b.face=2; b.u=M-ov2; b.v=M-ov; b.du=-od2; b.dv=-od;
    } else if (b.v < 0) {
      const ov = -ov2;
      b.face=1; b.u=M-ou; b.v=M-ov; b.du=-od; b.dv=od2;
    } else if (b.v >= S) {
      const ov = ov2 - S;
      b.face=0; b.u=ou; b.v=M-ov; b.du=od; b.dv=-od2;
    }
  }

  // Face 5 (bottom) edges → side faces
  if (b.face === 5) {
    const ou = b.u, ov2 = b.v, od = b.du, od2 = b.dv;
    if (b.u < 0) {
      const ov = -ou;
      b.face=3; b.u=ov2; b.v=ov; b.du=od2; b.dv=-od;
    } else if (b.u >= S) {
      const ov = ou - S;
      b.face=2; b.u=M-ov2; b.v=ov; b.du=-od2; b.dv=od;
    } else if (b.v < 0) {
      const ov = -ov2;
      b.face=1; b.u=M-ou; b.v=ov; b.du=-od; b.dv=-od2;
    } else if (b.v >= S) {
      const ov = ov2 - S;
      b.face=0; b.u=ou; b.v=ov; b.du=od; b.dv=od2;
    }
  }
}

function ballPixel(face, pu, pv, S) {
  if (pu >= 0 && pu < S && pv >= 0 && pv < S) return faceMap[face][pv * S + pu];
  const tmp = {face:face, u:pu, v:pv, du:0, dv:0};
  ballCrossCheck(tmp, S);
  const ru = Math.round(tmp.u), rv = Math.round(tmp.v);
  if (ru >= 0 && ru < S && rv >= 0 && rv < S) return faceMap[tmp.face][rv * S + ru];
  return -1;
}

function resetBalls(){
  if(!SIZE) return;
  balls=[]; ballFlashes=[];
  const S=SIZE, faces=panel2dMode?1:6;
  const COLORS=[
    [1,0.15,0.15],[0.15,1,0.15],[0.2,0.4,1],[1,1,0.1],
    [1,0.4,0],[0.9,0.15,0.9],[0,0.9,0.9],[1,0.6,0.7],
    [0.5,1,0.3],[1,0.5,0.1],[0.3,0.5,1],[0.8,0.2,0.5],
  ];
  let ci=0;
  const faceList=panel2dMode?[0]:[0,1,2,3,4,5];
  for(const f of faceList){
    const count=panel2dMode?ballsPerFace*2:ballsPerFace;
    for(let k=0;k<count;k++){
      const R=3+Math.floor(Math.random()*3);
      const ang=Math.random()*Math.PI*2;
      const spd=S*(0.3+Math.random()*0.4);
      const c=COLORS[ci%COLORS.length]; ci++;
      balls.push({
        face:f,
        u:R+1+Math.random()*(S-2*R-2),
        v:R+1+Math.random()*(S-2*R-2),
        du:Math.cos(ang)*spd,
        dv:Math.sin(ang)*spd,
        r:R,
        cr:c[0], cg:c[1], cb:c[2],
      });
    }
  }
}

let ballPrevGx=0, ballPrevGy=0, ballPrevGz=0;

function effectBouncingBalls(dt){
  t+=dt;
  if(!balls.length) resetBalls();
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const S=SIZE, S1=S-1;

  // Detect cube rotation change and nudge balls
  const rawG=getLocalGravity(1);
  const gLen=Math.sqrt(rawG.x*rawG.x+rawG.y*rawG.y+rawG.z*rawG.z)||1;
  const gx=rawG.x/gLen, gy=rawG.y/gLen, gz=rawG.z/gLen;
  const dgx=gx-ballPrevGx, dgy=gy-ballPrevGy, dgz=gz-ballPrevGz;
  ballPrevGx=gx; ballPrevGy=gy; ballPrevGz=gz;
  const rotChange=Math.sqrt(dgx*dgx+dgy*dgy+dgz*dgz);

  // World-space u/v axes per face for projecting gravity nudge
  const FU=[[1,0,0],[1,0,0],[0,0,1],[0,0,1],[1,0,0],[1,0,0]];
  const FV=[[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,0,1],[0,0,1]];

  for(const b of balls){
    const fu=FU[b.face], fv=FV[b.face];
    const gu=gx*fu[0]+gy*fu[1]+gz*fu[2];
    const gv=gx*fv[0]+gy*fv[1]+gz*fv[2];
    if(gyroEnabled){
      b.du+=gu*S*3*dt;
      b.dv+=gv*S*3*dt;
    } else if(rotChange>0.005){
      const nudge=S*8*rotChange;
      b.du+=gu*nudge;
      b.dv+=gv*nudge;
    }

    b.u+=b.du*dt;
    b.v+=b.dv*dt;

    if(!panel2dMode&&ballCrossFaces){
      ballCrossCheck(b, S);
    }

    const R=b.r;
    if(panel2dMode||!ballCrossFaces){
      if(b.u<R)    {b.u=R;    b.du=Math.abs(b.du);}
      if(b.u>S1-R) {b.u=S1-R; b.du=-Math.abs(b.du);}
      if(b.v<R)    {b.v=R;    b.dv=Math.abs(b.dv);}
      if(b.v>S1-R) {b.v=S1-R; b.dv=-Math.abs(b.dv);}
    }

    const cu=Math.round(b.u), cv=Math.round(b.v);
    const R2=R*R;
    const cross=!panel2dMode&&ballCrossFaces;
    for(let dv=-R;dv<=R;dv++){
      for(let du=-R;du<=R;du++){
        const d2=du*du+dv*dv;
        if(d2>R2) continue;
        const pu=cu+du, pv=cv+dv;
        const idx=cross?ballPixel(b.face,pu,pv,S)
          :(pu<0||pu>=S||pv<0||pv>=S)?-1:faceMap[b.face][pv*S+pu];
        if(idx<0) continue;
        const dist=Math.sqrt(d2)/R;
        const shade=1.0-dist*0.55;
        const edge2=dist>0.75?0.5:1.0;
        const br=b.cr*shade*edge2, bg=b.cg*shade*edge2, bb=b.cb*shade*edge2;
        colBuf[idx*3]=Math.max(colBuf[idx*3],br);
        colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],bg);
        colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],bb);
      }
    }
  }

  // Ball-ball collisions within same face
  for(let i=0;i<balls.length;i++){
    for(let j=i+1;j<balls.length;j++){
      const a=balls[i], b2=balls[j];
      if(a.face!==b2.face) continue;
      const dx=b2.u-a.u, dy=b2.v-a.v;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const minD=a.r+b2.r;
      if(dist<minD&&dist>0.1){
        const nx=dx/dist, ny=dy/dist;
        const overlap=(minD-dist)*0.5;
        a.u-=nx*overlap; a.v-=ny*overlap;
        b2.u+=nx*overlap; b2.v+=ny*overlap;
        const relV=(b2.du-a.du)*nx+(b2.dv-a.dv)*ny;
        if(relV<0){
          a.du+=relV*nx*0.5; a.dv+=relV*ny*0.5;
          b2.du-=relV*nx*0.5; b2.dv-=relV*ny*0.5;
        }
      }
    }
  }
}

// ── GRAVITY SAND ──
// ── GRAVITY SAND ──────────────────────────────────────────────────────────
// Each grain lives as a single pixel on one of the 6 cube faces.
// Gravity pulls grains down their current face; at edges they transfer
// to the neighbouring face so grains accumulate on whichever face is lowest.

let sand=[];
let sandHues=null;
let sandNeighbours=null;
let sandLevelT=0;

function buildSandNeighbours(){
  // For every surface LED, find all adjacent surface LEDs (share an edge in 3D grid).
  // Adjacency = differ by 1 in exactly one axis while staying on the surface.
  // This is precomputed once per cube size.
  sandNeighbours = new Array(N);
  for(let i=0;i<N;i++){
    const x=gridX[i], y=gridY[i], z=gridZ[i];
    const nb=[];
    // Check all 6 face-adjacent positions
    const S=SIZE, S1=S-1;
    const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(const [dx,dy,dz] of dirs){
      const nx=x+dx, ny=y+dy, nz=z+dz;
      if(nx<0||nx>=S||ny<0||ny>=S||nz<0||nz>=S) continue;
      // Must be a surface LED (on at least one face)
      if(nx!==0&&nx!==S1&&ny!==0&&ny!==S1&&nz!==0&&nz!==S1) continue;
      // Find the LED index at this position using faceMap
      let found=-1;
      if(nz===S1 && found<0) found=faceMap[0][ny*S+nx];
      if(nz===0  && found<0) found=faceMap[1][ny*S+(S1-nx)];
      if(nx===S1 && found<0) found=faceMap[2][ny*S+(S1-nz)];
      if(nx===0  && found<0) found=faceMap[3][ny*S+nz];
      if(ny===S1 && found<0) found=faceMap[4][nz*S+nx];
      if(ny===0  && found<0) found=faceMap[5][nz*S+nx];
      if(found>=0) nb.push(found);
    }
    sandNeighbours[i]=nb;
  }
}

function resetSand(){
  if(!N||!faceMap) return;
  buildSandNeighbours();
  // In 2D mode, only use face 0 LEDs
  const pool=[];
  if(panel2dMode){
    const S=SIZE;
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[0][v*S+u]; if(idx>=0) pool.push(idx);
    }
  } else {
    for(let i=0;i<N;i++) pool.push(i);
  }
  const target=Math.floor(pool.length/3);
  const indices=new Int32Array(pool);
  for(let i=indices.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    const tmp=indices[i]; indices[i]=indices[j]; indices[j]=tmp;
  }
  // Assign each grain a fixed random hue in sandy/earthy tones
  sandHues=new Float32Array(N);
  for(let i=0;i<N;i++) sandHues[i]=0.04+Math.random()*0.10; // warm amber→ochre range
  sand=Array.from(indices.subarray(0,target));
}

function effectGravitySand(dt){
  t+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  if(!sandNeighbours) buildSandNeighbours();

  // Gravity in world space (normalised) — negate so grains fall DOWN (lowest dot product)
  let gx, gy, gz;
  if(panel2dMode){
    // 2D mode: fixed gravity straight down (ignore invisible cube rotation)
    gx=0; gy=1; gz=0;
  } else {
    const rawG=getLocalGravity(1);
    const gLen=Math.sqrt(rawG.x*rawG.x+rawG.y*rawG.y+rawG.z*rawG.z)||1;
    gx=-rawG.x/gLen; gy=-rawG.y/gLen; gz=-rawG.z/gLen;
  }

  // "Height" of a LED in gravity direction — lower = further down
  // dot(pos, gravity) — most negative = lowest
  function gravHeight(i){
    return gridX[i]*gx + gridY[i]*gy + gridZ[i]*gz;
  }

  // Build occupancy set
  const occ=new Uint8Array(N);
  for(const i of sand) occ[i]=1;

  // Run multiple passes per frame so sand settles faster
  const PASSES = 3;
  for(let pass=0;pass<PASSES;pass++){

  // Shuffle grains each pass to remove directional bias
  for(let i=sand.length-1;i>0;i--){
    const j=(Math.random()*(i+1))|0;
    const tmp=sand[i]; sand[i]=sand[j]; sand[j]=tmp;
  }

  // Each grain falls to the lowest available neighbour
  for(let gi=0;gi<sand.length;gi++){
    const idx=sand[gi];
    const h0=gravHeight(idx);
    const nb=sandNeighbours[idx];

    let bestIdx=-1, bestH=h0-0.001;
    for(const n of nb){
      if(occ[n]) continue;
      const hn=gravHeight(n);
      if(hn<bestH){ bestH=hn; bestIdx=n; }
    }

    if(bestIdx>=0){
      occ[idx]=0; occ[bestIdx]=1; sand[gi]=bestIdx;
    } else {
      // Two-step lookahead slide
      let slideIdx=-1, slideScore=Infinity;
      for(const n of nb){
        if(occ[n]) continue;
        const hn=gravHeight(n);
        if(hn > h0+1.5) continue;
        let lowestFromN=hn;
        for(const nn of sandNeighbours[n]){
          if(occ[nn]&&nn!==idx) continue;
          const hnn=gravHeight(nn);
          if(hnn<lowestFromN) lowestFromN=hnn;
          for(const nnn of sandNeighbours[nn]){
            if(occ[nnn]&&nnn!==idx&&nnn!==n) continue;
            const hnnn=gravHeight(nnn);
            if(hnnn<lowestFromN) lowestFromN=hnnn;
          }
        }
        if(lowestFromN<slideScore){ slideScore=lowestFromN; slideIdx=n; }
      }
      if(slideIdx>=0 && slideScore<h0-0.5){
        occ[idx]=0; occ[slideIdx]=1; sand[gi]=slideIdx;
      }
    }
  }
  } // end PASSES

  // ── Levelling pass — runs every 6 frames to equalise surface height ──
  // Settled grains slide sideways toward lower neighbours, creating a flat surface.
  sandLevelT=(sandLevelT||0)+1;
  if(sandLevelT%6===0){
    for(let i=sand.length-1;i>0;i--){
      const j=(Math.random()*(i+1))|0;
      const tmp=sand[i]; sand[i]=sand[j]; sand[j]=tmp;
    }
    for(let gi=0;gi<sand.length;gi++){
      const idx=sand[gi];
      const h0=gravHeight(idx);
      const nb=sandNeighbours[idx];
      // Only level grains that are settled (hemmed in by neighbours)
      let occupied=0;
      for(const n of nb) if(occ[n]) occupied++;
      if(occupied<2) continue;
      // Slide to any lower unoccupied neighbour
      let levelIdx=-1, levelH=h0-0.25;
      for(const n of nb){
        if(occ[n]) continue;
        const hn=gravHeight(n);
        if(hn<levelH){ levelH=hn; levelIdx=n; }
      }
      if(levelIdx>=0){
        occ[idx]=0; occ[levelIdx]=1; sand[gi]=levelIdx;
      }
    }
  }

  // Render — each grain is 1 LED with its own hue
  for(let gi=0;gi<sand.length;gi++){
    const i=sand[gi];
    const hue=sandHues ? sandHues[gi] : 0.07;
    const bright=0.45+Math.random()*0.20; // slight shimmer
    const [r,g,b]=hsl(hue,0.82,bright);
    colBuf[i*3]=r; colBuf[i*3+1]=g; colBuf[i*3+2]=b;
  }
}

// ═══════════════════════════════════════════════════
//  CRYSTAL LIFE — Conway's Game of Life on cube surface
// ═══════════════════════════════════════════════════
let lifeGrid=null,lifeNext=null,lifeAge=null,lifeGenT=0;
function initLife(){
  lifeGrid=new Uint8Array(N); lifeNext=new Uint8Array(N); lifeAge=new Uint8Array(N);
  for(let i=0;i<N;i++) lifeGrid[i]=Math.random()<0.35?1:0;
}
function stepLife(){
  for(let i=0;i<N;i++){
    const x=gridX[i],y=gridY[i],z=gridZ[i];
    let nb=0;
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[1,-1,0],[-1,1,0],[-1,-1,0],[1,0,1],[1,0,-1],[-1,0,1],[-1,0,-1],[0,1,1],[0,1,-1],[0,-1,1],[0,-1,-1]]){
      const j=surfIdx(x+dx,y+dy,z+dz); if(j>=0&&lifeGrid[j]) nb++;
    }
    const alive=lifeGrid[i];
    lifeNext[i]=alive?(nb>=4&&nb<=6?1:0):(nb===5||nb===6?1:0);
    if(lifeNext[i]&&!alive) lifeAge[i]=0;
    else if(lifeNext[i]) lifeAge[i]=Math.min(255,lifeAge[i]+1);
    else lifeAge[i]=Math.max(0,lifeAge[i]-3);
  }
  const tmp=lifeGrid; lifeGrid=lifeNext; lifeNext=tmp;
}
function effectLife(dt){
  t+=dt;
  if(!lifeGrid||lifeGrid.length!==N) initLife();
  lifeGenT+=dt;
  if(lifeGenT>0.06){ lifeGenT=0; stepLife(); }
  // Reseed if stagnant
  let pop=0; for(let i=0;i<N;i++) pop+=lifeGrid[i];
  if(pop<N*0.008||pop>N*0.88) initLife();

  for(let i=0;i<N;i++){
    if(lifeGrid[i]){
      const age=lifeAge[i]/255;
      // Crystal colours: cyan→violet→gold as cells age — geometric growth pattern
      const hue=age<0.33
        ? lerp(0.50,0.62,age*3)      // young: aqua→cyan
        : age<0.66
        ? lerp(0.62,0.75,( age-0.33)*3) // mid: cyan→violet
        : lerp(0.75,0.13,(age-0.66)*3); // old: violet→gold
      const bright=0.5+age*0.45;
      const sat=1-age*0.15;
      const [r,g,b]=hsl(hue,sat,bright);
      // Pulse older cells gently
      const pulse=age>0.5?0.06*Math.sin(t*3+i*0.1):0;
      setLED(i,Math.min(1,r+pulse),Math.min(1,g+pulse),Math.min(1,b+pulse));
    } else if(lifeAge[i]>0){
      // Death fade — sparks orange briefly
      const fade=lifeAge[i]/255;
      setLED(i,...hsl(0.06,1,fade*0.5));
    } else {
      setLED(i,0,0,0.01); // very faint dark-blue background
    }
  }
}
// ═══════════════════════════════════════════════════
//  LIQUID CRYSTAL — sloshing fluid responds to gyro
// ═══════════════════════════════════════════════════
let fluidH=null, fluidV=null, fluidT2=0;
function resetFluid(){ fluidH=new Float32Array(N); fluidV=new Float32Array(N); }
function effectFluid(dt){
  t+=dt;
  if(!fluidH||fluidH.length!==N) resetFluid();
  fluidT2+=dt;
  const grav=getLocalGravity(1);
  // Normalise gravity
  const gl=Math.sqrt(grav.x*grav.x+grav.y*grav.y+grav.z*grav.z)||1;
  const gx=grav.x/gl, gy=grav.y/gl, gz=grav.z/gl;

  // Wave propagation with gravity-driven flow
  const SPEED=28, DAMP=0.96, GRAV_STR=14;
  const newH=new Float32Array(N);
  for(let i=0;i<N;i++){
    const x=gridX[i],y=gridY[i],z=gridZ[i];
    let lap=0, cnt=0;
    for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
      const j=surfIdx(x+dx,y+dy,z+dz);
      if(j>=0){ lap+=fluidH[j]; cnt++; }
    }
    if(cnt){
      const avg=lap/cnt;
      const slope=(gx*(surfX[i]-0.5)+gy*(surfY[i]-0.5)+gz*(surfZ[i]-0.5));
      fluidV[i]=(fluidV[i]+dt*(SPEED*(avg-fluidH[i])-GRAV_STR*slope))*DAMP;
    }
    newH[i]=Math.max(-1,Math.min(1,fluidH[i]+fluidV[i]*dt));
  }
  for(let i=0;i<N;i++) fluidH[i]=newH[i];

  // Periodic splashes
  if(Math.random()<dt*1.5){
    const i=Math.random()*N|0;
    fluidH[i]+=0.8+Math.random()*0.6;
  }

  // Iridescent crystal rendering
  for(let i=0;i<N;i++){
    const h=fluidH[i];
    const abs=Math.abs(h);
    if(abs<0.03){ setLED(i,0,0,0.02); continue; }
    // Hue shifts with fluid height AND position for crystal interference pattern
    const posPhase=(surfX[i]+surfY[i]+surfZ[i])*2.1+fluidT2*0.15;
    const hue=(h>0
      ? 0.55+abs*0.15+Math.sin(posPhase)*0.08  // crest: cyan→electric blue
      : 0.02+abs*0.12+Math.sin(posPhase)*0.06) // trough: orange→gold
      %1;
    const sat=0.85+abs*0.15;
    const bright=Math.pow(abs,0.5)*0.9;
    const [r,g,b]=hsl(hue,sat,bright);
    // Specular glint on high crests
    const glint=Math.max(0,abs-0.75)*4;
    setLED(i,Math.min(1,r+glint*0.7),Math.min(1,g+glint*0.8),Math.min(1,b+glint));
  }
}
