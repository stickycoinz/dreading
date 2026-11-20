/* DREADING SQD-RANGE 1.0 — standalone, flat, repeatable 1–4-member tactical exercises.
 * Enabled ONLY with ?training=1. Uses the game's real soldiers, Recast, perception,
 * zombie manager, weapons, cover and original building-clear behaviour tree.
 * No fake damage, artificial teleports during play, or replacement combat AI.
 */
(function(g){
 'use strict';
 const ENABLED=/[?&]training=1(?:&|$)/.test(location.search);
 const H={
  distance(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2]);},
  centroid(m){if(!m.length)return [0,0,0];const v=[0,0,0];m.forEach(s=>{const p=s.pos();v[0]+=p[0]/m.length;v[1]+=p[1]/m.length;v[2]+=p[2]/m.length;});return v;},
  // Screen/world-independent pattern. Forward points toward the objective.
  slots(n){return n>=4?[[1.8,0],[-1.1,-2],[-1.1,2],[-3.9,0]]:n===3?[[1.5,0],[-1.5,-2],[-1.5,2]]:n===2?[[1, -1.15],[-1,1.15]]:[[0,0]];},
  sectorOffsets(n){return n>=4?[0,Math.PI/2,-Math.PI/2,Math.PI]:n===3?[0,2*Math.PI/3,-2*Math.PI/3]:n===2?[0,Math.PI]:[0];},
  phaseWhenThreat(nearest,count){if(count<=0||nearest>20)return 'advance';if(nearest<=8||count>=4&&nearest<=17)return 'cover';return 'contact';},
  shouldResume(now,lastThreat,quietSeconds=5){return now-lastThreat>=quietSeconds;},
  routeOkay(path,a,b){if(!path||path.length<2)return false;let length=0;for(let k=1;k<path.length;k++)length+=Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1],path[k][2]-path[k-1][2]);return length<=Math.max(4,H.distance(a,b)*2.0+3);},
  nearShelter(candidate,origin,maxRetreat=12){return H.distance(candidate,origin)<=maxRetreat;},
  facing(p,q){return Math.atan2(-(q[0]-p[0]),-(q[2]-p[2]));},
  validPost(p,door){return H.distance(p,door)>=1.5;},
  targetPoints:[[-20,0,-11],[-8,0,-11],[4,0,-11],[11,0,-4],[17,0,-2]],
  start:[[-24,0,-12],[-25.8,0,-14],[-25.8,0,-10],[-28.5,0,-12]]
 };
 // Self-contained helpers for Node unit tests without PlayCanvas.
 if(typeof module!=='undefined'&&module.exports)module.exports=H;
 if(!ENABLED)return;
 const S={app:null,T:null,root:null,playing:false,n:4,scenario:'advance',phase:'idle',phaseT:0,elapsedStart:0,step:0,lastThreat:-1e9,
  safeSince:0,nextTick:0,waitSince:0,enemyAt:0,events:[],cleared:new Set(),metrics:{commands:0,rejected:0,cohesionHolds:0,contacts:0,fallBacks:0,resumed:0,losses:0,shots:0},
  posts:null,objects:[],marks:[],runtimes:[],trainingBuilding:null,spawned:false,failed:null,logIndex:0,preview:false};
 const $=id=>document.getElementById(id);
 function note(msg){const time=S.T?S.T.elapsed.toFixed(1):'0';S.events.push(time+'s '+msg);if(S.events.length>60)S.events.shift();const e=$('tr-log');if(e)e.textContent=S.events.slice(-5).join('\n');}
 function mat(rgb,opacity=1){const m=new pc.StandardMaterial();m.diffuse=new pc.Color(...rgb);m.emissive=new pc.Color(rgb[0]*.07,rgb[1]*.07,rgb[2]*.07);m.opacity=opacity;
  if(opacity<1){m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;}m.cull=pc.CULLFACE_NONE;m.update();return m;}
 let M;
 function block(name,xyz,scale,kind,material,visible=true){const e=new pc.Entity('TR | '+name);e.setPosition(...xyz);e.setLocalScale(...scale);
  if(visible)e.addComponent('render',{type:'box',material:material||M.wall,castShadows:kind!=='walkable',receiveShadows:true});
  if(kind){const aliases={walkable:'tactical:walkable',obstacle:'tactical:obstacle',coverLow:'tactical:coverLow',coverTall:'tactical:coverTall',decor:'tactical:decor'};e.tags.add(aliases[kind]||'tactical:decor');}
  S.root.addChild(e);S.objects.push(e);return e;}
 function floorSpot(name,x,z,rgb,r=1){const e=new pc.Entity('TR PAD '+name);e.addComponent('render',{type:'cylinder',material:mat(rgb,.34),castShadows:false,receiveShadows:false});e.setPosition(x,.036,z);e.setLocalScale(r*2,.04,r*2);S.root.addChild(e);S.marks.push(e);return e;}
 function hideEditorScene(T,C,app){
  // The original Editor markers and meshes remain in memory. This only disables
  // their rendering/navigation contribution in training mode, never in PLAY.bat.
  C.collect(app).forEach(t=>{if(!t.entity.enabled)return;let e=t.entity,rt=false;while(e){if(e===T.root){rt=true;break;}e=e.parent;}if(!rt)t.entity.enabled=false;});
  const editor=app.root.findByName('Soldier Preview');if(editor)editor.enabled=false;
  // Untagged editor art is excluded too; do not disable scripts/cameras or the runtime.
  app.root.forEach(e=>{let p=e,rt=false;while(p){if(p===T.root){rt=true;break;}p=p.parent;}
   if(!rt&&e.render)e.render.enabled=false;});
  C.invalidateMarkers();
 }
 function makeGround(){
  M={floor:mat([.28,.31,.30]),wall:mat([.58,.58,.52]),cover:mat([.42,.42,.38]),roof:mat([.19,.27,.27]),outline:mat([.12,.17,.18]),window:mat([.35,.48,.50])};
  block('FLOOR', [0,-.15,0],[130,.3,90],'walkable',M.floor);
  // A plain, single-storey roofless structure, real door and window gaps.
  const cx=20,cz=0,wallH=3.15,hY=wallH/2;
  block('NORTH WALL',[cx,hY,7],[16,wallH,.35],'obstacle',M.wall);
  block('SOUTH WALL',[cx,hY,-7],[16,wallH,.35],'obstacle',M.wall);
  block('WEST WALL LEFT',[12,hY,-4.65],[.35,wallH,4.7],'obstacle',M.wall);
  block('WEST WALL RIGHT',[12,hY,4.65],[.35,wallH,4.7],'obstacle',M.wall);
  // East window at z [-2,2]. Low sill blocks walkers but eye-level shooting is unobstructed.
  block('EAST WALL LOWER',[28,hY,-4.55],[.35,wallH,4.9],'obstacle',M.wall);
  block('EAST WALL UPPER',[28,hY,4.55],[.35,wallH,4.9],'obstacle',M.wall);
  block('EAST WINDOW SILL',[28,.42,0],[.35,.84,4.0],'coverLow',M.cover);
  block('EAST WINDOW LINTEL',[28,2.68,0],[.35,.93,4.0],'obstacle',M.wall);
  // Interior partial wall separates two checking positions without closing the whole building.
  block('INNER PARTITION',[20,1.3,-4.5],[.30,2.6,5.0],'obstacle',M.wall);
  // Cover banks and a short street barricade (different than a building).
  [[-15,-3,4.4,.8],[-5,-1,3,.9],[5,-9,4,.85],[8,9,3.2,.8],[4,-20,5,.85],[29,-14,4,.9]].forEach((v,i)=>block('COVER '+i,[v[0],v[3]/2,v[1]],[v[2],v[3],.9],'coverLow',M.cover));
  block('INTERIOR COVER',[23,.44,3],[2.6,.88,.8],'coverLow',M.cover);
  block('BARRICADE',[1,.8,18],[7,1.6,.9],'coverTall',M.wall);
  block('WALL ALLEY',[38,1.4,-12],[.35,2.8,15],'obstacle',M.wall);
  // Ground cues, deliberately not physical collisions.
  floorSpot('DEPLOY',-25,-12,[.26,.68,.98],3);
  floorSpot('STREET CHECK',0,-11,[.83,.7,.21],2);
  floorSpot('SHELTER DOOR',10,0,[.2,.85,.72],1.5);
  floorSpot('FINAL POST',19,0,[.82,.73,.34],2);
  // Metadata consumed by the *existing* building-clear logic. One physical room, no fake stairs.
  const B=new pc.Entity('TR Building metadata');B.setPosition(cx,0,cz);S.root.addChild(B);
  const fake={id:0,type:'training range building',state:'intact',kit:false,padY:0,x:cx,z:cz,rect:[cx-8,cz-7,cx+8,cz+7],entity:B,
   shells:[{min:[-8,-7],max:[8,7],w:16,d:14,storeys:1,H:3.15,doors:[{center:[-8,0],normal:[-1,0],h:2.5}]}]};
  S.trainingBuilding=fake;
  S.T.town.buildings.push(fake);
  S.T.trainingBuilding=fake;
 }
 function buildScene(T,app,C){if(!ENABLED)return false;S.T=T;S.app=app;T.trainingMode=true;T.sandbox=true;T.initiative=false;T.doctrine=false;T.trainingTest=true;
  S.root=new pc.Entity('SQD-RANGE (temporary training geometry)');T.root.addChild(S.root);
  hideEditorScene(T,C,app);makeGround();
  // Move only the test squad onto the new floor *before* the initial Recast rebuild.
  // Otherwise the original town spawn positions generate off-mesh warnings, and
  // the rebuild can attempt to snap the soldiers against a now-disabled town.
  (T.squad||[]).filter(s=>s.team==='friendly').forEach((s,i)=>{
   const p=H.start[Math.min(i,H.start.length-1)];
   s.start=p.slice();s.entity.setPosition(...p);
   const sp=(T.spawnPoints||[]).find(v=>v.name===s.soldierName);
   if(sp)sp.position=p.slice();
  });
  return true;}
 function soldiers(){return S.T.squad.filter(s=>s.team==='friendly');}
 function alive(){return soldiers().filter(s=>s.alive&&!s.disabled);}
 function clampTarget(p,from){const T=S.T,q=T.navigation.nearest(p,{x:.55,y:1,z:.55});if(!q||H.distance(q,p)>.65)return null;
  if(!from)return q;let path;try{path=T.navigation.path(from,q);}catch(e){return null;}
  if(!H.routeOkay(path,from,q))return null;return q;}
 function order(s,p,label,face){if(!s.alive)return false;const q=clampTarget(p,s.pos());if(!q){S.metrics.rejected++;return false;}
  const dst=s.goal||s.pos();if(s.path.length&&H.distance(dst,q)<.95)return true;
  if(!s.path.length&&H.distance(s.pos(),q)<.60){if(s.order)s.order.face=face||s.order.face;return true;}
  const o={type:'training',by:'range',dest:q,face:face||null,angle:face?'training':null,arrived:false};s.hold=false;s.inCover=false;
  if(s.moveTo(q,label)){s.order=o;S.metrics.commands++;return true;}S.metrics.rejected++;return false;}
 function sectors(m,dir){if(!m.length)return;const yaw=H.facing([0,0,0],[dir[0],0,dir[1]]),offset=H.sectorOffsets(m.length);
  m.forEach((s,i)=>{s.sector={yaw:yaw+offset[i],half:m.length>=4?1.02:m.length===3?1.14:m.length===2?1.46:.98,by:'range'};});}
 function aimPoint(p,yaw){return [p[0]-Math.sin(yaw)*14,p[1],p[2]-Math.cos(yaw)*14];}
 function holdPost(s,p,face,label){const q=clampTarget(p,s.pos());if(!q)return false;
  if(H.distance(s.pos(),q)>.65&&(!s.path.length||H.distance(s.goal||s.pos(),q)>.9))order(s,q,label,face);
  if(s.order){s.order.face=face;s.order.angle='range';s.order.autoCover=false;}
  s.inCover=H.distance(s.pos(),q)<1.2;return true;}
 function postPositions(n){const x=20,z=0;
  return n===4?[[15,0,-2.4],[15,0,2.6],[25,0,-3],[25,0,3]]:n===3?[[14.6,0,-2],[15,0,2.4],[23,0,2.2]]:n===2?[[14.7,0,-2.5],[15.2,0,2.5]]:[[15,0,-2.7]];}
 function holdBuilding(){const m=alive(),posts=postPositions(m.length),faces=m.length===1?[[10,0,0]]:m.length===2?[[10,0,0],[27,0,2]]:m.length===3?[[10,0,0],[27,0,0],[10,0,0]]:[[10,0,0],[10,0,0],[30,0,0],[30,0,0]];
  sectors(m,[-1,0]);
  m.forEach((s,i)=>holdPost(s,posts[i],faces[Math.min(i,3)],'Range: '+(m.length===1?'lone survivor securing one doorway':'watching distinct openings')));
  S.phase='hold-building';note('Hold the building with '+m.length+' surviving member(s); no automatic sweep');}
 function approachBuilding(now){const m=alive();if(!m.length)return;
  const c=H.centroid(m),spread=Math.max(...m.map(s=>H.distance(c,s.pos())));
  const entry=[9.0,0,0],spots=[[8,0,-1.3],[8,0,1.3],[6.6,0,-1.3],[6.6,0,1.3]];
  if(spread>6.5){S.metrics.cohesionHolds++;if(now-S.waitSince>4){note('Building approach: wait for isolated buddy');S.waitSince=now;}
   m.filter(s=>H.distance(s.pos(),c)>5).forEach(s=>order(s,c,'Regroup before building entry',entry));return;}
  m.forEach((s,i)=>order(s,spots[i],'Approach building together, cover rear',entry));
  if(m.every((s,i)=>H.distance(s.pos(),spots[i])<2.1))holdBuilding();
 }
 function scanLone(now){const m=alive();if(m.length!==1)return;const s=m[0];if(s.target||now-s.lastHitT<3)return;const sec=s.sector;if(sec&&now-(S.lastScanT||0)>2.5){S.lastScanT=now;sec.yaw+=Math.PI/2;if(s.order)s.order.face=aimPoint(s.pos(),sec.yaw);}}
 function recenter(){const m=alive();if(!m.length)return;const c=H.centroid(m);const d=m.reduce((mx,s)=>Math.max(mx,H.distance(c,s.pos())),0);return {c,d};}
 function coverChoices(center){// Not a far-away refuge. No permanent retreat beyond 12 metres.
  return [[-15,-4],[-6,-3],[4,-11],[8,9],[11,-2],[15,-2],[14,3],[23,3],[4,-19]].map(v=>[v[0],0,v[1]])
   .filter(p=>H.nearShelter(p,center,12.0));}
 function coverUp(now){const m=alive(),cen=H.centroid(m),cand=coverChoices(cen),used=[];
  if(!m.length)return false;const targets=[];
  for(const s of m){let best=null,bscore=1e9;for(const p of cand){if(used.some(q=>H.distance(q,p)<1.8))continue;
   const q=clampTarget(p,s.pos());if(!q)continue;const d=H.distance(q,s.pos())+H.distance(q,cen)*.28;
   // Fireteam remains within visual contact: no one is assigned beyond a local 12 m radius.
   if(d<bscore){best=q;bscore=d;}}
   if(!best){let q=clampTarget(s.pos(),s.pos());best=q||s.pos();}
   used.push(best);targets.push(best);}
  const threat=nearestThreat(m);m.forEach((s,i)=>holdPost(s,targets[i],threat?threat.pos():[cen[0]+15,0,cen[2]],'Range: nearby cover, watch buddy'));
  S.metrics.fallBacks++;S.phase='cover';S.phaseT=now;note('Local cover only (maximum 12 m from current team), maintain mutual support');return true;}
 function nearestThreat(m){const now=S.T.elapsed;let best=null,dmin=1e9;const seen=new Set();
  // Must be known to someone or actively attacking the team. No omniscient targeting.
  m.forEach(s=>{if(!s.memory)return;S.T.perception.known(s,true).forEach(r=>{const z=r.entity;if(!z||!z.alive||!z.isZombie||seen.has(z)||now-r.timeLastSensed>4)return;
   seen.add(z);const d=Math.min(...m.map(member=>H.distance(member.pos(),r.lastSensedPosition)));if(d<dmin){best=z;dmin=d;}});});
  for(const z of S.T.zombies||[]){if(!z.alive||!z.target||!m.includes(z.target))continue;const d=H.distance(z.pos(),z.target.pos());if(d<dmin){dmin=d;best=z;}}
  S.nearestDistance=dmin;return best;}
 function trueNearDanger(m){let n=0,closest=1e9;for(const z of S.T.zombies||[]){if(!z.alive)continue;
  const d=Math.min(...m.map(s=>H.distance(s.pos(),z.pos())));if(d<20&&(z.target&&m.includes(z.target)||z.state==='attack'||z.state==='chase')){n++;closest=Math.min(closest,d);}}
  return {n,closest};}
 function moveDiamond(now){const m=alive();if(!m.length)return;const formation=H.slots(m.length),wps=H.targetPoints,goal=wps[Math.min(S.step,wps.length-1)];
  const center=H.centroid(m),sep=Math.max(...m.map(s=>H.distance(center,s.pos())));
  if(sep>6.5){S.metrics.cohesionHolds++;if(now-S.waitSince>4){note('Cohesion hold: waiting for isolated teammate, no abandonment');S.waitSince=now;}
   // Order the lagging member back toward group, but do not advance leader.
   m.filter(s=>H.distance(center,s.pos())<=5).forEach(s=>s.stop());
   m.filter(s=>H.distance(center,s.pos())>5).forEach(s=>order(s,center,'Buddy regroup',center));return;}
  const prev=wps[Math.max(0,S.step-1)];let dx=goal[0]-prev[0],dz=goal[2]-prev[2],len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
  const side=[-dz,dx],spacing=formation;sectors(m,[dx,dz]);
  // Do not collapse all members onto one waypoint. Hold a tight, mutually covered diamond.
  m.forEach((s,i)=>{
   const f=spacing[i],p=[goal[0]+dx*f[0]+side[0]*f[1],0,goal[2]+dz*f[0]+side[1]*f[1]],face=aimPoint(s.pos(),s.sector.yaw);
   order(s,p,'Range: '+m.length+'-person reciprocal security',face);
   if(s.order){s.order.face=face;s.order.angle='range';}
  });
  const close=m.filter((s,i)=>{const f=spacing[i],p=[goal[0]+dx*f[0]+side[0]*f[1],0,goal[2]+dz*f[0]+side[1]*f[1]];return H.distance(s.pos(),p)<2.8;}).length;
  if(close===m.length){S.step=Math.min(S.step+1,wps.length-1);if(S.step===wps.length-1&&close===m.length){S.phase='approach-building';note('Resuming building approach as a group');}else note('Checkpoint '+S.step+'/'+(wps.length-1)+' reached together');}
 }
 function beginAssault(){const m=alive();const b=S.T.orders.startBrain('assault',m,{building:0,by:'player',reason:'Range: deliberate building entry, not objective capture'});
  if(b&&b.status!=='fail'){S.phase='clear';S.phaseT=S.T.elapsed;note('Original building-clear tree active: '+m.length+' soldiers. Ground checkpoints persist.');}
  else{S.phase='idle';note('Building assault could not start: '+(b?b.why:'no survivors'));}}
 function simulatedLoss(){const m=alive();if(m.length<=1){note('No more members can be removed; lone-survivor test is active.');return;}
  // Simulated casualty for doctrine training, not real weapon damage or a revive mechanic.
  const victim=m[m.length-1];victim.alive=false;victim.health=0;victim.stop();victim.entity.enabled=false;victim.disabled=true;S.metrics.losses++;
  if(S.phase==='clear'){S.T.orders.brain=null;S.phase='cover';S.resumeAssault=true;coverUp(S.T.elapsed);}
  else if(S.phase==='hold-building')holdBuilding();
  else if(S.phase==='cover')coverUp(S.T.elapsed);
  else if(S.phase==='advance'||S.phase==='contact'){S.phase='advance';S.waitSince=0;}
  S.n=m.length-1;note('SIMULATED casualty: '+victim.soldierName+'. '+S.n+' survivors reassign sectors and regroup.');
  setInputs();}
 function spawnWave(n,fromRear=false){const T=S.T,Z=T.zombieMgr;if(!Z||!Z.ready){note('Zombie model not yet available');return;}
  const points=[[-2,0,-22],[4,0,-23],[13,0,-20],[25,0,-20],[-9,0,12],[2,0,23],[13,0,19],[28,0,18]];
  let got=0;const c=H.centroid(alive());for(let i=0;i<n;i++){const p=fromRear?[c[0]-12-Math.floor(i/3)*3,0,c[2]+(i%3-1)*3.2]:points[i%points.length],offset=[p[0]+(Math.floor(i/8)%3)*1.8,0,p[2]+Math.floor(i/24)*2.2],q=clampTarget(offset);
   if(!q)continue;const z=Z.spawn(q,i%5===0?'run':'walk');if(z){got++;z.noisePos=H.centroid(alive());z.noiseT=T.elapsed;z.state='investigate';z.repathT=0;}}
  S.spawned=true;note('Spawned '+got+'/'+n+' real zombies '+(fromRear?'BEHIND the squad':'investigating the squad'));}
 function reset(scenario,headcount){const T=S.T;if(!T||!T.ready)return;
  T.running=true;T.paused=false;T.outcome=null;T.initiative=false;T.doctrine=false;T.sandbox=true;T.trainingMode=true;
  const orders=T.orders;orders.brain=null;orders.assault=null;orders.hunt=null;orders.follow=null;orders.clearMemory=new Map();orders.autonomousAssaults=new Set();orders.lastFallbackT=T.elapsed;
  if(T.zombieMgr){T.zombieMgr.reset();T.zombieMgr.on=true;T.zombieMgr.nextWaveT=1e8;}
  S.n=headcount||S.n;S.scenario=scenario||S.scenario;S.step=0;S.resumeAssault=false;S.phase='idle';S.phaseT=T.elapsed;S.lastThreat=-1e9;S.safeSince=T.elapsed;S.enemyAt=T.elapsed;S.waitSince=-1e9;S.lastScanT=-1e9;S.spawned=false;S.cleared=new Set();T.doc={};S.metrics={commands:0,rejected:0,cohesionHolds:0,contacts:0,fallBacks:0,resumed:0,losses:0,shots:0,maxSpread:0};S.events=[];
  soldiers().forEach((s,i)=>{s.disabled=i>=S.n;s.entity.enabled=i<S.n;s.reset();s.entity.setPosition(...H.start[i]);s.start=H.start[i].slice();
   if(s.disabled){s.alive=false;s.health=0;s.stop();}else{s.alive=true;s.hold=false;s.order={type:'training',by:'range',dest:s.pos()};s.sector=null;s.inCover=false;}});
  S.phase=S.scenario==='clear'?'clear':S.scenario==='hold'?'approach-building':'advance';
  if(S.scenario==='clear')beginAssault();
  else if(S.scenario==='hold')note('Approaching the building together before occupying posts');
  else if(S.scenario==='contact'||S.scenario==='rear'){note('Advance to target; '+(S.scenario==='rear'?'rear assault':'zombie contact')+' will trigger near the squad');}
  else note('Advancing with '+S.n+' survivors; maintaining mutual security');
  if(T.input&&T.input.fps)T.input.exitControl('range reset');
  if(T.input)T.input.home();
  setInputs();}
 function setInputs(){if($('tr-survivors'))$('tr-survivors').value=String(S.n);if($('tr-scenario'))$('tr-scenario').value=S.scenario;}
 function tick(){const T=S.T;if(!T||!T.ready||T.paused||!T.running)return;const now=T.elapsed;if(now<S.nextTick)return;S.nextTick=now+.4;
  const m=alive();if(!m.length){S.phase='eliminated';report();return;}
  if(S.phase==='clear'){
   const b=T.orders.brain; if(!b){if(T.orders.lastBrain&&T.orders.lastBrain.kind==='assault'&&T.orders.lastBrain.status==='done')holdBuilding();else{S.phase='approach-building';note('Clear stopped: regroup at building, checkpoints are retained');}}
   else{if(b.clearRecord&&b.clearRecord.groundDone)S.cleared.add('ground');
    // Do not convert a 1- or 2-person stair loss into a suicidal rush: the existing tree guards it.
    if(b.withdrawn){S.phase='contact';S.lastThreat=now;S.resumeAssault=true;T.orders.brain=null;coverUp(now);note('Clear interrupted: local cover. Resume the SAME checked-room memory when quiet.');}}
   report();return;}
  // Reactions use sensed/actively attacking contacts, not every zombie in the world.
  const hostile=nearestThreat(m),danger=trueNearDanger(m);
  if((hostile&&S.nearestDistance<20)||danger.n>0){S.lastThreat=now;
   if(S.phase==='advance'){S.phase='contact';S.phaseT=now;S.metrics.contacts++;note('CONTACT — keep team nearby, orient to threat; no distant retreat');}
   if(S.phase==='contact'&&H.phaseWhenThreat(danger.closest,danger.n)==='cover'&&now-S.phaseT>1.2)coverUp(now);
  }else if((S.phase==='contact'||S.phase==='cover')&&H.shouldResume(now,S.lastThreat,5)){
   S.phase=S.scenario==='hold'?'approach-building':'advance';S.phaseT=now;S.metrics.resumed++;m.forEach(s=>{s.inCover=false;s.sector=null;});
   if(S.resumeAssault){S.resumeAssault=false;beginAssault();}
   else note('Threat quiet for 5s: resume the interrupted checkpoint, no repeat route');}
  if(S.phase==='advance')moveDiamond(now);
  else if(S.phase==='contact'){m.forEach(s=>{s.stop();s.order={type:'training',by:'range',face:hostile?hostile.pos():[s.pos()[0]+10,0,s.pos()[2]]};});sectors(m,[1,0]);}
  else if(S.phase==='cover'){const cen=H.centroid(m);if(m.length===1)scanLone(now);
   // While holding cover, keep watch directions but never chase a distant zombie.
   const threat=hostile&&hostile.alive?hostile.pos():[cen[0]+15,0,cen[2]];m.forEach(s=>{if(s.order&&(hostile||m.length>1))s.order.face=threat;});}
  else if(S.phase==='approach-building'){approachBuilding(now);}
  else if(S.phase==='hold-building'){if(m.length===1)scanLone(now);}
  if((S.scenario==='contact'||S.scenario==='rear')&&!S.spawned&&(S.step>=1||now-S.phaseT>14))spawnWave(S.scenario==='rear'?4:6,S.scenario==='rear');
  report();}
 function report(){const m=alive(),now=S.T.elapsed,co=H.centroid(m),spread=m.length?Math.max(...m.map(s=>H.distance(co,s.pos()))):0;
  const hits=S.T.combat&&S.T.combat.counters?S.T.combat.counters:{},brain=S.T.orders.brain,counts=(S.T.zombies||[]).filter(z=>z.alive).length;
  S.metrics.maxSpread=Math.max(S.metrics.maxSpread,spread);
  const data={scenario:S.scenario,phase:S.phase,survivors:m.length,spread:+spread.toFixed(1),zombies:counts,checkpoint:S.step,cleared:[...S.cleared],brainStep:brain?brain.cur:'-',brainWhy:brain?brain.why:'-',navFails:brain?brain.navFail:0,recoveries:S.metrics.resumed,falls:S.metrics.fallBacks,cohesionHolds:S.metrics.cohesionHolds,rejectedRoutes:S.metrics.rejected,localLimitMeters:12};
  const el=$('tr-stats');if(el)el.textContent=['STATE  '+data.phase.toUpperCase(),'Alive '+m.length+'/4     Zombies '+counts,'Spread '+data.spread+' m     Checkpoint '+data.checkpoint+'/4',
   'Memory '+(data.cleared.length?data.cleared.join(', '):'-'),'Brain '+data.brainStep+' '+data.brainWhy,'Re-advances '+data.recoveries+' · local cover '+data.falls,'Cohesion holds '+data.cohesionHolds+' · rejected routes '+data.rejectedRoutes].join('\n');
  S.lastReport=data;return data;}
 function createUI(){const e=document.createElement('div');e.id='tr-panel';e.innerHTML=`
  <header><strong>SQD-RANGE · TEAMWORK TRAINING</strong><button id="tr-min">Minimize</button></header>
  <div id="tr-body"><p class="hint">Flat test map · real DREADING squad AI, Recast navigation and zombies. No capture-point automation.</p>
   <label>Scenario <select id="tr-scenario"><option value="advance">Mutual security · advance / regroup</option><option value="contact">Zombie contact → local cover → re-advance</option><option value="rear">Rear contact → mutual protection</option><option value="clear">Clear single-storey building (original behavior tree)</option><option value="hold">Secure doorway / windows / hold</option></select></label>
   <label>Survivors <select id="tr-survivors"><option value="4">4 · front/left/right/rear</option><option value="3">3 · overlapping sectors</option><option value="2">2 · buddy reciprocal cover</option><option value="1">1 · lone survivor scan</option></select></label>
   <div class="row"><button id="tr-run">Reset & run drill</button><button id="tr-loss">Simulate casualty</button></div>
   <div class="row"><button id="tr-wave">Spawn 6 zombies</button><button id="tr-clear">Start building clear</button><button id="tr-hold">Hold building</button></div>
   <div class="row"><button id="tr-export">Export drill report</button></div>
   <pre id="tr-stats">Preparing flat range...</pre><pre id="tr-log"></pre>
   <p class="hint">A loss removes a soldier for this drill (does not test the real damage/revive pipeline). Reducing to 1 or 2 changes the coverage pattern. Clearing and holding stay separate. FPS remains top-right.</p></div>`;
  document.body.appendChild(e);
  const st=document.createElement('style');st.textContent=`
   #tr-panel{position:fixed;right:12px;top:83px;z-index:9001;width:330px;max-height:calc(100dvh - 97px);overflow:auto;background:#101c22f2;color:#e0e9e8;border:1px solid #6a8583;border-radius:10px;box-shadow:0 10px 24px #0008;padding:11px;font:12px/1.45 system-ui}
   #tr-panel header{display:flex;gap:8px;align-items:center;justify-content:space-between;color:#b9dfd1}#tr-panel header strong{letter-spacing:.7px;font-size:12px}
   #tr-panel .hint{font-size:10px;opacity:.70;margin:6px 0 9px}#tr-panel label{display:block;margin:7px 0}
   #tr-panel select{display:block;width:100%;box-sizing:border-box;color:#e8f3f1;background:#1a313b;border:1px solid #6a8583;border-radius:5px;padding:6px;margin-top:3px}
   #tr-panel .row{display:flex;flex-wrap:wrap;gap:4px;margin:7px 0}#tr-panel button{cursor:pointer;flex:1;background:#254650;color:#dfe;border:1px solid #658b8c;border-radius:5px;padding:6px}
   #tr-panel button:hover{background:#39626b}#tr-stats,#tr-log{white-space:pre-wrap;background:#142934;padding:8px;border-radius:6px;font:11px/1.45 ui-monospace,monospace;max-height:120px;overflow:auto}
   #tr-log{max-height:70px;opacity:.87}#tr-panel.fold #tr-body{display:none}`;document.head.appendChild(st);
  $('tr-min').onclick=()=>{e.classList.toggle('fold');$('tr-min').textContent=e.classList.contains('fold')?'Expand':'Minimize';};
  $('tr-run').onclick=()=>reset($('tr-scenario').value,+$('tr-survivors').value);
  $('tr-loss').onclick=simulatedLoss;
  $('tr-wave').onclick=()=>spawnWave(6);
  $('tr-clear').onclick=()=>{S.scenario='clear';S.T.orders.brain=null;beginAssault();setInputs();};
  $('tr-hold').onclick=()=>{S.scenario='hold';S.T.orders.brain=null;S.phase='approach-building';note('Approach and then hold building, no sweep');setInputs();};
  $('tr-export').onclick=()=>{const data={build:'SQD-RANGE 1.0',elapsed:S.T.elapsed,report:S.lastReport,metrics:S.metrics,events:S.events,engine:pc.version};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='DREADING_TRAINING_'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),500);};
  // Prevent range input clicks from issuing RTS commands behind it.
  e.addEventListener('pointerdown',ev=>ev.stopPropagation());
 }
 function start(T){if(!ENABLED||S.playing)return;S.T=T;S.playing=true;createUI();T.sandbox=true;T.doctrine=false;T.initiative=false;
  if(T.orders.setEnemySquad)T.orders.setEnemySquad(false);
  // Existing procedural-town and objective controls are deliberately inactive in this flat drill.
  for(const id of ['ton','tregen','tcycle','secure']){const el=$(id);if(el){el.disabled=true;el.title='Disabled in SQD-RANGE: use the training controls';}}
  // Expose the entire training harness for repeatable manual/automated checks.
  g.DreadingRangeTest={reset,spawnWave,simulatedLoss,report:()=>S.lastReport,scene:()=>S.trainingBuilding,state:()=>S};
  S.app.on('update',()=>tick());reset('advance',4);
  note('Range started. Select a drill and 1–4 survivors; repeat under identical conditions.');}
 g.DreadingTraining={enabled:true,helpers:H,buildScene,start};
})(globalThis);
