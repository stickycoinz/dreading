/* tacticalSquadOrders: RTS order layer (new glue) + "initiative" + enemy defence + encounter outcome.
   - moveGroup: each selected soldier gets its own reserved spot around the click (rings, 1.3 m spacing, snapped to the navmesh)
   - takeCover: distinct cover slots along the clicked wall/crate on the side away from known (else likely) enemies, crouch-peek
   - initiative (key I / button): friendlies holding near the objective with no enemy seen for N s stack at the stair door
     (stairApproach1/2 markers) and secure the building (overwatch1/2 + room1/2 markers) - the milestone 1 advance logic, generalized
   - enemies: hold their Editor spawn markers (spawn marker rotation = facing) and fight from there
   All destinations are Editor marker entities (tacticalTag Defensive area, Slot id). */
var TacticalSquadOrders=pc.createScript('tacticalSquadOrders');
TacticalSquadOrders.attributes.add('initiativeDelay',{type:'number',default:6,title:'Initiative: seconds without contact'});
TacticalSquadOrders.attributes.add('holdSeconds',{type:'number',default:20,title:'Match end: objective held with no enemy near (s)'});
TacticalSquadOrders.attributes.add('pushAt',{type:'number',default:120,title:'Timeout fallback: attackers push at (s)'});
TacticalSquadOrders.attributes.add('timeLimit',{type:'number',default:300,title:'Match time limit -> draw (s)'});
TacticalSquadOrders.attributes.add('initiativeRadius',{type:'number',default:35,title:'Initiative: radius around objective (m)'});
TacticalSquadOrders.prototype.initialize=function(){var T=TacticalCommon.ns(this.app);T.orders=this;T.initiative=true;this.assault=null;this.clearMemory=new Map();this.autonomousAssaults=new Set();T.lastContactT=0;T.outcome=null;};
/* M5b: a direct player move / cover order is held until the next player order (AI on). Returns the clicked spot. */
TacticalSquadOrders.held=function(s){var o=s&&s.order;if(!TacticalCommon.AI.on||!o||o.by!=='player'||(o.type!=='move'&&o.type!=='cover'))return null;return o.anchor||o.dest||null;};
TacticalSquadOrders.HOLD_SLACK=1.5;
TacticalSquadOrders.prototype.slot=function(name,fallback){var m=TacticalCommon.marker(this.app,name);if(m)return TacticalCommon.v3(m.entity.getPosition());return fallback;};
TacticalSquadOrders.prototype.team=function(t){return TacticalCommon.ns(this.app).squad.filter(function(s){return s.team===t&&!s.disabled;});};
TacticalSquadOrders.prototype.objective=function(){var o=this.slot('objective',null);if(o)return o;var a=this.slot('overwatch1',[8,3.2,5.8]),b=this.slot('overwatch2',[12,3.2,5.8]);return [(a[0]+b[0])/2,0,(a[2]+b[2])/2];};
/* reserved spots: other soldiers' destinations and cover claims */
TacticalSquadOrders.prototype.reserved=function(except){var T=TacticalCommon.ns(this.app),out=[];T.squad.forEach(function(o){if(except.indexOf(o)>=0||!o.alive)return;out.push(o.goal||o.pos());});T.cover.claims.forEach(function(p,s){if(except.indexOf(s)<0&&s.alive)out.push(p);});return out;};
TacticalSquadOrders.prototype.spots=function(group,point){
 var T=TacticalCommon.ns(this.app),nav=T.navigation,res=this.reserved(group),spots=[],ring=0;
 // A near click should remain a near click. The previous 2-metre snap
 // could choose a different walkable surface across a wall.
 var c=nav.nearest(point,{x:0.7,y:1.5,z:0.7});
 if(!c||Math.hypot(c[0]-point[0],c[2]-point[2])>0.55)return new Map();
 // Large selections preserve squad clusters instead of mixing everyone into concentric rings.
 if(group.length>4){var groups=new Map(),out=new Map(),taken=res.slice();group.forEach(function(s){var k=s.squadKey||('unit-'+s.uid);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);});
  var gi=0;groups.forEach(function(members){var angle=gi*2.399963,radius=gi?4.2*Math.sqrt(gi):0,center=[c[0]+Math.cos(angle)*radius,c[1],c[2]+Math.sin(angle)*radius];gi++;
   members.forEach(function(s,i){var found=null;for(var j=0;j<24&&!found;j++){var a=(i+j)*2.399963,r=1.5*Math.sqrt(i+j),q=nav.nearest([center[0]+Math.cos(a)*r,center[1],center[2]+Math.sin(a)*r],{x:.6,y:1,z:.6});if(q&&Math.abs(q[1]-c[1])<1&&!taken.some(function(p){return Math.hypot(p[0]-q[0],p[2]-q[2])<1.3;})){found=q;taken.push(q);out.set(s,q);}}});
  });return out;}
 // No formation ring or cover rearrangement for a single selected soldier.
 if(group.length===1)return new Map([[group[0],c]]);
 while(spots.length<group.length&&ring<8){var n=ring===0?1:Math.round(2*Math.PI*ring*1.3/1.3);
  for(var i=0;i<n&&spots.length<group.length;i++){var a=i/n*Math.PI*2+ring*0.5,p=[c[0]+Math.cos(a)*ring*1.3,c[1],c[2]+Math.sin(a)*ring*1.3],q=nav.nearest(p,{x:0.6,y:2,z:0.6});
   if(!q||Math.hypot(q[0]-p[0],q[2]-p[2])>0.5)continue;if(res.concat(spots).some(function(r){return Math.hypot(r[0]-q[0],r[2]-q[2])<1.0&&Math.abs(r[1]-q[1])<1.5;}))continue;spots.push(q);}ring++;}
 // greedy: closest soldier/spot pairs first
 var pairs=[],used=new Set(),out=new Map();group.forEach(function(s){spots.forEach(function(p,j){var m=s.pos();pairs.push([Math.hypot(m[0]-p[0],m[2]-p[2]),s,j]);});});
 pairs.sort(function(a,b){return a[0]-b[0];}).forEach(function(pr){if(out.has(pr[1])||used.has(pr[2]))return;out.set(pr[1],spots[pr[2]]);used.add(pr[2]);});return out;};
TacticalSquadOrders.prototype.cancelAssault=function(group){if(this.assault){var a=this.assault;group.forEach(function(s){var i=a.members.indexOf(s);if(i>=0)a.members.splice(i,1);});if(!a.members.length)this.assault=null;}};
TacticalSquadOrders.prototype.moveGroup=function(group,point,face){var self=this,T=TacticalCommon.ns(this.app);group=group.filter(function(s){return s.alive;});if(!group.length)return [];this.cancelAssault(group);
 var map=this.spots(group,point),out=[],AIon=TacticalCommon.AI.on,used=[];this.assignSectors(group,face||this.travelFace(group,point));group.forEach(function(s){T.cover.release(s);});
 group.forEach(function(s){s.inCover=false;s.hold=false;s.suppress=null;s._rocketCommand=null;var p=map.get(s);if(!p){s.stop();s.order={type:'move',by:'player',dest:s.pos(),anchor:s.pos(),failed:true};out.push({soldier:s.soldierName,failed:true,error:'No free destination near the order',path:[]});return;}var cv=null;
  if(AIon&&Math.hypot(s.pos()[0]-p[0],s.pos()[2]-p[2])>3.0){/* preserve precise short move orders; auto-cover only for larger moves */var bd=TacticalSquadOrders.HOLD_SLACK;T.cover.usable().forEach(function(c){var q=c.position,d=Math.hypot(q[0]-p[0],q[2]-p[2]);if(d<bd&&Math.abs(q[1]-p[1])<1&&!T.cover.claimedBy(q,s)&&!used.some(function(u){return Math.hypot(u[0]-q[0],u[2]-q[2])<1.0;})){bd=d;cv=c;}});}
  if(cv){p=cv.position.slice();T.cover.claim(s,p);s.chosenCover={position:p,source:cv.source,kind:cv.kind,crouched:true};}used.push(p);
  if(!s.moveTo(p,'Moving (player order)'+(cv?' - cover at '+cv.source:''))){
   if(cv)T.cover.release(s);
   // Keep a failed command from triggering the previous order or wandering.
   s.order={type:'move',dest:s.pos(),anchor:s.pos(),by:'player',failed:true};
   out.push({soldier:s.soldierName,dest:p,failed:true,error:s.routeError,path:[]});return;
  }
  s.order={type:'move',dest:p,anchor:p.slice(),face:face||null,by:'player'};s.acSpot=null;
  out.push({soldier:s.soldierName,dest:p,cover:cv?cv.source:null,path:s.path.slice()});});
 T.lastOrderT=T.elapsed;return out;};
TacticalSquadOrders.prototype.takeCover=function(group,source,click){var self=this,T=TacticalCommon.ns(this.app),P=T.perception;group=group.filter(function(s){return s.alive;});if(!group.length)return [];this.cancelAssault(group);
 var threats=P.threatsFor(group[0]),res=T.cover.assign(group,threats,{source:source,near:click,distW:0.25}),out=[],rest=[];
 var tc=threats.reduce(function(a,t){return [a[0]+t[0]/threats.length,a[1]+t[1]/threats.length,a[2]+t[2]/threats.length];},[0,0,0]);
 this.assignSectors(group,tc);res.forEach(function(r){var s=r.soldier;if(!r.slot||r.slot.score<-50){T.cover.release(s);rest.push(s);return;}s.hold=false;s.inCover=false;s.chosenCover=r.slot;s.order={type:'cover',dest:r.slot.position,anchor:r.slot.position.slice(),face:tc,source:source,by:'player'};s.moveTo(r.slot.position,'Taking cover at '+source+(r.slot.crouched?'':' (exposed side!)'));out.push({soldier:s.soldierName,dest:r.slot.position,crouchedSafe:r.slot.crouched,path:s.path.slice()});});
 if(rest.length)this.moveGroup(rest,click,tc).forEach(function(o){o.fallback=true;out.push(o);});
 T.lastOrderT=T.elapsed;return out;};
TacticalSquadOrders.prototype.onArrived=function(s){var C=TacticalCommon,T=C.ns(this.app),o=s.order;
 if(o&&o.type==='cover'){s.inCover=T.cover.usable().some(function(c){return Math.hypot(c.position[0]-s.pos()[0],c.position[2]-s.pos()[2])<0.8;})||!!(s.chosenCover&&Math.hypot(s.chosenCover.position[0]-s.pos()[0],s.chosenCover.position[2]-s.pos()[2])<0.8);C.log(this.app,s,'In cover ('+o.source+')');}
 else if(o&&(o.type==='hunt'||o.type==='defend')){o.arrived=true;s.inCover=T.cover.usable().some(function(c){return Math.hypot(c.position[0]-s.pos()[0],c.position[2]-s.pos()[2])<0.8;});C.log(this.app,s,o.type==='hunt'?'Bound complete - covering':'In position');}
 else if(o&&o.type==='move'){s.inCover=T.cover.usable().some(function(c){return Math.hypot(c.position[0]-s.pos()[0],c.position[2]-s.pos()[2])<0.8&&Math.abs(c.position[1]-s.pos()[1])<1;});if(o.by==='player'&&C.AI.on){C.log(this.app,s,s.inCover?'Holding (player order) - in cover':'Holding (player order)');return;}C.log(this.app,s,'Holding position');}
 else if(o&&o.type==='follow'){s.inCover=o.phase==='cover';C.log(this.app,s,o.phase==='cover'?'Follow: in cover':'Follow: in formation');}
 else if(o&&o.type==='brain'){o.arrived=true;s.inCover=T.cover.usable().some(function(c){return Math.hypot(c.position[0]-s.pos()[0],c.position[2]-s.pos()[2])<0.8&&Math.abs(c.position[1]-s.pos()[1])<1;});}
 else if(o&&o.type==='assault'){o.arrived=true;s.inCover=false;C.log(this.app,s,o.phase==='stack'?'Stacked at door':'Position secured ('+o.slot+')');}
};
/* ---- initiative / assault ---- */
TacticalSquadOrders.prototype.startAssault=function(members,reason){var C=TacticalCommon,self=this;members=members.filter(function(s){return s.alive&&!s.controlled;});if(!members.length)return null;
 this.assault={phase:'stack',members:members,t:C.ns(this.app).elapsed,reason:reason};
 members.forEach(function(s,i){var k=Math.min(i,1)+1,p=self.slot('stairApproach'+k,[3.5,0,-9-i*1.5]);if(i>=2)p=[p[0]+(i%2?0.8:-0.8),p[1],p[2]-1.3*(i-1)];
  C.ns(self.app).cover.release(s);s.inCover=false;s.hold=false;s.order={type:'assault',phase:'stack',dest:p,slot:'stack',by:'initiative'};s.moveTo(p,'Initiative: stacking at the door ('+reason+')');});
 return this.assault;};
TacticalSquadOrders.prototype.enterBuilding=function(){var C=TacticalCommon,self=this,a=this.assault;a.phase='enter';a.t=C.ns(this.app).elapsed;
 var slots=['overwatch1','overwatch2','room1','room2'],fb=[[8,3.2,5.8],[12,3.2,5.8],[9,0,3],[12,0,-3]];
 a.members.forEach(function(s,i){if(!s.alive)return;var sl=slots[i%4],p=self.slot(sl,fb[i%4]);s.order={type:'assault',phase:'enter',dest:p,slot:sl,by:'initiative'};s.moveTo(p,'Entering building -> '+sl);});};
TacticalSquadOrders.prototype.order=function(){// "Secure building" button: everyone alive goes now
 var T=TacticalCommon.ns(this.app),members=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled&&s.team==='friendly';});if(!members.length)members=T.input&&T.input.activeSquad?T.input.activeSquad():TacticalCommon.squadMembers(T,this.team('friendly')[0]);T.running=true;if(TacticalCommon.AI.on){return this.startBrain('assault',members,{by:'order',reason:'Secure building'});}this.startAssault(members,'order');};
TacticalSquadOrders.prototype.reset=function(seed){var T=TacticalCommon.ns(this.app);if(T.input&&T.input.fps)T.input.exitControl('reset');
 if(seed!==undefined)T.seedValue=seed;TacticalCommon.seed(T.seedValue||1);// same seed -> same match
 this.clearMemory=new Map();this.autonomousAssaults=new Set();this.docT=0;T.doc={};T.gunfight={};T.noise=null;T.docStats=null;T.docShelters=0;T.docFlanks=0;this._docInfo=null;this._enAngT=0;T.angleHolds=0;T.angleReassign=0;T.doorFixes=0;T.doorSpotFix=0;(T.squad||[]).forEach(function(s){s.flankT=0;s.docMoveT=0;s.doc=null;s.doorT=null;});/* M6 doctrine state is per match (M7 angle counters too) */
 if(T.cover&&T.cover.claims)T.cover.claims.clear();T.lastOrderT=-99;this.sepT=0;this.hunt=null;this.follow=null;this.heldSince=null;this.pushed=false;if(T.input){T.input.preview=null;}
 this.assault=null;this.brain=null;this.lastBrain=null;this.brainSeq=0;T.outcome=null;T.elapsed=0;T.lastContactT=0;T.events.length=0;if(T.combat)T.combat.resetCounters();T.squad.forEach(function(s){s.reset();});this.applyEnemySquad();this.setupEnemies();if(T.perception)this.assignSectors(this.team('friendly'),T.perception.threatPoint('friendly'));if(T.zombieMgr)T.zombieMgr.reset();T.fallbacks=0;T.resupplies=0;this.supplyT=0;this.lastFallbackT=-99;this.cohesionT=0;this.overrunT=0;T.running=true;T.paused=false;};
TacticalSquadOrders.prototype.setupEnemies=function(){var T=TacticalCommon.ns(this.app);this.team('enemy').forEach(function(s){var sp=(T.spawnPoints||[]).find(function(p){return p.name===s.soldierName;});
 if(sp&&sp.yaw!==undefined){s.lookYaw=sp.yaw*Math.PI/180;}var f=TacticalNS.fwd(s.lookYaw,0),p=s.pos();s.order={type:'defend',dest:p,face:[p[0]+f[0]*10,p[1],p[2]+f[2]*10],by:'ai'};
 s.inCover=T.cover.usable().some(function(c){return Math.hypot(c.position[0]-p[0],c.position[2]-p[2])<1.0&&Math.abs(c.position[1]-p[1])<1;});TacticalCommon.log(s.app,s,'Defending post');});};
TacticalSquadOrders.prototype.update=function(dt){
 var C=TacticalCommon,T=C.ns(this.app),self=this;if(!T.running||T.paused||!T.ready)return;var now=T.elapsed;
 var fr=this.team('friendly'),en=this.team('enemy'),frA=fr.filter(function(s){return s.alive;}),enA=en.filter(function(s){return s.alive;});
 if(!T.outcome&&!T.sandbox){if(!enA.length&&en.length)T.outcome={winner:'friendly',text:'Building secured - enemy squad eliminated',time:+now.toFixed(1)};
  else if(!frA.length&&fr.length)T.outcome={winner:'enemy',text:'Your squad was eliminated',time:+now.toFixed(1)};
  if(T.outcome){console.log('TACTICAL_OUTCOME',JSON.stringify(T.outcome));T.events.push({time:T.outcome.time,soldier:'-',decision:T.outcome.text});}}
 if(!T.outcome&&!T.sandbox&&frA.length&&enA.length)this.matchRules(now,frA,enA);/* T.sandbox (tests): no match end */
 if(T.outcome)return;
 this.enemyTactics(now,frA,enA);
 this.zombieTactics(now,frA);
 this.doctrineTick(now,frA,enA);/* M6 */
 if(this.follow)this.followTick(now,frA);
 if(C.AI.on&&now>=(this.sepT||0)){this.sepT=now+0.5;this.separate(now,frA);}
 if(this.hunt)this.huntTick(now,enA);
 if(this.brain)this.brainTick(now);
 var contact=frA.some(function(s){return s.memory&&s.memory.records.some(function(r){return r.visible&&r.entity.alive;});});if(contact)T.lastContactT=now;
 var quiet=now-T.lastContactT>=this.initiativeDelay;
 if(!this.follow&&!this.assault&&!this.hunt&&!this.brain&&T.initiative&&quiet&&enA.length&&!(this.autonomousAssaults&&this.autonomousAssaults.has('objective'))){var obj=this.objective();
  var idle=frA.filter(function(s){var p=s.pos();return !s.controlled&&s.inCover&&!s.path.length&&(!s.order||s.order.type!=='assault')&&!TacticalSquadOrders.held(s)&&Math.hypot(p[0]-obj[0],p[2]-obj[2])<self.initiativeRadius;});
  if(idle.length&&now-(T.lastOrderT||-99)>2){if(C.AI.on)this.startBrain('assault',idle,{by:'initiative',reason:'no contact for '+this.initiativeDelay+' s'});else this.startAssault(idle,'no contact for '+this.initiativeDelay+' s');}}
 var a=this.assault;if(a){a.members=a.members.filter(function(s){return s.alive&&!s.controlled&&s.order&&s.order.type==='assault';});if(!a.members.length){this.assault=null;return;}
  if(a.phase==='stack'){var ready=a.members.every(function(s){return s.order.arrived;});
   if(!T.initiative&&a.reason!=='order'){a.members.forEach(function(s){s.stop();s.order={type:'move',dest:s.pos(),by:'hold'};});this.assault=null;return;}
   if((ready&&quiet)||(ready&&now-a.t>20))this.enterBuilding();}
  else if(a.phase==='enter'&&enA.length){var done=a.members.every(function(s){return s.order.arrived;});if(done||now-a.t>15)this.startHunt(a.members.concat(frA.filter(function(s){return !s.controlled&&!s.path.length&&(!s.order||s.order.type!=='assault');})),'rooms held, '+enA.length+' enemy left');}}
};

