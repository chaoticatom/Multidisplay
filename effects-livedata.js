// ═══════════════════════════════════════════════════
//  effects-livedata.js — Live Data (lazy-loaded)
//  weather, moon, datetime, neo, apod, unsplash, artic, joke,
//  otd, trivia, epic, iss, cam
// ═══════════════════════════════════════════════════
let dtCanvas=null,dtCtx=null,dtPixels=null,dtLastSec=-1,dtScrollX=0,dtMode='time';

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

// ── "Words" mode: word-clock style display, using the same crisp bitmap
// font as the Trivia/Jokes word cascade (WC_FONT), staggered rows instead
// of every line centered, with hour/connector words in white and the
// minute-quantity/date-number in amber. Rounds to the nearest 5 minutes,
// like a real word clock — seconds change every tick and don't have a
// natural word-clock phrasing, so they're deliberately left out; the date
// (if included) gets its own set of staggered rows underneath.
const DT_WORDS_NUM=['TWELVE','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN'];
const DT_WORDS_ORDINAL=['FIRST','SECOND','THIRD','FOURTH','FIFTH','SIXTH','SEVENTH','EIGHTH','NINTH','TENTH',
  'ELEVENTH','TWELFTH','THIRTEENTH','FOURTEENTH','FIFTEENTH','SIXTEENTH','SEVENTEENTH','EIGHTEENTH','NINETEENTH','TWENTIETH',
  'TWENTY FIRST','TWENTY SECOND','TWENTY THIRD','TWENTY FOURTH','TWENTY FIFTH','TWENTY SIXTH','TWENTY SEVENTH','TWENTY EIGHTH','TWENTY NINTH','THIRTIETH','THIRTY FIRST'];
const DT_WORDS_DAY=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const DT_WORDS_MONTH=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

const DT_WORDS_ONES=['','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE'];
const DT_WORDS_TEENS=['TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
const DT_WORDS_TENS=['','TEN','TWENTY','THIRTY','FORTY','FIFTY'];
function dtNumberWord(n){
  if(n<10) return DT_WORDS_ONES[n];
  if(n<20) return DT_WORDS_TEENS[n-10];
  const tens=Math.floor(n/10), ones=n%10;
  return DT_WORDS_TENS[tens]+(ones?' '+DT_WORDS_ONES[ones]:'');
}
// Exact to the minute (no rounding) — "SEVENTEEN MINUTES PAST NINE" rather
// than snapping to the nearest 5-minute word-clock phrase. Quarter/half/
// o'clock are still used for exact 0/15/30/45 since those read naturally.
function dtWordsForTime(h24,m){
  const hourOffset=m>30?1:0;
  const h=(h24+hourOffset)%24;
  let h12=h%12; if(h12===0) h12=12;
  const hourWord=DT_WORDS_NUM[h12%12];
  const AMBER=[1,0.8,0.27], WHITE=[1,1,1];
  const tokens=[];
  const pushMinutes=(n)=>{
    dtNumberWord(n).split(' ').forEach(w=>tokens.push({t:w,c:AMBER}));
    tokens.push({t:n===1?'MINUTE':'MINUTES',c:AMBER});
  };
  if(m===0){
    tokens.push({t:hourWord,c:WHITE},{t:"O'CLOCK",c:WHITE});
  } else if(m===15){
    tokens.push({t:'QUARTER',c:AMBER},{t:'PAST',c:WHITE},{t:hourWord,c:WHITE});
  } else if(m===30){
    tokens.push({t:'HALF',c:AMBER},{t:'PAST',c:WHITE},{t:hourWord,c:WHITE});
  } else if(m===45){
    tokens.push({t:'QUARTER',c:AMBER},{t:'TO',c:WHITE},{t:hourWord,c:WHITE});
  } else if(m<30){
    pushMinutes(m);
    tokens.push({t:'PAST',c:WHITE},{t:hourWord,c:WHITE});
  } else {
    pushMinutes(60-m);
    tokens.push({t:'TO',c:WHITE},{t:hourWord,c:WHITE});
  }
  return tokens;
}
function dtWordsForDate(now){
  const BLUE=[0.48,0.82,1], AMBER=[1,0.8,0.27];
  const tokens=[{t:DT_WORDS_DAY[now.getDay()],c:BLUE},{t:'THE',c:BLUE}];
  DT_WORDS_ORDINAL[now.getDate()-1].split(' ').forEach(w=>tokens.push({t:w,c:AMBER}));
  tokens.push({t:'OF',c:BLUE},{t:DT_WORDS_MONTH[now.getMonth()],c:BLUE});
  return tokens;
}
function dtWrapTokens(tokens,maxW){
  const lines=[]; let cur=[], curW=0;
  tokens.forEach(tok=>{
    const w=tok.t.length*WC_CHAR_W;
    const addW=(cur.length?WC_CHAR_W:0)+w;
    if(curW+addW>maxW && cur.length){ lines.push(cur); cur=[tok]; curW=w; }
    else { cur.push(tok); curW+=addW; }
  });
  if(cur.length) lines.push(cur);
  return lines;
}
const DT_STAGGER_FRACS=[0.04,0.5,0.8,0.15,0.6,0.3,0.75];
function dtDrawWordLines(face,lines,startRow){
  let row=startRow;
  lines.forEach(line=>{
    const lineW=line.reduce((a,t)=>a+t.t.length*WC_CHAR_W,0)+Math.max(0,line.length-1)*WC_CHAR_W;
    const margin=Math.max(0,SIZE-lineW);
    const sv=(SIZE-1)-1-6-row*WC_LINE_H;
    if(sv+6<0) { row++; return; }
    let su=Math.round(margin*DT_STAGGER_FRACS[row%DT_STAGGER_FRACS.length]);
    line.forEach(tok=>{
      let u=su;
      for(const ch of tok.t) u+=wcDrawGlyph(face,ch,u,sv,tok.c);
      su+=tok.t.length*WC_CHAR_W+WC_CHAR_W;
    });
    row++;
  });
  return row;
}
// "Words" mode always shows both time and date, word-clock style — the
// two together are the point of it, so there's no separate time-only/
// date-only variant (unlike the numeric Time/Date/Both modes).
function dtBuildWordClockToFace(face,now){
  let row=0;
  row=dtDrawWordLines(face,dtWrapTokens(dtWordsForTime(now.getHours(),now.getMinutes()),SIZE),row);
  row+=1; // blank row separating time from date
  row=dtDrawWordLines(face,dtWrapTokens(dtWordsForDate(now),SIZE),row);
}

function effectDateTime(dt) {
  t+=dt*0.8;
  const now=new Date(), sec=now.getSeconds();
  const mode=(_peTargetOpts&&_peTargetOpts.mode)?_peTargetOpts.mode:dtMode;

  if(mode==='words'){
    // Bypasses the hue-remapped canvas pipeline entirely — drawn directly
    // with real fixed colors (white/amber/blue) via the bitmap font, since
    // the other modes' per-face hue-shift would wash out the distinct
    // hour/minute/date colors this mode relies on.
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    const face=_peTargetFace>=0?_peTargetFace:0;
    dtBuildWordClockToFace(face,now);
    return;
  }

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

// ── WEATHER EFFECT ─────────────────────────────────────────────────────────────
let wxCode=0,wxTemp=20,wxTempMax=20,wxDesc='Clear',wxFetching=false,wxLastFetch=-9999;
let wxSunriseS=21600,wxSunsetS=72000,wxMoonriseS=-1,wxMoonsetS=-1,wxTzOffset=0;
let wxLat=52.04,wxLon=-0.76,wxCityDisplay='';
let wxClouds=[],wxParticles=[],wxStars=[],wxT2=0,wxLightFlash=0,wxScrollOff=0;
let wxSkyline=null,wxSkyShapes=[],wxCreatures=[];
const WX_CODES={0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
  77:'Snow grains',80:'Showers',81:'Heavy showers',82:'Violent showers',
  85:'Snow showers',86:'Heavy snow showers',95:'Thunderstorm',96:'Thunderstorm+hail',99:'Severe thunderstorm'};

// ── Lunar calculations (based on SunCalc / Jean Meeus) ──
const _MR=Math.PI/180, _MD=180/Math.PI, _DJ=2451545;
function _toJulian(d){return d.valueOf()/86400000-0.5+2440588;}
function _fromJulian(j){return new Date((j+0.5-2440588)*86400000);}
function _toDays(d){return _toJulian(d)-_DJ;}

function _moonCoords(d){
  const L=_MR*(218.316+13.176396*d),
        M=_MR*(134.963+13.064993*d),
        F=_MR*(93.272+13.229350*d),
        l=L+_MR*6.289*Math.sin(M),
        b=_MR*5.128*Math.sin(F),
        dt=385001-20905*Math.cos(M),
        e=_MR*23.4393;
  return{
    ra:Math.atan2(Math.sin(l)*Math.cos(e)-Math.tan(b)*Math.sin(e),Math.cos(l)),
    dec:Math.asin(Math.sin(b)*Math.cos(e)+Math.cos(b)*Math.sin(e)*Math.sin(l)),
    dist:dt
  };
}
function _sunCoords(d){
  const M=_MR*(357.5291+0.98560028*d),
        C=_MR*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)),
        L=M+C+_MR*282.9372,
        e=_MR*23.4393;
  return{ra:Math.atan2(Math.sin(L)*Math.cos(e),Math.cos(L)),dec:Math.asin(Math.sin(L)*Math.sin(e))};
}
function _siderealTime(d,lw){return _MR*(280.16+360.9856235*d)-lw;}

function getMoonIllumination(date){
  const d=_toDays(date||new Date()),
        s=_sunCoords(d), m=_moonCoords(d),
        sdist=149598000,
        phi=Math.acos(Math.sin(s.dec)*Math.sin(m.dec)+Math.cos(s.dec)*Math.cos(m.dec)*Math.cos(s.ra-m.ra)),
        inc=Math.atan2(sdist*Math.sin(phi),m.dist-sdist*Math.cos(phi)),
        angle=Math.atan2(Math.cos(s.dec)*Math.sin(s.ra-m.ra),Math.sin(s.dec)*Math.cos(m.dec)-Math.cos(s.dec)*Math.sin(m.dec)*Math.cos(s.ra-m.ra));
  return{
    fraction:(1+Math.cos(inc))/2,
    phase:0.5+0.5*inc*(angle<0?-1:1)/Math.PI,
    angle:angle
  };
}

function getMoonTimes(date,lat,lng){
  const t=new Date(date);
  t.setHours(0,0,0,0);
  const hc=0.133*_MR; // moon apparent radius
  const lw=-lng*_MR, phi=lat*_MR;
  let h0=_getMoonAltitude(t,lw,phi)-hc, rise,set;
  for(let i=1;i<=24;i+=2){
    const h1=_getMoonAltitude(_hoursLater(t,i),lw,phi)-hc;
    const h2=_getMoonAltitude(_hoursLater(t,i+1),lw,phi)-hc;
    const a=(h0+h2)/2-h1, b=(h2-h0)/2, xe=-b/(2*a), ye=a*xe*xe+b*xe+h1;
    const disc=b*b-4*a*h1;
    let roots=0, x1, x2;
    if(disc>=0){
      const dx=Math.sqrt(disc)/(Math.abs(a)*2);
      x1=xe-dx; x2=xe+dx;
      if(Math.abs(x1)<=1) roots++;
      if(Math.abs(x2)<=1) roots++;
      if(x1<-1) x1=x2;
    }
    if(roots===1){
      if(h0<0) rise=i+x1;
      else set=i+x1;
    } else if(roots===2){
      rise=i+(ye<0?x2:x1);
      set=i+(ye<0?x1:x2);
    }
    if(rise!==undefined&&set!==undefined) break;
    h0=h2;
  }
  const result={};
  if(rise!==undefined) result.rise=_hoursLater(t,rise);
  if(set!==undefined) result.set=_hoursLater(t,set);
  result.alwaysUp=!rise&&!set&&h0>0;
  result.alwaysDown=!rise&&!set&&h0<=0;
  return result;
}
function _getMoonAltitude(date,lw,phi){
  const d=_toDays(date), c=_moonCoords(d),
        H=_siderealTime(d,lw)-c.ra;
  return Math.asin(Math.sin(phi)*Math.sin(c.dec)+Math.cos(phi)*Math.cos(c.dec)*Math.cos(H));
}
function _hoursLater(d,h){return new Date(d.valueOf()+h*36e5);}

// Convenience wrappers
function wxMoonPhase(d){return getMoonIllumination(d).phase;}
function calcMoonRiseSet(lat,lon,tzOffsetSec){
  const now=new Date();
  const local=new Date(now.getTime()+tzOffsetSec*1000+now.getTimezoneOffset()*60000);
  const mt=getMoonTimes(local,lat,lon);
  const toSecs=d=>{if(!d)return -1; const h=d.getHours(),m=d.getMinutes(),s=d.getSeconds(); return h*3600+m*60+s;};
  return{rise:mt.rise?toSecs(mt.rise):-1, set:mt.set?toSecs(mt.set):-1};
}

function wxSkyRGB(df){
  // Remap dayFrac so actual sunrise→0.25, noon→0.5, sunset→0.75
  const srFrac=wxSunriseS/86400, ssFrac=wxSunsetS/86400;
  const noon=(srFrac+ssFrac)/2;
  let mapped;
  if(df<srFrac) mapped=0.25*(df/srFrac);
  else if(df<noon) mapped=0.25+0.25*((df-srFrac)/(noon-srFrac));
  else if(df<ssFrac) mapped=0.5+0.25*((df-noon)/(ssFrac-noon));
  else mapped=0.75+0.25*((df-ssFrac)/(1-ssFrac));
  const s=[
    [0.00, [0,2,20]],   [0.20, [2,4,25]],   [0.22, [25,15,40]],
    [0.25, [180,90,40]], [0.27, [240,160,60]],[0.30, [100,180,240]],
    [0.40, [20,130,245]],[0.50, [15,120,255]],[0.60, [20,130,245]],
    [0.70, [80,160,240]],[0.73, [240,160,50]],[0.75, [220,80,30]],
    [0.80, [30,10,30]],  [1.00, [0,2,20]]
  ];
  let a=s[0],b=s[s.length-1];
  for(let i=0;i<s.length-1;i++){if(mapped>=s[i][0]&&mapped<s[i+1][0]){a=s[i];b=s[i+1];break;}}
  const m=(mapped-a[0])/(b[0]-a[0]||1);
  return[(a[1][0]+(b[1][0]-a[1][0])*m)/255,(a[1][1]+(b[1][1]-a[1][1])*m)/255,(a[1][2]+(b[1][2]-a[1][2])*m)/255];
}

