// ── PANEL EDITOR ──
let panelEditorOn=false;
// perFaceEffect[f] = null (use global) or {effect, overlayKeys:[]}
const perFaceEffect=[null,null,null,null,null,null];
const FACE_NAMES=['Front','Back','Right','Left','Top','Bottom'];

function buildPanelEditor(){
  const el=document.getElementById('pe-faces');
  if(!el) return;
  if(typeof EFFECT_NAMES==='undefined') return; // not ready yet
  const effectKeys=Object.keys(EFFECT_NAMES).filter(k=>k!=='custom_cube');
  el.innerHTML='';

  // Sub-options per effect — what extra controls to show per face
  function buildSubOptions(f, effectKey, container){
    container.innerHTML='';
    if(!effectKey||effectKey==='none') return;

    const pf=perFaceEffect[f]||(perFaceEffect[f]={effect:effectKey,overlayKeys:[],opts:{}});
    if(!pf.opts) pf.opts={};
    const opts=pf.opts;

    const row=(label,ctrl)=>{
      const r=document.createElement('div');
      r.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
      const l=document.createElement('span');
      l.style.cssText='font-size:11px;color:#778;flex:0 0 72px;';
      l.textContent=label;
      r.appendChild(l); r.appendChild(ctrl);
      container.appendChild(r);
    };

    const textInput=(id,placeholder,val,cb)=>{
      const i=document.createElement('input');
      i.type='text'; i.placeholder=placeholder; i.value=val||'';
      i.style.cssText='flex:1;padding:4px 7px;background:#0a1020;border:1px solid rgba(80,120,255,0.3);color:#ccd;font-size:11px;border-radius:3px;';
      i.addEventListener('input',()=>{opts[id]=i.value;cb&&cb(i.value);});
      return i;
    };
    const slider=(id,min,max,step,val,fmt,cb)=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;align-items:center;gap:5px;flex:1;';
      const s=document.createElement('input'); s.type='range';
      s.min=min;s.max=max;s.step=step;s.value=opts[id]??val;
      s.style.cssText='flex:1;';
      const vl=document.createElement('span'); vl.style.cssText='font-size:10px;color:#9cd;width:30px;';
      vl.textContent=fmt(s.value);
      s.addEventListener('input',()=>{opts[id]=parseFloat(s.value);vl.textContent=fmt(s.value);cb&&cb(s.value);});
      wrap.appendChild(s); wrap.appendChild(vl);
      return wrap;
    };
    const select=(id,options,val,cb)=>{
      const s=document.createElement('select');
      s.style.cssText='flex:1;padding:4px 6px;background:#0a1020;border:1px solid rgba(80,120,255,0.3);color:#ccd;font-size:11px;border-radius:3px;';
      options.forEach(([v,l])=>{ const o=document.createElement('option');o.value=v;o.textContent=l;if((opts[id]??val)===v)o.selected=true;s.appendChild(o); });
      s.addEventListener('change',()=>{opts[id]=s.value;cb&&cb(s.value);});
      return s;
    };
    const chk=(id,label,val,cb)=>{
      const wrap=document.createElement('div');
      wrap.style.cssText='display:flex;align-items:center;gap:6px;margin-bottom:5px;';
      // Toggle switch
      const tog=document.createElement('span');
      const on=opts[id]??val;
      tog.style.cssText=`display:inline-block;width:28px;height:15px;border-radius:8px;position:relative;cursor:pointer;flex-shrink:0;background:${on?'rgba(80,200,120,0.6)':'rgba(60,70,100,0.8)'};border:1px solid ${on?'rgba(80,200,120,0.8)':'rgba(80,120,255,0.3)'};transition:all 0.2s;`;
      const knob=document.createElement('span');
      knob.style.cssText=`position:absolute;top:2px;left:${on?'13px':'2px'};width:9px;height:9px;border-radius:50%;background:${on?'#4d8':'#668'};transition:all 0.2s;`;
      tog.appendChild(knob); let isOn=!!on;
      tog.addEventListener('click',()=>{
        isOn=!isOn; opts[id]=isOn;
        tog.style.background=isOn?'rgba(80,200,120,0.6)':'rgba(60,70,100,0.8)';
        tog.style.borderColor=isOn?'rgba(80,200,120,0.8)':'rgba(80,120,255,0.3)';
        knob.style.left=isOn?'13px':'2px'; knob.style.background=isOn?'#4d8':'#668';
        cb&&cb(isOn);
      });
      const lbl=document.createElement('span'); lbl.style.cssText='font-size:11px;color:#99b;'; lbl.textContent=label;
      wrap.appendChild(tog); wrap.appendChild(lbl);
      container.appendChild(wrap);
      return wrap;
    };

    if(effectKey==='fireworks'){
      chk('textOn','Show text on cube',false);
      row('Text:', textInput('text','Enter message…',opts.text));
    } else if(effectKey==='rain'){
      row('Style:', select('style',[['colour','Colour'],['matrix','Matrix']],opts.style||'colour'));
    } else if(effectKey==='datetime'){
      row('Mode:', select('mode',[['time','Time'],['date','Date'],['both','Both'],['full','Full']],opts.mode||'time'));
      chk('scroll','Scroll',false);
    } else if(effectKey==='strobe'){
      row('Pattern:', select('pattern',[['all','Full'],['checker','Alt'],['faces','Faces'],['rings','Rings'],['diagonal','Diag'],['scanline','Scan']],opts.pattern||'all'));
      row('Speed:', slider('speed',1,30,1,8,v=>v+'/s'));
      row('Colour:', select('color',[['white','White'],['red','Red'],['green','Green'],['blue','Blue'],['cyan','Cyan'],['multi','Multi']],opts.color||'white'));
    } else if(effectKey==='lightspeed'){
      row('Speed:', slider('speed',1,20,0.5,8,v=>v));
      row('Trail:', slider('trail',4,120,2,32,v=>v));
      row('Nudge:', select('nudge',[['0','0°'],['1','1°'],['2','2°'],['5','5°'],['10','10°'],['20','20°'],['45','45°'],['90','90°']],String(opts.nudge||'0')));
    } else if(effectKey==='spectrum'){
      row('Gain:', slider('gain',0.5,5,0.1,1.5,v=>parseFloat(v).toFixed(1)+'×'));
    } else if(effectKey==='maze'){
      row('Runners:', slider('runners',1,6,1,3,v=>v));
    } else if(effectKey==='tron'){
      row('Bikes:', slider('bikes',2,8,1,4,v=>v));
      row('Speed:', slider('speed',0.5,3,0.1,1,v=>parseFloat(v).toFixed(1)+'×'));
    } else if(effectKey==='video'){
      row('Bright:', slider('bright',0.1,2,0.1,1,v=>parseFloat(v).toFixed(1)+'×'));
    } else if(effectKey==='balls'||effectKey==='sand'){
      // no sub-options needed
    }
  }

  FACE_NAMES.forEach((name,f)=>{
    const pf=perFaceEffect[f];
    const div=document.createElement('div');
    div.style.cssText='margin-bottom:12px;padding:10px;background:rgba(20,30,60,0.5);border-radius:6px;border:1px solid rgba(80,120,255,0.2);';

    const label=document.createElement('div');
    label.style.cssText='font-size:13px;letter-spacing:1px;color:#7aadff;margin-bottom:8px;font-weight:bold;';
    label.textContent=`Face ${f+1} — ${name}`;
    div.appendChild(label);

    // Effect dropdown
    const sel=document.createElement('select');
    sel.style.cssText='width:100%;background:#0a1020;border:1px solid rgba(80,120,255,0.35);color:#ccd;font-size:12px;padding:5px 7px;border-radius:4px;margin-bottom:8px;';
    sel.dataset.face=f;

    const optGlobal=document.createElement('option');
    optGlobal.value=''; optGlobal.textContent='— Use global effect —';
    sel.appendChild(optGlobal);

    const optNone=document.createElement('option');
    optNone.value='none'; optNone.textContent='✕ None (blank face)';
    if(pf&&pf.effect==='none') optNone.selected=true;
    sel.appendChild(optNone);

    effectKeys.forEach(k=>{
      const opt=document.createElement('option');
      opt.value=k; opt.textContent=EFFECT_NAMES[k]||k;
      if(pf&&pf.effect===k) opt.selected=true;
      sel.appendChild(opt);
    });
    div.appendChild(sel);

    // Sub-options container
    const subDiv=document.createElement('div');
    subDiv.style.cssText='background:rgba(0,0,0,0.2);border-radius:4px;padding:6px 8px;margin-bottom:8px;';
    if(pf&&pf.effect&&pf.effect!=='none') buildSubOptions(f,pf.effect,subDiv);
    if(!subDiv.children.length) subDiv.style.display='none';
    div.appendChild(subDiv);

    sel.addEventListener('change',()=>{
      const v=sel.value;
      if(!v){ perFaceEffect[f]=null; subDiv.innerHTML=''; subDiv.style.display='none'; }
      else {
        perFaceEffect[f]=perFaceEffect[f]||{effect:v,overlayKeys:[],opts:{}};
        perFaceEffect[f].effect=v;
        subDiv.style.display='';
        buildSubOptions(f,v,subDiv);
        if(!subDiv.children.length) subDiv.style.display='none';
      }
    });

    // Overlay toggles
    const ovLabel=document.createElement('div');
    ovLabel.style.cssText='font-size:11px;color:#778;margin-bottom:6px;';
    ovLabel.textContent='Overlays on this face:';
    div.appendChild(ovLabel);
    const ovGrid=document.createElement('div');
    ovGrid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:5px;';
    const FACE_OVERLAYS=['stars','fire','sparkle','glitch','mist','snow'];
    FACE_OVERLAYS.forEach(ov=>{
      const lbl=document.createElement('label');
      lbl.style.cssText='font-size:12px;color:#99b;display:flex;align-items:center;gap:6px;cursor:pointer;';
      const tog=document.createElement('span');
      const checked=pf&&pf.overlayKeys&&pf.overlayKeys.includes(ov);
      tog.style.cssText=`display:inline-block;width:30px;height:16px;border-radius:8px;position:relative;cursor:pointer;flex-shrink:0;background:${checked?'rgba(80,200,120,0.6)':'rgba(60,70,100,0.8)'};border:1px solid ${checked?'rgba(80,200,120,0.8)':'rgba(80,120,255,0.3)'};transition:all 0.2s;`;
      const knob=document.createElement('span');
      knob.style.cssText=`position:absolute;top:2px;left:${checked?'14px':'2px'};width:10px;height:10px;border-radius:50%;background:${checked?'#4d8':'#668'};transition:all 0.2s;`;
      tog.appendChild(knob); let isOn=checked;
      tog.addEventListener('click',()=>{
        isOn=!isOn;
        tog.style.background=isOn?'rgba(80,200,120,0.6)':'rgba(60,70,100,0.8)';
        tog.style.borderColor=isOn?'rgba(80,200,120,0.8)':'rgba(80,120,255,0.3)';
        knob.style.left=isOn?'14px':'2px'; knob.style.background=isOn?'#4d8':'#668';
        if(!perFaceEffect[f]) perFaceEffect[f]={effect:'',overlayKeys:[],opts:{}};
        const arr=perFaceEffect[f].overlayKeys;
        if(isOn){if(!arr.includes(ov)) arr.push(ov);}
        else{const idx=arr.indexOf(ov);if(idx>=0)arr.splice(idx,1);}
      });
      lbl.appendChild(tog); lbl.appendChild(document.createTextNode(ov));
      ovGrid.appendChild(lbl);
    });
    div.appendChild(ovGrid);
    el.appendChild(div);
  });
}

// Cube library: stored as {name, faces:[...]} objects in localStorage key 'ledcube_cubes'
function peGetLibrary(){
  try{ return JSON.parse(localStorage.getItem('ledcube_cubes')||'[]'); } catch(e){ return []; }
}
function peSaveLibrary(lib){
  localStorage.setItem('ledcube_cubes', JSON.stringify(lib));
}
function peRefreshSelect(){
  const sel=document.getElementById('pe-load-select');
  const ccSel=document.getElementById('cc-select');
  const lib=peGetLibrary();
  [sel,ccSel].forEach(s=>{
    if(!s) return;
    const first=s===sel?'— choose saved cube —':'— choose a saved cube —';
    s.innerHTML=`<option value="">${first}</option>`;
    lib.forEach((c,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=c.name; s.appendChild(o); });
  });
}



document.getElementById('pe-save-btn')?.addEventListener('click',()=>{
  const nameEl=document.getElementById('pe-name-input');
  const name=(nameEl?.value||'').trim()||'Cube '+(peGetLibrary().length+1);
  // Save complete face data including opts
  const faces=perFaceEffect.map(pf=>pf?{
    effect:pf.effect,
    overlayKeys:[...(pf.overlayKeys||[])],
    opts:{...(pf.opts||{})}
  }:null);
  const lib=peGetLibrary();
  const idx=lib.findIndex(c=>c.name===name);
  if(idx>=0) lib[idx]={name,faces};
  else lib.push({name,faces});
  peSaveLibrary(lib);
  peRefreshSelect();
  // Keep the name in the field so repeated saves overwrite the same cube
  const btn=document.getElementById('pe-save-btn');
  btn.textContent='✓'; btn.style.background='rgba(60,220,120,0.25)';
  setTimeout(()=>{btn.textContent='💾';btn.style.background='rgba(60,220,120,0.1)';},1200);
});

document.getElementById('pe-load-btn')?.addEventListener('click',()=>{
  const sel=document.getElementById('pe-load-select');
  if(!sel||sel.value==='') return;
  const lib=peGetLibrary();
  const cube=lib[parseInt(sel.value)];
  if(!cube) return;
  // Restore faces array exactly as saved (nulls for unassigned faces)
  for(let i=0;i<6;i++){
    perFaceEffect[i]=cube.faces[i]?{
      effect:cube.faces[i].effect,
      overlayKeys:[...(cube.faces[i].overlayKeys||[])],
      opts:{...(cube.faces[i].opts||{})}
    }:null;
  }
  // Put loaded cube's name in the field so a plain Save overwrites it
  const nameEl=document.getElementById('pe-name-input');
  if(nameEl) nameEl.value=cube.name;
  buildPanelEditor();
});

document.getElementById('pe-del-btn')?.addEventListener('click',()=>{
  const sel=document.getElementById('pe-load-select');
  if(!sel||sel.value==='') return;
  const lib=peGetLibrary();
  lib.splice(parseInt(sel.value),1);
  peSaveLibrary(lib);
  peRefreshSelect();
});

document.getElementById('pe-clear-btn')?.addEventListener('click',()=>{
  for(let f=0;f<6;f++) perFaceEffect[f]=null;
  for(let i=0;i<N*3;i++) colBuf[i]=0;
  panelEditorOn=true; // keep in editor mode so cube stays blank
  buildPanelEditor();
});

// Rebuild editor when panel editor section is opened
document.getElementById('panel-editor-section')?.querySelector('.section-head')
  ?.addEventListener('click',()=>{ setTimeout(()=>{
    panelEditorOn=true;
    // Default all unset faces to 'none' so cube starts blank
    for(let f=0;f<6;f++){
      if(!perFaceEffect[f]) perFaceEffect[f]={effect:'none',overlayKeys:[],opts:{}};
    }
    buildPanelEditor(); peRefreshSelect();
  },50); });
// ── ALARM SYSTEM ──────────────────────────────────────────────────────────────
let alarms=[], alarmEditIdx=-1, alarmSunriseOn=false, alarmGiantSunOn=false, alarmWxRiseOn=false, alarmEffectRiseOn=false, alarmEffectRiseKey="", alarmEffectRiseCity="";
let alarmEffectRiseOpts={};
let activeAlarm=null; // {alarm, phase:'pre'|'main', startMs, alarmMs, dismissed}
let alarmLastCheck=0, alarmT=0;
const AL_DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];

function alarmLoad(){ try{alarms=JSON.parse(localStorage.getItem('ledcube_alarms')||'[]');}catch(e){alarms=[];} }
function alarmSave(){ localStorage.setItem('ledcube_alarms',JSON.stringify(alarms)); }
alarmLoad();

function alarmBuildList(){
  const el=document.getElementById('alarm-list-ui'); if(!el) return;
  if(!alarms.length){ el.innerHTML='<div style="font-size:12px;color:#667;text-align:center;padding:10px 0;">No timers set</div>'; return; }
  el.innerHTML='';
  alarms.forEach((al,i)=>{
    const h=String(al.hour).padStart(2,'0'), m=String(al.minute).padStart(2,'0');
    const repeatLabel={once:'Once',daily:'Daily',weekdays:'Weekdays',weekends:'Weekends',
      weekly:(al.days||[]).map(d=>AL_DAYS[d]).join(','),hourly:'Hourly'}[al.repeat]||al.repeat;
    const isWd=!!al.prealarm?.windDown;
    const typeLabel=isWd?'Wind Down':'Alarm';
    const div=document.createElement('div');
    div.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:5px;background:rgba(20,30,60,0.5);border-radius:6px;border:1px solid rgba(80,120,255,0.18);';
    const on=al.enabled;
    div.innerHTML=`
      <span class="al-tog" data-i="${i}" style="display:inline-block;width:28px;height:15px;border-radius:8px;position:relative;cursor:pointer;flex-shrink:0;background:${on?'rgba(80,200,120,0.6)':'rgba(60,70,100,0.8)'};border:1px solid ${on?'rgba(80,200,120,0.8)':'rgba(80,120,255,0.3)'};transition:all 0.2s;">
        <span style="position:absolute;top:2px;left:${on?'13px':'2px'};width:9px;height:9px;border-radius:50%;background:${on?'#4d8':'#668'};transition:all 0.2s;"></span>
      </span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:16px;color:#dde;font-weight:700;letter-spacing:1px;">${h}:${m} <span style="font-size:11px;color:#8899bb;font-weight:600;">${repeatLabel}</span></div>
        <div style="font-size:12px;color:#99aabb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${al.name||''} <span style="font-size:10px;color:#7aadff;">${typeLabel}</span></div>
      </div>
      <button class="al-edit-btn" data-i="${i}" style="padding:4px 10px;font-size:11px;background:rgba(80,120,255,0.12);border:1px solid rgba(80,120,255,0.3);color:#7aadff;border-radius:4px;cursor:pointer;">✏</button>
      <button class="al-del-btn" data-i="${i}" style="padding:4px 10px;font-size:11px;background:rgba(255,60,60,0.08);border:1px solid rgba(255,60,60,0.2);color:#f88;border-radius:4px;cursor:pointer;">✕</button>`;
    el.appendChild(div);
  });
  el.querySelectorAll('.al-tog').forEach(t=>t.addEventListener('click',()=>{
    const i=+t.dataset.i; alarms[i].enabled=!alarms[i].enabled;
    if(!alarms[i].enabled && activeAlarm && activeAlarm.al.id===alarms[i].id){ activeAlarm.dismissed=true; activeAlarm=null; clearPending=true; }
    alarmSave(); alarmBuildList();
  }));
  el.querySelectorAll('.al-edit-btn').forEach(b=>b.addEventListener('click',()=>alarmOpenEditor(+b.dataset.i)));
  el.querySelectorAll('.al-del-btn').forEach(b=>{
    b.onclick=e=>{
      e.preventDefault();
      const idx=parseInt(b.getAttribute('data-i'));
      if(!isNaN(idx)&&confirm('Delete timer?')){
        alarms.splice(idx,1); 
        alarmSave(); 
        alarmBuildList(); 
      }
    };
  });
}

function alarmOpenEditor(idx){
  alarmEditIdx=idx;
  const al=idx>=0?alarms[idx]:{name:'Morning Timer',enabled:true,hour:7,minute:30,
    repeat:'daily',days:[1,2,3,4,5],triggerType:'effect',effect:'wave',overlayKeys:[],
    playlistName:'',sunrise:{enabled:false,preMinutes:15,startBright:5},message:'Good Morning! 🌅'};

  document.getElementById('al-name').value=al.name||'';
  document.getElementById('al-hour').value=al.hour;
  document.getElementById('al-min').value=String(al.minute).padStart(2,'0');
  document.getElementById('al-repeat').value=al.repeat||'daily';
  document.getElementById('al-message').value=al.message||'';
  document.getElementById('al-pre-mins').value=al.prealarm?.preMinutes||15;
  document.getElementById('al-dim-start').value=al.prealarm?.startBright||5;
  document.getElementById('al-dim-val').textContent=(al.prealarm?.startBright||5)+'%';

  // Alarm vs Wind Down mode
  const isWd=!!al.prealarm?.windDown;
  document.getElementById('al-alarm-on').value=isWd?'0':'1';
  document.getElementById('al-alarm-opts').style.display=isWd?'none':'';
  document.getElementById('al-alarm-arrow').style.transform=isWd?'':'rotate(90deg)';
  document.getElementById('al-wind-down').value=isWd?'1':'0';
  document.getElementById('al-wd-use-effect').checked=!!al.prealarm?.wdUseEffect;
  const wdMinsEl=document.getElementById('al-wd-mins');
  if(wdMinsEl) wdMinsEl.value=al.prealarm?.wdMinutes||15;
  document.getElementById('al-wd-opts').style.display=isWd?'':'none';
  document.getElementById('al-wd-arrow').style.transform=isWd?'rotate(90deg)':'';
  // Sunrise toggle
  alarmSunriseOn=!!al.prealarm?.enabled;
  alarmGiantSunOn=!!al.prealarm?.giantSun;
  alarmWxRiseOn=!!al.prealarm?.wxRise;
  alarmEffectRiseOn=!!al.prealarm?.effectRise;
  alarmEffectRiseKey=al.prealarm?.effectRiseKey||'';
  alarmEffectRiseCity=al.prealarm?.effectRiseCity||'';
  alarmEffectRiseOpts=al.prealarm?.effectRiseOpts||{};
  buildAlarmEffectOpts(alarmEffectRiseKey);
  alarmUpdateSunriseTog();

  // Days
  document.querySelectorAll('.al-day-btn').forEach(b=>{
    const d=+b.dataset.d;
    b.classList.toggle('active',(al.days||[]).includes(d));
  });
  document.getElementById('al-days-row').style.display=al.repeat==='weekly'?'':'none';

  // Trigger type
  alarmSetTriggerType(al.triggerType||'effect');

  // Effect dropdown
  const effSel=document.getElementById('al-effect');
  effSel.innerHTML='<option value="">─ None (no effect) ─</option>';
  Object.entries(EFFECT_NAMES||{}).filter(([k])=>k!=='custom_cube').forEach(([k,v])=>{
    const o=document.createElement('option'); o.value=k; o.textContent=v;
    if(k===al.effect) o.selected=true;
    effSel.appendChild(o);
  });

  // Overlays
  const ovDiv=document.getElementById('al-overlays');
  ovDiv.innerHTML='';
  const ovNames={stars:'✨ Stars',snow:'❄️ Snow',meteors:'☄️ Meteors',edgeglow:'🔆 Edge Glow',fire:'🔥 Fire',sparkle:'💫 Sparkle',colorwave:'🌊 Color Wave',pulse:'💡 Pulse',scanline:'📡 Scan Line',vignette:'🌑 Vignette',glitch:'📺 Glitch',mist:'🌫️ Mist',lightning:'⚡ Lightning'};
  Object.keys(ovNames).forEach(ov=>{
    const lbl=document.createElement('label');
    lbl.style.cssText='font-size:12px;color:#99b;display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0;';
    const tog=document.createElement('span'); tog.className='ov-toggle'; tog.style.marginLeft='0';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.value=ov;
    chk.checked=(al.overlayKeys||[]).includes(ov);
    const slider=document.createElement('span'); slider.className='ov-slider';
    tog.appendChild(chk); tog.appendChild(slider);
    lbl.appendChild(tog); lbl.appendChild(document.createTextNode(ovNames[ov]));
    ovDiv.appendChild(lbl);
  });

  // Wind down effect dropdown
  const wdEffSel=document.getElementById('al-wd-effect');
  wdEffSel.innerHTML='';
  Object.entries(EFFECT_NAMES||{}).filter(([k])=>k!=='custom_cube').forEach(([k,v])=>{
    const o=document.createElement('option'); o.value=k; o.textContent=v;
    if(k===(al.prealarm?.wdEffectKey||currentEffect)) o.selected=true;
    wdEffSel.appendChild(o);
  });
  // Wind down overlays
  const wdOvDiv=document.getElementById('al-wd-overlays');
  wdOvDiv.innerHTML='';
  Object.keys(ovNames).forEach(ov=>{
    const lbl=document.createElement('label');
    lbl.style.cssText='font-size:12px;color:#99b;display:flex;align-items:center;gap:6px;cursor:pointer;padding:2px 0;';
    const tog=document.createElement('span'); tog.className='ov-toggle'; tog.style.marginLeft='0';
    const chk=document.createElement('input'); chk.type='checkbox'; chk.value=ov;
    chk.checked=(al.prealarm?.wdOverlayKeys||[]).includes(ov);
    const slider=document.createElement('span'); slider.className='ov-slider';
    tog.appendChild(chk); tog.appendChild(slider);
    lbl.appendChild(tog); lbl.appendChild(document.createTextNode(ovNames[ov]));
    wdOvDiv.appendChild(lbl);
  });
  document.getElementById('al-wd-effect-section').style.display=(al.prealarm?.wdUseEffect)?'none':'';

  // Playlist dropdown
  const plSel=document.getElementById('al-playlist');
  plSel.innerHTML='<option value="">— none —</option>';
  try{
    const pls=JSON.parse(localStorage.getItem('ledcube_playlists')||'[]');
    pls.forEach(pl=>{ const o=document.createElement('option'); o.value=pl.name; o.textContent=pl.name;
      if(pl.name===al.playlistName) o.selected=true; plSel.appendChild(o); });
  }catch(e){}

  document.getElementById('alarm-modal-title').textContent=idx>=0?'EDIT TIMER':'ADD TIMER';
  document.getElementById('alarm-modal').style.display='block';
}

