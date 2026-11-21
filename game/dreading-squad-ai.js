/* Package-specific squad decisions. The laboratory supplies objectives through this same API. */
(function(){'use strict';
const Q=window.DreadingSquadAI={ready:false,groups:new Map(),stats:{recruitPushes:0,swatClears:0,eliteBounds:0},profiles:{recruits:{err:1.8,react:1.6,settle:1.35,head:.4},swat:{err:.8,react:.85,settle:.85,head:.9},elite:{err:.55,react:.65,settle:.7,head:1.2}}};let T,seq=1000000;const cache=new WeakMap(),hd=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
Q.tier=s=>s.prepKit?.packageId||(s.prepKit?.clsId==='scavenger'?'recruits':null);
Q.difficulty=function(s,base){const tier=Q.tier(s),p=Q.profiles[tier];if(!p)return base;let c=cache.get(base);if(!c){c={};cache.set(base,c);}return c[tier]||(c[tier]={...base,err:base.err*p.err,react:base.react.map(v=>v*p.react),settle:base.settle*p.settle,head:Math.min(.3,base.head*p.head)});};
Q.host=()=>!window.DreadingMultiplayer||DreadingMultiplayer.isHost;
// A package controller owns its members until a player replaces their orders.
// Legacy team-wide shelter/flank logic must not steal individual members mid-bound.
Q.owns=function(s){if(window.DreadingTeamSupport?.owns(s))return true;const g=Q.groups.get(s.squadKey);return !!g&&!g.cancelled&&g.members.includes(s)&&(s.order?.by==='package-ai'||(g.controller.brain===g.brain&&s.order?.bid===g.brain?.id));};
Q.assign=function(members,opt){opt={...opt};if(opt.kind==='clear'&&opt.building==null)opt.building=T?.town?.objectiveRef;if(!Array.isArray(opt.point)&&opt.building==null)return null;if(!Q.ready||!Q.host())return null;members=members.filter(s=>s.alive&&!s.disabled&&!s.controlled&&s.prepKit?.clsId==='scavenger');if(!members.length)return null;const key=members[0].squadKey,tier=Q.tier(members[0]);if(!Q.profiles[tier])return null;members=members.filter(s=>s.squadKey===key);const previous=Q.groups.get(key);if(previous)previous.cancelled=true;
 const c=Object.create(T.orders);Object.assign(c,{brain:null,lastBrain:null,brainSeq:++seq*100,hunt:null,follow:null,assault:null,clearMemory:new Map(),localTeam:members[0].team,autonomousAssaults:new Set()});c.startBrain=Q.originalStart;c.moveGroup=Q.originalMove;
 if(!opt.point&&opt.building!=null){const B=c.buildingInfo(opt.building,members[0].pos());if(!B.ok)return null;opt.point=(B.entry||B.center).slice();}const g={key,tier,members,controller:c,point:opt.point?.slice(),kind:opt.kind||'advance',building:opt.building,next:0,started:T.elapsed,by:opt.by||'mission',pending:[],status:'assigned'};Q.groups.set(key,g);
 if(tier==='recruits'){members.forEach((s,i)=>{s.stop();s.hold=false;s.order={type:'move',by:'package-ai',dest:s.pos()};g.pending.push({s,order:s.order,at:T.elapsed+(i*.47+(s.uid%3)*.23)});});return g;}
 if((tier==='swat'||tier==='elite')&&opt.building!=null){g.brain=c.startBrain('assault',members,{building:opt.building,by:'package-ai',reason:tier==='swat'?'SWAT: clear and hold rooms':'Specialists: coordinated breach'});g.status=g.brain?.why||'clearing';if(tier==='swat')Q.stats.swatClears++;else Q.stats.eliteBounds++;return g;}
 const b=c.startBrain('defend',members,{point:opt.point,by:'package-ai',reason:tier==='elite'?'Specialists: coordinated advance':'SWAT: secure objective'});g.brain=b;
 if(tier==='elite'&&b){for(const s of members){s.stop();s.order.arrived=true;}const BT=TacticalSquadOrders.BT,P=TacticalSquadOrders.prototype;b.building={center:opt.point,stack:[opt.point,opt.point],rect:[opt.point[0]-2,opt.point[2]-2,opt.point[0]+2,opt.point[2]+2],ok:true};b.tree=BT.seq('Paired advance',[BT.act('Buddy overwatch',P.btBound),BT.act('Hold area',P.btDefHold)]);b.st={};b.cur='';b.nextT=0;Q.stats.eliteBounds++;}return g;};
// Recruits opportunistically open registered route blockades using ordinary weapon fire.
Q.breach=function(g){
 const blockers=window.DreadingSpecialistAI?.routeBlockers;if(!blockers)return false;
 const entry=[...blockers.values()].find(e=>e.active()&&e.entity&&typeof e.damage==='function'&&(e.team==null||e.team===g.members[0]?.team));
 if(!entry)return false;
 const members=g.members.filter(s=>s.alive&&!s.disabled&&!s.controlled&&!s.hold&&!s.order?.holdFire&&s.order?.by==='package-ai');
 const unsafe=members.some(s=>T.elapsed-(s.lastHitT??-99)<4||(s.suppr||0)>.4||(T.perception.known(s,true)||[]).some(r=>r.visible&&r.entity?.alive)||T.zombies.some(z=>z.alive&&hd(z.pos(),s.pos())<10));
 if(!members.length||unsafe)return false;
 window.DreadingTeamSupport?.requestBlockade(g,entry);
 for(const s of members){const o=TacticalNS.entEye(s),p=entry.point,len=Math.hypot(...p.map((v,i)=>v-o[i])),d=p.map((v,i)=>(v-o[i])/len),hit=TacticalCommon.rayWorld(o,d,len+1,T.perception.blockers);
  if(len<35&&hit?.shape?.entity===entry.entity&&!T.combat.friendlyInLine(s,o,d,len)){
   s.stop();s.lookYaw=Math.atan2(-d[0],-d[2]);s.pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]));s.order.dest=s.pos();
   if(s.arms.mag<=0)TacticalNS.startReload(s.arms);else if(!s.arms.reload&&s.arms.fireCd<=0&&TacticalNS.canCycle(s.arms))T.combat.shoot(s,o,d,false);
   TacticalCommon.log(s.app,s,'Recruits: shooting the route blockade');
  }else if(!s.moving&&T.elapsed>(s._breachMoveT||0)){s._breachMoveT=T.elapsed+3;const me=s.pos(),v=T.navigation.nearest([p[0]+(me[0]<p[0]?-14:14),me[1],p[2]+(s.uid%4-1.5)*2],{x:2,y:.5,z:2});if(v){s.moveTo(v,'Recruits: approaching the blockade');s.order.dest=v;}}
 }
 g.status='clearing route blockade';return true;
};
Q.recruitDestination=function(s,raw){const nav=T.navigation,me=s.pos();for(let ring=0;ring<=3;ring++)for(let k=0;k<(ring?8:1);k++){const a=k*Math.PI/4,p=nav.nearest([raw[0]+Math.cos(a)*ring,raw[1],raw[2]+Math.sin(a)*ring],{x:.4,y:.5,z:.4});if(!p)continue;try{if(nav.path(me,p))return p;}catch(e){}}return null;};
function tick(){if(!Q.host()||T.paused||!T.running)return;for(const [key,g]of Q.groups){if(g.cancelled){Q.groups.delete(key);continue;}if(T.elapsed<g.next)continue;g.next=T.elapsed+.4;
 if(g.tier!=='recruits'){g.controller.brainTick(T.elapsed);g.status=g.brain?.why||'holding';if(!g.controller.brain&&g.brain?.status!=='run')g.status=g.brain?.status||'ended';continue;}
 if(Q.breach(g))continue;
 for(const task of g.pending){const s=task.s;if(task.done||T.elapsed<task.at)continue;task.done=true;if(!s.alive||s.controlled||s.order!==task.order)continue;const i=g.members.indexOf(s),spread=[-3,2,4,-1][i%4],p=Q.recruitDestination(s,[g.point[0]+((s.uid%3)-1)*2,g.point[1],g.point[2]+spread]);if(p){s.moveTo(p,'Scavengers: pushing independently');s.order={type:'move',by:'package-ai',dest:p};Q.stats.recruitPushes++;}}
 g.status=g.pending.every(p=>p.done)?'independent push':'staggered departure';}}