function wxInitScene(code){
  wxClouds=[];wxParticles=[];wxStars=[];
  const isRainCode=code>=51&&code<=55||code>=61&&code<=65||code>=80&&code<=82||code>=95;
  const isSnowCode=code>=71&&code<=77||code>=85&&code<=86;
  const isStormCode=code>=95;
  const isHeavyRain=code===55||code===65||code>=81;
  const isOvercastCode=code===3;
  const nc=code===0?0:code===1?8:code<=2?25:isOvercastCode?160:isStormCode?180:isHeavyRain?80:isRainCode?70:isSnowCode?18:code>=45&&code<=48?12:10;
  const dark=isStormCode;
  for(let i=0;i<nc;i++) wxClouds.push({px:Math.random(),py:isOvercastCode||isStormCode||isRainCode?0.2+Math.random()*0.75:0.3+Math.random()*0.6,
    sz:isOvercastCode||isStormCode?0.16+Math.random()*0.24:isRainCode?0.14+Math.random()*0.22:code<=2?0.1+Math.random()*0.18:0.07+Math.random()*0.14,
    spd:0.0002+Math.random()*0.0004,
    spdY:(Math.random()-0.35)*0.00012,
    br:dark?0.3+Math.random()*0.2:isOvercastCode?0.4+Math.random()*0.25:isRainCode?0.4+Math.random()*0.3:0.6+Math.random()*0.4,
    puffs:isOvercastCode||isStormCode?6+Math.floor(Math.random()*6):isRainCode?5+Math.floor(Math.random()*5):3+Math.floor(Math.random()*5),fluff:Math.random(),
    tint:0.85+Math.random()*0.3,bubSeed:Math.random()*1000});
  for(let i=0;i<100;i++) wxStars.push({px:Math.random(),py:Math.random(),
    br:0.3+Math.random()*0.7,tw:Math.random()*Math.PI*2,spd:1.5+Math.random()*3});
  const np=isStormCode?150:isHeavyRain?120:isRainCode?80:isSnowCode?60:0;
  for(let i=0;i<np;i++) wxParticles.push({
    face:Math.floor(Math.random()*4),
    u:Math.random()*(SIZE-1),v:Math.random()*(SIZE-1),
    spd:isRainCode?3+Math.random()*5:0.4+Math.random()*0.8,
    snow:isSnowCode,drift:isRainCode?(Math.random()-0.5)*1.5:0
  });

  // Skyline — realistic city with downtown clusters, suburbs, trees, landmarks
  const panW=4*SIZE;
  wxSkyline=new Uint8Array(panW);
  const seed=Math.abs(Math.round(wxLat*100+wxLon*10+code*7))%9999;
  wxSkyShapes=[];
  function sRnd(x){ return ((x*2654435761)>>>0)/4294967296; }

  // Iconic landmark silhouettes for known cities
  // Each landmark: array of {dx, row, w} relative spans per row (bottom=0)
  const cityLower=(wxCityDisplay||'').toLowerCase().replace(/[^a-z ]/g,'');
  const landmarks={
    'paris':{ name:'eiffel', h:24, w:14, draw(li,row){
      const mid=7;
      // Open lattice legs with arch
      if(row===0) return li===mid-5||li===mid-4||li===mid+4||li===mid+5;
      if(row===1) return li===mid-4||li===mid-3||li===mid+3||li===mid+4;
      if(row===2) return li===mid-3||li===mid-2||li===mid+2||li===mid+3;
      if(row===3) return li===mid-3||li===mid+3; // arch opening
      if(row===4) return li===mid-2||li===mid+2;
      if(row===5) return Math.abs(li-mid)<=4; // first platform (wide)
      if(row===6) return li===mid-2||li===mid-1||li===mid+1||li===mid+2;
      if(row===7) return li===mid-2||li===mid+2;
      if(row===8) return li===mid-1||li===mid+1;
      if(row===9) return Math.abs(li-mid)<=3; // second platform
      if(row<13) return li===mid-1||li===mid||li===mid+1;
      if(row===13) return Math.abs(li-mid)<=2; // observation deck
      if(row<18) return li===mid;
      if(row===18) return li===mid-1||li===mid||li===mid+1; // top platform
      if(row<24) return li===mid; // antenna spire
      return false;
    }},
    'cairo':{ name:'pyramid', h:10, w:28, draw(li,row){
      const p1=Math.abs(li-9)<=Math.max(0,9-row);
      const p2=Math.abs(li-21)<=Math.max(0,6-Math.floor(row*7/10));
      return p1||p2;
    }},
    'london':{ name:'bigben', h:22, w:10, draw(li,row){
      const mid=5;
      // Parliament base with windows
      if(row<3) return li>=1&&li<=8;
      if(row===3) return li>=1&&li<=8&&li!==4&&li!==5; // window openings
      if(row===4) return li>=1&&li<=8;
      // Tower body
      if(row<8) return Math.abs(li-mid)<=2;
      // Clock face — open center
      if(row===8) return Math.abs(li-mid)<=3;
      if(row===9) return Math.abs(li-mid)<=3&&Math.abs(li-mid)!==0; // clock opening
      if(row===10) return Math.abs(li-mid)<=3;
      // Upper tower with gothic details
      if(row<14) return Math.abs(li-mid)<=2;
      if(row===14) return Math.abs(li-mid)<=3; // belfry overhang
      if(row===15) return Math.abs(li-mid)<=2;
      // Roof pyramid
      if(row===16) return Math.abs(li-mid)<=2;
      if(row===17) return Math.abs(li-mid)<=1;
      if(row<22) return li===mid; // spire
      return false;
    }},
    'new york':{ name:'statue', h:22, w:12, draw(li,row){
      const mid=5;
      // Pedestal
      if(row<2) return Math.abs(li-mid)<=4;
      if(row<4) return Math.abs(li-mid)<=3;
      if(row<6) return Math.abs(li-mid)<=2;
      // Robe/body — asymmetric (wider at base)
      if(row===6) return Math.abs(li-mid)<=2;
      if(row===7) return Math.abs(li-mid)<=2;
      if(row<10) return Math.abs(li-mid)<=1;
      // Shoulders
      if(row===10) return Math.abs(li-mid)<=2;
      // Head + crown + raised torch arm
      if(row===11) return li===mid-1||li===mid||li===mid+1||li===mid+3;
      if(row===12) return li===mid||li===mid+3; // head + torch arm
      if(row===13) return li===mid||li===mid+3;
      if(row===14) return li===mid||li===mid+3;
      // Crown spikes + torch
      if(row===15) return li===mid-1||li===mid||li===mid+1||li===mid+3;
      if(row===16) return li===mid+2||li===mid+3||li===mid+4; // torch flame
      if(row===17) return li===mid+3;
      return false;
    }},
    'sydney':{ name:'opera', h:14, w:18, draw(li,row){
      // Multiple interlocking sail/shell shapes
      if(row<2) return li>=1&&li<=16; // base platform
      // Sail 1 (left)
      const s1=li>=2&&li<=6&&row<(2+Math.round((7-li)*1.6));
      // Sail 2 (center-left)
      const s2=li>=5&&li<=9&&row<(2+Math.round((10-li)*1.4));
      // Sail 3 (center-right)
      const s3=li>=9&&li<=13&&row<(2+Math.round((14-li)*1.3));
      // Sail 4 (right, smaller)
      const s4=li>=13&&li<=16&&row<(2+Math.round((17-li)*1.1));
      return s1||s2||s3||s4;
    }},
    'rome':{ name:'colosseum', h:12, w:18, draw(li,row){
      // Elliptical shape — wider at middle
      const cx=9,rx=9-row*0.3;
      if(Math.abs(li-cx)>rx) return false;
      if(row<2) return true; // solid base
      // Arched openings on each level
      const archOpen=(li+row)%3===1&&li>1&&li<16;
      if(row<5) return !archOpen;
      if(row<8) return !archOpen&&Math.abs(li-cx)<rx-1;
      if(row<10) return Math.abs(li-cx)<rx-2&&!archOpen;
      // Broken top edge
      if(row<12) return Math.abs(li-cx)<rx-3&&((li+row)%2===0);
      return false;
    }},
    'dubai':{ name:'burjkhalifa', h:28, w:8, draw(li,row){
      const mid=4;
      // Y-shaped base with three wings
      if(row<3) return Math.abs(li-mid)<=3;
      if(row<6) return Math.abs(li-mid)<=3;
      if(row<10) return Math.abs(li-mid)<=2;
      // Gradual taper with setbacks
      if(row===10) return Math.abs(li-mid)<=3; // setback ledge
      if(row<15) return Math.abs(li-mid)<=2;
      if(row===15) return Math.abs(li-mid)<=2; // setback
      if(row<20) return Math.abs(li-mid)<=1;
      if(row<24) return li===mid||li===mid+1;
      // Spire
      if(row<28) return li===mid;
      return false;
    }},
    'tokyo':{ name:'tokyotower', h:22, w:10, draw(li,row){
      const mid=5;
      // Wide lattice legs
      if(row===0) return li===mid-4||li===mid+4;
      if(row===1) return li===mid-3||li===mid+3;
      if(row===2) return li===mid-3||li===mid+3;
      if(row===3) return li===mid-2||li===mid+2;
      if(row===4) return li===mid-2||li===mid+2;
      // Main deck
      if(row===5) return Math.abs(li-mid)<=4;
      if(row===6) return Math.abs(li-mid)<=3;
      // Upper body
      if(row<10) return Math.abs(li-mid)<=2;
      if(row<12) return Math.abs(li-mid)<=1;
      // Special deck
      if(row===12) return Math.abs(li-mid)<=3;
      if(row===13) return Math.abs(li-mid)<=2;
      if(row<17) return Math.abs(li-mid)<=1;
      // Antenna
      if(row<22) return li===mid;
      return false;
    }},
    'san francisco':{ name:'goldengate', h:16, w:22, draw(li,row){
      if(li===6||li===15) return true;
      if(row===4) return true;
      let cr;
      if(li>=6&&li<=15) cr=Math.round(7+7*Math.pow((li-10.5)/4.5,2));
      else if(li<6) cr=Math.round(14-(6-li)*1.7);
      else cr=Math.round(14-(li-15)*1.7);
      if(row===cr&&cr>4) return true;
      if(li!==6&&li!==15&&li>=2&&li<=19&&li%2===0&&row>4&&row<cr) return true;
      return false;
    }},
    'rio de janeiro':{ name:'christredeemer', h:18, w:16, draw(li,row){
      const mid=8;
      // Mountain/pedestal base
      if(row<3) return Math.abs(li-mid)<=Math.max(0,7-row*2);
      if(row<5) return Math.abs(li-mid)<=2;
      // Body robe
      if(row<8) return Math.abs(li-mid)<=1;
      // Outstretched arms
      if(row===8) return Math.abs(li-mid)<=7;
      if(row===9) return Math.abs(li-mid)<=6;
      if(row===10) return Math.abs(li-mid)<=2;
      // Upper body
      if(row<13) return Math.abs(li-mid)<=1;
      // Head
      if(row===13) return li===mid-1||li===mid||li===mid+1;
      if(row===14) return li===mid;
      return false;
    }},
    'pisa':{ name:'leaningtower', h:18, w:8, draw(li,row){
      // Leaning tower — shifts right as it goes up
      const lean=row*0.22;
      const cx=2+lean;
      // Gallery floors (wider) every 3 rows
      if(row%3===0) return Math.abs(li-cx)<=2.5;
      // Columns between galleries
      return Math.abs(li-cx)<=1.5;
    }},
    'moscow':{ name:'kremlin', h:20, w:12, draw(li,row){
      const mid=6;
      // Kremlin wall base
      if(row<3) return li>=1&&li<=10;
      if(row<5) return li>=2&&li<=9;
      // Tower body
      if(row<8) return Math.abs(li-mid)<=2;
      // Stepped crown
      if(row===8) return Math.abs(li-mid)<=3;
      if(row===9) return Math.abs(li-mid)<=3;
      // Onion dome
      if(row===10) return Math.abs(li-mid)<=2;
      if(row===11) return Math.abs(li-mid)<=3; // widest
      if(row===12) return Math.abs(li-mid)<=3;
      if(row===13) return Math.abs(li-mid)<=2;
      if(row===14) return Math.abs(li-mid)<=1;
      // Dome point + cross
      if(row<18) return li===mid;
      if(row===18) return li===mid-1||li===mid||li===mid+1; // cross
      if(row===19) return li===mid;
      return false;
    }},
    'washington':{ name:'monument', h:24, w:6, draw(li,row){
      const mid=3;
      if(row<2) return Math.abs(li-mid)<=2; // base
      if(row<20) return li===mid-1||li===mid||li===mid+1; // shaft
      // Pyramidion top
      if(row===20) return Math.abs(li-mid)<=2;
      if(row===21) return Math.abs(li-mid)<=1;
      if(row<24) return li===mid;
      return false;
    }},
    'seattle':{ name:'spaceneedle', h:22, w:12, draw(li,row){
      const mid=6;
      // Base/legs
      if(row<2) return Math.abs(li-mid)<=2;
      if(row===2) return li===mid-1||li===mid||li===mid+1;
      // Narrow stem
      if(row<12) return li===mid;
      // Flying saucer disc
      if(row===12) return Math.abs(li-mid)<=5;
      if(row===13) return Math.abs(li-mid)<=4;
      if(row===14) return Math.abs(li-mid)<=3;
      // Above saucer — restaurant
      if(row<17) return Math.abs(li-mid)<=2;
      if(row===17) return Math.abs(li-mid)<=1;
      // Antenna
      if(row<22) return li===mid;
      return false;
    }},
    'athens':{ name:'parthenon', h:12, w:16, draw(li,row){
      if(row<2) return li>=0&&li<16; // stepped base
      // Columns — spaced with gaps
      if(row<8) return li>=1&&li<15&&(li%2===1);
      // Entablature
      if(row===8) return li>=0&&li<16;
      // Triangular pediment
      if(row===9) return li>=1&&li<15;
      if(row===10) return li>=3&&li<13;
      if(row===11) return li>=5&&li<11;
      return false;
    }},
    'beijing':{ name:'templeof heaven', h:16, w:14, draw(li,row){
      const mid=7;
      // Circular base platform
      if(row<2) return Math.abs(li-mid)<=6;
      if(row<3) return Math.abs(li-mid)<=5;
      // Three-tiered conical roof
      if(row<5) return Math.abs(li-mid)<=5; // lower roof
      if(row===5) return Math.abs(li-mid)<=4;
      if(row<8) return Math.abs(li-mid)<=4; // middle roof
      if(row===8) return Math.abs(li-mid)<=3;
      if(row<11) return Math.abs(li-mid)<=3; // upper roof
      if(row===11) return Math.abs(li-mid)<=2;
      if(row<14) return Math.abs(li-mid)<=1;
      // Golden finial
      if(row<16) return li===mid;
      return false;
    }},
    'istanbul':{ name:'mosque', h:18, w:16, draw(li,row){
      const mid=8;
      // Base walls
      if(row<4) return li>=2&&li<=13;
      if(row<6) return li>=3&&li<=12;
      // Large dome
      const dR=5, dCy=10;
      const inDome=(li-mid)*(li-mid)/(dR*dR)+(row-dCy)*(row-dCy)/(dR*dR)<=1;
      if(row>=6&&row<=15&&inDome) return true;
      // Minarets (thin towers on sides)
      if(li===0&&row<14) return true;
      if(li===15&&row<14) return true;
      // Minaret tops
      if(row===14&&(li===0||li===15)) return true;
      if(row===15&&(li===0||li===15)) return true;
      // Crescent on dome
      if(row===16) return li===mid;
      return false;
    }},
    'agra':{ name:'tajmahal', h:20, w:16, draw(li,row){
      const mid=8;
      // Base platform
      if(row<2) return li>=1&&li<=14;
      // Main building body with arched entrance
      if(row<6) return li>=3&&li<=12&&!(row>2&&row<5&&Math.abs(li-mid)<=1);
      // Transition to dome
      if(row<8) return Math.abs(li-mid)<=4;
      // Onion dome
      if(row===8) return Math.abs(li-mid)<=4;
      if(row===9) return Math.abs(li-mid)<=5; // widest
      if(row===10) return Math.abs(li-mid)<=5;
      if(row===11) return Math.abs(li-mid)<=4;
      if(row===12) return Math.abs(li-mid)<=3;
      if(row===13) return Math.abs(li-mid)<=2;
      if(row===14) return Math.abs(li-mid)<=1;
      if(row<17) return li===mid; // finial
      // Side minarets
      if(row<12&&(li===1||li===14)) return true;
      if(row===12&&(li===1||li===14)) return true;
      return false;
    }},
    'barcelona':{ name:'sagrada', h:24, w:14, draw(li,row){
      // Facade base
      if(row<6) return li>=1&&li<=12;
      // Four main spires rising from facade
      const spires=[2,5,9,12];
      for(const sx of spires){
        const h=row-6;
        const maxH=sx===5||sx===9?18:15; // center spires taller
        if(h<maxH&&Math.abs(li-sx)<=0) return true;
        // Spire tops — pointed
        if(h===maxH&&li===sx) return true;
      }
      // Cross-pieces between spires
      if(row===8||row===12) return li>=2&&li<=12;
      return false;
    }},
  };
  // Match city name to landmark
  let cityLandmark=null;
  for(const [city,lm] of Object.entries(landmarks)){
    if(cityLower.includes(city)){ cityLandmark=lm; break; }
  }
  // Create 2-3 downtown clusters per panorama
  const maxH=Math.floor(SIZE*0.35);
  const clusters=[];
  const nClust=2+((seed*37)%3);
  for(let ci=0;ci<nClust;ci++){
    const cx=Math.floor(panW*(0.15+ci*0.7/nClust+sRnd(seed*101+ci*77)*0.15));
    const cw=12+Math.floor(sRnd(seed*203+ci)*16);
    const ch=maxH-Math.floor(sRnd(seed*307+ci)*6);
    clusters.push({cx,cw,ch});
  }
  function clusterInfluence(px){
    let best=0;
    for(const c of clusters){
      const d=Math.abs(px-c.cx);
      if(d<c.cw){ const f=1-d/c.cw; best=Math.max(best,f*f*c.ch); }
    }
    return best;
  }
  let bx=0;
  while(bx<panW){
    const r0=sRnd(bx*1327+seed*43+13);
    const ci=clusterInfluence(bx);
    const inDowntown=ci>maxH*0.3;
    const typeR=Math.floor(sRnd(bx*4517+seed*89)*100);
    // types: 0=building, 1=house, 2=tree, 3=church/tower, 4=skyscraper, 5=antenna, 6=crane, 7=dome
    let typ,bw,bh;
    if(inDowntown){
      if(typeR<10){ typ=5; bw=1; bh=Math.floor(ci*1.1)+2; } // antenna
      else if(typeR<20){ typ=4; bw=3+Math.floor(r0*3); bh=Math.floor(ci*0.9)+3; } // skyscraper
      else if(typeR<35){ typ=7; bw=3+Math.floor(r0*2); bh=Math.floor(ci*0.6)+2; } // dome
      else { typ=0; bw=2+Math.floor(r0*5); bh=Math.max(2,Math.floor(ci*0.5+r0*4)); } // building
    } else {
      if(typeR<30){ typ=2; bw=2+Math.floor(r0*2); bh=3+Math.floor(sRnd(bx*7919+seed)*5); } // tree
      else if(typeR<55){ typ=1; bw=4+Math.floor(r0*4); bh=2+Math.floor(sRnd(bx*3917+seed)*3); } // house
      else if(typeR<62){ typ=3; bw=2+Math.floor(r0); bh=5+Math.floor(sRnd(bx*6131+seed)*5); } // church
      else if(typeR<68){ typ=6; bw=1; bh=4+Math.floor(r0*5); } // crane
      else { typ=0; bw=2+Math.floor(r0*4); bh=2+Math.floor(sRnd(bx*7919+seed)*4+ci*0.3); } // building
    }
    wxSkyShapes.push({x:bx,w:bw,h:bh,t:typ});
    for(let i=0;i<bw&&bx+i<panW;i++) wxSkyline[bx+i]=bh;
    const gap=inDowntown?Math.floor(r0*2):1+Math.floor(sRnd(bx*31+seed)*3);
    bx+=bw+gap;
  }

  // Place landmark silhouette if city is recognized — one per face so always visible
  if(cityLandmark){
    const nFaces=panel2dMode?1:4;
    for(let fi=0;fi<nFaces;fi++){
      const faceCenter=fi*SIZE+Math.floor(SIZE/2);
      const lx=Math.max(fi*SIZE,Math.min((fi+1)*SIZE-cityLandmark.w,faceCenter-Math.floor(cityLandmark.w/2)));
      const lx2=lx+cityLandmark.w;
      for(let si=wxSkyShapes.length-1;si>=0;si--){
        const s=wxSkyShapes[si];
        if(s.x+s.w>lx && s.x<lx2) wxSkyShapes.splice(si,1);
      }
      for(let i=0;i<cityLandmark.w&&lx+i<panW;i++) wxSkyline[lx+i]=cityLandmark.h;
      wxSkyShapes.push({x:lx,w:cityLandmark.w,h:cityLandmark.h,t:8,lm:cityLandmark});
    }
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
    wxCreatures.push({
      type:'balloon', px:Math.random(), py:0.05,
      dx:0.0003+Math.random()*0.0002, dy:0,
      phase:'rise', phaseT:0, laps:0, maxLaps:2+Math.floor(Math.random()*3),
      color:[1,0.2,0.1],
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
    const wxUrl=`https://api.open-meteo.com/v1/forecast?latitude=${wxLat.toFixed(4)}&longitude=${wxLon.toFixed(4)}&current=temperature_2m,weather_code,wind_speed_10m&daily=sunrise,sunset,temperature_2m_max&timezone=auto&forecast_days=1`;
    let wr;
    try{ wr=await fetch(wxUrl); }
    catch(fe){ throw new Error('Weather fetch failed — check internet connection'); }
    if(!wr.ok) throw new Error('Weather API error: '+wr.status);
    const wd=await wr.json();
    wxCode=wd.current?.weather_code||0;
    wxTemp=Math.round(wd.current?.temperature_2m||20);
    wxTempMax=Math.round(wd.daily?.temperature_2m_max?.[0]||wxTemp);
    wxTzOffset=wd.utc_offset_seconds||0;
    const pt=s=>{ const p=(s||'').split('T')[1]||'00:00'; const[h,m]=(p.split(':')).map(Number); return h*3600+m*60; };
    wxSunriseS=pt(wd.daily?.sunrise?.[0])||21600;
    wxSunsetS=pt(wd.daily?.sunset?.[0])||72000;
    wxDesc=WX_CODES[wxCode]||'Unknown';

    // Calculate moonrise/moonset astronomically
    const moonRS=calcMoonRiseSet(wxLat,wxLon,wxTzOffset);
    wxMoonriseS=moonRS.rise;
    wxMoonsetS=moonRS.set;
    wxInitScene(wxCode);
    wxLastFetch=Date.now()/1000;
    if(statusEl) statusEl.textContent=city;
    if(infoEl){
      infoEl.style.display='block';
      const tl=document.getElementById('wx-temp-line');
      const sl=document.getElementById('wx-sun-line');
      if(tl) tl.textContent=`${wxTemp}°C (Max: ${wxTempMax}°C)  •  ${wxDesc}`;
      if(sl){
        const fmt=s=>{ try{return new Date(s).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}catch(e){return'?';} };
        sl.textContent=`🌅 ${fmt(wd.daily?.sunrise?.[0])}   🌇 ${fmt(wd.daily?.sunset?.[0])}`;
      }
      const ml=document.getElementById('wx-moon-line');
      if(ml){
        const fmtS=s=>{if(s<0)return'—';const hh=Math.floor(s/3600),mm=Math.floor((s%3600)/60);return `${hh}:${String(mm).padStart(2,'0')}`;};
        const mi=getMoonIllumination(new Date());
        const ph=mi.phase, illum=Math.round(mi.fraction*100);
        const pName=ph<0.03?'New':ph<0.22?'Waxing Crescent':ph<0.28?'First Quarter':ph<0.47?'Waxing Gibbous':ph<0.53?'Full':ph<0.72?'Waning Gibbous':ph<0.78?'Last Quarter':ph<0.97?'Waning Crescent':'New';
        ml.textContent=`🌙 ↑${fmtS(wxMoonriseS)} ↓${fmtS(wxMoonsetS)}  ${pName} ${illum}%`;
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

  // Moon — visible day and night; faint midday, stronger near dusk
  const nightLen=86400-dayLen||1;
  const fromSunset=secsDay>wxSunsetS?secsDay-wxSunsetS:secsDay+(86400-wxSunsetS);
  const nightProg=!isDay?fromSunset/nightLen:0;
  const moonPh=wxMoonPhase(new Date());
  // Moon position from API moonrise/moonset, fallback to phase-based estimate
  let moonUp=false, moonDayProg=0;
  if(wxMoonriseS>=0 || wxMoonsetS>=0){
    if(wxMoonriseS>=0 && wxMoonsetS>=0){
      if(wxMoonsetS>wxMoonriseS){
        moonUp=secsDay>=wxMoonriseS&&secsDay<=wxMoonsetS;
        if(moonUp) moonDayProg=(secsDay-wxMoonriseS)/(wxMoonsetS-wxMoonriseS);
      } else {
        moonUp=secsDay>=wxMoonriseS||secsDay<=wxMoonsetS;
        const span=wxMoonsetS+86400-wxMoonriseS;
        if(moonUp) moonDayProg=((secsDay-wxMoonriseS+86400)%86400)/span;
      }
    } else if(wxMoonriseS>=0){
      moonUp=secsDay>=wxMoonriseS;
      if(moonUp) moonDayProg=Math.min(1,(secsDay-wxMoonriseS)/43200);
    } else {
      moonUp=secsDay<=wxMoonsetS;
      if(moonUp&&wxMoonsetS>0) moonDayProg=0.5+0.5*(1-secsDay/wxMoonsetS);
    }
  } else {
    // Fallback: estimate from phase
    const moonLag=moonPh*24;
    const moonRiseH=(wxSunriseS/3600+moonLag)%24;
    const moonSetH=(wxSunsetS/3600+moonLag)%24;
    const hourNow=secsDay/3600;
    if(moonSetH>moonRiseH){
      moonUp=hourNow>=moonRiseH&&hourNow<=moonSetH;
      if(moonUp) moonDayProg=(hourNow-moonRiseH)/(moonSetH-moonRiseH);
    } else {
      const span=moonSetH+24-moonRiseH;
      moonDayProg=((hourNow-moonRiseH+24)%24)/span;
      moonUp=moonDayProg>=0&&moonDayProg<=1;
    }
  }
  let moonPX,moonElev,moonAlpha;
  if(moonUp){
    moonPX=moonDayProg*0.5;
    moonElev=Math.sin(moonDayProg*Math.PI)*0.85;
    if(isDay){
      const toSunset=(wxSunsetS-secsDay)/3600;
      if(toSunset<3) moonAlpha=0.25+0.75*(1-toSunset/3);
      else if(toSunset<6) moonAlpha=0.08+0.17*(1-toSunset/6);
      else moonAlpha=0.08;
    } else {
      moonAlpha=1;
    }
  } else {
    moonPX=-1; moonElev=0; moonAlpha=0;
  }

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
      skyCol=[skyCol[0]*0.3+0.12,skyCol[1]*0.3+0.13,skyCol[2]*0.35+0.15];
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

  const HORIZ=0.26; // horizon at 32% from bottom of side faces
  const WX_CLEAR_TOP=HORIZ+(1-HORIZ)/3; // clear zone: horizon up 1/3 of sky
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
  function uOfFacePanIdx(face,pi){
    if(panel2dMode){
      if(pi<0||pi>=SIZE) return -1;
      return pi;
    }
    const fIdx=SIDE.indexOf(face);
    if(fIdx<0) return -1;
    const fStart=fIdx*SIZE;
    const local=pi-fStart;
    if(local<0||local>=SIZE) return -1;
    return local;
  }
  function vOfElevFrac(elev){ // elev 0=horizon, 1=top
    return Math.round((HORIZ+elev*(1-HORIZ))*S1);
  }

  // Skyline building colour
  const bldDay=isDay;
  const bldR=bldDay?0.12:0.07, bldG=bldDay?0.13:0.07, bldB=bldDay?0.16:0.1;
  const horizV=Math.round(HORIZ*S1);
  const textV=3; // v position for text baseline
  const tempV=10; // temperature higher up
  const bldBase=horizV; // buildings start at horizon line

  // Bitmap font 3×5 — defined at module scope as PIXEL_FONT, reused here
  const WXF=PIXEL_FONT;

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
  const tempStr=(wxTemp<0?'-':'')+Math.abs(wxTemp)+'/'+(wxTempMax<0?'-':'')+Math.abs(wxTempMax)+'°C';
  const locStr=(wxCityDisplay||document.getElementById('wx-city')?.value||'').trim().normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase();

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
          let pr=r,pg=g,pb=b;
          // Sun glow — brighten sky near sun position
          if(isDay&&sunElev>0&&!isOvercast&&!isStorm&&!isRain){
            const px=panXOfFaceU(face,u);
            const dx=Math.abs(px-sunPX); const dxw=Math.min(dx,1-dx);
            const sunV=HORIZ+sunElev*(1-HORIZ);
            const dy=(vFrac-sunV)*1.5;
            const dist=Math.sqrt(dxw*dxw*4+dy*dy);
            if(dist<1.0){
              const glow=Math.pow(1-dist,1.5)*0.45;
              pr=Math.min(1,pr+glow*1.0);
              pg=Math.min(1,pg+glow*0.9);
              pb=Math.min(1,pb+glow*0.45);
            }
          }
          colBuf[idx*3]=pr; colBuf[idx*3+1]=pg; colBuf[idx*3+2]=pb;
        }
        continue; // skip per-u ground handling for sky rows
      }

      // Ground row: fill with ground colour
      for(let u=0;u<S;u++){
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        colBuf[idx*3]=gR; colBuf[idx*3+1]=gG; colBuf[idx*3+2]=gB;
      }
    }

    // Draw temperature higher up on all faces
    wxText(face,tempStr,1,tempV,txtR,txtG,txtB);
    // Draw time on all four side faces
    {
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
      if(panel2dMode) wxText(0,locStr,Math.max(0,S-textW-1),textV,lr,lg,lb);
      else for(let fi=0;fi<4;fi++) wxText(SIDE[fi],locStr,Math.max(0,S-textW-1),textV,lr,lg,lb);
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
  const sunDim=isDay&&isStorm?0.35:isDay&&isRain?0.55:1;
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
          const d=sunDim;
          if(dist<=radius){ blendLED(idx,d,0.98*d,0.7*d); }
          else if(dist<radius+2){ const b=(1-(dist-radius)/2)*0.9*d; blendLED(idx,b,b*0.85,b*0.25); }
          else if(dist<radius+5){ const b=(1-(dist-radius-2)/3)*0.3*d; blendLED(idx,b,b*0.6,b*0.05); }
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
      if(fv>=Math.round(HORIZ*S)&&fv<=Math.round(WX_CLEAR_TOP*S)) continue;
      const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
      if(isSun){
        const d=sunDim;
        if(dist<=radius){ blendLED(idx,d,0.98*d,0.7*d); }
        else if(dist<radius+2){ const b=(1-(dist-radius)/2)*0.95*d; blendLED(idx,b,b*0.88,b*0.3); }
        else if(dist<radius+5){ const b=(1-(dist-radius-2)/3)*0.5*d; blendLED(idx,b,b*0.7,b*0.12); }
        else if(dist<radius+8){ const b=(1-(dist-radius-5)/3)*0.2*d; blendLED(idx,b,b*0.6,b*0.08); }
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
        const moonB=(0.8+0.1*Math.sin(du*1.3+dv*0.9))*lit*edge*moonAlpha;
        blendLED(idx,moonB,moonB*0.97,moonB*0.88);
      }
    } else if(dist<radius+2){
      const glow=(1-(dist-radius)/2)*0.18*moonAlpha;
      blendLED(idx,glow,glow*0.95,glow*0.88);
    }
  }

  // ── Sun ──
  if(!panel2dMode && isDay && sunPX>=0) drawBody(sunPX,sunElev,true,0);

  // ── Moon — visible when above horizon, moonAlpha controls brightness ──
  if(!panel2dMode && moonUp && moonAlpha>0.01) drawBody(moonPX,moonElev,false,moonPh);

  // ── Clouds ──
  const cloudDark=isStorm?0.85:isRain?0.7:isOvercast?0.95:wxCode>=3?0.65:0.85;
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
      let relCY=vOfElevFrac(cl.py);
      const _clrTop7=Math.round(WX_CLEAR_TOP*S);
      const _clrBot7=Math.round(HORIZ*S);
      const wVchk=Math.round(cl.sz*0.28*S);
      if(relCY-wVchk<_clrTop7-6) relCY=_clrTop7-6+Math.round(wVchk*0.4);
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
          const _bubRow=_clrTop7-6+Math.round(1.6*Math.sin(fu*0.55+p*2.1+cl.bubSeed));
          if(fv>=_clrBot7&&fv<_bubRow) continue;
          const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
          let edge;
          if(isOvercast){
            if(dist<0.55) edge=1;
            else if(dist<0.75){ const t=(dist-0.55)/0.2; edge=1+0.2*Math.sin(t*Math.PI); }
            else { edge=Math.max(0,(1-dist)/0.25); edge*=edge; }
          } else edge=1-dist;
          let cb=cl.br*cloudDark*edge;
          if(isOvercast){
            const clTint=cl.tint;
            const pxVar=0.92+((fu*2657+fv*4391)>>>0)%16*0.01;
            const edgeLift=dist>0.5?1+0.15*(dist-0.5)/0.5:1;
            cb*=clTint*pxVar*edgeLift;
          }
          const warm=(isDawn||isDusk)?cl.fluff*0.06*glowAmt:0;
          if(isOvercast){
            const blueShift=0.02*((fu*317+fv*131)>>>0)%3*0.01;
            blendLED(idx,cb+warm,cb*(1-warm*0.3)+blueShift,cb*(1-warm*0.8)+blueShift*1.5);
          } else {
            blendLED(idx,cb+warm,cb*(1-warm*0.3),cb*(1-warm*0.8));
          }
        }
      }
    }
    // Also on top face
    const tu=Math.round(cl.px*S), tv=Math.round(cl.py*S);
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
      let cb=cl.br*cloudDark*topEdge*0.8;
      if(isOvercast){
        const clTint=cl.tint;
        const pxVar=0.92+((fu*2657+fv*4391)>>>0)%16*0.01;
        cb*=clTint*pxVar;
      }
      const warm=(isDawn||isDusk)?cl.fluff*0.06*glowAmt:0;
      if(isOvercast){
        const blueShift=0.02*((fu*317+fv*131)>>>0)%3*0.01;
        blendLED(idx,cb+warm,cb*(1-warm*0.3)+blueShift,cb*(1-warm*0.8)+blueShift*1.5);
      } else {
        blendLED(idx,cb+warm,cb*(1-warm*0.3),cb*(1-warm*0.8));
      }
    }
  }

  // For 2D panel mode, draw sun/moon on face 0 (before creatures so they appear in front)
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
          if(dist<=sunRad){ colBuf[idx*3]=sunDim; colBuf[idx*3+1]=0.98*sunDim; colBuf[idx*3+2]=0.7*sunDim; }
          else if(dist<sunRad+2){ const b=(1-(dist-sunRad)/2)*0.9*sunDim; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.85); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.25); }
          else if(dist<sunRad+4){ const b=(1-(dist-sunRad-2)/2)*0.35*sunDim; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.65); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.08); }
        }
      }
    }
    // 2D moon — drawn when above horizon, moonAlpha controls brightness
    if(moonUp && moonAlpha>0.01){
      const moonX=moonDayProg*S;
      const arc=Math.sin(moonDayProg*Math.PI);
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
            if(lit2d>0.05){ const mb=0.85*lit2d*moonAlpha; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+mb); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+mb*0.97); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+mb*0.9); }
          }
          else if(dist<moonRad+2){ const b=(1-(dist-moonRad)/2)*0.18*moonAlpha; colBuf[idx*3]=Math.min(1,colBuf[idx*3]+b); colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+b*0.95); colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+b*0.88); }
        }
      }
    }
  }

  // ── Birds & Planes ──
  for(const cr of wxCreatures){
    if(cr.delay>0){ cr.delay-=dt; continue; }
    cr.px=(cr.px+cr.dx*dt*60+1)%1;
    if(cr.type==='balloon'){
      if(!isDay) continue;
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
          cr.phase='rise'; cr.phaseT=0; cr.py=0.05;
          cr.px=Math.random(); cr.laps=0;
          cr.delay=60+Math.random()*120;
          continue;
        }
      }
      const _bc=[[1,0.2,0.1],[0.1,0.5,1],[0.9,0.8,0.1],[0.2,0.8,0.3],[0.8,0.2,0.8],[1,0.5,0]];
      let bestD=0;for(const cc of _bc){const d=(cc[0]-skyCol[0])**2+(cc[1]-skyCol[1])**2+(cc[2]-skyCol[2])**2;if(d>bestD){bestD=d;cr.color=cc;}}
      const crV=Math.round((HORIZ+cr.py*(1-HORIZ))*S1);
      if(!panel2dMode&&crV>=Math.round(HORIZ*S)&&crV<=Math.round(WX_CLEAR_TOP*S)) continue;
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
    if(!panel2dMode&&crV>=Math.round(HORIZ*S)&&crV<=Math.round(WX_CLEAR_TOP*S)) continue;
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
    if(iv>=Math.round(HORIZ*S)&&iv<=Math.round(WX_CLEAR_TOP*S)) continue;
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
        if(lu>=0&&lu<S&&lv>=0&&lv<S&&!(lv>=Math.round(HORIZ*S)&&lv<=Math.round(WX_CLEAR_TOP*S))){ blendLED(faceMap[bFace][lv*S+lu],1,1,0.9); }
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

  // Skyline silhouettes — final pass, drawn over all weather
  if(wxSkyShapes.length>0){
    const _panW=4*S;
    const _faces=panel2dMode?[0]:[SIDE[0],SIDE[1],SIDE[2],SIDE[3]];
    const night=!bldDay;
    for(const face of _faces){
      for(const sh of wxSkyShapes){
        for(let li=0;li<sh.w;li++){
          const pi=sh.x+li;
          if(pi>=_panW) break;
          const u=uOfFacePanIdx(face,pi);
          if(u<0||u>=S) continue;
          for(let row=0;row<sh.h;row++){
            const v=bldBase+row;
            if(v<0||v>=S) continue;
            let inShape=true;
            const mid=Math.floor(sh.w/2);
            if(sh.t===2){ // tree — trunk + round canopy
              if(row<2) inShape=Math.abs(li-mid)<=0;
              else { const cr=sh.h-2,cy=2+cr/2,rx=Math.max(1,sh.w*0.8); inShape=(li-mid)**2/(rx*rx)+(row-cy)**2/(cr*cr)<=1; }
            } else if(sh.t===1){ // house — walls + peaked roof
              const roofH=Math.max(1,Math.floor(sh.h*0.4));
              const wallH=sh.h-roofH;
              if(row>=wallH){ const rr=row-wallH; const span=sh.w*(1-rr/roofH); inShape=li>=Math.floor((sh.w-span)/2)&&li<Math.ceil((sh.w+span)/2); }
            } else if(sh.t===3){ // church — body + tapering spire
              const spireH=Math.floor(sh.h*0.5);
              const bodyH=sh.h-spireH;
              if(row<bodyH) inShape=true;
              else { const sr=row-bodyH; const sw=Math.max(1,sh.w*(1-sr/spireH)); inShape=li>=Math.floor((sh.w-sw)/2)&&li<Math.ceil((sh.w+sw)/2); }
            } else if(sh.t===4){ // skyscraper — stepped top
              const stepH=Math.max(1,Math.floor(sh.h*0.15));
              if(row>=sh.h-stepH){ const sw=Math.max(1,sh.w-2); inShape=li>=Math.floor((sh.w-sw)/2)&&li<Math.ceil((sh.w+sw)/2); }
            } else if(sh.t===5){ // antenna — single pixel wide
              inShape=li===mid;
              if(row===sh.h-1){ inShape=li>=mid-1&&li<=mid+1; } // small top
            } else if(sh.t===6){ // crane — vertical mast + horizontal arm at top
              if(row<sh.h-1) inShape=li===mid;
              else inShape=true; // arm across full width at top
            } else if(sh.t===7){ // dome — semicircle top
              const domeH=Math.max(1,Math.floor(sh.h*0.4));
              const wallH=sh.h-domeH;
              if(row>=wallH){ const dr=row-wallH; const rx=sh.w/2,ry=domeH; inShape=(li-mid)**2/(rx*rx)+(dr)**2/(ry*ry)<=1; }
            } else if(sh.t===8){ // landmark
              inShape=sh.lm.draw(li,row);
            }
            if(!inShape) continue;
            const idx=faceMap[face][v*S+u]; if(idx<0) continue;
            let br=bldR,bg=bldG,bb=bldB;
            if(sh.t===8){ br=bldDay?0.22:0.10; bg=bldDay?0.20:0.08; bb=bldDay?0.18:0.06; }
            // Depth variation — slightly different shades per building
            const depthVar=0.6+((pi*317+sh.x*131)>>>0)%40*0.01;
            br*=depthVar; bg*=depthVar; bb*=depthVar;
            // Edge highlight — lighter left edge for depth
            if(li===0){ br+=0.03; bg+=0.03; bb+=0.04; }
            // Tree coloring
            if(sh.t===2){
              if(row<2){ br=bldR*0.7; bg=bldG*0.7; bb=bldB*0.4; }
              else { br=0.01; bg=bldDay?0.05:0.02; bb=0.005; }
            }
            // Windows at night — grid pattern for buildings and skyscrapers
            if(night&&(sh.t===0||sh.t===4)&&sh.h>3){
              const winX=(li+sh.x*3)%3, winY=row%3;
              const lit=((pi*7+row*13+sh.x)%5)<3;
              if(winX===1&&winY===1&&lit&&row>0&&row<sh.h-1&&li>0&&li<sh.w-1){
                const warmth=((pi*31+row*7)%3);
                if(warmth===0){ br=0.55;bg=0.45;bb=0.1; }
                else if(warmth===1){ br=0.4;bg=0.5;bb=0.55; } // cool white
                else { br=0.5;bg=0.4;bb=0.15; }
              }
            }
            // House windows at night
            if(night&&sh.t===1&&row>0){
              const wallH=sh.h-Math.max(1,Math.floor(sh.h*0.4));
              if(row<wallH&&li>0&&li<sh.w-1&&((li+row*3)%4)<2){ br=0.55;bg=0.45;bb=0.1; }
            }
            // Church windows
            if(night&&sh.t===3&&row>0&&row<sh.h-Math.floor(sh.h*0.5)&&li===mid){ br=0.6;bg=0.5;bb=0.15; }
            // Dome highlight
            if(sh.t===7&&row===sh.h-1&&li===mid){ br+=0.04;bg+=0.04;bb+=0.05; }
            // Aircraft warning light on tall buildings/antennas at night
            if(night&&(sh.t===4||sh.t===5)&&row===sh.h-1&&li===mid){
              const blink=Math.sin(wxT2*3+sh.x)>0.3;
              if(blink){ br=1;bg=0.1;bb=0.1; }
            }
            // Crane light
            if(night&&sh.t===6&&row===sh.h-1&&(li===0||li===sh.w-1)){
              br=1;bg=0.8;bb=0;
            }
            colBuf[idx*3]=br; colBuf[idx*3+1]=bg; colBuf[idx*3+2]=bb;
          }
        }
      }
    }
  }
}

// ── MOON — realistic lunar surface with phase, craters, maria ──
let moonLat=52.04, moonLon=-0.76, moonCityDisplay='Milton Keynes';
let moonRiseS=-1, moonSetS=-1, moonFetching=false;

