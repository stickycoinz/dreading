/* tacticalSoldierDecision: one per soldier (added at runtime). Owns the soldier's state: team, role, order, health,
   Riposte arsenal loadout (primary + M9) and grenade inventory (tactical-arsenal.js / tactical-grenades.js, MIT),
   weapon (NIGHT_SURVIVAL M4 arms), Yuka vision/memory, path following, stance and the per-tick combat decision.
   New AI glue written here: target selection from memory, stance/peek in cover, fire/reload decisions,
   friendly firing-line check, yielding on narrow paths. Aim/trigger/look maths are the ported NS functions. */
var TacticalSoldierDecision=pc.createScript('tacticalSoldierDecision');
TacticalSoldierDecision.attributes.add('soldierName',{type:'string'});
TacticalSoldierDecision.attributes.add('role',{type:'string'});
TacticalSoldierDecision.attributes.add('team',{type:'string',default:'friendly'});
TacticalSoldierDecision.attributes.add('advanceIndex',{type:'number',default:0});
TacticalSoldierDecision.attributes.add('speed',{type:'number',default:3.2,title:'Move speed (m/s, NS bot cover run 3.2)'});
TacticalSoldierDecision.prototype.initialize=function(){
 var T=TacticalCommon.ns(this.app);this.uid=T.squad.length;this.start=TacticalCommon.v3(this.entity.getPosition()).slice();this.history=[];this.input={fire:false,reload:false};
 this.reset();T.squad.push(this);if(T.perception)T.perception.attach(this);
};
TacticalSoldierDecision.prototype.pos=function(){var p=this.entity.getPosition();return [p.x,p.y,p.z];};
TacticalSoldierDecision.prototype.reset=function(){var T=TacticalCommon.ns(this.app),NS=TacticalNS;
 this.entity.setPosition(this.start[0],this.start[1],this.start[2]);this.path=[];this.index=0;this.goal=null;this.goalText='';this.stage=0;this.released=false;this.hold=false;this.moving=false;this.moveDir=null;this.distance=0;this.routeError=null;this.chosenCover=null;this.coverRanking=[];this.history.length=0;this.decision='';
 this.alive=true;this.health=T.combat?T.combat.health:100;var AR=typeof TacticalArsenal!=='undefined'?TacticalArsenal:null,pid=AR?AR.loadoutFor(this.team,this.soldierName):'m4';this.loadout=[NS.makeArms(NS.WEAPONS[pid]||NS.WEAPONS.m4),NS.makeArms(NS.WEAPONS[AR?AR.secondaryFor(this.team):'m9']||NS.WEAPONS.m4)];this.arms=this.loadout[0];this.armsIdx=0;/* Riposte arsenal: primary (?weapon= / ?loadout=) + M9 sidearm */this.dmgMul=NS.DIFF.dmg;this.crouchAmt=0;this.wantCrouch=false;this.inCover=false;this.order=null;this.speedNow=0;
 var th=T.perception?T.perception.threatPoint(this.team):[0,0,0];this.lookYaw=Math.atan2(-(th[0]-this.start[0]),-(th[2]-this.start[2]));this.pitch=0;this.yawV=0;this.pitchV=0;
 this.target=null;this.aimT=null;this.reactT=0;this.seenT=0;this.lastSeenT=-99;this.lastHitT=-99;this.suppr=0;this.flinchT=0;this.deathT=null;this.blockedT=0;this.ignoreYieldT=0;this.controlled=false;this.lastShotT=-99;this.holdFire=0;
 this.aimP=null;this.burstLeft=0;this.lastShots=0;this.pauseT=0;this.outOfAmmo=false;this.aimHead=false;this.lastSupprT=-99;this.input.fire=false;this.input.reload=false;this.blindT=0;this.tossUntil=-99;this.fleeUntil=-99;this.wasVis=false;this.lastTgt=null;this.eyeY=null;this.airborne=false;if(T.grenades)T.grenades.giveInventory(this);/* Riposte grenades: per-life inventory */
 this.sector=null;this.lastAttacker=null;this.lastAttackerT=-99;this.sepMoveT=-99;this.focus=null;this.focusUntil=-99;this.assistThreat=null;this.assistUntil=-99;this.heardT=-99;this.heardKind=null;this.alertState='calm';this.suppress=null;this.supShots=0;this.pinnedSec=0;this.acSpot=null;this.acDwellUntil=-1;this.acNext=-1;this.acNextT0=-1;this.acMoves=0;this.coverWhy=null;this.duckUntil=-99;this.sideStepT=-99;this.mateMoveT=-99;this.holdFireSec=0;this.repoT=0;this.vel=[0,0];this.lastShotLog=null;this.fallbacks=0;var an=this.entity.script&&this.entity.script.tacticalSoldierAnimation;if(an){an.stats={};an.rateClamped=0;an.moveTime=0;an.transitions=0;}
 if(this.memory)this.memory.clear();if(this.regulator)this.regulator.reset((this.uid%64)/(64*(T.perception?T.perception.hz:5)));if(T.cover)T.cover.release(this);
 TacticalCommon.log(this.app,this,'Awaiting order');};
