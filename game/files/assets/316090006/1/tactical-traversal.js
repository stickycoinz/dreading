/* Terrain batch (2026-11-16): traversal - drops and window vaults.
   Links: built from the Carentan room graph before every nav rebuild (TacticalNavigationScript._rebuild passes them to Recast as
   off-mesh connections, so Detour routes use them):
     vault  ground-floor window (sill <= 1.3 m, opening >= 1.0 m), inside <-> outside, both ways (soldiers + zombies)
     drop   upper-floor window -> ground outside, one way, drop 2.0..5.2 m (AI); higher windows are player-only (generic drop)
     stair  side of a stair ramp (60% up) -> the floor below, one way
   Agents: TacticalTraversal.begin(agent, link) / step(agent, dt): climb onto the sill (0.35-0.45 s), short hop, ballistic fall
   (g 19 m/s^2, like the FP jump) to the landing point. Landing from > FALL_SAFE m costs (h - FALL_SAFE) * FALL_DMG hp.
   Player (first person): Space while moving into a blocked opening requests a link; the requested traversal
   probes the navmesh below (wall rays stop it going through walls) and drops. No jump / fall / vault clip in the soldier pack:
   the soldier crouches for the climb + landing (clip gap flagged in the report). */
var TacticalTraversal={G:19,FALL_SAFE:4.5,FALL_DMG:20,R:0.9,stats:{links:0,vault:0,drop:0,stair:0,ok:0,used:0,player:0,landings:0,dmg:0}};
TacticalTraversal.collect=function(app){var T=TacticalCommon.ns(app),tw=T.town,out=[],S=TacticalTraversal;if(!tw||!tw.buildings||!tw.carentan||!tw.lay||!tw.lay.spec)return (T.navLinks=out);var hm=tw.lay.spec.hm,bs=tw.buildings;
 var inBuilding=function(x,z,self){return bs.some(function(b){if(b===self||b.state==='collapsed')return false;var r=b.rect;return x>r[0]-0.3&&x<r[2]+0.3&&z>r[1]-0.3&&z<r[3]+0.3;});};
 bs.forEach(function(b){var g=b.graph;if(!g||b.state==='collapsed')return;var rooms={};g.rooms.forEach(function(r){rooms[r.id]=r;});
  g.portals.forEach(function(p){if(p.kind!=='window'||!p.isOpen)return;var rin=rooms[p.rooms[0]];if(!rin)return;var n=p.normal,c=p.center,fy=rin.bounds.min[1],sill=c[1]-p.height/2;
   if(p.height<1.0||p.width<0.7)return;var ix=c[0]-n[0]*0.75,iz=c[2]-n[2]*0.75,ox=c[0]+n[0]*1.1,oz=c[2]+n[2]*1.1,oy=hm.at(ox,oz);if(oy<-0.4||inBuilding(ox,oz,null))return;
   var h=fy-oy,sh=sill-fy;
   if(rin.floor===0){if(sh>1.3||sh<0.3||Math.abs(h)>0.7)return;out.push({kind:'vault',a:[ix,fy,iz],b:[ox,oy,oz],e:[c[0],sill,c[2]],bi:true,b0:b.id});}
   else{if(h<2.0||h>5.2||sh>1.3)return;out.push({kind:'drop',a:[ix,fy,iz],b:[ox,oy,oz],e:[c[0],sill,c[2]],bi:false,b0:b.id});}});
  (g.stairs||[]).forEach(function(st){var lo=st.bottom,hi=st.top,t=0.6,a=[lo[0]+(hi[0]-lo[0])*t,lo[1]+(hi[1]-lo[1])*t,lo[2]+(hi[2]-lo[2])*t],dx=hi[0]-lo[0],dz=hi[2]-lo[2],L=Math.hypot(dx,dz)||1,px=-dz/L,pz=dx/L;
   var cx=(b.rect[0]+b.rect[2])/2,cz=(b.rect[1]+b.rect[3])/2;if((cx-a[0])*px+(cz-a[2])*pz<0){px=-px;pz=-pz;}/* toward the room, away from the wall */
   if(a[1]-lo[1]<1.2)return;out.push({kind:'stair',a:a,b:[a[0]+px*1.25,lo[1],a[2]+pz*1.25],e:[a[0]+px*0.45,a[1],a[2]+pz*0.45],bi:false,b0:b.id});});});
 S.stats.links=out.length;S.stats.vault=out.filter(function(l){return l.kind==='vault';}).length;S.stats.drop=out.filter(function(l){return l.kind==='drop';}).length;S.stats.stair=out.filter(function(l){return l.kind==='stair';}).length;
 return (T.navLinks=out);};
