/* Imported wall damage: clip the authored mesh and its matching collision together.
   Source meshes/materials remain untouched; only buildings actually hit allocate damage data. */
(function(G){'use strict';
const D=G.DreadingImportedDamage={};
// Subtract a convex box from one triangle. Interpolate every authored vertex attribute.
D.subtract=function(triangle,planes,worldOffset){
 // Reject disjoint polygons before clipping, so distant holes cannot fragment a wall.
 if(planes.some(p=>triangle.every(v=>p[0]*v[worldOffset]+p[1]*v[worldOffset+1]+p[2]*v[worldOffset+2]-p[3]>1e-7)))return [triangle];
 let inside=triangle,out=[];
 for(const plane of planes){
  if(!inside.length)break;
  const yes=[],no=[];
  for(let i=0;i<inside.length;i++){
   const a=inside[i],b=inside[(i+1)%inside.length],distance=v=>plane[0]*v[worldOffset]+plane[1]*v[worldOffset+1]+plane[2]*v[worldOffset+2]-plane[3];
   const da=distance(a),db=distance(b),ia=da<=1e-7,ib=db<=1e-7;
   (ia?yes:no).push(a);
   if(ia!==ib){const t=da/(da-db),v=a.map((x,j)=>x+(b[j]-x)*t);yes.push(v);no.push(v);}
  }
  if(no.length>=3)out.push(no);inside=yes;
 }
 return out;
};
D.install=function(app,DM,metadata,makeProxy){
 if(D.installed)return;D.installed=true;
 const dirty=new Set(),pendingBatchUploads=new Set();let navTimer=null;
 const vec=a=>new pc.Vec3(...a),local=(p,box)=>box.inv.transformVector(vec(p).sub(vec(box.position)));
 function panels(b){
  const state=b.importedDamage;if(!state||state.panels)return state;
  state.panels=[];state.groups=new Map();state.total={};state.broken={};
  state.boxes.forEach(box=>{
   if(box.nav===false||!['wall','partition'].includes(box.parent_role))return;
   const q=new pc.Quat(...box.rotation),inv=q.clone().invert(),axis=box.size[0]>=box.size[2]?0:2;
   const n=Math.max(1,Math.ceil(box.size[axis]/1.1)),m=Math.max(1,Math.ceil(box.size[1]/1.1));
   const source=box.source.replace(/_col$/,''),floor=Number((source.match(/floor_(\d+)/)||[])[1]||0);
   if(!state.groups.has(source))state.groups.set(source,{source,panels:[],holes:[],dirty:false,colliders:[]});
   const group=state.groups.get(source);
   for(let y=0;y<m;y++)for(let x=0;x<n;x++){
    const offset=[0,0,0],size=box.size.slice();size[axis]/=n;size[1]/=m;
    offset[axis]=-box.size[axis]/2+(x+.5)*size[axis];offset[1]=-box.size[1]/2+(y+.5)*size[1];
    const c=q.transformVector(vec(offset)).add(vec(box.position));
    const material=box.parent_role==='partition'?'plaster':(/stone|church/i.test(b.type)?'stone':'brick');
    const hp=(DM.PNL.HP[material]||150)*(box.parent_role==='partition'?.6:1);
    const panel={id:'IP_'+b.id+'_'+state.panels.length,position:[c.x,c.y,c.z],size,rotation:box.rotation,inv,axis,hp,maxHp:hp,broken:false,group,kind:box.kind,source:box.source,ext:box.parent_role==='wall',floor,area:size[axis]*size[1]};
    state.panels.push(panel);group.panels.push(panel);
    if(panel.ext)state.total[floor]=(state.total[floor]||0)+panel.area;
   }
  });return state;
 }
 function planeBox(panel){
  const q=new pc.Quat(...panel.rotation),c=vec(panel.position),planes=[];
  for(let axis=0;axis<3;axis++){const unit=[0,0,0];unit[axis]=1;const v=q.transformVector(vec(unit)),h=panel.size[axis]/2+(axis===panel.axis||axis===1?.002:.04);
   planes.push([v.x,v.y,v.z,v.dot(c)+h],[-v.x,-v.y,-v.z,-v.dot(c)+h]);
  }return planes;
 }
 function readMesh(mi){
  const streams=mi.mesh.vertexBuffer.format.elements.map(e=>{const data=[];mi.mesh.getVertexStream(e.name,data);return {semantic:e.name,count:e.numComponents,type:e.dataType,normalize:e.normalize,data};});
  const indices=[];mi.mesh.getIndices(indices);const position=streams.find(s=>s.semantic===pc.SEMANTIC_POSITION);
  if(!indices.length)for(let i=0;i<position.data.length/3;i++)indices.push(i);
  let stride=0;streams.forEach(s=>{s.offset=stride;stride+=s.count;});
  const vertices=[],transform=mi.node.getWorldTransform(),v=new pc.Vec3();
  for(let i=0;i<position.data.length/3;i++){const a=[];for(const s of streams)for(let k=0;k<s.count;k++)a.push(s.data[i*s.count+k]);v.set(...position.data.slice(i*3,i*3+3));transform.transformPoint(v,v);a.push(v.x,v.y,v.z);vertices.push(a);}
  return {streams,indices,vertices,stride};
 }
 function clipMesh(mi,holes){
  if(!mi.importedDamageOriginal){mi.importedDamageOriginal=readMesh(mi);mi.node.once('destroy',()=>{if(mi.importedDamageMesh)mi.importedDamageMesh.destroy();});}
  const data=mi.importedDamageOriginal,output=data.streams.map(()=>[]),idx=[];
  for(let i=0;i<data.indices.length;i+=3){let polygons=[[data.vertices[data.indices[i]],data.vertices[data.indices[i+1]],data.vertices[data.indices[i+2]]]];
   for(const hole of holes){polygons=polygons.flatMap(poly=>D.subtract(poly,hole,data.stride));if(!polygons.length)break;}
   for(const poly of polygons)for(let k=1;k<poly.length-1;k++)for(const v of [poly[0],poly[k],poly[k+1]]){idx.push(idx.length);data.streams.forEach((s,j)=>{for(let c=0;c<s.count;c++)output[j].push(v[s.offset+c]);});}
  }
  // PlayCanvas cannot upload a zero-length vertex buffer. Fully removed primitives
  // become one zero-area triangle, as in the original panel damage implementation.
  mi.importedDamageEmpty=idx.length===0;
  if(!idx.length){for(let k=0;k<3;k++){idx.push(k);data.streams.forEach((s,j)=>{for(let c=0;c<s.count;c++)output[j].push(data.vertices[0][s.offset+c]);});}}
  const mesh=new pc.Mesh(app.graphicsDevice);data.streams.forEach((s,i)=>mesh.setVertexStream(s.semantic,output[i],s.count,undefined,s.type,s.normalize));mesh.setIndices(idx);mesh.update();
  const old=mi.importedDamageMesh;mi.mesh=mesh;mi.importedDamageMesh=mesh;if(old)old.destroy();
 }
 // Remove only this render component's triangles from existing static batches.
 // The damaged component then renders independently, avoiding a whole-cell rebake.
 // Guard engine-specific bookkeeping; unsupported layouts retain the normal rebuild.
 function detachRender(r){
  const id=r.batchGroupId;if(id<0)return;
  const bm=app.batcher,batches=bm.getBatches(id),updates=[];
  if(!Array.isArray(bm._dirtyGroups)){r.batchGroupId=-1;return;}
  for(const batch of batches){
   if(!batch.origMeshInstances.some(mi=>r.meshInstances.includes(mi)))continue;
   if(!batch.importedDamageRanges){
    const indices=[];batch.meshInstance.mesh.getIndices(indices);const ranges=new Map();let offset=0;
    for(const mi of batch.origMeshInstances){const count=mi.mesh.primitive[0].count;ranges.set(mi,{offset,count});offset+=count;}
    if(offset!==indices.length){r.batchGroupId=-1;return;}
    batch.importedDamageRanges=ranges;batch.importedDamageIndices=indices;
   }
   updates.push(batch);
  }
  for(const batch of updates){const indices=batch.importedDamageIndices;
   for(const mi of r.meshInstances){const range=batch.importedDamageRanges.get(mi);if(range){indices.fill(indices[range.offset],range.offset,range.offset+range.count);batch.importedDamageRanges.delete(mi);}}
   batch.origMeshInstances=batch.origMeshInstances.filter(mi=>!r.meshInstances.includes(mi));
   pendingBatchUploads.add(batch);
  }
  const alreadyDirty=bm._dirtyGroups.includes(id);r.batchGroupId=-1;
  // The setter queues a rebake, but the exact removed ranges were patched above.
  // Never cancel a rebuild requested independently by a state/streaming change.
  if(!alreadyDirty&&updates.length){const i=bm._dirtyGroups.indexOf(id);if(i>=0)bm._dirtyGroups.splice(i,1);}
 }
 D.commitBatchUpdates=function(){for(const batch of pendingBatchUploads){const mesh=batch.meshInstance?.mesh;if(mesh){mesh.setIndices(batch.importedDamageIndices);mesh.update(pc.PRIMITIVE_TRIANGLES,false);}}pendingBatchUploads.clear();};
 D.detachVisuals=function(root){if(root)root.findComponents('render').forEach(detachRender);D.commitBatchUpdates();};
 D.refreshCollision=function(b){
  const C=TacticalCommon,P=C.ns(app).perception,name='town building '+b.id;
  const old=P.blockers.findIndex(s=>s.name===name),count=s=>s.children?s.children.reduce((n,c)=>n+count(c),0):1;
  const previous=old<0?0:count(P.blockers[old]);
  const leaves=C.collect({root:b.entity}).filter(t=>t.blocksSight&&!['door','defensiveArea','threat','stair','spawn'].includes(t.kind)).map(t=>{const s=C.shape(t.entity);s.kind=t.kind;return s;});
  if(!leaves.length){if(old>=0)P.blockers.splice(old,1);P.blockerCount-=previous;return;}
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const s of leaves){const c=[s.center.x,s.center.y,s.center.z];for(let k=0;k<3;k++){const extent=s.axes.reduce((n,a,i)=>n+Math.abs([a.x,a.y,a.z][k])*s.half[i],0);min[k]=Math.min(min[k],c[k]-extent);max[k]=Math.max(max[k],c[k]+extent);}}
  let cluster={name,cluster:true,min,max,children:leaves};
  if(G.DreadingMapRayIndex)cluster=G.DreadingMapRayIndex([cluster])[0];
  if(old>=0)P.blockers[old]=cluster;else P.blockers.push(cluster);
  P.blockerCount+=leaves.length-previous;
 };
 D.applyVisuals=function(b,root,onlySource){
  const state=b.importedDamage;if(!state?.groups||!root)return;
  root.findComponents('render').forEach(r=>{const name=r.entity.name;for(const group of state.groups.values())if((!onlySource||group.source===onlySource)&&group.holes.length&&(name===group.source||name===group.source+'_trim')){if(r.meshInstances.some(mi=>mi.importedDamageHoleCount!==group.holes.length))detachRender(r);r.meshInstances.forEach(mi=>{if(mi.importedDamageHoleCount===group.holes.length)return;clipMesh(mi,group.holes);mi.importedDamageHoleCount=group.holes.length;});}});
 };
 function breakPanel(b,p){
  if(p.broken)return;p.broken=true;p.group.holes.push(planeBox(p));p.group.dirty=true;dirty.add(b);DM.PNL.stats.breaks++;
  if(p.ext){const s=b.importedDamage;s.broken[p.floor]=(s.broken[p.floor]||0)+p.area;}
 }
 function damage(b,p,amount){if(!p.broken&&Number.isFinite(amount)&&amount>0){p.hp-=amount;if(p.hp<=0)breakPanel(b,p);}}
 // Replica applies authoritative panel health through the existing visual/collision path.
 D.networkState=function(b){return (b.importedDamage?.panels||[]).filter(p=>p.hp<p.maxHp||p.broken).map(p=>[p.id,p.hp,p.broken]);};
 D.networkApply=function(b,rows){if(!b.importedDamage)return;const state=panels(b),byId=new Map(state.panels.map(p=>[p.id,p]));for(const row of rows){const p=byId.get(row[0]);if(!p)continue;p.hp=row[1];if(row[2]&&!p.broken)breakPanel(b,p);}};
 const originalHit=DM.hitAt,originalExplosion=DM.explode;
 DM.hitAt=function(tw,point,amount,dir,kind){
  for(const b of tw.buildings||[]){if(!b.importedDamage||b.state==='collapsed')continue;const r=b.rect;if(point[0]<r[0]-1||point[0]>r[2]+1||point[2]<r[1]-1||point[2]>r[3]+1)continue;
   for(const p of panels(b).panels){if(p.broken)continue;const v=local(point,p);if(Math.abs(v.x)<=p.size[0]/2+.065&&Math.abs(v.y)<=p.size[1]/2+.065&&Math.abs(v.z)<=p.size[2]/2+.065){damage(b,p,amount??DM.PNL.BULLET);DM.PNL.last={wp:point.slice(),b:b.id,pn:p.id};return p;}}
  }return originalHit.apply(this,arguments);
 };
 DM.explode=function(tw,point,radius,amount){
  const hits=originalExplosion.apply(this,arguments);radius=radius||3.5;amount=amount||400;
  for(const b of tw.buildings||[]){if(!b.importedDamage||b.state==='collapsed')continue;const r=b.rect;if(point[0]<r[0]-radius||point[0]>r[2]+radius||point[2]<r[1]-radius||point[2]>r[3]+radius)continue;
   for(const p of panels(b).panels){if(p.broken)continue;const v=local(point,p),d=Math.hypot(Math.max(0,Math.abs(v.x)-p.size[0]/2),Math.max(0,Math.abs(v.y)-p.size[1]/2),Math.max(0,Math.abs(v.z)-p.size[2]/2));if(d<radius){damage(b,p,amount*(1-d/radius));hits.push(p.id);}}
  }return hits;
 };
 function breachPortals(b,group){
  if(!b.graph)return true;
  let opened=false;
  const raw=metadata.buildings.find(x=>x.id===b.id),rooms=raw.sections.flatMap(s=>s.rooms),first=group.panels[0],floor=first.floor;
  const ys=rooms.filter(r=>r.floor===floor).map(r=>r.centroid[1]);if(!ys.length)return;
  const floorY=Math.min(...ys),width=DM.PNL.HOLE_W,height=DM.PNL.HOLE_H;
  const q=new pc.Quat(...first.rotation),axis=first.axis,other=axis===0?2:0;
  const roomAt=p=>{for(const room of b.graph.rooms){if(room.isOutdoor||p[1]<room.bounds.min[1]-.1||p[1]>room.bounds.max[1])continue;const poly=room.polygon;if(!poly)continue;let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],c=poly[j];if((a[1]>p[2])!==(c[1]>p[2])&&p[0]<(c[0]-a[0])*(p[2]-a[1])/(c[1]-a[1])+a[0])inside=!inside;}if(inside)return room.id;}return 'B'+b.id+'_Outside';};
  group.portals=group.portals||[];
  for(const broken of group.panels){if(!broken.broken||Math.abs(broken.position[1]-floorY)>height+.6)continue;
   const c=first.inv.transformVector(vec(broken.position)),along=axis===0?c.x:c.z;
   if(group.portals.some(v=>Math.abs(v-along)<width))continue;
   const obstructed=group.panels.some(p=>{if(p.broken)return false;const v=first.inv.transformVector(vec(p.position)),a=axis===0?v.x:v.z;return a+p.size[axis]/2>along-width/2+.01&&a-p.size[axis]/2<along+width/2-.01&&p.position[1]+p.size[1]/2>floorY+.15&&p.position[1]-p.size[1]/2<floorY+height;});
   if(obstructed)continue;opened=true;
   const centre=broken.position.slice();centre[1]=floorY+height/2;const unit=[0,0,0];unit[other]=1;const n=q.transformVector(vec(unit));
   const a=[centre[0]-n.x*.7,centre[1],centre[2]-n.z*.7],z=[centre[0]+n.x*.7,centre[1],centre[2]+n.z*.7];
   let ra=roomAt(a),rb=roomAt(z);if(ra===rb)continue;const normal=[n.x,0,n.z];if(ra.endsWith('_Outside')){[ra,rb]=[rb,ra];normal[0]*=-1;normal[2]*=-1;}
   const portal={id:'B'+b.id+'_BREACH_'+broken.id,kind:'breach',rooms:[ra,rb],center:centre,normal,width,height,isOpen:true,openFraction:1,breakable:false,exterior:rb.endsWith('_Outside'),broken:true,source:'imported-damage'};
   b.graph.portals.push(portal);group.portals.push(along);DM.PNL.stats.holes++;
   const tw=TacticalCommon.ns(app).town;if(tw.roomGraph)tw.roomGraph.portalStateVersion++;
   app.fire('portal:changed',{...portal,portalId:portal.id,buildingId:'B'+b.id,added:true,portalStateVersion:tw.roomGraph?.portalStateVersion});
  }
  return opened;
 }
 D.reset=function(b,boxes){dirty.delete(b);if(b.graph)b.graph.portals=b.graph.portals.filter(p=>p.source!=='imported-damage');b.importedDamage={boxes};};
 D.flush=function(budget=6){
  const started=performance.now();let processed=0;
  if(!dirty.size)return;const T=TacticalCommon.ns(app),list=[...dirty];dirty.clear();let needsNav=false;
  for(const b of list){if(!b.entity||!b.entity.parent||b.state==='collapsed')continue;if(processed&&performance.now()-started>=budget){dirty.add(b);continue;}const s=b.importedDamage;
   if(s.collapsing)continue;
   if(!s.collapsing&&Object.keys(s.total).some(f=>s.broken[f]/s.total[f]>=DM.PNL.COLLAPSE)){
    if(globalThis.DreadingNight)globalThis.DreadingNight.invalidate();s.collapsing=true;DM.PNL.stats.collapses++;app.fire('panels:collapse',{buildingId:'B'+b.id,section:'imported'});
    s.transition=T.town.setState(b.id,'collapsed').catch(e=>{s.collapsing=false;console.error('Imported collapse failed',e);});
    continue;
   }

   for(const group of s.groups.values()){if(!group.dirty)continue;if(processed&&performance.now()-started>=budget){dirty.add(b);break;}group.dirty=false;processed++;
    D.applyVisuals(b,b.importedVisual,group.source);D.applyVisuals(b,b.roomRoot,group.source);
    b.entity.children.slice().filter(e=>e.importedCollisionSource===group.source+'_col').forEach(e=>e.destroy());
    for(const p of group.panels)if(!p.broken)makeProxy({name:p.id,source:p.source,position:p.position,rotation:p.rotation,size:p.size,kind:p.kind},b.entity,b.id);
    if(globalThis.DreadingNight)globalThis.DreadingNight.invalidate();needsNav=breachPortals(b,group)||needsNav;
   }
   D.refreshCollision(b);
  }
  D.commitBatchUpdates();
  if(list.every(b=>b.importedDamage?.collapsing)){clearTimeout(navTimer);navTimer=null;}
  else if(needsNav){const rects=list.filter(b=>b.rect);if(T.navigation&&T.navigation.markLocal)rects.forEach(b=>T.navigation.markLocal([b.rect[0]-2,b.rect[1]-2,b.rect[2]+2,b.rect[3]+2]));clearTimeout(navTimer);navTimer=setTimeout(()=>{navTimer=null;T.navigation.rebuild('imported weapon breach').catch(console.error);},350);}
 };
 app.on('update',()=>{if(dirty.size)D.flush();});
};
if(typeof module!=='undefined')module.exports=D;
})(globalThis);
