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
  } else if(key==='radio'){
    c.style.display='block';
    c.appendChild(mkLabel('Station'));
    const sel=document.createElement('select');
    sel.style.cssText='width:100%;padding:5px 8px;background:#0a1020;border:1px solid rgba(80,120,255,0.3);color:#cde;font-size:12px;border-radius:4px;';
    sel.innerHTML='<option value="">-- choose station --</option>';
    if(typeof RADIO_STATIONS!=='undefined'){
      RADIO_STATIONS.forEach((st,i)=>{
        const o=document.createElement('option');
        o.value=i; o.textContent=st.name+(st.genre?' — '+st.genre:'');
        if(opts.radioUrl===st.url) o.selected=true;
        sel.appendChild(o);
      });
    }
    sel.addEventListener('change',()=>{
      const st=typeof RADIO_STATIONS!=='undefined'?RADIO_STATIONS[parseInt(sel.value)]:null;
      if(st){ alarmEffectRiseOpts.radioName=st.name; alarmEffectRiseOpts.radioGenre=st.genre; alarmEffectRiseOpts.radioUrl=st.url; }
      else { delete alarmEffectRiseOpts.radioName; delete alarmEffectRiseOpts.radioGenre; delete alarmEffectRiseOpts.radioUrl; }
    });
    c.appendChild(sel);
    c.appendChild(mkLabel(''));
    const note=document.createElement('div');
    note.style.cssText='font-size:10px;color:#666;';
    note.textContent='Starts this station when the alarm fires. Volume follows the pre-alarm/wind-down ramp, same as brightness.';
    c.appendChild(note);
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
  const _f1v = (typeof APP_VERSION !== 'undefined' ? APP_VERSION : Date.now());
  const scripts = ['f1-state.js?v='+_f1v,'f1.js?v='+_f1v,'f1-providers.js?v='+_f1v];
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
  maze:effectMaze,
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
  unsplash:effectUnsplash,
  artic:effectArtic,
  joke:effectJoke,
  otd:effectOnThisDay,
  trivia:effectTrivia,
  epic:effectEPIC,
  iss:effectISS,
  cam:effectCam,
  radio:effectRadio,
};
const EFFECT_NAMES={
  wave:'Wave Cascade', rain:'Colour Rain', plasma:'Plasma Storm', sphere:'Laser Grid',
  fireworks:'Fireworks', dna:'DNA Helix', datetime:'Time & Date',
  balls:'Bouncing Balls', sand:'Gravity Sand', f1:'F1 Live',
  gradient_wash:'Rainbow Wash', aurora:'Aurora Borealis', depth_rings:'Depth Rings',
  prism:'Prism Sweep', tide:'Color Tide', nebula:'Nebula Drift',
  maze:'Maze Runner',
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
  unsplash:'Unsplash Photos',
  artic:'Art Gallery',
  joke:'Jokes',
  otd:'On This Day',
  trivia:'Trivia',
  epic:'Earth Live View',
  iss:'ISS Tracker',
  cam:'Camera',
  radio:'Internet Radio',
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
  maze:'maze', tron:'tron', f1:'f1', video:'video', simhouse:'simhouse',
  balls:'',sand:'',lightning:'',warp:'',life:'',fluid:'',
};

const PANEL_EFFECTS = new Set(['tron','maze','video','f1','datetime','strobe','rain','fireworks','lightspeed','custom_cube','weather','moon','coinflip','dice','balls','simhouse','retro','random','neo','apod','unsplash','artic','joke','otd','trivia','epic','iss','cam','radio']);
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
  btn.addEventListener('click',()=>{ window._eeActive=0; document.title='Multidisplay'; });
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
    if(typeof artSyncSharedControls==='function') artSyncSharedControls();
    if(typeof tfSyncSharedControls==='function') tfSyncSharedControls();
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
    // Tell the ESP32 which effect to run natively (works with no streaming).
    if(typeof cubeSendCmd==='function') cubeSendCmd({cmd:'setEffect', effect: currentEffect});
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
document.getElementById('cam-rate')?.addEventListener('input',e=>{
  document.getElementById('cam-rate-val').textContent=e.target.value;
});
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
  // Drive the ESP32's native effects too, so this works with no streaming.
  cubeSendCmd({cmd:'setSpeed', value: speedMult});
});

