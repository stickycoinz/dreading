/* Task 8 (2026-11-16): map objectives + squad strategy + squad cohesion. Runtime script created by the controller.
   Objectives (T.strategy.objectives): every standing building is a hold / loot (POI sites, landmarks, buildings with loot) /
   overwatch (two storeys or more) objective; bridges are choke points; the unused map entry is the extraction point.
   Each squad plan scores them: value (x state: breached 0.7, collapsed = invalid) - distance - threat (known hostiles + zombies near)
   - team spread + time held (commitment bonus, then decay so loot is "used up"). Hysteresis: a new objective must win by K.hyst.
   Enemies: always planned. Their home (T.town.objectiveRef) gets a defend bonus; when it collapses or becomes unreachable they
   re-home to the best standing building (markers, posts and spawn points move with it) instead of standing in rubble.
   Friendlies: only members idle with no player order (no brain / hunt / follow / held player move or cover, not FP) for K.idleFor s.
   Any player order takes them out of the plan at once. Movement: nav route split into legs; formation per leg from the terrain
   (column when the street is narrower than K.colW, line with a known threat, wedge otherwise); leader/follower slots with
   >= K.spacing m, nav-snapped, never on a teammate's spot or goal; staggered starts; bounding overwatch (fire team A moves while
   B covers, M9 buddy pairs stay together) when a threat is possible; regroup when anyone is > K.regroup m from the leader;
   on contact nobody starts a new leg (moving soldiers stop at the nearest cover; friendlies hand over to auto cover).
   Off with ?strategy=0 (?strategy=enemy: enemy squad only). O (overhead) toggles the objective overlay. */
var TacticalStrategy=pc.createScript('tacticalStrategy');
TacticalStrategy.K={tick:2.0,idleFor:10,firstIdle:0,hyst:2,leg:13,legBound:8,regroup:18,spacing:2.8,minSep:2.2,stagger:0.35,contactHold:4,colW:9,coverR:4,
 holdMax:{loot:50,overwatch:120,hold:120,choke:90,extraction:60},maxMove:180,threatR:25};
TacticalStrategy.KIND_COL={hold:[1,0.92,0.45],loot:[1,0.7,0.15],overwatch:[0.35,0.85,1],choke:[1,0.45,0.2],extraction:[0.35,1,0.45],home:[1,0.25,0.25]};
TacticalStrategy.LOOT=/gas|police|fire|pharm|hardware|militar|armor|armou|warehouse|station|factory|store|shop|dairy|townhall|market|clinic|hospital|garage|depot|goods/;
/* ---- pure helpers (unit tested) ---- */
TacticalStrategy.formationOffsets=function(kind,n,sp){var out=[];sp=sp||TacticalStrategy.K.spacing;
 for(var i=0;i<n;i++){if(i===0){out.push([0,0]);continue;}var r=Math.ceil(i/2),sgn=i%2?-1:1;
  if(kind==='column')out.push([sgn*0.22*sp,-i*1.05*sp]);/* staggered file: alternate sides of the street */
  else if(kind==='line')out.push([sgn*r*1.05*sp,0]);
  else out.push([sgn*r*0.95*sp,-r*0.95*sp]);}/* wedge */
 return out;};
TacticalStrategy.chooseFormation=function(openL,openR,threat){if(threat)return 'line';if(!openL||!openR)return 'column';return 'wedge';};
TacticalStrategy.fireTeams=function(m){/* M9 buddy pairs (0,1)(2,3)... stay together: team A = pairs 0,2,..  team B = pairs 1,3,.. */var A=[],B=[];m.forEach(function(s,i){(Math.floor(i/2)%2?B:A).push(s);});if(!B.length&&A.length>1){B=A.splice(Math.ceil(A.length/2));}return [A,B];};
TacticalStrategy.score=function(o,ctx){/* ctx: {c:centroid, members:[pos], threat:n, cur:bool, heldT, team} -> number (higher better) */var K=TacticalStrategy.K;
 if(!o.valid)return -1e9;var v=o.value*(o.state==='breached'&&o.kind!=='loot'?0.7:1),d=Math.hypot(o.p[0]-ctx.c[0],o.p[2]-ctx.c[2]);
 var hm=K.holdMax[o.kind]||90;if(ctx.cur&&ctx.heldT>hm)v*=Math.max(0.3,1-0.7*(ctx.heldT-hm)/hm);/* used up: loot taken, post watched long enough */
 var spread=0;(ctx.members||[]).forEach(function(p){spread+=Math.max(0,Math.hypot(o.p[0]-p[0],o.p[2]-p[2])-d-10);});
 return v-0.06*d-2.5*(ctx.threat||0)-0.04*spread+(ctx.cur?K.hyst+Math.min(3,(ctx.heldT||0)/20):0)+(ctx.bonus||0);};
TacticalStrategy.isLocal=function(T,s){/* owner gate shared with the x-ray: owner id first (network later), else the local team */if(!s)return false;if(T.localOwnerId!=null&&s.ownerId!=null)return s.ownerId===T.localOwnerId;return s.team===(T.localTeam||'friendly');};
TacticalStrategy.prototype.initialize=function(){var C=TacticalCommon,T=C.ns(this.app),self=this;T.strategy=this;this.powerInit();
 var q='';try{q=location.search||'';}catch(e){}var m=/[?&]strategy=([^&]*)/.exec(q);this.mode=m?m[1]:'all';this.active=C.AI.on&&this.mode!=='0'&&this.mode!=='off';this.friendlyOn=this.active&&this.mode!=='enemy';
 this.objectives=[];this.plans={};this.hud=true;this.stats={rebuilds:0,replans:0,rehomes:0,legs:0,bounds:0,regroups:0,contactStops:0,invalidated:0,postFixes:0,brainAborts:0,lastRehome:null};this.reach={};this.nextT=0;this.t0=0;this.pendingHome=null;
 this.onTown=function(){self.rebuild('town');self.plans={};};this.onState=function(b,state){self.onBuildingState(b,state);};
 this.app.on('tactical:town',this.onTown);this.app.on('tactical:buildingState',this.onState);
 this.kd=function(e){var I=T.input;if(e.code!=='KeyO'||e.repeat||(I&&I.fps))return;var tg=e.target&&e.target.tagName;if(tg==='INPUT'||tg==='TEXTAREA')return;self.hud=!self.hud;if(self.panel)self.panel.style.display=self.hud?'block':'none';if(I&&I.toast)I.toast('Objective overlay '+(self.hud?'on':'off')+' (O)');};
 window.addEventListener('keydown',this.kd,true);
 this.on('destroy',function(){self.app.off('tactical:town',self.onTown);self.app.off('tactical:buildingState',self.onState);window.removeEventListener('keydown',self.kd,true);if(self.panel)self.panel.remove();});};
