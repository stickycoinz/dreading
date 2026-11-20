/* DREADING RTS commands + RTS visibility (2026-11-19, additive; does not modify tactical-rts-input.js).
   Hooks the existing TacticalRtsInput instance (onDown/onUp/onKey) and T.orders, so every order still goes through
   T.orders.* - on a guest that is multiplayer-battle.js' host-authoritative wrapper, exactly like a normal right-click.
   - Shift + right-click: queue move waypoints (white rings + lines). A plain order replaces the queue.
   - R (rebindable "Attack-move" in Settings > RTS), then left-click: attack-move - the group walks to the point and stops
     to fight anything hostile that comes within range, then carries on. Ctrl + right-click does the same in one click.
     Shift while clicking queues the attack-move after the current waypoints.
   - Double-click a soldier: select every soldier of that type on screen (squads expand as usual).
   - Ctrl+1..5 save a group (existing), 1..5 recall (existing); pressing the same number twice quickly centres the camera.
   - Every player order: ground ping at the target + a brief flash on the ordered squads' cards.
   - RTS visibility at night (RTS camera only; first person untouched): lifts the existing sky/environment light and the
     existing moon light (no new lights, moon still shadowless), slightly brighter grading, less RTS fog and vignette
     (DreadingVisuals' rts* multipliers, only while they are still at their shipped defaults), bright rings
     under own soldiers, and red/orange markers on enemies/zombies within sight range of your soldiers.
   Cost: hostile-in-sight list rebuilt 5x/s (distance only, no rays), queue/attack-move logic 5x/s, a few hundred
   immediate lines per frame in RTS. No lights, no per-frame zombie scans, no spawning changes. */
