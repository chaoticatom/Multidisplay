/* f1.js — F1 Live Timing renderer
 * Reads all state from window.F1State (populated by f1-providers.js).
 * Rendering-only locals below — no data fetching or simulation logic.
 */

let f1FaceBufs = {};
let f1TrackBuf = null;
let f1ScrollX = 0;
let f1TextPixels = null;
let f1TextWidth = 0;
let f1CircuitStrip = null;
let f1CircuitStripW = 0;
let f1CircuitScrollX = 0;
let f1IdlePixels = null;
let f1IdleWidth = 0;
let f1IdleScrollX = 0;
let f1IdleRebuildT = 0;

const F1_TRACKS = {
  'silverstone': [[.1,.4],[.15,.25],[.3,.1],[.5,.08],[.7,.1],[.85,.25],[.9,.45],[.88,.65],[.75,.78],[.55,.88],[.35,.88],[.15,.75],[.1,.55],[.1,.4]],
  'monza': [[.2,.1],[.5,.08],[.8,.12],[.92,.35],[.9,.6],[.75,.8],[.45,.92],[.15,.85],[.08,.6],[.1,.3],[.2,.1]],
  'spa': [[.15,.08],[.55,.05],[.88,.2],[.95,.5],[.75,.85],[.35,.95],[.08,.75],[.05,.35],[.15,.08]],
  'monaco': [[.35,.1],[.55,.1],[.75,.2],[.85,.35],[.88,.55],[.8,.7],[.65,.78],[.45,.8],[.35,.72],[.28,.55],[.25,.35],[.28,.2],[.35,.1]],
  'barcelona': [[.25,.1],[.5,.08],[.8,.15],[.92,.4],[.9,.68],[.7,.85],[.4,.92],[.15,.82],[.08,.5],[.12,.2],[.25,.1]],
  'budapest': [[.2,.1],[.5,.08],[.78,.15],[.92,.38],[.85,.65],[.65,.8],[.35,.88],[.12,.78],[.08,.45],[.15,.18],[.2,.1]],
  'paul ricard': [[.18,.15],[.45,.1],[.75,.12],[.92,.35],[.88,.65],[.65,.82],[.35,.85],[.12,.68],[.08,.35],[.12,.15],[.18,.15]],
  'austria': [[.35,.1],[.65,.08],[.88,.25],[.92,.5],[.8,.75],[.5,.88],[.2,.8],[.08,.5],[.12,.2],[.35,.1]],
  'britain': [[.2,.08],[.5,.06],[.8,.15],[.92,.4],[.88,.7],[.65,.88],[.3,.92],[.08,.72],[.06,.3],[.2,.08]],
  'suzuka': [[.3,.08],[.5,.06],[.75,.1],[.88,.35],[.92,.6],[.8,.8],[.55,.88],[.3,.85],[.15,.65],[.12,.35],[.18,.1],[.3,.08]],
  'melbourne': [[.2,.08],[.5,.06],[.8,.12],[.92,.35],[.9,.65],[.7,.82],[.35,.88],[.1,.72],[.06,.4],[.1,.15],[.2,.08]],
  'marina bay': [[.15,.1],[.4,.08],[.7,.1],[.88,.3],[.92,.58],[.82,.78],[.5,.92],[.2,.88],[.06,.65],[.05,.35],[.15,.1]],
  'singapore': [[.15,.1],[.4,.08],[.7,.1],[.88,.3],[.92,.58],[.82,.78],[.5,.92],[.2,.88],[.06,.65],[.05,.35],[.15,.1]],
  'japan': [[.3,.08],[.5,.06],[.75,.1],[.88,.35],[.92,.6],[.8,.8],[.55,.88],[.3,.85],[.15,.65],[.12,.35],[.18,.1],[.3,.08]],
  'vegas': [[.1,.08],[.4,.06],[.7,.1],[.92,.3],[.95,.6],[.8,.82],[.4,.92],[.08,.75],[.05,.4],[.1,.08]],
  'abu dhabi': [[.15,.1],[.45,.08],[.78,.15],[.92,.4],[.88,.72],[.6,.88],[.25,.88],[.08,.65],[.06,.3],[.15,.1]],
};

function getTrackPts(raceName) {
  if (!raceName) return null;
  const l = raceName.toLowerCase();
  for (const [k,v] of Object.entries(F1_TRACKS)) if (l.includes(k)) return v;
  return [[.3,.1],[.7,.1],[.9,.4],[.85,.7],[.5,.9],[.15,.7],[.1,.4],[.3,.1]];
}

function bline(buf, x0,y0,x1,y1,S,val=255) {
  x0|=0;y0|=0;x1|=0;y1|=0;
  const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;
  let e=dx-dy;
  while(true){
    if(x0>=0&&x0<S&&y0>=0&&y0<S){ buf[y0*S+x0]=Math.max(buf[y0*S+x0],val); }
    if(x0===x1&&y0===y1) break;
    const e2=e*2; if(e2>-dy){e-=dy;x0+=sx;} if(e2<dx){e+=dx;y0+=sy;}
  }
}

function drawF1TrackWithCars(){
  const meeting = F1State.meeting;
  if (!meeting) return;
  const pts = getTrackPts(meeting.meeting_name || meeting.circuit_short_name || '');
  if (!pts || pts.length < 2) return;

  const S = SIZE;
  for (let k=0;k<pts.length-1;k++){
    const [x0,y0]=pts[k], [x1,y1]=pts[k+1];
    const steps = Math.max(2, Math.round(Math.hypot((x1-x0)*S,(y1-y0)*S)));
    for (let s=0;s<=steps;s++){
      const fx=x0+(x1-x0)*s/steps, fy=y0+(y1-y0)*s/steps;
      const u=Math.round(fx*(S-1)), v=Math.round(fy*(S-1));
      const i=faceMap[4][v*S+u];
      if(i>=0) setLED(i, 0.12,0.12,0.16);
    }
  }

  const segLen=[]; let total=0;
  for (let k=0;k<pts.length-1;k++){
    const d=Math.hypot(pts[k+1][0]-pts[k][0], pts[k+1][1]-pts[k][1]);
    segLen.push(d); total+=d;
  }

  for (const car of F1State.carPositions){
    let target=car.frac*total, acc=0, px=pts[0][0], py=pts[0][1];
    for (let k=0;k<segLen.length;k++){
      if (acc+segLen[k] >= target){
        const f=(target-acc)/segLen[k];
        px=pts[k][0]+(pts[k+1][0]-pts[k][0])*f;
        py=pts[k][1]+(pts[k+1][1]-pts[k][1])*f;
        break;
      }
      acc+=segLen[k];
    }
    let r=1,g=1,b=1;
    if (car.colour && car.colour[0]==='#' && car.colour.length>=7){
      r=parseInt(car.colour.slice(1,3),16)/255;
      g=parseInt(car.colour.slice(3,5),16)/255;
      b=parseInt(car.colour.slice(5,7),16)/255;
    }
    const cu=Math.round(px*(S-1)), cv=Math.round(py*(S-1));
    for(let dv=-1;dv<=1;dv++) for(let du=-1;du<=1;du++){
      const u=cu+du, v=cv+dv;
      if(u<0||u>=S||v<0||v>=S) continue;
      const fall=(du===0&&dv===0)?1:0.45;
      const i=faceMap[4][v*S+u];
      if(i>=0) setLED(i, r*fall, g*fall, b*fall);
    }
  }
}