let moonCityTimer=null;
function moonUpdateCityDropdown(){
  const input=document.getElementById('moon-city')?.value.trim()||'';
  const dropdown=document.getElementById('moon-city-dropdown');
  if(!dropdown) return;
  if(input.length<2){dropdown.style.display='none';return;}
  clearTimeout(moonCityTimer);
  moonCityTimer=setTimeout(()=>{
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=5&language=en`)
      .then(r=>r.json()).then(d=>{
        if(!d.results||!d.results.length){dropdown.style.display='none';return;}
        dropdown.innerHTML='';
        d.results.forEach(r=>{
          const el=document.createElement('div');
          const short=r.country?`${r.name}, ${r.country}`:r.name;
          el.textContent=`${r.name}${r.admin1?', '+r.admin1:''}${r.country?', '+r.country:''}`;
          el.style.cssText='padding:6px 8px;cursor:pointer;font-size:13px;color:#aab;border-bottom:1px solid rgba(80,120,255,0.1)';
          el.dataset.lat=r.latitude; el.dataset.lon=r.longitude; el.dataset.short=short;
          el.onmouseenter=()=>el.style.background='rgba(80,120,255,0.15)';
          el.onmouseleave=()=>el.style.background='';
          el.onclick=()=>{
            document.getElementById('moon-city').value=short;
            moonCityDisplay=short;
            moonLat=parseFloat(el.dataset.lat);
            moonLon=parseFloat(el.dataset.lon);
            dropdown.style.display='none';
            moonFetchData();
          };
          dropdown.appendChild(el);
        });
        dropdown.style.display='block';
      }).catch(()=>{});
  },300);
}
document.getElementById('moon-city')?.addEventListener('input',moonUpdateCityDropdown);
document.getElementById('moon-city')?.addEventListener('focus',moonUpdateCityDropdown);
document.addEventListener('click',e=>{
  if(!e.target.closest('#moon-city')&&!e.target.closest('#moon-city-dropdown')){
    const dd=document.getElementById('moon-city-dropdown');
    if(dd) dd.style.display='none';
  }
});

async function moonFetchData(){
  if(moonFetching) return;
  moonFetching=true;
  const statusEl=document.getElementById('moon-status');
  const infoEl=document.getElementById('moon-info');
  const city=(document.getElementById('moon-city')?.value||'Milton Keynes').trim();
  try{
    if(statusEl) statusEl.textContent=`Looking up ${city}…`;
    if(!moonLat||!moonLon||(moonCityDisplay&&moonCityDisplay!==city)){
      const gr=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en`);
      const gd=await gr.json();
      if(!gd.results||!gd.results.length) throw new Error('City not found');
      moonLat=gd.results[0].latitude;
      moonLon=gd.results[0].longitude;
      moonCityDisplay=gd.results[0].country?`${gd.results[0].name}, ${gd.results[0].country}`:gd.results[0].name;
    }
    // Calculate moonrise/moonset astronomically
    const moonRS2=calcMoonRiseSet(moonLat,moonLon,0);
    moonRiseS=moonRS2.rise;
    moonSetS=moonRS2.set;
    if(statusEl) statusEl.textContent=moonCityDisplay;
    if(infoEl){
      infoEl.style.display='block';
      const pl=document.getElementById('moon-phase-line');
      const rl=document.getElementById('moon-rise-line');
      const mi2=getMoonIllumination(new Date());
      const ph=mi2.phase, illum=Math.round(mi2.fraction*100);
      const pName=ph<0.03?'New':ph<0.22?'Waxing Crescent':ph<0.28?'First Quarter':ph<0.47?'Waxing Gibbous':ph<0.53?'Full':ph<0.72?'Waning Gibbous':ph<0.78?'Last Quarter':ph<0.97?'Waning Crescent':'New';
      if(pl) pl.textContent=`${pName} — ${illum}% illuminated`;
      if(rl){
        const fmtS=s=>{if(s<0)return'—';const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return `${h}:${String(m).padStart(2,'0')}`;};
        rl.textContent=`🌙 Rises ${fmtS(moonRiseS)}   Sets ${fmtS(moonSetS)}`;
      }
    }
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+e.message;
  }
  moonFetching=false;
}
document.getElementById('moon-fetch-btn')?.addEventListener('click',moonFetchData);
document.getElementById('moon-city')?.addEventListener('keydown',e=>{if(e.key==='Enter')moonFetchData();});

let moonCraters=null, moonMaria=null;
function moonInit(){
  if(moonCraters&&moonCraters.size===SIZE) return;
  const S=SIZE;
  // Deterministic craters: x,y in -1..1 disc coords, r=radius, depth
  const rng=(s)=>((s*2654435761)>>>0)/4294967296;
  moonCraters=[];
  moonCraters.size=S;
  for(let i=0;i<45;i++){
    const cx=rng(i*317+7)*1.6-0.8;
    const cy=rng(i*523+13)*1.6-0.8;
    if(cx*cx+cy*cy>0.85) continue;
    const r=0.03+rng(i*719+31)*0.12;
    const depth=0.15+rng(i*911+47)*0.2;
    moonCraters.push({cx,cy,r,depth});
  }
  // Maria (dark lunar "seas") — large irregular darker regions
  moonMaria=[
    {cx:-0.15,cy:0.25,rx:0.35,ry:0.25,name:'imbrium'},
    {cx:0.2,cy:0.35,rx:0.2,ry:0.18,name:'serenitatis'},
    {cx:0.25,cy:0.15,rx:0.22,ry:0.2,name:'tranquillitatis'},
    {cx:0.15,cy:-0.05,rx:0.18,ry:0.25,name:'fecunditatis'},
    {cx:-0.3,cy:0.0,rx:0.15,ry:0.2,name:'procellarum'},
    {cx:-0.1,cy:-0.2,rx:0.2,ry:0.15,name:'nubium'},
    {cx:0.0,cy:0.45,rx:0.12,ry:0.1,name:'frigoris'},
    {cx:0.35,cy:0.3,rx:0.1,ry:0.12,name:'crisium'},
  ];
}

function getMoonPhase(){
  return getMoonIllumination(new Date()).phase;
}


function drawSaturn(faces, S, tt){
  const textTop=7, topLimit=S-3;
  const cy=Math.round((textTop+topLimit)/2);
  const cx=S/2;
  const halfW=cx-2;
  const halfH=Math.min(cy-textTop, topLimit-cy);
  // Saturn ring tilt as seen from Earth for current date
  const now=new Date();
  const daysSinceJ2000=(now.getTime()-946728000000)/86400000;
  const satLonDeg=(50.077+0.03346*daysSinceJ2000)%360;
  const ringIncl=26.73*Math.PI/180, ringNode=169.5;
  const B=Math.asin(Math.sin(ringIncl)*Math.sin((satLonDeg-ringNode)*Math.PI/180));
  const tiltY=Math.max(0.06,Math.abs(Math.sin(B)));
  const ringFromNorth=B>0;
  // Screen-plane axial tilt 26.7° — rings and bands both use this
  const stilt=26.7*Math.PI/180;
  const sct=Math.cos(stilt), sst=Math.sin(stilt);
  const satRot=(daysSinceJ2000/0.44401)*Math.PI*2;
  const satCosR=Math.cos(satRot), satSinR=Math.sin(satRot);
  const rng=(s)=>((s*2654435761)>>>0)/4294967296;
  const ringMult=1.95;
  const horizExtent=ringMult*Math.abs(sct)+ringMult*tiltY*Math.abs(sst);
  const vertExtent=ringMult*Math.abs(sst)+ringMult*tiltY*Math.abs(sct);
  const pRad=Math.max(4,Math.round(Math.min(halfW/horizExtent, halfH/Math.max(1,vertExtent))));
  const ringInner=pRad*1.25, ringOuter=pRad*ringMult;

  for(const face of faces){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const px=u-cx, py=v-cy;
      const dx=px/pRad, dy=py/pRad;
      const d2=dx*dx+dy*dy;

      // Rotate pixel coords by axial tilt for ring ellipse test
      const rpx=px*sct+py*sst, rpy=-px*sst+py*sct;
      const ringDx=rpx, ringDy=rpy/tiltY;
      const ringDist=Math.sqrt(ringDx*ringDx+ringDy*ringDy);
      const onRing=ringDist>=ringInner && ringDist<=ringOuter;
      const ringBehind=ringFromNorth?(rpy>0):(rpy<0);

      let pr=-1,pg=-1,pb=-1;

      // 1. Back ring (behind planet, only outside planet body)
      if(onRing && ringBehind && d2>1){
        const ringFrac=(ringDist-ringInner)/(ringOuter-ringInner);
        const gap1=Math.abs(ringFrac-0.22)<0.03;
        const gap2=Math.abs(ringFrac-0.60)<0.02;
        const gap3=Math.abs(ringFrac-0.85)<0.015;
        if(!(gap1||gap2||gap3)){
          const bri=0.45+0.3*(1-ringFrac);
          const noise=((rng(u*7919+v*6271)*2-1)*0.04);
          let rr=0.76+noise, rg=0.68+noise, rb=0.55+noise;
          if(ringFrac<0.3){ rr*=0.85; rg*=0.75; rb*=0.65; }
          else if(ringFrac>0.7){ rr*=0.7; rg*=0.65; rb*=0.55; }
          const shadowFade=Math.min(1, Math.abs(ringDist-pRad*1.05)/(pRad*0.2));
          pr=rr*bri*shadowFade; pg=rg*bri*shadowFade; pb=rb*bri*shadowFade;
        } else {
          pr=0.01; pg=0.01; pb=0.015;
        }
      }

      // 2. Planet body
      if(d2<=1){
        const nz=Math.sqrt(1-d2);
        const limb=0.7+0.3*nz;
        // Bands tilted same direction as rings and axis
        const stdx=dx*sct+dy*sst, stdy=-dx*sst+dy*sct;
        const srdx=stdx*satCosR-nz*satSinR;
        const band=stdy;
        pr=0.82; pg=0.72; pb=0.52;
        const b1=Math.sin(band*12)*0.08;
        const b2=Math.sin(band*25+1.5)*0.04;
        const b3=Math.sin(band*50+3)*0.02;
        pr+=b1+b2+b3;
        pg+=b1*0.8+b2*0.7+b3;
        pb+=b1*0.3+b2*0.2+b3*0.5;
        const storm1=Math.exp(-Math.pow((band-0.15)*8,2))*0.12;
        const storm2=Math.exp(-Math.pow((band+0.3)*10,2))*0.08;
        pr+=storm1+storm2; pg+=storm1*0.6+storm2*0.5; pb-=storm1*0.1;
        const polar=Math.exp(-Math.pow(band*1.8,4))*0.15;
        pr-=polar*0.3; pg-=polar*0.2; pb+=polar*0.1;
        const noise=((rng(u*3571+v*2411)*2-1)*0.025);
        pr+=noise; pg+=noise; pb+=noise;
        const illum=0.6+0.4*(dx*0.5+nz*0.7);
        pr*=limb*illum; pg*=limb*illum; pb*=limb*illum;
        const shadowOff=ringFromNorth?-tiltY*0.4:tiltY*0.4;
        const shadowBand=Math.exp(-Math.pow((stdy+shadowOff)*6,2))*0.25;
        if(stdx<0.3){ pr-=shadowBand; pg-=shadowBand; pb-=shadowBand; }
      }

      // 3. Front ring (draws OVER planet body)
      if(onRing && !ringBehind){
        const ringFrac=(ringDist-ringInner)/(ringOuter-ringInner);
        const gap1=Math.abs(ringFrac-0.22)<0.03;
        const gap2=Math.abs(ringFrac-0.60)<0.02;
        const gap3=Math.abs(ringFrac-0.85)<0.015;
        if(!(gap1||gap2||gap3)){
          const bri=0.5+0.3*(1-ringFrac);
          const noise=((rng(u*7919+v*6271)*2-1)*0.04);
          let rr=0.78+noise, rg=0.70+noise, rb=0.56+noise;
          if(ringFrac<0.3){ rr*=0.85; rg*=0.75; rb*=0.65; }
          else if(ringFrac>0.7){ rr*=0.7; rg*=0.65; rb*=0.55; }
          pr=rr*bri; pg=rg*bri; pb=rb*bri;
        }
      }

      if(pr>=0){
        colBuf[idx*3]=Math.max(0,Math.min(1,pr));
        colBuf[idx*3+1]=Math.max(0,Math.min(1,pg));
        colBuf[idx*3+2]=Math.max(0,Math.min(1,pb));
      }
    }
  }

  // Axis lines for Saturn
  const axDx=-Math.sin(stilt), axDy=Math.cos(stilt);
  const axLen=pRad*0.35;
  for(const face of faces){
    for(let pole=-1;pole<=1;pole+=2){
      const startX=cx+pole*axDx*(pRad+1);
      const startY=cy+pole*axDy*(pRad+1);
      const endX=cx+pole*axDx*(pRad+axLen);
      const endY=cy+pole*axDy*(pRad+axLen);
      const steps=Math.ceil(axLen*1.5);
      for(let s=0;s<=steps;s++){
        const frac=s/steps;
        const u=Math.round(startX+(endX-startX)*frac);
        const v=Math.round(startY+(endY-startY)*frac);
        if(u<0||u>=S||v<0||v>=S) continue;
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        const textDim=v<=6?0.2:1.0;
        const fade=0.7*(1-frac*0.3)*textDim;
        colBuf[idx*3]=Math.max(colBuf[idx*3],fade);
        colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],fade);
        colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],fade*1.2);
      }
    }
  }
}

