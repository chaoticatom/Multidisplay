// ═══════════════════════════════════════════════════
//  effects-core.js — shared infrastructure, eager-loaded
//  (overlay engine, gallery/word-cascade shared engines, image
//  loader, audio/spectrum + internet radio subsystem, misc shared
//  cross-category helpers). See CLAUDE.md "Writing Effects".
// ═══════════════════════════════════════════════════
var currentEffect = 'wave';

// ═══════════════════════════════════════════════════
//  CUBE PIXEL MAPPING — unified (col, v) → LED index
//  col wraps horizontally across 4 side faces (0..S*4-1)
//  v is vertical: 0..S-1 = side faces, v>=S = top face, v<0 = bottom face
//  FW_FACES = [0,2,1,3] — clockwise physical face order
// ═══════════════════════════════════════════════════
const FW_FACES = [0,2,1,3];

function cubePx(col, v) {
  const S = SIZE, T = S * 4, M = S - 1;
  const c = ((col % T) + T) % T;
  const qi = (c / S) | 0;
  const fu = c % S;
  if (v >= 0 && v < S) return faceMap[FW_FACES[qi]][v * S + fu];
  if (v >= S) {
    const ov = v - S;
    if (ov >= S) return -1;
    // Top face: continue from side face top edge onto face 4
    // Derived from surfIdx mapping: face4[z*S+x] where (z,x) depend on which side face
    if (qi === 0) return faceMap[4][(M - ov) * S + fu];        // face0 z=M: z decreases, x=fu
    if (qi === 1) return faceMap[4][(M - fu) * S + (M - ov)];  // face2 x=M: x side, z=M-fu
    if (qi === 2) return faceMap[4][ov * S + (M - fu)];         // face1 z=0: z increases, x=M-fu
    return faceMap[4][fu * S + ov];                             // face3 x=0: z=fu, x increases
  }
  // v < 0: bottom face (face 5)
  const ov = -v - 1;
  if (ov >= S) return -1;
  if (qi === 0) return faceMap[5][ov * S + fu];
  if (qi === 1) return faceMap[5][fu * S + (M - ov)];
  if (qi === 2) return faceMap[5][(M - ov) * S + (M - fu)];
  return faceMap[5][(M - fu) * S + ov];
}

function fwPx(col, v) { return cubePx(col, v); }

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

// ── TIME & DATE ──
const DT_RES=512;  // Higher resolution for crisp text on 64×64 LEDs
// When set (panel editor / custom cube), single-face effects draw onto this face
let _peTargetFace=-1;
let _peTargetOpts=null;

// ═══════════════════════════════════════════════════
//  SPECTRUM ANALYSER / VU METER
//  Simulated music engine + optional live microphone
// ═══════════════════════════════════════════════════
let spectrumBandOverride = 64; // can be set by UI to 8, 16, 32, 64, 128, 256
let spectrumFitToScreen = false;
let auFitScale = 1;
// Fit to Screen: rescales the bar-style displays (bars/mirror/dots/blocks/
// outline) each frame so the loudest current band reaches near the top of
// the face, instead of however tall the raw level + Gain happen to land.
// Smoothed so it doesn't visibly pump on every transient.
function auUpdateFitScale(){
  if(!spectrumFitToScreen){ auFitScale=1; return; }
  const AB=spectrumBandOverride||AUDIO_BANDS;
  let mx=0;
  for(let b=0;b<AB;b++){ if(auSpec[b]>mx) mx=auSpec[b]; }
  const target = mx>0.015 ? Math.min(3.5, 0.94/mx) : auFitScale;
  auFitScale += (target-auFitScale)*0.12;
}
function auAmp(b){ return Math.min(1, auSpec[b]*auFitScale); }
function auPk(b){ return Math.min(1, auPeak[b]*auFitScale); }
const AUDIO_BANDS = 256; // headroom for the finer 128/200-band presets
let auSpec  = new Float32Array(AUDIO_BANDS);   // smoothed band levels 0..1
let auPeak  = new Float32Array(AUDIO_BANDS);   // falling peak-hold dots
let auPeakV = new Float32Array(AUDIO_BANDS);
let auStyle = 'bars', auTheme = 6, auGain = 1, auBarMode = 'solid';
let auAutoGainOn = false, auAutoGainMult = 1;
let auScrollX=0, auScrollSpeed=0, auScrollDir=1;
let wfBuf=null, wfPos=0, wfTimer=0;
let stormFlashes=[];
let songT = 0, auRings = [], auPrevBass = 0;
let vuL=0, vuR=0, vuPkL=0, vuPkR=0, vuPkVL=0, vuPkVR=0;
let micOn=false, auCtx=null, auAnalyser=null, micBuf=null;

// ═══════════════════════════════════════════════════
//  Spectrum data pipeline — rewritten clean, standard analyzer behavior:
//  log-spaced non-overlapping bins (bass gets finer resolution, same as
//  real hardware analyzers), a fixed per-band treble-compensation curve
//  (music naturally has less energy at high frequencies — real analyzers
//  apply exactly this kind of fixed EQ curve rather than auto-gain
//  trickery), a plain manual Gain slider, and simple attack/release
//  smoothing with peak-hold dots. No auto-gain, no spatial blur — turn the
//  Gain slider to taste, same as a real device's gain knob.
// ═══════════════════════════════════════════════════
function auSmooth(b, target, dt){
  if(target > auSpec[b]) auSpec[b] += (target-auSpec[b])*Math.min(1, dt*20);   // fast attack
  else                   auSpec[b] += (target-auSpec[b])*Math.min(1, dt*7);    // moderate release
  if(auSpec[b] > auPeak[b]){ auPeak[b]=auSpec[b]; auPeakV[b]=0; }
  else { auPeakV[b]+=dt*1.2; auPeak[b]=Math.max(0, auPeak[b]-auPeakV[b]*dt); }  // slow peak-hold fall
}

// No real audio source active (mic off, radio not playing) — ease every
// band down to zero instead of running a fake simulated track.
function auFlatten(dt){
  for(let b=0;b<AUDIO_BANDS;b++) auSmooth(b, 0, dt);
}

let auLastLevel = 0;   // coarse "is anything actually playing" signal — see radioAnalyserSilent
function readMicSpectrum(dt){
  auAnalyser.getByteFrequencyData(micBuf);
  songT += dt;
  const AB=AUDIO_BANDS, nb=micBuf.length, minBin=1, maxBin=nb-1;
  let level=0;
  let lo=minBin;
  // Auto Gain: a slow-adapting overall multiplier (separate from the
  // manual Gain slider) that nudges toward a target overall loudness —
  // rises when the source is quiet, eases back when it's already hot.
  // Deliberately slow (per-second, not per-band) so it can't "pin to the
  // top" the way the old per-band peak-tracking auto-gain used to.
  if(auAutoGainOn){
    const target=0.55;
    if(auLastLevel>0.01){
      const desired=target/Math.max(0.05, auLastLevel*auAutoGainMult);
      auAutoGainMult += (desired-auAutoGainMult)*Math.min(1, dt*0.5);
      auAutoGainMult = Math.max(0.3, Math.min(4, auAutoGainMult));
    }
  } else {
    auAutoGainMult = 1;
  }
  const gain=auGain*auAutoGainMult;
  for(let b=0;b<AB;b++){
    const frac=(b+1)/AB;
    let hi=Math.round(minBin*Math.pow(maxBin/minBin, frac));
    if(hi<=lo) hi=lo+1;
    hi=Math.min(hi, maxBin);
    let sum=0, count=0;
    for(let k=lo;k<=hi;k++){ sum+=micBuf[k]; count++; }
    const raw=count>0?(sum/count)/255:0;
    if(raw>level) level=raw;
    // Fixed treble boost curve — compensates for real music having
    // progressively less energy at higher frequencies, same idea as the
    // "loudness" curve on a real analyzer, not per-band auto-gain.
    const trebleBoost=1+frac*1.8;
    auSmooth(b, Math.min(1, raw*trebleBoost*gain), dt);
    lo=hi+1;
    if(lo>maxBin) lo=maxBin;
  }
  auLastLevel += (level-auLastLevel)*Math.min(1,dt*3);
}

