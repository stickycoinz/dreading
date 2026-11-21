/* tacticalPerception: line of sight against the actual Editor geometry (every tagged entity with "Blocks sight")
   using TacticalCommon.rayWorld - the SAME ray used by cover scoring and by every shot.
   Each soldier gets a Yuka Vision + MemorySystem + Regulator (ported in tactical-yuka.js): configurable range / FOV,
   head + chest sight lines from the current eye height (stand 1.62 / crouch 1.12, NIGHT_SURVIVAL entEye), memory with
   last-seen position/time. Hidden enemies drop out of direct knowledge; soldiers act on the last-known position. */
var TacticalPerception=pc.createScript('tacticalPerception');
TacticalPerception.attributes.add('range',{type:'number',default:60,title:'Vision range (m)'});
TacticalPerception.attributes.add('fovDeg',{type:'number',default:150,title:'Field of view (deg)'});
TacticalPerception.attributes.add('memorySpan',{type:'number',default:12,title:'Memory span (s)'});
TacticalPerception.attributes.add('hz',{type:'number',default:5,title:'Vision updates per second'});
TacticalPerception.prototype.initialize=function(){var T=TacticalCommon.ns(this.app),self=this;T.perception=this;this.blockers=[];this.useBroadphase=true;this.cellSize=12;this.indexPeriod=0.20;this._indexBuiltAt=-1e9;this._cells=new Map();this._knownCache={};this._knownCacheTick=-1;this.stats={};this._statsRaw={};this._statsAt=0;
 // Yuka obstacle adapter: one object that tests the ray against every Editor blocker box.
 this.obstacle={lineOfSightTest:function(ray,out,maxT){var h=TacticalCommon.rayWorld(ray.origin,ray.direction,maxT||1e4,self.blockers);self._count('losRays');if(!h)return self.smokeHit(ray,out,maxT);self._count('losBlocked');for(var i=0;i<3;i++)out[i]=ray.origin[i]+ray.direction[i]*h.t;return out;}};};
TacticalPerception.prototype.refresh=function(){var C=TacticalCommon,groups={},flat=[];
 C.collect(this.app).filter(function(t){return t.blocksSight&&['door','defensiveArea','threat','stair','spawn'].indexOf(t.kind)<0;}).forEach(function(t){var s=C.shape(t.entity);s.kind=t.kind;var g=t.entity.townGroup;if(g==null)flat.push(s);else(groups[g]=groups[g]||[]).push(s);});
 /* pass 4: procedural town boxes are grouped per building into a cluster (AABB) so every ray stays cheap; Editor blockers keep their order */
 Object.keys(groups).forEach(function(g){var mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];groups[g].forEach(function(s){[-1,1].forEach(function(a){[-1,1].forEach(function(b){[-1,1].forEach(function(c){var p=C.corner(s,a,b,c);for(var i=0;i<3;i++){if(p[i]<mn[i])mn[i]=p[i];if(p[i]>mx[i])mx[i]=p[i];}});});});});
  flat.push({name:'town building '+g,cluster:true,children:groups[g],min:mn,max:mx,center:new pc.Vec3((mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2),half:[(mx[0]-mn[0])/2,(mx[1]-mn[1])/2,(mx[2]-mn[2])/2],axes:[new pc.Vec3(1,0,0),new pc.Vec3(0,1,0),new pc.Vec3(0,0,1)]});});
 this.blockers=flat;this.blockerCount=flat.reduce(function(a,s){return a+(s.children?s.children.length:1);},0);};
/* Riposte smokeBlocks (tactical-grenades.js): a smoke cloud stops SIGHT (Yuka vision of soldiers and zombies, flashes, urgent-threat LOS);
   it does not stop bullets or cover scoring (blocked() stays geometric). Returns the ray origin so Yuka treats it as an occluder. */
TacticalPerception.prototype.smokeHit=function(ray,out,maxT){var G=TacticalCommon.ns(this.app).grenades;if(!G||!G.smokes||!G.smokes.length)return null;var o=ray.origin,d=ray.direction,L=Math.min(maxT||200,200);
 if(!G.smokeBlocks(o,[o[0]+d[0]*L,o[1]+d[1]*L,o[2]+d[2]*L]))return null;this._count('smokeBlocked');out[0]=o[0];out[1]=o[1];out[2]=o[2];return out;};