document.getElementById('bright-slider')?.addEventListener('input', e => {
  brightness = parseFloat(e.target.value);
  document.getElementById('bright-val').textContent = Math.round(brightness * 100) + '%';
  mesh.material.color.setScalar(brightness);
  // Drive the ESP32's native panel brightness too (works standalone).
  cubeSendCmd({cmd:'setBrightness', value: brightness});
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
    // Some overlays (e.g. spectrum) now have their toggle duplicated into
    // other panels for convenience — keep every copy's checked state synced.
    document.querySelectorAll(`.ov-chk[data-ov="${ov}"]`).forEach(other=>{ if(other!==chk) other.checked=chk.checked; });
    // Duplicated option blocks (e.g. spectrum's controls repeated into the
    // Radio/Video/Bluetooth/Microphone panels) expand/collapse with the
    // toggle, same as the master overlay item's own .ov-body already does.
    document.querySelectorAll(`.ov-options-el[data-ov="${ov}"]`).forEach(body=>{
      body.style.display = chk.checked ? 'block' : 'none';
    });
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
    } else {
      // Turning the audio-only radio overlay off stops playback outright —
      // there's no visual to just "leave running", so off means off.
      if(ov==='radio' && radioPlaying) radioStop();
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

document.querySelectorAll('.au-gain-el').forEach(sl => sl.addEventListener('input', e => {
  auGain = parseFloat(e.target.value);
  document.querySelectorAll('.au-gain-el').forEach(other=>{ if(other!==e.target) other.value=e.target.value; });
  document.querySelectorAll('.au-gain-val-el').forEach(v=>v.textContent = auGain.toFixed(1) + 'x');
}));

// Spectrum scroll
document.querySelectorAll('.au-scroll-speed-el').forEach(sl => sl.addEventListener('input', e => {
  auScrollSpeed = parseFloat(e.target.value);
  document.querySelectorAll('.au-scroll-speed-el').forEach(other=>{ if(other!==e.target) other.value=e.target.value; });
  document.querySelectorAll('.au-scroll-speed-val-el').forEach(v=>v.textContent =
    auScrollSpeed === 0 ? 'Off' : auScrollSpeed.toFixed(1) + 'x');
}));
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

document.querySelectorAll('.mic-btn-el').forEach(b=>b.addEventListener('click', toggleMic));

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
    window._eeActive=0; document.title='Multidisplay';
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

// ── Easter egg: size button sequence 8,8,16,64 within 2s ──
window._eeActive=0;
(()=>{
  const EE_SEQ=[8,8,16,64];
  const EE_B64='0tnftMngvc7gvM3gssritcviv9DfwdHgt83j4ubk9u/f5ODS3NvQ1tfL1dXKz9LIy83Dx8i9w8W5w8S3wsS3w8S4zc3D1NTK2NfJ3tvK6OPQ7+nU8erX8OnY6+XX5uPX5eLX4uDV4d7V4d7V4d7V4N3W4N3W4N3W393W393W39zV3dvU3drT29rS2trS2dnR2tfQ2NXN2NXM2NXM2NXM1dLJ1NHI09DH09DH0s/G0s/G0c7F0M3Ez8zDz8zDzsvCsMXcu83d8e7k7uzjsMbdrsXe2t3busrboLvavcbM1NHBxsi8xci9xsi+x8rAxcm/xce8w8a7w8W4w8W4wsS3xMe709XM1tjQ19jQztDFy8u/yci6ysa31tC+39fE4NrM4d3S4d7T4d7V4d7V4d7V4N3U4N3W4N3W4N3W4N3W39zV3tvU3tvU3drT3NnS29nS2tfQ2dbP2dbP2dbO2NXN1tPK1dLJ1NHI09DH09DH0s/G0c7F0c7Fz8zDz8zDzsvCy9XbpLzVsMTXr8TYorvXpLzXsMTYorfMjqnFt8LFzM7Eys3Eys3EyczDyMvCxsnAxci8xMa7w8W6wsS5wcO3xce81NXN19jQ2drS3N3V7O3m6uzj1NbMy8zAy8a1zsWy1s/A3NjN3tzR4N3T4N3U4N3U4N3U4N3V4N3W4d7X4N3W3tvU3tvU3dvT3NrT3NnS2tfQ2dbP2dbP2dbP2NXN1tPK1dLJ1NHI1NHI09DH0s/G0c7F0M3Ez8zDzsvCzcrB4+Ha1tfR0tTQ1dbT3dvV3NrUuLe0tbaxwMO9ycvDzdHHzM/Gy87FyczDyMvCxsnAxce8w8a6wsS5wsS5wcO3ycrB3N3U3N3U2dvR2drS7e7n9fbv8vTw4ufj2dvQw7+yxbys0cq83djM4d3R4t7U6OXb5ePa4d7W4N3W4N3W39zV39zV3tvU3drT3trT3drT29jR29jR3drT2dbP19TL1tPK1dLJ1NHJ1NHI09DH0s/G0c7F0M3Ez8zDzsvCzMnA7e3l7e3l7e3l7+zk6eXdlpGIWFRJsrWq0tXNztLKztHIzM/Gy87Fys3DyMvCxsnAxMi9w8a6wsS4wcO4wcO3nJ6Vjo+Hpqib4uPX1NXK7e7n9PXu8fTw3uPg4ubg3+HYl4+Bf25eg3BfaFhMTUA6c2hhsKie3tvS4+HZ4N3W39zV39zV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h391w7+2zcrDysfAyca/yca+yMW9x8S7xMG4xMG4w8C3xMG4SklFS0pGTEtHUE9LTUtHR0ZCS0pGS0hESEZCRkVBR0VCSEZCSERBQkA9QkA8Qj86Pz46koFu8M2q69C079S87cy148Sv5May3rmd2rWU0qmGwJNwqX5cmnBTmGxNfFI3hFg7oG5LtINc5cep8Nq/69G3372d06eCwpRrs4Ncn21NhFk/e1hCa004KRYMHxEJJBMLPiwkrqmhr6uhpKCW0M3FzMnCysfAyca/yMW+yMW9xsO6w8C3xMG4w8C3xMG4UVBMUU9MS0hFQT06Pjw4Q0E+REE+RUM/SEdDRkNAREA9RUM/RUM/R0VCR0RBREE9RUI/jn1r8Myq5can68+07tC179O76s634L+i17COyp15tYhmnHJUj2hOiGBGcksxjGFAqHpStoZbx5x05cmq4sOi1K6KxZZvrn1VmGlGgFY6bkszdFU/hGdQUj0tKxkOTTMgYkk4w721zcnDxcK5zcrCy8jByse/yMW/yMW+x8S7xcK5w8C3w8C3xMG4xMG4VFJPSUZDQT06Pjs4QDw5Qz88REE9R0NASkdDSEVBQ0A9QT87QkE9SUZCSUZCSUVBSUZEl4V08Myp4r6b4b+f5seq58Wn48Ol27mZzaN/t4lmm29PimFGf1lAZ0Ipglk7rH9Zu45lxJduwZJlvo9lzaN/x5pysYFYl2dFf1M4bkkxa0w2fF9JjXRcVT0qVjkjc082iGhRx8K6z83GzcrDzMnBy8jByca/yMW+yMW9xsO7xMG4wr+2w8C3xMG4w8C3SEdDTEtHRkNARkM/Qj47Qz88RUI+R0RBR0RBSUZCREM/RkVBR0VCS0hFSUZCSEVBRUNAlYZ38dK058eo5sap2K6M1q2K0qiDxZdxs4FdmmhGgVE0c0kvb0kvkmpLvpRuyZ93yJ1zzKF4y590s4FWoG1HpHNOmWhFgVU5b0cvZkMsb084bE86UzokUTMdbkowgltAm3tl0MzFz8zFzMnCy8jBysfAyca/yMW+x8S9xsO6wr+2wr+2w8C3xMG4w8C3QUA8Tk1JTUxIT01KR0RBRUNARUM/RURASEZCS0lFSUhET05LTk1LTEtHTEhFRkM/Q0E9kIN18tS36c2y6c2z0J98mmE/yZt1y512v49qs4VisYprv5x/0rGT3r2e37yc2LGO0qiC0KiBzaJ7t4phmWtGil49glk7dVE2bk0zdVU6eFc+PyUVPyYSWDghfVc7imJFoody0s/JzsvEzMnCy8jByca/yMW+x8S9x8S9xMG5wb60wb61w8C3w8C3w8C3REM/RURAU1FNTUlGSEZCSEdDSkhESkhETEpHS0lFVVRQVFNQUVBMTUxITUpFSkdCSEVAuqWQ786w48Gh4rydz597iVIww5t57cqn7Muq79K08de979W77tS768+15MOn27WV0qqGz6eCyaB4tYhhmW5LiWJDhV9BhmBDg2BEgFxAY0UvMBwOOyIRb000mXFRlmxNr5qI0tDKzcrDy8jBysfAyMW+yMW+x8S9xcK7wr+2wb61wr+2w7+3wr+2wr+2RURARkNAUU9MVFFOTUlGTUtHUU5KTUtHTUxJVVRQTUxIU1JOUlBMT01JS0lERUM+XldO5suw6Mam2q+I06V8volfgkopv5Zz78up7Mqq7tO38Na97tS77tS769C25MWp2raV0KeDzaKAx5x3sYVgl21NimRHhF9ChF9Dg15CfVg7UjopKhkLWTkjonRRq3tXmG1Ou62g0M/Iy8jByca/ysfAyMW+xsO8xcK8xMG5wr+2wr+2wr+2wb61wb61wb61RkVBT0xJTUxHWFZSUExITUtHTk1JTkxITUxJUE9MTEtHTUtHVFBMS0lEREM+QUE9koJx9di84b2a1Kd8xJFlomdAnWpH58Oe7s6t7cyt7c+z7dO57NG27NC46s6z4sGj1q+MyqB7xpt4xpt2r4NglGtMiGRHhmFEhF5CglxAelM3QjEiQyoYonJPu4lhqXlXkGdMuKudzszGysfAyMW+x8S9xsO8xcK7xMG6w8C4wb61wL21wL21wL21wL20wL20RURAS0pGT05KUE9LUU9LTElGT0xJTEhFS0lFSUZDTUlGT0pHTEhFS0hDSUdCUUxG07mh79C02rGJyZltsHZNp29K4LqX8NCx7M2u68yu68yv68yw682x6cyw5cap3LeWzqR+wJJuwJRwxpp0rYBbkWdIh2JFhF9Cg11AgVo9cUkwPicZkWVEyZpyv45on3JTjWdNua2hy8nCx8S9xsO8xcK7xMG6xMG6w8C5wr+4v7y1v7y1wL21wL22wL21v7yzTEpGTEhFSkdES0pGW1pWTkxITkpHSkdESkdES0hFUExJTkpGSEVBSEVBQ0E9fXBi8tW55MKgz590snVLqGxH3raT8NCx7Myu6Mak6Meo6suu7M2x7M6y6Mqt4r+g16+Lw5ZusIFdxZt2zKB5q35YjWRFhV9Dgls/gVk9gFc7Yzwmb0YuyZhv0aN9uohkmm5QknJawry0xsO8xMG6xMG6xMG6w8C5wr+4wb63wL22v7y1v7y1vru0vruzvbqxvbqxWlhUWVZTUU9LTUpHWFdTUlBMTUtHTkxITUpGT0xJUExJTEhFSEVAQkA7REM+uKSQ8tW52a+ItnpOomM82q+M7Mio7cuv6can47+c48Gf6Man7Myw682x58iq37uZz6V9rX9ZlWdHzaaF0qiDqnxWjWNEhFxAgVc7f1U5ek80ZTsktIZi2a6IzqB7r39dlGpNnoZ0xMC6wr23wb22wb23wb63wL23v7y1vru0vbqzvbqzvLmyu7iwu7ivu7ivu7ivWFdTXl1YY2JeWFZSV1ZSWVdUVVNPU09MUU1KUk5LUU1KTEhFS0hDQkA7W1ZN5s2168utyJJnmloxz6F968al6cio5cGh476b37iU3raS47+e6cir6cms5MGh2rKLx5pvn3JMlGpK3bqZ0qiArH1XjWNDgVc7f1I4fU81c0QrgFE227CL3LWRxZVvp3lXjWhOraGWvbm0vLexu7awvLexvLiyu7iwurawurewurewubavuLWst7Sst7Sst7Srt7SrWllVWVlVXVxYYF9bZGNfWllVXl1ZXFpWVVJPT0tIS0dESUVBSUZBQD45n4589dm+2rGMo2Q4uolj6cSi6sip5cGh3bOM2KuD16qC2KyF37aU47+g476f3rSS06Z+wpJor39WvJBm1KuCwpNpn29Kg1c5fE81e0wyfEowajgepnhY6MGg1KiBuohjmGxOmX9qrKefpaCZqKOdrKehr6qksKymsa2msq6osq6osq+osq+nsa6msa6msa6nsa6lsa6laGdib21odnRwfHt2iIaBiIeBiIaBjoyGmJaQmpiTnZqVn5uWpKGcrqih48mw68utvIVZo2tE4ruY6sms5sSn2KuFzJltyZZqzZ1z0aR72ayI3LOQ3LOQ1qqFyptzvYxjs4JauYlfuolfqnhQjF07ek4xdUgud0ctdkQmZzgbz6aF47mYyJZvqXlXj2lPy8K229jQxMG4qKSal5OKm5aOoJyUo5+XpaGZp6SbqKScqKWdqKWdqKWdqKWeqaaeqKWd4+Da5+Xe6eji7Orj7uvl7+3m8O3n8O7n8O7o8e/p8vDp8/Dq8vDq8eXX7c+y3LWPoGQ7z6WC6MWk6Mqu3riVyZdsuYVat4JXxJFnzJ100qN91aeC1KaAzp92wpBotoRcsoFZsX5WqXROlWJAfk8xdEcscUMpc0ImaTgbjF9B5b+d06R+uYhjlmhLq5OB5ePb4+DX4+DX3tvSw7+1l5OJjop/k4+El5OImpaMnZmPnpqQn5uSn5uSoZ2ToZ2UoJyT7Oni6+jh6+jh6+jh6+jh6ufg6ufg6+jh7Oni7Oni7erj7erj6+ri7NW+6MSjwo5ip3JM6sWk6ceq5sSm16yFxJJmtoJXq3ZPs35XxpVtzp53z595zJtzx5Zuuohfr31VrHlSp3NNm2ZDh1Y2ekswdEUsb0Anaz0iazwhzKWF3rWQw49pq3lXlW1T08zB4+HZ4d7W4d7V39zT3tvSx8O5j4uAioZ7i4h9jYp+kIyBko6DlJCFlZGHl5OIl5OIl5SJ7evk7erj7erj7erj7Oni7Oni7Ojh6+jh7Oni6ebf4+DX3drR4dTG782y47ybo2hAuo5s782t68uu5sKk1qiCxJNqtoVcqXVQo29LtYFbxZNryplxyJduwZBntIFYq3VOpW9JnWlEkFs6g1Iye0ovdEQqckMpbTwiqn9h6sSk0KB5vIliqHdVtpuI4uDY3drQ3drR3dnQ29jP2dXN0c7GmZWKh4N4iYV6iIR5iIR5iYV6ioZ7jIh9jYl+jop/joyA8vLs8O/o7u3m7ezl7Ozk7Ovk7Orj7Orj6+ni3tnQ1c/F1c3B6c217Mqq3raSgUsrxp6A78+07dC258Sm2rCNy5x2uohhqnhTmmdHmmdGsn1YwY1mwoxkuYNarXVNpm1Gn2hCk146h1Q0g1I1gFI5hFhAi2BJlm5X6MWn5r+ey5pyv4tmrHxeyLmt29nQ2tbO2dXO1tPL09DJzsvEsq+miod7h4N4h4R5h4R4h4N4hYF2hIB1hIB1hYF2hIJ2hIJ2/v78/Pz6+vr29/fz9fXv8/Ls8fHq8PDp7+/n7uzk5+LZ59K88da86MurzZtxc0Akx56B78607c+36Mar3bOSz6F6wZBotoVepXVVj2RMmnFawph9zaeNyqiPxqeRxaqXw6ycxbGjxrWqybuxz8S71czG2tLN48q17syt3rORy5dyvIZiq4Rt0c3G0tDI0M3GzcrDxsO8trOsk5CJhoR5hIJ2hoJ3hYJ3hYJ3hYF2g4B0gn5zgX1ygHxxfXpufHlu///////////////////////+/v79/v38/f37+/r28d7N68206M+27NW7y5x1ekIltIls7cmt7c+36s635su05M+85tfK6d/V6eLb6+ji6Ofj6unm7Oro7Orn6+zo6+vn8O/s9PLv8fHs8fDr7uvn7eTa68607cqq5b+ez514wItopnVWoYl6wb24vLmyraqjnJmTko+Hg392W1lQaGZfg4F2hIB1g4B0g390g390gn5zgHxxf3twfnpvenhseHZq6url8PDr9fXx+Pn2/Pz5/////////////vz48+DQ6suz3raa27ib8NvE3beYc0IpoIFv9uPU+PLs+/v3/f78/f/9/P37/P37+/369/j09fTw8O7q7+zo7uzn7urm6+Xg49vU1s3Hy7+3uqaZ0rqo7Mut7Mmq5sGh16eBu4Rgnm5QjWZNfFlDiX90g4F4ZWFaTEhDbGpihIF1gn9zZ2ZegH93g4B0g390gn5zgn5zgX1ygHxxf3pvfHlueXdrd3Vp2tfS2dbR19XQ2dfS1dPOiomFtbKt3t7a59/V8NnG1K+WpHpjzreo5tfH7dzL5dvT+/z7/v//9vXy8u3n9Ozj9/Dp9e/n7uTZ3cy9u6ORq5B+l3dlm3xrp4p6qYt6lnhofVpIh15HnWlLwZV47M6y7Mqt4biY16iEypZxp3NTkWVKjGZOeFZBdm1jeXZva2ZfU01HbWxleHZtf31yhoR+hoR8hIB1g4B0gn90gn9zgX1ygHxxf3twe3lteXdrd3Vp29jT2tfS2dXR19TPzsrGU1BRcm1lv7y3y8S87dfEtYVrbUs90tLL2djS8/Tw7OfgqZuSsJF+0qyT4L2j58eu58qv4L6f0qiDu4pjnmtHiFY1eUcqcDshZjQbRSkcc005s39c0Jp05LiY57yi68is4LST0Z55zp16t4RhlWZKk2hPg11DdVdDenVsfntzb2tiT0dAfHpxbW1kfXx0goB4gX90hYJ3g4B1gn90gn90gX1zf7xxfnpve3hteHZqdnRo0c7K1tTP2dfS2tfS0c7JeHZ0e3Nrwb+4zMfA5s28xJN6XjIhdlxRtK2l0si+xJaAb0MxsoNl3bCQ4r2h5MSo48Sm3bqY0KaAu4tlnm1Kh1U2e0ksd0IlajUaRSESt4Zl4rqb6MWu1KKK2ayR3K+PzZd006F9uoRgqHVTk2RIlmlPeVM7dVxKe3dwfXlxdXNpZmFag4F5fHlxfHlvg4B2h4R5hYN4hIF2g4B1gn9zgX1zf3tyfXlwendsd3VpdXNnraqjraumq6qmvbq2w8C8YV1djIaJxcK+0M3Gz8K40rOhvo10jVdCmXBfu7Kqy7+4tqefsIlw2KuL3rib5MOo5MWp3LqZzqWAuYhjnGpHhVM0eEUpdD8iYS8VXjcm2auK5sCk0J+CyZp9zp56u4Vl0aKCtoFgxJNvh1tBoXJXmW1ScUs1hnNmm5mUm5mTi4qCeXZugH51hYJ5iIV8h4R7hoN6hoN6hIF3g391gX5zf3tyfnpxe3dveHZrdnRodHJmzsvFvbmzo5+bmpeVn56fraywsbCzwL/BycjHy8nHzMnGzMG5y7esuJyOu7GrxMO/w8K+v6OSz6GA2rGS4b+i5MWo376d0amEvY9poG9LiFY1ekcocj0gVScRZ0Iw4LOS4bmX6sipxZZ1rnte1KuLkWFGxaGKqXxdQyUYupJ5iGBGb0w1hnpvkI+Gi4h/ZmNcUkxFh4V8iYZ9iYV8h4R7hoN6hYJ4g391gn50gHxzf3tyfXlwe3dueHZsd3RpdnRo2NXQ2dbR2tfS29jTysfCVVNQd3Jtr66rsrGwsK+vtLOyt7a2ubi6r7GylZSUgHt7dnJxeW1nv5N21quK3LiZ4sGj4L+g1bCLwZRwpHVRiVc3eUYnbjwcTCEMZEMz4baS5b6hwZBvnW5V1bSXi1s9pId1w51/aUIrYz8tv5p/elQ6cFA6gHhshIJ3h4R7b2xmV1FLh4N7h4N6hoJ5hYF4hIB3g392gX10gHxzgHx0gHxzfnpxfHhvendueXZreHVr1tPO1dLN1dLN19TPysbAPTo2dm9nzcvG1NHM0s/KzszHzMrFycfDxsTAwcC8vLu2trWxsLGuwamXzqB/2LGQ3ryd3ryd1bCMw5dyqHlWjVs6fEkqcD0dSyAMXT4w4baT2LGUwZJy2LKVkmJEqoNswpyCdUwzdEgwpXhjrIVtcEw0cVdEgHxzgn91hIF4dnNtW1ZQhIF4hIF4hIB3hIB3hYF4hYF4g392gn51gn51gn51gHxzfXlwfHhvendseXZt1NHL1NHM1NHM1tPOycW/My8qdm9lzMvG09LM0dDL0c/K0tDL0c/K0dDL0tHM0tHM0dDL0dHMzcnCxp+D06eF2rWS2rWS06yIw5d0roBbmGVCgk8uckAgUyYOXjws3bKN4ryZ6dC6roNnxZ2AyaqXhlc7mWdFj19BmWxXiGZSbko0dGJSf3x0gX10gn92fnx3YFxVh4N6h4N6h4N6iIR7iIR6iIR7h4N6hYF5hYF3hYF3g351gHxzf3tyfXlwe3hv1dLL1NHM1NHM1tPOy8jCOzcyc2xj0M7J1dTO09HM0tDL0c/K0M7Jz87Jz87Jzs3IzczHzMvGzMzIx7aoyZx81quJ1q6K0KaDxJh1tYZin21Kh1Iycj4fVScPZj8s3rSQ5MOi4MCh376h37iTv5Bps35Xo3BNkGNGfFQ8ck84bk46bmldcXRqdHNqeXZth4aAZWFag392gn51g392hYF4hYF4hoJ5hoJ5hYF4hYF4hYF3g392gHxzf3tyfnpxfXlw1NHM1NHM1dLN1tPOzMnEQTw4cWph0M7I09HM0c/K0M3IzszHzcrFzMnEy8jDycfCyMXAxcK9xMG9xMK9wqGJz6J/06mGzqJ9xJZyuYllonBMhlIybz0fVCcOdksz4buW5MKl5siu5ces2bKOxJVsrnxWmWtLh15EeFQ+cE45a1NAZWheaGxiam1jbW9mioqDa2dhe3hueHZsendtfHhvfnpxf3tyf3tygHxzgHxzf3txf3txfHlwe3huendtenZt';
  const EE_B64_2='v8PC2N/enKOYj5eKX2ZUjpaIv8a/2d3Y2ODgucTAuMK8r7mzlKGVwMnI5+jo6enp6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6enp5unor7avtL2urr2spratvMnH5Ofn6Ojo6Ojo6Ojo6Ojo6Ojo6ejo6Ojp6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6Ojo6eno6enp6unp7ezt6+vq6ejo5+bnzNDI0Mmu4dm2qrKNcn9Nam1EippDhpczY3RAjZl2WWNA3N3d////////7/X0gIVsn6WZkpiOpKmaxc+99vr38vj3ytTPt8O56/Hv8ff3/P7+////////////////////////////////3+fjiJGHkpuKj52TtsXD1+jq7fj4////////////////////////////////////////////////////////////////////+Pv61+He6fHw////9uLs6tfd6MXD5sWw38K01r68mnKDzbS54cXI0bq2zLq1a29O29vb////////+vr54uXf6O3s4eXh2+Dd3OHX7fLu////////6PDu1N3Y9Pn37fPv/////////////f7+/////////////v7/vMfAZHBfWWVbi5uZ6fX2/////v///////////////////v//09rX1NrU4OTe+fv5+fj2/v38////////6e7r4erozdjTxNHMzNrXgY57fIqBnqysy9fc+fn///n/5+XppK2ci4xxkYVmlq58sMqb0MKzw7iaeoBE29vb////////////////+/38/f7+5+3r/f7//Pz79PXz////+/39/f//4+ro5uzl///+/P383+bkrLaxv8jD+Pv6////////09zWWWRYVGBbw9LR+f///P//8vf21t3WtL+yvMW2w8q7ztG/p6mVwMGs1cmw38WnvZ+JnoN4yLu18O7nuLuskZWJfod+c31zj5yWg4lwg4JifX9erq1p2dyQ2OKe4+zG2+nWkax9b4hXi6NIoMFQiKdRiplUe31M29vc/v/9/v79/////////////P399Pf28fX0+/v15+ze/v//////////6O3q6+/q////5ezq3ubl6/Dvtr66sry49fj47fDtu8C3Z2xldYJ86fX04u3ujpqXeod/gIhtfIVbeIBUqaJ+5Nu4+vHN4cCWxpp107KLzKd/onlcmG1Y0LOd2bCSuY9yrJaEiYyKi41nu7I5vbgsp7AzpbQwo7YhjrA8k7htq8d/5/PYmrF5VW4ndJNQb4NMf4tfh4Zi19jU/v799Pfy+vz5////////+v328vXu7PLu/v76+frx+/v5/////////P7+/P79/v///P39////////+v38ydDPoqagiIuDbHBnfYR+Xmtcg5CFeYWDbXl0ZHJjbnpni451s6iA69am9eCy0Kl+u41kxKB7p4JomnFXkWdKjmhQkXJjimFTfE8/nGxTqot1kIx6f4ptcIBqcIB2cYF6bXxzYnVphJuQzuLV4fHonb97rMWVt8mvhpdlcnFfa2dc1dfR/f77/f749fnv6vDX6/LX5e7P1N686u/l/////////////////////////////////////v79////////////zNLQjZaSe4J7bXBmh42HaHNvn6qo2+TklZ2MfYNvrKOA7suV89+x27yRnm5PjmBFbEI0WzgyVTcxXDszTC4oQiYfTy4lWTgwgFZHlmVMqYl2kIuJZW90cHuAipSbdH2FbHV7bHiAlqOi7fXy9v3+9P3/2ufiiJ1/Y2FVREA3ysu2+fnx0di6x9aUs8Zptcpwn7hbvs6U5OjX8PPj7PLg1+K05+3T7vTi6u7Y1tu+0dW7zNK5ztHFwr2sq6ubwMS+6u/v8vf5ys/Ok5GL0trd09ziyNDSoKaaeoBmlo9s4LqE6r6Kyp1xjV5GcEY1dkk5cEQ3YTwyVzUrUDAoVzUudEo6hVI8gFE7cUg4fUw4kmROoZCCdnt7dn+FlJybi5aGh5J2maNcqrhx3erX9f//9P7/7vj7ssWvdHdXRkE6maF86evToaqBdIo+jK0wja8vbo4ihKBIssGWla5ijqtNgJ04gJ8/pbhrmKZbfpNChJdRoatux8ayq6udg4mAipKNlqCf1t3ev8PDrbGwztTTv8G0gINrZWhHkYtj48SQ77p/uH5UazspVTMrcD8woV1AsG9PrWpKtm5MpGBElVc8kVI1nFo7oWRBgEw0bUEzekg1nnVdjYyIpKN9rrhkqcJsnLhypLxWpsRzz+HB1efW3Ozh6vT/5vH6qq6SYFQ7o6uKrbaM0dW6oa2AfZNEh6JCaoQwYXs1cIs8dZcwb48tdYpKeYxUlaRkip1GtMF6vcWNu76DxMShr7Khr7ew1Nratbm4q62o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0IZd0Ihk0Ixuz5B61p2K2Zl8ynlSyn1W3LOezoVhynZLxnRIyHZJyXdKyHdKxXVIxndMzX5Uy3xQzHhL0HpL3INP6IpV65p3oJZbdZMSfokjhZgvocNputyVxd2y4+3as89bssFMvKNRnnxQZY4yepM3rLJKm65KZLyRit+51bCF97GD/saV/tGi/tCf8biR87WW8aiA7p9u6Zlk55di5ZZh5JRf45Nf24tZxnRGu25FvXVMqlszw3JE1YZZ04hg0Ihky4hozY520ZaC1JV8zoVjyX5Xx3lP1p+B1Zp7xXRKw3JHwm5Cv2s/v2tAwnJGyntQ0oNZ14ti3I5m5JZr8qJz+652/7Z45qxug5Ule4kod48hmLsvrrtjwriE1taPnsFhha4krbNwj3lld48pl7A2s8FMl79qZtKwrdCm6aB1+raD/smW/tOm+8KJ9qRp+650/bR8/raB+rF98aRy5pho4JBh2IhbzHdMw21Ex3NKxXJKqVowsWE5y4BWy4NgyoZlyolrzo9y1Y9w1Yxs0Ylmy4NbxXlPzYlj0pZ3xHRLxXhNyXpNyHdLxndLyHlNzHxR1IVc3Y5l4pNk65tq9qd0/ryI/8+d+7+Jh3w/YGonc4otpKo/sZZWvqyEtqhoqMVxpsBFvseXnqhSZmg0bHY1k5FCbreMf+K7y7CF8aNz/byE/suZ/sqW/Ld7/ryD/7+J/7yJ/bWG86d555Vo4Ilf2oNaznxPvX4/v505mJEejWgtqFMutmhDwHdVxHxdx4Niy4lo0oxr1Yto0otn0IdjyoNcwHROyoxs2a2Ux3pQzYBU1IZX14pY2otZ2IhW1YNT2Ida4I9h6JZm7Zxm9KJr/bV9/sqW/8aQo5JDZnUrZX4igpk4rJJrop9Vr7JLxtFRqMA7qZdsl55VZWMzcX49ZnZSYs2qotyx56Fz96x5/r6I/smV/8KK/8KL/8OO/7qI+6p+8Ztz449m1opYwIhPrZUzd4cYcHk1go9MdnUkmGQ1t2hKvHFUvXVYw3lcxX5fyYNfz4hhz4plzYpry4dmx4BZwHVNx4Rh4LaczoNW1YhW4JRf6Zxn7aFq7qJp7qFn3YxY345c55hj6ptk8aFp/LJ5/seQ/8eRrIpIcYQffJYli4xDcpE+p785r8NQq55Yqp9yycahnalqa3oxfpM0a6JvcuO7vsWT9aNw/rJ+/7+M/8KQ97qF67R20JlnvIZVqX5Mim04hH8qjZotc480ZIobUHAgbGk8mmhGtmlNwnRVwnhZw3paw3paxHpYx3tUy4BU0IhezY5tzI1wyoVlxnxVxHZJyX9S5Lmb2I9j2ItW5Zph86hu/Ld7/r6B/r1/zH1L0XxK4pJd6Zlj8aFp+7J5/sWN/8WMnoBDVnETdoM+tMJNeaEom6w/mKxBl7w7prJmtcBXlqs2YHUkbXg3Z8Cchei5cpBCl4g7s6VDz8NNyb9ElZc1l6o6V3MTTFgZZ3EgVGUaVmwXYHEdbIgeV3cncVUyrlxEwnBPz4Re0IZdz4NXzoFSzH5PzH1MzX5M0YVX0I1lzY5wzIlqyIBYwndQvW1CvWo61ZZu0YdX04hS3pJa7aJm+rd5/8aG/MGDt2I3xGk82YZV55Zi8qNr/LN6/sWM/8CGrp8/h5krd4s0f5Y6mLM9kZs7ssFhrc1IkaQxsbdYkJ5KVGQqbZJVbeG5gMqXbn8tlaM8iJUve5kgiqI1boItlKM2iaMhaX4icYYhpbg8u9JDrMQvfaEVeWwrym1S1H1Z35Jn4pdp4JBa3ItU2IhS1YRP0oNN0oNP04ZVz4Zaz4tnzodgy4JXxn1TwHRJt2g8tWY5uWk4yXpE2Y5V5Jph86tv/71/761xoEgkwWI01HxL5pRg9KRs/bR7/8OM/rl/nZo4m6I0o6pY2eGjosFHn6ZDpb1Jp7dcsKmIl5B2enlLRFUnYal4efLEZpVkaGMugYYzdYgpXHIpeowqgJY4scY4u9M/prxDiKQugJYpm7QujaIva5kXsZQ+5pJ06KKA66aB6aN55p1t4pdj35Jc35lq4qiH2pZvzH9UyoFU1o1f1I1h0opez4lbx4FWtW9MqFo4rFs0vWw+2ItW6KFr8qpv/7p94ZlhjjcZv1su1HVE55Bb9aRt/rZ//8OM8690dX8feooljp0jl6wtj6QyfIMvma0yra1TmpRQgY5fQVY0RVYtYMedhO6/UW8/Z2s2bmk+Z3g3aXU3XHAxh58/xd42u9gwlawqh5wqhJgma3g4ZnAvZXY5m4xE7qF57KmD6aZ/7aV47aN16KFy5Z5u4Jtv1ZFszoRbyX9WyoVZ2plr36eE3Zt22ZZuyIRhtWxMr2BDumRK0XpQ4ZJg8614+rZ+/8GIyoRThEATvlQo0XBA5Y9c96Vw/rmC/8OM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';
  let eeSeq=[], eeTimer=0, eePx=null, eePx2=null;

  // Pre-decode both images at load time
  try{
    const bin=atob(EE_B64);
    const arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    eePx=arr;
  }catch(e){ console.warn('[EE] decode img1 failed',e); }
  try{
    const bin2=atob(EE_B64_2);
    const arr2=new Uint8Array(bin2.length);
    for(let i=0;i<bin2.length;i++) arr2[i]=bin2.charCodeAt(i);
    eePx2=arr2;
  }catch(e){ console.warn('[EE] decode img2 failed',e); }

  window._eeTick=()=>{
    if(window._eeActive<=0) return false;
    if(!eePx){ console.warn('[EE] eePx null — decode failed'); return false; }
    const S=SIZE;
    // 2D panel: morph between images — 15s hold, 3s crossfade, repeat
    if(typeof panel2dMode!=='undefined' && panel2dMode){
      const elapsed=(performance.now()-(window._eeStartTime||0))/1000;
      const phase=elapsed%36; // 15+3+15+3 = 36s cycle
      const alpha=phase<15?0:phase<18?(phase-15)/3:phase<33?1:1-(phase-33)/3;
      const px2=eePx2||eePx;
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const iu=Math.min(63,Math.floor(u/S*64));
        const iv=Math.min(63,Math.floor(v/S*64));
        const pi=(iv*64+iu)*3;
        const r=eePx[pi]/255*(1-alpha)+px2[pi]/255*alpha;
        const g=eePx[pi+1]/255*(1-alpha)+px2[pi+1]/255*alpha;
        const b=eePx[pi+2]/255*(1-alpha)+px2[pi+2]/255*alpha;
        const idx=faceMap[0][(S-1-v)*S+u]; if(idx<0) continue;
        colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
      }
    } else {
      // 3D cube: even faces (0,2,4) get img1, odd faces (1,3,5) get img2
      for(let v=0;v<S;v++) for(let u=0;u<S;u++){
        const iu=Math.min(63,Math.floor(u/S*64));
        const iv=Math.min(63,Math.floor(v/S*64));
        const pi=(iv*64+iu)*3;
        const r1=eePx[pi]/255, g1=eePx[pi+1]/255, b1=eePx[pi+2]/255;
        const px2=eePx2||eePx;
        const r2=px2[pi]/255, g2=px2[pi+1]/255, b2=px2[pi+2]/255;
        for(let f=0;f<6;f++){
          const idx=faceMap[f][(S-1-v)*S+u]; if(idx<0) continue;
          const r=f%2===0?r1:r2, g=f%2===0?g1:g2, b=f%2===0?b1:b2;
          colBuf[idx*3]=r; colBuf[idx*3+1]=g; colBuf[idx*3+2]=b;
        }
      }
    }
    return true;
  };

  let eePending=false, eeWaitTimer=null, eeActivateTimer=null;

  document.querySelectorAll('.size-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const is64=btn.dataset.size==='64' && !btn.dataset.mode;
      const is2d=btn.dataset.mode==='panel2d';
      // During 2s activation window: 64 or 2D activates the egg
      if(eePending && (is64||is2d)){
        clearTimeout(eeActivateTimer);
        eePending=false;
        window._eeActive=10;
        window._eeStartTime=performance.now();
        document.title='✨ Easter Egg!';
        console.log('[EE] activated — images should appear for 10s');
        return;
      }
      if(is2d) return; // ignore 2D for sequence detection
      const sz=parseInt(btn.dataset.size)||0;
      const now=Date.now();
      if(now-eeTimer>2000) eeSeq=[];
      eeTimer=now;
      eeSeq.push(sz);
      if(eeSeq.length>EE_SEQ.length) eeSeq.shift();
      if(eeSeq.length===EE_SEQ.length && eeSeq.every((v,i)=>v===EE_SEQ[i])){
        eeSeq=[];
        clearTimeout(eeWaitTimer); clearTimeout(eeActivateTimer);
        console.log('[EE] sequence matched — waiting 2s');
        document.title='🔒 ...';
        // Wait 2s, then open 2s window for 64 or 2D press
        eeWaitTimer=setTimeout(()=>{
          eePending=true;
          document.title='🔑 Press 64 or 2D!';
          console.log('[EE] activation window open — press 64 or 2D now');
          eeActivateTimer=setTimeout(()=>{ eePending=false; document.title='Multidisplay'; console.log('[EE] activation window expired'); },2000);
        },2000);
      }
    });
  });
})();