TacticalSoldierDecision.prototype.moveTo=function(target,text){
 var C=TacticalCommon,T=C.ns(this.app);this.goal=C.v3(target).slice();this.goalText=text;
 try{this.path=T.navigation.path(this.pos(),this.goal);this.index=1;this.routeError=null;C.log(this.app,this,text);return true;}
 catch(err){this.path=[];this.index=0;this.routeError=err.message;var msg=this.soldierName+': no route to '+C.fmt(this.goal)+' ('+err.message+')';console.warn('[TacticalSoldier] '+msg);C.log(this.app,this,'No navigable route: '+err.message);return false;}
};
TacticalSoldierDecision.prototype.stop=function(){this.path=[];this.index=0;this.goal=null;};
TacticalSoldierDecision.prototype.onNavigationRebuilt=function(report){
 var C=TacticalCommon,T=C.ns(this.app),p=this.pos(),q=T.navigation.nearest(p,{x:1.5,y:2,z:1.5});
 /* FP fix: the soldier under direct control is never teleported by a rebuild (it popped the camera); first-person movement re-snaps
    to the new navmesh smoothly (tacticalRtsInput.fpsTick, eye-height spring). Only an off-mesh controlled soldier is reported. */
 if(this.controlled||(T.input&&T.input.fps&&T.input.fps.s===this)){if(!q){var m0=this.soldierName+' (direct control) is off the new navmesh at '+C.fmt(p);report.errors.push(m0);report.problems.push({label:this.soldierName,position:p,message:m0,severity:'error'});}this.rebuildSkips=(this.rebuildSkips||0)+1;return;}
 if(q&&Math.hypot(q[0]-p[0],q[2]-p[2])>0.05){this.entity.setPosition(q[0],q[1],q[2]);}
 else if(!q){var msg=this.soldierName+' is standing off the new navmesh at '+C.fmt(p);report.errors.push(msg);report.problems.push({label:this.soldierName,position:p,message:msg,severity:'error'});}
 if(this.goal&&this.index<this.path.length){if(this.moveTo(this.goal,this.goalText))C.log(this.app,this,'Re-planned after navigation rebuild');}
};
TacticalSoldierDecision.prototype.follow=function(dt){
 var T=TacticalCommon.ns(this.app),self=this;this.moving=false;this.speedNow=0;
 /* terrain batch: off-mesh link traversal (vault / window drop / stair drop) runs to the landing even if the order changes */
 if(this.trav){var tq=TacticalTraversal.step(this,dt);this.entity.setPosition(tq[0],tq[1],tq[2]);this.moving=this.trav.phase!=='climb';this.speedNow=this.moving?1.2:0;this.crouchAmt=this.trav.phase==='climb'?1:0.6;
  if(!this.trav.done)return;var lh=this.trav.landH;this.trav=null;this.landT=T.elapsed;var fd=TacticalTraversal.fallDamage(lh);if(fd&&T.combat)T.combat.applyDamage(this,fd,null,'legs',null);if(!this.alive)return;}
 if(this.hold||this.index>=this.path.length)return;
 /* every new route segment is checked once: a link segment (both link ends adjacent in the route) is traversed, not walked through the wall */
 if((this._lkI!==this.index||this._lkP!==this.path)&&typeof TacticalTraversal!=='undefined'){this._lkI=this.index;this._lkP=this.path;var lm=this.index>0?TacticalTraversal.match(T,this.path[this.index-1],this.path[this.index]):null;
  if(lm){var p0=this.entity.getPosition();TacticalTraversal.begin(this,lm,[p0.x,p0.y,p0.z]);TacticalCommon.log(this.app,this,lm.l.kind==='vault'?'Vaulting a window':lm.l.kind==='stair'?'Dropping off the stairs':'Dropping from a window');return;}}
 var p=this.entity.getPosition(),t=this.path[this.index],dx=t[0]-p.x,dy=t[1]-p.y,dz=t[2]-p.z,dist=Math.hypot(dx,dy,dz);
 if(dist<.12){this.index++;}else{var sp=this.speed*(this.speedMul||1)*(this.crouchAmt>0.5?0.6:1),step=Math.min(dist,dt*sp),k=step/dist,nx=p.x+dx*k,ny=p.y+dy*k,nz=p.z+dz*k;
  this.ignoreYieldT-=dt;
  var neighbors=T.perception&&T.perception.useBroadphase?T.perception.nearSoldiers([nx,ny,nz],2,T.elapsed):T.squad;
  var close=this.ignoreYieldT<=0&&neighbors.some(function(o){if(o===self||!o.alive)return false;var q=o.entity.getPosition();return Math.hypot(q.x-nx,q.y-ny,q.z-nz)<.55&&o.uid<self.uid;});
  if(close){this.blockedT+=dt;if(this.blockedT>0.8){this.ignoreYieldT=1.2;this.blockedT=0;}}
  else{this.blockedT=0;this.entity.setPosition(nx,ny,nz);this.moveDir=[dx,dz];this.distance+=step;this.moving=true;this.speedNow=sp;}}
 if(this.path.length&&this.index>=this.path.length){this.path=[];this.index=0;this.goal=null;if(T.orders)T.orders.onArrived(this);}
};
TacticalSoldierDecision.prototype.update=function(dt){
 var T=TacticalCommon.ns(this.app),NS=TacticalNS,C=TacticalCommon;dt=Math.min(dt,.05);
 if(!T.running||T.paused||!this.alive){this.moving=false;return;}
 var now=T.elapsed,A=this.arms,D=NS.DIFF;
 NS.tickWeapon(A,dt,this.input);this.suppr=Math.max(0,(this.suppr||0)-dt*0.25);if(this.flinchT>0)this.flinchT-=dt;
 if(this.controlled||(T.input&&T.input.fps&&T.input.fps.s===this)){this.crouchAmt+=((this.wantCrouch?1:0)-this.crouchAmt)*Math.min(1,dt*12);return;}// tacticalRtsInput drives it
 this.follow(dt);
 // --- target selection (own memory: visible records first, nearest; tracking bonus as in NS botSense)
 var recs=this.memory?this.memory.getValidMemoryRecords(now,[]):[],best=null,bd=1e9,me=this.pos(),self=this;
 var AIon=C.AI.on,kAll=T.perception.known(this,true),sec=AIon&&this.sector&&!kAll.some(function(r){return !r.entity.isZombie;})?this.sector:null;/* sectors are the 360-degree zombie watch; against a located enemy squad the soldiers fight as before */
 if(this.focus&&(!this.focus.alive||now>this.focusUntil))this.focus=null;var foc=this.focus;
 var tc=AIon?TacticalSoldierDecision.targetCounts(T,this):null;
 var DOC=AIon&&(T.doctrine!==false||T.trainingMode)?TacticalSoldierDecision.DOC:null,tFoc=DOC&&T.doc&&T.doc[this.team]?T.doc[this.team].focus:null;
 recs.forEach(function(r){if(!r.visible||!r.entity.alive)return;var e=r.entity,p=e.pos(),d=Math.hypot(p[0]-me[0],p[2]-me[2])*(self.target===e?0.6:1),hitMe=tc&&self.lastAttacker===e&&now-self.lastAttackerT<3;
  if(DOC){var rd0=Math.hypot(p[0]-me[0],p[2]-me[2]);if(e.isZombie){if(!TacticalSoldierDecision.zombieWorthShot(self,e,rd0,now))return;}else{d*=DOC.human;if(tFoc===e)d*=DOC.focus;}}/* M6 doctrine: armed humans first; zombies only when close, chasing us or attacking */
  if(tc){/* pass C: who hit me, teammate under attack, no pile-up */
   if(hitMe)d*=0.25;
   var vt=e.target;if(vt&&vt!==self&&vt.alive&&vt.team===self.team)d*=e.isZombie?(e.state==='attack'?0.6:0.8):0.85;
   var n=tc.get(e)||0,cap=e.isZombie?2:3;if(n>=cap&&self.target!==e&&!hitMe&&e.target!==self&&self.focus!==e)d*=2.2;}
  if(window.DreadingSpecialistAI)d*=DreadingSpecialistAI.priority(self,e);if(foc===e)d*=0.05;/* pass D: ordered focus target */
  if(sec&&!hitMe&&foc!==e&&!(r.entity.isZombie&&r.entity.target===self)&&!TacticalSoldierDecision.inSector(sec,me,p))d*=1.4;/* pass B: prefer targets in my sector */
  if(r.entity.isZombie)d*=(r.entity.target===self?0.5:0.85)*(r.entity.type==='run'?0.8:1)*(r.entity.state==="attack"?0.6:1);/* pass 3 threat weighting */if(d<bd){bd=d;best=r.entity;}});
 /* M7: self-defence always - a zombie biting me / on top of me is my target whether I can see it or not (it is touching me), whatever the step or order */
 var meleeZ=null;if(AIon&&T.zombies&&T.zombies.length){var la=this.lastAttacker,md=3.2;if(la&&la.isZombie&&la.alive&&now-this.lastAttackerT<2.5){var lq=la.pos(),ld=Math.hypot(lq[0]-me[0],lq[2]-me[2]);if(ld<5&&Math.abs(lq[1]-me[1])<1.5){meleeZ=la;md=ld;}}
  if(!meleeZ)for(var zi=0;zi<T.zombies.length;zi++){var zz=T.zombies[zi];if(!zz.alive||zz.target!==this)continue;var zq=zz.pos(),zd=Math.hypot(zq[0]-me[0],zq[2]-me[2]);if(zd<md&&Math.abs(zq[1]-me[1])<1.5){md=zd;meleeZ=zz;}}
  if(meleeZ&&!(best&&best!==meleeZ&&!best.isZombie&&bd<md*0.3)){best=meleeZ;bd=0.01;foc=null;}}
 this.meleeZ=meleeZ;
 /* M9: being hit or seeing a nearby buddy hit interrupts focus and 90-degree watch sectors.
    A shooter outside the normal field of view may be faced immediately; fire still requires clear LOS. */
 var threatNow=this.lastAttacker&&this.lastAttacker.alive&&now-this.lastAttackerT<3?this.lastAttacker:null;
 var supportNow=this.assistThreat&&this.assistThreat.alive&&now-(this.assistUntil||-99)<0?this.assistThreat:null;
 var urgent=threatNow||supportNow;
 var urgentLos=false;
 if(urgent&&urgent.team!==this.team){var ep=urgent.pos(),dd=Math.hypot(ep[0]-me[0],ep[2]-me[2]);
  if(dd<32){urgentLos=!(T.perception.sightBlocked?T.perception.sightBlocked(NS.entEye(this),NS.entChest(urgent)):T.perception.blocked(NS.entEye(this),NS.entChest(urgent)));/* smoke stops sight */
   if(urgentLos){best=urgent;bd=0;foc=null;}
   else if(threatNow){best=null;foc=null;} // damage event triggers turning; shots still check LOS and aim tolerance
  }else urgent=null;
 }
 if(urgent){foc=null;}
 if(foc){if(best===foc)this.focusSeenT=now;else if(now-this.focusT<4&&!(best&&best.isZombie&&best.target===this&&bd<2)){best=null;}}/* pass D: turn to the ordered target first (4 s), only a zombie on top of me interrupts */
 if(AIon){var tp0=best||(this.target&&this.target.alive?this.target:null),rd=tp0?Math.hypot(tp0.pos()[0]-me[0],tp0.pos()[2]-me[2]):40;D=TacticalSoldierDecision.diffAt(this.team,rd);this.aimTol=rd<TacticalSoldierDecision.CLOSE.near?Math.max(0.035,Math.min(0.11,0.45/Math.max(rd,1))*(this.moving?1.4:1)):0.035;}else this.aimTol=0;/* M5b: fast close, slower far */
 if(best){if(this.target!==best||now-this.lastSeenT>1.2){this.reactT=C.rand(D.react[0],D.react[1])*(this.target===best?0.5:1);this.seenT=0;this.aimHead=C.random()<D.head&&bd<45;}
  this.target=best;this.lastSeenT=now;}
 else if(this.target&&!this.target.alive)this.target=null;
 if(AIon){var ast=(best||now-this.lastShotT<3||now-this.lastHitT<3)?'engaged':(now-this.heardT<8||kAll.length||now-this.lastSeenT<10)?'alert':'calm';/* pass E: calm / alert / engaged */
  if(ast!==this.alertState){if(this.alertState==='calm'&&ast==='alert')C.log(this.app,this,'Alert: '+(now-this.heardT<1?'heard '+this.heardKind:'threat reported'));this.alertState=ast;}}
 var vis=!!best,faceYaw=this.lookYaw,facePitch=0,dist=99,eye=NS.entEye(this);
 if(vis){var spot=this.aimHead?NS.entHead(best):NS.entChest(best),aim=NS.botAim(this,eye,spot,dt,now,D,best.moving);faceYaw=aim.yaw;facePitch=aim.pitch;dist=aim.dist;}
 else{var kF=DOC?kAll.filter(function(r){if(!r.entity.isZombie)return true;var lp=r.lastSensedPosition;return TacticalSoldierDecision.zombieWorthShot(self,r.entity,Math.hypot(lp[0]-me[0],lp[2]-me[2]),now);}):kAll;/* M8: do not turn to watch far zombies - armed enemies first */
  if(DOC)kF.sort(function(a,b){return (a.entity.isZombie?1:0)-(b.entity.isZombie?1:0);});
  var known=(foc&&kAll.find(function(r){return r.entity===foc;}))||(sec?TacticalSoldierDecision.pickKnown(kF,sec,me,this):kF[0]);
  var ang=AIon&&this.order&&this.order.angle&&this.order.face&&!this.moving;if(ang&&known){var lk0=known.lastSensedPosition;if(Math.hypot(lk0[0]-me[0],lk0[2]-me[2])<9)ang=false;}
  if(ang){faceYaw=Math.atan2(-(this.order.face[0]-me[0]),-(this.order.face[2]-me[2]))+Math.sin(now*0.5+this.uid*1.7)*0.25;}/* M7: holding an angle - watch the opening */
  else if(known){var lk=known.lastSensedPosition;if(Math.hypot(lk[0]-me[0],lk[2]-me[2])>1)faceYaw=Math.atan2(-(lk[0]-me[0]),-(lk[2]-me[2]));}
  else if(T.trainingMode&&sec)faceYaw=sec.yaw+Math.sin(now*0.55+this.uid*1.7)*Math.min(.18,sec.half*.2);/* Training: each moving teammate actually covers a different angle. */
  else if(this.moving&&this.moveDir)faceYaw=Math.atan2(-this.moveDir[0],-this.moveDir[1]);
  else if(urgent){var tq=urgent.pos();faceYaw=Math.atan2(-(tq[0]-me[0]),-(tq[2]-me[2]));}
  else if(sec)faceYaw=sec.yaw+Math.sin(now*(this.alertState==='alert'?1.1:0.55)+this.uid*1.7)*sec.half*(this.alertState==='alert'?0.9:0.7);/* pass B: scan my sector */
  else if(this.order&&this.order.face)faceYaw=Math.atan2(-(this.order.face[0]-me[0]),-(this.order.face[2]-me[2]));
  var sup=AIon&&this.suppress&&now<this.suppress.until&&!threatNow?this.suppress:null;/* M5: suppressive fire at the last known position */
  if(sup){var sp=[sup.p[0],sup.p[1]+1.1,sup.p[2]],sdx=sp[0]-eye[0],sdy=sp[1]-eye[1],sdz=sp[2]-eye[2],shd=Math.hypot(sdx,sdz);faceYaw=Math.atan2(-sdx,-sdz);facePitch=Math.atan2(sdy,shd);dist=Math.hypot(shd,sdy);var supOn=((now*0.8+this.uid*0.31)%1)<0.55;}}
 if(threatNow&&urgent&&!urgentLos){var rr=this.memory&&this.memory.hasRecord&&this.memory.hasRecord(urgent)?this.memory.getRecord(urgent):null,rp=rr&&rr.lastSensedPosition?rr.lastSensedPosition:urgent.pos();faceYaw=Math.atan2(-(rp[0]-me[0]),-(rp[2]-me[2]));facePitch=0;}
 if(urgent){D=Object.assign({},D,{turn:Math.max(D.turn,5.2),spin:Math.max(D.spin,7.5),lag:Math.min(D.lag,0.12)});}
 NS.lookSpring(this,faceYaw,facePitch,dt,D,vis);
 // --- stance: in cover, duck while reloading / just hit / scanning half the time; stand to fire
 var reloading=!!A.reload,recentlyHit=now-this.lastHitT<1.2;
 if(this.moving)this.wantCrouch=false;
 else if(sup&&!reloading)this.wantCrouch=false;
 else if(this.inCover){var scanUp=((now+this.uid*1.3)%4)<2.2;this.wantCrouch=reloading||recentlyHit||(!vis&&!scanUp);}
 else this.wantCrouch=false;
 if(!this.moving&&now<this.duckUntil)this.wantCrouch=true;
 if(meleeZ)this.wantCrouch=false;/* M7: stand and fight a zombie on me (no ducking while it bites) */
 if(AIon&&this.inCover&&!this.moving&&(this.suppr||0)>1.0&&!reloading&&!(vis&&bd<8)){this.wantCrouch=true;this.pinnedSec=(this.pinnedSec||0)+dt;}/* M5: pinned by suppressive fire - stays down */// asked to duck: a teammate needs the lane
 this.crouchAmt+=((this.wantCrouch?1:0)-this.crouchAmt)*Math.min(1,dt*6);
 // --- trigger
 var supFire=!vis&&!!sup&&supOn&&!this.moving&&A.mag>0;if(!vis&&sup&&A.mag<=0&&!A.reload)this.input.reload=true;
 var blind=now<(this.blindT||0);/* Riposte flashBang: a blinded soldier does not fire */
 var canShoot=!blind&&(vis||supFire)&&this.crouchAmt<0.6&&(!(this.order&&this.order.holdFire)||!!meleeZ);
 NS.botTrigger(this,A,vis||supFire,canShoot,dist,faceYaw,facePitch,dt,now,D,this.inCover||!this.moving);
 if(T.grenades&&AIon&&!blind)T.grenades.botConsider(this,best,vis,now,dt);/* Riposte 07b-tactics.js grenade use */
 if(this.input.fire&&!A.reload&&A.fireCd<=0&&A.mag>0&&(!NS.canCycle||NS.canCycle(A))){
  var f=NS.fwd(this.lookYaw,this.pitch),mate=T.combat.friendlyInLine(this,eye,f,dist);
  if(mate){var cn=T.combat.counters;cn.holdFireFriendly++;cn.holdFireSec+=dt;this.holdFireSec+=dt;if(this.decision.indexOf('Holding fire')<0)C.log(this.app,this,'Holding fire: '+mate.soldierName+' in the firing line');this.resolveLane(mate,eye,f,dist,now);}
  else{T.combat.shoot(this,eye,f,false);if(supFire){this.supShots++;T.combat.counters.suppressShots=(T.combat.counters.suppressShots||0)+1;}}}
 if(A.mag<=0&&A.reserve<=0&&!this.outOfAmmo){this.outOfAmmo=true;C.log(this.app,this,'Out of ammo');}
};

