/* Tactical common helpers (library, no script type). Shared by all tactical* scripts.
   The Editor scene is the source of truth: every enabled entity with a `tacticalTag` script attribute
   (or an entity tag, see TAG_ALIASES) is read at runtime for navigation, sight and cover. */
(function(g){
'use strict';
var KINDS=['walkable','obstacle','coverLow','coverTall','stair','door','defensiveArea','threat','spawn','decor'];
var MARKER_KINDS=['door','defensiveArea','threat','stair','spawn'];
// Entity-tag alternative to the script attribute (either works; the attribute wins if both exist).
var TAG_ALIASES={'tactical:walkable':'walkable','nav-walkable':'walkable','tactical:obstacle':'obstacle','nav-obstacle':'obstacle',
 'tactical:coverLow':'coverLow','cover-low':'coverLow','tactical:coverTall':'coverTall','cover-high':'coverTall','tactical:stair':'stair','stairs':'stair',
 'tactical:door':'door','door':'door','tactical:defensiveArea':'defensiveArea','defend-area':'defensiveArea','tactical:threat':'threat',
 'tactical:decor':'decor','nav-ignore':'decor'};
function ns(app){if(!app.tactical)app.tactical={events:[],squad:[],running:false,paused:false,elapsed:0,selected:0,debug:(typeof location!=='undefined'&&/[?&]aiDebug=1/.test(location.search))/* AI-MERGE: AI debug overlay (cones, cover crosses, purple/magenta nav-problem X marks) off by default; tick 'AI debug' or ?aiDebug=1 */,report:{errors:[],warnings:[],info:{}}};return app.tactical;}
function tagInfo(e){
 var s=e.script&&e.script.tacticalTag;
 if(s)return {entity:e,name:e.name,kind:s.kind,blocksSight:!!s.blocksSight&&MARKER_KINDS.indexOf(s.kind)<0,slot:s.slot||'',radius:s.radius||1,team:s.team||'',source:'attribute'};
 if(!e.tags||!e.tags.size)return null;
 var list=e.tags.list();
 for(var i=0;i<list.length;i++){var k=TAG_ALIASES[list[i]];if(k){var slotTag=list.filter(function(t){return t.indexOf('slot:')===0;})[0]||'';
  return {entity:e,name:e.name,kind:k,blocksSight:MARKER_KINDS.indexOf(k)<0&&k!=='decor'&&!e.tags.has('no-sight'),slot:slotTag.slice(5),radius:1,source:'tag'};}}
 return null;
}
function collect(app){var out=[];app.root.forEach(function(e){if(!e.enabled)return;var t=tagInfo(e);if(t)out.push(t);});return out;}
// Oriented box of an entity. Box primitives and empty marker entities: unit box scaled by the world transform.
// Imported meshes / other primitives: world AABB of their mesh instances.
function shape(e){
 var r=e.render;
 if(r&&r.type!=='box'&&r.meshInstances&&r.meshInstances.length){var bb=new pc.BoundingBox();bb.copy(r.meshInstances[0].aabb);for(var i=1;i<r.meshInstances.length;i++)bb.add(r.meshInstances[i].aabb);
  return {name:e.name,entity:e,center:bb.center.clone(),axes:[new pc.Vec3(1,0,0),new pc.Vec3(0,1,0),new pc.Vec3(0,0,1)],half:[bb.halfExtents.x,bb.halfExtents.y,bb.halfExtents.z],mesh:true};}
 var m=e.getWorldTransform(),ax=[new pc.Vec3(),new pc.Vec3(),new pc.Vec3()];m.getX(ax[0]);m.getY(ax[1]);m.getZ(ax[2]);
 var half=ax.map(function(a){var l=a.length();a.mulScalar(1/(l||1));return l/2;});
 return {name:e.name,entity:e,center:e.getPosition().clone(),axes:ax,half:half,mesh:false};
}
function corner(o,sx,sy,sz){var c=o.center,a=o.axes,h=o.half;return [c.x+a[0].x*h[0]*sx+a[1].x*h[1]*sy+a[2].x*h[2]*sz,c.y+a[0].y*h[0]*sx+a[1].y*h[1]*sy+a[2].y*h[2]*sz,c.z+a[0].z*h[0]*sx+a[1].z*h[1]*sy+a[2].z*h[2]*sz];}
function segmentShape(a,b,o){
 var low=0,high=1,c=o.center;
 for(var i=0;i<3;i++){var ax=o.axes[i];var pa=(a[0]-c.x)*ax.x+(a[1]-c.y)*ax.y+(a[2]-c.z)*ax.z,pb=(b[0]-c.x)*ax.x+(b[1]-c.y)*ax.y+(b[2]-c.z)*ax.z,d=pb-pa,mn=-o.half[i],mx=o.half[i];
  if(Math.abs(d)<1e-8){if(pa<mn||pa>mx)return false;}else{var x=(mn-pa)/d,y=(mx-pa)/d;if(x>y){var t=x;x=y;y=t;}low=Math.max(low,x);high=Math.min(high,y);if(low>high)return false;}}
 return high>0.001&&low<0.999;
}
function pointInShape(p,o,pad){pad=pad||0;var c=o.center;for(var i=0;i<3;i++){var ax=o.axes[i];var d=(p[0]-c.x)*ax.x+(p[1]-c.y)*ax.y+(p[2]-c.z)*ax.z;if(Math.abs(d)>o.half[i]+pad)return false;}return true;}
// Triangle soup for Recast. Walkable boxes keep an upward top face; obstacle/cover boxes get a downward-facing
// top (Recast marks it unwalkable) so soldiers path around them, never onto them. A stair entity becomes one
// ramp rising along its local +Z (the visible treads are tagged decor). Non-box meshes are added as-is.
/* opt clone: nav patches (rect given) reuse cached world-space triangles of large static meshes (terrain) and keep only the triangles
   that overlap the patch rect (which already includes the Recast tile border), instead of re-reading and re-transforming the whole
   mesh on the main thread for every breach. Cache is invalidated when the node's world matrix or the vertex/index counts change.
   Meshes under 20k vertices take the original path. Returns false to fall back. */
function navMeshClip(mi,rect,P,I){var mesh=mi.mesh,vb=mesh&&mesh.vertexBuffer;if(!vb||vb.numVertices<20000)return false;var m=mi.node.getWorldTransform().data,c=mi._navClip,ib=mesh.indexBuffer&&mesh.indexBuffer[0],ni=ib?ib.numIndices:0;
 var ok=c&&c.nv===vb.numVertices&&c.ni===ni;if(ok)for(var q=0;q<16;q++)if(c.m[q]!==m[q]){ok=false;break;}
 if(!ok){var pos=[],idx=[];try{mesh.getPositions(pos);mesh.getIndices(idx);}catch(err){return false;}if(!pos.length)return false;var w=new Float32Array(pos.length),v=new pc.Vec3(),M=mi.node.getWorldTransform();
  for(var i=0;i<pos.length;i+=3){v.set(pos[i],pos[i+1],pos[i+2]);M.transformPoint(v,v);w[i]=v.x;w[i+1]=v.y;w[i+2]=v.z;}if(!idx.length){idx=new Array(pos.length/3);for(var k=0;k<idx.length;k++)idx[k]=k;}
  c=mi._navClip={nv:vb.numVertices,ni:ni,m:Float32Array.from(m),w:w,idx:Uint32Array.from(idx)};}
 var W=c.w,X=c.idx,x0=rect[0],z0=rect[1],x1=rect[2],z1=rect[3];
 for(var t=0;t<X.length;t+=3){var a=X[t]*3,b=X[t+1]*3,d=X[t+2]*3,ax=W[a],bx=W[b],dx=W[d];if((ax<x0&&bx<x0&&dx<x0)||(ax>x1&&bx>x1&&dx>x1))continue;var az=W[a+2],bz=W[b+2],dz=W[d+2];if((az<z0&&bz<z0&&dz<z0)||(az>z1&&bz>z1&&dz>z1))continue;
  var base=P.length/3;P.push(ax,W[a+1],az,bx,W[b+1],bz,dx,W[d+1],dz);I.push(base,base+1,base+2);}
 return true;}
function navGeometry(app, rect){
 var P=[],I=[],sources=[],warnings=[];
 function tri(a,b,c){var i=P.length/3;P.push(a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2]);I.push(i,i+1,i+2);}
 function quad(a,b,c,d){tri(a,b,c);tri(a,c,d);}
 /* same XZ footprint as shape()+corner(), without allocating an OBB per scene entity (local nav patches tested ~9.7k entities each) */
 function inRect(e){if(!rect)return true;var minx=Infinity,maxx=-Infinity,minz=Infinity,maxz=-Infinity;try{var r=e.render;
  if(r&&r.type!=='box'&&r.meshInstances&&r.meshInstances.length){for(var i=0;i<r.meshInstances.length;i++){var bb=r.meshInstances[i].aabb,c=bb.center,h=bb.halfExtents;if(c.x-h.x<minx)minx=c.x-h.x;if(c.x+h.x>maxx)maxx=c.x+h.x;if(c.z-h.z<minz)minz=c.z-h.z;if(c.z+h.z>maxz)maxz=c.z+h.z;}}
  else{var m=e.getWorldTransform().data,ex=(Math.abs(m[0])+Math.abs(m[8]))/2,ez=(Math.abs(m[2])+Math.abs(m[10]))/2;minx=m[12]-ex;maxx=m[12]+ex;minz=m[14]-ez;maxz=m[14]+ez;}}catch(err){return true;}if(!(minx<=maxx&&minz<=maxz))return true;
  return !(maxx<rect[0]||minx>rect[2]||maxz<rect[1]||minz>rect[3]);}
 collect(app).forEach(function(t){
  if(!inRect(t.entity))return;
  var k=t.kind,e=t.entity;
  if(k==='stair'){var so=shape(e),S=function(x,y,z){return corner(so,x,y,z);};quad(S(-1,-1,-1),S(-1,1,1),S(1,1,1),S(1,-1,-1));sources.push(t.name+' (stair ramp)');return;}
  if(['walkable','obstacle','coverLow','coverTall'].indexOf(k)<0)return;
  var r=e.render;
  if(r&&r.type!=='box'&&r.meshInstances&&r.meshInstances.length){
   var added=0;
   r.meshInstances.forEach(function(mi){if(rect&&navMeshClip(mi,rect,P,I)){added++;return;}var mesh=mi.mesh,pos=[],idx=[];try{mesh.getPositions(pos);mesh.getIndices(idx);}catch(err){}
    if(!pos.length){return;}var m=mi.node.getWorldTransform(),v=new pc.Vec3(),base=P.length/3;
    for(var i=0;i<pos.length;i+=3){v.set(pos[i],pos[i+1],pos[i+2]);m.transformPoint(v,v);P.push(v.x,v.y,v.z);}
    if(idx.length)for(var j=0;j<idx.length;j++)I.push(base+idx[j]);else for(var j2=0;j2<pos.length/3;j2++)I.push(base+j2);added++;});
   if(added){sources.push(t.name+' (mesh '+k+')');return;}
   warnings.push(t.name+': mesh has no CPU-side vertex data, used its bounding box instead');
  }
  var o=shape(e),L=function(x,y,z){return corner(o,x,y,z);};
  if(k==='walkable')quad(L(-1,1,-1),L(-1,1,1),L(1,1,1),L(1,1,-1));else quad(L(-1,1,-1),L(1,1,-1),L(1,1,1),L(-1,1,1));
  quad(L(-1,-1,1),L(-1,-1,-1),L(1,-1,-1),L(1,-1,1));
  quad(L(-1,-1,-1),L(-1,1,-1),L(1,1,-1),L(1,-1,-1));
  quad(L(1,-1,1),L(1,1,1),L(-1,1,1),L(-1,-1,1));
  quad(L(-1,-1,1),L(-1,1,1),L(-1,1,-1),L(-1,-1,-1));
  quad(L(1,-1,-1),L(1,1,-1),L(1,1,1),L(1,-1,1));
  sources.push(t.name+' ('+k+')');
 });
 return {positions:P,indices:I,sources:sources,warnings:warnings};
}
/* ---- Milestone 3: ONE ray method for perception, cover scoring and shots ----
   Analytic ray vs the oriented boxes of every tagged "Blocks sight" Editor entity (same shapes navigation uses).
   Returns the closest entry {t, n:[normal], shape} or null. Boxes the ray starts inside are ignored.
   (Project physics is off: use3dPhysics=false. Collision components were added to the blockers so a later switch
   to rigidbody.raycastFirst is a settings change, but nothing reads them yet.) */
function rayWorld(o,d,maxT,shapes){
 var best=null,bt=maxT;
 for(var s=0;s<shapes.length;s++){var sh=shapes[s];
  if(sh.children){/* pass 4: cluster (one procedural building) = world AABB around its boxes; only rays that touch it test the children */
   var lo2=0,hi2=bt,mn=sh.min,mx=sh.max,ok=true;for(var k=0;k<3;k++){if(Math.abs(d[k])<1e-9){if(o[k]<mn[k]||o[k]>mx[k]){ok=false;break;}continue;}var a1=(mn[k]-o[k])/d[k],a2=(mx[k]-o[k])/d[k];if(a1>a2){var tt2=a1;a1=a2;a2=tt2;}if(a1>lo2)lo2=a1;if(a2<hi2)hi2=a2;if(lo2>hi2){ok=false;break;}}
   if(ok){var sub=rayWorld(o,d,bt,sh.children);if(sub&&sub.t<bt){bt=sub.t;best=sub;}}continue;}
  var c=sh.center,low=-Infinity,high=Infinity,nAxis=-1,nSign=0,inside=true;
  for(var i=0;i<3;i++){var ax=sh.axes[i],po=(o[0]-c.x)*ax.x+(o[1]-c.y)*ax.y+(o[2]-c.z)*ax.z,dd=d[0]*ax.x+d[1]*ax.y+d[2]*ax.z,h=sh.half[i];
   if(po<-h||po>h)inside=false;
   if(Math.abs(dd)<1e-9){if(po<-h||po>h){low=Infinity;break;}continue;}
   var t1=(-h-po)/dd,t2=(h-po)/dd,sg=-1;if(t1>t2){var tt=t1;t1=t2;t2=tt;sg=1;}
   if(t1>low){low=t1;nAxis=i;nSign=sg;}if(t2<high)high=t2;if(low>high)break;}
  if(inside||low>high||low<0||low>=bt||nAxis<0)continue;
  var a=sh.axes[nAxis];bt=low;best={t:low,n:[a.x*nSign,a.y*nSign,a.z*nSign],shape:sh};}
 return best;
}
// Seeded RNG (mulberry32) so test runs are repeatable; every ported NIGHT_SURVIVAL Math.random() goes through random().
var _seed=1;function seed(n){_seed=(n>>>0)||1;}
function random(){_seed|=0;_seed=_seed+0x6D2B79F5|0;var t=Math.imul(_seed^_seed>>>15,1|_seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}
function rand(a,b){return a+(b-a)*random();}
function randi(a,b){return Math.floor(rand(a,b+1));}
function allied(a,b){return a.team===b.team;}
/* pass 4b: marker() was a full scene walk (collect) per call - the squad asked for the objective several times per frame, which walked
   ~1,000 town boxes + every zombie bone each time (15% of the frame). Slot markers are static Editor entities: cache slot -> tag info,
   re-walk only when a cached entity was destroyed/disabled or after invalidateMarkers() (called on nav rebuild via the town). */
/* AI passes A-E (2026-11-15): ?ai=0 turns off sectors / threat weights / pile-up cap / hearing so the legacy regression hashes still reproduce */
var AI={on:true};try{if(/[?&]ai=0/.test(location.search))AI.on=false;}catch(e){}
var _mk=null;function invalidateMarkers(){_mk=null;}
function marker(app,slot){if(!_mk||_mk.app!==app){_mk={app:app,map:{}};collect(app).forEach(function(t){if(t.slot&&!_mk.map[t.slot])_mk.map[t.slot]=t;});}
 var t=_mk.map[slot];if(t&&(!t.entity.parent||!t.entity.enabled)){_mk=null;return marker(app,slot);}return t||null;}
function v3(p){return Array.isArray(p)?p:[p.x,p.y,p.z];}
function fmt(p){return '['+v3(p).map(function(n){return (+n).toFixed(2);}).join(', ')+']';}
function log(app,s,text){var T=ns(app);if(s.decision===text)return;s.decision=text;T.events.push({time:+T.elapsed.toFixed(2),soldier:s.soldierName,decision:text});if(T.events.length>100)T.events.shift();s.history.push((T.elapsed).toFixed(1)+'s '+text);if(s.history.length>8)s.history.shift();}
g.TacticalCommon={AI:AI,invalidateMarkers:invalidateMarkers,rayWorld:rayWorld,seed:seed,random:random,rand:rand,randi:randi,allied:allied,KINDS:KINDS,TAG_ALIASES:TAG_ALIASES,ns:ns,tagInfo:tagInfo,collect:collect,shape:shape,corner:corner,segmentShape:segmentShape,pointInShape:pointInShape,navGeometry:navGeometry,marker:marker,v3:v3,fmt:fmt,log:log};
})(globalThis);

