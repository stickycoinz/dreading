/* Opt-in furnished Carentan trial. Default map is unchanged. */
(function (G) {
'use strict';
// Stair flights come from the navigation surfaces. Window vaults are emitted only when a room
// actually carries a windows list; the furnished export has none, and the wall boxes are solid.
function stairRecords(surfaces){
 const stairs=[];
 for(const s of surfaces||[]){
  if(s.role!=='stairs'||!s.positions||s.positions.length<9)continue;
  const v=s.positions; let minY=Infinity,maxY=-Infinity;
  for(let i=1;i<v.length;i+=3){if(v[i]<minY)minY=v[i]; if(v[i]>maxY)maxY=v[i];}
  if(maxY-minY<1.2)continue;
  const low=[0,0],high=[0,0]; let ln=0,hn=0;
  for(let i=0;i<v.length;i+=3){
   if(v[i+1]-minY<0.35){low[0]+=v[i]; low[1]+=v[i+2]; ln++;}
   if(maxY-v[i+1]<0.35){high[0]+=v[i]; high[1]+=v[i+2]; hn++;}
  }
  if(ln&&hn)stairs.push({bottom:[low[0]/ln,minY,low[1]/ln],top:[high[0]/hn,maxY,high[1]/hn]});
 }
 return stairs;
}
function windowPortals(rooms){
 const portals=[];
 for(const r of rooms||[])for(const w of r.windows||[])portals.push({kind:'window',rooms:[r.id,w.to||('B_out')],center:w.center,normal:w.normal,width:w.width||1.2,height:w.height||1.2,isOpen:w.isOpen!==false,openFraction:1,exterior:!w.to,source:'imported-window'});
 return portals;
}
G.DreadingImportedLinks={stairRecords,windowPortals};
if (typeof location==='undefined'||new URLSearchParams(location.search).get('assetMap')!=='1') return;
if(typeof document!=='undefined')document.title='DREADING — Furnished Carentan test';
const DM=G.DreadingMap, originalGenerate=DM.generate;
const I=G.DreadingImportedMap={state:'waiting',error:null,stageMap:{intact:0,breached:2,collapsed:3}};
const autumnTest=new URLSearchParams(location.search).get('mapVariant')==='autumn';
const base=autumnTest?'maps/carentan-autumn/':'maps/carentan-streamed/';
I.profile=autumnTest?'autumn':'furnished';
I.describeShells=function(meta,b){
 if(b.state==='collapsed')return [];
 return meta.buildings.find(raw=>raw.id===b.id).sections.map(section=>{
  const rooms=section.rooms,points=rooms.flatMap(r=>r.corners),xs=points.map(p=>p[0]),zs=points.map(p=>p[2]);
  const min=[Math.min(...xs),Math.min(...zs)],max=[Math.max(...xs),Math.max(...zs)],levels=[...new Set(rooms.map(r=>r.centroid[1]))].sort((a,b)=>a-b);
  const doors=rooms.filter(r=>r.floor===0).flatMap(r=>r.doors).filter(d=>d.exterior).map(d=>({center:[d.bottom[0],d.bottom[2]],normal:[d.normal[0],d.normal[2]],h:d.height}));
  return {id:section.id,min,max,w:max[0]-min[0],d:max[1]-min[1],storeys:levels.length,H:levels[1]==null?3.9:levels[1]-levels[0],upperY:levels[1]??null,doors};
 });
};
// Imported floors use world-space triangles; retain their real holes and slopes.
I.surfaceSupports=function(surface,p){
 const v=surface.positions,ix=surface.indices;
 for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
  const ax=v[a],az=v[a+2],bx=v[b],bz=v[b+2],cx=v[c],cz=v[c+2];
  if(p[0]<Math.min(ax,bx,cx)-.001||p[0]>Math.max(ax,bx,cx)+.001||p[2]<Math.min(az,bz,cz)-.001||p[2]>Math.max(az,bz,cz)+.001)continue;
  const den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-8)continue;
  const u=((bz-cz)*(p[0]-cx)+(cx-bx)*(p[2]-cz))/den,w=((cz-az)*(p[0]-cx)+(ax-cx)*(p[2]-cz))/den,t=1-u-w;
  if(u<-.001||w<-.001||t<-.001)continue;const y=u*v[a+1]+w*v[b+1]+t*v[c+1];
  if(Math.abs(p[1]-y)<.65)return true;
 }return false;
};
// Preload before an approach reaches a doorway/window. A wider exit radius avoids thrashing.
I.roomsWanted=function(b,roof,cam,cut,selection){
 const dx=Math.max(b.rect[0]-cam.x,0,cam.x-b.rect[2]),dz=Math.max(b.rect[1]-cam.z,0,cam.z-b.rect[3]);
 const nearby=Math.hypot(dx,dz)<(b.roomRoot?32:24)&&cam.y<roof+3;
 const exposed=cut&&cut.rect[0]<b.rect[2]&&cut.rect[2]>b.rect[0]&&cut.rect[1]<b.rect[3]&&cut.rect[3]>b.rect[1];
 return !!(nearby||exposed||(selection||[]).some(s=>{if(!s.alive)return false;const q=s.pos();return q[0]>b.rect[0]&&q[0]<b.rect[2]&&q[2]>b.rect[1]&&q[2]<b.rect[3];}));
};
let meta,asset,entities,model,physics,byBuilding,interiors=[],app,installed=false,manifest;
const chunks=new Map(),images=new Map(),navData=new Map(),shellGroups=new Map(),sharedMaterials=new Map();let roomJobs=0;
/* collapse-hitch fix (opt clone): a material first seen after load (collapse rubble, streamed rooms) compiled its shader synchronously on
   first draw (measured 180-530 ms render frames). Such materials compile in the background (KHR_parallel_shader_compile): the draw is
   skipped until the program links, and prewarm() below starts those compiles when a building first takes damage, so its next stage is ready. */
