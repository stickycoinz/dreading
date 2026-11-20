/* tacticalRtsInput: overhead RTS camera, selection, right-click orders and direct (first-person) control.
   Camera starts in the overhead home view (60 deg down over the friendly squad).
   Overhead: WASD/arrows/edge pan, Q/E rotate, scroll dolly, MMB-drag pan, RMB-drag look (+WASD fly), Alt+LMB orbit,
   F frame selection, Home/Backspace home view. LMB select / box select, Shift add, 1/2/3 groups, Ctrl+digit save group.
   RMB click: ground = move (reserved spots), wall/crate = take cover there. T: direct control.
   Direct control uses NIGHT_SURVIVAL controller numbers (fps_port_plan / 07c-controller.js, 08-player.js):
   look 0.0021 rad/count, pitch clamp 1.5, MOVE_SPEED 4.75 x M4 0.95, sprint x1.55 forward only, crouch x0.6, ADS x0.58,
   accel damp 16.5, eye 1.62/1.12 (damp 12), FOV 62 x adsFov 0.72, recoil recovery after 0.1 s returning the Riposte per-category share at 7/s.
   FP pass (2026-11-16): arms-only viewmodel (torso/head/legs triangles dropped at load) in its own layer + camera (near 0.01, depth
   cleared) anchored to the head bone; world near clip 0.1; walk clip when walking, run only when sprinting, procedural shot kick
   (no per-shot fire clip); viewmodel shaders prewarmed at load; eye height on a critically damped spring; HUD writes only on change;
   no layout reads per frame. Riposte port: weapons 1/2 + [ ] (cycle arsenal), G grenade (hold = cook, arc), Z grenade type,
   B pilot an FPV drone, U recon drone at the aim point. Overhead: J grenade order (Shift+J smoke), K FPV drone, U recon drone. */
var TacticalRtsInput=pc.createScript('tacticalRtsInput');
TacticalRtsInput.attributes.add('homePitch',{type:'number',default:60,title:'Home view pitch (deg down)'});
TacticalRtsInput.attributes.add('homeDistance',{type:'number',default:42,title:'Home view distance (m)'});
TacticalRtsInput.attributes.add('edgePan',{type:'boolean',default:true,title:'Edge pan'});
TacticalRtsInput.attributes.add('sensitivity',{type:'number',default:1,title:'FPS mouse sensitivity (NS sens)'});
TacticalRtsInput.prototype.initialize=function(){
 var T=TacticalCommon.ns(this.app),self=this;T.input=this;T.selection=[];this.groups={};this.keys={};this.mouse={x:-1,y:-1,inside:false};this.drag=null;
 this.cam={pos:new pc.Vec3(-20,35,-35),yaw:-2.5,pitch:-1.05};this.fps=null;this.preview=[];
 var c=this.app.graphicsDevice.canvas;c.addEventListener('contextmenu',function(e){e.preventDefault();});
 this.h={
  kd:function(e){if(window.DreadingSettings)e=DreadingSettings.mapEvent(e,!!self.fps);if(self.fps){e.preventDefault();e.stopPropagation();self.keys[e.code]=true;self.onKey(e);return;}
   var tg=e.target;if(tg&&tg.tagName==='TEXTAREA')return;if(tg&&tg.tagName==='INPUT'){/* fix150: checkboxes never eat hotkeys; a number field keeps digits/editing keys only, any other key (T, F, P...) leaves the field and acts as a hotkey */var ty=(tg.type||'text').toLowerCase();if(ty==='text'||ty==='search')return;if(ty==='number'&&/^(Digit|Numpad)|^(Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Minus|Period|Tab|Home|End|Enter|Escape)$/.test(e.code))return;if(tg.blur)tg.blur();}if(e.code==='Space')e.preventDefault();self.keys[e.code]=true;self.onKey(e);},
  ku:function(e){if(window.DreadingSettings)e=DreadingSettings.mapEvent(e,!!self.fps);if(self.fps||e.code==='Space')e.preventDefault();self.keys[e.code]=false;if(self.fps&&e.code==='KeyG'){var G=TacticalCommon.ns(self.app).grenades;if(G)G.release(self);}},
  md:function(e){self.onDown(e);},mu:function(e){self.onUp(e);},mm:function(e){self.onMove(e);},
  wh:function(e){e.preventDefault();self.onWheel(e);},
  leave:function(){self.mouse.inside=false;},enter:function(){self.mouse.inside=true;},
  plc:function(){if(document.pointerLockElement!==c&&self.fps&&!self.fps.wantLock)self.exitControl('pointer lock released');if(self.fps)self.fps.wantLock=false;},
  blur:function(){self.keys={};},
  rs:function(){self.cssH=self.app.graphicsDevice.canvas.clientHeight||800;}};
 window.addEventListener('keydown',this.h.kd,true);window.addEventListener('keyup',this.h.ku,true);window.addEventListener('blur',this.h.blur);window.addEventListener('resize',this.h.rs);this.h.rs();this.hud=null;
 c.addEventListener('mousedown',this.h.md);window.addEventListener('mouseup',this.h.mu);window.addEventListener('mousemove',this.h.mm);c.addEventListener('wheel',this.h.wh,{passive:false});
 c.addEventListener('mouseleave',this.h.leave);c.addEventListener('mouseenter',this.h.enter);document.addEventListener('pointerlockchange',this.h.plc);
 this.on('destroy',function(){window.removeEventListener('keydown',self.h.kd,true);window.removeEventListener('keyup',self.h.ku,true);window.removeEventListener('mouseup',self.h.mu);window.removeEventListener('mousemove',self.h.mm);document.removeEventListener('pointerlockchange',self.h.plc);});
};
TacticalRtsInput.prototype.friendlies=function(){return TacticalCommon.ns(this.app).squad.filter(function(s){return s.team==='friendly'&&s.alive;});};
/* ---------- camera ---------- */
TacticalRtsInput.prototype.dir=function(){var cp=Math.cos(this.cam.pitch);return new pc.Vec3(-Math.sin(this.cam.yaw)*cp,Math.sin(this.cam.pitch),-Math.cos(this.cam.yaw)*cp);};
TacticalRtsInput.prototype.apply=function(){var T=TacticalCommon.ns(this.app);if(!T.camera||this.fps)return;var p=this.cam.pos;T.camera.setPosition(p);T.camera.setEulerAngles(this.cam.pitch*180/Math.PI,this.cam.yaw*180/Math.PI,0);if(T.camera.camera.fov!==55)T.camera.camera.fov=55;};
TacticalRtsInput.prototype.groundAhead=function(){var d=this.dir(),p=this.cam.pos;if(d.y>-0.05)return new pc.Vec3(p.x+d.x*30,0,p.z+d.z*30);var t=-p.y/d.y;return new pc.Vec3(p.x+d.x*t,0,p.z+d.z*t);};
TacticalRtsInput.prototype.lookFrom=function(center,dist,pitchDeg){this.cam.pitch=-pitchDeg*Math.PI/180;var d=this.dir();this.cam.pos.set(center[0]-d.x*dist,center[1]-d.y*dist,center[2]-d.z*dist);this.apply();};
TacticalRtsInput.prototype.centroid=function(list){var c=[0,0,0];list.forEach(function(s){var p=s.pos();c[0]+=p[0]/list.length;c[1]+=p[1]/list.length;c[2]+=p[2]/list.length;});return c;};
TacticalRtsInput.prototype.home=function(){if(this.fps)this.exitControl('home');var T=TacticalCommon.ns(this.app),fr=this.friendlies();var c=fr.length?this.centroid(fr):[-10,0,-11];
 var obj=T.orders?T.orders.objective():[10,0,0];this.cam.yaw=Math.atan2(-(obj[0]-c[0]),-(obj[2]-c[2]));this.lookFrom(c,this.homeDistance,this.homePitch);};
TacticalRtsInput.prototype.frame=function(){var sel=(TacticalCommon.ns(this.app).selection||[]).filter(function(s){return s.alive;});if(!sel.length)return this.home();var c=this.centroid(sel),r=0;sel.forEach(function(s){var p=s.pos();r=Math.max(r,Math.hypot(p[0]-c[0],p[2]-c[2]));});this.lookFrom(c,Math.max(22,r*3+14),this.homePitch);};
TacticalRtsInput.prototype.orbit=function(dyaw,dpitch){var g=this.groundAhead(),p=this.cam.pos,v=new pc.Vec3().sub2(p,g),dist=v.length();this.cam.yaw+=dyaw;this.cam.pitch=Math.max(-1.45,Math.min(-0.15,this.cam.pitch+dpitch));var d=this.dir();p.set(g.x-d.x*dist,g.y-d.y*dist,g.z-d.z*dist);this.apply();};
/* ---------- picking ---------- */
TacticalRtsInput.prototype.ray=function(x,y){var T=TacticalCommon.ns(this.app),cam=T.camera.camera,a=cam.screenToWorld(x,y,cam.nearClip),b=cam.screenToWorld(x,y,cam.farClip),d=new pc.Vec3().sub2(b,a).normalize();return {o:[a.x,a.y,a.z],d:[d.x,d.y,d.z]};};
TacticalRtsInput.prototype.pickWorld=function(x,y){var T=TacticalCommon.ns(this.app),r=this.ray(x,y),h=TacticalCommon.rayWorld(r.o,r.d,800,T.perception.blockers);
 if(!h){if(r.d[1]>=0)return null;var t=-r.o[1]/r.d[1];return {point:[r.o[0]+r.d[0]*t,0,r.o[2]+r.d[2]*t],kind:'walkable',name:'(plane)'};}
 var p=[r.o[0]+r.d[0]*h.t,r.o[1]+r.d[1]*h.t,r.o[2]+r.d[2]*h.t];return {point:p,kind:h.shape.kind,name:h.shape.name,normal:h.n};};
TacticalRtsInput.prototype.screen=function(s){var T=TacticalCommon.ns(this.app),p=s.pos(),v=T.camera.camera.worldToScreen(new pc.Vec3(p[0],p[1]+1.0,p[2]));return v;};
TacticalRtsInput.prototype.pickSoldier=function(x,y){var best=null,bd=30,self=this;this.friendlies().forEach(function(s){var v=self.screen(s);if(v.z<0)return;var d=Math.hypot(v.x-x,v.y-y);if(d<bd){bd=d;best=s;}});return best;};
TacticalRtsInput.prototype.select=function(list,add){var T=TacticalCommon.ns(this.app),C=TacticalCommon;list=list.filter(function(s){return s&&s.alive&&s.team==='friendly';});var lead=list[0],expanded=C.expandSquads(T,list);T.selection=T.selection||[];
 if(add){var remove=expanded.length&&expanded.every(function(s){return T.selection.indexOf(s)>=0;});if(remove)T.selection=T.selection.filter(function(s){return expanded.indexOf(s)<0;});else expanded.forEach(function(s){if(T.selection.indexOf(s)<0)T.selection.push(s);});}else T.selection=expanded;
 if(lead){T.commandSquad=lead.squadKey;this.controlCandidate=lead;}return T.selection;};