const timer=setInterval(()=>{if(!window.tactical?.T.ready)return;clearInterval(timer);T=tactical.T;Q.originalMove=T.orders.moveGroup;Q.originalStart=T.orders.startBrain;Q.ready=true;
 for(const name of ['enemyTactics','zombieTactics','doctrineTick','separate']){const original=T.orders[name];T.orders[name]=function(now,...groups){return original.call(this,now,...groups.map(group=>Array.isArray(group)?group.filter(s=>!Q.owns(s)):group));};}
 // A direct player move keeps its reserved destinations; package missions cannot replace it.
 T.orders.moveGroup=function(members,point,face){if(this===T.orders)for(const soldier of members){const g=Q.groups.get(soldier.squadKey);if(g)g.cancelled=true;}return Q.originalMove.call(this,members,point,face);};
 T.orders.startBrain=function(kind,members,opt){if(this!==T.orders||!Q.host()||kind!=='assault'||opt?.floor)return Q.originalStart.call(this,kind,members,opt);const grouped=new Map(),other=[];for(const s of members){if(!Q.profiles[Q.tier(s)]){other.push(s);continue;}const k=s.squadKey;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(s);}let first=null;for(const group of grouped.values()){const g=Q.assign(group,{building:opt?.building??T.town?.objectiveRef??'objective',point:opt?.point,kind:'clear',by:opt?.by||'order'});first=first||g?.brain||g;}if(other.length)first=Q.originalStart.call(this,kind,other,opt)||first;return first;};
 const ray=T.combat.fireRay;T.combat.fireRay=function(shooter,...args){const r=ray.call(this,shooter,...args);if(Q.host()&&!r.eh&&r.w)for(const e of window.DreadingSpecialistAI?.routeBlockers.values()||[]){if(e.active()&&e.entity===r.w.shape.entity&&typeof e.damage==='function')e.damage(TacticalNS.damageAt(shooter.arms.def,r.rec.dist,'body',1));}return r;};
 tactical.app.on('update',tick);
},100);
})();
