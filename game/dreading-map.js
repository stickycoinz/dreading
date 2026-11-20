/* dreading-map.js - DREADING map pipeline M10 (Carentan 1944). Ours, except the vendored simplex-noise block (MIT). */
(function(){
/* ---- third_party: simplex-noise 4.0.3 by Jonas Wagner (2D noise + permutation table, logic unmodified), MIT License - full text in third_party/simplex-noise/LICENSE ---- */
/*
 * A fast javascript implementation of simplex noise by Jonas Wagner

Based on a speed-improved simplex noise algorithm for 2D, 3D and 4D in Java.
Which is based on example code by Stefan Gustavson (stegu@itn.liu.se).
With Optimisations by Peter Eastman (peastman@drizzle.stanford.edu).
Better rank ordering method by Stefan Gustavson in 2012.

 Copyright (c) 2024 Jonas Wagner

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */
var SimplexNoise=(function(){
const SQRT3 = /*#__PURE__*/ Math.sqrt(3.0);
const SQRT5 = /*#__PURE__*/ Math.sqrt(5.0);
const F2 = 0.5 * (SQRT3 - 1.0);
const G2 = (3.0 - SQRT3) / 6.0;
const fastFloor = (x) => Math.floor(x) | 0;
const grad2 = /*#__PURE__*/ new Float64Array([1, 1,
    -1, 1,
    1, -1,
    -1, -1,
    1, 0,
    -1, 0,
    1, 0,
    -1, 0,
    0, 1,
    0, -1,
    0, 1,
    0, -1]);
function createNoise2D(random = Math.random) {
    const perm = buildPermutationTable(random);
    // precalculating this yields a little ~3% performance improvement.
    const permGrad2x = new Float64Array(perm).map(v => grad2[(v % 12) * 2]);
    const permGrad2y = new Float64Array(perm).map(v => grad2[(v % 12) * 2 + 1]);
    return function noise2D(x, y) {
        // if(!isFinite(x) || !isFinite(y)) return 0;
        let n0 = 0; // Noise contributions from the three corners
        let n1 = 0;
        let n2 = 0;
        // Skew the input space to determine which simplex cell we're in
        const s = (x + y) * F2; // Hairy factor for 2D
        const i = fastFloor(x + s);
        const j = fastFloor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t; // Unskew the cell origin back to (x,y) space
        const Y0 = j - t;
        const x0 = x - X0; // The x,y distances from the cell origin
        const y0 = y - Y0;
        // For the 2D case, the simplex shape is an equilateral triangle.
        // Determine which simplex we are in.
        let i1, j1; // Offsets for second (middle) corner of simplex in (i,j) coords
        if (x0 > y0) {
            i1 = 1;
            j1 = 0;
        } // lower triangle, XY order: (0,0)->(1,0)->(1,1)
        else {
            i1 = 0;
            j1 = 1;
        } // upper triangle, YX order: (0,0)->(0,1)->(1,1)
        // A step of (1,0) in (i,j) means a step of (1-c,-c) in (x,y), and
        // a step of (0,1) in (i,j) means a step of (-c,1-c) in (x,y), where
        // c = (3-sqrt(3))/6
        const x1 = x0 - i1 + G2; // Offsets for middle corner in (x,y) unskewed coords
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2; // Offsets for last corner in (x,y) unskewed coords
        const y2 = y0 - 1.0 + 2.0 * G2;
        // Work out the hashed gradient indices of the three simplex corners
        const ii = i & 255;
        const jj = j & 255;
        // Calculate the contribution from the three corners
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            const gi0 = ii + perm[jj];
            const g0x = permGrad2x[gi0];
            const g0y = permGrad2y[gi0];
            t0 *= t0;
            // n0 = t0 * t0 * (grad2[gi0] * x0 + grad2[gi0 + 1] * y0); // (x,y) of grad3 used for 2D gradient
            n0 = t0 * t0 * (g0x * x0 + g0y * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            const gi1 = ii + i1 + perm[jj + j1];
            const g1x = permGrad2x[gi1];
            const g1y = permGrad2y[gi1];
            t1 *= t1;
            // n1 = t1 * t1 * (grad2[gi1] * x1 + grad2[gi1 + 1] * y1);
            n1 = t1 * t1 * (g1x * x1 + g1y * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            const gi2 = ii + 1 + perm[jj + 1];
            const g2x = permGrad2x[gi2];
            const g2y = permGrad2y[gi2];
            t2 *= t2;
            // n2 = t2 * t2 * (grad2[gi2] * x2 + grad2[gi2 + 1] * y2);
            n2 = t2 * t2 * (g2x * x2 + g2y * y2);
        }
        // Add contributions from each corner to get the final noise value.
        // The result is scaled to return values in the interval [-1,1].
        return 70.0 * (n0 + n1 + n2);
    };
}
function buildPermutationTable(random) {
    const tableSize = 512;
    const p = new Uint8Array(tableSize);
    for (let i = 0; i < tableSize / 2; i++) {
        p[i] = i;
    }
    for (let i = 0; i < tableSize / 2 - 1; i++) {
        const r = i + ~~(random() * (256 - i));
        const aux = p[i];
        p[i] = p[r];
        p[r] = aux;
    }
    for (let i = 256; i < tableSize; i++) {
        p[i] = p[i - 256];
    }
    return p;
}
return {createNoise2D:createNoise2D,buildPermutationTable:buildPermutationTable};})();
/* ---- end third_party ---- */
/* ================= DREADING map pipeline (ours) =================
   Terrain builder, Carentan 1944 layout, building generator recipes, loot pass and the acoustic room/portal graph.
   World: x = east, z = south (north = -z), y = up, metres. Playable square [-125,125]. The layout is FIXED (seed 1944);
   only loot containers/contents re-roll per match. Terrain relief: simplex noise (MIT, vendored above) shaped by our
   district/water/causeway rules; buildings are our own box-built shells (tactical-town TG/TW helpers + DM.shell). */
var DM={VERSION:'M10 carentan 2026-11-15',SEED:1944,HALF:125,EXT:150,CELL:2.5,NAVCELL:2.5};
DM.SimplexNoise=SimplexNoise;
DM.rng=function(seed){var s=(seed>>>0)||1;var f=function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
 f.range=function(a,b){return a+(b-a)*f();};f.int=function(a,b){return Math.floor(f.range(a,b+1));};f.pick=function(a){return a[Math.floor(f()*a.length)];};f.chance=function(p){return f()<p;};
 f.shuffle=function(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(f()*(i+1)),t=a[i];a[i]=a[j];a[j]=t;}return a;};return f;};
DM.hash=function(str){var h=0x811c9dc5;for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}return ('00000000'+(h>>>0).toString(16)).slice(-8);};
var sstep=function(a,b,x){var t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
var segDist=function(px,pz,a,b){var dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz,t=l2?Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[1])*dz)/l2)):0;return [Math.hypot(px-a[0]-dx*t,pz-a[1]-dz*t),t];};
var polyDist=function(px,pz,pts){var best=1e9;for(var i=0;i<pts.length-1;i++){var d=segDist(px,pz,pts[i],pts[i+1])[0];if(d<best)best=d;}return best;};
DM.segDist=segDist;DM.polyDist=polyDist;
/* ---------- Carentan layout (approximated from the GSGS 31/18 S.E. sheet description, battlefield studies and today's street pattern):
   Notre-Dame + Place de la Republique in the middle, the N13 causeway coming over the flooded Douve from the north, the port basin
   and canal to the north-east, the Paris-Cherbourg railway and station along the south, the Gloria factory and Carnation dairy on the
   east/south-east edge, villas to the south-west (Rue Holgate / Rue d'Auvers), bocage farms and flooded fields to the west/north. ---------- */
DM.CARENTAN={
 riverZ:function(x){return -101+3*Math.sin(x/23);},riverHalf:6,
 canal:{x:70,half:5,z1:-62},basin:[48,-62,92,-40],
 flooded:[-108,-96,38,-70],
 railZ:60,
 square:[0,2,40,22],
 roads:[
  {id:'N13 causeway',w:7,m:'asphalt',pts:[[-21,-127],[-21,-90],[-19,-62],[-14,-40],[-10,-22]]},
  {id:'Rue Holgate',w:7,m:'asphalt',pts:[[0,9],[-30,16],[-44,24],[-70,36],[-100,42],[-127,44]]},
  {id:'Route de Saint-Lo (east)',w:7,m:'asphalt',pts:[[40,8],[58,-6],[85,-11],[127,-12]]},
  {id:'Rue de la Gare (south)',w:7,m:'asphalt',pts:[[6,22],[10,40],[12,62],[13,80],[12,127]]},
  {id:'Rue du Chateau (north street)',w:6,m:'cobble',pts:[[-48,-30],[-10,-24],[22,-28],[44,-34]]},
  {id:'Rue Sebline (east street)',w:6,m:'cobble',pts:[[44,-34],[44,-8],[46,30],[48,56]]},
  {id:'Rue de l\'Eglise (west street)',w:6,m:'cobble',pts:[[-48,-30],[-47,0],[-44,24]]},
  {id:'Church lane',w:5,m:'cobble',pts:[[22,-28],[22,2]]},
  {id:'Rue d\'Auvers',w:6,m:'asphalt',pts:[[-44,24],[-50,55],[-56,90],[-60,127]]},
  {id:'Suburb loop',w:5,m:'asphalt',pts:[[-70,36],[-84,70],[-56,82]]},
  {id:'Quai (port road)',w:6,m:'cobble',pts:[[40,-36],[96,-36]]},
  {id:'Factory road',w:6,m:'asphalt',pts:[[46,30],[70,40],[100,44],[127,46]]},
  {id:'Station forecourt',w:5,m:'cobble',pts:[[-30,72],[60,72]]},
  {id:'Farm track',w:4,m:'dirt',pts:[[-19,-62],[-50,-64],[-80,-62],[-96,-46]]},
  {id:'Footbridge track',w:4,m:'dirt',pts:[[-96,-46],[-116,-62],[-116,-127]]},
  {id:'Madeleine track',w:4,m:'dirt',pts:[[40,-36],[43,-60],[48,-80]]},
  {id:'Lock road',w:4,m:'dirt',pts:[[48,-80],[104,-80]]}],
 bridges:[{id:'Douve bridge (N13)',x:-21,w:8,deckY:1.0,road:'N13 causeway'},{id:'Douve footbridge',x:-116,w:4,deckY:0.0},{id:'Canal lock bridge',z:-80,w:4,deckY:0.0,canal:true}],
 spawns:{N:{p:[-21,-117],yaw:180},S:{p:[12,117],yaw:0},W:{p:[-117,44],yaw:-90},E:{p:[117,-12],yaw:90}},
 spawnPairs:[['N','S'],['S','N'],['W','E'],['E','W']],
 hotZones:[{id:'church',c:[-5,-8],r:24},{id:'townhall',c:[26,31],r:18},{id:'factory',c:[85,82],r:24},{id:'dairy',c:[90,18],r:18}],
 landmarks:[
  {type:'church',name:'Notre-Dame (central prize)',x:-5,z:-8,yaw:0,w:42,d:14,landmark:true,prize:true},
  {type:'townhall',name:'Mairie (town hall)',x:26,z:31,yaw:180,w:22,d:13,landmark:true},
  {type:'cafe',name:'Cafe du Stade',x:-33,z:5,yaw:-15,w:11,d:10,landmark:true},
  {type:'pharmacy',name:'Pharmacie',x:-59,z:46,yaw:80,w:9,d:9,landmark:true},
  {type:'station',name:'Gare (rail station)',x:33,z:82,yaw:180,w:26,d:11,landmark:true},
  {type:'goodsshed',name:'Goods shed',x:-10,z:84,yaw:180,w:20,d:10},
  {type:'factory',name:'Usine Gloria (factory)',x:85,z:82,yaw:180,w:46,d:26,landmark:true},
  {type:'dairy',name:'Laiterie Carnation (dairy)',x:90,z:18,yaw:180,w:30,d:18,landmark:true},
  {type:'warehouse',name:'Port warehouse A',x:62,z:-24,yaw:180,w:24,d:12,landmark:true},
  {type:'warehouse',name:'Port warehouse B',x:88,z:-24,yaw:180,w:24,d:12},
  {type:'farmhouse',name:'Ferme de la Douve',x:-90,z:-34,yaw:120,w:14,d:9,landmark:true},
  {type:'barn',name:'Douve barn',x:-104,z:-14,yaw:180,w:18,d:11},
  {type:'farmhouse',name:'Ferme La Madeleine',x:96,z:-70,yaw:0,w:13,d:9},
  {type:'barn',name:'Madeleine barn',x:112,z:-82,yaw:90,w:16,d:10}],
 frontages:[{id:'square east',pts:[[42,2],[42,24]],side:1},{id:'square west',pts:[[-2,12],[-2,26]],side:-1}]};
/* ---------- districts ---------- */
DM.district=function(x,z){var C=DM.CARENTAN,dc=Math.hypot((x+2)/1.15,(z-6));
 if(dc<58)return 'center';
 if(x>38&&z<56||x>34&&z>=56)return 'industrial';
 if(z>50&&x>-35)return 'industrial';
 if(z<-62||x<-78&&z<5)return 'countryside';
 if(x<-30)return 'suburbs';
 return 'center';};
/* ---------- base height (before lots flatten their pads) ---------- */
/* inward distance from a water rect edge with rounded corners (radius cr) and a noise-displaced outline (amp m, inward only) */
DM.shoreDist=function(Rc,x,z,cr,n1,n2,amp){var ex=Math.min(x-Rc[0],Rc[2]-x),ez=Math.min(z-Rc[1],Rc[3]-z),e=Math.min(ex,ez),qx=Math.max(0,cr-ex),qz=Math.max(0,cr-ez);if(qx>0&&qz>0)e=cr-Math.hypot(qx,qz);
 return e-amp*(0.55+0.45*n1(x/13+7.3,z/13-2.1))-amp*0.3*n2(x/4.5+1.7,z/4.5);};
DM.makeHeight=function(){var C=DM.CARENTAN,R=DM.rng(DM.SEED*31+7),n1=SimplexNoise.createNoise2D(R),n2=SimplexNoise.createNoise2D(R);
 var road=function(id){return C.roads.find(function(r){return r.id===id;});},cw=road('N13 causeway').pts;
 var fbm=function(x,z){return n1(x/70,z/70)*0.6+n2(x/23,z/23)*0.3+n1(x/9+40,z/9-20)*0.1;};
 var h=function(x,z){var d=DM.district(x,z),amp=d==='center'?0.06:d==='suburbs'?0.18:d==='industrial'?0.08:0.28,y=fbm(x,z)*amp;
  // high ground to the south-west (inside: gentle; outside the playable square it climbs)
  y+=1.3*sstep(40,125,-x)*sstep(40,125,z);var out=Math.max(Math.abs(x),Math.abs(z))-DM.HALF;if(out>0)y+=Math.min(6,out*0.18)*(0.6+0.4*sstep(-150,150,z-x));
  // marsh north of the town (Douve valley) + deep flooded fields
  var marsh=sstep(-55,-70,z);if(marsh>0)y=y*(1-marsh)+(-0.18+fbm(x,z)*0.08)*marsh;
  var F=C.flooded;if(x>F[0]&&x<F[2]&&z>F[1]&&z<F[3]){var e=DM.shoreDist(F,x,z,8,n1,n2,3.5),k=sstep(0,5,e);y=y*(1-k)+(-0.3+fbm(x,z)*0.05)*k;}/* terrain batch: noise-displaced, rounded edge (was a 4 m ramp along a straight rect) */
  // railway embankment
  var dr=Math.abs(z-C.railZ);if(dr<7)y=Math.max(y,0.45*(1-sstep(3.5,7,dr)));
  // causeway (N13 north of the town): raised 1.0 m over the marsh
  var dcw=polyDist(x,z,cw);if(z<-50&&dcw<9){var k2=(1-sstep(4.2,8.5,dcw))*sstep(-48,-60,z);y=y*(1-k2)+1.0*k2;}
  // water: river, canal, basin (beds at -1.8/-2.0)
  var rz=C.riverZ(x),drv=Math.abs(z-rz);if(drv<C.riverHalf+3.5){var kb=1-sstep(C.riverHalf,C.riverHalf+3.5,drv);y=y*(1-kb)+(-1.8)*kb;}
  if(z<C.canal.z1+1&&z>rz-2){var dcx=Math.abs(x-C.canal.x);if(dcx<C.canal.half+2.5){var kc=1-sstep(C.canal.half,C.canal.half+2.5,dcx);y=y*(1-kc)+(-1.8)*kc;}}
  var B=C.basin;if(x>B[0]&&x<B[2]&&z>B[1]&&z<B[3]){/* terrain batch: natural shore - rounded, noise-displaced outline (inside the old rect only) and a bank sloping in over ~5 m; the canal mouth stays open */
   var eb=DM.shoreDist(B,x,z,7,n1,n2,2.6);var kcm=(1-sstep(C.canal.half,C.canal.half+3,Math.abs(x-C.canal.x)))*(1-sstep(B[1]+4,B[1]+10,z));if(kcm>0)eb=Math.max(eb,9*kcm);/* T10: below -0.45 m only (so nav carve, spawn/site checks and the town layout are bit-identical) a second, irregular drop-off of up to
   0.4 m wanders 3-12 m out from the shore and the bed undulates: the edge seen through the water no longer runs straight along the quay */
   var kq=sstep(0.2,5.5,eb),yo=y*(1-kq)+(-2.0)*kq,yv=yo-0.4*sstep(3.0,9.0,eb+3.0*n1(x/17-11,z/17+5))*(0.45+0.55*(0.5+0.5*n2(x/6.5+3,z/6.5-8))),wv=sstep(-0.45,-1.7,yo);y=yo*(1-wv)+yv*wv;}
  return y;};
 return h;};
/* ---------- OBB helpers (lots) ---------- */
DM.corners=function(x,z,w,d,yaw){var a=yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(function(p){return [x+p[0]*c+p[1]*s,z-p[0]*s+p[1]*c];});};
DM.toWorld=function(b,lx,lz){var a=b.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [b.x+lx*c+lz*s,b.z-lx*s+lz*c];};
DM.toLocal=function(b,wx,wz){var a=b.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=wx-b.x,dz=wz-b.z;return [dx*c-dz*s,dx*s+dz*c];};
DM.satOverlap=function(A,B){var polys=[A,B];for(var p=0;p<2;p++){var P=polys[p];for(var i=0;i<4;i++){var a=P[i],b=P[(i+1)%4],nx=b[1]-a[1],nz=a[0]-b[0];
   var mn1=1e9,mx1=-1e9,mn2=1e9,mx2=-1e9;A.forEach(function(q){var v=q[0]*nx+q[1]*nz;mn1=Math.min(mn1,v);mx1=Math.max(mx1,v);});B.forEach(function(q){var v=q[0]*nx+q[1]*nz;mn2=Math.min(mn2,v);mx2=Math.max(mx2,v);});
   if(mx1<mn2||mx2<mn1)return false;}}return true;};