// Spectrum analyser controls
document.querySelectorAll('.spectrum-bands-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.spectrum-bands-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    spectrumBandOverride = parseInt(btn.dataset.bands);
  });
});

document.querySelectorAll('.sp-fit-screen-el').forEach(chk=>chk.addEventListener('change',(e)=>{
  spectrumFitToScreen = e.target.checked;
  document.querySelectorAll('.sp-fit-screen-el').forEach(other=>{ if(other!==e.target) other.checked=e.target.checked; });
}));

function auApplyAutoGainState(){
  document.querySelectorAll('.au-gain-el').forEach(sl=>sl.disabled=auAutoGainOn);
}
document.querySelectorAll('.au-autogain-el').forEach(chk=>chk.addEventListener('change',(e)=>{
  auAutoGainOn = e.target.checked;
  document.querySelectorAll('.au-autogain-el').forEach(other=>{ if(other!==e.target) other.checked=e.target.checked; });
  auApplyAutoGainState();
}));
auApplyAutoGainState();

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
let lastTime=0;
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
  { effect:'fireworks',    label:'Fireworks',             duration:9,  speedMult:1,   overlays:{sparkle:true} },
  { effect:'aurora',       label:'Aurora + Edge Glow',    duration:9,  speedMult:0.85,overlays:{edgeglow:true} },
  { effect:'tron',         label:'Tron Bikes',            duration:18, speedMult:1,   tronBikeCount:4, tronStraightness:0.72, overlays:{} },
  { effect:'nebula',       label:'Nebula + Mist',         duration:9,  speedMult:0.9, overlays:{mist:true} },
  { effect:'maze',         label:'Maze Runner',           duration:18, speedMult:1,   mazeRunnerCount:3, mazeBrightWalls:true, overlays:{} },
  { effect:'balls',        label:'Bouncing Balls + Fire', duration:9,  speedMult:1,   overlays:{fire:true},  ovBG:true },
  { effect:'warp',         label:'Warp Drive + Stars',    duration:9,  speedMult:1,   overlays:{stars:true}, ovBG:true },
  { effect:'depth_rings',  label:'Depth Rings + Wave',    duration:8,  speedMult:1.2, overlays:{colorwave:true} },
  { effect:'life',         label:'Crystal Life + Glow',   duration:10, speedMult:1,   overlays:{edgeglow:true} },
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
    if(radioPlaying && radioAudioEl) radioAudioEl.volume=0;
  }

  // ── Pre-alarm brightness ramp + sunrise rendering ──
  if(activeAlarm&&activeAlarm.phase==='pre'&&!activeAlarm.dismissed){
    const elapsed=Date.now()-activeAlarm.startMs;
    const rawProgress=Math.min(1,elapsed/activeAlarm.preMs);
    const windDown=!!activeAlarm.al.prealarm?.windDown;
    const progress=windDown?1-rawProgress:rawProgress;
    const startBright=activeAlarm.al.prealarm?.startBright||5;
    // Radio volume rides the same ramp as brightness: wake alarms start at
    // 0 and rise to the set volume by the time the main alarm fires;
    // wind-down starts at the set volume and fades to 0, same curve as the
    // dimming — just applied to audio instead of light.
    if(radioPlaying && radioAudioEl) radioAudioEl.volume=Math.max(0,Math.min(1,progress*radioTargetVolume));
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
        if(efKey==='radio' && activeAlarm.al.prealarm.effectRiseOpts?.radioUrl){
          if(!activeAlarm._radioSetup){
            activeAlarm._radioSetup=true;
            const ro=activeAlarm.al.prealarm.effectRiseOpts;
            if(typeof radioPlay==='function') radioPlay({name:ro.radioName||'Alarm Station', genre:ro.radioGenre||'', url:ro.radioUrl});
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

  // Easter egg overrides everything just before render
  if(window._eeTick && window._eeActive>0) window._eeTick();
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
const CUBE_FPS = 17;  // Streaming rate for the physical panel. Dropped to 17:
                      // 25 sometimes overran the board (crash/reboot under the
                      // combined WS + display load on the weak-signal link).
                      // Native standalone effects render on-device at the
                      // display loop rate independent of this.
// How many faces the connected hardware actually has. Streaming all 6 faces
// to a board that only drives fewer (e.g. a single-panel bring-up, NUM_FACES=1)
// wastes most of the WiFi bandwidth on frames the ESP32 immediately rejects,
// starving the faces it does use. Queried from /api/status on connect so we
// only send the faces that will actually be displayed. Defaults to 6 (full
// cube) until the query answers.
let cubeNumFaces = 6;

// Send a small JSON control command to the ESP32 over the cube WebSocket
// (effect/brightness/speed). Used so the sliders control the on-device native
// effects, not just the streamed frames - the browser stays a working remote
// even when the ESP32 is running effects itself with nothing being streamed.
function cubeSendCmd(obj){
  if(cubeConnected && cubeWs && cubeWs.readyState === WebSocket.OPEN){
    try { cubeWs.send(JSON.stringify(obj)); } catch(e){}
  }
}

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

  // Ask the hardware how many panels it drives, so we stream only those.
  fetch('/api/status').then(r => r.json()).then(s => {
    if(s && s.num_faces >= 1 && s.num_faces <= 6){
      cubeNumFaces = s.num_faces;
      console.log('[cube] hardware has', cubeNumFaces, 'face(s); streaming only those');
    }
  }).catch(()=>{});

  try {
    cubeWs = new WebSocket(`ws://${h}:81`);
    cubeWs.binaryType = 'arraybuffer';
    cubeWs.onopen  = () => {
      cubeConnected = true;
      console.log('[cube] connected');
      // Push current control state so the on-device effects match the UI
      // immediately on (re)connect.
      cubeSendCmd({cmd:'setBrightness', value: brightness});
      cubeSendCmd({cmd:'setSpeed', value: speedMult});
      if(typeof currentEffect === 'string' && currentEffect){
        cubeSendCmd({cmd:'setEffect', effect: currentEffect});
      }
    };
    cubeWs.onclose = () => { cubeConnected = false; setTimeout(initCubeWs, 5000); };
    cubeWs.onerror = () => { cubeConnected = false; };
  } catch(e) {
    cubeConnected = false;
    console.warn('[cube] WebSocket unavailable:', e && e.message);
  }
}

// Frame streaming to the physical panel is OFF by default: the ESP32 runs the
// effects natively on-device (driven by the setEffect/brightness/speed
// commands), so the browser is just a remote control - no browser needed for
// the display to run, and no slow WiFi catch-up. Streaming, when off, means
// the ESP32 never sees a video frame (g_everStreamed stays false) so its
// native renderer is always in charge. Set window.streamToCube=true in the
// console to re-enable pixel streaming (e.g. for an effect not yet ported to
// native), at the cost of the WiFi-bandwidth limits.
let streamToCube = false;

function streamFrameToCube(dt) {
  // Streaming is off by default - the ESP32 runs native effects on its single
  // flat panel (which is exactly the "Panel 2D / 1 display" render). Panel 2D
  // is purely a browser-side view choice and does NOT stream; the panel keeps
  // showing the native effect. Set window.streamToCube=true only if you
  // deliberately want to push browser pixels for a not-yet-ported effect.
  if(!streamToCube) return;
  if(!cubeConnected || !cubeWs || cubeWs.readyState !== WebSocket.OPEN) return;
  cubeStreamT += dt;
  if(cubeStreamT < 1/CUBE_FPS) return;
  cubeStreamT = 0;

  const S = SIZE, pktBytes = 2 + S*S*3;

  // Backpressure: one animation frame = cubeNumFaces * pktBytes queued. If
  // the socket still has more than ~2 frames' worth un-sent, WiFi isn't
  // draining fast enough - skip this frame instead of piling on. Without this
  // the send buffer balloons unboundedly when the ESP32/WiFi can't keep up,
  // so frames arrive at the ESP32 badly delayed and in bursts (symptom:
  // display flickers then reverts to the ESP32's default because fresh frames
  // stop arriving). Dropping frames here keeps what does get through
  // low-latency and continuous.
  if(cubeWs.bufferedAmount > 2 * cubeNumFaces * pktBytes) return;

  // 2D panel mode: send exactly what the flat panel2d canvas shows (face 0 =
  // front) to the physical front panel, using the SAME vertical orientation
  // as renderPanel2d() (fv = S-1-v). One face only, so this also keeps the
  // bandwidth minimal - "what's on screen is what's on the panel".
  if(panel2dMode){
    const buf = new Uint8Array(pktBytes);
    buf[0] = PKT_VIDEO;
    buf[1] = 0;              // face 0 (front)
    let off = 2;
    for(let v = 0; v < S; v++){
      for(let u = 0; u < S; u++){
        const i = faceMap[0][(S-1-v)*S + u];   // match panel2d's vertical flip
        if(i >= 0){
          // Apply the master brightness (slider + wind-down dimming) to the
          // streamed pixels, so the physical panel dims/blacks-out with the
          // UI - not just the on-screen cube. clamp01 keeps the >1 overbright
          // range from wrapping.
          buf[off]   = (Math.min(1, colBuf[i*3]   * brightness) * 255 + 0.5) | 0;
          buf[off+1] = (Math.min(1, colBuf[i*3+1] * brightness) * 255 + 0.5) | 0;
          buf[off+2] = (Math.min(1, colBuf[i*3+2] * brightness) * 255 + 0.5) | 0;
        }
        off += 3;
      }
    }
    cubeWs.send(buf.buffer);
    return;
  }

  for(let vid = 0; vid < cubeNumFaces; vid++){
    const jsFace = CUBE_FACE_ORDER[vid];
    const buf = new Uint8Array(pktBytes);
    buf[0] = PKT_VIDEO;
    buf[1] = vid;            // faceID for master/slave routing
    let off = 2;
    for(let v = 0; v < S; v++){
      for(let u = 0; u < S; u++){
        const i = faceMap[jsFace][v*S + u];
        if(i >= 0){
          // Apply master brightness (slider + wind-down) to the stream, so
          // the physical panel dims/blacks-out with the UI.
          buf[off]   = (Math.min(1, colBuf[i*3]   * brightness) * 255 + 0.5) | 0;
          buf[off+1] = (Math.min(1, colBuf[i*3+1] * brightness) * 255 + 0.5) | 0;
          buf[off+2] = (Math.min(1, colBuf[i*3+2] * brightness) * 255 + 0.5) | 0;
        }
        off += 3;
      }
    }
    cubeWs.send(buf.buffer);
  }
}

// ═══════════════════════════════════════════════════
//  INTERNET RADIO — station list + transport controls
// ═══════════════════════════════════════════════════
function radioMakeStationBtn(st, container){
  const b = document.createElement('button');
  b.className = 'radio-station-btn';
  b.style.cssText = 'width:100%;text-align:left;padding:6px 10px;margin-bottom:4px;background:rgba(120,160,255,0.08);border:1px solid rgba(120,160,255,0.25);color:#cdd8ff;border-radius:4px;cursor:pointer;font-size:11px;';
  b.textContent = st.name + (st.genre ? ' — ' + st.genre : '');
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.radio-station-btn').forEach(x=>x.style.background='rgba(120,160,255,0.08)');
    b.style.background = 'rgba(120,160,255,0.3)';
    radioPlay(st);
  });
  container.appendChild(b);
}