function buildTrackBuf(raceName) {
  const pts = getTrackPts(raceName);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,S,S);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 12;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const [x0,y0] = pts[0];
  ctx.moveTo(x0*S, y0*S);
  for (const [x,y] of pts) ctx.lineTo(x*S, y*S);
  ctx.closePath();
  ctx.stroke();
  const [sx,sy] = pts[0];
  ctx.fillStyle = '#ff0'; ctx.beginPath();
  ctx.arc(sx*S, sy*S, 8, 0, Math.PI*2);
  ctx.fill();
  const buf = new Uint8Array(S*S);
  const img = ctx.getImageData(0,0,S,S);
  for (let i=0,j=0; i<img.data.length; i+=4,j++) {
    buf[j] = img.data[i];
  }
  f1TrackBuf = { buf, S };
}

function buildScrollText(data) {
  const dateStr = data ? new Date(data.date_start||data.date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : '--';
  const name    = data ? (data.meeting_name||data.raceName||'Grand Prix') : 'F1 2025';
  const circuit = data ? (data.circuit_short_name||'') : '';
  const text    = `   ${name}  •  ${circuit}  •  ${dateStr}   `.repeat(2);
  const fh = Math.max(8, (SIZE*0.35)|0);
  const oc = document.createElement('canvas');
  const cx = oc.getContext('2d');
  cx.font = `bold ${fh}px "Courier New",monospace`;
  const tw = cx.measureText(text).width|0;
  oc.width = tw + 4*SIZE; oc.height = SIZE;
  cx.fillStyle='#000'; cx.fillRect(0,0,oc.width,oc.height);
  cx.fillStyle='#fff'; cx.font=`bold ${fh}px "Courier New",monospace`;
  cx.textBaseline='middle'; cx.fillText(text,0,SIZE/2);
  f1TextPixels = cx.getImageData(0,0,oc.width,oc.height).data;
  f1TextWidth  = oc.width;
  f1ScrollX    = 0;
}

function setStripLED(stripX, v, r, g, b) {
  if (v<0||v>=SIZE) return;
  const seg = (stripX/SIZE)|0, u = stripX%SIZE;
  const fv  = SIZE-1-v;
  let face, fu;
  if (seg===0){ face=0; fu=u;         }
  else if(seg===1){ face=2; fu=u;         }
  else if(seg===2){ face=1; fu=u;         }
  else if(seg===3){ face=3; fu=u;         }
  else return;
  const i=faceMap[face][fv*SIZE+fu];
  if(i>=0) setLED(i,r,g,b);
}

function buildTextBuf(lines, bg=[0,0,0], reserveBottom=0) {
  const S = Math.max(SIZE, 16);
  const usableH = Math.round(S * (1 - reserveBottom));
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${bg[0]*255|0},${bg[1]*255|0},${bg[2]*255|0})`;
  ctx.fillRect(0,0,S,S);
  const lineH = usableH / lines.length;
  const fs = Math.max(5, (lineH * 0.72)|0);
  ctx.textBaseline = 'middle';
  lines.forEach(({text, color='#fff', align='left', bold=true}, i) => {
    ctx.fillStyle = color;
    ctx.font = `${bold?'bold ':''} ${fs}px Arial,sans-serif`;
    ctx.textAlign = align||'left';
    const x = align==='center'?S/2 : align==='right'?S-3 : 4;
    ctx.fillText(text, x, (i+0.5)*lineH);
  });
  return { data: ctx.getImageData(0,0,S,S).data, S };
}

function buildCircuitStrip() {
  const meeting = F1State.meeting;
  if (!meeting) return;
  const name = ((meeting.circuit_short_name||meeting.meeting_name||'').toUpperCase() + '   ').repeat(2);
  const stripH = Math.max(4, (Math.max(SIZE,16)*0.16)|0);
  const oc = document.createElement('canvas');
  const ctx = oc.getContext('2d');
  const fs = Math.max(3, (stripH*0.75)|0);
  ctx.font = `bold ${fs}px Arial,sans-serif`;
  const tw = (ctx.measureText(name).width)|0 + 4;
  oc.width = tw; oc.height = stripH;
  ctx.fillStyle='#000'; ctx.fillRect(0,0,oc.width,oc.height);
  ctx.fillStyle='#fff'; ctx.font=`bold ${fs}px Arial,sans-serif`;
  ctx.textBaseline='middle';
  ctx.fillText(name, 2, stripH/2);
  f1CircuitStrip  = ctx.getImageData(0,0,oc.width,oc.height).data;
  f1CircuitStripW = oc.width;
  f1CircuitScrollX = 0;
}

var f1IdlePhase = 0;
var f1IdlePhaseT = 0;
var f1IdleNextPixels = null;
var f1IdleNextW = 0;

function buildIdleScroll() {
  var ns = F1State.nextSession;
  var meeting = ns || F1State.meeting;
  if (!meeting) return;
  // Scroll: circuit name + country only (session name shown in countdown area)
  var parts = [];
  parts.push(meeting.circuit_short_name || meeting.meeting_name || '');
  if (meeting.country_name) parts.push(meeting.country_name);
  parts = parts.filter(Boolean);
  var deduped = [parts[0]];
  for (var pi = 1; pi < parts.length; pi++) {
    if (parts[pi].toUpperCase() !== parts[pi-1].toUpperCase()) deduped.push(parts[pi]);
  }
  const name = deduped.join('  •  ').toUpperCase();
  const text  = '   ' + name + '   ';
  const S     = Math.max(SIZE, 16);

  // Build scrolling text canvas
  const oc = document.createElement('canvas');
  const ctx = oc.getContext('2d');
  let fs = Math.max(6, (S * 0.22)|0);
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fs}px Arial, sans-serif`;
  let tw = (ctx.measureText(text).width)|0;
  const textW = tw > 0 ? tw : 4*S;
  const fullW = textW + S;
  oc.width = fullW;
  oc.height = S;
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,oc.width,oc.height);
  ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, S*0.72);
  f1IdlePixels = ctx.getImageData(0,0,oc.width,oc.height).data;
  f1IdleWidth  = oc.width;
  f1IdleScrollX = 0;

  // Build centered "NEXT" flash canvas (same height, 4*SIZE wide)
  var nc = document.createElement('canvas');
  nc.width = 4*S; nc.height = S;
  var nctx = nc.getContext('2d');
  nctx.fillStyle = '#000'; nctx.fillRect(0,0,nc.width,nc.height);
  nctx.font = `bold ${fs}px Arial, sans-serif`;
  nctx.textAlign = 'center'; nctx.textBaseline = 'middle';
  nctx.fillStyle = '#fff';
  nctx.fillText('NEXT', nc.width/2, S*0.42);
  f1IdleNextPixels = nctx.getImageData(0,0,nc.width,nc.height).data;
  f1IdleNextW = nc.width;
}

