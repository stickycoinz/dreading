/* tacticalCover: cover candidates sampled 0.65 m outside every face of Low AND Tall cover objects (Editor tagged),
   snapped to the navmesh and reachability-checked, refreshed on every navigation rebuild.
   score(s, threats): crouched-hidden / standing-can-fire test (TacticalCommon.rayWorld, eye heights 1.12 / 1.62 from
   NIGHT_SURVIVAL) against EVERY known or likely threat, minus travel distance, minus claimed slots.
   Reservations: claims[] keeps one soldier per slot (>= 1.0 m apart). */
var TacticalCover=pc.createScript('tacticalCover');
TacticalCover.attributes.add('offset',{type:'number',default:0.65,title:'Distance from face (m)'});
TacticalCover.attributes.add('spacing',{type:'number',default:1,title:'Sample spacing (m)'});
TacticalCover.prototype.initialize=function(){var T=TacticalCommon.ns(this.app);T.cover=this;this.candidates=[];this.claims=new Map();};
/* M9: refreshAsync = the same pass, time-sliced (budget ms per frame); the new list replaces the old one atomically at the end. */
TacticalCover.prototype.refresh=function(){var it=this.refreshIter();while(!it.next().done){}return this.candidates;};
TacticalCover.prototype.refreshAsync=async function(budget){var it=this.refreshIter(),b=budget||4;for(;;){var t=performance.now(),r;while(!(r=it.next()).done&&performance.now()-t<b){}if(r.done)return this.candidates;
 await new Promise(function(res){var d=false,f=function(){if(!d){d=true;res();}};if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);setTimeout(f,40);});}};
TacticalCover.prototype.refreshLocal=function(rect){var it=this.refreshIter(rect);while(!it.next().done){}return this.candidates;};
/* opt clone: the same local refresh, time-sliced (it was a 12-16 ms single-frame stall on every breach nav patch); candidates swap in atomically at the end */
TacticalCover.prototype.refreshLocalAsync=async function(rect,budget){var it=this.refreshIter(rect,true),b=budget||3;for(;;){var t=performance.now(),r;while(!(r=it.next()).done&&performance.now()-t<b){}if(r.done)return this.candidates;
 await new Promise(function(res){var d=false,f=function(){if(!d){d=true;res();}};if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);setTimeout(f,40);});}};