/* Pass 2 (new glue): clear a blocked firing lane instead of just holding fire.
   1) the blocking teammate ducks if the lane is clear over his crouched hit spheres;
   2) else the shooter side-steps 1.1-2.6 m perpendicular to the lane to a free navmesh spot with a clear lane;
   3) else an idle blocking teammate steps aside, away from the lane. Rate-limited per soldier. */
TacticalSoldierDecision.prototype.resolveLane=function(mate,eye,f,dist,now){var T=TacticalCommon.ns(this.app),C=TacticalCommon,cmb=T.combat,self=this;
 if(now<this.sideStepT)return;this.sideStepT=now+0.6;
 if(!mate.moving&&!mate.controlled&&mate.crouchAmt<0.5&&now>mate.duckUntil){var ca=mate.crouchAmt;mate.crouchAmt=1;var still=cmb.friendlyInLine(this,eye,f,dist);mate.crouchAmt=ca;
  if(still!==mate){mate.duckUntil=now+1.6;cmb.counters.mateDucks++;return;}}
 var free=function(q,who){return !T.squad.some(function(o){if(o===who||!o.alive)return false;var a=o.goal||o.pos();var b=o.pos();return Math.hypot(a[0]-q[0],a[2]-q[2])<0.9||Math.hypot(b[0]-q[0],b[2]-q[2])<0.9;});};
 var hideAll=C.AI.on&&T.orders&&T.orders.knownEnemyPos?T.orders.knownEnemyPos(T.squad.filter(function(o){return o.team===self.team&&o.alive;})):[],tgtP=self.target&&!self.target.isZombie?self.target.pos():null;
 var seenBy=function(q,skipT){return hideAll.some(function(h){if(Math.hypot(h[0]-q[0],h[2]-q[2])>45)return false;if(skipT&&tgtP&&Math.hypot(h[0]-tgtP[0],h[2]-tgtP[2])<2)return false;return T.orders.bLine(h,q);});};/* M8: no step into a known enemy's sight line (except the one I am shooting at) */
 var hl=Math.hypot(f[0],f[2])||1,r=[f[2]/hl,0,-f[0]/hl],me=this.pos(),aim=[eye[0]+f[0]*dist,eye[1]+f[1]*dist,eye[2]+f[2]*dist],ot=this.order&&this.order.type;
 if(!this.moving&&(!ot||ot==='move'||ot==='cover'||ot==='defend'||ot==='hunt')){
  var offs=[1.1,-1.1,1.8,-1.8,2.6,-2.6];for(var i=0;i<offs.length;i++){var p=[me[0]+r[0]*offs[i],me[1],me[2]+r[2]*offs[i]],q=T.navigation.nearest(p,{x:0.5,y:1,z:0.5});
   if(!q||Math.hypot(q[0]-p[0],q[2]-p[2])>0.4||Math.abs(q[1]-me[1])>0.5||!free(q,this))continue;var ha=T.orders&&TacticalSquadOrders.held(this);if(ha&&(Math.hypot(q[0]-ha[0],q[2]-ha[2])>TacticalSquadOrders.HOLD_SLACK||!TacticalSoldierDecision.shortWalk(T,me,q)))continue;
   var e2=[q[0],q[1]+1.62,q[2]],d2=[aim[0]-e2[0],aim[1]-e2[1],aim[2]-e2[2]],L=Math.hypot(d2[0],d2[1],d2[2])||1;d2=[d2[0]/L,d2[1]/L,d2[2]/L];
   if(cmb.friendlyInLine(this,e2,d2,L)||C.rayWorld(e2,d2,L-0.5,T.perception.blockers)||seenBy(q,true))continue;
   if(this.moveTo(q,'Side-step: clearing the lane past '+mate.soldierName)){if(this.order)this.order.dest=q;if(T.cover)T.cover.release(this);this.inCover=false;this.sideStepT=now+2.5;cmb.counters.sideSteps++;return;}}}
 var mo=mate.order&&mate.order.type;
 if(!mate.moving&&!mate.controlled&&!mate.inCover&&now>mate.mateMoveT&&mo!=='assault'&&!(mo==='brain'&&mate.order.brain==='assault')){/* M6: a mate in cover ducks (above) instead of leaving it */var mp=mate.pos(),side=((mp[0]-me[0])*r[0]+(mp[2]-me[2])*r[2])>=0?1:-1;
  [1.2,2.0].some(function(o){var p=[mp[0]+r[0]*o*side,mp[1],mp[2]+r[2]*o*side],q=T.navigation.nearest(p,{x:0.5,y:1,z:0.5});
   if(!q||Math.hypot(q[0]-p[0],q[2]-p[2])>0.4||!free(q,mate)||seenBy(q,false))return false;var hm=TacticalSquadOrders.held(mate);if(hm&&(Math.hypot(q[0]-hm[0],q[2]-hm[2])>TacticalSquadOrders.HOLD_SLACK||!TacticalSoldierDecision.shortWalk(T,mp,q)))return false;if(mate.moveTo(q,'Stepping aside for '+self.soldierName)){if(mate.order)mate.order.dest=q;if(T.cover)T.cover.release(mate);mate.inCover=false;mate.mateMoveT=now+3;cmb.counters.mateMoves++;return true;}return false;});}
};

