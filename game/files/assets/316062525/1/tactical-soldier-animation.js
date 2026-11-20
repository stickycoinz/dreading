/* tacticalSoldierAnimation: one per soldier. Clip table maps actions to GLB clip names so the retargeted
   aim / fire / reload / hit / death / toss (grenade) clips can be plugged in later (edit the "clips" JSON); missing clips fall back:
   aim/fire -> idle, reload -> crouch/idle, hit -> procedural flinch, death -> procedural fall.
   Faces the soldier's look direction (lookYaw, NIGHT_SURVIVAL yaw convention). Freezes when paused. */
var TacticalSoldierAnimation=pc.createScript('tacticalSoldierAnimation');
TacticalSoldierAnimation.attributes.add('clips',{type:'string',default:'{"idle":"idle","walk":"rifle_walk","walkSpeed":1.0,"run":"rifle_run","runSpeed":3.17,"crouch":"crouch","aim":"aim_idle","fire":"fire","reload":"reload","hit":"hit_react","death":"death_forward","toss":"grenade_toss","fallbackWalk":"walk"}',title:'Clip table (JSON)'});
TacticalSoldierAnimation.prototype.initialize=function(){this.current='';this.stats={};this.rateClamped=0;this.moveTime=0;this.transitions=0;try{this.map=JSON.parse(this.clips);}catch(e){this.map={idle:'idle',walk:'walk',crouch:'crouch'};}this.fall=0;};
TacticalSoldierAnimation.prototype.has=function(k){var m=this.entity.children[0];var n=this.map[k];return n&&m&&m.anim&&m.anim.baseLayer&&m.anim.baseLayer.states&&m.anim.baseLayer.states.indexOf(n)>=0?n:null;};
TacticalSoldierAnimation.prototype.gait=function(s,sp){
 var model=this.entity.children[0],states=model.anim.baseLayer.states,v=s.controlled&&s.vel&&Math.hypot(s.vel[0],s.vel[1])>.05?s.vel:this.travel||[0,0];
 var sn=Math.sin(s.lookYaw||0),cs=Math.cos(s.lookYaw||0),forward=-sn*v[0]-cs*v[1],side=cs*v[0]-sn*v[1];
 var sectors=['forward','forward_right','right','backward_right','backward','backward_left','left','forward_left'];
 var sector=Math.hypot(v[0],v[1])>.0001?(Math.round(Math.atan2(side,forward)/(Math.PI/4))+8)%8:0;
 var crouched=s.crouchAmt>.5,mode=crouched?'walk_crouching':sp>1.6?'run':'walk',clip='rifle__'+mode+'_'+sectors[sector];
 if(DreadingBodyAnimation.pistol(s)&&!crouched){var gaitMode=sp>1.6?'run':'walk',pistolClip='pistol__pistol_'+gaitMode+(forward<-.1?'_backward':'');if(Math.abs(side)>Math.abs(forward)*1.5)pistolClip='pistol__pistol_strafe'+(side<0?'_(2)':'');if(states.indexOf(pistolClip)>=0)clip=pistolClip;}
 if(states.indexOf(clip)<0)return null;
 this.rate=sp/(crouched?1:mode==='run'?(this.map.runSpeed||3.17):(this.map.walkSpeed||1));return clip;
};
TacticalSoldierAnimation.prototype.pick=function(s,T){
 var now=T.elapsed,sp=s.controlled?s.speedNow:(s.moving?s.speedNow:0);this.rate=1;
 // Repath/waypoint updates may report a single stopped frame. Do not restart the gait for those gaps.
 if(sp>.3){this.lastGaitAt=now;this.lastGaitSpeed=sp;}else if(!s.controlled&&!s.arms?.reload&&this.lastGaitAt!==undefined&&now-this.lastGaitAt<.12){sp=this.lastGaitSpeed;}

 if(!s.alive)return this.has('death')||this.current;
 if(now<(s.tossUntil||0)&&this.has('toss'))return this.has('toss');/* Riposte grenade throw (tactical-grenades botThrow / player throw sets tossUntil) */
 if(sp>0.3){var gait=this.gait(s,sp);if(gait)return gait;if(sp>1.6&&this.has('run')){this.rate=sp/(this.map.runSpeed||3.17);return this.map.run;}if(this.has('walk')){this.rate=sp/(this.map.walkSpeed||1);return this.map.walk;}return this.map.fallbackWalk||'walk';}
 if(now-(s.lastHitT||-9)<0.43&&this.has('hit'))return this.has('hit');
 if(s.arms&&s.arms.reload&&!this.upperBody){if(this.has('reload')){var rt=DreadingBodyAnimation.track(T,this.map.reload);this.rate=(rt?rt.duration:1.85)/Math.max(0.5,s.arms.reload.dur||2.1);return this.map.reload;}return s.crouchAmt>0.5?this.map.crouch:this.map.idle;}
 if(s.crouchAmt>0.5)return DreadingBodyAnimation.pistol(s)?'pistol__pistol_kneeling_idle':this.map.crouch;
 if(now-(s.lastShotT||-9)<0.3&&this.has('fire'))return this.has('fire');
 if((s.target||s.controlled||now-(s.lastShotT||-9)<4)&&this.has('aim'))return this.has('aim');
 return DreadingBodyAnimation.pistol(s)?'pistol__pistol_idle':this.map.idle;};