function alarmSetTriggerType(type){
  const eff=type==='effect';
  document.getElementById('al-type-effect').style.cssText=`flex:1;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;background:${eff?'rgba(80,120,255,0.2)':'rgba(30,40,80,0.4)'};border:1px solid ${eff?'rgba(80,120,255,0.5)':'rgba(80,120,255,0.2)'};color:${eff?'#7aadff':'#668'};`;
  document.getElementById('al-type-playlist').style.cssText=`flex:1;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:700;background:${eff?'rgba(30,40,80,0.4)':'rgba(80,120,255,0.2)'};border:1px solid ${eff?'rgba(80,120,255,0.2)':'rgba(80,120,255,0.5)'};color:${eff?'#668':'#7aadff'};`;
  document.getElementById('al-effect-row').style.display=eff?'':'none';
  document.getElementById('al-playlist-row').style.display=eff?'none':'';
}

function alarmUpdateSunriseTog(){
  const opts=document.getElementById('al-sunrise-opts');
  const sunChk=document.getElementById('al-sunrise-chk');
  const giantChk=document.getElementById('al-giant-sun-chk');
  const effChk=document.getElementById('al-effect-rise-chk');
  const effRiseOpts=document.getElementById('al-effect-rise-opts');
  if(sunChk) sunChk.checked=alarmSunriseOn;
  if(opts) opts.style.display=alarmSunriseOn?'block':'none';
  if(giantChk) giantChk.checked=alarmGiantSunOn;
  if(effChk) effChk.checked=alarmEffectRiseOn;
  if(effRiseOpts) effRiseOpts.style.display=alarmEffectRiseOn?'block':'none';
  if(alarmEffectRiseOn){
    const sel=document.getElementById('al-effect-rise-select');
    if(sel&&alarmEffectRiseKey) sel.value=alarmEffectRiseKey;
    const cityRow=document.getElementById('al-effect-rise-city-row');
    if(cityRow) cityRow.style.display=(alarmEffectRiseKey==='weather')?'block':'none';
    const cityEl=document.getElementById('al-effect-rise-city');
    if(cityEl&&alarmEffectRiseCity) cityEl.value=alarmEffectRiseCity;
  }
}

// Wire alarm modal buttons
document.getElementById('al-sunrise-chk')?.addEventListener('change',function(){ alarmSunriseOn=this.checked; alarmUpdateSunriseTog(); });
document.getElementById('al-giant-sun-chk')?.addEventListener('change',function(){ alarmGiantSunOn=this.checked; if(alarmGiantSunOn){alarmWxRiseOn=false;alarmEffectRiseOn=false;} alarmUpdateSunriseTog(); });
document.getElementById('al-effect-rise-chk')?.addEventListener('change',function(){ alarmEffectRiseOn=this.checked; if(alarmEffectRiseOn){alarmGiantSunOn=false;alarmWxRiseOn=false;} alarmUpdateSunriseTog(); });
document.getElementById('al-effect-rise-select')?.addEventListener('change',(e)=>{
  alarmEffectRiseKey=e.target.value;
  alarmEffectRiseOpts={};
  const cityRow=document.getElementById('al-effect-rise-city-row');
  if(cityRow) cityRow.style.display=(alarmEffectRiseKey==='weather')?'block':'none';
  buildAlarmEffectOpts(alarmEffectRiseKey);
});
document.getElementById('al-effect-rise-city')?.addEventListener('change',(e)=>{ alarmEffectRiseCity=e.target.value; });