TacticalRtsInput.prototype.activeSquad=function(){var T=TacticalCommon.ns(this.app),fr=this.friendlies(),lead=this.fps?this.fps.s:(T.selection||[])[0]||fr.find(function(s){return s.squadKey===T.commandSquad;})||fr[0];return TacticalCommon.squadMembers(T,lead);};
/* ---------- orders ---------- */
TacticalRtsInput.prototype.command=function(x,y){var T=TacticalCommon.ns(this.app),sel=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled;});if(!sel.length)return null;
 var foe=this.pickHostile(x,y);if(foe){T.orders.focusFire(sel,foe,'rts');var fp=foe.pos();this.flash(fp,'focus');return {focus:foe,members:sel.length};}/* pass D: right-click a zombie / enemy = focus fire */
 var hit=this.pickWorld(x,y);if(!hit)return null;
 // Building clicks expose floor orders while hostile and ground commands remain available.
 if(!this.fps&&T.orders.buildingNear&&T.orders.buildingFloors){var bn=T.orders.buildingNear(hit.point,.15),F=bn&&T.orders.buildingFloors(bn.ref);if(F&&F.ok&&F.floors.length){this.openFloors(F,sel,sel.map(function(s){return s.soldierName;}).join(', '),false,x,y);return {floorPicker:true,building:bn.ref};}}
 this.closeFloors(true);
 var out;if(T.navigation&&T.navigation.nav)T.navigation.nav.lastPathDebug=null;
 if(hit.kind==='coverLow'||hit.kind==='coverTall'){out=T.orders.takeCover(sel,hit.name,hit.point);this.flash(hit.point,'cover');}
 else{out=T.orders.moveGroup(sel,hit.point);this.flash(hit.point,'move');}
 this.preview={until:T.elapsed+3,items:out||[]};
 // Debug: orange raw click, cyan Recast-snapped destination, amber displacement.
 // Enabled only during order preview, with no extra path calculations.
 var navDbg=T.navigation&&T.navigation.nav&&T.navigation.nav.lastPathDebug;
 this.clickNavDebug={raw:hit.point.slice(),snap:navDbg&&navDbg.snappedEnd?navDbg.snappedEnd.slice():null,
  route:navDbg,until:T.elapsed+4};
 if(!out||!out.length||out.some(function(o){return o.failed;}))
  this.toast(out&&out.some(function(o){return o.failed;})?out.filter(function(o){return o.failed;})[0].error:'No safe navmesh destination near the click');
 if(navDbg&&navDbg.issue)console.warn('[TacticalNav] Click rejected',navDbg);
 return {hit:hit,orders:out};};
/* pass D: hostile under the cursor by screen projection (chest height), within 28 px; nearest on screen wins */
TacticalRtsInput.prototype.hostiles=function(){var T=TacticalCommon.ns(this.app);return T.squad.filter(function(s){return s.alive&&s.team!=='friendly';}).concat((T.zombies||[]).filter(function(z){return z.alive;}));};
TacticalRtsInput.prototype.pickHostile=function(x,y){var T=TacticalCommon.ns(this.app),cam=T.camera.camera,best=null,bd=28,v=new pc.Vec3();this.hostiles().forEach(function(e){var p=e.pos();cam.worldToScreen(new pc.Vec3(p[0],p[1]+1.0,p[2]),v);if(v.z<0)return;var d=Math.hypot(v.x-x,v.y-y);if(d<bd){bd=d;best=e;}});return best;};
/* pass D: in first person, F orders the follow squad to focus whatever is under the crosshair (one aim ray, on key press only) */
TacticalRtsInput.prototype.fpsFocus=function(){var T=TacticalCommon.ns(this.app),NS=TacticalNS,f=this.fps;if(!f)return null;var s=f.s,eye=NS.entEye(s),d=NS.fwd(f.yaw,f.pitch);
 var w=TacticalCommon.rayWorld(eye,d,200,T.perception.blockers),eh=NS.rayEntities(eye,d,w?w.t:200,s,this.hostiles(),false,0.5);if(!eh)return null;
 var grp=T.orders.follow?T.orders.follow.members:this.activeSquad();grp=grp.filter(function(o){return o!==s&&o.alive&&!o.controlled;});if(!grp.length)return null;
 T.orders.focusFire(grp,eh.ent,'fp');this.flash(eh.ent.pos(),'focus');return eh.ent;};
TacticalRtsInput.prototype.flash=function(p,kind){this.marker={p:p,kind:kind,t:performance.now()};};
/* ---------- input handlers ---------- */
TacticalRtsInput.prototype.onKey=function(e){var T=TacticalCommon.ns(this.app),k=e.code;
 if(this.floorPick&&this.floorKey(e))return;/* Task 8: floor picker owns Esc / digits / H / Enter while open */
 if(this.fps){var fs=this.fps.s,NS=TacticalNS,piloting=T.drones&&T.drones.pilot&&T.drones.pilot.d.owner===fs;
  if(k==='KeyT'||k==='Escape'){this.exitControl('key');e.preventDefault();return;}
  if(k==='Tab'){e.preventDefault();if(!e.repeat)this.cycleControl(e.shiftKey?-1:1);return;}/* 2026-11-18: Tab / Shift+Tab jump to the next / previous squad member */
  if(e.altKey&&/^Digit[1-9]$/.test(k)){e.preventDefault();if(!e.repeat)this.controlIndex(+k.slice(5)-1);return;}/* Alt+1..6: jump straight to that squad card */
  if(piloting)return;/* WASD / Space / Ctrl / Shift fly the drone (fpsTick reads the keys) */
  if(k==='KeyR')fs.input.reload=true;else if(k==='KeyC')fs.wantCrouch=!fs.wantCrouch;else if(k==='Space'&&!e.repeat)this.fps.jump=true;else if(k==='KeyF'&&!e.repeat)this.fpsFocus();
  else if((k==='Digit1'||k==='Digit2')&&!e.repeat){if(NS.switchArms)NS.switchArms(fs,k==='Digit1'?0:1);}
  else if((k==='BracketLeft'||k==='BracketRight')&&!e.repeat)this.cycleWeapon(k==='BracketRight'?1:-1);
  else if(k==='KeyG'&&!e.repeat){if(T.grenades)T.grenades.cook(this);}
  else if(k==='KeyZ'&&!e.repeat)this.cycleNade();
  else if(k==='KeyB'&&!e.repeat){if(T.drones&&T.drones.launchFpv(fs,true))this.toast('FPV drone up - WASD fly, Space/Ctrl up/down, Shift boost, click: detonate');else this.toast('One FPV drone at a time');}
  else if(k==='KeyU'&&!e.repeat)this.reconAtAim();
  else if(k==='KeyH'&&!e.repeat)this.fpFloorOrder();
  return;}
 if(k==='Tab'){e.preventDefault();if(!e.repeat)this.cycleControl(e.shiftKey?-1:1);return;}
 if(e.altKey&&/^Digit[1-9]$/.test(k)){e.preventDefault();if(!e.repeat)this.controlIndex(+k.slice(5)-1);return;}
 if(/^Digit[1-9]$/.test(k)){var n=k.slice(5),fr=this.friendlies();if(e.ctrlKey){this.groups[n]=T.selection.slice();e.preventDefault();return;}
  var g=this.groups[n]||TacticalCommon.squadGroups(T,'friendly')[+n-1]||[];this.select(g,e.shiftKey);return;}
 if(k==='KeyF')this.frame();else if(k==='Home'||k==='Backspace'){this.home();e.preventDefault();}
 else if(k==='KeyI')T.initiative=!T.initiative;else if(k==='KeyP'||k==='Pause')T.paused=!T.paused;
 else if(k==='KeyL'&&!e.repeat)this.powerAtCursor();
 else if(k==='KeyT')this.enterControl(this.controlTarget());
 else if((k==='KeyJ'||k==='KeyK'||k==='KeyU')&&!e.repeat)this.equipOrder(k,e.shiftKey);
 else if(k==='KeyG'&&e.shiftKey&&!e.repeat){this._directG=true;try{this.squadOrder('assault',this.mouse.x,this.mouse.y);}finally{this._directG=false;}}
 else if((k==='KeyG'||k==='KeyV'||k==='KeyX')&&!e.repeat)this.squadOrder(k==='KeyG'?'assault':k==='KeyV'?'defend':'suppress',this.mouse.x,this.mouse.y);
};
/* M5: squad orders at the cursor. G: assault the building under the cursor, V: defend the area, X: suppress the hostile / point */
TacticalRtsInput.prototype.squadOrder=function(kind,x,y){var T=TacticalCommon.ns(this.app),C=TacticalCommon,self=this;if(!C.AI.on){this.toast('Squad orders need the AI (remove ?ai=0)');return null;}
 /* M5b: the selected soldiers, or the whole squad when nothing is selected */
 var sel=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled&&s.team==='friendly';}),all=!sel.length;if(all)sel=this.activeSquad().filter(function(s){return s.alive&&!s.controlled;});if(!sel.length){this.toast('No soldiers available');return null;}
 var who=all?'whole squad':sel.length===this.friendlies().filter(function(s){return s.alive;}).length?'whole squad':sel.map(function(s){return s.soldierName;}).join(', ');
 var foe=kind==='suppress'?this.pickHostile(x,y):null,hit=foe?null:this.pickWorld(x,y);if(!foe&&!hit){this.toast('Point the cursor at the ground or a building first');return null;}var p=foe?foe.pos():hit.point,b=null;
 if(kind==='assault'){var bn=T.orders.buildingNear(p,8);if(!bn){this.toast('No building within 8 m of the cursor - point at a building and press G');return null;}
  if(!this._directG){var FL=T.orders.buildingFloors?T.orders.buildingFloors(bn.ref):null;if(FL&&FL.ok&&FL.floors.length>1){this.openFloors(FL,sel,who,false,x,y);return null;}}/* Task 8: floor picker (Shift+G: straight full assault) */
  b=T.orders.startBrain('assault',sel,{building:bn.ref,by:'player',reason:'G key'});if(!b||b.status==='fail'){this.toast('Cannot assault '+bn.name+': '+(b?b.why.replace('cannot assault: ',''):'no soldiers'));this.outline={rect:bn.rect,t:performance.now(),bad:true};return b;}
  this.outline={rect:bn.rect,t:performance.now(),y:b.building&&b.building.floorY||0};this.toast('Assault '+bn.name+' - '+who+' ('+b.members.length+')');}
 else if(kind==='defend'){b=T.orders.startBrain('defend',sel,{point:p,by:'player',reason:'V key'});this.toast('Defend area (10 m) - '+who+' ('+(b?b.members.length:0)+')');this.area={p:p,r:b?b.area:10,t:performance.now()};}
 else{b=T.orders.startBrain('suppress',sel,{point:p,target:foe,by:'player',reason:'X key'});this.toast('Suppress '+(foe?(foe.soldierName||'zombie'):'that point')+' - '+who+' ('+(b?b.members.length:0)+')');}
 if(b)T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'player order '+kind+' ('+who+')'});
 this.flash(p,kind==='assault'?'move':kind==='defend'?'cover':'focus');return b;};
/* ---- Task 8: floor picker. Overhead: G at a building lists its floors (roof first); hover highlights the floor and cuts the floors
   above it (x-ray floor cut), click / 1-9 sends the selection (or the whole squad) to clear + hold that floor with the existing brain
   (ground: clear ground + hold; 2nd: the full clear; 3rd / roof: full clear, climb, hold). First person: H at a building opens the same
   list for the squad; H cycles, Enter or 1-9 sends, Esc closes. ---- */