/* ---------------- objectives ---------------- */
TacticalStrategy.prototype.rebuild=function(why){var T=TacticalCommon.ns(this.app),tw=T.town,nav=T.navigation,out=[],self=this,L=TacticalStrategy.LOOT;this.stats.rebuilds++;this.navV=nav&&nav.version;
 var snap=function(p,h){var q=nav&&nav.nearest?nav.nearest(p,h||{x:6,y:4,z:6}):null;return q?[q[0],q[1],q[2]]:p.slice();};
 var lootB={};if(tw&&tw.loot&&tw.loot.containers)tw.loot.containers.forEach(function(c){if(c.building!=null)lootB[c.building]=(lootB[c.building]||0)+1;});
 if(tw&&tw.buildings)tw.buildings.forEach(function(b){if(!b||b.type==='park')return;var st=(b.shells||[]).reduce(function(a,s){return Math.max(a,s.storeys||1);},1);
  var name=(b.name||b.type)+' #'+b.id,home=tw.objectiveRef===b.id,loot=!home&&(L.test(b.type)||(lootB[b.id]||0)>=3),kind=home?'hold':loot?'loot':st>=2?'overwatch':'hold';/* home is always a hold objective; loot = POI types or 3+ containers */
  var val=home?5:kind==='loot'?4+Math.min(3,(lootB[b.id]||0)*0.5):kind==='overwatch'?3.5+Math.min(1.5,(st-2)*0.75):2.5;if(b.landmark)val+=0.5;
  out.push({id:'B'+b.id,kind:kind,name:name,buildingId:b.id,rect:b.rect.slice(),p:snap([b.x,b.padY||0,b.z]),value:+val.toFixed(2),state:b.state,storeys:st,valid:b.state!=='collapsed'});});
 var DM=typeof DreadingMap!=='undefined'?DreadingMap:null;
 if(tw&&tw.carentan&&DM&&DM.CARENTAN){var CC=DM.CARENTAN;CC.bridges.forEach(function(br,i){var x=br.x!=null?br.x:CC.canal.x,z=br.z!=null?br.z:CC.riverZ(x);out.push({id:'C'+i,kind:'choke',name:br.id,p:snap([x,br.deckY||0,z],{x:6,y:4,z:6}),value:3,valid:true});});
  var used=tw.match?[tw.match.friendlySpawn,tw.match.enemyThreatEdge]:[],home=T.town&&T.town.buildings&&T.town.buildings[T.town.objectiveRef],best=null,bd=-1;
  Object.keys(CC.spawns).forEach(function(k){if(used.indexOf(k)>=0)return;var sp=CC.spawns[k].p,d=home?Math.hypot(sp[0]-home.x,sp[1]-home.z):0;if(d>bd){bd=d;best={k:k,p:sp};}});
  if(best)out.push({id:'X',kind:'extraction',name:'Extraction ('+best.k+' road)',p:snap([best.p[0],0,best.p[1]],{x:8,y:6,z:8}),value:2,valid:true});}
 else if(tw&&tw.roads&&tw.roads.length){/* generic town: the road end farthest from the enemy home is the extraction */var hb=tw.buildings&&tw.buildings[tw.objectiveRef],hc=hb?[hb.x,hb.z]:[0,0],bx=null,bd2=-1;
  tw.roads.forEach(function(r){var pts=r.pts||r.points||[];[pts[0],pts[pts.length-1]].forEach(function(p){if(!p)return;var x=Array.isArray(p)?p[0]:p.x,z=Array.isArray(p)?(p.length>2?p[2]:p[1]):p.z,d=Math.hypot(x-hc[0],z-hc[1]);if(d>bd2){bd2=d;bx=[x,0,z];}});});
  if(bx)out.push({id:'X',kind:'extraction',name:'Extraction (road end)',p:snap(bx,{x:8,y:6,z:8}),value:2,valid:true});}
 out.forEach(function(o){o.home=o.buildingId!=null&&tw&&o.buildingId===tw.objectiveRef;});
 this.objectives=out;this.reach={};return out;};
/* a route start that is on the navmesh: the centroid can sit inside a building or rubble - use the first member that snaps */
TacticalStrategy.prototype.navStart=function(members,fb){var nav=TacticalCommon.ns(this.app).navigation;if(fb){var q0=nav&&nav.nearest(fb,{x:1,y:1.5,z:1});if(q0)return q0;}for(var i=0;i<members.length;i++){var p=members[i].pos(),q=nav&&nav.nearest(p,{x:1.5,y:2,z:1.5});if(q)return q;}return fb||[0,0,0];};
TacticalStrategy.prototype.get=function(id){return this.objectives.find(function(o){return o.id===id;})||null;};
TacticalStrategy.prototype.reachable=function(o,from,team){var T=TacticalCommon.ns(this.app),nav=T.navigation,v=nav&&nav.version,k=team+'|'+o.id+'|'+v;if(this.reach[k]!==undefined)return this.reach[k];var ok=false;
 try{var p=nav.path(from,o.p);var e=p&&p.length&&p[p.length-1],r=o.rect;ok=!!(e&&(Math.hypot(e[0]-o.p[0],e[2]-o.p[2])<3||(r&&e[0]>r[0]-1&&e[0]<r[2]+1&&e[2]>r[1]-1&&e[2]<r[3]+1)));}catch(e){ok=false;}this.reach[k]=ok;return ok;};
/* building state change (fired by TacticalTown.setState after the nav rebuild) */
/* an agent left standing in rubble / a dropped floor (off the rebuilt navmesh) is moved to the nearest walkable point */
TacticalStrategy.prototype.unstick=function(a,r){var T=TacticalCommon.ns(this.app),nav=T.navigation;if(!nav||!a)return false;var p=a.pos?a.pos():a.p;if(!p)return false;if(nav.nearest(p,{x:0.5,y:1,z:0.5}))return false;
 var q=nav.nearest(p,{x:r||6,y:8,z:r||6});if(!q)return false;if(a.entity&&a.entity.setPosition)a.entity.setPosition(q[0],q[1],q[2]);else if(a.p){a.p[0]=q[0];a.p[1]=q[1];a.p[2]=q[2];}if(a.path){a.path=[];a.index=0;}this.stats.unstuck=(this.stats.unstuck||0)+1;return true;};
/* after a collapse / breach: anyone left in the footprint who is off the navmesh or on a cut-off rubble island walks out from
   the nearest exit point that connects to the rest of the map (placed there: the rubble has no route out) */
