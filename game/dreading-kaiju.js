/* Carentan kaiju prototype. Original two-bone IK; opt-in, visual-only, no navmesh rebuilds. */
(function () {
'use strict';
const q = new URLSearchParams(location.search);
if (q.get('kaiju') !== '1' || q.get('townMode') !== 'carentan' || q.has('hordeTest')) return;
const K = window.DreadingKaiju = {ready:false, walking:true, speed:1, time:0, stats:{}};
let app,T,root,body,panel,targetMarker,status;let heading=0,scanAt=0;const hulls=[];K.followMouse=false;K.target=null;
const legs=[],materials=[],up=new pc.Vec3(0,1,0),delta=new pc.Vec3(),rotation=new pc.Quat();
function material(name,color,glow) {
 const m=new pc.StandardMaterial();m.name=name;m.diffuse.set(...color);m.gloss=12;
 if(glow)m.emissive.set(...glow);m.update();materials.push(m);return m;
}
function part(name,type,scale,mat,parent=root) {
 const e=new pc.Entity(name);parent.addChild(e);e.addComponent('render',{type,material:mat,castShadows:false});e.setLocalScale(...scale);return e;
}
function segment(e,a,b,width) {
 delta.sub2(b,a);const length=delta.length();delta.mulScalar(1/Math.max(.001,length));
 rotation.set(delta.z,0,-delta.x,1+delta.y);
 if(rotation.lengthSq()<.000001)rotation.set(1,0,0,0);else rotation.normalize();
 e.setPosition((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);e.setRotation(rotation);e.setLocalScale(width,length,width);
}

// Conservative building envelopes include imported roofs omitted from the combat wall boxes.
function scanBuildings(){
 hulls.length=0;
 for(const b of T.town.buildings){
  if(!b.importedVisual)continue;
  let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity,y=-Infinity;
  for(const r of b.importedVisual.findComponents('render'))for(const mi of r.meshInstances){const a=mi.aabb,c=a.center,h=a.halfExtents;x0=Math.min(x0,c.x-h.x);x1=Math.max(x1,c.x+h.x);z0=Math.min(z0,c.z-h.z);z1=Math.max(z1,c.z+h.z);y=Math.max(y,c.y+h.y);}
  if(Number.isFinite(y))hulls.push({min:[x0,-5,z0],max:[x1,y,z1],id:b.id});
 }
 K.hulls=hulls;
}
function surface(x,z){let y=.12;for(const b of hulls)if(x>=b.min[0]-1&&x<=b.max[0]+1&&z>=b.min[2]-1&&z<=b.max[2]+1)y=Math.max(y,b.max[1]+1.25);return y;}
function intersects(a,b,h,pad=.85){let lo=0,hi=1;for(let i=0;i<3;i++){const av=i===0?a.x:i===1?a.y:a.z,bv=i===0?b.x:i===1?b.y:b.z,d=bv-av,mn=h.min[i]-pad,mx=h.max[i]+pad;if(Math.abs(d)<1e-8){if(av<mn||av>mx)return false;continue;}let t0=(mn-av)/d,t1=(mx-av)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;}return true;}
function clear(a,b){for(const h of hulls)if(intersects(a,b,h))return false;return true;}
function ideal(leg,out){const p=body.getPosition(),x=leg.side*(19+Math.sin(leg.index/3*Math.PI)*5),z=(leg.index-1.5)*11,c=Math.cos(heading),sn=Math.sin(heading);out.set(p.x+x*c+z*sn,0,p.z-x*sn+z*c);out.y=surface(out.x,out.z);return out;}
const axis=new pc.Vec3(),sideAxis=new pc.Vec3(),pole=new pc.Vec3();
function solve(l,hip,foot,out){
 axis.sub2(foot,hip);const d=axis.length();if(d>41.5||d<.01)return false;axis.mulScalar(1/d);
 pole.set(l.side*Math.cos(heading),1.4,-l.side*Math.sin(heading));const dp=pole.dot(axis);pole.set(pole.x-axis.x*dp,pole.y-axis.y*dp,pole.z-axis.z*dp).normalize();sideAxis.cross(axis,pole).normalize();
 const bend=Math.sqrt(Math.max(0,441-d*d/4));
 for(let i=0;i<17;i++){const angle=i===0?0:Math.ceil(i/2)*Math.PI/8*(i%2?1:-1),c=Math.cos(angle),sn=Math.sin(angle);out.set((hip.x+foot.x)/2+(pole.x*c+sideAxis.x*sn)*bend,(hip.y+foot.y)/2+(pole.y*c+sideAxis.y*sn)*bend,(hip.z+foot.z)/2+(pole.z*c+sideAxis.z*sn)*bend);if(clear(hip,out)&&clear(out,foot))return true;}
 return false;
}
function chooseFoot(l){ideal(l,l.to);const x=l.to.x,z=l.to.z;for(const off of [[0,0],[3,0],[-3,0],[0,3],[0,-3],[6,0],[-6,0],[0,6],[0,-6]]){l.to.set(x+off[0],surface(x+off[0],z+off[1]),z+off[1]);if(solve(l,l.socket.getPosition(),l.to,l.testKnee))return true;}return false;}
function mouseMove(e){if(!K.followMouse||T.input.fps||e.target!==app.graphicsDevice.canvas)return;const r=app.graphicsDevice.canvas.getBoundingClientRect(),ray=T.input.ray(e.clientX-r.left,e.clientY-r.top);if(ray.d[1]>=-.001)return;let distance=-ray.o[1]/ray.d[1];for(const h of hulls){const t=(h.max[1]-ray.o[1])/ray.d[1],x=ray.o[0]+ray.d[0]*t,z=ray.o[2]+ray.d[2]*t;if(t>0&&t<distance&&x>=h.min[0]&&x<=h.max[0]&&z>=h.min[2]&&z<=h.max[2])distance=t;}if(distance>0&&distance<600){K.target=[Math.max(-140,Math.min(140,ray.o[0]+ray.d[0]*distance)),Math.max(-140,Math.min(140,ray.o[2]+ray.d[2]*distance))];targetMarker.setPosition(K.target[0],surface(...K.target)+.15,K.target[1]);targetMarker.enabled=true;}}
K.follow=function(on){K.followMouse=on;K.target=null;targetMarker.enabled=false;panel.querySelector('[data-follow]').textContent=on?'Mouse follow: ON':'Mouse follow: OFF';panel.querySelector('[data-follow]').setAttribute('aria-pressed',String(on));if(on){if(T.input.fps)T.input.exitControl('kaiju mouse test');K.walking=true;panel.querySelector('[data-walk]').textContent='Stop walking';}else{K.walking=false;panel.querySelector('[data-walk]').textContent='Walk';}};
K.debugCollision={surface,intersects,clear};
function update(dt) {
 if(!root.enabled)return;
 const began=performance.now();dt=Math.min(dt,.05);
 if(K.walking&&!T.paused)K.time+=dt*K.speed;

 const t=K.time,old=body.getPosition().clone(),oldHeading=heading;
 if(performance.now()>scanAt){scanBuildings();scanAt=performance.now()+1000;}
 let nx=old.x,nz=old.z;
 const active=K.walking&&!T.paused&&!T.input.fps;
 if(active){let dx=0,dz=0;if(K.followMouse&&K.target){dx=K.target[0]-old.x;dz=K.target[1]-old.z;}else if(!K.followMouse){dx=Math.cos(t/22);dz=Math.cos(t/36);}
  const d=Math.hypot(dx,dz);if(d>.8){const amount=Math.min(d,dt*K.speed*2.2);nx+=dx/d*amount;nz+=dz/d*amount;const wanted=Math.atan2(-dx,-dz),diff=Math.atan2(Math.sin(wanted-heading),Math.cos(wanted-heading));heading+=Math.max(-dt*.12,Math.min(dt*.12,diff));}}
 let floor=0;for(const h of hulls)if(nx+17>h.min[0]&&nx-17<h.max[0]&&nz+17>h.min[2]&&nz-17<h.max[2])floor=Math.max(floor,h.max[1]);
 body.setPosition(nx,Math.max(29,floor+9),nz);body.setLocalEulerAngles(0,heading*180/Math.PI,0);
 let stepping=0,blocked=0;for(const l of legs)if(l.step<1)stepping++;
 for(const l of legs){const hip=l.socket.getPosition();
  if(l.step>=1&&active&&stepping<3){ideal(l,l.to);if(l.foot.distance(l.to)>2.2&&chooseFoot(l)){l.from.copy(l.foot);l.step=0;stepping++;}}
  l.candidate.copy(l.foot);
  if(l.step<1&&active){const next=Math.min(1,l.step+dt*K.speed/1.3),f=next*next*(3-2*next);l.candidate.lerp(l.from,l.to,f);l.candidate.y+=Math.sin(next*Math.PI)*Math.max(5,l.to.y-l.from.y+2);
   // Keep the whole foot above the roof envelope during its swing.
   l.candidate.y=Math.max(l.candidate.y,surface(l.candidate.x,l.candidate.z));
   if(solve(l,hip,l.candidate,l.testKnee)){l.step=next;l.foot.copy(l.candidate);}}
  if(!solve(l,hip,l.foot,l.testKnee))blocked++;
 }
 if(blocked){heading=oldHeading;body.setPosition(old);body.setLocalEulerAngles(0,heading*180/Math.PI,0);}
 for(const l of legs){const hip=l.socket.getPosition();if(solve(l,hip,l.foot,l.testKnee)){l.knee.copy(l.testKnee);segment(l.upper,hip,l.knee,1.5);segment(l.lower,l.knee,l.foot,.85);l.joint.setPosition(l.knee);l.toe.setPosition(l.foot);}else if(chooseFoot(l)){l.foot.copy(l.to);l.knee.copy(l.testKnee);segment(l.upper,hip,l.knee,1.5);segment(l.lower,l.knee,l.foot,.85);l.joint.setPosition(l.knee);l.toe.setPosition(l.foot);}}
 K.stats.blocked=blocked;K.stats.roofHulls=hulls.length;status.textContent=blocked?'Blocked by building — steer around it':K.followMouse?'Move your mouse over the map to steer':'Patrol · roof collision enabled';
 K.stats.stepping=stepping;K.stats.updateMs=performance.now()-began;
}
K.focus=function(){if(T.input.fps)T.input.exitControl('kaiju overview');const p=body.getPosition();T.input.lookFrom([p.x,16,p.z],88,38);};
K.destroy=function(){app.off('update',update);window.removeEventListener('pointermove',mouseMove);root.destroy();materials.forEach(m=>m.destroy());panel.remove();K.ready=false;};
function boot() {
 T=window.tactical?.T;app=window.tactical?.app;
 if(!T?.perception?.blockers?.length||!T.input||!T.town?.buildings?.length){setTimeout(boot,250);return;}
 scanBuildings();root=K.root=new pc.Entity('Kaiju spider prototype');app.root.addChild(root);
 const armor=material('Kaiju rough carapace',[.24,.28,.24]),ridge=material('Kaiju armor ridges',[.39,.43,.34]),joint=material('Kaiju joints',[.095,.11,.09]),eyes=material('Kaiju amber eyes',[.7,.19,.025],[1,.22,.025]);
 body=K.body=new pc.Entity('Kaiju body');root.addChild(body);body.setPosition(55,29,-12);
 part('Abdomen','sphere',[15,9,19],armor,body).setLocalPosition(0,1,6);
 part('Thorax','sphere',[11,7,12],armor,body).setLocalPosition(0,0,-5);
 part('Head','sphere',[8,5,6],joint,body).setLocalPosition(0,-.8,-12);
 for(let i=0;i<5;i++){const plate=part('Carapace ridge '+i,'sphere',[14-i*.5,2.5,3],ridge,body);plate.setLocalPosition(0,5,1+i*3);}
 for(const side of [-1,1]) {
  for(let i=0;i<3;i++)part('Eye','sphere',[.7,.7,.45],eyes,body).setLocalPosition(side*(1.1+i*.95),.5+(i===1?.5:0),-14.7);
  const fang=part('Mandible','cone',[1.5,5,1.5],ridge,body);fang.setLocalPosition(side*2,-3,-13);fang.setLocalEulerAngles(160,0,side*18);
  for(let i=0;i<4;i++) {
   const socket=new pc.Entity('Hip');body.addChild(socket);socket.setLocalPosition(side*4,-1,(i-1.5)*5);
   const l={side,index:i,socket,step:1,testKnee:new pc.Vec3(),candidate:new pc.Vec3(),foot:new pc.Vec3(),from:new pc.Vec3(),to:new pc.Vec3(),knee:new pc.Vec3(),direction:new pc.Vec3(),pole:new pc.Vec3()};
   l.upper=part('Upper leg','cylinder',[1,1,1],armor);l.lower=part('Lower leg','cone',[1,1,1],ridge);
   l.joint=part('Knee','sphere',[2.3,2.3,2.3],joint);l.toe=part('Foot','sphere',[1.6,.65,2.3],joint);
   ideal(l,l.foot);if(chooseFoot(l))l.foot.copy(l.to);legs.push(l);
  }
 }
 targetMarker=part('Mouse target','cylinder',[2.5,.12,2.5],eyes);targetMarker.enabled=false;K.legs=legs;window.addEventListener('pointermove',mouseMove);panel=document.createElement('div');panel.style.cssText='position:fixed;right:16px;top:290px;z-index:1000;background:#111d19e8;color:#e0eadf;border:1px solid #78917a;padding:12px;font:13px sans-serif;max-width:230px';
 panel.innerHTML='<b>KAIJU · WALKING PROTOTYPE</b><p style="margin:8px 0">Carentan 1944 · 8 procedural legs</p><button data-focus>View spider</button> <button data-walk>Stop walking</button><button data-follow aria-pressed="false" style="display:block;margin-top:8px">Mouse follow: OFF</button><p data-status style="font-size:12px"></p><label style="display:block;margin-top:9px">Walking speed <input aria-label="Kaiju walking speed" type="range" min="0.25" max="2" step="0.25" value="1" style="width:110px"></label><small>Visual test · boarding and combat not connected</small>';
 status=panel.querySelector('[data-status]');panel.querySelector('[data-follow]').onclick=()=>K.follow(!K.followMouse);panel.querySelector('[data-focus]').onclick=K.focus;
 panel.querySelector('[data-walk]').onclick=e=>{K.walking=!K.walking;e.target.textContent=K.walking?'Stop walking':'Walk';};
 panel.querySelector('input').oninput=e=>K.speed=Number(e.target.value);
 K.stats={legs:8,parts:root.findComponents('render').length};document.body.appendChild(panel);app.on('update',update);update(0);K.ready=true;
 if(q.get('kaijuView')==='1')setTimeout(K.focus,1500);
}
boot();
})();
