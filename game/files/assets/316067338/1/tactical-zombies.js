/* tacticalZombies (pass 3, NEW code): runtime zombie waves around the objective. Created at runtime by tacticalController
   (no Editor entities). Zombies are duck-typed like soldiers (pos(), alive, team 'zombie', health, crouchAmt, lastHitT)
   so the existing perception, NS hit spheres, hitscan, damage and soldier target selection work on them unchanged.
   - model: zombie_tripo_anims.glb (Tripo mesh + Mixamo zombie clips, untextured) with a runtime procedural "grim" skin
     texture (mottled grey-green flesh, bruising, veins, dried blood) and a per-zombie material for the hit flash
   - perception: Yuka Vision (TacticalYuka, MIT) per zombie + Regulator; hearing gunshots (tacticalCombat.shoot calls hear())
   - behaviour: wander/idle -> investigate noise -> scream (alerts zombies within 25 m) -> chase on the navmesh
     (walkers / runners / crawlers) -> melee attack with damage -> physical hit recoil -> death clip
   - separation: spatial hash (1.5 m cells) pushes zombies apart and off soldiers so they don't stack
   - waves: spawn ring 28-45 m around the objective, >=18 m from friendlies; runners only
   All gameplay randomness uses the seeded TacticalCommon RNG; texture noise uses its own fixed visual generator. */
var TacticalZombies=pc.createScript('tacticalZombies');
/* pass 4b perf: packs (one leader thinks, followers steer along its trail) + animation LOD. URL ?packs=0 / ?animlod=0 turn them off. */
TacticalZombies.PERF={pathsPerFrame:8,repathKeep:0.75,snapEvery:2,snapSep:0.5,packs:true,packMin:6,packMax:10,packJoin:16,engage:7,rejoin:20,crumb:1.5,trailMax:40,animLod:true,lodNear:25,lodMid:50,lodOff:6,shadowNear:30,shadowFar:40};
/* feeding: the ground feed loop plays ONLY on a dead squad member's corpse. Up to 6 slots in a ring per corpse; claimed by zombies whose target just died within claimRange. Feeders ignore sight; they wake on gunshots (hear), damage, or a live soldier within 'wake' m. */
TacticalZombies.FEED={on:true,slots:6,ring:0.85,claimRange:14,wake:4,clip:'bite_2'};/* measured clip head heights: bite_2 0.30 m (on the ground), bite 1.52->0.25 (kneels down), neck_bite 1.43 (standing) */
TacticalZombies.CONFIG={
 types:{walk:{speed:1.15,hp:90,clip:'walk',clipSpeed:0.8,dmg:16,hitK:0.94},
        run:{speed:3.8,hp:60,clip:'run',clipSpeed:3.6,dmg:12,hitK:0.94},
        crawl:{speed:0.6,hp:45,clip:'crawl',runClip:'crawl_run',clipSpeed:0.45,dmg:10,hitK:0.38}},
 crawlShare:0,runnerBonus:1, // runners: NS wave formula +10% (wave 1 = 20%, wave 6 = 60%, cap 65%)
 sight:26,fovDeg:150, // NS NSZ_SEE 26 m, NSZ_FOV 75 deg half-angle
hearRange:60,screamRadius:25,screamChance:0.35,attackRange:1.35,
 bodyMul:0.65,speedBoost:1.15,headMul:1.75,         // x NS head 2.0 -> 3.5x on zombies: headshots drop a walker in 3 hits
 maxAlive:150,timerMaxAlive:40,pool:156,batch:10,/* the panel button may fill up to 150 (fix150); automatic timer waves keep the tuned 40-alive cap */firstWave:40,waveSize:10,waveGrow:3,waveEvery:75,spawnMin:28,spawnMax:45,keepAway:18,
 sense:4               // perception Hz
};
TacticalZombies.prototype.initialize=function(){var T=TacticalCommon.ns(this.app);try{var q=new URLSearchParams(location.search);if(q.get('packs')==='0')TacticalZombies.PERF.packs=false;if(q.get('animlod')==='0')TacticalZombies.PERF.animLod=false;if(q.get('feed')==='0')TacticalZombies.FEED.on=false;if(q.get('zfield')==='0')TacticalZombies.FIELD.on=false;}catch(e){}this.frame=0;this.packs=[];this.corpses=new Map();T.zombieMgr=this;T.zombies=[];var zs=this;this.app.on('tactical:navRebuilt',function(r){zs.onNavPatched(r);});this.pool=[];this.on=true;this.waveSize=TacticalZombies.CONFIG.waveSize;
 this.wave=0;this.nextWaveT=TacticalZombies.CONFIG.firstWave;this.lastWaveSize=0;this.ready=false;this.stats={spawned:0,screams:0,attacks:0,hitsOnSoldiers:0,kills:0,headshotKills:0,alerts:0,heard:0,culled:0};this.uidSeq=0;};
