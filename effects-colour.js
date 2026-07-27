// ═══════════════════════════════════════════════════
//  effects-colour.js — Colour & Gradients (lazy-loaded)
//  gradient_wash, depth_rings, prism, tide
// ═══════════════════════════════════════════════════

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