TacticalCover.prototype.refreshIter=function*(rect,sliced){
 var C=TacticalCommon,T=C.ns(this.app),nav=T.navigation,self=this,out=[];
 var tagsC=C.collect(this.app).filter(function(t){return t.kind==='coverLow'||t.kind==='coverTall';});
 if(rect&&sliced){var kept0=[];for(var fi=0;fi<tagsC.length;fi++){var t0=tagsC[fi],o0=C.shape(t0.entity),mnx=Infinity,mxx=-Infinity,mnz=Infinity,mxz=-Infinity;for(var sx=-1;sx<=1;sx+=2)for(var sz=-1;sz<=1;sz+=2){var p0=C.corner(o0,sx,0,sz);if(p0[0]<mnx)mnx=p0[0];if(p0[0]>mxx)mxx=p0[0];if(p0[2]<mnz)mnz=p0[2];if(p0[2]>mxz)mxz=p0[2];}if(!(mxx<rect[0]||mnx>rect[2]||mxz<rect[1]||mnz>rect[3]))kept0.push(t0);if(fi%64===63)yield;}tagsC=kept0;}
 else if(rect)tagsC=tagsC.filter(function(t){var o=C.shape(t.entity),minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;[-1,1].forEach(function(sx){[-1,1].forEach(function(sz){var p=C.corner(o,sx,0,sz);if(p[0]<minx)minx=p[0];if(p[0]>maxx)maxx=p[0];if(p[2]<minz)minz=p[2];if(p[2]>maxz)maxz=p[2];});});return !(maxx<rect[0]||minx>rect[2]||maxz<rect[1]||minz>rect[3]);});
 yield;
 for(var ti=0;ti<tagsC.length;ti++){(function(t){
  var o=C.shape(t.entity),bottom=o.center.y-o.half[1];if(bottom>1)return;// ground-level cover only for now
  [0,2].forEach(function(axis){var tangent=axis===0?2:0;var A=o.axes[axis],B=o.axes[tangent];var flat=function(v){var l=Math.hypot(v.x,v.z)||1;return [v.x/l,v.z/l];};var a=flat(A),b=flat(B);
   [-1,1].forEach(function(sign){for(var s=-o.half[tangent]+0.5;s<o.half[tangent]-0.2;s+=(t.entity.coverSpacing||self.spacing)){/* pass 4: procedural town walls sample every 2 m */
    var d=o.half[axis]+self.offset,p=[o.center.x+a[0]*d*sign+b[0]*s,bottom+0.12,o.center.z+a[1]*d*sign+b[1]*s];
    var c={position:p,source:t.name,kind:t.kind,normal:[a[0]*sign,0,a[1]*sign],onMesh:true,reachable:true,reason:''};
    var q=nav&&nav.nearest(p,{x:0.5,y:1,z:0.5});
    if(!q||Math.hypot(q[0]-p[0],q[2]-p[2])>0.35){c.onMesh=false;c.reason='Cover point by '+t.name+' at '+C.fmt(p)+' is off the navmesh';}
    else c.position=[q[0],q[1],q[2]];
    out.push(c);}});});
 })(tagsC[ti]);yield;}
 if(rect){var sources={};out.forEach(function(c){sources[c.source]=1;});var kept=(this.candidates||[]).filter(function(c){if(sources[c.source])return false;var p=c.position;return p[0]<rect[0]||p[0]>rect[2]||p[2]<rect[1]||p[2]>rect[3];});this.candidates=kept.concat(out);}
 else{this.candidates=out;this.claims.clear();}
 return out;
};
TacticalCover.prototype.usable=function(){return this.candidates.filter(function(c){return c.onMesh&&c.reachable;});};
TacticalCover.prototype.claim=function(s,pos){this.claims.set(s,pos);};
TacticalCover.prototype.release=function(s){this.claims.delete(s);};
TacticalCover.prototype.claimedBy=function(pos,except){var who=null;this.claims.forEach(function(p,s){if(s!==except&&s.alive&&Math.hypot(p[0]-pos[0],p[2]-pos[2])<1.0)who=s;});return who;};
TacticalCover.prototype.evaluate=function(c,threats){var P=TacticalCommon.ns(this.app).perception,p=c.position,crouched=true,standing=true;
 var hid=0;threats.forEach(function(th){if(P.blocked([p[0],p[1]+1.12,p[2]],th))hid++;else crouched=false;if(P.blocked([p[0],p[1]+1.62,p[2]],th))standing=false;});
 return {crouched:crouched,standing:standing,hidden:threats.length?hid/threats.length:1};};
TacticalCover.prototype.score=function(s,threats,opts){
 var T=TacticalCommon.ns(this.app),P=T.perception,self=this;opts=opts||{};threats=threats||P.threatsFor(s);var me=s.pos(),near=opts.near||me;
 var list=this.usable();if(opts.source)list=list.filter(function(c){return c.source===opts.source;});if(opts.radius)list=list.filter(function(c){return Math.hypot(c.position[0]-near[0],c.position[2]-near[2])<=opts.radius;});
 return list.map(function(c){var ev=self.evaluate(c,threats),p=c.position,distance=Math.hypot(p[0]-near[0],p[1]-near[1],p[2]-near[2]),claimed=self.claimedBy(p,s);
  var tall=c.kind==='coverTall';
  return {position:p,source:c.source,kind:c.kind,standing:ev.standing,crouched:ev.crouched,distance:distance,claimed:!!claimed,
   hidden:ev.hidden,score:(ev.crouched?20:ev.hidden*30-20)+(ev.standing&&!tall?12:0)+(tall&&ev.crouched?6:0)-distance*(opts.distW||0.5)-(claimed?100:0)};}).sort(function(a,b){return b.score-a.score;});
};
/* Pick distinct slots for a group (greedy, reserved). Returns [{soldier, slot|null}]. */
TacticalCover.prototype.assign=function(group,threats,opts){var self=this,taken=[];
 group.forEach(function(s){self.release(s);});
 return group.map(function(s){var best=self.score(s,threats,opts).find(function(c){return !c.claimed&&taken.every(function(p){return Math.hypot(p[0]-c.position[0],p[2]-c.position[2])>=1.0;});});
  if(best){taken.push(best.position);self.claim(s,best.position);}return {soldier:s,slot:best||null};});
};

