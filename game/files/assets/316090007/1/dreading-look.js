/* DREADING look (look spec phases 1-4): CameraFrame post on the ONE tactical camera (RTS / FP presets), Poly Haven overcast HDRI,
   cool sun + cascades, clustered practicals, volumetric fog, quality tiers (Low / Med / High from one function), the power-grid
   cascade (listens to the sim event 'tactical:power'), and pooled VFX helpers (muzzle omni, impact / blood decals, flashbang bump).
   ?look=0 keeps the old lighting and no post (A/B). ?quality=low|med|high (else localStorage 'dreading.quality', default med).
   Dev readout: F9 (or ?dev=1). Quality cycle: F10. Debug views: Shift+F9 cycles cf.debug (ssao/bloom/depth...). */
(function(g){'use strict';
var qs=function(k){var m=new RegExp('[?&]'+k+'=([^&]*)').exec(location.search);return m?decodeURIComponent(m[1]):null;};
var L=g.DreadingLook={on:qs('look')!=='0',mode:'rts',tier:null,cf:null,stats:{cfUpdates:0,lightsActive:0,lampCount:0,circuits:0,muzzle:0,decals:0,events:0}};
/* Â§6 tier table: everything a tier changes lives here and is applied by L.setTier() */
L.TIERS={
 low:{scale:0.7,upscale:true,sharp:0.5,ssao:{on:false,samples:8,scale:0.5},bloom:{i:0.006,blur:8},fogSteps:8,fogLocal:false,dof:false,fringe:false,
  cascades:2,shadow:{rts:55,fp:35},shadowRes:1024,shadowType:'PCF3',atlas:1024,heroLamps:0,lights:10,muzzle:3,fxLite:true,decals:{impact:12,blood:0},hdri:'1k',skyMip:2},
 med:{scale:0.85,upscale:true,sharp:0.5,ssao:{on:true,samples:12,scale:1},bloom:{i:null,blur:16},fogSteps:16,fogLocal:true,dof:true,fringe:true,
  cascades:3,shadow:{rts:70,fp:40},shadowRes:2048,shadowType:'PCF3',atlas:2048,heroLamps:2,lights:16,muzzle:8,fxLite:false,decals:{impact:24,blood:16},hdri:'2k',skyMip:1},
 high:{scale:1.0,upscale:false,sharp:null,ssao:{on:true,samples:14,scale:1},bloom:{i:null,blur:16},fogSteps:24,fogLocal:true,dof:true,fringe:true,
  cascades:4,shadow:{rts:80,fp:45},shadowRes:2048,shadowType:'PCF5',atlas:2048,heroLamps:4,lights:24,muzzle:8,fxLite:false,decals:{impact:24,blood:16},hdri:'2k',skyMip:1}};
/* Â§2 presets (shared base + per camera) */
L.PRESET={
 rts:{sharp:0.45,vig:{intensity:0,inner:0.55,outer:1.05,curvature:0.6},fringe:0,dof:false,ssao:false,ssaoRadius:28,bloom:0.010,fog:0.0035,bright:1.0},
 fp:{sharp:0.3,vig:{intensity:0,inner:0.45,outer:0.95,curvature:0.5},fringe:12,dof:true,ssao:true,ssaoRadius:18,bloom:0.014,fog:0.012,bright:1.0}};
L.SUN={color:[0.82,0.88,0.95],intensity:1.2,euler:[52,-28,0],cascadeDistribution:0.7,normalOffsetBias:0.04,shadowBias:0.2};
L.LAMP={street:{color:[1.0,0.62,0.28],intensity:3.0,range:16,spot:true},bulb:{color:[1.0,0.72,0.45],intensity:1.6,range:8},
 fluo:{color:[0.85,0.95,1.0],intensity:2.2,range:10},emissive:14};
L.tierName=function(){var q=(qs('quality')||'').toLowerCase();if(L.TIERS[q])return q;try{var s=localStorage.getItem('dreading.quality');if(L.TIERS[s])return s;}catch(e){}return 'med';};

/* ---------- init: called by tacticalController.start right after it creates the camera + sun ---------- */
L.init=function(app,T,camEnt,sunEnt){L.app=app;L.T=T;L.cam=camEnt;L.sun=sunEnt;T.look=L;if(!L.on)return L;
 L.tier=L.tierName();var cc=camEnt.camera;
 try{var cf=L.cf=new pc.CameraFrame(app,cc);}catch(e){console.warn('[Look] CameraFrame unavailable: '+e.message);L.cf=null;}
 var cf=L.cf;if(cf){var R=cf.rendering;R.renderFormats=[pc.PIXELFORMAT_111110F,pc.PIXELFORMAT_RGBA16F,pc.PIXELFORMAT_RGBA32F].filter(function(f){return f!==undefined;});
  R.toneMapping=pc.TONEMAP_NEUTRAL;R.samples=1;cf.taa.enabled=true;cf.taa.jitter=1;
  cf.bloom.threshold=1.2;cf.bloom.blurLevel=16;
  cf.ssao.blurEnabled=true;cf.ssao.randomize=false;cf.ssao.intensity=0.08;cf.ssao.power=1;cf.ssao.minAngle=10;
  cf.grading.enabled=true;cf.grading.brightness=1.0;cf.grading.contrast=1.0;cf.grading.saturation=1.0;cf.grading.tint=new pc.Color(1,1,1);
  cf.colorEnhance.enabled=false;cf.colorEnhance.shadows=0.25;cf.colorEnhance.highlights=-0.15;cf.colorEnhance.midtones=0;cf.colorEnhance.vibrance=-0.1;cf.colorEnhance.dehaze=-0.08;
  cf.vignette.color=new pc.Color(0.04,0.05,0.07);
  cf.dof.nearBlur=false;cf.dof.highQuality=false;cf.dof.focusDistance=12;cf.dof.focusRange=18;cf.dof.blurRadius=2;cf.dof.blurRings=3;cf.dof.blurRingPoints=4;
  var f=cf.volumetricFog;f.enabled=true;f.light=sunEnt;f.localOmniLights=false;f.localSpotLights=false;f.tint=new pc.Color(0.70,0.76,0.78);f.density=0.012;f.heightBase=0;
  f.heightFalloff=0.045;f.extinction=0.85;f.anisotropy=0.5;f.intensity=0.8;f.ambientColor=new pc.Color(0.55,0.62,0.66);f.ambientIntensity=0.12;f.maxDistance=180;f.localIntensity=8;f.localSteps=10;}
 app.scene.fog&&(app.scene.fog.type='none');/* one fog only: CameraFrame volumetric */
 var sl=sunEnt.light,S=L.SUN;sl.color=new pc.Color(S.color[0],S.color[1],S.color[2]);sl.intensity=S.intensity;sunEnt.setEulerAngles(S.euler[0],S.euler[1],S.euler[2]);
 sl.cascadeDistribution=S.cascadeDistribution;sl.normalOffsetBias=S.normalOffsetBias;sl.shadowBias=S.shadowBias;
 var Lg=app.scene.lighting;if(Lg){app.scene.clusteredLightingEnabled=true;Lg.shadowsEnabled=true;Lg.cookiesEnabled=false;Lg.areaLightsEnabled=false;Lg.maxLightsPerCell=16;Lg.cells=new pc.Vec3(16,8,16);}
 L.setTier(L.tier,true);L.setMode('rts');L.loadSky();L.devInit();L.fxInit();
 app.on('tactical:power',L.onPower);app.on('tactical:town',L.buildLamps);if(T.town&&T.town.buildings&&T.town.buildings.length)L.buildLamps();
 app.on('update',L.tick);return L;};
L.setTier=function(name,silent){if(!L.TIERS[name])return;L.tier=name;try{localStorage.setItem('dreading.quality',name);}catch(e){}if(!L.on)return;var t=L.TIERS[name],cf=L.cf,app=L.app;
 if(cf){cf.rendering.renderTargetScale=t.scale;cf.ssao.samples=t.ssao.samples;cf.ssao.scale=t.ssao.scale;
  cf.bloom.blurLevel=t.bloom.blur;cf.volumetricFog.steps=t.fogSteps;}
 var sl=L.sun.light;sl.numCascades=t.cascades;sl.shadowResolution=t.shadowRes;sl.shadowType=t.shadowType==='PCF5'?pc.SHADOW_PCF5_32F:pc.SHADOW_PCF3_32F;
 var Lg=app.scene.lighting;if(Lg){Lg.shadowAtlasResolution=t.atlas;Lg.shadowType=pc.SHADOW_PCF3_32F;}
 var X=g.DreadingExplosionFX;if(X&&X.CFG)X.CFG.lite=t.fxLite||/[?&]fxLite=1/.test(location.search);/* runtime part (linger smoke); pool layers follow at next load */
 L.skyTier();L.applyMode();L.poolSize();if(!silent&&L.T&&L.T.input&&L.T.input.toast)L.T.input.toast('Quality: '+name.toUpperCase()+(t.fxLite?' (explosions lite after reload)':''));};
L.setMode=function(m){L.mode=m==='fp'?'fp':'rts';L.applyMode();};
// Compile both existing render modes while the map is still loading, before direct control is available.
L.prewarmModes=async function(){
 if(!L.on||!L.cf||L.modesWarmed)return;
 const saved=L.mode,canvas=L.app.graphicsDevice.canvas,visibility=canvas.style.visibility,position=L.cam.getPosition().clone(),rotation=L.cam.getRotation().clone(),soldier=(L.T.squad||[]).find(s=>s.alive&&s.team==='friendly');
 const frames=()=>new Promise(resolve=>{let n=0;const done=()=>{L.app.off('frameend',tick);clearTimeout(timer);resolve(n>=2);};const tick=()=>{if(++n>=2)done();};const timer=setTimeout(done,10000);L.app.on('frameend',tick);});
 try{canvas.style.visibility='hidden';if(soldier){const p=soldier.pos();L.cam.setPosition(p[0],p[1]+1.62,p[2]);L.cam.setEulerAngles(0,soldier.lookYaw*180/Math.PI,0);}L.setMode('fp');const fp=await frames();L.cam.setPosition(position);L.cam.setRotation(rotation);L.setMode(saved);const restored=await frames();L.modesWarmed=fp&&restored;}
 finally{L.cam.setPosition(position);L.cam.setRotation(rotation);if(L.mode!==saved)L.setMode(saved);canvas.style.visibility=visibility;}
};
L.applyMode=function(){if(!L.on||!L.tier)return;var t=L.TIERS[L.tier],P=L.PRESET[L.mode],cf=L.cf;L.sun.light.shadowDistance=t.shadow[L.mode];
 if(!cf)return;cf.rendering.sharpness=t.sharp!=null?Math.max(t.sharp,0):P.sharp;
 for(var k in P.vig)cf.vignette[k]=P.vig[k];cf.fringing.intensity=t.fringe?P.fringe:0;cf.dof.enabled=!!(t.dof&&P.dof);cf.ssao.radius=P.ssaoRadius;cf.ssao.type=t.ssao.on&&P.ssao?(qs('ssao')==='combine'?pc.SSAOTYPE_COMBINE:pc.SSAOTYPE_LIGHTING):pc.SSAOTYPE_NONE;/* AO only in FP (street level). From the RTS height it crushed the whole town to near-black; COMBINE tinted surfaces magenta in SwiftShader, so LIGHTING is default, ?ssao=combine to try */cf.volumetricFog.density=P.fog;cf.grading.brightness=P.bright;/* overcast sun is dim: lift exposure so the RTS map stays readable *//* RTS looks through ~80 m of air: thin haze there, denser street-level fog in FP */
 cf.bloom.intensity=t.bloom.i!=null?t.bloom.i:P.bloom;L.fogLocal();L.cfUpdate();};
// Clear presentation in every camera mode and quality tier; retain neutral tone mapping.
L.cfUpdate=function(){if(g.DreadingNight)g.DreadingNight.configure(L);if(L.cf){var c=L.cf;c.bloom.intensity=0;c.dof.enabled=false;c.taa.enabled=false;c.fringing.intensity=0;c.volumetricFog.enabled=false;c.ssao.type=pc.SSAOTYPE_NONE;c.vignette.intensity=0;c.grading.enabled=false;c.colorEnhance.enabled=false;c.rendering.sharpness=0;g.DreadingVisuals?.apply();L.hazeApply&&L.hazeApply(c);L.cf.update();L.stats.cfUpdates++;}};
L.fogLocal=function(){var cf=L.cf;if(!cf)return;var on=L.TIERS[L.tier].fogLocal&&L.anyPowered();cf.volumetricFog.localSpotLights=on;cf.volumetricFog.localOmniLights=false;cf.volumetricFog.localSteps=L.tier==='high'?12:8;};
L.DEBUG=[null,'ssao','bloom','depth','scene','vignette','dofcoc'];
L.cycleDebug=function(){if(!L.cf)return;var i=(L.DEBUG.indexOf(L.cf.debug)+1)%L.DEBUG.length;L.cf.debug=L.DEBUG[i];L.cfUpdate();if(L.T.input&&L.T.input.toast)L.T.input.toast('Post debug: '+(L.DEBUG[i]||'off'));};

/* ---------- Â§3.1 HDRI (Poly Haven kloofendal_overcast_puresky, CC0): generated once per resolution, never per frame ---------- */
L.sky={};L.loadSky=function(){var app=L.app,res=L.TIERS[L.tier].hdri;if(L.sky[res]){L.useSky(L.sky[res]);return;}
 var url='look/kloofendal_overcast_puresky_'+res+'.hdr',a=new pc.Asset('sky-'+res,'texture',{url:url},{mipmaps:false});
 a.ready(function(){try{var tex=a.resource,sky=pc.EnvLighting.generateSkyboxCubemap(tex),src=pc.EnvLighting.generateLightingSource(tex),atlas=pc.EnvLighting.generateAtlas(src);src.destroy();
  L.sky[res]={sky:sky,atlas:atlas,tex:tex};if(L.TIERS[L.tier].hdri===res)L.useSky(L.sky[res]);}catch(e){console.warn('[Look] HDRI failed: '+e.message);}});
 a.on('error',function(e){console.warn('[Look] HDRI load error '+e);});app.assets.add(a);app.assets.load(a);};
L.useSky=function(s){var sc=L.app.scene;sc.envAtlas=s.atlas;sc.skybox=s.sky;sc.skyboxIntensity=1.0;sc.skyboxMip=L.TIERS[L.tier].skyMip;
 sc.skyboxRotation=new pc.Quat().setFromEulerAngles(0,L.SUN.euler[1]+180,0);/* brighter horizon toward the sun heading */
 sc.ambientLight=new pc.Color(0.42,0.47,0.50);L.skyOn=true;if(g.DreadingNight)g.DreadingNight.configure(L);};
L.skyTier=function(){if(!L.app||!L.tier)return;var r=L.TIERS[L.tier].hdri;if(L.sky[r])L.useSky(L.sky[r]);else if(L.skyOn||L.cf)L.loadSky();};

/* ---------- Â§3.3 / Â§3.6 practicals + power-grid cascade ---------- */
L.circuits={};L.lamps=[];L.pool=[];
L.buildLamps=function(){var T=L.T,tw=T.town,app=L.app;if(!L.on||!tw||!tw.buildings)return;
 if(L.lampRoot){L.lampRoot.destroy();}L.lampRoot=new pc.Entity('Look practicals');(T.root||app.root).addChild(L.lampRoot);L.lamps=[];L.circuits={};
 var hm=tw.lay&&tw.lay.spec&&tw.lay.spec.hm,gy=function(x,z){return hm?hm.at(x,z):0;},roads=tw.roads||[],posts=[],POI=/church|townhall|cafe|pharmacy|station|factory|dairy|warehouse|shop|hotel|bar|garage|bakery/i;
 var isPOI=g.TacticalStrategy&&TacticalStrategy.isPOI?TacticalStrategy.isPOI:function(b){return b&&b.type!=='park'&&(b.landmark||POI.test(b.type||''));};/* same POI rule as the sim (TacticalStrategy.isPOI) */
 tw.buildings.forEach(function(b){if(!isPOI(b))return;var C=L.circuits[b.id]={id:b.id,name:b.name||b.type,b:b,lamps:[],on:false,level:0,t0:0,cut:false,mi:null};
  var st=(b.shells||[]).reduce(function(a,s){return Math.max(a,s.storeys||1);},1),py=(b.padY||gy(b.x,b.z));
  /* street lamps: along the roads within 45 m of the POI, every 14 m, on the kerb facing the road */
  roads.forEach(function(rd){var pts=rd.pts||[];for(var i=0;i<pts.length-1;i++){var a=pts[i],c=pts[i+1],dx=c[0]-a[0],dz=c[1]-a[1],len=Math.hypot(dx,dz);if(len<1)continue;var ux=dx/len,uz=dz/len;
   for(var s=7;s<len;s+=14){var x=a[0]+ux*s,z=a[1]+uz*s,d=Math.hypot(x-b.x,z-b.z);if(d>45)continue;var sd=((x-b.x)*-uz+(z-b.z)*ux)>0?-1:1,o=(rd.w||7)/2+0.6,lx=x+-uz*o*sd,lz=z+ux*o*sd;
    if(L.lamps.some(function(l){return Math.hypot(l.p[0]-lx,l.p[2]-lz)<8;}))continue;var y=gy(lx,lz),hx=lx+uz*sd*1.1,hz=lz-ux*sd*1.1;
    var lamp={kind:'street',c:C,p:[hx,y+5.0,hz],base:[lx,y,lz],d:d,level:0};L.lamps.push(lamp);C.lamps.push(lamp);
    posts.push({p:[lx,y+2.5,lz],s:[0.14,5,0.14],r:[0,0,0],m:'rail',vis:true},{p:[(lx+hx)/2,y+4.95,(lz+hz)/2],s:[Math.abs(hx-lx)+0.1,0.08,Math.abs(hz-lz)+0.1],r:[0,0,0],m:'rail',vis:true});}}});
  C.lamps.sort(function(p,q){return q.d-p.d;});/* walk along the street toward the POI ... */
  for(var f=0;f<Math.min(st,3);f++){var lamp2={kind:f===0&&/station|factory|warehouse|garage/i.test(b.type||'')?'fluo':'bulb',c:C,p:[b.x,py+f*3.2+2.3,b.z],d:0,level:0};L.lamps.push(lamp2);C.lamps.push(lamp2);}/* ... then interiors */
  /* lamp heads: one emissive mesh per circuit (1 draw call, only while the circuit is lit) */
  var heads=C.lamps.filter(function(l){return l.kind==='street';}).map(function(l){return {p:[l.p[0],l.p[1]-0.08,l.p[2]],s:[0.5,0.12,0.32],r:[0,0,0],m:'concrete',vis:true};});
  if(heads.length){var mat=new pc.StandardMaterial();mat.diffuse=new pc.Color(0.2,0.18,0.15);mat.emissive=new pc.Color(L.LAMP.street.color[0],L.LAMP.street.color[1],L.LAMP.street.color[2]);mat.emissiveIntensity=0;mat.update();
   var he=new pc.Entity('lamp heads '+b.id);he.addComponent('render',{type:'asset',castShadows:false});he.render.meshInstances=L.boxMeshes(heads,mat);he.enabled=false;L.lampRoot.addChild(he);C.heads=he;C.mat=mat;}});
 if(posts.length&&tw.buildMeshes){var pe=new pc.Entity('lamp posts');pe.addComponent('render',{type:'asset',castShadows:true,receiveShadows:true});pe.render.meshInstances=tw.buildMeshes(posts);L.lampRoot.addChild(pe);}
 L.stats.lampCount=L.lamps.length;L.stats.circuits=Object.keys(L.circuits).length;L.poolSize();
 /* re-apply live power state (rebuilds after collapse keep the grid) */if(T.power&&T.power.on)Object.keys(T.power.on).forEach(function(id){if(T.power.on[id]&&L.circuits[id])L.setCircuit(L.circuits[id],true,true);});};
L.boxMeshes=function(pieces,mat){var P=[],N=[],I=[],F=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
 pieces.forEach(function(p){F.forEach(function(f){var n=f[0],u=f[1],w=f[2],b=P.length/3;[[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(k){for(var a=0;a<3;a++)P.push(p.p[a]+(n[a]+u[a]*k[0]+w[a]*k[1])*p.s[a]/2);N.push(n[0],n[1],n[2]);});I.push(b,b+1,b+2,b,b+2,b+3);});});
 var m=new pc.Mesh(L.app.graphicsDevice);m.setPositions(P);m.setNormals(N);m.setIndices(I);m.update();return [new pc.MeshInstance(m,mat)];};
L.streetGridOn=function(){return g.DreadingVisuals?.settings.streetlights!==false;};
L.anyPowered=function(){if(L.streetGridOn()&&L.lamps.some(function(l){return l.kind==='street';}))return true;for(var k in L.circuits)if(L.circuits[k].on)return true;return false;};
/* sim event -> presentation. The event is fired by TacticalStrategy.power (authoritative), never by a visual timer */
L.onPower=function(ev){if(!ev)return;L.stats.events++;var C=L.circuits[ev.id];if(C)L.setCircuit(C,!!ev.on,false);};
L.setCircuit=function(C,on,instant){var now=performance.now()/1000;C.on=on;C.t0=now;C.cut=!on;
 var acc=0;C.lamps.forEach(function(l,i){if(i)acc+=l.kind==='street'?0.04+0.08*L.rnd(i):0.09;l.tOn=now+(instant?0:(l.kind==='street'?acc:acc+0.15));/* 40-120 ms per street lamp walking toward the POI, then interiors */l.tOff=now+(instant?0:0.11);l.fl=2+Math.floor(L.rnd(i+7)*3);});
 if(C.heads)C.heads.enabled=true;L.fogLocal();L.cfUpdate();L.animating=true;};
L.rnd=function(i){var x=Math.sin(i*127.1+311.7)*43758.5453;return x-Math.floor(x);};
/* per-lamp level: sodium/tungsten pop + 150 ms rise, fluorescent 2-4 flickers; cut = one quick flicker then black */
L.lampLevel=function(l,now){if(l.kind==='street'&&L.streetGridOn())return 1;var C=l.c;if(C.on){var t=now-l.tOn;if(t<0)return 0;if(l.kind==='fluo'){var n=l.fl,per=0.055;if(t<n*per*2)return Math.floor(t/per)%2?0:1;return 1;}return Math.min(1,0.35+t/0.15*0.65);}
 var t2=now-C.t0;if(t2<0.05)return 0;if(t2<0.11)return 0.8;return 0;};
L.poolSize=function(){if(!L.app||!L.tier)return;var n=L.TIERS[L.tier].lights,hero=g.DreadingNight&&g.DreadingNight.enabled?0:L.TIERS[L.tier].heroLamps,root=L.lampRoot||L.app.root;
 while(L.pool.length<n){var e=new pc.Entity('practical '+L.pool.length);e.addComponent('light',{type:'spot',castShadows:false,innerConeAngle:35,outerConeAngle:62,range:16,intensity:0,shadowResolution:256});e.light.volumetricScattering=0;/* street lamps stay out of the beam haze (cost) */e.enabled=false;L.app.root.addChild(e);e.setEulerAngles(0,0,0);L.pool.push({e:e,lamp:null});}
 L.pool.forEach(function(s,i){s.e.light.castShadows=i<hero;if(i>=n){s.e.enabled=false;s.lamp=null;}});L.nextAssign=0;};
L.tick=function(dt){if(!L.on)return;if(g.DreadingNight)g.DreadingNight.shadows(L);var now=performance.now()/1000;
 if(L.animating||L.anyPowered()){var anim=false;
  for(var id in L.circuits){var C=L.circuits[id];if(!C.heads&&!C.lamps.length)continue;var mx=0;for(var i=0;i<C.lamps.length;i++){var l=C.lamps[i],v=L.lampLevel(l,now);l.level=v;if(v>mx)mx=v;if(C.on&&now-l.tOn<0.6)anim=true;}
   if(!C.on&&now-C.t0<0.2)anim=true;if(C.mat){var ei=L.LAMP.emissive*mx;if(C.mat.emissiveIntensity!==ei){C.mat.emissiveIntensity=ei;C.mat.update();}}if(C.heads)C.heads.enabled=C.lamps.some(function(l){return l.kind==='street'&&l.level>0;});}
  L.animating=anim;
  if(now>=(L.nextAssign||0)){L.nextAssign=now+0.25;L.assign();}
  var act=0;L.pool.forEach(function(s){if(!s.lamp){if(s.e.enabled)s.e.enabled=false;return;}var l=s.lamp,K=L.LAMP[l.kind],v=l.level;if(v<=0){if(s.e.enabled)s.e.enabled=false;return;}
   if(!s.e.enabled)s.e.enabled=true;act++;var lc=s.e.light;if(lc.intensity!==K.intensity*v)lc.intensity=K.intensity*v;});L.stats.lightsActive=act;}
 else if(L.stats.lightsActive){L.pool.forEach(function(s){s.e.enabled=false;s.lamp=null;});L.stats.lightsActive=0;}
 L.flashlightTick();L.fxTick(dt,now);L.devTick(dt);};
/* Squad flashlights (2026-11-19 flashlight pass). Each is a long LINEAR-falloff 'throw' spot with a narrow hot core and a wide
   smoothstep edge (the old 6x inverse-square spot clipped to white inside ~6 m, so the 14-27 deg soft edge was crushed into a
   hard stencil disc and nothing reached down the street). The nearest four also get a short inverse-square 'spill' child spot:
   a dim wide pool that wraps across nearby walls / floor at grazing angles. At night the throw beams scatter into a thin
   volumetric haze (CameraFrame volumetricFog, local spot lights only, see L.hazeApply) so the beam has a visible cone
   (only while DreadingVisuals.settings.beamHaze is on, the editor's 'Volumetric flashlight beams' toggle).
   FP: the possessed soldier's light sits on the weapon (below/right of the eye), not inside the camera.
   Gameplay beams (DreadingNight.beam / inBeam: 28 m, 27 deg) are unchanged. Still shadow-free.
   Tunables: DreadingLook.FLASH, shown in the Game editor (F10) > Lighting as 'Flashlight ...' (stored in DreadingVisuals.settings
   as flash_*). DreadingVisuals' 'Soldier flashlight intensity' (default 6) scales both lights relative to 6. */
L.flashlightsOn=true;L.flashlights=[];
L.FLASH={intensity:1.7,range:45,inner:2,outer:16,spill:0.3,spillRange:18,spillInner:8,spillOuter:40,haze:0.012,beam:6,aiDown:0.1,spillCount:4,hazeCount:4,mountRight:0.17,mountDown:0.16,mountFwd:0.3};
L.FLASH_UI={intensity:['Flashlight throw intensity',0,4,.01],range:['Flashlight range (m)',5,90,.5],inner:['Flashlight hot core angle',1,40,.5],outer:['Flashlight edge angle',2,70,.5],
 spill:['Flashlight near spill',0,1,.005],spillRange:['Flashlight spill range (m)',2,40,.5],spillOuter:['Flashlight spill angle',5,80,.5],haze:['Flashlight beam haze (night, 0 = off)',0,.08,.001],beam:['Flashlight beam brightness in haze',0,30,.1]};
L.flashLink=function(){var V=g.DreadingVisuals;if(!V||!V.settings||!V.controls||L.flashLinked)return;L.flashLinked=true;
 for(var k in L.FLASH_UI){var id='flash_'+k,d=L.FLASH_UI[k];if(typeof V.settings[id]!=='number')V.settings[id]=L.FLASH[k];if(!V.controls[id])V.controls[id]=['Lighting',d[0],d[1],d[2],d[3]];}};
L.flashGet=function(k){var V=g.DreadingVisuals,v=V&&V.settings?V.settings['flash_'+k]:undefined;return typeof v==='number'&&isFinite(v)?v:L.FLASH[k];};
/* night haze for the beams; called from L.cfUpdate after the 'clear presentation' reset (so it is the only fog pass that runs) */
L.hazeOptIn=function(){var V=g.DreadingVisuals;return V&&V.settings&&typeof V.settings.beamHaze==='boolean'?V.settings.beamHaze:true;};/* DreadingVisuals 'Volumetric flashlight beams' toggle */
L.hazeApply=function(c){var N=g.DreadingNight,h=L.flashGet('haze'),b=L.flashGet('beam'),opt=L.hazeOptIn();L.hazeVal=h;L.hazeBeam=b;L.hazeOpt=opt;
 var on=!!(N&&N.enabled&&opt&&h>0&&L.flashlightsOn);L.hazeOn=on;if(!on)return;var f=c.volumetricFog;
 f.light=null;/* local spots only: no sun ray-march at night (it also needs the light COMPONENT, not the entity the day setup passes) */f.enabled=true;f.density=h;f.heightBase=0;f.heightFalloff=0.06;f.extinction=0.8;f.anisotropy=0.55;f.maxDistance=110;
 f.intensity=0.4;f.tint=new pc.Color(0.92,0.93,0.95);f.ambientColor=new pc.Color(0.05,0.06,0.085);f.ambientIntensity=0.5;
 f.localSpotLights=true;f.localOmniLights=false;f.localIntensity=b;f.localSteps=L.tier==='high'?12:8;};
L.flashlightTick=function(){L.flashLink();var T=L.T,cp=L.cam.getPosition(),fp=T.input&&T.input.fps,selected=(T.squad||[]).filter(function(s){return L.flashlightsOn&&s.alive&&s.flashlightOn!==false&&(!g.DreadingNight||!g.DreadingNight.enabled?s.team==='friendly':true)&&Math.hypot(s.pos()[0]-cp.x,s.pos()[2]-cp.z)<65;}).sort(function(a,b){if(fp&&a===fp.s)return -1;if(fp&&b===fp.s)return 1;var ap=a.pos(),bp=b.pos();return Math.hypot(ap[0]-cp.x,ap[2]-cp.z)-Math.hypot(bp[0]-cp.x,bp[2]-cp.z);}).slice(0,8);
 var F={};for(var k in L.FLASH)F[k]=L.flashGet(k);var V=g.DreadingVisuals,mul=V&&V.settings&&typeof V.settings.torch==='number'?V.settings.torch/6:1;
 if(L.cf&&(L.hazeVal!==F.haze||L.hazeBeam!==F.beam||L.hazeOpt!==L.hazeOptIn()))L.cfUpdate();
 while(L.flashlights.length<selected.length){var e=new pc.Entity('Squad flashlight '+L.flashlights.length);e.addComponent('light',{type:'spot',castShadows:false,color:new pc.Color(1,.94,.84),intensity:F.intensity,range:F.range,innerConeAngle:F.inner,outerConeAngle:F.outer,falloffMode:pc.LIGHTFALLOFF_LINEAR});
  var sp=new pc.Entity('Squad flashlight spill');sp.addComponent('light',{type:'spot',castShadows:false,color:new pc.Color(1,.92,.8),intensity:F.spill,range:F.spillRange,innerConeAngle:F.spillInner,outerConeAngle:F.spillOuter,falloffMode:pc.LIGHTFALLOFF_INVERSESQUARED});
  sp.light.volumetricScattering=0;e.addChild(sp);e.spill=sp;L.app.root.addChild(e);L.flashlights.push(e);}
 var set=function(c,k,v){if(c[k]!==v)c[k]=v;};
 L.flashlights.forEach(function(e,i){var s=selected[i];e.enabled=!!s;if(!s)return;var lc=e.light,sl=e.spill.light;
  set(lc,'intensity',F.intensity*mul);set(lc,'range',F.range);set(lc,'outerConeAngle',F.outer);set(lc,'innerConeAngle',Math.min(F.inner,F.outer-.5));set(lc,'volumetricScattering',i<F.hazeCount?1:0);
  var sOn=i<F.spillCount&&F.spill>0;if(e.spill.enabled!==sOn)e.spill.enabled=sOn;
  if(sOn){set(sl,'intensity',F.spill*mul);set(sl,'range',F.spillRange);set(sl,'outerConeAngle',F.spillOuter);set(sl,'innerConeAngle',Math.min(F.spillInner,F.spillOuter-.5));}
  if(fp&&fp.s===s){var c=L.cam.getPosition(),f=L.cam.forward,r=L.cam.right,u=L.cam.up,ox=c.x+r.x*F.mountRight-u.x*F.mountDown+f.x*F.mountFwd,oy=c.y+r.y*F.mountRight-u.y*F.mountDown+f.y*F.mountFwd,oz=c.z+r.z*F.mountRight-u.z*F.mountDown+f.z*F.mountFwd;
   e.setPosition(ox,oy,oz);e.lookAt(ox+f.x*12,oy+f.y*12,oz+f.z*12);e.rotateLocal(90,0,0);return;}
  var p=s.pos();if(g.DreadingNight&&g.DreadingNight.enabled){var beam=g.DreadingNight.beam(s,T),dy=beam.d[1]-F.aiDown;/* visual only: other soldiers carry the light at low ready (gameplay beam unchanged) */e.setPosition(beam.p[0],beam.p[1],beam.p[2]);e.lookAt(beam.p[0]+beam.d[0]*10,beam.p[1]+dy*10,beam.p[2]+beam.d[2]*10);e.rotateLocal(90,0,0);return;}e.setPosition(p[0],p[1]+1.45,p[2]);e.lookAt(p[0]-Math.sin(s.lookYaw)*10,p[1]+1.15,p[2]-Math.cos(s.lookYaw)*10);e.rotateLocal(90,0,0);});
 L.stats.flashlights=selected.length;
};
/* clustered-light cap: the N lit lamps nearest the camera get a real light (spots for street lamps, omni for interiors); the rest stay emissive-only */
L.assign=function(){var cp=L.cam.getPosition(),n=Math.min(L.pool.length,L.TIERS[L.tier].lights),fp=L.mode==='fp',cx=cp.x,cz=cp.z,R=45;
 // Overhead lights belong to the viewed ground, not a sphere around the airborne camera.
 if(!fp){var f=L.cam.forward,hm=L.T&&L.T.town&&L.T.town.lay&&L.T.town.lay.spec&&L.T.town.lay.spec.hm;
  var ground=hm?hm.at(cx,cz):0,travel=f&&f.y<-.05?Math.max(0,(cp.y-ground)/-f.y):0;
  if(f){cx+=f.x*travel;cz+=f.z*travel;}R=Math.max(80,Math.min(220,travel*.65+40));}
 var held=new Set(L.pool.slice(0,n).map(function(s){return s.lamp;}));
 var lit=L.lamps.filter(function(l){return l.c.on||l.level>0||(l.kind==='street'&&L.streetGridOn());}).map(function(l){
  var d=fp?Math.hypot(l.p[0]-cx,l.p[1]-cp.y,l.p[2]-cz):Math.hypot(l.p[0]-cx,l.p[2]-cz);
  return {l:l,d:d,score:d-(held.has(l)?8:0)};
 }).filter(function(o){return o.d<R+(held.has(o.l)?8:0);}).sort(function(a,b){return a.score-b.score;}).slice(0,n);
 var chosen=new Set(lit.map(function(o){return o.l;})),retained=new Set();
 L.pool.forEach(function(s,i){if(i<n&&chosen.has(s.lamp))retained.add(s.lamp);else{s.lamp=null;s.e.enabled=false;}});
 var pending=lit.map(function(o){return o.l;}).filter(function(l){return !retained.has(l);});
 L.pool.slice(0,n).forEach(function(s){if(s.lamp||!pending.length)return;
  // Prefer the existing light type when filling a free slot to reduce shader variant churn.
  var j=pending.findIndex(function(l){return (L.LAMP[l.kind].spot?'spot':'omni')===s.e.light.type;});
  var l=pending.splice(j<0?0:j,1)[0],K=L.LAMP[l.kind],lc=s.e.light;s.lamp=l;
  var type=K.spot?'spot':'omni';if(lc.type!==type)lc.type=type;
  lc.range=K.range;lc.color=new pc.Color(K.color[0],K.color[1],K.color[2]);s.e.setPosition(l.p[0],l.p[1],l.p[2]);s.e.setEulerAngles(0,0,0);
 });};

/* ---------- Â§4 VFX helpers (pooled; called from TacticalNS.muzzleWorldFx / impactFx / bloodFx and the flashbang veil) ---------- */
L.fxInit=function(){var app=L.app;L.mz=[];for(var i=0;i<8;i++){var e=new pc.Entity('muzzle light '+i);e.addComponent('light',{type:'omni',castShadows:false,range:6,intensity:0,color:new pc.Color(1,0.72,0.35)});e.enabled=false;app.root.addChild(e);L.mz.push({e:e,t:0});}
 L.decalInit();};
L.muzzle=function(p){if(g.DreadingNight)g.DreadingNight.flash(p,6,.25);if(!L.on||!L.mz)return;var cap=L.TIERS[L.tier].muzzle,s=null;for(var i=0;i<cap;i++){if(L.mz[i].t<=0){s=L.mz[i];break;}}if(!s){return;}
 s.t=g.DreadingNight&&g.DreadingNight.enabled?.25:.06;s.e.setPosition(p[0],p[1],p[2]);s.e.light.intensity=4;s.e.enabled=true;L.stats.muzzle++;};
L.fxTick=function(dt,now){if(L.mz)for(var i=0;i<L.mz.length;i++){var s=L.mz[i];if(s.t>0){s.t-=dt;if(s.t<=0){s.e.enabled=false;}else s.e.light.intensity=4*Math.min(1,s.t/0.03);}}
 if(L.dc&&now>=L.dc.nextFade){L.dc.nextFade=now+0.5;L.decalFade(now);}};
/* one shared decal atlas (procedural canvas, 4x2 cells: 0-3 concrete chips / dirt, 4-5 scuffs, 6-7 blood) + ONE dynamic mesh for every decal = 1 draw call */
L.decalInit=function(){var dev=L.app.graphicsDevice,N=40,cv=document.createElement('canvas');cv.width=512;cv.height=256;var x=cv.getContext('2d');
 for(var c=0;c<8;c++){var ox=(c%4)*128+64,oy=Math.floor(c/4)*128+64;x.save();x.translate(ox,oy);
  if(c<6){var col=c<4?'rgba(40,36,32,':'rgba(70,62,52,';for(var k=0;k<14;k++){var a=L.rnd(c*31+k)*6.28,r=8+L.rnd(c*17+k)*38;x.fillStyle=col+(0.25+0.5*L.rnd(k+c))+')';x.beginPath();x.ellipse(Math.cos(a)*r*0.5,Math.sin(a)*r*0.5,4+r*0.25,3+r*0.15,a,0,6.28);x.fill();}
   var gr=x.createRadialGradient(0,0,0,0,0,16);gr.addColorStop(0,col+'0.95)');gr.addColorStop(1,col+'0)');x.fillStyle=gr;x.beginPath();x.arc(0,0,16,0,6.28);x.fill();}
  else{for(var k2=0;k2<9;k2++){var a2=L.rnd(c*13+k2)*6.28,r2=6+L.rnd(c*7+k2)*40;x.fillStyle='rgba(62,6,6,'+(0.5+0.4*L.rnd(k2))+')';x.beginPath();x.arc(Math.cos(a2)*r2*0.6,Math.sin(a2)*r2*0.6,3+L.rnd(k2+c)*12,0,6.28);x.fill();}
   x.fillStyle='rgba(55,4,4,0.9)';x.beginPath();x.arc(0,0,22,0,6.28);x.fill();}
  x.restore();}
 var tex=new pc.Texture(dev,{name:'look-decals',width:512,height:256,format:pc.PIXELFORMAT_RGBA8,mipmaps:true,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});tex.setSource(cv);
 var m=new pc.StandardMaterial();m.diffuseMap=tex;m.opacityMap=tex;m.opacityMapChannel='a';m.diffuseVertexColor=true;m.opacityVertexColor=true;m.opacityVertexColorChannel='a';m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;m.useMetalness=true;m.metalness=0;m.gloss=0.2;m.update();
 var P=new Float32Array(N*12),Nn=new Float32Array(N*12),U=new Float32Array(N*8),C=new Uint8Array(N*16),I=[];for(var q=0;q<N;q++){I.push(q*4,q*4+1,q*4+2,q*4,q*4+2,q*4+3);}
 var mesh=new pc.Mesh(dev);mesh.setPositions(P);mesh.setNormals(Nn);mesh.setUvs(0,U);mesh.setColors32(C);mesh.setIndices(I);mesh.update(pc.PRIMITIVE_TRIANGLES,false);
 var e=new pc.Entity('Look decals');e.addComponent('render',{type:'asset',castShadows:false,receiveShadows:true});var mi=new pc.MeshInstance(mesh,m);mi.cull=false;e.render.meshInstances=[mi];L.app.root.addChild(e);
 L.dc={N:N,P:P,Nn:Nn,U:U,C:C,mesh:mesh,slots:[],nextFade:0,e:e};for(var s=0;s<N;s++)L.dc.slots.push({kind:null,born:-1e9,life:10,cell:0,i:s});};
L.decal=function(kind,p,n){var D=L.dc;if(!L.on||!D)return null;var t=L.TIERS[L.tier].decals,cap=kind==='blood'?t.blood:t.impact;if(!cap)return null;
 var mine=D.slots.filter(function(s){return s.kind===kind;}),now=performance.now()/1000,slot;
 if(mine.length>=cap)slot=mine.sort(function(a,b){return a.born-b.born;})[0];else slot=D.slots.filter(function(s){return !s.kind||now-s.born>s.life;})[0]||D.slots.slice().sort(function(a,b){return a.born-b.born;})[0];
 slot.kind=kind;slot.born=now;slot.life=kind==='blood'?12:8+L.rnd(now)*4;slot.cell=kind==='blood'?6+(Math.random()<0.5?1:0):Math.floor(Math.random()*(kind==='scuff'?2:4))+(kind==='scuff'?4:0);
 var sz=kind==='blood'?0.35+Math.random()*0.35:0.12+Math.random()*0.1,nl=Math.hypot(n[0],n[1],n[2])||1,nx=n[0]/nl,ny=n[1]/nl,nz=n[2]/nl,ux,uy,uz;
 if(Math.abs(ny)<0.9){ux=nz;uy=0;uz=-nx;}else{ux=1;uy=0;uz=0;}var ul=Math.hypot(ux,uy,uz)||1;ux/=ul;uy/=ul;uz/=ul;var vx=ny*uz-nz*uy,vy=nz*ux-nx*uz,vz=nx*uy-ny*ux;
 var a=Math.random()*6.28,ca=Math.cos(a),sa=Math.sin(a),Ax=ux*ca+vx*sa,Ay=uy*ca+vy*sa,Az=uz*ca+vz*sa,Bx=vx*ca-ux*sa,By=vy*ca-uy*sa,Bz=vz*ca-uz*sa,o=0.012;
 var cx=p[0]+nx*o,cy=p[1]+ny*o,cz=p[2]+nz*o,k=slot.i*12,K=[[-1,-1],[1,-1],[1,1],[-1,1]],cu=(slot.cell%4)*0.25,cvv=Math.floor(slot.cell/4)*0.5;
 for(var j=0;j<4;j++){var s1=K[j][0]*sz,s2=K[j][1]*sz;D.P[k+j*3]=cx+Ax*s1+Bx*s2;D.P[k+j*3+1]=cy+Ay*s1+By*s2;D.P[k+j*3+2]=cz+Az*s1+Bz*s2;D.Nn[k+j*3]=nx;D.Nn[k+j*3+1]=ny;D.Nn[k+j*3+2]=nz;
  D.U[slot.i*8+j*2]=cu+(K[j][0]>0?0.25:0);D.U[slot.i*8+j*2+1]=1-(cvv+(K[j][1]>0?0:0.5));var ci=slot.i*16+j*4;D.C[ci]=255;D.C[ci+1]=255;D.C[ci+2]=255;D.C[ci+3]=235;}
 D.dirty=true;L.decalFlush();L.stats.decals++;return slot;};
L.decalFade=function(now){var D=L.dc,ch=false;D.slots.forEach(function(s){if(!s.kind)return;var age=now-s.born,a=age>s.life?0:Math.round(235*Math.min(1,(s.life-age)/2));for(var j=0;j<4;j++){var ci=s.i*16+j*4;if(D.C[ci+3]!==a){D.C[ci+3]=a;ch=true;}}if(a===0)s.kind=null;});if(ch){D.dirty=true;L.decalFlush();}};
L.decalFlush=function(){var D=L.dc;if(!D.dirty)return;D.mesh.setPositions(D.P);D.mesh.setNormals(D.Nn);D.mesh.setUvs(0,D.U);D.mesh.setColors32(D.C);D.mesh.update(pc.PRIMITIVE_TRIANGLES,false);D.dirty=false;};
/* flashbang: the veil stays the full-screen flash; while it is over 0.5 a temporary fringing + bloom bump, then the FP preset again */
L.flashBump=function(v){if(!L.on||!L.cf)return;var on=v>0.5;if(on===!!L._flash)return;L._flash=on;var P=L.PRESET[L.mode];if(on){L.cf.fringing.intensity=40;L.cf.bloom.intensity=0.03;}else{L.applyMode();return;}L.cfUpdate();};

/* ---------- dev readout (Â§6): FPS, draw calls, active clustered lights, FX slots, tier ---------- */
L.devInit=function(){var self=L;L.devOn=qs('dev')==='1';window.addEventListener('keydown',function(e){if(e.code==='F9'){e.preventDefault();if(e.shiftKey)L.cycleDebug();else{L.devOn=!L.devOn;if(L.devEl)L.devEl.style.display=L.devOn?'block':'none';}}
  else if(e.code==='F10'){e.preventDefault();var k=['low','med','high'],i=(k.indexOf(L.tier)+1)%3;L.setTier(k[i]);}},true);
 var d=L.devEl=document.createElement('div');d.id='tl-dev';d.style.cssText='position:fixed;left:8px;top:8px;z-index:30;font:11px/1.35 ui-monospace,monospace;color:#c9b896;background:rgba(12,16,20,.82);border:1px solid #6a5a45;padding:4px 7px;pointer-events:none;white-space:pre;display:'+(L.devOn?'block':'none');document.body.appendChild(d);L.devAcc=0;L.devN=0;};
L.devTick=function(dt){if(!L.devOn||!L.devEl)return;L.devAcc+=dt;L.devN++;if(L.devAcc<0.5)return;var fps=L.devN/L.devAcc;L.devAcc=0;L.devN=0;var st=L.app.stats,dc=st&&st.drawCalls?st.drawCalls.total:0,X=g.DreadingExplosionFX;
 var fx=X&&X.pool?X.pool.filter(function(x){return x.alive;}).length+'/'+X.pool.length:'-',sm=X&&X.smokes?X.smokes.filter(function(x){return x.alive;}).length:'-',dcs=L.dc?L.dc.slots.filter(function(s){return s.kind;}).length:0;
 var txt='FPS '+fps.toFixed(0)+'  DC '+dc+'  tier '+L.tier.toUpperCase()+' ('+L.mode+')\nlights '+L.stats.lightsActive+'/'+L.TIERS[L.tier].lights+'  muzzle '+L.mz.filter(function(s){return s.t>0;}).length+'  decals '+dcs+'\nexpl '+fx+'  smoke '+sm+'  lit circuits '+Object.keys(L.circuits).filter(function(k){return L.circuits[k].on;}).length+'/'+L.stats.circuits;
 if(txt!==L.devTxt){L.devTxt=txt;L.devEl.textContent=txt;}};
})(typeof globalThis!=='undefined'?globalThis:window);
/* blood: decal on the wall / floor behind the hit (one ray, only on a hit), else on the ground under it */
(function(g){var L=g.DreadingLook;L.blood=function(p,dir){var T=L.T,C=g.TacticalCommon;if(!L.on||!T||!C||!C.rayWorld||!T.perception)return;var bl=T.perception.blockers;
 var dl=Math.hypot(dir[0],dir[1],dir[2])||1,d=[dir[0]/dl,dir[1]/dl,dir[2]/dl],w=C.rayWorld(p,d,2.5,bl);
 if(w&&w.n){L.decal('blood',[p[0]+d[0]*w.t,p[1]+d[1]*w.t,p[2]+d[2]*w.t],w.n);return;}
 var dn=C.rayWorld(p,[0,-1,0],2.2,bl);if(dn)L.decal('blood',[p[0]+d[0]*0.4,p[1]-dn.t,p[2]+d[2]*0.4],dn.n||[0,1,0]);};})(typeof globalThis!=='undefined'?globalThis:window);