function asyncShaders(m){if(m.dreadingAsync)return;m.dreadingAsync=true;const g=m.getShaderVariant;m.getShaderVariant=function(){const s=g.apply(this,arguments);if(s&&!s.ready)s.dreadingAsync=true;return s;};}
I.asyncShaders=m=>m&&asyncShaders(m);
function installAsyncShaders(){const d=app.graphicsDevice,set=d.setShader;if(d.dreadingAsync||!d.gl||!d.extParallelShaderCompile||typeof set!=='function')return;d.dreadingAsync=true;
 d.setShader=function(s,async){if(s&&s.dreadingAsync&&!s.ready){this.shader=s;this.shaderAsyncCompile=true;this.shaderValid=undefined;return;}return set.call(this,s,async);};}
const warmQueue=[];let warmBusy=false;
function prewarm(b){if(b.prewarmed||b.state==='collapsed')return;b.prewarmed=true;const now=I.stageMap[b.state]??0,parts=manifest.buildings[b.id]||[];
 [...new Set(['breached','collapsed'].map(s=>I.stageMap[s]).filter(i=>i>now&&parts[i]).map(i=>parts[i].shell))].forEach(file=>warmQueue.push([b,file]));warmNext();}
function warmNext(){if(warmBusy||!warmQueue.length)return;warmBusy=true;const [b,file]=warmQueue.shift();warmFile(b,file).catch(e=>console.warn('[prewarm] '+file,e)).then(()=>{warmBusy=false;warmNext();});}
async function warmFile(b,file){
 const had=chunks.has(file),revision=b.importRevision,a=await loadChunk(file);if(!a.resource)return;
 const e=a.resource.instantiateRenderEntity();e.name='Imported prewarm '+b.id;shareMaterials(e);
 const X=TacticalCommon.ns(app).xray;if(X&&X.cutOn&&X.patchMat)e.findComponents('render').forEach(r=>r.meshInstances.forEach(mi=>X.patchMat(mi.material)));
 // zero scale + no culling: every variant the real stage needs is requested, yet nothing can rasterise
 e.setLocalScale(0,0,0);e.findComponents('render').forEach(r=>{r.castShadows=false;r.receiveShadows=true;r.meshInstances.forEach(mi=>mi.cull=false);});app.root.addChild(e);
 await new Promise(done=>{let n=0;const poll=()=>{let ok=++n>2;if(ok)e.findComponents('render').forEach(r=>r.meshInstances.forEach(mi=>{if(!mi._shaderCache||!mi._shaderCache.size)ok=false;else mi._shaderCache.forEach(si=>{if(si.shader&&!si.shader.ready&&!si.shader.failed)ok=false;});}));if(ok||n>240){app.off('postrender',poll);done();}};app.on('postrender',poll);});
 e.destroy();
 // Keep the chunk only if this building is about to use it; never pull it from under an in-flight build.
 if(!had&&b.shellFile!==file&&!b.buildPending&&b.importRevision===revision&&!b.importedDamage?.collapsing)releaseChunk(file);
}
function shareMaterials(root){root.findComponents('render').forEach(r=>r.meshInstances.forEach(mi=>{const key=mi.material.name;if(!sharedMaterials.has(key)){const material=mi.material.clone();material.name=key;if(I.state==='ready')asyncShaders(material);sharedMaterials.set(key,material);}mi.material=sharedMaterials.get(key);}));}
/* texture dedupe (opt clone): one GPU texture per image URI + colour space across all map GLBs. Images were already shared through
   'images', but the engine clones a texture whenever one GLB has two glTF textures on the same image (~7.5k clones over the autumn set,
   ~11 GB). Those clones are mapped back to the shared texture before any material is instanced, then freed. Shared textures are
   ref-counted per chunk; at zero refs they stay resident (bounded by the unique image set) because name-shared materials and damage
   visuals may still point at them, so an unloading building never destroys a texture in use. */