/* ===== Milestone 4: individual auto-cover (new AI glue). When a friendly soldier knows a threat (seen, heard or reported),
   it re-scores nearby cover spots from this.candidates (Editor, kit and generated town cover) and picks its own:
   hidden from known threats (crouched eye 1.12 m), clear firing line (standing eye 1.62 m), a safe straight route (not
   through zombies, not running at an enemy), not reserved by / crowding a teammate; against zombies it also favours
   firing lanes and avoids being surrounded (zombies on all sides) or cornered (few escape directions on the navmesh).
   Hysteresis: the current spot gets a bonus, a new spot must beat it by AUTO.margin, and a soldier stays AUTO.dwell s.
   Cost: one soldier job at a time, AUTO.perFrame candidates per frame (<= perFrame*threats*2 rays), each soldier at most
   once per AUTO.recheck s. No RNG. Off with ?ai=0. Reasons are kept on s.coverWhy for the debug inspector. */
TacticalCover.AUTO={exposeR:45,lean:false,radius:14,wideRadius:26,wideCand:28,maxCand:16,soldierThreats:3,maxThreats:5,perFrame:3,recheck:1.0,dwell:4,margin:10,mate:2.0,zSpot:4,zRoute:2.5,surround:20};
TacticalCover.prototype.update=function(dt){var C=TacticalCommon,T=C.ns(this.app);if(T.trainingMode)return;/* AI-MERGE (SQD-RANGE): the training range owns short-distance cover assignments; never auto-replan them. */if(!C.AI.on||!T.ready||!T.running||T.paused||T.outcome)return;
 if(this.autoT0!==undefined&&T.elapsed<this.autoT0){this.job=null;this.autoRR=0;}this.autoT0=T.elapsed;/* game reset: drop a stale job */
 var t0=performance.now();this.autoTick(T.elapsed);var ms=performance.now()-t0;var st=this.autoStats||(this.autoStats={frames:0,maxMs:0,totalMs:0,jobs:0,moves:0,stays:0,rays:0});st.frames++;st.totalMs+=ms;if(ms>st.maxMs)st.maxMs=ms;};
TacticalCover.segDist=function(a,b,p){var dx=b[0]-a[0],dz=b[2]-a[2],L2=dx*dx+dz*dz,t=L2>0?((p[0]-a[0])*dx+(p[2]-a[2])*dz)/L2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(a[0]+dx*t-p[0],a[2]+dz*t-p[2]);};
TacticalCover.prototype.autoEligible=function(s){var o=s.order;if(!s.alive||s.team!=='friendly'||s.controlled||s.disabled)return false;
 if(s.path.length&&!(o&&o.by==='auto'))return false;if(s.path.length)return false;
 if(o){if(o.type==='brain'&&!o.autoCover)return false;if(o.type==='assault'||o.type==='hunt'||o.type==='follow')return false;if(o.by==='fallback'||o.by==='resupply')return false;if(o.by==='player'&&(o.type==='cover'||o.type==='move'))return false;if(o.by==='strategy'){var TS=TacticalCommon.ns(this.app).strategy;if(!(TS&&TS.contact&&TS.contact(s.team,[s],TacticalCommon.ns(this.app).elapsed)))return false;}/* Task 8: a strategy formation / hold slot is kept until contact, then auto cover takes over */if(o.by==='doctrine'&&o.type==='cover'&&TacticalCommon.ns(this.app).elapsed<(o.until||0))return false;/* M6: a flank position is held ~10 s, then auto cover resumes *//* M5b: never override a direct player order */}
 return true;};
TacticalCover.prototype.autoTick=function(now){var T=TacticalCommon.ns(this.app),A=TacticalCover.AUTO,self=this;
 if(this.job){var j=this.job;if(!j.s.alive||j.version!==T.navigation.version||j.order!==j.s.order||T.navigation.building||!this.autoEligible(j.s)){this.job=null;return;}var n=0;while(j.i<j.queue.length&&n<A.perFrame){this.autoEval(j,j.queue[j.i]);j.i++;n++;}if(j.i>=j.queue.length){this.job=this.autoFinish(j,now)||null;}return;}
 var fr=T.squad.filter(function(s){return s.team==='friendly';});if(!fr.length)return;
 for(var k=0;k<fr.length;k++){var idx=((this.autoRR||0)+k)%fr.length,s=fr[idx];if(now<(s.acNext||-1)&&s.acNextT0<=now)continue;if(!this.autoEligible(s))continue;
  this.autoRR=idx+1;s.acNext=now+A.recheck;s.acNextT0=now;var j2=this.autoStart(s,now);if(j2)this.job=j2;return;}};