TacticalTraversal.offMesh=function(links){return links.map(function(l,i){return {startPosition:{x:l.a[0],y:l.a[1],z:l.a[2]},endPosition:{x:l.b[0],y:l.b[1],z:l.b[2]},radius:TacticalTraversal.R,bidirectional:!!l.bi,area:0,flags:1,userId:5000+i};});};
/* after a rebuild: which links touch the navmesh at both ends (Detour drops the others silently) */
TacticalTraversal.validate=function(app){var T=TacticalCommon.ns(app),nav=T.navigation,n=0;(T.navLinks||[]).forEach(function(l){var R=TacticalTraversal.R,h={x:R,y:0.5,z:R},qa=nav.nearest(l.a,h),qb=nav.nearest(l.b,h);l.ok=!!(qa&&qb&&Math.hypot(qa[0]-l.a[0],qa[2]-l.a[2])<R&&Math.hypot(qb[0]-l.b[0],qb[2]-l.b[2])<R);if(l.ok)n++;});TacticalTraversal.stats.ok=n;return n;};
/* the route segment p -> q is a link (straight paths put the two link ends next to each other) */
TacticalTraversal.match=function(T,p,q){var L=T.navLinks;if(!L||!L.length||!p||!q)return null;var d=function(a,b){return Math.hypot(a[0]-b[0],a[2]-b[2])<0.7&&Math.abs(a[1]-b[1])<0.9;};
 for(var i=0;i<L.length;i++){var l=L[i];if(d(p,l.a)&&d(q,l.b))return {l:l,rev:false};if(l.bi&&d(p,l.b)&&d(q,l.a))return {l:l,rev:true};}return null;};
TacticalTraversal.begin=function(ag,m,from){var l=m.l||m,rev=!!m.rev,a=from||(rev?l.b:l.a),b=rev?l.a:l.b,e=l.e,top=Math.max(a[1],e[1]+0.08),climb=l.kind==='vault'||(e[1]-a[1]>0.35);
 ag.trav={kind:l.kind,a:a.slice(),e:[e[0],top,e[2]],b:b.slice(),t:0,phase:'climb',dur:climb?(l.kind==='vault'?0.45:0.35):0.15,vy:l.kind==='vault'?2.2:1.2,y0:top,h:top-b[1]};TacticalTraversal.stats.used++;return ag.trav;};
/* returns [x,y,z] for this frame, sets ag.trav.done on landing (with .landH = drop height) */
TacticalTraversal.step=function(ag,dt){var s=ag.trav,G=TacticalTraversal.G;if(!s)return null;s.t+=dt;
 if(s.phase==='climb'){var k=Math.min(1,s.t/s.dur),sk=k*k*(3-2*k);var p=[s.a[0]+(s.e[0]-s.a[0])*sk,s.a[1]+(s.e[1]-s.a[1])*Math.min(1,sk*1.6),s.a[2]+(s.e[2]-s.a[2])*sk];
  if(k>=1){s.phase='air';s.t=0;var dy=s.e[1]-s.b[1],disc=s.vy*s.vy+2*G*Math.max(0,dy);s.tf=Math.max(0.18,(s.vy+Math.sqrt(disc))/G);}return p;}
 var t=Math.min(s.t,s.tf),f=t/s.tf,y=s.e[1]+s.vy*t-0.5*G*t*t;var q=[s.e[0]+(s.b[0]-s.e[0])*f,Math.max(y,s.b[1]),s.e[2]+(s.b[2]-s.e[2])*f];
 if(s.t>=s.tf){s.done=true;s.landH=Math.max(0,s.y0-s.b[1]);q=s.b.slice();TacticalTraversal.stats.landings++;}return q;};