/* Persistent four-person units. Dead/disabled members keep their place: casualties
   never make a survivor change squads or pull a replacement from another squad. */
TacticalCommon.ensureSquads=function(T){var counts={},next={};(T.squad||[]).forEach(function(s){if(s.squadKey)counts[s.squadKey]=(counts[s.squadKey]||0)+1;});
 (T.squad||[]).forEach(function(s){if(s.squadKey||!s.team)return;var team=s.team,n=next[team]||0,key=n?team+':'+n:team;
  while((counts[key]||0)>=4){n++;key=team+':'+n;}s.squadKey=key;counts[key]=(counts[key]||0)+1;next[team]=n;});};
TacticalCommon.squadGroups=function(T,team){TacticalCommon.ensureSquads(T);var groups=new Map();(T.squad||[]).forEach(function(s){if(team&&s.team!==team)return;if(!groups.has(s.squadKey))groups.set(s.squadKey,[]);groups.get(s.squadKey).push(s);});return Array.from(groups.values());};
TacticalCommon.squadMembers=function(T,s){if(!s)return [];TacticalCommon.ensureSquads(T);return (T.squad||[]).filter(function(o){return o.team===s.team&&o.squadKey===s.squadKey&&o.alive&&!o.disabled;});};
TacticalCommon.expandSquads=function(T,list){var result=[];(list||[]).forEach(function(s){if(!s||!s.alive||s.disabled)return;[s].concat(TacticalCommon.squadMembers(T,s)).forEach(function(o){if(result.indexOf(o)<0)result.push(o);});});return result;};