// ─── Earth bitmap + real-time data ───
const _EARTH_MAP_B64='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH///4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/////////8A//n/////4AAAAAAAAAAAAH////////////////////AB///+f/////////8A//7/////gAAAAAAAAAAAAf////////////////////AD///+//////////8A//9////+AAAAB////wAAAf////////////////////AD//////////////8A//8////8AAAAA/////////////////////////////AB//////////////8A//8////4AAAAAH////////////////////////////AA//////////////8A//4////AAAAAAH//+/////////////////////////AA//////////////8A//g///wAAAAAAP//w/////////////////////////AA//////////////8A//A//+AA/8AAAf//g/////////////////////////AA//////////////8A/+Af/4AA/8AAA///g/////////////////////////AA/////////////gEA/8AP/gAAf8AAB/+Bw/////////////////////////AA////////////8AAA/4AH/AAAAAAAB/8A+/////////////////////////AAf///////////4AAA/wAD+AAAAAAAB/4Af/////////////////////////AAP///////////wAAA/wAB+AAAAAAAB/4Af/////////////////////////AAH///////////gAAA/4AAAAAAAAAAB/4Af////////////////////////wAAH//+D///////gAAA/+AAAAAAAAB8B/4Af///////////////////////gAAAH//wAP//////gAAA//gAAAAAAAD+B/8A7//////////////////////wAAAAH/gAAB//////gAAA//4AAAAAAAD+B/+Bj//////////////////////4AAAAf8AAAA//////wAAA//8AAAAAAAB/B///D//////////////////////wAAAAAAAAAAf/////4AAA//8AAAAAAAA/j//+D//////////////////////gAAAAAAAAAAP/////8AAA//8AAAAAAAD/j//8D/////////////////////8AAAAAAAAAAAH//////gEA//+AAAAAAAD/n//4D/////////////////////gAAAAAAAAAAAD///////8A///AAAAAAAA////gD///////////////////PwAAAAAAAAAAAAB///////8A///gAAAAAAA///+AD//////////////////7wAAAAAAAAAAAAAA///////8A///AAAAAAAAf//8AD//////////////////gAAAAAAAAAAAAAAAf//////8A//+AAAAAAAAf//4AD/////////////////8AAAAAAAAAAAAAAAAf/////A8A//4AAAAAAAAP//8AAAAA/////wD/////gAAAAAAAAAAAAAAAAAAP//////8A//AAAAAAAAAH//+AAAAAz////gB/////8AAAAAAAAAAAAAAAAAAP/////zMA/wAAAAAAAAAD///AAAAAh///+AH//////AAPgAAAAAAAAAAAAAAP/////zMA/AAAAAAAAAAD//+AAAAAA///8D///////4APgAAAAAAAAAAAAAAP/////z8A8AAAAAAAAAAP//8AAAAAA///wP///////8APAAAAAAAAAAAAAAAP/////z8A4AAAAAAAAABAAAGAAAAAA///gP///////+AeAAAAAAAAAAAAAAAP//////8AgAAAAAAAAAHAAAAP/gHwA//+Af///////+AcAAAAAAAAAAAAAAAH//////8AAAAAAAAAAAPAAAAAA//wA//4D////////8AYAAAAAAAAAAAAAAAD//////8AAAAAAAAAAAPAAAAAA///A//gH////////8A4AAAAAAAAAAAAAAAD//////8AAAAAAAAAAAPAAAAAA///h/8AH///////58BwAAAAAAAAAAAAAAAD//////8AAAAAAAAAAAPAAAAAAA+/z/AAD///////w8HgAAAAAAAAAAAAAAAB//////8AAAAAAAAAAAPAB/4AAAw///gAB///////g8PAAAAAAAAAAAAAAAAA//////8AAAAAAAAAAAA//8AAAAA///wAA///////g8eAAAAAAAAAAAAAAAAAf/////8AAAAAAAAAAAB///gAAAAf//wAAf//////w48AAAAAAAAAAAAAAAAAP/////8AAAAAAAAAAAD////AAAAP//wD/n//////wBwAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAAH////+AAAP//wH/w//////wDgAAAAAAAAAAAAAAAAAH/////8AAAAAAAAAAA//////4A////wH/4P/////wDAAAAAAAAAAAAAAAAAAD/////8AAAAAAAAAAH///////B////gP/8H/////wAAAAAAAAAAAAAAAAAAAA/////8AAAAAAAAAAf///////x////AP//D/////wAAAAAAAAAAAAAAAAAAAAf//4H8AAAAAAAAAAf///////7//h+AP//5/////gAAAAAAAAAAAAAAAAAAAAP//AA8AAAAAAAAAAf////////n/A8AP//+f////AAAAAAAAAAAAAAAAAAAAAH/+AAcAAAAAAAAAAf///////9n/A4AH///H///+AAAAAAAAAAAAAAAAAAAAAD/8AAMAAAAAAAAAAf///////+D/hwAD///P///4wAAAAAAAAAAAAAAAAAAAAB/8AAIAAAAAAAAAAf////////D//wAB///P///wwAAAAAAAAAAAAAAAAAAAAA/8AAAAAAAAAAAAAf////////D//wAA///P///AwAAAAAAAAAAAAAAAAAAAAAf8AAMAAAAAAAAAAf////////D//gAA//+P//+AgAAAAAAAAAAAAAAAAAAAAAH+AAcAAAAAAAAAAf///////+B//gAA//4P//8AAAAAAAAAAAAAAAAAAAAAAAA/AAEAAAAAAAAAAf///////+B//AAAf/wP//4AAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAAf////////B/8AAAf/gP//wAAAAAAAAAAAAAAAAAAAAAAAAD/4AAAAAAAAAAAf////////C/4AAAf/AH//gAAAAAAAAAAAAAAAAAAAAAAAAA/4AAAAAAAAAAAf////////D/wAAAf+AH//ABwAAAAAAAAAAAAAAAAAAAAAAAH4AAAAAAAAAAAf////////DfgAAAP8AD//ADwAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAf////////n+AAAAP8AB//AD4AAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAf////////n8AAAAH4AAf/AB8AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAf/////////4AAAAHwAAP/AB+AAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAf/////////wAAAADwAAP/AA/AAAAAAAAAAAAAAAAAAAAAAAABgA//AAAAAAAf///////+A4AAAADwAAP/AA/AAAAAAAAAAAAAAAAAAAAAAAAAwA//AAAAAAAP/////AAAA/gAAADwAAP+AAfAAAAAAAAAAAAAAAAAAAAAAAAAwA//AAAAAAAH///8AAAAAf4AAAD8AAP+AAPAAAAAAAAAAAAAAAAAAAAAAAAAAA//gAAAAAAD///8AAAAAPwAAAB8AAP8AAHAAAAAAAAAAAAAAAAAAAAAAAAAAA//wAAAAAAB///8AAAAAHwAAABcAAP4AADAAAAAAAAAAAAAAAAAAAAAAAAAAA//+AAAAAAAf//8AAAAAHgAAAAIAAHw/8DAAAAAAAAAAAAAAAAAAAAAAAAAAA///gAAAAAAH//8AAAAAHAAAAAAAAHw/8AAAAAAAAAAAAAAAAAAAAAAAAAAAA///wAAAAAAB//8AAAAAPAAAAAAABzg/8AAAAAAAAAAAAAAAAAAAAAAAAAAAA///4AAAAAAAH///AAAAeAAAAAAAB7w/8AAAAAAAAAAAAAAAAAAAAAAAAAAAA///8AAAAAAAAP////8A8AAAAAAAA/4f8AAAAAAAAAAAAAAAAAAAAAAAAAAAA///8AAAAAAAAA//////wAAAAAAAA/4f8+AAAAAAAAAAAAAAAAAAAAAAAAAAA///+AAAAAAAAAf/////gAAAAAAAAfAf5+AAAAAAAAAAAAAAAAAAAAAAAAAAA////AAAAAAAAAH/////AAAAAAAAAPwf5+D+AAAAAAAAAAAAAAAAAAAAAAAEA////4AAAAAAAAD/////AAAAAAAAAH4f48B/wAAAAAAAAAAAAAAAAAAAAAAEA////+AAAAAAAAD/////AAAAAAAAAD4f48B/8AAAAAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAB////+AAAAAAAAAB8PwYA//AAAAAAAAAAAAAAAAAAAAAAAA/////+AAAAAAAA////+AAAAAAAAAA8AAYA//wAAAAAAAAAAAAAAAAAAAAAAA//////gAAAAAAA////+AAAAAAAAAAcAAwAf/4AAAAAAAAAAAAAAAAAAAAAAA//////gAAAAAAA////+AAAAAAAAAAH/gAAH/8AAAAAAAAAAAAAAAAAAAAAAA//////gAAAAAAA////+AAAAAAAAAAA/AAAB/8AAAAAAAAAAAAAAAAAAAAAAA//////gAAAAAAA////8AAAAAAAAAAAHgAAAf+AAAAAAAAAAAAAAAAAAAAAAA//////AAAAAAAA////8AAAAAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAA//////AAAAAAAA////8AAAAAAAAAAAAAAB/4AAAAAAAAAAAAAAAAAAAAAAAA/////+AAAAAAAAf///4AAAAAAAAAAAAAAD/AAAAAAAAAAAAAAAAAAAAAAAAA/////+AAAAAAAAf///4AwAAAAAAAAAAAAH/AAAAAAAAAAAAAAAAAAAAAAAAA/////8AAAAAAAAP///4BwAAAAAAAAAAAAf/8AAAAAAAAAAAAAAAAAAAAAAAA/////4AAAAAAAAH///wDwAAAAAAAAAAAB///gAAAAAAAAAAAAAAAAAAAAAAA/////4AAAAAAAAH///wHwAAAAAAAAAAAD///wAAAAAAAAAAAAAAAAAAAAAAA/////4AAAAAAAAD///gPwAAAAAAAAAAAH///4AAAAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAB///gPwAAAAAAAAAAAP///8AAAAAAAAAAAAAAAAAAAAAAA/////wAAAAAAAAA///gPwAAAAAAAAAAA////8AAAAAAAAAAAAAAAAAAAAAAAf////wAAAAAAAAAf//AfgAAAAAAAAAAP////+AAAAAAAAAAAAAAAAAAAAAAAP////wAAAAAAAAAP//AfgAAAAAAAAAA/////+AAAAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAAH//AfAAAAAAAAAAA//////AAAAAAAAAAAAAAAAAAAAAAAP////gAAAAAAAAAH//AfAAAAAAAAAAA//////gAAAAAAAAAAAAAAAAAAAAAAP////AAAAAAAAAAH/+AOAAAAAAAAAAB//////wAAAAAAAAAAAAAAAAAAAAAAP///+AAAAAAAAAAD/+AOAAAAAAAAAAB//////wAAAAAAAAAAAAAAAAAAAAAAP///4AAAAAAAAAAD/+AEAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAP///wAAAAAAAAAAB/8AAAAAAAAAAAAB//////4AAAAAAAAAAAAAAAAAAAAAAf///gAAAAAAAAAAB/8AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf///AAAAAAAAAAAA/8AAAAAAAAAAAAA//////4AAAAAAAAAAAAAAAAAAAAAAf//+AAAAAAAAAAAAf4AAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAAf//8AAAAAAAAAAAAf4AAAAAAAAAAAAAf/////4AAAAAAAAAAAAAAAAAAAAAAf//4AAAAAAAAAAAAfwAAAAAAAAAAAAAf/////wAAAAAAAAAAAAAAAAAAAAAAf//wAAAAAAAAAAAAPgAAAAAAAAAAAAAf/////wAAAAAAAAAAAAAAAAAAAAAAf//AAAAAAAAAAAAA/AAAAAAAAAAAAAAP/////gAAAAAAAAAAAAAAAAAAAAAAf/+AAAAAAAAAAAAP+AAAAAAAAAAAAAAAf////gAAD4AAAAAAAAAAAAAAAAAAf/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAAB8AAAAAAAAAAAAAAAAAA//4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/AAAA8AAAAAAAAAAAAAAAAAA//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+AAAA8AAAAAAAAAAAAAAAAAA//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAA8AAAAAAAAAAAAAAAAAA/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAf8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAA4AAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAQAAAAAAAAAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAA/AAAAAAAAAAAAAAAAAAAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAB+AAAAAAAAAAAAAAAAAAA/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////////////////////8A//////////////////////////////////////////';
const _EARTH_W=360,_EARTH_H=180;
let _earthMapBuf=null;
function _earthInitMap(){
  if(_earthMapBuf) return;
  const b=atob(_EARTH_MAP_B64);
  _earthMapBuf=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) _earthMapBuf[i]=b.charCodeAt(i);
}
function _earthIsLand(lonDeg,latDeg){
  _earthInitMap();
  const x=Math.floor(((lonDeg+180)%360+360)%360)%_EARTH_W;
  const y=Math.max(0,Math.min(_EARTH_H-1,Math.floor(89.5-latDeg+0.5)));
  const i=y*_EARTH_W+x;
  return (_earthMapBuf[i>>3]>>(7-(i&7)))&1;
}
const _cloudLats=[-75,-45,-15,15,45,75], _cloudLons=[-165,-135,-105,-75,-45,-15,15,45,75,105,135,165];
const _cloudCache={grid:null,ts:0};
function _earthFetchClouds(){
  if(Date.now()-_cloudCache.ts<1800000&&_cloudCache.grid) return;
  _cloudCache.ts=Date.now();
  const la=[],lo=[];
  for(const lat of _cloudLats) for(const lon of _cloudLons){la.push(lat);lo.push(lon);}
  fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la.join(',')}&longitude=${lo.join(',')}&current=cloud_cover&forecast_days=1`)
    .then(r=>r.json()).then(d=>{
      if(!Array.isArray(d)) return;
      const g=new Float32Array(72);
      for(let i=0;i<72;i++) g[i]=(d[i]?.current?.cloud_cover??50)/100;
      _cloudCache.grid=g;
    }).catch(()=>{});
}
function _earthCloudAt(lonD,latD){
  const g=_cloudCache.grid;
  if(!g) return -1;
  const la=_cloudLats,lo=_cloudLons;
  let yi=0; for(;yi<la.length-1;yi++) if(latD<la[yi+1]) break;
  let nl=((lonD+180)%360+360)%360-180;
  let xi=0; for(;xi<lo.length-1;xi++) if(nl<lo[xi+1]) break;
  const yi2=Math.min(yi+1,la.length-1), xi2=(xi+1)%lo.length;
  let lw=lo[xi2<xi?xi2+12:xi2]-lo[xi]; if(lw<=0)lw+=360;
  const fx=Math.max(0,Math.min(1,lw?((nl-lo[xi]+360)%360)/lw:0));
  const fy=Math.max(0,Math.min(1,la[yi2]!==la[yi]?(latD-la[yi])/(la[yi2]-la[yi]):0));
  return g[yi*12+xi]*(1-fx)*(1-fy)+g[yi*12+xi2]*fx*(1-fy)+g[yi2*12+xi]*(1-fx)*fy+g[yi2*12+xi2]*fx*fy;
}

function drawPlanet(body, faces, S, tt){
  // Use max available space: 2px margins on all sides, text occupies v=1-5 + 2px buffer
  const textTop=7;
  const topLimit=S-3;
  const cy=Math.round((textTop+topLimit)/2);
  const cx=S/2;
  const halfH=Math.min(cy-textTop, topLimit-cy);
  const halfW=cx-2;
  // Blackhole disc extends 1.5x; sun/planets fill the space, extras extend to edge
  const extent=body==='blackhole'?1.5:1.0;
  const pRad=Math.max(4,Math.round(Math.min(halfH,halfW)/extent));
  const rng=(s)=>((s*2654435761)>>>0)/4294967296;
  // Axial tilt (degrees) per planet
  const tilts={mercury:0.03,venus:177.4,earth:23.4,mars:25.2,jupiter:3.1,uranus:97.8,neptune:28.3,pluto:122.5,sun:7.25};
  const tiltRad=(tilts[body]||0)*Math.PI/180;
  const ct=Math.cos(tiltRad), st=Math.sin(tiltRad);
  // Real sidereal rotation periods (Earth days); negative = retrograde
  const rotPeriods={mercury:58.646,venus:-243.025,earth:0.99727,mars:1.02596,
    jupiter:0.41354,saturn:0.44401,uranus:-0.71833,neptune:0.67125,pluto:-6.38718,sun:25.38};
  const now=new Date();
  const daysSinceJ2000=(now.getTime()-946728000000)/86400000;
  const period=rotPeriods[body]||1;
  const rot=(daysSinceJ2000/period)*Math.PI*2;
  const cosR=Math.cos(rot), sinR=Math.sin(rot);

  if(body==='earth'){
    _earthFetchClouds();
  }

  for(const face of faces){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const px=u-cx, py=v-cy;
      const dx=px/pRad, dy=py/pRad;
      const d2=dx*dx+dy*dy;
      if(d2>1) continue;
      const nz=Math.sqrt(1-d2);
      const limb=0.7+0.3*nz;
      const illum=0.6+0.4*(dx*0.5+nz*0.7);
      // Tilt in screen plane so bands visually match axis line angle, then rotate
      const tdx=dx*ct+dy*st, tdy=-dx*st+dy*ct;
      const rdx=tdx*cosR-nz*sinR;
      const rnz=tdx*sinR+nz*cosR;
      const noise=(rng(u*7919+v*6271)*2-1)*0.03;
      let pr,pg,pb;

      if(body==='sun'||body==='blackhole') continue;

      if(body==='mercury'){
        pr=0.55+noise; pg=0.53+noise; pb=0.50+noise;
        for(let ci=0;ci<20;ci++){
          const ccx=(rng(ci*1237)*2-1)*0.7, ccy=(rng(ci*3571)*2-1)*0.7;
          const cr=0.04+rng(ci*4919)*0.08;
          const cdx=rdx-ccx, cdy=tdy-ccy;
          const cd=Math.sqrt(cdx*cdx+cdy*cdy);
          if(cd<cr) { const f=0.12*(1-cd/cr); pr-=f; pg-=f; pb-=f; }
          else if(cd<cr*1.3) { const f=0.06; pr+=f; pg+=f; pb+=f; }
        }
        pr+=Math.sin(rdx*8+tdy*6)*0.03;
        pg+=Math.sin(rdx*6-tdy*8)*0.02;
      } else if(body==='venus'){
        pr=0.90+noise*0.5; pg=0.85+noise*0.5; pb=0.70+noise*0.5;
        const cloud1=Math.sin(tdy*10+Math.sin(rdx*4)*2)*0.06;
        const cloud2=Math.sin(tdy*18+rdx*3)*0.03;
        const cloud3=Math.sin((rdx+tdy)*7)*0.04;
        pr+=cloud1+cloud2; pg+=cloud1+cloud2+cloud3; pb+=cloud1*0.5+cloud3;
        const limbGlow=(1-nz)*0.15;
        pr+=limbGlow*0.8; pg+=limbGlow*0.7; pb+=limbGlow*0.5;
      } else if(body==='earth'){
        const eLat=Math.asin(tdy), eLon=Math.atan2(rdx,rnz);
        const eLatD=eLat*180/Math.PI, eLonD=eLon*180/Math.PI;
        const eAbsLat=Math.abs(eLatD);
        const eLand=_earthIsLand(eLonD,eLatD);
        if(eLand){
          if(eAbsLat>72){ pr=0.82; pg=0.86; pb=0.90; }
          else if(eAbsLat>58){ pr=0.28; pg=0.38; pb=0.22; }
          else if(eAbsLat<28&&((eLonD>-18&&eLonD<42&&eLatD>15)||(eLonD>42&&eLonD<62&&eLatD>14&&eLatD<32)||(eLonD>118&&eLonD<152&&eLatD<-14&&eLatD>-32))){
            pr=0.72; pg=0.58; pb=0.32;
          } else if(eAbsLat<18){ pr=0.10; pg=0.36; pb=0.08; }
          else { pr=0.20; pg=0.42; pb=0.14; }
          pr+=noise*0.8; pg+=noise*0.8; pb+=noise*0.5;
          const elev=Math.sin(eLon*5+eLat*7)*0.5+Math.sin(eLon*11-eLat*9)*0.3;
          if(elev>0.3){const ef=(elev-0.3)*0.08; pr+=ef; pg+=ef*0.7; pb+=ef*0.5;}
        } else {
          pr=0.04; pg=0.08; pb=0.32;
          const wd=(Math.sin(eLon*7+eLat*5)*0.5+0.5)*0.06;
          pr+=wd*0.1; pg+=wd*0.3; pb+=wd;
        }
        let cc=_earthCloudAt(eLonD,eLatD);
        const cn1=Math.sin(rdx*9+tdy*7+tt*0.3)*0.5+0.5;
        const cn2=Math.sin(rdx*16-tdy*11+tt*0.15)*0.5+0.5;
        const cn3=Math.sin((rdx+tdy)*6-tt*0.2)*0.5+0.5;
        if(cc<0) cc=cn1*0.4+cn2*0.25+cn3*0.15;
        else cc=cc*0.6+(cn1*0.3+cn2*0.2)*0.4;
        if(cc>0.25){
          const cf=Math.min(0.85,(cc-0.25)*1.2);
          pr=pr*(1-cf)+0.92*cf; pg=pg*(1-cf)+0.94*cf; pb=pb*(1-cf)+0.97*cf;
        }
        const atm=(1-nz)*(1-nz)*0.3;
        pr+=atm*0.25; pg+=atm*0.45; pb+=atm*0.9;
      } else if(body==='mars'){
        pr=0.75+noise; pg=0.35+noise*0.7; pb=0.15+noise*0.4;
        const m1=Math.exp(-((rdx-0.1)*(rdx-0.1)+(tdy+0.1)*(tdy+0.1))*8)*0.15;
        const m2=Math.exp(-((rdx+0.3)*(rdx+0.3)+(tdy-0.2)*(tdy-0.2))*6)*0.12;
        const m3=Math.exp(-((rdx-0.4)*(rdx-0.4)+(tdy+0.3)*(tdy+0.3))*10)*0.10;
        pr-=m1+m2+m3; pg-=m1*0.5+m2*0.4+m3*0.3;
        if(tdy<-0.7){ const f=Math.min(1,(-0.7-tdy)*4); pr+=f*0.25; pg+=f*0.25; pb+=f*0.30; }
        if(tdy>0.75){ const f=Math.min(1,(tdy-0.75)*5); pr+=f*0.20; pg+=f*0.20; pb+=f*0.25; }
        const dust=Math.sin(rdx*6+tdy*4)*0.04;
        pr+=dust; pg+=dust*0.5;
      } else if(body==='jupiter'){
        pr=0.80+noise; pg=0.70+noise; pb=0.55+noise;
        const b1=Math.sin(tdy*14)*0.10;
        const b2=Math.sin(tdy*28+1.5)*0.06;
        const b3=Math.sin(tdy*55+3)*0.03;
        const b4=Math.sin(tdy*7)*0.08;
        pr+=b1+b2+b3+b4;
        pg+=b1*0.7+b2*0.6+b3+b4*0.8;
        pb+=b1*0.2+b2*0.1+b3*0.5+b4*0.3;
        const turb=Math.sin(rdx*15+Math.sin(tdy*20)*3)*0.03;
        pr+=turb; pg+=turb*0.8;
        const spotDx2=(rdx-0.3)/0.18, spotDy=(tdy-0.2)/0.12;
        const spotD=spotDx2*spotDx2+spotDy*spotDy;
        if(spotD<1){
          const sf=(1-spotD)*0.3;
          pr+=sf*0.4; pg-=sf*0.15; pb-=sf*0.2;
          const swirl=Math.sin(Math.atan2(spotDy,spotDx2)*3)*0.05;
          pr+=swirl; pg+=swirl*0.3;
        }
        const polar=Math.exp(-Math.pow(tdy*1.8,4))*0.12;
        pr-=polar*0.2; pg-=polar*0.15; pb+=polar*0.05;
      } else if(body==='uranus'){
        pr=0.60+noise*0.5; pg=0.82+noise*0.5; pb=0.85+noise*0.5;
        const ub=Math.sin(tdy*12)*0.03;
        pr+=ub*0.5; pg+=ub; pb+=ub;
        const atm=Math.sin(rdx*5+tdy*3)*0.02;
        pg+=atm; pb+=atm;
      } else if(body==='neptune'){
        pr=0.20+noise*0.5; pg=0.35+noise*0.5; pb=0.80+noise*0.5;
        const nb1=Math.sin(tdy*12)*0.05;
        const nb2=Math.sin(tdy*24+2)*0.03;
        pr+=nb1*0.3; pg+=nb1*0.5+nb2*0.4; pb+=nb1+nb2;
        const dsDx=(rdx-0.2)/0.15, dsDy=(tdy+0.15)/0.10;
        const dsD=dsDx*dsDx+dsDy*dsDy;
        if(dsD<1){
          const sf=(1-dsD)*0.15;
          pr-=sf*0.5; pg-=sf*0.3; pb-=sf*0.1;
        }
        const atm=Math.sin(rdx*8)*0.03;
        pg+=atm*0.5; pb+=atm;
      } else if(body==='pluto'){
        // Base: warm tan-pink like New Horizons imagery
        pr=0.68+noise; pg=0.58+noise; pb=0.48+noise;

        // Tombaugh Regio (the heart) — two lobes
        // Left lobe: Sputnik Planitia — smooth bright nitrogen ice
        const spX=rdx+0.18, spY=tdy+0.05;
        const spD=Math.sqrt(spX*spX*1.3+spY*spY*1.6);
        const spR=0.28;
        if(spD<spR){
          const f=Math.pow(1-spD/spR,0.6);
          // Bright cream-white ice with subtle polygon texture
          const poly=Math.sin(spX*40)*Math.sin(spY*35)*0.015;
          pr=pr*(1-f)+(0.88+poly)*f;
          pg=pg*(1-f)+(0.85+poly)*f;
          pb=pb*(1-f)+(0.78+poly)*f;
        }
        // Right lobe — rougher, slightly less bright
        const rlX=rdx-0.12, rlY=tdy+0.02;
        const rlD=Math.sqrt(rlX*rlX*1.8+rlY*rlY*1.4);
        const rlR=0.22;
        if(rlD<rlR){
          const f=Math.pow(1-rlD/rlR,0.5)*0.75;
          const rough=(rng(Math.floor(rdx*30)*997+Math.floor(tdy*30)*631)*2-1)*0.04;
          pr=pr*(1-f)+(0.82+rough)*f;
          pg=pg*(1-f)+(0.78+rough)*f;
          pb=pb*(1-f)+(0.70+rough)*f;
        }

        // Cthulhu Macula — large dark reddish-brown region (west/left of heart)
        const cmX=rdx+0.55, cmY=tdy+0.05;
        const cmD=Math.sqrt(cmX*cmX*0.6+cmY*cmY*2.5);
        if(cmD<0.4){
          const f=Math.pow(1-cmD/0.4,0.8)*0.55;
          pr=pr*(1-f)+0.30*f;
          pg=pg*(1-f)+0.18*f;
          pb=pb*(1-f)+0.12*f;
        }

        // Dark equatorial band (tholins) — wraps around except through the heart
        const eqBand=Math.exp(-tdy*tdy*12)*0.18;
        const heartMask=Math.max(0,1-Math.max(0,1-spD/spR)*2-Math.max(0,1-rlD/rlR)*2);
        const eqF=eqBand*heartMask;
        pr-=eqF*0.6; pg-=eqF*0.8; pb-=eqF*0.9;

        // Lighter polar regions — nitrogen frost
        if(Math.abs(tdy)>0.55){
          const pf=Math.min(1,(Math.abs(tdy)-0.55)*3)*0.2;
          pr+=pf*0.9; pg+=pf*0.85; pb+=pf*0.75;
        }

        // Subtle mottled surface texture
        const t1=Math.sin(rdx*14+tdy*11)*0.025;
        const t2=Math.sin(rdx*23-tdy*17)*0.015;
        pr+=t1+t2; pg+=(t1+t2)*0.7; pb+=(t1+t2)*0.4;

        // Small dark patches (craters/terrain variation)
        for(let ci=0;ci<10;ci++){
          const ccx2=(rng(ci*8731)*2-1)*0.7, ccy2=(rng(ci*4217)*2-1)*0.7;
          const cr2=0.03+rng(ci*2917)*0.05;
          const cd2=Math.sqrt((rdx-ccx2)*(rdx-ccx2)+(tdy-ccy2)*(tdy-ccy2));
          if(cd2<cr2){
            const cf=0.06*(1-cd2/cr2);
            pr-=cf; pg-=cf*0.8; pb-=cf*0.6;
          }
        }
      }

      pr*=limb*illum; pg*=limb*illum; pb*=limb*illum;
      colBuf[idx*3]=Math.max(0,Math.min(1,pr));
      colBuf[idx*3+1]=Math.max(0,Math.min(1,pg));
      colBuf[idx*3+2]=Math.max(0,Math.min(1,pb));
    }
  }

  // Axis line through north and south poles (skip sun, blackhole, solarsystem)
  if(body!=='sun'&&body!=='blackhole'&&body!=='solarsystem'){
    const axDx=-Math.sin(tiltRad), axDy=Math.cos(tiltRad);
    const axLen=pRad*0.35;
    for(const face of faces){
      for(let pole=-1;pole<=1;pole+=2){
        const startX=cx+pole*axDx*(pRad+1);
        const startY=cy+pole*axDy*(pRad+1);
        const endX=cx+pole*axDx*(pRad+axLen);
        const endY=cy+pole*axDy*(pRad+axLen);
        const steps=Math.ceil(axLen*1.5);
        for(let s=0;s<=steps;s++){
          const frac=s/steps;
          const u=Math.round(startX+(endX-startX)*frac);
          const v=Math.round(startY+(endY-startY)*frac);
          if(u<0||u>=S||v<0||v>=S) continue;
          const idx=faceMap[face][v*S+u]; if(idx<0) continue;
          const textDim=v<=6?0.2:1.0;
          const fade=0.7*(1-frac*0.3)*textDim;
          colBuf[idx*3]=Math.max(colBuf[idx*3],fade);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],fade);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],fade*1.2);
        }
      }
    }
  }

  // Sun: rendered separately with glow (no limb darkening/illum)
  // Rotates at real sidereal rate (~25.38 days)
  if(body==='sun'){
    const sunTilt=7.25*Math.PI/180;
    const sunCt=Math.cos(sunTilt), sunSt=Math.sin(sunTilt);
    for(const face of faces){
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        const dx2=(u-cx)/pRad, dy2=(v-cy)/pRad;
        const d2=dx2*dx2+dy2*dy2;
        const d=Math.sqrt(d2);
        if(d>1.8) continue;
        if(d<=1){
          const nz=Math.sqrt(1-d2);
          const limbDark=0.85+0.15*nz;
          // Tilted and rotated surface coords
          const stx=dx2*sunCt-dy2*sunSt;
          const sty=dx2*sunSt+dy2*sunCt;
          const srx=stx*cosR-nz*sinR;
          let sr=1.0, sg=0.85, sb=0.25;
          // Granulation using rotated coords
          const g1=Math.sin(srx*25+sty*18)*0.04;
          const g2=Math.sin(srx*40-sty*30)*0.02;
          sr+=g1+g2; sg+=g1*0.8+g2; sb+=g1*0.3;
          // Sunspots — fixed surface positions, rotate with Sun
          for(let si=0;si<5;si++){
            const sx=(rng(si*7129)*2-1)*0.5, sy=(rng(si*6131)*2-1)*0.35;
            const sd=((srx-sx)*(srx-sx)+(sty-sy)*(sty-sy));
            const srad=0.015+rng(si*3917)*0.025;
            if(sd<srad){ const sf=1-sd/srad; sr-=sf*0.5; sg-=sf*0.4; sb-=sf*0.15; }
            if(sd<srad*2.5){ const pf=Math.pow(1-sd/(srad*2.5),2)*0.08; sr-=pf*0.3; sg-=pf*0.2; }
          }
          // Prominences/active regions
          const prom=Math.sin(Math.atan2(sty,srx)*5)*0.5+0.5;
          if(d>0.85 && prom>0.7){ sr+=0.1; sg+=0.02; }
          sr*=limbDark; sg*=limbDark; sb*=limbDark;
          colBuf[idx*3]=Math.max(0,Math.min(1,sr));
          colBuf[idx*3+1]=Math.max(0,Math.min(1,sg));
          colBuf[idx*3+2]=Math.max(0,Math.min(1,sb));
        } else {
          // Corona glow
          const glow=Math.pow(1-(d-1)/0.8,2)*0.4;
          const flicker=1+Math.sin(Math.atan2(dy2,dx2)*8+tt)*0.15;
          colBuf[idx*3]+=glow*1.0*flicker;
          colBuf[idx*3+1]+=glow*0.7*flicker;
          colBuf[idx*3+2]+=glow*0.15*flicker;
        }
      }
    }
  }

  // Black Hole: dark center, accretion disc, gravitational lensing
  if(body==='blackhole'){
    const bhRad=Math.round(S*0.15);
    const discInner=bhRad*1.8, discOuter=bhRad*4;
    for(const face of faces){
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const idx=faceMap[face][v*S+u]; if(idx<0) continue;
        const px=u-cx, py=v-cy;
        const dist=Math.sqrt(px*px+py*py);
        // Accretion disc (tilted ellipse)
        const discDy=py/0.3;
        const discDist=Math.sqrt(px*px+discDy*discDy);
        if(discDist>=discInner && discDist<=discOuter && dist>bhRad*1.3){
          const df=(discDist-discInner)/(discOuter-discInner);
          const bri=(1-df)*0.7;
          const ang=Math.atan2(py,px)+tt*0.5;
          const spiral=Math.sin(ang*3+df*10)*0.3+0.7;
          const hot=1-df;
          colBuf[idx*3]+=bri*spiral*(0.9+hot*0.1);
          colBuf[idx*3+1]+=bri*spiral*(0.4+hot*0.2);
          colBuf[idx*3+2]+=bri*spiral*(0.1+hot*0.5);
        }
        // Photon ring (bright thin ring at event horizon edge)
        if(Math.abs(dist-bhRad*1.4)<bhRad*0.15){
          const rf=1-Math.abs(dist-bhRad*1.4)/(bhRad*0.15);
          const pulse=0.8+Math.sin(tt*3)*0.2;
          colBuf[idx*3]+=rf*0.6*pulse; colBuf[idx*3+1]+=rf*0.45*pulse; colBuf[idx*3+2]+=rf*0.2*pulse;
        }
        // Event horizon (pure black)
        if(dist<bhRad*1.2){
          colBuf[idx*3]=0; colBuf[idx*3+1]=0; colBuf[idx*3+2]=0;
        }
        // Gravitational lensing — distorted star ring
        if(dist>bhRad*1.2 && dist<bhRad*1.6){
          const lf=Math.pow(1-Math.abs(dist-bhRad*1.4)/(bhRad*0.2),3)*0.15;
          const la=Math.sin(Math.atan2(py,px)*12+tt)*0.5+0.5;
          colBuf[idx*3]+=lf*la; colBuf[idx*3+1]+=lf*la; colBuf[idx*3+2]+=lf*la*1.2;
        }
      }
    }
  }
}

let _solarLastT=0, _solarExtraDays=0;
function drawSolarSystem(faces, S, tt){
  const cx=S/2, cy=S/2;
  const rng=(s)=>((s*2654435761)>>>0)/4294967296;
  const planets=[
    {name:'Mercury', T:87.97,  L0:252.25, color:[0.55,0.53,0.50], rad:1.2},
    {name:'Venus',   T:224.70, L0:181.98, color:[0.90,0.85,0.70], rad:1.5},
    {name:'Earth',   T:365.25, L0:100.46, color:[0.2,0.5,0.9],    rad:1.5},
    {name:'Mars',    T:686.97, L0:355.45, color:[0.80,0.40,0.15], rad:1.3},
    {name:'Jupiter', T:4332.6, L0:34.40,  color:[0.80,0.70,0.55], rad:2.5},
    {name:'Saturn',  T:10759,  L0:49.95,  color:[0.82,0.72,0.52], rad:2.2},
    {name:'Uranus',  T:30687,  L0:313.23, color:[0.60,0.82,0.85], rad:1.8},
    {name:'Neptune', T:60190,  L0:304.88, color:[0.25,0.40,0.80], rad:1.8},
  ];
  const sunRad=Math.round(S*0.04);
  const innerGap=sunRad+3;
  const outerEdge=S*0.47;
  const spacing=(outerEdge-innerGap)/(planets.length);
  const now=new Date();
  const daysSinceJ2000=(now.getTime()-946728000000)/86400000;
  // Speed multiplier from slider (logarithmic: 0=1x, 5=100000x)
  const speedEl=document.getElementById('solar-speed');
  const speedMult=speedEl?Math.pow(10,parseFloat(speedEl.value)):1;
  const realDt=_solarLastT?tt-_solarLastT:0;
  _solarLastT=tt;
  _solarExtraDays+=realDt*(speedMult-1)/86400;
  const simDays=daysSinceJ2000+_solarExtraDays;

  for(let pi=0;pi<planets.length;pi++){
    const p=planets[pi];
    p.orbitR=innerGap+spacing*(pi+0.5);
    const angle=(p.L0+360*simDays/p.T)*Math.PI/180;
    p.px=cx+Math.cos(angle)*p.orbitR;
    p.py=cy-Math.sin(angle)*p.orbitR;
  }

  for(const face of faces){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const dx=u-cx, dy=v-cy;
      const d=Math.sqrt(dx*dx+dy*dy);

      // Sun glow
      if(d<sunRad*3){
        const glow=Math.pow(Math.max(0,1-d/(sunRad*3)),2)*0.15;
        colBuf[idx*3]+=glow*1.0; colBuf[idx*3+1]+=glow*0.7; colBuf[idx*3+2]+=glow*0.2;
      }
      // Sun body
      if(d<=sunRad){
        const nz2=1-(d/sunRad)*(d/sunRad);
        const nz=Math.sqrt(nz2);
        const l=0.85+0.15*nz;
        const n=(rng(u*4919+v*3571)*2-1)*0.05;
        colBuf[idx*3]=Math.min(1,(1.0+n)*l);
        colBuf[idx*3+1]=Math.min(1,(0.85+n)*l);
        colBuf[idx*3+2]=Math.min(1,(0.25+n)*l);
        continue;
      }

      // Orbit rings and planets
      for(const p of planets){
        // Orbit ring circle
        const ringDiff=Math.abs(d-p.orbitR);
        if(ringDiff<0.7){
          const f=0.10*(1-ringDiff/0.7);
          colBuf[idx*3]+=f*0.3; colBuf[idx*3+1]+=f*0.35; colBuf[idx*3+2]+=f*0.5;
        }
        // Planet dot
        const pdx=u-p.px, pdy=v-p.py;
        const pd=Math.sqrt(pdx*pdx+pdy*pdy);
        if(pd<=p.rad){
          const pf=pd<=p.rad*0.5?1.0:1.0-(pd-p.rad*0.5)/(p.rad*0.5);
          colBuf[idx*3]=Math.max(colBuf[idx*3],p.color[0]*pf);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],p.color[1]*pf);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],p.color[2]*pf);
        }
      }
    }
  }
}

function effectMoon(dt){
  t+=dt;
  moonInit();
  const S=SIZE, S1=S-1;
  const phase=getMoonPhase(); // 0-1
  const tt=Date.now()*0.001;

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Background: deep space with stars
  for(let i=0;i<N;i++){
    const starSeed=((i*2654435761)>>>0)/4294967296;
    if(starSeed<0.012){
      const twinkle=0.3+0.7*Math.abs(Math.sin(tt*1.5+starSeed*50));
      const br=starSeed*40*twinkle;
      colBuf[i*3]=br; colBuf[i*3+1]=br; colBuf[i*3+2]=br*1.1;
    }
  }

  const faces=panel2dMode?[0]:[0,1,2,3];

  const bodyEl = document.querySelector('input[name="celestial-body"]:checked');
  const body = bodyEl ? bodyEl.value : 'moon';
  if(body==='saturn'){
    drawSaturn(faces, S, tt);
  } else if(body==='solarsystem'){
    drawSolarSystem(faces, S, tt);
  } else if(body!=='moon'){
    drawPlanet(body, faces, S, tt);
  }

  const mi0=getMoonIllumination(new Date());

  if(body==='moon'){

  const moonRad=Math.round(S*0.42)-1;
  const cx=Math.round(S/2), cy=Math.round(S/2)+4;

  // Single illumination call used for both rendering and text
  const frac=mi0.fraction; // 0=new, 1=full
  const waxing=phase<0.5;
  const termPos=frac*2-1; // -1=new, 0=quarter, +1=full

  // Terminator tilt based on latitude and time of night
  const lat=typeof moonLat==='number'?moonLat:52;
  const hourNow=(Date.now()%86400000)/3600000;
  const tiltBase=lat*Math.PI/180*0.4;
  const tiltShift=Math.sin((hourNow/24)*Math.PI*2)*0.3;
  const tilt=tiltBase+tiltShift;
  const cosT=Math.cos(tilt), sinT=Math.sin(tilt);

  for(const face of faces){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const dx=(u-cx)/moonRad, dy=(v-cy)/moonRad;
      const d2=dx*dx+dy*dy;
      if(d2>1) continue;
      const d=Math.sqrt(d2);

      const idx=faceMap[face][v*S+u]; if(idx<0) continue;

      const nz=Math.sqrt(1-d2);
      const ny=dy;
      // Rotate disc coords for tilted terminator
      const nx=dx*cosT-dy*sinT;
      const nyRot=dx*sinT+dy*cosT;

      // Terminator ellipse in rotated frame
      const rowR=Math.sqrt(Math.max(0,1-nyRot*nyRot));
      const termAt=termPos*rowR;
      let lit;
      if(waxing){
        lit=nx>-termAt;
      } else {
        lit=nx<termAt;
      }

      if(!lit){
        // Dark side — subtle grey so the full circle is visible
        const es=0.06+0.03*nz;
        colBuf[idx*3]=es*0.85;
        colBuf[idx*3+1]=es*0.85;
        colBuf[idx*3+2]=es*0.9;
        continue;
      }

      // Base highland colour: warm grey
      let lr=0.72, lg=0.70, lb=0.65;

      // Maria: darker blueish-grey regions
      for(const m of moonMaria){
        const mdx=(dx-m.cx)/m.rx, mdy=(dy-m.cy)/m.ry;
        const md=mdx*mdx+mdy*mdy;
        if(md<1){
          const mf=Math.pow(1-md,0.8)*0.35;
          lr-=mf*0.15; lg-=mf*0.12; lb-=mf*0.05;
        }
      }

      // Craters: darker interior, bright rim
      for(const c of moonCraters){
        const cdx=dx-c.cx, cdy=dy-c.cy;
        const cd=Math.sqrt(cdx*cdx+cdy*cdy);
        if(cd<c.r*1.3){
          if(cd<c.r*0.85){
            // Crater floor — darker
            const cf=c.depth*(1-cd/(c.r*0.85));
            lr-=cf; lg-=cf; lb-=cf;
          } else if(cd<c.r*1.15){
            // Crater rim — brighter on sunlit side
            const rimBr=0.12*(1+nx*0.5);
            lr+=rimBr; lg+=rimBr; lb+=rimBr;
          }
        }
      }

      // Surface texture — fine grain noise
      const noise=((((u*7919+v*6271)>>>0)%100)/100-0.5)*0.06;
      lr+=noise; lg+=noise; lb+=noise;

      // Limb darkening — edges of disc are slightly darker
      const limb=0.75+0.25*nz;
      lr*=limb; lg*=limb; lb*=limb;

      // Subtle warm/cool variation across surface
      lr+=ny*0.02;
      lb-=ny*0.015;

      colBuf[idx*3]=Math.max(0,Math.min(1,lr));
      colBuf[idx*3+1]=Math.max(0,Math.min(1,lg));
      colBuf[idx*3+2]=Math.max(0,Math.min(1,lb));
    }
  }

  } // end if(body==='moon')

  // ── Scrolling phase text at bottom of face 0 ──
  // Uses same 3x5 bitmap font as weather effect, mirrored for correct display
  const mi=mi0;
  const illum=Math.round(mi.fraction*100);
  const ph=mi.phase;
  const pName=ph<0.03?'New Moon':ph<0.22?'Waxing Crescent':ph<0.28?'First Quarter':ph<0.47?'Waxing Gibbous':ph<0.53?'Full Moon':ph<0.72?'Waning Gibbous':ph<0.78?'Last Quarter':ph<0.97?'Waning Crescent':'New Moon';
  const bodyNames={blackhole:'Black Hole',solarsystem:'Solar System'};
  const axisTilts={mercury:0.03,venus:177.4,earth:23.4,mars:25.2,jupiter:3.1,saturn:26.7,uranus:97.8,neptune:28.3,pluto:122.5,sun:7.25};
  const tiltDeg=axisTilts[body];
  const tiltStr=tiltDeg!==undefined?` ${Math.round(tiltDeg)}°`:'';
  const moonText=body==='moon'?`${pName} ${illum}%`:(bodyNames[body]||body.charAt(0).toUpperCase()+body.slice(1))+tiltStr;
  if(!this._mf){
    this._mf={
      '0':[7,5,5,5,7],'1':[6,2,2,2,7],'2':[7,1,7,4,7],'3':[7,1,3,1,7],
      '4':[5,5,7,1,1],'5':[7,4,6,1,7],'6':[7,4,7,5,7],'7':[7,1,2,2,2],
      '8':[7,5,7,5,7],'9':[7,5,7,1,7],'%':[5,1,2,4,5],' ':[0,0,0,0,0],
      A:[2,5,7,5,5],B:[6,5,6,5,6],C:[3,4,4,4,3],D:[6,5,5,5,6],
      E:[7,4,6,4,7],F:[7,4,6,4,4],G:[3,4,7,5,3],H:[5,5,7,5,5],
      I:[7,2,2,2,7],J:[1,1,1,5,2],K:[5,6,4,6,5],L:[4,4,4,4,7],
      M:[7,7,5,5,5],N:[7,5,5,5,5],O:[7,5,5,5,7],P:[6,5,6,4,4],
      Q:[7,5,5,7,1],R:[6,5,6,5,5],S:[3,4,2,1,6],T:[7,2,2,2,2],
      U:[5,5,5,5,7],V:[5,5,5,5,2],W:[5,5,5,7,5],X:[5,5,2,5,5],
      Y:[5,5,2,2,2],Z:[7,1,2,4,7],'°':[2,5,2,0,0]
    };
    this._moonScrollX=0;
  }
  const mf=this._mf;
  const charW=4, textW=moonText.length*charW;
  const needScroll=textW>S;
  if(needScroll) this._moonScrollX=(this._moonScrollX+dt*14)%(textW+S);
  else this._moonScrollX=0;
  const textBaseV=1;
  const scrollOff=needScroll?Math.floor(S-this._moonScrollX):Math.floor((S-textW)/2);
  const mFaces=panel2dMode?[0]:[0,1,2,3];
  for(let fi=0;fi<mFaces.length;fi++){
    const face=mFaces[fi];
    for(let ci=0;ci<moonText.length;ci++){
      const ch=moonText[ci].toUpperCase();
      const rows=mf[ch]; if(!rows) continue;
      const cxx=scrollOff+ci*charW;
      for(let row=0;row<5;row++){
        const bits=rows[row];
        for(let col=0;col<3;col++){
          if(!((bits>>(2-col))&1)) continue;
          const u=cxx+col, v=textBaseV+(4-row);
          if(u<0||u>=S||v<0||v>=S) continue;
          const idx=faceMap[face][v*S+u]; if(idx<0) continue;
          colBuf[idx*3]=Math.max(colBuf[idx*3],0.75);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],0.8);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],0.85);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════
//  Near-Earth Object Tracker (NASA NeoWs)
// ═══════════════════════════════════════════════════
// ── Shared 3×5 bitmap pixel font (bit2=left, bit1=mid, bit0=right per row) ──
const PIXEL_FONT={
  '0':[7,5,5,5,7],'1':[6,2,2,2,7],'2':[7,1,7,4,7],'3':[7,1,3,1,7],
  '4':[5,5,7,1,1],'5':[7,4,6,1,7],'6':[7,4,7,5,7],'7':[7,1,2,2,2],
  '8':[7,5,7,5,7],'9':[7,5,7,1,7],'°':[6,6,0,0,0],'C':[3,4,4,4,3],
  '-':[0,0,7,0,0],' ':[0,0,0,0,0],'+':[0,2,7,2,0],':':[0,2,0,2,0],
  'A':[2,5,7,5,5],'B':[6,5,6,5,6],'D':[6,5,5,5,6],'E':[7,4,6,4,7],
  'F':[7,4,6,4,4],'G':[3,4,7,5,3],'H':[5,5,7,5,5],'I':[7,2,2,2,7],
  'J':[1,1,1,5,2],'K':[5,6,4,6,5],'L':[4,4,4,4,7],'M':[7,7,5,5,5],
  'N':[7,5,5,5,5],'O':[7,5,5,5,7],'P':[6,5,6,4,4],'Q':[7,5,5,7,1],
  'R':[6,5,6,5,5],'S':[3,4,2,1,6],'T':[7,2,2,2,2],'U':[5,5,5,5,7],
  'V':[5,5,5,5,2],'W':[5,5,5,7,5],'X':[5,5,2,5,5],'Y':[5,5,2,2,2],
  'Z':[7,1,2,4,7],',':[0,0,0,2,4],'.':[0,0,0,0,2],'/':[1,1,2,4,4],
  'a':[0,6,5,7,5],'b':[4,6,5,5,6],'c':[0,3,4,4,3],'d':[1,3,5,5,3],
  'e':[0,7,5,6,3],'g':[0,3,5,3,7],'h':[4,6,5,5,5],'i':[2,0,2,2,2],
  'k':[4,5,6,6,5],'l':[6,2,2,2,7],'m':[0,7,7,5,5],'n':[0,6,5,5,5],
  'o':[0,7,5,5,7],'p':[0,6,5,6,4],'r':[0,3,5,4,4],'s':[0,3,6,1,6],
  't':[4,7,4,4,3],'u':[0,5,5,5,3],'v':[0,5,5,5,2],'w':[0,5,5,7,5],
  'x':[0,5,2,5,5],'y':[0,5,3,1,6],'z':[0,7,2,4,7],
};
// Render one glyph at LED pixel (su,sv) on face. sv = top row of glyph (row 4=top, 0=bottom).
// Matches weather wxGlyph convention exactly. Returns advance width (4).
function pixelGlyph(face,ch,su,sv,tr,tg,tb){
  const rows=PIXEL_FONT[ch]||PIXEL_FONT[ch.toUpperCase()]; if(!rows) return 4;
  for(let row=0;row<5;row++){
    const bits=rows[row];
    for(let col=0;col<3;col++){
      if(!((bits>>(2-col))&1)) continue;
      const u=su+col, v=sv+(4-row);
      if(u<0||u>=SIZE||v<0||v>=SIZE) continue;
      const idx=faceMap[face][v*SIZE+u]; if(idx<0) continue;
      if(tr>colBuf[idx*3]) colBuf[idx*3]=tr;
      if(tg>colBuf[idx*3+1]) colBuf[idx*3+1]=tg;
      if(tb>colBuf[idx*3+2]) colBuf[idx*3+2]=tb;
    }
  }
  return 4;
}
// Render string; su/sv = start col, bottom row. Wraps modulo totalW for seamless scroll.
function pixelText(face,str,su,sv,tr,tg,tb,totalW){
  let u=su;
  for(const ch of str){
    if(totalW!=null){ /* handled by caller for scroll */ }
    u+=pixelGlyph(face,ch,u,sv,tr,tg,tb);
    if(totalW==null && u>=SIZE) break;
  }
}
// Scrolling pixel-font ticker on a face. Call every frame. Returns nothing.
function pixelTicker(face,str,scrollX,sv,tr,tg,tb){
  const charW=4, gap=SIZE;
  const totalW=str.length*charW+gap;
  const off=Math.floor(scrollX)%totalW;
  // Draw two copies so seamless wrap is always visible
  for(let tile=0;tile<2;tile++){
    let u=-off+tile*totalW;
    for(const ch of str){
      if(u+3>=0 && u<SIZE) pixelGlyph(face,ch,u,sv,tr,tg,tb);
      u+=charW;
    }
  }
  return totalW;
}

let neoObjects=[], neoFetching=false, neoLastFetch=0, neoError='', neoStarsInit=false;
let neoTickerPixels=null, neoTickerWidth=0, neoTickerScrollX=0, neoT=0;
let neo2dTickerPx=null, neo2dTickerW=0, neo2dTickerX=0;
const NEO_API_KEY='DEMO_KEY';

function neoRisk(o){
  if(o.hazardous && o.missLD<5) return 'red';
  if(o.hazardous || o.missLD<10) return 'yellow';
  return 'green';
}
function neoRiskRGB(level){
  if(level==='red') return [1,0.08,0.08];
  if(level==='yellow') return [1,0.78,0.05];
  return [0.1,0.95,0.25];
}
// 2D panel colours: softer amber for watch, dimmer green for safe
function neo2dRiskRGB(level){
  if(level==='red') return [1,0.1,0.05];
  if(level==='yellow') return [0.9,0.45,0.05]; // amber/orange — readable, not garish
  return [0.1,0.75,0.2];
}
function neoOverallRisk(){
  if(!neoObjects.length) return 'green';
  if(neoObjects.some(o=>neoRisk(o)==='red')) return 'red';
  if(neoObjects.some(o=>neoRisk(o)==='yellow')) return 'yellow';
  return 'green';
}

async function neoFetch(){
  if(neoFetching) return;
  neoFetching=true; neoError='';
  const statusEl=document.getElementById('neo-status');
  if(statusEl) statusEl.textContent='Fetching near-Earth object data…';
  try{
    const start=new Date();
    const end=new Date(start.getTime()+6*86400000);
    const fmt=d=>d.toISOString().slice(0,10);
    const url=`https://api.nasa.gov/neo/rest/v1/feed?start_date=${fmt(start)}&end_date=${fmt(end)}&api_key=${apodApiKey()}`;
    let r;
    try{ r=await fetch(url); }
    catch(fe){ throw new Error('NEO fetch failed — check internet connection'); }
    if(!r.ok) throw new Error('NASA API error: '+r.status);
    const d=await r.json();
    const byDate=d.near_earth_objects||{};
    let list=[];
    for(const dateKey in byDate){
      for(const o of byDate[dateKey]){
        const cad=(o.close_approach_data&&o.close_approach_data[0])||null;
        if(!cad) continue;
        const dEst=o.estimated_diameter&&o.estimated_diameter.meters;
        const diaM=dEst?(dEst.estimated_diameter_min+dEst.estimated_diameter_max)/2:0;
        list.push({
          name:(o.name||'').replace(/[()]/g,''),
          hazardous:!!o.is_potentially_hazardous_asteroid,
          missLD:parseFloat(cad.miss_distance.lunar),
          missKm:parseFloat(cad.miss_distance.kilometers),
          velKmS:parseFloat(cad.relative_velocity.kilometers_per_second),
          diaM:Math.round(diaM),
          date:cad.close_approach_date,
        });
      }
    }
    list.sort((a,b)=>a.missLD-b.missLD);
    neoObjects=list.slice(0,12);
    neoLastFetch=Date.now()/1000;
    neoTickerPixels=null; // force ticker rebuild
    if(statusEl) statusEl.textContent=`${neoObjects.length} objects tracked`;
    const infoEl=document.getElementById('neo-info');
    if(infoEl){
      infoEl.style.display='block';
      const closest=neoObjects[0];
      const cl=document.getElementById('neo-closest-line');
      if(cl&&closest) cl.textContent=`Closest: ${closest.name} — ${closest.missLD.toFixed(1)} LD`;
      const rl=document.getElementById('neo-risk-line');
      if(rl) rl.textContent=`Risk level: ${neoOverallRisk().toUpperCase()}`;
    }
  }catch(e){
    neoError=e.message;
    neoLastFetch=Date.now()/1000-3540;
    if(statusEl) statusEl.textContent='✕ '+e.message;
    console.error('NEO fetch error:',e);
  }
  neoFetching=false;
}
document.getElementById('neo-fetch-btn')?.addEventListener('click',neoFetch);