TacticalStrategy.prototype.evacuate=function(b){var T=TacticalCommon.ns(this.app),nav=T.navigation,self=this,r=b.rect;if(!nav)return 0;
 var sp=(T.spawnPoints||[]).find(function(q){return q.team==='friendly';}),ref=sp&&nav.nearest(sp.position,{x:2,y:3,z:2});
 var conn=function(a,c){if(!c)return true;try{var pp=nav.path(a,c);return !!(pp&&pp.length);}catch(e){return false;}};
 var ex=null,exits=function(){if(ex)return ex;ex=[];for(var x=r[0];x<=r[2]+0.01;x+=3){ex.push([x,r[1]-2]);ex.push([x,r[3]+2]);}for(var z=r[1];z<=r[3]+0.01;z+=3){ex.push([r[0]-2,z]);ex.push([r[2]+2,z]);}
  ex=ex.map(function(e){return nav.nearest([e[0],0,e[1]],{x:1.5,y:4,z:1.5});}).filter(function(q){return q&&!(q[0]>r[0]&&q[0]<r[2]&&q[2]>r[1]&&q[2]<r[3])&&conn(q,ref);});return ex;};
 var n=0;(T.squad||[]).concat(T.zombies||[]).forEach(function(a){if(a.alive===false)return;var p=a.pos?a.pos():null;if(!p||!(p[0]>r[0]-2&&p[0]<r[2]+2&&p[2]>r[1]-2&&p[2]<r[3]+2))return;
  var q=nav.nearest(p,{x:0.5,y:1,z:0.5});if(q&&conn(q,ref))return;var E=exits();if(!E.length){self.unstick(a);return;}
  var best=E.slice().sort(function(u,v){return Math.hypot(u[0]-p[0],u[2]-p[2])-Math.hypot(v[0]-p[0],v[2]-p[2]);})[0];
  if(a.entity&&a.entity.setPosition)a.entity.setPosition(best[0],best[1],best[2]);if(a.path){a.path=[];a.index=0;}n++;});
 this.stats.evacuated=(this.stats.evacuated||0)+n;if(n)T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'strategy: '+n+' unit(s) cut off in the '+b.type+' rubble moved to the nearest exit'});return n;};
TacticalStrategy.prototype.onBuildingState=function(b,state){var T=TacticalCommon.ns(this.app),O=T.orders,tw=T.town,self=this,now=T.elapsed;if(!b)return;
 if(state!=='intact')this.evacuate(b);
 var o=this.get('B'+b.id);if(o){o.state=state;o.valid=state!=='collapsed';if(!o.valid)this.stats.invalidated++;}
 this.reach={};if(O){O._objRect=null;O._docInfo=null;}
 Object.keys(this.plans).forEach(function(team){var P=self.plans[team];if(P&&P.obj&&P.obj.buildingId===b.id){P.dirty='building '+state;self.stats.replans++;}});
 if(O&&O.brain&&O.brain.kind==='assault'){var br=O.brain,ref=br.building&&br.building.ref;if((ref===b.id||(ref==='objective'&&tw&&tw.objectiveRef===b.id))){
  if(state==='collapsed'){if(O.abortBrain)O.abortBrain('target building collapsed');this.stats.brainAborts++;}
  else{var nb=O.buildingInfo(ref,br.start);if(!nb.ok){if(O.abortBrain)O.abortBrain('target building no longer enterable ('+state+')');this.stats.brainAborts++;}else br.building=nb;}}}
 var homeHit=this.active&&tw&&(b.id===tw.objectiveRef||this.pendingHome===b.id);this.pendingHome=null;
 if(homeHit){if(state==='collapsed')this.rehome(b.type+' #'+b.id+' collapsed');else this.fixPosts(b.type+' #'+b.id+' '+state,true);}
 else if(this.active)this.fixPosts('nav rebuild ('+b.type+' #'+b.id+' '+state+')',false);};
/* enemy posts that are no longer on the navmesh (floor gone, rubble) get a new spot in the home building */
TacticalStrategy.prototype.postOk=function(p){var nav=TacticalCommon.ns(this.app).navigation,q=nav&&nav.nearest(p,{x:0.6,y:1.0,z:0.6});return !!(q&&Math.hypot(q[0]-p[0],q[2]-p[2])<0.8&&Math.abs(q[1]-p[1])<1.0);};
TacticalStrategy.prototype.fixPosts=function(why,home){var C=TacticalCommon,T=C.ns(this.app),O=T.orders,self=this;if(!O)return 0;var bad=[];
 T.squad.forEach(function(s){if(!s.alive||s.disabled||s.controlled)return;var o=s.order;if(!o||!o.dest)return;if(o.type!=='defend'&&o.type!=='move'&&o.type!=='cover')return;if(o.by==='player')return;if(!self.postOk(o.dest))bad.push(s);});
 if(!bad.length)return 0;var B=O.buildingInfo('objective');if(home&&!B.ok){this.rehome(why+' (not enterable)');return bad.length;}
 var spots=(B.ok?(B.windows||[]).concat(B.upper||[],B.ground||[]):[]).filter(function(p){return self.postOk(p);}),used=[];
 bad.forEach(function(s){var me=s.pos(),best=null,bd=1e9;spots.forEach(function(p){if(used.some(function(u){return Math.hypot(u[0]-p[0],u[2]-p[2])<1.5&&Math.abs(u[1]-p[1])<1;}))return;var d=Math.hypot(p[0]-me[0],p[2]-me[2]);if(s.team==='enemy'&&d<bd){bd=d;best=p;}});
  if(!best){var c=T.cover.usable().filter(function(c){return !T.cover.claimedBy(c.position,s);}).sort(function(a,b){return Math.hypot(a.position[0]-me[0],a.position[2]-me[2])-Math.hypot(b.position[0]-me[0],b.position[2]-me[2]);})[0];best=c?c.position:T.navigation.nearest(me,{x:3,y:3,z:3});}
  if(!best)return;used.push(best);var face=s.order&&s.order.face;s.order={type:'defend',dest:best,face:face,by:s.order&&s.order.by==='strategy'?'strategy':'ai'};T.cover.release(s);s.inCover=false;s.moveTo(best,'Post lost ('+why+') - new post');self.stats.postFixes++;});
 T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'strategy: '+bad.length+' post(s) re-planned - '+why});return bad.length;};
