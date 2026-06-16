const F1_API = ''; // relative URLs — works from any host (ESP32, localhost, etc.)

let f1MeetingData = null;   // next race meeting info
let f1FaceBufs = {};       // pre-rendered pixel buffers per face
let f1DataDirty = true;    // true = rebuild face buffers next frame
let f1SessionType = '';     // 'qualifying' or 'race'
let f1QSession = 1;         // Q1, Q2, or Q3
let f1FPSession = 1;        // FP1, FP2, or FP3
let f1Standings   = [];     // [{pos, driver, time/gap}]
let f1SessionTime = {duration:0, elapsed:0, remaining:0};
let f1Weather     = {};     // {temp, condition, humidity, wind}
let f1FlagRGB     = [0,0,0]; // live flag colour (0..1 each)
let f1FlagLabel   = '';
let f1StatusText  = '';      // VSC, SC, RED, YELLOW, NONE, etc
let f1TrackBuf    = null;   // Uint8Array SIZE×SIZE, pre-rendered track pixels
let f1ScrollX         = 0;
let f1TextPixels      = null;
let f1TextWidth       = 0;
let f1CircuitStrip    = null;  // bottom strip pixels
let f1CircuitStripW   = 0;
let f1CircuitScrollX  = 0;
let f1SessionActive   = false;
let f1AutoModeType    = null;  // tracks which live mode the API auto-triggered
let f1BlueFlagActive  = false;
let f1IsFinishedMode  = false;
let f1CarPositions    = [];
let f1CarTrackPts     = null;
let f1IdlePixels      = null;  // scrolling idle screen pixel buffer
let f1IdleWidth       = 0;
let f1IdleScrollX     = 0;

// Simple BLUE flag handler (just toggles the blue flag overlay)
function f1SimBlueFlag() {
  f1BlueFlagActive = !f1BlueFlagActive;  // Toggle on/off
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (f1BlueFlagActive) {
    if (flagEl) flagEl.style.background = '#0055ff';
    if (textEl) textEl.textContent = 'BLUE FLAG';
  } else {
    if (flagEl) flagEl.style.background = '#111';
    if (textEl) textEl.textContent = f1FlagLabel || 'Idle';
  }
}

// Direct FINISH mode handler
function setFinishMode() {
  f1IsFinishedMode = true;
  f1SessionActive = true;
  activateF1Mode();
  f1StatusText = 'FINISHED';
  f1FlagRGB = [1,1,1];
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = '#ffffff';
  if (textEl) textEl.textContent = 'FINISHED';
}

// Simulate session type (Race, Qualifying, Practice)
function f1SimSessionType(sessionType) {
  activateF1Mode();
  f1SessionActive = true;
  f1IsFinishedMode = false;
  f1SessionType = sessionType;

  // Set up demo session data if not already set
  if (!f1MeetingData) {
    f1MeetingData = { meeting_name:'British Grand Prix', circuit_short_name:'Silverstone', date_start:'2025-07-06' };
    document.getElementById('f1-race-name').textContent = f1MeetingData.meeting_name;
    document.getElementById('f1-race-date').textContent = 'Sun Jul 6';
    buildScrollText(f1MeetingData);
    buildCircuitStrip();
    buildIdleScroll();
  }
  if (!f1Weather.temp) { f1Weather = { temp:18, code:2, humidity:65, wind:12 }; }
  if (!f1Standings.length) {
    f1Standings = [
      { pos:1, name:'Verstappen', gap:'LEAD' },
      { pos:2, name:'Norris',     gap:'+4.2s' },
      { pos:3, name:'Leclerc',    gap:'+9.1s' },
    ];
  }

  // Set session-specific timing
  if (sessionType === 'Qualifying') {
    // Cycle through Q1, Q2, Q3
    f1QSession = (f1QSession % 3) + 1;
    f1SessionTime = { duration:3600, elapsed:1800, remaining:1800 };
    f1StatusText = `Q${f1QSession}`;
    f1FlagRGB = [.02,1,.1];
  } else if (sessionType === 'Practice') {
    // Cycle through FP1, FP2, FP3
    f1FPSession = (f1FPSession % 3) + 1;
    f1SessionTime = { duration:5400, elapsed:2700, remaining:2700 };
    f1StatusText = `FP${f1FPSession}`;
    f1FlagRGB = [.02,1,.1];
  } else { // Race
    f1SessionTime = { duration:7200, elapsed:1800, remaining:5400 };
    f1StatusText = 'LIVE';
    f1FlagRGB = [.02,1,.1];
  }

  f1DataDirty = true;
  applyF1Flag(null, 'GREEN');
  updateLeaderboardUI();
  updateSessionUI();
}

// Auto-triggered by the live API when a real session is detected.
// Like f1SimSessionType but preserves live data and updates session label.
function f1AutoTriggerMode(modeType, sessionName) {
  activateF1Mode();
  f1SessionActive = true;
  f1IsFinishedMode = false;
  f1SessionType = (sessionName || modeType).toLowerCase();

  if (modeType === 'Qualifying') {
    // Detect Q1/Q2/Q3 or SQ from name
    const m = (sessionName||'').match(/(\d)/);
    f1QSession = m ? parseInt(m[1]) : 1;
    f1StatusText = sessionName ? sessionName.toUpperCase() : `Q${f1QSession}`;
  } else if (modeType === 'Practice') {
    const m = (sessionName||'').match(/(\d)/);
    f1FPSession = m ? parseInt(m[1]) : 1;
    f1StatusText = sessionName ? sessionName.toUpperCase() : `FP${f1FPSession}`;
  } else {
    f1StatusText = 'LIVE';
  }
  f1FlagRGB = [.02,1,.1];

  f1DataDirty = true;
  applyF1Flag(null, 'GREEN');
  updateLeaderboardUI();
  updateSessionUI();
}

