/* Two opposing commanders in the existing battle. Host owns world simulation.
   Guest predicts only the possessed soldier; orders and action intents execute on host. */
(function(){'use strict';
const N=window.DreadingMultiplayer={slot:null,epoch:0,ready:false,connected:false,players:[false,false],rtt:0,lastState:0,rejected:0,received:0};
let ws,T,app,I,units,orders,remote,readyGuest=false,state=null,actions=[],lastSend=0,lastSnapshot=0,lastPing=0,lastRemote=0,lastEvent=0,eventId=0,events=[],worldBusy=false,worldDesired=[],applying=false,originalShoot,originalRay,remoteFrame=null;
const held=[null,null],pilots=[null,null],zombies=new Map(),drones=new Map(),nades=new Map();
const smokeClouds=new Map();
const METHODS=['moveGroup','takeCover','startBrain','focusFire','startHunt','startAssault','assignSectors'];
const box=document.createElement('div');box.id='mp-panel';box.style.cssText='position:fixed;left:12px;top:8px;z-index:10001;background:#101712ee;color:#dce9d0;padding:8px 12px;font:12px/1.5 system-ui;max-width:520px';box.innerHTML='<b>DREADING · OPPOSING COMMANDERS</b><div id="mp-status">Loading battle…</div><small>Combat test · Construction / loot / extraction still planned</small>';document.body.appendChild(box);
const style=document.createElement('style');style.textContent='#tl-panel{display:none!important}body.tl-play #tl-ctl{display:none!important}#mp-panel{pointer-events:auto}.tlh{z-index:40}';document.head.appendChild(style);
const status=document.getElementById('mp-status');
function send(m){if(ws?.readyState===1&&ws.bufferedAmount<256*1024)ws.send(JSON.stringify(m));}
function active(){return N.ready&&N.connected&&(!window.DreadingControl||DreadingControl.playable())&&(!window.DreadingMPPrep||DreadingMPPrep.canPlay())&&(N.slot===0||(N.players[0]&&performance.now()-N.lastState<2000));}
function own(s,side=N.slot){return s&&s._netOwner===side;}
function withSide(side,fn){const previous=T.orders;T.orders=orders[side];try{return fn();}finally{T.orders=previous;}}
function withRemote(fn){const oldInput=T.input,oldHeld=T.grenades.held,oldPilot=T.drones.pilot;T.input=remote;T.grenades.held=held[1];T.drones.pilot=pilots[1];try{return withSide(1,fn);}finally{held[1]=T.grenades.held;pilots[1]=T.drones.pilot;T.input=oldInput;T.grenades.held=oldHeld;T.drones.pilot=oldPilot;}}
function emit(type,data){const e={id:++eventId,at:T.elapsed,type,...data};events.push(e);if(events.length>256)events.shift();effect(e);}
function encode(v,depth=0){if(depth>8)return null;if(v===null||v===undefined||typeof v!=='object')return v??null;if(units.includes(v))return {$unit:v.uid};if(v.isZombie)return {$zombie:v.uid};if(Array.isArray(v))return v.map(x=>encode(x,depth+1));const out={};for(const [k,x]of Object.entries(v)){if(typeof x==='function'||['app','entity','model','parent','tree','memory'].includes(k))continue;out[k]=encode(x,depth+1);}return out;}
function decode(v){if(!v||typeof v!=='object')return v;if('$unit'in v)return units.find(s=>s.uid===v.$unit);if('$zombie'in v)return T.zombies.find(z=>z.uid===v.$zombie);if(Array.isArray(v))return v.map(decode);const out={};for(const [k,x]of Object.entries(v))if(!['__proto__','constructor','prototype'].includes(k))out[k]=decode(x);return out;}
function command(m){
 if(window.DreadingTeamSupport?.command(m,1))return;
 if(window.DreadingFireSupport?.command(m,1))return;
 if(N.api?.onCommand?.(m))return;
 if(m.method==='muzzle'){const [uid,weapon,offset]=m.args||[],s=units.find(s=>s.uid===uid);if(own(s,1)&&remote.fps?.s===s&&s.alive&&weapon===s.arms.def.id&&window.DreadingShotOrigin?.validOffset(offset))s._netMuzzle={weapon,offset:offset.slice(),at:T.elapsed};return;}
 if(m.method==='power'){
  const point=m.args?.[0];if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)){N.rejected++;return;}
  const pick=remote.pickWorld;remote.pickWorld=()=>({point});remote.commandTeam='enemy';try{withRemote(()=>TacticalRtsInput.prototype.powerAtCursor.call(remote));N.received++;}finally{remote.pickWorld=pick;}return;
 }
 if(m.method==='equipment'){
  const [uid,key,shift,point]=m.args||[],s=units.find(s=>s.uid===uid);
  if(!own(s,1)||!s.alive||s.controlled||!['KeyJ','KeyK','KeyU'].includes(key)||point!==null&&(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))){N.rejected++;return;}
  const previous=T.selection,friendlies=remote.friendlies,pick=remote.pickWorld;T.selection=[s];remote.friendlies=()=>[s];remote.pickWorld=()=>point?{point}:null;
  remote.commandTeam='enemy';try{withRemote(()=>TacticalRtsInput.prototype.equipOrder.call(remote,key,!!shift));N.received++;}finally{T.selection=previous;remote.friendlies=friendlies;remote.pickWorld=pick;}return;
 }
 if(!METHODS.includes(m.method)||!Array.isArray(m.args))return;const args=decode(m.args),group=args[m.method==='startBrain'?1:0];if(!Array.isArray(group)||!group.length||group.some(s=>!own(s,1)||!s.alive||s.controlled)){N.rejected++;return;}try{withSide(1,()=>orders[1][m.method](...args));N.received++;}catch(e){console.warn('[MP] order rejected',e.message);N.rejected++;}}