// Populate effect rise select (all effects including weather, excluding custom_cube)
function populateAlarmEffectRiseSelect(){
  const sel=document.getElementById('al-effect-rise-select'); if(!sel||!EFFECT_NAMES) return;
  sel.innerHTML='<option value="">-- choose effect --</option>';
  Object.entries(EFFECT_NAMES).filter(([k])=>k!=='custom_cube').forEach(([k,v])=>{
    const o=document.createElement('option'); o.value=k; o.textContent=v; sel.appendChild(o);
  });
  // City dropdown now uses autocomplete, no need to populate select
}
function buildAlarmEffectOpts(key){
  const c=document.getElementById('al-effect-rise-effect-opts');
  if(!c){return;}
  c.innerHTML=''; c.style.display='none';
  const opts=alarmEffectRiseOpts;
  const mkLabel=(t)=>{const d=document.createElement('div');d.className='ov-row-label';d.style.marginTop='6px';d.textContent=t;return d;};
  const mkGrid=()=>{const d=document.createElement('div');d.className='opt-grid';d.style.marginBottom='6px';return d;};
  const mkBtn=(label,active,cb)=>{const b=document.createElement('button');b.className='strobe-mode-btn'+(active?' active':'');b.textContent=label;b.style.fontSize='11px';b.addEventListener('click',cb);return b;};
  const activateOne=(grid,btn)=>{grid.querySelectorAll('.strobe-mode-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');};
  if(key==='rain'){
    c.style.display='block';
    c.appendChild(mkLabel('Style'));
    const g=mkGrid();
    ['colour','matrix'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.style||'colour')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.style=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
  } else if(key==='fireworks'){
    c.style.display='block';
    c.appendChild(mkLabel('Mode'));
    const g=mkGrid();
    ['random','sync'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.fwMode||'random')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.fwMode=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
    const chk=document.createElement('label');chk.className='check-row';chk.style.fontSize='11px';
    const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!opts.fwTextOn;
    inp.addEventListener('change',()=>{alarmEffectRiseOpts.fwTextOn=inp.checked;});
    chk.appendChild(inp);chk.append(' Show text on cube');c.appendChild(chk);
    const ti=document.createElement('input');ti.type='text';ti.placeholder='Enter message…';ti.maxLength=80;ti.value=opts.fwText||'';
    ti.style.cssText='width:100%;margin-top:4px;padding:5px 8px;background:#111;border:1px solid #444;color:#eee;border-radius:4px;font-size:11px;';
    ti.addEventListener('input',()=>{alarmEffectRiseOpts.fwText=ti.value;});
    c.appendChild(ti);
  } else if(key==='datetime'){
    c.style.display='block';
    c.appendChild(mkLabel('Mode'));
    const g=mkGrid();
    ['time','date','both','full','analogue'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.mode||'time')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.mode=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
    const chk=document.createElement('label');chk.className='check-row';chk.style.fontSize='11px';
    const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!opts.scroll;
    inp.addEventListener('change',()=>{alarmEffectRiseOpts.scroll=inp.checked;});
    chk.appendChild(inp);chk.append(' Scroll');c.appendChild(chk);
  } else if(key==='balls'){
    c.style.display='block';
    c.appendChild(mkLabel('Mode'));
    const g=mkGrid();
    ['cross','own'].forEach(s=>{
      const b=mkBtn(s==='cross'?'Cross Faces':'Own Face',(opts.ballMode||'cross')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.ballMode=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
    c.appendChild(mkLabel('Balls per face'));
    const sl=document.createElement('input');sl.type='range';sl.min='1';sl.max='8';sl.value=opts.ballCount||'3';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=sl.value;
    sl.addEventListener('input',()=>{sv.textContent=sl.value;alarmEffectRiseOpts.ballCount=parseInt(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
  } else if(key==='strobe'){
    c.style.display='block';
    c.appendChild(mkLabel('Pattern'));
    const g=mkGrid();g.style.gridTemplateColumns='repeat(3,1fr)';
    ['all','checker','faces','rings','diagonal','scanline'].forEach(s=>{
      const labels={all:'Full',checker:'Alt',faces:'Faces',rings:'Rings',diagonal:'Diag',scanline:'Scan'};
      const b=mkBtn(labels[s]||s,(opts.pattern||'all')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.pattern=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
    c.appendChild(mkLabel('Speed (Hz)'));
    const sl=document.createElement('input');sl.type='range';sl.min='1';sl.max='30';sl.value=opts.speed||'8';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=(opts.speed||8)+'/s';
    sl.addEventListener('input',()=>{sv.textContent=sl.value+'/s';alarmEffectRiseOpts.speed=parseInt(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
    c.appendChild(mkLabel('Colour'));
    const cg=mkGrid();
    ['white','red','blue','green','rainbow'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.color||'white')===s,()=>{activateOne(cg,b);alarmEffectRiseOpts.color=s;});
      cg.appendChild(b);
    });
    c.appendChild(cg);
  } else if(key==='spectrum'){
    c.style.display='block';
    c.appendChild(mkLabel('Style'));
    const g=mkGrid();g.style.gridTemplateColumns='repeat(3,1fr)';
    ['bars','mirror','dots','blocks','outline','radial','vu','waterfall','waveform','tunnel','storm','plasma','rings','fire'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.auStyle||'bars')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.auStyle=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
    c.appendChild(mkLabel('Colour Theme'));
    const tg=mkGrid();tg.style.gridTemplateColumns='repeat(3,1fr)';
    [['0','Rainbow'],['1','Fire'],['2','Ocean'],['3','Neon'],['4','Matrix'],['5','Pastel']].forEach(([v,l])=>{
      const b=mkBtn(l,String(opts.auTheme||'0')===v,()=>{activateOne(tg,b);alarmEffectRiseOpts.auTheme=parseInt(v);});
      tg.appendChild(b);
    });
    c.appendChild(tg);
    c.appendChild(mkLabel('Bar Mode'));
    const bg=mkGrid();bg.style.gridTemplateColumns='repeat(3,1fr)';
    ['solid','striped','center','falling','stacked','wave'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.auBarMode||'solid')===s,()=>{activateOne(bg,b);alarmEffectRiseOpts.auBarMode=s;});
      bg.appendChild(b);
    });
    c.appendChild(bg);
    c.appendChild(mkLabel('Gain'));
    const sl=document.createElement('input');sl.type='range';sl.min='0.5';sl.max='5';sl.step='0.1';sl.value=opts.auGain||'1.5';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=(opts.auGain||1.5)+'x';
    sl.addEventListener('input',()=>{sv.textContent=parseFloat(sl.value).toFixed(1)+'x';alarmEffectRiseOpts.auGain=parseFloat(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
  } else if(key==='maze'){
    c.style.display='block';
    c.appendChild(mkLabel('Runners'));
    const sl=document.createElement('input');sl.type='range';sl.min='1';sl.max='6';sl.value=opts.runners||'3';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=sl.value;
    sl.addEventListener('input',()=>{sv.textContent=sl.value;alarmEffectRiseOpts.runners=parseInt(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
  } else if(key==='tron'){
    c.style.display='block';
    c.appendChild(mkLabel('Bikes'));
    const sl=document.createElement('input');sl.type='range';sl.min='2';sl.max='8';sl.value=opts.bikes||'4';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=sl.value;
    sl.addEventListener('input',()=>{sv.textContent=sl.value;alarmEffectRiseOpts.bikes=parseInt(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
    c.appendChild(mkLabel('Speed'));
    const sl2=document.createElement('input');sl2.type='range';sl2.min='0.5';sl2.max='3';sl2.step='0.1';sl2.value=opts.speed||'1';
    sl2.style.cssText='width:100%;';
    const sv2=document.createElement('span');sv2.className='slider-val';sv2.textContent=(opts.speed||1)+'x';
    sl2.addEventListener('input',()=>{sv2.textContent=parseFloat(sl2.value).toFixed(1)+'x';alarmEffectRiseOpts.speed=parseFloat(sl2.value);});
    const sr2=document.createElement('div');sr2.className='slider-row';sr2.appendChild(sl2);sr2.appendChild(sv2);
    c.appendChild(sr2);
    const chk=document.createElement('label');chk.className='check-row';chk.style.fontSize='11px';
    const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!opts.straight;
    inp.addEventListener('change',()=>{alarmEffectRiseOpts.straight=inp.checked;});
    chk.appendChild(inp);chk.append(' Straight lines');c.appendChild(chk);
  } else if(key==='retro'){
    c.style.display='block';
    c.appendChild(mkLabel('Game'));
    const g=mkGrid();g.style.gridTemplateColumns='repeat(3,1fr)';
    const games=[[-1,'Auto'],[0,'Jet Pac'],[1,'Manic Miner'],[2,'OutRun'],[3,'Invaders'],[4,'JSW'],[5,'Deathchase'],[6,'R-Type'],[7,'Wolf 3D'],[8,'Quake 2'],[10,'Tamagotchi'],[11,'Atic Atac'],[12,'Donkey Kong']];
    games.forEach(([v,l])=>{
      const b=mkBtn(l,(opts.game===undefined?-1:opts.game)===v,()=>{activateOne(g,b);alarmEffectRiseOpts.game=v;});
      g.appendChild(b);
    });
    c.appendChild(g);
    c.appendChild(mkLabel('Rotate (s)'));
    const sl=document.createElement('input');sl.type='range';sl.min='3';sl.max='120';sl.value=opts.rotate||'8';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=(opts.rotate||8)+'s';
    sl.addEventListener('input',()=>{sv.textContent=sl.value+'s';alarmEffectRiseOpts.rotate=parseInt(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
  } else if(key==='simhouse'){
    c.style.display='block';
    c.appendChild(mkLabel('Mode'));
    const g=mkGrid();
    ['normal','shadows'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.shMode||'normal')===s,()=>{activateOne(g,b);alarmEffectRiseOpts.shMode=s;});
      g.appendChild(b);
    });
    c.appendChild(g);
  } else if(key==='lightspeed'){
    c.style.display='block';
    c.appendChild(mkLabel('Speed'));
    const sl=document.createElement('input');sl.type='range';sl.min='1';sl.max='20';sl.step='0.5';sl.value=opts.lsSpeed||'8';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=opts.lsSpeed||'8';
    sl.addEventListener('input',()=>{sv.textContent=sl.value;alarmEffectRiseOpts.lsSpeed=parseFloat(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
    c.appendChild(mkLabel('Trail'));
    const sl2=document.createElement('input');sl2.type='range';sl2.min='4';sl2.max='120';sl2.step='2';sl2.value=opts.lsTrail||'32';
    sl2.style.cssText='width:100%;';
    const sv2=document.createElement('span');sv2.className='slider-val';sv2.textContent=opts.lsTrail||'32';
    sl2.addEventListener('input',()=>{sv2.textContent=sl2.value;alarmEffectRiseOpts.lsTrail=parseInt(sl2.value);});
    const sr2=document.createElement('div');sr2.className='slider-row';sr2.appendChild(sl2);sr2.appendChild(sv2);
    c.appendChild(sr2);
    c.appendChild(mkLabel('Size'));
    const sg=mkGrid();sg.style.gridTemplateColumns='repeat(4,1fr)';
    [1,2,3,4,6,8,12,16].forEach(v=>{
      const b=mkBtn(String(v),(opts.lsSize||1)===v,()=>{activateOne(sg,b);alarmEffectRiseOpts.lsSize=v;});
      sg.appendChild(b);
    });
    c.appendChild(sg);
    c.appendChild(mkLabel('Objects'));
    const sl3=document.createElement('input');sl3.type='range';sl3.min='1';sl3.max='12';sl3.value=opts.lsCount||'3';
    sl3.style.cssText='width:100%;';
    const sv3=document.createElement('span');sv3.className='slider-val';sv3.textContent=opts.lsCount||'3';
    sl3.addEventListener('input',()=>{sv3.textContent=sl3.value;alarmEffectRiseOpts.lsCount=parseInt(sl3.value);});
    const sr3=document.createElement('div');sr3.className='slider-row';sr3.appendChild(sl3);sr3.appendChild(sv3);
    c.appendChild(sr3);
    c.appendChild(mkLabel('Colour'));
    const cg=mkGrid();cg.style.gridTemplateColumns='repeat(3,1fr)';
    ['multi','white','cyan','red','green','gold'].forEach(s=>{
      const b=mkBtn(s.charAt(0).toUpperCase()+s.slice(1),(opts.lsCol||'multi')===s,()=>{activateOne(cg,b);alarmEffectRiseOpts.lsCol=s;});
      cg.appendChild(b);
    });
    c.appendChild(cg);
  } else if(key==='coinflip'){
    c.style.display='block';
    c.appendChild(mkLabel('Flip Speed'));
    const sl=document.createElement('input');sl.type='range';sl.min='0.5';sl.max='5';sl.step='0.5';sl.value=opts.coinSpeed||'1';
    sl.style.cssText='width:100%;';
    const sv=document.createElement('span');sv.className='slider-val';sv.textContent=(opts.coinSpeed||1)+'x';
    sl.addEventListener('input',()=>{sv.textContent=parseFloat(sl.value)+'x';alarmEffectRiseOpts.coinSpeed=parseFloat(sl.value);});
    const sr=document.createElement('div');sr.className='slider-row';sr.appendChild(sl);sr.appendChild(sv);
    c.appendChild(sr);
  } else if(key==='dice'){
    c.style.display='block';
    const chk=document.createElement('label');chk.className='check-row';chk.style.fontSize='11px';
    const inp=document.createElement('input');inp.type='checkbox';inp.checked=!!opts.autoRoll;
    inp.addEventListener('change',()=>{alarmEffectRiseOpts.autoRoll=inp.checked;});
    chk.appendChild(inp);chk.append(' Auto roll (every 4s)');c.appendChild(chk);
  }
}
// populateAlarmEffectRiseSelect called after EFFECT_NAMES is defined below
document.getElementById('al-dim-start')?.addEventListener('input',e=>{ document.getElementById('al-dim-val').textContent=e.target.value+'%'; });
document.querySelectorAll('.al-day-btn').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('active')));
document.getElementById('al-type-effect')?.addEventListener('click',()=>alarmSetTriggerType('effect'));
document.getElementById('al-type-playlist')?.addEventListener('click',()=>alarmSetTriggerType('playlist'));
document.getElementById('al-repeat')?.addEventListener('change',e=>{
  document.getElementById('al-days-row').style.display=e.target.value==='weekly'?'':'none';
});
document.getElementById('alarm-add-btn')?.addEventListener('click',()=>alarmOpenEditor(-1));
document.getElementById('al-alarm-hdr')?.addEventListener('click',function(){
  const alOn=document.getElementById('al-alarm-on');
  const opts=document.getElementById('al-alarm-opts');
  const arrow=document.getElementById('al-alarm-arrow');
  const isOpen=alOn.value==='1';
  if(isOpen){
    alOn.value='0'; opts.style.display='none'; arrow.style.transform='';
  } else {
    alOn.value='1'; opts.style.display=''; arrow.style.transform='rotate(90deg)';
    document.getElementById('al-wind-down').value='0'; document.getElementById('al-wd-opts').style.display='none'; document.getElementById('al-wd-arrow').style.transform='';
  }
});
document.getElementById('al-wd-hdr')?.addEventListener('click',function(){
  const wdOn=document.getElementById('al-wind-down');
  const opts=document.getElementById('al-wd-opts');
  const arrow=document.getElementById('al-wd-arrow');
  const isOpen=wdOn.value==='1';
  if(isOpen){
    wdOn.value='0'; opts.style.display='none'; arrow.style.transform='';
  } else {
    wdOn.value='1'; opts.style.display=''; arrow.style.transform='rotate(90deg)';
    document.getElementById('al-alarm-on').value='0'; document.getElementById('al-alarm-opts').style.display='none'; document.getElementById('al-alarm-arrow').style.transform='';
  }
});
document.getElementById('al-wd-use-effect')?.addEventListener('change',function(){
  document.getElementById('al-wd-effect-section').style.display=this.checked?'none':'';
});
document.getElementById('al-cancel-btn')?.addEventListener('click',()=>{ document.getElementById('alarm-modal').style.display='none'; });
document.getElementById('al-save-btn')?.addEventListener('click',()=>{
  const hour=Math.max(0,Math.min(23,parseInt(document.getElementById('al-hour').value)||0));
  const min=Math.max(0,Math.min(59,parseInt(document.getElementById('al-min').value)||0));
  const repeat=document.getElementById('al-repeat').value;
  const days=[...document.querySelectorAll('.al-day-btn.active')].map(b=>+b.dataset.d);
  const triggerType=document.getElementById('al-type-effect').style.color==='rgb(122, 173, 255)'?'effect':'playlist';
  const overlayKeys=[...document.querySelectorAll('#al-overlays input:checked')].map(c=>c.value);
  const al={
    id:alarmEditIdx>=0?(alarms[alarmEditIdx].id||('al_'+Date.now())):'al_'+Date.now(),
    name:document.getElementById('al-name').value||'Timer',
    enabled:alarmEditIdx>=0?alarms[alarmEditIdx].enabled:true,
    hour,minute:min,repeat,days,triggerType,
    effect:document.getElementById('al-effect').value,
    overlayKeys,
    playlistName:document.getElementById('al-playlist').value,
    prealarm:{enabled:alarmSunriseOn,
      preMinutes:parseInt(document.getElementById('al-pre-mins').value)||15,
      startBright:parseInt(document.getElementById('al-dim-start').value)||5,
      windDown:document.getElementById('al-wind-down').value==='1',
      wdMinutes:parseInt(document.getElementById('al-wd-mins')?.value)||15,
      wdUseEffect:document.getElementById('al-wd-use-effect').checked,
      wdEffectKey:document.getElementById('al-wd-effect')?.value||'',
      wdOverlayKeys:[...document.querySelectorAll('#al-wd-overlays input:checked')].map(c=>c.value),
      giantSun:alarmGiantSunOn, wxRise:alarmWxRiseOn, effectRise:alarmEffectRiseOn, effectRiseKey:alarmEffectRiseKey, effectRiseCity:alarmEffectRiseCity, effectRiseOpts:alarmEffectRiseOpts},
    message:document.getElementById('al-message').value||'',
  };
  if(alarmEditIdx>=0){
    if(activeAlarm&&activeAlarm.al.id===alarms[alarmEditIdx].id){ activeAlarm.dismissed=true; activeAlarm=null; clearPending=true; }
    delete alarms[alarmEditIdx]._lastFireMin;
    alarms[alarmEditIdx]=al;
  } else alarms.push(al);
  alarmSave(); alarmBuildList();
  document.getElementById('alarm-modal').style.display='none';
});
// Style day buttons
document.querySelectorAll('.al-day-btn').forEach(b=>{
  b.style.cssText='flex:1;padding:4px 0;font-size:10px;background:rgba(30,40,80,0.6);border:1px solid rgba(80,120,255,0.2);color:#778;border-radius:3px;cursor:pointer;';
  b.addEventListener('click',()=>{
    const on=b.classList.toggle('active');
    b.style.background=on?'rgba(80,120,255,0.25)':'rgba(30,40,80,0.6)';
    b.style.borderColor=on?'rgba(80,120,255,0.6)':'rgba(80,120,255,0.2)';
    b.style.color=on?'#9bd':'#778';
  });
});

document.getElementById('alarm-section')?.querySelector('.section-head')?.addEventListener('click',()=>{ setTimeout(alarmBuildList,50); });
alarmBuildList();

// ── Weather Sunrise renderer — replaces giant sun with actual weather ──────
function renderWeatherSunrise(progress,startBrightPct){
  const S=SIZE, S1=S-1, SIDE=[2,0,3,1];
  const startBr=Math.max(startBrightPct/100,0.04);

  // Phase 1 (0-0.25): dark with dim background gradient
  // Phase 2 (0.25-0.75): weather fades in over dark background
  // Phase 3 (0.75-1.0): full brightness, weather fully visible

  // Background brightness
  let bgBright;
  if(progress<0.25){
    bgBright=startBr*0.3 + (progress/0.25)*startBr*0.4; // very dim
  } else {
    bgBright=Math.min(1, startBr*0.7+(progress-0.25)/0.75*(1-startBr*0.7));
  }

  // Sky colour fades from near-black → deep navy → current sky colour as weather reveals
  function skyCol(p){
    const stops=[[0,[4,2,14]],[0.25,[15,15,35]],[0.50,[25,30,60]],[0.75,[60,90,140]],[1.0,[100,160,220]]];
    let a=stops[0],b=stops[1];
    for(let i=0;i<stops.length-1;i++){
      if(p>=stops[i][0]&&p<stops[i+1][0]){a=stops[i];b=stops[i+1];break;}
    }
    const t=(p-a[0])/(b[0]-a[0]||1);
    return [(a[1][0]+(b[1][0]-a[1][0])*t)/255,
            (a[1][1]+(b[1][1]-a[1][1])*t)/255,
            (a[1][2]+(b[1][2]-a[1][2])*t)/255];
  }

  const [skR,skG,skB]=skyCol(progress);

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Fill background — gradient bright at bottom, dims at top, fades as progress rises
  for(const f of [4,...SIDE]){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[f][v*S+u]; if(idx<0) continue;
      const vFrac=v/S1;
      const gradStrength=Math.max(0,1-progress/0.85);
      const earlyBoost=Math.max(0,1-progress/0.25)*0.4;
      const gradBr=1.0-((1-vFrac)*(0.70+earlyBoost)*gradStrength);
      const br=bgBright*gradBr;
      colBuf[idx*3]=skR*br;
      colBuf[idx*3+1]=skG*br;
      colBuf[idx*3+2]=skB*br;
    }
  }

  // From 40% progress, overlay weather effect fading in
  // From 40% progress, overlay weather effect fading in
  if(progress>=0.40 && typeof effectWeather==='function'){
    const wxAlpha=Math.min(1,(progress-0.40)/0.45); // fully visible at 85%
    const savedBuf=new Float32Array(colBuf);
    effectWeather(16); // render weather into colBuf
    // Blend: dark background → full weather
    for(let i=0;i<N*3;i++){
      colBuf[i]=(savedBuf[i]*(1-wxAlpha)+colBuf[i]*wxAlpha)*bgBright;
    }
  }
}


// ── Countdown timer renderer ──────────────────────────────────────────────
function renderCountdown(timeStr,mirFaces){
  const SIDE=[2,0,3,1];
  const S=SIZE;
  const digitPatterns={
    '0':[[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
    '1':[[0,1,0],[0,1,0],[0,1,0],[0,1,0],[0,1,0]],
    '2':[[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
    '3':[[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
    '4':[[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
    '5':[[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
    '6':[[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
    '7':[[1,1,1],[0,0,1],[0,0,1],[0,0,1],[0,0,1]],
    '8':[[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
    '9':[[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
    ':':[[ 0,0,0],[0,1,0],[0,0,0],[0,1,0],[0,0,0]]
  };
  if(!mirFaces) mirFaces=[2,3];
  const scale=2;
  for(let fi=0;fi<4;fi++){
    const face=SIDE[fi];
    const mir=mirFaces.includes(face);
    const chars=timeStr.length;
    const charW=3*scale+scale;
    const totalW=chars*charW-scale;
    const startU=Math.round((S-totalW)/2);
    for(let ci=0;ci<chars;ci++){
      const ch=timeStr[ci];
      const pattern=digitPatterns[ch]||[];
      const charIdx=mir?chars-1-ci:ci;
      const baseU=startU+charIdx*charW;
      for(let row=0;row<5;row++){
        const bits=pattern[row]||[0,0,0];
        for(let col=0;col<3;col++){
          if(!bits[col]) continue;
          const srcCol=mir?2-col:col;
          for(let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++){
            const pu=baseU+srcCol*scale+dx;
            const pv=(4-row)*scale+dy+1;
            if(pu<0||pu>=S||pv<0||pv>=S) continue;
            const idx=faceMap[face][pv*S+pu]; if(idx<0) continue;
            colBuf[idx*3]=1.0;
            colBuf[idx*3+1]=1.0;
            colBuf[idx*3+2]=1.0;
          }
        }
      }
    }
  }
}


// ── Alarm check ────────────────────────────────────────────────────────────
function alarmCheck(){
  const now=new Date();
  const h=now.getHours(), m=now.getMinutes(), s=now.getSeconds(), ms=now.getMilliseconds();
  const dayMs=(h*60+m)*60000+s*1000+ms;
  const dow=now.getDay();

  for(const al of alarms){
    if(!al.enabled||activeAlarm) continue;
    const alMs=(al.hour*60+al.minute)*60000; // exact alarm time in ms

    const matchesDay=al.repeat==='daily'
      ||al.repeat==='hourly'
      ||(al.repeat==='weekdays'&&dow>=1&&dow<=5)
      ||(al.repeat==='weekends'&&(dow===0||dow===6))
      ||(al.repeat==='weekly'&&(al.days||[]).includes(dow))
      ||al.repeat==='once';

    if(!matchesDay) continue;

    if(al.repeat==='hourly'){
      if(m===al.minute&&s<3&&!activeAlarm&&al._lastFireMin!==((h*60+m))){ al._lastFireMin=(h*60+m); alarmFire(al,now); break; }
      continue;
    }

    // Wind down: triggers at alarm time and runs forward for wdMinutes
    if(al.prealarm?.windDown){
      const wdMs=(al.prealarm.wdMinutes||15)*60000;
      if(dayMs>=alMs&&dayMs<alMs+wdMs&&!activeAlarm){
        activeAlarm={al,phase:'pre',startMs:now.getTime()-(dayMs-alMs),preMs:wdMs,dismissed:false};
        break;
      }
      continue;
    }

    const preMs=(al.prealarm?.enabled?(al.prealarm.preMinutes||15):0)*60000;
    const preStart=alMs-preMs;

    if(al.prealarm?.enabled&&dayMs>=preStart&&dayMs<alMs){
      activeAlarm={al,phase:'pre',startMs:now.getTime(),preMs,dismissed:false};
      break;
    }
    // Trigger main alarm within first 3 seconds of the minute (covers 2s check interval)
    if(h===al.hour&&m===al.minute&&s<3&&al._lastFireMin!==(h*60+m)){
      al._lastFireMin=(h*60+m);
      alarmFire(al,now); break;
    }
  }
}

function alarmFire(al,now){
  const fireMs=now?now.getTime():Date.now();
  // Calculate duration: 10 minutes for pre-alarm sun effect, 1 minute for others
  const hasPreEffect=al.prealarm?.enabled&&(al.prealarm?.giantSun||al.prealarm?.effectRise);
  const durationMs=hasPreEffect?10*60*1000:1*60*1000;
  activeAlarm={al,phase:'main',startMs:fireMs,endMs:fireMs+durationMs,dismissed:false};
  if(al.triggerType==='playlist'&&al.playlistName){
    try{
      const pls=JSON.parse(localStorage.getItem('ledcube_playlists')||'[]');
      const pl=pls.find(p=>p.name===al.playlistName);
      if(pl){ currentPlaylist=pl.items; playlistIdx=0; playlistPlaying=true; }
    }catch(e){}
  } else if(al.effect&&al.effect!==''&&EFFECTS[al.effect]){
    currentEffect=al.effect;
    if(currentEffect==='f1') startF1SessionTimer(); else stopF1SessionTimer();
    panelEditorOn=false;
    document.querySelectorAll('.effect-btn').forEach(b=>b.classList.toggle('active',b.dataset.effect===al.effect));
  } else {
    // No effect selected - just show message on black
    currentEffect='';
    stopF1SessionTimer();
  }
  // Activate alarm overlays
  if(al.overlayKeys&&al.overlayKeys.length){
    for(const k of al.overlayKeys){
      if(OV[k]) OV[k].on=true;
      const item=document.getElementById('ovi-'+k);
      if(item) item.classList.add('ov-on');
      const chk=item?.querySelector('.ov-chk');
      if(chk) chk.checked=true;
    }
  }
  // Set full brightness at alarm time
  brightness=1;
  const bSlider=document.getElementById('bright-slider');
  if(bSlider) bSlider.value=100;
  // Message renders on cube (handled in animate loop)
  // Mark once-alarms as disabled
  if(al.repeat==='once') al.enabled=false;
  alarmSave(); alarmBuildList();
}

// ── Giant sun renderer for alarm ──────────────────────────────────────────
function renderGiantSun(progress,startBrightPct){
  const S=SIZE, S1=S-1, SIDE=[2,0,3,1];
  const startBr=Math.max(startBrightPct/100,0.04);
  const bgBright=progress<0.25
    ? startBr*0.4+(progress/0.25)*(1-startBr*0.4)*0.5
    : Math.min(1, 0.5+(progress-0.25)/0.65*0.5);
  const tt=Date.now()*0.001;

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Sky: dawn at start → full sky blue at alarm time
  // p=0: bottom=dark red/orange, top=deep indigo
  // p=1: uniform sky blue everywhere
  const p=progress;
  for(const f of [4,...SIDE]){
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[f][v*S+u]; if(idx<0) continue;
      const vFrac=v/S1;

      // Dawn bottom: warm orange/red
      const dBotR=220/255, dBotG=80/255, dBotB=15/255;
      // Dawn top: dark indigo
      const dTopR=10/255, dTopG=8/255, dTopB=35/255;
      // Sky blue (final)
      const skyR=90/255, skyG=170/255, skyB=255/255;

      // Dawn gradient (bottom→top)
      const dawnR=dBotR+(dTopR-dBotR)*vFrac;
      const dawnG=dBotG+(dTopG-dBotG)*vFrac;
      const dawnB=dBotB+(dTopB-dBotB)*vFrac;

      // Blend dawn→sky blue as progress increases
      const r=dawnR+(skyR-dawnR)*p;
      const g=dawnG+(skyG-dawnG)*p;
      const b=dawnB+(skyB-dawnB)*p;

      colBuf[idx*3]=r*bgBright;
      colBuf[idx*3+1]=g*bgBright;
      colBuf[idx*3+2]=b*bgBright;
    }
  }

  // ── Sun: cartoon yellow disc with orange-red rim gradient, subtle shimmer ──
  if(progress>0.08){
    const sunP=(progress-0.08)/0.92;
    const sunRad=Math.round(S*0.30);
    const sunCX=Math.round(S/2);
    const sunCY=Math.round(-sunRad*1.2+sunP*(S*0.55+sunRad*1.2));

    for(let fi=0;fi<4;fi++){
      const face=SIDE[fi];

      // Warm glow halo
      const glowRad=sunRad*3;
      for(let dv=-glowRad;dv<=glowRad;dv++){
        const v=sunCY+dv;
        if(v<0||v>=S) continue;
        for(let du=-glowRad;du<=glowRad;du++){
          const u=sunCX+du;
          if(u<0||u>=S) continue;
          const d=Math.sqrt(du*du+dv*dv);
          if(d>glowRad||d<=sunRad) continue;
          const idx=faceMap[face][v*S+u]; if(idx<0) continue;
          const gf=(d-sunRad)/(glowRad-sunRad);
          const glow=Math.pow(1-gf,2.2)*0.5;
          colBuf[idx*3]=Math.min(1,colBuf[idx*3]+glow*1.0);
          colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+glow*0.65);
          colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+glow*0.08);
        }
      }

      // Subtle sun rays radiating outward
      const numRays=12;
      const rayLen=Math.round(sunRad*2.5);
      for(let ri=0;ri<numRays;ri++){
        const baseAng=(ri/numRays)*Math.PI*2;
        const ang=baseAng+Math.sin(tt*0.8+ri*1.7)*0.12;
        const flicker=0.6+0.4*Math.sin(tt*1.5+ri*2.1);
        for(let d=sunRad+1;d<sunRad+rayLen;d++){
          const fade=(1-(d-sunRad)/rayLen)*0.25*flicker;
          if(fade<0.01) continue;
          const rv=Math.round(sunCY+Math.sin(ang)*d);
          const ru=Math.round(sunCX+Math.cos(ang)*d);
          if(rv<0||rv>=S||ru<0||ru>=S) continue;
          const idx=faceMap[face][rv*S+ru]; if(idx<0) continue;
          colBuf[idx*3]=Math.min(1,colBuf[idx*3]+fade*1.0);
          colBuf[idx*3+1]=Math.min(1,colBuf[idx*3+1]+fade*0.8);
          colBuf[idx*3+2]=Math.min(1,colBuf[idx*3+2]+fade*0.1);
        }
      }

      // Sun disc with gradient rim and shimmer
      for(let dv=-sunRad;dv<=sunRad;dv++){
        const v=sunCY+dv;
        if(v<0||v>=S) continue;
        for(let du=-sunRad;du<=sunRad;du++){
          const u=sunCX+du;
          if(u<0||u>=S) continue;
          const d=Math.sqrt(du*du+dv*dv);
          if(d>sunRad) continue;
          const idx=faceMap[face][v*S+u]; if(idx<0) continue;
          const edge=d/sunRad;
          const e2=edge*edge;
          let cr=1.0, cg=0.92-e2*0.35, cb=0.2-e2*0.18;
          const shimmer=0.96+0.04*Math.sin(tt*2.5+du*0.12+dv*0.12);
          colBuf[idx*3]=cr*shimmer;
          colBuf[idx*3+1]=cg*shimmer;
          colBuf[idx*3+2]=cb*shimmer;
        }
      }
    }
  }
}


function renderAlarmSunrise(progress,startBrightPct){
  // progress: 0=pre-alarm start, 1=alarm time (full brightness)
  const S=SIZE, SIDE=[2,0,3,1]; // east, south, west, north
  const bright=Math.max(startBrightPct/100,Math.pow(progress,1.8));

  // Sky colour: dark blue→purple→orange→yellow with progress
  const skyStops=[
    [0.00,[2,3,18]],[0.15,[8,5,22]],[0.30,[40,12,8]],
    [0.50,[90,40,10]],[0.70,[180,90,20]],[0.85,[50,130,220]],[1.00,[20,120,255]]
  ];
  let sa=skyStops[0],sb=skyStops[skyStops.length-1];
  for(let i=0;i<skyStops.length-1;i++){
    if(progress>=skyStops[i][0]&&progress<skyStops[i+1][0]){sa=skyStops[i];sb=skyStops[i+1];break;}
  }
  const sm=(progress-sa[0])/(sb[0]-sa[0]||1);
  const skyR=((sa[1][0]+(sb[1][0]-sa[1][0])*sm)/255)*bright;
  const skyG=((sa[1][1]+(sb[1][1]-sa[1][1])*sm)/255)*bright;
  const skyB=((sa[1][2]+(sb[1][2]-sa[1][2])*sm)/255)*bright;

  // Sun elevation rises from -0.05 to 0.45 over progress
  const sunElev=Math.max(0,progress*0.5-0.05);
  const HORIZ=0.32;

  for(let i=0;i<N*3;i++) colBuf[i]=0;

  // Top and bottom
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx=faceMap[4][v*S+u]; if(idx<0) continue;
    colBuf[idx*3]=skyR; colBuf[idx*3+1]=skyG; colBuf[idx*3+2]=skyB;
  }
  for(let v=0;v<S;v++) for(let u=0;u<S;u++){
    const idx=faceMap[5][v*S+u]; if(idx<0) continue;
    colBuf[idx*3]=0.04*bright; colBuf[idx*3+1]=0.06*bright; colBuf[idx*3+2]=0.01*bright;
  }

  // Side faces in panoramic order
  for(let fi=0;fi<4;fi++){
    const face=SIDE[fi];
    for(let v=0;v<S;v++) for(let u=0;u<S;u++){
      const idx=faceMap[face][v*S+u]; if(idx<0) continue;
      let r,g,b;
      const vf=v/S;
      if(vf<HORIZ){ r=0.04*bright;g=0.07*bright;b=0.02*bright; }
      else {
        const sf=(vf-HORIZ)/(1-HORIZ);
        const horizGlow=Math.max(0,1-progress/0.6)*0.8;
        r=Math.min(1,(skyR+horizGlow*0.9)*(1-sf*0.4));
        g=Math.min(1,(skyG+horizGlow*0.25)*(1-sf*0.3));
        b=Math.min(1,skyB*(1-sf*0.2));
      }
      colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
    }
  }

  // Sun: rises on face 0 (south) from below horizon
  const sunV=Math.round((HORIZ+sunElev*(1-HORIZ))*(S-1));
  const sunU=Math.round(S*0.5);
  const sunR=Math.min(1,(0.6+progress*0.4)*bright);
  const sunGlow=Math.max(0,progress-0.15);
  for(let dv=-8;dv<=8;dv++) for(let du=-8;du<=8;du++){
    const dist=Math.sqrt(du*du+dv*dv);
    const fv=sunV+dv,fu=sunU+du;
    if(fv<0||fv>=S||fu<0||fu>=S) continue;
    const idx=faceMap[0][fv*S+fu]; if(idx<0) continue;
    let rb=0,gb=0,bb=0;
    if(dist<2.5){ rb=sunR;gb=sunR*0.92;bb=sunR*0.5; }
    else if(dist<4.5){ const f2=(1-(dist-2.5)/2)*sunR*0.85; rb=f2;gb=f2*0.8;bb=f2*0.2; }
    else { const g2=Math.max(0,(1-(dist-4.5)/4)*sunGlow*0.5); rb=g2;gb=g2*0.6;bb=g2*0.1; }
    colBuf[idx*3]=Math.max(colBuf[idx*3],rb);
    colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],gb);
    colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],bb);
  }
  // Sun corona rays
  if(progress>0.3){
    const rayB=(progress-0.3)/0.7*bright*0.4;
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/6){
      for(let r2=3;r2<10;r2++){
        const ru=sunU+Math.round(Math.cos(angle)*r2);
        const rv=sunV+Math.round(Math.sin(angle)*r2);
        if(ru<0||ru>=S||rv<0||rv>=S) continue;
        const idx=faceMap[0][rv*S+ru]; if(idx<0) continue;
        const rb=rayB*(1-r2/10);
        colBuf[idx*3]=Math.max(colBuf[idx*3],rb);
        colBuf[idx*3+1]=Math.max(colBuf[idx*3+1],rb*0.7);
        colBuf[idx*3+2]=Math.max(colBuf[idx*3+2],rb*0.1);
      }
    }
  }
}

const GHOST_ALL_EFFECTS=null; // placeholder resolved at runtime

var startF1SessionTimer = function(){};
var stopF1SessionTimer = function(){};
let _f1Loaded = false, _f1Loading = false;
function _f1LoadScripts() {
  if (_f1Loaded || _f1Loading) return;
  _f1Loading = true;
  const scripts = ['f1-state.js?v=676','f1.js?v=676','f1-providers.js?v=676'];
  let idx = 0;
  function next() {
    if (idx >= scripts.length) {
      _f1Loaded = true; _f1Loading = false;
      EFFECTS.f1 = effectF1;
      if (currentEffect === 'f1' && typeof effectF1 === 'function') {
        var saved = localStorage.getItem('f1-mode') || 'openf1';
        f1SetMode(saved);
        document.querySelectorAll('[data-f1src]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.f1src === saved);
        });
        var simToggle = document.getElementById('f1-dev-toggle');
        if (simToggle) simToggle.style.display = saved === 'simulation' ? '' : 'none';
        startF1SessionTimer();
        f1DataDirty = true;
      }
      return;
    }
    const s = document.createElement('script');
    s.src = scripts[idx++];
    s.onload = next;
    s.onerror = () => { _f1Loading = false; };
    document.head.appendChild(s);
  }
  next();
}
function _f1Stub(dt) {
  _f1LoadScripts();
  if (_f1Loaded && typeof effectF1 === 'function') effectF1(dt);
}

const EFFECTS={
  wave:effectWave, rain:effectRain, plasma:effectPlasma, sphere:effectSphere,
  fireworks:effectFireworks, dna:effectDNA, datetime:effectDateTime,
  balls:effectBouncingBalls, sand:effectGravitySand, f1:_f1Stub,
  gradient_wash:effectGradientWash, aurora:effectAurora, depth_rings:effectDepthRings,
  prism:effectPrism, tide:effectTide, nebula:effectNebula,
  spectrum:effectSpectrum, maze:effectMaze,
  tron:effectTron, lightning:effectLightning, warp:effectWarp, life:effectLife, fluid:effectFluid,
  video:effectVideo, strobe:effectStrobe, random:effectRandom, random80s:effectRandom80s, ghost:effectGhost, lightspeed:effectLightspeed,
  custom_cube:effectCustomCube,
  weather:effectWeather,
  coinflip:effectCoinFlip,
  dice:effectDice,
  simhouse:effectSimHouse,
  retro:effectRetro,
  moon:effectMoon,
  neo:effectNEO,
  apod:effectAPOD,
  spaceweather:effectSpaceWeather,
  epic:effectEPIC,
  iss:effectISS,
};
const EFFECT_NAMES={
  wave:'Wave Cascade', rain:'Colour Rain', plasma:'Plasma Storm', sphere:'Laser Grid',
  fireworks:'Fireworks', dna:'DNA Helix', datetime:'Time & Date',
  balls:'Bouncing Balls', sand:'Gravity Sand', f1:'F1 Live',
  gradient_wash:'Rainbow Wash', aurora:'Aurora Borealis', depth_rings:'Depth Rings',
  prism:'Prism Sweep', tide:'Color Tide', nebula:'Nebula Drift',
  spectrum:'Spectrum Analyser', maze:'Maze Runner',
  tron:'Tron Bikes', lightning:'Lightning Storm', warp:'Warp Drive', life:'Crystal Life', fluid:'Liquid Crystal',
  video:'Video Display', strobe:'Strobe Flash', random:'Random 1', random80s:'Random 2', ghost:'Ghost Face', lightspeed:'Light Speed',
  custom_cube:'Custom Cube',
  weather:'Weather',
  coinflip:'Coin Flip',
  dice:'Dice Roll',
  simhouse:'Sim House',
  moon:'Celestial',
  neo:'Near-Earth Objects',
  apod:'Astronomy Pic of the Day',
  spaceweather:'Space Weather',
  epic:'Earth Live View',
  iss:'ISS Tracker',
};

// ═══════════════════════════════════════════════════
//  UI
// ═══════════════════════════════════════════════════
let effectsOn=true, clearPending=false;
// effectLabel writes the effect name into the #el-effect span so the
// adjacent #el-meta (size · fps) span is preserved.
const effectLabel=document.getElementById('el-effect')||document.getElementById('effect-label');
// toggleBtn removed — effects always on

// Effect → auto-expand linked options section
const EFFECT_SECTION_MAP = {
  spectrum:'spectrum', maze:'maze', tron:'tron', f1:'f1', video:'video', simhouse:'simhouse',
  balls:'',sand:'',lightning:'',warp:'',life:'',fluid:'',
};

const PANEL_EFFECTS = new Set(['spectrum','tron','maze','video','f1','datetime','strobe','rain','fireworks','lightspeed','custom_cube','weather','moon','coinflip','dice','balls','simhouse','retro','random']);
populateAlarmEffectRiseSelect(); // safe here — EFFECT_NAMES now defined

async function fetchCitiesFromAPI(){
  // City search now handled by live API in effects.js (wxUpdateCityDropdown)
}

// City autocomplete for alarm section only (weather uses live API in effects.js)
function updateCityDropdown(inputId, dropdownId){
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if(!input || !dropdown) return;

  const query = input.value.trim();
  if(query.length < 2){
    dropdown.style.display = 'none';
    return;
  }

  clearTimeout(dropdown._timer);
  dropdown._timer = setTimeout(() => {
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&format=json`)
      .then(r => r.json()).then(data => {
        const results = data.results || [];
        if(!results.length){ dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = results.map(r => {
          const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}${r.country ? ', ' + r.country : ''}`;
          return `<div style="padding:6px 8px;cursor:pointer;border-bottom:1px solid rgba(80,120,255,0.1);color:#9bd;font-size:12px;" data-city="${r.name}" data-lat="${r.latitude}" data-lon="${r.longitude}">${label}</div>`;
        }).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('[data-city]').forEach(el => {
          el.addEventListener('click', () => {
            input.value = el.dataset.city;
            dropdown.style.display = 'none';
            if(inputId === 'al-effect-rise-city') alarmEffectRiseCity = el.dataset.city;
          });
        });
      }).catch(() => {});
  }, 250);
}

document.getElementById('al-effect-rise-city')?.addEventListener('input', () => updateCityDropdown('al-effect-rise-city', 'al-effect-rise-city-dropdown'));
document.getElementById('al-effect-rise-city')?.addEventListener('focus', () => updateCityDropdown('al-effect-rise-city', 'al-effect-rise-city-dropdown'));

document.addEventListener('click', e => {
  if(!e.target.closest('#wx-city') && !e.target.closest('#wx-city-dropdown')){
    document.getElementById('wx-city-dropdown')?.style.setProperty('display', 'none');
  }
  if(!e.target.closest('#al-effect-rise-city') && !e.target.closest('#al-effect-rise-city-dropdown')){
    document.getElementById('al-effect-rise-city-dropdown')?.style.setProperty('display', 'none');
  }
});

// Delay custom graphics init until DOM is ready
let cgInitialized=false;
function initCGWhenReady(){
  if(cgInitialized || !document.getElementById('cg-canvas')) return;
  initCustomGraphicsEditor();
  document.getElementById('cg-open-btn')?.addEventListener('click',()=>{
    document.getElementById('cg-modal').style.display='flex';
  });
  cgInitialized=true;
}

// Custom graphics effect (registered after EFFECTS is available)
EFFECTS.customGraphics=(dt)=>{
  for(let face=0;face<6;face++){
    const data=customGraphics.faces.get('face'+face);
    if(!data) continue;
    const img=new Image();
    img.onload=()=>{
      const tc=document.createElement('canvas'); tc.width=tc.height=SIZE;
      const tx=tc.getContext('2d'); tx.drawImage(img,0,0,SIZE,SIZE);
      const id=tx.getImageData(0,0,SIZE,SIZE).data;
      for(let v=0;v<SIZE;v++) for(let u=0;u<SIZE;u++){
        const idx=faceMap[face][v*SIZE+u]; if(idx<0) continue;
        const p=(v*SIZE+u)*4;
        colBuf[idx*3]=id[p]/255; colBuf[idx*3+1]=id[p+1]/255; colBuf[idx*3+2]=id[p+2]/255;
      }
    };
    img.src=data;
  }
};



// Wire custom cube inline panel
document.getElementById('cc-load-btn')?.addEventListener('click',()=>{
  const sel=document.getElementById('cc-select');
  if(!sel||sel.value==='') return;
  try{
    const lib=JSON.parse(localStorage.getItem('ledcube_cubes')||'[]');
    const cube=lib[parseInt(sel.value)];
    if(!cube) return;
    _customCubeName=cube.name;
    _customCubeData=cube.faces;
    const act=document.getElementById('cc-active');
    if(act) act.textContent='Active: '+cube.name;
  } catch(e){}
});

// Refresh cc-select when custom_cube panel opens
const _origCCOpen=()=>ccRefreshSelect();
document.querySelector('[data-effect="custom_cube"]')?.addEventListener('click',()=>{ setTimeout(ccRefreshSelect,50); });

document.querySelectorAll('.effect-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const eff = btn.dataset.effect;

    // For retro/random parent: only toggle the panel, don't start the effect
    if(eff==='retro'||(eff==='random'&&btn.classList.contains('has-panel'))){
      const panelId=eff==='retro'?'panel-retro':'panel-random';
      const panel = document.getElementById(panelId);
      const isOpen = panel && panel.classList.contains('open');
      document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'));
      document.querySelectorAll('.effect-btn').forEach(b=>b.classList.remove('open'));
      if(!isOpen && panel){ panel.classList.add('open'); btn.classList.add('open'); }
      return;
    }

    if(!effectsOn){effectsOn=true;clearPending=false;effectsOn=true;}
    // Deactivate panel editor so the selected effect shows
    panelEditorOn=false;

    // Toggle inline panel if this button has one
    if(PANEL_EFFECTS.has(eff)){
      const panel = document.getElementById('panel-'+eff);
      const isOpen = panel && panel.classList.contains('open');
      // Close all panels first
      document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'));
      document.querySelectorAll('.effect-btn').forEach(b=>b.classList.remove('open'));
      if(!isOpen && panel){
        panel.classList.add('open');
        btn.classList.add('open');
      }
    } else {
      // No panel — close all open panels
      document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'));
      document.querySelectorAll('.effect-btn').forEach(b=>b.classList.remove('open'));
    }

    document.querySelectorAll('.effect-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentEffect = eff;
    if(currentEffect==='f1') startF1SessionTimer(); else stopF1SessionTimer();
    // Stop alarm if it's running and user switched effects
    if(activeAlarm){
      if(activeAlarm.phase==='done'){ brightness=1; if(mesh) mesh.material.color.setScalar(1); const bs=document.getElementById('bright-slider'); if(bs) bs.value='1'; }
      activeAlarm.dismissed=true; activeAlarm=null;
    }
    effectLabel.textContent=EFFECT_NAMES[currentEffect]||currentEffect;
    if(currentEffect==='rain') resetRain();
    if(currentEffect==='balls') resetBalls();
    if(currentEffect==='sand') resetSand();
    if(currentEffect==='maze') mazeOpen=null;
    if(currentEffect==='tron') tronTrail=null;
    else { const sb=document.getElementById('tron-scoreboard');if(sb)sb.style.display='none'; }
    if(currentEffect==='weather' && typeof wxFetch==='function' && !wxFetching) wxFetch();
    if(currentEffect==='warp') warpStars=[];
    if(currentEffect==='life') lifeGrid=null;
    if(currentEffect==='fluid') fluidH=null;
    fwParticles.length=0; t=0; sphT=0; _lgState='expand'; _lgStateT=0; _lgScanT=0; _lgBaseAngle=0; _lgFlatT=-1; _lgPulseT=-1; _lgColSweepT=-1; _lgWaveT=-1; _lgDblScanT=-1; _lgCollapsePhase=0; _lgRoutineIdx=0;
  });
});

// Retro "Show" button — starts the effect
document.getElementById('retro-show-btn')?.addEventListener('click',(e)=>{
  e.stopPropagation();
  if(!effectsOn){effectsOn=true;clearPending=false;effectsOn=true;}
  panelEditorOn=false;
  document.querySelectorAll('.effect-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('[data-effect="retro"]')?.classList.add('active');
  currentEffect='retro';
  effectLabel.textContent=EFFECT_NAMES['retro']||'retro';
});

// Retro game selection buttons
document.querySelectorAll('.retro-game-btn').forEach(btn=>{
  btn.addEventListener('click',(e)=>{
    e.stopPropagation();
    document.querySelectorAll('.retro-game-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    retroSelectedGame=parseInt(btn.dataset.retrogame);
  });
});
const retroSlider=document.getElementById('retro-rotate-slider');
if(retroSlider) retroSlider.addEventListener('input',()=>{ retroRotateInterval=parseInt(retroSlider.value); const v=document.getElementById('retro-rotate-val'); if(v)v.textContent=retroSlider.value; });
function updateRetroAutoGames(){
  const chks=document.querySelectorAll('.retro-auto-chk');
  const enabled=[];
  chks.forEach(c=>{ if(c.checked) enabled.push(parseInt(c.dataset.idx)); });
  retroAutoGames=enabled.length===chks.length?null:enabled;
}
document.querySelectorAll('.retro-auto-chk').forEach(c=>c.addEventListener('change',updateRetroAutoGames));

// Fireworks mode buttons
document.querySelectorAll('[data-shmode]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-shmode]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    shShadowMode=btn.dataset.shmode==='shadows';
  });
});
document.querySelectorAll('[data-fwmode]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-fwmode]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    fwMode=btn.dataset.fwmode;
    if(fwMode==='sync'){ fwSyncWait=0; fwSyncAct=0; fwSyncQueue.length=0; }
    if(fwMode==='mic') fwMicStart();
  });
});

// Bouncing balls mode
document.querySelectorAll('[data-ballmode]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-ballmode]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    ballCrossFaces=btn.dataset.ballmode==='cross';
  });
});
document.getElementById('ball-count')?.addEventListener('input',e=>{
  ballsPerFace=parseInt(e.target.value);
  document.getElementById('ball-count-val').textContent=ballsPerFace;
  balls.length=0;
});

// Fireworks scrolling text
document.getElementById('fw-text-on')?.addEventListener('change',e=>{
  fwTextOn=e.target.checked;
});
document.getElementById('fw-text-input')?.addEventListener('input',e=>{
  buildFwText(e.target.value);
});

// Effects toggle button removed — effects always on

document.getElementById('clear-all-btn')?.addEventListener('click',()=>{
  // Turn off all overlays
  Object.keys(OV).forEach(k=>{
    OV[k].on=false;
    const item=document.getElementById('ovi-'+k);
    if(item) item.classList.remove('ov-on');
    const chk=item?.querySelector('.ov-chk');
    if(chk) chk.checked=false;
  });
  // Clear display — turn off effects so buffer stays blank
  effectsOn=false;
  clearPending=true;
  for(let i=0;i<colBuf.length;i++) colBuf[i]=0;
});

// ═══════════════════════════════════════════════════
//  DISPLAY & VIEW CONTROLS
// ═══════════════════════════════════════════════════
let speedMult = 1, brightness = 1.15, rotSpeedMult = 1;
const autoRotateChk = document.getElementById('auto-rotate-chk');

document.getElementById('speed-slider')?.addEventListener('input', e => {
  speedMult = parseFloat(e.target.value);
  document.getElementById('speed-val').textContent = speedMult.toFixed(1) + 'x';
});

document.getElementById('bright-slider')?.addEventListener('input', e => {
  brightness = parseFloat(e.target.value);
  document.getElementById('bright-val').textContent = Math.round(brightness * 100) + '%';
  mesh.material.color.setScalar(brightness);
});
if (mesh) mesh.material.color.setScalar(brightness);

document.getElementById('rotspeed-slider')?.addEventListener('input', e => {
  rotSpeedMult = parseFloat(e.target.value);
  document.getElementById('rotspeed-val').textContent = rotSpeedMult.toFixed(1) + 'x';
});

autoRotateChk?.addEventListener('change', e => { autoRotate = e.target.checked; });

document.getElementById('reset-view-btn')?.addEventListener('click', () => {
  camera.position.set(200, 170, 340);
  camera.lookAt(0, 0, 0);
  _qRot.setFromAxisAngle(_yAxis, 0.3);
  _qDelta.setFromAxisAngle(_xAxis, -0.45);
  _qRot.multiplyQuaternions(_qDelta, _qRot);
  pivotGroup.quaternion.copy(_qRot);
  autoRotY = 0;
  autoRotate = true;
  if(autoRotateChk) autoRotateChk.checked = true;
});

document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange', () => {
  document.getElementById('fullscreen-btn').textContent =
    document.fullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
});

// ═══════════════════════════════════════════════════
//  OVERLAY UI HANDLERS
// ═══════════════════════════════════════════════════

// Checkbox toggle
document.querySelectorAll('.ov-chk').forEach(chk => {
  chk.addEventListener('change', () => {
    const ov=chk.dataset.ov;
    OV[ov].on=chk.checked;
    const item=document.getElementById(`ovi-${ov}`);
    if(item) item.classList.toggle('ov-on', chk.checked);
    // reset state on enable
    if(chk.checked){
      if(ov==='stars') ovStarData=null;
      if(ov==='snow') ovSnowParts=[];
      if(ov==='meteors') ovMeteorList=[];
      if(ov==='sparkle') ovSparkleList=[];
      if(ov==='fire') ovFireBufs=null;
      if(ov==='edgeglow') ovEdgeIdx=null;
    }
  });
});

// Sliders
document.querySelectorAll('.ov-sl').forEach(sl => {
  sl.addEventListener('input', () => {
    const ov=sl.dataset.ov, prop=sl.dataset.prop, val=parseFloat(sl.value);
    OV[ov][prop]=val;
    // update adjacent value display
    const vl=sl.parentElement.querySelector('.ov-vl');
    if(vl){
      if(prop==='density'&&ov==='stars') vl.textContent=val+'%';
      else if(prop==='density'||prop==='trail'||prop==='width') vl.textContent=val;
      else if(prop==='rate') vl.textContent=val.toFixed(1)+'/s';
      else if(prop==='intensity'||prop==='height'||prop==='depth'||prop==='radius') vl.textContent=Math.round(val*100)+'%';
      else vl.textContent=val.toFixed(1)+'x';
    }
    // force star rebuild on density change
    if(ov==='stars'&&prop==='density') ovStarData=null;
  });
});

// Color buttons
document.querySelectorAll('.ov-col').forEach(btn => {
  btn.addEventListener('click', () => {
    const ov=btn.dataset.ov;
    btn.closest('.opt-grid').querySelectorAll('.ov-col').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    OV[ov].color=btn.dataset.val;
    if(ov==='stars') ovStarData=null; // rebuild with new hues
  });
});

// ═══════════════════════════════════════════════════
//  AUDIO VISUALIZER & MAZE CONTROLS
// ═══════════════════════════════════════════════════
document.querySelectorAll('.au-style-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.au-style-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  auStyle = b.dataset.austyle;
  if(currentEffect !== 'spectrum'){
    const eb = document.querySelector('[data-effect="spectrum"]');
    if(eb) eb.click();
  }
}));

document.querySelectorAll('.au-col-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.au-col-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  auTheme = parseInt(b.dataset.aucol);
}));

document.querySelectorAll('.au-theme-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.au-theme-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  auTheme = parseInt(b.dataset.autheme);
}));