function neoBuildTicker(){
  const level=neoOverallRisk();
  const rgb=neoRiskRGB(level);
  const hex='#'+rgb.map(c=>Math.round(c*255).toString(16).padStart(2,'0')).join('');
  let text;
  if(!neoObjects.length){
    text='   NEO WATCH  •  NO DATA  •  ';
  } else {
    text=neoObjects.map(o=>{
      const r=neoRisk(o);
      const flag=r==='red'?'⚠⚠':r==='yellow'?'⚠':'•';
      return `${flag} ${o.name}  ${o.missLD.toFixed(1)} LD  ${o.diaM}m  ${o.velKmS.toFixed(1)}km/s`;
    }).join('   ///   ')+'   ///   ';
  }
  text=('   '+text).repeat(2);
  const fh=Math.max(8,(SIZE*0.34)|0);
  const oc=document.createElement('canvas');
  const cx=oc.getContext('2d');
  cx.font=`bold ${fh}px "Courier New",monospace`;
  const tw=cx.measureText(text).width|0;
  oc.width=tw+4*SIZE; oc.height=SIZE;
  cx.fillStyle='#000'; cx.fillRect(0,0,oc.width,oc.height);
  cx.fillStyle=hex; cx.font=`bold ${fh}px "Courier New",monospace`;
  cx.textBaseline='middle'; cx.fillText(text,0,SIZE/2);
  neoTickerPixels=cx.getImageData(0,0,oc.width,oc.height).data;
  neoTickerWidth=oc.width;
  neoTickerScrollX=0;
}

function neoApplyTickerToFace(face){
  if(!neoTickerPixels) return;
  const S=SIZE;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sx=(((neoTickerScrollX|0)+u)%neoTickerWidth+neoTickerWidth)%neoTickerWidth;
      const sv=S-1-v;
      const pi=(sv*neoTickerWidth+sx)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=neoTickerPixels[pi]/255;
      colBuf[idx*3+1]=neoTickerPixels[pi+1]/255;
      colBuf[idx*3+2]=neoTickerPixels[pi+2]/255;
    }
  }
}

function neoBuildTitleBuf(level){
  const S=Math.max(SIZE,16);
  const c=document.createElement('canvas');
  c.width=S; c.height=S;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#000'; ctx.fillRect(0,0,S,S);
  const rgb=neoRiskRGB(level);
  const hex='#'+rgb.map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#fff';
  ctx.font=`bold ${Math.max(6,(S*0.16)|0)}px Arial,sans-serif`;
  ctx.fillText('NEO WATCH', S/2, S*0.22);
  ctx.fillStyle=hex;
  ctx.font=`bold ${Math.max(8,(S*0.22)|0)}px Arial,sans-serif`;
  ctx.fillText(level.toUpperCase(), S/2, S*0.5);
  ctx.fillStyle='#bbb';
  ctx.font=`${Math.max(5,(S*0.11)|0)}px Arial,sans-serif`;
  const closest=neoObjects[0];
  ctx.fillText(closest?`${closest.missLD.toFixed(1)} LD`:'NO DATA', S/2, S*0.74);
  ctx.fillText(closest?`${closest.diaM}m dia`:'', S/2, S*0.88);
  return {data:ctx.getImageData(0,0,S,S).data, S};
}

function neoApplyBufToFace(face, buf){
  const {data, S}=buf;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sv=S-1-v;
      const pi=(sv*S+u)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=data[pi]/255;
      colBuf[idx*3+1]=data[pi+1]/255;
      colBuf[idx*3+2]=data[pi+2]/255;
    }
  }
}

// Draws a pre-built SIZE-tall scrolling ticker texture squashed into a
// bottom strip of `stripH` rows on a single face — used by the NASA live
// data effects (NEO/APOD/SpaceWeather/EPIC/ISS) when in single-panel 2D mode.
function applyTickerStripToFace(face, pixels, width, scrollX, stripH){
  if(!pixels) return;
  const S=SIZE, rowStart=S-stripH;
  for(let v=rowStart; v<S; v++){
    for(let u=0;u<S;u++){
      const sx=(((scrollX|0)+u)%width+width)%width;
      const vLocal=v-rowStart;
      const sv=S-1-Math.min(S-1,Math.floor(vLocal/stripH*S));
      const pi=(sv*width+sx)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=pixels[pi]/255;
      colBuf[idx*3+1]=pixels[pi+1]/255;
      colBuf[idx*3+2]=pixels[pi+2]/255;
    }
  }
}

// Cache for static text renders — key is text+colour, avoids per-frame canvas redraws
// which cause sub-pixel flicker on static content.
const _rtfCache=new Map();

// Renders text lines onto a face. Static lines are cached; lines wider than the face
// scroll smoothly without flicker.
function renderTextToFace(face, lines, fgRGB, bgRGB){
  const S=SIZE;
  const cacheKey=lines.join('\n')+'|'+fgRGB.join(',')+'|'+bgRGB.join(',');

  let cached=_rtfCache.get(cacheKey);
  if(!cached){
    const oc=document.createElement('canvas');
    oc.width=S; oc.height=S;
    const ctx=oc.getContext('2d');
    ctx.fillStyle=`rgb(${(bgRGB[0]*255)|0},${(bgRGB[1]*255)|0},${(bgRGB[2]*255)|0})`;
    ctx.fillRect(0,0,S,S);
    ctx.fillStyle=`rgb(${(fgRGB[0]*255)|0},${(fgRGB[1]*255)|0},${(fgRGB[2]*255)|0})`;
    const rowH=S/lines.length;
    const fh=Math.max(4,Math.floor(rowH*0.4));
    ctx.font=`bold ${fh}px "Courier New",monospace`;
    ctx.textBaseline='middle';
    const scrollLines=[];
    lines.forEach((line,i)=>{
      const cy=rowH*(i+0.5);
      const w=ctx.measureText(line).width;
      if(w<=S){
        ctx.textAlign='center';
        ctx.fillText(line,S/2,cy);
      } else {
        scrollLines.push({line,cy,w}); // deferred — needs per-frame offset
      }
    });
    const staticPx=ctx.getImageData(0,0,S,S).data;
    cached={staticPx, scrollLines, rowH, fh};
    _rtfCache.set(cacheKey,cached);
    if(_rtfCache.size>40) _rtfCache.delete(_rtfCache.keys().next().value); // cap size
  }

  // Build final frame: static pixels + scrolling lines blended in
  const {staticPx, scrollLines, rowH, fh}=cached;
  let px=staticPx;
  if(scrollLines.length){
    const oc2=document.createElement('canvas');
    oc2.width=S; oc2.height=S;
    const ctx2=oc2.getContext('2d');
    ctx2.putImageData(new ImageData(new Uint8ClampedArray(staticPx),S,S),0,0);
    ctx2.fillStyle=`rgb(${(fgRGB[0]*255)|0},${(fgRGB[1]*255)|0},${(fgRGB[2]*255)|0})`;
    ctx2.font=`bold ${fh}px "Courier New",monospace`;
    ctx2.textBaseline='middle';
    const t=Date.now()/1000;
    const scrollPx=40;
    scrollLines.forEach(({line,cy,w})=>{
      const gap=S*0.5, cycle=w+gap, off=(t*scrollPx)%cycle;
      ctx2.textAlign='left';
      ctx2.fillText(line,S-off,cy);
      ctx2.fillText(line,S-off+cycle,cy);
    });
    px=ctx2.getImageData(0,0,S,S).data;
  }
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const pi=((S-1-v)*S+u)*4;
      colBuf[idx*3]=px[pi]/255;
      colBuf[idx*3+1]=px[pi+1]/255;
      colBuf[idx*3+2]=px[pi+2]/255;
    }
  }
}

function effectNEO(dt){
  neoT+=dt;
  if(!neoObjects.length && !neoFetching && (Date.now()/1000-neoLastFetch)>3600) neoFetch();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Starfield background everywhere
  const tt=Date.now()*0.001;
  for(let i=0;i<N;i++){
    const seed=((i*2654435761)>>>0)/4294967296;
    if(seed<0.014){
      const twinkle=0.3+0.7*Math.abs(Math.sin(tt*1.4+seed*60));
      const br=seed*36*twinkle;
      colBuf[i*3]=br; colBuf[i*3+1]=br; colBuf[i*3+2]=br*1.1;
    }
  }

  const level=neoOverallRisk();
  const riskRGB=neoRiskRGB(level);
  const pulse=0.55+0.45*Math.sin(neoT*(level==='red'?6:level==='yellow'?3:1.4));
  const S=SIZE;
  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;

  if(is2D){
    // ── 2D panel: Earth peeking from left edge, NEOs scatter to the right ──
    const face=0;
    // Earth centre is off the left edge so only right ~1/3 globe is visible
    const ecx=Math.round(S*-0.28), ecy=Math.round(S*0.5);
    const earthRad=Math.round(S*0.55);
    const atmRad=earthRad+Math.round(S*0.07);

    // Max distance shown on screen (LD). Objects beyond this still drawn at edge.
    const maxLD=60;
    // x pixel where 0 LD sits (right edge of Earth) and where maxLD sits (right edge)
    const xOrigin=ecx+earthRad+Math.round(S*0.02);
    const xMax=S-2;

    // ── Draw space background (already cleared to black by colBuf zero above) ──

    // Faint distance rings (concentric dashed arcs around Earth) — every 10 LD
    for(let ring=10; ring<=maxLD; ring+=10){
      const rx=(ring/maxLD)*(xMax-xOrigin)+xOrigin;
      const ringBr=0.04;
      for(let v=0;v<S;v++){
        // vertical line at this LD distance, only right-half visible
        const idx=faceMap[face][v*S+Math.round(rx)];
        if(idx>=0 && Math.round(rx)>=0 && Math.round(rx)<S){
          // dashed: skip every other 3px block
          if(Math.floor(v/3)%2===0){
            colBuf[idx*3]=ringBr; colBuf[idx*3+1]=ringBr; colBuf[idx*3+2]=ringBr*0.5;
          }
        }
      }
    }

    // ── Draw Earth ──
    for(let v=0;v<S;v++){
      for(let u=0;u<S;u++){
        const idx=faceMap[face][(S-1-v)*S+u]; if(idx<0) continue;
        const dx=u-ecx, dy=v-ecy, d=Math.sqrt(dx*dx+dy*dy);
        // Atmosphere glow ring
        if(d<atmRad && d>=earthRad){
          const t2=1-(d-earthRad)/(atmRad-earthRad);
          const atm=t2*t2*0.35;
          colBuf[idx*3]=Math.max(colBuf[idx*3],atm*0.3);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],atm*0.6);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],atm);
          continue;
        }
        if(d>=earthRad) continue;
        const nx=dx/earthRad, ny=dy/earthRad;
        const nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
        // Terminator: light from slightly upper-right
        const lit=nx*0.35+ny*(-0.25)+nz*0.9;
        const lightFactor=Math.max(0.02, Math.min(1, lit*1.1));
        // Land/ocean using layered noise
        const lon=Math.atan2(ny,nx)+tt*0.04; // slow rotation
        const lat=Math.asin(Math.max(-1,Math.min(1,nz)));
        const land=(Math.sin(lon*3.1+1.2)*Math.cos(lat*2.8+0.5)>0.18)
                 ||(Math.sin(lon*5.3-0.7)*Math.cos(lat*4.1+1.1)>0.35)
                 ||(Math.sin(lon*1.9+2.5)*Math.cos(lat*6.2-0.8)>0.45);
        // Ice caps
        const ice=Math.abs(nz)>0.82;
        let r,g,b;
        if(ice){ r=0.82; g=0.88; b=0.92; }
        else if(land){ r=0.12; g=0.38+Math.sin(lon*7)*0.06; b=0.08; }
        else { r=0.04; g=0.15; b=0.55+Math.sin(lat*4)*0.1; }
        // Terminator shadow
        colBuf[idx*3]=r*lightFactor;
        colBuf[idx*3+1]=g*lightFactor;
        colBuf[idx*3+2]=b*lightFactor;
      }
    }

    // ── Build ticker segments & find which NEO is active ──
    const objs=neoObjects.slice(0,12);
    const charW=4;
    // Segments: each NEO + separator, tagged with neoIdx
    const segments=[];
    objs.forEach((o,oi)=>{
      const risk=neoRisk(o);
      const rgb=neo2dRiskRGB(risk);
      segments.push({str:o.name+' '+o.missLD.toFixed(1)+'LD '+o.diaM+'m', r:rgb[0],g:rgb[1],b:rgb[2], neoIdx:oi});
      if(oi<objs.length-1) segments.push({str:'   /   ',r:0.25,g:0.25,b:0.25,neoIdx:-1});
    });
    if(!segments.length) segments.push({str:'NO DATA',r:0.5,g:0.5,b:0.5,neoIdx:-1});
    const totalTickerChars=segments.reduce((s,seg)=>s+seg.str.length,0);
    const totalW=totalTickerChars*charW+S;
    neo2dTickerX=(neo2dTickerX+dt*22)%totalW;

    // Which NEO index is currently centred in the ticker?
    const targetPx=(Math.floor(neo2dTickerX)+Math.floor(S*0.5))%totalW;
    let activeNeoIdx=-1, cp2=0;
    for(const seg of segments){
      const segPx=cp2*charW;
      if(targetPx>=segPx && targetPx<segPx+seg.str.length*charW){
        if(seg.neoIdx>=0) activeNeoIdx=seg.neoIdx;
        break;
      }
      cp2+=seg.str.length;
    }

    // ── Draw NEOs ──
    objs.forEach((o,oi)=>{
      const risk=neoRisk(o);
      const rgb=neo2dRiskRGB(risk);
      const ld=Math.min(o.missLD, maxLD);
      const px=Math.round(xOrigin+(ld/maxLD)*(xMax-xOrigin));
      const rows=Math.min(objs.length,10);
      const ySpacing=Math.round((S*0.82)/rows);
      const py=Math.round(S*0.09+oi*ySpacing+ySpacing*0.5);
      const diaFrac=Math.min(1,Math.max(0,(o.diaM||50)/500));
      const baseRad=o.hazardous?2+Math.round(diaFrac*2):1+Math.round(diaFrac*1.5);
      const isActive=oi===activeNeoIdx;
      // Flash active NEO bright white ring; others use risk colour
      const flashPulse=0.5+0.5*Math.sin(neoT*10);
      const blink=risk==='red'?(0.5+0.5*Math.sin(neoT*8+oi)):
                  risk==='yellow'?(0.7+0.3*Math.sin(neoT*3+oi)):1;
      const rad=isActive?baseRad+1:baseRad;
      for(let dv=-rad;dv<=rad;dv++){
        for(let du=-rad;du<=rad;du++){
          const dist2=du*du+dv*dv;
          if(dist2>rad*rad+0.5) continue;
          const pu=px+du, pv=py+dv;
          if(pu<0||pu>=S||pv<0||pv>=S) continue;
          const idx=faceMap[face][(S-1-pv)*S+pu]; if(idx<0) continue;
          // Active: bright white flash on outer ring, colour in core
          if(isActive && dist2>(baseRad-0.5)*(baseRad-0.5)){
            colBuf[idx*3]=flashPulse; colBuf[idx*3+1]=flashPulse; colBuf[idx*3+2]=flashPulse;
          } else {
            colBuf[idx*3]=rgb[0]*blink; colBuf[idx*3+1]=rgb[1]*blink; colBuf[idx*3+2]=rgb[2]*blink;
          }
        }
      }
      // Faint line from Earth edge
      if(px>xOrigin){
        const steps=px-Math.round(xOrigin);
        for(let s=2;s<steps;s++){
          const lu=Math.round(xOrigin)+s, lv=py;
          if(lu<0||lu>=S||lv<0||lv>=S) continue;
          const idx=faceMap[face][(S-1-lv)*S+lu]; if(idx<0) continue;
          const dim=isActive?0.12:0.05;
          colBuf[idx*3]=Math.max(colBuf[idx*3],rgb[0]*dim);
          colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],rgb[1]*dim);
          colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],rgb[2]*dim);
        }
      }
    });

    // ── Bottom ticker — same 3×5 bitmap font as weather city name ──
    // Dark background strip: faceMap rows 0-7 = visual bottom
    for(let fv=0;fv<8;fv++) for(let fu=0;fu<S;fu++){
      const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
      colBuf[idx*3]*=0.12; colBuf[idx*3+1]*=0.12; colBuf[idx*3+2]*=0.12;
    }
    // sv=3: glyph top row at faceMap row 3, bottom at row 7 — matches weather textV=3
    const sv=3;
    let charPos=0;
    for(const seg of segments){
      for(const ch of seg.str){
        for(let tile=0;tile<2;tile++){
          const u=charPos*charW - Math.floor(neo2dTickerX) + tile*totalW;
          if(u+3>=0 && u<S) pixelGlyph(face,ch,u,sv,seg.r,seg.g,seg.b);
        }
        charPos++;
      }
    }

    // ── Risk label top-right ──
    const labelX=S-Math.round(S*0.32), labelY=Math.round(S*0.06);
    const labelStr=level==='red'?'DANGER':level==='yellow'?'WATCH':'CLEAR';
    // Simple pixel text via canvas blit
    const lc=document.createElement('canvas'); lc.width=S; lc.height=S;
    const lctx=lc.getContext('2d');
    lctx.fillStyle=`rgba(${(riskRGB[0]*255)|0},${(riskRGB[1]*255)|0},${(riskRGB[2]*255)|0},${pulse})`;
    const lfh=Math.max(3,Math.floor(S*0.11));
    lctx.font=`bold ${lfh}px "Courier New",monospace`;
    lctx.textAlign='right'; lctx.textBaseline='top';
    lctx.fillText(labelStr,S-1,labelY);
    const lpx=lctx.getImageData(0,0,S,S).data;
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const pi=(v*S+u)*4; if(!lpx[pi+3]) continue;
      const idx=faceMap[face][(S-1-v)*S+u]; if(idx<0) continue;
      colBuf[idx*3]=Math.max(colBuf[idx*3],lpx[pi]/255*pulse);
      colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],lpx[pi+1]/255*pulse);
      colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],lpx[pi+2]/255*pulse);
    }

  } else {
    // ── 3D cube: Face 0 (front): Earth with pulsing threat ring ──
    const cx0=S/2, cy0=S/2;
    const earthRad=S*0.3, ringRad=S*0.42;
    for(let v=0;v<S;v++){
      for(let u=0;u<S;u++){
        const idx=faceMap[0][v*S+u]; if(idx<0) continue;
        const dx=u-cx0, dy=v-cy0, d=Math.sqrt(dx*dx+dy*dy);
        if(d<earthRad){
          const nx=dx/earthRad, ny=dy/earthRad;
          const land=Math.sin(nx*5+tt*0.15)*Math.cos(ny*4)>0.25;
          if(land){ colBuf[idx*3]=0.07; colBuf[idx*3+1]=0.45; colBuf[idx*3+2]=0.12; }
          else { colBuf[idx*3]=0.05; colBuf[idx*3+1]=0.18; colBuf[idx*3+2]=0.55; }
          const shade=1-Math.max(0,d/earthRad)*0.3;
          colBuf[idx*3]*=shade; colBuf[idx*3+1]*=shade; colBuf[idx*3+2]*=shade;
        } else if(d>ringRad-1.2 && d<ringRad+1.2){
          colBuf[idx*3]=riskRGB[0]*pulse; colBuf[idx*3+1]=riskRGB[1]*pulse; colBuf[idx*3+2]=riskRGB[2]*pulse;
        }
      }
    }
    // Faces 2 & 3 (sides): incoming object blips, distance-scaled
    const sideFaces=[2,3];
    for(let f=0; f<sideFaces.length; f++){
      const face=sideFaces[f];
      const objs=neoObjects.slice(0,6);
      objs.forEach((o,oi)=>{
        const r=neoRisk(o);
        const rgb=neoRiskRGB(r);
        const closeness=Math.max(0,1-Math.min(1,o.missLD/40));
        const bx=2+((oi*7+f*3)%(S-4));
        const by=Math.round(S*0.15+(S*0.7)*(oi/Math.max(1,objs.length-1)));
        const rad=1+Math.round(closeness*2.5);
        const blink=0.6+0.4*Math.sin(neoT*(2+oi)+oi);
        for(let dv=-rad;dv<=rad;dv++){
          for(let du=-rad;du<=rad;du++){
            if(du*du+dv*dv>rad*rad) continue;
            const u=bx+du, v=by+dv;
            if(u<0||u>=S||v<0||v>=S) continue;
            const idx=faceMap[face][v*S+u]; if(idx<0) continue;
            colBuf[idx*3]=rgb[0]*blink; colBuf[idx*3+1]=rgb[1]*blink; colBuf[idx*3+2]=rgb[2]*blink;
          }
        }
      });
    }
    // Face 4 (top): title / risk summary card
    neoApplyBufToFace(4, neoBuildTitleBuf(level));
  }

  if(!is2D){
    if(!neoTickerPixels) neoBuildTicker();
    neoTickerScrollX += dt*22*(speedMult||1);
    neoApplyTickerToFace(1);
  }
}

