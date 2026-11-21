/* DREADING_perf (2026-11-20): runtime performance policy for the horde/battle build.
   ?perf=0 turns every perf change off (A/B). ?perfOff=a,b,c turns single fixes off:
     anim   soldier animation LOD 30/15/7 Hz + upper-body layer without forced evaluation (tactical-soldier-animation.js)
     merge  merge each soldier's 6 skinned body parts (one material, one skin) into one shared mesh
     aabb   fixed custom AABB on skinned meshes (no per-frame bone-AABB rebuild before culling)
     ik     weapon support-hand fit only near the camera (tactical-weapon-models.js)
     shadow static/map geometry and props never cast shadows; characters cast only near the camera; sun shadow trimmed
     boxes  horde-lab static boxes merged into one mesh per material (dreading-horde-lab.js)
     grid   uniform-grid broadphase for TacticalCommon.rayWorld (tactical-common.js)
     budget per-frame time budget for perception scans (tactical-perception.js)
     ui     batched RTS rings/lines and 10 Hz label/panel text (dreading-rts-commands.js, tactical-debug-draw.js)
     zclip  zombie clip hysteresis: no run->idle->run flicker on 1-frame speed dropouts (tactical-zombies.js)
     tick   20 Hz staggered sim tick: zombie brains (tactical-zombies.js) and idle/far soldier decisions (wrapped here, model interpolated)
     los    250 ms line-of-sight cache for TacticalPerception.blocked (cleared when blockers change)
     warm   pre-warm explosion FX at load (each loaded flipbook variant spawned once 40 m under the ground in view) so the first
            mortar/rocket blast doesn't hitch 100-180 ms on texture upload + particle shader compile
     lod    soldier LOD by screen rank: only the 12 nearest on-screen soldiers animate at full rate, the next 12 at <=15 Hz, the rest 5 Hz
   ?shadows=0 disables the sun shadow entirely. ?shadowNear=<m> (default 22) character shadow radius, ?sunDist=<m> (default 30). */