document.querySelectorAll('.au-barmode-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.au-barmode-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  auBarMode = b.dataset.barmode;
}));

document.getElementById('au-gain')?.addEventListener('input', e => {
  auGain = parseFloat(e.target.value);
  document.getElementById('au-gain-val').textContent = auGain.toFixed(1) + 'x';
});

// Spectrum scroll
document.getElementById('au-scroll-speed')?.addEventListener('input', e => {
  auScrollSpeed = parseFloat(e.target.value);
  document.getElementById('au-scroll-val').textContent =
    auScrollSpeed === 0 ? 'Off' : auScrollSpeed.toFixed(1) + 'x';
});
document.querySelectorAll('.au-dir-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.au-dir-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  auScrollDir = parseInt(b.dataset.dir);
}));

// Video display
document.getElementById('vid-file-btn')?.addEventListener('click', () =>
  document.getElementById('vid-file-input').click());

document.getElementById('vid-file-input')?.addEventListener('change', e => {
  if(e.target.files[0]){
    startVidFile(e.target.files[0]);
    if(currentEffect!=='video'){ const eb=document.querySelector('[data-effect="video"]'); if(eb) eb.click(); }
  }
});

document.getElementById('img-file-btn')?.addEventListener('click', () =>
  document.getElementById('img-file-input').click());

document.getElementById('img-file-input')?.addEventListener('change', e => {
  if(e.target.files[0]){
    loadImgFile(e.target.files[0]);
    if(currentEffect!=='video'){ const eb=document.querySelector('[data-effect="video"]'); if(eb) eb.click(); }
  }
});

document.getElementById('vid-screen-btn')?.addEventListener('click', () => {
  startVidSource('screen');
  if(currentEffect!=='video'){ const eb=document.querySelector('[data-effect="video"]'); if(eb) eb.click(); }
});

document.getElementById('vid-cam-btn')?.addEventListener('click', () => {
  startVidSource('webcam');
  if(currentEffect!=='video'){ const eb=document.querySelector('[data-effect="video"]'); if(eb) eb.click(); }
});

document.getElementById('vid-stop-btn')?.addEventListener('click', stopVid);

document.querySelectorAll('.vid-layout-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.vid-layout-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); vidLayout = b.dataset.layout;
}));

document.querySelectorAll('.vid-tb-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.vid-tb-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); vidTB = b.dataset.tb;
}));

document.getElementById('vid-bright')?.addEventListener('input', e => {
  vidBright = parseFloat(e.target.value);
  document.getElementById('vid-bright-val').textContent = vidBright.toFixed(1) + '×';
});
document.getElementById('vid-sat')?.addEventListener('input', e => {
  vidSat = parseFloat(e.target.value);
  document.getElementById('vid-sat-val').textContent = vidSat.toFixed(1) + '×';
});
document.getElementById('vid-scroll')?.addEventListener('input', e => {
  vidScrollSpeed = parseFloat(e.target.value);
  document.getElementById('vid-scroll-val').textContent =
    vidScrollSpeed === 0 ? 'Off' : (vidScrollSpeed > 0 ? '→ ' : '← ') + Math.abs(vidScrollSpeed).toFixed(1) + 'x';
});

document.getElementById('mic-btn')?.addEventListener('click', toggleMic);

// Collapsible sidebar sections
document.querySelectorAll('.section-head').forEach(h => h.addEventListener('click', () => {
  h.parentElement.classList.toggle('collapsed');
  // If opening a section that's NOT the panel editor, deactivate panel editor mode
  const isOpening = h.parentElement.classList.contains('collapsed') === false;
  const isPanelEditor = h.parentElement.id === 'panel-editor-section';
  if(isOpening && !isPanelEditor && panelEditorOn){
    panelEditorOn = false;
  }
}));
document.querySelectorAll('.sub-head').forEach(h => h.addEventListener('click', () => {
  h.parentElement.classList.toggle('collapsed');
}));
(function(){
  const active = document.querySelector('.effect-btn.active');
  if(active){
    const sub = active.closest('.sub-section');
    if(sub) sub.classList.remove('collapsed');
  }
})();

document.getElementById('mz-runners')?.addEventListener('input', e => {
  mazeRunnerCount = parseInt(e.target.value);
  document.getElementById('mz-runners-val').textContent = mazeRunnerCount;
  if(mazeOpen && mazeOpen.length===N) respawnRunners();  // restart race in same maze
});

document.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.swatch').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  mazeWallIdx = parseInt(b.dataset.mzwall);
}));

document.getElementById('new-maze-btn')?.addEventListener('click', () => {
  mazeOpen = null;
  if(currentEffect !== 'maze'){ const eb=document.querySelector('[data-effect="maze"]'); if(eb) eb.click(); }
});

// Tron Bikes controls
document.getElementById('tron-count')?.addEventListener('input', e => {
  tronBikeCount = parseInt(e.target.value);
  document.getElementById('tron-count-val').textContent = tronBikeCount;
  tronTrail = null;
});
document.getElementById('tron-speed')?.addEventListener('input', e => {
  tronSpeedMult = parseFloat(e.target.value);
  document.getElementById('tron-speed-val').textContent = tronSpeedMult.toFixed(1) + 'x';
});
document.querySelectorAll('[data-trongrid]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-trongrid]').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  tronGridTheme = parseInt(b.dataset.trongrid);
}));
document.getElementById('tron-border-check')?.addEventListener('change', e => {
  tronBorderWalls = e.target.checked;
  tronTrail = null;
});
document.getElementById('new-tron-btn')?.addEventListener('click', () => {
  tronTrail = null;
  if(currentEffect !== 'tron'){ const eb=document.querySelector('[data-effect="tron"]'); if(eb) eb.click(); }
});

