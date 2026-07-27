// ═══════════════════════════════════════════════════
//  effects-motion.js — Motion & Particles (lazy-loaded)
//  wave, rain, plasma, sphere, dna, nebula, aurora, warp,
//  lightning, lightspeed
// ═══════════════════════════════════════════════════

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

// ── COLOUR RAIN — enhanced: thick drops, bottom splash, lightning columns ──
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
      const vy=Math.round(d.y+k);
      if(vy<0||vy>=SIZE) continue;
      const fade=Math.pow(1-k/d.len,1.2)*d.bright;
      const h=(d.hue+k/d.len*0.15)%1;
      const [r,g,b]=hsl(h,1,fade*0.95);
      setFaceLED(d.face,d.col,vy,r,g,b);
      if(d.wide){
        setFaceLED(d.face,d.col-1,vy,r*0.5,g*0.5,b*0.5);
        setFaceLED(d.face,d.col+1,vy,r*0.5,g*0.5,b*0.5);
      }
      if(vy===0 && k<4){
        const sp=fade*0.8;
        for(let s=-4;s<=4;s++){
          const sf=Math.max(0,1-Math.abs(s)/4)*sp*0.5;
          setFaceLED(d.face,d.col+s,0,...hsl(h,1,sf));
        }
      }
    }
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
let sphT=0;

let _lgScanT=0, _lgBaseAngle=0, _lgState='expand', _lgStateT=0;
let _lgSpinTarget=0, _lgFlatT=-1, _lgFlatAlpha=0;
let _lgPulseT=-1, _lgColSweepT=-1, _lgWaveT=-1;
let _lgDblScanT=-1, _lgCollapsePhase=0;
let _lgRoutineIdx=0;