// Detailed track outlines (high-res points for better rendering)
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

// Bresenham line into Uint8Array
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

// Draw the track outline + approximate car positions onto the top panel.
// Uses mini-sector approximation: each car's lap-progress fraction maps to a
// point along the track outline.
function drawF1TrackWithCars(){
  if (!f1MeetingData) return;
  // Build/cache normalised track points
  const pts = getTrackPts(f1MeetingData.meeting_name || f1MeetingData.circuit_short_name || '');
  if (!pts || pts.length < 2) return;

  // Render track outline faintly on top panel
  const S = SIZE;
  // Draw track as dim line via the points
  for (let k=0;k<pts.length-1;k++){
    const [x0,y0]=pts[k], [x1,y1]=pts[k+1];
    const steps = Math.max(2, Math.round(Math.hypot((x1-x0)*S,(y1-y0)*S)));
    for (let s=0;s<=steps;s++){
      const fx=x0+(x1-x0)*s/steps, fy=y0+(y1-y0)*s/steps;
      const u=Math.round(fx*(S-1)), v=Math.round(fy*(S-1));
      const i=faceMap[4][v*S+u];
      if(i>=0) setLED(i, 0.12,0.12,0.16); // dim grey-blue track
    }
  }

  // Compute cumulative arc-length so frac maps evenly around the lap
  const segLen=[]; let total=0;
  for (let k=0;k<pts.length-1;k++){
    const d=Math.hypot(pts[k+1][0]-pts[k][0], pts[k+1][1]-pts[k][1]);
    segLen.push(d); total+=d;
  }

  // Place each car dot
  for (const car of f1CarPositions){
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
    // Parse colour
    let r=1,g=1,b=1;
    if (car.colour && car.colour[0]==='#' && car.colour.length>=7){
      r=parseInt(car.colour.slice(1,3),16)/255;
      g=parseInt(car.colour.slice(3,5),16)/255;
      b=parseInt(car.colour.slice(5,7),16)/255;
    }
    const cu=Math.round(px*(S-1)), cv=Math.round(py*(S-1));
    // Draw a small glowing dot (3x3)
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
  // Use HTML5 canvas for smooth rendering
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,S,S);

  // Draw track outline
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 12;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  const [x0,y0] = pts[0];
  ctx.moveTo(x0*S, y0*S);
  for (const [x,y] of pts) ctx.lineTo(x*S, y*S);
  ctx.closePath();
  ctx.stroke();

  // Start marker (yellow circle)
  const [sx,sy] = pts[0];
  ctx.fillStyle = '#ff0'; ctx.beginPath();
  ctx.arc(sx*S, sy*S, 8, 0, Math.PI*2);
  ctx.fill();

  // Convert to grayscale buffer
  const buf = new Uint8Array(S*S);
  const img = ctx.getImageData(0,0,S,S);
  for (let i=0,j=0; i<img.data.length; i+=4,j++) {
    buf[j] = img.data[i]; // R channel
  }
  f1TrackBuf = { buf, S };
}