// Gyroscope
const gyroChk = document.getElementById('gyro-chk');
const gyroStatus = document.getElementById('gyro-status');

gyroChk.addEventListener('change', async () => {
  gyroEnabled = gyroChk.checked;
  if(!gyroEnabled){ gyroStatus.textContent='Tilt device to steer sand/balls'; return; }
  // iOS 13+ requires permission
  if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    try{
      const perm = await DeviceOrientationEvent.requestPermission();
      if(perm !== 'granted'){ gyroEnabled=false; gyroChk.checked=false; gyroStatus.textContent='Permission denied'; return; }
    }catch(e){ gyroEnabled=false; gyroChk.checked=false; gyroStatus.textContent='Not available'; return; }
  }
  gyroStatus.textContent='Gyro active — tilt to steer!';
});

window.addEventListener('deviceorientation', e => {
  if(!gyroEnabled) return;
  const b=(e.beta||0)*Math.PI/180, g=(e.gamma||0)*Math.PI/180;
  gyroGX=Math.sin(g); gyroGY=-Math.cos(b)*Math.abs(Math.cos(g)); gyroGZ=Math.sin(b);
  const len=Math.sqrt(gyroGX*gyroGX+gyroGY*gyroGY+gyroGZ*gyroGZ)||1;
  gyroGX/=len; gyroGY/=len; gyroGZ/=len;
});

function activateF1Mode() {
  effectsOn = true;
  document.querySelectorAll('.effect-btn').forEach(b => b.classList.remove('active'));
  const f1Btn = document.querySelector('[data-effect="f1"]');
  if (f1Btn) f1Btn.classList.add('active');
  currentEffect = 'f1';
  startF1SessionTimer();
  effectLabel.textContent = 'F1 Live';
  t = 0;
}

// ── F1 Source selector ──
document.querySelectorAll('[data-f1src]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-f1src]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.f1src;
    const simToggle = document.getElementById('f1-dev-toggle');
    const simBody = document.getElementById('f1-dev-body');
    if (simToggle) {
      if (mode === 'simulation') {
        simToggle.style.display = '';
      } else {
        simToggle.style.display = 'none';
        if (simBody) simBody.style.display = 'none';
        if (simToggle) simToggle.textContent = '▸ Simulation Options';
      }
    }
    f1SetMode(mode);
    activateF1Mode();
  });
});

// ── F1 Dev Tools: session buttons ──
document.querySelectorAll('[data-f1sim]').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.f1sim;
    if (type === 'idle') { simNoSession(); }
    else { simSession(type.charAt(0).toUpperCase() + type.slice(1)); }
  });
});

// ── F1 Dev Tools: flag buttons ──
document.querySelectorAll('[data-f1flag]').forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.f1flag;
    if (f === 'blue' || f === 'bw') {
      const other = f === 'blue' ? 'bw' : 'blue';
      const otherBtn = document.querySelector(`[data-f1flag="${other}"]`);
      if (otherBtn && otherBtn.classList.contains('active')) {
        otherBtn.classList.remove('active');
        if (other === 'blue') { simBlueFlag(); } else { simBWFlag(); }
      }
      btn.classList.toggle('active');
    } else {
      document.querySelectorAll('[data-f1flag]').forEach(b => {
        if (b.dataset.f1flag !== 'blue' && b.dataset.f1flag !== 'bw') b.classList.remove('active');
      });
      btn.classList.add('active');
    }
    if (f === 'blue') { simBlueFlag(); }
    else if (f === 'bw') { simBWFlag(); }
    else if (f === 'finish') { simFinish(); }
    else if (f === 'sc') { simFlag('SAFETY', 'SAFETY CAR'); }
    else if (f === 'vsc') { simFlag('VIRTUAL', 'VIRTUAL SC'); }
    else if (f === 'doubleyellow') { simFlag('DOUBLE YELLOW', 'DOUBLE YELLOW'); }
    else { simFlag(f.toUpperCase(), f.toUpperCase()); }
  });
});

// ── F1 Dev Tools: weather buttons ──
document.querySelectorAll('[data-f1wx]').forEach(btn => {
  btn.addEventListener('click', () => simWeather(btn.dataset.f1wx));
});

// ── F1 Race Weekend Simulator ──
document.getElementById('f1-sim-weekend')?.addEventListener('click', () => {
  if (typeof simWeekendToggle === 'function') simWeekendToggle();
});
document.getElementById('f1-sim-racestart')?.addEventListener('click', () => {
  if (typeof simRaceStart === 'function') simRaceStart();
});
document.getElementById('f1-sim-speed')?.addEventListener('input', e => {
  _simWeekendSpeed = parseInt(e.target.value) || 10;
  const label = document.getElementById('f1-sim-speed-val');
  if (label) label.textContent = _simWeekendSpeed + 'x';
});

// ── F1 Dev Tools: collapsible toggles ──
document.getElementById('f1-dev-toggle')?.addEventListener('click', function() {
  const body = document.getElementById('f1-dev-body');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  this.textContent = (open ? '▸' : '▾') + ' Simulation Options';
});
document.getElementById('f1-diag-toggle')?.addEventListener('click', function() {
  const body = document.getElementById('f1-diag-body');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  this.textContent = (open ? '▸' : '▾') + ' Diagnostics';
  if (!open) _f1UpdateDiag();
});

// ── F1 Diagnostics updater ──
function _f1UpdateDiag() {
  const el = document.getElementById('f1-diag-content');
  if (!el) return;
  if (typeof F1State === 'undefined') { el.innerHTML = 'F1 module not loaded'; return; }
  const s = F1State;
  const ago = s.lastUpdate ? ((Date.now() - s.lastUpdate) / 1000).toFixed(1) + 's ago' : '--';
  el.innerHTML = [
    `Source: <b>${s.source}</b>`,
    `Connection: <b>${s.connection}</b>${s.connectionError ? ' — <span style="color:#f66">' + s.connectionError + '</span>' : ''}`,
    `Last Update: ${ago}`,
    `Packets: ${s.updateCount}`,
    `Reconnects: ${s.reconnectCount}`,
    `Circuit: <b>${s.session.circuit || s.meeting?.circuit_short_name || '--'}</b>`,
    `Country: ${s.session.country || s.meeting?.country_name || '--'}`,
    `Race: ${s.session.name || s.meeting?.meeting_name || '--'}`,
    `Date: ${s.session.dateStart || s.meeting?.date_start || '--'}`,
    `Session: <b>${s.session.type || 'none'}</b>${s.session.type && s.session.type.includes('qual') ? ' Q' + (s.session.qSession||1) : s.session.type && s.session.type.includes('prac') ? ' FP' + (s.session.fpSession||1) : ''} ${s.session.active ? '(active)' : ''}`,
    `Elapsed: ${Math.floor(s.session.timer.elapsed/60)}:${String(s.session.timer.elapsed%60).padStart(2,'0')} / ${Math.floor(s.session.timer.duration/60)}:${String(s.session.timer.duration%60).padStart(2,'0')}`,
    `Remaining: ${Math.floor(s.session.timer.remaining/60)}:${String(s.session.timer.remaining%60).padStart(2,'0')}`,
    `Lap: ${s.session.lap.current}/${s.session.lap.total}`,
    `Leader: <b>${s.drivers[0]?.name || s.drivers[0]?.abbrev || '--'}</b>`,
    `Flag: <b>${s.track.flag || 'none'}</b> RGB(${s.track.flagRGB ? s.track.flagRGB.map(c=>(c*255|0)).join(',') : '--'})`,
    `Track: ${s.track.statusText || '--'}`,
    `Weather: ${s.weather.temp != null ? s.weather.temp + '°C' : '--'} ${s.weather.humidity != null ? s.weather.humidity + '%' : ''} ${s.weather.wind != null ? s.weather.wind + 'km/h' : ''} ${s.weather.rain ? '🌧' : ''}`,
    s.track.raceControlMessages.length ? `RC: ${s.track.raceControlMessages[0].message}` : '',
    (function(){
      var ns = s.nextSession;
      if (!ns) return 'Next: <i>not available</i> (active=' + s.session.active + ', finished=' + s.session.finished + ')';
      var parts = ['Next: <b>' + (ns.session_name || ns.session_type || '') + '</b>'];
      if (ns.meeting_name) parts.push(ns.meeting_name);
      if (ns.circuit_short_name) parts.push(ns.circuit_short_name);
      if (ns.country_name) parts.push(ns.country_name);
      if (ns.date_start) {
        var d = new Date(ns.date_start);
        parts.push(d.toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}));
        parts.push(d.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}));
        var diff = d.getTime() - Date.now();
        if (diff > 0) {
          var h = Math.floor(diff/3600000), m = Math.floor((diff%3600000)/60000);
          parts.push(h >= 24 ? 'in ' + Math.floor(h/24) + 'd ' + (h%24) + 'h' : 'in ' + h + 'h ' + m + 'm');
        }
      }
      if (ns._estimated) parts.push('(estimated)');
      return parts.join(' · ');
    })()
  ].filter(Boolean).join('<br>');
}
document.addEventListener('f1-state-change', _f1UpdateDiag);
setInterval(() => {
  if (document.getElementById('f1-diag-body')?.style.display !== 'none') _f1UpdateDiag();
}, 2000);

// ── F1 Badge updater ──
document.addEventListener('f1-state-change', () => {
  const badge = document.getElementById('f1-badge');
  if (!badge) return;
  const s = F1State;
  badge.className = 'f1-badge';
  if (s.source === 'simulation') {
    badge.textContent = 'SIM';
    badge.classList.add('sim');
  } else if (s.connection === 'connected') {
    badge.textContent = 'LIVE';
    badge.classList.add('live');
  } else if (s.connection === 'connecting') {
    badge.textContent = '...';
    badge.classList.add('connecting');
  } else {
    badge.textContent = '';
  }
});

// ── F1 Status dot updater ──
document.addEventListener('f1-state-change', () => {
  const dot = document.getElementById('f1-status-dot');
  if (!dot) return;
  const c = F1State.connection;
  dot.style.background = c === 'transferring' ? '#3af' : c === 'connected' ? '#4f4' : c === 'connecting' ? '#ff0' : c === 'error' ? '#f44' : '#444';
});

let panel2dMode=false, panel2dZoom=60;
document.querySelectorAll('.size-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    if(btn.dataset.mode==='panel2d'){
      panel2dMode=true;
      initCube(64);
      document.getElementById('led-count-label').innerHTML = '64 × 64 · ' + (64*64).toLocaleString() + ' LEDs · 2D Panel';
      document.getElementById('cube-label').innerHTML = '64<sup>2</sup> 2D';
      // Hide 3D cube, show single flat panel view
      pivotGroup.visible=false;
      document.getElementById('panel2d-canvas')?.remove();
      const p2=document.createElement('canvas');
      p2.id='panel2d-canvas';
      p2.width=512; p2.height=512;
      p2.style.cssText='position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);image-rendering:pixelated;';
      document.getElementById('canvas-wrap').appendChild(p2);
      fitPanel2d();
      p2.addEventListener('wheel',e=>{
        e.preventDefault();
        const cur=parseInt(p2.style.width)||300;
        const next=Math.max(50,Math.min(2000,cur*(1-e.deltaY*0.001)));
        p2.style.width=next+'px';
        p2.style.height=next+'px';
      },{passive:false});
    } else {
      panel2dMode=false;
      pivotGroup.visible=true;
      document.getElementById('panel2d-canvas')?.remove();
      initCube(parseInt(btn.dataset.size));
    }
  });

// Spectrum analyser controls
document.querySelectorAll('.spectrum-bands-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.spectrum-bands-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    spectrumBandOverride = parseInt(btn.dataset.bands);
  });
});

document.getElementById('sp-fit-screen')?.addEventListener('change',(e)=>{
  spectrumFitToScreen = e.target.checked;
});

});

// Render panel2d after each frame
function renderPanel2d(){
  const c=document.getElementById('panel2d-canvas'); if(!c) return;
  const ctx=c.getContext('2d');
  const S=SIZE;
  const OUT=512;
  const cell=OUT/S;
  const r=cell*0.44;

  ctx.fillStyle='#000';
  ctx.fillRect(0,0,OUT,OUT);

  for(let v=0;v<S;v++){
    for(let u=0;u<S;u++){
      const idx=faceMap[0][v*S+u]; if(idx<0) continue;
      const R=Math.min(1,colBuf[idx*3]*brightness);
      const G=Math.min(1,colBuf[idx*3+1]*brightness);
      const B=Math.min(1,colBuf[idx*3+2]*brightness);
      const fv=S-1-v;
      const cx=(u+0.5)*cell;
      const cy=(fv+0.5)*cell;
      ctx.fillStyle=`rgb(${R*255|0},${G*255|0},${B*255|0})`;
      ctx.beginPath();
      ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.fill();
    }
  }

  ctx.strokeStyle='#99ddff';
  ctx.lineWidth=2;
  ctx.strokeRect(1,1,OUT-2,OUT-2);
}

// ═══════════════════════════════════════════════════
//  RENDER LOOP
// ═══════════════════════════════════════════════════
let lastTime=0, frames=0, fpsTime=0;
const fpsEl=document.getElementById('fps-counter');
const fpsSamples=new Float32Array(60);
let fpsSampleIdx=0, fpsSampleCount=0;
const elMeta=document.getElementById('el-meta');

// ═══════════════════════════════════════════════════
//  SIDEBAR COLLAPSE
// ═══════════════════════════════════════════════════
document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
  if (typeof toggleMenu === 'function') { toggleMenu(); return; }
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('sidebar-open-btn').classList.add('show');
  setTimeout(resize, 550);
});
document.getElementById('sidebar-open-btn')?.addEventListener('click', () => {
  if (typeof toggleMenu === 'function') { toggleMenu(); return; }
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('sidebar-open-btn').classList.remove('show');
  setTimeout(resize, 550);
});

// ═══════════════════════════════════════════════════
//  PLAYLIST — per-effect option definitions
// ═══════════════════════════════════════════════════
const PL_EFFECT_OPTS={
  fireworks:[
    {key:'fwMode',label:'Mode',type:'select',options:[['random','Random'],['sync','Sync Show'],['mic','Mic']]},
    {key:'fwTextOn',label:'Show Text',type:'toggle'},
    {key:'fwText',label:'Text',type:'text',placeholder:'Enter message…'},
  ],
  datetime:[
    {key:'dtMode',label:'Mode',type:'select',options:[['time','Time'],['date','Date'],['both','Both'],['full','Full'],['analogue','Analogue']]},
    {key:'dtAllPanels',label:'All Panels',type:'toggle'},
    {key:'dtScroll',label:'Scroll',type:'toggle'},
    {key:'dtScrollSpeed',label:'Scroll Speed',type:'range',min:-5,max:5,step:0.5,def:1},
  ],
  balls:[
    {key:'ballMode',label:'Mode',type:'select',options:[['cross','Cross Faces'],['own','Own Face']]},
    {key:'ballsPerFace',label:'Balls per face',type:'range',min:1,max:8,step:1,def:3},
  ],
  strobe:[
    {key:'strobeSpeed',label:'Speed',type:'range',min:0.5,max:20,step:0.5,def:5},
  ],
  spectrum:[
    {key:'auStyle',label:'Style',type:'select',options:[['bars','Bars'],['waterfall','Waterfall'],['tunnel','Tunnel'],['storm','Storm'],['ring','Ring']]},
    {key:'auTheme',label:'Theme',type:'range',min:0,max:5,step:1,def:0},
    {key:'auScrollSpeed',label:'Scroll Speed',type:'range',min:0,max:5,step:0.5,def:2.5},
  ],
  tron:[
    {key:'tronBikeCount',label:'Bikes',type:'range',min:2,max:8,step:1,def:4},
    {key:'tronStraightness',label:'Straightness',type:'range',min:0,max:1,step:0.05,def:0.72},
  ],
  maze:[
    {key:'mazeRunnerCount',label:'Runners',type:'range',min:1,max:6,step:1,def:3},
    {key:'mazeBrightWalls',label:'Bright Walls',type:'toggle'},
  ],
};

function plCaptureEffectOpts(effectKey){
  const opts={};
  const defs=PL_EFFECT_OPTS[effectKey];
  if(!defs) return opts;
  for(const d of defs){
    switch(d.key){
      case 'fwMode': opts.fwMode=fwMode; break;
      case 'fwTextOn': opts.fwTextOn=fwTextOn; break;
      case 'fwText': opts.fwText=document.getElementById('fw-text-input')?.value||''; break;
      case 'dtMode': opts.dtMode=dtMode; break;
      case 'dtAllPanels': opts.dtAllPanels=document.getElementById('dt-allpanels-check')?.checked||false; break;
      case 'dtScroll': opts.dtScroll=document.getElementById('dt-scroll-check')?.checked||false; break;
      case 'dtScrollSpeed': opts.dtScrollSpeed=parseFloat(document.getElementById('dt-scroll-speed')?.value||'1'); break;
      case 'ballMode': opts.ballMode=ballCrossFaces?'cross':'own'; break;
      case 'ballsPerFace': opts.ballsPerFace=ballsPerFace; break;
      case 'strobeSpeed': opts.strobeSpeed=parseFloat(document.getElementById('strobe-speed')?.value||'5'); break;
      case 'auStyle': opts.auStyle=auStyle; break;
      case 'auTheme': opts.auTheme=auTheme; break;
      case 'auScrollSpeed': opts.auScrollSpeed=auScrollSpeed; break;
      case 'tronBikeCount': opts.tronBikeCount=tronBikeCount; break;
      case 'tronStraightness': opts.tronStraightness=tronStraightness; break;
      case 'mazeRunnerCount': opts.mazeRunnerCount=mazeRunnerCount; break;
      case 'mazeBrightWalls': opts.mazeBrightWalls=mazeBrightWalls; break;
    }
  }
  return opts;
}

