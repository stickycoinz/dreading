/* tacticalCombat: hitscan shooting for AI soldiers and the directly-controlled soldier. Riposte arsenal (tactical-arsenal.js):
   pellets, bolt/pump cycling, bipod, per-gun noise, drones are shootable (tactical-drones.js rayDrones).
   Ported pieces live in tactical-ns-combat.js (NIGHT_SURVIVAL fireRay / rayEntities / coneDir / falloff / spread /
   recoil / mag-reload / muzzle flash / tracers / impacts). This script is the PlayCanvas glue: world ray =
   TacticalCommon.rayWorld against the Editor blockers (walls stop shots), entity ray = NS hit spheres (enemies only:
   no friendly fire, as in NIGHT_SURVIVAL rayEntities), damage + health + death, counters for the tests. */
var TacticalCombat=pc.createScript('tacticalCombat');
TacticalCombat.attributes.add('damageMul',{type:'number',default:1,title:'Damage multiplier',description:'Extra multiplier on the tuned rifle damage (TacticalCombat.TUNING). 1 = documented TTK.'});
TacticalCombat.attributes.add('health',{type:'number',default:100,title:'Soldier health'});
TacticalCombat.attributes.add('tracerChance',{type:'number',default:0.6,title:'AI tracer chance (NS bots 0.6)'});
/* Pass 2 tuning (user: slower, Arc Raiders-like TTK). Overrides the NIGHT_SURVIVAL M4 numbers in place so bots and the
   player (T mode) use the exact same rifle. Body TTK with every shot landing = (ceil(100/dmg)-1) * 60/rpm:
   <=20 m: 6.4 dmg -> 16 hits -> 1.5 s; 35 m: 5.5 -> 19 hits -> 1.8 s; >=50 m: 4.6 -> 22 hits -> 2.1 s.
   Head x2.0 (12.8 close -> 8 hits, 0.7 s), legs x0.75. Bots no longer get the NS 0.88 damage handicap (same weapon). */
TacticalCombat.TUNING={rpm:600,dmg:[25,18],range:[20,50],head:2.8,legs:0.75,mag:30,reserve:150,reload:2.1,reloadEmpty:2.6,botDmgMul:1.0,health:150};
TacticalCombat.prototype.initialize=function(){var T=TacticalCommon.ns(this.app),U=TacticalCombat.TUNING,W=TacticalNS.WEAPONS.m4;T.combat=this;this.fx=null;
 ['rpm','dmg','range','head','legs','mag','reserve','reload','reloadEmpty'].forEach(function(k){W[k]=Array.isArray(U[k])?U[k].slice():U[k];});TacticalNS.DIFF.dmg=U.botDmgMul;this.health=U.health;
 var AT=typeof TacticalArsenal!=='undefined'?TacticalArsenal.tune(U):null;/* Riposte arsenal: same TTK ratio as the tuned M4 */
 T.tuning={arsenal:AT,weapon:{rpm:W.rpm,dmg:W.dmg,range:W.range,head:W.head,legs:W.legs,mag:W.mag,reserve:W.reserve,reload:W.reload,reloadEmpty:W.reloadEmpty,spreadHipRad:W.spread[0],spreadAdsRad:W.spread[1],moveSpreadRad:W.moveSpread,adsTime:W.adsTime},diff:TacticalNS.DIFF,health:U.health};this.resetCounters();};