TacticalSoldierAnimation.prototype.update=function(dt){
 var T=TacticalCommon.ns(this.app),s=this.entity.script.tacticalSoldierDecision,model=this.entity.children[0];if(!s||!model||!model.anim)return;
 // Position deltas also work for replicated soldiers, whose local velocity is not simulated.
 var position=this.entity.getPosition(),previous=this.previousPosition;
 if(previous){var dx=position.x-previous[0],dz=position.z-previous[1],distance=Math.hypot(dx,dz);if(distance>.0001&&distance<2)this.travel=[dx,dz];}
 this.previousPosition=[position.x,position.z];
 // Retain the soldier record for feeding/reset, but retire the expired visual and its rig.
 if(s.alive&&this.corpseVisual){model.enabled=this.corpseVisual.enabled;model.anim.enabled=this.corpseVisual.animEnabled;this.corpseVisual=null;this.current='';this.fall=0;}
 if(!s.alive&&this.corpseVisual)return;
 if(T.paused){model.anim.speed=0;return;}
 if(!s.alive&&T.elapsed-(s.deathT??T.elapsed)>=12){this.corpseVisual={enabled:model.enabled,animEnabled:model.anim.enabled};model.anim.enabled=false;model.enabled=false;return;}
 this.upperBody=DreadingBodyAnimation.ensure(model,T);var clip=this.pick(s,T);if(this.upperBody&&s.alive&&s.arms.reload&&!(s.speedNow>.3&&(s.controlled||s.moving)))clip=s.crouchAmt>.5?this.map.crouch:(this.has('aim')||this.map.idle);
 if(clip&&clip!==this.current&&model.anim.baseLayer){var layer=model.anim.baseLayer,gaitChange=/run|walk|strafe/.test(clip)&&/run|walk|strafe/.test(this.current),phase=gaitChange?(layer.activeStateCurrentTime/Math.max(.001,layer.activeStateDuration))%1:null;this.current=clip;this.transitions++;try{layer.transition(clip,gaitChange?.035:clip===this.map.fire?.06:.08,phase);}catch(e){}}
 var want=this.rate||1,track=DreadingBodyAnimation.track(T,clip),settings=window.DreadingAnimationSettings;if(track&&/run|walk|strafe/.test(clip))want*=track.duration/(/run/.test(clip)?(settings?.runCycle||.65):(settings?.walkCycle||1));model.anim.speed=Math.max(0.1,Math.min(2.4,want));var tune=window.DreadingAnimationSettings;if(tune){var category=/reload/i.test(clip)?'reload':/run/i.test(clip)?'run':/walk/i.test(clip)?'walk':null;if(category)model.anim.speed*=tune[category];}this.lod(T,s,model,dt);DreadingBodyAnimation.update(model,s,T,dt,this.upperBody);if((s.moving||s.speedNow>0.3)&&s.alive){this.moveTime+=dt;if(want<0.5||want>2.4)this.rateClamped+=dt;}
 var act=model.anim.baseLayer&&model.anim.baseLayer.activeState;if(act&&T.running&&!T.paused)this.stats[act]=(this.stats[act]||0)+dt;
 var yawDeg=s.lookYaw*180/Math.PI;
 if(!s.alive){model.anim.playing=true;// procedural death: fall backwards over 0.6 s, sink after 8 s
  this.fall=Math.min(1,this.fall+dt/0.6);var since=T.elapsed-(s.deathT||0);
  this.entity.setEulerAngles(0,yawDeg,0);model.setLocalEulerAngles(this.has('death')?0:-88*this.fall*this.fall,0,0);model.setLocalPosition(0,since>8?-Math.min(1,(since-8)*0.3):0,0);return;}
 this.fall=0;model.setLocalPosition(0,0,0);
 var fl=s.flinchT>0&&!this.has('hit')?s.flinchT/0.3:0;model.setLocalEulerAngles(-9*fl,0,0);// procedural hit flinch
 this.entity.setEulerAngles(0,yawDeg,0);
};