function plBuildEffectOptsHTML(effectKey, itemOpts, idx){
  const defs=PL_EFFECT_OPTS[effectKey];
  if(!defs||defs.length===0) return '';
  let h='<div style="margin-top:6px;padding:8px;background:rgba(60,100,180,0.08);border:1px solid rgba(80,120,255,0.15);border-radius:5px;">';
  h+='<div style="font-size:10px;color:rgba(140,180,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Effect Options</div>';
  for(const d of defs){
    const val=itemOpts&&itemOpts[d.key]!==undefined?itemOpts[d.key]:(d.def!==undefined?d.def:'');
    if(d.type==='select'){
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
      h+='<select class="pl-eff-opt" data-idx="'+idx+'" data-key="'+d.key+'" style="flex:1;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.25);color:#9cd;border-radius:4px;font-size:11px;">';
      for(const [ov,ol] of d.options){
        h+='<option value="'+ov+'"'+(val===ov?' selected':'')+'>'+ol+'</option>';
      }
      h+='</select></div>';
    } else if(d.type==='toggle'){
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;flex:1;">'+d.label+'</span>';
      h+='<label class="ov-toggle" style="margin-left:0;"><input type="checkbox" class="pl-eff-opt" data-idx="'+idx+'" data-key="'+d.key+'"'+(val?' checked':'')+'><span class="ov-slider"></span></label></div>';
    } else if(d.type==='range'){
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
      h+='<input type="range" class="pl-eff-opt" data-idx="'+idx+'" data-key="'+d.key+'" min="'+d.min+'" max="'+d.max+'" step="'+d.step+'" value="'+val+'" style="flex:1;">';
      h+='<span class="pl-eff-val" style="font-size:11px;color:#9cd;width:30px;text-align:center;">'+val+'</span></div>';
    } else if(d.type==='text'){
      h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
      h+='<input type="text" class="pl-eff-opt" data-idx="'+idx+'" data-key="'+d.key+'" value="'+(val||'').replace(/"/g,'&quot;')+'" placeholder="'+(d.placeholder||'')+'" style="flex:1;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.25);color:#9cd;border-radius:4px;font-size:11px;"></div>';
    }
  }
  h+='</div>';
  return h;
}

// ═══════════════════════════════════════════════════
//  PLAYLIST ENGINE
// ═══════════════════════════════════════════════════
const DEMO_PLAYLIST = [
  { effect:'plasma',       label:'Plasma Storm',          duration:8,  speedMult:1.3, overlays:{} },
  { effect:'wave',         label:'Wave Cascade + Stars',  duration:8,  speedMult:1.1, overlays:{stars:true} },
  { effect:'spectrum',     label:'Spectrum — Bars',       duration:10, speedMult:1,   auStyle:'bars',      auTheme:0, auScrollSpeed:2.5, overlays:{} },
  { effect:'fireworks',    label:'Fireworks',             duration:9,  speedMult:1,   overlays:{sparkle:true} },
  { effect:'aurora',       label:'Aurora + Edge Glow',    duration:9,  speedMult:0.85,overlays:{edgeglow:true} },
  { effect:'spectrum',     label:'Spectrum — Waterfall',  duration:10, speedMult:1,   auStyle:'waterfall', auTheme:2, auScrollSpeed:1.5, overlays:{} },
  { effect:'tron',         label:'Tron Bikes',            duration:18, speedMult:1,   tronBikeCount:4, tronStraightness:0.72, overlays:{} },
  { effect:'nebula',       label:'Nebula + Mist',         duration:9,  speedMult:0.9, overlays:{mist:true} },
  { effect:'maze',         label:'Maze Runner',           duration:18, speedMult:1,   mazeRunnerCount:3, mazeBrightWalls:true, overlays:{} },
  { effect:'spectrum',     label:'Spectrum — Tunnel',     duration:10, speedMult:1,   auStyle:'tunnel',    auTheme:3, auScrollSpeed:2.0, overlays:{} },
  { effect:'balls',        label:'Bouncing Balls + Fire', duration:9,  speedMult:1,   overlays:{fire:true},  ovBG:true },
  { effect:'warp',         label:'Warp Drive + Stars',    duration:9,  speedMult:1,   overlays:{stars:true}, ovBG:true },
  { effect:'depth_rings',  label:'Depth Rings + Wave',    duration:8,  speedMult:1.2, overlays:{colorwave:true} },
  { effect:'life',         label:'Crystal Life + Glow',   duration:10, speedMult:1,   overlays:{edgeglow:true} },
  { effect:'spectrum',     label:'Spectrum — Storm',      duration:10, speedMult:1,   auStyle:'storm', auTheme:1, overlays:{sparkle:true} },
];

let playlist = DEMO_PLAYLIST.map(it=>({...it,overlays:{...it.overlays}}));
let playlistOn=false, playlistIdx=0, playlistT=0, playlistLoop=true;

function applyPlaylistItem(item){
  if(!item) return;
  currentEffect=item.effect;
  if(currentEffect==='f1') startF1SessionTimer(); else stopF1SessionTimer();
  effectsOn=true;
  speedMult=item.speedMult!==undefined?item.speedMult:1;
  const spSl=document.getElementById('speed-slider');
  if(spSl){spSl.value=speedMult;document.getElementById('speed-val').textContent=speedMult.toFixed(1)+'x';}
  if(item.auStyle       !==undefined) auStyle=item.auStyle;
  if(item.auTheme       !==undefined) auTheme=item.auTheme;
  if(item.auScrollSpeed !==undefined){auScrollSpeed=item.auScrollSpeed;auScrollX=0;}
  if(item.tronStraightness!==undefined) tronStraightness=item.tronStraightness;
  if(item.tronBikeCount   !==undefined){tronBikeCount=item.tronBikeCount;tronTrail=null;}
  if(item.mazeBrightWalls !==undefined) mazeBrightWalls=item.mazeBrightWalls;
  if(item.mazeRunnerCount !==undefined) mazeRunnerCount=item.mazeRunnerCount;
  if(item.fwMode!==undefined) fwMode=item.fwMode;
  if(item.fwTextOn!==undefined){ fwTextOn=item.fwTextOn; const el=document.getElementById('fw-text-on'); if(el)el.checked=fwTextOn; }
  if(item.fwText!==undefined){ const el=document.getElementById('fw-text-input'); if(el){el.value=item.fwText; el.dispatchEvent(new Event('change'));} }
  if(item.dtMode!==undefined){ dtMode=item.dtMode; }
  if(item.dtAllPanels!==undefined){ const el=document.getElementById('dt-allpanels-check'); if(el)el.checked=item.dtAllPanels; }
  if(item.dtScroll!==undefined){ const el=document.getElementById('dt-scroll-check'); if(el)el.checked=item.dtScroll; }
  if(item.dtScrollSpeed!==undefined){ const el=document.getElementById('dt-scroll-speed'); if(el)el.value=item.dtScrollSpeed; }
  if(item.ballMode!==undefined){ ballCrossFaces=item.ballMode==='cross'; }
  if(item.ballsPerFace!==undefined){ ballsPerFace=item.ballsPerFace; }
  if(item.strobeSpeed!==undefined){ const el=document.getElementById('strobe-speed'); if(el)el.value=item.strobeSpeed; }
  Object.keys(OV).forEach(k=>OV[k].on=false);
  if(item.overlays) Object.entries(item.overlays).forEach(([k,v])=>{if(OV[k])OV[k].on=!!v;});
  overlaysBG=!!item.ovBG; ovBGBuf=null;
  if(currentEffect==='tron')  tronTrail=null;
  if(currentEffect==='maze')  mazeOpen=null;
  if(currentEffect==='warp')  warpStars=[];
  if(currentEffect==='life')  lifeGrid=null;
  if(currentEffect==='fluid') fluidH=null;
  fwParticles.length=0; t=0;
  document.querySelectorAll('.effect-btn').forEach(b=>b.classList.toggle('active',b.dataset.effect===currentEffect));
  document.querySelectorAll('.effect-panel').forEach(p=>p.classList.remove('open'));
  effectLabel.textContent=EFFECT_NAMES[currentEffect]||currentEffect;
  effectsOn=true;
}

let plTransT=0, plTransDur=1.2, plTransType=0, plTransActive=false;
let colBufPrev=null;

function plStartTransition(){
  if(!colBufPrev) colBufPrev=new Float32Array(N*3);
  colBufPrev.set(colBuf); // snapshot last frame of OLD effect
  plTransActive=true; plTransT=0;
  const sel=document.getElementById('pl-trans-type');
  const choice=sel?sel.value:'random';
  if(choice==='random') plTransType=Math.floor(Math.random()*3);
  else if(choice==='crossfade') plTransType=0;
  else if(choice==='flash') plTransType=1;
  else plTransType=2;
}

function plApplyTransition(){
  // Called every frame AFTER the new effect has written colBuf.
  // Blends frozen colBufPrev (old effect) over colBuf (new effect).
  if(!plTransActive||!colBufPrev) return;
  const p=Math.min(1,plTransT/plTransDur);
  const oldW=1-p;
  if(plTransType===0){
    for(let i=0;i<N*3;i++) colBuf[i]=colBufPrev[i]*oldW + colBuf[i]*p;
  } else if(plTransType===1){
    const flash=Math.max(0,0.8-Math.abs(p-0.35)*4);
    for(let i=0;i<N*3;i++) colBuf[i]=Math.min(1,colBufPrev[i]*oldW + colBuf[i]*p + flash);
  } else {
    const oldWarp=oldW*oldW;
    for(let i=0;i<N*3;i++) colBuf[i]=colBufPrev[i]*oldWarp + colBuf[i]*p;
  }
  if(p>=1){ plTransActive=false; colBufPrev=null; }
}

function advancePlaylist(dt){
  if(!playlistOn||playlist.length===0) return;
  if(plTransActive) plTransT+=dt;

  playlistT+=dt;
  const item=playlist[playlistIdx];
  if(item&&playlistT>=item.duration){
    playlistT=0; playlistIdx++;
    if(playlistIdx>=playlist.length){
      if(playlistLoop) playlistIdx=0;
      else{playlistOn=false;updatePlaylistUI();return;}
    }
    const transOn=document.getElementById('pl-transitions')?.checked!==false;
    if(transOn) plStartTransition();
    else for(let i=0;i<N*3;i++) colBuf[i]*=0.1;
    applyPlaylistItem(playlist[playlistIdx]);
    updatePlaylistUI();
  }
  const bar=document.getElementById('pl-progress-inner');
  if(bar&&item) bar.style.width=Math.min(100,(playlistT/item.duration*100)).toFixed(1)+'%';
}

function updatePlaylistUI(){
  const btn=document.getElementById('pl-play-btn');
  const info=document.getElementById('pl-info');
  if(!btn) return;
  btn.textContent=playlistOn?'⏸ Pause':'▶ Play';
  if(playlistOn&&playlist[playlistIdx])
    info.textContent=`${playlistIdx+1} / ${playlist.length}: ${playlist[playlistIdx].label}`;
  else info.textContent=`${playlist.length} item${playlist.length!==1?'s':''} ready`;
  const bar=document.getElementById('pl-progress-inner');
  if(bar&&!playlistOn) bar.style.width='0%';
}

const PLAYLIST_EFFECTS=Object.keys(EFFECTS);
const OV_LABELS={stars:'✨ Stars',snow:'❄️ Snow',meteors:'☄️ Meteors',edgeglow:'💡 Edge Glow',fire:'🔥 Fire',sparkle:'✦ Sparkle',colorwave:'🌈 Color Wave',pulse:'💓 Pulse',scanline:'📡 Scanline',vignette:'🌑 Vignette',glitch:'⚡ Glitch',mist:'🌫️ Mist',lightning:'⚡ Lightning'};
let savedPlaylists = JSON.parse(localStorage.getItem('ledcube_playlists')||'{}');
// Clean up any empty playlists saved by older broken versions
Object.keys(savedPlaylists).forEach(n=>{ if(!Array.isArray(savedPlaylists[n])||savedPlaylists[n].length===0) delete savedPlaylists[n]; });
try{ localStorage.setItem('ledcube_playlists',JSON.stringify(savedPlaylists)); }catch(e){}
let currentPlaylistName = null;

function savePlaylists(){ 
  try {
    const data = JSON.stringify(savedPlaylists);
    localStorage.setItem('ledcube_playlists', data);
    
  } catch(e) {
    console.error('localStorage save error:', e);
  }
}

function refreshSavedSelect(){
  const sel=document.getElementById('pl-saved-select');
  if(!sel) return;
  sel.innerHTML='<option value="">— choose —</option>';
  Object.keys(savedPlaylists).forEach(name=>{
    
    const o=document.createElement('option'); o.value=name; o.textContent=name; sel.appendChild(o);
  });
  
}
refreshSavedSelect();

document.getElementById('pl-saved-load')?.addEventListener('click',()=>{
  const name=document.getElementById('pl-saved-select')?.value;
  if(!name) return;
  const data = savedPlaylists[name];
  if(!data || !Array.isArray(data)) return;
  playlist = data.map(it=>({...it,overlays:{...(it.overlays||{})}}));
  currentPlaylistName=name;
  playlistIdx=0; playlistT=0; playlistOn=false;
  updatePlaylistUI();
});
document.getElementById('pl-saved-del')?.addEventListener('click',()=>{
  const name=document.getElementById('pl-saved-select')?.value;
  if(!name) return;
  if(!confirm(`Delete "${name}"?`)) return;
  delete savedPlaylists[name];
  if(currentPlaylistName===name) currentPlaylistName=null;
  savePlaylists(); refreshSavedSelect();
});

function renderPlaylistModal(){
  const modal = document.getElementById('pl-modal');
  
  // Build rows
  let rows = '';
  playlist.forEach(function(it, idx) {
    const active = playlistOn && idx === playlistIdx;
    const ovStr = Object.entries(it.overlays||{}).filter(function(e){return e[1];}).map(function(e){return OV_LABELS[e[0]]||e[0];}).join(', ')||'—';
    let rowOvChecks = '';
    Object.keys(OV_LABELS).forEach(function(k){
      const checked = it.overlays && it.overlays[k] ? 'checked' : '';
      rowOvChecks += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;color:#bbc;cursor:pointer;font-size:11px;">'
        + '<label class="ov-toggle" style="margin-left:0;"><input type="checkbox" class="row-ov-chk" data-idx="' + idx + '" data-key="' + k + '" ' + checked + '><span class="ov-slider"></span></label>'
        + OV_LABELS[k] + '</label>';
    });
    const bor = active ? '0.6' : '0.15';
    const bg = active ? '0.08' : '0.03';
    const numCol = active ? '#9fd' : '#667';
    const numW = active ? '700' : '400';
    const labCol = active ? '#9fd' : '#bcd';
    const upDis = idx===0 ? 'opacity:0.3;pointer-events:none;' : '';
    const dnDis = idx===playlist.length-1 ? 'opacity:0.3;pointer-events:none;' : '';
    rows += '<div style="border:1px solid rgba(80,120,255,' + bor + ');border-radius:7px;margin-bottom:5px;background:rgba(255,255,255,' + bg + ');">'
      + '<div class="pl-row" data-idx="' + idx + '" style="display:flex;align-items:center;gap:6px;padding:9px 10px;cursor:pointer;">'
      + '<span style="width:24px;text-align:center;font-size:13px;color:' + numCol + ';font-weight:' + numW + ';">' + (idx+1) + '</span>'
      + '<span style="flex:1;font-size:13px;color:' + labCol + ';">' + it.label + '</span>'
      + '<span style="font-size:11px;color:#99a;width:80px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;" title="' + ovStr + '">⊕ ' + ovStr + '</span>'
      + '<input type="number" class="pl-dur" data-idx="' + idx + '" value="' + it.duration + '" min="3" max="120" style="width:55px;padding:5px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.25);color:#9cd;border-radius:4px;font-size:12px;text-align:center;">'
      + '<div style="display:flex;gap:4px;">'
      + '<button class="pl-up" data-idx="' + idx + '" style="padding:4px 8px;background:rgba(80,120,255,0.12);border:1px solid rgba(80,120,255,0.25);color:#889;border-radius:4px;cursor:pointer;' + upDis + '">↑</button>'
      + '<button class="pl-dn" data-idx="' + idx + '" style="padding:4px 8px;background:rgba(80,120,255,0.12);border:1px solid rgba(80,120,255,0.25);color:#889;border-radius:4px;cursor:pointer;' + dnDis + '">↓</button>'
      + '<button class="pl-del" data-idx="' + idx + '" style="padding:4px 9px;background:rgba(200,40,40,0.15);border:1px solid rgba(200,40,40,0.3);color:#f88;border-radius:4px;cursor:pointer;font-weight:600;">✕</button>'
      + '</div></div>'
      + '<div class="pl-ov-panel" data-idx="' + idx + '" style="display:none;background:rgba(80,120,255,0.08);border-top:1px solid rgba(80,120,255,0.2);padding:10px;">'
      + plBuildEffectOptsHTML(it.effect, it, idx)
      + '<div style="margin-bottom:6px;margin-top:8px;color:#aac;font-weight:600;font-size:12px;">Overlays:</div>'
      + rowOvChecks
      + '</div></div>';
  });

  // Effect options
  let effectOpts = '';
  PLAYLIST_EFFECTS.forEach(function(k){ effectOpts += '<option value="' + k + '">' + (EFFECT_NAMES[k]||k) + '</option>'; });

  // Current name display
  const nameLabel = currentPlaylistName
    ? '<span style="color:#9fd;font-size:12px;">Editing: <b>' + currentPlaylistName + '</b></span>'
    : '<span style="color:#778;font-size:12px;font-style:italic;">Unsaved playlist</span>';

  const topHTML = '<div id="pl-modal-inner" style="position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:2000;overflow-y:auto;padding:16px;">'
    + '<div style="max-width:620px;margin:0 auto;background:rgba(12,18,40,0.99);border:1px solid rgba(80,120,255,0.35);border-radius:12px;padding:24px;">'
    + '<div style="display:flex;align-items:center;margin-bottom:16px;gap:12px;">'
    + '<h2 style="flex:1;margin:0;font-size:18px;color:#9fd;letter-spacing:2px;text-transform:uppercase;font-weight:700;">✏ Playlist Editor <span style="font-size:10px;color:#5a7;">v2</span></h2>'
    + '<button id="pl-modal-close" style="background:rgba(200,40,40,0.15);border:1px solid rgba(200,40,40,0.4);color:#f88;font-size:28px;cursor:pointer;padding:4px 12px;border-radius:6px;line-height:1;">×</button>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    + nameLabel
    + '<button id="pl-save-btn" style="padding:8px 20px;background:rgba(80,180,80,0.25);border:1px solid rgba(80,180,80,0.5);color:#8f8;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600;">💾 Save</button>'
    + '</div>'
    + '<div id="pl-item-list">' + rows + '</div>'
    + '<div style="border-top:1px solid rgba(80,120,255,0.2);padding-top:16px;margin-top:8px;">'
    + '<div style="font-size:13px;color:#9ad;letter-spacing:1px;margin-bottom:10px;font-weight:600;">ADD ITEM</div>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">'
    + '<select id="pl-add-effect" style="flex:1;min-width:160px;padding:8px 10px;background:rgba(12,18,40,0.9);border:1px solid rgba(80,120,255,0.3);color:#bbd;border-radius:5px;font-size:13px;">'
    + '<option value="">-- select effect --</option>' + effectOpts
    + '</select>'
    + '<span style="font-size:12px;color:#778;">Duration:</span>'
    + '<input type="number" id="pl-add-dur" value="8" min="3" max="120" style="width:52px;padding:8px 6px;background:rgba(12,18,40,0.9);border:1px solid rgba(80,120,255,0.3);color:#bbd;border-radius:5px;font-size:13px;text-align:center;">'
    + '<span style="font-size:12px;color:#667;">sec</span>'
    + '<button id="pl-add-btn" style="padding:8px 18px;background:rgba(80,120,255,0.2);border:1px solid rgba(100,150,255,0.4);color:#7aadff;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600;">+ Add</button>'
    + '</div>'
    + '<div id="pl-add-overlays" style="display:none;background:rgba(80,120,255,0.08);border:1px solid rgba(80,120,255,0.2);border-radius:5px;padding:10px;font-size:12px;"></div>'
    + '</div></div></div>';

  modal.innerHTML = topHTML;

  // Direct handler on the add button as primary path
  const addBtnEl = document.getElementById('pl-add-btn');
  if(addBtnEl){
    addBtnEl.onclick = function(){
      const sel = document.getElementById('pl-add-effect');
      const k = sel ? sel.value : '';
      const durEl = document.getElementById('pl-add-dur');
      const d = Math.max(3, parseInt(durEl ? durEl.value : 8)||8);
      if(!k){ alert('Select an effect from the dropdown first'); return; }
      const newItem = {effect:k, label:EFFECT_NAMES[k]||k, duration:d, speedMult:1, overlays:{}};
      Object.keys(OV_LABELS).forEach(function(ok){
        const chk = document.getElementById('pl-add-ov-'+ok);
        if(chk && chk.checked) newItem.overlays[ok] = true;
      });
      // Capture effect-specific options from the add panel
      document.querySelectorAll('.pl-add-eff-opt').forEach(function(el){
        const key=el.dataset.key;
        if(el.type==='checkbox') newItem[key]=el.checked;
        else if(el.type==='range'||el.type==='number') newItem[key]=parseFloat(el.value);
        else newItem[key]=el.value;
      });
      playlist.push(newItem);
      updatePlaylistUI();
      renderPlaylistModal();
    };
  }

  // Direct handler on the effect dropdown
  const addEffEl = document.getElementById('pl-add-effect');
  if(addEffEl){
    addEffEl.onchange = function(){
      const ovDiv = document.getElementById('pl-add-overlays');
      if(!ovDiv) return;
      if(!this.value){ ovDiv.style.display='none'; return; }
      const effKey=this.value;
      let h = '';
      // Effect-specific options
      const defs=PL_EFFECT_OPTS[effKey];
      if(defs&&defs.length>0){
        const captured=plCaptureEffectOpts(effKey);
        h+='<div style="margin-bottom:10px;padding:8px;background:rgba(60,100,180,0.08);border:1px solid rgba(80,120,255,0.15);border-radius:5px;">';
        h+='<div style="font-size:10px;color:rgba(140,180,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Effect Options</div>';
        for(const d of defs){
          const val=captured[d.key]!==undefined?captured[d.key]:(d.def!==undefined?d.def:'');
          if(d.type==='select'){
            h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
            h+='<select class="pl-add-eff-opt" data-key="'+d.key+'" style="flex:1;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.25);color:#9cd;border-radius:4px;font-size:11px;">';
            for(const [ov,ol] of d.options) h+='<option value="'+ov+'"'+(val===ov?' selected':'')+'>'+ol+'</option>';
            h+='</select></div>';
          } else if(d.type==='toggle'){
            h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;flex:1;">'+d.label+'</span>';
            h+='<label class="ov-toggle" style="margin-left:0;"><input type="checkbox" class="pl-add-eff-opt" data-key="'+d.key+'"'+(val?' checked':'')+'><span class="ov-slider"></span></label></div>';
          } else if(d.type==='range'){
            h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
            h+='<input type="range" class="pl-add-eff-opt" data-key="'+d.key+'" min="'+d.min+'" max="'+d.max+'" step="'+d.step+'" value="'+val+'" style="flex:1;">';
            h+='<span style="font-size:11px;color:#9cd;width:30px;text-align:center;">'+val+'</span></div>';
          } else if(d.type==='text'){
            h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;"><span style="font-size:11px;color:#bbc;width:90px;">'+d.label+'</span>';
            h+='<input type="text" class="pl-add-eff-opt" data-key="'+d.key+'" value="'+(val||'').replace(/"/g,'&quot;')+'" placeholder="'+(d.placeholder||'')+'" style="flex:1;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.25);color:#9cd;border-radius:4px;font-size:11px;"></div>';
          }
        }
        h+='</div>';
      }
      h+='<div style="margin-bottom:8px;color:#aac;font-weight:600;font-size:12px;">Include overlays:</div>';
      Object.keys(OV_LABELS).forEach(function(k){
        h += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;color:#bbc;cursor:pointer;font-size:11px;">'
          + '<label class="ov-toggle" style="margin-left:0;"><input type="checkbox" id="pl-add-ov-' + k + '"><span class="ov-slider"></span></label>'
          + OV_LABELS[k] + '</label>';
      });
      ovDiv.innerHTML = h;
      ovDiv.style.display = 'block';
    };
  }




  // Wire up all handlers directly now that elements exist
  document.getElementById('pl-modal-close').onclick = () => { modal.innerHTML=''; modal.style.display='none'; };
  document.getElementById('pl-modal-inner').onclick = (e) => { if(e.target.id==='pl-modal-inner') { modal.innerHTML=''; modal.style.display='none'; } };

  const saveBtn = document.getElementById('pl-save-btn');
  if(saveBtn) {
    saveBtn.onclick = () => {
      if(currentPlaylistName) {
        savedPlaylists[currentPlaylistName] = playlist.map(it => ({...it, overlays: {...(it.overlays||{})}}));
        savePlaylists(); 
        refreshSavedSelect();
        const sel2 = document.getElementById('pl-saved-select');
        if(sel2) sel2.value = currentPlaylistName;
        alert('✓ Saved: ' + currentPlaylistName);
      } else {
        const dialog = document.createElement('div');
        dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:3000;display:flex;align-items:center;justify-content:center;';
        dialog.innerHTML = '<div style="background:rgba(12,18,40,0.99);border:2px solid rgba(80,120,255,0.5);border-radius:10px;padding:24px;max-width:400px;width:90%;">'
          + '<h3 style="color:#9fd;margin:0 0 16px 0;font-size:16px;">Save Playlist As</h3>'
          + '<input type="text" id="pl-name-input" placeholder="Enter playlist name" style="width:100%;padding:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(80,120,255,0.3);color:#bbd;border-radius:5px;font-size:14px;box-sizing:border-box;margin-bottom:16px;">'
          + '<div style="display:flex;gap:10px;justify-content:flex-end;">'
          + '<button id="pl-name-cancel" style="padding:8px 16px;background:rgba(200,40,40,0.2);border:1px solid rgba(200,40,40,0.4);color:#f88;border-radius:5px;cursor:pointer;font-weight:600;">Cancel</button>'
          + '<button id="pl-name-ok" style="padding:8px 16px;background:rgba(80,180,80,0.25);border:1px solid rgba(80,180,80,0.5);color:#8f8;border-radius:5px;cursor:pointer;font-weight:600;">Save</button>'
          + '</div></div>';
        document.body.appendChild(dialog);
        const inp = document.getElementById('pl-name-input');
        inp.focus();
        inp.select();
        document.getElementById('pl-name-ok').onclick = () => {
          let name = inp.value.trim();
          if(!name) { alert('Name cannot be empty'); return; }
          
          currentPlaylistName = name;
          savedPlaylists[name] = playlist.map(it => ({...it, overlays: {...(it.overlays||{})}}));
          
          savePlaylists(); 
          refreshSavedSelect();
          const sel2 = document.getElementById('pl-saved-select');
          if(sel2) sel2.value = name;
          dialog.remove();
          alert('✓ Saved: ' + name);
          renderPlaylistModal();
        };
        document.getElementById('pl-name-cancel').onclick = () => { dialog.remove(); };
        inp.onkeydown = (e) => { if(e.key==='Enter') document.getElementById('pl-name-ok').click(); if(e.key==='Escape') dialog.remove(); };
      }
    };
  }

  // Row actions
  modal.querySelectorAll('.pl-row').forEach(row => {
    row.onclick = (e) => {
      if(e.target.closest('button')||e.target.tagName==='INPUT') return;
      const idx = parseInt(row.dataset.idx);
      const panel = modal.querySelector(`.pl-ov-panel[data-idx="${idx}"]`);
      if(panel) panel.style.display = panel.style.display==='block' ? 'none' : 'block';
    };
  });
  modal.querySelectorAll('.pl-dur').forEach(inp => {
    inp.onchange = () => { playlist[parseInt(inp.dataset.idx)].duration = Math.max(3,parseInt(inp.value)||8); };
  });
  modal.querySelectorAll('.pl-up').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const i=parseInt(btn.dataset.idx); if(i>0){[playlist[i],playlist[i-1]]=[playlist[i-1],playlist[i]]; renderPlaylistModal(); updatePlaylistUI();} };
  });
  modal.querySelectorAll('.pl-dn').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const i=parseInt(btn.dataset.idx); if(i<playlist.length-1){[playlist[i],playlist[i+1]]=[playlist[i+1],playlist[i]]; renderPlaylistModal(); updatePlaylistUI();} };
  });
  modal.querySelectorAll('.pl-del').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); const i=parseInt(btn.dataset.idx); playlist.splice(i,1); if(playlistIdx>=playlist.length) playlistIdx=Math.max(0,playlist.length-1); renderPlaylistModal(); updatePlaylistUI(); };
  });
  modal.querySelectorAll('.row-ov-chk').forEach(chk => {
    chk.onchange = () => {
      const idx = parseInt(chk.dataset.idx);
      if(!playlist[idx].overlays) playlist[idx].overlays = {};
      playlist[idx].overlays[chk.dataset.key] = chk.checked;
    };
  });
  modal.querySelectorAll('.pl-eff-opt').forEach(el => {
    const handler = () => {
      const idx = parseInt(el.dataset.idx);
      const key = el.dataset.key;
      if(el.type==='checkbox') playlist[idx][key]=el.checked;
      else if(el.type==='range'||el.type==='number'){ playlist[idx][key]=parseFloat(el.value); const valSpan=el.nextElementSibling; if(valSpan&&valSpan.classList.contains('pl-eff-val')) valSpan.textContent=el.value; }
      else playlist[idx][key]=el.value;
    };
    el.onchange = handler;
    if(el.type==='range') el.oninput = handler;
  });
}