TacticalPerception.prototype.sightBlocked=function(a,b){if(this.blocked(a,b))return true;var G=TacticalCommon.ns(this.app).grenades;return !!(G&&G.smokes&&G.smokes.length&&G.smokeBlocks(a,b));};
TacticalPerception.prototype.blocked=function(a,b){var d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],L=Math.hypot(d[0],d[1],d[2]);if(L<1e-6)return null;var h=TacticalCommon.rayWorld(a,[d[0]/L,d[1]/L,d[2]/L],L-0.02,this.blockers);return h?h.shape:null;};
TacticalPerception.prototype.attach=function(s){var Y=TacticalYuka,self=this;
 s.vision=new Y.Vision({getWorldPosition:function(){return TacticalNS.entEye(s);},getWorldDirection:function(){return TacticalNS.fwd(s.lookYaw,0);}});
 s.vision.range=this.range;s.vision.fieldOfView=this.fovDeg*Math.PI/180;s.vision.addObstacle(this.obstacle);
 s.memory=new Y.MemorySystem(s);s.memory.memorySpan=this.memorySpan;s.regulator=new Y.Regulator(this.hz,(s.uid%64)/(64*this.hz));};
// Yuka-style updateVision (pattern from Mugen87/dive Enemy.js, MIT): visible -> refresh record, else record.visible=false.
TacticalPerception.prototype.updateSoldierLegacy=function(s,now){
 var T=TacticalCommon.ns(this.app),NS=TacticalNS;if(!s.alive)return;
 var me=s.pos(),R=this.range,list=T.zombies&&T.zombies.length?T.squad.concat(T.zombies):T.squad;
 list.forEach(function(e){if(e===s||e.team===s.team||e.disabled)return;
  if(e.isZombie){if(!e.alive&&!(s.memory.hasRecord(e)))return;var zp=e.pos();if(e.alive&&Math.hypot(zp[0]-me[0],zp[2]-me[2])>R){if(s.memory.hasRecord(e))s.memory.getRecord(e).visible=false;return;}}
  if(!s.memory.hasRecord(e))s.memory.createRecord(e);var r=s.memory.getRecord(e);
  if(!e.alive){r.visible=false;r.dead=true;return;}r.dead=false;
  var night=globalThis.DreadingNight;var seen=(!night||night.lit(s,e,T,T.perception))&&(s.vision.visible(NS.entHead(e))||s.vision.visible(NS.entChest(e)));
  if(seen){if(!r.visible)r.timeBecameVisible=now;r.timeLastSensed=now;var p=e.pos();r.lastSensedPosition=[p[0],p[1],p[2]];r.lastVisualPosition=r.lastSensedPosition.slice();r.lastVisualT=now;r.visible=true;}
  else r.visible=false;});
};

/* Hierarchical perception: rebuild a compact broadphase on a timer. This is
   *not* renderer culling: unseen threats remain simulated and can be heard.
   A cached 12 m grid limits the expensive Yuka head/chest LOS tests to near,
   forward-facing targets. Records are created only when seen or heard. */