TacticalZombies.prototype.setup=function(glb){var self=this;this.glb=glb;this.mat=this.makeMaterial();this.ready=true;};
/* ---------- grim material: procedural texture, no external files ---------- */
TacticalZombies.prototype.makeMaterial=function(){var app=this.app,N=512,cv=document.createElement('canvas');cv.width=cv.height=N;var g=cv.getContext('2d'),seed=1337;
 var r=function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 g.fillStyle='rgb(92,98,84)';g.fillRect(0,0,N,N);
 var blot=function(n,rad,cols,alpha){for(var i=0;i<n;i++){var x=r()*N,y=r()*N,rr=rad[0]+r()*(rad[1]-rad[0]),c=cols[Math.floor(r()*cols.length)],gr=g.createRadialGradient(x,y,0,x,y,rr);
  gr.addColorStop(0,'rgba('+c+','+alpha+')');gr.addColorStop(1,'rgba('+c+',0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,rr,0,7);g.fill();}};
 blot(220,[8,40],['70,76,64','112,118,98','58,62,56','96,90,78'],0.55);       // mottled dead flesh
 blot(60,[10,34],['72,50,78','60,44,66','88,70,60'],0.45);                     // bruising
 g.strokeStyle='rgba(40,46,58,0.35)';g.lineWidth=1.2;for(var v=0;v<90;v++){var x=r()*N,y=r()*N;g.beginPath();g.moveTo(x,y);for(var k=0;k<6;k++){x+=(r()-0.5)*26;y+=(r()-0.5)*26;g.lineTo(x,y);}g.stroke();} // veins
 blot(45,[6,26],['70,14,10','52,10,8','96,22,14'],0.75);                       // dried / fresh blood
 blot(30,[18,60],['30,30,26'],0.5);                                            // grime
 var img=g.getImageData(0,0,N,N),d=img.data;for(var i=0;i<d.length;i+=4){var n=(r()-0.5)*22;d[i]+=n;d[i+1]+=n;d[i+2]+=n;}g.putImageData(img,0,0);
 var tex=new pc.Texture(app.graphicsDevice,{width:N,height:N,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR});tex.setSource(cv);
 var m=new pc.StandardMaterial();m.diffuseMap=tex;m.diffuse=new pc.Color(0.82,0.84,0.8);m.useMetalness=true;m.metalness=0;m.gloss=0.32;m.specular=new pc.Color(0.25,0.22,0.2);
 m.emissive=new pc.Color(0,0,0);m.cull=pc.CULLFACE_NONE;m.update();this.texture=tex;return m;};
/* ---------- pool ---------- */
TacticalZombies.prototype.make=function(){var T=TacticalCommon.ns(this.app),i=this.pool.length,glb=this.glb,self=this;
 var z={uid:1000+i,soldierName:'Z'+(i+1),team:'zombie',history:[],decision:'',alive:false,active:false,health:0,crouchAmt:0,lastHitT:-99,moving:false,speedNow:0,suppr:0,arms:{reload:null},path:[],index:0,isZombie:true};
 var e=new pc.Entity(z.soldierName);T.root.addChild(e);var model=glb.resource.instantiateRenderEntity();var pivot=new pc.Entity('pivot');e.addChild(pivot);pivot.addChild(model);// pivot carries tilt/sink: the GLB's single root node 'Zombie' IS the model and holds the Z-up->Y-up rotation + 1.894 scale, never overwrite it
 z.pivot=pivot;model.addComponent('anim',{activate:true});
 glb.resource.animations.forEach(function(a){model.anim.assignAnimation(a.resource.name,a.resource,undefined,1,!/attack|^bite$|neck_bite|scream|death|dying/.test(a.resource.name));});
 var original=glb.resource.materials&&glb.resource.materials[0];var mat=(original&&original.resource?original.resource:this.mat).clone();mat.update();model.findComponents('render').forEach(function(r){r.castShadows=true;r.meshInstances.forEach(function(mi){mi.material=mat;
  /* pass 4b: fixed local AABB (1.3 m box around the body in every pose) instead of re-deriving it from ~65 bone boxes per mesh, per camera and per shadow cascade every frame */
  try{var inv=new pc.Mat4().copy(mi.node.getWorldTransform()).invert(),wb=new pc.BoundingBox(new pc.Vec3(0,0.9,0),new pc.Vec3(1.3,1.3,1.3)),lb=new pc.BoundingBox();lb.setFromTransformedAabb(wb,inv);mi.setCustomAabb(lb);}catch(err){}});});
 z.entity=e;z.model=model;z.mat=mat;z.pos=function(){var p=e.getPosition();return [p.x,p.y,p.z];};
 z.vision=new TacticalYuka.Vision({getWorldPosition:function(){var p=z.pos();return [p[0],p[1]+(z.type==='crawl'?0.5:1.55),p[2]];},getWorldDirection:function(){return [-Math.sin(z.yaw),0,-Math.cos(z.yaw)];}});
 z.vision.range=TacticalZombies.CONFIG.sight;z.vision.fieldOfView=TacticalZombies.CONFIG.fovDeg*Math.PI/180;if(T.perception)z.vision.addObstacle(T.perception.obstacle);
 z.regulator=new TacticalYuka.Regulator(TacticalZombies.CONFIG.sense,(i%8)/(8*TacticalZombies.CONFIG.sense));
 z.onDamaged=function(att,dmg,part,dir){self.onDamaged(z,att,dmg,part,dir);};z.dmgTakenMul=function(part){return part==='head'?TacticalZombies.CONFIG.headMul:TacticalZombies.CONFIG.bodyMul;};
 e.enabled=false;this.pool.push(z);return z;};
TacticalZombies.prototype.spawn=function(p,type){type="run";var T=TacticalCommon.ns(this.app),C=TacticalCommon,cfg=TacticalZombies.CONFIG,z=null;
 for(var i=0;i<this.pool.length;i++)if(!this.pool[i].active){z=this.pool[i];break;}
 if(!z){if(this.pool.length>=cfg.pool)return null;z=this.make();}
 var ty=cfg.types[type]||cfg.types.walk;z.type=type;z.ty=ty;z.active=true;z.alive=true;z.health=ty.hp;z.maxHp=ty.hp;z.hitK=ty.hitK;z.state='wander';z.target=null;z.lastSeenT=-99;z.lastSeenPos=null;
 z.noisePos=null;z.noiseT=-99;z.path=[];z.index=0;z.repathT=0;z.attackT=0;z.attackHit=false;z.staggerUntil=-99;z.screamT=0;z.flinchT=0;z.flash=0;z.tilt=0;z.tiltV=0;z.deadT=0;z.wanderT=C.rand(0.5,3);z.lastHitT=-99;
 z._voiceState=undefined;z._voiceNext=0;if(z._voiceSource){try{z._voiceSource.stop();}catch(e){}z._voiceSource=null;}z.fp=null;z.fpT=0;z.pathGoal=null;/* AI pass B: pooled zombies no longer carry route/stuck state into the next run (determinism across resets) */z.feed=null;z.feeding=false;z.pack=null;z.packRole='solo';z.free=false;z.crumb=0;z.trail=null;z.animAcc=0;z.yaw=C.rand(-Math.PI,Math.PI);z.moving=false;z.speedNow=0;z.clip='';z.alertedByScream=false;z.progressP=p.slice();z.progressT=T.elapsed;z.stuck=0;var w=Math.max(1,this.wave);/* NS nszSpawn speeds + damage: walker rand(1.25,1.9)+min(0.6,0.05w), runner rand(3.9,4.6), dmg min(30,12+1.5w) */z.speedMul=(type==='run'?C.rand(3.9,4.6):type==='crawl'?ty.speed*C.rand(0.9,1.12):C.rand(1.25,1.9)+Math.min(0.6,0.05*w))/ty.speed;z.speedMul*=cfg.speedBoost;z.dmg=Math.min(30,12+1.5*w)*(type==='crawl'?0.7:1);z.history.length=0;z.decision='';z.ignore=null;z.ignoreUntil=-99;z.stuckLog=[];z.regulator.reset(T.elapsed+(this.pool.indexOf(z)%8)/(8*cfg.sense));
 z.entity.setPosition(p[0],p[1],p[2]);z.entity.enabled=true;z.pivot.setLocalPosition(0,0,0);z.pivot.setLocalEulerAngles(0,0,0);z.mat.emissive.set(0,0,0);z.mat.update();
 if(T.zombies.indexOf(z)<0)T.zombies.push(z);this.stats.spawned++;this.play(z,type==='crawl'?'crawl':'idle',true);return z;};
TacticalZombies.prototype.despawn=function(z){var T=TacticalCommon.ns(this.app);this.releaseFeed(z);this.leavePack(z);z.active=false;z.alive=false;z.entity.enabled=false;var i=T.zombies.indexOf(z);if(i>=0)T.zombies.splice(i,1);};
TacticalZombies.prototype.reset=function(){var self=this,T=TacticalCommon.ns(this.app);this.pool.forEach(function(z){if(z.active)self.despawn(z);});T.zombies.length=0;this.packs=[];this.corpses=new Map();this.frame=0;this.queue=null;this.wave=0;this.nextWaveT=TacticalZombies.CONFIG.firstWave;this.lastWaveSize=0;
 for(var k in this.stats)this.stats[k]=0;};
/* ---------- waves ---------- */
TacticalZombies.prototype.spawnPoints=function(n,taken){var T=TacticalCommon.ns(this.app),C=TacticalCommon,cfg=TacticalZombies.CONFIG,obj=T.orders.objective(),out=[],tries=0;
 var fr=T.squad.filter(function(s){return s.team==='friendly'&&s.alive;}),goal=T.navigation.nearest(obj,{x:2,y:3,z:2});
 while(out.length<n&&tries<n*30){tries++;var a=C.rand(0,Math.PI*2),rad=C.rand(cfg.spawnMin,cfg.spawnMax),p=[obj[0]+Math.cos(a)*rad,0,obj[2]+Math.sin(a)*rad],q=T.navigation.nearest(p,{x:3,y:4,z:3});
  if(!q||q[1]>0.6)continue;if(fr.some(function(s){var sp=s.pos();return Math.hypot(sp[0]-q[0],sp[2]-q[2])<cfg.keepAway;}))continue;
  var near=function(o){return Math.hypot(o[0]-q[0],o[2]-q[2])<1.3;};if(out.some(near)||(taken&&taken.some(near)))continue;
  if(!this.reachable(q,goal))continue;out.push(q);}return out;};
/* a spawn point must have a full navmesh path to the objective (Recast returns a partial path to the closest point otherwise):
   no zombies spawned in walled-off pockets */
TacticalZombies.prototype.reachable=function(q,goal){var T=TacticalCommon.ns(this.app);if(!goal)return true;try{var path=T.navigation.path(q,goal),e=path&&path[path.length-1];
 return !!e&&Math.hypot(e[0]-goal[0],e[2]-goal[2])<1.5&&Math.abs(e[1]-goal[1])<1;}catch(err){return false;}};
TacticalZombies.prototype.pickType=function(){return "run";};
TacticalZombies.prototype.spawnWave=function(size,why){var T=TacticalCommon.ns(this.app),cfg=TacticalZombies.CONFIG,alive=T.zombies.filter(function(z){return z.alive;}).length;
 var cap=why==='timer'?cfg.timerMaxAlive:cfg.maxAlive;this.lastRequest=size||this.waveSize;size=Math.max(0,Math.min(size||this.waveSize,cap-alive));this.wave++;var n=this.spawnBatch(size);
 this.lastWaveSize=n;this.lastWaveT=T.elapsed;T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'Zombie wave '+this.wave+': '+n+' ('+(why||'timer')+')'});return n;};
TacticalZombies.prototype.spawnBatch=function(size,taken){var T=TacticalCommon.ns(this.app),self=this,pts=this.spawnPoints(size,taken),obj=T.orders.objective(),n=0;
 pts.forEach(function(p){var z=self.spawn(p,self.pickType());if(z){n++;if(taken)taken.push(p);z.noisePos=[obj[0]+TacticalCommon.rand(-8,8),0,obj[2]+TacticalCommon.rand(-8,8)];z.noiseT=T.elapsed;z.state='investigate';self.joinPack(z);}});return n;};
/* fix150: big panel waves are spawned a few per frame (creating ~100 skinned models + navmesh checks in one click froze the page for seconds) */
TacticalZombies.prototype.queueWave=function(want,why){var T=TacticalCommon.ns(this.app),cfg=TacticalZombies.CONFIG,alive=T.zombies.filter(function(z){return z.alive;}).length;want=Math.max(1,want||this.waveSize);
 var size=Math.max(0,Math.min(want,cfg.maxAlive-alive-(this.queue?this.queue.left:0)));if(size<=cfg.batch&&!this.queue){var n=this.spawnWave(size,why);this.notify(want,n);return n;}
 if(this.queue){this.queue.left+=size;this.queue.want+=want;}else{this.wave++;this.queue={want:want,left:size,n:0,why:why||'button',taken:[]};}return size;};
TacticalZombies.prototype.pumpQueue=function(){var q=this.queue,T=TacticalCommon.ns(this.app);if(!q)return;var k=Math.min(TacticalZombies.CONFIG.batch,q.left),got=this.spawnBatch(k,q.taken);q.n+=got;q.left-=k;
 if(q.left<=0||got===0){this.queue=null;this.lastWaveSize=q.n;this.lastWaveT=T.elapsed;T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'Zombie wave '+this.wave+': '+q.n+' ('+q.why+')'});this.notify(q.want,q.n);}};
