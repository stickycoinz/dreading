/* DREADING hover floor picker (2026-11-19).
   RTS command view: with soldiers selected, rest the cursor on a building for ~250 ms and a small floor list appears next
   to it. Click a floor = exactly the old right-click -> floor menu order (it calls TacticalRtsInput.openFloors + floorSend,
   which go through T.orders.startBrain, so a guest's order is sent to the host the same way the old menu's is).
   Wheel over the list, or Shift+wheel over the building, highlights ("arms") a floor; a right-click on that building then
   sends straight to the armed floor. With nothing armed, right-click still opens the old menu.
   Cost: one throttled pick (<= every 60 ms) on mouse move, ~4 rechecks/s while a list is open, floor lists cached 4 s.
   No per-frame scan of buildings or zombies, no lights. Does not modify tactical-rts-input.js. */
(function(){'use strict';
const CFG={delay:250,hideGrace:320,throttle:60,cacheMs:4000,recheck:250};
const H=window.DreadingHoverFloor={cfg:CFG,shown:null,armed:null,hover:null,last:null,stats:{picks:0,floorCalls:0,shows:0,sends:0,rmbSends:0}};
let T,I,app,canvas,el=null,lastPick=0,pickTimer=0,cand=null,showTimer=0,hideTimer=0,overPicker=false,cutOwned=false,lastCheck=0,rdown=null,suppress=null;
const mouse={x:-1,y:-1};
const cache=new Map();
const css=document.createElement('style');css.textContent=
'#dob-hoverfloor{position:fixed;z-index:45;min-width:150px;max-width:230px;box-sizing:border-box;background:rgba(8,12,10,.84);border:1px solid rgba(150,230,110,.45);box-shadow:0 0 0 1px rgba(0,0,0,.5),0 0 12px rgba(198,230,0,.07);font:10px/1.3 var(--tlh-font-mono,monospace);color:#b9cdb0;text-transform:uppercase;letter-spacing:.1em;user-select:none;pointer-events:auto;padding:2px 0;opacity:0;transition:opacity .12s}'+
'#dob-hoverfloor.on{opacity:1}'+
'#dob-hoverfloor .hf-h{padding:2px 7px 3px;border-bottom:1px solid rgba(150,230,110,.18);color:#c6e600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
'#dob-hoverfloor .hf-row{display:grid;grid-template-columns:12px 1fr auto;gap:6px;align-items:center;padding:2px 7px;cursor:pointer;color:#eaf4de;font-size:11px;white-space:nowrap}'+
'#dob-hoverfloor .hf-row .n,#dob-hoverfloor .hf-row .y{color:#7c8d74;font-size:9.5px}'+
'#dob-hoverfloor .hf-row.hi{background:rgba(198,230,0,.13);color:#fff}'+
'#dob-hoverfloor .hf-row.armed{box-shadow:inset 2px 0 0 #c6e600}#dob-hoverfloor .hf-row.armed .n{color:#c6e600}'+
'#dob-hoverfloor .hf-f{padding:3px 7px 1px;border-top:1px solid rgba(150,230,110,.18);color:#7c8d74;font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
document.head.appendChild(css);
const short=(f)=>f.roof&&f.i>0?'ROOF':f.i===0?'GROUND':(f.i+1)+'F';
function selection(){return (T.selection||[]).filter(s=>s&&s.alive&&!s.controlled&&s.team==='friendly');}
function enabled(){const N=window.DreadingMultiplayer;if(!T||!T.ready||!I||I.fps||I.floorPick)return false;if(N&&N.slot===2)return false;if(I.drag&&(I.drag.moved||I.drag.radial))return false;if(window.DreadingMPPrep&&DreadingMPPrep.canPlay&&!DreadingMPPrep.canPlay())return false;return !!(T.orders&&T.orders.buildingNear&&T.orders.buildingFloors);}
function floors(ref,fresh){const now=performance.now(),c=cache.get(ref);if(!fresh&&c&&now-c.t<CFG.cacheMs)return c.F;H.stats.floorCalls++;const F=T.orders.buildingFloors(ref);cache.set(ref,{t:now,F});return F;}
function pickAt(cx,cy){const r=canvas.getBoundingClientRect(),x=cx-r.left,y=cy-r.top;if(x<0||y<0||x>r.width||y>r.height)return null;H.stats.picks++;const hit=I.pickWorld(x,y);if(!hit)return null;const bn=T.orders.buildingNear(hit.point,.15);if(!bn)return null;const F=floors(bn.ref);return F&&F.ok&&F.floors.length?F:null;}
function clearT(){clearTimeout(showTimer);showTimer=0;}
function scheduleHide(){if(!H.shown||hideTimer)return;hideTimer=setTimeout(()=>{hideTimer=0;if(!overPicker)hide();},CFG.hideGrace);}
function cancelHide(){clearTimeout(hideTimer);hideTimer=0;}
function evaluate(){pickTimer=0;lastPick=performance.now();
 if(!enabled()||!selection().length){cand=null;clearT();if(H.shown)hide();return;}
 if(overPicker){cancelHide();return;}
 const F=pickAt(mouse.x,mouse.y);
 if(!F){cand=null;suppress=null;clearT();scheduleHide();return;}
 if(suppress!==null&&suppress!==F.ref)suppress=null;
 cancelHide();
 if(H.shown&&H.shown.F.ref===F.ref){cand=null;clearT();return;}
 if(suppress===F.ref)return;
 if(cand!==F.ref){cand=F.ref;clearT();showTimer=setTimeout(()=>{showTimer=0;if(cand!==F.ref||!enabled()||!selection().length||overPicker)return;cand=null;show(F);},CFG.delay);}}
function blockers(){const out=[],R=window.DreadingObjectives&&DreadingObjectives.rtsHud&&DreadingObjectives.rtsHud.rects;if(Array.isArray(R))for(const q of R)if(q&&q.length>=4)out.push(q);
 for(const sel of ['#dob-strip','#dob-side','#tlh-cards','#capture-objectives','#mp-panel','#tlh-res','#dob-bar','#audio-control']){const e=document.querySelector(sel);if(!e)continue;const r=e.getBoundingClientRect();if(r.width<2||r.height<2||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility==='hidden')continue;out.push([r.left,r.top,r.right,r.bottom]);}return out;}
function place(w,h){const W=innerWidth,Hh=innerHeight,B=blockers(),cx=mouse.x,cy=mouse.y;
 const cands=[[cx+20,cy-14],[cx-20-w,cy-14],[cx+20,cy-h+14],[cx-20-w,cy-h+14],[cx-w/2,cy+26],[cx-w/2,cy-h-26]];
 let best=null,bo=Infinity;for(const c of cands){const l=Math.max(4,Math.min(W-w-4,c[0])),t=Math.max(4,Math.min(Hh-h-4,c[1]));
  let o=0;for(const q of B){const ix=Math.min(l+w,q[2])-Math.max(l,q[0]),iy=Math.min(t+h,q[3])-Math.max(t,q[1]);if(ix>0&&iy>0)o+=ix*iy;}
  if(cx>=l-6&&cx<=l+w+6&&cy>=t-6&&cy<=t+h+6)o+=w*h;/* never under the cursor */
  if(o<bo){bo=o;best=[l,t];}if(o===0)break;}
 return best;}
function show(F){hide();const sel=selection();if(!sel.length)return;
 el=document.createElement('div');el.id='dob-hoverfloor';el.style.visibility='hidden';
 const head=document.createElement('div');head.className='hf-h';head.textContent='\u25b8 '+sel.length+' SEL \u2192 '+String(F.name||'BUILDING').toUpperCase();el.appendChild(head);
 F.floors.slice().reverse().forEach(f=>{const r=document.createElement('div');r.className='hf-row';r.dataset.i=f.i;r.innerHTML='<span class="n"></span><span class="k"></span><span class="y"></span>';r.children[0].textContent=f.i+1;r.children[1].textContent=short(f);r.children[2].textContent=f.y.toFixed(1)+' M';
  r.onmouseenter=()=>highlight(f.i);r.onmouseleave=()=>highlight(H.armed);
  r.onmousedown=(e)=>{e.preventDefault();e.stopPropagation();if(e.button===0||e.button===2)send(f.i,'click');};el.appendChild(r);});
 const ft=document.createElement('div');ft.className='hf-f';ft.textContent='CLICK = GO \u00b7 WHEEL + RMB = PICK & GO';el.appendChild(ft);
 el.addEventListener('contextmenu',e=>e.preventDefault());
 el.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();cycle(e.deltaY||e.deltaX);},{passive:false});
 el.addEventListener('mouseenter',()=>{overPicker=true;cancelHide();});
 el.addEventListener('mouseleave',()=>{overPicker=false;highlight(H.armed);scheduleHide();});
 document.body.appendChild(el);const r=el.getBoundingClientRect(),p=place(r.width,r.height);el.style.left=Math.round(p[0])+'px';el.style.top=Math.round(p[1])+'px';el.style.visibility='';
 requestAnimationFrame(()=>el&&el.classList.add('on'));
 H.shown={F,el,t:performance.now()};H.armed=null;H.hover=null;H.stats.shows++;lastCheck=performance.now();}
