/* DREADING prep screen: full-screen pre-match roster + loadout (library IIFE, asset 316090009).
   UI pass 3 "Field Inventory": hinged-case frame, off-white paper dossier + comparison card, acid/blood accents, bundled
   gun renders (game/ui/guns/<weaponId>.webp, made offline from weapons/manifest.json GLBs; line-art fallback per category).
   Styled with DreadingHUD.THEME / --tlh-* (calls DreadingHUD.css() on init). No per-frame work; DOM built once;
   innerHTML writes only when markup changes; events delegated; listeners removed after launch.
   Wires to TacticalArsenal (list/cost/menuStats/attachments/slots/equip) and TacticalGrenades.cost when present,
   and to TacticalWeaponModels.manifest for Night Guns attachment sockets when the arsenal API is still missing.
   Multiplayer hook: DreadingPrep.open({playerId, playerName, budget, onReady, onChange, mode}) or mode:'hotseat'
   with two players. Emits tactical:prep-change / prep-ready / prep-all-ready / prep-launch. Solo still calls
   T.startMatch(plan). */
(function(g){'use strict';
var P=g.DreadingPrep={};

/* ---- PLACEHOLDER DESIGN DATA (Troop Designer first-pass). Roster/economy only, NOT gun stats. ---- */
P.TEST_UNLIMITED=true;P.BUDGET={scrap:1000000,fortify:1000000};
P.MAX=DreadingCatalogue.capacity;P.MIN=1;
P.CALLSIGNS=['ALPHA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT'];
P.ROSTER=[
 {id:'scavenger',name:'Scavenger',scrap:80,hp:100,note:'Backbone. Pistol or pipe shotgun; mid-tree AR/SMG.'},
 {id:'bow',name:'Bow hunter',scrap:90,hp:90,note:'Quiet hunting bow. Poor volume into a wave.'},
 {id:'engineer',name:'Engineer',scrap:130,hp:100,note:'Central to prep, scaffolding, mounts, power.'},
 {id:'scout',name:'Recon scout',scrap:110,hp:80,note:'Fast, light, 360 backpack camera.'},
 {id:'support',name:'Support',scrap:140,hp:110,note:'Planted mount or salvaged LMG. Needs a lane.'},
 {id:'medic',name:'Medic',scrap:120,hp:90,note:'Stabilizes downed friendlies. Does not tank.'},
 {id:'lead',name:'Squad lead',scrap:140,hp:90,note:'Optional walkie / morale aura. One per squad.'},
 {id:'marksman',name:'Marksman',scrap:130,hp:150,note:'Precision rifle specialist. Starts with an SVD; customize weapons and optics.'},
 {id:'artillery',name:'Mortar operator',scrap:160,hp:150,note:'Long-range bombardment tube; pistol defense, 6 shells and 6 frag grenades.'},
 {id:'rocketeer',name:'Bazooka soldier',scrap:140,hp:150,note:'Explosive rocket launcher with pistol backup.'},
 {id:'elite',name:'Elite operative',scrap:160,hp:95,note:'Late research unlock.',locked:true}
];
/* Placeholder weapon costs by category — used only when TacticalArsenal.cost is missing. */
P.COST_BY_CAT={ar:40,smg:35,sniper:55,shotgun:30,pistol:15,rifle:40,bow:12,launcher:20,support:50,lmg:50,dmr:50};
/* Placeholder grenade costs — used only when TacticalGrenades.cost is missing. Design doc: 6-12. */
P.NADE_COST={frag:6,smoke:8,flash:8};
P.NADE_DEFAULT={frag:2,smoke:1,flash:1};
/* Placeholder attachment costs by socket — used only when the arsenal does not publish a cost. */
P.ATT_COST={muzzle:12,top_rail:15,optic:15,underbarrel:8,side_rail:8,laser:8,light:8,mag:10,stock:8,grip:6,handguard:8,barrel:10,casing_left:4,casing_right:4,casing_top:4};
P.SLOT_LABEL={muzzle:'Muzzle',top_rail:'Optic',optic:'Optic',underbarrel:'Underbarrel',side_rail:'Rail',laser:'Laser',light:'Light',mag:'Magazine',stock:'Stock',grip:'Grip',handguard:'Handguard',barrel:'Barrel',casing_left:'Casing L',casing_right:'Casing R',casing_top:'Casing top'};
P.CAT_LABEL={all:'All',ar:'Rifle',rifle:'Rifle',smg:'SMG',lmg:'LMG',support:'LMG',dmr:'DMR',sniper:'Sniper',shotgun:'Shotgun',pistol:'Pistol',bow:'Bow',launcher:'Launcher'};
P.CAT_ORDER=['all','ar','smg','lmg','dmr','sniper','shotgun','pistol','bow','launcher'];
P.GEAR_SLOTS=['top_rail','optic','muzzle','underbarrel','side_rail','laser','light','mag','stock','grip','handguard','barrel'];

P.cls=function(id){for(var i=0;i<P.ROSTER.length;i++)if(P.ROSTER[i].id===id)return P.ROSTER[i];return null;};
P._nsW=function(){var NS=g.TacticalNS;return NS&&NS.WEAPONS?NS.WEAPONS:{};};
P._ar=function(){return g.TacticalArsenal||null;};
P._tg=function(){return g.TacticalGrenades||null;};
P._twm=function(){return g.TacticalWeaponModels||null;};
P._manifest=function(){var T=P._twm();return T&&T.manifest?T.manifest:P._manifestCache||null;};

P.catOf=function(def){var c=(def&&(def.cat||def.fam))||'?';if(c==='rifle')return 'ar';if(c==='support')return 'lmg';return c;};
P.catLabel=function(c){return P.CAT_LABEL[c]||c||'?';};
P.isUnlocked=function(def){if(!def)return true;if(def.unlocked===false||def.locked===true)return false;return true;};

P.weapons=function(){var NS=g.TacticalNS,AR=P._ar(),ids,out=[],i,id,d,M=P._manifest(),seen={};
 if(AR&&typeof AR.list==='function')ids=AR.list();
 else if(NS&&NS.WEAPONS)ids=Object.keys(NS.WEAPONS);
 else ids=[];
 for(i=0;i<ids.length;i++){
  id=ids[i];d=(NS&&NS.WEAPONS&&NS.WEAPONS[id])||{id:id,name:id,cat:'?'};
  out.push({id:id,def:d,name:d.name||id,cat:P.catOf(d),unlocked:P.isUnlocked(d),tier:d.tier,hasModel:!!(M&&M.weapons&&M.weapons[id])});
  seen[id]=1;
 }
 /* Manifest-only guns (no combat def) stay visible but locked — they cannot be applied until the arsenal owns them. */
 if(M&&M.weapons){for(id in M.weapons){if(!Object.prototype.hasOwnProperty.call(M.weapons,id)||seen[id])continue;
  out.push({id:id,def:{id:id,name:id,cat:'?'},name:id,cat:'?',unlocked:false,hasModel:true,missingDef:true});}}
 return out;};

P.weaponCost=function(id,def){var AR=P._ar(),NS=g.TacticalNS,n;
 if(!def)def=(P._wmap&&P._wmap[id]&&P._wmap[id].def)||(NS&&NS.WEAPONS&&NS.WEAPONS[id]);
 if(AR&&typeof AR.cost==='function'){try{n=AR.cost(id);if(n!=null&&n===n)return n|0;}catch(e){}}
 if(def&&def.cost!=null)return def.cost|0;
 var cat=P.catOf(def)||'ar';return P.COST_BY_CAT[cat]!=null?P.COST_BY_CAT[cat]:30;};

P.attCost=function(att){var a=att;if(typeof a==='string')a=P._attMap&&P._attMap[a]||{id:a};
 if(a&&a.cost!=null)return a.cost|0;
 return P.ATT_COST[a&&(a.slot||a.socket)]!=null?P.ATT_COST[a.slot||a.socket]:8;};

P.weaponLoadoutCost=function(id,atts){var AR=P._ar(),n,i,has=atts&&atts.length;
 if(AR&&typeof AR.cost==='function'){try{n=has&&AR.cost.length>=2?AR.cost(id,atts):AR.cost(id);
  if(n!=null&&n===n){n=n|0;if(!has||AR.cost.length>=2)return n;for(i=0;i<atts.length;i++)n+=P.attCost(atts[i]);return n;}}catch(e){}}
 n=P.weaponCost(id);for(i=0;i<(atts||[]).length;i++)n+=P.attCost(atts[i]);return n;};

P.nadeCost=function(ty){var TG=P._tg(),c;if(TG&&TG.cost){if(typeof TG.cost==='function')return TG.cost(ty)|0;if(TG.cost[ty]!=null)return TG.cost[ty]|0;}
 return P.NADE_COST[ty]!=null?P.NADE_COST[ty]:6;};

P.norms=function(list){var n={dmg:[1e9,0],rpm:[1e9,0],rng:[1e9,0],spr:[1e9,0],move:[1e9,0]},i,d;
 function acc(k,v){if(!(v>=0)&&!(v<0))return;if(v<n[k][0])n[k][0]=v;if(v>n[k][1])n[k][1]=v;}
 for(i=0;i<list.length;i++){d=list[i].def||{};acc('dmg',d.dmg?((d.dmg[0]||0)+(d.dmg[1]||0))/2:0);acc('rpm',d.rpm||0);acc('rng',d.range?(d.range[1]||d.range[0]||0):0);acc('spr',d.spread?d.spread[0]:0);acc('move',d.move!=null?d.move:1);}
 return n;};
function norm(n,v,inv){var a=n[0],b=n[1];if(b<=a)return 0.5;var t=(v-a)/(b-a);if(inv)t=1-t;return t<0?0:t>1?1:t;}
P.menuStats=function(def,norms,id,atts){var AR=P._ar(),s;
 if(AR&&typeof AR.menuStats==='function'){try{s=AR.menuStats(id||(def&&def.id),atts);if(s)return s;}catch(e){}}
 var dmg=(def&&def.dmg)?((def.dmg[0]||0)+(def.dmg[1]||0))/2:0,rpm=(def&&def.rpm)||0,rng=(def&&def.range)?(def.range[1]||def.range[0]||0):0,spr=(def&&def.spread)?def.spread[0]:0,mov=def&&def.move!=null?def.move:1;
 norms=norms||P._norms||{dmg:[0,100],rpm:[0,1000],rng:[0,200],spr:[0,0.3],move:[0.7,1.1]};
 return {dmg:norm(norms.dmg,dmg),acc:norm(norms.spr,spr,true),rng:norm(norms.rng,rng),rof:norm(norms.rpm,rpm),mob:norm(norms.move,mov),est:true};};

P.prettyAtt=function(att){if(!att)return '';if(att.name)return att.name;
 var id=att.id||'',fam=(att.family||'').toLowerCase(),vn=att.variant_name||att.variantName,parts;
 if(fam||vn)return (fam?fam.charAt(0).toUpperCase()+fam.slice(1):'')+(vn?(' \u00b7 '+vn):'');
 parts=id.split('_').filter(function(x){return x&&!/^\d+$/.test(x);});
 return parts.map(function(w){return w.charAt(0).toUpperCase()+w.slice(1);}).join(' ')||id;};

P.attachments=function(weaponId){var AR=P._ar(),list,i,a,out=[],M,w,socks,pid,p,slot,seen={};
 if(AR&&typeof AR.attachments==='function'){try{list=AR.attachments(weaponId);}catch(e){list=null;}
  if(list&&list.length){for(i=0;i<list.length;i++){a=list[i]||{};slot=a.slot||a.socket||'gear';
   out.push({id:a.id,slot:slot,name:a.name||P.prettyAtt(a),cost:a.cost,mods:a.mods,tags:a.tags,family:a.family,source:'arsenal'});}
   return out;}}
 M=P._manifest();if(M&&M.parts){w=weaponId&&M.weapons&&M.weapons[weaponId];socks=w&&w.sockets?w.sockets:null;
  for(pid in M.parts){if(!Object.prototype.hasOwnProperty.call(M.parts,pid))continue;p=M.parts[pid]||{};slot=p.socket||p.slot||'gear';
   if(socks&&!socks[slot])continue;
   out.push({id:pid,slot:slot,name:P.prettyAtt({id:pid,family:p.family,variant_name:p.variant_name}),cost:p.cost,family:p.family,variant:p.variant,source:'models'});}}
 return out;};

P.slots=function(weaponId){var AR=P._ar(),atts=P.attachments(weaponId),i,s,out=[],seen={};
 if(AR&&typeof AR.slots==='function'){try{s=AR.slots(weaponId);if(s&&s.length){for(i=0;i<s.length;i++)out.push(typeof s[i]==='string'?s[i]:(s[i].id||s[i].slot));return out;}}catch(e){}}
 for(i=0;i<atts.length;i++){s=atts[i].slot;if(s&&!seen[s]){seen[s]=1;out.push(s);}}
 return out;};

P.attsFor=function(u,which){if(!u)return [];which=which||'primary';if(which==='secondary')return u.secondaryAttachments?u.secondaryAttachments.slice():[];return u.attachments?u.attachments.slice():[];};
P.setAtts=function(u,which,ids){if(!u)return;ids=ids?ids.slice():[];if(which==='secondary')u.secondaryAttachments=ids;else u.attachments=ids;u.attByWeapon=u.attByWeapon||{};var wid=which==='secondary'?u.secondary:u.primary;if(wid)u.attByWeapon[wid]=ids.slice();};

P.unitCost=function(u){var c=P.cls(u.clsId||u.cls),n=0,g;
 n+=c?c.scrap:0;n+=P.weaponLoadoutCost(u.primary,P.attsFor(u,'primary'));n+=P.weaponLoadoutCost(u.secondary,P.attsFor(u,'secondary'));
 g=u.grenades||{};n+=(g.frag|0)*P.nadeCost('frag')+(g.smoke|0)*P.nadeCost('smoke')+(g.flash|0)*P.nadeCost('flash');return n;};
P.spent=function(squad){var i,n=0,s=squad||(P.state&&P.state.squad)||[];for(i=0;i<s.length;i++)n+=P.unitCost(s[i]);return n;};
P.budgetOf=function(st){return (st&&st.budget)||(P.session&&P.session.budget)||P.BUDGET;};
P.remaining=function(squad,st){var b=P.budgetOf(st||P.state);return {scrap:P.TEST_UNLIMITED?1000000:b.scrap-P.spent(squad),fortify:b.fortify,batteries:0};};
P.canLaunch=function(squad,st){var s=squad||(P.state&&P.state.squad)||[],r=P.remaining(s,st||P.state);return s.length>=P.MIN&&s.length<=P.MAX&&r.scrap>=0;};
P.buildPlan=function(squad,insertion,st){var s=squad||(P.state&&P.state.squad)||[],owner=st||P.state,r=P.remaining(s,owner);
 return {squad:s.map(function(u){return {name:u.name,groupId:u.groupId,packageId:u.packageId,cls:u.cls,clsId:u.clsId,primary:u.primary,secondary:u.secondary,attachments:P.attsFor(u,'primary'),secondaryAttachments:P.attsFor(u,'secondary'),grenades:{frag:u.grenades.frag|0,smoke:u.grenades.smoke|0,flash:u.grenades.flash|0}};}),insertion:insertion||null,scrap:r.scrap,fortify:r.fortify,resources:r,playerId:owner&&owner.playerId||null,playerName:owner&&owner.playerName||null};};
P.quickSquad=function(){var w=P.weapons(),ids=w.map(function(x){return x.id;}),p=ids.indexOf('m4')>=0?'m4':(ids[0]||'m4'),s=ids.indexOf('m9')>=0?'m9':(ids[1]||p);
 return P.CALLSIGNS.slice(0,4).map(function(name){return {name:name,cls:'Scavenger',clsId:'scavenger',primary:p,secondary:s,attachments:[],secondaryAttachments:[],attByWeapon:{},grenades:{frag:2,smoke:1,flash:1}};});};

P.state={view:'roster',tab:'primary',squad:[],sel:0,armed:false,dead:false,cat:'all',gearSlot:'primary',ready:false,playerId:'p1',playerName:'Player 1',budget:null,preview:null};
P.session={mode:'solo',players:[],activeId:'p1',budget:P.BUDGET};
P._nodes={};

P._newPlayer=function(o,budget){o=o||{};return {playerId:o.playerId||o.id||'p1',playerName:o.playerName||o.name||'Player 1',budget:o.budget||budget||{scrap:P.BUDGET.scrap,fortify:P.BUDGET.fortify},squad:[],sel:0,view:'roster',tab:'primary',cat:'all',gearSlot:'primary',ready:false,armed:true,dead:false};};

P.player=function(id){var s=P.session,i;if(!s||!s.players)return P.state;id=id||s.activeId;for(i=0;i<s.players.length;i++)if(s.players[i].playerId===id)return s.players[i];return P.state;};
P.getPlan=function(id){return P.buildPlan(P.player(id).squad,null,P.player(id));};
P.getPlans=function(){var s=P.session,o={},i,pl;if(!s||!s.players||!s.players.length){o[(P.state.playerId||'p1')]=P.buildPlan();return o;}
 for(i=0;i<s.players.length;i++){pl=s.players[i];o[pl.playerId]=P.buildPlan(pl.squad,null,pl);}return o;};
P.isAllReady=function(){var s=P.session,i;if(!s||!s.players||!s.players.length)return !!(P.state&&P.state.ready);
 for(i=0;i<s.players.length;i++)if(!s.players[i].ready||!P.canLaunch(s.players[i].squad,s.players[i]))return false;return true;};

P._fire=function(name,payload){if(P.app&&typeof P.app.fire==='function')P.app.fire(name,payload);
 if(typeof document!=='undefined'&&document.dispatchEvent){try{document.dispatchEvent(new CustomEvent(name,{detail:payload}));}catch(e){}}
 if(g.dispatchEvent&&g.CustomEvent){try{g.dispatchEvent(new CustomEvent(name,{detail:payload}));}catch(e){}}};

P._emitChange=function(){var plan=P.buildPlan(),meta={playerId:P.state.playerId,playerName:P.state.playerName,plan:plan,mode:P.session&&P.session.mode};
 if(P._cb&&P._cb.onChange)try{P._cb.onChange(plan,meta);}catch(e){}
 P._fire('tactical:prep-change',meta);};

P._emitReady=function(pl){var plan=P.buildPlan(pl.squad,null,pl),meta={playerId:pl.playerId,playerName:pl.playerName,plan:plan,ready:!!pl.ready,mode:P.session&&P.session.mode};
 if(P._cb&&P._cb.onReady)try{P._cb.onReady(plan,meta);}catch(e){}
 P._fire('tactical:prep-ready',meta);
 if(P.isAllReady()){var all={plans:P.getPlans(),players:(P.session.players||[]).map(function(p){return {playerId:p.playerId,playerName:p.playerName,ready:!!p.ready};}),mode:P.session.mode};
  if(P._cb&&P._cb.onAllReady)try{P._cb.onAllReady(all.plans,all);}catch(e){}
  P._fire('tactical:prep-all-ready',all);}};

P.refreshCatalog=function(){var list=P.weapons(),i,n=P._nodes;P._weapons=list;P._wmap={};P._norms=P.norms(list);
 for(i=0;i<list.length;i++)P._wmap[list[i].id]=list[i];
 P._attCache={};P._attMap={};
 if(n&&n.primary&&P._canBuild()){P._renderWeaponLists();P._fillGear();P.sync();}
 return list;};

P._filterWeapons=function(list,slot,cat){var out=[],i,w;list=list||P._weapons||P.weapons();
 for(i=0;i<list.length;i++){w=list[i];if(cat&&cat!=='all'&&w.cat!==cat)continue;out.push(w);}
 return out;};

P._catsIn=function(list){var seen={all:1},out=['all'],i,c,j;
 for(i=0;i<list.length;i++){c=list[i].cat;if(c&&!seen[c]){seen[c]=1;}}
 for(j=0;j<P.CAT_ORDER.length;j++)if(seen[P.CAT_ORDER[j]]&&P.CAT_ORDER[j]!=='all')out.push(P.CAT_ORDER[j]);
 for(c in seen){if(c!=='all'&&!P.CAT_LABEL[c]&&seen[c]&&out.indexOf(c)<0)out.push(c);}
 return out;};

/* ---------- UI pass 3: "Field Inventory" (hinged case, paper panels, acid/blood accents). DOM built once. ---------- */
P.base=function(){var H=g.DreadingHUD;return (H&&H.BASE)||g.DREADING_UI_BASE||'ui/';};
P.STAT_KEYS=[['dmg','Damage'],['acc','Accuracy'],['rng','Range'],['rof','Fire rate'],['mob','Mobility']];
P.esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':c==='>'?'&gt;':'&quot;';});};
/* Line-art fallback per category (used only when a gun has no bundled render). viewBox 240x90, barrel to the right. */
P.CAT_SVG={
 ar:'M10 40 40 34 40 52 16 60Z M40 31H124V48H40Z M124 34H180V45H124Z M180 38H226 M92 48 99 74 111 72 106 48 M64 48 58 67 69 67 76 48 M84 23H110V31H84Z',
 smg:'M30 38 52 34 52 50 34 56Z M52 31H140V48H52Z M140 36H178 M98 48 101 80 112 80 110 48 M72 48 66 66 77 66 84 48',
 pistol:'M70 30H178V44H70Z M82 44H150L144 52H116L108 80H90L96 52H82Z M118 52 126 60',
 shotgun:'M8 42 44 34 44 52 14 60Z M44 32H112V47H44Z M112 34H228 M112 41H190V47H112Z M70 47 64 66 75 66 82 47',
 sniper:'M8 40 46 33 46 52 14 60Z M46 32H128V47H46Z M128 37H230 M70 22H122V29H70Z M84 29V32 M110 29V32 M84 47 80 66 91 66 95 47 M200 41 186 72 M200 41 214 72',
 dmr:'M8 40 46 33 46 52 14 60Z M46 32H128V47H46Z M128 37H222 M72 22H120V29H72Z M100 47 104 72 115 70 112 47 M70 47 64 66 75 66 82 47',
 lmg:'M8 40 42 33 42 52 14 60Z M42 30H136V48H42Z M136 35H226 M84 48H120V72H84Z M60 48 54 66 65 66 72 48 M196 40 184 72 M196 40 208 72',
 bow:'M120 8Q60 45 120 82 M120 8V82 M80 45H226 M214 39 226 45 214 51',
 launcher:'M20 30H210V54H20Z M210 26V58 M70 54 64 76 76 76 82 54 M120 54V70H132V54 M90 18H120V30H90Z'};
P.catSVG=function(cat,cls){var d=P.CAT_SVG[cat]||P.CAT_SVG[cat==='rifle'?'ar':cat==='support'?'lmg':'ar'];
 return '<svg class="'+(cls||'gun')+' line" viewBox="0 0 240 90" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="'+d+'"/></svg>';};
P.gunImg=function(id,cat,cls){if(!id)return P.catSVG(cat||'ar',cls);if(id==='bazooka')return P.catSVG('launcher',cls);if(P._noImg&&P._noImg[id])return P.catSVG(cat,cls);
 return '<img class="'+(cls||'gun')+'" data-gun="'+P.esc(id)+'" data-gcat="'+P.esc(cat||'ar')+'" src="'+P.base()+'guns/'+encodeURIComponent(id)+'.webp" alt="" draggable="false">';};
P._onImgErr=function(e){var t=e.target;if(!t||t.tagName!=='IMG'||!t.getAttribute('data-gun'))return;P._noImg=P._noImg||{};P._noImg[t.getAttribute('data-gun')]=1;
 var w=document.createElement('span');w.innerHTML=P.catSVG(t.getAttribute('data-gcat'),t.className);if(t.parentNode)t.parentNode.replaceChild(w.firstChild,t);};
P.NADE_SVG={
 frag:'<svg viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="28" cy="36" rx="14" ry="17"/><path d="M22 20h12v-6H22z M34 16l12 10 M18 30h20 M16 40h24"/><circle cx="44" cy="12" r="4"/></svg>',
 smoke:'<svg viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2"><rect x="18" y="16" width="22" height="38" rx="2"/><path d="M18 24h22 M22 16v-5h14v5 M36 11l10 8 M24 32h10 M24 38h10"/></svg>',
 flash:'<svg viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="2"><rect x="19" y="16" width="20" height="38" rx="3"/><path d="M23 11h12v5H23z M35 12l11 8"/><circle cx="25" cy="28" r="2"/><circle cx="33" cy="28" r="2"/><circle cx="25" cy="38" r="2"/><circle cx="33" cy="38" r="2"/><circle cx="25" cy="48" r="2"/><circle cx="33" cy="48" r="2"/></svg>'};

P.css=function(){if(typeof DreadingHUD!=='undefined'&&DreadingHUD.css)DreadingHUD.css();
 var s=document.getElementById('tl-prep-css')||document.createElement('style'),B=P.base(),PAPER='url("'+B+'paper.webp")',SOLDIER='url("'+B+'soldier.webp")';s.id='tl-prep-css';
 s.textContent=[
  '#tl-prep{position:fixed;inset:0;z-index:40;display:flex;padding:14px 20px;background:#040504 radial-gradient(ellipse at 50% 40%,#151815 0%,#060706 70%);color:var(--tlh-text,#ecebe4);font:13px/1.35 var(--tlh-font,system-ui,sans-serif);text-transform:uppercase;letter-spacing:.06em;transition:opacity .45s ease;-webkit-font-smoothing:antialiased}',
  '#tl-prep.out{opacity:0;pointer-events:none}',
  '#tl-prep *{box-sizing:border-box}',
  '#tl-prep button{font:inherit;color:inherit;text-transform:inherit;letter-spacing:inherit}',
  '#tl-prep .fx{position:absolute;inset:0;pointer-events:none;z-index:6;background-image:var(--tlh-grain),var(--tlh-scan),radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.55) 100%)}',
  '#tl-prep .mono{font-family:var(--tlh-font-mono,monospace)}',
  /* hinged case */
  '#tl-prep .case{position:relative;flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;padding:14px 22px 10px;background:#0c0e0d;background-image:linear-gradient(180deg,rgba(255,255,255,.04),transparent 26%),var(--tlh-grain);border:2px solid #252925;border-radius:12px;box-shadow:inset 0 0 0 5px #090a09,inset 0 0 0 6px #2a2f2a,inset 0 0 50px rgba(0,0,0,.7),0 0 0 1px #000,0 24px 60px rgba(0,0,0,.85)}',
  '#tl-prep .latch,#tl-prep .hinge{position:absolute;background:linear-gradient(90deg,#171a17,#2b302b 50%,#171a17);border:1px solid #3a403a;border-radius:2px;box-shadow:0 2px 6px rgba(0,0,0,.6)}',
  '#tl-prep .latch{width:12px;height:52px}#tl-prep .l1{left:-9px;top:20%}#tl-prep .l2{left:-9px;bottom:20%}#tl-prep .l3{right:-9px;top:20%}#tl-prep .l4{right:-9px;bottom:20%}',
  '#tl-prep .hinge{height:10px;width:84px;top:-7px;background:linear-gradient(180deg,#2b302b,#141614)}#tl-prep .h1{left:22%}#tl-prep .h2{right:22%}#tl-prep .h3{left:22%;top:auto;bottom:-7px}#tl-prep .h4{right:22%;top:auto;bottom:-7px}',
  /* header */
  '#tl-prep .hd{display:flex;align-items:center;gap:20px;padding:2px 0 10px;border-bottom:1px solid rgba(236,235,228,.16)}',
  '#tl-prep .brand{display:flex;flex-direction:column;gap:3px}',
  '#tl-prep .brand b{font:400 30px/1 var(--tlh-font-stencil);letter-spacing:.03em;color:#f1f0ea}',
  '#tl-prep .brand span{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.2em;color:var(--tlh-muted)}',
  '#tl-prep .bc{width:88px;height:28px;opacity:.85;background:repeating-linear-gradient(90deg,#ecebe4 0 2px,transparent 2px 4px,#ecebe4 4px 5px,transparent 5px 8px,#ecebe4 8px 11px,transparent 11px 13px)}',
  '#tl-prep .acidtag{background:var(--tlh-acid);color:#0b0c0b;font:400 10px/1.15 var(--tlh-font-mono);letter-spacing:.08em;padding:4px 6px;max-width:110px}',
  '#tl-prep .step{flex:1;font:400 11px/1 var(--tlh-font-mono);letter-spacing:.22em;color:var(--tlh-muted)}',
  '#tl-prep .step b{color:var(--tlh-text);font-weight:400}',
  '#tl-prep .players{display:flex;gap:6px}#tl-prep .players[hidden]{display:none}',
  '#tl-prep .pl{border:1px solid rgba(236,235,228,.25);background:rgba(236,235,228,.03);padding:6px 14px;cursor:pointer;font:500 15px/1.1 var(--tlh-font);letter-spacing:.12em;text-align:left;min-width:132px}',
  '#tl-prep .pl .rk{display:block;margin-top:3px;font:400 9px/1 var(--tlh-font-mono);letter-spacing:.18em;color:#ff4a50}',
  '#tl-prep .pl.ready .rk{color:var(--tlh-acid)}',
  '#tl-prep .pl.on{background:var(--tlh-paper) '+PAPER+';color:#111;border-color:#fff}#tl-prep .pl.on .rk{color:var(--tlh-blood)}#tl-prep .pl.on.ready .rk{color:#4b6000}',
  '#tl-prep .purse{display:flex;gap:8px}',
  '#tl-prep .pz{display:grid;grid-template-columns:auto auto;align-items:baseline;column-gap:6px;border:1px solid rgba(236,235,228,.22);padding:5px 12px 6px}',
  '#tl-prep .pz span{grid-column:1/span 2;font:400 9px/1 var(--tlh-font-mono);letter-spacing:.22em;color:var(--tlh-muted)}',
  '#tl-prep .pz b{font:600 24px/1 var(--tlh-font);color:var(--tlh-acid);font-variant-numeric:tabular-nums;letter-spacing:.02em}',
  '#tl-prep .pz i{font:400 11px/1 var(--tlh-font-mono);font-style:normal;color:var(--tlh-muted)}',
  '#tl-prep .pz.f b{color:var(--tlh-text)}',
  '#tl-prep .purse.over .pz:first-child{background:var(--tlh-blood);border-color:#ff5a5f}#tl-prep .purse.over .pz:first-child b,#tl-prep .purse.over .pz:first-child span,#tl-prep .purse.over .pz:first-child i{color:#fff}',
  /* body grid */
  '#tl-prep .body{flex:1;display:grid;grid-template-columns:300px minmax(0,1fr) 370px;gap:18px;min-height:0;padding:12px 0 10px}',
  '#tl-prep .col{display:flex;flex-direction:column;gap:12px;min-height:0;min-width:0}',
  '#tl-prep .mid{border-left:1px solid rgba(236,235,228,.1);border-right:1px solid rgba(236,235,228,.1);padding:0 18px}',
  '#tl-prep h2{margin:0;display:flex;justify-content:space-between;align-items:baseline;font:400 14px/1 var(--tlh-font-stencil);letter-spacing:.14em;color:#f1f0ea}',
  '#tl-prep h2 span,#tl-prep h2 em{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.16em;color:var(--tlh-muted);font-style:normal}',
  '#tl-prep .rule{height:1px;background:rgba(236,235,228,.14);margin:2px 0}',
  /* squad list */
  '#tl-prep .sq{display:flex;flex-direction:column;gap:4px;max-height:42%;overflow:auto;flex:0 1 auto}',
  '#tl-prep .slot{display:grid;grid-template-columns:30px 1fr auto;column-gap:9px;align-items:center;padding:4px 6px 4px 4px;border:1px solid rgba(236,235,228,.12);background:rgba(236,235,228,.03);cursor:pointer}',
  '#tl-prep .slot:hover{border-color:rgba(236,235,228,.4)}',
  '#tl-prep .slot .pt{width:30px;height:36px;background:rgba(236,235,228,.06) var(--tlh-pt) center 2px/26px auto no-repeat;border:1px solid rgba(236,235,228,.14)}',
  '#tl-prep .slot .sn{display:block;font:500 15px/1.1 var(--tlh-font);letter-spacing:.14em}',
  '#tl-prep .slot .sub{display:block;margin-top:2px;font:400 10px/1.2 var(--tlh-font-mono);letter-spacing:.06em;color:var(--tlh-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '#tl-prep .slot .x{border:0;background:none;cursor:pointer;padding:4px 6px;font:400 12px/1 var(--tlh-font-mono);color:var(--tlh-muted)}#tl-prep .slot .x:hover{color:#ff4a50}',
  '#tl-prep .slot.on{background:var(--tlh-paper) '+PAPER+';color:#111;border-color:#fff}#tl-prep .slot.on .pt{filter:invert(1);border-color:rgba(0,0,0,.35)}#tl-prep .slot.on .sub,#tl-prep .slot.on .x{color:#3b3d39}',
  '#tl-prep .empty{font:400 11px/1.5 var(--tlh-font-mono);letter-spacing:.06em;color:var(--tlh-muted);text-transform:none;padding:6px 0}',
  /* paper */
  '#tl-prep .paper{position:relative;color:#151614;background:#dcd9cf '+PAPER+';box-shadow:inset 0 0 36px rgba(70,58,36,.28),0 0 0 1px rgba(0,0,0,.7),0 10px 24px rgba(0,0,0,.55)}',
  '#tl-prep .paper::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 60%,rgba(255,255,255,.18) 75%,transparent 85%)}',
  '#tl-prep .paper .mono,#tl-prep .paper small{color:#3a3c37}',
  '#tl-prep .dossier{flex:1;min-height:200px;display:flex;flex-direction:column;padding:10px 12px 10px}',
  '#tl-prep .dossier .dh{display:flex;justify-content:space-between;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.16em;color:#3a3c37}',
  '#tl-prep .dossier .fig{position:relative;flex:1;min-height:110px;margin:6px 0;background:'+SOLDIER+' 50% 100%/contain no-repeat}',
  '#tl-prep .dossier .nm{position:absolute;left:0;top:4px;font:400 26px/1 var(--tlh-font-stencil);letter-spacing:.04em;color:#111}',
  '#tl-prep .dossier .cl{position:absolute;left:0;top:34px;font:400 10px/1.3 var(--tlh-font-mono);letter-spacing:.14em;color:#33352f;max-width:46%}',
  '#tl-prep .stamp{position:absolute;right:0;top:6px;border:2px solid var(--tlh-blood);color:var(--tlh-blood);font:400 14px/1 var(--tlh-font-stencil);letter-spacing:.1em;padding:4px 8px 3px;transform:rotate(-7deg);opacity:.82;background:rgba(196,30,37,.04)}',
  '#tl-prep .cap{border-top:2px solid #151614;padding-top:6px}',
  '#tl-prep .cap h4{margin:0 0 5px;display:flex;justify-content:space-between;font:400 13px/1 var(--tlh-font-stencil);letter-spacing:.12em;color:#111}',
  '#tl-prep .cap h4 b{font:600 20px/1 var(--tlh-font);color:#111}',
  '#tl-prep .kv{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font:400 10px/1.35 var(--tlh-font-mono);letter-spacing:.08em;color:#2a2c28}',
  '#tl-prep .kv b{font-weight:400;color:#111;text-align:right}',
  '#tl-prep .meter{height:7px;border:1px solid #151614;margin:6px 0 2px;position:relative;background:repeating-linear-gradient(90deg,transparent 0 9px,rgba(0,0,0,.18) 9px 10px)}',
  '#tl-prep .meter i{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left center;background:#151614}',
  '#tl-prep .meter.over i{background:var(--tlh-blood)}',
  /* roster: recruit tiles */
  '#tl-prep .recruit,#tl-prep .loadout{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0}',
  '#tl-prep .classes{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;align-content:start;overflow:auto;flex:0 0 auto;max-height:46%;min-height:0}',
  '#tl-prep .board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(150px,1fr);gap:10px;flex:1;min-height:0;overflow:auto}',
  '#tl-prep .kb{position:relative;display:flex;flex-direction:column;padding:8px 10px;border:1px solid rgba(236,235,228,.14);background:linear-gradient(180deg,rgba(236,235,228,.04),rgba(0,0,0,.25));cursor:pointer;min-height:0}',
  '#tl-prep .kb:hover{border-color:rgba(236,235,228,.5)}',
  '#tl-prep .kb::before{content:"";position:absolute;left:-1px;top:-1px;width:12px;height:12px;border-left:2px solid #f1f0ea;border-top:2px solid #f1f0ea}',
  '#tl-prep .kb.empty{cursor:default;border-style:dashed;background:none;opacity:.5}#tl-prep .kb.empty::before{display:none}',
  '#tl-prep .kh{display:flex;align-items:baseline;gap:8px}#tl-prep .kh b{font:400 16px/1 var(--tlh-font-stencil);letter-spacing:.08em;color:#f1f0ea}#tl-prep .kh span{flex:1;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.14em;color:var(--tlh-muted)}#tl-prep .kh em{font:400 11px/1 var(--tlh-font-mono);font-style:normal;color:var(--tlh-acid)}',
  '#tl-prep .kp{flex:1;min-height:40px;display:flex;align-items:center;justify-content:center;color:#a9aaa2}#tl-prep .kp img.gun{max-height:88px;filter:drop-shadow(0 6px 8px rgba(0,0,0,.6))}',
  '#tl-prep .ks{display:flex;align-items:flex-end;gap:10px}#tl-prep .kx{width:64px;height:34px;display:flex;align-items:center;justify-content:center;color:#a9aaa2}#tl-prep .kx img.gun,#tl-prep .kx svg.gun{max-height:32px}',
  '#tl-prep .kn{font:400 10px/1.4 var(--tlh-font-mono);letter-spacing:.06em;color:#b9bab2}',
  '#tl-prep .cd{position:relative;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto auto 1fr;column-gap:10px;padding:10px 12px;text-align:left;cursor:pointer;border:1px solid rgba(236,235,228,.14);background:linear-gradient(180deg,rgba(236,235,228,.05),rgba(236,235,228,.015));min-height:118px}',
  '#tl-prep .cd:hover{border-color:var(--tlh-acid);background:rgba(198,230,0,.05)}',
  '#tl-prep .cd .no{grid-row:1/span 2;font:400 22px/1 var(--tlh-font-stencil);color:rgba(236,235,228,.28)}',
  '#tl-prep .cd b{font:500 18px/1.05 var(--tlh-font);letter-spacing:.1em;color:#f1f0ea}',
  '#tl-prep .cd .meta{font:400 10px/1.4 var(--tlh-font-mono);letter-spacing:.1em;color:var(--tlh-muted)}',
  '#tl-prep .cd .meta em{font-style:normal;color:var(--tlh-acid)}',
  '#tl-prep .cd .note{grid-column:1/span 2;margin-top:8px;font:400 11px/1.4 var(--tlh-font-mono);letter-spacing:.02em;text-transform:none;color:#b9bab2}',
  '#tl-prep .cd .add{position:absolute;right:10px;top:10px;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.14em;color:var(--tlh-acid);opacity:0}',
  '#tl-prep .cd:hover .add{opacity:1}',
  '#tl-prep .cd.locked{cursor:not-allowed;opacity:.55}#tl-prep .cd.locked:hover{border-color:rgba(236,235,228,.14);background:none}',
  '#tl-prep .cd .lock{position:absolute;right:10px;top:12px;border:2px solid var(--tlh-blood);color:#ff4a50;font:400 12px/1 var(--tlh-font-stencil);letter-spacing:.1em;padding:3px 6px 2px;transform:rotate(-6deg)}',
  /* loadout: who + weapon slot cards */
  '#tl-prep .who{display:flex;align-items:baseline;gap:12px;font:400 26px/1 var(--tlh-font-stencil);letter-spacing:.06em;color:#f1f0ea}',
  '#tl-prep .who small{font:400 11px/1 var(--tlh-font-mono);letter-spacing:.18em;color:var(--tlh-muted)}',
  '#tl-prep .wslots{display:grid;grid-template-columns:1.35fr 1fr;gap:12px}',
  '#tl-prep .wslot{position:relative;display:flex;flex-direction:column;gap:6px;min-height:228px;padding:10px 12px;border:1px solid rgba(236,235,228,.16);background:linear-gradient(180deg,rgba(236,235,228,.045),rgba(0,0,0,.18));cursor:pointer}',
  '#tl-prep .wslot::before{content:"";position:absolute;left:-1px;top:-1px;width:16px;height:16px;border-left:2px solid #f1f0ea;border-top:2px solid #f1f0ea}',
  '#tl-prep .wslot:hover{border-color:rgba(236,235,228,.4)}',
  '#tl-prep .wslot.on{border-color:rgba(236,235,228,.6);box-shadow:inset 3px 0 0 var(--tlh-acid)}',
  '#tl-prep .wslot .gh{display:flex;align-items:baseline;gap:10px}',
  '#tl-prep .wslot .gh b{font:400 18px/1 var(--tlh-font-stencil);letter-spacing:.1em;color:#f1f0ea}',
  '#tl-prep .wslot .gh span{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.16em;color:var(--tlh-muted);flex:1}',
  '#tl-prep .wslot .gh em{font:400 12px/1 var(--tlh-font-mono);font-style:normal;color:var(--tlh-acid);letter-spacing:.06em}',
  '#tl-prep .wslot .gim{flex:1;display:flex;align-items:center;justify-content:center;min-height:110px;color:#c9cac2}',
  '#tl-prep img.gun,#tl-prep svg.gun{display:block;max-width:100%;max-height:150px;object-fit:contain}',
  '#tl-prep .wslot[data-slotcard="secondary"] img.gun{max-height:120px;max-width:70%}',
  '#tl-prep .wslot img.gun{filter:drop-shadow(0 0 1px rgba(236,235,228,.45)) drop-shadow(0 10px 12px rgba(0,0,0,.7))}',
  '#tl-prep svg.gun.line{width:80%;height:auto;max-height:110px}',
  '#tl-prep .wslot .gn{display:flex;align-items:baseline;gap:10px;font:500 20px/1 var(--tlh-font);letter-spacing:.1em;color:#f1f0ea}',
  '#tl-prep .wslot .gn small{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.16em;color:var(--tlh-muted)}',
  '#tl-prep .socks{display:flex;flex-wrap:wrap;gap:4px}',
  '#tl-prep .sock{border:1px solid rgba(236,235,228,.2);background:rgba(0,0,0,.25);padding:4px 7px;cursor:pointer;font:400 9px/1.2 var(--tlh-font-mono);letter-spacing:.1em;color:var(--tlh-muted)}',
  '#tl-prep .sock b{font-weight:400;color:#d8d8d0}',
  '#tl-prep .sock.has{border-color:var(--tlh-acid);color:var(--tlh-acid)}#tl-prep .sock.has b{color:#f1f0ea}',
  '#tl-prep .sock:hover{border-color:#f1f0ea}',
  '#tl-prep .sock.none{cursor:default}',
  /* tabs + panes */
  '#tl-prep .tabs{display:flex;gap:2px;border-bottom:1px solid rgba(236,235,228,.16)}',
  '#tl-prep .tab{background:none;border:0;border-bottom:3px solid transparent;margin-bottom:-1px;padding:8px 14px 7px;cursor:pointer;font:400 14px/1 var(--tlh-font-stencil);letter-spacing:.12em;color:var(--tlh-muted)}',
  '#tl-prep .tab:hover{color:#f1f0ea}#tl-prep .tab.on{color:#f1f0ea;border-bottom-color:var(--tlh-acid)}',
  '#tl-prep .pane{display:none;flex:1;min-height:0;flex-direction:column;gap:8px}#tl-prep .pane.on{display:flex}',
  '#tl-prep [data-view] {min-height:0}',
  '#tl-prep[data-view="roster"] [data-view="loadout"],#tl-prep[data-view="loadout"] [data-view="roster"]{display:none}',
  '#tl-prep .chips{display:flex;gap:4px;flex-wrap:wrap}',
  '#tl-prep .chip{border:1px solid rgba(236,235,228,.2);background:none;padding:5px 10px;cursor:pointer;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.14em;color:var(--tlh-muted)}',
  '#tl-prep .chips .lg{margin-left:auto;align-self:center;font:400 9px/1 var(--tlh-font-mono);letter-spacing:.16em;color:var(--tlh-muted)}',
  '#tl-prep .chip:hover{color:#f1f0ea;border-color:rgba(236,235,228,.5)}#tl-prep .chip.on{background:var(--tlh-acid);border-color:var(--tlh-acid);color:#0b0c0b}',
  '#tl-prep .weps{display:grid;grid-template-columns:repeat(auto-fill,minmax(186px,1fr));gap:6px;overflow:auto;flex:1;min-height:0;align-content:start;padding-right:4px}',
  '#tl-prep .wep{position:relative;display:flex;flex-direction:column;gap:3px;padding:6px 8px 7px;border:1px solid rgba(236,235,228,.12);background:rgba(236,235,228,.025);cursor:pointer;text-align:left}',
  '#tl-prep .wep:hover,#tl-prep .wep.pv{border-color:rgba(236,235,228,.55);background:rgba(236,235,228,.07)}',
  '#tl-prep .wep.on{border-color:var(--tlh-acid);box-shadow:inset 0 0 0 1px var(--tlh-acid)}',
  '#tl-prep .wep.on::after{content:"EQUIPPED";position:absolute;right:6px;bottom:6px;font:400 8px/1 var(--tlh-font-mono);letter-spacing:.16em;color:#0b0c0b;background:var(--tlh-acid);padding:2px 4px}',
  '#tl-prep .wep .row{display:flex;align-items:baseline;gap:6px}',
  '#tl-prep .wep .nm{font:500 13px/1.1 var(--tlh-font);letter-spacing:.1em;color:#f1f0ea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '#tl-prep .wep .cat{font:400 9px/1 var(--tlh-font-mono);letter-spacing:.14em;color:var(--tlh-muted)}',
  '#tl-prep .wep .cost{margin-left:auto;font:400 11px/1 var(--tlh-font-mono);color:var(--tlh-acid);white-space:nowrap}',
  '#tl-prep .wep .wim{height:58px;display:flex;align-items:center;justify-content:center;color:#a9aaa2}',
  '#tl-prep .wep img.gun{max-height:56px}#tl-prep .wep svg.gun.line{max-height:52px;width:70%}',
  '#tl-prep .mb{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}',
  '#tl-prep .mb i{display:block;height:3px;background:rgba(236,235,228,.12);position:relative;overflow:hidden}',
  '#tl-prep .mb i b{position:absolute;inset:0;transform-origin:left center;background:#d8d8d0}',
  '#tl-prep .wep.on .mb i b{background:var(--tlh-acid)}',
  '#tl-prep .wep .lock{position:absolute;left:8px;top:28px;border:2px solid var(--tlh-blood);color:#ff4a50;font:400 11px/1 var(--tlh-font-stencil);padding:2px 5px;transform:rotate(-6deg)}',
  '#tl-prep .wep.locked{cursor:not-allowed;opacity:.5}',
  '#tl-prep .ph{font:400 9px/1 var(--tlh-font-mono);font-style:normal;letter-spacing:.1em;color:var(--tlh-muted)}',
  '#tl-prep .est{font:400 9px/1 var(--tlh-font-mono);letter-spacing:.14em;color:#e3a21a}',
  /* grenades + gear tiles */
  '#tl-prep .nades{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-content:start}',
  '#tl-prep .nnote{font:400 10px/1.5 var(--tlh-font-mono);letter-spacing:.12em;color:var(--tlh-muted)}',
  '#tl-prep .nade{display:grid;grid-template-columns:110px 1fr;grid-template-rows:auto auto 1fr;column-gap:14px;row-gap:4px;padding:12px;border:1px solid rgba(236,235,228,.14);background:linear-gradient(180deg,rgba(236,235,228,.045),rgba(0,0,0,.2))}',
  '#tl-prep .nade .ic{grid-row:1/span 3;width:110px;height:110px;color:#151614;background:#dcd9cf '+PAPER+';padding:10px;box-shadow:inset 0 0 20px rgba(70,58,36,.3)}',
  '#tl-prep .nade .nn{font:500 20px/1.1 var(--tlh-font);letter-spacing:.12em;color:#f1f0ea}',
  '#tl-prep .nade .nc{font:400 10px/1.3 var(--tlh-font-mono);letter-spacing:.08em;color:var(--tlh-acid)}',
  '#tl-prep .nade .ctl{display:flex;align-items:center;gap:8px}',
  '#tl-prep .nade .ctl{align-self:end}',
  '#tl-prep .nade .ctl b{font:600 34px/1 var(--tlh-font);min-width:2ch;text-align:center;color:#f1f0ea;font-variant-numeric:tabular-nums}',
  '#tl-prep .nade .ctl button{width:28px;height:26px;cursor:pointer;border:1px solid rgba(236,235,228,.3);background:rgba(0,0,0,.3);font:400 15px/1 var(--tlh-font-mono)}',
  '#tl-prep .nade .ctl button:hover{border-color:var(--tlh-acid);color:var(--tlh-acid)}',
  '#tl-prep .gear{display:flex;flex-direction:column;gap:8px;overflow:auto;flex:1;min-height:0}',
  '#tl-prep .ghead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font:400 11px/1 var(--tlh-font-mono);letter-spacing:.14em;color:#d8d8d0}',
  '#tl-prep .ghead span{flex:1}',
  '#tl-prep .agrp{border-top:1px solid rgba(236,235,228,.12);padding-top:6px}',
  '#tl-prep .agrp h3{margin:0 0 6px;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.2em;color:var(--tlh-acid)}',
  '#tl-prep .atts{display:flex;flex-wrap:wrap;gap:5px}',
  '#tl-prep .att{border:1px solid rgba(236,235,228,.2);background:rgba(0,0,0,.2);padding:6px 9px;cursor:pointer;text-align:left;font:500 12px/1.2 var(--tlh-font);letter-spacing:.08em}',
  '#tl-prep .att:hover{border-color:rgba(236,235,228,.55)}',
  '#tl-prep .att.on{background:var(--tlh-paper) '+PAPER+';color:#111;border-color:#fff}',
  '#tl-prep .att .ac{display:block;margin-top:2px;font:400 9px/1 var(--tlh-font-mono);color:var(--tlh-acid)}#tl-prep .att.on .ac{color:#4b6000}',
  '#tl-prep .soon{font:400 11px/1.5 var(--tlh-font-mono);text-transform:none;letter-spacing:.04em;color:var(--tlh-muted);padding:8px 0}',
  /* right: comparison paper + budget */
  '#tl-prep .cmp{padding:12px 14px 12px;display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;overflow:hidden}',
  '#tl-prep .cmp .ch{display:flex;justify-content:space-between;align-items:flex-start}',
  '#tl-prep .cmp .ch b{font:400 28px/1 var(--tlh-font-stencil);letter-spacing:.02em;color:#111}',
  '#tl-prep .cmp .ch .mono{font-size:10px;letter-spacing:.16em;display:block;margin-top:4px}',
  '#tl-prep .cmp .bk{width:46px;height:30px;background:#151614;color:var(--tlh-paper);font:400 9px/30px var(--tlh-font-mono);text-align:center;letter-spacing:.1em}',
  '#tl-prep .cv{display:grid;grid-template-columns:1fr 1fr;gap:8px;border-top:2px solid #151614;border-bottom:1px solid rgba(0,0,0,.3);padding:8px 0}',
  '#tl-prep .cv>div{display:flex;flex-direction:column;gap:4px;min-width:0}',
  '#tl-prep .cv .lb{font:400 9px/1 var(--tlh-font-mono);letter-spacing:.2em;color:#3a3c37}',
  '#tl-prep .cv .lb.sel{color:var(--tlh-blood)}',
  '#tl-prep .cv .im{height:62px;display:flex;align-items:center;justify-content:center;color:#151614}',
  '#tl-prep .cv img.gun{max-height:60px}#tl-prep .cv svg.gun.line{max-height:52px;width:88%}',
  '#tl-prep .cv .nm{font:500 15px/1.1 var(--tlh-font);letter-spacing:.08em;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '#tl-prep .sr{display:grid;grid-template-columns:76px 1fr 46px;gap:8px;align-items:center;margin:3px 0;font:400 10px/1 var(--tlh-font-mono);letter-spacing:.1em;color:#2a2c28}',
  '#tl-prep .sr .tb{position:relative;height:9px;border:1px solid #151614;background:repeating-linear-gradient(90deg,transparent 0 9%,rgba(0,0,0,.14) 9% 10%)}',
  '#tl-prep .sr .tb i{position:absolute;top:0;bottom:0;left:0}',
  '#tl-prep .sr .tb .cur{background:#151614}',
  '#tl-prep .sr .tb .up{background:#8fae00;box-shadow:inset 0 0 0 1px #3d4b00}',
  '#tl-prep .sr .tb .dn{background:repeating-linear-gradient(135deg,var(--tlh-blood) 0 2px,rgba(196,30,37,.25) 2px 4px)}',
  '#tl-prep .sr .dv{text-align:right;font-size:11px;color:#111}#tl-prep .sr .dv.up{color:#4b6000}#tl-prep .sr .dv.dn{color:var(--tlh-blood)}',
  '#tl-prep .spec{display:grid;grid-template-columns:1fr 70px 70px;gap:3px 8px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(0,0,0,.3);font:400 10px/1.3 var(--tlh-font-mono);letter-spacing:.08em;color:#3a3c37}',
  '#tl-prep .spec b{font-weight:400;color:#111;text-align:right}',
  '#tl-prep .fit{font:400 10px/1.4 var(--tlh-font-mono);letter-spacing:.06em;color:#111}#tl-prep .fit span{background:#151614;color:var(--tlh-paper);padding:1px 4px;margin-right:4px}',
  '#tl-prep .cmp .cf{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid rgba(0,0,0,.3);padding-top:8px}',
  '#tl-prep .cmp .cf .mono{font-size:10px;letter-spacing:.12em;line-height:1.5}',
  '#tl-prep .cmp .cf .big{font:400 40px/0.9 var(--tlh-font-stencil);color:#111}',
  '#tl-prep .cmp .cf .big.dn{color:var(--tlh-blood)}',
  '#tl-prep .cmp .hint{font:400 10px/1.5 var(--tlh-font-mono);letter-spacing:.1em;color:#3a3c37}',
  '#tl-prep .man{display:flex;flex-direction:column;gap:0;border-top:2px solid #151614}',
  '#tl-prep .man div{display:grid;grid-template-columns:22px 1fr auto;gap:8px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.18);font:400 11px/1.2 var(--tlh-font-mono);letter-spacing:.08em;color:#2a2c28}',
  '#tl-prep .man div b{font:500 13px/1.2 var(--tlh-font);letter-spacing:.1em;color:#111}',
  '#tl-prep .budget{border:1px solid rgba(236,235,228,.18);background:rgba(0,0,0,.35);padding:10px 12px}',
  '#tl-prep .budget .bt{display:flex;justify-content:space-between;align-items:flex-end}',
  '#tl-prep .budget .bt span{font:400 10px/1.4 var(--tlh-font-mono);letter-spacing:.2em;color:var(--tlh-muted)}',
  '#tl-prep .budget .bt b{font:400 46px/0.9 var(--tlh-font-stencil);color:var(--tlh-acid)}',
  '#tl-prep .budget.over .bt b{color:#ff4a50}',
  '#tl-prep .budget .meter{border-color:rgba(236,235,228,.5);background:repeating-linear-gradient(90deg,transparent 0 9px,rgba(236,235,228,.12) 9px 10px)}',
  '#tl-prep .budget .meter i{background:var(--tlh-acid)}#tl-prep .budget.over .meter i{background:var(--tlh-blood)}',
  '#tl-prep .budget .kv{color:#b9bab2;margin-top:6px}#tl-prep .budget .kv b{color:#f1f0ea}',
  '#tl-prep .budget .phn{margin-top:6px;font:400 9px/1.4 var(--tlh-font-mono);letter-spacing:.12em;color:#e3a21a}',
  /* footer */
  '#tl-prep .ft{display:flex;align-items:center;gap:10px;padding-top:10px;border-top:1px solid rgba(236,235,228,.16)}',
  '#tl-prep .keys{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.16em;color:var(--tlh-muted)}',
  '#tl-prep .wait{margin-left:auto;margin-right:8px;font:400 11px/1 var(--tlh-font-mono);letter-spacing:.12em;color:#d8d8d0}',
  '#tl-prep .ft button{padding:10px 22px 9px;cursor:pointer;border:1px solid rgba(236,235,228,.35);background:rgba(0,0,0,.3);font:400 14px/1 var(--tlh-font-stencil);letter-spacing:.14em}',
  '#tl-prep .ft button:hover{border-color:#f1f0ea}',
  '#tl-prep .ft button:disabled{opacity:.3;cursor:not-allowed}',
  '#tl-prep .ft [data-act="ready"]{border-color:var(--tlh-acid);color:var(--tlh-acid)}#tl-prep .ft [data-act="ready"].on{background:var(--tlh-acid);color:#0b0c0b}',
  '#tl-prep .ft [data-act="launch"]{background:var(--tlh-acid);border-color:var(--tlh-acid);color:#0b0c0b;padding:10px 34px 9px}',
  '#tl-prep .ft [data-act="launch"]:disabled{background:none;color:var(--tlh-acid)}',
  '@media (max-width:1500px){#tl-prep .body{grid-template-columns:250px minmax(0,1fr) 300px;gap:12px}#tl-prep .mid{padding:0 12px}#tl-prep .wslot{min-height:190px}#tl-prep .brand b{font-size:24px}}',
  '@media (max-height:820px){#tl-prep .wslot{min-height:170px}#tl-prep .wslot .gim{min-height:80px}#tl-prep img.gun{max-height:110px}}'
 ].join('\n');
 if(!s.parentNode&&document.head)document.head.appendChild(s);};

P._canBuild=function(){if(typeof document==='undefined'||!document.createElement||!document.body)return false;
 var el=document.createElement('div');return !!(el&&('innerHTML' in el));};

P._nadeTile=function(ty,label){return '<div class="nade" data-nade="'+ty+'"><div class="ic">'+P.NADE_SVG[ty]+'</div><span class="nn">'+label+'</span><span class="nc" data-k="c'+ty+'"></span>'+
 '<span class="ctl"><button type="button" data-nade-act="'+ty+':-">\u2212</button><b data-k="'+ty+'">0</b><button type="button" data-nade-act="'+ty+':+">+</button></span></div>';};

P.build=function(){
 var root=document.getElementById('tl-prep');if(!root){root=document.createElement('div');root.id='tl-prep';document.body.appendChild(root);}
 P.root=root;root.classList.remove('out');root.style.display='';
 root.innerHTML='<div class="fx"></div><div class="case"><i class="hinge h1"></i><i class="hinge h2"></i><i class="hinge h3"></i><i class="hinge h4"></i><i class="latch l1"></i><i class="latch l2"></i><i class="latch l3"></i><i class="latch l4"></i>'+
  '<div class="hd"><div class="brand"><b>FIELD INVENTORY</b><span>DREADING // SQUAD REQUISITION</span></div><div class="bc"></div><div class="acidtag">KIT ISSUE<br>PRE-DEPLOY</div>'+
  '<div class="step" data-k="step">01  Roster</div><div class="players" data-k="players" hidden></div>'+
  '<div class="purse" data-k="purse"><div class="pz"><span>SCRAP</span><b data-k="scrap">800</b><i data-k="scrapMax">/ 800</i></div><div class="pz f"><span>FORTIFY</span><b data-k="fortify">24</b><i data-k="fortMax">/ 24</i></div></div></div>'+
  '<div class="body">'+
  '<div class="col left"><h2>Squad <span data-k="count">0 / 6</span></h2><div class="sq" data-list="squad"></div><div class="empty" data-k="empty">Add troops from the recruit board, then click a name to set guns, attachments and grenades.</div>'+
  '<div class="paper dossier" data-k="dossier"></div></div>'+
  '<div class="col mid">'+
  '<div class="recruit" data-view="roster"><h2>Recruit <em>Scrap per head \u00b7 click to add</em></h2><div class="classes" data-list="classes"></div><h2>Kit board <em>Click a soldier to open their loadout</em></h2><div class="board" data-k="board"></div></div>'+
  '<div class="loadout" data-view="loadout"><div class="who" data-k="who"></div>'+
  '<div class="wslots"><div class="wslot" data-slotcard="primary" data-k="slotPrimary"></div><div class="wslot" data-slotcard="secondary" data-k="slotSecondary"></div></div>'+
  '<div class="tabs"><button type="button" class="tab on" data-tab="primary">Primary</button><button type="button" class="tab" data-tab="secondary">Secondary</button>'+
  '<button type="button" class="tab" data-tab="gear">Attachments</button><button type="button" class="tab" data-tab="grenades">Grenades</button></div>'+
  '<div class="pane on" data-pane="primary"><div class="chips" data-k="catPrimary"></div><div class="weps" data-list="primary"></div></div>'+
  '<div class="pane" data-pane="secondary"><div class="chips" data-k="catSecondary"></div><div class="weps" data-list="secondary"></div></div>'+
  '<div class="pane" data-pane="grenades"><div class="nades">'+P._nadeTile('frag','Frag')+P._nadeTile('smoke','Smoke')+P._nadeTile('flash','Flashbang')+'</div><div class="nnote">Max 6 per type \u00b7 grenade costs from TacticalGrenades.cost when published</div></div>'+
  '<div class="pane" data-pane="gear"><div class="gear" data-k="gear"></div></div>'+
  '</div></div>'+
  '<div class="col right"><div class="paper cmp" data-k="cmp"></div><div class="budget" data-k="budget"></div></div>'+
  '</div>'+
  '<div class="ft"><span class="keys">ESC  BACK   \u00b7   ENTER  LAUNCH</span><div class="wait" data-k="wait"></div><button type="button" data-act="back">Back</button><button type="button" data-act="quick">Quick start</button><button type="button" data-act="ready">Ready</button><button type="button" data-act="launch">Launch</button></div>'+
  '</div>';
 P._cacheNodes(root);
 if(!P._errBound){root.addEventListener('error',P._onImgErr,true);P._errBound=true;}
 P._fillStatic();
};

P._cacheNodes=function(root){
 var q=function(s){return root.querySelector(s);},n=P._nodes;
 n.step=q('[data-k="step"]');n.scrap=q('[data-k="scrap"]');n.fortify=q('[data-k="fortify"]');n.scrapMax=q('[data-k="scrapMax"]');n.fortMax=q('[data-k="fortMax"]');
 n.purse=q('[data-k="purse"]');n.count=q('[data-k="count"]');n.empty=q('[data-k="empty"]');n.players=q('[data-k="players"]');n.wait=q('[data-k="wait"]');
 n.who=q('[data-k="who"]');n.classes=q('[data-list="classes"]');n.squad=q('[data-list="squad"]');n.squad2=null;
 n.primary=q('[data-list="primary"]');n.secondary=q('[data-list="secondary"]');n.catPrimary=q('[data-k="catPrimary"]');n.catSecondary=q('[data-k="catSecondary"]');
 n.gear=q('[data-k="gear"]');n.launch=q('[data-act="launch"]');n.back=q('[data-act="back"]');n.ready=q('[data-act="ready"]');n.quick=q('[data-act="quick"]');
 n.frag=q('[data-k="frag"]');n.smoke=q('[data-k="smoke"]');n.flash=q('[data-k="flash"]');
 n.cfrag=q('[data-k="cfrag"]');n.csmoke=q('[data-k="csmoke"]');n.cflash=q('[data-k="cflash"]');
 n.slotPrimary=q('[data-k="slotPrimary"]');n.slotSecondary=q('[data-k="slotSecondary"]');n.dossier=q('[data-k="dossier"]');n.board=q('[data-k="board"]');n.cmp=q('[data-k="cmp"]');n.budget=q('[data-k="budget"]');
};
/* Write innerHTML only when the markup actually changed. */
P._html=function(el,html){if(!el)return false;if(el._tlh===html)return false;el._tlh=html;el.innerHTML=html;return true;};

P._fillStatic=function(){
 var i,c,html='';
 for(var id in DreadingCatalogue.presets){c=DreadingCatalogue.presets[id];html+='<button type="button" class="cd" data-package="'+id+'"><b>'+P.esc(c.name)+'</b><span class="meta">'+c.guns.length+' troop'+(c.guns.length===1?'':'s')+' / '+c.cost+' credits</span><span class="note">'+c.guns.map(P._wname).map(P.esc).join(' · ')+'</span><span class="add">+ ADD</span></button>';}
 if(P._nodes.classes)P._nodes.classes.innerHTML=html;
 if(P._nodes.classes)P._nodes.classes.onclick=function(e){var b=e.target.closest('[data-package]');if(b)P.addPackage(b.dataset.package);};
 var list=P.weapons();P._weapons=list;P._wmap={};P._norms=P.norms(list);
 for(i=0;i<list.length;i++)P._wmap[list[i].id]=list[i];
 P._renderWeaponLists();
 var nph=!(P._tg()&&P._tg().cost);
 if(P._nodes.cfrag){['frag','smoke','flash'].forEach(function(t){P._nodes['c'+t].textContent=P.nadeCost(t)+' scrap each'+(nph?' \u00b7 placeholder':'');});}
 P._fillGear();
};

P._costTag=function(n,ph){return n+(ph?' <i class="ph">ph</i>':'');};
P._hasRealWeaponCost=function(){var AR=P._ar();return !!(AR&&typeof AR.cost==='function');};
P._hasRealAttCost=function(att){return !!(att&&att.cost!=null&&att.source==='arsenal');};
P._wname=function(id){return (P._wmap&&P._wmap[id]&&P._wmap[id].name)||id||'\u2014';};
P._wcat=function(id){return (P._wmap&&P._wmap[id]&&P._wmap[id].cat)||'ar';};

P._weaponHTML=function(list,slot){var i,w,st,h='',bars,est,cost,ph=!P._hasRealWeaponCost(),atts,u=P.state&&P.state.squad&&P.state.squad[P.state.sel];
 for(i=0;i<list.length;i++){w=list[i];atts=u&&(slot==='secondary'?u.secondary:u.primary)===w.id?P.attsFor(u,slot):((u&&u.attByWeapon&&u.attByWeapon[w.id])||[]);
  st=P.menuStats(w.def,P._norms,w.id,atts);cost=P.weaponLoadoutCost(w.id,atts);est='';if(st.est)P._anyEst=true;
  bars=P.STAT_KEYS.map(function(k){return '<i title="'+k[1]+'"><b style="transform:scaleX('+(st[k[0]]||0).toFixed(3)+')"></b></i>';}).join('');
  h+='<button type="button" class="wep'+(w.unlocked===false?' locked':'')+'" data-wep="'+w.id+'" data-slot="'+slot+'"'+(w.unlocked===false?' disabled':'')+'>'+
     '<span class="row"><span class="nm">'+P.esc(w.name)+'</span><span class="cost">'+P._costTag(cost,ph&&!(w.def&&w.def.cost!=null))+'</span></span>'+
     '<span class="wim">'+P.gunImg(w.id,w.cat)+'</span>'+
     '<span class="row"><span class="cat">'+P.catLabel(w.cat)+est+'</span></span><span class="mb">'+bars+'</span>'+(w.unlocked===false?'<span class="lock">LOCKED</span>':'')+'</button>';}
 return h||'<div class="soon">No weapon catalogue loaded.</div>';};

P._renderChips=function(box,cats,on){if(!box)return;var i,h='';for(i=0;i<(cats||[]).length;i++)h+='<button type="button" class="chip'+(cats[i]===on?' on':'')+'" data-cat="'+cats[i]+'">'+P.catLabel(cats[i])+'</button>';
 h+='<span class="lg">DMG \u00b7 ACC \u00b7 RNG \u00b7 ROF \u00b7 MOB'+(P._anyEst||!(P._ar()&&typeof P._ar().menuStats==='function')?' <i class="est">est.</i>':'')+'</span>';box.innerHTML=h;};

P._renderWeaponLists=function(){var list=P._weapons||P.weapons(),cat=(P.state&&P.state.cat)||'all',n=P._nodes;
 if(!n.primary)return;
 P._renderChips(n.catPrimary,P._catsIn(list),cat);
 P._renderChips(n.catSecondary,P._catsIn(list),cat);
 n.primary.innerHTML=P._weaponHTML(P._filterWeapons(list,'primary',cat),'primary');
 n.secondary.innerHTML=P._weaponHTML(P._filterWeapons(list,'secondary',cat),'secondary');
 P._listsKey=cat+'|'+(P._hasRealWeaponCost()?'real':'ph')+'|'+(list&&list.length);
 P._pvMark=null;
};

P._attShort=function(a){var n=P.prettyAtt(a),i=n.indexOf(' \u00b7 ');return i>0?n.slice(i+3):n;};
P._slotRank=function(x){var i=P.GEAR_SLOTS.indexOf(x);return i<0?50+x.charCodeAt(0):i;};

P._fillGear=function(){var n=P._nodes.gear,st=P.state,u=st&&st.squad&&st.squad[st.sel],which=(st&&st.gearSlot)||'primary',wid,atts,slots,i,s,h,have,a,phAtt,srcNote,j,group,AR=P._ar(),TWM=P._twm(),sw;
 if(!n)return;
 if(!u){P._html(n,'<div class="soon">Select a soldier, then pick attachments for their guns.</div>');P._gearKey='';return;}
 wid=which==='secondary'?u.secondary:u.primary;
 have=P.attsFor(u,which);atts=wid?P.attachments(wid):[];
 for(i=0;i<atts.length;i++)P._attMap[atts[i].id]=atts[i];
 slots=P.slots(wid);
 sw='<button type="button" class="chip'+(which==='primary'?' on':'')+'" data-gear-slot="primary">Primary</button><button type="button" class="chip'+(which==='secondary'?' on':'')+'" data-gear-slot="secondary">Secondary</button>';
 if(!wid){P._html(n,'<div class="ghead"><span>No '+which+' weapon</span>'+sw+'</div><div class="soon">Assign a '+which+' weapon first.</div>');P._gearKey=which;return;}
 if(!atts.length){srcNote=AR&&typeof AR.attachments==='function'?'The arsenal returned no attachments for this gun.':(!(TWM&&TWM.manifest)?'Waiting for the Night Guns manifest (or TacticalArsenal.attachments).':'No attachment sockets on this gun.');
  P._html(n,'<div class="ghead"><span>Attachments \u2014 '+P.esc(P._wname(wid))+'</span>'+sw+'</div><div class="soon">'+srcNote+'</div>');P._gearKey=wid;return;}
 phAtt=!atts.some(function(x){return P._hasRealAttCost(x);});
 h='<div class="ghead"><span>Attachments \u2014 '+P.esc(P._wname(wid))+'</span>'+sw+(phAtt?'<i class="ph">placeholder costs</i>':'')+'</div>';
 slots=slots.slice().sort(function(a,b){return P._slotRank(a)-P._slotRank(b);});
 for(i=0;i<slots.length;i++){s=slots[i];group=atts.filter(function(x){return x.slot===s;});if(!group.length)continue;
  h+='<div class="agrp" data-slot="'+s+'"><h3>'+(P.SLOT_LABEL[s]||s)+'</h3><div class="atts">';
  h+='<button type="button" class="att'+(have.filter(function(id){return (P._attMap[id]&&P._attMap[id].slot)===s;}).length===0?' on':'')+'" data-att="" data-att-slot="'+s+'">Stock<span class="ac">0</span></button>';
  for(j=0;j<group.length;j++){a=group[j];h+='<button type="button" class="att'+(have.indexOf(a.id)>=0?' on':'')+'" data-att="'+a.id+'" data-att-slot="'+s+'">'+P.esc(P._attShort(a))+'<span class="ac">'+P._costTag(P.attCost(a),!P._hasRealAttCost(a))+'</span></button>';}
  h+='</div></div>';}
 P._html(n,h);P._gearKey=which+'|'+wid+'|'+have.join('.')+'|'+(u.name||'');};

/* Big weapon slot card: render, name, cost, and one chip per socket showing what is fitted (click = open attachments). */
P._slotCard=function(u,which){var wid=u&&(which==='secondary'?u.secondary:u.primary),atts=P.attsFor(u,which),slots,all,i,s,fit,h,cost,ph=!P._hasRealWeaponCost();
 if(!u)return '';
 cost=wid?P.weaponLoadoutCost(wid,atts):0;
 h='<div class="gh"><b>'+(which==='secondary'?'Secondary':'Primary')+'</b><span>'+(which==='secondary'?'Slot B':'Slot A')+' \u00b7 '+P.catLabel(P._wcat(wid))+'</span><em>'+cost+' scrap'+(ph?' \u00b7 ph':'')+'</em></div>';
 h+='<div class="gim">'+(wid?P.gunImg(wid,P._wcat(wid)):'<span class="soon">Empty</span>')+'</div>';
 h+='<div class="gn">'+P.esc(P._wname(wid))+'<small>'+(atts.length?atts.length+' attachment'+(atts.length>1?'s':''):'stock')+'</small></div>';
 all=wid?P.attachments(wid):[];for(i=0;i<all.length;i++)P._attMap[all[i].id]=all[i];
 slots=wid?P.slots(wid).slice().sort(function(a,b){return P._slotRank(a)-P._slotRank(b);}):[];
 h+='<div class="socks">';
 if(!slots.length)h+='<span class="sock none">No sockets published</span>';
 for(i=0;i<slots.length&&i<8;i++){s=slots[i];fit=atts.filter(function(id){return (P._attMap[id]&&P._attMap[id].slot)===s;})[0];
  h+='<button type="button" class="sock'+(fit?' has':'')+'" data-gear-open="'+which+'">'+(P.SLOT_LABEL[s]||s)+' \u00b7 <b>'+(fit?P.esc(P._attShort(P._attMap[fit])):'\u2014')+'</b></button>';}
 h+='</div>';return h;};

P._dossierHTML=function(u,st){var c=u?P.cls(u.clsId||u.cls):null,pri,sec,att,nad,g2,tot,b=P.budgetOf(st),ms,mob,k;
 if(!u)return '<div class="dh"><span>OPERATOR FILE</span><span>\u2014 / '+P.MAX+'</span></div><div class="fig" style="opacity:.25"></div><div class="cap"><h4>No operator<b></b></h4><div class="kv"><span>Pick a class from the recruit board.</span><b></b></div></div>';
 g2=u.grenades||{};pri=P.weaponCost(u.primary);sec=P.weaponCost(u.secondary);
 att=P.weaponLoadoutCost(u.primary,P.attsFor(u,'primary'))-pri+P.weaponLoadoutCost(u.secondary,P.attsFor(u,'secondary'))-sec;
 nad=(g2.frag|0)*P.nadeCost('frag')+(g2.smoke|0)*P.nadeCost('smoke')+(g2.flash|0)*P.nadeCost('flash');tot=P.unitCost(u);
 ms=u.primary?P.menuStats(P._wmap&&P._wmap[u.primary]&&P._wmap[u.primary].def,P._norms,u.primary,P.attsFor(u,'primary')):null;mob=ms?Math.round((ms.mob||0)*100):0;
 k=Math.max(0,Math.min(1,tot/Math.max(1,b.scrap)));
 return '<div class="dh"><span>OPERATOR FILE</span><span>'+(st.sel+1)+' / '+P.MAX+'</span></div>'+
  '<div class="fig"><span class="nm">'+P.esc(u.name)+'</span><span class="cl">'+P.esc(u.cls)+'<br>'+(c?c.hp:'?')+' HP</span><span class="stamp">'+(c&&c.locked?'LOCKED':'CLEARED')+'</span></div>'+
  '<div class="cap"><h4>Kit load<b>'+tot+'</b></h4><div class="meter"><i style="transform:scaleX('+k.toFixed(3)+')"></i></div>'+
  '<div class="kv"><span>Class</span><b>'+(c?c.scrap:0)+'</b><span>Primary \u00b7 '+P.esc(P._wname(u.primary))+'</span><b>'+pri+'</b><span>Secondary \u00b7 '+P.esc(P._wname(u.secondary))+'</span><b>'+sec+'</b>'+
  '<span>Attachments \u00b7 '+(P.attsFor(u,'primary').length+P.attsFor(u,'secondary').length)+'</span><b>'+att+'</b><span>Grenades \u00b7 '+((g2.frag|0)+(g2.smoke|0)+(g2.flash|0))+'</span><b>'+nad+'</b>'+
  '<span>Mobility'+(ms&&ms.est?' (est.)':'')+'</span><b>'+mob+'</b><span>Army capacity</span><b>'+st.squad.length+' / '+P.MAX+'</b></div></div>';};

/* Comparison card: candidate (hovered / previewed gun) vs what the soldier has in that slot. */
P.SPEC=[['Action',function(d){return d.auto?'Auto':(d.bolt?'Bolt':d.pump?'Pump':'Semi');}],['RPM',function(d){return d.rpm;}],['Mag',function(d){return d.mag!=null?d.mag+(d.reserve!=null?' + '+d.reserve:''):null;}],['Damage',function(d){return d.dmg?d.dmg[0]+' / '+d.dmg[1]:null;}],['Range m',function(d){return d.range?d.range[0]+'\u2013'+d.range[1]:null;}],['Reload s',function(d){return d.reload;}],['ADS s',function(d){return d.adsTime;}]];
P._specHTML=function(a,b){var da=a&&P._wmap[a]&&P._wmap[a].def,db=b&&P._wmap[b]&&P._wmap[b].def,h='<div class="spec"><span></span><span>'+(a?'SEL':'')+'</span><span>EQP</span>',i,f,x,y,n=0;
 for(i=0;i<P.SPEC.length;i++){f=P.SPEC[i][1];x=da?f(da):null;y=db?f(db):null;if(x==null&&y==null)continue;n++;h+='<span>'+P.SPEC[i][0]+'</span><b>'+(x==null?(a?'\u2014':''):P.esc(x))+'</b><b>'+(y==null?'\u2014':P.esc(y))+'</b>';}
 return n?h+'</div>':'';};
P._cmpHTML=function(u,st){var pv=st.preview,slot=(pv&&pv.slot)||(st.tab==='secondary'?'secondary':'primary'),cur=u&&(slot==='secondary'?u.secondary:u.primary),cand=pv&&pv.id&&pv.id!==cur?pv.id:null,
  ca=cand?((u.attByWeapon&&u.attByWeapon[cand])||[]):null,cuA=u?P.attsFor(u,slot):[],sc=cur?P.menuStats(P._wmap[cur]&&P._wmap[cur].def,P._norms,cur,cuA):null,
  sn=cand?P.menuStats(P._wmap[cand]&&P._wmap[cand].def,P._norms,cand,ca):null,h,i,k,a,b,lo,hi,d,est=(sc&&sc.est)||(sn&&sn.est),cc,cn,dc,ph=!P._hasRealWeaponCost();
 h='<div class="ch"><div><b>COMPARISON</b><span class="mono">'+(cand?'Selected vs equipped':'Equipped \u00b7 '+slot)+(est?' \u00b7 est.':'')+'</span></div><span class="bk">'+(slot==='secondary'?'S-B':'S-A')+'</span></div>';
 h+='<div class="cv"><div><span class="lb sel">'+(cand?'Selected':'Hover a gun')+'</span><span class="im">'+(cand?P.gunImg(cand,P._wcat(cand)):'')+'</span><span class="nm">'+(cand?P.esc(P._wname(cand)):'\u2014')+'</span></div>'+
  '<div><span class="lb">Equipped</span><span class="im">'+(cur?P.gunImg(cur,P._wcat(cur)):'')+'</span><span class="nm">'+P.esc(P._wname(cur))+'</span></div></div>';
 for(i=0;i<P.STAT_KEYS.length;i++){k=P.STAT_KEYS[i][0];a=sc?(sc[k]||0):0;b=sn?(sn[k]||0):a;lo=Math.min(a,b);hi=Math.max(a,b);d=Math.round((b-a)*100);
  h+='<div class="sr"><span>'+P.STAT_KEYS[i][1]+'</span><span class="tb"><i class="cur" style="width:'+(lo*100).toFixed(1)+'%"></i>'+
   (hi>lo?'<i class="'+(b>a?'up':'dn')+'" style="left:'+(lo*100).toFixed(1)+'%;width:'+((hi-lo)*100).toFixed(1)+'%"></i>':'')+'</span>'+
   '<span class="dv'+(cand?(d>0?' up':d<0?' dn':''):'')+'">'+(cand?(d>0?'+':d<0?'\u2212':'\u00b1')+Math.abs(d):Math.round(a*100))+'</span></div>';}
 h+=P._specHTML(cand,cur);
 if(cuA.length)h+='<div class="fit"><span>FITTED</span> '+cuA.map(function(id){return P.esc(P._attShort(P._attMap[id]||{id:id}));}).join(' \u00b7 ')+'</div>';
 cc=cur?P.weaponLoadoutCost(cur,cuA):0;cn=cand?P.weaponLoadoutCost(cand,ca):cc;dc=cn-cc;
 h+='<div class="cf"><span class="mono">Cost '+(cand?cc+' \u2192 '+cn:cc)+' scrap'+(ph?'<br>placeholder prices':'')+(est?'<br>est. = derived from combat defs':'')+'</span><span class="big'+(dc>0?' dn':'')+'">'+(cand?(dc>0?'+':dc<0?'\u2212':'')+Math.abs(dc):cc)+'</span></div>';
 return h;};

P._boardHTML=function(st){var h='',i,u,g2;
 for(i=0;i<st.squad.length;i++){u=st.squad[i];g2=u.grenades||{};
  h+='<div class="kb" data-sel="'+i+'"><div class="kh"><b>'+P.esc(u.name)+'</b><span>'+P.esc(u.cls)+'</span><em>'+P.unitCost(u)+'</em></div>'+
   '<div class="kp">'+P.gunImg(u.primary,P._wcat(u.primary))+'</div><div class="ks"><span class="kx">'+P.gunImg(u.secondary,P._wcat(u.secondary))+'</span>'+
   '<span class="kn">'+P.esc(P._wname(u.primary))+' / '+P.esc(P._wname(u.secondary))+'<br>F'+(g2.frag|0)+' \u00b7 S'+(g2.smoke|0)+' \u00b7 B'+(g2.flash|0)+' \u00b7 +'+(P.attsFor(u,'primary').length+P.attsFor(u,'secondary').length)+' att</span></div></div>';}
 for(;i<Math.min(P.MAX,st.squad.length+1);i++)h+='<div class="kb empty"><div class="kh"><b>'+(P.CALLSIGNS[i]||'')+'</b><span>Open slot</span></div></div>';
 return h;};
P._manifestHTML=function(st){var h='<div class="ch"><div><b>REQUISITION</b><span class="mono">Army manifest \u00b7 '+st.squad.length+' / '+P.MAX+'</span></div><span class="bk">R-01</span></div><div class="man">',i,u;
 for(i=0;i<st.squad.length;i++){u=st.squad[i];h+='<div><span>'+(i+1<10?'0':'')+(i+1)+'</span><span><b>'+P.esc(u.name)+'</b> \u00b7 '+P.esc(u.cls)+'<br>'+P.esc(P._wname(u.primary))+' / '+P.esc(P._wname(u.secondary))+'</span><span>'+P.unitCost(u)+'</span></div>';}
 if(!st.squad.length)h+='<div><span></span><span>No troops requisitioned yet.</span><span></span></div>';
 h+='</div><div class="cf"><span class="mono">Total spend<br>'+(P._hasRealWeaponCost()?'':'placeholder prices')+'</span><span class="big">'+P.spent(st.squad)+'</span></div>';return h;};

P._budgetHTML=function(st,r,b){var u=st.squad[st.sel],k=Math.max(0,Math.min(1,P.spent(st.squad)/Math.max(1,b.scrap)));
 return '<div class="bt"><span>Scrap remaining<br>of '+b.scrap+'</span><b>'+r.scrap+'</b></div><div class="meter'+(r.scrap<0?' over':'')+'"><i style="transform:scaleX('+k.toFixed(3)+')"></i></div>'+
  '<div class="kv"><span>Squad spend</span><b>'+P.spent(st.squad)+'</b>'+(u&&st.view==='loadout'?'<span>'+P.esc(u.name)+' kit</span><b>'+P.unitCost(u)+'</b>':'')+'<span>Fortify (shop later)</span><b>'+r.fortify+' / '+b.fortify+'</b></div>'+
  (P._hasRealWeaponCost()?'':'<div class="phn">PLACEHOLDER PRICES \u00b7 WAITING ON ARSENAL COST API</div>');};

P.preview=function(slot,id){if(!P.state)return;P.state.preview=id?{slot:slot||'primary',id:id}:null;P._renderCompare();P._markPreview();};
P._markPreview=function(){var pv=P.state&&P.state.preview,key=pv?pv.slot+'|'+pv.id:'';if(P._pvMark===key||!P.root)return;P._pvMark=key;
 var els=P.root.querySelectorAll('.wep.pv'),i;for(i=0;i<els.length;i++)els[i].classList.remove('pv');
 if(pv){var box=P._nodes[pv.slot],el=box&&box.querySelector('.wep[data-wep="'+pv.id+'"]');if(el)el.classList.add('pv');}};
P._renderCompare=function(){var st=P.state,n=P._nodes;if(!n.cmp||!st)return;var u=st.squad[st.sel];
 P._html(n.cmp,st.view==='loadout'&&u?P._cmpHTML(u,st):P._manifestHTML(st));};
P._onOver=function(e){var t=e.target,w=null;while(t&&t!==P.root){if(t.classList&&t.classList.contains('wep')){w=t;break;}t=t.parentNode;}
 var st=P.state;if(!st||st.dead)return;
 if(w&&!w.disabled){var id=w.getAttribute('data-wep'),sl=w.getAttribute('data-slot');if(!st.preview||st.preview.id!==id||st.preview.slot!==sl)P.preview(sl,id);}
 else if(st.preview&&!(e.target.closest&&e.target.closest('.weps')))P.preview(null,null);};

P.sync=function(){if(!P.root||(P.state&&P.state.dead))return;var st=P.state,r=P.remaining(st.squad,st),n=P._nodes,i,u,b=P.budgetOf(st),mode=P.session&&P.session.mode||'solo',cat;
 if(!n.scrap)return;
 n.scrap.textContent=String(r.scrap);n.fortify.textContent=String(r.fortify);
 if(n.scrapMax)n.scrapMax.textContent='/ '+b.scrap;if(n.fortMax)n.fortMax.textContent='/ '+b.fortify;
 n.purse.classList.toggle('over',r.scrap<0);
 n.count.textContent=st.squad.length+' / '+P.MAX;
 n.empty.style.display=st.squad.length?'none':'block';
 n.step.innerHTML=st.view==='loadout'?'<b>02</b>  Loadout  \u00b7  '+P.esc(st.playerName||''):'<b>01</b>  Roster  \u00b7  '+P.esc(st.playerName||'');
 P.root.setAttribute('data-view',st.view);
 P._syncPlayers();
 var can=P.canLaunch(st.squad,st),armed=st.armed||(P.T&&typeof P.T.startMatch==='function');
 var keys=P.root.querySelector('.ft .keys');if(keys)keys.textContent=mode==='player'?'ESC  BACK   ·   ENTER  READY':'ESC  BACK   ·   ENTER  LAUNCH';
 if(n.ready){n.ready.style.display=mode==='solo'?'none':'';n.ready.classList.toggle('on',!!st.ready);n.ready.textContent=st.ready?'Ready':'Ready up';n.ready.disabled=!can;}
 if(n.launch){
  if(mode==='solo'){n.launch.style.display='';n.launch.disabled=!(can&&armed);n.launch.textContent='Launch';}
  else if(mode==='hotseat'){n.launch.style.display='';n.launch.disabled=!P.isAllReady();n.launch.textContent='Launch';}
  else {n.launch.style.display='none';}
 }
 if(n.wait){n.wait.textContent=mode==='player'?(st.ready?'Waiting for the host to start.':'Set your squad, then ready up.'):(mode==='hotseat'?(P.isAllReady()?'Both players ready.':'Each player sets a squad and readies up.'):'');}
 n.back.style.visibility=st.view==='loadout'?'visible':'hidden';
 P._syncSlots(n.squad);
 u=st.squad[st.sel];
 if(n.who)P._html(n.who,u?P.esc(u.name)+' <small>'+P.esc(u.cls)+'  \u00b7  operator '+(st.sel+1)+'</small>':'');
 if(u){n.frag.textContent=String(u.grenades.frag|0);n.smoke.textContent=String(u.grenades.smoke|0);n.flash.textContent=String(u.grenades.flash|0);}
 var tabs=P.root.querySelectorAll('.tab[data-tab]');for(i=0;i<tabs.length;i++)tabs[i].classList.toggle('on',tabs[i].getAttribute('data-tab')===st.tab);
 var panes=P.root.querySelectorAll('.pane');for(i=0;i<panes.length;i++)panes[i].classList.toggle('on',panes[i].getAttribute('data-pane')===st.tab);
 cat=st.cat||'all';
 if(P._listsKey!==(cat+'|'+(P._hasRealWeaponCost()?'real':'ph')+'|'+((P._weapons&&P._weapons.length)||0)))P._renderWeaponLists();
 else {var chips=P.root.querySelectorAll('.chip[data-cat]');for(i=0;i<chips.length;i++)chips[i].classList.toggle('on',chips[i].getAttribute('data-cat')===cat);}
 P._markWeapons('primary',u&&u.primary);P._markWeapons('secondary',u&&u.secondary);
 if(n.slotPrimary){P._html(n.slotPrimary,P._slotCard(u,'primary'));P._html(n.slotSecondary,P._slotCard(u,'secondary'));
  n.slotPrimary.classList.toggle('on',st.tab==='primary'||(st.tab==='gear'&&st.gearSlot!=='secondary'));n.slotSecondary.classList.toggle('on',st.tab==='secondary'||(st.tab==='gear'&&st.gearSlot==='secondary'));}
 if(n.dossier)P._html(n.dossier,P._dossierHTML(u,st));
 if(n.board&&st.view==='roster')P._html(n.board,P._boardHTML(st));
 P._renderCompare();
 if(n.budget){P._html(n.budget,P._budgetHTML(st,r,b));n.budget.classList.toggle('over',r.scrap<0);}
 P._markPreview();
 if(st.tab==='gear')P._fillGear();
};

P._syncPlayers=function(){var n=P._nodes.players,s=P.session,i,pl,h='',mode=s&&s.mode;if(!n)return;
 if(!s||!s.players||s.players.length<2||mode==='solo'||mode==='player'){n.hidden=true;P._html(n,'');return;}
 n.hidden=false;
 for(i=0;i<s.players.length;i++){pl=s.players[i];h+='<button type="button" class="pl'+(pl.playerId===s.activeId?' on':'')+(pl.ready?' ready':'')+'" data-player="'+pl.playerId+'">'+P.esc(pl.playerName)+'<span class="rk">'+(pl.ready?'\u25a0 Ready':'\u25a1 Not ready')+'  \u00b7  '+P.spent(pl.squad)+' / '+P.budgetOf(pl).scrap+'</span></button>';}
 P._html(n,h);};

P._syncSlots=function(box){if(!box)return;var st=P.state,i,u,html='',atts;for(i=0;i<st.squad.length;i++){u=st.squad[i];atts=P.attsFor(u,'primary').length+P.attsFor(u,'secondary').length;
 html+='<div class="slot'+(i===st.sel&&st.view==='loadout'?' on':'')+'" data-sel="'+i+'"><i class="pt"></i><div><span class="sn">'+P.esc(u.name)+'</span><span class="sub">'+P.esc(u.cls)+'  \u00b7  '+P.esc(P._wname(u.primary))+(atts?(' +'+atts):'')+'  \u00b7  '+P.unitCost(u)+'</span></div><button type="button" class="x" data-del="'+i+'" title="Remove">\u2715</button></div>';}
 P._html(box,html);};
P._markWeapons=function(slot,id){var box=P._nodes[slot];if(!box)return;var els=box.querySelectorAll('.wep'),i;for(i=0;i<els.length;i++)els[i].classList.toggle('on',els[i].getAttribute('data-wep')===id);};
P.addPackage=function(id){var kits=DreadingCatalogue.kits(id),st=P.state;if(st.squad.length+kits.length>P.MAX)return null;var group='package-'+Date.now()+'-'+(++P._packageSeq|| (P._packageSeq=1));kits.forEach(function(u){u.groupId=group;u.packageId=id;u.attByWeapon={};u.attByWeapon[u.primary]=u.attachments.slice();st.squad.push(u);});st.sel=st.squad.length-kits.length;st.ready=false;P.sync();P._emitChange();return kits;};
P.add=function(clsId){var c=P.cls(clsId),st=P.state,ids,p,s;if(!c||c.locked||st.squad.length>=P.MAX)return null;
 ids=(P._weapons||P.weapons()).map(function(x){return x.id;});p=ids.indexOf('m4')>=0?'m4':(ids[0]||'m4');s=ids.indexOf('m9')>=0?'m9':(ids[1]||p);
 if(clsId==='marksman'&&ids.includes('svd'))p='svd';
 if(clsId==='artillery')p='m9';if(clsId==='rocketeer'&&ids.includes('bazooka'))p='bazooka';
 var used={},j,nm;for(j=0;j<st.squad.length;j++)used[st.squad[j].name]=1;nm=null;for(j=0;j<P.CALLSIGNS.length;j++)if(!used[P.CALLSIGNS[j]]){nm=P.CALLSIGNS[j];break;}
 var u={name:nm||('UNIT'+(st.squad.length+1)),cls:c.name,clsId:c.id,primary:p,secondary:s,attachments:[],secondaryAttachments:[],attByWeapon:{},grenades:{frag:P.NADE_DEFAULT.frag,smoke:P.NADE_DEFAULT.smoke,flash:P.NADE_DEFAULT.flash}};
 if(clsId==='artillery')u.grenades={frag:6,smoke:0,flash:0};
 st.squad.push(u);st.sel=st.squad.length-1;st.ready=false;P.sync();P._emitChange();return u;};
P.remove=function(i){var st=P.state;if(i<0||i>=st.squad.length)return;st.squad.splice(i,1);if(st.sel>=st.squad.length)st.sel=Math.max(0,st.squad.length-1);if(!st.squad.length)st.view='roster';st.ready=false;P.sync();P._emitChange();};
P.select=function(i){if(i<0||i>=P.state.squad.length)return;P.state.sel=i;P.state.view='loadout';P.sync();};
P.setWep=function(slot,id){var u=P.state.squad[P.state.sel],w=P._wmap&&P._wmap[id];if(!u)return;if(w&&w.unlocked===false)return;
 u[slot]=id;P.state.preview=null;u.attByWeapon=u.attByWeapon||{};P.setAtts(u,slot,u.attByWeapon[id]||[]);P.state.ready=false;P.sync();P._emitChange();};
P.setAtt=function(which,attId,slot){var u=P.state.squad[P.state.sel],cur,next,i,a,keep,id;if(!u)return;
 which=which||P.state.gearSlot||'primary';cur=P.attsFor(u,which);
 if(!attId){next=cur.filter(function(id){a=P._attMap[id];return !(a&&a.slot===slot);});}
 else {if(cur.indexOf(attId)>=0){next=cur.filter(function(id){return id!==attId;});}
  else {a=P._attMap[attId];keep=a?a.slot:slot;next=cur.filter(function(id){var b=P._attMap[id];return !(b&&b.slot===keep);});next.push(attId);}}
 P.setAtts(u,which,next);P.state.ready=false;P.sync();P._emitChange();};
P.nade=function(ty,d){var u=P.state.squad[P.state.sel];if(!u||!u.grenades)return;u.grenades[ty]=Math.max(0,Math.min(6,(u.grenades[ty]|0)+d));P.state.ready=false;P.sync();P._emitChange();};
P.setTab=function(tab){P.state.tab=tab;P.sync();};
P.setView=function(v){P.state.view=v;P.sync();};
P.setCat=function(cat){P.state.cat=cat||'all';P._renderWeaponLists();P.sync();};
P.setPlayer=function(id){var pl=P.player(id);if(!pl)return;P.session.activeId=pl.playerId;P.state=pl;P.sync();};

P.applyQuick=function(){P.state.squad=[];P.addPackage('recruits');P.state.sel=0;P.state.view='roster';P.state.ready=false;P.sync();P._emitChange();return P.buildPlan();};

P.setReady=function(on,id){var pl=id?P.player(id):P.state;if(!pl)return false;if(on==null)on=!pl.ready;
 if(on&&!P.canLaunch(pl.squad,pl))return false;pl.ready=!!on;if(pl===P.state||pl.playerId===(P.state&&P.state.playerId))P.sync();P._emitReady(pl);return true;};

P.tryLaunch=function(){if(P.state.dead)return false;
 var mode=(P.session&&P.session.mode)||'solo';
 if(mode==='solo'){if(!P.canLaunch())return false;if(!(P.state.armed||(P.T&&typeof P.T.startMatch==='function')))return false;
  var plan=P.buildPlan();P._bindMatch(plan);if(P.T&&typeof P.T.startMatch==='function')P.T.startMatch(plan);P.applyLocalKits(P.T,plan);
  var payload={plans:{'(solo)':plan,p1:plan},players:[{playerId:P.state.playerId||'p1',playerName:P.state.playerName||'Player 1',ready:true}],mode:'solo',plan:plan};
  if(P._cb&&P._cb.onLaunch)try{P._cb.onLaunch(payload.plans,payload);}catch(e){}
  P._fire('tactical:prep-launch',payload);P.close();return true;}
 if(mode==='player')return P.setReady(true);
 if(!P.isAllReady())return false;
 var all={plans:P.getPlans(),players:(P.session.players||[]).map(function(p){return {playerId:p.playerId,playerName:p.playerName,ready:!!p.ready};}),mode:mode};
 if(P._cb&&P._cb.onLaunch)try{P._cb.onLaunch(all.plans,all);}catch(e){}
 P._fire('tactical:prep-launch',all);
 /* Hotseat does not call T.startMatch: one plan is only one squad. The MP/controller owner starts the match from this event. */
 if(P._cb&&P._cb.startMatch===true&&P.T&&typeof P.T.startMatch==='function'){P._bindMatch(all.plans[P.session.players[0].playerId]);P.T.startMatch(all.plans[P.session.players[0].playerId]);}
 P.close();return true;};

P.close=function(){if(P.state)P.state.dead=true;if(P.session&&P.session.players)P.session.players.forEach(function(p){p.dead=true;});
 if(P._keyBound){window.removeEventListener('keydown',P._onKey,true);P._keyBound=false;}
 if(P._onClickBound&&P.root){P.root.removeEventListener('click',P._onClick);P.root.removeEventListener('mouseover',P._onOver);P._onClickBound=false;}
 if(P.root){P.root.classList.add('out');setTimeout(function(){if(P.root)P.root.style.display='none';},480);}
 if(P._cb&&P._cb.onCancel)try{P._cb.onCancel();}catch(e){}};

P._onClick=function(e){var t=e.target,act,add,sel,del,tab,wep,slot,nade,cat,att,gs,pl;
 while(t&&t!==P.root){
  if((act=t.getAttribute&&t.getAttribute('data-act'))){if(act==='launch')P.tryLaunch();else if(act==='quick'){/* 2026-11-18: Quick start keeps the soldiers and weapons already picked (it used to replace them with four M4 riflemen);
    it only fills a default squad when none was hired, then readies / launches */if(!P.state.squad.length)P.applyQuick();P.tryLaunch();}else if(act==='back')P.setView('roster');else if(act==='ready')P.setReady();return;}
  if((pl=t.getAttribute&&t.getAttribute('data-player'))){P.setPlayer(pl);return;}
  if((add=t.getAttribute&&t.getAttribute('data-add'))){P.add(add);return;}
  if((del=t.getAttribute&&t.getAttribute('data-del'))){e.stopPropagation();P.remove(+del);return;}
  if((sel=t.getAttribute&&t.getAttribute('data-sel'))){P.select(+sel);return;}
  if((gs=t.getAttribute&&t.getAttribute('data-gear-open'))){P.state.gearSlot=gs;P.setTab('gear');return;}
  if((tab=t.getAttribute&&t.getAttribute('data-tab'))){P.setTab(tab);return;}
  if((tab=t.getAttribute&&t.getAttribute('data-slotcard'))){P.setTab(tab);return;}
  if((cat=t.getAttribute&&t.getAttribute('data-cat'))){P.setCat(cat);return;}
  if((gs=t.getAttribute&&t.getAttribute('data-gear-slot'))){P.state.gearSlot=gs;P._fillGear();return;}
  if(t.getAttribute&&t.hasAttribute('data-att')){att=t.getAttribute('data-att');P.setAtt(P.state.gearSlot||'primary',att,t.getAttribute('data-att-slot'));return;}
  if((wep=t.getAttribute&&t.getAttribute('data-wep'))){slot=t.getAttribute('data-slot')||P.state.tab;P.setWep(slot,wep);return;}
  if((nade=t.getAttribute&&t.getAttribute('data-nade-act'))){P.nade(nade.split(':')[0],nade.split(':')[1]==='+'?1:-1);return;}
  t=t.parentNode;
 }};
P._onKey=function(e){if(P.state.dead)return;if(e.key==='Escape'){if(P.state.view==='loadout'){e.preventDefault();P.setView('roster');}}
 else if(e.key==='Enter'&&!e.repeat){if(P.tryLaunch())e.preventDefault();}};

P._bindDom=function(){if(!P.root)return;
 if(!P._onClickBound){P.root.addEventListener('click',P._onClick);P.root.addEventListener('mouseover',P._onOver);P._onClickBound=true;}
 if(!P._keyBound){window.addEventListener('keydown',P._onKey,true);P._keyBound=true;}
};

P._watchManifest=function(){var n=0,tick=function(){var T=P._twm();n++;if(T&&T.manifest){P._manifestCache=T.manifest;P.refreshCatalog();return;}if(n<12)setTimeout(tick,250);};
 tick();};

/* Stamp attachments onto spawned soldiers and wrap TacticalWeaponModels.attach so each soldier can have their own parts.
   TWM.loadouts is per weapon id, not per soldier; the wrap is local to prep-screen (we do not edit that file). */
P.partsForModel=function(model,id){var T=P.T||(g.tactical&&g.tactical.T),s,i,inp;
 if(T&&T.squad){for(i=0;i<T.squad.length;i++){s=T.squad[i];if(s.model===model)return (s.wmParts||s.attachments||null)&& (s.wmParts||s.attachments).slice();}}
 inp=T&&T.input;if(inp&&inp.vm===model&&inp.fps&&inp.fps.s){s=inp.fps.s;return (s.wmParts||s.attachments||null)&&(s.wmParts||s.attachments).slice();}
 return null;};
P.hookWeaponModels=function(){var TWM=P._twm();if(!TWM||TWM._prepHooked||typeof TWM.attach!=='function')return false;
 var orig=TWM.attach;
 TWM.attach=function(model,id,fp,layer){var parts=P.partsForModel(model,id),prev=TWM.loadouts?TWM.loadouts[id]:undefined;
  if(parts){TWM.loadouts=TWM.loadouts||{};TWM.loadouts[id]=parts;}
  try{return orig.call(TWM,model,id,fp,layer);}
  finally{if(TWM.loadouts){if(prev===undefined)delete TWM.loadouts[id];else TWM.loadouts[id]=prev;}}};
 TWM._prepHooked=true;return true;};

P.applyLocalKits=function(T,plan){if(!T||!plan)return;P.hookWeaponModels();
 var byName={};((plan&&plan.squad)||[]).forEach(function(u){byName[(u.name||'').toUpperCase()]=u;});
 (T.squad||[]).forEach(function(s){var u=byName[(s.soldierName||'').toUpperCase()];if(!u)return;
  s.attachments=P.attsFor(u,'primary');s.secondaryAttachments=P.attsFor(u,'secondary');s.wmParts=s.attachments.slice();s.prepKit=u;});};

P._bindMatch=function(plan){P.hookWeaponModels();
 if(P.app&&typeof P.app.on==='function'&&!P._matchHooked){P.app.on('tactical:match-start',function(p){P.applyLocalKits(P.T||(g.tactical&&g.tactical.T),p||plan);});P._matchHooked=true;}};

P.open=function(opts){opts=opts||{};
 var mode=opts.mode,players,i,budget,search='';
 if(!mode){if(opts.players&&opts.players.length>1)mode='hotseat';else if(opts.playerId&&!opts.players)mode='player';
  else if(typeof location!=='undefined'&&/[?&]prepPlayers=2\b/.test(location.search||''))mode='hotseat';else mode='solo';}
 budget=opts.budget||{scrap:P.BUDGET.scrap,fortify:P.BUDGET.fortify};
 if(mode==='hotseat'){players=(opts.players&&opts.players.length?opts.players:[{playerId:'p1',playerName:'Player 1'},{playerId:'p2',playerName:'Player 2'}]).map(function(p,i){var q=Object.assign({playerId:'p'+(i+1),playerName:'Player '+(i+1)},p);if(!q.budget)q.budget=p.budget||budget;return P._newPlayer(q,q.budget);});}
 else {players=[P._newPlayer({playerId:opts.playerId||'p1',playerName:opts.playerName||(mode==='solo'?'Player 1':opts.playerId||'Player 1'),budget:budget},budget)];}
 P.session={mode:mode,players:players,activeId:players[0].playerId,budget:budget};
 P.state=players[0];players.forEach(function(p){p.dead=false;p.armed=opts.armed!=null?!!opts.armed:!!(opts.T||P.T);});
 P.app=opts.app||P.app;P.T=opts.T||P.T;
 P._cb={onReady:opts.onReady,onChange:opts.onChange,onAllReady:opts.onAllReady,onLaunch:opts.onLaunch,onCancel:opts.onCancel,startMatch:opts.startMatch};
 if(P._canBuild()){if(!P.root){P.css();P.build();}else{P.root.classList.remove('out');P.root.style.display='';P.state.dead=false;P._fillStatic();}P._bindDom();}
 P.refreshCatalog();P.hookWeaponModels();P._watchManifest();P.sync();return P;};

P.init=function(app,T){P.app=app;P.T=T;if(P.root&&!P.state.dead){P.state.armed=!!(T&&typeof T.startMatch==='function');P.sync();return P;}
 return P.open({app:app,T:T,armed:!!(T&&typeof T.startMatch==='function')});};
P.setArmed=function(on){if(P.state)P.state.armed=!!on;if(P.session&&P.session.players)P.session.players.forEach(function(p){p.armed=!!on;});P.sync();};
})(typeof globalThis!=='undefined'?globalThis:window);
