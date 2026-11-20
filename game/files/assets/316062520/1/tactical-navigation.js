/* tacticalNavigation: builds the Recast navmesh from the tagged Editor entities.
   rebuild(reason) -> frees the old navmesh, re-reads the scene, rebuilds, refreshes perception + cover,
   re-snaps soldiers, re-plans active routes and validates every spawn, role slot, door and cover point.
   Bound to key N and the "Rebuild navigation" button. */
var TacticalNavigationScript=pc.createScript('tacticalNavigation');
TacticalNavigationScript.attributes.add('rebuildOnStart',{type:'boolean',default:true});
TacticalNavigationScript.attributes.add('agentRadius',{type:'number',default:0.45,title:'Agent radius (m)'});
TacticalNavigationScript.attributes.add('agentHeight',{type:'number',default:1.8,title:'Agent height (m)'});
TacticalNavigationScript.attributes.add('agentClimb',{type:'number',default:0.3,title:'Max step (m)'});
TacticalNavigationScript.attributes.add('cellSize',{type:'number',default:0.15,title:'Cell size (m)'});
TacticalNavigationScript.attributes.add('maxSlope',{type:'number',default:38,title:'Max slope (deg)'});
TacticalNavigationScript.prototype.initialize=function(){
 var T=TacticalCommon.ns(this.app),self=this;T.navigation=this;this.nav=null;this.version=0;this.building=null;
 this.ready=TacticalNavCore.initRecast();
 this.onKey=function(e){if((e.key==='n'||e.key==='N')&&!(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName)))self.rebuild('key N');};
 window.addEventListener('keydown',this.onKey);
 this.on('destroy',function(){window.removeEventListener('keydown',self.onKey);if(self.nav)self.nav.destroy();});
};
TacticalNavigationScript.prototype.path=function(a,b){if(!this.nav)throw new Error('navigation not built yet');return this.nav.path(TacticalCommon.v3(a),TacticalCommon.v3(b));};
TacticalNavigationScript.prototype.nearest=function(p,half){return this.nav?this.nav.nearest(TacticalCommon.v3(p),half):null;};
TacticalNavigationScript.prototype.walk=function(a,b){return this.nav?this.nav.walk(TacticalCommon.v3(a),TacticalCommon.v3(b)):null;};
TacticalNavigationScript.prototype.rebuild=function(reason,hadLocal){
 /* opt clone: remember whether dirty rects were pending when the rebuild was REQUESTED. If an earlier rebuild already patched them by the
    time this one runs, it is satisfied and skipped (was: it ran with no rects and fell back to a ~3 s whole-map rebuild). */
 var self=this,had=hadLocal!==undefined?hadLocal:!!(this.localRects&&this.localRects.length);
 if(this.building){/* M9: changes that arrive while a rebuild runs are coalesced into ONE follow-up rebuild (it reads the scene when it starts) */
  if(!this.queued){this.queuedHad=had;this.queued=this.building.then(function(){self.queued=null;return self.rebuild(reason,self.queuedHad);},function(){self.queued=null;return self.rebuild(reason,self.queuedHad);});}else this.queuedHad=this.queuedHad&&had;return this.queued;}
 this.building=this.ready.then(function(){return self._rebuild(reason||'manual',had);}).finally(function(){self.building=null;});
 return this.building;
};
/* M9: Recast runs in a Web Worker (same nav-core script, same input -> identical navmesh); the main thread only imports the
   serialized result (a few ms). The post-swap refreshes are spread over frames: swap + sight blockers, then cover, then
   validation + re-plans. Falls back to the old blocking build if workers are unavailable (or ?navworker=0). */