/* pass B helpers: is a point inside a sector (yaw convention of lookYaw: forward = (-sin, -cos)); which known threat to face */
TacticalSoldierDecision.angDiff=function(a,b){var d=(a-b)%(2*Math.PI);if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;return Math.abs(d);};
TacticalSoldierDecision.inSector=function(sec,me,p){return TacticalSoldierDecision.angDiff(Math.atan2(-(p[0]-me[0]),-(p[2]-me[2])),sec.yaw)<=sec.half;};
TacticalSoldierDecision.pickKnown=function(list,sec,me,self){var best=null,bd=1e9,T=self?TacticalCommon.ns(self.app):null;list.forEach(function(r){var lk=r.lastSensedPosition,d=Math.hypot(lk[0]-me[0],lk[2]-me[2]);
 /* far threats outside my sector belong to a teammate - unless no living teammate's sector covers them */
 if(!TacticalSoldierDecision.inSector(sec,me,lk)&&d>12&&T&&T.squad.some(function(o){return o!==self&&o.alive&&o.team===self.team&&!o.controlled&&o.sector&&TacticalSoldierDecision.inSector(o.sector,o.pos(),lk);}))return;if(d<bd){bd=d;best=r;}});return best;};
/* pass C: how many teammates (other than me) currently target each entity; one pass over the squad per soldier tick */
/* M6 zombie-apocalypse doctrine: gunfire is noise (draws zombies within the weapon's noise radius), so shots at zombies are spent
   only on zombies that are a threat: within 'close' m, chasing me or a teammate (within 'chase' m), or attacking. Armed humans weigh more. */
