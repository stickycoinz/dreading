/* Task 8 (2026-11-16): always see your OWN units. Overhead view only (off in first person).
   1) Cutout: building / prop materials get a tiny user chunk (litUserMainStartPS, FORWARD pass only - shadows, picking and the
      depth prepass are untouched): fragments inside a capsule from an occluded own unit toward the camera are discarded with a
      4x4 Bayer dither edge. Close units (< K.merge m) share one capsule. Max K.max capsules -> one uniform array, set once per
      frame. No mesh rebuilds, no new draw calls; one recompiled shader per patched material variant (paid once at load).
   2) Floor cut: the floor picker sets a rect + height; fragments of that building above the chosen floor are cut the same way.
   3) Silhouette fallback: an occluded own unit gets a team-colour capsule drawn only where it is BEHIND something
      (depth func GREATER, no depth write): +1 draw call per occluded own unit, one shared unlit material.
   Owner gate: TacticalStrategy.isLocal (s.ownerId vs T.localOwnerId, else s.team === T.localTeam) - the other side's units never
   get a cutout or a silhouette, so a remote opponent sees nothing through walls. ?xray=0 off, ?xray=sil silhouettes only. */
var TacticalXray=pc.createScript('tacticalXray');
TacticalXray.K={max:8,merge:6,r0:2.6,len:16,feet:0.3,fadeIn:5,fadeOut:3,rayEvery:0.12,exclude:/viewmodel|sky|water|flood|zombie|soldier|drone|grenade|fx|tracer|decal/i};
TacticalXray.CHUNK_DECL_VS='varying vec3 vXrayW;\n';
TacticalXray.CHUNK_END_VS='vXrayW = dPositionW;\n';
TacticalXray.CHUNK_DECL_PS='varying vec3 vXrayW;\nuniform vec4 xrayCap[8];\nuniform vec4 xrayCam;\nuniform vec4 xrayFloor;\nuniform vec4 xrayFloorY;\n'+
 'float xrayBayer(vec2 p){ivec2 q=ivec2(mod(p,4.0));int i=q.x+q.y*4;float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return (m[i]+0.5)/16.0;}\n';
TacticalXray.CHUNK_START_PS='#ifdef FORWARD_PASS\n{float xb=xrayBayer(gl_FragCoord.xy);vec3 P=vXrayW;\n'+
 ' if(xrayFloorY.x>-1e5 && P.x>xrayFloor.x && P.x<xrayFloor.z && P.z>xrayFloor.y && P.z<xrayFloor.w && P.y>xrayFloorY.x){if(clamp((P.y-xrayFloorY.x)/0.35,0.0,1.0)>xb)discard;}\n'+
 ' int n=int(xrayCam.w);for(int i=0;i<8;i++){if(i>=n)break;vec4 S=xrayCap[i];if(P.y<S.y-1.25+'+'0.3'+')continue;vec3 d=xrayCam.xyz-S.xyz;float L=length(d);d/=max(L,0.001);L=min(L,'+'16.0'+');\n'+
 '  float t=clamp(dot(P-S.xyz,d),0.0,L);float r=S.w*(0.85+0.45*t/L);float e=length(P-S.xyz-d*t);if(e<r && t<L-0.5){if(clamp((r-e)/0.6,0.0,1.0)>xb)discard;}}}\n#endif\n';
TacticalXray.isLocal=function(T,s){return typeof TacticalStrategy!=='undefined'?TacticalStrategy.isLocal(T,s):!!s&&s.team===(T.localTeam||'friendly');};
/* pure: occluded own units -> merged capsules [x,y,z,r]* (tested) */
TacticalXray.clusters=function(units,K){K=K||TacticalXray.K;var cl=[];units.forEach(function(u){if(!(u.a>0.01))return;var p=u.p,r=K.r0*u.a,c=null;
  for(var i=0;i<cl.length;i++){if(Math.hypot(cl[i].sx/cl[i].n-p[0],cl[i].sz/cl[i].n-p[2])<K.merge&&Math.abs(cl[i].sy/cl[i].n-p[1])<2.5){c=cl[i];break;}}
  if(!c){if(cl.length>=K.max)return;c={sx:0,sy:0,sz:0,n:0,r:0,pts:[]};cl.push(c);}c.sx+=p[0];c.sy+=p[1];c.sz+=p[2];c.n++;c.pts.push(p);c.r=Math.max(c.r,r);});
 return cl.map(function(c){var x=c.sx/c.n,y=c.sy/c.n,z=c.sz/c.n,ext=0;c.pts.forEach(function(p){ext=Math.max(ext,Math.hypot(p[0]-x,p[2]-z));});return [x,y,z,c.r+ext];});};