DM.aabb=function(cs){var r=[1e9,1e9,-1e9,-1e9];cs.forEach(function(p){r[0]=Math.min(r[0],p[0]);r[1]=Math.min(r[1],p[1]);r[2]=Math.max(r[2],p[0]);r[3]=Math.max(r[3],p[1]);});return r;};
/* ---------- the fixed layout ---------- */
DM.carentanSpec=function(){if(DM._spec)return DM._spec;var C=DM.CARENTAN,R=DM.rng(DM.SEED),h=DM.makeHeight(),lots=[],rej={};
 var roadClear=function(cs,pad){// every corner/edge sample away from every road
  for(var i=0;i<4;i++){var a=cs[i],b=cs[(i+1)%4];for(var t=0;t<=1.001;t+=0.25){var x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;for(var r=0;r<C.roads.length;r++){if(polyDist(x,z,C.roads[r].pts)<C.roads[r].w/2+pad)return false;}}}
  var cx=(cs[0][0]+cs[2][0])/2,cz=(cs[0][1]+cs[2][1])/2;for(var r2=0;r2<C.roads.length;r2++)if(polyDist(cx,cz,C.roads[r2].pts)<C.roads[r2].w/2+pad)return false;return true;};
 var groundOk=function(cs){var r=DM.aabb(cs);for(var x=r[0];x<=r[2]+0.01;x+=(r[2]-r[0])/4)for(var z=r[1];z<=r[3]+0.01;z+=(r[3]-r[1])/4){var y=h(x,z);if(y<-0.35||y>0.5)return false;}return r[0]>-DM.HALF+3&&r[2]<DM.HALF-3&&r[1]>-DM.HALF+3&&r[3]<DM.HALF-3;};
 var keep=[];Object.keys(C.spawns).forEach(function(k){var p=C.spawns[k].p;keep.push(DM.corners(p[0],p[1],26,26,0));});keep.push(DM.corners((C.square[0]+C.square[2])/2,(C.square[1]+C.square[3])/2,C.square[2]-C.square[0],C.square[3]-C.square[1],0));
 keep.push(DM.corners(0,C.railZ,260,9.5,0));
 var free=function(cs,gap){if(keep.some(function(k){return DM.satOverlap(cs,k);}))return 'keep-out';var g=gap||0;
  for(var i=0;i<lots.length;i++){var L=lots[i],cs2=g?DM.corners(L.x,L.z,L.w+g,L.d+g,L.yaw):L.cs;if(DM.satOverlap(cs,cs2))return 'lot';}return null;};
 var add=function(o,force){var cs=DM.corners(o.x,o.z,o.w,o.d,o.yaw);if(!force){if(!groundOk(cs)){rej.ground=(rej.ground||0)+1;return null;}if(!roadClear(cs,0.8)){rej.road=(rej.road||0)+1;return null;}var f=free(cs,o.gap);if(f){rej[f]=(rej[f]||0)+1;return null;}}
  o.cs=cs;o.rect=DM.aabb(cs);o.id=lots.length;o.district=o.district||DM.district(o.x,o.z);o.seed=((DM.SEED*73856093)^(o.id*19349663)^(Math.round(o.x*7)*83492791)^Math.round(o.z*13))>>>0;lots.push(o);return o;};
 C.landmarks.forEach(function(l){var o={};for(var k in l)o[k]=l[k];var r=add(o,false);if(!r){o.forced=true;add(o,true);}});
 // frontage fill: walk each road (and the square frontages), both sides, front facing the road
 var lines=C.roads.map(function(r){return {id:r.id,pts:r.pts,w:r.w,sides:[-1,1]};}).concat(C.frontages.map(function(f){return {id:f.id,pts:f.pts,w:0,sides:[f.side]};}));
 var pickType=function(dist,x,z){if(dist==='center')return R.chance(0.22)?'shop':'terrace';if(dist==='suburbs')return R.chance(0.8)?'villa':'terrace';if(dist==='industrial')return R.chance(0.6)?'workshop':'terrace';return R.chance(0.5)?'cottage':null;};
 var dims=function(t){if(t==='terrace')return {w:R.range(8.4,9.8),d:R.range(10,11.5),gap:0.3};if(t==='shop')return {w:R.range(8.4,10.5),d:R.range(10.5,12),gap:0.3};if(t==='villa')return {w:R.range(15,17),d:R.range(16,18),gap:2};
  if(t==='workshop')return {w:R.range(12,15),d:R.range(10,12),gap:2.5};if(t==='cottage')return {w:R.range(9,10.5),d:R.range(8.5,9.5),gap:4};return {w:8,d:10,gap:1};};
 lines.forEach(function(ln){ln.sides.forEach(function(sd){var P=ln.pts;for(var i=0;i<P.length-1;i++){var a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/L,uz=(b[1]-a[1])/L,nx=-uz*sd,nz=ux*sd;
   var t=4;while(t<L-4){var mx=a[0]+ux*t,mz=a[1]+uz*t,dist=DM.district(mx+nx*10,mz+nz*10),type=pickType(dist,mx,mz);if(!type){t+=12;continue;}var dm=dims(type),off=ln.w/2+(type==='villa'?1.0:type==='workshop'?3:1.6)+dm.d/2;
    var o={type:type,x:mx+nx*off,z:mz+nz*off,w:dm.w,d:dm.d,gap:dm.gap,yaw:Math.atan2(-nx,-nz)*180/Math.PI};o.x=+o.x.toFixed(2);o.z=+o.z.toFixed(2);o.yaw=+o.yaw.toFixed(1);o.w=+o.w.toFixed(2);o.d=+o.d.toFixed(2);
    var r=add(o,false);t+=r?dm.w+(type==='terrace'||type==='shop'?0.35:dm.gap+R.range(0.5,4)):2;}}});});
 // cars (trunks are loot spots), trees, hedgerows: static site props
 var site={cars:[],trees:[],hedges:[],sandbags:[],walls:[]},C2=C;
 var siteFree=function(x,z,r){if(lots.some(function(L){return x>L.rect[0]-r&&x<L.rect[2]+r&&z>L.rect[1]-r&&z<L.rect[3]+r;}))return false;var y=h(x,z);if(y<-0.4)return false;return Math.max(Math.abs(x),Math.abs(z))<DM.HALF-2;};
 var onRoad=function(x,z,pad){return C.roads.some(function(r){return polyDist(x,z,r.pts)<r.w/2+pad;});};
 C.roads.forEach(function(r){if(r.m==='dirt')return;var P=r.pts;for(var i=0;i<P.length-1;i++){var a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/L,uz=(b[1]-a[1])/L;
  for(var t=10;t<L-6;t+=R.range(22,40)){if(!R.chance(0.45))continue;var sd=R.chance(0.5)?1:-1,off=r.w/2-1.1,x=a[0]+ux*t-uz*sd*off,z=a[1]+uz*t+ux*sd*off;if(!siteFree(x,z,1.5))continue;
   if(Object.keys(C.spawns).some(function(k){var p=C.spawns[k].p;return Math.hypot(p[0]-x,p[1]-z)<16;}))continue;if(site.cars.some(function(c){return Math.hypot(c.x-x,c.z-z)<9;}))continue;
   site.cars.push({x:+x.toFixed(2),z:+z.toFixed(2),yaw:+(Math.atan2(ux,uz)*180/Math.PI+R.range(-12,12)+(R.chance(0.5)?180:0)).toFixed(1),burnt:R.chance(0.4)});}}});
 for(var ti=0;ti<420&&site.trees.length<110;ti++){var x=R.range(-122,122),z=R.range(-122,122),dist=DM.district(x,z);if(dist==='center'&&!(x>C.square[0]&&x<C.square[2]&&z>C.square[1]&&z<C.square[3]))continue;if(dist==='industrial'&&R.chance(0.7))continue;
  if(!siteFree(x,z,2.5)||onRoad(x,z,2.5)||Math.abs(z-C.railZ)<7)continue;if(Object.keys(C.spawns).some(function(k){var p=C.spawns[k].p;return Math.hypot(p[0]-x,p[1]-z)<12;}))continue;if(site.trees.some(function(t){return Math.hypot(t.x-x,t.z-z)<5;}))continue;
  site.trees.push({x:+x.toFixed(2),z:+z.toFixed(2),s:+R.range(0.8,1.3).toFixed(2)});}
 // bocage: hedgerow field grid in the countryside and the far south-west, 4 m runs with field gates
 var hedgeLine=function(a,b){var L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.floor(L/4),gate=R.int(1,Math.max(1,n-2));for(var i=0;i<n;i++){if(Math.abs(i-gate)<1)continue;var x0=a[0]+(b[0]-a[0])*i/n,z0=a[1]+(b[1]-a[1])*i/n,x1=a[0]+(b[0]-a[0])*(i+1)/n,z1=a[1]+(b[1]-a[1])*(i+1)/n,mx=(x0+x1)/2,mz=(z0+z1)/2;
   if(!siteFree(mx,mz,3.5)||!siteFree(x0,z0,3.5)||!siteFree(x1,z1,3.5)||onRoad(mx,mz,2)||onRoad(x0,z0,1.5)||onRoad(x1,z1,1.5)||Math.abs(mz-C.railZ)<8)continue;if(Object.keys(C.spawns).some(function(k){var p=C.spawns[k].p;return Math.hypot(p[0]-mx,p[1]-mz)<14;}))continue;var y=h(mx,mz);
   site.hedges.push({a:[+x0.toFixed(2),+z0.toFixed(2)],b:[+x1.toFixed(2),+z1.toFixed(2)],deep:y<-0.45});}};
 [[-124,-66,-72,-6,34,30],[-124,92,-62,124,30,16],[40,-98,66,-62,13,18],[-124,-124,124,-104,40,20]].forEach(function(f){for(var x=f[0];x<=f[2]+0.1;x+=f[4]){hedgeLine([x+R.range(-2,2),f[1]],[x+R.range(-2,2),f[3]]);}for(var z=f[1];z<=f[3]+0.1;z+=f[5]){hedgeLine([f[0],z+R.range(-2,2)],[f[2],z+R.range(-2,2)]);}});
 var F=C.flooded;for(var fx=F[0]+18;fx<F[2];fx+=26)hedgeLine([fx,F[1]+2],[fx,F[3]-2]);
 // sandbag positions guarding the prize and the square
 [[-24,4,90],[12,4,0],[30,-4,0],[-30,-20,90],[20,18,0],[4,26,0]].forEach(function(s){if(!onRoad(s[0],s[1],0)&&siteFree(s[0],s[1],1))site.sandbags.push({x:s[0],z:s[1],yaw:s[2]});else site.sandbags.push({x:s[0],z:s[1],yaw:s[2],onRoad:true});});
 var spec={name:'Carentan 1944',seed:DM.SEED,half:DM.HALF,ext:DM.EXT,lots:lots,site:site,rejected:rej,height:h,C:C};
 spec.hashInput=JSON.stringify({lots:lots.map(function(l){return [l.type,l.x,l.z,l.yaw,l.w,l.d];}),cars:site.cars,trees:site.trees.length,hedges:site.hedges.length,roads:C.roads.map(function(r){return r.pts;})});
 DM._spec=spec;return spec;};
/* ---------- final heightmap grid (pads flattened under lots, roads graded) ---------- */
DM.heightmap=function(spec){if(spec.hm)return spec.hm;var E=DM.EXT,c=DM.CELL,n=Math.round(2*E/c)+1,H=new Float32Array(n*n),h=spec.height,C=spec.C;
 for(var j=0;j<n;j++)for(var i=0;i<n;i++){var x=-E+i*c,z=-E+j*c,y=h(x,z);
  // roads: flat (crest of the causeway / embankment kept), lots: pad at 0 (terrain just below the slab)
  for(var r=0;r<C.roads.length;r++){var rd=C.roads[r],d=polyDist(x,z,rd.pts);if(d<rd.w/2+2.5){var k=1-sstep(rd.w/2,rd.w/2+2.5,d),ty=y>0.6?y:Math.max(-0.05,Math.min(0.05,y));if(y>-0.45)y=y*(1-k)+ty*k;}}
  spec.lots.forEach(function(L){if(x>L.rect[0]-1.2&&x<L.rect[2]+1.2&&z>L.rect[1]-1.2&&z<L.rect[3]+1.2){var lp=DM.toLocal(L,x,z);if(Math.abs(lp[0])<L.w/2+1.2&&Math.abs(lp[1])<L.d/2+1.2)y=Math.min(y,-0.02)*0+ -0.02;}});
  H[j*n+i]=y;}
 spec.hm={n:n,cell:c,origin:-E,heights:H,at:function(x,z){var fi=(x+E)/c,fj=(z+E)/c,i0=Math.max(0,Math.min(n-2,Math.floor(fi))),j0=Math.max(0,Math.min(n-2,Math.floor(fj))),u=fi-i0,v=fj-j0;
   return H[j0*n+i0]*(1-u)*(1-v)+H[j0*n+i0+1]*u*(1-v)+H[(j0+1)*n+i0]*(1-u)*v+H[(j0+1)*n+i0+1]*u*v;}};
 var q=[];for(var k2=0;k2<H.length;k2+=7)q.push(Math.round(H[k2]*100));spec.mapHash=DM.hash(spec.hashInput+'|'+q.join(','));return spec.hm;};
/* ================= building generator (ours) =================
   Night-Rooms-style modular planning, rewritten for runtime JS (no Blender code reused): each shell is planned into rooms
   (stair hall + front rooms, open halls, office bays, church gallery), interior partitions get doorway sockets
   (STANDARD 1.5 m - the Recast agent radius 0.45 m needs >=1.5 m gaps, same as town.rs MIN_DOOR_GAP - WIDE 3 m arches), furniture keeps ~1.2 m lanes clear and stays off doors/stairs, loot spots sit
   against walls. Walls / windows / slabs / stair ramps / roofs come from TG.shell (our port of town.rs), so every piece
   keeps the tactical:* tag contract (walkable / obstacle / coverLow / coverTall / stair / door) and the
   intact -> breached -> collapsed damage code. */
DM.ACOUSTIC={brick:'brick',plaster:'plaster',concrete:'concrete',metal:'metal',stone:'stone',wood:'wood',rust:'metal',floor:'concrete',roof:'concrete',tile:'wood'};
DM.doorOk=function(b,cx,cz,w,d,side,at){var spec=DM._spec,n=side==='f'?[0,1]:side==='b'?[0,-1]:side==='r'?[1,0]:[-1,0],c=side==='f'||side==='b'?[cx+at*w/2,cz+n[1]*d/2]:[cx+n[0]*w/2,cz+at*d/2],t=[-n[1],n[0]];
 for(var s=-1;s<=1;s++){var lx=c[0]+n[0]*2.8+t[0]*s*0.8,lz=c[1]+n[1]*2.8+t[1]*s*0.8;
  // inside our own lot but outside this shell is fine (yards); other lots are not
  var wp=DM.toWorld(b,lx,lz);if(Math.max(Math.abs(wp[0]),Math.abs(wp[1]))>DM.HALF-2)return false;
  if(spec){if(spec.height(wp[0],wp[1])<-0.4)return false;for(var i=0;i<spec.lots.length;i++){var L=spec.lots[i];if(L===b||L.id===b.id)continue;var q=DM.toLocal(L,wp[0],wp[1]);if(Math.abs(q[0])<L.w/2+0.2&&Math.abs(q[1])<L.d/2+0.2)return false;}}}
 return true;};
/* one shell: TG.shell geometry + our room plan. o: TG.shell options + plan + kind + furn ('house'|'shop'|'office'|'industrial'|'church'|'farm') */
DM.mk=function(L,R,b,o){var TG=DM.TG,w=o.w,d=o.d,cx=o.x||0,cz=o.z||0;
 var doors=(o.doors||[]).filter(function(dr){return dr.internal||dr.must||DM.doorOk(b,cx,cz,w,d,dr.side,dr.at);});
 if(!doors.length)doors=[(o.doors&&o.doors[0])||{side:'f',at:0,w:1.4}];
 var opt={};for(var k in o)opt[k]=o[k];opt.doors=doors;opt.partition=false;opt.props=false;if(opt.stairW==null)opt.stairW=1.65;var Hs=o.H||3.2;if(opt.stairL==null)opt.stairL=Math.max(4.6,Hs*1.62);if(opt.stairX0==null)opt.stairX0=Math.max(1.25,Math.min(1.9,(o.w-0.6)-opt.stairL-1.11));/* wide ramps + a >=1.6 m landing strip at the x0 end */
 var sh=TG.shell(L,R,opt);sh.plan=o.plan||'hall';sh.furn=o.furn||'house';sh.kind=o.kind||b.type;sh.internalDoors=doors.filter(function(dr){return dr.internal;}).length;
 sh.innerMat=o.innerMat||'plaster';sh.floorMat=o.floorMat||(sh.furn==='industrial'?'concrete':'wood');sh.ceilMat=o.ceilMat||'plaster';sh.roofPitched=!!o.pitched;
 DM.plan(L,R,sh,o);return sh;};