// Every control below exists twice in the DOM (Internet Radio effect panel
// + the audio-only overlay panel), sharing classes instead of IDs — both
// copies stay in sync since they all drive the same underlying radio state.
function radioBuildStationList(){
  document.querySelectorAll('.radio-station-list-el').forEach(wrap=>{
    if(typeof RADIO_STATIONS === 'undefined') return;
    wrap.innerHTML = '';
    RADIO_STATIONS.forEach(st=>radioMakeStationBtn(st, wrap));
  });
}
radioBuildStationList();

// Called by effects.js's radioSearchStations() once results (or an error)
// come back — kept in ui.js since it's DOM rendering, not station logic.
function radioRenderSearchResults(){
  document.querySelectorAll('.radio-search-results-el').forEach(wrap=>{
    if(typeof radioSearchResults === 'undefined') return;
    wrap.innerHTML = '';
    radioSearchResults.forEach(st=>radioMakeStationBtn(st, wrap));
  });
}

document.querySelectorAll('.radio-stop-btn-el').forEach(btn=>btn.addEventListener('click', radioStop));
document.querySelectorAll('.radio-vol-el').forEach(sl=>sl.addEventListener('input', e=>{
  radioSetVolume(parseFloat(e.target.value));
  document.querySelectorAll('.radio-vol-el').forEach(other=>{ if(other!==e.target) other.value=e.target.value; });
}));
function radioDoSearch(){
  const input = document.querySelector('.radio-search-input-el');
  const q = input ? input.value.trim() : '';
  document.querySelectorAll('.radio-search-input-el').forEach(el=>el.value=q);
  radioSearchStations(q);
}
document.querySelectorAll('.radio-search-btn-el').forEach(btn=>btn.addEventListener('click', radioDoSearch));
document.querySelectorAll('.radio-search-input-el').forEach(inp=>inp.addEventListener('keydown', e=>{
  if(e.key==='Enter'){ e.preventDefault(); radioDoSearch(); }
}));
document.querySelectorAll('.radio-browse-top-btn-el').forEach(btn=>btn.addEventListener('click', ()=>radioSearchStations('')));

