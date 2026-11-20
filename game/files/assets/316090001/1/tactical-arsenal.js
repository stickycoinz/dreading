/* TacticalArsenal (library, no script type): the Riposte: Frontline weapon catalogue and weapon-handling logic, PORTED
   (logic + numbers only, no models/sounds) from the MIT-licensed Riposte code shipped in NIGHT_SURVIVAL (read-only):
     Copyright (c) 2026 BenDBSS - https://github.com/BenDBSS/Riposte-Frontline-Source - MIT, see THIRD_PARTY_NOTICES.md
   Source map (NIGHT_SURVIVAL/src):
   - WEAPONS (18 modern guns, verbatim stat schema) ...... 06i-armes.js:28-108 (+ TEMPO_ARMES 0.9 reload / 0.88 ADS, :204-209)
   - SWITCH (weapon change 0.44 s, swap at 0.24) ........ 07c-controller.js:43
   - RECOIL table + recoilShot (climb / smg / rand, ADS, crouch, move, air, bipod) .. 07ca-recul.js:17-41
   - bipod spread x0.6 / recoil x0.5 (crouched + still) . 07c-controller.js:227,254 ; 06p-accessoires.js:51
   - tube (shell-by-shell) reload, pump/bolt cycle ...... 07c-controller.js:162-205, 247-250 (implemented in tactical-ns-combat.js)
   DREADING additions (collapsed modern world, scavenged/improvised guns) use the SAME schema; see SCAVENGED below.
   Loadouts: ?weapon=ak47 (every friendly) or ?loadout=ALPHA:m249,BRAVO:rem870,CHARLIE:svd,DELTA:nailgun or ?loadout=mixed. */