// Sound-source controls (mic/phone buttons + status) can appear in more
// than one panel now (the Spectrum Analyser panel, and any other effect's
// panel that's shown the "Spectrum Analyser overlay" controls) — these set
// every matching element rather than one fixed ID, same pattern as the
// radio-*-el classes.
function micSetUI(btnText, statusText){
  document.querySelectorAll('.mic-btn-el').forEach(b=>b.textContent=btnText);
  document.querySelectorAll('.mic-status-el').forEach(s=>s.textContent=statusText);
}
function phoneSetUI(btnText, statusText){
  document.querySelectorAll('.phone-audio-btn-el').forEach(b=>b.textContent=btnText);
  document.querySelectorAll('.phone-audio-status-el').forEach(s=>s.textContent=statusText);
}

// Real stereo for the VU meter style: splits whatever source node is
// playing into left/right channels and runs a small time-domain analyser
// on each, so the VU meter reflects the actual left/right levels instead
// of faking a left/right difference from a single mono level. A genuinely
// mono source (most phone mics, some stations) will just show matching L/R
// levels, which is the correct, honest result rather than an artificial one.
let auAnalyserL=null, auAnalyserR=null, auVuBufL=null, auVuBufR=null;
function auSetupStereoAnalysers(sourceNode){
  const splitter=auCtx.createChannelSplitter(2);
  sourceNode.connect(splitter);
  auAnalyserL=auCtx.createAnalyser(); auAnalyserL.fftSize=256; auAnalyserL.smoothingTimeConstant=0.2;
  auAnalyserR=auCtx.createAnalyser(); auAnalyserR.fftSize=256; auAnalyserR.smoothingTimeConstant=0.2;
  splitter.connect(auAnalyserL,0);
  splitter.connect(auAnalyserR,1);
  auVuBufL=new Uint8Array(auAnalyserL.fftSize);
  auVuBufR=new Uint8Array(auAnalyserR.fftSize);
}
function auReadStereoLevels(){
  if(!auAnalyserL||!auAnalyserR) return {l:0,r:0};
  auAnalyserL.getByteTimeDomainData(auVuBufL);
  auAnalyserR.getByteTimeDomainData(auVuBufR);
  let sl=0, sr=0;
  for(let i=0;i<auVuBufL.length;i++){ const v=(auVuBufL[i]-128)/128; sl+=v*v; }
  for(let i=0;i<auVuBufR.length;i++){ const v=(auVuBufR[i]-128)/128; sr+=v*v; }
  return {l:Math.sqrt(sl/auVuBufL.length), r:Math.sqrt(sr/auVuBufR.length)};
}

async function toggleMic(){
  if(micOn){ micOn=false; micSetUI('🎤 Use Microphone', 'Mic off — bars idle'); return; }
  if(phoneAudioOn) stopPhoneAudio();
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    auCtx = auCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(auCtx.state==='suspended') await auCtx.resume();
    const src=auCtx.createMediaStreamSource(stream);
    auAnalyser=auCtx.createAnalyser();
    auAnalyser.fftSize=2048; auAnalyser.smoothingTimeConstant=0.45;
    src.connect(auAnalyser);
    micBuf=new Uint8Array(auAnalyser.frequencyBinCount);
    auSetupStereoAnalysers(src);
    micOn=true; micSetUI('🎤 Mic LIVE — tap to stop', 'Source: microphone');
  }catch(e){ micSetUI('🎤 Use Microphone', 'Mic unavailable — bars idle'); }
}

// Phone-as-sound-source: a Bluetooth phone connected directly to the Pi
// (see pi/README.md's "phone → Pi → speaker + visualizer" section), routed
// by pi/bluetooth_server.py into a stable-named "phone_capture" input
// device the browser can select like any other microphone. Same analyser
// pipeline as toggleMic() — just a different getUserMedia deviceId.
let phoneAudioOn=false, phoneAudioStream=null;
function stopPhoneAudio(){
  phoneAudioOn=false;
  if(phoneAudioStream){ phoneAudioStream.getTracks().forEach(t=>t.stop()); phoneAudioStream=null; }
  phoneSetUI('📱 Use Phone (Bluetooth)', 'Phone audio off — bars idle');
}
async function togglePhoneAudio(){
  if(phoneAudioOn){ stopPhoneAudio(); return; }
  if(micOn) toggleMic();
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const dev=devices.find(d=>d.kind==='audioinput' && /phone_capture/i.test(d.label));
    if(!dev){
      phoneSetUI('📱 Use Phone (Bluetooth)', 'Phone capture device not found — pair the phone and click "Route Phone Audio to Speaker" in Setup first');
      return;
    }
    const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:dev.deviceId}}});
    phoneAudioStream=stream;
    auCtx = auCtx || new (window.AudioContext||window.webkitAudioContext)();
    if(auCtx.state==='suspended') await auCtx.resume();
    const src=auCtx.createMediaStreamSource(stream);
    auAnalyser=auCtx.createAnalyser();
    auAnalyser.fftSize=2048; auAnalyser.smoothingTimeConstant=0.45;
    src.connect(auAnalyser);
    micBuf=new Uint8Array(auAnalyser.frequencyBinCount);
    auSetupStereoAnalysers(src);
    micOn=true; phoneAudioOn=true;
    phoneSetUI('📱 Phone LIVE — tap to stop', 'Source: phone (Bluetooth)');
  }catch(e){
    phoneSetUI('📱 Use Phone (Bluetooth)', 'Phone audio unavailable: '+(e&&e.message||'error'));
  }
}