document.getElementById('pl-play-btn')?.addEventListener('click',()=>{if(!playlist.length) return;playlistOn=!playlistOn;if(playlistOn){effectsOn=true;effectsOn=true;applyPlaylistItem(playlist[playlistIdx]);}updatePlaylistUI();});
document.getElementById('pl-stop-btn')?.addEventListener('click',()=>{playlistOn=false;playlistIdx=0;playlistT=0;updatePlaylistUI();});
document.getElementById('pl-skip-btn')?.addEventListener('click',()=>{if(!playlist.length) return;playlistT=0; playlistIdx=(playlistIdx+1)%playlist.length;if(playlistOn) applyPlaylistItem(playlist[playlistIdx]);updatePlaylistUI();});
document.getElementById('pl-loop')?.addEventListener('change',e=>{playlistLoop=e.target.checked;});
document.getElementById('pl-new-btn')?.addEventListener('click',()=>{playlist=[];currentPlaylistName=null;playlistOn=false;playlistIdx=0;playlistT=0;updatePlaylistUI();const m=document.getElementById('pl-modal');m.style.display='block';renderPlaylistModal();});
document.getElementById('pl-edit-btn')?.addEventListener('click',()=>{const m=document.getElementById('pl-modal');m.style.display='block';renderPlaylistModal();});
document.querySelectorAll('.effect-btn').forEach(btn=>btn.addEventListener('click',()=>{if(playlistOn){playlistOn=false;updatePlaylistUI();}}));
updatePlaylistUI();

// Rain style buttons
let rainStyle='colour';
document.querySelectorAll('.rain-style-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.rain-style-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  rainStyle=b.dataset.rainstyle;
}));
document.querySelectorAll('.strobe-mode-btn').forEach(b=>b.addEventListener('click',()=>{
  if (b.dataset.f1flag === 'blue' || b.dataset.f1flag === 'bw') return;
  const parent=b.parentElement;
  parent.querySelectorAll('.strobe-mode-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
}));
document.getElementById('strobe-speed')?.addEventListener('input',e=>{
  document.getElementById('strobe-speed-val').textContent=parseFloat(e.target.value).toFixed(1)+'/s';
});

// Lightspeed controls
document.querySelectorAll('[data-strobe]').forEach(b=>b.addEventListener('click',()=>{
  b.parentElement.querySelectorAll('[data-strobe]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  strobeMode=b.dataset.strobe;
}));

document.querySelectorAll('[data-scol]').forEach(b=>b.addEventListener('click',()=>{
  b.parentElement.querySelectorAll('[data-scol]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  strobeColor=b.dataset.scol;
}));

document.querySelectorAll('[data-dtmode]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-dtmode]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  dtMode=b.dataset.dtmode;
  dtLastSec=-1; // force re-render
}));
document.getElementById('coin-speed')?.addEventListener('input',e=>{
  coinSpeed=parseFloat(e.target.value);
  document.getElementById('coin-speed-val').textContent=coinSpeed+'x';
});
document.getElementById('dice-roll-btn')?.addEventListener('click',()=>{
  if(!diceRolling) diceStartRoll();
});
document.getElementById('dice-auto-check')?.addEventListener('change',e=>{
  diceAutoRoll=e.target.checked;
  diceAutoTimer=0;
});
document.getElementById('ls-speed')?.addEventListener('input',e=>{
  lsSpeed=parseFloat(e.target.value);
  document.getElementById('ls-speed-val').textContent=lsSpeed;
  lsRacers=[];
});
document.getElementById('ls-trail')?.addEventListener('input',e=>{
  lsTrail=parseInt(e.target.value);
  document.getElementById('ls-trail-val').textContent=lsTrail;
});
document.getElementById('ls-count')?.addEventListener('input',e=>{
  lsCount=parseInt(e.target.value);
  document.getElementById('ls-count-val').textContent=lsCount;
  lsRacers=[];
});
document.querySelectorAll('[data-ls-nudge]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-ls-nudge]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    lsNudge=parseFloat(btn.dataset.lsNudge);
  });
});
document.querySelectorAll('[data-ls-size]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-ls-size]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    lsSize=parseInt(btn.dataset.lsSize);
    lsRacers=[];
  });
});
document.querySelectorAll('[data-ls-col]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-ls-col]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    lsColour=btn.dataset.lsCol;
  });
});

// ESP32 OTA upload
async function esp32Upload(){
  const ip=document.getElementById('esp32-ip').value.trim();
  const statusEl=document.getElementById('esp32-status');
  if(!ip){statusEl.textContent='Enter ESP32 IP address';return;}
  statusEl.style.color='#aad';
  statusEl.textContent='Fetching firmware…';
  try{
    const res=await fetch(window.location.href);
    const html=await res.text();
    const blob=new Blob([html],{type:'text/html'});
    const form=new FormData();
    form.append('file',blob,'index.html');
    statusEl.textContent='Uploading firmware…';
    const up=await fetch('http://'+ip+'/update',{method:'POST',body:form});
    if(up.ok){statusEl.style.color='#8f8';statusEl.textContent='✓ Firmware uploaded! ESP32 restarting…';}
    else{statusEl.style.color='#f88';statusEl.textContent='Upload failed: HTTP '+up.status;}
  }catch(e){
    statusEl.style.color='#f88';
    statusEl.textContent='Error: '+e.message+'. Check IP & CORS.';
  }
}



// ── CUSTOM GRAPHICS EDITOR ──
const customGraphics={faces:new Map()};
let cgCurrentFace=0,cgTool='pen',cgColour='#ff6600',cgBrushSize=3,cgIsDrawing=false;
let cgCanvas=null,cgCtx=null;
const cgHistory=[];

function initCustomGraphicsEditor(){
  cgCanvas=document.getElementById('cg-canvas');
  cgCtx=cgCanvas.getContext('2d',{willReadFrequently:true});
  
  document.getElementById('cg-close-btn').onclick=()=>{document.getElementById('cg-modal').style.display='none';}
  document.getElementById('cg-tool').onchange=(e)=>{cgTool=e.target.value;}
  document.getElementById('cg-colour').onchange=(e)=>{cgColour=e.target.value;}
  document.getElementById('cg-brush-size').onchange=(e)=>{cgBrushSize=parseInt(e.target.value);document.getElementById('cg-brush-label').textContent=cgBrushSize+'px';}
  document.getElementById('cg-clear-btn').onclick=()=>{cgCtx.clearRect(0,0,256,256);cgHistory.length=0;saveCanvasState();}
  document.getElementById('cg-undo-btn').onclick=()=>{if(cgHistory.length>0){cgHistory.pop();redrawCanvas()}}
  document.getElementById('cg-save-btn').onclick=()=>{saveGraphicsToEffect();}
  
  document.querySelectorAll('.cg-face-btn').forEach(b=>{
    b.onclick=(e)=>{
      cgCurrentFace=parseInt(e.target.dataset.face);
      document.querySelectorAll('.cg-face-btn').forEach(x=>x.style.borderColor='#555');
      e.target.style.borderColor='#7aadff';
      loadCanvasForFace(cgCurrentFace);
    }
  });
  
  cgCanvas.onmousedown=(e)=>{cgIsDrawing=true;cgHistory.push(cgCtx.getImageData(0,0,256,256));startDrawing(e);}
  cgCanvas.onmousemove=(e)=>{if(cgIsDrawing)drawContinue(e);}
  cgCanvas.onmouseup=()=>{cgIsDrawing=false;saveCanvasState();}
  cgCanvas.onmouseleave=()=>{cgIsDrawing=false;}
  
  loadCanvasForFace(0);
  document.querySelectorAll('.cg-face-btn')[0].style.borderColor='#7aadff';
}

function loadCanvasForFace(face){
  cgCtx.clearRect(0,0,256,256);
  const data=customGraphics.faces.get('face'+face);
  if(data){
    const img=new Image();
    img.onload=()=>cgCtx.drawImage(img,0,0);
    img.src=data;
  }
}

function saveCanvasState(){
  customGraphics.faces.set('face'+cgCurrentFace,cgCanvas.toDataURL());
}

function redrawCanvas(){
  cgCtx.clearRect(0,0,256,256);
  if(cgHistory.length>0) cgCtx.putImageData(cgHistory[cgHistory.length-1],0,0);
}

function getCanvasPos(e){
  const rect=cgCanvas.getBoundingClientRect();
  return {x:Math.floor((e.clientX-rect.left)*(256/rect.width)),y:Math.floor((e.clientY-rect.top)*(256/rect.height))}
}

function startDrawing(e){
  if(cgTool==='fill'){floodFill(getCanvasPos(e));}
  else drawContinue(e);
}

function drawContinue(e){
  const pos=getCanvasPos(e);
  cgCtx.fillStyle=cgColour;
  cgCtx.strokeStyle=cgColour;
  cgCtx.lineWidth=cgBrushSize;
  cgCtx.lineCap='round';
  
  if(cgTool==='pen'){cgCtx.fillRect(pos.x-cgBrushSize/2,pos.y-cgBrushSize/2,cgBrushSize,cgBrushSize);}
  else if(cgTool==='eraser'){cgCtx.clearRect(pos.x-cgBrushSize,pos.y-cgBrushSize,cgBrushSize*2,cgBrushSize*2);}
}

function floodFill(pos){
  const imageData=cgCtx.getImageData(0,0,256,256);
  const data=imageData.data;
  const targetColor=[0,0,0,0];
  if(pos.x>=0&&pos.x<256&&pos.y>=0&&pos.y<256){
    const idx=(pos.y*256+pos.x)*4;
    targetColor[0]=data[idx];targetColor[1]=data[idx+1];targetColor[2]=data[idx+2];targetColor[3]=data[idx+3];
  }
  const newColor=cgColour.match(/\d+/g).map(x=>parseInt(x));
  const stack=[pos];
  while(stack.length>0){
    const p=stack.pop();
    if(p.x<0||p.x>=256||p.y<0||p.y>=256)continue;
    const i=(p.y*256+p.x)*4;
    if(data[i]===targetColor[0]&&data[i+1]===targetColor[1]&&data[i+2]===targetColor[2]){
      data[i]=newColor[0];data[i+1]=newColor[1];data[i+2]=newColor[2];data[i+3]=255;
      stack.push({x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1});
    }
  }
  cgCtx.putImageData(imageData,0,0);
}

function getCGLibrary(){
  try{
    const lib=JSON.parse(localStorage.getItem('cgDesigns')||'[]');
    if(lib.length===0){
      const old=localStorage.getItem('cgGraphics');
      if(old){
        const entry={name:'Untitled',faces:JSON.parse(old)};
        lib.push(entry);
        localStorage.setItem('cgDesigns',JSON.stringify(lib));
        localStorage.removeItem('cgGraphics');
      }
    }
    return lib;
  }catch(e){return[];}
}
function saveCGLibrary(lib){localStorage.setItem('cgDesigns',JSON.stringify(lib));}

function updateCGLoadDropdown(){
  const sel=document.getElementById('cg-load-select');
  if(!sel) return;
  sel.innerHTML='<option value="">— choose design —</option>';
  const lib=getCGLibrary();
  for(const d of lib){
    const opt=document.createElement('option');
    opt.value=d.name;
    opt.textContent=d.name;
    sel.appendChild(opt);
  }
}

function saveGraphicsToEffect(){
  saveCanvasState();
  const nameEl=document.getElementById('cg-name-input');
  let name=(nameEl?nameEl.value:'').trim();
  if(!name){name=prompt('Enter a name for this design:');if(!name)return;name=name.trim();}
  if(!name)return;
  if(customGraphics.faces.size===0){alert('Nothing to save — draw on at least one face first.');return;}
  const lib=getCGLibrary();
  const existing=lib.findIndex(d=>d.name===name);
  const entry={name,faces:Array.from(customGraphics.faces.entries())};
  if(existing>=0) lib[existing]=entry; else lib.push(entry);
  saveCGLibrary(lib);
  if(nameEl) nameEl.value='';
  updateCGLoadDropdown();
  alert('Design "'+name+'" saved!');
  applyCustomGraphicsEffect();
}

function applyCustomGraphicsEffect(){
  currentEffect='customGraphics';
  const btn=document.querySelector('[data-effect="customGraphics"]');
  if(btn)btn.click();
}

document.getElementById('cg-save-named-btn')?.addEventListener('click',()=>{saveGraphicsToEffect();});

document.getElementById('cg-apply-btn')?.addEventListener('click',()=>{
  const sel=document.getElementById('cg-load-select');
  const name=sel?.value;
  if(!name){alert('Select a design first');return;}
  const lib=getCGLibrary();
  const design=lib.find(d=>d.name===name);
  if(!design){alert('Design not found');return;}
  customGraphics.faces=new Map(design.faces);
  loadCanvasForFace(cgCurrentFace);
  applyCustomGraphicsEffect();
});

document.getElementById('cg-del-btn')?.addEventListener('click',()=>{
  const sel=document.getElementById('cg-load-select');
  const name=sel?.value;
  if(!name){alert('Select a design first');return;}
  if(!confirm('Delete "'+name+'"?')) return;
  const lib=getCGLibrary().filter(d=>d.name!==name);
  saveCGLibrary(lib);
  updateCGLoadDropdown();
});

updateCGLoadDropdown();

// Init custom graphics when ready
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",initCGWhenReady); else initCGWhenReady();

