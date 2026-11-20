/* Repeated landscape visuals only; authored trunk colliders remain independent. */
(function(G){'use strict';
G.DreadingMapAnimationBudget=function(z){
 const model=z.model;if(!model||model._importedPoseCache)return;const skins=new Set();model.findComponents('render').forEach(r=>r.meshInstances.forEach(mi=>{if(mi.skinInstance)skins.add(mi.skinInstance);}));
 if(!skins.size)return;model._importedPoseCache=true;
 // The existing zombie LOD already skips pose evaluation. Reuse the same relative
 // skin palette on those frames instead of recomputing/uploading unchanged bones.
 skins.forEach(skin=>{const matrices=skin.updateMatrices,palette=skin.updateMatrixPalette;
  skin.updateMatrices=function(...args){if(model.anim?.playing===false&&this._importedPoseReady)return;return matrices.apply(this,args);};
  skin.updateMatrixPalette=function(...args){if(model.anim?.playing===false&&this._importedPoseReady)return;const result=palette.apply(this,args);this._importedPoseReady=true;return result;};
 });
 const sync=model.syncHierarchy,skinList=[...skins];
 model.syncHierarchy=function(){if(model.anim?.playing===false&&skinList.every(s=>s._importedPoseReady)){
   if(this._dirtyLocal||this._dirtyWorld)this._sync();return;
  }return sync.call(this);};
};
G.DreadingMapRayIndex=function(blockers){
 function bounds(s){if(s.children)return {min:s.min,max:s.max};const c=[s.center.x,s.center.y,s.center.z],a=s.axes,h=s.half;const extent=[0,1,2].map(k=>a.reduce((sum,v,i)=>sum+Math.abs([v.x,v.y,v.z][k])*h[i],0));return {min:c.map((v,k)=>v-extent[k]),max:c.map((v,k)=>v+extent[k])};}
 function tree(list){if(list.length<=8)return list;const boxes=list.map(bounds),min=[0,1,2].map(k=>Math.min(...boxes.map(b=>b.min[k]))),max=[0,1,2].map(k=>Math.max(...boxes.map(b=>b.max[k]))),axis=[0,1,2].sort((a,b)=>(max[b]-min[b])-(max[a]-min[a]))[0];
  const sorted=list.map((s,i)=>({s,key:(boxes[i].min[axis]+boxes[i].max[axis])*.5})).sort((a,b)=>a.key-b.key).map(x=>x.s),mid=Math.floor(sorted.length/2);
  return [{name:'Imported spatial group',cluster:true,min,max,children:[...tree(sorted.slice(0,mid)),...tree(sorted.slice(mid))]}];
 }
 // Preserve named building groups for existing damage hooks; only index their exact leaves.
 const flat=[],out=[];blockers.forEach(s=>{if(s.children)out.push({...s,children:tree(s.children)});else flat.push(s);});return [...out,...tree(flat)];
};
G.DreadingMapInstances=function(app,parent,meta){
 if(parent._landscapeInstances)return parent._landscapeInstances;
 if(G.DreadingNight)G.DreadingNight.invalidate();
 const groups=new Map(),renders=[];
 parent.findComponents('render').forEach(r=>{
  const n=meta.nodes[r.entity.name];if(!n||n.role!=='vegetation'||n.collision||n.lod)return;
  renders.push(r);
  r.meshInstances.forEach(mi=>{
   const pos=mi.node.getPosition(),key=Math.floor(pos.x/32)+','+Math.floor(pos.z/32)+'|'+mi.mesh.id+'|'+mi.material.id+'|'+(!/grass|reed/i.test(r.entity.name));
   if(!groups.has(key))groups.set(key,[]);mi._nightSmallFoliage=/grass|reed/i.test(r.entity.name);groups.get(key).push(mi);
  });
 });
 const root=new pc.Entity('Instanced landscape');parent.addChild(root);
 // Model root is identity in the test. World matrices are stored in each instance.
 root.setPosition(0,0,0);root.setRotation(0,0,0,1);root.setLocalScale(1,1,1);
 const format=pc.VertexFormat.getDefaultInstancingFormat(app.graphicsDevice),buffers=[],mis=[],groupBounds=[];
 let count=0;
 groups.forEach(list=>{
  const matrixData=new Float32Array(list.length*16),bounds=list[0].aabb.clone();
  list.forEach((mi,i)=>{matrixData.set(mi.node.getWorldTransform().data,i*16);if(i)bounds.add(mi.aabb);});
  const buffer=new pc.VertexBuffer(app.graphicsDevice,format,list.length,{usage:pc.BUFFER_STATIC,data:matrixData});buffers.push(buffer);
  const mi=new pc.MeshInstance(list[0].mesh,list[0].material,root);mi.setInstancing(buffer,true);groupBounds.push(bounds);mi._nightSmallFoliage=list[0]._nightSmallFoliage;mi.castShadow=!mi._nightSmallFoliage;mi.receiveShadow=true;mis.push(mi);count+=list.length;
 });
 root.addComponent('render',{type:'asset',castShadows:true,receiveShadows:true});root.render.meshInstances=mis;// Assigning render.meshInstances clears per-instance custom bounds in PlayCanvas.
 // Restore each cell bounds afterwards; otherwise every group culls at the source mesh origin.
 mis.forEach((mi,i)=>{mi.setCustomAabb(groupBounds[i]);mi.castShadow=!mi._nightSmallFoliage;});
 renders.forEach(r=>r.enabled=false);
 root.on('destroy',()=>buffers.forEach(b=>b.destroy()));
 return parent._landscapeInstances={sourceMeshInstances:count,drawGroups:groups.size,cellSize:32,root};
};
})(globalThis);