const texByUrl=new Map(),texRefs=new Map(),chunkTex=new Map();I.texStats={unique:0,clonesFreed:0,remapped:0,refs:texRefs};
function texKey(t){return t&&t.file&&t.file.url?t.file.url+'|'+!!(t.data&&t.data.srgb):null;}
function dedupeChunk(file,a){const r=a.resource;if(!r||!r.textures)return;const keep=[],used=new Set(),swap=new Map(),dead=[];
 r.textures.forEach(t=>{const k=texKey(t),canon=k&&texByUrl.get(k);if(k)used.add(k);
  if(canon&&canon!==t&&t.resource&&canon.resource&&t.resource!==canon.resource){swap.set(t.resource,canon.resource);dead.push(t);}else keep.push(t);});
 if(swap.size)(r.materials||[]).forEach(m=>{const mat=m&&m.resource||m;if(!mat)return;let ch=false;
  for(const p of Object.keys(mat)){const v=mat[p];if(v&&swap.has(v)){const q=p[0]==='_'&&p.slice(1) in mat?p.slice(1):p;mat[q]=swap.get(v);ch=true;I.texStats.remapped++;}}if(ch&&mat.update)mat.update();});
 dead.forEach(t=>{app.assets.remove(t);t.resource.destroy();t.resource=null;I.texStats.clonesFreed++;});
 r.textures=keep;chunkTex.set(file,used);used.forEach(k=>texRefs.set(k,(texRefs.get(k)||0)+1));}