function applyBufToFace(face, buf) {
  if (!buf||!faceMap) return;
  const {data, S} = buf, fm = faceMap[face];
  for (let cy=0; cy<S; cy++) for (let cx=0; cx<S; cx++) {
    const pi=(cy*S+cx)*4;
    const r=data[pi]/255, g=data[pi+1]/255, b=data[pi+2]/255;
    if (r+g+b<0.04) continue;
    const lu=(cx*SIZE/S)|0, lv=((S-1-cy)*SIZE/S)|0;
    let mi;
    if (face===0) mi=fm[lv*SIZE+lu];
    else if (face===1) mi=fm[lv*SIZE+lu];
    else if (face===2) mi=fm[lv*SIZE+lu];
    else if (face===3) mi=fm[lv*SIZE+lu];
    else if (face===4) mi=fm[lv*SIZE+lu];
    else if (face===5) mi=fm[lv*SIZE+lu];
    if (mi>=0) setLED(mi, r, g, b);
  }
}

// ── Rebuild face buffers when data changes ──
function rebuildF1FaceBufs() {
  if (!f1DataDirty) return;
  f1DataDirty = false;

  const sessionType = F1State.session.type || '';
  const sTypeLow = sessionType.toLowerCase();
  const isSQ    = sTypeLow.includes('sprint') && sTypeLow.includes('qual');
  const isQuali = !isSQ && sTypeLow.includes('qual');
  const isPrac  = sTypeLow.includes('prac');
  const isSprint= sTypeLow.includes('sprint') && !isSQ;
  const isRace  = !isQuali && !isPrac && !isSQ;
  const timer   = F1State.session.timer;
  const lap     = F1State.session.lap.current || 1;
  const lapTotal = F1State.session.lap.total || '??';
  const minR    = Math.floor(timer.remaining/60);
  const secR    = String(timer.remaining%60).padStart(2,'0');

  const weather = F1State.weather;
  const wcode = (weather.code||0);
  const rainExpected = wcode >= 51;
  const wxIcon = wcode===0?'☀':wcode<=2?'🌤':wcode<=3?'⛅':wcode<=45?'🌫':wcode<=57?'🌦':wcode<=67?'🌧':wcode<=77?'❄':'⛈';

  const flagRGB = F1State.track.flagRGB;
  const bgDim = flagRGB.map(c=>c*0.28);

  const qSession = F1State.session.qSession;
  const fpSession = F1State.session.fpSession;
  const standings = F1State.drivers;

  const applyWaveBg = (ctx, S) => {
    const imgData = ctx.getImageData(0,0,S,S);
    const data = imgData.data;
    const stripeW = Math.max(3, (S/8)|0);
    for(let y=0; y<S; y++) {
      for(let x=0; x<S; x++) {
        const i = (y*S+x)*4;
        const a = data[i+3];
        if (a > 200) continue;
        const diag = (x + y + (t*S*1.5)|0) % (stripeW*2);
        const yWave = Math.sin((y/S)*Math.PI*4 + t*3)*0.3;
        const xWave = Math.cos((x/S)*Math.PI*3 + t*2.5)*0.25;
        const ripple = 0.5 + yWave + xWave;
        let brightness;
        if (diag < stripeW) {
          brightness = 0.7 + ripple*0.2;
        } else {
          brightness = 0.25 + ripple*0.15;
        }
        data[i]   = bgDim[0]*255*brightness;
        data[i+1] = bgDim[1]*255*brightness;
        data[i+2] = bgDim[2]*255*brightness;
        data[i+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // ── FRONT: session type + enlarged lap info ──
  {
    const sColor = isSQ?'#ff88ff':isQuali?'#ffaa44':isPrac?'#88ff88':isSprint?'#ff8800':'#ff5555';
    const S2 = Math.max(SIZE,16);
    const oc = document.createElement('canvas');
    oc.width = S2; oc.height = S2;
    const cx = oc.getContext('2d');
    cx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    cx.fillRect(0,0,S2,S2);
    cx.textAlign='center'; cx.textBaseline='middle';

    let fsTop = Math.max(7,(S2*0.18)|0);
    cx.font=`bold ${fsTop}px Arial`;

    if (isPrac) {
      while(fsTop > 5 && cx.measureText('PRACTICE').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('PRACTICE', S2/2, S2*0.20);
      cx.fillText(`FP${fpSession}`, S2/2, S2*0.38);
    } else if (isQuali) {
      while(fsTop > 5 && cx.measureText('QUALIFYING').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('QUALIFYING', S2/2, S2*0.20);
      cx.fillText(`Q${qSession}`, S2/2, S2*0.38);
    } else {
      let fsRaceLabel = Math.max(8,(S2*0.22)|0);
      cx.font=`bold ${fsRaceLabel}px Arial`;
      while(fsRaceLabel > 6 && cx.measureText('RACE').width > S2*0.92){
        fsRaceLabel--; cx.font = `bold ${fsRaceLabel}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('RACE', S2/2, S2*0.20);
    }

    let fsMid = Math.max(10,(S2*0.38)|0);
    cx.fillStyle='#ffffff';

    if (isQuali || isPrac) {
      const timeText = `${minR}:${secR}`;
      cx.font=`bold ${fsMid}px Arial`;
      while(fsMid > 6 && cx.measureText(timeText).width > S2*0.92){
        fsMid--; cx.font=`bold ${fsMid}px Arial`;
      }
      cx.fillText(timeText, S2/2, S2*0.70);
    } else {
      let fsRace = Math.max(7,(S2*0.22)|0);
      const lapLabel = 'LAP';
      const lapCount = `${lap} of ${lapTotal}`;
      cx.font=`bold ${fsRace}px Arial`;
      const maxWidth = Math.max(cx.measureText(lapLabel).width, cx.measureText(lapCount).width);
      while(fsRace > 5 && maxWidth > S2*0.92){
        fsRace--; cx.font = `bold ${fsRace}px Arial`;
      }
      cx.fillText(lapLabel, S2/2, S2*0.47);
      cx.fillText(lapCount, S2/2, S2*0.70);
    }

    applyWaveBg(cx, S2);
    f1FaceBufs.front = { data: cx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── RIGHT: top 3 leaderboard ──
  {
    const top3 = standings.slice(0,3);
    const abbrevs = top3.map(d=>{
      if (d.abbrev) return d.abbrev.toUpperCase().substring(0,3);
      const name = (d.name||'').replace(/^#\d+\s*/,'').toUpperCase();
      const parts = name.split(' ');
      if(parts.length>1) return parts[parts.length-1].substring(0,3);
      return name.substring(0,3);
    });
    const longest = abbrevs.reduce((a,b)=>a.length>b.length?a:b, '');

    const S2 = Math.max(SIZE,16);
    const c = document.createElement('canvas');
    c.width = c.height = S2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    ctx.fillRect(0,0,S2,S2);
    ctx.textAlign='center'; ctx.textBaseline='middle';

    let fs = Math.max(8, (S2*0.28)|0);
    ctx.font = `bold ${fs}px Arial`;
    while(fs > 5 && ctx.measureText(longest).width > S2*0.85){
      fs--; ctx.font = `bold ${fs}px Arial`;
    }

    const blueH = 4;
    const stripH = Math.max(2, (S2*0.16)|0);
    const usableH = S2 - blueH - stripH - 4;
    const lineH = usableH / 3;
    const colors = ['#FFFF00', '#FFFFFF', '#FF9900'];
    const positions = ['1.', '2.', '3.'];
    const startY = blueH + 2;
    for(let i=0;i<Math.min(3,abbrevs.length);i++){
      ctx.font = `bold ${fs}px Arial`;
      ctx.fillStyle = colors[i];
      const text = positions[i] + ' ' + abbrevs[i];
      ctx.fillText(text, S2/2, startY + (i+0.5)*lineH);
    }

    applyWaveBg(ctx, S2);
    f1FaceBufs.right = { data: ctx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── LEFT: weather ──
  {
    const S2 = Math.max(SIZE,16);
    const c = document.createElement('canvas');
    c.width = c.height = S2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    ctx.fillRect(0,0,S2,S2);
    ctx.textAlign='center'; ctx.textBaseline='middle';

    const blueH = 4;
    const yOffset = blueH / S2;

    ctx.font = `${Math.max(12,(S2*0.35)|0)}px Arial`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(wxIcon, S2/2, S2*(0.20 + yOffset));

    ctx.font = `bold ${Math.max(9,(S2*0.24)|0)}px Arial`;
    ctx.fillStyle = '#ffe566';
    ctx.fillText(`${weather.temp||'--'}°C`, S2/2, S2*(0.45 + yOffset));

    if (rainExpected) {
      ctx.font = `bold ${Math.max(5,(S2*0.12)|0)}px Arial`;
      ctx.fillStyle = '#66aaff';
      ctx.fillText('🌧 RAIN', S2/2, S2*0.75);
    }

    applyWaveBg(ctx, S2);
    f1FaceBufs.left = { data: ctx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── BACK: mirror of front ──
  {
    const sColor = isSQ?'#ff88ff':isQuali?'#ffaa44':isPrac?'#88ff88':isSprint?'#ff8800':'#ff5555';
    const S2 = Math.max(SIZE,16);
    const oc = document.createElement('canvas');
    oc.width = S2; oc.height = S2;
    const cx = oc.getContext('2d');
    cx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    cx.fillRect(0,0,S2,S2);
    cx.textAlign='center'; cx.textBaseline='middle';

    let fsTop = Math.max(7,(S2*0.18)|0);
    cx.font=`bold ${fsTop}px Arial`;

    if (isPrac) {
      while(fsTop > 5 && cx.measureText('PRACTICE').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('PRACTICE', S2/2, S2*0.20);
      cx.fillText(`FP${fpSession}`, S2/2, S2*0.38);
    } else if (isQuali) {
      while(fsTop > 5 && cx.measureText('QUALIFYING').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('QUALIFYING', S2/2, S2*0.20);
      cx.fillText(`Q${qSession}`, S2/2, S2*0.38);
    } else {
      let fsRaceLabel = Math.max(8,(S2*0.22)|0);
      cx.font=`bold ${fsRaceLabel}px Arial`;
      while(fsRaceLabel > 6 && cx.measureText('RACE').width > S2*0.92){
        fsRaceLabel--; cx.font = `bold ${fsRaceLabel}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('RACE', S2/2, S2*0.20);
    }

    let fsMid = Math.max(10,(S2*0.38)|0);
    cx.fillStyle='#ffffff';

    if (isQuali || isPrac) {
      const timeText = `${minR}:${secR}`;
      cx.font=`bold ${fsMid}px Arial`;
      while(fsMid > 6 && cx.measureText(timeText).width > S2*0.92){
        fsMid--; cx.font=`bold ${fsMid}px Arial`;
      }
      cx.fillText(timeText, S2/2, S2*0.70);
    } else {
      let fsRace = Math.max(7,(S2*0.22)|0);
      const lapLabel = 'LAP';
      const lapCount = `${lap} of ${lapTotal}`;
      cx.font=`bold ${fsRace}px Arial`;
      const maxWidth = Math.max(cx.measureText(lapLabel).width, cx.measureText(lapCount).width);
      while(fsRace > 5 && maxWidth > S2*0.92){
        fsRace--; cx.font = `bold ${fsRace}px Arial`;
      }
      cx.fillText(lapLabel, S2/2, S2*0.47);
      cx.fillText(lapCount, S2/2, S2*0.70);
    }

    applyWaveBg(cx, S2);
    f1FaceBufs.back = { data: cx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── BOTTOM: completely black ──
  {
    const S2 = Math.max(SIZE,16);
    const c = document.createElement('canvas');
    c.width = c.height = S2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,S2,S2);
    f1FaceBufs.bottom = { data: ctx.getImageData(0,0,S2,S2).data, S: S2 };
  }
}

function effectF1(dt){
  t += dt*0.5;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const sessionActive = F1State.session.active;
  const isFinished = F1State.session.finished;
  const flagRGB = F1State.track.flagRGB;
  const statusText = F1State.track.statusText;
  const blueFlagActive = !!F1State.track.blueFlag;
  const bwFlagActive = !!F1State.track.bwFlag;
  const carPositions = F1State.carPositions;
  const standings = F1State.drivers;

  // ── IDLE: no session — chequered top + large scroll ──
  if (!sessionActive) {
    if (!f1IdleRebuildT) f1IdleRebuildT = 0;
    f1IdleRebuildT += dt;
    if (f1IdleRebuildT > 60) { f1IdleRebuildT = 0; buildIdleScroll(); }
    const champ = F1State.championshipStandings;
    const top3champ = champ && champ.length >= 3 ? champ.slice(0,3) : null;

    const sq = Math.max(2, (SIZE/8)|0);
    const pulse = 0.45 + Math.sin(t*2)*0.35;
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const isW = (((u/sq)|0) + ((v/sq)|0)) % 2 === 0;
      const bright = isW ? pulse*0.3 : 0.01;
      const i = faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, bright, bright, bright);
    }

    {
      var lines = [];
      if (top3champ && top3champ.length) {
        lines = top3champ.map(d => d.pos + '. ' + d.abbrev + ' ' + d.points);
      } else if (standings.length) {
        lines = standings.slice(0,3).map((d,i) => {
            let a = d.abbrev ? d.abbrev.toUpperCase().substring(0,3) : '';
            if (!a) { const p = (d.name||'').replace(/^#\d+\s*/,'').toUpperCase().split(' '); a = p.length>1 ? p[p.length-1].substring(0,3) : (p[0]||'').substring(0,3); }
            return (i+1) + '. ' + a;
          });
      }
      const longest = lines.reduce((a,b)=>a.length>b.length?a:b, '');
      const cacheKey = lines.join('|') || '__empty__';
      if(f1FaceBufs._lastIdleTop3!==cacheKey){
        f1FaceBufs._lastIdleTop3 = cacheKey;
        const c = document.createElement('canvas');
        c.width = c.height = SIZE;
        const ctx = c.getContext('2d');
        ctx.textAlign='center'; ctx.textBaseline='middle';
        let fs = Math.max(10, (SIZE*0.32)|0);
        ctx.font = `bold ${fs}px Arial`;
        while(fs > 6 && ctx.measureText(longest).width > SIZE*0.88){
          fs--; ctx.font = `bold ${fs}px Arial`;
        }
        const lineH = SIZE / 3;
        const colors = ['#FFEE00', '#FFFFFF', '#FF8800'];
        const sw = Math.max(2, (SIZE/16)|0);
        for(let i=0;i<Math.min(3,lines.length);i++){
          ctx.font = `bold ${fs}px Arial`;
          ctx.strokeStyle = '#000';
          ctx.lineWidth = sw;
          ctx.lineJoin = 'round';
          ctx.strokeText(lines[i], SIZE/2, (i+0.5)*lineH);
          ctx.fillStyle = colors[i];
          ctx.fillText(lines[i], SIZE/2, (i+0.5)*lineH);
        }
        f1FaceBufs.idleTop3 = {data:ctx.getImageData(0,0,SIZE,SIZE).data, S:SIZE};
      }
      if(f1FaceBufs.idleTop3){
        const {data,S}=f1FaceBufs.idleTop3;
        for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
          const pi=(v*S+u)*4;
          const r=data[pi]/255, g=data[pi+1]/255, b=data[pi+2]/255, a=data[pi+3]/255;
          if(a>0.10){const i=faceMap[4][v*SIZE+u]; if(i>=0) setLED(i,r*a,g*a,b*a);}
        }
      }
    }

    {
      const sq = Math.max(2, (SIZE/8)|0);
      const basePulse = 0.3 + Math.sin(t*2)*0.15;
      for(let sp=0; sp<4*SIZE; sp++) {
        for(let v=0; v<SIZE; v++) {
          const isW = (((sp/sq)|0) + ((v/sq)|0)) % 2 === 0;
          const waveX = Math.sin((sp/(4*SIZE))*Math.PI*2 + t*2)*0.3;
          const waveY = Math.sin((v/SIZE)*Math.PI*2 + t*2.5)*0.3;
          const bright = isW ? Math.max(0.01, (basePulse+waveX+waveY)*0.25) : 0.005;
          setStripLED(sp, v, bright, bright, bright);
        }
      }
    }

    {
      var ns = F1State.nextSession;
      var cdSrc = ns || F1State.meeting;
      if (cdSrc && cdSrc.date_start) {
        var cdMs = new Date(cdSrc.date_start).getTime() - Date.now();
        if (cdMs < 0) cdMs = 0;
        var cdSec = Math.floor(cdMs / 1000);
        var cdD = Math.floor(cdSec / 86400);
        var cdH = Math.floor((cdSec % 86400) / 3600);
        var cdM = Math.floor((cdSec % 3600) / 60);
        var cdS = cdSec % 60;
        var cdText = (cdD > 0 ? cdD + 'd ' : '') +
          (cdD > 0 || cdH > 0 ? cdH + ':' : '') +
          ((cdD > 0 || cdH > 0) ? String(cdM).padStart(2,'0') : cdM) + ':' +
          String(cdS).padStart(2,'0');
        var _cdNs = F1State.nextSession;
        var _cdSessName = _cdNs ? (_cdNs.session_name || _cdNs.session_type || '') : '';
        var cdKey = cdText + '|' + _cdSessName;
        var cdUrgent = cdSec <= 60;
        if (!f1FaceBufs._cdKey || f1FaceBufs._cdKey !== cdKey) {
          f1FaceBufs._cdKey = cdKey;
          var cc = document.createElement('canvas');
          cc.width = SIZE; cc.height = SIZE;
          var cctx = cc.getContext('2d');
          var cfs = Math.max(8, (SIZE * 0.18)|0);
          cctx.font = 'bold ' + cfs + 'px Arial';
          cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
          var csw = Math.max(1, (SIZE/20)|0);
          cctx.strokeStyle = '#000';
          cctx.lineWidth = csw;
          cctx.lineJoin = 'round';
          var cy = SIZE * 0.14;
          cctx.strokeText(cdText, SIZE/2, cy);
          cctx.fillStyle = cdUrgent ? '#ff4444' : '#88bbff';
          cctx.fillText(cdText, SIZE/2, cy);
          // Session name below the time (static, not scrolling)
          if (_cdSessName) {
            var snLabel = _cdSessName.toUpperCase();
            var sfs = Math.max(5, (SIZE * 0.13)|0);
            cctx.font = 'bold ' + sfs + 'px Arial';
            while (sfs > 5 && cctx.measureText(snLabel).width > SIZE * 0.92) {
              sfs--; cctx.font = 'bold ' + sfs + 'px Arial';
            }
            var sy = SIZE * 0.30;
            cctx.strokeStyle = '#000'; cctx.lineWidth = csw;
            cctx.strokeText(snLabel, SIZE/2, sy);
            cctx.fillStyle = '#ffcc44';
            cctx.fillText(snLabel, SIZE/2, sy);
          }
          f1FaceBufs._cdBuf = { data: cctx.getImageData(0,0,SIZE,SIZE).data, S: SIZE };
        }
        if (f1FaceBufs._cdBuf) {
          var cbd = f1FaceBufs._cdBuf;
          var cdBr = cdUrgent ? (0.8 + Math.sin(t * 8) * 0.2) : 1.0;
          for (var panel = 0; panel < 4; panel++) {
            var ps = panel * SIZE;
            for (var sp = ps; sp < ps + SIZE; sp++) {
              for (var cv = 0; cv < SIZE; cv++) {
                var dx = sp - ps;
                var cpi = (cv * cbd.S + dx) * 4;
                var ca = cbd.data[cpi + 3] / 255;
                if (ca < 0.05) continue;
                var vOff = cdUrgent ? Math.sin((sp / (4*SIZE)) * Math.PI * 6 + t * 10) * 1.5 : 0;
                var dv = cv + Math.round(vOff);
                if (dv < 0 || dv >= SIZE) continue;
                var cr = cbd.data[cpi] / 255 * ca * cdBr;
                var cg = cbd.data[cpi+1] / 255 * ca * cdBr;
                var cb2 = cbd.data[cpi+2] / 255 * ca * cdBr;
                setStripLED(sp, dv, cr, cg, cb2);
              }
            }
          }
        }
      }
    }

    var _cdSecForScroll = -1;
    {
      var _cdSrc2 = (F1State.nextSession || F1State.meeting);
      if (_cdSrc2 && _cdSrc2.date_start) {
        var _cdMs2 = new Date(_cdSrc2.date_start).getTime() - Date.now();
        _cdSecForScroll = Math.floor(_cdMs2 / 1000);
      }
    }

    if (_cdSecForScroll >= 0 && _cdSecForScroll <= 60) {
      var flashText, flashColor;
      if (_cdSecForScroll <= 0) {
        flashText = 'GO!'; flashColor = '#00ff00';
      } else if (_cdSecForScroll <= 5) {
        flashText = String(_cdSecForScroll); flashColor = '#ff2200';
      } else {
        var halfSec = Math.floor(Date.now() / 700) % 4;
        if (halfSec === 0) { flashText = 'WARMUP\nLAP'; flashColor = '#ff4444'; }
        else if (halfSec === 1) { flashText = null; }
        else if (halfSec === 2) { flashText = 'READY'; flashColor = '#ffaa00'; }
        else { flashText = null; }
      }
      if (flashText) {
        var fKey = '_flash_' + flashText;
        if (f1FaceBufs._flashKey !== fKey) {
          f1FaceBufs._flashKey = fKey;
          var fc = document.createElement('canvas');
          fc.width = SIZE; fc.height = SIZE;
          var fctx = fc.getContext('2d');
          var flashLines = flashText.split('\n');
          var longestLine = flashLines.reduce(function(a,b){return a.length>b.length?a:b;}, '');
          var ffs = Math.max(10, (SIZE * 0.45)|0);
          fctx.font = 'bold ' + ffs + 'px Arial';
          fctx.textAlign = 'center'; fctx.textBaseline = 'middle';
          while (ffs > 8 && fctx.measureText(longestLine).width > SIZE * 0.9) {
            ffs--; fctx.font = 'bold ' + ffs + 'px Arial';
          }
          var fsw = Math.max(2, (SIZE/14)|0);
          fctx.strokeStyle = '#000'; fctx.lineWidth = fsw; fctx.lineJoin = 'round';
          var totalH = flashLines.length * ffs * 1.15;
          var startY = SIZE * 0.42 - totalH / 2 + ffs * 0.575;
          for (var li = 0; li < flashLines.length; li++) {
            var ly = startY + li * ffs * 1.15;
            fctx.font = 'bold ' + ffs + 'px Arial';
            fctx.strokeText(flashLines[li], SIZE/2, ly);
            fctx.fillStyle = flashColor;
            fctx.fillText(flashLines[li], SIZE/2, ly);
          }
          f1FaceBufs._flashBuf = { data: fctx.getImageData(0,0,SIZE,SIZE).data, S: SIZE };
        }
        if (f1FaceBufs._flashBuf) {
          var fbd = f1FaceBufs._flashBuf;
          for (var fp = 0; fp < 4; fp++) {
            var fps2 = fp * SIZE;
            for (var fsp = fps2; fsp < fps2 + SIZE; fsp++) {
              for (var fv = 0; fv < SIZE; fv++) {
                var fdx = fsp - fps2;
                var fpi = (fv * fbd.S + fdx) * 4;
                var fa = fbd.data[fpi + 3] / 255;
                if (fa < 0.05) continue;
                var fr2 = fbd.data[fpi] / 255 * fa;
                var fg2 = fbd.data[fpi+1] / 255 * fa;
                var fb2 = fbd.data[fpi+2] / 255 * fa;
                setStripLED(fsp, fv, fr2, fg2, fb2);
              }
            }
          }
        }
      }
      if (_cdSecForScroll <= 0 && !f1FaceBufs._goTriggered) {
        f1FaceBufs._goTriggered = true;
        setTimeout(function() {
          if (typeof simSession === 'function') {
            simSession('Race');
            if (typeof applyF1Flag === 'function') applyF1Flag('GREEN');
          }
          f1FaceBufs._goTriggered = false;
        }, 1500);
      }
    } else {
      f1FaceBufs._goTriggered = false;
      f1IdlePhaseT += dt;
      // Phase 0: flash NEXT (2s), Phase 1: blank (0.3s), Phase 2: scroll
      if (f1IdlePhase === 0) {
        if (f1IdlePhaseT > 2.0) { f1IdlePhase = 1; f1IdlePhaseT = 0; }
        else if (f1IdleNextPixels && f1IdleNextW > 0) {
          var flashOn = Math.floor(f1IdlePhaseT / 0.5) % 2 === 0;
          if (flashOn) {
            for(let sv=0;sv<SIZE;sv++){
              for(let sp=0;sp<4*SIZE;sp++){
                const srcX = sp % f1IdleNextW;
                const pv = f1IdleNextPixels[(sv*f1IdleNextW+srcX)*4]/255;
                if(pv<0.04) continue;
                const h=(sp/(4*SIZE)+t*0.03)%1;
                const [r,g,b]=hsl(h,1,pv);
                setStripLED(sp, sv, r, g, b);
              }
            }
          }
        }
      } else if (f1IdlePhase === 1) {
        if (f1IdlePhaseT > 0.3) { f1IdlePhase = 2; f1IdlePhaseT = 0; f1IdleScrollX = 0; }
      } else if (f1IdlePhase === 2) {
        if (f1IdlePixels && f1IdleWidth > 0) {
          f1IdleScrollX = (f1IdleScrollX + dt*SIZE*0.35) % f1IdleWidth;
          var ox = f1IdleScrollX|0;
          for(let sv=0;sv<SIZE;sv++){
            for(let sp=0;sp<4*SIZE;sp++){
              const srcX = (sp + ox) % f1IdleWidth;
              const pv   = f1IdlePixels[(sv*f1IdleWidth+srcX)*4]/255;
              if(pv<0.04) continue;
              const h=(sp/(4*SIZE)+t*0.03)%1;
              const [r,g,b]=hsl(h,1,pv);
              setStripLED(sp, sv, r, g, b);
            }
          }
        }
      }
    }

    {
      var ns = F1State.nextSession;
      var src = ns || F1State.meeting;
      if (src && src.date_start) {
        var cacheKey = src.date_start;
        if (!f1FaceBufs._idleDateKey || f1FaceBufs._idleDateKey !== cacheKey) {
          f1FaceBufs._idleDateKey = cacheKey;
          var dd = new Date(src.date_start);
          var line1 = dd.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
          var line2 = dd.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
          var lineH = Math.max(5, (SIZE*0.17)|0);
          var totalH = lineH * 2 + 1;

          var dc = document.createElement('canvas');
          dc.width = SIZE; dc.height = totalH;
          var dctx = dc.getContext('2d');
          dctx.fillStyle = '#000'; dctx.fillRect(0,0,dc.width,totalH);
          var fs = Math.max(6, (lineH*0.88)|0);
          dctx.font = 'bold ' + fs + 'px Arial';
          dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
          dctx.fillStyle = '#ddeeff';
          dctx.fillText(line1, dc.width/2, lineH/2);
          dctx.fillStyle = '#ffffff';
          dctx.fillText(line2, dc.width/2, lineH + 1 + lineH/2);

          f1FaceBufs._idleDate = { data: dctx.getImageData(0,0,dc.width,totalH).data, w: SIZE, h: totalH };
        }
        if (f1FaceBufs._idleDate) {
          var buf = f1FaceBufs._idleDate;
          var dateY_start = SIZE - buf.h - 1;
          for(var panel=0; panel<4; panel++) {
            var panelStart = panel * SIZE;
            for(var sp=panelStart; sp<panelStart+SIZE; sp++) {
              for(var dy=0; dy<buf.h; dy++) {
                var dx = sp - panelStart;
                var pi = (dy*buf.w + dx)*4;
                var pv = buf.data[pi]/255;
                if(pv<0.05) continue;
                var v = dateY_start + dy;
                setStripLED(sp, v, pv*0.85, pv*0.9, pv);
              }
            }
          }
        }
      }
    }
    return;
  }

  rebuildF1FaceBufs();

  // ── TOP: flag colour + status ──
  const [fr,fg,fb] = flagRGB;
  const pulse = (fr>0||fg>0||fb>0) ? 0.7+Math.sin(t*3)*0.3 : 0.08;

  if (isFinished) {
    const sq = Math.max(2,(SIZE/8)|0);
    const cp = 0.45 + Math.sin(t*2)*0.35;
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const isW = (((u/sq)|0)+((v/sq)|0)) % 2 === 0;
      const i = faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, isW?cp:0.02, isW?cp:0.02, isW?cp:0.02);
    }

    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d');
    ctx.textAlign='center'; ctx.textBaseline='middle';
    let fs = Math.max(12, (SIZE*0.40)|0);
    ctx.font = `bold ${fs}px Arial`;
    while(fs > 8 && ctx.measureText('FINISH').width > SIZE*0.90){
      fs--; ctx.font = `bold ${fs}px Arial`;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText('FINISH', SIZE/2, SIZE/2);
    const finishData = ctx.getImageData(0,0,SIZE,SIZE).data;

    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const pv=finishData[(v*SIZE+u)*4]/255;
      if(pv>0.15){
        const i=faceMap[4][v*SIZE+u];
        if(i>=0) {
          const dx = u - SIZE/2;
          const dy = v - SIZE/2;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const explosionPhase = t * 3;
          const particleOffset = Math.sin(explosionPhase + dist*0.1) * 0.3;
          const particle = Math.max(0, (1 - (explosionPhase % 1)) * (1 + particleOffset));
          const hue = (u/SIZE + v/SIZE + t*0.5) % 1;
          const light = 0.5 + particle*0.5;
          const [r,g,b] = hsl(hue, 1, light);
          setLED(i, r, g, b);
        }
      }
    }
  } else {
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const i=faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, fr*pulse*0.7, fg*pulse*0.7, fb*pulse*0.7);
    }
    if(carPositions && carPositions.length){
      drawF1TrackWithCars();
    }
  }

  if(statusText && statusText!=='--' && !isFinished && !(carPositions && carPositions.length)){
    if(!f1FaceBufs._lastStatus || f1FaceBufs._lastStatus!==statusText){
      f1FaceBufs._lastStatus = statusText;
      const oc=document.createElement('canvas'); oc.width=SIZE; oc.height=SIZE;
      const cx=oc.getContext('2d');
      const lines = statusText.split(' ');
      const multiLine = lines.length > 1 && cx.measureText(statusText).width > SIZE*0.7;
      let fh = Math.max(8,(SIZE*0.38)|0);
      cx.font=`bold ${fh}px Arial`;
      const fitText = multiLine ? lines.reduce((a,b) => cx.measureText(a).width > cx.measureText(b).width ? a : b) : statusText;
      while(fh > 4 && cx.measureText(fitText).width > SIZE*0.92){
        fh--; cx.font=`bold ${fh}px Arial`;
      }
      cx.fillStyle='rgba(0,0,0,0)'; cx.clearRect(0,0,SIZE,SIZE);
      cx.fillStyle='#fff';
      cx.textAlign='center'; cx.textBaseline='middle';
      if (multiLine) {
        const gap = fh * 1.15;
        const startY = SIZE/2 - (lines.length - 1) * gap / 2;
        for (let li = 0; li < lines.length; li++) {
          cx.fillText(lines[li], SIZE/2, startY + li * gap);
        }
      } else {
        cx.fillText(statusText, SIZE/2, SIZE/2);
      }
      f1FaceBufs.status={data:cx.getImageData(0,0,SIZE,SIZE).data,S:SIZE};
    }
    if(f1FaceBufs.status){
      const {data,S}=f1FaceBufs.status;
      for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
        const pv=data[(v*S+u)*4]/255;
        if(pv>0.15){const i=faceMap[4][v*SIZE+u]; if(i>=0) setLED(i,pv,pv,pv);}
      }
    }
  }

  applyBufToFace(0, f1FaceBufs.front);
  if (f1FaceBufs.back) applyBufToFace(1, f1FaceBufs.back);
  applyBufToFace(2, f1FaceBufs.right);
  applyBufToFace(3, f1FaceBufs.left);
  applyBufToFace(5, f1FaceBufs.bottom);

  // ── SIDE PANELS: dynamic wave effect overlay ──
  {
    const waveAmp = 0.2;
    const textThreshold = 0.3;
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let v=0; v<SIZE; v++) {
        const seg = (sp/SIZE)|0, u = sp%SIZE;
        const fv  = SIZE-1-v;
        let face, fu;
        if (seg===0){ face=0; fu=u;         }
        else if(seg===1){ face=2; fu=u;         }
        else if(seg===2){ face=1; fu=u;         }
        else if(seg===3){ face=3; fu=u;         }
        else continue;
        const meshIdx = faceMap[face][fv*SIZE+fu];
        if(meshIdx >= 0) {
          const colorBase = meshIdx*3;
          const r = colBuf[colorBase];
          const g = colBuf[colorBase+1];
          const b = colBuf[colorBase+2];
          const brightness = Math.max(r, g, b);
          if(brightness < textThreshold) {
            const waveX = Math.sin((sp/(4*SIZE))*Math.PI*2 + t*1.8)*waveAmp;
            const waveY = Math.sin((v/SIZE)*Math.PI*2 + t*2.2)*waveAmp;
            const waveMod = 0.5 + (waveX + waveY)*0.7;
            colBuf[colorBase  ] *= waveMod;
            colBuf[colorBase+1] *= waveMod;
            colBuf[colorBase+2] *= waveMod;
          }
        }
      }
    }
  }
  mesh.instanceColor.needsUpdate = true;

  // ── BLUE FLAG: top 4 rows of all 4 side panels ──
  if (blueFlagActive) {
    const bluePulse = 0.35 + Math.sin(t*6)*0.35;
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let v=0; v<4; v++) {
        setStripLED(sp, v, 0, bluePulse*0.3, bluePulse);
      }
    }
  }

  // ── BLACK & WHITE FLAG: top 4 rows, alternating black/white squares ──
  if (bwFlagActive) {
    const bwPulse = 0.5 + Math.sin(t*4)*0.3;
    const bwSq = 2;
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let v=0; v<4; v++) {
        const isW = (((sp/bwSq)|0) + ((v/bwSq)|0)) % 2 === 0;
        const br = isW ? bwPulse : 0.02;
        setStripLED(sp, v, br, br, br);
      }
    }
  }

  if(f1CircuitStrip && sessionActive && f1CircuitStripW > 0) {
    f1CircuitScrollX = (f1CircuitScrollX + dt*SIZE*0.35) % f1CircuitStripW;
    const stripH  = Math.max(2, (SIZE*0.16)|0);
    const srcRows = (f1CircuitStrip.length / (f1CircuitStripW*4))|0;
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let j=0; j<stripH; j++) {
        const v    = SIZE-1-j;
        const srcX = ((sp + (f1CircuitScrollX|0)) % f1CircuitStripW + f1CircuitStripW) % f1CircuitStripW;
        const srcY = Math.floor((stripH-1-j) * srcRows / stripH);
        const pi   = (srcY*f1CircuitStripW + srcX)*4;
        const pv   = f1CircuitStrip[pi]/255;
        if(pv<0.05) continue;
        setStripLED(sp, v, pv*0.95, pv*0.72, 0);
      }
    }
  }
}

