// ═══════════════════════════════════════════════════
//  effects-scenes.js — Scenes & Lighting (lazy-loaded)
//  ghost, custom_cube
// ═══════════════════════════════════════════════════

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