(function(){'use strict';
const q=new URLSearchParams(location.search),offList=(q.get('perfOff')||'').split(',').filter(Boolean);
const P=window.DreadingPerf={on:q.get('perf')!=='0',offList,fullN:+(q.get('fullN')||12),rigidHz:5,tickNear:30,sunShadow:q.get('shadows')!=='0',charShadowNear:+(q.get('shadowNear')||22),sunDist:+(q.get('sunDist')||30),
 stats:{merged:0,mergeSkipped:0,customAabb:0,staticShadowOff:0,boxesMerged:0,boxGroups:0}};
P.use=function(name){return P.on&&offList.indexOf(name)<0;};
function getApp(){return (window.tactical&&window.tactical.app)||(pc.AppBase&&pc.AppBase.getApplication&&pc.AppBase.getApplication())||pc.app;}
if(!P.on)return;

/* ---------- soldier body merge (called by tacticalSoldierAnimation once per model) ---------- */
const mergedCache=new Map();
function buildMerged(device,mis){
 const P3=[],N3=[],UV=[],W=[],J=[],T4=[],IDX=[];let base=0,hasTan=true;
 for(const mi of mis){const m=mi.mesh,p=[],n=[],uv=[],w=[],j=[],t=[],ix=[];m.getPositions(p);m.getNormals(n);m.getUvs(0,uv);m.getIndices(ix);
  if(!m.getVertexStream(pc.SEMANTIC_BLENDWEIGHT,w)||!m.getVertexStream(pc.SEMANTIC_BLENDINDICES,j))return null;if(!m.getVertexStream(pc.SEMANTIC_TANGENT,t))hasTan=false;
  const vc=p.length/3;if(n.length!==p.length||uv.length!==vc*2||w.length!==vc*4||j.length!==vc*4)return null;
  for(let i=0;i<p.length;i++){P3.push(p[i]);N3.push(n[i]);}for(let i=0;i<uv.length;i++)UV.push(uv[i]);for(let i=0;i<w.length;i++){W.push(w[i]);J.push(j[i]);}if(hasTan)for(let i=0;i<t.length;i++)T4.push(t[i]);
  for(let i=0;i<ix.length;i++)IDX.push(ix[i]+base);base+=vc;}
 const mesh=new pc.Mesh(device);mesh.setPositions(new Float32Array(P3));mesh.setNormals(new Float32Array(N3));mesh.setUvs(0,new Float32Array(UV));
 if(hasTan&&T4.length===base*4)mesh.setVertexStream(pc.SEMANTIC_TANGENT,new Float32Array(T4),4);
 mesh.setVertexStream(pc.SEMANTIC_BLENDWEIGHT,new Float32Array(W),4);mesh.setVertexStream(pc.SEMANTIC_BLENDINDICES,new Uint8Array(J),4,pc.TYPE_UINT8);
 mesh.setIndices(base>65535?new Uint32Array(IDX):new Uint16Array(IDX));mesh.update(pc.PRIMITIVE_TRIANGLES);mesh.skin=mis[0].mesh.skin;return mesh;}
P.mergeSoldier=function(model){
 if(!model||model._perfMerged)return;model._perfMerged=true;if(!P.use('merge'))return;
 try{const rs=model.findComponents('render').filter(r=>r.enabled&&r.entity.enabled&&r.meshInstances.length===1&&r.meshInstances[0].skinInstance);
  if(rs.length<2){P.stats.mergeSkipped++;return;}
  const mis=rs.map(r=>r.meshInstances[0]),m0=mis[0],skin=m0.skinInstance.skin,mat=m0.material;
  if(mis.some(m=>m.skinInstance.skin!==skin||m.material!==mat||(m.mesh.primitive[0].type!==pc.PRIMITIVE_TRIANGLES)||m.morphInstance)){P.stats.mergeSkipped++;return;}
  const key=mis.map(m=>m.mesh.id).join(',');let mesh=mergedCache.get(key);
  if(mesh===undefined){mesh=buildMerged(getApp().graphicsDevice,mis);mergedCache.set(key,mesh);if(mesh)mesh.incRefCount();}
  if(!mesh){P.stats.mergeSkipped++;return;}
  const holder=new pc.Entity('perf merged body');model.addChild(holder);
  const mi=new pc.MeshInstance(mesh,mat,m0.node);/* own SkinInstance over the same bone nodes: never shares (or outlives) the hidden parts' instances */const si=new pc.SkinInstance(skin);si.bones=m0.skinInstance.bones;mi.skinInstance=si;mi.castShadow=rs[0].castShadows;mi.receiveShadow=rs[0].receiveShadows;
  holder.addComponent('render',{meshInstances:[mi],castShadows:rs[0].castShadows,receiveShadows:rs[0].receiveShadows,layers:rs[0].layers.slice()});
  for(const r of rs)r.enabled=false;model._perfBody=mi;P.stats.merged++;
 }catch(e){P.stats.mergeSkipped++;console.warn('[perf] soldier merge skipped:',e.message);}
};

/* ---------- custom AABB for skinned meshes ---------- */
const _wb=new pc.BoundingBox(),_inv=new pc.Mat4();
P.fixAabb=function(mi){if(!P.use('aabb')||!mi||!mi.skinInstance||mi._perfAabb)return false;
 const node=mi.node;if(!node)return false;let bb;try{bb=mi.aabb;}catch(e){return false;}const h=bb.halfExtents;
 if(!(h.y>0.3&&h.y<2.2&&h.x<3&&h.z<3))return false;
 const r=Math.max(h.x,h.y,h.z,0.7)*1.3;_wb.center.copy(bb.center);_wb.halfExtents.set(r,r,r);
 _inv.copy(node.getWorldTransform()).invert();const local=new pc.BoundingBox();local.setFromTransformedAabb(_wb,_inv);
 mi.setCustomAabb(local);mi._perfAabb=true;P.stats.customAabb++;return true;};

/* ---------- periodic sweep: static shadows off, skinned custom AABB, sun shadow ---------- */
function underViewmodel(e){for(let p=e;p;p=p.parent)if(p.name==='FP viewmodel')return true;return false;}
function warmFx(app){const FX=window.DreadingExplosionFX;if(P._fxWarm||!P.use('warm')||!FX||!FX.ready||!FX.loaded)return;const T=app.tactical,cam=T&&(T.activeCamera||T.camera);if(!cam)return;P._fxWarm=true;
 const c=cam.getPosition(),f=cam.forward;const t=f.y<-0.2?(-40-c.y)/f.y:60;const x=c.x+f.x*t,z=c.z+f.z*t;const list=FX.loaded.filter(v=>v.kind!=='smoke');
 list.forEach((v,i)=>{try{FX.spawn([x+(i-list.length/2)*3,-40,z],1,{variant:v});}catch(e){}});P.stats.fxWarm=list.length;}
function sweep(app){
 const T=app.tactical;
 try{warmFx(app);}catch(e){}
 if(P.use('shadow')){
  for(const r of app.root.findComponents('render')){if(!r.castShadows)continue;const mis=r.meshInstances;let skinned=false;for(let i=0;i<mis.length;i++)if(mis[i].skinInstance){skinned=true;break;}
   if(!skinned){r.castShadows=false;P.stats.staticShadowOff++;}}
  wrapNight();
  if(window.TacticalZombies&&TacticalZombies.PERF){TacticalZombies.PERF.shadowNear=Math.min(TacticalZombies.PERF.shadowNear,P.charShadowNear-3);TacticalZombies.PERF.shadowFar=Math.min(TacticalZombies.PERF.shadowFar,P.charShadowNear);}
 }
 /* zombies are excluded: the crowd renderer re-parents their rigs and they are pooled/teleported, so a fixed box could go stale */
 const zm=new Set();for(const z of (T&&T.zombieMgr&&T.zombieMgr.pool)||[])if(z.model)zm.add(z.model);const underZombie=e=>{for(let p=e;p;p=p.parent)if(zm.has(p)||p.name==='Inactive crowd skeletons')return true;return false;};
 if(P.use('aabb'))for(const r of app.root.findComponents('render')){if(!r.enabled)continue;const mis=r.meshInstances;for(let i=0;i<mis.length;i++){const m=mis[i];if(m.skinInstance&&!m._perfAabb&&!m._perfNoAabb){if(underViewmodel(r.entity)||underZombie(r.entity)){m._perfNoAabb=true;continue;}P.fixAabb(m);}}}
}
/* Sun shadow: one cascade, trimmed distance; when no character is within charShadowNear of the camera (RTS views) the map is
   not re-rendered at all (one clearing frame, then SHADOWUPDATE_NONE). DreadingNight.shadows runs every frame via DreadingLook.tick. */
function nearCasters(app){const T=app.tactical,cam=T&&(T.activeCamera||T.camera);if(!cam)return true;const cp=cam.getPosition(),R2=P.charShadowNear*P.charShadowNear;
 const test=e=>{if(!e||!e.alive||e.disabled||!e.entity||!e.entity.enabled||e._crowdBaked)return false;const p=e.entity.getPosition(),dx=p.x-cp.x,dy=p.y-cp.y,dz=p.z-cp.z;return dx*dx+dy*dy+dz*dz<R2;};
 for(const s of T.squad||[])if(test(s))return true;for(const z of T.zombies||[])if(test(z))return true;return false;}
function applySun(L){if(!P.use('shadow')||!L||!L.sun||!L.sun.light)return;const light=L.sun.light;if(!P.sunShadow){}else if(!light.castShadows)return;
 if(!P.sunShadow){if(!light._perfNoShadow){light.castShadows=false;light._perfNoShadow=true;/* DreadingNight.configure re-enables it every frame; pin it off without per-frame toggling */Object.defineProperty(light,'castShadows',{configurable:true,get(){return false;},set(v){}});}return;}
 if(light.numCascades!==1)light.numCascades=1;if(light.shadowDistance>P.sunDist)light.shadowDistance=P.sunDist;
 const app=getApp(),near=nearCasters(app);
 if(near){light.shadowUpdateMode=pc.SHADOWUPDATE_REALTIME;P._sunIdle=0;}
 else{light.shadowUpdateOverrides=null;light.shadowUpdateMode=(P._sunIdle++===0)?pc.SHADOWUPDATE_THISFRAME:pc.SHADOWUPDATE_NONE;}
 P.stats.sunRealtime=near;}
function wrapNight(){const N=window.DreadingNight;if(!N||N._perfWrapped||typeof N.shadows!=='function')return;N._perfWrapped=true;const orig=N.shadows;N.shadows=function(L){const r=orig.apply(this,arguments);try{applySun(L);}catch(e){}return r;};}
/* ---------- per-frame: soldier screen rank (LOD), soldier sim-tick interpolation ---------- */
const _sph=new pc.BoundingSphere(new pc.Vec3(),1.3),_v=new pc.Vec3(),_inv2=new pc.Mat4(),_ranked=[];
function frameTick(app,dt){const T=app.tactical;if(!T||!T.squad)return;const cam=T.activeCamera||T.camera;if(!cam||!cam.camera)return;const cp=cam.getPosition(),fr=cam.camera.frustum;
 _ranked.length=0;for(const s of T.squad){if(!s.entity)continue;const p=s.entity.getPosition();s._perfCamD=cp.distance(p);_sph.center.set(p.x,p.y+0.9,p.z);s._perfOn=fr.containsSphere(_sph)>0;s._perfRank=999;if(s._perfOn&&s.alive&&!s.disabled)_ranked.push(s);}
 _ranked.sort((a,b)=>a._perfCamD-b._perfCamD);for(let i=0;i<_ranked.length;i++)_ranked[i]._perfRank=i;
 /* render interpolation for soldiers on the 20 Hz tick: the logical entity stays at the tick result; only the visual model lags one tick, lerped */
 for(const s of T.squad){const ip=s._ip,m=s.model;if(!ip||!m||!s.alive){continue;}ip.t+=dt;const k=1-Math.min(1,ip.t/0.05);if(k<=0){s._ip=null;continue;}
  _v.set((ip.x0-ip.x1)*k,(ip.y0-ip.y1)*k,(ip.z0-ip.z1)*k);_inv2.copy(s.entity.getWorldTransform()).invert();_inv2.transformVector(_v,_v);if(m.parent===s.entity)m.setLocalPosition(_v.x,_v.y,_v.z);}}
/* ---------- 20 Hz decision tick for soldiers that are idle (no target, not firing/reloading/flinching) and far or off-screen ---------- */
function wrapDecision(T){const D=window.TacticalSoldierDecision;if(!D||!D.prototype||D.prototype._perfWrapped)return;D.prototype._perfWrapped=true;const orig=D.prototype.update;
 const busy=s=>!!((s.target&&s.target.alive)||(s.focus&&s.focus.alive)||(s.arms&&(s.arms.reload||s.arms.switching>0))||(s.input&&s.input.fire)||s.flinchT>0||(s.lastShotT>0&&T.elapsed-s.lastShotT<2)||(s.lastAttackerT&&T.elapsed-s.lastAttackerT<3));
 D.prototype.update=function(dt){const s=this;
  if(!P.use('tick')||!TacticalCommon.AI.on||s.controlled||!s.alive||!T.running||T.paused||(T.input&&T.input.fps&&T.input.fps.s===s)||busy(s)||(s._perfOn&&s._perfCamD<P.tickNear)||s._perfCamD===undefined){
   if(s._tacc>0){let tot=Math.min(0.1,dt+s._tacc);s._tacc=0;s._ip=null;while(tot>1e-6){const st=Math.min(0.05,tot);orig.call(s,st);tot-=st;}return;}s._ip=null;return orig.call(s,dt);}
  if(s._tacc===undefined)s._tacc=-((s.uid||0)*0.6180339%1)*0.05;s._tacc+=dt;if(s._tacc<0.05)return;
  const e=s.entity.getPosition(),x0=e.x,y0=e.y,z0=e.z;let tot=Math.min(0.1,s._tacc);s._tacc=0;while(tot>1e-6){const st=Math.min(0.05,tot);orig.call(s,st);tot-=st;}
  const e1=s.entity.getPosition();s._ip=(Math.abs(e1.x-x0)+Math.abs(e1.z-z0)>1e-4&&Math.abs(e1.x-x0)+Math.abs(e1.z-z0)<1.5)?{x0,y0,z0,x1:e1.x,y1:e1.y,z1:e1.z,t:0}:null;P.stats.ticked=(P.stats.ticked||0)+1;};}
/* ---------- 250 ms LOS cache on TacticalPerception.blocked (cleared every 250 ms and whenever blockers are refreshed) ---------- */
function wrapLos(T){const per=T.perception;if(!per||per._perfLos||typeof per.blocked!=='function')return;per._perfLos=true;const orig=per.blocked,cache=new Map();let born=-1;
 const ref=per.refresh;if(typeof ref==='function')per.refresh=function(){cache.clear();return ref.apply(this,arguments);};
 per.blocked=function(a,b){if(!P.use('los')||!TacticalCommon.AI.on)return orig.call(this,a,b);const now=T.elapsed;if(now-born>0.25||now<born){cache.clear();born=now;}
  const key=Math.round(a[0]*4)+','+Math.round(a[1]*4)+','+Math.round(a[2]*4)+'|'+Math.round(b[0]*4)+','+Math.round(b[1]*4)+','+Math.round(b[2]*4);
  const c=cache.get(key);if(c!==undefined){P.stats.losHit=(P.stats.losHit||0)+1;return c;}const r=orig.call(this,a,b);cache.set(key,r);P.stats.losMiss=(P.stats.losMiss||0)+1;return r;};}
const boot=setInterval(()=>{wrapNight();const t=window.tactical;if(!t||!t.T||!t.T.ready||!t.app)return;clearInterval(boot);const app=t.app;sweep(app);
 try{wrapDecision(t.T);wrapLos(t.T);}catch(e){console.warn('[perf] wrap',e.message);}app.on('update',dt=>{try{frameTick(app,dt);}catch(e){}});setInterval(()=>{try{sweep(app);}catch(e){console.warn('[perf] sweep',e.message);}},1500);},250);

/* ---------- static box merge (horde lab) ---------- */
P.mergeBoxes=function(root,exclude){if(!P.use('boxes'))return 0;const app=getApp(),dev=app.graphicsDevice;exclude=exclude||new Set();
 const groups=new Map();root.forEach(e=>{if(exclude.has(e)||!e.enabled||!e.render||e.render.type!=='box'||!e.render.enabled)return;for(let p=e;p;p=p.parent)if(exclude.has(p))return;
  const mi=e.render.meshInstances[0];if(!mi||mi.visible===false)return;const mat=mi.material;if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(e);});
 const unit=pc.createBox(dev),up=[],un=[],uu=[],ui=[];unit.getPositions(up);unit.getNormals(un);unit.getUvs(0,uu);unit.getIndices(ui);unit.destroy();
 const v=new pc.Vec3(),sc=new pc.Vec3();let n=0;
 for(const [mat,list] of groups){if(list.length<2)continue;const vc=up.length/3,Pp=new Float32Array(vc*3*list.length),Nn=new Float32Array(vc*3*list.length),Uu=new Float32Array(vc*2*list.length),Ii=new Uint32Array(ui.length*list.length);
  list.forEach((e,k)=>{const m=e.getWorldTransform(),rot=e.getRotation();m.getScale(sc);for(let i=0;i<vc;i++){v.set(up[i*3],up[i*3+1],up[i*3+2]);m.transformPoint(v,v);Pp.set([v.x,v.y,v.z],(k*vc+i)*3);
    v.set(un[i*3]/(sc.x||1),un[i*3+1]/(sc.y||1),un[i*3+2]/(sc.z||1));rot.transformVector(v,v);v.normalize();Nn.set([v.x,v.y,v.z],(k*vc+i)*3);Uu[(k*vc+i)*2]=uu[i*2];Uu[(k*vc+i)*2+1]=uu[i*2+1];}
   for(let i=0;i<ui.length;i++)Ii[k*ui.length+i]=ui[i]+k*vc;e.render.meshInstances.forEach(mi=>{mi.visible=false;});e.render.castShadows=false;});
  const mesh=new pc.Mesh(dev);mesh.setPositions(Pp);mesh.setNormals(Nn);mesh.setUvs(0,Uu);mesh.setIndices(Ii);mesh.update();
  const holder=new pc.Entity('perf merged boxes');app.root.addChild(holder);holder.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,mat,holder)],castShadows:false,receiveShadows:true});
  n+=list.length;P.stats.boxGroups++;}
 P.stats.boxesMerged+=n;return n;};
})();