// ═══════════════════════════════════════════════════
//  Astronomy Picture of the Day (NASA APOD)
// ═══════════════════════════════════════════════════
let apodData=null, apodFetching=false, apodLastFetch=0, apodError='', apodImgError='', apodRetryAfter=60;
let apodLetterbox=localStorage.getItem('apodLetterbox')!=='false'; // default: full image
let apodSlideshowSecs=8, apodSlideshowTimer=0, apodBrowsingHistory=false;
let apodHistory=[], apodHistoryIdx=0;
let apodHistoryPixels=[], apodHistorySize=[];
let apodHistoryFetching=false;
let apodImg=null, apodImgReady=false, apodImgPixels=null, apodImgSize=0;
let apodTickerPixels=null, apodTickerWidth=0, apodTickerScrollX=0, apodT=0;

function apodDateStr(daysAgo){
  const d=new Date(); d.setDate(d.getDate()-daysAgo);
  return d.toISOString().slice(0,10);
}

async function apodFetchHistory(){
  if(apodHistoryFetching) return;
  apodHistoryFetching=true;
  const statusEl=document.getElementById('apod-status');
  if(statusEl) statusEl.textContent='Fetching last 30 days…';
  try{
    const end=apodDateStr(0), start=apodDateStr(29);
    const url=`https://api.nasa.gov/planetary/apod?api_key=${apodApiKey()}&start_date=${start}&end_date=${end}`;
    let r;
    try{ r=await fetch(url,{mode:'cors'}); }catch(fe){ throw new Error('Network error'); }
    if(r.status===429) throw new Error('Rate limited — enter a free API key below');
    if(!r.ok) throw new Error('NASA error '+r.status);
    const arr=await r.json();
    apodHistory=arr.reverse().map(d=>({
      title:d.title||'',
      date:d.date||'',
      mediaType:d.media_type||'image',
      url:d.media_type==='image'?(d.url||d.hdurl||null):(d.thumbnail_url||null),
    })).filter(d=>d.url);
    apodHistoryPixels=new Array(apodHistory.length).fill(null);
    apodHistorySize=new Array(apodHistory.length).fill(0);
    apodHistoryIdx=0;
    apodHistoryLoad(0);
    const infoEl=document.getElementById('apod-slideshow-info');
    if(infoEl) infoEl.textContent=apodHistory.length+' images loaded';
    if(statusEl) statusEl.textContent=apodHistory[0]?apodHistory[0].title:'';
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+e.message;
  }
  apodHistoryFetching=false;
}

function apodHistoryLoad(idx){
  // null=unloaded, false=in-flight, 'error'=failed, Uint8ClampedArray=ready
  if(!apodHistory[idx]||apodHistoryPixels[idx]!=null) return;
  apodHistoryPixels[idx]=false;
  loadImageForPixels(apodHistory[idx].url, sz=>{apodHistorySize[idx]=sz;},
    pixels=>{ apodHistoryPixels[idx]=pixels; },
    ()=>{ apodHistoryPixels[idx]='error'; },
    {letterbox:apodLetterbox});
}

function apodHistoryApplyToFace(face, idx){
  const pixels=apodHistoryPixels[idx];
  if(!pixels||pixels==='error') return false;
  const S=SIZE, IS=apodHistorySize[idx];
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx2=faceMap[face][v*S+u]; if(idx2<0) continue;
    const su=Math.min(IS-1,Math.floor(u/S*IS));
    const sv=Math.min(IS-1,Math.floor((S-1-v)/S*IS));
    const pi=(sv*IS+su)*4;
    colBuf[idx2*3]=pixels[pi]/255;
    colBuf[idx2*3+1]=pixels[pi+1]/255;
    colBuf[idx2*3+2]=pixels[pi+2]/255;
  }
  return true;
}

function apodApiKey(){
  return localStorage.getItem('nasaApiKey')||NEO_API_KEY;
}

async function apodFetch(){
  if(apodFetching) return;
  apodFetching=true; apodError='';
  const statusEl=document.getElementById('apod-status');
  if(statusEl) statusEl.textContent='Fetching astronomy picture of the day…';
  try{
    const apiUrl=`https://api.nasa.gov/planetary/apod?api_key=${apodApiKey()}`;
    let r;
    try{ r=await fetch(apiUrl); }
    catch(fe){ apodRetryAfter=5; throw new Error('Network error — check connection'); }
    if(r.status===429){ apodRetryAfter=60; throw new Error('Rate limited — get a free key at api.nasa.gov'); }
    if(r.status===503||r.status===502||r.status===504){ apodRetryAfter=5; throw new Error('NASA servers down ('+r.status+') — retrying…'); }
    if(!r.ok) throw new Error('NASA API error '+r.status+' — try again later');
    const d=await r.json();
    const isVideo=d.media_type==='video';
    const imgUrl=isVideo?(d.thumbnail_url||null):(d.url||d.hdurl||null);
    apodData={
      title:d.title||'Astronomy Picture of the Day',
      explanation:d.explanation||'',
      date:d.date||'',
      mediaType:d.media_type||'image',
      url:imgUrl,
    };
    apodImgReady=false; apodImgError=''; apodImg=null; apodTickerPixels=null;
    apodLastFetch=Date.now()/1000;
    console.log('[APOD] fetched:',apodData.date,'type:',d.media_type,'url:',apodData.url);
    if(statusEl) statusEl.textContent=(isVideo?'📹 ':'')+apodData.title+(imgUrl?' — loading image…':' (no image)');
    const infoEl=document.getElementById('apod-info');
    if(infoEl){
      infoEl.style.display='block';
      const tl=document.getElementById('apod-title-line');
      if(tl) tl.textContent=apodData.title;
      const dl=document.getElementById('apod-date-line');
      if(dl) dl.textContent=apodData.date+(isVideo?' (video — thumbnail)':'');
    }
    if(imgUrl){
      loadImageForPixels(imgUrl, sz=>{
        apodImgSize=sz;
      }, pixels=>{
        apodImgPixels=pixels;
        apodImgReady=true;
        apodTickerPixels=null;
        console.log('[APOD] image ready, size:',apodImgSize,'px');
        if(statusEl) statusEl.textContent=(isVideo?'📹 ':'')+apodData.title;
      }, (err)=>{
        apodImgReady=false; apodImgError='Could not load image';
        console.warn('[APOD] image load failed:',err);
        if(statusEl) statusEl.textContent='✕ Could not load image';
      }, {letterbox: apodLetterbox});
    }
  }catch(e){
    apodError=e.message;
    apodLastFetch=Date.now()/1000; // retry after apodRetryAfter seconds
    if(statusEl) statusEl.textContent='✕ '+e.message;
    console.error('APOD fetch error:',e);
  }
  apodFetching=false;
}
document.getElementById('apod-fetch-btn')?.addEventListener('click',apodFetch);
(()=>{
  const inp=document.getElementById('nasa-api-key-input');
  const btn=document.getElementById('nasa-api-key-save');
  if(inp){ const saved=localStorage.getItem('nasaApiKey'); if(saved) inp.value=saved; }
  btn?.addEventListener('click',()=>{
    const key=(inp?.value||'').trim();
    if(key){ localStorage.setItem('nasaApiKey',key); }
    else { localStorage.removeItem('nasaApiKey'); }
    apodData=null; apodImgReady=false; apodLastFetch=0; // force re-fetch with new key
    apodFetch();
  });
})();
function apodSetLetterbox(v){
  apodLetterbox=v;
  localStorage.setItem('apodLetterbox',apodLetterbox);
  if(apodData?.url){ apodImgReady=false; apodImgError='';
    loadImageForPixels(apodData.url, sz=>{apodImgSize=sz;}, pixels=>{apodImgPixels=pixels;apodImgReady=true;}, ()=>{apodImgReady=false;apodImgError='Could not load image';}, {letterbox:apodLetterbox}); }
}
function apodSetSpeed(v){ apodSlideshowSecs=v; }
// Prev/Next always work, even with auto-advance (slideshow) off: pressing
// either lazily fetches the 30-day history on first use and switches into
// history-browsing mode, then pages through it statically from then on.
function apodGoPrev(){
  apodBrowsingHistory=true;
  if(!apodHistory.length){ if(!apodHistoryFetching) apodFetchHistory(); return; }
  apodHistoryIdx=(apodHistoryIdx-1+apodHistory.length)%apodHistory.length;
  apodHistoryLoad(apodHistoryIdx);
  apodSlideshowTimer=0;
  const infoEl=document.getElementById('apod-slideshow-info');
  if(infoEl) infoEl.textContent=(apodHistoryIdx+1)+'/'+apodHistory.length+' — '+apodHistory[apodHistoryIdx].date;
}
function apodGoNext(){
  apodBrowsingHistory=true;
  if(!apodHistory.length){ if(!apodHistoryFetching) apodFetchHistory(); return; }
  apodHistoryIdx=(apodHistoryIdx+1)%apodHistory.length;
  apodHistoryLoad(apodHistoryIdx);
  apodSlideshowTimer=0;
  const infoEl=document.getElementById('apod-slideshow-info');
  if(infoEl) infoEl.textContent=(apodHistoryIdx+1)+'/'+apodHistory.length+' — '+apodHistory[apodHistoryIdx].date;
}

function apodApplyImageToFace(face){
  if(!apodImgReady||!apodImgPixels) return;
  const S=SIZE, IS=apodImgSize;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const su=Math.min(IS-1,Math.floor(u/S*IS));
      const sv=Math.min(IS-1,Math.floor((S-1-v)/S*IS));
      const pi=(sv*IS+su)*4;
      colBuf[idx*3]=apodImgPixels[pi]/255;
      colBuf[idx*3+1]=apodImgPixels[pi+1]/255;
      colBuf[idx*3+2]=apodImgPixels[pi+2]/255;
    }
  }
}

function apodBuildTicker(){
  const text=apodData?`   ${apodData.title}   •   ${apodData.explanation}   `:'   ASTRONOMY PICTURE OF THE DAY   •   LOADING…   ';
  const full=('   '+text).repeat(2);
  const fh=Math.max(8,(SIZE*0.32)|0);
  const oc=document.createElement('canvas');
  const cx=oc.getContext('2d');
  cx.font=`bold ${fh}px "Courier New",monospace`;
  const tw=cx.measureText(full).width|0;
  oc.width=tw+4*SIZE; oc.height=SIZE;
  cx.fillStyle='#000'; cx.fillRect(0,0,oc.width,oc.height);
  cx.fillStyle='#ffd97a'; cx.font=`bold ${fh}px "Courier New",monospace`;
  cx.textBaseline='middle'; cx.fillText(full,0,SIZE/2);
  apodTickerPixels=cx.getImageData(0,0,oc.width,oc.height).data;
  apodTickerWidth=oc.width;
  apodTickerScrollX=0;
}

function apodApplyTickerToFace(face){
  if(!apodTickerPixels) return;
  const S=SIZE;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sx=(((apodTickerScrollX|0)+u)%apodTickerWidth+apodTickerWidth)%apodTickerWidth;
      const sv=S-1-v;
      const pi=(sv*apodTickerWidth+sx)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=apodTickerPixels[pi]/255;
      colBuf[idx*3+1]=apodTickerPixels[pi+1]/255;
      colBuf[idx*3+2]=apodTickerPixels[pi+2]/255;
    }
  }
}

function effectAPOD(dt){
  apodT+=dt;

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;

  // With the shared Slideshow (auto-advance) checkbox on by default, APOD
  // starts in history-browsing mode automatically, same as Unsplash/Art
  // Gallery always cycling through their fetched set.
  if(typeof artSlideshowOn!=='undefined' && artSlideshowOn && !apodBrowsingHistory && !apodHistory.length && !apodHistoryFetching){
    apodBrowsingHistory=true;
    apodFetchHistory();
  }

  if(apodBrowsingHistory && apodHistory.length){
    // History-browsing mode: auto-advance only while the shared slideshow
    // toggle is on; otherwise stays put until Prev/Next is pressed manually.
    if(typeof artSlideshowOn==='undefined' || artSlideshowOn){
      apodSlideshowTimer+=dt;
      if(apodSlideshowTimer>=apodSlideshowSecs){
        apodSlideshowTimer=0;
        apodHistoryIdx=(apodHistoryIdx+1)%apodHistory.length;
        const infoEl=document.getElementById('apod-slideshow-info');
        if(infoEl) infoEl.textContent=(apodHistoryIdx+1)+'/'+apodHistory.length+' — '+apodHistory[apodHistoryIdx].date;
        const statusEl=document.getElementById('apod-status');
        if(statusEl) statusEl.textContent=apodHistory[apodHistoryIdx].title||'';
      }
    }
    // Preload next
    apodHistoryLoad((apodHistoryIdx+1)%apodHistory.length);
    const shown=apodHistoryApplyToFace(0,apodHistoryIdx);
    if(shown){
      for(let f=1;f<6;f++) if(f!==1) apodHistoryApplyToFace(f,apodHistoryIdx);
    } else if(apodHistoryPixels[apodHistoryIdx]==='error'){
      const entry=apodHistory[apodHistoryIdx]||{};
      for(let f=0;f<6;f++) if(f!==1) renderTextToFace(f,['NO IMAGE',entry.date||''],[0.6,0.4,0.1],[0.06,0.03,0]);
    } else {
      const dots='.'.repeat(1+(Math.floor(apodT)%3));
      for(let f=0;f<6;f++) if(f!==1) renderTextToFace(f,['APOD',dots],[0.35,0.65,1],[0,0,0.06]);
    }
  } else {
    // Single image mode
    if(!apodData && !apodFetching && (Date.now()/1000-apodLastFetch)>86400) apodFetch();
    if(apodError && !apodFetching && (Date.now()/1000-apodLastFetch)>=apodRetryAfter){
      apodError=''; apodLastFetch=0; apodFetch();
    }
    if(apodImgReady){
      for(let f=0;f<6;f++) if(f!==1) apodApplyImageToFace(f);
    } else if(apodError){
      // Show static "API" / "ERROR" lines then scrolling message; dots show we're waiting to retry
      const waitLeft=Math.max(0,Math.ceil(apodRetryAfter-(Date.now()/1000-apodLastFetch)));
      const retryDots=waitLeft>0?'.'.repeat(1+(Math.floor(apodT)%3)):'';
      for(let f=0;f<6;f++) if(f!==1) renderTextToFace(f,['API','ERROR',apodError+(retryDots?' '+retryDots:'')],[1,0.25,0.25],[0.06,0,0]);
    } else if(apodImgError){
      for(let f=0;f<6;f++) if(f!==1) renderTextToFace(f,['IMAGE','ERROR'],[1,0.4,0.1],[0.06,0.02,0]);
    } else {
      const dots='.'.repeat(1+(Math.floor(apodT)%3));
      for(let f=0;f<6;f++) if(f!==1) renderTextToFace(f,['APOD',dots],[0.35,0.65,1],[0,0,0.06]);
    }
  }

  if(!is2D){
    if(!apodTickerPixels) apodBuildTicker();
    apodTickerScrollX += dt*20*(speedMult||1);
    apodApplyTickerToFace(1);
  }
}

// ═══════════════════════════════════════════════════
//  Unsplash Photo Slideshow
// ═══════════════════════════════════════════════════
let unsplashPhotos=[], unsplashIdx=0, unsplashFetching=false, unsplashLastFetch=0, unsplashError='';
let unsplashPixels=[], unsplashSizes=[], unsplashT=0, unsplashTimer=0, unsplashSecs=8;
let unsplashQuery='nature', unsplashLetterbox=true;
// Per-face staggered slideshow state for full-cube mode — see
// galleryInitFaceState/gallerySlideshowStep above for the shared engine.
let unsplashFaceState=null;
const UNSPLASH_FADE_DUR=1.0;
function unsplashInitFaceState(){
  unsplashFaceState=galleryInitFaceState(unsplashPhotos.length, unsplashSecs);
}

function unsplashApiKey(){ return localStorage.getItem('unsplashApiKey')||''; }

async function unsplashFetch(){
  if(unsplashFetching) return;
  const key=unsplashApiKey();
  if(!key){ unsplashError='Enter your Unsplash Access Key below'; return; }
  unsplashFetching=true; unsplashError='';
  const statusEl=document.getElementById('unsplash-status');
  if(statusEl) statusEl.textContent='Searching Unsplash…';
  try{
    const q=encodeURIComponent(unsplashQuery||'nature');
    const url=`https://api.unsplash.com/photos/random?query=${q}&count=30&client_id=${key}`;
    let r;
    try{ r=await fetch(url); }
    catch(fe){ unsplashError='Network error — check connection'; throw fe; }
    if(r.status===401){ unsplashError='Invalid API key'; throw new Error('401'); }
    if(r.status===403){ unsplashError='Rate limited — 50 req/hr on free tier'; throw new Error('403'); }
    if(!r.ok){ unsplashError='Unsplash error '+r.status; throw new Error(r.status); }
    const data=await r.json();
    const photos=(Array.isArray(data)?data:[]).filter(p=>p.urls&&p.urls.regular);
    if(!photos.length){ unsplashError='No photos found for "'+unsplashQuery+'"'; throw new Error('empty'); }
    unsplashPhotos=photos;
    unsplashIdx=0;
    unsplashPixels=new Array(photos.length).fill(null);
    unsplashSizes=new Array(photos.length).fill(0);
    unsplashLastFetch=Date.now()/1000;
    unsplashTimer=0;
    unsplashFaceState=null;
    if(statusEl) statusEl.textContent=photos.length+' photos — '+unsplashQuery;
    const infoEl=document.getElementById('unsplash-info');
    if(infoEl){ infoEl.style.display='block'; unsplashUpdateInfo(); }
    unsplashLoad(0);
  }catch(e){
    unsplashLastFetch=Date.now()/1000;
    if(statusEl) statusEl.textContent='✕ '+unsplashError;
    console.error('Unsplash fetch error:',e);
  }
  unsplashFetching=false;
}

function unsplashLoad(idx){
  if(!unsplashPhotos[idx]||unsplashPixels[idx]!=null) return;
  unsplashPixels[idx]=false;
  const sz=Math.max(SIZE,32);
  const imgUrl=unsplashPhotos[idx].urls.regular+'&w='+(sz*4)+'&h='+(sz*4);
  loadImageForPixels(imgUrl, s=>{ unsplashSizes[idx]=s; },
    px=>{ unsplashPixels[idx]=px; },
    ()=>{ unsplashPixels[idx]='error'; },
    {letterbox:unsplashLetterbox});
}

function unsplashApplyToFace(face, idx){
  return galleryApplyToFace(unsplashPixels, unsplashSizes, face, idx);
}
function unsplashApplyBlendToFace(face, idxA, idxB, alpha){
  return galleryApplyBlendToFace(unsplashPixels, unsplashSizes, face, idxA, idxB, alpha);
}

function unsplashUpdateInfo(){
  const p=unsplashPhotos[unsplashIdx]; if(!p) return;
  const infoEl=document.getElementById('unsplash-photo-info');
  if(infoEl) infoEl.textContent=(unsplashIdx+1)+'/'+unsplashPhotos.length+' — '+(p.user&&p.user.name?p.user.name:'Unknown')+' — '+(p.description||p.alt_description||'');
}

document.getElementById('unsplash-fetch-btn')?.addEventListener('click',unsplashFetch);
function unsplashGoPrev(){
  if(!unsplashPhotos.length) return;
  unsplashIdx=(unsplashIdx-1+unsplashPhotos.length)%unsplashPhotos.length;
  unsplashLoad(unsplashIdx); unsplashTimer=0; unsplashUpdateInfo();
}
function unsplashGoNext(){
  if(!unsplashPhotos.length) return;
  unsplashIdx=(unsplashIdx+1)%unsplashPhotos.length;
  unsplashLoad(unsplashIdx); unsplashTimer=0; unsplashUpdateInfo();
}
function unsplashSetSpeed(v){ unsplashSecs=v; }
function unsplashSetLetterbox(v){
  unsplashLetterbox=v;
  unsplashPixels=new Array(unsplashPhotos.length).fill(null);
  unsplashSizes=new Array(unsplashPhotos.length).fill(0);
  unsplashLoad(unsplashIdx);
}
document.getElementById('unsplash-api-key-save')?.addEventListener('click',()=>{
  const v=document.getElementById('unsplash-api-key-input')?.value.trim();
  if(v){ localStorage.setItem('unsplashApiKey',v); unsplashFetch(); }
});
(()=>{
  const saved=localStorage.getItem('unsplashApiKey');
  if(saved){ const el=document.getElementById('unsplash-api-key-input'); if(el) el.value=saved; }
  const q=localStorage.getItem('unsplashQuery');
  if(q){ unsplashQuery=q; const el=document.getElementById('unsplash-query'); if(el) el.value=q; }
  document.getElementById('unsplash-query')?.addEventListener('change',function(){
    unsplashQuery=this.value.trim()||'nature';
    localStorage.setItem('unsplashQuery',unsplashQuery);
  });
})();

function effectUnsplash(dt){
  unsplashT+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  if(!unsplashPhotos.length){
    if(!unsplashFetching) unsplashFetch();
    const dots='.'.repeat(1+(Math.floor(unsplashT)%3));
    for(let f=0;f<6;f++) renderTextToFace(f,['UNSPLASH',dots],[0.1,0.7,0.4],[0,0.06,0.03]);
    return;
  }

  if(unsplashError){
    for(let f=0;f<6;f++) renderTextToFace(f,['API','ERROR',unsplashError],[1,0.25,0.25],[0.06,0,0]);
    return;
  }

  if(artSlideshowOn){
    unsplashTimer+=dt;
    if(unsplashTimer>=unsplashSecs){
      unsplashTimer=0;
      unsplashIdx=(unsplashIdx+1)%unsplashPhotos.length;
      unsplashUpdateInfo();
      const statusEl=document.getElementById('unsplash-status');
      const p=unsplashPhotos[unsplashIdx];
      if(statusEl&&p) statusEl.textContent=(p.description||p.alt_description||'Photo '+(unsplashIdx+1));
    }
  }

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  if(is2D){
    // Preload next
    unsplashLoad(unsplashIdx);
    unsplashLoad((unsplashIdx+1)%unsplashPhotos.length);
    const shown=unsplashApplyToFace(0,unsplashIdx);
    if(!shown){
      if(unsplashPixels[unsplashIdx]==='error'){
        renderTextToFace(0,['NO IMAGE','photo '+(unsplashIdx+1)],[0.6,0.4,0.1],[0.06,0.03,0]);
      } else {
        const dots='.'.repeat(1+(Math.floor(unsplashT)%3));
        renderTextToFace(0,['PHOTO',dots],[0.1,0.7,0.4],[0,0.06,0.03]);
      }
    }
    return;
  }

  // Full cube: each face shows a different photo and cycles on its own
  // staggered schedule (offset unsplashSecs/6 apart), crossfading into its
  // next photo over UNSPLASH_FADE_DUR seconds instead of cutting instantly.
  const n=unsplashPhotos.length;
  if(!unsplashFaceState || unsplashFaceState.length!==6) unsplashInitFaceState();
  for(let f=0;f<6;f++){
    const st=unsplashFaceState[f];
    gallerySlideshowStep(st, n, dt, unsplashSecs, UNSPLASH_FADE_DUR, artSlideshowOn, unsplashLoad, unsplashPixels);

    let shown;
    if(st.fadeT>0 && st.nextIdx!=null){
      shown=unsplashApplyBlendToFace(f, st.curIdx, st.nextIdx, Math.min(1,st.fadeT/UNSPLASH_FADE_DUR));
    } else {
      shown=unsplashApplyToFace(f, st.curIdx);
    }
    if(!shown){
      if(unsplashPixels[st.curIdx]==='error'){
        renderTextToFace(f,['NO IMAGE','photo '+(st.curIdx+1)],[0.6,0.4,0.1],[0.06,0.03,0]);
      } else {
        const dots='.'.repeat(1+(Math.floor(unsplashT)%3));
        renderTextToFace(f,['PHOTO',dots],[0.1,0.7,0.4],[0,0.06,0.03]);
      }
    }
  }
}

// ═══════════════════════════════════════════════════
//  Metropolitan Museum of Art — public domain art gallery
// ═══════════════════════════════════════════════════
// Switched from the Art Institute of Chicago's IIIF image server, whose
// images 403'd through every fetch strategy tried (direct fetch, direct
// <img>, proxied fetch, proxied <img>) — that pattern points at hotlink/
// referrer protection on their CDN we can't work around client-side. The
// Met's collection API image URLs are widely used in browser/canvas
// contexts with no such restriction.
let articWorks=[], articIdx=0, articFetching=false, articError='';
let articPixels=[], articSizes=[], articT=0, articTimer=0, articSecs=10;
let articQuery='', articLetterbox=true;
const MET_API='https://collectionapi.metmuseum.org/public/collection/v1';
// Per-face staggered slideshow state — see galleryInitFaceState/
// gallerySlideshowStep (shared engine, defined above the Unsplash section).
let articFaceState=null;
const ARTIC_FADE_DUR=1.0;
function articInitFaceState(){
  articFaceState=galleryInitFaceState(articWorks.length, articSecs);
}

async function articFetch(){
  if(articFetching) return;
  articFetching=true; articError='';
  const statusEl=document.getElementById('artic-status');
  if(statusEl) statusEl.textContent='Searching the collection…';
  try{
    const q=(articQuery||'').trim() || 'painting';
    const searchUrl=`${MET_API}/search?hasImages=true&q=${encodeURIComponent(q)}`;
    let r;
    try{ r=await fetch(searchUrl); }
    catch(fe){ articError='Network error — check internet connection'; throw fe; }
    if(!r.ok){ articError='Met API error '+r.status; throw new Error(String(r.status)); }
    const searchJson=await r.json();
    let ids=searchJson.objectIDs||[];
    if(!ids.length){ articError='No results found for "'+q+'"'; throw new Error('empty'); }
    for(let i=ids.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [ids[i],ids[j]]=[ids[j],ids[i]]; }
    const sample=ids.slice(0,40);
    const details=await Promise.all(sample.map(id=>
      fetch(`${MET_API}/objects/${id}`).then(rr=>rr.ok?rr.json():null).catch(()=>null)
    ));
    const works=details.filter(d=>d && d.isPublicDomain && d.primaryImageSmall).map(d=>({
      id:d.objectID, title:d.title||'Untitled', artist_display:d.artistDisplayName||'Unknown artist', imageUrl:d.primaryImageSmall
    }));
    if(!works.length){ articError='No public-domain images found for "'+q+'"'; throw new Error('empty'); }
    articWorks=works;
    articIdx=0;
    articPixels=new Array(works.length).fill(null);
    articSizes=new Array(works.length).fill(0);
    articTimer=0;
    articFaceState=null;
    if(statusEl) statusEl.textContent=works.length+' artworks — '+q;
    const infoEl=document.getElementById('artic-info');
    if(infoEl){ infoEl.style.display='block'; articUpdateInfo(); }
    articLoad(0);
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+articError;
    console.error('Met API fetch error:',e);
  }
  articFetching=false;
}

function articLoad(idx){
  if(!articWorks[idx]||articPixels[idx]!=null) return;
  articPixels[idx]=false;
  const imgUrl=articWorks[idx].imageUrl;
  loadImageForPixels(imgUrl, s=>{ articSizes[idx]=s; },
    px=>{ articPixels[idx]=px; },
    (err)=>{
      articPixels[idx]='error';
      const statusEl=document.getElementById('artic-status');
      if(statusEl && idx===articIdx) statusEl.textContent='✕ Image load failed: '+(err&&err.message||'unknown error');
      console.error('[artic] image load failed for', articWorks[idx].title, imgUrl, err);
    },
    {letterbox:articLetterbox});
}

function articApplyToFace(face, idx){
  return galleryApplyToFace(articPixels, articSizes, face, idx);
}
function articApplyBlendToFace(face, idxA, idxB, alpha){
  return galleryApplyBlendToFace(articPixels, articSizes, face, idxA, idxB, alpha);
}