function applyF1Flag(flag, status='') {
  const F = flag ? flag.toUpperCase() : '';
  let rgb=[0,0,0], label='Idle', css='#111', stext='--';

  const S = status ? status.toUpperCase() : '';
  if (status) {
    if (S.includes('VIRTUAL')) stext='VSC';
    else if (S.includes('SAFETY')) stext='SC';
    else if (S.includes('STARTED')) stext='LIVE';
    else if (S.includes('ENDED')) stext='END';
    else stext = S.substring(0,4);
  }

  let finished = false;
  if (F.includes('CHEQUERED')||F.includes('CHECKERED')||S.includes('FINISHED')) {
    finished = true;
    rgb=[1,1,1]; label='FINISHED'; stext='FINISHED'; css='#ffffff';
  }
  else {
    if (F.includes('BLUE')) {
      f1Update({ track: { blueFlag: true } });
      const flagEl=document.getElementById('f1-flag');
      const textEl=document.getElementById('f1-status-text');
      if(flagEl) flagEl.style.background='#0055ff';
      if(textEl) textEl.textContent='BLUE FLAG';
      return;
    }
    if (F.includes('BLACK AND WHITE') || F.includes('BLACK & WHITE')) {
      f1Update({ track: { bwFlag: true } });
      const flagEl=document.getElementById('f1-flag');
      const textEl=document.getElementById('f1-status-text');
      if(flagEl) flagEl.style.background='#888';
      if(textEl) textEl.textContent='BLACK & WHITE';
      return;
    }
    if (F.includes('RED'))          { rgb=[1,.02,.02]; label='RED FLAG';  stext='RED';    css='#ff2200'; }
    else if (F.includes('VIRTUAL')||S.includes('VIRTUAL')) { rgb=[1,.9,0]; label='VIRTUAL SC'; stext='VSC'; css='#ffcc00'; }
    else if (F.includes('SAFETY') ||S.includes('SAFETY'))  { rgb=[1,.9,0]; label='SAFETY CAR'; stext='SC';  css='#ffcc00'; }
    else if (F.includes('DOUBLE YELLOW')) { rgb=[1,.88,0]; label='DOUBLE YELLOW'; stext='DOUBLE YELLOW'; css='#ffcc00'; }
    else if (F.includes('YELLOW'))  { rgb=[1,.88,0];   label='YELLOW';    stext='YELLOW'; css='#ffcc00'; }
    else if (F.includes('GREEN')||F.includes('CLEAR')) { rgb=[.02,1,.1]; label='GO'; stext='GO'; css='#00ff44'; f1Update({ track: { blueFlag: false, bwFlag: false } }); }
    else if (stext !== '--') { rgb=[.3,.6,1]; label=stext; }
  }

  f1Update({
    session: { finished },
    track: { flag: F.toLowerCase() || 'none', flagRGB: rgb, flagLabel: label, statusText: stext }
  });
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = css;
  if (textEl) textEl.textContent = label;
}

