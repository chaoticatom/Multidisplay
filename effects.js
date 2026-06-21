
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
let retroLastGameIdx=-1, retroSplashT=0;
let dcSplashData=null;
let jpSplashData=null;
let mmSplashData=null;
const DC_SPLASH_B64="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KwAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAdAAAHQAAIQAAYwAAdQAA/wAA9QAACQAAbQAAEAAAFQAAegAAAwAAeAAALQAAAQAAhAAA/wAA/wAAeAAAYAAAKQAABQAACQAAgQAA/wAA/wAAeAAAYQAAEwAAGQAAZAAAdAAA/wAA/wAAPQAAdQAA/wAA8QAAGAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAdAAAGwAAJgAAagAAagAAfgAAXAAAAwAAfAAAxwAAyAAAhQAAAAAAeAAAKwAAAAAAewAAcwAAeAAAbwAAYgAAKgAAAAAAAAAAewAAcgAAeQAAbAAAbwAAyAAAyQAAfgAAEwAAYQAAgQAAcwAAaAAAfgAAWwAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAcwEBFQAAGgAAaQAAYwAAEwAAAAAAAAAAgAAAyAAAyQAAhQAAAAAAeAAAKgAAAAAAdAAACgAAEwAAagAAYwAAHgAACAAAJwAAbQAACwAAFAAAZgAAcQAAyQAAygAAfgAAIAAAAAAAFAAAZwAAYwAAEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAeAAAJAAAYgAAgQAAXwAAOgAAFQAACAAAcAAADAAAEgAAeQAAAAAAdQAAKQAAAAAAdAAAHQAAJgAAaQAAagAALQAANAAAcgAAYwAAIAAAJgAAagAAYgAADwAAFQAAZwAAbQAAMQAANAAAbAAAZAAAOQAAFQAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAMDAAMDfBYW/wYG+wAAOQAAfwAA/wAA/wAAeAAAaQAAIgAAJAAAhAAAAAAAfgAALQAAAAAAfAAA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A8ADA8ADA8ADAb4BAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAA";