(function(g){
'use strict';
var NS=g.TacticalNS;if(!NS)throw new Error('TacticalArsenal needs tactical-ns-combat.js loaded first');
/* 06i-armes.js WEAPONS, numbers verbatim (only menu/model/sound fields dropped). */
var RIPOSTE={
 m4:{name:'M4A1',cat:'ar',fam:'rifle',auto:true,rpm:780,dmg:[32,22],range:[18,50],head:1.6,legs:0.85,mag:30,reserve:150,reload:2.1,reloadEmpty:2.6,spread:[0.032,0.0012],moveSpread:0.03,recoil:{v:0.0105,h:0.0045,kick:0.028,rot:0.04},adsTime:0.22,adsFov:0.72,move:0.95,pattern:'climb',ai:{ideal:22,aggr:0.45}},
 mp5:{name:'MP5',cat:'smg',fam:'smg',auto:true,rpm:900,dmg:[28,15],range:[10,28],head:1.5,legs:0.85,mag:30,reserve:180,reload:1.9,reloadEmpty:2.3,spread:[0.024,0.0025],moveSpread:0.012,recoil:{v:0.0078,h:0.0062,kick:0.02,rot:0.032},adsTime:0.17,adsFov:0.8,move:1.07,pattern:'smg',ai:{ideal:11,aggr:0.7,rush:true}},
 l96:{name:'L96A1',cat:'sniper',fam:'sniper',auto:false,bolt:true,rpm:48,dmg:[110,110],range:[120,220],head:2.5,legs:0.8,mag:5,reserve:25,reload:3,reloadEmpty:3.4,spread:[0.09,0],moveSpread:0.06,recoil:{v:0.045,h:0.01,kick:0.09,rot:0.14},adsTime:0.36,adsFov:0.27,move:0.88,scope:true,pattern:'rand',loud:true,ai:{ideal:45,aggr:0.15,sniper:true}},
 m1014:{name:'M1014',cat:'shotgun',fam:'shotgun',auto:false,rpm:240,pellets:10,dmg:[26,14],range:[9,24],head:1.2,legs:0.9,mag:8,reserve:32,tube:true,shellTime:0.46,spread:[0.22,0.16],moveSpread:0.01,recoil:{v:0.046,h:0.016,kick:0.07,rot:0.1},adsTime:0.22,adsFov:0.82,move:1,pattern:'rand',loud:true,ai:{ideal:7,aggr:0.85,shotgun:true,rush:true}},
 m9:{name:'M9',cat:'pistol',fam:'pistol',auto:false,rpm:480,dmg:[38,20],range:[8,26],head:1.5,legs:0.85,mag:15,reserve:60,reload:1.45,reloadEmpty:1.75,spread:[0.026,0.004],moveSpread:0.01,recoil:{v:0.019,h:0.008,kick:0.05,rot:0.09},adsTime:0.14,adsFov:0.85,move:1.05,pattern:'rand',ai:{ideal:12,aggr:0.45}},
 ak47:{name:'AK-47',cat:'ar',fam:'rifle',auto:true,rpm:600,dmg:[38,27],range:[18,48],head:1.5,legs:0.85,mag:30,reserve:120,reload:2.5,reloadEmpty:3,spread:[0.036,0.0016],moveSpread:0.034,recoil:{v:0.0145,h:0.0075,kick:0.036,rot:0.052},adsTime:0.25,adsFov:0.72,move:0.93,pattern:'climb',ai:{ideal:20,aggr:0.5}},
 scarh:{name:'SCAR-H',cat:'ar',fam:'rifle',auto:true,rpm:560,dmg:[42,31],range:[22,58],head:1.55,legs:0.85,mag:20,reserve:100,reload:2.4,reloadEmpty:2.9,spread:[0.034,0.0012],moveSpread:0.032,recoil:{v:0.0165,h:0.0058,kick:0.04,rot:0.056},adsTime:0.26,adsFov:0.7,move:0.9,pattern:'climb',ai:{ideal:26,aggr:0.4}},
 famas:{name:'FAMAS F1',cat:'ar',fam:'rifle',auto:true,rpm:1000,dmg:[26,18],range:[16,42],head:1.55,legs:0.85,mag:25,reserve:125,reload:2.2,reloadEmpty:2.7,spread:[0.03,0.0011],moveSpread:0.026,recoil:{v:0.0072,h:0.0042,kick:0.02,rot:0.03},adsTime:0.2,adsFov:0.74,move:0.98,pattern:'climb',ai:{ideal:16,aggr:0.6}},
 mp7:{name:'MP7',cat:'smg',fam:'smg',auto:true,rpm:950,dmg:[24,14],range:[12,30],head:1.5,legs:0.85,mag:40,reserve:160,reload:1.9,reloadEmpty:2.3,spread:[0.022,0.0022],moveSpread:0.01,recoil:{v:0.0065,h:0.0045,kick:0.016,rot:0.026},adsTime:0.15,adsFov:0.8,move:1.09,pattern:'smg',ai:{ideal:12,aggr:0.7,rush:true}},
 ump45:{name:'UMP-45',cat:'smg',fam:'smg',auto:true,rpm:620,dmg:[34,18],range:[11,30],head:1.5,legs:0.85,mag:25,reserve:125,reload:2,reloadEmpty:2.4,spread:[0.026,0.002],moveSpread:0.014,recoil:{v:0.0095,h:0.0065,kick:0.026,rot:0.036},adsTime:0.18,adsFov:0.8,move:1.04,pattern:'smg',ai:{ideal:13,aggr:0.65,rush:true}},
 vector:{name:'Vector',cat:'smg',fam:'smg',auto:true,rpm:1200,dmg:[22,13],range:[9,26],head:1.5,legs:0.85,mag:25,reserve:125,reload:1.8,reloadEmpty:2.2,spread:[0.03,0.003],moveSpread:0.018,recoil:{v:0.0052,h:0.0048,kick:0.014,rot:0.022},adsTime:0.16,adsFov:0.8,move:1.06,pattern:'smg',ai:{ideal:10,aggr:0.75,rush:true}},
 svd:{name:'Dragunov SVD',cat:'sniper',fam:'sniper',auto:false,rpm:170,dmg:[80,70],range:[70,170],head:2.2,legs:0.8,mag:10,reserve:50,reload:2.8,reloadEmpty:3.3,spread:[0.085,0],moveSpread:0.05,recoil:{v:0.026,h:0.008,kick:0.06,rot:0.09},adsTime:0.3,adsFov:0.3,move:0.92,scope:true,pattern:'rand',loud:true,ai:{ideal:38,aggr:0.2,sniper:true}},
 m82:{name:'Barrett M82',cat:'sniper',fam:'sniper',auto:false,rpm:80,dmg:[150,150],range:[150,260],head:2,legs:0.85,mag:10,reserve:30,reload:4.2,reloadEmpty:4.8,spread:[0.12,0],moveSpread:0.1,recoil:{v:0.06,h:0.014,kick:0.13,rot:0.2},adsTime:0.48,adsFov:0.25,move:0.74,scope:true,pattern:'rand',loud:true,ai:{ideal:50,aggr:0.12,sniper:true}},
 rem870:{name:'Remington 870',cat:'shotgun',fam:'shotgun',auto:false,pump:true,rpm:75,pellets:10,dmg:[32,16],range:[11,28],head:1.2,legs:0.9,mag:6,reserve:30,tube:true,shellTime:0.46,spread:[0.18,0.13],moveSpread:0.01,recoil:{v:0.05,h:0.016,kick:0.075,rot:0.11},adsTime:0.24,adsFov:0.82,move:0.98,pattern:'rand',loud:true,ai:{ideal:9,aggr:0.8,shotgun:true,rush:true}},
 aa12:{name:'AA-12',cat:'shotgun',fam:'rifle',auto:true,rpm:300,pellets:8,dmg:[14,8],range:[8,20],head:1.2,legs:0.9,mag:8,reserve:48,reload:3.4,reloadEmpty:3.9,spread:[0.26,0.2],moveSpread:0.012,recoil:{v:0.03,h:0.012,kick:0.06,rot:0.08},adsTime:0.28,adsFov:0.82,move:0.88,pattern:'rand',loud:true,ai:{ideal:7,aggr:0.8,shotgun:true,rush:true}},
 usp:{name:'USP .45',cat:'pistol',fam:'pistol',auto:false,rpm:420,dmg:[44,24],range:[8,26],head:1.5,legs:0.85,mag:12,reserve:60,reload:1.5,reloadEmpty:1.8,spread:[0.025,0.0035],moveSpread:0.01,recoil:{v:0.024,h:0.009,kick:0.058,rot:0.1},adsTime:0.15,adsFov:0.85,move:1.04,pattern:'rand',ai:{ideal:12,aggr:0.45}},
 glock18:{name:'Glock 18',cat:'pistol',fam:'pistol',auto:true,rpm:1100,dmg:[19,10],range:[7,20],head:1.5,legs:0.85,mag:20,reserve:100,reload:1.5,reloadEmpty:1.8,spread:[0.034,0.006],moveSpread:0.012,recoil:{v:0.012,h:0.01,kick:0.04,rot:0.07},adsTime:0.13,adsFov:0.85,move:1.07,pattern:'smg',ai:{ideal:8,aggr:0.6}},
 deagle:{name:'Desert Eagle',cat:'pistol',fam:'pistol',auto:false,rpm:230,dmg:[68,46],range:[10,32],head:1.7,legs:0.85,mag:7,reserve:35,reload:2,reloadEmpty:2.3,spread:[0.03,0.0035],moveSpread:0.012,recoil:{v:0.036,h:0.012,kick:0.095,rot:0.16},adsTime:0.17,adsFov:0.85,move:1,pattern:'rand',loud:true,ai:{ideal:14,aggr:0.35}}
};
var TEMPO={reload:0.9,ads:0.88};// 06i-armes.js TEMPO_ARMES (applied to every Riposte gun except the tuned M4)
/* Scavenged / improvised (DREADING): found at military bases, sporting goods and hardware stores. loud -> 90 m hearing,
   quiet guns carry an explicit noise radius (combat.shoot -> zombies hear it). */
var SCAVENGED={
 m4_worn:{base:'m4',name:'M4 (scavenged, worn barrel)',src:'scavenged',mods:{spread:[0.04,0.002],recoil:{v:0.0118,h:0.0055,kick:0.03,rot:0.044},reserve:60}},
 ak_rust:{base:'ak47',name:'AK (rusted, found)',src:'scavenged',mods:{spread:[0.044,0.0024],reserve:60}},
 m249:{base:'m4',name:'M249 SAW (military base)',src:'military',mods:{rpm:800,dmg:[30,22],range:[20,55],mag:100,reserve:200,reload:5.2,reloadEmpty:5.8,spread:[0.05,0.004],moveSpread:0.05,
  recoil:{v:0.009,h:0.006,kick:0.03,rot:0.04},adsTime:0.38,adsFov:0.7,move:0.8,bipod:true,loud:true,ai:{ideal:26,aggr:0.3}}},
 hunting_rifle:{base:'l96',name:'Bolt hunting rifle (sporting store)',src:'scavenged',mods:{dmg:[95,90],range:[80,160],mag:4,reserve:20,adsFov:0.4,scope:true}},
 pipe_shotgun:{base:'rem870',name:'Pipe shotgun (improvised slam-fire)',src:'improvised',mods:{pump:false,tube:false,rpm:60,pellets:8,dmg:[24,10],range:[7,18],mag:1,reserve:16,reload:2.0,reloadEmpty:2.0,spread:[0.26,0.2],recoil:{v:0.06,h:0.02,kick:0.09,rot:0.12},move:1.0}},
 nailgun:{base:'m9',name:'Nail gun (improvised framing nailer)',src:'improvised',mods:{cat:'smg',rpm:400,dmg:[18,6],range:[4,12],head:1.6,mag:30,reserve:90,reload:2.2,reloadEmpty:2.4,spread:[0.03,0.015],noise:15,loud:false,ai:{ideal:6,aggr:0.6,rush:true}}},
 crossbow:{base:'l96',name:'Crossbow (sporting store)',src:'scavenged',mods:{bolt:false,scope:false,rpm:20,dmg:[90,70],range:[20,50],mag:1,reserve:12,reload:2.6,reloadEmpty:2.6,spread:[0.04,0.002],moveSpread:0.03,recoil:{v:0.02,h:0.006,kick:0.04,rot:0.05},adsFov:0.6,noise:8,loud:false,ai:{ideal:25,aggr:0.2}}}
};
var SWITCH={dur:0.44,swap:0.24};
/* 07ca-recul.js RECOIL (input-mode factors dropped: keyboard+mouse = 1) */
var RECOIL={cat:{ar:{mul:1.55,back:0.7},smg:{mul:1.45,back:0.7},pistol:{mul:1.3,back:0.85},sniper:{mul:1.15,back:0.9},shotgun:{mul:1.15,back:0.9}},
 ads:0.66,crouch:0.75,move:1.2,air:1.5,first:0.85,peak:1.25,ramp:5,delay:0.1,rate:7,vis:1.45};
function clone(o){return JSON.parse(JSON.stringify(o));}
function lerp(a,b,t){return a+(b-a)*t;}
/* recoilShot (07ca-recul.js:29-41): ent = {crouch, onGround}; n = shot index in the burst; returns {kv, kh} radians */
function recoilShot(ent,d,n,ads,spd,rnd){var K=RECOIL.cat[d.cat]||RECOIL.cat.ar,Rc=d.recoil,r=rnd||Math.random;
 var m=K.mul*lerp(1,RECOIL.ads,ads)*(ent.crouch?RECOIL.crouch:1);
 if(spd>2.5)m*=RECOIL.move;if(ent.onGround===false)m*=RECOIL.air;
 if(d.bipod&&ent.crouch&&spd<0.4)m*=0.5;
 var kv=Rc.v*m*(0.9+0.2*r()),kh;
 if(d.pattern==='climb'){kv*=lerp(RECOIL.first,RECOIL.peak,Math.min(1,n/RECOIL.ramp));kh=(Math.sin(n*0.55+0.6)*1.2+(r()-0.5)*0.6)*Rc.h;}
 else if(d.pattern==='smg'){kv*=n?1:RECOIL.first+0.1;kh=(r()-0.5)*2.6*Rc.h;}
 else kh=(r()-0.5)*2*Rc.h;
 return {kv:kv,kh:kh*m};}
function build(){var out={};
 Object.keys(RIPOSTE).forEach(function(k){if(k==='m4')return;var d=clone(RIPOSTE[k]);d.id=k;d.src='riposte';
  ['reload','reloadEmpty','shellTime'].forEach(function(f){if(d[f])d[f]=+(d[f]*TEMPO.reload).toFixed(3);});if(d.adsTime)d.adsTime=+(d.adsTime*TEMPO.ads).toFixed(3);
  if(d.loud&&!d.noise)d.noise=90;out[k]=d;});
 Object.keys(SCAVENGED).forEach(function(k){var s=SCAVENGED[k],d=clone(s.base==='m4'?RIPOSTE.m4:out[s.base]);Object.assign(d,clone(s.mods));d.id=k;d.name=s.name;d.src=s.src;d.base=s.base;
  if(s.base==='m4'){['reload','reloadEmpty'].forEach(function(f){if(!(f in s.mods))d[f]=+(d[f]*TEMPO.reload).toFixed(3);});}
  if(d.loud&&!d.noise)d.noise=90;out[k]=d;});
 return out;}
var ADDED=build();
/* the ported NS M4 keeps its object (tacticalCombat tunes it in place); add the schema fields it lacked */
var m4=NS.WEAPONS.m4;m4.id='m4';m4.src='riposte';m4.fam='rifle';m4.recoil.kick=0.028;m4.recoil.rot=0.04;m4.ai={ideal:22,aggr:0.45};
Object.keys(ADDED).forEach(function(k){NS.WEAPONS[k]=ADDED[k];});
/* Pass-2 TTK tuning applied to the whole arsenal (tacticalCombat.initialize): the M4 went dmg 32 -> 25 and head x1.6 -> x2.8, so every other gun
   gets the same damage ratio and head ratio (head capped at 3.5). Raw Riposte numbers stay in TacticalArsenal.RIPOSTE. */
function tune(U){var kd=U.dmg[0]/RIPOSTE.m4.dmg[0],kh=U.head/RIPOSTE.m4.head;
 Object.keys(ADDED).forEach(function(k){var d=NS.WEAPONS[k],raw=ADDED[k];if(d._tuned)return;d.dmg=[+(raw.dmg[0]*kd).toFixed(2),+(raw.dmg[1]*kd).toFixed(2)];d.head=Math.min(3.5,+(raw.head*kh).toFixed(3));d._tuned=true;});
 return {dmgK:kd,headK:kh};}
/* loadouts from the URL: ?weapon=id (all friendlies) | ?loadout=NAME:id,NAME:id | ?loadout=mixed */
var MIXED={ALPHA:'m4',BRAVO:'rem870',CHARLIE:'svd',DELTA:'m249'};
function parse(){var q=typeof location!=='undefined'?location.search:'',m,o={all:null,by:{}};
 if((m=/[?&]weapon=([a-z0-9_]+)/i.exec(q))&&NS.WEAPONS[m[1]])o.all=m[1];
 if((m=/[?&]loadout=([^&]+)/i.exec(q))){var v=decodeURIComponent(m[1]);if(v==='mixed')o.by=Object.assign({},MIXED);else v.split(',').forEach(function(p){var kv=p.split(':');if(kv.length===2&&NS.WEAPONS[kv[1]])o.by[kv[0].toUpperCase()]=kv[1];});}
 return o;}
var LO=null;
function loadoutFor(team,name){if(team!=='friendly')return 'm4';LO=LO||parse();return LO.by[(name||'').toUpperCase()]||LO.all||'m4';}
function secondaryFor(){return 'm9';}
function list(){return Object.keys(NS.WEAPONS);}
g.TacticalArsenal={RIPOSTE:RIPOSTE,SCAVENGED:SCAVENGED,TEMPO:TEMPO,SWITCH:SWITCH,RECOIL:RECOIL,recoilShot:recoilShot,tune:tune,loadoutFor:loadoutFor,secondaryFor:secondaryFor,list:list,MIXED:MIXED,_reparse:function(){LO=null;}};
NS.RECOIL=RECOIL;NS.recoilShot=recoilShot;NS.SWITCH=SWITCH;
})(globalThis);