/* enemy home lost: score standing buildings, move the markers + posts, march there */
TacticalStrategy.prototype.rehome=function(why){var C=TacticalCommon,T=C.ns(this.app),O=T.orders,tw=T.town,self=this;if(!tw||!O)return null;
 this.rebuild('rehome');var old=tw.buildings[tw.objectiveRef],oc=old?[old.x,0,old.z]:O.objective(),en=O.team('enemy').filter(function(s){return s.alive;}),fr=O.team('friendly').filter(function(s){return s.alive;});
 var c=en.length?O.bCentroid(en):oc,fc=fr.length?O.bCentroid(fr):null;
 var cand=this.objectives.filter(function(o){return o.valid&&o.buildingId!=null&&o.buildingId!==tw.objectiveRef&&(o.kind==='hold'||o.kind==='overwatch'||o.kind==='loot');}).map(function(o){
  var thr=fc?Math.max(0,1-Math.hypot(o.p[0]-fc[0],o.p[2]-fc[2])/40)*3:0;return {o:o,s:TacticalStrategy.score(o,{c:oc,threat:thr,bonus:(o.storeys>=2?1.5:0)})};}).sort(function(a,b){return b.s-a.s;});
 var pick=null,B=null;for(var i=0;i<Math.min(6,cand.length)&&!pick;i++){var o=cand[i].o;if(en.length&&!this.reachable(o,this.navStart(en),'enemy'))continue;O._docInfo=null;var bi=O.buildingInfo(o.buildingId,c);if(bi.ok){pick=o;B=bi;}}
 this.stats.rehomes++;this.stats.lastRehome={t:+T.elapsed.toFixed(1),why:why,from:old?old.type+' #'+old.id:null,to:pick?pick.name:null};
 if(!pick){T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'strategy: enemy home lost ('+why+'), no standing building - holding cover'});this.fixPosts(why,false);return null;}
 tw.objectiveRef=pick.buildingId;this.objectives.forEach(function(o){o.home=o===pick;});
 var DM=typeof DreadingMap!=='undefined'?DreadingMap:null,mv=function(k,p){if(!p)return;if(DM&&DM.moveMarker)DM.moveMarker(self.app,k,p);else{var m=C.marker(self.app,k);if(m)m.entity.setPosition(p[0],p[1],p[2]);}};
 var g=B.ground||[],w=(B.windows||[]).concat(B.upper||[]),st=B.stack||[B.door];
 mv('objective',[B.center[0],B.floorY||0,B.center[2]]);mv('room1',g[0]||B.entry);mv('room2',g[1]||g[0]||B.entry);mv('overwatch1',w[0]||g[0]);mv('overwatch2',w[1]||w[0]||g[1]);mv('stairApproach1',st[0]);mv('stairApproach2',st[1]||st[0]);
 if(C.invalidateMarkers)C.invalidateMarkers();O._objRect=null;O._docInfo=null;
 var posts=w.concat(g).filter(function(p){return self.postOk(p);}),k=0;
 (T.spawnPoints||[]).filter(function(sp){return sp.team==='enemy';}).forEach(function(sp,i){var p=posts.length?posts[(k++)%posts.length]:pick.p;sp.position=p.slice();var s=T.squad.find(function(q){return q.soldierName===sp.name;});if(s)s.start=p.slice();});
 T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'strategy: enemy re-homed ('+why+') -> '+pick.name});
 var P=this.plans.enemy=null;if(en.length)this.startPlan('enemy',en,pick,'re-home: '+why);return pick;};
/* ---------------- plans ---------------- */
TacticalStrategy.prototype.idle=function(s,now){var T=TacticalCommon.ns(this.app),O=T.orders,o=s.order;if(!s.alive||s.disabled||s.controlled)return false;if(T.input&&T.input.fps&&T.input.fps.s===s)return false;
 if(!o)return true;if(o.by==='strategy')return true;if(o.by==='player'||o.by==='order'||o.by==='initiative'||o.by==='fallback'||o.by==='resupply')return false;
 if(o.type==='brain')return !(O.brain&&O.brain.id===o.bid);if(o.type==='hunt'||o.type==='follow'||o.type==='assault')return false;if(o.by==='doctrine'&&now<(o.until||0))return false;
 if(O.follow&&O.follow.leader===s)return false;return true;};
TacticalStrategy.prototype.contact=function(team,members,now){var T=TacticalCommon.ns(this.app),d=T.doc&&T.doc[team]&&T.doc[team].state;if(d==='engage'||d==='shelter'||d==='selfdef')return true;
 return members.some(function(s){return (s.target&&s.target.alive&&now-(s.lastSeenT||-99)<2.5&&(!s.target.isZombie||Math.hypot(s.target.pos()[0]-s.pos()[0],s.target.pos()[2]-s.pos()[2])<15))||now-(s.lastHitT||-99)<2||(s.suppr||0)>0.35;});};
TacticalStrategy.prototype.threatAt=function(team,p,members){var T=TacticalCommon.ns(this.app),n=0,R=TacticalStrategy.K.threatR,seen=new Set();
 (members||[]).forEach(function(s){(T.perception?T.perception.known(s,true):[]).forEach(function(r){if(!r.entity.alive||seen.has(r.entity))return;seen.add(r.entity);var q=r.lastSensedPosition;if(Math.hypot(q[0]-p[0],q[2]-p[2])<R)n+=r.entity.isZombie?0.25:1;});});
 return n;};
TacticalStrategy.prototype.choose=function(team,members,now){var T=TacticalCommon.ns(this.app);TacticalCommon.ensureSquads(T);var key=members[0]?members[0].squadKey:team,tw=T.town,O=T.orders,self=this,P=this.plans[key],c=O.bCentroid(members),mp=members.map(function(s){return s.pos();});
 var list=this.objectives.filter(function(o){if(!o.valid)return false;if(team==='friendly'&&o.home)return false;/* the enemy home is the player's call (G) / initiative */if(team==='enemy'&&o.kind==='extraction')return false;return true;});
 var sc=list.map(function(o){var cur=P&&P.obj===o,ctx={c:c,members:mp,threat:self.threatAt(team,o.p,members),cur:cur,heldT:cur&&P.holdT0!=null?now-P.holdT0:0,bonus:team==='enemy'&&o.home?8:0};
  if(team==='friendly'&&Object.keys(self.plans).some(function(k){var other=self.plans[k];return k!==key&&other&&other.team===team&&other.members.length&&other.obj===o;}))ctx.bonus=(ctx.bonus||0)-8;
  if(team==='enemy'&&!o.home&&tw&&tw.buildings&&tw.buildings[tw.objectiveRef]&&tw.buildings[tw.objectiveRef].state!=='collapsed')ctx.bonus=-4;/* defenders stay home */
  if(Math.hypot(o.p[0]-c[0],o.p[2]-c[2])>TacticalStrategy.K.maxMove&&!cur)return {o:o,s:-1e9};return {o:o,s:TacticalStrategy.score(o,ctx)};}).sort(function(a,b){return b.s-a.s;});
 for(var i=0;i<Math.min(5,sc.length);i++){if(sc[i].s<=-1e8)break;if(this.reachable(sc[i].o,this.navStart(members,c),team))return {o:sc[i].o,s:sc[i].s,top:sc.slice(0,4).map(function(x){return {name:x.o.name,kind:x.o.kind,score:+x.s.toFixed(2)};})};}
 return null;};