/* ================= Pass 2: match rules, hunt with pair bounding, enemy repositioning (new glue) ================= */
TacticalSquadOrders.prototype.endMatch=function(winner,text,now){var T=TacticalCommon.ns(this.app);T.outcome={winner:winner,text:text,time:+now.toFixed(1)};console.log('TACTICAL_OUTCOME',JSON.stringify(T.outcome));T.events.push({time:T.outcome.time,soldier:'-',decision:text});};
TacticalSquadOrders.prototype.matchRules=function(now,frA,enA){var obj=this.objective(),d=function(p){return Math.hypot(p[0]-obj[0],p[2]-obj[2]);};
 var held=frA.some(function(s){return d(s.pos())<8;})&&!enA.some(function(e){return d(e.pos())<12;});
 if(held){if(this.heldSince===null)this.heldSince=now;if(now-this.heldSince>=this.holdSeconds){this.endMatch('friendly','Objective held for '+this.holdSeconds+' s',now);return;}}else this.heldSince=null;
 if(now>=this.timeLimit){this.endMatch('draw','Time limit - draw',now);return;}
 if(!this.pushed&&!this.follow&&now>=this.pushAt&&this.brain&&this.brain.kind==='assault'&&!this.brain.withdrawn){this.pushed=true;return;}/* M5: the assault brain is already pushing */
 if(!this.pushed&&!this.follow&&now>=this.pushAt){this.pushed=true;this.brain=null;this.assault=null;var pm=frA.filter(function(s){return !s.controlled&&!TacticalSquadOrders.held(s);});if(pm.length)this.startHunt(pm,'time '+this.pushAt+' s: attackers push');}};
/* Search points: rooms / overwatch slots and the enemy posts (where defenders were placed in the Editor). */
TacticalSquadOrders.prototype.searchPoints=function(){var T=TacticalCommon.ns(this.app),self=this,pts=[];['room1','room2','overwatch1','overwatch2'].forEach(function(n){var p=self.slot(n,null);if(p)pts.push({name:n,p:p});});
 (T.spawnPoints||[]).filter(function(sp){return sp.team==='enemy';}).forEach(function(sp){pts.push({name:sp.name+' post',p:sp.position});});return pts;};
TacticalSquadOrders.prototype.startHunt=function(members,reason){var T=TacticalCommon.ns(this.app),C=TacticalCommon,seen=new Set();members=members.filter(function(s){if(!s||!s.alive||s.controlled||seen.has(s))return false;seen.add(s);return true;});if(members.length&&C.squadMembers){var unit=C.squadMembers(T,members[0]);members=members.filter(function(s){return unit.indexOf(s)>=0;});}
 if(!members.length)return null;this.assault=null;var pairs=[members.filter(function(_,i){return i%2===0;}),members.filter(function(_,i){return i%2===1;})].filter(function(p){return p.length;});
 this.hunt={members:members,pairs:pairs,active:0,t:T.elapsed,boundT:-99,visited:new Set(),reason:reason,target:null,bounds:0};
 members.forEach(function(s){T.cover.release(s);s.inCover=false;s.hold=false;s.order={type:'hunt',dest:s.pos(),arrived:true,by:'initiative'};C.log(s.app,s,'Clearing: '+reason);});return this.hunt;};
TacticalSquadOrders.prototype.huntTarget=function(h,enA){var T=TacticalCommon.ns(this.app),P=T.perception,best=null,bd=1e9,lead=h.members[0].pos();
 var k=P.known(h.members[0],true).filter(function(r){return r.entity.alive;});
 k.forEach(function(r){var p=r.lastSensedPosition,dd=Math.hypot(p[0]-lead[0],p[1]-lead[1],p[2]-lead[2]);if(dd<bd){bd=dd;best={name:'last known '+r.entity.soldierName,p:p.slice(),known:true};}});
 if(best){h.contactT=TacticalCommon.ns(this.app).elapsed;return best;}
 var now=TacticalCommon.ns(this.app).elapsed;if(now-(h.contactT||h.t)>40){enA.forEach(function(e){var p=e.pos(),dd=Math.hypot(p[0]-lead[0],p[1]-lead[1],p[2]-lead[2]);if(dd<bd){bd=dd;best={name:'heard movement ('+e.soldierName+')',p:p.slice(),known:false};}});if(best)return best;}
 var pts=this.searchPoints().filter(function(q){return !h.visited.has(q.name);});if(!pts.length){h.visited.clear();pts=this.searchPoints();}
 pts.forEach(function(q){var dd=Math.hypot(q.p[0]-lead[0],q.p[1]-lead[1],q.p[2]-lead[2]);if(dd<bd){bd=dd;best={name:q.name,p:q.p.slice(),known:false};}});return best;};
/* Pair bounding: one pair moves up to 7 m along the nav path toward the target while the other holds and covers; swap on
   arrival (or after 6 s). Search points count as cleared when anyone gets within 2.5 m. */
TacticalSquadOrders.prototype.huntTick=function(now,enA){var T=TacticalCommon.ns(this.app),C=TacticalCommon,h=this.hunt,self=this;
 h.members=h.members.filter(function(s){return s.alive&&!s.controlled&&s.order&&s.order.type==='hunt';});if(!h.members.length||!enA.length){this.hunt=null;return;}
 h.pairs=h.pairs.map(function(p){return p.filter(function(s){return h.members.indexOf(s)>=0;});}).filter(function(p){return p.length;});if(h.active>=h.pairs.length)h.active=0;
 this.searchPoints().forEach(function(q){if(h.members.some(function(s){var p=s.pos();return Math.hypot(p[0]-q.p[0],p[2]-q.p[2])<2.5&&Math.abs(p[1]-q.p[1])<1.5;}))h.visited.add(q.name);});
 var mover=h.pairs[h.active],moving=mover.some(function(s){return s.path.length>0&&!s.order.arrived;});
 if(moving&&now-h.boundT<6)return;
 if(now-h.boundT<0.8)return;
 if(h.pairs.length>1&&h.boundT>0)h.active=(h.active+1)%h.pairs.length;mover=h.pairs[h.active];
 var tgt=this.huntTarget(h,enA);h.target=tgt;if(!tgt)return;
 var lead=mover[0].pos(),path=null;try{path=T.navigation.path(lead,tgt.p);}catch(e){path=null;}
 var dest=tgt.p;if(path&&path.length>1){var acc=0;dest=path[path.length-1];for(var i=1;i<path.length;i++){var a=path[i-1],b=path[i],L=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);if(acc+L>=7){var t=(7-acc)/L;dest=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];break;}acc+=L;}}
 var spots=this.spots(mover,dest),face=tgt.p;h.boundT=now;h.bounds++;
 mover.forEach(function(s){var p=spots.get(s)||dest;s.order={type:'hunt',dest:p,face:face,arrived:false,by:'initiative'};s.moveTo(p,'Bounding toward '+tgt.name);});
 h.pairs.forEach(function(p,i){if(i===h.active)return;p.forEach(function(s){if(!s.path.length){s.order.face=face;if(s.decision.indexOf('Covering')<0)C.log(s.app,s,'Covering the bound');}});});};
/* Enemy tactics: a defender left alone (<=2 alive) or hit without seeing the shooter repositions every 12-18 s:
   counter-attack toward the last known attacker (more likely when last man) or fall back to the post / cover point
   farthest from known attackers. All choices use the seeded RNG. */
TacticalSquadOrders.prototype.enemyTactics=function(now,frA,enA){var T=TacticalCommon.ns(this.app),C=TacticalCommon,self=this,obj=this.objective();
 enA.forEach(function(e){if(e.moving||now<(e.repoT||0)||(e.fallbacks||0)>=3)return;e.fallbacks=(e.fallbacks||0)+1;var hitBlind=now-e.lastHitT<1&&!e.target,alone=enA.length<=2;if(!alone&&!hitBlind)return;
  e.repoT=now+C.rand(12,18);var known=T.perception.known(e,true).filter(function(r){return r.entity.alive;}),me=e.pos();
  if(known.length&&C.random()<(enA.length===1?0.55:0.35)){var kp=known[0].lastSensedPosition,dx=kp[0]-me[0],dz=kp[2]-me[2],L=Math.hypot(dx,dz)||1,k=Math.max(0,L-6)/L;
   var tgt=T.navigation.nearest([me[0]+dx*k,kp[1],me[2]+dz*k],{x:2,y:3,z:2});if(tgt){e.order={type:'defend',dest:tgt,face:kp,by:'ai'};T.cover.release(e);e.inCover=false;e.moveTo(tgt,'Counter-attack toward '+known[0].entity.soldierName);return;}}
  var cands=self.searchPoints().map(function(q){return q.p;}).concat(T.cover.usable().filter(function(c){return Math.hypot(c.position[0]-obj[0],c.position[2]-obj[2])<16;}).map(function(c){return c.position;}));
  var threat=known.length?known.map(function(r){return r.lastSensedPosition;}):frA.map(function(s){return s.pos();});
  var best=null,bs=-1e9;cands.forEach(function(p){if(Math.hypot(p[0]-me[0],p[2]-me[2])<2)return;if(T.squad.some(function(o){return o!==e&&o.alive&&Math.hypot((o.goal||o.pos())[0]-p[0],(o.goal||o.pos())[2]-p[2])<1;}))return;
   var dmin=Math.min.apply(null,threat.map(function(t){return Math.hypot(t[0]-p[0],t[2]-p[2]);}));var sc=dmin+C.rand(0,4)-Math.hypot(p[0]-me[0],p[2]-me[2])*0.2;if(sc>bs){bs=sc;best=p;}});
  if(best){var tc=threat[0];e.order={type:'defend',dest:best,face:tc,by:'ai'};T.cover.release(e);e.inCover=false;e.moveTo(best,'Falling back to a new position');}});};

/* ================= Pass 3: enemy squad toggle + soldier tactics vs zombies (new glue) ================= */
TacticalSquadOrders.prototype.applyEnemySquad=function(){var T=TacticalCommon.ns(this.app),off=T.enemySquadOff;T.squad.forEach(function(s){if(s.team!=='enemy')return;s.disabled=!!off;if(off){s.alive=false;s.health=0;s.path=[];}s.entity.enabled=!off;if(s.label&&off)s.label.style.display='none';});};
TacticalSquadOrders.prototype.setEnemySquad=function(on){var T=TacticalCommon.ns(this.app);T.enemySquadOff=!on;this.applyEnemySquad();if(on){T.squad.forEach(function(s){if(s.team==='enemy'&&!s.alive&&!s.deathT){s.reset();}});this.setupEnemies();}};
/* Overrun: >=3 zombies chasing/attacking within 7 m of one soldier, or >=6 within 10 m of the squad -> the whole squad
   (cohesion) falls back into the building: upstairs overwatch first (stair choke), then the ground rooms. Re-armed after 20 s.
   Cohesion: an idle soldier > 16 m from the squad centroid with no visible target regroups next to it (every 2 s). */
TacticalSquadOrders.prototype.zombieTactics=function(now,frA){var T=TacticalCommon.ns(this.app),C=TacticalCommon,self=this;if(T.trainingMode)return;if(!T.zombies||!T.zombies.length)return;
 var ctl=frA.filter(function(s){return !s.controlled;});if(!ctl.length)return;
 // the building is only a refuge / supply point once no enemy soldier is alive inside it
 var obH=this.objective(),held=T.squad.some(function(s){if(s.team!=='enemy'||!s.alive||s.disabled)return false;var p=s.pos();return Math.abs(p[0]-obH[0])<6&&Math.abs(p[2]-obH[2])<8;});
 if(now-this.overrunT>=1){this.overrunT=now;var Z=T.zombies.filter(function(z){return z.alive&&(z.state==='chase'||z.state==='attack');}),worst=0,near=0;
  var cen=[0,0,0];ctl.forEach(function(s){var p=s.pos();cen[0]+=p[0]/ctl.length;cen[1]+=p[1]/ctl.length;cen[2]+=p[2]/ctl.length;});
  ctl.forEach(function(s){var p=s.pos(),n=Z.filter(function(z){var q=z.pos();return Math.hypot(q[0]-p[0],q[2]-p[2])<7;}).length;if(n>worst)worst=n;});
  near=Z.filter(function(z){var q=z.pos();return Math.hypot(q[0]-cen[0],q[2]-cen[2])<10;}).length;
  var ob=this.objective(),inside=ctl.every(function(s){var p=s.pos();return Math.abs(p[0]-ob[0])<5&&Math.abs(p[2]-ob[2])<7;});
  var fbG=ctl.filter(function(s){return !(s.order&&s.order.type==='brain'&&self.brain&&self.brain.by==='player')&&!TacticalSquadOrders.held(s);});/* M5: a player's squad order is not overridden */
  if(fbG.length&&!this.follow&&(worst>=3||near>=6)&&!inside&&!held&&now-(this.lastFallbackT||-99)>20){this.fallBack(fbG,now,'overrun: '+Math.max(worst,near)+' zombies close');return;}}
 // ammo: the building is the squad's supply point (zombie waves outlast 180 rounds). Inside it, reserve refills 30 rounds/s;
 // a soldier with < 60 rounds left heads back in to resupply.
 if(!held&&now-(this.supplyT||0)>=1){this.supplyT=now;var ob2=this.objective(),inB=function(s){var p=s.pos();return Math.abs(p[0]-ob2[0])<5&&Math.abs(p[2]-ob2[2])<7;};
  frA.forEach(function(s){var A=s.arms;if(!A)return;if(inB(s)){if(A.reserve<A.def.reserve){A.reserve=Math.min(A.def.reserve,A.reserve+30);T.resupplies=(T.resupplies||0)+1;}return;}
   if(s.controlled||A.mag+A.reserve>=60||(s.order&&s.order.by==='resupply')||TacticalSquadOrders.held(s))return;var k=ctl.indexOf(s),slots=['room1','room2','overwatch1','overwatch2'],fb=[[9,0,3],[12,0,-3],[8,3.2,5.8],[12,3.2,5.8]],p=self.slot(slots[k%4],fb[k%4]);
   T.cover.release(s);s.inCover=false;s.hold=false;s.order={type:'move',dest:p,by:'resupply'};s.moveTo(p,'Low on ammo - resupplying in the building');});}
 if(!this.follow&&now-(this.cohesionT||0)>=2){this.cohesionT=now;TacticalCommon.squadGroups(T,'friendly').forEach(function(squad){var members=squad.filter(function(s){return ctl.indexOf(s)>=0;});if(!members.length)return;var c2=[0,0,0];members.forEach(function(s){var p=s.pos();c2[0]+=p[0]/members.length;c2[1]+=p[1]/members.length;c2[2]+=p[2]/members.length;});
  members.forEach(function(s){if(s.path.length||s.target||TacticalSquadOrders.held(s)||(s.order&&(s.order.type==='assault'||s.order.type==='hunt'||s.order.type==='brain')))return;var p=s.pos();if(Math.hypot(p[0]-c2[0],p[2]-c2[2])<=16)return;
   var sp=self.spots([s],c2).get(s);if(sp){s.order={type:'move',dest:sp,by:'cohesion'};s.moveTo(sp,'Regrouping with the squad');}});});}};
TacticalSquadOrders.prototype.fallBack=function(group,now,why){var T=TacticalCommon.ns(this.app),C=TacticalCommon,self=this;this.lastFallbackT=now;this.assault=null;this.hunt=null;
 var slots=['overwatch1','overwatch2','room1','room2'],fb=[[8,3.2,5.8],[12,3.2,5.8],[9,0,3],[12,0,-3]],used=[];
 group.forEach(function(s,i){var k=i%4,p=self.slot(slots[k],fb[k]);if(i>=4)p=[p[0]+0.9*(i-3),p[1],p[2]];T.cover.release(s);s.inCover=false;s.hold=false;s.order={type:'move',dest:p,by:'fallback'};s.moveTo(p,'Falling back into the building ('+why+')');});
 T.events.push({time:+now.toFixed(2),soldier:'-',decision:'Squad falls back: '+why});T.fallbacks=(T.fallbacks||0)+1;};

/* ================= Pass A: FPS follow. While the player controls a soldier, the other friendlies follow in a loose
   wedge (2.5-4 m spacing, behind/alongside, relative to the player's heading). When the player stops (>1 s) or the
   squad has contact, each follower takes the best nearby cover point (7 m radius around its slot, 8 nearest threats,
   no per-frame rays) or holds its slot; when the player moves on and is >7 m away they rejoin. Cleared on exit. */
TacticalSquadOrders.FOLLOW_SLOTS=[[-3,-3],[3,-3],[-3.5,-6.5],[3.5,-6.5],[0,-9],[-6.5,-3.5],[6.5,-3.5]];
TacticalSquadOrders.prototype.startFollow=function(leader){var T=TacticalCommon.ns(this.app),self=this,group=TacticalCommon.squadMembers(T,leader);if(this.follow)this.stopFollow();this.cancelAssault(group);
 if(this.hunt){this.hunt.members=this.hunt.members.filter(function(s){return group.indexOf(s)<0;});if(!this.hunt.members.length)this.hunt=null;}
 if(this.brain){this.brain.members=this.brain.members.filter(function(s){return group.indexOf(s)<0;});if(!this.brain.members.length)this.brain=null;}
 if(T.strategy&&T.strategy.plans)Object.keys(T.strategy.plans).forEach(function(k){var p=T.strategy.plans[k];if(!p)return;p.members=p.members.filter(function(s){return group.indexOf(s)<0;});p.queue=p.queue.filter(function(q){return group.indexOf(q.s)<0;});});
 this.follow={leader:leader,lastP:leader.pos(),lastMoveT:T.elapsed,tickT:-1,members:[]};
 group.filter(function(s){return s!==leader;}).forEach(function(s,k){T.cover.release(s);s.inCover=false;s.hold=false;s.stop();s.order={type:'follow',slot:k,phase:'follow',by:'fps',repT:-1};self.follow.members.push(s);});
 TacticalCommon.log(this.app,leader,'Squad following ('+this.follow.members.length+')');return this.follow.members.length;};
TacticalSquadOrders.prototype.stopFollow=function(){var T=TacticalCommon.ns(this.app);if(!this.follow)return;
 this.follow.members.forEach(function(s){s.speedMul=1;if(!s.alive||!s.order||s.order.type!=='follow')return;var keep=s.order.phase==='cover'&&s.inCover;if(!keep){s.stop();}s.order={type:'move',dest:keep&&s.goal?s.goal:s.pos(),by:'follow-end'};});this.follow=null;};
TacticalSquadOrders.prototype.followSlot=function(k,lp,yaw){var S=TacticalSquadOrders.FOLLOW_SLOTS,o=S[k%S.length],f=[-Math.sin(yaw),-Math.cos(yaw)],r=[-f[1],f[0]];
 return [lp[0]+r[0]*o[0]-f[0]*(-o[1]),lp[1],lp[2]+r[1]*o[0]-f[1]*(-o[1])];};