function updateLeaderboardUI() {
  const standings = F1State.drivers;
  const list = document.getElementById('f1-board-list');
  if (!list || standings.length === 0) return;
  list.innerHTML = standings.slice(0,10).map(d =>
    `<div style="display:flex;gap:4px;line-height:1.4;font-size:11px;">
      <span style="color:#aaa;min-width:14px;">${d.pos}.</span>
      <span style="flex:1;color:#eee;">${d.name}</span>
      <span style="color:${d.gap==='LEAD'?'#4f4':'#fa0'};font-size:10px;">${d.gap}</span>
    </div>`
  ).join('');
}

function updateWeatherUI() {
  f1DataDirty = true;
}

function updateSessionUI() {
  const typeEl  = document.getElementById('f1-session-type');
  const timerEl = document.getElementById('f1-session-timer');
  const lapsEl  = document.getElementById('f1-laps-info');
  if (!typeEl || !timerEl || !lapsEl) return;

  const sessionType = F1State.session.type || '';
  const timer = F1State.session.timer;

  const sLower = sessionType.toLowerCase();
  const isSQ = sLower.includes('sprint') && sLower.includes('qual');
  const isSprint = sLower.includes('sprint') && !sLower.includes('qual');
  if (isSQ) {
    typeEl.textContent = '🏁 SPRINT QUALIFYING';
    const min = Math.floor(timer.remaining / 60);
    const sec = timer.remaining % 60;
    timerEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  } else if (sLower.includes('qual')) {
    typeEl.textContent = `🏁 QUALIFYING Q${F1State.session.qSession || 1}`;
    const min = Math.floor(timer.remaining / 60);
    const sec = timer.remaining % 60;
    timerEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  } else if (sLower.includes('prac')) {
    typeEl.textContent = `🔧 PRACTICE FP${F1State.session.fpSession || 1}`;
    const min = Math.floor(timer.remaining / 60);
    const sec = timer.remaining % 60;
    timerEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  } else if (isSprint) {
    typeEl.textContent = '⚡ SPRINT';
    lapsEl.textContent = `Lap ${F1State.session.lap.current || 1}/${F1State.session.lap.total || '??'}`;
  } else if (sLower.includes('race')) {
    typeEl.textContent = '🏎️ RACE';
    lapsEl.textContent = `Lap ${F1State.session.lap.current || 1}/${F1State.session.lap.total || '??'}`;
  } else {
    typeEl.textContent = sessionType.toUpperCase() || 'Standby';
  }
}

function f1SetStatus(state){
  const ind=document.getElementById('f1-status-indicator');
  const lbl=document.getElementById('f1-status-label');
  if(!ind) return;
  if(state==='transfer'){ ind.style.background='#3af'; if(lbl&&!lbl.dataset.sessioninfo) lbl.textContent='Transferring…'; }
  else if(state==='ok'){ ind.style.background='#4f4'; if(lbl&&!lbl.dataset.sessioninfo) lbl.textContent='Connected'; }
  else if(state==='error'){ ind.style.background='#f44'; if(lbl) lbl.textContent='API error'; }
}