function hide(){cancelHide();if(el)el.remove();el=null;const had=!!H.shown;H.shown=null;H.armed=null;H.hover=null;overPicker=false;
 if(cutOwned&&T&&T.xray&&T.xray.setFloorCut&&!(I&&(I.floorPick||(I.floorCutUntil&&performance.now()<I.floorCutUntil))))T.xray.setFloorCut(null);cutOwned=false;return had;}
function highlight(i){const P=H.shown;if(!P)return;H.hover=i==null?null:i;
 for(const r of P.el.querySelectorAll('.hf-row')){r.classList.toggle('hi',+r.dataset.i===i);r.classList.toggle('armed',+r.dataset.i===H.armed);}
 if(T.xray&&T.xray.setFloorCut){if(i==null){if(cutOwned)T.xray.setFloorCut(null);cutOwned=false;}else{const f=P.F.floors[i];T.xray.setFloorCut(P.F.rect,f.roof?f.y+30:f.y+2.2);cutOwned=true;}}}
function cycle(dy){const P=H.shown;if(!P||!dy)return;const n=P.F.floors.length;let a=H.armed;
 if(a==null)a=dy>0?n-1:0;else a=Math.max(0,Math.min(n-1,a+(dy>0?-1:1)));H.armed=a;highlight(a);}