TacticalCover.prototype.autoStart=function(s,now,wide){var T=TacticalCommon.ns(this.app),P=T.perception,A=TacticalCover.AUTO,self=this,me=s.pos(),o=s.order;
 var known=P.known(s,true).filter(function(r){return r.entity.alive&&!r.dead;}),d=function(p){return Math.hypot(p[0]-me[0],p[2]-me[2]);};
 var sol=known.filter(function(r){return !r.entity.isZombie;}).map(function(r){return r.lastSensedPosition;}).sort(function(a,b){return d(a)-d(b);}),zom=known.filter(function(r){return r.entity.isZombie;}).map(function(r){return r.lastSensedPosition;}).sort(function(a,b){return d(a)-d(b);});
 if(sol.length&&d(sol[0])>90&&(!zom.length||d(zom[0])>40)){s.coverWhy={t:now,decision:'calm',text:'threats far away'};return null;}
 var thS=sol.slice(0,A.soldierThreats),thZ=zom.filter(function(z){return d(z)<45;}).slice(0,Math.max(2,A.maxThreats-thS.length));
 var anchor=(o&&o.autoCover&&(o.anchor||o.dest))?(o.anchor||o.dest):(o&&o.by==='player'&&o.type==='move'&&o.dest)?o.dest:me,zNear=zom.filter(function(z){return Math.hypot(z[0]-anchor[0],z[2]-anchor[2])<A.surround+A.radius;});
 var mates=T.squad.filter(function(m){return m!==s&&m.alive&&m.team===s.team;});
 var cur=(s.inCover&&s.acSpot&&Math.hypot(s.acSpot[0]-me[0],s.acSpot[2]-me[2])<1.0)?s.acSpot:null;
 var R=wide?A.wideRadius:A.radius;if(o&&o.autoCover&&o.area)R=Math.min(R,o.area+2);var list=this.usable().filter(function(c){return Math.hypot(c.position[0]-anchor[0],c.position[2]-anchor[2])<=R;}).sort(function(a,b){return d(a.position)-d(b.position);}).filter(function(c){return !wide||d(c.position)>A.radius*0.7;}).slice(0,wide?A.wideCand:A.maxCand);
 /* M5b: expected threat directions - enemy posts whose soldier is not located yet (the squad's intel). A spot must hide from them too. */
 var knownE=new Set(known.map(function(r){return r.entity;})),thX=[];(T.spawnPoints||[]).forEach(function(sp){if(sp.team===s.team||!sp.position)return;var e=T.squad.find(function(q){return q.soldierName===sp.name;});if(!e||!e.alive||e.disabled||knownE.has(e))return;thX.push([sp.position[0],sp.position[1]+1.4,sp.position[2]]);});
 if(!known.length&&!thX.length){s.coverWhy={t:now,decision:'calm',text:'no known threat'};return null;}/* M6: with no located enemy, enemy posts still count (an exposed spot is left) */
 var job={version:T.navigation.version,order:s.order,wide:!!wide,R:R,s:s,t:now,me:me,thX:thX.concat(sol.slice(A.soldierThreats).map(function(p){return [p[0],p[1]+1.4,p[2]];})),thS:thS.map(function(p){return [p[0],p[1]+1.4,p[2]];}),thZ:thZ.map(function(p){return [p[0],p[1]+1.0,p[2]];}),zNear:zNear,queue:[],i:0,evals:[],rej:{},rejEx:[],cur:cur,sol:thS,zom:thZ};
 var reject=function(c,why){job.rej[why.split(' (')[0]]=(job.rej[why.split(' (')[0]]||0)+1;if(job.rejEx.length<6)job.rejEx.push({source:c.source,position:c.position,why:why});};
 list.forEach(function(c){var p=c.position,isCur=cur&&Math.hypot(cur[0]-p[0],cur[2]-p[2])<0.3;
  var who=self.claimedBy(p,s);if(who){reject(c,'reserved (by '+who.soldierName+')');return;}
  var crowd=mates.find(function(m){var a=m.pos(),g=m.goal||a;return Math.hypot(a[0]-p[0],a[2]-p[2])<A.mate||Math.hypot(g[0]-p[0],g[2]-p[2])<A.mate;});if(crowd&&!isCur){reject(c,'too close to a teammate ('+crowd.soldierName+')');return;}
  if(zNear.some(function(z){return Math.hypot(z[0]-p[0],z[2]-p[2])<A.zSpot;})){reject(c,'zombies at the spot');return;}
  if(!isCur){if(zNear.some(function(z){return d(z)>A.zRoute&&TacticalCover.segDist(me,p,z)<A.zRoute;})){reject(c,'route through zombies');return;}
   if(thS.some(function(t){return TacticalCover.segDist(me,p,t)<Math.min(d(t),Math.hypot(t[0]-p[0],t[2]-p[2]))-3;})){reject(c,'route runs at the enemy');return;}}
  job.queue.push({c:c,cur:!!isCur});});
 this.autoStats&&this.autoStats.jobs++;return job;};
