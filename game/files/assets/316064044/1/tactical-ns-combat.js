/* TacticalNS (library, no script type): combat code PORTED from NIGHT_SURVIVAL (the user's own game; read-only
   reference C:\Users\Cjbre\Downloads\NIGHT_SURVIVAL\src). three.js -> PlayCanvas: THREE.Vector3 -> [x,y,z] arrays,
   THREE.Points/Mesh -> camera-facing quads in a dynamic pc.Mesh, Math.random() -> seeded TacticalCommon.random().
   Source map (file:lines in NIGHT_SURVIVAL/src):
   - M4 numbers ............................ 06i-armes.js:29-31 (rpm, dmg, range, head/legs, mag, reload, spread, recoil)
   - DIFF 'Régulier' bot difficulty ........ 07-bots.js:14-22
   - HB hit spheres / hitSpheres() ......... 06b-soldier.js:502-506 (skeleton-less branch, crouch-scaled)
   - rayEntities() ......................... 06b-soldier.js:534-552
   - coneDir() ............................. 07-bots.js:292-298
   - damage falloff + head/legs ............ 07-bots.js:357-363 (fireRay)
   - weapon tick / reload / shoot .......... 07c-controller.js:162-170 (ctlStartReload), 180-215 (ctlWeapon), 218-275 (ctlShoot)
   - player recoil ......................... 07ca-recul.js:20-39 (RECOIL, recoilShot; full table in tactical-arsenal.js)
   - tube reload / pump / bolt / bipod / pellets / scope 07c-controller.js:162-256 (Riposte MIT, see THIRD_PARTY_NOTICES.md)
   - bot aim + trigger + look spring ....... 07b-tactics.js:250-273, 485-512
   - suppressAlongRay() .................... 07b-tactics.js:551-565
   - Particles / Tracers ................... 04-fx.js:6-90, 122-165
   - impactFx (concrete), muzzleWorldFx, bloodFx (particles) 04-fx.js:241-310 */