TacticalRtsInput.prototype.openFloors=function(F,sel,who,fp,x,y){var self=this;this.closeFloors(true);var d=document.createElement('div');d.id='tl-floorpick';
 d.style.cssText='position:fixed;z-index:40;min-width:190px;font:12px/1.4 sans-serif;color:#eef;background:rgba(12,16,20,.9);border:1px solid #6cf;border-radius:5px;padding:6px;user-select:none';
 var W=window.innerWidth,H=window.innerHeight;if(fp){d.style.left=(W/2+40)+'px';d.style.top=(H/2-60)+'px';}else{d.style.left=Math.min(W-210,(x||0)+14)+'px';d.style.top=Math.min(H-40-26*F.floors.length,(y||0)-10)+'px';}
 var t=document.createElement('div');t.textContent=(who||'Squad')+' -> '+F.name+':';t.style.cssText='font-weight:bold;margin-bottom:4px;color:#9df';d.appendChild(t);
 F.floors.slice().reverse().forEach(function(f){var b=document.createElement('div');b.dataset.i=f.i;b.textContent=(f.i+1)+'  '+f.label+'  ('+f.y.toFixed(1)+' m)';b.style.cssText='padding:3px 6px;cursor:pointer;border-radius:3px';
  b.onmouseenter=function(){self.floorHover(f.i);};b.onmouseleave=function(){if(!self.floorPick||!self.floorPick.fp)self.floorHover(null);};b.onmousedown=function(ev){ev.stopPropagation();ev.preventDefault();self.floorSend(f.i);};d.appendChild(b);});
 var h=document.createElement('div');h.textContent=fp?'H: next   Enter / 1-'+F.floors.length+': send   Esc: cancel':'click / 1-'+F.floors.length+': send   Esc: cancel';h.style.cssText='margin-top:4px;color:#8a9;font-size:11px';d.appendChild(h);
 document.body.appendChild(d);this.floorPick={F:F,sel:sel,who:who,fp:!!fp,el:d,hover:null,t:performance.now()};if(fp)this.floorHover(F.floors.length-1);
 TacticalCommon.ns(this.app).events.push({time:+TacticalCommon.ns(this.app).elapsed.toFixed(2),soldier:'-',decision:'floor picker: '+F.name+' ('+F.floors.map(function(f){return f.label;}).join(', ')+')'});return this.floorPick;};
TacticalRtsInput.prototype.floorHover=function(i){var P=this.floorPick,T=TacticalCommon.ns(this.app);if(!P)return;P.hover=i;
 Array.prototype.forEach.call(P.el.querySelectorAll('[data-i]'),function(b){b.style.background=+b.dataset.i===i?'rgba(80,190,255,.35)':'';});
 if(T.xray&&T.xray.setFloorCut){if(i==null)T.xray.setFloorCut(null);else{var f=P.F.floors[i];T.xray.setFloorCut(P.F.rect,f.roof?f.y+30:f.y+2.2);}}};
TacticalRtsInput.prototype.floorSend=function(i){var P=this.floorPick,T=TacticalCommon.ns(this.app);if(!P)return null;var f=P.F.floors[i];if(!f)return null;
 var b=T.orders.startBrain('assault',P.sel,{building:P.F.ref,by:'player',reason:'Floor order - '+f.label,floor:f});
 if(!b||b.status==='fail'){this.toast('Cannot send to the '+f.label.toLowerCase()+': '+(b?b.why:'no soldiers'));}else{this.toast(f.label+' of '+P.F.name+' - '+P.who+' ('+b.members.length+')'+(b.warning?' · '+b.warning:''));this.outline={rect:P.F.rect,t:performance.now(),y:f.y};T.events.push({time:+T.elapsed.toFixed(2),soldier:'-',decision:'player order floor '+f.label+' ('+P.who+')'});}
 this.floorHover(i);this.floorCutUntil=performance.now()+3000;this.closeFloors(false);return b;};
TacticalRtsInput.prototype.closeFloors=function(clearCut){var P=this.floorPick,T=TacticalCommon.ns(this.app);if(P&&P.el)P.el.remove();this.floorPick=null;if(clearCut!==false&&T.xray&&T.xray.setFloorCut)T.xray.setFloorCut(null);};
TacticalRtsInput.prototype.floorKey=function(e){var P=this.floorPick,k=e.code,n=P.F.floors.length;
 if(k==='Escape'){this.closeFloors(true);e.preventDefault();return true;}
 if(/^Digit[1-9]$/.test(k)){var i=+k.slice(5)-1;if(i<n){this.floorSend(i);e.preventDefault();return true;}return true;}
 if(k==='KeyH'&&P.fp){this.floorHover(((P.hover==null?n:P.hover)-1+n)%n);return true;}
 if(k==='Enter'||k==='NumpadEnter'){if(P.hover!=null)this.floorSend(P.hover);return true;}
 return false;};
TacticalRtsInput.prototype.fpFloorOrder=function(){var T=TacticalCommon.ns(this.app),f=this.fps;if(!f||!T.orders||!T.orders.buildingFloors)return null;var p=this.aimPoint(80),bn=T.orders.buildingNear(p,6);if(!bn){this.toast('Aim at a building (H: floor order)');return null;}
 var sel=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled&&s.team==='friendly'&&s!==f.s;});sel=TacticalCommon.squadMembers(T,f.s).filter(function(s){return !s.controlled&&s!==f.s;});if(!sel.length){this.toast('No squadmates to send');return null;}
 var F=T.orders.buildingFloors(bn.ref);if(!F.ok){this.toast('Cannot enter '+bn.name+': '+F.why);return null;}return this.openFloors(F,sel,sel.length+' soldier'+(sel.length>1?'s':''),true);};
TacticalRtsInput.prototype.drawFloorPick=function(){var P=this.floorPick,app=this.app;var cut=P&&P.hover!=null?P:null;
 if(!cut&&this.floorCutUntil&&performance.now()>this.floorCutUntil){this.floorCutUntil=0;var T=TacticalCommon.ns(app);if(T.xray&&T.xray.setFloorCut&&!this.floorPick)T.xray.setFloorCut(null);}
 if(!cut)return;var f=P.F.floors[P.hover],R=P.F.rect,y=f.y+0.12,c=new pc.Color(0.3,0.85,1),a=new pc.Vec3(),b=new pc.Vec3(),L=function(p,q){a.set(p[0],p[1],p[2]);b.set(q[0],q[1],q[2]);app.drawLine(a,b,c,false);};
 for(var x=R[0];x<=R[2]+0.01;x+=(R[2]-R[0])/8)L([x,y,R[1]],[x,y,R[3]]);for(var z=R[1];z<=R[3]+0.01;z+=(R[3]-R[1])/6)L([R[0],y,z],[R[2],y,z]);
 f.pts.forEach(function(p){L([p[0],p[1]+0.1,p[2]],[p[0],p[1]+1.6,p[2]]);});};
/* M5b: short on-screen message under the top banner */
TacticalRtsInput.prototype.toast=function(text){var el=document.querySelector('#tl-toast');if(!el){el=document.createElement('div');el.id='tl-toast';el.style.cssText='position:absolute;left:50%;top:64px;transform:translateX(-50%);font:600 13px system-ui;color:#fff;background:#13212bcc;padding:5px 12px;border-radius:7px;z-index:11;pointer-events:none;transition:opacity .3s';document.body.appendChild(el);}
 el.textContent=text;el.style.opacity=1;clearTimeout(this._toastT);this._toastT=setTimeout(function(){el.style.opacity=0;},2600);this.lastToast=text;};
TacticalRtsInput.prototype.onDown=function(e){var c=this.app.graphicsDevice.canvas;
 if(this.fps){if(document.pointerLockElement!==c){this.fps.wantLock=true;c.requestPointerLock();}if(e.button===0){this.fps.fire=true;this.fps.firePressed=true;var D=TacticalCommon.ns(this.app).drones;if(D&&D.pilot&&D.pilot.d.owner===this.fps.s)D.pilot.d.boom=true;}if(e.button===2)this.fps.ads=true;if(e.button===1){this.fpRad={t:performance.now()};e.preventDefault();}return;}
 var ae=document.activeElement;if(ae&&ae!==c&&ae!==document.body&&ae.blur)ae.blur();/* fix150: clicking the world takes focus away from the panel (preventDefault below would otherwise leave it there) */var r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;this.drag={button:e.button,x0:x,y0:y,x:x,y:y,t:performance.now(),moved:false,alt:e.altKey,shift:e.shiftKey};e.preventDefault();};
TacticalRtsInput.prototype.onMove=function(e){var c=this.app.graphicsDevice.canvas;
 if(this.fps){if(document.pointerLockElement===c){var Hm=TacticalCommon.ns(this.app).hud;if(Hm&&Hm.radial){Hm.radialMove(e.movementX,e.movementY,false);return;}this.look(e.movementX,e.movementY);}return;}/* FP: no getBoundingClientRect (forced layout) per mouse move */
 var r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;this.mouse.x=x;this.mouse.y=y;this.mouse.inside=x>=0&&y>=0&&x<=r.width&&y<=r.height;
 var d=this.drag;if(!d)return;if(d.radial){var Hd=TacticalCommon.ns(this.app).hud;if(Hd)Hd.radialMove(x,y,true);d.x=x;d.y=y;return;}var dx=x-d.x,dy=y-d.y;d.x=x;d.y=y;if(Math.hypot(x-d.x0,y-d.y0)>6)d.moved=true;if(!d.moved)return;
 if(d.button===1){var h=Math.max(4,this.cam.pos.y)*0.0022,f=new pc.Vec3(-Math.sin(this.cam.yaw),0,-Math.cos(this.cam.yaw)),rt=new pc.Vec3(Math.cos(this.cam.yaw),0,-Math.sin(this.cam.yaw));this.cam.pos.add(rt.mulScalar(-dx*h)).add(f.mulScalar(dy*h));this.apply();}
 else if(d.button===2){this.cam.yaw-=dx*0.004;this.cam.pitch=Math.max(-1.5,Math.min(1.2,this.cam.pitch-dy*0.004));this.apply();}
 else if(d.button===0&&d.alt){this.orbit(-dx*0.006,-dy*0.004);}
 else if(d.button===0){var b=document.querySelector('#tl-box');b.style.display='block';var cr=c.getBoundingClientRect();b.style.left=(cr.left+Math.min(d.x0,x))+'px';b.style.top=(cr.top+Math.min(d.y0,y))+'px';b.style.width=Math.abs(x-d.x0)+'px';b.style.height=Math.abs(y-d.y0)+'px';}};
TacticalRtsInput.prototype.onUp=function(e){
 if(this.fps){if(e.button===0)this.fps.fire=false;if(e.button===2)this.fps.ads=false;if(e.button===1){var Hf=TacticalCommon.ns(this.app).hud;this.fpRad=null;if(Hf&&Hf.radial){var kf=Hf.closeRadial();if(kf)this.radialOrder(kf,null,null,e.shiftKey);}}return;}
 if(e.button===1&&this.drag&&this.drag.radial){var Hr=TacticalCommon.ns(this.app).hud,dr=this.drag;this.drag=null;var kr=Hr?Hr.closeRadial():null;if(kr)this.radialOrder(kr,dr.x0,dr.y0,e.shiftKey);return;}
 var d=this.drag;this.drag=null;if(!d||d.button!==e.button)return;document.querySelector('#tl-box').style.display='none';
 if(d.button===0&&!d.alt){if(d.moved){var x0=Math.min(d.x0,d.x),x1=Math.max(d.x0,d.x),y0=Math.min(d.y0,d.y),y1=Math.max(d.y0,d.y),self=this;this.select(this.friendlies().filter(function(s){var v=self.screen(s);return v.z>0&&v.x>=x0&&v.x<=x1&&v.y>=y0&&v.y<=y1;}),d.shift);}
  else{var s=this.pickSoldier(d.x0,d.y0);if(s)this.select([s],d.shift);else if(!d.shift)this.select([]);}}
 else if(d.button===2&&!d.moved&&performance.now()-d.t<400)this.command(d.x0,d.y0);};
