
// ── WAVE CASCADE ── triple-layer interference + caustic sparkles ──
function effectWave(dt) {
  t += dt*1.1;
  for (let i=0;i<N;i++) {
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const w1=Math.sin((x+z)*6.2+t)*Math.cos(y*4.5-t*0.8);
    const w2=Math.sin((x-z)*4.8+t*1.4)*Math.sin(y*5.2+t*0.6);
    const w3=Math.sin((x*0.7+y*0.9+z*0.5)*7+t*0.9);
    const w=(w1+w2+w3)/3;
    const bright=w*0.5+0.5;
    const hue=(x*0.35+y*0.25+z*0.35+t*0.045)%1;
    let [r,g,b]=hsl(hue,1,bright*0.72);
    // caustic sparkle: where all 3 waves crest simultaneously
    const spark=Math.max(0,(w1+w2+w3-2.2)/0.8);
    r=Math.min(1,r+spark*0.9); g=Math.min(1,g+spark*0.9); b=Math.min(1,b+spark*0.9);
    setLED(i,r,g,b);
  }
}

// ── COLOR RAIN — enhanced: thick drops, bottom splash, lightning columns ──
let rainDrops=[];
function resetRain() {
  matrixStreams = null;
  if (!SIZE) return;
  rainDrops = [];
  const nDrops = Math.max(16, SIZE*2.5)|0;
  for (let face=0;face<4;face++)
  for (let d=0;d<nDrops;d++) {
    rainDrops.push({
      face, col: Math.random()*SIZE|0,
      y: Math.random()*SIZE, speed: 0.35+Math.random()*0.9,
      hue: Math.random(), len: 5+Math.random()*SIZE*0.22,
      bright: 0.7+Math.random()*0.3, wide: Math.random()<0.15,
    });
  }
}
// Matrix character set (katakana + digits)
const MTX_CHARS='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ\u30A1\u30A2\u30A3\u30A4\u30A5\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD';
let mtxCanvas=null,mtxCtx=null,mtxCols=[];

function mtxInit(){
  if(!mtxCanvas){
    mtxCanvas=document.createElement('canvas');
    mtxCanvas.width=SIZE; mtxCanvas.height=SIZE;
    mtxCtx=mtxCanvas.getContext('2d');
  }
  mtxCols=[];
  for(let f=0;f<4;f++) for(let c=0;c<SIZE;c++) mtxCols.push({face:f,col:c,y:Math.random()*SIZE,speed:0.5+Math.random()*1.5,trail:[]});
}

// Matrix rain state — per-face, per-column streams
let matrixStreams = null;
function initMatrixStreams(){
  matrixStreams = [];
  for(let face=0;face<4;face++){
    matrixStreams[face]=[];
    for(let u=0;u<SIZE;u++){
      matrixStreams[face][u]={
        head: SIZE-1 + Math.floor(Math.random()*SIZE*1.5), // start above top, staggered
        speed: 0.4 + Math.random()*0.7,
        len:   Math.floor(SIZE*0.25 + Math.random()*SIZE*0.45)
      };
    }
  }
}

function effectRain(dt) {
  t+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.78;

  if(typeof rainStyle!=='undefined' && rainStyle==='matrix'){
    if(!matrixStreams || matrixStreams.length===0) initMatrixStreams();

    // v=0=bottom, v=SIZE-1=top. Head starts at top (SIZE-1), falls toward bottom (0).
    // head value counts down from SIZE-1+offset toward 0.

    // ── 4 SIDE FACES ──
    for(let face=0;face<4;face++){
      for(let u=0;u<SIZE;u++){
        const stream = matrixStreams[face][u];

        // Head falls: decreasing v. We track headV as the current head row.
        stream.head -= stream.speed * dt * SIZE;

        // Reset when tail has fully exited the bottom (headV + len < 0)
        if(stream.head + stream.len < 0){
          // Restart above the top — random entry offset so not all sync
          stream.head = SIZE-1 + Math.floor(Math.random()*SIZE*0.8);
          stream.speed = 0.4 + Math.random()*0.7;
          stream.len   = Math.floor(SIZE*0.25 + Math.random()*SIZE*0.45);
        }

        const headV = Math.floor(stream.head);

        for(let v=0;v<SIZE;v++){
          // Tail trails ABOVE head (higher v = higher on panel = behind the falling head)
          const dist = v - headV; // positive = above head = in tail
          if(dist < 0 || dist > stream.len) continue;

          const idx = faceMap[face][v*SIZE+u];
          if(idx<0) continue;

          const isHead = dist === 0;
          if(isHead){
            colBuf[idx*3]   = 0.7;
            colBuf[idx*3+1] = 1.0;
            colBuf[idx*3+2] = 0.7;
          } else {
            const frac = 1 - dist/stream.len; // 1 just above head, 0 at tail tip
            const bright = Math.pow(frac, 1.8) * 0.9;
            const flicker = 0.7 + Math.random()*0.3;
            colBuf[idx*3]   = Math.max(colBuf[idx*3],   bright * 0.05);
            colBuf[idx*3+1] = Math.max(colBuf[idx*3+1], bright * flicker);
            colBuf[idx*3+2] = Math.max(colBuf[idx*3+2], bright * 0.05);
          }
        }
      }
    }

    // ── TOP PANEL — streams fall along v axis (same direction, inward) ──
    if(!matrixStreams[6]) {
      matrixStreams[6] = [];
      for(let u=0;u<SIZE;u++){
        matrixStreams[6][u] = {
          head: SIZE-1 + Math.floor(Math.random()*SIZE*1.5),
          speed: 0.35 + Math.random()*0.6,
          len:   Math.floor(SIZE*0.2 + Math.random()*SIZE*0.4)
        };
      }
    }
    for(let u=0;u<SIZE;u++){
      const stream = matrixStreams[6][u];
      stream.head -= stream.speed * dt * SIZE;
      if(stream.head + stream.len < 0){
        stream.head = SIZE-1 + Math.floor(Math.random()*SIZE*0.8);
        stream.speed = 0.35 + Math.random()*0.6;
        stream.len   = Math.floor(SIZE*0.2 + Math.random()*SIZE*0.4);
      }
      const headV = Math.floor(stream.head);
      for(let v=0;v<SIZE;v++){
        const dist = v - headV;
        if(dist < 0 || dist > stream.len) continue;
        const idx = faceMap[4][v*SIZE+u];
        if(idx<0) continue;
        const isHead = dist === 0;
        if(isHead){
          colBuf[idx*3]   = 0.7;
          colBuf[idx*3+1] = 1.0;
          colBuf[idx*3+2] = 0.7;
        } else {
          const frac = 1 - dist/stream.len;
          const bright = Math.pow(frac, 1.8) * 0.85;
          const flicker = 0.7 + Math.random()*0.3;
          colBuf[idx*3]   = Math.max(colBuf[idx*3],   bright * 0.05);
          colBuf[idx*3+1] = Math.max(colBuf[idx*3+1], bright * flicker);
          colBuf[idx*3+2] = Math.max(colBuf[idx*3+2], bright * 0.05);
        }
      }
    }
    return;
  }

  // ── COLOUR RAIN MODE ──
  for(const d of rainDrops){
    d.y -= d.speed*dt*(SIZE*0.48);
    if(d.y<-d.len){ d.y=SIZE+d.len; d.col=Math.random()*SIZE|0; d.hue=Math.random(); d.wide=Math.random()<0.15; }

    for(let k=0;k<d.len;k++){
      const vy=Math.round(d.y-k);
      if(vy<0||vy>=SIZE) continue;
      const fade=Math.pow(1-k/d.len,1.2)*d.bright;
      // Shift hue slightly along the drop for colour richness
      const h=(d.hue+k/d.len*0.15)%1;
      const [r,g,b]=hsl(h,1,fade*0.95);
      setFaceLED(d.face,d.col,vy,r,g,b);
      if(d.wide){
        setFaceLED(d.face,d.col-1,vy,r*0.5,g*0.5,b*0.5);
        setFaceLED(d.face,d.col+1,vy,r*0.5,g*0.5,b*0.5);
      }
      // Splash puddle at bottom
      if(vy===0 && k<4){
        const sp=fade*0.8;
        for(let s=-4;s<=4;s++){
          const sf=Math.max(0,1-Math.abs(s)/4)*sp*0.5;
          setFaceLED(d.face,d.col+s,0,...hsl(h,1,sf));
        }
      }
    }
    // Bright streak head
    const [rh,gh,bh]=hsl(d.hue,0.3,d.bright*1.0);
    setFaceLED(d.face,d.col,Math.round(d.y),rh,gh,bh);
  }

  // Occasional full-column chromatic flash
  if(Math.random()<dt*0.8){
    const face=Math.random()*4|0, col=Math.random()*SIZE|0, hue=Math.random();
    for(let y=0;y<SIZE;y++){
      const b2=Math.pow(Math.random(),1.5)*0.85;
      const [r,g,b]=hsl((hue+y/SIZE*0.3)%1,0.9,b2);
      setFaceLED(face,col,y,r,g,b);
    }
  }
}

// ── PLASMA STORM — 5-octave, chromatic aberration, pulsing eye ──
function effectPlasma(dt) {
  t+=dt*0.75;
  for (let i=0;i<N;i++) {
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const cx=x-0.5, cy=y-0.5, cz=z-0.5, dist=Math.sqrt(cx*cx+cy*cy+cz*cz);
    const v = Math.sin(x*7.1+t)
            + Math.sin(y*6.3+t*1.3)
            + Math.sin(z*7.5+t*0.9)
            + Math.sin((x+y+z)*4.2+t*0.5)
            + Math.sin(dist*11+t*1.6)*0.6;
    const bright=Math.pow((Math.sin(v*1.3)*0.5+0.5),1.2)*0.75;
    const hue=((v*0.12+t*0.04)%1+1)%1;
    const sat=0.85+Math.sin(t*0.7+dist*3)*0.15;
    const [r,g,b]=hsl(hue,sat,bright);
    // chromatic split on bright peaks
    const peak=Math.max(0,bright-0.55)*2;
    setLED(i, Math.min(1,r+peak*0.3), g, Math.min(1,b+peak*0.15));
  }
}

// ── MORPHING SPHERE — multi-shell, pulsing auroras, face projections ──
let sphAngle=0;
function effectSphere(dt) {
  t+=dt*0.5;
  sphAngle+=dt*0.28;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // 3 morphing sphere shells with different phases
  const R = [
    0.40+Math.sin(t*0.7)*0.10,
    0.28+Math.sin(t*1.1+1.0)*0.07,
    0.16+Math.sin(t*1.7+2.2)*0.04
  ];
  const hueBase=[
    (t*0.07)%1,
    (t*0.07+0.33)%1,
    (t*0.07+0.66)%1
  ];

  for(let i=0;i<N;i++){
    const x=surfX[i]-0.5, y=surfY[i]-0.5, z=surfZ[i]-0.5;
    const dist=Math.sqrt(x*x+y*y+z*z)*2;
    const lat=Math.asin(Math.max(-1,Math.min(1,(surfY[i]-0.5)/Math.max(0.001,dist/2))));
    const lng=Math.atan2(z,x)+sphAngle;

    let maxBright=0, bestHue=0;

    for(let sh=0;sh<3;sh++){
      const thickness=sh===0?0.14:sh===1?0.10:0.07;
      const s=Math.max(0,1-Math.abs(dist-R[sh]*1.41)/thickness);
      if(s>0){
        const glow=Math.pow(s,1.5);
        // Latitude bands create aurora-like ripples
        const aurora=0.5+0.5*Math.sin(lat*8+t*(1+sh*0.4)+lng*2);
        const bright=glow*aurora*(sh===0?0.9:sh===1?0.75:0.6);
        if(bright>maxBright){
          maxBright=bright;
          bestHue=(hueBase[sh]+lng/(Math.PI*2)*0.4+lat*0.15)%1;
        }
      }
    }

    // Equatorial hot band
    const eq=Math.exp(-lat*lat*20)*0.4*(0.5+0.5*Math.sin(lng*4+t*2));
    maxBright=Math.max(maxBright,eq);
    if(eq>0.05) bestHue=(bestHue+eq*0.1)%1;

    if(maxBright<0.018) continue;
    const [r,g,b]=hsl((bestHue+1)%1,1,maxBright);
    setLED(i,r,g,b);
  }

  // ── Side panels: project sphere shadow + scanning rings ──
  for(let face=0;face<4;face++){
    for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
      // Ring scan lines sweeping up each face
      const ringY=(v/SIZE + t*0.3 + face*0.25)%1;
      const ring=Math.pow(Math.max(0,1-Math.abs((ringY%0.25)*4-1)*3),3)*0.5;
      if(ring>0.01){
        // Centre-weighted horizontal glow
        const cx=Math.abs(u/SIZE-0.5)*2;
        const glow=ring*(1-cx*0.6);
        const h=(sphAngle/(Math.PI*2)+face*0.25+v/SIZE*0.3+t*0.05)%1;
        const [r,g,b]=hsl((h+1)%1,1,glow);
        const idx=faceMap[face][v*SIZE+u];
        if(idx>=0){
          colBuf[idx*3]=Math.max(colBuf[idx*3],r);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
        }
      }
      // Vertical energy columns at sphere's equator
      const colPulse=Math.pow(Math.max(0,Math.sin(u/SIZE*Math.PI*6+sphAngle*3+t)),4)*0.6;
      if(colPulse>0.01){
        const h2=(u/SIZE+t*0.08)%1;
        const [r,g,b]=hsl(h2,1,colPulse);
        const idx=faceMap[face][v*SIZE+u];
        if(idx>=0){
          colBuf[idx*3]=Math.max(colBuf[idx*3],r);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
        }
      }
    }
  }

  // ── Top panel: sphere overhead view — concentric aurora rings ──
  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    const dx=u/SIZE-0.5, dy=v/SIZE-0.5;
    const rad=Math.sqrt(dx*dx+dy*dy)*2;
    const ang=Math.atan2(dy,dx)+sphAngle;
    for(let sh=0;sh<3;sh++){
      const s=Math.max(0,1-Math.abs(rad-R[sh])/0.1);
      if(s>0.05){
        const aurora=0.5+0.5*Math.sin(ang*5+t*(1.5+sh*0.5));
        const bright=Math.pow(s,1.5)*aurora*(0.8-sh*0.15);
        const h=(hueBase[sh]+ang/(Math.PI*2)*0.4)%1;
        const [r,g,b]=hsl((h+1)%1,1,bright);
        const idx=faceMap[4][v*SIZE+u];
        if(idx>=0){
          colBuf[idx*3]=Math.max(colBuf[idx*3],r);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
        }
      }
    }
  }
}

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
const FW_FACES = [0,2,1,3]; // clockwise physical face order

function fwPx(col, v) {
  const S = SIZE, total = S * 4;
  const c = ((col % total) + total) % total;
  const qi = (c / S) | 0;
  const fu = c % S;
  if (v < 0 || v >= S) return -1;
  return faceMap[FW_FACES[qi]][v * S + fu];
}

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
    vy: SIZE * (0.6 + Math.random() * 0.4),
    vc: (Math.random() - 0.5) * SIZE * 0.3,
    hue: Math.random(),
    hue2: Math.random(),
    trail: []
  });
}

function fwBurst(col, v, hue, hue2) {
  const mono = Math.random() > 0.5;
  const type = Math.random();
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
    const d = i * 50;
    fwSyncRocket(center + off * sp * 0.3, SIZE * (0.65 + Math.random() * 0.25), off * sp * 0.8, hue, (hue + 0.15) % 1, d);
  }
}

// Staggered volley from one face — same color family
function fwVolley(faceIdx, pal, count) {
  const base = faceIdx * SIZE;
  const n = count || 4 + Math.floor(Math.random() * 3);
  const hue = fwHue(pal);
  for (let i = 0; i < n; i++) {
    const sc = base + SIZE * 0.15 + Math.random() * SIZE * 0.7;
    fwSyncRocket(sc, SIZE * (0.6 + Math.random() * 0.35), (Math.random() - 0.5) * SIZE * 0.1, hue, (hue + 0.2 + Math.random() * 0.1) % 1, i * 80);
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
    fwSyncRocket(sc, SIZE * (0.55 + Math.random() * 0.35), 0, (hue + i * 0.02) % 1, (hue + 0.4) % 1, i * 100);
  }
}

// Symmetry — matching launches from opposite faces
function fwSymmetry(pal) {
  const hue = fwHue(pal);
  const pairs = [[0, 2], [1, 3]];
  const pair = pairs[Math.floor(Math.random() * 2)];
  for (let i = 0; i < 3; i++) {
    const off = SIZE * 0.2 + Math.random() * SIZE * 0.6;
    const vy = SIZE * (0.6 + Math.random() * 0.3);
    const h = (hue + i * 0.06) % 1;
    fwSyncRocket(pair[0] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 120);
    fwSyncRocket(pair[1] * SIZE + off, vy, 0, h, (h + 0.3) % 1, i * 120);
  }
}

// Waterfall — dense short bursts raining down from all 4 faces
function fwWaterfall(pal) {
  const total = SIZE * 4;
  const hue = fwHue(pal);
  for (let i = 0; i < 16; i++) {
    const sc = Math.random() * total;
    fwSyncRocket(sc, SIZE * (0.35 + Math.random() * 0.2), (Math.random() - 0.5) * SIZE * 0.05, (hue + Math.random() * 0.08) % 1, hue, i * 40);
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
    fwSyncRocket(sc, SIZE * (0.45 + Math.random() * 0.5), (Math.random() - 0.5) * SIZE * 0.2, hue, (hue + 0.4) % 1, i * 60 + Math.random() * 40);
  }
}

const FW_SYNC_ACTS = [
  // Act 1: fans from each face in sequence
  () => { const pal = fwPal(); for (let f = 0; f < 4; f++) setTimeout(() => fwFan(f * SIZE + SIZE / 2, pal), f * 700); return 4.0; },
  // Act 2: volleys alternating faces, two color families
  () => { const p1 = fwPal(), p2 = fwPal(); fwVolley(0, p1, 5); setTimeout(() => fwVolley(2, p2, 5), 600); setTimeout(() => fwVolley(1, p1, 5), 1200); setTimeout(() => fwVolley(3, p2, 5), 1800); return 4.5; },
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

  // ── Scrolling text overlay — uses same setStripLED pattern as F1 idle scroll ──
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

let fwTextOn=false, fwScrollX=0, fwTextPixels=null, fwTextWidth=0, fwTextH=0;

function buildFwText(msg){
  if(!msg||!msg.trim()){ fwTextPixels=null; return; }
  const maxH=Math.round(SIZE*0.33);
  const fh=Math.min(maxH, Math.max(8, maxH-2));

  const oc=document.createElement('canvas');
  const cx=oc.getContext('2d');

  const padText=msg.trim()+'   ';
  cx.font=`bold ${fh}px "Arial Black",Arial,sans-serif`;
  const oneW=Math.ceil(cx.measureText(padText).width);
  const totalW=Math.max(4*SIZE, oneW);

  oc.width=totalW; oc.height=maxH;
  cx.fillStyle='#000'; cx.fillRect(0,0,totalW,maxH);
  cx.fillStyle='#fff';
  cx.font=`bold ${fh}px "Arial Black",Arial,sans-serif`;
  cx.textBaseline='middle';
  const yc=maxH/2;

  let x=0;
  while(x<totalW){
    cx.fillText(padText,x,yc);
    x+=Math.max(1,oneW);
  }

  fwTextPixels=new Uint8ClampedArray(cx.getImageData(0,0,totalW,maxH).data);
  fwTextWidth=totalW;
  fwTextH=maxH;
  fwScrollX=0;
}

// ── DNA HELIX — 4 strands, glow falloff, dual-color rungs ──
function effectDNA(dt) {
  t+=dt*0.55;
  for(let i=0;i<N*3;i++) colBuf[i]*=plTransActive?0:0.82;

  const STRANDS=2; // Classic double helix
  const RADIUS=SIZE*0.36;
  const TURNS=4; // Full turns across the panel height

  // ── Side panels: double helix with rungs ──
  for(let face=0;face<4;face++){
    const faceHue=face*0.25;

    for(let y=0;y<SIZE;y++){
      const progress=y/SIZE;
      for(let s=0;s<STRANDS;s++){
        const ang=progress*Math.PI*2*TURNS + t*1.4 + s*Math.PI;
        const uc=SIZE/2 + Math.cos(ang)*RADIUS;
        const ui=Math.round(uc);
        if(ui<0||ui>=SIZE) continue;

        // Strand colour — shifts along the helix and over time
        const hue=(faceHue + progress*0.5 + t*0.06 + s*0.5)%1;
        const bright=0.95;
        const [r,g,b]=hsl(hue,1,bright);
        setFaceLED(face,ui,y,r,g,b);

        // Soft glow either side
        for(let d=1;d<=3;d++){
          const fade=Math.pow(1-d/4,2)*0.7;
          const [rg,gg,bg]=hsl(hue,0.9,fade);
          setFaceLED(face,ui-d,y,rg,gg,bg);
          setFaceLED(face,ui+d,y,rg,gg,bg);
        }
      }

      // Rungs connecting the two strands — every 3 LEDs
      if(y%3===0){
        const ang0=progress*Math.PI*2*TURNS + t*1.4;
        const u0=SIZE/2+Math.cos(ang0)*RADIUS;
        const u1=SIZE/2+Math.cos(ang0+Math.PI)*RADIUS;
        const uMin=Math.round(Math.min(u0,u1));
        const uMax=Math.round(Math.max(u0,u1));
        const rungHue=(faceHue + progress*0.5 + t*0.06 + 0.5)%1;
        for(let u=uMin;u<=uMax;u++){
          if(u<0||u>=SIZE) continue;
          const frac=(u-uMin)/Math.max(1,uMax-uMin);
          const bright=Math.sin(frac*Math.PI)*0.8; // brighter in middle
          const [rr,gr,br]=hsl(rungHue,1,bright);
          setFaceLED(face,u,y,rr,gr,br);
        }
      }
    }

    // Vertical edge accent: pulsing columns at each side
    for(let y=0;y<SIZE;y++){
      const pulse=0.3+0.3*Math.sin(t*2+face+y*0.1);
      const [re,ge,be]=hsl((faceHue+t*0.05)%1,1,pulse);
      setFaceLED(face,0,y,re,ge,be);
      setFaceLED(face,SIZE-1,y,re,ge,be);
    }
  }

  // ── Top panel: stunning double helix end-on view — looking down the axis ──
  // Renders the helix as concentric rotating rings with colour
  const cx2=SIZE/2, cy2=SIZE/2;
  for(let v=0;v<SIZE;v++){
    for(let u=0;u<SIZE;u++){
      const dx=u-cx2, dy=v-cy2;
      const rad=Math.sqrt(dx*dx+dy*dy);
      const ang2=Math.atan2(dy,dx);

      // Two spiral arms rotating over time
      for(let s=0;s<STRANDS;s++){
        const armAng=ang2 - t*1.4 - s*Math.PI;
        // Spiral: radius matches the helix at this angle
        const targetRad=RADIUS*(0.5+0.5*Math.sin(armAng*TURNS*2));
        const dist=Math.abs(rad-targetRad);
        if(dist<SIZE*0.08){
          const bright=Math.pow(1-dist/(SIZE*0.08),2)*0.9;
          const hue=(ang2/(Math.PI*2) + t*0.08 + s*0.5)%1;
          const [r,g,b]=hsl((hue+1)%1,1,bright);
          const idx=faceMap[4][v*SIZE+u];
          if(idx>=0){
            colBuf[idx*3]=Math.max(colBuf[idx*3],r);
            colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
            colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
          }
        }
      }

      // Central glowing core
      if(rad < SIZE*0.06){
        const bright=(1-rad/(SIZE*0.06))*0.8;
        const [r,g,b]=hsl((t*0.1)%1,0.5,bright);
        const idx=faceMap[4][v*SIZE+u];
        if(idx>=0){
          colBuf[idx*3]=Math.max(colBuf[idx*3],r);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
        }
      }
    }
  }
}

// ── TIME & DATE ──
const DT_RES=512;  // Higher resolution for crisp text on 64×64 LEDs
let dtCanvas=null,dtCtx=null,dtPixels=null,dtLastSec=-1,dtScrollX=0,dtMode='time';
// When set (panel editor / custom cube), single-face effects draw onto this face
let _peTargetFace=-1;
let _peTargetOpts=null;

function dtRender(now){
  if(!dtCanvas){
    dtCanvas=document.createElement('canvas');
    dtCanvas.width=DT_RES; dtCanvas.height=DT_RES;
    dtCtx=dtCanvas.getContext('2d');
  }
  const ctx=dtCtx;
  ctx.clearRect(0,0,DT_RES,DT_RES);
  ctx.fillStyle='#000'; ctx.fillRect(0,0,DT_RES,DT_RES);

  const mode=(_peTargetOpts&&_peTargetOpts.mode)?_peTargetOpts.mode:dtMode;

  const hh=String(now.getHours()).padStart(2,'0');
  const mm=String(now.getMinutes()).padStart(2,'0');
  const ss=String(now.getSeconds()).padStart(2,'0');
  const days=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dayStr=days[now.getDay()];
  const dateStr=now.getDate()+' '+months[now.getMonth()];

  ctx.save();
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='#fff';

  if(mode==='time'){
    ctx.shadowBlur=28; ctx.fillStyle='#ffffff';
    ctx.font='bold 160px monospace'; // reduced from 200px to fit with padding
    ctx.fillText(hh+':'+mm, DT_RES/2, DT_RES*0.38);
    ctx.shadowBlur=20; ctx.font='bold 110px monospace'; ctx.fillStyle='#ccddff';
    ctx.fillText(':'+ss, DT_RES/2, DT_RES*0.72);
  } else if(mode==='date'){
    ctx.shadowBlur=20; ctx.fillStyle='#aabbdd';
    ctx.font='bold 110px monospace';
    ctx.fillText(dayStr, DT_RES/2, DT_RES*0.35);
    ctx.font='bold 120px monospace'; ctx.fillStyle='#99bbdd';
    ctx.fillText(dateStr, DT_RES/2, DT_RES*0.70);
  } else if(mode==='both'){
    ctx.shadowBlur=28; ctx.fillStyle='#ffffff';
    ctx.font='bold 160px monospace';
    ctx.fillText(hh+':'+mm, DT_RES/2, DT_RES*0.28);
    ctx.shadowBlur=12; ctx.font='bold 80px monospace'; ctx.fillStyle='#aabbdd';
    ctx.fillText(dayStr, DT_RES/2, DT_RES*0.58);
    ctx.font='bold 80px monospace'; ctx.fillStyle='#99bbdd';
    ctx.fillText(dateStr, DT_RES/2, DT_RES*0.80);
  } else if(mode==='analogue'){
    const cx=DT_RES/2, cy=DT_RES/2, S=DT_RES*0.88;
    const half=S/2;
    // Square border
    ctx.strokeStyle='#3a5a8a'; ctx.lineWidth=6;
    ctx.strokeRect(cx-half,cy-half,S,S);

    // Map angle to point on square edge
    function angleToSquare(a){
      const ta=Math.tan(a);
      let x,y;
      if(a>=-Math.PI/4&&a<Math.PI/4){x=half;y=half*ta;}
      else if(a>=Math.PI/4&&a<3*Math.PI/4){y=half;x=half/Math.tan(a);}
      else if(a>=3*Math.PI/4||a<-3*Math.PI/4){x=-half;y=-half*ta;}
      else{y=-half;x=-half/Math.tan(a);}
      return [cx+x,cy+y];
    }

    // 5-minute markers on edge
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6 - Math.PI/2;
      const [px,py]=angleToSquare(a);
      const isCardinal=(i%3===0);
      ctx.fillStyle=isCardinal?'#ddeeff':'#8899bb';
      const sz=isCardinal?12:7;
      ctx.fillRect(px-sz/2,py-sz/2,sz,sz);
    }
    // Minute tick marks on edge
    for(let i=0;i<60;i++){
      if(i%5===0) continue;
      const a=i*Math.PI/30 - Math.PI/2;
      const [px,py]=angleToSquare(a);
      ctx.fillStyle='#445566';
      ctx.fillRect(px-2,py-2,4,4);
    }

    const h=now.getHours()%12, m=now.getMinutes(), s=now.getSeconds(), ms=now.getMilliseconds();
    const ha=(h+m/60+s/3600)*Math.PI/6 - Math.PI/2;
    const ma=(m+s/60)*Math.PI/30 - Math.PI/2;
    const sa=(s+ms/1000)*Math.PI/30 - Math.PI/2;
    ctx.lineCap='round';
    // Hour hand
    ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=8;
    ctx.strokeStyle='#ffffff'; ctx.lineWidth=14;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(ha)*half*0.5,cy+Math.sin(ha)*half*0.5); ctx.stroke();
    // Minute hand
    ctx.strokeStyle='#ccddff'; ctx.lineWidth=8;
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(ma)*half*0.75,cy+Math.sin(ma)*half*0.75); ctx.stroke();
    // Second hand
    ctx.shadowBlur=4; ctx.strokeStyle='#ff3333'; ctx.lineWidth=4;
    ctx.beginPath(); ctx.moveTo(cx-Math.cos(sa)*half*0.12,cy-Math.sin(sa)*half*0.12);
    ctx.lineTo(cx+Math.cos(sa)*half*0.85,cy+Math.sin(sa)*half*0.85); ctx.stroke();
    ctx.shadowBlur=0;
    // Center dot
    ctx.fillStyle='#ff3333'; ctx.beginPath(); ctx.arc(cx,cy,6,0,Math.PI*2); ctx.fill();
  } else { // full
    ctx.shadowBlur=28; ctx.fillStyle='#ffffff';
    ctx.font='bold 160px monospace';
    ctx.fillText(hh+':'+mm, DT_RES/2, DT_RES*0.22);
    ctx.shadowBlur=20; ctx.font='bold 110px monospace'; ctx.fillStyle='#ccddff';
    ctx.fillText(':'+ss, DT_RES/2, DT_RES*0.45);
    ctx.shadowBlur=12; ctx.font='bold 70px monospace'; ctx.fillStyle='#aabbdd';
    ctx.fillText(dayStr, DT_RES/2, DT_RES*0.68);
    ctx.font='bold 70px monospace'; ctx.fillStyle='#99bbdd';
    ctx.fillText(dateStr, DT_RES/2, DT_RES*0.88);
  }
  ctx.restore();
  dtPixels=ctx.getImageData(0,0,DT_RES,DT_RES).data;
}

function dtRenderMirrored(){
  // Create a horizontally flipped version for back-facing panels
  if(!dtCanvas) dtRender(new Date());
  const canvas2=document.createElement('canvas');
  canvas2.width=DT_RES; canvas2.height=DT_RES;
  const ctx2=canvas2.getContext('2d');
  ctx2.scale(-1,1);
  ctx2.drawImage(dtCanvas,-DT_RES,0);
  return ctx2.getImageData(0,0,DT_RES,DT_RES).data;
}

function effectDateTime(dt) {
  t+=dt*0.8;
  const now=new Date(), sec=now.getSeconds();
  const mode=(_peTargetOpts&&_peTargetOpts.mode)?_peTargetOpts.mode:dtMode;
  if(mode==='analogue'||sec!==dtLastSec||!dtPixels||_peTargetOpts){ dtLastSec=_peTargetOpts?-1:sec; dtRender(now); }

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const allPanels = _peTargetOpts ? false : document.getElementById('dt-allpanels-check')?.checked;
  const scrollOn  = _peTargetOpts ? !!_peTargetOpts.scroll : document.getElementById('dt-scroll-check')?.checked;
  const speed     = _peTargetOpts ? 1 : (parseFloat(document.getElementById('dt-scroll-speed')?.value||'0')||0);
  const scale     = DT_RES / SIZE;

  if(scrollOn && speed!==0) dtScrollX=(dtScrollX+dt*speed*SIZE*0.5+4*SIZE)%(4*SIZE);

  // Panels in scroll order going around cube: left(3), front(0), right(2), back(1)
  // needsFlip: whether the face's u-axis runs opposite to scroll direction
  const panelSeq  = [3, 0, 2, 1];
  const needsFlip = [false, false, true, true]; // left=ok, front=ok, right=flip, back=flip

  function paintFace(face, flip, srcOffsetLEDs, hue){
    for(let v=0;v<SIZE;v++){
      for(let u=0;u<SIZE;u++){
        // Which LED column in the virtual strip does u correspond to?
        const ledU = flip ? (SIZE-1-u) : u;
        const srcPx = Math.floor((ledU + srcOffsetLEDs) * scale);
        const cx = ((srcPx % DT_RES) + DT_RES) % DT_RES;
        const cy = Math.min(DT_RES-1, Math.floor(v * scale));
        const pi = (cy*DT_RES + cx)*4;
        const pv = dtPixels[pi]/255;
        if(pv < 0.04) continue;
        const lv = SIZE-1-v;
        const [r,g,b] = hsl(hue, 1, pv);
        const idx = faceMap[face][lv*SIZE+u];
        if(idx>=0){colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;}
      }
    }
  }

  if(_peTargetFace>=0){
    // Panel editor: draw the clock onto the assigned face, flip if needed
    const flipMap={0:false,1:true,2:true,3:false,4:false,5:false};
    paintFace(_peTargetFace, flipMap[_peTargetFace]||false, 0, (t*0.09)%1);
  } else if(!allPanels && !scrollOn){
    // Front face only
    paintFace(0, false, 0, (t*0.09)%1);

  } else if(allPanels && !scrollOn){
    // Same text on all 4 panels simultaneously, each oriented correctly
    for(let pi=0;pi<4;pi++){
      const hue = (pi/4*0.8 + t*0.09)%1;
      paintFace(panelSeq[pi], needsFlip[pi], 0, hue);
    }

  } else {
    // Scroll: dtScrollX is in LED units across the 4×SIZE virtual strip
    // Each panel occupies SIZE LEDs in the strip starting at pi*SIZE
    for(let pi=0;pi<4;pi++){
      // srcOffset: how many LED-widths of the canvas to skip for this face
      const faceStart = pi * SIZE;
      const srcOffsetLEDs = dtScrollX - faceStart;
      const hue = ((dtScrollX/(4*SIZE))*0.8 + t*0.09)%1;
      paintFace(panelSeq[pi], needsFlip[pi], srcOffsetLEDs, hue);
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
    // Apply gravity nudge from cube rotation
    if(rotChange>0.005){
      const fu=FU[b.face], fv=FV[b.face];
      const gu=gx*fu[0]+gy*fu[1]+gz*fu[2];
      const gv=gx*fv[0]+gy*fv[1]+gz*fv[2];
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
      if(nz===0  && found<0) found=faceMap[1][ny*S+nx];
      if(nx===S1 && found<0) found=faceMap[2][ny*S+nz];
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

// ── GRADIENT: RAINBOW WASH ──
function effectGradientWash(dt){
  t+=dt*0.4;
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const wave=Math.sin(x*Math.PI*2+t)*0.5+0.5;
    const bright=lerp(0.22,0.72,wave);
    const hue=(x*0.4+y*0.3+z*0.3+t*0.08)%1;
    const [r,g,b]=hsl(hue,1,bright);
    setLED(i,r,g,b);
  }
}

// ── AURORA BOREALIS — curtains + starfield on unlit faces ──
let auroraStar=null;
function effectAurora(dt){
  t+=dt*0.35;
  if(!auroraStar||auroraStar.length!==N){
    auroraStar=new Float32Array(N);
    for(let i=0;i<N;i++) auroraStar[i]=Math.random()<0.014?Math.random():0;
  }
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const c1=Math.sin(x*Math.PI*3.5+t*0.65)*Math.sin(z*Math.PI*2.8+t*0.42);
    const c2=Math.sin(x*Math.PI*2.2-t*0.38)*Math.cos(z*Math.PI*1.9+t*0.55)*0.6;
    const curtain=c1+c2;
    const fade=Math.pow(Math.max(0,y),0.45);
    const bright=Math.max(0,curtain)*fade*0.88;
    if(bright>0.02){
      const hue=lerp(0.30,0.82,sm(0,1,x+Math.sin(t*0.28)*0.25))+Math.sin(t*0.1)*0.04;
      const sat=0.9+Math.sin(t*0.8+x*2)*0.1;
      const [r,g,b]=hsl(hue,sat,bright);
      // second curtain color (magenta hints)
      const [r2,g2,b2]=hsl(hue+0.45,sat,bright*0.4*Math.max(0,c2));
      setLED(i,Math.min(1,r+r2),Math.min(1,g+g2),Math.min(1,b+b2));
    } else {
      // starfield on dark areas
      const s=auroraStar[i];
      if(s>0){const tw=0.5+0.5*Math.sin(t*2.3+s*12.7);setLED(i,tw*0.55,tw*0.55,tw*0.65);}
      else setLED(i,0,0,0);
    }
  }
}

// ── DEPTH RINGS — spiral-twisted, color bands, inverse pulse ──
function effectDepthRings(dt){
  t+=dt*0.75;
  for(let i=0;i<N;i++){
    const dx=surfX[i]-0.5,dy=surfY[i]-0.5,dz=surfZ[i]-0.5;
    const dist=Math.sqrt(dx*dx+dy*dy+dz*dz)*2;
    const ang=Math.atan2(dy,dx);
    const twist=ang*1.6+dist*2.5;           // spiral offset
    const ring=Math.sin(dist*Math.PI*9-t*2.4+twist);
    const ring2=Math.sin(dist*Math.PI*4.5+t*1.1+ang);
    const bright=((ring*0.6+ring2*0.4)*0.5+0.5)*(1-dist*0.42)*0.88;
    const hue=(dist*0.65+ang/(Math.PI*2)*0.3+t*0.055)%1;
    setLED(i,...hsl(hue,1,Math.max(0,bright)));
  }
}

// ── PRISM SWEEP — rotating diamond beam disperses into spectrum ──
function effectPrism(dt){
  t+=dt*0.55;
  const beamAng=t*0.6, beamW=0.18;
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const diag=(x+y+z)/3;
    const cross=Math.abs(x-z);
    const base=0.28+Math.sin(diag*Math.PI*5.5+t)*0.28;
    const hue=(diag*0.92+t*0.065)%1;
    let [r,g,b]=hsl(hue,0.78+sm(0,1,cross)*0.22,Math.max(0,base));
    // sweeping white diamond beam that disperses into rainbow
    const bDist=Math.abs(((x-0.5)*Math.cos(beamAng)+(z-0.5)*Math.sin(beamAng)));
    const beam=Math.max(0,1-bDist/beamW)*0.8;
    if(beam>0){
      const dispHue=(hue+bDist*1.5)%1;
      const [dr,dg,db]=hsl(dispHue,1,beam*0.9);
      r=Math.min(1,r+dr*beam+beam*0.3);
      g=Math.min(1,g+dg*beam+beam*0.3);
      b=Math.min(1,b+db*beam+beam*0.3);
    }
    setLED(i,r,g,b);
  }
}

// ── GRADIENT: COLOR TIDE ──
function effectTide(dt){
  t+=dt*0.6;
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const w1=Math.sin(x*Math.PI*2+t*0.8)*0.5+0.5;
    const w2=Math.sin(z*Math.PI*2-t*0.6)*0.5+0.5;
    const w3=Math.sin(y*Math.PI*1.5+t*0.4)*0.5+0.5;
    const blend=(w1+w2+w3)/3;
    const [r,g,b]=hsl((x*0.3+z*0.3+blend*0.25+t*0.04)%1,0.95,lerp(0.18,0.72,blend));
    setLED(i,r,g,b);
  }
}

// ── NEBULA DRIFT — deep space: bright cores, star sparks, rich color ──
let nebStars=null;
function effectNebula(dt){
  t+=dt*0.28;
  if(!nebStars||nebStars.length!==N){nebStars=[];for(let i=0;i<N;i++)nebStars.push({last:-1,next:Math.random()*8,bright:0});}
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    let d=0;
    d+=Math.sin(x*5.3+t*0.52)*Math.cos(y*4.9+t*0.31)*0.5;
    d+=Math.sin(z*6.5-t*0.42)*Math.sin(x*3.4+t*0.21)*0.38;
    d+=Math.cos((x+y+z)*4.2+t*0.58)*0.28;
    d+=Math.sin(x*8.8+y*6.1-t*0.35)*0.15;
    d=d*0.48+0.52;
    const bright=Math.pow(Math.max(0,d-0.08),1.4)*0.92;
    const hue=lerp(0.60,0.04,sm(0.18,0.88,d))+Math.sin(t*0.08)*0.05;
    const [r,g,b]=hsl(hue,0.85+d*0.15,bright);
    // bright nebula cores (highest density)
    const coreBoost=Math.max(0,d-0.75)*3.5;
    const ns=nebStars[i]; ns.next-=dt;
    let sr=0,sg=0,sb=0;
    if(ns.next<=0){ns.bright=0.6+Math.random()*0.4;ns.next=4+Math.random()*12;ns.last=t;}
    if(ns.bright>0){const age=t-ns.last;ns.bright=Math.max(0,ns.bright-dt*1.2);const sc=ns.bright;sr=sc;sg=sc;sb=sc+0.2;}
    setLED(i,Math.min(1,r+coreBoost*0.4+sr),Math.min(1,g+coreBoost*0.3+sg),Math.min(1,b+coreBoost*0.2+sb));
  }
}

// ═══════════════════════════════════════════════════
//  SPECTRUM ANALYSER / VU METER
//  Simulated music engine + optional live microphone
// ═══════════════════════════════════════════════════
let spectrumBandOverride = 32; // can be set by UI to 8, 16, 32
let spectrumFitToScreen = false;
const AUDIO_BANDS = 32;
let auSpec  = new Float32Array(AUDIO_BANDS);   // smoothed band levels 0..1
let auPeak  = new Float32Array(AUDIO_BANDS);   // falling peak-hold dots
let auPeakV = new Float32Array(AUDIO_BANDS);
let auStyle = 'bars', auTheme = 0, auGain = 1, auBarMode = 'solid';
let auScrollX=0, auScrollSpeed=0, auScrollDir=1;
let wfBuf=null, wfPos=0, wfTimer=0;
let stormFlashes=[];
let songT = 0, auRings = [], auPrevBass = 0;
let vuL=0, vuR=0, vuPkL=0, vuPkR=0, vuPkVL=0, vuPkVR=0;
let micOn=false, auCtx=null, auAnalyser=null, micBuf=null;

function auSmooth(b, target, dt){
  // fast attack, slow release — classic analyser ballistics
  if(target > auSpec[b]) auSpec[b] += (target-auSpec[b])*Math.min(1, dt*28);
  else                   auSpec[b] += (target-auSpec[b])*Math.min(1, dt*6.5);
  if(auSpec[b] > auPeak[b]){ auPeak[b]=auSpec[b]; auPeakV[b]=0; }
  else { auPeakV[b]+=dt*1.6; auPeak[b]=Math.max(0, auPeak[b]-auPeakV[b]*dt); }
}

// ── Simulated track: 126bpm, 4 sections (groove/build/drop/break) ──
function genSimSpectrum(dt){
  songT += dt;
  const AB=AUDIO_BANDS;
  const beat   = songT*(126/60);
  const beatPh = beat%1;
  const barNum = Math.floor(beat/4), barPh=(beat/4)%1;
  const sec    = Math.floor(barNum/8)%4;        // 0 groove · 1 build · 2 drop · 3 break
  const kick   = (sec===3?0.25:1)*Math.exp(-beatPh*8);
  const snare  = (Math.floor(beat)%2===1) ? Math.exp(-beatPh*6.5)*0.9 : 0;
  const e8     = (beat*2)%1;
  const hat    = Math.exp(-e8*15)*((Math.floor(beat*2)%2)?0.85:0.4)*(sec===3?0.4:1);
  const bn     = [0,0,7,5,3,3,10,8][Math.floor(beat)%8];
  const bass   = Math.exp(-beatPh*2.2)*(sec===3?0.3:0.95)*(0.75+0.25*Math.sin(songT*7+bn));
  const arp    = [0,2,4,7,9,7,4,2][Math.floor(beat*4)%8];
  const melB   = 11+arp+(sec===2?3:0);
  const melE   = Math.exp(-((beat*4)%1)*5)*(sec===3?0.45:0.8);
  const rise   = (sec===1) ? (barPh*0.5+0.5)*sm(0,1,((barNum%8)+barPh)/8) : 0;
  const boost  = (sec===2)?1.18:1;
  for(let b=0;b<AB;b++){
    const fb=b/(AB-1);
    let v=0;
    v += kick *Math.exp(-b*0.75)*1.25;                          // sub / kick
    v += bass *Math.exp(-Math.pow((b-2.6)/2.0,2));              // bassline
    v += snare*Math.exp(-Math.pow((b-12)/4.5,2))*0.75;          // snare body
    v += melE *Math.exp(-Math.pow((b-melB)/1.7,2))*0.8;         // arp melody
    v += hat  *sm(0.55,1,fb)*0.8;                               // hats / air
    v += rise *Math.exp(-Math.pow((b-(7+rise*18))/3.2,2))*0.9;  // riser sweep
    if(sec===3) v += (0.5+0.5*Math.sin(songT*1.2+b*0.7))*Math.exp(-Math.pow((b-8)/6,2))*0.5; // break pad
    v += 0.025+Math.random()*0.05;                              // noise floor
    auSmooth(b, Math.min(1, v*boost*auGain), dt);
  }
}

// ── Live microphone via Web Audio FFT (log-mapped into bands) ──
function readMicSpectrum(dt){
  auAnalyser.getByteFrequencyData(micBuf);
  songT += dt;
  const AB=AUDIO_BANDS, nb=micBuf.length, lo0=2, hi0=Math.floor(nb*0.75);
  for(let b=0;b<AB;b++){
    const lo=Math.floor(lo0*Math.pow(hi0/lo0, b/AB));
    const hi=Math.max(lo+1, Math.floor(lo0*Math.pow(hi0/lo0,(b+1)/AB)));
    let s=0; for(let k=lo;k<hi;k++) s+=micBuf[k];
    auSmooth(b, Math.min(1,(s/(hi-lo))/255*1.35*auGain), dt);
  }
}

async function toggleMic(){
  const st=document.getElementById('mic-status'), btn=document.getElementById('mic-btn');
  if(micOn){ micOn=false; btn.textContent='🎤 Use Microphone'; st.textContent='Source: simulated track'; return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    auCtx = auCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(auCtx.state==='suspended') await auCtx.resume();
    const src=auCtx.createMediaStreamSource(stream);
    auAnalyser=auCtx.createAnalyser();
    auAnalyser.fftSize=2048; auAnalyser.smoothingTimeConstant=0.45;
    src.connect(auAnalyser);
    micBuf=new Uint8Array(auAnalyser.frequencyBinCount);
    micOn=true; btn.textContent='🎤 Mic LIVE — tap to stop'; st.textContent='Source: microphone';
  }catch(e){ st.textContent='Mic unavailable — using simulated track'; }
}

// ── Colour themes: fb=band fraction, fh=height fraction, amp=level ──
function auColor(fb, fh, amp){
  switch(auTheme){
    case 1:  return hsl(0.02+fh*0.12, 1,    0.16+fh*0.42+amp*0.08);                    // Fire
    case 2:  return hsl(0.62-fh*0.14, 0.95, 0.16+fh*0.40+amp*0.08);                    // Ocean
    case 3:  return hsl(((fb*AUDIO_BANDS)|0)%2 ? 0.86 : 0.5, 1, 0.22+fh*0.35+amp*0.1); // Neon
    case 4:  return hsl(0.34, 1, 0.10+fh*0.50+amp*0.06);                               // Matrix
    case 5:  return hsl(fb*0.85+t*0.05, 0.55, 0.35+fh*0.35+amp*0.08);                 // Pastel
    default: return hsl(fb*0.85, 1, 0.18+fh*0.38+amp*0.1);                             // Rainbow
  }
}

// Map a column 0..4*SIZE-1 to (face,u) wrapping around the 4 side faces
function sideCol(c){
  const S=SIZE, q=((c/S)|0)%4, u=((c%S)+S)%S;
  if(q===0) return [0,u];        // front
  if(q===1) return [2,u];        // right
  if(q===2) return [1,u];        // back
  return [3,u];                  // left
}

// ── Scroll helper: given display column c, return which band to read ──
function scrolledBand(c, cols, AB){
  const sc=(c+(auScrollX|0)+cols)%cols;
  return Math.min(AB-1,(sc*AB/cols)|0);
}

function drawDotsStyle(){
  const S=SIZE, M=S-1;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=spectrumFitToScreen?(panel2dMode?SIZE:4*SIZE):4*S;
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const amp=auSpec[b], fb=b/(AB-1);
    const fu=sideCol(c), face=fu[0], u=fu[1];
    const h=amp*M, peakY=Math.min(M,Math.round(auPeak[b]*M));
    // Peak dot — bright white
    setFaceLED(face,u,peakY,0.95,0.95,1);
    // Level dot — coloured
    const ly=Math.min(M,Math.round(h));
    if(h>0.5){
      const col=auColor(fb,1,amp);
      setFaceLED(face,u,ly,col[0]*1.2,col[1]*1.2,col[2]*1.2);
    }
    // Trail of fading dots below
    for(let y=0;y<=ly;y+=3){
      const col=auColor(fb,h>0?y/h:0,amp);
      const fade=0.3+0.5*(y/Math.max(1,ly));
      setFaceLED(face,u,y,col[0]*fade,col[1]*fade,col[2]*fade);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

function drawBlocksStyle(){
  const S=SIZE, M=S-1, BLOCK=4;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=spectrumFitToScreen?(panel2dMode?SIZE:4*SIZE):4*S;
  const bandW=Math.max(1,Math.floor(cols/AB));
  for(let b=0;b<AB;b++){
    const amp=auSpec[b], fb=b/(AB-1);
    const blocks=Math.round(amp*(S/BLOCK));
    for(let blk=0;blk<blocks;blk++){
      const fh=blocks>0?blk/blocks:0;
      const col=auColor(fb,fh,amp);
      const yBase=blk*BLOCK;
      for(let dy=0;dy<BLOCK-1;dy++){
        const y=yBase+dy; if(y>=S) break;
        for(let dc=0;dc<bandW-1;dc++){
          const c=b*bandW+dc; if(c>=cols) break;
          const fu=sideCol(c);
          setFaceLED(fu[0],fu[1],y,col[0],col[1],col[2]);
        }
      }
    }
    // Peak block
    const pkBlk=Math.round(auPeak[b]*(S/BLOCK));
    const pkY=pkBlk*BLOCK;
    for(let dy=0;dy<BLOCK-1;dy++){
      const y=pkY+dy; if(y>=S) break;
      for(let dc=0;dc<bandW-1;dc++){
        const c=b*bandW+dc; if(c>=cols) break;
        const fu=sideCol(c);
        setFaceLED(fu[0],fu[1],y,0.9,0.9,0.95);
      }
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

function drawOutlineStyle(){
  const S=SIZE, M=S-1;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=spectrumFitToScreen?(panel2dMode?SIZE:4*SIZE):4*S;
  // Draw the top edge of each bar as a connected line
  const pts=new Float32Array(cols);
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    pts[c]=auSpec[b]*M;
  }
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const fb=b/(AB-1), amp=auSpec[b];
    const fu=sideCol(c), face=fu[0], u=fu[1];
    const y0=Math.round(pts[c]);
    const col=auColor(fb,1,amp);
    // Main line pixel
    setFaceLED(face,u,Math.min(M,y0),col[0]*1.3,col[1]*1.3,col[2]*1.3);
    // Glow below (3px fade)
    for(let g=1;g<=3;g++){
      const gy=y0-g; if(gy<0) break;
      const fade=1-g/4;
      setFaceLED(face,u,gy,col[0]*fade*0.5,col[1]*fade*0.5,col[2]*fade*0.5);
    }
    // Glow above (2px)
    for(let g=1;g<=2;g++){
      const gy=y0+g; if(gy>M) break;
      const fade=1-g/3;
      setFaceLED(face,u,gy,col[0]*fade*0.3,col[1]*fade*0.3,col[2]*fade*0.3);
    }
    // Peak dot
    const pkY=Math.min(M,Math.round(auPeak[b]*M));
    if(pkY>y0+2) setFaceLED(face,u,pkY,0.7,0.7,0.75);
  }
  drawPolarFace(4); drawPolarFace(5);
}

function drawBandBars(mirror){
  const S=SIZE, M=S-1, mode=auBarMode;
  let AB = spectrumBandOverride || AUDIO_BANDS;
  let cols = spectrumFitToScreen ? (panel2dMode ? SIZE : 4*SIZE) : 4*S;
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    if(S>8 && c%Math.max(1,Math.round(cols/AB))===Math.max(0,Math.round(cols/AB)-1)) continue;
    const amp=auSpec[b], fb=b/(AB-1);
    const fu=sideCol(c), face=fu[0], u=fu[1];

    if(mirror){
      const mid=(S-1)/2, half=amp*S*0.5;
      for(let y=0;y<S;y++){
        const d=Math.abs(y-mid);
        if(d<=half){
          const fh=half>0?1-d/half:0;
          const col=auColor(fb,fh,amp);
          if(mode==='striped'&&(y&1)) { setFaceLED(face,u,y,col[0]*0.15,col[1]*0.15,col[2]*0.15); }
          else setFaceLED(face,u,y,col[0],col[1],col[2]);
        }
      }
      const pk=auPeak[b]*S*0.5;
      setFaceLED(face,u,Math.min(M,Math.round(mid+pk)),0.9,0.9,0.95);
      setFaceLED(face,u,Math.max(0,Math.round(mid-pk)),0.9,0.9,0.95);
      continue;
    }

    const waveOff=mode==='wave'?Math.sin(c*0.15+t*3)*M*0.15:0;
    const rawH=amp*M;

    if(mode==='falling'){
      const hi=Math.min(M,Math.round(rawH));
      for(let y=0;y<=hi;y++){
        const fy=M-y;
        const fh=hi>0?y/hi:0;
        const col=auColor(fb,fh,amp);
        setFaceLED(face,u,fy,col[0],col[1],col[2]);
      }
      if(rawH>0){
        const tp=auColor(fb,1,amp);
        setFaceLED(face,u,Math.max(0,M-hi),Math.min(1,tp[0]*1.4+0.15),Math.min(1,tp[1]*1.4+0.15),Math.min(1,tp[2]*1.4+0.15));
      }
      setFaceLED(face,u,Math.max(0,M-Math.round(auPeak[b]*M)),0.9,0.9,0.95);

    } else if(mode==='center'){
      const mid=(S-1)/2, half=rawH*0.5;
      for(let y=0;y<S;y++){
        const d=Math.abs(y-mid);
        if(d<=half){
          const fh=half>0?1-d/half:0;
          const col=auColor(fb,fh,amp);
          setFaceLED(face,u,y,col[0],col[1],col[2]);
        }
      }
      const pk=auPeak[b]*M*0.5;
      setFaceLED(face,u,Math.min(M,Math.round(mid+pk)),0.9,0.9,0.95);
      setFaceLED(face,u,Math.max(0,Math.round(mid-pk)),0.9,0.9,0.95);

    } else if(mode==='stacked'){
      const SEG=4;
      const segs=Math.round(rawH/SEG);
      for(let s=0;s<segs;s++){
        const yBase=s*SEG;
        const fh=segs>0?s/segs:0;
        const col=auColor(fb,fh,amp);
        for(let dy=0;dy<SEG-1;dy++){
          const y=yBase+dy; if(y>M) break;
          setFaceLED(face,u,y,col[0],col[1],col[2]);
        }
      }
      const pkSeg=Math.round(auPeak[b]*M/SEG);
      for(let dy=0;dy<SEG-1;dy++){
        const y=pkSeg*SEG+dy; if(y>M) break;
        setFaceLED(face,u,y,0.9,0.9,0.95);
      }

    } else {
      // solid, striped, wave
      const h=rawH+waveOff, hi=Math.max(0,Math.min(M,Math.round(h)));
      for(let y=0;y<=hi;y++){
        const fh=hi>0?y/hi:0;
        const col=auColor(fb,fh,amp);
        if(mode==='striped'&&(y&1)){
          setFaceLED(face,u,y,col[0]*0.15,col[1]*0.15,col[2]*0.15);
        } else {
          setFaceLED(face,u,y,col[0],col[1],col[2]);
        }
      }
      if(h>0){
        const tp=auColor(fb,1,amp);
        setFaceLED(face,u,hi,Math.min(1,tp[0]*1.4+0.15),Math.min(1,tp[1]*1.4+0.15),Math.min(1,tp[2]*1.4+0.15));
      }
      const pkY=Math.max(0,Math.min(M,Math.round(auPeak[b]*M+waveOff)));
      setFaceLED(face,u,pkY,0.9,0.9,0.95);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// ── Waterfall (scrolling spectrogram) ──
function drawWaterfallStyle(dt){
  const S=SIZE, AB=AUDIO_BANDS, cols=4*S;
  if(!wfBuf||wfBuf.length!==S*AB){ wfBuf=new Float32Array(S*AB); wfPos=0; wfTimer=0; }
  wfTimer+=dt;
  if(wfTimer>1/30){ // 30 rows/sec
    wfTimer=0;
    for(let b=0;b<AB;b++) wfBuf[wfPos*AB+b]=auSpec[b];
    wfPos=(wfPos+1)%S;
  }
  for(let row=0;row<S;row++){
    const hist=(wfPos-1-row+S)%S;
    const age=row/S;
    const fade=1-age*0.7;
    for(let c=0;c<cols;c++){
      const b=scrolledBand(c,cols,AB);
      const amp=wfBuf[hist*AB+b];
      if(amp<0.035) continue;
      const fu=sideCol(c);
      const bright=amp*fade;
      const [r,g,bv]=auColor(b/(AB-1),amp,amp);
      setFaceLED(fu[0],fu[1],S-1-row,r*bright*1.4,g*bright*1.4,bv*bright*1.4);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// ── Waveform (oscilloscope trace wrapping the perimeter) ──
function drawWaveformStyle(dt){
  const S=SIZE, M=S-1, AB=AUDIO_BANDS, cols=4*S;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.80;
  const mid=M/2;
  // Synthesize waveform from spectrum via additive synthesis
  const wave=new Float32Array(cols);
  for(let c=0;c<cols;c++){
    let v=0;
    for(let b=0;b<AB;b++) v+=auSpec[b]*Math.sin((b+1)*Math.PI*2*c/cols + t*(b*0.08+0.4));
    wave[c]=v/AB;
  }
  for(let c=0;c<cols;c++){
    const sc=(c+(auScrollX|0)+cols)%cols;
    const amp=wave[sc];
    const y=Math.round(mid+amp*mid*0.9);
    const fy=Math.max(0,Math.min(M,y));
    const fu=sideCol(c);
    const hue=(sc/cols+t*0.04)%1;
    const [r,g,bv]=hsl(hue,1,0.9);
    setFaceLED(fu[0],fu[1],fy,r,g,bv);
    // glow falloff
    for(let dy=1;dy<=5;dy++){
      const gl=(1-dy/6)*0.42;
      setFaceLED(fu[0],fu[1],fy+dy,r*gl,g*gl,bv*gl);
      setFaceLED(fu[0],fu[1],fy-dy,r*gl,g*gl,bv*gl);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// ── Tunnel (concentric square rings pulsing inward) ──
function drawTunnelStyle(dt){
  const S=SIZE, M=S-1, AB=AUDIO_BANDS;
  const bass=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  for(let f=0;f<6;f++){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      // Chebyshev distance = square rings
      const du=Math.abs(u-(S-1)/2)/(S/2);
      const dv=Math.abs(v-(S-1)/2)/(S/2);
      const ring=Math.max(du,dv); // 0=center, 1=edge
      // Rings animate inward with time + scroll
      const scrollFrac=auScrollSpeed>0?auScrollX/(4*S)*2:0;
      const animated=((ring + t*0.45*(1+bass*0.5) + scrollFrac)%1);
      const b=Math.min(AB-1,(animated*AB)|0);
      const amp=auSpec[b];
      if(amp<0.04) continue;
      const bright=amp*(1-ring*0.35)*0.92;
      const [r,g,bv]=auColor(b/(AB-1),1-ring,amp);
      setFaceLED(f,u,v,r*bright,g*bright,bv*bright);
    }
  }
}

// ── Storm (lightning reactive to audio beats) ──
function drawStormStyle(dt){
  const S=SIZE, AB=AUDIO_BANDS, cols=4*S;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.72;
  const bass=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  // Spawn flashes on transients
  if(bass>0.52 && Math.random()<bass*dt*18){
    const face=Math.random()*4|0;
    stormFlashes.push({face,u:Math.random()*S|0,v:Math.random()*S|0,
      life:1,hue:0.58+Math.random()*0.16,size:Math.max(2,(bass*S*0.14)|0)});
  }
  // Background: spectrum bars at low opacity scrolling
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const amp=auSpec[b]*0.4;
    if(amp<0.03) continue;
    const fu=sideCol(c);
    const [r,g,bv]=auColor(b/(AB-1),1,auSpec[b]);
    for(let y=0;y<Math.round(amp*(S-1));y++) setFaceLED(fu[0],fu[1],y,r*amp,g*amp,bv*amp);
  }
  // Animate flashes
  for(let k=stormFlashes.length-1;k>=0;k--){
    const fl=stormFlashes[k]; fl.life-=dt*3.5;
    if(fl.life<=0){stormFlashes.splice(k,1);continue;}
    const R=Math.ceil(fl.size*fl.life);
    for(let dv=-R;dv<=R;dv++) for(let du=-R;du<=R;du++){
      const d2=du*du+dv*dv;
      if(d2>R*R) continue;
      const bright=fl.life*(1-Math.sqrt(d2)/R)*0.95;
      const [r,g,bv]=hsl(fl.hue,0.5+fl.life*0.5,bright);
      setFaceLED(fl.face,fl.u+du,fl.v+dv,r,g,bv);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// Polar spectrum: angle = band, radius = level (top/bottom faces)
function drawPolarFace(face){
  const S=SIZE, AB=AUDIO_BANDS, cc=(S-1)/2, maxR=cc*1.08;
  const bass=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const dx=u-cc, dz=v-cc, r=Math.hypot(dx,dz)/maxR;
    const ang=(Math.atan2(dz,dx)/(Math.PI*2)+0.5+t*0.03)%1;
    const b=Math.min(AB-1,(ang*AB)|0);
    const amp=auSpec[b];
    if(r<=amp){
      const col=auColor(b/(AB-1), 1-r/Math.max(0.01,amp), amp);
      setFaceLED(face,u,v,col[0],col[1],col[2]);
    } else if(Math.abs(r-auPeak[b])<0.045){
      setFaceLED(face,u,v,0.8,0.8,0.85);
    }
    if(r<bass*0.22) setFaceLED(face,u,v,1,1,1); // bass core flash
  }
}

// Radial style: beat-triggered shockwave rings + spectral wash on sides
function drawRadialStyle(dt){
  const S=SIZE, AB=AUDIO_BANDS, cc=(S-1)/2;
  const bass=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  if(bass>0.5 && auPrevBass<=0.5 && auRings.length<12) auRings.push({r:0, hue:Math.random()});
  auPrevBass=bass;
  for(const ring of auRings) ring.r+=dt*S*0.85;
  for(let k=auRings.length-1;k>=0;k--) if(auRings[k].r>S*0.95) auRings.splice(k,1);
  for(let f=0;f<4;f++){
    const face=[0,2,1,3][f];
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const r=Math.hypot(u-cc,v-cc);
      const b=Math.min(AB-1,((((u/(S-1))*0.25+f*0.25))*AB)|0); // bands wrap the cube
      const amp=auSpec[b]*0.28;
      const bg=auColor(b/(AB-1), v/(S-1), auSpec[b]);
      let rr=bg[0]*amp, gg=bg[1]*amp, bb=bg[2]*amp;
      for(const ring of auRings){
        const dd=Math.abs(r-ring.r);
        if(dd<1.6){
          const inten=(1-dd/1.6)*(1-ring.r/(S*0.95));
          const c=hsl(ring.hue,1,0.55);
          if(c[0]*inten>rr) rr=c[0]*inten;
          if(c[1]*inten>gg) gg=c[1]*inten;
          if(c[2]*inten>bb) bb=c[2]*inten;
        }
      }
      setFaceLED(face,u,v,rr,gg,bb);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// Classic VU: segmented green/amber/red meters with needle ballistics
function drawVUStyle(dt){
  const S=SIZE, M=S-1, AB=AUDIO_BANDS;
  let sum=0; for(let b=0;b<AB;b++) sum+=auSpec[b]*auSpec[b];
  const rms=Math.min(1,Math.sqrt(sum/AB)*1.9);
  const tL=Math.min(1,rms*(0.92+0.16*Math.sin(songT*0.9)));
  const tR=Math.min(1,rms*(0.92+0.16*Math.sin(songT*0.9+2.1)));
  vuL += (tL-vuL)*Math.min(1,dt*(tL>vuL?14:4.5));
  vuR += (tR-vuR)*Math.min(1,dt*(tR>vuR?14:4.5));
  if(vuL>vuPkL){vuPkL=vuL;vuPkVL=0;} else {vuPkVL+=dt*1.2;vuPkL=Math.max(0,vuPkL-vuPkVL*dt);}
  if(vuR>vuPkR){vuPkR=vuR;vuPkVR=0;} else {vuPkVR+=dt*1.2;vuPkR=Math.max(0,vuPkR-vuPkVR*dt);}
  const u0=Math.round(S*0.18), u1=Math.round(S*0.82);
  const meters=[[0,vuL,vuPkL],[2,vuR,vuPkR],[1,vuL,vuPkL],[3,vuR,vuPkR]];
  for(const m of meters){
    const face=m[0], lvl=m[1], pk=m[2];
    const rows=Math.round(lvl*M), pkRow=Math.round(pk*M);
    for(let y=0;y<S;y++){
      const fy=y/M;
      const isPeak=(y===pkRow);
      const lit=(y<=rows && (S<=8 || y%4!==3));
      if(!lit && !isPeak) continue;
      let col;
      if(isPeak)          col=[0.95,0.95,0.95];
      else if(fy<0.6)     col=hsl(0.33,1,0.28+fy*0.15);
      else if(fy<0.85)    col=hsl(0.12,1,0.4);
      else                col=hsl(0.0, 1,0.42);
      for(let u=u0;u<=u1;u++) setFaceLED(face,u,y,col[0],col[1],col[2]);
    }
  }
  const cc=(S-1)/2, lvl=(vuL+vuR)/2;
  for(let face=4;face<=5;face++){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const r=Math.hypot(u-cc,v-cc)/(cc*1.05);
      if(r<=lvl){
        const col = r<0.6 ? hsl(0.33,1,0.25+r*0.2) : r<0.85 ? hsl(0.12,1,0.4) : hsl(0,1,0.42);
        setFaceLED(face,u,v,col[0],col[1],col[2]);
      }
    }
  }
}

// ── PLASMA STYLE — audio-reactive plasma colour field ──
function drawPlasmaStyle(dt){
  let energy=0;
  for(let i=0;i<32;i++) energy+=auSpec[i];
  energy/=32;
  const bass=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  const hueShift=t*0.12*(1+bass*3);
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const p1=Math.sin(x*4.5+t*1.3)+Math.sin(y*3.8-t*0.9);
    const p2=Math.sin(z*5.1+t*0.7)+Math.sin((x+y)*2.9+t*1.1);
    const p3=Math.sin((x-z)*3.3+t*1.5)+Math.cos((y+z)*4.1-t*0.6);
    const plasma=(p1+p2+p3)/6+0.5;
    const intensity=plasma*(0.15+energy*0.85);
    const hue=(plasma*0.5+hueShift+x*0.1+z*0.1)%1;
    const [r,g,b]=hsl((hue+1)%1,1,Math.min(1,intensity*0.9));
    setLED(i,r,g,b);
  }
}

// ── RINGS STYLE — expanding concentric rings triggered by bass ──
let ringsArr=[], ringTimer=0;
function drawRingsStyle(dt){
  ringTimer+=dt;
  const bassHit=(auSpec[0]+auSpec[1]+auSpec[2])/3;
  if(bassHit>0.35 && ringTimer>0.2 && ringsArr.length<12){
    ringTimer=0;
    const face=Math.floor(Math.random()*6);
    const cx=Math.random()*SIZE, cy=Math.random()*SIZE;
    ringsArr.push({face,cx,cy,radius:0,hue:Math.random(),bright:1});
  }
  for(let ri=ringsArr.length-1;ri>=0;ri--){
    const ring=ringsArr[ri];
    ring.radius+=dt*SIZE*1.2;
    ring.bright-=dt*0.7;
    if(ring.bright<=0){ringsArr.splice(ri,1);continue;}
    const f=ring.face, S=SIZE, r=ring.radius, w=3;
    const [cr,cg,cb]=hsl(ring.hue,1,ring.bright*0.9);
    const rMax=Math.ceil(r+w);
    const uMin=Math.max(0,Math.floor(ring.cx-rMax));
    const uMax=Math.min(S-1,Math.ceil(ring.cx+rMax));
    const vMin=Math.max(0,Math.floor(ring.cy-rMax));
    const vMax=Math.min(S-1,Math.ceil(ring.cy+rMax));
    for(let v=vMin;v<=vMax;v++) for(let u=uMin;u<=uMax;u++){
      const dist=Math.hypot(u-ring.cx,v-ring.cy);
      const d=Math.abs(dist-r);
      if(d<w){
        const a=(1-d/w);
        const idx=faceMap[f][v*S+u];
        if(idx>=0){
          const b3=idx*3;
          const rv=cr*a, gv=cg*a, bv=cb*a;
          if(rv>colBuf[b3]) colBuf[b3]=rv;
          if(gv>colBuf[b3+1]) colBuf[b3+1]=gv;
          if(bv>colBuf[b3+2]) colBuf[b3+2]=bv;
        }
      }
    }
  }
}

function drawFireStyle(dt){
  const SIDES=[2,0,3,1];
  const S=SIZE, M=S-1;
  const AB=spectrumBandOverride||AUDIO_BANDS;
  for(let si=0;si<4;si++){
    const face=SIDES[si];
    const colW=S/AB;
    for(let b=0;b<AB;b++){
      const spec=auSpec[b];
      if(spec<0.02) continue;
      const h=Math.round(spec*M);
      const colStart=Math.floor(b*colW), colEnd=Math.min(S,Math.floor((b+1)*colW));
      for(let u=colStart;u<colEnd;u++){
        for(let v=0;v<h;v++){
          const frac=v/h;
          const flicker=0.85+0.15*Math.sin(u*7.3+t*12+v*3.1);
          let rr,gg,bb;
          if(frac<0.3){
            rr=1; gg=0.95; bb=0.4*(1-frac/0.3);
          } else if(frac<0.7){
            const mf=(frac-0.3)/0.4;
            rr=1; gg=0.95-mf*0.6; bb=0;
          } else {
            const tf=(frac-0.7)/0.3;
            rr=1-tf*0.5; gg=0.35-tf*0.3; bb=0;
          }
          const bright=flicker*(1-frac*0.3);
          rr=Math.min(1,rr*bright); gg=Math.min(1,gg*bright); bb=Math.min(1,bb*bright);
          const idx=faceMap[face][v*S+u];
          if(idx>=0) setLED(idx,rr,gg,bb);
        }
      }
    }
  }
  const glow=(auSpec[0]+auSpec[1])*0.12;
  if(glow>0.02){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[4][v*S+u];
      if(idx>=0){ const b3=idx*3; if(glow>colBuf[b3]) colBuf[b3]=glow; if(glow*0.3>colBuf[b3+1]) colBuf[b3+1]=glow*0.3; }
    }
  }
}

function effectSpectrum(dt){
  t+=dt;
  if(micOn && auAnalyser) readMicSpectrum(dt); else genSimSpectrum(dt);
  // Advance scroll
  if(auScrollSpeed>0) auScrollX=(auScrollX+dt*auScrollSpeed*SIZE*1.5*auScrollDir+4*SIZE)%(4*SIZE);
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  switch(auStyle){
    case 'mirror':    drawBandBars(true);       break;
    case 'dots':      drawDotsStyle();           break;
    case 'blocks':    drawBlocksStyle();         break;
    case 'outline':   drawOutlineStyle();        break;
    case 'radial':    drawRadialStyle(dt);       break;
    case 'vu':        drawVUStyle(dt);           break;
    case 'waterfall': drawWaterfallStyle(dt);    break;
    case 'waveform':  drawWaveformStyle(dt);     break;
    case 'tunnel':    drawTunnelStyle(dt);       break;
    case 'storm':     drawStormStyle(dt);        break;
    case 'plasma':    drawPlasmaStyle(dt);      break;
    case 'rings':     drawRingsStyle(dt);       break;
    case 'fire':      drawFireStyle(dt);        break;
    default:          drawBandBars(false);
  }
}

// ═══════════════════════════════════════════════════
//  MAZE RUNNER
//  One continuous maze stitched across all 6 faces.
//  Per-face recursive backtracker + doorways carved
//  across every cube edge; BFS solver; animated runner.
// ═══════════════════════════════════════════════════
let mazeOpen=null, mazeVisited=null, mazeRunners=[], mazeBFS=[];
let mazeState='run', mazeStateT=0, mazeWinner=-1;
let mazeStartI=-1, mazeEndI=-1, mazeWallIdx=0, mazeRunnerCount=3, mazeBrightWalls=false;
const NB6=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const MAZE_WALLS=[          // dim wall RGB per swatch
  [0.030,0.120,0.180],      // cyan
  [0.170,0.030,0.105],      // magenta
  [0.165,0.085,0.012],      // amber
  [0.025,0.140,0.045],      // green
  [0.095,0.030,0.170],      // purple
  [0.105,0.105,0.115],      // white
];
const MZ_HUES=[0.50,0.08,0.85,0.16,0.70,0.42];  // distinct runner colours

// (x,y,z) → surface LED index, or -1
function surfIdx(x,y,z){
  const M=SIZE-1;
  if(x<0||y<0||z<0||x>M||y>M||z>M) return -1;
  if(z===M) return faceMap[0][y*SIZE+x];
  if(z===0) return faceMap[1][y*SIZE+(M-x)];
  if(x===M) return faceMap[2][y*SIZE+(M-z)];
  if(x===0) return faceMap[3][y*SIZE+z];
  if(y===M) return faceMap[4][z*SIZE+x];
  if(y===0) return faceMap[5][z*SIZE+x];
  return -1;
}

function buildMaze(){
  const S=SIZE, M=S-1, C=(S>>1)-1;   // C×C cells per face, paths at odd local coords 1..2C-1
  mazeOpen=new Uint8Array(N);
  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  const faces2d=is2D?[0]:[0,1,2,3,4,5];

  function openFaceLocal(f,u,v){ const i=faceMap[f][v*S+u]; if(i>=0) mazeOpen[i]=1; }
  function openFaceCell(f,ci,cj){ openFaceLocal(f, 2*ci+1, 2*cj+1); }
  function openV(x,y,z){ const i=surfIdx(x,y,z); if(i>=0) mazeOpen[i]=1; }

  // 1 — perfect maze on each face (iterative recursive backtracker)
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const f of faces2d){
    const vis=new Uint8Array(C*C);
    const sx=(Math.random()*C)|0, sy=(Math.random()*C)|0;
    const stack=[[sx,sy]];
    vis[sy*C+sx]=1; openFaceCell(f,sx,sy);
    while(stack.length){
      const top=stack[stack.length-1], ci=top[0], cj=top[1];
      const opts=[];
      for(const d of dirs){
        const ni=ci+d[0], nj=cj+d[1];
        if(ni>=0&&ni<C&&nj>=0&&nj<C&&!vis[nj*C+ni]) opts.push([ni,nj]);
      }
      if(!opts.length){ stack.pop(); continue; }
      const nx=opts[(Math.random()*opts.length)|0];
      vis[nx[1]*C+nx[0]]=1;
      openFaceLocal(f, ci+nx[0]+1, cj+nx[1]+1);  // carve wall midpoint
      openFaceCell(f, nx[0], nx[1]);
      stack.push(nx);
    }
  }

  if(!is2D){
    // 2 — doorways across all 12 cube edges (stitches faces into one maze)
    const axes=[0,1,2];
    const doorN=Math.max(1, Math.round(C/10));
    for(const a of axes){
      const rest=axes.filter(q=>q!==a), b1=rest[0], b2=rest[1];
      for(const v1 of [0,M]) for(const v2 of [0,M]){
        for(let d=0; d<doorN; d++){
          const p=1+2*((Math.random()*C)|0);          // odd position, avoids corners
          const co=[0,0,0]; co[a]=p; co[b1]=v1; co[b2]=v2;
          openV(co[0],co[1],co[2]);                   // shared edge voxel
          if(v1===M){ const c2=co.slice(); c2[b1]=M-1; openV(c2[0],c2[1],c2[2]); }
          if(v2===M){ const c2=co.slice(); c2[b2]=M-1; openV(c2[0],c2[1],c2[2]); }
        }
      }
    }
  }

  // 3 — start and goal
  if(is2D){
    // 2D: start top-left, end bottom-right of face 0
    mazeStartI = faceMap[0][1*S + 1];
    const endU=2*C-1, endV=2*C-1;
    mazeEndI = faceMap[0][endV*S + endU];
    if(mazeEndI<0||!mazeOpen[mazeEndI]){
      // fallback: find nearest open cell to bottom-right
      let best=-1, bd=1e9;
      for(let cj=C-1;cj>=0&&best<0;cj--) for(let ci=C-1;ci>=0&&best<0;ci--){
        const idx=faceMap[0][(2*cj+1)*S+(2*ci+1)];
        if(idx>=0&&mazeOpen[idx]) best=idx;
      }
      mazeEndI=best>=0?best:mazeStartI;
    }
  } else {
    mazeStartI = faceMap[4][1*S + 1];
    const endFaces=[0,1,2,3,5];
    const endFace=endFaces[Math.floor(Math.random()*endFaces.length)];
    const candidates=[];
    for(let cj=0;cj<C;cj++) for(let ci=0;ci<C;ci++){
      const idx=faceMap[endFace][(2*cj+1)*S+(2*ci+1)];
      if(idx>=0&&mazeOpen[idx]) candidates.push(idx);
    }
    mazeEndI = candidates.length
      ? candidates[Math.floor(Math.random()*candidates.length)]
      : faceMap[5][(2*C-1)*S+(2*C-1)];
  }

  // 4 — BFS shortest path (reference for capping runner wandering)
  const prev=new Int32Array(N).fill(-1);
  const q=new Int32Array(N); let qh=0, qt=0;
  q[qt++]=mazeStartI; prev[mazeStartI]=mazeStartI;
  while(qh<qt){
    const i=q[qh++];
    if(i===mazeEndI) break;
    const x=gridX[i], y=gridY[i], z=gridZ[i];
    for(const nb of NB6){
      const j=surfIdx(x+nb[0], y+nb[1], z+nb[2]);
      if(j>=0 && mazeOpen[j] && prev[j]<0){ prev[j]=i; q[qt++]=j; }
    }
  }
  mazeBFS=[];
  if(prev[mazeEndI]>=0){
    let i=mazeEndI;
    while(i!==mazeStartI){ mazeBFS.push(i); i=prev[i]; }
    mazeBFS.push(mazeStartI); mazeBFS.reverse();
  } else mazeBFS=[mazeStartI];

  // 5 — spawn the runners
  respawnRunners();
}

// Goal-biased randomized DFS that records the FULL walk including
// backtracking out of dead ends — each runner visibly explores.
// Returns {seq: animation sequence, route: clean solution path}
function genRunnerSeq(bias, startI){
  startI = startI ?? mazeStartI;
  const visited=new Uint8Array(N);
  const stack=[startI];
  const seq=[startI];
  visited[startI]=1;
  const gx=gridX[mazeEndI], gy=gridY[mazeEndI], gz=gridZ[mazeEndI];
  let guard=N*6;
  while(stack.length && guard-- > 0){
    const i=stack[stack.length-1];
    if(i===mazeEndI) break;
    const x=gridX[i], y=gridY[i], z=gridZ[i];
    const opts=[];
    for(const nb of NB6){
      const j=surfIdx(x+nb[0], y+nb[1], z+nb[2]);
      if(j>=0 && mazeOpen[j] && !visited[j]) opts.push(j);
    }
    if(!opts.length){                       // dead end — retrace one step
      stack.pop();
      if(stack.length) seq.push(stack[stack.length-1]);
      continue;
    }
    let pick;
    if(Math.random()<bias){                 // mostly head toward the goal…
      let best=-1, bd=1e9;
      for(const j of opts){
        const d=Math.abs(gridX[j]-gx)+Math.abs(gridY[j]-gy)+Math.abs(gridZ[j]-gz)+Math.random()*2;
        if(d<bd){ bd=d; best=j; }
      }
      pick=best;
    } else {                                // …but wander sometimes (paths diverge)
      pick=opts[(Math.random()*opts.length)|0];
    }
    visited[pick]=1;
    stack.push(pick); seq.push(pick);
  }
  return { seq, route: stack.slice() };
}

function respawnRunners(){
  mazeVisited=new Uint8Array(N);
  mazeRunners=[];
  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  const base=6+SIZE*0.5;
  const maxLen=Math.max(60, mazeBFS.length*4.5);

  const C=(SIZE>>1)-1;
  const facesToUse=is2D?[0]:[0,1,2,3,4,5];
  const faceStarts=[];
  for(const f of facesToUse){
    let found=-1;
    for(let r=0;r<C&&found<0;r++){
      for(let ci=Math.max(0,C/2-r)|0,ce=Math.min(C-1,(C/2+r)|0);ci<=ce&&found<0;ci++){
        for(let cj=Math.max(0,C/2-r)|0,cje=Math.min(C-1,(C/2+r)|0);cj<=cje&&found<0;cj++){
          const idx=faceMap[f][(2*cj+1)*SIZE+(2*ci+1)];
          if(idx>=0&&mazeOpen[idx]) found=idx;
        }
      }
    }
    if(found<0){
      for(let v=1;v<SIZE-1&&found<0;v+=2)
        for(let u=1;u<SIZE-1&&found<0;u+=2){
          const idx=faceMap[f][v*SIZE+u];
          if(idx>=0&&mazeOpen[idx]) found=idx;
        }
    }
    faceStarts.push(found);
  }

  for(let k=0;k<mazeRunnerCount;k++){
    const startFace=is2D?0:k%6;
    const fsIdx=is2D?0:startFace;
    let startI;
    if(is2D){
      // Spread runners across different corners/edges of the face
      const corners=[[1,1],[2*C-1,1],[1,2*C-1],[2*C-1,2*C-1],[C,1],[1,C]];
      const corner=corners[k%corners.length];
      // Find nearest open cell to this corner
      let best=-1, bd=1e9;
      for(let cj=0;cj<C;cj++) for(let ci=0;ci<C;ci++){
        const u=2*ci+1, v=2*cj+1;
        const idx=faceMap[0][v*SIZE+u];
        if(idx>=0&&mazeOpen[idx]){
          const d=Math.abs(u-corner[0])+Math.abs(v-corner[1]);
          if(d<bd){bd=d;best=idx;}
        }
      }
      startI=best>=0?best:mazeStartI;
    } else {
      startI=faceStarts[fsIdx]>=0?faceStarts[fsIdx]:mazeStartI;
    }

    let gp=null;
    const biases=[0.75,0.82,0.9,0.96];
    for(const b of biases){
      gp=genRunnerSeq(b, startI);
      if(gp.seq.length<=maxLen) break;
    }
    if(!gp||gp.seq.length>maxLen) gp={seq:mazeBFS.slice(),route:mazeBFS.slice()};
    mazeRunners.push({
      seq:gp.seq, route:gp.route, prog:0, mark:0,
      hue:MZ_HUES[k%MZ_HUES.length],
      speed:Math.max(base, gp.seq.length/28)*(0.9+Math.random()*0.25),
    });
  }
  mazeState='run'; mazeStateT=0; mazeWinner=-1;
}

function mazeMark(i, r,g,b){
  if(i<0) return;
  setLED(i,r,g,b);
  const x=gridX[i], y=gridY[i], z=gridZ[i];
  for(const nb of NB6){
    const j=surfIdx(x+nb[0], y+nb[1], z+nb[2]);
    if(j>=0) setLED(j, r*0.55, g*0.55, b*0.55);
  }
}

function effectMaze(dt){
  if(!mazeOpen || mazeOpen.length!==N) buildMaze();
  t+=dt; mazeStateT+=dt;
  const w=MAZE_WALLS[mazeWallIdx];

  // base: lit walls form the maze structure, corridors stay dark;
  // explored corridors tinted by whichever runner got there first
  for(let i=0;i<N;i++){
    if(mazeOpen[i]){
      const vk=mazeVisited[i];
      if(vk){
        const c=hsl(MZ_HUES[(vk-1)%MZ_HUES.length],1,0.32);
        setLED(i,c[0],c[1],c[2]);
      } else {
        setLED(i, w[0]*0.06, w[1]*0.06, w[2]*0.06);
      }
    } else {
      // Walls: fully bright with strong pulse
      const sh=0.7+0.3*Math.sin(surfX[i]*7+surfY[i]*5+surfZ[i]*6+t*0.8);
      setLED(i, Math.min(1,w[0]*sh*3.5), Math.min(1,w[1]*sh*3.5), Math.min(1,w[2]*sh*3.5));
    }
  }

  if(mazeState==='run'){
    let winner=-1;
    for(let k=0;k<mazeRunners.length;k++){
      const R=mazeRunners[k];
      R.prog=Math.min(R.seq.length-1, R.prog+dt*R.speed);
      const head=R.prog|0;
      for(let q2=R.mark; q2<=head; q2++){          // claim breadcrumbs
        const i=R.seq[q2];
        if(!mazeVisited[i]) mazeVisited[i]=k+1;
      }
      R.mark=head;
      // comet trail (max-blend so crossing runners both stay visible)
      for(let q2=Math.max(0,head-8); q2<=head; q2++){
        const f=1-(head-q2)/9;
        const c=hsl(R.hue, 1, 0.14+f*0.5);
        const b3=R.seq[q2]*3;
        if(c[0]>colBuf[b3])   colBuf[b3]=c[0];
        if(c[1]>colBuf[b3+1]) colBuf[b3+1]=c[1];
        if(c[2]>colBuf[b3+2]) colBuf[b3+2]=c[2];
      }
      const hc=hsl(R.hue, 0.45, 0.88);             // white-hot head
      setLED(R.seq[head], hc[0], hc[1], hc[2]);
      if(head>=R.seq.length-1 && winner<0) winner=k;
    }
    if(winner>=0){ mazeState='win'; mazeWinner=winner; mazeStateT=0; }
  } else {
    // celebration: rainbow wave races along the WINNER's clean route
    const R=mazeRunners[mazeWinner]||mazeRunners[0];
    const route=R.route, L=route.length;
    for(let k=0;k<L;k++){
      const hue=((k/L*2 - mazeStateT*1.5)%1+1)%1;
      const c=hsl(hue,1,0.5+0.18*Math.sin(t*6));
      setLED(route[k],c[0],c[1],c[2]);
    }
    if(mazeStateT>3.2) buildMaze();
  }

  // pulsing start (green) and goal (bright white/red pulsing cross)
  const pg=0.5+0.5*Math.sin(t*5);
  mazeMark(mazeStartI, 0, 0.35+0.6*pg, 0.05);

  // Goal: bright pulsing red/white cross — mark centre + 4 neighbours brightly
  const flash=0.5+0.5*Math.sin(t*8); // faster pulse to stand out
  const gr=0.7+0.3*flash, gg=flash*0.2, gb=flash*0.1;
  if(mazeEndI>=0){
    setLED(mazeEndI, 1, 1, 1); // always solid white centre
    const ex=gridX[mazeEndI], ey=gridY[mazeEndI], ez=gridZ[mazeEndI];
    for(const nb of NB6){
      const j=surfIdx(ex+nb[0], ey+nb[1], ez+nb[2]);
      if(j>=0){ setLED(j, gr, gg, gb); }
    }
  }
}


// ═══════════════════════════════════════════════════
//  TRON LIGHT BIKES
// ═══════════════════════════════════════════════════
const TRON_HUES=[0.57,0.08,0.92,0.33,0.70,0.15,0.50,0.02];
let tronTrail=null, tronBikes=[], tronExplosions=[], tronState='run', tronStateT=0;
let tronBikeCount=4, tronWinner=-1, tronSpeedMult=1, tronGridTheme=0, tronBorderWalls=false, tronStraightness=0.72;
let tronVisited=null; // reusable buffer — allocated once per initTron
let tronBFSQueue=null;
let tronDeaths=null; // death count per bike (index matches bike slot)
let tronScoreFill=null; // animated fill level per bike (0 to tronMaxFill)
let tronMaxFill=0; // pixels in each score box
let tronWinFlash=0;
let tronWinBike=-1;
let tronRoundWinner=-1;
const TRON_GRIDS=[[0.01,0.06,0.12],[0.01,0.06,0.01],[0.06,0.01,0.06],[0.04,0.04,0.04]];

function tronMove(face,u,v,du,dv){
  const M=SIZE-1, nu=u+du, nv=v+dv;
  if(nu>=0&&nu<=M&&nv>=0&&nv<=M) return [face,nu,nv,du,dv];
  if(typeof panel2dMode!=='undefined' && panel2dMode){
    if(tronBorderWalls) return null;
    return [face, ((nu%SIZE)+SIZE)%SIZE, ((nv%SIZE)+SIZE)%SIZE, du, dv];
  }
  switch(face){
    case 0: if(du===1)return[2,M,v,-1,0]; if(du===-1)return[3,M,v,-1,0]; if(dv===1)return[4,u,M,0,-1]; return[5,u,M,0,-1];
    case 1: if(du===1)return[2,0,v,1,0]; if(du===-1)return[3,0,v,1,0]; if(dv===1)return[4,u,0,0,1]; return[5,u,0,0,1];
    case 2: if(du===1)return[0,M,v,-1,0]; if(du===-1)return[1,M,v,-1,0]; if(dv===1)return[4,M,u,-1,0]; return[5,M,u,-1,0];
    case 3: if(du===1)return[0,0,v,1,0]; if(du===-1)return[1,0,v,1,0]; if(dv===1)return[4,0,u,1,0]; return[5,0,u,1,0];
    case 4: if(du===1)return[2,v,M,0,-1]; if(du===-1)return[3,v,M,0,-1]; if(dv===1)return[0,u,M,0,-1]; return[1,u,M,0,-1];
    default: if(du===1)return[2,v,0,0,1]; if(du===-1)return[3,v,0,0,1]; if(dv===1)return[0,u,0,0,1]; return[1,u,0,0,1];
  }
}

function tronFloodFill(face,u,v,du,dv){
  if(!tronVisited) return 0;
  const [nf,nu,nv]=tronMove(face,u,v,du,dv);
  const startIdx=faceMap[nf][nv*SIZE+nu];
  if(startIdx<0||tronTrail[startIdx]>0) return 0;

  const CAP=Math.min(N, SIZE*SIZE*3);
  const dirty=[];
  const Q=tronBFSQueue;
  tronVisited[startIdx]=1; dirty.push(startIdx);
  Q[0]=nf; Q[1]=nu; Q[2]=nv;
  let qi=0, qe=3, count=1;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];

  while(qi<qe && count<CAP){
    const cf=Q[qi++], cu=Q[qi++], cv=Q[qi++];
    for(const [dd,ddd] of dirs){
      const [ff,fu,fv]=tronMove(cf,cu,cv,dd,ddd);
      const idx=faceMap[ff][fv*SIZE+fu];
      if(idx<0||tronTrail[idx]>0||tronVisited[idx]) continue;
      tronVisited[idx]=1; dirty.push(idx);
      Q[qe++]=ff; Q[qe++]=fu; Q[qe++]=fv;
      count++;
      if(count>=CAP) break;
    }
  }
  for(const idx of dirty) tronVisited[idx]=0;
  return count;
}

function tronDecide(bk){
  const {face:f,u,v,du,dv}=bk;
  const ldu=-dv, ldv=du;
  const rdu=dv,  rdv=-du;

  const candidates=[
    {du,    dv,    straight:true, turnDir:0},
    {du:ldu,dv:ldv,straight:false,turnDir:-1},
    {du:rdu,dv:rdv,straight:false,turnDir:1},
  ];

  // Measure open space for each direction
  const scored=[];
  for(const m of candidates){
    const [nf,nu,nv]=tronMove(f,u,v,m.du,m.dv);
    const idx=faceMap[nf][nv*SIZE+nu];
    if(idx<0||tronTrail[idx]>0) continue;
    const space=tronFloodFill(f,u,v,m.du,m.dv);

    // Multi-step lookahead: walk straight from this direction and count how
    // far we can go before hitting a wall (runway length)
    let runway=0, rf=nf, ru=nu, rv=nv;
    for(let step=0;step<SIZE;step++){
      const [sf,su,sv]=tronMove(rf,ru,rv,m.du,m.dv);
      const si=faceMap[sf][sv*SIZE+su];
      if(si<0||tronTrail[si]>0) break;
      rf=sf; ru=su; rv=sv; runway++;
    }

    // Count escape routes from the new cell
    let escapeRoutes=0;
    for(const [ed,ev] of [[m.du,m.dv],[-m.dv,m.du],[m.dv,-m.du]]){
      const [ef,eu,ev2]=tronMove(nf,nu,nv,ed,ev);
      const ei=faceMap[ef][ev2*SIZE+eu];
      if(ei>=0&&tronTrail[ei]===0) escapeRoutes++;
    }

    // 4-step deep lookahead: simulate walking and count how many options
    // remain at each step (detects corridors and traps early)
    let futureOptions=0;
    let wf=nf, wu=nu, wv=nv, wd=m.du, wdv2=m.dv;
    for(let step=0;step<4;step++){
      const [sf,su,sv]=tronMove(wf,wu,wv,wd,wdv2);
      const si=faceMap[sf][sv*SIZE+su];
      if(si<0||tronTrail[si]>0) break;
      wf=sf; wu=su; wv=sv;
      for(const [ed,ev] of [[-wdv2,wd],[wdv2,-wd]]){
        const [ef,eu,ev3]=tronMove(wf,wu,wv,ed,ev);
        const ei=faceMap[ef][ev3*SIZE+eu];
        if(ei>=0&&tronTrail[ei]===0) futureOptions++;
      }
    }

    // Center distance: prefer moves toward face center (avoids hugging edges)
    const centerDist=Math.abs(nu-SIZE/2)+Math.abs(nv-SIZE/2);

    scored.push({m,space,nf,nu,nv,escapeRoutes,runway,futureOptions,centerDist});
  }
  if(!scored.length) return null;

  const maxSpace=Math.max(...scored.map(s=>s.space));
  const mySpace=scored.find(s=>s.m.straight)?.space??0;

  // Anti-spiral: detect if we've been turning the same direction repeatedly
  const hist=bk._turnHist||(bk._turnHist=[]);
  let spiralPenaltyDir=0;
  if(hist.length>=3){
    const recent=hist.slice(-3);
    if(recent.every(d=>d===1)) spiralPenaltyDir=1;
    else if(recent.every(d=>d===-1)) spiralPenaltyDir=-1;
  }

  // Distance from other bikes
  let avoidanceMap=new Map();
  let cutBonus=new Map();
  for(const other of tronBikes){
    if(!other.alive||other===bk) continue;
    for(const s of scored){
      const dx=s.nu-other.u, dy=s.nv-other.v;
      const dist=Math.sqrt(dx*dx+dy*dy)+(s.nf===other.face?0:SIZE*0.5);
      if(dist<SIZE*0.4 && s.space>mySpace*0.7){
        cutBonus.set(s,(cutBonus.get(s)||0)+(SIZE*0.4-dist)*0.6);
      }
      if(dist<SIZE*0.25 && s.space<mySpace*0.5){
        avoidanceMap.set(s,(avoidanceMap.get(s)||0)+(SIZE*0.25-dist)*1.5);
      }
    }
  }

  let best=null, bestScore=-Infinity;
  for(const s of scored){
    const escapePenalty=s.escapeRoutes===0?-SIZE*10:(s.escapeRoutes===1?-SIZE*2:0);
    const openBonus=s.space>=maxSpace*0.95?SIZE*0.5:0;
    // Reduced straight bias — only prefer straight when runway is decent
    const straightBonus=s.m.straight?(Math.min(s.runway,SIZE/4)*0.8):0;
    // Penalize short runways heavily (avoids committing to dead-end corridors)
    const runwayPenalty=s.runway<3?-SIZE*3:(s.runway<6?-SIZE:0);
    // Reward moves that keep future options open
    const futureBonus=s.futureOptions*SIZE*0.15;
    // Center preference — reduced in border mode so bikes use edges more
    const centerWeight=(typeof panel2dMode!=='undefined'&&panel2dMode&&tronBorderWalls)?0.02:0.1;
    const centerBonus=(SIZE-s.centerDist)*centerWeight;
    // In border mode, occasionally attract toward edges for more exciting play
    const edgeAttract=(typeof panel2dMode!=='undefined'&&panel2dMode&&tronBorderWalls)?
      (Math.min(s.nu,SIZE-1-s.nu,s.nv,SIZE-1-s.nv)<4?SIZE*0.3*Math.random():0):0;
    // Anti-spiral: heavily penalize continuing to turn the same direction
    const spiralPenalty=(spiralPenaltyDir!==0&&s.m.turnDir===spiralPenaltyDir)?-SIZE*4:0;
    const cut=cutBonus.get(s)||0;
    const avoid=avoidanceMap.get(s)||0;
    const score=s.space*1.2 + straightBonus + cut + openBonus + escapePenalty
      + runwayPenalty + futureBonus + centerBonus + spiralPenalty + edgeAttract
      - avoid + (Math.random()-0.5)*1.5;
    if(score>bestScore){ bestScore=score; best=s; }
  }
  if(best){
    hist.push(best.m.turnDir);
    if(hist.length>6) hist.shift();
    return [best.m.du,best.m.dv];
  }
  return null;
}

function tronCrash(bk){
  bk.alive=false;
  const idx=tronBikes.indexOf(bk);
  if(idx>=0&&tronDeaths) tronDeaths[idx]++;
  const [wx,wy,wz]=(() => { const M=SIZE-1; switch(bk.face){case 0:return[bk.u,bk.v,M];case 1:return[bk.u,bk.v,0];case 2:return[M,bk.v,bk.u];case 3:return[0,bk.v,bk.u];case 4:return[bk.u,M,bk.v];default:return[bk.u,0,bk.v]; }})();
  for(let i=0;i<55;i++){
    const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1);
    const sp=(2+Math.random()*8)*(SIZE/64);
    tronExplosions.push({x:wx*SPACING-HALF,y:wy*SPACING-HALF,z:wz*SPACING-HALF,
      vx:Math.sin(ph)*Math.cos(th)*sp,vy:Math.sin(ph)*Math.sin(th)*sp,vz:Math.cos(ph)*sp,
      life:1,hue:bk.hue});
  }
}

function tronUpdateScoreboard(){
  const el=document.getElementById('tron-scoreboard');
  if(!el) return;
  if(!tronDeaths||!tronBikes.length||!tronScoreFill){el.style.display='none';return;}
  if(tronWinFlash>0){
    const rgb=hsl(TRON_HUES[tronWinBike%TRON_HUES.length],1,0.6);
    const r=Math.round(rgb[0]*255),g=Math.round(rgb[1]*255),b=Math.round(rgb[2]*255);
    el.style.display='block';
    el.innerHTML='<div style="color:rgb('+r+','+g+','+b+');font-size:20px;font-weight:bold">\u2605 WINNER \u2605</div>';
    return;
  }
  el.style.display='block';
  const sorted=tronBikes.map((_,i)=>i);
  sorted.sort((a,b)=>tronScoreFill[b]-tronScoreFill[a]);
  el.innerHTML=sorted.map((bi,rank)=>{
    const h=TRON_HUES[bi%TRON_HUES.length];
    const rgb=hsl(h,1,0.6);
    const r=Math.round(rgb[0]*255),g=Math.round(rgb[1]*255),b=Math.round(rgb[2]*255);
    const lives=tronScoreFill[bi];
    const out=lives<=0?' OUT':'';
    const trophy=(rank===0&&lives>0)?'\u2605 ':'  ';
    return '<div style="color:rgb('+r+','+g+','+b+');'+(lives<=0?'opacity:0.4;text-decoration:line-through;':'')+'">'+trophy+'\u25A0 '+lives+'/'+tronMaxFill+out+'</div>';
  }).join('');
}

function initTron(){
  const boxW=4;
  const boxH=4;
  tronMaxFill=boxW*boxH;
  if(!tronDeaths||tronDeaths.length!==tronBikeCount){
    tronDeaths=new Array(tronBikeCount).fill(0);
    tronScoreFill=new Array(tronBikeCount).fill(tronMaxFill);
  }
  tronTrail=new Uint8Array(N);
  tronVisited=new Uint8Array(N);
  tronBFSQueue=new Int16Array(N*3*3);
  // Mark scoreboard zone as wall on face 0
  const sz=tronScoreZone();
  for(let v=Math.max(0,sz.v0);v<=Math.min(SIZE-1,sz.v1);v++){
    for(let u=Math.max(0,sz.u0);u<=Math.min(SIZE-1,sz.u1);u++){
      const lv=SIZE-1-v;
      const idx=faceMap[0][lv*SIZE+u];
      if(idx>=0) tronTrail[idx]=255;
    }
  }
  // In 2D border mode, mark screen edges as walls
  if(typeof panel2dMode!=='undefined' && panel2dMode && tronBorderWalls){
    const f=0;
    for(let i=0;i<SIZE;i++){
      for(const [eu,ev] of [[i,0],[i,SIZE-1],[0,i],[SIZE-1,i]]){
        const lv=SIZE-1-ev;
        const idx=faceMap[f][lv*SIZE+eu];
        if(idx>=0) tronTrail[idx]=255;
      }
    }
  }
  tronBikes=[]; tronExplosions=[]; tronWinner=-1; tronState='run'; tronStateT=0;
  const HDIR=[[1,0],[-1,0]];
  const VDIR=[[0,1],[0,-1]];
  for(let k=0;k<tronBikeCount;k++){
    // Skip eliminated bikes (score already 0)
    const eliminated=(tronScoreFill&&tronScoreFill[k]<=0);
    const sf=(typeof panel2dMode!=='undefined' && panel2dMode) ? 0 : k%6;
    const margin=Math.max(4, SIZE>>3);
    let su, sv, tries=0;
    do {
      su=margin+Math.floor(Math.random()*(SIZE-margin*2));
      sv=margin+Math.floor(Math.random()*(SIZE-margin*2));
      tries++;
    } while(sf===0 && su>=sz.u0 && sv<=sz.v1 && tries<50);
    let dir;
    if(k%2===0) dir=HDIR[Math.floor(Math.random()*2)];
    else         dir=VDIR[Math.floor(Math.random()*2)];
    tronBikes.push({face:sf,u:su,v:sv,du:dir[0],dv:dir[1],
      hue:TRON_HUES[k%TRON_HUES.length],alive:!eliminated,acc:0,
      speed:(SIZE*0.7+SIZE*0.3*(k/tronBikeCount))});
  }
}

function effectTron(dt){
  if(!tronTrail||tronTrail.length!==N) initTron();
  t+=dt; tronStateT+=dt;
  const g=TRON_GRIDS[tronGridTheme];

  // base: tron grid background
  for(let i=0;i<N;i++){
    const x=gridX[i],y=gridY[i],z=gridZ[i];
    const onGrid=x%4===0||y%4===0||z%4===0;
    setLED(i,onGrid?g[0]*1.5:g[0], onGrid?g[1]*1.5:g[1], onGrid?g[2]*1.5:g[2]);
  }

  // trail — solid 1-pixel lines per bike
  for(let i=0;i<N;i++){
    if(tronTrail[i]>0&&tronTrail[i]!==255){
      const bk=tronBikes[tronTrail[i]-1], h=bk.hue;
      const [r,gg,b]=hsl(h,1,0.45);
      setLED(i,r,gg,b);
    }
  }

  if(tronState==='run'){
    // update bikes
    let alive=0;
    for(const bk of tronBikes) if(bk.alive) alive++;

    for(const bk of tronBikes){
      if(!bk.alive) continue;
      bk.acc+=dt*bk.speed*tronSpeedMult*speedMult;
      while(bk.acc>=1){
        bk.acc-=1;
        const newDir=tronDecide(bk);
        if(!newDir){tronCrash(bk);break;}
        const [ndu,ndv]=newDir;
        const moved=tronMove(bk.face,bk.u,bk.v,ndu,ndv);
        if(!moved){tronCrash(bk);break;}
        const [nf,nu,nv,fdu,fdv]=moved;
        const idx=faceMap[nf][nv*SIZE+nu];
        if(idx<0||tronTrail[idx]>0){tronCrash(bk);break;}
        bk.du=fdu; bk.dv=fdv;
        const bikeIdx=tronBikes.indexOf(bk)+1;
        const oldIdx=faceMap[bk.face][bk.v*SIZE+bk.u];
        if(oldIdx>=0) tronTrail[oldIdx]=bikeIdx;
        bk.face=nf; bk.u=nu; bk.v=nv;
        // Mark new position immediately to prevent other bikes entering this cell
        if(idx>=0) tronTrail[idx]=bikeIdx;
      }
    }

    // Head-on collision: if two alive bikes share the same cell, both crash
    for(let i=0;i<tronBikes.length;i++){
      if(!tronBikes[i].alive) continue;
      for(let j=i+1;j<tronBikes.length;j++){
        if(!tronBikes[j].alive) continue;
        if(tronBikes[i].face===tronBikes[j].face&&tronBikes[i].u===tronBikes[j].u&&tronBikes[i].v===tronBikes[j].v){
          tronCrash(tronBikes[i]);
          tronCrash(tronBikes[j]);
        }
      }
    }

    // draw bike heads
    for(const bk of tronBikes){
      if(!bk.alive) continue;
      const idx=faceMap[bk.face][bk.v*SIZE+bk.u];
      if(idx>=0){const [r,gg,b]=hsl(bk.hue,0.3,0.95);setLED(idx,r,gg,b);}
    }

    // check round end — all alive bikes crashed
    const nowAlive=tronBikes.filter(b=>b.alive);
    if(nowAlive.length<=1){
      tronRoundWinner=nowAlive.length===1?tronBikes.indexOf(nowAlive[0]):-1;
      const nonElim=[];
      for(let i=0;i<tronBikeCount;i++){
        if(tronScoreFill[i]>0) nonElim.push(i);
      }
      if(nonElim.length>1){
        tronState='restart'; tronStateT=0;
      } else {
        tronWinner=nonElim.length===1?nonElim[0]:0;
        tronState='win'; tronStateT=0;
      }
    }
  } else if(tronState==='restart'){
    // Flash round winner's trail with RGB cycling
    if(tronRoundWinner>=0){
      const hue=(tronStateT*2)%1;
      const rgb=hsl(hue,1,0.7);
      for(let i=0;i<N;i++){
        if(tronTrail[i]===tronRoundWinner+1){
          colBuf[i*3]=rgb[0];colBuf[i*3+1]=rgb[1];colBuf[i*3+2]=rgb[2];
        }
      }
    }
    if(tronStateT>1.5) initTron();
  } else {
    // winner celebration — pulse whole cube in winner color, then restart
    if(tronWinner>=0){
      const wh=TRON_HUES[tronWinner];
      const pulse=0.5+0.5*Math.sin(tronStateT*8);
      for(let i=0;i<N;i++){if(tronTrail[i]===tronWinner+1){const [r,gg,b]=hsl(wh,1,0.3+pulse*0.5);setLED(i,r,gg,b);}}
    }
    if(tronWinFlash<=0&&tronStateT>5) initTron();
  }

  // explosions (only during normal play, not during win flash)
  if(tronWinFlash<=0){
    for(let k=tronExplosions.length-1;k>=0;k--){
      const p=tronExplosions[k];
      p.x+=p.vx*dt*8; p.y+=p.vy*dt*8; p.z+=p.vz*dt*8; p.life-=dt*1.8;
      if(p.life<=0){tronExplosions.splice(k,1);continue;}
      for(let i=0;i<N;i++){
        const dx=gridX[i]*SPACING-HALF-p.x, dy=gridY[i]*SPACING-HALF-p.y, dz=gridZ[i]*SPACING-HALF-p.z;
        const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(d<SPACING*4){const b=Math.pow(1-d/(SPACING*4),1.2)*p.life;const [r,gg,bv]=hsl(p.hue,1,b);if(r>colBuf[i*3])colBuf[i*3]=r;if(gg>colBuf[i*3+1])colBuf[i*3+1]=gg;if(bv>colBuf[i*3+2])colBuf[i*3+2]=bv;}
      }
    }
  }
  // Red border walls in 2D mode
  if(typeof panel2dMode!=='undefined' && panel2dMode && tronBorderWalls){
    const f=0;
    for(let i=0;i<SIZE;i++){
      for(const [eu,ev] of [[i,0],[i,SIZE-1],[0,i],[SIZE-1,i]]){
        const lv=SIZE-1-ev;
        const idx=faceMap[f][lv*SIZE+eu];
        if(idx>=0){colBuf[idx*3]=0.9;colBuf[idx*3+1]=0.05;colBuf[idx*3+2]=0.05;}
      }
    }
    // Red outline around scoreboard zone
    const sz=tronScoreZone();
    for(let v=Math.max(0,sz.v0);v<=Math.min(SIZE-1,sz.v1);v++){
      for(let u=Math.max(0,sz.u0);u<=Math.min(SIZE-1,sz.u1);u++){
        const isEdge=(v===sz.v0||v===sz.v1||u===sz.u0||u===sz.u1);
        if(!isEdge) continue;
        const lv=SIZE-1-v;
        const idx=faceMap[f][lv*SIZE+u];
        if(idx>=0){colBuf[idx*3]=0.9;colBuf[idx*3+1]=0.05;colBuf[idx*3+2]=0.05;}
      }
    }
  }
  tronUpdateScoreboard();
  tronRenderScoreOnLEDs(dt);
}

// Scoreboard exclusion zone — bikes treat this area as walls
function tronScoreZone(){
  const boxW=4, boxH=4, gap=1;
  const startU=SIZE-boxW-2;
  const totalH=2+tronBikeCount*(boxH+gap);
  return {u0:startU-2, v0:0, u1:SIZE-1, v1:totalH};
}

function tronRenderScoreOnLEDs(dt){
  if(!tronDeaths||!tronBikes.length||!tronScoreFill) return;

  // Each crash removes exactly 1 pixel
  for(let i=0;i<tronBikes.length;i++){
    const target=Math.max(0, tronMaxFill-tronDeaths[i]);
    if(tronScoreFill[i]>target) tronScoreFill[i]=Math.max(target, tronScoreFill[i]-1);
  }

  // Check how many bikes are still in the game (have pixels left)
  const inGame=[];
  for(let i=0;i<tronBikes.length;i++){
    if(tronScoreFill[i]>0) inGame.push(i);
  }

  // If only 1 bike left with pixels, that bike wins
  if(inGame.length<=1&&tronWinFlash<=0){
    tronWinBike=inGame.length===1?inGame[0]:0;
    tronWinFlash=5.0;
  }

  // Draw filled score boxes on face 0, sorted by most pixels (winner at top)
  const face=0;
  const boxW=4, boxH=4, gap=1;
  const startU=SIZE-boxW-2;
  const sorted=tronBikes.map((_,i)=>i);
  sorted.sort((a,b)=>tronScoreFill[b]-tronScoreFill[a]);

  for(let rank=0;rank<sorted.length;rank++){
    const bi=sorted[rank];
    const h=TRON_HUES[bi%TRON_HUES.length];
    const alive=tronBikes[bi]&&tronBikes[bi].alive;
    const rgb=hsl(h,1,alive?0.5:0.15);
    const topV=2+rank*(boxH+gap);
    const fillPx=Math.min(tronScoreFill[bi], tronMaxFill);
    let drawn=0;
    for(let row=boxH-1;row>=0&&drawn<fillPx;row--){
      for(let col=0;col<boxW&&drawn<fillPx;col++){
        const v=topV+row, u=startU+col;
        if(v>=SIZE||u>=SIZE) continue;
        const lv=SIZE-1-v;
        const idx=faceMap[face][lv*SIZE+u];
        if(idx>=0){colBuf[idx*3]=rgb[0];colBuf[idx*3+1]=rgb[1];colBuf[idx*3+2]=rgb[2];}
        drawn++;
      }
    }
  }

  // Win flash mode
  if(tronWinFlash>0){
    tronWinFlash-=dt;
    const wh=TRON_HUES[tronWinBike%TRON_HUES.length];
    const flash=0.3+0.7*Math.abs(Math.sin(tronWinFlash*4));
    const rgb=hsl(wh,1,flash*0.6);
    for(let i=0;i<N;i++){
      colBuf[i*3]=rgb[0]; colBuf[i*3+1]=rgb[1]; colBuf[i*3+2]=rgb[2];
    }
    // Pulse winner's trail brighter
    const pulse=0.5+0.5*Math.sin(tronWinFlash*8);
    const trailRgb=hsl(wh,1,0.3+pulse*0.6);
    for(let i=0;i<N;i++){
      if(tronTrail[i]===tronWinBike+1){
        colBuf[i*3]=trailRgb[0];colBuf[i*3+1]=trailRgb[1];colBuf[i*3+2]=trailRgb[2];
      }
    }
    tronRenderWinsText(0,wh);
    if(tronWinFlash<=0){
      tronDeaths.fill(0);
      tronScoreFill.fill(tronMaxFill);
      tronWinBike=-1;
      initTron();
    }
    return;
  }
}

function tronRenderWinsText(face,hue){
  const fg=hsl(hue,1,0.95);
  // "WIN" in 5x7 pixel font
  const W=[[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]];
  const I=[[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0],[1,1,1]];
  const Nl=[[1,0,0,1],[1,1,0,1],[1,1,0,1],[1,0,1,1],[1,0,1,1],[1,0,0,1],[1,0,0,1]];
  const letters=[W,I,Nl];
  const charWidths=[5,3,4];
  const charH=7;
  const totalCharW=charWidths.reduce((a,b)=>a+b,0)+2;
  const scale2=Math.max(1,Math.floor(SIZE/totalCharW));
  const totalW=totalCharW*scale2;
  const offV=Math.floor((SIZE-charH*scale2)/2);
  for(let f=0;f<6;f++){
    const offU=Math.floor((SIZE-totalW)/2);
    let curU=offU;
    for(let li=0;li<letters.length;li++){
      const letter=letters[li];
      const cw=charWidths[li];
      for(let row=0;row<charH;row++){
        for(let col=0;col<cw;col++){
          if(!letter[row][col]) continue;
          for(let sy=0;sy<scale2;sy++){
            for(let sx=0;sx<scale2;sx++){
              const u=curU+col*scale2+sx, v=offV+row*scale2+sy;
              if(u>=SIZE||v>=SIZE||u<0||v<0) continue;
              const lv=SIZE-1-v;
              const idx=faceMap[f][lv*SIZE+u];
              if(idx>=0){colBuf[idx*3]=fg[0];colBuf[idx*3+1]=fg[1];colBuf[idx*3+2]=fg[2];}
            }
          }
        }
      }
      curU+=(cw+1)*scale2;
    }
  }
}

// ═══════════════════════════════════════════════════
//  LIGHTNING STORM
// ═══════════════════════════════════════════════════
let lightningBolts=[], lightningT=0, lightningStormT=0, lightningThunder=0;

function boltJag(face,u,v,du,dv,steps,depth){
  const pts=[[face,u,v]];
  let cf=face,cu=u,cv=v;
  const pu=-dv, pv=du; // perpendicular
  for(let i=0;i<steps;i++){
    const jag=Math.round((Math.random()-0.5)*5);
    const nu2=Math.max(0,Math.min(SIZE-1, cu+du+pu*jag));
    const nv2=Math.max(0,Math.min(SIZE-1, cv+dv+pv*jag));
    const res=tronMove(cf,nu2,nv2,du||1,dv||1);
    cf=res[0]; cu=res[1]; cv=res[2];
    pts.push([cf,cu,cv]);
    // spawn branch
    if(depth>0&&Math.random()<0.4){
      const bd=DIRS4[Math.floor(Math.random()*4)];
      const sub=boltJag(cf,cu,cv,bd[0],bd[1],Math.max(2,steps>>1),depth-1);
      lightningBolts.push({pts:sub,life:1,decay:7+Math.random()*5,branch:true,hue:0.62+Math.random()*0.1});
    }
  }
  return pts;
}
const DIRS4=[[1,0],[-1,0],[0,1],[0,-1]];

function spawnStrike(){
  const face=Math.floor(Math.random()*6);
  const su=4+Math.floor(Math.random()*(SIZE-8));
  const sv=4+Math.floor(Math.random()*(SIZE-8));
  const dir=DIRS4[Math.floor(Math.random()*4)];
  const len=Math.floor(SIZE*0.5+Math.random()*SIZE*1.0);
  const hc=Math.random();
  const hue=hc<0.35?0:hc<0.6?0.62:hc<0.78?0.75:0.08;
  const pts=boltJag(face,su,sv,dir[0],dir[1],len,2);
  lightningBolts.push({pts,life:1,decay:3.5+Math.random()*3,branch:false,hue,width:2});
  lightningThunder=Math.max(lightningThunder,0.65+Math.random()*0.35);
}

// ── LIGHT SPEED ──────────────────────────────────────────────────────────────
let lsRacers=[], lsT=0;
let lsSpeed=8, lsTrail=32, lsSize=1, lsColour='multi', lsCount=3, lsNudge=0;

function lsTransfer(face,u,v,du,dv,S){
  const S1=S-1;
  let r;
  if(u<0){
    if(face===0)r=[3,S1,v, du, dv];
    else if(face===1)r=[3, 0,v,-du, dv];
    else if(face===2)r=[1,S1,v, du, dv];
    else if(face===3)r=[1, 0,v,-du, dv];
    else if(face===4)r=[3, v,S1, dv, du];
    else             r=[3, v, 0, dv,-du];
  } else if(u>=S){
    if(face===0)r=[2,S1,v,-du, dv];
    else if(face===1)r=[2, 0,v, du, dv];
    else if(face===2)r=[0,S1,v,-du, dv];
    else if(face===3)r=[0, 0,v, du, dv];
    else if(face===4)r=[2, v,S1, dv,-du];
    else             r=[2, v, 0, dv, du];
  } else if(v<0){
    if(face===0)r=[5, u,S1, du, dv];
    else if(face===1)r=[5, u, 0, du,-dv];
    else if(face===2)r=[5,S1, u, dv, du];
    else if(face===3)r=[5, 0, u,-dv, du];
    else if(face===4)r=[1, u,S1, du, dv];
    else             r=[1, u, 0, du,-dv];
  } else {
    if(face===0)r=[4, u,S1, du,-dv];
    else if(face===1)r=[4, u, 0, du, dv];
    else if(face===2)r=[4,S1, u,-dv, du];
    else if(face===3)r=[4, 0, u, dv, du];
    else if(face===4)r=[0, u,S1, du,-dv];
    else             r=[0, u, 0, du, dv];
  }
  r[1]=Math.max(1,Math.min(S-2,r[1]));
  r[2]=Math.max(1,Math.min(S-2,r[2]));
  const spd=Math.sqrt(r[3]*r[3]+r[4]*r[4])||1;
  r[3]/=spd; r[4]/=spd;
  return r;
}


function resetLightspeed(){
  lsRacers=[];
  const S=SIZE;
  for(let k=0;k<lsCount;k++){
    const face=k%6;
    const u=S*0.25+Math.random()*S*0.5;
    const v=S*0.25+Math.random()*S*0.5;
    // Start at 0 degrees = going straight right (du=1, dv=0)
    lsRacers.push({face,u,v,
      du:1, dv:0,
      hue:k/lsCount, trail:[],
      nudgeCountdown:3+Math.random()*4,
      nudgeT:3+Math.random()*5});
  }
}

function effectLightspeed(dt){
  lsT+=dt;
  if(!lsRacers.length||!faceMap) resetLightspeed();
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  const S=SIZE, S1=S-1;

  // Pixels per second — fast but not insane
  const pps=Math.pow(lsSpeed,1.6)*SIZE*0.8;
  const dist=pps*dt;
  const subSteps=Math.min(Math.max(1,Math.ceil(dist)),400);
  const d=dist/subSteps;

  for(const r of lsRacers){
    r.nudgeCountdown-=dt;
    if(r.nudgeCountdown<=0){
      r.nudgeCountdown=r.nudgeT*(0.8+Math.random()*3);
      if(lsNudge>0){
        const a=(Math.random()-0.5)*2*(lsNudge*Math.PI/180);
        const c=Math.cos(a),s_=Math.sin(a);
        const od=r.du,ov=r.dv;
        r.du=od*c-ov*s_; r.dv=od*s_+ov*c;
        const l=Math.sqrt(r.du*r.du+r.dv*r.dv)||1;
        r.du/=l; r.dv/=l;
      }
    }

    for(let ss=0;ss<subSteps;ss++){
      r.u+=r.du*d;
      r.v+=r.dv*d;

      if(r.u<0||r.u>=S||r.v<0||r.v>=S){
        const res=lsTransfer(r.face,r.u,r.v,r.du,r.dv,S);
        r.face=res[0];
        r.u=Math.max(0.001,Math.min(S-0.001,res[1]));
        r.v=Math.max(0.001,Math.min(S-0.001,res[2]));
        r.du=res[3]; r.dv=res[4];
        // Renormalise speed
        const l=Math.sqrt(r.du*r.du+r.dv*r.dv)||1;
        r.du/=l; r.dv/=l;
      }

      const pu=Math.round(r.u), pv=Math.round(r.v);
      if(pu>=0&&pu<S&&pv>=0&&pv<S&&faceMap[r.face][pv*S+pu]>=0){
        r.trail.push({face:r.face,u:pu,v:pv});
        if(r.trail.length>lsTrail) r.trail.shift();
      }
    }
    r.hue=(r.hue+dt*0.04)%1;

    const tl=r.trail.length;
    for(let i=0;i<tl;i++){
      const {face,u,v}=r.trail[i];
      const frac=(i+1)/tl;
      const bright=Math.pow(frac,1.3);
      let rr,rg,rb;
      if(lsColour==='multi') [rr,rg,rb]=hsl((r.hue+frac*0.1+lsT*0.04)%1,1,bright);
      else{
        const hmap={white:null,cyan:0.52,red:0.02,green:0.33,gold:0.13};
        const h=hmap[lsColour];
        if(!h){rr=bright;rg=bright;rb=bright;}
        else [rr,rg,rb]=hsl(h,1,bright);
      }
      if(i===tl-1){rr=1;rg=1;rb=1;}
      const R=lsSize-1;
      for(let dv2=-R;dv2<=R;dv2++) for(let du2=-R;du2<=R;du2++){
        const nu=u+du2,nv=v+dv2;
        if(nu<0||nu>=S||nv<0||nv>=S) continue;
        const idx=faceMap[face][nv*S+nu];
        if(idx<0) continue;
        if(rr>colBuf[idx*3])   colBuf[idx*3]  =rr;
        if(rg>colBuf[idx*3+1]) colBuf[idx*3+1]=rg;
        if(rb>colBuf[idx*3+2]) colBuf[idx*3+2]=rb;
      }
    }
  }
}

// ── CUSTOM CUBE ──────────────────────────────────────────────────────────────
let _customCubeName=null;
let _customCubeData=null;

function ccRefreshSelect(){
  try{
    const lib=JSON.parse(localStorage.getItem('ledcube_cubes')||'[]');
    const sel=document.getElementById('cc-select');
    if(!sel) return;
    sel.innerHTML='<option value="">— choose a saved cube —</option>';
    lib.forEach((c,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=c.name; sel.appendChild(o); });
  } catch(e){}
}

function effectCustomCube(dt){
  if(!_customCubeData){
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    return;
  }

  // Render only assigned faces, masking each effect to its own face
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  const accumBuf=new Float32Array(N*3);
  for(let f=0;f<6;f++){
    const pf=_customCubeData[f];
    if(!pf||!pf.effect||pf.effect==='none') continue;
    const fn=EFFECTS[pf.effect];
    if(!fn||pf.effect==='custom_cube') continue;

    // Apply this face's saved opts to relevant globals
    const opts=pf.opts||{};
    const _fwTextOn=fwTextOn, _fwTextPixels=fwTextPixels, _fwTextWidth=fwTextWidth, _fwTextH=fwTextH;
    const _rainStyle=rainStyle;
    if(pf.effect==='fireworks'){
      fwTextOn=!!opts.textOn;
      if(fwTextOn && opts.text && (!fwTextPixels||opts._lastText!==opts.text)){
        buildFwText(opts.text);
        opts._lastText=opts.text;
      }
    }
    if(pf.effect==='rain') rainStyle=opts.style||'colour';

    for(let i=0;i<N*3;i++) colBuf[i]=0;
    _peTargetFace=f; _peTargetOpts=opts;
    fn(dt);
    _peTargetFace=-1; _peTargetOpts=null;

    // Per-face overlays
    if(pf.overlayKeys&&pf.overlayKeys.length){
      applyFaceOverlays(f, pf.overlayKeys, dt);
    }

    // Restore globals
    fwTextOn=_fwTextOn; fwTextPixels=_fwTextPixels; fwTextWidth=_fwTextWidth; fwTextH=_fwTextH;
    rainStyle=_rainStyle;

    // Copy ONLY this face's LEDs into the accumulator
    for(let j=0;j<SIZE*SIZE;j++){
      const idx=faceMap[f][j];
      if(idx>=0){accumBuf[idx*3]=colBuf[idx*3];accumBuf[idx*3+1]=colBuf[idx*3+1];accumBuf[idx*3+2]=colBuf[idx*3+2];}
    }
  }
  for(let i=0;i<N*3;i++) colBuf[i]=accumBuf[i];
}

// ── WEATHER EFFECT ─────────────────────────────────────────────────────────────
let wxCode=0,wxTemp=20,wxDesc='Clear',wxFetching=false,wxLastFetch=-9999;
let wxSunriseS=21600,wxSunsetS=72000,wxTzOffset=0;
let wxLat=52.04,wxLon=-0.76,wxCityDisplay='';
let wxClouds=[],wxParticles=[],wxStars=[],wxT2=0,wxLightFlash=0,wxScrollOff=0;
let wxSkyline=null,wxCreatures=[];
const WX_CODES={0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  77:'Snow grains',80:'Showers',81:'Heavy showers',82:'Violent showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm+hail',99:'Severe thunderstorm'};

function wxMoonPhase(d){
  const ref=new Date(2024,0,11);
  const days=(d-ref)/864e5;
  return((days%29.53058867)+29.53058867)%29.53058867/29.53058867; // 0=new 0.5=full
}

function wxSkyRGB(df){
  // df 0-1: 0/1=midnight, 0.25≈sunrise, 0.5=noon, 0.75≈sunset
  const s=[
    [0.00, [0,2,20]],   [0.20, [1,3,18]],  [0.22, [12,6,22]],
    [0.25, [80,25,10]],  [0.28, [200,80,20]],[0.32, [50,130,220]],
    [0.40, [12,115,240]],[0.50, [8,110,255]],[0.60, [12,118,245]],
    [0.70, [55,140,230]],[0.73, [220,100,20]],[0.76, [180,35,15]],
    [0.80, [30,8,28]],   [1.00, [0,2,20]]
  ];
  let a=s[0],b=s[s.length-1];
  for(let i=0;i<s.length-1;i++){if(df>=s[i][0]&&df<s[i+1][0]){a=s[i];b=s[i+1];break;}}
  const m=(df-a[0])/(b[0]-a[0]||1);
  return[(a[1][0]+(b[1][0]-a[1][0])*m)/255,(a[1][1]+(b[1][1]-a[1][1])*m)/255,(a[1][2]+(b[1][2]-a[1][2])*m)/255];
}

function wxInitScene(code){
  wxClouds=[];wxParticles=[];wxStars=[];
  const isRainCode=code>=51&&code<=55||code>=61&&code<=65||code>=80&&code<=82||code>=95;
  const isSnowCode=code>=71&&code<=77||code>=85&&code<=86;
  const isStormCode=code>=95;
  const isHeavyRain=code===55||code===65||code>=81;
  const isOvercastCode=code===3;
  const nc=code===0?0:code===1?8:code<=2?25:isOvercastCode?65:isStormCode?90:isHeavyRain?80:isRainCode?70:isSnowCode?18:code>=45&&code<=48?12:10;
  const dark=isStormCode;
  for(let i=0;i<nc;i++) wxClouds.push({px:Math.random(),py:isOvercastCode?0.15+Math.random()*0.8:isStormCode||isRainCode?0.2+Math.random()*0.75:0.3+Math.random()*0.6,
    sz:isStormCode?0.16+Math.random()*0.24:isRainCode?0.14+Math.random()*0.22:isOvercastCode?0.18+Math.random()*0.25:code<=2?0.1+Math.random()*0.18:0.07+Math.random()*0.14,
    spd:0.0002+Math.random()*0.0004,
    spdY:(Math.random()-0.35)*0.00012,
    br:dark?0.3+Math.random()*0.2:isRainCode?0.4+Math.random()*0.3:isOvercastCode?0.55+Math.random()*0.45:0.6+Math.random()*0.4,
    puffs:isStormCode?6+Math.floor(Math.random()*6):isRainCode?5+Math.floor(Math.random()*5):isOvercastCode?6+Math.floor(Math.random()*7):3+Math.floor(Math.random()*5),fluff:Math.random()});
  for(let i=0;i<100;i++) wxStars.push({px:Math.random(),py:Math.random(),
    br:0.3+Math.random()*0.7,tw:Math.random()*Math.PI*2,spd:1.5+Math.random()*3});
  const np=isStormCode?150:isHeavyRain?120:isRainCode?80:isSnowCode?60:0;
  for(let i=0;i<np;i++) wxParticles.push({
    face:Math.floor(Math.random()*4),
    u:Math.random()*(SIZE-1),v:Math.random()*(SIZE-1),
    spd:isRainCode?3+Math.random()*5:0.4+Math.random()*0.8,
    snow:isSnowCode,drift:isRainCode?(Math.random()-0.5)*1.5:0
  });

  // Skyline — deterministic per city/weather
  const panW=4*SIZE;
  wxSkyline=new Uint8Array(panW);
  const seed=Math.abs(Math.round(wxLat*100+wxLon*10+code*7))%9999;
  let bx=0;
  while(bx<panW){
    const bw=2+((bx*1327+seed*43+13)%8);
    const bh=Math.max(1,1+((bx*7919+seed*17+7)%(Math.max(1,Math.floor(SIZE*0.14)))));
    for(let i=0;i<bw&&bx+i<panW;i++) wxSkyline[bx+i]=bh;
    bx+=bw+((bx*31+seed+3)%4);
  }

  // Creatures: birds, occasional plane, and hot air balloons on nice days
  wxCreatures=[];
  for(let i=0;i<4;i++){
    const isPlane=i===3;
    wxCreatures.push({
      type:isPlane?'plane':'bird',
      px:isPlane?-0.5:Math.random(),
      py:isPlane?0.62+Math.random()*0.25:0.38+Math.random()*0.45,
      dx:(Math.random()<0.5?1:-1)*(isPlane?0.0008+Math.random()*0.0005:0.0015+Math.random()*0.002),
      dy:isPlane?0:(Math.random()-0.5)*0.0008,
      wing:0, wingT:0, blink:0, cycleCount:0, wingSpeed:2+Math.random()*3,
      delay:isPlane?Math.random()*120:Math.random()*15,
      active:true, lightningHit:0, wobble:0,
    });
  }
  if(code<=2){
    const balloonColors=[[1,0.2,0.1],[0.1,0.5,1],[0.9,0.8,0.1],[0.2,0.8,0.3],[0.8,0.2,0.8],[1,0.5,0]];
    wxCreatures.push({
      type:'balloon', px:Math.random(), py:0.05,
      dx:0.0003+Math.random()*0.0002, dy:0,
      phase:'rise', phaseT:0, laps:0, maxLaps:2+Math.floor(Math.random()*3),
      color:balloonColors[Math.floor(Math.random()*balloonColors.length)],
      delay:30+Math.random()*60, active:true,
    });
  }
}

// ── Weather city search dropdown (live API) ──
let wxCityTimer=null;

function wxUpdateCityDropdown(){
  const input=document.getElementById('wx-city')?.value.trim()||'';
  const dropdown=document.getElementById('wx-city-dropdown');
  if(!dropdown) return;
  if(input.length<2){ dropdown.style.display='none'; return; }
  clearTimeout(wxCityTimer);
  wxCityTimer=setTimeout(()=>{
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=8&format=json`)
      .then(r=>r.json()).then(data=>{
        const results=data.results||[];
        if(!results.length){ dropdown.style.display='none'; return; }
        const nameCounts={};
        results.forEach(r=>{ nameCounts[r.name]=(nameCounts[r.name]||0)+1; });
        dropdown.innerHTML=results.map(r=>{
          const label=`${r.name}${r.admin1?', '+r.admin1:''}${r.country?', '+r.country:''}`;
          const short=r.country?`${r.name}, ${r.country}`:r.name;
          return `<div style="padding:6px 8px;cursor:pointer;font-size:13px;color:#9bd;border-bottom:1px solid rgba(80,120,255,0.1);" data-short="${short}" data-lat="${r.latitude}" data-lon="${r.longitude}">${label}</div>`;
        }).join('');
        dropdown.style.display='block';
        dropdown.querySelectorAll('div[data-short]').forEach(el=>{
          el.addEventListener('click',()=>{
            document.getElementById('wx-city').value=el.dataset.short;
            wxCityDisplay=el.dataset.short;
            wxLat=parseFloat(el.dataset.lat);
            wxLon=parseFloat(el.dataset.lon);
            dropdown.style.display='none';
            wxFetch(true);
          });
        });
      }).catch(()=>{});
  },250);
}

document.getElementById('wx-city')?.addEventListener('input',wxUpdateCityDropdown);
document.getElementById('wx-city')?.addEventListener('focus',wxUpdateCityDropdown);
document.addEventListener('click',e=>{
  if(!e.target.closest('#wx-city')&&!e.target.closest('#wx-city-dropdown')){
    document.getElementById('wx-city-dropdown').style.display='none';
  }
});

async function wxFetch(skipGeocode){
  if(wxFetching) return;
  wxFetching=true;
  const city=(document.getElementById('wx-city')?.value||'London').trim();
  const statusEl=document.getElementById('wx-status');
  const infoEl=document.getElementById('wx-info');
  if(statusEl) statusEl.textContent='Searching…';
  try{
    if(!skipGeocode){
      const geoUrl=`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`;
      let gr;
      try{ gr=await fetch(geoUrl); }
      catch(fe){ throw new Error('Network error — check internet connection'); }
      if(!gr.ok) throw new Error('Geocoding failed: '+gr.status);
      const gd=await gr.json();
      if(!gd.results?.length) throw new Error(`City "${city}" not found`);
      const loc=gd.results[0];
      wxLat=loc.latitude; wxLon=loc.longitude;
      wxCityDisplay=loc.country?`${loc.name}, ${loc.country}`:loc.name;
    }
    if(statusEl) statusEl.textContent=`Fetching weather for ${city}…`;

    // Step 2: weather
    const wxUrl=`https://api.open-meteo.com/v1/forecast?latitude=${wxLat.toFixed(4)}&longitude=${wxLon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    let wr;
    try{ wr=await fetch(wxUrl); }
    catch(fe){ throw new Error('Weather fetch failed — check internet connection'); }
    if(!wr.ok) throw new Error('Weather API error: '+wr.status);
    const wd=await wr.json();
    wxCode=wd.current?.weather_code||0;
    wxTemp=Math.round(wd.current?.temperature_2m||20);
    wxTzOffset=wd.utc_offset_seconds||0;
    const pt=s=>{ const p=(s||'').split('T')[1]||'00:00'; const[h,m]=(p.split(':')).map(Number); return h*3600+m*60; };
    wxSunriseS=pt(wd.daily?.sunrise?.[0])||21600;
    wxSunsetS=pt(wd.daily?.sunset?.[0])||72000;
    wxDesc=WX_CODES[wxCode]||'Unknown';
    wxInitScene(wxCode);
    wxLastFetch=Date.now()/1000;
    if(statusEl) statusEl.textContent=city;
    if(infoEl){
      infoEl.style.display='block';
      const tl=document.getElementById('wx-temp-line');
      const sl=document.getElementById('wx-sun-line');
      if(tl) tl.textContent=`${wxTemp}°C  •  ${wxDesc}`;
      if(sl){
        const fmt=s=>{ try{return new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(e){return'?';} };
        sl.textContent=`🌅 ${fmt(wd.daily?.sunrise?.[0])}   🌇 ${fmt(wd.daily?.sunset?.[0])}`;
      }
    }
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+e.message;
    console.error('Weather fetch error:',e);
  }
  wxFetching=false;
}

document.getElementById('wx-fetch-btn')?.addEventListener('click',wxFetch);
document.getElementById('wx-city')?.addEventListener('keydown',e=>{ if(e.key==='Enter') wxFetch(); });

function effectWeather(dt){
  // Initialize on first run or after weather fetch
  if(!wxSkyline){
    wxInitScene(wxCode);
  }
  wxT2+=dt;
  const S=SIZE,S1=S-1;

  // City local time
  const localMs=Date.now()+wxTzOffset*1000;
  const secsDay=Math.floor(localMs/1000)%86400;
  const dayFrac=secsDay/86400;

  // Sun position (panorama x: 0=east/face2, 0.25=south/face0, 0.5=west/face3)
  const isDay=secsDay>wxSunriseS&&secsDay<wxSunsetS;
  const dayLen=wxSunsetS-wxSunriseS||1;
  const dayProg=isDay?(secsDay-wxSunriseS)/dayLen:0;
  const sunPX=isDay?dayProg*0.5:-1;      // 0(east) → 0.5(west) through 0.25(south)
  const sunElev=isDay?Math.sin(dayProg*Math.PI):0; // 0-1

  // Moon (mirrors sun but at night, same arc)
  const nightLen=86400-dayLen||1;
  const fromSunset=secsDay>wxSunsetS?secsDay-wxSunsetS:secsDay+(86400-wxSunsetS);
  const nightProg=!isDay?fromSunset/nightLen:0;
  const moonPX=!isDay?nightProg*0.5:-1;
  const moonElev=!isDay?Math.sin(nightProg*Math.PI)*0.9:0;
  const moonPh=wxMoonPhase(new Date());

  // Twilight
  const twilS=3600;
  const toSr=wxSunriseS-secsDay, fromSs=secsDay-wxSunsetS;
  let lightLvl=isDay?1:0;
  if(!isDay&&toSr>0&&toSr<twilS) lightLvl=1-toSr/twilS;
  if(!isDay&&fromSs>0&&fromSs<twilS) lightLvl=1-fromSs/twilS;

  // Colours
  let skyCol=wxSkyRGB(dayFrac);
  const isFog=wxCode>=45&&wxCode<=48;
  const isSnow=wxCode>=71&&wxCode<=77||wxCode>=85&&wxCode<=86;
  const isRain=wxCode>=51&&wxCode<=65||wxCode>=80&&wxCode<=82||wxCode>=95;
  const isStorm=wxCode>=95;
  const isOvercast=wxCode===3;

  // Darken/grey sky based on weather conditions
  if(isDay){
    if(isStorm){
      skyCol=[skyCol[0]*0.2+0.03,skyCol[1]*0.2+0.03,skyCol[2]*0.25+0.04];
    } else if(isRain){
      skyCol=[skyCol[0]*0.4+0.08,skyCol[1]*0.4+0.1,skyCol[2]*0.5+0.1];
    } else if(isOvercast){
      skyCol=[0.25,0.27,0.3];
    } else if(wxCode===2){
      skyCol=[skyCol[0]*0.75+0.04,skyCol[1]*0.75+0.04,skyCol[2]*0.8+0.03];
    }
  }

  // Lightning — random strikes at roughly speedMult-scaled intervals
  if(!this._wxNextStrike) this._wxNextStrike=1+Math.random()*3;
  if(isStorm){
    this._wxNextStrike-=dt*speedMult;
    if(this._wxNextStrike<=0){
      wxLightFlash=Math.min(1,wxLightFlash+0.7+Math.random()*0.3);
      this._wxNextStrike=(0.4+Math.random()*2.5)/Math.max(0.1,speedMult);
      if(Math.random()<0.35) this._wxNextStrike*=0.15;
    }
  }
  if(wxLightFlash>0) wxLightFlash=Math.max(0,wxLightFlash-dt*3);

  // Ground colour
  const gNight=dayFrac<0.25||dayFrac>0.75;
  const gR=isSnow?(gNight?0.5:0.9):gNight?0.02:0.04;
  const gG=isSnow?(gNight?0.52:0.94):gNight?0.04:0.09;
  const gB=isSnow?(gNight?0.55:0.98):gNight?0.02:0.03;

  // Horizon warm tint (dawn/dusk glow)
  const isDawn=dayFrac>0.22&&dayFrac<0.32;
  const isDusk=dayFrac>0.70&&dayFrac<0.80;
  const glowAmt=isDawn?Math.sin((dayFrac-0.22)/0.10*Math.PI):isDusk?Math.sin((dayFrac-0.70)/0.10*Math.PI):0;
  const hzR=Math.min(1,skyCol[0]+glowAmt*0.6);
  const hzG=Math.min(1,skyCol[1]+glowAmt*0.15);
  const hzB=Math.min(1,skyCol[2]*0.3);

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Cross-face pixel mapper for creatures and scrolling text
  const CW_FACES=[0,2,1,3];
  function creaturePx(stripCol,v){
    const totalCols=S*4;
    const col=((stripCol%totalCols)+totalCols)%totalCols;
    const qi=(col/S)|0;
    const fu=col%S;
    if(fu<0||fu>=S||v<0||v>=S) return -1;
    return faceMap[CW_FACES[qi]][v*S+fu];
  }
  function setCreature(idx,r,g,b){
    if(idx<0) return;
    colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
  }

  const HORIZ=0.32; // horizon at 32% from bottom of side faces
  const SIDE=[2,0,3,1]; // panorama quarter order matching panXOfFaceU: right→front→left→back

  // ── Panorama u→panX mapping per face ──
  // face2: panX = 0.25*f               range 0.0-0.25
  // face0: panX = 0.25+(1-f)*0.25      range 0.25-0.5
  // face3: panX = 0.5+(1-f)*0.25       range 0.5-0.75
  // face1: panX = 0.75+(1-f)*0.25      range 0.75-1.0  (flipped for back face)

  function panXOfFaceU(face,u){
    const f=u/S1;
    if(face===2) return 0.25*f;
    if(face===0) return 0.25+f*0.25;
    if(face===3) return 0.5+f*0.25;
    return 0.75+f*0.25; // face 1
  }
  function uOfFacePanX(face,px){
    if(face===2) return Math.round((px/0.25)*S1);
    if(face===0) return Math.round(((px-0.25)/0.25)*S1);
    if(face===3) return Math.round(((px-0.5)/0.25)*S1);
    return Math.round(((px-0.75)/0.25)*S1);
  }
  function vOfElevFrac(elev){ // elev 0=horizon, 1=top
    return Math.round((HORIZ+elev*(1-HORIZ))*S1);
  }

  // Skyline building colour
  const bldDay=dayFrac>0.25&&dayFrac<0.75;
  const bldR=bldDay?0.07:0.04, bldG=bldDay?0.08:0.04, bldB=bldDay?0.10:0.06;
  const horizV=Math.round(HORIZ*S1);
  const textV=3; // v position for text baseline
  const tempV=10; // temperature higher up
  const bldBase=9; // buildings start above text

  // Bitmap font 3×5 (each row is 3-bit: bit2=left, bit1=mid, bit0=right)
  const WXF={'0':[7,5,5,5,7],'1':[6,2,2,2,7],'2':[7,1,7,4,7],'3':[7,1,3,1,7],
    '4':[5,5,7,1,1],'5':[7,4,6,1,7],'6':[7,4,7,5,7],'7':[7,1,2,2,2],
    '8':[7,5,7,5,7],'9':[7,5,7,1,7],'°':[6,6,0,0,0],'C':[3,4,4,4,3],
    '-':[0,0,7,0,0],' ':[0,0,0,0,0],'+':[0,2,7,2,0],':':[0,2,0,2,0],
    'A':[2,5,7,5,5],'B':[6,5,6,5,6],'D':[6,5,5,5,6],'E':[7,4,6,4,7],
    'F':[7,4,6,4,4],'G':[3,4,7,5,3],'H':[5,5,7,5,5],'I':[7,2,2,2,7],
    'J':[1,1,1,5,2],'K':[5,6,4,6,5],'L':[4,4,4,4,7],'M':[7,7,5,5,5],
    'N':[7,5,5,5,5],'O':[7,5,5,5,7],'P':[6,5,6,4,4],'Q':[7,5,5,7,1],
    'R':[6,5,6,5,5],'S':[3,4,2,1,6],'T':[7,2,2,2,2],'U':[5,5,5,5,7],
    'V':[5,5,5,5,2],'W':[5,5,5,7,5],'X':[5,5,2,5,5],'Y':[5,5,2,2,2],
    'Z':[7,1,2,4,7],',':[0,0,0,2,4],'.':[0,0,0,0,2],
    'a':[0,6,5,7,5],'b':[4,6,5,5,6],'c':[0,3,4,4,3],'d':[1,3,5,5,3],
    'e':[0,7,5,6,3],'g':[0,3,5,3,7],'h':[4,6,5,5,5],'i':[2,0,2,2,2],
    'k':[4,5,6,6,5],'l':[6,2,2,2,7],'m':[0,7,7,5,5],'n':[0,6,5,5,5],
    'o':[0,7,5,5,7],'p':[0,6,5,6,4],'r':[0,3,5,4,4],'s':[0,3,6,1,6],
    't':[4,7,4,4,3],'u':[0,5,5,5,3],'v':[0,5,5,5,2],'w':[0,5,5,7,5],
    'x':[0,5,2,5,5],'y':[0,5,3,1,6],'z':[0,7,2,4,7],
  };

  function wxGlyph(face,ch,su,sv,tr,tg,tb){
    const rows=WXF[ch]||WXF[ch.toUpperCase()]; if(!rows) return 4;
    for(let row=0;row<5;row++){
      const bits=rows[row];
      for(let col=0;col<3;col++){
        if(!((bits>>(2-col))&1)) continue;
        const u=su+col, v=sv+(4-row);
        if(u<0||u>=S||v<0||v>=S) continue;
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        if(tr>colBuf[idx*3]) colBuf[idx*3]=tr;
        if(tg>colBuf[idx*3+1]) colBuf[idx*3+1]=tg;
        if(tb>colBuf[idx*3+2]) colBuf[idx*3+2]=tb;
      }
    }
    return 4;
  }
  function wxText(face,str,su,sv,tr,tg,tb){
    let u=su; for(const ch of str){ u+=wxGlyph(face,ch,u,sv,tr,tg,tb); if(u>=S) break; }
  }

  // Text colour varies with time
  const txtR=isDawn||isDusk?0.9:bldDay?0.8:0.6;
  const txtG=isDawn||isDusk?0.55:bldDay?0.8:0.65;
  const txtB=isDawn||isDusk?0.1:bldDay?0.85:0.9;

  // Temperature string: e.g. "12°C"  or  "-3°C"
  const tempStr=(wxTemp<0?'-':'')+Math.abs(wxTemp)+'°C';
  const locStr=(wxCityDisplay||document.getElementById('wx-city')?.value||'').trim().toUpperCase();

  // ── Render sky+ground on side faces ──
  for(let fi=0;fi<4;fi++){
    const face=SIDE[fi];
    for(let v=0;v<S;v++){
      const vFrac=v/S1;
      let r,g,b;
      if(vFrac<HORIZ){
        // ── Ground area ──
        // Determine panoramic x for this column later (per-u below)
        r=gR; g=gG; b=gB; // default ground, overridden per-u
      } else {
        const skyFrac=(vFrac-HORIZ)/(1-HORIZ);
        const sf2=Math.pow(skyFrac,0.65);
        r=hzR+(skyCol[0]-hzR)*sf2;
        g=hzG+(skyCol[1]-hzG)*sf2;
        b=hzB+(skyCol[2]-hzB)*sf2;
        if(isFog){ const fga=0.72*(1-skyFrac*0.3); r=r+(0.78-r)*fga; g=g+(0.80-g)*fga; b=b+(0.84-b)*fga; }
        if(wxLightFlash>0){ r=Math.min(1,r+wxLightFlash*0.8); g=Math.min(1,g+wxLightFlash*0.8); b=Math.min(1,b+wxLightFlash*0.8); }
        for(let u=0;u<S;u++){
          const idx=faceMap[face][v*S+u]; if(idx<0) continue;
          colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
        }
        continue; // skip per-u ground handling for sky rows
      }

      // Ground row: handle per-u for skyline (skip in 2D mode - just show sky)
      for(let u=0;u<S;u++){
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        if(!panel2dMode){
          const panXf=panXOfFaceU(face,u);
          const panIdx=Math.min(wxSkyline?wxSkyline.length-1:0, Math.floor(panXf*4*S));
          const bldH=wxSkyline?wxSkyline[panIdx]:0;
          // Building occupies from v=bldBase to v=bldBase+bldH
          if(v>=bldBase&&v<bldBase+bldH){
            // Building silhouette
            let br=bldR,bg=bldG,bb=bldB;
            // Windows at night: random lit squares
            if(!bldDay&&bldH>3){
              const wx2=Math.floor((panXf*4*S+11)%7);
              const wy=((v-bldBase)*13+37)%5;
              if(wx2===1&&wy===1){ br=0.55;bg=0.45;bb=0.10; } // warm window glow
            }
            colBuf[idx*3]=br; colBuf[idx*3+1]=bg; colBuf[idx*3+2]=bb;
          } else {
            colBuf[idx*3]=gR; colBuf[idx*3+1]=gG; colBuf[idx*3+2]=gB;
          }
        } else {
          // 2D mode: just show sky gradient, no buildings
          colBuf[idx*3]=gR; colBuf[idx*3+1]=gG; colBuf[idx*3+2]=gB;
        }
      }
    }

    // Draw temperature higher up on all faces
    wxText(face,tempStr,1,tempV,txtR,txtG,txtB);
    // Draw time on face 0 (front)
    if(face===0){
      const localD=new Date(Date.now()+wxTzOffset*1000);
      const hh=String(localD.getUTCHours()).padStart(2,'0');
      const mm=String(localD.getUTCMinutes()).padStart(2,'0');
      const ss=String(localD.getUTCSeconds()).padStart(2,'0');
      const timeStr=hh+':'+mm+':'+ss;
      const tx=Math.max(1,S-1-timeStr.length*4);
      wxText(face,timeStr,tx,textV+7,txtR*0.7,txtG*0.7,txtB*0.85);
    }
  }

  // Draw city name — static if fits, seamless scroll if not
  if(locStr){
    const textW=locStr.length*4;
    const totalW=panel2dMode?S:S*4;
    const lr=txtR*0.7,lg=txtG*0.7,lb=txtB*0.85;
    if(textW<=S){
      wxScrollOff=0;
      wxText(panel2dMode?0:SIDE[0],locStr,Math.max(0,S-textW-1),textV,lr,lg,lb);
    } else {
      const sep=Math.max(S/2|0,16);
      const tileW=textW+sep;
      wxScrollOff=(wxScrollOff+dt*20)%tileW;
      const off=Math.round(-wxScrollOff);
      for(let tile=off;tile<totalW;tile+=tileW){
        let col=tile;
        for(const ch of locStr){
          const rows=WXF[ch]||WXF[ch.toUpperCase()];
          if(rows){
            for(let row=0;row<5;row++){
              const bits=rows[row];
              for(let c=0;c<3;c++){
                if(!((bits>>(2-c))&1)) continue;
                const u=col+c, v=textV+(4-row);
                if(v<0||v>=S) continue;
                if(u<0||u>=totalW){ /* skip off-screen */ }
                else if(panel2dMode){
                  const idx=faceMap[0][v*S+u]; if(idx>=0){
                    if(lr>colBuf[idx*3]) colBuf[idx*3]=lr;
                    if(lg>colBuf[idx*3+1]) colBuf[idx*3+1]=lg;
                    if(lb>colBuf[idx*3+2]) colBuf[idx*3+2]=lb;
                  }
                } else {
                  const idx=creaturePx(u,v);
                  if(idx>=0){
                    if(lr>colBuf[idx*3]) colBuf[idx*3]=lr;
                    if(lg>colBuf[idx*3+1]) colBuf[idx*3+1]=lg;
                    if(lb>colBuf[idx*3+2]) colBuf[idx*3+2]=lb;
                  }
                }
              }
            }
          }
          col+=4;
        }
      }
    }
  }

  // ── Top face: sky overhead ──
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx=faceMap[4][v*S+u]; if(idx<0) continue;
    let r=skyCol[0],g=skyCol[1],b=skyCol[2];
    if(isFog){ r=r+(0.80-r)*0.68; g=g+(0.82-g)*0.68; b=b+(0.85-b)*0.68; }
    if(wxLightFlash>0){ r=Math.min(1,r+wxLightFlash); g=Math.min(1,g+wxLightFlash); b=Math.min(1,b+wxLightFlash); }
    colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
  }

  // ── Bottom face: ground ──
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx=faceMap[5][v*S+u]; if(idx<0) continue;
    colBuf[idx*3]=gR; colBuf[idx*3+1]=gG; colBuf[idx*3+2]=gB;
  }

  // ── Helper: set LED with max-blend ──
  function blendLED(idx,r,g,b){
    if(idx<0) return;
    if(r>colBuf[idx*3])   colBuf[idx*3]=r;
    if(g>colBuf[idx*3+1]) colBuf[idx*3+1]=g;
    if(b>colBuf[idx*3+2]) colBuf[idx*3+2]=b;
  }

  // ── Stars (night) ──
  const starAlpha=Math.max(0,1-lightLvl)*0.95;
  if(starAlpha>0.05){
    for(const st of wxStars){
      const twinkle=0.5+0.5*Math.sin(wxT2*st.spd+st.tw);
      const sb=st.br*starAlpha*twinkle;
      if(sb<0.04) continue;
      // Top face
      const tu=Math.floor(st.px*S), tv=Math.floor(st.py*S);
      blendLED(faceMap[4][tv*S+tu],sb,sb*0.9,sb);
      // Side faces: upper portion
      const fi=Math.floor(st.px*4)%4;
      const face=SIDE[fi];
      const lu=Math.floor((st.px*4%1)*S);
      const lv=Math.floor((HORIZ+st.py*(1-HORIZ))*S1);
      blendLED(faceMap[face][lv*S+lu],sb*0.75,sb*0.68,sb*0.78);
    }
  }

  // ── Draw celestial body (sun or moon) ──
  function drawBody(panX,elevFrac,isSun,phase){
    if(panX<0||elevFrac<0) return;
    const radius=isSun?3.8:2.5;
    const skyV=HORIZ+elevFrac*(1-HORIZ);

    // Which face?
    const normPX=((panX%1)+1)%1;
    let face=-1,faceU=-1,faceV=-1;

    // Check if it should show on top face (elevation > 0.85)
    if(elevFrac>0.82){
      const az=normPX*Math.PI*2;
      const fromZenith=(1-elevFrac)*2;
      const cx=S/2+Math.sin(az-Math.PI*0.5)*fromZenith*S*0.6;
      const cz=S/2+Math.cos(az-Math.PI*0.5)*fromZenith*S*0.6;
      // Draw on top face — proper circle
      for(let dv=-Math.ceil(radius+4);dv<=Math.ceil(radius+4);dv++) for(let du=-Math.ceil(radius+4);du<=Math.ceil(radius+4);du++){
        const dist=Math.sqrt(du*du+dv*dv);
        const fu=Math.round(cx+du), fv=Math.round(cz+dv);
        if(fu<0||fu>=S||fv<0||fv>=S) continue;
        const idx=faceMap[4][fv*S+fu]; if(idx<0) continue;
        if(isSun){
          if(dist<=radius){ blendLED(idx,1,0.98,0.7); }
          else if(dist<radius+2){ const b=(1-(dist-radius)/2)*0.9; blendLED(idx,b,b*0.85,b*0.25); }
          else if(dist<radius+5){ const b=(1-(dist-radius-2)/3)*0.3; blendLED(idx,b,b*0.6,b*0.05); }
        } else {
          drawMoon(idx,du,dv,dist,radius,phase);
        }
      }
      if(elevFrac<0.92) face=elevFrac>0.88?-1:SIDE[Math.floor(normPX*4)%4]; // also show low on side
      if(face===-1) return;
    } else {
      face=SIDE[Math.floor(normPX*4)%4];
    }
    if(face<0) return;

    faceU=uOfFacePanX(face,normPX);
    faceV=vOfElevFrac(elevFrac);

    // Draw on side face — proper circle (clipped to above horizon)
    const drawR=Math.ceil(radius+8);
    const horizV=Math.round(HORIZ*S1);
    for(let dv=-drawR;dv<=drawR;dv++) for(let du=-drawR;du<=drawR;du++){
      const dist=Math.sqrt(du*du+dv*dv);
      const fu=faceU+du, fv=faceV+dv;
      if(fu<0||fu>=S||fv<0||fv>=S||fv<horizV) continue;
      const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
      if(isSun){
        if(dist<=radius){ blendLED(idx,1,0.98,0.7); }
        else if(dist<radius+2){ const b=(1-(dist-radius)/2)*0.95; blendLED(idx,b,b*0.88,b*0.3); }
        else if(dist<radius+5){ const b=(1-(dist-radius-2)/3)*0.5; blendLED(idx,b,b*0.7,b*0.12); }
        else if(dist<radius+8){ const b=(1-(dist-radius-5)/3)*0.2; blendLED(idx,b,b*0.6,b*0.08); }
      } else {
        drawMoon(idx,du,dv,dist,radius,phase);
      }
    }
  }

  function drawMoon(idx,du,dv,dist,radius,phase){
    if(dist>radius+3) return;
    if(dist<radius){
      // phase: 0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter
      const illum=phase<=0.5?phase*2:(1-phase)*2; // 0=new, 1=full
      const dir=phase<=0.5?1:-1; // which side is lit
      const termX=du/radius; // -1..1 across disc
      const cosAngle=(1-illum)*2-1; // 1=new(all shadow), -1=full(all lit)
      const lit=termX*dir>cosAngle?1:
                termX*dir>cosAngle-0.15?((termX*dir-cosAngle+0.15)/0.15)*0.7:0;
      if(lit>0.05){
        const edge=1-Math.pow(dist/radius,2)*0.3;
        const moonB=(0.8+0.1*Math.sin(du*1.3+dv*0.9))*lit*edge;
        blendLED(idx,moonB,moonB*0.97,moonB*0.88);
      }
    } else if(dist<radius+2){
      const glow=(1-(dist-radius)/2)*0.18;
      blendLED(idx,glow,glow*0.95,glow*0.88);
    }
  }

  // ── Sun ──
  if(!panel2dMode && isDay && sunPX>=0) drawBody(sunPX,sunElev,true,0);

  // ── Moon ──
  if(!panel2dMode && !isDay&&moonPX>=0) drawBody(moonPX,moonElev,false,moonPh);
  // Show moon during very bright day only if full
  else if(isDay&&moonPh>0.45&&moonPh<0.55&&lightLvl>0.8)
    drawBody(((sunPX+0.5)%1),Math.max(0,sunElev-0.3),false,moonPh);

  // ── Clouds ──
  const cloudDark=isStorm?0.5:isRain?0.7:isOvercast?0.95:wxCode>=3?0.65:0.85;
  for(const cl of wxClouds){
    cl.px=(cl.px+cl.spd*dt+1)%1;
    cl.py=cl.py+cl.spdY*dt;
    if(cl.py<0.1){cl.py=0.1;cl.spdY=Math.abs(cl.spdY);}
    if(cl.py>0.95){cl.py=0.95;cl.spdY=-Math.abs(cl.spdY);}
    // Draw on side faces and top
    for(let fi=0;fi<4;fi++){
      const face=SIDE[fi];
      const pxLo=fi*0.25, pxHi=(fi+1)*0.25;
      // Cloud world x (panorama) relative to this face
      const cpx=cl.px;
      const relCX=uOfFacePanX(face,cpx);
      const relCY=vOfElevFrac(cl.py);
      const wU=Math.round(cl.sz*0.5*S),wV=Math.round(cl.sz*0.28*S);
      // Draw multiple puffs
      for(let p=0;p<cl.puffs;p++){
        const offU=(p-(cl.puffs-1)/2)*wU*(isOvercast?0.45:0.6)|0;
        const offV=(p%2===0?0:-wV*(isOvercast?0.5:0.35))|0;
        const pu=relCX+offU, pv=relCY+offV;
        for(let dv=-wV;dv<=wV;dv++) for(let du=-wU;du<=wU;du++){
          const dist=Math.sqrt((du/wU)**2+(dv/wV)**2);
          if(dist>1) continue;
          const fu=pu+du, fv=pv+dv;
          if(fu<0||fu>=S||fv<0||fv>=S) continue;
          const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
          let edge;
          if(isOvercast){
            if(dist<0.55) edge=1;
            else if(dist<0.75){ const t=(dist-0.55)/0.2; edge=1+0.2*Math.sin(t*Math.PI); }
            else { edge=Math.max(0,(1-dist)/0.25); edge*=edge; }
          } else edge=1-dist;
          const cb=cl.br*cloudDark*edge;
          const warm=(isDawn||isDusk)?cl.fluff*0.06*glowAmt:0;
          blendLED(idx,cb+warm,cb*(1-warm*0.3),cb*(1-warm*0.8));
        }
      }
    }
    // Also on top face
    const tu=Math.round(cl.px*S), tv=Math.round((0.3+cl.py*0.5)*S);
    const wr=Math.round(cl.sz*0.4*S);
    for(let dv=-wr;dv<=wr;dv++) for(let du=-wr;du<=wr;du++){
      const dist=Math.sqrt((du/wr)**2+(dv/wr)**2); if(dist>1) continue;
      const fu=tu+du,fv=tv+dv;
      if(fu<0||fu>=S||fv<0||fv>=S) continue;
      const idx=faceMap[4][fv*S+fu]; if(idx<0) continue;
      let topEdge;
      if(isOvercast){
        if(dist<0.55) topEdge=1;
        else if(dist<0.75){ const t=(dist-0.55)/0.2; topEdge=1+0.2*Math.sin(t*Math.PI); }
        else { topEdge=Math.max(0,(1-dist)/0.25); topEdge*=topEdge; }
      } else topEdge=1-dist;
      const cb=cl.br*cloudDark*topEdge*0.8;
      const warm=(isDawn||isDusk)?cl.fluff*0.06*glowAmt:0;
      blendLED(idx,cb+warm,cb*(1-warm*0.3),cb*(1-warm*0.8));
    }
  }

  // ── Birds & Planes ──
  for(const cr of wxCreatures){
    if(cr.delay>0){ cr.delay-=dt; continue; }
    cr.px=(cr.px+cr.dx*dt*60+1)%1;
    if(cr.type==='balloon'){
      cr.phaseT+=dt;
      if(cr.phase==='rise'){
        cr.py=Math.min(0.65,cr.py+dt*0.015);
        if(cr.py>=0.65) cr.phase='float';
      } else if(cr.phase==='float'){
        cr.px=(cr.px+cr.dx*dt*60+1)%1;
        cr.py+=Math.sin(cr.phaseT*0.5)*dt*0.003;
        cr.py=Math.max(0.45,Math.min(0.75,cr.py));
        if(cr.phaseT>20) cr.phase='descend';
      } else if(cr.phase==='descend'){
        cr.px=(cr.px+cr.dx*dt*60*0.5+1)%1;
        cr.py=Math.max(0.02,cr.py-dt*0.012);
        if(cr.py<=0.02){
          const balloonColors=[[1,0.2,0.1],[0.1,0.5,1],[0.9,0.8,0.1],[0.2,0.8,0.3],[0.8,0.2,0.8],[1,0.5,0]];
          cr.phase='rise'; cr.phaseT=0; cr.py=0.05;
          cr.px=Math.random(); cr.laps=0;
          cr.color=balloonColors[Math.floor(Math.random()*balloonColors.length)];
          cr.delay=60+Math.random()*120;
          continue;
        }
      }
      const crV=Math.round((HORIZ+cr.py*(1-HORIZ))*S1);
      const baseCol=Math.round(cr.px*S*4);
      const c=cr.color;
      // Envelope: round dome with vertical panel stripes
      const envRows=[
        {ev:7,w:1},{ev:6,w:2},{ev:5,w:3},{ev:4,w:3},
        {ev:3,w:3},{ev:2,w:2},{ev:1,w:1}
      ];
      for(const {ev,w} of envRows){
        for(let eu=-w;eu<=w;eu++){
          const idx=creaturePx(baseCol+eu,crV+ev);
          if(idx<0) continue;
          // Vertical panel shading: darken alternate columns
          const panel=(eu+100)%2===0?0.75:1;
          // Highlight on top, shadow at bottom
          const vShade=0.8+0.2*(ev-1)/6;
          setCreature(idx,c[0]*panel*vShade,c[1]*panel*vShade,c[2]*panel*vShade);
        }
      }
      // Skirt / throat narrowing below envelope
      const sk=creaturePx(baseCol,crV);
      if(sk>=0) setCreature(sk,c[0]*0.5,c[1]*0.5,c[2]*0.5);
      // Flame glow (flickers)
      if(Math.sin(cr.phaseT*8)>0.2){
        const fi=creaturePx(baseCol,crV);
        if(fi>=0) setCreature(fi,1,0.6,0.1);
      }
      // Ropes from envelope corners to basket
      const r1=creaturePx(baseCol-1,crV-1);
      const r2=creaturePx(baseCol+1,crV-1);
      if(r1>=0) setCreature(r1,0.25,0.15,0.05);
      if(r2>=0) setCreature(r2,0.25,0.15,0.05);
      // Basket: wicker brown box
      for(let bu=-1;bu<=1;bu++){
        const bi=creaturePx(baseCol+bu,crV-2);
        if(bi>=0) setCreature(bi,0.45,0.25,0.08);
      }
      continue;
    }
    if(cr.type==='plane'){
      cr.flightT=(cr.flightT||0)+dt;
      if(cr.flightT>10) cr.py=Math.min(0.98,cr.py+dt*0.03);
      if(cr.flightT>15){
        cr.delay=40+Math.random()*80;
        cr.flightT=0;
        cr.py=0.5+Math.random()*0.2;
        cr.px=Math.random();
        cr.dx=(Math.random()<0.5?1:-1)*(0.0008+Math.random()*0.0005);
        continue;
      }
    }
    if(cr.dy!==undefined) cr.py=Math.max(0.3,Math.min(0.92,cr.py+cr.dy*dt*60));
    if(cr.lightningHit>0) cr.lightningHit-=dt;
    if(cr.wobble>0) cr.wobble=Math.max(0,cr.wobble-dt*0.4);
    if(isStorm && cr.type==='plane' && cr.lightningHit<=0 && Math.random()<dt*0.08){
      cr.lightningHit=0.3; cr.wobble=2.5;
    }
    const crV=Math.round((HORIZ+cr.py*(1-HORIZ))*S1);
    const baseCol=Math.round(cr.px*S*4);
    if(cr.type==='bird'){
      cr.wingT+=dt;
      const flap=Math.sin(cr.wingT*(5+cr.wingSpeed)+cr.wing);
      const wOff=Math.round(flap*1.5);
      const dir=cr.dx>0?1:-1;
      const pixels=[{du:-2,dv:-wOff},{du:-1,dv:-wOff/2},{du:0,dv:0},{du:1,dv:-wOff/2},{du:2,dv:-wOff}];
      for(const {du,dv} of pixels){
        const idx=creaturePx(baseCol+du*dir,crV+Math.round(dv));
        if(idx>=0) setCreature(idx,0.08,0.06,0.05);
      }
    } else {
      cr.blink+=dt*2;
      const blinkOn=Math.sin(cr.blink)>0;
      const dir=cr.dx>0?1:-1;
      const wobOff=cr.wobble>0?Math.round(Math.sin(cr.wobble*12)*cr.wobble*1.5):0;
      const planeV=crV+wobOff;
      const isHit=cr.lightningHit>0.15;
      if(cr.lightningHit>0.1){
        for(let bv=Math.min(S-1,planeV+1);bv<S;bv++){
          const jitter=Math.round((Math.random()-0.5)*2);
          const bidx=creaturePx(baseCol+jitter,bv);
          if(bidx>=0) setCreature(bidx,0.9,0.9,1);
        }
      }
      const wh=isHit?[1,1,1]:null;
      const body=[0.85,0.85,0.9];
      // Fuselage: 5 pixels long
      for(let d=-2;d<=2;d++){
        const idx=creaturePx(baseCol+d*dir,planeV);
        if(idx>=0) setCreature(idx,wh?1:body[0],wh?1:body[1],wh?1:body[2]);
      }
      // Nose: slightly brighter
      const nose=creaturePx(baseCol+3*dir,planeV);
      if(nose>=0) setCreature(nose,wh?1:0.6,wh?1:0.65,wh?1:0.75);
      // Cockpit window
      const cock=creaturePx(baseCol+2*dir,planeV-1);
      if(cock>=0) setCreature(cock,wh?1:0.2,wh?1:0.5,wh?1:0.9);
      // Wings: 3 pixels each side, swept back
      for(let w=1;w<=3;w++){
        const sweep=w>1?-1*dir:0;
        const w1=creaturePx(baseCol+sweep,planeV-w);
        const w2=creaturePx(baseCol+sweep,planeV+w);
        const wb=0.7-w*0.08;
        if(w1>=0) setCreature(w1,wh?1:wb,wh?1:wb,wh?1:wb+0.05);
        if(w2>=0) setCreature(w2,wh?1:wb,wh?1:wb,wh?1:wb+0.05);
      }
      // Tail fin: 2 pixels angled backwards
      for(let tf=1;tf<=2;tf++){
        const ti=creaturePx(baseCol-(2+tf)*dir,planeV+tf);
        if(ti>=0) setCreature(ti,wh?1:0.6,wh?1:0.6,wh?1:0.65);
      }
      // Red tail light
      if(blinkOn && !isHit){
        const idx=creaturePx(baseCol-3*dir,planeV);
        if(idx>=0) setCreature(idx,1,0.1,0.1);
      }
      // Green starboard / red port nav lights on wingtips
      if(!isHit){
        const nav1=creaturePx(baseCol,planeV-3);
        const nav2=creaturePx(baseCol,planeV+3);
        if(dir>0){
          if(nav1>=0) setCreature(nav1,0.1,0.9,0.1);
          if(nav2>=0) setCreature(nav2,0.9,0.1,0.1);
        } else {
          if(nav1>=0) setCreature(nav1,0.9,0.1,0.1);
          if(nav2>=0) setCreature(nav2,0.1,0.9,0.1);
        }
      }
    }
  }

  // ── Rain / Snow particles ──
  const pSpeed=dt*SIZE*0.5;
  for(const p of wxParticles){
    p.v-=p.spd*pSpeed;
    if(p.snow) p.u+=p.drift*dt*10;
    if(p.v<0){ p.v=S1; p.u=Math.random()*S1; }
    if(p.u<0||p.u>S1){ p.u=((p.u%S)+S)%S; }
    const face=SIDE[p.face];
    const iu=Math.round(p.u), iv=Math.round(p.v);
    if(iu<0||iu>=S||iv<0||iv>=S) continue;
    const idx=faceMap[face][iv*S+iu]; if(idx<0) continue;
    if(p.snow){ blendLED(idx,0.9,0.92,0.98); }
    else {
      // Rain: draw a streak
      blendLED(idx,0.35,0.45,0.65);
      if(iv+1<S){ const i2=faceMap[face][(iv+1)*S+iu]; blendLED(i2,0.2,0.28,0.45); }
    }
    // Snow accumulates on bottom face
    if(p.snow&&iv<3){ const bi=faceMap[5][iu*S+Math.min(S1,Math.round(p.u))]; blendLED(bi,0.88,0.90,0.95); }
  }

  // ── Lightning bolt on storm ──
  if(wxLightFlash>0.5&&isStorm){
    const bFace=SIDE[Math.floor(Math.random()*4)];
    let bu=Math.floor(S*0.3+Math.random()*S*0.4), bv=S1;
    for(let seg=0;seg<8&&bv>S*HORIZ;seg++){
      const nu=bu+(Math.random()-0.5)*8|0, nv=bv-(3+Math.random()*5)|0;
      for(let t2=0;t2<=1;t2+=0.2){
        const lu=Math.round(bu+t2*(nu-bu)), lv=Math.round(bv+t2*(nv-bv));
        if(lu>=0&&lu<S&&lv>=0&&lv<S){ blendLED(faceMap[bFace][lv*S+lu],1,1,0.9); }
      }
      bu=nu; bv=nv;
    }
  }

  // ── Horizon sun glow on adjacent faces ──
  if(isDay&&sunElev<0.25&&sunPX>=0){
    const glFace=SIDE[Math.floor(sunPX*4)%4];
    const glU=uOfFacePanX(glFace,sunPX);
    const glV=Math.round(HORIZ*S1);
    for(let du=-12;du<=12;du++){
      const gu=glU+du; if(gu<0||gu>=S) continue;
      const gb=Math.max(0,1-Math.abs(du)/12)*sunElev*4*(1-sunElev)*0.6;
      if(gb<0.01) continue;
      for(let dv=0;dv<=3;dv++){
        const gv=glV+dv; if(gv<0||gv>=S) continue;
        const idx=faceMap[glFace][gv*S+gu]; if(idx<0) continue;
        blendLED(idx,gb,gb*0.55,gb*0.05);
      }
    }
  }
  
  // For 2D panel mode, draw sun/moon on face 0
  if(panel2dMode){
    const S=SIZE, horizV=Math.round(HORIZ*S1);
    if(isDay){
      const sunX=dayProg*S;
      const arc=Math.sin(dayProg*Math.PI);
      const sunY=horizV+arc*(S1-horizV)*0.92;
      const sunRad=Math.max(3,S*0.06);
      for(let dv=-Math.ceil(sunRad+4);dv<=Math.ceil(sunRad+4);dv++){
        for(let du=-Math.ceil(sunRad+4);du<=Math.ceil(sunRad+4);du++){
          const dist=Math.sqrt(du*du+dv*dv);
          const fu=Math.round(sunX+du), fv=Math.round(sunY+dv);
          if(fu<0||fu>=S||fv<horizV||fv>=S) continue;
          const idx=faceMap[0][fv*S+fu]; if(idx<0) continue;
          if(dist<=sunRad){ colBuf[idx*3]=1; colBuf[idx*3+1]=0.98; colBuf[idx*3+2]=0.7; }
          else if(dist<sunRad+2){ const b=(1-(dist-sunRad)/2)*0.9; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.85); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.25); }
          else if(dist<sunRad+4){ const b=(1-(dist-sunRad-2)/2)*0.35; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.65); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.08); }
        }
      }
    } else if(moonPX>=0){
      const moonX=nightProg*S;
      const arc=Math.sin(nightProg*Math.PI);
      const moonY=horizV+arc*(S1-horizV)*0.75;
      const moonRad=Math.max(2,S*0.04);
      for(let dv=-Math.ceil(moonRad+2);dv<=Math.ceil(moonRad+2);dv++){
        for(let du=-Math.ceil(moonRad+2);du<=Math.ceil(moonRad+2);du++){
          const dist=Math.sqrt(du*du+dv*dv);
          const fu=Math.round(moonX+du), fv=Math.round(moonY+dv);
          if(fu<0||fu>=S||fv<horizV||fv>=S) continue;
          const idx=faceMap[0][fv*S+fu]; if(idx<0) continue;
          if(dist<=moonRad){
            const illum=moonPh<=0.5?moonPh*2:(1-moonPh)*2;
            const dir2d=moonPh<=0.5?1:-1;
            const tX=du/moonRad;
            const cosA=(1-illum)*2-1;
            const lit2d=tX*dir2d>cosA?1:tX*dir2d>cosA-0.2?((tX*dir2d-cosA+0.2)/0.2)*0.6:0;
            if(lit2d>0.05){ const mb=0.85*lit2d; colBuf[idx*3]=mb; colBuf[idx*3+1]=mb*0.97; colBuf[idx*3+2]=mb*0.9; }
          }
          else if(dist<moonRad+2){ const b=(1-(dist-moonRad)/2)*0.18; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.95); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.88); }
        }
      }
    }
  }
}

function effectLightning(dt){
  lightningT+=dt*speedMult;
  lightningStormT+=dt*speedMult;

  // Dark electric storm background — deep blue-purple base
  const pulse=0.03+0.02*Math.sin(lightningStormT*0.7);
  for(let i=0;i<N;i++){
    colBuf[i*3  ]=Math.max(colBuf[i*3  ]*0.82, pulse*0.18);
    colBuf[i*3+1]=Math.max(colBuf[i*3+1]*0.82, pulse*0.22);
    colBuf[i*3+2]=Math.max(colBuf[i*3+2]*0.82, pulse*0.65);
  }

  // Thunder flash — whole cube white bloom
  if(lightningThunder>0.01){
    for(let i=0;i<N;i++){
      colBuf[i*3  ]=Math.min(1,colBuf[i*3  ]+lightningThunder*0.85);
      colBuf[i*3+1]=Math.min(1,colBuf[i*3+1]+lightningThunder*0.90);
      colBuf[i*3+2]=Math.min(1,colBuf[i*3+2]+lightningThunder);
    }
    lightningThunder=Math.max(0,lightningThunder-dt*8);
  }

  // Strikes — random intervals roughly around the speed setting
  const baseRate = 0.8 / Math.max(0.1, speedMult);
  const rate = baseRate * (0.3 + Math.random() * 1.4);
  if(lightningT>rate){
    lightningT=0; spawnStrike();
    if(Math.random()<0.4){ setTimeout(spawnStrike,70); }
    if(Math.random()<0.2){ setTimeout(spawnStrike,140); }
  }

  // Draw bolts
  for(let k=lightningBolts.length-1;k>=0;k--){
    const bolt=lightningBolts[k];
    bolt.life-=dt*bolt.decay;
    if(bolt.life<=0){ lightningBolts.splice(k,1); continue; }
    const bright=Math.pow(Math.max(0,bolt.life),0.6);
    const isMain=!bolt.branch;
    for(const [face,u,v] of bolt.pts){
      if(u<0||u>=SIZE||v<0||v>=SIZE) continue;
      // White-hot core
      const core=bright*(isMain?1.0:0.55);
      const [hr,hg,hb]=hsl(bolt.hue,0.65,core*0.8);
      const wr=isMain?Math.min(1,hr+core*0.5):hr;
      const wg=isMain?Math.min(1,hg+core*0.6):hg;
      const wb=isMain?Math.min(1,hb+core*0.7):hb;
      setFaceLED(face,u,v,wr,wg,wb);
      // Glow halo
      const gr=isMain?2:1;
      for(let gv=-gr;gv<=gr;gv++) for(let gu=-gr;gu<=gr;gu++){
        if(gu===0&&gv===0) continue;
        const gd=Math.sqrt(gu*gu+gv*gv); if(gd>gr+0.5) continue;
        const gb=bright*0.45/(gd+0.6)*(isMain?0.7:0.35);
        const [gr2,gg2,gb2]=hsl(bolt.hue,1,gb);
        setFaceLED(face,u+gu,v+gv,gr2,gg2,gb2);
      }
    }
  }

  // Electric shimmer sparks
  const sparks=Math.floor(dt*25*(1+lightningThunder*6));
  for(let s=0;s<sparks;s++){
    const i=Math.random()*N|0;
    const sp=0.03+Math.random()*0.1;
    colBuf[i*3  ]=Math.min(1,colBuf[i*3  ]+sp*0.25);
    colBuf[i*3+1]=Math.min(1,colBuf[i*3+1]+sp*0.3);
    colBuf[i*3+2]=Math.min(1,colBuf[i*3+2]+sp);
  }
}

// ═══════════════════════════════════════════════════
//  WARP DRIVE — star lines rush from center
// ═══════════════════════════════════════════════════
let warpStars=[];
function resetWarp(){
  warpStars=[];
  for(let i=0;i<Math.max(120,N*0.12)|0;i++){
    const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
    const sp=0.08+Math.random()*0.35;
    warpStars.push({x:0.5,y:0.5,z:0.5, ox:Math.sin(ph)*Math.cos(th)*0.001,oy:Math.sin(ph)*Math.sin(th)*0.001,oz:Math.cos(ph)*0.001, sp, hue:Math.random()*0.2+0.55, life:Math.random()});
  }
}
function effectWarp(dt){
  t+=dt;
  if(!warpStars.length) resetWarp();
  for(let i=0;i<N*3;i++) colBuf[i]*=0.78;
  for(const s of warpStars){
    s.life+=dt; s.x+=s.ox*s.sp*SIZE*dt*60; s.y+=s.oy*s.sp*SIZE*dt*60; s.z+=s.oz*s.sp*SIZE*dt*60;
    const wx=s.x,wy=s.y,wz=s.z;
    if(wx<0||wx>1||wy<0||wy>1||wz<0||wz>1){s.x=0.5;s.y=0.5;s.z=0.5;s.sp=0.08+Math.random()*0.35;s.life=0;s.hue=Math.random()*0.2+0.55;continue;}
    // brightness ramps with distance from center (speed illusion)
    const dist=Math.sqrt((wx-0.5)**2+(wy-0.5)**2+(wz-0.5)**2)*2;
    const bright=dist*0.75*Math.min(1,s.life*3);
    const stretch=Math.max(1,s.sp*dist*SIZE*0.12)|0;
    // project star onto each face
    const faces=[[0,wx,wy],[1,wx,wy],[2,wz,wy],[3,wz,wy],[4,wx,wz],[5,wx,wz]];
    for(const [f,fu,fv] of faces){
      const pu=(fu*SIZE)|0, pv=(fv*SIZE)|0;
      for(let sx=-1;sx<=1;sx++) for(let sy=-1;sy<=1;sy++){
        const gl=bright*(sx===0&&sy===0?1:0.25)*0.85;
        if(gl<0.01) continue;
        const [r,g,b]=hsl(s.hue+dist*0.15,0.8,gl);
        setFaceLED(f,pu+sx,pv+sy,r,g,b);
      }
    }
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

// ═══════════════════════════════════════════════════
//  GLOBAL OVERLAYS ENGINE
// ═══════════════════════════════════════════════════
const OV = {
  stars:    {on:false,density:6,speed:1.5,color:'multi'},
  snow:     {on:false,density:8,speed:1,color:'white'},
  meteors:  {on:false,rate:1.5,trail:8,color:'white'},
  edgeglow: {on:false,intensity:0.5,speed:1,color:'cyan'},
  fire:     {on:false,height:0.22,intensity:1,color:'fire'},
  sparkle:  {on:false,density:12,fade:3,color:'multi'},
  colorwave:{on:false,intensity:0.3,speed:1,color:'rainbow'},
  pulse:    {on:false,speed:0.8,depth:0.45,color:'white'},
  scanline: {on:false,speed:1.5,width:3,color:'cyan'},
  vignette: {on:false,intensity:0.65,radius:0.5},
  glitch:   {on:false,intensity:0.3,rate:3},
  mist:     {on:false,intensity:0.22,speed:0.4},
  lightning:{on:false,rate:1.2,width:3,brightness:1},
};

let ovGlobalBright=1.0;
document.getElementById('ov-global-bright')?.addEventListener('input',function(){
  ovGlobalBright=parseFloat(this.value);
  document.getElementById('ov-global-bright-val').textContent=Math.round(ovGlobalBright*100)+'%';
});
let ovStarData=null, ovSnowParts=[], ovMeteorList=[], ovSparkleList=[];
let ovFireBufs=null, ovScanY=0, ovPulseT=0, ovGlitchT=0, ovMeteorT=0;
let ovEdgeIdx=null; // precomputed edge LED indices

function ovGetEdges(){
  if(ovEdgeIdx&&ovEdgeIdx.length>0) return;
  ovEdgeIdx=[];
  for(let i=0;i<N;i++) if(bitCount(faceMembership[i])>=2) ovEdgeIdx.push(i);
}
function bitCount(n){let c=0;while(n){c+=n&1;n>>>=1;}return c;}

// ── Stars ──
function ovStars(dt){
  const target=Math.round(N*OV.stars.density/100);
  if(!ovStarData||ovStarData.length!==target){
    ovStarData=[];
    for(let k=0;k<target;k++) ovStarData.push({idx:Math.random()*N|0,ph:Math.random()*Math.PI*2,hue:Math.random()});
  }
  for(const s of ovStarData){
    s.ph+=dt*OV.stars.speed*(1.2+Math.sin(s.ph*0.7+ovPulseT)*0.5);
    const bright=Math.pow(Math.sin(s.ph)*0.5+0.5,2.8);
    if(bright<0.04) continue;
    let r,g,b;
    const col=OV.stars.color;
    if(col==='white')  {r=bright;g=bright;b=Math.min(1,bright*1.08);}
    else if(col==='gold')  [r,g,b]=hsl(0.12,1,bright*0.88);
    else if(col==='ice')   [r,g,b]=hsl(0.60,0.85,bright);
    else { [r,g,b]=hsl(s.hue,1,bright*0.92); } // multi
    const b3=s.idx*3;
    colBuf[b3]=Math.min(1,colBuf[b3]+r);
    colBuf[b3+1]=Math.min(1,colBuf[b3+1]+g);
    colBuf[b3+2]=Math.min(1,colBuf[b3+2]+b);
  }
}

// ── Snow ──
function ovSnow(dt){
  const want=OV.snow.density*Math.max(1,SIZE/16|0);
  while(ovSnowParts.length<want){
    const face=Math.random()*4|0;
    ovSnowParts.push({face,col:Math.random()*SIZE|0,y:SIZE-1,speed:0.15+Math.random()*0.5,hue:Math.random(),drift:Math.random()-0.5});
  }
  for(const p of ovSnowParts){
    p.y-=p.speed*dt*OV.snow.speed*(SIZE*0.28);
    p.col+=p.drift*dt*SIZE*0.04;
    p.col=Math.max(0,Math.min(SIZE-1,p.col));
    const col=OV.snow.color;
    let r,g,b;
    if(col==='white') {r=0.88;g=0.92;b=1;}
    else if(col==='ice') [r,g,b]=hsl(0.58,0.7,0.75);
    else [r,g,b]=hsl(p.hue,1,0.8);
    setFaceLED(p.face,p.col|0,Math.max(0,Math.min(SIZE-1,p.y|0)),r,g,b);
    if(p.y<0){p.y=SIZE-1;p.col=Math.random()*SIZE|0;p.hue=Math.random();}
  }
  while(ovSnowParts.length>want) ovSnowParts.pop();
}

// ── Meteors ──
function ovMeteors(dt){
  ovMeteorT+=dt;
  if(ovMeteorT>1/OV.meteors.rate){
    ovMeteorT=0;
    const face=Math.random()*6|0;
    const ang=Math.random()*Math.PI*2;
    ovMeteorList.push({face,u:Math.random()*SIZE|0,v:Math.random()*SIZE|0,
      du:Math.cos(ang),dv:Math.sin(ang),pos:0,hue:Math.random(),speed:SIZE*0.6+Math.random()*SIZE*0.4});
  }
  for(let k=ovMeteorList.length-1;k>=0;k--){
    const m=ovMeteorList[k];
    m.pos+=dt*m.speed*OV.meteors.rate*0.7;
    const head=m.pos|0;
    if(head>OV.meteors.trail+SIZE*1.4){ovMeteorList.splice(k,1);continue;}
    for(let j=0;j<=Math.min(head,OV.meteors.trail);j++){
      const fu=(m.u+m.du*(head-j))|0, fv=(m.v+m.dv*(head-j))|0;
      if(fu<0||fu>=SIZE||fv<0||fv>=SIZE) continue;
      const fade=Math.pow(1-j/OV.meteors.trail,1.8);
      const col=OV.meteors.color;
      let r,g,b;
      if(col==='white') {r=fade;g=fade;b=fade;}
      else if(col==='gold') [r,g,b]=hsl(0.12,1,fade*0.9);
      else if(col==='fire') [r,g,b]=hsl(0.04+j/OV.meteors.trail*0.1,1,fade*0.9);
      else [r,g,b]=hsl(m.hue,1,fade*0.9); // multi
      const idx=faceMap[m.face][fv*SIZE+fu]; if(idx<0) continue;
      colBuf[idx*3]=Math.min(1,colBuf[idx*3]+r);
      colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+g);
      colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b);
    }
  }
}

// ── Edge Glow ──
function ovEdgeGlow(dt){
  ovGetEdges();
  const spd=OV.edgeglow.speed, inten=OV.edgeglow.intensity;
  for(let k=0;k<ovEdgeIdx.length;k++){
    const i=ovEdgeIdx[k];
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const pulse=0.5+0.5*Math.sin(ovPulseT*spd*2.5+(x+y+z)*Math.PI*3);
    const bright=pulse*inten;
    const col=OV.edgeglow.color;
    let r,g,b;
    if(col==='cyan')  {r=0;g=bright*0.8;b=bright;}
    else if(col==='gold') [r,g,b]=hsl(0.12,1,bright*0.85);
    else if(col==='white') {r=bright;g=bright;b=bright;}
    else [r,g,b]=hsl(((x+y+z)/3+ovPulseT*spd*0.15)%1,1,bright*0.85); // rainbow
    colBuf[i*3]=Math.min(1,colBuf[i*3]+r);
    colBuf[i*3+1]=Math.min(1,colBuf[i*3+1]+g);
    colBuf[i*3+2]=Math.min(1,colBuf[i*3+2]+b);
  }
}

// ── Fire Border ──
function ovFire(dt){
  const S=SIZE;
  const rows=Math.max(3,Math.round(S*OV.fire.height));
  if(!ovFireBufs||ovFireBufs[0].length!==S*S){
    ovFireBufs=Array.from({length:4},()=>new Float32Array(S*S));
  }
  for(let f=0;f<4;f++){   // faces 0-3 = front/back/right/left only
    const buf=ovFireBufs[f];
    // Seed the BOTTOM row of each face (v=0 in faceMap = bottom edge)
    for(let u=0;u<S;u++){
      buf[u]=Math.min(2, buf[u]+(Math.random()-0.05)*dt*22*OV.fire.intensity);
    }
    // Propagate upward: v=0 is bottom, v increases upward
    for(let v=1;v<rows;v++){
      for(let u=0;u<S;u++){
        const below =buf[(v-1)*S+u];
        const left  =buf[(v-1)*S+Math.max(0,u-1)];
        const right =buf[(v-1)*S+Math.min(S-1,u+1)];
        // Slight random horizontal drift for realistic flame flicker
        const drift =(Math.random()-0.5)*0.15;
        const raw=(below*0.5+left*0.25+right*0.25)+drift;
        // Cooling increases with height
        const cool=dt*(5+v*0.4)*OV.fire.intensity+Math.random()*dt*3;
        buf[v*S+u]=Math.max(0, raw-cool);
      }
    }
    // Render — v=0 is bottom (faceMap v=0)
    for(let v=0;v<rows;v++){
      for(let u=0;u<S;u++){
        const h=Math.min(1,buf[v*S+u]);
        if(h<0.03) continue;
        const col=OV.fire.color;
        let r,g,b;
        if(col==='fire'){
          // Dark red→orange→yellow→white as h increases
          if(h<0.4)      [r,g,b]=hsl(0.02,       1, h*1.2);
          else if(h<0.75)[r,g,b]=hsl(0.06+h*0.04, 1, h*0.9);
          else            [r,g,b]=hsl(0.12,        0.6, h*0.95);
        } else if(col==='blue'){
          [r,g,b]=hsl(lerp(0.65,0.58,h),1,h*0.8);
        } else if(col==='green'){
          [r,g,b]=hsl(lerp(0.38,0.28,h),1,h*0.8);
        } else {
          [r,g,b]=hsl(lerp(0.82,0.72,h),1,h*0.8);
        }
        const idx=faceMap[f][v*S+u]; if(idx<0) continue;
        colBuf[idx*3  ]=Math.min(1,colBuf[idx*3  ]+r);
        colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+g);
        colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b);
      }
    }
  }
}
// ── Sparkle Rain ──
function ovSparkle(dt){
  const rate=OV.sparkle.density*dt*30;
  if(Math.random()<rate-Math.floor(rate)||Math.floor(rate)>0){
    const cnt=Math.max(1,Math.floor(rate));
    for(let k=0;k<cnt;k++) ovSparkleList.push({idx:Math.random()*N|0,life:1,hue:Math.random()});
  }
  for(let k=ovSparkleList.length-1;k>=0;k--){
    const sp=ovSparkleList[k];
    sp.life-=dt*OV.sparkle.fade;
    if(sp.life<=0){ovSparkleList.splice(k,1);continue;}
    const bright=Math.pow(sp.life,0.7)*0.95;
    const col=OV.sparkle.color;
    let r,g,b;
    if(col==='white') {r=bright;g=bright;b=bright;}
    else if(col==='gold') [r,g,b]=hsl(0.12,1,bright*0.88);
    else if(col==='ice')  [r,g,b]=hsl(0.60,0.8,bright);
    else [r,g,b]=hsl(sp.hue,1,bright*0.92); // multi
    colBuf[sp.idx*3]=Math.min(1,colBuf[sp.idx*3]+r);
    colBuf[sp.idx*3+1]=Math.min(1,colBuf[sp.idx*3+1]+g);
    colBuf[sp.idx*3+2]=Math.min(1,colBuf[sp.idx*3+2]+b);
  }
}

// ── Color Wave ──
function ovColorWave(dt){
  const intensity=OV.colorwave.intensity, spd=OV.colorwave.speed;
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const wave=Math.sin((x+z)*Math.PI*3+ovPulseT*spd*2.2)*0.5+0.5;
    const col=OV.colorwave.color;
    let r,g,b,hue;
    if(col==='rainbow') hue=(x*0.4+z*0.3+ovPulseT*spd*0.08)%1;
    else if(col==='warm') hue=(x*0.15+ovPulseT*spd*0.05+0.04)%1;
    else if(col==='cool') hue=(0.55+z*0.15+ovPulseT*spd*0.05)%1;
    else hue=(x*0.2+z*0.2+ovPulseT*spd*0.05)%1; // pastel
    [r,g,b]=hsl(hue,col==='pastel'?0.5:1,wave*intensity);
    colBuf[i*3]=Math.min(1,colBuf[i*3]+r);
    colBuf[i*3+1]=Math.min(1,colBuf[i*3+1]+g);
    colBuf[i*3+2]=Math.min(1,colBuf[i*3+2]+b);
  }
}

// ── Breathe Pulse ──
function ovPulse(dt){
  const ph=Math.sin(ovPulseT*OV.pulse.speed*Math.PI);
  const mul=1-OV.pulse.depth*(1-ph*0.5-0.5);
  const col=OV.pulse.color;
  for(let i=0;i<N*3;i++) colBuf[i]*=mul;
  if(col!=='white'){
    const hue=col==='rainbow'?(ovPulseT*OV.pulse.speed*0.12)%1:col==='gold'?0.12:0;
    const add=Math.max(0,ph)*OV.pulse.depth*0.18;
    const [pr,pg,pb]=hsl(hue,1,add);
    for(let i=0;i<N;i++){colBuf[i*3]+=pr;colBuf[i*3+1]+=pg;colBuf[i*3+2]+=pb;}
  }
}

// ── Scan Line ──
function ovScanLine(dt){
  ovScanY=(ovScanY+dt*OV.scanline.speed*SIZE*0.5)%(SIZE*2);
  const scanFrac=ovScanY/SIZE, scanV=ovScanY<SIZE?ovScanY:SIZE*2-ovScanY;
  const W=OV.scanline.width, col=OV.scanline.color;
  for(let f=0;f<6;f++){
    for(let u=0;u<SIZE;u++){
      for(let dv=-W;dv<=W;dv++){
        const v=Math.round(scanV)+dv; if(v<0||v>=SIZE) continue;
        const fade=Math.pow(1-Math.abs(dv)/W,1.5)*0.9;
        let r,g,b;
        if(col==='cyan')    {r=0;g=fade*0.8;b=fade;}
        else if(col==='white'){r=fade;g=fade;b=fade;}
        else if(col==='gold') [r,g,b]=hsl(0.12,1,fade*0.88);
        else [r,g,b]=hsl(((u/SIZE)+scanFrac*0.5)%1,1,fade*0.85); // rainbow
        const idx=faceMap[f][v*SIZE+u]; if(idx<0) continue;
        colBuf[idx*3]=Math.min(1,colBuf[idx*3]+r);
        colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+g);
        colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b);
      }
    }
  }
}

// ── Vignette ──
function ovVignette(){
  const inten=OV.vignette.intensity, rad=OV.vignette.radius;
  for(let i=0;i<N;i++){
    const dx=surfX[i]-0.5,dy=surfY[i]-0.5,dz=surfZ[i]-0.5;
    const d=Math.sqrt(dx*dx+dy*dy+dz*dz)*2;
    const v=Math.max(0,d-rad)/(1-rad+0.001);
    const mul=1-Math.min(1,v*v)*inten;
    colBuf[i*3]*=mul; colBuf[i*3+1]*=mul; colBuf[i*3+2]*=mul;
  }
}

// ── Glitch ──
let ovGlitchActive=false, ovGlitchData=null;
function ovGlitch(dt){
  ovGlitchT+=dt;
  if(ovGlitchT>1/OV.glitch.rate){
    ovGlitchT=0; ovGlitchActive=true;
    // pick a random face block to scramble
    const face=Math.random()*6|0;
    const u0=Math.random()*SIZE*0.8|0, v0=Math.random()*SIZE*0.8|0;
    const bw=Math.max(2,SIZE*0.08+(Math.random()*SIZE*0.15)|0);
    const bh=Math.max(1,SIZE*0.04|0);
    ovGlitchData={face,u0,v0,bw,bh,shift:((Math.random()-0.5)*SIZE*0.2)|0};
  }
  if(!ovGlitchActive||!ovGlitchData) return;
  const {face,u0,v0,bw,bh,shift}=ovGlitchData;
  const inten=OV.glitch.intensity;
  for(let v=v0;v<Math.min(SIZE,v0+bh);v++){
    for(let u=u0;u<Math.min(SIZE,u0+bw);u++){
      const su=Math.max(0,Math.min(SIZE-1,u+shift));
      const src=faceMap[face][v*SIZE+su];
      const dst=faceMap[face][v*SIZE+u];
      if(src<0||dst<0) continue;
      colBuf[dst*3]=lerp(colBuf[dst*3],colBuf[src*3],inten);
      colBuf[dst*3+1]=lerp(colBuf[dst*3+1],colBuf[src*3+1],inten);
      colBuf[dst*3+2]=lerp(colBuf[dst*3+2],colBuf[src*3+2]*0.5+Math.random()*inten*0.3,inten);
    }
  }
  ovGlitchActive=false;
}

// ── Rainbow Mist ──
function ovMist(dt){
  for(let i=0;i<N;i++){
    const x=surfX[i],y=surfY[i],z=surfZ[i];
    const hue=((x*0.4+z*0.3+y*0.2+ovPulseT*OV.mist.speed*0.08)%1+1)%1;
    const [mr,mg,mb]=hsl(hue,0.9,OV.mist.intensity*0.55);
    colBuf[i*3]=Math.min(1,colBuf[i*3]+mr);
    colBuf[i*3+1]=Math.min(1,colBuf[i*3+1]+mg);
    colBuf[i*3+2]=Math.min(1,colBuf[i*3+2]+mb);
  }
}

// ── Lightning Strike — top to bottom through all panels ──
let ovLightningT=0, ovLightningStrikes=[], ovLightningNextAt=0;

// ── Persistent swirling cloud on top panel ──
let ovCloudBuf=null, ovCloudT=0, ovCloudInited=false;

function ovCloudInit(){
  ovCloudBuf=new Float32Array(SIZE*SIZE*3);
  // Seed with multiple overlapping cloud blobs to start with a visible cloud
  const blobs=[
    [SIZE*0.35,SIZE*0.45,SIZE*0.38,SIZE*0.28,0.32],
    [SIZE*0.60,SIZE*0.52,SIZE*0.32,SIZE*0.24,0.28],
    [SIZE*0.50,SIZE*0.38,SIZE*0.28,SIZE*0.20,0.22],
    [SIZE*0.25,SIZE*0.55,SIZE*0.22,SIZE*0.18,0.18],
    [SIZE*0.72,SIZE*0.42,SIZE*0.25,SIZE*0.19,0.20],
    [SIZE*0.48,SIZE*0.65,SIZE*0.30,SIZE*0.22,0.16],
  ];
  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    let g=0;
    for(const [cx,cy,rx,ry,str] of blobs){
      const dx=(u-cx)/rx, dy=(v-cy)/ry;
      const d=Math.sqrt(dx*dx+dy*dy);
      g+=Math.pow(Math.max(0,1-d),2.5)*str;
    }
    g=Math.min(0.35,g);
    if(g<0.005) continue;
    const i=(v*SIZE+u)*3;
    ovCloudBuf[i  ]=g*0.40; // dark blue-grey
    ovCloudBuf[i+1]=g*0.52;
    ovCloudBuf[i+2]=g*0.82;
  }
  ovCloudInited=true;
}

function ovDrawCloud(startX, startY){
  if(!ovCloudBuf) ovCloudInit();
  const cx=startX, cy=startY;
  const rx=SIZE*0.38, ry=SIZE*0.28;
  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    const dx=(u-cx)/rx, dy=(v-cy)/ry;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d>1.5) continue;
    const g=Math.pow(Math.max(0,1-d),2)*0.22
          + Math.pow(Math.max(0,1-Math.sqrt(((u-cx-rx*0.3)/rx*1.4)**2+((v-cy+ry*0.25)/ry*1.4)**2)),2)*0.14;
    const i=(v*SIZE+u)*3;
    ovCloudBuf[i  ]=Math.min(0.30,ovCloudBuf[i  ]+g*0.40);
    ovCloudBuf[i+1]=Math.min(0.36,ovCloudBuf[i+1]+g*0.52);
    ovCloudBuf[i+2]=Math.min(0.55,ovCloudBuf[i+2]+g*0.85);
  }
}

function ovTickCloud(dt){
  if(!ovCloudBuf) ovCloudInit();
  ovCloudT+=dt;

  // Swirl: rotate cloud pixels slowly around centre
  const angle=dt*0.18; // radians/sec swirl
  const cos=Math.cos(angle), sin=Math.sin(angle);
  const cx=SIZE/2, cy=SIZE/2;
  const next=new Float32Array(ovCloudBuf.length);

  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    const dx=u-cx, dy=v-cy;
    // Differential swirl — stronger at edges
    const r=Math.sqrt(dx*dx+dy*dy)/SIZE;
    const a=angle*(0.3+r*1.4);
    const ca=Math.cos(a), sa=Math.sin(a);
    const su=cx+dx*ca-dy*sa;
    const sv=cy+dx*sa+dy*ca;
    const iu=Math.round(su), iv=Math.round(sv);
    if(iu<0||iu>=SIZE||iv<0||iv>=SIZE) continue;
    const src=(v*SIZE+u)*3, dst=(iv*SIZE+iu)*3;
    next[dst  ]=Math.max(next[dst  ],ovCloudBuf[src  ]);
    next[dst+1]=Math.max(next[dst+1],ovCloudBuf[src+1]);
    next[dst+2]=Math.max(next[dst+2],ovCloudBuf[src+2]);
  }

  // Fade slightly each frame
  for(let i=0;i<next.length;i++) next[i]*=1-dt*0.025;

  // Occasionally add a wispy tendril to keep it alive
  if(Math.random()<dt*0.4){
    const bx=SIZE*(0.2+Math.random()*0.6), by=SIZE*(0.2+Math.random()*0.6);
    const rx2=SIZE*(0.08+Math.random()*0.12), ry2=SIZE*(0.06+Math.random()*0.1);
    for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
      const dx=(u-bx)/rx2, dy=(v-by)/ry2;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>1.5) continue;
      const g=Math.pow(Math.max(0,1-d),3)*0.12;
      const i=(v*SIZE+u)*3;
      next[i  ]=Math.min(0.28,next[i  ]+g*0.38);
      next[i+1]=Math.min(0.34,next[i+1]+g*0.50);
      next[i+2]=Math.min(0.52,next[i+2]+g*0.82);
    }
  }

  ovCloudBuf=next;

  // Paint to top face
  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    const ci=(v*SIZE+u)*3;
    if(ovCloudBuf[ci+2]<0.006) continue;
    const idx=faceMap[4][v*SIZE+u];
    if(idx>=0){
      colBuf[idx*3  ]=Math.max(colBuf[idx*3  ],ovCloudBuf[ci  ]);
      colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],ovCloudBuf[ci+1]);
      colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],ovCloudBuf[ci+2]);
    }
  }
}
function ovMakeLightBolt(){
  const pts=[];
  const startX=Math.floor(SIZE*0.1+Math.random()*SIZE*0.8);
  const startY=Math.floor(SIZE*0.1+Math.random()*SIZE*0.8);

  const hc=Math.random();
  let br,bg,bb;
  if     (hc<0.28){ br=1;    bg=1;    bb=1;    }
  else if(hc<0.50){ br=0.7;  bg=0.88; bb=1;    }
  else if(hc<0.65){ br=0.85; bg=0.65; bb=1;    }
  else if(hc<0.80){ br=1;    bg=0.95; bb=0.55; }
  else             { br=1;    bg=0.78; bb=0.35; }

  // TOP: starburst from 2D origin — each branch heads toward an edge
  // We generate exactly 4 main branches, one toward each edge, so they
  // exit at predictable positions that match where side bolts start
  const edgeExits=[]; // [u, v] on top panel edge for each face
  const topBranches=4+Math.floor(Math.random()*3);
  for(let b=0;b<topBranches;b++){
    const ang=(b/topBranches)*Math.PI*2;
    let cx=startX, cy=startY;
    const steps=Math.floor(SIZE*0.45+Math.random()*SIZE*0.3);
    for(let s=0;s<steps;s++){
      cx+=Math.cos(ang)+(Math.random()-0.5)*0.7;
      cy+=Math.sin(ang)+(Math.random()-0.5)*0.7;
      pts.push([4,Math.max(0,Math.min(SIZE-1,Math.round(cx))),Math.max(0,Math.min(SIZE-1,Math.round(cy)))]);
    }
    edgeExits.push([Math.max(0,Math.min(SIZE-1,Math.round(cx))), Math.max(0,Math.min(SIZE-1,Math.round(cy)))]);
  }

  // SIDE panels: each bolt starts at the u position where the top branch reached that face's edge
  // Face mapping to top panel edges:
  //   front(0) → top panel v=0  row, u = col
  //   back(1)  → top panel v=S-1 row, u = col
  //   left(3)  → top panel u=0  col, v = row
  //   right(2) → top panel u=S-1 col, v = row
  // For each face, find the branch that exited closest to that edge
  const faceEdgeMap=[
    {face:0, getEdgeU:(exit)=>exit[0],        edgeRow:'vS'},   // front: top shares face4 v=S-1
    {face:1, getEdgeU:(exit)=>SIZE-1-exit[0], edgeRow:'v0'},   // back: top shares face4 v=0, u mirrored
    {face:3, getEdgeU:(exit)=>exit[1],        edgeRow:'u0'},   // left: top shares face4 u=0
    {face:2, getEdgeU:(exit)=>SIZE-1-exit[1], edgeRow:'uS'},   // right: top shares face4 u=S-1, u mirrored
  ];

  for(const {face, getEdgeU, edgeRow} of faceEdgeMap){
    // Find which exit point is closest to this face's edge
    let bestExit=edgeExits[0], bestScore=Infinity;
    for(const ex of edgeExits){
      let score;
      if(edgeRow==='v0')  score=ex[1];            // closest to v=0
      else if(edgeRow==='vS') score=SIZE-1-ex[1]; // closest to v=S-1
      else if(edgeRow==='u0') score=ex[0];         // closest to u=0
      else                score=SIZE-1-ex[0];      // closest to u=S-1
      if(score<bestScore){ bestScore=score; bestExit=ex; }
    }
    let cx=getEdgeU(bestExit);
    let drift=(Math.random()-0.5)*1.8;
    let segLen=3+Math.floor(Math.random()*5);
    let segCount=0;
    for(let v=SIZE-1;v>=0;v--){
      cx+=drift+(Math.random()-0.5)*1.2;
      cx=Math.max(0,Math.min(SIZE-1,cx));
      pts.push([face,Math.round(cx),v]);
      segCount++;
      if(segCount>=segLen){
        segCount=0;
        segLen=2+Math.floor(Math.random()*5);
        drift=(Math.random()-0.5)*2.5;
      }
      if(Math.random()<0.08 && v>SIZE*0.15){
        let bx=cx; const bdir=Math.random()<0.5?-1:1;
        let bdrift=bdir*(1+Math.random()*1.5);
        const blen=Math.floor(SIZE*0.15+Math.random()*SIZE*0.25);
        for(let bv=v-1;bv>=Math.max(0,v-blen);bv--){
          bx+=bdrift+(Math.random()-0.5)*0.8;
          bdrift*=0.95;
          bx=Math.max(0,Math.min(SIZE-1,bx));
          pts.push([face,Math.round(bx),bv]);
        }
      }
    }
  }

  // BOTTOM: impact spread
  for(let face=0;face<4;face++){
    let cx=startX+(Math.random()-0.5)*SIZE*0.4;
    for(let v=0;v<SIZE*0.6;v++){
      if(v%2===0) cx+=(Math.random()-0.5)*3;
      cx=Math.max(0,Math.min(SIZE-1,cx));
      pts.push([5,Math.round(cx),v]);
    }
  }

  return {pts, flashT:0, startX, startY, br, bg, bb};
}

function ovLightning(dt){
  ovLightningT+=dt;
  ovTickCloud(dt);

  const baseInterval=1/Math.max(0.1,OV.lightning.rate);
  if(ovLightningT>ovLightningNextAt){
    ovLightningT=0;
    ovLightningNextAt=baseInterval*(0.3+Math.random()*1.8);
    const bolt=ovMakeLightBolt();
    ovLightningStrikes.push(bolt);
    ovDrawCloud(bolt.startX, bolt.startY);
    if(Math.random()<0.35){
      setTimeout(()=>{const b2=ovMakeLightBolt();ovLightningStrikes.push(b2);ovDrawCloud(b2.startX,b2.startY);},60+Math.random()*150);
    }
  }

  const width=OV.lightning.width|0;
  const bright=OV.lightning.brightness;

  for(let si=ovLightningStrikes.length-1;si>=0;si--){
    const bolt=ovLightningStrikes[si];
    bolt.flashT+=dt;
    const life=1-bolt.flashT/0.4;
    if(life<=0){ ovLightningStrikes.splice(si,1); continue; }

    const isBlast=bolt.flashT<0.05, isCore=bolt.flashT<0.14;
    const bb2=isBlast?bright:(isCore?bright*0.9:bright*life*0.75);
    const r=Math.min(1,bb2*bolt.br), g=Math.min(1,bb2*bolt.bg), b=Math.min(1,bb2*bolt.bb);

    for(const [face,u,v] of bolt.pts){
      const idx0=faceMap[face][v*SIZE+u];
      if(idx0>=0){colBuf[idx0*3]=Math.max(colBuf[idx0*3],r);colBuf[idx0*3+1]=Math.max(colBuf[idx0*3+1],g);colBuf[idx0*3+2]=Math.max(colBuf[idx0*3+2],b);}
      for(let w=1;w<width;w++){
        const fade=Math.pow(1-w/width,1.5);
        [u-w,u+w].forEach(wu=>{
          if(wu<0||wu>=SIZE) return;
          const idx=faceMap[face][v*SIZE+wu];
          if(idx>=0){colBuf[idx*3]=Math.max(colBuf[idx*3],r*fade);colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g*fade);colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b*fade*0.8);}
        });
      }
    }

    if(isBlast){
      const fa=bright*0.16;
      for(let f=0;f<6;f++) for(let j=0;j<SIZE*SIZE;j++){
        const idx=faceMap[f][j];
        if(idx>=0){colBuf[idx*3]=Math.min(1,colBuf[idx*3]+fa*bolt.br);colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+fa*bolt.bg);colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+fa*bolt.bb);}
      }
    }
  }
}



// Apply overlays to a single face only (for panel editor / custom cube).
// colBuf already contains the face's effect output. We run each overlay into
// a snapshot, then keep only this face's LEDs.
const OV_FUNCS={stars:ovStars,snow:ovSnow,fire:ovFire,sparkle:ovSparkle,glitch:ovGlitch,mist:ovMist};
function applyFaceOverlays(face, keys, dt){
  // Snapshot current full buffer
  const before=new Float32Array(N*3);
  for(let i=0;i<N*3;i++) before[i]=colBuf[i];
  keys.forEach(k=>{
    const fn=OV_FUNCS[k];
    if(!fn) return;
    const cfg=OV[k];
    if(!cfg) return;
    const wasOn=cfg.on; cfg.on=true;
    fn(dt);
    cfg.on=wasOn;
  });
  // Keep overlay result only on this face; restore other faces to 'before'
  const after=new Float32Array(N*3);
  for(let i=0;i<N*3;i++) after[i]=colBuf[i];
  for(let i=0;i<N*3;i++) colBuf[i]=before[i];
  for(let j=0;j<SIZE*SIZE;j++){
    const idx=faceMap[face][j];
    if(idx>=0){colBuf[idx*3]=after[idx*3];colBuf[idx*3+1]=after[idx*3+1];colBuf[idx*3+2]=after[idx*3+2];}
  }
}

function runOverlays(dt){
  ovPulseT+=dt;
  if(ovGlobalBright<0.99){
    // snapshot before overlays to scale their contribution
    const snap=new Float32Array(colBuf);
    if(OV.stars.on)     ovStars(dt);
    if(OV.snow.on)      ovSnow(dt);
    if(OV.meteors.on)   ovMeteors(dt);
    if(OV.edgeglow.on)  ovEdgeGlow(dt);
    if(OV.fire.on)      ovFire(dt);
    if(OV.sparkle.on)   ovSparkle(dt);
    if(OV.colorwave.on) ovColorWave(dt);
    if(OV.pulse.on)     ovPulse(dt);
    if(OV.scanline.on)  ovScanLine(dt);
    if(OV.vignette.on)  ovVignette();
    if(OV.glitch.on)    ovGlitch(dt);
    if(OV.mist.on)      ovMist(dt);
    if(OV.lightning.on) ovLightning(dt);
    // Scale only the delta added by overlays
    for(let i=0;i<colBuf.length;i++){
      const delta=colBuf[i]-snap[i];
      if(delta>0) colBuf[i]=snap[i]+delta*ovGlobalBright;
    }
  } else {
    if(OV.stars.on)     ovStars(dt);
    if(OV.snow.on)      ovSnow(dt);
    if(OV.meteors.on)   ovMeteors(dt);
    if(OV.edgeglow.on)  ovEdgeGlow(dt);
    if(OV.fire.on)      ovFire(dt);
    if(OV.sparkle.on)   ovSparkle(dt);
    if(OV.colorwave.on) ovColorWave(dt);
    if(OV.pulse.on)     ovPulse(dt);
    if(OV.scanline.on)  ovScanLine(dt);
    if(OV.vignette.on)  ovVignette();
    if(OV.glitch.on)    ovGlitch(dt);
    if(OV.mist.on)      ovMist(dt);
    if(OV.lightning.on) ovLightning(dt);
  }
}

// ═══════════════════════════════════════════════════
//  SIM HOUSE — cross-section house with people following daily routines
//  Uses all 4 side panels as panoramic strip (4×SIZE wide × SIZE tall)
// ═══════════════════════════════════════════════════
let shInit=false, shRooms=[], shPeople=[], shT=0, shBuf=null, shParticles=[], shShadowMode=false;

function initSimHouse(){
  const S=SIZE, W=4*S;
  const ground=2, floor1=Math.floor(S*0.47), roof=S-5;
  const gf=ground+1, gfTop=floor1-1;
  const ff=floor1+1, ffTop=roof-1;

  // Stair spans the hallway area diagonally
  const stairL=Math.floor(W*0.68)+4, stairR=Math.floor(W*0.78)-2;
  const stairW=stairR-stairL;

  shRooms=[
    {name:'garage',  x1:2,           x2:Math.floor(W*0.11), y1:gf, y2:gfTop, wallCol:[0.12,0.11,0.09], floorCol:[0.1,0.1,0.08]},
    {name:'kitchen', x1:Math.floor(W*0.11)+2, x2:Math.floor(W*0.28), y1:gf, y2:gfTop, wallCol:[0.2,0.17,0.1], floorCol:[0.14,0.12,0.08]},
    {name:'dining',  x1:Math.floor(W*0.28)+2, x2:Math.floor(W*0.44), y1:gf, y2:gfTop, wallCol:[0.16,0.12,0.07], floorCol:[0.12,0.09,0.06]},
    {name:'living',  x1:Math.floor(W*0.44)+2, x2:Math.floor(W*0.68), y1:gf, y2:gfTop, wallCol:[0.13,0.1,0.06], floorCol:[0.1,0.08,0.05]},
    {name:'hallway', x1:Math.floor(W*0.68)+2, x2:Math.floor(W*0.79), y1:gf, y2:gfTop, wallCol:[0.11,0.1,0.08], floorCol:[0.08,0.07,0.06]},
    {name:'study',   x1:Math.floor(W*0.79)+2, x2:W-3, y1:gf, y2:gfTop, wallCol:[0.11,0.09,0.06], floorCol:[0.08,0.06,0.04]},
    {name:'bedroom1',x1:2,           x2:Math.floor(W*0.20), y1:ff, y2:ffTop, wallCol:[0.09,0.07,0.14], floorCol:[0.07,0.05,0.1]},
    {name:'bathroom',x1:Math.floor(W*0.20)+2, x2:Math.floor(W*0.34), y1:ff, y2:ffTop, wallCol:[0.12,0.16,0.17], floorCol:[0.1,0.12,0.12]},
    {name:'bedroom2',x1:Math.floor(W*0.34)+2, x2:Math.floor(W*0.52), y1:ff, y2:ffTop, wallCol:[0.08,0.07,0.12], floorCol:[0.06,0.05,0.08]},
    {name:'kidsroom',x1:Math.floor(W*0.52)+2, x2:Math.floor(W*0.72), y1:ff, y2:ffTop, wallCol:[0.14,0.09,0.13], floorCol:[0.1,0.06,0.09]},
    {name:'landing', x1:Math.floor(W*0.72)+2, x2:Math.floor(W*0.82), y1:ff, y2:ffTop, wallCol:[0.1,0.09,0.08], floorCol:[0.07,0.06,0.05]},
    {name:'ensuite', x1:Math.floor(W*0.82)+2, x2:W-3, y1:ff, y2:ffTop, wallCol:[0.09,0.13,0.13], floorCol:[0.07,0.09,0.09]},
  ];

  shPeople=[];
  const pDefs=[
    {name:'Dad',   skin:[1,0.75,0.55], hair:[0.3,0.2,0.1], shirt:[0.15,0.3,0.7],pants:[0.1,0.1,0.2], h:10},
    {name:'Mum',   skin:[1,0.78,0.6],  hair:[0.55,0.3,0.12],shirt:[0.7,0.15,0.4],pants:[0.08,0.08,0.12], h:9},
    {name:'Teen',  skin:[0.92,0.72,0.52],hair:[0.15,0.12,0.08],shirt:[0.1,0.55,0.25],pants:[0.2,0.2,0.25], h:9},
    {name:'Kid',   skin:[1,0.82,0.62], hair:[0.6,0.4,0.12],shirt:[0.9,0.55,0.1],pants:[0.22,0.15,0.3], h:7},
    {name:'Granny',skin:[0.95,0.72,0.55],hair:[0.7,0.7,0.72],shirt:[0.4,0.2,0.3],pants:[0.15,0.12,0.15], h:8},
    {name:'Toddler',skin:[1,0.84,0.65],hair:[0.65,0.45,0.15],shirt:[0.8,0.3,0.3],pants:[0.15,0.2,0.3], h:5},
    {name:'Uncle', skin:[0.85,0.65,0.45],hair:[0.1,0.08,0.06],shirt:[0.3,0.3,0.5],pants:[0.12,0.12,0.15], h:11},
    {name:'Guest', skin:[0.9,0.7,0.5], hair:[0.4,0.25,0.1],shirt:[0.5,0.4,0.15],pants:[0.1,0.1,0.12], h:9},
  ];
  for(let i=0;i<pDefs.length;i++){
    const rm=shRooms[i%12];
    shPeople.push({
      ...pDefs[i], x:rm.x1+6+i*3, y:rm.y1+1,
      targetRoom:i%12, prevRoom:i%12,
      stateT:0, nextDecisionT:3+Math.random()*8,
      speed:8+Math.random()*5, walking:false,
      animFrame:0, sitting:false, sleeping:false, movePhase:'toRoom',
      waveT:0, waving:false, waveWindow:-1,
    });
  }
  shBuf=new Uint8Array(W*S*3);
  shParticles=[];
  shInit=true;
}

function shGetHour(){ const d=new Date(); return d.getHours()+d.getMinutes()/60; }

function shPickRoom(person){
  const hour=shGetHour();
  const r=Math.random();
  if(r<0.06) return Math.floor(Math.random()*12);
  const isKid=person.name==='Kid'||person.name==='Teen';
  if(hour>=23||hour<6) return isKid?(r<0.9?9:7):(r<0.9?6:7);
  if(hour>=6&&hour<8){ if(r<0.35) return 7; if(r<0.65) return 1; return 10; }
  if(hour>=8&&hour<12){ if(isKid) return r<0.6?9:3; if(r<0.3) return 5; if(r<0.6) return 1; return 3; }
  if(hour>=12&&hour<14){ if(r<0.5) return 1; if(r<0.8) return 2; return 3; }
  if(hour>=14&&hour<18){ if(isKid) return r<0.5?9:3; if(r<0.3) return 3; if(r<0.5) return 5; if(r<0.7) return 0; return 1; }
  if(hour>=18&&hour<21){ if(r<0.4) return 3; if(r<0.6) return 2; if(r<0.8) return 1; return isKid?9:5; }
  if(isKid) return r<0.7?9:7; if(r<0.4) return 3; if(r<0.6) return 6; return 7;
}

function shUpdatePeople(dt,S,W){
  const ground=2, floor1=Math.floor(S*0.47), roof=S-5;
  const hall=shRooms[4];
  const stL=hall.x1+2, stR=hall.x2-2, stBotY=ground+1, stTopY=floor1;
  const stW=stR-stL, stH=stTopY-stBotY;
  const hour=shGetHour();
  const isNight=hour>=21||hour<6;

  for(const p of shPeople){
    p.stateT+=dt;
    p.animFrame+=dt*5;
    if(p.stateT>=p.nextDecisionT){
      p.stateT=0;
      p.nextDecisionT=8+Math.random()*20;
      p.prevRoom=p.targetRoom;
      p.targetRoom=shPickRoom(p);
      p.sitting=false; p.sleeping=false;
      const curFloor=p.y>floor1?1:0;
      const destFloor=p.targetRoom>=6?1:0;
      if(curFloor!==destFloor) p.movePhase='toStairs';
      else p.movePhase='toRoom';
    }

    const room=shRooms[p.targetRoom];
    const rmName=room.name;
    const destFloor=p.targetRoom>=6?1:0;

    let targetX,targetY;
    if(p.movePhase==='toStairs'){
      const curFloor=p.y>floor1?1:0;
      targetX=curFloor===0?stL:stR;
      targetY=curFloor===0?stBotY+1:stTopY+1;
      if(Math.abs(p.x-targetX)<2&&Math.abs(p.y-targetY)<2) p.movePhase='onStairs';
    } else if(p.movePhase==='onStairs'){
      if(destFloor===1){ p.x+=p.speed*dt*0.7; }
      else { p.x-=p.speed*dt*0.7; }
      p.x=Math.max(stL,Math.min(stR,p.x));
      const progress=Math.max(0,Math.min(1,(p.x-stL)/stW));
      p.y=stBotY+1+progress*stH;
      p.walking=true;
      if((destFloor===1&&p.x>=stR-1)||(destFloor===0&&p.x<=stL+1)) p.movePhase='toRoom';
    } else {
      if(rmName==='living'){ targetX=room.x1+7; targetY=room.y1+4; }
      else if(rmName==='bedroom1'||rmName==='bedroom2'){ targetX=room.x1+6; targetY=room.y1+4; }
      else if(rmName==='kidsroom'){ targetX=room.x1+5; targetY=room.y1+3; }
      else if(rmName==='study'){ targetX=room.x1+8; targetY=room.y1+2; }
      else if(rmName==='kitchen'){ targetX=room.x1+6; targetY=room.y1+1; }
      else if(rmName==='dining'){ targetX=Math.floor((room.x1+room.x2)/2); targetY=room.y1+3; }
      else if(rmName==='bathroom'||rmName==='ensuite'){ targetX=room.x1+4; targetY=room.y1+1; }
      else { targetX=Math.floor((room.x1+room.x2)/2); targetY=room.y1+1; }
    }

    if(p.movePhase!=='onStairs'){
      const dx=targetX-p.x, dy=targetY-p.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      p.walking=dist>1.5;
      if(dist>1){
        const step=p.speed*dt;
        if(Math.abs(dx)>1) p.x+=Math.sign(dx)*Math.min(Math.abs(dx),step);
        else if(Math.abs(dy)>1) p.y+=Math.sign(dy)*Math.min(Math.abs(dy),step);
      } else if(p.movePhase==='toRoom'){
        if(rmName.includes('bedroom')||rmName==='kidsroom') p.sleeping=isNight;
        if(rmName==='living'||rmName==='dining'||rmName==='study') p.sitting=true;
      }
    }

    // Window waving logic
    if(p.waving){
      p.waveT+=dt;
      if(p.waveT>4){ p.waving=false; p.waveT=0; p.waveWindow=-1; }
    } else if(!p.walking&&!p.sleeping&&Math.random()<0.0008){
      p.waving=true; p.waveT=0;
    }
  }
}

function effectSimHouseShadows(dt){
  const S=SIZE, W=4*S;
  const ground=2, floor1=Math.floor(S*0.47), roof=S-5;
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  shBuf.fill(0);

  const setP=(x,y,r,g,b)=>{
    if(x<0||x>=W||y<0||y>=S) return;
    const i=(y*W+x)*3;
    shBuf[i]=Math.min(255,(r*255|0));
    shBuf[i+1]=Math.min(255,(g*255|0));
    shBuf[i+2]=Math.min(255,(b*255|0));
  };
  const addP=(x,y,r,g,b)=>{
    if(x<0||x>=W||y<0||y>=S) return;
    const i=(y*W+x)*3;
    shBuf[i]=Math.max(0,shBuf[i]-(r*255|0));
    shBuf[i+1]=Math.max(0,shBuf[i+1]-(g*255|0));
    shBuf[i+2]=Math.max(0,shBuf[i+2]-(b*255|0));
  };
  const fillRect=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(W-1,x2);x++) setP(x,y,r,g,b);
  };
  const hLine=(x1,x2,y,r,g,b)=>{ for(let x=x1;x<=x2;x++) setP(x,y,r,g,b); };
  const vLine=(x,y1,y2,r,g,b)=>{ for(let y=y1;y<=y2;y++) setP(x,y,r,g,b); };

  // White background
  for(let y=0;y<S;y++) for(let x=0;x<W;x++) setP(x,y,0.97,0.96,0.93);

  // House outline (thick)
  const outR=0.12,outG=0.12,outB=0.15;
  hLine(0,W-1,ground,outR,outG,outB); hLine(0,W-1,ground+1,outR*0.7,outG*0.7,outB*0.7);
  hLine(0,W-1,roof,outR,outG,outB); hLine(0,W-1,roof-1,outR*0.6,outG*0.6,outB*0.6);
  vLine(0,ground,roof,outR,outG,outB); vLine(1,ground,roof,outR*0.6,outG*0.6,outB*0.6);
  vLine(W-1,ground,roof,outR,outG,outB); vLine(W-2,ground,roof,outR*0.6,outG*0.6,outB*0.6);
  hLine(0,W-1,floor1,outR*0.5,outG*0.5,outB*0.5);
  // Roof pitch with thickness
  const roofPeak=S-2, roofMid=Math.floor(W*0.5);
  for(let x=0;x<W;x++){
    const ry=roof+Math.round(Math.max(0,(1-Math.abs(x-roofMid)/(W*0.5)))*(roofPeak-roof));
    setP(x,ry,outR,outG,outB); setP(x,ry-1,outR*0.7,outG*0.7,outB*0.7);
  }

  // Windows — 4 per face, wide, evenly spaced within each face
  const windows=[];
  const gfMid=Math.floor((ground+floor1)/2);
  const gfWinH=Math.floor((floor1-ground)*0.6);
  const winW=Math.floor(S*0.18); // wide windows
  const ffMid=Math.floor((floor1+roof)/2);
  const ffWinH=Math.floor((roof-floor1)*0.6);
  const doorFace=1;
  for(let f=0;f<4;f++){
    const fStart=f*S;
    if(f===doorFace){
      // Door face: 1 window each side of door on ground floor, 2 on first floor
      const doorCX=fStart+Math.floor(S/2);
      const dW=Math.floor(S*0.14);
      const dLeft=doorCX-Math.floor(dW/2);
      const dRight=doorCX+Math.floor(dW/2);
      // Left window
      const lWx=fStart+Math.floor((dLeft-fStart-winW)/2);
      if(lWx>=fStart+2) windows.push({x1:lWx,y1:gfMid-Math.floor(gfWinH/2),x2:lWx+winW,y2:gfMid+Math.floor(gfWinH/2),arched:true});
      // Right window
      const rWx=dRight+Math.floor((fStart+S-dRight-winW)/2);
      if(rWx+winW<=fStart+S-2) windows.push({x1:rWx,y1:gfMid-Math.floor(gfWinH/2),x2:rWx+winW,y2:gfMid+Math.floor(gfWinH/2),arched:true});
      // First floor: 2 evenly spaced
      const ffSpacing=Math.floor((S-2*winW)/3);
      for(let wi=0;wi<2;wi++){
        const wx=fStart+ffSpacing+wi*(winW+ffSpacing);
        windows.push({x1:wx,y1:ffMid-Math.floor(ffWinH/2),x2:wx+winW,y2:ffMid+Math.floor(ffWinH/2),arched:true});
      }
    } else {
      // Normal faces: 2 ground floor + 2 first floor, evenly spaced
      const spacing=Math.floor((S-2*winW)/3);
      for(let wi=0;wi<2;wi++){
        const wx=fStart+spacing+wi*(winW+spacing);
        windows.push({x1:wx,y1:gfMid-Math.floor(gfWinH/2),x2:wx+winW,y2:gfMid+Math.floor(gfWinH/2),arched:true});
        windows.push({x1:wx,y1:ffMid-Math.floor(ffWinH/2),x2:wx+winW,y2:ffMid+Math.floor(ffWinH/2),arched:true});
      }
    }
  }

  // Front door — centred on face 1
  const doorFaceStart=doorFace*S;
  const doorW=Math.floor(S*0.14), doorH=Math.floor((floor1-ground)*0.8);
  const doorX=doorFaceStart+Math.floor((S-doorW)/2);
  // Door step
  fillRect(doorX-2,ground+1,doorX+doorW+2,ground+2,0.55,0.55,0.52);
  // Door frame (thick)
  fillRect(doorX-1,ground+1,doorX-1,ground+doorH+1,0.25,0.2,0.12);
  fillRect(doorX+doorW+1,ground+1,doorX+doorW+1,ground+doorH+1,0.25,0.2,0.12);
  hLine(doorX-1,doorX+doorW+1,ground+doorH+1,0.25,0.2,0.12);
  // Door body
  fillRect(doorX,ground+2,doorX+doorW,ground+doorH,0.35,0.18,0.08);
  // Door panels (decorative)
  fillRect(doorX+1,ground+doorH-4,doorX+Math.floor(doorW/2)-1,ground+doorH-1,0.28,0.14,0.06);
  fillRect(doorX+Math.floor(doorW/2)+1,ground+doorH-4,doorX+doorW-1,ground+doorH-1,0.28,0.14,0.06);
  fillRect(doorX+1,ground+3,doorX+Math.floor(doorW/2)-1,ground+doorH-6,0.28,0.14,0.06);
  fillRect(doorX+Math.floor(doorW/2)+1,ground+3,doorX+doorW-1,ground+doorH-6,0.28,0.14,0.06);
  // Door arch
  const archCX=doorX+Math.floor(doorW/2);
  for(let dx=-Math.floor(doorW/2)-1;dx<=Math.floor(doorW/2)+1;dx++){
    const archY=ground+doorH+1+Math.round(Math.sqrt(Math.max(0,(doorW*0.6)*(doorW*0.6)-dx*dx))*0.4);
    setP(archCX+dx,archY,0.25,0.2,0.12);
  }
  // Transom window above door
  fillRect(doorX+1,ground+doorH+1,doorX+doorW-1,ground+doorH+3,0.7,0.75,0.85);
  // Handle + knocker
  setP(doorX+doorW-2,ground+Math.floor(doorH/2)+1,0.7,0.6,0.2);
  setP(doorX+doorW-2,ground+Math.floor(doorH/2),0.6,0.5,0.15);
  setP(doorX+Math.floor(doorW/2),ground+doorH-1,0.65,0.55,0.2); // knocker

  // Draw windows (fancy with arch, curtains, warm glow)
  const hour=shGetHour();
  const isNight=hour>=21||hour<6;
  const winGlow=isNight?0.9:0.65;
  for(const w of windows){
    const ww=w.x2-w.x1, wh=w.y2-w.y1;
    // Window glow fill
    fillRect(w.x1,w.y1,w.x2,w.y2,winGlow*0.95,winGlow*0.88,winGlow*0.55);
    // Outer frame (thick, dark)
    hLine(w.x1-1,w.x2+1,w.y1-1,outR,outG,outB); hLine(w.x1-1,w.x2+1,w.y2+1,outR,outG,outB);
    vLine(w.x1-1,w.y1-1,w.y2+1,outR,outG,outB); vLine(w.x2+1,w.y1-1,w.y2+1,outR,outG,outB);
    // Inner frame
    hLine(w.x1,w.x2,w.y1,outR*0.9,outG*0.9,outB*0.9); hLine(w.x1,w.x2,w.y2,outR*0.9,outG*0.9,outB*0.9);
    vLine(w.x1,w.y1,w.y2,outR*0.9,outG*0.9,outB*0.9); vLine(w.x2,w.y1,w.y2,outR*0.9,outG*0.9,outB*0.9);
    // Cross panes (4 sections)
    const mx=Math.floor((w.x1+w.x2)/2), my=Math.floor((w.y1+w.y2)/2);
    hLine(w.x1,w.x2,my,outR*0.7,outG*0.7,outB*0.7);
    vLine(mx,w.y1,w.y2,outR*0.7,outG*0.7,outB*0.7);
    // Arch top decoration
    if(w.arched){
      const acx=mx, radius=Math.floor(ww/2)+1;
      for(let dx=-radius;dx<=radius;dx++){
        const ay=w.y2+1+Math.round(Math.sqrt(Math.max(0,radius*radius-dx*dx))*0.35);
        if(ay>w.y2+1) setP(acx+dx,ay,outR*0.8,outG*0.8,outB*0.8);
      }
    }
    // Sill at bottom
    hLine(w.x1-1,w.x2+1,w.y1-1,0.3,0.28,0.22);
    // Curtain hints (left and right edges, slightly darker)
    for(let y=w.y1+1;y<w.y2;y++){
      setP(w.x1+1,y,winGlow*0.6,winGlow*0.5,winGlow*0.3);
      setP(w.x2-1,y,winGlow*0.6,winGlow*0.5,winGlow*0.3);
    }
  }

  // Draw people shadows — realistic silhouettes, people stop at windows to do things
  for(const p of shPeople){
    const px=Math.round(p.x), py=Math.round(p.y);
    const ph=p.h||10;
    // Determine if person is "at" a window (pausing to do something)
    const pHash=(p.name.charCodeAt(0)*7+Math.floor(shT*0.15))%5;
    const atWindow=!p.walking&&pHash<2;

    for(const w of windows){
      const personFloor=py>floor1?1:0;
      const winFloor=w.y1>floor1?1:0;
      if(personFloor!==winFloor) continue;
      const winCX=(w.x1+w.x2)/2;
      const dist=Math.abs(px-winCX);
      const winW=w.x2-w.x1;
      if(dist>winW*3) continue;
      // Closer = darker (more opaque shadow)
      const closeness=Math.max(0,1-dist/(winW*2.5));
      const sR=0.85*closeness, sG=0.85*closeness, sB=0.88*closeness;
      if(sR<0.1) continue;
      const sxOff=Math.round((px-winCX)*0.4);
      const sCX=Math.floor(winCX)+sxOff;
      const wH=w.y2-w.y1;

      if(p.sleeping){
        // Lying horizontal blob
        for(let i=-3;i<=3;i++){
          const sx=sCX+i; if(sx<=w.x1||sx>=w.x2) continue;
          addP(sx,w.y1+2,sR,sG,sB);
          addP(sx,w.y1+3,sR*0.7,sG*0.7,sB*0.7);
          if(i>=-1&&i<=1) addP(sx,w.y1+4,sR*0.4,sG*0.4,sB*0.4); // blanket
        }
      } else if(atWindow&&dist<winW*1.2){
        // Person stopped at window doing an activity
        const baseY=w.y1+1;
        const sH=Math.min(ph,wH-2);
        const activity=pHash; // 0=looking out, 1=on phone
        // Full body silhouette (realistic proportions)
        for(let dy=0;dy<sH;dy++){
          const sy=baseY+dy; if(sy<=w.y1||sy>=w.y2) continue;
          let bw;
          const rel=dy/sH;
          if(rel>0.85) bw=2; // head
          else if(rel>0.75) bw=2; // neck
          else if(rel>0.45) bw=3; // torso (wider)
          else if(rel>0.35) bw=3; // hips
          else bw=2; // legs
          for(let dx=-Math.floor(bw/2);dx<=Math.floor(bw/2);dx++){
            const sx=sCX+dx; if(sx<=w.x1||sx>=w.x2) continue;
            addP(sx,sy,sR,sG,sB);
          }
        }
        // Activity-specific details
        const armY=baseY+Math.floor(sH*0.6);
        if(activity===0){
          // Looking out — one arm raised to window
          for(let ay=armY;ay<armY+3&&ay<w.y2;ay++){
            if(sCX+2<w.x2) addP(sCX+2,ay,sR*0.7,sG*0.7,sB*0.7);
          }
          // Hand at face level
          if(sCX+2<w.x2&&armY+3<w.y2) addP(sCX+2,armY+3,sR*0.6,sG*0.6,sB*0.6);
        } else {
          // On phone — arm bent up near head
          const phoneY=baseY+Math.floor(sH*0.8);
          if(sCX+2<w.x2&&phoneY<w.y2) addP(sCX+2,phoneY,sR*0.8,sG*0.8,sB*0.8);
          if(sCX+2<w.x2&&phoneY-1>w.y1) addP(sCX+2,phoneY-1,sR*0.6,sG*0.6,sB*0.6);
        }
      } else if(p.sitting){
        // Sitting doing something — reading, typing, eating
        const baseY=w.y1+1;
        const sH=Math.min(ph-2,wH-2);
        for(let dy=0;dy<sH;dy++){
          const sy=baseY+dy; if(sy<=w.y1||sy>=w.y2) continue;
          const rel=dy/sH;
          let bw=rel>0.8?2:rel>0.4?3:3; // wider seated torso
          for(let dx=-Math.floor(bw/2);dx<=Math.floor(bw/2);dx++){
            const sx=sCX+dx; if(sx<=w.x1||sx>=w.x2) continue;
            addP(sx,sy,sR,sG,sB);
          }
        }
        // Arms forward (at desk/table)
        const armY=baseY+Math.floor(sH*0.5);
        const armAnim=Math.round(Math.sin(shT*1.5)*0.5);
        if(armY>w.y1&&armY<w.y2){
          for(let ax=1;ax<=3;ax++){
            if(sCX-ax>w.x1) addP(sCX-ax,armY+armAnim,sR*0.6,sG*0.6,sB*0.6);
            if(sCX+ax<w.x2) addP(sCX+ax,armY-armAnim,sR*0.6,sG*0.6,sB*0.6);
          }
        }
      } else {
        // Walking — realistic body with natural stride
        const baseY=w.y1+1;
        const sH=Math.min(ph+1,wH-1);
        for(let dy=0;dy<sH;dy++){
          const sy=baseY+dy; if(sy<=w.y1||sy>=w.y2) continue;
          const rel=dy/sH;
          let bw;
          if(rel>0.88) bw=2; // head
          else if(rel>0.82) bw=2; // neck
          else if(rel>0.5) bw=3; // shoulders+torso
          else if(rel>0.38) bw=3; // hips
          else if(rel>0.15) bw=2; // thighs
          else bw=2; // calves
          for(let dx=-Math.floor(bw/2);dx<=Math.floor(bw/2);dx++){
            const sx=sCX+dx; if(sx<=w.x1||sx>=w.x2) continue;
            addP(sx,sy,sR,sG,sB);
          }
        }
        // Arm swing
        if(p.walking){
          const swing=Math.sin(p.animFrame*3);
          const armY1=baseY+Math.floor(sH*0.55)+Math.round(swing*1.5);
          const armY2=baseY+Math.floor(sH*0.55)-Math.round(swing*1.5);
          if(sCX-2>w.x1&&armY1>w.y1&&armY1<w.y2) addP(sCX-2,armY1,sR*0.6,sG*0.6,sB*0.6);
          if(sCX+2<w.x2&&armY2>w.y1&&armY2<w.y2) addP(sCX+2,armY2,sR*0.6,sG*0.6,sB*0.6);
          // Leg stride (alternating)
          const legOff=Math.round(swing*1.3);
          const legY=baseY+1;
          if(legY>w.y1&&legY<w.y2){
            if(sCX+legOff>w.x1&&sCX+legOff<w.x2) addP(sCX+legOff,legY,sR*0.5,sG*0.5,sB*0.5);
            if(sCX-legOff>w.x1&&sCX-legOff<w.x2) addP(sCX-legOff,legY+1,sR*0.4,sG*0.4,sB*0.4);
          }
        }
      }
    }
  }

  // Draw waving person — head pokes out above window, arm waves
  for(const p of shPeople){
    if(!p.waving) continue;
    const px=Math.round(p.x), py=Math.round(p.y);
    const personFloor=py>floor1?1:0;
    // Find nearest window on same floor
    let bestW=null, bestDist=999;
    for(const w of windows){
      const winFloor=w.y1>floor1?1:0;
      if(winFloor!==personFloor) continue;
      const d=Math.abs(px-(w.x1+w.x2)/2);
      if(d<bestDist){ bestDist=d; bestW=w; }
    }
    if(!bestW||bestDist>30) continue;
    const wcx=Math.floor((bestW.x1+bestW.x2)/2);
    const wTop=bestW.y2;
    // Phase: 0-0.5 opening, 0.5-3.5 waving, 3.5-4 closing
    const phase=p.waveT;
    if(phase>0.5&&phase<3.5){
      // Head poking out above window
      setP(wcx,wTop+2,0.2,0.15,0.1); setP(wcx+1,wTop+2,0.2,0.15,0.1); // head (dark silhouette outside)
      setP(wcx,wTop+3,0.15,0.1,0.08); setP(wcx+1,wTop+3,0.15,0.1,0.08); // hair
      // Shoulders
      setP(wcx-1,wTop+1,0.18,0.13,0.09); setP(wcx+2,wTop+1,0.18,0.13,0.09);
      // Waving arm (oscillates)
      const armUp=Math.round(Math.sin(p.waveT*6)*1.5);
      setP(wcx+3,wTop+2+armUp,0.2,0.15,0.1);
      setP(wcx+3,wTop+3+armUp,0.18,0.13,0.09);
      // Open window indicator (brighter gap at top of window)
      hLine(bestW.x1+1,bestW.x2-1,wTop,0.85,0.88,0.92);
    } else if(phase<=0.5){
      // Window opening — slight gap
      const openAmt=phase/0.5;
      if(openAmt>0.5) hLine(bestW.x1+1,bestW.x2-1,wTop,0.8,0.82,0.85);
    } else {
      // Closing
      const closeAmt=(phase-3.5)/0.5;
      if(closeAmt<0.5) hLine(bestW.x1+1,bestW.x2-1,wTop,0.8,0.82,0.85);
    }
  }

  // Ground shadow + path
  for(let x=0;x<W;x++) setP(x,ground-1,0.7,0.7,0.68);
  // Garden path to door
  for(let x=doorX-1;x<=doorX+doorW+1;x++) setP(x,ground-1,0.6,0.58,0.52);

  // ── OUTPUT ──
  if(panel2dMode){
    // Show only the door face (face 1) with its 4 windows
    const faceStart=doorFace*S;
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const sx=faceStart+u;
      const i=(v*W+sx)*3;
      const idx=faceMap[0][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=shBuf[i]/255; colBuf[idx*3+1]=shBuf[i+1]/255; colBuf[idx*3+2]=shBuf[i+2]/255;
    }
  } else {
    for(let fIdx=0;fIdx<4;fIdx++){
      const face=VID_FACE_ORDER[fIdx];
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const pu=S-1-u;
        const sx=fIdx*S+pu;
        const i=(v*W+sx)*3;
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        colBuf[idx*3]=shBuf[i]/255; colBuf[idx*3+1]=shBuf[i+1]/255; colBuf[idx*3+2]=shBuf[i+2]/255;
      }
    }
    // Top face: tiled roof look (grey with tile pattern)
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[4][v*S+u]; if(idx<0) continue;
      // Base grey slate colour
      let r=0.38, g=0.36, b=0.34;
      // Tile rows (horizontal lines every 6px, offset every other row)
      const tileH=6, tileW=8;
      const row=Math.floor(v/tileH);
      const offset=(row%2)*Math.floor(tileW/2);
      const localV=v%tileH, localU=(u+offset)%tileW;
      // Slight colour variation per tile
      const tileHash=((row*13+Math.floor((u+offset)/tileW)*7)%17)/17;
      r+=tileHash*0.06-0.03;
      g+=tileHash*0.05-0.025;
      b+=tileHash*0.04-0.02;
      // Horizontal grout lines (darker)
      if(localV===0){ r-=0.08; g-=0.08; b-=0.07; }
      // Vertical grout lines (darker)
      if(localU===0){ r-=0.06; g-=0.06; b-=0.05; }
      // Subtle gradient (lighter at top/ridge)
      const ridgeFade=1-Math.abs(v-S/2)/(S*0.6);
      r+=ridgeFade*0.04; g+=ridgeFade*0.04; b+=ridgeFade*0.03;
      colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
    }
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[5][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=0.7; colBuf[idx*3+1]=0.7; colBuf[idx*3+2]=0.68;
    }
  }
}

function effectSimHouse(dt){
  if(!shInit) initSimHouse();
  shT+=dt;
  const S=SIZE, W=4*S;

  // Update people movement (shared between modes)
  shUpdatePeople(dt,S,W);

  if(shShadowMode){ effectSimHouseShadows(dt); return; }

  // ── 2D PANEL: compact single-face layout with fewer rooms ──
  if(panel2dMode){
    const ground=2, floor1=Math.floor(S*0.47), roof=S-5;
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    shBuf.fill(0);
    const BW=S; // single panel width
    const setP=(x,y,r,g,b)=>{
      if(x<0||x>=BW||y<0||y>=S) return;
      const i=(y*BW+x)*3;
      shBuf[i]=Math.min(255,shBuf[i]+(r*255|0));
      shBuf[i+1]=Math.min(255,shBuf[i+1]+(g*255|0));
      shBuf[i+2]=Math.min(255,shBuf[i+2]+(b*255|0));
    };
    const fillRect=(x1,y1,x2,y2,r,g,b)=>{
      for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(BW-1,x2);x++) setP(x,y,r,g,b);
    };
    const hLine=(x1,x2,y,r,g,b)=>{ for(let x=x1;x<=x2;x++) setP(x,y,r,g,b); };
    const vLine=(x,y1,y2,r,g,b)=>{ for(let y=y1;y<=y2;y++) setP(x,y,r,g,b); };

    const hour=shGetHour();
    const isNight=hour>=21||hour<6;

    // Sky
    let skyR=0.05,skyG=0.08,skyB=0.15;
    if(isNight){ skyR=0.01;skyG=0.01;skyB=0.05; }
    for(let y=roof+1;y<S;y++) for(let x=0;x<BW;x++) setP(x,y,skyR,skyG,skyB);

    // 4 spacious rooms: 2 ground, 2 first floor
    const gf=ground+1, gfTop=floor1-1, ff=floor1+1, ffTop=roof-1;
    const mid=Math.floor(BW/2);
    const rooms2d=[
      {name:'kitchen', x1:2,x2:mid-2,y1:gf,y2:gfTop, wc:[0.2,0.17,0.1],fc:[0.14,0.12,0.08],tint:[0.06,0.08,0.04]},
      {name:'living',  x1:mid+1,x2:BW-3,y1:gf,y2:gfTop, wc:[0.13,0.1,0.06],fc:[0.1,0.08,0.05],tint:[0.06,0.05,0.07]},
      {name:'bedroom1',x1:2,x2:mid-2,y1:ff,y2:ffTop, wc:[0.09,0.07,0.14],fc:[0.07,0.05,0.1],tint:[0.06,0.04,0.07]},
      {name:'kidsroom',x1:mid+1,x2:BW-3,y1:ff,y2:ffTop, wc:[0.14,0.09,0.13],fc:[0.1,0.06,0.09],tint:[0.07,0.05,0.06]},
    ];

    // Draw room backgrounds
    for(const rm of rooms2d){
      let occ=false;
      for(const p of shPeople){
        const tr=shRooms[p.targetRoom];
        if(tr&&tr.name===rm.name){occ=true;break;}
      }
      const lit=occ?(isNight?0.5:1.0):0.25;
      fillRect(rm.x1,rm.y1,rm.x2,rm.y2,(rm.wc[0]+rm.tint[0])*lit,(rm.wc[1]+rm.tint[1])*lit,(rm.wc[2]+rm.tint[2])*lit);
      hLine(rm.x1,rm.x2,rm.y1,rm.fc[0]*1.5,rm.fc[1]*1.5,rm.fc[2]*1.5);
      if(occ){
        const cx=Math.floor((rm.x1+rm.x2)/2);
        setP(cx,rm.y2,0.3,0.28,0.15); setP(cx-1,rm.y2,0.15,0.14,0.08); setP(cx+1,rm.y2,0.15,0.14,0.08);
      }
    }

    // Structure
    const wc=[0.35,0.28,0.18];
    hLine(0,BW-1,ground,wc[0],wc[1],wc[2]);
    hLine(0,BW-1,floor1,wc[0],wc[1],wc[2]);
    hLine(0,BW-1,roof,wc[0],wc[1],wc[2]);
    vLine(0,ground,roof,wc[0]*0.8,wc[1]*0.8,wc[2]*0.8);
    vLine(BW-1,ground,roof,wc[0]*0.8,wc[1]*0.8,wc[2]*0.8);
    vLine(mid,ground,roof,wc[0]*0.5,wc[1]*0.5,wc[2]*0.5);
    // Roof
    const roofMid=Math.floor(BW/2);
    for(let x=0;x<BW;x++){
      const ry=roof+Math.round(Math.max(0,(1-Math.abs(x-roofMid)/(BW*0.5)))*3);
      setP(x,ry,wc[0],wc[1],wc[2]);
    }

    // Furniture (spacious)
    const kit2=rooms2d[0], liv2=rooms2d[1], br2=rooms2d[2], kid2=rooms2d[3];
    // Kitchen: counter, fridge, stove, cabinets
    fillRect(kit2.x1+1,kit2.y1,kit2.x1+8,kit2.y1+4,0.42,0.38,0.3);
    fillRect(kit2.x2-4,kit2.y1,kit2.x2-1,kit2.y1+7,0.48,0.5,0.55);
    setP(kit2.x2-2,kit2.y1+6,0.3,0.5,0.8);
    fillRect(kit2.x1+10,kit2.y1,kit2.x1+14,kit2.y1+3,0.33,0.33,0.36);
    setP(kit2.x1+11,kit2.y1+3,0.7,0.3,0.05); setP(kit2.x1+13,kit2.y1+3,0.7,0.3,0.05);
    fillRect(kit2.x1+1,kit2.y2-3,kit2.x1+6,kit2.y2-1,0.28,0.2,0.1);
    fillRect(kit2.x1+8,kit2.y2-3,kit2.x1+13,kit2.y2-1,0.28,0.2,0.1);
    // Living: big sofa, TV, coffee table, bookshelf
    fillRect(liv2.x1+2,liv2.y1+2,liv2.x1+14,liv2.y1+5,0.3,0.15,0.1);
    fillRect(liv2.x1+4,liv2.y1+4,liv2.x1+7,liv2.y1+5,0.6,0.25,0.15);
    fillRect(liv2.x1+9,liv2.y1+4,liv2.x1+12,liv2.y1+5,0.15,0.4,0.55);
    fillRect(liv2.x2-8,liv2.y1+7,liv2.x2-2,liv2.y1+13,0.04,0.04,0.04);
    let tvOn2=false; for(const p of shPeople){ const tr=shRooms[p.targetRoom]; if(tr&&tr.name==='living'){tvOn2=true;break;}}
    if(tvOn2){ const fl=0.4+0.2*Math.sin(shT*5); fillRect(liv2.x2-7,liv2.y1+8,liv2.x2-3,liv2.y1+12,fl*0.2,fl*0.4,fl*0.9); }
    fillRect(liv2.x1+15,liv2.y1,liv2.x1+19,liv2.y1+3,0.28,0.2,0.1);
    fillRect(liv2.x2-2,liv2.y1,liv2.x2,liv2.y2-2,0.2,0.15,0.08);
    // Bedroom: big bed, wardrobe, nightstands
    fillRect(br2.x1+2,br2.y1,br2.x1+14,br2.y1+3,0.24,0.18,0.1);
    fillRect(br2.x1+2,br2.y1+4,br2.x1+14,br2.y1+6,0.55,0.3,0.5);
    fillRect(br2.x1+2,br2.y1+7,br2.x1+5,br2.y1+7,0.68,0.68,0.72);
    fillRect(br2.x1+11,br2.y1+7,br2.x1+14,br2.y1+7,0.68,0.68,0.72);
    fillRect(br2.x2-5,br2.y1,br2.x2-1,br2.y2-1,0.22,0.15,0.08);
    vLine(br2.x2-3,br2.y1,br2.y2-2,0.17,0.12,0.06);
    let br2Occ=false; for(const p of shPeople){ const tr=shRooms[p.targetRoom]; if(tr&&tr.name==='bedroom1'){br2Occ=true;break;}}
    if(br2Occ&&isNight){ setP(br2.x1+1,br2.y1+5,0.4,0.32,0.12); setP(br2.x1+15,br2.y1+5,0.4,0.32,0.12); }
    // Kids room: bunk bed, toys, posters
    fillRect(kid2.x1+2,kid2.y1,kid2.x1+10,kid2.y1+3,0.24,0.18,0.1);
    fillRect(kid2.x1+2,kid2.y1+4,kid2.x1+10,kid2.y1+5,0.45,0.6,0.35);
    fillRect(kid2.x1+2,kid2.y1+9,kid2.x1+10,kid2.y1+10,0.24,0.18,0.1);
    fillRect(kid2.x1+2,kid2.y1+11,kid2.x1+10,kid2.y1+12,0.4,0.45,0.7);
    vLine(kid2.x1+10,kid2.y1,kid2.y1+13,0.3,0.24,0.14);
    fillRect(kid2.x1+13,kid2.y1,kid2.x1+16,kid2.y1+3,0.6,0.3,0.35);
    setP(kid2.x1+18,kid2.y1,0.9,0.2,0.2); setP(kid2.x1+19,kid2.y1,0.2,0.8,0.2);
    setP(kid2.x1+20,kid2.y1,0.2,0.2,0.9); setP(kid2.x1+17,kid2.y1+1,0.9,0.9,0.15);
    fillRect(kid2.x2-6,kid2.y2-4,kid2.x2-2,kid2.y2-1,0.55,0.3,0.6);

    // Draw people (scaled x to fit single panel)
    for(const p of shPeople){
      const scaledX=Math.round(p.x*(BW/W));
      const py=Math.round(p.y);
      const ph=p.h||9;
      if(p.sleeping){
        for(let i=0;i<3;i++) setP(scaledX+i,py+3,p.shirt[0],p.shirt[1],p.shirt[2]);
        setP(scaledX-1,py+3,p.skin[0],p.skin[1],p.skin[2]);
      } else if(p.sitting){
        setP(scaledX,py+3,p.hair[0],p.hair[1],p.hair[2]);
        setP(scaledX,py+2,p.skin[0],p.skin[1],p.skin[2]);
        fillRect(scaledX-1,py,scaledX+1,py+1,p.shirt[0],p.shirt[1],p.shirt[2]);
      } else {
        setP(scaledX,py+ph-1,p.hair[0],p.hair[1],p.hair[2]);
        setP(scaledX,py+ph-2,p.skin[0],p.skin[1],p.skin[2]);
        for(let ty=ph-3;ty>=ph-5;ty--) setP(scaledX,py+ty,p.shirt[0],p.shirt[1],p.shirt[2]);
        setP(scaledX,py,p.pants[0],p.pants[1],p.pants[2]);
        setP(scaledX,py+1,p.pants[0]*0.9,p.pants[1]*0.9,p.pants[2]*0.9);
        if(p.walking){
          const legOff=Math.round(Math.sin(p.animFrame*3)*0.8);
          setP(scaledX+legOff,py,p.pants[0],p.pants[1],p.pants[2]);
        }
      }
    }

    // Output to single face
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const i=(v*BW+u)*3;
      const idx=faceMap[0][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=shBuf[i]/255; colBuf[idx*3+1]=shBuf[i+1]/255; colBuf[idx*3+2]=shBuf[i+2]/255;
    }
    return;
  }
  // ── END 2D PANEL ──

  const ground=2, floor1=Math.floor(S*0.47), roof=S-5;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  shBuf.fill(0);
  const setP=(x,y,r,g,b)=>{
    if(x<0||x>=W||y<0||y>=S) return;
    const i=(y*W+x)*3;
    shBuf[i]=Math.min(255,shBuf[i]+(r*255|0));
    shBuf[i+1]=Math.min(255,shBuf[i+1]+(g*255|0));
    shBuf[i+2]=Math.min(255,shBuf[i+2]+(b*255|0));
  };
  const fillRect=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(W-1,x2);x++) setP(x,y,r,g,b);
  };
  const hLine=(x1,x2,y,r,g,b)=>{ for(let x=x1;x<=x2;x++) setP(x,y,r,g,b); };
  const vLine=(x,y1,y2,r,g,b)=>{ for(let y=y1;y<=y2;y++) setP(x,y,r,g,b); };

  const hour=shGetHour();
  const isNight=hour>=21||hour<6;
  const isDusk=(hour>=18&&hour<21)||(hour>=6&&hour<7);
  const isDawn=hour>=6&&hour<8;

  // Sky with gradient
  let skyR,skyG,skyB;
  if(isNight){ skyR=0.01; skyG=0.01; skyB=0.05; }
  else if(isDusk){ skyR=0.12; skyG=0.05; skyB=0.08; }
  else if(isDawn){ skyR=0.1; skyG=0.08; skyB=0.12; }
  else { skyR=0.05; skyG=0.08; skyB=0.15; }
  for(let y=roof+1;y<S;y++){
    const grad=1-(y-roof)/(S-roof);
    for(let x=0;x<W;x++) setP(x,y,skyR*(1+grad*0.5),skyG*(1+grad*0.3),skyB*(1+grad*0.8));
  }

  // Room backgrounds with warm ambient + subtle wall colour tints
  const wallTints=[
    [0.08,0.06,0.04], // garage - grey
    [0.06,0.08,0.04], // kitchen - warm green tint
    [0.08,0.06,0.03], // dining - warm amber
    [0.06,0.05,0.07], // living - subtle plum
    [0.05,0.05,0.05], // hallway - neutral
    [0.04,0.05,0.07], // study - cool blue tint
    [0.06,0.04,0.07], // bedroom1 - lavender
    [0.04,0.07,0.07], // bathroom - aqua
    [0.04,0.05,0.07], // bedroom2 - slate blue
    [0.07,0.05,0.06], // kidsroom - warm pink
    [0.05,0.05,0.04], // landing - neutral
    [0.04,0.06,0.06], // ensuite - teal
  ];
  for(let ri=0;ri<shRooms.length;ri++){
    const rm=shRooms[ri];
    let occupied=false;
    for(const p of shPeople) if(p.targetRoom===ri) occupied=true;
    const litMul=occupied?(isNight?0.5:1.0):0.2;
    const tint=wallTints[ri]||[0,0,0];
    fillRect(rm.x1,rm.y1,rm.x2,rm.y2,(rm.wallCol[0]+tint[0])*litMul,(rm.wallCol[1]+tint[1])*litMul,(rm.wallCol[2]+tint[2])*litMul);
    // Floor highlight
    hLine(rm.x1,rm.x2,rm.y1,rm.floorCol[0]*1.5,rm.floorCol[1]*1.5,rm.floorCol[2]*1.5);
    // Ceiling light glow when occupied
    if(occupied){
      const cx=Math.floor((rm.x1+rm.x2)/2), cy=rm.y2;
      for(let dy=-2;dy<=2;dy++) for(let dx=-3;dx<=3;dx++){
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<3.5) setP(cx+dx,cy+dy,0.08*(1-d/4),0.07*(1-d/4),0.03*(1-d/4));
      }
      setP(cx,cy,0.3,0.28,0.15); setP(cx-1,cy,0.15,0.14,0.08); setP(cx+1,cy,0.15,0.14,0.08);
    }
  }

  // Structure
  const wc=[0.35,0.28,0.18];
  hLine(0,W-1,ground,wc[0],wc[1],wc[2]);
  hLine(0,W-1,floor1,wc[0],wc[1],wc[2]);
  hLine(0,W-1,roof,wc[0],wc[1],wc[2]);
  vLine(0,ground,roof,wc[0]*0.8,wc[1]*0.8,wc[2]*0.8);
  vLine(W-1,ground,roof,wc[0]*0.8,wc[1]*0.8,wc[2]*0.8);
  for(const rm of shRooms){
    vLine(rm.x1-1,rm.y1-1,rm.y2+1,wc[0]*0.5,wc[1]*0.5,wc[2]*0.5);
  }
  // Roof with thickness
  const roofPeak=S-2, roofMid=Math.floor(W*0.5);
  for(let x=0;x<W;x++){
    const ry=roof+Math.round(Math.max(0,(1-Math.abs(x-roofMid)/(W*0.5)))*(roofPeak-roof));
    setP(x,ry,wc[0],wc[1],wc[2]);
    setP(x,ry-1,wc[0]*0.6,wc[1]*0.6,wc[2]*0.6);
  }

  // ── STAIRS (diagonal steps) ──
  const hall=shRooms[4];
  const stairL=hall.x1+2, stairR=hall.x2-2;
  const stairW=stairR-stairL;
  const stairH=floor1-ground-1;
  const numSteps=Math.min(stairH,stairW);
  for(let s=0;s<=numSteps;s++){
    const sx=stairL+Math.round(s*(stairW/numSteps));
    const sy=ground+1+Math.round(s*(stairH/numSteps));
    hLine(sx,sx+2,sy,0.25,0.2,0.14);
    setP(sx,sy+1,0.15,0.12,0.08);
  }
  // Banister
  for(let s=0;s<=numSteps;s+=2){
    const sx=stairL+Math.round(s*(stairW/numSteps))+3;
    const sy=ground+1+Math.round(s*(stairH/numSteps));
    vLine(sx,sy,sy+3,0.2,0.15,0.08);
  }

  // ── FURNITURE (big, colourful, fills rooms) ──
  const kit=shRooms[1];
  // Kitchen: large counter, fridge, stove, overhead cabinets, sink, microwave
  fillRect(kit.x1+1,kit.y1,kit.x1+8,kit.y1+4,0.45,0.4,0.32); // counter L
  fillRect(kit.x2-8,kit.y1,kit.x2-1,kit.y1+4,0.4,0.38,0.3); // counter R
  fillRect(kit.x2-4,kit.y1,kit.x2-1,kit.y1+7,0.5,0.52,0.55); // fridge
  setP(kit.x2-2,kit.y1+6,0.3,0.55,0.85); setP(kit.x2-2,kit.y1+4,0.25,0.45,0.7);
  setP(kit.x2-3,kit.y1+5,0.35,0.35,0.4); // fridge handle
  fillRect(kit.x1+9,kit.y1,kit.x1+13,kit.y1+3,0.35,0.35,0.38); // stove
  setP(kit.x1+10,kit.y1+3,0.2,0.2,0.22); setP(kit.x1+12,kit.y1+3,0.2,0.2,0.22); // burners
  // Overhead cabinets (colourful)
  fillRect(kit.x1+1,kit.y2-4,kit.x1+6,kit.y2-1,0.3,0.22,0.12);
  fillRect(kit.x1+8,kit.y2-4,kit.x1+13,kit.y2-1,0.3,0.22,0.12);
  fillRect(kit.x2-8,kit.y2-3,kit.x2-5,kit.y2-1,0.28,0.2,0.1); // microwave
  // Sink
  fillRect(kit.x1+4,kit.y1+4,kit.x1+6,kit.y1+5,0.5,0.55,0.6);
  setP(kit.x1+5,kit.y1+6,0.4,0.42,0.45); // tap
  // Fruit bowl
  setP(kit.x1+2,kit.y1+5,0.8,0.2,0.15); setP(kit.x1+3,kit.y1+5,0.9,0.7,0.1); setP(kit.x1+4,kit.y1+5,0.2,0.7,0.15);
  // Stove flame
  for(const p of shPeople){ if(p.targetRoom===1&&Math.abs(p.x-(kit.x1+11))<5){
    const fl=0.7+0.3*Math.sin(shT*12);
    setP(kit.x1+10,kit.y1+4,fl,fl*0.4,0.05); setP(kit.x1+11,kit.y1+4,fl*0.8,fl*0.3,0.05); setP(kit.x1+12,kit.y1+4,fl*0.6,fl*0.2,0.02);
    if(Math.random()<0.3) shParticles.push({x:kit.x1+10+Math.random()*3,y:kit.y1+5,vx:(Math.random()-0.5)*0.5,vy:1.5+Math.random(),life:1.5,r:0.3,g:0.3,b:0.3});
    break; }}

  // Dining: large table, chairs, chandelier, rug, plant, sideboard
  const din=shRooms[2];
  const dtX=Math.floor((din.x1+din.x2)/2);
  // Rug under table
  fillRect(dtX-7,din.y1,dtX+7,din.y1+1,0.2,0.1,0.08);
  // Table
  fillRect(dtX-6,din.y1+3,dtX+6,din.y1+6,0.45,0.28,0.12);
  vLine(dtX-5,din.y1,din.y1+2,0.38,0.22,0.1); vLine(dtX+5,din.y1,din.y1+2,0.38,0.22,0.1);
  // Chairs (4)
  fillRect(dtX-9,din.y1,dtX-8,din.y1+6,0.35,0.2,0.1); fillRect(dtX+8,din.y1,dtX+9,din.y1+6,0.35,0.2,0.1);
  fillRect(dtX-3,din.y1,dtX-2,din.y1+2,0.35,0.2,0.1); fillRect(dtX+2,din.y1,dtX+3,din.y1+2,0.35,0.2,0.1);
  // Chandelier (fancy)
  setP(dtX,din.y2,0.6,0.55,0.25); setP(dtX-1,din.y2,0.4,0.35,0.15); setP(dtX+1,din.y2,0.4,0.35,0.15);
  setP(dtX-2,din.y2-1,0.55,0.5,0.2); setP(dtX+2,din.y2-1,0.55,0.5,0.2);
  vLine(dtX,din.y2-2,din.y2,0.15,0.12,0.08);
  // Place settings (colourful plates)
  for(let i=-4;i<=4;i+=2){ setP(dtX+i,din.y1+5,0.6,0.6,0.65); setP(dtX+i,din.y1+4,0.5,0.15,0.1); }
  // Sideboard
  fillRect(din.x2-4,din.y1,din.x2-1,din.y1+4,0.25,0.18,0.1);
  setP(din.x2-2,din.y1+4,0.6,0.3,0.15); // vase on sideboard
  setP(din.x2-2,din.y1+5,0.2,0.6,0.15); setP(din.x2-3,din.y1+5,0.15,0.5,0.1);
  // Plant in corner
  setP(din.x1+1,din.y1+1,0.25,0.55,0.15); setP(din.x1+2,din.y1+2,0.2,0.5,0.12); setP(din.x1+1,din.y1+2,0.18,0.45,0.1);
  setP(din.x1+1,din.y1,0.3,0.2,0.1); // pot

  // Living: big sofa, TV, coffee table, bookshelf, rug, lamp, plant, pictures
  const liv=shRooms[3];
  // Large colourful rug
  fillRect(liv.x1+2,liv.y1,liv.x2-4,liv.y1+1,0.25,0.08,0.06);
  fillRect(liv.x1+3,liv.y1+1,liv.x2-5,liv.y1+1,0.2,0.1,0.12);
  // Sofa (big, colourful)
  fillRect(liv.x1+2,liv.y1+2,liv.x1+14,liv.y1+5,0.3,0.15,0.1);
  fillRect(liv.x1+2,liv.y1+6,liv.x1+4,liv.y1+7,0.28,0.13,0.08); // arm L
  fillRect(liv.x1+12,liv.y1+6,liv.x1+14,liv.y1+7,0.28,0.13,0.08); // arm R
  // Cushions (colourful)
  fillRect(liv.x1+4,liv.y1+5,liv.x1+6,liv.y1+6,0.6,0.25,0.15);
  fillRect(liv.x1+7,liv.y1+5,liv.x1+9,liv.y1+6,0.15,0.4,0.55);
  fillRect(liv.x1+10,liv.y1+5,liv.x1+12,liv.y1+6,0.5,0.45,0.15);
  // TV (big wall-mounted)
  let tvOn=false;
  for(const p of shPeople) if(p.targetRoom===3){tvOn=true;break;}
  const tvX=liv.x2-10;
  fillRect(tvX,liv.y1+7,tvX+10,liv.y1+13,0.04,0.04,0.04); // frame
  if(tvOn){
    const fl=0.5+0.2*Math.sin(shT*5)+0.15*Math.sin(shT*9.3);
    fillRect(tvX+1,liv.y1+8,tvX+9,liv.y1+12,fl*0.25,fl*0.45,fl*0.95);
    for(let d=1;d<6;d++){
      const fade=0.04*(1-d/6);
      fillRect(tvX-d,liv.y1+7,tvX+10+d,liv.y1+13,fade*fl,fade*fl*1.2,fade*fl*2);
    }
  }
  // Coffee table
  fillRect(liv.x1+15,liv.y1+1,liv.x1+20,liv.y1+3,0.3,0.22,0.1);
  setP(liv.x1+17,liv.y1+3,0.5,0.1,0.1); // mug
  // Floor lamp
  vLine(liv.x1+1,liv.y1+4,liv.y1+9,0.15,0.12,0.08);
  setP(liv.x1+1,liv.y1+9,0.5,0.45,0.2); setP(liv.x1,liv.y1+9,0.4,0.35,0.15);
  // Bookshelf (colourful books)
  fillRect(liv.x2-4,liv.y1,liv.x2-1,liv.y2-1,0.22,0.15,0.08);
  for(let by=liv.y1;by<liv.y2-1;by++){
    const hue=by*0.7;
    setP(liv.x2-3,by,0.3+0.3*Math.sin(hue),0.2+0.2*Math.sin(hue+2),0.2+0.2*Math.sin(hue+4));
    setP(liv.x2-2,by,0.25+0.25*Math.sin(hue+1),0.3+0.2*Math.sin(hue+3),0.15+0.15*Math.sin(hue+5));
  }
  // Pictures on wall
  fillRect(liv.x1+5,liv.y2-4,liv.x1+9,liv.y2-2,0.15,0.3,0.45);
  fillRect(liv.x1+11,liv.y2-3,liv.x1+14,liv.y2-1,0.4,0.25,0.15);

  // Study: large desk, dual monitors, chair, bookcase, lamp, plant
  const stu=shRooms[5];
  fillRect(stu.x1+2,stu.y1,stu.x2-3,stu.y1+4,0.32,0.22,0.12); // big desk
  fillRect(stu.x1+4,stu.y1+5,stu.x1+8,stu.y1+8,0.1,0.1,0.14); // monitor 1
  fillRect(stu.x1+10,stu.y1+5,stu.x1+14,stu.y1+8,0.1,0.1,0.14); // monitor 2
  fillRect(stu.x1+7,stu.y1,stu.x1+10,stu.y1+5,0.18,0.18,0.22); // office chair
  let studyOcc=false;
  for(const p of shPeople) if(p.targetRoom===5){studyOcc=true;break;}
  if(studyOcc){
    fillRect(stu.x1+5,stu.y1+6,stu.x1+7,stu.y1+7,0.2,0.6,0.8);
    fillRect(stu.x1+11,stu.y1+6,stu.x1+13,stu.y1+7,0.2,0.6,0.8);
  }
  // Desk lamp
  setP(stu.x2-4,stu.y1+5,0.75,0.65,0.25); setP(stu.x2-4,stu.y1+6,0.45,0.38,0.15);
  vLine(stu.x2-4,stu.y1+3,stu.y1+5,0.2,0.18,0.1);
  // Bookcase (colourful)
  fillRect(stu.x2-2,stu.y1,stu.x2,stu.y2-1,0.2,0.14,0.08);
  for(let by=stu.y1;by<stu.y2-1;by++) setP(stu.x2-1,by,0.4+0.3*Math.sin(by*1.2),0.15+0.2*Math.sin(by*0.9),0.2+0.2*Math.sin(by*1.5));
  // Plant
  setP(stu.x1+1,stu.y1+1,0.2,0.5,0.15); setP(stu.x1+1,stu.y1+2,0.15,0.45,0.1); setP(stu.x1+1,stu.y1,0.3,0.2,0.12);

  // Garage: car, workbench, tools, shelving
  const gar=shRooms[0];
  fillRect(gar.x1+2,gar.y1,gar.x2-2,gar.y1+4,0.1,0.1,0.2); // car body (blue)
  fillRect(gar.x1+3,gar.y1+5,gar.x2-3,gar.y1+7,0.08,0.08,0.18); // car roof
  fillRect(gar.x1+4,gar.y1+5,gar.x2-4,gar.y1+6,0.2,0.28,0.4); // windows
  setP(gar.x1+2,gar.y1+2,0.7,0.7,0.2); setP(gar.x2-2,gar.y1+2,0.7,0.1,0.1); // lights
  setP(gar.x1+3,gar.y1,0.06,0.06,0.06); setP(gar.x2-3,gar.y1,0.06,0.06,0.06); // wheels
  setP(gar.x1+4,gar.y1,0.06,0.06,0.06); setP(gar.x2-4,gar.y1,0.06,0.06,0.06);
  // Tool board
  fillRect(gar.x1+1,gar.y2-4,gar.x1+4,gar.y2-1,0.22,0.22,0.2);
  setP(gar.x1+2,gar.y2-2,0.5,0.4,0.1); setP(gar.x1+3,gar.y2-3,0.4,0.4,0.45);
  // Workbench
  fillRect(gar.x2-4,gar.y1,gar.x2-1,gar.y1+3,0.28,0.22,0.12);

  // Bedroom1: king bed, nightstands, wardrobe, vanity, picture, rug
  const br1=shRooms[6];
  fillRect(br1.x1+1,br1.y1,br1.x1+1,br1.y1+1,0.18,0.1,0.06); // rug corner
  fillRect(br1.x1+2,br1.y1,br1.x1+12,br1.y1+3,0.24,0.18,0.1); // bed frame
  fillRect(br1.x1+2,br1.y1+4,br1.x1+12,br1.y1+6,0.55,0.3,0.5); // duvet (purple)
  fillRect(br1.x1+2,br1.y1+7,br1.x1+5,br1.y1+7,0.7,0.7,0.75); // pillow L
  fillRect(br1.x1+9,br1.y1+7,br1.x1+12,br1.y1+7,0.7,0.7,0.75); // pillow R
  // Nightstands with lamps
  fillRect(br1.x1+1,br1.y1,br1.x1+1,br1.y1+3,0.2,0.15,0.08);
  fillRect(br1.x1+13,br1.y1,br1.x1+13,br1.y1+3,0.2,0.15,0.08);
  // Wardrobe (big)
  fillRect(br1.x2-5,br1.y1,br1.x2-1,br1.y2-1,0.22,0.15,0.08);
  vLine(br1.x2-3,br1.y1,br1.y2-2,0.17,0.12,0.06); // door line
  setP(br1.x2-2,br1.y1+Math.floor((br1.y2-br1.y1)/2),0.4,0.35,0.2); // handle
  // Vanity/mirror
  fillRect(br1.x2-8,br1.y1,br1.x2-6,br1.y1+3,0.25,0.18,0.1);
  fillRect(br1.x2-8,br1.y1+4,br1.x2-6,br1.y1+6,0.35,0.4,0.45); // mirror
  // Picture on wall (colourful)
  fillRect(br1.x1+5,br1.y2-4,br1.x1+9,br1.y2-2,0.15,0.35,0.5);
  let br1Occ=false;
  for(const p of shPeople) if(p.targetRoom===6){br1Occ=true;break;}
  if(br1Occ&&isNight){ setP(br1.x1+1,br1.y1+4,0.4,0.32,0.12); setP(br1.x1+13,br1.y1+4,0.4,0.32,0.12); }

  // Bathroom: bath, toilet, sink, mirror, tiles, towel rack
  const bath=shRooms[7];
  fillRect(bath.x1+1,bath.y1,bath.x1+8,bath.y1+4,0.38,0.42,0.48); // bath (bigger)
  fillRect(bath.x1+2,bath.y1+1,bath.x1+7,bath.y1+3,0.4,0.55,0.65); // water
  fillRect(bath.x2-4,bath.y1,bath.x2-1,bath.y1+4,0.8,0.8,0.85); // toilet
  setP(bath.x2-2,bath.y1+4,0.6,0.6,0.65); // flush
  fillRect(bath.x2-7,bath.y1+5,bath.x2-4,bath.y1+8,0.6,0.6,0.65); // sink
  setP(bath.x2-5,bath.y1+8,0.4,0.45,0.5); // tap
  fillRect(bath.x2-8,bath.y2-5,bath.x2-4,bath.y2-1,0.35,0.4,0.48); // mirror
  // Towel rack
  hLine(bath.x1+1,bath.x1+3,bath.y2-2,0.15,0.12,0.1);
  setP(bath.x1+2,bath.y2-3,0.6,0.2,0.2); setP(bath.x1+2,bath.y2-4,0.55,0.18,0.18); // red towel
  // Tile effect
  for(let y=bath.y1;y<=bath.y2;y+=3) hLine(bath.x1,bath.x2,y,0.18,0.22,0.25);
  for(let x=bath.x1;x<=bath.x2;x+=4) vLine(x,bath.y1,bath.y2,0.16,0.2,0.22);

  // Bedroom2: bed, desk, gaming setup, posters
  const br2=shRooms[8];
  fillRect(br2.x1+2,br2.y1,br2.x1+9,br2.y1+3,0.22,0.16,0.1); // bed frame
  fillRect(br2.x1+2,br2.y1+4,br2.x1+9,br2.y1+5,0.3,0.45,0.6); // blue duvet
  fillRect(br2.x1+2,br2.y1+6,br2.x1+4,br2.y1+6,0.65,0.65,0.7); // pillow
  // Gaming desk
  fillRect(br2.x2-7,br2.y1,br2.x2-2,br2.y1+4,0.25,0.18,0.1);
  fillRect(br2.x2-6,br2.y1+5,br2.x2-3,br2.y1+8,0.08,0.08,0.12); // monitor
  let br2Occ=false; for(const p of shPeople) if(p.targetRoom===8){br2Occ=true;break;}
  if(br2Occ) fillRect(br2.x2-5,br2.y1+6,br2.x2-4,br2.y1+7,0.1,0.6,0.3); // screen on
  // Posters (colourful)
  fillRect(br2.x1+4,br2.y2-4,br2.x1+7,br2.y2-2,0.6,0.3,0.1);
  fillRect(br2.x1+9,br2.y2-3,br2.x1+11,br2.y2-1,0.1,0.4,0.6);
  // Bookshelf
  fillRect(br2.x2-2,br2.y1,br2.x2,br2.y2-2,0.24,0.16,0.08);
  for(let by=br2.y1;by<br2.y2-2;by++) setP(br2.x2-1,by,0.5,0.2+by*0.008,0.25);

  // Kids room: bunk bed, toy box, toys scattered, posters, desk, bean bag
  const kids=shRooms[9];
  // Bunk bed (colourful)
  fillRect(kids.x1+1,kids.y1,kids.x1+8,kids.y1+3,0.24,0.18,0.1);
  fillRect(kids.x1+1,kids.y1+4,kids.x1+8,kids.y1+5,0.45,0.6,0.35); // green blanket
  fillRect(kids.x1+1,kids.y1+8,kids.x1+8,kids.y1+9,0.24,0.18,0.1);
  fillRect(kids.x1+1,kids.y1+10,kids.x1+8,kids.y1+11,0.4,0.45,0.7); // blue blanket
  vLine(kids.x1+8,kids.y1,kids.y1+12,0.3,0.24,0.14); // post
  vLine(kids.x1+1,kids.y1,kids.y1+12,0.3,0.24,0.14); // post
  // Toy box (colourful)
  fillRect(kids.x1+10,kids.y1,kids.x1+14,kids.y1+3,0.6,0.3,0.35);
  // Scattered toys (lots)
  setP(kids.x1+15,kids.y1,0.9,0.2,0.2); setP(kids.x1+16,kids.y1,0.2,0.8,0.2);
  setP(kids.x1+14,kids.y1+1,0.2,0.2,0.9); setP(kids.x1+17,kids.y1,0.9,0.9,0.15);
  setP(kids.x1+13,kids.y1,0.8,0.4,0.8); setP(kids.x1+18,kids.y1+1,0.1,0.7,0.7);
  // Bean bag
  fillRect(kids.x2-6,kids.y1,kids.x2-4,kids.y1+3,0.55,0.25,0.5);
  // Posters (big, colourful)
  fillRect(kids.x2-7,kids.y2-5,kids.x2-3,kids.y2-1,0.55,0.3,0.6);
  fillRect(kids.x2-12,kids.y2-4,kids.x2-9,kids.y2-1,0.3,0.55,0.3);
  fillRect(kids.x1+4,kids.y2-3,kids.x1+7,kids.y2-1,0.6,0.5,0.15);
  // Desk
  fillRect(kids.x2-3,kids.y1,kids.x2-1,kids.y1+3,0.28,0.2,0.1);

  // Ensuite: shower, toilet, vanity
  const ens=shRooms[11];
  fillRect(ens.x1+1,ens.y1,ens.x1+5,ens.y1+7,0.24,0.3,0.35); // shower bigger
  vLine(ens.x1+6,ens.y1,ens.y1+8,0.35,0.4,0.5); // glass door
  setP(ens.x1+3,ens.y1+8,0.5,0.5,0.6); // shower head
  hLine(ens.x1+2,ens.x1+4,ens.y1+8,0.4,0.42,0.5); // shower arm
  fillRect(ens.x2-4,ens.y1,ens.x2-1,ens.y1+4,0.75,0.75,0.8); // toilet
  fillRect(ens.x2-6,ens.y1+5,ens.x2-4,ens.y1+7,0.55,0.55,0.6); // sink
  fillRect(ens.x2-7,ens.y2-4,ens.x2-4,ens.y2-1,0.3,0.38,0.42); // mirror

  // ── DRAW PEOPLE ──
  for(const p of shPeople){
    // Draw person (8px tall, 3px wide body)
    const px=Math.round(p.x), py=Math.round(p.y);
    const ph=p.h||7;
    const legAnim=p.walking?Math.sin(p.animFrame*3):0;

    if(p.sleeping){
      // Lying down
      for(let i=0;i<4;i++) setP(px+i,py+3,p.shirt[0]*(1-i*0.1),p.shirt[1]*(1-i*0.1),p.shirt[2]*(1-i*0.1));
      setP(px-1,py+3,p.skin[0],p.skin[1],p.skin[2]); // head
      setP(px-1,py+4,p.hair[0],p.hair[1],p.hair[2]);
      if(Math.sin(shT*2)>0.3){ setP(px+1,py+5,0.25,0.25,0.45); setP(px+2,py+6,0.2,0.2,0.35); }
    } else if(p.sitting){
      // Sitting figure (5px)
      setP(px,py+4,p.hair[0],p.hair[1],p.hair[2]); setP(px+1,py+4,p.hair[0],p.hair[1],p.hair[2]);
      setP(px,py+3,p.skin[0],p.skin[1],p.skin[2]); setP(px+1,py+3,p.skin[0]*0.9,p.skin[1]*0.9,p.skin[2]*0.9);
      fillRect(px-1,py+1,px+2,py+2,p.shirt[0],p.shirt[1],p.shirt[2]);
      setP(px,py,p.pants[0],p.pants[1],p.pants[2]); setP(px+1,py,p.pants[0],p.pants[1],p.pants[2]);
      // Arms resting
      setP(px-1,py+1,p.skin[0]*0.8,p.skin[1]*0.8,p.skin[2]*0.8);
      setP(px+2,py+1,p.skin[0]*0.8,p.skin[1]*0.8,p.skin[2]*0.8);
    } else {
      // Standing/walking (7px tall, 3px wide)
      // Hair
      setP(px,py+ph-1,p.hair[0],p.hair[1],p.hair[2]); setP(px+1,py+ph-1,p.hair[0],p.hair[1],p.hair[2]);
      // Head
      setP(px,py+ph-2,p.skin[0],p.skin[1],p.skin[2]); setP(px+1,py+ph-2,p.skin[0]*0.95,p.skin[1]*0.95,p.skin[2]*0.95);
      // Torso (3 wide)
      for(let ty=ph-3;ty>=ph-5;ty--){
        setP(px-1,py+ty,p.shirt[0]*0.85,p.shirt[1]*0.85,p.shirt[2]*0.85);
        setP(px,py+ty,p.shirt[0],p.shirt[1],p.shirt[2]);
        setP(px+1,py+ty,p.shirt[0]*0.9,p.shirt[1]*0.9,p.shirt[2]*0.9);
      }
      // Arms
      const armY=py+ph-3;
      if(p.walking){
        const armSwing=Math.round(legAnim*1.2);
        setP(px-2,armY+armSwing,p.skin[0]*0.85,p.skin[1]*0.85,p.skin[2]*0.85);
        setP(px+2,armY-armSwing,p.skin[0]*0.85,p.skin[1]*0.85,p.skin[2]*0.85);
      } else {
        setP(px-2,armY-1,p.skin[0]*0.8,p.skin[1]*0.8,p.skin[2]*0.8);
        setP(px+2,armY-1,p.skin[0]*0.8,p.skin[1]*0.8,p.skin[2]*0.8);
      }
      // Legs with walking animation
      const legOff=Math.round(legAnim*1.2);
      setP(px+legOff,py,p.pants[0],p.pants[1],p.pants[2]);
      setP(px-legOff,py,p.pants[0]*0.85,p.pants[1]*0.85,p.pants[2]*0.85);
      setP(px,py+1,p.pants[0]*0.9,p.pants[1]*0.9,p.pants[2]*0.9);
      setP(px+1,py+1,p.pants[0]*0.85,p.pants[1]*0.85,p.pants[2]*0.85);
      setP(px,py+2,p.pants[0]*0.8,p.pants[1]*0.8,p.pants[2]*0.8);
      setP(px+1,py+2,p.pants[0]*0.75,p.pants[1]*0.75,p.pants[2]*0.75);
    }
  }

  // ── EFFECTS ──
  // Particles (steam, dust motes)
  for(let i=shParticles.length-1;i>=0;i--){
    const pt=shParticles[i];
    pt.x+=pt.vx*dt; pt.y+=pt.vy*dt; pt.life-=dt;
    if(pt.life<=0){ shParticles.splice(i,1); continue; }
    const a=pt.life;
    setP(Math.round(pt.x),Math.round(pt.y),pt.r*a,pt.g*a,pt.b*a);
  }

  // Floating dust motes in lit rooms
  if(Math.random()<0.15){
    const ri=Math.floor(Math.random()*12);
    const rm=shRooms[ri];
    let occ=false; for(const p of shPeople) if(p.targetRoom===ri){occ=true;break;}
    if(occ) shParticles.push({
      x:rm.x1+Math.random()*(rm.x2-rm.x1), y:rm.y1+Math.random()*(rm.y2-rm.y1),
      vx:(Math.random()-0.5)*0.3, vy:0.2+Math.random()*0.3, life:3+Math.random()*3,
      r:0.15, g:0.14, b:0.08
    });
  }
  if(shParticles.length>60) shParticles.length=60;

  // Chimney smoke
  if(isNight||isDusk){
    const chimneyX=Math.floor(W*0.35);
    for(let s=0;s<8;s++){
      const sy=roof+3+s;
      const sx=chimneyX+Math.round(Math.sin(shT*0.8+s*0.7)*2);
      const fade=0.18*(1-s/8);
      setP(sx,sy,fade,fade,fade*0.85);
      setP(sx+1,sy,fade*0.7,fade*0.7,fade*0.6);
      setP(sx-1,sy,fade*0.4,fade*0.4,fade*0.35);
    }
    // Chimney structure
    fillRect(chimneyX-1,roof,chimneyX+2,roof+2,0.3,0.2,0.12);
  }

  // Stars
  if(isNight){
    for(let i=0;i<50;i++){
      const sx=(i*97+23)%W, sy=roof+3+(i*53+17)%(S-roof-4);
      const tw=0.12+0.1*Math.sin(shT*1.2+i*2.7);
      setP(sx,sy,tw,tw,tw*1.3);
    }
    // Shooting star occasionally
    if(Math.sin(shT*0.3)>0.98){
      const ssX=Math.floor(W*0.3+shT*20)%W;
      const ssY=S-3;
      for(let t=0;t<5;t++) setP(ssX-t*2,ssY-t,0.4*(1-t/5),0.4*(1-t/5),0.5*(1-t/5));
    }
  }

  // Moon
  if(isNight){
    const mx=Math.floor(W*0.8), my=S-8;
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
      if(dx*dx+dy*dy<=5) setP(mx+dx,my+dy,0.25,0.25,0.2);
    }
    setP(mx,my,0.4,0.4,0.32); setP(mx-1,my,0.35,0.35,0.28);
    // Moon glow
    for(let dy=-4;dy<=4;dy++) for(let dx=-4;dx<=4;dx++){
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>2&&d<5) setP(mx+dx,my+dy,0.03,0.03,0.05);
    }
  }

  // Window light cones (visible at night from outside - ground level)
  if(isNight){
    for(let ri=0;ri<shRooms.length;ri++){
      let occ=false; for(const p of shPeople) if(p.targetRoom===ri){occ=true;break;}
      if(!occ) continue;
      const rm=shRooms[ri];
      const wx=Math.floor((rm.x1+rm.x2)/2);
      // Light spilling down from window onto ground
      for(let d=1;d<4;d++){
        const fade=0.06*(1-d/4);
        setP(wx-d,ground-1,fade*0.8,fade*0.7,fade*0.3);
        setP(wx+d,ground-1,fade*0.8,fade*0.7,fade*0.3);
        setP(wx,ground-1,fade,fade*0.9,fade*0.4);
      }
    }
  }

  // ── OUTPUT to cube faces (3D only, 2D handled above) ──
  {
    for(let fIdx=0;fIdx<4;fIdx++){
      const face=VID_FACE_ORDER[fIdx];
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const pu=S-1-u;
        const sx=fIdx*S+pu;
        const i=(v*W+sx)*3;
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        colBuf[idx*3]=shBuf[i]/255; colBuf[idx*3+1]=shBuf[i+1]/255; colBuf[idx*3+2]=shBuf[i+2]/255;
      }
    }
    // Top: night sky or day sky
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[4][v*S+u]; if(idx<0) continue;
      const d=Math.sqrt((u-S/2)*(u-S/2)+(v-S/2)*(v-S/2))/(S*0.7);
      colBuf[idx*3]=skyR*(1+d*0.5); colBuf[idx*3+1]=skyG*(1+d*0.3); colBuf[idx*3+2]=skyB*(1+d*0.8);
    }
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[5][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=0.04; colBuf[idx*3+1]=0.05; colBuf[idx*3+2]=0.02;
    }
  }
}

// ═══════════════════════════════════════════════════
//  RETRO — ZX Spectrum style game demos
//  Each face shows a different classic game simulation
// ═══════════════════════════════════════════════════
let retroT=0, retroGames=[], retroInit=false, retroFaceBuf=null;
let retroSelectedGame=-1, retroRotateInterval=8; // -1 = auto rotate
let retroAutoGames=[0,1,2,3,4,5,6,7,8]; // Sam Fox (9) excluded by default
let retroLastGameIdx=-1, retroSplashT=0;
let dcSplashData=null;
let jpSplashData=null;
let mmSplashData=null;
let orSplashData=null;
let jswSplashData=null;
let rtSplashData=null;
let wolfSplashData=null;
let q2SplashData=null;
let siSplashData=null;
let sfSplashData=null;
let sfGameBgData=null;
const DC_SPLASH_B64="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KwAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAdAAAHQAAIQAAYwAAdQAA/wAA9QAACQAAbQAAEAAAFQAAegAAAwAAeAAALQAAAQAAhAAA/wAA/wAAeAAAYAAAKQAABQAACQAAgQAA/wAA/wAAeAAAYQAAEwAAGQAAZAAAdAAA/wAA/wAAPQAAdQAA/wAA8QAAGAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAdAAAGwAAJgAAagAAagAAfgAAXAAAAwAAfAAAxwAAyAAAhQAAAAAAeAAAKwAAAAAAewAAcwAAeAAAbwAAYgAAKgAAAAAAAAAAewAAcgAAeQAAbAAAbwAAyAAAyQAAfgAAEwAAYQAAgQAAcwAAaAAAfgAAWwAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAcwEBFQAAGgAAaQAAYwAAEwAAAAAAAAAAgAAAyAAAyQAAhQAAAAAAeAAAKgAAAAAAdAAACgAAEwAAagAAYwAAHgAACAAAJwAAbQAACwAAFAAAZgAAcQAAyQAAygAAfgAAIAAAAAAAFAAAZwAAYwAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAeAAAJAAAYgAAgQAAXwAAOgAAFQAACAAAcAAADAAAEgAAeQAAAAAAdQAAKQAAAAAAdAAAHQAAJgAAaQAAagAALQAANAAAcgAAYwAAIAAAJgAAagAAYgAADwAAFQAAZwAAbQAAMQAANAAAbAAAZAAAOQAAFQAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAMDAAMDfBYW/wYG+wAAOQAAfwAA/wAA/wAAeAAAaQAAIgAAJAAAhAAAAAAAfgAALQAAAAAAfAAA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A8ADA8ADA8ADAb4BAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAA";

const JP_SPLASH_B64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MM_SPLASH_B64="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AP8AAP8AAP8AAP8AAZMFAAAAAAQAAAAAAAAAAQAAAAAAgAQEtwQCsgQCtAQDtAQDtAQCtAQDtAQCtAQCtAQDtAQCtAQDtAQDtAQCtAQDtAQDtAQCtQQDKZIGBbcGCLMGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrUGBrIGB7gGB2IGAAAAAAMAAAAAAAAAAAAAAAAAAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAEBAAABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAQABAAAAAAAAAAAAAAAAAAAAAAAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAgAAAAIAAAIAAAIAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAIAAAIAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const OR_SPLASH_B64='AQmPAQiOAQiKAQiQAQmNAQiOAQiQAQmOAQiNAQiOAQiQAQiMAQiNAQiLAQiMAQiNAQiJAQmNAQiMAQiLAQiKAQmNAQiMAQiLAQiNAQiJAQmPAQiNAQiKAQiNAQiLAQiLAQiMAQiRAQiMAQiPAQiOAQiKAQiQAQiKAQiNAQiNAQiLAQiPAQmMAQmNAQiMAQiPAQiMAQiOAQiNAQiKAQiOAQiNAQiOAQiNAQiNAQiMAQmMAQmNAQmMAAmOAQmKAQiLAQmnAQmoAQmgAQqqAQmjAQmlAQmpAQmpAQmjAQmkAQmrAQmhAQmpAQiiAQmjAQirAQigAQmqAQmkAQmjAQmhAQmpAQmkAQqkAQqqAQihAQmpAQmlAQijAQmqAQmhAQmkAQmjAQmsAQiiAQmnAQmmAQmhAQmrAQmfAQmoAQmmAQmgAQmoAQmnAQqmAQmjAQmtAQmiAQmoAQmnAQmhAQqrAQmiAQmnAQmnAQmhAQmgAQmkAQmnAQigAQqpAQmiAQikAQq2AQq2AQquAgq3AQqwAgqyAQq3AQq3AQqyAQqyAQq4AQqvAQq5AQqxAQqwAQq5AQqvAQq4AQqxAQuxAQuwAQu4AQqzAQqwAQu4AgmvAQq2AQqyAQmyAQq5AQqvAQqzAQqxAQq5AQqwAgq2AQq1AQqwAQq6AQqtAQm2AQm1AQqvAQq2AQq3AQq0AQmwAQq7AQqvAQu2AQq1AQmvAQq5AQqvAQq2AQu5AQqxAQqwAQm0AQq2AQqwAQq4AQqxAQqzAQzYAQvWAQvNAgzWBA7QAQvTAw3XBA3VAQvPAQvRAQvWAQvNAQvWAQrPAQvPAQvVAQvLAQvVAQvQAQvNAQvNAQvWAQvPAQvQAQvXAQvNAQvTAQvRAQvPAQvVAQvPAQvOAQvOAQvXAQvLAQvVAQvRAQvMAQvXAQvLAQvTAQvRAQvLAgvWAgvVAQvRAQvLAgzWAQvOAQzUAgzUAQvOAQzWAgzOAQzTAQzUAQvPAQvPAQvTAQvVAQvNAQzXAQvNAgvRAA73AA74AhD1AAr8AAH7AQ7uAAT3AAT+AxH1AA72AA74AA/3AQ//AQ/+AQ//AQ//AQ/9AQ//AQ//ARD/AQ/+AQ//AQ//AQ//AQ//AQ//AQ//AQ//AQ//AQ//AQ/+AQ/9ARD+AQ//AQ//ARD/AQ/+AQ/9ARD/AQ//AQ//AQ/+ARD/AQ//AQ//ARD/ARD+AA/7AA/2AA72AA75AQ/3AQ/8AQ/4AA/5AA/6AQ/4AQ75AA/8AQ/6AQ/2AA//AQ7lAgmpAA7/ARH/AAj/Ehznd3WTkY2BjIeCNjvHAAP/AhH+ABD/AQ3jAQVZAQVYAgVRAQVRAQZWAQVWAQVSAAVNAQVUAQVVAQVOAQVUAQVVAQVPAQVOAQVOAQVNAQVTAQVXAQVWAQVSAQVOAQVOAQZRAQZXAQVXAQVSAQVOAQVWAQVVAQVOAgVRAQVTAQVMAQVVAwmNAgqdAwmoAA3kABD/AQmgAgiPAgvDAgqzAgiJAQrCAQmmAgiGAgvEAQvAAQmVAQzIARD9AQv+Fx3kpqBjwLQ/dHF9jIh3wrZUSEu5AAT/AhL/AAzQAAAAAAAAAgAOAQAQAAAAAAAAAgAHAQAdAQAAAQAAAQAhAAAEAQAEAQAdAQAeAAAdAQAfAgAKAAAAAAAAAQAGAQAbAAAcAQABAQAAAQAAAQAGAQAiAQAAAQAAAgAbAgAIAAAGAgAbAAAFAgROAgNRAwM7AQzUAA/+Awd0AwQ+AgmeAwh9AwVGAQu3AQZoAwVPAwmZAgdpAgRAAQzJAhH+AAX/gn6ExLg01soWyr0ycW94YmF8tatbFh7hAAv/Ag7TAQAFAQQsAw10AhTDAgtGAQABAglbBRnXAwUsAws4Axa6AgphAgpFAyTnAhjqAhjkAyT8Ag14AAADAQAEBQlBAxCmAyL4Ahm+Ag06AQAAAwNHAxboAgxNAwUYBRSbAhCGAwQyBBOoAhKxAhDjAha1AQQLAAzNABD/AgeIAwRUAgmVAwiCBARPAgmtAQZvAwViAwiLAgViAwVWAQmVAAf/JSvYy74/mZNIcmcUzLsKrKANUU4wdXN8YWGlAAT/AwnJBR8oC3yXCoemCpDECoWuBBUXCG6FC4+9BA0UBio0Cpi7CmN8EW+EDm+VCoS1C3qpDnSfCn6cAQEBAQAADEhVC4yzDWSNCneoCZe6BSAhCVVmCp3MBSU1BgsNDXmWCW6QC0JKC4alCJXGCJnLCY+9ClRlAAPEABH/AQzTAgvHAQ3kAQ3eAgvGAQ3gAQ3YAQvGAQvNAQ3WAgvNAQ3cAAP/NUzKzMM4raFEbmIlyLkMoZQNaWQqTVOzbG2dAxL+AAPJBVNjBtTpCG57CElLCdHmBGl5CYORBq6/BAEBBhARCsDWCIiXCSUpAgAABpamB6CwAwwIBS0xAAMGAAAAB1tnD8XaAiMjA2huB7fMCDc9BXaGC7PGBhcYAgcIB6e8B3GAB1tnCcfcBneCCWVuBsbXBl5pAQXIABH/AA//AA//AA//AA//ABD/AA//AA//ABD/ABD/AA//AA//AA//AAT/KF7S19MczrsYiHsbo5kWkIQSY1wqOTx5cXBuDBv8AAzVJiYpIEFGCRcbAAAAEVBaGE5XICEkKTs/AAQHAQkLGU1WHDY7AQAAAgQGHzQ3JjE3BQkMAAAAAAEBAgAAKC0vCzxFIk1VDjhALTU4DR4hMSouHSgsAQ4RAAoMKDk9EysyGyYmFVhiFyIlDgMHKUFHHCUqAAzPAA//AA/8AA/9AA/+AA/+AA/9AA/+AA/+AA/9AA/9AA/9AA/9AA/9AAP/NF/DmJQNh3kVkYcRin4ScWgRYlkRWlIFc2w/DBn/AAnQZgoDnwYAXwgEVgoFigQASgIAgAsBmAYAbw4Egg8EfwQAVgUAAQIDEwMDnAsApwwALAYDAAICAQAAAgAAewsCfQYAfA0DmQkAWAMAAAAAhwwEoAoBfw0Ffg8FpAkAZAcAbwsDngYAOAUCDAQGmgcAhQsDBQ3PAA//ARD9ABD/ABD/ABD/AA//ABD/ABD/AA//ABD/ABD/ABD/ABD+AAn/N0K9bmUQd2scbWEQaGAObmUVWVEUfXIPdm8+AAf/AQ7SIwUH1xgG6xUE7hQC4RkIHAQFcA0F9BwG8hIC/hUB4RoHPgcEAAAAHAQDvg4F8RMFTAgCAAAABAAAAAAArg8D4hMEWwoFzxUHrg0CDgAATgoF8xsG/BQC9hMC8hoGYwwGmQwC9BUGHQMCAAEC1BIDyREEBAzOABD/AQz9AAv+AAz/AAv/AA7/AAn/AAn/ABD+AA3/AAv/AAr/AAz+ARH/Dhjhh4FMtac6y7sOt6gXfXMMRkQufnxrPkakAAf/BA3QAAEGTBIG0XYR03QQSxAGAAEDEgIEokkQ3IUR2oIQhzkOBAEDAAECFA8IklAZ4oQSPyYIAAECBQMCAAECp2QO24MSDAcFOxsNz3IYak4OAAADkT4P2YEP2oQPoUkQBQACmF8R5I8VGA4GAAEFzX4Tv3cRAAzNAAj/BDT7BEL+ART7ARn7BjX6CV72Clv2DVT1Ax79BBf9BUX7C2L0Bjb6AAD/XmGxvrEyv60HsJsHdmUBi34QeHiXAAb/AxT/BkDNAQEBAAAABQ4ABQ4AAAAAAQAAAAAAAAAADBQAChIAAAAAAAAAAAAAAgEAEBUDDRYBBQUAAAAAAQAAAAAACg8BDBQAAQAAAgQAEBgDCwsAAAAAAAAACxEADBMAAAAAAAAACw8ADxcCAgAAAAAADRUADBMBAAvNAAP/A0L6BGj6CYv4C5z3Cl30DHvyDXDyC3LxCVn4C2j2CXv2DKvxBGj7AxX8Awr7V1qUk5YncYcyp68kr6I8GB/iAQf+AyX/BWXUAgocBAkWAQYXAQYYBAgXAgkYAggXBAgZAAMbAAQaBAgZAggYAgkYAQcXAAQZAAMZAQcZAgkZAQgXAQgYAAQYAAQZAggZAggYAAMYAAUZAwsYBQgXAAQbAAQYBAcXAwkaAAUaAAIZAggYAwkZAAIWAAQaARbSARH/CEn0CmvxBlf2BlT0Cl/yCmDyCEL0CV/zB0P3CGf1Bkr1Cm/vA4L9BVX6AAj+AAL6IkTeKWbkKlfcCBXnAAT/AhD9BGL8BHr5BW7nBW/lBnDlB3DlBm/kBW/mBW7lBW7lB3DlB2/mBm7lBW/mBXDnBm/lB3DmB2/mBm7lBm/nBW/lBW/lB2/lB3DmBm7lBm/kBnDlBm/mBnDmBm/kB2/lB3DlBm/kBW/nBm/nB3DmBm7lBm/mBnDlBm/mBHD4BHH9BG/5BGz4BGn7A2j8A2n7BGz5BG76A2v6BG76A2z6A2v7A2j5AXX9A3f8BVH5BCf+AAD/AAD/AAD/AAf/BBv7BE38Anv8AnX9Anf/Anf/A3f/Anf/Anj/AXf/AXf/AXf/Anj/Anf/Anj/Anj/AXf/Anj/Anj/Anj/Anj/AXf/Anj/AXj/Anj/Anf/Ann/AXf/AXf/Anj/AXf/Anj/Anj/Anj/Ann/AXj/AXf/Anf/Anj/AXj/Ann/AXj/Anj9A3f7A3j8A3n8Ann8Anj9Anj9Anj9A3j8Anj9Anj8Anf9Ann8Anr9BJD5BY/4BZz4B4z3CXf4CHX4CHH4CHH2B4/5BZj5BY76BZb6BY33BJL4BZL3BY74BJb4BI/4BZP5BZT4BZX4BY74BJP4BJP4BI74BZX4BY73BZH3BJP3BY74BJT4BJP4BZT4BY73BZT4BI/4BJD4BJT4BY74BJX3BZD3BZH3BZT4BI/4BZD4BpH3BJP3BY74BZP4BZD4BJD6BZP4BY74BZP5BZD5BZD5BJL6BJP5BZL4BZD5BZT6BI36BJP5BZP5A633BKz2BLP2BKrzBLf1BLb2BLP1BbD1A7L3A6/2Bar4BLX5Ban2A7D3BLH3Ban3A7b4A6v3BLH4BLL5A7T4BKr3BLH4A7H4A6r4BLX5BKr2BbD2A7L3BKr3A7T4A7H4BLP4BKv1BbT4BKz3BK/4A7P5BKn3BLX4BK72A6/2BLP4A6v3BKv3BK/2A7T3Ban2BLT5BK34BK74BLX4BKr1BLP4BK/4BK73BLT5A7P4BK/2BK33BLX4BKj4A7P4BrP5BKL4BKP5BKz/BaD/BKb/BKP/BKD/BZ/+A6b2BKb2BKD3A6v5BZ/2BKf4BKj2BZ/2BKr4BKH2BKb3BKf4BKr3BKD2BKb3A6f4BKD3BKv3BKD2BKb2A6j3BJ/3BKn5A6f4BKf3BZ/1BKv4BKL2BKX4A6n4BJ/2BKr4BaP1BKT2BKj4BKD3A6H2BKT2A6n3BZ72A6r3BKP3BKP3BKr4BZ/1BKn3BKP3BKP3BKr4BKn3BKP2BKL3BKv4BJ/3BKf3Bqj3A8H6A7/VArteAr1iA8NhA8NiA79cA71/AsX3AsT3A8H1A8b4A771A8P3A8L2BL71A8X3A771A8H2A8P3A8P3A771A8L3A8P4A773A8X4A8H3A8P3A8T4A773A8T5A8P4A8T4A8D2A8X4A8D3A8P4A8X4A7/2A8X5BMD3A8H3A8P4A732A7/1A8D1A8L3A731A8P2A7/1BL/1BMP2A7/3A8X5A8H3A8L3A8X4A8X4A8L3A8L3A8X4A7/3A8T5BMX5AOn/AOe7AdoABLUABK0AB58AB6EABMUqAuz/Aen/AO3/AO3/APX/APT/APT/APP/APT/APT/APX/APT/APT/APT/AO7/Aez/Au//Ae7/Au//Ae3/Au7/Ae7/Ae7/Ae7/Au//Au//Au7/Au7/Au7/Au7/Au7/Au7/Ae3/Ae3/Auz/AvT/Afj/APf/APb/APb/APb/Aff/APX/APT/AO3/AOj/AOj/AOj/AOf/AOj/AOj/AOj/AOj/AOj/AOn/AOn/AOb+AtnGBZMGBq0NCIQOCZARCWwJD1IoC3KEDJieAs/UBMrXEZSlEJusEJmtEJmsD5irEZqrEZqrEZqsD5mqFaCxBcniANDrAMvlAMvlAMjjAMrlAMrkAM/qAM7pAMzmAMrlAMnkAMznAMrlAMnlAMrkAMnkAMvmANHrAMnkAMrkAJ2xA4iaCJKlCpSlDJenCJGiBI6fDJapEZWnBMXeAOj+AebwAenrAOftAubwA+TxAubvAeTuAOXrAOH7AOP/AO7/BJKRBo8BCY0PCIQMA4EGBYoIDEgQC4QTDIsbAJwWJKg+28XM3dTS3NHQ4NbV4NXUzMC/0cXEzcHAyby7n5KRYHZ7eZmghqeti6uylra9iqivk7G4epmfe5uhi6uylra8l7e9haSrjayykrG4lra9haathaasb5CXiqqxaIqRj4+SqpqaoJSUs6enuq+vxru7vrOy1c3N4MrII6+/AO3/BMBVA7skBqItCX4qCYMsBZAsBaIpAsojAOfMAOT/A9H0CJBsBJUFAxMACYoOCF8KBYYICGQLCGIJC2MJAHMAMowr//7/////////+vv83d3f+/v+////////gICCYV9iWVJTR0BA//z7sKqpXVdXbGVlRD09pZ2erKWmYFpadW9viIGB18/Q0cnJfXZ2YlxcRD4+qKKiv7m5amNjbGZmVFVWl5mc9fX3/Pv+////////////6urr2s3MJLzUAsfkDn0mB08ADk8KCXwEB5kDBo0EBbMDBYMAA8i/AOv/A7HPC3JkAycKCzsgBjgIBCoECoENCXELClIJDjcZBVEhJWtD0sbS2tvdzczOzMzOvb2/vLu//Pz+0tHUAAAA3dve+Pj6SUpM1NXXWVtcX2BiYWJjTE1P4OLjXmBhfX6Atre5Jycq/P3+7+/yU1RWxcfIV1haX2Fiq6yuQEFDYmNlXl5hQ0JE3tve////+vf51NHUqKOmoJyew7e4JKuVA5mCDI4jCZoLC1UOBIwJBG4IC4EPCGMOBqUCBYV6Aer/AqnACElTAgoPDKm7CSQzAhMACYgNBlMIB3oEC0gpCJanC2Z2i4qNysjLzczO1tTXuLa5jIqNrauuube6CgkKeXh6sK+wzczO9vX3+vn6zMvNExMTwsLD9fX1MTAxqaep8/H0IiIj2trb////SUlKzc3NiIiIKyor4d/hyMbKExITtbS19PP1ysnLwL7BtbO2qqeqw8HD8fDx2s/YHmYdBGoEDEoMB0gJBmkICHwJB1AKCIENAxEFBXoLCY5rAsXqArHJCoucA0dRBLHIEF5pDkZJB18FBjMJC4sKClkEBKG0CUJOqaCgy8rNiYeKrqyvsK6xjoyPiYeKoqCjgX+CX11gUlBTHBsdoJ6hs7G0cnBzBgYGnp6gpKOmJyYndnR3iIaJJiUnlJWW0tLUOjo7W1tbGxsbd3d3oqCjlZOWCgkLZWNmpKKlh4WIk5GUwsHD/f39////x8fIfHF8DlkOCGECCzMLB1wJB3IKDH0OAhMABR8DC1sCAw8FClVXBbbQAOr/A7vTBcffBo2eC4SUBpGnCGgHCmYKDVg6Cah+Bai9Cj5Jh3x8ycjMMC4wNjQ3fnx/8/Lz////4+LlU1JU5uXn5+boFxYXnJqdzs3Pa2lsBAQEjo6QZGNpCgoLZGNmZ2ZpGBcZVVVXvL2/BQUGmZmZLS4ucXFy3t3f1dTWFBMVjYyOz87RwL/C4N7h////1tTWqqirmJaYmpmcD149Bp5wC0gUCYkKBUQHB38JBx8SCjc5Brh9AhMPB1dqBKi+AOP+AOb/AOj/CZCjCJaqA7TBB28CBpQVEniDBtL1AMXfIVZg0s7Q4uHkt7W3Ojk6fnp9rquu5ePm//r7XlpdVlVWY2NkZGJl5eTn////qqqsDQ8Pv8HCvr/CFBUV4uLk////ICAhgoOF/v//FhcXzs/PoKKiMTIz////7OztGBcZoJ6g////////+vn6ysjKpaOmvLu+/vz+sLGyAldqCZq2C28KC34KCj0MCE8ED19wD2NzBJ+7A2x8BJ6wAsTbAOP+AOP+AOL+B3GACI6iAbjECFgHBLBEDXN+B8LbAOP2I6O2qaChrq6wsK6wsK6yqKqsqamre3V6YHV0gISDiYKKopqktaq2qpudr6Ohm4+Nj4SEsqen0MfGsKamxLm5zcLCtKqqtKqqyb+/sKanyL6+wbW3urCy6ODm4dvjwsDE0MrUtcXLjImMbm5ygoCDnpyfsrGznJmZYmlsDVxnBbfIBrhFC1gVCHwOCnIHBKm9DIidCZGiAuL6AdDqAez/AOP+AOf/Adr0CneJBpSpAeL0CHJ0BMjUB4ygBbzTAPf/ArjPISUnUVBTYmJmWFld2bGsxaijB2B0AImGAW8NE1EXDy0NCWghC5WdCo2eCYuaDpChCYudCYudEpSmCoydCImbFJaoDI6gDY6gEpSmCoydCYqeFJyjF3gxGzkbIGMjHXgqA3uFAGx+J0NIYFlbfX2BdHJ1joyOko+SFCguAs7lBcvXEHt0BJ4fCGIGA7DDC5itB4aXAOX+AOf/AOT+AOP+AOn/A83mDm9/CbXLAOz/A7TPAdj2Ad73At33AOz/BcDWdGttdmxsZ15fcnFz9Hdq3mpdCdfzCLm/CzcGBmIHDHgLDXUYAtbmAPT/AO3/AO3/AO//AO//AO3/AO//APD/AO3/AO7/APD/AOz/AO3/APX/ANPiCXIQCnQGBF0CAjUBCbzAA9v8V21xjoKDgn5/qqeog4GEzbq4PHyEAOz+B7zaDHSAA7MtCFoAA8fFCX+UB3iFAOT+AOP+AOX/AOP+AOr/BMvjCZOmBbnQAOX+AOj/AOX/AOb/AOT/AOn/AMvkIFtnJEFHGkxVNE9X+9HP2MLDBtDpA4KPCigjBlIdDmIXCUERBLjOAO//AOb/AOX/AOD7AOH7AOH7AOH7AOH7AOH7AOH7AOH8AOf/AOb/APD/BLfODUM1DGUvBlEiCioiBoCLAej8MmJrdGprX2ZpZWltZG5zhoWHJHB8APD/BMXdBKm4AsV1Bn8xAeDYCpKuC3yMANPtAOj/AeT+AOP9AOn/BM/oDJCiBqO5AOn/AOL9AOT/AOT+AOP+AuH8AvD/Aqm/Cn+TAMDaMGBp96+l1JmTB8nfA7bLCmRxC1lOClkTBZsqAeTyBqS9CZmrBMzlAOb9AOP+AOT/AOT/AOT/AOT/AOP+AOb9BMvjCJitB6a8AeX+B6G3DF5uC1pmCmdvB7DGAOv+AMHZAoKSCnGDCkdVC2FuA4OXANLlAOT9AOT/AOn/Ad36As7pAOH7C5CmDX6SAdDoAOn/AeT+AOP9AOn/A9DoDmh2CKnAAOn/AOP9AOT/AOT/AOX/AOP/AO3/AJGlAHyMAN76JY+e/3pw2HRtBcziAPT/B32XC3l4CHcAAcYpBJydD0hYFE5WC3F/AOz/AOL9AOT/AOT/AOT/AOT/AOL9AOz/CnCAFE9bEUlUBJ+0AdLpCICTC3mIB4GUAPD/AOL+APD/APX/BMfgCXWHCXWIBqO6Afb/AOH8AOT/AOP+AOX/AOn/AOD5CZmuC3KCAdDnAOn/AeT+AOP9AOr/BMzkDmRzCK7FAOf/AOP+AOP+AOr/A8nhMICLP5SfOWx2R2ZtMoaSToqX7e3f0tzWB8LbAOP9C3SFBae9A8iXAeWxB6/EDFVhDU1XEIqZA9PsAOj/AOL+AOT/AOT/AOL+Aej/BNLqDIubCUhUC05ZCLLKAOn/A8zlBaa7CHSBAd75AN74EXGBIG15E296HklQKkBHHVJZAtDnAOj/AOP+AOT/AOT+AOL9AOj/Bq3FDWFvAs7kAOn/AeT+AOL8AO//Aa3CDGp6CLXNAOb/AOP+AeL9AOr/EcPYs6akkoOCwLe3zcnIuamprJ6if+qFZ85zEsXnAOT8DmZzA8TbAO3/AOb/Ad/6BGRxCLLHCTI6C0JQBKO5APP/AOH8AOH9APL/BKC3C0BJCDQ6B67FBl5rA+L9AOP+AO3/A8HYCWV1AuP8ANLtUF1kfWhpint/rqWpmZOUraeqAb/VAOz/AOP9AOT/AOT/AOP+AOX/BbLKC2p3ArDFAO7/AeP8AOL8AO79Aaa7C1xqCbrSAOP9AOH8AeH8AOn9Db/W1dbZzM3Pz8/Su7u9/P7+xcDIfsVyfrd4EMHgAOT9EG19A8PaAOn8AOr8AsLZBGNxBNDmC0lWCTE6CYSUAs7hAOX+AOb+A87hDIKYCC82CktTBNLnA1pmAcDXAOn/AOr+A8DXC25/AuH7ANHsV3J7gnx+gIKGbWxwhYOGdXt+CMfcAOf9AOL8AOT/AOT/AOP+AOT/BbnUC11rA6vAAPD/AeL8A+L7A/b/ArnODV5uCbTMAu//Auz/Auj/APH/FM7io6Kjn52gpaSln56g8fDxubq8IHyLIJWoANDnAuP8DFdnA77UAOj9AOf8AsHWCYGUAfD/BltoBbHHB4mbBjhDAeD5Ad/4BjhACY2gBrDGBFxqAfP/BnGAAb/XAOn9AOj8ArvRCFhnA+r/ANz4YX6Fm5CTtra4WlpcIB4fJywvEdrwAPH/AOf/AOP+AOL9AOH7AOP8Ba/HDF9sBLXLAOv8AeH6CH6UB4icA6G9DZywCaS7A5mxALrZAMroAcngB6C56OzvzsrOSEZN09LUe3Z7coWMB+j/AP7/AvH/AuD9D4WYAsbgAfH/Afb/A9HpB3+QA+3/BVJeA+n/A8fjB7/XAfT/AfT/CL/WA8rlA+b/CFRhBe//CW9+BsvjBPT/Aff/A8bfC4CYCMPaAGp8cn2D2dPYtbS4v77BbGpsrbG0EpGlBbjQBtDqAun/BO7/A+7/AfT/BbjRDpapBsPcAvv/A/D/JVhCG1RNGzksAE1eEXiAI19MP14yJE47Ez8+OksmcnVtUE1TbmtYYFxfcmdMfJaACH+QBoKRDGlyE1xeBz1LF1NQC251A5upBXqJDTQyBk5bAiQvBpupB4SPBImcAaG5AaO4BombDIaRBZmnAiQtBkdUBBYaAkVTAVhuCIucCldgDTk9DRkWCAAAODYzWFZVS0lLYF5geHZ5Xl1iAwAABgkMBBgdBEFMAkhYAHaLAKK4A4CQAU1aAHKHAKK3AJqxWlAJSUYPcGIMalcEQjkLbmkUamQNXlUMZF4OcGcORj4ASUUAsaMCX1cAIBsHJB4GMR8APi4ASjkDOC0BSkAHSjcBPS4APzIETkAFRD0KX0oANi0JY1kLS0IFIBUBIxcBJxoAHxQCMCcDVEoGQzcFbFYAHBYEGg0AIxMAEAIAFwoAIxsGIxsHJiQNHhsEQz4AQ0E3c3F1Y2Ficm91V1EhLysHCQMDaVQAi3AAhnIAjX4BfGsEZ1YEdWcDloUAkX0AZFwPR0ESOTYTopkSjH4NaFwNfHIPLSkNgncRSEIMYVkVfnMV2MQCmY0ORkAQODYNU00ZPDgPExQJCgwGdGsSUUsTcmsRp5oOmYsJgXgPnJMUWlQVMiwNXVYOPzwOWVMJXlgMOjcRSEINMCwObmgUj4YSdm0Nj4ULwbUKqaAJdm4UOzURSUMNMy0KHBgLRT8IY2FjoJ6riIaHkI6TVFAxUk4MX1kWSkgMi4QSjIEOq5wNjIETcmkYjoIP1MQKz78Mdm0OaF4SY1wTd24MkIUQZFsSU0wMPDUKQTcOXlYTTUYOaF0Tz7sIkYYNZV4VTksRW1QMf3QSdm0Wc2oTOTIOb2YStqUK2MYGwrEOSUELSEANV04Ne3EMPjkJRD0KgHQIfHINLigLXFQOfXILXVQMNC8NbWMSyLoP1MUHtacGeG8NUEgReHANl4oSdmwTqJgLpZgVeXEiGhkeNzMdU0wRT0oMamMQHx0LS0cMXFMKSUILZFoSW1MNNzQKYlkNXVQQcmoRaWERqZoRR0ITbmQaTUcUS0UOSEMPWFART0wPVE4TUkcQTUYIU00RCAcEEA0D9OgNjYIPQjsMPzkMYVkPdm0QPzcIX1UPY1kTQjsKfHAKk4cLfXQRe3MTgncIh3sIh3sLfnMNfHMYenALjYEIc2sJbmYQZF8SLSkJQTsLb2YQcGcKXFUGdW0QdGwQa2MF5NMCcGYBIh4EJSIE0L4LbGMJAAAAHRkGem4Nem4LX1QNbGEOgXYQS0QLY1gHYloJLykMbWURjoERT0cSi34XZFkPTUYNJyUNOTUNamIRUUgNR0EOAAAEMC0QHBkIAwIDgXUQZV0UT0kOHBkGaGAQHRwHDg4FUUgLeW8KjIELin0LYVgNCgcGcmoNh3sHgnYIgHQLjYANPzgIGxoIgHYMiHwIhHoJfHQNODIKDw4GIB4Ib2YQn5ESJiMHDAoHHxsIb2YIU0wKiH4VKigLf3MKXVQLAQEAXFUKybcG2MMDyrgHj4EOg3gMZlwNjX8KaV8MeW0LLyoKOTMOhHkRX1UPzrwQnJANc2wLAQADTEMJk4gKRD4HEhMKNzMOEhAEAwMEcmcSk4YWyLoK8eYJd2sPOTQNaWAKb2cGbGQFamEGa2EHcmcKSD8JbmQHcWYEb2UEb2QGcWcHZlwJj4MNZ2AKaF8HbWIGbmUIc2kJaWELQTwIYFYSk4gVGBUFBAMEkYMRf3UJZ14OLSkJKiUGd24QCwoEAAABd24M5tQG//UA4tIHrp8P08IU2MkL//YA9+UG5tcJenAOopUVnZAVgngOvK8N8egIqZsRWF0Pko4SqZwOeXANAAACPzwOKikMERAMnZATn5AS8N4G//cAzrwPmYoRYFcFaWAGZV4GZFwHlowFuasHdGsMVk8KYFcIZ18IaV8KW1IIYFkKe3EHopMKU0wJbWMHaV8HZl4HaGAGcGYGYFYHamENJyYKFRMHlogQu6sVVEkMAAAFFRMOg3gNRUELAwMFgHYXrJ8M7+YGvK0Pj4ETm44W2ssJ//oA//IA2ssJr6EPh3oSs6QUkYcNT0oOh4AJOCYMq1kPl1cPq50RsKMODQsJIiEJFRQHAAAEcmcRpZUU+OcE//cA0MEJqpwOe3EKcWgIcWgGZFoLnI8MdG0LKCUJJiMMOzYMIB0GHhsHgHUROjYKHx0JhnwLjYIRR0EKcmoKb2UJb2YIcGUHc2gFa2IJcWkZn5QVY1oRUksUMCsOBAQBBAQFq54KsqUXYFgTUUsRZ1wMj4ALSUAOq54PlIgXeGsM0MEI49YIjX8JeG8MV1ANoZMSWFAVSD4OUlULLgAC6BIDvw4EWE4VPjsIGxcJAAABEA0FMi0Ku60NS0QKu64M+/gNgncMiH4PV1ENZFwJbWcKXlYVLSYKIR0IDAoEKycMY1kQe28abmQc3MkMrZ0Ua2APNS8ITEMQUEkSc2sNhn0Lg3gKh3kJhXkHe24Ky7kL+vEHn5EOMCwIMS0LCwkEAAABWVMQgHcWzL0Rl4wRkYYJeG0JQDsPi4EVUEkMZl8JgHQIiHwLiHsIWFAMhHsUyrkZa2INo5QLYmQNPw0G2hgHtxAEdWcYPTkNDw0LKSQKfnURgHUPtqcQAgECDAoCKSUHODEJW1UNQz0RgXUVGRcFCQoEQUQPISQJYl0VHRwQYVwPf3cTa2YXu7IRh4ASgXkOPT0LGiEPDQ4FOzUJi4ANgnUJhXkJfXIIl4gJxrYMmYsKopUJhHoLe3EMKSQKDQoFHhkOHhsHzb0NjYATr6ISopQQnJANaF8Kc2gNgHQHgHUIgHMInpAGfnITSUITHhsHoJMRrqERnZcScVgLdwcFZgwGdm4Rc2gQZVsOfnUMhXoIgnYJcmcPBwYDAQIDAAACIB0Gb2kTfXQYWlISAAAAPBsIizALex8JRx4IFw0ITR4IazUKUzkLWycMSxgKWz4IQB0IbxgJHxEHAAAAV1EMjH8Jg3cHd2wHrqAOg3gPZ14QfXINf3QFbmMJeW4RPzoLIB0LQToPiHwQAAABDwwGXlcNtqgT0cIOzr4ImokElogGn5AJ//8D08IOFBIHFRMHNTEOBQQDOzYEr6YUAAoHLDIMn5MTdWsNi4EHg3gJgXYKh3wIaV8NAAADMi8NEhAHEhAEWVMPd2oaQkERLwYDoREJqw4HVwgFbgoIbQ4Khw4LbQYHQQIFWwUHOgUFQAADqA4F1BUHvRMFJQUCCAkDcWkNin4HfXAHj4ESPjkNk4YRb2MMhHoHbGMKT0cOPDcMWlIPiHsXyrkTJCAHAAAAAAAACAYFU0sMrqEO9+gN//0H//oE1ckNZF0Nc2sOh3sSJCINAAACBwYFenARKiQNWE4QgXUPcmsJhn0HhnwIg3oKh3sJdGsMAAACVk8MIyAGDw0CbGcSYFcaKiYNnAoDtg4AdwMAjRAGoBQKsBUKnRIIhBIIixAJiREIhxEIoxYIrg8BmwQAzBAAUgkCAAACIx4Hh34MfnMGjH8WXVMRcmYSWFAOfXQIdGsKV08UlYkRi30QYVcUppgVS0YQMS4KCgkDAAAAAAAAAAACHBkIbmULxrsNq5kImIoKlooOd2wNbmMTPjsLUksKDQoGIR8NNTEJbWUIbmcGYFkHV04GXVUKbmYIYVcJAAAEQDkHGBUDCgkENDALMS0QOjMVXkA7TTg5f2FeRB8dIAEAKwUCHgIBdF9RRy0cHwMCJAQCIgEAQikojXJwRS0uLSknCgsJAAAAIB4Fb2UHc2cRUkoMcGcMbmQPYlwGa2IHgHQPpZkMdGoKIh8GBwYEODUJeXAIYVsLMi4KQTsTenEPdGoIYFoJe28L4c0A38sEin8JW1IQSEALcGgGa2EFTkYLVU0RRkIMcmwJQz8MSkILVlAMHRsMMy0HYlsJAgIDRD4IIyAHHhoFh34LTUcLXlUSMTcxN0NKRFJXDBodAAYHAAQEAAAAiIloYF8hAAAAAAgHAAcIFiIkUVxfLzc+HyIhPzgGYFkMbWUKTEQKamAPMjAIcmoIlIgJUUsGUEoIZVsOcGMPaF8OQDoMSkQQTUUJV1EHWFAJamEKYVgLhXIHv6YD6tQE5dIDpZcIbmEJamALa2ENWFAHamMEcGUEZV4NMy4LIx0FY1oOUkkRb2QRbWYPAAAAKCIFaWEJAAABNTEHGBgHEQ8EuKkMgHYFYFQEppGMqX18ilROjFpVhFdTWT45ODg7VFFILCgeLSgjPRwWajk3lmVidUpGb0tKTDEuXFMHkYMH59YDlIkIDAsFIiAFZF4LZV0Jin4If3YRQz8NjYEPKiYJg3gOQDoIdm0QOTIKdGkRRD8LY1wELUgmGDkuVFISp5YGV08JWE8Je3MNamAMWE8HaGAEfXIJMywGFRMIIh8Fd20RWFIKY1wIZl0LAAACKSMGamEJMCsIQjwJS0QJKCUGTEMJZmIDdl8R221f2CUTqxAEfBMLaQsFSyAcoqCkpKKnnZqgo5ydPgUBfg8HehIKiBULWwwGXBEMYVcMWE4ImosI59MCZl0KVk4PIRsFEBAHpZkQjIAUPzkMlosQNzIKzrwNZ2AHlIoRQzwIlosURkQSXU0BCYKPA6TCMlk5YE8BbWUEZFsFbGEOamAPXVQGZl0EhHsLODEKGxcIHxsFdmoMaGAHcWgDbWMJCQcEVE4JbmUFbGMHfXEG2McFs6YJaV8HYmAFXkAO3j8s5xgFawkECAECBwEBCQoJVFNUUlFTW1laR0dHBgICBgIDDQECRwcERQkFJQEDMjALZl4JVk4KwrEE1MADYFYLVU8MV1MKnI8QsqUOSUUOm5AVY1sO4c0QYloIwLISWlMHm48SODUMXEwACYCPAJ6/PkgWcWYDaWAFb2UGSkAJHBgHaF8HaF8Ee3MLLSoKJiIJIh4FeW8LYVsMb2gPW1INQD0KcGkHZV0FaV4Fvq0E08MCfXEGamAHR0QKQzQNjz8YZwcCLAYEHwMFJwQGBgAAAAAAAAAAAAAAAAAAIwQGHwMFJgUHMwYFFQICBgUELy0NSkQMXlcHiX4G4M0ArqEGWFAKZ18FdmoOWVMLGxkKSUIRSUEMV08RODQNaGAQLCkHa2MUPzoNXlUEG3FjFndwQj0IbWUEamAEbWMFW1EHMy0HYVoGamIEgXcOKygKLCgJFxQGcmkPXVYMUEgJVU0JamIIaWEGYloFpZkF3swAlogFYlkGYloHNS4NMS8MMDQMCREGBAUCGRcHIiAJJCEJIx8KIyALJCAMJyQNHRoIKyYKIyEJAgQBBAUBFBIGPjsPMi8NUEgHamEErJwE4s8Ak4cHWVILXlYGQDsIWVEISUMJXVQJRT4JV1AITEYGbmUQbmQXdWsRs6QJkXsCi3cBamMFaGAEamIGamAGbGIGc2gJaGAGamMGdm4MODMKSEMQCQYFQj0Ke3IKbGIGcGYHa2EHZFwHin4J1sUEz7wEeG4HY10GZmEIQDoLNC4MPjgNNzAMOjYPQj0QPDcNQj0OOTQMOzYNOzYOQj0OOTINQzsOOzYNMy8NOzgPMi4MODYNOzgNXlcIZF8GaWAL0L0F2scFb2cNYFkHdWsFbmQFcWcHb2MHc2cHcGQGcmcGeXAKdWsPY1kPqJkIhHoRdXAQbmUFZmAG';
const JSW_SPLASH_B64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAMDAAMDAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAICAAAAAAAAAAAAAAAAAAICAAAA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AQAAAQAAAQAAAQAAAQAAAQAAAQAAAQAAAQAAAQAAAAAAAAAAAQAAAQAAAAAAAAAAAQAAAQAAAQAAAQAAAQAAAQAAAAAAAAAAAQABAQAAAQAAAQkgASAJAQAAAAAAAAIAAAAAAAAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const RT_SPLASH_B64='AAA/AABhAAA1AABPAABbAAAaAABTAACbAACFAABmAAAPAABvAALkAAK7AAKvAAK2AAKzAAOpAAKHAAIjAAEAAAAAAAB5AAHZAAKrAAKvAAKrAAK/AAK0AAK0AALFAAKzAAOsAALFAAK6AAK6AAG3AAK+AAPQAAFpAAK6AAG+AAKuAAO1AAKlAAKnAAGpAAKyAAK4AAOMAAKFAAM1AAK+AALLAAG5AAKxAAK2AAGsAAGrAAGdAAKkAAKnAAKmAAHGAAB2AABMAABFAACgAAC5AACZAABBAABtAACLAABfAAAbAAAAAACWAACkAACYAAB/AACFAACUAACxAADHAAAkAAAAAAAiAADCAAB0AACAAACdAACdAACcAAB9AACsAACjAACgAACsAACvAAChAAChAACrAAB2AAAAAABMAACgAAB9AACJAACeAACDAACLAACZAACdAACdAADUAAC1AABaAAC4AACbAACSAACGAACZAACWAACHAACQAAB+AACQAAB2AABzAAAoAABXAADFAAD/AADbAAB9AABsAAClAABVAAEIAAABACp9AC7PAB+8ADDFADTRAEa6ACagADHJABxZAAAAAAAAABluACnJACCwACTDAB2xACu8ACW+AByzAB64ADrVADTUAC/AACy7AA2eACy+AEGrAAkOACKDABe1ACLAAD7NAC3EACy7ABupACKzACnGAD3RAB+iADzUADWQACapABe2AB24ACjDACTDACW5ACPOACvVACfFACTGABhbAAByAAAhAACGAgLwAgKyAQF3AAB5AQGEAQF/AABUAAMRAAAAAX93A8S0ArOjA8q8AHtrAtrNArCmAsq5AnZwAAAAAAECABsPAKydA72wA6ybA8S2AsW1Asq7AqqbA8KzAd7OAGdWAEEvALioApKFA7WlAretAmFhA5uTA6iZAbipAIByAXhnA9bHApmKAquaAHxsAse5A8a6AsCwArKqAr+yArmpAsu8ApyMAk4+Ak9BAl5MAquZAL6vAK+fABwTAgJmAwNsAACgAAA9AAAJAAAAAAAwAABqAABoAABHAAMLAAAAAG1vAPD0AP//AOnsAAsOAG5xAP3/APn9AJCRAAAAAQUFAQAAAGtuAP3/AOPmAPb5AP//AP//AOjrAP//ANLWABgbAAAAAKeqAPz+AOvvANvdANjYAOboAP7/AOHkABUX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';
const WOLF_SPLASH_B64='PTk8Ozo7Ozs7Ozs7Ozs7Ozs7OTs7Ozs+NzU0UUtKgoN/MjE0PTxBOzo4NT07OTs4Ojs7Ojo6Ozs7Ojs7Ozs5Pjk8ODs+Nj45Oz49NDMwOTk3RkRFODg6NTA2Ozw/Ojo6Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozo6Ozo7Ozs7Ozs7Ozs7Ozs7PDs7OTs6PDo6Ojs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OjY4Nzc3Nzc3Nzc3Nzc3Nzc3Njc2Njg1PTE0Rzk1h46KVFRVMCkuNzs5USwsRzEyMzk4ODc3Nzc3ODc3OjU3Njk3JSYjc3d2rbCtWlxaMDIxhYKDoJugZ2toMTMxNzg3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3ODc3OzU3Nzc3Nzc3Nzc3Nzc3Nzc3OTY3OjY3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3ODg4Ozc5ODc4ODg4ODg4ODg4ODg4Nzo4NDg3VDU0Y1dOaGlptrW2RkxKNiwuhS8rhmZkKjIyOzk5ODg4OTg4Nzg3OzY1eHJqmJiZiI+Ol4qIdHhxbHRwmpSSj4J5LzI0Ojk7ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4NTk4ODg4OTk5ODg4ODg4Nzg4Ojc4Nzk4Njg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4ODg4ODo6QjI0i1hWcnJvY2BjlJSSnKCfWiIjd1ldpaenaGlpLi0tOjo7Ojk4MDUzXEZInpCLWWRgeGpomVFPdnBwaGprjGJhb0FCMzY5OTk6ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4Nzc3ODc5ODk4OTk5ODg4ODg4ODk5OjQ3MTMzNzo4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4OTg4Mjg4TT03nnl4bXN2c3h4dnd1k3t9h0xMenNze3t7srS0QEA/NjY1Ojk4NDU2Wzo+hHVxX15ghTQ3dTMycHh0mHZxnzs/QDQ0NTo4ODk5Nzg4Nzk3Nzg4ODg4ODg3ODg4OTc4OTg5OTg5ODk6OzEzbUxSQEFCNjY4Nzk4OTg5MDQxX0FGbWBjMDAyODo7ODg4OTk5ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4OTk5MjQyUElHqJ6ZYWBef4B/jpCMl2FgiWpqkJOKg4N9naShXWBbMDAsOTw9NTo7UjIzh3x2e3l/UTEvTDUugISAkIOEQyUqNDc3ODo6OTg7Nzk3OTo5Nzo4ODk6Ozo6OTgzOTkzNjU4Pjc8OTs+UigspHt6QEdGMzU1PDg7OTo8NTQvgEtMmZSQODs/ODg8OTg3Ojo6OTk5ODg4ODg4ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4OTk5NDMzS0hHrrSqTj8+fHZ3mZ2WnV5ckX17go2FlJuXoZSSXU5LMjg2MzM3LzE3SDEvjYB8goWLOkJFWC4omIyGeH96XVVURkRGMzE3NjUzNjs2My4wNjQ0NjU3Li4zNzs1NTk5REFDNDQ0MS8sf0VGq6SiOTs5Nzc1ODM3NDIzR0BBX0pINjIyPT47LiwvOTc3MDAwMjIyOTk5ODg4ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4ODg4NzY2QT4/raajUTMzcHRyoKGhmmlqlo6MY2FakZuZtYuLXDMzPD8+mpydXF1hOicnkIWFiY6TPjs/iSsupZKSfXRukHl6RExKYV9lWl9gPS4rjnJzQkJEc3RxdnZ4LzEwQSEkkH58l5+ccl1dkWdkys3OgIOGLCoubm5tVVVWNiopVzw4Pz9EYjo+fnN3Ojs7jIyMV1dWMTExOTk5ODg4ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4ODg4PDg7MzEzk4uIXUI8aG1rrbGvjmNhgm9wdlZRmaOgtouFZB4fcWtntLq11dfUX1pciIuOjpWQUkpIsoyLqqOlq6qrhnFxWEhGoKWlo6SnZjAu1ri8rbOyf3592d/gl2Nkizc7paWhx8XFl36BqZydvLy/dl1fVkxHqq+smJqdUx8irpaQvby6m2Bf2dLSiouOoaCgzc/PQkNDNTU0OTk5ODg4ODg4ODg4ODg4ODg4Ozc5ODc4ODg4ODg4ODg4ODg4Ozk6MTEyWltZcGVgYmFhusK8ilZTUD09clBMoqyqsYeDkUFFtrKrroeGwMC+lYKDkpCTlpyW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';
const Q2_SPLASH_B64='BgYGBAQEAwMDBAQEBAQEBAQEBAQEAgICAwMDBAQEBAQEAwMDBQUFBgYGCAgIBgYGBAQEBAQEAwMDAwMDBAQCBAQEBwcHBgYGBAQEAQEBAgICAgICAgICAgICAgICAwMDAgICAgICBAQEAwMDAwMDAwMDBAQEAwMDAwMDAgICAwMDAgICAQEBAQEBAgICAgICAgICAgICAwMDAQEBAgICAwMDBAQEAwMDAgICBAQEAwMDAwMDAwMDAgICAQEBAQEBBQUFBAQEAwMDBAQEBAQEBwcHBgYGAwMDAwMDBQUFBQUFBAQEBAQECQkJCwsLBwcHBQUFBAQECAgIBwcHBgYFBgYGBwcHBgYGBAQEAgICBAQEBAQEAwMDBgYGAgICBQUFBAQEAwMDAgICAwMDBAQEBQUFAwMDAwMDAgICAgICAwMDAwMDAwMDAgICAgICAgICAwMDAwMDAgICBAQEBAQEBAQEBQUFAgICAgICAwMDAgICBQUFBAQEAQEBAQEBAQEBBAQEBAQEBAQEAwMDBAQEBAQEBAMDAgICAwMDBgYGBAQEBAQEBgYGBwcHBwcHBgYGAwMDBgYGBwcHBgYGBwcGBAQEAgICBAQECAgIBQUFAwMDAwMDAwMDAwMDAwMDBgYGBAQEAgICBQUFBAQEBAQEAwMDBAQEBAQEAgICAQEBAwMDAwMDAwMDAwMDAwMDAgICAwMDAQEBBAQEBAQEAQEBAgICBAQEBAQEAgICAgICAQEBBAQEBAQEAQEBAQEBAgICBAQEAwMDAwICBAQEBQUFAwMDBQUFBwcHBgcHAgICBQUEBgcGCAgICAgIAwMDBAQEBAQEAwMDBAQEBgYGBQUFAgICAwMDAgICBAQEBQUFAwMDBAQEBAQEAQEBAwMDBAQEAwMDAwMDBAQEAgICBAQEAwMDBAQEAwMDAgICAgICAgICAgICAwMDAwMDAgICAgICAgICAwMDBQUFBAQEBQUFBAQEBQUFAwMDAgICAgICAwMDAwMDAwMDBAQEAwMDAwMDBQYFBAUEBAUFBgYGAwMDBQUFBgYGCgsLBwkIBgcGCgsLBwgHBgYGBAQEBQUFBAQEBwcHBQUFBAQEAwMDAwMDBAQEAgICBAQEBAQEAwMDBQUFBAQEBAQEAwICBQUFBQUFAwMDBwcHBAQEAwMDBAQEBQUFBgYGBQUFBAQEAwMDAwMDBAQEBAQEAwMDAgICAwMDAwQEAwMDBQUFBQUFBQUFAwMDAgICAwMDBQUFAwMDAwMDAwMDBAQEAwMDAwMDAwMDBgcHBwkKBggJBgcHBgYGCgoKCQgIBgYGBggHBQYGBwgHCAkJBggHBwgIBAQEBAQEBwcHBQUFCAgIBQYGBAUFBgYGBAQEBgYGBgYGAwMDBAQEBAQEBAUFBwcIBgYGBAQEBAQEBgYGBwcHBgYGBgUGBAUFBQcGCQoJBAQEAwMDBQYGCQoKBAQEBwcHBQUFBAMEBQQEAgICBAQEBgYGAwMDAgICBAQEBAQEBQUFBQQEAwMDAwMDBAQEAwICAgIBAwQDCQoJCgsMCAkKCAkIBwcHCQkJBwcHBwcHBwcHBwcHCAkJBwsJBQcGCAoJBwgHBAUEBggHBwkICAoJBgcGBggHBgcGBgYGBgcHBQYGBQYGBggHBQcGBwoJDA0NBQUFBgYGBgYGBQUFAwICAgICBAQEAwMDBAYFCAoJBgYGBAQECQsKBwoIBQcGBQUFBAQEAAAABQYFBgcGBgcGBgcGBQcGBggHBggHBgcHBgcHBQYGAwUFBggJAgQGBAUHBwoLBwkLBggHBggHCg4NCQsKCQwKBAYFBwkIBggHBggHBgcHBAQEAwQEDhEQCw8OBwkIEhcWBwwLBggHBQYFBAQEBggHBQcGBgcHBQUFBQcGBggHAwUEBQcGCAkIBgcHCAoJBQYGBAYFAwQEDA8OBwkIAAAACg0MBAYGBAYFBAUEBQYFBQYGAwUEBQcGEBQTBgkIFhoZBQgJBAQFBAQFAgMFAwUGBAUGAwQFBAUIBwoMBwsNDhQWCA0QERkcDBIVBwoOBQkNAwYGDxUWDxYVAAAADREQERkWAgUEBggHBQcGBQcGBQcGAAAALDw3JDEvBwkJPFNPBQkKBQYHBQYFBgYGBggHBQcGBggHAQEBIS4qL0A5AAAABwkICQwKBwkKBgkIBQgHBwgIAAAAM0A7Iy8pKTMuEBYVBAQFBggHBgkIBQcGBAYFAwUEBAUGQFRQDBERExgXCAkMAgQDAwQEBAQGBAUHBAUFBAcHBQYJBgsLBwkML0A/DxcZMkRCCA4QBgUIAwUHAwYHEBcWLDs3NENALj87FyEfBgYGCAwLBQcGBAUECQsKAQIBJDIvJzEvCxIPNUdDAQQEBgkIBQcGBgkICAwKBwkIBAUEGiAeFR0aN0hAISwnAgMDCAsKBgsLCAoKBwgHBggHAAAAN0ZBIi0oJjArHCQgAwUEBwsKBwsKBgkIBgkHBgcHAQMEN0hDDhIREBYVDRERAgMEBQYIBAYIBAcJBQkLBQkKCAwOCQ8PBQoLMkJCERkYNEE/BQkLBQYIBAUGBAUFAgIBDxUSPVJLFyAdBggHBwwLBQgHBAYFBAQEBQUFBQQFBgcHDA8ODA8NCgwMBwcHBAUFBQUFBQYGBggIBgYGAwUEEhUUBAQECwwLGiAeBQgHBQYFCAoKCg0MBAUEBQUFBAMDExgWCQoKAAAACQ0LBQYGBQgIBwoIBwgHBAcFBgcIBQYHCQwLCwwNFhsaCQwMAwUIBQYKBQUIBAYHBQYJBQYICQwOCw4RBwoNERcZCg0OEBMUCgsOBwkLBAUGBAMDBAQEAAEBAAAAAQAABgcHBgYGBAMEAwMDBAQEAwMDBQUFAgICAAAAAQAAAQEBBQUFBAMDBAQEBwYGBQQFAgICAwMDAAAAAgICAwMDAQEBBQYFBgcHBQUFBQUFBAQEAwMDAgICAAAAAwMDBgcGAwQEBQUFBAQEBQcGBgYGBAUFBwkIBwgIBQUFBQYGAgMDAgICBQcIBAQGAwQFBAUHBQYIBgYICAgLCAkLBQYHBAQGCAoMBAUIBwcKCwwPBgkKBAMEBQUFAwMDAgECAwMDAgICBAQEAwMDAQEBAgICAQEBAgICAwMDBgYGBQUFAwMDBQUFBAQEBAQEAAAAAAAAAwMDAgICAgMCBQYFBQYFAwMDBQUFBQUFBAMEAwMDAwMDAwMDAwMDBAUEBAQEAwMDBAQEBQUFBAUFBQYGBAQEBAUFAgICAAAABAQEBAUEBQUEBAQEBAUFBQUFBAQFBwgKBQYHBAQFBgcHBQYGBQYGBgcHBwkKCQsMBQYICAkKCAoMAwMDAwMDBAQEBAUFAQEBAgICBAUFAwMDAQEBBAQEAgICAQEBBAQEBQUFAwICAgICAgMDAAAAAAAADxIRHyUhISUjBgYGBAQEBAUEBAQEAwMDAwMDBAQEBAQEBQUFBgYGBgYGBAQEAwMDBQUFBQUFAwMDAwMDBQUEBAQEAgICERURGyEbFBgUBQUGAAAAAwICBQUEAgIEBAQEBAQFBgcJBgcHBQYFAwQDAwMDBAQEAwMDBAQFBwgJBwgJAwQFBgcIBAMEBAQEBQUFBAQEAwMDAgICAwMDAwMDAwMDBAQEBAQEBAQEAQEBAQEBAgICAAAAAAAAERYTHSUhICcjFBcVBQQECAcHBgYGAQEBAwICAwMDAwMDBAQEAwMDAwMDAwMDAwMDBAQEBAQEBgYGBQUFBQUFBQUFBAUEAwMDAwMDAwQDBwkIFhwYJS0mHyYhBwkHAAAAAwMDBAQEAwMDAwMEBAQEBAQEAgICAgICAwMDAwMDBQUFBAQEBAQEBAQECg0NAgICAwMDAwMDAwMDAgICAgICAgICAQEBAgICAgICAgICAwMDAgEBAQEBAAAAEBURLDcvHyciCg0LAAAAAAAAAQEBAwMDAgICAwMDAwMDAwMDBQUFBgYGBAQEAwMDBAQEAgICAwMDAwMDBwcHBAQEBgYGBQUFBAMEAwMDBgYFBQUFAgEBAAAAAwQEFx4YKDEoFx4ZAgIBAgECBQUGAwMDAwMDBAQEBQUFBgYGBQUFBAQEBwcHBQUFBAUFBwkICw4OAQEBAgICAwMDAgICAgICAgICAQEBAgICAgICAwMDAQEBAQEBAAAAAQEBGyUgOEY9GBwYAAAAAAAAAwQEAwQEAgMCAgICBAQEAwMDAwMDBAQEBQUFCAgIBgYGBAQEAwMDBAQEBQUFBAQEBwcHBgYGBAQEBAQEBwcHCAgIBAQEAwMDBAQEBAQEAgICAAAABQYFISkjKjYsCAoIBAQGBQYGBwcGBwcGBgYHCAgLCAgKBgYHBgYGBQYGBggICAkMCQoMAAAAAQEBAQEBAQEBAgICAgICAgICAgICAgICAQEBAgICAAAABwgGLDcyISkkAgMCAAAAAwMEAQEBBAUEBgcGBwcHBAQECAgIBgYGBwcHBwcHBwcHDQ0NBgYGCwsLCAkJBgYGBQUFBQUFBQUFAwMDBQUFBgYGBgYGCAgIBAQEAwMDBAQEAgICAwMDBgYFBQUGAAAAGCAaLjwyDA4LAwIDBgYHBAQFBwcHBgYIBgYICQoMBwgKBwgJBQcHBgcHBgYHAAAAAAAAAAAAAQEBAQEBAgICAwMDAQEBAQEBAQEBAAAAAwMDKzcxKTQuAAAAAgECAgICAgICAwMDBAQECQoJCAkIBwgIBgcGBwcHCQkJCQkJCAgICQoKCw0MCw0MBgcGBQUFBQUFBQUFBQUFBAQEBQUFBgYGBAQEAwMDAwMDAgICBAQEBAQEBAQEBgUFBQYFBQUHAQADExkULzowDhENAgEDBQUFBQUGBgYIBwgKCQsNCAoLCAkJBQUGBQUEBQYGAgICAQEBAgICAgICAwMDAwMDAgICAgICAgICAgICBAUEIismJzEsAAAAAgIDAwMDAwMDAwMDBAQEBgYGBgYGBQUFBgUGBgYGCAgICAgICQkJCgoKCgoKDA0NCQkJDQwNCAgIBQUFBgYGBgYGBAUFBQUFBAQEBQUFBAQEAwMDAwMDBQUFBwcHBQUFBQUFBAQDBAQEBgYGAAAAFRoVLDYuDBAOAwICCAgKCAgLCwwOCQoMCAoLCAoLCAgKCgoMCQsNAwMDAwMDAgICAQEBAQEBAQEBAgICAgICAwIDAAAAHCMfNUM8CAsKAQEBAwICAgMDAwMDAwIDBQUFBQUFBAQEBAQEBQUFBgYGBgYGCQkJCgoKCQoJCgsKBwcHBwcHCQoKCAgIBgYGCAgICQgICAgHBQUFBwcHCQkJBgYGBQUFBgYGBQUFBgYGBgYGBAQEBgYHBgYHAwQEBwcHAAAAKTUuNkc9BQUFBAQFBgcJBwgKBwgKCgsNCAoLBwgKCgwOBwsNAgICAgICAgICAgICAgICAQEBAwMDBQQFAAAADxIRM0M+HCYiAAAAAwMDAgICAQEBAwMDAgICAwMDAwMDAwMDAwMDBAQEBQUFAwMDBAQEBAQEBgYGBgcHBwcHBwcHBwcHBQcGCAgIDA0NDQ4OCAgJBgYGBwcHCwwLCgsKCQsKBwcHBgUGBwcHCAgICAgIBgYHBAQGBgYGBQYEAgEDEhgWSF5QJTEqBQMGCQkLCAkMDA8RCAsNCAgKCAkMBwkMBQoMAgICAgICAQEBAAAAAQEBAQEBAgICAgECBgcHJjAvM0JADRAPAwMDAgICAgICAgICAwMDAwMDBQUFBQUFBQUFBAQEBgYGBQUFAwMDAgICBAQEBQUFBAQEBQUFAgICBQUFBAQEBgYGCw0OCw4PCgwOCw0OCAkJCQkKCAkKDA0NBgYFBQUFBwcHBwcHCAgIBgYGBgYFBwYHBQUHBwcIAwIDNkZAR19UGBwcBgQJDA4REBQXDhIVCw4RCQsPCAsPCA0PAgICAgICAQEBAQEBAgICAgMDAwMDAAAAGyMiM0JDJzIzBQQFAgICAwMDAwMDAQEBAgICAwMDBAQEBAQEAwMDAwMDBQUFBQUGBAQEAwMDBQUFBgcGCAgIBQUFAwMDAwMDBAQEBAUFCgoLCwwNDA8OCw4PDRATDA4QCQkKBwcIBwcICQkJBQUFBAQEBQUFBwcIBgYHBgYICAgKCQoMBAIHJzEuQ1tRHicmBgcLCw8SDhIVDBAUDREUCgwQCgwQCgwQAgICAQEBAQEBAgICAwMDAgICAgEBAwQEIywqNkdHKzY3AAAABAQEAwMDAQEBAwMDAwMDAwMDBAQEBAQEBQUFBgYGBgYGBQUFBAQEAwMDBwcHCQkJCgwMCQgJBwcICQkKCwsLDw8RDA8REBQWDxMUDhITEBMVDA0PCAkKBwcJCQkMCgsNCw0PBQUHBQUGCAgKBwcKBgYGCAgKCgwPBAMIICopSWFXMUE9DhIWCQwQDBATDA4TCgsPBwsOBgoOCg0RAgICAgICAgICAgICAgICAwMDAQAADQ4OLTo6Q1RTKDIyAwIDBgcHBwYHBQUFBAQFAwMDAgICAgICAwMDAwMDBQUFBAQEAwMDBAQDBAQDBwgIDA0PDg8RDAwOCQkMCQkKCQkJDw8RERUWEhUYFRcZEBMVDxETCAkKCAkJCQgKCgoMCgwPDRATCAkMBwcJBwcJBgcJBgYJCAgMCgsPCwsQERUZMDo3QVJNHygoCw4SDQ8TCwwQBwcLCAgMDQ8TEhgbAgICAQEBAQEBAgICAgIBAwMDAQEBDxARP01NNklHM0A+AwMECQkKCAgJBgYHAwMEAwMDBAQEAwMDBAQEBAQEAwMDAwMDBAQDBAUFBgcJDxATEBETCwsNCgoMCQkLCQkKCwsNDQ4QEBIVExYZFBgZEBIUEBMVDxEUCAkLCQkMCQkMBwcKCAgJBwcKCAgKBQUHBQUICQgNBwYLCQoNBgYLGyEkQ1RPRVdQJCwsDg4UCgsQDQ8TDA4RCwwRDhEXERUaAQEBAgICAgICAgICAgICAwMDAAAAGhweLzg5NkJDOENCBAIEBQQEAQEBAgICAgICAwMDAwMDAgICAwMDAwMDAwMDBQUFBAQEBgYHERIVDQ4PBgYGBgYGBwcIBgYGCAgICAgKDA0REBEVDQ8RDxIUDxATDxEVDQ8RBwcIBwcJBwcKCAgLCgoNCQgOBgYJBQUHBAQIBwYLBwYLBwYKAgEFKzI1PUpKLjo7KTIzCwwSDhEWDA8UDhIXDRAWCw8TCw0RAQEBAQIBAgICAgICAwQEAwMDAQEBDQ4QMDk7JCwuIygoBAYFAQEBAQEBAgICAQEBAgICBAQEAwMDAwMDAwMDAwMDBAQEAwMDAwMDBgYGBAQEBQUFBQUGBwcICAgJBQUGAwMFCAkLDg8RCQoMCgoNCwoNCgkLCQoKBwcIBgYIBgYICQkLDAsPCgkOBwYLBwYJBQUHCAcMCAcMCAgMBwYLNT49MT85MDo6LDM3Cg4SEhYaDxIXDhEWDhEWCw0RDQ8TAQEBAQEBAQEBAgMCBAQEAgICAAAACgwMJCksMjk7RlZSIicnAQECBQUGBAIDAQICAQEBAwMDAwMDAgICAgICAwMDAgICAgICAgICAwMDBAQEBgYGCQkKCgoMDQ0OCgoLBAQECAgKDQ0PCQkLDAwODQ0NBQUEBQUFBgYJCAcMBQUIDQ0OCwsOCQkLCQkNBwYKBgYIBgYJCAcMBgUKDxMUQU5JRldQRFJNHiEjBwcMDQ8UEBIXDRAVDhEWCgwRCgwQAgICAwMDAwMDAwMDAQEBAQEBAgICBAQEEhQXJiosMDw5M0A8CgoMBwYJBgcIAwIDAgIBAgICAQEBAQEBAQEBAQEBAwMDAwMDBgYGBAQEBgYGBgYGCAgICAkICQkJCAgIBwgHCQkKCgoLCQkJBgYGCAkIBgYFCAgKCQgNCAgMBwcIBwcIBwcJBgYIBwcKBwYKCAcLBwYKCAgLBwYJISYmNUBAPUZHNz8+EBAUCgkPDQ8TDhAVDxEWDg4TCwwQCgsPAgICAwMDAwMDAgICAgICAQEBAgICAQEBERETIycoMj06U2hhLTY0AAAABAUEAQEBAQEBAQEBAQEBAgICAgICAgICBAQEBQUFBAQEAwMEAAAAAAAAAQABAAAAAQABAQEBAAAAAgECAAAAAQEBAAAAAgICAQEDBgYJCAcKCQkLBgUJBwYKBwcKCgoLCAgJCQgMCgoOBgYKAAAAFhkaQUtKRE9OSVZSQ0xLCwwQDxAUCgsODxAVDxEVCQkMDA0RDhIVAQEBAgICAgICAQEBAQEBAQEBAQEBAAAABQcHKSwvIigqJi0rR1RPFRoYAAAAAgMCAQIBAgICAQEBAQEBAgICAwMDBAQEBAUEGRwZGx8dIykkIyskHyYfGiAaHiMdGyEbHCIcGyAcIiYiICMgIiYiGx8aJSgkJygnEBARBAMGBgYJCgkMCAgMBwcHBQUFBQUIBwcKAQADExQVNTw6LDU0Q1FLS1hTISUpCAgMDRATDA4SDA0RDhAUCQsPCQsPCAsOAgICAgICAQEBAQEBAgICAgICAgICAQEBAgICDQ8QHSEiKjAwMTw7Lzk3EhQVAAAAAgICAgICAgICAQEBAgICAwMDAwMDBQUFDA0NDRAPJS8pOUlAP1BFMD8zNEA1Mjo0GyAcQlBDMj81IiwnNT84NTo2FxgXCQgHBQUEBQUFBQYFBwgIBQUHBQUHBAQEBgYIAwEGFRcXOUNBRVNPQk9NUmJeP0lGBwcMCgwQCgwPCAkLBwgLCQkOBwcLCAgMBwgMAQEBAwMDBgYGAwMDAgICAgICAwMDAgICAgICAAAAJSsrOEREFhseGR8gKzU0GyIgBQUFAAAAAgICAQICAgICAgICAwQEAwMDAgECAQABAQICIiomJC8pKjQqNEAzEhQRAAAAHSMeGB8bHyUiKzQtGyAcAAAABAQEAgIBBAQEBQUFBgUFBAQEBQYGAwIEAgIDIyYmQ0xLLzk4S1VSQExKT11bExYXBQQJCgkOBwcLCAgLBwcJBwYJBwcLCAoOCg0RAgICAgICAgICAQEBAQEBAgICAQEBAwMDAgICAgICCAoLGh4hKTIyKDIwJS8uIComIismExcWAQAAAAAAAgICAQEBBAQEAgICAgICAgICBQUFFh4aGiMdICogMz8yCgsKAgICEBMTGyAeGyEfJS4pHSMeAQEBAwQEAgICAwMDBAUEBgYHAQABAAAACAgIJisqMTo3N0RCTFhZS1dSU2FbJCcnAQIECQoPCgsPBwoNCQwQCw4QCAsNDBAUDREUDxMWAgICAQEBAAAAAQEBAQEBAgICAQEBAQEBAQEBAgICAAAAAQIDEhQUFRoZJjIvFhsbISolLzw3HiYjERMSAQABAAAAAAAAAgICAQMCAQEBAgICFh4aISskGSMcMT0yDQ8OAAAAEBUSHychGSMeIykkDg8MAgICAwMCAwQDAgMDAQABAAAADxAQS1BPXmxoO0lFOUpBM0I8SFpYW21pIycmAAAACQkLBwgKCAoNBgsOCg4RCw8TDREUCQ0RCAwQCg4RAQEBAQEBAQEBAQEBAgICAgICAQEBAQAAAAAAAAAAAQEBAQEBAwIDCgsLICYlKTIvLTYyICclHSMhMTs1DA8OBwgHDAwMAAAAAAAAAwMDAgMCFx8aFx8dGSEdLDYtCw4LAQABFRoXGyMgGyIfISgiCg0KAAAAAAAAAAAABQMFExUUNj03W2pkZ353Sl5ZPU9KJDArNEE9T1pWHiQiAAAACAgKBgcJBwgLBwcLBgoNCQwPCQsOCQwPBAgLAgcJCAsOAQEBAgICAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAQEBAQEBAwIDAgICFRgXFxwZFxwcFxseERAVExcXIykmKjEsMjs1LTUxFRoXAAAABgYEISgjHCYhHSceJCwlBAQEAAAAHiQgLjs0LjkzJC4pHiEdDxEPExQULDYxMEA4MT04TV9WRFpPMEQ6P1FKM0A9Fh0eUl5dExYYAAAACAkMBgcKBgYLBwcLBQcLBwwPCQsOCAoNDREVCg4RCAwPCg0RAQEBBAQFAgIDAQEBAQEBAgICAgICAQEBAQEBAgICAgICAwMDBAQEBQQFAAAAAAAABwgJEhcZFxweGB4eFhwcISsoJDEsJjMuGiMfJy4qPElAIS8lKDcrJzMpKTUqJC0lJSwlKzUwLDk0Ljo0MD02OUk+PElCMkQ8SWFWRmFTL0I3PlVJKDsyPVFFRFpNN0VBDhIWBwoOBwkNCw4SCw8SBgoNBAcKBgYKCAkNCw8TDRMWDxQYERgcDxQXCw0SERYaBAYFBwgJAwMFAgICAgICAgICAgICAwMDAQEBAgICAgICAgICAgICBAQEBQUFBAMEAgIBBwkHFx8dICsnHikmJTIuIjArKjUyHy0mL0U3L0M1JDAnJDAsHSciLDsyJjUtGyYhGiIiFh8eHiglLTgzKzcvGSQfJjIsKzgyOE9FOlNGPFNGP1RKRFZOJjArDRASCw4RCQ4QCw8SCw8TDBATDBATCg8SCAwPCQsPCQ0QDBEUDxUYDhgaERkbDhMXEBkbAwQDAwMDAAAAAQEBAQEBAwMDAwMDAgICAQEBAQEBAQEBAAAAAAAAAQEBAQABAAAAAgICAQAAAAAABggGFRsXHSUgGyEfGiIfPFlISGlWPVBEIS0pEhobFR4cJjMtGCEfDhUVFyAfFBsbFR0cFx4fJDAsQFhNMUM8LT41PlNGOUpBJS4pGR4dBQcIAAEEBgcNCA0PCw8TCg4RDREUDBATCw8SDBEUCxAUDBEVCg8TDhQXDRUXEBYaDhUYDRQXERgbAgICAgICAQEBAQEBAQEBAgICBAQEAgICAwMDAgICAQEBAQECAwMDBgYGAwMDAgECAwMDAwQDBAQEBAMEAQABAgICAgECAwMDHiojNEk+KTkxHSgmEBcXEBUWFB4aERkYERkXGSIkGCAiGSEgIConMkI6Q1pNMD84JS0oGR4aBwkICAgKBAcJBgoNCw0QCQwPCAwODRIUDxUWDRIUERcaDRIVDBEUDBEVDBEUDBIVCxEVDBIWDRIVDxcZEBgbEBkbBAQEAwMDAgICAwMDBAQEAwMDBAQEBgYGBQYFAQIBAwQDBwkICgwLCAkJBAQEAwMDBAQEBQUFBgUFBwcHBQUFAwMDAwMDBAUFAAAAAAAADxEPHysmHCgjERkWKDQsFxsaCAoKIS8oIjArFh0cHykmHyklAAAAAQAAAAAAAgECBwgKBwgKCAkLBwsMCQsOCgsOBwoLCQ0QEBUYDBAUEBYaEhsdDRQWCgwPCg0QDBEUDBQWDxYZDRUWDxgYEBobExwdAwMDBAQEAgICBQUFBQUFAwMDAwMDCAgIBQUFAgMCAwQDBQYFBgcGBAUEBAQEAQECBAQFBgYHBgcIBAQGAwMDAgMDAwMDBQYFCAsJBAIEBQkGKDgtITAoFyIbKjcvERISAAAAICojKDYtFyIbKjkwIislAQEBCAkJBgcHBgcGBggICAsMCgwOCg4PCAoLCAoLBwsLCgwODhIWEBcZEBUXCxATDhQXCxASBwoMCg8QCxASCA0PDhQWDBMUCQ8SERgbAgICAwMDAgICAgICAQEBAgICBAQEAwMDAQEBAgEBAQEBAQEBAgICAwMDAwMDBAQEBgYGBAQEBgYGBAQEAwMDBggHBAQEBQQEAgQDAgEDAwUDL0QzIzIpFRwZKzsyDhIQAAAADBEOJzctFBwZJzQsICgiAgICBwkIBwkIBwgJCAkLCQwODBESCAoMBgcKBwkLBwsMCQwOCQ0PCw8SDhIUBQgLBgkMCg0PCAoNDBEUEBYZCRARCw8RCQwQCQ8SDBQWBAQEAgICAgICAgICAgICAwMDAwMDAgICAwMDAQEBAAAAAgICBAQEBQUFBQUFBgYGAwMDAwMDBAQEBAMDAwMDBwkICg0LBwkJAgMDAQICBgcGLj0wHSwiDxQTHiUgCAoIAAAAHSUeKjouERoVKzguKjEqAgMDBgkJBggHCAoJCwwMCAoKBQgICAkJCAsKCw4OCAoMDRESDhQUCg8QCAwOCQ0OCAoLBAYHBgkLCQ4PBw4ODRMSCxERDBITCxITCxITAgICAQEBAQEBAQEBAQEBAgICAQEBAQEBAgICAQEBAQEBAgICAgICAgICAwMDAgICAwMDBAQEBAUFBQYGBAQEBQgHDA8OBwkJAgMDAQEBCQoJLDwwL0E0IzYoM0I1ERMRAQEBIy0mJTYpKzowLjwyJzEqAQIDCAwLBwkICAoJCQsJBAYFCw0NCg0MCw8PDBARCxAQDBERDRETCw8RCQ0OCQwMCAsKCAwLCxASDRITCA0OCA4NDRMTDBMTDxgWDxcXAQEBAgICAQEBAgICAwMDAgICAQEBAQEBAQEBAQEBAQEBAAAAAQEBAgICAgICAgICBQUFBgYGAgQDBAcFCQwLCQ0MBAUEAwQDAwICAwMEBAUEKjsuLD0wGyodJjIoDA4NAAAAFh0YKjotIzUnKDgtGR8bAwMDCQwLDA4MBwkICAoICAoKDBASDhITCw8QCw8QCg4PDRMTCg4QDRETDBISBwwMCAwLBwsLCAwNBwwMDBQSDhgWEBgXDBMTEBkYDRUUAwMDAwMDAgICAQEBAgICBAQEAgICAQEBAgICAQEBAgICAwMDAQEBAQEBAQEBAgICAwMDAQEBAwMDBgYGBQYGBAYFAgICAgIDAwIDAwQEAQABISwjGykeGSUbICkhBAQFAwEDEhgUKTouGikcMkI1Dg8OAQICCAsKCQsKCAoJCgwLCQwMCg4PCgsNCQwNCAwNCw8QDBISDRISCw8PCg8PDBERCg0NCAsMCg8PCxARCxIQEhwaEBkYEBkYExwbDRQTAwMDAQEBAgICAQEBAQEBAgICAgICAwMDAwMDAQEBAQEBAgICAgICAQEBAgICAQEBAgICAgICAgICBAQEAgMDAgICAQICAwMDAwMDAwQDAQABDRINJDgpMkU1ICYgAQEABgUGBwkIIzQlJjUoOEg8AwQEAwQEBQYGBQcGBwkICQwKCAsKCw8ODBAPCQ0MCg4OCQ0OCQ4ODBERCw8QCw8PCg0MBQgHBwsLCg4PCgwOBwsMCg4OCQ4OCxMSChISDhQTAgICAgICAQEBAQEBAQEBAgICAgICAgICAgICAgICAgICAQEBAgICAgICAgICAgICAQEBAQEBAgICBAUEBAYFAgMCAwMDAwMDAwMDBAQEAAAAERUQJTgoMEAxFhoWAgICBQYHBwgJJTInJzYpHSYgAwMEBQcGBAYFBAQEBAUEBgcHBwkICQ0MCg4NDBAPDBEPCxEQDBAQCw8QDxQTCg4NCg4NCAwLCA0NCAoMCgsNCQwNCQ4OCg8PCQ8PCAwMDBEQAgICAQEBAQEBAQEBAQEBAQEBAgICAQEBAgICAQEBAgICAwMDAgICAQEBAQEBAwMDAgICAgEBAgICBQYGAwQDAwMDBAQEBAQEBAQEAgICAgICCAkIGiUcKjYqEBUSCAgJBQcHAwMDExkVKDUpFRsWAgIDBgkIBQYGBgYGBQYGBQcGBggHCgwLCg0MDA8ODREQDxQSCw8OCg0MCAsKCAsKCw0MCgwMBgoLCAsNCQsNCg4PCQ4OCQ4OCg0OCw8QCQ0MAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAgICAgICAgICAgICAwMDBQUFBQYFAwMDAwMDBQYGBgYGAwMDAwMDBQUFAgICAgICBAQEAQEBJDEnLzwwBAQFBgkJBgcGAQICEhoULzwwDBAMAgEBBgYFBAQFBQUFBggHBggHBggHBwkICQsKCgwLCgwLCAkJBwcKCQoKBQcGBQcGCAoJBQcGCAkJCQsMCAwMCw8PCQ0MBwoJCAwMCxARCQ0OAQEBAQEBAAAAAgICAgICAQEBAQEBAgICAgICAQEBAgICAgICAQEBAgICBQUFBAQEBQYGBAUEBQUFBAMEBQUFBgYGBQQFBAQEAwMDAgMCBQUFAAAAKjYtKzYtAQECBwgIBQgHAgICERUSO0g9BggGBgYHBwoHCQsLBggHBwkICgwLCg0MCw8OCw4NCg4NCQwLCQoJBwgIBQYFBgcGBgcGBwcHCAgIBwkJCQwLCw0MCg0LBQgHBwkIBwoJBwkJCAsJAgICAgICAQEBAwMDAgICAQEBAQEBAgICAgICAwMDBAQEAwMDBAUFBgcGBAQEBAQEBAMEBgcGBwgHBQcGBgYGCAgIBgcGBgYGCAoJBggHBggHAQEAIigjKzMtAAABCAkJBwoJBAYFDREPSVRNBwgICgoLCg4MCw4OCgwLCgwLCgwLCQsKCw4NDRAPDhEQDA8OCAsJCgwLCAoJCw0MCw0MCAsKCAoJBwoJBggICAkJCAkKCAkJBggHBwkIBgkICAsKAwMDAwMDAwMDAwMDAwMDAgICAwMDAgICAgICAwMDAwMDBAQEBwkICQwLBgkIBgcGBgYGBwkIBggHBQcGBgcHBQcGBwkIBwoJBwkIBwkIBQcGBQYFDxEOEhYUBAMDBwcHBggHCAgHBgYEFBYVBgYGBwgHCgwLCQsKCwwLDQ8ODA4NCgwLDQ8ODQ4NCQsKCgsKCgwLCgwLDA4NDhAPDA4NCAoJCQsKCwsLBgYHBwgJCQsKBwkKCQoLCgwLCw4NCg4OAgICAwMDAwMDAwMDBAQEAgICAwMDAwMDAgICAgICBAQEBQUFBAQEAwQEBAYFBwkIBQcGBggHBQcGBgYGCAoJBggHBggHBQYGBggHCAkIBAQECAkIAwMDAwICBgYGBgYGBgcGCAkJBQMEAgICBwcHBwcHBgcHCAkICAoJBwgICQsKCQsKCAoJCAoJCQsKCAoJDA4NDQ8OCw0MCQsKCQsKCQoJCQkJBQUFBQYFBQUFBAUEBwkICw0NDQ8ODA4OCw8OAgICAwMDBAQEAwMDAgICAgICAwMDAwMDAgICAgICAwMDBQUFAwICAwMDBAQEBwgHBQYGBAYFBQcGBQYGBQYFBwgHBggHCAoJBQUFBQUFBQUFBgYGBgYGBQUFBQYGBgYGBgYGBQYFBwYHBQYFBQUFBAQEBQUFBgYGBgYGBAQEBgYGCAkJCAsJCQsKCw0MCAoKCAgICQkJCAgIBgcHBwkIBwcHBwgIBgcGBQUFAwMDBgYHBwgIBwkHCQsKCQsLCgwLAwMDAgICAwMDAwMDAwMDAwMDAwMDBAQEAgICAgICAwMDAgICAwQDBAQEBAQEAgICBAQEBQUFAwMDAwMDAwMDBgUFBQYGCAkIAwMDBQUFCAgIBQUFBgYGBQYFBwYHBQUFBQUFBwcHBgYGBQUFBAQEBQUFBwcHBgYGBQUFBgYGCAgIBwgHAwQEBgYGBgcGCAkJBwcHBgYGBgYGCQkJBwgHBgYGBwgIBwgHBgYGBQUFBAQECAgICQsKCAoJBwkIBwkIBAQEBAQEAwMDAgICAwMDBQUFBQUFAwMDAwMDAwMDAwMDAwMDAwMDBAQEAgICBAQEBgYGBQUFAwMDAwMDAwMDAwMDBAQEAwMDAwMDBAQEBgYGBgYGBQUFBAQEBwcHBQUFBwcHAwMDBQUFBgYGBQUFBAQEAwMDBAQEBAQEBQUFBAQEBwYGBQUFBQUFBgYGCQkJCAgIBgYGCgoKBgYGBAQEBgUFBAUFBAUEBwcFCAgIBgcHBwcHBwcIBwcICAgKBwgJAwMDAgICAgICAgICAgICAwMDAwMDAgICAgICAwMDBAQEAwMDAgICAwMDBQUFAwMDBAQEBQUFAwMDAwMDAgICBAQEAwMDAwMDAgICAwMDBQUFBQUFBQUFBwcHBQUFBgYGBwcHAwMDBQUFBQUFBgYGCAgIAwMDAwMCBwcGCAgIBgYGBAQEBQUFBwcHCQkJBgYGBAQEBQUFBQUFBAQEBQUFBAQEBAQEBAQEBQUFCQkICAgJBgcICQoJBwYGCQkKCQoLAwMDAwMDAwMDAwMDAgICAgICAgICAQEBAQEBAgICBQUFAwMDAwMDAgICBAQEBAQEBAQEAwMDAwMDAwMDAgICAwMDBAQEBAQEAwMDAwMDBAQEBgYGBgYGBQUFBAQEBwcHBwcHBwcHBgYGBQUFBAQEBwcHCAgIBwcGBwcGCQkJCAgIBQUFCgoKDAwMBgYGBQUFBgYGBQUFAwMDBwcHBQUFBAQEBAQEBQUFBgYGBQUEBwgJCgsMCw0LCQkJCAgJCAoKAQEBAwMDAwMDAwMDAgICAgICAgICAQEBAgICAgICAwMDAwMDAwMDAgICAwMDAwMDAgICAgICAwMDAgICAgICAQEBAgICAwMDAwMDAwMDAwMDBQUFAwMDBAQEAwMDBAQEBAQEAwMDAgICAwMDAgICAwMDCAgJBgYGBAQDBAQEAwMDBAQEBwcHCAgIBQUFBAQEBAQEAwMDAwMDBAQEBAQEAwMDBAQEBQUFBQUFBAQEBQUGBgcHBwgHCQgJCAgIBgcH';
const SI_SPLASH_B64='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';
const SF_SPLASH_B64='AQEBAAAANTU1RUVFFxcXRUVFQEBAR0dHHBwcJCQkQUFBVVVVV1dXVlZWRkZGVFRUX19fIyMjPj4+SUlJb29vbGxsWFhYX19fTExMPj4+VVVVVFRUR0dHXV1dMDAwERERICAgQ0NDVVVVHR0dAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICXFxcU1NTMTExV1dXgYGBkpKSPz8/KCgohoaGhoaGLCwslpaWtLS0m5ube3t7IyMjRkZGjIyM3d3dy8vLj4+Pzc3NZ2dnbGxsdHR0Z2dnnJycvb29QEBAHx8fMzMzLi4ub29vPT09AAAAAgICAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQUFBAQEAAAADw8PAAAAPT09NjY2CwsLAwMDDg4OVFRUFhYWAAAAAQEBAAAAAAAAAQEBAAAAMjIyQEBAHBwcTk5ONTU1RkZGJSUlGhoaSUlJOjo6FhYWWlpaYWFhTk5OYGBgISEhOjo6RUVFaGhoaWlpZ2dnWFhYRkZGTExMOzs7Ozs7SEhIUVFRMDAwERERT09PNTU1VFRULy8vAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgICAAAANjY22dnZzMzMo6Oj6+vrdnZ2srKydHR0ra2tcXFxmpqaq6ur1tbWCQkJAAAAAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQIAAQAAAQAAAAAAAAAABAMABAQABAQABAQABAQABAMABAMABAQAAQAABAMDBAQASkpHx8bGsrOyt7i0wsK+o6KhUlJSgICApaWliYmJmpqah4eHnp6eGRkZAAAAAQEBAAAAAAAAAAAAAQEBAQEBAAAAAQEBAQECAAACAAABAAABAAACAQEBAQAAAAECAAACAAACAAECAAAAAAABAAACAAMDAAMDAAACAAACAAEBAAABAAABAAABAAECAAECAAABAAAAAAABAAEBAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBgkJCQcIAAAEAAAJBAYHAQEBDAwNBgYGCAgIDg4OERERAAAAAwMDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEABAQAkJAAqqYAqqcAkJAABAQAAgAAHQsApKIAqqMANggAHAcAqqMAqaIAqgYAqgYAqKIAqqMANgcAHAgAqqMAqqMANggAHAgAqp4AqaoAqisAqgEAqqYAqpoAqogAqqkAqqkAqqkAqqkAqogAqZoApqQADgcAIwcAqqMAo6IAEgQAAAUAnqEAo58AFAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAbGwA//8A//8A//8A//8AcW4AAAAARRQA//8A//8A3gsAWw0A//8A//8A/yMA/yMA//8A//8A3g0AWwsA//8A//8A3gsAWw0A//sA//8A/30A/wAA//8A//YA/94A//8A//8A//8A//8A/94A//YA//8ArQwAOwwA//8A//8AtA0BGQwB//8B//8BuhABAAAABAIBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIAAQEAwsEA/P8A+HYA+Z4A/P0A4b4AWwAARRUA+/AA+fEA/w4A6wsA+egA+/wA+0cA+0cA/PwA++gA/wsA6w4A+fEA+/EA/w4A6wsA+eoA+/sA+7cA+wUA+/QA++QA+74A++wA+/kA+/kA++wA+74A++QA+/IA/wsAvwsA+PAA+/EA/woAww4A+fEA+fAA/xIAgAAAAAEAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEA0A6vcA/9EA/gAA/xUA//MA/vkA/wIA8zkA//4A//4A/jkA/wQA/+0A//8A/3QA/3QA//8A/+0A/gQA/zkA//4A//4A/jkA/wQA//AA//8A/+gA/yEA/+4A//QA/xcA/RoA/vUA//UA/xoA/RcA/vMA//QA/g8A/w8A//QA//YA/gMA/zkA//4A/v4A+z0A/wAAQQMAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEg4A8fMA/uAA/gEA/wcA//8A/7wA/wEA/0gA//8A//8A/0MA/gMA/+8A//8A/6cA/6cA//8A/+8A/wMA/kMA//8A//8A/0MA/gMA//EA//8A//4A/1EA/+UA//cA/wgA/wcA//QA//QA/wcA/wgA//QA//MA/wAA/QAA//MA//YA/wIA/UMA//8A//8A+0cA/wAAnQMAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAQIACwEA4sIA//8A/Z4A/yMA/2oA/wwA/wAA/nkA//8A//8A/3MA/wAA//IA//8A/+YA/+YA//8A//IA/wAA/3MA//8A//8A/3MA/wAA//MA//8A//8A/48A/+AA/fgA/wwAtQwA5/QA//QA/wwAtQwA5/MA//gA/lwA/1wA//gA//YA/wAA/3MA//8A//8A/HgA/wAAvQQAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwMAAAAARkkA/f4A/v8A/t0A/ycA/wAA/wAA/5YA//4A//4A/5IA/wIA//IA//8A//8A//8A//8A//IA/wIA/5IA//4A//4A/5IA/wIA//MA//4A//0A/80A/+gA/PYA/wsAiQsA2fQA//QA/wsAiQwA2fAA//8A/v8A//8A//8A//IA/wIA/5IA//4A//4A/ZcA/wAAzQMABgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEAAAAALSEA86UA/v8A/v4A/0kA/wAA/8AA//8A//8A/7gA/wQA//EA//8A//wA//wA//8A//EA/wQA/7gA//8A//8A/7gA/wMA//gA/+gA/80A//0A//4A/PAA/wwAkgsA3PQA//QA/wsAkgwA3PAA//8A/v8A//8A//8A//EA/wQA/7gA//8A//8A/r0A/wAA8AIADwAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAABwkAeGoA+AQA/ocA//8A/90A/xMA/+cA/8oA/8oA/+QA/xUA/+wA//8A//8A//8A//8A/+wA/xUA/+QA/8oA/8oA/+QA/xQA//UA/+EA/48A//8A//8A/PAA/wwAkAsA2/QA//QA/wsAkAsA2/MA//gA/lwA/1wA//gA/+8A/xQA/+QA/8oA/8kA/ukA/ggA8wEAIgEAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAQEADAoAxMoA//8A/w4A/wIA/+EA//MA/yQA//oA/8kA/8kA//oA/yQA/+0A//AA/+cA/+cA//AA/+0A/yQA//oA/8kA/8kA//oA/yQA//EA/+YA/1EA//4A//8A/O8A/wwAkAsA2/QA//QA/wsAkAsA2/QA//MA/gAA/wAA//QA/+0A/yMA//oA/8kA/8gA//8A/RQA/wAAQAEAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A9PYA/PMA/hQA/wAA/9QA/+kA/0cA//wA//8A//8A//wA/0oA/+kA/+MA/8IA/8IA/+MA/+kA/0oA//wA//8A//8A//wA/0oA/+cA//IA/yEA/+gA//8A/O4A/wwAkAsA2/QA//QA/wsAkAsA2/QA//QA/g8A/w8A//cA/+YA/0oA//wA//8A//8A//wA/DoA/wAAawMAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgIAAQEAwL0A/v0A/J4A/3YA//8A/7EA/0oA//wA/+4A/+8A//wA/2QA/+QA/9wA/5UA/5UA/9wA/+QA/2QA//wA/+8A/+8A//wA/2QA/+AA//UA/wUA/7cA//sA/OkA/wwAkAsA2/AA//AA/wsAkAsA2/AA//AA/gsA/wsA//QA/+AA/2QA//wA/+8A/+0A//wA+1UA/wAAgAMAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAQAAAAAbGwA//8A+/8A//8A//8A/1cA/XgA/v8A/z8A/kAA/f8A/5kA//EA//cA/2MA/2MA//cA//EA/5kA//8A/0AA/kAA/f8A/5kA/+4A//8A/wAA/n0A/v8A/PsA/w0AkAwA2v8A//8A/wwAkAwA2v8A//8A/gwA/gwA/v8A/+4A/5kA//8A/0AA/j8A/f8A/IkA/wAAqQQAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgEABAQA05AA/6cA/KYA/5IA/wAA/1IA/6oA/xwA/x0A/6oA/lwA/5cA/5sA/zoA/joA/ZsA/ZcA/1wA/6oA/x0A/x0A/6oA/lwA/5YA/6cA/wEA/ysA/6oA+54A/wgAjgcA4aMA/aMA/wcAjgcA4aMA/aMA/gcA/wcA/6UA/5YA/1wA/6oA/x0A/xwA/6oA+1IA/wAAvwMAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAwMASQAA/wAA/gAA/QAA/wQA4wAA+wAA/wIA8gEA3wAA/wAA/gAA/wAA/wAA/wAA/wAA/wAA/AAA+wAA+wAA7wAA2wAA/wAA+gAA+wAA+wAA4QAA6QAA/AAA+wAAcQAAbAAA/wAA+wAAcQAAbAAA/wAA+gAA0QAA4AAA/gAA+gAA+wAA+wAA7wAA2wAA/wAA+wAA2gAACwAAAQAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbwAA/QAA+gAA8wAAIQAAYQAA/QAA4wAAFAAA1AIA/gAA+wAA/wAA1QAAuAAAxAAA/wIA/wQA/wEA9wIAJAUA5QMA/wQA/wUA/wEAuQIAOQUA/wUA/wEAhwEAAAUAuwUA/wEAhQEAAAUAvAUA/wEAtwEAOQUA/wQA/wMA/wUA/wIA9wIAJAUA5AMA/wEA/wEAEwEAAAEAAQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAACwsAn58ArKoAqagA+qgA/6kA7J4ApAwAq2QA/KoA/aoApmgA0gEA/3wA/KoA/yEA4SEAwqoAxI0AbQUAVAEAVwAAUgAAAAABKQABVgABVAABVgABQwABAAABQQABVgABLQABAgAAEwAAVgABLAABAQAAEwAAVQAAQQAAAAABQwABVgABVQABVgABVAABAAABKQABVgABTgABBgABAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEhIA/f0A//8A//8A//8A//8A//AA/3cA//8A//8A//8A//8A/1MA/2gA//8A/3sA/3sA//8A/3oAqgAAAAQAAAAAABQAAB0AABwAABwAABwAABwAABwAABwAABwAABwAABsAAB8AAB8AABsAAB0AACAAACAAACAAACAAAB4AAB0AABwAABwAABwAABwAABwAABwAABwAABwAABwAAB0AABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEREA6+sA+/sA++sA/+sA/+wA/swA+6kA/PwA//sA//oA+/wA/Y8A/xYA//kA/88A/s8A/fgA+igA/wAAhQIAAwUAB14BD1QPElUQE1UQE1UQFFUQE1UQEFUQE1UQE1QPF1oVB0wHBUkEF1gTEFMOAEUAAUUABEUAA0UACk8KEVMOFVcRE1UQFFUQE1UQEFUQElUQFFUQE1UQEFUQD1QPAV4BAAUAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A7vMA//QA/iEA/xMA/BQA/A4A/7sA//8A/2IA/2IA//8A/7sA/wAA/9UA//8A//8A/9IA+wQA/QIAtgABAAQAE0kQ4M7f7+Pv7uLu7+Pv7+Pv7+Pv7+Pv7uLu7+Pvz8LPHhIelYmVy77LVUlVAAAAAwADAQABEwcTSDtIjH+M59vn7uLu7+Lv7+Pv7+Pv7+Pv7+Pv7uLu7+Pv387fEEkQAAQAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A7vMA//IA/gAA/wAA/wAA/wEA/8wA//sA/xsA/xsA//sA/9EA/wAA/48A//4A//4A/48A/AAA/wQAVAABAAMAFVAR8vDy////////////////////////////+Pv4YmViAAEALzIvX2JfAAEAAgQCAQMBAAMAGBsYg4WDh4qHxsjG////////////////////////////////8vDyEVARAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAERAA7vEA//cA/WAA/1EAuAUAuhAA//cA/vMA/wsA/wsA//MA//kA/wMA/zgA//4A//0A/jwA/gAA8QMAHgABAAMAEk8R7ejt/v7+/f39/v7+/v7+/v7++/v7////wcHBCwsLAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBh4eH7+/vtLS08vLy/f39/f39/v7+/v7+/v7+/f39/v7+7ejtEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEREA7u4A//8A+/8A//wAnA0AKwsA//MA/fQA/wwA/wwA//QA//QA/wgA/xwA//gA//gA/B8A/wAAvwIAAAABAAMAEU8R7unu/////v7+/////////v7+/f394+PjODg4AQEBEhISAQEBAAAAAAAAAAAAAAAAAQEBAAAAAwMDg4OD2trazc3N/////v7+/////////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEREA7u4A//8A/v8A//wA/w0AwwsA/PMA//QA/wwA/wwA//QA//YA/wEA/1EA//8A//8A/FUA/wAAcgMAAAABAAMAEU8R7unu/////v7+/////////f399/f3kpKSPz8/DAwMCwsLAAAAAAAAAAAAAAAAAQEBAAAADQ0NHh4eUFBQ7e3tx8fH8/Pz/////////////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAERAA7vEA//cA/l8A/VAA+gQA/w8A//cA//MA/wsA/wsA//MA//oA/wIA/6QA//8A//8A/qoA+QAALAQAAAABAAMAEU8R7unu/////v7+/////f39////0tLSXFxcGxsbJiYmAAAAAQEBAAAAAAAAAAAAAQEBAQEBDw8PTExMp6en9/f31tbW29vb/////f39/////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A7vMA//IA/gAA/wAA/wIA/wUA/80A//sA/xsA/xsA//sA/8oA/wgA/+IA//oA/voA/+IA7g4ADwEAAAABAAMAEU8R7unu/////v7+/////f399/f3TU1NHh4eaWlpGhoaAAAAAQEBAAAAAAAAAAAAAAAAAwMDAAAAbm5u/////v7+7u7ux8fH/Pz8/v7+/////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A7vMA//MA/xMAqwQAVQQAYgAA9LoA//8A/mIA/2IA//8A/6wA/zEA//8A/7MA/7MA/P8A/j0AUAAAAAIBAAMAEU8R7unu/////v7+/Pz8////sLCwCAgIhYWFenp6AAAAAwMDAAAAAAAAAAAAAAAAAQEBAwMDAgICJCQk5ubm/Pz8/v7+uLi49fX1/////////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEQ8A7u8A/+8A/w8AeAAAAAUAAAAAm5oA/vwA+/oA//oA//wA/4cA/3UA//sA/1sA/1sA+/wA/4YAlwAAAAMBAAMAEU8R7unu/////v7+/f39////RkZGAwMDZmZmDw8PAgICAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoKCg////////1tbW6enp/////v7+/////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAERAA7f8A//8A/xAAggAABAUAAwAAZWUA//8A+/8A//8A//8A/2QA/9EA//8A/yEA/yEA/P8A/+MA4AYACAEBAAMAEk8R7unu/////Pz8////19fXQEBAR0dHLi4uMzMzAQEBAAAAAAAAAAAAAQEBAQEBGBgYLy8vFhYWAgICh4eH5eXl09PT4uLi1dXV/////v7+/////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQEAAAAAEAoA9KIA/aIA/woAgAAAAAEABQEABgUAqWYA/6oA/aoA/2QA/w0A/aQA/aMA/wYA/wYA/6IA/aUA/AwANgABAAQAE08R7unu/////Pz8////2dnZj4+PW1tbLS0tHR0dCwsLFxcXAgICAQEBAQEBAAAAJCQkdnZ2Tk5OPDw8dnZ2ysrK2NjY4+PjxcXF/////////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAQAAgQAA/wAA+wAAfgAAAAAABwAAAAAARQAA/wAA+gAA+wAA/AAA/wAA/wAA+wAA9gAA8AAA+QAA/AAAgAABAAMAFU8R7unu/////f39////3d3dvr6+KCgoJiYmAQEBOTk5MTExAAAAAQEBBAQECwsLKCgoa2troKCghoaG19fX4eHh9PT08fHxpqam9PT0/////////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAgAAAAQAtgQA/wAAhQAAAAAABAAAAwAAAAQAgAQA/wQA/wQA/wEAzwMAvgQA/wAAxQAAbQQA/wQA/wAAzgABAgMAEk8R7+nu/////Pz8////zc3NS0tLFhYWBwcHDAwMTExMcnJyRUVFBAQEGxsbTU1NV1dXTk5OtLS0////RUVFtra28/Pz////rKys29vb/////v7+/v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAEQAAVgABKgABAAAAAQAAAQAAAgAAAAAAUAAAVAAAUQAABgAADgAAVQAANwAADAAAVQAAVQAATgABAwMAEE8R7+nu////+/v7////vr6+Dw8PDAwMERERJCQkXV1doqKiUFBQDQ0NZGRkXV1durq6jIyM09PT/v7+sLCwlZWV6Ojo////uLi4uLi4/////f39/v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAQABAAAAAAAAAAAAAAAAAAAAAAABAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAMAEU8R7unu////+vr6////kZGRBgYGAwMDOTk5Pz8/lZWVra2tIyMjODg4XFxcTU1NsbGx3d3dtbW1uLi4f39/cXFxxsbG9PT0ycnJqqqq/v7+/v7+/v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAAAFQAREQAPAAAAAwACAAAAAAAAAQAABAAAAAAAAAAAAQAAAQAABAAAAwABAQAABAAABAAABAABAAMAEU8R7unu////+vr6////gICAAAAAAAAANzc3Ozs7lJSUYmJiHBwccXFxn5+fiYmJtLS07+/v5+fnz8/PREREd3d37Ozs9/f36+vrrq6u8/Pz/////v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwADAAAARwBH4wDj6QDpNgA2AAAAAwADAAAAAAAAAAAAEwATIAAgAAAABAAEAAAAAAAAAQABAAAAAAAAAQABAAMAEU8R7unu////+vr6////fX19BgYGKSkpREREMTExUlJSJCQkRUVFoqKiycnJ6Ojo////kJCQHh4eMzMzp6enZGRksrKy4eHh09PTxsbG5ubm/////f39////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAQABEQAR4QDhKgAqWgBaQABARwBHAwADAAAACAAIAgACIQAhOAA4AAAAAAAAAAAAAQABAAAAAQABAAAAAQABAAMAEU8R7unu////+vr6////e3t7CwsLMjIyPDw8Hh4eSUlJDw8PISEhLS0tWVlZ3Nzc/f39R0dHCAgIXV1d6urqjo6OpKSk7e3t////39/f09PT/////Pz8////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwADAAAAUQBRnACcAAAAAgACAAAAtwC3UQBRLwAvaABoAAAADQANDgAOAQABRgBGkQCR0gDSFQAVAQABAQABAQABAAMAEU8R7unu////+vr6////f39/CwsLKCgoQUFBAwMDAAAAFhYWWlpaAAAAAAAAZmZm////mJiYPj4+5+fn////wMDAsLCwy8vL////5ubm3d3d/////f39////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwADAAAAVgBWoQChAAAAAAAARgBG6ADolQCVRABExgDGOAA4SgBKjwCPAAAA3wDfmwCbmACYigCKAwADBQAFAQABAAMAEU8R7unu////+vr6////kpKSCQkJJCQkWFhYCwsLAQEBAgICAAAAKSkpCgoKMTEx9PT0+/v7/f39/////f395+fn3t7em5ub19fX1dXV0tLS/////f39////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgACAAAALwAv8wDz1gDWMAAwKgAqxQDFBAAEMwAzxwDHoQChSgBKkACQBAAEyQDJIQAhTgBOVgBWAAAAAAAAAQABAAMAEU8R7unu////+/v7////rq6uAwMDEBAQNDQ0CwsLAAAAAQEBAQEBICAgBQUFDg4O2tra////9vb28PDw////////9vb2enp6wcHB8fHxv7+//v7+/f39////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAAAHgAejwCP7wDvCgAKpACkJQAlCAAIGQAZmACYUABQiwCLAAAAogCiRwBHxQDFawBrmwCbKQApAQABAAMAEU8R7unu////+/v7////vb29DQ0NAAAACQkJBgYGAAAAAAAAAAAAAAAAAAAAExMT0tLS/v7+9fX18fHx/v7+8PDw2NjYWFhYhISE+/v7v7+/+vr6/v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAAAAAAAowCjZABkmACYEwATAAAAPAA8pQClPQA98ADwgwCD0QDRcABwlwCXXQBdJgAmCAAIAQABAAMAEU8R7unu/////f39////5OTkERERAQEBAAAAAAAAAAAAAAAAAAAAAgICAQEBCAgIzc3N/////Pz8+Pj4////7+/v6+vrOjo6OTk59vb2xcXF+Pj4/v7+////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwADBwAHAAAAYQBhiwCLqgCqgQCBWgBa6gDquAC4pgCmewB7ZgBmxwDHEAAQAAAAAAAAAAAAAAAAAQABAAMAEU8R7unu/////f39////6urqDg4OAAAAAQEBAAAAAAAAAAAAAAAAAQEBBAQEBQUFzMzMw8PD5ubm/////v7+////////KSkpLy8v4eHhvb297u7u////////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIwAj2gDaVABUNgA23wDflwCXVwBXLQAtFQAVAAAAAAAAsACwIAAgAAAAAAAAAQABAAAAAQABAAMAEU8R7unu/////f39////4uLiExMTAQEBAQEBAAAAAAAAAAAABAQEAAAAAAAAAAAAYWFh+/v79fX1/v7+/v7+/f39+fn5IyMjKysr8vLyzs7O6Ojo////////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABBAAEVQBVuAC48gDypgCmBQAFAAAAAAAAOgA6FgAWAAAAAAAABQAFFAAUcwBzdwB3lgCWHwAfAAAAAQABAQABAAMAEU8R7Ofs/v7+/v7+/v7+/Pz8Li4uAAAAAgICAAAAAgICAAAANzc3n5+fjo6OAQEBhISE/////////////////f39/Pz8KysrQkJC+vr6ysrKz8/P////////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAImgCabwBvFgAWAAAAAAAABwAHAgACmQCZTwBPMQAxQwBD2QDZaABoAAAAlgCWsACwTQBNAAAAAwADAQABAAMAElAS9vH2////+/v7/Pz8/f39ZWVlAAAAAwMDAAAAAQEBAAAACAgIk5OTk5OTAQEBkZGRr6+v1tbW6+vr/v7+/v7+8PDwQEBAbm5uxMTEl5eX1tbW////////7unuEU8RAAMAAQABAAAAAAAAAAAAAAAAAAAAAAAAAQABAgACAQABcQBxgACAUgBSAAAABAAEAwADAAAAegB6fAB8gwCDsACwiwCLAAAABgAGEAAQQABAUABQAgACAgACAQABAAUADEgMysbK9vb2////+Pj4////iYmJAAAABAQE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';
const SF_GAMEBG_B64='fn5+dnZ2cXFxcnJycnJyc3Nzc3Nzc3NzdHR0dHR0c3NzdHR0dXV1dXV1dXV1dXV1dXV1d3d3dnZ2dHR0dHR0cHBwbm5ub29vc3NzeHh4enp6e3t7e3t7fHx8fHx8fHx8fHx8f39/gYGBf39/f39/fn5+fX19f39/f39/IiIiOjo6aGhoZmZmaWlpaGhoZ2dnZ2dnZmZmZ2dnaGhoaGhoaWlpaWlpaGhoZ2dnZmZmZWVlYGBgX19fX19fXl5eXl5ee3t7cnJybm5ubm5ub29vb29vb29vcHBwcXFxcnJyc3NzdHR0dnZ2eHh4eHh4dnZ2dXV1cnJydHR0f39/iIiIkZGRhYWFeXl5cXFxbm5udXV1fHx8e3t7e3t7fX19fX19fn5+f39/gYGBgYGBgYGBgICAfn5+gICAfX19Pz8/TU1NXV1dXl5eYWFhYGBgX19fYGBgZWVlZ2dnZ2dnZ2dnZWVlZWVlY2NjYGBgYGBgXV1dYGBgXl5eWVlZWVlZWFhYiIiIfn5+f39/gICAfX19enp6enp6eXl5d3d3dnZ2dXV1d3d3enp6eHh4eXl5dXV1cXFxlJSUw8PD39/f4uLisbGxwMDAy8vLwsLCo6Oje3t7a2trcnJyd3d3dXV1dnZ2eHh4eXl5e3t7fHx8f39/gYGBgICAgoKCeXl5XV1dbm5uW1tbYWFhZGRkZ2dnaGhoaGhoaGhoaGhoampqa2trbGxsa2traGhoaWlpampqZmZmZmZmZmZmZmZmZGRkZGRkXl5eW1tbX19fYWFhZmZmampqaWlpampqb29vdXV1eHh4e3t7fHx8fn5+e3t7eXl5pKSkqqqqoKCgwMDAx8fHs7OzaGhonp6e5OTk+vr64uLitra2dnZ2c3NzgoKCgYGBg4ODgoKChYWFhoaGiYmJjIyMioqKi4uLgICASUlJdHR0XFxcX19faGhoaWlpbGxscHBwbm5ubm5ucHBwcHBwbm5ubW1ta2tra2trbGxsaWlpaGhoZmZmZGRkYmJiY2NjGxsbGhoaGBgYExMTDg4OEBAQExMTFxcXHh4eICAgJSUlLy8vKysrJSUlLy8vm5ubn5+fj4+PioqKdXV1qamp6enpf39/g4ODxsbG4+Pj4uLi5OTk2tracHBwSEhIV1dXWlpaX19fYmJiaGhobm5ucnJydHR0enp6W1tbEhISNzc3QEBARERET09PV1dXXV1dZmZmZGRkampqbm5ucnJycXFxcnJyc3NzdXV1dnZ2dHR0cnJycXFxcHBwcHBwdHR0KSkpKCgoKysrLi4uLS0tMTExMjIyLy8vKCgoQEBAWFhYMTExNzc3QUFBkpKSsbGxlZWVj4+PeXl5jo6Oo6Oj2dnZr6+vioqK1dXV4+Pjzs7OyMjI5eXlyMjIKioqGhoaHx8fISEhJCQkKCgoKCgoJSUlJSUlLy8vKioqHh4eHBwcHx8fHx8fGxsbHR0dJSUlICAgHR0dJCQkJiYmJiYmJiYmISEhHh4eICAgJCQkKSkpKCgoKCgoKCgoKCgoKioqQUFBQkJCQ0NDQ0NDSUlJR0dHPj4+PDw8PDw8TExMUlJSSUlJSEhIoKCgyMjIl5eXj4+PjY2NoqKira2ts7Ozp6en1NTUrq6uqKiotLS009PT5ubm0tLS09PT2traWFhYLy8vOTk5Ozs7NjY2Li4uLy8vNDQ0ODg4Ojo6NDQ0MzMzODg4Pz8/NjY2NTU1Ozs7Nzc3Nzc3Pj4+QUFBPDw8OTk5NDQ0MzMzMjIyLCwsKysrKioqKCgoIyMjJSUlHx8fbW1taGhob29vYGBgVlZWVFRUUVFRW1tbXl5eXV1dW1tbXl5efn5+1NTUrq6ue3t7j4+Pr6+vvLy8wMDAioqKV1dXs7Oz0tLSioqKra2tfHx8oaGh5eXl2dnZ5+fnsbGxPz8/XV1dXV1dWlpaX19fXV1dWFhYWFhYU1NTSUlJSUlJRUVFQUFBSUlJTExMTExMSkpKPDw8OTk5NjY2NjY2NTU1ODg4PT09OTk5MTExMjIyNTU1Nzc3Ly8vMTExNzc3hYWFfn5+ioqKioqKf39/dHR0dHR0fHx8gICAdnZ2dHR0goKC4+Pj0NDQi4uLmJiYw8PDzMzMvLy8i4uLiYmJe3t7np6elZWVm5ubo6OjxcXFlpaWoqKiy8vL5eXl5+fnoqKieXl5g4ODenp6f39/g4ODeXl5c3Nzb29vbGxsbW1tampqampqcnJybW1tVlZWV1dXQ0NDRkZGRkZGPj4+QUFBRkZGPj4+Nzc3MjIyNjY2NjY2REREPz8/LS0tOjo60dHR1dXV2dnZ1dXVw8PDr6+vsbGxvb29y8vLvr6+zs7O4+Pj4uLixMTEvLy819fXw8PDrKysjo6OoaGhoqKijY2NsLCwmpqap6ens7OzuLi4wMDAwMDAyMjIycnJ8/Pz6OjojIyMhoaGhISEf39/goKCg4ODioqKj4+PioqKhoaGgYGBhYWFhYWFhISEfHx8dHR0bGxsfHx8fn5+dnZ2dXV1b29vbm5uZ2dnW1tbT09PTk5OUFBQWlpaUlJSQ0NDqqqqnJycmJiYi4uLj4+PtbW1tLS0sbGxqqqqpqamvr6+9/f3xsbGoqKigYGBc3NznJycsLCwuLi4vr6+tra2rq6uwMDAtLS0t7e3rKystLS0t7e3paWlmZmZu7u739/f+Pj409PTx8fHw8PDv7+/vLy8srKypqamnp6eo6Ojqqqqnp6emZmZk5OTioqKh4eHkJCQlJSUkZGRlJSUkZGRiYmJh4eHiIiIhoaGhYWFhYWFjY2NgYGBa2trbGxsa2trbm5uWVlZXFxcWFhYWFhYhYWFlpaWjY2NkJCQh4eHq6ur3d3dmJiYfX19kpKSoqKitra2o6Ojn5+fnp6ehoaGdXV1pKSkuLi4urq6t7e3pKSkmZmZjY2NQUFBgoKCwcHB+Pj47+/v0NDQzs7O19fX29vb4+Pj7Ozs7+/v9PT09/f3+Pj48/Pz6enp19fX2dnZ3t7ezc3NpqamoaGhq6urvb29ycnJzc3Nzs7Oz8/P0NDQzMzMw8PDv7+/wMDAwcHBy8vLxcXFzc3NysrKwcHBv7+/xcXFu7u74uLi9/f38fHx2dnZurq6mJiYgoKCZGRkgYGBYWFhhYWFkpKSS0tLS0tLbm5unp6eurq6h4eHRkZGOTk5VlZWLy8vVFRUnZ2dxsbGrKysjIyMhoaGg4ODfX19f39/gYGBjIyMkZGRr6+vx8fH1tbW3d3d6enp9PT09fX18/Pz9fX19PT08/Pz8/Pz8fHx8fHx8fHx7+/v8PDw7+/v7Ozs6+vr8PDw6+vrt7e3ra2tuLi4rq6utra2ubm5q6ursrKyysrK9vb26Ojow8PDmpqae3t7XV1dUVFRZmZmeHh4hoaGlZWVk5OTmpqalZWVjIyMkZGRbW1tXl5eXl5ednZ2KCgoTExMpaWlwsLCr6+vt7e3tLS0srKyr6+voKCglpaWkpKScHBwb29vY2NjXV1dVVVVZGRkZ2dnhYWFi4uLmpqarq6ux8fHysrKwMDAxsbGzMzMz8/P2NjY4uLi5ubm5OTk4uLi5eXlsLCwtLS0s7Ozs7Oz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cXFxk5OTn5+fq6urw8PDwsLCtbW1tra2ioqKgICAiYmJi4uLioqKj4+Pk5OTl5eXmZmZm5ubn5+fo6Ojo6OjoaGhnZ2dmJiYk5OTk5OTkZGRkJCQkZGRkJCQjo6OkJCQlpaWnJycp6ent7e3oaGhnp6enp6en5+fo6Ojnp6eoKCgsrKypqamoaGhpKSktLS0rq6uoqKioqKioaGhlJSUaWlpTU1NKSkpKioqa2trhISEe3t7enp6goKChISEeHh4a2trXV1drKysyMjIt7e32NjY39/fyMjIxsbGrKyskJCQjo6OkJCQjo6OioqKjo6Ok5OTkpKSkpKSlpaWlJSUkpKSlpaWlZWVlJSUkJCQj4+PjY2NjIyMioqKj4+PlJSUkpKSlZWVlpaWjIyMw8PDw8PDwsLCwcHBvr6+tbW1xMTEsrKyi4uLmZmZqqqqubm5vr6+urq6r6+vpKSkpqamg4ODfn5+ZmZmNzc3cHBwpqamo6OjlZWVjY2Nh4eHfX19hYWFdXV1iIiIzMzM4uLi0tLS7e3t2dnZysrKr6+vjIyMmJiYkZGRhoaGioqKk5OTlZWVoKCgnZ2dj4+PlpaWo6Ojl5eXj4+PiYmJjo6OlZWVk5OTjo6OiIiIh4eHhYWFiYmJioqKj4+Pmpqa5OTk4uLi4eHh4eHh39/f39/f0tLSkZGRlJSUqKiovLy8wsLCwsLCwMDAubm5sLCwr6+vlpaWfHx8g4ODcXFxdnZ2j4+PmZmZnJyclJSUkZGRjo6OhISEnJycpKSko6Ojx8fH0NDQ0NDQ7u7u6OjoyMjIqKioiIiImJiYsLCwjY2NqqqqoKCgnJycm5ubj4+Pqqqqqampi4uLkZGRuLi4rKyslJSUpKSkoaGhnZ2dm5ublZWVlZWVmJiYjo6OVlZW8fHx7e3t7Ozs7u7u6+vr7Ozsra2tj4+Pn5+frq6utbW1tra2uLi4ubm5ubm5t7e3tbW1p6eniYmJh4eHgYGBjIyMl5eXj4+PlpaWmZmZm5ubpaWll5eXo6OjtbW1qKiolZWV0NDQ2NjY6Ojo9/f38fHx6+vr29vbpaWlj4+PlZWVkJCQs7OzrKysjY2NlpaWnJycnZ2dk5OTmJiYpKSkmpqajY2NlpaWnp6emZmZl5eXjIyMpaWlqampUlJSQEBA8vLy7u7u7u7u7+/v7+/v5eXlm5ubmZmZpKSkq6urrq6ur6+vtLS0t7e3tra2tbW1srKyqqqqkpKSmZmZiIiIlJSUoqKipqampKSkqKiosrKysbGxlpaWnZ2dubm5np6epaWlqampwMDA2tra8vLy9vb26+vr5+fn2NjYqampkpKSlpaWk5OTlZWVm5ubnp6el5eXn5+foaGhjo6Ojo6Ok5OTioqKiYmJh4eHf39/ioqKtra2p6enX19fYGBgfn5+8PDw7u7u7+/v7u7u7+/v4+PjoqKioaGhqKioq6urrq6ur6+vsbGxsbGxsbGxrq6utLS0sLCwpqamk5OTnp6epKSknZ2dtbW1r6+vt7e3vr6+x8fHr6+vg4ODubm5qKiosbGxq6urtbW1ubm509PT29vb7Ozs7+/vrq6u19fXz8/PjY2Nra2tra2tpKSknp6emJiYl5eXn5+fkJCQj4+PjIyMjIyMg4ODg4ODrq6uzc3NqKioZ2dncnJyg4ODh4eH7u7u7e3t7+/v8fHx8fHx6urqrq6upaWlqqqqra2trKysrKysra2tqqqqo6OjmpqapKSksbGxqampoaGhoaGht7e3qqqqtbW1srKytbW1vb29xMTE19fXsrKykZGRurq6ra2tsrKys7OzsrKytLS0urq6xMTE09PTxcXFyMjI+fn5tbW1paWlq6urlpaWmJiYkpKSkpKSkpKSj4+PlJSUm5ubmJiYpqamyMjIt7e3h4eHbm5ud3d3gYGBi4uLjo6O8PDw8PDw8fHx9PT09PT09/f3u7u7qKiora2tra2trKysq6urqqqqqKiompqaeXl5mJiYra2trKyssrKyq6ururq6urq6sbGxurq6q6urubm5wMDA39/f+fn5o6OjpKSkubm5t7e3uLi4tra2wsLCxMTEu7u7sbGxqampnJycgICAzc3Ntra2p6ennp6empqamJiYoKCgsLCwvLy80NDQ5eXl3d3dv7+/lpaWd3d3dnZ2fn5+hYWFi4uLkZGRjo6O9vb29vb29vb29fX19vb2////2NjYpKSkqKioqampqqqqqampqamppaWlk5OTaWlpi4uLq6urra2tpaWlsLCwurq6urq6vb2929vbwMDAsrKyuLi42tra+fn56OjolpaWpqamqqqqr6+vurq6xcXFxsbGv7+/ubm5qampgYGBmpqaxMTEra2ttbW1xMTE1NTU4uLi7+/v8/Pz+vr69PT00dHRoKCgfn5+e3t7gYGBgoKCh4eHjo6OkZGRkJCQj4+P+Pj49vb29/f39/f39vb27Ozs3t7era2tnp6eoaGhoaGhpKSkp6eno6Oji4uLeXl5o6OjqKiooaGhn5+fsLCwt7e3srKyyMjI5+fn6+vr3t7eycnJ5ubm7+/v8PDwtLS0hYWFjY2NkZGRo6OjsbGxsbGxrq6ur6+vnZ2doqKioKCgw8PD+Pj48fHx9vb28/Pz7u7u6+vr7Ozs4ODgrq6ujIyMfn5+f39/g4ODhYWFh4eHjIyMj4+Pjo6Oj4+PkJCQ+Pj49/f39PT08fHx8vLy4uLi5eXl0NDQmpqanp6enp6eoKCgp6enqKiojIyMhYWFtbW1ra2tnZ2dq6urs7OztbW1wMDA3t7excXFq6urpKSki4uLr6+v4+Pj3NzcvLy8kZGRhoaGfX19eHh4jIyMlZWVmJiYmJiYfHx8g4ODwMDA+/v79PT08/Pz8fHx7e3t8vLy6urqycnJmZmZhISEhISEh4eHhoaGi4uLj4+PkJCQj4+Pj4+PkZGRkpKSkZGR+vr6+fn59fX18PDw7Ozs8vLy/Pz88PDwnZ2dlpaWmJiYnp6eqKioqqqqkJCQiIiIu7u7sbGxo6Ojq6urs7Ozv7+/r6+vcXFxR0dHT09PZ2dnioqKoqKi3Nzc29vbubm5mZmZi4uLmZmZioqKg4ODg4ODlZWVtLS0x8fH4+Pj9/f37+/v8PDw7+/v7+/v9fX15ubmr6+vhYWFg4ODhYWFi4uLjIyMjY2NkJCQkpKSlJSUlZWVlZWVlpaWlpaWj4+P9/f39fX19fX19fX19fX19fX17u7u8vLyubm5kJCQlJSUm5ubo6OjpaWllZWVf39/sLCwtLS0oaGhpqamtLS0w8PDdXV1aWlpsrKy2tra39/f2NjYy8vLtbW1goKCoaGhn5+fiYmJkJCQmZmZqKioqKiomJiY2dnZ9vb27e3t7u7u7+/v7+/v7Ozs7+/v1dXVmZmZgYGBgICAhoaGjIyMj4+Pj4+PkZGRkpKSlZWVmJiYmpqanJycmZmZkZGRkZGR7e3t8fHx9PT09fX19/f38fHx6+vr7Ozs29vbk5OTkpKSmZmZn5+fpaWlm5ubcHBwpqamubm5p6enoaGhtbW1vLy8v7+/3Nzcrq6ucHBwU1NTRUVFREREXl5ej4+Ptra2kZGRk5OTnp6eo6Ojnp6emJiYiIiI1dXV9vb27e3t7+/v7Ozs7+/v8fHxyMjIjY2NfX19hISEiIiIjY2NkZGRkpKSlJSUlZWVlZWVm5uboKCgnZ2dnJyclpaWlpaWvLy8+vr6+Pj49/f39/f39vb29PT08fHx7e3t8vLytbW1kZGRnZ2do6OjqKioo6OjYWFhhISEwMDAtLS0p6entLS0np6eV1dXSEhISkpKcnJyn5+fvr6+ysrKzMzMs7OzjY2NpaWlra2tmpqamJiYlpaWkpKShoaG3t7e/f399/f37+/v7Ozs5+fnubm5gYGBfn5+gYGBiIiIjIyMjo6OkpKSk5OTlZWVmZmZmZmZoKCgoaGhn5+fmJiYlpaWyMjI1dXV7u7u6+vr8fHx9vb2+Pj4+Pj49/f38/Pz9vb24eHhmZmZmZmZpKSkqKiopqamjo6OeHh4qKiouLi4sbGxq6uroqKim5ubsLCwxsbGwsLCmJiYfHx8Z2dnYGBggICAwcHBvr6+oqKil5eXlZWVlZWViYmJkpKS9/f3wcHBycnJ8fHx0NDQqampgoKCfn5+gICAh4eHjIyMjo6OkJCQk5OTlZWVmZmZnJycn5+fpqampKSknZ2dlJSUzc3N7e3t4eHh8/Pz7+/v8/Pz9fX19fX19PT09fX18vLy8/Pz/Pz8urq6jo6OoaGhqKiopqammpqaxsbGlZWVrKyss7OzqKiomZmZlpaWfHx8X19fX19ffX19sLCwx8fH2NjY3d3dvr6+rKyso6Ojnp6el5eXlpaWfn5+n5+f////xMTEMTExampqnJycfHx8fX19gYGBhYWFh4eHjY2NkZGRkpKSlJSUmJiYnZ2doaGhoaGho6Ojo6OjlZWVvr6+8PDw5OTk4uLi+vr6+vr6+vr69vb27+/v6+vr7u7u9vb2+fn5////0tLSkpKSoaGhpqamqampk5OTycnJ4eHhn5+fsbGxq6urxsbG09PTysrK0dHR4+Pj7+/v7Ozs4+Pj0NDQv7+/vb29qampoKCgnp6emZmZlJSUe3t7uLi4+vr6+Pj4SUlJFBQUj4+PcHBwfX19g4ODioqKiYmJjo6OkJCQkpKSl5eXnZ2doKCgpKSkpKSko6Ojm5ubtra27Ozs5+fn5eXl39/f9vb29vb29/f3+fn5+/v7/f39/v7+/v7++/v7////0dHRkZGR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AAAAAAAALi4uZmZmoaGh3t7e6enp3d3d1tbW0tLS1NTUz8/Pqampo6OjpaWlo6OjoaGhn5+fnZ2dm5ubmJiYlZWVlJSUlZWVl5eXl5eXkpKSj4+P/v7+/v7+/v7+/v7+/v7+/v7+/v7+/f39////ysrKmJiYpqamr6+vra2twsLC/////Pz8/Pz8/Pz8/Pz8/Pz8/f39+fn59vb2/Pz8+fn5/f390NDQmpqaoqKip6ensbGxp6enc3NzFhYWAAAAODg4dXV1oaGhsrKytLS0ra2tqqqqrq6ura2tra2tr6+vr6+vpaWlo6OjoaGhoKCgn5+fn5+fn5+fnp6enJycmJiYl5eXl5eXlpaWlZWVlJSUkpKS/v7+/v7+/f39/v7+/v7+/v7+/v7+/Pz8////x8fHlpaWqKiorq6uqqqq29vb/////Pz8/Pz8/Pz8/Pz8/Pz8/f39+fn59/f3/Pz8+fn5+Pj4/f39vb29jo6OgoKCXl5eICAgAAAAKysrgoKCp6enqKiooKCgn5+fnJycnZ2doaGhqKiop6enqampq6urrKysra2tq6urqqqqqampqKioqKiop6enpqamoqKioKCgoKCgoaGhoaGhoKCgnZ2dmpqa+Pj4/////v7+/v7+/v7+/v7+/v7+/f39////wMDAl5eXra2tra2ts7Oz7+/v/////Pz8/f39/f39/Pz8/f39/v7++vr6+fn5/Pz8+/v7+Pj4////wsLCFxcXCgoKAAAAAQEBYmJip6enpaWloqKipaWlqKioqKiop6enqqqqra2trKysra2tr6+vsLCwsbGxsrKysLCwsLCwsLCwsLCwrq6urq6urq6ura2tqqqqqampqKiop6enpKSkn5+fmZmZ+vr6/f39/Pz8/v7+/v7+/v7+/v7+/Pz8////vb29oqKit7e3s7Ozw8PD+/v7/f39/f39/f39/f39/Pz8/f39/v7++vr6+Pj4/Pz8+/v7+Pj4////wcHBAAAABAQEBAQEWFhYrKysmpqanJycoaGhpKSkpaWlpaWlpqamqampq6urq6urrKysra2trq6ur6+vsrKysrKyrq6urKysrKysqqqqqampqampqKiop6enpaWln5+fmpqalJSUkJCQjIyM/f39/f39/f39/v7+/v7+/v7+/v7+/v7+/v7+s7OzrKysvr6+uLi42dnZ////+/v7/f39/f39/f39/f39/f39/f39/Pz8+vr6/Pz8/Pz8+vr6+vr68/PzlZWVFxcXBgYGi4uLkpKSkJCQmJiYnJycoaGho6OjpKSko6OjpKSkpaWlqKioqampq6urrKysrKysrKysrKyspKSkoqKioaGho6OjoaGhnZ2dmZmZl5eXk5OTjIyMh4eHf39/dnZ2aGho/f39/f39/Pz8/f39/v7+/v7+/f39////9fX1pKSks7OzwcHBwMDA8vLy/v7+/f39/f39/f39/f39/f39/f39/f39/Pz8+/v78fHx9vb2/f399/f38PDw////kpKSAAAAbm5uk5OTioqKkpKSk5OTmJiYnJycm5ubm5ubm5ubnZ2dnp6en5+foKCgoaGhoaGhoaGhoKCgmZmZmZmZmZmZlJSUk5OTkZGRjIyMgoKCfX19cnJyZWVlVlZWW1tbg4OD/Pz8/f39/f39/f39/v7+/v7+/v7+////4uLikpKStbW1v7+/zc3N/f39/v7+/v7+/v7+/f39/Pz8/Pz8+/v7/////Pz8+vr69fX19PT07+/v5ubm4uLiycnJjY2NOjo6Hx8fRUVFYmJid3d3hoaGjY2NkZGRlJSUlZWVlZWVlZWVlpaWlpaWlpaWl5eXmZmZl5eXlZWVk5OTjY2NhoaGfHx8cHBwZWVlWVlZTk5OREREQUFBMzMzODg4VVVVa2tr/////Pz8/f39/f39+/v7+vr6+fn5+Pj4qampkpKSubm5urq63d3d/////Pz8/f39/v7+/f39/Pz8/Pz8+/v79vb26urq8fHx8/Pz5ubm4+Pj39/f1dXVubm5nJychoaGY2NjPj4+QkJCPj4+SEhIV1dXYmJiaWlpbm5ub29vcnJydXV1dHR0dHR0cnJybm5uaWlpaGhoZWVlX19fXFxcV1dXVFRUWFhYXl5eYGBgYWFhcXFxaGhobm5udnZ2d3d35+fn4eHhzs7Ourq6tbW10dHR8vLy3NzcoKCgpKSksbGxysrK9vb2/////f39/////v7+/Pz8+/v7+vr69/f36urq4eHh4eHh4+Pj4eHh3d3d19fXy8vLvr6+sbGxmpqakZGRjY2Ni4uLe3t7dnZ2c3NzdHR0bGxsZmZmZmZmZWVlcXFxampqampqbGxscXFxbGxsenp6hISEf39/j4+PkpKSlZWVl5eXmZmZl5eXkpKSl5eXkpKSlJSUmpqaoKCgdHR0bW1taWlpjo6OtLS0y8vL1NTUwsLCurq6sLCwl5eXzs7O/////Pz8/v7+/////v7+/f39+Pj48fHx7Ozs5ubm4uLi4uLi3d3d2tra19fX0tLSzMzMw8PDtbW1rq6upqamoqKioKCglpaWm5ubm5ubnZ2dn5+fnJycnJycmpqapaWloaGhn5+fpqamrKyspqamqamptLS0r6+vtLS0s7OztLS0tLS0tLS0tbW1sLCwtLS0sbGxra2ts7Ozubm5t7e3o6OjioqKoKCgs7OznJycdXV1goKCjo6OlZWVoKCg4eHh/f39+vr69vb29vb29fX18/Pz7u7u6urq5+fn4eHh4uLi4ODg29vb0tLS09PTzs7OyMjIxMTEvr6+u7u7u7u7tbW1wcHBwsLCxcXFysrKy8vLy8vLyMjIx8fHyMjIyMjIxsbGwsLCwsLCwsLCu7u7wcHBy8vLxcXFycnJzMzMyMjIxsbGw8PDxcXFwcHBwcHBwsLCwcHBxcXFxMTE////yMjIp6enubm5sbGxrq6upKSkt7e3yMjI0dHR3Nzc8vLy8PDw6enp6Ojo6+vr6Ojo6enp6enp5OTk4uLi29vb3d3d3d3d2NjY0tLS09PTzMzMxsbGyMjIxsbGyMjIzMzM39/f9/f3/v7+/Pz8/Pz8/Pz8/Pz8+vr6+fn5+vr6+fn59/f39PT08PDw6enp29vb09PT29vb1dXV09PT2dnZ1dXV09PTz8/P0NDQ09PT0NDQ09PT0dHR1NTU3t7e';
function initRetro(){
  retroGames=[
    {name:'jetpac',t:0,playerX:10,playerY:20,jetY:0,fuel:[],aliens:[],rocketParts:0,phase:'build',partX:50,partY:55,carryPart:false,laserT:0,laserDir:1,phaseT:0,launchT:0},
    {name:'manic',t:0,playerX:5,playerY:5,dir:1,jumpT:0,jumping:false,platforms:[],items:[],enemyX:[]},
    {name:'outrun',t:0,roadOff:0,carX:32,speed:0,trees:[],curves:0},
    {name:'invaders',t:0,invX:5,invY:32,invDir:1,bullets:[],playerX:30,bombs:[],invAlive:[],shieldDmg:new Set()},
    {name:'jsw',t:0,playerX:10,playerY:10,dir:1,jumpT:0,jumping:false,room:0,roomT:0},
    {name:'deathchase',t:0,speed:0,treeOff:0,bikeX:32,leanDir:0,enemyX:20,enemyZ:40,hit:false,hitT:0,bullets:[],fireT:0},
    {name:'rtype',t:0,shipX:10,shipY:32,bullets:[],enemies:[],chargeT:0,scrollX:0,bossHP:20,bossX:55},
    {name:'wolf3d',t:0,posX:2.5,posY:2.5,dirA:0,gunFrame:0,fireT:0},
    {name:'quake2',t:0,posX:3,posY:3,dirA:0.5,bobT:0,muzzleT:0,enemies:[]},
    {name:'samfox',t:0,cards:[],dealT:0,phase:'deal',resultT:0,hand:'PAIR'},
  ];
  // Manic Miner platforms
  const g=retroGames[1];
  g.platforms=[[0,10,63],[15,20,40],[30,30,55],[5,40,35],[20,50,60]];
  g.items=[];
  for(let i=0;i<6;i++) g.items.push({x:8+i*9,y:g.platforms[i%5][0]-5,collected:false});
  g.enemyX=[20,40];
  // Space invaders
  const inv=retroGames[3];
  inv.invAlive=[];
  for(let r=0;r<5;r++) for(let c=0;c<8;c++) inv.invAlive.push({r,c,alive:true});
  // R-Type enemies
  const rt=retroGames[6];
  rt.enemies=[];
  for(let i=0;i<5;i++) rt.enemies.push({x:50+i*12,y:15+i*8,alive:true,type:i%3,phase:i*2});
  retroFaceBuf=new Float32Array(SIZE*SIZE*3);
  retroInit=true;
}

function retroDrawTitle(buf,S,name){
  const setP=(x,y,r,g,b)=>{
    if(x<0||x>=S||y<0||y>=S) return;
    const i=(y*S+x)*3; buf[i]=r; buf[i+1]=g; buf[i+2]=b;
  };
  const fillRect=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) setP(x,y,r,g,b);
  };
  const hLine=(x1,x2,y,r,g,b)=>{ for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) setP(x,y,r,g,b); };
  // 5x7 bitmap font used by custom splash screens and generic title
  const font={
    A:[0x1F,0x11,0x11,0x1F,0x11,0x11,0x11],B:[0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
    C:[0x0F,0x10,0x10,0x10,0x10,0x10,0x0F],D:[0x1E,0x11,0x11,0x11,0x11,0x11,0x1E],
    E:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F],F:[0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
    G:[0x0F,0x10,0x10,0x17,0x11,0x11,0x0F],H:[0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
    I:[0x0E,0x04,0x04,0x04,0x04,0x04,0x0E],J:[0x01,0x01,0x01,0x01,0x11,0x11,0x0E],
    K:[0x11,0x12,0x14,0x18,0x14,0x12,0x11],L:[0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
    M:[0x11,0x1B,0x15,0x11,0x11,0x11,0x11],N:[0x11,0x19,0x15,0x13,0x11,0x11,0x11],
    O:[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E],P:[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
    Q:[0x0E,0x11,0x11,0x11,0x15,0x12,0x0D],R:[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
    S:[0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E],T:[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
    U:[0x11,0x11,0x11,0x11,0x11,0x11,0x0E],V:[0x11,0x11,0x11,0x11,0x0A,0x0A,0x04],
    W:[0x11,0x11,0x11,0x11,0x15,0x1B,0x11],X:[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
    Y:[0x11,0x11,0x0A,0x04,0x04,0x04,0x04],Z:[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
    '0':[0x0E,0x11,0x13,0x15,0x19,0x11,0x0E],'1':[0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
    '2':[0x0E,0x11,0x01,0x06,0x08,0x10,0x1F],'3':[0x0E,0x11,0x01,0x06,0x01,0x11,0x0E],
    '8':[0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E],'9':[0x0E,0x11,0x11,0x0F,0x01,0x01,0x0E],
    '-':[0x00,0x00,0x00,0x1F,0x00,0x00,0x00],' ':[0x00,0x00,0x00,0x00,0x00,0x00,0x00]
  };
  const drawText=(text,x,y,sc,r,g,b)=>{
    for(let ci=0;ci<text.length;ci++){
      const ch=text[ci];
      if(ch===' ') continue;
      const glyph=font[ch];
      if(!glyph) continue;
      const cx=x+ci*6*sc;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            fillRect(cx+col*sc,y+row*sc,cx+col*sc+sc-1,y+row*sc+sc-1,r,g,b);
          }
        }
      }
    }
  };

  // Custom Deathchase splash — use actual image data
  if(name==='deathchase'){
    if(!dcSplashData){
      const s=atob(DC_SPLASH_B64);
      dcSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) dcSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=dcSplashData[i];
    return;
  }

  if(name==='jetpac'){
    if(!jpSplashData){
      const s=atob(JP_SPLASH_B64);
      jpSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) jpSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=jpSplashData[i];
    return;
  }

  if(name==='manic'){
    if(!mmSplashData){
      const s=atob(MM_SPLASH_B64);
      mmSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) mmSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=mmSplashData[i];
    return;
  }

  // OutRun splash — embedded image
  if(name==='outrun'){
    if(!orSplashData){
      const s=atob(OR_SPLASH_B64);
      orSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) orSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=orSplashData[i];
    return;
  }
  if(false&&name==='outrun__old'){
    // Cyan sky top half
    for(let y=S/2;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0.85,0.85);
    // Blue banner at very top
    for(let y=S-8;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0.1,0.1,0.7);
    // "OUT RUN" title (red-yellow gradient large text)
    const orTitle='OUT RUN';
    for(let ci=0;ci<orTitle.length;ci++){
      const ch=orTitle[ci]; if(ch===' ') continue;
      const glyph=font[ch]; if(!glyph) continue;
      const cx=4+ci*8;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            const px=cx+col, py=S-7+row-7;
            if(px<S&&py>=0&&py<S){
              const grad=row/7;
              setP(px,py,1,0.2+grad*0.6,0);
              if(py-1>=0) setP(px,py-1,0.6,0.1+grad*0.3,0);
            }
          }
        }
      }
    }
    // Yellow/dark ground bottom
    for(let y=0;y<S/2-5;y++) for(let x=0;x<S;x++){
      const checker=((x+y)%3===0)?0.7:0.6;
      setP(x,y,checker,checker*0.9,0.2);
    }
    // Road (dark, center, perspective)
    for(let y=0;y<S/2;y++){
      const w=4+(S/2-y)*0.5;
      const cx=S/2;
      for(let x=Math.max(0,Math.round(cx-w));x<=Math.min(S-1,Math.round(cx+w));x++)
        setP(x,y,0.2,0.2,0.2);
    }
    // Red car at bottom center
    fillRect(S/2-4,3,S/2+4,7,0.85,0.1,0.05);
    fillRect(S/2-3,7,S/2+3,9,0.15,0.15,0.2);
    fillRect(S/2-2,9,S/2+2,10,0.8,0.1,0.05);
    // Palm trees (left and right)
    for(const side of [-1,1]){
      const tx=S/2+side*18;
      for(let ty=0;ty<16;ty++){ if(tx>=0&&tx<S) setP(tx,S/2-8+ty,0.4,0.25,0.1); }
      for(let dy=-3;dy<=4;dy++) for(let dx=-5;dx<=5;dx++){
        if(Math.abs(dx)+Math.abs(dy)<=6&&dy>=0){
          const sx=tx+dx,sy=S/2+8+dy;
          if(sx>=0&&sx<S&&sy<S) setP(sx,sy,0,0.5,0.1);
        }
      }
    }
    // "START" banner (white rectangle with text)
    fillRect(12,S/2+2,S-12,S/2+8,0.95,0.95,0.95);
    fillRect(12,S/2+1,S-12,S/2+1,0.5,0.5,0.5);
    fillRect(12,S/2+9,S-12,S/2+9,0.5,0.5,0.5);
    const stTxt='START';
    for(let ci=0;ci<stTxt.length;ci++){
      const glyph=font[stTxt[ci]]; if(!glyph) continue;
      const cx=18+ci*6;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            const px=cx+col, py=S/2+2+row;
            if(px<S&&py<S) setP(px,py,0.1,0.1,0.1);
          }
        }
      }
    }
    // "STAGE 1" at bottom right
    hLine(S-16,S-4,2,0,0.7,0);
    return;
  }

  // JSW splash — embedded image
  if(name==='jsw'){
    if(!jswSplashData){
      const s=atob(JSW_SPLASH_B64);
      jswSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) jswSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=jswSplashData[i];
    return;
  }
  if(name==='rtype'){
    if(!rtSplashData){
      const s=atob(RT_SPLASH_B64);
      rtSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) rtSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=rtSplashData[i];
    return;
  }
  if(name==='wolf3d'){
    if(!wolfSplashData){
      const s=atob(WOLF_SPLASH_B64);
      wolfSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) wolfSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=wolfSplashData[i];
    return;
  }
  if(name==='quake2'){
    if(!q2SplashData){
      const s=atob(Q2_SPLASH_B64);
      q2SplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) q2SplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=q2SplashData[i];
    return;
  }
  if(name==='invaders'){
    if(!siSplashData){
      const s=atob(SI_SPLASH_B64);
      siSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) siSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=siSplashData[i];
    return;
  }
  if(name==='samfox'){
    if(!sfSplashData){
      const s=atob(SF_SPLASH_B64);
      sfSplashData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) sfSplashData[i]=s.charCodeAt(i)/255;
    }
    for(let i=0;i<S*S*3;i++) buf[i]=sfSplashData[i];
    return;
  }
  if(false&&name==='jsw__old'){
    // Black background
    for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0);
    // "JET" in red, large
    const jswFont=font;
    const jLine1='JET';
    for(let ci=0;ci<jLine1.length;ci++){
      const glyph=jswFont[jLine1[ci]]; if(!glyph) continue;
      const cx=6+ci*10;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            fillRect(cx+col*2,S-10+row*2-14,cx+col*2+1,S-10+row*2-13,0.9,0,0);
          }
        }
      }
    }
    // "SET" in red, offset right
    const jLine2='SET';
    for(let ci=0;ci<jLine2.length;ci++){
      const glyph=jswFont[jLine2[ci]]; if(!glyph) continue;
      const cx=22+ci*10;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            fillRect(cx+col*2,S-10+row*2-14,cx+col*2+1,S-10+row*2-13,0.9,0,0);
          }
        }
      }
    }
    // "WILLY" below, in red
    const jLine3='WILLY';
    for(let ci=0;ci<jLine3.length;ci++){
      const glyph=jswFont[jLine3[ci]]; if(!glyph) continue;
      const cx=8+ci*10;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            fillRect(cx+col*2,S/2+row*2-6,cx+col*2+1,S/2+row*2-5,0.9,0,0);
          }
        }
      }
    }
    // Geometric shape in center (the iconic triangle/hexagon overlay)
    const cxC=S/2, cyC=S/2+4;
    // Green triangle
    for(let dy=0;dy<12;dy++){
      const w=Math.round(dy*0.8);
      for(let dx=-w;dx<=w;dx++){
        const sx=cxC+dx, sy=cyC+dy-6;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0.7,0);
      }
    }
    // Blue triangle overlapping
    for(let dy=0;dy<10;dy++){
      const w=Math.round(dy*0.7);
      for(let dx=-w;dx<=w;dx++){
        const sx=cxC+4+dx, sy=cyC-dy+4;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0,0.8);
      }
    }
    // Red triangle
    for(let dy=0;dy<10;dy++){
      const w=Math.round(dy*0.7);
      for(let dx=-w;dx<=w;dx++){
        const sx=cxC-4+dx, sy=cyC-dy+4;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0.8,0,0);
      }
    }
    // Bottom text: "Press ENTER to Start"
    const bottomTxt='PRESS ENTER';
    for(let ci=0;ci<bottomTxt.length;ci++){
      const glyph=jswFont[bottomTxt[ci]]; if(!glyph) continue;
      const cx=5+ci*5;
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<5;col++){
          if(bits&(0x10>>col)){
            const px=cx+col, py=6+row;
            if(px<S&&py<S) setP(px,py,0,0.8,0);
          }
        }
      }
    }
    // Plus signs border
    for(let x=0;x<S;x+=4) setP(x,4,0,0.6,0);
    return;
  }

  const titles={
    jetpac:{col:[1,1,0],bg:[0,0,0.3]},
    manic:{col:[1,1,0],bg:[0,0,0]},
    outrun:{col:[1,0.4,0],bg:[0,0,0.15]},
    invaders:{col:[0,1,0],bg:[0,0,0]},
    jsw:{col:[1,0,1],bg:[0,0,0]},
    deathchase:{col:[1,1,1],bg:[0,0.1,0]},
    rtype:{col:[0,0.8,1],bg:[0.1,0,0.1]},
    wolf3d:{col:[1,0,0],bg:[0.1,0.1,0.1]},
    quake2:{col:[1,0.5,0],bg:[0.05,0.02,0]},
    samfox:{col:[1,0,0.8],bg:[0,0.1,0]},
  };
  const t=titles[name]||{col:[1,1,1],bg:[0,0,0]};
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,t.bg[0],t.bg[1],t.bg[2]);
  // Border (2px thick)
  for(let i=0;i<2;i++){
    hLine(0,S-1,i,t.col[0]*0.5,t.col[1]*0.5,t.col[2]*0.5);
    hLine(0,S-1,S-1-i,t.col[0]*0.5,t.col[1]*0.5,t.col[2]*0.5);
    for(let y=0;y<S;y++){ setP(i,y,t.col[0]*0.5,t.col[1]*0.5,t.col[2]*0.5); setP(S-1-i,y,t.col[0]*0.5,t.col[1]*0.5,t.col[2]*0.5); }
  }
  // Full game names
  const labels={jetpac:'JET PAC',manic:'MANIC MINER',outrun:'OUTRUN',invaders:'SPACE INVADERS',
    jsw:'JET SET WILLY',rtype:'R-TYPE',wolf3d:'WOLFENSTEIN 3D',quake2:'QUAKE 2',samfox:'SAM FOX SP'};
  const label=labels[name]||name.toUpperCase();
  // Auto-scale to fit: max usable width is S-8 (4px border each side)
  const maxW=S-8;
  const naturalW=label.length*6;
  const scale=Math.min(2,Math.floor(maxW/naturalW)||1);
  const charH=7*scale;
  const textW=label.length*6*scale;
  const startX=Math.floor((S-textW)/2);
  const textY=Math.floor(S/2)-Math.floor(charH/2)-2;
  const cr=t.col[0],cg=t.col[1],cb=t.col[2];
  // Game-specific icon/logo below text
  if(name==='jetpac'){
    fillRect(29,textY+charH+4,34,textY+charH+14,cr,cg,cb);
    fillRect(30,textY+charH+14,33,textY+charH+17,1,0.3,0);
    setP(31,textY+charH+3,cr,cg,cb); setP(32,textY+charH+3,cr,cg,cb);
  } else if(name==='manic'){
    fillRect(28,textY+charH+5,35,textY+charH+8,cr,cg,cb);
    fillRect(29,textY+charH+8,34,textY+charH+11,cr*0.7,cg*0.7,cb*0.7);
    hLine(27,36,textY+charH+5,cr,cg,cb);
  } else if(name==='outrun'){
    fillRect(27,textY+charH+6,36,textY+charH+9,1,0,0);
    fillRect(28,textY+charH+9,35,textY+charH+11,0.7,0,0);
  } else if(name==='invaders'){
    fillRect(29,textY+charH+6,34,textY+charH+8,cr,cg,cb);
    setP(28,textY+charH+7,cr,cg,cb); setP(35,textY+charH+7,cr,cg,cb);
    setP(29,textY+charH+5,cr,cg,cb); setP(34,textY+charH+5,cr,cg,cb);
  } else if(name==='jsw'){
    fillRect(29,textY+charH+5,34,textY+charH+11,cr,cg,cb);
    fillRect(27,textY+charH+4,36,textY+charH+5,cr,cg,cb);
  } else if(name==='rtype'){
    fillRect(28,textY+charH+7,35,textY+charH+8,cr,cg,cb);
    fillRect(35,textY+charH+6,37,textY+charH+9,cr,cg,cb);
  } else if(name==='wolf3d'){
    hLine(28,35,textY+charH+7,cr,cg,cb);
    for(let y=textY+charH+5;y<=textY+charH+10;y++) setP(31,y,cr,cg,cb);
    setP(31,textY+charH+7,1,1,1);
  } else if(name==='quake2'){
    fillRect(28,textY+charH+5,35,textY+charH+10,cr,cg,cb);
    fillRect(30,textY+charH+6,33,textY+charH+9,t.bg[0],t.bg[1],t.bg[2]);
    setP(34,textY+charH+10,cr,cg,cb); setP(35,textY+charH+11,cr,cg,cb);
  } else if(name==='samfox'){
    // Playing card icon
    fillRect(29,textY+charH+4,34,textY+charH+11,1,1,1);
    setP(30,textY+charH+9,1,0,0); setP(33,textY+charH+6,1,0,0);
    fillRect(31,textY+charH+7,32,textY+charH+8,0,0,0);
  }
  // Draw title text
  drawText(label,startX,textY,scale,cr,cg,cb);
  // Flashing bar
  const flashOn=Math.sin(retroT*6)>0;
  if(flashOn) fillRect(Math.floor(S*0.2),4,Math.floor(S*0.8),5,cr*0.6,cg*0.6,cb*0.6);
}

function retroDrawFace(faceIdx,dt,buf,S){
  const setP=(x,y,r,g,b)=>{
    if(x<0||x>=S||y<0||y>=S) return;
    const i=(y*S+x)*3;
    buf[i]=r; buf[i+1]=g; buf[i+2]=b;
  };
  const fillRect=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) setP(x,y,r,g,b);
  };
  const hLine=(x1,x2,y,r,g,b)=>{ for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) setP(x,y,r,g,b); };

  const numGames=retroGames.length;
  const game=retroGames[faceIdx%numGames];
  game.t+=dt;

  // Show title screen for 2 seconds when game changes
  if(retroSplashT>0){
    retroDrawTitle(buf,S,game.name);
    // Mirror: flip both horizontally and vertically
    for(let y=0;y<Math.floor(S/2);y++){
      const y2=S-1-y;
      for(let x=0;x<S;x++){
        const i1=(y*S+x)*3, i2=(y2*S+(S-1-x))*3;
        const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
        buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
        buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
      }
    }
    return;
  }

  // ZX Spectrum colours (bright)
  const BLK=[0,0,0],BLU=[0,0,0.85],RED=[0.85,0,0],MAG=[0.85,0,0.85];
  const GRN=[0,0.85,0],CYN=[0,0.85,0.85],YEL=[0.85,0.85,0],WHT=[1,1,1];

  // Black background
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0.02);

  if(game.name==='jetpac'){
    const p=game;
    const groundY=8; // yellow ground near bottom
    const plat1Y=24, plat2Y=40; // two green platforms
    const rocketX=30, rocketBaseY=groundY+1; // rocket on ground

    // Stars background
    for(let i=0;i<50;i++){
      const sx=(i*17+3)%S, sy=(i*31+7)%S;
      const bright=0.2+0.15*Math.sin(p.t*2+i);
      setP(sx,sy,bright,bright,bright*1.2);
    }

    // Yellow ground with jagged grass texture
    for(let x=0;x<S;x++){
      const grassH=2+((x*7+3)%3);
      for(let gy=0;gy<grassH;gy++){
        const yy=groundY-gy;
        if(yy>=0) setP(x,yy,0.9,0.9,0);
      }
    }

    // Green platforms (chunky, like original)
    for(let x=5;x<=28;x++){
      for(let py=plat1Y;py<=plat1Y+2;py++) setP(x,py,0,0.8,0);
    }
    for(let x=38;x<=58;x++){
      for(let py=plat2Y;py<=plat2Y+2;py++) setP(x,py,0,0.8,0);
    }
    // Magenta bar at top-left and top-right (like original HUD borders)
    hLine(0,15,S-2,0.8,0,0.8);
    hLine(48,S-1,S-2,0.8,0,0.8);

    // Rocket assembly phases
    p.phaseT+=dt;
    if(p.phase==='build'){
      // Auto-pilot: astronaut flies to part, picks it up, brings to rocket
      if(!p.carryPart){
        // Fly towards the part
        const dx=p.partX-p.playerX, dy=p.partY-p.playerY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>2){
          p.playerX+=dx/dist*25*dt;
          p.playerY+=dy/dist*25*dt;
        } else {
          p.carryPart=true;
        }
        p.laserDir=dx>0?1:-1;
      } else {
        // Carry part to rocket position
        const targetY=rocketBaseY+4+p.rocketParts*6;
        const dx=rocketX-p.playerX, dy=targetY-p.playerY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>2){
          p.playerX+=dx/dist*25*dt;
          p.playerY+=dy/dist*25*dt;
        } else {
          p.carryPart=false;
          p.rocketParts++;
          if(p.rocketParts>=3){
            p.phase='fuel';
            p.phaseT=0;
          } else {
            p.partX=10+Math.random()*44;
            p.partY=plat1Y+3+Math.random()*15;
          }
        }
        p.laserDir=dx>0?1:-1;
      }
    } else if(p.phase==='fuel'){
      // Fly around collecting fuel, then launch
      const fuelTargetX=rocketX, fuelTargetY=rocketBaseY+10;
      const orbitR=15;
      const angle=p.phaseT*1.8;
      const targetX=rocketX+Math.cos(angle)*orbitR;
      const targetY=25+Math.sin(angle)*10;
      const dx=targetX-p.playerX, dy=targetY-p.playerY;
      p.playerX+=dx*2*dt;
      p.playerY+=dy*2*dt;
      p.laserDir=Math.cos(angle+0.5)>0?1:-1;
      if(p.phaseT>5){ p.phase='launch'; p.phaseT=0; p.launchT=0; }
    } else if(p.phase==='launch'){
      // Rocket launches upward
      p.launchT+=dt;
      const orbitR=18;
      const angle=p.phaseT*2;
      p.playerX=rocketX+Math.cos(angle)*orbitR;
      p.playerY=30+Math.sin(angle)*8;
      p.laserDir=1;
      if(p.launchT>4){
        p.phase='build'; p.phaseT=0; p.rocketParts=0;
        p.partX=10+Math.random()*44; p.partY=plat1Y+3+Math.random()*15;
        p.launchT=0;
      }
    }

    // Draw rocket (pink/magenta like original)
    if(p.phase!=='launch'||p.launchT<2){
      const rLaunchOff=p.phase==='launch'?Math.round(p.launchT*p.launchT*8):0;
      const rBaseY=rocketBaseY+rLaunchOff;
      // Base section (always visible)
      fillRect(rocketX-3,rBaseY,rocketX+3,rBaseY+5,0.8,0.3,0.8);
      fillRect(rocketX-2,rBaseY,rocketX+2,rBaseY+5,0.9,0.4,0.9);
      // Middle section
      if(p.rocketParts>=1||p.phase==='fuel'||p.phase==='launch'){
        fillRect(rocketX-3,rBaseY+6,rocketX+3,rBaseY+10,0.8,0.3,0.8);
        fillRect(rocketX-2,rBaseY+6,rocketX+2,rBaseY+10,0.9,0.4,0.9);
      }
      // Top section (nose cone)
      if(p.rocketParts>=2||p.phase==='fuel'||p.phase==='launch'){
        fillRect(rocketX-2,rBaseY+11,rocketX+2,rBaseY+14,0.8,0.3,0.8);
        fillRect(rocketX-1,rBaseY+14,rocketX+1,rBaseY+16,0.9,0.4,0.9);
        setP(rocketX,rBaseY+17,1,1,1); // tip
      }
      // Rocket exhaust during launch
      if(p.phase==='launch'){
        for(let fy=0;fy<4+Math.round(p.launchT*2);fy++){
          const flameY=rBaseY-1-fy;
          if(flameY<0) break;
          const fw=Math.max(1,3-fy);
          const flicker=Math.random();
          for(let fx=-fw;fx<=fw;fx++){
            setP(rocketX+fx,flameY,1,0.5+flicker*0.5,0);
          }
        }
      }
    }

    // Floating part (if not yet picked up and in build phase)
    if(p.phase==='build'&&!p.carryPart){
      const ppx=Math.round(p.partX), ppy=Math.round(p.partY);
      fillRect(ppx-2,ppy,ppx+2,ppy+4,0.8,0.3,0.8);
      fillRect(ppx-1,ppy,ppx+1,ppy+4,0.9,0.4,0.9);
    }
    // Carried part follows player
    if(p.phase==='build'&&p.carryPart){
      const cpx=Math.round(p.playerX), cpy=Math.round(p.playerY)-3;
      fillRect(cpx-2,cpy,cpx+2,cpy+4,0.8,0.3,0.8);
    }

    // Draw astronaut (white figure with legs)
    const px=Math.round(p.playerX), py=Math.round(p.playerY);
    // Head (round, white)
    setP(px,py+5,1,1,1); setP(px-1,py+5,0.8,0.8,0.8); setP(px+1,py+5,0.8,0.8,0.8);
    setP(px,py+6,1,1,1); setP(px-1,py+6,0.9,0.9,0.9); setP(px+1,py+6,0.9,0.9,0.9);
    // Body
    setP(px,py+4,1,1,1); setP(px-1,py+4,0.8,0.8,0.8); setP(px+1,py+4,0.8,0.8,0.8);
    setP(px,py+3,1,1,1); setP(px-1,py+3,0.7,0.7,0.7); setP(px+1,py+3,0.7,0.7,0.7);
    setP(px,py+2,0.9,0.9,0.9);
    // Legs (animated walking/flying)
    const legAnim=Math.round(Math.sin(p.t*10));
    setP(px-1+legAnim,py+1,0.8,0.8,0.8);
    setP(px+1-legAnim,py+1,0.8,0.8,0.8);
    setP(px-1+legAnim,py,0.7,0.7,0.7);
    setP(px+1-legAnim,py,0.7,0.7,0.7);
    // Jetpack (on back)
    setP(px-2,py+3,0.5,0.5,0.5); setP(px-2,py+4,0.5,0.5,0.5);
    // Jetpack flame
    if(py>groundY+3){
      const flameFlicker=Math.sin(p.t*20)>0;
      setP(px-2,py+2,1,flameFlicker?0.5:0.2,0);
      setP(px-2,py+1,1,flameFlicker?0.8:0.4,0);
    }
    // Init alien state
    if(!p.aliens||p.aliens.length===0){
      p.aliens=[];
      for(let a=0;a<4;a++) p.aliens.push({alive:true,explodeT:0,respawnT:0});
    }

    // Laser beam (horizontal, firing direction) — check alien hits
    p.laserT+=dt;
    const firingLaser=Math.sin(p.t*4)>0.3;
    const alienColors=[[1,0,0],[0,0.9,0],[0,0.9,0.9],[0.9,0,0.9]];
    // Compute alien positions first
    const alienPos=[];
    for(let a=0;a<4;a++){
      const ax=(Math.round(p.t*12*(a%2?1:-1)+a*17))%S;
      const aax=ax<0?ax+S:ax;
      const ay=15+a*10+Math.round(Math.sin(p.t*1.8+a*1.5)*5);
      alienPos.push({x:aax,y:ay});
    }

    if(firingLaser){
      let laserHitX=S;
      for(let lx=1;lx<20;lx++){
        const beamX=px+lx*p.laserDir;
        if(beamX<0||beamX>=S){ laserHitX=lx; break; }
        // Check if laser hits an alive alien
        let hitAlien=false;
        for(let a=0;a<4;a++){
          if(!p.aliens[a].alive) continue;
          const ap=alienPos[a];
          if(Math.abs(beamX-ap.x)<3&&Math.abs(py+4-ap.y)<3){
            p.aliens[a].alive=false;
            p.aliens[a].explodeT=0.4;
            p.aliens[a].respawnT=2+Math.random()*2;
            hitAlien=true; laserHitX=lx; break;
          }
        }
        if(hitAlien) break;
        setP(beamX,py+4,1,1,1);
      }
    }

    // Draw aliens or explosions
    for(let a=0;a<4;a++){
      const al=p.aliens[a];
      const ac=alienColors[a%4];
      const ap=alienPos[a];
      if(al.explodeT>0){
        // Explosion
        al.explodeT-=dt;
        const eRad=Math.round((0.4-al.explodeT)*10);
        for(let dy=-eRad;dy<=eRad;dy++) for(let dx=-eRad;dx<=eRad;dx++){
          if(dx*dx+dy*dy<=eRad*eRad){
            const ex=ap.x+dx, ey=ap.y+dy;
            if(ex>=0&&ex<S&&ey>=0&&ey<S) setP(ex,ey,1,Math.random()*0.7,0);
          }
        }
      } else if(!al.alive){
        al.respawnT-=dt;
        if(al.respawnT<=0) al.alive=true;
      } else {
        // Blob body (round, 5x5)
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
          if(dx*dx+dy*dy<=5){
            const sx=ap.x+dx, sy=ap.y+dy;
            if(sx>=0&&sx<S&&sy>=0&&sy<S){
              const bright=0.7+0.3*Math.sin(p.t*5+a+dy*0.5);
              setP(sx,sy,ac[0]*bright,ac[1]*bright,ac[2]*bright);
            }
          }
        }
        // Tentacles
        for(let leg=0;leg<3;leg++){
          const lx=ap.x-1+leg+Math.round(Math.sin(p.t*8+a+leg)*0.8);
          const ly=ap.y-3;
          if(lx>=0&&lx<S&&ly>=0&&ly<S) setP(lx,ly,ac[0]*0.6,ac[1]*0.6,ac[2]*0.6);
        }
      }
    }

    // Score text at top (simple)
    const scoreFlash=Math.sin(p.t*3)>0;
    if(scoreFlash){
      for(let sx=4;sx<18;sx++) setP(sx,S-4,0.5,0.5,1);
    }

  } else if(game.name==='manic'){
    const p=game;
    const borderW=4; // blue border walls
    const groundY=10; // yellow floor
    const playL=borderW, playR=S-1-borderW;

    // Blue border walls (left and right, diamond pattern like original)
    for(let y=0;y<S;y++){
      for(let x=0;x<borderW;x++){
        const pat=((x+y)%3===0)?0.8:0.5;
        setP(x,y,0,0,pat);
      }
      for(let x=S-borderW;x<S;x++){
        const pat=((x+y)%3===0)?0.8:0.5;
        setP(x,y,0,0,pat);
      }
    }
    // Blue top border
    for(let x=0;x<S;x++){
      const pat=((x)%3===0)?0.8:0.5;
      setP(x,S-1,0,0,pat); setP(x,S-2,0,0,pat);
    }

    // Yellow ground floor
    for(let x=playL;x<=playR;x++){
      for(let gy=groundY;gy>=groundY-2;gy--){
        setP(x,gy,0.9,0.85,0);
      }
    }

    // Cyan platforms (chunky, patterned like original)
    const plats=[[22,playL+4,playR-4],[34,playL+8,28],[34,35,playR-6],[46,playL+2,20],[46,30,playR-2]];
    for(const pl of plats){
      const py=pl[0], x1=pl[1], x2=pl[2];
      for(let x=x1;x<=x2;x++){
        const checker=((x-x1)%4<2)?1:0;
        setP(x,py,0,checker?0.85:0.6,checker?0.85:0.6);
        setP(x,py+1,0,checker?0.6:0.4,checker?0.6:0.4);
      }
    }

    // Player auto-movement across platforms
    p.playerX+=p.dir*16*dt;
    if(p.playerX>playR-3){p.dir=-1;} else if(p.playerX<playL+3){p.dir=1;}
    if(!p.jumping&&Math.sin(p.t*2.5)>0.7){ p.jumping=true; p.jumpT=0; p.jumpFromY=p.baseY||groundY+1; }
    if(p.jumping){ p.jumpT+=dt; if(p.jumpT>0.6){ p.jumping=false; } }
    const jumpOff=p.jumping?Math.sin(p.jumpT/0.6*Math.PI)*14:0;
    // Find target platform (only switch when landing from a jump)
    if(!p.baseY) p.baseY=groundY+1;
    if(!p.jumping){
      let bestY=groundY+1;
      for(const pl of plats){
        if(p.playerX>=pl[1]&&p.playerX<=pl[2]){
          if(pl[0]+2>bestY) bestY=pl[0]+2;
        }
      }
      // Smooth transition
      p.baseY+=(bestY-p.baseY)*Math.min(1,dt*8);
      if(Math.abs(p.baseY-bestY)<0.5) p.baseY=bestY;
    }
    const playerY=Math.round(p.baseY+jumpOff);
    const px=Math.round(p.playerX);

    // Draw Willy (white figure like original)
    // Head
    setP(px,playerY+6,1,1,1); setP(px-1,playerY+6,0.9,0.9,0.9); setP(px+1,playerY+6,0.9,0.9,0.9);
    setP(px,playerY+7,1,1,1);
    // Body
    setP(px,playerY+5,1,1,1); setP(px-1,playerY+5,0.85,0.85,0.85); setP(px+1,playerY+5,0.85,0.85,0.85);
    setP(px,playerY+4,0.9,0.9,0.9); setP(px-1,playerY+4,0.8,0.8,0.8); setP(px+1,playerY+4,0.8,0.8,0.8);
    setP(px,playerY+3,0.85,0.85,0.85);
    // Legs (animated)
    const legFrame=Math.floor(p.t*8)%4;
    const lOff=legFrame<2?1:-1;
    setP(px+lOff,playerY+2,0.9,0.9,0.9);
    setP(px-lOff,playerY+2,0.9,0.9,0.9);
    setP(px+lOff,playerY+1,0.8,0.8,0.8);
    setP(px-lOff,playerY+1,0.8,0.8,0.8);
    // Hat (red)
    setP(px-1,playerY+8,0.9,0,0); setP(px,playerY+8,0.9,0,0); setP(px+1,playerY+8,0.9,0,0);

    // Collectible keys (flashing, on platforms)
    const keyPositions=[[18,plats[0][0]+3],[22,plats[0][0]+3],[26,plats[0][0]+3],[30,plats[0][0]+3],[34,plats[0][0]+3],[38,plats[0][0]+3]];
    for(let i=0;i<keyPositions.length;i++){
      const it=p.items[i%p.items.length];
      if(it&&it.collected) continue;
      const kx=keyPositions[i][0], ky=keyPositions[i][1];
      const flash=Math.floor(p.t*4+i*0.5)%2;
      const kr=flash?1:0.8, kg=flash?1:0, kb=flash?0:0.8;
      setP(kx,ky,kr,kg,kb); setP(kx+1,ky,kr,kg,kb);
      setP(kx,ky+1,kr*0.7,kg*0.7,kb*0.7); setP(kx+1,ky+1,kr*0.7,kg*0.7,kb*0.7);
      if(it&&Math.abs(px-kx)<3&&Math.abs(playerY-ky)<5) it.collected=true;
    }
    if(p.items.every(i=>i.collected)) for(const i of p.items) i.collected=false;

    // Enemies (colorful creatures patrolling on platforms)
    const enemyColors=[[0.8,0,0.8],[0,0.8,0],[0.8,0,0],[0,0.8,0.8]];
    for(let e=0;e<p.enemyX.length+2;e++){
      const eIdx=e%p.enemyX.length;
      if(e<p.enemyX.length) p.enemyX[eIdx]+=(8+e*3)*dt*(eIdx%2?1:-1);
      const eCol=enemyColors[e%4];
      const ePlat=plats[e%plats.length];
      const eMin=ePlat[1]+1, eMax=ePlat[2]-1;
      let ex=e<p.enemyX.length?p.enemyX[eIdx]:eMin+((p.t*10+e*13)%(eMax-eMin));
      if(e<p.enemyX.length){
        if(ex>eMax){p.enemyX[eIdx]=eMax; if(eIdx<p.enemyX.length) p.enemyX[eIdx]=eMin;}
        if(ex<eMin){p.enemyX[eIdx]=eMin;}
      }
      ex=Math.round(ex);
      const ey=ePlat[0]+2;
      // Creature body (like original sprites — small animated figures)
      setP(ex,ey+3,eCol[0],eCol[1],eCol[2]); // head
      setP(ex-1,ey+3,eCol[0]*0.7,eCol[1]*0.7,eCol[2]*0.7);
      setP(ex+1,ey+3,eCol[0]*0.7,eCol[1]*0.7,eCol[2]*0.7);
      setP(ex,ey+2,eCol[0]*0.9,eCol[1]*0.9,eCol[2]*0.9); // body
      setP(ex-1,ey+2,eCol[0]*0.6,eCol[1]*0.6,eCol[2]*0.6);
      setP(ex+1,ey+2,eCol[0]*0.6,eCol[1]*0.6,eCol[2]*0.6);
      // Legs (animated)
      const eLeg=Math.round(Math.sin(p.t*10+e*2));
      setP(ex+eLeg,ey+1,eCol[0]*0.8,eCol[1]*0.8,eCol[2]*0.8);
      setP(ex-eLeg,ey+1,eCol[0]*0.8,eCol[1]*0.8,eCol[2]*0.8);
    }

    // Dangling creatures from top (like original — hanging from ceiling)
    for(let d=0;d<3;d++){
      const dx=playL+10+d*16;
      const dy=S-6-Math.round(Math.abs(Math.sin(p.t*1.5+d*1.2))*10);
      const dc=enemyColors[(d+1)%4];
      setP(dx,dy,dc[0],dc[1],dc[2]);
      setP(dx,dy+1,dc[0]*0.8,dc[1]*0.8,dc[2]*0.8);
      setP(dx-1,dy,dc[0]*0.6,dc[1]*0.6,dc[2]*0.6);
      setP(dx+1,dy,dc[0]*0.6,dc[1]*0.6,dc[2]*0.6);
      // String to ceiling
      for(let sy=dy+2;sy<S-2;sy++) setP(dx,sy,0.3,0.3,0.3);
    }

    // AIR bar at bottom (red depleted, green remaining — like original)
    const airLeft=1-((p.t%15)/15);
    const barY=5, barX1=playL+2, barX2=playR-2;
    const barW=barX2-barX1;
    const greenEnd=barX1+Math.round(airLeft*barW);
    // Red (depleted) portion
    for(let x=barX1;x<greenEnd;x++) setP(x,barY,0.9,0,0);
    // Green (remaining) portion
    for(let x=greenEnd;x<=barX2;x++) setP(x,barY,0,0.9,0);
    // "AIR" label
    setP(barX1-2,barY,0,0.8,0); setP(barX1-1,barY,0,0.8,0);

    // Lives at very bottom (small cyan figures)
    for(let l=0;l<3;l++){
      const lx=playL+2+l*5;
      setP(lx,1,0,0.9,0.9); setP(lx,2,0,0.9,0.9); setP(lx,3,0,0.7,0.7);
      setP(lx-1,2,0,0.6,0.6); setP(lx+1,2,0,0.6,0.6);
    }

  } else if(game.name==='outrun'){
    const p=game;
    p.speed=0.85+0.15*Math.sin(p.t*0.3);
    p.roadOff+=p.speed*dt*40;
    p.curves=Math.sin(p.t*0.5)*0.5;
    const horizon=S*0.55;

    // Sky gradient (light blue to white at horizon, like arcade)
    for(let y=Math.floor(horizon);y<S;y++){
      const t=(y-horizon)/(S-horizon);
      const sr=0.4+0.5*t, sg=0.6+0.35*t, sb=0.85+0.1*t;
      for(let x=0;x<S;x++){const i=(y*S+x)*3;buf[i]=sr;buf[i+1]=sg;buf[i+2]=sb;}
    }

    // Clouds
    for(let c=0;c<3;c++){
      const cx=((c*22+Math.floor(p.t*2))%S);
      const cy=S-6-c*3;
      for(let dx=-4;dx<=4;dx++) for(let dy=0;dy<=1;dy++){
        const sx=cx+dx, sy=cy+dy;
        if(sx>=0&&sx<S&&sy<S) setP(sx,sy,0.95,0.95,1);
      }
    }

    // Ground with road (perspective)
    for(let y=0;y<Math.floor(horizon);y++){
      const depth=(horizon-y)/horizon;
      const roadW=6+depth*30;
      const curve=p.curves*depth*depth*35+Math.sin(p.roadOff*0.02+y*0.08)*depth*6;
      const cx=S/2+Math.round(curve);
      const stripe=((Math.floor(p.roadOff+y*2))%10)<5;

      // Grass (alternating green shades like arcade)
      const gBright=stripe?0.45:0.3;
      for(let x=0;x<S;x++){const i=(y*S+x)*3;buf[i]=0;buf[i+1]=gBright;buf[i+2]=0;}

      // Sandy shoulder/verge
      const shoulderW=Math.round(roadW*0.15);
      const rl=Math.round(cx-roadW/2), rr=Math.round(cx+roadW/2);
      for(let x=Math.max(0,rl-shoulderW);x<Math.max(0,rl);x++){
        const i=(y*S+x)*3;buf[i]=0.6;buf[i+1]=0.55;buf[i+2]=0.3;
      }
      for(let x=Math.min(S-1,rr+1);x<=Math.min(S-1,rr+shoulderW);x++){
        const i=(y*S+x)*3;buf[i]=0.6;buf[i+1]=0.55;buf[i+2]=0.3;
      }

      // Road surface (dark grey)
      for(let x=Math.max(0,rl);x<=Math.min(S-1,rr);x++){
        const i=(y*S+x)*3;buf[i]=0.3;buf[i+1]=0.3;buf[i+2]=0.3;
      }

      // White dashed center line
      if(stripe){
        const ml=Math.round(cx-1), mr=Math.round(cx+1);
        if(ml>=0&&ml<S) setP(ml,y,1,1,1);
        if(mr>=0&&mr<S) setP(mr,y,1,1,1);
      }

      // Red-white kerbs on edges
      const kerbR=stripe?0.9:1, kerbG=stripe?0.1:1, kerbB=stripe?0.1:1;
      for(let k=0;k<2;k++){
        const kx1=rl+k, kx2=rr-k;
        if(kx1>=0&&kx1<S) setP(kx1,y,kerbR,kerbG,kerbB);
        if(kx2>=0&&kx2<S) setP(kx2,y,kerbR,kerbG,kerbB);
      }
    }

    // Palm trees at roadside (like arcade OutRun)
    for(let t=0;t<6;t++){
      const treeZ=((t*13+p.roadOff*0.4)%70);
      const tz=treeZ<0?treeZ+70:treeZ;
      if(tz<3) continue;
      const tDepth=15/tz;
      const side=(t%2)?1:-1;
      const tCurve=p.curves*tDepth*tDepth*35;
      const tx=Math.round(S/2+tCurve+side*(15+tDepth*20));
      const tBaseY=Math.round(horizon-tDepth*horizon*0.8);
      if(tBaseY<2||tBaseY>=horizon) continue;
      const trunkH=Math.round(tDepth*20);
      const trunkW=Math.max(1,Math.round(tDepth*2));
      // Trunk (brown)
      for(let ty=0;ty<trunkH;ty++){
        const sy=tBaseY+ty;
        if(sy>=S) break;
        for(let tw=0;tw<trunkW;tw++){
          const sx=tx+tw-Math.floor(trunkW/2);
          if(sx>=0&&sx<S) setP(sx,sy,0.4,0.25,0.1);
        }
      }
      // Palm fronds (green, fan shape)
      const leafR=Math.max(2,Math.round(tDepth*8));
      const leafY=tBaseY+trunkH;
      for(let dy=-1;dy<=leafR;dy++) for(let dx=-leafR;dx<=leafR;dx++){
        if(Math.abs(dx)+Math.abs(dy)<=leafR+1&&dy>=0){
          const sx=tx+dx, sy=leafY+dy;
          if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0.5+dy*0.03,0.1);
        }
      }
    }

    // Red Ferrari (seen from behind, like arcade)
    const carX=Math.round(S/2+Math.sin(p.t*0.8)*8);
    const carY=6;
    // Rear body (red)
    fillRect(carX-5,carY,carX+5,carY+4,0.85,0.1,0.05);
    fillRect(carX-4,carY+4,carX+4,carY+6,0.9,0.15,0.05);
    // Windshield/cabin (dark)
    fillRect(carX-3,carY+6,carX+3,carY+8,0.15,0.15,0.2);
    // Roof
    fillRect(carX-2,carY+8,carX+2,carY+9,0.8,0.1,0.05);
    // Rear lights
    setP(carX-4,carY+1,1,0.3,0); setP(carX+4,carY+1,1,0.3,0);
    // Wheels (black)
    fillRect(carX-6,carY,carX-5,carY+2,0.1,0.1,0.1);
    fillRect(carX+5,carY,carX+6,carY+2,0.1,0.1,0.1);
    // Exhaust/shadow
    fillRect(carX-4,carY-1,carX+4,carY-1,0.1,0.1,0.1);

    // HUD at top
    // "TIME" in red
    hLine(2,8,S-3,0.9,0.2,0.1);
    // Score area
    hLine(20,40,S-3,1,1,1);
    // "STAGE 1" at bottom right
    hLine(S-14,S-4,3,0,0.8,0);

  } else if(game.name==='invaders'){
    const p=game;
    const rowCols=[[1,0,0],[0.9,0,0.9],[0,0.9,0],[0,0.9,0.9],[1,1,0]];
    const hudH=4;

    // LOSER screen
    if(p.loserT===undefined) p.loserT=0;
    if(p.loserT>0){
      p.loserT-=dt;
      for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0);
      const flash=Math.floor(p.loserT*4)%2;
      if(flash){
        const G=[[0,1,1,1,0],[1,0,0,0,0],[1,0,1,1,0],[1,0,0,1,0],[0,1,1,1,0]];
        const A=[[0,1,1,0,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]];
        const M=[[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]];
        const E=[[1,1,1,1,0],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,1,1,1,0]];
        const O=[[0,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]];
        const V=[[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0],[0,1,0,0,0]];
        const R=[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,1,0,0],[1,0,0,1,0]];
        const row1=[G,A,M,E];
        const row2=[O,V,E,R];
        for(let li=0;li<4;li++){
          const glyph=row1[li];
          const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){
              const px=ox+col*2, py=34+row*2;
              setP(px,py,1,0,0); setP(px+1,py,1,0,0);
              setP(px,py+1,1,0,0); setP(px+1,py+1,1,0,0);
            }
          }
        }
        for(let li=0;li<4;li++){
          const glyph=row2[li];
          const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){
              const px=ox+col*2, py=22+row*2;
              setP(px,py,1,0,0); setP(px+1,py,1,0,0);
              setP(px,py+1,1,0,0); setP(px+1,py+1,1,0,0);
            }
          }
        }
      }
      if(p.loserT<=0){
        for(const inv of p.invAlive) inv.alive=true;
        p.invY=32; p.invX=5; p.shieldDmg=new Set(); p.lives=3; p.wave=0;
      }
      return;
    }

    // Move invaders (faster each wave)
    if(p.wave===undefined) p.wave=0;
    const invSpeed=8+p.wave*3;
    p.invX+=p.invDir*invSpeed*dt;
    if(p.invX>S-42||p.invX<2){ p.invDir*=-1; p.invY-=1.5; }
    let lowestAliveRow=99;
    for(const inv of p.invAlive){ if(inv.alive && inv.r<lowestAliveRow) lowestAliveRow=inv.r; }
    if(lowestAliveRow<99 && p.invY+lowestAliveRow*6<=17){
      p.lives--;
      if(p.lives<=0){
        p.loserT=3;
      } else {
        for(const inv of p.invAlive) inv.alive=true;
        p.invY=32; p.invX=5; p.shieldDmg=new Set();
      }
    }

    // Draw invaders with distinct shapes per row type
    const frame=Math.floor(p.t*3)%2;
    for(const inv of p.invAlive){
      if(!inv.alive) continue;
      const ix=Math.round(p.invX+inv.c*5);
      const iy=Math.round(p.invY+inv.r*6);
      if(ix<0||ix>=S||iy<hudH||iy>=S-12) continue;
      const rc=rowCols[inv.r%5];
      const r=rc[0],g=rc[1],b=rc[2];
      if(inv.r===4){
        // Top row (yellow): squid shape — narrow body, tentacles
        setP(ix,iy+3,r,g,b); setP(ix,iy+2,r,g,b); setP(ix,iy+1,r,g,b);
        setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        if(frame){ setP(ix-1,iy,r,g,b); setP(ix+1,iy,r,g,b); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); }
      } else if(inv.r===3||inv.r===2){
        // Middle rows (cyan/green): crab shape — wider with claws
        setP(ix,iy+3,r,g,b); setP(ix-1,iy+3,r,g,b); setP(ix+1,iy+3,r,g,b);
        setP(ix,iy+2,r,g,b); setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        setP(ix-2,iy+2,r,g,b); setP(ix+2,iy+2,r,g,b);
        setP(ix,iy+1,r,g,b);
        if(frame){ setP(ix-2,iy+3,r,g,b); setP(ix+2,iy+3,r,g,b); setP(ix-1,iy,r,g,b); setP(ix+1,iy,r,g,b); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); setP(ix-1,iy+4,r*0.7,g*0.7,b*0.7); setP(ix+1,iy+4,r*0.7,g*0.7,b*0.7); }
      } else {
        // Bottom rows (magenta/red): octopus — round with dangling legs
        setP(ix,iy+3,r,g,b); setP(ix-1,iy+3,r,g,b); setP(ix+1,iy+3,r,g,b);
        setP(ix,iy+2,r,g,b); setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        setP(ix-2,iy+3,r*0.8,g*0.8,b*0.8); setP(ix+2,iy+3,r*0.8,g*0.8,b*0.8);
        if(frame){ setP(ix-1,iy+1,r,g,b); setP(ix+1,iy+1,r,g,b); setP(ix-2,iy,r*0.6,g*0.6,b*0.6); setP(ix+2,iy,r*0.6,g*0.6,b*0.6); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); setP(ix-1,iy,r*0.6,g*0.6,b*0.6); setP(ix+1,iy,r*0.6,g*0.6,b*0.6); }
      }
    }

    // Player cannon — targets lowest alive invader to eliminate
    if(!p.explodeT) p.explodeT=0;
    if(!p.respawnT) p.respawnT=0;
    if(p.lives===undefined) p.lives=3;
    if(p.explodeT>0){
      // Explosion animation
      p.explodeT-=dt;
      const ex=Math.round(p.playerX), ey=8;
      const eRad=Math.round((0.5-p.explodeT)*12);
      for(let dy=-eRad;dy<=eRad;dy++) for(let dx=-eRad;dx<=eRad;dx++){
        if(dx*dx+dy*dy<=eRad*eRad){
          const px2=ex+dx, py2=ey+dy;
          if(px2>=0&&px2<S&&py2>=0&&py2<S){
            const flicker=Math.random();
            setP(px2,py2,1,flicker*0.7,0);
          }
        }
      }
      if(p.explodeT<=0) p.respawnT=1.0;
    } else if(p.respawnT>0){
      p.respawnT-=dt;
      // Flashing respawn
      if(Math.floor(p.respawnT*8)%2){
        const cannonX=Math.round(p.playerX);
        fillRect(cannonX-3,6,cannonX+3,8,0.5,0.5,0.5);
        fillRect(cannonX-1,8,cannonX+1,9,0.5,0.5,0.5);
        setP(cannonX,10,0.5,0.5,0.5);
      }
    } else {
      // Find lowest alive invader to aim at
      let targetInv=null, lowestY=999;
      for(const inv of p.invAlive){
        if(!inv.alive) continue;
        const iy=p.invY+inv.r*6;
        if(iy<lowestY){ lowestY=iy; targetInv=inv; }
      }
      let targetX=targetInv?p.invX+targetInv.c*5:32;
      // Dodge incoming bombs — scan all, pick most urgent
      let dodging=false;
      let urgentBomb=null, urgentScore=999;
      for(const bm of p.bombs){
        if(bm.y<20&&Math.abs(bm.x-p.playerX)<8){
          const score=bm.y+Math.abs(bm.x-p.playerX)*0.5;
          if(score<urgentScore){ urgentScore=score; urgentBomb=bm; }
        }
      }
      if(urgentBomb){
        dodging=true;
        const dodgeDist=12;
        if(urgentBomb.x<=p.playerX) targetX=Math.min(S-5,urgentBomb.x+dodgeDist);
        else targetX=Math.max(4,urgentBomb.x-dodgeDist);
      }
      const cannonSpeed=24*dt;
      const cannonDx=targetX-p.playerX;
      p.playerX+=Math.sign(cannonDx)*Math.min(Math.abs(cannonDx),cannonSpeed);
      p.playerX=Math.max(4,Math.min(S-5,p.playerX));
      const cannonX=Math.round(p.playerX);
      fillRect(cannonX-3,6,cannonX+3,8,1,1,1);
      fillRect(cannonX-1,8,cannonX+1,9,1,1,1);
      setP(cannonX,10,1,1,1);

      // Fire when lined up with a target (cooldown between shots)
      if(!p.fireCD) p.fireCD=0;
      p.fireCD-=dt;
      if(p.fireCD<=0&&p.bullets.length<2){
        if(targetInv&&Math.abs(p.playerX-(p.invX+targetInv.c*5))<2){
          p.bullets.push({x:cannonX,y:11});
          p.fireCD=0.4;
        } else if(Math.sin(p.t*3)>0.97){
          p.bullets.push({x:cannonX,y:11});
          p.fireCD=0.5;
        }
      }
    }

    // Player bullets
    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].y+=55*dt;
      const pb=p.bullets[i];
      if(pb.y>S){ p.bullets.splice(i,1); continue; }
      const pbx=Math.round(pb.x), pby=Math.round(pb.y);
      setP(pbx,pby,1,1,1);
      setP(pbx,pby+1,1,1,1);
      // Bullet hits shield — creates small hole and continues or stops
      let hitShield=false;
      for(let s=0;s<4;s++){
        const sx=4+s*15;
        if(pbx>=sx&&pbx<=sx+8&&pby>=12&&pby<=17){
          if(!p.shieldDmg.has(pbx+','+pby)){
            p.shieldDmg.add(pbx+','+pby);
            p.shieldDmg.add((pbx-1)+','+pby);
            p.shieldDmg.add((pbx+1)+','+pby);
            p.bullets.splice(i,1); hitShield=true; break;
          }
        }
      }
      if(hitShield) continue;
      for(const inv of p.invAlive){
        if(!inv.alive) continue;
        const ix2=p.invX+inv.c*5, iy2=p.invY+inv.r*6;
        if(Math.abs(pb.x-ix2)<3&&Math.abs(pb.y-iy2)<3){ inv.alive=false; p.bullets.splice(i,1); break; }
      }
    }
    if(p.bullets.length>3) p.bullets.length=3;

    // Enemy bombs
    if(Math.sin(p.t*2.5)>0.85&&p.bombs.length<3){
      const alive=p.invAlive.filter(i=>i.alive);
      if(alive.length>0){
        const shooter=alive[Math.floor(Math.random()*alive.length)];
        p.bombs.push({x:p.invX+shooter.c*5,y:p.invY+shooter.r*6});
      }
    }
    for(let i=p.bombs.length-1;i>=0;i--){
      p.bombs[i].y-=30*dt;
      const bm=p.bombs[i];
      if(bm.y<0){ p.bombs.splice(i,1); continue; }
      const bx=Math.round(bm.x), by=Math.round(bm.y);
      setP(bx,by,1,1,0); setP(bx,by-1,1,0.8,0);
      // Bomb hits shield
      for(let s=0;s<4;s++){
        const sx=4+s*15;
        if(bx>=sx&&bx<=sx+8&&by>=12&&by<=17){
          p.shieldDmg.add(bx+','+by); p.shieldDmg.add(bx+','+(by+1)); p.shieldDmg.add((bx-1)+','+by); p.shieldDmg.add((bx+1)+','+by);
          p.bombs.splice(i,1); break;
        }
      }
      if(bm.y>=6&&bm.y<=10&&Math.abs(bm.x-p.playerX)<4&&p.explodeT<=0&&p.respawnT<=0){
        p.explodeT=0.5;
        p.lives--;
        if(p.lives<=0){
          p.loserT=3;
        }
        p.bombs.splice(i,1);
      }
    }
    if(p.bombs.length>4) p.bombs.length=4;

    // Reset invaders when all dead — next wave faster
    if(p.invAlive.every(i=>!i.alive)){
      for(const i of p.invAlive) i.alive=true;
      p.invY=32; p.invX=5; p.shieldDmg=new Set();
      p.wave++;
    }

    // 4 cyan shields with damage holes
    const shieldW=8, shieldH=5;
    for(let s=0;s<4;s++){
      const sx2=4+s*15;
      for(let sy=12;sy<=12+shieldH;sy++) for(let sxx=sx2;sxx<=sx2+shieldW;sxx++){
        if(sy<=13&&sxx>=sx2+3&&sxx<=sx2+5) continue;
        if(!p.shieldDmg.has(sxx+','+sy)) setP(sxx,sy,0,0.9,0.9);
      }
    }

    // Ground line
    hLine(0,S-1,4,0,0.8,0);

    // HUD at top
    hLine(2,20,S-2,0,0.8,0.8);
    for(let l=0;l<p.lives;l++){
      setP(28+l*4,S-2,0,0.8,0); setP(28+l*4,S-3,0,0.8,0); setP(27+l*4,S-2,0,0.6,0); setP(29+l*4,S-2,0,0.6,0);
    }

  } else if(game.name==='jsw'){
    const p=game;
    p.roomT+=dt;
    if(p.roomT>10){ p.room=(p.room+1)%4; p.roomT=0; p.playerX=10; p.playerY=14; }
    const borderW=3;
    const playL=borderW, playR=S-1-borderW;
    const groundY=12;

    // Blue border (thick, like original)
    for(let y=0;y<S;y++){
      for(let x=0;x<borderW;x++){
        const pat=((x+y)%2===0)?0.7:0.4;
        setP(x,y,0,0,pat); setP(S-1-x,y,0,0,pat);
      }
    }
    for(let x=0;x<S;x++){
      setP(x,S-1,0,0,0.6); setP(x,S-2,0,0,0.5);
      setP(x,0,0,0,0.6); setP(x,1,0,0,0.5);
    }

    // Room colours (magenta/red walls like original)
    const roomWallCol=p.room===0?[0.8,0,0.5]:p.room===1?[0.7,0,0]:p.room===2?[0,0.6,0]:[0.7,0.7,0];
    const rw=roomWallCol;

    // Magenta/red walls on right side (like screenshot shows thick wall)
    if(p.room===0||p.room===1){
      for(let y=groundY+1;y<S-2;y++){
        for(let x=playR-4;x<=playR;x++){
          const checker=((x+y)%2===0)?1:0.6;
          setP(x,y,rw[0]*checker,rw[1]*checker,rw[2]*checker);
        }
      }
    }

    // Yellow ground/floor with pattern
    for(let x=playL;x<=playR;x++){
      setP(x,groundY,0.85,0.85,0); setP(x,groundY-1,0.7,0.7,0);
    }

    // Platforms (yellow, like original)
    const plats=p.room===0?[[24,playL,playL+18],[24,playL+22,playR-8],[38,playL+10,playR-10],[50,playL,playL+15],[50,playR-12,playR]]:
                p.room===1?[[20,playL,playL+20],[32,playL+15,playR-5],[44,playL+5,playR-15],[52,playL,playR]]:
                p.room===2?[[22,playL+5,playL+25],[34,playL+20,playR-5],[46,playL,playL+18],[46,playR-15,playR]]:
                           [[20,playL+10,playR-10],[34,playL,playL+16],[34,playR-16,playR],[48,playL+5,playR-5]];
    for(const pl of plats){
      for(let x=pl[1];x<=pl[2];x++){
        setP(x,pl[0],0.85,0.85,0); setP(x,pl[0]-1,0.6,0.6,0);
      }
    }

    // Stairs (diagonal lines of pixels, like original)
    if(p.room===0){
      for(let s=0;s<10;s++){
        const sx=playR-10+s, sy=groundY+1+s;
        if(sx<S&&sy<S-2) setP(sx,sy,0.7,0.7,0.7);
      }
    }
    if(p.room<3){
      for(let s=0;s<8;s++){
        const sx=playL+2+s, sy=plats[0][0]+1+s;
        if(sx<S&&sy<S-2) setP(sx,sy,0.7,0.7,0.7);
      }
    }

    // Willy auto-play
    p.playerX+=p.dir*12*dt;
    if(p.playerX>playR-4){p.dir=-1;} else if(p.playerX<playL+2){p.dir=1;}
    if(!p.jumping&&Math.sin(p.t*2.2)>0.75){ p.jumping=true; p.jumpT=0; }
    if(p.jumping){ p.jumpT+=dt; if(p.jumpT>0.55) p.jumping=false; }
    const jumpH=p.jumping?Math.sin(p.jumpT/0.55*Math.PI)*14:0;
    if(!p.baseY) p.baseY=groundY+1;
    if(!p.jumping){
      let bestY=groundY+1;
      for(const pl of plats){
        if(p.playerX>=pl[1]&&p.playerX<=pl[2]){
          if(pl[0]+1>bestY) bestY=pl[0]+1;
        }
      }
      p.baseY+=(bestY-p.baseY)*Math.min(1,dt*8);
      if(Math.abs(p.baseY-bestY)<0.5) p.baseY=bestY;
    }
    p.playerY=Math.round(p.baseY+jumpH);
    const px=Math.round(p.playerX), py=p.playerY;

    // Willy sprite (cyan body like original screenshot)
    setP(px,py+6,0,0.8,0.8); // head
    setP(px-1,py+5,0,0.7,0.7); setP(px,py+5,0,0.9,0.9); setP(px+1,py+5,0,0.7,0.7); // body
    setP(px-1,py+4,0,0.8,0.8); setP(px,py+4,0,0.9,0.9); setP(px+1,py+4,0,0.8,0.8);
    setP(px,py+3,0,0.7,0.7);
    // Legs
    const legF=Math.floor(p.t*8)%4;
    setP(px-(legF<2?1:-1),py+2,0,0.7,0.7);
    setP(px+(legF<2?1:-1),py+2,0,0.7,0.7);
    setP(px-(legF<2?1:-1),py+1,0,0.6,0.6);

    // Enemies — red blob (like guardian in screenshot), others patrolling
    const enemyDefs=[
      {plat:0,col:[0.8,0,0],size:3},
      {plat:1,col:[0,0.8,0],size:2},
      {plat:2,col:[0.8,0,0.8],size:2}
    ];
    for(let e=0;e<enemyDefs.length;e++){
      const ed=enemyDefs[e];
      const ePlat=plats[ed.plat%plats.length];
      const ex=Math.round((ePlat[1]+ePlat[2])/2+Math.sin(p.t*1.5+e*2)*((ePlat[2]-ePlat[1])*0.3));
      const ey=ePlat[0]+1;
      const ec=ed.col;
      // Guardian body
      for(let dy=0;dy<ed.size+2;dy++) for(let dx=-ed.size+1;dx<ed.size;dx++){
        const sx=ex+dx, sy=ey+dy;
        if(sx>=playL&&sx<=playR&&sy>=2&&sy<S-2){
          const bright=0.7+0.3*((dx+dy)%2);
          setP(sx,sy,ec[0]*bright,ec[1]*bright,ec[2]*bright);
        }
      }
    }

    // Flashing collectible items
    for(let i=0;i<5;i++){
      const iPlat=plats[i%plats.length];
      const ix=iPlat[1]+3+i*4, iy=iPlat[0]+2;
      if(ix>playR-2) continue;
      const flash=Math.floor(p.t*4+i)%2;
      if(flash){
        setP(ix,iy,1,1,0); setP(ix+1,iy,1,1,0);
        setP(ix,iy+1,1,0.8,0); setP(ix+1,iy+1,1,0.8,0);
      }
    }

    // Room name bar at bottom (like "Top Landing" in screenshot)
    for(let x=playL;x<=playR;x++) setP(x,7,0.15,0.15,0.15);

    // HUD: "Items collected" and "Time" text area
    for(let x=playL;x<=playR;x++){
      setP(x,4,0,0.6,0); // green text line
    }

    // Lives at bottom (small coloured figures)
    for(let l=0;l<3;l++){
      const lx=playL+2+l*5, ly=3;
      setP(lx,ly+2,0,0.8,0); setP(lx,ly+1,0,0.7,0); setP(lx,ly,0,0.6,0);
      setP(lx-1,ly+1,0,0.5,0); setP(lx+1,ly+1,0,0.5,0);
      setP(lx,ly+3,0.8,0,0); // hat
    }

  } else if(game.name==='deathchase'){
    // 3D Deathchase — first-person motorcycle through forest
    const p=game;
    p.speed=0.9+0.1*Math.sin(p.t*0.4);
    p.treeOff-=p.speed*dt*50;
    p.leanDir=Math.sin(p.t*0.7)*0.8;
    p.bikeX=32+Math.round(p.leanDir*12);
    const H=S/2;

    // Blue sky (top half, y=0..H-1)
    for(let y=0;y<H;y++){
      const t=y/H;
      for(let x=0;x<S;x++) setP(x,y,0.1*t,0.3*t,0.85-0.3*t);
    }

    // Green ground (bottom half, y=H..S-1)
    for(let y=H;y<S;y++){
      const depth=(y-H)/(S-H);
      const scrollLine=Math.floor(p.treeOff+y*3)%8;
      const g=depth>0.1?(scrollLine<4?0.35:0.25):0.15;
      for(let x=0;x<S;x++) setP(x,y,0,g,0);
    }

    // Horizon line
    hLine(0,S-1,H,0,0.45,0);

    // Trees — travel towards bike (appear small at horizon, grow bigger)
    for(let t=0;t<12;t++){
      const treeZ=((t*17+p.treeOff*0.3)%80);
      const tz=treeZ<0?treeZ+80:treeZ;
      if(tz<2) continue;
      const perspective=20/tz;
      const treeBaseX=(t%2===0?-1:1)*(15+((t*7)%20));
      const screenX=Math.round(S/2+treeBaseX*perspective-p.leanDir*perspective*8);
      const baseY=Math.round(H+perspective*2);
      const treeH=Math.round(perspective*25);
      const trunkW=Math.max(1,Math.round(perspective*3));

      if(screenX<-5||screenX>S+5) continue;

      for(let ty=0;ty<treeH;ty++){
        const sy=baseY-ty;
        if(sy<0||sy>=S) continue;
        for(let tw=0;tw<trunkW;tw++){
          const sx=screenX-Math.floor(trunkW/2)+tw;
          if(sx>=0&&sx<S) setP(sx,sy,0.35,0.15,0);
        }
      }
      const canopyR=Math.max(2,Math.round(perspective*6));
      const canopyY=baseY-treeH;
      for(let dy=-canopyR;dy<=canopyR;dy++) for(let dx=-canopyR;dx<=canopyR;dx++){
        if(dx*dx+dy*dy<=canopyR*canopyR){
          const sx=screenX+dx, sy=canopyY+dy;
          if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0.5-dy*0.03,0);
        }
      }
    }

    // Enemy bike (ahead, weaving) — smaller and darker, further away
    const enemyZ=25+Math.sin(p.t*0.6)*8;
    const ePerspective=12/enemyZ;
    const eScreenX=Math.round(S/2+Math.sin(p.t*1.3)*10*ePerspective);
    const eScreenY=Math.round(H+ePerspective*2);
    const eH=Math.max(4,Math.round(ePerspective*14));
    const eW=Math.max(2,Math.round(ePerspective*4));
    const wheelR=Math.max(1,Math.round(ePerspective*2));
    // Rear wheel
    for(let dy=-wheelR;dy<=wheelR;dy++) for(let dx=-wheelR;dx<=wheelR;dx++){
      if(dx*dx+dy*dy<=wheelR*wheelR){
        const sx=eScreenX-eW+dx, sy=eScreenY+dy;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0.12,0.12,0.12);
      }
    }
    // Front wheel
    for(let dy=-wheelR;dy<=wheelR;dy++) for(let dx=-wheelR;dx<=wheelR;dx++){
      if(dx*dx+dy*dy<=wheelR*wheelR){
        const sx=eScreenX+eW+dx, sy=eScreenY+dy;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0.12,0.12,0.12);
      }
    }
    // Wheel spokes
    setP(eScreenX-eW,eScreenY,0.3,0.3,0.3);
    setP(eScreenX+eW,eScreenY,0.3,0.3,0.3);
    // Frame/chassis (very dark)
    for(let fx=eScreenX-eW;fx<=eScreenX+eW;fx++){
      if(fx>=0&&fx<S){ setP(fx,eScreenY-1,0.2,0.05,0.05); setP(fx,eScreenY-2,0.15,0.04,0.04); }
    }
    // Engine block
    const engW=Math.max(1,Math.round(eW*0.4));
    fillRect(eScreenX-engW,eScreenY-2,eScreenX+engW,eScreenY-1,0.15,0.15,0.18);
    // Exhaust pipe
    if(eScreenX+eW+1<S) setP(eScreenX+eW+1,eScreenY-1,0.3,0.15,0.02);
    // Rider legs (dark)
    const legH=Math.max(1,Math.round(eH*0.2));
    for(let dy=0;dy<legH;dy++){
      const sy=eScreenY-3-dy;
      if(sy>=0&&sy<S){
        setP(eScreenX-1,sy,0.05,0.05,0.2);
        setP(eScreenX+1,sy,0.05,0.05,0.2);
      }
    }
    // Rider torso (dark green)
    const torsoH=Math.max(1,Math.round(eH*0.3));
    const torsoBase=eScreenY-3-legH;
    for(let dy=0;dy<torsoH;dy++){
      const sy=torsoBase-dy;
      if(sy<0||sy>=S) continue;
      const tw=Math.max(1,Math.round(eW*0.4));
      for(let dx=-tw;dx<=tw;dx++){
        const sx=eScreenX+dx;
        if(sx>=0&&sx<S) setP(sx,sy,0.05,0.3,0.05);
      }
    }
    // Arms
    const armY=torsoBase-Math.round(torsoH*0.3);
    if(armY>=0&&armY<S){
      for(let ax=1;ax<=Math.max(1,Math.round(eW*0.5));ax++){
        const sx1=eScreenX-ax, sx2=eScreenX+ax;
        if(sx1>=0) setP(sx1,armY,0.05,0.25,0.05);
        if(sx2<S) setP(sx2,armY,0.05,0.25,0.05);
      }
    }
    // Rider head (dark helmet)
    const headY=torsoBase-torsoH;
    if(headY>=1&&headY<S){
      setP(eScreenX,headY,0.4,0.05,0.05);
      if(eScreenX-1>=0) setP(eScreenX-1,headY,0.3,0.03,0.03);
      if(eScreenX+1<S) setP(eScreenX+1,headY,0.3,0.03,0.03);
      setP(eScreenX,headY-1,0.4,0.05,0.05);
    }
    // Handlebars
    const hbY=eScreenY-3;
    if(hbY>=0&&hbY<S){
      setP(eScreenX-eW+1,hbY,0.25,0.25,0.25);
      setP(eScreenX+eW-1,hbY,0.25,0.25,0.25);
    }

    // Fire bullet occasionally from player bike
    p.fireT-=dt;
    if(p.fireT<=0){
      p.fireT=1.5+Math.random()*2;
      p.bullets.push({x:p.bikeX,y:S-10,alive:true});
    }
    // Update and draw bullets
    for(let i=p.bullets.length-1;i>=0;i--){
      const b=p.bullets[i];
      b.y-=60*dt;
      if(b.y<H){ p.bullets.splice(i,1); continue; }
      const bx=Math.round(b.x), by=Math.round(b.y);
      setP(bx,by,1,1,0);
      setP(bx,by+1,1,0.6,0);
    }
    if(p.bullets.length>4) p.bullets.length=4;

    // Player bike (bottom centre)
    const bx=p.bikeX;
    const by=S-6;
    hLine(bx-5,bx+5,by,WHT[0],WHT[1],WHT[2]);
    hLine(bx-5,bx+5,by+1,WHT[0]*0.6,WHT[1]*0.6,WHT[2]*0.6);
    setP(bx-4,by-1,WHT[0]*0.7,WHT[1]*0.7,WHT[2]*0.7); setP(bx+4,by-1,WHT[0]*0.7,WHT[1]*0.7,WHT[2]*0.7);
    setP(bx-3,by-2,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5); setP(bx+3,by-2,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    fillRect(bx-2,by-4,bx+2,by-2,WHT[0]*0.4,WHT[1]*0.4,WHT[2]*0.4);
    setP(bx,by-3,WHT[0],WHT[1],WHT[2]);
    // Crosshair at horizon
    setP(bx,H,WHT[0],WHT[1],WHT[2]);
    setP(bx-1,H,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx+1,H,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx,H-1,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx,H+1,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);

    // HUD at very bottom
    hLine(0,S-1,S-1,0,0,0);
    hLine(0,S-1,S-2,0,0,0);
    const speedBar=Math.round(p.speed*20);
    hLine(2,2+speedBar,S-1,GRN[0],GRN[1],GRN[2]);

    // Rotate 180 degrees
    for(let y=0;y<Math.floor(S/2);y++){
      const y2=S-1-y;
      for(let x=0;x<S;x++){
        const i1=(y*S+x)*3, i2=(y2*S+(S-1-x))*3;
        const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
        buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
        buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
      }
    }

  } else if(game.name==='rtype'){
    const p=game;
    p.scrollX+=dt*18;
    if(!p.dodgeTarget) p.dodgeTarget=32;
    if(!p.dodgeTimer) p.dodgeTimer=0;
    p.dodgeTimer-=dt;
    // Find nearest threat approaching the ship
    let nearestThreatY=null, nearestDist=999;
    for(const e of p.enemies){
      if(!e.alive) continue;
      const dx=e.x-(S-10);
      if(dx>-20&&dx<10){
        const dist=Math.abs(dx)+Math.abs(e.y-p.dodgeTarget)*0.5;
        if(dist<nearestDist){ nearestDist=dist; nearestThreatY=e.y; }
      }
    }
    if(p.dodgeTimer<=0||(nearestThreatY!==null&&Math.abs(nearestThreatY-p.dodgeTarget)<8)){
      // Dodge: move away from nearest threat, or pick random Y
      if(nearestThreatY!==null){
        p.dodgeTarget=nearestThreatY>32?16+Math.random()*14:46+Math.random()*10;
      } else {
        p.dodgeTarget=16+Math.random()*38;
      }
      p.dodgeTimer=0.6+Math.random()*0.8;
    }
    const shipSpeed=28*dt;
    const shipDy=p.dodgeTarget-p.shipY;
    p.shipY+=Math.sign(shipDy)*Math.min(Math.abs(shipDy),shipSpeed);
    p.shipY=Math.max(14,Math.min(S-10,p.shipY));
    if(!p.shipXTarget) p.shipXTarget=S-10;
    if(!p.shipXTimer) p.shipXTimer=0;
    p.shipXTimer-=dt;
    if(p.shipXTimer<=0){
      if(Math.random()<0.3) p.shipXTarget=S-18-Math.random()*10;
      else p.shipXTarget=S-10+Math.random()*4;
      p.shipXTimer=1.5+Math.random()*2.5;
    }
    const shipXSpeed=20*dt;
    const shipDx=p.shipXTarget-p.shipX;
    p.shipX+=Math.sign(shipDx)*Math.min(Math.abs(shipDx),shipXSpeed);
    const terrainH=10;
    const hudH=6;

    // Scrolling stars (different speeds for parallax)
    for(let i=0;i<50;i++){
      const speed=1+((i*7)%3);
      const sx=((i*17+Math.floor(p.scrollX*speed*0.3))%S);
      const sy=hudH+((i*41+7)%(S-hudH-terrainH));
      const br=0.15+((i*3)%4)*0.08;
      setP(sx,sy,br,br,br);
    }

    // Ground terrain (grey/brown rocky, scrolling)
    for(let x=0;x<S;x++){
      const wx=x+Math.floor(p.scrollX);
      const h=terrainH+Math.round(Math.sin(wx*0.12)*2+Math.sin(wx*0.25)*1.5);
      for(let y=0;y<h;y++){
        const shade=0.25+((wx+y*3)%5)*0.04;
        setP(x,y,shade,shade*0.9,shade*0.7);
      }
      if(((wx)%4)<2) setP(x,h,0.4,0.35,0.25);
    }

    // Player ship (white/cyan R-9 — facing left so it appears right on display)
    const sx=Math.round(p.shipX), sy=Math.round(p.shipY);
    // Main fuselage
    for(let dx=0;dx<6;dx++) setP(sx-dx,sy,1,1,1);
    setP(sx-6,sy,0,1,1); // nose cyan
    setP(sx-1,sy-1,1,1,1); setP(sx-2,sy-1,1,1,1); setP(sx-3,sy-1,0,1,1);
    setP(sx-1,sy+1,1,1,1); setP(sx-2,sy+1,1,1,1); setP(sx-3,sy+1,0,1,1);
    // Tail fin
    setP(sx,sy-2,0,1,1); setP(sx,sy+2,0,1,1);
    // Engine exhaust
    const ef=Math.sin(p.t*25)>0?1:0.5;
    setP(sx+1,sy,1*ef,0.5*ef,0); setP(sx+2,sy,1*ef,0.3*ef,0);

    // Beam weapon (long cyan beam extending from ship nose to the left)
    if(p.chargeT>0){
      p.chargeT-=dt;
      const beamLen=Math.min(sx-6,40);
      for(let bx=0;bx<beamLen;bx++){
        const bpx=sx-7-bx;
        if(bpx<0) break;
        setP(bpx,sy,0,1,1);
        if(bx<beamLen*0.7){ setP(bpx,sy-1,0,0.5,0.5); setP(bpx,sy+1,0,0.5,0.5); }
      }
      // Hit enemies with beam
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(e.x<sx-7&&e.x>sx-7-beamLen&&Math.abs(e.y-sy)<3) e.alive=false;
      }
    }
    // Fire beam periodically
    if(Math.sin(p.t*0.9)>0.7&&p.chargeT<=0) p.chargeT=0.8;

    // Normal bullets when not beaming
    if(p.chargeT<=0&&Math.sin(p.t*6)>0.85&&p.bullets.length<5)
      p.bullets.push({x:sx-7,y:sy});

    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].x-=70*dt;
      const b=p.bullets[i];
      if(b.x<-2){ p.bullets.splice(i,1); continue; }
      const bx=Math.round(b.x), by=Math.round(b.y);
      setP(bx,by,1,1,0); setP(bx-1,by,1,1,0);
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(Math.abs(b.x-e.x)<3&&Math.abs(b.y-e.y)<3){ e.alive=false; p.bullets.splice(i,1); break; }
      }
    }
    if(p.bullets.length>5) p.bullets.length=5;

    // Enemies (red, coming from the left)
    for(const e of p.enemies){
      if(!e.alive) continue;
      e.x+=12*dt;
      e.y+=Math.sin(p.t*2.5+e.phase)*6*dt;
      if(e.x>S+4){ e.x=-4-Math.random()*20; e.y=terrainH+5+Math.random()*(S-terrainH-hudH-10); e.alive=true; }
      const ex=Math.round(e.x), ey=Math.round(e.y);
      if(e.type===0){
        // Small red pod
        setP(ex,ey,1,0,0); setP(ex+1,ey,1,0,0); setP(ex,ey-1,0.8,0,0); setP(ex,ey+1,0.8,0,0);
      } else if(e.type===1){
        // Larger red enemy (3x3)
        fillRect(ex-1,ey-1,ex+1,ey+1,1,0,0);
        setP(ex-1,ey,0.8,0.2,0); setP(ex+1,ey,0.8,0.2,0);
        setP(ex,ey-1,1,0.3,0); setP(ex,ey+1,1,0.3,0);
      } else {
        // Yellow/green crescent enemy
        setP(ex,ey,1,1,0); setP(ex+1,ey-1,1,1,0); setP(ex+1,ey+1,1,1,0);
        setP(ex-1,ey,0.8,0.8,0);
      }
    }
    // Respawn dead enemies
    if(p.enemies.filter(e=>e.alive).length<2){
      for(const e of p.enemies){ e.alive=true; e.x=-Math.random()*20; e.y=terrainH+5+Math.random()*(S-terrainH-hudH-10); }
    }

    // HUD at top (yellow text area like Spectrum)
    for(let x=0;x<S;x++) for(let y=S-hudH;y<S;y++) setP(x,y,0,0,0);
    hLine(0,S-1,S-hudH,0.3,0.3,0);
    // BEAM indicator left
    const beamTxt=[0x7C,0x7E,0x6A,0x7E]; // B E A M simplified
    for(let ci=0;ci<4;ci++) setP(2+ci*2,S-3,0.8,0,0.8);
    // Beam meter bar
    const meterLen=Math.round(20*(p.chargeT>0?p.chargeT/0.8:0));
    for(let mx=0;mx<20;mx++) setP(12+mx,S-3,mx<meterLen?0:0.8,mx<meterLen?1:0.8,mx<meterLen?1:0);
    // Score
    for(let d=0;d<5;d++) setP(2+d,S-5,0,0.8,0);
    // BEAM indicator right
    for(let ci=0;ci<4;ci++) setP(S-10+ci*2,S-3,0.8,0,0.8);
    hLine(40,S-4,S-3,0,0.8,0.8);

  } else if(game.name==='wolf3d'){
    const p=game;
    // Predefined corridor walk path — player walks through corridors looking ahead
    const waypoints=[
      {x:1.5,y:1.5,a:0},{x:5.5,y:1.5,a:0},{x:5.5,y:1.5,a:-Math.PI/2},
      {x:5.5,y:5.5,a:-Math.PI/2},{x:5.5,y:5.5,a:Math.PI},
      {x:1.5,y:5.5,a:Math.PI},{x:1.5,y:5.5,a:Math.PI/2},
      {x:1.5,y:1.5,a:Math.PI/2}
    ];
    const segLen=2.5;
    const totalT=waypoints.length*segLen;
    const wt=p.t%totalT;
    const segIdx=Math.floor(wt/segLen)%waypoints.length;
    const segFrac=(wt%segLen)/segLen;
    const w0=waypoints[segIdx], w1=waypoints[(segIdx+1)%waypoints.length];
    p.posX=w0.x+(w1.x-w0.x)*segFrac;
    p.posY=w0.y+(w1.y-w0.y)*segFrac;
    // Smooth angle interpolation
    let da=w1.a-w0.a;
    while(da>Math.PI)da-=Math.PI*2; while(da<-Math.PI)da+=Math.PI*2;
    p.dirA=w0.a+da*segFrac;
    p.fireT-=dt;
    if(p.fireT<-2){ p.fireT=0.3; p.gunFrame=3; }
    if(p.gunFrame>0) p.gunFrame-=dt*8;

    const map=[
      1,1,1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,2,1,0,1,2,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,0,3,3,0,1,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,2,1,0,0,1,0,0,1,
      1,0,0,0,0,0,0,2,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,1,1,
    ];
    const mapW=10;
    const hudH=6;

    // Grey ceiling
    for(let y=S/2;y<S-hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.35,0.35,0.38);
    // Grey floor
    for(let y=0;y<S/2;y++) for(let x=0;x<S;x++){
      const shade=0.15+0.08*(y/(S/2));
      setP(x,y,shade,shade*0.9,shade*0.75);
    }

    // Raycast walls
    const fov=1.0;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0,hitType=0,rx=p.posX,ry=p.posY,hitSide=0;
      for(let step=0;step<50;step++){
        dist+=0.08;
        rx=p.posX+rdx*dist; ry=p.posY+rdy*dist;
        const mx=Math.floor(rx), my=Math.floor(ry);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx]; hitSide=Math.abs(rx-Math.round(rx))<Math.abs(ry-Math.round(ry))?0:1; break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S,Math.round(S/(perpDist+0.01)));
      const wallTop=Math.floor(S/2+wallH/2);
      const wallBot=Math.floor(S/2-wallH/2);
      const shade=Math.min(1,1.8/(perpDist+0.5))*(hitSide?0.7:1);
      let wr,wg,wb;
      if(hitType===1){ wr=0.4*shade; wg=0.4*shade; wb=0.42*shade; }
      else if(hitType===2){ wr=0.15*shade; wg=0.15*shade; wb=0.55*shade; }
      else { wr=0.6*shade; wg=0.12*shade; wb=0.08*shade; }
      // Stone block texture
      const fracY=ry-Math.floor(ry), fracX=rx-Math.floor(rx);
      for(let y=Math.max(0,wallBot);y<=Math.min(S-hudH-1,wallTop);y++){
        const wallFrac=(y-wallBot)/(wallTop-wallBot+1);
        const blockY=Math.floor(wallFrac*4);
        const isMortar=(Math.abs(wallFrac*4-blockY)<0.08)||(hitType===1&&(fracX<0.03||fracX>0.97));
        const mr=isMortar?0.15:0, mg=isMortar?0.15:0, mb=isMortar?0.15:0;
        setP(x,y,wr-mr,wg-mg,wb-mb); setP(x+1,y,wr-mr,wg-mg,wb-mb);
      }
      // Red banner on blue walls
      if(hitType===2){
        const banH=Math.floor(wallH*0.4);
        const banMid=Math.floor((wallTop+wallBot)/2);
        for(let y=banMid-Math.floor(banH/2);y<=banMid+Math.floor(banH/2);y++){
          if(y>=0&&y<S-hudH) { setP(x,y,0.7*shade,0.05*shade,0.05*shade); setP(x+1,y,0.7*shade,0.05*shade,0.05*shade); }
        }
      }
    }

    // Multiple guard enemies at corridor positions
    const guards=[{x:5.5,y:3.5},{x:3.5,y:5.5},{x:7.5,y:7.5},{x:1.5,y:3.5}];
    for(let gi=0;gi<guards.length;gi++){
      const gp=guards[gi];
      const guardAngle=Math.atan2(gp.y-p.posY,gp.x-p.posX);
      const guardRelAngle=guardAngle-p.dirA;
      const normAngle=((guardRelAngle+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(normAngle)<fov/2){
        const guardDist=Math.sqrt((gp.x-p.posX)**2+(gp.y-p.posY)**2);
        if(guardDist<0.8) continue;
        const screenX=Math.floor(S/2+normAngle/(fov/2)*(S/2));
        const sprH=Math.min(S*0.8,Math.round(S/(guardDist+0.01)));
        const sprW=Math.floor(sprH*0.4);
        const sprBot=Math.floor(S/2-sprH/2);
        const gShade=Math.min(1,1.5/(guardDist+0.5));
        for(let dy=Math.floor(sprH*0.2);dy<Math.floor(sprH*0.85);dy++){
          for(let dx=-Math.floor(sprW/2);dx<=Math.floor(sprW/2);dx++){
            const gx2=screenX+dx, gy2=sprBot+dy;
            if(gx2>=0&&gx2<S&&gy2>=0&&gy2<S-hudH) setP(gx2,gy2,0.1*gShade,0.1*gShade,0.6*gShade);
          }
        }
        const headY=sprBot+Math.floor(sprH*0.85);
        const headR=Math.max(1,Math.floor(sprW*0.3));
        for(let dy=-headR;dy<=headR;dy++) for(let dx=-headR;dx<=headR;dx++){
          if(dx*dx+dy*dy<=headR*headR){
            const hx=screenX+dx, hy=headY+dy;
            if(hx>=0&&hx<S&&hy>=0&&hy<S-hudH) setP(hx,hy,0.75*gShade,0.55*gShade,0.35*gShade);
          }
        }
        for(let dx=-headR;dx<=headR;dx++){
          const cx2=screenX+dx, cy=headY+headR;
          if(cx2>=0&&cx2<S&&cy>=0&&cy<S-hudH) setP(cx2,cy,0.05*gShade,0.05*gShade,0.5*gShade);
          if(cx2>=0&&cx2<S&&cy+1>=0&&cy+1<S-hudH) setP(cx2,cy+1,0.05*gShade,0.05*gShade,0.5*gShade);
        }
      }
    }

    // Chain gun (centred at bottom)
    const gunBob=Math.round(Math.sin(p.t*5)*1.5);
    const gx=Math.floor(S/2), gy=hudH+gunBob;
    // Barrel (metallic grey, angled from bottom-centre toward screen)
    for(let by=0;by<16;by++){
      const bw=Math.max(1,3-Math.floor(by/5));
      const shade2=0.35+by*0.015;
      for(let bx=-bw;bx<=bw;bx++){
        const px2=gx+bx, py2=gy+by;
        if(py2<S-hudH) setP(px2,py2,shade2,shade2,shade2*1.05);
      }
    }
    // Hand/grip
    fillRect(gx-4,gy,gx-1,gy+5,0.75,0.55,0.35);
    fillRect(gx+1,gy,gx+4,gy+5,0.75,0.55,0.35);
    // Muzzle flash
    if(p.gunFrame>2){
      fillRect(gx-2,gy+16,gx+2,gy+20,1,0.9,0.2);
      setP(gx,gy+21,1,1,0.8);
    }

    // HUD bar (blue background like original)
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.15,0.15,0.45);
    hLine(0,S-1,hudH-1,0.3,0.3,0.6);
    // BJ face (centre)
    fillRect(S/2-3,1,S/2+3,4,0.75,0.55,0.35);
    setP(S/2-1,3,0.15,0.15,0.5); setP(S/2+1,3,0.15,0.15,0.5);
    setP(S/2,2,0.6,0.4,0.25);
    // Health (left)
    hLine(2,12,2,0.8,0.1,0.1);
    // Ammo (right)
    hLine(S-14,S-3,2,0.8,0.8,0.1);

  } else if(game.name==='quake2'){
    const p=game;
    // Walk through corridors looking down them
    const qWaypoints=[
      {x:1.5,y:1.5,a:0},{x:5.5,y:1.5,a:0},{x:5.5,y:1.5,a:-Math.PI/2},
      {x:5.5,y:5.5,a:-Math.PI/2},{x:5.5,y:5.5,a:-Math.PI},
      {x:1.5,y:5.5,a:-Math.PI},{x:1.5,y:5.5,a:Math.PI/2},
      {x:1.5,y:8.5,a:Math.PI/2},{x:1.5,y:8.5,a:0},
      {x:8.5,y:8.5,a:0},{x:8.5,y:8.5,a:Math.PI/2},
      {x:8.5,y:1.5,a:Math.PI/2},{x:8.5,y:1.5,a:Math.PI},
      {x:5.5,y:1.5,a:Math.PI}
    ];
    const qSegLen=2.2;
    const qTotalT=qWaypoints.length*qSegLen;
    const qwt=p.t%qTotalT;
    const qSegIdx=Math.floor(qwt/qSegLen)%qWaypoints.length;
    const qSegFrac=(qwt%qSegLen)/qSegLen;
    const qw0=qWaypoints[qSegIdx], qw1=qWaypoints[(qSegIdx+1)%qWaypoints.length];
    p.posX=qw0.x+(qw1.x-qw0.x)*qSegFrac;
    p.posY=qw0.y+(qw1.y-qw0.y)*qSegFrac;
    let qda=qw1.a-qw0.a;
    while(qda>Math.PI)qda-=Math.PI*2; while(qda<-Math.PI)qda+=Math.PI*2;
    p.dirA=qw0.a+qda*qSegFrac;
    p.bobT+=dt*6;
    p.muzzleT-=dt;
    if(p.muzzleT<-1.5){ p.muzzleT=0.15; }
    const lookUp=Math.sin(p.t*0.4)*5;
    const hudH=5;

    const map=[
      1,1,1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,1,0,1,0,1,0,1,
      1,0,0,0,0,1,0,0,0,1,
      1,1,2,1,0,1,0,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,0,1,3,1,0,0,1,
      1,0,1,0,0,0,0,0,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,1,1,
    ];
    const mapW=10;
    const horizon=Math.floor(S/2+lookUp);

    // Brown/tan sky (looking up at Strogg architecture)
    for(let y=Math.max(hudH,horizon);y<S;y++){
      const skyShade=0.12+0.06*((y-horizon)/(S-horizon+1));
      for(let x=0;x<S;x++) setP(x,y,skyShade*1.2,skyShade,skyShade*0.6);
    }
    // Olive-green/brown floor
    for(let y=hudH;y<Math.min(S,horizon);y++){
      const floorShade=0.08+0.1*((horizon-y)/(horizon-hudH+1));
      for(let x=0;x<S;x++) setP(x,y,floorShade*0.8,floorShade,floorShade*0.4);
    }

    // Raycast brown/tan rocky walls
    const fov=1.1;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0,hitType=0,hitSide=0,rx2=p.posX,ry2=p.posY;
      for(let step=0;step<50;step++){
        dist+=0.08;
        rx2=p.posX+rdx*dist; ry2=p.posY+rdy*dist;
        const mx=Math.floor(rx2), my=Math.floor(ry2);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx]; hitSide=Math.abs(rx2-Math.round(rx2))<Math.abs(ry2-Math.round(ry2))?0:1; break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S*2,Math.round(S*1.2/(perpDist+0.01)));
      const wallTop=Math.floor(horizon+wallH/2);
      const wallBot=Math.floor(horizon-wallH/2);
      const shade=Math.min(1,1.5/(perpDist+0.3))*(hitSide?0.75:1);
      let wr,wg,wb;
      if(hitType===1){
        wr=0.45*shade; wg=0.35*shade; wb=0.2*shade;
      } else if(hitType===2){
        wr=0.3*shade; wg=0.35*shade; wb=0.2*shade;
      } else {
        wr=0.5*shade; wg=0.25*shade; wb=0.1*shade;
      }
      const fracY2=ry2-Math.floor(ry2), fracX2=rx2-Math.floor(rx2);
      for(let y=Math.max(hudH,wallBot);y<=Math.min(S-1,wallTop);y++){
        const wallFrac=(y-wallBot)/(wallTop-wallBot+1);
        // Rocky texture
        const blockY=Math.floor(wallFrac*6);
        const isMortar=(Math.abs(wallFrac*6-blockY)<0.06)||(fracX2<0.04||fracX2>0.96);
        const tm=isMortar?0.08:0;
        // Light strips on type 2 walls
        const hasLight=hitType===2&&wallFrac>0.7&&wallFrac<0.78&&((fracX2>0.2&&fracX2<0.35)||(fracX2>0.5&&fracX2<0.65)||(fracX2>0.75&&fracX2<0.9));
        if(hasLight){ setP(x,y,0.8,0.75,0.5); setP(x+1,y,0.8,0.75,0.5); }
        else { setP(x,y,wr-tm,wg-tm,wb-tm); setP(x+1,y,wr-tm,wg-tm,wb-tm); }
      }
      // Doorway on type 3 walls (dark opening)
      if(hitType===3&&fracX2>0.2&&fracX2<0.8){
        const doorBot=Math.max(hudH,wallBot);
        const doorTop=Math.min(S-1,Math.floor(wallBot+wallH*0.75));
        for(let y=doorBot;y<=doorTop;y++){
          setP(x,y,0.06,0.04,0.02); setP(x+1,y,0.06,0.04,0.02);
        }
        // Red light inside doorway
        if(fracX2>0.4&&fracX2<0.6){
          const rlY=Math.floor((doorBot+doorTop)/2);
          if(rlY>=hudH&&rlY<S) { setP(x,rlY,0.5,0.05,0.02); setP(x+1,rlY,0.5,0.05,0.02); }
        }
      }
    }

    // Strogg enemies at corridor positions
    const stroggs=[{x:3.5,y:1.5},{x:5.5,y:3.5},{x:1.5,y:5.5},{x:8.5,y:5.5},{x:3.5,y:8.5}];
    const fov2=1.1;
    for(let si=0;si<stroggs.length;si++){
      const sp=stroggs[si];
      const eAngle=Math.atan2(sp.y-p.posY,sp.x-p.posX);
      const eRel=eAngle-p.dirA;
      const eNorm=((eRel+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(eNorm)<fov2/2){
        const eDist=Math.sqrt((sp.x-p.posX)**2+(sp.y-p.posY)**2);
        if(eDist<0.8) continue;
        const eScreenX=Math.floor(S/2+eNorm/(fov2/2)*(S/2));
        const eSprH=Math.min(S*0.7,Math.round(S/(eDist+0.01)));
        const eSprW=Math.floor(eSprH*0.35);
        const eSprBot=Math.floor(horizon-eSprH/2);
        const eShade=Math.min(1,1.4/(eDist+0.5));
        // Body (brown/olive Strogg armor)
        for(let dy=Math.floor(eSprH*0.15);dy<Math.floor(eSprH*0.8);dy++){
          for(let dx=-Math.floor(eSprW/2);dx<=Math.floor(eSprW/2);dx++){
            const ex=eScreenX+dx, ey=eSprBot+dy;
            if(ex>=0&&ex<S&&ey>=hudH&&ey<S) setP(ex,ey,0.35*eShade,0.3*eShade,0.15*eShade);
          }
        }
        // Red cybernetic eye
        const eHeadY=eSprBot+Math.floor(eSprH*0.82);
        const eHeadR=Math.max(1,Math.floor(eSprW*0.35));
        for(let dy=-eHeadR;dy<=eHeadR;dy++) for(let dx=-eHeadR;dx<=eHeadR;dx++){
          if(dx*dx+dy*dy<=eHeadR*eHeadR){
            const hx=eScreenX+dx, hy=eHeadY+dy;
            if(hx>=0&&hx<S&&hy>=hudH&&hy<S) setP(hx,hy,0.6*eShade,0.4*eShade,0.25*eShade);
          }
        }
        setP(eScreenX+1,eHeadY,0.9,0.1,0.05);
      }
    }

    // Crosshair
    const chx=Math.floor(S/2), chy=Math.floor(horizon);
    if(chy>hudH&&chy<S){ setP(chx-1,chy,1,1,1); setP(chx+1,chy,1,1,1); setP(chx,chy-1,1,1,1); setP(chx,chy+1,1,1,1); }

    // Weapon (olive/tan shotgun on right side, like screenshot)
    const bob=Math.round(Math.sin(p.bobT)*1.5);
    const wx=S-16, wy=hudH+bob;
    // Gun body (olive green metal)
    for(let by=0;by<18;by++){
      const bw=by<12?4:by<15?3:2;
      const angle=by*0.15;
      const gx2=wx+Math.round(Math.sin(angle)*2);
      for(let bx=-bw;bx<=bw;bx++){
        const px2=gx2+bx, py2=wy+by;
        if(px2>=0&&px2<S&&py2>=hudH&&py2<S){
          const gs=0.3+by*0.008;
          setP(px2,py2,gs*0.8,gs*0.85,gs*0.5);
        }
      }
    }
    // Hand (skin tone)
    fillRect(wx-4,wy,wx-1,wy+4,0.7,0.5,0.35);
    // Barrel highlights
    for(let by=14;by<18;by++){
      setP(wx,wy+by,0.4,0.42,0.3); setP(wx+1,wy+by,0.35,0.38,0.25);
    }
    // Muzzle flash
    if(p.muzzleT>0){
      for(let dy=-3;dy<=3;dy++) for(let dx=-2;dx<=2;dx++){
        const fx=wx+dx, fy=wy+18+dy;
        if(fx>=0&&fx<S&&fy>=hudH&&fy<S) setP(fx,fy,1,0.7+Math.random()*0.3,0.1);
      }
    }

    // HUD (dark bar at bottom)
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.05,0.05,0.05);
    hLine(0,S-1,hudH-1,0.15,0.12,0.08);
    // Health (green number + cross)
    hLine(2,8,2,0,0.7,0); setP(10,2,0,0.8,0); setP(10,3,0,0.8,0); setP(9,2,0,0.6,0); setP(11,2,0,0.6,0);
    // Ammo (yellow)
    hLine(16,22,2,0.8,0.6,0.1);
    // Weapon icon (small rectangle on right)
    fillRect(S-10,1,S-4,3,0.3,0.3,0.15);

  } else if(game.name==='samfox'){
    const p=game;
    p.dealT+=dt;
    const hudH=12;
    const roundLen=10;
    const handT=p.t%roundLen;
    const seed=Math.floor(p.t/roundLen);
    const flipT=2.5;
    const cardTopY=hudH+2;

    // Decode Sam Fox photo background once
    if(!sfGameBgData){
      const s=atob(SF_GAMEBG_B64);
      sfGameBgData=new Float32Array(s.length);
      for(let i=0;i<s.length;i++) sfGameBgData[i]=s.charCodeAt(i)/255;
    }
    // Draw photo as background
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const srcY=S-1-y;
      const i=(srcY*S+x)*3;
      setP(x,y,sfGameBgData[i],sfGameBgData[i+1],sfGameBgData[i+2]);
    }

    // 3 smaller cards over the body area
    const cardW=8, cardH=12;
    const gap=3;
    const totalW=cardW*3+gap*2;
    const cardStartX=Math.floor((S-totalW)/2);
    const cardY2=cardTopY+10;
    const vals=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
    const suits=[0,1,2,3];
    for(let c=0;c<3;c++){
      const dealDelay=c*0.35;
      if(handT<dealDelay) continue;
      const cx2=cardStartX+c*(cardW+gap);
      const faceUp=handT>flipT+c*0.3;
      // White card with black border
      fillRect(cx2-1,cardY2-1,cx2+cardW+1,cardY2+cardH+1,0,0,0);
      if(!faceUp){
        // Face down — red back with pattern
        fillRect(cx2,cardY2,cx2+cardW,cardY2+cardH,0.7,0,0);
        const ccx2=cx2+Math.floor(cardW/2), ccy2=cardY2+Math.floor(cardH/2);
        for(let dy3=-3;dy3<=3;dy3++) for(let dx3=-2;dx3<=2;dx3++){
          const nd2=Math.abs(dx3)/3+Math.abs(dy3)/4;
          if(nd2>0.35&&nd2<0.6) setP(ccx2+dx3,ccy2+dy3,0.9,0.2,0.2);
          if(nd2<0.2) setP(ccx2+dx3,ccy2+dy3,0.5,0,0.35);
        }
      } else {
        // Face up — white with value and suit
        fillRect(cx2,cardY2,cx2+cardW,cardY2+cardH,1,1,1);
        const vi2=(seed*7+c*11+5)%13;
        const si2=(seed*3+c*5+2)%4;
        const isRed2=si2<2;
        const cr3=isRed2?0.85:0, cg3=0, cb3=isRed2?0:0;
        // Value pip top-left
        fillRect(cx2+1,cardY2+cardH-3,cx2+3,cardY2+cardH-1,cr3,cg3,cb3);
        // Suit in centre
        const scx2=cx2+Math.floor(cardW/2), scy2=cardY2+Math.floor(cardH/2);
        if(si2===0){ // Heart
          setP(scx2-1,scy2+1,0.9,0,0);setP(scx2+1,scy2+1,0.9,0,0);
          setP(scx2,scy2,0.9,0,0);setP(scx2-1,scy2,0.9,0,0);setP(scx2+1,scy2,0.9,0,0);
          setP(scx2,scy2-1,0.9,0,0);
        } else if(si2===1){ // Diamond
          setP(scx2,scy2+1,0.9,0,0);setP(scx2,scy2-1,0.9,0,0);
          setP(scx2-1,scy2,0.9,0,0);setP(scx2+1,scy2,0.9,0,0);setP(scx2,scy2,0.9,0,0);
        } else if(si2===2){ // Club
          setP(scx2,scy2+1,0,0,0);setP(scx2-1,scy2,0,0,0);setP(scx2+1,scy2,0,0,0);
          setP(scx2,scy2,0,0,0);setP(scx2,scy2-1,0,0,0);
        } else { // Spade
          setP(scx2,scy2+1,0,0,0);setP(scx2-1,scy2,0,0,0);setP(scx2+1,scy2,0,0,0);
          setP(scx2,scy2,0,0,0);setP(scx2,scy2-1,0,0,0);setP(scx2,scy2+2,0,0,0);
        }
      }
    }

    // Red bar above cards
    const redBarY2=cardY2+cardH+2;
    for(let x=0;x<S;x++) setP(x,redBarY2,0.8,0,0);
    for(let tx2=3;tx2<S-3;tx2+=2) setP(tx2,redBarY2,0.9,0.3,0.5);

    // Green HUD at bottom
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0,0.7,0);
    hLine(2,10,hudH-2,0,0,0);
    hLine(22,30,hudH-2,0,0,0);
    hLine(44,58,hudH-2,0,0,0);
    // Scores — animate between rounds
    const score1=100+seed*10;
    const score2=110+seed*5;
    hLine(3,9,hudH-4,0,0,0);
    hLine(23,29,hudH-4,0,0,0);
    hLine(2,8,hudH-7,0.6,0,0);
    hLine(12,14,hudH-7,0,0,0);
    hLine(22,30,hudH-7,0.6,0,0);
    // Flashing result after cards flip
    if(handT>flipT+1.5){
      const flash2=Math.floor(p.t*3)%2;
      if(flash2){
        const results=['PAIR','FLUSH','HIGH','THREE'];
        hLine(4,S-5,2,1,1,0);
        hLine(4,S-5,1,1,0.8,0);
      }
    }
    // Right side flashing text
    const flash3=Math.floor(p.t*2.5)%2;
    if(flash3){
      hLine(42,58,hudH-5,0.6,0,0.6);
      hLine(44,56,hudH-7,0.6,0,0.6);
      setP(41,hudH-5,0.9,0,0.9);setP(59,hudH-5,0.9,0,0.9);
    }
    hLine(0,S-1,hudH-1,0,0.4,0);
  }
}

function retroDrawTopFace(S,t){
  const topBuf=new Float32Array(S*S*3);
  const cx=S/2, cy=S/2;
  const radius=S*0.38;

  // Background: pulsing radial gradient
  for(let y=0;y<S;y++) for(let x=0;x<S;x++){
    const i=(y*S+x)*3;
    const dx=x-cx, dy=y-cy;
    const dist=Math.sqrt(dx*dx+dy*dy)/cx;
    const pulse=0.02+0.015*Math.sin(t*2-dist*4);
    topBuf[i]=pulse*0.4; topBuf[i+1]=pulse*0.1; topBuf[i+2]=pulse*1.2;
  }

  // Rotating radial beams
  for(let b=0;b<8;b++){
    const beamAngle=t*0.8+b*Math.PI/4;
    for(let r=5;r<S/2;r++){
      const bx=Math.round(cx+Math.cos(beamAngle)*r);
      const by=Math.round(cy+Math.sin(beamAngle)*r);
      if(bx>=0&&bx<S&&by>=0&&by<S){
        const i=(by*S+bx)*3;
        const fade=0.06*(1-r/(S/2));
        topBuf[i]+=fade*0.5; topBuf[i+1]+=fade*0.2; topBuf[i+2]+=fade;
      }
    }
  }

  // Concentric rings (pulsing outward)
  for(let ring=0;ring<4;ring++){
    const rr=((t*12+ring*16)%((S/2)-4))+4;
    const bright=0.08*(1-rr/(S/2));
    for(let a=0;a<120;a++){
      const ang=a*Math.PI*2/120;
      const rx=Math.round(cx+Math.cos(ang)*rr);
      const ry=Math.round(cy+Math.sin(ang)*rr);
      if(rx>=0&&rx<S&&ry>=0&&ry<S){
        const i=(ry*S+rx)*3;
        topBuf[i]+=bright; topBuf[i+1]+=bright*0.5; topBuf[i+2]+=bright*1.5;
      }
    }
  }

  // Sparkle particles orbiting
  for(let sp=0;sp<20;sp++){
    const spAng=t*1.5+sp*0.314;
    const spR=8+sp*1.3+Math.sin(t*3+sp)*3;
    const sx=Math.round(cx+Math.cos(spAng)*spR);
    const sy=Math.round(cy+Math.sin(spAng)*spR);
    if(sx>=0&&sx<S&&sy>=0&&sy<S){
      const i=(sy*S+sx)*3;
      const flicker=0.4+0.4*Math.sin(t*8+sp*2);
      topBuf[i]+=flicker; topBuf[i+1]+=flicker*0.8; topBuf[i+2]+=flicker*0.3;
    }
  }

  // 5x7 bitmap font (scaled 2x)
  const F={R:[0x7C,0x44,0x44,0x78,0x48,0x44,0x42],E:[0x7E,0x40,0x40,0x7C,0x40,0x40,0x7E],T:[0x7E,0x18,0x18,0x18,0x18,0x18,0x18],O:[0x3C,0x42,0x42,0x42,0x42,0x42,0x3C],G:[0x3C,0x42,0x40,0x4E,0x42,0x42,0x3C],A:[0x18,0x24,0x42,0x7E,0x42,0x42,0x42],M:[0x42,0x66,0x5A,0x42,0x42,0x42,0x42],S:[0x3C,0x42,0x40,0x3C,0x02,0x42,0x3C]};
  const word1=[F.R,F.E,F.T,F.R,F.O];
  const word2=[F.S,F.E,F.M,F.A,F.G];
  const scale=1;
  const charW=7*scale, charH=7*scale;
  const arcSpan=2.2;
  const baseAngle=t*0.5;

  // Color cycling
  const hue=(t*80)%360;
  const hr=hue/60; const hi=Math.floor(hr)%6; const hf=hr-Math.floor(hr);
  let cr,cg,cb;
  switch(hi){
    case 0: cr=1;cg=hf;cb=0;break; case 1: cr=1-hf;cg=1;cb=0;break;
    case 2: cr=0;cg=1;cb=hf;break; case 3: cr=0;cg=1-hf;cb=1;break;
    case 4: cr=hf;cg=0;cb=1;break; default: cr=1;cg=0;cb=1-hf;
  }

  function drawArcText(word,bAngle,flipDir){
    const numChars=word.length;
    for(let c=0;c<numChars;c++){
      const glyph=word[c];
      const charAngle=bAngle+(c-(numChars-1)/2)*arcSpan/numChars;
      const charCx=cx+Math.cos(charAngle)*radius;
      const charCy=cy+Math.sin(charAngle)*radius;
      const rot=charAngle+Math.PI/2*flipDir;
      const cosR=Math.cos(rot), sinR=Math.sin(rot);
      for(let row=0;row<7;row++){
        const bits=glyph[row];
        for(let col=0;col<7;col++){
          if(bits&(1<<(6-col))){
            for(let sy=0;sy<scale;sy++) for(let sx=0;sx<scale;sx++){
              const lx=(col*scale+sx)-charW/2, ly=(row*scale+sy)-charH/2;
              const px=Math.round(charCx+lx*cosR-ly*sinR);
              const py=Math.round(charCy+lx*sinR+ly*cosR);
              if(px>=0&&px<S&&py>=0&&py<S){
                const i2=(py*S+px)*3;
                topBuf[i2]=cr; topBuf[i2+1]=cg; topBuf[i2+2]=cb;
              }
            }
          }
        }
      }
    }
  }
  // "RETRO" on one side, "GAMES" on the opposite
  drawArcText(word1,baseAngle,1);
  drawArcText(word2,baseAngle+Math.PI,-1);

  // Outer ring border (bright, pulsing)
  const borderR=S/2-2;
  const borderBright=0.3+0.15*Math.sin(t*3);
  for(let a=0;a<200;a++){
    const ang=a*Math.PI*2/200;
    const bx=Math.round(cx+Math.cos(ang)*borderR);
    const by=Math.round(cy+Math.sin(ang)*borderR);
    if(bx>=0&&bx<S&&by>=0&&by<S){
      const i=(by*S+bx)*3;
      topBuf[i]+=borderBright*cr; topBuf[i+1]+=borderBright*cg; topBuf[i+2]+=borderBright*cb;
    }
  }

  // Write to top face
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx=faceMap[4][v*S+u]; if(idx<0) continue;
    const i=(v*S+u)*3;
    colBuf[idx*3]=Math.min(1,topBuf[i]); colBuf[idx*3+1]=Math.min(1,topBuf[i+1]); colBuf[idx*3+2]=Math.min(1,topBuf[i+2]);
  }
}

function effectRetro(dt){
  if(!retroInit) initRetro();
  if(dt>0.1) dt=0.016;
  retroT+=dt;
  retroSplashT=Math.max(0,retroSplashT-dt);
  const S=SIZE;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const faceBuf=retroFaceBuf;

  const numGames=retroGames.length;
  // Detect game change and trigger splash
  let currentIdx;
  if(retroSelectedGame>=0){
    currentIdx=retroSelectedGame;
  } else {
    const pool=retroAutoGames&&retroAutoGames.length>0?retroAutoGames:Array.from({length:numGames},(_,i)=>i);
    currentIdx=pool[Math.floor(retroT/retroRotateInterval)%pool.length];
  }
  if(currentIdx!==retroLastGameIdx){
    retroLastGameIdx=currentIdx;
    retroSplashT=2.0;
  }

  if(panel2dMode){
    // 2D: show selected game or auto-rotate
    const gameIdx=currentIdx;
    faceBuf.fill(0);
    retroDrawFace(gameIdx,dt,faceBuf,S);
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const i=(v*S+u)*3;
      const idx=faceMap[0][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=faceBuf[i]; colBuf[idx*3+1]=faceBuf[i+1]; colBuf[idx*3+2]=faceBuf[i+2];
    }
  } else {
    // 3D: show selected game on all faces, or rotate different games
    const baseIdx=currentIdx;
    const singleGame=retroSelectedGame>=0;
    faceBuf.fill(0);
    retroDrawFace(baseIdx,dt,faceBuf,S);
    for(let fIdx=0;fIdx<4;fIdx++){
      if(!singleGame&&fIdx>0){
        const pool2=retroAutoGames&&retroAutoGames.length>0?retroAutoGames:Array.from({length:numGames},(_,i)=>i);
        const faceGame=pool2[(pool2.indexOf(baseIdx)+fIdx)%pool2.length];
        faceBuf.fill(0); retroDrawFace(faceGame,dt,faceBuf,S);
      }
      const face=VID_FACE_ORDER[fIdx];
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const pu=S-1-u;
        const i=(v*S+pu)*3;
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        colBuf[idx*3]=faceBuf[i]; colBuf[idx*3+1]=faceBuf[i+1]; colBuf[idx*3+2]=faceBuf[i+2];
      }
    }
    // Top: RETRO text rotating in circle with effects
    retroDrawTopFace(S,retroT);
    // Bottom: dark
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[5][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=0.01; colBuf[idx*3+1]=0.01; colBuf[idx*3+2]=0.03;
    }
  }
}

// ═══════════════════════════════════════════════════
//  VIDEO DISPLAY
//  Maps live video onto the 4 side panels.
//  Sources: local file, screen capture (incl. YouTube
//  tab), or webcam. Simulated in the 3D viewport.
// ═══════════════════════════════════════════════════
let vidEl=null, vidCv=null, vidCtx=null;
let vidStream=null, vidReady=false;
let vidLayout='panorama', vidBright=1, vidSat=1.2, vidTB='dark', vidScrollX=0, vidScrollSpeed=0;

// Face order for panoramic wrap: front→right→back→left (continuous perimeter)
const VID_FACE_ORDER=[0,3,1,2];  // front→left→right→back for seamless panorama

function ensureVidPipeline(){
  if(vidEl) return;
  vidEl=document.getElementById('vid-el');
  vidCv=document.getElementById('vid-cv');
  vidCtx=vidCv.getContext('2d',{willReadFrequently:true});
  vidEl.addEventListener('playing',()=>{ vidReady=true; document.getElementById('vid-status').textContent='▶ Playing'; });
  vidEl.addEventListener('ended', ()=>{ vidReady=false; });
  vidEl.addEventListener('error', ()=>{ vidReady=false; document.getElementById('vid-status').textContent='Error loading source'; });
}

async function startVidSource(src){
  ensureVidPipeline();
  if(vidStream){ vidStream.getTracks().forEach(tr=>tr.stop()); vidStream=null; }
  vidEl.srcObject=null; vidEl.src=''; vidReady=false;
  const statusEl=document.getElementById('vid-status');
  try{
    if(src==='screen'){
      statusEl.textContent='Requesting screen…';
      vidStream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});
    } else if(src==='webcam'){
      statusEl.textContent='Requesting webcam…';
      vidStream=await navigator.mediaDevices.getUserMedia({video:{width:256,height:64},audio:false});
    }
    if(vidStream){ vidEl.srcObject=vidStream; await vidEl.play(); }
  }catch(e){ statusEl.textContent='Error: '+e.message.substring(0,40); }
}

function startVidFile(file){
  ensureVidPipeline();
  if(vidStream){ vidStream.getTracks().forEach(tr=>tr.stop()); vidStream=null; }
  vidEl.srcObject=null;
  vidEl.src=URL.createObjectURL(file);
  vidEl.loop=true;
  vidEl.play();
  document.getElementById('vid-status').textContent='Loading: '+file.name.substring(0,28)+'…';
}

function stopVid(){
  if(vidStream){ vidStream.getTracks().forEach(tr=>tr.stop()); vidStream=null; }
  if(vidEl){ vidEl.srcObject=null; vidEl.src=''; vidEl.pause(); }
  vidReady=false;
  stopImg();
  document.getElementById('vid-status').textContent='No source loaded';
}

// ── IMAGE DISPLAY ──
let imgLoaded=false, imgCv=null, imgCtx=null, imgPx=null, imgW=0, imgH=0;

function loadImgFile(file){
  const img=new Image();
  img.onload=()=>{
    if(!imgCv){ imgCv=document.createElement('canvas'); imgCtx=imgCv.getContext('2d',{willReadFrequently:true}); }
    // Stop video first (which also clears image), then set image data
    if(vidStream){ vidStream.getTracks().forEach(tr=>tr.stop()); vidStream=null; }
    if(vidEl){ vidEl.srcObject=null; vidEl.src=''; vidEl.pause(); }
    vidReady=false;
    imgW=img.width; imgH=img.height;
    imgCv.width=imgW; imgCv.height=imgH;
    imgCtx.drawImage(img,0,0);
    imgPx=imgCtx.getImageData(0,0,imgW,imgH).data;
    imgLoaded=true;
    document.getElementById('vid-status').textContent='🖼 '+file.name.substring(0,28);
  };
  img.src=URL.createObjectURL(file);
}

function stopImg(){ imgLoaded=false; imgPx=null; }

function renderImg(){
  if(!imgLoaded||!imgPx) return;
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  const S=SIZE;

  if(panel2dMode){
    // 2D: fit image to face 0
    for(let v=0;v<S;v++){
      for(let u=0;u<S;u++){
        const sx=((u/S)*imgW)|0, sy=(((S-1-v)/S)*imgH)|0;
        const pi=(Math.min(sy,imgH-1)*imgW+Math.min(sx,imgW-1))*4;
        const idx=faceMap[0][v*S+u]; if(idx<0) continue;
        colBuf[idx*3]=imgPx[pi]/255;
        colBuf[idx*3+1]=imgPx[pi+1]/255;
        colBuf[idx*3+2]=imgPx[pi+2]/255;
      }
    }
  } else {
    // 3D: map image across 4 side faces using vidLayout mode
    let cw,ch,px;
    if(vidLayout==='panorama'||vidLayout==='perspective'){
      cw=4*S; ch=S;
    } else if(vidLayout==='mirror'){
      cw=2*S; ch=2*S;
    } else { cw=S; ch=S; }
    if(!imgCv){ imgCv=document.createElement('canvas'); imgCtx=imgCv.getContext('2d',{willReadFrequently:true}); }
    if(imgCv.width!==cw||imgCv.height!==ch){ imgCv.width=cw; imgCv.height=ch; }
    const srcImg=new ImageData(new Uint8ClampedArray(imgPx.buffer.slice(0,imgW*imgH*4)),imgW,imgH);
    const tmpCv=document.createElement('canvas'); tmpCv.width=imgW; tmpCv.height=imgH;
    const tmpCtx=tmpCv.getContext('2d'); tmpCtx.putImageData(srcImg,0,0);
    if(vidLayout==='mirror'){
      imgCtx.save();
      imgCtx.drawImage(tmpCv,0,0,S,S);
      imgCtx.save(); imgCtx.translate(2*S,0); imgCtx.scale(-1,1); imgCtx.drawImage(tmpCv,0,0,S,S); imgCtx.restore();
      imgCtx.save(); imgCtx.translate(0,2*S); imgCtx.scale(1,-1); imgCtx.drawImage(tmpCv,0,0,S,S); imgCtx.restore();
      imgCtx.save(); imgCtx.translate(2*S,2*S); imgCtx.scale(-1,-1); imgCtx.drawImage(tmpCv,0,0,S,S); imgCtx.restore();
      imgCtx.restore();
    } else if(vidLayout==='tile'){
      const hw=S>>1;
      imgCtx.drawImage(tmpCv,0,0,hw,hw);
      imgCtx.drawImage(tmpCv,hw,0,hw,hw);
      imgCtx.drawImage(tmpCv,0,hw,hw,hw);
      imgCtx.drawImage(tmpCv,hw,hw,hw,hw);
    } else {
      imgCtx.drawImage(tmpCv,0,0,cw,ch);
    }
    px=imgCtx.getImageData(0,0,cw,ch).data;

    for(let fIdx=0;fIdx<4;fIdx++){
      const face=VID_FACE_ORDER[fIdx];
      const flipU=(face===0||face===1||face===2||face===3);
      for(let v=0;v<S;v++){
        for(let u=0;u<S;u++){
          let srcX,srcY;
          if(vidLayout==='panorama'||vidLayout==='perspective'){
            const pu=flipU?(S-1-u):u;
            srcX=((fIdx*S+pu+(vidScrollX|0))%(4*S)+4*S)%(4*S);
            srcY=S-1-v;
          } else {
            srcX=u; srcY=S-1-v;
          }
          srcX=Math.max(0,Math.min(cw-1,srcX));
          srcY=Math.max(0,Math.min(ch-1,srcY));
          const pi=(srcY*cw+srcX)*4;
          setFaceLED(face,u,v,px[pi]/255,px[pi+1]/255,px[pi+2]/255);
        }
      }
    }
    // Top/bottom: average color
    let ar=0,ag=0,ab=0;
    const sampleN=64;
    for(let i=0;i<sampleN;i++){
      const si=((i/sampleN)*imgPx.length/4)|0;
      ar+=imgPx[si*4]; ag+=imgPx[si*4+1]; ab+=imgPx[si*4+2];
    }
    ar/=sampleN*255; ag/=sampleN*255; ab/=sampleN*255;
    const dim=0.15;
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const i4=faceMap[4][v*S+u]; if(i4>=0){ colBuf[i4*3]=ar*dim; colBuf[i4*3+1]=ag*dim; colBuf[i4*3+2]=ab*dim; }
      const i5=faceMap[5][v*S+u]; if(i5>=0){ colBuf[i5*3]=ar*dim; colBuf[i5*3+1]=ag*dim; colBuf[i5*3+2]=ab*dim; }
    }
  }
}

function effectVideo(dt){
  t+=dt;
  // Show loaded image if no video playing
  if(!vidReady||!vidEl||vidEl.readyState<2){
    if(imgLoaded){ renderImg(); return; }
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    const pulse=0.5+0.5*Math.sin(t*1.8);
    for(let f=0;f<4;f++){
      for(let u=0;u<SIZE;u++) setFaceLED(f,u,SIZE>>1,pulse*0.2,pulse*0.05,pulse*0.22);
      setFaceLED(f,SIZE>>1,(SIZE>>1)-1,0,pulse*0.3,pulse*0.35);
      setFaceLED(f,SIZE>>1,(SIZE>>1)+1,0,pulse*0.3,pulse*0.35);
    }
    return;
  }

  const S=SIZE;
  // Advance panorama scroll
  if(vidScrollSpeed!==0) vidScrollX=(vidScrollX+dt*vidScrollSpeed*S*0.8+4*S)%(4*S);

  // Prepare canvas to match layout
  let cw, ch;
  if(vidLayout==='panorama'){ cw=4*S; ch=S; }
  else if(vidLayout==='mirror'){ cw=2*S; ch=2*S; }
  else { cw=S; ch=S; }
  if(vidCv.width!==cw||vidCv.height!==ch){ vidCv.width=cw; vidCv.height=ch; }

  vidCtx.filter=`brightness(${vidBright}) saturate(${vidSat})`;

  if(vidLayout==='panorama'){
    vidCtx.drawImage(vidEl,0,0,cw,ch);
  } else if(vidLayout==='mirror'){
    // Mirror ×4: draw source 4 times with flips
    vidCtx.save();
    vidCtx.drawImage(vidEl,0,0,S,S);           // top-left: normal
    vidCtx.scale(-1,1); vidCtx.drawImage(vidEl,0,0,S,S); vidCtx.restore(); // top-right: flipped
    vidCtx.save();
    vidCtx.scale(1,-1); vidCtx.drawImage(vidEl,0,0,S,S); vidCtx.restore(); // bottom-left: flipped
    vidCtx.save();
    vidCtx.scale(-1,-1); vidCtx.drawImage(vidEl,0,0,S,S); // bottom-right: flipped both
    vidCtx.restore();
  } else if(vidLayout==='tile'){
    const hw=S>>1;
    vidCtx.drawImage(vidEl,0,0,hw,hw);
    vidCtx.drawImage(vidEl,hw,0,hw,hw);
    vidCtx.drawImage(vidEl,0,hw,hw,hw);
    vidCtx.drawImage(vidEl,hw,hw,hw,hw);
  }
  vidCtx.filter='none';

  const px=vidCtx.getImageData(0,0,cw,ch).data;

  for(let fIdx=0;fIdx<4;fIdx++){
    const face=VID_FACE_ORDER[fIdx];
    const flipU=(face===0||face===1||face===2||face===3);
    for(let v=0;v<S;v++){
      for(let u=0;u<S;u++){
        let srcX,srcY;
        if(vidLayout==='panorama'){
          const pu=flipU?(S-1-u):u;
          srcX=((fIdx*S+pu+(vidScrollX|0))%(4*S)+4*S)%(4*S);
          srcY=S-1-v;
        } else {
          srcX=u; srcY=S-1-v;
        }
        srcX=Math.max(0,Math.min(cw-1,srcX));
        srcY=Math.max(0,Math.min(ch-1,srcY));
        const pi=(srcY*cw+srcX)*4;
        setFaceLED(face,u,v,px[pi]/255,px[pi+1]/255,px[pi+2]/255);
      }
    }
  }

  // Top/Bottom treatment
  if(vidTB==='blur'){
    let ar=0,ag=0,ab=0,cnt=0;
    for(let i=0;i<px.length;i+=px.length/64){
      const ii=(i|0)*4; if(ii+3>=px.length) break;
      ar+=px[ii]; ag+=px[ii+1]; ab+=px[ii+2]; cnt++;
    }
    ar/=cnt; ag/=cnt; ab/=cnt;
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      setFaceLED(4,u,v,ar/255*0.55,ag/255*0.55,ab/255*0.55);
      setFaceLED(5,u,v,ar/255*0.35,ag/255*0.35,ab/255*0.35);
    }
  } else if(vidTB==='spectrum'){
    if(micOn&&auAnalyser) readMicSpectrum(dt); else genSimSpectrum(dt);
    drawPolarFace(4); drawPolarFace(5);
  } else if(vidTB==='perspective'){
    // Sample the top row of each side panel and spread colour inward from each edge
    const topBuf=new Float32Array(S*S*3);
    const topW =new Float32Array(S*S);

    // VID_FACE_ORDER = [front(0), left(3), right(2), back(1)] = fIdx 0,1,2,3
    // front → fans inward from v=0 (bottom edge of top panel)
    // back  → fans inward from v=S-1 (top edge)
    // left  → fans inward from u=0 (left edge)
    // right → fans inward from u=S-1 (right edge)
    const faceEdge=[
      {fIdx:0, axis:'v', fromEdge:0     },  // front  → bottom
      {fIdx:3, axis:'v', fromEdge:S-1   },  // back   → top
      {fIdx:1, axis:'u', fromEdge:0     },  // left   → left
      {fIdx:2, axis:'u', fromEdge:S-1   },  // right  → right
    ];

    for(const {fIdx, axis, fromEdge} of faceEdge){
      // Sample just the top row of this face from the video
      for(let col=0;col<S;col++){
        const srcX=((fIdx*S+col)%(4*S)+4*S)%(4*S);
        const srcY=0; // top row of panel
        const pi=(srcY*cw+Math.max(0,Math.min(cw-1,srcX)))*4;
        const r=px[pi]/255, g=px[pi+1]/255, b=px[pi+2]/255;

        // Spread this colour inward as a gradient
        for(let depth=0;depth<S;depth++){
          const w=Math.pow(1-depth/S,2.2)*0.95;
          if(w<0.005) break;
          let tu,tv;
          if(axis==='v'){
            tu=col;
            tv=fromEdge===0 ? depth : S-1-depth;
          } else {
            tu=fromEdge===0 ? depth : S-1-depth;
            tv=col;
          }
          if(tu<0||tu>=S||tv<0||tv>=S) continue;
          const ti=tv*S+tu;
          topBuf[ti*3  ]+=r*w;
          topBuf[ti*3+1]+=g*w;
          topBuf[ti*3+2]+=b*w;
          topW[ti]+=w;
        }
      }
    }

    // Paint blended, darken toward centre
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const ti=v*S+u;
      if(topW[ti]<0.01) continue;
      const edgeDist=Math.min(u,v,S-1-u,S-1-v)/(S*0.5);
      const fade=Math.max(0.12,1-edgeDist*0.65);
      setFaceLED(4,u,v,
        Math.min(1,topBuf[ti*3  ]/topW[ti]*fade),
        Math.min(1,topBuf[ti*3+1]/topW[ti]*fade),
        Math.min(1,topBuf[ti*3+2]/topW[ti]*fade));
    }
  } // 'dark' → leave zeroed
}

// ── RANDOM CHAOS ──
// Fully self-contained generative visuals — never repeats, always different
let rndT=0, rndSegT=0, rndSegDur=4, rndSeed=Math.random()*9999, rndNextChange=0;
let rndA={}, rndB={}, rndBlend=0;

function rndNewSeg(){
  rndA=rndB;
  rndB=rndGenParams();
  rndBlend=0;
  rndSegDur=3+Math.random()*9;
  rndSegT=0;
}

function rndGenParams(){
  const modes=['plasma','radial','sweep','blobs','spiral','grid','lightning','interference','shatter','kaleid'];
  const palette=Math.random();
  return {
    mode: modes[Math.floor(Math.random()*modes.length)],
    speed: 0.4+Math.random()*3.5,
    freq1: 0.15+Math.random()*0.6,
    freq2: 0.1+Math.random()*0.5,
    phase: Math.random()*Math.PI*2,
    hueBase: Math.random(),
    hueRange: 0.15+Math.random()*0.7,
    sat: 0.6+Math.random()*0.4,
    bright: 0.5+Math.random()*0.5,
    invert: Math.random()>0.5,
    nBlobs: 3+Math.floor(Math.random()*6),
    nBars: 2+Math.floor(Math.random()*8),
    palette: palette,
    twist: (Math.random()-0.5)*4,
    decay: 0.7+Math.random()*0.25,
    seed: Math.random()*999,
  };
}

function rndEval(p, f, u, v, t2){
  const cx=u/SIZE-0.5, cy=v/SIZE-0.5;
  const rad=Math.sqrt(cx*cx+cy*cy);
  const ang=Math.atan2(cy,cx);
  const S=p.size||SIZE;

  if(p.mode==='plasma'){
    const s1=Math.sin(cx*p.freq1*20+t2*p.speed+p.phase);
    const s2=Math.sin(cy*p.freq2*20+t2*p.speed*0.7);
    const s3=Math.sin((cx+cy)*p.freq1*15+t2*p.speed*1.3+p.seed);
    const s4=Math.sin(rad*p.freq2*25-t2*p.speed*0.9);
    return (s1+s2+s3+s4)*0.25+0.5;
  } else if(p.mode==='radial'){
    const rings=Math.sin(rad*p.freq1*40-t2*p.speed*2+p.phase);
    const spokes=Math.sin(ang*Math.ceil(p.nBars)+t2*p.speed+p.seed);
    return (rings*0.5+spokes*0.5)*0.5+0.5;
  } else if(p.mode==='sweep'){
    const bar=((cx*Math.cos(t2*p.twist)+cy*Math.sin(t2*p.twist)+t2*p.speed*0.5+5)%1);
    return Math.pow(Math.abs(Math.sin(bar*Math.PI*p.nBars)),1.5);
  } else if(p.mode==='blobs'){
    let val=0;
    for(let b=0;b<p.nBlobs;b++){
      const bx=Math.sin(t2*p.speed*(0.3+b*0.17)+b*2.1+p.phase)*0.4;
      const by=Math.cos(t2*p.speed*(0.25+b*0.13)+b*1.7+p.seed)*0.4;
      const d=Math.sqrt((cx-bx)**2+(cy-by)**2);
      val+=Math.max(0,1-d/0.25);
    }
    return Math.min(1,val);
  } else if(p.mode==='spiral'){
    const spiralV=((ang/(Math.PI*2)+rad*p.freq1*8+t2*p.speed+5)%1);
    return Math.pow(Math.abs(Math.sin(spiralV*Math.PI*3)),0.8);
  } else if(p.mode==='grid'){
    const gx=Math.abs(Math.sin(cx*p.freq1*30+t2*p.speed*0.5));
    const gy=Math.abs(Math.sin(cy*p.freq2*30+t2*p.speed*0.5+p.phase));
    return Math.max(gx,gy)>0.85?1:0;
  } else if(p.mode==='lightning'){
    let val=0;
    for(let b=0;b<4;b++){
      const lx=cx-Math.sin(t2*p.speed*0.4+b*1.5+p.seed)*0.3;
      const d=Math.abs(lx)+Math.abs(cy*0.1)*b*0.3;
      val+=Math.max(0,1-d*p.freq1*20)*Math.pow(Math.random(),0.1);
    }
    return Math.min(1,val*0.6);
  } else if(p.mode==='interference'){
    const w1=Math.sin(cx*p.freq1*25+t2*p.speed+p.phase);
    const w2=Math.sin(cy*p.freq2*25-t2*p.speed*1.1+p.seed);
    const w3=Math.sin(rad*p.freq1*30-t2*p.speed*0.8);
    return (w1*w2+w3)*0.5+0.5;
  } else if(p.mode==='shatter'){
    const cell=Math.floor(cx*p.nBlobs*2+p.seed)^Math.floor(cy*p.nBlobs*2);
    const phase2=(cell*0.618+t2*p.speed*0.3)%1;
    return Math.abs(Math.sin(phase2*Math.PI+p.phase));
  } else { // kaleid
    const sym=Math.ceil(p.nBars*0.5+2);
    const a2=((ang/(Math.PI/sym))%2);
    const a3=a2>1?2-a2:a2;
    const k=Math.sin(a3*Math.PI*p.freq1*5+rad*p.freq2*20-t2*p.speed+p.phase);
    return k*0.5+0.5;
  }
}

function rndRender(p, tOff, bright){
  for(let face=0;face<6;face++){
    const faceHueShift=face*0.07;
    for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
      const val=rndEval(p,face,u,v,tOff);
      const inv=p.invert?1-val:val;
      const h=(p.hueBase+faceHueShift+inv*p.hueRange)%1;
      const l=inv*p.bright*bright;
      if(l<0.02) continue;
      const [r,g,b]=hsl(h,p.sat,l);
      const idx=faceMap[face][v*SIZE+u];
      if(idx>=0){
        colBuf[idx*3]  =Math.max(colBuf[idx*3],  r);
        colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
        colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
      }
    }
  }
}

function effectRandom(dt){
  t+=dt;
  rndT+=dt;
  rndSegT+=dt;
  if(rndSegT>=rndSegDur||!rndB.mode) rndNewSeg();
  rndBlend=Math.min(1,rndSegT/1.2); // 1.2s crossfade

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  if(rndA.mode) rndRender(rndA, rndT, 1-rndBlend);
  if(rndB.mode) rndRender(rndB, rndT, rndBlend>0?rndBlend:1);
}


// ── GHOST FACE ──
// Pre-renders a realistic face onto a canvas, samples it per-frame onto face LEDs
let ghostT=0, ghostFace=0, ghostState='hidden', ghostStateT=0, ghostNextFace=1;
let ghostReveal=0, ghostAlpha=0;  // ghostReveal: 0=hidden 1=fully revealed
let ghostBlinkT=0, ghostEyeOpen=1;
let ghostDriftX=0, ghostDriftY=0, ghostPosX=0, ghostPosY=0;
let ghostMouthOpen=0.7, ghostMouthT=0;
let ghostHasHorns=false;

function ghostRenderCanvas(eyeOpen, mouthOpen, hasHorns){
  const R=256;
  if(!ghostCanvas){
    ghostCanvas=document.createElement('canvas');
    ghostCanvas.width=R; ghostCanvas.height=R;
    ghostCtx=ghostCanvas.getContext('2d');
  }
  const ctx=ghostCtx;
  ctx.clearRect(0,0,R,R);

  const cx=R/2, cy=R*0.52;
  const fw=R*0.34, fh=R*0.44;

  // Personality vars with defaults
  const eRX=fw*(ghostEyeRX||0.20);
  const eRY=fh*(ghostEyeRY||0.15);
  const eSpread=fw*(ghostEyeSpread||0.44);
  const cheekD=ghostCheekDepth||0.48;

  // Base hue: green (120°) with per-appearance shift
  // ghostHueShift ranges -0.15 to +0.15 for subtle variety
  const baseH=(0.33+(ghostHueShift||0)*0.15+1)%1;
  function ghostCol(lightness, alpha){
    const [r,g,b]=hsl(baseH,0.85,lightness);
    return `rgba(${(r*255)|0},${(g*255)|0},${(b*255)|0},${alpha})`;
  }
  function ghostColDark(lightness, alpha){
    const [r,g,b]=hsl((baseH+0.5)%1,0.5,lightness);
    return `rgba(${(r*255)|0},${(g*255)|0},${(b*255)|0},${alpha})`;
  }

  // ── Clip to oval ──
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, fw*1.3, fh*1.2, 0, 0, Math.PI*2);
  ctx.clip();

  // ── Skin — realistic face gradient ──
  const skinGrad=ctx.createRadialGradient(cx,cy-fh*0.1,fw*0.05,cx,cy,fw*1.3);
  skinGrad.addColorStop(0,  ghostCol(0.72, 0.97));
  skinGrad.addColorStop(0.4,ghostCol(0.50, 0.90));
  skinGrad.addColorStop(0.75,ghostCol(0.28, 0.75));
  skinGrad.addColorStop(1,  ghostCol(0.10, 0));
  ctx.fillStyle=skinGrad;
  ctx.fillRect(cx-fw*1.4,cy-fh*1.3,fw*2.8,fh*2.7);

  // Subtle face contouring — shadow under brow
  const browGrad=ctx.createLinearGradient(cx,cy-fh*0.7,cx,cy-fh*0.1);
  browGrad.addColorStop(0,'rgba(0,0,0,0.38)');
  browGrad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=browGrad; ctx.fillRect(cx-fw*1.3,cy-fh*1.3,fw*2.6,fh*1.2);

  // ── Brows — angled for expression ──
  const browY=cy-fh*0.38;
  const browA=ghostBrowAngle||0;
  ctx.strokeStyle=ghostCol(0.08,0.85);
  ctx.lineWidth=fw*0.065;
  ctx.lineCap='round';
  [[cx-eSpread,browY+browA*fh],[cx+eSpread,browY-browA*fh]].forEach(([bx,by],bi)=>{
    const dir=bi===0?-1:1;
    ctx.beginPath();
    ctx.moveTo(bx-fw*0.22,by+browA*fh*dir*0.3);
    ctx.quadraticCurveTo(bx,by,bx+fw*0.22,by-browA*fh*dir*0.3);
    ctx.stroke();
  });

  // ── Eyes ──
  const eyeY=cy-fh*0.14;
  [[cx-eSpread,eyeY],[cx+eSpread,eyeY]].forEach(([ex,ey])=>{
    // Deep eye socket
    const sockGrad=ctx.createRadialGradient(ex,ey,0,ex,ey,eRX*1.5);
    sockGrad.addColorStop(0,'rgba(0,0,0,0.95)');
    sockGrad.addColorStop(0.6,'rgba(0,8,3,0.65)');
    sockGrad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.save(); ctx.scale(1,eRY/eRX);
    ctx.beginPath(); ctx.arc(ex,ey*(eRX/eRY),eRX*1.5,0,Math.PI*2);
    ctx.fillStyle=sockGrad; ctx.fill(); ctx.restore();

    if(eyeOpen>0.5){
      // Iris
      const irisGrad=ctx.createRadialGradient(ex,ey,0,ex,ey,eRX*0.56);
      irisGrad.addColorStop(0,'rgba(255,255,220,0.98)');
      irisGrad.addColorStop(0.25,ghostCol(0.65,0.95));
      irisGrad.addColorStop(0.75,ghostCol(0.35,0.80));
      irisGrad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.save(); ctx.scale(1,eRY/eRX);
      ctx.beginPath(); ctx.arc(ex,ey*(eRX/eRY),eRX*0.56,0,Math.PI*2);
      ctx.fillStyle=irisGrad; ctx.fill(); ctx.restore();
      // Pupil
      ctx.save(); ctx.scale(1,eRY/eRX);
      ctx.beginPath(); ctx.arc(ex,ey*(eRX/eRY),eRX*0.24,0,Math.PI*2);
      ctx.fillStyle='rgba(0,0,0,0.97)'; ctx.fill(); ctx.restore();
      // Glint
      ctx.beginPath(); ctx.arc(ex-eRX*0.20,ey-eRY*0.25,eRX*0.09,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex+eRX*0.15,ey+eRY*0.1,eRX*0.05,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fill();
    } else {
      // Closed lid — realistic crease
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex-eRX*1.2,ey);
      ctx.quadraticCurveTo(ex,ey+eRY*0.7,ex+eRX*1.2,ey);
      ctx.strokeStyle=ghostCol(0.06,0.9); ctx.lineWidth=eRY*0.6; ctx.stroke();
      ctx.restore();
    }
  });

  // ── Nose ──
  const noseY=cy+fh*0.12;
  // Nose bridge shadow
  ctx.save();
  const noseGrad=ctx.createRadialGradient(cx,noseY,0,cx,noseY,fw*0.18);
  noseGrad.addColorStop(0,'rgba(0,0,0,0.72)'); noseGrad.addColorStop(1,'rgba(0,0,0,0)');
  ctx.scale(0.6,1); ctx.beginPath(); ctx.arc(cx/0.6,noseY,fw*0.18,0,Math.PI*2);
  ctx.fillStyle=noseGrad; ctx.fill(); ctx.restore();
  // Nostrils
  [[cx-fw*0.11,noseY+fh*0.05],[cx+fw*0.11,noseY+fh*0.05]].forEach(([nx,ny])=>{
    ctx.beginPath(); ctx.ellipse(nx,ny,fw*0.07,fh*0.055,0,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.80)'; ctx.fill();
  });

  // ── Mouth ──
  const mouthY=cy+fh*0.40;
  const mouthW=fw*0.56, mouthH=fh*0.23*Math.max(0.1,mouthOpen);
  // Lips outline
  ctx.beginPath(); ctx.ellipse(cx,mouthY,mouthW*1.08,Math.max(3,mouthH*1.15),0,0,Math.PI*2);
  ctx.fillStyle=ghostCol(0.18,0.9); ctx.fill();
  // Mouth opening
  ctx.beginPath(); ctx.ellipse(cx,mouthY,mouthW,Math.max(2,mouthH),0,0,Math.PI*2);
  ctx.fillStyle='rgba(0,0,0,0.97)'; ctx.fill();

  if(mouthOpen>0.2){
    const tw=mouthW*0.36, th=mouthH*0.55;
    // Upper teeth
    for(let i=0;i<5;i++){
      const tx=cx-mouthW*0.72+mouthW*0.36*i+mouthW*0.18;
      ctx.beginPath(); ctx.rect(tx-tw*0.38,mouthY-mouthH*0.88,tw*0.7,th);
      ctx.fillStyle=ghostCol(0.88,0.85); ctx.fill();
    }
    // Lower teeth
    for(let i=0;i<4;i++){
      const tx=cx-mouthW*0.54+mouthW*0.36*i+mouthW*0.09;
      ctx.beginPath(); ctx.rect(tx-tw*0.3,mouthY+mouthH*0.08,tw*0.56,th*0.7);
      ctx.fillStyle=ghostCol(0.75,0.72); ctx.fill();
    }
  }

  // ── Cheek hollows ──
  [[cx-fw*0.70,cy+fh*0.10],[cx+fw*0.70,cy+fh*0.10]].forEach(([hx,hy])=>{
    const hGrad=ctx.createRadialGradient(hx,hy,0,hx,hy,fw*0.30);
    hGrad.addColorStop(0,`rgba(0,0,0,${Math.min(0.75,cheekD)})`);
    hGrad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=hGrad; ctx.beginPath(); ctx.arc(hx,hy,fw*0.30,0,Math.PI*2); ctx.fill();
  });

  // ── Subtle skin texture — pores/roughness ──
  ctx.globalAlpha=0.06;
  for(let i=0;i<60;i++){
    const px=cx+(Math.random()-0.5)*fw*2.2;
    const py=cy+(Math.random()-0.5)*fh*2.0;
    ctx.beginPath(); ctx.arc(px,py,0.8+Math.random()*1.5,0,Math.PI*2);
    ctx.fillStyle=Math.random()<0.5?'rgba(0,0,0,1)':'rgba(255,255,255,1)';
    ctx.fill();
  }
  ctx.globalAlpha=1;

  ctx.restore(); // end face clip

  // ── Edge vignette ──
  ctx.save();
  const outerClip=ctx.createRadialGradient(cx,cy,fw*0.65,cx,cy,fw*1.55);
  outerClip.addColorStop(0,'rgba(0,0,0,0)');
  outerClip.addColorStop(0.8,'rgba(0,0,0,0)');
  outerClip.addColorStop(1,'rgba(0,0,0,1)');
  ctx.globalCompositeOperation='destination-out';
  ctx.fillStyle=outerClip; ctx.fillRect(0,0,R,R);
  ctx.restore();

  const raw=ctx.getImageData(0,0,R,R).data;
  const buf=new Uint8ClampedArray(raw);
  if(eyeOpen>0.5){ ghostPixelsOpen=buf; }
  else            { ghostPixelsClosed=buf; }
  ghostPixels=buf;
}

let ghostDistCache=null;
let ghostCanvasU=null;
let ghostCanvasV=null;
let ghostCacheSize=0;
let ghostPixelsOpen=null;
let ghostPixelsClosed=null;
let ghostCanvas=null;
let ghostCtx=null;
let ghostPixels=null;
let ghostEyeRX=0.20, ghostEyeRY=0.15, ghostEyeSpread=0.44;
let ghostCheekDepth=0.48, ghostBrowAngle=0;

function buildGhostCache(cx,cy){
  const S=SIZE;
  if(ghostCacheSize===S&&ghostDistCache) return;
  ghostCacheSize=S;
  const R=256;
  const ledScale=S*0.72;
  ghostDistCache=new Float32Array(S*S);
  ghostCanvasU=new Int16Array(S*S);
  ghostCanvasV=new Int16Array(S*S);
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const du=u-cx, dv=v-cy;
    ghostDistCache[v*S+u]=Math.sqrt(du*du+dv*dv);
    ghostCanvasU[v*S+u]=Math.round(((u-cx)/ledScale+0.5)*R);
    ghostCanvasV[v*S+u]=Math.round(((cy-v)/ledScale+0.5)*R);
  }
}

function ghostPaintFace(face, cx, cy, revealFrac, alpha, hueShift){
  if(alpha<0.01) return;
  const R=256;
  // Use pre-cached open/closed buffers — only re-render if not yet cached
  if(ghostEyeOpen>0.5){
    if(!ghostPixelsOpen) ghostRenderCanvas(1, ghostMouthOpen, false);
    ghostPixels=ghostPixelsOpen;
  } else {
    if(!ghostPixelsClosed) ghostRenderCanvas(0, ghostMouthOpen, false);
    ghostPixels=ghostPixelsClosed;
  }
  if(!ghostPixels) return;

  buildGhostCache(cx,cy);

  const S=SIZE;
  const maxRadius=S*0.78;
  const revealRadius=revealFrac*maxRadius;
  const edgeBand=maxRadius*0.15;

  const hCos=Math.cos(hueShift||0);
  const hSin=Math.sin(hueShift||0);

  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const pi2=v*S+u;
    const dist=ghostDistCache[pi2];
    if(dist>revealRadius) continue;

    const ci=ghostCanvasU[pi2], cv=ghostCanvasV[pi2];
    if(ci<0||ci>=R||cv<0||cv>=R) continue;
    const pi=(cv*R+ci)*4;
    const pa=ghostPixels[pi+3]/255;
    if(pa<0.02) continue;

    const edgeFade=dist>revealRadius-edgeBand?(revealRadius-dist)/edgeBand:1;
    const brightness=pa*alpha*edgeFade;

    const rr=ghostPixels[pi  ]/255*brightness;
    const gg=ghostPixels[pi+1]/255*brightness;
    const bb=ghostPixels[pi+2]/255*brightness;

    const cr=rr*hCos-gg*hSin*0.3;
    const cg=gg+rr*hSin*0.15;

    const idx=faceMap[face][v*S+u];
    if(idx>=0){
      colBuf[idx*3  ]=Math.max(colBuf[idx*3  ],Math.max(0,cr)*0.5);
      colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],cg);
      colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],bb*0.4);
    }
  }
}

let ghostHueShift=0;

function effectGhost(dt){
  ghostT+=dt; ghostStateT+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.86;

  // Blink logic — swap pre-cached buffers, never re-render mid-frame
  if(ghostState==='present'){
    ghostBlinkT+=dt;
    if(ghostBlinkT>2.5+Math.random()*4 && ghostEyeOpen===1){
      ghostEyeOpen=0; ghostBlinkT=0;
      if(!ghostPixelsClosed) ghostRenderCanvas(0, ghostMouthOpen, false);
    } else if(ghostBlinkT>0.12 && ghostEyeOpen===0){
      ghostEyeOpen=1; ghostBlinkT=0;
      if(!ghostPixelsOpen) ghostRenderCanvas(1, ghostMouthOpen, false);
    }
    ghostMouthT+=dt;
    if(ghostMouthT>1.5+Math.random()*2.5){
      ghostMouthOpen=0.4+Math.random()*0.6; ghostMouthT=0;
      ghostPixelsOpen=null; ghostPixelsClosed=null; // re-render both with new mouth
    }
  }

  if(ghostState==='hidden'){
    if(ghostStateT>1+Math.random()*2){
      ghostState='emerging'; ghostStateT=0; ghostReveal=0;
      ghostFace=ghostNextFace;
      ghostPosX=SIZE*0.5;
      ghostPosY=SIZE*0.5;
      ghostDriftX=0; ghostDriftY=0;
      ghostEyeOpen=1;
      // Random personality each appearance
      ghostMouthOpen=0.3+Math.random()*0.7;
      ghostEyeRX=0.16+Math.random()*0.08;   // eye width variation
      ghostEyeRY=0.10+Math.random()*0.07;   // eye height variation
      ghostEyeSpread=0.38+Math.random()*0.14; // eye spacing
      ghostCheekDepth=0.3+Math.random()*0.5; // sunken/full cheeks
      ghostBrowAngle=(Math.random()-0.5)*0.4; // angry/surprised brows
      ghostPixelsOpen=null; ghostPixelsClosed=null; ghostPixels=null;
      ghostHueShift=(Math.random()-0.5)*1.0; // -0.5 to +0.5, multiplied by 0.15 in renderer = subtle green tints
      ghostHasHorns=false;
    }
  } else if(ghostState==='emerging'){
    // Smooth emerge: nose appears first (centre), face expands outward to edges
    const p=Math.min(1,ghostStateT/2.2);
    ghostReveal=p*p*(3-2*p); // smoothstep
    ghostAlpha=0.6+ghostReveal*0.3;
    if(ghostStateT>2.2){ ghostState='present'; ghostStateT=0; ghostReveal=1; }
  } else if(ghostState==='present'){
    ghostReveal=1;
    ghostAlpha=0.82+0.12*Math.sin(ghostT*1.8);
    if(ghostStateT>3+Math.random()*3){ ghostState='retreating'; ghostStateT=0; }
  } else if(ghostState==='retreating'){
    // Retreat: edges disappear first, shrinks back to centre (nose last)
    const p=Math.min(1,ghostStateT/2.0);
    ghostReveal=1-(p*p*(3-2*p));
    ghostAlpha=(1-p)*0.88;
    if(ghostStateT>2.0){
      ghostState='hidden'; ghostStateT=0; ghostReveal=0; ghostAlpha=0;
      ghostPixels=null; ghostPixelsOpen=null; ghostPixelsClosed=null;
      const others=[0,1,2,3].filter(f=>f!==ghostFace);
      ghostNextFace=others[Math.floor(Math.random()*others.length)];
    }
  }

  if(ghostReveal>0.01){
    ghostPaintFace(ghostFace, ghostPosX, ghostPosY, ghostReveal, ghostAlpha, ghostHueShift);

    // Faint aura on neighbouring faces
    if(ghostReveal>0.5){
      for(let f=0;f<6;f++){
        if(f===ghostFace) continue;
        for(let j=0;j<SIZE*SIZE;j++){
          const idx=faceMap[f][j];
          if(idx>=0 && Math.random()<0.002*ghostReveal){
            colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+ghostReveal*0.1*(0.3+Math.random()*0.4));
          }
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════
//  COIN FLIP (Heads & Tails)
// ═══════════════════════════════════════════════════
let coinCanvas=null,coinCtx=null,coinPixels=null;
let coinHeads=0,coinTails=0,coinFlipping=false,coinResult='',coinFlipT=0,coinFlipDur=0;
let coinAngle=0,coinShowResult=0,coinSpeed=1;
let coinFaces=null; // per-face state for 3D mode

function coinReset(){coinHeads=0;coinTails=0;if(coinFaces)coinFaces.forEach(f=>{f.heads=0;f.tails=0;});}

function coinStartFlip(){
  coinFlipping=true; coinFlipT=0;
  coinFlipDur=1.2+Math.random()*0.8;
  coinResult=(Math.random()<0.5)?'H':'T';
}

function coinFaceStartFlip(cf){
  cf.flipping=true; cf.flipT=0;
  cf.flipDur=1.0+Math.random()*1.0;
  cf.result=(Math.random()<0.5)?'H':'T';
}

function coinInitFaces(){
  coinFaces=[];
  for(let i=0;i<4;i++){
    const cf={heads:0,tails:0,flipping:false,result:'',flipT:0,flipDur:0,angle:0,showResult:0};
    coinFaceStartFlip(cf);
    cf.flipT=Math.random()*0.5;
    coinFaces.push(cf);
  }
}

function coinRenderFace(ctx,cf,dt,cs,DT_RES,t){
  ctx.clearRect(0,0,DT_RES,DT_RES);
  ctx.fillStyle='#000'; ctx.fillRect(0,0,DT_RES,DT_RES);
  const headsWinning=cf.heads>=cf.tails;
  for(let sy=0;sy<DT_RES;sy+=32){
    for(let sx=0;sx<DT_RES;sx+=32){
      const shimmer=Math.sin(t*2+sx*0.02+sy*0.03)*0.5+0.5;
      const b=Math.floor(shimmer*65);
      if(headsWinning){
        ctx.fillStyle='rgb('+Math.floor(b*1.1)+','+Math.floor(b*0.85)+','+Math.floor(b*0.3)+')';
      } else {
        ctx.fillStyle='rgb('+Math.floor(b*0.6)+','+Math.floor(b*0.7)+','+Math.floor(b*1.1)+')';
      }
      ctx.fillRect(sx,sy,32,32);
    }
  }
  if(cf.flipping){
    cf.flipT+=dt*cs;
    cf.angle+=dt*cs*12;
    if(cf.flipT>=cf.flipDur){
      cf.flipping=false;
      if(cf.result==='H') cf.heads++; else cf.tails++;
      cf.showResult=2.0;
      cf.angle=0;
    }
  } else {
    cf.showResult-=dt*cs;
    if(cf.showResult<=0) coinFaceStartFlip(cf);
  }
  const cx=DT_RES/2, cy=DT_RES*0.38, R=DT_RES*0.30;
  ctx.save();
  const scaleX=cf.flipping?Math.cos(cf.angle):1;
  const absSx=Math.max(0.05,Math.abs(scaleX));
  ctx.fillStyle='rgba(40,30,0,0.4)';
  ctx.beginPath(); ctx.ellipse(cx+8,cy+10,R*absSx,R*0.3,0,0,Math.PI*2); ctx.fill();
  if(cf.flipping&&absSx<0.7){
    ctx.fillStyle='#665511';
    ctx.fillRect(cx-R*absSx,cy-4,R*absSx*2,8);
  }
  ctx.beginPath(); ctx.ellipse(cx,cy,R*absSx,R,0,0,Math.PI*2);
  if(cf.flipping){
    const grad=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,0,cx,cy,R);
    grad.addColorStop(0,'#ddaa33'); grad.addColorStop(1,'#886611');
    ctx.fillStyle=grad; ctx.fill();
    ctx.strokeStyle='#ffdd55'; ctx.lineWidth=12; ctx.stroke();
  } else {
    const isH=(cf.result==='H');
    const grad=ctx.createRadialGradient(cx-R*0.2,cy-R*0.2,0,cx,cy,R);
    if(isH){grad.addColorStop(0,'#eebb33');grad.addColorStop(1,'#886611');}
    else{grad.addColorStop(0,'#7788cc');grad.addColorStop(1,'#334477');}
    ctx.fillStyle=grad; ctx.fill();
    ctx.strokeStyle=isH?'#ffdd55':'#aabbff'; ctx.lineWidth=12; ctx.stroke();
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#fff'; ctx.shadowColor=isH?'#ffcc00':'#6688ff'; ctx.shadowBlur=30;
    ctx.font='bold '+Math.floor(R*1.4)+'px monospace';
    ctx.fillText(isH?'H':'T', cx, cy+6);
    ctx.shadowBlur=0;
  }
  ctx.restore();
  const total=cf.heads+cf.tails;
  const hPct=total?Math.round(cf.heads/total*100):0;
  const tPct=total?Math.round(cf.tails/total*100):0;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 100px monospace';
  ctx.fillStyle='#ffcc44'; ctx.fillText(String(cf.heads), DT_RES*0.28, DT_RES*0.76);
  ctx.fillStyle='#99bbff'; ctx.fillText(String(cf.tails), DT_RES*0.72, DT_RES*0.76);
  ctx.font='bold 80px monospace';
  ctx.fillStyle='#cc9922'; ctx.fillText(hPct+'%', DT_RES*0.28, DT_RES*0.92);
  ctx.fillStyle='#7799dd'; ctx.fillText(tPct+'%', DT_RES*0.72, DT_RES*0.92);
}

function coinRenderTopFace(ctx,DT_RES,t){
  ctx.clearRect(0,0,DT_RES,DT_RES);
  ctx.fillStyle='#000'; ctx.fillRect(0,0,DT_RES,DT_RES);
  let totalH=0,totalT=0;
  for(const cf of coinFaces){totalH+=cf.heads;totalT+=cf.tails;}
  const headsWinning=totalH>=totalT;
  for(let sy=0;sy<DT_RES;sy+=32){
    for(let sx=0;sx<DT_RES;sx+=32){
      const shimmer=Math.sin(t*3+sx*0.03+sy*0.02)*0.5+0.5;
      const b=Math.floor(shimmer*60);
      if(headsWinning){
        ctx.fillStyle='rgb('+Math.floor(b*1.1)+','+Math.floor(b*0.85)+','+Math.floor(b*0.3)+')';
      } else {
        ctx.fillStyle='rgb('+Math.floor(b*0.6)+','+Math.floor(b*0.7)+','+Math.floor(b*1.1)+')';
      }
      ctx.fillRect(sx,sy,32,32);
    }
  }
  // Flip horizontally so text reads correctly on top face
  ctx.save();
  ctx.translate(DT_RES,0);
  ctx.scale(-1,1);
  const total=totalH+totalT;
  const hPct=total?Math.round(totalH/total*100):0;
  const tPct=total?Math.round(totalT/total*100):0;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 70px monospace';
  ctx.fillStyle='#ffffff'; ctx.fillText('TOTAL', DT_RES*0.5, DT_RES*0.12);
  const midY=DT_RES*0.42;
  ctx.beginPath(); ctx.arc(DT_RES*0.28,midY,DT_RES*0.15,0,Math.PI*2);
  const g1=ctx.createRadialGradient(DT_RES*0.24,midY-20,0,DT_RES*0.28,midY,DT_RES*0.15);
  g1.addColorStop(0,'#eebb33');g1.addColorStop(1,'#886611');
  ctx.fillStyle=g1; ctx.fill();
  ctx.strokeStyle='#ffdd55'; ctx.lineWidth=6; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='bold 90px monospace';
  ctx.fillText('H', DT_RES*0.28, midY+8);
  ctx.beginPath(); ctx.arc(DT_RES*0.72,midY,DT_RES*0.15,0,Math.PI*2);
  const g2=ctx.createRadialGradient(DT_RES*0.68,midY-20,0,DT_RES*0.72,midY,DT_RES*0.15);
  g2.addColorStop(0,'#7788cc');g2.addColorStop(1,'#334477');
  ctx.fillStyle=g2; ctx.fill();
  ctx.strokeStyle='#aabbff'; ctx.lineWidth=6; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='bold 90px monospace';
  ctx.fillText('T', DT_RES*0.72, midY+8);
  ctx.font='bold 110px monospace';
  ctx.fillStyle='#ffcc44'; ctx.fillText(String(totalH), DT_RES*0.28, DT_RES*0.70);
  ctx.fillStyle='#99bbff'; ctx.fillText(String(totalT), DT_RES*0.72, DT_RES*0.70);
  ctx.font='bold 80px monospace';
  ctx.fillStyle='#cc9922'; ctx.fillText(hPct+'%', DT_RES*0.28, DT_RES*0.90);
  ctx.fillStyle='#7799dd'; ctx.fillText(tPct+'%', DT_RES*0.72, DT_RES*0.90);
  ctx.restore();
  // Pulsating border in winning color
  const pulse=0.4+0.6*Math.abs(Math.sin(t*3));
  const bw=Math.floor(DT_RES/SIZE);
  if(headsWinning){
    const br=Math.floor(220*pulse), bg=Math.floor(170*pulse), bb=Math.floor(40*pulse);
    ctx.strokeStyle='rgb('+br+','+bg+','+bb+')';
  } else {
    const br=Math.floor(120*pulse), bg2=Math.floor(140*pulse), bb=Math.floor(220*pulse);
    ctx.strokeStyle='rgb('+br+','+bg2+','+bb+')';
  }
  ctx.lineWidth=bw;
  ctx.strokeRect(bw/2,bw/2,DT_RES-bw,DT_RES-bw);
}

function effectCoinFlip(dt){
  t+=dt;
  if(!coinCanvas){
    coinCanvas=document.createElement('canvas');
    coinCanvas.width=DT_RES; coinCanvas.height=DT_RES;
    coinCtx=coinCanvas.getContext('2d');
    coinStartFlip();
  }
  const cs=coinSpeed*speedMult;
  const scale=DT_RES/SIZE;
  const is3D=!(typeof panel2dMode!=='undefined'&&panel2dMode);

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  if(is3D){
    if(!coinFaces) coinInitFaces();
    const ctx=coinCtx;
    // Render 4 side faces independently (faces 0-3)
    for(let fi=0;fi<4;fi++){
      const cf=coinFaces[fi];
      coinRenderFace(ctx,cf,dt,cs,DT_RES,t+fi*1.7);
      const pixels=ctx.getImageData(0,0,DT_RES,DT_RES).data;
      for(let v=0;v<SIZE;v++){
        for(let u=0;u<SIZE;u++){
          const px=Math.floor(u*scale), py=Math.floor(v*scale);
          const pi=(py*DT_RES+px)*4;
          const r=pixels[pi]/255, g=pixels[pi+1]/255, b=pixels[pi+2]/255;
          if(r<0.02&&g<0.02&&b<0.02) continue;
          const lv=SIZE-1-v;
          const idx=faceMap[fi][lv*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
    // Top face (face 4) — aggregate
    coinRenderTopFace(ctx,DT_RES,t);
    const pixels=ctx.getImageData(0,0,DT_RES,DT_RES).data;
    for(let v=0;v<SIZE;v++){
      for(let u=0;u<SIZE;u++){
        const px=Math.floor(u*scale), py=Math.floor(v*scale);
        const pi=(py*DT_RES+px)*4;
        const r=pixels[pi]/255, g=pixels[pi+1]/255, b=pixels[pi+2]/255;
        if(r<0.02&&g<0.02&&b<0.02) continue;
        const lv=SIZE-1-v;
        const idx=faceMap[4][lv*SIZE+u];
        if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
      }
    }
    // Bottom face (5) — leave dark
  } else {
    // 2D mode — single coin flip on face 0
    const ctx=coinCtx;
    if(coinFlipping){
      coinFlipT+=dt*cs;
      coinAngle+=dt*cs*12;
      if(coinFlipT>=coinFlipDur){
        coinFlipping=false;
        if(coinResult==='H') coinHeads++; else coinTails++;
        coinShowResult=2.0;
        coinAngle=0;
      }
    } else {
      coinShowResult-=dt*cs;
      if(coinShowResult<=0) coinStartFlip();
    }
    const cf={heads:coinHeads,tails:coinTails,flipping:coinFlipping,result:coinResult,flipT:coinFlipT,flipDur:coinFlipDur,angle:coinAngle,showResult:coinShowResult};
    coinRenderFace(ctx,cf,0,cs,DT_RES,t);
    // Don't update cf — we used the globals directly
    const pixels=ctx.getImageData(0,0,DT_RES,DT_RES).data;
    for(let v=0;v<SIZE;v++){
      for(let u=0;u<SIZE;u++){
        const px=Math.floor(u*scale), py=Math.floor(v*scale);
        const pi=(py*DT_RES+px)*4;
        const r=pixels[pi]/255, g=pixels[pi+1]/255, b=pixels[pi+2]/255;
        if(r<0.02&&g<0.02&&b<0.02) continue;
        const lv=SIZE-1-v;
        const idx=faceMap[0][lv*SIZE+u];
        if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
      }
    }
  }
}


// ═══════════════════════════════════════════════════
//  DICE ROLL
// ═══════════════════════════════════════════════════
let diceCanvas=null, diceCtx=null;
let diceValues=[1,2,3,4,5,6];
let diceRolling=false, diceRollT=0, diceRollDur=0;
let diceResult=1, diceShowT=0, diceAutoRoll=false, diceAutoTimer=0;
let diceGlowT=0;

function diceStartRoll(){
  diceRolling=true; diceRollT=0;
  diceRollDur=1.5+Math.random()*0.5;
  diceResult=1+Math.floor(Math.random()*6);
}

function diceDotPositions(val){
  const patterns={
    1:[[0.5,0.5]],
    2:[[0.2,0.2],[0.8,0.8]],
    3:[[0.2,0.2],[0.5,0.5],[0.8,0.8]],
    4:[[0.2,0.2],[0.8,0.2],[0.2,0.8],[0.8,0.8]],
    5:[[0.2,0.2],[0.8,0.2],[0.5,0.5],[0.2,0.8],[0.8,0.8]],
    6:[[0.2,0.2],[0.8,0.2],[0.2,0.5],[0.8,0.5],[0.2,0.8],[0.8,0.8]]
  };
  return patterns[val]||patterns[1];
}

function diceDrawFace(ctx,val,cx,cy,faceSize,dotColor,bgColor,borderColor){
  var r=faceSize*0.12;
  ctx.fillStyle=bgColor;
  ctx.beginPath();
  ctx.roundRect(cx-faceSize/2,cy-faceSize/2,faceSize,faceSize,r);
  ctx.fill();
  ctx.strokeStyle=borderColor;
  ctx.lineWidth=faceSize*0.04;
  ctx.stroke();
  var dots=diceDotPositions(val);
  var dotR=faceSize*0.09;
  var inner=faceSize*0.8;
  var ox=cx-inner/2, oy=cy-inner/2;
  ctx.fillStyle=dotColor;
  for(var i=0;i<dots.length;i++){
    ctx.beginPath();
    ctx.arc(ox+dots[i][0]*inner, oy+dots[i][1]*inner, dotR, 0, Math.PI*2);
    ctx.fill();
  }
}

function diceRenderPanel(ctx,val,RES,t,isResult,glowAmount){
  ctx.clearRect(0,0,RES,RES);
  var bg=isResult?Math.floor(15+glowAmount*25):8;
  ctx.fillStyle='rgb('+bg+','+Math.floor(bg*0.9)+','+Math.floor(bg*1.2)+')';
  ctx.fillRect(0,0,RES,RES);
  if(isResult&&glowAmount>0.1){
    var gr=ctx.createRadialGradient(RES/2,RES/2,0,RES/2,RES/2,RES*0.6);
    gr.addColorStop(0,'rgba(100,180,255,'+glowAmount*0.15+')');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=gr;
    ctx.fillRect(0,0,RES,RES);
  }
  var faceSize=RES*0.9;
  var dotCol=isResult?'#1a1a2a':'#222233';
  var bgCol=isResult?'#f0f0f5':'#e8e8ee';
  var borderCol=isResult?'rgba(100,180,255,'+(0.5+glowAmount*0.5)+')':'rgba(180,180,200,0.6)';
  diceDrawFace(ctx,val,RES/2,RES/2,faceSize,dotCol,bgCol,borderCol);
  if(isResult&&glowAmount>0.1){
    ctx.shadowColor='rgba(100,180,255,'+glowAmount*0.8+')';
    ctx.shadowBlur=30*glowAmount;
    ctx.strokeStyle='rgba(100,180,255,'+glowAmount*0.6+')';
    ctx.lineWidth=faceSize*0.03;
    ctx.beginPath();
    ctx.roundRect(RES/2-faceSize/2,RES/2-faceSize/2,faceSize,faceSize,faceSize*0.12);
    ctx.stroke();
    ctx.shadowBlur=0;
  }
}

function diceRenderRolling(ctx,RES,t,rollProgress){
  ctx.clearRect(0,0,RES,RES);
  var speed=1-rollProgress*0.6;
  var flashIntensity=Math.abs(Math.sin(t*12*speed));
  var bg=Math.floor(10+flashIntensity*50);
  var hue=(t*200)%360;
  ctx.fillStyle='hsl('+hue+',30%,'+Math.floor(bg*0.15)+'%)';
  ctx.fillRect(0,0,RES,RES);
  var faceSize=RES*0.7+Math.sin(t*15)*RES*0.08;
  var randomVal=1+Math.floor(Math.random()*6);
  var spinAngle=t*8*speed;
  ctx.save();
  ctx.translate(RES/2,RES/2);
  ctx.rotate(spinAngle);
  var scaleX=0.5+0.5*Math.abs(Math.cos(t*10*speed));
  var scaleY=0.5+0.5*Math.abs(Math.sin(t*10*speed+1));
  ctx.scale(scaleX,scaleY);
  var borderCol='hsl('+((t*300)%360)+',90%,65%)';
  diceDrawFace(ctx,randomVal,0,0,faceSize,'#1a1a2a','#e8e8ee',borderCol);
  ctx.restore();
  // Motion blur streaks
  for(var s=0;s<3;s++){
    ctx.save();
    ctx.globalAlpha=0.15-s*0.04;
    ctx.translate(RES/2,RES/2);
    ctx.rotate(spinAngle-0.3*(s+1));
    ctx.scale(scaleX*0.9,scaleY*0.9);
    diceDrawFace(ctx,randomVal,0,0,faceSize*0.8,'#1a1a2a','#e8e8ee',borderCol);
    ctx.restore();
  }
  ctx.globalAlpha=1;
}

function effectDice(dt){
  t+=dt;
  if(!diceCanvas){
    diceCanvas=document.createElement('canvas');
    diceCanvas.width=DT_RES; diceCanvas.height=DT_RES;
    diceCtx=diceCanvas.getContext('2d');
    diceStartRoll();
  }
  var ctx=diceCtx;
  var scale=DT_RES/SIZE;
  var is3D=!(typeof panel2dMode!=='undefined'&&panel2dMode);
  if(diceAutoRoll&&!diceRolling){
    diceAutoTimer+=dt;
    if(diceAutoTimer>=4){diceAutoTimer=0;diceStartRoll();}
  }
  if(diceRolling){
    diceRollT+=dt;
    if(diceRollT>=diceRollDur){
      diceRolling=false;
      var shuffled=[1,2,3,4,5,6].filter(function(v){return v!==diceResult;});
      for(var i=shuffled.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=shuffled[i];shuffled[i]=shuffled[j];shuffled[j]=tmp;}
      diceValues=[shuffled[0],shuffled[1],shuffled[2],shuffled[3],diceResult,shuffled[4]];
      diceGlowT=3.0;
      diceShowT=0;
    }
  }
  if(!diceRolling&&diceGlowT>0) diceGlowT-=dt;
  if(!diceRolling) diceShowT+=dt;
  for(var i=0;i<N*3;i++) colBuf[i]=0;
  if(is3D){
    for(var f=0;f<6;f++){
      if(diceRolling){
        var progress=Math.min(1,diceRollT/diceRollDur);
        diceRenderRolling(ctx,DT_RES,t+f*0.7,progress);
      } else {
        var isTop=(f===4);
        var glow=isTop?Math.max(0,diceGlowT/3.0):0;
        diceRenderPanel(ctx,diceValues[f],DT_RES,t,isTop,glow);
      }
      var pixels=ctx.getImageData(0,0,DT_RES,DT_RES).data;
      for(var v=0;v<SIZE;v++){
        for(var u=0;u<SIZE;u++){
          var px=Math.floor(u*scale), py=Math.floor(v*scale);
          var pi=(py*DT_RES+px)*4;
          var r=pixels[pi]/255, g=pixels[pi+1]/255, b=pixels[pi+2]/255;
          if(r<0.02&&g<0.02&&b<0.02) continue;
          var lv=SIZE-1-v;
          var idx=faceMap[f][lv*SIZE+u];
          if(idx>=0){colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;}
        }
      }
    }
  } else {
    if(diceRolling){
      var progress2=Math.min(1,diceRollT/diceRollDur);
      diceRenderRolling(ctx,DT_RES,t,progress2);
    } else {
      var glow2=Math.max(0,diceGlowT/3.0);
      diceRenderPanel(ctx,diceResult,DT_RES,t,true,glow2);
    }
    var pixels2=ctx.getImageData(0,0,DT_RES,DT_RES).data;
    for(var v2=0;v2<SIZE;v2++){
      for(var u2=0;u2<SIZE;u2++){
        var px2=Math.floor(u2*scale), py2=Math.floor(v2*scale);
        var pi2=(py2*DT_RES+px2)*4;
        var r2=pixels2[pi2]/255, g2=pixels2[pi2+1]/255, b2=pixels2[pi2+2]/255;
        if(r2<0.02&&g2<0.02&&b2<0.02) continue;
        var lv2=SIZE-1-v2;
        var idx2=faceMap[0][lv2*SIZE+u2];
        if(idx2>=0){colBuf[idx2*3]=r2;colBuf[idx2*3+1]=g2;colBuf[idx2*3+2]=b2;}
      }
    }
  }
}
