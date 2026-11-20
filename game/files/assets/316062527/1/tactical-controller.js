/* tacticalController: boots the lab. Panel + HUD, sun, loads the NIGHT_SURVIVAL soldier GLB (raw binary asset; the
   rifle-animation export with aim/fire/reload/hit/death clips when set), spawns the friendly squad at the Editor
   "Soldier Preview" positions and the enemy squad at the Editor "Soldier spawn" markers (team + facing editable),
   builds navigation from the Editor scene, starts the live sim and exposes window.tactical for tests.
   Camera/selection/orders/direct control live in tacticalRtsInput. */
var TacticalController=pc.createScript('tacticalController');
TacticalController.BUILD='AI-MERGE: M10-M12 Carentan + SQD-RANGE M9 + Riposte arsenal/grenades/drones + FP pass + T8 objectives/cohesion/x-ray/floors + T9 terrain/traversal + wall-seam fix + T11 look/power/HUD 2026-11-16';
TacticalController.attributes.add('soldierAsset',{type:'asset',assetType:'binary',title:'Soldier GLB (raw binary)'});
TacticalController.attributes.add('seed',{type:'number',default:1,title:'Random seed'});
TacticalController.PREP_BYPASS=/[?&](?:prep=0|training=1|explosionTest=|smokeTest=|fxPanel=|loadout=|weapon=|enemyDrones=)/;
TacticalController.wantPrep=function(){return typeof DreadingPrep!=='undefined'&&!!DreadingPrep&&typeof location!=='undefined'&&!TacticalController.PREP_BYPASS.test(location.search||'');};
TacticalController.buildFriendlySpecs=function(plan,baseFriendlies){
 var base=baseFriendlies||[],units=(plan&&plan.squad)||[],insert=plan&&plan.insertion;
 function around(i,origin){var x=origin[0],y=origin[1]||0,z=origin[2];return [x+(i%2)*1.5,y,z+Math.floor(i/2)*-2];}
 function origin(){if(!insert)return null;var p=insert.p||insert.pos||insert;if(Array.isArray(p)&&p.length>=3)return [p[0],p[1],p[2]];if(p&&typeof p==='object'&&p.x!=null&&p.z!=null)return [p.x,p.y||0,p.z];return null;}
 var o=origin();
 return units.map(function(u,i){var b=base[i]||{},position=o?around(i,o):(b.position?b.position.slice():around(i,[-10,0,-10]));
  return {name:u.name||b.name||('SLOT'+(i+1)),team:'friendly',role:u.cls||u.role||'Scavenger',position:position,yaw:b.yaw,kit:u};});
};
TacticalController.remainingBudget=function(plan){var r=plan&&(plan.resources||plan);return {scrap:(plan&&plan.scrap!=null?plan.scrap:(r&&r.scrap!=null?r.scrap:0))|0,fortify:(plan&&plan.fortify!=null?plan.fortify:(r&&r.fortify!=null?r.fortify:0))|0,batteries:0};};
TacticalController.applyPlanKits=function(T,plan){
 var AR=typeof TacticalArsenal!=='undefined'?TacticalArsenal:null,NS=typeof TacticalNS!=='undefined'?TacticalNS:null;
 var flags={equip:!!(AR&&typeof AR.equip==='function'),honoredPrimary:false,defaultGuns:false,attachments:'none'};
 var byName={};((plan&&plan.squad)||[]).forEach(function(u){byName[(u.name||'').toUpperCase()]=u;});
 (T.squad||[]).forEach(function(s){if(s.team!=='friendly')return;var u=byName[(s.soldierName||'').toUpperCase()];if(!u)return;
  if(flags.equip){try{AR.equip(s,u);flags.honoredPrimary=true;}catch(e){flags.defaultGuns=true;console.warn('[Tactical] TacticalArsenal.equip failed: '+e.message);}}
  else if(NS&&NS.makeArms&&NS.WEAPONS){var pid=u.primary&&NS.WEAPONS[u.primary]?u.primary:null,sid=u.secondary&&NS.WEAPONS[u.secondary]?u.secondary:'m9';
   if(pid){s.loadout=[NS.makeArms(NS.WEAPONS[pid]),NS.makeArms(NS.WEAPONS[sid]||NS.WEAPONS.m9||NS.WEAPONS.m4)];s.arms=s.loadout[0];s.armsIdx=0;flags.honoredPrimary=true;}
   else flags.defaultGuns=true;}
  else flags.defaultGuns=true;
  if(u.attachments&&u.attachments.length){if(flags.equip)flags.attachments='applied';else flags.attachments='unsupported';}
  if(T.grenades){if(!s.nadeInv)T.grenades.giveInventory(s);if(u.grenades){s.nadeInv=s.nadeInv||{};['frag','smoke','flash'].forEach(function(k){if(u.grenades[k]!=null)s.nadeInv[k]=u.grenades[k]|0;});}}
 });
 T.prepFlags=flags;if(flags.defaultGuns)console.warn('[Tactical] prep kits: falling back to default guns (no TacticalArsenal.equip / could not honor primary ids)');
 if(flags.attachments==='unsupported')console.warn('[Tactical] prep kits: attachments not applied (TacticalArsenal.equip missing)');
 return flags;
};
TacticalController.installLoadoutWrap=function(plan){
 var AR=typeof TacticalArsenal!=='undefined'?TacticalArsenal:null,NS=typeof TacticalNS!=='undefined'?TacticalNS:null;
 if(!AR||typeof AR.equip==='function')return;
 var byName={};((plan&&plan.squad)||[]).forEach(function(u){byName[(u.name||'').toUpperCase()]=u;});
 var origFor=AR.loadoutFor,origSec=AR.secondaryFor;
 AR.loadoutFor=function(team,name){var u=byName[(name||'').toUpperCase()];AR._prepUnit=(team==='friendly'&&u)?u:null;if(AR._prepUnit&&AR._prepUnit.primary&&NS&&NS.WEAPONS&&NS.WEAPONS[AR._prepUnit.primary])return AR._prepUnit.primary;return origFor?origFor.call(AR,team,name):'m4';};
 AR.secondaryFor=function(team){var u=AR._prepUnit;if(team==='friendly'&&u&&u.secondary&&NS&&NS.WEAPONS&&NS.WEAPONS[u.secondary])return u.secondary;return origSec?origSec.call(AR,team):'m9';};
};

