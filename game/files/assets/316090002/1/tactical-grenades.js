/* tacticalGrenades: Riposte: Frontline grenade logic PORTED (MIT, Copyright (c) 2026 BenDBSS, see THIRD_PARTY_NOTICES.md;
   read from NIGHT_SURVIVAL/src, never modified). Logic only: the grenade itself is a pooled placeholder box.
   Source map (NIGHT_SURVIVAL/src):
   - NADE (speed 19, up 3.2, g 15, r 0.045, carry 0.35), NADE_TYPES fuses .. 07-bots.js:407 ; 06i-armes.js:134-146
   - spawnNade / updateNades (sub-stepped flight, ground + box bounce, body bounce, rolling friction, sleep) 07-bots.js:427, 534-602
   - nadeHit (restitution 0.42 wall / 0.38 hard / 0.2 soft, Coulomb friction) .. 07-bots.js:522-533
   - explode (LOS to chest OR head, dmg = max*(1-d/r)^1.1 + 12, roof shielding roofK, no friendly damage) 07-bots.js:703-731
   - flashBang / flashSeen (distance + facing, blocked by walls and smoke) ... 07-bots.js:615-651
   - smokeStart / smokeR / updateSmokes / smokeBlocks (3.6 m cloud, 15 s) ... 07-bots.js:663-700
   - botThrowNade (ballistic solver) / botNadeClear (two-segment arc check) 07-bots.js:507-521 ; 07e-humain.js:179-182
   - bot use: smoke when wounded under fire, frag/flash to flush a target that just broke LOS or holds still 07b-tactics.js:231-246
   - botFlee (8 directions, room to move, never toward the grenade) .......... 07e-humain.js:185-195
   - cookNade / releaseNade / nadeLaunch / throwNadeNow / nadeArcUpdate (pin 0.24 s, cook, arc 60 pts @ 1/30 s) 08-player.js:178-264
   DREADING glue: world collisions = TacticalCommon.rayWorld (same blockers as sight/shots) + navmesh height for the ground;
   damage = tacticalCombat.applyDamage; blast visuals = DreadingExplosionFX (pooled flipbook) with the NS particle fallback;
   smoke = the plume pool (DreadingExplosionFX.smoke) + NS soft puffs; smoke blocks Yuka vision (tactical-perception.js).
   New AI glue: frag on a zombie cluster (3+ within 3.5 m of a point 10-24 m away, no friendly within 5 m of it). */
