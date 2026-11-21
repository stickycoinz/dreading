/* tacticalDebugDraw: advances the sim clock, draws AI debug (perception cone + LOS rays + last-known positions for the
   selected soldiers, squad knowledge, cover candidates for the selected soldier, nav problems, navmesh) and fills the
   panel: squad rows with HP / ammo / action, inspector of the first selected soldier, outcome banner. */
var TacticalDebugDraw=pc.createScript('tacticalDebugDraw');
TacticalDebugDraw.prototype.initialize=function(){var T=TacticalCommon.ns(this.app);T.debugDraw=this;this.tick=0;};
/* pass 4b: DOM writes only when the text changes (innerHTML every frame forced style/layout work), and warning markers only within 45 m of the camera. */
function setHtml(el,h){if(el&&el._h!==h){el._h=h;el.innerHTML=h;}}function setText(el,t){if(el&&el._t!==t){el._t=t;el.textContent=t;}}function setCss(el,k,v){if(el&&el.style[k]!==v)el.style[k]=v;}
TacticalDebugDraw.prototype.postUpdate=function(dt){
 var C=TacticalCommon,T=C.ns(this.app),app=this.app,NS=TacticalNS;if(!T.ready)return;this.tick+=dt;if(T.running&&!T.paused)T.elapsed+=Math.min(dt,.05);
 var tmpA=new pc.Vec3(),tmpB=new pc.Vec3();
 function line(a,b,c){tmpA.set(a[0],a[1],a[2]);tmpB.set(b[0],b[1],b[2]);app.drawLine(tmpA,tmpB,c,false);}
 function cross(p,c,r){r=r||.17;line([p[0]-r,p[1],p[2]],[p[0]+r,p[1],p[2]],c);line([p[0],p[1],p[2]-r],[p[0],p[1],p[2]+r],c);}
 function xmark(p,c,r){line([p[0]-r,p[1],p[2]-r],[p[0]+r,p[1]+2*r,p[2]+r],c);line([p[0]+r,p[1],p[2]-r],[p[0]-r,p[1]+2*r,p[2]+r],c);line([p[0]-r,p[1],p[2]+r],[p[0]+r,p[1]+2*r,p[2]-r],c);}
 var dbg=T.debug,cam=T.camera,sel=(T.selection||[]),now=T.elapsed,P=T.perception;
 var yellow=new pc.Color(1,.85,.3),red=new pc.Color(1,.3,.25),green=new pc.Color(.3,1,.5),grey=new pc.Color(.6,.6,.6);
 if(dbg){sel.forEach(function(s){if(!s.alive||!s.vision)return;var e=NS.entEye(s),half=s.vision.fieldOfView/2,L=7;
   [-half,half].forEach(function(a){var f=NS.fwd(s.lookYaw+a,0);line(e,[e[0]+f[0]*L,e[1],e[2]+f[2]*L],grey);});
   for(var i=0;i<8;i++){var a0=-half+i/8*2*half,a1=-half+(i+1)/8*2*half,f0=NS.fwd(s.lookYaw+a0,0),f1=NS.fwd(s.lookYaw+a1,0);line([e[0]+f0[0]*L,e[1],e[2]+f0[2]*L],[e[0]+f1[0]*L,e[1],e[2]+f1[2]*L],grey);}
   s.memory.records.forEach(function(r){if(r.dead||!r.entity.alive||r.timeLastSensed<-1e9)return;if(r.visible)line(e,NS.entChest(r.entity),green);else if(now-r.timeLastSensed<=s.memory.memorySpan){var lk=r.lastSensedPosition;line(e,[lk[0],lk[1]+1.2,lk[2]],yellow);}});});
  // squad knowledge: last-known enemy positions (yellow X), fading with age
  var fr=T.squad.find(function(s){return s.team==='friendly'&&s.alive;});if(fr)P.known(fr,true).forEach(function(r){if(!r.visible){var lk=r.lastSensedPosition;xmark([lk[0],lk[1]+.05,lk[2]],yellow,.35);}});
  /* pass 4c: the cover preview for the selected soldier scored EVERY usable cover point (~1,180) against EVERY known threat
     (up to 150 zombies) with 2 rays each, twice a second: 100k-350k ray tests, a 150-600 ms hitch every 0.5 s while a soldier
     was selected with AI debug on. Display-only, so now: points within 25 m, the 8 nearest threats, once per second. */
  var s0=sel[0];if(s0&&s0.alive&&(this._covS!==s0||this.tick-(this._covT||-9)>=1)){this._covS=s0;this._covT=this.tick;var mp=s0.pos(),th=P.threatsFor(s0).map(function(q){return [Math.hypot(q[0]-mp[0],q[2]-mp[2]),q];}).sort(function(a,b){return a[0]-b[0];}).slice(0,8).map(function(x){return x[1];});this._cov=T.cover.score(s0,th,{radius:25}).slice(0,12);}(this._cov||[]).forEach(function(c){cross([c.position[0],c.position[1]+.05,c.position[2]],c.claimed?grey:c.crouched?green:red);});
  if(s0&&s0.alive&&s0.coverWhy&&s0.coverWhy.rejectedEx){var cy=this._cyc||(this._cyc=new pc.Color(.3,.9,1)),sp=s0.pos(),pk=s0.coverWhy.picked;if(pk&&pk.position){line([sp[0],sp[1]+.1,sp[2]],[pk.position[0],pk.position[1]+.1,pk.position[2]],cy);cross([pk.position[0],pk.position[1]+.1,pk.position[2]],cy,.35);}
   s0.coverWhy.rejectedEx.forEach(function(r){xmark([r.position[0],r.position[1]+.05,r.position[2]],red,.12);});}/* milestone 4: auto-cover pick (cyan) and rejected examples (red x) */
  var cpp=cam.getPosition(),wv=this._wc||(this._wc=new pc.Color(.8,.4,.9)),ev=this._ec||(this._ec=new pc.Color(1,.2,.9));(T.report.problems||[]).forEach(function(pr){var q=pr.position;if(pr.severity==='warning'&&Math.abs(q[0]-cpp.x)+Math.abs(q[2]-cpp.z)>45+cpp.y)return;xmark(pr.position,pr.severity==='warning'?wv:ev,pr.severity==='warning'?.15:.4);});
  var nm=document.querySelector('#navmesh');if(nm&&nm.checked&&T.navigation.nav){var blue=new pc.Color(.16,.36,.5);T.navigation.nav.debugLines.forEach(function(l){line(l[0],l[1],blue);});}}
 // labels: friendlies always, enemies only while the squad currently sees them
 /* DREADING_perf: label/row/panel text at 10 Hz (positions still every frame) */var PFui=globalThis.DreadingPerf&&DreadingPerf.use('ui'),slow=!PFui||this.tick-(this._slowT||-9)>=0.1;if(slow)this._slowT=this.tick;var _sv=this._sv||(this._sv=new pc.Vec3());
 var known=new Set();T.squad.forEach(function(s){if(s.team==='friendly'&&s.alive&&s.memory)s.memory.records.forEach(function(r){if(r.visible)known.add(r.entity);});});
 T.squad.forEach(function(s){var p=s.pos(),show=(s.team==='friendly'||known.has(s))&&!s.controlled&&s.alive;var sc=cam.camera.worldToScreen(_sv.set(p[0],p[1]+2.1,p[2]));
  setCss(s.label,'display',show&&sc.z>0?'block':'none');if(show){setCss(s.label,'left',Math.round(sc.x)+'px');setCss(s.label,'top',Math.round(sc.y)+'px');var hp=Math.max(0,s.health);
   if(slow)setHtml(s.label,'<span style="color:'+s.css+'">'+s.soldierName+'</span>'+(s.arms.reload?' &#8635;':'')+'<div class="hp"><i style="width:'+hp+'%;background:'+(hp>50?'#6fe08f':hp>25?'#e8cf5e':'#ff6a5a')+'"></i></div>');}
  if(s.row){var isSel=sel.indexOf(s)>=0;setCss(s.row,'background',isSel?'#29434e':'transparent');
   if(slow)setHtml(s.row,'<b style="color:'+s.css+'">'+s.soldierName+'</b> '+(s.alive?Math.ceil(s.health)+' HP &middot; '+s.arms.mag+'/'+s.arms.reserve+(s.arms.reload?' reloading':''):'<span style="color:#ff8f7d">KIA</span>')+(s.controlled?' &middot; <b>YOU</b>':'')+'<br><span class="muted">'+s.decision+'</span>');}});
 if(!slow)return;
 var s1=sel[0],ins=document.querySelector('#inspect');if(ins){if(s1){var kn=s1.memory?s1.memory.records.filter(function(r){return r.timeLastSensed>-1e9&&!r.dead&&r.entity.alive;}).map(function(r){return r.entity.soldierName+(r.visible?' (visible)':' (last seen '+(now-r.timeLastSensed).toFixed(0)+' s ago)');}):[];
   setHtml(ins,'<b>'+s1.soldierName+'</b> order: '+(s1.order?s1.order.type+(s1.order.phase?'/'+s1.order.phase:''):'none')+' &middot; '+(s1.inCover?'in cover':'exposed')+' &middot; target '+(s1.target?s1.target.soldierName:'none')+'<br>Knows: '+(kn.join(', ')||'nothing')+'<br>'+TacticalDebugDraw.brainText(s1)+TacticalDebugDraw.coverText(s1,now)+'<br>'+s1.history.slice(-4).join(' &rarr; '));}else setHtml(ins,'Select a soldier (click / drag a box / 1 2 3).');}
 var en=T.squad.filter(function(s){return s.team==='enemy';}),enA=en.filter(function(s){return s.alive;}).length,frA=T.squad.filter(function(s){return s.team==='friendly'&&s.alive;}).length;
 var zst=document.querySelector('#zstat'),ZM=T.zombieMgr;if(zst&&ZM){var za=T.zombies.filter(function(z){return z.alive;}).length;setText(zst,'Zombies '+(ZM.on?'ON':'off')+' - wave '+ZM.wave+' - alive '+za+' - killed '+ZM.stats.kills+' ('+ZM.stats.headshotKills+' headshots)'+(ZM.on&&!T.outcome?' - next wave in '+Math.max(0,ZM.nextWaveT-T.elapsed).toFixed(0)+' s':''));}
 var st=document.querySelector('#status');setText(st,(T.paused?'PAUSED - ':'')+'Squad '+frA+'/'+T.squad.filter(function(s){return s.team==='friendly';}).length+' - Enemy '+enA+'/'+en.length+' - '+T.elapsed.toFixed(0)+' s'+(T.orders&&T.orders.assault?' - assault: '+T.orders.assault.phase:''));
 var ib=document.querySelector('#initiative');if(ib){if(ib.className!==(T.initiative?'on':''))ib.className=T.initiative?'on':'';setText(ib,T.initiative?'Use initiative (I)':'Hold position (I)');}
 var pb=document.querySelector('#pause');setText(pb,T.paused?'Resume (P)':'Pause (P)');
 var ob=document.querySelector('#tl-out');if(ob){setCss(ob,'display',T.outcome?'block':'none');if(T.outcome)setText(ob,T.outcome.text+' ('+T.outcome.time+' s)');}
 var nr=document.querySelector('#navreport');if(nr&&T.report&&T.report.info){var r=T.report;var key=r.time+r.errors.length+r.warnings.length;if(nr.dataset.v!==key){nr.dataset.v=key;
  nr.innerHTML='<b style="color:'+(r.errors.length?'#ff8f7d':'#89ddc2')+'">Navigation #'+(r.info.version||0)+' '+(r.errors.length?r.errors.length+' error(s)':'OK')+'</b> <span class="muted">'+(r.info.navTriangles||0)+' tris, '+r.info.sources+' Editor entities, '+r.info.ms+' ms</span>'+
   r.errors.map(function(e){return '<div class="err">'+e+'</div>';}).join('')+r.warnings.slice(0,4).map(function(w){return '<div class="warn">'+w+'</div>';}).join('');}}
};
/* milestone 4: one-line explanation of the soldier's last auto-cover decision for the inspector */
TacticalDebugDraw.coverText=function(s,now){var w=s.coverWhy;if(!w)return '<span class="muted">Cover: no decision yet</span>';
 var age=(now-w.t).toFixed(0),rj=w.rejected?Object.keys(w.rejected).map(function(k){return k+' '+w.rejected[k];}).join(', '):'';
 var pk=w.picked?' <b>'+w.picked.source+'</b> score '+w.picked.score+' (hidden '+Math.round(w.picked.parts.hidden*100)+'%, fire '+w.picked.parts.fire+(w.threats&&w.threats.zombies?', lanes '+w.picked.parts.lanes+', escapes '+w.picked.parts.escapes+(w.picked.parts.surrounded?', SURROUNDED':''):'')+', '+w.picked.parts.dist+' m)':'';
 return 'Cover ['+age+' s ago]: '+(w.decision||'?')+pk+' - '+(w.text||'')+(rj?'<br><span class="muted">rejected: '+rj+'</span>':'');};

/* M5: current behaviour-tree step of the squad order and why */
TacticalDebugDraw.brainText=function(s){var T=TacticalCommon.ns(s.app),o=T.orders,b=o&&o.brainStep?o.brainStep(s):null,dc=s.doc&&TacticalCommon.AI.on?'<b>Doctrine: '+({selfdef:'self-defence',engage:'engage humans',shelter:'shelter',quiet:'quiet',calm:'calm'}[s.doc.state]||s.doc.state)+'</b> - '+s.doc.why+'<br>':'';if(!b)return dc;
 return dc+'<b>Squad '+b.kind+'</b>: '+b.trail+' <span class="muted">('+b.t+' s)</span><br><span class="muted">why:</span> '+b.why+'<br>';};
