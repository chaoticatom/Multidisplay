// ═══════════════════════════════════════════════════
//  effects-media.js — Audio & Media (lazy-loaded)
//  video (radio lives in effects-core.js — see CLAUDE.md)
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
//  VIDEO DISPLAY
//  Maps live video onto the 4 side panels.
//  Sources: local file, screen capture (incl. YouTube
//  tab), or webcam. Simulated in the 3D viewport.
// ═══════════════════════════════════════════════════
let vidEl=null, vidCv=null, vidCtx=null;
let vidStream=null, vidReady=false;
let vidLayout='panorama', vidBright=1, vidSat=1.2, vidTB='dark', vidScrollX=0, vidScrollSpeed=0;

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
    if(micOn&&auAnalyser) readMicSpectrum(dt); else auFlatten(dt);
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