// ── Colour themes: fb=band fraction, fh=height fraction, amp=level ──
function auColor(fb, fh, amp){
  switch(auTheme){
    case 1:  return hsl(0.02+fh*0.12, 1,    0.16+fh*0.42+amp*0.08);                    // Fire
    case 2:  return hsl(0.62-fh*0.14, 0.95, 0.16+fh*0.40+amp*0.08);                    // Ocean
    case 3:  return hsl(((fb*AUDIO_BANDS)|0)%2 ? 0.86 : 0.5, 1, 0.22+fh*0.35+amp*0.1); // Neon
    case 4:  return hsl(0.34, 1, 0.10+fh*0.50+amp*0.06);                               // Matrix
    case 5:  return hsl(fb*0.85+t*0.05, 0.55, 0.35+fh*0.35+amp*0.08);                 // Pastel
    case 6: {                                                                          // VU Meter
      // Smooth hue sweep bottom-to-top: green -> yellow over most of the
      // bar's height, red reserved for just the top ~25% — two linear
      // segments meeting at the yellow point, so it's still one continuous
      // gradient (no visible seam), just weighted toward yellow overall.
      const yellowAt=0.75;
      const hue = fh<yellowAt
        ? 0.34-(0.34-0.15)*(fh/yellowAt)
        : 0.15-0.15*((fh-yellowAt)/(1-yellowAt));
      const light = Math.min(0.72, 0.20+fh*0.34+amp*0.18);
      return hsl(hue, 1, light);
    }
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

// Dotted trail: every dot glows (not just the tip), spacing pulses subtly
// with the level so a loud passage feels denser, and the lead dot gets a
// bright core + soft halo instead of a flat colour swatch.
function drawDotsStyle(){
  const S=SIZE, M=S-1;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=panel2dMode?SIZE:4*S; // single visible face in 2D mode gets all the bands, not a quarter of them
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const amp=auAmp(b), fb=b/(AB-1);
    const fu=sideCol(c), face=fu[0], u=fu[1];
    const h=amp*M;
    const ly=Math.min(M,Math.round(h));
    const spacing=Math.max(2,3-Math.round(amp*1.4));   // tighter dots when loud
    for(let y=0;y<=ly;y+=spacing){
      const fh=ly>0?y/ly:0;
      const col=auColor(fb,fh,amp);
      const isLead=(y+spacing>ly);
      const fade=isLead?1:0.35+0.45*fh;
      setFaceLED(face,u,y,col[0]*fade,col[1]*fade,col[2]*fade);
      if(isLead){ auBloom(face,u,y,col,1.3); auGlowAround(face,u,y,col,2,0.4); }
    }
    // Peak dot — bright glowing cap, tinted by the bar's own colour
    const peakY=Math.min(M,Math.round(auPk(b)*M));
    auDrawPeakCap(face,u,peakY,auColor(fb,1,amp));
  }
  drawPolarFace(4); drawPolarFace(5);
}

function drawBlocksStyle(){
  const S=SIZE, M=S-1, BLOCK=4;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=panel2dMode?SIZE:4*S; // single visible face in 2D mode gets all the bands, not a quarter of them
  const bandW=Math.max(1,Math.floor(cols/AB));
  // Leave a 1-column gap between blocks when there's room for one, but not
  // when bandW is already 1 (bands === cols) — dc<bandW-1 would then loop
  // zero times and draw nothing at all.
  const dcMax = bandW>1 ? bandW-1 : 1;
  for(let b=0;b<AB;b++){
    const amp=auAmp(b), fb=b/(AB-1);
    const blocks=Math.round(amp*(S/BLOCK));
    for(let blk=0;blk<blocks;blk++){
      const fh=blocks>0?blk/blocks:0;
      const col=auColor(fb,fh,amp);
      const isTopBlock=(blk===blocks-1);
      const yBase=blk*BLOCK;
      for(let dy=0;dy<BLOCK-1;dy++){
        const y=yBase+dy; if(y>=S) break;
        // Cheap per-block bevel: brighter centre, dimmer top/bottom edge —
        // reads as a lit cell with real depth instead of a flat rectangle.
        const cellFrac=dy/(BLOCK-2||1);
        const bevel=0.6+0.4*Math.sin(cellFrac*Math.PI);
        for(let dc=0;dc<dcMax;dc++){
          const c=b*bandW+dc; if(c>=cols) break;
          const fu=sideCol(c);
          setFaceLED(fu[0],fu[1],y,col[0]*bevel,col[1]*bevel,col[2]*bevel);
        }
      }
      // The topmost lit block on each bar gets a soft glow, so the bar
      // reads as actively lit rather than a static stack of tiles.
      if(isTopBlock){
        for(let dc=0;dc<dcMax;dc++){
          const c=b*bandW+dc; if(c>=cols) break;
          const fu=sideCol(c);
          auGlowAround(fu[0],fu[1],yBase+1,col,2,0.3);
        }
      }
    }
    // Peak block — bright glowing cap tinted by the bar's own colour
    const pkBlk=Math.round(auPk(b)*(S/BLOCK));
    const pkY=pkBlk*BLOCK;
    const tint=auColor(fb,1,amp);
    for(let dy=0;dy<BLOCK-1;dy++){
      const y=pkY+dy; if(y>=S) break;
      for(let dc=0;dc<dcMax;dc++){
        const c=b*bandW+dc; if(c>=cols) break;
        const fu=sideCol(c);
        auBloom(fu[0],fu[1],y,tint,1.3);
      }
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// Glowing silhouette: a continuous line across the spectrum's top edge
// (interpolated between columns, not one isolated blob per column), a
// faint colour-graded fill underneath so it reads as a filled area chart,
// and a proper glowing peak cap.
function drawOutlineStyle(){
  const S=SIZE, M=S-1;
  let AB=spectrumBandOverride||AUDIO_BANDS;
  let cols=panel2dMode?SIZE:4*S; // single visible face in 2D mode gets all the bands, not a quarter of them
  const pts=new Float32Array(cols);
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    pts[c]=auAmp(b)*M;
  }
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const fb=b/(AB-1), amp=auAmp(b);
    const fu=sideCol(c), face=fu[0], u=fu[1];
    const yHere=pts[c], yNext=pts[(c+1)%cols];
    const y0=Math.round(yHere);
    const col=auColor(fb,1,amp);

    // Faint gradient fill from baseline up to the line — subtle, so the
    // glowing edge stays the focal point.
    for(let y=0;y<y0;y++){
      const fh=y0>0?y/y0:0;
      const fillCol=auColor(fb,fh,amp);
      setFaceLED(face,u,y,fillCol[0]*0.12,fillCol[1]*0.12,fillCol[2]*0.12);
    }

    // Interpolated edge segment toward the next column, so the silhouette
    // reads as one continuous line rather than disconnected column tips.
    const steps=Math.max(1,Math.abs(Math.round(yNext-yHere)));
    for(let s=0;s<=steps;s++){
      const yy=Math.round(yHere+(yNext-yHere)*(s/steps));
      if(yy<0||yy>M) continue;
      setFaceLED(face,u,yy,Math.min(1,col[0]*1.3),Math.min(1,col[1]*1.3),Math.min(1,col[2]*1.3));
    }
    auGlowAround(face,u,y0,col,3,0.45);

    auDrawPeakCap(face,u,Math.min(M,Math.round(auPk(b)*M)),col);
  }
  drawPolarFace(4); drawPolarFace(5);
}

// Blends a bright core pixel plus a soft 2px bloom above/around it — the
// glow that makes LED bar tips and peak caps read as genuinely lit rather
// than a flat colour swatch. Additive (never darkens what's already there).
function auBloom(face,u,y,col,coreAmt){
  if(y<0||y>=SIZE||u<0||u>=SIZE) return;
  const c0=Math.min(1,col[0]*coreAmt), c1=Math.min(1,col[1]*coreAmt), c2=Math.min(1,col[2]*coreAmt);
  const idx=faceMap[face][y*SIZE+u]; if(idx<0) return;
  colBuf[idx*3]=Math.max(colBuf[idx*3],c0);
  colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],c1);
  colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],c2);
}
function auGlowAround(face,u,y,col,spread,strength){
  for(let g=1;g<=spread;g++){
    const fade=strength*(1-g/(spread+1));
    for(const dy of [g,-g]){
      const yy=y+dy; if(yy<0||yy>=SIZE) continue;
      const idx=faceMap[face][yy*SIZE+u]; if(idx<0) continue;
      const r=col[0]*fade, g2=col[1]*fade, b=col[2]*fade;
      if(r>colBuf[idx*3])   colBuf[idx*3]=r;
      if(g2>colBuf[idx*3+1])colBuf[idx*3+1]=g2;
      if(b>colBuf[idx*3+2]) colBuf[idx*3+2]=b;
    }
  }
}

// Peak cap: a small glowing diamond instead of one flat white pixel —
// bright core, soft halo, tinted faintly by the bar's own colour so it
// doesn't look like a disconnected sticker on top.
function auDrawPeakCap(face,u,y,tint){
  const glow=[0.55+tint[0]*0.45,0.55+tint[1]*0.45,0.55+tint[2]*0.45];
  auBloom(face,u,y,glow,1);
  auGlowAround(face,u,y,glow,2,0.35);
}

