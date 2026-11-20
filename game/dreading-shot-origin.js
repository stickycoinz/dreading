/* Crosshair acquires the aim point; the barrel owns the shot and near-cover check. */
(function(g){'use strict';
const S=g.DreadingShotOrigin={};
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const norm=a=>{const l=Math.hypot(...a);return l>1e-8?a.map(x=>x/l):[0,0,-1];};
function axes(f){const right=norm([-f[2],0,f[0]]);return [right,[right[1]*f[2]-right[2]*f[1],right[2]*f[0]-right[0]*f[2],right[0]*f[1]-right[1]*f[0]],f];}
S.validOffset=o=>Array.isArray(o)&&o.length===3&&o.every(Number.isFinite)&&Math.abs(o[0])<=.8&&Math.abs(o[1])<=.8&&o[2]>=.05&&o[2]<=1.8&&Math.hypot(...o)<=2;
S.offset=function(T,s){
 const I=T.input,wm=g.TacticalWeaponModels,gun=I?.fps?.s===s&&I.vm?I.vm._wm:null;
 const socket=wm?.manifest?.weapons[s.arms.def.id]?.sockets?.muzzle;
 if(!gun||gun.wmId!==s.arms.def.id||!socket||!T.camera)return null;
 const p=gun.getWorldTransform().transformPoint(new pc.Vec3(...socket.position));
 const c=T.camera.getPosition(),delta=[p.x-c.x,p.y-c.y,p.z-c.z];
 const cameraForward=T.camera.forward;
 const a=axes([cameraForward.x,cameraForward.y,cameraForward.z]),o=a.map(v=>dot(delta,v));
 return S.validOffset(o)?o:null;
};
S.muzzle=function(T,s,eye,f,fallback){
 const local=S.offset(T,s),remote=s._netMuzzle;
 const offset=local||(remote?.weapon===s.arms.def.id&&T.elapsed-remote.at<.5&&S.validOffset(remote.offset)?remote.offset:null);
 if(!offset)return fallback.slice();
 const a=axes(f);return add(add(add(eye,a[0],offset[0]),a[1],offset[1]),a[2],offset[2]);
};
S.solve=function(T,combat,s,eye,dir,muzzle){
 const C=g.TacticalCommon,NS=g.TacticalNS,max=300;
 // Never start beyond a wall just because the viewmodel can visually clip through it.
 const delta=sub(muzzle,eye),length=Math.hypot(...delta),toward=norm(delta);
 const obstruction=length>.001?C.rayWorld(eye,toward,length,T.perception.blockers):null;
 if(obstruction){const start=add(eye,toward,Math.max(0,obstruction.t-.01));return {origin:start,dir:toward,muzzle:start,blocked:true};}
 const wall=C.rayWorld(eye,dir,max,T.perception.blockers);
 const body=NS.rayEntities(eye,dir,wall?wall.t:max,s,combat.list(),false);
 let distance=body?body.t:wall?wall.t:max;
 const drone=T.drones?.rayDrones?.(s,eye,dir,distance);if(drone)distance=drone.t;
 const target=add(eye,dir,distance),shot=norm(sub(target,muzzle));
 // Very close targets must not produce a backwards bullet through the player.
 if(dot(shot,dir)<=0)return {origin:eye.slice(),dir:dir.slice(),muzzle:eye.slice(),blocked:true};
 return {origin:muzzle.slice(),dir:shot,muzzle:muzzle.slice(),target,blocked:false};
};
})(window);
