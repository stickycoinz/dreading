/* Two independent pick screens. Plans are committed once per side by the host;
   neither path calls the single-player startMatch or removes the other army. */
(function(){'use strict';
if(new URLSearchParams(location.search).get('pick')!=='1')return;
const P=window.DreadingMPPrep={state:{plans:[null,null],errors:[null,null]},installed:false};
let T,N,opened=false;const applied=[null,null];
P.canPlay=()=>P.installed&&(N.slot===2||!!P.state.plans[N.slot]);
function hide(s){s.disabled=true;s.alive=false;s.entity.enabled=false;if(s.label)s.label.style.display='none';if(s.row)s.row.style.display='none';}
function validate(raw){
 if(window.DreadingControl)raw={squad:DreadingControl.starter()};
 if(!raw||!Array.isArray(raw.squad)||raw.squad.length<1||raw.squad.length>DreadingCatalogue.capacity)throw Error('Choose one to thirty troops.');
 const squad=raw.squad.map((u,i)=>{
  const cls=DreadingPrep.cls(u.clsId||u.cls);if(!cls||cls.locked)throw Error('Unavailable soldier class.');
  if(!TacticalNS.WEAPONS[u.primary]||!TacticalNS.WEAPONS[u.secondary])throw Error('Unavailable weapon.');
  const attachments=(ids,weapon)=>{if(!Array.isArray(ids)||ids.length>12)throw Error('Invalid attachments.');const legal=DreadingPrep.attachments(weapon);const slots=new Set();return ids.map(id=>{const a=legal.find(a=>a.id===id);if(!a||slots.has(a.slot))throw Error('Invalid attachment slot.');slots.add(a.slot);return id;});};
  const grenades={};for(const key of ['frag','smoke','flash']){const v=u.grenades?.[key]??0;if(!Number.isInteger(v)||v<0||v>12)throw Error('Invalid grenade count.');grenades[key]=v;}
  return {name:DreadingPrep.CALLSIGNS[i]||("UNIT "+(i+1)),groupId:String(u.groupId||("single-"+i)).slice(0,60),packageId:Object.hasOwn(DreadingCatalogue.presets,u.packageId)?u.packageId:null,cls:cls.name,clsId:cls.id,primary:u.primary,secondary:u.secondary,attachments:attachments(u.attachments||[],u.primary),secondaryAttachments:attachments(u.secondaryAttachments||[],u.secondary),grenades};
 });
 const player={budget:{scrap:1000000,fortify:1000000}};
 if(!DreadingPrep.canLaunch(squad,player))throw Error('Squad exceeds the starting budget.');
 return DreadingPrep.buildPlan(squad,null,player);
}
function apply(side,plan){
 const sideUnits=T.squad.filter(s=>s._netOwner===side);
 for(let i=0;i<sideUnits.length;i++){
  const s=sideUnits[i],u=plan.squad[i];if(!u){hide(s);continue;}
  s.disabled=false;s.entity.enabled=true;s.reset();s.soldierName=u.name;s.role=u.cls;s.squadKey='player-'+side+'-'+u.groupId;s.prepKit=u;
  s.loadout=[TacticalNS.makeArms(TacticalNS.WEAPONS[u.primary]),TacticalNS.makeArms(TacticalNS.WEAPONS[u.secondary])];s.armsIdx=0;s.arms=s.loadout[0];s.nadeInv={...u.grenades};
  if(s.row)s.row.style.display=side===N.slot?'':'none';
 }
 DreadingPrep.applyLocalKits({squad:sideUnits},plan);
 if(side===N.slot){T.selection=sideUnits.filter(s=>!s.disabled);T.resources={scrap:plan.scrap,fortify:plan.fortify};T.input.home();
  // Start in the same clean command-view state that an FP enter/exit used to restore; repeat once the pick screen has faded out.
  T.input.resetView?.('match start');setTimeout(()=>{if(!T.input.fps)T.input.resetView?.('match start (screen closed)');},700);}
}
function commit(side,raw){
 if(P.state.plans[side])return;
 try {const plan=validate(raw);P.state.plans[side]=plan;P.state.errors[side]=null;apply(side,plan);applied[side]=JSON.stringify(plan);}
 catch(e){P.state.errors[side]=e.message;}
}
P.receive=function(state){if(!state||!P.installed)return;P.state=state;for(let side=0;side<2;side++){const plan=state.plans[side],key=JSON.stringify(plan);if(plan&&applied[side]!==key){apply(side,plan);applied[side]=key;}}
 if(state.plans[N.slot]){if(opened){DreadingPrep.close();opened=false;}}
 else if(state.errors[N.slot]){DreadingPrep.state.ready=false;DreadingPrep.sync();T.input.toast(state.errors[N.slot]);}
};
P.restart=()=>{if(!N.isHost)return;P.state={plans:[null,null],errors:[null,null]};applied[0]=applied[1]=null;commit(0,{});commit(1,{});};
function open(){if(N.slot===2||P.state.plans[N.slot]||opened)return;opened=true;if(window.DreadingControl){if(N.isHost)commit(0,{});else N.api.send({type:'command',method:'plan',args:[{}]});return;}
 DreadingPrep.open({mode:'player',playerId:'p'+(N.slot+1),playerName:'Commander '+(N.slot+1),budget:{scrap:1000000,fortify:1000000},app:tactical.app,T,armed:true,onReady(plan){
  if(!DreadingPrep.state.ready)return;
  if(N.isHost){commit(0,plan);if(P.state.plans[0]){DreadingPrep.close();opened=false;}else{DreadingPrep.state.ready=false;DreadingPrep.sync();T.input.toast(P.state.errors[0]);}}
  else N.api.send({type:'command',method:'plan',args:[plan]});
 }});
 DreadingPrep.root.style.zIndex='20000';DreadingPrep.root.style.backgroundColor='rgb(8,10,12)';
}
const wait=setInterval(()=>{
 if(!window.DreadingMultiplayer?.ready||!window.DreadingPrep||!window.TacticalWeaponModels?.ready)return;
 clearInterval(wait);N=DreadingMultiplayer;T=tactical.T;P.installed=true;
 T.squad.forEach(hide);
 if(N.isHost)N.api.onCommand=(m,side=1)=>{if(m.method!=='plan')return false;commit(side,m.args?.[0]);return true;};
 // The snapshot contains each side's committed plan, including on guest reload.
 if(N.isHost)open();else setTimeout(open,700);
 tactical.app.on('update',()=>{for(const s of T.squad){if(s.disabled&&s.label)s.label.style.display='none';if(s.prepKit)s.wmParts=(s.armsIdx===1?s.secondaryAttachments:s.attachments)||[];}});
},100);
})();