TacticalRtsInput.prototype.onWheel=function(e){if(this.fps)return;var d=this.dir(),step=Math.max(1.5,this.cam.pos.y*0.12)*(e.deltaY>0?-1:1);var np=this.cam.pos.clone().add(d.clone().mulScalar(step));if(np.y<2.5||np.y>160)return;this.cam.pos.copy(np);this.apply();};
/* ---------- direct control ---------- */
TacticalRtsInput.FP={near:0.1,vmNear:0.01,vmFar:6,eyeW:14,eyeSnap:1.5};
TacticalRtsInput.prototype.enterControl=function(s){var T=TacticalCommon.ns(this.app);if(!s||!s.alive||s.team!=='friendly')return false;if(s.prepKit?.clsId==='artillery'){this.toast('Mortar operator: command in RTS and use Bombard to choose a target.');return false;}
 this.select([s],false);this.saved={pos:this.cam.pos.clone(),yaw:this.cam.yaw,pitch:this.cam.pitch};s.controlled=true;s.stop();T.cover.release(s);s.inCover=false;s.order={type:'player',by:'direct'};s.pitch=0;s.vel=[0,0];s.wantCrouch=false;s.target=null;s.yawV=0;s.pitchV=0;s.input.fire=false;
 if(T.orders)T.orders.cancelAssault([s]);if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
 var gy=s.pos()[1];this.fps={s:s,yaw:s.lookYaw,pitch:0,fire:false,firePressed:false,ads:false,sprintW:0,wantLock:true,eyeH:1.62,airY:0,vy:0,jump:false,kick:0,kickV:0,jumps:0,groundY:gy,eyeG:gy,eyeGv:0};if(s.model)s.model.enabled=false;
 /* FP fix: world near clip 0.1 (was 0.03 -> 20000:1 depth range shimmer); the arms render in their own layer/camera with near 0.01 */
 this.savedNear=T.camera.camera.nearClip;T.camera.camera.nearClip=TacticalRtsInput.FP.near;this.ensureViewmodel();if(this.vm){this.vm.enabled=true;this.vmCam.enabled=true;this.headRest=null;this.vmCorr=[0,0,0];}
 var c=this.app.graphicsDevice.canvas;try{var r=c.requestPointerLock({unadjustedMovement:true});if(r&&r.catch)r.catch(function(){try{c.requestPointerLock();}catch(e){}});}catch(e){try{c.requestPointerLock();}catch(e2){}}
 this.hudEls();this.hudCache={};this.hud.hud.style.display='block';if(T.look)T.look.setMode('fp');TacticalCommon.log(this.app,s,'Under direct control');if(T.orders&&T.orders.startFollow)T.orders.startFollow(s);return true;};
TacticalRtsInput.prototype.exitControl=function(why){var T=TacticalCommon.ns(this.app),f=this.fps;if(!f)return;this.fps=null;var s=f.s;if(T.orders&&T.orders.stopFollow)T.orders.stopFollow();s.controlled=false;s.speedNow=0;s.eyeY=null;s.airborne=false;if(s.model)s.model.enabled=true;
 if(this.vm){this.vm.enabled=false;this.vmCam.enabled=false;}if(this.savedNear)T.camera.camera.nearClip=this.savedNear;s.entity.setPosition(s.pos()[0],f.groundY!==undefined?f.groundY:s.pos()[1],s.pos()[2]);s.order={type:'move',dest:s.pos(),by:'player'};
 if(T.drones&&T.drones.pilot&&T.drones.pilot.d.owner===s){T.drones.pilot.d.ai=true;T.drones.pilot=null;}/* an FPV left behind flies on as a kamikaze */
 if(T.grenades&&T.grenades.held)T.grenades.held=null;this.flashed=null;
 if(document.pointerLockElement&&!this._switching)document.exitPointerLock();if(T.look)T.look.setMode('rts');if(T.hud&&T.hud.radial)T.hud.closeRadial();this.fpRad=null;this.hudEls();this.hud.hud.style.display='none';if(this.hud.veil)this.hud.veil.style.opacity=0;
 if(this.saved){this.cam.pos.copy(this.saved.pos);this.cam.yaw=this.saved.yaw;this.cam.pitch=this.saved.pitch;}this.apply();TacticalCommon.log(this.app,s,'Back to squad AI ('+why+')');};
/* 2026-11-18 squad member selection. The T target is the soldier last clicked (world or squad card), else the first selected,
   else the first alive squad member; its squad card shows a T marker. Tab / Shift+Tab cycle it (RTS) or switch the possessed soldier
   (FP, pointer lock kept); Alt+1..6 picks a squad card directly. Order = the squad cards (TacticalHUD.friendlies). */
TacticalRtsInput.prototype.squadList=function(){var T=TacticalCommon.ns(this.app);if(T.hud&&T.hud.friendlies)return T.hud.friendlies();return T.squad.filter(function(s){return s.team==='friendly'&&!s.disabled;});};
TacticalRtsInput.prototype.controlTarget=function(){var T=TacticalCommon.ns(this.app),list=this.squadList(),ok=function(s){return s&&s.alive&&!s.disabled&&s.team==='friendly'&&list.indexOf(s)>=0;};
 if(ok(this.controlCandidate))return this.controlCandidate;var sel=(T.selection||[]).filter(ok);if(sel.length)return sel[0];return list.filter(ok)[0]||null;};
TacticalRtsInput.prototype.switchControl=function(s){if(!this.fps||!s||s===this.fps.s)return false;this._switching=true;try{this.exitControl('switch soldier');}finally{this._switching=false;}var r=this.enterControl(s);
 var list=this.squadList();if(r)this.toast('Controlling '+s.soldierName+' ('+(list.indexOf(s)+1)+'/'+list.length+')  \u00b7  Tab: next  \u00b7  T: command view');return r;};
TacticalRtsInput.prototype.cycleControl=function(dir){var list=this.squadList(),alive=list.filter(function(s){return s.alive;});if(!alive.length){this.toast('No squad members alive');return null;}
 var cur=this.fps?this.fps.s:this.controlTarget(),i=list.indexOf(cur),n=list.length,next=null;
 for(var k=1;k<=n;k++){var c=list[((i<0?(dir>0?-1:0):i)+dir*k%n+n*2)%n];if(c&&c.alive&&c!==cur){next=c;break;}}
 if(!next){this.toast(this.fps?'No other squad member alive':'T: take control of '+(cur?cur.soldierName:'?'));return cur;}
 if(this.fps){this.switchControl(next);return next;}
 this.select([next],false);this.controlCandidate=next;this.toast('T: take control of '+next.soldierName+' ('+(list.indexOf(next)+1)+'/'+n+')  \u00b7  Tab: next');return next;};
TacticalRtsInput.prototype.controlIndex=function(i){var list=this.squadList(),s=list[i];if(!s){this.toast('No squad member '+(i+1));return null;}if(!s.alive){this.toast(s.soldierName+' is down');return null;}
 if(this.fps){if(s!==this.fps.s)this.switchControl(s);return s;}this.select([s],false);this.controlCandidate=s;return this.enterControl(s)?s:null;};
/* 2026-11-18 start-of-match view reset: the same state an FP enter + exit used to leave behind (RTS look mode re-applied, which
   re-applies the post stack / night lighting; world near clip; viewmodel and its camera off; pointer lock, held keys and stale
   edge-pan mouse cleared; HUD back to command view). Called when the local squad is applied and again after the pick screen closes. */
TacticalRtsInput.prototype.resetView=function(why){var T=TacticalCommon.ns(this.app);if(this.fps)this.exitControl(why||'reset view');
 this.keys={};this.drag=null;this.mouse.inside=false;if(T.camera&&this.savedNear)T.camera.camera.nearClip=this.savedNear;
 if(this.vmWarm){if(this.vm)this.vm.enabled=false;if(this.vmCam){this.vmCam.enabled=false;this.vmCam.camera.rect=new pc.Vec4(0,0,1,1);}}
 if(T.look&&T.look.setMode){T.look.setMode('fp');T.look.setMode('rts');}
 if(document.pointerLockElement)document.exitPointerLock();
 this.hudEls();if(this.hud&&this.hud.hud)this.hud.hud.style.display='none';if(this.hud&&this.hud.veil)this.hud.veil.style.opacity=0;
 if(T.camera&&T.camera.camera.fov!==55)T.camera.camera.fov=55;this.apply();this.viewResets=(this.viewResets||0)+1;return true;};