TacticalNavigationScript.frame=function(){return new Promise(function(r){var done=false,f=function(){if(!done){done=true;r();}};if(typeof requestAnimationFrame==='function')requestAnimationFrame(f);setTimeout(f,40);});};
TacticalNavigationScript.prototype.worker=function(){var self=this;if(this._wk!==undefined)return this._wk;this._wk=null;
 try{if(typeof Worker==='undefined'||typeof Blob==='undefined'||/[?&]navworker=0/.test(location.search))return null;
  var a=this.app.assets.find('tactical-nav-core.js','script');if(!a)return null;var url=new URL(a.getFileUrl(),location.href).href;
  var src="importScripts("+JSON.stringify(url)+");var R=TacticalNavCore.initRecast();onmessage=function(e){var d=e.data;R.then(function(){if(d.mode==='tiles'){var r=TacticalNavCore.buildTileDatas(d.positions,d.indices,d.cfg);if(!r.success){postMessage({id:d.id,ok:false,error:r.error});return;}var tiles=r.tiles.map(function(t){return{x:t.x,y:t.y,data:t.data};});postMessage({id:d.id,ok:true,mode:'tiles',spec:r.spec,tiles:tiles,triangles:r.triangles},tiles.filter(function(t){return t.data;}).map(function(t){return t.data.buffer;}));return;}var r=TacticalNavCore.buildData(d.positions,d.indices,d.cfg);if(r.success)postMessage({id:d.id,ok:true,data:r.data,triangles:r.triangles},[r.data.buffer]);else postMessage({id:d.id,ok:false,error:r.error});}).catch(function(x){postMessage({id:d.id,ok:false,error:String(x&&x.message||x)});});};";
  var w=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));this._wk={w:w,seq:0,cb:{}};
  w.onmessage=function(e){var c=self._wk&&self._wk.cb[e.data.id];if(c){delete self._wk.cb[e.data.id];c(e.data);}};
  w.onerror=function(e){console.warn('[TacticalNav] worker failed, using main-thread builds: '+(e.message||e));var k=self._wk;self._wk=null;if(k)Object.keys(k.cb).forEach(function(i){k.cb[i]({ok:false,error:'worker error',fallback:true});});};
 }catch(e){console.warn('[TacticalNav] no nav worker: '+e.message);this._wk=null;}return this._wk;};
/* requests of these kinds always mark their dirty rect first; if another rebuild already patched it, they are satisfied */
TacticalNavigationScript.LOCAL_REASON=/breach|panels|^town: .* -> |\(next dirty rect\)$/;
TacticalNavigationScript.prototype.markLocal=function(rect){if(!rect)return;this._marked=true;var r=[rect[0],rect[1],rect[2],rect[3]];r.gen=this.dirtyGen=(this.dirtyGen||0)+1;(this.localRects||(this.localRects=[])).push(r);};
/* round 2: a background patch is stale if an overlapping area was dirtied after its geometry was read (generation counter) */
TacticalNavigationScript.prototype.staleSince=function(gen,rect){var L=this.localRects||[];for(var i=0;i<L.length;i++){var r=L[i];if((r.gen||0)>gen&&!(r[2]<rect[0]||r[0]>rect[2]||r[3]<rect[1]||r[1]>rect[3]))return true;}return false;};
/* opt clone: dirty rects are patched in clusters that fit the 36-tile limit (0 A.D. dirty chunks / Recoil dirty blocks); leftovers get a follow-up patch instead of a whole-map rebuild */
TacticalNavigationScript.prototype.takeLocal=function(){var L=this.localRects;this.localRects=null;if(!L||!L.length)return null;var S=this.nav&&this.nav.tiled;if(!S){return L.reduce(function(b,r){return [Math.min(b[0],r[0]),Math.min(b[1],r[1]),Math.max(b[2],r[2]),Math.max(b[3],r[3])];});}
 var tw=S.tileWorld,ox=S.origin[0],oz=S.origin[2],tiles=function(b){return (Math.floor((b[2]-ox)/tw)-Math.floor((b[0]-ox)/tw)+3)*(Math.floor((b[3]-oz)/tw)-Math.floor((b[1]-oz)/tw)+3);};
 /* a single rect larger than the patch limit is split on tile boundaries into 4x4-tile chunks (each patch adds a 1-tile pad = 6x6 = 36 tiles) */
 var split=[];L.forEach(function(r){if(tiles(r)<=36){split.push(r);return;}var e=1e-3,i0=Math.floor((r[0]-ox)/tw),i1=Math.floor((r[2]-ox)/tw),j0=Math.floor((r[1]-oz)/tw),j1=Math.floor((r[3]-oz)/tw);
  for(var i=i0;i<=i1;i+=4)for(var j=j0;j<=j1;j+=4)split.push([Math.max(r[0],ox+i*tw+e),Math.max(r[1],oz+j*tw+e),Math.min(r[2],ox+Math.min(i+4,i1+1)*tw-e),Math.min(r[3],oz+Math.min(j+4,j1+1)*tw-e)]);});L=split;
 var cur=L[0].slice(),rest=[];for(var i=1;i<L.length;i++){var r=L[i],u=[Math.min(cur[0],r[0]),Math.min(cur[1],r[1]),Math.max(cur[2],r[2]),Math.max(cur[3],r[3])];if(tiles(u)<=36)cur=u;else rest.push(r);}
 if(rest.length)this.localRects=rest;return cur;};