TacticalController.prototype.initialize=function(){var self=this;this.start().catch(function(e){var el=document.querySelector('#error');if(el)el.textContent=e.stack||String(e);console.error(e);});};
TacticalController.prototype.ui=function(){
 var style=document.createElement('style');style.textContent="#tl-panel{position:absolute;top:12px;left:12px;width:290px;max-height:92vh;overflow:auto;background:#13212bdd;border:1px solid #46616b;padding:12px 14px;border-radius:10px;color:#e1e8e9;font:13px system-ui;z-index:10}#tl-panel h1{font-size:18px;margin:2px 0 6px}#tl-panel small{color:#a7c1c7;letter-spacing:1px}#tl-panel button{background:#294754;border:1px solid #648691;color:white;padding:6px 9px;border-radius:6px;cursor:pointer;margin:3px 3px 3px 0;font-size:12px}#tl-panel button:hover{background:#47707b}#tl-panel button.on{background:#3c6b3f;border-color:#79b07c}.row{padding:5px 0;border-top:1px solid #3d505a;cursor:pointer}.muted{color:#9eb4bf;font-size:11px}#status{color:#89ddc2;margin:6px 0;font-weight:600}#navreport{margin:6px 0;padding:6px;border:1px solid #3d505a;border-radius:6px;font-size:11px}#navreport .err{color:#ffb0a2;margin-top:3px}#navreport .warn{color:#e8cf8e;margin-top:3px}.label{position:absolute;color:#e1e8e9;font:11px system-ui;pointer-events:none;white-space:nowrap;z-index:9;text-shadow:0 0 3px #000,0 0 2px #000;transform:translate(-50%,-100%)}.hp{height:3px;background:#333;width:44px;margin:1px auto 0}.hp i{display:block;height:3px;background:#6fe08f}#error{color:#ffb0a2;white-space:pre-wrap;font-size:11px}#tl-panel input{accent-color:#80d1bc}#tl-box{position:absolute;border:1px solid #9fe9c9;background:#9fe9c922;pointer-events:none;z-index:8;display:none}#tl-hud{position:fixed;inset:0;pointer-events:none;z-index:9999;display:none}#tl-cross{position:absolute;left:50%;top:50%;width:0;height:0;z-index:10000;display:block}#tl-cross i.dot{left:-1px;top:-1px;width:2px;height:2px}#tl-cross i{position:absolute;background:#fff;box-shadow:0 0 2px #000}#tl-hit{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px;opacity:0;transform:rotate(45deg)}#tl-hit i{position:absolute;background:#fff}#tl-ammo{position:absolute;right:28px;bottom:24px;font:600 26px system-ui;color:#fff;text-shadow:0 0 4px #000}#tl-ctl{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);font:13px system-ui;color:#fff;text-shadow:0 0 3px #000}#tl-help{position:absolute;right:12px;bottom:12px;background:#13212bdd;color:#e1e8e9;padding:10px 12px;border-radius:9px;font:11px system-ui;line-height:1.6;z-index:10;max-width:330px}#tl-out{position:absolute;left:50%;top:14px;transform:translateX(-50%);font:600 20px system-ui;color:#fff;background:#13212bdd;padding:8px 16px;border-radius:8px;z-index:10;display:none}";document.head.appendChild(style);
 var d=document.createElement('div');d.innerHTML='<div id="tl-panel"><small>NIGHT SURVIVAL / TACTICAL</small><h1>Street battle: first playable</h1><div id="status">Loading the original soldier...</div>'+
  '<button id="initiative" class="on">Use initiative (I)</button><button id="pause">Pause (P)</button><button id="reset">Reset</button><br><button id="home">Home view</button><button id="secure">Secure building now</button><button id="rebuild">Rebuild nav (N)</button>'+
  '<p style="margin:4px 0"><label><input id="debug" type="checkbox"'+(TacticalCommon.ns(this.app).debug?' checked':'')+'> AI debug</label> <label><input id="navmesh" type="checkbox"> Navmesh</label></p>'+
  '<p style="margin:4px 0"><label><input id="zon" type="checkbox" checked> Zombies</label> <label>wave <input id="zsize" type="number" min="1" max="150" value="10" style="width:46px"></label> <button id="zspawn">Spawn wave now</button> <label><input id="eon" type="checkbox" checked> Enemy squad</label></p><div id="zmsg" style="display:none;color:#ffb347"></div><div id="zstat" class="muted"></div>'+
  '<p style="margin:4px 0"><label><input id="ton" type="checkbox" checked> Town</label> seed <input id="tseed" type="number" value="7" style="width:52px"> lots <input id="tcount" type="number" min="0" max="40" value="12" style="width:40px"> <select id="tmode"><option value="mix">kit + generated</option><option value="kit">kit only</option><option value="generated">generated only</option></select><br>density <input id="tdens" type="range" min="0" max="1" step="0.1" value="0.6" style="width:80px;vertical-align:middle"> <button id="tregen">Regenerate town</button> <button id="tcycle">Cycle building state</button></p><div id="tstat" class="muted"></div>'+
  '<div id="squad"></div><div id="inspect" class="muted"></div><div id="navreport"></div><div id="error"></div></div>'+
  '<div id="tl-help"><b>Overhead (RTS)</b><br>Left-click: select four-person squad &middot; Shift-click / drag-box: select multiple squads &middot; 1-9: squads &middot; Ctrl+1-9: save group<br>Right-click ground: move &middot; right-click a wall/crate: take cover there &middot; right-click a zombie/enemy: focus fire<br>WASD / arrows / screen edge: pan &middot; Q/E: rotate &middot; scroll: dolly<br>Middle-drag: pan &middot; right-drag: look (+WASD fly) &middot; Alt+left-drag: orbit<br>F: frame selection &middot; Home / Backspace: overhead view &middot; I: initiative &middot; P: pause<br>Squad orders at the cursor: G building - pick a floor (hover highlights + cuts the floors above, click or 1-9 sends) &middot; Shift+G straight full assault &middot; V defend area &middot; X suppress<br>Traversal: in first person move toward a blocked open window or ledge and press Space to vault or drop (over 4.5 m hurts); the AI and zombies use the same window and stair links<br>O: objective overlay (idle squad picks objectives itself; any order takes over) &middot; own soldiers inside / behind buildings get an x-ray cutout + outline<br>Equipment at the cursor (selected soldier): J frag &middot; Shift+J smoke &middot; K FPV kamikaze drone &middot; U recon drone<br><b>T: take direct control</b> of the selected soldier (first person): mouse look, WASD, Shift sprint, C crouch, left-click fire, right-click aim, R reload, Space jump, F: squad focus-fires your aim target, 1/2: primary/sidearm, [ ]: cycle the arsenal, G: hold to cook a grenade / release to throw, Z: grenade type, B: fly an FPV drone (click detonates), U: recon drone at the aim point, H: send the squad to a floor of the building you aim at (H next, Enter send), Esc or T: back to overhead</div>'+
  '<div id="tl-box"></div><div id="tl-out"></div><div id="tl-hud"><div id="tl-cross"><i class="b"></i><i class="b"></i><i class="b"></i><i class="b"></i><i class="dot"></i></div><div id="tl-hit"><i style="left:10px;top:0;width:2px;height:7px"></i><i style="left:10px;bottom:0;width:2px;height:7px"></i><i style="top:10px;left:0;height:2px;width:7px"></i><i style="top:10px;right:0;height:2px;width:7px"></i></div><div id="tl-ammo"></div><div id="tl-ctl"></div></div>';document.body.appendChild(d);
 var cr=document.querySelector('#tl-cross');for(var i=0;i<4;i++){var b=document.createElement('i');cr.appendChild(b);}
};
TacticalController.prototype.start=async function(){
 var app=this.app,C=TacticalCommon,T=C.ns(app),self=this;this.ui();T.seedValue=this.seed||1;C.seed(T.seedValue);
 app.scene.ambientLight=new pc.Color(.42,.47,.50);
 ['Preview Camera','Preview Sun','Camera','Light','Box','Plane'].forEach(function(n){var e=app.root.findByName(n);if(e&&e.parent===app.root)e.enabled=false;});
 /* pass 4c: the Editor 'Preview Camera' / 'Preview Sun' are nested (not root children), so the line above missed them and the
    whole scene was rendered twice per frame (two full-screen cameras, two directional shadow passes). Turn off every camera
    component that is not ours and the preview lights (components only; the Editor scene is untouched). */
 app.root.findComponents('camera').forEach(function(c){c.enabled=false;});
 app.root.findComponents('light').forEach(function(l){if(/^(Preview Sun|Light)$/.test(l.entity.name))l.enabled=false;});
 /* render scale clamped to 1 device pixel per CSS pixel by default (?dpr=2 etc. to opt back in); the project setting is left as is */
 var qd=/[?&]dpr=([0-9.]+)/.exec(location.search);app.graphicsDevice.maxPixelRatio=qd?Math.max(.5,Math.min(+qd[1],window.devicePixelRatio||1)):1;app.resizeCanvas();
 var root=new pc.Entity('Tactical runtime');app.root.addChild(root);T.root=root;
 var camera=new pc.Entity('Tactical Camera');camera.addComponent('camera',{clearColor:new pc.Color(.13,.18,.22),farClip:600,nearClip:0.05,fov:55});root.addChild(camera);T.camera=camera;
 /* Riposte port (2026-11-16): grenades + drones run on the controller entity; created before the soldiers so decision.reset can hand out grenades */
 ['tacticalGrenades','tacticalDrones','tacticalStrategy','tacticalXray'].forEach(function(n){try{if(!self.entity.script[n])self.entity.script.create(n);}catch(e){console.warn('[Tactical] '+n+' missing: '+e.message);}});
 var sun=new pc.Entity('Sun');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.93,.83),intensity:1.6,castShadows:true,shadowDistance:90,shadowResolution:2048,normalOffsetBias:.04});sun.setEulerAngles(48,-28,0);root.addChild(sun);
 /* look spec phase 1-4: CameraFrame post on this ONE camera, HDRI, cool sun + cascades, fog, tiers, practicals (?look=0 = old look) */
 if(typeof DreadingLook!=='undefined'){try{DreadingLook.init(app,T,camera,sun);}catch(e){console.warn('[Tactical] look init failed: '+e.message);}}
 if(typeof DreadingHUD!=='undefined'){try{DreadingHUD.init(app,T);}catch(e){console.warn('[Tactical] HUD init failed: '+e.message);}}
 C.collect(app).forEach(function(t){if(['defensiveArea','door','threat','stair','spawn'].indexOf(t.kind)>=0&&t.entity.render)t.entity.render.enabled=false;});
 // Spawns: friendlies = Soldier Preview positions (or friendly spawn markers), enemies = enemy spawn markers.
 var names=['ALPHA','BRAVO','CHARLIE','DELTA'],roles=['Rifleman','Rifleman','Rifleman','Rifleman'],defaults=[[-10,0,-10],[-11.5,0,-10],[-10,0,-12],[-11.5,0,-12]];
 var preview=app.root.findByName('Soldier Preview'),spawnTags=C.collect(app).filter(function(t){return t.kind==='spawn';});
 var specs=names.map(function(n,i){var m=spawnTags.find(function(t){return t.slot===n;});var e=!m&&preview&&preview.children.find(function(c){return c.name.indexOf(n)===0;});var src=m?m.entity:e;
  return {name:n,team:'friendly',role:roles[i],position:src?C.v3(src.getPosition()).slice():defaults[i],yaw:src?src.getEulerAngles().y:undefined};});
 spawnTags.filter(function(t){return t.team==='enemy';}).forEach(function(t){specs.push({name:t.slot||t.name,team:'enemy',role:'Defender',position:C.v3(t.entity.getPosition()).slice(),yaw:t.entity.getEulerAngles().y});});
 if(specs.filter(function(s){return s.team==='enemy';}).length===0)console.warn('[Tactical] no enemy spawn markers (tacticalTag Kind = Soldier spawn, Team = Enemy)');
 T.spawnPoints=specs;if(preview)preview.enabled=false;
 var asset=this.soldierAsset||app.assets.get(316061521);if(!asset)throw new Error('Soldier GLB asset not found - set Soldier GLB on Tactical Controller');
 var glb=T.soldierGlb=await new Promise(function(res,rej){var a=new pc.Asset('Tactical soldier','container',{url:'characters/dreading_newskin.glb',filename:'soldier.glb'});a.once('load',function(){res(a);});a.once('error',rej);app.assets.add(a);app.assets.load(a);});
 T.newSkin=true; // Keep the current character; no separate-arms asset is loaded.
 if(!T.newSkin&&globalThis.applyNightSurvivalMaterials)await globalThis.applyNightSurvivalMaterials(app,glb);
 T.clipNames=glb.resource.animations.map(function(a){return a.resource.name;});
 var colors={friendly:[[.36,.89,.74],[.95,.69,.29],[.32,.73,1],[.83,.55,1]],enemy:[[1,.35,.3]]};
 var discMat={};['friendly','enemy'].forEach(function(t){var m=new pc.StandardMaterial();m.diffuse=new pc.Color(0,0,0);m.emissive=t==='friendly'?new pc.Color(.25,.6,1):new pc.Color(1,.25,.2);m.useLighting=false;m.opacity=.75;m.blendType=pc.BLEND_NORMAL;m.depthWrite=false;m.update();discMat[t]=m;});
 var panel=document.querySelector('#squad');var noLoop=/death|hit_react|grenade_toss/;
 var spawnSoldiers=function(list){list.forEach(function(sp,i){var e=new pc.Entity(sp.name);e.setPosition(sp.position[0],sp.position[1],sp.position[2]);root.addChild(e);
  var model=glb.resource.instantiateRenderEntity();e.addChild(model);model.addComponent('anim',{activate:true});glb.resource.animations.forEach(function(a){model.anim.assignAnimation(a.resource.name,a.resource,undefined,1,!noLoop.test(a.resource.name));});
  var disc=new pc.Entity('team disc');disc.addComponent('render',{type:'cylinder',material:discMat[sp.team],castShadows:false,receiveShadows:false});disc.setLocalScale(.7,.01,.7);disc.setLocalPosition(0,.02,0);e.addChild(disc);
  e.addComponent('script');var s=e.script.create('tacticalSoldierDecision',{attributes:{soldierName:sp.name,role:sp.role,team:sp.team,advanceIndex:i%2}});e.script.create('tacticalSoldierAnimation');
  var col=sp.team==='friendly'?colors.friendly[i%4]:colors.enemy[0];s.color=new pc.Color(col[0],col[1],col[2]);s.css='rgb('+col.map(function(v){return Math.round(v*255);}).join(',')+')';s.model=model;
  s.label=document.createElement('div');s.label.className='label';document.body.appendChild(s.label);
  if(sp.team==='friendly'){s.row=document.createElement('div');s.row.className='row';s.row.onclick=function(ev){T.input&&T.input.select([s],ev.shiftKey);};panel.appendChild(s.row);}});
 if(T.grenades)T.squad.forEach(function(s){if(!s.nadeInv)T.grenades.giveInventory(s);});/* safety pass: every soldier carries its grenade kit */};
 T.spawnMultiplayerSoldiers=spawnSoldiers;
 var logReady=function(){console.log('TACTICAL_READY',JSON.stringify({soldiers:T.squad.length,engine:pc.version,clips:T.clipNames.length,navTriangles:T.report.info.navTriangles,coverCandidates:T.cover.candidates.length,errors:T.report.errors.length}));};
 var finishBoot=function(){T.orders.setupEnemies();T.ready=true;T.running=true;if(T.input)T.input.home();logReady();};
 var wantPrep=TacticalController.wantPrep();
 var prepBootReady=false,prepQueued=null,prepStarted=false;
 T.startMatch=function(plan){if(!wantPrep||prepStarted)return T;if(!prepBootReady){prepQueued=plan;return T;}prepStarted=true;
  var friends=TacticalController.buildFriendlySpecs(plan,specs.filter(function(s){return s.team==='friendly';}));
  var foes=specs.filter(function(s){return s.team==='enemy';});
  TacticalController.installLoadoutWrap(plan);spawnSoldiers(friends.concat(foes));TacticalController.applyPlanKits(T,plan);
  T.resources=TacticalController.remainingBudget(plan);finishBoot();app.fire('tactical:match-start',plan);return T;};
 if(!wantPrep)spawnSoldiers(specs);
 else if(typeof DreadingPrep!=='undefined'&&DreadingPrep.init){try{DreadingPrep.init(app,T);}catch(e){console.warn('[Tactical] prep init failed: '+e.message);}}
 var $=function(id){return document.querySelector('#'+id);};
 document.querySelectorAll('#tl-panel button').forEach(function(b){b.addEventListener('mousedown',function(e){e.preventDefault();});b.tabIndex=-1;});// never keep keyboard focus: Space/Enter must not press a panel button
 $('secure').onclick=function(){T.orders.order();};$('reset').onclick=function(){T.orders.reset((T.seedValue||1)+1);};// Reset = new seed; API reset() replays the current seed
 $('pause').onclick=function(){T.paused=!T.paused;};$('debug').onchange=function(e){T.debug=e.target.checked;};
 $('initiative').onclick=function(){T.initiative=!T.initiative;};$('home').onclick=function(){T.input&&T.input.home();};
 $('rebuild').onclick=function(){T.navigation.rebuild('button');};
 // pass 3: zombies (runtime script instance on this entity, model from the uploaded zombie GLB asset)
 var zAsset=app.assets.find('zombie-anims.bin');if(zAsset){try{var zglb=T.zombieGlb=await new Promise(function(res,rej){var a=new pc.Asset('Tactical zombie','container',{url:'characters/zombie/new-zombie.glb',filename:'zombie.glb'});a.once('load',function(){res(a);});a.once('error',rej);app.assets.add(a);app.assets.load(a);});
   var zs=this.entity.script.tacticalZombies||this.entity.script.create('tacticalZombies');zs.setup(zglb);}catch(e){console.warn('[Tactical] zombies unavailable: '+e.message);}}else console.warn('[Tactical] zombie-anims.bin asset not found: zombies off');
 $('zon').onchange=function(e){if(T.zombieMgr)T.zombieMgr.on=e.target.checked;};var zmax=(typeof TacticalZombies!=="undefined"&&TacticalZombies.CONFIG.maxAlive)||150,zmsg=function(t){var m=$('zmsg');if(m){m.textContent=t||'';m.style.display=t?'block':'none';}};/* fix150: a number field must never keep keyboard focus, or the global hotkeys (T = first person, F, digits...) stop working */$('zsize').onchange=function(e){var v=Math.round(+e.target.value)||10,c=Math.max(1,Math.min(zmax,v));if(T.zombieMgr)T.zombieMgr.waveSize=c;e.target.value=c;zmsg(c!==v?'Wave size limited to '+c+' (max '+zmax+' zombies alive).':'');e.target.blur();};$('zsize').onkeydown=function(e){if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.target.blur();}};
 $('zspawn').onclick=function(){var Z=T.zombieMgr;if(!Z)return;if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();var want=Z.waveSize;Z.onWaveDone=function(w,n){var al=T.zombies.filter(function(z){return z.alive;}).length;zmsg(n<w?'Spawned '+n+' of '+w+' ('+al+' alive, max '+zmax+(al<zmax?'; no more free spawn spots':'')+').':'');};var planned=Z.queueWave(want,'button');if(Z.queue)zmsg('Spawning '+planned+' zombies...');};$('eon').onchange=function(e){T.orders.setEnemySquad(e.target.checked);};
 // pass 4: procedural town (tacticalTown) - generated before the startup navmesh build so one rebuild covers it
 var tw=null;try{tw=this.entity.script.tacticalTown||this.entity.script.create('tacticalTown');}catch(e){console.warn('[Tactical] town script missing: '+e.message);}
 var tstat=function(msg){var el=$('tstat');if(!el||!tw)return;var st=tw.stats||{};el.textContent=msg||(st.on===false?'Town off':st.error?'Town: '+st.error:'Town seed '+st.seed+' ('+st.mode+'): '+st.count+' lots ('+st.kit+' kit, '+st.generated+' generated), '+st.roads+' road runs, '+st.tagEntities+' nav/cover boxes, '+st.drawCalls+' draw calls, built in '+st.totalMs+' ms');};
 var tbusy=false,townRun=function(fn,label){if(tbusy||!tw)return;tbusy=true;tstat(label+'...');Promise.resolve().then(fn).then(function(r){tbusy=false;tstat(r&&r.msg);}).catch(function(e){tbusy=false;tstat('Town error: '+e.message);console.error(e);});};
 if(tw){$('ton').checked=tw.opts.on;$('tseed').value=tw.opts.seed;$('tcount').value=tw.opts.count;$('tmode').value=tw.opts.mode;$('tdens').value=tw.opts.density;
  var topts=function(){return {on:$('ton').checked,seed:Math.round(+$('tseed').value)||1,count:Math.max(0,Math.min(40,Math.round(+$('tcount').value)||0)),mode:$('tmode').value,density:+$('tdens').value};};
  ['tseed','tcount','tdens','tmode'].forEach(function(id){$(id).addEventListener('change',function(e){e.target.blur();});$(id).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();e.target.blur();}});});
  $('ton').onchange=function(e){e.target.blur();townRun(function(){return tw.generate(topts(),true);},e.target.checked?'Generating town':'Removing town');};
  $('tregen').onclick=function(){townRun(function(){return tw.generate(topts(),true);},'Generating town');};
  $('tcycle').onclick=function(){var n=tw.nearest(tw.focusPoint());if(!n){tstat('No town building to cycle');return;}townRun(function(){return tw.cycle(n.id).then(function(r){return {msg:'Building #'+r.id+' '+r.type+(r.kit?' (kit)':'')+' -> '+r.state+' (built '+r.buildMs+' ms, nav '+r.navMs+' ms)'};});},'Changing building');};
  try{await tw.generate((globalThis.DreadingHordeLab||globalThis.DreadingTraining&&globalThis.DreadingTraining.enabled)?{on:false}:null,false);}catch(e){if(new URLSearchParams(location.search).get('assetMap')==='1'){var fail=document.createElement('div');fail.id='map-load-error';fail.style.cssText='position:fixed;inset:20%;z-index:30000;background:#171b17;color:#fff;padding:30px;font:18px system-ui';fail.textContent='Carentan could not load. Please reload to retry. '+e.message;document.body.appendChild(fail);throw e;}console.warn('[Tactical] town generation failed: '+(e.stack||e));}tstat();}
 if(globalThis.DreadingTraining&&globalThis.DreadingTraining.enabled)globalThis.DreadingTraining.buildScene(T,app,C);
 if(globalThis.DreadingHordeLab)DreadingHordeLab.buildScene(T,app,C);await T.navigation.rebuild('startup');if(globalThis.DreadingImportedMap&&T.look&&T.look.prewarmModes){if(tw)await tw.busy('Preparing first-person view…');try{await T.look.prewarmModes();}finally{if(tw)await tw.busy(null);}}if(!wantPrep)finishBoot();else{prepBootReady=true;if(prepQueued)T.startMatch(prepQueued);}
 var api={app:app,T:T,town:tw?{generate:function(o){return tw.generate(o||{},true);},setOn:function(on){return tw.generate({on:!!on},true);},setState:function(id,st){return tw.setState(id,st);},cycle:function(id){return tw.cycle(id);},list:function(){return tw.list();},stats:function(){return tw.stats;},nearest:function(p){return tw.nearest(p);},script:tw}:null,order:function(){T.orders.order();},reset:function(seed){T.orders.reset(seed);},rebuild:function(r){return T.navigation.rebuild(r||'api');},
  path:function(a,b){return T.navigation.path(a,b);},seed:function(n){T.seedValue=n;C.seed(n);},zombies:function(){return T.zombieMgr;},enemySquad:function(on){T.orders.setEnemySquad(on);},
  soldier:function(n){return T.squad.find(function(s){return s.soldierName===n;});},
  moveEntity:function(name,pos){var e=app.root.findByName(name);if(!e)throw new Error('no entity '+name);e.setPosition(pos[0],pos[1],pos[2]);return C.v3(e.getPosition());},
  shapes:function(kinds){return C.collect(app).filter(function(t){return !kinds||kinds.indexOf(t.kind)>=0;}).map(function(t){var o=C.shape(t.entity);return {name:t.name,kind:t.kind,center:C.v3(o.center),half:o.half,axes:o.axes.map(C.v3)};});},
  getState:function(){var ZM=T.zombieMgr;return {seed:T.seedValue,zombies:ZM?{on:ZM.on,wave:ZM.wave,alive:T.zombies.filter(function(z){return z.alive;}).length,active:T.zombies.length,pool:ZM.pool.length,stats:Object.assign({},ZM.stats),ms:ZM.ms,stuck:T.zombies.reduce(function(a,z){return a+(z.stuck||0);},0),states:T.zombies.reduce(function(a,z){if(z.alive)a[z.state]=(a[z.state]||0)+1;return a;},{})}:null,fallbacks:T.fallbacks||0,resupplies:T.resupplies||0,enemySquad:!T.enemySquadOff,tuning:T.tuning,hunt:T.orders.hunt&&{reason:T.orders.hunt.reason,bounds:T.orders.hunt.bounds,target:T.orders.hunt.target&&T.orders.hunt.target.name,members:T.orders.hunt.members.map(function(s){return s.soldierName;})},fps:T.input&&T.input.fps?{soldier:T.input.fps.s.soldierName,yaw:T.input.fps.yaw,pitch:T.input.fps.pitch,airY:T.input.fps.airY,jumps:T.input.fps.jumps}:null,elapsed:T.elapsed,running:T.running,paused:T.paused,initiative:T.initiative,outcome:T.outcome,navVersion:T.navigation.version,report:{errors:T.report.errors,warnings:T.report.warnings,info:T.report.info},counters:T.combat.counters,assault:T.orders.assault&&{phase:T.orders.assault.phase,members:T.orders.assault.members.map(function(s){return s.soldierName;})},
   selected:(T.selection||[]).map(function(s){return s.soldierName;}),camera:C.v3(T.camera.getPosition()),
   soldiers:T.squad.map(function(s){return {name:s.soldierName,team:s.team,alive:s.alive,health:+s.health.toFixed(1),mag:s.arms.mag,reserve:s.arms.reserve,reloading:!!s.arms.reload,position:s.pos().map(function(v){return +v.toFixed(2);}),order:s.order&&{type:s.order.type,phase:s.order.phase,slot:s.order.slot},inCover:s.inCover,crouch:+s.crouchAmt.toFixed(2),decision:s.decision,target:s.target&&s.target.soldierName,
    known:s.memory?s.memory.records.filter(function(r){return r.timeLastSensed>-1e9;}).map(function(r){return {name:r.entity.soldierName,visible:r.visible,lastSeen:+r.timeLastSensed.toFixed(2),pos:r.lastSensedPosition.map(function(v){return +v.toFixed(1);})};}):[],history:s.history.slice(),holdFireSec:+(s.holdFireSec||0).toFixed(2),anim:(function(){var a=s.entity.script.tacticalSoldierAnimation;return a?{current:a.current,stats:Object.fromEntries(Object.entries(a.stats).map(function(kv){return [kv[0],+kv[1].toFixed(2)];})),rateClamped:+a.rateClamped.toFixed(2),moveTime:+a.moveTime.toFixed(2)}:null;})()};}),events:T.events.slice()};}};
 window.tactical=api;
 if(globalThis.DreadingTraining&&globalThis.DreadingTraining.enabled)globalThis.DreadingTraining.start(T);
 /* pass 4c: always-visible perf overlay (browser rAF fps/ms, worst frame, zombies, draw calls, canvas px, engine flavour, build). */
 (function(){var el=document.createElement('div');el.id='tl-perf';el.style.cssText='position:fixed;right:6px;top:6px;z-index:50;background:#0008;color:#cfe;opacity:.72;font:9.5px/1.3 monospace;padding:2px 5px;border-radius:4px;pointer-events:none;white-space:pre;max-width:300px;overflow:hidden';document.body.appendChild(el);
  var gd=app.graphicsDevice,dbg=/playcanvas[^\/ ]*\.dbg\.js/i.test([].map.call(document.scripts,function(x){return x.src;}).join(' '))||/[?&]debug=true/.test(location.search),dc=0,dcN=0,dcMax=0;
  app.on('frameend',function(){var d=app.stats&&app.stats.drawCalls?app.stats.drawCalls.total:0;dc+=d;dcN++;if(d>dcMax)dcMax=d;});
  var last=performance.now(),acc=0,n=0,worst=0,t0=last,txt='';
  function tick(now){var f=now-last;last=now;acc+=f;n++;if(f>worst)worst=f;if(now-t0>=500){var ms=acc/n,za=(T.zombies||[]).filter(function(z){return z.alive;}).length,
    t=(1000/ms).toFixed(0)+' fps '+ms.toFixed(1)+'ms max'+worst.toFixed(0)+'  z'+za+' dc'+(dcN?Math.round(dc/dcN):0)+'\n'+gd.width+'x'+gd.height+'@'+(gd.maxPixelRatio||1).toFixed(2)+' dpr'+(window.devicePixelRatio||1).toFixed(2)+(dbg?' DEBUG':'')+'  pc'+pc.version+'\n'+TacticalController.BUILD;
    if(t!==txt){el.textContent=txt=t;}var hp=document.querySelector('#tl-help'),am=document.querySelector('#tl-ammo');if(hp&&am){var hb=(hp.offsetHeight?hp.offsetHeight+20:24)+'px';if(am.style.bottom!==hb)am.style.bottom=hb;}/* keep the FP ammo counter above the controls help */acc=0;n=0;worst=0;t0=now;dc=0;dcN=0;dcMax=0;}requestAnimationFrame(tick);}
  requestAnimationFrame(tick);})();
};