// ═══════════════════════════════════════════════════
//  BLUETOOTH SPEAKER — talks to pi/bluetooth_server.py running on the same
//  Pi (port 5005). Not reachable at all when running on a laptop/GitHub
//  Pages — every call below just fails quietly into the status line.
// ═══════════════════════════════════════════════════
function btApiUrl(path){
  const h = location.hostname;
  return `http://${h}:5005${path}`;
}

// Bluetooth controls appear in both the Setup section and the Audio &
// Media section now — same shared-class pattern as the radio/mic/phone
// controls, so both copies always show the same state.
function btSetStatus(text){
  document.querySelectorAll('.bt-status-el').forEach(el=>el.textContent=text);
}

function btRenderDevices(devices, mode){
  document.querySelectorAll('.bt-device-list-el').forEach(wrap=>{
    wrap.innerHTML = '';
    if(!devices || !devices.length){
      wrap.innerHTML = '<div style="font-size:10px;color:#666;">No devices found.</div>';
      return;
    }
    devices.forEach(dev=>{
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      const label = document.createElement('span');
      label.style.cssText = 'flex:1;font-size:11px;color:#cdd8ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.textContent = dev.name + ' (' + dev.mac + ')';
      row.appendChild(label);
      if(mode==='scan'){
        const btn = document.createElement('button');
        btn.textContent = 'Pair';
        btn.style.cssText = 'flex:0 0 auto;padding:4px 10px;background:rgba(80,200,120,0.15);border:1px solid rgba(80,200,120,0.4);color:#8adf9e;border-radius:4px;cursor:pointer;font-size:10px;';
        btn.addEventListener('click', ()=>btPair(dev.mac, dev.name));
        row.appendChild(btn);
      } else {
        const tag = document.createElement('span');
        tag.style.cssText = 'font-size:10px;color:#8adf9e;';
        tag.textContent = 'paired';
        row.appendChild(tag);
      }
      wrap.appendChild(row);
    });
  });
}