TacticalCombat.prototype.resetCounters=function(){this.counters={shots:0,hits:0,headshots:0,kills:0,worldHits:0,misses:0,shotsWhileReloading:0,shotsWithEmptyMag:0,holdFireFriendly:0,holdFireSec:0,sideSteps:0,mateDucks:0,mateMoves:0,friendlyHits:0};this.log=[];};
TacticalCombat.prototype.update=function(dt){var T=TacticalCommon.ns(this.app);if(!T.camera)return;if(!this.fx){this.fx=TacticalNS.createFx(this.app,T.root);/* pass 4b: prewarm every fx batch once at load, 3 m under the ground in front of the camera (depth-hidden, cull=false), so the first firefight does not stall on shader/buffer setup */try{var cp=(T.activeCamera||T.camera).getPosition(),fw=(T.activeCamera||T.camera).forward,q=[cp.x+fw.x*6,-3,cp.z+fw.z*6],NS=TacticalNS;var F=this.fx;/* fixed arguments: no seeded random numbers are consumed */F.add.spawn(q[0],q[1],q[2],0,0,0,0.2,0.03,0.01,3.2,2.2,1.0,1,0,12,0.5);F.smoke.spawn(q[0],q[1],q[2],0,0.4,0,1.0,0.18,0.9,0.62,0.58,0.52,0.55,0,0,1.6);F.blood.spawn(q[0],q[1],q[2],0,0.2,0,0.5,0.25,0.75,0.3,0.02,0.02,0.85,0,0,2);F.tracers.add(q,[q[0]+6,q[1],q[2]]);void NS;}catch(e){}}this.fx.update(T.paused?0:Math.min(dt,0.05),T.activeCamera||T.camera);};
TacticalCombat.prototype.list=function(){var T=TacticalCommon.ns(this.app);return T.zombies&&T.zombies.length?T.squad.concat(T.zombies):T.squad;};// pass 3: zombies are shootable targets
/* fireRay (port of 07-bots.js:310): world first, then hit spheres up to the wall distance. */
TacticalCombat.prototype.fireRay=function(shooter,origin,dir,muzzle,tracer){
 var T=TacticalCommon.ns(this.app),NS=TacticalNS,maxD=300,now=T.elapsed;
 var w=TacticalCommon.rayWorld(origin,dir,maxD,T.perception.blockers),wt=w?w.t:maxD;
 var eh=NS.rayEntities(origin,dir,wt,shooter,this.list(),false);
 var dh=T.drones&&T.drones.rayDrones?T.drones.rayDrones(shooter,origin,dir,eh?eh.t:wt):null;/* Riposte rayDrones: a drone in front of the first body/wall takes the bullet */
 if(dh){var dEnd=[origin[0]+dir[0]*dh.t,origin[1]+dir[1]*dh.t,origin[2]+dir[2]*dh.t];if(tracer&&muzzle&&this.fx)this.fx.tracers.add(muzzle,dEnd);if(this.fx)NS.impactFx(this.fx,dEnd,[-dir[0],-dir[1],-dir[2]],false);T.drones.damage(dh.d,NS.damageAt(shooter.arms.def,dh.t,'body',1),shooter);this.counters.droneHits=(this.counters.droneHits||0)+1;return {eh:null,w:null,end:dEnd,drone:dh.d,rec:{result:'drone'}};}
 var endT=eh?eh.t:wt,end=[origin[0]+dir[0]*endT,origin[1]+dir[1]*endT,origin[2]+dir[2]*endT];
 if(tracer&&muzzle&&this.fx)this.fx.tracers.add(muzzle,end);
 var rec={t:+now.toFixed(2),shooter:shooter.soldierName,result:eh?'hit':w?'world':'miss',target:eh?eh.ent.soldierName:null,part:eh?eh.part:null,wall:w&&!eh?w.shape.name:null,dist:+endT.toFixed(1)};
 if(eh){var dmg=NS.damageAt(shooter.arms.def,endT,eh.part,(this.damageMul||1)*(shooter.dmgMul||1))*(eh.ent.dmgTakenMul?eh.ent.dmgTakenMul(eh.part):1);if(eh.ent.isZombie){this.counters.zombieHits2=(this.counters.zombieHits2||0)+1;if(eh.part==='head')this.counters.zombieHeadshots=(this.counters.zombieHeadshots||0)+1;}rec.dmg=+dmg.toFixed(1);
  if(this.fx)NS.bloodFx(this.fx,end,dir,eh.part==='head');this.counters.hits++;if(eh.part==='head')this.counters.headshots++;
  if(eh.ent.team===shooter.team)this.counters.friendlyHits++;
  this.applyDamage(eh.ent,dmg,shooter,eh.part,dir);}
 else if(w){if(this.fx)NS.impactFx(this.fx,end,w.n,false);this.counters.worldHits++;}
 else this.counters.misses++;
 NS.suppressAlongRay(shooter,origin,dir,endT,eh?eh.ent:null,this.list(),now);
 this.log.push(rec);if(this.log.length>400)this.log.shift();
 return {eh:eh,w:w,end:end,rec:rec};
};
/* One trigger pull. origin/dir: eye + look (AI) or camera (player). Guards are asserted, not just assumed. */
TacticalCombat.prototype.shoot=function(s,origin,f,isPlayer){
 var T=TacticalCommon.ns(this.app),NS=TacticalNS,A=s.arms,now=T.elapsed,d=A.def;
 if(A.reload){this.counters.shotsWhileReloading++;return null;}if(A.mag<=0){this.counters.shotsWithEmptyMag++;return null;}if(A.boltT>0||A.switching>0){this.counters.shotsWhileCycling=(this.counters.shotsWhileCycling||0)+1;return null;}
 var air=!!(s.airborne),spread=NS.shotSpread(A,s.speedNow||0,s.crouchAmt>0.5,air);
 var right=NS.fwd(s.lookYaw-Math.PI/2,0),muzzle=isPlayer?[origin[0]+f[0]*0.7+right[0]*0.12,origin[1]+f[1]*0.7-0.09,origin[2]+f[2]*0.7+right[2]*0.12]:[origin[0]+f[0]*0.75+right[0]*0.18,origin[1]-0.2+f[1]*0.75,origin[2]+f[2]*0.75+right[2]*0.18];
 if(isPlayer&&window.DreadingShotOrigin)muzzle=DreadingShotOrigin.muzzle(T,s,origin,f,muzzle);
 this.counters.shots++;
 /* Riposte ctlShoot:234-239: shotguns fire d.pellets rays, each with the hip->ADS pellet cone; one tracer for the first pellet */
 var pellets=d.cat==='shotgun'?Math.max(1,Math.min(24,Math.round(d.pellets||1))):1,r=null,best=null;
 for(var pi=0;pi<pellets;pi++){var dir=NS.coneDir(f,pellets>1?NS.pelletSpread(A):spread);
  var shot=isPlayer&&window.DreadingShotOrigin?DreadingShotOrigin.solve(T,this,s,origin,dir,muzzle):{origin:origin,dir:dir,muzzle:muzzle};
  if(pi===0){this.lastShotGeometry={eye:origin.slice(),barrel:muzzle.slice(),origin:shot.origin.slice(),direction:shot.dir.slice(),blocked:!!shot.blocked,target:shot.target};}
  var rr=this.fireRay(s,shot.origin,shot.dir,shot.muzzle,pi===0&&(isPlayer?(pellets===1&&TacticalCommon.random()<0.25)||(pellets>1&&TacticalCommon.random()<0.5):TacticalCommon.random()<this.tracerChance));
  if(!r)r=rr;if(rr&&rr.eh&&(!best||!best.eh))best=rr;}
 if(pellets>1){r=best||r;this.counters.pellets=(this.counters.pellets||0)+pellets;}
 var k=NS.afterShot(A,now,s.crouchAmt>0.5,s.speedNow||0,isPlayer,air);var cameraRecoil=isPlayer?(window.DreadingAnimationSettings?DreadingAnimationSettings.cameraRecoil:0.25):1;
 s.pitch=NS.clamp(s.pitch+k.kv*cameraRecoil,-1.5,1.5);s.lookYaw+=k.kh*cameraRecoil;if(isPlayer){s.recPend=(s.recPend||0)+k.kv*cameraRecoil;}
 var flash=this.lastShotGeometry&&isPlayer?this.lastShotGeometry.origin:muzzle;s.lastMuzzle=flash.slice();if(r)r.muzzle=flash.slice();
 if(this.fx)NS.muzzleWorldFx(this.fx,flash,f,1);s.lastShotT=now;
 // gunfire is heard: enemies within 40 m get a rough fix on the shooter (NIGHT_SURVIVAL soundEvents idea)
 var P=T.perception;T.squad.forEach(function(o){if(o.alive&&o.team!==s.team&&Math.hypot(o.pos()[0]-origin[0],o.pos()[2]-origin[2])<40)P.sense(o,s,now,3);});var nR=(d&&d.noise)||(typeof TacticalZombies!=='undefined'?TacticalZombies.CONFIG.hearRange:60);T.noise={p:origin.slice(),t:now,r:nR,team:s.team,who:s.soldierName||''};if(T.zombieMgr)T.zombieMgr.hear(origin,s,now,nR);// gunshots draw zombies within the weapon's noise radius (rifle 60 m)
 var tg=s.target;if(tg&&tg.alive&&!tg.isZombie&&tg.team&&tg.team!==s.team){var G=T.gunfight||(T.gunfight={});G[s.team]=now;G[tg.team]=now;}/* M6: human-vs-human gunfire */
 return r;
};
/* Firing-line check (new AI glue): is a teammate inside the cone between me and my aim point? */
TacticalCombat.prototype.friendlyInLine=function(s,origin,dir,dist){var mates=this.list().filter(function(o){return o!==s&&o.team===s.team&&o.alive;});
 var h=TacticalNS.rayEntities(origin,dir,dist,s,mates,true,0.35);return h?h.ent:null;};
