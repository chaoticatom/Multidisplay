
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
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const sx=Math.floor(u*(W/S));
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

  // ── OUTPUT to cube faces ──
  if(panel2dMode){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const sx=Math.floor(u*(W/S));
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
