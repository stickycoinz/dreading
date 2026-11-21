/* Two opposing commanders in the existing battle. Host owns world simulation.
   Guest predicts only the possessed soldier; orders and action intents execute on host. */
(function(){'use strict';
const N=window.DreadingMultiplayer={slot:null,playerId:null,isHost:false,epoch:0,ready:false,connected:false,players:[false,false],rtt:0,lastState:0,rejected:0,received:0};
let ws,T,app,I,units,orders,remote,readyGuest=false,state=null,actions=[],lastSend=0,lastSnapshot=0,lastPing=0,lastRemote=0,lastEvent=0,eventId=0,events=[],worldBusy=false,worldDesired=[],applying=false,originalShoot,originalRay,remoteFrame=null;
let remoteId=1;const remotes=new Map(),remoteFrames=new Map(),remoteTimes=new Map();const sideFor=id=>id===3?0:id===4?1:id;
const held=[null,null,null,null,null],pilots=[null,null,null,null,null],zombies=new Map(),drones=new Map(),nades=new Map();
const smokeClouds=new Map();
/* ---- netv2 (DREADING_perf GGD-4): unreliable 20 Hz binary snapshots + interpolation + own-soldier reconciliation.
   Active only when the transport offers a fast lane (net=peer); ?netv2=0 restores the old behaviour. ---- */
const V2=new URLSearchParams(location.search).get('netv2')!=='0';
const remoteSeq=new Map(),intents=new Map(),snaps=[],hist=new Array(128),clipIdx=new Map();let clipNames=[],fastSeq=0,lastFast=0,lastEventSent=0,clockOff=null,jit=.02,fastAt=0,frameSeq=0,lastAck=-1,corrX=0,corrZ=0,fullN=0,lastPrepJ='',lastPrepAt=0;
const fbuf=new ArrayBuffer(65536),FQ=32;const NS=N.netStats={fastRx:0,fastLate:0,ownAcks:0,ownCorrM:0,ownHardSnaps:0,interpMs:0,extrap:0,fullTx:0,fastTx:0,fastBytes:0,stateMs:0};
/* full-state deltas (idea from delta snapshots): per player/zombie only send entries whose non-pose fields changed;
   unchanged ones carry just uid + rounded position. The guest merges into its cache. Complete refresh every 8th full (2 s). */
const fullCache={players:new Map(),zombies:new Map()},POSE=new Set(['p','yaw','pitch','crouch','speed','moving','rate','lastShot']);
const r2=v=>Array.isArray(v)?v.map(x=>typeof x==='number'?Math.round(x*100)/100:x):v;
function deltaList(list,key,refresh){const out=[],C=fullCache[key];for(const v of list){let c=C.get(v.uid);const fresh=!c;if(fresh)C.set(v.uid,c={});const o={uid:v.uid,$d:1};
 for(const k in v){if(k==='uid')continue;const x=k==='p'?r2(v[k]):v[k];if(POSE.has(k)&&k!=='p'){if(refresh||fresh)o[k]=x;continue;}const j=JSON.stringify(x);if(refresh||fresh||c[k]!==j){o[k]=x;c[k]=j;}}
 if(refresh||fresh)delete o.$d;out.push(o);}for(const u of C.keys())if(!list.some(v=>v.uid===u))C.delete(u);return out;}
const guestCache={players:new Map(),zombies:new Map()};
function mergeList(list,key){if(!list)return list;const c=guestCache[key],seen=new Set();const out=list.map(v=>{seen.add(v.uid);const old=c.get(v.uid);if(v.$d){if(!old)return v;for(const k in v)if(k!=='$d')old[k]=v[k];return old;}const n=Object.assign({},v);delete n.$d;c.set(v.uid,n);return n;}).filter(v=>!v.$d);for(const k of c.keys())if(!seen.has(k))c.delete(k);return out;}
const fastLive=()=>V2&&performance.now()-fastAt<600;
const qp=v=>Math.max(-32767,Math.min(32767,Math.round(v*FQ))),qa=a=>{a=((a+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;return Math.round(a*10430);};
const lerpA=(a,b,t)=>{let d=b-a;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return a+d*t;};
const clipI=n=>{if(!n)return 255;let i=clipIdx.get(n);if(i===undefined){if(clipNames.length>=254)return 255;i=clipNames.length;clipNames.push(n);clipIdx.set(n,i);}return i;};
function fastSnap(){const dv=new DataView(fbuf);let o=0;dv.setUint8(o++,1);fastSeq=(fastSeq+1)&65535;dv.setUint16(o,fastSeq);o+=2;dv.setFloat64(o,T.elapsed);o+=8;
 const rs=[...remotes.keys()];dv.setUint8(o++,rs.length);for(const id of rs){const r=remotes.get(id);dv.setUint8(o++,id);dv.setUint32(o,r.fps?r.fps.s.uid>>>0:0xffffffff);o+=4;dv.setInt32(o,remoteSeq.get(id)??-1);o+=4;}
 dv.setUint16(o,units.length);o+=2;for(const s of units){const e=s.entity.getPosition();dv.setUint32(o,s.uid>>>0);dv.setInt16(o+4,qp(e.x));dv.setInt16(o+6,qp(e.y));dv.setInt16(o+8,qp(e.z));dv.setInt16(o+10,qa(s.lookYaw||0));dv.setInt8(o+12,Math.round(Math.max(-1.5,Math.min(1.5,s.pitch||0))*84));dv.setUint8(o+13,(s.alive?1:0)|(s.moving?2:0)|(s.disabled?4:0));dv.setUint8(o+14,Math.min(255,Math.round((s.speedNow||0)*20)));dv.setUint8(o+15,Math.round(Math.max(0,Math.min(1,s.crouchAmt||0))*255));o+=16;}
 const zc=o;o+=2;let n=0;for(const z of T.zombies){if(o>65000)break;const e=z.entity.getPosition();dv.setUint32(o,z.uid>>>0);dv.setInt16(o+4,qp(e.x));dv.setInt16(o+6,qp(e.y));dv.setInt16(o+8,qp(e.z));dv.setInt16(o+10,qa(z.yaw||0));dv.setUint8(o+12,clipI(z.clip));dv.setUint8(o+13,Math.min(255,Math.round((z.animRate||1)*50)));dv.setUint8(o+14,(z.alive?1:0)|(z.moving?2:0));dv.setUint8(o+15,Math.min(255,Math.round((z.speedNow||0)*20)));o+=16;n++;}dv.setUint16(zc,n);return fbuf.slice(0,o);}
function fastIn(d){if(N.isHost||!units||!(d instanceof ArrayBuffer)||d.byteLength<14)return;const dv=new DataView(d);if(dv.getUint8(0)!==1)return;let o=3;const clock=dv.getFloat64(o);o+=8;NS.fastRx++;
 const last=snaps[snaps.length-1];if(last&&clock<=last.clock){if(clock<last.clock-2)snaps.length=0;else{NS.fastLate++;return;}}
 let ownUid=-1,ack=-1;const nr=dv.getUint8(o++);for(let i=0;i<nr;i++){const id=dv.getUint8(o),uid=dv.getUint32(o+1),a=dv.getInt32(o+5);o+=9;if(id===N.playerId){ownUid=uid;ack=a;}}
 const sm=new Map(),ns=dv.getUint16(o);o+=2;for(let i=0;i<ns;i++){sm.set(dv.getUint32(o),[dv.getInt16(o+4)/FQ,dv.getInt16(o+6)/FQ,dv.getInt16(o+8)/FQ,dv.getInt16(o+10)/10430,dv.getInt8(o+12)/84,dv.getUint8(o+13),dv.getUint8(o+14)/20,dv.getUint8(o+15)/255]);o+=16;}
 const zm=new Map(),nz=dv.getUint16(o);o+=2;for(let i=0;i<nz;i++){zm.set(dv.getUint32(o),[dv.getInt16(o+4)/FQ,dv.getInt16(o+6)/FQ,dv.getInt16(o+8)/FQ,dv.getInt16(o+10)/10430,dv.getUint8(o+12),dv.getUint8(o+13)/50,dv.getUint8(o+14),dv.getUint8(o+15)/20]);o+=16;}
 const sample=clock-performance.now()/1000;if(clockOff===null||Math.abs(sample-clockOff)>1)clockOff=sample;else{const dev=sample-clockOff;jit+=(Math.abs(dev)-jit)*.05;clockOff+=dev*(dev>0?.06:.01);}
 snaps.push({clock,s:sm,z:zm});if(snaps.length>40)snaps.shift();fastAt=performance.now();if(ownUid!==0xffffffff)reconcile(ownUid,ack,sm.get(ownUid));}
function reconcile(uid,ack,H){const f=I?.fps;if(!f||f.s.uid!==uid||!H||ack<0||ack<=lastAck)return;const h=hist[ack&127];if(!h||h.seq!==ack)return;lastAck=ack;NS.ownAcks++;
 const ex=H[0]-h.x,ez=H[2]-h.z,e=Math.hypot(ex,ez);if(e<.1)return;for(const x of hist)if(x&&x.seq>ack){x.x+=ex;x.z+=ez;}
 if(e>3){f.s.entity.setPosition(H[0],H[1],H[2]);f.groundY=f.eyeG=H[1];corrX=corrZ=0;NS.ownHardSnaps++;return;}corrX+=ex;corrZ+=ez;NS.ownCorrM+=e;}
function interp(dt){if(!snaps.length||!fastLive())return;const nowS=performance.now()/1000,delay=Math.min(.2,Math.max(.075,.05+2.5*jit));NS.interpMs=Math.round(delay*1000);const est=nowS+clockOff,rt=est-delay;
 if(est>T.elapsed||T.elapsed-est>.5)T.elapsed=est;
 let i=snaps.length-1;while(i>0&&snaps[i].clock>rt)i--;let a=snaps[i],b=snaps[i+1]||null,t=0;
 if(b)t=Math.max(0,Math.min(1,(rt-a.clock)/Math.max(1e-3,b.clock-a.clock)));else if(i>0&&rt>a.clock){b=a;a=snaps[i-1];const span=Math.max(1e-3,b.clock-a.clock);t=Math.min(1+.15/span,(rt-a.clock)/span);NS.extrap++;}
 const own=I.fps?.s;for(const s of units){if(s===own||!s.alive)continue;const A=a.s.get(s.uid);if(!A)continue;const B=b?b.s.get(s.uid)||A:A;let k=t;if(Math.abs(B[0]-A[0])+Math.abs(B[2]-A[2])>4)k=1;
  s.entity.setPosition(A[0]+(B[0]-A[0])*k,A[1]+(B[1]-A[1])*k,A[2]+(B[2]-A[2])*k);s.lookYaw=lerpA(A[3],B[3],Math.min(1,k));s.pitch=A[4]+(B[4]-A[4])*Math.min(1,k);s.moving=!!(B[5]&2);s.speedNow=B[6];s.crouchAmt=B[7];}
 for(const [uid,z]of zombies){if(!z.alive||!z.entity)continue;const A=a.z.get(uid);if(!A)continue;const B=b?b.z.get(uid)||A:A;let k=t;if(Math.abs(B[0]-A[0])+Math.abs(B[2]-A[2])>4)k=1;
  z.entity.setPosition(A[0]+(B[0]-A[0])*k,A[1]+(B[1]-A[1])*k,A[2]+(B[2]-A[2])*k);z.yaw=lerpA(A[3],B[3],Math.min(1,k));z.moving=!!(B[6]&2);z.speedNow=B[7];z.animRate=B[5];const name=clipNames[B[4]];if(name&&z.clip!==name&&z.model)T.zombieMgr.play(z,name,true);}
 if(own&&(corrX||corrZ)){const k=Math.min(1,dt*5),p=own.entity.getPosition();own.entity.setPosition(p.x+corrX*k,p.y,p.z+corrZ*k);corrX*=1-k;corrZ*=1-k;if(Math.abs(corrX)+Math.abs(corrZ)<.005)corrX=corrZ=0;}}
const METHODS=['moveGroup','takeCover','startBrain','focusFire','startHunt','startAssault','assignSectors'];
const box=document.createElement('div');box.id='mp-panel';box.style.cssText='position:fixed;left:12px;top:8px;z-index:10001;background:#101712ee;color:#dce9d0;padding:8px 12px;font:12px/1.5 system-ui;max-width:520px';box.innerHTML='<b>DREADING · OPPOSING COMMANDERS</b><div id="mp-status">Loading battle…</div><small>Combat test · Construction / loot / extraction still planned</small>';document.body.appendChild(box);
const style=document.createElement('style');style.textContent='#tl-panel{display:none!important}body.tl-play #tl-ctl{display:none!important}#mp-panel{pointer-events:auto}.tlh{z-index:40}';document.head.appendChild(style);
const status=document.getElementById('mp-status');
function send(m){if(ws?.readyState===1&&ws.bufferedAmount<256*1024){if(V2&&ws.sendObj)ws.sendObj(m);else ws.send(JSON.stringify(m));}}
function active(){return N.ready&&N.connected&&(!window.DreadingControl||DreadingControl.playable())&&(!window.DreadingMPPrep||DreadingMPPrep.canPlay())&&(N.isHost||(N.players[0]&&performance.now()-N.lastState<2000));}
function own(s,side=N.slot){return s&&s._netOwner===side;}
function withSide(side,fn){const previous=T.orders;T.orders=orders[side];try{return fn();}finally{T.orders=previous;}}
function asRemote(id,fn){const previous=remoteId,old=remote;remoteId=id;remote=remotes.get(id)||remote;try{return fn();}finally{remoteId=previous;remote=old;}}
function withRemote(fn){const oldInput=T.input,oldHeld=T.grenades.held,oldPilot=T.drones.pilot;T.input=remote;T.grenades.held=held[remoteId];T.drones.pilot=pilots[remoteId];try{return withSide(sideFor(remoteId),fn);}finally{held[remoteId]=T.grenades.held;pilots[remoteId]=T.drones.pilot;T.input=oldInput;T.grenades.held=oldHeld;T.drones.pilot=oldPilot;}}
function emit(type,data){const e={id:++eventId,at:T.elapsed,type,...data};events.push(e);if(events.length>256)events.shift();effect(e);}
function encode(v,depth=0){if(depth>8)return null;if(v===null||v===undefined||typeof v!=='object')return v??null;if(units.includes(v))return {$unit:v.uid};if(v.isZombie)return {$zombie:v.uid};if(Array.isArray(v))return v.map(x=>encode(x,depth+1));const out={};for(const [k,x]of Object.entries(v)){if(typeof x==='function'||['app','entity','model','parent','tree','memory'].includes(k))continue;out[k]=encode(x,depth+1);}return out;}
function decode(v){if(!v||typeof v!=='object')return v;if('$unit'in v)return units.find(s=>s.uid===v.$unit);if('$zombie'in v)return T.zombies.find(z=>z.uid===v.$zombie);if(Array.isArray(v))return v.map(decode);const out={};for(const [k,x]of Object.entries(v))if(!['__proto__','constructor','prototype'].includes(k))out[k]=decode(x);return out;}
function command(m){
 const side=sideFor(remoteId);
 if(window.DreadingTeamSupport?.command(m,side))return;
 if(window.DreadingFireSupport?.command(m,1))return;
 if(N.api?.onCommand?.(m,side))return;
 if(m.method==='muzzle'){const [uid,weapon,offset]=m.args||[],s=units.find(s=>s.uid===uid);if(own(s,sideFor(remoteId))&&remote.fps?.s===s&&s.alive&&weapon===s.arms.def.id&&window.DreadingShotOrigin?.validOffset(offset))s._netMuzzle={weapon,offset:offset.slice(),at:T.elapsed};return;}
 if(m.method==='power'){
  const point=m.args?.[0];if(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite)){N.rejected++;return;}
  const pick=remote.pickWorld;remote.pickWorld=()=>({point});remote.commandTeam=sideFor(remoteId)===0?'friendly':'enemy';try{withRemote(()=>TacticalRtsInput.prototype.powerAtCursor.call(remote));N.received++;}finally{remote.pickWorld=pick;}return;
 }
 if(m.method==='equipment'){
  const [uid,key,shift,point]=m.args||[],s=units.find(s=>s.uid===uid);
  if(!own(s,sideFor(remoteId))||!s.alive||s.controlled||!['KeyJ','KeyK','KeyU'].includes(key)||point!==null&&(!Array.isArray(point)||point.length!==3||!point.every(Number.isFinite))){N.rejected++;return;}
  const previous=T.selection,friendlies=remote.friendlies,pick=remote.pickWorld;T.selection=[s];remote.friendlies=()=>[s];remote.pickWorld=()=>point?{point}:null;
  remote.commandTeam=sideFor(remoteId)===0?'friendly':'enemy';try{withRemote(()=>TacticalRtsInput.prototype.equipOrder.call(remote,key,!!shift));N.received++;}finally{T.selection=previous;remote.friendlies=friendlies;remote.pickWorld=pick;}return;
 }
 if(!METHODS.includes(m.method)||!Array.isArray(m.args))return;const args=decode(m.args),group=args[m.method==='startBrain'?1:0];if(!Array.isArray(group)||!group.length||group.some(s=>!own(s,sideFor(remoteId))||!s.alive||s.controlled)){N.rejected++;return;}try{withSide(side,()=>orders[side][m.method](...args));N.received++;}catch(e){console.warn('[MP] order rejected',e.message);N.rejected++;}}
function possess(uid){if(uid!==null){const requested=units.find(s=>s.uid===uid);if(!own(requested,sideFor(remoteId))||!requested.alive||requested.controlled&&remote.fps?.s!==requested){N.rejected++;return false;}}if(remote.fps){const old=remote.fps.s;withRemote(()=>orders[sideFor(remoteId)].stopFollow());old.controlled=false;old.stop();old.order={type:'move',dest:old.pos(),by:'player'};remote.fps=null;}
 if(uid===null)return;const s=units.find(s=>s.uid===uid);if(!own(s,sideFor(remoteId))||!s.alive){N.rejected++;return;}s.controlled=true;s.stop();T.cover.release(s);s.inCover=false;s.order={type:'player',by:'direct'};s.target=null;s.vel=[0,0];const y=s.pos()[1];remote.fps={s,yaw:s.lookYaw,pitch:s.pitch||0,fire:false,firePressed:false,ads:false,sprintW:0,eyeH:1.62,airY:0,vy:0,jump:false,kick:0,kickV:0,jumps:0,groundY:y,eyeG:y,eyeGv:0};withRemote(()=>orders[sideFor(remoteId)].startFollow(s));}
function connect(){ws=new (window.DreadingRoomSocket||WebSocket)((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/room');ws.onopen=()=>N.connected=true;ws.onclose=()=>{N.connected=false;readyGuest=false;N.players=[false,false];if(I){I.keys={};if(I.fps)I.fps.fire=false;}status.textContent='Disconnected — reload your invitation to reconnect.';};ws.onerror=()=>{};
const handle=m=>{if(!m||typeof m!=='object')return;if(m.type==='welcome'){N.playerId=m.slot;N.slot=sideFor(m.slot);N.isHost=m.slot===0;N.epoch=m.epoch;boot();}else if(m.type==='presence'){N.players=m.players;fullN=7;if(N.epoch!==m.epoch&&N.ready&&!N.isHost){location.reload();return;}N.epoch=m.epoch;if(N.isHost)for(const id of [1,3,4]){const index=id===3?2:id===4?3:1;if(!m.players[index]&&remotes.has(id))asRemote(id,()=>possess(null));}if(N.ready&&(!N.isHost&&N.slot!==2))send({type:'ready'});}else if(m.type==='pong')N.rtt=Date.now()-m.at;else if(m.type==='ready')readyGuest=true;else if(m.type==='state'){if(m.full!==undefined&&!N.isHost){/* merge every delta on arrival, even if a newer one replaces it before the next frame */m.players=mergeList(m.players,'players');m.zombies=mergeList(m.zombies,'zombies');}state=m;N.lastState=performance.now();}else if(m.type==='ev'){if(!N.isHost&&N.ready)for(const e of m.events||[]){if(e.id<=lastEvent)continue;lastEvent=e.id;if(e.at===undefined||T.elapsed-e.at<1)effect(e);}}else if(N.ready&&N.isHost){if(m.type==='director'){window.DreadingDirector?.command(m);return;}const id=m.sender??1;if(![1,3,4].includes(id))return;asRemote(id,()=>{if(m.type==='command')command(m);else if(m.type==='control')possess(m.uid);else if(m.type==='frame'){if(!remote.fps||remote.fps.s.uid!==m.uid)return;remoteTimes.set(id,performance.now());
  /* one-shot intents (fire press, reload, grenade...) accumulate across frames instead of being overwritten by the next frame */
  if(m.pressed||m.actions?.length){const it=intents.get(id)||{pressed:false,actions:[]};it.pressed=it.pressed||!!m.pressed;if(m.actions?.length)it.actions=it.actions.concat(m.actions).slice(-16);intents.set(id,it);}
  if(m.muzzle)command({type:'command',method:'muzzle',args:[m.uid,m.weapon,m.muzzle]});
  const prev=remoteFrames.get(id);if(m.seq!==undefined&&(m.seq<=(remoteSeq.get(id)??-1)||prev?.seq>m.seq))return;remoteFrames.set(id,m);}});}};
ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}handle(m);};ws.onobject=handle;ws.onfast=fastIn;}
function makeOrders(side){const O=Object.create(orders[0]);O.initialize();O.brain=O.follow=O.hunt=O.assault=null;O.enemyTactics=()=>{};O.matchRules=()=>{};O.brainSeq=side*100000;O.team=t=>units.filter(s=>s._netOwner===(t==='friendly'?side:1-side)&&!s.disabled);O.localTeam=side===0?'friendly':'enemy';return O;}
function boot(){if(N.ready||N.slot===null||!window.tactical?.T.ready||!tactical.T.zombieMgr?.ready)return;
 app=tactical.app;T=tactical.T;I=T.input;
 if(new URLSearchParams(location.search).get('pick')==='1'){for(const team of ['friendly','enemy']){const base=T.squad.filter(s=>s.team===team),p=base[base.length-1].pos();T.spawnMultiplayerSoldiers(Array.from({length:DreadingCatalogue.capacity-base.length},(_,j)=>j+base.length).map((i)=>{const candidate=[p[0]+((i%6)-2)*1.5,p[1],p[2]-2-Math.floor(i/6)*1.5],near=T.navigation.nearest(candidate,[2,2,2]);return {name:team+' reserve '+i,team,role:'Rifleman',position:near?.point||candidate};}));}}
 units=T.squad;units.forEach(s=>{s._netOwner=s.team==='friendly'?0:1;s.ownerId=s._netOwner;});
 const originalOrders=T.orders;orders=[originalOrders,null];if(N.isHost){orders[1]=makeOrders(1);T.orders=originalOrders;orders[0].enemyTactics=()=>{};orders[0].matchRules=()=>{};const update=originalOrders.update;originalOrders.update=function(dt){if(!active())return;withSide(0,()=>update.call(orders[0],dt));withSide(1,()=>update.call(orders[1],dt));};
 }else{orders[1]=originalOrders;orders[0]=originalOrders;originalOrders.update=()=>{};units.forEach(s=>{s.team=own(s)?'friendly':'enemy';if(s.row)s.row.style.display=own(s)?'':'none';});}
 T.localOwnerId=N.slot;T.localTeam='friendly';T.sandbox=true;T.outcome=null;T.initiative=false;
 // Strategic movement belongs to both human commanders. Individual squad AI still runs.
 if(T.strategy){T.strategy.planTick=()=>{};T.strategy.plans={};}
 originalShoot=T.combat.shoot.bind(T.combat);originalRay=T.combat.fireRay.bind(T.combat);
 const updateSoldier=TacticalSoldierDecision.prototype.update;
 for(const s of units)s.update=function(dt){if(this.disabled||!active())return;if(N.isHost)return withSide(this._netOwner,()=>updateSoldier.call(this,dt));if(I.fps?.s===this){TacticalNS.tickWeapon(this.arms,Math.min(dt,.05),this.input);this.crouchAmt+=((this.wantCrouch?1:0)-this.crouchAmt)*Math.min(1,dt*12);}};
 remote=Object.create(I);remote.fps=null;remote.keys={};remote.vm=null;remote.hudCache={};remote.vmTick=remote.setText=remote.setCross=remote.hitmarker=remote.toast=()=>{};remote.exitControl=()=>asRemote(1,()=>possess(null));remote.hud={veil:{style:{}}};remote.flashed=null;remotes.set(1,remote);for(const id of [3,4]){const r=Object.create(remote);r.fps=null;r.keys={};r.hudCache={};r.exitControl=()=>asRemote(id,()=>possess(null));remotes.set(id,r);}
 const enter=I.enterControl,exit=I.exitControl,key=I.onKey,fpsTick=I.fpsTick;
 I.enterControl=function(s){if(!own(s)||!s.alive||!active())return false;if(s.controlled&&this.fps?.s!==s){this.toast('Your teammate is controlling this soldier.');return false;}const r=enter.call(this,s);if(r&&(!N.isHost&&N.slot!==2)){this._controlRequestedAt=performance.now();send({type:'control',uid:s.uid});}return r;};
 I.exitControl=function(why){const r=exit.call(this,why);if((!N.isHost&&N.slot!==2))send({type:'control',uid:null});return r;};
 I.onKey=function(e){if(['KeyP','Pause','KeyI'].includes(e.code))return;if(this.fps&&(!N.isHost&&N.slot!==2)&&['KeyR','KeyC','Space','Digit1','Digit2','BracketLeft','BracketRight','KeyG','KeyZ','KeyB','KeyU'].includes(e.code)&&!e.repeat&&!e.altKey)actions.push(e.code);return key.call(this,e);};
 window.addEventListener('keyup',e=>{if(e.code===(window.DreadingSettings?.data.bindings.KeyG||'KeyG')&&(!N.isHost&&N.slot!==2)&&I.fps)actions.push('releaseG');});
 window.addEventListener('blur',()=>{I.keys={};if(I.fps){I.fps.fire=false;I.fps.firePressed=false;}if((!N.isHost&&N.slot!==2))sendFrame();});
 I.fpsTick=function(dt){if(!active())return;if((!N.isHost&&N.slot!==2)&&performance.now()-lastSend>=40)sendFrame();return fpsTick.call(this,dt);};
 if(!N.isHost){
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
 T.combat.shoot=function(s,o,d,isPlayer){if(!active())return null;const r=originalShoot(s,o,d,isPlayer);if(r){if(N.isHost)emit('shot',{uid:s.uid,p:r.muzzle||o,weapon:s.arms.def.id});else DreadingAudio?.shot(s,o);}return r;};
 if(N.isHost){const zu=T.zombieMgr.update;T.zombieMgr.update=function(dt){if(active())zu.call(this,dt);};}
 // Network event effects and UI remain local; simulation stays with the host.
 if(N.slot===2){I.spectate=function(side){const group=units.filter(s=>s._netOwner===side&&s.alive&&!s.disabled);if(!group.length)return;I.resetView('spectator');I.cam.yaw=0;I.lookFrom(I.centroid(group),50,60);};const bar=document.createElement('div');bar.style.cssText='position:fixed;left:10px;bottom:45px;z-index:10002;background:#101b13;padding:6px';for(const side of [0,1]){const b=document.createElement('button');b.textContent='View Commander '+(side+1);b.onclick=()=>I.spectate(side);bar.appendChild(b);}document.body.appendChild(bar);I.equipOrder=I.powerAtCursor=()=>{};for(const method of METHODS)originalOrders[method]=()=>{};I.enterControl=()=>false;document.body.classList.add('dreading-spectator');const css=document.createElement('style');css.textContent='body.dreading-spectator #capture-objectives,body.dreading-spectator #tlh-cards,body.dreading-spectator #dob-strip{display:none!important}';document.head.appendChild(css);}
 N.api={units,orders,remote,remotes,releaseRemotes:()=>{for(const id of remotes.keys())asRemote(id,()=>possess(null));},command,send,spawnPoints:units.map(s=>s.pos())};N.ready=true;T.paused=false;T.running=true;T.selection=units.filter(s=>own(s)&&s.alive);I.home();send({type:'ready'});
 if(N.isHost)app.on('tactical:damage',(v,dmg,a,part)=>emit('damage',{uid:v.uid,damage:dmg,source:a?.pos?.()||null,kind:a?.isZombie?'Zombie attack':a?'Bullet hit':'Impact'}));app.on('update',tick);console.log('MULTIPLAYER_BATTLE_READY',N.slot,units.length);
}
function sendFrame(){if(!I?.fps)return;const f=I.fps;const muzzle=window.DreadingShotOrigin?.offset(T,f.s);
 if(V2&&ws?.sendFast&&ws.fastReady?.()){const seq=++frameSeq,p=f.s.entity.getPosition();hist[seq&127]={seq,x:p.x,y:p.y,z:p.z};const m={type:'frame',seq,uid:f.s.uid,yaw:f.yaw,pitch:f.pitch,keys:I.keys,ads:f.ads,fire:f.fire,pressed:f.firePressed,actions:actions.splice(0,8)};if(muzzle){m.muzzle=muzzle;m.weapon=f.s.arms.def.id;}
  /* intents ride the reliable channel; plain movement/aim rides the unreliable lane (newest wins) */
  if(m.pressed||m.actions.length||!ws.sendFast(JSON.stringify(m)))send(m);lastSend=performance.now();return;}
 if(muzzle)send({type:'command',method:'muzzle',args:[f.s.uid,f.s.arms.def.id,muzzle]});send({type:'frame',uid:f.s.uid,yaw:f.yaw,pitch:f.pitch,keys:I.keys,ads:f.ads,fire:f.fire,pressed:f.firePressed,actions:actions.splice(0,8)});lastSend=performance.now();}
function pack(s){return {uid:s.uid,owner:s._netOwner,disabled:!!s.disabled,squadKey:s.squadKey,kit:s.prepKit,p:s.pos(),yaw:s.lookYaw,pitch:s.pitch,hp:s.health,alive:s.alive,controlled:s.controlled,controller:I.fps?.s===s?N.playerId:([...remotes].find(([id,r])=>r.fps?.s===s)?.[0]??null),crouch:s.crouchAmt,speed:s.speedNow,moving:s.moving,lastShot:s.lastShotT,deathT:s.deathT,decision:s.decision,weapon:s.arms.def.id,armsIdx:s.armsIdx||0,arms:{mag:s.arms.mag,reserve:s.arms.reserve,reload:s.arms.reload,fireCd:s.arms.fireCd,adsW:s.arms.adsW},inventory:s.nadeInv,blind:s.blindT,order:s.order?{type:s.order.type,dest:s.order.dest,by:s.order.by,phase:s.order.phase}:null};}
function snapshot(){return {director:window.DreadingDirector?.snapshot(),support:window.DreadingFireSupport?.snapshot(),type:'state',epoch:N.epoch,clock:T.elapsed,players:units.map(pack),events:events.slice(-128),zombies:T.zombies.map(z=>({uid:z.uid,p:z.pos(),type:z.type,hp:z.health,alive:z.alive,yaw:z.yaw,clip:z.clip,rate:z.animRate,hitReaction:z.hitReaction||0,state:z.state,deadT:z.deadT,moving:z.moving,speed:z.speedNow})),nades:T.grenades.nades.map((n,i)=>({id:n._netId||(n._netId=++eventId),p:n.p,type:n.type})),drones:T.drones.list.filter(d=>!d.dead).map(d=>({id:d._netId||(d._netId=++eventId),kind:d.kind,uid:d.owner?.uid,p:d.pos,yaw:d.yaw,pitch:d.pitch,roll:d.roll,hp:d.hp,t:d.t,pilot:pilots.some(p=>p?.d===d)})),world:T.town.buildings.map(b=>({id:b.id,state:b.state,panels:window.DreadingImportedDamage?.networkState?.(b)||[]})),power:T.power?{on:T.power.on,team:T.power.team}:null};}
function effect(e){const s=units?.find(s=>s.uid===e.uid),A=window.DreadingAudio;if(e.type==='damage'){window.DreadingDamageHUD?.hit(e);return;}if(e.type==='shot'){if(N.isHost||s!==I.fps?.s)A?.shot(s,e.p,e.weapon);if(!N.isHost&&T.combat.fx&&s&&s!==I.fps?.s){const f=TacticalNS.fwd(s.lookYaw,s.pitch),o=e.p;TacticalNS.muzzleWorldFx(T.combat.fx,o,f,1);if(window.DreadingNight)DreadingNight.flash(o,6,.25);}}
 else if(e.type==='bullet'){A?.bullet(s,e.o,e.end,e.hit,e.wall);if(!N.isHost&&T.combat.fx){if(s!==I.fps?.s)T.combat.fx.tracers.add(e.o,e.end);if(e.hit&&s===I.fps?.s)I.hitmarker(false,e.kill);}}
 else if(e.type==='explode'){A?.explosion(e.p);if(!N.isHost){if(window.DreadingExplosionFX?.ready)DreadingExplosionFX.spawn(e.p,e.fxRadius||Math.max(2.5,(e.radius||6)*.45));else if(T.combat.fx)TacticalNS.impactFx(T.combat.fx,e.p,[0,1,0],true);window.DreadingNight?.flash(e.p,16,.6);}}
 // Smoke lifetime and late joins are replicated from the persistent cloud list.
 else if(e.type==='flashBang'&&(!N.isHost&&N.slot!==2)&&I.fps){const f=I.fps,k=T.grenades.flashSeen(e.p,TacticalNS.entEye(f.s),TacticalNS.fwd(f.yaw,f.pitch));if(k)I.flashed={t:3,d:3,i:k};}
}
async function syncWorld(){if(worldBusy||!worldDesired.length)return;worldBusy=true;const list=worldDesired;worldDesired=[];try{for(const v of list){const b=T.town.buildings[v.id];if(!b)continue;if(b.state!==v.state)await T.town.setState(v.id,v.state);if(v.panels?.length)DreadingImportedDamage.networkApply(b,v.panels);}}catch(e){console.error('[MP] world sync',e);}finally{worldBusy=false;}}
function applyState(m){window.DreadingDirector?.receive(m.director);window.DreadingFireSupport?.receive(m.support);window.DreadingObjectives?.receive(m.objectives);window.DreadingMPPrep?.receive(m.prep);const live=fastLive();if(m.clips)clipNames=m.clips;if(!live||Math.abs(T.elapsed-m.clock)>.75)T.elapsed=m.clock;for(const cloud of m.smokes||[]){let local=smokeClouds.get(cloud.id);if(!local){local=T.grenades.smokeStart(cloud.p,null);smokeClouds.set(cloud.id,local);}local.t=cloud.t;}for(const [id,cloud]of smokeClouds)if(!(m.smokes||[]).some(c=>c.id===id)){cloud.t=1000;smokeClouds.delete(id);}for(const v of m.players){const s=units.find(s=>s.uid===v.uid);if(!s)continue;if(I.fps?.s===s&&v.controller!==N.playerId&&performance.now()-(I._controlRequestedAt||0)>(V2?2000:800))I.exitControl('Teammate has control');const local=I.fps?.s===s,p=s.pos();if(live&&v.alive&&s.alive){/* netv2: pose comes from the interpolated fast lane; own soldier is reconciled */}else if(!local||Math.hypot(...p.map((x,i)=>x-v.p[i]))>1.25){s.entity.setPosition(...v.p);if(local){I.fps.groundY=v.p[1];I.fps.eyeG=v.p[1];}}
 if(!local){if(!live){s.lookYaw=v.yaw;s.pitch=v.pitch;s.crouchAmt=v.crouch;s.speedNow=v.speed;s.moving=v.moving;}s.controlled=v.controlled;}
 s.squadKey=v.squadKey||s.squadKey;s.disabled=!!v.disabled;s.entity.enabled=!s.disabled;if(v.kit&&JSON.stringify(s.prepKit)!==JSON.stringify(v.kit)){s.prepKit=v.kit;s.role=v.kit.cls;s.soldierName=v.kit.name;DreadingPrep.applyLocalKits({squad:[s]},{squad:[v.kit]});}if(v.alive&&s.visualRetired)s.reset();s.health=v.hp;s.alive=v.alive;s.deathT=v.deathT;s.lastShotT=v.lastShot;s.decision=v.decision;s.nadeInv=v.inventory;s.blindT=v.blind;if(!local)s.order=v.order;
 const slot=v.armsIdx===1?1:0;
  if(!s.loadout[slot]||s.loadout[slot].def.id!==v.weapon)s.loadout[slot]=TacticalNS.makeArms(TacticalNS.WEAPONS[v.weapon]);
  s.armsIdx=slot;s.arms=s.loadout[slot];if(slot===0&&s.prepKit?.suppressedPrimary&&!s.arms.def.suppressed)s.arms.def={...s.arms.def,noise:22,loud:false,suppressed:true};
 if(!local||!I.fps.fire){Object.assign(s.arms,v.arms);}
 }
 const seen=new Set();for(const v of m.zombies||[]){seen.add(v.uid);let z=zombies.get(v.uid),fresh=false;if(!z){z=T.zombieMgr.spawn(v.p,v.type);if(!z)continue;zombies.set(v.uid,z);fresh=true;}if(v.hitReaction!==undefined&&v.hitReaction!==(z.hitReaction||0)){z.tiltV-=60;z.hitReaction=v.hitReaction;}if(!z.model)T.zombieMgr.createVisual(z);z.uid=v.uid;const zl=live&&!fresh&&v.alive&&z.alive;if(!zl){z.entity.setPosition(...v.p);z.yaw=v.yaw;z.moving=v.moving;z.speedNow=v.speed;z.animRate=v.rate;}z.health=v.hp;z.alive=v.alive;z.state=v.state;z.deadT=v.deadT;if(!zl&&v.clip&&z.clip!==v.clip)T.zombieMgr.play(z,v.clip,true);}
 for(const [id,z]of zombies)if(!seen.has(id)){if(V2&&z.model){z.alive=true;}/* netv2: keep the skinned model pooled (no retire -> createVisual hitch on the next spawn) */T.zombieMgr.despawn(z);zombies.delete(id);}
 const liveN=new Set();for(const n of m.nades||[]){liveN.add(n.id);let e=nades.get(n.id);if(!e){e=new pc.Entity('Network grenade');e.addComponent('render',{type:'sphere',material:T.grenades.pool[0]?.render?.material});e.setLocalScale(.12,.12,.12);T.root.addChild(e);nades.set(n.id,e);}e.setPosition(...n.p);}for(const [id,e]of nades)if(!liveN.has(id)){e.destroy();nades.delete(id);}
 const liveD=new Set();for(const v of m.drones||[]){liveD.add(v.id);let d=drones.get(v.id);if(!d){d=T.drones.spawn(v.kind,units.find(s=>s.uid===v.uid),v.p,v.yaw,v.pitch);drones.set(v.id,d);}d.pos=v.p;d.yaw=v.yaw;d.pitch=v.pitch;d.roll=v.roll;d.hp=v.hp;d.t=v.t;if(v.pilot&&I.fps?.s===d.owner)T.drones.pilot={d};}for(const [id,d]of drones)if(!liveD.has(id)){d.e?.destroy();T.drones.list=T.drones.list.filter(x=>x!==d);if(T.drones.pilot?.d===d)T.drones.pilot=null;drones.delete(id);}
 for(const e of m.events||[]){if(e.id<=lastEvent)continue;lastEvent=e.id;if(e.at===undefined||m.clock-e.at<1)effect(e);}
 if(m.power&&T.power){T.power.on=m.power.on;T.power.team=m.power.team;}
 worldDesired=m.world||[];syncWorld();
}
function tick(dt){const now=performance.now();T.sandbox=true;T.outcome=null;T.running=true;T.paused=!active();
 if(now-lastPing>1000){send({type:'ping',at:Date.now()});if((!N.isHost&&N.slot!==2))send({type:'ready'});lastPing=now;}
 if(N.isHost){
  for(const id of remotes.keys())asRemote(id,()=>{
  const remoteFrame=remoteFrames.get(remoteId),lastRemote=remoteTimes.get(remoteId)||0;
  const it=intents.get(remoteId);if((remoteFrame||it)&&remote.fps){intents.delete(remoteId);const f=remote.fps;if(remoteFrame){const m=remoteFrame;remoteFrames.delete(remoteId);if(m.seq!==undefined)remoteSeq.set(remoteId,m.seq);remote.keys=m.keys;f.yaw=m.yaw;f.pitch=m.pitch;f.ads=m.ads;f.fire=m.fire;}const pressed=!!it?.pressed,acts=it?.actions||[];f.firePressed=f.firePressed||pressed;withRemote(()=>{if(pressed&&T.drones.pilot)T.drones.pilot.d.boom=true;for(const a of acts){if(a==='releaseG')T.grenades.release(remote);else TacticalRtsInput.prototype.onKey.call(remote,{code:a,repeat:false,preventDefault(){}});}});}
  if(now-lastRemote>(V2?500:300)){remote.keys={};if(remote.fps){remote.fps.fire=false;remote.fps.firePressed=false;}}
  if(active()&&remote.fps){const camera=T.camera,p=camera.getPosition().clone(),r=camera.getRotation().clone(),fov=camera.camera.fov;try{withRemote(()=>{TacticalRtsInput.prototype.fpsTick.call(remote,Math.min(dt,.05));if(remote.fps)T.grenades.playerTick(Math.min(dt,.05),remote);});}catch(e){console.error('[MP] remote control',e);}finally{camera.setPosition(p);camera.setRotation(r);camera.camera.fov=fov;}}
  });
  const v2=V2&&ws?.sendFast&&ws.fastReady?.();
  if(v2){/* 20 Hz unreliable binary pose snapshot; events as they happen; full reliable state at 4 Hz */
   if(now-lastFast>=48){const t0=performance.now(),b=fastSnap();if(ws.sendFast(b)){NS.fastTx++;NS.fastBytes+=b.byteLength;}NS.stateMs+=performance.now()-t0;lastFast=Math.max(lastFast+50,now-50);}
   const le=events.length?events[events.length-1].id:0;if(le>lastEventSent){send({type:'ev',events:events.filter(e=>e.id>lastEventSent)});lastEventSent=le;}}
  if(now-lastSnapshot>=(v2?250:75)){const t0=performance.now(),packet=snapshot();const prep=window.DreadingMPPrep?.state;packet.objectives=window.DreadingObjectives?.state;packet.smokes=T.grenades.smokes.map(s=>({id:s._netId||(s._netId=++eventId),p:s.p,t:s.t}));
   if(v2){fullN++;const refresh=fullN%8===0;packet.events=[];packet.clips=clipNames;const pj=prep?JSON.stringify(prep):'';if(refresh||pj!==lastPrepJ){packet.prep=prep;lastPrepJ=pj;}
    packet.players=deltaList(packet.players,'players',refresh);packet.zombies=deltaList(packet.zombies,'zombies',refresh);packet.full=refresh;NS.fullTx++;}
   else packet.prep=prep;send(packet);NS.stateMs+=performance.now()-t0;lastSnapshot=now;}
 }else{if(I.fps&&now-lastSend>=(V2&&ws?.fastReady?.()?33:45))sendFrame();if(state){const m=state;state=null;applyState(m);}if(V2)interp(Math.min(dt,.1));}
 if(N.slot===2&&!I._spectatorPlaced&&units.some(s=>s.alive&&!s.disabled)){I._spectatorPlaced=true;I.spectate(0);setTimeout(()=>I.spectate(0),900);}
 const alive=units.filter(s=>(N.slot===2||own(s))&&s.alive&&!s.disabled).length;status.textContent=(N.slot===2?'Spectating both commanders':'Side '+(N.slot+1))+' · '+(active()?(window.DreadingControl?.practice?'Solo test':N.players.every(Boolean)?'Connected · '+N.rtt+' ms':'Practice · waiting for the other commander'):(window.DreadingMPPrep&&!DreadingMPPrep.canPlay()?'Choose your squad':(window.DreadingControl&&DreadingObjectives.state.match?('Match '+DreadingObjectives.state.match.phase):'Waiting for host connection…')))+' · '+alive+' soldiers · '+T.zombies.filter(z=>z.alive).length+' zombies';
}
setInterval(boot,200);connect();
})();
