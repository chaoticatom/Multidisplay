// Ported verbatim (math/rendering logic unchanged) from effects-games.js's
// retroDrawFace(faceIdx,dt,buf,S) (~line 1340-4353), the per-game procedural
// drawing/simulation logic for all 14 Retro mini-games. The function is
// entirely self-contained (only reads dt/buf/S/the passed game-state object
// plus Math/typed-array builtins) so the port is near-verbatim - the only
// real changes are the function signature (the game object is passed
// directly instead of indexing a module-level retroGames[] by faceIdx,
// since retro.js owns that array) and dropping the splash-screen branch
// (retro.js's effectRetro() calls into ./title.js for that state instead,
// before ever calling this function).
//
// One deliberate content change: the original samfox ('Sam Fox SP') block
// decoded an embedded base64 photo (SF_GAMEBG_B64 - an actual photo, not
// procedural art) as its background via atob(). That's dropped here in
// favour of a plain procedural green card-table felt background - see the
// comment at that block below. Everything else (card dealing, scoring,
// HUD) is untouched.
function drawRetroGame(game, dt, buf, S){
  const _setP0=(x,y,r,g,b)=>{
    if(x<0||x>=S||y<0||y>=S) return;
    const i=(y*S+x)*3; buf[i]=r; buf[i+1]=g; buf[i+2]=b;
  };
  const _fillRect0=(x1,y1,x2,y2,r,g,b)=>{
    for(let y=Math.max(0,y1);y<=Math.min(S-1,y2);y++) for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) _setP0(x,y,r,g,b);
  };
  const _hLine0=(x1,x2,y,r,g,b)=>{ for(let x=Math.max(0,x1);x<=Math.min(S-1,x2);x++) _setP0(x,y,r,g,b); };
  let setP=_setP0, fillRect=_fillRect0, hLine=_hLine0;

  // ZX Spectrum colours (bright)
  const BLK=[0,0,0],BLU=[0,0,0.85],RED=[0.85,0,0],MAG=[0.85,0,0.85];
  const GRN=[0,0.85,0],CYN=[0,0.85,0.85],YEL=[0.85,0.85,0],WHT=[1,1,1];

  // Black background
  for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0.02);

  if(game.name==='jetpac'){
    const p=game;
    const groundY=8; // yellow ground near bottom
    const plat1Y=24, plat2Y=40; // two green platforms
    const rocketX=30, rocketBaseY=groundY+1; // rocket on ground

    // Stars background
    for(let i=0;i<50;i++){
      const sx=(i*17+3)%S, sy=(i*31+7)%S;
      const bright=0.2+0.15*Math.sin(p.t*2+i);
      setP(sx,sy,bright,bright,bright*1.2);
    }

    // Yellow ground with jagged grass texture
    for(let x=0;x<S;x++){
      const grassH=2+((x*7+3)%3);
      for(let gy=0;gy<grassH;gy++){
        const yy=groundY-gy;
        if(yy>=0) setP(x,yy,0.9,0.9,0);
      }
    }

    // Green platforms (chunky, like original)
    for(let x=5;x<=28;x++){
      for(let py=plat1Y;py<=plat1Y+2;py++) setP(x,py,0,0.8,0);
    }
    for(let x=38;x<=58;x++){
      for(let py=plat2Y;py<=plat2Y+2;py++) setP(x,py,0,0.8,0);
    }
    // Magenta bar at top-left and top-right (like original HUD borders)
    hLine(0,15,S-2,0.8,0,0.8);
    hLine(48,S-1,S-2,0.8,0,0.8);

    // Rocket assembly phases
    p.phaseT+=dt;
    if(p.phase==='build'){
      // Auto-pilot: astronaut flies to part, picks it up, brings to rocket
      if(!p.carryPart){
        // Fly towards the part
        const dx=p.partX-p.playerX, dy=p.partY-p.playerY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>2){
          p.playerX+=dx/dist*25*dt;
          p.playerY+=dy/dist*25*dt;
        } else {
          p.carryPart=true;
        }
        p.laserDir=dx>0?1:-1;
      } else {
        // Carry part to rocket position
        const targetY=rocketBaseY+4+p.rocketParts*6;
        const dx=rocketX-p.playerX, dy=targetY-p.playerY;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist>2){
          p.playerX+=dx/dist*25*dt;
          p.playerY+=dy/dist*25*dt;
        } else {
          p.carryPart=false;
          p.rocketParts++;
          if(p.rocketParts>=3){
            p.phase='fuel';
            p.phaseT=0;
          } else {
            p.partX=10+Math.random()*44;
            p.partY=plat1Y+3+Math.random()*15;
          }
        }
        p.laserDir=dx>0?1:-1;
      }
    } else if(p.phase==='fuel'){
      // Fly around collecting fuel, then launch
      const fuelTargetX=rocketX, fuelTargetY=rocketBaseY+10;
      const orbitR=15;
      const angle=p.phaseT*1.8;
      const targetX=rocketX+Math.cos(angle)*orbitR;
      const targetY=25+Math.sin(angle)*10;
      const dx=targetX-p.playerX, dy=targetY-p.playerY;
      p.playerX+=dx*2*dt;
      p.playerY+=dy*2*dt;
      p.laserDir=Math.cos(angle+0.5)>0?1:-1;
      if(p.phaseT>5){ p.phase='launch'; p.phaseT=0; p.launchT=0; }
    } else if(p.phase==='launch'){
      // Rocket launches upward
      p.launchT+=dt;
      const orbitR=18;
      const angle=p.phaseT*2;
      p.playerX=rocketX+Math.cos(angle)*orbitR;
      p.playerY=30+Math.sin(angle)*8;
      p.laserDir=1;
      if(p.launchT>4){
        p.phase='build'; p.phaseT=0; p.rocketParts=0;
        p.partX=10+Math.random()*44; p.partY=plat1Y+3+Math.random()*15;
        p.launchT=0;
      }
    }

    // Draw rocket (pink/magenta like original)
    if(p.phase!=='launch'||p.launchT<2){
      const rLaunchOff=p.phase==='launch'?Math.round(p.launchT*p.launchT*8):0;
      const rBaseY=rocketBaseY+rLaunchOff;
      // Base section (always visible)
      fillRect(rocketX-3,rBaseY,rocketX+3,rBaseY+5,0.8,0.3,0.8);
      fillRect(rocketX-2,rBaseY,rocketX+2,rBaseY+5,0.9,0.4,0.9);
      // Middle section
      if(p.rocketParts>=1||p.phase==='fuel'||p.phase==='launch'){
        fillRect(rocketX-3,rBaseY+6,rocketX+3,rBaseY+10,0.8,0.3,0.8);
        fillRect(rocketX-2,rBaseY+6,rocketX+2,rBaseY+10,0.9,0.4,0.9);
      }
      // Top section (nose cone)
      if(p.rocketParts>=2||p.phase==='fuel'||p.phase==='launch'){
        fillRect(rocketX-2,rBaseY+11,rocketX+2,rBaseY+14,0.8,0.3,0.8);
        fillRect(rocketX-1,rBaseY+14,rocketX+1,rBaseY+16,0.9,0.4,0.9);
        setP(rocketX,rBaseY+17,1,1,1); // tip
      }
      // Rocket exhaust during launch
      if(p.phase==='launch'){
        for(let fy=0;fy<4+Math.round(p.launchT*2);fy++){
          const flameY=rBaseY-1-fy;
          if(flameY<0) break;
          const fw=Math.max(1,3-fy);
          const flicker=Math.random();
          for(let fx=-fw;fx<=fw;fx++){
            setP(rocketX+fx,flameY,1,0.5+flicker*0.5,0);
          }
        }
      }
    }

    // Floating part (if not yet picked up and in build phase)
    if(p.phase==='build'&&!p.carryPart){
      const ppx=Math.round(p.partX), ppy=Math.round(p.partY);
      fillRect(ppx-2,ppy,ppx+2,ppy+4,0.8,0.3,0.8);
      fillRect(ppx-1,ppy,ppx+1,ppy+4,0.9,0.4,0.9);
    }
    // Carried part follows player
    if(p.phase==='build'&&p.carryPart){
      const cpx=Math.round(p.playerX), cpy=Math.round(p.playerY)-3;
      fillRect(cpx-2,cpy,cpx+2,cpy+4,0.8,0.3,0.8);
    }

    // Draw astronaut (white figure with legs)
    const px=Math.round(p.playerX), py=Math.round(p.playerY);
    // Head (round, white)
    setP(px,py+5,1,1,1); setP(px-1,py+5,0.8,0.8,0.8); setP(px+1,py+5,0.8,0.8,0.8);
    setP(px,py+6,1,1,1); setP(px-1,py+6,0.9,0.9,0.9); setP(px+1,py+6,0.9,0.9,0.9);
    // Body
    setP(px,py+4,1,1,1); setP(px-1,py+4,0.8,0.8,0.8); setP(px+1,py+4,0.8,0.8,0.8);
    setP(px,py+3,1,1,1); setP(px-1,py+3,0.7,0.7,0.7); setP(px+1,py+3,0.7,0.7,0.7);
    setP(px,py+2,0.9,0.9,0.9);
    // Legs (animated walking/flying)
    const legAnim=Math.round(Math.sin(p.t*10));
    setP(px-1+legAnim,py+1,0.8,0.8,0.8);
    setP(px+1-legAnim,py+1,0.8,0.8,0.8);
    setP(px-1+legAnim,py,0.7,0.7,0.7);
    setP(px+1-legAnim,py,0.7,0.7,0.7);
    // Jetpack (on back)
    setP(px-2,py+3,0.5,0.5,0.5); setP(px-2,py+4,0.5,0.5,0.5);
    // Jetpack flame
    if(py>groundY+3){
      const flameFlicker=Math.sin(p.t*20)>0;
      setP(px-2,py+2,1,flameFlicker?0.5:0.2,0);
      setP(px-2,py+1,1,flameFlicker?0.8:0.4,0);
    }
    // Init alien state
    if(!p.aliens||p.aliens.length===0){
      p.aliens=[];
      for(let a=0;a<4;a++) p.aliens.push({alive:true,explodeT:0,respawnT:0});
    }

    // Laser beam (horizontal, firing direction) — check alien hits
    p.laserT+=dt;
    const firingLaser=Math.sin(p.t*4)>0.3;
    const alienColors=[[1,0,0],[0,0.9,0],[0,0.9,0.9],[0.9,0,0.9]];
    // Compute alien positions first
    const alienPos=[];
    for(let a=0;a<4;a++){
      const ax=(Math.round(p.t*12*(a%2?1:-1)+a*17))%S;
      const aax=ax<0?ax+S:ax;
      const ay=15+a*10+Math.round(Math.sin(p.t*1.8+a*1.5)*5);
      alienPos.push({x:aax,y:ay});
    }

    if(firingLaser){
      let laserHitX=S;
      for(let lx=1;lx<20;lx++){
        const beamX=px+lx*p.laserDir;
        if(beamX<0||beamX>=S){ laserHitX=lx; break; }
        // Check if laser hits an alive alien
        let hitAlien=false;
        for(let a=0;a<4;a++){
          if(!p.aliens[a].alive) continue;
          const ap=alienPos[a];
          if(Math.abs(beamX-ap.x)<3&&Math.abs(py+4-ap.y)<3){
            p.aliens[a].alive=false;
            p.aliens[a].explodeT=0.4;
            p.aliens[a].respawnT=2+Math.random()*2;
            hitAlien=true; laserHitX=lx; break;
          }
        }
        if(hitAlien) break;
        setP(beamX,py+4,1,1,1);
      }
    }

    // Draw aliens or explosions
    for(let a=0;a<4;a++){
      const al=p.aliens[a];
      const ac=alienColors[a%4];
      const ap=alienPos[a];
      if(al.explodeT>0){
        // Explosion
        al.explodeT-=dt;
        const eRad=Math.round((0.4-al.explodeT)*10);
        for(let dy=-eRad;dy<=eRad;dy++) for(let dx=-eRad;dx<=eRad;dx++){
          if(dx*dx+dy*dy<=eRad*eRad){
            const ex=ap.x+dx, ey=ap.y+dy;
            if(ex>=0&&ex<S&&ey>=0&&ey<S) setP(ex,ey,1,Math.random()*0.7,0);
          }
        }
      } else if(!al.alive){
        al.respawnT-=dt;
        if(al.respawnT<=0) al.alive=true;
      } else {
        // Blob body (round, 5x5)
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
          if(dx*dx+dy*dy<=5){
            const sx=ap.x+dx, sy=ap.y+dy;
            if(sx>=0&&sx<S&&sy>=0&&sy<S){
              const bright=0.7+0.3*Math.sin(p.t*5+a+dy*0.5);
              setP(sx,sy,ac[0]*bright,ac[1]*bright,ac[2]*bright);
            }
          }
        }
        // Tentacles
        for(let leg=0;leg<3;leg++){
          const lx=ap.x-1+leg+Math.round(Math.sin(p.t*8+a+leg)*0.8);
          const ly=ap.y-3;
          if(lx>=0&&lx<S&&ly>=0&&ly<S) setP(lx,ly,ac[0]*0.6,ac[1]*0.6,ac[2]*0.6);
        }
      }
    }

    // Score text at top (simple)
    const scoreFlash=Math.sin(p.t*3)>0;
    if(scoreFlash){
      for(let sx=4;sx<18;sx++) setP(sx,S-4,0.5,0.5,1);
    }

  } else if(game.name==='manic'){
    const p=game;
    const borderW=4; // blue border walls
    const groundY=10; // yellow floor
    const playL=borderW, playR=S-1-borderW;

    // Blue border walls (left and right, diamond pattern like original)
    for(let y=0;y<S;y++){
      for(let x=0;x<borderW;x++){
        const pat=((x+y)%3===0)?0.8:0.5;
        setP(x,y,0,0,pat);
      }
      for(let x=S-borderW;x<S;x++){
        const pat=((x+y)%3===0)?0.8:0.5;
        setP(x,y,0,0,pat);
      }
    }
    // Blue top border
    for(let x=0;x<S;x++){
      const pat=((x)%3===0)?0.8:0.5;
      setP(x,S-1,0,0,pat); setP(x,S-2,0,0,pat);
    }

    // Yellow ground floor
    for(let x=playL;x<=playR;x++){
      for(let gy=groundY;gy>=groundY-2;gy--){
        setP(x,gy,0.9,0.85,0);
      }
    }

    // Cyan platforms (chunky, patterned like original)
    const plats=[[22,playL+4,playR-4],[34,playL+8,28],[34,35,playR-6],[46,playL+2,20],[46,30,playR-2]];
    for(const pl of plats){
      const py=pl[0], x1=pl[1], x2=pl[2];
      for(let x=x1;x<=x2;x++){
        const checker=((x-x1)%4<2)?1:0;
        setP(x,py,0,checker?0.85:0.6,checker?0.85:0.6);
        setP(x,py+1,0,checker?0.6:0.4,checker?0.6:0.4);
      }
    }

    // Player auto-movement across platforms
    p.playerX+=p.dir*16*dt;
    if(p.playerX>playR-3){p.dir=-1;} else if(p.playerX<playL+3){p.dir=1;}
    if(!p.jumping&&Math.sin(p.t*2.5)>0.7){ p.jumping=true; p.jumpT=0; p.jumpFromY=p.baseY||groundY+1; }
    if(p.jumping){ p.jumpT+=dt; if(p.jumpT>0.6){ p.jumping=false; } }
    const jumpOff=p.jumping?Math.sin(p.jumpT/0.6*Math.PI)*14:0;
    // Find target platform (only switch when landing from a jump)
    if(!p.baseY) p.baseY=groundY+1;
    if(!p.jumping){
      let bestY=groundY+1;
      for(const pl of plats){
        if(p.playerX>=pl[1]&&p.playerX<=pl[2]){
          if(pl[0]+2>bestY) bestY=pl[0]+2;
        }
      }
      // Smooth transition
      p.baseY+=(bestY-p.baseY)*Math.min(1,dt*8);
      if(Math.abs(p.baseY-bestY)<0.5) p.baseY=bestY;
    }
    const playerY=Math.round(p.baseY+jumpOff);
    const px=Math.round(p.playerX);

    // Draw Willy (white figure like original)
    // Head
    setP(px,playerY+6,1,1,1); setP(px-1,playerY+6,0.9,0.9,0.9); setP(px+1,playerY+6,0.9,0.9,0.9);
    setP(px,playerY+7,1,1,1);
    // Body
    setP(px,playerY+5,1,1,1); setP(px-1,playerY+5,0.85,0.85,0.85); setP(px+1,playerY+5,0.85,0.85,0.85);
    setP(px,playerY+4,0.9,0.9,0.9); setP(px-1,playerY+4,0.8,0.8,0.8); setP(px+1,playerY+4,0.8,0.8,0.8);
    setP(px,playerY+3,0.85,0.85,0.85);
    // Legs (animated)
    const legFrame=Math.floor(p.t*8)%4;
    const lOff=legFrame<2?1:-1;
    setP(px+lOff,playerY+2,0.9,0.9,0.9);
    setP(px-lOff,playerY+2,0.9,0.9,0.9);
    setP(px+lOff,playerY+1,0.8,0.8,0.8);
    setP(px-lOff,playerY+1,0.8,0.8,0.8);
    // Hat (red)
    setP(px-1,playerY+8,0.9,0,0); setP(px,playerY+8,0.9,0,0); setP(px+1,playerY+8,0.9,0,0);

    // Collectible keys (flashing, on platforms)
    const keyPositions=[[18,plats[0][0]+3],[22,plats[0][0]+3],[26,plats[0][0]+3],[30,plats[0][0]+3],[34,plats[0][0]+3],[38,plats[0][0]+3]];
    for(let i=0;i<keyPositions.length;i++){
      const it=p.items[i%p.items.length];
      if(it&&it.collected) continue;
      const kx=keyPositions[i][0], ky=keyPositions[i][1];
      const flash=Math.floor(p.t*4+i*0.5)%2;
      const kr=flash?1:0.8, kg=flash?1:0, kb=flash?0:0.8;
      setP(kx,ky,kr,kg,kb); setP(kx+1,ky,kr,kg,kb);
      setP(kx,ky+1,kr*0.7,kg*0.7,kb*0.7); setP(kx+1,ky+1,kr*0.7,kg*0.7,kb*0.7);
      if(it&&Math.abs(px-kx)<3&&Math.abs(playerY-ky)<5) it.collected=true;
    }
    if(p.items.every(i=>i.collected)) for(const i of p.items) i.collected=false;

    // Enemies (colorful creatures patrolling on platforms)
    const enemyColors=[[0.8,0,0.8],[0,0.8,0],[0.8,0,0],[0,0.8,0.8]];
    for(let e=0;e<p.enemyX.length+2;e++){
      const eIdx=e%p.enemyX.length;
      if(e<p.enemyX.length) p.enemyX[eIdx]+=(8+e*3)*dt*(eIdx%2?1:-1);
      const eCol=enemyColors[e%4];
      const ePlat=plats[e%plats.length];
      const eMin=ePlat[1]+1, eMax=ePlat[2]-1;
      let ex=e<p.enemyX.length?p.enemyX[eIdx]:eMin+((p.t*10+e*13)%(eMax-eMin));
      if(e<p.enemyX.length){
        if(ex>eMax){p.enemyX[eIdx]=eMax; if(eIdx<p.enemyX.length) p.enemyX[eIdx]=eMin;}
        if(ex<eMin){p.enemyX[eIdx]=eMin;}
      }
      ex=Math.round(ex);
      const ey=ePlat[0]+2;
      // Creature body (like original sprites — small animated figures)
      setP(ex,ey+3,eCol[0],eCol[1],eCol[2]); // head
      setP(ex-1,ey+3,eCol[0]*0.7,eCol[1]*0.7,eCol[2]*0.7);
      setP(ex+1,ey+3,eCol[0]*0.7,eCol[1]*0.7,eCol[2]*0.7);
      setP(ex,ey+2,eCol[0]*0.9,eCol[1]*0.9,eCol[2]*0.9); // body
      setP(ex-1,ey+2,eCol[0]*0.6,eCol[1]*0.6,eCol[2]*0.6);
      setP(ex+1,ey+2,eCol[0]*0.6,eCol[1]*0.6,eCol[2]*0.6);
      // Legs (animated)
      const eLeg=Math.round(Math.sin(p.t*10+e*2));
      setP(ex+eLeg,ey+1,eCol[0]*0.8,eCol[1]*0.8,eCol[2]*0.8);
      setP(ex-eLeg,ey+1,eCol[0]*0.8,eCol[1]*0.8,eCol[2]*0.8);
    }

    // Dangling creatures from top (like original — hanging from ceiling)
    for(let d=0;d<3;d++){
      const dx=playL+10+d*16;
      const dy=S-6-Math.round(Math.abs(Math.sin(p.t*1.5+d*1.2))*10);
      const dc=enemyColors[(d+1)%4];
      setP(dx,dy,dc[0],dc[1],dc[2]);
      setP(dx,dy+1,dc[0]*0.8,dc[1]*0.8,dc[2]*0.8);
      setP(dx-1,dy,dc[0]*0.6,dc[1]*0.6,dc[2]*0.6);
      setP(dx+1,dy,dc[0]*0.6,dc[1]*0.6,dc[2]*0.6);
      // String to ceiling
      for(let sy=dy+2;sy<S-2;sy++) setP(dx,sy,0.3,0.3,0.3);
    }

    // AIR bar at bottom (red depleted, green remaining — like original)
    const airLeft=1-((p.t%15)/15);
    const barY=5, barX1=playL+2, barX2=playR-2;
    const barW=barX2-barX1;
    const greenEnd=barX1+Math.round(airLeft*barW);
    // Red (depleted) portion
    for(let x=barX1;x<greenEnd;x++) setP(x,barY,0.9,0,0);
    // Green (remaining) portion
    for(let x=greenEnd;x<=barX2;x++) setP(x,barY,0,0.9,0);
    // "AIR" label
    setP(barX1-2,barY,0,0.8,0); setP(barX1-1,barY,0,0.8,0);

    // Lives at very bottom (small cyan figures)
    for(let l=0;l<3;l++){
      const lx=playL+2+l*5;
      setP(lx,1,0,0.9,0.9); setP(lx,2,0,0.9,0.9); setP(lx,3,0,0.7,0.7);
      setP(lx-1,2,0,0.6,0.6); setP(lx+1,2,0,0.6,0.6);
    }

  } else if(game.name==='outrun'){
    const p=game;
    p.speed=0.85+0.15*Math.sin(p.t*0.3);
    p.roadOff+=p.speed*dt*40;
    p.curves=Math.sin(p.t*0.5)*0.5;
    const horizon=S*0.55;

    // Sky gradient (light blue to white at horizon, like arcade)
    for(let y=Math.floor(horizon);y<S;y++){
      const t=(y-horizon)/(S-horizon);
      const sr=0.4+0.5*t, sg=0.6+0.35*t, sb=0.85+0.1*t;
      for(let x=0;x<S;x++){const i=(y*S+x)*3;buf[i]=sr;buf[i+1]=sg;buf[i+2]=sb;}
    }

    // Clouds
    for(let c=0;c<3;c++){
      const cx=((c*22+Math.floor(p.t*2))%S);
      const cy=S-6-c*3;
      for(let dx=-4;dx<=4;dx++) for(let dy=0;dy<=1;dy++){
        const sx=cx+dx, sy=cy+dy;
        if(sx>=0&&sx<S&&sy<S) setP(sx,sy,0.95,0.95,1);
      }
    }

    // Ground with road (perspective)
    for(let y=0;y<Math.floor(horizon);y++){
      const depth=(horizon-y)/horizon;
      const roadW=6+depth*30;
      const curve=p.curves*depth*depth*35+Math.sin(p.roadOff*0.02+y*0.08)*depth*6;
      const cx=S/2+Math.round(curve);
      const stripe=((Math.floor(p.roadOff+y*2))%10)<5;

      // Grass (alternating green shades like arcade)
      const gBright=stripe?0.45:0.3;
      for(let x=0;x<S;x++){const i=(y*S+x)*3;buf[i]=0;buf[i+1]=gBright;buf[i+2]=0;}

      // Sandy shoulder/verge
      const shoulderW=Math.round(roadW*0.15);
      const rl=Math.round(cx-roadW/2), rr=Math.round(cx+roadW/2);
      for(let x=Math.max(0,rl-shoulderW);x<Math.max(0,rl);x++){
        const i=(y*S+x)*3;buf[i]=0.6;buf[i+1]=0.55;buf[i+2]=0.3;
      }
      for(let x=Math.min(S-1,rr+1);x<=Math.min(S-1,rr+shoulderW);x++){
        const i=(y*S+x)*3;buf[i]=0.6;buf[i+1]=0.55;buf[i+2]=0.3;
      }

      // Road surface (dark grey)
      for(let x=Math.max(0,rl);x<=Math.min(S-1,rr);x++){
        const i=(y*S+x)*3;buf[i]=0.3;buf[i+1]=0.3;buf[i+2]=0.3;
      }

      // White dashed center line
      if(stripe){
        const ml=Math.round(cx-1), mr=Math.round(cx+1);
        if(ml>=0&&ml<S) setP(ml,y,1,1,1);
        if(mr>=0&&mr<S) setP(mr,y,1,1,1);
      }

      // Red-white kerbs on edges
      const kerbR=stripe?0.9:1, kerbG=stripe?0.1:1, kerbB=stripe?0.1:1;
      for(let k=0;k<2;k++){
        const kx1=rl+k, kx2=rr-k;
        if(kx1>=0&&kx1<S) setP(kx1,y,kerbR,kerbG,kerbB);
        if(kx2>=0&&kx2<S) setP(kx2,y,kerbR,kerbG,kerbB);
      }
    }

    // Palm trees at roadside (like arcade OutRun)
    for(let t=0;t<6;t++){
      const treeZ=((t*13+p.roadOff*0.4)%70);
      const tz=treeZ<0?treeZ+70:treeZ;
      if(tz<3) continue;
      const tDepth=15/tz;
      const side=(t%2)?1:-1;
      const tCurve=p.curves*tDepth*tDepth*35;
      const tx=Math.round(S/2+tCurve+side*(15+tDepth*20));
      const tBaseY=Math.round(horizon-tDepth*horizon*0.8);
      if(tBaseY<2||tBaseY>=horizon) continue;
      const trunkH=Math.round(tDepth*20);
      const trunkW=Math.max(1,Math.round(tDepth*2));
      // Trunk (brown)
      for(let ty=0;ty<trunkH;ty++){
        const sy=tBaseY+ty;
        if(sy>=S) break;
        for(let tw=0;tw<trunkW;tw++){
          const sx=tx+tw-Math.floor(trunkW/2);
          if(sx>=0&&sx<S) setP(sx,sy,0.4,0.25,0.1);
        }
      }
      // Palm fronds (green, fan shape)
      const leafR=Math.max(2,Math.round(tDepth*8));
      const leafY=tBaseY+trunkH;
      for(let dy=-1;dy<=leafR;dy++) for(let dx=-leafR;dx<=leafR;dx++){
        if(Math.abs(dx)+Math.abs(dy)<=leafR+1&&dy>=0){
          const sx=tx+dx, sy=leafY+dy;
          if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0.5+dy*0.03,0.1);
        }
      }
    }

    // Red Ferrari (seen from behind, like arcade)
    const carX=Math.round(S/2+Math.sin(p.t*0.8)*8);
    const carY=6;
    // Rear body (red)
    fillRect(carX-5,carY,carX+5,carY+4,0.85,0.1,0.05);
    fillRect(carX-4,carY+4,carX+4,carY+6,0.9,0.15,0.05);
    // Windshield/cabin (dark)
    fillRect(carX-3,carY+6,carX+3,carY+8,0.15,0.15,0.2);
    // Roof
    fillRect(carX-2,carY+8,carX+2,carY+9,0.8,0.1,0.05);
    // Rear lights
    setP(carX-4,carY+1,1,0.3,0); setP(carX+4,carY+1,1,0.3,0);
    // Wheels (black)
    fillRect(carX-6,carY,carX-5,carY+2,0.1,0.1,0.1);
    fillRect(carX+5,carY,carX+6,carY+2,0.1,0.1,0.1);
    // Exhaust/shadow
    fillRect(carX-4,carY-1,carX+4,carY-1,0.1,0.1,0.1);

    // HUD at top
    // "TIME" in red
    hLine(2,8,S-3,0.9,0.2,0.1);
    // Score area
    hLine(20,40,S-3,1,1,1);
    // "STAGE 1" at bottom right
    hLine(S-14,S-4,3,0,0.8,0);

  } else if(game.name==='invaders'){
    const p=game;
    const rowCols=[[1,0,0],[0.9,0,0.9],[0,0.9,0],[0,0.9,0.9],[1,1,0]];
    const hudH=4;

    // LOSER screen
    if(p.loserT===undefined) p.loserT=0;
    if(p.loserT>0){
      p.loserT-=dt;
      for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0);
      const flash=Math.floor(p.loserT*4)%2;
      if(flash){
        const G=[[0,1,1,1,0],[1,0,0,0,0],[1,0,1,1,0],[1,0,0,1,0],[0,1,1,1,0]];
        const A=[[0,1,1,0,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]];
        const M=[[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]];
        const E=[[1,1,1,1,0],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,1,1,1,0]];
        const O=[[0,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]];
        const V=[[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0],[0,1,0,0,0]];
        const R=[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,1,0,0],[1,0,0,1,0]];
        const row1=[G,A,M,E];
        const row2=[O,V,E,R];
        for(let li=0;li<4;li++){
          const glyph=row1[li];
          const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){
              const px=S-1-(ox+col*2), py=S-1-(22+row*2);
              setP(px,py,1,0,0); setP(px-1,py,1,0,0);
              setP(px,py-1,1,0,0); setP(px-1,py-1,1,0,0);
            }
          }
        }
        for(let li=0;li<4;li++){
          const glyph=row2[li];
          const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){
              const px=S-1-(ox+col*2), py=S-1-(34+row*2);
              setP(px,py,1,0,0); setP(px-1,py,1,0,0);
              setP(px,py-1,1,0,0); setP(px-1,py-1,1,0,0);
            }
          }
        }
      }
      if(p.loserT<=0){
        for(const inv of p.invAlive) inv.alive=true;
        p.invY=32; p.invX=5; p.shieldDmg=new Set(); p.lives=3; p.wave=0;
      }
      return;
    }

    // Move invaders (faster each wave)
    if(p.wave===undefined) p.wave=0;
    const invSpeed=8+p.wave*3;
    p.invX+=p.invDir*invSpeed*dt;
    if(p.invX>S-42||p.invX<2){ p.invDir*=-1; p.invY-=1.5; }
    let lowestAliveRow=99;
    for(const inv of p.invAlive){ if(inv.alive && inv.r<lowestAliveRow) lowestAliveRow=inv.r; }
    if(lowestAliveRow<99 && p.invY+lowestAliveRow*6<=17){
      p.lives--;
      if(p.lives<=0){
        p.loserT=3;
      } else {
        for(const inv of p.invAlive) inv.alive=true;
        p.invY=32; p.invX=5; p.shieldDmg=new Set();
      }
    }

    // Draw invaders with distinct shapes per row type
    const frame=Math.floor(p.t*3)%2;
    for(const inv of p.invAlive){
      if(!inv.alive) continue;
      const ix=Math.round(p.invX+inv.c*5);
      const iy=Math.round(p.invY+inv.r*6);
      if(ix<0||ix>=S||iy<hudH||iy>=S-12) continue;
      const rc=rowCols[inv.r%5];
      const r=rc[0],g=rc[1],b=rc[2];
      if(inv.r===4){
        // Top row (yellow): squid shape — narrow body, tentacles
        setP(ix,iy+3,r,g,b); setP(ix,iy+2,r,g,b); setP(ix,iy+1,r,g,b);
        setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        if(frame){ setP(ix-1,iy,r,g,b); setP(ix+1,iy,r,g,b); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); }
      } else if(inv.r===3||inv.r===2){
        // Middle rows (cyan/green): crab shape — wider with claws
        setP(ix,iy+3,r,g,b); setP(ix-1,iy+3,r,g,b); setP(ix+1,iy+3,r,g,b);
        setP(ix,iy+2,r,g,b); setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        setP(ix-2,iy+2,r,g,b); setP(ix+2,iy+2,r,g,b);
        setP(ix,iy+1,r,g,b);
        if(frame){ setP(ix-2,iy+3,r,g,b); setP(ix+2,iy+3,r,g,b); setP(ix-1,iy,r,g,b); setP(ix+1,iy,r,g,b); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); setP(ix-1,iy+4,r*0.7,g*0.7,b*0.7); setP(ix+1,iy+4,r*0.7,g*0.7,b*0.7); }
      } else {
        // Bottom rows (magenta/red): octopus — round with dangling legs
        setP(ix,iy+3,r,g,b); setP(ix-1,iy+3,r,g,b); setP(ix+1,iy+3,r,g,b);
        setP(ix,iy+2,r,g,b); setP(ix-1,iy+2,r,g,b); setP(ix+1,iy+2,r,g,b);
        setP(ix-2,iy+3,r*0.8,g*0.8,b*0.8); setP(ix+2,iy+3,r*0.8,g*0.8,b*0.8);
        if(frame){ setP(ix-1,iy+1,r,g,b); setP(ix+1,iy+1,r,g,b); setP(ix-2,iy,r*0.6,g*0.6,b*0.6); setP(ix+2,iy,r*0.6,g*0.6,b*0.6); }
        else { setP(ix-2,iy+1,r,g,b); setP(ix+2,iy+1,r,g,b); setP(ix-1,iy,r*0.6,g*0.6,b*0.6); setP(ix+1,iy,r*0.6,g*0.6,b*0.6); }
      }
    }

    // Player cannon — targets lowest alive invader to eliminate
    if(!p.explodeT) p.explodeT=0;
    if(!p.respawnT) p.respawnT=0;
    if(p.lives===undefined) p.lives=3;
    if(p.explodeT>0){
      // Explosion animation
      p.explodeT-=dt;
      const ex=Math.round(p.playerX), ey=8;
      const eRad=Math.round((0.5-p.explodeT)*12);
      for(let dy=-eRad;dy<=eRad;dy++) for(let dx=-eRad;dx<=eRad;dx++){
        if(dx*dx+dy*dy<=eRad*eRad){
          const px2=ex+dx, py2=ey+dy;
          if(px2>=0&&px2<S&&py2>=0&&py2<S){
            const flicker=Math.random();
            setP(px2,py2,1,flicker*0.7,0);
          }
        }
      }
      if(p.explodeT<=0) p.respawnT=1.0;
    } else if(p.respawnT>0){
      p.respawnT-=dt;
      // Flashing respawn
      if(Math.floor(p.respawnT*8)%2){
        const cannonX=Math.round(p.playerX);
        fillRect(cannonX-3,6,cannonX+3,8,0.5,0.5,0.5);
        fillRect(cannonX-1,8,cannonX+1,9,0.5,0.5,0.5);
        setP(cannonX,10,0.5,0.5,0.5);
      }
    } else {
      // Find lowest alive invader to aim at
      let targetInv=null, lowestY=999;
      for(const inv of p.invAlive){
        if(!inv.alive) continue;
        const iy=p.invY+inv.r*6;
        if(iy<lowestY){ lowestY=iy; targetInv=inv; }
      }
      let targetX=targetInv?p.invX+targetInv.c*5:32;
      // Dodge incoming bombs — scan all, pick most urgent
      let dodging=false;
      let urgentBomb=null, urgentScore=999;
      for(const bm of p.bombs){
        if(bm.y<20&&Math.abs(bm.x-p.playerX)<8){
          const score=bm.y+Math.abs(bm.x-p.playerX)*0.5;
          if(score<urgentScore){ urgentScore=score; urgentBomb=bm; }
        }
      }
      if(urgentBomb){
        dodging=true;
        const dodgeDist=12;
        if(urgentBomb.x<=p.playerX) targetX=Math.min(S-5,urgentBomb.x+dodgeDist);
        else targetX=Math.max(4,urgentBomb.x-dodgeDist);
      }
      const cannonSpeed=24*dt;
      const cannonDx=targetX-p.playerX;
      p.playerX+=Math.sign(cannonDx)*Math.min(Math.abs(cannonDx),cannonSpeed);
      p.playerX=Math.max(4,Math.min(S-5,p.playerX));
      const cannonX=Math.round(p.playerX);
      fillRect(cannonX-3,6,cannonX+3,8,1,1,1);
      fillRect(cannonX-1,8,cannonX+1,9,1,1,1);
      setP(cannonX,10,1,1,1);

      // Fire when lined up with a target (cooldown between shots)
      if(!p.fireCD) p.fireCD=0;
      p.fireCD-=dt;
      if(p.fireCD<=0&&p.bullets.length<2){
        if(targetInv&&Math.abs(p.playerX-(p.invX+targetInv.c*5))<2){
          p.bullets.push({x:cannonX,y:11});
          p.fireCD=0.4;
        } else if(Math.sin(p.t*3)>0.97){
          p.bullets.push({x:cannonX,y:11});
          p.fireCD=0.5;
        }
      }
    }

    // Player bullets
    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].y+=55*dt;
      const pb=p.bullets[i];
      if(pb.y>S){ p.bullets.splice(i,1); continue; }
      const pbx=Math.round(pb.x), pby=Math.round(pb.y);
      setP(pbx,pby,1,1,1);
      setP(pbx,pby+1,1,1,1);
      // Bullet hits shield — creates small hole and continues or stops
      let hitShield=false;
      for(let s=0;s<4;s++){
        const sx=4+s*15;
        if(pbx>=sx&&pbx<=sx+8&&pby>=12&&pby<=17){
          if(!p.shieldDmg.has(pbx+','+pby)){
            p.shieldDmg.add(pbx+','+pby);
            p.shieldDmg.add((pbx-1)+','+pby);
            p.shieldDmg.add((pbx+1)+','+pby);
            p.bullets.splice(i,1); hitShield=true; break;
          }
        }
      }
      if(hitShield) continue;
      for(const inv of p.invAlive){
        if(!inv.alive) continue;
        const ix2=p.invX+inv.c*5, iy2=p.invY+inv.r*6;
        if(Math.abs(pb.x-ix2)<3&&Math.abs(pb.y-iy2)<3){ inv.alive=false; p.bullets.splice(i,1); break; }
      }
    }
    if(p.bullets.length>3) p.bullets.length=3;

    // Enemy bombs
    if(Math.sin(p.t*2.5)>0.85&&p.bombs.length<3){
      const alive=p.invAlive.filter(i=>i.alive);
      if(alive.length>0){
        const shooter=alive[Math.floor(Math.random()*alive.length)];
        p.bombs.push({x:p.invX+shooter.c*5,y:p.invY+shooter.r*6});
      }
    }
    for(let i=p.bombs.length-1;i>=0;i--){
      p.bombs[i].y-=30*dt;
      const bm=p.bombs[i];
      if(bm.y<0){ p.bombs.splice(i,1); continue; }
      const bx=Math.round(bm.x), by=Math.round(bm.y);
      setP(bx,by,1,1,0); setP(bx,by-1,1,0.8,0);
      // Bomb hits shield
      for(let s=0;s<4;s++){
        const sx=4+s*15;
        if(bx>=sx&&bx<=sx+8&&by>=12&&by<=17){
          p.shieldDmg.add(bx+','+by); p.shieldDmg.add(bx+','+(by+1)); p.shieldDmg.add((bx-1)+','+by); p.shieldDmg.add((bx+1)+','+by);
          p.bombs.splice(i,1); break;
        }
      }
      if(bm.y>=6&&bm.y<=10&&Math.abs(bm.x-p.playerX)<4&&p.explodeT<=0&&p.respawnT<=0){
        p.explodeT=0.5;
        p.lives--;
        if(p.lives<=0){
          p.loserT=3;
        }
        p.bombs.splice(i,1);
      }
    }
    if(p.bombs.length>4) p.bombs.length=4;

    // Reset invaders when all dead — next wave faster
    if(p.invAlive.every(i=>!i.alive)){
      for(const i of p.invAlive) i.alive=true;
      p.invY=32; p.invX=5; p.shieldDmg=new Set();
      p.wave++;
    }

    // 4 cyan shields with damage holes
    const shieldW=8, shieldH=5;
    for(let s=0;s<4;s++){
      const sx2=4+s*15;
      for(let sy=12;sy<=12+shieldH;sy++) for(let sxx=sx2;sxx<=sx2+shieldW;sxx++){
        if(sy<=13&&sxx>=sx2+3&&sxx<=sx2+5) continue;
        if(!p.shieldDmg.has(sxx+','+sy)) setP(sxx,sy,0,0.9,0.9);
      }
    }

    // Ground line
    hLine(0,S-1,4,0,0.8,0);

    // HUD at top
    hLine(2,20,S-2,0,0.8,0.8);
    for(let l=0;l<p.lives;l++){
      setP(28+l*4,S-2,0,0.8,0); setP(28+l*4,S-3,0,0.8,0); setP(27+l*4,S-2,0,0.6,0); setP(29+l*4,S-2,0,0.6,0);
    }

  } else if(game.name==='jsw'){
    const p=game;
    p.roomT+=dt;
    if(p.roomT>10){ p.room=(p.room+1)%4; p.roomT=0; p.playerX=10; p.playerY=14; }
    const borderW=3;
    const playL=borderW, playR=S-1-borderW;
    const groundY=12;

    // Blue border (thick, like original)
    for(let y=0;y<S;y++){
      for(let x=0;x<borderW;x++){
        const pat=((x+y)%2===0)?0.7:0.4;
        setP(x,y,0,0,pat); setP(S-1-x,y,0,0,pat);
      }
    }
    for(let x=0;x<S;x++){
      setP(x,S-1,0,0,0.6); setP(x,S-2,0,0,0.5);
      setP(x,0,0,0,0.6); setP(x,1,0,0,0.5);
    }

    // Room colours (magenta/red walls like original)
    const roomWallCol=p.room===0?[0.8,0,0.5]:p.room===1?[0.7,0,0]:p.room===2?[0,0.6,0]:[0.7,0.7,0];
    const rw=roomWallCol;

    // Magenta/red walls on right side (like screenshot shows thick wall)
    if(p.room===0||p.room===1){
      for(let y=groundY+1;y<S-2;y++){
        for(let x=playR-4;x<=playR;x++){
          const checker=((x+y)%2===0)?1:0.6;
          setP(x,y,rw[0]*checker,rw[1]*checker,rw[2]*checker);
        }
      }
    }

    // Yellow ground/floor with pattern
    for(let x=playL;x<=playR;x++){
      setP(x,groundY,0.85,0.85,0); setP(x,groundY-1,0.7,0.7,0);
    }

    // Platforms (yellow, like original)
    const plats=p.room===0?[[24,playL,playL+18],[24,playL+22,playR-8],[38,playL+10,playR-10],[50,playL,playL+15],[50,playR-12,playR]]:
                p.room===1?[[20,playL,playL+20],[32,playL+15,playR-5],[44,playL+5,playR-15],[52,playL,playR]]:
                p.room===2?[[22,playL+5,playL+25],[34,playL+20,playR-5],[46,playL,playL+18],[46,playR-15,playR]]:
                           [[20,playL+10,playR-10],[34,playL,playL+16],[34,playR-16,playR],[48,playL+5,playR-5]];
    for(const pl of plats){
      for(let x=pl[1];x<=pl[2];x++){
        setP(x,pl[0],0.85,0.85,0); setP(x,pl[0]-1,0.6,0.6,0);
      }
    }

    // Stairs (diagonal lines of pixels, like original)
    if(p.room===0){
      for(let s=0;s<10;s++){
        const sx=playR-10+s, sy=groundY+1+s;
        if(sx<S&&sy<S-2) setP(sx,sy,0.7,0.7,0.7);
      }
    }
    if(p.room<3){
      for(let s=0;s<8;s++){
        const sx=playL+2+s, sy=plats[0][0]+1+s;
        if(sx<S&&sy<S-2) setP(sx,sy,0.7,0.7,0.7);
      }
    }

    // Willy auto-play
    p.playerX+=p.dir*12*dt;
    if(p.playerX>playR-4){p.dir=-1;} else if(p.playerX<playL+2){p.dir=1;}
    if(!p.jumping&&Math.sin(p.t*2.2)>0.75){ p.jumping=true; p.jumpT=0; }
    if(p.jumping){ p.jumpT+=dt; if(p.jumpT>0.55) p.jumping=false; }
    const jumpH=p.jumping?Math.sin(p.jumpT/0.55*Math.PI)*14:0;
    if(!p.baseY) p.baseY=groundY+1;
    if(!p.jumping){
      let bestY=groundY+1;
      for(const pl of plats){
        if(p.playerX>=pl[1]&&p.playerX<=pl[2]){
          if(pl[0]+1>bestY) bestY=pl[0]+1;
        }
      }
      p.baseY+=(bestY-p.baseY)*Math.min(1,dt*8);
      if(Math.abs(p.baseY-bestY)<0.5) p.baseY=bestY;
    }
    p.playerY=Math.round(p.baseY+jumpH);
    const px=Math.round(p.playerX), py=p.playerY;

    // Willy sprite (cyan body like original screenshot)
    setP(px,py+6,0,0.8,0.8); // head
    setP(px-1,py+5,0,0.7,0.7); setP(px,py+5,0,0.9,0.9); setP(px+1,py+5,0,0.7,0.7); // body
    setP(px-1,py+4,0,0.8,0.8); setP(px,py+4,0,0.9,0.9); setP(px+1,py+4,0,0.8,0.8);
    setP(px,py+3,0,0.7,0.7);
    // Legs
    const legF=Math.floor(p.t*8)%4;
    setP(px-(legF<2?1:-1),py+2,0,0.7,0.7);
    setP(px+(legF<2?1:-1),py+2,0,0.7,0.7);
    setP(px-(legF<2?1:-1),py+1,0,0.6,0.6);

    // Enemies — red blob (like guardian in screenshot), others patrolling
    const enemyDefs=[
      {plat:0,col:[0.8,0,0],size:3},
      {plat:1,col:[0,0.8,0],size:2},
      {plat:2,col:[0.8,0,0.8],size:2}
    ];
    for(let e=0;e<enemyDefs.length;e++){
      const ed=enemyDefs[e];
      const ePlat=plats[ed.plat%plats.length];
      const ex=Math.round((ePlat[1]+ePlat[2])/2+Math.sin(p.t*1.5+e*2)*((ePlat[2]-ePlat[1])*0.3));
      const ey=ePlat[0]+1;
      const ec=ed.col;
      // Guardian body
      for(let dy=0;dy<ed.size+2;dy++) for(let dx=-ed.size+1;dx<ed.size;dx++){
        const sx=ex+dx, sy=ey+dy;
        if(sx>=playL&&sx<=playR&&sy>=2&&sy<S-2){
          const bright=0.7+0.3*((dx+dy)%2);
          setP(sx,sy,ec[0]*bright,ec[1]*bright,ec[2]*bright);
        }
      }
    }

    // Flashing collectible items
    for(let i=0;i<5;i++){
      const iPlat=plats[i%plats.length];
      const ix=iPlat[1]+3+i*4, iy=iPlat[0]+2;
      if(ix>playR-2) continue;
      const flash=Math.floor(p.t*4+i)%2;
      if(flash){
        setP(ix,iy,1,1,0); setP(ix+1,iy,1,1,0);
        setP(ix,iy+1,1,0.8,0); setP(ix+1,iy+1,1,0.8,0);
      }
    }

    // Room name bar at bottom (like "Top Landing" in screenshot)
    for(let x=playL;x<=playR;x++) setP(x,7,0.15,0.15,0.15);

    // HUD: "Items collected" and "Time" text area
    for(let x=playL;x<=playR;x++){
      setP(x,4,0,0.6,0); // green text line
    }

    // Lives at bottom (small coloured figures)
    for(let l=0;l<3;l++){
      const lx=playL+2+l*5, ly=3;
      setP(lx,ly+2,0,0.8,0); setP(lx,ly+1,0,0.7,0); setP(lx,ly,0,0.6,0);
      setP(lx-1,ly+1,0,0.5,0); setP(lx+1,ly+1,0,0.5,0);
      setP(lx,ly+3,0.8,0,0); // hat
    }

  } else if(game.name==='deathchase'){
    // 3D Deathchase — first-person motorcycle through forest
    const p=game;
    p.speed=0.9+0.1*Math.sin(p.t*0.4);
    p.treeOff-=p.speed*dt*50;
    p.leanDir=Math.sin(p.t*0.7)*0.8;
    p.bikeX=32+Math.round(p.leanDir*12);
    const H=S/2;

    // Blue sky (top half, y=0..H-1)
    for(let y=0;y<H;y++){
      const t=y/H;
      for(let x=0;x<S;x++) setP(x,y,0.1*t,0.3*t,0.85-0.3*t);
    }

    // Green ground (bottom half, y=H..S-1)
    for(let y=H;y<S;y++){
      const depth=(y-H)/(S-H);
      const scrollLine=Math.floor(p.treeOff+y*3)%8;
      const g=depth>0.1?(scrollLine<4?0.35:0.25):0.15;
      for(let x=0;x<S;x++) setP(x,y,0,g,0);
    }

    // Horizon line
    hLine(0,S-1,H,0,0.45,0);

    // Trees — travel towards bike (appear small at horizon, grow bigger)
    for(let t=0;t<12;t++){
      const treeZ=((t*17+p.treeOff*0.3)%80);
      const tz=treeZ<0?treeZ+80:treeZ;
      if(tz<2) continue;
      const perspective=20/tz;
      const treeBaseX=(t%2===0?-1:1)*(15+((t*7)%20));
      const screenX=Math.round(S/2+treeBaseX*perspective-p.leanDir*perspective*8);
      const baseY=Math.round(H+perspective*2);
      const treeH=Math.round(perspective*25);
      const trunkW=Math.max(1,Math.round(perspective*3));

      if(screenX<-5||screenX>S+5) continue;

      for(let ty=0;ty<treeH;ty++){
        const sy=baseY-ty;
        if(sy<0||sy>=S) continue;
        for(let tw=0;tw<trunkW;tw++){
          const sx=screenX-Math.floor(trunkW/2)+tw;
          if(sx>=0&&sx<S) setP(sx,sy,0.35,0.15,0);
        }
      }
      const canopyR=Math.max(2,Math.round(perspective*6));
      const canopyY=baseY-treeH;
      for(let dy=-canopyR;dy<=canopyR;dy++) for(let dx=-canopyR;dx<=canopyR;dx++){
        if(dx*dx+dy*dy<=canopyR*canopyR){
          const sx=screenX+dx, sy=canopyY+dy;
          if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0,0.5-dy*0.03,0);
        }
      }
    }

    // Enemy bike (ahead, weaving) — smaller and darker, further away
    const enemyZ=25+Math.sin(p.t*0.6)*8;
    const ePerspective=12/enemyZ;
    const eScreenX=Math.round(S/2+Math.sin(p.t*1.3)*10*ePerspective);
    const eScreenY=Math.round(H+ePerspective*2);
    const eH=Math.max(4,Math.round(ePerspective*14));
    const eW=Math.max(2,Math.round(ePerspective*4));
    const wheelR=Math.max(1,Math.round(ePerspective*2));
    // Rear wheel
    for(let dy=-wheelR;dy<=wheelR;dy++) for(let dx=-wheelR;dx<=wheelR;dx++){
      if(dx*dx+dy*dy<=wheelR*wheelR){
        const sx=eScreenX-eW+dx, sy=eScreenY+dy;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0.12,0.12,0.12);
      }
    }
    // Front wheel
    for(let dy=-wheelR;dy<=wheelR;dy++) for(let dx=-wheelR;dx<=wheelR;dx++){
      if(dx*dx+dy*dy<=wheelR*wheelR){
        const sx=eScreenX+eW+dx, sy=eScreenY+dy;
        if(sx>=0&&sx<S&&sy>=0&&sy<S) setP(sx,sy,0.12,0.12,0.12);
      }
    }
    // Wheel spokes
    setP(eScreenX-eW,eScreenY,0.3,0.3,0.3);
    setP(eScreenX+eW,eScreenY,0.3,0.3,0.3);
    // Frame/chassis (very dark)
    for(let fx=eScreenX-eW;fx<=eScreenX+eW;fx++){
      if(fx>=0&&fx<S){ setP(fx,eScreenY-1,0.2,0.05,0.05); setP(fx,eScreenY-2,0.15,0.04,0.04); }
    }
    // Engine block
    const engW=Math.max(1,Math.round(eW*0.4));
    fillRect(eScreenX-engW,eScreenY-2,eScreenX+engW,eScreenY-1,0.15,0.15,0.18);
    // Exhaust pipe
    if(eScreenX+eW+1<S) setP(eScreenX+eW+1,eScreenY-1,0.3,0.15,0.02);
    // Rider legs (dark)
    const legH=Math.max(1,Math.round(eH*0.2));
    for(let dy=0;dy<legH;dy++){
      const sy=eScreenY-3-dy;
      if(sy>=0&&sy<S){
        setP(eScreenX-1,sy,0.05,0.05,0.2);
        setP(eScreenX+1,sy,0.05,0.05,0.2);
      }
    }
    // Rider torso (dark green)
    const torsoH=Math.max(1,Math.round(eH*0.3));
    const torsoBase=eScreenY-3-legH;
    for(let dy=0;dy<torsoH;dy++){
      const sy=torsoBase-dy;
      if(sy<0||sy>=S) continue;
      const tw=Math.max(1,Math.round(eW*0.4));
      for(let dx=-tw;dx<=tw;dx++){
        const sx=eScreenX+dx;
        if(sx>=0&&sx<S) setP(sx,sy,0.05,0.3,0.05);
      }
    }
    // Arms
    const armY=torsoBase-Math.round(torsoH*0.3);
    if(armY>=0&&armY<S){
      for(let ax=1;ax<=Math.max(1,Math.round(eW*0.5));ax++){
        const sx1=eScreenX-ax, sx2=eScreenX+ax;
        if(sx1>=0) setP(sx1,armY,0.05,0.25,0.05);
        if(sx2<S) setP(sx2,armY,0.05,0.25,0.05);
      }
    }
    // Rider head (dark helmet)
    const headY=torsoBase-torsoH;
    if(headY>=1&&headY<S){
      setP(eScreenX,headY,0.4,0.05,0.05);
      if(eScreenX-1>=0) setP(eScreenX-1,headY,0.3,0.03,0.03);
      if(eScreenX+1<S) setP(eScreenX+1,headY,0.3,0.03,0.03);
      setP(eScreenX,headY-1,0.4,0.05,0.05);
    }
    // Handlebars
    const hbY=eScreenY-3;
    if(hbY>=0&&hbY<S){
      setP(eScreenX-eW+1,hbY,0.25,0.25,0.25);
      setP(eScreenX+eW-1,hbY,0.25,0.25,0.25);
    }

    // Fire bullet occasionally from player bike
    p.fireT-=dt;
    if(p.fireT<=0){
      p.fireT=1.5+Math.random()*2;
      p.bullets.push({x:p.bikeX,y:S-10,alive:true});
    }
    // Update and draw bullets
    for(let i=p.bullets.length-1;i>=0;i--){
      const b=p.bullets[i];
      b.y-=60*dt;
      if(b.y<H){ p.bullets.splice(i,1); continue; }
      const bx=Math.round(b.x), by=Math.round(b.y);
      setP(bx,by,1,1,0);
      setP(bx,by+1,1,0.6,0);
    }
    if(p.bullets.length>4) p.bullets.length=4;

    // Player bike (bottom centre)
    const bx=p.bikeX;
    const by=S-6;
    hLine(bx-5,bx+5,by,WHT[0],WHT[1],WHT[2]);
    hLine(bx-5,bx+5,by+1,WHT[0]*0.6,WHT[1]*0.6,WHT[2]*0.6);
    setP(bx-4,by-1,WHT[0]*0.7,WHT[1]*0.7,WHT[2]*0.7); setP(bx+4,by-1,WHT[0]*0.7,WHT[1]*0.7,WHT[2]*0.7);
    setP(bx-3,by-2,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5); setP(bx+3,by-2,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    fillRect(bx-2,by-4,bx+2,by-2,WHT[0]*0.4,WHT[1]*0.4,WHT[2]*0.4);
    setP(bx,by-3,WHT[0],WHT[1],WHT[2]);
    // Crosshair at horizon
    setP(bx,H,WHT[0],WHT[1],WHT[2]);
    setP(bx-1,H,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx+1,H,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx,H-1,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);
    setP(bx,H+1,WHT[0]*0.5,WHT[1]*0.5,WHT[2]*0.5);

    // HUD at very bottom
    hLine(0,S-1,S-1,0,0,0);
    hLine(0,S-1,S-2,0,0,0);
    const speedBar=Math.round(p.speed*20);
    hLine(2,2+speedBar,S-1,GRN[0],GRN[1],GRN[2]);

    // Rotate 180 degrees
    for(let y=0;y<Math.floor(S/2);y++){
      const y2=S-1-y;
      for(let x=0;x<S;x++){
        const i1=(y*S+x)*3, i2=(y2*S+(S-1-x))*3;
        const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
        buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
        buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
      }
    }

  } else if(game.name==='rtype'){
    const p=game;
    if(p.lives===undefined) p.lives=3;
    if(!p.turrets) p.turrets=[];
    if(!p.tBullets) p.tBullets=[];
    if(!p.explodeT) p.explodeT=0;
    if(!p.respawnT) p.respawnT=0;
    if(!p.loserT) p.loserT=0;
    if(!p.turretSpawnT) p.turretSpawnT=2;

    // GAME OVER screen
    if(p.loserT>0){
      p.loserT-=dt;
      for(let y=0;y<S;y++) for(let x=0;x<S;x++) setP(x,y,0,0,0);
      const flash=Math.floor(p.loserT*4)%2;
      if(flash){
        const G=[[0,1,1,1,0],[1,0,0,0,0],[1,0,1,1,0],[1,0,0,1,0],[0,1,1,1,0]];
        const A=[[0,1,1,0,0],[1,0,0,1,0],[1,1,1,1,0],[1,0,0,1,0],[1,0,0,1,0]];
        const M=[[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1]];
        const E=[[1,1,1,1,0],[1,0,0,0,0],[1,1,1,0,0],[1,0,0,0,0],[1,1,1,1,0]];
        const O=[[0,1,1,0,0],[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]];
        const V=[[1,0,0,1,0],[1,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0],[0,1,0,0,0]];
        const R=[[1,1,1,0,0],[1,0,0,1,0],[1,1,1,0,0],[1,0,1,0,0],[1,0,0,1,0]];
        const row1=[G,A,M,E], row2=[O,V,E,R];
        for(let li=0;li<4;li++){
          const glyph=row1[li]; const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){ const px=S-1-(ox+col*2),py=S-1-(22+row*2); setP(px,py,1,0,0);setP(px-1,py,1,0,0);setP(px,py-1,1,0,0);setP(px-1,py-1,1,0,0); }
          }
        }
        for(let li=0;li<4;li++){
          const glyph=row2[li]; const ox=5+li*14;
          for(let row=0;row<5;row++) for(let col=0;col<5;col++){
            if(glyph[row][col]){ const px=S-1-(ox+col*2),py=S-1-(34+row*2); setP(px,py,1,0,0);setP(px-1,py,1,0,0);setP(px,py-1,1,0,0);setP(px-1,py-1,1,0,0); }
          }
        }
      }
      if(p.loserT<=0){
        p.lives=3; p.turrets=[]; p.tBullets=[]; p.eBullets=[];
        for(const e of p.enemies){ e.alive=true; e.x=-Math.random()*20; e.y=15+Math.random()*35; e.fireT=2+Math.random()*3; }
      }
      return;
    }

    p.scrollX+=dt*18;
    if(!p.dodgeTarget) p.dodgeTarget=32;
    if(!p.dodgeTimer) p.dodgeTimer=0;
    p.dodgeTimer-=dt;
    // Find nearest threat approaching the ship (enemies + bullets)
    let nearestThreatY=null, nearestDist=999;
    for(const e of p.enemies){
      if(!e.alive) continue;
      const dx=e.x-p.shipX;
      if(dx>-20&&dx<15){
        const dist=Math.abs(dx)+Math.abs(e.y-p.shipY)*0.5;
        if(dist<nearestDist){ nearestDist=dist; nearestThreatY=e.y; }
      }
    }
    const allBullets=(p.eBullets||[]).concat(p.tBullets||[]);
    for(const b of allBullets){
      if(Math.abs(b.x-p.shipX)<25&&Math.abs(b.y-p.shipY)<18){
        const dist=Math.abs(b.x-p.shipX)*0.5+Math.abs(b.y-p.shipY);
        if(dist<nearestDist){ nearestDist=dist; nearestThreatY=b.y; }
      }
    }
    // Always dodge immediately when bullet is close
    if(nearestThreatY!==null&&nearestDist<20){
      const dodge=22+Math.random()*10;
      p.dodgeTarget=nearestThreatY>p.shipY?p.shipY-dodge:p.shipY+dodge;
      p.dodgeTarget=Math.max(14,Math.min(S-10,p.dodgeTarget));
      p.dodgeTimer=0.15;
    } else if(p.dodgeTimer<=0){
      if(nearestThreatY!==null){
        const dodge=20+Math.random()*10;
        p.dodgeTarget=nearestThreatY>p.shipY?p.shipY-dodge:p.shipY+dodge;
        p.dodgeTarget=Math.max(14,Math.min(S-10,p.dodgeTarget));
      } else {
        p.dodgeTarget=14+Math.random()*38;
      }
      p.dodgeTimer=0.3+Math.random()*0.4;
    }
    const shipSpeed=55*dt;
    const shipDy=p.dodgeTarget-p.shipY;
    p.shipY+=Math.sign(shipDy)*Math.min(Math.abs(shipDy),shipSpeed);
    p.shipY=Math.max(14,Math.min(S-10,p.shipY));
    if(!p.shipXTarget) p.shipXTarget=S-10;
    if(!p.shipXTimer) p.shipXTimer=0;
    p.shipXTimer-=dt;
    if(p.shipXTimer<=0){
      if(Math.random()<0.3) p.shipXTarget=S-18-Math.random()*10;
      else p.shipXTarget=S-10+Math.random()*4;
      p.shipXTimer=1.5+Math.random()*2.5;
    }
    const shipXSpeed=20*dt;
    const shipDx=p.shipXTarget-p.shipX;
    p.shipX+=Math.sign(shipDx)*Math.min(Math.abs(shipDx),shipXSpeed);
    const terrainH=10;
    const hudH=6;

    // Scrolling stars (different speeds for parallax)
    for(let i=0;i<50;i++){
      const speed=1+((i*7)%3);
      const sx=(((i*17+Math.floor(p.scrollX*speed*0.3))%S)+S)%S;
      const sy=hudH+((i*41+7)%(S-hudH-terrainH));
      const br=0.15+((i*3)%4)*0.08;
      setP(sx,sy,br,br,br);
    }

    // Ground terrain (grey/brown rocky, scrolling)
    for(let x=0;x<S;x++){
      const wx=x-Math.floor(p.scrollX);
      const h=terrainH+Math.round(Math.sin(wx*0.12)*2+Math.sin(wx*0.25)*1.5);
      for(let y=0;y<h;y++){
        const shade=0.25+((wx+y*3)%5)*0.04;
        setP(x,y,shade,shade*0.9,shade*0.7);
      }
      if(((wx)%4)<2) setP(x,h,0.4,0.35,0.25);
    }

    // Turrets on ground (scroll right-to-left on display = increase in buffer)
    p.turretSpawnT-=dt;
    if(p.turretSpawnT<=0&&p.turrets.length<2){
      p.turrets.push({sx:-5, fireT:1+Math.random()*2});
      p.turretSpawnT=8+Math.random()*6;
    }
    for(let i=p.turrets.length-1;i>=0;i--){
      const tr=p.turrets[i];
      tr.sx+=18*dt;
      if(tr.sx>S+5){ p.turrets.splice(i,1); continue; }
      const tsx=Math.round(tr.sx);
      const twx=tsx-Math.floor(p.scrollX);
      const th=terrainH+Math.round(Math.sin(twx*0.12)*2+Math.sin(twx*0.25)*1.5);
      // Draw turret (short green cannon on ground)
      setP(tsx-1,th,0,0.5,0); setP(tsx,th,0,0.7,0); setP(tsx+1,th,0,0.5,0);
      setP(tsx,th+1,0,1,0); setP(tsx,th+2,0.5,1,0);
      tr.fireT-=dt;
      if(tr.fireT<=0){
        const dx=p.shipX-tsx, dy=p.shipY-(th+2);
        p.tBullets.push({x:tsx,y:th+2,dx:dx,dy:dy});
        tr.fireT=3+Math.random()*3;
      }
    }
    // Update turret bullets
    for(let i=p.tBullets.length-1;i>=0;i--){
      const tb=p.tBullets[i];
      const spd=18*dt;
      const dist=Math.sqrt(tb.dx*tb.dx+tb.dy*tb.dy);
      if(dist>0){ tb.x+=tb.dx/dist*spd; tb.y+=tb.dy/dist*spd; }
      if(tb.x<0||tb.x>=S||tb.y<0||tb.y>=S){ p.tBullets.splice(i,1); continue; }
      const tbx=Math.round(tb.x),tby=Math.round(tb.y);
      setP(tbx,tby,0,1,0); setP(tbx,tby-1,0,0.7,0);
    }

    // Explosion/respawn state
    if(p.explodeT>0){
      p.explodeT-=dt;
      const ex=Math.round(p.shipX),ey=Math.round(p.shipY);
      const eRad=Math.round((0.5-p.explodeT)*12);
      for(let dy=-eRad;dy<=eRad;dy++) for(let dx=-eRad;dx<=eRad;dx++){
        if(dx*dx+dy*dy<=eRad*eRad){ const px2=ex+dx,py2=ey+dy; if(px2>=0&&px2<S&&py2>=0&&py2<S) setP(px2,py2,1,Math.random()*0.7,0); }
      }
      if(p.explodeT<=0) p.respawnT=2.0;
    } else if(p.respawnT>0){
      p.respawnT-=dt;
    }

    // Player ship (white/cyan R-9 — facing left so it appears right on display)
    const sx=Math.round(p.shipX), sy=Math.round(p.shipY);
    if(p.explodeT<=0&&p.respawnT<=0){
    // Main fuselage
    for(let dx=0;dx<6;dx++) setP(sx-dx,sy,1,1,1);
    setP(sx-6,sy,0,1,1); // nose cyan
    setP(sx-1,sy-1,1,1,1); setP(sx-2,sy-1,1,1,1); setP(sx-3,sy-1,0,1,1);
    setP(sx-1,sy+1,1,1,1); setP(sx-2,sy+1,1,1,1); setP(sx-3,sy+1,0,1,1);
    // Tail fin
    setP(sx,sy-2,0,1,1); setP(sx,sy+2,0,1,1);
    // Engine exhaust
    const ef=Math.sin(p.t*25)>0?1:0.5;
    setP(sx+1,sy,1*ef,0.5*ef,0); setP(sx+2,sy,1*ef,0.3*ef,0);
    } else if(p.respawnT>0&&Math.floor(p.respawnT*8)%2){
    for(let dx=0;dx<6;dx++) setP(sx-dx,sy,0.5,0.5,0.5);
    }

    // Beam weapon (long cyan beam extending from ship nose to the left)
    if(p.chargeT>0){
      p.chargeT-=dt;
      const beamLen=Math.min(sx-6,40);
      for(let bx=0;bx<beamLen;bx++){
        const bpx=sx-7-bx;
        if(bpx<0) break;
        setP(bpx,sy,0,1,1);
        if(bx<beamLen*0.7){ setP(bpx,sy-1,0,0.5,0.5); setP(bpx,sy+1,0,0.5,0.5); }
      }
      // Hit enemies with beam
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(e.x<sx-7&&e.x>sx-7-beamLen&&Math.abs(e.y-sy)<3) e.alive=false;
      }
      // Beam destroys enemy/turret bullets
      for(let j=p.eBullets.length-1;j>=0;j--){
        if(p.eBullets[j].x<sx-7&&p.eBullets[j].x>sx-7-beamLen&&Math.abs(p.eBullets[j].y-sy)<2) p.eBullets.splice(j,1);
      }
      for(let j=p.tBullets.length-1;j>=0;j--){
        if(p.tBullets[j].x<sx-7&&p.tBullets[j].x>sx-7-beamLen&&Math.abs(p.tBullets[j].y-sy)<2) p.tBullets.splice(j,1);
      }
    }
    // Fire beam periodically
    if(Math.sin(p.t*0.9)>0.7&&p.chargeT<=0) p.chargeT=0.8;

    // Normal bullets when not beaming
    if(p.chargeT<=0&&Math.sin(p.t*6)>0.85&&p.bullets.length<5)
      p.bullets.push({x:sx-7,y:sy});

    for(let i=p.bullets.length-1;i>=0;i--){
      p.bullets[i].x-=70*dt;
      const b=p.bullets[i];
      if(b.x<-2){ p.bullets.splice(i,1); continue; }
      const bx=Math.round(b.x), by=Math.round(b.y);
      setP(bx,by,1,1,0); setP(bx-1,by,1,1,0);
      let bulletHit=false;
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(Math.abs(b.x-e.x)<3&&Math.abs(b.y-e.y)<3){ e.alive=false; p.bullets.splice(i,1); bulletHit=true; break; }
      }
      if(!bulletHit){
        for(let j=p.eBullets.length-1;j>=0;j--){
          if(Math.abs(b.x-p.eBullets[j].x)<3&&Math.abs(b.y-p.eBullets[j].y)<3){ p.eBullets.splice(j,1); p.bullets.splice(i,1); bulletHit=true; break; }
        }
      }
      if(!bulletHit&&p.tBullets){
        for(let j=p.tBullets.length-1;j>=0;j--){
          if(Math.abs(b.x-p.tBullets[j].x)<3&&Math.abs(b.y-p.tBullets[j].y)<3){ p.tBullets.splice(j,1); p.bullets.splice(i,1); break; }
        }
      }
    }
    if(p.bullets.length>5) p.bullets.length=5;

    // Init enemies if empty
    if(p.enemies.length===0){
      for(let i=0;i<3;i++) p.enemies.push({x:-4-Math.random()*30,y:terrainH+5+Math.random()*(S-terrainH-hudH-10),alive:true,type:i%3,phase:Math.random()*6,fireT:5+Math.random()*5});
    }
    if(!p.eBullets) p.eBullets=[];

    // Enemies (Bydo organisms)
    for(const e of p.enemies){
      if(!e.alive) continue;
      e.x+=12*dt;
      e.y+=Math.sin(p.t*2.5+e.phase)*6*dt;
      if(e.x>S+4){ e.x=-4-Math.random()*20; e.y=terrainH+5+Math.random()*(S-terrainH-hudH-10); e.alive=true; e.fireT=1+Math.random()*3; }
      const ex=Math.round(e.x), ey=Math.round(e.y);
      if(e.type===0){
        // Bydo pod — pulsing organic red/orange with tendrils
        const pulse=0.7+0.3*Math.sin(p.t*6+e.phase);
        setP(ex,ey,pulse,0.1,0.1); setP(ex+1,ey,pulse*0.8,0,0); setP(ex-1,ey,pulse*0.8,0,0);
        setP(ex,ey-1,pulse*0.7,0.2,0); setP(ex,ey+1,pulse*0.7,0.2,0);
        const ta=Math.sin(p.t*8+e.phase);
        setP(ex-2,ey+Math.round(ta),0.5,0,0);
        setP(ex+2,ey-Math.round(ta),0.5,0,0);
      } else if(e.type===1){
        // Larger bio-mechanical (purple/red armored)
        fillRect(ex-1,ey-1,ex+1,ey+1,0.8,0,0.6);
        setP(ex,ey,1,0.2,0.8); // core
        setP(ex-2,ey,0.6,0,0.4); setP(ex+2,ey,0.6,0,0.4);
        setP(ex,ey-2,0.5,0,0.3); setP(ex,ey+2,0.5,0,0.3);
        // Eye
        setP(ex+1,ey,1,1,0);
      } else {
        // Serpentine green alien with segments
        for(let seg=0;seg<3;seg++){
          const segX=ex-seg*2, segY=ey+Math.round(Math.sin(p.t*5+e.phase+seg)*1.5);
          const g=0.9-seg*0.2;
          setP(segX,segY,0,g,0); setP(segX,segY-1,0,g*0.7,0); setP(segX,segY+1,0,g*0.7,0);
        }
        setP(ex+1,ey,1,1,0); // head eye
      }
      // Enemy fires bullet toward ship
      if(!e.fireT) e.fireT=4;
      e.fireT-=dt;
      if(e.fireT<=0&&ex>0&&ex<S){
        const dx=p.shipX-ex, dy=p.shipY-ey;
        p.eBullets.push({x:ex,y:ey,dx:dx,dy:dy});
        e.fireT=4+Math.random()*4;
      }
    }
    // Enemy bullets
    for(let i=p.eBullets.length-1;i>=0;i--){
      const eb=p.eBullets[i];
      const dist=Math.sqrt(eb.dx*eb.dx+eb.dy*eb.dy);
      if(dist>0){ eb.x+=eb.dx/dist*20*dt; eb.y+=eb.dy/dist*20*dt; }
      if(eb.x<0||eb.x>=S||eb.y<0||eb.y>=S){ p.eBullets.splice(i,1); continue; }
      const ebx=Math.round(eb.x),eby=Math.round(eb.y);
      setP(ebx,eby,1,0.3,0.3); setP(ebx,eby-1,0.8,0.1,0.1);
    }
    if(p.eBullets.length>2) p.eBullets.length=2;
    // Respawn dead enemies
    if(p.enemies.filter(e=>e.alive).length<2){
      for(const e of p.enemies){ e.alive=true; e.x=-Math.random()*20; e.y=terrainH+5+Math.random()*(S-terrainH-hudH-10); e.fireT=2+Math.random()*3; }
    }

    // Collision detection — ship hit by enemy or turret bullet
    if(p.explodeT<=0&&p.respawnT<=0){
      let hit=false;
      // Enemy touches ship
      for(const e of p.enemies){
        if(!e.alive) continue;
        if(Math.abs(e.x-p.shipX)<3&&Math.abs(e.y-p.shipY)<3){ hit=true; e.alive=false; break; }
      }
      // Turret or enemy bullet hits ship
      if(!hit){
        for(let i=p.tBullets.length-1;i>=0;i--){
          if(Math.abs(p.tBullets[i].x-p.shipX)<3&&Math.abs(p.tBullets[i].y-p.shipY)<3){
            hit=true; p.tBullets.splice(i,1); break;
          }
        }
      }
      if(!hit){
        for(let i=p.eBullets.length-1;i>=0;i--){
          if(Math.abs(p.eBullets[i].x-p.shipX)<3&&Math.abs(p.eBullets[i].y-p.shipY)<3){
            hit=true; p.eBullets.splice(i,1); break;
          }
        }
      }
      if(hit){
        p.lives--;
        if(p.lives<=0){ p.loserT=3; }
        else { p.explodeT=0.5; }
      }
    }

    // HUD at top (yellow text area like Spectrum)
    for(let x=0;x<S;x++) for(let y=S-hudH;y<S;y++) setP(x,y,0,0,0);
    hLine(0,S-1,S-hudH,0.3,0.3,0);
    // Lives display
    for(let l=0;l<p.lives;l++){
      setP(2+l*4,S-3,0,0.8,0.8); setP(3+l*4,S-3,0,0.8,0.8); setP(2+l*4,S-4,0,0.6,0.6);
    }
    // Beam meter bar
    const meterLen=Math.round(20*(p.chargeT>0?p.chargeT/0.8:0));
    for(let mx=0;mx<20;mx++) setP(20+mx,S-3,mx<meterLen?0:0.8,mx<meterLen?1:0.8,mx<meterLen?1:0);
    hLine(44,S-4,S-3,0,0.8,0.8);

  } else if(game.name==='wolf3d'){
    const p=game;
    // Predefined corridor walk path — player walks through corridors looking ahead
    const waypoints=[
      {x:1.5,y:1.5,a:0},{x:5.5,y:1.5,a:0},{x:5.5,y:1.5,a:-Math.PI/2},
      {x:5.5,y:5.5,a:-Math.PI/2},{x:5.5,y:5.5,a:Math.PI},
      {x:1.5,y:5.5,a:Math.PI},{x:1.5,y:5.5,a:Math.PI/2},
      {x:1.5,y:1.5,a:Math.PI/2}
    ];
    const segLen=2.5;
    const totalT=waypoints.length*segLen;
    const wt=p.t%totalT;
    const segIdx=Math.floor(wt/segLen)%waypoints.length;
    const segFrac=(wt%segLen)/segLen;
    const w0=waypoints[segIdx], w1=waypoints[(segIdx+1)%waypoints.length];
    p.posX=w0.x+(w1.x-w0.x)*segFrac;
    p.posY=w0.y+(w1.y-w0.y)*segFrac;
    // Smooth angle interpolation
    let da=w1.a-w0.a;
    while(da>Math.PI)da-=Math.PI*2; while(da<-Math.PI)da+=Math.PI*2;
    p.dirA=w0.a+da*segFrac;
    p.fireT-=dt;
    if(p.fireT<-2){ p.fireT=0.3; p.gunFrame=3; }
    if(p.gunFrame>0) p.gunFrame-=dt*8;

    const map=[
      1,1,1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,2,1,0,1,2,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,0,3,3,0,1,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,2,1,0,0,1,0,0,1,
      1,0,0,0,0,0,0,2,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,1,1,
    ];
    const mapW=10;
    const hudH=6;

    // Grey ceiling
    for(let y=S/2;y<S-hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.35,0.35,0.38);
    // Grey floor
    for(let y=0;y<S/2;y++) for(let x=0;x<S;x++){
      const shade=0.15+0.08*(y/(S/2));
      setP(x,y,shade,shade*0.9,shade*0.75);
    }

    // Raycast walls
    const fov=1.0;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0,hitType=0,rx=p.posX,ry=p.posY,hitSide=0;
      for(let step=0;step<50;step++){
        dist+=0.08;
        rx=p.posX+rdx*dist; ry=p.posY+rdy*dist;
        const mx=Math.floor(rx), my=Math.floor(ry);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx]; hitSide=Math.abs(rx-Math.round(rx))<Math.abs(ry-Math.round(ry))?0:1; break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S,Math.round(S/(perpDist+0.01)));
      const wallTop=Math.floor(S/2+wallH/2);
      const wallBot=Math.floor(S/2-wallH/2);
      const shade=Math.min(1,1.8/(perpDist+0.5))*(hitSide?0.7:1);
      let wr,wg,wb;
      if(hitType===1){ wr=0.4*shade; wg=0.4*shade; wb=0.42*shade; }
      else if(hitType===2){ wr=0.15*shade; wg=0.15*shade; wb=0.55*shade; }
      else { wr=0.6*shade; wg=0.12*shade; wb=0.08*shade; }
      // Stone block texture
      const fracY=ry-Math.floor(ry), fracX=rx-Math.floor(rx);
      for(let y=Math.max(0,wallBot);y<=Math.min(S-hudH-1,wallTop);y++){
        const wallFrac=(y-wallBot)/(wallTop-wallBot+1);
        const blockY=Math.floor(wallFrac*4);
        const isMortar=(Math.abs(wallFrac*4-blockY)<0.08)||(hitType===1&&(fracX<0.03||fracX>0.97));
        const mr=isMortar?0.15:0, mg=isMortar?0.15:0, mb=isMortar?0.15:0;
        setP(x,y,wr-mr,wg-mg,wb-mb); setP(x+1,y,wr-mr,wg-mg,wb-mb);
      }
      // Red banner on blue walls
      if(hitType===2){
        const banH=Math.floor(wallH*0.4);
        const banMid=Math.floor((wallTop+wallBot)/2);
        for(let y=banMid-Math.floor(banH/2);y<=banMid+Math.floor(banH/2);y++){
          if(y>=0&&y<S-hudH) { setP(x,y,0.7*shade,0.05*shade,0.05*shade); setP(x+1,y,0.7*shade,0.05*shade,0.05*shade); }
        }
      }
    }

    // Multiple guard enemies at corridor positions
    const guards=[{x:5.5,y:3.5},{x:3.5,y:5.5},{x:7.5,y:7.5},{x:1.5,y:3.5}];
    for(let gi=0;gi<guards.length;gi++){
      const gp=guards[gi];
      const guardAngle=Math.atan2(gp.y-p.posY,gp.x-p.posX);
      const guardRelAngle=guardAngle-p.dirA;
      const normAngle=((guardRelAngle+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(normAngle)<fov/2){
        const guardDist=Math.sqrt((gp.x-p.posX)**2+(gp.y-p.posY)**2);
        if(guardDist<0.8) continue;
        const screenX=Math.floor(S/2+normAngle/(fov/2)*(S/2));
        const sprH=Math.min(S*0.8,Math.round(S/(guardDist+0.01)));
        const sprW=Math.floor(sprH*0.4);
        const sprBot=Math.floor(S/2-sprH/2);
        const gShade=Math.min(1,1.5/(guardDist+0.5));
        for(let dy=Math.floor(sprH*0.2);dy<Math.floor(sprH*0.85);dy++){
          for(let dx=-Math.floor(sprW/2);dx<=Math.floor(sprW/2);dx++){
            const gx2=screenX+dx, gy2=sprBot+dy;
            if(gx2>=0&&gx2<S&&gy2>=0&&gy2<S-hudH) setP(gx2,gy2,0.1*gShade,0.1*gShade,0.6*gShade);
          }
        }
        const headY=sprBot+Math.floor(sprH*0.85);
        const headR=Math.max(1,Math.floor(sprW*0.3));
        for(let dy=-headR;dy<=headR;dy++) for(let dx=-headR;dx<=headR;dx++){
          if(dx*dx+dy*dy<=headR*headR){
            const hx=screenX+dx, hy=headY+dy;
            if(hx>=0&&hx<S&&hy>=0&&hy<S-hudH) setP(hx,hy,0.75*gShade,0.55*gShade,0.35*gShade);
          }
        }
        for(let dx=-headR;dx<=headR;dx++){
          const cx2=screenX+dx, cy=headY+headR;
          if(cx2>=0&&cx2<S&&cy>=0&&cy<S-hudH) setP(cx2,cy,0.05*gShade,0.05*gShade,0.5*gShade);
          if(cx2>=0&&cx2<S&&cy+1>=0&&cy+1<S-hudH) setP(cx2,cy+1,0.05*gShade,0.05*gShade,0.5*gShade);
        }
      }
    }

    // Chain gun (centred at bottom)
    const gunBob=Math.round(Math.sin(p.t*5)*1.5);
    const gx=Math.floor(S/2), gy=hudH+gunBob;
    // Barrel (metallic grey, angled from bottom-centre toward screen)
    for(let by=0;by<16;by++){
      const bw=Math.max(1,3-Math.floor(by/5));
      const shade2=0.35+by*0.015;
      for(let bx=-bw;bx<=bw;bx++){
        const px2=gx+bx, py2=gy+by;
        if(py2<S-hudH) setP(px2,py2,shade2,shade2,shade2*1.05);
      }
    }
    // Hand/grip
    fillRect(gx-4,gy,gx-1,gy+5,0.75,0.55,0.35);
    fillRect(gx+1,gy,gx+4,gy+5,0.75,0.55,0.35);
    // Muzzle flash
    if(p.gunFrame>2){
      fillRect(gx-2,gy+16,gx+2,gy+20,1,0.9,0.2);
      setP(gx,gy+21,1,1,0.8);
    }

    // HUD bar (blue background like original)
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.15,0.15,0.45);
    hLine(0,S-1,hudH-1,0.3,0.3,0.6);
    // BJ face (centre)
    fillRect(S/2-3,1,S/2+3,4,0.75,0.55,0.35);
    setP(S/2-1,3,0.15,0.15,0.5); setP(S/2+1,3,0.15,0.15,0.5);
    setP(S/2,2,0.6,0.4,0.25);
    // Health (left)
    hLine(2,12,2,0.8,0.1,0.1);
    // Ammo (right)
    hLine(S-14,S-3,2,0.8,0.8,0.1);

  } else if(game.name==='quake2'){
    const p=game;
    // Walk through corridors looking down them
    const qWaypoints=[
      {x:1.5,y:1.5,a:0},{x:5.5,y:1.5,a:0},{x:5.5,y:1.5,a:-Math.PI/2},
      {x:5.5,y:5.5,a:-Math.PI/2},{x:5.5,y:5.5,a:-Math.PI},
      {x:1.5,y:5.5,a:-Math.PI},{x:1.5,y:5.5,a:Math.PI/2},
      {x:1.5,y:8.5,a:Math.PI/2},{x:1.5,y:8.5,a:0},
      {x:8.5,y:8.5,a:0},{x:8.5,y:8.5,a:Math.PI/2},
      {x:8.5,y:1.5,a:Math.PI/2},{x:8.5,y:1.5,a:Math.PI},
      {x:5.5,y:1.5,a:Math.PI}
    ];
    const qSegLen=2.2;
    const qTotalT=qWaypoints.length*qSegLen;
    const qwt=p.t%qTotalT;
    const qSegIdx=Math.floor(qwt/qSegLen)%qWaypoints.length;
    const qSegFrac=(qwt%qSegLen)/qSegLen;
    const qw0=qWaypoints[qSegIdx], qw1=qWaypoints[(qSegIdx+1)%qWaypoints.length];
    p.posX=qw0.x+(qw1.x-qw0.x)*qSegFrac;
    p.posY=qw0.y+(qw1.y-qw0.y)*qSegFrac;
    let qda=qw1.a-qw0.a;
    while(qda>Math.PI)qda-=Math.PI*2; while(qda<-Math.PI)qda+=Math.PI*2;
    p.dirA=qw0.a+qda*qSegFrac;
    p.bobT+=dt*6;
    p.muzzleT-=dt;
    if(p.muzzleT<-1.5){ p.muzzleT=0.15; }
    const lookUp=Math.sin(p.t*0.4)*5;
    const hudH=5;

    const map=[
      1,1,1,1,1,1,1,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,1,0,1,0,1,0,1,
      1,0,0,0,0,1,0,0,0,1,
      1,1,2,1,0,1,0,1,1,1,
      1,0,0,0,0,0,0,0,0,1,
      1,0,1,0,1,3,1,0,0,1,
      1,0,1,0,0,0,0,0,0,1,
      1,0,0,0,0,0,0,0,0,1,
      1,1,1,1,1,1,1,1,1,1,
    ];
    const mapW=10;
    const horizon=Math.floor(S/2+lookUp);

    // Brown/tan sky (looking up at Strogg architecture)
    for(let y=Math.max(hudH,horizon);y<S;y++){
      const skyShade=0.12+0.06*((y-horizon)/(S-horizon+1));
      for(let x=0;x<S;x++) setP(x,y,skyShade*1.2,skyShade,skyShade*0.6);
    }
    // Olive-green/brown floor
    for(let y=hudH;y<Math.min(S,horizon);y++){
      const floorShade=0.08+0.1*((horizon-y)/(horizon-hudH+1));
      for(let x=0;x<S;x++) setP(x,y,floorShade*0.8,floorShade,floorShade*0.4);
    }

    // Raycast brown/tan rocky walls
    const fov=1.1;
    for(let x=0;x<S;x+=2){
      const rayAngle=p.dirA-fov/2+(x/S)*fov;
      const rdx=Math.cos(rayAngle), rdy=Math.sin(rayAngle);
      let dist=0,hitType=0,hitSide=0,rx2=p.posX,ry2=p.posY;
      for(let step=0;step<50;step++){
        dist+=0.08;
        rx2=p.posX+rdx*dist; ry2=p.posY+rdy*dist;
        const mx=Math.floor(rx2), my=Math.floor(ry2);
        if(mx<0||mx>=mapW||my<0||my>=mapW){hitType=1;break;}
        if(map[my*mapW+mx]>0){hitType=map[my*mapW+mx]; hitSide=Math.abs(rx2-Math.round(rx2))<Math.abs(ry2-Math.round(ry2))?0:1; break;}
      }
      const perpDist=dist*Math.cos(rayAngle-p.dirA);
      const wallH=Math.min(S*2,Math.round(S*1.2/(perpDist+0.01)));
      const wallTop=Math.floor(horizon+wallH/2);
      const wallBot=Math.floor(horizon-wallH/2);
      const shade=Math.min(1,1.5/(perpDist+0.3))*(hitSide?0.75:1);
      let wr,wg,wb;
      if(hitType===1){
        wr=0.45*shade; wg=0.35*shade; wb=0.2*shade;
      } else if(hitType===2){
        wr=0.3*shade; wg=0.35*shade; wb=0.2*shade;
      } else {
        wr=0.5*shade; wg=0.25*shade; wb=0.1*shade;
      }
      const fracY2=ry2-Math.floor(ry2), fracX2=rx2-Math.floor(rx2);
      for(let y=Math.max(hudH,wallBot);y<=Math.min(S-1,wallTop);y++){
        const wallFrac=(y-wallBot)/(wallTop-wallBot+1);
        // Rocky texture
        const blockY=Math.floor(wallFrac*6);
        const isMortar=(Math.abs(wallFrac*6-blockY)<0.06)||(fracX2<0.04||fracX2>0.96);
        const tm=isMortar?0.08:0;
        // Light strips on type 2 walls
        const hasLight=hitType===2&&wallFrac>0.7&&wallFrac<0.78&&((fracX2>0.2&&fracX2<0.35)||(fracX2>0.5&&fracX2<0.65)||(fracX2>0.75&&fracX2<0.9));
        if(hasLight){ setP(x,y,0.8,0.75,0.5); setP(x+1,y,0.8,0.75,0.5); }
        else { setP(x,y,wr-tm,wg-tm,wb-tm); setP(x+1,y,wr-tm,wg-tm,wb-tm); }
      }
      // Doorway on type 3 walls (dark opening)
      if(hitType===3&&fracX2>0.2&&fracX2<0.8){
        const doorBot=Math.max(hudH,wallBot);
        const doorTop=Math.min(S-1,Math.floor(wallBot+wallH*0.75));
        for(let y=doorBot;y<=doorTop;y++){
          setP(x,y,0.06,0.04,0.02); setP(x+1,y,0.06,0.04,0.02);
        }
        // Red light inside doorway
        if(fracX2>0.4&&fracX2<0.6){
          const rlY=Math.floor((doorBot+doorTop)/2);
          if(rlY>=hudH&&rlY<S) { setP(x,rlY,0.5,0.05,0.02); setP(x+1,rlY,0.5,0.05,0.02); }
        }
      }
    }

    // Strogg enemies at corridor positions
    const stroggs=[{x:3.5,y:1.5},{x:5.5,y:3.5},{x:1.5,y:5.5},{x:8.5,y:5.5},{x:3.5,y:8.5}];
    const fov2=1.1;
    for(let si=0;si<stroggs.length;si++){
      const sp=stroggs[si];
      const eAngle=Math.atan2(sp.y-p.posY,sp.x-p.posX);
      const eRel=eAngle-p.dirA;
      const eNorm=((eRel+Math.PI*3)%(Math.PI*2))-Math.PI;
      if(Math.abs(eNorm)<fov2/2){
        const eDist=Math.sqrt((sp.x-p.posX)**2+(sp.y-p.posY)**2);
        if(eDist<0.8) continue;
        const eScreenX=Math.floor(S/2+eNorm/(fov2/2)*(S/2));
        const eSprH=Math.min(S*0.7,Math.round(S/(eDist+0.01)));
        const eSprW=Math.floor(eSprH*0.35);
        const eSprBot=Math.floor(horizon-eSprH/2);
        const eShade=Math.min(1,1.4/(eDist+0.5));
        // Body (brown/olive Strogg armor)
        for(let dy=Math.floor(eSprH*0.15);dy<Math.floor(eSprH*0.8);dy++){
          for(let dx=-Math.floor(eSprW/2);dx<=Math.floor(eSprW/2);dx++){
            const ex=eScreenX+dx, ey=eSprBot+dy;
            if(ex>=0&&ex<S&&ey>=hudH&&ey<S) setP(ex,ey,0.35*eShade,0.3*eShade,0.15*eShade);
          }
        }
        // Red cybernetic eye
        const eHeadY=eSprBot+Math.floor(eSprH*0.82);
        const eHeadR=Math.max(1,Math.floor(eSprW*0.35));
        for(let dy=-eHeadR;dy<=eHeadR;dy++) for(let dx=-eHeadR;dx<=eHeadR;dx++){
          if(dx*dx+dy*dy<=eHeadR*eHeadR){
            const hx=eScreenX+dx, hy=eHeadY+dy;
            if(hx>=0&&hx<S&&hy>=hudH&&hy<S) setP(hx,hy,0.6*eShade,0.4*eShade,0.25*eShade);
          }
        }
        setP(eScreenX+1,eHeadY,0.9,0.1,0.05);
      }
    }

    // Crosshair
    const chx=Math.floor(S/2), chy=Math.floor(horizon);
    if(chy>hudH&&chy<S){ setP(chx-1,chy,1,1,1); setP(chx+1,chy,1,1,1); setP(chx,chy-1,1,1,1); setP(chx,chy+1,1,1,1); }

    // Weapon (olive/tan shotgun on right side, like screenshot)
    const bob=Math.round(Math.sin(p.bobT)*1.5);
    const wx=S-16, wy=hudH+bob;
    // Gun body (olive green metal)
    for(let by=0;by<18;by++){
      const bw=by<12?4:by<15?3:2;
      const angle=by*0.15;
      const gx2=wx+Math.round(Math.sin(angle)*2);
      for(let bx=-bw;bx<=bw;bx++){
        const px2=gx2+bx, py2=wy+by;
        if(px2>=0&&px2<S&&py2>=hudH&&py2<S){
          const gs=0.3+by*0.008;
          setP(px2,py2,gs*0.8,gs*0.85,gs*0.5);
        }
      }
    }
    // Hand (skin tone)
    fillRect(wx-4,wy,wx-1,wy+4,0.7,0.5,0.35);
    // Barrel highlights
    for(let by=14;by<18;by++){
      setP(wx,wy+by,0.4,0.42,0.3); setP(wx+1,wy+by,0.35,0.38,0.25);
    }
    // Muzzle flash
    if(p.muzzleT>0){
      for(let dy=-3;dy<=3;dy++) for(let dx=-2;dx<=2;dx++){
        const fx=wx+dx, fy=wy+18+dy;
        if(fx>=0&&fx<S&&fy>=hudH&&fy<S) setP(fx,fy,1,0.7+Math.random()*0.3,0.1);
      }
    }

    // HUD (dark bar at bottom)
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0.05,0.05,0.05);
    hLine(0,S-1,hudH-1,0.15,0.12,0.08);
    // Health (green number + cross)
    hLine(2,8,2,0,0.7,0); setP(10,2,0,0.8,0); setP(10,3,0,0.8,0); setP(9,2,0,0.6,0); setP(11,2,0,0.6,0);
    // Ammo (yellow)
    hLine(16,22,2,0.8,0.6,0.1);
    // Weapon icon (small rectangle on right)
    fillRect(S-10,1,S-4,3,0.3,0.3,0.15);

  } else if(game.name==='samfox'){
    const p=game;
    p.dealT+=dt;
    const hudH=12;
    const roundLen=10;
    const handT=p.t%roundLen;
    const seed=Math.floor(p.t/roundLen);
    const flipT=2.5;
    const cardTopY=hudH+2;

    // Procedural green card-table felt background (the original decoded an
    // embedded photo here via atob(SF_GAMEBG_B64) - dropped, see module
    // comment at the top of this file).
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const felt=0.12+0.03*Math.sin(x*0.4+y*0.3);
      setP(x,y,0,felt,felt*0.35);
    }

    // 3 smaller cards over the body area
    const cardW=8, cardH=12;
    const gap=3;
    const totalW=cardW*3+gap*2;
    const cardStartX=Math.floor((S-totalW)/2);
    const cardY2=cardTopY+10;
    const vals=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
    const suits=[0,1,2,3];
    for(let c=0;c<3;c++){
      const dealDelay=c*0.35;
      if(handT<dealDelay) continue;
      const cx2=cardStartX+c*(cardW+gap);
      const faceUp=handT>flipT+c*0.3;
      // White card with black border
      fillRect(cx2-1,cardY2-1,cx2+cardW+1,cardY2+cardH+1,0,0,0);
      if(!faceUp){
        // Face down — red back with pattern
        fillRect(cx2,cardY2,cx2+cardW,cardY2+cardH,0.7,0,0);
        const ccx2=cx2+Math.floor(cardW/2), ccy2=cardY2+Math.floor(cardH/2);
        for(let dy3=-3;dy3<=3;dy3++) for(let dx3=-2;dx3<=2;dx3++){
          const nd2=Math.abs(dx3)/3+Math.abs(dy3)/4;
          if(nd2>0.35&&nd2<0.6) setP(ccx2+dx3,ccy2+dy3,0.9,0.2,0.2);
          if(nd2<0.2) setP(ccx2+dx3,ccy2+dy3,0.5,0,0.35);
        }
      } else {
        // Face up — white with value and suit
        fillRect(cx2,cardY2,cx2+cardW,cardY2+cardH,1,1,1);
        const vi2=(seed*7+c*11+5)%13;
        const si2=(seed*3+c*5+2)%4;
        const isRed2=si2<2;
        const cr3=isRed2?0.85:0, cg3=0, cb3=isRed2?0:0;
        // Value pip top-left
        fillRect(cx2+1,cardY2+cardH-3,cx2+3,cardY2+cardH-1,cr3,cg3,cb3);
        // Suit in centre
        const scx2=cx2+Math.floor(cardW/2), scy2=cardY2+Math.floor(cardH/2);
        if(si2===0){ // Heart
          setP(scx2-1,scy2+1,0.9,0,0);setP(scx2+1,scy2+1,0.9,0,0);
          setP(scx2,scy2,0.9,0,0);setP(scx2-1,scy2,0.9,0,0);setP(scx2+1,scy2,0.9,0,0);
          setP(scx2,scy2-1,0.9,0,0);
        } else if(si2===1){ // Diamond
          setP(scx2,scy2+1,0.9,0,0);setP(scx2,scy2-1,0.9,0,0);
          setP(scx2-1,scy2,0.9,0,0);setP(scx2+1,scy2,0.9,0,0);setP(scx2,scy2,0.9,0,0);
        } else if(si2===2){ // Club
          setP(scx2,scy2+1,0,0,0);setP(scx2-1,scy2,0,0,0);setP(scx2+1,scy2,0,0,0);
          setP(scx2,scy2,0,0,0);setP(scx2,scy2-1,0,0,0);
        } else { // Spade
          setP(scx2,scy2+1,0,0,0);setP(scx2-1,scy2,0,0,0);setP(scx2+1,scy2,0,0,0);
          setP(scx2,scy2,0,0,0);setP(scx2,scy2-1,0,0,0);setP(scx2,scy2+2,0,0,0);
        }
      }
    }

    // Red bar above cards
    const redBarY2=cardY2+cardH+2;
    for(let x=0;x<S;x++) setP(x,redBarY2,0.8,0,0);
    for(let tx2=3;tx2<S-3;tx2+=2) setP(tx2,redBarY2,0.9,0.3,0.5);

    // Green HUD at bottom
    for(let y=0;y<hudH;y++) for(let x=0;x<S;x++) setP(x,y,0,0.7,0);
    hLine(2,10,hudH-2,0,0,0);
    hLine(22,30,hudH-2,0,0,0);
    hLine(44,58,hudH-2,0,0,0);
    // Scores — animate between rounds
    const score1=100+seed*10;
    const score2=110+seed*5;
    hLine(3,9,hudH-4,0,0,0);
    hLine(23,29,hudH-4,0,0,0);
    hLine(2,8,hudH-7,0.6,0,0);
    hLine(12,14,hudH-7,0,0,0);
    hLine(22,30,hudH-7,0.6,0,0);
    // Flashing result after cards flip
    if(handT>flipT+1.5){
      const flash2=Math.floor(p.t*3)%2;
      if(flash2){
        const results=['PAIR','FLUSH','HIGH','THREE'];
        hLine(4,S-5,2,1,1,0);
        hLine(4,S-5,1,1,0.8,0);
      }
    }
    // Right side flashing text
    const flash3=Math.floor(p.t*2.5)%2;
    if(flash3){
      hLine(42,58,hudH-5,0.6,0,0.6);
      hLine(44,56,hudH-7,0.6,0,0.6);
      setP(41,hudH-5,0.9,0,0.9);setP(59,hudH-5,0.9,0,0.9);
    }
    hLine(0,S-1,hudH-1,0,0.4,0);

  } else if(game.name==='tamagotchi'){
    const p=game;
    const lc=[0.75,0.8,0.55]; // LCD background
    const pk=[0.1,0.1,0.1];   // LCD pixel (black)
    const gh=[0.5,0.55,0.4];  // LCD ghost/dim
    if(p.hunger===undefined){
      p.hunger=0.3; p.happy=0.8; p.age=0; p.animF=0;
      p.actionT=0; p.action='idle'; p.poop=false; p.poopCount=0;
      p.dead=false; p.deathT=0; p.sleepT=0; p.sleeping=false;
      p.walkX=0; p.walkDir=1; p.stage=0; // 0=baby,1=child,2=adult
      p.sick=false; p.sickT=0; p.disciplineT=0; p.attentionT=0;
      p.eatFrame=0; p.playScore=0; p.bathT=0;
    }
    p.age+=dt; p.animF+=dt;
    // Age stages
    if(p.age>120) p.stage=2; else if(p.age>40) p.stage=1; else p.stage=0;

    // Egg-shaped device body (zoomed in, extends off edges)
    const cx0=32, cy0=38, rx=42, ry=52;
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const dx=(x-cx0)/rx, dy=(y-cy0)/(ry+(y>cy0?4:-4));
      if(dx*dx+dy*dy<=1){
        const edge=Math.sqrt(dx*dx+dy*dy);
        const sh=edge>0.85?0.5:edge>0.7?0.7:1;
        setP(x,y,0.05*sh,0.02*sh,0.25*sh);
      }
    }
    // Cyan outline glow (visible edges only)
    for(let y=0;y<S;y++) for(let x=0;x<S;x++){
      const dx=(x-cx0)/rx, dy=(y-cy0)/(ry+(y>cy0?4:-4));
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>0.92&&d<1.05) setP(x,y,0.1,0.3,0.5);
    }
    // Screen bezel (dark border around screen) — LCD fills ~80%
    const scX1=6,scY1=6,scX2=57,scY2=50;
    fillRect(scX1-1,scY1-1,scX2+1,scY2+1,0.02,0.01,0.12);
    // LCD screen background
    fillRect(scX1,scY1,scX2,scY2,lc[0],lc[1],lc[2]);
    // Decorative shapes on shell corners
    setP(2,3,0,0.5,0.4); setP(3,4,0,0.5,0.4); setP(2,5,0,0.5,0.4);
    setP(60,3,0.7,0.6,0); setP(61,4,0.7,0.6,0); setP(62,3,0.7,0.6,0);
    // Three buttons at bottom
    for(let b=0;b<3;b++){
      const bx=20+b*12, by=57;
      const bc=b===0?[0.7,0.1,0.1]:b===1?[0.8,0.6,0]:[0.1,0.6,0.1];
      fillRect(bx-3,by-1,bx+3,by+1,bc[0],bc[1],bc[2]);
    }

    // Override drawing to map 64x64 game coords into the small screen area
    const SW=scX2-scX1+1,SH=scY2-scY1+1;
    setP=(x,y,r,g,b)=>{ const mx=scX1+Math.round(x*SW/S),my=scY1+Math.round(y*SH/S); if(mx>=scX1&&mx<=scX2&&my>=scY1&&my<=scY2) _setP0(mx,my,r,g,b); };
    fillRect=(x1,y1,x2,y2,r,g,b)=>{ const mx1=scX1+Math.round(x1*SW/S),my1=scY1+Math.round(y1*SH/S),mx2=scX1+Math.round(x2*SW/S),my2=scY1+Math.round(y2*SH/S); _fillRect0(Math.max(scX1,mx1),Math.max(scY1,my1),Math.min(scX2,mx2),Math.min(scY2,my2),r,g,b); };
    hLine=(x1,x2,y,r,g,b)=>{ const mx1=scX1+Math.round(x1*SW/S),mx2=scX1+Math.round(x2*SW/S),my=scY1+Math.round(y*SH/S); if(my>=scY1&&my<=scY2) _hLine0(Math.max(scX1,mx1),Math.min(scX2,mx2),my,r,g,b); };

    // Icon bar at top (8 icons like real Tamagotchi)
    const iconY=S-6;
    const icons=['food','light','game','med','bath','stats','disc','attn'];
    for(let i=0;i<8;i++){
      const ix=4+i*7;
      // Highlight active icon
      const active=(p.action==='eat'&&i===0)||(p.sleeping&&i===1)||(p.action==='play'&&i===2)||
        (p.sick&&p.action==='medicine'&&i===3)||(p.action==='bath'&&i===4)||(p.action==='idle'&&i===5);
      const ic=active?pk:gh;
      // Simple 5x5 icon shapes
      if(i===0){ // Food: bowl
        hLine(ix,ix+4,iconY,ic[0],ic[1],ic[2]);
        setP(ix,iconY+1,ic[0],ic[1],ic[2]); setP(ix+4,iconY+1,ic[0],ic[1],ic[2]);
        hLine(ix+1,ix+3,iconY+2,ic[0],ic[1],ic[2]);
      } else if(i===1){ // Light: bulb
        hLine(ix+1,ix+3,iconY+2,ic[0],ic[1],ic[2]);
        setP(ix+1,iconY+1,ic[0],ic[1],ic[2]); setP(ix+3,iconY+1,ic[0],ic[1],ic[2]);
        hLine(ix+1,ix+3,iconY,ic[0],ic[1],ic[2]); setP(ix+2,iconY-1,ic[0],ic[1],ic[2]);
      } else if(i===2){ // Game: bat&ball
        setP(ix,iconY+2,ic[0],ic[1],ic[2]); setP(ix+1,iconY+1,ic[0],ic[1],ic[2]);
        setP(ix+2,iconY,ic[0],ic[1],ic[2]); setP(ix+4,iconY+2,ic[0],ic[1],ic[2]);
      } else if(i===3){ // Medicine: cross
        hLine(ix+1,ix+3,iconY+1,ic[0],ic[1],ic[2]);
        setP(ix+2,iconY,ic[0],ic[1],ic[2]); setP(ix+2,iconY+2,ic[0],ic[1],ic[2]);
      } else if(i===4){ // Bath: tub
        hLine(ix,ix+4,iconY+1,ic[0],ic[1],ic[2]);
        setP(ix,iconY,ic[0],ic[1],ic[2]); setP(ix+4,iconY,ic[0],ic[1],ic[2]);
        hLine(ix+1,ix+3,iconY-1,ic[0],ic[1],ic[2]);
      } else if(i===5){ // Stats: bars
        for(let b=0;b<3;b++){ const h=1+b; for(let bv=0;bv<h;bv++) setP(ix+1+b*2,iconY+bv,ic[0],ic[1],ic[2]); }
      } else if(i===6){ // Discipline: !
        setP(ix+2,iconY+2,ic[0],ic[1],ic[2]); setP(ix+2,iconY+1,ic[0],ic[1],ic[2]); setP(ix+2,iconY,ic[0],ic[1],ic[2]);
        setP(ix+2,iconY-1,ic[0],ic[1],ic[2]);
      } else { // Attention: heart
        setP(ix+1,iconY+2,ic[0],ic[1],ic[2]); setP(ix+3,iconY+2,ic[0],ic[1],ic[2]);
        hLine(ix,ix+4,iconY+1,ic[0],ic[1],ic[2]);
        hLine(ix+1,ix+3,iconY,ic[0],ic[1],ic[2]); setP(ix+2,iconY-1,ic[0],ic[1],ic[2]);
      }
    }

    // Auto-actions
    p.actionT-=dt;
    if(p.actionT<=0&&!p.dead){
      if(p.hunger>0.7){ p.action='eat'; p.actionT=3; p.eatFrame=0; }
      else if(p.happy<0.3){ p.action='play'; p.actionT=4; p.playScore=0; }
      else if(p.sick){ p.action='medicine'; p.actionT=2.5; }
      else if(p.poopCount>=2){ p.action='bath'; p.actionT=3; p.bathT=0; }
      else if(p.poop){ p.action='clean'; p.actionT=1.5; }
      else if(p.animF>10&&!p.sleeping&&Math.random()<0.15){ p.sleeping=true; p.sleepT=0; p.action='sleep'; p.actionT=8; }
      else { p.action='idle'; p.actionT=2+Math.random()*3; }
    }

    // Stats
    p.hunger+=dt*0.035;
    p.happy-=dt*0.018;
    if(p.action==='eat'){ p.hunger-=dt*0.25; p.hunger=Math.max(0,p.hunger); p.eatFrame+=dt; }
    if(p.action==='play'){ p.happy+=dt*0.2; p.happy=Math.min(1,p.happy); }
    if(p.action==='medicine'){ p.sickT+=dt; if(p.sickT>2) p.sick=false; }
    if(p.action==='clean'){ p.poop=false; p.poopCount=0; }
    if(p.action==='bath'){ p.bathT+=dt; p.poop=false; p.poopCount=0; if(p.bathT>2.5) p.happy=Math.min(1,p.happy+0.1); }
    if(p.action==='sleep'){ p.sleepT+=dt; if(p.sleepT>7){ p.sleeping=false; p.happy=Math.min(1,p.happy+0.15); } }
    if(Math.random()<dt*0.025&&!p.poop){ p.poop=true; p.poopCount++; }
    if(Math.random()<dt*0.005&&!p.sick&&p.hunger>0.5) p.sick=true;
    if(p.hunger>1) p.dead=true;

    // Walking
    if(p.action==='idle'||p.action==='clean'){
      p.walkX+=p.walkDir*dt*8;
      if(p.walkX>12){ p.walkDir=-1; } else if(p.walkX<-12){ p.walkDir=1; }
    }

    const cx=Math.round(32+p.walkX), cy=28;
    const d=pk; // draw colour

    if(p.dead){
      p.deathT+=dt;
      // Ghost floating up
      const gy=cy-Math.round(p.deathT*3);
      fillRect(30,gy-2,33,gy+3,d[0],d[1],d[2]);
      setP(29,gy,d[0],d[1],d[2]); setP(34,gy,d[0],d[1],d[2]);
      setP(31,gy+1,lc[0],lc[1],lc[2]); setP(33,gy+1,lc[0],lc[1],lc[2]);
      // Skull+cross at bottom
      fillRect(29,14,34,19,d[0],d[1],d[2]);
      fillRect(30,12,33,14,d[0],d[1],d[2]);
      setP(30,17,lc[0],lc[1],lc[2]); setP(33,17,lc[0],lc[1],lc[2]);
      setP(31,15,lc[0],lc[1],lc[2]); setP(32,15,lc[0],lc[1],lc[2]);
      hLine(28,35,10,d[0],d[1],d[2]); setP(31,9,d[0],d[1],d[2]); setP(31,11,d[0],d[1],d[2]);
      if(p.deathT>15){ p.dead=false; p.deathT=0; p.hunger=0.3; p.happy=0.8; p.poop=false; p.poopCount=0; p.sick=false; p.age=0; p.stage=0; }
    } else if(p.sleeping){
      const k=d;
      const by=20;
      // Pillow (rounded outline)
      hLine(cx+4,cx+16,by+28,k[0],k[1],k[2]); hLine(cx+4,cx+16,by+22,k[0],k[1],k[2]);
      setP(cx+3,by+23,k[0],k[1],k[2]); setP(cx+3,by+24,k[0],k[1],k[2]); setP(cx+3,by+25,k[0],k[1],k[2]); setP(cx+3,by+26,k[0],k[1],k[2]); setP(cx+3,by+27,k[0],k[1],k[2]);
      setP(cx+17,by+23,k[0],k[1],k[2]); setP(cx+17,by+24,k[0],k[1],k[2]); setP(cx+17,by+25,k[0],k[1],k[2]); setP(cx+17,by+26,k[0],k[1],k[2]); setP(cx+17,by+27,k[0],k[1],k[2]);
      // Head outline lying on pillow (~20px wide)
      hLine(cx-2,cx+12,by+30,k[0],k[1],k[2]);
      setP(cx-3,by+29,k[0],k[1],k[2]); setP(cx+13,by+29,k[0],k[1],k[2]);
      setP(cx-4,by+28,k[0],k[1],k[2]); setP(cx+14,by+28,k[0],k[1],k[2]);
      for(let hh=23;hh<=27;hh++){ setP(cx-5,by+hh,k[0],k[1],k[2]); setP(cx+14,by+hh,k[0],k[1],k[2]); }
      setP(cx-4,by+22,k[0],k[1],k[2]); setP(cx+13,by+22,k[0],k[1],k[2]);
      hLine(cx-3,cx+12,by+21,k[0],k[1],k[2]);
      // Ears pointing up
      setP(cx-3,by+31,k[0],k[1],k[2]); setP(cx-4,by+32,k[0],k[1],k[2]); setP(cx-5,by+33,k[0],k[1],k[2]);
      setP(cx-2,by+31,k[0],k[1],k[2]); setP(cx-3,by+33,k[0],k[1],k[2]);
      setP(cx+11,by+31,k[0],k[1],k[2]); setP(cx+12,by+32,k[0],k[1],k[2]); setP(cx+13,by+33,k[0],k[1],k[2]);
      setP(cx+10,by+31,k[0],k[1],k[2]); setP(cx+11,by+33,k[0],k[1],k[2]);
      // Closed eyes (horizontal dashes)
      hLine(cx-2,cx+1,by+26,k[0],k[1],k[2]);
      hLine(cx+7,cx+10,by+26,k[0],k[1],k[2]);
      // Blanket covering body (large rounded rectangle)
      hLine(cx-18,cx+2,by+19,k[0],k[1],k[2]);
      hLine(cx-18,cx+2,by+10,k[0],k[1],k[2]);
      setP(cx-19,by+11,k[0],k[1],k[2]); setP(cx-19,by+12,k[0],k[1],k[2]);
      for(let bh=13;bh<=18;bh++){ setP(cx-19,by+bh,k[0],k[1],k[2]); }
      setP(cx+2,by+20,k[0],k[1],k[2]);
      for(let bh=11;bh<=18;bh++){ setP(cx+2,by+bh,k[0],k[1],k[2]); }
      // Blanket fold lines
      hLine(cx-15,cx-5,by+15,k[0],k[1],k[2]);
      // Feet poking out from blanket
      fillRect(cx-20,by+12,cx-19,by+14,k[0],k[1],k[2]);
      fillRect(cx-23,by+11,cx-20,by+13,k[0],k[1],k[2]);
      fillRect(cx-20,by+16,cx-19,by+18,k[0],k[1],k[2]);
      fillRect(cx-23,by+15,cx-20,by+17,k[0],k[1],k[2]);
      // Zzz floating upward (3 sizes)
      const zt=p.sleepT*1.5;
      for(let zi=0;zi<3;zi++){
        const zPhase=(zt+zi*0.8)%2.4;
        if(zPhase>2.0) continue;
        const zs=2+zi;
        const zx=cx+16+zi*3, zy=by+30+Math.round(zPhase*5);
        if(zy<60){
          hLine(zx,zx+zs,zy+zs,k[0],k[1],k[2]);
          for(let zd=1;zd<zs;zd++) setP(zx+zs-zd,zy+zs-zd,k[0],k[1],k[2]);
          hLine(zx,zx+zs,zy,k[0],k[1],k[2]);
        }
      }
      // Lights dimmed
      for(let y=scY1;y<=scY2;y++) for(let x=scX1;x<=scX2;x++){
        const i=(y*S+x)*3;
        buf[i]*=0.6; buf[i+1]*=0.6; buf[i+2]*=0.55;
      }
    } else {
      // Draw Mametchi as large LCD outline filling most of the screen (1.5x)
      const bob=Math.round(Math.sin(p.animF*2.5)*1);
      const blink=Math.sin(p.animF*2.3)>0.93;
      const walkFrame=Math.floor(p.animF*3)%2;
      const k=d;
      const by=22+bob;

      // Head outline (~30px wide, ~21px tall)
      hLine(cx-8,cx+8,by+28,k[0],k[1],k[2]);
      hLine(cx-10,cx-8,by+27,k[0],k[1],k[2]); hLine(cx+8,cx+10,by+27,k[0],k[1],k[2]);
      hLine(cx-12,cx-10,by+26,k[0],k[1],k[2]); hLine(cx+10,cx+12,by+26,k[0],k[1],k[2]);
      hLine(cx-13,cx-12,by+25,k[0],k[1],k[2]); hLine(cx+12,cx+13,by+25,k[0],k[1],k[2]);
      for(let hh=14;hh<=24;hh++){ setP(cx-14,by+hh,k[0],k[1],k[2]); setP(cx+14,by+hh,k[0],k[1],k[2]); }
      hLine(cx-13,cx-12,by+13,k[0],k[1],k[2]); hLine(cx+12,cx+13,by+13,k[0],k[1],k[2]);
      hLine(cx-11,cx-8,by+12,k[0],k[1],k[2]); hLine(cx+8,cx+11,by+12,k[0],k[1],k[2]);
      hLine(cx-7,cx-5,by+12,k[0],k[1],k[2]); hLine(cx+5,cx+7,by+12,k[0],k[1],k[2]);

      // Pointy ears
      setP(cx-15,by+25,k[0],k[1],k[2]); setP(cx-16,by+26,k[0],k[1],k[2]); setP(cx-17,by+27,k[0],k[1],k[2]); setP(cx-18,by+28,k[0],k[1],k[2]);
      setP(cx-16,by+24,k[0],k[1],k[2]); setP(cx-17,by+25,k[0],k[1],k[2]); setP(cx-18,by+26,k[0],k[1],k[2]);
      setP(cx+15,by+25,k[0],k[1],k[2]); setP(cx+16,by+26,k[0],k[1],k[2]); setP(cx+17,by+27,k[0],k[1],k[2]); setP(cx+18,by+28,k[0],k[1],k[2]);
      setP(cx+16,by+24,k[0],k[1],k[2]); setP(cx+17,by+25,k[0],k[1],k[2]); setP(cx+18,by+26,k[0],k[1],k[2]);

      // Eyes (oval outlines, ~5x5 each)
      if(!blink){
        setP(cx-8,by+22,k[0],k[1],k[2]); setP(cx-7,by+23,k[0],k[1],k[2]); setP(cx-6,by+23,k[0],k[1],k[2]);
        setP(cx-8,by+20,k[0],k[1],k[2]); setP(cx-7,by+19,k[0],k[1],k[2]); setP(cx-6,by+19,k[0],k[1],k[2]);
        setP(cx-5,by+21,k[0],k[1],k[2]); setP(cx-5,by+20,k[0],k[1],k[2]);
        setP(cx-8,by+21,k[0],k[1],k[2]); setP(cx-6,by+21,k[0],k[1],k[2]); setP(cx-6,by+20,k[0],k[1],k[2]);
        setP(cx+8,by+22,k[0],k[1],k[2]); setP(cx+7,by+23,k[0],k[1],k[2]); setP(cx+6,by+23,k[0],k[1],k[2]);
        setP(cx+8,by+20,k[0],k[1],k[2]); setP(cx+7,by+19,k[0],k[1],k[2]); setP(cx+6,by+19,k[0],k[1],k[2]);
        setP(cx+5,by+21,k[0],k[1],k[2]); setP(cx+5,by+20,k[0],k[1],k[2]);
        setP(cx+8,by+21,k[0],k[1],k[2]); setP(cx+6,by+21,k[0],k[1],k[2]); setP(cx+6,by+20,k[0],k[1],k[2]);
      } else {
        hLine(cx-8,cx-5,by+20,k[0],k[1],k[2]); hLine(cx+5,cx+8,by+20,k[0],k[1],k[2]);
      }

      // Mouth
      if(p.happy>0.5){
        setP(cx-3,by+16,k[0],k[1],k[2]); hLine(cx-2,cx+2,by+15,k[0],k[1],k[2]); setP(cx+3,by+16,k[0],k[1],k[2]);
      } else {
        setP(cx-3,by+15,k[0],k[1],k[2]); hLine(cx-2,cx+2,by+16,k[0],k[1],k[2]); setP(cx+3,by+15,k[0],k[1],k[2]);
      }

      // Body outline
      hLine(cx-6,cx+6,by+11,k[0],k[1],k[2]);
      for(let bh=5;bh<=10;bh++){ setP(cx-6,by+bh,k[0],k[1],k[2]); setP(cx+6,by+bh,k[0],k[1],k[2]); }
      hLine(cx-6,cx+6,by+4,k[0],k[1],k[2]);

      // Arms
      setP(cx-7,by+9,k[0],k[1],k[2]); setP(cx-8,by+10,k[0],k[1],k[2]); setP(cx-9,by+11,k[0],k[1],k[2]); setP(cx-10,by+11,k[0],k[1],k[2]);
      setP(cx+7,by+9,k[0],k[1],k[2]); setP(cx+8,by+10,k[0],k[1],k[2]); setP(cx+9,by+11,k[0],k[1],k[2]); setP(cx+10,by+11,k[0],k[1],k[2]);

      // Feet (walk animation)
      const fk=walkFrame&&(p.action==='idle'||p.action==='clean')?1:0;
      fillRect(cx-6,by+1,cx-3,by+3,k[0],k[1],k[2]);
      fillRect(cx+3-fk,by+1,cx+6-fk,by+3,k[0],k[1],k[2]);

      // Eating: food item appears, chomping
      if(p.action==='eat'){
        const chomp=Math.floor(p.eatFrame*5)%2;
        const fx=cx+18;
        // Food outline (larger)
        hLine(fx-3,fx+3,by+10,k[0],k[1],k[2]); hLine(fx-3,fx+3,by+5,k[0],k[1],k[2]);
        setP(fx-3,by+6,k[0],k[1],k[2]); setP(fx-3,by+7,k[0],k[1],k[2]); setP(fx-3,by+8,k[0],k[1],k[2]); setP(fx-3,by+9,k[0],k[1],k[2]);
        setP(fx+3,by+6,k[0],k[1],k[2]); setP(fx+3,by+7,k[0],k[1],k[2]); setP(fx+3,by+8,k[0],k[1],k[2]); setP(fx+3,by+9,k[0],k[1],k[2]);
        if(p.actionT>1.5){ setP(fx,by+7,k[0],k[1],k[2]); setP(fx,by+8,k[0],k[1],k[2]); }
        if(chomp){ setP(cx+12,by+15,k[0],k[1],k[2]); setP(cx+13,by+14,k[0],k[1],k[2]); }
      }

      // Playing: ball bouncing
      if(p.action==='play'){
        const ballT=p.animF*4;
        const ballBounce=Math.round(Math.abs(Math.sin(ballT))*12);
        const bx2=cx+18, by2=by+4+ballBounce;
        fillRect(bx2-1,by2-1,bx2+1,by2+1,k[0],k[1],k[2]);
      }

      // Bath: bubbles
      if(p.action==='bath'){
        const bubT=p.bathT*3;
        for(let bi=0;bi<6;bi++){
          const ba=bi*1.1+bubT;
          const bx2=cx+Math.round(Math.sin(ba)*16);
          const by2=by+8+Math.round(Math.cos(ba*0.7)*10);
          setP(bx2,by2,k[0],k[1],k[2]); setP(bx2+1,by2,k[0],k[1],k[2]);
          setP(bx2,by2+1,k[0],k[1],k[2]); setP(bx2+1,by2+1,k[0],k[1],k[2]);
        }
      }

      // Sick: sweat drops
      if(p.sick){
        const sw=Math.floor(p.animF*2)%2;
        setP(cx-15,by+24-sw,k[0],k[1],k[2]); setP(cx-15,by+23-sw,k[0],k[1],k[2]); setP(cx-15,by+22-sw,k[0],k[1],k[2]);
      }

      // Poop (coil outline, larger)
      if(p.poop){
        const px=cx-20, py=by+2;
        setP(px+3,py+8,k[0],k[1],k[2]); setP(px+4,py+8,k[0],k[1],k[2]);
        setP(px+1,py+7,k[0],k[1],k[2]); setP(px+2,py+7,k[0],k[1],k[2]); setP(px+5,py+7,k[0],k[1],k[2]);
        setP(px,py+5,k[0],k[1],k[2]); setP(px,py+6,k[0],k[1],k[2]); setP(px+3,py+5,k[0],k[1],k[2]); setP(px+5,py+5,k[0],k[1],k[2]); setP(px+5,py+6,k[0],k[1],k[2]);
        setP(px+1,py+4,k[0],k[1],k[2]); setP(px+2,py+4,k[0],k[1],k[2]); setP(px+4,py+4,k[0],k[1],k[2]);
        setP(px+3,py+3,k[0],k[1],k[2]);
        if(Math.floor(p.animF*3)%2){ setP(px+2,py+9,k[0],k[1],k[2]); setP(px+5,py+10,k[0],k[1],k[2]); setP(px,py+10,k[0],k[1],k[2]); }
      }

      // Attention: exclamation (larger)
      if((p.hunger>0.8||p.happy<0.2)&&Math.floor(p.animF*4)%2){
        setP(cx+17,by+25,k[0],k[1],k[2]); setP(cx+17,by+24,k[0],k[1],k[2]);
        setP(cx+17,by+23,k[0],k[1],k[2]); setP(cx+17,by+22,k[0],k[1],k[2]);
        setP(cx+17,by+20,k[0],k[1],k[2]);
      }
    }

    // Bottom status: hunger hearts (left) and happy hearts (right)
    const hungerBars=Math.round((1-Math.min(1,p.hunger))*4);
    for(let i=0;i<4;i++){
      const bx=5+i*5, by=4;
      if(i<hungerBars){
        setP(bx,by+2,pk[0],pk[1],pk[2]); setP(bx+2,by+2,pk[0],pk[1],pk[2]);
        hLine(bx-1,bx+3,by+1,pk[0],pk[1],pk[2]);
        hLine(bx,bx+2,by,pk[0],pk[1],pk[2]); setP(bx+1,by-1,pk[0],pk[1],pk[2]);
      } else {
        setP(bx,by+2,gh[0],gh[1],gh[2]); setP(bx+2,by+2,gh[0],gh[1],gh[2]);
        hLine(bx-1,bx+3,by+1,gh[0],gh[1],gh[2]);
        hLine(bx,bx+2,by,gh[0],gh[1],gh[2]); setP(bx+1,by-1,gh[0],gh[1],gh[2]);
      }
    }
    const happyBars=Math.round(Math.max(0,p.happy)*4);
    for(let i=0;i<4;i++){
      const bx=38+i*5, by=4;
      if(i<happyBars){
        setP(bx,by+2,pk[0],pk[1],pk[2]); setP(bx+2,by+2,pk[0],pk[1],pk[2]);
        hLine(bx-1,bx+3,by+1,pk[0],pk[1],pk[2]);
        hLine(bx,bx+2,by,pk[0],pk[1],pk[2]); setP(bx+1,by-1,pk[0],pk[1],pk[2]);
      } else {
        setP(bx,by+2,gh[0],gh[1],gh[2]); setP(bx+2,by+2,gh[0],gh[1],gh[2]);
        hLine(bx-1,bx+3,by+1,gh[0],gh[1],gh[2]);
        hLine(bx,bx+2,by,gh[0],gh[1],gh[2]); setP(bx+1,by-1,gh[0],gh[1],gh[2]);
      }
    }
    // Age display (bottom center)
    const ageStr=''+Math.floor(p.age/10);
    const ax=Math.round(S/2-ageStr.length*2);
    for(let ci=0;ci<ageStr.length;ci++){
      const ch=ageStr[ci]; const cw=ci*4+ax;
      const digits={'0':[7,5,5,5,7],'1':[2,6,2,2,7],'2':[7,1,7,4,7],'3':[7,1,7,1,7],'4':[5,5,7,1,1],'5':[7,4,7,1,7],'6':[7,4,7,5,7],'7':[7,1,1,1,1],'8':[7,5,7,5,7],'9':[7,5,7,1,7]};
      const rows=digits[ch]; if(!rows) continue;
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if((rows[r]>>(2-c))&1) setP(cw+c,8-r,pk[0],pk[1],pk[2]);
    }
    // Restore original drawing functions
    setP=_setP0; fillRect=_fillRect0; hLine=_hLine0;
    // 180° flip LCD screen area
    const lw=scX2-scX1+1, lh=scY2-scY1+1;
    for(let ly=0;ly<Math.floor(lh/2);ly++){
      const sy=scY1+ly, sy2=scY2-ly;
      for(let lx=0;lx<lw;lx++){
        const sx=scX1+lx, sx2=scX2-lx;
        const i1=(sy*S+sx)*3, i2=(sy2*S+sx2)*3;
        const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
        buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
        buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
      }
    }
    // 180° flip entire face
    for(let y=0;y<Math.floor(S/2);y++){
      const y2=S-1-y;
      for(let x=0;x<S;x++){
        const i1=(y*S+x)*3, i2=(y2*S+(S-1-x))*3;
        const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
        buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
        buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
      }
    }
  } else if(game.name==='donkeykong'){
    const p=game;
    const RED=[0.85,0,0],CYN=[0,0.85,0.85],WHT=[1,1,1],YEL=[0.85,0.85,0],BLU=[0,0,0.85],MAG=[0.85,0,0.85];
    // Girder platform positions (y-coords, slant offsets)
    const platforms=[
      {y:8,x1:2,x2:62,slant:0},
      {y:18,x1:4,x2:60,slant:1},
      {y:28,x1:2,x2:58,slant:-1},
      {y:38,x1:4,x2:60,slant:1},
      {y:48,x1:2,x2:58,slant:-1},
      {y:56,x1:6,x2:52,slant:0},
    ];
    // Draw girders (red with triangle pattern like original)
    for(const pl of platforms){
      const s=pl.slant;
      for(let x=pl.x1;x<=pl.x2;x++){
        const yo=Math.round(s*(x-32)/20);
        const gy=pl.y+yo;
        setP(x,gy,RED[0],RED[1],RED[2]);
        setP(x,gy+1,RED[0],RED[1],RED[2]);
        if(x%4<2) setP(x,gy+2,RED[0]*0.6,RED[1],RED[2]);
      }
    }
    // Ladders (cyan)
    const ladders=[
      {x:8,y1:8,y2:18},{x:55,y1:18,y2:28},{x:8,y1:28,y2:38},
      {x:55,y1:38,y2:48},{x:8,y1:48,y2:56},
    ];
    for(const ld of ladders){
      for(let y=ld.y1;y<=ld.y2;y++){
        setP(ld.x,y,CYN[0],CYN[1],CYN[2]); setP(ld.x+2,y,CYN[0],CYN[1],CYN[2]);
        if(y%3===0) hLine(ld.x,ld.x+2,y,CYN[0],CYN[1],CYN[2]);
      }
    }
    // Mario state machine (auto-play)
    if(p.platIdx===undefined){ p.platIdx=0; p.marioX=platforms[0].x2-6; p.state='walk'; p.jumpT=0; p.climbY=0; p.targetLadder=null; }
    const mSpeed=22;
    const mpl=platforms[p.platIdx];
    const mDir=p.platIdx%2===1?1:-1; // walk against barrels
    if(p.state==='walk'){
      p.marioX+=mDir*mSpeed*dt;
      const slOff=Math.round(mpl.slant*(p.marioX-32)/20);
      p.marioY=mpl.y+slOff;
      // Barrel avoidance — pause and wait for barrel to pass, then jump
      let nearestDist=999, nearestBarrel=null;
      for(const b of p.barrels){
        const bdx=b.x-p.marioX, bdy=b.y-p.marioY;
        if(Math.abs(bdy)<5){
          const dist=Math.abs(bdx);
          if(dist<18&&dist<nearestDist){ nearestDist=dist; nearestBarrel=b; }
        }
      }
      let dodging=false;
      if(nearestBarrel&&nearestDist<16){
        const bdx=nearestBarrel.x-p.marioX;
        const headOn=bdx*mDir>0;
        if(headOn){
          dodging=true;
          if(nearestDist<8&&p.jumpT<=0){ p.state='jump'; p.jumpT=0; dodging=false; }
        } else if(nearestDist<6&&p.jumpT<=0){
          p.state='jump'; p.jumpT=0;
        }
      }
      if(dodging) p.marioX-=mDir*mSpeed*dt; // undo the walk step — stand still
      // Find ladder to climb when reaching end of platform
      if(p.platIdx<5){
        for(const ld of ladders){
          if(ld.y1===mpl.y&&Math.abs(p.marioX-ld.x)<6){
            p.state='climb'; p.targetLadder=ld; p.climbY=ld.y1; break;
          }
        }
      }
      // Clamp to platform
      if(p.marioX<mpl.x1+2||p.marioX>mpl.x2-2){ p.marioX=Math.max(mpl.x1+2,Math.min(mpl.x2-2,p.marioX)); }
    } else if(p.state==='jump'){
      p.jumpT+=dt;
      const jDur=0.5;
      p.marioX+=mDir*mSpeed*dt;
      const slOff=Math.round(mpl.slant*(p.marioX-32)/20);
      const jumpH=Math.sin(Math.min(1,p.jumpT/jDur)*Math.PI)*8;
      p.marioY=mpl.y+slOff+jumpH;
      if(p.jumpT>=jDur){ p.state='walk'; p.jumpT=0; p.score+=100; }
    } else if(p.state==='climb'){
      p.climbY+=18*dt;
      p.marioX=p.targetLadder.x+1;
      p.marioY=p.climbY;
      if(p.climbY>=p.targetLadder.y2){
        p.platIdx++;
        if(p.platIdx>5) p.platIdx=5;
        p.state='walk';
        p.marioY=platforms[p.platIdx].y;
      }
    }
    // Barrel collision — reset to bottom
    for(const b of p.barrels){
      if(Math.abs(b.x-p.marioX)<3&&Math.abs(b.y-p.marioY)<3&&p.state!=='jump'){
        p.platIdx=0; p.marioX=platforms[0].x2-6; p.marioY=platforms[0].y; p.state='walk'; p.lives--; break;
      }
    }
    // Reached Pauline — win, restart
    if(p.platIdx>=5&&p.marioY>=54){
      p.score+=1000; p.platIdx=0; p.marioX=platforms[0].x2-6; p.marioY=platforms[0].y; p.state='walk'; p.barrels=[];
    }
    const mx=Math.round(p.marioX), my=Math.round(p.marioY);
    const walkF=Math.floor(p.t*5)%2;
    // Mario (red hat, blue body, skin face)
    setP(mx,my+5,RED[0],RED[1],RED[2]); setP(mx+1,my+5,RED[0],RED[1],RED[2]); setP(mx+2,my+5,RED[0],RED[1],RED[2]);
    setP(mx,my+4,0.9,0.7,0.5); setP(mx+1,my+4,0.9,0.7,0.5); setP(mx+2,my+4,0.9,0.7,0.5);
    setP(mx,my+3,BLU[0],BLU[1],BLU[2]); setP(mx+1,my+3,RED[0],RED[1],RED[2]); setP(mx+2,my+3,BLU[0],BLU[1],BLU[2]);
    setP(mx,my+2,BLU[0],BLU[1],BLU[2]); setP(mx+1,my+2,BLU[0],BLU[1],BLU[2]); setP(mx+2,my+2,BLU[0],BLU[1],BLU[2]);
    if(walkF){ setP(mx-1,my+1,0.9,0.7,0.5); setP(mx+3,my+1,0.9,0.7,0.5); }
    else { setP(mx,my+1,0.9,0.7,0.5); setP(mx+2,my+1,0.9,0.7,0.5); }
    // Donkey Kong at top (big red/brown ape)
    const dkx=10, dky=56;
    const dkF=Math.floor(p.t*2)%2;
    // Body
    fillRect(dkx,dky,dkx+7,dky+5,0.7,0.2,0);
    fillRect(dkx+1,dky+1,dkx+6,dky+4,0.9,0.3,0);
    // Face
    setP(dkx+2,dky+4,0.9,0.7,0.4); setP(dkx+5,dky+4,0.9,0.7,0.4);
    setP(dkx+3,dky+3,0.9,0.7,0.4); setP(dkx+4,dky+3,0.9,0.7,0.4);
    // Eyes
    setP(dkx+2,dky+5,WHT[0],WHT[1],WHT[2]); setP(dkx+5,dky+5,WHT[0],WHT[1],WHT[2]);
    // Arms
    if(dkF){
      setP(dkx-1,dky+3,0.7,0.2,0); setP(dkx-1,dky+4,0.7,0.2,0);
      setP(dkx+8,dky+3,0.7,0.2,0); setP(dkx+8,dky+4,0.7,0.2,0);
    } else {
      setP(dkx-1,dky+4,0.7,0.2,0); setP(dkx-1,dky+5,0.7,0.2,0);
      setP(dkx+8,dky+4,0.7,0.2,0); setP(dkx+8,dky+5,0.7,0.2,0);
    }
    // Barrel stack (yellow)
    fillRect(2,dky,6,dky+2,YEL[0],YEL[1],YEL[2]);
    fillRect(2,dky+3,6,dky+5,YEL[0],YEL[1],YEL[2]);
    setP(4,dky+1,0.5,0.3,0); setP(4,dky+4,0.5,0.3,0);
    // Pauline at top
    const paulX=32, paulY=58;
    setP(paulX,paulY+2,1,0.7,0.5); setP(paulX+1,paulY+2,1,0.7,0.5);
    setP(paulX,paulY+1,MAG[0],MAG[1],MAG[2]); setP(paulX+1,paulY+1,MAG[0],MAG[1],MAG[2]);
    setP(paulX,paulY,MAG[0],MAG[1],MAG[2]); setP(paulX+1,paulY,MAG[0],MAG[1],MAG[2]);
    // Rolling barrels
    p.barrelT+=dt;
    if(p.barrelT>2.5){ p.barrelT=0; p.barrels.push({x:18,y:56,vy:0,plat:5,dx:-15}); }
    if(p.barrels.length>6) p.barrels.shift();
    for(const b of p.barrels){
      b.x+=b.dx*dt;
      const bpl=platforms[b.plat];
      if(!bpl) continue;
      const slOff=Math.round(bpl.slant*(b.x-32)/20);
      b.y=bpl.y+slOff;
      if(b.x>bpl.x2||b.x<bpl.x1){
        b.plat--;
        if(b.plat<0){ b.plat=0; b.x=bpl.x1+4; }
        b.dx=-b.dx;
      }
      const bx=Math.round(b.x), by=Math.round(b.y);
      const bf=Math.floor(p.t*6)%4;
      // Barrel (brown circle-ish)
      setP(bx,by+2,0.6,0.3,0); setP(bx+1,by+2,0.6,0.3,0);
      setP(bx-1,by+1,0.6,0.3,0); setP(bx,by+1,0.8,0.5,0.1); setP(bx+1,by+1,0.8,0.5,0.1); setP(bx+2,by+1,0.6,0.3,0);
      setP(bx,by,0.6,0.3,0); setP(bx+1,by,0.6,0.3,0);
      if(bf%2) setP(bx,by+1,0.4,0.2,0);
    }
    // Oil drum fire (bottom left)
    fillRect(3,6,6,8,BLU[0],BLU[1],BLU[2]);
    const fireF=Math.floor(p.t*6)%2;
    setP(4,9,1,0.5,0); setP(5,9,1,0.3,0);
    if(fireF){ setP(4,10,1,0.8,0); setP(5,10,1,0.6,0); }
    else { setP(3,10,1,0.7,0); setP(6,10,1,0.5,0); }
    // Score display (top)
    const sc=(''+p.score).padStart(5,'0');
    const digitPat={'0':[7,5,5,5,7],'1':[2,2,2,2,2],'2':[7,1,7,4,7],'3':[7,1,7,1,7],'4':[5,5,7,1,1],'5':[7,4,7,1,7],'6':[7,4,7,5,7],'7':[7,1,1,1,1],'8':[7,5,7,5,7],'9':[7,5,7,1,7]};
    for(let ci=0;ci<5;ci++){
      const rows=digitPat[sc[ci]]; if(!rows) continue;
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if((rows[r]>>(2-c))&1) setP(2+ci*4+c,63-r,WHT[0],WHT[1],WHT[2]);
    }
    // Bonus countdown
    const bonus=Math.max(0,5000-Math.floor(p.t*100)%5000);
    // "BONUS" label area (small)
    fillRect(48,60,62,63,0.5,0,0.5);
    const bonusStr=(''+bonus).padStart(4,'0');
    for(let ci=0;ci<4;ci++){
      const rows=digitPat[bonusStr[ci]]; if(!rows) continue;
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if((rows[r]>>(2-c))&1) setP(49+ci*4+c,61+Math.floor(r*0.6),CYN[0],CYN[1],CYN[2]);
    }
    // Mirror horizontally
    for(let y=0;y<S;y++) for(let x=0;x<Math.floor(S/2);x++){
      const x2=S-1-x, i1=(y*S+x)*3, i2=(y*S+x2)*3;
      const tr=buf[i1],tg=buf[i1+1],tb=buf[i1+2];
      buf[i1]=buf[i2]; buf[i1+1]=buf[i2+1]; buf[i1+2]=buf[i2+2];
      buf[i2]=tr; buf[i2+1]=tg; buf[i2+2]=tb;
    }
  } else if(game.name==='pacman'){
    const p=game;
    const YEL=[0.95,0.85,0],SCARED=[0.4,0.6,1],WHT=[1,1,1];
    const GC=[[0.85,0,0],[1,0.6,0.7],[0,0.85,0.85],[1,0.5,0]];
    if(!p.mazeInit){
      p.mazeInit=true;
      // Ghost pen: rows 7-8, cols 6-9 are open; row 6 col 7-8 is gate (open for ghosts to exit)
      p.maze=[
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,1,0,1,0,1,0,0,1,0,1,0,1,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,1,0,1,1,0,0,0,0,1,1,0,1,1,1,
        0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,
        1,1,1,0,0,1,0,0,0,0,1,0,0,1,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,1,1,0,1,0,1,1,0,1,0,1,1,0,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,1,0,1,0,1,0,1,1,0,1,0,1,0,1,1,
        1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,
        1,0,1,0,0,1,0,1,1,0,1,0,0,1,0,1,
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
      ];
      p.dots=[];
      for(let r=0;r<16;r++) for(let c=0;c<16;c++){
        if(p.maze[r*16+c]===0){
          if(r>=7&&r<=8&&c>=6&&c<=9) continue; // no dots in ghost pen
          const isPower=(r===1&&c===1)||(r===1&&c===14)||(r===14&&c===1)||(r===14&&c===14);
          p.dots.push({r,c,eaten:false,power:isPower});
        }
      }
      p.px=1.5; p.py=1.5; p.pdir=0;
      // Ghosts start in pen, released one at a time
      p.ghosts=[
        {x:7.5,y:7.5,dir:3,col:0,cd:0,inPen:true,releaseT:1,immune:false},
        {x:8.5,y:7.5,dir:3,col:1,cd:0,inPen:true,releaseT:2,immune:false},
        {x:7.5,y:8.5,dir:3,col:2,cd:0,inPen:true,releaseT:3,immune:false},
        {x:8.5,y:8.5,dir:3,col:3,cd:0,inPen:true,releaseT:4,immune:false},
      ];
      p.score=0; p.powerT=0; p.pmouth=0; p.decT=0; p.lives=3;
      p.visited=[]; // anti-loop: recently visited cells
      p.gameOverT=0; // >0 = showing GAME OVER
    }
    const mz=p.maze, cs=4;
    const mzAt=(r,c)=>{ if(r<0||r>=16) return 1; c=((c%16)+16)%16; return mz[r*16+c]; };
    const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
    const bfs=(sr,sc)=>{
      const dist=new Int16Array(256).fill(-1);
      dist[sr*16+sc]=0;
      const q=[sr*16+sc];
      let qi=0;
      while(qi<q.length){
        const idx=q[qi++], r=idx>>4, c=idx&15;
        const d=dist[idx];
        for(let i=0;i<4;i++){
          const nr=r+dirs[i][1], nc=((c+dirs[i][0])%16+16)%16;
          if(nr>=0&&nr<16&&mzAt(nr,nc)===0&&dist[nr*16+nc]<0){
            dist[nr*16+nc]=d+1; q.push(nr*16+nc);
          }
        }
      }
      return dist;
    };
    // Draw maze walls
    for(let r=0;r<16;r++) for(let c=0;c<16;c++){
      if(mz[r*16+c]===1){
        fillRect(c*cs,r*cs,c*cs+cs-1,r*cs+cs-1,0,0,0.45);
        if(r>0&&mz[(r-1)*16+c]===0) hLine(c*cs,c*cs+cs-1,r*cs,0.1,0.1,0.85);
        if(r<15&&mz[(r+1)*16+c]===0) hLine(c*cs,c*cs+cs-1,r*cs+cs-1,0.1,0.1,0.85);
        if(c>0&&mz[r*16+c-1]===0) for(let y=r*cs;y<r*cs+cs;y++) setP(c*cs,y,0.1,0.1,0.85);
        if(c<15&&mz[r*16+c+1]===0) for(let y=r*cs;y<r*cs+cs;y++) setP(c*cs+cs-1,y,0.1,0.1,0.85);
      }
    }
    // Draw ghost pen border (blue outline around pen area rows 7-8, cols 6-9)
    const penL=6*cs, penR=10*cs-1, penT=7*cs, penB=9*cs-1;
    for(let x=penL;x<=penR;x++){ setP(x,penT,0.1,0.2,0.85); setP(x,penB,0.1,0.2,0.85); }
    for(let y=penT;y<=penB;y++){ setP(penL,y,0.1,0.2,0.85); setP(penR,y,0.1,0.2,0.85); }
    // Gate (pink) at top center of pen
    hLine(7*cs,8*cs+cs-1,penT,0.9,0.5,0.7);
    // Draw dots
    for(const d of p.dots){
      if(d.eaten) continue;
      const dx=d.c*cs+Math.floor(cs/2), dy=d.r*cs+Math.floor(cs/2);
      if(d.power){
        if(Math.floor(p.t*4)%2) fillRect(dx-1,dy-1,dx+1,dy+1,1,0.8,0.6);
      } else {
        setP(dx,dy,1,0.85,0.6);
      }
    }
    const pmSpeed=7, gSpeed=5.5;
    const atCenter=(x,y)=>{const fx=x-Math.floor(x)-0.5,fy=y-Math.floor(y)-0.5;return Math.abs(fx)<0.2&&Math.abs(fy)<0.2;};
    const canMove=(r,c,d)=>{
      const nr=r+dirs[d][1], nc=((c+dirs[d][0])%16+16)%16;
      return mzAt(nr,nc)===0;
    };
    // GAME OVER state
    if(p.gameOverT>0){
      p.gameOverT-=dt;
      if(p.gameOverT<=0){
        // Restart game
        p.score=0; p.lives=3; p.powerT=0; p.visited=[];
        p.px=1.5; p.py=1.5; p.pdir=0;
        for(const d of p.dots) d.eaten=false;
        for(let i=0;i<4;i++){
          p.ghosts[i].x=7.5+(i%2); p.ghosts[i].y=7.5+Math.floor(i/2);
          p.ghosts[i].inPen=true; p.ghosts[i].releaseT=p.t+1+i; p.ghosts[i].cd=0;
        }
      } else {
        // Flash GAME OVER text
        if(Math.floor(p.gameOverT*3)%2){
          const goText='GAMEOVER';
          const gtx=Math.floor((S-goText.length*6)/2), gty=Math.floor(S/2)-3;
          drawText(goText,gtx,gty,1,0.95,0.15,0.15);
        }
      }
    }
    if(p.gameOverT<=0){
    // Anti-loop: track visited cells
    p.decT+=dt;
    if(p.decT>0.12&&atCenter(p.px,p.py)){
      p.decT=0;
      const cr=Math.floor(p.py), cc=Math.floor(p.px);
      p.visited.push(cr*16+cc);
      if(p.visited.length>20) p.visited.shift();
      // Ghost danger map
      const ghostCells=new Set();
      for(const g of p.ghosts){
        if(p.powerT>0||g.inPen) continue;
        const gr=Math.floor(g.y), gc=Math.floor(g.x);
        for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++){
          const rr=gr+dr, rc=((gc+dc)%16+16)%16;
          if(rr>=0&&rr<16) ghostCells.add(rr*16+rc);
        }
      }
      const options=[];
      for(let d=0;d<4;d++){
        if(!canMove(cr,cc,d)) continue;
        options.push(d);
      }
      if(options.length>0){
        let bestD=options[0], bestScore=-99999;
        for(const d of options){
          const nr=cr+dirs[d][1], nc=((cc+dirs[d][0])%16+16)%16;
          const stepDist=bfs(nr,nc);
          let nearDot=999;
          for(const dot of p.dots){
            if(dot.eaten) continue;
            const dd=stepDist[dot.r*16+dot.c];
            if(dd>=0&&dd<nearDot) nearDot=dd;
          }
          let score=-nearDot;
          if(ghostCells.has(nr*16+nc)) score-=50;
          if(d===(p.pdir+2)%4) score-=3;
          const visitCount=p.visited.filter(v=>v===nr*16+nc).length;
          score-=visitCount*8;
          if(p.powerT<=0&&ghostCells.size>0){
            for(const dot of p.dots){
              if(!dot.eaten&&dot.power){
                const dd=stepDist[dot.r*16+dot.c];
                if(dd>=0&&dd<4) score+=20;
              }
            }
          }
          if(score>bestScore){ bestScore=score; bestD=d; }
        }
        p.pdir=bestD;
      }
    }
    // Move pac-man
    const pnr=Math.floor(p.py+dirs[p.pdir][1]*0.6);
    const pnc=Math.floor(((p.px+dirs[p.pdir][0]*0.6)%16+16)%16);
    if(mzAt(pnr,pnc)===0){
      p.px+=dirs[p.pdir][0]*pmSpeed*dt;
      p.py+=dirs[p.pdir][1]*pmSpeed*dt;
    }
    p.px=((p.px%16)+16)%16;
    p.py=Math.max(0.5,Math.min(15.4,p.py));
    // Eat dots
    for(const d of p.dots){
      if(d.eaten) continue;
      if(Math.abs(d.c+0.5-p.px)<0.6&&Math.abs(d.r+0.5-p.py)<0.6){
        d.eaten=true; p.score+=d.power?50:10;
        if(d.power){ p.powerT=6; for(const g of p.ghosts) g.immune=false; }
      }
    }
    if(p.dots.every(d=>d.eaten)){
      for(const d of p.dots) d.eaten=false;
      p.score+=100;
    }
    if(p.powerT>0) p.powerT-=dt;
    // Ghost AI: pen release then ALL chase pac-man (flee when power active)
    for(let gi=0;gi<p.ghosts.length;gi++){
      const g=p.ghosts[gi];
      g.cd+=dt;
      if(g.inPen){
        if(p.t>=g.releaseT){
          const exitX=7.5, exitY=6.5;
          if(Math.abs(g.y-exitY)<0.3&&Math.abs(g.x-exitX)<0.5){
            g.inPen=false; g.y=exitY; g.x=exitX; g.dir=3;
          } else {
            if(Math.abs(g.x-exitX)>0.2) g.x+=(exitX>g.x?1:-1)*gSpeed*dt;
            else g.y+=(exitY>g.y?1:-1)*gSpeed*dt;
          }
        }
        continue;
      }
      const gr=Math.floor(g.y), gc=Math.floor(g.x);
      if(g.cd>0.2&&atCenter(g.x,g.y)){
        g.cd=0;
        const opts=[];
        for(let d=0;d<4;d++){
          if(d===(g.dir+2)%4) continue;
          if(canMove(gr,gc,d)) opts.push(d);
        }
        if(opts.length===0){
          for(let d=0;d<4;d++) if(canMove(gr,gc,d)) opts.push(d);
        }
        if(opts.length>0){
          if(p.powerT>0&&!g.immune){
            // FLEE from pac-man
            let bestD=opts[0], bestDist=-1;
            for(const d of opts){
              const dist=Math.abs(gc+dirs[d][0]-p.px)+Math.abs(gr+dirs[d][1]-p.py);
              if(dist>bestDist){ bestDist=dist; bestD=d; }
            }
            g.dir=bestD;
          } else {
            // ALL ghosts chase pac-man directly
            if(Math.random()<0.9){
              let bestD=opts[0], bestDist=9999;
              for(const d of opts){
                const dist=Math.abs(gc+dirs[d][0]-p.px)+Math.abs(gr+dirs[d][1]-p.py);
                if(dist<bestDist){ bestDist=dist; bestD=d; }
              }
              g.dir=bestD;
            } else {
              g.dir=opts[Math.floor(Math.random()*opts.length)];
            }
          }
        }
      }
      const sp=(p.powerT>0&&!g.immune)?gSpeed*0.5:gSpeed;
      const nx=g.x+dirs[g.dir][0]*sp*dt, ny=g.y+dirs[g.dir][1]*sp*dt;
      const nnr=Math.floor(ny), nnc=Math.floor(((nx)%16+16)%16);
      if(nnr>=0&&nnr<16&&mzAt(nnr,nnc)===0){ g.x=((nx%16)+16)%16; g.y=Math.max(0.5,Math.min(15.4,ny)); }
      else { g.cd=0.19; }
    }
    // Ghost-pacman collision
    for(const g of p.ghosts){
      if(g.inPen) continue;
      if(Math.abs(g.x-p.px)<0.7&&Math.abs(g.y-p.py)<0.7){
        if(p.powerT>0&&!g.immune){
          g.x=7.5; g.y=7.5; g.cd=0; g.inPen=true; g.releaseT=p.t+1; g.immune=true; p.score+=200;
        } else {
          p.lives--;
          if(p.lives<=0){
            p.gameOverT=3; // 3 seconds of GAME OVER
          }
          p.px=1.5; p.py=1.5; p.pdir=0; p.visited=[];
          for(let i=0;i<4;i++){
            p.ghosts[i].x=7.5+(i%2); p.ghosts[i].y=7.5+Math.floor(i/2);
            p.ghosts[i].inPen=true; p.ghosts[i].releaseT=p.t+1+i; p.ghosts[i].cd=0;
          }
          break;
        }
      }
    }
    } // end gameOverT<=0 guard
    // Draw Pac-Man
    if(p.gameOverT<=0){
    p.pmouth+=dt*12;
    const mouthAng=Math.abs(Math.sin(p.pmouth))*0.8;
    const ppx=Math.round(p.px*cs), ppy=Math.round(p.py*cs);
    for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
      if(dx*dx+dy*dy>5) continue;
      const ang=Math.atan2(dy,dx);
      const faceAng=Math.atan2(dirs[p.pdir][1],dirs[p.pdir][0]);
      let da=Math.abs(ang-faceAng); if(da>Math.PI) da=2*Math.PI-da;
      if(da<mouthAng) continue;
      setP(ppx+dx,ppy+dy,YEL[0],YEL[1],YEL[2]);
    }
    }
    // Draw ghosts
    for(const g of p.ghosts){
      const gx=Math.round(g.x*cs), gy=Math.round(g.y*cs);
      const gc2=p.powerT>0&&!g.inPen&&!g.immune?(p.powerT<2&&Math.floor(p.t*6)%2?WHT:SCARED):GC[g.col];
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
        if(dy<0&&dx*dx+dy*dy>5) continue;
        if(dy===2&&Math.abs(dx)===1) continue;
        setP(gx+dx,gy+dy,gc2[0],gc2[1],gc2[2]);
      }
      if(!g.inPen&&(p.powerT<=0||(p.powerT<2&&Math.floor(p.t*6)%2))){
        setP(gx-1,gy-1,1,1,1); setP(gx+1,gy-1,1,1,1);
        setP(gx-1+dirs[g.dir][0],gy-1+dirs[g.dir][1],0.1,0.1,0.5);
        setP(gx+1+dirs[g.dir][0],gy-1+dirs[g.dir][1],0.1,0.1,0.5);
      }
    }
    // Score top-left
    const sc2=(''+p.score).padStart(4,'0');
    const digitPat={'0':[7,5,5,5,7],'1':[2,2,2,2,2],'2':[7,1,7,4,7],'3':[7,1,7,1,7],'4':[5,5,7,1,1],'5':[7,4,7,1,7],'6':[7,4,7,5,7],'7':[7,1,1,1,1],'8':[7,5,7,5,7],'9':[7,5,7,1,7]};
    for(let ci=0;ci<4;ci++){
      const rows=digitPat[sc2[ci]]; if(!rows) continue;
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if((rows[r]>>(2-c))&1) setP(2+ci*4+c,1+r,1,1,1);
    }
    // Lives display top-right (small pac-man icons)
    for(let li=0;li<p.lives;li++){
      const lx=S-4-li*5, ly=3;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(dx===1&&dy===0) continue;
        setP(lx+dx,ly+dy,YEL[0],YEL[1],YEL[2]);
      }
    }
    // Rotate 180 degrees
    for(let i=0;i<Math.floor(S*S/2);i++){
      const j=S*S-1-i;
      const i3=i*3, j3=j*3;
      const tr=buf[i3],tg=buf[i3+1],tb=buf[i3+2];
      buf[i3]=buf[j3]; buf[i3+1]=buf[j3+1]; buf[i3+2]=buf[j3+2];
      buf[j3]=tr; buf[j3+1]=tg; buf[j3+2]=tb;
    }
  } else if(game.name==='aticatac'){
    const p=game;
    const CYN=[0,0.85,0.85],WHT=[1,1,1],YEL=[0.85,0.85,0],RED=[0.85,0,0],GRN=[0,0.85,0],MAG=[0.85,0,0.85],BLU=[0,0,0.85];
    if(p.enemies.length===0){
      for(let i=0;i<3;i++) p.enemies.push({x:10+Math.random()*44,y:10+Math.random()*44,dx:(Math.random()-0.5)*15,dy:(Math.random()-0.5)*15,col:i%3,alive:true,respawnT:0});
      p.items=[];
      for(let i=0;i<2;i++) p.items.push({x:10+Math.random()*44,y:10+Math.random()*44,type:i%3,collected:false});
    }
    // Room seed for walls
    const rm=p.room%8;
    const seed=(rm*7+13)%17;
    // Draw room - isometric-style walls in cyan
    // Floor
    for(let y=6;y<58;y++) for(let x=4;x<60;x++) setP(x,y,0,0,0.02);
    // Outer walls
    for(let i=4;i<60;i++){ setP(i,6,CYN[0],CYN[1],CYN[2]); setP(i,57,CYN[0],CYN[1],CYN[2]); setP(i,7,CYN[0],CYN[1],CYN[2]); setP(i,56,CYN[0],CYN[1],CYN[2]); }
    for(let i=6;i<58;i++){ setP(4,i,CYN[0],CYN[1],CYN[2]); setP(59,i,CYN[0],CYN[1],CYN[2]); setP(5,i,CYN[0],CYN[1],CYN[2]); setP(58,i,CYN[0],CYN[1],CYN[2]); }
    // Inner wall segments based on room
    if(seed%3===0){ for(let i=6;i<30;i++) setP(32,i,CYN[0],CYN[1],CYN[2]); }
    if(seed%3===1){ for(let i=34;i<58;i++) setP(32,i,CYN[0],CYN[1],CYN[2]); }
    if(seed%2===0){ for(let i=6;i<30;i++) setP(i,32,CYN[0],CYN[1],CYN[2]); }
    // Diagonal wall elements
    for(let d=0;d<8;d++){
      const wx=8+d*2+(seed%5)*3, wy=10+d*2+(seed%3)*4;
      if(wx>5&&wx<58&&wy>7&&wy<56) setP(wx,wy,CYN[0],CYN[1],CYN[2]);
    }
    // Doors (gaps in walls)
    const doorCols=[YEL,GRN,RED,WHT];
    const doors=[[32,6,0],[32,57,1],[4,32,2],[59,32,3]];
    for(const dr of doors){
      const dc=doorCols[dr[2]%4];
      if(dr[2]===0||dr[2]===1){ for(let dx=-2;dx<=2;dx++) for(let dy=0;dy<2;dy++) setP(dr[0]+dx,dr[1]+(dr[2]===0?dy:-dy),dc[0],dc[1],dc[2]); }
      else { for(let dy=-2;dy<=2;dy++) for(let dx=0;dx<2;dx++) setP(dr[0]+(dr[2]===2?dx:-dx),dr[1]+dy,dc[0],dc[1],dc[2]); }
    }
    // Window (checkerboard pattern)
    const winX=seed%2===0?12:48, winY=seed%3===0?14:44;
    for(let wy=0;wy<6;wy++) for(let wx=0;wx<5;wx++) if((wx+wy)%2) setP(winX+wx,winY+wy,WHT[0],WHT[1],WHT[2]);
    // Player movement
    const moveSpeed=18;
    const moveAngle=p.t*0.7+p.room*2.1;
    p.playerX=32+Math.sin(moveAngle)*20;
    p.playerY=32+Math.cos(moveAngle*0.8)*18;
    // Clamp player
    p.playerX=Math.max(8,Math.min(55,p.playerX));
    p.playerY=Math.max(10,Math.min(53,p.playerY));
    // Draw player (knight - cyan character)
    const px=Math.round(p.playerX), py=Math.round(p.playerY);
    const walkF=Math.floor(p.t*4)%2;
    // Head
    setP(px,py+4,CYN[0],CYN[1],CYN[2]); setP(px+1,py+4,CYN[0],CYN[1],CYN[2]);
    setP(px-1,py+3,CYN[0],CYN[1],CYN[2]); setP(px+2,py+3,CYN[0],CYN[1],CYN[2]);
    setP(px,py+3,CYN[0],CYN[1],CYN[2]); setP(px+1,py+3,CYN[0],CYN[1],CYN[2]);
    // Body
    setP(px,py+2,CYN[0],CYN[1],CYN[2]); setP(px+1,py+2,CYN[0],CYN[1],CYN[2]);
    setP(px,py+1,CYN[0],CYN[1],CYN[2]); setP(px+1,py+1,CYN[0],CYN[1],CYN[2]);
    // Arms
    setP(px-1,py+2,CYN[0],CYN[1],CYN[2]); setP(px+2,py+2,CYN[0],CYN[1],CYN[2]);
    // Legs
    if(walkF){ setP(px-1,py,CYN[0],CYN[1],CYN[2]); setP(px+2,py,CYN[0],CYN[1],CYN[2]); }
    else { setP(px,py,CYN[0],CYN[1],CYN[2]); setP(px+1,py,CYN[0],CYN[1],CYN[2]); }
    // Weapon (sword flashing when attacking)
    p.attackT=(p.attackT||0)+dt;
    if(Math.floor(p.t*2)%5===0){ setP(px+3,py+3,WHT[0],WHT[1],WHT[2]); setP(px+4,py+4,WHT[0],WHT[1],WHT[2]); }
    // Enemies
    const eCols=[[0.85,0,0],[0.85,0.85,0],[0,0.85,0],[0.85,0,0.85],[1,1,1]];
    for(const e of p.enemies){
      if(!e.alive){
        e.respawnT-=dt;
        if(e.respawnT<=0){ e.alive=true; e.x=10+Math.random()*44; e.y=10+Math.random()*44; }
        continue;
      }
      e.x+=e.dx*dt; e.y+=e.dy*dt;
      if(e.x<8||e.x>54){ e.dx=-e.dx; e.x=Math.max(8,Math.min(54,e.x)); }
      if(e.y<10||e.y>52){ e.dy=-e.dy; e.y=Math.max(10,Math.min(52,e.y)); }
      // Occasionally change direction
      if(Math.random()<0.01){ e.dx=(Math.random()-0.5)*18; e.dy=(Math.random()-0.5)*18; }
      const ec=eCols[e.col%5];
      const ex=Math.round(e.x), ey=Math.round(e.y);
      const ef=Math.floor(p.t*3)%2;
      if(e.col===0){
        // Spider
        setP(ex,ey+1,ec[0],ec[1],ec[2]); setP(ex+1,ey+1,ec[0],ec[1],ec[2]);
        setP(ex-1,ey,ec[0],ec[1],ec[2]); setP(ex+2,ey,ec[0],ec[1],ec[2]);
        if(ef){ setP(ex-1,ey+2,ec[0],ec[1],ec[2]); setP(ex+2,ey+2,ec[0],ec[1],ec[2]); }
        else { setP(ex-1,ey-1,ec[0],ec[1],ec[2]); setP(ex+2,ey-1,ec[0],ec[1],ec[2]); }
      } else if(e.col===1){
        // Ghost (yellow Frankenstein)
        setP(ex,ey+2,ec[0],ec[1],ec[2]); setP(ex+1,ey+2,ec[0],ec[1],ec[2]);
        setP(ex-1,ey+1,ec[0],ec[1],ec[2]); setP(ex+2,ey+1,ec[0],ec[1],ec[2]);
        setP(ex,ey+1,ec[0],ec[1],ec[2]); setP(ex+1,ey+1,ec[0],ec[1],ec[2]);
        setP(ex,ey,ec[0],ec[1],ec[2]); setP(ex+1,ey,ec[0],ec[1],ec[2]);
        if(ef) setP(ex-1,ey,ec[0],ec[1],ec[2]); else setP(ex+2,ey,ec[0],ec[1],ec[2]);
      } else {
        // Bat/devil (green/magenta)
        setP(ex,ey+1,ec[0],ec[1],ec[2]); setP(ex+1,ey+1,ec[0],ec[1],ec[2]);
        setP(ex-1,ey+2,ec[0],ec[1],ec[2]); setP(ex+2,ey+2,ec[0],ec[1],ec[2]);
        if(ef){ setP(ex-2,ey+2,ec[0],ec[1],ec[2]); setP(ex+3,ey+2,ec[0],ec[1],ec[2]); }
        setP(ex,ey,ec[0],ec[1],ec[2]); setP(ex+1,ey,ec[0],ec[1],ec[2]);
      }
      // Collision with player
      if(Math.abs(e.x-p.playerX)<4&&Math.abs(e.y-p.playerY)<4){
        p.health=Math.max(0,p.health-dt*15);
      }
    }
    // Items (keys, food)
    for(const it of p.items){
      if(it.collected) continue;
      const ix=Math.round(it.x), iy=Math.round(it.y);
      if(it.type===0){
        // Key (yellow)
        setP(ix,iy+2,YEL[0],YEL[1],YEL[2]); setP(ix+1,iy+2,YEL[0],YEL[1],YEL[2]);
        setP(ix,iy+1,YEL[0],YEL[1],YEL[2]); setP(ix,iy,YEL[0],YEL[1],YEL[2]);
        setP(ix+1,iy,YEL[0],YEL[1],YEL[2]);
      } else if(it.type===1){
        // Food (chicken leg - yellow)
        setP(ix,iy+2,YEL[0],YEL[1],YEL[2]); setP(ix+1,iy+2,YEL[0],YEL[1],YEL[2]); setP(ix+2,iy+2,YEL[0],YEL[1],YEL[2]);
        setP(ix+1,iy+1,YEL[0],YEL[1],YEL[2]); setP(ix+2,iy+1,YEL[0],YEL[1],YEL[2]);
        setP(ix+3,iy,YEL[0],YEL[1],YEL[2]);
      } else {
        // ACG key piece (green)
        fillRect(ix,iy,ix+2,iy+3,GRN[0],GRN[1],GRN[2]);
        setP(ix+1,iy+1,0,0,0);
      }
      // Pickup
      if(Math.abs(it.x-p.playerX)<4&&Math.abs(it.y-p.playerY)<4){
        it.collected=true; p.score+=100;
        if(it.type===0) p.keys++;
        if(it.type===1) p.health=Math.min(100,p.health+20);
      }
    }
    // Room transition
    p.roomT+=dt;
    if(p.roomT>6){
      p.room++; p.roomT=0;
      p.enemies.forEach(e=>{ e.x=10+Math.random()*44; e.y=10+Math.random()*44; e.alive=true; });
      p.items=[];
      for(let i=0;i<2;i++) p.items.push({x:10+Math.random()*44,y:10+Math.random()*44,type:Math.floor(Math.random()*3),collected:false});
      p.score+=50;
    }
    // HUD - Score (top-right area, red border like original)
    // Red border panel on right
    const hx=48;
    for(let hy=0;hy<6;hy++){ setP(hx,hy,RED[0],RED[1],RED[2]); setP(63,hy,RED[0],RED[1],RED[2]); }
    hLine(hx,63,0,RED[0],RED[1],RED[2]); hLine(hx,63,5,RED[0],RED[1],RED[2]);
    // Score digits
    const sc=(''+p.score).padStart(4,'0');
    const digitPat={'0':[7,5,5,5,7],'1':[2,2,2,2,2],'2':[7,1,7,4,7],'3':[7,1,7,1,7],'4':[5,5,7,1,1],'5':[7,4,7,1,7],'6':[7,4,7,5,7],'7':[7,1,1,1,1],'8':[7,5,7,5,7],'9':[7,5,7,1,7]};
    for(let ci=0;ci<4;ci++){
      const rows=digitPat[sc[ci]]; if(!rows) continue;
      for(let r=0;r<5;r++) for(let c=0;c<3;c++) if((rows[r]>>(2-c))&1) setP(hx+2+ci*4+c,1+r,WHT[0],WHT[1],WHT[2]);
    }
    // Health bar (chicken-shaped, bottom)
    const hpW=Math.round(p.health/100*52);
    hLine(6,6+hpW,59,YEL[0],YEL[1],YEL[2]);
    hLine(6,6+hpW,60,YEL[0],YEL[1],YEL[2]);
    // Sparkle effects
    for(let sp=0;sp<4;sp++){
      const sx2=Math.round(8+Math.sin(p.t*1.3+sp*1.7)*24+24);
      const sy2=Math.round(12+Math.cos(p.t*0.9+sp*2.3)*18+18);
      if(Math.floor(p.t*5+sp)%3===0) setP(sx2,sy2,1,1,1);
    }
  }
}
module.exports = { drawRetroGame };
