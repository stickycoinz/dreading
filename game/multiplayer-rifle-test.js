/* Isolated two-player transport adapter. Host browser owns damage; guest predicts walking.
   Deliberately restricted to two riflemen, static scenery and rifle combat for this first test. */
(function(){
'use strict';
const M=window.DreadingMultiplayer={slot:null,epoch:0,players:[false,false],ready:false,connected:false,rtt:0,seq:0,lastState:0,shots:0};
let ws,api,T,input,players,mine,other,spawn,sendAt=0,snapshotAt=0,pingAt=0,remoteAt=0,remoteFire=false,remoteReload=false,remotePose=null,pendingState=null,shotEvents=[],shotId=0,lastShotId=0,lastEpoch=-1,guestReady=false,reloadQueued=false;
const box=document.createElement('div');box.id='mp-panel';box.innerHTML='<strong>DREADING · TWO-PLAYER TEST</strong><div id="mp-status">Loading game and connecting…</div><button id="mp-enter" disabled>Enter first person</button> <button id="mp-respawn" disabled>Respawn</button><div id="mp-controls">WASD move · Shift sprint · C crouch · Mouse aim/fire · Right mouse aim · R reload · Esc release mouse</div><small>Rifle test · No squad AI, grenades or destruction yet</small>';document.body.appendChild(box);
const style=document.createElement('style');style.textContent='#mp-panel{position:fixed;left:12px;top:12px;z-index:9999;background:#101712ed;color:#e0e8d6;padding:12px;font:13px/1.5 system-ui;max-width:510px;border:1px solid #5b6c54}#mp-panel button{margin:8px 0;background:#c4dba6;border:0;padding:8px;cursor:pointer}#mp-panel button:disabled{opacity:.4}#mp-controls{max-width:440px}#mp-panel small{color:#aebaaa}#tl-panel,#tl-help,.tlh,#tl-ctl,.label{display:none!important}';document.head.appendChild(style);
const status=document.getElementById('mp-status'),enter=document.getElementById('mp-enter'),respawn=document.getElementById('mp-respawn');
function send(m){if(ws&&ws.readyState===1&&ws.bufferedAmount<65536)ws.send(JSON.stringify(m));}
function live(){return M.ready&&M.connected&&M.players[0]&&M.players[1]&&(M.slot===0?guestReady:performance.now()-M.lastState<1500);}
function connect(){ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/room');
 ws.onopen=()=>{M.connected=true;};
 ws.onclose=()=>{M.connected=false;M.players=[false,false];guestReady=false;if(input){input.keys={};if(input.fps){input.fps.fire=false;input.fps.firePressed=false;}}status.textContent='Disconnected. Close duplicate player tabs, then reload your invitation to reconnect.';};
 ws.onerror=()=>{status.textContent='Connection failed. Open the current invitation link.';};
 ws.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){M.slot=m.slot;M.epoch=m.epoch;boot();}
  if(m.type==='presence'){M.players=m.players;M.epoch=m.epoch;if(!m.players[1]){guestReady=false;remoteFire=false;remotePose=null;}if(M.ready&&M.slot===1)send({type:'ready'});}
  if(m.type==='ready'&&M.slot===0){guestReady=true;remoteAt=performance.now();}
  if(m.type==='pong')M.rtt=Math.max(0,Date.now()-m.at);
  if(m.type==='input'&&M.slot===0){remotePose=m;remoteFire=m.fire;remoteReload=remoteReload||m.reload;remoteAt=performance.now();}
  if(m.type==='respawn'&&M.slot===0&&players&&!players[1].alive)reset(1);
  if(m.type==='state'&&M.slot===1){pendingState=m;M.lastState=performance.now();}
 };
}
function reset(i){const s=players[i];s.reset();s.start=spawn[i].slice();s.entity.setPosition(...spawn[i]);s.controlled=true;s.team=i===M.slot?'friendly':'enemy';s.soldierName='PLAYER '+(i+1);s.arms=TacticalNS.makeArms(TacticalNS.WEAPONS.m4);s.loadout=[s.arms];s.armsIdx=0;s.lookYaw=Math.atan2(-(spawn[1-i][0]-spawn[i][0]),-(spawn[1-i][2]-spawn[i][2]));s.health=100;s.alive=true;s.entity.enabled=true;s.model.enabled=!(input.fps&&input.fps.s===s);s.wantCrouch=false;s.crouchAmt=0;s._mpLife=(s._mpLife||0)+1;}
function boot(){if(M.ready||M.slot===null||!window.tactical?.T.ready)return;
 api=window.tactical;T=api.T;input=T.input;
 const friends=T.squad.filter(s=>s.team==='friendly');if(friends.length<2){status.textContent='Cannot start: two soldier models are required.';return;}
 players=friends.slice(0,2);mine=players[M.slot];other=players[1-M.slot];
 // Use the same authored spawn on each peer and find a nearby valid second point.
 const p=players[0].pos();const q=T.navigation.nearest([p[0]+8,p[1],p[2]],{x:3,y:3,z:3})||players[1].pos();spawn=[p.slice(),q.slice()];
 T.squad.forEach(s=>{if(!players.includes(s)){s.alive=false;s.disabled=true;s.entity.enabled=false;if(s.label)s.label.style.display='none';if(s.row)s.row.style.display='none';}});
 T.squad=players;T.selection=[mine];T.localOwnerId=M.slot;T.debug=false;T.outcome=null;T.initiative=false;
 for(const k of ['orders','strategy','zombieMgr','grenades','drones'])if(T[k])T[k].enabled=false;
 if(T.orders){T.orders.startFollow=()=>{};T.orders.stopFollow=()=>{};}
 (T.zombies||[]).forEach(z=>{z.alive=false;if(z.entity)z.entity.enabled=false;});T.zombies=[];
 // No wall mutation is allowed until destruction replication is implemented.
 if(window.DreadingMap){DreadingMap.hitAt=()=>null;}
 players.forEach((s,i)=>{s.uid=i;s.ownerId=i;reset(i);});
 const oldKey=input.onKey;
 input.onKey=function(e){if(e.code==='KeyT'){if(!this.fps&&live()&&mine.alive)this.enterControl(mine);return;}if(['KeyR','KeyC'].includes(e.code)&&live()){if(e.code==='KeyR'&&M.slot===1)reloadQueued=true;return oldKey.call(this,e);}};
 const allowed=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ControlLeft','KeyR','KeyC','KeyT','Escape']);
 window.addEventListener('keydown',e=>{if(!allowed.has(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
 input.friendlies=()=>[mine];input.select=()=>{T.selection=[mine];return T.selection;};input.command=()=>null;input.equipOrder=()=>null;
 const oldEnter=input.enterControl;input.enterControl=function(s){if(s!==mine||!live())return false;return oldEnter.call(this,s);};
 const oldTick=input.fpsTick;
 input.fpsTick=function(dt){if(!live()){this.keys={};if(this.fps){this.fps.fire=false;this.fps.firePressed=false;}return;}if(M.slot===1&&this.fps&&performance.now()-sendAt>=45){sendInput();}oldTick.call(this,dt);};
 // AI/weapon simulation is otherwise unchanged. All soldiers are marked controlled.
 const originalShoot=T.combat.shoot.bind(T.combat);
 const originalRay=T.combat.fireRay.bind(T.combat);
 if(M.slot===1){
  T.combat.applyDamage=()=>{};
  T.combat.fireRay=function(s,o,d,muzzle,tracer){const w=TacticalCommon.rayWorld(o,d,300,T.perception.blockers),t=w?w.t:300,end=o.map((v,i)=>v+d[i]*t);if(tracer&&this.fx)this.fx.tracers.add(muzzle,end);return {end,w,eh:null};};
 }else{
  T.combat.fireRay=function(s,o,d,muzzle,tracer){const r=originalRay(s,o,d,muzzle,tracer);shotEvents.push({id:++shotId,slot:players.indexOf(s),o:muzzle||o,end:r.end,hit:!!r.eh,kill:!!r.eh&&!r.eh.ent.alive});if(shotEvents.length>64)shotEvents.shift();return r;};
 }
 T.combat.shoot=function(s,o,d,isPlayer){if(!live()||!s.alive||s.arms.fireCd>0)return null;const r=originalShoot(s,o,d,isPlayer);if(r)M.shots++;return r;};
 // No autonomous update may revive orders after control is released.
 players.forEach(s=>{const update=s.update;s.update=function(dt){this.controlled=true;return update.call(this,dt);};});
 enter.onclick=()=>input.enterControl(mine);
 window.addEventListener('blur',()=>{input.keys={};if(input.fps){input.fps.fire=false;input.fps.firePressed=false;}if(M.slot===1)sendInput();});
 respawn.onclick=()=>{if(mine.alive||!live())return;if(M.slot===0)reset(0);else send({type:'respawn'});};
 M.ready=true;M.api={players,spawn};T.running=true;T.paused=false;input.home();send({type:'ready'});
 api.app.on('update',tick);console.log('MULTIPLAYER_READY',M.slot);
}
function sendInput(){if(!mine||!mine.alive)return;const f=input.fps;send({type:'input',seq:++M.seq,p:mine.pos(),yaw:mine.lookYaw,pitch:mine.pitch,crouch:mine.wantCrouch,ads:!!f?.ads,fire:!!f&&(f.fire||f.firePressed),reload:reloadQueued||!!mine.input.reload});reloadQueued=false;sendAt=performance.now();}
function pack(s){return {p:s.pos(),yaw:s.lookYaw,pitch:s.pitch,hp:s.health,alive:s.alive,crouch:s.crouchAmt,speed:s.speedNow,life:s._mpLife,mag:s.arms.mag,reserve:s.arms.reserve,reload:s.arms.reload?{dur:s.arms.reload.dur}:null,lastShot:s.lastShotT};}
function tick(dt){const now=performance.now();T.running=true;T.paused=false;T.outcome=null;players.forEach(s=>s.controlled=true);
 if(now-pingAt>1000){send({type:'ping',at:Date.now()});if(M.slot===1)send({type:'ready'});pingAt=now;}
 if(M.slot===0){
  if(live()&&other.alive&&remotePose){const m=remotePose;remotePose=null;const p=other.pos(),distance=Math.hypot(m.p[0]-p[0],m.p[2]-p[2]);const elapsed=Math.min(.25,Math.max(.03,(now-(other._mpMoveAt||now-50))/1000));other._mpMoveAt=now;
   const max=8*elapsed+.12,scale=distance>max?max/distance:1,target=[p[0]+(m.p[0]-p[0])*scale,p[1],p[2]+(m.p[2]-p[2])*scale];const q=T.navigation.walk(p,target);if(q)other.entity.setPosition(...q);
   other.speedNow=Math.min(8,distance/elapsed);other.lookYaw=m.yaw;other.pitch=m.pitch;other.wantCrouch=m.crouch;other.arms.adsW=m.ads?1:0;
  }
  if(now-remoteAt>300){remoteFire=false;other.speedNow=0;}
  if(remoteReload){other.input.reload=true;remoteReload=false;}
  if(live()&&remoteFire&&other.alive&&other.arms.fireCd<=0&&!other.arms.reload){T.combat.shoot(other,TacticalNS.entEye(other),TacticalNS.fwd(other.lookYaw,other.pitch),true);}
  if(now-snapshotAt>=50){send({type:'state',epoch:M.epoch,clock:T.elapsed,players:players.map(pack),shots:shotEvents.slice(-24)});snapshotAt=now;}
 }else{
  if(live()&&now-sendAt>=50)sendInput();
  if(pendingState){const state=pendingState;pendingState=null;const newEpoch=state.epoch!==lastEpoch;if(newEpoch){lastEpoch=state.epoch;lastShotId=0;}
   state.players.forEach((v,i)=>{const s=players[i];if(!v||!Array.isArray(v.p))return;const lifeChanged=newEpoch||s._mpLife!==v.life;
    if(lifeChanged){reset(i);s._mpLife=v.life;}
    if(s!==mine||lifeChanged||Math.hypot(...s.pos().map((x,j)=>x-v.p[j]))>1.2){s.entity.setPosition(...v.p);if(s===mine&&input.fps){input.fps.groundY=v.p[1];input.fps.eyeG=v.p[1];input.fps.airY=0;input.fps.vy=0;}}
    if(s!==mine){s.lookYaw=v.yaw;s.pitch=v.pitch;s.crouchAmt=v.crouch;s.speedNow=v.speed;}
    if(s.alive&&!v.alive)s.deathT=T.elapsed;s.health=v.hp;s.alive=v.alive;
    if(s!==mine||lifeChanged||(!input.fps?.fire&&!s.arms.reload)){s.arms.mag=v.mag;s.arms.reserve=v.reserve;}
   });
   for(const e of state.shots||[]){if(e.id<=lastShotId)continue;lastShotId=e.id;if(e.slot!==M.slot&&T.combat.fx){T.combat.fx.tracers.add(e.o,e.end);const d=e.end.map((v,i)=>v-e.o[i]),l=Math.hypot(...d)||1;TacticalNS.muzzleWorldFx(T.combat.fx,e.o,d.map(v=>v/l),1);}if(e.slot===M.slot&&e.hit&&input.fps)input.hitmarker(false,e.kill);}
  }
 }
 const online=live();enter.disabled=!online||!mine.alive;respawn.disabled=!online||mine.alive;
 status.textContent='Player '+(M.slot+1)+' · '+(online?'Connected · '+M.rtt+' ms · HP '+Math.ceil(mine.health):M.connected?'Waiting for the other player to load…':'Disconnected')+(mine.alive?'':' · Down — respawn to continue');
}
setInterval(boot,250);connect();
})();