DM.plan=function(L,R,sh,o){var TG=DM.TG,T=0.3,base=0.12,H=sh.H,n=sh.storeys,ft=function(k){return base+k*H;};
 var xi0=sh.min[0]+T,xi1=sh.max[0]-T,zi0=sh.min[1]+T,zi1=sh.max[1]-T,L0=sh.L0||Math.max(4.6,H*1.6),x0=sh.x0!=null?sh.x0:xi0+1.25,SZ=sh.stairs?[xi0,zi0,x0+L0+1.6,sh.stairZ||zi0+3.2]:null;
 var plan=sh.plan,rooms=[],walls=[],idoors=[],D=zi1-zi0,W=xi1-xi0;
 var exDoors=sh.doors.map(function(dd){return {c:dd.center,n:dd.normal,w:dd.width};});
 var nearExDoor=function(axis,v,tol){return exDoors.some(function(dd){return axis==='x'?(Math.abs(dd.n[1])>0.5&&Math.abs(dd.c[0]-v)<tol):(Math.abs(dd.n[0])>0.5&&Math.abs(dd.c[1]-v)<tol);});};
 // ---- split the interior footprint (same layout on every floor so stairs and walls line up) ----
 var cells=[];
 if(plan==='open'||W<3.4||D<3.4)cells.push({r:[xi0,zi0,xi1,zi1],row:0});
 else if(plan==='office'){var xs=xi1-Math.min(4.6,W*0.32);if(nearExDoor('x',xs,1.3))xs-=1.4;cells.push({r:[xi0,zi0,xs,zi1],row:0});cells.push({r:[xs,zi0,xi1,zi1],row:0,office:true});walls.push({axis:'z',at:xs,from:zi0,to:zi1,a:0,b:1,door:true});}
 else{var bd=sh.stairs?SZ[3]-zi0+1.4:Math.min(3.2,D*0.42),two=D-bd>=3.2&&(plan==='hall'||sh.stairs);if(two&&nearExDoor('z',zi0+bd,1.3))bd+=1.4;two=two&&D-bd>=3.0;
  var zh=two?zi0+bd:zi0;
  if(two){cells.push({r:[xi0,zi0,xi1,zh],row:0,hall:true});}
  // front row split along x into 3.6-6 m rooms (never inside the stair zone when there is no hall)
  var cuts=[],seg=Math.max(1,Math.round(W/R.range(4.0,5.6)));for(var i=1;i<seg;i++){var xc=xi0+W*i/seg+R.range(-0.5,0.5);if(nearExDoor('x',xc,1.4))continue;if(!two&&SZ&&xc<SZ[2]+0.3)continue;if(xc-(cuts.length?cuts[cuts.length-1]:xi0)<3.0||xi1-xc<3.0)continue;cuts.push(xc);}
  var xs0=[xi0].concat(cuts,[xi1]),first=cells.length;
  for(var j=0;j<xs0.length-1;j++){cells.push({r:[xs0[j],zh,xs0[j+1],zi1],row:1});}
  for(var j2=0;j2<cuts.length;j2++){walls.push({axis:'z',at:cuts[j2],from:zh,to:zi1,a:first+j2,b:first+j2+1,door:!two||R()<0.55});}
  if(two)walls.push({axis:'x',at:zh,from:xi0,to:xi1,a:0,multi:cells.slice(first).map(function(c,ix){return first+ix;})});}
 // ---- per floor: partitions with doorway sockets, rooms, furniture, loot spots ----
 var loot=[],furn=sh.furn;
 for(var k=0;k<n;k++){var y0=k===0?base:ft(k),y1=ft(k+1)-0.25,fy=k===0?base:ft(k),tagW=k===0?'coverTall':'obstacle',fl=[];
  cells.forEach(function(c,ci){rooms.push({shell:sh.id,k:k,rect:c.r.slice(),hall:!!c.hall,office:!!c.office,cell:ci,stairs:!!(SZ&&c.r[0]<SZ[2]&&c.r[2]>SZ[0]&&c.r[1]<SZ[3]&&c.r[3]>SZ[1]&&n>1),y0:fy,y1:y1+0.25,furniture:0});});
  var rbase=rooms.length-cells.length;
  walls.forEach(function(wl){var gaps=[];
   if(wl.multi){wl.multi.forEach(function(ci){var r=cells[ci].r,lo=r[0]+0.95,hi=r[2]-0.95;if(hi<lo)return;var at=R.range(lo,hi);gaps.push([at-0.75,at+0.75,ci]);});}
   else if(wl.door){var lo2=wl.from+0.95,hi2=wl.to-0.95;var at2=R.range(lo2,Math.max(lo2,hi2));gaps.push([at2-0.75,at2+0.75,wl.b]);}
   var from=wl.from;gaps.sort(function(a,b){return a[0]-b[0];});
   var put=function(u0,u1){if(u1-u0<0.15)return;if(wl.axis==='x')TG.box(L,u0,y0,wl.at-0.1,u1,y1,wl.at+0.1,sh.innerMat,tagW,{role:'partition',shell:sh.id,k:k});else TG.box(L,wl.at-0.1,y0,u0,wl.at+0.1,y1,u1,sh.innerMat,tagW,{role:'partition',shell:sh.id,k:k});};
   gaps.forEach(function(g){put(from,g[0]);from=g[1];var mid=(g[0]+g[1])/2;
    if(y0+2.2<y1-0.05){if(wl.axis==='x')TG.box(L,g[0],y0+2.2,wl.at-0.1,g[1],y1,wl.at+0.1,sh.innerMat,null,{role:'ilintel',shell:sh.id,k:k});else TG.box(L,wl.at-0.1,y0+2.2,g[0],wl.at+0.1,y1,g[1],sh.innerMat,null,{role:'ilintel',shell:sh.id,k:k});}
    var a=wl.multi?wl.a:wl.a,bb=g[2];idoors.push({k:k,a:rbase+a,b:rbase+bb,c:wl.axis==='x'?[mid,wl.at]:[wl.at,mid],n:wl.axis==='x'?[0,1]:[1,0],w:g[1]-g[0],h:2.2,y:fy});});
   put(from,wl.to);});
  // furniture + loot spots against walls (lanes clear: away from doors, stair zone, windows only for low pieces)
  var doorsHere=idoors.filter(function(dd){return dd.k===k;}).map(function(dd){return dd.c;}).concat(k===0?exDoors.map(function(dd){return dd.c;}):[]);
  for(var ri=rbase;ri<rooms.length;ri++){var rm=rooms[ri],r=rm.rect,area=(r[2]-r[0])*(r[3]-r[1]),slots=[];
   [[0,r[1],1],[1,r[2],-1],[2,r[3],-1],[3,r[0],1]].forEach(function(sd){var horiz=sd[0]===0||sd[0]===2,a0=horiz?r[0]:r[1],a1=horiz?r[2]:r[3];for(var u=a0+0.9;u<=a1-0.9;u+=1.15){var px=horiz?u:sd[1],pz=horiz?sd[1]:u;
     if(doorsHere.some(function(dc){return Math.hypot(dc[0]-px,dc[1]-pz)<1.7;}))continue;if(SZ&&px>SZ[0]-0.6&&px<SZ[2]+0.6&&pz<SZ[3]+0.6)continue;
     var inward=horiz?[0,sd[2]]:[sd[2],0];slots.push({x:px,z:pz,n:inward,side:sd[0]});}});
   R.shuffle(slots);var used=[],take=function(min){for(var si=0;si<slots.length;si++){var s=slots[si];if(used.some(function(q){return Math.hypot(q.x-s.x,q.z-s.z)<min;}))continue;used.push(s);slots.splice(si,1);return s;}return null;};
   var nf=Math.max(0,Math.min(furn==='industrial'?6:4,Math.round(area/(furn==='industrial'?22:13)))),nl=area<5?0:Math.min(furn==='industrial'?5:3,1+Math.floor(area/26));
   if(rm.stairs||(SZ&&rm.hall)){nf=0;slots=slots.filter(function(s){return s.x>SZ[2]+0.8;});}/* stair halls stay clear: landings + the corridor past the ramps */
   if(furn==='church')nf=0;
   for(var fi=0;fi<nf;fi++){var s=take(1.7);if(!s)break;var kinds=furn==='industrial'?['machine','shelf','crates','bench']:furn==='office'?['desk','filing','shelf']:furn==='shop'?['counter','shelf','crates']:furn==='farm'?['crates','bench','shelf']:['wardrobe','dresser','bed','table'],kd=R.pick(kinds);
    var dims={machine:[1.6,1.0,1.3,'metal'],shelf:[2.0,0.55,2.0,'metal'],crates:[1.2,1.1,1.5,'wood'],bench:[1.8,0.8,0.9,'wood'],desk:[1.4,0.75,0.78,'wood'],filing:[0.9,0.55,1.35,'metal'],counter:[2.2,0.7,1.0,'wood'],wardrobe:[1.1,0.6,1.9,'wood'],dresser:[1.2,0.5,0.95,'wood'],bed:[1.95,0.95,0.55,'wood'],table:[1.4,0.85,0.78,'wood']}[kd];
    if(dims[0]>((s.side===0||s.side===2)?(r[2]-r[0]):(r[3]-r[1]))-1.6)continue;var along=s.side===0||s.side===2,hx=(along?dims[0]:dims[1])/2,hz=(along?dims[1]:dims[0])/2,cxp=s.x+s.n[0]*(dims[1]/2+0.02),czp=s.z+s.n[1]*(dims[1]/2+0.02);
    TG.box(L,cxp-hx,fy,czp-hz,cxp+hx,fy+dims[2],czp+hz,dims[3],k===0?(dims[2]>=1.4?'coverTall':'coverLow'):'obstacle',{role:'prop',shell:sh.id,k:k,furn:kd});rm.furniture++;}
   for(var li=0;li<nl;li++){var s2=take(1.4);if(!s2)break;var lk=furn==='industrial'?R.pick(['locker','crate','crate']):furn==='office'?R.pick(['locker','cabinet']):furn==='farm'?R.pick(['crate','cabinet']):furn==='church'?'crate':R.pick(['cabinet','cabinet','locker']);
    loot.push({shell:sh.id,k:k,room:ri,x:+(s2.x+s2.n[0]*0.3).toFixed(3),z:+(s2.z+s2.n[1]*0.3).toFixed(3),y:fy,yaw:Math.atan2(s2.n[0],s2.n[1])*180/Math.PI,kind:lk});}}}
 sh.rooms=rooms;sh.idoors=idoors;sh.loot=loot;sh.SZ=SZ;sh.L0=L0;sh.x0=x0;sh.zi=[zi0,zi1];sh.xi=[xi0,xi1];return sh;};
/* church gallery: a walkable loft over the west end of the nave, ramp up from the nave floor, rail + pillars */
DM.gallery=function(L,R,sh,len,G){var TG=DM.TG,xi0=sh.min[0]+0.3,zi0=sh.min[1]+0.3,zi1=sh.max[1]-0.3,gx1=xi0+len,Lr=Math.max(4.6,G*1.6),lane=zi0+0.9,steps=Math.round(G/0.19),a=gx1-1.0;
 TG.box(L,xi0,G-0.25,zi0+1.8,gx1,G,zi1,'wood','walkable',{role:'slab',shell:sh.id,k:1});TG.box(L,xi0,G-0.25,zi0,a,G,zi0+1.8,'wood','walkable',{role:'slab',shell:sh.id,k:1});
 L.push({p:[a+Lr/2,G/2+0.06,lane],s:[1.65,G-0.12,Lr],r:[0,-90,0],m:'stone',tag:'stair',vis:false,role:'ramp',shell:sh.id,k:0});
 for(var si=0;si<steps;si++){var t0=si/steps,t1=(si+1)/steps;TG.box(L,a+Lr*(1-t1),0.12,lane-0.825,a+Lr*(1-t0),0.12+(G-0.12)*t1,lane+0.825,'stone',null,{role:'tread',shell:sh.id,k:0});}
 TG.box(L,a,0.12,lane-0.8,a+Lr*0.5,1.0,lane+0.8,'stone','obstacle',{role:'underStair',shell:sh.id,k:0,vis:false,noSight:true});
 TG.box(L,gx1-0.05,G,zi0+1.8,gx1+0.05,G+1.0,zi1,'wood','obstacle',{role:'rail',shell:sh.id,k:1,noSight:true});
 for(var z=zi0+3.2;z<zi1-0.5;z+=3.4)TG.box(L,gx1-0.25,0.12,z-0.25,gx1+0.25,G-0.25,z+0.25,'stone','coverTall',{role:'pillar',shell:sh.id,k:0});
 return {x0:xi0,x1:gx1,z0:zi0,z1:zi1,y:G,lane:lane,Lr:Lr,a:a};};
/* ---------- recipes (lot-local, +z = front/road) ---------- */
DM.recipes={
 terrace:function(L,R,b){var n=R()<0.45?3:2,mat=R.pick(['brick','plaster','plaster','stone']);return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:n,H:3.1,mat:mat,baseMat:mat==='plaster'&&R()<0.5?'stone':null,pitched:R()<0.55,plan:'hall',furn:'house',
  doors:[{side:'f',at:R.range(-0.45,0.45),w:1.3,must:true},{side:'b',at:R.range(0.35,0.7),w:1.1}]})];},
 shop:function(L,R,b){var n=b.w>=8.3?2:1;return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:n,H:3.3,mat:R.pick(['plaster','brick']),baseMat:'wood',pitched:false,plan:'hall',furn:'shop',winW:1.7,groundSill:0.45,
  doors:[{side:'f',at:R.range(-0.2,0.2),w:1.5,must:true},{side:'b',at:0.55,w:1.1}]})];},
 villa:function(L,R,b){var hw=Math.min(10.5,b.w-4.5),hd=Math.min(9.5,b.d-6),z=b.d/2-2.6-hd/2,sh=DM.mk(L,R,b,{id:0,z:z,w:hw,d:hd,storeys:2,H:3.0,mat:R.pick(['plaster','stone','brick']),pitched:true,plan:'hall',furn:'house',
  doors:[{side:'f',at:R.range(-0.3,0.3),w:1.3,must:true},{side:'b',at:0.55,w:1.1},{side:R()<0.5?'l':'r',at:0.6,w:1.0}]});
  TG_lowWall(L,b,1.0,R.pick(['stone','hedge','brick']),[{side:'f',at:sh.doors[0]?(sh.doors[0].center[0]/(b.w/2-0.3)):0,w:3.2},{side:'b',at:R.range(-0.5,0.5),w:2.2},{side:'l',at:0.2,w:2.2},{side:'r',at:-0.2,w:2.2}]);
  return [sh];},
 cottage:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:b.w>=8.4?2:1,H:2.9,mat:'stone',pitched:true,plan:'hall',furn:'farm',doors:[{side:'f',at:R.range(-0.3,0.3),w:1.2,must:true},{side:'b',at:0.5,w:1.0}]})];},
 workshop:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:1,H:4.6,mat:R.pick(['brick','metal']),plan:'office',furn:'industrial',winEvery:3.4,sill:1.5,
  doors:[{side:'f',at:-0.25,w:3.0,must:true},{side:'r',at:0.3,w:1.2},{side:'b',at:0.4,w:1.2}]})];},
 church:function(L,R,b){var sh=[];
  sh.push(DM.mk(L,R,b,{id:0,x:-16.5,z:0,w:9,d:9,storeys:4,H:3.3,mat:'stone',plan:'open',furn:'church',kind:'church tower',winEvery:3.0,winW:0.8,sill:1.0,
   doors:[{side:'f',at:0,w:1.6,must:true},{side:'r',at:0.25,w:1.6,internal:true}]}));
  var nave=DM.mk(L,R,b,{id:1,x:1,z:0,w:26,d:14,storeys:1,H:9.0,mat:'stone',plan:'open',furn:'church',kind:'church nave',pitched:true,winEvery:3.6,winW:1.3,sill:2.6,groundSill:2.6,winTop:6.8,floorMat:'stone',ceilMat:'wood',
   doors:[{side:'f',at:0.25,w:2.6,must:true},{side:'b',at:-0.6,w:1.6},{side:'l',at:0.157,w:1.6,internal:true},{side:'r',at:0,w:3.0,internal:true}]});
  var g=DM.gallery(L,R,nave,10,4.72);nave.gallery=g;nave.rooms.push({shell:1,k:1,rect:[g.x0,g.z0,g.x1,g.z1],hall:false,office:false,cell:0,stairs:true,y0:g.y,y1:9.12,furniture:0,gallery:true});
  // pews (low cover) in two blocks with a centre aisle, altar rail
  for(var px=g.x1+Lpad(g);px<12.2;px+=1.25){[[-4.8,-1.0],[1.0,5.0]].forEach(function(zz){DM.TG.box(L,px-0.25,0.12,zz[0],px+0.25,0.95,zz[1],'wood','coverLow',{role:'prop',shell:1,k:0,furn:'pew'});});}
  nave.upperY=g.y;nave.galleryStoreys=true;sh.push(nave);
  var apse=DM.mk(L,R,b,{id:2,x:17.5,z:0,w:7,d:9,storeys:1,H:6.0,mat:'stone',plan:'open',furn:'church',kind:'church apse',pitched:true,winEvery:2.6,winW:0.9,sill:2.2,groundSill:2.2,winTop:5.2,floorMat:'stone',ceilMat:'stone',
   doors:[{side:'l',at:0,w:3.0,internal:true},{side:'b',at:0.4,w:1.2}]});
  DM.TG.box(L,18.5,0.12,-1.4,19.6,1.1,1.4,'stone','coverLow',{role:'prop',shell:2,k:0,furn:'altar'});sh.push(apse);
  // spire on the tower
  DM.TG.tilted(L,[-16.5,0.12+4*3.3+3.2,0],[5.2,6.4,5.2],[0,45,0],'roof',null,{role:'spire',shell:0,k:4});
  return sh;},
 townhall:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:3,H:3.4,mat:'plaster',baseMat:'stone',plan:'hall',furn:'office',winEvery:2.4,winW:1.2,
  doors:[{side:'f',at:0,w:2.4,must:true},{side:'b',at:0.55,w:1.4},{side:'r',at:0.45,w:1.2}]})];},
 cafe:function(L,R,b){var sh=DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:2,H:3.2,mat:'plaster',baseMat:'wood',plan:'hall',furn:'shop',winW:2.0,groundSill:0.5,
  doors:[{side:'f',at:-0.35,w:1.5,must:true},{side:'b',at:0.5,w:1.1},{side:'l',at:0.4,w:1.1}]});return [sh];},
 pharmacy:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:2,H:3.2,mat:'stone',plan:'hall',furn:'shop',winW:1.6,groundSill:0.5,doors:[{side:'f',at:0.3,w:1.4,must:true},{side:'b',at:0.5,w:1.0}]})];},
 station:function(L,R,b){var hall=DM.mk(L,R,b,{id:0,x:-5,z:0,w:16,d:b.d,storeys:1,H:5.2,mat:'brick',plan:'open',furn:'office',winEvery:3.2,winW:1.6,sill:1.0,winTop:3.6,
   doors:[{side:'f',at:0,w:2.6,must:true},{side:'b',at:0,w:2.6},{side:'r',at:0.2,w:1.4,internal:true}]});
  var off=DM.mk(L,R,b,{id:1,x:8,z:0,w:10,d:b.d,storeys:2,H:3.2,mat:'brick',plan:'hall',furn:'office',doors:[{side:'l',at:0.2,w:1.4,internal:true},{side:'f',at:0.45,w:1.2}]});
  DM.TG.box(L,-13,3.0,b.d/2,3,3.2,b.d/2+3,'metal','obstacle',{role:'canopy'});return [hall,off];},
 goodsshed:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:1,H:5.5,mat:'wood',plan:'open',furn:'industrial',winEvery:4,sill:1.6,doors:[{side:'f',at:-0.3,w:3.2,must:true},{side:'f',at:0.4,w:3.2},{side:'l',at:0,w:2.4}]})];},
 factory:function(L,R,b){var hall=DM.mk(L,R,b,{id:0,x:-5,z:-1,w:36,d:20,storeys:1,H:7.0,mat:'brick',plan:'office',furn:'industrial',winEvery:3.0,winW:1.6,sill:2.0,winTop:5.4,
   doors:[{side:'f',at:-0.4,w:3.6,must:true},{side:'f',at:0.35,w:1.4},{side:'l',at:0,w:3.6},{side:'b',at:-0.3,w:1.4},{side:'r',at:-0.3,w:1.4,internal:true}]});
  var off=DM.mk(L,R,b,{id:1,x:18,z:-5.2,w:10,d:10,storeys:2,H:3.3,mat:'brick',plan:'hall',furn:'office',doors:[{side:'l',at:0.24,w:1.4,internal:true},{side:'f',at:0.2,w:1.3}]});
  DM.TG.box(L,19,0,7,21.4,22,9.4,'brick','coverTall',{role:'tower'});
  [3,6].forEach(function(tz){DM.TG.box(L,13.6,0,tz,15.8,2.4,tz+2.2,'rust','coverTall',{role:'tank'});});
  return [hall,off];},
 dairy:function(L,R,b){var hall=DM.mk(L,R,b,{id:0,x:-4.5,z:0,w:21,d:16,storeys:1,H:6.0,mat:'concrete',plan:'open',furn:'industrial',winEvery:3.2,sill:1.8,winTop:4.8,
   doors:[{side:'f',at:-0.3,w:3.4,must:true},{side:'b',at:0.3,w:1.4},{side:'r',at:0.1,w:1.4,internal:true}]});
  var off=DM.mk(L,R,b,{id:1,x:10.5,z:0,w:9,d:10,storeys:2,H:3.2,mat:'brick',plan:'open',furn:'office',doors:[{side:'l',at:0.16,w:1.4,internal:true},{side:'f',at:0,w:1.2}]});
  for(var i=0;i<3;i++){var tx=-14+i*4;DM.TG.box(L,tx,0,-8.9,tx+3,4.5,-8.1,'metal','coverTall',{role:'tank'});}
  return [hall,off];},
 warehouse:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:1,H:6.0,mat:R.pick(['brick','metal']),plan:'office',furn:'industrial',winEvery:4,sill:2.2,winTop:4.6,
  doors:[{side:'f',at:-0.4,w:3.4,must:true},{side:'f',at:0.4,w:3.4},{side:'b',at:0,w:1.4},{side:'l',at:0,w:1.4}]})];},
 farmhouse:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:2,H:3.0,mat:'stone',pitched:true,plan:'hall',furn:'farm',doors:[{side:'f',at:-0.2,w:1.3,must:true},{side:'b',at:0.5,w:1.1},{side:'r',at:0.4,w:1.1}]})];},
 barn:function(L,R,b){return [DM.mk(L,R,b,{id:0,w:b.w,d:b.d,storeys:1,H:6.0,mat:'wood',pitched:true,plan:'open',furn:'farm',winEvery:5,sill:1.8,doors:[{side:'l',at:0,w:3.6,must:true},{side:'r',at:0,w:3.6},{side:'f',at:0.3,w:1.4}]})];}};