TacticalPerception.prototype._count=function(name,n){this._statsRaw[name]=(this._statsRaw[name]||0)+(n===undefined?1:n);};
TacticalPerception.prototype._index=function(now){
 if(now>=this._indexBuiltAt&&now-this._indexBuiltAt<this.indexPeriod)return;
 var T=TacticalCommon.ns(this.app),cs=this.cellSize,cells=new Map(),list=T.squad.concat(T.zombies||[]);
 for(var i=0;i<list.length;i++){var e=list[i];if(!e||!e.alive||e.disabled)continue;
  var p=e.pos(),ix=Math.floor(p[0]/cs),iz=Math.floor(p[2]/cs),k=ix+','+iz,b=cells.get(k);
  if(!b){b=[];cells.set(k,b);}b.push(e);}
 this._cells=cells;this._indexBuiltAt=now;this._count('indexBuilds');
};
TacticalPerception.prototype.nearby=function(pos,r,now){
 this._index(now);var cs=this.cellSize,ix=Math.floor(pos[0]/cs),iz=Math.floor(pos[2]/cs),span=Math.ceil(r/cs),out=[];
 for(var x=ix-span;x<=ix+span;x++)for(var z=iz-span;z<=iz+span;z++){
  var b=this._cells.get(x+','+z);if(!b)continue;for(var j=0;j<b.length;j++)out.push(b[j]);}
 return out;
};
TacticalPerception.prototype.nearSoldiers=function(pos,r,now){
 var c=this.nearby(pos,r,now);return c.filter(function(e){return !e.isZombie;});
};
TacticalPerception.prototype.updateSoldier=function(s,now){
 if(!this.useBroadphase)return this.updateSoldierLegacy(s,now);
 if(!s.alive||!s.memory||!s.vision)return;
 var T=TacticalCommon.ns(this.app),NS=TacticalNS,me=s.pos(),R=this.range,R2=R*R,forward=NS.fwd(s.lookYaw,0),limit=Math.cos(this.fovDeg*Math.PI/360);
 var old=s.memory.getValidMemoryRecords(now,[]),previouslyVisible=new Set();for(var i=0;i<old.length;i++){if(old[i].visible)previouslyVisible.add(old[i].entity);old[i].visible=false;if(!old[i].entity.alive)old[i].dead=true;}
 if(s.blindT&&now<s.blindT){this._count('blinded');return;}/* Riposte flashBang: a blinded soldier sees nothing (still hears) */
 var candidates=this.nearby(me,R,now);this._count('visualScans');this._count('nearCandidates',candidates.length);
 for(var j=0;j<candidates.length;j++){
  var e=candidates[j];if(e===s||!e.alive||e.disabled||e.team===s.team)continue;
  var p=e.pos(),dx=p[0]-me[0],dz=p[2]-me[2],dy=p[1]-me[1],ds=dx*dx+dz*dz;
  if(ds>R2||dy*dy+ds>R2){this._count('rangeRejected');continue;}
  this._count('inRange');
  var horiz=Math.sqrt(ds);
  if(horiz>0.001&&(dx*forward[0]+dz*forward[2])<horiz*limit){this._count('fovRejected');continue;}
  this._count('inFov');
  /* Yuka applies its own exact FOV/range and our existing world-blocker LOS. */
  var night=globalThis.DreadingNight;var seen=(!night||night.lit(s,e,T,T.perception))&&(s.vision.visible(NS.entHead(e))||s.vision.visible(NS.entChest(e)));
  if(!seen){this._count('occluded');continue;}
  this._count('seen');
  if(!s.memory.hasRecord(e))s.memory.createRecord(e);
  var rec=s.memory.getRecord(e);if(!previouslyVisible.has(e))rec.timeBecameVisible=now;
  rec.timeLastSensed=now;rec.lastSensedPosition=[p[0],p[1],p[2]];rec.lastVisualPosition=rec.lastSensedPosition.slice();rec.lastVisualT=now;rec.visible=true;rec.dead=false;
 }
};
TacticalPerception.prototype.metrics=function(){return Object.assign({mode:this.useBroadphase?'hierarchical':'legacy',indexCells:this._cells.size},this.stats);};
// Hearing / being shot at: direction + rough position, not an address (NIGHT_SURVIVAL botHurt / suppressAlongRay idea).
TacticalPerception.prototype.sense=function(s,e,now,noise){if(!s.memory||!e)return;if(!s.memory.hasRecord(e))s.memory.createRecord(e);var r=s.memory.getRecord(e);if(r.visible)return;
 var p=e.pos(),n=noise||2;r.lastSensedPosition=[p[0]+TacticalCommon.rand(-n,n),p[1],p[2]+TacticalCommon.rand(-n,n)];r.timeLastSensed=now;};