function drawBandBars(mirror){
  const S=SIZE, M=S-1, mode=auBarMode;
  let AB = spectrumBandOverride || AUDIO_BANDS;
  let cols = panel2dMode ? SIZE : 4*S; // single visible face in 2D mode gets all the bands, not a quarter of them
  const barW = Math.round(cols/AB);
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    // Only insert a gap column between bars when there's room for one —
    // at barW===1 (bands === cols, e.g. 64 bands on a 64-wide face) every
    // column IS a bar, so skipping "the last column of each bar" would
    // skip every single column and draw nothing at all.
    if(S>8 && barW>1 && c%barW===barW-1) continue;
    const amp=auAmp(b), fb=b/(AB-1);
    const fu=sideCol(c), face=fu[0], u=fu[1];

    if(mirror){
      const mid=(S-1)/2, half=amp*S*0.5;
      for(let y=0;y<S;y++){
        const d=Math.abs(y-mid);
        if(d<=half){
          const fh=half>0?1-d/half:0;
          const edgeSoft=Math.min(1,(half-d+1)*0.6);   // soft fade at the tips
          const col=auColor(fb,fh,amp);
          if(mode==='striped'&&(y&1)) setFaceLED(face,u,y,col[0]*0.15,col[1]*0.15,col[2]*0.15);
          else setFaceLED(face,u,y,col[0]*edgeSoft,col[1]*edgeSoft,col[2]*edgeSoft);
        }
      }
      const pk=auPk(b)*S*0.5;
      const tint=auColor(fb,1,amp);
      auDrawPeakCap(face,u,Math.min(M,Math.round(mid+pk)),tint);
      auDrawPeakCap(face,u,Math.max(0,Math.round(mid-pk)),tint);
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
        const tipY=Math.max(0,M-hi);
        auBloom(face,u,tipY,tp,1.5);
        auGlowAround(face,u,tipY,tp,2,0.3);
      }
      auDrawPeakCap(face,u,Math.max(0,M-Math.round(auPk(b)*M)),auColor(fb,1,amp));

    } else if(mode==='center'){
      const mid=(S-1)/2, half=rawH*0.5;
      for(let y=0;y<S;y++){
        const d=Math.abs(y-mid);
        if(d<=half){
          const fh=half>0?1-d/half:0;
          const edgeSoft=Math.min(1,(half-d+1)*0.6);
          const col=auColor(fb,fh,amp);
          setFaceLED(face,u,y,col[0]*edgeSoft,col[1]*edgeSoft,col[2]*edgeSoft);
        }
      }
      const pk=auPk(b)*M*0.5;
      const tint=auColor(fb,1,amp);
      auDrawPeakCap(face,u,Math.min(M,Math.round(mid+pk)),tint);
      auDrawPeakCap(face,u,Math.max(0,Math.round(mid-pk)),tint);

    } else if(mode==='stacked'){
      // LED-cell look: each segment brighter in its centre, dimmer at its
      // own top/bottom edge (a cheap per-cell bevel), with a real gap
      // between cells so they read as individual lit blocks, not one bar.
      const SEG=4;
      const segs=Math.round(rawH/SEG);
      for(let s=0;s<segs;s++){
        const yBase=s*SEG;
        const fh=segs>0?s/segs:0;
        const col=auColor(fb,fh,amp);
        for(let dy=0;dy<SEG-1;dy++){
          const y=yBase+dy; if(y>M) break;
          const cellFrac=dy/(SEG-2||1);
          const bevel=0.55+0.45*Math.sin(cellFrac*Math.PI);
          setFaceLED(face,u,y,col[0]*bevel,col[1]*bevel,col[2]*bevel);
        }
      }
      const pkSeg=Math.round(auPk(b)*M/SEG);
      const tint=auColor(fb,1,amp);
      for(let dy=0;dy<SEG-1;dy++){
        const y=pkSeg*SEG+dy; if(y>M) break;
        auBloom(face,u,y,tint,1.3);
      }

    } else {
      // solid, striped, wave
      const h=rawH+waveOff, hi=Math.max(0,Math.min(M,Math.round(h)));
      const frac=h-Math.floor(h);   // sub-pixel remainder for a softer tip
      for(let y=0;y<=hi;y++){
        const fh=hi>0?y/hi:0;
        const col=auColor(fb,fh,amp);
        if(mode==='striped'&&(y&1)){
          setFaceLED(face,u,y,col[0]*0.15,col[1]*0.15,col[2]*0.15);
        } else {
          const isTip=(y===hi);
          const bright=isTip?Math.max(0.35,frac):1;
          setFaceLED(face,u,y,col[0]*bright,col[1]*bright,col[2]*bright);
        }
      }
      if(h>0){
        const tp=auColor(fb,1,amp);
        auBloom(face,u,hi,tp,1.5);
        auGlowAround(face,u,hi,tp,3,0.4);
      }
      auDrawPeakCap(face,u,Math.max(0,Math.min(M,Math.round(auPk(b)*M+waveOff))),auColor(fb,1,amp));
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
    for(let b=0;b<AB;b++) wfBuf[wfPos*AB+b]=auAmp(b);
    wfPos=(wfPos+1)%S;
  }
  for(let row=0;row<S;row++){
    const hist=(wfPos-1-row+S)%S;
    const age=row/S;
    const fade=(1-age*0.72)**1.3;   // steeper falloff reads as depth, not a flat gradient
    for(let c=0;c<cols;c++){
      const b=scrolledBand(c,cols,AB);
      const amp=wfBuf[hist*AB+b];
      if(amp<0.035) continue;
      const fu=sideCol(c);
      const bright=amp*fade;
      const [r,g,bv]=auColor(b/(AB-1),amp,amp);
      setFaceLED(fu[0],fu[1],S-1-row,r*bright*1.4,g*bright*1.4,bv*bright*1.4);
      // Freshest row gets a soft bloom so new hits punch through the trail
      if(row===0 && amp>0.3) auBloom(fu[0],fu[1],S-1-row,[r,g,bv],1.2);
    }
  }
  drawPolarFace(4); drawPolarFace(5);
}

// ── Waveform (single trace wrapping the perimeter) ──
// Static flat line centred vertically at rest. Each column's real
// frequency-band amplitude (auAmp — the same per-band data the working
// bar styles read) modulates a smooth spatial sine, so the line bows
// above AND below centre in a continuous synthwave-style curve rather
// than one-directional spikes. The sine's phase is purely spatial (a
// function of column, not of time), so there's no self-driven motion —
// the curve only moves because the sound does. auScrollX still applies
// (so the existing Scroll Speed control keeps working) but that's 0/off
// by default, so it sits still until you enable it.
function drawWaveformStyle(dt){
  const S=SIZE, M=S-1, AB=AUDIO_BANDS, cols=4*S, mid=M/2;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.80;
  for(let c=0;c<cols;c++){
    const sc=(c+(auScrollX|0)+cols)%cols;
    const b=scrolledBand(sc,cols,AB);
    const amp=auAmp(b)*Math.sin(sc*0.35);
    const y=Math.round(mid-amp*mid*0.9);
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
  const bass=(auAmp(0)+auAmp(1)+auAmp(2))/3;
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
      const amp=auAmp(b);
      if(amp<0.04){
        // Even a quiet ring still shows a faint colour trace so the tunnel
        // reads as a continuous structure, not sparse flickering dots.
        const [r,g,bv]=auColor(b/(AB-1),1-ring,0.06);
        setFaceLED(f,u,v,r*0.05,g*0.05,bv*0.05);
        continue;
      }
      const bright=amp*(1-ring*0.35)*0.92;
      const [r,g,bv]=auColor(b/(AB-1),1-ring,amp);
      setFaceLED(f,u,v,r*bright,g*bright,bv*bright);
    }
  }
  // Bass hit flashes a white-hot core at dead centre of every face
  if(bass>0.55){
    const cc=(S-1)/2, coreR=1+bass*1.5;
    for(let f=0;f<6;f++){
      for(let dv=-coreR;dv<=coreR;dv++) for(let du=-coreR;du<=coreR;du++){
        const d=Math.hypot(du,dv); if(d>coreR) continue;
        const u=Math.round(cc+du), v=Math.round(cc+dv);
        if(u<0||u>=S||v<0||v>=S) continue;
        auBloom(f,u,v,[1,1,1],(1-d/coreR)*(bass-0.55)*2.2);
      }
    }
  }
}

// ── Storm (lightning reactive to audio beats) ──
function drawStormStyle(dt){
  const S=SIZE, AB=AUDIO_BANDS, cols=4*S;
  for(let i=0;i<N*3;i++) colBuf[i]*=0.72;
  const bass=(auAmp(0)+auAmp(1)+auAmp(2))/3;
  // Spawn flashes on transients
  if(bass>0.52 && Math.random()<bass*dt*18){
    const face=Math.random()*4|0;
    stormFlashes.push({face,u:Math.random()*S|0,v:Math.random()*S|0,
      life:1,hue:0.58+Math.random()*0.16,size:Math.max(2,(bass*S*0.14)|0)});
  }
  // Background: spectrum bars at low opacity scrolling
  for(let c=0;c<cols;c++){
    const b=scrolledBand(c,cols,AB);
    const raw=auAmp(b), amp=raw*0.4;
    if(amp<0.03) continue;
    const fu=sideCol(c);
    const [r,g,bv]=auColor(b/(AB-1),1,raw);
    for(let y=0;y<Math.round(amp*(S-1));y++) setFaceLED(fu[0],fu[1],y,r*amp,g*amp,bv*amp);
  }
  // Animate flashes — bright core plus a jagged bolt-like flicker instead
  // of a flat radial disc, and a hot white centre on the freshest strikes.
  for(let k=stormFlashes.length-1;k>=0;k--){
    const fl=stormFlashes[k]; fl.life-=dt*3.5;
    if(fl.life<=0){stormFlashes.splice(k,1);continue;}
    const R=Math.ceil(fl.size*fl.life);
    for(let dv=-R;dv<=R;dv++) for(let du=-R;du<=R;du++){
      const d2=du*du+dv*dv;
      if(d2>R*R) continue;
      const jag=0.75+0.25*Math.sin(du*2.7+dv*3.1+fl.life*20);
      const bright=fl.life*(1-Math.sqrt(d2)/R)*0.95*jag;
      const [r,g,bv]=hsl(fl.hue,0.5+fl.life*0.5,bright);
      setFaceLED(fl.face,fl.u+du,fl.v+dv,r,g,bv);
    }
    if(fl.life>0.7) auBloom(fl.face,fl.u,fl.v,[1,1,1],(fl.life-0.7)/0.3);
  }
  drawPolarFace(4); drawPolarFace(5);
}