TacticalNavigationScript.prototype.buildAsync=function(geo,cfg,mode,accept){var self=this,k=this.worker();
 function take(tiles,spec){if(mode==='patch'&&self.nav&&self.nav.swapTiles){if(accept&&!accept())return {stale:true};self.nav.swapTiles(tiles);self.nav.worker=true;return self.nav;}var nav=TacticalNavCore.openTiled(spec,cfg);if(!nav||nav.success===false)return nav;nav.swapTiles(tiles);nav.worker=!!k;return nav;}
 if((mode==='tiles'||mode==='patch')&&!k){var local=TacticalNavCore.buildTileDatas(geo.positions,geo.indices,cfg);if(!local.success)return Promise.resolve(local);return Promise.resolve(take(local.tiles,local.spec));}
 if(!k)return Promise.resolve(TacticalNavCore.build(geo.positions,geo.indices,cfg));
 var pos=new Float32Array(geo.positions),idx=new Uint32Array(geo.indices),id=++k.seq;
 return new Promise(function(res){var to=setTimeout(function(){if(k.cb[id]){delete k.cb[id];res({ok:false,fallback:true,error:'worker timeout'});}},60000);
   k.cb[id]=function(d){clearTimeout(to);res(d);};k.w.postMessage({id:id,mode:mode==='patch'||mode==='tiles'?'tiles':undefined,positions:pos,indices:idx,cfg:cfg},[pos.buffer,idx.buffer]);})
  .then(function(d){if(d.success!==undefined)return d;if(d.ok&&d.mode==='tiles')return take(d.tiles,d.spec);if(d.ok){var n=TacticalNavCore.fromData(d.data,cfg,d.triangles);n.worker=true;return n;}
   if(d.fallback&&(mode==='tiles'||mode==='patch')){var again=TacticalNavCore.buildTileDatas(geo.positions,geo.indices,cfg);return again.success?take(again.tiles,again.spec):again;}
   if(d.fallback)return TacticalNavCore.build(geo.positions,geo.indices,cfg);return {success:false,error:d.error};});};
