/* DREADING HUD (look spec phase 5, UI pass 3 "field inventory" restyle): HTML overlay (no PlayCanvas UI, no framework).
   RTS: squad cards (portrait, HP, ammo, current order tag), quiet resource strip, 2D minimap (canvas, no second camera) in a
   bracketed frame, short footer. FP: minimal (crosshair / ammo / HP + stance / squad pip, 96 px map).
   Alerts: one at a time in the existing #tl-toast slot, 3 s each, queued (power on / cut, squad in trouble).
   Middle-mouse order wheel (8 wedges on a dark-glass octagon, hold > 150 ms, release to confirm, centre dead-zone cancels)
   with a squad list beside it (portrait + each soldier's live order tag from s.order). Orders go through
   TacticalRtsInput.radialOrder -> the same order functions as the keys. ?play=1 hides the dev panel (#tl-panel) and the long help. ?hud=0 = old HUD.
   Visual: near-black glass, off-white paper, acid green + blood red accents, Oswald / Black Ops One / Share Tech Mono (OFL,
   bundled under game/ui/fonts). Tokens live in DreadingHUD.THEME and --tlh-* CSS variables (prep screen reuses H.css()).
   Perf: DOM built once; 200 ms throttle; cached text/class writes; HP via transform; delegated clicks; grain is one static
   tiled PNG layer (no JS animation); radial redraws only when the hovered wedge changes; minimap static layer cached. */