var Lpad=function(g){return 1.6;};
var TG_lowWall=function(L,b,h,mat,gates){DM.TG.lowWall(L,b,h,mat,gates);};
DM.LANDMARK_TYPES=['church','townhall','cafe','pharmacy','station','factory','dairy','warehouse','farmhouse'];
/* ================= acoustic room/portal graph (DREADING_SOUND_PROPAGATION_HANDOFF.md section 6, version 1) =================
   One graph per building, world coordinates (metres), built from the intact pieces; breached/collapsed states add
   'breach' portals / mark portals broken and fire app 'portal:changed' {portalId,isOpen,openFraction,broken}. */
DM.MATERIALS={
 concrete:{absorption:0.02,absorptionBands:[0.01,0.02,0.03],transmissionLossDb:38,transmissionCutoffHz:350,footstepSet:'concrete',impactSet:'concrete'},
 brick:{absorption:0.03,absorptionBands:[0.02,0.03,0.05],transmissionLossDb:32,transmissionCutoffHz:450,footstepSet:'concrete',impactSet:'brick'},
 stone:{absorption:0.02,absorptionBands:[0.01,0.02,0.04],transmissionLossDb:40,transmissionCutoffHz:320,footstepSet:'concrete',impactSet:'stone'},
 wood:{absorption:0.10,absorptionBands:[0.15,0.10,0.07],transmissionLossDb:18,transmissionCutoffHz:900,footstepSet:'wood',impactSet:'wood'},
 plaster:{absorption:0.05,absorptionBands:[0.08,0.05,0.04],transmissionLossDb:22,transmissionCutoffHz:700,footstepSet:'wood',impactSet:'plaster'},
 metal:{absorption:0.04,absorptionBands:[0.05,0.04,0.03],transmissionLossDb:26,transmissionCutoffHz:600,footstepSet:'metal',impactSet:'metal'},
 glass:{absorption:0.04,absorptionBands:[0.10,0.04,0.02],transmissionLossDb:16,transmissionCutoffHz:1500,footstepSet:'glass',impactSet:'glass'},
 open_air:{absorption:1.0,transmissionLossDb:0,transmissionCutoffHz:20000}};
var r3=function(v){return Math.round(v*1000)/1000;};
DM.roomGraph=function(b,P){var shells=P.shells,L=P.pieces,pad=b.padY||0,bid='B'+b.id,W=function(lx,ly,lz){var p=DM.toWorld(b,lx,lz);return [r3(p[0]),r3(pad+ly),r3(p[1])];},WN=function(nx,nz){var a=b.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [r3(nx*c+nz*s),0,r3(-nx*s+nz*c)];};
 var rooms=[],portals=[],stairs=[],ri=0,pi=0,localRooms=[];
 var outside={id:bid+'_Outside',floor:0,isOutdoor:true,bounds:null,volume:0,surfaceArea:0,materials:{walls:'open_air',floor:'concrete',ceiling:'open_air'},roomType:'outdoor',furnishing:0,hearing:{ambientNoiseDb:35,investigatePoints:[]}};
 shells.forEach(function(sh){(sh.rooms||[]).forEach(function(rm,i){var r=rm.rect,h=Math.max(1.8,rm.y1-rm.y0);
   if(sh.gallery&&rm.k===0)h=Math.max(h,sh.galleryStoreys?9.0-0.12:h);
   var id=bid+'_F'+rm.k+'_R'+(ri++),cs=[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]].map(function(c){return W(c[0],rm.y0,c[1]);}),mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
   cs.forEach(function(c){mn[0]=Math.min(mn[0],c[0]);mn[2]=Math.min(mn[2],c[2]);mx[0]=Math.max(mx[0],c[0]);mx[2]=Math.max(mx[2],c[2]);});mn[1]=r3(pad+rm.y0);mx[1]=r3(pad+rm.y0+h);
   var w=r[2]-r[0],d=r[3]-r[1],area=w*d,vol=area*h,surf=2*area+2*(w+d)*h,minD=Math.min(w,d),wallM=DM.ACOUSTIC[sh.mat]||'plaster';
   var type=sh.gallery&&rm.k===0?'large_hall':rm.stairs&&area<34?'stairwell':(minD<2.6&&Math.max(w,d)/minD>2.4)||(rm.hall&&!rm.stairs&&minD<3.4)?'corridor':vol<28?'tiny':vol<95?'small_room':vol<320?'medium_room':'large_hall';
   var floorM=rm.k===0?(sh.floorMat==='stone'?'stone':'concrete'):(DM.ACOUSTIC[sh.floorMat]||'wood'),ceilM=rm.k===sh.storeys-1||sh.gallery?(sh.roofPitched?'wood':(DM.ACOUSTIC[sh.ceilMat]||'concrete')):'plaster';
   var furn=Math.min(1,+(rm.furniture*1.6/Math.max(4,area)+(sh.furn==='church'?0.35:0.05)).toFixed(2));
   var room={id:id,floor:rm.k,isOutdoor:false,bounds:{min:mn,max:mx},polygon:cs.map(function(c){return [c[0],c[2]];}),centroid:W((r[0]+r[2])/2,rm.y0,(r[1]+r[3])/2),volume:r3(vol),surfaceArea:r3(surf),ceilingHeight:r3(h),
    materials:{walls:wallM,floor:floorM,ceiling:ceilM},furnishing:furn,roomType:type,wallNeighbors:[],hearing:{ambientNoiseDb:20,investigatePoints:[]}};
   var A=function(m){return (DM.MATERIALS[m]||DM.MATERIALS.plaster).absorption;},sab=2*(w+d)*h*A(wallM)+area*A(floorM)+area*A(ceilM)+area*0.35*furn;room.rt60=r3(Math.min(6,0.161*vol/Math.max(0.5,sab)));
   rooms.push(room);localRooms.push({room:room,sh:sh,rm:rm});rm.graphId=id;});});
 var find=function(sh,k,lx,lz){var best=null;localRooms.forEach(function(q){if(q.rm.k!==k)return;var r=q.rm.rect;if(q.sh!==sh&&sh)return;if(lx>=r[0]-0.35&&lx<=r[2]+0.35&&lz>=r[1]-0.35&&lz<=r[3]+0.35)best=best||q;});return best;};
 var findAny=function(k,lx,lz){var best=null;localRooms.forEach(function(q){if(q.rm.k!==k||best)return;var r=q.rm.rect;if(lx>=r[0]-0.35&&lx<=r[2]+0.35&&lz>=r[1]-0.35&&lz<=r[3]+0.35)best=q;});return best;};
 var addPortal=function(kind,a,bR,lc,ly,ln,wd,ht,extra){var id=bid+'_P'+(pi++),p={id:id,kind:kind,rooms:[a.id,bR.id],center:W(lc[0],ly,lc[1]),normal:ln?WN(ln[0],ln[1]):[0,1,0],width:r3(wd),height:r3(ht),isOpen:true,openFraction:1,panelMaterial:null,breakable:false,lockable:false,entityId:bid+':'+kind+':'+pi};
  if(extra)for(var k in extra)p[k]=extra[k];portals.push(p);
  return p;};
 // exterior / inter-shell doors (TG door data), merged when two shells face each other
 var exd=[];shells.forEach(function(sh){sh.doors.forEach(function(dd){exd.push({sh:sh,dd:dd});});});
 var usedD=new Set();
 exd.forEach(function(e,i){if(usedD.has(i))return;var dd=e.dd,inPt=[dd.center[0]-dd.normal[0]*0.6,dd.center[1]-dd.normal[1]*0.6],rin=find(e.sh,0,inPt[0],inPt[1]);if(!rin)rin=findAny(0,inPt[0],inPt[1]);if(!rin)return;
  var mate=-1;exd.forEach(function(f,j){if(j===i||usedD.has(j)||f.sh===e.sh)return;if(Math.hypot(f.dd.center[0]-dd.center[0],f.dd.center[1]-dd.center[1])<1.0)mate=j;});
  var wide=dd.width>=2.5,other=outside,kind=wide?'double_door':'door',panel='wood';
  if(mate>=0){usedD.add(mate);var f=exd[mate],ip=[f.dd.center[0]-f.dd.normal[0]*0.6,f.dd.center[1]-f.dd.normal[1]*0.6],ro=find(f.sh,0,ip[0],ip[1]);if(ro){other=ro.room;if(dd.width>=2.9){kind='arch';panel=null;}}}
  usedD.add(i);addPortal(kind,rin.room,other,dd.center,0.12+(dd.h||2.3)/2,dd.normal,dd.width,dd.h||2.3,{panelMaterial:panel,breakable:panel!==null,lockable:false,exterior:other===outside});});
 // interior doorways (partition sockets: open frames, no leaf)
 shells.forEach(function(sh){(sh.idoors||[]).forEach(function(dd){var ra=localRooms.find(function(q){return q.sh===sh&&q.rm===sh.rooms[dd.a];}),rb=localRooms.find(function(q){return q.sh===sh&&q.rm===sh.rooms[dd.b];});if(!ra||!rb)return;
  addPortal('door',ra.room,rb.room,dd.c,dd.y+1.1,dd.n,dd.w,dd.h,{panelMaterial:null,breakable:false});});});
 // windows: contiguous sill runs in the wall pieces (open holes: shootable/see-through, no glass left)
 var EN=[[0,-1],[1,0],[0,1],[-1,0]],sills=L.filter(function(p){return p.role==='sill';}).sort(function(a,c){return a.shell-c.shell||a.edge-c.edge||a.k-c.k||a.a0-c.a0;}),runs=[];
 sills.forEach(function(p){var last=runs[runs.length-1];if(last&&last.shell===p.shell&&last.edge===p.edge&&last.k===p.k&&Math.abs(last.a1-p.a0)<0.03){last.a1=p.a1;last.ps.push(p);}else runs.push({shell:p.shell,edge:p.edge,k:p.k,a0:p.a0,a1:p.a1,ps:[p],top:p.y1});});
 runs.forEach(function(w){var sh=shells.find(function(s){return s.id===w.shell;});if(!sh)return;var cx=0,cz=0,tot=0;w.ps.forEach(function(p){var l=p.a1-p.a0;cx+=p.p[0]*l;cz+=p.p[2]*l;tot+=l;});cx/=tot;cz/=tot;
  var n=EN[w.edge],lint=L.find(function(p){return p.role==='lintel'&&p.shell===w.shell&&p.edge===w.edge&&p.k===w.k&&p.a0<w.a1&&p.a1>w.a0;}),y0=w.ps[0].y1,y1=lint?lint.y0:y0+1.3;
  var rin=find(sh,w.k,cx-n[0]*0.6,cz-n[1]*0.6);if(!rin)return;
  if(sh.gallery&&w.k===0&&y0>3){var g=sh.gallery;if(cx<g.x1){var rg=localRooms.find(function(q){return q.sh===sh&&q.rm.k===1;});if(rg)rin=rg;}}
  addPortal('window',rin.room,outside,[cx,cz],(y0+y1)/2,n,tot,y1-y0,{panelMaterial:null,breakable:false,glassless:true});});
 // stairs (TG ramps along the back wall; church gallery ramp)
 shells.forEach(function(sh){if(sh.stairs){for(var k=0;k<sh.storeys-1;k++){var lane=sh.lanes?sh.lanes[k%2]:sh.zi[0]+(k%2===0?0.7:2.15),up=k%2===0,xa=sh.x0,xb=sh.x0+sh.L0,ya=0.12+k*sh.H,yb=0.12+(k+1)*sh.H,
     lo=find(sh,k,(xa+xb)/2,lane),hi=find(sh,k+1,up?xb+0.8:xa-0.3,lane);if(!lo||!hi)continue;
     var p=addPortal('stair',lo.room,hi.room,[(xa+xb)/2,lane],(ya+yb)/2,null,sh.laneW||1.3,sh.H,{panelMaterial:null});
     stairs.push({id:bid+'_ST'+stairs.length,portalId:p.id,fromFloor:k,toFloor:k+1,bottom:W(up?xa:xb,ya,lane),top:W(up?xb:xa,yb,lane),stairwellRoomId:lo.room.id,material:sh.mat==='stone'?'stone':'concrete'});}}
  if(sh.gallery){var g=sh.gallery,lo2=localRooms.find(function(q){return q.sh===sh&&q.rm.k===0;}),hi2=localRooms.find(function(q){return q.sh===sh&&q.rm.k===1;});if(lo2&&hi2){
    var p2=addPortal('stair',lo2.room,hi2.room,[g.a+g.Lr/2,g.lane],(0.12+g.y)/2,null,1.65,g.y,{panelMaterial:null});
    stairs.push({id:bid+'_ST'+stairs.length,portalId:p2.id,fromFloor:0,toFloor:1,bottom:W(g.a+g.Lr,0.12,g.lane),top:W(g.a,g.y,g.lane),stairwellRoomId:lo2.room.id,material:'stone'});
    addPortal('arch',lo2.room,hi2.room,[g.x1,(g.z0+g.z1)/2],g.y+1.5,[1,0],g.z1-g.z0,3.0,{panelMaterial:null,note:'open gallery edge'});}}});
 // wall neighbours: partitions (same floor, touching rects) and floor/ceiling overlaps
 localRooms.forEach(function(A){localRooms.forEach(function(B){if(A===B)return;var a=A.rm.rect,c=B.rm.rect;
   if(A.rm.k===B.rm.k&&A.sh===B.sh){var ox=Math.min(a[2],c[2])-Math.max(a[0],c[0]),oz=Math.min(a[3],c[3])-Math.max(a[1],c[1]);var shared=0;if(Math.abs(ox)<0.05&&oz>0.3)shared=oz;else if(Math.abs(oz)<0.05&&ox>0.3)shared=ox;
    if(shared>0)A.room.wallNeighbors.push({roomId:B.room.id,material:DM.ACOUSTIC[A.sh.innerMat]||'plaster',sharedArea:r3(shared*A.room.ceilingHeight)});}
   else if(A.sh===B.sh&&Math.abs(A.rm.k-B.rm.k)===1){var ox2=Math.min(a[2],c[2])-Math.max(a[0],c[0]),oz2=Math.min(a[3],c[3])-Math.max(a[1],c[1]);if(ox2>0.3&&oz2>0.3)A.room.wallNeighbors.push({roomId:B.room.id,material:A.sh.furn==='industrial'?'concrete':'wood',sharedArea:r3(ox2*oz2),isFloorCeiling:true});}
   else if(A.sh!==B.sh&&A.rm.k===B.rm.k){/* adjoining shells (church tower/nave/apse, station hall/office): shared outer walls */var ox3=Math.min(a[2],c[2])-Math.max(a[0],c[0]),oz3=Math.min(a[3],c[3])-Math.max(a[1],c[1]);if(ox3>-0.7&&ox3<0&&oz3>0.5)A.room.wallNeighbors.push({roomId:B.room.id,material:DM.ACOUSTIC[A.sh.mat]||'brick',sharedArea:r3(oz3*Math.min(A.room.ceilingHeight,B.room.ceilingHeight))});else if(oz3>-0.7&&oz3<0&&ox3>0.5)A.room.wallNeighbors.push({roomId:B.room.id,material:DM.ACOUSTIC[A.sh.mat]||'brick',sharedArea:r3(ox3*Math.min(A.room.ceilingHeight,B.room.ceilingHeight))});}});});
 // hearing: investigate points 1 m inside each portal (+ the room centre), enclosure from open portal area
 rooms.forEach(function(rm){var pts=[[rm.centroid[0],rm.bounds.min[1]+0.1,rm.centroid[2]]],open=0;portals.forEach(function(p){var ix=p.rooms.indexOf(rm.id);if(ix<0)return;if(p.isOpen)open+=p.width*p.height*p.openFraction;if(p.kind==='stair'||p.kind==='window')return;
   var n=p.normal,sg=ix===0?1:-1,q=[r3(p.center[0]-n[0]*sg),r3(rm.bounds.min[1]+0.1),r3(p.center[2]-n[2]*sg)];// rooms[0] lies behind the normal
   if(q[0]>=rm.bounds.min[0]-0.5&&q[0]<=rm.bounds.max[0]+0.5&&q[2]>=rm.bounds.min[2]-0.5&&q[2]<=rm.bounds.max[2]+0.5)pts.push(q);});
  rm.hearing.investigatePoints=pts;rm.enclosure=r3(Math.max(0,Math.min(1,1-open/Math.max(1,rm.surfaceArea)*4)));});
 // outside: around the lot
 var R0=b.rect;outside.bounds={min:[r3(R0[0]-30),r3(pad-2),r3(R0[1]-30)],max:[r3(R0[2]+30),r3(pad+40),r3(R0[3]+30)]};outside.volume=r3((R0[2]-R0[0]+60)*(R0[3]-R0[1]+60)*42);outside.surfaceArea=r3((R0[2]-R0[0]+60)*(R0[3]-R0[1]+60));
 outside.centroid=[r3(b.x),r3(pad),r3(b.z)];outside.ceilingHeight=40;outside.wallNeighbors=[];
 portals.forEach(function(p){if(p.rooms[1]===outside.id&&p.kind!=='window')outside.hearing.investigatePoints.push([r3(p.center[0]+p.normal[0]*1.0),r3(pad+0.1),r3(p.center[2]+p.normal[2]*1.0)]);});
 rooms.push(outside);
 var used={};rooms.forEach(function(r){used[r.materials.walls]=1;used[r.materials.floor]=1;used[r.materials.ceiling]=1;r.wallNeighbors&&r.wallNeighbors.forEach(function(n){used[n.material]=1;});});portals.forEach(function(p){if(p.panelMaterial)used[p.panelMaterial]=1;});stairs.forEach(function(s){used[s.material]=1;});used.glass=1;used.open_air=1;
 var mats={};Object.keys(used).forEach(function(k){if(DM.MATERIALS[k])mats[k]=DM.MATERIALS[k];});
 return {version:1,units:'meters',buildingId:bid,name:b.name||b.type,type:b.type,landmark:!!b.landmark,floorHeight:r3(shells[0]?shells[0].H:3.1),materials:mats,rooms:rooms,portals:portals,stairs:stairs,state:'intact'};};