TacticalSquadOrders.prototype.followTick=function(now,frA){var T=TacticalCommon.ns(this.app),C=TacticalCommon,F=this.follow,L=F.leader,self=this;
 if(!L.alive||!L.controlled){this.stopFollow();return;}
 if(now-F.tickT<0.25)return;var dtT=now-F.tickT;F.tickT=now;var lp=L.pos(),mv=Math.hypot(lp[0]-F.lastP[0],lp[2]-F.lastP[2]);F.lastP=lp;if(mv/Math.max(dtT,0.05)>0.6)F.lastMoveT=now;
 var yaw=T.input&&T.input.fps?T.input.fps.yaw:L.lookYaw,stopped=now-F.lastMoveT>1.0;
 var contact=[L].concat(F.members).some(function(s){return s.memory&&s.memory.records.some(function(r){if(!r.visible||!r.entity.alive)return false;var q=r.entity.pos(),p=s.pos();return Math.hypot(q[0]-p[0],q[2]-p[2])<30;});});
 F.stopped=stopped;F.contact=contact;F.yaw=yaw;
 F.members=F.members.filter(function(s){return s.alive&&!s.disabled&&s.squadKey===L.squadKey;});
 F.members.forEach(function(s,k){var o=s.order;if(!o||o.type!=='follow'){if(o&&o.by==='resupply'&&s.path.length)return;s.order=o={type:'follow',slot:k,phase:'follow',by:'fps',repT:-1};}
  o.slot=k;var p=s.pos(),dl=Math.hypot(p[0]-lp[0],p[2]-lp[2]),slot=self.followSlot(k,lp,yaw);if(TacticalCommon.AI.on){var SO=TacticalSquadOrders.FOLLOW_SECTORS;s.sector={yaw:yaw+SO[k%SO.length],half:0.87,by:'follow'};}
  s.speedMul=o.phase==='follow'&&dl>6?1.6:1;/* run to catch up (3.2 -> 5.1 m/s) */
  if(o.phase==='follow'){
   if((stopped||contact)&&dl<9){var th=T.perception.threatsFor(s).map(function(q){return [Math.hypot(q[0]-p[0],q[2]-p[2]),q];}).sort(function(a,b){return a[0]-b[0];}).slice(0,8).map(function(x){return x[1];});
    var taken=F.members.filter(function(m){return m!==s&&m.order&&m.order.coverPos;}).map(function(m){return m.order.coverPos;});
    var best=T.cover.score(s,th,{radius:10,near:slot,distW:0.6}).find(function(c){return !c.claimed&&c.score>-60&&taken.every(function(q){return Math.hypot(q[0]-c.position[0],q[2]-c.position[2])>=1.5;})&&Math.hypot(c.position[0]-lp[0],c.position[2]-lp[2])>=1.5;});
    if(best&&s.moveTo(best.position,stopped?'Follow: player stopped - taking cover':'Follow: contact - taking cover')){T.cover.claim(s,best.position);s.chosenCover=best;o.phase='cover';o.coverPos=best.position;o.face=th.length?th[0]:null;return;}
    o.phase='hold';o.coverPos=null;}
   var q=T.navigation.nearest(slot,{x:2,y:3,z:2});if(!q)return;q=C.v3(q);
   if(now-o.repT>=0.5&&Math.hypot(q[0]-p[0],q[2]-p[2])>1.2&&(!s.goal||Math.hypot(s.goal[0]-q[0],s.goal[2]-q[2])>1.5)){o.repT=now;s.moveTo(q,'Following '+L.soldierName);}}
  else{// cover / hold
   if(!stopped&&!contact&&dl>7){T.cover.release(s);s.inCover=false;s.chosenCover=null;o.phase='follow';o.coverPos=null;o.repT=-1;C.log(self.app,s,'Rejoining '+L.soldierName);}
   else if(o.phase==='hold'&&!stopped&&dl>7){o.phase='follow';}}});};

/* ================= Pass B: watch sectors. Each friendly gets a sector {yaw, half} per squad order: front / left /
   right / rear relative to the order's facing (move: face or travel direction; cover: threat centroid; reset: the
   threat direction; FPS follow: left / right / rear / quarters relative to the player's heading, the player covers
   the front). tacticalSoldierDecision scans its sector when idle, prefers targets inside it and only turns to a
   known threat outside it when that threat is close. */
TacticalSquadOrders.SECTORS=[0,Math.PI/2,-Math.PI/2,Math.PI];
TacticalSquadOrders.FOLLOW_SECTORS=[Math.PI/2,-Math.PI/2,Math.PI,Math.PI*0.75,-Math.PI*0.75,Math.PI/4,-Math.PI/4];
TacticalSquadOrders.prototype.travelFace=function(group,point){var c=[0,0,0];group.forEach(function(s){var p=s.pos();c[0]+=p[0]/group.length;c[2]+=p[2]/group.length;});
 var dx=point[0]-c[0],dz=point[2]-c[2];if(Math.hypot(dx,dz)<1)return null;return [point[0]+dx,point[1],point[2]+dz];};
TacticalSquadOrders.prototype.assignSectors=function(group,face){if(!TacticalCommon.AI.on)return;group=group.filter(function(s){return s.alive&&!s.controlled;});if(!group.length)return;
 var c=[0,0,0];group.forEach(function(s){var p=s.pos();c[0]+=p[0]/group.length;c[2]+=p[2]/group.length;});
 var base=face?Math.atan2(-(face[0]-c[0]),-(face[2]-c[2])):group[0].lookYaw,S=TacticalSquadOrders.SECTORS;
 group.slice().sort(function(a,b){return a.uid-b.uid;}).forEach(function(s,k){s.sector={yaw:base+S[k%4],half:group.length<4&&k%4===0?1.1:0.87,by:'order'};});};
/* pass C: spacing. Idle friendlies (no path, not in cover, not controlled, not assaulting) closer than 1.6 m:
   the higher-uid one steps 1.6-2.4 m away along the separation line to a free navmesh point. 2 Hz, deterministic. */
TacticalSquadOrders.prototype.separate=function(now,frA){var T=TacticalCommon.ns(this.app);if(T.trainingMode)return;var idle=function(s){return !s.controlled&&!s.path.length&&!s.inCover&&!(s.order&&s.order.type==='assault')&&!(s.order&&s.order.angle&&s.order.dest&&Math.hypot(s.pos()[0]-s.order.dest[0],s.pos()[2]-s.order.dest[2])<0.8)&&!(s.order&&s.order.type==='brain'&&s.order.brain==='assault')&&now>(s.sepMoveT||-99);},self=this;/* M8: an assault squad keeps the brain's spots (no spacing steps into uncleared rooms) *//* M7: a soldier on his angle spot keeps it */
 for(var i=0;i<frA.length;i++){var a=frA[i];for(var j=0;j<frA.length;j++){var b=frA[j];if(a===b||b.uid<a.uid||!idle(b))continue;var pa=a.pos(),pb=b.pos(),dx=pb[0]-pa[0],dz=pb[2]-pa[2],d=Math.hypot(dx,dz);
  if(d>=1.6||Math.abs(pb[1]-pa[1])>1.5)continue;if(d<0.05){var ang=b.uid*2.399;dx=Math.sin(ang);dz=Math.cos(ang);d=1;}
  var ux=dx/d,uz=dz/d,cand=[];[0,1.05,-1.05,2.1,-2.1,3.14].forEach(function(a2){[2.0,2.6].forEach(function(o){cand.push([ux*Math.cos(a2)-uz*Math.sin(a2),ux*Math.sin(a2)+uz*Math.cos(a2),o]);});});
  var ok=cand.some(function(cd){var o=cd[2],q0=[pb[0]+cd[0]*o,pb[1],pb[2]+cd[1]*o],q=T.navigation.nearest(q0,{x:0.6,y:1,z:0.6});
   var ha=TacticalSquadOrders.held(b);if(q&&ha&&Math.hypot(q[0]-ha[0],q[2]-ha[2])>TacticalSquadOrders.HOLD_SLACK)return false;
   if(!q||Math.hypot(q[0]-q0[0],q[2]-q0[2])>0.5||frA.some(function(o2){var p2=o2.goal||o2.pos();return o2!==b&&Math.hypot(p2[0]-q[0],p2[2]-q[2])<1.4;}))return false;
   if(TacticalCommon.AI.on){var hide=self.knownEnemyPos(frA).filter(function(h){return Math.hypot(h[0]-q[0],h[2]-q[2])<45;});if(hide.some(function(h){return self.bLine(h,q);}))return false;}/* M8: never space out into a known enemy's sight line */
   if(!b.moveTo(q,'Spacing out from '+a.soldierName))return false;if(b.order)b.order.dest=q;b.sepMoveT=now+3;T.combat.counters.separations=(T.combat.counters.separations||0)+1;return true;});
  if(ok)break;}}};
/* pass D: focus fire. Every member gets the same focus target for 20 s (cleared when it dies); the target picker honours it. */
TacticalSquadOrders.prototype.focusFire=function(group,target,by){var T=TacticalCommon.ns(this.app),C=TacticalCommon;if(!target||!target.alive)return [];var commandTeam=this.localTeam||'friendly',until=T.elapsed+20,name=target.soldierName||((target.type||'')+' zombie');
 group=group.filter(function(s){return s&&s.alive&&!s.controlled&&s.team===commandTeam;});group.forEach(function(s){window.DreadingSpecialistAI?.orderRocket(s,[target.pos()[0],target.pos()[1]+1,target.pos()[2]],target);s.focus=target;s.focusUntil=until;s.focusT=T.elapsed;s.focusSeenT=-99;if(T.perception)T.perception.sense(s,target,T.elapsed,2);C.log(s.app,s,'Focus fire: '+name+' ('+by+')');});
 T.combat.counters.focusOrders=(T.combat.counters.focusOrders||0)+1;T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'focus fire on '+name+' x'+group.length+' ('+by+')'});return group;};

/* ================= M5: squad brain. One order (assault / defend / suppress / move) is broken into behaviour-tree
   steps: selector, memory sequence, condition and action nodes ticked at 4 Hz. No RNG, no per-frame rays (rays only
   when a step starts). The active path and its reason are kept on brain.trail / brain.why and every member's order
   for the inspector. Off with ?ai=0 (legacy assault). ================= */
TacticalSquadOrders.BRAIN={tick:0.25,bound:9,coverNear:3.5,coverGap:9,openGround:5,clearR:2.4,stepTimeout:30,withdrawLoss:2,withdrawHealth:0.4,zDanger:5,zDangerR:8,holdHandoff:15,suppress:10,defendArea:10};
TacticalSquadOrders.BT={seq:function(n,c){return {n:n,k:'seq',c:c};},sel:function(n,c){return {n:n,k:'sel',c:c};},act:function(n,f){return {n:n,k:'act',f:f};},cond:function(n,f){return {n:n,k:'cond',f:f};}};
TacticalSquadOrders.prototype.btRun=function(node,b,now,trail){var r,i,t2;
 if(node.k==='cond')return node.f.call(this,b,now)?'ok':'fail';
 if(node.k==='act'){if(b.cur!==node.n){b.cur=node.n;b.stepT=now;b.st={};b.why='';b.steps.push({t:+now.toFixed(2),step:node.n});}r=node.f.call(this,b,now,b.st);if(r==='run')b.trail=trail.concat(node.n);return r;}
 t2=trail.concat(node.n);
 if(node.k==='sel'){for(i=0;i<node.c.length;i++){r=this.btRun(node.c[i],b,now,t2);if(r!=='fail')return r;}return 'fail';}
 for(i=b.mem[node.n]||0;i<node.c.length;i++){r=this.btRun(node.c[i],b,now,t2);if(r==='run'){b.mem[node.n]=i;return 'run';}if(r==='fail'){b.mem[node.n]=0;return 'fail';}}
 b.mem[node.n]=0;return 'ok';};
/* ---- building description: stack points outside the door, entry inside, ground-floor points, stair top, windows ---- */
TacticalSquadOrders.prototype.buildingInfo=function(ref,from){var C=TacticalCommon,T=C.ns(this.app),nav=T.navigation,self=this;if((ref===undefined||ref===null||ref==='objective')&&T.town&&T.town.objectiveRef!=null)ref=T.town.objectiveRef;/* M10: the fixed map's objective building is a generated one */from=from||this.objective();
 var near=function(p,h){return nav.nearest(p,h||{x:1.2,y:1.5,z:1.2});},hd=function(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2]);};
 var sample=function(rect,y,tol,step){var out=[];for(var x=rect[0]+step/2;x<=rect[2];x+=step)for(var z=rect[1]+step/2;z<=rect[3];z+=step){var q=nav.nearest([x,y,z],{x:step*0.45,y:tol,z:step*0.45});if(!q||Math.abs(q[1]-y)>tol||q[0]<rect[0]||q[0]>rect[2]||q[2]<rect[1]||q[2]>rect[3])continue;if(out.some(function(o){return hd(o,q)<1.4&&Math.abs(o[1]-q[1])<1;}))continue;out.push(q);}return out;};
 var B={ref:ref,ok:false};
 if(ref===undefined||ref===null||ref==='objective'){
  var r1=this.slot('room1',[9,0,3]),r2=this.slot('room2',[12,0,-3]),o1=this.slot('overwatch1',[8,3.2,5.8]),o2=this.slot('overwatch2',[12,3.2,5.8]),s1=this.slot('stairApproach1',[3.5,0,-9]),s2=this.slot('stairApproach2',[3.5,0,-10.5]);
  var landT=C.collect(this.app).find(function(t){return t.name==='Stair landing';}),land=landT?C.v3(landT.entity.getPosition()):[3.5,3.05,2];
  var pts=[r1,r2,o1,o2,land],rect=[1e9,1e9,-1e9,-1e9];pts.forEach(function(p){rect[0]=Math.min(rect[0],p[0]);rect[1]=Math.min(rect[1],p[2]);rect[2]=Math.max(rect[2],p[0]);rect[3]=Math.max(rect[3],p[2]);});
  rect=[rect[0]-1.5,rect[1]-2.5,rect[2]+3.5,rect[3]+1.5];
  B.name='objective building';B.rect=rect;B.center=this.objective();B.floorY=0;B.upperY=o1[1];B.stack=[near(s1)||s1,near(s2)||s2];B.door=B.stack[0];
  var path=null;try{path=nav.path(B.stack[0],r2);}catch(e){path=null;}
  B.entry=null;if(path){for(var i=1;i<path.length;i++){var p=path[i];if(p[0]>rect[0]+0.8&&p[0]<rect[2]-0.8&&p[2]>rect[1]+0.8&&p[2]<rect[3]-0.8){B.entry=p.slice();break;}}}
  if(!B.entry)B.entry=near([B.stack[0][0],0,B.stack[0][2]+2.5])||B.stack[0];
  (function(){var e=B.entry,k=B.stack[0],dx=k[0]-e[0],dz=k[2]-e[2],L=Math.hypot(dx,dz)||1,c=[e[0]+dx/L*Math.min(1.8,L*0.5),0,e[2]+dz/L*Math.min(1.8,L*0.5)];B.doors=[{c:c,n:[dx/L,0,dz/L]}];/* the objective rect is padded: the door sits ~1.8 m out from the entry point, like the town buildings */})();/* M7: door point + outward normal */
  B.ground=[r2,r1].map(function(p){return near(p)||p;});
  B.stairTop=near(land,{x:1,y:0.6,z:1})||land;
  var up=sample([rect[0]-1,rect[1]-1,rect[2]+1,rect[3]+1],B.upperY,0.8,2);
  B.upper=up;B.windows=[o1,o2].map(function(p){return near(p,{x:0.8,y:0.8,z:0.8})||p;});}
 else{var tw=T.town,b=tw&&tw.buildings&&tw.buildings[ref];if(!b){B.why='no building '+ref;return B;}
  var m=b.entity&&b.entity.getWorldTransform(),W=function(x,y,z){var v=new pc.Vec3();m.transformPoint(new pc.Vec3(x,y,z),v);return [v.x,v.y,v.z];};
  var sh=(b.shells||[]).slice().sort(function(a,c){return c.w*c.d*(c.storeys||1)-a.w*a.d*(a.storeys||1);})[0],rect2,doors=[];
  if(sh&&m){var cs=[[sh.min[0],sh.min[1]],[sh.max[0],sh.min[1]],[sh.min[0],sh.max[1]],[sh.max[0],sh.max[1]]].map(function(c){return W(c[0],0,c[1]);});
   rect2=[Math.min.apply(null,cs.map(function(c){return c[0];})),Math.min.apply(null,cs.map(function(c){return c[2];})),Math.max.apply(null,cs.map(function(c){return c[0];})),Math.max.apply(null,cs.map(function(c){return c[2];}))];
   sh.doors.forEach(function(d){if(d.h!==undefined&&d.h<1.9)return;var c=W(d.center[0],0,d.center[1]),n2=W(d.center[0]+d.normal[0],0,d.center[1]+d.normal[1]);doors.push({c:c,n:[n2[0]-c[0],0,n2[2]-c[2]]});});
   B.upperY=sh.upperY!=null?b.padY+sh.upperY:(sh.storeys||1)>=2?b.padY+sh.H:null;}
  else if(b.kit&&m&&TacticalTown.KIT&&(TacticalTown.KIT[b.type+'/'+b.state]||TacticalTown.KIT[b.type+'/intact'])){/* M5b: kit model - footprint and doors from the kit data */
   var K=TacticalTown.KIT[b.type+'/'+b.state]||TacticalTown.KIT[b.type+'/intact'];if(!K.enterable){B.why=b.type+' (kit model) has no enterable floor';return B;}
   var kc=[[K.bbox[0],K.bbox[2]],[K.bbox[3],K.bbox[2]],[K.bbox[0],K.bbox[5]],[K.bbox[3],K.bbox[5]]].map(function(c){return W(c[0],0,c[1]);});
   rect2=[Math.min.apply(null,kc.map(function(c){return c[0];})),Math.min.apply(null,kc.map(function(c){return c[2];})),Math.max.apply(null,kc.map(function(c){return c[0];})),Math.max.apply(null,kc.map(function(c){return c[2];}))];
   (K.doors||[]).forEach(function(d){var c=W(d[0],0,d[1]),n2=W(d[0]+d[2],0,d[1]+d[3]);doors.push({c:[c[0],0,c[2]],n:[n2[0]-c[0],0,n2[2]-c[2]]});});
   B.upperY=null;var bestN=2;if((K.floors||1)>=2)[3.0,3.3,3.6,4.0,4.2].forEach(function(y){var u=sample(rect2,(b.padY||0)+y,0.35,2);if(u.length>bestN){bestN=u.length;B.upperY=(b.padY||0)+y;}});}
  else{rect2=b.rect.slice();C.collect(this.app).filter(function(t){return t.kind==='door';}).forEach(function(t){var c=C.v3(t.entity.getPosition());if(c[1]>2||c[0]<rect2[0]-1.5||c[0]>rect2[2]+1.5||c[2]<rect2[1]-1.5||c[2]>rect2[3]+1.5)return;
    var cx=(rect2[0]+rect2[2])/2,cz=(rect2[1]+rect2[3])/2,dx=c[0]-cx,dz=c[2]-cz,n2=Math.abs(dx)/(rect2[2]-rect2[0])>Math.abs(dz)/(rect2[3]-rect2[1])?[Math.sign(dx),0,0]:[0,0,Math.sign(dz)];doors.push({c:[c[0],0,c[2]],n:n2});});
   B.upperY=null;[3.0,3.6,4.0].forEach(function(y){var u=sample(rect2,y,0.5,2);if(u.length>=3&&B.upperY===null)B.upperY=y;});}
  if(!doors.length){/* M5b: no door data (kit model) - find the way in from the navmesh: path from outside to an interior point */
   var inn=[rect2[0]+0.8,rect2[1]+0.8,rect2[2]-0.8,rect2[3]-0.8],gi=sample(inn,b.padY||0,0.6,2.5).sort(function(a,c){return hd(a,from)-hd(c,from);}),cx=(rect2[0]+rect2[2])/2,cz=(rect2[1]+rect2[3])/2;
   var inside=function(q){return q[0]>rect2[0]+0.3&&q[0]<rect2[2]-0.3&&q[2]>rect2[1]+0.3&&q[2]<rect2[3]-0.3;};
   for(var gk=0;gk<Math.min(4,gi.length)&&!doors.length;gk++){var pth=null;try{pth=nav.path(from,gi[gk]);}catch(e){pth=null;}if(!pth)continue;
    for(var pk=1;pk<pth.length;pk++){if(inside(pth[pk])&&!inside(pth[pk-1])){var a0=pth[pk-1],a1=pth[pk],t0=0;for(var st2=0;st2<=20;st2++){var tt=st2/20,qq=[a0[0]+(a1[0]-a0[0])*tt,0,a0[2]+(a1[2]-a0[2])*tt];if(inside(qq)){t0=tt;break;}}
     var dc=[a0[0]+(a1[0]-a0[0])*t0,0,a0[2]+(a1[2]-a0[2])*t0],ex=[dc[0]-rect2[0],rect2[2]-dc[0],dc[2]-rect2[1],rect2[3]-dc[2]],kk=ex.indexOf(Math.min.apply(null,ex)),nn=[[-1,0,0],[1,0,0],[0,0,-1],[0,0,1]][kk];doors.push({c:dc,n:nn});break;}}}
   if(!doors.length){B.why=gi.length?'no way in found from the navmesh':'no walkable floor inside';return B;}}
  doors.sort(function(a,c){return hd(a.c,from)-hd(c.c,from);});B.doors=doors.map(function(d){var l=Math.hypot(d.n[0],d.n[2])||1;return {c:[d.c[0],b.padY||0,d.c[2]],n:[d.n[0]/l,0,d.n[2]/l]};});var d0=doors[0],nl=Math.hypot(d0.n[0],d0.n[2])||1,nx=d0.n[0]/nl,nz=d0.n[2]/nl;
  B.name=b.type+' #'+b.id;B.rect=rect2;B.center=[(rect2[0]+rect2[2])/2,0,(rect2[1]+rect2[3])/2];B.floorY=b.padY||0;B.door=d0.c;
  B.stack=[near([d0.c[0]+nx*2.6,B.floorY,d0.c[2]+nz*2.6]),near([d0.c[0]+nx*2.6-nz*1.3,B.floorY,d0.c[2]+nz*2.6+nx*1.3])].filter(Boolean);
  B.entry=near([d0.c[0]-nx*1.8,B.floorY,d0.c[2]-nz*1.8],{x:0.8,y:1,z:0.8});
  var inner=[rect2[0]+0.8,rect2[1]+0.8,rect2[2]-0.8,rect2[3]-0.8],gr=sample(inner,B.floorY,0.6,3);
  B.ground=[];var last=B.entry||B.door;while(B.ground.length<3&&gr.length){var bi=-1,bd=-1;gr.forEach(function(g,k){var dmin=Math.min.apply(null,[last].concat(B.ground).map(function(q){return hd(q,g);}));if(dmin>bd){bd=dmin;bi=k;}});if(bd<3)break;B.ground.push(gr[bi]);gr.splice(bi,1);}
  B.upper=B.upperY!==null?sample([rect2[0]-0.5,rect2[1]-0.5,rect2[2]+0.5,rect2[3]+0.5],B.upperY,0.8,2):[];
  B.windows=[];B.stairTop=null;
  if(B.upper.length&&B.entry){var cand=B.upper.filter(function(p){return Math.abs(p[1]-B.upperY)<0.2;}).sort(function(a,c){return hd(a,B.entry)-hd(c,B.entry);}),bestL=1e9;
   cand.forEach(function(u){var pp=null;try{pp=nav.path(B.entry,u);}catch(e){pp=null;}if(!pp||pp.length<2)return;var L=0;for(var i=1;i<pp.length;i++)L+=Math.hypot(pp[i][0]-pp[i-1][0],pp[i][1]-pp[i-1][1],pp[i][2]-pp[i-1][2]);if(L<bestL){bestL=L;B.stairTop=u;}});}}
 if(!B.entry){B.why='no entry point inside the door';return B;}
 /* windows: upper-floor points next to the outer wall (closest to the edge first); with no upper floor, ground points */
 var R=B.rect,edge=function(p){return Math.min(p[0]-R[0],R[2]-p[0],p[2]-R[1],R[3]-p[2]);},src=B.upper&&B.upper.length?B.upper:[];
 src.filter(function(p){return edge(p)<2.2&&!(B.stairTop&&hd(p,B.stairTop)<1.5);}).sort(function(a,c){return edge(a)-edge(c);}).forEach(function(p){if(B.windows.length<8&&!B.windows.some(function(w){return hd(w,p)<2.2;}))B.windows.push(p);});
 if(!B.windows.length&&!B.stairTop){/* M7: single storey - window candidates are floor points next to the outer wall (ray-checked below), not the room centres */
  sample([R[0]+0.3,R[1]+0.3,R[2]-0.3,R[3]-0.3],B.floorY||0,0.6,1.5).filter(function(p){return edge(p)<1.6&&!(B.doors||[]).some(function(dd){return hd(p,dd.c)<2.2;});}).sort(function(a,c){return edge(a)-edge(c);}).forEach(function(p){if(B.windows.length<8&&!B.windows.some(function(w){return hd(w,p)<2.2;}))B.windows.push(p);});
  if(!B.windows.length)B.windows=B.ground.slice();}
 var P=T.perception;B.windows=B.windows.map(function(p){var e0=[p[0]-R[0],R[2]-p[0],p[2]-R[1],R[3]-p[2]],k=e0.indexOf(Math.min.apply(null,e0)),n=[[-1,0],[1,0],[0,-1],[0,1]][k];
  /* a real window: a chest-high ray straight out is not blocked by the wall (one ray per candidate, once per order) */
  var tg=[-n[1],n[0]],open=false,q=p;[0,0.7,-0.7,1.4,-1.4].some(function(o){var pp=o?nav.nearest([p[0]+tg[0]*o,p[1],p[2]+tg[1]*o],{x:0.4,y:0.6,z:0.4}):p;if(!pp)return false;
   var e1=[pp[0]-R[0],R[2]-pp[0],pp[2]-R[1],R[3]-pp[2]][k];return [1.35,1.6].some(function(hh){var h=C.rayWorld([pp[0],pp[1]+hh,pp[2]],[n[0],0,n[1]],e1+2.5,P.blockers);if(!h||h.t>e1+1.2){open=true;q=pp;return true;}return false;});});p=q;
  return {p:p,out:[p[0]+n[0]*12,p[1]+0.4,p[2]+n[1]*12],side:['west','east','south','north'][k],open:open};});
 B.windows=B.windows.filter(function(w,i,a){return !a.slice(0,i).some(function(v){return hd(v.p,w.p)<1.6&&Math.abs(v.p[1]-w.p[1])<1;});});
 B.windows.sort(function(a,c){return (c.open?1:0)-(a.open?1:0);});
 if(B.stairTop&&B.entry){var sp0=null;try{sp0=nav.path(B.entry,B.stairTop);}catch(e){sp0=null;}var fy0=B.floorY||0;/* M8: stair base = last floor-level path point before the climb */
  if(sp0&&sp0.length>1){for(var si=1;si<sp0.length;si++){if(sp0[si][1]>fy0+0.4){var pb=sp0[si-1],pn=sp0[si],dl=Math.hypot(pn[0]-pb[0],pn[2]-pb[2])||1;B.stairBase=pb.slice();B.stairDir=[(pn[0]-pb[0])/dl,0,(pn[2]-pb[2])/dl];break;}}}}
 B.ok=true;return B;};