(function(g){'use strict';
var H=g.DreadingHUD={on:!/[?&]hud=0/.test(location.search),play:/[?&]play=1/.test(location.search),stats:{writes:0,alerts:0,radialOpens:0,radialOrders:0,mmDraws:0},q:[],cache:{}};
/* Asset base for bundled UI files (fonts, gun renders, grain). Relative to the game page; overridable for harnesses. */
H.BASE=(g.DREADING_UI_BASE||'ui/');
/* Shared token block: keep COL as an alias so existing readers of H.COL.ok / .edge / .bg still work. */
H.THEME={
  ok:'#c6e600',radio:'#c6e600',hurt:'#e3a21a',crit:'#c41e25',warn:'#c41e25',
  sel:'#c6e600',res:'#b9bab2',text:'#ecebe4',muted:'#8a8c84',
  bg:'rgba(11,13,12,0.72)',edge:'rgba(236,235,228,0.22)',ink:'#0b0c0b',dead:'#4d4f4a',
  acid:'#c6e600',blood:'#c41e25',paper:'#e3e0d7',glass:'rgba(12,15,14,0.58)',line:'rgba(236,235,228,0.34)',
  font:'"Oswald","Barlow Condensed","Archivo Narrow","Segoe UI Condensed","Arial Narrow","Liberation Sans Narrow","Segoe UI",system-ui,sans-serif',
  fontStencil:'"Black Ops One","Oswald","Archivo Narrow","Segoe UI Condensed","Arial Narrow",system-ui,sans-serif',
  fontMono:'"Share Tech Mono","Consolas","Lucida Console","DejaVu Sans Mono",monospace'
};
H.COL=H.THEME;
H.SLICES=[{k:'move',t:'Move / Rally'},{k:'cover',t:'Take cover'},{k:'assault',t:'Assault'},{k:'defend',t:'Defend area'},{k:'suppress',t:'Suppress'},{k:'focus',t:'Focus fire'},{k:'throw',t:'Throw'},{k:'cancel',t:'Cancel'}];
H.DEAD=24;H.HOLD=150;H.RAD=380;

H.fontFaces=function(){var b=H.BASE+'fonts/';return [
  '@font-face{font-family:"Oswald";src:url("'+b+'oswald-latin.woff2") format("woff2");font-weight:200 700;font-display:swap}',
  '@font-face{font-family:"Black Ops One";src:url("'+b+'blackopsone-latin.woff2") format("woff2");font-weight:400;font-display:swap}',
  '@font-face{font-family:"Share Tech Mono";src:url("'+b+'sharetechmono-latin.woff2") format("woff2");font-weight:400;font-display:swap}'].join('\n');};

H.css=function(){
  var T=H.THEME,s=document.getElementById('tl-hud-css')||document.createElement('style');
  s.id='tl-hud-css';
  var GR='url("'+H.BASE+'grain.png")',SCAN='repeating-linear-gradient(0deg,rgba(255,255,255,.028) 0 1px,transparent 1px 3px)';
  s.textContent=[
    H.fontFaces(),
    ':root{',
    '--tlh-ok:'+T.ok+';--tlh-radio:'+T.radio+';--tlh-hurt:'+T.hurt+';--tlh-crit:'+T.crit+';--tlh-warn:'+T.warn+';',
    '--tlh-sel:'+T.sel+';--tlh-res:'+T.res+';--tlh-text:'+T.text+';--tlh-muted:'+T.muted+';',
    '--tlh-bg:'+T.bg+';--tlh-edge:'+T.edge+';--tlh-ink:'+T.ink+';--tlh-dead:'+T.dead+';',
    '--tlh-acid:'+T.acid+';--tlh-blood:'+T.blood+';--tlh-paper:'+T.paper+';--tlh-glass:'+T.glass+';--tlh-line:'+T.line+';',
    '--tlh-font:'+T.font+';--tlh-font-stencil:'+T.fontStencil+';--tlh-font-mono:'+T.fontMono+';',
    '--tlh-grain:'+GR+';--tlh-scan:'+SCAN+';--tlh-base:"'+H.BASE+'";',
    '}',
    /* glass panel: dark translucent + static grain + scanlines, hairline light edge */
    '.tlh-panel,#tlh-cards .cd,#tlh-res,#tlh-fp,#tl-toast,#tl-ammo,#tlh-rlist{',
    'background-color:var(--tlh-glass);background-image:var(--tlh-grain),var(--tlh-scan);',
    'border:1px solid var(--tlh-edge);border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.45);',
    '}',
    '#tl-toast{font:500 13px/1.25 var(--tlh-font)!important;letter-spacing:.14em;text-transform:uppercase;color:var(--tlh-text)!important;text-shadow:0 1px 2px #000;top:56px!important;padding:7px 16px 7px 14px!important;border-radius:0!important;pointer-events:none}',
    '#tl-toast.alert{font:600 17px/1.2 var(--tlh-font)!important;padding:8px 18px 8px 92px!important;border-color:rgba(196,30,37,.75)!important;color:var(--tlh-text)!important;position:absolute}',
    '#tl-toast.alert::before{content:"ALERT";position:absolute;left:0;top:0;bottom:0;width:76px;display:flex;align-items:center;justify-content:center;background:var(--tlh-blood);color:#fff;font:400 13px/1 var(--tlh-font-stencil);letter-spacing:.12em}',
    '#tl-toast.alert.pulse{animation:tlpulse .6s 1}@keyframes tlpulse{0%{box-shadow:0 0 0 0 rgba(196,30,37,.75)}100%{box-shadow:0 0 0 16px rgba(196,30,37,0)}}',
    '#tl-ammo{font:600 30px/1 var(--tlh-font)!important;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;letter-spacing:.04em;color:var(--tlh-text)!important;text-shadow:0 1px 3px #000;padding:6px 14px 8px!important;border-radius:0!important;border-bottom:2px solid var(--tlh-acid)!important}',
    '#tl-ctl{font:400 12px/1.4 var(--tlh-font-mono)!important;letter-spacing:.06em;color:rgba(236,235,228,.78)!important;text-transform:uppercase;text-shadow:0 1px 2px #000,0 0 6px #000!important}',
    '.tlh{position:fixed;z-index:12;font:12px/1.3 var(--tlh-font);color:var(--tlh-res);text-shadow:0 1px 2px #000;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}',
    /* squad cards */
    '#tlh-cards{left:10px;bottom:40px;display:flex;gap:6px;pointer-events:auto}',
    '#tlh-cards .cd{position:relative;display:grid;grid-template-columns:30px 1fr;column-gap:8px;padding:6px 10px 6px 6px;min-width:168px;cursor:pointer;transition:background-color .12s,border-color .12s}',
    '#tlh-cards .cd::after{content:"";position:absolute;left:-1px;top:-1px;bottom:-1px;width:3px;background:transparent}',
    '#tlh-cards .cd.sel{border-color:rgba(236,235,228,.55);background-color:rgba(24,28,26,.78)}',
    '#tlh-cards .cd.sel::after{background:var(--tlh-acid)}',
    '#tlh-cards .cd.dead{opacity:.45}',
    '#tlh-cards .pt{grid-row:1/span 3;width:30px;height:40px;background:rgba(236,235,228,.06) var(--tlh-pt) center 3px/26px auto no-repeat;border:1px solid rgba(236,235,228,.14)}',
    '#tlh-cards .hd{display:flex;align-items:center;justify-content:space-between;gap:6px}',
    '#tlh-cards b,#tlh-cards .nm{color:var(--tlh-text);letter-spacing:.12em;text-transform:uppercase;font:600 13px/1.1 var(--tlh-font)}',
    '#tlh-cards .hp{height:3px;background:rgba(236,235,228,.12);margin:4px 0 3px;overflow:hidden}',
    '#tlh-cards .hp i{display:block;height:100%;width:100%;transform-origin:left center;transform:scaleX(0);will-change:transform;background:var(--tlh-ok)}',
    '#tlh-cards .mo{display:inline-block;width:6px;height:6px;flex:0 0 6px;transform:rotate(45deg)}',
    '#tlh-cards .ln{display:flex;justify-content:space-between;gap:8px;align-items:baseline}',
    '#tlh-cards .am{color:var(--tlh-muted);font:400 11px/1 var(--tlh-font-mono);letter-spacing:.04em}',
    '#tlh-cards .or{color:var(--tlh-acid);font:400 10px/1 var(--tlh-font-mono);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}',
    '#tlh-cards .or.bad{color:#ff4a50}',
    /* resources */
    '#tlh-res{left:50%;top:10px;transform:translateX(-50%);padding:5px 16px 4px;letter-spacing:.16em;pointer-events:none;text-transform:uppercase;font:400 11px/1.3 var(--tlh-font-mono)}',
    '#tlh-res .k{color:var(--tlh-muted)}',
    '#tlh-res .v{color:var(--tlh-acid);font:600 15px/1 var(--tlh-font);font-variant-numeric:tabular-nums;letter-spacing:.06em;margin-left:8px}',
    '#tlh-res .bat{margin-left:16px}',
    /* minimap + bracket frame */
    '#tlh-mm{right:12px;top:12px;pointer-events:auto;cursor:crosshair;background-color:#0b0d0c;border:1px solid var(--tlh-edge);border-radius:0;box-shadow:0 6px 18px rgba(0,0,0,.5)}',
    '#tlh-mmf{right:6px;top:6px;width:194px;height:194px;pointer-events:none;z-index:13;background:',
    ' linear-gradient(var(--tlh-text),var(--tlh-text)) 0 0/14px 2px no-repeat,linear-gradient(var(--tlh-text),var(--tlh-text)) 0 0/2px 14px no-repeat,',
    ' linear-gradient(var(--tlh-text),var(--tlh-text)) 100% 0/14px 2px no-repeat,linear-gradient(var(--tlh-text),var(--tlh-text)) 100% 0/2px 14px no-repeat,',
    ' linear-gradient(var(--tlh-text),var(--tlh-text)) 0 100%/14px 2px no-repeat,linear-gradient(var(--tlh-text),var(--tlh-text)) 0 100%/2px 14px no-repeat,',
    ' linear-gradient(var(--tlh-text),var(--tlh-text)) 100% 100%/14px 2px no-repeat,linear-gradient(var(--tlh-text),var(--tlh-text)) 100% 100%/2px 14px no-repeat}',
    '#tlh-mmf span{position:absolute;left:0;bottom:-15px;font:400 9px/1 var(--tlh-font-mono);letter-spacing:.18em;color:var(--tlh-muted)}',
    '#tlh-mmf span b{color:var(--tlh-acid);font-weight:400}',
    'body.tl-fp #tlh-mmf{width:110px;height:110px}',
    '#tlh-foot{left:50%;bottom:10px;transform:translateX(-50%);opacity:.9;pointer-events:none;font:400 10px/1.3 var(--tlh-font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--tlh-res);background:none;border:0;box-shadow:none;text-shadow:0 1px 2px #000,0 0 8px #000;white-space:nowrap}',
    '#tlh-fp{left:12px;bottom:12px;padding:6px 12px;pointer-events:none;font:500 14px/1.3 var(--tlh-font);letter-spacing:.1em;text-transform:uppercase;color:var(--tlh-text);border-left:3px solid var(--tlh-acid)}',
    '#tlh-fp .hpv{font-variant-numeric:tabular-nums;font-weight:600}',
    '#tlh-fp .dot{color:var(--tlh-muted);margin:0 6px;letter-spacing:0}',
    '#tlh-fp .sq{font:400 12px/1 var(--tlh-font-mono);color:var(--tlh-res)}',
    '#tlh-fp .dn{color:#ff4a50;margin-left:8px}',
    /* order wheel + squad list */
    '#tlh-radial{position:fixed;z-index:25;pointer-events:none;display:none;width:380px;height:380px}',
    '#tlh-rlist{position:fixed;z-index:25;pointer-events:none;display:none;width:232px;padding:8px 0 6px;color:var(--tlh-text)}',
    '#tlh-rlist .rh{display:flex;justify-content:space-between;align-items:baseline;padding:0 10px 6px;border-bottom:1px solid var(--tlh-edge);margin-bottom:4px}',
    '#tlh-rlist .rh b{font:400 13px/1 var(--tlh-font-stencil);letter-spacing:.14em}',
    '#tlh-rlist .rh span{font:400 10px/1 var(--tlh-font-mono);letter-spacing:.12em;color:var(--tlh-muted);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#tlh-rlist .rr{display:grid;grid-template-columns:28px 1fr;column-gap:9px;align-items:center;padding:4px 10px;margin:2px 6px;border:1px solid transparent}',
    '#tlh-rlist .rr .pt{width:28px;height:34px;background:rgba(236,235,228,.07) var(--tlh-pt) center 2px/24px auto no-repeat;border:1px solid rgba(236,235,228,.16)}',
    '#tlh-rlist .rr .nm{display:block;font:500 13px/1.15 var(--tlh-font);letter-spacing:.14em;text-transform:uppercase}',
    '#tlh-rlist .rr .or{display:block;font:400 10px/1.2 var(--tlh-font-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--tlh-acid)}',
    '#tlh-rlist .rr .or.bad{color:#ff4a50}',
    '#tlh-rlist .rr.on{background:rgba(236,235,228,.9);border-color:#fff;color:var(--tlh-ink)}',
    '#tlh-rlist .rr.on .pt{filter:invert(1);border-color:rgba(0,0,0,.4)}',
    '#tlh-rlist .rr.on .or{color:var(--tlh-blood)}',
    '#tlh-rlist .rr.dead{opacity:.4}',
    'body.tl-play #tl-panel,body.tl-play #tl-help{display:none!important}body.tl-fp #tlh-cards,body.tl-fp #tlh-res,body.tl-fp #tlh-foot{display:none}body:not(.tl-fp) #tlh-fp{display:none}',
    /* 2026-11-19 RTS command-screen HUD: shared digital panel tokens (.dh) + slimmer RTS squad cards / footer / minimap / toast. All rules are body:not(.tl-fp) or RTS-only elements, so FP is unchanged. */
    ':root{--dh-line:rgba(150,230,110,.26);--dh-acc:#c6e600;--dh-txt:#d3e4c8;--dh-mute:#7c8d74;--dh-amber:#ffb020;--dh-bgc:rgba(4,10,8,.76);--dh-img:linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),linear-gradient(#c6e600,#c6e600),repeating-linear-gradient(0deg,rgba(150,255,170,.045) 0 1px,transparent 1px 3px),linear-gradient(90deg,rgba(150,255,170,.035) 1px,transparent 1px);--dh-size:9px 1px,1px 9px,9px 1px,1px 9px,9px 1px,1px 9px,9px 1px,1px 9px,auto,16px 16px;--dh-pos:0 0,0 0,100% 0,100% 0,0 100%,0 100%,100% 100%,100% 100%,0 0,0 0;--dh-rep:no-repeat,no-repeat,no-repeat,no-repeat,no-repeat,no-repeat,no-repeat,no-repeat,repeat,repeat}',
    '.dh{background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);color:var(--dh-txt);font:10.5px/1.3 var(--tlh-font-mono,monospace);letter-spacing:.06em;text-transform:uppercase;text-shadow:0 0 4px rgba(150,255,120,.16)}',
    '.dh-l{color:var(--dh-mute);font:9.5px/1 var(--tlh-font-mono,monospace);letter-spacing:.14em;margin-right:5px}.dh-v{color:#eaf4de;font:13px/1 var(--tlh-font-mono,monospace);letter-spacing:.04em;font-weight:400}',
    '.dh-key{display:inline-block;min-width:9px;padding:0 3px;margin-right:5px;border:1px solid rgba(198,230,0,.55);color:var(--dh-acc);font:9.5px/13px var(--tlh-font-mono,monospace);text-align:center;letter-spacing:0}',
    '.dh-led{display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 5px currentColor;flex:0 0 6px}',
    'body:not(.tl-fp) #tlh-cards{bottom:22px;gap:4px}',
    'body:not(.tl-fp) #tlh-cards .cd{background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);grid-template-columns:20px 1fr;column-gap:6px;padding:3px 8px 3px 4px;min-width:112px}/* RTS HUD pass 3 */',
    'body:not(.tl-fp) #tlh-cards .cd.sel{background-color:rgba(20,38,14,.84);border-color:rgba(198,230,0,.65)}',
    'body:not(.tl-fp) #tlh-cards .pt{width:20px;height:27px;background-size:18px auto;background-position:center 2px;border-color:rgba(150,230,110,.2)}',
    'body:not(.tl-fp) #tlh-cards b,body:not(.tl-fp) #tlh-cards .nm{font:12px/1.1 var(--tlh-font-mono,monospace);letter-spacing:.08em}',
    'body:not(.tl-fp) #tlh-cards .hp{height:2px;margin:3px 0 2px}body:not(.tl-fp) #tlh-cards .am{font-size:10px}body:not(.tl-fp) #tlh-cards .or{font-size:9px}',
    'body:not(.tl-fp) #tlh-foot{bottom:5px;font:8.5px/1.2 var(--tlh-font-mono,monospace);letter-spacing:.07em;opacity:.7;color:var(--dh-txt)}',
    'body:not(.tl-fp) #tlh-mm{width:min(180px,11vw);height:min(180px,11vw);border-color:var(--dh-line)}',
    'body:not(.tl-fp) #tlh-mmf{--tlh-text:#c6e600;width:calc(min(180px,11vw) + 14px);height:calc(min(180px,11vw) + 14px)}',
    'body:not(.tl-fp) #tlh-mmf span{bottom:-13px;font-size:8.5px}',
    'body:not(.tl-fp) #tl-toast{top:86px!important;font:500 11px/1.25 var(--tlh-font-mono,monospace)!important;padding:4px 12px!important;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}',
    'body:not(.tl-fp) #tl-toast.alert{font:500 12px/1.2 var(--tlh-font-mono,monospace)!important;padding:5px 14px 5px 66px!important;border-color:rgba(196,30,37,.75)!important}body:not(.tl-fp) #tl-toast.alert::before{width:54px;font-size:11px}',
    /* 2026-11-18: squad card numbers (Alt+1..6) and the T target marker */
    '#tlh-cards{counter-reset:tlhc}#tlh-cards .cd{counter-increment:tlhc}#tlh-cards .nm::before{content:counter(tlhc) "\\00a0";opacity:.55}#tlh-cards .cd.tt{outline:1px solid var(--tlh-acid);outline-offset:-1px}#tlh-cards .cd.tt .nm::after{content:"\\00a0\\25B6\\00a0T";color:var(--tlh-acid);letter-spacing:.04em}'
  ].join('\n');
  if(!s.parentNode&&document.head)document.head.appendChild(s);
  if(document.documentElement&&document.documentElement.style)document.documentElement.style.setProperty('--tlh-pt','url("'+H.BASE+'portrait.webp")');
};

H.el=function(id,tag){var e=document.getElementById(id);if(!e){e=document.createElement(tag||'div');e.id=id;e.className='tlh';document.body.appendChild(e);}return e;};
H.friendlies=function(){return (H.T&&H.T.squad||[]).filter(function(s){return !s.disabled&&(H.T.localOwnerId!=null?s._netOwner===H.T.localOwnerId:s.team==='friendly');});};
H.font=function(w,px,stencil){return w+' '+px+'px '+(stencil?H.THEME.fontStencil:H.THEME.font);};
H.touch=function(){H.stats.writes++;};

/* Live order tag from the order the squad code already keeps on each soldier (s.order.type / .by / .brain). No invented state. */
H.ORDER_TAG={move:'Move to',follow:'Follow',defend:'Defend area',cover:'Take cover',assault:'Assault',hunt:'Hunt',suppress:'Suppress',focus:'Focus fire',throw:'Throw',hold:'Hold'};
H.orderTag=function(s){if(!s)return '';if(!s.alive)return 'KIA';if((s.pinnedSec||0)>2)return 'Pinned';
  var o=s.order,t,by;if(!o)return 'Standby';t=o.type;by=o.by||'';
  if(t==='move'){if(by==='hold'||/-end$/.test(by)||o.arrived)return 'Hold';if(by==='resupply')return 'Resupply';if(by==='fallback')return 'Fall back';return 'Move to';}
  if(t==='brain'){t=o.brain||'brain';}
  return H.ORDER_TAG[t]||String(t||'Standby').replace(/[_-]+/g,' ');};
H.orderBad=function(s){return !s||!s.alive||(s.pinnedSec||0)>2;};

H.init=function(app,T){if(!H.on||H.app)return H;H.app=app;H.T=T;T.hud=H;H.css();if(H.play)document.body.classList.add('tl-play');
 H.cards=H.el('tlh-cards');H.res=H.el('tlh-res');H.fp=H.el('tlh-fp');H.foot=H.el('tlh-foot');
 H.foot.textContent='MMB orders \u00b7 RMB move \u00b7 G V X J assault/defend/suppress/throw \u00b7 L power \u00b7 T first person \u00b7 Tab/Alt+1-6 soldier \u00b7 F9 dev \u00b7 F10 quality';
 H.res.innerHTML='<span class="k">SCRAP</span><b class="v" data-k="scrap">\u2014</b><span class="bat" hidden><span class="k">BATTERIES</span><b class="v" data-k="bat"></b></span>';
 H.resN={scrap:H.res.querySelector('[data-k="scrap"]'),wrap:H.res.querySelector('.bat'),bat:H.res.querySelector('[data-k="bat"]'),c:{}};
 H.fp.innerHTML='<span class="hpv"></span><span class="dot">/</span><span class="st"></span><span class="dot">/</span><span class="sq"></span><span class="dn"></span>';
 H.fpN={hp:H.fp.querySelector('.hpv'),st:H.fp.querySelector('.st'),sq:H.fp.querySelector('.sq'),dn:H.fp.querySelector('.dn'),c:{}};
 H.mm=H.el('tlh-mm','canvas');H.mm.width=H.mm.height=180;H.mmx=H.mm.getContext&&H.mm.getContext('2d');
 H.mmf=H.el('tlh-mmf');H.mmf.innerHTML='<span>TAC MAP <b>//</b> GRID</span>';
 H.mm.addEventListener('mousedown',function(e){e.stopPropagation();var I=T.input;if(!I||!I.cam||I.fps)return;var k=H.mm.width/(H.mm.clientWidth||H.mm.width),w=H.toWorld(e.offsetX*k,e.offsetY*k),off=Math.max(10,I.cam.pos.y*0.6);I.cam.pos.x=w[0]+Math.sin(I.cam.yaw)*off;I.cam.pos.z=w[1]+Math.cos(I.cam.yaw)*off;if(I.apply)I.apply();});
 H.cards.addEventListener('mousedown',function(e){e.stopPropagation();});
 H.cards.addEventListener('click',H.onCardClick);
 H.cards.addEventListener('dblclick',H.onCardDbl);
 H.radialEl=H.el('tlh-radial','canvas');H.radialEl.className='';H.dpr=Math.min(2,g.devicePixelRatio||1);H.radialEl.width=H.radialEl.height=Math.round(H.RAD*H.dpr);
 H.rlist=H.el('tlh-rlist');H.rlist.className='';H.rlist.innerHTML='<div class="rh"><b>SQUAD</b><span data-k="who"></span></div><div data-k="rows"></div>';
 H.rlN={who:H.rlist.querySelector('[data-k="who"]'),rows:H.rlist.querySelector('[data-k="rows"]'),c:{},ids:null,nodes:[]};
 if(app&&app.on){app.on('tactical:power',function(ev){H.alert((ev.on?'POWER ON \u2014 ':'POWER CUT \u2014 ')+ev.name);H.ping(ev.p,ev.on);});
 app.on('tactical:town',function(){H.mmStatic=null;});app.on('update',H.tick);}
 H.nextT=0;H.trouble={};H._cardIds=null;H._cardNodes=[];return H;};

H.cardEl=function(e){var d=e.target;while(d&&d!==H.cards&&!(d.classList&&d.classList.contains('cd')))d=d.parentNode;return(d&&d.classList&&d.classList.contains('cd'))?d:null;};
H.onCardClick=function(e){var d=H.cardEl(e),I=H.T&&H.T.input,s=d&&H.friendlies()[+d.dataset.i];if(I&&s&&s.alive)I.select([s],e.shiftKey);};
H.onCardDbl=function(e){var d=H.cardEl(e),I=H.T&&H.T.input,s=d&&H.friendlies()[+d.dataset.i];if(I&&s&&s.alive){I.select([s]);I.frame();}};

H.alert=function(text){H.q.push(text);H.stats.alerts++;if(!H.showing)H.next();};
H.next=function(){var t=H.q.shift();if(t==null){H.showing=false;return;}H.showing=true;var I=H.T&&H.T.input;if(I&&I.toast)I.toast(t);var el=document.querySelector('#tl-toast');if(el){el.classList.add('alert','pulse');setTimeout(function(){el.classList.remove('pulse');},620);}
 clearTimeout(H._at);H._at=setTimeout(function(){var e2=document.querySelector('#tl-toast');if(e2)e2.classList.remove('alert');H.next();},3000);};
H.pings=[];H.ping=function(p,on){if(p)H.pings.push({p:p,on:on,t:performance.now()});};
H.set=function(el,key,html){if(H.cache[key]!==html){H.cache[key]=html;el.innerHTML=html;H.stats.writes++;}};

H.txt=function(el,c,k,v){if(c[k]===v)return;c[k]=v;el.textContent=v;H.touch();};
H.cls=function(el,name,on,c,k){if(c[k]===on)return;c[k]=on;el.classList.toggle(name,on);H.touch();};
H.bg=function(el,c,k,v){if(c[k]===v)return;c[k]=v;el.style.background=v;H.touch();};

H.ensureCards=function(fr){
  var ids=fr.map(function(s){return s.uid+':'+s.squadKey+':'+s.soldierName;}).join('|');
  if(H._cardIds===ids&&H._cardNodes&&H._cardNodes.length===fr.length)return H._cardNodes;
  H._cardIds=ids;H.cards.textContent='';
  if(!H._armyStyle){H._armyStyle=document.createElement('style');H._armyStyle.textContent='#tlh-cards{left:10px!important;right:auto!important;bottom:auto!important;top:240px;transform:none!important;display:block!important;width:236px;max-height:55vh;overflow:auto;pointer-events:auto;background:rgba(4,10,8,.88);border:1px solid #526448;color:#d3e4c8}body.tl-fp #tlh-cards{display:none!important}#tlh-cards summary{cursor:pointer;padding:6px;font:12px monospace}#tlh-cards .cd{margin:3px;min-width:0!important}#tlh-cards details details{border-top:1px solid #384638}';document.head.appendChild(H._armyStyle);}
  var army=document.createElement('details');army.open=H._armyOpen!==false;var title=document.createElement('summary');title.textContent='SQUADS · '+fr.length+' / 30';army.appendChild(title);army.ontoggle=function(){H._armyOpen=army.open;};H.cards.appendChild(army);var groups={};H._groupOpen=H._groupOpen||{};
  H._cardNodes=fr.map(function(s,i){
    var d=document.createElement('div');d.className='cd';d.dataset.i=String(i);
    d.innerHTML='<i class="pt"></i><div class="hd"><b class="nm"></b><span class="mo"></span></div><div class="hp"><i></i></div><div class="ln"><span class="am"></span><span class="or"></span></div>';
    var key=s.squadKey||('unit-'+s.uid),g=groups[key];if(!g){g=groups[key]=document.createElement('details');g.open=!!H._groupOpen[key];var title=document.createElement('summary'),members=fr.filter(function(x){return (x.squadKey||('unit-'+x.uid))===key;});title.textContent=((window.DreadingCatalogue&&DreadingCatalogue.presets[s.prepKit&&s.prepKit.packageId]||{}).name||s.role||'Squad')+' · '+members.length;title.onclick=function(){var live=members.filter(function(x){return x.alive;});if(live.length)H.T.input.select(live);};g.ontoggle=function(){H._groupOpen[key]=g.open;};g.appendChild(title);army.appendChild(g);}g.appendChild(d);H.touch();
    return {el:d,nm:d.querySelector('.nm'),mo:d.querySelector('.mo'),hp:d.querySelector('.hp i'),am:d.querySelector('.am'),or:d.querySelector('.or'),c:{}};
  });
  return H._cardNodes;
};
H.updateCard=function(n,s,sel){
  var C=H.THEME,c=n.c,hp=Math.max(0,Math.min(TacticalCombat.TUNING.health||150,s.health||0)),col=hp>60?C.ok:hp>30?C.hurt:C.crit;
  var mo=!s.alive?C.dead:(s.pinnedSec||0)>2?C.crit:s.suppress?C.hurt:C.ok;
  var am=s.alive?(s.arms?s.arms.mag+' / '+s.arms.reserve:''):'KIA';
  H.txt(n.nm,c,'name',s.soldierName||'?');
  H.cls(n.el,'sel',!!sel,c,'sel');H.cls(n.el,'dead',!s.alive,c,'dead');
  if(c.hp!==hp){c.hp=hp;n.hp.style.transform='scaleX('+(Math.min(1,hp/(TacticalCombat.TUNING.health||100)))+')';H.touch();}
  H.bg(n.hp,c,'hpCol',col);H.bg(n.mo,c,'mo',mo);H.txt(n.am,c,'am',am);
  if(n.or){H.txt(n.or,c,'or',H.orderTag(s));H.cls(n.or,'bad',H.orderBad(s),c,'orBad');}
};

H.syncRes=function(){
  var R=H.T.resources,n=H.resN,c=n.c;
  if(!R){H.txt(n.scrap,c,'scrap','\u2014');if(c.batOn){c.batOn=false;n.wrap.hidden=true;H.touch();}return;}
  H.txt(n.scrap,c,'scrap',String(R.scrap|0));
  var on=R.batteries!=null;if(c.batOn!==on){c.batOn=on;n.wrap.hidden=!on;H.touch();}
  if(on)H.txt(n.bat,c,'bat',String(R.batteries));
};
H.syncFp=function(s,fr){
  var C=H.THEME,n=H.fpN,c=n.c,hp=Math.max(0,s.health||0),col=hp>60?C.text:hp>30?C.hurt:'#ff4a50';
  var fol=H.T.orders&&H.T.orders.follow?H.T.orders.follow.members.filter(function(o){return o!==s&&o.alive;}).length:0;
  var down=fr.filter(function(o){return !o.alive;}).map(function(o){return o.soldierName;});
  H.txt(n.hp,c,'hp','HP '+hp.toFixed(0));if(c.hpCol!==col){c.hpCol=col;n.hp.style.color=col;H.touch();}
  H.txt(n.st,c,'st',s.wantCrouch?'CROUCH':'STAND');
  H.txt(n.sq,c,'sq',fol?'squad following ('+fol+')':'squad waiting');
  H.txt(n.dn,c,'dn',down.length?'DOWN: '+down.join(', '):'');
};

/* Squad list beside the wheel: rows rebuilt only when the roster changes; tags/highlights via cached writes. */
H.ensureRlist=function(fr){var N=H.rlN,ids=fr.map(function(s){return s.soldierName||'?';}).join('|');
  if(N.ids===ids&&N.nodes.length===fr.length)return N.nodes;N.ids=ids;N.rows.textContent='';
  N.nodes=fr.map(function(s){var d=document.createElement('div');d.className='rr';d.innerHTML='<i class="pt"></i><div><span class="nm"></span><span class="or"></span></div>';N.rows.appendChild(d);H.touch();
    return {el:d,nm:d.querySelector('.nm'),or:d.querySelector('.or'),c:{}};});return N.nodes;};
H.syncRlist=function(){if(!H.rlist||!H.radial)return;var T=H.T||{},fr=H.friendlies(),sel=T.selection||[],nodes=H.ensureRlist(fr),i,s,n;
  H.txt(H.rlN.who,H.rlN.c,'who',(H.radial.who||'').toUpperCase());
  for(i=0;i<nodes.length;i++){s=fr[i];n=nodes[i];H.txt(n.nm,n.c,'nm',s.soldierName||'?');H.txt(n.or,n.c,'or',H.orderTag(s));
    H.cls(n.or,'bad',H.orderBad(s),n.c,'bad');H.cls(n.el,'on',s.alive&&sel.indexOf(s)>=0,n.c,'on');H.cls(n.el,'dead',!s.alive,n.c,'dead');}};

H.tick=function(){var T=H.T,now=performance.now();if(!T||!T.ready)return;if(H.radial)H.drawRadial();if(now<H.nextT)return;H.nextT=now+200;var I=T.input,fp=!!(I&&I.fps);var objectives=document.getElementById('dob-side');if(H.cards&&objectives){var top=Math.max(90,objectives.getBoundingClientRect().bottom+8);H.cards.style.top=top+'px';H.cards.style.maxHeight=Math.max(100,innerHeight-top-100)+'px';}
 document.body.classList.toggle('tl-fp',fp);var fr=H.friendlies(),sel=T.selection||[];
 if(!fp){var nodes=H.ensureCards(fr),tgt=H.T.input&&H.T.input.controlTarget?H.T.input.controlTarget():null;for(var i=0;i<nodes.length;i++){H.updateCard(nodes[i],fr[i],sel.indexOf(fr[i])>=0);H.cls(nodes[i].el,'tt',fr[i]===tgt,nodes[i].c,'tt');}H.syncRes();}
 else if(I.fps&&I.fps.s)H.syncFp(I.fps.s,fr);
 if(H.radial)H.syncRlist();
 fr.forEach(function(s){if(s.alive&&(s.health||0)<35&&!(H.trouble[s.soldierName]>now)){H.trouble[s.soldierName]=now+20000;H.alert('SQUAD IN TROUBLE \u2014 '+s.soldierName);}});
 H.drawMinimap(fp);};

H.EXT=150;H.toMap=function(x,z){var n=H.mm.width;return [(x+H.EXT)/(2*H.EXT)*n,(z+H.EXT)/(2*H.EXT)*n];};H.toWorld=function(px,py){var n=H.mm.width;return [px/n*2*H.EXT-H.EXT,py/n*2*H.EXT-H.EXT];};
H.drawMinimap=function(fp){var T=H.T,tw=T.town,n=fp?96:180,C=H.THEME;if(!H.mm)return;if(H.mm.width!==n){H.mm.width=H.mm.height=n;H.mmStatic=null;H.mmx=H.mm.getContext&&H.mm.getContext('2d');}var x=H.mmx;if(!x)return;
 if(!H.mmStatic&&tw&&tw.buildings){var oc=document.createElement('canvas');oc.width=oc.height=n;var o=oc.getContext('2d');if(!o)return;o.fillStyle='#0c0e0d';o.fillRect(0,0,n,n);
  o.strokeStyle='rgba(236,235,228,.05)';o.lineWidth=1;for(var gx=0;gx<=n;gx+=n/6){o.beginPath();o.moveTo(gx+0.5,0);o.lineTo(gx+0.5,n);o.stroke();o.beginPath();o.moveTo(0,gx+0.5);o.lineTo(n,gx+0.5);o.stroke();}
  o.strokeStyle='#2c2f2b';o.lineCap='round';
  (tw.roads||[]).forEach(function(rd){o.lineWidth=Math.max(1,(rd.w||6)/(2*H.EXT)*n);o.beginPath();(rd.pts||[]).forEach(function(p,i){var q=H.toMap(p[0],p[1]);if(i)o.lineTo(q[0],q[1]);else o.moveTo(q[0],q[1]);});o.stroke();});
  tw.buildings.forEach(function(b){if(!b||!b.rect)return;var a=H.toMap(b.rect[0],b.rect[1]),c=H.toMap(b.rect[2],b.rect[3]);o.fillStyle=b.state==='collapsed'?'#3b2120':'#4a4d47';o.fillRect(a[0],a[1],Math.max(1,c[0]-a[0]),Math.max(1,c[1]-a[1]));});H.mmStatic=oc;}
 if(!H.mmStatic)return;x.drawImage(H.mmStatic,0,0);H.stats.mmDraws++;
 var P=T.power;if(P&&tw&&tw.buildings)tw.buildings.forEach(function(b){if(b&&P.on[b.id]){var a=H.toMap(b.rect[0],b.rect[1]),c=H.toMap(b.rect[2],b.rect[3]);x.fillStyle='rgba(198,230,0,.5)';x.fillRect(a[0],a[1],Math.max(2,c[0]-a[0]),Math.max(2,c[1]-a[1]));}});
 var S=T.strategy;if(S&&S.objectives)S.objectives.forEach(function(o){if(o.kind==='extraction'){var q=H.toMap(o.p[0],o.p[2]);x.strokeStyle=C.acid;x.lineWidth=1;x.strokeRect(q[0]-3.5,q[1]-3.5,7,7);}});
 var fr=H.friendlies().filter(function(s){return s.alive;}),seen={};
 if(T.perception&&T.perception.known)fr.forEach(function(s){try{T.perception.known(s,true).forEach(function(r){var p=r.lastSensedPosition;if(p)seen[p[0].toFixed(0)+','+p[2].toFixed(0)]=p;});}catch(e){}});
 x.fillStyle='#e0262e';Object.keys(seen).forEach(function(k){var q=H.toMap(seen[k][0],seen[k][2]);x.fillRect(q[0]-1.5,q[1]-1.5,3,3);});
 fr.forEach(function(s){var p=s.pos(),q=H.toMap(p[0],p[2]),on=(T.selection||[]).indexOf(s)>=0;x.fillStyle=on?'#ffffff':C.acid;x.beginPath();x.moveTo(q[0],q[1]-3.2);x.lineTo(q[0]+3.2,q[1]);x.lineTo(q[0],q[1]+3.2);x.lineTo(q[0]-3.2,q[1]);x.closePath();x.fill();});
 var I=T.input,cp=T.camera.getPosition(),yaw=I&&I.fps?I.fps.yaw:I&&I.cam?I.cam.yaw:0,q2=H.toMap(cp.x,cp.z);x.fillStyle='rgba(236,235,228,.22)';x.beginPath();x.moveTo(q2[0],q2[1]);x.arc(q2[0],q2[1],16,-Math.PI/2-yaw-0.5,-Math.PI/2-yaw+0.5);x.closePath();x.fill();
 var now=performance.now();H.pings=H.pings.filter(function(p){var a=(now-p.t)/1500;if(a>1)return false;var q=H.toMap(p.p[0],p.p[2]);x.strokeStyle=p.on?'rgba(198,230,0,'+(1-a)+')':'rgba(196,30,37,'+(1-a)+')';x.lineWidth=2;x.beginPath();x.arc(q[0],q[1],4+a*16,0,6.283);x.stroke();return true;});};

H.openRadial=function(cx,cy,who){if(H.radial)return;var r=H.radialEl,h=H.RAD/2,cv=H.app&&H.app.graphicsDevice&&H.app.graphicsDevice.canvas,rc=cv&&cv.getBoundingClientRect?cv.getBoundingClientRect():{left:0,top:0};H.radial={cx:cx,cy:cy,vx:0,vy:0,sel:-1,who:who||'whole squad'};
 r.style.left=(rc.left+cx-h)+'px';r.style.top=(rc.top+cy-h)+'px';r.style.display='block';
 if(H.rlist){var L=rc.left+cx-h-244;if(L<8)L=rc.left+cx+h+12;H.rlist.style.left=L+'px';H.rlist.style.top=Math.max(8,rc.top+cy-h+28)+'px';H.rlist.style.display='block';H.syncRlist();}
 H.stats.radialOpens++;H._rk=null;H.drawRadial(true);};
H.radialMove=function(dx,dy,abs){var R=H.radial;if(!R)return;if(abs){R.vx=dx-R.cx;R.vy=dy-R.cy;}else{R.vx+=dx;R.vy+=dy;var m=Math.hypot(R.vx,R.vy);if(m>110){R.vx*=110/m;R.vy*=110/m;}}R.sel=H.slice(R.vx,R.vy);};
H.slice=function(vx,vy){if(Math.hypot(vx,vy)<H.DEAD)return -1;var a=Math.atan2(vx,-vy);if(a<0)a+=6.283185;return Math.floor((a+Math.PI/8)/(Math.PI/4))%8;};
H.closeRadial=function(){var R=H.radial;H.radial=null;if(H.radialEl)H.radialEl.style.display='none';if(H.rlist)H.rlist.style.display='none';if(!R||R.sel<0)return null;return H.SLICES[R.sel].k;};
/* Octagon wheel: 8 flat-edged wedges on dark glass, thin light rules, white condensed labels, red selected wedge + edge bar. */
H.octPt=function(i,r,c){var a=-Math.PI/2+(i-0.5)*Math.PI/4;return [c+Math.cos(a)*r,c+Math.sin(a)*r];};
H.drawRadial=function(force){var R=H.radial;if(!R||!H.radialEl)return;var key=R.sel+'|'+R.who;if(!force&&key===H._rk)return;H._rk=key;var x=H.radialEl.getContext&&H.radialEl.getContext('2d'),C=H.THEME;if(!x)return;
 var S=H.RAD,c=S/2,RO=c-14,RI=56,d=H.dpr||1,i,p0,p1,q0,q1,on,am,lab,words,ro2;x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,S,S);
 /* outer guide ring + vertex ticks */
 x.beginPath();for(i=0;i<8;i++){p0=H.octPt(i,RO+8,c);if(i)x.lineTo(p0[0],p0[1]);else x.moveTo(p0[0],p0[1]);}x.closePath();x.strokeStyle='rgba(236,235,228,.16)';x.lineWidth=1;x.stroke();
 for(i=0;i<8;i++){p0=H.octPt(i,RO+4,c);p1=H.octPt(i,RO+13,c);x.beginPath();x.moveTo(p0[0],p0[1]);x.lineTo(p1[0],p1[1]);x.strokeStyle='rgba(236,235,228,.5)';x.stroke();}
 for(i=0;i<8;i++){on=i===R.sel;p0=H.octPt(i,RO,c);p1=H.octPt(i+1,RO,c);q0=H.octPt(i,RI,c);q1=H.octPt(i+1,RI,c);
  x.beginPath();x.moveTo(p0[0],p0[1]);x.lineTo(p1[0],p1[1]);x.lineTo(q1[0],q1[1]);x.lineTo(q0[0],q0[1]);x.closePath();
  if(on){x.fillStyle='rgba(176,24,32,.82)';}else{var gr=x.createLinearGradient(0,0,0,S);gr.addColorStop(0,'rgba(34,38,36,.5)');gr.addColorStop(1,'rgba(8,10,9,.5)');x.fillStyle=gr;}
  x.fill();x.strokeStyle=on?'rgba(255,120,120,.9)':'rgba(236,235,228,.34)';x.lineWidth=1;x.stroke();
  if(on){x.beginPath();ro2=RO-3;var e0=H.octPt(i,ro2,c),e1=H.octPt(i+1,ro2,c),mx=(e0[0]+e1[0])/2,my=(e0[1]+e1[1])/2;x.moveTo(e0[0]+(mx-e0[0])*0.25,e0[1]+(my-e0[1])*0.25);x.lineTo(e1[0]+(mx-e1[0])*0.25,e1[1]+(my-e1[1])*0.25);x.strokeStyle='#ff3b42';x.lineWidth=4;x.stroke();}
  am=-Math.PI/2+i*Math.PI/4;lab=H.SLICES[i].t.toUpperCase();words=lab.split(' ');x.fillStyle=on?'#ffffff':'rgba(240,239,233,.94)';x.font=H.font(on?'600':'500',14,false);x.textAlign='center';x.textBaseline='middle';
  try{x.letterSpacing='1.5px';}catch(e){}
  var lx=c+Math.cos(am)*((RO+RI)/2+4),ly=c+Math.sin(am)*((RO+RI)/2+4);
  if(words.length>1&&x.measureText(lab).width>86){var cut=Math.ceil(words.length/2),l1=words.slice(0,cut).join(' '),l2=words.slice(cut).join(' ');x.fillText(l1,lx,ly-8);x.fillText(l2,lx,ly+9);}else x.fillText(lab,lx,ly);}
 /* hub */
 x.beginPath();for(i=0;i<8;i++){p0=H.octPt(i,RI-4,c);if(i)x.lineTo(p0[0],p0[1]);else x.moveTo(p0[0],p0[1]);}x.closePath();x.fillStyle='rgba(8,10,9,.78)';x.fill();x.strokeStyle='rgba(236,235,228,.45)';x.lineWidth=1;x.stroke();
 try{x.letterSpacing='1px';}catch(e){}
 x.fillStyle=R.sel<0?'#ffffff':'rgba(236,235,228,.7)';x.font=H.font('600',11,false);x.textAlign='center';x.textBaseline='middle';x.fillText((R.who.length>12?R.who.slice(0,11)+'\u2026':R.who).toUpperCase(),c,c-20);
 x.fillStyle=R.sel<0?C.muted:'#ff6b70';x.font='400 9px '+H.THEME.fontMono;x.fillText(R.sel<0?'RELEASE: CANCEL':'RELEASE: ORDER',c,c+21);
 try{x.letterSpacing='0px';}catch(e){}};
})(typeof globalThis!=='undefined'?globalThis:window);