const JP_SPLASH_B64="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const MM_SPLASH_B64="AAAAQkIA//8A+fkA//8AkZEBAAABBEhEAL6+AMrKAMnJAMnJAMzMAImJAA4OATs7Aby8AMrKAMnJAMnJAM/PAHx8ABAQADc3ALa2AMrKAMnJAMnJAMzMAKWlABQUAAAAADw8ALq6AMrKAMnJAMjIAMrKAE1NAAAAAAQEAAAAAGFhAMrKAMnJAMjIAMvLAJ+fACEhAAAAAGdnAMnJAMnJAMjIAMzMAJGRAiQjAAAAwsMB//8A+voA//8AQkIAAAAAAAAAQkIA//8A+fkA//8AkY4AAAALBFVSANXVAP//AP//AP//AP//AHl5ADAwAElJANDQAP//AP//AP//AN3dAEFBADMzAEZGAMjIAP//AP//AP//AP//AMXFADExAQMDATo6AM7OAP//AP//AP//AP//AKOjAAkJAAEBABUVAKysAP//AP//AP//AP//AaCgAC0tABQUAMjIAP//AP//AP//AP//AFRTAzMxAAAAwsQC//8A+voA//8AQkIAAAAAAAAAQkIA//8A+fkA//8AkY4AAAANBERBANTUAP//APv7APn5AP//AGtrACoqAENDAMfHAP39AP7+AP//AGtrADY2ABQUADw7AMTEAP//APn5APr6AP//ALi4ACoqAQMDAi8vAMPDAP39AP//AP//AP39AIKCACoqAAAAAENDANzcAP39AP//AP39AP39AZWVACoqADAwAJubAP39APf3AP//AMLCAC8uAiIgAAAAwsQB//8A+voA//8AQkIAAAAAAAAAQkIA//8A+fkA//8AkY4AAAAJBGllAaGhA+3sA/7+A///AszMAG1tAD4+ATs7A8TEA///A9bWA6OjA19fAyEhAQAAAGNjAZqaAuXlA/7+A/39AsfHAKKiAD4+AQICAy0tA8HBA///A9DQA8/PA///A3R0AC0tAQAAA3h4A/z8A///A8zMA+TkA///A5GRASoqATg4A5mZA///A/T0Ab29AHx8AEhJAggHAAABwsIA//8A+voA//8AQkIAAAAAAAAAQkIA//8A+fkA//8AkZEAAAABBIuIAGxsAI6OAP//ANraAFxcAJaWAENDAFdXANbWAP39ANTUAKSkANvbAJycAA4OAH5+AGxsAJubAP39AOrqAHd3AJSUAD09AQAAAElJANLSAP39ANDQAM/PAPz8AJ6eADExABQUAMTEAPz8APz8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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
function initRetro(){
  retroGames=[
    {name:'jetpac',t:0,playerX:10,playerY:20,jetY:0,fuel:[],aliens:[],rocketParts:0,phase:'build',partX:50,partY:55,carryPart:false,laserT:0,laserDir:1,phaseT:0,launchT:0},
    {name:'manic',t:0,playerX:5,playerY:5,dir:1,jumpT:0,jumping:false,platforms:[],items:[],enemyX:[]},
    {name:'outrun',t:0,roadOff:0,carX:32,speed:0,trees:[],curves:0},
    {name:'invaders',t:0,invX:5,invY:50,invDir:1,bullets:[],playerX:30,bombs:[],invAlive:[]},
    {name:'jsw',t:0,playerX:10,playerY:10,dir:1,jumpT:0,jumping:false,room:0,roomT:0},
    {name:'deathchase',t:0,speed:0,treeOff:0,bikeX:32,leanDir:0,enemyX:20,enemyZ:40,hit:false,hitT:0,bullets:[],fireT:0},
    {name:'rtype',t:0,shipX:10,shipY:32,bullets:[],enemies:[],chargeT:0,scrollX:0,bossHP:20,bossX:55},
    {name:'wolf3d',t:0,posX:2.5,posY:2.5,dirA:0,gunFrame:0,fireT:0},
    {name:'quake2',t:0,posX:3,posY:3,dirA:0.5,bobT:0,muzzleT:0,enemies:[]},
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
  for(let r=0;r<4;r++) for(let c=0;c<8;c++) inv.invAlive.push({r,c,alive:true});
  // R-Type enemies
  const rt=retroGames[6];
  rt.enemies=[];
  for(let i=0;i<5;i++) rt.enemies.push({x:50+i*12,y:15+i*8,alive:true,type:i%3});
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
    jsw:'JET SET WILLY',rtype:'R-TYPE',wolf3d:'WOLFENSTEIN 3D',quake2:'QUAKE 2'};
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
      const rBaseY=rocketBaseY-rLaunchOff;
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
    // Laser beam (horizontal, firing direction)
    p.laserT+=dt;
    if(Math.sin(p.t*4)>0.3){
      for(let lx=1;lx<20;lx++){
        const beamX=px+lx*p.laserDir;
        if(beamX<0||beamX>=S) break;
        setP(beamX,py+4,1,1,1);
      }
    }

    // Aliens (colorful blobs like original — round, fuzzy)
    const alienColors=[[1,0,0],[0,0.9,0],[0,0.9,0.9],[0.9,0,0.9]];
    for(let a=0;a<4;a++){
      const ac=alienColors[a%4];
      const ax=(Math.round(p.t*12*(a%2?1:-1)+a*17))%S;
      const aax=ax<0?ax+S:ax;
      const ay=15+a*10+Math.round(Math.sin(p.t*1.8+a*1.5)*5);
      // Blob body (round, 5x5)
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
        if(dx*dx+dy*dy<=5){
          const sx=aax+dx, sy=ay+dy;
          if(sx>=0&&sx<S&&sy>=0&&sy<S){
            const bright=0.7+0.3*Math.sin(p.t*5+a+dy*0.5);
            setP(sx,sy,ac[0]*bright,ac[1]*bright,ac[2]*bright);
          }
        }
      }
      // Tentacles/legs at bottom (wobbly)
      for(let leg=0;leg<3;leg++){
        const lx=aax-1+leg+Math.round(Math.sin(p.t*8+a+leg)*0.8);
        const ly=ay-3;
        if(lx>=0&&lx<S&&ly>=0&&ly<S) setP(lx,ly,ac[0]*0.6,ac[1]*0.6,ac[2]*0.6);
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
    if(!p.jumping&&Math.sin(p.t*2.5)>0.7){ p.jumping=true; p.jumpT=0; }
    if(p.jumping){ p.jumpT+=dt; if(p.jumpT>0.6) p.jumping=false; }
    const jumpOff=p.jumping?Math.sin(p.jumpT/0.6*Math.PI)*12:0;
    // Find which platform player is on
    let baseY=groundY+1;
    for(const pl of plats){
      if(p.playerX>=pl[1]&&p.playerX<=pl[2]&&!p.jumping){
        if(Math.abs(baseY-(pl[0]+1))<15) baseY=pl[0]+2;
      }
    }
    const playerY=baseY+Math.round(jumpOff);
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
    // Space Invaders
    const p=game;
    // Move invaders
    p.invX+=p.invDir*12*dt;
    if(p.invX>S-20||p.invX<3){ p.invDir*=-1; p.invY-=2; }
    if(p.invY<15) p.invY=50;
    // Draw invaders
    for(const inv of p.invAlive){
      if(!inv.alive) continue;
      const ix=Math.round(p.invX+inv.c*7);
      const iy=Math.round(p.invY+inv.r*7);
      if(ix<0||ix>=S||iy<0||iy>=S) continue;
      // Invader shape (3x3)
      const frame=Math.floor(p.t*3)%2;
      setP(ix,iy+2,GRN[0],GRN[1],GRN[2]);
      setP(ix-1,iy+1,GRN[0],GRN[1],GRN[2]); setP(ix+1,iy+1,GRN[0],GRN[1],GRN[2]);
      setP(ix,iy+1,GRN[0],GRN[1],GRN[2]);
      if(frame){ setP(ix-1,iy,GRN[0],GRN[1],GRN[2]); setP(ix+1,iy,GRN[0],GRN[1],GRN[2]); }
      else { setP(ix-1,iy+3,GRN[0],GRN[1],GRN[2]); setP(ix+1,iy+3,GRN[0],GRN[1],GRN[2]); }
    }
    // Player cannon
    const cannonX=Math.round(32+Math.sin(p.t*1.2)*20);
    fillRect(cannonX-2,5,cannonX+2,7,CYN[0],CYN[1],CYN[2]);
    setP(cannonX,8,CYN[0],CYN[1],CYN[2]);
    // Bullets
    if(Math.sin(p.t*4)>0.9) p.bullets.push({x:cannonX,y:8});
    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].y+=60*dt;
      const b=p.bullets[i];
      if(b.y>S){ p.bullets.splice(i,1); continue; }
      setP(Math.round(b.x),Math.round(b.y),WHT[0],WHT[1],WHT[2]);
      setP(Math.round(b.x),Math.round(b.y)+1,WHT[0],WHT[1],WHT[2]);
      // Hit detection
      for(const inv of p.invAlive){
        if(!inv.alive) continue;
        const ix=p.invX+inv.c*7, iy=p.invY+inv.r*7;
        if(Math.abs(b.x-ix)<3&&Math.abs(b.y-iy)<3){ inv.alive=false; p.bullets.splice(i,1); break; }
      }
    }
    // Reset invaders when all dead
    if(p.invAlive.every(i=>!i.alive)){
      for(const i of p.invAlive) i.alive=true;
      p.invY=50; p.invX=5;
    }
    if(p.bullets.length>8) p.bullets.length=8;
    // Shields
    for(let s=0;s<3;s++){
      fillRect(12+s*18,10,18+s*18,13,GRN[0],GRN[1],GRN[2]);
    }
    // Ground line
    hLine(0,S-1,3,GRN[0],GRN[1],GRN[2]);
    // Score
    hLine(2,10,S-2,WHT[0],WHT[1],WHT[2]);

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
    const jumpH=p.jumping?Math.sin(p.jumpT/0.55*Math.PI)*12:0;
    let baseY=groundY+1;
    for(const pl of plats){
      if(p.playerX>=pl[1]&&p.playerX<=pl[2]&&!p.jumping){
        if(pl[0]>baseY-5&&pl[0]<baseY+20) baseY=pl[0]+1;
      }
    }
    p.playerY=baseY+Math.round(jumpH);
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
    // R-Type — horizontal scrolling shooter
    const p=game;
    p.scrollX+=dt*20;
    p.shipY=32+Math.round(Math.sin(p.t*1.8)*18);
    p.shipX=10+Math.round(Math.sin(p.t*0.4)*3);

    // Space background with scrolling stars
    for(let i=0;i<40;i++){
      const sx=((i*13+Math.floor(p.scrollX))%S);
      const sy=(i*41+7)%S;
      const brightness=0.2+((i*3)%5)*0.1;
      setP(S-1-sx,sy,brightness,brightness,brightness*1.2);
    }

    // Organic wall/ceiling (Bydo empire style)
    for(let x=0;x<S;x++){
      const wallOff=Math.sin((x+p.scrollX)*0.08)*3+Math.sin((x+p.scrollX)*0.15)*2;
      const topH=3+Math.round(Math.abs(wallOff));
      const botH=2+Math.round(Math.abs(Math.sin((x+p.scrollX)*0.1)*2));
      for(let y=S-topH;y<S;y++) setP(x,y,0.2,0.08,0.02);
      for(let y=0;y<botH;y++) setP(x,y,0.2,0.08,0.02);
      // Organic texture dots
      if(((x+Math.floor(p.scrollX))%6)<2){ setP(x,S-topH,0.5,0.15,0.05); setP(x,botH,0.5,0.15,0.05); }
    }

    // Player ship (R-9 style — detailed)
    const sx=Math.round(p.shipX), sy=Math.round(p.shipY);
    // Main body
    fillRect(sx,sy-1,sx+5,sy+1,BLU[0]*0.8,BLU[1]*0.8,BLU[2]);
    // Nose cone
    setP(sx+6,sy,WHT[0],WHT[1],WHT[2]);
    setP(sx+5,sy,CYN[0],CYN[1],CYN[2]);
    // Cockpit
    setP(sx+3,sy,CYN[0],CYN[1],CYN[2]); setP(sx+4,sy,CYN[0]*0.7,CYN[1]*0.7,CYN[2]*0.7);
    // Wings
    setP(sx+1,sy-2,BLU[0]*0.5,BLU[1]*0.5,BLU[2]*0.8); setP(sx+2,sy-2,BLU[0]*0.5,BLU[1]*0.5,BLU[2]*0.8);
    setP(sx+1,sy+2,BLU[0]*0.5,BLU[1]*0.5,BLU[2]*0.8); setP(sx+2,sy+2,BLU[0]*0.5,BLU[1]*0.5,BLU[2]*0.8);
    // Engine glow
    const engFlicker=Math.sin(p.t*20)>0?1:0.6;
    setP(sx-1,sy,RED[0]*engFlicker,RED[1],RED[2]); setP(sx-2,sy,YEL[0]*engFlicker*0.5,YEL[1]*engFlicker*0.3,0);

    // Force pod (orbiting)
    const podAngle=p.t*3;
    const podX=sx+4+Math.round(Math.cos(podAngle)*5);
    const podY=sy+Math.round(Math.sin(podAngle)*5);
    fillRect(podX-1,podY-1,podX+1,podY+1,RED[0],RED[1]*0.3,RED[2]);
    setP(podX,podY,YEL[0],YEL[1],YEL[2]);

    // Player bullets
    if(Math.sin(p.t*7)>0.8&&p.bullets.length<6) p.bullets.push({x:sx+7,y:sy,charge:false});
    // Charged shot occasionally
    if(Math.sin(p.t*0.8)>0.95&&p.bullets.length<6) p.bullets.push({x:sx+7,y:sy,charge:true});

    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].x+=80*dt;
      const b=p.bullets[i];
      if(b.x>S+5){ p.bullets.splice(i,1); continue; }
      const bx=Math.round(b.x), by=Math.round(b.y);
      if(b.charge){
        // Big charged beam
        fillRect(bx-2,by-1,bx+2,by+1,CYN[0],CYN[1],CYN[2]);
        setP(bx+3,by,WHT[0],WHT[1],WHT[2]);
      } else {
        setP(bx,by,YEL[0],YEL[1],YEL[2]); setP(bx+1,by,YEL[0]*0.7,YEL[1]*0.7,0);
      }
      // Hit enemies
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(Math.abs(b.x-e.x)<4&&Math.abs(b.y-e.y)<4){ e.alive=false; p.bullets.splice(i,1); break; }
      }
    }
    if(p.bullets.length>6) p.bullets.length=6;

    // Enemies (various Bydo types)
    for(const e of p.enemies){
      if(!e.alive) continue;
      e.x-=15*dt;
      e.y+=Math.sin(p.t*3+e.x*0.1)*8*dt;
      if(e.x<-5){ e.x=S+5+Math.random()*20; e.y=10+Math.random()*44; e.alive=true; }
      const ex=Math.round(e.x), ey=Math.round(e.y);
      if(e.type===0){
        // Small pod enemy
        fillRect(ex-1,ey-1,ex+1,ey+1,RED[0],RED[1]*0.3,RED[2]*0.3);
        setP(ex,ey,YEL[0],YEL[1],YEL[2]);
      } else if(e.type===1){
        // Snake segment enemy
        for(let seg=0;seg<3;seg++){
          const segX=ex+seg*2, segY=ey+Math.round(Math.sin(p.t*5+seg)*2);
          setP(segX,segY,GRN[0],GRN[1]*0.8,GRN[2]);
          setP(segX+1,segY,GRN[0]*0.6,GRN[1]*0.5,GRN[2]);
        }
      } else {
        // Large armoured enemy
        fillRect(ex-2,ey-1,ex+2,ey+1,MAG[0]*0.7,MAG[1],MAG[2]*0.7);
        setP(ex,ey,WHT[0],WHT[1],WHT[2]);
        setP(ex-2,ey,RED[0],RED[1],RED[2]);
      }
    }
    // Respawn enemies
    if(p.enemies.filter(e=>e.alive).length<2){
      for(const e of p.enemies){ e.alive=true; e.x=S+Math.random()*20; e.y=10+Math.random()*44; }
    }

    // Boss (appears periodically)
    if(Math.floor(p.t/15)%2===1){
      const bossY=32+Math.round(Math.sin(p.t*0.8)*15);
      const bossX=S-12+Math.round(Math.sin(p.t*0.5)*3);
      // Large boss body
      fillRect(bossX-4,bossY-5,bossX+4,bossY+5,0.3,0.1,0.05);
      fillRect(bossX-3,bossY-4,bossX+3,bossY+4,0.5,0.15,0.08);
      // Core
      const corePulse=0.5+0.5*Math.sin(p.t*6);
      fillRect(bossX-1,bossY-1,bossX+1,bossY+1,RED[0]*corePulse,RED[1],RED[2]);
      // Tentacles
      for(let t=0;t<3;t++){
        const tx=bossX-5-t*2+Math.round(Math.sin(p.t*3+t)*2);
        const ty=bossY-3+t*3;
        setP(tx,ty,MAG[0],MAG[1],MAG[2]); setP(tx-1,ty,MAG[0]*0.5,MAG[1],MAG[2]*0.5);
      }
    }

    // HUD: power meter
    hLine(2,12,S-2,BLU[0],BLU[1],BLU[2]);

  } else if(game.name==='wolf3d'){
    // Wolfenstein 3D — raycasting first-person corridor
    const p=game;
    p.dirA+=dt*0.4;
    p.posX=4+Math.sin(p.t*0.3)*2;
    p.posY=4+Math.cos(p.t*0.25)*2;
    p.fireT-=dt;
    if(p.fireT<-2){ p.fireT=0.3; p.gunFrame=3; }
    if(p.gunFrame>0) p.gunFrame-=dt*8;

    // Simple map (8x8)
    const map=[
      1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,1,
      1,0,2,0,0,3,0,1,
      1,0,0,0,0,0,0,1,
      1,0,0,0,0,0,0,1,
      1,0,3,0,0,2,0,1,
      1,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,
    ];
    const mapW=8;

    // Ceiling (grey)
    fillRect(0,S/2,S-1,S-1,0.25,0.25,0.28);
    // Floor (darker grey, brown tint)
    fillRect(0,0,S-1,S/2-1,0.18,0.15,0.1);

    // Raycast each column (2px wide for performance)
    const fov=1.0;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0; let hitType=0;
      let rx=p.posX, ry=p.posY;
      for(let step=0;step<40;step++){
        dist+=0.1;
        rx=p.posX+rdx*dist; ry=p.posY+rdy*dist;
        const mx=Math.floor(rx), my=Math.floor(ry);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx];break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S,Math.round(S/(perpDist+0.01)));
      const wallTop=Math.floor(S/2+wallH/2);
      const wallBot=Math.floor(S/2-wallH/2);
      const shade=Math.min(1,1.5/(perpDist+0.5));
      let wr,wg,wb;
      if(hitType===1){ wr=0.35*shade; wg=0.35*shade; wb=0.38*shade; }
      else if(hitType===2){ wr=0.15*shade; wg=0.15*shade; wb=0.5*shade; }
      else { wr=0.5*shade; wg=0.2*shade; wb=0.1*shade; }
      const fracX=rx-Math.floor(rx);
      if(fracX<0.02||fracX>0.98){ wr*=0.7; wg*=0.7; wb*=0.7; }
      for(let y=Math.max(0,wallBot);y<=Math.min(S-1,wallTop);y++){
        setP(x,y,wr,wg,wb); setP(x+1,y,wr,wg,wb);
      }
    }

    // Gun (centred at bottom, pistol shape)
    const gunBob=Math.round(Math.sin(p.t*5)*1.5);
    const gx=Math.floor(S/2), gy=8+gunBob;
    // Gun barrel
    fillRect(gx-2,gy+4,gx+2,gy+14,0.3,0.3,0.32);
    fillRect(gx-1,gy+14,gx+1,gy+18,0.35,0.35,0.38);
    // Grip
    fillRect(gx-3,gy,gx+3,gy+4,0.25,0.2,0.12);
    // Hand
    fillRect(gx-5,gy,gx-3,gy+3,0.8,0.6,0.4);
    fillRect(gx+3,gy,gx+5,gy+3,0.8,0.6,0.4);
    // Muzzle flash
    if(p.gunFrame>2){
      fillRect(gx-3,gy+18,gx+3,gy+22,YEL[0],YEL[1],0);
      fillRect(gx-1,gy+22,gx+1,gy+25,WHT[0],WHT[1],WHT[2]);
    }

    // HUD bar at bottom
    hLine(0,S-1,1,0.3,0.3,0.3);
    hLine(0,S-1,0,0.2,0.2,0.2);
    // Health (red)
    hLine(2,20,0,RED[0]*0.8,0,0);
    // Ammo (yellow)
    hLine(S-20,S-3,0,YEL[0]*0.6,YEL[1]*0.6,0);
    // Face (tiny BJ face in centre)
    fillRect(S/2-2,0,S/2+2,2,0.8,0.6,0.4);
    setP(S/2-1,2,0.2,0.2,0.6); setP(S/2+1,2,0.2,0.2,0.6); // eyes

  } else if(game.name==='quake2'){
    // Quake 2 — dark industrial corridor, strobing lights, enemy
    const p=game;
    p.dirA+=dt*0.35;
    p.posX=5+Math.sin(p.t*0.2)*3;
    p.posY=5+Math.cos(p.t*0.18)*3;
    p.bobT+=dt*6;
    p.muzzleT-=dt;
    if(p.muzzleT<-1.5){ p.muzzleT=0.15; }

    // Map (10x10 industrial)
    const map=[
      1,1,1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,2,2,0,0,3,3,0,1,
      1,0,2,0,0,0,0,3,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,3,0,0,0,0,2,0,1,
      1,0,3,3,0,0,2,2,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,1,1,
    ];
    const mapW=10;

    // Ceiling (dark metal)
    fillRect(0,S/2,S-1,S-1,0.08,0.06,0.04);
    // Floor (dark metal)
    fillRect(0,0,S-1,S/2-1,0.1,0.08,0.05);

    // Raycast (2px wide columns for performance)
    const fov=1.1;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0,hitType=0;
      for(let step=0;step<40;step++){
        dist+=0.1;
        const rx=p.posX+rdx*dist, ry=p.posY+rdy*dist;
        const mx=Math.floor(rx), my=Math.floor(ry);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx];break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S,Math.round(S*1.2/(perpDist+0.01)));
      const wallTop=Math.floor(S/2+wallH/2);
      const wallBot=Math.floor(S/2-wallH/2);
      const shade=Math.min(1,1.2/(perpDist+0.3));
      const strobe=(Math.sin(p.t*4+x*0.05)>0.85)?0.2:0;
      let wr,wg,wb;
      if(hitType===1){ wr=(0.2+strobe)*shade; wg=(0.18+strobe)*shade; wb=(0.15+strobe*0.5)*shade; }
      else if(hitType===2){ wr=0.12*shade; wg=0.2*shade; wb=(0.3+strobe)*shade; }
      else { wr=(0.35+strobe)*shade; wg=0.12*shade; wb=0.05*shade; }
      for(let y=Math.max(0,wallBot);y<=Math.min(S-1,wallTop);y++){
        setP(x,y,wr,wg,wb); setP(x+1,y,wr,wg,wb);
      }
    }

    // Enemy (Strogg soldier — appears at fixed map position)
    const enemyAngle=Math.atan2(6-p.posY,6-p.posX)-p.dirA;
    const enemyDist=Math.sqrt((6-p.posX)*(6-p.posX)+(6-p.posY)*(6-p.posY));
    if(Math.abs(enemyAngle)<fov/2&&enemyDist>0.5&&enemyDist<8){
      const eScreenX=Math.round(S/2+(enemyAngle/(fov/2))*(S/2));
      const eH=Math.round(S*0.7/(enemyDist+0.1));
      const eW=Math.round(eH*0.4);
      const eBot=S/2-Math.floor(eH/2);
      const eTop=S/2+Math.floor(eH/2);
      // Strogg body
      for(let ey=Math.max(0,eBot);ey<=Math.min(S-1,eTop);ey++){
        const rel=(ey-eBot)/(eH||1);
        const bw=rel>0.8?Math.floor(eW*0.6):rel>0.3?eW:Math.floor(eW*0.8);
        for(let ex=eScreenX-Math.floor(bw/2);ex<=eScreenX+Math.floor(bw/2);ex++){
          if(ex<0||ex>=S) continue;
          if(rel>0.8) setP(ex,ey,0.7,0.5,0.35); // head
          else if(rel>0.6) setP(ex,ey,0.25,0.3,0.2); // torso armour
          else if(rel>0.3) setP(ex,ey,0.2,0.25,0.18); // body
          else setP(ex,ey,0.15,0.18,0.12); // legs
        }
      }
      // Eyes (red glow)
      const eyeY=eTop-Math.floor(eH*0.12);
      if(eyeY>0&&eyeY<S){
        setP(eScreenX-1,eyeY,RED[0],0,0); setP(eScreenX+1,eyeY,RED[0],0,0);
      }
    }

    // Weapon (railgun/shotgun style at bottom)
    const bob=Math.round(Math.sin(p.bobT)*2);
    const wx=Math.floor(S/2)+2, wy=6+bob;
    // Gun body (dark metal)
    fillRect(wx-3,wy,wx+3,wy+16,0.15,0.15,0.18);
    fillRect(wx-2,wy+16,wx+2,wy+22,0.2,0.2,0.25);
    // Barrel
    fillRect(wx-1,wy+22,wx+1,wy+28,0.12,0.12,0.15);
    // Orange energy glow on weapon
    setP(wx,wy+20,0.6,0.3,0.05); setP(wx,wy+18,0.4,0.2,0.02);
    // Grip + hand
    fillRect(wx-4,wy,wx-3,wy+5,0.6,0.45,0.3);
    fillRect(wx+3,wy,wx+4,wy+5,0.6,0.45,0.3);
    // Muzzle flash
    if(p.muzzleT>0){
      fillRect(wx-4,wy+28,wx+4,wy+32,0.9,0.6,0.1);
      fillRect(wx-2,wy+32,wx+2,wy+35,0.6,0.3,0.1);
    }

    // HUD
    hLine(0,S-1,1,0.15,0.15,0.15);
    hLine(0,S-1,0,0.1,0.1,0.1);
    // Health
    hLine(2,18,0,0.6,0.1,0.05);
    // Armor (blue)
    hLine(22,36,0,0.1,0.2,0.5);
    // Ammo
    hLine(S-16,S-3,0,0.5,0.4,0.1);
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

  // 5x7 bitmap font
  const F={R:[0x7C,0x44,0x44,0x78,0x48,0x44,0x42],E:[0x7E,0x40,0x40,0x7C,0x40,0x40,0x7E],T:[0x7E,0x18,0x18,0x18,0x18,0x18,0x18],O:[0x3C,0x42,0x42,0x42,0x42,0x42,0x3C]};
  const word=[F.R,F.E,F.T,F.R,F.O];
  const charW=7, charH=7;
  const numChars=word.length;
  const arcSpan=0.9;
  const baseAngle=t*0.7;

  // Color cycling
  const hue=(t*80)%360;
  const hr=hue/60; const hi=Math.floor(hr)%6; const hf=hr-Math.floor(hr);
  let cr,cg,cb;
  switch(hi){
    case 0: cr=1;cg=hf;cb=0;break; case 1: cr=1-hf;cg=1;cb=0;break;
    case 2: cr=0;cg=1;cb=hf;break; case 3: cr=0;cg=1-hf;cb=1;break;
    case 4: cr=hf;cg=0;cb=1;break; default: cr=1;cg=0;cb=1-hf;
  }

  // Draw each character curved along the circle
  for(let c=0;c<numChars;c++){
    const glyph=word[c];
    const charAngle=baseAngle+(c-(numChars-1)/2)*arcSpan/numChars;
    const charCx=cx+Math.cos(charAngle)*radius;
    const charCy=cy+Math.sin(charAngle)*radius;
    const rot=charAngle+Math.PI/2;
    const cosR=Math.cos(rot), sinR=Math.sin(rot);

    for(let row=0;row<charH;row++){
      const bits=glyph[row];
      for(let col=0;col<charW;col++){
        if(bits&(1<<(charW-1-col))){
          const lx=col-charW/2, ly=row-charH/2;
          const px=Math.round(charCx+lx*cosR-ly*sinR);
          const py=Math.round(charCy+lx*sinR+ly*cosR);
          if(px>=0&&px<S&&py>=0&&py<S){
            const i=(py*S+px)*3;
            topBuf[i]=cr; topBuf[i+1]=cg; topBuf[i+2]=cb;
          }
          // Bloom
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
            if(dx===0&&dy===0) continue;
            const gx=px+dx, gy=py+dy;
            if(gx>=0&&gx<S&&gy>=0&&gy<S){
              const gi=(gy*S+gx)*3;
              topBuf[gi]+=cr*0.2; topBuf[gi+1]+=cg*0.2; topBuf[gi+2]+=cb*0.2;
            }
          }
        }
      }
    }
  }

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
  const currentIdx=retroSelectedGame>=0?retroSelectedGame:Math.floor(retroT/retroRotateInterval)%numGames;
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
      if(!singleGame&&fIdx>0){ faceBuf.fill(0); retroDrawFace((baseIdx+fIdx)%numGames,dt,faceBuf,S); }
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