TacticalPerception.prototype.update=function(){var T=TacticalCommon.ns(this.app),self=this;if(!T.ready||!T.running||T.paused)return;var now=T.elapsed;
 var PF=globalThis.DreadingPerf;if(PF&&PF.use('budget')&&TacticalCommon.AI.on){this.budgetedScan(T,now);}else
 T.squad.forEach(function(s){if(s.alive&&s.regulator&&s.regulator.ready(now))self.updateSoldier(s,now);});
 if(TacticalCommon.AI.on)this.hearTick(now);
 if(now<this._statsAt){this._statsAt=now;this._statsRaw={};}
 if(now-this._statsAt>=1){this.stats=this._statsRaw;this._statsRaw={};this._statsAt=now;}
};
/* pass E: hearing. Deterministic (no RNG, no rays): sound ignores walls, position error grows with distance and is a hash of
   (listener, source, second). Footsteps and growls are time-sliced: every 0.25 s half the squad listens (each soldier every 0.5 s). */
TacticalPerception.HEAR={step:{run:12,walk:8,crawl:5,crawl_run:6},growl:14,scream:30,growlEvery:3,growlLen:0.5};
TacticalPerception.prototype.hear=function(s,e,now,kind){if(!s.memory||!e||!e.alive||!s.alive)return false;if(!s.memory.hasRecord(e))s.memory.createRecord(e);var r=s.memory.getRecord(e);
 s.heardT=now;s.heardKind=kind;var st=this.hearStats||(this.hearStats={});st[kind]=(st[kind]||0)+1;if(r.visible)return true;
 var p=e.pos(),me=s.pos(),d=Math.hypot(p[0]-me[0],p[2]-me[2]),n=Math.min(3,Math.max(0.5,d*0.12)),h=((s.uid*73856093)^((e.uid||0)*19349663)^(Math.floor(now)*83492791))>>>0,a=(h%6283)/1000,m=((h>>>13)%1000)/1000*n;
 r.lastSensedPosition=[p[0]+Math.cos(a)*m,p[1],p[2]+Math.sin(a)*m];r.timeLastSensed=now;r.heard=kind;return true;};
TacticalPerception.prototype.hearAll=function(src,radius,kind,now){if(!TacticalCommon.AI.on)return 0;var T=TacticalCommon.ns(this.app),p=src.pos(),self=this,n=0;
 T.squad.forEach(function(s){if(!s.alive||s.controlled||s.team===src.team)return;var q=s.pos();if(Math.hypot(q[0]-p[0],q[2]-p[2])<=radius&&self.hear(s,src,now,kind))n++;});return n;};
TacticalPerception.prototype.hearTick=function(now){var tick=Math.floor(now/0.25);if(tick===this.hearTickIdx&&now>=(this.hearLastNow||0)){this.hearLastNow=now;return;}if(now<(this.hearLastNow||0))this.hearStats={};this.hearTickIdx=tick;this.hearLastNow=now;var T=TacticalCommon.ns(this.app),H=TacticalPerception.HEAR,self=this,par=tick&1,zs=T.zombies||[];if(!zs.length)return;
 T.squad.forEach(function(s){if(!s.alive||s.controlled||(s.uid&1)!==par)return;var me=s.pos(),best=null,bd=1e9,kind=null;
  var pool=self.useBroadphase?self.nearby(me,Math.max(14,Math.sqrt(144)),now):zs;for(var i=0;i<pool.length;i++){var z=pool[i];if(!z.isZombie)continue;if(!z.alive)continue;var p=z.pos(),dx=p[0]-me[0],dz=p[2]-me[2],d2=dx*dx+dz*dz;if(d2>H.growl*H.growl&&d2>144)continue;
   var sr=z.moving?(H.step[z.type]||8):0,k=null;if(sr&&d2<=sr*sr)k='footsteps';
   else if((z.state==='chase'||z.state==='investigate'||z.state==='feed'||z.state==='attack')&&d2<=H.growl*H.growl&&((now+(z.uid||i)*0.73)%H.growlEvery)<H.growlLen)k='growl';
   if(k&&d2<bd){bd=d2;best=z;kind=k;}}
  if(best)self.hear(s,best,now,kind);});};