function articUpdateInfo(){
  const w=articWorks[articIdx]; if(!w) return;
  const infoEl=document.getElementById('artic-work-info');
  if(infoEl) infoEl.textContent=(articIdx+1)+'/'+articWorks.length+' — '+(w.title||'Untitled')+' — '+(w.artist_display||'Unknown artist').split('\n')[0];
}

document.getElementById('artic-fetch-btn')?.addEventListener('click',articFetch);
function articGoPrev(){
  if(!articWorks.length) return;
  articIdx=(articIdx-1+articWorks.length)%articWorks.length;
  articLoad(articIdx); articTimer=0; articUpdateInfo();
}
function articGoNext(){
  if(!articWorks.length) return;
  articIdx=(articIdx+1)%articWorks.length;
  articLoad(articIdx); articTimer=0; articUpdateInfo();
}
function articSetSpeed(v){ articSecs=v; }
function articSetLetterbox(v){
  articLetterbox=v;
  articPixels=new Array(articWorks.length).fill(null);
  articSizes=new Array(articWorks.length).fill(0);
  articLoad(articIdx);
}
(()=>{
  document.getElementById('artic-query')?.addEventListener('change',function(){
    articQuery=this.value.trim();
  });
})();

// ═══════════════════════════════════════════════════
//  Shared "Art" submenu controls — one letterbox checkbox, speed slider,
//  and prev/next pair drive whichever of APOD / Unsplash / Art Gallery is
//  currently the active effect, instead of each having its own duplicate.
// ═══════════════════════════════════════════════════
const ART_EFFECTS=['apod','unsplash','artic'];
// Single global toggle (not per-effect) — whichever of the three is active,
// checking it off freezes on the current image until Prev/Next is pressed
// manually; checking it on resumes auto-advancing.
let artSlideshowOn=true;
document.getElementById('art-slideshow-chk')?.addEventListener('change',function(){
  artSlideshowOn=this.checked;
  if(artSlideshowOn && currentEffect==='apod' && !apodHistory.length && !apodHistoryFetching){
    apodBrowsingHistory=true;
    apodFetchHistory();
  }
});
function artSyncSharedControls(){
  if(!ART_EFFECTS.includes(currentEffect)) return;
  const slideshowChk=document.getElementById('art-slideshow-chk');
  if(slideshowChk) slideshowChk.checked=artSlideshowOn;
  const chk=document.getElementById('art-letterbox-chk');
  const speed=document.getElementById('art-speed');
  const speedLbl=document.getElementById('art-speed-label');
  let letterbox, secs;
  if(currentEffect==='apod'){ letterbox=apodLetterbox; secs=apodSlideshowSecs; }
  else if(currentEffect==='unsplash'){ letterbox=unsplashLetterbox; secs=unsplashSecs; }
  else { letterbox=articLetterbox; secs=articSecs; }
  if(chk) chk.checked=letterbox;
  if(speed) speed.value=secs;
  if(speedLbl) speedLbl.textContent=secs+'s';
}
document.getElementById('art-letterbox-chk')?.addEventListener('change',function(){
  if(currentEffect==='apod') apodSetLetterbox(this.checked);
  else if(currentEffect==='unsplash') unsplashSetLetterbox(this.checked);
  else if(currentEffect==='artic') articSetLetterbox(this.checked);
});
document.getElementById('art-speed')?.addEventListener('input',function(){
  const v=+this.value;
  const lbl=document.getElementById('art-speed-label');
  if(lbl) lbl.textContent=v+'s';
  if(currentEffect==='apod') apodSetSpeed(v);
  else if(currentEffect==='unsplash') unsplashSetSpeed(v);
  else if(currentEffect==='artic') articSetSpeed(v);
});
document.getElementById('art-prev-btn')?.addEventListener('click',()=>{
  if(currentEffect==='apod') apodGoPrev();
  else if(currentEffect==='unsplash') unsplashGoPrev();
  else if(currentEffect==='artic') articGoPrev();
});
document.getElementById('art-next-btn')?.addEventListener('click',()=>{
  if(currentEffect==='apod') apodGoNext();
  else if(currentEffect==='unsplash') unsplashGoNext();
  else if(currentEffect==='artic') articGoNext();
});

function effectArtic(dt){
  articT+=dt;
  for(let i=0;i<N*3;i++) colBuf[i]=0;

  if(!articWorks.length){
    if(!articFetching) articFetch();
    const dots='.'.repeat(1+(Math.floor(articT)%3));
    for(let f=0;f<6;f++) renderTextToFace(f,['ART','GALLERY',dots],[0.7,0.55,0.15],[0.06,0.04,0]);
    return;
  }

  if(articError){
    for(let f=0;f<6;f++) renderTextToFace(f,['API','ERROR',articError],[1,0.25,0.25],[0.06,0,0]);
    return;
  }

  if(artSlideshowOn){
    articTimer+=dt;
    if(articTimer>=articSecs){
      articTimer=0;
      articIdx=(articIdx+1)%articWorks.length;
      articUpdateInfo();
    }
  }

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  if(is2D){
    articLoad(articIdx);
    articLoad((articIdx+1)%articWorks.length);
    const shown=articApplyToFace(0,articIdx);
    if(!shown){
      if(articPixels[articIdx]==='error'){
        renderTextToFace(0,['NO IMAGE','artwork '+(articIdx+1)],[0.6,0.4,0.1],[0.06,0.03,0]);
      } else {
        const dots='.'.repeat(1+(Math.floor(articT)%3));
        renderTextToFace(0,['LOADING',dots],[0.7,0.55,0.15],[0.06,0.04,0]);
      }
    }
    return;
  }

  // Full cube: each face shows a different artwork and cycles on its own
  // staggered schedule, crossfading into its next artwork — same approach
  // as the Unsplash effect.
  const n=articWorks.length;
  if(!articFaceState || articFaceState.length!==6) articInitFaceState();
  for(let f=0;f<6;f++){
    const st=articFaceState[f];
    gallerySlideshowStep(st, n, dt, articSecs, ARTIC_FADE_DUR, artSlideshowOn, articLoad, articPixels);

    let shown;
    if(st.fadeT>0 && st.nextIdx!=null){
      shown=articApplyBlendToFace(f, st.curIdx, st.nextIdx, Math.min(1,st.fadeT/ARTIC_FADE_DUR));
    } else {
      shown=articApplyToFace(f, st.curIdx);
    }
    if(!shown){
      if(articPixels[st.curIdx]==='error'){
        renderTextToFace(f,['NO IMAGE','artwork '+(st.curIdx+1)],[0.6,0.4,0.1],[0.06,0.03,0]);
      } else {
        const dots='.'.repeat(1+(Math.floor(articT)%3));
        renderTextToFace(f,['LOADING',dots],[0.7,0.55,0.15],[0.06,0.04,0]);
      }
    }
  }
}

// ═══════════════════════════════════════════════════
//  Dad Jokes (icanhazdadjoke.com)
// ═══════════════════════════════════════════════════
let jokeText='', jokeFetching=false, jokeError='', jokeT=0;
let jokeCascade=null, jokeCascadeForText='';

async function jokeFetch(){
  if(jokeFetching) return;
  jokeFetching=true; jokeError='';
  const statusEl=document.getElementById('joke-status');
  if(statusEl) statusEl.textContent='Fetching a joke…';
  try{
    let r;
    try{ r=await fetch('https://icanhazdadjoke.com/', {headers:{'Accept':'application/json'}}); }
    catch(fe){ jokeError='Network error — check internet connection'; throw fe; }
    if(!r.ok){ jokeError='Joke API error '+r.status; throw new Error(String(r.status)); }
    const d=await r.json();
    jokeText=(d.joke||'').trim();
    if(!jokeText){ jokeError='Empty response'; throw new Error('empty'); }
    if(statusEl) statusEl.textContent='Got one!';
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+jokeError;
    console.error('Joke fetch error:',e);
  }
  jokeFetching=false;
}
document.getElementById('joke-fetch-btn')?.addEventListener('click',jokeFetch);

// Tag each word as setup/question (before/including the "?") or answer
// (after it), so the answer can be rendered in a distinct color — white for
// setup, amber for answer. Shared by Jokes and Trivia (same text style).
// Text without a "?" has no answer split — everything renders as setup color.

function effectJoke(dt){
  jokeT+=dt;
  if(!jokeText && !jokeFetching) jokeFetch();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  const faces=is2D?[0]:[0,1,2,3,4,5];

  if(!jokeText){
    const dots='.'.repeat(1+(Math.floor(jokeT)%3));
    for(const f of faces) renderTextToFace(f,['LOADING','JOKE'+dots],[0.9,0.75,0.2],[0.06,0.05,0]);
    return;
  }
  if(jokeError){
    for(const f of faces) renderTextToFace(f,['API','ERROR',jokeError],[1,0.25,0.25],[0.06,0,0]);
    return;
  }

  if(jokeCascadeForText!==jokeText){
    jokeCascade=wcInit(wcTagQA(jokeText));
    jokeCascadeForText=jokeText;
  }
  wcStep(jokeCascade, dt);
  const targetFace=is2D?0:1;
  wcDrawToFace(jokeCascade, targetFace);

  // Once the whole joke has been revealed and held on screen a moment,
  // fetch a new one.
  if(jokeCascade.done && tfAutoOn && jokeCascade.holdTimer>tfHoldSecs && !jokeFetching) jokeFetch();
}

// ═══════════════════════════════════════════════════
//  Trivia (Open Trivia DB, free, no key) — same word-cascade text style
//  as Jokes: question in white, answer in amber, split on the "?".
// ═══════════════════════════════════════════════════
let triviaText='', triviaFetching=false, triviaError='', triviaT=0;
let triviaCascade=null, triviaCascadeForText='';

function wcDecodeEntities(str){
  const ta=document.createElement('textarea');
  ta.innerHTML=str;
  return ta.value;
}

async function triviaFetch(){
  if(triviaFetching) return;
  triviaFetching=true; triviaError='';
  const statusEl=document.getElementById('trivia-status');
  if(statusEl) statusEl.textContent='Fetching a question…';
  try{
    let r;
    try{ r=await fetch('https://opentdb.com/api.php?amount=1&type=multiple'); }
    catch(fe){ triviaError='Network error — check internet connection'; throw fe; }
    if(!r.ok){ triviaError='Trivia API error '+r.status; throw new Error(String(r.status)); }
    const d=await r.json();
    const q=(d.results||[])[0];
    if(!q){ triviaError='No question returned'; throw new Error('empty'); }
    const question=wcDecodeEntities(q.question||'').trim();
    const answer=wcDecodeEntities(q.correct_answer||'').trim();
    triviaText=(question.endsWith('?')?question:question+'?')+' '+answer;
    if(statusEl) statusEl.textContent='Got one!';
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+triviaError;
    console.error('Trivia fetch error:',e);
  }
  triviaFetching=false;
}
document.getElementById('trivia-fetch-btn')?.addEventListener('click',triviaFetch);

function effectTrivia(dt){
  triviaT+=dt;
  if(!triviaText && !triviaFetching) triviaFetch();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;
  const faces=is2D?[0]:[0,1,2,3,4,5];

  if(!triviaText){
    const dots='.'.repeat(1+(Math.floor(triviaT)%3));
    for(const f of faces) renderTextToFace(f,['LOADING','TRIVIA'+dots],[0.9,0.75,0.2],[0.06,0.05,0]);
    return;
  }
  if(triviaError){
    for(const f of faces) renderTextToFace(f,['API','ERROR',triviaError],[1,0.25,0.25],[0.06,0,0]);
    return;
  }

  if(triviaCascadeForText!==triviaText){
    triviaCascade=wcInit(wcTagQA(triviaText));
    triviaCascadeForText=triviaText;
  }
  wcStep(triviaCascade, dt);
  const targetFace=is2D?0:1;
  wcDrawToFace(triviaCascade, targetFace);

  // Once the question+answer has been fully revealed and held a moment,
  // fetch a new one.
  if(triviaCascade.done && tfAutoOn && triviaCascade.holdTimer>tfHoldSecs && !triviaFetching) triviaFetch();
}

// ═══════════════════════════════════════════════════
//  Shared "Trivia & Facts" controls — Jokes and Trivia share one
//  Auto/Static toggle and hold-time slider instead of each having its own.
//  Static just means the fully-revealed cascade never triggers a refetch —
//  it stays put until the user presses the New Joke/Question button.
// ═══════════════════════════════════════════════════
const TF_EFFECTS=['joke','trivia'];
let tfAutoOn=true, tfHoldSecs=5;
document.getElementById('tf-auto-chk')?.addEventListener('change',function(){
  tfAutoOn=this.checked;
});
document.getElementById('tf-speed')?.addEventListener('input',function(){
  tfHoldSecs=+this.value;
  const lbl=document.getElementById('tf-speed-label');
  if(lbl) lbl.textContent=tfHoldSecs+'s';
});
function tfSyncSharedControls(){
  if(!TF_EFFECTS.includes(currentEffect)) return;
  const chk=document.getElementById('tf-auto-chk');
  const speed=document.getElementById('tf-speed');
  const speedLbl=document.getElementById('tf-speed-label');
  if(chk) chk.checked=tfAutoOn;
  if(speed) speed.value=tfHoldSecs;
  if(speedLbl) speedLbl.textContent=tfHoldSecs+'s';
}

// ═══════════════════════════════════════════════════
//  On This Day — Wikipedia historical events (free, no key)
// ═══════════════════════════════════════════════════
let otdEvents=[], otdFetching=false, otdError='', otdT=0, otdFetchedFor='';
let otdIdx=0;
let otdCascade=null, otdCascadeForKey='';

async function otdFetch(){
  if(otdFetching) return;
  otdFetching=true; otdError='';
  const statusEl=document.getElementById('otd-status');
  if(statusEl) statusEl.textContent='Fetching today in history…';
  try{
    const now=new Date();
    const mm=String(now.getMonth()+1).padStart(2,'0'), dd=String(now.getDate()).padStart(2,'0');
    otdFetchedFor=mm+'-'+dd;
    const url=`https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/${mm}/${dd}`;
    let r;
    try{ r=await fetch(url, {headers:{'Accept':'application/json'}}); }
    catch(fe){ otdError='Network error — check internet connection'; throw fe; }
    if(!r.ok){ otdError='Wikipedia API error '+r.status; throw new Error(String(r.status)); }
    const d=await r.json();
    const events=(d.events||[]).filter(e=>e.text).sort((a,b)=>(b.year||0)-(a.year||0));
    if(!events.length){ otdError='No events found'; throw new Error('empty'); }
    otdEvents=events.slice(0,20);
    if(statusEl) statusEl.textContent=otdEvents.length+' events for today';
    const infoEl=document.getElementById('otd-info');
    if(infoEl){
      infoEl.style.display='block';
      const cl=document.getElementById('otd-count-line');
      if(cl) cl.textContent=otdEvents.length+' historical events';
    }
  }catch(e){
    if(statusEl) statusEl.textContent='✕ '+otdError;
    console.error('On This Day fetch error:',e);
  }
  otdFetching=false;
}
document.getElementById('otd-fetch-btn')?.addEventListener('click',otdFetch);

function otdBuildTitleBuf(){
  const S=Math.max(SIZE,16);
  const c=document.createElement('canvas');
  c.width=S; c.height=S;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#000'; ctx.fillRect(0,0,S,S);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const now=new Date();
  const monthNames=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  ctx.fillStyle='#fff';
  ctx.font=`bold ${Math.max(6,(S*0.14)|0)}px Arial,sans-serif`;
  ctx.fillText('ON THIS DAY', S/2, S*0.2);
  ctx.fillStyle='#7ad0ff';
  ctx.font=`bold ${Math.max(10,(S*0.26)|0)}px Arial,sans-serif`;
  ctx.fillText(monthNames[now.getMonth()]+' '+now.getDate(), S/2, S*0.48);
  ctx.fillStyle='#bbb';
  ctx.font=`${Math.max(5,(S*0.1)|0)}px Arial,sans-serif`;
  ctx.fillText(otdEvents.length+' events in history', S/2, S*0.74);
  return {data: ctx.getImageData(0,0,S,S).data, S};
}

function effectOnThisDay(dt){
  otdT+=dt;
  const now=new Date();
  const mm=String(now.getMonth()+1).padStart(2,'0'), dd=String(now.getDate()).padStart(2,'0');
  if((!otdEvents.length||otdFetchedFor!==mm+'-'+dd) && !otdFetching) otdFetch();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;

  if(!otdEvents.length){
    const dots='.'.repeat(1+(Math.floor(otdT)%3));
    const faces=is2D?[0]:[0,1,2,3,4,5];
    for(const f of faces) renderTextToFace(f,['ON THIS','DAY'+dots],[0.3,0.65,0.95],[0,0.03,0.06]);
    return;
  }
  if(otdError){
    const faces=is2D?[0]:[0,1,2,3,4,5];
    for(const f of faces) renderTextToFace(f,['API','ERROR',otdError],[1,0.25,0.25],[0.06,0,0]);
    return;
  }

  // Cycle through events one at a time, each revealed word by word.
  if(otdIdx>=otdEvents.length) otdIdx=0;
  const curEvent=otdEvents[otdIdx];
  const wrapKey=otdIdx+'|'+otdEvents.length;
  if(otdCascadeForKey!==wrapKey){
    const tagged=[{w:`${curEvent.year}:`,color:[1,0.8,0.27]}, ...curEvent.text.split(/\s+/).filter(Boolean).map(w=>({w,color:[0.48,0.82,1]}))];
    otdCascade=wcInit(tagged);
    otdCascadeForKey=wrapKey;
  }
  wcStep(otdCascade, dt);
  const targetFace=is2D?0:1;
  wcDrawToFace(otdCascade, targetFace);

  // Once the current event has been fully revealed and held a moment,
  // advance to the next one.
  if(otdCascade.done && otdCascade.holdTimer>2.5) otdIdx=(otdIdx+1)%otdEvents.length;

  if(is2D) return;
  // Face 4: title card with today's date + event count
  const {data,S}=otdBuildTitleBuf();
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sv=S-1-v;
      const pi=(sv*S+u)*4;
      const idx=faceMap[4][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=data[pi]/255;
      colBuf[idx*3+1]=data[pi+1]/255;
      colBuf[idx*3+2]=data[pi+2]/255;
    }
  }
  // Twinkling starfield backdrop on remaining side faces
  const tt=Date.now()*0.001;
  for(const face of [0,2,3]){
    for(let v=0;v<SIZE;v++){
      for(let u=0;u<SIZE;u++){
        const idx=faceMap[face][v*SIZE+u]; if(idx<0) continue;
        const seed=((idx*2654435761)>>>0)/4294967296;
        if(seed<0.012){
          const twinkle=0.3+0.7*Math.abs(Math.sin(tt*1.4+seed*60));
          const br=seed*30*twinkle;
          colBuf[idx*3]=br; colBuf[idx*3+1]=br; colBuf[idx*3+2]=br*1.1;
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════
//  Earth Full-Disk Imagery (NASA EPIC)
// ═══════════════════════════════════════════════════
let epicData=null, epicFetching=false, epicLastFetch=0, epicError='', epicImgError='', epicRetryAfter=60;
let epicImgReady=false, epicImgPixels=null, epicImgSize=0;
let epicTickerPixels=null, epicTickerWidth=0, epicTickerScrollX=0, epicT=0;
// Equirectangular globe map (NASA GIBS MODIS — real clouds, ~24hr delay)
let epicEqPixels=null, epicEqWidth=256, epicEqHeight=128;
let epicEqFetching=false, epicEqLastFetch=0, epicEqDate='';

// Current sub-solar position + orthographic camera frame vectors
function epicGetSubSolar(){
  const now=new Date();
  const utcH=now.getUTCHours()+now.getUTCMinutes()/60+now.getUTCSeconds()/3600;
  const start=new Date(Date.UTC(now.getUTCFullYear(),0,0));
  const doy=(now-start)/86400000;
  const decl=-23.45*Math.PI/180*Math.cos(2*Math.PI*(doy+10)/365.25);
  const lonRad=(12-utcH)*15*Math.PI/180; // sub-solar lon: 0° at UTC noon
  const sinL=Math.sin(lonRad),cosL=Math.cos(lonRad);
  const sinD=Math.sin(decl),cosD=Math.cos(decl);
  return{
    rx:-sinL, ry:0, rz:cosL,               // camera right vector (east)
    ux:-sinD*cosL, uy:cosD, uz:-sinD*sinL,  // camera up vector (north)
    fx_:cosD*cosL, fy_:sinD, fz_:cosD*sinL  // camera forward = sub-solar direction
  };
}

// Fetch equirectangular Earth image from NASA GIBS (MODIS true-colour, real clouds)
async function epicFetchEq(){
  if(epicEqFetching) return;
  epicEqFetching=true;
  const now=new Date();
  for(let d=1;d<=4;d++){
    const dt=new Date(now.getTime()-d*86400000);
    const yyyy=dt.getUTCFullYear();
    const mm=String(dt.getUTCMonth()+1).padStart(2,'0');
    const dd=String(dt.getUTCDate()).padStart(2,'0');
    const dateStr=`${yyyy}-${mm}-${dd}`;
    const W=512,H=256;
    const url=`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&FORMAT=image/jpeg&WIDTH=${W}&HEIGHT=${H}&CRS=CRS:84&BBOX=-180,-90,180,90&TIME=${dateStr}`;
    try{
      await new Promise((res,rej)=>{
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{
          const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          ctx.drawImage(img,0,0,W,H);
          try{
            const id=ctx.getImageData(0,0,W,H);
            epicEqPixels=id.data; epicEqWidth=W; epicEqHeight=H;
            epicEqDate=dateStr; epicEqLastFetch=Date.now()/1000;
            const s=document.getElementById('epic-status');
            if(s) s.textContent=`Clouds: MODIS ${dateStr} — rotating to current daylight`;
            res();
          }catch(e){rej(e);}
        };
        img.onerror=rej;
        img.src=url;
      });
      break;
    }catch(e){ /* try previous day */ }
  }
  epicEqFetching=false;
}

// Orthographic globe projection: samples equirectangular map with sub-solar rotation + limb darkening
function epicProjectGlobe(face,rowLimit){
  const S=SIZE, cx0=S/2, cy0=rowLimit?rowLimit/2:S/2;
  const rad=(rowLimit||S)*0.48;
  const sol=epicGetSubSolar();
  const useEq=!!epicEqPixels, useFallback=!!(epicImgReady&&epicImgPixels);
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      if(rowLimit&&v>=rowLimit) continue;
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const dx=u-cx0, dy=v-cy0;
      if(dx*dx+dy*dy>rad*rad) continue;
      const fx=dx/rad, fy=-dy/rad;
      const fz=Math.sqrt(Math.max(0,1-fx*fx-fy*fy));
      // Globe surface point in Earth frame (x=0°lon, y=north, z=90°E)
      const qx=fx*sol.rx+fy*sol.ux+fz*sol.fx_;
      const qy=fx*sol.ry+fy*sol.uy+fz*sol.fy_;
      const qz=fx*sol.rz+fy*sol.uz+fz*sol.fz_;
      let r,g,b;
      if(useEq){
        const lat=Math.asin(Math.max(-1,Math.min(1,qy)));
        const lon=Math.atan2(qz,qx);
        const uf=(lon+Math.PI)/(2*Math.PI)*epicEqWidth;
        const vf=(Math.PI/2-lat)/Math.PI*epicEqHeight;
        // bilinear interpolation
        const u0=Math.max(0,Math.min(epicEqWidth-1,uf|0));
        const u1=Math.min(epicEqWidth-1,u0+1);
        const v0=Math.max(0,Math.min(epicEqHeight-1,vf|0));
        const v1=Math.min(epicEqHeight-1,v0+1);
        const fu=uf-u0, fv=vf-v0;
        const s=(a,b,t)=>a+(b-a)*t;
        const px=(rv,ru)=>epicEqPixels[(rv*epicEqWidth+ru)*4];
        const py=(rv,ru)=>epicEqPixels[(rv*epicEqWidth+ru)*4+1];
        const pz=(rv,ru)=>epicEqPixels[(rv*epicEqWidth+ru)*4+2];
        r=s(s(px(v0,u0),px(v0,u1),fu),s(px(v1,u0),px(v1,u1),fu),fv)/255;
        g=s(s(py(v0,u0),py(v0,u1),fu),s(py(v1,u0),py(v1,u1),fu),fv)/255;
        b=s(s(pz(v0,u0),pz(v0,u1),fu),s(pz(v1,u0),pz(v1,u1),fu),fv)/255;
      }else if(useFallback){
        const IS=epicImgSize;
        const su=Math.min(IS-1,Math.max(0,Math.floor((fx*0.5+0.5)*IS)));
        const sv=Math.min(IS-1,Math.max(0,Math.floor((-fy*0.5+0.5)*IS)));
        const pi=(sv*IS+su)*4;
        r=epicImgPixels[pi]/255; g=epicImgPixels[pi+1]/255; b=epicImgPixels[pi+2]/255;
      }else{
        r=0.04; g=0.12; b=0.3;
      }
      // Limb darkening: subtle darkening near the terminator edge
      const limb=0.55+0.45*fz;
      colBuf[idx*3]=r*limb; colBuf[idx*3+1]=g*limb; colBuf[idx*3+2]=b*limb;
    }
  }
}

async function epicFetch(){
  if(epicFetching) return;
  epicFetching=true; epicError=''; epicImgError='';
  const statusEl=document.getElementById('epic-status');
  if(statusEl) statusEl.textContent='Fetching latest Earth image…';
  try{
    const apiKey=apodApiKey(); // use same NASA key as APOD
    // EPIC imagery often lags 1-3 days — walk back up to 10 days to find latest
    let arr=null;
    for(let daysAgo=0; daysAgo<=10; daysAgo++){
      const d=new Date(); d.setDate(d.getDate()-daysAgo);
      const dateStr=d.toISOString().slice(0,10);
      const url=daysAgo===0
        ?`https://api.nasa.gov/EPIC/api/natural/images?api_key=${apiKey}`
        :`https://api.nasa.gov/EPIC/api/natural/date/${dateStr}?api_key=${apiKey}`;
      let r;
      try{ r=await fetch(url); }catch(fe){ throw new Error('Network error — check connection'); }
      if(r.status===429){ epicRetryAfter=60; throw new Error('Rate limited — enter a free NASA API key'); }
      if(r.status===503||r.status===502||r.status===504){ epicRetryAfter=5; throw new Error('NASA servers down ('+r.status+') — retrying…'); }
      if(r.ok){
        const data=await r.json();
        if(Array.isArray(data)&&data.length){ arr=data; break; }
      }
    }
    if(!arr||!arr.length) throw new Error('No EPIC imagery found in last 10 days');
    if(!arr || !arr.length) throw new Error('No EPIC imagery available right now');
    const item=arr[arr.length-1];
    const d=new Date(item.date.replace(' ','T')+'Z');
    const yyyy=d.getUTCFullYear(), mm=String(d.getUTCMonth()+1).padStart(2,'0'), dd=String(d.getUTCDate()).padStart(2,'0');
    const imgUrl=`https://api.nasa.gov/EPIC/archive/natural/${yyyy}/${mm}/${dd}/png/${item.image}.png?api_key=${apiKey}`;
    epicData={
      caption:item.caption||'Earth from DSCOVR',
      date:item.date,
      lat:item.centroid_coordinates?item.centroid_coordinates.lat:null,
      lon:item.centroid_coordinates?item.centroid_coordinates.lon:null,
      url:imgUrl,
    };
    epicImgReady=false; epicTickerPixels=null;
    epicLastFetch=Date.now()/1000;
    if(statusEl) statusEl.textContent=epicData.caption;
    const infoEl=document.getElementById('epic-info');
    if(infoEl){
      infoEl.style.display='block';
      const dl=document.getElementById('epic-date-line');
      if(dl) dl.textContent='Captured: '+epicData.date+' UTC';
      const cl=document.getElementById('epic-coord-line');
      if(cl) cl.textContent=epicData.lat!=null?`Centroid: ${epicData.lat.toFixed(1)}°, ${epicData.lon.toFixed(1)}°`:'';
    }
    loadImageForPixels(epicData.url, sz=>{
      epicImgSize=sz;
    }, pixels=>{ epicImgPixels=pixels; epicImgReady=true; }, ()=>{
      epicImgReady=false; epicImgError='Could not load image';
      if(statusEl) statusEl.textContent='✕ Could not load Earth image';
    });
  }catch(e){
    epicError=e.message;
    epicLastFetch=Date.now()/1000; // retry in 60s by default
    if(statusEl) statusEl.textContent='✕ '+e.message;
    console.error('EPIC fetch error:',e);
  }
  epicFetching=false;
}
document.getElementById('epic-fetch-btn')?.addEventListener('click',epicFetch);

function epicApplyImageToFace(face, rowLimit){
  const S=SIZE, cx0=S/2;
  const cy0=rowLimit?rowLimit/2:S/2;
  const rad=(rowLimit||S)*0.48;
  if(!epicImgReady||!epicImgPixels){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      if(rowLimit && v>=rowLimit) continue;
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const dx=u-cx0, dy=v-cy0;
      if(dx*dx+dy*dy<rad*rad){ colBuf[idx*3]=0.04; colBuf[idx*3+1]=0.12; colBuf[idx*3+2]=0.3; }
    }
    return;
  }
  const IS=epicImgSize;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      if(rowLimit && v>=rowLimit) continue;
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      const dx=u-cx0, dy=v-cy0;
      if(dx*dx+dy*dy>rad*rad) continue;
      const fx=dx/rad, fy=dy/rad;
      const su=Math.min(IS-1,Math.max(0,Math.floor((fx*0.5+0.5)*IS)));
      const sv=Math.min(IS-1,Math.max(0,Math.floor((-fy*0.5+0.5)*IS)));
      const pi=(sv*IS+su)*4;
      colBuf[idx*3]=epicImgPixels[pi]/255;
      colBuf[idx*3+1]=epicImgPixels[pi+1]/255;
      colBuf[idx*3+2]=epicImgPixels[pi+2]/255;
    }
  }
}