/* HUD element cache (FP fix: no querySelector per frame) */
TacticalRtsInput.prototype.hudEls=function(){if(this.hud&&this.hud.hud&&this.hud.hud.isConnected)return this.hud;var q=function(id){return document.querySelector(id);};
 var veil=q('#tl-veil');if(!veil){veil=document.createElement('div');veil.id='tl-veil';veil.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:8;opacity:0;background:#f4f4f0';document.body.appendChild(veil);}
 var cr=q('#tl-cross');this.hud={hud:q('#tl-hud'),cross:cr,bars:cr?cr.querySelectorAll('i.b'):[],ammo:q('#tl-ammo'),ctl:q('#tl-ctl'),veil:veil};return this.hud;};
TacticalRtsInput.prototype.setText=function(el,key,txt){if(el&&this.hudCache[key]!==txt){this.hudCache[key]=txt;el.textContent=txt;this.hudWrites=(this.hudWrites||0)+1;}};
/* Riposte arsenal: cycle the primary through every gun (try them all), grenade type */
TacticalRtsInput.prototype.cycleWeapon=function(dir){var f=this.fps;if(!f)return;var s=f.s,NS=TacticalNS,ids=Object.keys(NS.WEAPONS),cur=s.loadout?s.loadout[0].def.id:'m4',i=(ids.indexOf(cur)+dir+ids.length)%ids.length;
 var A=NS.makeArms(NS.WEAPONS[ids[i]]);if(!s.loadout)s.loadout=[s.arms,NS.makeArms(NS.WEAPONS.m9||NS.WEAPONS.m4)];var was=s.arms;s.loadout[0]=A;if(was===s.loadout[1]){NS.switchArms(s,0);}else{s.arms=A;s.armsIdx=0;A.switching=NS.SWITCH?NS.SWITCH.dur:0.44;}
 this.toast(A.def.name+(A.def.src&&A.def.src!=='riposte'?' ('+A.def.src+')':'')+' - '+A.def.mag+' rds, '+(A.def.pellets?A.def.pellets+' pellets, ':'')+(A.def.bipod?'bipod (crouch + still), ':'')+(A.def.bolt?'bolt, ':'')+(A.def.tube?'tube reload, ':'')+(A.def.auto?'auto':'semi'));};
TacticalRtsInput.prototype.cycleNade=function(){var s=this.fps&&this.fps.s,O=TacticalGrenades.ORDER;if(!s||!s.nadeInv)return;var i=O.indexOf(s.nadeSel||'frag');for(var k=1;k<=O.length;k++){var t=O[(i+k)%O.length];if(s.nadeInv[t]>0||k===O.length){s.nadeSel=t;break;}}this.toast('Grenade: '+s.nadeSel+' ('+(s.nadeInv[s.nadeSel]||0)+')');};
TacticalRtsInput.prototype.aimPoint=function(maxD){var T=TacticalCommon.ns(this.app),f=this.fps,eye=TacticalNS.entEye(f.s),d=TacticalNS.fwd(f.yaw,f.pitch),w=TacticalCommon.rayWorld(eye,d,maxD||120,T.perception.blockers);
 if(w)return [eye[0]+d[0]*w.t,eye[1]+d[1]*w.t,eye[2]+d[2]*w.t];if(d[1]<-0.02){var t=(eye[1]-f.groundY)/-d[1];if(t<(maxD||120))return [eye[0]+d[0]*t,f.groundY,eye[2]+d[2]*t];}return [eye[0]+d[0]*40,f.groundY,eye[2]+d[2]*40];};
TacticalRtsInput.prototype.reconAtAim=function(){var T=TacticalCommon.ns(this.app);if(!T.drones)return null;var p=this.aimPoint(150),d=T.drones.launchRecon(this.fps.s,p);this.toast(d?'Recon drone: orbiting the aim point, contacts shared with the squad every 3 s':'No recon drone');return d;};
/* overhead equipment orders at the cursor: J grenade (Shift+J smoke), K FPV kamikaze drone, U recon drone */
TacticalRtsInput.prototype.equipOrder=function(k,shift){var T=TacticalCommon.ns(this.app),team=this.commandTeam||'friendly',sel=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled&&s.team===team;}),s=sel[0]||this.friendlies().filter(function(o){return !o.controlled;})[0];if(!s){this.toast('No soldier available');return null;}
 var hit=this.pickWorld(this.mouse.x,this.mouse.y);
 if(k==='KeyJ'){var G=T.grenades,ty=shift?'smoke':'frag';if(!G||!hit){this.toast('Point at the ground first');return null;}if(!(s.nadeInv&&s.nadeInv[ty]>0)){this.toast(s.soldierName+' has no '+ty+' left');return null;}
  var pt=hit.point,me=s.pos(),d=Math.hypot(pt[0]-me[0],pt[2]-me[2]);if(d>32){this.toast('Too far to throw ('+d.toFixed(0)+' m > 32 m)');return null;}if(!G.nadeClear(s,pt)){this.toast('No clear throwing arc from '+s.soldierName);return null;}
  s.lookYaw=Math.atan2(-(pt[0]-me[0]),-(pt[2]-me[2]));var n=G.botThrow(s,pt,ty);this.flash(pt,'focus');this.toast(s.soldierName+': '+ty+' out ('+d.toFixed(0)+' m)');return n;}
 if(k==='KeyK'){var dr=T.drones&&T.drones.launchFpv(s,false);this.toast(dr?s.soldierName+': FPV kamikaze drone launched (dives on the nearest hostile)':'One FPV drone per operator');return dr;}
 if(k==='KeyU'){var rd=T.drones&&hit&&T.drones.launchRecon(s,hit.point);this.toast(rd?s.soldierName+': recon drone over the cursor (shares contacts every 3 s)':'Point at the ground first');return rd;}};
TacticalRtsInput.prototype.fpsTick=function(dt){var T=TacticalCommon.ns(this.app),NS=TacticalNS,f=this.fps,s=f.s,A=s.arms,K=this.keys,FP=TacticalRtsInput.FP;
 if(!s.alive){this.exitControl('killed');return;}
 s.controlled=true;s.target=null;s.lookYaw=f.yaw;s.pitch=f.pitch;// nothing else may steer the controlled soldier
 var D=T.drones,pil=D&&D.pilot&&D.pilot.d.owner===s?D.pilot:null;
 if(pil){/* Riposte fpvPlayer/fpvCamera: the body stays put, the camera rides the drone */
  D.pilotInput(K,f.yaw,f.pitch);s.vel[0]=s.vel[1]=0;s.speedNow=0;var dp=pil.d.pos;T.camera.setPosition(dp[0],dp[1],dp[2]);T.camera.setEulerAngles(f.pitch*180/Math.PI,f.yaw*180/Math.PI,pil.d.roll*0.6*57.3);
  if(this.vm){this.vm.enabled=false;}T.camera.camera.fov+=(80-T.camera.camera.fov)*Math.min(1,dt*10);
  this.setText(this.hud.ammo,'ammo','FPV '+Math.max(0,TacticalDrones.FPV.life-pil.d.t).toFixed(0)+' s  HP '+Math.max(0,pil.d.hp).toFixed(0));
  this.setText(this.hud.ctl,'ctl','Piloting FPV drone - WASD fly where you look, Space/Ctrl up/down, Shift boost, click: detonate - Esc: back to overhead');this.setCross(3,10,0.4);return;}
 if(this.vm&&!this.vm.enabled)this.vm.enabled=true;
 var mz=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0),mx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0);
 A.adsW=NS.clamp(A.adsW+(f.ads?1:-1)*dt*(1/A.def.adsTime)*2.2,0,1);
 if(K.ControlLeft)s.wantCrouch=true;
 var sprint=K.ShiftLeft&&mz>0.3&&!f.ads&&!s.wantCrouch;f.sprintW+=((sprint?1:0)-f.sprintW)*Math.min(1,dt*11);
 var sp=NS.MOVE_SPEED*A.def.move*(sprint?1.55:1)*(s.wantCrouch?0.6:1)*(f.ads?0.58:1),fw=NS.fwd(s.lookYaw,0),rt=NS.fwd(s.lookYaw-Math.PI/2,0);
 var wl=Math.hypot(mx,mz)||1,wx=(fw[0]*mz+rt[0]*mx)/wl*sp,wz=(fw[2]*mz+rt[2]*mx)/wl*sp;if(!mx&&!mz){wx=0;wz=0;}
 var acc=1-Math.exp(-16.5*dt);s.vel[0]+=(wx-s.vel[0])*acc;s.vel[1]+=(wz-s.vel[1])*acc;
 var p=s.pos();if(f.groundY===undefined)f.groundY=p[1];var np=[p[0]+s.vel[0]*dt,f.groundY,p[2]+s.vel[1]*dt],q=T.navigation.walk([p[0],f.groundY,p[2]],np);
 var TV=typeof TacticalTraversal!=='undefined'?TacticalTraversal:null;
 // Space at a blocked opening requests traversal; ordinary walking never does.
 if(TV&&!s.trav&&f.fallStart===undefined&&TV.playerWantsVault(f.jump,s.wantCrouch,f.airY,mx||mz,p,q,np)){var dl=Math.hypot(wx,wz)||1,lk=TV.playerProbe(T,p,f.groundY,[wx/dl,wz/dl]);if(lk){TV.begin(s,lk,[p[0],f.groundY,p[2]]);TV.stats.player++;f.jump=false;}}
 // jump (NIGHT_SURVIVAL 07c-controller.js:95-126: vy 6.3, gravity 19), horizontal position stays clamped to the navmesh
 if(f.jump){f.jump=false;if(f.airY<=0&&f.fallStart===undefined){if(s.wantCrouch)s.wantCrouch=false;else{f.vy=6.3;f.jumps++;}}}
 if(f.vy||f.airY>0){f.vy-=19*dt;f.airY+=f.vy*dt;if(f.airY<=0){f.airY=0;f.vy=0;}}
 if(s.trav&&TV){var tq=TV.step(s,dt);f.airY=0;f.vy=0;f.groundY=tq[1];np=tq;if(s.trav.done){var lh=s.trav.landH;s.trav=null;f.landT=T.elapsed;f.eyeGv-=Math.min(4,lh);var fdm=TV.fallDamage(lh);if(fdm&&T.combat){T.combat.applyDamage(s,fdm,null,'legs',null);TV.stats.dmg+=fdm;}}s.entity.setPosition(np[0],np[1],np[2]);}
 else{if(TV&&(!q||f.fallStart!==undefined)){var fall=TV.playerFall(T.navigation,[p[0],f.groundY+f.airY,p[2]],f,dt);np=fall.p;f.groundY=np[1];f.airY=0;f.vy=0;if(fall.landed){f.landT=T.elapsed;if(fall.damage&&T.combat)T.combat.applyDamage(s,fall.damage,null,'legs',null);}}
 else if(q){np=q;f.groundY=q[1];}else{np[0]=p[0];np[2]=p[2];}s.entity.setPosition(np[0],f.groundY+f.airY,np[2]);}
 s.speedNow=Math.hypot(s.vel[0],s.vel[1]);s.moving=false;s.airborne=f.airY>0||f.fallStart!==undefined;
 /* FP fix: the camera follows the navmesh height through a critically damped spring (rubble / stairs no longer step the view) */
 var w=FP.eyeW,ex=f.eyeG-f.groundY;if(Math.abs(ex)>FP.eyeSnap){f.eyeG=f.groundY;f.eyeGv=0;}else{f.eyeGv+=(-w*w*ex-2*w*f.eyeGv)*dt;f.eyeG+=f.eyeGv*dt;}
 var eh=NS.lerp(1.62,1.12,s.crouchAmt),eyeY=f.eyeG+f.airY+eh;s.eyeY=eyeY;/* NS.entEye reads it: shots leave the camera */
 // recoil recovery (07ca-recul.js recoilTick): 0.1 s after the last shot, the per-category share (ar 70%, sniper/shotgun 90%) returns at 7/s
 var RC=NS.RECOIL,back=(RC.cat[A.def.cat]||RC.cat.ar).back;
 if(T.elapsed-A.lastShotAt>RC.delay&&(s.recPend||0)>0){var bk=Math.min(s.recPend,s.recPend*RC.rate*dt);f.pitch-=bk*back;s.recPend-=bk;}
 if(f.manual){if(f.manual<0)s.recPend=Math.max(0,(s.recPend||0)+f.manual);f.manual=0;}s.lookYaw=f.yaw;s.pitch=f.pitch;
 // fire: auto while held, semi-auto / bolt / pump one shot per click (ctlWeapon: d.auto ? I.fire : pressed)
 var G=T.grenades,holding=G&&G.held,canFire=!holding&&(NS.canCycle?NS.canCycle(A):!A.reload)&&f.sprintW<0.3,pull=A.def.auto?f.fire:f.firePressed;
 if(pull&&canFire&&A.fireCd<=0){if(A.mag>0){var eye=NS.entEye(s),dir=NS.fwd(f.yaw,f.pitch),r=T.combat.shoot(s,eye,dir,true);f.yaw=s.lookYaw;f.pitch=s.pitch;if(r){var kk=A.def.recoil&&A.def.recoil.kick?A.def.recoil.kick/0.028:1;f.kickV+=2.2*Math.min(3,kk);}if(r&&r.eh)this.hitmarker(r.eh.part==='head',!r.eh.ent.alive);}else if(A.reserve>0)s.input.reload=true;}
 if(A.reload&&A.reload.tube&&f.firePressed)s.input.fire=true;/* tube reload: a click with a shell in stops the reload (ctlWeapon:196) */else s.input.fire=false;
 f.firePressed=false;
 // camera at the (smoothed) eye
 var cp=s.pos();T.camera.setPosition(cp[0],eyeY,cp[2]);T.camera.setEulerAngles(f.pitch*180/Math.PI,f.yaw*180/Math.PI,0);
 this.vmTick(dt);
 var fov=62*NS.lerp(1,A.def.adsFov,A.adsW*A.adsW*(3-2*A.adsW))*(1+0.085*f.sprintW);T.camera.camera.fov+=(fov-T.camera.camera.fov)*Math.min(1,dt*26);
 // HUD crosshair: always visible in first person (ADS tightens it, never hides it). NS gap: spread / tan(fov/2) * h/2 (h cached on resize)
 var spread=NS.shotSpread(A,s.speedNow,s.crouchAmt>0.5,s.airborne),h=this.cssH||800,gap=spread/Math.tan(T.camera.camera.fov*Math.PI/360)*h/2;gap=Math.max(3,Math.min(36,NS.lerp(gap,3,A.adsW)));this.crossGap=gap;
 this.setCross(gap,A.adsW>0.5?6:10,1);
 var d=A.def;this.setText(this.hud.ammo,'ammo',A.switching>0?'SWITCHING':A.reload?'RELOADING':A.boltT>0?(d.bolt?'BOLT':'PUMP')+'  '+A.mag+' / '+A.reserve:A.mag+' / '+A.reserve);
 var inv=s.nadeInv||{},sel=s.nadeSel||'frag',hd=G&&G.held;
 this.setText(this.hud.ctl,'ctl',s.soldierName+' - HP '+Math.ceil(s.health)+' - '+(d.name||d.id)+(d.bipod&&s.crouchAmt>0.5&&s.speedNow<0.4?' [bipod]':'')+' - '+(hd?'COOKING '+hd.type+' (release G)':'G '+sel+' x'+(inv[sel]||0)+' (Z type)')+' - 1/2 weapon, [ ] arsenal, B FPV, U recon - Esc/T: overhead');
 /* Riposte flash white-out (flashTick) and in-smoke veil (smokeView), one div, written only when it changes */
 var vk=0;if(this.flashed){var fl=this.flashed;fl.t-=dt;var fade=NS.clamp(fl.d*0.5,0.4,1.2),wv=NS.clamp(fl.t/fade,0,1);vk=fl.i*Math.pow(wv,0.7)*1.08;if(fl.t<=0)this.flashed=null;}if(T.look)T.look.flashBump(vk);
 var sk=G&&G.smokes.length?G.smokeView([cp[0],eyeY,cp[2]])*0.85:0,vt=Math.min(1,Math.max(vk,sk)).toFixed(2);
 if(this.hudCache.veil!==vt){this.hudCache.veil=vt;this.hud.veil.style.opacity=vt;this.hud.veil.style.background=vk>sk?'#f4f4f0':'#9a9c9a';}};