(function(g){
'use strict';
var C=function(){return g.TacticalCommon;};
var vrand=function(a,b){return a+(b-a)*Math.random();};// visual-only (FX particles), not part of the seeded sim
var R=function(){return C().random();},rand=function(a,b){return C().rand(a,b);},randi=function(a,b){return C().randi(a,b);};
var TAU=Math.PI*2,lerp=function(a,b,t){return a+(b-a)*t;},clamp=function(v,a,b){return v<a?a:v>b?b:v;},hyp=Math.hypot;
function angDiff(a,b){var d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}
var MOVE_SPEED=4.75; // 07c-controller.js:37

/* 06i-armes.js M4. dmgScale is the M3 "slower TTK" knob (Arc Raiders-like), set on the tacticalCombat script. */
var WEAPONS={m4:{name:'M4',fam:'rifle',cat:'ar',auto:true,rpm:780,dmg:[32,22],range:[18,50],head:1.6,legs:0.85,mag:30,reserve:150,reload:2.1,reloadEmpty:2.6,
 spread:[0.032,0.0012],moveSpread:0.03,recoil:{v:0.0105,h:0.0045},pattern:'climb',adsTime:0.22,adsFov:0.72,move:0.95,ai:{}}};
var DIFF={name:'Regulier',react:[0.28,0.5],err:0.08,settle:1.1,head:0.07,turn:4.8,dmg:0.88,see:0.85,lag:0.2,flinch:1.0,tokens:2,mem:4,spin:4.6};

/* ---------- Hitboxes (06b-soldier.js) ---------- */
var HB=[{y:1.63,r:0.15,part:'head'},{y:1.34,r:0.24,part:'body'},{y:1.06,r:0.23,part:'body'},{y:0.72,r:0.19,part:'legs'},{y:0.34,r:0.17,part:'legs'}];
var HS=[];for(var i=0;i<11;i++)HS.push({c:[0,0,0],r:0,part:'body'});
function hitSpheres(e){var p=e.pos(),k=e.hitK||1-(e.crouchAmt||0)*0.33;
 for(var i=0;i<HB.length;i++){HS[i].c[0]=p[0];HS[i].c[1]=p[1]+HB[i].y*k;HS[i].c[2]=p[2];HS[i].r=HB[i].r;HS[i].part=HB[i].part;}return HB.length;}
function entEye(e){var p=e.pos();if(e.eyeY!=null)return [p[0],e.eyeY,p[2]];/* first person: the smoothed camera eye (tacticalRtsInput) so shots leave the camera */return [p[0],p[1]+lerp(1.62,1.12,e.crouchAmt||0),p[2]];}
function entChest(e){var p=e.pos(),k=e.hitK||1-(e.crouchAmt||0)*0.33;return [p[0],p[1]+1.2*k,p[2]];}
function entHead(e){var p=e.pos(),k=e.hitK||1-(e.crouchAmt||0)*0.33;return [p[0],p[1]+1.63*k,p[2]];}
/* rayEntities: M3 change - 'list' is passed in, and allies are NOT skipped when includeAllies is set, so a bullet can
   really hit a teammate (the friendly-fire counter in the tests proves the AI's firing-line check works). inflate: extra
   radius for the firing-line check. */
function rayEntities(o,d,maxT,shooter,list,includeAllies,inflate){
 var best=null,bt=maxT,bp=null;inflate=inflate||0;
 for(var j=0;j<list.length;j++){var e=list[j];
  if(!e.alive||e===shooter||(!includeAllies&&C().allied(e,shooter)))continue;
  var p=e.pos(),cx=p[0]-o[0],cy=p[1]+0.9-o[1],cz=p[2]-o[2];
  var tc=cx*d[0]+cy*d[1]+cz*d[2];if(tc<-1.5||tc>bt+1.5)continue;
  if(cx*cx+cy*cy+cz*cz-tc*tc>1.6+inflate*inflate*4)continue;
  var n=hitSpheres(e);
  for(var i=0;i<n;i++){var h=HS[i],hx=h.c[0]-o[0],hy=h.c[1]-o[1],hz=h.c[2]-o[2];
   var t=hx*d[0]+hy*d[1]+hz*d[2];if(t<0)continue;var r=h.r+inflate;
   var d2=hx*hx+hy*hy+hz*hz-t*t;if(d2>r*r)continue;
   var th=t-Math.sqrt(r*r-d2);if(th<bt){bt=th;best=e;bp=h.part;}}}
 return best?{ent:best,t:bt,part:bp}:null;
}
function coneDir(dir,angle){
 if(angle<=0)return dir.slice();
 var a=R()*TAU,r=Math.sqrt(R())*angle;
 var t1=Math.abs(dir[1])<0.95?norm(cross([0,1,0],dir)):norm(cross([1,0,0],dir));
 var t2=cross(dir,t1);
 return norm([dir[0]+t1[0]*Math.cos(a)*r+t2[0]*Math.sin(a)*r,dir[1]+t1[1]*Math.cos(a)*r+t2[1]*Math.sin(a)*r,dir[2]+t1[2]*Math.cos(a)*r+t2[2]*Math.sin(a)*r]);
}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function norm(v){var l=hyp(v[0],v[1],v[2])||1;return [v[0]/l,v[1]/l,v[2]/l];}
function damageAt(def,d,part,dmgMul){var f=clamp((d-def.range[0])/(def.range[1]-def.range[0]),0,1),dmg=lerp(def.dmg[0],def.dmg[1],f);
 if(part==='head')dmg*=def.head;else if(part==='legs')dmg*=def.legs;return dmg*(dmgMul||1);}
function fwd(yaw,pitch){var cp=Math.cos(pitch);return [-Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];}

/* ---------- Weapon state (07c-controller.js ctlStartReload / ctlWeapon / ctlShoot) ----------
   Riposte port extended (tactical-arsenal.js): tube shell-by-shell reloads (shotguns), pump / bolt cycling (A.boltT),
   pellets (combat.shoot), bipod (crouched + still: spread x0.6, recoil x0.5), scope minimum spread, airborne spread. */
function makeArms(def){return {def:def,mag:def.mag,reserve:def.reserve,fireCd:0,bloom:0,reload:null,autoReload:0,shots:0,burstN:0,lastShotAt:-9,adsW:0,boltT:0,switching:0,switchTo:null};}
function startReload(A){var d=A.def;if(A.reload||A.mag>=d.mag||A.reserve<=0||A.boltT>0||A.switching>0)return false;
 if(d.tube){A.reload={tube:true,phase:'start',t:0,empty:A.mag===0,stop:false,dur:0.32+d.shellTime*(d.mag-A.mag)+0.3};return true;}
 var empty=A.mag===0,dur=empty?d.reloadEmpty:d.reload;A.reload={t:0,dur:dur,empty:empty,filled:false};return true;}
function tickWeapon(A,dt,I){
 var d=A.def;A.fireCd-=dt;A.bloom=Math.max(0,A.bloom-dt*0.05);if(A.boltT>0)A.boltT-=dt;
 if(A.switching>0){var before=A.switching;A.switching-=dt;if(before>SWITCHT().swap&&A.switching<=SWITCHT().swap&&A.onSwap)A.onSwap();}
 if(I.reload){startReload(A);I.reload=false;}
 if(A.autoReload>0){A.autoReload-=dt;if(A.autoReload<=0&&!startReload(A)&&A.mag===0&&A.reserve>0)A.autoReload=0.05;}
 if(A.reload){var Rl=A.reload;Rl.t+=dt;Rl.elapsed=(Rl.elapsed||0)+dt;
  if(Rl.tube){/* 07c-controller.js:190-197: start 0.32 s, one shell per shellTime, end 0.3 s; firing with a shell in stops the reload */
   if(Rl.phase==='start'&&Rl.t>=0.32){Rl.phase='shell';Rl.t=0;}
   else if(Rl.phase==='shell'&&Rl.t>=d.shellTime){A.mag++;A.reserve--;A.shellLoads=(A.shellLoads||0)+1;Rl.t=0;if(A.mag>=d.mag||A.reserve<=0||Rl.stop)Rl.phase='end';}
   else if(Rl.phase==='end'&&Rl.t>=0.3)A.reload=null;
   if(I.fire&&A.mag>0&&Rl.phase==='shell')Rl.stop=true;}
  else{if(!Rl.filled&&Rl.t>=Rl.dur*0.6){var take=Math.min(d.mag-A.mag,A.reserve);A.mag+=take;A.reserve-=take;Rl.filled=true;}
   if(Rl.t>=Rl.dur)A.reload=null;}}
 return !A.reload;
}
function SWITCHT(){return g.TacticalArsenal?g.TacticalArsenal.SWITCH:{dur:0.44,swap:0.24};}
/* weapon readiness shared by bots and the player (ctlWeapon canFire) */
function canCycle(A){return !A.reload&&A.boltT<=0&&A.switching<=0;}
/* spread of the next shot (ctlShoot:220-228) */
function shotSpread(A,spd,crouch,air){var d=A.def,ads=A.adsW;
 var spread=lerp(d.spread[0],d.spread[1],ads*ads);
 spread+=d.moveSpread*clamp(spd/MOVE_SPEED,0,1.5)*(1-ads*0.7)+A.bloom*(1-ads*0.6);
 if(air)spread+=0.05;
 if(crouch)spread*=0.8;
 if(d.bipod&&crouch&&spd<0.4)spread*=0.6;
 if(d.scope&&ads<0.95)spread=Math.max(spread,0.06);
 return spread;}
/* per-pellet cone for shotguns (ctlShoot:236: pellets ignore move/bloom, hip->ADS lerp) */
function pelletSpread(A){var d=A.def;return lerp(d.spread[0],d.spread[1],A.adsW);}
/* bookkeeping after a shot + recoil kick (ctlShoot:241-256; player branch = recoilShot, 07ca-recul.js) */
var RECOIL={cat:{ar:{mul:1.55,back:0.7}},ads:0.66,crouch:0.75,move:1.2,first:0.85,peak:1.25,ramp:5,delay:0.1,rate:7};
function afterShot(A,now,crouch,spd,isPlayer,air){var d=A.def,ads=A.adsW;
 A.mag--;A.shots++;A.burstN=now-A.lastShotAt<0.3?A.burstN+1:0;A.lastShotAt=now;var n=A.burstN,kv,kh,Ar=g.TacticalArsenal;
 if(isPlayer){if(Ar){var rc=Ar.recoilShot({crouch:crouch,onGround:!air},d,n,ads,spd,R);kv=rc.kv;kh=rc.kh;}
  else{var K=RECOIL.cat[d.cat]||RECOIL.cat.ar,m=K.mul*lerp(1,RECOIL.ads,ads)*(crouch?RECOIL.crouch:1);if(spd>2.5)m*=RECOIL.move;
   kv=d.recoil.v*m*rand(0.9,1.1);kv*=lerp(RECOIL.first,RECOIL.peak,Math.min(1,n/RECOIL.ramp));kh=(Math.sin(n*0.55+0.6)*1.2+(R()-0.5)*0.6)*d.recoil.h*m;}}
 else{kv=d.recoil.v*(1-ads*0.3)*rand(0.9,1.1)*(crouch?0.85:1);var pod=d.bipod&&crouch&&spd<0.4?0.5:1;kv*=pod;
  if(d.pattern==='climb'){kv*=1+Math.min(n,10)*0.035;kh=(Math.sin(n*0.55+0.6)*1.2+(R()-0.5)*0.6)*d.recoil.h;}
  else if(d.pattern==='smg'){kv*=0.92;kh=(R()-0.5)*2.6*d.recoil.h;}
  else kh=(R()-0.5)*2*d.recoil.h;kh*=pod;}
 if(d.auto)A.bloom=Math.min(0.03,A.bloom+0.003);
 A.fireCd=60/d.rpm;
 if(d.pump){A.boltT=0.6;A.pumpCycles=(A.pumpCycles||0)+1;}if(d.bolt&&A.mag>0)A.boltT=1.05;
 if(A.mag===0&&A.reserve>0)A.autoReload=0.3;
 return {kv:kv,kh:kh};
}
/* weapon change (ctlSwitch / ctlWeapon: 0.44 s, the new gun is in hand at 0.24 s). s.loadout = [arms, arms]; returns false if busy */
function switchArms(s,i){var L=s.loadout,A=s.arms;if(!L||!L[i]||L[i]===A||A.switching>0)return false;
 A.reload=null;A.boltT=0;A.switching=SWITCHT().dur;A.onSwap=function(){var B=L[i];B.switching=A.switching;B.fireCd=Math.max(B.fireCd,0);B.adsW=0;A.switching=0;A.onSwap=null;s.arms=B;s.armsIdx=i;};return true;}

/* ---------- Bot aim (07b-tactics.js:250-273): reticle lags the target, drifts, settles with exposure time ---------- */
function botAim(b,eye,spot,dt,now,D,targetMoving){
 if(b.aimT!==b.target){b.aimT=b.target;var f=fwd(b.lookYaw,b.pitch),L=hyp(spot[0]-eye[0],spot[1]-eye[1],spot[2]-eye[2]);b.aimP=[eye[0]+f[0]*L,eye[1]+f[1]*L,eye[2]+f[2]*L];}
 var k=1-Math.exp(-dt/D.lag);for(var i=0;i<3;i++)b.aimP[i]+=(spot[i]-b.aimP[i])*k;
 var aim=b.aimP.slice(),dist=hyp(aim[0]-eye[0],aim[1]-eye[1],aim[2]-eye[2]);
 var moving=b.speedNow>1?1.4:1,tMov=targetMoving?1.3:1;
 var hit=now-b.lastHitT,flin=hit<0.5?1+1.6*D.flinch*(1-hit/0.5):1;
 var errA=D.err*(0.35+0.65*Math.exp(-b.seenT/D.settle))*moving*tMov*flin*(1+0.7*Math.min(1.5,b.suppr||0));
 var tt=now*1.1+b.uid*7.3;
 var ox=(Math.sin(tt*1.3)+Math.sin(tt*2.9+1)*0.5)*0.66,oy=(Math.sin(tt*1.7+2)+Math.sin(tt*3.3)*0.4)*0.5;
 var hd=hyp(aim[0]-eye[0],aim[2]-eye[2])||1,rx=(aim[2]-eye[2])/hd,rz=-(aim[0]-eye[0])/hd,m=errA*dist;
 aim[0]+=rx*ox*m;aim[2]+=rz*ox*m;aim[1]+=oy*m;
 var dx=aim[0]-eye[0],dy=aim[1]-eye[1],dz=aim[2]-eye[2];b.seenT+=dt;
 return {yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(dy,hyp(dx,dz)),dist:dist};
}
/* trigger (07b-tactics.js:485-500): bursts of 3-9 (3-5 far), pauses, reaction time, reload when hidden */
function botTrigger(b,A,vis,canShoot,dist,faceYaw,facePitch,dt,now,D,inCover){
 var I=b.input;I.fire=false;
 if(A.shots!==(b.lastShots||0)){b.burstLeft=(b.burstLeft||0)-(A.shots-(b.lastShots||0));b.lastShots=A.shots;if(A.def.auto&&b.burstLeft<=0)b.pauseT=rand(0.18,0.5)+dist*0.004;}
 b.pauseT=(b.pauseT||0)-dt;
 A.adsW=vis&&canShoot?Math.min(1,A.adsW+dt/A.def.adsTime*2.2*0.5):Math.max(0,A.adsW-dt*4);
 if(canShoot&&vis){var aimErr=hyp(angDiff(b.lookYaw,faceYaw),facePitch-b.pitch);
  if(b.reactT>0)b.reactT-=dt;
  else if(!A.reload&&now-b.lastHitT>0.15&&aimErr<(b.aimTol||0.035)){if((b.burstLeft||0)<=0&&b.pauseT<=0)b.burstLeft=randi(3,dist>30?5:9);if(b.burstLeft>0)I.fire=true;}}
 else if(!vis&&!A.reload&&A.mag<A.def.mag*0.6&&inCover)I.reload=true;
}
/* look spring (07b-tactics.js:501-512) */
function lookSpring(b,faceYaw,facePitch,dt,D,vis){
 var kk=D.turn*D.turn*3.2,cd=2*Math.sqrt(kk)*0.85,yv=b.yawV||0,vmax=Math.min(D.turn*2,D.spin*(vis?1.3:1));
 var ya=angDiff(b.lookYaw,faceYaw)*kk-yv*cd;if(ya*yv>=0)ya=clamp(ya,-D.spin*6,D.spin*6);
 b.yawV=clamp(yv+ya*dt,-vmax,vmax);b.lookYaw+=b.yawV*dt;
 b.pitchV=(b.pitchV||0)+((facePitch-b.pitch)*kk-(b.pitchV||0)*cd)*dt;b.pitch=clamp(b.pitch+b.pitchV*dt,-1.2,1.2);
}
/* suppressAlongRay (07b-tactics.js:551-565): bullets passing within ~1.5 m of an enemy's chest raise suppression and
   give a direction (not an address) when he can't see the shooter */
function suppressAlongRay(shooter,origin,dir,endT,hitEnt,list,now){
 for(var j=0;j<list.length;j++){var e=list[j];if(!e.alive||C().allied(e,shooter)||e===hitEnt)continue;
  var c=entChest(e),t=clamp((c[0]-origin[0])*dir[0]+(c[1]-origin[1])*dir[1]+(c[2]-origin[2])*dir[2],0,endT);
  var px=origin[0]+dir[0]*t-c[0],py=origin[1]+dir[1]*t-c[1],pz=origin[2]+dir[2]*t-c[2];
  if(px*px+py*py+pz*pz<2.2){e.suppr=Math.min(1.5,(e.suppr||0)+0.12);e.lastSupprT=now;if(e.onShotNear)e.onShotNear(shooter,now);}}
}

/* ---------- FX (04-fx.js) ---------- */
function glowTex(device,soft){var c=document.createElement('canvas');c.width=c.height=64;var x=c.getContext('2d'),gr=x.createRadialGradient(32,32,0,32,32,32);
 if(soft){gr.addColorStop(0,'rgba(255,255,255,0.9)');gr.addColorStop(0.5,'rgba(255,255,255,0.45)');gr.addColorStop(1,'rgba(255,255,255,0)');}
 else{gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(0.25,'rgba(255,255,255,0.7)');gr.addColorStop(1,'rgba(255,255,255,0)');}
 x.fillStyle=gr;x.fillRect(0,0,64,64);var t=new pc.Texture(device,{width:64,height:64,format:pc.PIXELFORMAT_RGBA8,mipmaps:false});t.setSource(c);return t;}
function tracerTex(device){var c=document.createElement('canvas');c.width=64;c.height=16;var x=c.getContext('2d'),im=x.createImageData(64,16);
 for(var u=0;u<64;u++)for(var v=0;v<16;v++){var U=u/63,V=v/15,e=1-Math.abs(V-0.5)*2,s=function(a,b,t){t=clamp((t-a)/(b-a),0,1);return t*t*(3-2*t);},l=s(0,0.35,U)*s(1,0.9,U),k=(v*64+u)*4;
  im.data[k]=255;im.data[k+1]=200;im.data[k+2]=120;im.data[k+3]=Math.round(255*e*l);}
 x.putImageData(im,0,0);var t=new pc.Texture(device,{width:64,height:16,format:pc.PIXELFORMAT_RGBA8,mipmaps:false});t.setSource(c);return t;}
/* QuadBatch: the PlayCanvas replacement for THREE.Points / the tracer mesh (one dynamic mesh, camera-facing quads) */
function QuadBatch(app,root,max,tex,additive){
 this.max=max;this.n=0;var dev=app.graphicsDevice;
 this.P=new Float32Array(max*12);this.U=new Float32Array(max*8);this.Cl=new Float32Array(max*16);var I=new Uint16Array(max*6);
 for(var i=0;i<max;i++){this.U.set([0,0,1,0,1,1,0,1],i*8);I.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);}
 var mesh=new pc.Mesh(dev);mesh.setPositions(this.P);mesh.setUvs(0,this.U);mesh.setColors(this.Cl);mesh.setIndices(I);mesh.update(pc.PRIMITIVE_TRIANGLES);this.mesh=mesh;
 var m=new pc.StandardMaterial();m.useLighting=false;m.useFog=false;m.useSkybox=false;m.diffuse=new pc.Color(0,0,0);m.emissive=new pc.Color(1,1,1);m.emissiveMap=tex;m.emissiveVertexColor=true;
 m.opacityMap=tex;m.opacityMapChannel='a';m.opacityVertexColor=true;m.opacityVertexColorChannel='a';m.blendType=additive?pc.BLEND_ADDITIVEALPHA:pc.BLEND_NORMAL;m.depthWrite=false;m.cull=pc.CULLFACE_NONE;m.update();
 var mi=new pc.MeshInstance(mesh,m);mi.cull=false;var e=new pc.Entity('fx');e.addComponent('render',{meshInstances:[mi],castShadows:false,receiveShadows:false});root.addChild(e);this.mi=mi;
}
QuadBatch.prototype.begin=function(){this.n=0;};
QuadBatch.prototype.quad=function(a,b,c,d,r,gg,bb,al){if(this.n>=this.max)return;var i=this.n++,P=this.P,o=i*12;
 P[o]=a[0];P[o+1]=a[1];P[o+2]=a[2];P[o+3]=b[0];P[o+4]=b[1];P[o+5]=b[2];P[o+6]=c[0];P[o+7]=c[1];P[o+8]=c[2];P[o+9]=d[0];P[o+10]=d[1];P[o+11]=d[2];
 for(var k=0;k<4;k++){var q=i*16+k*4;this.Cl[q]=r;this.Cl[q+1]=gg;this.Cl[q+2]=bb;this.Cl[q+3]=al;}};
QuadBatch.prototype.end=function(){for(var i=this.n*12;i<this.max*12;i++)this.P[i]=0;this.mesh.setPositions(this.P);this.mesh.setColors(this.Cl);this.mesh.update(pc.PRIMITIVE_TRIANGLES,false);this.mi.visible=this.n>0;};

function Particles(batch,max){this.b=batch;this.max=max;this.n=0;
 this.p=new Float32Array(max*3);this.v=new Float32Array(max*3);this.life=new Float32Array(max);this.maxLife=new Float32Array(max);
 this.s0=new Float32Array(max);this.s1=new Float32Array(max);this.col=new Float32Array(max*4);this.a1=new Float32Array(max);this.grav=new Float32Array(max);this.drag=new Float32Array(max);}
Particles.prototype.spawn=function(x,y,z,vx,vy,vz,life,s0,s1,r,g2,b,a0,a1,grav,drag){if(this.n>=this.max)return;var i=this.n++;
 this.p[i*3]=x;this.p[i*3+1]=y;this.p[i*3+2]=z;this.v[i*3]=vx;this.v[i*3+1]=vy;this.v[i*3+2]=vz;this.life[i]=life;this.maxLife[i]=life;this.s0[i]=s0;this.s1[i]=s1;
 this.col[i*4]=r;this.col[i*4+1]=g2;this.col[i*4+2]=b;this.col[i*4+3]=a0;this.a1[i]=a1;this.grav[i]=grav||0;this.drag[i]=drag||0;};
Particles.prototype.copy=function(f,t){if(f===t)return;for(var c=0;c<3;c++){this.p[t*3+c]=this.p[f*3+c];this.v[t*3+c]=this.v[f*3+c];}for(var c2=0;c2<4;c2++)this.col[t*4+c2]=this.col[f*4+c2];
 this.life[t]=this.life[f];this.maxLife[t]=this.maxLife[f];this.s0[t]=this.s0[f];this.s1[t]=this.s1[f];this.a1[t]=this.a1[f];this.grav[t]=this.grav[f];this.drag[t]=this.drag[f];};
Particles.prototype.update=function(dt,right,up){var i=0;
 while(i<this.n){this.life[i]-=dt;if(this.life[i]<=0){this.copy(this.n-1,i);this.n--;continue;}
  var k=i*3,d=Math.max(0,1-this.drag[i]*dt);this.v[k]*=d;this.v[k+1]=this.v[k+1]*d-this.grav[i]*dt;this.v[k+2]*=d;
  this.p[k]+=this.v[k]*dt;this.p[k+1]+=this.v[k+1]*dt;this.p[k+2]+=this.v[k+2]*dt;
  if(this.grav[i]>0&&this.p[k+1]<0.02){this.p[k+1]=0.02;this.v[k+1]*=-0.3;this.v[k]*=0.6;this.v[k+2]*=0.6;}
  var t=1-this.life[i]/this.maxLife[i],a=lerp(this.col[i*4+3],this.a1[i],t)*Math.min(1,t*12),s=lerp(this.s0[i],this.s1[i],1-(1-t)*(1-t))*0.5;
  var x=this.p[k],y=this.p[k+1],z=this.p[k+2],rx=right[0]*s,ry=right[1]*s,rz=right[2]*s,ux=up[0]*s,uy=up[1]*s,uz=up[2]*s;
  this.b.quad([x-rx-ux,y-ry-uy,z-rz-uz],[x+rx-ux,y+ry-uy,z+rz-uz],[x+rx+ux,y+ry+uy,z+rz+uz],[x-rx+ux,y-ry+uy,z-rz+uz],this.col[i*4],this.col[i*4+1],this.col[i*4+2],a);i++;}
};
function Tracers(batch,max){this.b=batch;this.max=max;this.list=[];}
Tracers.prototype.add=function(a,b,speed){var d=hyp(b[0]-a[0],b[1]-a[1],b[2]-a[2]);if(d<1.5)return;if(this.list.length>=this.max)this.list.shift();
 var LK=g.DreadingLook,lk=!!(LK&&LK.on);this.list.push({a:a.slice(),dir:[(b[0]-a[0])/d,(b[1]-a[1])/d,(b[2]-a[2])/d],d:d,t:0,speed:(speed||380)*(lk?0.8:1),len:Math.min(lk?8:6,d*(lk?0.5:0.4)),hdr:lk});/* look on: a bit slower + longer so a burst reads from the RTS camera */};
Tracers.prototype.update=function(dt,cam){
 this.list=this.list.filter(function(tr){tr.t+=dt*tr.speed;return tr.t-tr.len<tr.d;});
 for(var j=0;j<this.list.length;j++){var tr=this.list[j],h=Math.min(tr.t,tr.d),tl=Math.max(0,tr.t-tr.len);
  var A=[tr.a[0]+tr.dir[0]*tl,tr.a[1]+tr.dir[1]*tl,tr.a[2]+tr.dir[2]*tl],B=[tr.a[0]+tr.dir[0]*h,tr.a[1]+tr.dir[1]*h,tr.a[2]+tr.dir[2]*h];
  var mid=[(A[0]+B[0])/2,(A[1]+B[1])/2,(A[2]+B[2])/2],view=norm([cam[0]-mid[0],cam[1]-mid[1],cam[2]-mid[2]]),w=0.018+hyp(mid[0]-cam[0],mid[1]-cam[1],mid[2]-cam[2])*0.0012,side=norm(cross(tr.dir,view));
  side=[side[0]*w*2,side[1]*w*2,side[2]*w*2];
  this.b.quad([A[0]-side[0],A[1]-side[1],A[2]-side[2]],[B[0]-side[0],B[1]-side[1],B[2]-side[2]],[B[0]+side[0],B[1]+side[1],B[2]+side[2]],[A[0]+side[0],A[1]+side[1],A[2]+side[2]],tr.hdr?3.2:1,tr.hdr?2.3:0.75,tr.hdr?1.2:0.45,0.9);}/* HDR core (float vertex colour) so bloom catches tracers when the look is on */
};
function createFx(app,root){var dev=app.graphicsDevice,glow=glowTex(dev,false),soft=glowTex(dev,true);
 var add=new QuadBatch(app,root,1200,glow,true),smoke=new QuadBatch(app,root,600,soft,false),tr=new QuadBatch(app,root,64,tracerTex(dev),true);
 var FX={batches:[add,smoke,tr],add:new Particles(add,700),flash:new Particles(add,100),muzzle:new Particles(add,100),smoke:new Particles(smoke,400),blood:new Particles(smoke,200),tracers:new Tracers(tr,48)};
 FX.update=function(dt,camEntity){var m=camEntity.getWorldTransform(),r=new pc.Vec3(),u=new pc.Vec3();m.getX(r);m.getY(u);r.normalize();u.normalize();var R3=[r.x,r.y,r.z],U3=[u.x,u.y,u.z],cp=camEntity.getPosition();
  FX.batches.forEach(function(b){b.begin();});FX.add.update(dt,R3,U3);FX.flash.update(dt,R3,U3);FX.muzzle.update(dt,R3,U3);FX.smoke.update(dt,R3,U3);FX.blood.update(dt,R3,U3);FX.tracers.update(dt,[cp.x,cp.y,cp.z]);FX.batches.forEach(function(b){b.end();});};
 return FX;}
/* impactFx, concrete/brick/stone branch (colours are NS HDR values; PlayCanvas clamps >1) */
function impactFx(FX,p,n,big){var nx=n[0],ny=n[1],nz=n[2],dust=[0.62,0.58,0.52];var LK=g.DreadingLook;if(LK&&LK.on&&!big)LK.decal('impact',p,n);/* look spec 4: pooled chip decal (one shared atlas + mesh) */
 FX.smoke.spawn(p[0],p[1],p[2],nx*1.2,ny*1.2+0.4,nz*1.2,1.0,0.18,0.9,dust[0],dust[1],dust[2],0.55,0,0,1.6);
 FX.smoke.spawn(p[0],p[1],p[2],nx*0.4,ny*0.4+0.2,nz*0.4,1.6,0.25,1.4,dust[0],dust[1],dust[2],0.3,0,0,1);
 for(var i=0;i<6;i++)FX.smoke.spawn(p[0],p[1],p[2],nx*vrand(1,5)+vrand(-2,2),ny*vrand(1,4)+vrand(0,3),nz*vrand(1,5)+vrand(-2,2),vrand(0.3,0.7),0.04,0.02,dust[0]*0.6,dust[1]*0.6,dust[2]*0.6,1,0.8,14,0.5);
 for(var j=0;j<(big?8:4);j++)FX.add.spawn(p[0],p[1],p[2],nx*vrand(2,7)+vrand(-3,3),ny*vrand(2,6)+vrand(0,3),nz*vrand(2,7)+vrand(-3,3),vrand(0.12,0.28),0.03,0.01,3.2,2.2,1.0,1,0,12,0.5);
 if(R()<0.6)FX.flash.spawn(p[0]+nx*0.03,p[1]+ny*0.03,p[2]+nz*0.03,0,0,0,0.04,0.16,0.26,3,2.2,1.3,1,0);}
function bloodFx(FX,p,dir,head){var n=head?22:12;var LK=g.DreadingLook;if(LK&&LK.on&&LK.blood)LK.blood(p,dir);/* look spec 4: dark wet mark on the surface behind the hit */
 for(var i=0;i<n;i++)FX.blood.spawn(p[0],p[1],p[2],dir[0]*vrand(1,4)+vrand(-1.4,1.4),vrand(-0.5,2.4),dir[2]*vrand(1,4)+vrand(-1.4,1.4),vrand(0.3,0.7),0.07,0.03,0.26,0.01,0.01,1,0.8,9,1);
 FX.blood.spawn(p[0],p[1],p[2],dir[0]*0.8,0.2,dir[2]*0.8,0.5,0.25,head?1.1:0.75,0.3,0.02,0.02,0.85,0,0,2);}
function muzzleWorldFx(FX,p,dir,f){f=f||1;var k=clamp(0.65+0.35*f,0.8,1.6);var LK=g.DreadingLook;if(LK&&LK.on)LK.muzzle([p[0]+dir[0]*0.25,p[1]+dir[1]*0.25,p[2]+dir[2]*0.25]);/* look spec 4: pooled 0.06 s omni (cap 8) */
 FX.muzzle.spawn(p[0],p[1],p[2],0,0,0,0.05,0.62*k,0.85*k,3.4,2.8,2.2,1,0.1);
 for(var i=1;i<=3;i++){var d=0.12*i*k;FX.add.spawn(p[0]+dir[0]*d,p[1]+dir[1]*d,p[2]+dir[2]*d,dir[0]*2.5,dir[1]*2.5,dir[2]*2.5,0.05,(0.34-0.07*i)*k,(0.26-0.06*i)*k,4,2.6-0.35*i,1-0.25*i,0.9,0);}
 for(var j=0;j<2;j++)FX.add.spawn(p[0],p[1],p[2],dir[0]*vrand(4,10)+vrand(-2,2),dir[1]*vrand(4,10)+vrand(-1,2),dir[2]*vrand(4,10)+vrand(-2,2),vrand(0.05,0.12),0.025,0.008,4,2.4,1.0,1,0,2,2);
 FX.smoke.spawn(p[0],p[1],p[2],dir[0]*1.2+vrand(-0.2,0.2),0.5,dir[2]*1.2+vrand(-0.2,0.2),0.8,0.1,0.6,0.6,0.58,0.55,0.18,0,0,1.2);}

g.TacticalNS={WEAPONS:WEAPONS,DIFF:DIFF,MOVE_SPEED:MOVE_SPEED,HB:HB,hitSpheres:hitSpheres,entEye:entEye,entChest:entChest,entHead:entHead,rayEntities:rayEntities,coneDir:coneDir,damageAt:damageAt,fwd:fwd,angDiff:angDiff,
 makeArms:makeArms,startReload:startReload,tickWeapon:tickWeapon,shotSpread:shotSpread,pelletSpread:pelletSpread,afterShot:afterShot,canCycle:canCycle,switchArms:switchArms,RECOIL:RECOIL,botAim:botAim,botTrigger:botTrigger,lookSpring:lookSpring,suppressAlongRay:suppressAlongRay,
 createFx:createFx,impactFx:impactFx,bloodFx:bloodFx,muzzleWorldFx:muzzleWorldFx,lerp:lerp,clamp:clamp};
})(globalThis);