/* ---- brain bookkeeping ---- */
TacticalSquadOrders.prototype.brainMembers=function(b){return b.members.filter(function(s){return s.alive&&!s.controlled&&s.order&&s.order.bid===b.id;});};
TacticalSquadOrders.prototype.bMove=function(b,s,p,face,text,extra){var T=TacticalCommon.ns(this.app);T.cover.release(s);s.inCover=false;s.hold=false;
 var o={type:'brain',brain:b.kind,bid:b.id,dest:p,face:face||null,arrived:false,by:'brain',step:b.cur};if(extra)for(var k in extra)o[k]=extra[k];s.order=o;
 var me=s.pos();if(Math.hypot(me[0]-p[0],me[2]-p[2])<0.5&&Math.abs(me[1]-p[1])<1){s.stop();o.arrived=true;TacticalCommon.log(s.app,s,text);return true;}
 if(!s.moveTo(p,text)){b.navFail++;b.navLog.push({t:+T.elapsed.toFixed(2),soldier:s.soldierName,step:b.cur,dest:p});o.failed=true;o.arrived=false;return false;}return true;};
TacticalSquadOrders.prototype.bGroup=function(b,group,point,face,text,extra){var self=this,map=this.spots(group,point),B=b.building,used=[];
 group.forEach(function(s){var p=map.get(s)||point,q=B&&B.ok?self.notDoorway(B,p,used):p;var nav=TacticalCommon.ns(self.app).navigation,me=s.pos(),reachable=function(v){try{return !!nav.path(me,v);}catch(e){return false;}};if(!reachable(q)){var found=null;for(var r=1;r<=4&&!found;r++)for(var k=0;k<12&&!found;k++){var a=k*Math.PI/6,v=nav.nearest([q[0]+Math.cos(a)*r,q[1],q[2]+Math.sin(a)*r],{x:.4,y:.5,z:.4});if(v&&!used.some(function(u){return Math.hypot(v[0]-u[0],v[2]-u[2])<1;})&&reachable(v))found=v;}if(!found){s.stop();s.order={type:'brain',brain:b.kind,bid:b.id,by:'brain',arrived:false,failed:true};b.navFail++;return;}q=found;}used.push(q);self.bMove(b,s,q,face,text,extra);});};
/* M7: a brain spot that lands in a doorway (within 1.3 m of a door point) is moved to a side angle on that door from inside */
TacticalSquadOrders.prototype.notDoorway=function(B,p,used){var dr=(B.doors||[]).find(function(d){return Math.hypot(d.c[0]-p[0],d.c[2]-p[2])<1.3&&Math.abs((d.c[1]||0)-p[1])<1.5;});if(!dr)return p;
 var sp=this.angleSpot(B,{o:[dr.c[0],B.floorY||0,dr.c[2]],nIn:[-dr.n[0],0,-dr.n[2]]},used||[],B.floorY||0);TacticalCommon.ns(this.app).doorSpotFix=(TacticalCommon.ns(this.app).doorSpotFix||0)+1;return sp?sp.p:p;};
TacticalSquadOrders.prototype.bArrived=function(group){return group.every(function(s){return s.order&&s.order.arrived;});};
TacticalSquadOrders.prototype.bPairs=function(b){var m=this.brainMembers(b),A=m.filter(function(s){return b.members.indexOf(s)%2===0;}),Bp=m.filter(function(s){return b.members.indexOf(s)%2===1;});if(!A.length||!Bp.length)return [m];return [A,Bp];};
TacticalSquadOrders.prototype.bHolders=function(b,group,face,text){group.forEach(function(s){if(s.order&&s.order.bid===b.id){s.order.face=face;if(s.order.arrived&&s.decision.indexOf(text)<0)TacticalCommon.log(s.app,s,text);}});};
TacticalSquadOrders.prototype.bInside=function(b,p,upper){var R=b.building.rect;if(p[0]<R[0]||p[0]>R[2]||p[2]<R[1]||p[2]>R[3])return false;return upper===undefined?true:upper?p[1]>b.building.upperY-1:p[1]<(b.building.floorY||0)+1.5;};
TacticalSquadOrders.prototype.bThreatIn=function(b,m,upper){var T=TacticalCommon.ns(this.app),self=this,now=T.elapsed;if(!m.length)return null;
 var k=[];m.forEach(function(s){T.perception.known(s,true).forEach(function(r){if(r.entity.alive&&now-r.timeLastSensed<4&&self.bInside(b,r.lastSensedPosition,upper)&&k.indexOf(r.entity)<0)k.push(r.entity);});});
 k.sort(function(a,c){return (a.isZombie?1:0)-(c.isZombie?1:0);});return k.length?k[0]:null;};/* M8: any member's knowledge, armed enemies before zombies */
TacticalSquadOrders.prototype.bName=function(e){return e?(e.soldierName||((e.type||'')+' zombie')):'';};
/* route: nav path to the stack point, cover candidates near it ordered by distance along the path */
TacticalSquadOrders.prototype.bRoute=function(b,from,to){var T=TacticalCommon.ns(this.app),K=TacticalSquadOrders.BRAIN,path=null;try{path=T.navigation.path(from,to);}catch(e){path=null;}
 if(!path||path.length<2)return null;var cum=[0];for(var i=1;i<path.length;i++)cum.push(cum[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][2]-path[i-1][2]));var total=cum[cum.length-1];
 var along=function(p){var best=1e9,at=0;for(var i=1;i<path.length;i++){var a=path[i-1],c=path[i],dx=c[0]-a[0],dz=c[2]-a[2],L2=dx*dx+dz*dz,t=L2>0?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/L2)):0,d=Math.hypot(a[0]+dx*t-p[0],a[2]+dz*t-p[2]);if(d<best){best=d;at=cum[i-1]+Math.sqrt(L2)*t;}}return [best,at];};
 var cov=[];T.cover.usable().forEach(function(c){var p=c.position;if(Math.abs(p[1]-from[1])>1.2&&Math.abs(p[1]-to[1])>1.2)return;if(b.building&&self_inside(p))return;var r=along(p);if(r[0]<K.coverNear&&r[1]>4)cov.push({c:c,at:r[1],off:r[0]});});
 function self_inside(p){var R=b.building.rect;return p[0]>R[0]-0.3&&p[0]<R[2]+0.3&&p[2]>R[1]-0.3&&p[2]<R[3]+0.3;}
 cov.sort(function(a,c){return a.at-c.at;});
 var pointAt=function(d){d=Math.max(0,Math.min(total,d));for(var i=1;i<path.length;i++){if(cum[i]>=d){var t=(d-cum[i-1])/((cum[i]-cum[i-1])||1),a=path[i-1],c=path[i];return [a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,a[2]+(c[2]-a[2])*t];}}return path[path.length-1].slice();};
 return {path:path,total:total,cover:cov,pointAt:pointAt,along:along};};
TacticalSquadOrders.prototype.bCentroid=function(m){var c=[0,0,0];m.forEach(function(s){var p=s.pos();c[0]+=p[0]/m.length;c[1]+=p[1]/m.length;c[2]+=p[2]/m.length;});return c;};
/* Explicit floor selections are destinations, not autonomous building assaults. */
TacticalSquadOrders.prototype.moveToFloor=function(members,ref,index){var T=TacticalCommon.ns(this.app),self=this,F=this.buildingFloors(ref),floor=F.floors&&F.floors[index],R=F.rect,result={kind:'floor',members:members,status:'fail',why:'Selected floor is unavailable',building:{rect:R,floorY:floor&&floor.y},warning:''};if(!F.ok||!floor||!R)return result;
 var inside=function(p){return p&&p.every(Number.isFinite)&&p[0]>=R[0]+.05&&p[0]<=R[2]-.05&&p[2]>=R[1]+.05&&p[2]<=R[3]-.05&&Math.abs(p[1]-floor.y)<.55;},pts=[],used=this.reserved(members),plans=[];
 function add(raw){var p=T.navigation.nearest(raw,{x:.35,y:.45,z:.35});if(inside(p)&&!pts.some(function(q){return Math.hypot(q[0]-p[0],q[2]-p[2])<.7;}))pts.push(p);}
 (floor.pts||[]).forEach(add);for(var x=R[0]+.7;x<R[2]-.5;x+=1.4)for(var z=R[1]+.7;z<R[3]-.5;z+=1.4)add([x,floor.y,z]);
 members.forEach(function(s){var me=s.pos(),chosen=null;pts.slice().sort(function(a,b){return Math.hypot(a[0]-me[0],a[2]-me[2])-Math.hypot(b[0]-me[0],b[2]-me[2]);}).some(function(p){if(used.some(function(q){return Math.abs(q[1]-p[1])<1&&Math.hypot(q[0]-p[0],q[2]-p[2])<1;}))return false;try{var path=T.navigation.path(me,p),end=path&&path[path.length-1];if(!inside(end)||Math.hypot(end[0]-p[0],end[2]-p[2])>.65)return false;chosen={s:s,p:p.slice(),path:path};used.push(p);return true;}catch(e){return false;}});plans.push(chosen||{s:s});});
 this.cancelAssault(members);if(this.follow&&members.some(function(s){return self.follow.members.indexOf(s)>=0;}))this.stopFollow();if(this.hunt)this.hunt.members=this.hunt.members.filter(function(s){return members.indexOf(s)<0;});
 var count=0;plans.forEach(function(a){var s=a.s;T.cover.release(s);s.stop();s.inCover=false;s.suppress=null;s.hold=false;var p=a.p||s.pos();s.order={type:'move',by:'player',dest:p.slice(),anchor:p.slice(),floorTarget:a.p?{building:ref,index:index,y:floor.y,rect:R.slice()}:null,arrived:!a.p};if(a.p){s.goal=p.slice();s.goalText='Move and hold '+floor.label+' in '+F.name;s.path=a.path;s.index=a.path.length>1?1:0;s.routeError=null;count++;}TacticalCommon.log(s.app,s,a.p?s.goalText:'Cannot reach selected floor; holding position');});
 result.status=count?'run':'fail';result.why=count?'Moving directly to '+floor.label:'No reachable positions on the selected floor';if(count<members.length)result.warning=(members.length-count)+' soldier(s) cannot reach a free position on this floor and are holding.';T.lastOrderT=T.elapsed;return result;};
/* ---- start an order ---- */
TacticalSquadOrders.prototype.startBrain=function(kind,members,opt){var C=TacticalCommon,T=C.ns(this.app),self=this,K=TacticalSquadOrders.BRAIN;opt=opt||{};
 var commandTeam=this.localTeam||'friendly';members=members.filter(function(s){return s&&s.alive&&!s.controlled&&s.team===commandTeam;});if(!members.length)return null;
 if(kind==='assault'&&opt.floor&&Number.isInteger(opt.floor.i))return this.moveToFloor(members,opt.building,opt.floor.i);
 if(opt.by&&opt.by!=='player'&&opt.by!=='order'&&C.squadMembers){var unit=C.squadMembers(T,members[0]);members=members.filter(function(s){return unit.indexOf(s)>=0;});}
 this.cancelAssault(members);if(this.hunt){var hm=this.hunt.members;members.forEach(function(s){var i=hm.indexOf(s);if(i>=0)hm.splice(i,1);});}if(this.follow&&members.some(function(s){return self.follow.members.indexOf(s)>=0;}))this.stopFollow();
 this.brainSeq=(this.brainSeq||0)+1;
 var b={id:this.brainSeq,kind:kind,members:members.slice(),startN:members.length,t0:T.elapsed,nextT:0,mem:{},st:{},cur:'',why:'',trail:[],steps:[],status:'run',navFail:0,navLog:[],by:opt.by||'player',reason:opt.reason||'order',
  start:this.bCentroid(members),point:opt.point||null,target:opt.target||null,area:opt.area||K.defendArea,hp0:members.reduce(function(a,s){return a+s.health;},0),log:[]};
 if(kind==='assault'){
  b.building=this.buildingInfo(opt.building,b.start);
  if(!b.building.ok){b.status='fail';b.why='cannot assault: '+b.building.why;this.lastBrain=b;return b;}
  b.shelterOnly=!!opt.shelterOnly;
  b.clearKey=String(opt.building===undefined?'objective':opt.building);
  if(!this.clearMemory)this.clearMemory=new Map();
  if(!this.clearMemory.has(b.clearKey))this.clearMemory.set(b.clearKey,{ground:new Set(),upper:new Set(),groundDone:false,upperDone:false,verifiedAt:-99});
  b.clearRecord=this.clearMemory.get(b.clearKey);
  if(b.by==='initiative'){if(!this.autonomousAssaults)this.autonomousAssaults=new Set();this.autonomousAssaults.add(b.clearKey);}
 }
 members.forEach(function(s){T.cover.release(s);s.suppress=null;s.order={type:'brain',brain:kind,bid:b.id,dest:s.pos(),arrived:true,by:'brain',step:'start'};C.log(s.app,s,'Squad order: '+kind+(b.building?' '+b.building.name:'')+' ('+b.reason+')');});
 b.floor=kind==='assault'&&opt.floor&&typeof opt.floor==='object'?opt.floor:null;/* Task 8: floor picker - {i,label,y,pts,roof} from buildingFloors() */
 b.tree=b.shelterOnly?this.shelterTree():this.brainTree(kind,b.floor);this.brain=b;this.lastBrain=b;T.lastOrderT=T.elapsed;T.running=true;
 T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'squad order '+kind+' x'+members.length+' ('+b.reason+')'});this.brainTick(T.elapsed,true);if(kind==='suppress')members.forEach(function(s){window.DreadingSpecialistAI?.orderRocket(s,opt.point||opt.target?.pos(),opt.target);});return b;};