/* damage: wall pieces removed by TG.breach become 'breach' portals; collapsed = every portal broken open */
DM.damageGraph=function(b,g,intact,now,state){var changed=[];if(!g)return changed;var bid='B'+b.id;
 g.portals=g.portals.filter(function(p){if(p.kind==='breach'){changed.push({portalId:p.id,isOpen:false,openFraction:0,broken:false,removed:true});return false;}return true;});
 g.portals.forEach(function(p){var was=p.broken||false;if(state==='collapsed'){if(!was||!p.isOpen){p.isOpen=true;p.openFraction=1;p.broken=true;changed.push({portalId:p.id,isOpen:true,openFraction:1,broken:true});}}
  else if(was&&!p.glassless){p.broken=false;changed.push({portalId:p.id,isOpen:p.isOpen,openFraction:p.openFraction,broken:false});}});
 g.rooms.forEach(function(r){if(!r.isOutdoor)r.collapsed=state==='collapsed';});
 if(state==='breached'){var key=function(p){return p.shell+':'+p.edge+':'+p.k+':'+p.role+':'+(+p.a0).toFixed(2)+':'+(+p.y0).toFixed(2);},have=new Set(now.filter(function(p){return p.role==='pier'||p.role==='sill'||p.role==='lintel';}).map(key));
  var gone=intact.filter(function(p){return (p.role==='pier'||p.role==='sill'||p.role==='lintel')&&!have.has(key(p));}).sort(function(a,c){return a.shell-c.shell||a.edge-c.edge||a.k-c.k||a.a0-c.a0;}),groups=[];
  gone.forEach(function(p){var l=groups[groups.length-1];if(l&&l.shell===p.shell&&l.edge===p.edge&&l.k===p.k&&p.a0<=l.a1+0.05){l.a1=Math.max(l.a1,p.a1);l.y0=Math.min(l.y0,p.y0);l.y1=Math.max(l.y1,p.y1);l.ps.push(p);}else groups.push({shell:p.shell,edge:p.edge,k:p.k,a0:p.a0,a1:p.a1,y0:p.y0,y1:p.y1,ps:[p]});});
  var EN=[[0,-1],[1,0],[0,1],[-1,0]],W=function(lx,ly,lz){var q=DM.toWorld(b,lx,lz);return [r3(q[0]),r3((b.padY||0)+ly),r3(q[1])];},WN=function(n){var a=b.yaw*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return [r3(n[0]*c+n[1]*s),0,r3(-n[0]*s+n[1]*c)];};
  groups.forEach(function(gr,i){var cx=0,cz=0;gr.ps.forEach(function(p){cx+=p.p[0];cz+=p.p[2];});cx/=gr.ps.length;cz/=gr.ps.length;var n=EN[gr.edge],shl=b.intactShells||b.shells,sh=shl&&shl.find(function(s){return s.id===gr.shell;});if(!sh)return;
   var rm=(sh.rooms||[]).find(function(q){var r=q.rect;return q.k===gr.k&&cx-n[0]*0.6>=r[0]-0.35&&cx-n[0]*0.6<=r[2]+0.35&&cz-n[1]*0.6>=r[1]-0.35&&cz-n[1]*0.6<=r[3]+0.35;});if(!rm||!rm.graphId)return;
   var p={id:bid+'_BR'+i,kind:'breach',rooms:[rm.graphId,bid+'_Outside'],center:W(cx,(gr.y0+gr.y1)/2,cz),normal:WN(n),width:r3(gr.a1-gr.a0),height:r3(gr.y1-gr.y0),isOpen:true,openFraction:1,panelMaterial:null,breakable:false,lockable:false,broken:true,entityId:bid+':breach:'+i};
   g.portals.push(p);changed.push({portalId:p.id,isOpen:true,openFraction:1,broken:true});});}
 g.state=state;return changed;};
/* ================= loot pass ================= */
DM.LOOT={tiers:['common','uncommon','rare','epic'],weights:{base:[60,28,10,2],landmark:[35,35,22,8],hot:[25,35,28,12]},
 items:{common:['Bandage','9mm rounds','.30-06 clip','Canned rations','Water canteen','Cigarettes','Matches'],uncommon:['Field dressing kit','Mk2 grenade','Toolkit','Flashlight','Gas mask'],
  rare:['M1 Thompson','Morphine syrette','Binoculars','Body armour vest','Lockpick set'],epic:['BAR (M1918)','Satchel charge','Field radio','Medical crate']}};
DM.hotZoneAt=function(x,z){var hz=DM.CARENTAN.hotZones;for(var i=0;i<hz.length;i++){if(Math.hypot(x-hz[i].c[0],z-hz[i].c[1])<hz[i].r)return hz[i];}return null;};
DM.lootSpots=function(buildings,spec){var out=[];buildings.forEach(function(b){(b.shells||[]).forEach(function(sh){(sh.loot||[]).forEach(function(s,i){var w=DM.toWorld(b,s.x,s.z);
   out.push({id:'B'+b.id+'_S'+sh.id+'_L'+i,building:b.id,landmark:!!b.landmark,kind:s.kind,pos:[+w[0].toFixed(3),+((b.padY||0)+s.y).toFixed(3),+w[1].toFixed(3)],yaw:b.yaw+s.yaw,floor:s.k,room:sh.rooms&&sh.rooms[s.room]?sh.rooms[s.room].graphId:null});});});});
 spec.site.cars.forEach(function(c,i){var a=c.yaw*Math.PI/180,bx=c.x-Math.sin(a)*1.9,bz=c.z-Math.cos(a)*1.9;out.push({id:'CAR'+i+'_trunk',building:null,landmark:false,kind:'trunk',pos:[+bx.toFixed(3),+(spec.hm.at(c.x,c.z)+0.95).toFixed(3),+bz.toFixed(3)],yaw:c.yaw,car:i});});
 return out;};
DM.rollLoot=function(spots,seed,buildings){var R=DM.rng((seed*2654435761)^0x10071944),L=DM.LOOT,act=[];
 spots.forEach(function(s){var b=s.building!=null?buildings[s.building]:null;if(b&&b.state==='collapsed')return;var hz=DM.hotZoneAt(s.pos[0],s.pos[2]),zone=hz?'hot':s.landmark?'landmark':'base',p=zone==='hot'?0.7:zone==='landmark'?0.6:s.kind==='trunk'?0.5:0.42;
  if(R()>=p)return;var w=L.weights[zone],t=R()*100,acc=0,tier=0;for(var i=0;i<4;i++){acc+=w[i];if(t<acc){tier=i;break;}}
  var n=1+Math.floor(R()*(tier>=2?2:3)),items=[];for(var j=0;j<n;j++){var tj=j===0?tier:Math.max(0,tier-1-Math.floor(R()*2));items.push(R.pick(L.items[L.tiers[tj]]));}
  act.push({id:s.id,kind:s.kind,tier:L.tiers[tier],zone:hz?hz.id:zone,building:s.building,room:s.room,floor:s.floor,pos:s.pos,yaw:s.yaw,items:items});});
 var counts={};act.forEach(function(c){counts[c.tier]=(counts[c.tier]||0)+1;});
 return {seed:seed,hash:DM.hash(JSON.stringify(act.map(function(c){return [c.id,c.tier,c.items];}))),spots:spots.length,active:act.length,counts:counts,containers:act};};
/* ================= runtime integration (tacticalTown mode 'carentan') ================= */
DM.install=function(TT,tw){if(!DM.TT){DM.TT=TT;DM.TG=TT.TG;Object.keys(DM.recipes).forEach(function(k){DM.TG.recipes[k]=DM.recipes[k];});
  var ob=DM.TG.breach;DM.TG.breach=function(L,R,shells){var out=ob.apply(this,arguments);if(!shells.some(function(sh){return sh.rooms;}))return out;var orig=new Set(L);
   /* keep breach rubble off stair ramps / landings and doorways of our buildings so floors stay reachable */
   return out.filter(function(p){if(orig.has(p)||p.role!=='rubble')return true;var x=p.p[0],z=p.p[2];return !shells.some(function(sh){if(sh.SZ&&x>sh.SZ[0]-0.8&&x<sh.SZ[2]+0.8&&z>sh.SZ[1]-0.5&&z<sh.SZ[3]+0.8)return true;
    if(sh.gallery){var g=sh.gallery;if(x>g.a-0.8&&x<g.a+g.Lr+0.8&&z<g.lane+1.4)return true;}
    return sh.doors.some(function(dd){return Math.hypot(dd.center[0]-x,dd.center[1]-z)<1.9;})||(sh.idoors||[]).some(function(dd){return Math.hypot(dd.c[0]-x,dd.c[1]-z)<1.6;});});});};
  var om=TT.prototype.materials;TT.prototype.materials=function(){var m=om.call(this);if(!m.stone)DM.addMats(this.app,m);return m;};}
 if(typeof document!=='undefined'){var sel=document.querySelector('#tmode');if(sel&&!sel.querySelector('option[value=carentan]')){var o=document.createElement('option');o.value='carentan';o.textContent='carentan (fixed map)';sel.appendChild(o);}}};
DM.addMats=function(app,m){var mk=function(name,col,o){var x=new pc.StandardMaterial();x.name='dm-'+name;if(o&&o.map&&m[o.map])x.diffuseMap=m[o.map].diffuseMap;x.diffuse=new pc.Color(col[0],col[1],col[2]);x.useMetalness=true;x.metalness=o&&o.metal||0;x.gloss=o&&o.gloss||0.15;
  if(o&&o.opacity!=null){x.opacity=o.opacity;x.blendType=pc.BLEND_NORMAL;x.depthWrite=false;}x.update();m[name]=x;};
 mk('stone',[1.25,1.18,1.02],{map:'concrete'});mk('tile',[0.62,0.3,0.24],{map:'roof'});mk('cobble',[1.05,1.0,0.95],{map:'rubble'});mk('dirt',[0.42,0.34,0.25],{map:'floor'});
 mk('water',[0.16,0.24,0.27],{opacity:0.82,gloss:0.7});mk('flood',[0.25,0.32,0.3],{opacity:0.55,gloss:0.6});mk('leaf',[0.17,0.25,0.12],{map:'hedge'});mk('bark',[0.28,0.21,0.15]);mk('rail',[0.33,0.3,0.28],{metal:0.5,gloss:0.35});
 mk('loot0',[0.62,0.62,0.6]);mk('loot1',[0.2,0.62,0.25]);mk('loot2',[0.2,0.38,0.85]);mk('loot3',[0.85,0.55,0.1]);mk('car',[0.22,0.25,0.21],{metal:0.3,gloss:0.3});
 var t=new pc.StandardMaterial();t.name='dm-terrain';t.diffuse=new pc.Color(1,1,1);t.diffuseVertexColor=true;t.useMetalness=true;t.metalness=0;t.gloss=0.08;t.update();m.dmTerrain=t;};
DM.mesh=function(app,P,N,I,C,U){var mesh=new pc.Mesh(app.graphicsDevice);mesh.setPositions(P);if(N)mesh.setNormals(N);if(U)mesh.setUvs(0,U);if(C)mesh.setColors32(C);if(I)mesh.setIndices(I);mesh.update();return mesh;};
DM.renderEntity=function(name,mis,parent,shadows){var e=new pc.Entity(name);e.addComponent('render',{type:'asset',castShadows:!!shadows,receiveShadows:true});e.render.meshInstances=mis;parent.addChild(e);return e;};
DM.terrainColor=function(x,z,y){var d=DM.district(x,z);if(y<-0.45)return [46,52,48];if(y<-0.15)return [72,84,60];if(y>0.9&&Math.max(Math.abs(x),Math.abs(z))>DM.HALF)return [104,108,74];
 if(d==='countryside')return [78,98,52];if(d==='suburbs')return [74,92,54];if(d==='industrial')return [84,84,70];return [80,88,62];};
/* per terrain-grid vertex: [brightness, dirt blend] - contact shade within 2 m of building pads, dirt shoulder 1.8 m past road edges */
DM.groundTints=function(spec,n,E,c,at){var out=new Array(n*n),lots=spec.lots||[],roads=(spec.C&&spec.C.roads)||[];
 for(var j=0;j<n;j++)for(var i=0;i<n;i++){var x=-E+i*c,z=-E+j*c,br=1,dirt=0;
  for(var q=0;q<lots.length;q++){var L=lots[q],r=L.rect;if(x<r[0]-2.5||x>r[2]+2.5||z<r[1]-2.5||z>r[3]+2.5)continue;var lp=DM.toLocal(L,x,z),dx=Math.abs(lp[0])-L.w/2,dz=Math.abs(lp[1])-L.d/2,dd=dx>0||dz>0?Math.hypot(Math.max(dx,0),Math.max(dz,0)):Math.max(dx,dz);
   br=Math.min(br,0.62+0.38*sstep(-0.3,2.0,dd));dirt=Math.max(dirt,0.35*(1-sstep(0,2.2,dd)));}
  for(var k=0;k<roads.length;k++){var rd=roads[k],dr=DM.polyDist(x,z,rd.pts)-rd.w/2;if(dr<2.2)dirt=Math.max(dirt,0.7*(1-sstep(-0.4,2.2,dr)));}
  out[j*n+i]=[br,dirt];}
 return out;};