TacticalSoldierDecision.DOC={close:15,chase:30,chaseNear:10,human:0.45,focus:0.7};
TacticalSoldierDecision.zombieWorthShot=function(s,z,d,now){var K=TacticalSoldierDecision.DOC;if(d<K.close)return true;if(s.lastAttacker===z&&now-s.lastAttackerT<3)return true;if(s.focus===z)return true;
 /* M8: far zombies are left alone - only one biting a teammate, or chasing one at close range (< 10 m from him), within 30 m of me */
 var t=z.target;if(t&&t.alive&&t.team===s.team&&d<K.chase){if(z.state==='attack')return true;var tp=t.pos(),zp=z.pos();if(Math.hypot(tp[0]-zp[0],tp[2]-zp[2])<K.chaseNear)return true;}return false;};
/* M6: a held soldier's lane step must be a short direct walk (no detour around a wall that would take him out of his spot) */
TacticalSoldierDecision.shortWalk=function(T,a,b){var p=null;try{p=T.navigation.path(a,b);}catch(e){p=null;}if(!p||p.length<2)return false;var L=0;for(var i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][2]-p[i-1][2]);return L<=Math.hypot(b[0]-a[0],b[2]-a[2])*1.3+0.3;};
TacticalSoldierDecision.targetCounts=function(T,self){var m=new Map();T.squad.forEach(function(o){if(o===self||!o.alive||o.team!==self.team||!o.target)return;m.set(o.target,(m.get(o.target)||0)+1);});return m;};