TacticalXray.pack=function(caps,cam,out){out=out||new Float32Array(32);out.fill(0);for(var i=0;i<Math.min(8,caps.length);i++){out[i*4]=caps[i][0];out[i*4+1]=caps[i][1];out[i*4+2]=caps[i][2];out[i*4+3]=caps[i][3];}return out;};
TacticalXray.prototype.initialize=function(){var C=TacticalCommon,T=C.ns(this.app),self=this;T.xray=this;var q='';try{q=location.search||'';}catch(e){}var m=/[?&]xray=([^&]*)/.exec(q);
 this.mode=m?m[1]:'on';this.active=this.mode!=='0'&&this.mode!=='off';this.cutOn=this.active&&this.mode!=='sil';this.silOn=this.active;
 this.mats=new Set();this.units=new Map();this.capArr=new Float32Array(32);this.cam=new Float32Array(4);this.fl=new Float32Array([0,0,0,0]);this.fly=new Float32Array([-1e6,0,0,0]);this.floorCut=null;
 this.stats={patched:0,caps:0,sil:0,frames:0,maxMs:0,rays:0};var sc=this.app.graphicsDevice.scope;this.uCap=sc.resolve('xrayCap[0]');this.uCam=sc.resolve('xrayCam');this.uFl=sc.resolve('xrayFloor');this.uFlY=sc.resolve('xrayFloorY');
 this.onTown=function(){self.patchAll();};this.app.on('tactical:town',this.onTown);this.app.on('tactical:buildingState',this.onTown);
 if(this.silOn){var mt=new pc.StandardMaterial();mt.name='xray-silhouette';mt.useLighting=false;mt.diffuse=new pc.Color(0,0,0);mt.emissive=new pc.Color(0.35,0.85,1);mt.opacity=0.38;mt.blendType=pc.BLEND_NORMAL;
  mt.depthState=new pc.DepthState(pc.FUNC_GREATER,false);mt.cull=pc.CULLFACE_BACK;mt.update();this.silMat=mt;}
 this.app.once('postrender',function(){self.patchAll();});
 this.on('destroy',function(){self.app.off('tactical:town',self.onTown);self.app.off('tactical:buildingState',self.onTown);self.units.forEach(function(u){if(u.sil)u.sil.destroy();});});};
TacticalXray.prototype.excluded=function(e){var T=TacticalCommon.ns(this.app),K=TacticalXray.K;for(var n=e;n;n=n.parent){if(n._xrayOwner)return true;if(K.exclude.test(n.name||''))return true;}return false;};
TacticalXray.prototype.patchMat=function(m){if(!m||this.mats.has(m)||!(m instanceof pc.StandardMaterial)||!m.shaderChunks)return false;if(m.name==='xray-silhouette')return false;var X=TacticalXray;
 m.shaderChunksVersion='2.24';var g=m.shaderChunks.glsl,add=function(k,v){var o=g.get?g.get(k):'';g.set(k,(o||'')+v);};
 add('litUserDeclarationVS',X.CHUNK_DECL_VS);add('litUserMainEndVS',X.CHUNK_END_VS);add('litUserDeclarationPS',X.CHUNK_DECL_PS);add('litUserMainStartPS',X.CHUNK_START_PS);m.update();this.mats.add(m);this.stats.patched++;return true;};