TacticalStrategy.prototype.startPlan=function(team,members,o,why){var T=TacticalCommon.ns(this.app),O=T.orders,now=T.elapsed,K=TacticalStrategy.K,self=this;TacticalCommon.ensureSquads(T);
 var groups=TacticalCommon.squadGroups(T,team).map(function(g){return g.filter(function(s){return members.indexOf(s)>=0;});}).filter(function(g){return g.length;});
 if(groups.length>1){var first=null;groups.forEach(function(g){var p=self.startPlan(team,g,o,why);if(!first)first=p;});return first;}var key=members[0]?members[0].squadKey:team;
 members=members.slice().sort(function(a,b){return a.soldierName<b.soldierName?-1:1;});
 var P={team:team,obj:o,why:why,members:members,t0:now,phase:'route',legs:[],legI:0,queue:[],holdT0:null,contactT:-99,bounding:false,ft:TacticalStrategy.fireTeams(members),act:0,formation:'wedge',lastLegT:now};
 this.plans[key]=P;P.squadKey=key;this.stats.replans++;var c0=O.bCentroid(members);
 var r0=o.rect;if(r0?(c0[0]>r0[0]-6&&c0[0]<r0[2]+6&&c0[2]>r0[1]-6&&c0[2]<r0[3]+6):Math.hypot(c0[0]-o.p[0],c0[2]-o.p[2])<6){if(team==='enemy'&&o.home){P.phase='hold';P.holdT0=now;}else this.arrive(P,now);}else this.route(P);T.events.push({time:+now.toFixed(2),soldier:'-',decision:'strategy '+team+': '+o.kind+' '+o.name+' ('+why+')'});return P;};
TacticalStrategy.prototype.leader=function(P){return P.members.find(function(s){return s.alive;})||null;};
TacticalStrategy.prototype.route=function(P){var T=TacticalCommon.ns(this.app),nav=T.navigation,K=TacticalStrategy.K,L=this.leader(P);P.legs=[];P.legI=0;if(!L)return;
 var path=null;try{path=nav.path(L.pos(),P.obj.p);}catch(e){path=null;}if(!path||!path.length){P.dirty='no route';return;}
 P.bounding=this.threatPossible(P);var step=P.bounding?K.legBound:K.leg,acc=0,prev=L.pos();
 for(var i=0;i<path.length;i++){var q=path[i],d=Math.hypot(q[0]-prev[0],q[2]-prev[2]);
  while(acc+d>=step){var t=(step-acc)/d,x=[prev[0]+(q[0]-prev[0])*t,prev[1]+(q[1]-prev[1])*t,prev[2]+(q[2]-prev[2])*t];var sn=nav.nearest(x,{x:1,y:2,z:1})||x;P.legs.push(sn);prev=x;d=Math.hypot(q[0]-prev[0],q[2]-prev[2]);acc=0;}
  acc+=d;prev=q;}
 var end=P.obj.p;if(!P.legs.length||Math.hypot(P.legs[P.legs.length-1][0]-end[0],P.legs[P.legs.length-1][2]-end[2])>3)P.legs.push(end.slice());else P.legs[P.legs.length-1]=end.slice();
 P.phase='move';P.legStart=null;};
TacticalStrategy.prototype.threatPossible=function(P){var T=TacticalCommon.ns(this.app),now=T.elapsed;if(now-P.contactT<20)return true;if(this.threatAt(P.team,P.obj.p,P.members)>0)return true;
 var tw=T.town,h=tw&&tw.buildings&&tw.buildings[tw.objectiveRef];if(P.team==='friendly'&&h&&Math.hypot(h.x-P.obj.p[0],h.z-P.obj.p[2])<45)return true;/* moving near the defended building */
 if(P.team==='enemy'){var fr=T.squad.filter(function(s){return s.team==='friendly'&&s.alive;});return fr.some(function(s){return Math.hypot(s.pos()[0]-P.obj.p[0],s.pos()[2]-P.obj.p[2])<60;});}return false;};
TacticalStrategy.prototype.openSide=function(p,dir,side){var nav=TacticalCommon.ns(this.app).navigation,r=[dir[1]*side,-dir[0]*side],w=TacticalStrategy.K.colW/2,q=[p[0]+r[0]*w,p[1],p[2]+r[1]*w],n=nav.nearest(q,{x:0.6,y:1.5,z:0.6});
 if(!n||Math.hypot(n[0]-q[0],n[2]-q[2])>0.8)return false;var P=TacticalCommon.ns(this.app).perception;if(P&&P.blocked&&P.blocked([p[0],p[1]+1,p[2]],[q[0],q[1]+1,q[2]]))return false;return true;};
/* nav-snapped formation slots around point p facing dir (unit x,z); never within K.minSep of each other / avoid points */
TacticalStrategy.prototype.slots=function(p,dir,kind,n,avoid){var nav=TacticalCommon.ns(this.app).navigation,K=TacticalStrategy.K,off=TacticalStrategy.formationOffsets(kind,n,K.spacing),r=[dir[1],-dir[0]],out=[];avoid=avoid||[];
 var ok=function(q){return q&&!out.some(function(o){return Math.hypot(o[0]-q[0],o[2]-q[2])<K.minSep&&Math.abs(o[1]-q[1])<1.5;})&&!avoid.some(function(o){return Math.hypot(o[0]-q[0],o[2]-q[2])<K.minSep*0.7&&Math.abs(o[1]-q[1])<1.5;});};
 off.forEach(function(o){var x=[p[0]+r[0]*o[0]+dir[0]*o[1],p[1],p[2]+r[1]*o[0]+dir[1]*o[1]],q=nav.nearest(x,{x:1.2,y:2,z:1.2});
  if(!ok(q)){q=null;for(var ring=1;ring<=3&&!q;ring++)for(var a=0;a<8&&!q;a++){var an=a*Math.PI/4,y=[x[0]+Math.cos(an)*ring*1.3,x[1],x[2]+Math.sin(an)*ring*1.3],c=nav.nearest(y,{x:0.8,y:2,z:0.8});if(ok(c))q=c;}}
  out.push(q?[q[0],q[1],q[2]]:[x[0],x[1],x[2]]);});
 return out;};
TacticalStrategy.prototype.coverNear=function(p,s,R){var T=TacticalCommon.ns(this.app),best=null,bd=R||TacticalStrategy.K.coverR;if(!T.cover)return null;T.cover.usable().forEach(function(c){var q=c.position,d=Math.hypot(q[0]-p[0],q[2]-p[2]);if(d<bd&&Math.abs(q[1]-p[1])<1.5&&!T.cover.claimedBy(q,s)){bd=d;best=q;}});return best;};
TacticalStrategy.prototype.issue=function(P,s,p,face,text,delay){var T=TacticalCommon.ns(this.app);P.queue=P.queue.filter(function(q){return q.s!==s;});P.queue.push({s:s,p:p,face:face,text:text,at:T.elapsed+(delay||0)});
 s.order={type:P.team==='enemy'?'defend':'move',dest:p,face:face,by:'strategy',arrived:false,plan:P.team};};