// Known threats for a soldier: own valid records, then squad-shared records (radio), living only.
TacticalPerception.prototype.known=function(s,shared){var T=TacticalCommon.ns(this.app),now=T.elapsed,out=[],seen=new Set(),tmp=[];
 /* Radio intel is cached for 0.2 s per faction; callers must not mutate it. */
 var tick=Math.floor(now*5);if(this._knownCacheTick!==tick){this._knownCache={};this._knownCacheTick=tick;}
 if(shared&&this._knownCache[s.team])return this._knownCache[s.team];
 var mates=shared?T.squad.filter(function(o){return o.team===s.team&&o.alive;}):[s];
 mates.forEach(function(m){if(!m.memory)return;tmp.length=0;m.memory.getValidMemoryRecords(now,tmp).forEach(function(r){if(r.dead||!r.entity.alive||seen.has(r.entity))return;seen.add(r.entity);out.push(r);});});
 if(shared)this._knownCache[s.team]=out;
 return out;};
// Fallback "likely enemy" point when nothing is known: centroid of the other team's spawn points (briefing intel).
TacticalPerception.prototype.threatPoint=function(team){var T=TacticalCommon.ns(this.app),pts=(T.spawnPoints||[]).filter(function(p){return team&&p.team!==team;});
 if(!pts.length)return [12,1.5,11];var c=[0,0,0];pts.forEach(function(p){c[0]+=p.position[0];c[1]+=p.position[1];c[2]+=p.position[2];});return [c[0]/pts.length,c[1]/pts.length+1.2,c[2]/pts.length];};
/* Threat points for cover scoring: every known enemy (last sensed position) plus the posts of enemies not yet located
   (opposing spawn markers = intel on where the defenders are). Using individual posts instead of their centroid matters:
   a centroid inside the building is hidden from almost everywhere and made exposed slots look safe. */
TacticalPerception.prototype.threatsFor=function(s){var T=TacticalCommon.ns(this.app),k=this.known(s,true),out=k.map(function(r){var p=r.lastSensedPosition;return [p[0],p[1]+1.2,p[2]];});
 (T.spawnPoints||[]).filter(function(p){return s.team&&p.team!==s.team;}).forEach(function(sp){var q=sp.position||sp.p||sp;if(!q||q.length<3)return;
  if(!out.some(function(o){return Math.hypot(o[0]-q[0],o[2]-q[2])<3;}))out.push([q[0],q[1]+1.3,q[2]]);});
 return out.length?out:[this.threatPoint(s.team)];};
TacticalPerception.prototype.canSee=function(pos,eyeHeight,target){var p=TacticalCommon.v3(pos);return !this.blocked([p[0],p[1]+eyeHeight,p[2]],target);};

/* DREADING_perf: per-frame perception budget. Soldiers whose 5 Hz vision is due are scanned oldest-due first until
   budgetMs is spent (at least minPerFrame per frame); the rest stay due and go first next frame, so a burst of due
   scans (big frame, many soldiers) is spread instead of landing in one frame. Off under ?ai=0 (legacy hashes). */
TacticalPerception.BUDGET={ms:1.6,minPerFrame:3,maxLag:0.25};
TacticalPerception.prototype.budgetedScan=function(T,now){var B=TacticalPerception.BUDGET,due=this._due||(this._due=[]);due.length=0;
 for(var i=0;i<T.squad.length;i++){var s=T.squad[i];if(s.alive&&s.regulator&&now>=s.regulator._nextUpdateTime)due.push(s);}
 if(!due.length)return;due.sort(function(a,b){return a.regulator._nextUpdateTime-b.regulator._nextUpdateTime;});
 var t0=performance.now(),done=0;for(var j=0;j<due.length;j++){var s2=due[j];
  /* overdue by more than maxLag: always run (keeps the effective rate near 5 Hz under heavy load) */
  if(done>=B.minPerFrame&&performance.now()-t0>B.ms&&now-s2.regulator._nextUpdateTime<B.maxLag){this._count('budgetDeferred',due.length-j);break;}
  s2.regulator.ready(now);this.updateSoldier(s2,now);done++;}
};