function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min((now-lastTime)/1000,0.05);
  lastTime=now;
  frames++;fpsTime+=dt;
  if(fpsTime>=0.5){fpsEl.textContent=Math.round(frames/fpsTime);frames=0;fpsTime=0;}

  // ── Rolling-average FPS (last 60 frames) for the effect label meta ──
  if(dt>0){
    fpsSamples[fpsSampleIdx]=1/dt;
    fpsSampleIdx=(fpsSampleIdx+1)%fpsSamples.length;
    if(fpsSampleCount<fpsSamples.length) fpsSampleCount++;
  }
  if(elMeta){
    let sum=0; for(let i=0;i<fpsSampleCount;i++) sum+=fpsSamples[i];
    const avgFps=fpsSampleCount?Math.round(sum/fpsSampleCount):0;
    elMeta.textContent=SIZE+'×'+SIZE+' · '+avgFps+'fps';
  }

  if(playlistOn) advancePlaylist(dt);

  // ── Alarm check (every 2 seconds) ──
  alarmT+=dt;
  if(alarmT>2){ alarmT=0; alarmCheck(); }

  // ── Active alarm: 5-minute auto-dismiss + message on cube ──
  // 5x7 font glyphs — each entry is 7 rows of 5-bit bitmaps (MSB=left)
  const _bigGlyphs={
    'A':[0x04,0x0A,0x11,0x1F,0x11,0x11,0x11],'B':[0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E],
    'C':[0x0E,0x11,0x10,0x10,0x10,0x11,0x0E],'D':[0x1C,0x12,0x11,0x11,0x11,0x12,0x1C],
    'E':[0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F],'F':[0x1F,0x10,0x10,0x1E,0x10,0x10,0x10],
    'G':[0x0E,0x11,0x10,0x17,0x11,0x11,0x0F],'H':[0x11,0x11,0x11,0x1F,0x11,0x11,0x11],
    'I':[0x0E,0x04,0x04,0x04,0x04,0x04,0x0E],'J':[0x07,0x02,0x02,0x02,0x02,0x12,0x0C],
    'K':[0x11,0x12,0x14,0x18,0x14,0x12,0x11],'L':[0x10,0x10,0x10,0x10,0x10,0x10,0x1F],
    'M':[0x11,0x1B,0x15,0x15,0x11,0x11,0x11],'N':[0x11,0x19,0x15,0x13,0x11,0x11,0x11],
    'O':[0x0E,0x11,0x11,0x11,0x11,0x11,0x0E],'P':[0x1E,0x11,0x11,0x1E,0x10,0x10,0x10],
    'Q':[0x0E,0x11,0x11,0x11,0x15,0x12,0x0D],'R':[0x1E,0x11,0x11,0x1E,0x14,0x12,0x11],
    'S':[0x0E,0x11,0x10,0x0E,0x01,0x11,0x0E],'T':[0x1F,0x04,0x04,0x04,0x04,0x04,0x04],
    'U':[0x11,0x11,0x11,0x11,0x11,0x11,0x0E],'V':[0x11,0x11,0x11,0x11,0x0A,0x0A,0x04],
    'W':[0x11,0x11,0x11,0x15,0x15,0x1B,0x11],'X':[0x11,0x11,0x0A,0x04,0x0A,0x11,0x11],
    'Y':[0x11,0x11,0x0A,0x04,0x04,0x04,0x04],'Z':[0x1F,0x01,0x02,0x04,0x08,0x10,0x1F],
    '0':[0x0E,0x11,0x13,0x15,0x19,0x11,0x0E],'1':[0x04,0x0C,0x04,0x04,0x04,0x04,0x0E],
    '2':[0x0E,0x11,0x01,0x06,0x08,0x10,0x1F],'3':[0x0E,0x11,0x01,0x06,0x01,0x11,0x0E],
    '4':[0x02,0x06,0x0A,0x12,0x1F,0x02,0x02],'5':[0x1F,0x10,0x1E,0x01,0x01,0x11,0x0E],
    '6':[0x06,0x08,0x10,0x1E,0x11,0x11,0x0E],'7':[0x1F,0x01,0x02,0x04,0x08,0x08,0x08],
    '8':[0x0E,0x11,0x11,0x0E,0x11,0x11,0x0E],'9':[0x0E,0x11,0x11,0x0F,0x01,0x02,0x0C],
    ' ':[0,0,0,0,0,0,0],'!':[0x04,0x04,0x04,0x04,0x04,0x00,0x04],
    '.':[0,0,0,0,0,0,0x04],',':[0,0,0,0,0,0x04,0x08],
    '?':[0x0E,0x11,0x01,0x06,0x04,0x00,0x04],
  };
  if(activeAlarm&&activeAlarm.phase==='main'&&!activeAlarm.dismissed){
    const mainElapsed=(Date.now()-activeAlarm.startMs)/1000;
    const durationS=activeAlarm.endMs?(activeAlarm.endMs-activeAlarm.startMs)/1000:600;
    if(mainElapsed>durationS){
      activeAlarm.dismissed=true;
      activeAlarm=null;
    } else {
      if(activeAlarm.bgEffect&&EFFECTS[activeAlarm.bgEffect]){
        for(let i=0;i<N*3;i++) colBuf[i]=0;
        EFFECTS[activeAlarm.bgEffect](dt*speedMult);
      } else if(activeAlarm.al.prealarm?.giantSun){
        renderGiantSun(1.0,100);
      }
      const rawMsg=(activeAlarm.al.message||'Good Morning').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^\w\s!.,?]/g,'');
      const words=rawMsg.trim().split(/\s+/);
      const line1=[],line2=[];
      let half=Math.ceil(words.length/2);
      for(let i=0;i<words.length;i++) (i<half?line1:line2).push(words[i]);
      const lines=[line1.join(' ')];
      if(line2.length) lines.push(line2.join(' '));

      const S=SIZE, SIDE=[2,0,3,1];
      const pulse=0.7+0.3*Math.sin(mainElapsed*4);
      const charW=6;
      const lineH=9;
      const totalH=lines.length*lineH;
      const vStart=Math.round((S+totalH)/2);

      for(let fi=0;fi<4;fi++){
        const face=SIDE[fi];
        const mir=(face===2||face===3);
        // First pass: dark shadow outline (1px offset in all directions)
        for(let li=0;li<lines.length;li++){
          const line=lines[li];
          const lineW=line.length*charW-1;
          const startU=Math.round((S-lineW)/2);
          const lineV=vStart-li*lineH;
          for(let ci=0;ci<line.length;ci++){
            const glyph=_bigGlyphs[line[ci]]; if(!glyph) continue;
            const charU=mir?startU+(line.length-1-ci)*charW:startU+ci*charW;
            for(let row=0;row<7;row++){
              const bits=glyph[row];
              const pv=lineV-(row+1);
              for(let col=0;col<5;col++){
                if(!((bits>>(4-col))&1)) continue;
                const pu=mir?charU+(4-col):charU+col;
                for(let sy=-1;sy<=1;sy++) for(let sx=-1;sx<=1;sx++){
                  if(sy===0&&sx===0) continue;
                  const fv=pv+sy,fu=pu+sx;
                  if(fu<0||fu>=S||fv<0||fv>=S) continue;
                  const idx=faceMap[face][fv*S+fu]; if(idx<0) continue;
                  colBuf[idx*3]*=0.15;
                  colBuf[idx*3+1]*=0.15;
                  colBuf[idx*3+2]*=0.15;
                }
              }
            }
          }
        }
        // Second pass: bright white text
        for(let li=0;li<lines.length;li++){
          const line=lines[li];
          const lineW=line.length*charW-1;
          const startU=Math.round((S-lineW)/2);
          const lineV=vStart-li*lineH;
          for(let ci=0;ci<line.length;ci++){
            const glyph=_bigGlyphs[line[ci]]; if(!glyph) continue;
            const charU=mir?startU+(line.length-1-ci)*charW:startU+ci*charW;
            for(let row=0;row<7;row++){
              const bits=glyph[row];
              const pv=lineV-(row+1);
              if(pv<0||pv>=S) continue;
              for(let col=0;col<5;col++){
                if(!((bits>>(4-col))&1)) continue;
                const pu=mir?charU+(4-col):charU+col;
                if(pu<0||pu>=S) continue;
                const idx=faceMap[face][pv*S+pu]; if(idx<0) continue;
                colBuf[idx*3]=pulse;
                colBuf[idx*3+1]=pulse;
                colBuf[idx*3+2]=pulse;
              }
            }
          }
        }
      }
    }
  }

  if(autoRotate){
    autoRotY += dt*0.14*rotSpeedMult;
    const tiltX = Math.sin(now*0.00018)*0.28;
    _qRot.setFromAxisAngle(_yAxis, autoRotY);
    _qDelta.setFromAxisAngle(_xAxis, tiltX);
    _qRot.multiplyQuaternions(_qDelta, _qRot);
    pivotGroup.quaternion.copy(_qRot);
  }

  // Skip normal effect during pre-alarm sunrise
  // Skip normal effect during pre-alarm sunrise or during main alarm phase
  const alarmSunriseActive=activeAlarm&&activeAlarm.phase==='pre'&&!activeAlarm.dismissed;
  const alarmMainActive=activeAlarm&&activeAlarm.phase==='main'&&!activeAlarm.dismissed;

  if(effectsOn&&!alarmSunriseActive&&!alarmMainActive){
    if(panelEditorOn){
      // Panel editor mode: start blank, render only explicitly assigned faces
      for(let i=0;i<N*3;i++) colBuf[i]=0;
      const accumBuf=new Float32Array(N*3);
      for(let f=0;f<6;f++){
        const pf=perFaceEffect[f];
        if(!pf||!pf.effect||pf.effect==='none') continue;
        const efn=EFFECTS[pf.effect];
        if(!efn) continue;
        // Apply this face's opts to relevant globals before running
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
        efn(dt*speedMult);
        _peTargetFace=-1; _peTargetOpts=null;
        // Apply this face's overlays (masked to this face)
        if(pf.overlayKeys&&pf.overlayKeys.length){
          applyFaceOverlays(f, pf.overlayKeys, dt);
        }
        // Restore globals
        fwTextOn=_fwTextOn; fwTextPixels=_fwTextPixels; fwTextWidth=_fwTextWidth; fwTextH=_fwTextH;
        rainStyle=_rainStyle;
        // Splice this face's pixels into accumulator
        for(let j=0;j<SIZE*SIZE;j++){
          const idx=faceMap[f][j];
          if(idx>=0){accumBuf[idx*3]=colBuf[idx*3];accumBuf[idx*3+1]=colBuf[idx*3+1];accumBuf[idx*3+2]=colBuf[idx*3+2];}
        }
      }
      for(let i=0;i<N*3;i++) colBuf[i]=accumBuf[i];
    } else if(currentEffect && EFFECTS[currentEffect]){
      if(!(activeAlarm&&activeAlarm.phase==='done')) EFFECTS[currentEffect](dt*speedMult);
    }
  } else if(clearPending){
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    clearPending=false;
  }
  runOverlays(dt);
  if(plTransActive) plApplyTransition();

  // ── Wind-down done: keep display blanked ──
  if(activeAlarm&&activeAlarm.phase==='done'){
    for(let i=0;i<N*3;i++) colBuf[i]=0;
    brightness=0;
    if(mesh) mesh.material.color.setScalar(0);
  }

  // ── Pre-alarm brightness ramp + sunrise rendering ──
  if(activeAlarm&&activeAlarm.phase==='pre'&&!activeAlarm.dismissed){
    const elapsed=Date.now()-activeAlarm.startMs;
    const rawProgress=Math.min(1,elapsed/activeAlarm.preMs);
    const windDown=!!activeAlarm.al.prealarm?.windDown;
    const progress=windDown?1-rawProgress:rawProgress;
    const startBright=activeAlarm.al.prealarm?.startBright||5;
    // Ramp brightness: wake=dim→bright, wind-down=bright→dim
    brightness=windDown?Math.max(0,1-Math.pow(rawProgress,1.5)):Math.max(startBright/100,Math.pow(progress,1.5));
    if(mesh) mesh.material.color.setScalar(brightness);
    const bSlider=document.getElementById('bright-slider');
    if(bSlider) bSlider.value=brightness.toFixed(2);
    // Transition to main alarm exactly when progress reaches 1.0
    if(rawProgress>=1){
      if(windDown){
        // Wind down complete: blank all displays
        for(let i=0;i<N*3;i++) colBuf[i]=0;
        brightness=0;
        const bSlider2=document.getElementById('bright-slider');
        if(bSlider2) bSlider2.value=0;
        activeAlarm.phase='done';
      } else {
        const riseKey=activeAlarm.al.prealarm?.effectRise?activeAlarm.al.prealarm.effectRiseKey:'';
        activeAlarm.phase='main'; activeAlarm.justTriggered=true; alarmFire(activeAlarm.al,new Date());
        if(riseKey){ activeAlarm.bgEffect=riseKey; } brightness=1.0;
      }
    }
    else {
      // Wind down with current effect: run it with dimming brightness
      if(windDown&&activeAlarm.al.prealarm?.wdUseEffect){
        const wdEf=activeAlarm.al.prealarm.wdEffectKey||currentEffect;
        if(EFFECTS[wdEf]){
          for(let i=0;i<N*3;i++) colBuf[i]=0;
          EFFECTS[wdEf](dt*speedMult);
        }
        const wdOvKeys=activeAlarm.al.prealarm.wdOverlayKeys||[];
        if(wdOvKeys.length){
          const ovSave={};
          for(const k of wdOvKeys){ if(OV[k]){ ovSave[k]=OV[k].on; OV[k].on=true; } }
          runOverlays(dt);
          for(const k of Object.keys(ovSave)) OV[k].on=ovSave[k];
        }
      } else if(activeAlarm.al.prealarm?.giantSun){
        renderGiantSun(progress,startBright);
      } else if(activeAlarm.al.prealarm?.effectRise && activeAlarm.al.prealarm?.effectRiseKey){
        // Effect rise: dim start, brightens over time, runs chosen effect
        const br=Math.max(startBright/100, Math.pow(progress,1.5));
        brightness=br;
        if(mesh) mesh.material.color.setScalar(br);
        const bSlider=document.getElementById('bright-slider');
        if(bSlider) bSlider.value=br.toFixed(2);
        const efKey=activeAlarm.al.prealarm.effectRiseKey;
        if(efKey==='weather' && activeAlarm.al.prealarm.effectRiseCity){
          if(!activeAlarm._wxSetup){
            activeAlarm._wxSetup=true;
            const sel=document.getElementById('wx-city');
            if(sel) sel.value=activeAlarm.al.prealarm.effectRiseCity;
            if(typeof wxFetch==='function') wxFetch();
          }
        }
        if(EFFECTS[efKey]){
          const eopts=activeAlarm.al.prealarm.effectRiseOpts||{};
          const _rs=rainStyle, _fwM=fwMode, _fwTO=fwTextOn, _fwTP=fwTextPixels, _fwTW=fwTextWidth, _fwTH=fwTextH;
          const _bcf=ballCrossFaces, _bpf=ballsPerFace;
          const _mrc=mazeRunnerCount, _tbc=tronBikeCount, _tsm=tronSpeedMult;
          const _rsg=retroSelectedGame, _rri=retroRotateInterval;
          const _shsm=shShadowMode, _lss=lsSpeed, _lst=lsTrail, _lsz=lsSize, _lsc=lsColour, _lscn=lsCount, _lsn=lsNudge;
          const _cs=coinSpeed, _dar=diceAutoRoll;
          const _aus=auStyle, _aut=auTheme, _aug=auGain, _aubm=auBarMode;
          if(efKey==='rain'&&eopts.style) rainStyle=eopts.style;
          if(efKey==='fireworks'){
            if(eopts.fwMode) fwMode=eopts.fwMode;
            if(eopts.fwTextOn&&eopts.fwText){
              fwTextOn=true;
              if(!activeAlarm._fwTextBuilt){ activeAlarm._fwTextBuilt=true; if(typeof buildFwText==='function') buildFwText(eopts.fwText); }
            }
          }
          if(efKey==='datetime'||efKey==='strobe') _peTargetOpts=eopts;
          if(efKey==='balls'){
            if(eopts.ballMode) ballCrossFaces=(eopts.ballMode==='cross');
            if(eopts.ballCount) ballsPerFace=eopts.ballCount;
          }
          if(efKey==='spectrum'){
            if(eopts.auStyle) auStyle=eopts.auStyle;
            if(eopts.auTheme!==undefined) auTheme=eopts.auTheme;
            if(eopts.auGain) auGain=eopts.auGain;
            if(eopts.auBarMode) auBarMode=eopts.auBarMode;
          }
          if(efKey==='maze'&&eopts.runners) mazeRunnerCount=eopts.runners;
          if(efKey==='tron'){
            if(eopts.bikes) tronBikeCount=eopts.bikes;
            if(eopts.speed) tronSpeedMult=eopts.speed;
          }
          if(efKey==='retro'){
            if(eopts.game!==undefined) retroSelectedGame=eopts.game;
            if(eopts.rotate) retroRotateInterval=eopts.rotate;
          }
          if(efKey==='simhouse'&&eopts.shMode) shShadowMode=(eopts.shMode==='shadows');
          if(efKey==='lightspeed'){
            if(eopts.lsSpeed) lsSpeed=eopts.lsSpeed;
            if(eopts.lsTrail) lsTrail=eopts.lsTrail;
            if(eopts.lsSize) lsSize=eopts.lsSize;
            if(eopts.lsCol) lsColour=eopts.lsCol;
            if(eopts.lsCount) lsCount=eopts.lsCount;
          }
          if(efKey==='coinflip'&&eopts.coinSpeed) coinSpeed=eopts.coinSpeed;
          if(efKey==='dice'&&eopts.autoRoll!==undefined) diceAutoRoll=eopts.autoRoll;
          for(let i=0;i<N*3;i++) colBuf[i]=0;
          EFFECTS[efKey](dt*speedMult);
          rainStyle=_rs; fwMode=_fwM; fwTextOn=_fwTO; fwTextPixels=_fwTP; fwTextWidth=_fwTW; fwTextH=_fwTH;
          ballCrossFaces=_bcf; ballsPerFace=_bpf;
          mazeRunnerCount=_mrc; tronBikeCount=_tbc; tronSpeedMult=_tsm;
          retroSelectedGame=_rsg; retroRotateInterval=_rri;
          shShadowMode=_shsm; lsSpeed=_lss; lsTrail=_lst; lsSize=_lsz; lsColour=_lsc; lsCount=_lscn; lsNudge=_lsn;
          coinSpeed=_cs; diceAutoRoll=_dar;
          auStyle=_aus; auTheme=_aut; auGain=_aug; auBarMode=_aubm;
          _peTargetOpts=null;
        }
      } else if(activeAlarm.al.prealarm?.wxRise){
        renderWeatherSunrise(progress,startBright);
      } else {
        renderAlarmSunrise(progress,startBright);
      }
      // Countdown timer at bottom in mm:ss
      const remaining=Math.max(0,Math.ceil((activeAlarm.preMs-elapsed)/1000));
      const mm=String(Math.floor(remaining/60)).padStart(2,'0');
      const ss=String(remaining%60).padStart(2,'0');
      if(remaining>0) renderCountdown(mm+':'+ss,windDown?[]:undefined);
      // Wind down: show alarm message from start of countdown
      if(windDown&&activeAlarm.al.message){
        const rawMsg=(activeAlarm.al.message||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^\w\s!.,?]/g,'');
        const words=rawMsg.trim().split(/\s+/);
        if(words.length&&words[0]){
          const line1=[],line2=[];
          let half=Math.ceil(words.length/2);
          for(let i=0;i<words.length;i++) (i<half?line1:line2).push(words[i]);
          const lines=[line1.join(' ')];
          if(line2.length) lines.push(line2.join(' '));
          const S2=SIZE, SIDE2=[2,0,3,1];
          const charW=6, lineH=9;
          const totalH=lines.length*lineH;
          const vStart=Math.round((S2+totalH)/2);
          for(let fi=0;fi<4;fi++){
            const face=SIDE2[fi];
            const mir=false;
            for(let li=0;li<lines.length;li++){
              const line=lines[li];
              const lineW=line.length*charW-1;
              const startU=Math.round((S2-lineW)/2);
              const lineV=vStart-li*lineH;
              for(let ci=0;ci<line.length;ci++){
                const glyph=_bigGlyphs[line[ci]]; if(!glyph) continue;
                const charU=mir?startU+(line.length-1-ci)*charW:startU+ci*charW;
                for(let row=0;row<7;row++){
                  const bits=glyph[row];
                  const pv=lineV-(row+1);
                  if(pv<0||pv>=S2) continue;
                  for(let col=0;col<5;col++){
                    if(!((bits>>(4-col))&1)) continue;
                    const pu=mir?charU+(4-col):charU+col;
                    if(pu<0||pu>=S2) continue;
                    const idx=faceMap[face][pv*S2+pu]; if(idx<0) continue;
                    colBuf[idx*3]=1.0;
                    colBuf[idx*3+1]=1.0;
                    colBuf[idx*3+2]=1.0;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ── Main alarm: message scrolling + glow ──

  // Apply per-LED floor (edge, corner, face ghost)
  for(let i=0;i<N;i++){
    const b=i*3;
    if(colBuf[b]  <edgeFloorR[i]) colBuf[b]  =edgeFloorR[i];
    if(colBuf[b+1]<edgeFloorG[i]) colBuf[b+1]=edgeFloorG[i];
    if(colBuf[b+2]<edgeFloorB[i]) colBuf[b+2]=edgeFloorB[i];
  }

  // Backface cull — scale hidden-face LED instances to 0 (truly invisible)
  const visMask = getVisibleFaceMask();
  if (visMask !== lastVisMask) {
    lastVisMask = visMask;
    const matArr = mesh.instanceMatrix.array;
    for (let i = 0; i < N; i++) {
      const s = (faceMembership[i] & visMask) ? 1.0 : 0.0;
      const b = i * 16;
      matArr[b]   = origMatArray[b]   * s;
      matArr[b+5] = origMatArray[b+5] * s;
      matArr[b+10]= origMatArray[b+10]* s;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  mesh.instanceColor.needsUpdate=true;
  renderer.render(scene,camera);
  if(panel2dMode) renderPanel2d();
  updateFaceLabels();
  streamFrameToCube(dt);
}

// ═══════════════════════════════════════════════════
//  PHYSICAL CUBE STREAMING
//  Served from ledcube.local → auto-connects via
//  window.location.hostname. Same file works as a
//  pure browser simulator when opened from a PC.
// ═══════════════════════════════════════════════════

// VideoPacket faceID → JS faceMap index
// Guide: faceID 0=Top(master), 1=Front, 2=Right, 3=Back, 4=Left, 5=Bottom
// JS:    face   4=Top,         0=Front, 2=Right, 1=Back, 3=Left, 5=Bottom
const CUBE_FACE_ORDER = [4, 0, 2, 1, 3, 5];
const PKT_VIDEO = 2;

let cubeWs = null, cubeConnected = false, cubeStreamT = 0;
const CUBE_FPS = 20;  // 20fps → ~1.5 MB/s, well within ESP32-S3 WiFi headroom

function initCubeWs() {
  // Skip if opened locally (simulator mode on dev machine)
  const h = location.hostname;
  if(!h || h === 'localhost' || h === '127.0.0.1') return;

  // Skip on HTTPS pages: browsers block insecure ws:// from https:// (mixed content).
  // The physical cube (ESP32) only serves ws://, so streaming only works when the
  // page itself is served over http:// on the same local network as the cube.
  if(location.protocol === 'https:') {
    console.log('[cube] physical-cube streaming disabled on HTTPS (visualizer runs normally)');
    return;
  }

  try {
    cubeWs = new WebSocket(`ws://${h}:81`);
    cubeWs.binaryType = 'arraybuffer';
    cubeWs.onopen  = () => { cubeConnected = true;  console.log('[cube] streaming started'); };
    cubeWs.onclose = () => { cubeConnected = false; setTimeout(initCubeWs, 5000); };
    cubeWs.onerror = () => { cubeConnected = false; };
  } catch(e) {
    cubeConnected = false;
    console.warn('[cube] WebSocket unavailable:', e && e.message);
  }
}

function streamFrameToCube(dt) {
  if(!cubeConnected || !cubeWs || cubeWs.readyState !== WebSocket.OPEN) return;
  cubeStreamT += dt;
  if(cubeStreamT < 1/CUBE_FPS) return;
  cubeStreamT = 0;

  const S = SIZE, pktBytes = 2 + S*S*3;

  for(let vid = 0; vid < 6; vid++){
    const jsFace = CUBE_FACE_ORDER[vid];
    const buf = new Uint8Array(pktBytes);
    buf[0] = PKT_VIDEO;
    buf[1] = vid;            // faceID for master/slave routing
    let off = 2;
    for(let v = 0; v < S; v++){
      for(let u = 0; u < S; u++){
        const i = faceMap[jsFace][v*S + u];
        if(i >= 0){
          buf[off]   = (colBuf[i*3]   * 255 + 0.5) | 0;
          buf[off+1] = (colBuf[i*3+1] * 255 + 0.5) | 0;
          buf[off+2] = (colBuf[i*3+2] * 255 + 0.5) | 0;
        }
        off += 3;
      }
    }
    cubeWs.send(buf.buffer);
  }
}

// Auto-connect on load
initCubeWs();

// ═══════════════════════════════════════════════════
//  FACE LABELS
// ═══════════════════════════════════════════════════
let faceLabelsOn=false;
let faceLabelEls=null;

// Face centre positions in world space (TOTAL_SPAN is the cube's world size)
// HALF = half of total span
const FACE_LABEL_DATA=[
  {name:'0 — Front',  key:'front',  nx: 0, ny: 0, nz: 1},
  {name:'1 — Back',   key:'back',   nx: 0, ny: 0, nz:-1},
  {name:'2 — Right',  key:'right',  nx: 1, ny: 0, nz: 0},
  {name:'3 — Left',   key:'left',   nx:-1, ny: 0, nz: 0},
  {name:'4 — Top',    key:'top',    nx: 0, ny: 1, nz: 0},
  {name:'5 — Bottom', key:'bottom', nx: 0, ny:-1, nz: 0},
];

function initFaceLabels(){
  const container=document.getElementById('face-labels');
  if(!container) return;
  container.innerHTML='';
  faceLabelEls=FACE_LABEL_DATA.map(f=>{
    const el=document.createElement('div');
    el.textContent=f.name;
    el.style.cssText=[
      'position:absolute',
      'padding:4px 10px',
      'background:rgba(0,0,0,0.65)',
      'color:#7df',
      'font-family:"Segoe UI",Arial,sans-serif',
      'font-size:13px',
      'font-weight:700',
      'letter-spacing:1px',
      'border:1px solid rgba(100,200,255,0.4)',
      'border-radius:5px',
      'white-space:nowrap',
      'transform:translate(-50%,-50%)',
      'text-shadow:0 0 8px rgba(100,200,255,0.8)',
      'pointer-events:none',
    ].join(';');
    container.appendChild(el);
    return {el, nx:f.nx, ny:f.ny, nz:f.nz};
  });
}

function updateFaceLabels(){
  if(!faceLabelsOn||!faceLabelEls) return;
  const canvas=document.getElementById('c');
  if(!canvas) return;
  const cw=canvas.clientWidth, ch=canvas.clientHeight;

  // Distance from cube centre to label — just outside the face
  const dist=HALF*1.35;

  const _v=new THREE.Vector3();
  faceLabelEls.forEach(({el,nx,ny,nz})=>{
    // World position: rotate the face-normal offset with the pivot group
    _v.set(nx*dist, ny*dist, nz*dist);
    _v.applyQuaternion(pivotGroup.quaternion);

    // Project to screen
    const proj=_v.clone().project(camera);
    const sx=(proj.x*0.5+0.5)*cw;
    const sy=(-proj.y*0.5+0.5)*ch;

    // Hide if behind the camera
    if(proj.z>1){ el.style.display='none'; return; }

    // Fade if face is pointing away (back-face)
    // Dot product of camera direction to label position
    const camDir=new THREE.Vector3().subVectors(_v, camera.position).normalize();
    const faceNormWorld=new THREE.Vector3(nx,ny,nz).applyQuaternion(pivotGroup.quaternion);
    const facing=camDir.dot(faceNormWorld);
    // facing > 0 means face points away from camera (back face)
    const alpha=facing>0.2?0.2:facing<-0.15?1.0:0.35;

    el.style.display='block';
    el.style.left=sx+'px';
    el.style.top=sy+'px';
    el.style.opacity=alpha;
  });
}

document.getElementById('face-labels-chk')?.addEventListener('change',e=>{
  faceLabelsOn=e.target.checked;
  const container=document.getElementById('face-labels');
  if(container) {
    container.style.display=faceLabelsOn?'block':'none';
    if(faceLabelsOn){
      if(panel2dMode){
        // Show 2D panel labels: top, left, right, bottom
        container.innerHTML='';
        const labels=[
          {text:'TOP', x:'50%', y:'2%'},
          {text:'BOTTOM', x:'50%', y:'98%', transform:'translateY(-100%)'},
          {text:'LEFT', x:'2%', y:'50%', transform:'translateY(-50%)'},
          {text:'RIGHT', x:'98%', y:'50%', transform:'translateY(-50%) translateX(-100%)'},
        ];
        labels.forEach(l=>{
          const el=document.createElement('div');
          el.textContent=l.text;
          el.style.cssText=[
            'position:absolute',
            `left:${l.x}`,
            `top:${l.y}`,
            'padding:4px 8px',
            'background:rgba(0,0,0,0.65)',
            'color:#7df',
            'font-family:"Segoe UI",Arial,sans-serif',
            'font-size:13px',
            'font-weight:700',
            'letter-spacing:1px',
            'border:1px solid rgba(100,200,255,0.4)',
            'border-radius:5px',
            'white-space:nowrap',
            `transform:${l.transform||'translate(-50%,-50%)'}`,
            'text-shadow:0 0 8px rgba(100,200,255,0.8)',
            'pointer-events:none',
          ].join(';');
          container.appendChild(el);
        });
      } else {
        if(!faceLabelEls) initFaceLabels();
      }
    }
  }
});

// ═══════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════
initCube(64);
requestAnimationFrame(ts=>{lastTime=ts; requestAnimationFrame(animate);});

// Hide the loading overlay now that the 3D engine is up and running.
(function hideLoadingOverlay(){
  const ov=document.getElementById('loading-overlay');
  if(ov){ ov.style.opacity='0'; setTimeout(()=>{ ov.style.display='none'; }, 350); }
})();

// Display version
(function showVersion(){
  const el=document.getElementById('app-version');
  if(el && typeof APP_VERSION !== 'undefined') el.textContent=APP_VERSION;
})();