/* M9: buddy cohesion: a clearing team may be spread across two covering pairs, but nobody advances
   when a live squadmate is isolated. If an isolated soldier is stuck, his nearest buddy moves to help.
   Do not run this as a per-frame distance-only formation controller. */
TacticalSquadOrders.prototype.buddyReady=function(b,now,range){
 var T=TacticalCommon.ns(this.app),m=this.brainMembers(b),self=this;
 if(m.length<2)return true;
 var lonely=null,buddy=null,dmax=range||11;
 m.forEach(function(s){if(lonely)return;var p=s.pos(),closest=null,best=1e9;
  m.forEach(function(o){if(o===s)return;var q=o.pos(),d=Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);if(d<best){best=d;closest=o;}});
  if(best>dmax){lonely=s;buddy=closest;}});
 if(!lonely)return true;
 b.why='Waiting for '+lonely.soldierName+' to rejoin the squad';
 if(buddy&&now-(b.buddyHelpT||-99)>6&&(!buddy.path||!buddy.path.length)&&!(buddy.target&&now-buddy.lastSeenT<2)){
  var p0=lonely.pos(),p1=buddy.pos(),dx=p1[0]-p0[0],dz=p1[2]-p0[2],L=Math.hypot(dx,dz)||1;
  var q=T.navigation.nearest([p0[0]+dx/L*2.3,p0[1],p0[2]+dz/L*2.3],{x:0.6,y:0.8,z:0.6});
  if(q&&Math.hypot(q[0]-p0[0],q[2]-p0[2])<3.5){b.buddyHelpT=now;self.bMove(b,buddy,q,p0,'Regrouping to protect '+lonely.soldierName);}
 }
 return false;
};
/* Automatic zombie shelter is NOT a building clearance order. Enter together and defend the nearest
   reachable entrance; only an explicit assault uses the floor-sweeping behaviour tree. */
TacticalSquadOrders.prototype.shelterTree=function(){var BT=TacticalSquadOrders.BT,P=TacticalSquadOrders.prototype;
 return BT.seq('Shelter (no automatic clearing)',[BT.act('Enter shelter together',P.btShelterEntry),BT.act('Hold shelter entrance',P.btShelterHold)]);};
TacticalSquadOrders.prototype.btShelterEntry=function(b,now,st){var m=this.brainMembers(b),B=b.building;
 if(!st.sent){st.sent=true;st.t=now;this.bGroup(b,m,B.entry,B.door,'Shelter: enter together (no sweep)');}
 if(this.bArrived(m)&&this.buddyReady(b,now,9))return 'ok';
 if(now-st.t>18){if((st.retries||0)>=1){b.why='Shelter inaccessible: squad cannot reach entry';return 'fail';}
  st.retries=(st.retries||0)+1;st.t=now;this.bGroup(b,m,B.entry,B.door,'Shelter: regroup at entrance');}
 b.why='Entering shelter together; not clearing this building';return 'run';};
TacticalSquadOrders.prototype.btShelterHold=function(b,now,st){var m=this.brainMembers(b),B=b.building,self=this;
 if(!st.sent){st.sent=true;var used=[],face=B.door||B.center,asg=this.holdAngles(B,m,false,face);
  asg.forEach(function(a){if(a.spot.los){used.push(a.s);self.bMove(b,a.s,a.spot.p,a.spot.face,'Shelter: watch '+a.op.kind,{window:a.op.kind,angle:a.op.id});}});
  m.filter(function(s){return used.indexOf(s)<0;}).forEach(function(s){s.stop();if(s.order)s.order.face=face;});}
 b.why='Sheltering and covering the entrance; no automatic room sweep';return 'run';};
TacticalSquadOrders.prototype.brainTree=function(kind,floor){var BT=TacticalSquadOrders.BT,P=TacticalSquadOrders.prototype;
 if(kind==='assault'&&floor&&floor.i===0)return BT.sel('Assault building - ground floor',[BT.seq('Withdraw',[BT.cond('Too dangerous?',P.btDanger),BT.act('Withdraw to rally',P.btWithdraw)]),
  BT.seq('Assault steps',[BT.act('Column via cover',P.btColumn),BT.act('Last cover',P.btLastCover),BT.act('Bounding overwatch',P.btBound),BT.act('Breach',P.btBreach),BT.act('Clear ground floor',P.btClear),BT.act('Hold ground floor',P.btWindows),BT.act('Hold windows',P.btHold)])]);
 if(kind==='assault'&&floor&&floor.i>=2)return BT.sel('Assault building - '+floor.label,[BT.seq('Withdraw',[BT.cond('Too dangerous?',P.btDanger),BT.act('Withdraw to rally',P.btWithdraw)]),
  BT.seq('Assault steps',[BT.act('Column via cover',P.btColumn),BT.act('Last cover',P.btLastCover),BT.act('Bounding overwatch',P.btBound),BT.act('Breach',P.btBreach),BT.act('Clear ground floor',P.btClear),BT.act('Stairs',P.btStairs),BT.act('Clear upper floor',P.btClearUpper),BT.act('Climb to '+floor.label,P.btFloorClimb),BT.act('Hold '+floor.label,P.btFloorHold)])]);
 if(kind==='assault')return BT.sel('Assault building',[BT.seq('Withdraw',[BT.cond('Too dangerous?',P.btDanger),BT.act('Withdraw to rally',P.btWithdraw)]),
  BT.seq('Assault steps',[BT.act('Column via cover',P.btColumn),BT.act('Last cover',P.btLastCover),BT.act('Bounding overwatch',P.btBound),BT.act('Breach',P.btBreach),BT.act('Clear ground floor',P.btClear),BT.act('Stairs',P.btStairs),BT.act('Clear upper floor',P.btClearUpper),BT.act('Windows',P.btWindows),BT.act('Hold windows',P.btHold)])]);
 if(kind==='defend')return BT.seq('Defend area',[BT.act('Move to area',P.btDefMove),BT.act('Hold area (auto cover)',P.btDefHold)]);
 if(kind==='suppress')return BT.seq('Suppress',[BT.act('Find firing line',P.btSupLine),BT.act('Suppressive fire',P.btSupFire)]);
 return BT.seq('Move',[BT.act('Column via cover',P.btColumn),BT.act('Move to area',P.btDefMove),BT.act('Defend on arrival',P.btDefHold)]);};
/* Task 8 floor picker: walkable levels of a building from the nav data. Ground = floorY, 2nd = upperY (the existing clear logic),
   higher levels: nav samples every 0.6 m above upperY (>= 2 points, >= 2.2 m apart); a level with open sky above is the roof. */
TacticalSquadOrders.prototype.buildingFloors=function(ref){var T=TacticalCommon.ns(this.app),nav=T.navigation,P=T.perception,B=this.docInfo(ref);if(!B||!B.ok)return {ok:false,why:B&&B.why||'no building',floors:[]};
 var R=B.rect,hd=function(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2]);};
 var sample=function(y,tol){var out=[];for(var x=R[0]+0.6;x<=R[2]-0.3;x+=2)for(var z=R[1]+0.6;z<=R[3]-0.3;z+=2){var q=nav.nearest([x,y,z],{x:0.9,y:tol,z:0.9});if(!q||Math.abs(q[1]-y)>tol||q[0]<R[0]-0.3||q[0]>R[2]+0.3||q[2]<R[1]-0.3||q[2]>R[3]+0.3)continue;if(out.some(function(o){return hd(o,q)<1.4&&Math.abs(o[1]-q[1])<1;}))continue;out.push(q);}return out;};
 var sky=function(p){return !(P&&P.blocked&&P.blocked([p[0],p[1]+0.6,p[2]],[p[0],p[1]+12,p[2]]));};
 var fl=[{i:0,label:'Ground floor',y:B.floorY||0,pts:(B.ground||[]).concat(B.entry?[B.entry]:[]),roof:false}];
 if(B.upperY!=null&&B.upper&&B.upper.length){fl.push({i:1,label:'2nd floor',y:B.upperY,pts:B.upper.slice(),roof:B.upper.every(sky)});
  var lastY=B.upperY;for(var y=B.upperY+2.4;y<B.upperY+14;y+=0.6){if(y<lastY+2.2)continue;var pts=sample(y,0.32);if(pts.length<2)continue;var my=pts.reduce(function(a,p){return a+p[1];},0)/pts.length;fl.push({i:fl.length,y:my,pts:pts,roof:pts.filter(sky).length*2>=pts.length});lastY=my;}}
 var ord=['Ground floor','2nd floor','3rd floor','4th floor','5th floor','6th floor'];fl.forEach(function(f,i){f.label=f.roof&&i>0?'Roof':ord[i]||(i+1)+'th floor';});
 return {ok:true,ref:B.ref,name:B.name,rect:R,floors:fl};};
TacticalSquadOrders.prototype.btFloorClimb=function(b,now,st){var m=this.brainMembers(b),F=b.floor,self=this,T=TacticalCommon.ns(this.app);
 if(!st.sent){st.sent=true;st.t=now;var from=b.building.stairTop||b.building.entry,pts=F.pts.slice().sort(function(a,c){return Math.hypot(a[0]-from[0],a[2]-from[2])-Math.hypot(c[0]-from[0],c[2]-from[2]);}),used=[];
  m.forEach(function(s,i){var p=pts[Math.min(i,pts.length-1)];used.push(p);if(!self.bMove(b,s,p,b.building.center,'Climbing to the '+F.label.toLowerCase()))st.fail=(st.fail||0)+1;});}
 if(st.fail&&st.fail>=m.length){b.why='no route to the '+F.label.toLowerCase();return 'fail';}
 if(this.bArrived(m))return 'ok';if(now-st.t>30){b.why='climb to the '+F.label.toLowerCase()+' timed out';return m.some(function(s){return Math.abs(s.pos()[1]-F.y)<1;})?'ok':'fail';}
 b.why='moving up to the '+F.label.toLowerCase();return 'run';};
TacticalSquadOrders.prototype.btFloorHold=function(b,now,st){var m=this.brainMembers(b),F=b.floor,B=b.building,self=this;
 if(!st.sent){st.sent=true;var R=B.rect,c=B.center,edge=function(p){return Math.min(p[0]-R[0],R[2]-p[0],p[2]-R[1],R[3]-p[2]);},pick=[];
  F.pts.slice().sort(function(a,q){return edge(a)-edge(q);}).forEach(function(p){if(pick.length<m.length&&!pick.some(function(o){return Math.hypot(o[0]-p[0],o[2]-p[2])<2.5;}))pick.push(p);});
  m.forEach(function(s,i){var p=pick[i%Math.max(1,pick.length)]||s.pos(),out=[p[0]+(p[0]-c[0])*3,p[1]+1.4,p[2]+(p[2]-c[2])*3];self.bMove(b,s,p,out,'Holding the '+F.label.toLowerCase(),{window:F.label});});}
 b.why='holding the '+F.label.toLowerCase();return 'run';};
/* Task 8: the target building collapsed / became unreachable - stop the brain cleanly, everyone holds where they are (no walking into rubble) */
TacticalSquadOrders.prototype.abortBrain=function(why){var b=this.brain,T=TacticalCommon.ns(this.app);if(!b)return false;var m=this.brainMembers(b);b.status='fail';b.why=why;b.endT=T.elapsed;this.brain=null;
 m.forEach(function(s){s.stop();s.order={type:'move',dest:s.pos(),by:'brain-end'};TacticalCommon.log(s.app,s,'Order cancelled: '+why);});T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'squad order '+b.kind+' aborted: '+why});if(T.input&&T.input.toast&&b.by==='player')T.input.toast('Order cancelled: '+why);return true;};
TacticalSquadOrders.prototype.brainTick=function(now,force){var b=this.brain,C=TacticalCommon,K=TacticalSquadOrders.BRAIN,self=this;if(!b)return;
 if(!force&&now<b.nextT)return;b.nextT=now+K.tick;
 var TW=C.ns(this.app).town;if(b.kind==='assault'&&b.building&&TW&&TW.buildings){var rf=b.building.ref==='objective'||b.building.ref==null?TW.objectiveRef:b.building.ref,tb=rf!=null?TW.buildings[rf]:null;if(tb&&tb.state==='collapsed'){this.abortBrain('target building collapsed');return;}}/* Task 8: also without the strategy layer */
 var m=this.brainMembers(b);b.members=b.members.filter(function(s){return m.indexOf(s)>=0||!s.alive;});
 if(!m.length){b.status=b.status==='run'?'ended':b.status;b.why=b.why||'no members left';this.brain=null;return;}
 var r=this.btRun(b.tree,b,now,[]);
 m.forEach(function(s){if(s.order&&s.order.bid===b.id){s.order.step=b.cur;}});
 if(r!=='run'){b.status=r==='ok'?'done':'fail';b.endT=now;C.ns(this.app).events.push({time:+now.toFixed(2),soldier:'-',decision:'squad order '+b.kind+' '+b.status+': '+b.why});this.brain=null;
  if(b.kind==='assault'&&r==='ok'&&b.handoff)this.startHunt(m,'windows held, enemy left');
  else if(r==='fail')m.forEach(function(s){s.order={type:'move',dest:s.pos(),by:'brain-end'};});
  else if(b.kind==='suppress')m.forEach(function(s){s.suppress=null;s.order={type:'move',dest:s.pos(),by:'brain-end'};});}};
TacticalSquadOrders.prototype.brainStep=function(s){var b=this.brain&&s.order&&s.order.bid===this.brain.id?this.brain:null;if(!b)return null;return {kind:b.kind,trail:b.trail.join(' > '),step:b.cur,why:b.why,t:+(TacticalCommon.ns(this.app).elapsed-b.stepT).toFixed(1)};};
/* ---- conditions / actions (this = TacticalSquadOrders; return 'run' | 'ok' | 'fail') ---- */
TacticalSquadOrders.prototype.btDanger=function(b,now){var K=TacticalSquadOrders.BRAIN,T=TacticalCommon.ns(this.app);if(b.withdrawn)return true;if(b.cur==='Hold windows'||b.cur==='Windows')return false;
 var m=this.brainMembers(b),lost=b.startN-m.length,hp=m.reduce(function(a,s){return a+s.health;},0)/Math.max(1,b.hp0);
 var c=this.bCentroid(m),zn=(T.zombies||[]).filter(function(z){if(!z.alive)return false;var p=z.pos();return Math.hypot(p[0]-c[0],p[2]-c[2])<K.zDangerR;}).length;
 var why=b.startN>=3&&lost>=K.withdrawLoss?lost+' of '+b.startN+' down':hp<K.withdrawHealth?'squad health '+Math.round(hp*100)+'%':zn>=K.zDanger?zn+' zombies within '+K.zDangerR+' m':null;
 if(why){b.withdrawn={t:now,why:why};T.events.push({time:+now.toFixed(2),soldier:'-',decision:'assault withdraw: '+why});return true;}return false;};
TacticalSquadOrders.prototype.btWithdraw=function(b,now,st){var m=this.brainMembers(b),K=TacticalSquadOrders.BRAIN,self=this;
 /* M8: once the ground floor is cleared and the squad is inside, falling back = holding the cleared ground floor (angles on the stairs and
    doors, hidden from known enemy positions incl. upstairs) - never back out across open ground into zombies or into uncleared rooms */
 var B=b.building;if(!st.go&&B&&B.ok&&b.groundCleared){var ins=m.filter(function(s){return self.bInside(b,s.pos());}).length;if(ins*2>=m.length){st.go=true;st.inside=true;var hide=this.knownEnemyPos(m);
   this.holdAngles(B,m,false,B.stairTop||B.center,[],hide).forEach(function(a){self.bMove(b,a.s,a.spot.p,a.spot.face,'Holding the cleared ground floor: angle on the '+a.op.kind,{angle:a.op.id,window:a.op.kind});});
   TacticalCommon.ns(this.app).events.push({time:+now.toFixed(2),soldier:'-',decision:'assault: holding the cleared ground floor ('+b.withdrawn.why+')'});}}
 if(st.inside){b.why='too dangerous ('+b.withdrawn.why+') - holding the cleared ground floor, stair base covered';return 'run';}
 if(!st.go){st.go=true;var rally=b.rally||b.start,hideW=this.knownEnemyPos(m),T0=TacticalCommon.ns(this.app),P0=T0.perception,cen0=this.bCentroid(m),bc=b.building.center;
  var OFF=[[0,0],[2.5,0],[-2.5,0],[0,2.5],[0,-2.5]];/* last-known positions are stale: also test a few metres around them */
  var seenW=function(q){return hideW.some(function(h){return Math.hypot(h[0]-q[0],h[2]-q[2])<50&&OFF.some(function(o){return !P0.blocked([h[0]+o[0],h[1]+1.6,h[2]+o[1]],[q[0],q[1]+1.2,q[2]]);});});};
  var grpSeen=function(q){if(seenW(q))return true;var mp=self.spots(m,q),bad=false;mp.forEach(function(p){if(p&&seenW(p))bad=true;});return bad;};
  if(hideW.length&&grpSeen(rally)){/* M8: the rally point is in a known enemy's sight line - fall back to the nearest cover hidden from them (crouched), away from the building */
   var alt=T0.cover.usable().filter(function(c){var p=c.position;return Math.hypot(p[0]-cen0[0],p[2]-cen0[2])<40&&Math.hypot(p[0]-bc[0],p[2]-bc[2])>Math.hypot(cen0[0]-bc[0],cen0[2]-bc[2])-2;}).sort(function(a2,c2){return Math.hypot(a2.position[0]-cen0[0],a2.position[2]-cen0[2])-Math.hypot(c2.position[0]-cen0[0],c2.position[2]-cen0[2]);}).slice(0,20).find(function(c){return !grpSeen(c.position);});
   if(!alt&&b.start&&!grpSeen(b.start))alt={position:b.start};
   if(!alt)alt=T0.cover.usable().filter(function(c){var p=c.position;return Math.hypot(p[0]-cen0[0],p[2]-cen0[2])<60&&Math.hypot(p[0]-bc[0],p[2]-bc[2])>8;}).sort(function(a2,c2){return Math.hypot(a2.position[0]-cen0[0],a2.position[2]-cen0[2])-Math.hypot(c2.position[0]-cen0[0],c2.position[2]-cen0[2]);}).slice(0,40).find(function(c){return !grpSeen(c.position);});
   T0.events.push({time:+now.toFixed(2),soldier:'-',decision:'withdraw: rally seen by a known enemy -> '+(alt?'hidden spot '+alt.position.map(function(x){return x.toFixed(1);}).join(','):'no hidden spot found')});
   if(alt){rally=alt.position.slice();b.rally=rally;}}
this.bGroup(b,m,rally,b.building.center,'Withdrawing: '+b.withdrawn.why);b.why='too dangerous ('+b.withdrawn.why+') - falling back to '+(b.rally?'the last cover':'the start point');return 'run';}
 if(!st.hold&&(this.bArrived(m)||now-b.stepT>20)){st.hold=true;m.forEach(function(s){s.order.autoCover=true;s.order.anchor=(b.rally||b.start).slice();s.order.area=K.defendArea;s.order.face=b.building.center;});}
 b.why=st.hold?'withdrawn ('+b.withdrawn.why+'): holding the rally point with auto cover':'falling back ('+b.withdrawn.why+')';return 'run';};