TacticalStrategy.prototype.nextLeg=function(P,now){var K=TacticalStrategy.K,self=this,L=this.leader(P),m=P.members.filter(function(s){return s.alive;});if(!L)return;
 if(P.legI>=P.legs.length){this.arrive(P,now);return;}
 var tgt=P.legs[P.legI],from=L.pos(),dx=tgt[0]-from[0],dz=tgt[2]-from[2],Ld=Math.hypot(dx,dz)||1,dir=[dx/Ld,dz/Ld];
 var thr=this.threatAt(P.team,tgt,m)>0;P.formation=TacticalStrategy.chooseFormation(this.openSide(tgt,dir,1),this.openSide(tgt,dir,-1),thr);
 var avoid=[];var T=TacticalCommon.ns(this.app);T.squad.forEach(function(o){if(o.alive&&m.indexOf(o)<0)avoid.push(o.goal||o.pos());});
 var sl=this.slots(tgt,dir,P.formation,m.length,avoid),face=[tgt[0]+dir[0]*20,tgt[1],tgt[2]+dir[1]*20];
 if(P.bounding&&P.ft[1].length){/* bounding overwatch: active fire team moves to cover near its slots, the other covers */var mv=P.ft[P.act].filter(function(s){return s.alive;}),cv=P.ft[1-P.act].filter(function(s){return s.alive;});
  if(!mv.length){P.act=1-P.act;mv=cv;cv=[];}
  mv.forEach(function(s,i){var k=m.indexOf(s),q=sl[k]||tgt,cp=self.coverNear(q,s);if(cp&&T.cover){T.cover.claim(s,cp);q=cp;}self.issue(P,s,q,face,'Bounding ('+P.formation+') -> '+P.obj.name,i*K.stagger);});
  cv.forEach(function(s){if(!s.path.length){s.stop();}if(s.order&&s.order.by==='strategy'){s.order.face=face;s.order.arrived=true;}TacticalCommon.log(s.app,s,'Overwatch: covering the bound');});
  P.movers=mv;P.act=1-P.act;this.stats.bounds++;if(P.act===0||!P.ft[1].length)P.legI++;}
 else{P.movers=m;m.forEach(function(s,i){self.issue(P,s,sl[i]||tgt,face,(i===0?'Leading ':'Following ')+P.formation+' -> '+P.obj.name,i*K.stagger);});P.legI++;}
 P.legStart=now;P.legEnd=now+Ld/2.2*2+8;P.lastLegT=now;this.stats.legs++;};
TacticalStrategy.prototype.arrive=function(P,now){var T=TacticalCommon.ns(this.app),O=T.orders,self=this,o=P.obj,m=P.members.filter(function(s){return s.alive;});P.phase='hold';P.holdT0=now;P.movers=[];
 if(o.buildingId!=null&&P.team==='friendly'&&O&&!O.brain&&O.startBrain){var b=O.startBrain('assault',m,{building:o.buildingId,by:'strategy',reason:'strategy '+o.kind+': '+o.name});if(b&&b.status!=='fail'){P.phase='brain';P.bid=b.id;return;}}
 var spots=[],face=null,B=null;
 if(o.buildingId!=null&&O){B=o.home&&P.team==='enemy'?O.buildingInfo('objective'):O.docInfo(o.buildingId);if(B&&B.ok){spots=(o.kind==='overwatch'||P.team==='enemy'?(B.windows||[]).concat(B.upper||[]):[]).concat(B.ground||[]).filter(function(p){return self.postOk(p);});face=B.door;}}
 if(!spots.length){var dir=[0,1],fr=T.squad.filter(function(s){return s.alive&&s.team!==P.team&&!s.isZombie;});if(fr.length){var fc=O.bCentroid(fr),dx=fc[0]-o.p[0],dz=fc[2]-o.p[2],L=Math.hypot(dx,dz)||1;dir=[dx/L,dz/L];}
  spots=this.slots(o.p,dir,'line',m.length,[]);face=[o.p[0]+dir[0]*25,o.p[1],o.p[2]+dir[1]*25];}
 var used=[];m.forEach(function(s,i){var me=s.pos(),best=null,bd=1e9;spots.forEach(function(p){if(used.indexOf(p)>=0)return;var d=Math.hypot(p[0]-me[0],p[2]-me[2]);if(d<bd){bd=d;best=p;}});if(!best)best=spots[i%spots.length];used.push(best);
  var fc=face||[best[0]+(best[0]-o.p[0])*4,best[1],best[2]+(best[2]-o.p[2])*4];self.issue(P,s,best,fc,(o.kind==='overwatch'?'Overwatch: ':'Holding ')+o.name,i*TacticalStrategy.K.stagger);
  if(P.team==='enemy'&&o.home)s.order.by='strategy';});
 T.events.push({time:+now.toFixed(2),soldier:'-',decision:'strategy '+P.team+': holding '+o.name});};
TacticalStrategy.prototype.planTick=function(team,now,force,group){var T=TacticalCommon.ns(this.app),O=T.orders,self=this,K=TacticalStrategy.K;
 if(!group){TacticalCommon.squadGroups(T,team).forEach(function(g){self.planTick(team,now,force,g);});return;}
 var key=group[0]?group[0].squadKey:team,P=this.plans[key],all=group.filter(function(s){return s.alive&&!s.disabled;});
 var idle=all.filter(function(s){if(!self.idle(s,now))return false;if(team==='friendly'){var since=s.order&&s.order.by==='strategy'?null:(s.idleSince==null?(s.idleSince=now):s.idleSince);if(since!=null&&now-since<(now<8?K.firstIdle:K.idleFor))return false;}return true;});
 all.forEach(function(s){if(!self.idle(s,now))s.idleSince=null;});
 if(P){P.members=P.members.filter(function(s){return s.alive&&idle.indexOf(s)>=0||(P.phase==='brain'&&O.brain&&O.brain.id===P.bid&&O.brain.members.indexOf(s)>=0);});
  if(P.phase==='brain'&&!(O.brain&&O.brain.id===P.bid)){P.phase='hold';P.holdT0=P.holdT0||now;}
  if(!P.members.length){this.plans[key]=null;P=null;}}
 if(team==='friendly'&&!idle.length)return;
 if(P&&(P.dirty||!P.obj.valid)){var why=P.dirty||'objective invalid';P.dirty=null;var nx=this.choose(team,P.members.length?P.members:idle,now);if(nx){this.startPlan(team,P.members.length?P.members:idle,nx.o,'re-plan: '+why);P=this.plans[key];P.top=nx.top;}else{this.plans[key]=null;}return;}
 var mem=P?P.members.concat(idle.filter(function(s){return P.members.indexOf(s)<0;})):idle;if(!mem.length)return;
 if(P&&P.phase!=='hold'&&P.phase!=='brain'){if(mem.length>P.members.length){P.members=mem.sort(function(a,b){return a.soldierName<b.soldierName?-1:1;});P.ft=TacticalStrategy.fireTeams(P.members);}return;}
 if(this.contact(team,mem,now)){if(P)P.contactT=now;return;}
 var ch=this.choose(team,mem,now);if(!ch)return;
 if(!P||ch.o!==P.obj||mem.length>P.members.length&&P.phase==='hold'&&Math.hypot(O.bCentroid(mem)[0]-ch.o.p[0],O.bCentroid(mem)[2]-ch.o.p[2])>12){var np=this.startPlan(team,mem,ch.o,P?'better objective ('+ch.s.toFixed(1)+')':'idle - best objective ('+ch.s.toFixed(1)+')');np.top=ch.top;}
 else P.top=ch.top;};