function loadChunk(file){
 if(chunks.has(file))return chunks.get(file);
 const promise=new Promise((resolve,reject)=>{
  const options={image:{processAsync:(image,done)=>{const key=base+image.uri+'|'+!!image.extras?.srgb;if(!images.has(key))images.set(key,new Promise((yes,no)=>{const a=new pc.Asset(image.name,'texture',{url:base+image.uri},{srgb:!!image.extras?.srgb});a.once('load',()=>{texByUrl.set(texKey(a),a);I.texStats.unique=texByUrl.size;yes(a);});a.once('error',no);app.assets.add(a);app.assets.load(a);}));images.get(key).then(a=>done(null,a),done);}}};
  const a=new pc.Asset('Imported '+file,'container',{url:base+file},null,options);a.once('load',()=>{try{dedupeChunk(file,a);}catch(e){console.warn('[texture dedupe] '+file,e);}resolve(a);});a.once('error',reject);app.assets.add(a);app.assets.load(a);
 });chunks.set(file,promise);return promise;
}
async function loadNav(file){if(!navData.has(file))navData.set(file,fetch(base+file).then(r=>{if(!r.ok)throw Error('Navigation HTTP '+r.status);return r.json();}));return navData.get(file);}
function releaseChunk(file){const p=chunks.get(file);if(!p)return;chunks.delete(file);const u=chunkTex.get(file);if(u){u.forEach(k=>texRefs.set(k,(texRefs.get(k)||1)-1));chunkTex.delete(file);}p.then(a=>{if(a.resource)a.resource.textures=[];a.unload();app.assets.remove(a);});}
function releaseRooms(b){if(b.roomRoot){b.roomRoot.destroy();b.roomRoot=null;}if(b.importedRoomBatch!=null){app.batcher.removeGroup(b.importedRoomBatch);b.importedRoomBatch=null;}if(b.roomFile){releaseChunk(b.roomFile);b.roomFile=null;}}
async function requestRooms(b){
 if(b.roomRoot||b.roomLoading||roomJobs>=2)return;const stage=I.stageMap[b.state],file=manifest.buildings[b.id][stage].rooms,revision=b.importRevision;b.roomLoading=true;roomJobs++;
 try{const a=await loadChunk(file);if(b.importRevision!==revision||!b.roomWanted){releaseChunk(file);return;}const root=a.resource.instantiateRenderEntity();root.name='Imported rooms '+b.id;b.entity.addChild(root);b.roomRoot=root;b.roomFile=file;
  if(G.DreadingNight)G.DreadingNight.invalidate();shareMaterials(root);if(G.DreadingImportedDamage)G.DreadingImportedDamage.applyVisuals(b,root);const group=app.batcher.addGroup('Streamed rooms '+b.id,false,32);b.importedRoomBatch=group.id;root.findComponents('render').forEach(r=>{r.castShadows=true;r.receiveShadows=true;r.batchGroupId=group.id;});app.batcher.markGroupDirty(group.id);
 }catch(e){I.roomError=String(e);console.error(e);}finally{b.roomLoading=false;roomJobs--;}
}
function walk(e,fn){fn(e);e.children.slice().forEach(c=>walk(c,fn));}
function proxy(p,parent,bid){
 if(p.nav===false)return;
 const e=new pc.Entity(p.name);parent.addChild(e);e.setPosition(...p.position);e.setRotation(...p.rotation);e.setLocalScale(...p.size);
 e.tags.add('tactical:'+p.kind);e.townGroup=bid;e.coverSpacing=1.4;e.importedCollision=true;e.importedCollisionSource=p.source;return e;
}
function makeGraph(b){
 const raw=byBuilding[b.id],outside={id:'B'+b.id+'_Outside',floor:0,isOutdoor:true,bounds:{min:[b.rect[0]-30,-2,b.rect[1]-30],max:[b.rect[2]+30,40,b.rect[3]+30]},volume:100000,surfaceArea:10000,materials:{walls:'open_air',floor:'concrete',ceiling:'open_air'},roomType:'outdoor',furnishing:0,hearing:{ambientNoiseDb:35,investigatePoints:[]},wallNeighbors:[],enclosure:0,rt60:0};
 const src=raw.sections.flatMap(s=>s.rooms),rooms=src.map(r=>{
  const min=[Math.min(...r.corners.map(c=>c[0])),r.centroid[1],Math.min(...r.corners.map(c=>c[2]))],max=[Math.max(...r.corners.map(c=>c[0])),r.centroid[1]+r.height,Math.max(...r.corners.map(c=>c[2]))];
  const w=Math.hypot(r.corners[1][0]-r.corners[0][0],r.corners[1][2]-r.corners[0][2]),d=Math.hypot(r.corners[2][0]-r.corners[1][0],r.corners[2][2]-r.corners[1][2]);
  return {id:r.id,floor:r.floor,isOutdoor:false,bounds:{min,max},polygon:r.corners.map(c=>[c[0],c[2]]),centroid:[r.centroid[0],r.centroid[1]+r.height/2,r.centroid[2]],volume:w*d*r.height,surfaceArea:2*w*d+2*(w+d)*r.height,ceilingHeight:r.height,materials:{walls:'plaster',floor:'concrete',ceiling:'plaster'},furnishing:.5,roomType:r.circulation?'corridor':'medium_room',wallNeighbors:[],hearing:{ambientNoiseDb:20,investigatePoints:[r.centroid.slice()]},enclosure:.8,rt60:.8};
 });
 const portals=[],seen=new Set();
 src.forEach(r=>r.doors.forEach(d=>{
  const other=src.find(s=>s.id!==r.id&&s.floor===r.floor&&s.doors.some(q=>Math.hypot(...q.center.map((v,k)=>v-d.center[k]))<.6));
  if(!other&&!d.exterior)return;
  const to=other?other.id:outside.id,key=[r.id,to].sort().join('|')+'|'+d.center.map(v=>v.toFixed(1)).join(',');if(seen.has(key))return;seen.add(key);
  portals.push({id:'B'+b.id+'_IP'+portals.length,kind:'door',rooms:[r.id,to],center:d.center,normal:d.normal,width:d.width,height:d.height,isOpen:true,openFraction:1,panelMaterial:null,breakable:false,lockable:false,exterior:!other});
 }));
 const stairs=G.DreadingImportedLinks.stairRecords(b.navSurfaces||[]);
 windowPortals(src).forEach(w=>portals.push(Object.assign({id:'B'+b.id+'_IP'+portals.length},w)));
 return {version:1,units:'meters',id:'B'+b.id,buildingId:'B'+b.id,name:b.name||b.type,type:b.type,landmark:!!b.landmark,floorHeight:3.9,materials:Object.fromEntries(['plaster','concrete','open_air'].map(k=>[k,DM.MATERIALS[k]])),rooms:[...rooms,outside],portals,stairs,state:b.state};
}
async function load(a){
 app=a;I.state='loading';
 const response=await fetch(base+'map.json');if(!response.ok)throw Error('Map metadata HTTP '+response.status);meta=await response.json();
 const mr=await fetch(base+'manifest.json');if(!mr.ok)throw Error('Map manifest HTTP '+mr.status);manifest=await mr.json();asset=await loadChunk(manifest.base);
 byBuilding=Object.fromEntries(meta.buildings.map(b=>{b.roofHeight=Math.max(...b.sections.flatMap(s=>s.rooms.map(r=>r.centroid[1]+r.height)));return [b.id,b];}));physics=new Map();
 meta.physics.forEach(p=>{const key=p.building_id==null?'static':p.building_id+'|'+p.stage;if(!physics.has(key))physics.set(key,[]);physics.get(key).push(p);});
 I.meta=meta;I.manifest=manifest;I.state='loading exteriors';
 let next=0,done=0;await Promise.all(Array.from({length:4},async()=>{while(next<meta.buildings.length){const b=meta.buildings[next++],part=manifest.buildings[b.id][0];await Promise.all([loadChunk(part.shell),loadNav(part.nav)]);I.exteriorsLoaded=++done;}}));I.state='loaded';
}
function install(tw){
 // Only this map profile uses these adapters; the procedural page keeps its original methods.
 if(!installed){installed=true;installAsyncShaders();
  if(G.DreadingImportedDamage)G.DreadingImportedDamage.install(app,DM,meta,proxy);
  // Authored 1.2m entrances disconnect on the old 0.15m grid. Preserve agent radius.
  const navigation=TacticalCommon.ns(tw.app).navigation;
  navigation.cellSize=Math.min(navigation.cellSize||.15,.075);
  const perception=TacticalCommon.ns(tw.app).perception,refresh=perception.refresh;
  perception.refresh=function(){refresh.apply(this,arguments);if(G.DreadingMapRayIndex)this.blockers=G.DreadingMapRayIndex(this.blockers);};
  const oldHeight=DM.heightmap;
  DM.heightmap=function(spec){const h=oldHeight(spec),v=meta.heightmap;if(h.n===v.n)for(let i=0;i<h.heights.length;i++)if(v.heights[i]!=null)h.heights[i]=v.heights[i];return h;};
  DM.buildTerrain=function(t,s,parent){
   model=asset.resource.instantiateRenderEntity();model.name='Furnished Carentan';parent.addChild(model);entities={};interiors=[];
   walk(model,e=>{entities[e.name]=e;});
   let tris=0,navTris=0;
   for(const [name,n] of Object.entries(meta.nodes)){
    const e=entities[name];if(!e)continue;
    if(n.lod)e.enabled=false;
    if(n.collision&&e.render)e.render.enabled=false;
    if(e.render&&!n.collision&&!n.lod){e.render.castShadows=true;e.render.receiveShadows=true;e.render.meshInstances.forEach(mi=>tris+=mi.mesh.primitive[0].count/3);}
    // Authored slabs/stairs carry the exact holes and step surfaces. Collider export contains walls/props only.
    if(!n.collision&&!n.lod&&(n.role==='floor'||n.role==='stairs')){e.tags.add('tactical:walkable');if(n.role==='stairs')e.tags.add('no-sight');e.townGroup=n.building_id;}
    if(n.role==='prop'&&!n.collision)interiors.push({e,bid:n.building_id,stage:n.stage});
   }
   meta.walkable_meshes.forEach(name=>{const e=entities[name];if(!e)throw Error('Missing navigation terrain '+name);e.enabled=true;e.tags.add('tactical:walkable','no-sight');if(e.render){e.render.enabled=false;e.render.meshInstances.forEach(mi=>navTris+=mi.mesh.primitive[0].count/3);}});
   (physics.get('static')||[]).forEach(p=>proxy(p,parent,null));
   if(G.DreadingMapInstances)I.instancing=G.DreadingMapInstances(app,model,meta);
   if(!autumnTest&&G.DreadingTerrainPbr){G.DreadingTerrainPbr.createMaterial(app).then(mat=>meta.terrain_nodes.forEach(name=>{const e=entities[name];if(e&&e.render)e.render.meshInstances.forEach(mi=>mi.material=mat);})).catch(err=>{I.materialError=String(err);console.error(err);});}
   return {visualTris:tris,navTris};
  };
  DM.buildSite=()=>({tagEntities:(physics.get('static')||[]).length,drawCalls:0});
  DM.roomGraph=makeGraph;
  DM.renderLoot=()=>{};
  DM.lootSpots=()=>meta.containers.map(c=>({id:c.container_id,building:Number(c.building_id),landmark:null,kind:c.container_type||'crate',pos:c.position_game,yaw:0,floor:c.storey,room:c.room_id}));
  const oldPoints=DM.churchPoints;
  DM.churchPoints=function(b){if(b.state==='collapsed')return oldPoints(b);const rooms=byBuilding[b.id].sections.flatMap(s=>s.rooms),ground=rooms.filter(r=>r.floor===0),safe=ground.filter(r=>r.circulation),pool=safe.length?safe:ground,result={};
   ['objective','room1','room2','overwatch1','overwatch2','stairApproach1','stairApproach2','ECHO','FOXTROT','GOLF','HOTEL'].forEach((key,i)=>{const r=pool[i%pool.length],p=r.centroid.slice(),u=r.corners[1].map((v,k)=>v-r.corners[0][k]),v=r.corners[3].map((v,k)=>v-r.corners[0][k]),col=(i%2?1:-1)*.18,row=((i%5)-2)*.14;result[key]=p.map((x,k)=>x+u[k]*col+v[k]*row);result[key][1]+=.08;});return result;};
  DM.onState=function(t,b,state){if(b.graph){b.graph.state=state;b.graph.portals.forEach(p=>{p.isOpen=true;p.openFraction=1;});}if(t.roomGraph)t.roomGraph.portalStateVersion++;if(b.id===t.objectiveRef)DM.placeMarkers(t);return [];};
  let elapsed=0;app.on('update',dt=>{elapsed+=dt;if(elapsed<.25||!G.tactical)return;elapsed=0;const T=G.tactical.T,cam=T.camera.getPosition(),visible=new Set();
   T.town.buildings.forEach(b=>{const s=b.importedDamage;if(!b.prewarmed&&s&&s.broken&&Object.keys(s.broken).length)prewarm(b);});
   const distance=b=>Math.hypot(Math.max(b.rect[0]-cam.x,0,cam.x-b.rect[2]),Math.max(b.rect[1]-cam.z,0,cam.z-b.rect[3]));
   T.town.buildings.slice().sort((a,b)=>distance(a)-distance(b)).forEach(b=>{const roomNeeded=I.roomsWanted(b,byBuilding[b.id].roofHeight,cam,T.xray&&T.xray.floorCut,T.selection);
    b.roomWanted=!!roomNeeded;if(roomNeeded){visible.add(b.id);b.roomLastNeeded=performance.now();requestRooms(b);}else if(b.roomRoot&&performance.now()-(b.roomLastNeeded||0)>5000)releaseRooms(b);
    if(b.importedRoomBatch!=null)app.batcher.getBatches(b.importedRoomBatch).forEach(batch=>{batch.meshInstance.visible=!!b.roomRoot;batch.meshInstance.castShadow=!!b.roomRoot;});
   });
   I.roomsLoaded=T.town.buildings.filter(b=>b.roomRoot).length;I.roomJobs=roomJobs;I.textureAssets=images.size;
   if(G.DreadingMapAnimationBudget)(T.zombies||[]).forEach(G.DreadingMapAnimationBudget);
  });
 }
 tw.build=async function(b,state){
  b.buildPending=(b.buildPending||0)+1;const stage=I.stageMap[state],part=manifest.buildings[b.id][stage],[a,surfaces]=await Promise.all([loadChunk(part.shell),loadNav(part.nav)]);
  if(!b.entity){b.entity=new pc.Entity('Imported building '+b.id);this.root.addChild(b.entity);}
  b.importRevision=(b.importRevision||0)+1;releaseRooms(b);
  const replacing=!!b.importedVisual;
  if(b.importedOwnBatch)app.batcher.removeGroup(b.importedBatch);
  else if(replacing&&G.DreadingImportedDamage)G.DreadingImportedDamage.detachVisuals(b.importedVisual);
  else if(b.importedBatch!=null)app.batcher.markGroupDirty(b.importedBatch);
  if(b.importedVisual)b.importedVisual.destroy();
  if(b.shellFile&&b.shellFile!==part.shell)releaseChunk(b.shellFile);b.shellFile=part.shell;
  b.entity.children.slice().filter(e=>e.importedCollision||e.importedNav).forEach(e=>e.destroy());
  b.state=state;b.pnl=null;b.importedVisual=a.resource.instantiateRenderEntity();shareMaterials(b.importedVisual);b.entity.addChild(b.importedVisual);
  const cell=Math.floor(b.x/64)+','+Math.floor(b.z/64);if(!shellGroups.has(cell))shellGroups.set(cell,app.batcher.addGroup('Imported exterior chunk '+cell,false,64));const group=replacing?app.batcher.addGroup('Imported replacement '+b.id,false,32):shellGroups.get(cell);b.importedOwnBatch=replacing;b.importedBatch=group.id;
  if(G.DreadingNight)G.DreadingNight.invalidate();b.importedVisual.findComponents('render').forEach(r=>{r.castShadows=true;r.receiveShadows=true;r.batchGroupId=group.id;});
  if(!I.navMaterial){I.navMaterial=new pc.StandardMaterial();I.navMaterial.name='Navigation only';}
  b.navSurfaces=surfaces;
  surfaces.forEach(surface=>{const mesh=new pc.Mesh(app.graphicsDevice);mesh.setPositions(surface.positions);mesh.setIndices(surface.indices);mesh.update();const e=new pc.Entity(surface.name+' NAV');e.importedNav=true;e.importedSupports=p=>I.surfaceSupports(surface,p);e.townGroup=b.id;e.tags.add('tactical:walkable');if(surface.role==='stairs')e.tags.add('no-sight');e.addComponent('render',{type:'asset',enabled:false,castShadows:false});e.render.meshInstances=[new pc.MeshInstance(mesh,I.navMaterial,e)];e.on('destroy',()=>mesh.destroy());b.entity.addChild(e);});
  if(b.graph)b.graph.stairs=G.DreadingImportedLinks.stairRecords(surfaces);
  app.batcher.markGroupDirty(b.importedBatch);
  const boxes=physics.get(b.id+'|'+stage)||[];boxes.forEach(p=>proxy(p,b.entity,b.id));
  if(G.DreadingImportedDamage)G.DreadingImportedDamage.reset(b,boxes);
  b.shells=I.describeShells(meta,b);b.stats={tagEntities:boxes.filter(p=>p.nav!==false).length,pieces:boxes.length,drawCalls:0,triangles:0,ms:0};b.buildPending--;return b;
 };
 tw.pieces=b=>({pieces:[],shells:I.describeShells(meta,b)});
}
DM.generate=async function(tw,opts,rebuild){
 try{await tw.busy('Loading furnished Carentan test…');if(!asset)await load(tw.app);(tw.buildings||[]).forEach(b=>{b.importRevision=(b.importRevision||0)+1;b.roomWanted=false;releaseRooms(b);if(b.importedOwnBatch)app.batcher.removeGroup(b.importedBatch);});shellGroups.forEach(g=>tw.app.batcher.removeGroup(g.id));shellGroups.clear();install(tw);const result=await originalGenerate(tw,opts,rebuild);I.state='ready';sharedMaterials.forEach(asyncShaders);result.map='Carentan furnished test';I.loadedBuildings=tw.buildings.length;await tw.busy(null);return result;}
 catch(error){I.state='error';I.error=String(error.stack||error);await tw.busy('Furnished map failed to load — '+error.message);console.error(error);throw error;}
};
})(globalThis);