TacticalZombies.prototype.notify=function(want,n){if(this.onWaveDone)try{this.onWaveDone(want,n);}catch(e){}};
/* ---------- senses ---------- */
TacticalZombies.prototype.hear=function(origin,shooter,now,radius){var cfg=TacticalZombies.CONFIG,T=TacticalCommon.ns(this.app),self=this;
 T.zombies.forEach(function(z){if(!z.alive||(z.packRole==='follower'&&!z.free))return;var p=z.pos(),d=Math.hypot(p[0]-origin[0],p[2]-origin[2]);if(d>(radius||cfg.hearRange))return;
  if(z.state==='chase'&&z.target&&now-z.lastSeenT<2)return;var n=1+d*0.06;z.noisePos=[origin[0]+TacticalCommon.rand(-n,n),origin[1],origin[2]+TacticalCommon.rand(-n,n)];z.noiseT=now;
  if(z.state==='feed'){self.releaseFeed(z);z.state='investigate';z.repathT=0;z.path=[];self.stats.heard++;self.stats.feedWokeShot=(self.stats.feedWokeShot||0)+1;}else if(z.state==='wander'||z.state==='investigate'){z.state='investigate';z.repathT=0;self.stats.heard++;}});};
TacticalZombies.prototype.soldiers=function(){var T=TacticalCommon.ns(this.app);return T.squad.filter(function(s){return s.alive&&!s.disabled;});};
TacticalZombies.prototype.sense=function(z,now,sold){var best=null,bd=1e9,p=z.pos(),NS=TacticalNS,PC=TacticalCommon.ns(this.app).perception;
 if(PC&&PC.nearby&&TacticalZombies.PERF.gridSense!==false){var near=PC.nearby(p,TacticalZombies.CONFIG.sight+2,TacticalCommon.ns(this.app).elapsed),c=[];for(var n=0;n<near.length;n++){var e=near[n];if(!e.isZombie&&e.team!=='zombie'&&e.alive&&!e.disabled)c.push(e);}sold=c;}
 for(var i=0;i<sold.length;i++){var s=sold[i],q=s.pos(),d=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);if(d>TacticalZombies.CONFIG.sight||d>=bd||(s===z.ignore&&now<z.ignoreUntil))continue;
  var lightSource=globalThis.DreadingNight?.enabled&&globalThis.DreadingLook?.flashlightsOn!==false&&s.flashlightOn!==false&&(!PC||!PC.sightBlocked(NS.entEye(z),NS.entChest(s)));
  if(lightSource||(!globalThis.DreadingNight||globalThis.DreadingNight.lit(z,s,TacticalCommon.ns(this.app),PC))&&((d<2.2&&(!PC||!PC.sightBlocked(NS.entEye(z),NS.entChest(s))))||z.vision.visible(NS.entChest(s))||z.vision.visible(NS.entHead(s)))){bd=d;best=s;}}
 return best;};
/* ---------- animation ---------- */
TacticalZombies.prototype.play=function(z,clip,force,rate){if(z.clip!==clip||force){z.clip=clip;try{z.model.anim.baseLayer.transition(clip,clip==='death'||clip==='dying'?0.12:0.2);}catch(e){}}z.animRate=rate||1;if(!TacticalZombies.PERF.animLod)z.model.anim.speed=z.animRate;};
/* ---------- damage / death (called from tacticalCombat) ---------- */
TacticalZombies.prototype.onDamaged=function(z,att,dmg,part,dir){var T=TacticalCommon.ns(this.app);if(!z.alive)return;
 z.flash=0;if(z.state==='feed'){this.releaseFeed(z);z.state='wander';this.stats.feedWokeHit=(this.stats.feedWokeHit||0)+1;}if(z.packRole==='follower')z.free=true;var stagger=T.elapsed>=(z.staggerUntil||0);z.flinchT=stagger?(part==='head'?.24:.1):0;if(stagger){z.staggerUntil=T.elapsed+.65;z.tiltV-=(part==='head'?90:60);}z.hitReaction=(z.hitReaction||0)+1;

 if(att&&att.alive&&(!z.target||z.state!=='chase')){z.target=att;z.lastSeenT=T.elapsed;z.lastSeenPos=att.pos();if(z.state!=='attack')z.state='chase';z.repathT=0;}
 if(part==='head'&&stagger&&z.state==='attack'){z.state='chase';}};
TacticalZombies.prototype.onKilled=function(z,att,part){var C=TacticalCommon;this.releaseFeed(z);z.deadT=0;z.path=[];z.moving=false;z.speedNow=0;this.stats.kills++;if(part==='head')this.stats.headshotKills++;
 this.play(z,z.type==='crawl'?'crawl_death':(C.random()<0.5?'death':'dying'),true,1);z.flash=0;};
/* ---------- per frame ---------- */
TacticalZombies.prototype.update=function(dt){var T=TacticalCommon.ns(this.app),C=TacticalCommon,cfg=TacticalZombies.CONFIG,self=this;if(!this.ready||!T.ready)return;if(this.queue)this.pumpQueue();
 if(T.paused){T.zombies.forEach(function(z){z.model.anim.speed=0;});return;}if(!T.running)return;dt=Math.min(dt,0.05);var now=T.elapsed,t0=performance.now();
 // waves
 if(this.on&&!T.outcome){var aliveN=T.zombies.filter(function(z){return z.alive;}).length;
  if(now>=this.nextWaveT||(this.wave>0&&aliveN<=Math.floor(this.lastWaveSize*0.25)&&now-this.lastWaveT>20)){this.spawnWave(this.waveSize+this.wave*cfg.waveGrow,'timer');this.nextWaveT=now+cfg.waveEvery;}}
 var sold=this.soldiers(),grid=this.crowdGrid(T.zombies),key=null;this.solPos(sold);this.pathBudget=TacticalZombies.PERF.pathsPerFrame;(this._dem||(this._dem=new Map())).clear();this._fu=0;
 for(var i=T.zombies.length-1;i>=0;i--){var z=T.zombies[i];
  if(!z.alive){z.deadT+=dt;z.flash=Math.max(0,z.flash-dt*3);if(z.deadT>9)z.pivot.setLocalPosition(0,-Math.min(1.2,(z.deadT-9)*0.5),0);if(z.deadT>12){this.despawn(z);continue;}this.paint(z,dt);continue;}
  if(z.packRole==='follower'&&!z.free&&(z.useField=false,this.follow(z,now,sold))){this.move(z,dt,now,grid,key,sold);}
  else{this.think(z,dt,now,sold);this.move(z,dt,now,grid,key,sold);}
  if(z.packRole==='leader'&&z.alive)this.crumbs(z);this.paint(z,dt);}
 this.animLod(dt);this.fieldTick(now);this.stats.fieldUsers=this._fu;this.frame++;this.ms=performance.now()-t0;};