/* opt clone: animation LOD for AI soldiers (same scheme as the zombies' pass-4b LOD): on-screen < 25 m every frame, 25-50 m every 2nd,
   further every 3rd, off-screen every 6th. Skipped time is folded into the next evaluated frame so clips stay in sync. The player-controlled
   soldier and dead soldiers always animate every frame. Purely visual: no logic reads soldier bones. ?soldierlod=0 disables. */
TacticalSoldierAnimation.LOD={on:!/[?&]soldierlod=0/.test(typeof location!=='undefined'?location.search:''),near:25,mid:50,off:6};
TacticalSoldierAnimation.prototype.lod=function(T,s,model,dt){var L=TacticalSoldierAnimation.LOD,an=model.anim;
 if(!L.on||s.controlled||!s.alive){an.playing=true;this.lodAcc=0;if(L.on&&this._mis)this.shadowLod(true);return;}
 var cam=T.activeCamera||T.camera;if(!cam||!cam.camera){an.playing=true;return;}
 var p=this.entity.getPosition(),cp=cam.getPosition(),d=cp.distance(p),sph=TacticalSoldierAnimation._sph||(TacticalSoldierAnimation._sph=new pc.BoundingSphere(new pc.Vec3(),1.3));sph.center.set(p.x,p.y+0.9,p.z);
 var fr=cam.camera.frustum,on=!fr||fr.containsSphere(sph)>0,n=!on?L.off:d<L.near?1:d<L.mid?2:3;
 this.shadowLod(on);
 this.lodAcc=(this.lodAcc||0)+dt;if(n===1||((this.app.frame||0)+(s.uid||0))%n===0){an.playing=true;an.speed=an.speed*Math.min(8,this.lodAcc/Math.max(1e-4,dt));this.lodAcc=0;}else an.playing=false;};
/* opt clone: shadow-caster trim. Weapon sub-parts under 0.25 m (sights, small attachments, the zero-size flash part) stop casting into the
   directional cascades (their shadow is a few pixels under the soldier's own shadow), and an off-screen soldier stops casting altogether
   (the zombies already do this). Re-checked whenever the soldier's mesh-instance count changes (weapon swaps). ?soldierlod=0 disables. */