function buildScrollText(data) {
  const now = new Date();
  const dateStr = data ? new Date(data.date_start||data.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '--';
  const name    = data ? (data.meeting_name||data.raceName||'Grand Prix') : 'F1 2025';
  const circuit = data ? (data.circuit_short_name||data.Circuit?.circuitName||'') : '';
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

// Map a horizontal strip position to a face LED (wraps front→right→back→left)
function setStripLED(stripX, v, r, g, b) {
  if (v<0||v>=SIZE) return;
  const seg = (stripX/SIZE)|0, u = stripX%SIZE;
  const fv  = SIZE-1-v;          // flip vertical: canvas y=0 is top, LED v=0 is bottom
  let face, fu;
  if (seg===0){ face=0; fu=u;         }  // front
  else if(seg===1){ face=2; fu=SIZE-1-u; }  // right
  else if(seg===2){ face=1; fu=SIZE-1-u; }  // back
  else if(seg===3){ face=3; fu=u;         }  // left
  else return;
  const i=faceMap[face][fv*SIZE+fu];
  if(i>=0) setLED(i,r,g,b);
}

// ── F1 LIVE CUBE EFFECT ──
// ── Build a text canvas → pixel buffer ──
// reserveBottom: fraction of height reserved for circuit strip
function buildTextBuf(lines, bg=[0,0,0], reserveBottom=0) {
  const S = Math.max(SIZE, 16);
  const usableH = Math.round(S * (1 - reserveBottom));
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${bg[0]*255|0},${bg[1]*255|0},${bg[2]*255|0})`;
  ctx.fillRect(0,0,S,S);
  const lineH = usableH / lines.length;
  // Larger font — 72% of line height for readability
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

// ── Build circuit name strip for bottom of side panels ──
function buildCircuitStrip() {
  if (!f1MeetingData) return;
  const name = ((f1MeetingData.circuit_short_name||f1MeetingData.meeting_name||'').toUpperCase() + '   ').repeat(2);
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

// ── Render a pixel buffer onto a cube face ──
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
    else if (face===1) mi=fm[lv*SIZE+(SIZE-1-lu)];  // back: mirror x
    else if (face===2) mi=fm[lv*SIZE+(SIZE-1-lu)];  // right: front=left
    else if (face===3) mi=fm[lv*SIZE+lu];            // left
    else if (face===4) mi=fm[lv*SIZE+lu];            // top
    else if (face===5) mi=fm[lv*SIZE+lu];            // bottom
    if (mi>=0) setLED(mi, r, g, b);
  }
}

// ── Rebuild face buffers when data changes ──
function rebuildF1FaceBufs() {
  if (!f1DataDirty) return;
  f1DataDirty = false;

  const isQuali = (f1SessionType||'').toLowerCase().includes('qual');
  const isPrac  = (f1SessionType||'').toLowerCase().includes('prac');
  const isRace  = !isQuali && !isPrac;
  const lap     = Math.max(1, Math.floor(f1SessionTime.elapsed/60)+1);
  const rem     = Math.max(0, 50-lap);
  const minR    = Math.floor(f1SessionTime.remaining/60);
  const secR    = String(f1SessionTime.remaining%60).padStart(2,'0');
  const RES     = 0.16; // bottom strip reservation

  const wcode = (f1Weather.code||0);
  const rainExpected = wcode >= 51; // drizzle/rain codes 51+
  const wxIcon = wcode===0?'☀':wcode<=2?'🌤':wcode<=3?'⛅':wcode<=45?'🌫':wcode<=57?'🌦':wcode<=67?'🌧':wcode<=77?'❄':'⛈';

  // Flag colour background with wave animation (28% base brightness)
  const bgDim = f1FlagRGB.map(c=>c*0.28);

  // Helper: apply stylish waving flag background with diagonal bands
  const applyWaveBg = (ctx, S) => {
    const imgData = ctx.getImageData(0,0,S,S);
    const data = imgData.data;
    const stripeW = Math.max(3, (S/8)|0);  // stripe width
    for(let y=0; y<S; y++) {
      for(let x=0; x<S; x++) {
        const i = (y*S+x)*4;
        const a = data[i+3];  // preserve alpha
        if (a > 200) continue;  // skip opaque text pixels

        // Diagonal stripe index (animated)
        const diag = (x + y + (t*S*1.5)|0) % (stripeW*2);

        // Create rippling effect at the stripe boundaries
        const yWave = Math.sin((y/S)*Math.PI*4 + t*3)*0.3;
        const xWave = Math.cos((x/S)*Math.PI*3 + t*2.5)*0.25;
        const ripple = 0.5 + yWave + xWave;

        // Alternate between bright and dim stripes
        let brightness;
        if (diag < stripeW) {
          brightness = 0.7 + ripple*0.2;  // bright stripe
        } else {
          brightness = 0.25 + ripple*0.15;  // dim stripe
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
    const sColor = isQuali?'#ffaa44':isPrac?'#88ff88':'#ff5555';
    const S2 = Math.max(SIZE,16);
    const oc = document.createElement('canvas');
    oc.width = S2; oc.height = S2;
    const cx = oc.getContext('2d');
    cx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    cx.fillRect(0,0,S2,S2);
    cx.textAlign='center'; cx.textBaseline='middle';

    // — Session type (auto-fit) —
    let fsTop = Math.max(7,(S2*0.18)|0);
    cx.font=`bold ${fsTop}px Arial`;

    if (isPrac) {
      // Practice: PRACTICE on line 1, FPx on line 2 (with gap)
      while(fsTop > 5 && cx.measureText('PRACTICE').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('PRACTICE', S2/2, S2*0.20);
      cx.fillText(`FP${f1FPSession}`, S2/2, S2*0.38);
    } else if (isQuali) {
      // Qualifying: QUALIFYING on line 1, Qx on line 2 (with gap)
      while(fsTop > 5 && cx.measureText('QUALIFYING').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('QUALIFYING', S2/2, S2*0.20);
      cx.fillText(`Q${f1QSession}`, S2/2, S2*0.38);
    } else {
      // Race: single line (bigger)
      let fsRaceLabel = Math.max(8,(S2*0.22)|0);  // bigger than session labels
      cx.font=`bold ${fsRaceLabel}px Arial`;
      while(fsRaceLabel > 6 && cx.measureText('RACE').width > S2*0.92){
        fsRaceLabel--; cx.font = `bold ${fsRaceLabel}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('RACE', S2/2, S2*0.20);
    }

    // — Lap/Time line (much larger, auto-fit) —
    let fsMid = Math.max(10,(S2*0.38)|0);
    cx.fillStyle='#ffffff';

    if (isQuali || isPrac) {
      // Qualifying/Practice: time on single line
      const timeText = `${minR}:${secR}`;
      cx.font=`bold ${fsMid}px Arial`;
      while(fsMid > 6 && cx.measureText(timeText).width > S2*0.92){
        fsMid--; cx.font=`bold ${fsMid}px Arial`;
      }
      cx.fillText(timeText, S2/2, S2*0.70);
    } else {
      // Race: LAP on line 1, X of 50 on line 2 (smaller, auto-fit both)
      let fsRace = Math.max(7,(S2*0.22)|0);  // Smaller base size
      const lapLabel = 'LAP';
      const lapCount = `${lap} of 50`;

      // Auto-fit to the wider of the two lines
      cx.font=`bold ${fsRace}px Arial`;
      const maxWidth = Math.max(cx.measureText(lapLabel).width, cx.measureText(lapCount).width);
      while(fsRace > 5 && maxWidth > S2*0.92){
        fsRace--; cx.font = `bold ${fsRace}px Arial`;
      }

      cx.fillText(lapLabel, S2/2, S2*0.47);
      cx.fillText(lapCount, S2/2, S2*0.70);
    }

    // Apply wave background before extracting pixels
    applyWaveBg(cx, S2);
    f1FaceBufs.front = { data: cx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── RIGHT: top 3 leaderboard with 3-letter abbreviations ──
  {
    const top3 = f1Standings.slice(0,3);
    // Extract 3-letter abbreviations
    const abbrevs = top3.map(d=>{
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

    // Auto-fit font size to longest abbreviation
    let fs = Math.max(8, (S2*0.28)|0);
    ctx.font = `bold ${fs}px Arial`;
    while(fs > 5 && ctx.measureText(longest).width > S2*0.85){
      fs--; ctx.font = `bold ${fs}px Arial`;
    }

    // Draw top 3 with position labels and podium colours (avoid blue flag at top, circuit strip at bottom)
    const blueH = 4;  // blue flag area at top
    const stripH = Math.max(2, (S2*0.16)|0);  // reserve space for circuit strip
    const usableH = S2 - blueH - stripH - 4;  // available height minus blue area, strip, and gap
    const lineH = usableH / 3;
    const colors = ['#FFFF00', '#FFFFFF', '#FF9900'];  // bright gold, white, orange-bronze
    const positions = ['1.', '2.', '3.'];
    const startY = blueH + 2;  // start below blue flag area
    for(let i=0;i<Math.min(3,abbrevs.length);i++){
      ctx.font = `bold ${fs}px Arial`;
      ctx.fillStyle = colors[i];
      const text = positions[i] + ' ' + abbrevs[i];
      ctx.fillText(text, S2/2, startY + (i+0.5)*lineH);
    }

    // Apply wave background
    applyWaveBg(ctx, S2);
    f1FaceBufs.right = { data: ctx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── LEFT: weather — custom layout for better spacing ──
  {
    const S2 = Math.max(SIZE,16);
    const c = document.createElement('canvas');
    c.width = c.height = S2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    ctx.fillRect(0,0,S2,S2);
    ctx.textAlign='center'; ctx.textBaseline='middle';

    // Reserve space for blue flag at top (4 pixels)
    const blueH = 4;
    const yOffset = blueH / S2;  // normalize to panel height

    // Weather icon (larger, moved down to avoid blue bar)
    ctx.font = `${Math.max(12,(S2*0.35)|0)}px Arial`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(wxIcon, S2/2, S2*(0.20 + yOffset));

    // Temperature (bigger, moved down)
    ctx.font = `bold ${Math.max(9,(S2*0.24)|0)}px Arial`;
    ctx.fillStyle = '#ffe566';
    ctx.fillText(`${f1Weather.temp||'--'}°C`, S2/2, S2*(0.45 + yOffset));

    // Rain warning if needed (bottom)
    if (rainExpected) {
      ctx.font = `bold ${Math.max(5,(S2*0.12)|0)}px Arial`;
      ctx.fillStyle = '#66aaff';
      ctx.fillText('🌧 RAIN', S2/2, S2*0.75);
    }

    // Apply wave background
    applyWaveBg(ctx, S2);
    f1FaceBufs.left = { data: ctx.getImageData(0,0,S2,S2).data, S: S2 };
  }

  // ── BACK: mirror of front (session type + lap) ──
  {
    const sColor = isQuali?'#ffaa44':isPrac?'#88ff88':'#ff5555';
    const S2 = Math.max(SIZE,16);
    const oc = document.createElement('canvas');
    oc.width = S2; oc.height = S2;
    const cx = oc.getContext('2d');
    cx.fillStyle = `rgb(${bgDim[0]*255|0},${bgDim[1]*255|0},${bgDim[2]*255|0})`;
    cx.fillRect(0,0,S2,S2);
    cx.textAlign='center'; cx.textBaseline='middle';

    // — Session type (auto-fit) —
    let fsTop = Math.max(7,(S2*0.18)|0);
    cx.font=`bold ${fsTop}px Arial`;

    if (isPrac) {
      // Practice: PRACTICE on line 1, FPx on line 2 (with gap)
      while(fsTop > 5 && cx.measureText('PRACTICE').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('PRACTICE', S2/2, S2*0.20);
      cx.fillText(`FP${f1FPSession}`, S2/2, S2*0.38);
    } else if (isQuali) {
      // Qualifying: QUALIFYING on line 1, Qx on line 2 (with gap)
      while(fsTop > 5 && cx.measureText('QUALIFYING').width > S2*0.92){
        fsTop--; cx.font = `bold ${fsTop}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('QUALIFYING', S2/2, S2*0.20);
      cx.fillText(`Q${f1QSession}`, S2/2, S2*0.38);
    } else {
      // Race: single line (bigger)
      let fsRaceLabel = Math.max(8,(S2*0.22)|0);  // bigger than session labels
      cx.font=`bold ${fsRaceLabel}px Arial`;
      while(fsRaceLabel > 6 && cx.measureText('RACE').width > S2*0.92){
        fsRaceLabel--; cx.font = `bold ${fsRaceLabel}px Arial`;
      }
      cx.fillStyle=sColor; cx.fillText('RACE', S2/2, S2*0.20);
    }

    // — Lap/Time line (much larger, auto-fit) —
    let fsMid = Math.max(10,(S2*0.38)|0);
    cx.fillStyle='#ffffff';

    if (isQuali || isPrac) {
      // Qualifying/Practice: time on single line
      const timeText = `${minR}:${secR}`;
      cx.font=`bold ${fsMid}px Arial`;
      while(fsMid > 6 && cx.measureText(timeText).width > S2*0.92){
        fsMid--; cx.font=`bold ${fsMid}px Arial`;
      }
      cx.fillText(timeText, S2/2, S2*0.70);
    } else {
      // Race: LAP on line 1, X of 50 on line 2 (smaller, auto-fit both)
      let fsRace = Math.max(7,(S2*0.22)|0);  // Smaller base size
      const lapLabel = 'LAP';
      const lapCount = `${lap} of 50`;

      // Auto-fit to the wider of the two lines
      cx.font=`bold ${fsRace}px Arial`;
      const maxWidth = Math.max(cx.measureText(lapLabel).width, cx.measureText(lapCount).width);
      while(fsRace > 5 && maxWidth > S2*0.92){
        fsRace--; cx.font = `bold ${fsRace}px Arial`;
      }

      cx.fillText(lapLabel, S2/2, S2*0.47);
      cx.fillText(lapCount, S2/2, S2*0.70);
    }

    // Apply wave background
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

  // ── IDLE: no session — chequered top + large scroll ──
  if (!f1SessionActive) {
    // Top panel: top 3 championship standings with 3-letter abbrev and chequered background
    const top3 = f1Standings.slice(0,3);
    // Extract 3-letter abbreviation from driver name
    const abbrevs = top3.map(d=>{
      const name = (d.name||'').replace(/^#\d+\s*/,'').toUpperCase();
      // Try to get last 3 letters of name, or first 3 if name is short
      const parts = name.split(' ');
      if(parts.length>1) return parts[parts.length-1].substring(0,3);
      return name.substring(0,3);
    });
    const longest = abbrevs.reduce((a,b)=>a.length>b.length?a:b, '');

    // Chequered background with text
    const sq = Math.max(2, (SIZE/8)|0);
    const pulse = 0.45 + Math.sin(t*2)*0.35;
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const isW = (((u/sq)|0) + ((v/sq)|0)) % 2 === 0;
      const bright = isW ? pulse*0.3 : 0.01;
      const i = faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, bright, bright, bright);
    }

    // Render top 3 on top panel
    {
      const cacheKey = abbrevs.join('|');
      if(!f1FaceBufs._lastIdleTop3 || f1FaceBufs._lastIdleTop3!==cacheKey){
        f1FaceBufs._lastIdleTop3 = cacheKey;
        const c = document.createElement('canvas');
        c.width = c.height = SIZE;
        const ctx = c.getContext('2d');
        ctx.textAlign='center'; ctx.textBaseline='middle';

        // Auto-fit font size to longest abbreviation
        let fs = Math.max(8, (SIZE*0.28)|0);
        ctx.font = `bold ${fs}px Arial`;
        while(fs > 5 && ctx.measureText(longest).width > SIZE*0.85){
          fs--; ctx.font = `bold ${fs}px Arial`;
        }

        // Draw top 3 with position labels and podium colours
        const lineH = SIZE / 3;
        const colors = ['#FFFF00', '#FFFFFF', '#FF9900'];  // bright gold, white, orange-bronze
        const positions = ['1.', '2.', '3.'];
        for(let i=0;i<Math.min(3,abbrevs.length);i++){
          ctx.font = `bold ${fs}px Arial`;
          ctx.fillStyle = colors[i];
          const text = positions[i] + ' ' + abbrevs[i];
          ctx.fillText(text, SIZE/2, (i+0.5)*lineH);
        }

        f1FaceBufs.idleTop3 = {data:ctx.getImageData(0,0,SIZE,SIZE).data, S:SIZE};
      }
      if(f1FaceBufs.idleTop3){
        const {data,S}=f1FaceBufs.idleTop3;
        for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
          const pv=data[(v*S+u)*4]/255;
          if(pv>0.10){const i=faceMap[4][v*SIZE+u]; if(i>=0) setLED(i,pv,pv,0);}
        }
      }
    }

    // Chequered flag background on all 4 side panels with wave effect
    {
      const sq = Math.max(2, (SIZE/8)|0);
      const basePulse = 0.45 + Math.sin(t*2)*0.35;
      for(let sp=0; sp<4*SIZE; sp++) {
        for(let v=0; v<SIZE; v++) {
          const isW = (((sp/sq)|0) + ((v/sq)|0)) % 2 === 0;
          // Wave effect: ripple across both dimensions
          const waveX = Math.sin((sp/(4*SIZE))*Math.PI*2 + t*2)*0.3;
          const waveY = Math.sin((v/SIZE)*Math.PI*2 + t*2.5)*0.3;
          const wavePulse = basePulse + waveX + waveY;
          const bright = isW ? Math.max(0.02, wavePulse*0.4) : 0.01;
          setStripLED(sp, v, bright, bright, bright);
        }
      }
    }

    // Large scrolling text on all 4 side panels
    if (f1IdlePixels && f1IdleWidth > 0) {
      f1IdleScrollX = (f1IdleScrollX + dt*SIZE*0.4) % f1IdleWidth;
      for(let sv=0;sv<SIZE;sv++){
        for(let sp=0;sp<4*SIZE;sp++){
          const srcX = ((sp + (f1IdleScrollX|0)) % f1IdleWidth + f1IdleWidth) % f1IdleWidth;
          const pv   = f1IdlePixels[(sv*f1IdleWidth+srcX)*4]/255;
          if(pv<0.04) continue;
          const h=(sp/(4*SIZE)+t*0.03)%1;
          const [r,g,b]=hsl(h,1,pv*0.85);
          // sv=0 (canvas top) → setStripLED(sp, 0) → fv=SIZE-1 (panel top, correct)
          setStripLED(sp, sv, r, g, b);
        }
      }
    }

    // Date of next race centered on each side panel, near bottom
    if (f1MeetingData && f1MeetingData.date_start) {
      const dateStr = new Date(f1MeetingData.date_start).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      const dateH = Math.max(4, (SIZE*0.20)|0);  // bigger height
      const dateY_start = SIZE - dateH - 2;  // near bottom with small gap

      // Render date text on a canvas
      const dc = document.createElement('canvas');
      dc.width = SIZE; dc.height = dateH;
      const dctx = dc.getContext('2d');
      dctx.fillStyle = '#000'; dctx.fillRect(0,0,dc.width,dc.height);
      dctx.fillStyle = '#aabbff';
      dctx.font = `bold ${Math.max(6, (dateH*0.80)|0)}px Arial`;
      dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
      dctx.fillText(dateStr, dc.width/2, dateH/2);

      const datePixels = dctx.getImageData(0,0,dc.width,dc.height).data;

      // Display centered on each of the 4 side panels
      for(let panel=0; panel<4; panel++) {
        const panelStart = panel * SIZE;
        for(let sp=panelStart; sp<panelStart+SIZE; sp++) {
          for(let dy=0; dy<dateH; dy++) {
            const dx = sp - panelStart;  // position within panel (0 to SIZE-1)
            const pi = (dy*SIZE + dx)*4;
            const pv = datePixels[pi]/255;
            if(pv<0.05) continue;
            const v = dateY_start + dy;
            setStripLED(sp, v, pv*0.6, pv*0.8, pv);
          }
        }
      }
    }
    return;
  }

  // Rebuild data panels when dirty
  rebuildF1FaceBufs();

  // ── TOP: flag colour + status ──
  const [fr,fg,fb] = f1FlagRGB;
  const pulse = (fr>0||fg>0||fb>0) ? 0.7+Math.sin(t*3)*0.3 : 0.08;

  if (f1IsFinishedMode) {
    // Chequered flag pattern pulsating with FINISH text
    const sq = Math.max(2,(SIZE/8)|0);
    const cp = 0.45 + Math.sin(t*2)*0.35;
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const isW = (((u/sq)|0)+((v/sq)|0)) % 2 === 0;
      const i = faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, isW?cp:0.02, isW?cp:0.02, isW?cp:0.02);
    }

    // Render FINISH text with colorful fireworks effect
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

    // Fireworks particles exploding outward with random colours
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const pv=finishData[(v*SIZE+u)*4]/255;
      if(pv>0.15){
        const i=faceMap[4][v*SIZE+u];
        if(i>=0) {
          // Distance from center
          const dx = u - SIZE/2;
          const dy = v - SIZE/2;
          const dist = Math.sqrt(dx*dx + dy*dy);

          // Create explosion effect: particles move outward
          const explosionPhase = t * 3;
          const particleOffset = Math.sin(explosionPhase + dist*0.1) * 0.3;
          const particle = Math.max(0, (1 - (explosionPhase % 1)) * (1 + particleOffset));

          // Random colour based on position and time
          const hue = (u/SIZE + v/SIZE + t*0.5) % 1;
          const sat = 1;
          const light = 0.5 + particle*0.5;
          const [r,g,b] = hsl(hue, sat, light);

          setLED(i, r, g, b);
        }
      }
    }
  } else {
    for(let u=0;u<SIZE;u++) for(let v=0;v<SIZE;v++){
      const i=faceMap[4][v*SIZE+u];
      if(i>=0) setLED(i, fr*pulse*0.25, fg*pulse*0.25, fb*pulse*0.25); // dim flag tint as background
    }
    // Overlay track outline with approximate live car positions (mini-sector approximation)
    if(f1CarPositions && f1CarPositions.length){
      drawF1TrackWithCars();
    }
  }
  // Status text on top (skip if FINISHED, or if live car map is showing)
  if(f1StatusText && f1StatusText!=='--' && !f1IsFinishedMode && !(f1CarPositions && f1CarPositions.length)){
    if(!f1FaceBufs._lastStatus || f1FaceBufs._lastStatus!==f1StatusText){
      f1FaceBufs._lastStatus = f1StatusText;
      const oc=document.createElement('canvas'); oc.width=SIZE; oc.height=SIZE;
      const cx=oc.getContext('2d');
      // Auto-fit font to panel width
      let fh = Math.max(8,(SIZE*0.38)|0);
      cx.font=`bold ${fh}px Arial`;
      while(fh > 4 && cx.measureText(f1StatusText).width > SIZE*0.92){
        fh--; cx.font=`bold ${fh}px Arial`;
      }
      cx.fillStyle='rgba(0,0,0,0)'; cx.clearRect(0,0,SIZE,SIZE);
      cx.fillStyle='#fff';
      cx.textAlign='center'; cx.textBaseline='middle';
      cx.fillText(f1StatusText, SIZE/2, SIZE/2);
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

  // ── FRONT: session type + lap info ──
  applyBufToFace(0, f1FaceBufs.front);

  // ── BACK: session type + lap info (mirrored) ──
  if (f1FaceBufs.back) applyBufToFace(1, f1FaceBufs.back);

  // ── RIGHT: leaderboard ──
  applyBufToFace(2, f1FaceBufs.right);

  // ── LEFT: weather ──
  applyBufToFace(3, f1FaceBufs.left);

  // ── BOTTOM: race/event info ──
  applyBufToFace(5, f1FaceBufs.bottom);

  // ── SIDE PANELS: dynamic wave effect overlay (background only) ──
  {
    const waveAmp = 0.2;  // wave amplitude
    const textThreshold = 0.3;  // pixels brighter than this are text (leave solid)

    for(let sp=0; sp<4*SIZE; sp++) {
      for(let v=0; v<SIZE; v++) {
        // Apply wave modulation via multiplier on existing LEDs
        const seg = (sp/SIZE)|0, u = sp%SIZE;
        const fv  = SIZE-1-v;
        let face, fu;
        if (seg===0){ face=0; fu=u;         }  // front
        else if(seg===1){ face=2; fu=SIZE-1-u; }  // right
        else if(seg===2){ face=1; fu=SIZE-1-u; }  // back
        else if(seg===3){ face=3; fu=u;         }  // left
        else continue;

        const meshIdx = faceMap[face][fv*SIZE+fu];
        if(meshIdx >= 0) {
          const colorBase = meshIdx*3;
          const r = colBuf[colorBase];
          const g = colBuf[colorBase+1];
          const b = colBuf[colorBase+2];
          const brightness = Math.max(r, g, b);  // use max channel as brightness indicator

          // Only wave dark background pixels, not bright text
          if(brightness < textThreshold) {
            // Wave effect: ripple across both dimensions
            const waveX = Math.sin((sp/(4*SIZE))*Math.PI*2 + t*1.8)*waveAmp;
            const waveY = Math.sin((v/SIZE)*Math.PI*2 + t*2.2)*waveAmp;
            const waveMod = 0.5 + (waveX + waveY)*0.7;  // brightness modulation

            colBuf[colorBase  ] *= waveMod;
            colBuf[colorBase+1] *= waveMod;
            colBuf[colorBase+2] *= waveMod;
          }
        }
      }
    }
  }
  if(plTransActive) plApplyTransition();
  mesh.instanceColor.needsUpdate = true;
  // ── BLUE FLAG: top 4 rows of all 4 side panels — solid blue ──
  if (f1BlueFlagActive) {
    const bluePulse = 0.35 + Math.sin(t*6)*0.35;  // pulsing brightness
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let v=0; v<4; v++) {          // v=0..3 → fv=SIZE-1..SIZE-4 (top rows)
        // Solid blue with pulsing brightness
        setStripLED(sp, v, 0, bluePulse*0.3, bluePulse);
      }
    }
  }

  if(f1CircuitStrip && f1SessionActive && f1CircuitStripW > 0) {
    f1CircuitScrollX = (f1CircuitScrollX + dt*SIZE*0.35) % f1CircuitStripW;
    const stripH  = Math.max(2, (SIZE*0.16)|0);
    const srcRows = (f1CircuitStrip.length / (f1CircuitStripW*4))|0;
    for(let sp=0; sp<4*SIZE; sp++) {
      for(let j=0; j<stripH; j++) {
        // j=0 → bottom row of panel; setStripLED fv=SIZE-1-v, so use v=SIZE-1-j
        const v    = SIZE-1-j;
        const srcX = ((sp + (f1CircuitScrollX|0)) % f1CircuitStripW + f1CircuitStripW) % f1CircuitStripW;
        // invert srcY so text top appears at strip top
        const srcY = Math.floor((stripH-1-j) * srcRows / stripH);
        const pi   = (srcY*f1CircuitStripW + srcX)*4;
        const pv   = f1CircuitStrip[pi]/255;
        if(pv<0.05) continue;
        setStripLED(sp, v, pv*0.95, pv*0.72, 0); // amber
      }
    }
  }
}

function applyF1Flag(flag, status='') {
  const F = flag ? flag.toUpperCase() : '';
  let rgb=[0,0,0], label='Idle', css='#111', stext='--';

  const S = status ? status.toUpperCase() : '';
  // Determine status text from status field
  if (status) {
    if (S.includes('VIRTUAL')) stext='VSC';
    else if (S.includes('SAFETY')) stext='SC';
    else if (S.includes('STARTED')) stext='LIVE';
    else if (S.includes('ENDED')) stext='END';
    else stext = S.substring(0,4);
  }

  // Check for FINISHED first (before other checks)
  f1IsFinishedMode = false;
  if (F.includes('CHEQUERED')||F.includes('CHECKERED')||S.includes('FINISHED')) {
    f1IsFinishedMode = true;
    rgb=[1,1,1]; label='FINISHED'; stext='FINISHED'; css='#ffffff';
  }
  // Determine flag colour and label
  else {
    f1BlueFlagActive = false;
    if (F.includes('BLUE')) {
      // Blue flag: side panel top rows only — top panel colour and text unchanged
      f1BlueFlagActive = true;
      f1FlagRGB = [0, 0.33, 1];  // Set RGB for background blending
      f1FlagLabel = 'BLUE FLAG';
      f1StatusText = 'BLUE';
      const flagEl=document.getElementById('f1-flag');
      const textEl=document.getElementById('f1-status-text');
      if(flagEl) flagEl.style.background='#0055ff';
      if(textEl) textEl.textContent='BLUE FLAG';
      f1DataDirty = true;  // Mark for update
      return;  // Don't process other flags
    }
    if (F.includes('RED'))          { rgb=[1,.02,.02]; label='RED FLAG';  stext='RED';    css='#ff2200'; }
    else if (F.includes('VIRTUAL')||S.includes('VIRTUAL')) { rgb=[1,.9,0]; label='VIRTUAL SC'; stext='VSC'; css='#ffcc00'; }
    else if (F.includes('SAFETY') ||S.includes('SAFETY'))  { rgb=[1,.9,0]; label='SAFETY CAR'; stext='SC';  css='#ffcc00'; }
    else if (F.includes('YELLOW'))  { rgb=[1,.88,0];   label='YELLOW';    stext='YELLOW'; css='#ffcc00'; }
    else if (F.includes('GREEN')||F.includes('CLEAR')) { rgb=[.02,1,.1]; label='GO'; stext='GO'; css='#00ff44'; }
    else if (stext !== '--') { rgb=[.3,.6,1]; label=stext; }
  }

  f1FlagRGB   = rgb;
  f1FlagLabel = label;
  f1StatusText = stext;
  f1DataDirty  = true;
  const flagEl = document.getElementById('f1-flag');
  const textEl = document.getElementById('f1-status-text');
  if (flagEl) flagEl.style.background = css;
  if (textEl) textEl.textContent = label;
}

function updateLeaderboardUI() {
  const list = document.getElementById('f1-board-list');
  if (!list || f1Standings.length === 0) return;
  list.innerHTML = f1Standings.slice(0,10).map(d =>
    `<div style="display:flex;gap:4px;line-height:1.4;font-size:11px;">
      <span style="color:#aaa;min-width:14px;">${d.pos}.</span>
      <span style="flex:1;color:#eee;">${d.name}</span>
      <span style="color:${d.gap==='LEAD'?'#4f4':'#fa0'};font-size:10px;">${d.gap}</span>
    </div>`
  ).join('');
}

function updateWeatherUI() {
  // weather shown on cube panel — no dedicated sidebar elements needed
  f1DataDirty = true;
}

function updateSessionUI() {
  const typeEl  = document.getElementById('f1-session-type');
  const timerEl = document.getElementById('f1-session-timer');
  const lapsEl  = document.getElementById('f1-laps-info');
  if (!typeEl || !timerEl || !lapsEl) return;

  if (f1SessionType.includes('qualifying')) {
    typeEl.textContent = '🏁 QUALIFYING';
    const min = Math.floor(f1SessionTime.remaining / 60);
    const sec = f1SessionTime.remaining % 60;
    timerEl.textContent = `${min}:${String(sec).padStart(2, '0')}`;
  } else if (f1SessionType.includes('race')) {
    typeEl.textContent = '🏎️ RACE';
    lapsEl.textContent = `Lap ${Math.floor(f1SessionTime.elapsed) || 0}/50`;
  } else {
    typeEl.textContent = f1SessionType.toUpperCase() || 'Standby';
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

async function fetchF1Data() {
  f1SetStatus('transfer');
  let anySuccess=false;
  const nowMs = Date.now();
  const localServer = F1_API;

  try {
    // ── 1. Session info ──────────────────────────────────────────────────
    const sesRes = await fetch(`${localServer}/api/session`, {signal: AbortSignal.timeout(5000)});
    if (sesRes.ok) {
      const ses = await sesRes.json();
      f1SessionType = ses.type || 'standby';
      f1SessionActive = ses.type && ses.type !== 'standby';
      
      // Map to cube mode
      let modeType = 'Race';
      if(f1SessionType.includes('practice')) modeType = 'Practice';
      else if(f1SessionType.includes('quali')) modeType = 'Qualifying';
      
      if(f1SessionActive && (!f1AutoModeType || f1AutoModeType !== modeType)) {
        f1AutoModeType = modeType;
        f1AutoTriggerMode(modeType, f1SessionType);
      }
      anySuccess = true;
    }
  } catch(e) { /* Session unavailable */ }

  try {
    // ── 2. Driver standings ──────────────────────────────────────────────
    const drvRes = await fetch(`${localServer}/api/drivers`, {signal: AbortSignal.timeout(5000)});
    if(drvRes.ok) {
      const drivers = await drvRes.json();
      f1Standings = drivers.slice(0, 10).map(d => ({
        pos: d.position,
        name: `#${d.driver_number} ${d.name}`,
        gap: d.gap
      }));
      updateLeaderboardUI();
      anySuccess = true;
    }
  } catch(e) { /* Drivers unavailable */ }

  try {
    // ── 3. Flags & status ────────────────────────────────────────────────
    const flgRes = await fetch(`${localServer}/api/flags`, {signal: AbortSignal.timeout(5000)});
    if(flgRes.ok) {
      const flags = await flgRes.json();
      applyF1Flag(flags.flag, null);
      anySuccess = true;
    }
  } catch(e) { /* Flags unavailable */ }

  // Update status indicator
  setTimeout(()=>f1SetStatus(anySuccess?'ok':'error'), 300);
}

// Only poll the F1 APIs when F1 is the active effect and visible on the cube
let f1PollActive=false;
let currentEffect='wave';
function f1PollLoop(){
  if(typeof currentEffect!=='undefined' && currentEffect==='f1' && effectsOn){
    if(!f1PollActive){ f1PollActive=true; }
    fetchF1Data();
  } else {
    if(f1PollActive){
      f1PollActive=false;
      const ind=document.getElementById('f1-status-indicator');
      const lbl=document.getElementById('f1-status-label');
      if(ind) ind.style.background='#666';
      if(lbl) lbl.textContent='API idle';
    }
  }
}
setInterval(f1PollLoop, 5000);

// Session timer loop — only ticks while F1 is the active effect.
// Mirrors the f1PollLoop guard so it isn't running needlessly.
let f1SessionTimerId = null;
function f1SessionTick(){
  if(currentEffect === 'f1' && typeof effectsOn !== 'undefined' && effectsOn){
    f1SessionTime.elapsed += 1;
    f1SessionTime.remaining = Math.max(0, f1SessionTime.duration - f1SessionTime.elapsed);
    f1DataDirty = true;
    updateSessionUI();
  }
}
function startF1SessionTimer(){
  if(f1SessionTimerId === null) f1SessionTimerId = setInterval(f1SessionTick, 1000);
}
function stopF1SessionTimer(){
  if(f1SessionTimerId !== null){ clearInterval(f1SessionTimerId); f1SessionTimerId = null; }
}