var TacticalGrenades=pc.createScript('tacticalGrenades');
TacticalGrenades.NADE={speed:19,up:3.2,g:15,r:0.045,carry:0.35};
TacticalGrenades.TYPES={frag:{fuse:3.5,cook:true,radius:7.5,dmg:150},flash:{fuse:1.5},smoke:{fuse:1.6}};
TacticalGrenades.FLASH={r:18,near:3.5,max:3,back:0.2,min:0.05,peak:0.92};
TacticalGrenades.SMOKE={r:3.6,grow:1.8,life:15,fade:3,every:0.11};
TacticalGrenades.ANIM={pin:0.24};
TacticalGrenades.ARC={n:60,dt:1/30,gap:0.7};
TacticalGrenades.INV={friendly:{frag:2,smoke:1,flash:1},enemy:{frag:1,smoke:1,flash:0}};
TacticalGrenades.ORDER=['frag','smoke','flash'];
(function(){
var TG=TacticalGrenades,C=function(){return TacticalCommon;},NSf=function(){return TacticalNS;};
function hyp3(x,y,z){return Math.sqrt(x*x+y*y+z*z);}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function smoothstep(a,b,t){t=clamp((t-a)/(b-a),0,1);return t*t*(3-2*t);}
function lerp(a,b,t){return a+(b-a)*t;}
TG.prototype.initialize=function(){var T=C().ns(this.app);T.grenades=this;this.nades=[];this.smokes=[];this.counters={thrown:0,botThrown:0,frag:0,flash:0,smoke:0,blinded:0,flee:0,hits:0,kills:0,bounces:0};
 this.pool=[];var mat=new pc.StandardMaterial();mat.diffuse=new pc.Color(0.3,0.32,0.2);mat.emissive=new pc.Color(0.08,0.09,0.05);mat.update();this.mat=mat;
 for(var i=0;i<12;i++){var e=new pc.Entity('grenade '+i);e.addComponent('render',{type:'box',material:mat,castShadows:false,receiveShadows:false});e.setLocalScale(0.07,0.09,0.07);e.enabled=false;(T.root||this.app.root).addChild(e);this.pool.push(e);}
 /* compile the placeholder shader at load (Riposte nadeWarm): one box under the ground for the first frames */
 this.pool[0].setPosition(0,-40,0);this.pool[0].enabled=true;this.warmFrames=3;
 this.on('destroy',function(){this.pool.forEach(function(e){e.destroy();});});};
TG.prototype.reset=function(){this.nades.forEach(function(n){if(n.e)n.e.enabled=false;});this.nades.length=0;this.smokes.length=0;};
TG.prototype.blockers=function(){var T=C().ns(this.app);return T.perception?T.perception.blockers:[];};
TG.prototype.giveInventory=function(s){var inv=TG.INV[s.team==='friendly'?'friendly':'enemy'];s.nadeInv=Object.assign({},inv);s.nadeCd=6+(s.uid||0)*1.5;s.throwT=0;s.standT=0;s.nadeSel=s.nadeSel||'frag';};
/* ---------- ground: navmesh height under the point (cached per 0.25 m), else the 0 plane ---------- */
TG.prototype.groundAt=function(n,p){var T=C().ns(this.app);
 if(n&&n.gq&&Math.abs(n.gq[0]-p[0])<0.25&&Math.abs(n.gq[2]-p[2])<0.25&&p[1]>=n.gq[3]-0.3&&p[1]<=n.gq[3]+3)return n.gq[1];
 var g=0;if(T.navigation&&T.navigation.nearest){var q=null;try{q=T.navigation.nearest([p[0],p[1]-1,p[2]],{x:0.2,y:2.2,z:0.2});}catch(e){}if(q&&q[1]<=p[1]+0.35&&Math.abs(q[0]-p[0])<0.3&&Math.abs(q[2]-p[2])<0.3)g=q[1];}
 if(n)n.gq=[p[0],g,p[2],p[1]];return g;};
/* ---------- spawn (spawnNade) ---------- */
TG.prototype.spawn=function(owner,p,v,fuse,type){var e=null;for(var i=0;i<this.pool.length;i++){if(!this.pool[i].enabled||(i===0&&this.warmFrames>0)){e=this.pool[i];break;}}
 if(!e){var old=this.nades.shift();if(old){e=old.e;}}
 if(e){this.warmFrames=0;e.enabled=true;e.setPosition(p[0],p[1],p[2]);}
 var n={owner:owner,type:TG.TYPES[type]?type:'frag',p:p.slice(),v:v.slice(),fuse:fuse,e:e,age:0,still:0,asleep:false,fled:new Set(),rot:0};
 this.nades.push(n);this.counters.thrown++;this.counters[n.type]++;
 var T=C().ns(this.app);if(T.events)T.events.push({time:+T.elapsed.toFixed(2),soldier:owner?owner.soldierName:'-',decision:'threw '+n.type});
 return n;};
/* nadeHit (07-bots.js:522): damped bounce + Coulomb friction; returns the normal speed at impact */
TG.prototype.hit=function(n,nx,ny,nz,soft,wall){var v=n.v,vn=-(v[0]*nx+v[1]*ny+v[2]*nz);if(vn<=0)return 0;
 var e=wall?0.42:soft?0.2:0.38,mu=soft?0.6:0.35;
 var tx=v[0]+vn*nx,ty=v[1]+vn*ny,tz=v[2]+vn*nz,tl=hyp3(tx,ty,tz);
 var k=tl>1e-6?Math.max(0,tl-mu*(1+e)*vn)/tl*(wall?0.85:soft?0.65:0.8):0;
 v[0]=tx*k+nx*vn*e;v[1]=ty*k+ny*vn*e;v[2]=tz*k+nz*vn*e;if(vn>2.2)this.counters.bounces++;return vn;};
function roll(n,h,soft){n.v[1]=0;var hs=Math.hypot(n.v[0],n.v[2]),nh=Math.max(0,hs-(soft?10:6)*h);if(hs>1e-4){n.v[0]*=nh/hs;n.v[2]*=nh/hs;}if(nh<0.12){n.v[0]=n.v[2]=0;n.still+=h;}else n.still=0;}
/* updateNades (07-bots.js:534) */
TG.prototype.step=function(n,dt){var NADE=TG.NADE,R=NADE.r,T=C().ns(this.app),bl=this.blockers();
 n.age+=dt;n.fuse-=dt;
 if(!n.asleep){var sp=hyp3(n.v[0],n.v[1],n.v[2]),steps=clamp(Math.ceil(sp*dt/0.07),1,10),h=dt/steps;
  for(var s=0;s<steps;s++){var px=n.p[0],py=n.p[1],pz=n.p[2];
   n.v[1]-=NADE.g*h;n.p[0]+=n.v[0]*h;n.p[1]+=n.v[1]*h;n.p[2]+=n.v[2]*h;
   /* boxes (walls, floors, roofs, crates): swept segment against the sight blockers */
   var dx=n.p[0]-px,dy=n.p[1]-py,dz=n.p[2]-pz,L=hyp3(dx,dy,dz);
   if(L>1e-6){var w=C().rayWorld([px,py,pz],[dx/L,dy/L,dz/L],L+R,bl);
    if(w){var t=Math.max(0,w.t-R-0.002);n.p[0]=px+dx/L*t;n.p[1]=py+dy/L*t;n.p[2]=pz+dz/L*t;var wall=Math.abs(w.n[1])<0.5;this.hit(n,w.n[0],w.n[1],w.n[2],false,wall);if(!wall&&w.n[1]>0&&n.v[1]<0.9)roll(n,h,false);}}
   /* ground */
   var gy=this.groundAt(n,n.p);
   if(n.p[1]<gy+R){n.p[1]=gy+R;this.hit(n,0,1,0,false,false);if(n.v[1]<0.9)roll(n,h,false);}
   /* bodies (not the thrower for 0.35 s) */
   var list=T.squad.concat(T.zombies||[]);
   for(var j=0;j<list.length;j++){var o=list[j];if(!o.alive||(o===n.owner&&n.age<0.35))continue;var op=o.pos(),ex=n.p[0]-op[0],ez=n.p[2]-op[2],d2=ex*ex+ez*ez;
    if(d2>0.16||n.p[1]<op[1]||n.p[1]>op[1]+((o.crouchAmt||0)>0.5?1.15:1.75))continue;var d=Math.sqrt(d2)||0.01,nx=ex/d,nz=ez/d;
    n.p[0]=op[0]+nx*0.4;n.p[2]=op[2]+nz*0.4;if(o.vel){n.v[0]+=o.vel[0]*0.3;n.v[2]+=o.vel[1]*0.3;}this.hit(n,nx,0,nz,true,true);}}
  if(n.still>0.5){n.asleep=true;n.v[0]=n.v[1]=n.v[2]=0;}}
 if(n.e){n.e.setPosition(n.p[0],n.p[1],n.p[2]);if(!n.asleep){n.rot+=dt*400;n.e.setEulerAngles(n.rot,n.rot*0.7,0);}}
 if(n.type==='frag'&&n.fuse<2.6&&!n.fleeDone)this.warn(n);
 if(n.fuse<=0){this.burst(n);return false;}return true;};
TG.prototype.update=function(dt){var T=C().ns(this.app);if(this.warmFrames>0&&--this.warmFrames===0&&!this.nades.some(function(n){return n.e===this.pool[0];},this))this.pool[0].enabled=false;
 if(!T.ready||T.paused)return;dt=Math.min(dt,0.05);
 for(var i=this.nades.length-1;i>=0;i--){var n=this.nades[i];if(!this.step(n,dt)){if(n.e)n.e.enabled=false;this.nades.splice(i,1);}}
 this.updateSmokes(dt);
 var I=T.input;if(I&&I.fps)this.playerTick(dt,I);else if(this.arcOn)this.arcOn=false;};
/* ---------- effects by type (nadeBurst) ---------- */
TG.prototype.burst=function(n){if(n.type==='flash')this.flashBang(n.p,n.owner);else if(n.type==='smoke')this.smokeStart(n.p,n.owner);else{var F=TG.TYPES.frag;this.explode(n.p,n.owner,'Grenade',F.radius,F.dmg);}};
TG.prototype.roofAbove=function(x,y,z,h){return !!C().rayWorld([x,y,z],[0,1,0],h,this.blockers());};
TG.prototype.losClear=function(a,b){var T=C().ns(this.app);return !(T.perception&&T.perception.blocked(a,b));};
/* explode (07-bots.js:703): LOS from 0.35 m above the blast to chest or head, Riposte falloff, roofK = share received under a roof
   for a blast in the open (found artillery / mortar shells); allies of the owner are not hurt (Riposte rule) */
TG.prototype.explode=function(p,owner,name,radius,maxDmg,roofK,fxRadius){var T=C().ns(this.app),NS=NSf(),now=T.elapsed,self=this,hits=[];
 if(globalThis.DreadingNight)globalThis.DreadingNight.flash([p[0],p[1]+.35,p[2]],Math.max(12,radius*2),.6);
 var XF=typeof window!=='undefined'?window.DreadingExplosionFX:null,shown=false;
 if(XF&&XF.ready){try{shown=!!XF.spawn([p[0],p[1],p[2]],fxRadius||Math.max(2.5,radius*0.45));}catch(e){}}
 if(!shown&&T.combat&&T.combat.fx){var fx=T.combat.fx;NS.impactFx(fx,p,[0,1,0],true);for(var i=0;i<10;i++)fx.smoke.spawn(p[0],p[1]+0.3,p[2],(Math.random()-0.5)*4,Math.random()*2+0.5,(Math.random()-0.5)*4,2.5,0.6,3.2,0.35,0.33,0.3,0.7,0,0,1.2);}
 var c=[p[0],p[1]+0.35,p[2]],open=roofK!==undefined&&roofK!==null&&!this.roofAbove(p[0],p[1]+0.5,p[2],30);
 var list=T.squad.concat(T.zombies||[]);
 list.forEach(function(e){if(!e.alive)return;if(owner&&e!==owner&&!e.isZombie&&!owner.isZombie&&e.team===owner.team)return;
  var ch=NS.entChest(e),d=hyp3(ch[0]-c[0],ch[1]-c[1],ch[2]-c[2]);if(d>radius)return;var hd=NS.entHead(e);
  if(!self.losClear(c,ch)&&!self.losClear(c,hd))return;
  var dmg=maxDmg*Math.pow(1-d/radius,1.1)+12;if(open&&self.roofAbove(hd[0],hd[1]+0.1,hd[2],30))dmg*=roofK;
  var dir=[ch[0]-c[0],ch[1]-c[1],ch[2]-c[2]],dl=hyp3(dir[0],dir[1],dir[2])||1;dir=[dir[0]/dl,dir[1]/dl,dir[2]/dl];
  hits.push({name:e.soldierName||('zombie '+(e.uid||'')),dmg:+dmg.toFixed(1),d:+d.toFixed(2)});
  if(T.combat){var was=e.alive;T.combat.applyDamage(e,dmg,owner&&owner.alive!==undefined?owner:null,'body',dir);self.counters.hits++;if(was&&!e.alive)self.counters.kills++;}});
 /* suppression + hearing: everyone within 2 radii ducks; zombies and enemies hear it */
 T.squad.forEach(function(e){if(!e.alive)return;var q=e.pos(),d=Math.hypot(q[0]-p[0],q[2]-p[2]);if(d<radius*2){e.suppr=Math.min(1.5,(e.suppr||0)+0.6*(1-d/(radius*2)));e.lastSupprT=now;}
  if(owner&&T.perception&&e.team!==owner.team&&!owner.isZombie&&d<40)T.perception.sense(e,owner,now,4);});
 if(T.zombieMgr&&T.zombieMgr.hear){try{T.zombieMgr.hear(p,owner||null,now,70);}catch(e){}}
 T.noise={p:p.slice(),t:now,r:70,team:owner?owner.team:'',who:'explosion'};
 this.lastBlast={p:p.slice(),t:now,hits:hits,open:open,name:name};
 // Visual spawning does not dispatch building damage. Apply the same blast once, separately.
 if(T.town&&T.town.carentan&&typeof DreadingMap!=='undefined'&&DreadingMap.explode)DreadingMap.explode(T.town,p,radius,maxDmg);
 return hits;};
/* flashSeen / flashBang (07-bots.js:612-651) */
TG.prototype.flashSeen=function(p,eye,f){var F=TG.FLASH,dx=p[0]-eye[0],dy=p[1]-eye[1],dz=p[2]-eye[2],d=hyp3(dx,dy,dz);
 if(d>F.r||!this.losClear(eye,p)||this.smokeBlocks(eye,p))return 0;
 var face=(dx*f[0]+dy*f[1]+dz*f[2])/(d||1),look=lerp(F.back,1,smoothstep(-0.2,0.75,face));return (1-smoothstep(F.near,F.r,d))*look;};
TG.prototype.flashBang=function(p,owner){var T=C().ns(this.app),NS=NSf(),F=TG.FLASH,q=[p[0],p[1]+0.15,p[2]],now=T.elapsed,self=this,out=[];
 if(T.combat&&T.combat.fx){var fx=T.combat.fx;fx.flash.spawn(q[0],q[1],q[2],0,0,0,0.12,2.2,3.2,3,3,3,1,0);for(var i=0;i<6;i++)fx.smoke.spawn(q[0],q[1],q[2],Math.random()*2-1,0.3+Math.random()*0.7,Math.random()*2-1,1.2+Math.random()*0.8,0.4,1.4,0.8,0.8,0.8,0.35,0,0,1.5);}
 T.squad.forEach(function(b){if(!b.alive)return;var eye=NS.entEye(b),f=NS.fwd(b.lookYaw,b.pitch||0),k=self.flashSeen(q,eye,f);
  if(b.controlled&&T.input&&T.input.fps&&T.input.fps.s===b){if(k>F.min){var dur=F.max*k,I=clamp(0.15+0.85*k,0,F.peak);T.input.flashed={t:dur,d:dur,i:I};}out.push({name:b.soldierName,k:+k.toFixed(2),player:true});return;}
  if(k<=0.12)return;b.blindT=Math.max(b.blindT||0,now+F.max*k);b.input.fire=false;self.counters.blinded++;out.push({name:b.soldierName,k:+k.toFixed(2),until:+b.blindT.toFixed(2)});});
 if(owner&&T.perception)T.squad.forEach(function(e){if(e.alive&&e.team!==owner.team&&Math.hypot(e.pos()[0]-p[0],e.pos()[2]-p[2])<30)T.perception.sense(e,owner,now,4);});
 if(T.zombieMgr&&T.zombieMgr.hear){try{T.zombieMgr.hear(p,owner||null,now,50);}catch(e){}}
 this.lastFlash={p:q,t:now,blinded:out};return out;};
/* smoke (07-bots.js:663-700) */
TG.prototype.smokeR=function(s){var S=TG.SMOKE;return S.r*smoothstep(0,S.grow,s.t)*(1-smoothstep(S.life-S.fade,S.life,s.t)*0.6);};
TG.prototype.smokeStart=function(p,owner){var g=this.groundAt(null,[p[0],p[1]+0.3,p[2]]),c=[p[0],Math.max(g,p[1]-0.3),p[2]],T=C().ns(this.app);
 var s={p:c,t:0,emitT:0,owner:owner};this.smokes.push(s);
 var XF=typeof window!=='undefined'?window.DreadingExplosionFX:null;if(XF&&XF.ready&&XF.smoke){try{s.plume=XF.smoke(c,{size:(typeof DreadingLook!=='undefined'&&DreadingLook.on)?Math.max(7,TG.SMOKE.r*2.6):7,life:TG.SMOKE.life-3});/* look spec 4: plume as wide as the AI sight block (r) so it hides what the AI treats as hidden */}catch(e){}}
 if(T.combat&&T.combat.fx){var fx=T.combat.fx;for(var i=0;i<14;i++){var a=Math.random()*6.283,sp=2+Math.random()*2;fx.smoke.spawn(c[0],c[1]+0.4,c[2],Math.cos(a)*sp,0.4+Math.random(),Math.sin(a)*sp,3+Math.random(),1.2,3.2,0.82,0.82,0.8,0.9,0,0,1.4);}}
 return s;};
TG.prototype.updateSmokes=function(dt){var S=TG.SMOKE,T=C().ns(this.app),fx=T.combat&&T.combat.fx;
 for(var i=this.smokes.length-1;i>=0;i--){var s=this.smokes[i];s.t+=dt;if(s.t>S.life){if(s.plume&&window.DreadingExplosionFX&&window.DreadingExplosionFX.stopSmoke)try{window.DreadingExplosionFX.stopSmoke(s.plume);}catch(e){}this.smokes.splice(i,1);continue;}
  if((s.emitT-=dt)>0||s.t>S.life-2||!fx)continue;s.emitT=S.every;var R=Math.max(1,this.smokeR(s)),a=Math.random()*6.283,r=Math.sqrt(Math.random())*R*0.85;
  var x=s.p[0]+Math.cos(a)*r,z=s.p[2]+Math.sin(a)*r,y=s.p[1]+0.3+Math.random()*(R*0.85-0.3),c=0.74+Math.random()*0.12;
  if(!this.losClear([s.p[0],s.p[1]+0.6,s.p[2]],[x+Math.cos(a)*1.3,y,z+Math.sin(a)*1.3]))continue;
  fx.smoke.spawn(x,y,z,Math.random()*0.5-0.25,0.05+Math.random()*0.2,Math.random()*0.5-0.25,3.5+Math.random()*1.5,2.4+Math.random()*0.8,3.2+Math.random(),c,c,c*0.98,0.85,0,0,0.6);}};
/* smokeBlocks (07-bots.js:690): true if a cloud (ellipsoid centred 1.4 m up) cuts segment a-b */
TG.prototype.smokeBlocks=function(a,b){for(var i=0;i<this.smokes.length;i++){var s=this.smokes[i],R=this.smokeR(s)*0.9;if(R<0.8)continue;
  var cx=s.p[0],cy=s.p[1]+1.4,cz=s.p[2],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],L2=dx*dx+dy*dy+dz*dz;
  var u=L2>1e-6?clamp(((cx-a[0])*dx+(cy-a[1])*dy+(cz-a[2])*dz)/L2,0,1):0,ex=a[0]+dx*u-cx,ey=a[1]+dy*u-cy,ez=a[2]+dz*u-cz;
  if(ex*ex+ey*ey*0.6+ez*ez<R*R)return true;}return false;};
/* in-smoke veil for the first-person camera (smokeView) */
TG.prototype.smokeView=function(c){var k=0;for(var i=0;i<this.smokes.length;i++){var s=this.smokes[i],R=this.smokeR(s);if(R<0.5)continue;var d=hyp3(c[0]-s.p[0],(c[1]-s.p[1]-1.4)*0.8,c[2]-s.p[2]);k=Math.max(k,1-smoothstep(R*0.45,R*1.05,d));}return k;};
/* ---------- bots (botThrowNade / botNadeClear / 07b-tactics.js:231-246 / botFlee) ---------- */
TG.prototype.solve=function(eye,target,fuseType){var NADE=TG.NADE,dx=target[0]-eye[0],dz=target[2]-eye[2],d=Math.hypot(dx,dz)||0.01;
 var vt=clamp(d*0.9,8,19),tt=d/vt,vy=((target[1]-eye[1])+0.5*NADE.g*tt*tt)/tt;return [dx/d*vt,clamp(vy,2,13),dz/d*vt];};
TG.prototype.nadeClear=function(b,t){var e=NSf().entEye(b),a=[(e[0]+t[0])/2,Math.max(e[1],t[1])+2.2,(e[2]+t[2])/2];return this.losClear(e,a)&&this.losClear(a,[t[0],t[1]+0.6,t[2]]);};
TG.prototype.botThrow=function(b,target,type){var eye=NSf().entEye(b),v=this.solve(eye,target),fu=Math.max(0.6,TG.TYPES[type].fuse-0.3);
 var n=this.spawn(b,eye,v,fu,type);b.nadeInv[type]--;b.throwT=0.7;b.tossUntil=C().ns(this.app).elapsed+0.9;this.counters.botThrown++;
 C().log(this.app,b,'Grenade out: '+type);return n;};
TG.prototype.friendlyNear=function(b,pt,r){var T=C().ns(this.app);return T.squad.some(function(o){return o.alive&&o!==b&&o.team===b.team&&Math.hypot(o.pos()[0]-pt[0],o.pos()[2]-pt[2])<r;});};
TG.prototype.botConsider=function(b,best,vis,now,dt){var T=C().ns(this.app),inv=b.nadeInv,R=C().random;if(!inv||b.controlled||!C().AI.on)return null;
 b.nadeCd-=dt;b.throwT-=dt;var Tg=best&&best.alive?best:null,me=b.pos(),out=null;
 var tp=Tg?Tg.pos():null,d=tp?Math.hypot(tp[0]-me[0],tp[2]-me[2]):0;
 b.standT=vis&&Tg&&!Tg.isZombie&&!Tg.moving&&(Tg.speedNow||0)<1.2?(b.standT||0)+dt:0;
 var rec=b.lastTgt&&b.memory&&b.memory.hasRecord&&b.memory.hasRecord(b.lastTgt)?b.memory.getRecord(b.lastTgt):null;
 if(b.nadeCd<=0&&b.throwT<=0&&!(b.blindT>now)){
  if(inv.smoke>0&&vis&&Tg&&!Tg.isZombie&&b.health<55&&d>8&&d<40){var k=Math.min(6,d*0.4)/d,pt=[me[0]+(tp[0]-me[0])*k,me[1],me[2]+(tp[2]-me[2])*k];
   if(this.nadeClear(b,pt)){out=this.botThrow(b,pt,'smoke');b.nadeCd=C().rand(14,24);}}
  else if(inv.frag>0||inv.flash>0){var ty=inv.frag>0?'frag':'flash';
   if(b.wasVis&&!vis&&b.lastTgt&&b.lastTgt.alive&&!b.lastTgt.isZombie&&now-b.lastVisT<0.8&&rec){var lk=rec.lastSensedPosition,nd=Math.hypot(lk[0]-me[0],lk[2]-me[2]);
    if(nd>8&&nd<24&&R()<0.6&&!this.friendlyNear(b,lk,5)&&this.nadeClear(b,lk)){out=this.botThrow(b,lk,ty);b.nadeCd=C().rand(12,24);}}
   else if(vis&&Tg&&!Tg.isZombie&&b.standT>3.5&&d>10&&d<24&&!this.friendlyNear(b,tp,5)&&this.nadeClear(b,tp)){out=this.botThrow(b,tp,ty);b.nadeCd=C().rand(12,24);b.standT=0;}
   else if(inv.frag>0&&T.zombies&&T.zombies.length&&(b.zCheckT=(b.zCheckT||0)-dt)<=0){b.zCheckT=0.5;var pt2=this.zombieCluster(b,me);
    if(pt2&&this.nadeClear(b,pt2)){out=this.botThrow(b,pt2,'frag');b.nadeCd=C().rand(10,18);}}}}
 b.wasVis=vis;if(vis&&Tg){b.lastTgt=Tg;b.lastVisT=now;}
 return out;};
/* new glue: 3+ live zombies within 3.5 m of one of them, 10-24 m from me, no friendly within 5 m of the point */
TG.prototype.zombieCluster=function(b,me){var T=C().ns(this.app),zs=T.zombies,best=null,bn=2;
 for(var i=0;i<zs.length;i++){var z=zs[i];if(!z.alive)continue;var p=z.pos(),d=Math.hypot(p[0]-me[0],p[2]-me[2]);if(d<10||d>24)continue;var n=0;
  for(var j=0;j<zs.length;j++){var o=zs[j];if(o.alive&&Math.hypot(o.pos()[0]-p[0],o.pos()[2]-p[2])<3.5)n++;}if(n>bn){bn=n;best=p;}}
 if(!best||this.friendlyNear(b,best,5))return null;return best.slice();};
/* botFlee: soldiers (not the player) within 6 m of a frag that will burst soon move 5 m away, picking a direction with room */
TG.prototype.warn=function(n){var T=C().ns(this.app),self=this;n.fleeDone=true;var p=n.p;
 T.squad.forEach(function(b){if(!b.alive||b.controlled||b.disabled)return;var q=b.pos(),ax=q[0]-p[0],az=q[2]-p[2],al=Math.hypot(ax,az)||1;if(al>6||Math.abs(q[1]-p[1])>3)return;
  var bestS=-1e9,bx=ax/al,bz=az/al;
  for(var k=0;k<8;k++){var a=k*0.7854,dx=Math.cos(a),dz=Math.sin(a),away=(dx*ax+dz*az)/al;if(away<-0.2)continue;
   var w=C().rayWorld([q[0],q[1]+0.5,q[2]],[dx,0,dz],5,self.blockers()),room=w?w.t:5,sc=room*0.7+away*3+(room>3.5?1:0);if(sc>bestS){bestS=sc;bx=dx;bz=dz;}}
  var dest=[q[0]+bx*5,q[1],q[2]+bz*5],qn=T.navigation&&T.navigation.nearest?T.navigation.nearest(dest,{x:1.5,y:2,z:1.5}):dest;
  if(qn&&b.moveTo&&b.moveTo(qn,'Grenade! moving away')){b.fleeUntil=T.elapsed+2.5;self.counters.flee++;}});};
/* ---------- player (cookNade / releaseNade / nadeLaunch / throwNadeNow / nadeArcUpdate) ---------- */
TG.prototype.cook=function(I){var s=I.fps&&I.fps.s;if(!s||!s.nadeInv)return false;var ty=s.nadeSel||'frag';if(!(s.nadeInv[ty]>0)){var o=TG.ORDER.filter(function(k){return s.nadeInv[k]>0;});if(!o.length)return false;ty=s.nadeSel=o[0];}
 if(this.held)return false;this.held={t:0,type:ty,queued:false};return true;};
TG.prototype.release=function(I){if(!this.held)return null;if(this.held.t<TG.ANIM.pin){this.held.queued=true;return null;}return this.throwNow(I);};
TG.prototype.launch=function(I){var f=I.fps,s=f.s,NS=NSf(),T=C().ns(this.app),cp=Math.cos(f.pitch),fw=[-Math.sin(f.yaw)*cp,Math.sin(f.pitch),-Math.cos(f.yaw)*cp];
 var cam=T.camera.getPosition(),c=[cam.x,cam.y,cam.z],rt=NS.fwd(f.yaw-Math.PI/2,0),want=[c[0]+fw[0]*0.5+rt[0]*0.08,c[1]+fw[1]*0.5+0.08,c[2]+fw[2]*0.5+rt[2]*0.08];
 var to=[want[0]-c[0],want[1]-c[1],want[2]-c[2]],len=hyp3(to[0],to[1],to[2]);to=[to[0]/len,to[1]/len,to[2]/len];var h=C().rayWorld(c,to,len+0.1,this.blockers());
 var p=h?[c[0]+to[0]*Math.max(0.05,h.t-0.12),c[1]+to[1]*Math.max(0.05,h.t-0.12),c[2]+to[2]*Math.max(0.05,h.t-0.12)]:want;
 var fl=Math.hypot(fw[0],fw[2])||1,fx=fw[0]/fl,fz=fw[2]/fl,ahead=Math.max(0,(s.vel?s.vel[0]*fx+s.vel[1]*fz:0))*TG.NADE.carry;
 var v=[fw[0]*TG.NADE.speed+fx*ahead,fw[1]*TG.NADE.speed+TG.NADE.up+Math.max(0,f.vy||0)*0.5,fw[2]*TG.NADE.speed+fz*ahead];return {p:p,v:v};};
TG.prototype.throwNow=function(I){var H=this.held;this.held=null;var s=I.fps.s,L=this.launch(I),ty=H.type,fuse=Math.max(0.1,TG.TYPES[ty].fuse-(TG.TYPES[ty].cook?Math.max(0,H.t-TG.ANIM.pin):0));
 s.nadeInv[ty]--;var n=this.spawn(s,L.p,L.v,fuse,ty);this.arcOn=false;return n;};
TG.prototype.playerTick=function(dt,I){var H=this.held,s=I.fps.s;if(!H){this.arcOn=false;return;}H.t+=dt;
 if(H.queued&&H.t>=TG.ANIM.pin){this.throwNow(I);return;}
 /* cooked to zero in hand: it goes off at the feet (Riposte: dropped with the fuse running) */
 if(TG.TYPES[H.type].cook&&H.t-TG.ANIM.pin>=TG.TYPES[H.type].fuse){this.held=null;var p=s.pos();this.spawn(s,[p[0],p[1]+0.3,p[2]],[0,0,0],0,H.type);s.nadeInv[H.type]--;return;}
 this.arc(I);};
/* aim arc: same launch + gravity as the throw, a dot every 0.7 m up to the first impact, a ring where it lands (app.drawLine, no new materials) */
TG.prototype.arc=function(I){var A=TG.ARC,L=this.launch(I),p=L.p.slice(),v=L.v.slice(),R=TG.NADE.r,bl=this.blockers(),pts=[],run=A.gap*0.6,hit=null,g=TG.NADE.g;
 for(var i=0;i<A.n*2&&!hit;i++){var q=p.slice();v[1]-=g*A.dt/2;p[0]+=v[0]*A.dt/2;p[1]+=v[1]*A.dt/2;p[2]+=v[2]*A.dt/2;var dx=p[0]-q[0],dy=p[1]-q[1],dz=p[2]-q[2],l=hyp3(dx,dy,dz);run+=l;
  var w=l>1e-6?C().rayWorld(q,[dx/l,dy/l,dz/l],l+R,bl):null;if(w){var t=Math.max(0,w.t-R);p=[q[0]+dx/l*t,q[1]+dy/l*t,q[2]+dz/l*t];hit={p:p,n:w.n};break;}
  var gy=this.groundAt(null,p);if(p[1]<gy+R){p[1]=gy+R;hit={p:p,n:[0,1,0]};break;}
  if(run>=A.gap&&pts.length<A.n){pts.push(p.slice());run=0;}}
 this.arcOn=true;this.arcPts=pts;this.arcHit=hit;
 var app=this.app,a=new pc.Vec3(),b=new pc.Vec3(),col=new pc.Color(1,0.95,0.78);
 for(var j=0;j<pts.length;j++){var P=pts[j];a.set(P[0]-0.04,P[1],P[2]);b.set(P[0]+0.04,P[1],P[2]);app.drawLine(a,b,col,true);a.set(P[0],P[1]-0.04,P[2]);b.set(P[0],P[1]+0.04,P[2]);app.drawLine(a,b,col,true);}
 if(hit){var rc=new pc.Color(1,0.83,0.42),n=hit.n,u=Math.abs(n[1])>0.5?[1,0,0]:[0,1,0],w2=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
  for(var k=0;k<20;k++){var t0=k/20*6.283,t1=(k+1)/20*6.283,r=0.6;a.set(hit.p[0]+(u[0]*Math.cos(t0)+w2[0]*Math.sin(t0))*r,hit.p[1]+0.03+(u[1]*Math.cos(t0)+w2[1]*Math.sin(t0))*r,hit.p[2]+(u[2]*Math.cos(t0)+w2[2]*Math.sin(t0))*r);
   b.set(hit.p[0]+(u[0]*Math.cos(t1)+w2[0]*Math.sin(t1))*r,hit.p[1]+0.03+(u[1]*Math.cos(t1)+w2[1]*Math.sin(t1))*r,hit.p[2]+(u[2]*Math.cos(t1)+w2[2]*Math.sin(t1))*r);app.drawLine(a,b,rc,true);}}
 return {pts:pts,hit:hit};};
})();