/* perf (opt clone): integer-keyed crowd grid with reused cell arrays; cached soldier positions; nav-patch repath of crossing paths */
TacticalZombies.cellKey=function(cx,cz){return (cx+32768)*65536+(cz+32768);};
TacticalZombies.prototype.crowdGrid=function(list){var g=this._cg||(this._cg={m:new Map(),used:[]}),m=g.m,u=g.used,i;for(i=0;i<u.length;i++)u[i].length=0;u.length=0;if(m.size>8192)m.clear();
 for(i=0;i<list.length;i++){var z=list[i];if(!z.alive)continue;var e=z.entity.getPosition(),k=TacticalZombies.cellKey(Math.floor(e.x/1.5),Math.floor(e.z/1.5)),a=m.get(k);if(!a){a=[];m.set(k,a);}if(!a.length)u.push(a);a.push(z);}return m;};
TacticalZombies.prototype.solPos=function(sold){var n=sold.length,a=this._solP;if(!a||a.length<n*3)a=this._solP=new Float32Array(Math.max(96,n*3*2));for(var i=0;i<n;i++){var q=sold[i].pos();a[i*3]=q[0];a[i*3+1]=q[1];a[i*3+2]=q[2];}this._solN=n;};
TacticalZombies.prototype.onNavPatched=function(r){if(!r||!r.info||r.info.stale)return;this.navGen=(this.navGen||0)+1;var R=r.info.rect,T=TacticalCommon.ns(this.app),n=0,self=this;
 if(this.fields)this.fields.forEach(function(e){var F=e.cur,ov=function(F){return !R||(R[0]<=F.x0+F.n*F.c&&R[2]>=F.x0&&R[1]<=F.z0+F.n*F.c&&R[3]>=F.z0);};if(F&&ov(F)){e.cur=null;self.stats.fieldDrops=(self.stats.fieldDrops||0)+1;}if(e.next&&ov(e.next))e.next=self.fieldNew(e.next.goal);});
 if(!R)return;var X0=R[0]-1,Z0=R[1]-1,X1=R[2]+1,Z1=R[3]+1;
 (T.zombies||[]).forEach(function(z){if(!z.alive)return;var hit=false;
  if(z.path&&z.index<z.path.length){for(var i=Math.max(0,z.index-1);i<z.path.length;i++){var w=z.path[i];if(w[0]>=R[0]&&w[0]<=R[2]&&w[2]>=R[1]&&w[2]<=R[3]){hit=true;break;}}}
  if(!hit&&z.state==='chase'&&z.target&&!z.useField){var a=z.pos(),b=z.target.pos();hit=TacticalZombies.segBox(a[0],a[2],b[0],b[2],X0,Z0,X1,Z1);}
  if(hit){z.navDirty=true;z.repathT=Math.min(z.repathT,0.05+(z.uid%8)*0.05);n++;}});this.stats.navRepaths=(this.stats.navRepaths||0)+n;};
TacticalZombies.segBox=function(ax,az,bx,bz,x0,z0,x1,z1){var t0=0,t1=1,d=[bx-ax,bz-az],o=[ax,az],lo=[x0,z0],hi=[x1,z1];for(var k=0;k<2;k++){if(Math.abs(d[k])<1e-9){if(o[k]<lo[k]||o[k]>hi[k])return false;continue;}var u=(lo[k]-o[k])/d[k],v=(hi[k]-o[k])/d[k];if(u>v){var t=u;u=v;v=t;}t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)return false;}return true;};
/* round 2 (opt clone): shared zombie route field (Mindustry-style). One Dijkstra field per hunted soldier with >=3 distant chasers, over a
   1.5 m lattice snapped onto the navmesh (bounded 36 m radius), time-sliced ~1 ms/frame. Edges are navmesh raycasts between snapped cell points, so
   walls and floors never connect (a different storey is a different poly; |dy| per edge <=0.75 m). Zombies read the downhill neighbour on the long
   approach only; near the target, in partly blocked cells (doorways / obstacles), off the field's storey, while traversing, or when not progressing
   they fall back to their own path (path cap + packs unchanged). Nav patches drop overlapping fields and restart builds (generation). ?zfield=0 disables. */
TacticalZombies.FIELD={on:true,cell:1.5,radius:36,minChasers:3,maxFields:6,budget:1.0,near:8,retarget:3,dy:0.9,step:0.75,pathTries:600};
TacticalZombies.prototype.fieldStep=function(z,tp,d,fresh,now){var FD=TacticalZombies.FIELD;if(!FD.on)return false;
 if(fresh&&d>FD.near)this._dem.set(z.target,(this._dem.get(z.target)||0)+1);
 var e=fresh&&d>FD.near&&!z.trav&&!(z.fieldBan>now)&&this.fields?this.fields.get(z.target):null,F=e&&e.cur,dir=F?this.fieldDir(F,z):null;
 if(dir){if(!z.useField){z.useField=true;z._fb=dir.d;z._fbT=now;}else if(dir.d<z._fb-0.75){z._fb=dir.d;z._fbT=now;}else if(now-z._fbT>2.5){z.fieldBan=now+6;this.stats.fieldStuck=(this.stats.fieldStuck||0)+1;dir=null;}}
 if(dir){this._fu++;return true;}
 if(z.useField){z.useField=false;z.path=[];z.index=0;z.navDirty=true;z.repathT=(z.uid%6)*0.04;if(!(z.fieldBan>now))z.fieldBan=now+1.5;this.stats.fieldFallbacks=(this.stats.fieldFallbacks||0)+1;}return false;};
TacticalZombies.prototype.fieldDir=function(F,z){var p=z.pos(),c=F.c,n=F.n,ix=Math.floor((p[0]-F.x0)/c),iz=Math.floor((p[2]-F.z0)/c);if(ix<1||iz<1||ix>=n-1||iz>=n-1)return null;
 var i=iz*n+ix,d0=F.dist[i];if(!(d0<1e9)||F.conn[i]!==15||Math.abs(p[1]-F.y[i])>TacticalZombies.FIELD.dy)return null;
 var b=-1,bd=d0,nb=[i+1,i-1,i+n,i-n];for(var k=0;k<4;k++){var j=nb[k];if(F.dist[j]<bd){bd=F.dist[j];b=j;}}if(b<0)return null;
 var bb=-1,bbd=bd;if(F.conn[b]===15){nb=[b+1,b-1,b+n,b-n];for(k=0;k<4;k++){j=nb[k];if(F.dist[j]<bbd&&j!==i){bbd=F.dist[j];bb=j;}}}
 var tx=bb>=0?(F.px[b]+F.px[bb])*0.5:F.px[b],tz=bb>=0?(F.pz[b]+F.pz[bb])*0.5:F.pz[b],dx=tx-p[0],dz=tz-p[2],dl=Math.hypot(dx,dz);if(dl<1e-3)return null;
 var o=z._fd||(z._fd=[0,0]);o[0]=dx/dl;o[1]=dz/dl;o.d=d0;return o;};
TacticalZombies.prototype.fieldNew=function(goal){var FD=TacticalZombies.FIELD,c=FD.cell,n=(Math.ceil(FD.radius*2/c)|1),N=n*n;
 return {goal:goal.slice(),c:c,n:n,x0:goal[0]-n*c/2,z0:goal[2]-n*c/2,dist:new Float32Array(N).fill(1e10),y:new Float32Array(N),px:new Float32Array(N),pz:new Float32Array(N),conn:new Uint8Array(N),st:new Uint8Array(N),ref:new Array(N),hk:[],hv:[],pathTries:0,started:false,done:false,ok:false,nodes:0};};