/* building / prop / terrain materials (atlas M12 shared material included); soldiers, zombies, viewmodel, FX excluded */
TacticalXray.prototype.patchAll=function(){if(!this.cutOn)return 0;var T=TacticalCommon.ns(this.app),self=this,n=0;(T.squad||[]).forEach(function(s){if(s.entity)s.entity._xrayOwner=true;});
 if(typeof DreadingAtlas!=='undefined'&&DreadingAtlas.mat&&this.patchMat(DreadingAtlas.mat))n++;
 this.app.root.findComponents('render').forEach(function(r){if(!r.enabled||self.excluded(r.entity))return;(r.meshInstances||[]).forEach(function(mi){if(self.patchMat(mi.material))n++;});});
 return n;};
TacticalXray.prototype.setFloorCut=function(rect,y){if(!rect){this.floorCut=null;return;}this.floorCut={rect:[rect[0]-0.4,rect[1]-0.4,rect[2]+0.4,rect[3]+0.4],y:y};};
TacticalXray.prototype.update=function(dt){var C=TacticalCommon,T=C.ns(this.app),K=TacticalXray.K,self=this;if(!this.active||!T.ready)return;var t0=performance.now();
 var I=T.input,fps=!!(I&&I.fps),cam=T.camera||null;
 var cp=cam?cam.getPosition():null,now=performance.now()/1000,P=T.perception,live=new Set();
 (T.squad||[]).forEach(function(s){if(!s.alive||s.disabled||!TacticalXray.isLocal(T,s))return;live.add(s);var u=self.units.get(s);if(!u){u={a:0,occ:false,nextRay:0,sil:null};self.units.set(s,u);}
  var p=s.pos(),ch=[p[0],p[1]+1.25,p[2]];u.p=ch;
  if(!fps&&cp&&now>=u.nextRay){u.nextRay=now+K.rayEvery;self.stats.rays++;var cc=[cp.x,cp.y,cp.z],tg=[ch[0],ch[1]+0.2,ch[2]];u.occ=!!(P&&P.blocked&&P.blocked(cc,tg)&&P.blocked(cc,[p[0],p[1]+0.5,p[2]]));}
  var want=!fps&&u.occ?1:0;u.a+=(want-u.a)*Math.min(1,dt*(want?K.fadeIn:K.fadeOut));if(u.a<0.01)u.a=0;
  if(self.silOn){if(want&&!u.sil){u.sil=self.makeSil(s);}if(u.sil){u.sil.enabled=!fps&&u.a>0.05;if(u.sil.enabled)u.sil.setPosition(p[0],p[1]+0.9,p[2]);}}});
 this.units.forEach(function(u,s){if(!live.has(s)){if(u.sil)u.sil.destroy();self.units.delete(s);}});
 var caps=this.cutOn&&!fps?TacticalXray.clusters(Array.from(this.units.values()),K):[];this.caps=caps;
 TacticalXray.pack(caps,null,this.capArr);this.uCap.setValue(this.capArr);
 if(cp){this.cam[0]=cp.x;this.cam[1]=cp.y;this.cam[2]=cp.z;}this.cam[3]=caps.length;this.uCam.setValue(this.cam);
 var fc=!fps&&this.cutOn&&this.floorCut;if(fc){this.fl[0]=fc.rect[0];this.fl[1]=fc.rect[1];this.fl[2]=fc.rect[2];this.fl[3]=fc.rect[3];this.fly[0]=fc.y;}else this.fly[0]=-1e6;this.uFl.setValue(this.fl);this.uFlY.setValue(this.fly);
 this.stats.caps=caps.length;this.stats.sil=Array.from(this.units.values()).filter(function(u){return u.sil&&u.sil.enabled;}).length;this.stats.frames++;var ms=performance.now()-t0;if(ms>this.stats.maxMs)this.stats.maxMs=+ms.toFixed(3);};
TacticalXray.prototype.makeSil=function(s){var e=new pc.Entity('xray silhouette '+s.soldierName);e._xrayOwner=true;e.addComponent('render',{type:'capsule',material:this.silMat,castShadows:false,receiveShadows:false});e.setLocalScale(0.62,1.8,0.62);
this.app.root.addChild(e);return e;};
