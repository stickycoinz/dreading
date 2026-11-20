/* tacticalDrones: Riposte: Frontline drone logic PORTED (MIT, Copyright (c) 2026 BenDBSS, see THIRD_PARTY_NOTICES.md;
   read from NIGHT_SURVIVAL/src, never modified). Logic only: each drone is ONE placeholder box (1 draw call).
   Source map (NIGHT_SURVIVAL/src):
   - FPV {life 30, speed 10, boost 16, accel 3.4, hp 70, r 0.28, blast 4.5, dmg 150, botSpeed 9, crash 6} .. 08e-fpv.js:16
   - fpvWish / fpvAi (climb, run 8 m above the target, dive when seen within 12 m, side approach when hidden, climb over obstacles,
     unstick by changing side) / fpvHit / fpvStep (crash > 6 m/s explodes, soft contact slides) / fpvEnd .. 08e-fpv.js:220-295
   - rayDrones (0.45 m sphere), fpvDamage, fpvBotsShoot (bots shoot enemy drones they see within 30 m, 1 hit in 3) .. 08e-fpv.js:321-358
   - fpvPlayer / fpvCamera (pilot: WASD where you look, Space up, Ctrl down, Shift boost, click = detonate) .. 08e-fpv.js:192-219
   - UAV sonar {life 30, pulse 3 s}: a pulse records every enemy position for the team's bots .. 08b-killstreaks.js:20-37
   DREADING recon drone (UAV logic on a physical drone): hovers 18 m above a point, pulses every 3 s, and every enemy/zombie it can
   see (LOS from the drone, 35 m) is written into EVERY squad member's Yuka memory (perception.sense) = shared contacts.
   No helicopter / air strike (no high-octane fuel in DREADING). */