TacticalZombies.prototype.fieldTick=function(now){var FD=TacticalZombies.FIELD;if(!FD.on)return;var T=TacticalCommon.ns(this.app),N=T.navigation&&T.navigation.nav;if(!N||!N.snapRef||!N.rayRef)return;
 var fs=this.fields||(this.fields=new Map()),self=this;
 this._dem.forEach(function(c,tg){if(c<FD.minChasers||!tg.alive)return;var e=fs.get(tg);if(!e){if(fs.size>=FD.maxFields)return;e={cur:null,next:null,failT:-99};fs.set(tg,e);}e.seen=now;
  var g=tg.pos(),f=e.next||e.cur,lim=e.next?FD.retarget*3:FD.retarget;if(now-e.failT<2)return;if(!f||Math.hypot(g[0]-f.goal[0],g[2]-f.goal[2])>lim||Math.abs(g[1]-f.goal[1])>1.2)e.next=self.fieldNew(g);});
 var t0=performance.now(),end=t0+FD.budget;
 fs.forEach(function(e,tg){if(!tg.alive||now-e.seen>5){fs.delete(tg);return;}var f=e.next;if(!f||performance.now()>end)return;
  self.fieldBuild(f,N,end);if(f.done){if(f.ok){f.ref=null;f.st=null;f.hk=f.hv=null;e.cur=f;self.stats.fieldBuilds=(self.stats.fieldBuilds||0)+1;}else e.failT=now;e.next=null;}});
 this.stats.fieldMs=(this.stats.fieldMs||0)+(performance.now()-t0);this.stats.fields=fs.size;};
TacticalZombies.prototype.fieldBuild=function(F,N,end){var FD=TacticalZombies.FIELD,n=F.n,c=F.c,hk=F.hk,hv=F.hv;
 function push(k,v){var i=hk.length;hk.push(k);hv.push(v);while(i>0){var pa=(i-1)>>1;if(hv[pa]<=v)break;hk[i]=hk[pa];hv[i]=hv[pa];i=pa;}hk[i]=k;hv[i]=v;}
 function pop(){var k=hk[0],lk=hk.pop(),lv=hv.pop(),L=hk.length;if(L){var i=0;for(;;){var l=2*i+1,r=l+1,m=i,mv=lv;if(l<L&&hv[l]<mv){m=l;mv=hv[l];}if(r<L&&hv[r]<mv){m=r;}if(m===i)break;hk[i]=hk[m];hv[i]=hv[m];i=m;}hk[i]=lk;hv[i]=lv;}return k;}
 function edgeByPath(i,j){/* doorways / furniture gaps: the straight ray clips the eroded edge, so accept a short navmesh detour between the two cell points (capped per field) */
  if(F.pathTries>=FD.pathTries)return false;F.pathTries++;var r;try{r=N.path([F.px[i],F.y[i],F.pz[i]],[F.px[j],F.y[j],F.pz[j]]);}catch(e){return false;}if(!r||r.length<2)return false;var L=0,top=F.y[i];
  for(var q=1;q<r.length;q++){L+=Math.hypot(r[q][0]-r[q-1][0],r[q][2]-r[q-1][2]);if(Math.abs(r[q][1]-top)>FD.step)return false;}var e=r[r.length-1];return L<=FD.cell*1.9&&Math.hypot(e[0]-F.px[j],e[2]-F.pz[j])<0.2;}
 function snap(i,x,y,z,h){var q=N.snapRef([x,y,z],h);if(!q){F.st[i]=2;return false;}F.st[i]=1;F.ref[i]=q.ref;F.px[i]=q.x;F.y[i]=q.y;F.pz[i]=q.z;return true;}
 if(!F.started){F.started=true;var ci=(n>>1)*n+(n>>1);if(!snap(ci,F.goal[0],F.goal[1],F.goal[2],{x:1,y:1.5,z:1})){F.done=true;return;}F.dist[ci]=0;push(ci,0);}
 var DX=[1,-1,0,0],DZ=[0,0,1,-1],BIT=[1,2,4,8],OPP=[2,1,8,4],it=0,half={x:c*0.5,y:FD.dy,z:c*0.5};
 while(hk.length){if((++it&7)===0&&performance.now()>end)return;var d=hv[0],i=pop();if(F.st[i]===3||d>F.dist[i])continue;F.st[i]=3;F.nodes++;var ix=i%n,iz=(i/n)|0;
  for(var k=0;k<4;k++){var jx=ix+DX[k],jz=iz+DZ[k];if(jx<0||jz<0||jx>=n||jz>=n)continue;var j=jz*n+jx,s=F.st[j];if(s===2||s===3)continue;
   if(s===0&&!snap(j,F.x0+(jx+0.5)*c,F.y[i],F.z0+(jz+0.5)*c,half))continue;var dy=F.y[j]-F.y[i];if(Math.abs(dy)>FD.step)continue;
   if(!N.rayRef(F.ref[i],F.px[i],F.y[i],F.pz[i],F.ref[j],F.px[j],F.y[j],F.pz[j])){if(!edgeByPath(i,j))continue;F.conn[i]|=16;F.conn[j]|=16;}F.conn[i]|=BIT[k];F.conn[j]|=OPP[k];
   var nd=Math.fround(d+Math.hypot(F.px[j]-F.px[i],dy,F.pz[j]-F.pz[i]));/* fround: dist is Float32, heap keys must match it */if(nd<F.dist[j]){F.dist[j]=nd;push(j,nd);}}}
 F.done=true;F.ok=true;};
/* ---------- feeding on squad corpses ---------- */
TacticalZombies.prototype.claimFeed=function(z,dead){var F=TacticalZombies.FEED;if(!F.on||!dead||dead.isZombie||!dead.entity)return false;var c=this.corpses.get(dead);if(!c){c={s:dead,slots:new Array(F.slots).fill(null)};this.corpses.set(dead,c);}
 var p=z.pos(),q=dead.pos();if(Math.hypot(p[0]-q[0],p[2]-q[2])>F.claimRange)return false;var a=Math.atan2(p[2]-q[2],p[0]-q[0]),best=-1,bd=1e9;
 for(var k=0;k<F.slots;k++){if(c.slots[k])continue;var sa=k*Math.PI*2/F.slots,d=Math.abs(Math.atan2(Math.sin(a-sa),Math.cos(a-sa)));if(d<bd){bd=d;best=k;}}
 if(best<0)return false;c.slots[best]=z;z.feed={c:c,k:best};z.state='feed';z.feeding=false;z.repathT=0;z.path=[];if(z.pack)this.leavePack(z);this.stats.feeders=(this.stats.feeders||0)+1;TacticalCommon.log(this.app,z,'Feeding on '+dead.soldierName);return true;};
TacticalZombies.prototype.releaseFeed=function(z){if(z&&z.feed){var c=z.feed.c;if(c.slots[z.feed.k]===z)c.slots[z.feed.k]=null;}if(z){z.feed=null;z.feeding=false;}};
/* returns true when think() is done for this frame */
TacticalZombies.prototype.feedTick=function(z,dt,now,sold){var F=TacticalZombies.FEED,f=z.feed;if(!f){z.state='wander';return false;}var p=z.pos();
 for(var i=0;i<sold.length;i++){var s=sold[i].pos();if(Math.hypot(s[0]-p[0],s[2]-p[2])<F.wake&&Math.abs(s[1]-p[1])<2){this.releaseFeed(z);z.target=sold[i];z.lastSeenT=now;z.lastSeenPos=s;z.state='chase';z.repathT=0;this.stats.feedWokeNear=(this.stats.feedWokeNear||0)+1;return false;}}
 var q=f.c.s.pos(),sa=f.k*Math.PI*2/F.slots,sp=[q[0]+Math.cos(sa)*F.ring,q[1],q[2]+Math.sin(sa)*F.ring],d=Math.hypot(sp[0]-p[0],sp[2]-p[2]);
 if(!z.feeding){if(d<0.35){z.feeding=true;z.path=[];z.index=0;}else{z.repathT-=dt;if(z.repathT<=0||z.index>=z.path.length){this.route(z,sp);z.repathT=1.5;}return true;}}
 z.yaw=Math.atan2(-(q[0]-p[0]),-(q[2]-p[2]));this.play(z,F.clip,false,1);return true;};