async function btScan(){
  btSetStatus('Scanning… (~6s)');
  document.querySelectorAll('.bt-device-list-el').forEach(wrap=>wrap.innerHTML='');
  try{
    const r = await fetch(btApiUrl('/bt/scan'));
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    btSetStatus(data.devices.length + ' device(s) found');
    btRenderDevices(data.devices, 'scan');
  }catch(e){
    btSetStatus('✕ Bluetooth helper unreachable — is pi/bluetooth_server.py running on this Pi? (see pi/README.md)');
    console.warn('[bt] scan failed:', e && e.message);
  }
}

async function btRefreshStatus(){
  btSetStatus('Checking paired devices…');
  try{
    const r = await fetch(btApiUrl('/bt/status'));
    if(!r.ok) throw new Error('HTTP '+r.status);
    const data = await r.json();
    btSetStatus(data.devices.length + ' paired device(s)');
    btRenderDevices(data.devices, 'status');
  }catch(e){
    btSetStatus('✕ Bluetooth helper unreachable — is pi/bluetooth_server.py running on this Pi? (see pi/README.md)');
    console.warn('[bt] status failed:', e && e.message);
  }
}

async function btPair(mac, name){
  btSetStatus('Pairing with ' + name + '…');
  try{
    const r = await fetch(btApiUrl('/bt/pair'), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({mac}),
    });
    const data = await r.json();
    if(data.ok){
      btSetStatus('✓ Connected to ' + name);
      btRefreshStatus();
    } else {
      btSetStatus('✕ Pairing failed — see browser console for the bluetoothctl log');
      console.warn('[bt] pair log:', data.log || data.error);
    }
  }catch(e){
    btSetStatus('✕ Bluetooth helper unreachable — is pi/bluetooth_server.py running on this Pi?');
    console.warn('[bt] pair failed:', e && e.message);
  }
}