TacticalSquadOrders.prototype.btColumn=function(b,now,st){var K=TacticalSquadOrders.BRAIN,m=this.brainMembers(b),self=this;
 if(!st.wps){var dest=b.kind==='assault'?b.building.stack[0]:b.point,lead=m[0].pos();var rt=this.bRoute(b,lead,dest);if(!rt){b.navFail++;b.navLog.push({t:+now.toFixed(2),step:b.cur,dest:dest,why:'no route'});b.why='no route to '+(b.building?b.building.name:'the destination');return 'fail';}
  b.route=rt;var stopAt=b.kind==='assault'?rt.total-K.openGround:rt.total+1,wps=[],last=0;
  rt.cover.forEach(function(c){if(c.at<stopAt&&c.at-last>=K.coverGap){wps.push(c);last=c.at;}});
  if(b.kind==='assault'){var lc=rt.cover.filter(function(c){return c.at<=stopAt;}).pop();b.lastCover=lc||null;wps=wps.filter(function(w){return !lc||w.at<lc.at-3;});}
  st.wps=wps;st.i=0;st.t=now;if(!wps.length){b.why='no cover along the route ('+rt.total.toFixed(0)+' m)';return 'ok';}}
 if(st.i>=st.wps.length)return 'ok';
 var w=st.wps[st.i];
 if(!st.sent){st.sent=true;st.t=now;var face=b.kind==='assault'?b.building.center:b.point;
  /* column: everyone goes to the same cover object; the spots ring spreads them along it */
  this.bGroup(b,m,w.c.position,face,'Column: cover '+(st.i+1)+'/'+st.wps.length+' ('+w.c.source+')');}
 b.why='moving in column via cover '+(st.i+1)+'/'+st.wps.length+': '+w.c.source+' ('+Math.max(0,(b.route.total-w.at)).toFixed(0)+' m left)';
 if(this.bArrived(m)||now-st.t>15){b.rally=w.c.position.slice();st.i++;st.sent=false;}
 return st.i>=st.wps.length?'ok':'run';};
TacticalSquadOrders.prototype.btLastCover=function(b,now,st){var m=this.brainMembers(b),K=TacticalSquadOrders.BRAIN,rt=b.route;
 if(!st.sent){st.sent=true;var p,src;if(b.lastCover){p=b.lastCover.c.position;src=b.lastCover.c.source;}else{p=rt.pointAt(rt.total-8);src='8 m short of the door (no cover on the route)';}
  st.open=b.lastCover?rt.total-b.lastCover.at:8;st.src=src;this.bGroup(b,m,p,b.building.center,'Last cover before open ground: '+src);b.rally=p.slice();}
 b.why='last good cover before '+st.open.toFixed(0)+' m of open ground: '+st.src;
 if(this.bArrived(m)||now-b.stepT>15)return 'ok';return 'run';};
TacticalSquadOrders.prototype.btBound=function(b,now,st){var K=TacticalSquadOrders.BRAIN,T=TacticalCommon.ns(this.app),self=this,pairs=this.bPairs(b),stack=b.building.stack,face=b.building.center;
 var atStack=function(g){return g.every(function(s){var p=s.pos();return Math.hypot(p[0]-stack[0][0],p[2]-stack[0][2])<3.5;});};
 if(st.k===undefined){st.k=0;st.bounds=0;st.sent=false;}
 if(pairs.every(atStack)&&this.bArrived(pairs[0].concat(pairs[1]||[]))){b.why='both pairs stacked at the door';return 'ok';}
 if(now-b.stepT>K.stepTimeout*1.5){b.why='bound timeout - going in';return 'ok';}
 var mover=pairs[st.k%pairs.length],cover=pairs.length>1?pairs[(st.k+1)%2]:[];
 if(!st.sent){st.sent=true;st.t=now;var lead=mover[0].pos(),rt=this.bRoute(b,lead,stack[0]),dest=stack[st.k%2===0?0:Math.min(1,stack.length-1)];
  if(rt&&rt.total>K.bound+2)dest=rt.pointAt(K.bound);st.bounds++;
  this.bGroup(b,mover,dest,face,'Bounding: moving up ('+(st.bounds)+')');this.bHolders(b,cover,face,'Overwatch: covering the bound');
  cover.forEach(function(s){s.order.overwatch=true;});mover.forEach(function(s){s.order.overwatch=false;});}
 b.why='pair '+(st.k%2?'B':'A')+' ('+mover.map(function(s){return s.soldierName;}).join('+')+') moving'+(cover.length?', pair '+(st.k%2?'A':'B')+' ('+cover.map(function(s){return s.soldierName;}).join('+')+') on overwatch':'')+', bound '+st.bounds;
 b.overwatchSeen=(b.overwatchSeen||0)+(cover.length&&cover.some(function(s){return s.order.arrived;})?1:0);
 if(this.bArrived(mover)||now-st.t>10){if(pairs.length>1)st.k++;st.sent=false;}return 'run';};
TacticalSquadOrders.prototype.btBreach=function(b,now,st){var pairs=this.bPairs(b),B=b.building,first=pairs[0],second=pairs[1]||[];
 if(!st.sent){st.sent=true;this.bGroup(b,first,B.entry,B.ground[0]||B.center,'Breach: entering');this.bHolders(b,second,B.door,'Breach: covering the door');}
 b.why='pair A breaching the door, pair B covering';
 if(this.bArrived(first)||now-b.stepT>15){if(!st.second){st.second=true;st.t2=now;if(second.length)this.bGroup(b,second,B.entry,B.ground[0]||B.center,'Breach: following in');}
  if(!second.length||this.bArrived(second)||now-st.t2>10)return 'ok';}return 'run';};
TacticalSquadOrders.prototype.btClear=function(b,now,st){
 var K=TacticalSquadOrders.BRAIN,B=b.building,m=this.brainMembers(b),self=this,rec=b.clearRecord;
 if(!rec.ground)rec.ground=new Set();
 if(st.i===undefined){st.i=0;st.sent=false;st.quiet=0;}
 var th=this.bThreatIn(b,m,false);
 if(th){st.quiet=now+1.5;m.forEach(function(s){if(s.order)s.order.face=th.pos();});b.why='Ground floor contact: '+this.bName(th)+'; covering and engaging before resuming';return 'run';}
 if(now<(st.quiet||0)){b.why='Ground floor: confirming contact has stopped';return 'run';}
 while(st.i<B.ground.length&&rec.ground.has(st.i)){st.i++;st.sent=false;}
 if(st.i>=B.ground.length){b.groundCleared=rec.groundDone=true;rec.verifiedAt=now;b.why='Ground floor checked ('+rec.ground.size+' points remembered)';return 'ok';}
 if(!this.buddyReady(b,now,12))return 'run';
 var p=B.ground[st.i],pairs=this.bPairs(b),mover=pairs[st.i%pairs.length],cover=pairs.length>1?pairs[(st.i+1)%2]:[];
 if(!st.sent){st.sent=true;st.t=now;this.bGroup(b,mover,p,p,'Ground floor: check point '+(st.i+1)+'/'+B.ground.length);
  this.bHolders(b,cover,p,'Ground floor: cover clearing pair');}
 b.why='Ground floor checkpoint '+(st.i+1)+'/'+B.ground.length+'; waiting for clearing pair';
 var arrived=mover.length&&mover.every(function(s){var q=s.pos();return s.alive&&s.order&&s.order.arrived&&!s.order.failed&&Math.hypot(q[0]-p[0],q[2]-p[2])<K.clearR+0.7&&Math.abs(q[1]-p[1])<1.2;});
 if(arrived){if(!st.verifyT)st.verifyT=now;if(now-st.verifyT<0.8)return 'run';
  rec.ground.add(st.i);TacticalCommon.ns(this.app).events.push({time:+now.toFixed(2),soldier:'-',decision:'cleared '+b.clearKey+' ground checkpoint '+(st.i+1)});st.i++;st.sent=false;st.verifyT=0;st.retries=0;return 'run';}
 st.verifyT=0;
 if(now-st.t>16){if((st.retries||0)>=1){b.withdrawn={t:now,why:'a clearing pair cannot reach ground-floor checkpoint '+(st.i+1)};return 'run';}
  st.retries=(st.retries||0)+1;st.sent=false;}
 return 'run';};
/* M8 stairs: nobody goes up alone. Pair A stacks at the stair base (both there, 12 s to form), then climbs together while the rest cover
   the stair top from the ground floor. Pair B follows when pair A is up, has contact up there, or after 8 s. With fewer than 2 able
   to climb, the squad holds the stair base angle instead. The step ends only when the upper floor has no known armed enemy (fight up to 25 s). */
TacticalSquadOrders.prototype.btStairs=function(b,now,st){
 var T=TacticalCommon.ns(this.app),B=b.building,m=this.brainMembers(b),self=this,rec=b.clearRecord;
 if(B.upperY==null){b.why='Single storey - no stairs';return 'ok';}
 if(!B.stairTop){b.why='Upper floor has no safe reachable stair connection - holding the ground floor';return 'run';}
 var base=B.stairBase||B.entry,up=function(s){var p=s.pos();return p[1]>B.upperY-1&&Math.hypot(p[0]-B.stairTop[0],p[2]-B.stairTop[2])<Math.max(9,B.rect[2]-B.rect[0]);};
 var nearBase=function(s){var p=s.pos();return Math.hypot(p[0]-base[0],p[2]-base[2])<3.3&&Math.abs(p[1]-(B.floorY||0))<1.7;};
 if(!st.phase){st.phase='stack';st.t=now;st.A=m.slice().sort(function(a,c){return Math.hypot(a.pos()[0]-base[0],a.pos()[2]-base[2])-Math.hypot(c.pos()[0]-base[0],c.pos()[2]-base[2]);}).slice(0,2);st.Bp=m.filter(function(s){return st.A.indexOf(s)<0;});
  if(st.A.length<2){st.phase='hold';}else{this.stackAt(b,st.A,base,'Stairs: stack with partner');var hide=this.knownEnemyPos(m);this.holdAngles(B,st.Bp,false,B.stairTop,[],hide).forEach(function(a){self.bMove(b,a.s,a.spot.p,a.spot.face,'Stairs: cover the stairwell',{window:a.op.kind,angle:a.op.id});});}}
 if(st.phase==='hold'){if(!st.held){st.held=true;var low=m.filter(function(s){return !up(s);});this.holdAngles(B,low,false,B.stairTop,[],this.knownEnemyPos(m)).forEach(function(a){self.bMove(b,a.s,a.spot.p,a.spot.face,'Stairwell unsafe: hold angle',{window:a.op.kind,angle:a.op.id});});}
  b.why='Stairwell held: '+(st.stopWhy||'not enough teammates to climb safely');return 'run';}
 if(st.phase==='stack'){
  st.A=st.A.filter(function(s){return s.alive&&m.indexOf(s)>=0;});
  if(st.A.length<2){st.phase='hold';st.stopWhy='climbing pair incomplete';return 'run';}
  if(st.A.every(nearBase)&&this.buddyReady(b,now,12)){st.phase='climb';st.t=now;
   this.bGroup(b,st.A,B.stairTop,B.center,'Stairs: two-person entry, others cover base');}
  else if(now-st.t>16){if((st.retries||0)>=1){st.phase='hold';st.stopWhy='pair cannot assemble at stair base';}
   else{st.retries=(st.retries||0)+1;st.t=now;this.stackAt(b,st.A,base,'Stairs: reassemble climbing pair');}}
  b.why='Waiting for both stair climbers at the base';return 'run';}
 if(st.phase==='climb'){
  var alive=st.A.filter(function(s){return s.alive&&m.indexOf(s)>=0;});
  if(alive.length<2){st.phase='hold';st.stopWhy='climber injured or killed - do not push alone';return 'run';}
  if(alive.every(up)){st.phase='follow';st.t=now;var rest=m.filter(function(s){return alive.indexOf(s)<0;});
   if(rest.length)this.bGroup(b,rest,B.stairTop,B.center,'Stairs: backup following established pair');}
  else if(now-st.t>25){st.phase='hold';st.stopWhy='paired climb did not complete; avoid repeated stair rush';}
  b.why='Paired stair entry, backup holds from below until both are upstairs';return 'run';}
 if(st.phase==='follow'){
  var rest2=m.filter(function(s){return st.A.indexOf(s)<0;});
  if(rest2.length&&now-st.t>25&&!rest2.every(up)){st.phase='hold';st.stopWhy='backup unable to reach upper floor';return 'run';}
  var th=this.bThreatIn(b,m,true);
  if(th){st.quiet=now+1.5;m.forEach(function(s){if(s.order)s.order.face=th.pos();});b.why='Upper floor contact: '+this.bName(th)+'; wait until safe';return 'run';}
  if(m.every(up)&&now>=(st.quiet||0)){b.upstairs=true;b.why='All surviving teammates upstairs';return 'ok';}
  b.why='Waiting for every squad member before leaving the stairwell';return 'run';}
 return 'run';};
/* Verify several distinct upper-floor regions before assigning window posts. Clears persist for this building. */
TacticalSquadOrders.prototype.btClearUpper=function(b,now,st){
 var B=b.building,m=this.brainMembers(b),rec=b.clearRecord,self=this,K=TacticalSquadOrders.BRAIN;
 if(B.upperY==null||!B.upper||!B.upper.length)return 'ok';
 if(!B.stairTop){b.why='No safe route to upper floor; not marking it clear';return 'run';}
 if(!rec.upper)rec.upper=new Set();
 if(!st.points){var pts=B.upper.slice().sort(function(a,c){return Math.hypot(a[0]-B.stairTop[0],a[2]-B.stairTop[2])-Math.hypot(c[0]-B.stairTop[0],c[2]-B.stairTop[2]);});
  var chosen=[];pts.forEach(function(p){if(chosen.length>=4)return;if(chosen.every(function(q){return Math.hypot(p[0]-q[0],p[2]-q[2])>=3.5;}))chosen.push(p);});st.points=chosen;st.i=0;st.sent=false;}
 var th=this.bThreatIn(b,m,true);if(th){st.quiet=now+1.5;m.forEach(function(s){if(s.order)s.order.face=th.pos();});b.why='Upper-floor contact - maintain cover before continuing';return 'run';}
 if(now<(st.quiet||0))return 'run';
 while(st.i<st.points.length&&rec.upper.has(st.i)){st.i++;st.sent=false;}
 if(st.i>=st.points.length){rec.upperDone=true;rec.verifiedAt=now;b.upperCleared=true;b.why='Upper floor checked ('+rec.upper.size+' points remembered)';return 'ok';}
 if(!this.buddyReady(b,now,12))return 'run';
 var p=st.points[st.i],pairs=this.bPairs(b),mover=pairs[st.i%pairs.length],cover=pairs.length>1?pairs[(st.i+1)%2]:[];
 if(!st.sent){st.sent=true;st.t=now;this.bGroup(b,mover,p,p,'Upper floor: checking '+(st.i+1)+'/'+st.points.length);this.bHolders(b,cover,p,'Upper floor: covering pair');}
 var arrived=mover.length&&mover.every(function(s){var q=s.pos();return s.order&&s.order.arrived&&!s.order.failed&&Math.hypot(q[0]-p[0],q[2]-p[2])<K.clearR+0.7&&Math.abs(q[1]-p[1])<1.2;});
 if(arrived){if(!st.verifyT)st.verifyT=now;if(now-st.verifyT>=0.8){rec.upper.add(st.i);TacticalCommon.ns(this.app).events.push({time:+now.toFixed(2),soldier:'-',decision:'cleared '+b.clearKey+' upper checkpoint '+(st.i+1)});st.i++;st.sent=false;st.verifyT=0;st.retries=0;}return 'run';}
 st.verifyT=0;
 if(now-st.t>17){if((st.retries||0)>=1){b.withdrawn={t:now,why:'upper-floor checkpoint unreachable; hold cleared areas'};return 'run';}st.retries=(st.retries||0)+1;st.sent=false;}
 b.why='Checking upper floor '+(st.i+1)+'/'+st.points.length+'; no progress until pair arrives';return 'run';};
TacticalSquadOrders.prototype.btWindows=function(b,now,st){var T=TacticalCommon.ns(this.app),B=b.building,m=this.brainMembers(b),self=this;
 if(!st.sent){st.sent=true;var k=T.perception.known(m[0],true).filter(function(r){return r.entity.alive;}),tc=k.length?this.bCentroid(k.map(function(r){return {pos:function(){return r.lastSensedPosition;}};})):b.start;
  /* M7: hold angles - each soldier covers a different opening (door / stair top first, then windows facing the threat) from a side angle */
  var fy=B.floorY||0,up=B.upperY!=null&&m.filter(function(s){return s.pos()[1]>fy+1.5;}).length*2>=m.length,asg=this.holdAngles(B,m,up,tc);st.tc=tc;st.up=up;
  if(asg.length){st.assign=[];asg.forEach(function(a){st.assign.push({s:a.s,w:{p:a.spot.p,out:a.spot.face,side:a.op.kind,open:true},op:a.op});self.bMove(b,a.s,a.spot.p,a.spot.face,'Holding an angle on the '+a.op.kind,{window:a.op.kind,angle:a.op.id});});
   var rest=m.filter(function(s){return !asg.some(function(a){return a.s===s;});});rest.forEach(function(s){st.assign.push({s:s,w:{p:s.pos(),out:tc,side:'reserve',open:false}});});
   st.sides=st.assign.map(function(a){return a.w.side;});T.angleHolds=(T.angleHolds||0)+asg.length;}
  else{
  var ws=B.windows.filter(function(w){return w.open;}).sort(function(a,c){var da=Math.hypot(a.out[0]-tc[0],a.out[2]-tc[2]),dc=Math.hypot(c.out[0]-tc[0],c.out[2]-tc[2]);return (c.open?1:0)-(a.open?1:0)||da-dc;}).slice(0,m.length);
  var used=new Set();st.assign=[];m.forEach(function(s){var best=-1,bd=1e9,sp=s.pos();ws.forEach(function(w,i){if(used.has(i))return;var d=Math.hypot(w.p[0]-sp[0],w.p[2]-sp[2]);if(d<bd){bd=d;best=i;}});if(best<0)return;used.add(best);var w=ws[best];st.assign.push({s:s,w:w});self.bMove(b,s,w.p,w.out,(w.open?'Window (':'Upstairs, covering (')+w.side+')',{window:w.side+(w.open?'':' (no opening)')});});
  st.sides=st.assign.map(function(a){return a.w.side+(a.w.open?'':'*');});}}
 b.why='spreading to '+st.assign.length+' openings ('+st.sides.join(', ')+')';
 b.windowAssignments=st.assign;
 if(this.bArrived(m)||now-b.stepT>15){b.onWindows=st.assign.filter(function(a){if(!a.w.open)return false;var p=a.s.pos();return a.s.alive&&Math.hypot(p[0]-a.w.p[0],p[2]-a.w.p[2])<1.2&&Math.abs(p[1]-a.w.p[1])<1;}).length;return 'ok';}return 'run';};