function epicBuildTicker(){
  const text=epicData?`   EARTH NOW   •   ${epicData.date} UTC   •   ${epicData.caption}   `:'   EARTH FULL-DISK IMAGERY   •   LOADING…   ';
  const full=('   '+text).repeat(2);
  const fh=Math.max(8,(SIZE*0.32)|0);
  const oc=document.createElement('canvas');
  const cx=oc.getContext('2d');
  cx.font=`bold ${fh}px "Courier New",monospace`;
  const tw=cx.measureText(full).width|0;
  oc.width=tw+4*SIZE; oc.height=SIZE;
  cx.fillStyle='#000'; cx.fillRect(0,0,oc.width,oc.height);
  cx.fillStyle='#7ab8ff'; cx.font=`bold ${fh}px "Courier New",monospace`;
  cx.textBaseline='middle'; cx.fillText(full,0,SIZE/2);
  epicTickerPixels=cx.getImageData(0,0,oc.width,oc.height).data;
  epicTickerWidth=oc.width;
  epicTickerScrollX=0;
}

function epicApplyTickerToFace(face){
  if(!epicTickerPixels) return;
  const S=SIZE;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sx=(((epicTickerScrollX|0)+u)%epicTickerWidth+epicTickerWidth)%epicTickerWidth;
      const sv=S-1-v;
      const pi=(sv*epicTickerWidth+sx)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=epicTickerPixels[pi]/255;
      colBuf[idx*3+1]=epicTickerPixels[pi+1]/255;
      colBuf[idx*3+2]=epicTickerPixels[pi+2]/255;
    }
  }
}

function effectEPIC(dt){
  epicT+=dt;
  if(!epicData && !epicFetching && (Date.now()/1000-epicLastFetch)>3600) epicFetch();
  if(epicError && !epicFetching && (Date.now()/1000-epicLastFetch)>=epicRetryAfter){
    epicError=''; epicLastFetch=0; epicFetch();
  }

  // Fetch equirectangular globe image (MODIS real clouds, ~24hr) — refresh every 6h
  if(!epicEqPixels&&!epicEqFetching) epicFetchEq();
  if(epicEqLastFetch>0&&(Date.now()/1000-epicEqLastFetch)>6*3600&&!epicEqFetching) epicFetchEq();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;

  if(epicEqPixels||epicImgReady){
    epicProjectGlobe(0);
    if(!is2D) epicProjectGlobe(4);
  } else if(epicError){
    const waitLeft=Math.max(0,Math.ceil(epicRetryAfter-(Date.now()/1000-epicLastFetch)));
    const retryDots=waitLeft>0?'.'.repeat(1+(Math.floor(epicT)%3)):'';
    renderTextToFace(0, ['API','ERROR',epicError+(retryDots?' '+retryDots:'')], [1,0.25,0.25], [0.06,0,0]);
  } else if(epicImgError){
    renderTextToFace(0, ['IMAGE', 'ERROR'], [1,0.4,0.1], [0.06,0.02,0]);
  } else {
    const dots='.'.repeat(1+(Math.floor(epicT)%3));
    renderTextToFace(0, ['EARTH', dots], [0.2,0.7,0.35], [0,0.04,0.06]);
  }

  if(!is2D){
    if(!epicTickerPixels) epicBuildTicker();
    epicTickerScrollX += dt*20*(speedMult||1);
    epicApplyTickerToFace(1);
  }
}

// ═══════════════════════════════════════════════════
//  ISS Live Location Tracker
// ═══════════════════════════════════════════════════
let issLat=0, issLon=0, issTimestamp=0, issFetching=false, issLastFetch=0, issError='';
let issHasFix=false, issT=0, issTrail=[];
let issTickerPixels=null, issTickerWidth=0, issTickerScrollX=0;

async function issFetch(){
  if(issFetching) return;
  issFetching=true; issError='';
  const statusEl=document.getElementById('iss-status');
  try{
    let r;
    try{ r=await fetch('https://api.wheretheiss.at/v1/satellites/25544'); }
    catch(fe){ throw new Error('ISS fetch failed — check internet connection'); }
    if(!r.ok) throw new Error('ISS API error: '+r.status);
    const d=await r.json();
    issLat=parseFloat(d.latitude);
    issLon=parseFloat(d.longitude);
    issTimestamp=d.timestamp||Math.floor(Date.now()/1000);
    issHasFix=true;
    issLastFetch=Date.now()/1000;
    issTrail.push({lat:issLat,lon:issLon});
    if(issTrail.length>30) issTrail.shift();
    issTickerPixels=null;
    if(statusEl) statusEl.textContent=`Tracking — fix at ${new Date(issTimestamp*1000).toLocaleTimeString()}`;
    const infoEl=document.getElementById('iss-info');
    if(infoEl){
      infoEl.style.display='block';
      const ll=document.getElementById('iss-coord-line');
      if(ll) ll.textContent=`Lat ${issLat.toFixed(2)}°  Lon ${issLon.toFixed(2)}°`;
      const tl=document.getElementById('iss-time-line');
      if(tl) tl.textContent='Last fix: '+new Date(issTimestamp*1000).toLocaleTimeString();
    }
    issUpdateCountryFlag();
  }catch(e){
    issError=e.message;
    issLastFetch=Date.now()/1000;
    if(statusEl) statusEl.textContent='✕ '+e.message;
    console.error('ISS fetch error:',e);
  }
  issFetching=false;
}

// ── Country flag currently being overflown ──────────────────────────────────
// Reverse-geocodes the ISS's current lat/lon (BigDataCloud, free/no-key/CORS-
// friendly client-side endpoint) to a country code, then loads that
// country's flag (flagcdn.com, also free/no-key). ~70% of the ISS's ground
// track is over ocean, so "no country" is the common case, not an error.
let issCountryCode='', issCountryName='', issFlagPixels=null, issFlagSize=0;
let issFlagFetching=false, issGeoLastFetch=0;
async function issUpdateCountryFlag(){
  if(issFlagFetching) return;
  const now=Date.now()/1000;
  if(now-issGeoLastFetch<8) return; // throttle — don't hammer the geocoder every 5s tick
  issGeoLastFetch=now;
  issFlagFetching=true;
  try{
    const url=`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${issLat}&longitude=${issLon}&localityLanguage=en`;
    const r=await fetch(url);
    if(!r.ok) throw new Error('geocode HTTP '+r.status);
    const d=await r.json();
    const cc=(d.countryCode||'').toUpperCase();
    if(cc!==issCountryCode){
      issCountryCode=cc;
      issCountryName=d.countryName||'';
      issFlagPixels=null; issFlagSize=0;
      const countryLine=document.getElementById('iss-country-line');
      if(countryLine) countryLine.textContent='Currently over: '+(cc?issCountryName:'International waters');
      if(cc){
        const flagUrl=`https://flagcdn.com/w320/${cc.toLowerCase()}.png`;
        loadImageForPixels(flagUrl, s=>{issFlagSize=s;}, px=>{issFlagPixels=px;}, ()=>{issFlagPixels='error';}, {letterbox:true});
      }
    }
  }catch(e){
    console.warn('[ISS] reverse geocode failed:',e.message);
  }
  issFlagFetching=false;
}
function issApplyFlagToFace(face){
  if(!issFlagPixels||issFlagPixels==='error') return false;
  const S=SIZE, IS=issFlagSize;
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const li=faceMap[face][v*S+u]; if(li<0) continue;
    const su=Math.min(IS-1,Math.floor(u/S*IS));
    const sv=Math.min(IS-1,Math.floor((S-1-v)/S*IS));
    const pi=(sv*IS+su)*4;
    colBuf[li*3]=issFlagPixels[pi]/255;
    colBuf[li*3+1]=issFlagPixels[pi+1]/255;
    colBuf[li*3+2]=issFlagPixels[pi+2]/255;
  }
  return true;
}
document.getElementById('iss-fetch-btn')?.addEventListener('click',issFetch);

// Real digitized world landmass mask (200x100, 1 bit/px, packed MSB-first, base64) —
// replaces the old procedural sine-blob approximation with an actual world map.
const ISS_WORLD_MASK_W = 200, ISS_WORLD_MASK_H = 100;
const ISS_WORLD_MASK_B64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/4AgAAAAAAAAAAAAAAAAAAAAAAAAAAAACf+B+AAAAAACAAAAAAAAAAAAAAAAAAAAAB3+Y/wAAAAAA4AAAAAAAAAAAAAAAAAAABMf+P/wAAAAAADQAA8AAAAAAAAAAAAAAAchn/P/+IAAAAAAEAAGAAAAAAAAAAAAAAAFAB/D//+AAAIAAAQAAAAAAAAAAAAAAAAAAwAPn//+AAAAAAAH4AAAADwQAAAAAAGAAAPsnj///gAOAAAAB+AAPCA/8AAAAAAPwAB4BIQ///wAOAAAAB/gMD/z//AAAAAAP/AA+ALAP//8ADgAAAA/73j////4AAAAAD/8APiQeAf//AAQAAMAf//9////wAAAAAA//gA/NgAD//wAAAAGAH///////8AAAAABv/94PzTwA//4AAAADAD////////AAAAAAf///n8JeAP//AAAAAwA////////4AAAAAB///8/G/gD//gAAAAIEX////////AAAAAA////ixn8A//wAAAACB/////////gAAAAB////+xY/gP/8AAAAAwb////////wAAAAA////P+2Z4D//AAAAAAH///////+8AAAAAP//////sOAf/wAADAAG3//////8MAAAAAB///////DgP/4AAD8AH+///////CAAAAAAfz////+B+H/4AAB/4P/f//////wgAAAAABgf////Z9B/wAAA//P////////gYAAAAAAwD/+f/EHAfwAAAP+P////////gHAAAAAAgAf///gB4HwB4AH3z////////wBwAAAAAAAH///wDAA8AcAD5/////////8AeAAAAAAAA///4A4AOAAAB8//////////ADAAAAAAAAP//+AeABgAAA/PX////////gAwAAAAAAAB///gHkAAAAAPzf////////9AEAAAAAAAAf//+B/AAAAAD8f/////////8AAAAAAAAAH///wf4AAAAQHH//////+///gAAAAAAAAB////f+AAAAECj//////////sAAAAAAAAAf///n/wAAABggf/////////9AAAAAAAAAH///9/+AAABsP///////////AAAAAAAAAA/////+AAAAXP///////////wAAAAAAAAAP//7/4IAAAAn///////////4AAAAAAAAAH//8f+HAAAAD///////////+MAAAAAAAAB///x/wAAAAD////3///////DAAAAAAAAA///6f8AAAAAf//T57//////AAAAAAAAAAP////wAAAAAH9/g+f//////wIAAAAAAAAD////4AAAAAfhnwDj/////+sCAAAAAAAAA////8AAAAAH4M+98f/////BAgAAAAAAAAH///+AAAAAB8Is//H/////+IYAAAAAAAAB////AAAAAAeABP/5//////CcAAAAAAAAAP///wAAAAAAPgAX///////wMAAAAAAAAAB///4AAAAAA/4AB///////+CAAAAAAAAAAX//4AAAAAAf/BAf///////wAAAAAAAAAAB//OAAAAAAP/+f////////8AAAAAAAAAAAv8AgAAAAAD/////v/////+AAAAAAAAAAAB+AIAAAAAB////v5//////gAAAAAAAAAABfgAAAAAAA////7/AH////wAAAAAAAAAAAD4AAAAAAAf////f/g////4AAAAAAAAAAAA+AGAAAAAP////z/4H/j/AAAAAAAAAAAAAHxgGAAAAB////+/8AfwfyAAAAAAAAAAAAA/wAAAAAAf////n+AH4H8AgAAAAAAAAAAAAdAAAAAAP////8+AA8AfwIAAAAAAAAAAAAD4AAAAAD/////uAAOAD8AAAAAAAAAAAAAAEAAAAAAf////8AABgAPAAAAAAAAAAAAAAAh/gAAAD/////+AAYABgAAAAAAAAAAAAAAG/8AAAAf/////AABACAAwAAAAAAAAAAAAAP/wAAAD8////wAAAAQCEAAAAAAAAAAAAAD//gAAAAB///4AAAAWBgAAAAAAAAAAAAAB//4AAAAAf//8AAAADg4AAAAAAAAAAAAAA///AAAAAH//8AAAAA4+AAAAAAAAAAAAAAP//8AAAAB//eAAAAAHHsGAAAAAAAAAAAAD///8AAAAP//AAAAAA4zA+AAAAAAAAAAAA////wAAAB//wAAAAAEAAD8AAAAAAAAAAAH///8AAAAf/8AAAAAAcAAfAAAAAAAAAAAB////AAAAH//AAAAAAAAQAIAAAAAAAAAAAP///gAAAB//4AAAAAAAAAAAAAAAAAAAAAD///wAAAAf/+EAAAAAAAPEAAAAAAAAAAAAf//8AAAAP//jAAAAAAAfjAAAAAAAAAAAAB///AAAAD//jwAAAAAAP84AAAAAAAAAAAAP//wAAAAf/w4AAAAAAH/+AAAAAAAAAAAAD//4AAAAH/4OAAAAAAH//wAAAAAAAAAAAA//8AAAAB//DgAAAAAP//8AAAAAAAAAAAAP/8AAAAAP/gwAAAAAD///gAAAAAAAAAAAD/+AAAAAD/wAAAAAAA///8AAAAAAAAAAAA//gAAAAAf4AAAAAAAP///AAAAAAAAAAAAP/wAAAAAH+AAAAAAAD///wAAAAAAAAAAAD/4AAAAAB/AAAAAAAA///8AAAAAAAAAAAA/+AAAAAAPAAAAAAAAP///AAAAAAAAAAAAP+AAAAAAAAAAAAAAAD4P/gAAAAAAAAAAAD/gAAAAAAAAAAAAAAAgB/wAAAAAAAAAAAA/4AAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAPwAAAAAAAAAAAAAAAAAB+AAgAAAAAAAAAD8AAAAAAAAAAAAAAAAAAfAAIAAAAAAAAAA+AAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAABwAAAAAAAAADwAAAAAAAAAAAAAAAAAAOAAYAAAAAAAAAA+AAAAAAAAAAAAAAAAAADAAcAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAcEAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
let issWorldMaskBits = null;
function issDecodeWorldMask(){
  const bin = atob(ISS_WORLD_MASK_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  issWorldMaskBits = bytes;
}
function issIsLand(lonFrac, latFrac){
  if(!issWorldMaskBits) issDecodeWorldMask();
  const x=Math.min(ISS_WORLD_MASK_W-1, Math.max(0,(lonFrac*ISS_WORLD_MASK_W)|0));
  const y=Math.min(ISS_WORLD_MASK_H-1, Math.max(0,(latFrac*ISS_WORLD_MASK_H)|0));
  const bitIdx=y*ISS_WORLD_MASK_W+x;
  const byte=issWorldMaskBits[bitIdx>>3];
  return ((byte>>(7-(bitIdx&7)))&1)===1;
}

// Map is real-world 2:1 (360°x180°) equirectangular. Squeezing full 360°
// width into a square face at 1:1 either stretches it (v747, distorted) or
// letterboxes it (v748, correct proportions but only half the vertical
// resolution — unrecognizable at LED size). Instead, crop to a 180°-wide
// longitude window centered on the ISS's current position: 180° of
// longitude across the full width + 180° of latitude across the full
// height is a true 1:1 degree-per-pixel aspect ratio, using every row and
// column at full resolution. The visible slice follows the ISS as it moves.
// u: 0=east edge of the 180°-window .. S-1=west edge (descending east->west
// — flipped left-to-right per request). v: 0=north pole .. S-1=south pole
// (ascending top->bottom, standard image convention — row 0 is "up").
function issLonToWindowU(lon, centerLon, S){
  let rel=(centerLon+90)-lon;
  rel=((rel%360)+360)%360;
  if(rel<0||rel>=180) return -1;
  return Math.min(S-1,Math.floor((rel/180)*S));
}
function issLatToV(lat, S){
  return Math.min(S-1,Math.max(0,Math.round(((90-lat)/180)*S)));
}
function issBuildMapBuf(centerLon){
  const S=Math.max(SIZE,16);
  const data=new Uint8ClampedArray(S*S*4);
  for(let v=0;v<S;v++){
    const latFrac=v/S;
    for(let u=0;u<S;u++){
      let lonDeg=centerLon+90-(u/S)*180;
      lonDeg=((lonDeg+180)%360+360)%360-180;
      const lonFrac=(lonDeg+180)/360;
      const land=issIsLand(lonFrac,latFrac);
      const i=(v*S+u)*4;
      if(land){ data[i]=14; data[i+1]=92; data[i+2]=30; }
      else { data[i]=10; data[i+1]=38; data[i+2]=110; }
      data[i+3]=255;
    }
  }
  return {data, S, centerLon};
}
let issMapBuf=null, issMapBuiltCenter=null;
function issGetMapBuf(centerLon){
  const rounded=Math.round(centerLon/5)*5;
  if(!issMapBuf||issMapBuiltCenter!==rounded){
    issMapBuf=issBuildMapBuf(rounded);
    issMapBuiltCenter=rounded;
  }
  return issMapBuf;
}

// faceMap addresses each face as row*SIZE+col where row increases toward the
// PHYSICAL TOP of the cube (see cube.js: y===SIZE-1 is the top face), the
// opposite of standard image/canvas row order (row 0 = top). Every other
// place in this codebase that blits a canvas/data-buffer onto a face (e.g.
// issApplyBufToFace below) flips the source row for exactly this reason —
// this map buffer needs the same correction, which v749 was missing
// (that's what caused "upside down"). Face 1 (back) is also physically
// mirrored left-right on the cube (see faceMap[1] in cube.js), so its
// column also needs flipping — that part shipped in v750.
function issApplyMapToFace(face, rowLimit){
  const mirrorU=(face===1);
  const outCol=u=>mirrorU?(SIZE-1-u):u;
  const centerLon=issHasFix?issLon:0;
  const {data,S}=issGetMapBuf(centerLon);
  const rows=rowLimit||SIZE;
  for(let v=0;v<rows;v++){
    const sv=Math.min(S-1,Math.floor((rows-1-v)/rows*S));
    for(let u=0;u<SIZE;u++){
      const idx=faceMap[face][v*SIZE+outCol(u)]; if(idx<0) continue;
      const su=Math.min(S-1,Math.floor(u/SIZE*S));
      const pi=(sv*S+su)*4;
      colBuf[idx*3]=data[pi]/255;
      colBuf[idx*3+1]=data[pi+1]/255;
      colBuf[idx*3+2]=data[pi+2]/255;
    }
  }
  // Trail + marker — same window projection and row-flip as the map above
  issTrail.forEach((p,pi)=>{
    const u=issLonToWindowU(p.lon,issMapBuiltCenter,SIZE);
    if(u<0) return;
    const dataV=Math.round(issLatToV(p.lat,SIZE)*(rows/SIZE));
    const v=rows-1-dataV;
    if(v<0||v>=rows) return;
    const age=pi/Math.max(1,issTrail.length-1);
    const idx=faceMap[face][v*SIZE+outCol(u)]; if(idx<0) return;
    colBuf[idx*3]=Math.max(colBuf[idx*3],0.5*age);
    colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],0.7*age);
    colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],1*age);
  });
  if(issHasFix){
    const u=issLonToWindowU(issLon,issMapBuiltCenter,SIZE);
    const dataV=Math.round(issLatToV(issLat,SIZE)*(rows/SIZE));
    const v=rows-1-dataV;
    const blink=0.6+0.4*Math.sin(issT*5);
    if(u>=0) for(let dv=-1;dv<=1;dv++) for(let du=-1;du<=1;du++){
      const uu=((u+du)%SIZE+SIZE)%SIZE, vv=v+dv;
      if(vv<0||vv>=rows) continue;
      const idx=faceMap[face][vv*SIZE+outCol(uu)]; if(idx<0) continue;
      colBuf[idx*3]=1*blink; colBuf[idx*3+1]=1*blink; colBuf[idx*3+2]=0.95*blink;
    }
  }
}

function issBuildTitleBuf(){
  const S=Math.max(SIZE,16);
  const c=document.createElement('canvas');
  c.width=S; c.height=S;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#000'; ctx.fillRect(0,0,S,S);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#fff';
  ctx.font=`bold ${Math.max(6,(S*0.16)|0)}px Arial,sans-serif`;
  ctx.fillText('ISS TRACKER', S/2, S*0.2);
  ctx.fillStyle='#7adfff';
  ctx.font=`bold ${Math.max(8,(S*0.16)|0)}px Arial,sans-serif`;
  ctx.fillText(issHasFix?`${issLat.toFixed(1)}°`:'--.-°', S/2, S*0.48);
  ctx.fillText(issHasFix?`${issLon.toFixed(1)}°`:'--.-°', S/2, S*0.66);
  ctx.fillStyle='#bbb';
  ctx.font=`${Math.max(5,(S*0.1)|0)}px Arial,sans-serif`;
  ctx.fillText(issHasFix?'LIVE FIX':'ACQUIRING…', S/2, S*0.86);
  return {data:ctx.getImageData(0,0,S,S).data, S};
}
function issApplyBufToFace(face, buf){
  const {data, S}=buf;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sv=S-1-v;
      const pi=(sv*S+u)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=data[pi]/255;
      colBuf[idx*3+1]=data[pi+1]/255;
      colBuf[idx*3+2]=data[pi+2]/255;
    }
  }
}

function issDrawStation(face){
  const S=SIZE, cx0=S/2, cy0=S/2;
  const ang=issT*0.4;
  const cosA=Math.cos(ang), sinA=Math.sin(ang);
  const drawSeg=(x0,y0,x1,y1,r,g,b)=>{
    const steps=Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)))+1;
    for(let s=0;s<=steps;s++){
      const t=s/steps;
      const x=x0+(x1-x0)*t, y=y0+(y1-y0)*t;
      const rx=cx0+(x-cx0)*cosA-(y-cy0)*sinA;
      const ry=cy0+(x-cx0)*sinA+(y-cy0)*cosA;
      const u=Math.round(rx), v=Math.round(ry);
      if(u<0||u>=S||v<0||v>=S) continue;
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
    }
  };
  const panelW=S*0.34;
  drawSeg(cx0-panelW,cy0,cx0-S*0.06,cy0, 0.15,0.35,0.95);
  drawSeg(cx0+S*0.06,cy0,cx0+panelW,cy0, 0.15,0.35,0.95);
  drawSeg(cx0-S*0.06,cy0-S*0.08,cx0+S*0.06,cy0-S*0.08, 0.9,0.9,0.9);
  drawSeg(cx0-S*0.06,cy0+S*0.08,cx0+S*0.06,cy0+S*0.08, 0.9,0.9,0.9);
  drawSeg(cx0-S*0.06,cy0-S*0.08,cx0-S*0.06,cy0+S*0.08, 0.9,0.9,0.9);
  drawSeg(cx0+S*0.06,cy0-S*0.08,cx0+S*0.06,cy0+S*0.08, 0.9,0.9,0.9);
}

function issBuildTicker(){
  const text=issHasFix
    ? `   ISS LIVE  •  LAT ${issLat.toFixed(2)}°  LON ${issLon.toFixed(2)}°  •  ALTITUDE ~408km  •  SPEED ~27600km/h  •  LAST FIX ${new Date(issTimestamp*1000).toLocaleTimeString()}   `
    : '   ISS TRACKER  •  ACQUIRING SIGNAL…   ';
  const full=('   '+text).repeat(2);
  const fh=Math.max(8,(SIZE*0.32)|0);
  const oc=document.createElement('canvas');
  const cx=oc.getContext('2d');
  cx.font=`bold ${fh}px "Courier New",monospace`;
  const tw=cx.measureText(full).width|0;
  oc.width=tw+4*SIZE; oc.height=SIZE;
  cx.fillStyle='#000'; cx.fillRect(0,0,oc.width,oc.height);
  cx.fillStyle='#7adfff'; cx.font=`bold ${fh}px "Courier New",monospace`;
  cx.textBaseline='middle'; cx.fillText(full,0,SIZE/2);
  issTickerPixels=cx.getImageData(0,0,oc.width,oc.height).data;
  issTickerWidth=oc.width;
  issTickerScrollX=0;
}
function issApplyTickerToFace(face){
  if(!issTickerPixels) return;
  const S=SIZE;
  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const sx=(((issTickerScrollX|0)+u)%issTickerWidth+issTickerWidth)%issTickerWidth;
      const sv=S-1-v;
      const pi=(sv*issTickerWidth+sx)*4;
      const idx=faceMap[face][v*S+u];
      if(idx<0) continue;
      colBuf[idx*3]=issTickerPixels[pi]/255;
      colBuf[idx*3+1]=issTickerPixels[pi+1]/255;
      colBuf[idx*3+2]=issTickerPixels[pi+2]/255;
    }
  }
}

function effectISS(dt){
  issT+=dt;
  if(!issFetching && (Date.now()/1000-issLastFetch)>5) issFetch();

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  const is2D=typeof panel2dMode!=='undefined'&&panel2dMode;

  if(is2D){
    issApplyMapToFace(0);
    return;
  }

  // Face 0: starfield + orbiting station icon
  const tt=Date.now()*0.001;
  for(let i=0;i<N;i++){
    const seed=((i*2654435761)>>>0)/4294967296;
    if(seed<0.012){
      const twinkle=0.3+0.7*Math.abs(Math.sin(tt*1.4+seed*60));
      const br=seed*30*twinkle;
      colBuf[i*3]=br; colBuf[i*3+1]=br; colBuf[i*3+2]=br*1.1;
    }
  }
  issDrawStation(0);

  // Face 1: world map with ground track + live marker
  issApplyMapToFace(1);

  // Face 4: info card
  issApplyBufToFace(4, issBuildTitleBuf());

  // Face 2: scrolling info ticker
  if(!issTickerPixels) issBuildTicker();
  issTickerScrollX += dt*20*(speedMult||1);
  issApplyTickerToFace(2);

  // Face 3: flag of the country currently being overflown (reverse-geocoded
  // from the live lat/lon) — mostly ocean, so that's the common case, not an error.
  if(issHasFix){
    const shown=issApplyFlagToFace(3);
    if(!shown){
      if(issFlagPixels==='error'){
        renderTextToFace(3,['FLAG','LOAD','ERROR'],[0.6,0.4,0.1],[0.06,0.03,0]);
      } else if(!issCountryCode){
        renderTextToFace(3,['OVER','OCEAN'],[0.25,0.55,0.95],[0,0.03,0.08]);
      } else {
        const dots='.'.repeat(1+(Math.floor(issT)%3));
        renderTextToFace(3,['LOADING',dots],[0.7,0.7,0.7],[0.03,0.03,0.03]);
      }
    }
  } else {
    renderTextToFace(3,['NO FIX'],[0.5,0.5,0.5],[0.02,0.02,0.02]);
  }
}

// ── Camera feed ──────────────────────────────────────────────
let _camCanvas=null,_camCtx=null,_camPx=null,_camLastFetch=0,_camFetching=false,_camErr='';
function effectCam(dt){
  if(!_camCanvas){
    _camCanvas=document.createElement('canvas');
    _camCanvas.width=64;_camCanvas.height=64;
    _camCtx=_camCanvas.getContext('2d',{willReadFrequently:true});
  }
  const url=(document.getElementById('cam-url')?.value||'').trim();
  const rate=parseFloat(document.getElementById('cam-rate')?.value)||5;
  const interval=1/rate;
  const nowS=performance.now()/1000;
  if(url && !_camFetching && nowS-_camLastFetch>=interval){
    _camLastFetch=nowS; _camFetching=true;
    const img=new Image(); img.crossOrigin='anonymous';
    img.onload=()=>{
      _camCtx.drawImage(img,0,0,64,64);
      _camPx=_camCtx.getImageData(0,0,64,64).data;
      _camErr='';
      const s=document.getElementById('cam-status');
      if(s) s.textContent='Live • '+(rate|0)+' fps';
      _camFetching=false;
    };
    img.onerror=()=>{
      _camErr='Fetch failed';
      const s=document.getElementById('cam-status');
      if(s) s.textContent='Error — check URL / CORS';
      _camFetching=false;
    };
    img.src=url+(url.includes('?')?'&':'?')+'_t='+Date.now();
  }
  if(!_camPx){ for(let i=0;i<N*3;i++) colBuf[i]=0; return; }
  for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
    const iu=Math.min(63,Math.floor(u/SIZE*64));
    const iv=Math.min(63,Math.floor(v/SIZE*64));
    const pi=(iv*64+iu)*4;
    const r=_camPx[pi]/255,g=_camPx[pi+1]/255,b=_camPx[pi+2]/255;
    for(let f=0;f<6;f++){
      const idx=faceMap[f][(SIZE-1-v)*SIZE+u]; if(idx<0) continue;
      colBuf[idx*3]=r;colBuf[idx*3+1]=g;colBuf[idx*3+2]=b;
    }
  }
}