DM.buildTerrain=function(tw,spec,root){var app=tw.app,mats=tw.materials(),hm=spec.hm,E=DM.EXT,c=DM.CELL,n=hm.n,H=hm.heights,P=[],N=[],C=[],tri=0;var AT=typeof DreadingAtlas!=='undefined'&&DreadingAtlas.enabled?DreadingAtlas:null,U=[],Tn=[];
 var at=function(i,j){return H[j*n+i];},R=DM.rng(99);
 /* terrain batch (seams): per-vertex tint so colour bands blend across cells; contact darkening around building pads and a dirt shoulder
    along roads soften the hard line where terrain meets walls / road ribbons (vertex colour only: no extra draw call) */
 var GT=DM.groundTints(spec,n,E,c,at),vt=function(i,j,y){var x=-E+i*c,z=-E+j*c,col=DM.terrainColor(x,z,y),g=GT[j*n+i],h=(Math.sin(i*12.9898+j*78.233)*43758.5453)%1,k=(0.9+Math.abs(h)*0.2)*g[0];
  return [(col[0]*(1-g[1])+86*g[1])*k,(col[1]*(1-g[1])+74*g[1])*k,(col[2]*(1-g[1])+58*g[1])*k];};
 for(var j=0;j<n-1;j++)for(var i=0;i<n-1;i++){var x0=-E+i*c,z0=-E+j*c,a=[x0,at(i,j),z0,i,j],b=[x0,at(i,j+1),z0+c,i,j+1],cc=[x0+c,at(i+1,j+1),z0+c,i+1,j+1],d=[x0+c,at(i+1,j),z0,i+1,j];
  [[a,b,cc],[a,cc,d]].forEach(function(t){var ux=t[1][0]-t[0][0],uy=t[1][1]-t[0][1],uz=t[1][2]-t[0][2],vx=t[2][0]-t[0][0],vy=t[2][1]-t[0][1],vz=t[2][2]-t[0][2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;
   var mx=(t[0][0]+t[1][0]+t[2][0])/3,mz=(t[0][2]+t[1][2]+t[2][2])/3,my=Math.min(t[0][1],t[1][1],t[2][1]),col=DM.terrainColor(mx,mz,my),k=0.9+R()*0.2;
   var lin=function(v){return Math.min(255,Math.pow(Math.min(1,v/255),2.2)*255)|0;};
   if(AT){/* M12 atlas: one tile per 2.5 m cell, tint keeps the old mean colour. Terrain batch: steep triangles (banks) are projected on the
      vertical plane facing them instead of top-down, so slopes keep ~2.5 m per tile instead of stretching */var dd=DM.district(mx,mz),cj=Math.abs(Math.sin(i*91.7+j*47.3)*24634.6345)%1,tl=AT.tile(my<-0.15+(cj-0.5)*0.26?'mud':dd==='industrial'?'gravel':'grass')/* T10: per-cell jittered mud line (ragged, not a contour) */,rc=tl.rect,av=tl.avg,lt=function(v,i){return Math.min(255,Math.round(Math.pow(Math.min(1,v/255),2.2)/Math.max(0.02,av[i])*0.85*255));};
    var steep=ny/l<0.8,ax=Math.abs(nx)>Math.abs(nz)?2:0,o0=ax===0?x0:z0;
    t.forEach(function(v){var vc=vt(v[3],v[4],v[1]);P.push(v[0],v[1],v[2]);N.push(nx/l,ny/l,nz/l);Tn.push(1,0,0,1);if(steep){U.push(rc[0]+Math.min(1,Math.max(0,(v[ax]-o0)/c))*rc[2],rc[1]+Math.min(1,(v[1]-my)/c)*rc[3]);}else U.push(rc[0]+(v[0]-x0)/c*rc[2],rc[1]+(z0+c-v[2])/c*rc[3]);C.push(lt(vc[0],0),lt(vc[1],1),lt(vc[2],2),255);});tri++;return;}
   t.forEach(function(v){var vc=vt(v[3],v[4],v[1]);P.push(v[0],v[1],v[2]);N.push(nx/l,ny/l,nz/l);C.push(lin(vc[0]),lin(vc[1]),lin(vc[2]),255);});tri++;});}
 var tmesh;if(AT){tmesh=new pc.Mesh(app.graphicsDevice);tmesh.setPositions(P);tmesh.setNormals(N);tmesh.setVertexStream(pc.SEMANTIC_TANGENT,Tn,4);tmesh.setUvs(0,U);tmesh.setColors32(C);tmesh.update();}
 var vis=DM.renderEntity('terrain (visual)',[new pc.MeshInstance(AT?tmesh:DM.mesh(app,P,N,null,C),AT?AT.material(app):mats.dmTerrain)],root,false);
 if(typeof DreadingTerrainPbr!=='undefined')DreadingTerrainPbr.attach(app,vis,spec);
 // nav: indexed grid over the playable square, water/deep-flood cells left out (Recast sees banks as edges)
 var nP=[],nI=[],nc=DM.NAVCELL,m=Math.round(2*DM.HALF/nc)+1,idx=function(i,j){return j*m+i;};
 for(var j2=0;j2<m;j2++)for(var i2=0;i2<m;i2++){var x=-DM.HALF+i2*nc,z=-DM.HALF+j2*nc;nP.push(x,hm.at(x,z),z);}
 var ntri=0;for(var j3=0;j3<m-1;j3++)for(var i3=0;i3<m-1;i3++){var A=idx(i3,j3),B=idx(i3,j3+1),C2=idx(i3+1,j3+1),D=idx(i3+1,j3),low=function(q){return nP[q*3+1]<-0.45;};
  if(!low(A)&&!low(B)&&!low(C2)){nI.push(A,B,C2);ntri++;}if(!low(A)&&!low(C2)&&!low(D)){nI.push(A,C2,D);ntri++;}}
 var nav=new pc.Entity('terrain (nav)');nav.addComponent('render',{type:'asset',castShadows:false,receiveShadows:false});nav.render.meshInstances=[new pc.MeshInstance(DM.mesh(app,nP,null,nI),mats.dmTerrain)];nav.render.enabled=false;
 nav.tags.add('tactical:walkable');nav.tags.add('no-sight');nav.townGroup='terrain';root.addChild(nav);
 return {visualTris:tri,navTris:ntri,entity:vis,nav:nav};};
DM.ribbon=function(pts,w,hm,lift,step){var P=[],N=[],U=[],I=[],acc=0;var samples=[];for(var i=0;i<pts.length-1;i++){var a=pts[i],b=pts[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/(step||2)));for(var k=0;k<(i===pts.length-2?n+1:n);k++){var t=k/n;samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
 samples.forEach(function(s,i){var p=samples[Math.max(0,i-1)],q=samples[Math.min(samples.length-1,i+1)],dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;if(i>0)acc+=Math.hypot(s[0]-samples[i-1][0],s[1]-samples[i-1][1]);
  [-1,1].forEach(function(sd){var x=s[0]+nx*sd*w/2,z=s[1]+nz*sd*w/2,y=Math.max(hm.at(x,z),hm.at(s[0],s[1]))+lift;P.push(x,y,z);N.push(0,1,0);U.push(sd<0?0:w/2.5,acc/2.5);});
  if(i>0){var b0=(i-1)*2;I.push(b0,b0+2,b0+3,b0,b0+3,b0+1);}});return {P:P,N:N,U:U,I:I};};
DM.merge=function(list){var P=[],N=[],U=[],I=[];list.forEach(function(g){var base=P.length/3;P.push.apply(P,g.P);N.push.apply(N,g.N);U.push.apply(U,g.U);g.I.forEach(function(i){I.push(base+i);});});return {P:P,N:N,U:U,I:I};};
/* static site: roads, water, bridges, rail, hedges, trees, cars, sandbags (tag entities grouped per 40 m cell for perception) */
/* water grid over rect R at level wy: cells with any corner below the surface; alpha = maxA * depth/fade, foam within 0.2 m of the shore */
DM.waterGrid=function(hm,R,cell,wy,col,maxA,fade){var P=[],N=[],C=[],I=[],idx={},nx=Math.ceil((R[2]-R[0])/cell),nz=Math.ceil((R[3]-R[1])/cell),lin=function(v){return Math.round(Math.pow(Math.min(1,v),2.2)*255);};/* vertex colours are linear (see buildTerrain) */
 var vid=function(i,j){var k=i+','+j;if(idx[k]!=null)return idx[k];var x=R[0]+i*cell,z=R[1]+j*cell,d=wy-hm.at(x,z),f=Math.max(0,Math.min(1,d/fade)),foam=1-Math.max(0,Math.min(1,(d-0.03)/0.2));
  var r=col[0]+(0.62-col[0])*foam*0.8,g=col[1]+(0.66-col[1])*foam*0.8,b=col[2]+(0.64-col[2])*foam*0.8,al=Math.max(f*maxA,foam*Math.min(1,d/0.06)*0.7*(d>0?1:0));
  idx[k]=P.length/3;P.push(x,wy,z);N.push(0,1,0);C.push(lin(r),lin(g),lin(b),Math.round(Math.max(0,Math.min(1,al))*255));return idx[k];};
 for(var j=0;j<nz;j++)for(var i=0;i<nx;i++){var x=R[0]+i*cell,z=R[1]+j*cell;if(hm.at(x,z)>=wy&&hm.at(x+cell,z)>=wy&&hm.at(x,z+cell)>=wy&&hm.at(x+cell,z+cell)>=wy)continue;
  var a=vid(i,j),b=vid(i,j+1),c=vid(i+1,j+1),d=vid(i+1,j);I.push(a,b,c,a,c,d);}
 return {P:P,N:N,C:C,I:I};};
DM.buildSite=function(tw,spec,root){var app=tw.app,mats=tw.materials(),hm=spec.hm,C=spec.C,site=spec.site,vis=[],tags=[],R=DM.rng(4242);
 var cellOf=function(x,z){return 's'+Math.floor((x+150)/40)+'_'+Math.floor((z+150)/40);};
 var box=function(cx,y0,cz,sx,sy,sz,yaw,m,tag,o){var p={p:[cx,y0+sy/2,cz],s:[sx,sy,sz],r:[0,yaw||0,0],m:m,tag:tag||null,vis:true,role:(o&&o.role)||'site'};if(o)for(var k in o)p[k]=o[k];vis.push(p);if(tag)tags.push(p);return p;};
 // roads + plaza (visual ribbons, nav is the terrain under them)
 var byM={};C.roads.forEach(function(r){(byM[r.m]=byM[r.m]||[]).push(DM.ribbon(r.pts,r.w,hm,0.035));});
 var sq=C.square;(byM.cobble=byM.cobble||[]).push(DM.ribbon([[sq[0],(sq[1]+sq[3])/2],[sq[2],(sq[1]+sq[3])/2]],sq[3]-sq[1],hm,0.03,4));
 var roadMis=Object.keys(byM).map(function(k){var g=DM.merge(byM[k]);return new pc.MeshInstance(DM.mesh(app,g.P,g.N,g.I,null,g.U),mats[k==='asphalt'?'asphalt':k]);});DM.renderEntity('roads',roadMis,root,false);
 // water surfaces (terrain batch): one grid per water level, kept only where the terrain dips under it; vertex alpha fades with depth
 // and the shallowest band turns to foam, so every shore follows the heightmap contour (river, canal, basin, flooded fields)
 var wmat=function(base,name){var m2=base.clone();m2.name=name;m2.diffuse=new pc.Color(1,1,1);m2.diffuseVertexColor=true;m2.opacity=1;m2.opacityVertexColor=true;m2.opacityVertexColorChannel='a';m2.update();return m2;};
 var W1=DM.waterGrid(hm,[-DM.EXT,-DM.EXT,DM.EXT,DM.EXT],2.0,-0.6,[0.16,0.24,0.27],0.82,1.1),F=C.flooded,W2=DM.waterGrid(hm,[F[0]-6,F[1]-6,F[2]+6,F[3]+6],2.0,-0.2,[0.25,0.32,0.3],0.55,0.25);
 mats.waterV=mats.waterV||wmat(mats.water,'dm-water-shore');mats.floodV=mats.floodV||wmat(mats.flood,'dm-flood-shore');
 DM.waterStats={verts:W1.P.length/3+W2.P.length/3,tris:(W1.I.length+W2.I.length)/3};
 DM.renderEntity('water',[new pc.MeshInstance(DM.mesh(app,W1.P,W1.N,W1.I,W1.C),mats.waterV),new pc.MeshInstance(DM.mesh(app,W2.P,W2.N,W2.I,W2.C),mats.floodV)],root,false);
 // bridges: walkable decks + low parapets
 C.bridges.forEach(function(br,i){if(br.canal){var x0=C.canal.x-C.canal.half-3.2,x1=C.canal.x+C.canal.half+3.2;box((x0+x1)/2,br.deckY-0.3,br.z,x1-x0,0.3,br.w,0,'wood','walkable',{role:'bridge',group:'bridge'+i});
   [-1,1].forEach(function(s){box((x0+x1)/2,br.deckY,br.z+s*(br.w/2-0.1),x1-x0,0.9,0.2,0,'wood','coverLow',{role:'bridgeRail',group:'bridge'+i,noSight:true});});return;}
  var zc=C.riverZ(br.x),z0=zc-C.riverHalf-4.2,z1=zc+C.riverHalf+4.2;box(br.x,br.deckY-0.35,(z0+z1)/2,br.w,0.35,z1-z0,0,br.w>5?'stone':'wood','walkable',{role:'bridge',group:'bridge'+i});
  [-1,1].forEach(function(s){box(br.x+s*(br.w/2-0.15),br.deckY,(z0+z1)/2,0.3,br.w>5?1.0:0.9,z1-z0,0,br.w>5?'stone':'wood','coverLow',{role:'bridgeRail',group:'bridge'+i});});
  if(br.w>5)box(br.x,-2.0,zc,br.w-1,br.deckY+1.6,1.4,0,'stone',null,{role:'pier'});});
 // railway: ballast, rails, fences with crossing gaps, platform at the station
 var rz=C.railZ,yb=function(x){return hm.at(x,rz);};
 for(var x2=-150;x2<150;x2+=10){box(x2+5,yb(x2+5)-0.1,rz,10,0.25,7,0,'rubble',null,{role:'ballast'});[-1.5,1.5].forEach(function(t){[-0.72,0.72].forEach(function(r){box(x2+5,yb(x2+5)+0.15,rz+t+r,10,0.14,0.1,0,'rail',null,{role:'rail'});});});}
 var crossing=function(x){return C.roads.some(function(r){return DM.polyDist(x,rz-4,r.pts)<r.w/2+3||DM.polyDist(x,rz+4,r.pts)<r.w/2+3||DM.polyDist(x,rz,r.pts)<r.w/2+3;});};
 var plat=[12,52];
 [-4.4,4.4].forEach(function(off){for(var x3=-124;x3<124;x3+=4){var mx=x3+2;if(crossing(mx))continue;if(off>0&&mx>plat[0]-2&&mx<plat[1]+2)continue;box(mx,hm.at(mx,rz+off),rz+off,4,1.25,0.12,0,'rail','obstacle',{role:'fence',noSight:true});}});
 box((plat[0]+plat[1])/2,hm.at(32,rz+5.8),rz+5.8,plat[1]-plat[0],0.3,2.6,0,'concrete','walkable',{role:'platform'});
 // hedgerows (bocage): tall cover, flooded ones are just low reeds
 site.hedges.forEach(function(h){var mx=(h.a[0]+h.b[0])/2,mz=(h.a[1]+h.b[1])/2,L=Math.hypot(h.b[0]-h.a[0],h.b[1]-h.a[1]),yaw=Math.atan2(h.b[0]-h.a[0],h.b[1]-h.a[1])*180/Math.PI,hh=h.deep?0.9:R.range(1.7,2.3);
  box(mx,hm.at(mx,mz)-0.1,mz,1.3,hh+0.1,L+0.2,yaw,'leaf',h.deep?'coverLow':'coverTall',{role:'hedge'});});
 // trees: trunk cover + canopy (visual)
 site.trees.forEach(function(t){var y=hm.at(t.x,t.z);box(t.x,y,t.z,0.45*t.s,3.2*t.s,0.45*t.s,0,'bark','coverTall',{role:'trunk',noSight:true});box(t.x,y+2.6*t.s,t.z,3.4*t.s,2.8*t.s,3.4*t.s,R.range(0,90),'leaf',null,{role:'canopy'});});
 // wrecked cars (low cover; the trunk is a loot spot)
 site.cars.forEach(function(c){var y=hm.at(c.x,c.z);box(c.x,y,c.z,1.75,1.05,4.2,c.yaw,c.burnt?'burnt':'car','coverLow',{role:'vehicle'});var a=c.yaw*Math.PI/180;box(c.x+Math.sin(a)*0.3,y+1.05,c.z+Math.cos(a)*0.3,1.5,0.45,2.0,c.yaw,c.burnt?'burnt':'car',null,{role:'cabin'});});
 // sandbag rings around the prize
 site.sandbags.forEach(function(s){var y=hm.at(s.x,s.z);box(s.x,y,s.z,3.2,0.95,0.8,s.yaw,'dirt','coverLow',{role:'sandbags'});});
 var st=new pc.Entity('site');root.addChild(st);var mis=tw.buildMeshes(vis);if(mis.length)DM.renderEntity('site meshes',mis,st,true);
 var nTag=0;tags.forEach(function(p,i){var e=new pc.Entity(p.role+' '+i);e.tags.add('tactical:'+p.tag);if(p.noSight)e.tags.add('no-sight');e.townGroup=p.group||cellOf(p.p[0],p.p[2]);e.coverSpacing=2;e.setLocalPosition(p.p[0],p.p[1],p.p[2]);e.setLocalEulerAngles(0,p.r[1],0);e.setLocalScale(p.s[0],p.s[1],p.s[2]);st.addChild(e);nTag++;});
 return {tagEntities:nTag,drawCalls:mis.length+roadMis.length+2,entity:st};};
/* Editor scene: hidden while the fixed map is up (restored on leaving), markers moved into the church */
DM.EDITOR_GROUPS=['Tactical Environment','Stairs','Extra cover (M3)'];
DM.hideEditor=function(app){if(DM._hidden)return;DM._hidden=[];DM.EDITOR_GROUPS.forEach(function(n){var e=app.root.findByName(n);if(e&&e.enabled){e.enabled=false;DM._hidden.push(e);}});var d=app.root.findByName('Door - upper landing');if(d&&d.enabled){d.enabled=false;DM._hidden.push(d);}};
DM.restoreEditor=function(app){(DM._hidden||[]).forEach(function(e){e.enabled=true;});DM._hidden=null;
 (DM._moved||[]).forEach(function(m){m.e.setPosition(m.p[0],m.p[1],m.p[2]);m.e.setEulerAngles(m.r[0],m.r[1],m.r[2]);});DM._moved=null;
 var T=TacticalCommon.ns(app);if(DM._spawnsOrig&&T.spawnPoints){T.spawnPoints.forEach(function(s){var o=DM._spawnsOrig[s.name];if(o){s.position=o.p.slice();s.yaw=o.yaw;}});(T.squad||[]).forEach(function(s){var o=DM._spawnsOrig[s.soldierName];if(o)s.start=o.p.slice();});}DM._spawnsOrig=null;};
DM.churchPoints=function(b){var W=function(lx,ly,lz){var w=DM.toWorld(b,lx,lz);return [w[0],(b.padY||0)+ly,w[1]];};
 if(b.state==='collapsed')return {objective:W(0,0,-11),room1:W(-6,0,-11),room2:W(12,0,-11),overwatch1:W(-12,0,11),overwatch2:W(8,0,11),stairApproach1:W(4.25,0,9.5),stairApproach2:W(4.25,0,13),
  ECHO:W(-10,0,13),FOXTROT:W(10,0,13),GOLF:W(2,0,-11),HOTEL:W(-16,0,-11)};
 return {objective:W(3,0.12,0),room1:W(6,0.12,0),room2:W(13,0.12,-3),overwatch1:W(-6,4.72,5.6),overwatch2:W(-6,4.72,-5.6),stairApproach1:W(4.25,0,9.5),stairApproach2:W(4.25,0,11),
  ECHO:W(-4,4.72,5.0),FOXTROT:W(-8,4.72,-5.6),GOLF:W(8,0.12,0),HOTEL:W(-15,3.42,2.5)};};
DM.moveMarker=function(app,name,p,yaw){var C=TacticalCommon,e=null;C.collect(app).forEach(function(t){if(e)return;if((t.slot===name||t.name===name)&&['defensiveArea','spawn','threat','door'].indexOf(t.kind)>=0)e=t.entity;});
 if(!e){var m=C.marker&&C.marker(app,name);if(m)e=m.entity;}if(!e)return false;DM._moved=DM._moved||[];if(!DM._moved.some(function(q){return q.e===e;})){var r=e.getEulerAngles();DM._moved.push({e:e,p:C.v3(e.getPosition()).slice(),r:[r.x,r.y,r.z]});}
 e.setPosition(p[0],p[1],p[2]);if(yaw!=null)e.setEulerAngles(0,yaw,0);return true;};
DM.placeMarkers=function(tw){var app=tw.app,T=TacticalCommon.ns(app),church=tw.buildings.find(function(b){return b.type==='church';});if(!church)return;var P=DM.churchPoints(church);
 ['objective','room1','room2','overwatch1','overwatch2','stairApproach1','stairApproach2'].forEach(function(k){DM.moveMarker(app,k,P[k]);});
 tw.objectiveRef=church.id;if(T.orders)T.orders._objRect=null;
 DM._spawnsOrig=DM._spawnsOrig||{};(T.spawnPoints||[]).forEach(function(s){if(!DM._spawnsOrig[s.name])DM._spawnsOrig[s.name]={p:s.position.slice(),yaw:s.yaw};});
 (T.spawnPoints||[]).filter(function(s){return s.team==='enemy';}).forEach(function(s){var p=P[s.name]||P.GOLF;s.position=p.slice();s.yaw=180;DM.moveMarker(app,s.name,p,180);});
 if(TacticalCommon.invalidateMarkers)TacticalCommon.invalidateMarkers();};
DM.matchSpawns=function(seed){var C=DM.CARENTAN,R=DM.rng((seed*40503)^0x5eed),pair=C.spawnPairs[Math.floor(R()*C.spawnPairs.length)];return {friendly:pair[0],enemyEdge:pair[1]};};
DM.applySpawns=function(tw,seed,useNav){var app=tw.app,T=TacticalCommon.ns(app),spec=DM._spec,C=DM.CARENTAN,ms=DM.matchSpawns(seed),sp=C.spawns[ms.friendly],a=sp.yaw*Math.PI/180,f=[Math.sin(a),Math.cos(a)],rt=[f[1],-f[0]];
 var offs=[[-1,0],[1,0],[-1,-1.6],[1,-1.6]],i=0;
 (T.spawnPoints||[]).filter(function(s){return s.team==='friendly';}).forEach(function(s){var o=offs[i++%4],x=sp.p[0]+rt[0]*o[0]*1.5+f[0]*o[1],z=sp.p[1]+rt[1]*o[0]*1.5+f[1]*o[1],p=[x,spec.hm.at(x,z),z];
  if(useNav&&T.navigation&&T.navigation.nearest){var q=T.navigation.nearest(p,{x:2,y:3,z:2});if(q)p=q;}s.position=p.slice();s.yaw=sp.yaw;DM.moveMarker(app,s.name,p,sp.yaw);
  var sol=(T.squad||[]).find(function(q){return q.soldierName===s.name;});if(sol){sol.start=p.slice();}});
 (T.squad||[]).forEach(function(s){if(s.team!=='enemy')return;var e=(T.spawnPoints||[]).find(function(p){return p.name===s.soldierName;});if(e)s.start=e.position.slice();});
 tw.match={seed:seed,friendlySpawn:ms.friendly,enemyThreatEdge:ms.enemyEdge};return tw.match;};
DM.renderLoot=function(tw){var app=tw.app;if(tw.lootEntity){tw.lootEntity.destroy();tw.lootEntity=null;}if(!tw.loot||!tw.root)return;var pcs=[];
 var dims={cabinet:[0.9,1.15,0.45,'wood'],locker:[0.55,1.85,0.5,'metal'],crate:[0.8,0.65,0.8,'wood'],trunk:[0.9,0.12,0.5,'car']};
 tw.loot.containers.forEach(function(c){var b=c.building!=null?tw.buildings[c.building]:null;if(b&&b.state==='collapsed')return;var d=dims[c.kind]||dims.crate,a=c.yaw*Math.PI/180,ti=DM.LOOT.tiers.indexOf(c.tier);
  if(c.kind!=='trunk')pcs.push({p:[c.pos[0],c.pos[1]+d[1]/2,c.pos[2]],s:[d[0],d[1],d[2]],r:[0,c.yaw,0],m:d[3],vis:true});
  pcs.push({p:[c.pos[0]+Math.sin(a)*(c.kind==='trunk'?0:d[2]/2+0.01),c.pos[1]+(c.kind==='trunk'?0.06:d[1]*0.82),c.pos[2]+Math.cos(a)*(c.kind==='trunk'?0:d[2]/2+0.01)],s:[d[0]*0.9,c.kind==='trunk'?0.06:0.12,c.kind==='trunk'?d[2]:0.03],r:[0,c.yaw,0],m:'loot'+ti,vis:true});});
 var mis=tw.buildMeshes(pcs);tw.lootEntity=DM.renderEntity('loot containers',mis,tw.root,true);tw.lootDrawCalls=mis.length;};
DM.newMatch=function(tw,seed){tw.loot=DM.rollLoot(tw.lootSpots,seed,tw.buildings);DM.renderLoot(tw);if(tw.roomGraph)tw.roomGraph.loot={seed:seed,hash:tw.loot.hash};
 tw.app.fire('carentan:match',{seed:seed,spawn:tw.match&&tw.match.friendlySpawn,lootHash:tw.loot.hash,mapHash:tw.mapHash});return tw.loot;};
DM.hooks=function(app){if(DM._hooked)return;DM._hooked=true;var T=TacticalCommon.ns(app);
 if(typeof TacticalSquadOrders!=='undefined'){var or=TacticalSquadOrders.prototype.reset;TacticalSquadOrders.prototype.reset=function(seed){var tw=T.town;if(tw&&tw.carentan){var sd=seed!==undefined?seed:(T.seedValue||1);DM.applySpawns(tw,sd,true);DM.newMatch(tw,sd);}return or.apply(this,arguments);};}
 if(typeof TacticalZombies!=='undefined'){var osp=TacticalZombies.prototype.spawnPoints;TacticalZombies.prototype.spawnPoints=function(n,taken){var tw=T.town;if(!tw||!tw.carentan||!T.orders||n<2)return osp.call(this,n,taken);
   var ORD=T.orders,hz=DM.CARENTAN.hotZones,k=Math.round(n*0.55),out=[],own=ORD.hasOwnProperty('objective'),prev=ORD.objective;
   try{var z=hz[Math.floor(TacticalCommon.random()*hz.length)],c=[z.c[0],0,z.c[1]];ORD.objective=function(){return c;};out=osp.call(this,k,taken);}finally{if(own)ORD.objective=prev;else delete ORD.objective;}
   var rest=osp.call(this,n-out.length,(taken||[]).concat(out));return out.concat(rest);};}};
DM.generate=async function(tw,opts,rebuild){var app=tw.app,T=TacticalCommon.ns(app),t0=performance.now();if(DM.pnlHook)DM.pnlHook(tw);DM.pnlBrokenDirty=true;DM.pnlDirtyB=[];if(TacticalCommon.invalidateMarkers)TacticalCommon.invalidateMarkers();if(opts)for(var k in opts)if(opts[k]!=null)tw.opts[k]=opts[k];
 DM.install(DM.TT||TacticalTown,tw);DM.hooks(app);tw.clear();tw.carentan=true;DM.hideEditor(app);
 var spec=DM.carentanSpec();DM.heightmap(spec);tw.mapHash=spec.mapHash;var tLay=performance.now();
 tw.root=new pc.Entity('Procedural town (Carentan 1944)');app.root.addChild(tw.root);
 var ter=DM.buildTerrain(tw,spec,tw.root),site=DM.buildSite(tw,spec,tw.root);
 tw.buildings=spec.lots.map(function(L){L.entity=null;L.padY=0;L.kit=false;L.state='intact';L.graph=null;return L;});tw.roads=spec.C.roads;tw.lay={carentan:true,spec:spec};
 for(var i=0;i<tw.buildings.length;i++)await tw.build(tw.buildings[i],'intact');
 // room graphs (intact) + loot spots
 var graphs=[];tw.buildings.forEach(function(b){var P=tw.pieces(b,'intact');b.shells=P.shells;b.intactShells=P.shells;b.intactWalls=P.pieces.filter(function(p){return p.role==='pier'||p.role==='sill'||p.role==='lintel';});b.graph=DM.roomGraph(b,P);graphs.push(b.graph);});
 tw.roomGraph={version:1,units:'meters',map:'carentan',name:'Carentan 1944',mapHash:spec.mapHash,portalStateVersion:0,buildings:graphs};
 tw.lootSpots=DM.lootSpots(tw.buildings,spec);
 DM.placeMarkers(tw);var seed=T.seedValue||1;DM.applySpawns(tw,seed,false);
 (T.squad||[]).forEach(function(s){if(s.start&&s.entity)s.entity.setPosition(s.start[0],s.start[1],s.start[2]);});
 DM.newMatch(tw,seed);
 var tBuild=performance.now(),sum=function(f){return tw.buildings.reduce(function(a,b){return a+(b.stats&&b.stats[f]||0);},0);};
 tw.stats={on:true,seed:DM.SEED,mode:'carentan',map:'Carentan 1944',mapHash:spec.mapHash,count:tw.buildings.length,requested:tw.buildings.length,kit:0,generated:tw.buildings.length,types:tw.buildings.map(function(b){return b.type;}),roads:spec.C.roads.length,
  rooms:graphs.reduce(function(a,g){return a+g.rooms.length-1;},0),portals:graphs.reduce(function(a,g){return a+g.portals.length;},0),lootSpots:tw.lootSpots.length,lootActive:tw.loot.active,lootHash:tw.loot.hash,spawn:tw.match.friendlySpawn,
  tagEntities:sum('tagEntities')+site.tagEntities+1,drawCalls:sum('drawCalls')+site.drawCalls+(tw.lootDrawCalls||0)+1,triangles:sum('triangles')+ter.visualTris,terrainNavTris:ter.navTris,layoutMs:+(tLay-t0).toFixed(1),buildMs:+(tBuild-tLay).toFixed(1),kitMissing:[]};
 if(rebuild){await tw.busy('Building Carentan - navmesh...');var r=await T.navigation.rebuild('carentan generated');tw.stats.nav=r&&r.info;await tw.busy(null);if(T.orders&&T.ready)T.orders.reset(T.seedValue||1);}
 tw.stats.totalMs=+(performance.now()-t0).toFixed(1);app.fire('tactical:town',tw.stats);return tw.stats;};
DM.leave=function(tw){if(!tw.carentan)return;tw.carentan=false;tw.objectiveRef=null;if(tw.lootEntity){tw.lootEntity=null;}DM.restoreEditor(tw.app);var T=TacticalCommon.ns(tw.app);if(T.orders)T.orders._objRect=null;
 (T.squad||[]).forEach(function(s){if(s.start&&s.entity)s.entity.setPosition(s.start[0],s.start[1],s.start[2]);});if(TacticalCommon.invalidateMarkers)TacticalCommon.invalidateMarkers();};
DM.onState=function(tw,b,state){if(!tw.carentan||!b.graph)return [];var TS=TacticalCommon.ns(tw.app).strategy;if(b.id===tw.objectiveRef&&TS&&TS.active&&state!=='intact')TS.pendingHome=b.id;/* Task 8: interim rubble markers here (nav validation stays clean); strategy re-homes the defenders after the nav rebuild (tactical:buildingState) */if(b.id===tw.objectiveRef){DM.placeMarkers(tw);var T0=TacticalCommon.ns(tw.app);(T0.squad||[]).forEach(function(s){if(s.team!=='enemy')return;var e=(T0.spawnPoints||[]).find(function(p){return p.name===s.soldierName;});if(e)s.start=e.position.slice();});}var P=tw.pieces(b,state),ch=DM.damageGraph(b,b.graph,b.intactWalls,P.pieces,state);if(ch.length&&tw.roomGraph)tw.roomGraph.portalStateVersion++;
 ch.forEach(function(c){c.buildingId='B'+b.id;c.portalStateVersion=tw.roomGraph.portalStateVersion;tw.app.fire('portal:changed',c);});DM.renderLoot(tw);return ch;};
DM.exportGraph=function(tw){return JSON.stringify(tw.roomGraph);};
/* ---- M11: panel damage (Carentan buildings only). Walls are split into ~1 m panels (PNL_<building>_<wall>_<i>), each with HP,
   an intact mesh range inside the building's batched mesh, a broken (jagged frame + rubble) mesh, and collision that is
   re-merged per wall row when a panel breaks. Door-sized floor-level holes become breach portals + a (coalesced) nav rebuild;
   losing too many load-bearing panels collapses the building through the existing setState path. ---- */
DM.PNL={W:1.1,MAX:1.5,BULLET:28,HP:{brick:150,stone:190,concrete:230,plaster:90,wood:60,metal:130},HOLE_W:0.8,HOLE_H:1.8,COLLAPSE:0.5,
 stats:{breaks:0,holes:0,collapses:0,flushes:0,flushMaxMs:0,brokenRebuildMaxMs:0}};
DM.pnlHash=function(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;};
DM.pnlRng=function(s){var a=DM.pnlHash(s)||1;return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};
DM.panelize=function(tw,b,state,P){P.panels=null;P.tagPieces=null;if(!tw.carentan||state==='collapsed'||b.kit)return;var C=DM.PNL,out=[],list=[],cnt={};
 P.pieces.forEach(function(p){var ext=p.role==='pier'||p.role==='sill'||p.role==='lintel',part=p.role==='partition';
  if(!(ext||part)||!p.tag||(p.r&&Math.abs(p.r[1])>0.01)){out.push(p);return;}
  var alongX=ext?(p.edge===0||p.edge===2):p.s[0]>=p.s[2],len=alongX?p.s[0]:p.s[2],h=p.s[1];
  var n=Math.max(1,Math.round(len/C.W));while(len/n>C.MAX)n++;var m=Math.max(1,Math.round(h/C.W));while(h/m>C.MAX)m++;
  var wall=ext?('s'+p.shell+'e'+p.edge+'k'+p.k):('s'+p.shell+(alongX?'px':'pz')+(alongX?p.p[2]:p.p[0]).toFixed(1).replace('-','m').replace('.','p')+'k'+p.k);
  var dir=ext?(p.edge===0?[1,0]:p.edge===1?[0,1]:p.edge===2?[-1,0]:[0,-1]):(alongX?[1,0]:[0,1]);
  var a0=ext?p.a0:(alongX?p.p[0]:p.p[2])-len/2,a1=ext?p.a1:a0+len,am=(a0+a1)/2,y0=p.p[1]-h/2,floorY=ext?y0-(p.y0||0):y0;
  var incF=dir[0]>0.5?0:dir[0]<-0.5?1:dir[1]>0.5?4:5,decF=incF===0?1:incF===1?0:incF===4?5:4,baseRun=ext?p.run:('P:'+wall+':'+(alongX?p.p[2]:p.p[0]).toFixed(2));
  for(var j=0;j<m;j++)for(var i=0;i<n;i++){var ai0=a0+(a1-a0)*i/n,ai1=a0+(a1-a0)*(i+1)/n,d=(ai0+ai1)/2-am,yy0=y0+h*j/m,yy1=y0+h*(j+1)/m,q={};
   for(var k in p)q[k]=p[k];q.p=[p.p[0]+dir[0]*d,(yy0+yy1)/2,p.p[2]+dir[1]*d];q.s=alongX?[len/n,h/m,p.s[2]]:[p.s[0],h/m,len/n];q.r=[0,0,0];var qs0=q.s;/* seam fix: each render panel overlaps its neighbours by 3 mm (along + up) so adjacent faces never leave a raster crack (the
   faces share the world-aligned atlas grid, so the overlap samples identical texels: no z-fight visible). Logic sizes (ls) stay exact */
   q.s=alongX?[qs0[0]+0.006,qs0[1]+0.006,qs0[2]]:[qs0[0],qs0[1]+0.006,qs0[2]+0.006];
   q.a0=ai0;q.a1=ai1;q.edge=ext?p.edge:(alongX?0:1);q.run=baseRun+':r'+yy0.toFixed(2);q.origRun=baseRun;q.tag=(j>0&&p.tag==='coverTall')?'obstacle':p.tag;
   var hide=0;if(i>0)hide|=1<<decF;if(i<n-1)hide|=1<<incF;if(j>0)hide|=1<<3;if(j<m-1)hide|=1<<2;q.hide=hide;
   var wi=cnt[wall]=(cnt[wall]||0)+1;q.pnl='PNL_'+b.id+'_'+wall+'_'+(wi-1);out.push(q);
   var hp=C.HP[p.m]||110;if(part)hp*=0.6;
   list.push({id:q.pnl,idx:list.length,wall:wall,run:q.run,origRun:baseRun,ext:ext,role:p.role,lp:q.p,ls:qs0,a0:ai0,a1:ai1,y0:yy0,y1:yy1,floorY:floorY,k:p.k,shell:p.shell,edge:q.edge,dir:dir,alongX:alongX,m:p.m,tag:q.tag,noSight:p.noSight,hp:hp,maxHp:hp,broken:false,nb:[]});}});
 /* collision stays one merged box per original wall run until something in that run breaks */
 P.tagPieces=P.pieces.map(function(p){if((p.role==='partition')&&p.tag&&!p.run){var q={};for(var k in p)q[k]=p[k];var ax=p.s[0]>=p.s[2];q.run='P:s'+p.shell+(ax?'px':'pz')+(ax?p.p[2]:p.p[0]).toFixed(1).replace('-','m').replace('.','p')+'k'+p.k+':'+(ax?p.p[2]:p.p[0]).toFixed(2);q.edge=ax?0:1;q.a0=(ax?p.p[0]:p.p[2])-(ax?p.s[0]:p.s[2])/2;q.a1=q.a0+(ax?p.s[0]:p.s[2]);return q;}return p;});
 P.pieces=out;P.panels=list;};
DM.onBuilt=function(tw,b,state,P,mis){b.pnl=null;if(!P.panels||!P.panels.length)return;
 var S={list:P.panels,byId:{},mis:mis||[],ranges:{},walls:{},dirtyMesh:{},dirtyRun:{},dirtyWall:{},holes:{},orig:{},broken:0,collapsing:false};
 S.list.forEach(function(pn){S.byId[pn.id]=pn;(S.walls[pn.wall]=S.walls[pn.wall]||[]).push(pn);});
 S.mis.forEach(function(mi,mii){var R=mi.pnlR;if(!R)return;for(var i=0;i<R.length;i+=3)(S.ranges[R[i]]=S.ranges[R[i]]||[]).push([mii,R[i+1],R[i+2]]);});
 Object.keys(S.walls).forEach(function(w){var L=S.walls[w];for(var i=0;i<L.length;i++)for(var j=i+1;j<L.length;j++){var A=L[i],B=L[j],oa=Math.min(A.a1,B.a1)-Math.max(A.a0,B.a0),oy=Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0);
   if((oa>0.05&&Math.abs(oy)<0.03)||(oy>0.05&&Math.abs(oa)<0.03)){A.nb.push(B.idx);B.nb.push(A.idx);}}
  S.orig[w]=DM.pnlColumns(L,true);});
 b.pnl=S;};
// world <-> lot-local (building entity: position (x,padY,z), yaw about +Y)
DM.pnlToLocal=function(b,p){var t=b.yaw*Math.PI/180,c=Math.cos(t),s=Math.sin(t),dx=p[0]-b.x,dz=p[2]-b.z;return [dx*c-dz*s,p[1]-(b.padY||0),dx*s+dz*c];};
DM.pnlToWorld=function(b,p){var t=b.yaw*Math.PI/180,c=Math.cos(t),s=Math.sin(t);return [b.x+p[0]*c+p[2]*s,p[1]+(b.padY||0),b.z-p[0]*s+p[2]*c];};
DM.pnlFind=function(b,lp,pad){var S=b.pnl;if(!S)return null;pad=pad==null?0.08:pad;var best=null,bd=1e9;
 for(var i=0;i<S.list.length;i++){var pn=S.list[i];if(pn.broken)continue;var dx=Math.abs(lp[0]-pn.lp[0]),dy=Math.abs(lp[1]-pn.lp[1]),dz=Math.abs(lp[2]-pn.lp[2]);
  if(dx<=pn.ls[0]/2+pad&&dy<=pn.ls[1]/2+pad&&dz<=pn.ls[2]/2+pad){var d=dx+dy+dz;if(d<bd){bd=d;best=pn;}}}return best;};
DM.pnlBuildingAt=function(tw,p){var bs=tw.buildings||[];for(var i=0;i<bs.length;i++){var b=bs[i];if(!b.pnl)continue;var r=b.rect;if(p[0]>=r[0]-0.6&&p[0]<=r[2]+0.6&&p[2]>=r[1]-0.6&&p[2]<=r[3]+0.6)return b;}return null;};
// a bullet / fragment hit at a world point: damage the panel it lands on
DM.hitAt=function(tw,wp,dmg,dirW,kind){var bs=tw.buildings||[],b=null,pn=null,lp=null;
 for(var bi=0;bi<bs.length&&!pn;bi++){var bb=bs[bi];if(!bb.pnl)continue;var r=bb.rect;if(wp[0]<r[0]-1||wp[0]>r[2]+1||wp[2]<r[1]-1||wp[2]>r[3]+1)continue;var l=DM.pnlToLocal(bb,wp);
  if(dirW){var t=bb.yaw*Math.PI/180,c=Math.cos(t),s=Math.sin(t),ld=[dirW[0]*c-dirW[2]*s,dirW[1],dirW[0]*s+dirW[2]*c];l=[l[0]+ld[0]*0.05,l[1]+ld[1]*0.05,l[2]+ld[2]*0.05];}
  var f=DM.pnlFind(bb,l);if(f){b=bb;pn=f;lp=l;}}
 DM.PNL.last={wp:wp.map(function(v){return +v.toFixed(2);}),b:b&&b.id,pn:pn&&pn.id};if(!pn)return null;DM.pnlDamage(tw,b,pn,dmg==null?DM.PNL.BULLET:dmg,wp,kind||'bullet');return pn;};
// explosion: every panel within radius takes falloff damage (splash reaches neighbours across walls/rows)
DM.explode=function(tw,wp,radius,dmg){radius=radius||3.5;dmg=dmg||400;var hit=[];(tw.buildings||[]).forEach(function(b){if(!b.pnl)return;var r=b.rect;if(wp[0]<r[0]-radius||wp[0]>r[2]+radius||wp[2]<r[1]-radius||wp[2]>r[3]+radius)return;
  var lp=DM.pnlToLocal(b,wp);b.pnl.list.forEach(function(pn){if(pn.broken)return;var dx=Math.max(0,Math.abs(lp[0]-pn.lp[0])-pn.ls[0]/2),dy=Math.max(0,Math.abs(lp[1]-pn.lp[1])-pn.ls[1]/2),dz=Math.max(0,Math.abs(lp[2]-pn.lp[2])-pn.ls[2]/2),d=Math.hypot(dx,dy,dz);
   if(d<radius){DM.pnlDamage(tw,b,pn,dmg*(1-d/radius),DM.pnlToWorld(b,pn.lp),'explosion');hit.push(pn.id);}});});
 var T=TacticalCommon.ns(tw.app),F=T.combat&&T.combat.fx;if(F&&typeof TacticalNS!=='undefined'){try{for(var i=0;i<4;i++)TacticalNS.impactFx(F,[wp[0]+(i-1.5)*0.4,wp[1]+0.2,wp[2]],[0,1,0],true);}catch(e){}}
 return hit;};
DM.pnlDamage=function(tw,b,pn,dmg,wp,kind){if(pn.broken||!b.pnl)return;pn.hp-=dmg;if(pn.hp<=0)DM.pnlBreak(tw,b,pn,wp,kind);};
DM.pnlDirtyB=[];
DM.pnlBreak=function(tw,b,pn,wp,kind){var S=b.pnl;pn.broken=true;pn.hp=0;S.broken++;DM.PNL.stats.breaks++;
 (S.ranges[pn.id]||[]).forEach(function(r){var mi=S.mis[r[0]],P=mi&&mi.pnlP;if(!P)return;var x=P[r[1]*3],y=P[r[1]*3+1],z=P[r[1]*3+2];for(var v=r[1];v<r[1]+r[2];v++){P[v*3]=x;P[v*3+1]=y;P[v*3+2]=z;}S.dirtyMesh[r[0]]=1;});
 S.dirtyRun[pn.origRun]=1;S.dirtyWall[pn.wall]=1;if(DM.pnlDirtyB.indexOf(b)<0)DM.pnlDirtyB.push(b);DM.pnlBrokenDirty=true;
 var T=TacticalCommon.ns(tw.app),F=T.combat&&T.combat.fx;if(F&&typeof TacticalNS!=='undefined'){try{var w=wp||DM.pnlToWorld(b,pn.lp);TacticalNS.impactFx(F,w,[0,1,0],true);TacticalNS.impactFx(F,[w[0],w[1]-0.3,w[2]],[0,0.5,0],true);}catch(e){}}};
// open columns of a wall between floor+0.2 and floor+HOLE_H (0.1 m steps); orig=true -> every panel counts as intact
DM.pnlColumns=function(L,orig){if(!L.length)return null;var a0=1e9,a1=-1e9,fy=L[0].floorY;L.forEach(function(p){a0=Math.min(a0,p.a0);a1=Math.max(a1,p.a1);});
 var cols=[];for(var a=a0+0.05;a<a1;a+=0.1){var open=true;for(var y=fy+0.2;y<=fy+DM.PNL.HOLE_H+0.001&&open;y+=0.2){for(var i=0;i<L.length;i++){var p=L[i];if((orig||!p.broken)&&a>=p.a0&&a<=p.a1&&y>=p.y0&&y<=p.y1){open=false;break;}}}cols.push(open);}
 return {a0:a0,cols:cols};};
DM.pnlHoles=function(tw,b,wall){var S=b.pnl,L=S.walls[wall],cur=DM.pnlColumns(L,false),org=S.orig[wall],out=[];if(!cur)return out;
 var i=0;while(i<cur.cols.length){if(!cur.cols[i]){i++;continue;}var j=i,fresh=false;while(j<cur.cols.length&&cur.cols[j]){if(!org.cols[j])fresh=true;j++;}
  var w=(j-i)*0.1;if(fresh&&w>=DM.PNL.HOLE_W-0.001){var h={a0:cur.a0+i*0.1,a1:cur.a0+j*0.1},pr=out[out.length-1];if(pr&&h.a0-pr.a1<0.35)pr.a1=h.a1;else out.push(h);}i=j;}
 return out;};
DM.pnlSyncPortals=function(tw,b,wall){var S=b.pnl,L=S.walls[wall],ref=L[0],g=b.graph,holes=DM.pnlHoles(tw,b,wall),old=S.holes[wall]||[],out=[];
 var same=function(a,c){return Math.abs(a.a0-c.a0)<0.05&&Math.abs(a.a1-c.a1)<0.05;};if(holes.length===old.length&&holes.every(function(h,i){return same(h,old[i]);}))return;
 var roomAt=function(p){if(!g)return null;var r=g.rooms.find(function(r){var B=r.bounds;return !r.isOutdoor&&p[0]>=B.min[0]&&p[0]<=B.max[0]&&p[2]>=B.min[2]&&p[2]<=B.max[2]&&p[1]>=B.min[1]-0.3&&p[1]<=B.max[1];});return r?r.id:('B'+b.id+'_Outside');};
 var bump=function(){if(tw.roomGraph)tw.roomGraph.portalStateVersion=(tw.roomGraph.portalStateVersion||0)+1;return tw.roomGraph?tw.roomGraph.portalStateVersion:0;};
 holes.forEach(function(h,i){var prev=old[i],id=prev?prev.portal.id:('B'+b.id+'_PNLH_'+wall+'_'+i);
  var am=(h.a0+h.a1)/2,dm=am-(ref.a0+ref.a1)/2,lp=[ref.lp[0]+ref.dir[0]*dm,ref.floorY+0.9,ref.lp[2]+ref.dir[1]*dm],nL=[ref.dir[1],0,-ref.dir[0]];
  var c=DM.pnlToWorld(b,lp),pa=DM.pnlToWorld(b,[lp[0]+nL[0]*1.0,lp[1],lp[2]+nL[2]*1.0]),pb=DM.pnlToWorld(b,[lp[0]-nL[0]*1.0,lp[1],lp[2]-nL[2]*1.0]),ra=roomAt(pa),rb=roomAt(pb),wn=DM.pnlToWorld(b,[nL[0],0,nL[2]]);
  var portal={id:id,kind:'breach',rooms:[ra,rb],center:c.map(function(v){return +v.toFixed(2);}),normal:[+(wn[0]-b.x).toFixed(3),0,+(wn[2]-b.z).toFixed(3)],width:+(h.a1-h.a0).toFixed(2),height:DM.PNL.HOLE_H,
   isOpen:true,openFraction:1,panelMaterial:null,breakable:false,lockable:false,exterior:ra.indexOf('Outside')>=0||rb.indexOf('Outside')>=0,broken:true,source:'panels',wall:wall,
   panels:L.filter(function(p){return p.broken&&p.a1>h.a0&&p.a0<h.a1;}).map(function(p){return p.id;})};
  if(g){g.portals=g.portals.filter(function(p){return p.id!==id;});g.portals.push(portal);}out.push({a0:h.a0,a1:h.a1,portal:portal});
  if(prev&&same(prev,h))return;if(!prev)DM.PNL.stats.holes++;
  tw.app.fire('portal:changed',{portalId:id,buildingId:'B'+b.id,isOpen:true,openFraction:1,broken:true,added:!prev,kind:'breach',rooms:portal.rooms,center:portal.center,width:portal.width,height:portal.height,panels:portal.panels,portalStateVersion:bump()});});
 old.slice(holes.length).forEach(function(o){if(g)g.portals=g.portals.filter(function(p){return p.id!==o.portal.id;});tw.app.fire('portal:changed',{portalId:o.portal.id,buildingId:'B'+b.id,removed:true,isOpen:false,portalStateVersion:bump()});});
 S.holes[wall]=out;DM.pnlNavPending=true;};
DM.pnlCluster=function(tw,b){var T=TacticalCommon.ns(tw.app),P=T.perception;if(!P||!P.blockers)return null;var nm='town building '+b.id;for(var i=0;i<P.blockers.length;i++)if(P.blockers[i].cluster&&P.blockers[i].name===nm)return P.blockers[i];return null;};
DM.pnlCollision=function(tw,b,run){var S=b.pnl,e=b.entity,C=TacticalCommon;if(!e)return;var cl=DM.pnlCluster(tw,b);
 e.children.filter(function(c){return c.pnlRun===run;}).forEach(function(c){if(cl){var sh=c.pnlShape||C.shape(c),k=cl.children.findIndex(function(q){return q.entity===c||q===sh||(Math.abs(q.center.x-sh.center.x)<1e-3&&Math.abs(q.center.y-sh.center.y)<1e-3&&Math.abs(q.center.z-sh.center.z)<1e-3&&Math.abs(q.half[0]-sh.half[0])<1e-3&&Math.abs(q.half[1]-sh.half[1])<1e-3&&Math.abs(q.half[2]-sh.half[2])<1e-3);});if(k>=0)cl.children.splice(k,1);}c.destroy();});
 var ps=S.list.filter(function(p){return p.origRun===run&&!p.broken;}).map(function(p){return {p:p.lp,s:p.ls,r:[0,0,0],tag:p.tag,role:p.role,edge:p.edge,a0:p.a0,a1:p.a1,run:p.run,noSight:p.noSight};});
 var T0=TacticalCommon.ns(tw.app),spacing=DM.TT.CONFIG.coverSpacing;DM.TT.mergeTags(ps).forEach(function(p,i){var n=new pc.Entity(p.role+' pnl '+i);n.tags.add('tactical:'+p.tag);if(p.noSight)n.tags.add('no-sight');n.townGroup=b.id;n.coverSpacing=spacing;n.pnlRun=run;
  n.setLocalPosition(p.p[0],p.p[1],p.p[2]);n.setLocalEulerAngles(0,0,0);n.setLocalScale(p.s[0],p.s[1],p.s[2]);e.addChild(n);if(cl&&!p.noSight){var sh=C.shape(n);sh.kind=p.tag;n.pnlShape=sh;cl.children.push(sh);}});
 if(cl&&T0)T0.perception.blockerCount=T0.perception.blockers.reduce(function(a,s){return a+(s.children?s.children.length:1);},0);};
DM.pnlStructure=function(tw,b){var S=b.pnl;if(S.collapsing)return null;var g={};S.list.forEach(function(p){if(!p.ext)return;var k='s'+p.shell+'k'+p.k,G=g[k]=g[k]||{n:0,br:0};G.n+=p.ls[1]*(p.a1-p.a0);if(p.broken)G.br+=p.ls[1]*(p.a1-p.a0);});
 var hit=Object.keys(g).find(function(k){return g[k].n>0&&g[k].br/g[k].n>=DM.PNL.COLLAPSE;});if(!hit)return null;
 S.collapsing=true;DM.PNL.stats.collapses++;S.collapsedSection=hit;tw.app.fire('panels:collapse',{buildingId:'B'+b.id,section:hit});
 setTimeout(function(){tw.setState(b.id,'collapsed').catch(function(e){console.error('panel collapse failed',e);});},0);return hit;};
DM.pnlBrokenMesh=function(tw){var t0=performance.now(),pieces=[];(tw.buildings||[]).forEach(function(b){var S=b.pnl;if(!S||!S.broken)return;
  S.list.forEach(function(pn){if(!pn.broken)return;var R=DM.pnlRng(pn.id),w=pn.a1-pn.a0,h=pn.y1-pn.y0,t=pn.alongX?pn.ls[2]:pn.ls[0];
   var put=function(da,dy,sa,sy,st,dn){var lp=[pn.lp[0]+pn.dir[0]*da+(pn.alongX?0:dn||0),pn.lp[1]+dy,pn.lp[2]+pn.dir[1]*da+(pn.alongX?(dn||0):0)],wp=DM.pnlToWorld(b,lp);
    pieces.push({p:wp,s:pn.alongX?[sa,sy,st]:[st,sy,sa],r:[0,b.yaw,0],m:pn.m,vis:true});};
   var side=function(dirA,dirY){return pn.nb.some(function(i){var q=S.list[i];if(q.broken)return false;if(dirA)return dirA>0?Math.abs(q.a0-pn.a1)<0.03:Math.abs(q.a1-pn.a0)<0.03;return dirY>0?Math.abs(q.y0-pn.y1)<0.03:Math.abs(q.y1-pn.y0)<0.03;});};
   // jagged lips along every edge that still meets an intact panel
   [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(sd){if(!side(sd[0],sd[1]))return;for(var i=0;i<3;i++){var dep=0.06+R()*0.16,f=(i+0.5)/3;
     if(sd[0])put(sd[0]*(w/2-dep/2),(f-0.5)*h,dep,h/3*(0.7+R()*0.5),t*(0.6+R()*0.4),0);else put((f-0.5)*w,sd[1]*(h/2-dep/2),w/3*(0.7+R()*0.5),dep,t*(0.6+R()*0.4),0);}});
   // rubble on the floor under the panel, both faces
   if(pn.y0-pn.floorY<1.2)for(var i=0;i<3;i++){var sz=0.14+R()*0.18;put((R()-0.5)*w*0.8,-(pn.lp[1]-pn.floorY)+sz/2,sz*1.4,sz,sz,(R()<0.5?-1:1)*(t/2+0.12+R()*0.3));}});});
 var ent=DM.pnlBrokenEnt;if(ent&&(!ent.parent||ent.parent!==tw.root)){ent=null;}
 if(!ent){ent=new pc.Entity('panel damage');ent.addComponent('render',{type:'asset',castShadows:true,receiveShadows:true});tw.root.addChild(ent);DM.pnlBrokenEnt=ent;}
 var old=ent.render.meshInstances||[];ent.render.meshInstances=pieces.length?tw.buildMeshes(pieces):[];old.forEach(function(mi){try{mi.mesh.destroy();}catch(e){}});
 var ms=performance.now()-t0;DM.PNL.stats.brokenRebuildMaxMs=Math.max(DM.PNL.stats.brokenRebuildMaxMs,+ms.toFixed(2));};
// once per frame: re-upload changed building meshes, re-merge collision rows, check holes + supports, rebuild the broken mesh
DM.pnlFlush=function(tw){var tm=DM.PNL.tm||(DM.PNL.tm={mesh:0,coll:0,holes:0,broken:0});if(!DM.pnlDirtyB.length&&!DM.pnlBrokenDirty&&!DM.pnlNavPending)return;var t0=performance.now(),T=TacticalCommon.ns(tw.app),coll=false;
 var list=DM.pnlDirtyB;DM.pnlDirtyB=[];
 list.forEach(function(b){var S=b.pnl;if(!S||!b.entity)return;
  var q0=performance.now();Object.keys(S.dirtyMesh).forEach(function(i){var mi=S.mis[i];if(mi&&mi.pnlP){mi.mesh.setPositions(mi.pnlP);mi.mesh.update();}});S.dirtyMesh={};tm.mesh=Math.max(tm.mesh,performance.now()-q0);q0=performance.now();
  if(S.collapsing){S.dirtyRun={};S.dirtyWall={};return;}
  var runs=Object.keys(S.dirtyRun);for(var ri=0;ri<runs.length;ri++){if(performance.now()-t0>6&&ri>0){if(DM.pnlDirtyB.indexOf(b)<0)DM.pnlDirtyB.push(b);break;}DM.pnlCollision(tw,b,runs[ri]);delete S.dirtyRun[runs[ri]];coll=true;}tm.coll=Math.max(tm.coll,performance.now()-q0);q0=performance.now();
  Object.keys(S.dirtyWall).forEach(function(w){DM.pnlSyncPortals(tw,b,w);});S.dirtyWall={};tm.holes=Math.max(tm.holes,performance.now()-q0);
  DM.pnlStructure(tw,b);});
 /* perception clusters are patched per building in pnlCollision (a full refresh costs ~6+ ms) */
 if(DM.pnlBrokenDirty){DM.pnlBrokenDirty=false;DM.pnlBrokenMesh(tw);}
 if(DM.pnlNavPending&&T.navigation){var now=performance.now();if(!DM.pnlNavAt)DM.pnlNavAt=now+350;/* merge nearby changes into one rebuild */
  if(now>=DM.pnlNavAt){DM.pnlNavPending=false;DM.pnlNavAt=0;T.navigation.rebuild('panels: new breach hole');}}
 var ms=performance.now()-t0;DM.PNL.stats.flushes++;DM.PNL.stats.flushMaxMs=Math.max(DM.PNL.stats.flushMaxMs,+ms.toFixed(2));};
// bullets: wrap TacticalCombat.fireRay, capture its world ray + entity test, and damage the panel when the wall was the hit
DM.pnlHook=function(tw){if(DM.pnlHooked)return;DM.pnlHooked=true;
 tw.app.on('update',function(){if(tw.carentan)DM.pnlFlush(tw);});
 tw.app.on('explosion',function(p,r,d){if(tw.carentan)DM.explode(tw,p,r,d);});
 if(typeof TacticalCombat==='undefined'||!TacticalCombat.prototype.fireRay)return;var orig=TacticalCombat.prototype.fireRay;
 TacticalCombat.prototype.fireRay=function(shooter,origin,dir,muzzle,tracer){if(!tw.carentan)return orig.apply(this,arguments);
  var C=TacticalCommon,NS=TacticalNS,rw=C.rayWorld,re=NS.rayEntities,cap={w:undefined,e:undefined};
  C.rayWorld=function(){var r=rw.apply(this,arguments);if(cap.w===undefined)cap.w=r||null;return r;};
  NS.rayEntities=function(){var r=re.apply(this,arguments);if(cap.e===undefined)cap.e=r||null;return r;};
  var res;try{res=orig.apply(this,arguments);}finally{C.rayWorld=rw;NS.rayEntities=re;}
  if(cap.w&&!cap.e){var t=cap.w.t,p=[origin[0]+dir[0]*t,origin[1]+dir[1]*t,origin[2]+dir[2]*t];var dmg=DM.PNL.BULLET*((shooter&&shooter.arms&&shooter.arms.def&&shooter.arms.def.wallDmg)||1);DM.hitAt(tw,p,dmg,dir,'bullet');}
  return res;};};
if(typeof window!=='undefined')window.DreadingMap=DM;if(typeof globalThis!=='undefined')globalThis.DreadingMap=DM;})();
