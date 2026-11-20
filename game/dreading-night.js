/* Night visibility and bounded shadow reuse. Gameplay light tests never depend on camera culling. */
(function(G){'use strict';
 const q=new URLSearchParams(location.search);
 const N=G.DreadingNight={enabled:q.get('night')==='1'||(q.get('mapVariant')==='autumn'&&q.get('night')!=='0'),
  cache:q.get('shadowCache')==='1',flashes:[],revision:0,frame:0,range:28,halfAngle:27*Math.PI/180,near:2.2};
 N.invalidate=function(){N.revision++;};
 N.clock=function(now){if(N.lastTime!==undefined&&now<N.lastTime)N.flashes=[];N.lastTime=now;};
 N.flash=function(p,radius,duration){if(!N.enabled)return;const L=G.DreadingLook,now=L&&L.T?L.T.elapsed:0;N.clock(now);
  N.flashes=N.flashes.filter(f=>f.until>=now);if(N.flashes.length>=32)N.flashes.shift();
  N.flashes.push({p:p.slice(),radius,until:now+duration});};
 N.beam=function(s,T){const p=s.pos(),fp=T.input&&T.input.fps,L=G.DreadingLook;
  let d=[-Math.sin(s.lookYaw||0),-.03,-Math.cos(s.lookYaw||0)];
  if(fp&&fp.s===s&&L&&L.cam){const f=L.cam.forward;d=[f.x,f.y,f.z];}
  const len=Math.hypot(...d)||1;return {p:[p[0],p[1]+1.45,p[2]],d:d.map(v=>v/len)};};
 N.inBeam=function(b,p){const d=p.map((v,i)=>v-b.p[i]),len=Math.hypot(...d);
  return len<=N.range&&(len<.01||d.reduce((sum,v,i)=>sum+v*b.d[i],0)>=len*Math.cos(N.halfAngle));};
 N.lit=function(observer,target,T,P){if(!N.enabled)return true;
  const eye=G.TacticalNS.entEye(observer),head=G.TacticalNS.entHead(target),chest=G.TacticalNS.entChest(target),now=T.elapsed;N.clock(now);
  if(Math.hypot(...chest.map((v,i)=>v-eye[i]))<=N.near)return true; // normal LOS still required by caller
  const clear=(a,b)=>!P.sightBlocked(a,b),points=[head,chest];
  const L=G.DreadingLook;
  if(!L||L.flashlightsOn!==false){
   const candidates=P.nearSoldiers?P.nearSoldiers(target.pos(),N.range+2,now):T.squad;
   for(const s of candidates){if(!s.alive||s.disabled||s.flashlightOn===false)continue;
    const b=N.beam(s,T);for(const p of points)if(N.inBeam(b,p)&&clear(b.p,p))return true;
   }
  }
  for(const f of N.flashes){if(f.until<now)continue;for(const p of points)
   if(Math.hypot(...p.map((v,i)=>v-f.p[i]))<=f.radius&&clear(f.p,p))return true;}
  return false;
 };
 N.configure=function(L){if(!L.sun)return;const light=L.sun.light;
  if(N.enabled){light.castShadows=false;if(!G.DreadingVisuals){light.intensity=.06;L.app.scene.skyboxIntensity=.025;}
   N.ambient=N.ambient||new pc.Color(.025,.035,.055);N.clear=N.clear||new pc.Color(.008,.012,.025);
   if(!G.DreadingVisuals)L.app.scene.ambientLight=N.ambient;
   if(L.cam.camera)L.cam.camera.clearColor=N.clear;
   if(L.app.scene.fog&&!G.DreadingVisuals){L.app.scene.fog.type='none';}
  }else{light.castShadows=true;light.cascadeBlend=.15;}
  G.DreadingVisuals?.scene(L);
 };
 N.shadows=function(L){N.configure(L);if(!L.sun||N.enabled)return;
  const light=L.sun.light,p=L.cam.getPosition(),f=L.cam.forward,t=L.TIERS[L.tier];
  // RTS camera-to-ground distance must fit in the covered interval, not just camera height.
  const distance=L.mode==='rts'?Math.max(t.shadow.rts,Math.min(320,Math.max(0,p.y)/Math.max(.2,-f.y)+65)):t.shadow.fp;
  light.shadowDistance=distance;
  if(!N.cache){light.shadowUpdateOverrides=null;return;}
  const signature=[p.x,p.y,p.z,f.x,f.y,f.z,L.cam.camera.fov,L.mode,L.tier,distance,N.revision].join('|');
  const refresh=signature!==N.signature||(++N.frame%4)===0;N.signature=signature;
  light.shadowUpdateMode=pc.SHADOWUPDATE_REALTIME;
  light.shadowUpdateOverrides=Array.from({length:light.numCascades},(_,i)=>i===0||refresh?pc.SHADOWUPDATE_REALTIME:pc.SHADOWUPDATE_NONE);
 };
})(globalThis);
