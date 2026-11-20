/* Specialist decisions run only on the simulation host, staggered and bounded. */
(function(){'use strict';
const S=window.DreadingSpecialistAI={ready:false,routeBlockers:new Map(),stats:{moves:0,rockets:0},role:s=>s?.prepKit?.clsId};
let T,F;const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
S.priority=function(s,e){if(S.role(s)!=='marksman'||e.isZombie)return 1;return ['rocketeer','artillery'].includes(S.role(e))?.12:1;};
S.host=()=>!window.DreadingMultiplayer||DreadingMultiplayer.slot===0;
S.registerRouteBlocker=function(id,entry){if(!entry||!Array.isArray(entry.point)||!entry.point.every(Number.isFinite)||typeof entry.active!=='function')throw Error('A route blocker requires a point and active predicate');S.routeBlockers.set(id,entry);return ()=>S.routeBlockers.delete(id);};
S.records=s=>(T.perception.known(s,true)||[]).filter(r=>r.entity?.alive&&!r.entity.disabled&&r.entity.team!==s.team&&T.elapsed-r.timeLastSensed<4);
S.safeBlast=function(s,p,radius){return !T.squad.some(a=>a.alive&&!a.disabled&&a.team===s.team&&distance(a.pos(),p)<radius+3);};
S.canMove=function(s){const o=s.order;return !s.controlled&&!s.moving&&!s.path.length&&!s.hold&&!(s.focus&&T.elapsed<s.focusUntil)&&(!o||['specialist','ai','cohesion','brain-end','mortar'].includes(o.by));};
function move(s,p,text){const previous=s.order;T.cover.release(s);s.hold=false;if(!s.moveTo(p,text)){s.order=previous;return false;}s.order={type:'move',by:'specialist',dest:p.slice(),anchor:p.slice()};s._specialistUntil=T.elapsed+12;S.stats.moves++;return true;}
const floorCache=new Map();
function points(s){const me=s.pos(),out=(T.cover.usable()||[]).filter(c=>distance(c.position,me)<38).sort((a,b)=>distance(a.position,me)-distance(b.position,me)).slice(0,40);
 const buildings=(T.town?.buildings||[]).filter(b=>b&&b.rect&&b.state!=='collapsed').map(b=>({b,d:Math.hypot(Math.max(b.rect[0]-me[0],0,me[0]-b.rect[2]),Math.max(b.rect[1]-me[2],0,me[2]-b.rect[3]))})).filter(x=>x.d<38).sort((a,b)=>a.d-b.d).slice(0,3);
 for(const {b}of buildings){let c=floorCache.get(b.id);if(!c||c.version!==T.navigation.version||T.elapsed-c.time>12){c={version:T.navigation.version,time:T.elapsed,floors:T.orders.buildingFloors(b.id)};floorCache.set(b.id,c);}if(!c.floors.ok)continue;for(const f of c.floors.floors)for(const p of f.pts.slice(0,16))out.push({position:p});}return out;}
S.candidates=points;
S.position=function(s){if(!S.canMove(s))return;const role=S.role(s),me=s.pos(),known=S.records(s),mates=T.squad.filter(a=>a!==s&&a.alive&&!a.disabled&&a.team===s.team&&!['artillery','marksman'].includes(S.role(a)));let support=mates.sort((a,b)=>distance(a.pos(),me)-distance(b.pos(),me))[0],anchor=support?support.pos():me;
 if(role==='marksman'&&me[1]>2&&distance(me,anchor)<45&&(!known.length||known.some(r=>!T.perception.sightBlocked(TacticalNS.entEye(s),[r.lastSensedPosition[0],r.lastSensedPosition[1]+1.4,r.lastSensedPosition[2]]))))return;
 const choices=points(s).map(c=>{const p=c.position,eye=[p[0],p[1]+1.6,p[2]],roof=T.perception.blocked(eye,[p[0],p[1]+12,p[2]]);let score=-distance(p,me)*.3;
 if(role==='artillery'){if(!roof)return null;score+=20;for(const r of known.slice(0,4))score+=T.perception.sightBlocked(eye,r.lastSensedPosition)?5:-20;}
 else{if(p[1]<2||distance(p,anchor)>45)return null;score+=(p[1]-me[1])*5-distance(p,anchor)*.15;if(known.length&&!known.slice(0,6).some(r=>!T.perception.sightBlocked(eye,[r.lastSensedPosition[0],r.lastSensedPosition[1]+1.4,r.lastSensedPosition[2]])))return null;}
 if(T.squad.some(a=>a!==s&&a.alive&&!a.disabled&&distance(a.goal||a.pos(),p)<1.5))return null;return {p,score};}).filter(Boolean).sort((a,b)=>b.score-a.score);
 if(role==='artillery'&&T.perception.blocked([me[0],me[1]+1.6,me[2]],[me[0],me[1]+12,me[2]]))return;
 for(const c of choices.slice(0,3)){if(distance(c.p,me)<1.5)continue;if(move(s,c.p,role==='marksman'?'Marksman: taking elevated overwatch':'Artillery: sheltering indoors'))break;}
};
S.rocketTarget=function(s){for(const entry of S.routeBlockers.values()){if(entry.active()&&(entry.team==null||entry.team===s.team))return entry.point.slice();}
 const rec=S.records(s).filter(r=>S.role(r.entity)==='marksman'&&!r.entity.isZombie&&Number.isFinite(r.lastVisualT)&&T.elapsed-r.lastVisualT<4&&r.lastVisualPosition[1]>s.pos()[1]+1.5).sort((a,b)=>b.timeLastSensed-a.timeLastSensed)[0];
 return rec?[rec.lastVisualPosition[0],rec.lastVisualPosition[1]+.35,rec.lastVisualPosition[2]]:null;};
S.rocket=function(s){if(s.controlled||s.moving||s.path.length||s.hold||s.order?.holdFire||T.elapsed<(s._rocketNext||0)||s.arms.def.id!=='bazooka')return;s._rocketNext=T.elapsed+1;
 const p=S.rocketTarget(s);if(!p||!S.safeBlast(s,p,F.blast.rocket.radius))return;const o=TacticalNS.entEye(s),len=distance(o,p);if(len<22||len>180)return;const d=p.map((v,i)=>(v-o[i])/len),hit=TacticalCommon.rayWorld(o,d,len,T.perception.blockers);
 // A known sniper's facade/floor may intercept the shot; unrelated nearer walls may not.
 const impact=hit?o.map((v,i)=>v+d[i]*hit.t):p;if(distance(impact,p)>7||!S.safeBlast(s,impact,F.blast.rocket.radius)||T.combat.friendlyInLine(s,o,d,len))return;
 s.lookYaw=Math.atan2(-d[0],-d[2]);s.pitch=Math.atan2(d[1],Math.hypot(d[0],d[2]));if(F.fireAIRocket(s,o,d)){s._rocketNext=T.elapsed+4;S.stats.rockets++;}
};
S.tick=function(s){if(!S.ready||!S.host()||T.paused||!T.running||s.disabled||!s.alive||s.controlled)return;const role=S.role(s);if(!['marksman','artillery','rocketeer'].includes(role))return;if(T.elapsed<(s._specialistNext||0))return;s._specialistNext=T.elapsed+1+(s.uid%5)*.13;if(s._mortarPending){const q=s._mortarPending;if(s.order!==q.order||T.elapsed>q.until){s._mortarPending=null;return;}if(!s.path.length){s._mortarPending=null;const result=F.bombard(s.uid,q.target,s._netOwner);F.feedback[s._netOwner]={id:(F.feedback[s._netOwner]?.id||0)+1,text:result.message||result.reason||'Mortar shell away'};}return;}if(role==='rocketeer')S.rocket(s);else if(T.elapsed>=(s._specialistUntil||0)){s._specialistUntil=T.elapsed+8;S.position(s);}};
const timer=setInterval(()=>{if(!window.tactical?.T.ready||!window.DreadingFireSupport?.ready)return;clearInterval(timer);T=tactical.T;F=DreadingFireSupport;S.ready=true;
 F.findLaunchPosition=function(s,target){const p=s.pos(),key=target.map(v=>Math.round(v)).join(',');if(s._launchCache?.key===key&&T.elapsed-s._launchCache.time<1)return s._launchCache.point;
 let result=null;search:for(const radius of [6,12,18])for(let i=0;i<8;i++){const a=i*Math.PI/4,q=T.navigation.nearest([p[0]+Math.cos(a)*radius,p[1],p[2]+Math.sin(a)*radius],{x:1,y:2,z:1});if(!q)continue;const range=Math.hypot(target[0]-q[0],target[2]-q[2]);if(range<F.range[0]||range>F.range[1])continue;const o=[q[0]+.7,q[1]+1.2,q[2]],time=2.8+range/100,v=[(target[0]-o[0])/time,(target[1]-o[1]+7.5*time*time)/time,(target[2]-o[2])/time];if(!F.clearLaunch(o,v,time))continue;try{const path=T.navigation.path(p,q);if(path.length<2)continue;}catch{continue;}result=q;break search;}
 s._launchCache={key,time:T.elapsed,point:result};return result;};
 const bombard=F.bombard;F.bombard=function(uid,target,side){const result=bombard(uid,target,side);if(result.ok||!result.reason?.startsWith('Mortar launch blocked'))return result;const s=T.squad.find(s=>s.uid===uid),p=F.findLaunchPosition(s,target);if(!p)return result;if(!s.moveTo(p,'Artillery: moving outside to fire'))return result;s.hold=false;s.order={type:'move',by:'fire-support',dest:p.slice()};s._mortarPending={target:target.slice(),order:s.order,until:T.elapsed+30};s._specialistNext=0;return {ok:true,queued:true,message:'Artillery moving outside to fire.'};};
 const update=TacticalSoldierDecision.prototype.update;TacticalSoldierDecision.prototype.update=function(dt){S.tick(this);return update.call(this,dt);};const held=TacticalSquadOrders.held;TacticalSquadOrders.held=function(s){return s?.order?.by==='specialist'?s.order.anchor:held(s);};},100);
})();