var TacticalDrones=pc.createScript('tacticalDrones');
TacticalDrones.FPV={life:30,speed:10,boost:16,accel:3.4,hp:70,r:0.28,blast:4.5,dmg:150,botSpeed:9,crash:6};
TacticalDrones.RECON={life:45,hp:40,alt:18,radius:35,pulse:3,speed:9,orbit:6,noise:0.6};
(function(){
var TD=TacticalDrones,C=function(){return TacticalCommon;},NSf=function(){return TacticalNS;};
function hyp3(x,y,z){return Math.sqrt(x*x+y*y+z*z);}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function damp(a,b,k,dt){return b+(a-b)*Math.exp(-k*dt);}
TD.prototype.initialize=function(){var T=C().ns(this.app);T.drones=this;this.list=[];this.counters={fpv:0,recon:0,booms:0,shotDown:0,pulses:0,shared:0,botShots:0};this.pilot=null;
 var mk=function(r,g,b){var m=new pc.StandardMaterial();m.diffuse=new pc.Color(r,g,b);m.emissive=new pc.Color(r*0.4,g*0.4,b*0.4);m.update();return m;};
 this.mat={fpv:mk(0.15,0.15,0.16),recon:mk(0.55,0.6,0.62),enemy:mk(0.6,0.12,0.1)};
 this.enemyDrones=typeof location!=='undefined'&&/[?&]enemyDrones=1/.test(location.search);this.enemyT=40;};
TD.prototype.blockers=function(){var T=C().ns(this.app);return T.perception?T.perception.blockers:[];};
TD.prototype.makeBody=function(kind,team){var T=C().ns(this.app),e=new pc.Entity(kind+' drone');e.addComponent('render',{type:'box',material:team!=='friendly'?this.mat.enemy:this.mat[kind],castShadows:false,receiveShadows:false});
 if(kind==='fpv')e.setLocalScale(0.5,0.12,0.5);else e.setLocalScale(0.7,0.18,0.7);(T.root||this.app.root).addChild(e);return e;};
TD.prototype.spawn=function(kind,owner,pos,yaw,pitch){var d={kind:kind,owner:owner,team:owner?owner.team:'friendly',pos:pos.slice(),vel:[0,0,0],yaw:yaw||0,pitch:pitch||0,roll:0,hp:kind==='fpv'?TD.FPV.hp:TD.RECON.hp,t:0,
  in:{fw:0,st:0,up:0,boost:false},boom:false,dead:false,ai:true,tgt:null,tgtT:0,side:0,stuckT:0};d.e=this.makeBody(kind,d.team);this.list.push(d);this.counters[kind]++;this.pose(d);
 var T=C().ns(this.app);if(T.events)T.events.push({time:+T.elapsed.toFixed(2),soldier:owner?owner.soldierName:'-',decision:kind+' drone up'});return d;};
/* fpvLaunch: from above the operator's head, climbing */
TD.prototype.launchFpv=function(owner,piloted){if(!owner||!owner.alive)return null;if(this.list.some(function(d){return d.owner===owner&&d.kind==='fpv'&&!d.dead;}))return null;
 var p=owner.pos(),d=this.spawn('fpv',owner,[p[0],p[1]+2.1,p[2]],owner.lookYaw||0,0.3);d.vel=[0,4,0];if(piloted){d.ai=false;this.pilot={d:d,yaw:owner.lookYaw,pitch:0};}return d;};
TD.prototype.launchRecon=function(owner,point){if(!owner||!owner.alive)return null;var old=this.list.find(function(d){return d.owner===owner&&d.kind==='recon'&&!d.dead;});if(old){old.goal=point?point.slice():old.goal;return old;}
 var p=owner.pos(),d=this.spawn('recon',owner,[p[0],p[1]+2.1,p[2]],owner.lookYaw||0,0);d.goal=(point||p).slice();d.pulseT=0.5;d.vel=[0,3,0];return d;};
/* fpvWish */
TD.prototype.wish=function(d){var cp=Math.cos(d.pitch),sp=Math.sin(d.pitch),cy=Math.cos(d.yaw),sy=Math.sin(d.yaw);
 var o=[-sy*cp*d.in.fw+cy*d.in.st,sp*d.in.fw+d.in.up,-cy*cp*d.in.fw-sy*d.in.st],l=hyp3(o[0],o[1],o[2]);if(l>1){o[0]/=l;o[1]/=l;o[2]/=l;}
 var k=d.in.boost&&d.in.fw>0.2?TD.FPV.boost:d.ai?TD.FPV.botSpeed:TD.FPV.speed;if(d.kind==='recon')k=TD.RECON.speed;return [o[0]*k,o[1]*k,o[2]*k];};
TD.prototype.hostiles=function(d){var T=C().ns(this.app),out=[];T.squad.forEach(function(o){if(o.alive&&!o.disabled&&o.team!==d.team)out.push(o);});(T.zombies||[]).forEach(function(z){if(z.alive)out.push(z);});return out;};
TD.prototype.clear=function(a,b){var T=C().ns(this.app);return !(T.perception&&T.perception.blocked(a,b));};
/* fpvAi (08e-fpv.js:227) */
TD.prototype.fpvAi=function(d,dt){var NS=NSf();d.tgtT-=dt;
 if(d.tgtT<=0||!d.tgt||!d.tgt.alive){d.tgtT=0.5;var best=null,bd=1e9,list=this.hostiles(d);for(var i=0;i<list.length;i++){var q=list[i].pos(),k=(q[0]-d.pos[0])*(q[0]-d.pos[0])+(q[2]-d.pos[2])*(q[2]-d.pos[2]);if(!list[i].isZombie)k*=0.5;if(k<bd){bd=k;best=list[i];}}d.tgt=best;}
 var want;if(!d.tgt||d.t<0.7)want=[0,1,0];
 else{var c=NS.entChest(d.tgt),hd=Math.hypot(c[0]-d.pos[0],c[2]-d.pos[2]);
  d.stuckT=hyp3(d.vel[0],d.vel[1],d.vel[2])<1.5&&d.t>1.5?d.stuckT+dt:0;if(d.stuckT>1.2){d.stuckT=0;d.side+=Math.PI/2;}
  if(hd<12&&this.clear(d.pos,c))want=[c[0]-d.pos[0],c[1]-d.pos[1],c[2]-d.pos[2]];
  else if(hd<12){var a=Math.atan2(d.pos[0]-c[0],d.pos[2]-c[2])+d.side;want=[c[0]+Math.sin(a)*5-d.pos[0],c[1]+0.6-d.pos[1],c[2]+Math.cos(a)*5-d.pos[2]];}
  else{want=[c[0]-d.pos[0],c[1]+8-d.pos[1],c[2]-d.pos[2]];var l0=hyp3(want[0],want[1],want[2])||1;var w=C().rayWorld(d.pos,[want[0]/l0,want[1]/l0,want[2]/l0],7,this.blockers());if(w)want=[want[0]/l0*0.15,1,want[2]/l0*0.15];}}
 var l=hyp3(want[0],want[1],want[2])||1;want=[want[0]/l,want[1]/l,want[2]/l];d.yaw=Math.atan2(-want[0],-want[2]);d.pitch=Math.asin(clamp(want[1],-1,1));d.in.fw=1;d.in.st=0;d.in.up=0;d.in.boost=false;};
/* recon: fly to 18 m above the goal and orbit (UAV pulse logic on a physical drone) */
TD.prototype.reconAi=function(d,dt){var R=TD.RECON,g=d.goal,a=d.t*0.35,tx=g[0]+Math.cos(a)*R.orbit,tz=g[2]+Math.sin(a)*R.orbit,ty=g[1]+R.alt;
 var w=[tx-d.pos[0],ty-d.pos[1],tz-d.pos[2]],l=hyp3(w[0],w[1],w[2]);d.yaw=Math.atan2(-w[0],-w[2]);d.pitch=l>0.01?Math.asin(clamp(w[1]/l,-1,1)):0;d.in.fw=Math.min(1,l/4);d.in.st=0;d.in.up=0;d.in.boost=false;};
TD.prototype.pulse=function(d,now){var T=C().ns(this.app),R=TD.RECON,P=T.perception,self=this,found=[];if(!P)return found;var mates=T.squad.filter(function(o){return o.alive&&o.team===d.team;});
 this.hostiles(d).forEach(function(e){var q=e.pos();if(Math.hypot(q[0]-d.pos[0],q[2]-d.pos[2])>R.radius)return;var ch=NSf().entChest(e);if(!self.clear(d.pos,ch)&&!self.clear(d.pos,NSf().entHead(e)))return;
  found.push(e);mates.forEach(function(m){if(!m.memory)return;var had=m.memory.hasRecord(e)&&m.memory.getRecord(e).visible;P.sense(m,e,now,R.noise);if(!had){var r=m.memory.getRecord(e);if(r)r.recon=now;}});});
 this.counters.pulses++;this.counters.shared+=found.length;d.lastPulse={t:now,n:found.length,names:found.slice(0,12).map(function(e){return e.soldierName||('zombie '+(e.uid||''));})};return found;};
/* fpvHit: soldiers/zombies -> boom; world -> normal */
TD.prototype.hitTest=function(d,from,to){var T=C().ns(this.app),NS=NSf();if(to[1]<-2)return {boom:true};
 if(d.kind==='fpv'){var list=T.squad.concat(T.zombies||[]);for(var i=0;i<list.length;i++){var o=list[i];if(!o.alive||o===d.owner)continue;var q=o.pos();if(Math.abs(q[0]-to[0])>1.5||Math.abs(q[2]-to[2])>1.5)continue;
  var c=NS.entChest(o),h=NS.entHead(o);if(hyp3(c[0]-to[0],c[1]-to[1],c[2]-to[2])<0.55||hyp3(h[0]-to[0],h[1]-to[1],h[2]-to[2])<0.4)return {boom:true};}}
 var dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2],len=hyp3(dx,dy,dz);var w=len>1e-4?C().rayWorld(from,[dx/len,dy/len,dz/len],len+TD.FPV.r,this.blockers()):null;
 if(!w&&T.navigation&&to[1]<from[1]){var gq=null;try{gq=T.navigation.nearest(to,{x:0.3,y:0.6,z:0.3});}catch(e){}if(gq&&to[1]<gq[1]+0.15)return {n:[0,1,0]};}
 if(!w&&to[1]<0.15)return {n:[0,1,0]};return w?{n:w.n}:null;};
/* fpvStep */
TD.prototype.step=function(d,dt){var F=TD.FPV;d.t+=dt;
 if(d.ai){if(d.kind==='fpv')this.fpvAi(d,dt);else this.reconAi(d,dt);}
 var want=this.wish(d),k=1-Math.exp(-F.accel*dt);for(var i=0;i<3;i++)d.vel[i]+=(want[i]-d.vel[i])*k;
 var life=d.kind==='fpv'?F.life:TD.RECON.life;
 if(d.boom||d.t>=life||(!d.owner.alive&&!d.ai)){this.end(d,d.kind==='fpv'&&(d.owner.alive||d.boom));return;}
 var to=[d.pos[0]+d.vel[0]*dt,d.pos[1]+d.vel[1]*dt,d.pos[2]+d.vel[2]*dt],h=this.hitTest(d,d.pos,to);
 if(h&&!h.boom){var vn=-(d.vel[0]*h.n[0]+d.vel[1]*h.n[1]+d.vel[2]*h.n[2]);
  if(vn>F.crash&&d.kind==='fpv'){d.pos=to;this.end(d,true);return;}
  for(var j=0;j<3;j++)d.vel[j]+=h.n[j]*Math.max(0,vn);to=[d.pos[0]+d.vel[0]*dt,d.pos[1]+d.vel[1]*dt,d.pos[2]+d.vel[2]*dt];h=this.hitTest(d,d.pos,to);
  if(h&&!h.boom){to=d.pos.slice();for(var m=0;m<3;m++)d.vel[m]*=0.5;h=null;}}
 if(h&&h.boom){d.pos=to;this.end(d,d.kind==='fpv');return;}
 d.pos=to;var side=(d.vel[0]*Math.cos(d.yaw)-d.vel[2]*Math.sin(d.yaw))/F.speed;d.roll=damp(d.roll,-clamp(side,-1,1)*0.45,6,dt);
 if(d.kind==='recon'){d.pulseT-=dt;if(d.pulseT<=0&&d.pos[1]>d.goal[1]+6){d.pulseT=TD.RECON.pulse;this.pulse(d,C().ns(this.app).elapsed);}}
 this.pose(d);};
TD.prototype.pose=function(d){if(!d.e)return;d.e.setPosition(d.pos[0],d.pos[1],d.pos[2]);var sp=Math.hypot(d.vel[0],d.vel[2])/TD.FPV.boost;d.e.setEulerAngles((d.pitch*0.35-sp*0.35)*57.3,d.yaw*57.3,d.roll*57.3);};
TD.prototype.end=function(d,boom){if(d.dead)return;d.dead=true;var T=C().ns(this.app);
 if(boom&&T.grenades){T.grenades.explode(d.pos.slice(),d.owner,'FPV drone',TD.FPV.blast,TD.FPV.dmg,undefined,2.2);this.counters.booms++;}
 else if(T.combat&&T.combat.fx){TacticalNS.impactFx(T.combat.fx,d.pos,[0,1,0],true);}
 if(d.e){d.e.destroy();d.e=null;}var i=this.list.indexOf(d);if(i>=0)this.list.splice(i,1);
 if(this.pilot&&this.pilot.d===d){this.pilot=null;if(T.input&&T.input.onPilotEnd)T.input.onPilotEnd(boom);}};
/* rayDrones: 0.45 m sphere, enemy drones only */
TD.prototype.rayDrones=function(shooter,o,dir,maxT){var best=null,bt=maxT;for(var i=0;i<this.list.length;i++){var d=this.list[i];if(d.dead||(shooter&&d.team===shooter.team))continue;
  var cx=d.pos[0]-o[0],cy=d.pos[1]-o[1],cz=d.pos[2]-o[2],t=cx*dir[0]+cy*dir[1]+cz*dir[2];if(t<0||t>bt)continue;var d2=cx*cx+cy*cy+cz*cz-t*t;if(d2>0.2)continue;bt=t-Math.sqrt(0.2-d2);best=d;}
 return best?{d:best,t:bt}:null;};
TD.prototype.damage=function(d,dmg){if(d.dead)return;d.hp-=dmg;if(d.hp<=0){this.counters.shotDown++;this.end(d,false);}};
/* fpvBotsShoot: bots see an enemy drone within 30 m (LOS; recon only when under 10 m above them), react 0.6 s, then shots every 0.16-0.28 s, ~1 in 3 hits for 12 */
TD.prototype.botsShoot=function(dt){var T=C().ns(this.app),self=this,R=C().random;
 T.squad.forEach(function(b){if(!b.alive||b.controlled||b.disabled)return;var tgt=null,bd=900,me=b.pos();
  self.list.forEach(function(d){if(d.dead||d.team===b.team)return;if(d.kind==='recon'&&d.pos[1]-me[1]>10)return;/* a recon drone at its 18 m orbit is out of bot reach (Riposte's UAV was untouchable); low it can be shot */var k=(d.pos[0]-me[0])*(d.pos[0]-me[0])+(d.pos[1]-me[1])*(d.pos[1]-me[1])+(d.pos[2]-me[2])*(d.pos[2]-me[2]);if(k<bd){bd=k;tgt=d;}});
  if(!tgt){b.fpvSeeT=0;return;}var eye=[me[0],me[1]+((b.crouchAmt||0)>0.5?1.1:1.55),me[2]];if(!self.clear(eye,tgt.pos)){b.fpvSeeT=Math.max(0,(b.fpvSeeT||0)-dt);return;}
  b.fpvSeeT=(b.fpvSeeT||0)+dt;b.lookYaw=Math.atan2(-(tgt.pos[0]-me[0]),-(tgt.pos[2]-me[2]));if(b.fpvSeeT<0.6)return;
  b.fpvShotT=(b.fpvShotT||0)-dt;if(b.fpvShotT>0||!b.arms||b.arms.mag<=0||b.arms.reload)return;b.fpvShotT=0.16+R()*0.12;b.arms.mag--;self.counters.botShots++;
  var hit=R()<0.34*clamp(1.3-Math.sqrt(bd)/30,0.3,1),end=tgt.pos.slice();if(!hit){end[0]+=R()*2-1;end[1]+=R()*1.4-0.6;end[2]+=R()*2-1;}
  if(T.combat&&T.combat.fx)T.combat.fx.tracers.add(eye,end);b.lastShotT=T.elapsed;if(hit)self.damage(tgt,12,b);});};
/* fpvPlayer: piloted drone inputs (keys from tacticalRtsInput) */
TD.prototype.pilotInput=function(K,yaw,pitch){var P=this.pilot;if(!P)return;var d=P.d;d.in.fw=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0);d.in.st=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0);
 d.in.up=(K.Space?1:0)-(K.ControlLeft?1:0);d.in.boost=!!K.ShiftLeft;d.yaw=yaw;d.pitch=pitch;};
TD.prototype.update=function(dt){var T=C().ns(this.app);if(!T.ready||T.paused)return;dt=Math.min(dt,0.05);
 for(var i=this.list.length-1;i>=0;i--){var d=this.list[i];if(!d.dead)this.step(d,dt);}
 if(this.list.length)this.botsShoot(dt);
 if(this.enemyDrones&&C().AI.on){this.enemyT-=dt;if(this.enemyT<=0){this.enemyT=60;var en=T.squad.filter(function(s){return s.alive&&s.team!=='friendly';});if(en.length)this.launchFpv(en[0],false);}}};
TD.prototype.reset=function(){this.list.slice().forEach(function(d){if(d.e)d.e.destroy();});this.list.length=0;this.pilot=null;};
})();