TacticalCombat.prototype.applyDamage=function(v,dmg,attacker,part,dir){
 var T=TacticalCommon.ns(this.app),now=T.elapsed;if(!v.alive)return;
 if(!Number.isFinite(dmg)||dmg<=0)return;
 v.health-=dmg;v.lastHitT=now;if(attacker&&!attacker.isZombie&&attacker.team&&!v.isZombie&&v.team&&attacker.team!==v.team){var G=T.gunfight||(T.gunfight={});G[attacker.team]=now;G[v.team]=now;}if(attacker&&!v.isZombie&&TacticalCommon.AI.on){v.lastAttacker=attacker;v.lastAttackerT=now;}v.flinchT=0.3;v.suppr=Math.min(1.5,(v.suppr||0)+0.3);
 if(T.perception&&attacker&&!v.isZombie&&!attacker.disabled){
  T.perception.sense(v,attacker,now,0.75);
  // Nearby friends share the emergency callout, but still verify a clear shot before firing.
  T.squad.forEach(function(m){if(m===v||!m.alive||m.disabled||m.team!==v.team)return;
   var a=m.pos(),p=v.pos();if(Math.hypot(a[0]-p[0],a[2]-p[2])>18||Math.abs(a[1]-p[1])>5)return;
   m.assistThreat=attacker;m.assistUntil=now+3.5;T.perception.sense(m,attacker,now,1.2);
  });
 }
 if(!v.isZombie)this.app.fire('tactical:damage',v,dmg,attacker,part);
 if(v.health<=0)this.kill(v,attacker,part);
 if(v.onDamaged)v.onDamaged(attacker,dmg,part,dir);
};
TacticalCombat.prototype.kill=function(v,attacker,part){var T=TacticalCommon.ns(this.app);v.health=0;v.alive=false;v.deathT=T.elapsed;v.path=[];v.index=0;v.moving=false;
 if(v.isZombie){this.counters.zombieKills=(this.counters.zombieKills||0)+1;if(T.zombieMgr)T.zombieMgr.onKilled(v,attacker,part);v.decision='Dead';return;}
 this.counters.kills++;
 if(T.cover)T.cover.release(v);TacticalCommon.log(this.app,v,'KIA'+(attacker?' (by '+attacker.soldierName+(part==='head'?', headshot':'')+')':''));
 T.events.push({time:+T.elapsed.toFixed(2),soldier:v.soldierName,decision:'killed by '+(attacker?attacker.soldierName:'?')});this.app.fire('tactical:kill',v,attacker);};