TacticalSquadOrders.prototype.btHold=function(b,now,st){var T=TacticalCommon.ns(this.app),K=TacticalSquadOrders.BRAIN,m=this.brainMembers(b),self=this,en=this.team((this.localTeam||'friendly')==='friendly'?'enemy':'friendly').filter(function(s){return s.alive;});
 if(st.q===undefined){st.q=now;m.forEach(function(s){TacticalCommon.log(s.app,s,s.order&&s.order.angle?'Holding an angle on the '+s.order.window:'Holding window');});}
 /* M7: re-assign the angles when a teammate dies or an opening is breached (hostile inside within 3 m of an opening) */
 if(st.n===undefined){st.n=m.length;st.rT=now;}var B=b.building,self=this;
 if(B&&B.ok&&now-st.rT>1){st.rT=now;var fy=B.floorY||0,up=B.upperY!=null&&m.filter(function(s){return s.pos()[1]>fy+1.5;}).length*2>=m.length,ops=this.openings(B,up,b.start),R=B.rect,br=null;
  T.squad.concat(T.zombies||[]).forEach(function(e){if(br||!e.alive||e.team===(self.localTeam||'friendly')||e.disabled)return;var p=e.pos();if(p[0]<R[0]||p[0]>R[2]||p[2]<R[1]||p[2]>R[3]||Math.abs(p[1]-(up?B.upperY:fy))>1.5)return;var op=ops.find(function(o){return Math.hypot(o.o[0]-p[0],o.o[2]-p[2])<3;});if(op)br={op:op,p:p};});
  var brk=br?br.op.id:null;
  if(m.length&&(m.length<st.n||(brk&&brk!==st.brk&&now-(st.brT||-99)>5))){var asg=this.holdAngles(B,m,up,br?br.p:b.start);asg.forEach(function(a){self.bMove(b,a.s,a.spot.p,a.spot.face,'Re-assigned: angle on the '+a.op.kind+(br?' (breach at the '+br.op.kind+')':''),{window:a.op.kind,angle:a.op.id});});
   T.angleReassign=(T.angleReassign||0)+1;if(brk){st.brT=now;}}
  st.brk=brk;st.n=m.length;}
 var contact=m.some(function(s){return now-s.lastSeenT<2;});if(contact)st.q=now;
 // After contact, restore assigned opening positions if pushed away; don't re-route every frame.
 if(now-(st.restoreT||-99)>5){st.restoreT=now;
  var aList=b.windowAssignments||[];
  aList.forEach(function(a){var s=a.s;if(!s.alive||s.controlled||s.path.length||!a.w.open)return;
   var p=s.pos(),dest=a.w.p;if(Math.hypot(p[0]-dest[0],p[2]-dest[2])>2.5&&Math.abs(p[1]-dest[1])<1.5){
    self.bMove(b,s,dest,a.w.out,'Returning to assigned opening after contact',{window:a.w.side,angle:a.op&&a.op.id});}
  });}
 b.why='holding '+m.length+' opening'+(m.length===1?'':'s')+(contact?' - engaging':' - quiet for '+(now-st.q).toFixed(0)+' s');
 if(b.by!=='player'&&en.length&&now-st.q>K.holdHandoff){b.handoff=true;b.why='windows quiet '+K.holdHandoff+' s, '+en.length+' enemy left - handing off to the hunt';return 'ok';}return 'run';};
TacticalSquadOrders.prototype.btDefMove=function(b,now,st){var m=this.brainMembers(b),p=b.point;
 if(!st.sent){st.sent=true;var face=null,T=TacticalCommon.ns(this.app),th=T.perception?T.perception.threatsFor(m[0]):[];if(th.length)face=th[0];this.bGroup(b,m,p,face,'Defend: moving to the area');}
 b.why='moving to the defend area ('+b.area+' m)';if(this.bArrived(m)||now-b.stepT>20)return 'ok';return 'run';};
TacticalSquadOrders.prototype.btDefHold=function(b,now,st){var T=TacticalCommon.ns(this.app),m=this.brainMembers(b),K=TacticalSquadOrders.BRAIN,c=b.point||this.bCentroid(m),self=this;
 if(!st.init){st.init=true;this.assignSectors(m,T.perception.threatPoint(this.localTeam||'friendly'));m.forEach(function(s){s.order.autoCover=true;s.order.anchor=c.slice();s.order.area=b.area;s.order.arrived=true;});}
 /* M7: defending inside a building - hold angles on its openings instead of auto cover */
 if(!st.ang){st.ang=true;var bn=this.buildingNear(c,0.01);if(bn&&bn.d===0){var BI=this.docInfo(bn.ref,c);if(BI.ok){b.angleB=BI;var upD=BI.upperY!=null&&c[1]>(BI.floorY||0)+1.5;
   this.holdAngles(BI,m,upD,T.perception.threatPoint(this.localTeam||'friendly')).forEach(function(a){self.bMove(b,a.s,a.spot.p,a.spot.face,'Defend: holding an angle on the '+a.op.kind,{anchor:c.slice(),area:b.area,window:a.op.kind,angle:a.op.id});});T.angleHolds=(T.angleHolds||0)+1;}}}
 /* anyone pulled out of the area (chasing, spacing) is brought back */
 m.forEach(function(s){var p=s.pos();if(!s.path.length&&Math.hypot(p[0]-c[0],p[2]-c[2])>b.area+3){self.bMove(b,s,c,null,'Defend: back into the area',{autoCover:true,anchor:c.slice(),area:b.area});}});
 var inC=m.filter(function(s){return s.inCover;}).length,known=T.perception.known(m[0],true).filter(function(r){return r.entity.alive;}),ns=known.filter(function(r){return !r.entity.isZombie;}).length,nz=known.length-ns;
 b.why='holding '+b.area+' m around '+c.map(function(v){return v.toFixed(0);}).join(',')+': '+inC+'/'+m.length+' in auto cover'+(known.length?', threats '+ns+' soldier'+(ns===1?'':'s')+' / '+nz+' zombie'+(nz===1?'':'s'):', no threat');return 'run';};
TacticalSquadOrders.prototype.bSupPoint=function(b,s){var T=TacticalCommon.ns(this.app);if(b.target){var r=T.perception.known(s,true).find(function(r){return r.entity===b.target;});if(r)return r.lastSensedPosition.slice();if(!b.target.alive)return null;}return b.point;};
TacticalSquadOrders.prototype.bLine=function(from,to){var T=TacticalCommon.ns(this.app),e=[from[0],from[1]+1.6,from[2]],t=[to[0],to[1]+1.1,to[2]],d=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],L=Math.hypot(d[0],d[1],d[2])||1;d=[d[0]/L,d[1]/L,d[2]/L];
 var h=TacticalCommon.rayWorld(e,d,L,T.perception.blockers);return !h||h.t>=L-.2;};
TacticalSquadOrders.prototype.btSupLine=function(b,now,st){var T=TacticalCommon.ns(this.app),m=this.brainMembers(b),self=this;
 if(!st.sent){st.sent=true;st.moved=0;m.forEach(function(s){var tp=self.bSupPoint(b,s);if(!tp)return;var me=s.pos();if(self.bLine(me,tp))return;
   var c=T.cover.usable().filter(function(c){return Math.hypot(c.position[0]-me[0],c.position[2]-me[2])<10&&!T.cover.claimedBy(c.position,s);}).sort(function(a,c2){return Math.hypot(a.position[0]-me[0],a.position[2]-me[2])-Math.hypot(c2.position[0]-me[0],c2.position[2]-me[2]);}).slice(0,8).find(function(c){return self.bLine(c.position,tp);});
   if(c){T.cover.claim(s,c.position);self.bMove(b,s,c.position,tp,'Suppress: moving to a firing line ('+c.source+')');st.moved++;}});}
 b.why=st.moved?st.moved+' moving to a firing line':'firing lines ready';
 if(this.bArrived(m)||now-b.stepT>8)return 'ok';return 'run';};
TacticalSquadOrders.prototype.btSupFire=function(b,now,st){var K=TacticalSquadOrders.BRAIN,m=this.brainMembers(b),self=this,T=TacticalCommon.ns(this.app);
 if(!st.until){st.until=now+(b.duration||K.suppress);st.shots0=m.reduce(function(a,s){return a+(s.arms?s.arms.shots:0);},0);}
 var tp=null;m.forEach(function(s){var p=self.bSupPoint(b,s);if(p){tp=p;if(self.bLine(s.pos(),p)){s.suppress={p:p,until:st.until,bid:b.id};s.order.face=p;}else{s.suppress=null;b.blocked=(b.blocked||0)+1;}} });
 if(!tp){b.why='target gone - suppression ends';return 'ok';}
 b.supShots=m.reduce(function(a,s){return a+(s.arms?s.arms.shots:0);},0)-st.shots0;
 b.why='suppressing '+(b.target?'last known position of '+this.bName(b.target):'the point')+' ('+(st.until-now).toFixed(0)+' s left, '+b.supShots+' rounds)';
 if(now>=st.until)return 'ok';return 'run';};

/* M5b: building under / nearest a point (objective or town building), for the G key */
TacticalSquadOrders.prototype.buildingNear=function(p,maxD){var T=TacticalCommon.ns(this.app),best=null,bd=maxD===undefined?8:maxD;
 var dRect=function(r){var dx=Math.max(r[0]-p[0],0,p[0]-r[2]),dz=Math.max(r[1]-p[2],0,p[2]-r[3]);return Math.hypot(dx,dz);};
 if(!this._objRect){var bi=this.buildingInfo('objective');this._objRect=bi.ok?bi.rect:null;}
 if(this._objRect){var d0=dRect(this._objRect);if(d0<=bd){bd=d0;best={ref:'objective',rect:this._objRect,name:'objective building',d:d0};}}
 if(T.town&&T.town.buildings)T.town.buildings.forEach(function(b){if(!b||b.type==='park'||b.state==='collapsed')return;var d=dRect(b.rect);if(d<bd||(d===0&&best&&best.d===0&&Math.hypot(p[0]-b.x,p[2]-b.z)<Math.hypot(p[0]-(best.rect[0]+best.rect[2])/2,p[2]-(best.rect[1]+best.rect[3])/2))){bd=d;best={ref:b.id,rect:b.rect,name:b.type+' #'+b.id,d:d};}});
 return best;};
/* ================= M6: zombie-apocalypse doctrine (both squads, AI on; player orders still held) =================
   Per soldier, every 0.5 s: selfdef (hit, or a zombie on me) > shelter (zombies close, not inside) > engage (gunfire with the
   armed enemy: noise draws zombies, so kill the shooters fast) > shelter (zombies around, not inside) > quiet (zombies known, not a
   threat: hold fire, stay hidden) > calm. Team actions: friendlies shelter in the nearest reachable building with an upper floor via the
   assault/clear tree (route must not cross threatening zombies); defenders outside pull into the objective (upstairs first);
   in a gunfight one soldier at a time bounds to a cover spot with a line of sight on the team's focus target (flank). */
TacticalSquadOrders.DOC={tick:0.5,zHot:12,zNear:25,zThreat:35,selfR:7,gunHold:10,flankEvery:4,flankMin:5,flankMax:16,shelterEnd:20,lostSight:6,buildR:45};
TacticalSquadOrders.prototype.docInside=function(p){var b=this.buildingNear(p,0.01);return !!(b&&b.d===0);};
TacticalSquadOrders.prototype.docInfo=function(ref,from){var T=TacticalCommon.ns(this.app),v=T.navigation&&T.navigation.version,c=this._docInfo||(this._docInfo={});var k=ref+'|'+v;if(!c[k])c[k]=this.buildingInfo(ref,from);return c[k];};
TacticalSquadOrders.prototype.doctrineTick=function(now,frA,enA){var C=TacticalCommon,T=C.ns(this.app),K=TacticalSquadOrders.DOC,self=this;
 if(!C.AI.on||T.doctrine===false||now<(this.docT||0))return;this.docT=now+K.tick;T.doc=T.doc||{};
 var hyp=function(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2]);},nm=function(e){return e?(e.soldierName||((e.type||'')+' zombie')):'?';};
 ['friendly','enemy'].forEach(function(team){var mem=(team==='friendly'?frA:enA).filter(function(s){return !s.controlled&&!s.disabled;});
  var D=T.doc[team]||(T.doc[team]={state:'calm',why:'',zLastT:-99,focus:null,seenT:-99,flankT:-99,counts:{}});if(!mem.length){D.focus=null;return;}
  self.doorWatch(now,mem);/* M7 */
  var cen=self.bCentroid(mem),zk=new Map(),hk=new Map();
  mem.forEach(function(s){T.perception.known(s,true).forEach(function(r){if(!r.entity.alive||r.dead)return;var M=r.entity.isZombie?zk:hk,o=M.get(r.entity);if(!o||r.timeLastSensed>o.timeLastSensed||r.visible)M.set(r.entity,r);});});
  var zT=[];zk.forEach(function(r,z){var p=z.pos(),d=Math.min.apply(null,mem.map(function(s){return hyp(s.pos(),p);})),ch=z.target&&z.target.alive&&z.target.team===team;
   if(d<K.zNear||(ch&&d<K.zThreat*1.5)||(d<K.zThreat&&(z.state==='chase'||z.state==='investigate'||z.state==='attack')))zT.push({z:z,d:d,ch:ch});});
  zT.forEach(function(t){t.hot=t.ch||t.z.state==='attack'||t.d<K.zHot;});zT.sort(function(a,b){return a.d-b.d;});if(zT.some(function(t){return t.hot;}))D.zLastT=now;var zClose=zT.filter(function(t){return t.d<K.zNear&&t.hot;}).length;
  var gun=now-((T.gunfight&&T.gunfight[team])||-99)<K.gunHold;
  var foc=null,fd=1e9;hk.forEach(function(r,e){if(now-r.timeLastSensed>8)return;var d=hyp(r.lastSensedPosition,cen)+(r.visible?0:10)+(D.focus===e?-8:0);if(d<fd){fd=d;foc=e;}});
  D.focus=gun?foc:null;if(hk.size&&Array.from(hk.values()).some(function(r){return r.visible;}))D.seenT=now;
  var nR=T.noise?Math.round(T.noise.r):60,counts={};
  mem.forEach(function(s){var me=s.pos(),st,why,held=!!TacticalSquadOrders.held(s),ins=self.docInside(me),up=ins&&me[1]>2;
   var zc=null;zT.forEach(function(t){if(zc)return;var d=hyp(t.z.pos(),me);if(d<K.selfR||(t.z.target===s&&d<12))zc={z:t.z,d:d};});
   if(now-s.lastHitT<2.5){st='selfdef';why='hit '+(now-s.lastHitT).toFixed(1)+' s ago'+(s.lastAttacker&&now-s.lastAttackerT<3?' by '+nm(s.lastAttacker):'')+' - fight back from cover';}
   else if(zc){st='selfdef';why=nm(zc.z)+' '+zc.d.toFixed(0)+' m'+(zc.z.target===s?', coming for me':'')+' - kill it';}
   else if(zClose&&!ins){st='shelter';why=zClose+' zombie(s) within '+K.zNear+' m and I am in the open - get inside / upstairs';}
   else if(gun&&D.focus){st='engage';why='gunfire: noise draws zombies within '+nR+' m - kill '+nm(D.focus)+' fast (focus fire, flank)';}
   else if(zT.length&&!ins){st='shelter';why=zT.length+' zombie(s) around (nearest '+zT[0].d.toFixed(0)+' m) - do not stay in the open';}
   else if(zk.size){st='quiet';why=(ins?(up?'upstairs':'inside')+', ':'')+zk.size+' zombie(s) known, '+(zT.length?zT.length+' near':'none threatening')+' - hold fire, stay hidden';}
   else if(gun){st='engage';why='gunfire, enemy not located - search';}
   else{st='calm';why='no zombie threat';}
   if(held)why+=' (player order held)';s.doc={state:st,why:why,t:+now.toFixed(1)};counts[st]=(counts[st]||0)+1;
   var tot=T.docStats||(T.docStats={});tot[team+'.'+st]=(tot[team+'.'+st]||0)+K.tick;});
  D.counts=counts;var best='calm',bn=0;for(var k in counts)if(counts[k]>bn){bn=counts[k];best=k;}D.state=best;
  D.why=(zT.length?zT.length+' threatening zombies':'no zombie threat')+', '+(gun?'gunfight':'no gunfire')+(D.focus?', focus '+nm(D.focus):'');
  if(team==='friendly')self.docFriendly(now,mem,D,zT,gun);else self.docEnemy(now,mem,D,zT);
  if(gun&&D.focus)self.docFlank(now,team,mem,D,zT);});};
TacticalSquadOrders.prototype.docFriendly=function(now,mem,D,zT,gun){var C=TacticalCommon,T=C.ns(this.app),K=TacticalSquadOrders.DOC,self=this,b=this.brain;
 var hyp=function(a,c){return Math.hypot(a[0]-c[0],a[2]-c[2]);};
 if(b&&b.by==='doctrine'){var zc=zT.some(function(t){return t.d<K.zNear&&t.hot;});
  var end=(now-D.zLastT>K.shelterEnd&&now-b.t0>8)?'zombie threat gone for '+K.shelterEnd+' s':(gun&&!zc&&D.focus&&now-D.seenT>K.lostSight&&now-b.t0>8)?'gunfight: enemy out of sight - go and get them':null;
  if(end){var m=this.brainMembers(b);b.status='done';b.why='shelter ended: '+end;b.endT=now;this.brain=null;m.forEach(function(s){s.order={type:'move',dest:s.pos(),by:'doctrine-end'};});
   T.events.push({time:+now.toFixed(2),soldier:'-',decision:'doctrine: '+b.why});
   var en0=T.squad.some(function(o){return o.alive&&!o.disabled&&o.team==='enemy';});if(D.resume==='hunt'&&en0&&m.length)this.startHunt(m,'resume after shelter');D.resume=null;}
  return;}
 var early={'':1,'Column via cover':1,'Last cover':1,'Bounding overwatch':1,'Withdraw to rally':1};
 if(b&&b.by==='initiative'&&b.kind==='assault'&&early[b.cur]&&zT.some(function(t){return t.d<K.zNear&&t.hot;})&&mem.filter(function(s){return s.doc&&s.doc.state==='shelter';}).length>=Math.min(2,mem.length)&&now>=(D.shelterRetryT||0)){
  D.resume='assault';  var m0=this.brainMembers(b);b.status='done';b.why='paused: zombies close, sheltering first';b.endT=now;this.brain=null;b=null;m0.forEach(function(s){s.order={type:'move',dest:s.pos(),by:'doctrine-end'};});T.events.push({time:+now.toFixed(2),soldier:'-',decision:'doctrine: assault paused - zombies close, shelter first'});T.lastOrderT=-99;}
 if(!b&&this.hunt&&zT.some(function(t){return t.d<K.zNear&&t.hot;})&&mem.filter(function(s){return s.doc&&s.doc.state==='shelter';}).length>=Math.min(2,mem.length)&&now>=(D.shelterRetryT||0)){
  this.hunt.members.forEach(function(s){if(s.alive&&s.order&&s.order.type==='hunt'){s.stop();s.order={type:'move',dest:s.pos(),by:'doctrine-end'};}});this.hunt=null;D.resume='hunt';T.events.push({time:+now.toFixed(2),soldier:'-',decision:'doctrine: hunt paused - zombies close, shelter first'});}
 if(b||this.follow||this.hunt||now<(D.shelterRetryT||0)){D.shelterWhy=b?'squad order running ('+b.by+' '+b.kind+(b.cur?' @ '+b.cur:'')+')':this.follow?'following':this.hunt?'hunting':'retry later';return;}
 var sh=mem.filter(function(s){return s.doc&&s.doc.state==='shelter'&&!TacticalSquadOrders.held(s)&&!(s.order&&s.order.type==='assault');});
 // Do not automatically assault every building because a zombie is audible nearby.
 // Seek shelter only for an immediate, group-level threat, not a passing patrol.
 var emergency=zT.filter(function(t){return t.hot&&(t.d<12||t.ch&&t.d<18);}).length;
 if(sh.length<Math.min(2,mem.length)||emergency<2)return;
 if(now<(D.lastShelterT||-99)+35)return;
 var cen=this.bCentroid(sh),en=T.squad.filter(function(o){return o.alive&&!o.disabled&&o.team!=='friendly';});
 var c=[];if(!this._objRect){var bi=this.docInfo('objective');this._objRect=bi.ok?bi.rect:null;}
 var dR=function(r){return Math.hypot(Math.max(r[0]-cen[0],0,cen[0]-r[2]),Math.max(r[1]-cen[2],0,cen[2]-r[3]));};
 if(this._objRect)c.push({ref:'objective',rect:this._objRect,d:dR(this._objRect)});
 if(T.town&&T.town.buildings)T.town.buildings.forEach(function(x){if(!x||x.type==='park'||x.state==='collapsed')return;c.push({ref:x.id,rect:x.rect,d:dR(x.rect)});});
 c=c.filter(function(x){return x.d<K.buildR&&!en.some(function(e){var p=e.pos();return p[0]>x.rect[0]-1&&p[0]<x.rect[2]+1&&p[2]>x.rect[1]-1&&p[2]<x.rect[3]+1;});}).sort(function(a,b2){return a.d-b2.d;}).slice(0,4);
 var pick=null,ps=1e9,why=[];c.forEach(function(x){var info=self.docInfo(x.ref,cen);if(!info.ok){why.push(x.ref+': '+info.why);return;}var e=info.entry||[(x.rect[0]+x.rect[2])/2,0,(x.rect[1]+x.rect[3])/2];
  var bad=zT.find(function(t){var q=t.z.pos();return TacticalCover.segDist(cen,e,q)<4&&hyp(q,cen)>3;});if(bad){why.push(x.ref+': zombies on the route');return;}
  var sc=hyp(cen,e)+(info.upper?0:15);if(sc<ps){ps=sc;pick={ref:x.ref,info:info};}});
 if(!pick){D.shelterRetryT=now+3;D.shelterWhy='no reachable shelter: '+why.join('; ');return;}
 var nb=this.startBrain('assault',sh,{building:pick.ref,by:'doctrine',shelterOnly:true,reason:'emergency shelter in '+pick.info.name+' (no automatic building sweep)'});
 if(!nb||nb.status==='fail'){D.shelterRetryT=now+5;D.shelterWhy=nb?nb.why:'start failed';return;}
 D.lastShelterT=now;D.shelter={ref:pick.ref,name:pick.info.name,t:+now.toFixed(1)};T.docShelters=(T.docShelters||0)+1;};