function send(i,how){const P=H.shown;if(!P)return null;const sel=selection();if(!sel.length){hide();return null;}
 const Ff=floors(P.F.ref,true),F=Ff&&Ff.ok&&Ff.floors[i]?Ff:P.F,f=F.floors[i];if(!f)return null;
 const who=sel.map(s=>s.soldierName).join(', ');cutOwned=false;
 I.openFloors(F,sel,who,false,mouse.x,mouse.y);const b=I.floorSend(i);
 H.stats.sends++;if(how==='rmb')H.stats.rmbSends++;H.last={how,building:F.ref,floor:f.label,i,y:f.y,status:b?b.status:null,why:b&&b.why||null,members:b&&b.members?b.members.length:0,t:performance.now()};
 suppress=F.ref;cand=null;clearT();hide();return b;}
function onMove(e){mouse.x=e.clientX;mouse.y=e.clientY;
 if(el&&el.contains(e.target)){overPicker=true;cancelHide();return;}
 if(e.target!==canvas){cand=null;clearT();if(H.shown&&!overPicker)scheduleHide();return;}
 const dt=performance.now()-lastPick;if(dt>=CFG.throttle)evaluate();else if(!pickTimer)pickTimer=setTimeout(evaluate,CFG.throttle-dt);}
function onWheel(e){if(!e.shiftKey||!H.shown||e.target!==canvas||!enabled())return;e.preventDefault();e.stopPropagation();cycle(e.deltaY||e.deltaX);}
function onRDown(e){rdown=null;if(e.button!==2||e.target!==canvas||!H.shown||H.armed==null||!enabled())return;rdown={x:e.clientX,y:e.clientY,t:performance.now(),ref:H.shown.F.ref};}
function onRUp(e){const d=rdown;rdown=null;if(!d||e.button!==2||!H.shown||H.armed==null)return;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>6||performance.now()-d.t>400)return;
 const F=pickAt(e.clientX,e.clientY);if(!F||F.ref!==d.ref)return;I.drag=null;/* the old right-click handler then has nothing to act on */send(H.armed,'rmb');}
function tick(){if(!H.shown&&!cand)return;
 if(!enabled()||!selection().length){cand=null;clearT();hide();return;}
 const P=H.shown;if(!P)return;const now=performance.now();
 if(now-lastCheck>CFG.recheck){lastCheck=now;const h=P.el.firstChild,txt='\u25b8 '+selection().length+' SEL \u2192 '+String(P.F.name||'BUILDING').toUpperCase();if(h.textContent!==txt)h.textContent=txt;
  if(!overPicker&&mouse.x>=0&&document.elementFromPoint(mouse.x,mouse.y)===canvas){const F=pickAt(mouse.x,mouse.y);if(!F||F.ref!==P.F.ref)scheduleHide();else cancelHide();}}
 if(H.hover==null)return;const f=P.F.floors[H.hover];if(!f)return;const R=P.F.rect,y=f.y+0.12,c=new pc.Color(0.78,0.9,0.1),a=new pc.Vec3(),b=new pc.Vec3();
 const L=(p,q)=>{a.set(p[0],p[1],p[2]);b.set(q[0],q[1],q[2]);app.drawLine(a,b,c,false);};
 L([R[0],y,R[1]],[R[2],y,R[1]]);L([R[2],y,R[1]],[R[2],y,R[3]]);L([R[2],y,R[3]],[R[0],y,R[3]]);L([R[0],y,R[3]],[R[0],y,R[1]]);
 for(let k=1;k<4;k++){const x=R[0]+(R[2]-R[0])*k/4,z=R[1]+(R[3]-R[1])*k/4;L([x,y,R[1]],[x,y,R[3]]);L([R[0],y,z],[R[2],y,z]);}}
function boot(){const t=window.tactical;if(!t||!t.T||!t.T.ready||!t.T.input||!t.app){setTimeout(boot,500);return;}
 T=t.T;app=t.app;I=T.input;canvas=app.graphicsDevice.canvas;
 window.addEventListener('mousemove',onMove,{passive:true});
 window.addEventListener('wheel',onWheel,{capture:true,passive:false});
 window.addEventListener('mousedown',onRDown,true);window.addEventListener('mouseup',onRUp,true);
 window.addEventListener('blur',()=>{cand=null;clearT();hide();});
 app.on('update',tick);H.ready=true;
 H.state=()=>({shown:H.shown?H.shown.F.ref:null,name:H.shown?H.shown.F.name:null,rows:el?[...el.querySelectorAll('.hf-row')].map(r=>r.children[1].textContent):[],armed:H.armed,hover:H.hover,rect:el?(r=>[r.left,r.top,r.width,r.height].map(Math.round))(el.getBoundingClientRect()):null,last:H.last,stats:Object.assign({},H.stats)});
 H.hide=hide;}
boot();
})();