function possess(uid){if(remote.fps){const old=remote.fps.s;withRemote(()=>orders[1].stopFollow());old.controlled=false;old.stop();old.order={type:'move',dest:old.pos(),by:'player'};remote.fps=null;}
 if(uid===null)return;const s=units.find(s=>s.uid===uid);if(!own(s,1)||!s.alive){N.rejected++;return;}s.controlled=true;s.stop();T.cover.release(s);s.inCover=false;s.order={type:'player',by:'direct'};s.target=null;s.vel=[0,0];const y=s.pos()[1];remote.fps={s,yaw:s.lookYaw,pitch:s.pitch||0,fire:false,firePressed:false,ads:false,sprintW:0,eyeH:1.62,airY:0,vy:0,jump:false,kick:0,kickV:0,jumps:0,groundY:y,eyeG:y,eyeGv:0};withRemote(()=>orders[1].startFollow(s));}
function connect(){ws=new (window.DreadingRoomSocket||WebSocket)((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/room');ws.onopen=()=>N.connected=true;ws.onclose=()=>{N.connected=false;readyGuest=false;N.players=[false,false];if(I){I.keys={};if(I.fps)I.fps.fire=false;}status.textContent='Disconnected — reload your invitation to reconnect.';};ws.onerror=()=>{};
ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}if(m.type==='welcome'){N.slot=m.slot;N.epoch=m.epoch;boot();}else if(m.type==='presence'){N.players=m.players;if(N.epoch!==m.epoch&&N.ready&&N.slot!==0){location.reload();return;}N.epoch=m.epoch;if(!m.players[1]){readyGuest=false;if(remote)possess(null);}if(N.ready&&N.slot===1)send({type:'ready'});}else if(m.type==='pong')N.rtt=Date.now()-m.at;else if(m.type==='ready')readyGuest=true;else if(m.type==='state'){state=m;N.lastState=performance.now();}else if(N.ready&&N.slot===0){if(m.type==='command')command(m);else if(m.type==='control')possess(m.uid);else if(m.type==='frame'){if(!remote.fps||remote.fps.s.uid!==m.uid)return;remoteFrame=m;lastRemote=performance.now();}}};}
function makeOrders(side){const O=Object.create(orders[0]);O.initialize();O.brain=O.follow=O.hunt=O.assault=null;O.enemyTactics=()=>{};O.matchRules=()=>{};O.brainSeq=side*100000;O.team=t=>units.filter(s=>s._netOwner===(t==='friendly'?side:1-side)&&!s.disabled);O.localTeam=side===0?'friendly':'enemy';return O;}
function boot(){if(N.ready||N.slot===null||!window.tactical?.T.ready||!tactical.T.zombieMgr?.ready)return;
 app=tactical.app;T=tactical.T;I=T.input;
 if(new URLSearchParams(location.search).get('pick')==='1'){for(const team of ['friendly','enemy']){const base=T.squad.filter(s=>s.team===team),p=base[base.length-1].pos();T.spawnMultiplayerSoldiers(Array.from({length:DreadingCatalogue.capacity-base.length},(_,j)=>j+base.length).map((i)=>{const candidate=[p[0]+((i%6)-2)*1.5,p[1],p[2]-2-Math.floor(i/6)*1.5],near=T.navigation.nearest(candidate,[2,2,2]);return {name:team+' reserve '+i,team,role:'Rifleman',position:near?.point||candidate};}));}}
 units=T.squad;units.forEach(s=>{s._netOwner=s.team==='friendly'?0:1;s.ownerId=s._netOwner;});
 const originalOrders=T.orders;orders=[originalOrders,null];if(N.slot===0){orders[1]=makeOrders(1);T.orders=originalOrders;orders[0].enemyTactics=()=>{};orders[0].matchRules=()=>{};const update=originalOrders.update;originalOrders.update=function(dt){if(!active())return;withSide(0,()=>update.call(orders[0],dt));withSide(1,()=>update.call(orders[1],dt));};
 }else{orders[1]=originalOrders;orders[0]=originalOrders;originalOrders.update=()=>{};units.forEach(s=>{s.team=own(s)?'friendly':'enemy';if(s.row)s.row.style.display=own(s)?'':'none';});}
 T.localOwnerId=N.slot;T.localTeam='friendly';T.sandbox=true;T.outcome=null;T.initiative=false;
 // Strategic movement belongs to both human commanders. Individual squad AI still runs.
 if(T.strategy){T.strategy.planTick=()=>{};T.strategy.plans={};}
 originalShoot=T.combat.shoot.bind(T.combat);originalRay=T.combat.fireRay.bind(T.combat);
 const updateSoldier=TacticalSoldierDecision.prototype.update;
 for(const s of units)s.update=function(dt){if(this.disabled||!active())return;if(N.slot===0)return withSide(this._netOwner,()=>updateSoldier.call(this,dt));if(I.fps?.s===this){TacticalNS.tickWeapon(this.arms,Math.min(dt,.05),this.input);this.crouchAmt+=((this.wantCrouch?1:0)-this.crouchAmt)*Math.min(1,dt*12);}};
 remote=Object.create(I);remote.fps=null;remote.keys={};remote.vm=null;remote.hudCache={};remote.vmTick=remote.setText=remote.setCross=remote.hitmarker=remote.toast=()=>{};remote.exitControl=()=>possess(null);remote.hud={veil:{style:{}}};remote.flashed=null;
 const enter=I.enterControl,exit=I.exitControl,key=I.onKey,fpsTick=I.fpsTick;
 I.enterControl=function(s){if(!own(s)||!s.alive||!active())return false;const r=enter.call(this,s);if(r&&N.slot===1)send({type:'control',uid:s.uid});return r;};
 I.exitControl=function(why){const r=exit.call(this,why);if(N.slot===1)send({type:'control',uid:null});return r;};
 I.onKey=function(e){if(['KeyP','Pause','KeyI'].includes(e.code))return;if(this.fps&&N.slot===1&&['KeyR','KeyC','Space','Digit1','Digit2','BracketLeft','BracketRight','KeyG','KeyZ','KeyB','KeyU'].includes(e.code)&&!e.repeat&&!e.altKey)actions.push(e.code);return key.call(this,e);};
 window.addEventListener('keyup',e=>{if(e.code===(window.DreadingSettings?.data.bindings.KeyG||'KeyG')&&N.slot===1&&I.fps)actions.push('releaseG');});
 window.addEventListener('blur',()=>{I.keys={};if(I.fps){I.fps.fire=false;I.fps.firePressed=false;}if(N.slot===1)sendFrame();});
 I.fpsTick=function(dt){if(!active())return;if(N.slot===1&&performance.now()-lastSend>=40)sendFrame();return fpsTick.call(this,dt);};
 if(N.slot!==0){
  I.equipOrder=function(key,shift){const s=(T.selection||[]).find(s=>own(s)&&s.alive&&!s.controlled)||units.find(s=>own(s)&&s.alive&&!s.controlled);if(!s)return;const hit=this.pickWorld(this.mouse.x,this.mouse.y);send({type:'command',method:'equipment',args:[s.uid,key,!!shift,hit?.point||null]});};
  I.powerAtCursor=function(){const hit=this.pickWorld(this.mouse.x,this.mouse.y);if(hit)send({type:'command',method:'power',args:[hit.point]});};
  let depth=0;for(const method of METHODS){const old=originalOrders[method];originalOrders[method]=function(...args){if(!depth)send({type:'command',method,args:encode(args)});depth++;try{return old.apply(this,args);}finally{depth--;}};}
  T.combat.applyDamage=()=>{};T.combat.fireRay=function(s,o,d,muzzle,tracer){const w=TacticalCommon.rayWorld(o,d,300,T.perception.blockers),body=TacticalNS.rayEntities(o,d,w?w.t:300,s,this.list(),false),drone=T.drones?.rayDrones?.(s,o,d,body?body.t:w?w.t:300),distance=drone?drone.t:body?body.t:w?w.t:300,end=o.map((v,i)=>v+d[i]*distance);if(tracer&&this.fx)this.fx.tracers.add(muzzle,end);return {end,w:body||drone?null:w,eh:null};};
  T.zombieMgr.update=function(dt){for(const z of T.zombies){this.paint(z,dt);}this.frame++;this.animLod(dt);};
  T.drones.update=function(){for(const d of this.list)this.pose(d);};
  T.grenades.update=function(dt){this.updateSmokes(dt);if(I.fps)this.playerTick(dt,I);};
  T.grenades.spawn=()=>null;T.drones.launchFpv=()=>null;T.drones.launchRecon=()=>null;
  T.grenades.explode=()=>[];T.grenades.flashBang=()=>[];
 }else{
  T.combat.fireRay=function(s,o,d,muzzle,tracer){const r=originalRay(s,o,d,muzzle,tracer);emit('bullet',{uid:s.uid,o:muzzle||o,end:r.end,hit:!!r.eh,wall:r.w&&!r.eh?r.w.shape.name:null,kill:!!r.eh&&!r.eh.ent.alive});return r;};
  for(const method of ['explode','flashBang','smokeStart']){const old=T.grenades[method];T.grenades[method]=function(p,...args){const r=old.call(this,p,...args);emit(method,{p:p.slice(),radius:method==='explode'?args[2]:null,fxRadius:method==='explode'?args[5]:null});return r;};}
 }
 T.combat.shoot=function(s,o,d,isPlayer){if(!active())return null;const r=originalShoot(s,o,d,isPlayer);if(r){if(N.slot===0)emit('shot',{uid:s.uid,p:r.muzzle||o,weapon:s.arms.def.id});else DreadingAudio?.shot(s,o);}return r;};
 if(N.slot===0){const zu=T.zombieMgr.update;T.zombieMgr.update=function(dt){if(active())zu.call(this,dt);};}
 // Network event effects and UI remain local; simulation stays with the host.
 if(N.slot===2){I.spectate=function(side){const group=units.filter(s=>s._netOwner===side&&s.alive&&!s.disabled);if(!group.length)return;I.resetView('spectator');I.cam.yaw=0;I.lookFrom(I.centroid(group),50,60);};const bar=document.createElement('div');bar.style.cssText='position:fixed;left:10px;bottom:45px;z-index:10002;background:#101b13;padding:6px';for(const side of [0,1]){const b=document.createElement('button');b.textContent='View Commander '+(side+1);b.onclick=()=>I.spectate(side);bar.appendChild(b);}document.body.appendChild(bar);I.equipOrder=I.powerAtCursor=()=>{};for(const method of METHODS)originalOrders[method]=()=>{};I.enterControl=()=>false;document.body.classList.add('dreading-spectator');const css=document.createElement('style');css.textContent='body.dreading-spectator #capture-objectives,body.dreading-spectator #tlh-cards,body.dreading-spectator #dob-strip{display:none!important}';document.head.appendChild(css);}
 N.api={units,orders,remote,command,send,spawnPoints:units.map(s=>s.pos())};N.ready=true;T.paused=false;T.running=true;T.selection=units.filter(s=>own(s)&&s.alive);I.home();send({type:'ready'});
 if(N.slot===0)app.on('tactical:damage',(v,dmg,a,part)=>emit('damage',{uid:v.uid,damage:dmg,source:a?.pos?.()||null,kind:a?.isZombie?'Zombie attack':a?'Bullet hit':'Impact'}));app.on('update',tick);console.log('MULTIPLAYER_BATTLE_READY',N.slot,units.length);
}
function sendFrame(){if(!I?.fps)return;const f=I.fps;const muzzle=window.DreadingShotOrigin?.offset(T,f.s);if(muzzle)send({type:'command',method:'muzzle',args:[f.s.uid,f.s.arms.def.id,muzzle]});send({type:'frame',uid:f.s.uid,yaw:f.yaw,pitch:f.pitch,keys:I.keys,ads:f.ads,fire:f.fire,pressed:f.firePressed,actions:actions.splice(0,8)});lastSend=performance.now();}
function pack(s){return {uid:s.uid,owner:s._netOwner,disabled:!!s.disabled,squadKey:s.squadKey,kit:s.prepKit,p:s.pos(),yaw:s.lookYaw,pitch:s.pitch,hp:s.health,alive:s.alive,controlled:s.controlled,crouch:s.crouchAmt,speed:s.speedNow,moving:s.moving,lastShot:s.lastShotT,deathT:s.deathT,decision:s.decision,weapon:s.arms.def.id,armsIdx:s.armsIdx||0,arms:{mag:s.arms.mag,reserve:s.arms.reserve,reload:s.arms.reload,fireCd:s.arms.fireCd,adsW:s.arms.adsW},inventory:s.nadeInv,blind:s.blindT,order:s.order?{type:s.order.type,dest:s.order.dest,by:s.order.by,phase:s.order.phase}:null};}
function snapshot(){return {support:window.DreadingFireSupport?.snapshot(),type:'state',epoch:N.epoch,clock:T.elapsed,players:units.map(pack),events:events.slice(-128),zombies:T.zombies.map(z=>({uid:z.uid,p:z.pos(),type:z.type,hp:z.health,alive:z.alive,yaw:z.yaw,clip:z.clip,rate:z.animRate,hitReaction:z.hitReaction||0,state:z.state,deadT:z.deadT,moving:z.moving,speed:z.speedNow})),nades:T.grenades.nades.map((n,i)=>({id:n._netId||(n._netId=++eventId),p:n.p,type:n.type})),drones:T.drones.list.filter(d=>!d.dead).map(d=>({id:d._netId||(d._netId=++eventId),kind:d.kind,uid:d.owner?.uid,p:d.pos,yaw:d.yaw,pitch:d.pitch,roll:d.roll,hp:d.hp,t:d.t,pilot:pilots[1]?.d===d})),world:T.town.buildings.map(b=>({id:b.id,state:b.state,panels:window.DreadingImportedDamage?.networkState?.(b)||[]})),power:T.power?{on:T.power.on,team:T.power.team}:null};}
function effect(e){const s=units?.find(s=>s.uid===e.uid),A=window.DreadingAudio;if(e.type==='damage'){window.DreadingDamageHUD?.hit(e);return;}if(e.type==='shot'){if(N.slot===0||s!==I.fps?.s)A?.shot(s,e.p,e.weapon);if(N.slot!==0&&T.combat.fx&&s&&s!==I.fps?.s){const f=TacticalNS.fwd(s.lookYaw,s.pitch),o=e.p;TacticalNS.muzzleWorldFx(T.combat.fx,o,f,1);if(window.DreadingNight)DreadingNight.flash(o,6,.25);}}
 else if(e.type==='bullet'){A?.bullet(s,e.o,e.end,e.hit,e.wall);if(N.slot!==0&&T.combat.fx){if(s!==I.fps?.s)T.combat.fx.tracers.add(e.o,e.end);if(e.hit&&s===I.fps?.s)I.hitmarker(false,e.kill);}}
 else if(e.type==='explode'){A?.explosion(e.p);if(N.slot!==0){if(window.DreadingExplosionFX?.ready)DreadingExplosionFX.spawn(e.p,e.fxRadius||Math.max(2.5,(e.radius||6)*.45));else if(T.combat.fx)TacticalNS.impactFx(T.combat.fx,e.p,[0,1,0],true);window.DreadingNight?.flash(e.p,16,.6);}}
 // Smoke lifetime and late joins are replicated from the persistent cloud list.
 else if(e.type==='flashBang'&&N.slot===1&&I.fps){const f=I.fps,k=T.grenades.flashSeen(e.p,TacticalNS.entEye(f.s),TacticalNS.fwd(f.yaw,f.pitch));if(k)I.flashed={t:3,d:3,i:k};}
}
async function syncWorld(){if(worldBusy||!worldDesired.length)return;worldBusy=true;const list=worldDesired;worldDesired=[];try{for(const v of list){const b=T.town.buildings[v.id];if(!b)continue;if(b.state!==v.state)await T.town.setState(v.id,v.state);if(v.panels?.length)DreadingImportedDamage.networkApply(b,v.panels);}}catch(e){console.error('[MP] world sync',e);}finally{worldBusy=false;}}
function applyState(m){window.DreadingFireSupport?.receive(m.support);window.DreadingObjectives?.receive(m.objectives);window.DreadingMPPrep?.receive(m.prep);T.elapsed=m.clock;for(const cloud of m.smokes||[]){let local=smokeClouds.get(cloud.id);if(!local){local=T.grenades.smokeStart(cloud.p,null);smokeClouds.set(cloud.id,local);}local.t=cloud.t;}for(const [id,cloud]of smokeClouds)if(!(m.smokes||[]).some(c=>c.id===id)){cloud.t=1000;smokeClouds.delete(id);}for(const v of m.players){const s=units.find(s=>s.uid===v.uid);if(!s)continue;const local=I.fps?.s===s,p=s.pos();if(!local||Math.hypot(...p.map((x,i)=>x-v.p[i]))>1.25){s.entity.setPosition(...v.p);if(local){I.fps.groundY=v.p[1];I.fps.eyeG=v.p[1];}}
 if(!local){s.lookYaw=v.yaw;s.pitch=v.pitch;s.crouchAmt=v.crouch;s.speedNow=v.speed;s.moving=v.moving;s.controlled=v.controlled;}
 s.squadKey=v.squadKey||s.squadKey;s.disabled=!!v.disabled;s.entity.enabled=!s.disabled;if(v.kit&&JSON.stringify(s.prepKit)!==JSON.stringify(v.kit)){s.prepKit=v.kit;s.role=v.kit.cls;s.soldierName=v.kit.name;DreadingPrep.applyLocalKits({squad:[s]},{squad:[v.kit]});}if(v.alive&&s.visualRetired)s.reset();s.health=v.hp;s.alive=v.alive;s.deathT=v.deathT;s.lastShotT=v.lastShot;s.decision=v.decision;s.nadeInv=v.inventory;s.blindT=v.blind;if(!local)s.order=v.order;
 const slot=v.armsIdx===1?1:0;
  if(!s.loadout[slot]||s.loadout[slot].def.id!==v.weapon)s.loadout[slot]=TacticalNS.makeArms(TacticalNS.WEAPONS[v.weapon]);
  s.armsIdx=slot;s.arms=s.loadout[slot];if(slot===0&&s.prepKit?.suppressedPrimary&&!s.arms.def.suppressed)s.arms.def={...s.arms.def,noise:22,loud:false,suppressed:true};
 if(!local||!I.fps.fire){Object.assign(s.arms,v.arms);}
 }
 const seen=new Set();for(const v of m.zombies||[]){seen.add(v.uid);let z=zombies.get(v.uid);if(!z){z=T.zombieMgr.spawn(v.p,v.type);if(!z)continue;zombies.set(v.uid,z);}if(v.hitReaction!==undefined&&v.hitReaction!==(z.hitReaction||0)){z.tiltV-=60;z.hitReaction=v.hitReaction;}if(!z.model)T.zombieMgr.createVisual(z);z.uid=v.uid;z.entity.setPosition(...v.p);z.yaw=v.yaw;z.health=v.hp;z.alive=v.alive;z.state=v.state;z.deadT=v.deadT;z.moving=v.moving;z.speedNow=v.speed;z.animRate=v.rate;if(v.clip&&z.clip!==v.clip)T.zombieMgr.play(z,v.clip,true);}
 for(const [id,z]of zombies)if(!seen.has(id)){T.zombieMgr.despawn(z);zombies.delete(id);}
 const liveN=new Set();for(const n of m.nades||[]){liveN.add(n.id);let e=nades.get(n.id);if(!e){e=new pc.Entity('Network grenade');e.addComponent('render',{type:'sphere',material:T.grenades.pool[0]?.render?.material});e.setLocalScale(.12,.12,.12);T.root.addChild(e);nades.set(n.id,e);}e.setPosition(...n.p);}for(const [id,e]of nades)if(!liveN.has(id)){e.destroy();nades.delete(id);}
 const liveD=new Set();for(const v of m.drones||[]){liveD.add(v.id);let d=drones.get(v.id);if(!d){d=T.drones.spawn(v.kind,units.find(s=>s.uid===v.uid),v.p,v.yaw,v.pitch);drones.set(v.id,d);}d.pos=v.p;d.yaw=v.yaw;d.pitch=v.pitch;d.roll=v.roll;d.hp=v.hp;d.t=v.t;if(v.pilot&&I.fps?.s===d.owner)T.drones.pilot={d};}for(const [id,d]of drones)if(!liveD.has(id)){d.e?.destroy();T.drones.list=T.drones.list.filter(x=>x!==d);if(T.drones.pilot?.d===d)T.drones.pilot=null;drones.delete(id);}
 for(const e of m.events||[]){if(e.id<=lastEvent)continue;lastEvent=e.id;if(e.at===undefined||m.clock-e.at<1)effect(e);}
 if(m.power&&T.power){T.power.on=m.power.on;T.power.team=m.power.team;}
 worldDesired=m.world||[];syncWorld();
}
function tick(dt){const now=performance.now();T.sandbox=true;T.outcome=null;T.running=true;T.paused=!active();
 if(now-lastPing>1000){send({type:'ping',at:Date.now()});if(N.slot===1)send({type:'ready'});lastPing=now;}
 if(N.slot===0){
  if(remoteFrame&&remote.fps){const m=remoteFrame;remoteFrame=null;const f=remote.fps;remote.keys=m.keys;f.yaw=m.yaw;f.pitch=m.pitch;f.ads=m.ads;f.fire=m.fire;f.firePressed=f.firePressed||m.pressed;withRemote(()=>{if(m.pressed&&T.drones.pilot)T.drones.pilot.d.boom=true;for(const a of m.actions){if(a==='releaseG')T.grenades.release(remote);else TacticalRtsInput.prototype.onKey.call(remote,{code:a,repeat:false,preventDefault(){}});}});}
  if(now-lastRemote>300){remote.keys={};if(remote.fps){remote.fps.fire=false;remote.fps.firePressed=false;}}
  if(active()&&remote.fps){const camera=T.camera,p=camera.getPosition().clone(),r=camera.getRotation().clone(),fov=camera.camera.fov;try{withRemote(()=>{TacticalRtsInput.prototype.fpsTick.call(remote,Math.min(dt,.05));if(remote.fps)T.grenades.playerTick(Math.min(dt,.05),remote);});}catch(e){console.error('[MP] remote control',e);}finally{camera.setPosition(p);camera.setRotation(r);camera.camera.fov=fov;}}
  if(now-lastSnapshot>=75){const packet=snapshot();packet.prep=window.DreadingMPPrep?.state;packet.objectives=window.DreadingObjectives?.state;packet.smokes=T.grenades.smokes.map(s=>({id:s._netId||(s._netId=++eventId),p:s.p,t:s.t}));send(packet);lastSnapshot=now;}
 }else{if(I.fps&&now-lastSend>=45)sendFrame();if(state){const m=state;state=null;applyState(m);}}
 if(N.slot===2&&!I._spectatorPlaced&&units.some(s=>s.alive&&!s.disabled)){I._spectatorPlaced=true;I.spectate(0);setTimeout(()=>I.spectate(0),900);}
 const alive=units.filter(s=>(N.slot===2||own(s))&&s.alive&&!s.disabled).length;status.textContent=(N.slot===2?'Spectating both commanders':'Side '+(N.slot+1))+' · '+(active()?(N.players.every(Boolean)?'Connected · '+N.rtt+' ms':'Practice · waiting for the other commander'):(window.DreadingMPPrep&&!DreadingMPPrep.canPlay()?'Choose your squad':(window.DreadingControl&&DreadingObjectives.state.match?('Match '+DreadingObjectives.state.match.phase):'Waiting for host connection…')))+' · '+alive+' soldiers · '+T.zombies.filter(z=>z.alive).length+' zombies';
}
setInterval(boot,200);connect();
})();