/* M5b: aim / reaction by range. Under 10 m both teams react in ~0.1-0.18 s, settle and turn fast, and may fire while moving
   or still turning (wider trigger tolerance, set per frame from range). Beyond that it blends to the normal values by 30 m,
   where the enemy-only scale (ENEMY, fairness) applies in full. Damage and health untouched. */
TacticalSoldierDecision.ENEMY={react:1.29,err:1.37,settle:1.2,head:0.8};
TacticalSoldierDecision.ENEMY_ERR_K=1;/* M5b: share of the enemy aim-error scale kept at close range (reaction stays fast) */
TacticalSoldierDecision.CLOSE={near:10,far:30,react:0.35,settle:0.3,lag:0.4,turn:2.0,err:0.6};
TacticalSoldierDecision.diffAt=function(team,dist){var Q=TacticalSoldierDecision.CLOSE,k=Math.max(0,Math.min(1,(dist-Q.near)/(Q.far-Q.near)));k=Math.round(k*4)/4;
 var E=team==='enemy'?TacticalSoldierDecision.ENEMY:{react:1,err:1,settle:1,head:1},key=team+'|'+k+'|'+TacticalSoldierDecision.ENEMY_ERR_K+'|'+E.react+'|'+E.err+'|'+E.settle+'|'+E.head+'|'+Q.react+'|'+Q.settle+'|'+Q.lag+'|'+Q.turn+'|'+Q.err,c=this._dc||(this._dc={});if(c[key])return c[key];
 var B=TacticalNS.DIFF,o={},l=function(a,b){return a+(b-a)*k;};for(var n in B)o[n]=B[n];
 var em=function(v){return 1+(v-1)*k;};
 o.react=[B.react[0]*l(Q.react,1)*em(E.react),B.react[1]*l(Q.react,1)*em(E.react)];o.settle=B.settle*l(Q.settle,1)*em(E.settle);o.err=B.err*l(Q.err,1)*(1+(E.err-1)*Math.max(k,TacticalSoldierDecision.ENEMY_ERR_K));o.head=B.head*em(E.head);
 o.lag=B.lag*l(Q.lag,1);o.turn=B.turn*l(Q.turn,1);o.spin=B.spin*l(Q.turn,1);c[key]=o;return o;};
TacticalSoldierDecision.enemyDiff=function(){return TacticalSoldierDecision.diffAt('enemy',99);};