document.querySelectorAll('.bt-scan-btn-el').forEach(b=>b.addEventListener('click', btScan));
document.querySelectorAll('.bt-refresh-btn-el').forEach(b=>b.addEventListener('click', btRefreshStatus));

function btSetPhoneStatus(text){
  document.querySelectorAll('.bt-phone-status-el').forEach(el=>el.textContent=text);
}

document.querySelectorAll('.bt-discoverable-btn-el').forEach(b=>b.addEventListener('click', async ()=>{
  btSetPhoneStatus('Opening pairing window (~120s) — connect from your phone\'s Bluetooth settings now…');
  try{
    const r = await fetch(btApiUrl('/bt/discoverable'), {method:'POST'});
    const data = await r.json();
    if(data.ok) btSetPhoneStatus('Discoverable — connect from your phone now, then start playing music.');
    else { btSetPhoneStatus('✕ Could not enable discoverable mode'); console.warn('[bt] discoverable:', data.error); }
  }catch(e){
    btSetPhoneStatus('✕ Bluetooth helper unreachable — is pi/bluetooth_server.py running on this Pi?');
    console.warn('[bt] discoverable failed:', e && e.message);
  }
}));

document.querySelectorAll('.bt-route-phone-btn-el').forEach(b=>b.addEventListener('click', async ()=>{
  btSetPhoneStatus('Routing phone audio…');
  try{
    const r = await fetch(btApiUrl('/bt/route-phone-audio'), {method:'POST'});
    const data = await r.json();
    if(data.ok) btSetPhoneStatus('✓ Phone audio routed — use "📱 Use Phone (Bluetooth)" in the Spectrum Analyser overlay.');
    else { btSetPhoneStatus('✕ ' + (Array.isArray(data.log)?data.log[data.log.length-1]:'No phone audio found — is the phone connected and playing music?')); console.warn('[bt] route-phone-audio:', data.log||data.error); }
  }catch(e){
    btSetPhoneStatus('✕ Bluetooth helper unreachable — is pi/bluetooth_server.py running on this Pi?');
    console.warn('[bt] route-phone-audio failed:', e && e.message);
  }
}));