TacticalSquadOrders.prototype.docEnemy=function(now,mem,D,zT){var C=TacticalCommon,T=C.ns(this.app),self=this;if(!zT.length)return;
 var slots=[this.slot('overwatch1',[8,3.2,5.8]),this.slot('overwatch2',[12,3.2,5.8]),this.slot('room1',[9,0,3]),this.slot('room2',[12,0,-3])];
 var ob=this._objRect;if(!ob){var bi=this.docInfo('objective');ob=this._objRect=bi.ok?bi.rect:null;}if(!ob)return;var inO=function(p){return p[0]>ob[0]&&p[0]<ob[2]&&p[2]>ob[1]&&p[2]<ob[3];};
 mem.forEach(function(s){if(!s.doc||s.doc.state!=='shelter'||s.moving||now<(s.docMoveT||0)||inO(s.pos()))return;s.docMoveT=now+10;
  var me=s.pos(),best=null,bd=1e9;slots.forEach(function(p){if(T.squad.some(function(o){return o!==s&&o.alive&&Math.hypot((o.goal||o.pos())[0]-p[0],(o.goal||o.pos())[2]-p[2])<1.2&&Math.abs((o.goal||o.pos())[1]-p[1])<1;}))return;
   if(zT.some(function(t){var q=t.z.pos();return TacticalCover.segDist(me,p,q)<3&&Math.hypot(q[0]-me[0],q[2]-me[2])>3;}))return;var d=Math.hypot(p[0]-me[0],p[2]-me[2])-(p[1]>2?6:0);if(d<bd){bd=d;best=p;}});
  if(best){T.cover.release(s);s.inCover=false;s.order={type:'defend',dest:best,face:zT[0].z.pos(),by:'doctrine',shelter:true};s.moveTo(best,'Zombies: falling back inside'+(best[1]>2?' (upstairs)':''));T.docShelters=(T.docShelters||0)+1;}});
 /* M7: defenders who fell back inside take angles on the openings (per floor; others inside keep their posts) */
 if(now<(this._enAngT||0))return;this._enAngT=now+3;var B=this.docInfo('objective');if(!B.ok)return;var ins=mem.filter(function(s){return inO(s.pos());});
 [false,true].forEach(function(up){if(up&&B.upperY==null)return;var fl=ins.filter(function(s){return (s.pos()[1]>(B.floorY||0)+1.5)===up;}),grp=fl.filter(function(s){var o=s.order;return o&&o.shelter&&!o.angle&&!s.moving&&!(s.index<s.path.length);});if(!grp.length)return;
  var used=fl.filter(function(s){return grp.indexOf(s)<0;}).map(function(s){return s.pos();}).concat(T.squad.filter(function(o){return o.team==='enemy'&&o.alive&&o.order&&o.order.angle;}).map(function(o){return o.order.dest;}));
  self.holdAngles(B,grp,up,zT[0].z.pos(),used).forEach(function(a){var s=a.s;s.order={type:'defend',dest:a.spot.p,face:a.spot.face,by:'doctrine',shelter:true,angle:a.op.id};s.moveTo(a.spot.p,'Holding an angle on the '+a.op.kind);T.angleHolds=(T.angleHolds||0)+1;});});};
TacticalSquadOrders.prototype.docFlank=function(now,team,mem,D,zT){var C=TacticalCommon,T=C.ns(this.app),K=TacticalSquadOrders.DOC,P=T.perception;if(now-D.flankT<K.flankEvery)return;
 var fr=mem.map(function(s){return [s,T.perception.known(s,true).find(function(r){return r.entity===D.focus;})];}).filter(function(x){return x[1];});if(!fr.length)return;
 var fp=fr.reduce(function(a,x){return x[1].timeLastSensed>a.timeLastSensed?x[1]:a;},fr[0][1]).lastSensedPosition,tgt=[fp[0],fp[1]+1.4,fp[2]];
 var cand=mem.filter(function(s){var o=s.order;if(s.moving||s.path.length||TacticalSquadOrders.held(s)||now<(s.flankT||0))return false;if(o&&(o.type==='brain'||o.type==='assault'||o.type==='follow'||o.by==='fallback'||o.by==='resupply'))return false;
  if(s.doc&&s.doc.state==='selfdef')return false;if(s.target===D.focus&&now-s.lastSeenT<1)return false;return true;});
 if(!cand.length)return;var s=cand.sort(function(a,b){return (b.lastSeenT<now-3?1:0)-(a.lastSeenT<now-3?1:0)||Math.hypot(a.pos()[0]-fp[0],a.pos()[2]-fp[2])-Math.hypot(b.pos()[0]-fp[0],b.pos()[2]-fp[2]);})[0],me=s.pos();
 var dme=Math.hypot(me[0]-fp[0],me[2]-fp[2]),best=null,bs=-1e9,rays=0;
 T.cover.usable().forEach(function(c){var p=c.position,dm=Math.hypot(p[0]-me[0],p[2]-me[2]);if(dm<K.flankMin||dm>K.flankMax||Math.abs(p[1]-me[1])>1.5)return;var dt=Math.hypot(p[0]-fp[0],p[2]-fp[2]);if(dt<8||dt>dme+2)return;
  if(T.squad.some(function(o){return o!==s&&o.alive&&Math.hypot((o.goal||o.pos())[0]-p[0],(o.goal||o.pos())[2]-p[2])<2.5;}))return;
  if(zT.some(function(t){var q=t.z.pos();return Math.hypot(q[0]-p[0],q[2]-p[2])<6||TacticalCover.segDist(me,p,q)<3;}))return;
  var sc=-Math.abs(dt-18)*0.6-dm*0.4+(dme-dt)*0.3;if(sc+5<=bs||rays>=16)return;rays++;if(P.blocked([p[0],p[1]+1.62,p[2]],tgt))return;rays++;if(P.blocked([p[0],p[1]+1.12,p[2]],tgt))sc+=5;if(sc<=bs)return;bs=sc;best=c;});/* line of sight standing; hidden crouched preferred */
 D.flankT=now;if(!best)return;s.flankT=now+10;var p=best.position;T.cover.release(s);s.inCover=false;s.hold=false;
 if(team==='friendly'){T.cover.claim(s,p);s.chosenCover={position:p,source:best.source,kind:best.kind,crouched:true};s.acSpot=p;s.acDwellUntil=now+6;}
 s.order=team==='friendly'?{type:'cover',dest:p,face:fp,source:best.source,by:'doctrine',until:now+10}:{type:'defend',dest:p,face:fp,by:'doctrine'};
 if(s.moveTo(p,'Flanking '+(D.focus.soldierName||'enemy')+' via '+best.source)){T.docFlanks=(T.docFlanks||0)+1;D.lastFlank={who:s.soldierName,to:best.source,t:+now.toFixed(1)};}};
/* ================= M7: hold angles indoors =================
   Openings of a building on one floor: doors (ground floor), the stair top (upper floor), open windows (ray-checked in buildingInfo).
   Each soldier covers a different opening from a side angle: 1.6-3.5 m in from the opening and 1-2 m to the side (never in the
   doorway or the line of the opening), with a clear chest-high line of sight to it, facing it. Doors / stairs first, then windows
   facing the threat. Rays: <= 8 per opening, once per assignment. */
TacticalSquadOrders.prototype.openings=function(B,upper,threat,stairs){var fy=upper?B.upperY:B.floorY||0,out=[],R=B.rect,cx=(R[0]+R[2])/2,cz=(R[1]+R[3])/2,nrm=function(x,z){var l=Math.hypot(x,z)||1;return [x/l,0,z/l];};
 if(!upper)(B.doors||[]).forEach(function(d,i){out.push({id:'door'+i,kind:'door',o:[d.c[0],fy,d.c[2]],nIn:[-d.n[0],0,-d.n[2]],pri:0});});
 if(stairs&&!upper&&B.stairBase&&B.stairDir)out.push({id:'stairbase',kind:'stairs (from below)',o:B.stairBase.slice(),nIn:[-B.stairDir[0],0,-B.stairDir[2]],pri:-0.1});/* M8: the way down from an upper floor is covered first */
 if(upper&&B.stairTop){var st=B.stairTop;out.push({id:'stairs',kind:'stair top',o:st.slice(),nIn:nrm(cx-st[0],cz-st[2]),pri:0});}
 var th=threat||B.center,ws=(B.windows||[]).filter(function(w){return w.open&&Math.abs(w.p[1]-fy)<1.2;});
 ws.forEach(function(w,i){var n=nrm(w.out[0]-w.p[0],w.out[2]-w.p[2]),td=nrm(th[0]-w.p[0],th[2]-w.p[2]);out.push({id:'win'+i,kind:'window '+w.side,o:w.p.slice(),nIn:[-n[0],0,-n[2]],pri:1-(n[0]*td[0]+n[2]*td[2])*0.5});});
 out.sort(function(a,c){return a.pri-c.pri;});return out;};
TacticalSquadOrders.prototype.angleSpot=function(B,op,used,fy,relax,hide){var self=this;var T=TacticalCommon.ns(this.app),nav=T.navigation,P=T.perception,R=B.rect,o=op.o,n=op.nIn,tg=[-n[2],0,n[0]];
 var inR=function(q){return q[0]>R[0]+0.35&&q[0]<R[2]-0.35&&q[2]>R[1]+0.35&&q[2]<R[3]-0.35;},free=function(q){return !used.some(function(u){return Math.hypot(u[0]-q[0],u[2]-q[2])<(relax?1.7:1.8)&&Math.abs(u[1]-q[1])<1.2;});};
 var C=[[2.2,1.6],[2.2,-1.6],[3,2],[3,-2],[1.6,1.3],[1.6,-1.3],[3.5,1.1],[3.5,-1.1],[4.2,2.2],[4.2,-2.2],[1.0,1.5],[1.0,-1.5],[0.7,1.9],[0.7,-1.9]],fb=null,from=op.kind==='stair top'?o:nav.nearest([o[0]+n[0]*1.1,fy,o[2]+n[2]*1.1],{x:0.8,y:0.8,z:0.8})||o;
 var reach=function(q){var pp=null;try{pp=nav.path(from,q);}catch(e){return false;}if(!pp||!pp.length)return false;var L=0;for(var j=1;j<pp.length;j++)L+=Math.hypot(pp[j][0]-pp[j-1][0],pp[j][2]-pp[j-1][2]);return relax||L<=Math.hypot(q[0]-from[0],q[2]-from[2])*2+3;};/* same room: a short walk from the opening */
 for(var i=0;i<C.length;i++){var d=C[i][0],l=C[i][1],p=[o[0]+n[0]*d+tg[0]*l,fy,o[2]+n[2]*d+tg[2]*l],q=nav.nearest(p,{x:0.6,y:0.8,z:0.6});
  if(!q||Math.hypot(q[0]-p[0],q[2]-p[2])>0.7||Math.abs(q[1]-fy)>0.45||!inR(q)||!free(q)||(op.kind!=='stair top'&&B.stairTop&&Math.hypot(q[0]-B.stairTop[0],q[2]-B.stairTop[2])<1.3&&Math.abs(q[1]-B.stairTop[1])<1.2))continue;/* on the floor itself, not on the stairs */
  var lat=Math.abs((q[0]-o[0])*tg[0]+(q[2]-o[2])*tg[2]);if(lat<(relax?0.6:0.95)||(B.doors||[]).some(function(dd){return Math.hypot(dd.c[0]-q[0],dd.c[2]-q[2])<1.6&&Math.abs((dd.c[1]||0)-q[1])<1.5;})||!reach(q))continue;if(!fb)fb=q;
  if(hide&&hide.length&&hide.some(function(h){return self.bLine(h,q);}))continue;/* M8: not in a known enemy's sight line (incl. from upstairs) */
  if(!P.blocked([q[0],q[1]+1.45,q[2]],[o[0],o[1]+1.25,o[2]]))return {p:q,face:[o[0],o[1]+1.2,o[2]],los:true};}
 return fb?{p:fb,face:[o[0],o[1]+1.2,o[2]],los:false}:null;};
/* assign openings to a group on one floor; returns [{s,op,spot}] (distinct openings while there are enough) */
TacticalSquadOrders.prototype.holdAngles=function(B,group,upper,threat,usedIn,hide){var self=this,fy=upper?B.upperY:B.floorY||0,ops=this.openings(B,upper,threat,!!hide),used=(usedIn||[]).slice(),left=group.slice(),out=[];
 if(!ops.length)return out;var k=0;
 while(left.length&&k<ops.length*4){var op=ops[k%ops.length];k++;var sp=this.angleSpot(B,op,used,fy,false,hide);if(!sp||!sp.los)continue;
  var bi=0,bd=1e9;left.forEach(function(s,i){var q=s.pos(),d=Math.hypot(q[0]-sp.p[0],q[2]-sp.p[2])+Math.abs(q[1]-sp.p[1])*3;if(d<bd){bd=d;bi=i;}});
  var s=left.splice(bi,1)[0];used.push(sp.p);out.push({s:s,op:op,spot:sp});}
 for(var j=0;left.length&&j<ops.length*3;j++){var op2=ops[j%ops.length],sp2=this.angleSpot(B,op2,used,fy,true,hide);if(!sp2||!sp2.los)continue;var s2=left.shift();used.push(sp2.p);out.push({s:s2,op:op2,spot:sp2,extra:true});}/* few openings: the rest still take a (looser) angle, never the middle of the room */
 return out;};
/* door watchdog: nobody idles in a doorway. A soldier standing still within 1.4 m of a door point for > 3 s takes an angle on that
   door from inside (if his squad is inside / he is a brain member inside) or steps out of the doorway to the stack side. */
TacticalSquadOrders.prototype.doorWatch=function(now,mem){var T=TacticalCommon.ns(this.app),C=TacticalCommon,self=this;
 mem.forEach(function(s){if(!s.alive||s.moving||s.index<s.path.length||TacticalSquadOrders.held(s)){s.doorT=null;return;}var me=s.pos(),bn=self.buildingNear(me,2);if(!bn){s.doorT=null;return;}
  var B=self.docInfo(bn.ref,me);if(!B.ok||!B.doors){s.doorT=null;return;}var dr=B.doors.find(function(d){return Math.hypot(d.c[0]-me[0],d.c[2]-me[2])<1.4&&Math.abs((d.c[1]||0)-me[1])<1.5;});
  if(!dr){s.doorT=null;return;}if(s.doorT==null){s.doorT=now;return;}if(now-s.doorT<3)return;s.doorT=null;
  var ins=(me[0]-dr.c[0])*dr.n[0]+(me[2]-dr.c[2])*dr.n[2]<0.6,sp=null;
  if(ins){var used=T.squad.filter(function(o){return o!==s&&o.alive;}).map(function(o){return o.goal||o.pos();});sp=self.angleSpot(B,{o:[dr.c[0],B.floorY||0,dr.c[2]],nIn:[-dr.n[0],0,-dr.n[2]]},used,B.floorY||0);}
  var p=sp?sp.p:T.navigation.nearest([dr.c[0]+dr.n[0]*2.6-dr.n[2]*1.4,me[1],dr.c[2]+dr.n[2]*2.6+dr.n[0]*1.4],{x:1,y:1,z:1});if(!p)return;
  var txt=sp?'Out of the doorway - holding an angle on it':'Out of the doorway';T.doorFixes=(T.doorFixes||0)+1;
  if(self.brain&&s.order&&s.order.bid===self.brain.id){self.bMove(self.brain,s,p,sp?sp.face:null,txt);}
  else{T.cover.release&&T.cover.release(s);s.inCover=false;s.order={type:s.team==='friendly'?'move':'defend',dest:p,face:sp?sp.face:null,by:'doctrine'};s.moveTo(p,txt);}
  T.events.push({time:+now.toFixed(2),soldier:s.soldierName,decision:'doorway watchdog: '+txt});});};
/* M8: last known positions of armed enemies (any member's memory, < 20 s old) */
TacticalSquadOrders.prototype.knownEnemyPos=function(m){var T=TacticalCommon.ns(this.app),now=T.elapsed,out=[],seen=[];m.forEach(function(s){T.perception.known(s,true).forEach(function(r){if(r.entity.isZombie||!r.entity.alive||now-r.timeLastSensed>20||seen.indexOf(r.entity)>=0)return;seen.push(r.entity);out.push(r.lastSensedPosition.slice());});});return out;};
/* M8: stack spots beside the stair base, hidden from known enemy positions (the stairwell gives upstairs enemies a line down) */
TacticalSquadOrders.prototype.stackAt=function(b,group,base,text){var T=TacticalCommon.ns(this.app),B=b.building,nav=T.navigation,self=this,fy=B.floorY||0,R=B.rect,hide=this.knownEnemyPos(this.brainMembers(b)),used=[],out=new Map();
 var inR=function(q){return q[0]>R[0]+0.3&&q[0]<R[2]-0.3&&q[2]>R[1]+0.3&&q[2]<R[3]-0.3;};
 group.forEach(function(s){var best=null;for(var r=1.2;r<=2.8&&!best;r+=0.8)for(var k=0;k<8&&!best;k++){var a=k*0.785+(r>2?0.39:0),p=[base[0]+Math.sin(a)*r,fy,base[2]+Math.cos(a)*r],q=nav.nearest(p,{x:0.5,y:0.6,z:0.5});
   if(!q||Math.abs(q[1]-fy)>0.45||!inR(q)||used.some(function(u){return Math.hypot(u[0]-q[0],u[2]-q[2])<1.2;}))continue;if(hide.some(function(h){return self.bLine(h,q);}))continue;best=q;}
  if(best){used.push(best);out.set(s,best);}});
 this.stackUsed=used.slice();var miss=group.filter(function(s){return !out.has(s);});if(miss.length){var mp=this.spots(miss,base);miss.forEach(function(s){out.set(s,mp.get(s)||base);});}
 group.forEach(function(s){self.bMove(b,s,out.get(s),B.stairTop,text);});};