// Polar spectrum: angle = band, radius = level (top/bottom faces)
function drawPolarFace(face){
  const S=SIZE, AB=AUDIO_BANDS, cc=(S-1)/2, maxR=cc*1.08;
  const bass=(auAmp(0)+auAmp(1)+auAmp(2))/3;
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const dx=u-cc, dz=v-cc, r=Math.hypot(dx,dz)/maxR;
    const ang=(Math.atan2(dz,dx)/(Math.PI*2)+0.5+t*0.03)%1;
    const b=Math.min(AB-1,(ang*AB)|0);
    const amp=auAmp(b);
    if(r<=amp){
      const col=auColor(b/(AB-1), 1-r/Math.max(0.01,amp), amp);
      setFaceLED(face,u,v,col[0],col[1],col[2]);
    } else if(Math.abs(r-auPk(b))<0.045){
      setFaceLED(face,u,v,0.8,0.8,0.85);
    }
    if(r<bass*0.22) setFaceLED(face,u,v,1,1,1); // bass core flash
  }
}

// Radial style: beat-triggered shockwave rings + spectral wash on sides
function drawRadialStyle(dt){
  const S=SIZE, AB=AUDIO_BANDS, cc=(S-1)/2;
  const bass=(auAmp(0)+auAmp(1)+auAmp(2))/3;
  if(bass>0.5 && auPrevBass<=0.5 && auRings.length<12) auRings.push({r:0, hue:Math.random()});
  auPrevBass=bass;
  for(const ring of auRings) ring.r+=dt*S*0.85;
  for(let k=auRings.length-1;k>=0;k--) if(auRings[k].r>S*0.95) auRings.splice(k,1);
  for(let f=0;f<4;f++){
    const face=[0,2,1,3][f];
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const r=Math.hypot(u-cc,v-cc);
      const b=Math.min(AB-1,((((u/(S-1))*0.25+f*0.25))*AB)|0); // bands wrap the cube
      const bandAmp=auAmp(b);
      const amp=bandAmp*0.28;
      const bg=auColor(b/(AB-1), v/(S-1), bandAmp);
      let rr=bg[0]*amp, gg=bg[1]*amp, bb=bg[2]*amp;
      // Ring width breathes a little wider on the leading edge, softer
      // trailing edge — reads as an expanding shockwave, not a static band.
      for(const ring of auRings){
        const dd=r-ring.r;
        const w=dd>=0?1.2:2.4;
        if(Math.abs(dd)<w){
          const inten=(1-Math.abs(dd)/w)*(1-ring.r/(S*0.95));
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

// Classic VU: segmented green/amber/red meters with needle ballistics.
// Genuinely stereo — reads the real left/right channel levels (see
// auSetupStereoAnalysers/auReadStereoLevels) rather than faking a
// difference between channels from one mono level. A true mono source
// (many phone mics, some stations) will show matching L/R, correctly.
function drawVUStyle(dt){
  const S=SIZE, M=S-1;
  const {l:rawL, r:rawR} = auReadStereoLevels();
  const tL=Math.min(1, rawL*auGain*2.2);
  const tR=Math.min(1, rawR*auGain*2.2);
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
  for(let i=0;i<32;i++) energy+=auAmp(i);
  energy/=32;
  const bass=(auAmp(0)+auAmp(1)+auAmp(2))/3;
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
  const bassHit=(auAmp(0)+auAmp(1)+auAmp(2))/3;
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
        // Bright thin core line, soft wider glow either side — a proper
        // ripple silhouette instead of one flat-brightness band.
        const core=Math.max(0,1-d/(w*0.4));
        const halo=(1-d/w)*0.5;
        const a=Math.max(core,halo);
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
      const spec=auAmp(b);
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
      // White-hot tip on tall flames — the base of a real flame is where
      // combustion is hottest/brightest, so the topmost pixel gets a bloom.
      if(h>M*0.5){
        const tipU=Math.floor((colStart+colEnd-1)/2);
        auBloom(face,tipU,Math.min(M,h),[1,0.98,0.85],0.9);
      }
    }
  }
  const glow=(auAmp(0)+auAmp(1))*0.12;
  if(glow>0.02){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[4][v*S+u];
      if(idx>=0){ const b3=idx*3; if(glow>colBuf[b3]) colBuf[b3]=glow; if(glow*0.3>colBuf[b3+1]) colBuf[b3+1]=glow*0.3; }
    }
  }
}

// Band-reactive drawing styles for effectSpectrum, regardless of whether
// the audio data (auSpec/auAnalyser) came from the mic or a radio stream.
function renderSpectrumStyle(dt){
  auUpdateFitScale();
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

// Reads whichever sound source is currently selected (mic/phone/radio) into
// auSpec, and advances the scroll offset. Shared by effectSpectrum and the
// generic "Spectrum Analyser overlay" any other effect can opt into.
function auRefreshCurrentSource(dt){
  if(radioPlaying && auAnalyser && !radioAnalyserSilent){
    if(auLastLevel<=0.04) radioSilentTimer+=dt; else radioSilentTimer=0;
    if(radioSilentTimer>4){
      radioAnalyserSilent=true;
      if(radioNowPlaying) radioSetStatus('▶ '+radioNowPlaying.name+' (visualizer unavailable — station blocks audio analysis)');
    }
  }
  const haveRealAudio = (micOn || (radioPlaying && !radioAnalyserSilent)) && auAnalyser;
  if(haveRealAudio) readMicSpectrum(dt); else auFlatten(dt);
  if(auScrollSpeed>0) auScrollX=(auScrollX+dt*auScrollSpeed*SIZE*1.5*auScrollDir+4*SIZE)%(4*SIZE);
}

function effectSpectrum(dt){
  t+=dt;
  auRefreshCurrentSource(dt);
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  renderSpectrumStyle(dt);
  if(radioPlaying){
    const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
    radioDrawTicker(0, dt);
    if(!is2D) radioDrawTicker(2, dt);
  }
}

// ── Spectrum Analyser as a global overlay (see OV.spectrum / ovSpectrumAnalyser
// below, wired into runOverlays) — draws the bars WITHOUT clearing colBuf
// first, so they blend on top of whatever main effect is currently running,
// same as every other overlay, rather than replacing the whole face.
function drawSpectrumOverlay(dt){
  t+=dt;
  auRefreshCurrentSource(dt);
  renderSpectrumStyle(dt);
}

// ═══════════════════════════════════════════════════
//  INTERNET RADIO
//  Plays a curated list of public streams through an <audio> element and
//  reuses the Spectrum Analyser's band engine/drawing styles to visualize
//  it — same auAnalyser/auStyle/auTheme pipeline, just fed from a radio
//  stream instead of the microphone.
// ═══════════════════════════════════════════════════
const RADIO_STATIONS=[
  {name:'SomaFM Groove Salad',   genre:'Ambient/Downtempo', url:'https://ice1.somafm.com/groovesalad-128-mp3'},
  {name:'SomaFM Drone Zone',     genre:'Ambient',            url:'https://ice1.somafm.com/dronezone-128-mp3'},
  {name:'SomaFM Space Station',  genre:'Space Music',        url:'https://ice1.somafm.com/spacestation-128-mp3'},
  {name:'SomaFM Beat Blender',   genre:'Electronica',        url:'https://ice1.somafm.com/beatblender-128-mp3'},
  {name:'SomaFM Indie Pop Rocks',genre:'Indie Pop',          url:'https://ice1.somafm.com/indiepop-128-mp3'},
  {name:'SomaFM Lush',           genre:'Mellow Vocals',      url:'https://ice1.somafm.com/lush-128-mp3'},
  {name:'SomaFM Secret Agent',   genre:'Spy Lounge',         url:'https://ice1.somafm.com/secretagent-128-mp3'},
  {name:'SomaFM Boot Liquor',    genre:'Americana',          url:'https://ice1.somafm.com/bootliquor-128-mp3'},
];
let radioAudioEl=null, radioSource=null, radioPlaying=false, radioError='';
// Many stream hosts don't send CORS headers - playback still works fine
// (media elements are exempt from CORS), but the analyser silently reads
// all-zero data in that case. If the tracked auto-gain peak stays pinned
// near its floor for several seconds despite radioPlaying being true, that's
// the signature of a CORS-blocked analyser rather than an actually silent
// stream — the visualizer just goes flat in that case (see auFlatten).
let radioAnalyserSilent=false, radioSilentTimer=0;
let radioNowPlaying=null;   // {name, genre} of the currently loaded station
let radioScrollX=0;

// Radio Browser (radio-browser.info) — a free, community-run directory of
// tens of thousands of internet radio streams, no API key needed. It's
// served from several equivalent mirror hosts; if the first one is down or
// unreachable we retry once against a second mirror, same "don't collapse
// a failure into a bare error" spirit as the old F1 module's fetch helper.
const RADIO_BROWSER_MIRRORS=['https://de1.api.radio-browser.info','https://nl1.api.radio-browser.info'];
let radioSearchResults=[], radioSearching=false, radioSearchError='';

async function radioBrowserFetch(path){
  let lastErr=null;
  for(const base of RADIO_BROWSER_MIRRORS){
    try{
      const r=await fetch(base+path);
      if(!r.ok) throw new Error('HTTP '+r.status);
      return await r.json();
    }catch(e){ lastErr=e; }
  }
  throw lastErr || new Error('all mirrors failed');
}

function radioSetSearchStatus(text){
  document.querySelectorAll('.radio-search-status-el').forEach(el=>el.textContent=text);
}

async function radioSearchStations(query){
  radioSearching=true; radioSearchError='';
  radioSetSearchStatus('Searching…');
  try{
    const path = query
      ? '/json/stations/search?name='+encodeURIComponent(query)+'&limit=60&hidebroken=true&order=clickcount&reverse=true'
      : '/json/stations/topclick/60?hidebroken=true';
    const data = await radioBrowserFetch(path);
    radioSearchResults = (data||[]).filter(s=>s.url_resolved||s.url).map(s=>({
      name: s.name || 'Unnamed station',
      genre: (s.tags||'').split(',').slice(0,2).join(', ') || s.country || '',
      url: s.url_resolved || s.url,
    }));
    radioSetSearchStatus(radioSearchResults.length + ' stations found');
  }catch(e){
    radioSearchError='Directory unreachable — try again, or use the featured list below';
    radioSetSearchStatus('✕ '+radioSearchError);
    console.warn('[radio] search failed:', e && e.message);
  }
  radioSearching=false;
  if(typeof radioRenderSearchResults==='function') radioRenderSearchResults();
}

// Status text shows in both the Internet Radio effect panel and the
// audio-only overlay panel — update every matching element, not just one.
function radioSetStatus(text){
  document.querySelectorAll('.radio-status-el').forEach(el=>el.textContent=text);
}

function radioEnsureGraph(){
  if(!radioAudioEl){
    radioAudioEl=new Audio();
    radioAudioEl.crossOrigin='anonymous';
    radioAudioEl.addEventListener('error', ()=>{
      radioError='Stream failed to load — try another station';
      radioPlaying=false;
      radioSetStatus('✕ '+radioError);
    });
  }
  auCtx = auCtx || new (window.AudioContext||window.webkitAudioContext)();
  if(auCtx.state==='suspended') auCtx.resume();
  if(!radioSource){
    radioSource=auCtx.createMediaElementSource(radioAudioEl);
    auAnalyser=auAnalyser || auCtx.createAnalyser();
    auAnalyser.fftSize=2048; auAnalyser.smoothingTimeConstant=0.45;
    micBuf=micBuf || new Uint8Array(auAnalyser.frequencyBinCount);
    // Route through the analyser AND back out to speakers — creating a
    // MediaElementSource replaces the <audio> tag's default output path,
    // so without this explicit connect() the stream would play silently.
    radioSource.connect(auAnalyser);
    auAnalyser.connect(auCtx.destination);
    auSetupStereoAnalysers(radioSource);
  }
}

// station: {name, genre, url} — from RADIO_STATIONS (featured) or a
// radioSearchResults entry (directory search), same shape either way.
async function radioPlay(station){
  if(!station || !station.url) return;
  radioError='';
  radioEnsureGraph();
  radioNowPlaying=station;
  radioScrollX=0;
  radioAnalyserSilent=false;
  radioSilentTimer=0;
  radioAudioEl.src=station.url;
  try{
    await radioAudioEl.play();
    radioPlaying=true;
    radioSetStatus('▶ '+station.name+(station.genre?' — '+station.genre:''));
  }catch(e){
    radioPlaying=false;
    radioError='Could not start playback (tap play again — browsers require a user click to start audio)';
    radioSetStatus('✕ '+radioError);
  }
}

function radioStop(){
  if(radioAudioEl) radioAudioEl.pause();
  radioPlaying=false;
  radioSetStatus('Stopped');
}

// Scrolling now-playing name, drawn as a thin ticker over the bottom rows
// of face 0 — on top of whatever the visualizer already drew there, not a
// full-face redraw, so the bars keep showing above it.
function radioDrawTicker(face, dt){
  if(!radioNowPlaying) return;
  const label = radioNowPlaying.name + (radioNowPlaying.genre ? '  •  ' + radioNowPlaying.genre : '') + '    ';
  const textW = label.length * WC_CHAR_W;
  radioScrollX += dt * 14;
  if(radioScrollX > textW) radioScrollX -= textW;
  const sv = 1;   // near the bottom edge
  let u = -Math.floor(radioScrollX);
  while(u < SIZE){
    for(const ch of label){
      u += wcDrawGlyph(face, ch, u, sv, [0.6,0.85,1]);
      if(u > SIZE) break;
    }
  }
}

// The volume slider sets the "target" level — what a pre-alarm ramps up to,
// or a wind-down starts from. During an active pre-alarm/wind-down phase,
// ui.js's animate() overrides radioAudioEl.volume every frame to follow
// that ramp; this just updates the target and applies it immediately for
// normal (non-alarm) manual adjustment.
let radioTargetVolume = 0.8;
function radioSetVolume(v){
  radioTargetVolume = v;
  if(radioAudioEl) radioAudioEl.volume=v;
}

// Internet Radio is its own effect/menu entry, but the visualizer IS the
// Spectrum Analyser — effectSpectrum(dt) already knows how to read from a
// playing radio stream (see its radioPlaying checks), draw the now-playing
// ticker, and detect a CORS-silent station. Calling it directly here (not a
// parallel copy) guarantees both effects always look identical.
function effectRadio(dt){
  t+=dt;
  auRefreshCurrentSource(dt);
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  // Bars are opt-in via the "Switch on Spectrum Analyser Overlay" checkbox
  // (OV.spectrum.on) — by default Internet Radio shows just the scrolling
  // now-playing ticker on a blank background, nothing else.
  if(OV.spectrum.on) renderSpectrumStyle(dt);
  if(radioPlaying){
    const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
    radioDrawTicker(0, dt);
    if(!is2D) radioDrawTicker(2, dt);
  }
}

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
  radio:    {on:false},
  spectrum: {on:false},
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

// ── Internet Radio spectrum strip ──
// Audio-only overlay — deliberately draws nothing. Its job is to let a
// radio station keep playing as background audio while any other effect
// runs on the cube, without adding any visual bars/strip on top of it.
// Turning the overlay off stops playback; turning it on doesn't start
// anything by itself — pick a station from the controls in the overlay
// panel (mirrors the Internet Radio effect's own controls).
function ovRadio(dt){}

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
    if(OV.radio.on)     ovRadio(dt);
    if(OV.spectrum.on && currentEffect!=='radio')  drawSpectrumOverlay(dt);
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
    if(OV.radio.on)     ovRadio(dt);
    if(OV.spectrum.on && currentEffect!=='radio')  drawSpectrumOverlay(dt);
  }
}