TacticalRtsInput.prototype.setCross=function(gap,len,op){var key=gap.toFixed(1)+'|'+len+'|'+op;if(this.hudCache.cross===key)return;this.hudCache.cross=key;this.hudWrites=(this.hudWrites||0)+1;
 var H=this.hud,cr=H.cross;if(!cr)return;if(!this.hudCache.crossOn){cr.style.display='block';this.hudCache.crossOn=1;}cr.style.opacity=op;
 [[0,-1],[0,1],[-1,0],[1,0]].forEach(function(v,i){var b=H.bars[i];if(!b)return;b.style.width=v[0]?len+'px':'2px';b.style.height=v[0]?'2px':len+'px';b.style.left=(v[0]?(v[0]>0?gap:-gap-len):-1)+'px';b.style.top=(v[1]?(v[1]>0?gap:-gap-len):-1)+'px';});};
TacticalRtsInput.prototype.onPilotEnd=function(boom){this.toast(boom?'FPV drone detonated':'FPV drone lost');};
TacticalRtsInput.prototype.hitmarker=function(head,kill){var el=document.querySelector('#tl-hit');el.style.opacity=1;el.querySelectorAll('i').forEach(function(i){i.style.background=kill?'#ff4a3a':head?'#ffa640':'#fff';});el.style.transform='rotate(45deg) scale('+(kill?1.4:1)+')';clearTimeout(this._hm);this._hm=setTimeout(function(){el.style.opacity=0;},180);};
/* ---------- per frame ---------- */
TacticalRtsInput.prototype.update=function(dt){var T=TacticalCommon.ns(this.app);if(!T.ready)return;dt=Math.min(dt,0.05);this.radialTimers(T);if(this.floorPick||this.floorCutUntil)this.drawFloorPick();
 if(this.fps){if(!T.paused)this.fpsTick(dt);this.draw();return;}
 if(T.drones&&T.drones.pilot)T.drones.pilot=null;
 var K=this.keys,flying=this.drag&&this.drag.button===2&&this.drag.moved;
 var mx=(K.KeyD||K.ArrowRight?1:0)-(K.KeyA||K.ArrowLeft?1:0),mz=(K.KeyW||K.ArrowUp?1:0)-(K.KeyS||K.ArrowDown?1:0);
 if(!flying){var r=this.app.graphicsDevice.canvas.getBoundingClientRect();if(this.edgePan&&this.mouse.inside&&!this.drag&&document.hasFocus()){if(this.mouse.x<12)mx=-1;else if(this.mouse.x>r.width-12)mx=1;if(this.mouse.y<12)mz=1;else if(this.mouse.y>r.height-12)mz=-1;}
  if(mx||mz){var sp=Math.max(10,this.cam.pos.y*1.1)*dt,f=new pc.Vec3(-Math.sin(this.cam.yaw),0,-Math.cos(this.cam.yaw)),rt=new pc.Vec3(Math.cos(this.cam.yaw),0,-Math.sin(this.cam.yaw));this.cam.pos.add(f.mulScalar(mz*sp)).add(rt.mulScalar(mx*sp));}
  var rot=(K.KeyE?1:0)-(K.KeyQ?1:0);if(rot)this.orbit(-rot*1.6*dt,0);}
 else{var d=this.dir(),rt2=new pc.Vec3(Math.cos(this.cam.yaw),0,-Math.sin(this.cam.yaw)),up=(K.KeyE?1:0)-(K.KeyQ?1:0),sp2=(K.ShiftLeft?40:15)*dt;this.cam.pos.add(d.mulScalar(mz*sp2)).add(rt2.mulScalar(mx*sp2));this.cam.pos.y+=up*sp2;}
 this.cam.pos.x=Math.max(-150,Math.min(150,this.cam.pos.x));this.cam.pos.z=Math.max(-150,Math.min(150,this.cam.pos.z));this.cam.pos.y=Math.max(2.5,Math.min(160,this.cam.pos.y));
 this.apply();this.draw();};
TacticalRtsInput.prototype.draw=function(){var T=TacticalCommon.ns(this.app),app=this.app,a=new pc.Vec3(),b=new pc.Vec3();
 function line(p,q,c){a.set(p[0],p[1],p[2]);b.set(q[0],q[1],q[2]);app.drawLine(a,b,c,false);}
 function ring(p,r,c,n){n=n||20;for(var i=0;i<n;i++){var t0=i/n*Math.PI*2,t1=(i+1)/n*Math.PI*2;line([p[0]+Math.cos(t0)*r,p[1]+.05,p[2]+Math.sin(t0)*r],[p[0]+Math.cos(t1)*r,p[1]+.05,p[2]+Math.sin(t1)*r],c);}}
 var green=new pc.Color(.45,1,.6),white=new pc.Color(1,1,1),self=this;
 (T.selection||[]).forEach(function(s){if(!s.alive||s.controlled)return;var p=s.pos();ring(p,.55,green);ring(p,.6,green);
  for(var k=s.index;k<s.path.length;k++)line(k===s.index?[p[0],p[1]+.1,p[2]]:[s.path[k-1][0],s.path[k-1][1]+.1,s.path[k-1][2]],[s.path[k][0],s.path[k][1]+.1,s.path[k][2]],green);
  if(s.goal)ring(s.goal,.35,white,12);});
 if(this.preview&&this.preview.until>T.elapsed)(this.preview.items||[]).forEach(function(o){ring(o.dest,.4,o.failed?new pc.Color(1,.25,.3):o.crouchedSafe===false?new pc.Color(1,.5,.3):white,12);});
 if(this.clickNavDebug&&this.clickNavDebug.until>T.elapsed){var nd=this.clickNavDebug;
  ring(nd.raw,.2,new pc.Color(1,.55,.15),12);
  if(nd.snap){ring(nd.snap,.24,new pc.Color(.1,.88,1),12);line([nd.raw[0],nd.raw[1]+.10,nd.raw[2]],[nd.snap[0],nd.snap[1]+.10,nd.snap[2]],new pc.Color(1,.75,.17));}
 }
 if(this.marker&&performance.now()-this.marker.t<600){var k2=(performance.now()-this.marker.t)/600;ring(this.marker.p,.3+k2*1.2,this.marker.kind==='cover'?new pc.Color(.4,.8,1):this.marker.kind==='focus'?new pc.Color(1,.25,.2):green,24);}
 if(this.outline&&performance.now()-this.outline.t<2500){var R2=this.outline.rect,yy=(this.outline.y||0)+0.15,oc=this.outline.bad?new pc.Color(1,.35,.25):new pc.Color(1,.85,.3),cs=[[R2[0],R2[1]],[R2[2],R2[1]],[R2[2],R2[3]],[R2[0],R2[3]]];for(var oi=0;oi<4;oi++){var c0=cs[oi],c1=cs[(oi+1)%4];line([c0[0],yy,c0[1]],[c1[0],yy,c1[1]],oc);line([c0[0],yy+3,c0[1]],[c1[0],yy+3,c1[1]],oc);line([c0[0],yy,c0[1]],[c0[0],yy+3,c0[1]],oc);}}/* M5b: G target outline */
 if(this.area&&performance.now()-this.area.t<2500)ring(this.area.p,this.area.r,new pc.Color(.4,.8,1),40);
 var red=new pc.Color(1,.25,.2),fs=[];this.friendlies().forEach(function(s){if(s.focus&&s.focus.alive&&fs.indexOf(s.focus)<0)fs.push(s.focus);});fs.forEach(function(e){var p=e.pos();ring(p,.75,red,16);line([p[0],p[1]+2.2,p[2]],[p[0],p[1]+2.6,p[2]],red);});/* pass D: focus-fire targets */
 // hover ghost
 if(!this.fps&&(T.selection||[]).length&&this.mouse.inside&&!this.drag){var h=this.pickWorld(this.mouse.x,this.mouse.y);if(h)ring(h.point,.45,h.kind==='coverLow'||h.kind==='coverTall'?new pc.Color(.4,.8,1):new pc.Color(.7,.9,.7),16);}
};

/* Mouse look for direct control: the ONLY writer of the first-person yaw/pitch (NS look 0.0021 rad/count, ADS factor 0.72). */
TacticalRtsInput.prototype.look=function(mx,my){var f=this.fps;if(!f)return;var prefs=window.DreadingSettings&&window.DreadingSettings.data;mx*=(prefs?prefs.invertX:this.invertX)?-1:1;my*=(prefs?prefs.invertY:this.invertY)?-1:1;var ads=f.s.arms.adsW,k=0.0021*this.sensitivity*(0.35+0.65*TacticalNS.lerp(1,0.72,ads));
 f.yaw-=mx*k;f.pitch=Math.max(-1.5,Math.min(1.5,f.pitch-my*k));f.manual=(f.manual||0)-my*k;};