/* ---------- pass 4b: packs ----------
   Spawned walkers/runners join an open pack of the same type whose leader is within packJoin m (else start a new one; crawlers stay solo).
   Leader = full logic (perception, hearing, scream, navmesh routes) and drops breadcrumbs every 1.5 m. Followers: no perception, no hearing,
   no route queries; they walk the leader's crumbs and then hold a formation slot around it, with the usual spatial-hash separation and the
   navmesh ground clamp every other frame. A follower goes individual (free) when a soldier is within 'engage' m, when it is shot, or when it is
   stuck; it rejoins once it has no target and is within 'rejoin' m of its leader. Leader death promotes the first remaining member (spawn order).
   Everything is ordered by spawn order and uses no extra random numbers, so it stays deterministic by seed. */
TacticalZombies.prototype.joinPack=function(z){var P=TacticalZombies.PERF;if(!P.packs||z.type==='crawl'){z.packRole='solo';return;}var p=z.pos(),best=null;
 for(var i=0;i<this.packs.length;i++){var k=this.packs[i];if(k.type!==z.type||k.members.length>=P.packMax||!k.leader||!k.leader.alive)continue;var q=k.leader.pos();if(Math.hypot(q[0]-p[0],q[2]-p[2])<=P.packJoin){best=k;break;}}
 if(!best){best={id:this.packs.length?this.packs[this.packs.length-1].id+1:1,type:z.type,leader:z,members:[]};this.packs.push(best);z.packRole='leader';z.trail=[p.slice()];z.trailBase=0;}
 else{z.packRole='follower';var L=best.leader;z.crumb=L.trailBase+L.trail.length-1;z.state=L.state;z.noisePos=L.noisePos;}
 z.pack=best;z.slot=best.members.length;best.members.push(z);z.free=false;};
TacticalZombies.prototype.leavePack=function(z){var k=z.pack;if(!k)return;var i=k.members.indexOf(z);if(i>=0)k.members.splice(i,1);z.pack=null;z.packRole='solo';
 if(k.leader===z)this.promote(k);if(!k.members.length){var j=this.packs.indexOf(k);if(j>=0)this.packs.splice(j,1);}};
TacticalZombies.prototype.promote=function(k){var old=k.leader,nl=null;for(var i=0;i<k.members.length;i++){var m=k.members[i];if(m.alive&&m!==old&&!m.free){nl=m;break;}}
 if(!nl)for(var j=0;j<k.members.length;j++){if(k.members[j].alive&&k.members[j]!==old){nl=k.members[j];break;}}
 k.leader=nl;if(!nl)return;nl.packRole='leader';nl.free=false;nl.trail=[nl.pos()];nl.trailBase=0;nl.repathT=0;
 if(old&&old.target&&old.target.alive&&!nl.target){nl.target=old.target;nl.lastSeenT=old.lastSeenT;nl.lastSeenPos=old.lastSeenPos;nl.state='chase';}else if(old&&!nl.target&&old.noisePos){nl.noisePos=old.noisePos;nl.noiseT=old.noiseT;nl.state='investigate';}
 k.members.forEach(function(m){if(m!==nl&&m.packRole==='follower')m.crumb=0;});};
TacticalZombies.prototype.crumbs=function(L){var p=L.pos(),t=L.trail,last=t[t.length-1];if(Math.hypot(p[0]-last[0],p[2]-last[2])>=TacticalZombies.PERF.crumb){t.push(p);if(t.length>TacticalZombies.PERF.trailMax){t.shift();L.trailBase++;}}};
/* follower tick: returns false when the zombie should run full individual logic this frame */
TacticalZombies.prototype.follow=function(z,now,sold){var P=TacticalZombies.PERF,k=z.pack,L=k&&k.leader;
 if(!L||!L.alive||L===z){if(k){if(k.leader===z){z.packRole='leader';return false;}this.promote(k);L=k.leader;}if(!L||L===z||!L.alive){z.packRole='solo';return false;}}
 var p=z.pos(),SP=this._solP;for(var i=0;i<this._solN;i++){var q=[SP[i*3],SP[i*3+1],SP[i*3+2]];if(Math.abs(q[0]-p[0])<P.engage&&Math.abs(q[2]-p[2])<P.engage&&Math.hypot(q[0]-p[0],q[2]-p[2])<P.engage){z.free=true;z.repathT=0;z.regulator.reset(now);return false;}}
 // scream alerts that reached a follower are handed to its leader
 if(z.alertedByScream&&z.target&&!L.target){L.target=z.target;L.lastSeenT=z.lastSeenT;L.lastSeenPos=z.lastSeenPos;L.state='chase';L.repathT=0;}z.alertedByScream=false;
 z.state=L.state==='chase'?'chase':L.state==='investigate'?'investigate':'wander';z.target=L.state==='chase'?L.target:null;z.lastSeenT=L.lastSeenT;z.lastSeenPos=L.lastSeenPos;z.noisePos=L.noisePos;z.noiseT=L.noiseT;
 var newest=L.trailBase+L.trail.length-1,goal;if(z.crumb<L.trailBase)z.crumb=L.trailBase;
 if(z.crumb<newest){var c=L.trail[z.crumb-L.trailBase];if(Math.hypot(c[0]-p[0],c[2]-p[2])<1.6){z.crumb++;}goal=L.trail[Math.min(z.crumb,newest)-L.trailBase];}
 else{var lp=L.pos(),a=z.slot*2.399963,r=1.3+0.32*z.slot;goal=[lp[0]+Math.cos(a)*r,lp[1],lp[2]+Math.sin(a)*r];if(Math.hypot(goal[0]-p[0],goal[2]-p[2])<0.6&&!L.moving){z.path=[];z.index=0;z.cheap=true;return true;}}
 // no progress for 3 s while the leader moves: go individual (walls between crumbs)
 if(z.moving&&Math.hypot(p[0]-(z.fp||p)[0],p[2]-(z.fp||p)[2])<0.4){if(now-z.fpT>3){z.free=true;z.repathT=0;return false;}}else{z.fp=p;z.fpT=now;}
 z.path=[goal];z.index=0;z.cheap=true;return true;};
TacticalZombies.prototype.rejoin=function(z){var k=z.pack;if(!z.free||!k||!k.leader||!k.leader.alive||k.leader===z||z.target)return;var p=z.pos(),q=k.leader.pos();if(Math.hypot(q[0]-p[0],q[2]-p[2])<TacticalZombies.PERF.rejoin){z.free=false;z.crumb=k.leader.trailBase+k.leader.trail.length-1;z.fp=null;}};
/* ---------- pass 4b: animation LOD ----------
   On-screen within 25 m: every frame; 25-50 m: every 2nd; further: every 3rd; off-screen: every 6th. Frames are staggered by uid and the skipped
   time is folded into the next update (anim.speed = rate * accumulated/dt), so clips stay in sync. Purely visual - no logic reads bones. */
TacticalZombies.prototype.animLod=function(dt){var T=TacticalCommon.ns(this.app),P=TacticalZombies.PERF,cam=T.activeCamera||T.camera,f=this.frame;
 var fr=cam&&cam.camera&&cam.camera.frustum,cp=cam?cam.getPosition():null,sph=this._sph||(this._sph=new pc.BoundingSphere(new pc.Vec3(),1.3));
 for(var i=0;i<T.zombies.length;i++){var z=T.zombies[i],an=z.model&&z.model.anim;if(!an)continue;if(z.free)this.rejoin(z);
  if(!P.animLod||!cp){an.playing=true;an.speed=z.animRate||1;continue;}
  var p=z.entity.getPosition(),d=cp.distance(p);sph.center.set(p.x,p.y+0.9,p.z);var on=!fr||fr.containsSphere(sph)>0;var n=!on?P.lodOff:d<P.lodNear?1:d<P.lodMid?2:3;
  /* shadow LOD: zombies further than 40 m (or off-screen) stop casting into the shadow cascades; back on inside 30 m (hysteresis) */
  var wantSh=z.castSh===false?(on&&d<P.shadowNear):(on&&d<P.shadowFar);if(wantSh!==z.castSh){z.castSh=wantSh;if(!z._rs)z._rs=z.model.findComponents('render');for(var r=0;r<z._rs.length;r++)z._rs[r].castShadows=wantSh;}
  z.animAcc=(z.animAcc||0)+dt;if(n===1||(f+z.uid)%n===0){an.playing=true;an.speed=(z.animRate||1)*Math.min(8,z.animAcc/Math.max(1e-4,dt));z.animAcc=0;}else an.playing=false;}};