TacticalCover.prototype.escapes=function(c){if(c._esc!==undefined&&c._escV===this.candidates)return c._esc;var T=TacticalCommon.ns(this.app),p=c.position,n=0;
 [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(v){var q=[p[0]+v[0]*3,p[1],p[2]+v[1]*3],r=T.navigation.nearest(q,{x:0.6,y:1,z:0.6});if(r&&Math.hypot(r[0]-q[0],r[2]-q[2])<0.8)n++;});c._esc=n;c._escV=this.candidates;return n;};
TacticalCover.prototype.autoEval=function(j,it){var P=TacticalCommon.ns(this.app).perception,A=TacticalCover.AUTO,c=it.c,p=c.position,ce=[p[0],p[1]+1.12,p[2]],se=[p[0],p[1]+1.62,p[2]],st=this.autoStats;
 var hidS=0,fireS=0,hidZ=0,lanes=0,fireZ=0;
 var n=c.normal||[0,0,1],tg=[-n[2],0,n[0]],eyes=A.lean?[se,[se[0]+tg[0]*0.7,se[1],se[2]+tg[2]*0.7],[se[0]-tg[0]*0.7,se[1],se[2]-tg[2]*0.7]]:[se];/* standing eye (lean variant off: soldiers do not lean yet) */
 var canFire=function(t){var hd=[t[0],t[1]+0.4,t[2]];for(var e=0;e<eyes.length;e++){if(st)st.rays+=2;if(!P.blocked(eyes[e],t)||!P.blocked(eyes[e],hd))return true;}return false;};
 var expo=null;j.thS.forEach(function(t){var h=P.blocked(ce,t);if(h)hidS++;else if(!expo&&Math.hypot(t[0]-p[0],t[2]-p[2])<A.exposeR)expo='a known enemy';if(st)st.rays++;if(canFire(t))fireS++;});
 if(!expo)j.thX.forEach(function(t){if(expo||Math.hypot(t[0]-p[0],t[2]-p[2])>=A.exposeR)return;if(st)st.rays++;if(!P.blocked(ce,t))expo='an expected enemy post';});
 if(expo&&!it.cur){var k0='exposed to '+expo;j.rej[k0]=(j.rej[k0]||0)+1;if(j.rejEx.length<6)j.rejEx.push({source:c.source,position:p,why:k0});return;}
 j.thZ.forEach(function(t){if(P.blocked(ce,t))hidZ++;if(st)st.rays++;if(canFire(t)){fireZ++;if(Math.hypot(t[0]-p[0],t[2]-p[2])>=6)lanes++;}});
 var fire=fireS+fireZ,dist=Math.hypot(p[0]-j.me[0],p[2]-j.me[2]);
 if(!j.thS.length&&!j.thZ.length)j.thX.forEach(function(t){if(fire<3&&Math.hypot(t[0]-p[0],t[2]-p[2])<A.exposeR*1.5&&canFire(t))fire++;});/* M6: nobody located - firing lines on the enemy posts */
 var blind=!fire&&!expo&&!j.thZ.length&&hidS===j.thS.length;/* M5b: a fully hidden spot with no firing line is a last resort, better than staying exposed */
 if(!fire&&!blind){var k='no firing line';j.rej[k]=(j.rej[k]||0)+1;if(j.rejEx.length<6)j.rejEx.push({source:c.source,position:p,why:k});return;}
 var surrounded=false;if(j.zNear.length>=3){var near=j.zNear.filter(function(z){return Math.hypot(z[0]-p[0],z[2]-p[2])<A.surround;});if(near.length>=3){var ang=near.map(function(z){return Math.atan2(z[2]-p[2],z[0]-p[0]);}).sort(function(a,b){return a-b;}),gap=0;for(var i=0;i<ang.length;i++){var g=(i+1<ang.length?ang[i+1]:ang[0]+2*Math.PI)-ang[i];if(g>gap)gap=g;}surrounded=gap<Math.PI*0.8;}}
 var esc=j.thZ.length?this.escapes(c):4,cornered=esc<=1;
 var hidPart=j.thS.length?40*hidS/j.thS.length:12*(j.thZ.length?hidZ/j.thZ.length:1);
 var parts={hidden:+(j.thS.length?hidS/j.thS.length:hidZ/Math.max(1,j.thZ.length)).toFixed(2),fire:fire,lanes:lanes,surrounded:surrounded,escapes:esc,dist:+dist.toFixed(1),current:it.cur,exposed:!!expo};
 var score=hidPart+20+3*Math.min(fire,3)+(j.thZ.length?5*Math.min(lanes,3):0)-(surrounded?25:0)-(cornered?15:0)-0.9*dist+(it.cur&&!blind?12:0)+(c.kind==='coverTall'&&hidS?3:0)-(expo?35:0)-(blind?25:0);/* M5b: current spot now exposed - leave it if anything safer exists */
 j.evals.push({c:c,score:+score.toFixed(1),parts:parts,cur:it.cur});};