/* First-person viewmodel (FP pass 2026-11-16):
   - ARMS ONLY: a second instance of the soldier GLB whose skinned meshes keep only the triangles weighted >= 50% to arm/hand bones
     (torso, neck, head, helmet and legs are dropped once at load, index buffers only; the rifle, skinned to soldierNode_33, is kept). Nothing of the
     head or shoulders can enter the view any more.
   - OWN LAYER + CAMERA: 'FP Viewmodel' layer drawn by a child camera of the main camera after it (depth cleared, near 0.01, far 6),
     so the arms never clip into walls and the world camera can use near 0.1.
   - ANCHORED TO THE HEAD BONE: after the animation pose, the viewmodel is shifted so the head bone stays where it was in aim_idle,
     i.e. the camera rides the head; full-body sway / lean of the run, walk and reload clips no longer swings the arms through view.
   - Clips: aim_idle / rifle_walk (walking) / rifle_run (sprint only) / reload; rifle shots replay the authored firing clip with a small supporting kick spring.
   - Shaders prewarmed at load (prewarmViewmodel) so entering first person does not compile programs. */
TacticalRtsInput.ARM_BONES=['soldierNode_7','soldierNode_8','soldierNode_9','soldierNode_10','soldierNode_11','soldierNode_12','soldierNode_13','soldierNode_14','soldierNode_15','soldierNode_16','soldierNode_29','soldierNode_30','soldierNode_31','soldierNode_32','soldierNode_33'];/* 33 = rifle bone (the loaded soldier is one merged skinned mesh, rifle included) */
/* 2026-11-18: new-skin (Mixamo) first person keeps forearms + hands only. Keeping Shoulder / upper Arm left the shoulder pads, upper sleeves
   and the collar of newskin_torso_head (584 tris) in the viewmodel: a huge dark blob at lower left and, when the clip pose rolls the
   shoulders, a body-sized shape across the right half of the view. */
TacticalRtsInput.MIXAMO_FP_BONES=/^mixamorig:(Left|Right)(ForeArm|Hand)/;
TacticalRtsInput.MIXAMO_FP_ANY=true;
TacticalRtsInput.MIXAMO_FP_HIDE=/torso|head|pants|boot|leg/i;
TacticalRtsInput.armsOnlyMesh=function(device,mesh,armNames,minW){var skin=mesh.skin;if(skin&&skin.boneNames.some(function(n){return n.indexOf('mixamorig:')===0;}))armNames=skin.boneNames.filter(function(n){return TacticalRtsInput.MIXAMO_FP_BONES.test(n);});if(!skin||!mesh.vertexBuffer||!mesh.indexBuffer[0])return null;
 var arm=skin.boneNames.map(function(n){return armNames.indexOf(n)>=0;}),vb=mesh.vertexBuffer,it=new pc.VertexIterator(vb),nv=vb.numVertices,keep=new Uint8Array(nv);
 var bi=it.element[pc.SEMANTIC_BLENDINDICES],bw=it.element[pc.SEMANTIC_BLENDWEIGHT];if(!bi||!bw)return null;
 for(var v=0;v<nv;v++){var s=0,tot=0;for(var c=0;c<4;c++){var wv=bw.get(c),j=bi.get(c);tot+=wv;if(arm[j])s+=wv;}keep[v]=tot>0&&s/tot>=minW?1:0;it.next();}
 /* Mixamo skins: keep a triangle when ANY corner is forearm/hand-weighted, so the cut extends one ring above the elbow instead of
    leaving a ragged, see-through edge (Cody's 'tear' in the left sleeve) */
 var anyV=TacticalRtsInput.MIXAMO_FP_ANY&&skin.boneNames.some(function(n){return n.indexOf('mixamorig:')===0;}),ib=mesh.indexBuffer[0],prim=mesh.primitive[0],src=ib.format===pc.INDEXFORMAT_UINT32?new Uint32Array(ib.storage):new Uint16Array(ib.storage),out=[];
 for(var i=prim.base;i<prim.base+prim.count;i+=3){var a=src[i],b=src[i+1],c2=src[i+2];if(anyV?(keep[a]||keep[b]||keep[c2]):(keep[a]&&keep[b]&&keep[c2]))out.push(a,b,c2);}
 /* Seal extraction boundaries once at creation; caps share skin weights and add no draw calls. */
 if(anyV){var edges=new Map();for(var ti=0;ti<out.length;ti+=3){for(var ei=0;ei<3;ei++){var u=out[ti+ei],w=out[ti+(ei+1)%3],ek=Math.min(u,w)+':'+Math.max(u,w);if(edges.has(ek))edges.delete(ek);else edges.set(ek,[u,w]);}}
 var next=new Map();edges.forEach(function(e){next.set(e[0],e[1]);});while(next.size){var start=next.keys().next().value,loop=[start],cur=start,closed=false;for(var guard=0;guard<nv;guard++){var dest=next.get(cur);if(dest===undefined)break;next.delete(cur);if(dest===start){closed=true;break;}loop.push(dest);cur=dest;}if(closed&&loop.length>=3)for(var li=1;li<loop.length-1;li++)out.push(loop[0],loop[li+1],loop[li]);}}
 var fmt=nv>65535?pc.INDEXFORMAT_UINT32:pc.INDEXFORMAT_UINT16,data=fmt===pc.INDEXFORMAT_UINT32?new Uint32Array(out):new Uint16Array(out);
 var m2=new pc.Mesh(device);m2.vertexBuffer=vb;m2.indexBuffer[0]=new pc.IndexBuffer(device,fmt,data.length,pc.BUFFER_STATIC,data);m2.primitive[0]={type:pc.PRIMITIVE_TRIANGLES,base:0,count:data.length,indexed:true};m2.skin=skin;m2.aabb=mesh.aabb;
 return {mesh:m2,kept:data.length/3,total:prim.count/3};};
TacticalRtsInput.prototype.ensureViewmodel=function(){var T=TacticalCommon.ns(this.app),app=this.app;if(this.vm||!T.soldierGlb)return this.vm;
 var L=app.scene.layers.getLayerByName('FP Viewmodel');if(!L){L=new pc.Layer({name:'FP Viewmodel'});app.scene.layers.push(L);}this.vmLayer=L;
 app.root.findComponents('light').forEach(function(l){if(l.type==='directional'&&l.layers.indexOf(L.id)<0)l.layers=l.layers.concat([L.id]);});
 var cam=new pc.Entity('FP viewmodel camera');cam.addComponent('camera',{layers:[L.id],clearColorBuffer:false,clearDepthBuffer:true,clearStencilBuffer:false,nearClip:TacticalRtsInput.FP.vmNear,farClip:TacticalRtsInput.FP.vmFar,fov:T.camera.camera.fov,priority:(T.camera.camera.priority||0)+1});
 T.camera.addChild(cam);cam.enabled=false;this.vmCam=cam;if(T.look&&T.look.on)cam.camera.toneMapping=pc.TONEMAP_NEUTRAL;/* arms render after the post (no TAA smear), same tonemap */
 var vm=T.soldierGlb.resource.instantiateRenderEntity();vm.name='FP viewmodel';vm.addComponent('anim',{activate:true});
 T.soldierGlb.resource.animations.forEach(function(a){vm.anim.assignAnimation(a.resource.name,a.resource,undefined,1,!/death|hit_react|fir(?:e|ing)|grenade_toss|reload/i.test(a.resource.name));});
 var dev=app.graphicsDevice,stats={kept:0,total:0},cache=TacticalRtsInput._armsCache||(TacticalRtsInput._armsCache=new Map());
 vm.findComponents('render').forEach(function(r){r.castShadows=false;r.receiveShadows=false;r.layers=[L.id];
  r.meshInstances.forEach(function(mi){if(!mi.skinInstance)return;var src=mi.mesh,res=cache.get(src);if(!res){try{res=TacticalRtsInput.armsOnlyMesh(dev,src,TacticalRtsInput.ARM_BONES,0.5);}catch(e){console.warn('[FP] arms-only filter failed: '+e.message);res=null;}cache.set(src,res);}
   if(res){mi.mesh=res.mesh;stats.kept+=res.kept;stats.total+=res.total;}});});
 /* new skin: body pieces never belong in the viewmodel, whatever their weights */
 if(T.newSkin)vm.findComponents('render').forEach(function(r){if(TacticalRtsInput.MIXAMO_FP_HIDE.test(r.entity.name)){r.enabled=false;stats.hidden=(stats.hidden||0)+1;}});
 this.armsStats=stats;
 T.camera.addChild(vm);vm.enabled=false;this.vm=vm;this.vmHead=vm.findByName(T.newSkin?'mixamorig:Head':TacticalRtsInput.VM.head);this.vmClip='';return vm;};
/* Prewarm (FP fix): right after load, draw the viewmodel once through its camera into a 1-pixel viewport so every program it needs is
   compiled before the player presses T (measured headless: 8 programs / ~30 ms per frame of compile stall on first FP entry before). */
TacticalRtsInput.prototype.prewarmViewmodel=function(){var T=TacticalCommon.ns(this.app);if(this.vmWarm||!T.ready||this.fps)return;if(!this.ensureViewmodel())return;
 if(!this.vmWarmT){this.vmWarmT=1;var gd=this.app.graphicsDevice;this.vmCam.camera.rect=new pc.Vec4(0,0,2/Math.max(2,gd.width),2/Math.max(2,gd.height));this.vm.setLocalPosition(TacticalRtsInput.VM.hip);this.vm.enabled=true;this.vmCam.enabled=true;return;}
 if(++this.vmWarmT<4)return;this.vm.enabled=false;this.vmCam.enabled=false;this.vmCam.camera.rect=new pc.Vec4(0,0,1,1);this.vmWarm=true;};
/* Viewmodel offsets (camera-local, metres), tuned from headless screenshots: ADS puts the M4 rear sight on the crosshair. */
TacticalRtsInput.VM={hip:new pc.Vec3(-0.10,-1.60,-0.02),ads:new pc.Vec3(-0.141,-1.518,-0.08),head:'soldierNode_6',walkRate:2.6,runRate:3.17,
 /* new-skin (Mixamo) viewmodel, camera-local metres: x right, y up, z forward is negative. Editor: First person > viewmodel.newSkin.*.
    2026-11-18: hip/ADS z pulled back from -0.65 (arms floated out in front of the eye) to a natural bottom-right hold. */
 newSkin:{hipX:-0.07,hipY:-1.55,hipZ:-0.32,adsX:-0.2,adsY:-1.35,adsZ:-0.3}};