TacticalTraversal.fallDamage=function(h){var S=TacticalTraversal;return h>S.FALL_SAFE?Math.round((h-S.FALL_SAFE)*S.FALL_DMG):0;};
// Normal walking stays on connected surfaces. A slight navmesh correction is
// not a request to vault: require jump intent and an actually blocked move.
TacticalTraversal.playerWantsVault=function(jump,crouch,air,moving,p,q,desired){
 if(!jump||crouch||air>0||!moving||!q)return false;
 var dx=desired[0]-p[0],dz=desired[2]-p[2],len=Math.hypot(dx,dz);
 if(len<0.001)return false;
 var progress=((q[0]-p[0])*dx+(q[2]-p[2])*dz)/len;
 return progress<len*0.25;
};
// When support is removed, fall vertically and accept only a floor actually
// crossed this frame. Never snap sideways or select a different storey early.
TacticalTraversal.playerFall=function(nav,p,state,dt){
 if(state.fallStart===undefined)state.fallStart=p[1];
 state.fallV=(state.fallV||0)-TacticalTraversal.G*dt;
 var y=p[1]+state.fallV*dt,mid=(p[1]+y)*0.5,q=nav.nearest([p[0],mid,p[2]],{x:0.05,y:(p[1]-y)*0.5+0.02,z:0.05});
 if(q&&Math.hypot(q[0]-p[0],q[2]-p[2])<0.025&&q[1]<=p[1]+0.001&&q[1]>=y-0.02){var h=state.fallStart-q[1];state.fallV=0;delete state.fallStart;return {p:[p[0],q[1],p[2]],landed:true,damage:TacticalTraversal.fallDamage(h)};}
 /* 2026-11-21: also land on a floor crossed this frame within 0.5 m sideways (a soldier just off the mesh edge never matched 2.5 cm) */
 var q2=nav.nearest([p[0],mid,p[2]],{x:0.5,y:(p[1]-y)*0.5+0.02,z:0.5});
 if(q2&&q2[1]<=p[1]+0.001&&q2[1]>=y-0.02){var h2=state.fallStart-q2[1];state.fallV=0;delete state.fallStart;return {p:[q2[0],q2[1],q2[2]],landed:true,damage:TacticalTraversal.fallDamage(h2)};}
 return {p:[p[0],y,p[2]],landed:false,damage:0};
};
/* first person: a link start in front of the player, else a generic ledge / open-window drop found on the navmesh below */
TacticalTraversal.playerProbe=function(T,p,gy,dir){var nav=T.navigation,P=T.perception,L=T.navLinks||[],best=null,bd=1.1;
 L.forEach(function(l){[[l.a,l.b,false],l.bi?[l.b,l.a,true]:null].forEach(function(c){if(!c)return;var s=c[0],e=c[1],d=Math.hypot(s[0]-p[0],s[2]-p[2]);if(d>bd||Math.abs(s[1]-gy)>0.8)return;var vx=e[0]-s[0],vz=e[2]-s[2],vl=Math.hypot(vx,vz)||1;if((vx*dir[0]+vz*dir[1])/vl<0.55)return;bd=d;best={l:l,rev:c[2]};});});
 if(best)return best;
 var bl=function(a,b){return P&&P.blocked&&P.blocked(a,b);},ax=p[0]+dir[0]*0.9,az=p[2]+dir[1]*0.9;
 if(bl([p[0],gy+1.35,p[2]],[ax,gy+1.35,az]))return null;/* a wall at chest height */
 var sill=gy;for(var hh=0.25;hh<=1.3;hh+=0.15){if(!bl([p[0],gy+hh,p[2]],[ax,gy+hh,az])){sill=gy+(hh>0.25?hh:0);break;}if(hh+0.15>1.3)return null;}
 for(var k2=0;k2<36;k2++){var dh=0.7+(k2>>1)*0.5,ahead=k2%2?2.1:1.5;if(dh>9)break;var lx=p[0]+dir[0]*ahead,lz=p[2]+dir[1]*ahead,q=nav.nearest([lx,gy-dh,lz],{x:0.45,y:0.3,z:0.45});if(!q)continue;if(q[1]>gy-0.6)continue;
  if(bl([ax,Math.max(sill,gy)+0.4,az],[q[0],q[1]+0.6,q[2]]))continue;
  return {l:{kind:sill>gy+0.2?'drop':'ledge',a:[p[0],gy,p[2]],e:[ax,Math.max(sill,gy),az],b:q,bi:false},rev:false,generic:true};}
 if(sill>gy+0.2){/* ground-floor window: vault onto the same level outside */var q2=nav.nearest([p[0]+dir[0]*1.6,gy,p[2]+dir[1]*1.6],{x:0.45,y:0.6,z:0.45});if(q2&&!bl([ax,sill+0.4,az],[q2[0],q2[1]+0.6,q2[2]]))return {l:{kind:'vault',a:[p[0],gy,p[2]],e:[ax,sill,az],b:q2,bi:false},rev:false,generic:true};}
 return null;};