document.querySelectorAll('.phone-audio-btn-el').forEach(b=>b.addEventListener('click', togglePhoneAudio));

// Auto-connect on load
initCubeWs();

// ═══════════════════════════════════════════════════
//  STANDALONE MODE PREVIEW
//
// The ESP32 can only run a handful of natively-implemented effects
// (standalone.h: rainbow, pulse, plasma, clock, weather) when the browser
// isn't connected — everything else in EFFECTS is computed here in JS and
// simply won't run on the cube once you disconnect. This preview mode greys
// out every button/overlay that won't survive disconnection, so you can
// safely preconfigure the cube before walking away from the browser.
// ═══════════════════════════════════════════════════
const STANDALONE_EFFECT_MAP = {
  plasma: 2, datetime: 3, weather: 4,
  fireworks: 5, gradient_wash: 6, aurora: 7,
  balls: 9, strobe: 10, lightning: 11, tide: 12, rain: 13,
};
let standaloneModeOn = false;

function standaloneModeApply(){
  document.querySelectorAll('.effect-btn').forEach(btn=>{
    const ok = !standaloneModeOn || STANDALONE_EFFECT_MAP.hasOwnProperty(btn.dataset.effect);
    btn.disabled = !ok;
    btn.style.opacity = ok ? '' : '0.35';
    btn.style.pointerEvents = ok ? '' : 'none';
  });
  document.querySelectorAll('.ov-toggle input, .ov-sl, .ov-col').forEach(el=>{
    el.disabled = standaloneModeOn;
    const wrap = el.closest('.ov-toggle') || el;
    wrap.style.opacity = standaloneModeOn ? '0.35' : '';
    wrap.style.pointerEvents = standaloneModeOn ? 'none' : '';
  });
  const note = document.getElementById('standalone-mode-note');
  if(note) note.style.display = standaloneModeOn ? 'block' : 'none';
}

function standalonePushEffect(eff){
  const id = STANDALONE_EFFECT_MAP[eff];
  if(id === undefined) return;
  const h = location.hostname;
  if(!h || h === 'localhost' || h === '127.0.0.1' || location.protocol === 'https:') return;
  fetch(`http://${h}/api/standalone/effect`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({effect:id})
  }).catch(e=>console.warn('[standalone] could not push effect to cube:', e && e.message));
}

document.getElementById('standalone-mode-chk')?.addEventListener('change', e=>{
  standaloneModeOn = e.target.checked;
  standaloneModeApply();
});

document.querySelectorAll('.effect-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(standaloneModeOn) standalonePushEffect(btn.dataset.effect);
  });
});

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

// Tap version number in sidebar footer to force-clear cache and reload
(function wireForceUpdate(){
  const el=document.getElementById('app-version');
  if(!el) return;
  el.style.cursor='pointer';
  el.title='Tap to force update';
  let busy=false;
  function forceUpdate(e){
    if(e){ e.preventDefault(); e.stopPropagation(); }
    if(busy) return;
    busy=true;
    const orig=el.textContent;
    el.textContent='Clearing…';
    Promise.resolve().then(async()=>{
      try{
        if(window.caches){
          const ks=await caches.keys();
          await Promise.all(ks.map(k=>caches.delete(k)));
        }
        if(navigator.serviceWorker){
          const regs=await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r=>r.unregister()));
        }
      }catch(err){ /* ignore, still reload */ }
      location.href=location.pathname+'?nocache='+Date.now();
    });
  }
  el.addEventListener('touchend', forceUpdate, {passive:false});
  el.addEventListener('click', forceUpdate);
})();