// Face order for panoramic wrap: front→right→back→left (continuous perimeter)
const VID_FACE_ORDER=[0,3,1,2];  // front→left→right→back for seamless panorama

// Loads an external image and extracts its pixel data for LED rendering.
// Many NASA image hosts (e.g. apod.nasa.gov) don't send CORS headers, which
// taints the canvas and makes getImageData throw — fall back to a CORS-safe
// resizing proxy (images.weserv.nl) when the direct load can't be read.
// Loads an image and extracts pixel data for LED rendering.
// opts.letterbox=true  → fit entire image inside sz×sz (black bars, ratio preserved)
// opts.letterbox=false → fill sz×sz by cropping (no bars, ratio preserved, default)
// Uses fetch→blob→ObjectURL so canvas reads are always same-origin.
// Falls back to images.weserv.nl proxy if direct fetch fails (CORS block etc.).
function loadImageForPixels(url, onSize, onPixels, onError, opts){
  const letterbox = opts && opts.letterbox;
  const sz=Math.max(SIZE,32);
  const proxyUrl=`https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//,''))}&w=${sz*4}&h=${sz*4}&fit=inside`;

  function drawBlobUrl(objectUrl){
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(objectUrl);
      const oc=document.createElement('canvas');
      oc.width=sz; oc.height=sz;
      const ctx2=oc.getContext('2d');
      ctx2.fillStyle='#000';
      ctx2.fillRect(0,0,sz,sz);
      // letterbox=true: fit whole image, preserve ratio (may have black bars)
      // letterbox=false: scale to fill, crop edges (no black bars)
      const scale = letterbox
        ? Math.min(sz/img.width, sz/img.height)
        : Math.max(sz/img.width, sz/img.height);
      const dw=img.width*scale, dh=img.height*scale;
      ctx2.drawImage(img,(sz-dw)/2,(sz-dh)/2,dw,dh);
      const pixels=ctx2.getImageData(0,0,sz,sz).data;
      onSize(sz);
      onPixels(pixels);
    };
    img.onerror=()=>{ URL.revokeObjectURL(objectUrl); onError(new Error('blob draw failed')); };
    img.src=objectUrl;
  }

  // <img crossOrigin> tag load — skips fetch()'s CORS preflight entirely.
  // Some CDNs' bot protection blocks fetch()-style requests (or datacenter-
  // sourced proxy fetches) while still serving plain browser image GETs fine.
  function tryImgTag(srcUrl, label, onFail){
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      try{
        const oc=document.createElement('canvas');
        oc.width=sz; oc.height=sz;
        const ctx2=oc.getContext('2d');
        ctx2.fillStyle='#000'; ctx2.fillRect(0,0,sz,sz);
        const scale = letterbox
          ? Math.min(sz/img.width, sz/img.height)
          : Math.max(sz/img.width, sz/img.height);
        const dw=img.width*scale, dh=img.height*scale;
        ctx2.drawImage(img,(sz-dw)/2,(sz-dh)/2,dw,dh);
        const pixels=ctx2.getImageData(0,0,sz,sz).data;
        console.log(`[loadImageForPixels] ${label} img-tag OK`);
        onSize(sz); onPixels(pixels);
      }catch(e){
        console.error(`[loadImageForPixels] ${label} img-tag canvas read failed (tainted?):`,e.message);
        onFail();
      }
    };
    img.onerror=()=>{ console.warn(`[loadImageForPixels] ${label} img-tag load failed`); onFail(); };
    img.src=srcUrl;
  }

  // Try direct fetch first (works if server sends Access-Control-Allow-Origin)
  fetch(url,{mode:'cors'})
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); })
    .then(blob=>{ console.log('[loadImageForPixels] direct fetch OK'); drawBlobUrl(URL.createObjectURL(blob)); })
    .catch(err=>{
      console.warn('[loadImageForPixels] direct fetch failed ('+err.message+'), trying direct <img> tag');
      // Try the ORIGINAL url via a plain <img> tag next — a genuinely
      // different code path from fetch(), before falling back to the proxy.
      tryImgTag(url, 'direct', () => {
        console.warn('[loadImageForPixels] direct img-tag failed, trying proxy fetch');
        fetch(proxyUrl,{mode:'cors'})
          .then(r=>{ if(!r.ok) throw new Error('proxy HTTP '+r.status); return r.blob(); })
          .then(blob=>{ console.log('[loadImageForPixels] proxy fetch OK'); drawBlobUrl(URL.createObjectURL(blob)); })
          .catch(err2=>{
            console.warn('[loadImageForPixels] proxy fetch failed ('+err2.message+'), trying proxy <img> tag');
            tryImgTag(proxyUrl, 'proxy', () => onError(new Error('all image load strategies failed')));
          });
      });
    });
}