TacticalZombies.prototype.think=function(z,dt,now,sold){var T=TacticalCommon.ns(this.app),C=TacticalCommon,cfg=TacticalZombies.CONFIG,self=this,ty=z.ty;
 if(z.flinchT>0)z.flinchT-=dt;
 /* feeding: the zombie whose target just died claims a corpse slot before perception can retarget it */if(TacticalZombies.FEED.on&&z.target&&!z.target.alive&&z.state!=='feed'&&this.claimFeed(z,z.target)){z.target=null;}
 if(z.state!=='feed'&&z.regulator.ready(now)){var seen=this.sense(z,now,sold);if(seen){var first=!z.target&&z.state!=='chase'&&z.state!=='scream';z.target=seen;z.lastSeenT=now;z.lastSeenPos=seen.pos();
   if(first&&Math.hypot(seen.pos()[0]-z.pos()[0],seen.pos()[2]-z.pos()[2])>5&&!z.alertedByScream&&z.type!=='crawl'&&C.random()<cfg.screamChance){z.state='scream';z.screamT=0;z.screamed=false;this.stats.screams++;C.log(this.app,z,'Scream');}
   else if(z.state!=='scream'&&z.state!=='attack'){z.state='chase';}}}
 if(z.target&&!z.target.alive){var dead=z.target;z.target=null;z.path=[];if(!this.claimFeed(z,dead))z.state='wander';}
 if(z.state==='feed'){if(this.feedTick(z,dt,now,sold))return;}
 if(z.state==='scream'){z.screamT+=dt;this.play(z,'scream',false,1.4);if(z.target){var tp=z.target.pos(),p=z.pos();z.yaw=Math.atan2(-(tp[0]-p[0]),-(tp[2]-p[2]));}
  if(!z.screamed&&z.screamT>0.6){z.screamed=true;var p0=z.pos();if(T.perception&&T.perception.hearAll)T.perception.hearAll(z,TacticalPerception.HEAR.scream,'scream',now);/* pass E: soldiers hear screams (30 m) */T.zombies.forEach(function(o){if(o===z||!o.alive||o.state==='chase'||o.state==='attack')return;var q=o.pos();if(Math.hypot(q[0]-p0[0],q[2]-p0[2])>cfg.screamRadius)return;
   o.alertedByScream=true;o.target=z.target;o.lastSeenT=now;o.lastSeenPos=z.target?z.target.pos():p0;o.state='chase';o.repathT=C.rand(0,0.3);self.stats.alerts++;});}
  if(z.screamT>2.0)z.state=z.target?'chase':'wander';return;}
 if(z.state==='attack'){z.attackT+=dt;var tgt=z.target,dur=z.attackClip==='attack'?.95:1.1,hitAt=z.attackClip==='attack'?.32:.4;this.play(z,z.attackClip,false,z.attackClip==='attack'?1.6:2.6);
  if(tgt){var tp2=tgt.pos(),p2=z.pos();z.yaw=Math.atan2(-(tp2[0]-p2[0]),-(tp2[2]-p2[2]));
   if(!z.attackHit&&z.attackT>=hitAt){z.attackHit=true;if(tgt.alive&&Math.hypot(tp2[0]-p2[0],tp2[2]-p2[2])<cfg.attackRange+0.35&&Math.abs(tp2[1]-p2[1])<1.3&&this.meleeClear(z,tgt)){var dl=Math.hypot(tp2[0]-p2[0],tp2[2]-p2[2])||1;
     T.combat.applyDamage(tgt,z.dmg,z,'body',[(tp2[0]-p2[0])/dl,0,(tp2[2]-p2[2])/dl]);this.stats.hitsOnSoldiers++;T.combat.counters.zombieHits=(T.combat.counters.zombieHits||0)+1;}}}
  if(z.attackT>=dur){z.state=z.target&&z.target.alive?'chase':'wander';}return;}
 if(z.state==='chase'&&z.target){var tp3=z.target.pos(),p3=z.pos(),d=Math.hypot(tp3[0]-p3[0],tp3[2]-p3[2]);
  if(d<cfg.attackRange+.15&&Math.abs(tp3[1]-p3[1])<1.3&&z.flinchT<=0&&this.meleeClear(z,z.target)){z.state='attack';z.attackT=0;z.attackHit=false;z.attackClip=z.type==='crawl'?'crawl_run':C.random()<0.6?'attack':'neck_bite';/* was bite_2 = the ground feed clip; neck_bite is the standing bite (same timings, same random draw) */z.path=[];this.stats.attacks++;C.log(this.app,z,'Attacking '+z.target.soldierName);return;}
  if(d<5&&this.meleeClear(z,z.target)){z.lastSeenT=now;z.lastSeenPos=tp3.slice();}var fresh=now-z.lastSeenT<4,lose=now-z.lastSeenT>10;/* NS NSZ_LOSE 6 s */if(lose&&z.lastSeenPos&&Math.hypot(z.lastSeenPos[0]-p3[0],z.lastSeenPos[2]-p3[2])<2.5){z.target=null;z.state='wander';z.path=[];return;}var goal=fresh?tp3:z.lastSeenPos;if(!goal){z.target=null;z.state='wander';z.path=[];return;}
  if(!fresh&&z.lastSeenPos&&Math.hypot(z.lastSeenPos[0]-p3[0],z.lastSeenPos[2]-p3[2])<1.5&&now-z.lastSeenT>8){z.target=null;z.state='wander';z.path=[];return;}
  if(this.fieldStep(z,p3,d,fresh,now))return;z.repathT-=dt;if(z.repathT<=0||(z.pathGoal&&Math.hypot(goal[0]-z.pathGoal[0],goal[2]-z.pathGoal[2])>1.5&&z.repathT<0.35)){this.route(z,goal);z.repathT=0.7+(z.uid%5)*0.06;}
  return;}
 if(z.state==='investigate'&&z.noisePos){var p4=z.pos();if(Math.hypot(z.noisePos[0]-p4[0],z.noisePos[2]-p4[2])<2||now-z.noiseT>40){z.state='wander';z.noisePos=null;z.path=[];return;}
  z.repathT-=dt;if(z.repathT<=0||!z.path.length){this.route(z,z.noisePos);z.repathT=3+(z.uid%7)*0.2;}return;}
 // wander / idle
 z.state='wander';z.wanderT-=dt;if(z.wanderT<=0&&!z.path.length){z.wanderT=C.rand(4,9);if(C.random()<0.6){var p5=z.pos(),a=C.rand(0,Math.PI*2),r=C.rand(2,6);this.route(z,[p5[0]+Math.cos(a)*r,p5[1],p5[2]+Math.sin(a)*r]);}}};
TacticalZombies.prototype.route=function(z,goal){var T=TacticalCommon.ns(this.app),PF=TacticalZombies.PERF;if(!goal){z.path=[];z.index=0;return;}
 var has=z.path&&z.index<z.path.length&&!z.navDirty;if(has&&z.pathGoal&&Math.hypot(goal[0]-z.pathGoal[0],goal[2]-z.pathGoal[2])<PF.repathKeep&&Math.abs(goal[1]-z.pathGoal[1])<1){this.stats.pathKept=(this.stats.pathKept||0)+1;return;}
 if(has&&this.pathBudget!==undefined&&this.pathBudget<=0){z.repathT=0.05+(z.uid%4)*0.03;this.stats.pathDeferred=(this.stats.pathDeferred||0)+1;return;}if(this.pathBudget!==undefined)this.pathBudget--;z.navDirty=false;this.stats.pathSolves=(this.stats.pathSolves||0)+1;try{z.path=T.navigation.path(z.pos(),goal);z.index=1;z.pathGoal=goal.slice();}catch(e){var q=T.navigation.nearest(goal,{x:2,y:3,z:2});z.path=q?[z.pos(),q]:[];z.index=1;z.pathGoal=goal.slice();}};