TacticalSoldierAnimation.prototype.shadowLod=function(on){var mis=this._mis;if(!this._misAt||this.app.frame-this._misAt>120){this._misAt=this.app.frame;mis=[];this.entity.findComponents('render').forEach(function(r){r.meshInstances.forEach(function(m){mis.push(m);});});
  if(!this._mis||mis.length!==this._mis.length){mis.forEach(function(m){if(m._optCast===undefined){var h=m.skinInstance?null:m.aabb.halfExtents;m._optCast=m.castShadow&&!(h&&Math.max(h.x,h.y,h.z)*2<0.25);}});this._shOn=null;}this._mis=mis;}
 if(this._shOn===on)return;this._shOn=on;for(var i=0;i<mis.length;i++){var m=mis[i];if(m._optCast!==undefined)m.castShadow=on&&m._optCast;}};

/* One masked upper-body layer, reusing loaded tracks. Legs/hips remain on the base gait. */
var DreadingBodyAnimation=window.DreadingBodyAnimation={
 pistol:function(s){return s.arms&&s.arms.def&&(s.arms.def.cat==='pistol'||s.arms.def.fam==='pistol');},
 track:function(T,name){if(!T.soldierGlb)return null;var cache=T.soldierGlb._bodyTracks;if(!cache){cache=T.soldierGlb._bodyTracks={};T.soldierGlb.resource.animations.forEach(function(a){cache[a.resource.name]=a.resource;});}return cache[name];},
 profiles:{rifleStand:'loose__Reloading',rifleCrouch:'loose__Reload_(1)',rifleMove:'loose__Reload',pistolStand:'loose__Reloading',pistolCrouch:'loose__Reload_(1)',pistolMove:'loose__Reload'},
 reloadClip:function(s,T){var state=s.crouchAmt>.5?'Crouch':s.speedNow>.3&&(s.controlled||s.moving)?'Move':'Stand',name=this.profiles[(this.pistol(s)?'pistol':'rifle')+state];return this.track(T,name)?name:'reload';},
 ensure:function(model,T){if(model._upperBody)return model._upperBody;if(!T.soldierGlb)return null;var aim=this.track(T,'aim_idle');if(!aim)return null;var mask={};aim.curves.forEach(function(c){c.paths.forEach(function(p){if(p.entityPath.some(function(n){return /(?:mixamorig:)?Spine/.test(n);}))mask[p.entityPath.join('/')]={value:true};});});if(!Object.keys(mask).length)return null;var layer=model.anim.addLayer('UpperBody',0,mask);layer.mask=mask;T.soldierGlb.resource.animations.filter(function(a){return /reload|aim_idle|pistol_idle|pistol_kneeling_idle/i.test(a.resource.name);}).forEach(function(a){layer.assignAnimation(a.resource.name,a.resource,1,false);});return model._upperBody={layer:layer,clip:null,time:0,reload:null};},
 update:function(model,s,T,dt,state){if(!state)return;var layer=state.layer,action=T.elapsed<(s.tossUntil||0)||!s.alive;var weight=action?0:1;if(layer.weight!==weight)layer.weight=weight;if(action){layer.playing=false;return;}var reload=s.arms.reload,clip=reload?this.reloadClip(s,T):(this.pistol(s)?(s.crouchAmt>.5?'pistol__pistol_kneeling_idle':'pistol__pistol_idle'):'aim_idle'),track=this.track(T,clip);if(!track)return;if(state.clip!==clip||reload&&(!state.reload||reload.t<state.reloadT-.1)){layer.transition(clip,0);state.clip=clip;state.time=reload?Math.max(0,reload.t||0)/Math.max(.5,reload.dur||s.arms.def.reload)*track.duration:0;}state.reload=!!reload;state.reloadT=reload?reload.t:0;var tune=window.DreadingAnimationSettings,rate=reload?track.duration/Math.max(.5,reload.dur||s.arms.def.reload)*(tune?tune.reload:1):1;state.time+=Math.min(dt,.05)*rate;layer.playing=false;if(!model.anim.playing)return;layer.activeStateCurrentTime=reload?Math.min(track.duration-.001,state.time):state.time%Math.max(.01,track.duration);}
};