TacticalCover.prototype.autoFinish=function(j,now){var C=TacticalCommon,T=C.ns(this.app),A=TacticalCover.AUTO,s=j.s,st=this.autoStats;
 var ev=j.evals.slice().sort(function(a,b){return b.score-a.score||(a.parts.dist-b.parts.dist);}),best=ev[0],cur=ev.find(function(e){return e.cur;});
 var why={t:+now.toFixed(2),threats:{soldiers:j.thS.length,zombies:j.thZ.length},considered:j.queue.length+Object.keys(j.rej).reduce(function(a,k){return a+j.rej[k];},0),rejected:j.rej,rejectedEx:j.rejEx,top:ev.slice(0,3).map(function(e){return {source:e.c.source,score:e.score,parts:e.parts};})};
 var tc=j.sol.length?j.sol[0]:(j.zom.length?j.zom[0]:null);
 if(!best){if(!j.wide&&!cur&&!(s.order&&s.order.autoCover)){var nj=this.autoStart(s,now,true);if(nj){nj.prevRej=j.rej;return nj;}}why.decision=cur?'stay':'none';why.text=cur?'no better spot':'no usable cover within '+j.R+' m';s.coverWhy=why;if(st)st.stays++;return;}
 if(cur&&(best===cur||(cur.parts.fire>0&&!cur.parts.exposed&&(best.score<cur.score+A.margin||now<(s.acDwellUntil||-1))))){why.decision='stay';why.picked={source:cur.c.source,score:cur.score,parts:cur.parts};why.text=best===cur?'current spot is still the best':now<(s.acDwellUntil||-1)?'dwell time':'best alternative not better by '+A.margin;s.coverWhy=why;if(st)st.stays++;
  if(tc&&s.order)s.order.face=tc;return;}
 if(best.score<0&&!cur&&s.inCover){why.decision='stay';why.text='already in cover, nothing scores above 0';s.coverWhy=why;return;}
 var p=best.c.position;this.release(s);this.claim(s,p);s.chosenCover={position:p,source:best.c.source,kind:best.c.kind,crouched:best.parts.hidden>=1,score:best.score};
 s.hold=false;s.inCover=false;var ob=s.order;s.order=(ob&&ob.type==='brain'&&ob.autoCover)?{type:'brain',brain:ob.brain,bid:ob.bid,step:ob.step,autoCover:true,anchor:ob.anchor,area:ob.area,dest:p,face:tc,source:best.c.source,arrived:false,by:'brain'}:{type:'cover',dest:p,face:tc,source:best.c.source,by:'auto'};
 var txt='Auto cover: '+best.c.source+' (hidden '+Math.round(best.parts.hidden*100)+'%, '+best.parts.fire+' firing line'+(best.parts.fire>1?'s':'')+(j.thZ.length?', '+best.parts.lanes+' lane'+(best.parts.lanes===1?'':'s'):'')+')';
 if(!s.moveTo(p,txt)){why.decision='none';why.text='no route to '+best.c.source;this.release(s);s.coverWhy=why;return;}
 s.acSpot=p;s.acDwellUntil=now+A.dwell+best.parts.dist/3;s.acMoves=(s.acMoves||0)+1;why.decision='move';why.picked={source:best.c.source,score:best.score,parts:best.parts,position:p};why.text=txt;s.coverWhy=why;if(st)st.moves++;};