(function(){'use strict';
const CFG={dblMs:380,dblPx:14,tapMs:420,tick:200,sight:34,engage:24,disengage:34,engageMax:14,arriveR:4,stillMove:.12,stillS:2.2,minRun:1.2,ping:950,
 vis:{rtsBrightness:1.15,rtsFog:.12,vignette:.12,skyMul:11,sunMul:3.6,contrast:.95},visDefaults:{rtsBrightness:1,rtsFog:.35}};
const R=window.DreadingRtsCommands={cfg:CFG,ready:false,records:[],pings:[],seen:[],am:null,visOn:true,stats:{queued:0,attackMoves:0,engages:0,dbl:0,recallCenter:0,groupsSaved:0,pings:0,flashes:0,uiOrders:0}};
let T,I,app,canvas,N=null,internal=0,uiDepth=0,ui=false,uiReset=0,lastClick=null,lastDigit=null,tickT=0,badge=null;
const css=document.createElement('style');css.textContent=
'#tlh-cards .cd.drc-flash{animation:drcFlash .55s ease-out}@keyframes drcFlash{0%{box-shadow:0 0 0 2px #c6e600,inset 0 0 22px rgba(198,230,0,.55);filter:brightness(1.6)}100%{box-shadow:0 0 0 0 rgba(198,230,0,0);filter:none}}'+
'#drc-am{position:fixed;left:50%;top:92px;transform:translateX(-50%);z-index:46;pointer-events:none;font:600 11px/1 var(--tlh-font-mono,monospace);letter-spacing:.14em;color:#ffb39a;background:rgba(40,8,4,.82);border:1px solid rgba(255,120,90,.6);padding:5px 10px;display:none}';
document.head.appendChild(css);
const V3=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const now=()=>performance.now();
function mine(s){return s&&s.alive&&!s.disabled&&s.team==='friendly';}
function selection(){return (T.selection||[]).filter(s=>mine(s)&&!s.controlled);}
function centroid(list){const c=[0,0,0];list.forEach(s=>{const p=s.pos();c[0]+=p[0]/list.length;c[1]+=p[1]/list.length;c[2]+=p[2]/list.length;});return c;}
function commanding(){if(!T||!T.ready||!I||I.fps)return false;if(N&&N.slot===2)return false;if(window.DreadingMPPrep&&DreadingMPPrep.canPlay&&!DreadingMPPrep.canPlay())return false;return true;}
function canvasXY(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
/* ---------- feedback ---------- */
function ping(p,kind){if(!p)return;R.pings.push({p:p.slice(),kind,t:now()});if(R.pings.length>12)R.pings.shift();R.stats.pings++;}
function flashCards(members){const H=T.hud;if(!H||!H.friendlies||!members||!members.length)return;const list=H.friendlies();const seen=new Set();
 members.forEach(s=>{const i=list.indexOf(s);if(i<0||seen.has(i))return;seen.add(i);const el=document.querySelector('#tlh-cards .cd[data-i="'+i+'"]');if(!el)return;el.classList.remove('drc-flash');void el.offsetWidth;el.classList.add('drc-flash');clearTimeout(el._drcT);el._drcT=setTimeout(()=>el.classList.remove('drc-flash'),600);});
 if(seen.size)R.stats.flashes++;}
/* ---------- order bookkeeping: player orders replace queues; AI/internal calls are ignored ---------- */
function dropMembers(group){if(!group||!group.length)return;R.records.forEach(r=>{r.members=r.members.filter(s=>group.indexOf(s)<0);});R.records=R.records.filter(r=>r.members.length);}
function orderPoint(method,args){try{if(method==='moveGroup')return args[1];if(method==='takeCover')return args[2]||null;if(method==='focusFire')return args[1]&&args[1].pos?args[1].pos():null;
 if(method==='startBrain'){const o=args[2]||{};if(o.point)return o.point;if(o.building!=null&&T.orders.buildingFloors){const F=T.orders.buildingFloors(o.building);if(F&&F.rect){const r=F.rect;return [(r[0]+r[2])/2,(o.floorY||0),(r[1]+r[3])/2];}}}}catch(e){}return null;}
function wrapOrders(){const O=T.orders;if(!O||O._drcWrapped)return;O._drcWrapped=true;
 ['moveGroup','takeCover','startBrain','focusFire','startHunt','startAssault'].forEach(m=>{const old=O[m];if(typeof old!=='function')return;
  O[m]=function(...args){const outer=ui&&!internal&&uiDepth===0;uiDepth++;let res;try{res=old.apply(this,args);}finally{uiDepth--;}
   if(outer){const group=args[m==='startBrain'?1:0];if(Array.isArray(group)&&group.some(mine)){R.stats.uiOrders++;if(m!=='focusFire')dropMembers(group);flashCards(group);const p=orderPoint(m,args);if(p)ping(p,m==='focusFire'?'focus':m==='startBrain'&&args[0]==='assault'?'attack':m==='takeCover'?'cover':'move');}}
   return res;};});}
function inInternal(fn){internal++;try{return fn();}finally{internal--;}}
/* ---------- queues / attack-move records ---------- */
function sameSet(a,b){return a.length===b.length&&a.every(s=>b.indexOf(s)>=0);}
function busy(members){/* still walking a previous order? (works on host and guest: position-based, order dest when known) */
 return members.some(s=>{const o=s.order;if(o&&o.dest&&!o.failed&&!o.arrived&&V3(s.pos(),o.dest)>2.2)return true;if(Array.isArray(s.path)&&s.index<s.path.length)return true;return (s.speedNow||0)>.6;});}
function startWp(rec,wp){rec.cur={p:wp.p.slice(),kind:wp.kind,t0:T.elapsed,engaged:null};rec.still=0;rec.lastC=centroid(rec.members);
 const live=rec.members.filter(s=>s.alive&&!s.controlled);if(!live.length)return;const out=inInternal(()=>T.orders.moveGroup(live,wp.p));
 R.lastIssue={t:+T.elapsed.toFixed(2),p:wp.p.map(v=>+v.toFixed(1)),kind:wp.kind,out:Array.isArray(out)?out.map(o=>({failed:!!o.failed,error:o.error||null,dest:o.dest&&o.dest.map(v=>+v.toFixed(1))})):null};}
function addOrder(members,p,kind,queue){members=members.filter(s=>mine(s)&&!s.controlled);if(!members.length||!p)return null;
 let rec=R.records.find(r=>sameSet(r.members,members));
 if(!queue){dropMembers(members);rec=null;}
 if(queue&&rec){rec.wps.push({p:p.slice(),kind});R.stats.queued++;ping(p,'queue');flashCards(members);return rec;}
 if(queue){dropMembers(members);}
 rec={id:Math.random().toString(36).slice(2,8),members:members.slice(),wps:[],cur:null,still:0,lastC:centroid(members)};R.records.push(rec);
 if(queue&&busy(members)){/* the current (unqueued) order finishes first */const d=members.map(s=>s.order&&s.order.dest).filter(Boolean);rec.cur={p:d.length?centroid(d.map(q=>({pos:()=>q}))):centroid(members),kind:'existing',t0:T.elapsed,engaged:null};rec.wps.push({p:p.slice(),kind});R.stats.queued++;ping(p,'queue');}
 else{startWp(rec,{p,kind});if(queue)R.stats.queued++;ping(p,kind==='attack'?'attack':queue?'queue':'move');}
 if(kind==='attack')R.stats.attackMoves++;flashCards(members);return rec;}
function hostilesNear(c,r){let best=null,bd=r;const consider=e=>{if(!e||!e.alive||e.disabled)return;if(e.entity&&e.entity.enabled===false)return;const d=V3(e.pos(),c);if(d<bd){bd=d;best=e;}};
 (T.squad||[]).forEach(s=>{if(s.team!=='friendly')consider(s);});(T.zombies||[]).forEach(consider);return best;}
function tickRecords(){const t=T.elapsed;
 R.records=R.records.filter(rec=>{rec.members=rec.members.filter(s=>s.alive&&!s.disabled);if(!rec.members.length)return false;
  const live=rec.members.filter(s=>!s.controlled);if(!live.length)return true;const c=centroid(live);
  const moved=rec.lastC?V3(c,rec.lastC):1;rec.lastC=c;rec.still=moved<CFG.stillMove?rec.still+CFG.tick/1000:0;
  const cur=rec.cur;
  if(cur&&cur.kind==='attack'){
   if(cur.engaged){const e=cur.engaged;if(!e.alive||e.disabled||V3(e.pos(),c)>CFG.disengage||t-cur.engT>CFG.engageMax){cur.engaged=null;cur.t0=t;rec.still=0;inInternal(()=>T.orders.moveGroup(live,cur.p));}return true;}
   const foe=hostilesNear(c,CFG.engage);if(foe){cur.engaged=foe;cur.engT=t;R.stats.engages++;inInternal(()=>{T.orders.focusFire(live,foe,'attack-move');T.orders.moveGroup(live,c);});return true;}}
  if(cur){/* arrived: most members at their own (formation) destination, or the group centre close to the waypoint, or stopped */
   let withDest=0,at=0;live.forEach(s=>{const o=s.order;if(o&&o.type==='move'&&o.dest&&V3(o.dest,cur.p)<10){withDest++;if(V3(s.pos(),o.dest)<1.8)at++;}});
   const arrived=(withDest>0&&at>=Math.ceil(withDest*.75))||V3(c,cur.p)<CFG.arriveR*.6+.5*Math.sqrt(live.length-1)||(t-cur.t0>CFG.minRun&&rec.still>=CFG.stillS);if(arrived)rec.cur=null;}
  if(!rec.cur&&rec.wps.length){startWp(rec,rec.wps.shift());return true;}
  return !!rec.cur;});}
/* ---------- input hooks ---------- */
function armAM(on){R.am=on?{t:now()}:null;if(!badge){badge=document.createElement('div');badge.id='drc-am';badge.textContent='ATTACK-MOVE \u00b7 LEFT-CLICK TARGET \u00b7 SHIFT QUEUE \u00b7 ESC / RMB CANCEL';document.body.appendChild(badge);}
 badge.style.display=on?'block':'none';canvas.style.cursor=on?'crosshair':'';}
R.cancelTargetMode=()=>armAM(false);
/* 'type' = soldier class, the same grouping the squad list uses (Scavenger, Marksman, Bazooka soldier...) */
function typeKey(s){const k=s.prepKit||{};return String(k.cls||s.role||'unit').toUpperCase();}
function onScreen(s){const v=I.screen(s),r=canvas.getBoundingClientRect();return v.z>0&&v.x>=0&&v.y>=0&&v.x<=r.width&&v.y<=r.height;}
function selectType(s){const key=typeKey(s),list=I.friendlies().filter(o=>!o.disabled&&typeKey(o)===key&&onScreen(o));I.select(list,false);R.stats.dbl++;
 I.toast('Selected all '+key.toLowerCase()+' on screen ('+(T.selection||[]).length+')');flashCards(T.selection||[]);}
function attackAt(x,y,queue){const sel=selection();if(!sel.length){I.toast('Select soldiers first');return null;}
 const foe=I.pickHostile(x,y);if(foe&&!queue){dropMembers(sel);inInternal(()=>T.orders.focusFire(sel,foe,'attack-move'));ping(foe.pos(),'focus');flashCards(sel);R.stats.attackMoves++;return {focus:foe};}
 const hit=I.pickWorld(x,y);if(!hit){I.toast('Point at the ground');return null;}const rec=addOrder(sel,hit.point,'attack',queue);
 I.toast((queue?'Queued attack-move':'Attack-move')+' - '+sel.length+' soldier'+(sel.length>1?'s':''));return rec;}
function queueAt(x,y){const sel=selection();if(!sel.length)return null;const hit=I.pickWorld(x,y);if(!hit)return null;const rec=addOrder(sel,hit.point,'move',true);
 if(rec)I.toast('Waypoint '+((rec.cur&&rec.cur.kind!=='existing'?1:1)+rec.wps.length)+' queued - '+sel.length+' soldier'+(sel.length>1?'s':''));return rec;}
function hookInput(){if(I._drcHooked)return;I._drcHooked=true;const oDown=I.onDown,oUp=I.onUp,oKey=I.onKey;
 I.onDown=function(e){if(!this.fps&&e.button===0&&e.ctrlKey&&commanding()){e.preventDefault();this.drag=null;const [x,y]=canvasXY(e);attackAt(x,y,e.shiftKey);return;}if(!this.fps&&R.am&&commanding()){if(e.button===0){e.preventDefault();const [x,y]=canvasXY(e);attackAt(x,y,e.shiftKey);if(!e.shiftKey)armAM(false);return;}if(e.button===2){e.preventDefault();armAM(false);I.toast('Attack-move cancelled');return;}}
  return oDown.call(this,e);};
 I.onUp=function(e){const d=this.drag;
  if(!this.fps&&d&&d.button===2&&e.button===2&&!d.moved&&now()-d.t<400&&commanding()&&selection().length&&(e.ctrlKey||d.shift||e.shiftKey)){
   const foe=this.pickHostile(d.x0,d.y0);
   if(e.ctrlKey){this.drag=null;attackAt(d.x0,d.y0,!!(d.shift||e.shiftKey));return;}
   if(!foe){this.drag=null;queueAt(d.x0,d.y0);return;}}
  const r=oUp.call(this,e);
  if(!this.fps&&d&&d.button===0&&e.button===0&&!d.moved&&!d.alt&&commanding()){const s=this.pickSoldier(d.x0,d.y0),t=now();
   if(s&&lastClick&&t-lastClick.t<CFG.dblMs&&Math.hypot(d.x0-lastClick.x,d.y0-lastClick.y)<CFG.dblPx&&typeKey(lastClick.s)===typeKey(s)){lastClick=null;selectType(s);}
   else lastClick=s?{t,x:d.x0,y:d.y0,s}:null;}
  return r;};
 I.onKey=function(e){const k=e.code;
  if(!this.fps&&!this.floorPick&&commanding()){
   if(k==='Escape'&&R.am){armAM(false);return;}
   if(k==='KeyR'&&!e.repeat&&!e.ctrlKey&&!e.altKey){if(!selection().length){this.toast('Select soldiers, then R + left-click to attack-move');return;}armAM(true);return;}
   if(/^Digit[1-9]$/.test(k)&&!e.altKey){const n=k.slice(5),r=oKey.call(this,e);
    if(e.ctrlKey){R.stats.groupsSaved++;this.toast('Group '+n+' saved ('+((this.groups||{})[n]||[]).length+') \u00b7 press '+n+' to recall, '+n+' '+n+' to centre');}
    else if(!e.repeat&&!e.shiftKey){const t=now();if(lastDigit&&lastDigit.k===k&&t-lastDigit.t<CFG.tapMs){lastDigit=null;if((T.selection||[]).length){this.frame();R.stats.recallCenter++;}}else lastDigit={k,t};flashCards(T.selection||[]);}
    return r;}}
  return oKey.call(this,e);};}
/* ---------- RTS visibility ---------- */
/* Night RTS only. Scene ambientLight is ignored here (the map is lit by the environment atlas), so the RTS lift comes from the
   existing environment/sky intensity and the existing moon (directional, no shadows at night) - no new lights. */
function nightRts(L){return R.visOn&&!!(window.DreadingNight&&DreadingNight.enabled)&&L&&L.mode==='rts';}
function visApply(){const V=window.DreadingVisuals,L=window.DreadingLook;if(!V||!V.settings)return;const s=V.settings,D=CFG.visDefaults,B=CFG.vis,on=R.visOn&&!!(window.DreadingNight&&DreadingNight.enabled);
 for(const k of ['rtsBrightness','rtsFog']){if(on){if(s[k]===D[k]){s[k]=B[k];R._visSet=R._visSet||{};R._visSet[k]=true;}}else if(R._visSet&&R._visSet[k]&&s[k]===B[k]){s[k]=D[k];delete R._visSet[k];}}
 try{V.apply();if(L&&L.cf)L.cf.update();}catch(e){}}
function wrapVisuals(){const V=window.DreadingVisuals;if(!V||V._drcWrapped)return;V._drcWrapped=true;const old=V.apply,oldScene=V.scene;
 V.apply=function(){const r=old.apply(this,arguments);try{const L=window.DreadingLook,vg=document.querySelector('#dreading-cctv')?.firstChild;if(nightRts(L)){if(vg)vg.style.opacity=Math.min(V.settings.vignette,CFG.vis.vignette);if(L.cf){L.cf.grading.contrast=V.settings.contrast*CFG.vis.contrast;}}}catch(e){}return r;};
 /* V.scene runs every frame (DreadingNight.shadows -> configure): re-assert the RTS lift after it, FP keeps the original values */
 /* Feed the boosted values INTO the original call (no write-then-overwrite each frame: a changing skyboxIntensity rebuilds the
    sky mesh in PlayCanvas, which cost ~30 ms/frame when it flip-flopped). Settings are restored right after the call. */
 V.scene=function(L){if(!nightRts(L))return oldScene.apply(this,arguments);const s=V.settings,sky0=s.sky,sun0=s.sun;
  s.sky=Math.min(2,sky0*CFG.vis.skyMul);s.sun=Math.min(3,sun0*CFG.vis.sunMul);try{return oldScene.apply(this,arguments);}finally{s.sky=sky0;s.sun=sun0;}};}
R.setVisibility=function(on){R.visOn=!!on;visApply();return R.visOn;};
function rebuildSeen(){const own=I.friendlies().filter(s=>!s.disabled);const out=[];if(!own.length){R.seen=out;return;}const P=own.map(s=>s.pos()),r=CFG.sight;
 const test=(e,kind)=>{if(!e||!e.alive||e.disabled)return;if(e.entity&&e.entity.enabled===false)return;const p=e.pos();for(let i=0;i<P.length;i++){if(Math.abs(P[i][0]-p[0])<r&&Math.abs(P[i][2]-p[2])<r&&V3(P[i],p)<r){out.push({e,kind});return;}}};
 (T.squad||[]).forEach(s=>{if(s.team!=='friendly')test(s,'enemy');});(T.zombies||[]).forEach(z=>test(z,'zombie'));R.seen=out;}
/* ---------- drawing (RTS only) ---------- */
const A=new pc.Vec3(),B2=new pc.Vec3();
const COL={own:new pc.Color(.35,1,.75),ownSel:new pc.Color(.7,1,.4),enemy:new pc.Color(1,.2,.15),zombie:new pc.Color(1,.6,.1),move:new pc.Color(.45,1,.6),queue:new pc.Color(.85,.95,1),attack:new pc.Color(1,.42,.25),focus:new pc.Color(1,.2,.2),cover:new pc.Color(.4,.8,1),line:new pc.Color(.75,.9,1),aline:new pc.Color(1,.5,.3)};
function line(p,q,c){A.set(p[0],p[1],p[2]);B2.set(q[0],q[1],q[2]);app.drawLine(A,B2,c,false);}
function ring(p,r,c,n,y){n=n||14;y=(y||0)+.08;let px=p[0]+r,pz=p[2];for(let i=1;i<=n;i++){const a=i/n*Math.PI*2,x=p[0]+Math.cos(a)*r,z=p[2]+Math.sin(a)*r;A.set(px,p[1]+y,pz);B2.set(x,p[1]+y,z);app.drawLine(A,B2,c,false);px=x;pz=z;}}
function draw(){if(!commanding())return;
 const camY=I.cam&&I.cam.pos?I.cam.pos.y:30,sc=Math.max(.7,Math.min(2.4,camY*.022)),selSet=new Set(T.selection||[]);
 if(R.visOn){I.friendlies().forEach(s=>{if(s.disabled||s.controlled)return;const p=s.pos(),c=selSet.has(s)?COL.ownSel:COL.own;ring(p,.62*sc,c,12);if(sc>1.1)ring(p,.5*sc,c,10);});
  /* one pole per own squad so squads read from high up */
  if(camY>18){const done=new Set();I.friendlies().forEach(s=>{if(s.disabled||done.has(s.squadKey))return;done.add(s.squadKey);const p=s.pos(),h=2+camY*.05;line([p[0],p[1]+2,p[2]],[p[0],p[1]+h,p[2]],selSet.has(s)?COL.ownSel:COL.own);});}
  R.seen.forEach(o=>{const p=o.e.pos(),c=o.kind==='enemy'?COL.enemy:COL.zombie,r=(o.kind==='enemy'?.75:.6)*sc;ring(p,r,c,o.kind==='enemy'?4:8);if(o.kind==='enemy'||sc>1.2)line([p[0],p[1]+1.9,p[2]],[p[0],p[1]+1.9+sc*1.1,p[2]],c);});}
 R.records.forEach(rec=>{const live=rec.members.filter(s=>s.alive&&!s.controlled);if(!live.length)return;let prev=centroid(live);prev[1]+=.15;
  const pts=[];if(rec.cur&&rec.cur.kind!=='existing')pts.push(rec.cur);rec.wps.forEach(w=>pts.push(w));if(rec.cur&&rec.cur.kind==='existing')prev=[rec.cur.p[0],rec.cur.p[1]+.15,rec.cur.p[2]];
  pts.forEach((w,i)=>{const q=[w.p[0],w.p[1]+.15,w.p[2]],c=w.kind==='attack'?COL.aline:COL.line;line(prev,q,c);ring(w.p,.55+.1*i,c,12,.07);if(w.kind==='attack'){line([q[0]-.5,q[1],q[2]-.5],[q[0]+.5,q[1],q[2]+.5],c);line([q[0]-.5,q[1],q[2]+.5],[q[0]+.5,q[1],q[2]-.5],c);}prev=q;});});
 const t=now();R.pings=R.pings.filter(pg=>t-pg.t<CFG.ping);R.pings.forEach(pg=>{const k=(t-pg.t)/CFG.ping,c=COL[pg.kind]||COL.move;ring(pg.p,(.4+k*2.2)*Math.max(1,sc*.8),c,20);ring(pg.p,(.25+k*1.1)*Math.max(1,sc*.8),c,14);line([pg.p[0],pg.p[1]+.1,pg.p[2]],[pg.p[0],pg.p[1]+.1+(1-k)*4*Math.max(1,sc*.7),pg.p[2]],c);});}
function update(){if(!T||!T.ready)return;const t=now();if(t-tickT>=CFG.tick){tickT=t;try{if(!I.fps)rebuildSeen();if(R.records.length)tickRecords();if(R.am&&(I.fps||!selection().length))armAM(false);}catch(e){console.warn('[RTS commands]',e);}}
 try{draw();}catch(e){}}
function footer(){const f=document.getElementById('tlh-foot');if(f&&!f._drc){f._drc=true;f.textContent='RMB move \u00b7 Shift+RMB queue \u00b7 R attack-move \u00b7 Dbl-click type \u00b7 Ctrl+1-5 group (x2 centre) \u00b7 MMB orders \u00b7 G V X J \u00b7 T first person \u00b7 Tab soldier';}}
function boot(){const t=window.tactical;if(!t||!t.T||!t.T.ready||!t.T.input||!t.app||!t.T.orders){setTimeout(boot,500);return;}
 T=t.T;app=t.app;I=T.input;canvas=app.graphicsDevice.canvas;N=window.DreadingMultiplayer||null;
 wrapOrders();hookInput();wrapVisuals();visApply();footer();setTimeout(footer,3000);
 window.addEventListener('blur',()=>{if(R.am)armAM(false);});
 app.on('update',update);R.ready=true;}
R.bench=function(n){n=n||100;const t0=now();for(let i=0;i<n;i++)rebuildSeen();const t1=now();for(let i=0;i<n;i++)draw();const t2=now();return {seenMs:+((t1-t0)/n).toFixed(3),drawMs:+((t2-t1)/n).toFixed(3),seen:R.seen.length};};
R.state=function(){return {lastIssue:R.lastIssue||null,ready:R.ready,am:!!R.am,visOn:R.visOn,records:R.records.map(r=>({id:r.id,n:r.members.length,cur:r.cur&&{kind:r.cur.kind,p:r.cur.p.map(v=>+v.toFixed(1)),engaged:!!r.cur.engaged},wps:r.wps.map(w=>({kind:w.kind,p:w.p.map(v=>+v.toFixed(1))}))})),seen:R.seen.length,pings:R.pings.length,stats:{...R.stats}};};
/* ui flag: set while a real mouse/keyboard event is being handled (registered at load, before the game's own listeners;
   cleared on the next task), so AI / brain calls to T.orders never count as player orders. */
function uiOn(){ui=true;clearTimeout(uiReset);uiReset=setTimeout(()=>{ui=false;},0);}
for(const ev of ['mousedown','mouseup','click','keydown','pointerdown','pointerup'])window.addEventListener(ev,uiOn,true);
boot();
})();