TacticalStrategy.prototype.moveTick=function(P,now){var K=TacticalStrategy.K,T=TacticalCommon.ns(this.app),self=this;
 /* staggered starts */
 if(P.queue.length){P.queue=P.queue.filter(function(q){if(now<q.at)return true;if(!q.s.alive||!q.s.order||q.s.order.by!=='strategy')return false;if(T.cover&&T.cover.claims){var cl=T.cover.claims.get(q.s);if(cl&&Math.hypot(cl[0]-q.p[0],cl[2]-q.p[2])>0.5)T.cover.release(q.s);}q.s.inCover=false;q.s.hold=false;var ok=q.s.moveTo(q.p,q.text),dst=q.p;if(!ok){self.unstick(q.s);ok=q.s.moveTo(q.p,q.text);}if(!ok&&P.obj&&P.obj.p){var L0=self.leader(P);[L0&&L0!==q.s?L0.pos():null,P.obj.p].some(function(alt){if(alt&&q.s.moveTo(alt,q.text+' (slot unreachable)')){dst=alt;ok=true;}return ok;});}if(!ok)q.s.order.failed=true;else q.s.order.dest=dst;return false;});}
 if(P.phase!=='move')return;var m=P.members.filter(function(s){return s.alive;});if(!m.length)return;
 if(this.contact(P.team,m,now)){if(now-P.contactT>1){this.stats.contactStops++;m.forEach(function(s){if(!s.path.length)return;var cp=self.coverNear(s.pos(),s,8);if(cp){T.cover.claim(s,cp);s.moveTo(cp,'Contact - nearest cover');s.order={type:P.team==='enemy'?'defend':'cover',dest:cp,face:null,by:P.team==='enemy'?'strategy':'auto',arrived:false};}else{s.stop();}});P.queue=[];}P.contactT=now;return;}
 if(now-P.contactT<K.contactHold)return;
 if(P.contactT>P.lastLegT){this.route(P);P.contactT=-99;}/* resume: fresh route from where we are */
 var L=this.leader(P);if(!L)return;
 var far=P.legI<1?[]:m.filter(function(s){return Math.hypot(s.pos()[0]-L.pos()[0],s.pos()[2]-L.pos()[2])>K.regroup;});
 if(far.length&&!P.regroupT){P.regroupT=now;this.stats.regroups++;var c=L.pos(),sl=this.slots(c,[0,1],'wedge',m.length,[]);m.forEach(function(s,i){if(s===L){s.stop();return;}self.issue(P,s,sl[i],null,'Regrouping on '+L.soldierName,0);});P.queue.forEach(function(q){q.at=now;});return;}
 if(P.regroupT){if(far.length&&now-P.regroupT<20)return;P.regroupT=null;}
 var movers=(P.movers||m).filter(function(s){return s.alive;});var done=P.legStart==null||movers.every(function(s){return !s.path.length&&!P.queue.some(function(q){return q.s===s;});});
 if(done||now>P.legEnd){if(P.legStart!=null&&P.bounding&&now-P.legStart<1.2)return;this.nextLeg(P,now);}};
TacticalStrategy.prototype.update=function(dt){var C=TacticalCommon,T=C.ns(this.app),O=T.orders,self=this;if(T.ready)this.powerTick();if(!this.active||!T.ready||!O)return;
 if(this.navV!==(T.navigation&&T.navigation.version)){if(!this.objectives.length||this.navV===undefined)this.rebuild('nav');else{this.navV=T.navigation.version;this.reach={};}}
 if(this.hud)this.draw();
 if(!T.running||T.paused||T.outcome)return;var now=T.elapsed;
 if(now<this.t0-0.01){this.plans={};this.nextT=0;T.squad.forEach(function(s){s.idleSince=null;});}this.t0=now;/* new match */
 Object.keys(this.plans).forEach(function(k){var P=self.plans[k];if(P)self.moveTick(P,now);});
 if(now<this.nextT)return;this.nextT=now+TacticalStrategy.K.tick;
 if(!this.objectives.length)this.rebuild('lazy');if(!this.objectives.length)return;
 var t0=performance.now();this.planTick('enemy',now);if(this.friendlyOn)this.planTick('friendly',now);var ms=performance.now()-t0;this.stats.maxTickMs=Math.max(this.stats.maxTickMs||0,+ms.toFixed(2));};