TacticalNavigationScript.prototype._rebuild=async function(reason,hadLocal){
 var C=TacticalCommon,T=C.ns(this.app),t0=performance.now();
 var cs=this.cellSize||0.15,ch=0.1;
 var cfg={cs:cs,ch:ch,walkableRadius:Math.ceil(this.agentRadius/cs),walkableHeight:Math.ceil(this.agentHeight/ch),walkableClimb:Math.floor(this.agentClimb/ch+1e-9),walkableSlopeAngle:this.maxSlope,tileCells:128};
 var patch=null,worldRect=null,local=this.takeLocal();
 if(!local&&this._marked&&(hadLocal||TacticalNavigationScript.LOCAL_REASON.test(reason||''))){return {reason:reason,errors:[],warnings:[],problems:[],info:{skipped:true}};}/* opt clone: follow-up patch whose rects were already taken by a queued rebuild */
 if(local&&this.nav&&this.nav.tiled){var S=this.nav.tiled,tw=S.tileWorld,ox=S.origin[0],oz=S.origin[2],pad=1;
  var x0=Math.floor((local[0]-ox)/tw)-pad,x1=Math.floor((local[2]-ox)/tw)+pad,y0=Math.floor((local[1]-oz)/tw)-pad,y1=Math.floor((local[3]-oz)/tw)+pad,only=[];
  for(var tx=x0;tx<=x1;tx++)for(var ty=y0;ty<=y1;ty++)if(tx>=0&&ty>=0&&tx<S.tilesX&&ty<S.tilesY)only.push({x:tx,y:ty});
  if(only.length&&only.length<=36){patch=only;cfg.only=only;cfg.tileSpec=S;var padM=(S.border||8)*(S.cs||cs)+1.5;worldRect=[ox+x0*tw-padM,oz+y0*tw-padM,ox+(x1+1)*tw+padM,oz+(y1+1)*tw+padM];}}
 var geo=C.navGeometry(this.app,worldRect),readGen=this.dirtyGen||0,selfN=this;
 /* terrain batch: window vaults / drops / stair-side drops as Recast off-mesh links (?links=0 turns them off) */
 var TV=typeof TacticalTraversal!=='undefined'&&!/[?&]links=0/.test(location.search)?TacticalTraversal:null,LK=TV?TV.collect(this.app):[];if(LK.length)cfg.offMeshConnections=TV.offMesh(LK);
 var report={reason:reason,time:new Date().toLocaleTimeString(),errors:[],warnings:geo.warnings.slice(),problems:[],info:{sources:geo.sources.length,inputTriangles:geo.indices.length/3}};
 if(!geo.indices.length){report.errors.push('No tagged walkable geometry found. Add a tacticalTag script (Kind = Walkable surface) to the ground.');return this._finish(report,t0);}
 var built=await this.buildAsync(geo,cfg,patch?'patch':'tiles',patch?function(){return !selfN.staleSince(readGen,worldRect);}:null);
 if(built&&built.stale){/* discard the outdated tiles, requeue this area with the newer breach; nothing was swapped */var back=local.slice();back.gen=this.dirtyGen;(this.localRects||(this.localRects=[])).push(back);this.staleRejected=(this.staleRejected||0)+1;
  setTimeout(function(){selfN.rebuild(reason.replace(/ \(next dirty rect\)$/,'')+' (next dirty rect)');},0);return {reason:reason,errors:[],warnings:[],problems:[],info:{stale:true,ms:+(performance.now()-t0).toFixed(1)}};}report.info.worker=!!(built&&built.worker);var F=TacticalNavigationScript.frame;
 if(!built||built.success===false){report.errors.push('Recast navmesh build failed: '+(built&&built.error||'tiled init failed')+' (old navmesh kept)');return this._finish(report,t0);}
 if(!(patch&&built===this.nav)){if(this.nav)this.nav.destroy();this.nav=built;}
 if(patch)report.info.patched=patch.length;this.version++;report.info.navTriangles=built.triangles;report.info.version=this.version;if(TV){report.info.links=LK.length;report.info.linksOk=TV.validate(this.app);}
 if(T.perception)T.perception.refresh();
 if(patch){report.info.rect=worldRect;report.info.gen=readGen;if(T.cover&&worldRect){if(T.cover.refreshLocalAsync)await T.cover.refreshLocalAsync(worldRect,3);else if(T.cover.refreshLocal)T.cover.refreshLocal(worldRect);}T.squad.forEach(function(s){s.onNavigationRebuilt(report);});var self2=this;if(this.localRects&&this.localRects.length)setTimeout(function(){self2.rebuild(reason+' (next dirty rect)');},0);return this._finish(report,t0);}
 if(built.worker)await F();
 if(T.cover){if(built.worker&&T.cover.refreshAsync)await T.cover.refreshAsync(4);else T.cover.refresh();}
 if(built.worker)await F();
 if(built.worker&&this.validateAsync)await this.validateAsync(report,6);else this.validate(report);
 // Re-snap soldiers to the new mesh and re-plan anyone mid-route.
 T.squad.forEach(function(s){s.onNavigationRebuilt(report);});
 return this._finish(report,t0);
};
TacticalNavigationScript.prototype._finish=function(report,t0){
 var T=TacticalCommon.ns(this.app);report.info.ms=+(performance.now()-t0).toFixed(1);T.report=report;
 var head='[TacticalNav] rebuild #'+this.version+' ('+report.reason+')'+(report.info.patched?' patch '+report.info.patched+' tiles':'')+': '+(report.info.navTriangles||0)+' nav triangles from '+report.info.sources+' tagged entities in '+report.info.ms+' ms';
 console.log(head);report.errors.forEach(function(e){console.error('[TacticalNav] ERROR '+e);});report.warnings.forEach(function(w){console.warn('[TacticalNav] '+w);});
 this.app.fire('tactical:navRebuilt',report);return report;
};
TacticalNavigationScript.prototype.check=function(report,label,p,from,fromLabel,kind){
 var C=TacticalCommon,q=this.nearest(p,{x:1,y:1.5,z:1});
 var problem=function(msg,sev){report.problems.push({label:label,position:C.v3(p),message:msg,severity:sev||'error'});(sev==='warning'?report.warnings:report.errors).push(msg);};
 if(!q){problem(label+' at '+C.fmt(p)+' is OFF the navmesh (nothing walkable within 1 m)',kind);return false;}
 var dh=Math.hypot(q[0]-p[0],q[2]-p[2]);if(dh>0.5){problem(label+' at '+C.fmt(p)+' is off the navmesh (nearest walkable point '+dh.toFixed(2)+' m away)',kind);return false;}
 if(from){try{var path=this.nav.path(from,q);var end=path[path.length-1];if(Math.hypot(end[0]-q[0],end[2]-q[2])>0.3)throw new Error('path ends short');}
  catch(err){problem(label+' at '+C.fmt(p)+' is UNREACHABLE from '+fromLabel+': '+err.message,kind);return false;}}
 return true;
};
TacticalNavigationScript.prototype.validate=function(report){var it=this.validateIter(report);while(!it.next().done){}};
/* M10: the same checks, time-sliced (a 250 m map has hundreds of door checks; one blocking pass cost ~60 ms) */
TacticalNavigationScript.prototype.validateAsync=async function(report,budget){var it=this.validateIter(report),b=budget||6,F=TacticalNavigationScript.frame;for(;;){var t=performance.now(),r;while(!(r=it.next()).done&&performance.now()-t<b){}if(r.done)return;await F();}};
TacticalNavigationScript.prototype.validateIter=function*(report){
 var C=TacticalCommon,T=C.ns(this.app),self=this,tags=C.collect(this.app),i;
 var spawn=T.spawnPoints&&T.spawnPoints[0],spawnLabel=spawn?spawn.name+' spawn':'';
 var sps=T.spawnPoints||[];for(i=0;i<sps.length;i++){self.check(report,sps[i].name+' spawn',sps[i].position,i?spawn.position:null,spawnLabel);yield;}
 var from=spawn?spawn.position:null;
 var needed=T.requiredDefensiveSlots||['stairApproach1','stairApproach2','overwatch1','overwatch2','room1','room2'];
 needed.forEach(function(slot){if(!C.marker(self.app,slot))report.errors.push('Missing defensive area slot "'+slot+'" (add an entity with tacticalTag Kind = Defensive area, Slot id = '+slot+')');});
 for(i=0;i<tags.length;i++){var t=tags[i],p=C.v3(t.entity.getPosition());
  if(t.kind==='defensiveArea'){self.check(report,'Role slot "'+(t.slot||t.name)+'" ('+t.name+')',p,from,spawnLabel);yield;}
  if(t.kind==='door'){var o=C.shape(t.entity),bottom=[p[0],o.center.y-o.half[1]+0.1,p[2]];self.check(report,'Door "'+t.name+'"',bottom,from,spawnLabel);yield;}
  if(['obstacle','coverLow','coverTall'].indexOf(t.kind)>=0&&!t.entity.collision)report.info.noCollision=(report.info.noCollision||[]).concat(t.name);
 }
 if(T.cover){var bad=T.cover.candidates.filter(function(c){return !c.onMesh||c.reachable===false;});
  bad.forEach(function(c){report.problems.push({label:'cover',position:c.position,message:c.reason,severity:'warning'});});
  report.info.coverCandidates=T.cover.candidates.length;report.info.coverRejected=bad.length;
  if(bad.length)report.warnings.push(bad.length+' of '+T.cover.candidates.length+' cover points are off-mesh or unreachable and were dropped');}
 if(report.info.noCollision&&report.info.noCollision.length)report.warnings.push(report.info.noCollision.length+' obstacle/cover entities have no collision component (fine: sight and shots use the Editor boxes via TacticalCommon.rayWorld; physics is off)');
};