// ═══════════════════════════════════════════════════
//  Shared photo-gallery slideshow engine
// ═══════════════════════════════════════════════════
// Any "cycle through a set of loaded photos, one per face, staggered and
// crossfading" effect (Unsplash, Art Gallery, and future ones) shares this
// exact engine — only the pixel/size arrays and load function differ.
// galleryInitFaceState: per-face staggered timing state for full-cube mode.
// Each face cycles on the same `periodSecs` but offset so they don't all
// change at once (offset = periodSecs/6), and crossfades into its next
// photo over `fadeDur` seconds instead of cutting instantly.
function galleryInitFaceState(n, periodSecs){
  const stagger=periodSecs/6;
  return Array.from({length:6},(_,f)=>({
    curIdx: n?f%n:0, nextIdx:null, fadeT:0, timer:f*stagger
  }));
}
// Advances one face's slideshow/crossfade state by dt. Call once per face
// per frame before rendering. loadFn(idx) should kick off loading that
// photo if not already loaded/loading (a no-op if already cached).
function gallerySlideshowStep(state, n, dt, periodSecs, fadeDur, slideshowOn, loadFn, pixelsArr){
  loadFn(state.curIdx);
  if(state.nextIdx!=null) loadFn(state.nextIdx);
  if(state.fadeT>0){
    const nextPixels=pixelsArr[state.nextIdx];
    if(nextPixels==='error'){
      // Broken photo — skip to a different one, keep the fade running.
      state.nextIdx=(state.nextIdx+1)%n;
      loadFn(state.nextIdx);
    } else if(nextPixels){
      state.fadeT+=dt;
      if(state.fadeT>=fadeDur){ state.curIdx=state.nextIdx; state.nextIdx=null; state.fadeT=0; }
    }
    // else still loading — hold the fade at its current progress until ready
  } else if(slideshowOn){
    state.timer+=dt;
    if(state.timer>=periodSecs){
      state.timer-=periodSecs;
      state.nextIdx = n>6 ? (state.curIdx+6)%n : (state.curIdx+1)%n;
      loadFn(state.nextIdx);
      state.fadeT=0.0001;
    }
  }
}
function galleryApplyToFace(pixelsArr, sizesArr, face, idx){
  const pixels=pixelsArr[idx];
  if(!pixels||pixels==='error') return false;
  const S=SIZE, IS=sizesArr[idx];
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const li=faceMap[face][v*S+u]; if(li<0) continue;
    const su=Math.min(IS-1,Math.floor(u/S*IS));
    const sv=Math.min(IS-1,Math.floor((S-1-v)/S*IS));
    const pi=(sv*IS+su)*4;
    colBuf[li*3]=pixels[pi]/255;
    colBuf[li*3+1]=pixels[pi+1]/255;
    colBuf[li*3+2]=pixels[pi+2]/255;
  }
  return true;
}
// Crossfades between two loaded photos on one face. Falls back to showing
// whichever side is actually ready if the other isn't (still loading/error).
function galleryApplyBlendToFace(pixelsArr, sizesArr, face, idxA, idxB, alpha){
  const pixelsA=pixelsArr[idxA], pixelsB=pixelsArr[idxB];
  const okA=pixelsA&&pixelsA!=='error', okB=pixelsB&&pixelsB!=='error';
  if(!okA && !okB) return false;
  if(!okA) return galleryApplyToFace(pixelsArr, sizesArr, face, idxB);
  if(!okB) return galleryApplyToFace(pixelsArr, sizesArr, face, idxA);
  const S=SIZE, ISA=sizesArr[idxA], ISB=sizesArr[idxB];
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const li=faceMap[face][v*S+u]; if(li<0) continue;
    const suA=Math.min(ISA-1,Math.floor(u/S*ISA)), svA=Math.min(ISA-1,Math.floor((S-1-v)/S*ISA));
    const piA=(svA*ISA+suA)*4;
    const suB=Math.min(ISB-1,Math.floor(u/S*ISB)), svB=Math.min(ISB-1,Math.floor((S-1-v)/S*ISB));
    const piB=(svB*ISB+suB)*4;
    colBuf[li*3]  =(pixelsA[piA]  /255)+((pixelsB[piB]  /255)-(pixelsA[piA]  /255))*alpha;
    colBuf[li*3+1]=(pixelsA[piA+1]/255)+((pixelsB[piB+1]/255)-(pixelsA[piA+1]/255))*alpha;
    colBuf[li*3+2]=(pixelsA[piA+2]/255)+((pixelsB[piB+2]/255)-(pixelsA[piA+2]/255))*alpha;
  }
  return true;
}