/* Base locomotion; successful shots override it with the authored rifle firing clip. */
TacticalRtsInput.vmClipFor=function(reloading,sprintW,speed,ads){if(reloading)return 'reload';if(ads>0.35)return 'aim_idle';/* ADS: steady aim pose while moving; the walk/run clips swing the arms across the sight */if(sprintW>0.5&&speed>1.6)return 'rifle_run';if(speed>0.3)return 'rifle_walk';return 'aim_idle';};
TacticalRtsInput.prototype.vmTick=function(dt){var f=this.fps,vm=this.vm;if(!f||!vm)return;var s=f.s,A=s.arms,T=TacticalCommon.ns(this.app);vm.enabled=true;
 if(this.vmCam){if(!this.vmCam.enabled)this.vmCam.enabled=true;var mf=T.camera.camera.fov;if(this.vmCam.camera.fov!==mf)this.vmCam.camera.fov=mf;}
 if(Number.isFinite(s.lastShotT)&&T.elapsed-s.lastShotT<.1&&this.vmPistolStamp!==s.lastShotT){this.vmPistolStamp=s.lastShotT;f.kick=Math.max(f.kick,DreadingBodyAnimation.pistol(s)?.45:.28);f.kickV=Math.max(f.kickV,1.5);}
 f.kickV+=(-f.kick*260-f.kickV*26)*dt;f.kick+=f.kickV*dt;if(f.kick<-0.2)f.kick=-0.2;
 var a=A.adsW*A.adsW*(3-2*A.adsW),NV=TacticalRtsInput.VM.newSkin,h=T.newSkin?new pc.Vec3(NV.hipX,NV.hipY,NV.hipZ+0.10):TacticalRtsInput.VM.hip,d=T.newSkin?new pc.Vec3(NV.adsX,NV.adsY,NV.adsZ+0.10):TacticalRtsInput.VM.ads,sw=A.switching>0?Math.sin(Math.PI*Math.min(1,A.switching/(TacticalNS.SWITCH?TacticalNS.SWITCH.dur:0.44)))*0.25:0;
 if(A.def.id==='bazooka'){h.x+=.22;h.y-=.06;d.copy(h);}
 var bob=s.speedNow>0.3&&f.airY<=0?Math.sin(T.elapsed*s.speedNow*2.4)*0.008*(window.DreadingAnimationSettings?window.DreadingAnimationSettings.bob:1)*(1-a*0.8):0,c=this.vmCorr||[0,0,0];
 var recoilAngle=0,recoilRad=recoilAngle*Math.PI/180,pivotY=1.35;
 this.vmBase=[NS_l(h.x,d.x,a),NS_l(h.y,d.y,a)+bob-f.airY*0.04-sw+pivotY*(1-Math.cos(recoilRad)),NS_l(h.z,d.z,a)+(DreadingBodyAnimation.pistol(s)?0.06:0)-pivotY*Math.sin(recoilRad)];
 vm.setLocalPosition(this.vmBase[0]+c[0],this.vmBase[1]+c[1],this.vmBase[2]+c[2]);vm.setLocalEulerAngles(recoilAngle,0,0);
 var sp=s.speedNow,clip=TacticalRtsInput.vmClipFor(!!A.reload,f.sprintW,sp,A.adsW),rate=1;
 if(clip==='reload'){clip=DreadingBodyAnimation.reloadClip(s,T);var reloadTrack=DreadingBodyAnimation.track(T,clip);rate=(reloadTrack?reloadTrack.duration:1.85)/Math.max(0.5,A.reload.dur||A.def.reload);}else if(DreadingBodyAnimation.pistol(s)){clip='pistol__pistol_idle';}else if(clip==='rifle_run')rate=sp/TacticalRtsInput.VM.runRate;else if(clip==='rifle_walk')rate=Math.max(0.8,Math.min(1.5,sp/TacticalRtsInput.VM.walkRate));
 // Replay the authored rifle recoil only after a successful shot, never on trigger/dry fire.
 var shotTrack=!DreadingBodyAnimation.pistol(s)&&DreadingBodyAnimation.track(T,'loose__Firing_Rifle'),shotNew=Number.isFinite(s.lastShotT)&&T.elapsed-s.lastShotT<0.1&&s.lastShotT!==this.vmShotStamp;
 if(shotNew){this.vmShotStamp=s.lastShotT;this.vmShotWeapon=A;this.vmShotUntil=T.elapsed+(shotTrack?shotTrack.duration:0);}
 var shotActive=shotTrack&&A.adsW<.35&&!A.reload&&!(A.switching>0)&&this.vmShotWeapon===A&&T.elapsed<this.vmShotUntil;
 // Local recoil is applied as arm-bone deltas after the base pose, including ADS.
 shotActive=false;
 var reloadStart=A.reload&&(!this.vmWasReload||(A.reload.elapsed??A.reload.t??0)<(this.vmReloadT||0)-.1);this.vmWasReload=!!A.reload;this.vmReloadT=A.reload?.elapsed??A.reload?.t??0;if((clip!==this.vmClip||reloadStart||(shotActive&&shotNew))&&vm.anim.baseLayer){try{vm.anim.baseLayer.transition(clip,shotActive?0.025:0.12);if(shotActive&&shotNew)vm.anim.baseLayer.activeStateCurrentTime=0;this.vmClip=clip;this.vmClipT=T.elapsed;this.vmTransitions=(this.vmTransitions||0)+1;}catch(e){}}
 var cadence=window.DreadingAnimationSettings,ct=DreadingBodyAnimation.track(T,clip);if(ct&&/rifle_run|rifle_walk/.test(clip))rate*=ct.duration/(clip==='rifle_run'?(cadence?.runCycle||.65):(cadence?.walkCycle||1));var tuning=window.DreadingAnimationSettings,category=/reload/i.test(clip)?'fpReload':clip==='rifle_run'?'fpRun':clip==='rifle_walk'?'fpWalk':null;vm.anim.speed=Math.max(0.1,Math.min(2.4,rate))*(tuning&&category?tuning[category]:1);
 function NS_l(x,y,t){return x+(y-x)*t;}};
/* head-bone anchor (after the animation pose): keep the head bone at its aim_idle spot in viewmodel space */
TacticalRtsInput.prototype.postUpdate=function(dt){if(!this.fps){if(!this.vmWarm)this.prewarmViewmodel();return;}var vm=this.vm,hb=this.vmHead,T=TacticalCommon.ns(this.app);if(!vm||!hb||!vm.enabled||!this.vmBase)return;
 var inv=this._inv||(this._inv=new pc.Mat4()),hp=this._hp||(this._hp=new pc.Vec3());inv.copy(vm.getWorldTransform()).invert();inv.transformPoint(hb.getPosition(),hp);
 if(!this.headRest){if(this.vmClip==='aim_idle'&&T.elapsed-(this.vmClipT||0)>0.3)this.headRest=[hp.x,hp.y,hp.z];else return;}
 var R=this.headRest,c=this.vmCorr||(this.vmCorr=[0,0,0]),k=1-Math.exp(-30*Math.min(dt||0.016,0.05));
 c[0]+=((R[0]-hp.x)-c[0])*k;c[1]+=((R[1]-hp.y)-c[1])*k;c[2]+=((R[2]-hp.z)-c[2])*k;
 var B=this.vmBase;vm.setLocalPosition(B[0]+c[0],B[1]+c[1],B[2]+c[2]);this.headDrift=Math.hypot(R[0]-hp.x,R[1]-hp.y,R[2]-hp.z);};
/* look spec 5.4: middle-mouse order wheel. RTS: MMB held still for 150 ms opens it at the cursor (moving first = the old MMB pan);
   FP: MMB held 150 ms opens it at screen centre (mouse moves the selector, not the view). Release on a slice = order, in the
   dead-zone = cancel. Every slice calls the SAME functions as the keys / right-click (no second order path). */
TacticalRtsInput.prototype.radialTimers=function(T){var H=T.hud;if(!H||!H.openRadial)return;var now=performance.now();
 if(this.fps){if(this.fpRad&&!H.radial&&now-this.fpRad.t>=H.HOLD){var c=this.app.graphicsDevice.canvas;H.openRadial(c.clientWidth/2,c.clientHeight/2,this.radialWho());}return;}
 var d=this.drag;if(d&&d.button===1&&!d.moved&&!d.radial&&now-d.t>=H.HOLD){d.radial=true;H.openRadial(d.x0,d.y0,this.radialWho());}};
TacticalRtsInput.prototype.radialGroup=function(){var T=TacticalCommon.ns(this.app),sel=(T.selection||[]).filter(function(s){return s.alive&&!s.controlled&&s.team==='friendly';});
 if(this.fps&&!sel.length&&T.orders&&T.orders.follow)sel=T.orders.follow.members.filter(function(o){return o.alive&&!o.controlled;});
 var all=!sel.length;if(all)sel=this.activeSquad().filter(function(s){return s.alive&&!s.controlled;});return {sel:sel,all:all};};
TacticalRtsInput.prototype.radialWho=function(){var g=this.radialGroup();return g.all||g.sel.length>2?'whole squad':g.sel.map(function(s){return s.soldierName;}).join(', ')||'nobody';};
TacticalRtsInput.prototype.radialOrder=function(kind,x,y,shift){var T=TacticalCommon.ns(this.app),c=this.app.graphicsDevice.canvas;if(this.fps||x==null){x=c.clientWidth/2;y=c.clientHeight/2;}/* FP: the aim ray = screen centre */
 if(T.hud)T.hud.stats.radialOrders++;var G=this.radialGroup(),sel=G.sel,r=null;if(kind==='cancel')return null;if(!sel.length){this.toast('No soldiers available');return null;}
 if(kind==='assault'&&this.fps)return this.fpFloorOrder();
 if(kind==='assault'||kind==='defend'||kind==='suppress'){var keep=T.selection;if(G.all)T.selection=[];try{return this.squadOrder(kind,x,y);}finally{T.selection=keep;}}
 if(kind==='focus'){if(this.fps)return this.fpsFocus();var foe=this.pickHostile(x,y);if(!foe){this.toast('Point at a hostile to focus fire');return null;}T.orders.focusFire(sel,foe,'rts');this.flash(foe.pos(),'focus');return {focus:foe};}
 if(kind==='throw'){var mx=this.mouse.x,my=this.mouse.y;this.mouse.x=x;this.mouse.y=y;var keep2=T.selection;T.selection=sel.slice(0,1);try{return this.equipOrder('KeyJ',!!shift);}finally{T.selection=keep2;this.mouse.x=mx;this.mouse.y=my;}}
 var hit=this.pickWorld(x,y);if(!hit){this.toast('Point at the ground or a building first');return null;}
 if(kind==='cover'){r=T.orders.takeCover(sel,hit.name||'cover near the point',hit.point);this.flash(hit.point,'cover');this.toast('Take cover - '+this.radialWho());}
 else{r=T.orders.moveGroup(sel,hit.point);this.flash(hit.point,'move');this.toast('Move - '+this.radialWho());}
 this.preview={until:T.elapsed+3,items:r||[]};return r;};
/* test / dev: L toggles the POI under the cursor through the sim's power entry point (same event the hold rule fires) */
TacticalRtsInput.prototype.powerAtCursor=function(){var T=TacticalCommon.ns(this.app),P=T.power,hit=this.pickWorld(this.mouse.x,this.mouse.y);if(!P||!hit||!T.orders){this.toast('No power grid');return null;}
 var bn=T.orders.buildingNear(hit.point,8),rid=bn?(bn.ref==='objective'?T.town.objectiveRef:bn.ref):null,b=rid!=null&&T.town.buildings.find(function(x){return x&&x.id===rid;});
 if(!b||!(typeof TacticalStrategy!=='undefined'&&TacticalStrategy.isPOI(b))){this.toast('Not a POI (landmark / shop / depot) - point at one and press L');return null;}
 P.set(b.id,!P.on[b.id],this.commandTeam||'friendly','L key');return b;};