function effectSphere(dt) {
  t+=dt; sphT+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.75;
  const S=SIZE, time=sphT;
  const total=S*4;
  const cx=(S-1)/2, cy=(S-1)/2;
  const nRays=6;
  const nHLines=8;

  // Smooth colour cycle with subtle flicker
  const hp=time*0.15;
  const flicker=0.92+0.08*Math.sin(time*47.3)*Math.sin(time*31.7);
  // Color sweep: shift hue rapidly when active
  let hpOff=0;
  if(_lgColSweepT>=0){
    _lgColSweepT+=dt;
    const sweepDur=4.0;
    if(_lgColSweepT>=sweepDur) _lgColSweepT=-1;
    else hpOff=_lgColSweepT*2.5;
  }
  const hpFinal=hp+hpOff;
  // Pulse: modulate brightness
  let pulseMul=1;
  if(_lgPulseT>=0){
    _lgPulseT+=dt;
    const pulseDur=5.0;
    if(_lgPulseT>=pulseDur) _lgPulseT=-1;
    else pulseMul=0.4+0.6*Math.abs(Math.sin(_lgPulseT*Math.PI*2.5));
  }
  const cR=(0.15+0.85*Math.max(0,Math.sin(hpFinal)))*flicker*pulseMul;
  const cG=(0.3+0.7*Math.max(0,Math.sin(hpFinal+2.094)))*flicker*pulseMul;
  const cB=(0.1+0.9*Math.max(0,Math.sin(hpFinal+4.189)))*flicker*pulseMul;

  // Wave timer (runs independently)
  let waveOffset=0;
  if(_lgWaveT>=0){
    _lgWaveT+=dt;
    const waveDur=5.0;
    if(_lgWaveT>=waveDur) _lgWaveT=-1;
    else waveOffset=_lgWaveT;
  }

  // State machine
  _lgStateT+=dt;
  const expandDur=2.0, scanPeriod=3.0, spinDur=1.5;
  const collapseDur=1.2, reExpandDur=1.5;
  let expandEase=1, scanV=cy, spinAngle=_lgBaseAngle;
  let scanV2=-1; // second scan line for double scan

  if(_lgState==='expand'){
    const p=Math.min(_lgStateT/expandDur,1);
    expandEase=p*p;
    _lgScanT+=dt;
    const sp=(_lgScanT%scanPeriod)/scanPeriod;
    const raw=sp<0.5?sp*2:2-sp*2;
    scanV=cy+(raw-0.5)*2*expandEase*(S-1)/2;
    scanV=Math.max(0,Math.min(S-1,scanV));
    if(p>=1){_lgState='scan'; _lgStateT=0;}
  }

  if(_lgState==='scan'){
    _lgScanT+=dt;
    const sp=(_lgScanT%scanPeriod)/scanPeriod;
    const raw=sp<0.5?sp*2:2-sp*2;
    scanV=cy+(raw-0.5)*2*(S-1)/2;
    scanV=Math.max(0,Math.min(S-1,scanV));
    // Double scan: second bar going opposite direction
    if(_lgDblScanT>=0){
      _lgDblScanT+=dt;
      const dblDur=6.0;
      if(_lgDblScanT>=dblDur) _lgDblScanT=-1;
      else{
        const sp2=((_lgScanT+scanPeriod/2)%scanPeriod)/scanPeriod;
        const raw2=sp2<0.5?sp2*2:2-sp2*2;
        scanV2=cy+(raw2-0.5)*2*(S-1)/2;
        scanV2=Math.max(0,Math.min(S-1,scanV2));
      }
    }
    // Trigger routines when scan near center
    if(_lgStateT>6.0 && Math.abs(scanV-cy)<2){
      const routines=['spin','collapse','dblscan','pulse','colsweep','wave','flat','spin'];
      const pick=routines[_lgRoutineIdx%routines.length];
      _lgRoutineIdx++;
      if(pick==='spin'){
        _lgState='spin';
        _lgStateT=0;
        _lgSpinTarget=((_lgScanT*7|0)%3===0)?Math.PI/2:Math.PI*2;
        scanV=cy;
      } else if(pick==='collapse'){
        _lgState='collapse';
        _lgStateT=0;
        _lgCollapsePhase=0;
      } else if(pick==='dblscan'){
        _lgDblScanT=0;
        _lgStateT=0;
      } else if(pick==='pulse'){
        _lgPulseT=0;
        _lgStateT=0;
      } else if(pick==='colsweep'){
        _lgColSweepT=0;
        _lgStateT=0;
      } else if(pick==='wave'){
        _lgWaveT=0;
        _lgStateT=0;
      } else if(pick==='flat'){
        _lgFlatT=0;
        _lgStateT=0;
      }
    }
  }

  if(_lgState==='spin'){
    scanV=cy;
    const p=Math.min(_lgStateT/spinDur,1);
    const ease=p<0.5?2*p*p:1-2*(1-p)*(1-p);
    spinAngle=_lgBaseAngle+ease*_lgSpinTarget;
    if(p>=1){
      _lgBaseAngle=_lgBaseAngle+_lgSpinTarget;
      while(_lgBaseAngle>Math.PI*2) _lgBaseAngle-=Math.PI*2;
      _lgState='scan';
      _lgStateT=0;
    }
  }

  if(_lgState==='collapse'){
    _lgScanT+=dt;
    const sp=(_lgScanT%scanPeriod)/scanPeriod;
    const raw=sp<0.5?sp*2:2-sp*2;
    if(_lgCollapsePhase===0){
      // Collapse: rays retract to center
      const p=Math.min(_lgStateT/collapseDur,1);
      expandEase=1-p*p;
      scanV=cy+(raw-0.5)*2*expandEase*(S-1)/2;
      scanV=Math.max(0,Math.min(S-1,scanV));
      if(p>=1){_lgCollapsePhase=1; _lgStateT=0;}
    } else {
      // Re-expand
      const p=Math.min(_lgStateT/reExpandDur,1);
      expandEase=p*p;
      scanV=cy+(raw-0.5)*2*expandEase*(S-1)/2;
      scanV=Math.max(0,Math.min(S-1,scanV));
      if(p>=1){_lgState='scan'; _lgStateT=0;}
    }
  }

  // Flat grid overlay timer (runs independently)
  const flatSweepDur=2.0, flatHoldDur=2.5, flatFadeDur=1.5;
  const flatTotalDur=flatSweepDur+flatHoldDur+flatFadeDur;
  if(_lgFlatT>=0){
    _lgFlatT+=dt;
    if(_lgFlatT>=flatTotalDur) _lgFlatT=-1;
  }

  const cosA=Math.cos(spinAngle), sinA=Math.sin(spinAngle);

  // Ray targets
  const rayTargets=[];
  for(let ri=0;ri<nRays;ri++) rayTargets.push(ri/(nRays-1)*(S-1));

  function drawFace(setPx){
    function drawLine(x0,y0,x1,y1,bright){
      const ldx=x1-x0, ldy=y1-y0;
      const ls=Math.max(Math.abs(ldx),Math.abs(ldy),1)|0;
      for(let i=0;i<=ls;i++){
        const ft=i/ls;
        const u=Math.round(x0+ldx*ft), v=Math.round(y0+ldy*ft);
        if(u<0||u>=S||v<0||v>=S) continue;
        setPx(u,v,cR*bright,cG*bright,cB*bright);
      }
    }

    // Scan line geometry rotated around center
    const scanDist=scanV-cy;
    const scanCU=cx-scanDist*sinA, scanCV=cy+scanDist*cosA;
    const slHalf=(S-1)/2*1.2;
    const slU0=scanCU+cosA*slHalf, slV0=scanCV+sinA*slHalf;
    const slU1=scanCU-cosA*slHalf, slV1=scanCV-sinA*slHalf;

    // Full scan line
    const slB=0.9*expandEase;
    drawLine(slU0,slV0,slU1,slV1,slB);
    // Scan line glow
    const normU=-sinA, normV=cosA;
    for(let dv=-3;dv<=3;dv++){
      if(dv===0) continue;
      const gb=(1-Math.abs(dv)/4)*0.18*expandEase;
      drawLine(slU0+normU*dv,slV0+normV*dv,slU1+normU*dv,slV1+normV*dv,gb);
    }

    // 6 rays from center to points along the scan line
    for(let ri=0;ri<nRays;ri++){
      const frac=ri/(nRays-1);
      const tU=slU0+(slU1-slU0)*frac;
      const tV=slV0+(slV1-slV0)*frac;
      const endU=cx+(tU-cx)*expandEase;
      const endV=cy+(tV-cy)*expandEase;
      const dx=endU-cx, dy=endV-cy;
      const steps=Math.max(Math.abs(dx),Math.abs(dy),1)|0;
      if(steps<2) continue;
      for(let s=0;s<=steps;s++){
        const ft=s/steps;
        const u=Math.round(cx+dx*ft);
        const v=Math.round(cy+dy*ft);
        if(u<0||u>=S||v<0||v>=S) continue;
        const b=0.2+0.6*ft;
        setPx(u,v,cR*b,cG*b,cB*b);
      }
    }

    // Double scan: second scan line going opposite direction
    if(scanV2>=0){
      const scanDist2=scanV2-cy;
      const sCU2=cx-scanDist2*sinA, sCV2=cy+scanDist2*cosA;
      const sU20=sCU2+cosA*slHalf, sV20=sCV2+sinA*slHalf;
      const sU21=sCU2-cosA*slHalf, sV21=sCV2-sinA*slHalf;
      drawLine(sU20,sV20,sU21,sV21,slB*0.7);
      for(let dv=-2;dv<=2;dv++){
        if(dv===0) continue;
        const gb=(1-Math.abs(dv)/3)*0.12*expandEase;
        drawLine(sU20+normU*dv,sV20+normV*dv,sU21+normU*dv,sV21+normV*dv,gb);
      }
    }

    // Grid lines between rays (perspective) with optional wave
    function drawGrid(lineU0,lineU1,lineV0,lineV1,brightness){
      for(let hi=1;hi<=nHLines;hi++){
        const frac=hi/(nHLines+1);
        let pFrac=frac*frac;
        if(waveOffset>0){
          const wAmp=0.15*Math.sin(waveOffset*3-hi*0.8);
          pFrac=Math.max(0.01,Math.min(0.99,pFrac+wAmp));
        }
        for(let ri=0;ri<nRays-1;ri++){
          const fA=ri/(nRays-1), fB=(ri+1)/(nRays-1);
          const aU=lineU0+(lineU1-lineU0)*fA, aV=lineV0+(lineV1-lineV0)*fA;
          const bU=lineU0+(lineU1-lineU0)*fB, bV=lineV0+(lineV1-lineV0)*fB;
          const eaU=cx+(aU-cx)*expandEase, eaV=cy+(aV-cy)*expandEase;
          const ebU=cx+(bU-cx)*expandEase, ebV=cy+(bV-cy)*expandEase;
          const guA=cx+(eaU-cx)*pFrac, gvA=cy+(eaV-cy)*pFrac;
          const guB=cx+(ebU-cx)*pFrac, gvB=cy+(ebV-cy)*pFrac;
          drawLine(guA,gvA,guB,gvB,brightness);
        }
      }
    }
    if(expandEase>0.3){
      drawGrid(slU0,slU1,slV0,slV1,0.25*(expandEase-0.3)/0.7);
    }

    // Flat 2D grid overlay: scan line sweeps it into view
    if(_lgFlatT>=0 && _lgFlatT<flatTotalDur){
      const gridSpacing=Math.round(S/8);
      let flatAlpha=0, reach=0;
      if(_lgFlatT<flatSweepDur){
        reach=_lgFlatT/flatSweepDur;
        flatAlpha=0.4;
      } else if(_lgFlatT<flatSweepDur+flatHoldDur){
        reach=1;
        flatAlpha=0.4;
      } else {
        reach=1;
        flatAlpha=0.4*(1-(_lgFlatT-flatSweepDur-flatHoldDur)/flatFadeDur);
      }
      const maxDist=Math.round(reach*(S/2));
      for(let gi=1;gi<S/gridSpacing;gi++){
        const gv=gi*gridSpacing; if(gv>=S) continue;
        if(Math.abs(gv-Math.round(cy))>maxDist) continue;
        for(let u=0;u<S;u++) setPx(u,gv,cR*flatAlpha,cG*flatAlpha,cB*flatAlpha);
      }
      for(let gi=1;gi<S/gridSpacing;gi++){
        const gu=gi*gridSpacing; if(gu>=S) continue;
        for(let v=0;v<S;v++){
          if(Math.abs(v-Math.round(cy))>maxDist) continue;
          setPx(gu,v,cR*flatAlpha,cG*flatAlpha,cB*flatAlpha);
        }
      }
      if(_lgFlatT<flatSweepDur){
        const sw1=Math.round(cy-maxDist), sw2=Math.round(cy+maxDist);
        for(let u=0;u<S;u++){
          if(sw1>=0&&sw1<S) setPx(u,sw1,cR*0.8,cG*0.8,cB*0.8);
          if(sw2>=0&&sw2<S) setPx(u,sw2,cR*0.8,cG*0.8,cB*0.8);
        }
      }
    }

    // Center dot glow
    for(let dv=-2;dv<=2;dv++) for(let du=-2;du<=2;du++){
      const u=Math.round(cx)+du, v=Math.round(cy)+dv;
      if(u<0||u>=S||v<0||v>=S) continue;
      const r=Math.sqrt(du*du+dv*dv);
      const b=Math.max(0,1-r/2.5)*0.7;
      setPx(u,v,b,b*0.95,b);
    }

    // Bright dots where rays meet scan line
    for(let ri=0;ri<nRays;ri++){
      const frac=ri/(nRays-1);
      const tU=slU0+(slU1-slU0)*frac;
      const tV=slV0+(slV1-slV0)*frac;
      const eu=Math.round(cx+(tU-cx)*expandEase);
      const ev=Math.round(cy+(tV-cy)*expandEase);
      for(let ddv=-1;ddv<=1;ddv++) for(let ddu=-1;ddu<=1;ddu++){
        const u=eu+ddu, v=ev+ddv;
        if(u<0||u>=S||v<0||v>=S) continue;
        const r=Math.sqrt(ddu*ddu+ddv*ddv);
        const b=Math.max(0,1-r/1.5)*0.8*expandEase;
        setPx(u,v,cR*b,cG*b,cB*b);
      }
    }
  }

  if(panel2dMode){
    drawFace(function(u,v,r,g,b){
      const idx=faceMap[0][v*S+u]; if(idx<0) return;
      colBuf[idx*3]=Math.max(colBuf[idx*3],r);
      colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
      colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
    });
  } else {
    // 3D: one vanishing point, rays and scan line wrap across all 4+2 faces via fwPx
    const T=S*4, M=S-1;
    const ccx=Math.round(S/2);
    let _lgIsVert=false;
    function setPx3d(col,v,r,g,b){
      if(_lgIsVert){
        const c=((col%T)+T)%T;
        const qi=(c/S)|0;
        const fu=c%S;
        if(v>=0&&v<S&&(qi===1||qi===3)) return;
        if(v<0&&v>=-S) v=-(M-(-v-1))-1;
        if(v>=2*S||v<-S){
          col=2*S+(M-fu);
          v=v>=2*S ? 3*S-1-v : -v-S-1;
          if(v<0||v>=S) return;
          const idx2=cubePx(col,v); if(idx2<0) return;
          colBuf[idx2*3]=Math.max(colBuf[idx2*3],r);
          colBuf[idx2*3+1]=Math.max(colBuf[idx2*3+1],g);
          colBuf[idx2*3+2]=Math.max(colBuf[idx2*3+2],b);
          return;
        }
      }
      const idx=cubePx(col,v); if(idx<0) return;
      colBuf[idx*3]=Math.max(colBuf[idx*3],r);
      colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],g);
      colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],b);
    }
    function drawLine3d(x0,y0,x1,y1,bright){
      const ldx=x1-x0, ldy=y1-y0;
      const ls=Math.max(Math.abs(ldx),Math.abs(ldy),1)|0;
      for(let i=0;i<=ls;i++){
        const ft=i/ls;
        const u=Math.round(x0+ldx*ft), v=Math.round(y0+ldy*ft);
        if(v<-2*S||v>=3*S) continue;
        setPx3d(u,v,cR*bright,cG*bright,cB*bright);
      }
    }

    // Single center point on front face always
    // Horizontal: bar spans all 4 side faces, scan sweeps vertically
    // Vertical: bar spans top+front+bottom, scan sweeps across front+back only
    const absS=Math.abs(sinA), absC=Math.abs(cosA);
    _lgIsVert=absS>absC;
    // Horizontal: scan sweeps vertically (v). Vertical: scan sweeps horizontally (col) across the face.
    const scanFrac=(scanV-cy)/((S-1)/2); // -1 to +1
    const scanCU3d=_lgIsVert ? ccx+scanFrac*((S-1)/2) : ccx;
    const scanCV3d=_lgIsVert ? cy : scanV;
    // Bar extends along its rotated direction from the scan point
    // Horizontal: extends ±T/2 in col; Vertical: extends ±S*2.5 in v (full ring: front+top+back+bottom)
    const barHalfU=cosA*(T/2);
    const barHalfV=sinA*(S*2.5);
    const sl3U0=scanCU3d+barHalfU, sl3V0=scanCV3d+barHalfV;
    const sl3U1=scanCU3d-barHalfU, sl3V1=scanCV3d-barHalfV;

    // Full scan line
    const slB3=0.9*expandEase;
    const normU3=-sinA, normV3=cosA;
    drawLine3d(sl3U0,sl3V0,sl3U1,sl3V1,slB3);
    for(let dv=-3;dv<=3;dv++){
      if(dv===0) continue;
      const gb=(1-Math.abs(dv)/4)*0.18*expandEase;
      drawLine3d(sl3U0+normU3*dv,sl3V0+normV3*dv,sl3U1+normU3*dv,sl3V1+normV3*dv,gb);
    }

    // Double scan: second scan line in 3D
    if(scanV2>=0){
      const sf2=(scanV2-cy)/((S-1)/2);
      const sCU2=_lgIsVert?ccx+sf2*((S-1)/2):ccx;
      const sCV2=_lgIsVert?cy:scanV2;
      const s2U0=sCU2+barHalfU, s2V0=sCV2+barHalfV;
      const s2U1=sCU2-barHalfU, s2V1=sCV2-barHalfV;
      drawLine3d(s2U0,s2V0,s2U1,s2V1,slB3*0.7);
      for(let dv=-2;dv<=2;dv++){
        if(dv===0) continue;
        const gb=(1-Math.abs(dv)/3)*0.12*expandEase;
        drawLine3d(s2U0+normU3*dv,s2V0+normV3*dv,s2U1+normU3*dv,s2V1+normV3*dv,gb);
      }
    }

    // Rays from single center to scan line
    const nRays3d=6;
    for(let ri=0;ri<nRays3d;ri++){
      const frac=ri/(nRays3d-1);
      const tU=sl3U0+(sl3U1-sl3U0)*frac;
      const tV=sl3V0+(sl3V1-sl3V0)*frac;
      const endU=ccx+(tU-ccx)*expandEase;
      const endV=cy+(tV-cy)*expandEase;
      const dx=endU-ccx, dy=endV-cy;
      const steps=Math.max(Math.abs(dx),Math.abs(dy),1)|0;
      if(steps<2) continue;
      for(let s=0;s<=steps;s++){
        const ft=s/steps;
        const u=Math.round(ccx+dx*ft);
        const v=Math.round(cy+dy*ft);
        const b=0.2+0.6*ft;
        setPx3d(u,v,cR*b,cG*b,cB*b);
      }
    }

    // Grid lines between rays (perspective) with optional wave
    if(expandEase>0.3){
      const gridB3=0.25*(expandEase-0.3)/0.7;
      for(let hi=1;hi<=nHLines;hi++){
        const frac=hi/(nHLines+1);
        let pFrac=frac*frac;
        if(waveOffset>0){
          const wAmp=0.15*Math.sin(waveOffset*3-hi*0.8);
          pFrac=Math.max(0.01,Math.min(0.99,pFrac+wAmp));
        }
        for(let ri=0;ri<nRays3d-1;ri++){
          const fA=ri/(nRays3d-1), fB=(ri+1)/(nRays3d-1);
          const aU=sl3U0+(sl3U1-sl3U0)*fA, aV=sl3V0+(sl3V1-sl3V0)*fA;
          const bU=sl3U0+(sl3U1-sl3U0)*fB, bV=sl3V0+(sl3V1-sl3V0)*fB;
          const eaU=ccx+(aU-ccx)*expandEase, eaV=cy+(aV-cy)*expandEase;
          const ebU=ccx+(bU-ccx)*expandEase, ebV=cy+(bV-cy)*expandEase;
          const guA=ccx+(eaU-ccx)*pFrac, gvA=cy+(eaV-cy)*pFrac;
          const guB=ccx+(ebU-ccx)*pFrac, gvB=cy+(ebV-cy)*pFrac;
          drawLine3d(guA,gvA,guB,gvB,gridB3);
        }
      }
    }

    // Center dot glow (single point on front face)
    for(let dv=-2;dv<=2;dv++) for(let du=-2;du<=2;du++){
      const v=Math.round(cy)+dv;
      if(v<0||v>=S) continue;
      const r=Math.sqrt(du*du+dv*dv);
      const b=Math.max(0,1-r/2.5)*0.7;
      setPx3d(ccx+du,v,b,b*0.95,b);
    }

    // Bright dots where rays meet scan line
    for(let ri=0;ri<nRays3d;ri++){
      const frac=ri/(nRays3d-1);
      const tU=sl3U0+(sl3U1-sl3U0)*frac;
      const tV=sl3V0+(sl3V1-sl3V0)*frac;
      const eu=Math.round(ccx+(tU-ccx)*expandEase);
      const ev=Math.round(cy+(tV-cy)*expandEase);
      for(let ddv=-1;ddv<=1;ddv++) for(let ddu=-1;ddu<=1;ddu++){
        const v=ev+ddv;
        if(v<-2*S||v>=3*S) continue;
        const r=Math.sqrt(ddu*ddu+ddv*ddv);
        const b=Math.max(0,1-r/1.5)*0.8*expandEase;
        setPx3d(eu+ddu,v,cR*b,cG*b,cB*b);
      }
    }

    // Flat 2D grid overlay (always on all 4 side faces)
    if(_lgFlatT>=0 && _lgFlatT<flatTotalDur){
      const gridSpacing=Math.round(S/8);
      let flatAlpha=0, reach=0;
      if(_lgFlatT<flatSweepDur){
        reach=_lgFlatT/flatSweepDur;
        flatAlpha=0.4;
      } else if(_lgFlatT<flatSweepDur+flatHoldDur){
        reach=1;
        flatAlpha=0.4;
      } else {
        reach=1;
        flatAlpha=0.4*(1-(_lgFlatT-flatSweepDur-flatHoldDur)/flatFadeDur);
      }
      const maxDist=Math.round(reach*(S/2));
      for(let gi=1;gi<S/gridSpacing;gi++){
        const gv=gi*gridSpacing; if(gv>=S) continue;
        if(Math.abs(gv-Math.round(cy))>maxDist) continue;
        for(let col=0;col<T;col++) setPx3d(col,gv,cR*flatAlpha,cG*flatAlpha,cB*flatAlpha);
      }
      for(let gi=0;gi<T/gridSpacing;gi++){
        const gu=gi*gridSpacing;
        for(let v=0;v<S;v++){
          if(Math.abs(v-Math.round(cy))>maxDist) continue;
          setPx3d(gu,v,cR*flatAlpha,cG*flatAlpha,cB*flatAlpha);
        }
      }
      if(_lgFlatT<flatSweepDur){
        const sw1=Math.round(cy-maxDist), sw2=Math.round(cy+maxDist);
        for(let col=0;col<T;col++){
          if(sw1>=0&&sw1<S) setPx3d(col,sw1,cR*0.8,cG*0.8,cB*0.8);
          if(sw2>=0&&sw2<S) setPx3d(col,sw2,cR*0.8,cG*0.8,cB*0.8);
        }
      }
    }
  }
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