// ═══════════════════════════════════════════════════
//  Word cascade — always-on reveal for jokes & historical events. Words
//  appear one at a time filling rows top-down; once the face is full,
//  rows shift up as new lines arrive at the bottom. The delay before each
//  word depends on the length/complexity of the word just shown — longer
//  words and ones with more punctuation/symbols give the reader more time.
//  Uses the same crisp bitmap PIXEL_FONT as the weather effect's ticker
//  (pixelGlyph) instead of a canvas font, so it's not anti-aliased/blurry —
//  unmapped characters (e.g. some punctuation) are simply skipped, same as
//  weather's ticker already does.
// ═══════════════════════════════════════════════════
// Narrow 4-wide x 7-tall dot-matrix bitmap font — each row is a 4-bit
// value, bit3=leftmost column. Uppercase only; lowercase input falls back
// to uppercase, same as PIXEL_FONT does. Character advance is glyph width
// + 1px gap (normal spacing, no extra padding beyond that).
const WC_FONT={
  '0':[6,9,9,9,9,9,6],'1':[4,12,4,4,4,4,14],'2':[14,1,2,4,8,8,15],'3':[14,1,6,1,1,9,6],
  '4':[2,6,10,10,15,2,2],'5':[15,8,14,1,1,9,6],'6':[6,8,8,14,9,9,6],'7':[15,1,2,2,4,4,4],
  '8':[6,9,9,6,9,9,6],'9':[6,9,9,7,1,1,6],
  'A':[6,9,9,15,9,9,9],'B':[14,9,9,14,9,9,14],'C':[7,8,8,8,8,8,7],'D':[12,10,9,9,9,10,12],
  'E':[15,8,8,14,8,8,15],'F':[15,8,8,14,8,8,8],'G':[7,8,8,11,9,9,7],'H':[9,9,9,15,9,9,9],
  'I':[14,4,4,4,4,4,14],'J':[3,1,1,1,1,9,6],'K':[9,10,12,8,12,10,9],'L':[8,8,8,8,8,8,15],
  'M':[9,13,11,9,9,9,9],'N':[9,13,11,11,9,9,9],'O':[6,9,9,9,9,9,6],'P':[14,9,9,14,8,8,8],
  'Q':[6,9,9,9,11,9,7],'R':[14,9,9,14,12,10,9],'S':[7,8,8,6,1,1,14],'T':[15,4,4,4,4,4,4],
  'U':[9,9,9,9,9,9,6],'V':[9,9,9,9,9,6,2],'W':[9,9,9,9,11,13,9],'X':[9,9,6,6,6,9,9],
  'Y':[9,9,6,2,2,2,2],'Z':[15,1,2,4,8,8,15],
  ' ':[0,0,0,0,0,0,0],'.':[0,0,0,0,0,0,4],',':[0,0,0,0,0,4,8],"'":[4,4,0,0,0,0,0],
  '"':[10,10,0,0,0,0,0],'?':[6,9,2,2,4,0,4],'!':[4,4,4,4,4,0,4],':':[0,4,0,0,4,0,0],
  ';':[0,4,0,0,4,8,0],'-':[0,0,0,15,0,0,0],'(':[2,4,8,8,8,4,2],')':[8,4,2,2,2,4,8],
};
const WC_CHAR_W=5, WC_LINE_H=8;
function wcWordDelay(word){
  const base=0.16;
  const perChar=0.05;
  const symbols=(word.match(/[^a-zA-Z0-9]/g)||[]).length;
  return base + word.length*perChar + symbols*0.08;
}
// Draws one glyph from WC_FONT. Unmapped characters are skipped (blank),
// same fallback behavior as the weather ticker's PIXEL_FONT. Returns
// advance width.
function wcDrawGlyph(face, ch, su, sv, rgb){
  const rows=WC_FONT[ch]||WC_FONT[ch.toUpperCase()];
  if(!rows) return WC_CHAR_W;
  for(let row=0;row<7;row++){
    const bits=rows[row];
    for(let col=0;col<4;col++){
      if(!((bits>>(3-col))&1)) continue;
      const u=su+col, v=sv+(6-row);
      if(u<0||u>=SIZE||v<0||v>=SIZE) continue;
      const idx=faceMap[face][v*SIZE+u]; if(idx<0) continue;
      colBuf[idx*3]=rgb[0]; colBuf[idx*3+1]=rgb[1]; colBuf[idx*3+2]=rgb[2];
    }
  }
  return WC_CHAR_W;
}
function wcInit(taggedWords){
  const maxLines=Math.max(1, Math.floor(SIZE/WC_LINE_H));
  return {words:taggedWords, idx:0, cur:[], lines:[], timer:0, pendingDelay:0.3,
          done:false, holdTimer:0, maxLines};
}
// No auto-loop/auto-advance here — the caller (effectJoke/effectOnThisDay)
// watches state.done + state.holdTimer to decide what comes next (repeat,
// fetch a new joke, advance to the next event, etc).
function wcStep(state, dt){
  if(state.done){ state.holdTimer+=dt; return; }
  state.timer+=dt;
  const maxW=SIZE;
  while(state.timer>=state.pendingDelay && state.idx<state.words.length){
    state.timer-=state.pendingDelay;
    const tw=state.words[state.idx++];
    const curW=state.cur.reduce((a,t)=>a+t.w.length*WC_CHAR_W,0)+Math.max(0,state.cur.length-1)*WC_CHAR_W;
    const addW=(state.cur.length?WC_CHAR_W:0)+tw.w.length*WC_CHAR_W;
    if(curW+addW>maxW && state.cur.length){
      state.lines.push(state.cur);
      state.cur=[tw];
    } else {
      state.cur.push(tw);
    }
    state.pendingDelay=wcWordDelay(tw.w);
    if(state.idx>=state.words.length) state.done=true;
  }
}
function wcDrawToFace(state, face){
  const allLines=state.cur.length ? [...state.lines, state.cur] : [...state.lines];
  const visible=allLines.slice(-state.maxLines);
  const topMargin=1;
  visible.forEach((line,i)=>{
    const sv=(SIZE-1)-topMargin-6-i*WC_LINE_H;
    if(sv+6<0) return;
    const lineW=line.reduce((a,t)=>a+t.w.length*WC_CHAR_W,0)+Math.max(0,line.length-1)*WC_CHAR_W;
    let su=Math.round((SIZE-lineW)/2);
    line.forEach(tw=>{
      let u=su;
      for(const ch of tw.w) u+=wcDrawGlyph(face, ch, u, sv, tw.color);
      su+=tw.w.length*WC_CHAR_W+WC_CHAR_W;
    });
  });
}
function wcTagQA(text){
  const splitIdx=text.indexOf('?');
  const re=/\S+/g;
  const words=[]; let m;
  while((m=re.exec(text))){
    const isAnswer=splitIdx>=0 && m.index>splitIdx;
    words.push({w:m[0], color: isAnswer?[1,0.8,0.27]:[1,1,1]});
  }
  return words;
}