/* enemy planning: home first - posts already held count as "holding"; only a lost/invalid home or contact-free drift moves them */
/* ---------------- HUD: objective rings (drawLine, immediate layer - no new materials) + plan panel ---------------- */
TacticalStrategy.prototype.draw=function(){var T=TacticalCommon.ns(this.app),I=T.input,app=this.app,self=this;if(I&&I.fps){if(this.panel)this.panel.style.display='none';return;}
 if(!this.objectives.length)return;var KC=TacticalStrategy.KIND_COL,P=this.plans[T.selection&&T.selection[0]&&T.selection[0].squadKey||T.commandSquad||T.localTeam||'friendly'],pos=[],col=[],a=new pc.Color();
 var seg=function(p,q,c){pos.push(p[0],p[1],p[2],q[0],q[1],q[2]);col.push(c[0],c[1],c[2],1,c[0],c[1],c[2],1);};
 var ring=function(p,r,c){for(var i=0;i<20;i++){var a0=i/20*Math.PI*2,a1=(i+1)/20*Math.PI*2;seg([p[0]+Math.cos(a0)*r,p[1]+0.25,p[2]+Math.sin(a0)*r],[p[0]+Math.cos(a1)*r,p[1]+0.25,p[2]+Math.sin(a1)*r],c);}};
 var show=this.objectives.filter(function(o){return o.valid&&(o.kind!=='hold'||o.home||(P&&P.obj===o));});
 show.forEach(function(o){var c=o.home?KC.home:KC[o.kind];ring(o.p,o.kind==='choke'?4:o.kind==='extraction'?6:3,c);if(P&&P.obj===o)ring(o.p,3.6,[1,1,1]);});
 this.objectives.forEach(function(o){if(!o.valid&&o.rect){var y=o.p[1]+0.3,r=o.rect;seg([r[0],y,r[1]],[r[2],y,r[3]],[0.5,0.5,0.5]);seg([r[2],y,r[1]],[r[0],y,r[3]],[0.5,0.5,0.5]);}});
 if(P&&P.legs&&P.phase==='move'){var L=this.leader(P);if(L){var prev=L.pos();for(var i=P.legI>0?P.legI-1:0;i<P.legs.length;i++){seg([prev[0],prev[1]+0.3,prev[2]],[P.legs[i][0],P.legs[i][1]+0.3,P.legs[i][2]],[1,1,1]);prev=P.legs[i];}}}
 if(pos.length&&app.drawLineArrays)app.drawLineArrays(pos,col,true);
 this.panelText(P);};
TacticalStrategy.prototype.panelText=function(P){var T=TacticalCommon.ns(this.app);if(!this.panel){var d=document.createElement('div');d.id='tl-strategy';d.style.cssText='position:fixed;right:8px;bottom:8px;max-width:330px;font:11px/1.35 monospace;color:#dfe;background:rgba(10,14,12,.62);padding:5px 7px;border-radius:4px;pointer-events:none;z-index:20;white-space:pre';document.body.appendChild(d);this.panel=d;}
 this.panel.style.display='block';var tw=T.town,h=this.objectives.find(function(o){return o.home;}),idle=(T.squad||[]).filter(function(s){return s.team==='friendly'&&s.alive&&s.order&&s.order.by==='strategy';}).length;
 var s='OBJECTIVES (O hides)  '+this.objectives.filter(function(o){return o.valid;}).length+' live / '+this.objectives.filter(function(o){return !o.valid;}).length+' lost\n';
 if(h)s+='Enemy-held: '+h.name+' ('+h.state+')\n';
 if(!this.friendlyOn)s+='Squad AI: off (?strategy='+this.mode+')';else if(P)s+='Squad (idle '+P.members.length+'): '+P.phase+' '+P.obj.kind+' '+P.obj.name+(P.phase==='move'?'\n  '+(P.bounding?'bounding ':'')+P.formation+' leg '+Math.min(P.legI,P.legs.length)+'/'+P.legs.length:'')+(P.top?'\n  next: '+P.top.slice(1,3).map(function(t){return t.name+' '+t.score;}).join(', '):'');else s+='Squad: under your orders (idle '+idle+')';
 if(s!==this._pt){this._pt=s;this.panel.textContent=s;}};

/* ---------------- power grid (look spec 3.6 / 5.6): the SIM rule + event. A POI (landmark or loot type) is powered by the team that holds it
   uncontested for POWER.hold s (soldiers inside the footprint); another team holding it cuts it and then powers it for them; a collapse cuts it.
   Presentation (DreadingLook cascade, HUD alert, minimap) only listens to app 'tactical:power' - never a separate visual timer. ---------------- */
TacticalStrategy.POWER={hold:6,tick:0.5};
TacticalStrategy.isPOI=function(b){return !!(b&&b.type!=='park'&&(b.landmark||TacticalStrategy.LOOT.test(b.type||'')));};
TacticalStrategy.prototype.powerInit=function(){var app=this.app,T=TacticalCommon.ns(app),self=this;
 T.power={on:{},team:{},log:[],
  set:function(id,on,team,why){var tw=T.town,b=tw&&tw.buildings&&tw.buildings.find(function(x){return x&&x.id===id;});if(!b||!TacticalStrategy.isPOI(b))return false;on=!!on;
   if(on&&b.state==='collapsed')return false;if(!!T.power.on[id]===on&&(!on||T.power.team[id]===team))return false;
   if(on&&T.power.on[id]&&T.power.team[id]!==team)T.power.set(id,false,null,'taken by '+team);
   T.power.on[id]=on;T.power.team[id]=on?team:null;var ev={id:id,on:on,team:on?team:null,name:(b.name||b.type)+' #'+b.id,why:why||'',t:T.elapsed||0,p:[b.x,b.padY||0,b.z]};T.power.log.push(ev);if(T.power.log.length>40)T.power.log.shift();
   if(T.events)T.events.push({time:+(T.elapsed||0).toFixed(2),soldier:'-',decision:'power '+(on?'ON ':'CUT ')+ev.name+(why?' ('+why+')':'')});app.fire('tactical:power',ev);return true;},
  reset:function(){Object.keys(T.power.on).forEach(function(id){if(T.power.on[id])T.power.set(+id,false,null,'new match');});self.pw={};}};
 this.pw={};this.pwT=0;this.pwT0=0;
 this.onPwState=function(b,state){if(b&&state==='collapsed'&&T.power.on[b.id])T.power.set(b.id,false,null,'collapsed');};this.app.on('tactical:buildingState',this.onPwState);
 this.on('destroy',function(){self.app.off('tactical:buildingState',self.onPwState);});};
TacticalStrategy.prototype.powerTick=function(){var T=TacticalCommon.ns(this.app),P=T.power,tw=T.town,K=TacticalStrategy.POWER,self=this;if(!P||!tw||!tw.buildings||!T.running||T.paused)return;var now=T.elapsed||0;
 if(now<this.pwT0-0.01){P.reset();this.pwT=0;}this.pwT0=now;if(now<this.pwT)return;this.pwT=now+K.tick;
 var sq=(T.squad||[]).filter(function(s){return s.alive;}).map(function(s){return [s.team,s.pos()];});
 tw.buildings.forEach(function(b){if(!TacticalStrategy.isPOI(b)||b.state==='collapsed')return;var r=b.rect,f=0,e=0;
  for(var i=0;i<sq.length;i++){var q=sq[i][1];if(q[0]>r[0]&&q[0]<r[2]&&q[2]>r[1]&&q[2]<r[3]){if(sq[i][0]==='friendly')f++;else e++;}}
  var occ=f&&!e?'friendly':e&&!f?'enemy':null,w=self.pw[b.id]||(self.pw[b.id]={team:null,since:now});if(w.team!==occ){w.team=occ;w.since=now;}
  if(occ&&now-w.since>=K.hold&&!(P.on[b.id]&&P.team[b.id]===occ))P.set(b.id,true,occ,'held '+K.hold+' s');});};