TacticalZombies.prototype.move=function(z,dt,now,grid,key,sold){var T=TacticalCommon.ns(this.app),cfg=TacticalZombies.CONFIG,ty=z.ty,p=z.pos(),vx=0,vz=0,sp=0;
 /* terrain batch: zombies climb through windows / drop off ledges on the same off-mesh links (no vault clip: walk clip slowed) */
 if(z.trav){var tq=TacticalTraversal.step(z,dt);z.entity.setPosition(tq[0],tq[1],tq[2]);z.speedNow=0.5;z.moving=true;if(z.trav.done){z.trav=null;this.stats.linkUses=(this.stats.linkUses||0)+1;}if(z.alive&&z.type!=='crawl')this.play(z,'walk',false,0.6);else if(z.alive)this.play(z,'crawl',false,0.8);return;}
 var busy=z.state==='attack'||z.state==='scream'||(z.state==='feed'&&z.feeding);
 var walking=!busy&&z.index<z.path.length&&z.flinchT<=0;
 if(z.useField&&z.state==='chase'&&!busy&&z.flinchT<=0){walking=false;sp=ty.speed*z.speedMul*(now-z.lastHitT<0.5?0.45:1);vx=z._fd[0]*sp;vz=z._fd[1]*sp;}
 if(walking&&(z._lkI!==z.index||z._lkP!==z.path)&&typeof TacticalTraversal!=='undefined'){z._lkI=z.index;z._lkP=z.path;var lm=z.index>0?TacticalTraversal.match(T,z.path[z.index-1],z.path[z.index]):null;if(lm){TacticalTraversal.begin(z,lm,p);return;}}
 if(walking){var chase=z.state==='chase',w=z.path[z.index],dx=w[0]-p[0],dz=w[2]-p[2],dd=Math.hypot(dx,dz);
  if(dd<0.3){z.index++;}else{sp=(chase?ty.speed:Math.min(ty.speed,ty===cfg.types.run?1.3:ty.speed))*z.speedMul*(now-z.lastHitT<0.5?0.45:1);vx=dx/dd*sp;vz=dz/dd*sp;}
  if(chase&&z.target){var tp=z.target.pos();if(Math.hypot(tp[0]-p[0],tp[2]-p[2])<0.95){vx=0;vz=0;sp=0;}}}
 // Finish the final approach when a nav path ends just outside reach.
 if(!busy&&z.state==='chase'&&z.target&&z.flinchT<=0){var near=z.target.pos(),nd=Math.hypot(near[0]-p[0],near[2]-p[2]);if(nd>.95&&nd<3&&Math.abs(near[1]-p[1])<.7&&this.meleeClear(z,z.target)){sp=ty.speed*z.speedMul;vx=(near[0]-p[0])/nd*sp;vz=(near[2]-p[2])/nd*sp;}}
 // separation from zombies (spatial hash) and from soldiers
 var sx=0,sz=0,cx=Math.floor(p[0]/1.5),cz=Math.floor(p[2]/1.5);
 for(var a=-1;a<=1;a++)for(var b=-1;b<=1;b++){var L=grid.get(TacticalZombies.cellKey(cx+a,cz+b));if(!L)continue;for(var j=0;j<L.length;j++){var o=L[j];if(o===z)continue;var q=o.pos(),ex=p[0]-q[0],ez=p[2]-q[2],ed=Math.hypot(ex,ez),min=(z.type==='crawl'||o.type==='crawl')?0.9:0.75;
  if(ed<min&&Math.abs(p[1]-q[1])<1){if(ed<1e-4){ex=((z.uid*7)%3)-1||0.5;ez=((z.uid*13)%3)-1||-0.5;ed=Math.hypot(ex,ez);}var push=(min-ed)/min*2.2;sx+=ex/ed*push;sz+=ez/ed*push;}}}
 var SP=this._solP;for(var k=0;k<this._solN;k++){var s0=SP[k*3],s2=SP[k*3+2],fx=p[0]-s0,fz=p[2]-s2;if(fx>0.7||fx<-0.7||fz>0.7||fz<-0.7)continue;var fd=Math.hypot(fx,fz);if(fd<0.7&&fd>1e-4&&Math.abs(p[1]-SP[k*3+1])<1){var pu=(0.7-fd)/0.7*3;sx+=fx/fd*pu;sz+=fz/fd*pu;}}
 var nx=p[0]+(vx+sx)*dt,nz=p[2]+(vz+sz)*dt;
 if(vx||vz||sx||sz){var PF=TacticalZombies.PERF;if((z.cheap||sx*sx+sz*sz<PF.snapSep*PF.snapSep)&&(this.frame+z.uid)%PF.snapEvery&&z._snapOk){z.entity.setPosition(nx,p[1],nz);z._snapOk=false;}else{var q2=T.navigation.nearest([nx,p[1],nz],{x:0.6,y:0.9,z:0.6});if(q2){z.entity.setPosition(q2[0],q2[1],q2[2]);z._snapOk=Math.abs(q2[0]-nx)+Math.abs(q2[2]-nz)<0.02;}else z._snapOk=false;}}z.cheap=false;
 z.speedNow=sp;z.moving=sp>0.1;if(sp>0.1)z.yaw=turn(z.yaw,Math.atan2(-vx,-vz),dt*6);
 else if(z.target&&(z.state==='chase')){var tp4=z.target.pos();z.yaw=turn(z.yaw,Math.atan2(-(tp4[0]-p[0]),-(tp4[2]-p[2])),dt*5);}
 // stall bookkeeping (tests): chasing but no progress for 10 s
 if(Math.hypot(p[0]-z.progressP[0],p[2]-z.progressP[2])>0.5||busy||!z.target||z.state!=='chase'){z.progressP=p.slice();z.progressT=now;}else if(now-z.progressT>10){z.stuck++;z.progressT=now;z.repathT=0;z.stuckLog=(z.stuckLog||[]);if(z.stuckLog.length<4)z.stuckLog.push({t:+now.toFixed(1),p:p.map(function(v){return +v.toFixed(1);}),tgt:z.target.soldierName,tp:z.target.pos().map(function(v){return +v.toFixed(1);})});z.ignore=z.target;z.ignoreUntil=now+8;z.target=null;z.state='wander';z.path=[];if(z.stuck>=2&&z.stuckLog.length>=2&&Math.hypot(z.stuckLog[0].p[0]-p[0],z.stuckLog[0].p[2]-p[2])<1){this.stats.culled=(this.stats.culled||0)+1;TacticalCommon.log(this.app,z,'Culled: stalled twice in the same spot');this.despawn(z);return;}}
 if(!busy&&z.alive){var crawl=z.type==='crawl';if(sp>0.1){var fast=sp>1.6||(crawl&&z.state==='chase');var clip=crawl?(fast?'crawl_run':'crawl'):(fast?'run':'walk'),base=crawl?(fast?2.0:ty.clipSpeed):(fast?cfg.types.run.clipSpeed:cfg.types.walk.clipSpeed);
   this.play(z,clip,false,Math.max(0.6,Math.min(1.8,sp/base)));}else this.play(z,crawl?'crawl':'idle',false,crawl?0.0001:1);}
 function turn(a,b,k){var d=Math.atan2(Math.sin(b-a),Math.cos(b-a));return a+d*Math.min(1,k);}};
TacticalZombies.prototype.paint=function(z,dt){z.tiltV+=(-z.tilt*120-z.tiltV*14)*dt;z.tilt+=z.tiltV*dt;
 if(z.alive){z.pivot.setLocalEulerAngles(Math.max(-18,Math.min(18,z.tilt*1.6)),0,0);z.pivot.setLocalPosition(0,0,0);}z.entity.setEulerAngles(0,z.yaw*180/Math.PI,0);
 if(z.flash||z._fl){z.flash=0;z._fl=false;z.mat.emissive.set(0,0,0);z.mat.update();}};

// Short reach rays prevent melee through walls.
TacticalZombies.prototype.meleeClear=function(z,s){var T=TacticalCommon.ns(this.app),a=z.pos(),b=s.pos();return !T.perception||!T.perception.sightBlocked([a[0],a[1]+.65,a[2]],[b[0],b[1]+.75,b[2]]);};
