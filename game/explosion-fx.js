/* DREADING explosion + smoke FX (AI-MERGE sandbox), v2 "layered VDB flipbooks".
   Source: Cody's LazyVFX Explosion_Animated / Smoke_Animated_Loop VDBs, re-baked in Blender (Cycles) from the GAME camera angle
   (60 deg down = tacticalRtsInput.homePitch) by bake_vdb.py into SEPARATE layers per explosion:
     body  = scattered-light smoke/fireball body, premultiplied alpha (fx/explosions/<v>/<v>_body.png, 2048x1024, 8x4 x 256 px)
     fire  = emission only (additive, black background)        (fx/explosions/<v>/<v>_fire.jpg, 1024x512, 8x4 x 128 px)
   Lighting is baked in (world HDR + sun + fire self-illumination); no normal maps (PlayCanvas particle normal maps need per-pixel lighting
   on every particle, not worth it here).
   Each explosion = a pooled set of BUILT-IN particle emitters, all camera-facing CPU emitters (1 draw call each):
     flash (additive radial core, 0.12 s) + fire flipbook (additive) + body flipbook (premultiplied) + sparks/debris (additive, 10 small particles)
     = 4 draw calls while alive (2 with ?fxLite=1), then a smoke plume from the smoke pool (1 draw call) drifts off the blast.
   plus a pooled ground scorch decal (1 draw call, fades out) and a short omni light (clustered lighting: no shader rebuild, no shadows).
   Pool cap 6 explosions (7th recycles the oldest), 8 scorch decals, 6 smoke plumes.
   Variants (v3): all 20 explosion variants are reachable. 4 are preloaded; any other is loaded on demand (one body + one fire PNG) and kept
   in an LRU texture cache (CFG.texCap, default 9 incl. smoke; evicted textures are destroyed unless a pool slot still uses them).
   Gameplay blasts pick a random variant from ALL 20, never one of the last 4 used; if it is not loaded yet the blast uses a random loaded
   one immediately and (about 1 blast in 3, one fetch at a time) the new one is fetched for later, so all 20 rotate in during play. Explicit picks (?fxVariant=7 or explosion_07,
   the FX panel dropdown, FX.spawn(p, r, {variant: 7})) wait for the load. A slot is re-bound to another variant by swapping its
   colorMap/animTiles (one cheap 1-particle emitter rebuild); slots already bound to the wanted variant are preferred.
   FX panel: F8 toggles it anywhere (shown at start with ?fxPanel=1, ?explosionTest=1 or ?smokeTest=1): explosion dropdown (Random or 01-20),
   Fire, Fire all 6 (six DIFFERENT variants), Real blast, Repeat, smoke dropdown, Smoke plume, Burning block, Clear.
   Smoke (v3.1): a billowing PLUME, not a column: up to 10 staggered particles per emitter (still 1 draw call), each born small and
   dense at the ground source, rising, spreading and drifting downwind (one wind direction per session) while growing ~4.5x and fading
   (bigger + softer toward the top); no spin (the old single long-lived column particle + slow spin read as a tornado).
   Default smoke = smoke_ns01 (Cody's smoke-loop-01) in its ORIGINAL baked orientation: narrow at the ground, widening/billowing
   toward the top from the 60 deg camera. bake\smoke_soften.py blurs its edges (premultiplied) and fades its ground contact.
   smoke_01 and 16-19 (texture streams downward) are only used when picked explicitly. Building collapses (app 'panels:collapse') and every blast use it.
   Hooks: app.fire('explosion', pos, radius, dmg) and window.DreadingExplosionFX.spawn(pos, radius) (sandbox.js blast()).
   Soft particles opt-in ?fxSoft=1 (needs scene depth map). */
(function () {
'use strict';
var Q = location.search;
function qp(k) { var m = new RegExp('[?&]' + k + '=([^&]*)').exec(Q); return m ? decodeURIComponent(m[1]) : null; }
var CFG = {
  manifest: 'fx/fx-manifest.json',
  pool: 6, decals: 8, smokePool: 6,
  variants: qp('fxVariants') === 'all' ? 6 : Math.max(1, Math.min(6, +qp('fxVariants') || 4)),   // PRELOADED at start; the rest load on demand
  texCap: Math.max(8, +qp('fxTexCap') || 9),   // loaded variants kept (LRU, explosions + smoke); ~14 MB GPU per explosion variant
  recent: 4,                                   // random picks never repeat one of the last 4 variants
  prefetch: 0.35,                              // chance a gameplay blast fetches a not-yet-loaded variant for later
  forceVariant: qp('fxVariant'), smokeVariant: qp('smokeVariant') || 'smoke_ns01',
  smokeDefaults: ['smoke_ns01'],               // Cody's loop, flipped upright; others via the panel or ?smokeVariant=
  smokeAvoid: { smoke_01: 'plain column', smoke_16: 'streams down', smoke_17: 'streams down', smoke_18: 'streams down', smoke_19: 'streams down' },
  // plume particles: born small + dense at the source, then rise, spread and grow ~4.5x while fading (bigger + softer at the top).
  // rise must outpace the growth of each quad's narrow lower half (the baked ground point sits 40% below the quad centre and,
  // from the 60 deg camera, world-up shows at only ~0.5x on screen), so the tips never sink below the source.
  plume: { life: 9, rate: [0.75, 1.15], particles: 10, rise: 0.15, drift: 0.05, grow: [0.3, 0.78, 1.35], tiltDeg: 6,
    alpha: [0, 0, 0.08, 0.78, 0.4, 0.5, 0.75, 0.22, 1, 0] },
  smokeTint: +(qp('smokeTint') || 0.55),   // battlefield smoke: darken the white studio-lit loops (premultiplied: scale rgb only)
  // look spec 6: the Low quality tier uses the lite path too (?fxLite=0 forces full); same tier key as DreadingLook
  lite: qp('fxLite') === '1' || (qp('fxLite') !== '0' && (qp('quality') === 'low' || (!qp('quality') && (function () { try { return localStorage.getItem('dreading.quality') === 'low'; } catch (e) { return false; } })()))),
  life: 1.9,               // s per explosion flipbook (all variants share it: changing lifetime would rebuild the emitter)
  plumePerRadius: 1.6,     // visible plume width (m) per metre of blast radius (r 7 -> ~11 m wide fireball/smoke)
  minSize: 6, maxSize: 30, scaleJitter: [0.88, 1.15], spinDegPerSec: 0, rise: 0.12, grow: [0.94, 1.08],
  bodyFade: 0.82,          // body starts fading at 82% of life
  light: { color: [1, 0.62, 0.32], intensity: 4, life: 0.18, rangePerRadius: 2.5 },
  scorch: { life: 28, sizePerRadius: 1.5, opacity: 0.8 },
  linger: { minRadius: 6, life: 18, shortLife: 6, collapseLife: 40 },   // post-blast plume: big blasts 18 s, small 6 s; collapses 40 s
  pull: 0.25,              // anchored quads are pulled 25% of the way toward the camera and shrunk by the same factor:
                           // identical on screen, but the lower half no longer cuts into the ground (no soft-particle depth pass needed)
  softness: qp('fxSoft') === '1' ? 1.5 : 0
};
// Town-hall presentation: faster detonation, compact blast, restrained lingering glow.
if(qp('showcase')==='1'){
 CFG.life=1.9;CFG.plumePerRadius=1.05;CFG.minSize=2.8;CFG.maxSize=18;
 CFG.spinDegPerSec=0;CFG.rise=.18;CFG.grow=[.88,1.04];CFG.bodyFade=.65;
 CFG.light.life=.18;CFG.light.intensity=5;CFG.light.rangePerRadius=1.8;
 CFG.scorch.sizePerRadius=.9;CFG.linger.life=8;CFG.linger.shortLife=4;
}
var PK = 1 - CFG.pull;
var HALF = 0.5;   // PlayCanvas particle 'scale' is the HALF-size: the quad spans -scale..+scale (verified in engine 2.23 + headless test)
var FX = window.DreadingExplosionFX = {
  CFG: CFG,
  ready: false, error: null, cfg: CFG, pool: [], decals: [], smokes: [], variants: [], smokeVariants: [], all: [], allSmoke: [], loaded: [],
  recent: [], history: [], active: 0, spawned: 0, recycled: 0, rebinds: 0, evicted: 0, depthRequested: false, panelVisible: false,
  spawn: function () { return null; }, smoke: function () { return null; }, clear: function () {}
};
var testX = qp('explosionTest') === '1', testS = qp('smokeTest') === '1', showPanel = testX || testS || qp('fxPanel') === '1';

function curve(p) { return new pc.Curve(p); }
function curveSet(r, g, b) { return new pc.CurveSet([r, g, b]); }
var ZERO3 = function () { return curveSet([0, 0], [0, 0], [0, 0]); };
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function base(o) {
  var b = {
    autoPlay: false, loop: false, numParticles: 1, lifetime: CFG.life, rate: 0, rate2: 0,
    startAngle: 0, startAngle2: 0, emitterShape: pc.EMITTERSHAPE_BOX, emitterExtents: new pc.Vec3(0, 0, 0),
    localSpace: false, preWarm: false, lighting: false, halfLambert: false, alignToMotion: false, stretch: 0,
    sort: pc.PARTICLESORT_DISTANCE /* forces the CPU emitter path: no GPU simulation passes (~7 extra draw calls per GPU emitter) */,
    orientation: pc.PARTICLEORIENTATION_SCREEN, depthWrite: false, depthSoftening: CFG.softness,
    blendType: pc.BLEND_NORMAL, animTilesX: 1, animTilesY: 1, animNumFrames: 1, animStartFrame: 0, animSpeed: 1, animLoop: false,
    scaleGraph: curve([0, 1]), scaleGraph2: curve([0, 1]),
    velocityGraph: ZERO3(), velocityGraph2: ZERO3(), localVelocityGraph: ZERO3(), localVelocityGraph2: ZERO3(),
    rotationSpeedGraph: curve([0, 0]), rotationSpeedGraph2: curve([0, 0]),
    alphaGraph: curve([0, 1]), colorGraph: curveSet([0, 1], [0, 1], [0, 1])
  };
  for (var k in o) b[k] = o[k];
  return b;
}
// --- emitter recipes (exported for tests) ---
var fade = function (t0) { return [0, 1, t0, 1, 1, 0]; };
var R = FX.recipes = {
  body: function (v) { return base({ localSpace: true, colorMap: v.bodyTex, blendType: pc.BLEND_PREMULTIPLIED, animTilesX: v.cols, animTilesY: v.rows, animNumFrames: v.frames,
    alphaGraph: curve(fade(CFG.bodyFade)), colorGraph: curveSet(fade(CFG.bodyFade), fade(CFG.bodyFade), fade(CFG.bodyFade)) /* premultiplied: fade rgb with alpha */ }); },
  fire: function (v) { return base({ localSpace: true, colorMap: v.fireTex, blendType: pc.BLEND_ADDITIVE, animTilesX: v.fcols, animTilesY: v.frows, animNumFrames: v.frames,
    alphaGraph: curve([0, 0.45, 0.18, 0.28, 0.5, 0.06, 1, 0]), colorGraph: curveSet([0, 1], [0, 0.82], [0, 0.62]) }); },   // the body is already fire-lit: keep the additive core modest
  flash: function (g) { return base({ colorMap: g, blendType: pc.BLEND_ADDITIVE, lifetime: 0.12,
    alphaGraph: curve([0, 0.45, 0.3, 0.18, 1, 0]), colorGraph: curveSet([0, 1], [0, 0.8], [0, 0.5]) }); },
  sparks: function (g) { return base({ colorMap: g, blendType: pc.BLEND_ADDITIVE, numParticles: 10, lifetime: 0.65, rate: 0, rate2: 0.008,
    emitterShape: pc.EMITTERSHAPE_SPHERE, emitterRadius: 0.25, alignToMotion: true, stretch: 0,
    velocityGraph: curveSet([0, -6, 1, -2], [0, 4, 1, -5], [0, -6, 1, -2]), velocityGraph2: curveSet([0, 6, 1, 2], [0, 9, 1, -3], [0, 6, 1, 2]),
    scaleGraph: curve([0, 0.025, 1, 0.004]), scaleGraph2: curve([0, 0.045, 1, 0.008]),
    alphaGraph: curve([0, 1, 0.6, 0.9, 1, 0]), colorGraph: curveSet([0, 1, 1, 1], [0, 0.85, 1, 0.35], [0, 0.5, 1, 0.08]) }); },
  // smoke plume: staggered particles that rise, drift downwind, grow and fade (no rotation speed: no tornado spin)
  plume: function (s) { var P = CFG.plume, k = CFG.smokeTint, c = P.alpha.map(function (v, i) { return i % 2 ? v * k : v; });
    return base({ localSpace: true, colorMap: s.bodyTex, blendType: pc.BLEND_PREMULTIPLIED, loop: true, numParticles: P.particles,
      lifetime: P.life, rate: P.rate[0], rate2: P.rate[1], startAngle: -P.tiltDeg, startAngle2: P.tiltDeg,
      animTilesX: s.cols, animTilesY: s.rows, animNumFrames: s.frames, animLoop: true, animSpeed: P.life / s.sourceSeconds /* real-time loop */,
      alphaGraph: curve(P.alpha), colorGraph: curveSet(c, c, c.map(function (v, i) { return i % 2 ? v * 0.97 : v; })) /* premultiplied: rgb follows alpha */ }); }
};

function makeEmitter(parent, name, opts) { var e = new pc.Entity(name); parent.addChild(e); e.addComponent('particlesystem', opts); return e; }
function setCurve(ps, k, v) { ps[k] = curve(v); ps[k + '2'] = curve(v); }

// --- procedural shared textures (one each, tiny) ---
function canvasTex(device, n, draw, name) {
  var c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n);
  var t = new pc.Texture(device, { name: name, width: n, height: n, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
  t.setSource(c); return t;
}
function glowTex(device) {
  return canvasTex(device, 64, function (g, n) { var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,240,210,0.8)'); r.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n); }, 'fx-glow');
}
function scorchTex(device) {
  return canvasTex(device, 128, function (g, n) {
    var r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,255,255,0.95)'); r.addColorStop(0.45, 'rgba(255,255,255,0.7)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, n, n);
    g.globalCompositeOperation = 'destination-out';           // ragged edge + speckle
    for (var i = 0; i < 140; i++) { var a = Math.random() * 6.283, d = n * (0.22 + Math.random() * 0.3), s = 2 + Math.random() * 7;
      g.beginPath(); g.arc(n / 2 + Math.cos(a) * d, n / 2 + Math.sin(a) * d, s, 0, 6.283); g.fillStyle = 'rgba(0,0,0,' + (0.3 + Math.random() * 0.5) + ')'; g.fill(); }
  }, 'fx-scorch');
}

function loadTex(app, url, cb) {
  var a = new pc.Asset(url, 'texture', { url: url }, { mipmaps: true, anisotropy: 1 });
  app.assets.add(a);
  a.once('load', function () { var t = a.resource; t.addressU = t.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
    t.minFilter = pc.FILTER_LINEAR_MIPMAP_LINEAR; t.magFilter = pc.FILTER_LINEAR; cb(null, t, a); });
  a.once('error', function (e) { cb(e, null, a); });
  app.assets.load(a);
}
function getJSON(url, cb) {
  var x = new XMLHttpRequest(); x.open('GET', url); x.onload = function () { try { cb(x.status < 400 ? null : 'HTTP ' + x.status, JSON.parse(x.responseText)); } catch (e) { cb(e); } };
  x.onerror = function () { cb('network'); }; x.send();
}
// manifest entry -> variant descriptor
function variant(m, dir) {
  return { name: m.name, kind: m.kind, cols: m.body.cols, rows: m.body.rows, frames: m.body.frames,
    bodyUrl: dir + '/' + m.body.file, fireUrl: m.fire ? dir + '/' + m.fire.file : null,
    fcols: m.fire ? m.fire.cols : 0, frows: m.fire ? m.fire.rows : 0,
    ground: m.groundUV, plumeWidth: Math.max(0.2, m.plumeWidth || 0.9), sourceSeconds: m.sourceSeconds || 4, orient: m.orient || null,
    num: +(String(m.name).match(/(\d+)$/) || [0, 0])[1], bodyTex: null, fireTex: null, assets: [], used: 0, loading: false, failed: false, cbs: [] };
}

function init() {
  var t = window.tactical;
  if (!t || !t.T || !t.T.ready || !t.T.camera) return false;
  var app = t.app, T = t.T, cam = T.camera, dev = app.graphicsDevice;
  status('Loading manifest…');
  getJSON(CFG.manifest, function (err, man) {
    if (err || !man) { FX.error = 'manifest: ' + err; console.error('[ExplosionFX] ' + FX.error); status(FX.error); return; }
    var ex = man.explosions.map(function (m) { return variant(m, 'fx/explosions/' + m.name); });
    var sm = man.smoke.map(function (m) { return variant(m, 'fx/smoke/' + m.name); });
    FX.all = ex; FX.allSmoke = sm;
    FX.catalog = { explosions: ex.map(function (v) { return v.name; }), smoke: sm.map(function (v) { return v.name; }) };
    var forced = resolveVar(CFG.forceVariant), pick = forced ? [forced] : [];
    shuffle(ex.slice()).forEach(function (v) { if (pick.length < Math.min(CFG.variants, ex.length) && pick.indexOf(v) < 0) pick.push(v); });
    var smokeV = resolveSmoke(CFG.smokeVariant) || sm.filter(function (v) { return CFG.smokeDefaults.indexOf(v.name) >= 0; })[0] || sm[0] || null;
    var all = pick.concat(smokeV ? [smokeV] : []), left = all.length;
    all.forEach(function (v) { loadVariant(v, function () {
      if (--left === 0) build(pick.filter(function (q) { return q.bodyTex; }), smokeV && smokeV.bodyTex ? smokeV : null); }); });
  });
  // --- variant lookup / on-demand loading / LRU cache ---
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function resolveVar(x) { if (x == null || x === '') return null; var n = String(x).trim();
    if (/^\d+$/.test(n)) n = 'explosion_' + pad2(+n);
    return FX.all.filter(function (v) { return v.name === n; })[0] || null; }
  function resolveSmoke(x) { if (x == null || x === '') return null; var n = String(x).trim();
    if (/^\d+$/.test(n)) n = 'smoke_' + pad2(+n); else if (/^ns\d+$/.test(n)) n = 'smoke_' + n;
    return FX.allSmoke.filter(function (v) { return v.name === n; })[0] || null; }
  function bound(v) { return FX.pool.some(function (x) { return x.v === v; }) || FX.smokes.some(function (q) { return q.v === v; }); }
  function dispose(v) {
    v.assets.forEach(function (a) { try { app.assets.remove(a); a.unload(); } catch (e) { /* already gone */ } });
    v.assets = []; v.bodyTex = v.fireTex = null; var i = FX.loaded.indexOf(v); if (i >= 0) FX.loaded.splice(i, 1);
  }
  function evict() {
    var spare = FX.loaded.filter(function (v) { return !bound(v) && !v.cbs.length; }).sort(function (a, b) { return a.used - b.used; });
    for (var i = 0; FX.loaded.length > CFG.texCap && i < spare.length; i++) { dispose(spare[i]); FX.evicted++; }
  }
  function loadVariant(v, cb) {
    v.used = performance.now();
    if (v.bodyTex) { if (cb) cb(v); return; }
    if (v.failed) { if (cb) cb(null); return; }
    if (cb) v.cbs.push(cb);
    if (v.loading) return;
    v.loading = true;
    var urls = [['bodyUrl', 'bodyTex']].concat(v.fireUrl ? [['fireUrl', 'fireTex']] : []), left = urls.length, got = {}, err = null;
    urls.forEach(function (u) { loadTex(app, v[u[0]], function (e, tex, asset) {
      if (asset) v.assets.push(asset);
      if (e) err = err || e; else got[u[1]] = tex;
      if (--left) return;
      v.loading = false;
      if (err) { v.failed = true; console.error('[ExplosionFX] variant ' + v.name + ' failed: ' + err); dispose(v); }
      else { v.fireTex = got.fireTex || null; v.bodyTex = got.bodyTex; FX.loaded.push(v); evict(); }
      var c = v.cbs; v.cbs = []; c.forEach(function (f) { f(err ? null : v); });
    }); });
  }
  FX.load = function (x, cb) { var v = resolveVar(x) || resolveSmoke(x); if (!v) { if (cb) cb(null); return; } loadVariant(v, cb); };
  FX.loadedNames = function () { return FX.loaded.map(function (v) { return v.name; }); };

  function build(vars, smokeV) {
    if (!vars.length) { FX.error = 'no explosion variants loaded'; status(FX.error); return; }
    FX.variants = vars; FX.smokeVariants = smokeV ? [smokeV] : []; FX.smokeVariant = smokeV;
    FX.wind = Math.random() * 6.283;   // one drift direction per session: all plumes lean the same way
    var glow = FX.glowTex = glowTex(dev), sc = FX.scorchTex = scorchTex(dev);
    var root = new pc.Entity('ExplosionFX'); app.root.addChild(root);
    for (var i = 0; i < CFG.pool; i++) {
      var v = vars[i % vars.length], e = new pc.Entity('ExplosionFX ' + i); root.addChild(e); e.enabled = false;
      var x = { e: e, v: v, p: [0, 0, 0], size: 8, age: 1e9, alive: false, born: 0, radius: 6, spin: 0 };
      x.q = new pc.Entity('quad'); e.addChild(x.q);       // e stays at the origin; only the quad holder is re-anchored each frame
      x.body = makeEmitter(x.q, 'body', R.body(v));
      x.fire = makeEmitter(x.q, 'fire', R.fire(v.fireTex ? v : { fireTex: glow, fcols: 1, frows: 1, frames: 1 })); x.fire.enabled = !!v.fireTex;
      if (!CFG.lite) {
        x.flash = makeEmitter(e, 'flash', R.flash(glow));
        x.sparks = makeEmitter(e, 'sparks', R.sparks(glow));
        var le = new pc.Entity('light'); e.addChild(le);
        le.addComponent('light', { type: 'omni', color: new pc.Color(CFG.light.color[0], CFG.light.color[1], CFG.light.color[2]),
          intensity: 0, range: 20, castShadows: false, affectSpecularity: false });
        le.enabled = false; x.light = le;
      }
      FX.pool.push(x);
    }
    // scorch decals: one shared material, per-instance opacity
    var mat = FX.scorchMat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(0.03, 0.025, 0.02); mat.useLighting = true; mat.gloss = 0.05; mat.metalness = 0; mat.useMetalness = true;
    mat.opacityMap = sc; mat.opacityMapChannel = 'a'; mat.blendType = pc.BLEND_NORMAL; mat.depthWrite = false;
    mat.depthBias = -2; mat.slopeDepthBias = -2; mat.update();
    if (!CFG.lite) for (var d = 0; d < CFG.decals; d++) {
      var de = new pc.Entity('Scorch ' + d); root.addChild(de);
      de.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: true });
      de.enabled = false; FX.decals.push({ e: de, age: 1e9, alive: false, born: 0 });
    }
    if (smokeV) for (var s = 0; s < CFG.smokePool; s++) {
      var se = new pc.Entity('SmokePlume ' + s); root.addChild(se); se.enabled = false;
      FX.smokes.push({ e: se, ps: makeEmitter(se, 'plume', R.plume(smokeV)), v: smokeV, p: [0, 0, 0], size: 10, age: 0, life: 0, alive: false, born: 0, stopping: false });
    }
    FX.ready = true; panelInit();
    status('Ready · variants ' + vars.map(function (v) { return v.name.replace('explosion_', '#'); }).join(' ') + (smokeV ? ' · smoke ' + smokeV.name : ''));
  }

  function setDepth(on) {
    if (!CFG.softness) on = false;
    if (on === FX.depthRequested || !cam.camera || !cam.camera.requestSceneDepthMap) return;
    cam.camera.requestSceneDepthMap(on); FX.depthRequested = on;
  }
  // put a screen-facing quad of 'size' so that its baked ground point (uv, v from top) sits on world point p (+ lift along world up)
  var tmp = new pc.Vec3();
  function anchor(ent, p, size, uv, angDeg, lift) {
    var ox = (uv[0] - 0.5) * size, oy = (0.5 - uv[1]) * size, a = (angDeg || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    var rx = ox * c - oy * s, ry = ox * s + oy * c, r = cam.right, u = cam.up;
    tmp.set(p[0] - r.x * rx - u.x * ry, p[1] + (lift || 0) - r.y * rx - u.y * ry, p[2] - r.z * rx - u.z * ry);
    var eye = cam.getPosition();   // homothety about the eye: same projection, nearer depth
    ent.setPosition(eye.x + (tmp.x - eye.x) * PK, eye.y + (tmp.y - eye.y) * PK, eye.z + (tmp.z - eye.z) * PK);
  }
  function oldest(list) { return list.reduce(function (a, b) { return a.born <= b.born ? a : b; }); }
  function freeOf(list) { var f = list.filter(function (x) { return !x.alive; }); return f.length ? f[Math.floor(Math.random() * f.length)] : null; }

  function notRecent(list) { var f = list.filter(function (v) { return FX.recent.indexOf(v.name) < 0 && !v.failed; }); return f.length ? f : list; }
  function rnd(list) { return list[Math.floor(Math.random() * list.length)]; }
  function bind(x, v) {
    if (x.v === v) return;
    x.v = v; FX.rebinds++;
    var b = x.body.particlesystem; b.colorMap = v.bodyTex; b.animTilesX = v.cols; b.animTilesY = v.rows; b.animNumFrames = v.frames;
    if (v.fireTex) { var f = x.fire.particlesystem; f.colorMap = v.fireTex; f.animTilesX = v.fcols; f.animTilesY = v.frows; f.animNumFrames = v.frames; }
    x.fire.enabled = !!v.fireTex;
  }
  // explicit pick (number, name or descriptor) waits for its textures; random gameplay picks never wait (see header)
  FX.spawn = function (pos, radius, opts) {
    if (!FX.ready || !pos) return null;
    opts = opts || {};
    var want = opts.variant != null ? (opts.variant.name ? opts.variant : resolveVar(opts.variant)) : resolveVar(CFG.forceVariant), v;
    if (want) {
      if (!want.bodyTex) { var r1 = null; loadVariant(want, function (q) { if (q) r1 = FX.spawn(pos, radius, Object.assign({}, opts, { variant: q })); }); return r1; }   // null while loading
      v = want;
    } else {
      v = rnd(notRecent(FX.all));
      if (!v.bodyTex) {
        if (opts.wait) { var r2 = null; loadVariant(v, function (q) { if (q) r2 = FX.spawn(pos, radius, Object.assign({}, opts, { variant: q })); }); return r2; }
        // gameplay never waits: use a loaded variant now; fetch the new one for later at most one at a time, ~1 blast in 3
        // (a fetch = ~1.5 MB of PNG + ~14 MB GPU upload, and an eviction once the cache is full)
        if (Math.random() < CFG.prefetch && !FX.all.some(function (q) { return q.loading; })) loadVariant(v);
        v = rnd(notRecent(FX.loaded.filter(function (q) { return q.kind !== 'smoke'; })));
      }
    }
    v.used = performance.now();
    FX.recent.push(v.name); if (FX.recent.length > CFG.recent) FX.recent.shift();
    FX.history.push(v.name); if (FX.history.length > 200) FX.history.shift();
    var x = FX.pool.filter(function (q) { return !q.alive && q.v === v; })[0] || freeOf(FX.pool);
    if (!x) { x = oldest(FX.pool); FX.recycled++; }
    bind(x, v); FX.last = v.name;
    radius = radius || 6;
    var jit = CFG.scaleJitter[0] + Math.random() * (CFG.scaleJitter[1] - CFG.scaleJitter[0]);
    var size = Math.max(CFG.minSize, Math.min(CFG.maxSize, radius * CFG.plumePerRadius * jit / x.v.plumeWidth));
    x.p = [pos[0], pos[1] || 0, pos[2]]; x.size = size; x.radius = radius; x.age = 0; x.alive = true; x.born = performance.now();
    x.spin = (Math.random() * 2 - 1) * CFG.spinDegPerSec;
    var g = [0, size * CFG.grow[0] * PK * HALF, 1, size * CFG.grow[1] * PK * HALF];
    setCurve(x.body.particlesystem, 'scaleGraph', g); setCurve(x.body.particlesystem, 'rotationSpeedGraph', [0, x.spin]);
    if (x.fire.enabled) { setCurve(x.fire.particlesystem, 'scaleGraph', g); setCurve(x.fire.particlesystem, 'rotationSpeedGraph', [0, x.spin]); }
    x.e.enabled = true; x.q.enabled = true; place(x);
    x.body.particlesystem.reset(); x.body.particlesystem.play();
    if (x.fire.enabled) { x.fire.particlesystem.reset(); x.fire.particlesystem.play(); }
    if (x.flash) { setCurve(x.flash.particlesystem, 'scaleGraph', [0, size * 0.05, 0.3, size * 0.09, 1, size * 0.1]);   // compact, brief core; preserve the detailed baked fire underneath
      x.flash.setPosition(x.p[0], x.p[1] + size * 0.12, x.p[2]); x.flash.particlesystem.reset(); x.flash.particlesystem.play(); }
    if (x.sparks) { x.sparks.setPosition(x.p[0], x.p[1] + 0.6, x.p[2]); x.sparks.particlesystem.reset(); x.sparks.particlesystem.play(); }
    if (x.light) { x.light.light.range = radius * CFG.light.rangePerRadius; x.light.light.intensity = CFG.light.intensity;
      x.light.setPosition(x.p[0], x.p[1] + Math.min(3, radius * 0.4), x.p[2]); x.light.enabled = true; }
    if (FX.decals.length && opts.scorch !== false) scorch(x.p, radius);
    if (FX.smokeVariant && opts.linger !== false && !CFG.lite) FX.smoke(x.p, { life: radius >= CFG.linger.minRadius ? CFG.linger.life : CFG.linger.shortLife, scale: Math.max(0.6, radius / 7), delay: CFG.life * 0.4 });
    FX.spawned++; setDepth(true);
    return x;
  };
  function scorch(p, radius) {
    var d = freeOf(FX.decals) || oldest(FX.decals), s = radius * CFG.scorch.sizePerRadius * (0.85 + Math.random() * 0.3);
    d.e.setPosition(p[0], p[1] + 0.03, p[2]); d.e.setEulerAngles(0, Math.random() * 360, 0); d.e.setLocalScale(s, 1, s);
    d.alive = true; d.age = 0; d.born = performance.now(); d.e.enabled = true; setOpacity(d, CFG.scorch.opacity);
  }
  function setOpacity(d, o) { var mi = d.e.render && d.e.render.meshInstances && d.e.render.meshInstances[0]; if (mi) mi.setParameter('material_opacity', o); }
  function place(x) {
    var lift = CFG.rise * x.age, ang = x.spin * Math.min(x.age, CFG.life);
    anchor(x.q, x.p, x.size * (CFG.grow[0] + (CFG.grow[1] - CFG.grow[0]) * Math.min(1, x.age / CFG.life)), x.v.ground, ang, lift);
  }
  // smoke plume (lingering / burning / post-blast): staggered rising, drifting, growing particles, 1 draw call
  function bindSmoke(q, v) {
    if (q.v === v) return;
    q.v = v; FX.rebinds++; var ps = q.ps.particlesystem;
    ps.colorMap = v.bodyTex; ps.animTilesX = v.cols; ps.animTilesY = v.rows; ps.animNumFrames = v.frames; ps.animSpeed = CFG.plume.life / v.sourceSeconds;
  }
  FX.smoke = function (pos, o) {
    if (!FX.ready || !FX.smokes.length || !pos) return null;
    o = o || {};
    var v = o.variant ? (o.variant.name ? o.variant : resolveSmoke(o.variant)) : FX.smokeVariant;
    if (!v) return null;
    if (!v.bodyTex) { var r3 = null; loadVariant(v, function (q) { if (q) r3 = FX.smoke(pos, Object.assign({}, o, { variant: q })); }); return r3; }
    v.used = performance.now();
    var s = FX.smokes.filter(function (q) { return !q.alive && q.v === v; })[0] || freeOf(FX.smokes) || oldest(FX.smokes);
    bindSmoke(s, v);
    var P = CFG.plume, size = Math.max(5, Math.min(40, (o.size || 9 * (o.scale || 1)) / v.plumeWidth)), h = size * PK * HALF;
    s.p = [pos[0], pos[1] || 0, pos[2]]; s.size = size; s.age = -(o.delay || 0); s.life = o.life || 0; s.alive = true; s.stopping = false; s.born = performance.now();
    var ps = s.ps.particlesystem, g = P.grow;
    ps.scaleGraph = curve([0, h * g[0], 0.45, h * g[1], 1, h * g[2]]);
    ps.scaleGraph2 = curve([0, h * g[0] * 1.15, 0.45, h * g[1] * 1.12, 1, h * g[2] * 1.1]);
    // world-space metres/s (entity unrotated, scale 1); PK keeps the pulled-in plume's motion in proportion
    var w = FX.wind + (Math.random() - 0.5) * 0.5, dx = Math.cos(w), dz = Math.sin(w), up = P.rise * size * PK, dr = P.drift * size * PK;
    ps.velocityGraph = curveSet([0, dx * dr * 0.25 - dz * dr * 0.3, 1, dx * dr - dz * dr * 0.2], [0, up, 1, up * 0.6], [0, dz * dr * 0.25 + dx * dr * 0.3, 1, dz * dr + dx * dr * 0.2]);
    ps.velocityGraph2 = curveSet([0, dx * dr * 0.4 + dz * dr * 0.3, 1, dx * dr * 1.35 + dz * dr * 0.2], [0, up * 1.2, 1, up * 0.75], [0, dz * dr * 0.4 - dx * dr * 0.3, 1, dz * dr * 1.35 - dx * dr * 0.2]);
    s.e.enabled = false; s.pending = true;
    return s;
  };
  FX.stopSmoke = function (s) { if (s && s.alive && !s.stopping) { s.stopping = true; s.ps.particlesystem.stop(); s.stopAt = s.age + CFG.plume.life; } };
  FX.clear = function () {
    FX.pool.forEach(function (x) { x.alive = false; x.e.enabled = false; });
    FX.decals.forEach(function (d) { d.alive = false; d.e.enabled = false; });
    FX.smokes.forEach(function (s) { s.alive = false; s.e.enabled = false; s.pending = false; });
    setDepth(false);
  };
  app.on('explosion', function (p, r) { FX.spawn(p, r); });
  app.on('panels:collapse', function (ev) {
    var tw = T.town || T.tactical && T.tactical.town, list = tw && tw.buildings, b = null, id = ev && String(ev.buildingId || '').replace(/^B/, '');
    if (list) b = list[id] || (Array.isArray(list) ? list.find(function (q) { return q && String(q.id) === id; }) : null);
    if (b && typeof b.x === 'number') FX.smoke([b.x, b.y || 0, b.z], { life: CFG.linger.collapseLife, scale: 1.4 });
  });

  var loopT = 0, statT = 0;
  app.on('update', function (dt) {
    if (!FX.ready) return;
    var n = 0, i;
    for (i = 0; i < FX.pool.length; i++) { var x = FX.pool[i]; if (!x.alive) continue;
      x.age += dt;
      if (x.light && x.light.enabled) { var k = 1 - x.age / CFG.light.life;
        if (k <= 0) x.light.enabled = false; else x.light.light.intensity = CFG.light.intensity * k * k * (0.85 + Math.random() * 0.3); }
      if (x.age >= CFG.life + 0.05) { x.alive = false; x.e.enabled = false; continue; }
      place(x); n++; }
    FX.active = n;
    for (i = 0; i < FX.decals.length; i++) { var d = FX.decals[i]; if (!d.alive) continue; d.age += dt;
      var L = CFG.scorch.life; if (d.age >= L) { d.alive = false; d.e.enabled = false; continue; }
      if (d.age > L * 0.6) setOpacity(d, CFG.scorch.opacity * (1 - (d.age - L * 0.6) / (L * 0.4))); }
    for (i = 0; i < FX.smokes.length; i++) { var s = FX.smokes[i]; if (!s.alive) continue; s.age += dt;
      if (s.pending && s.age >= 0) { s.pending = false; s.e.enabled = true; s.ps.particlesystem.reset(); s.ps.particlesystem.play(); }
      if (s.pending) continue;
      if (s.life && !s.stopping && s.age >= s.life) FX.stopSmoke(s);
      if (s.stopping && s.age >= s.stopAt) { s.alive = false; s.e.enabled = false; continue; }
      anchor(s.e, s.p, s.size * CFG.plume.grow[0], s.v.ground, 0, 0); }   // a new particle's baked ground point sits on the source
    if (!n && FX.depthRequested) setDepth(false);
    if (FX.loop) { loopT -= dt; if (loopT <= 0) { loopT = 0.7; FX.spawn(randomPoint(), 6 + Math.random() * 4); } }
    if (FX.panelVisible && (statT += dt) > 0.25) { statT = 0;
      var sm = FX.smokes.filter(function (q) { return q.alive && !q.pending; }).length, dc = FX.decals.filter(function (q) { return q.alive; }).length;
      status(n + ' explosions · ' + sm + ' smoke plumes · ' + dc + ' scorch · ' + Math.round(app.stats.frame.fps) + ' FPS · ' + app.stats.drawCalls.total + ' draw calls' +
        ' · last ' + (FX.last ? FX.last.replace('explosion_', '#') : '-') + ' · loaded ' + FX.loaded.filter(function (q) { return q.kind !== 'smoke'; }).length + '/' + FX.all.length); }
  });
  function aim() {
    var eye = cam.getPosition(), f = cam.forward, d = f.y < -0.1 ? Math.min(150, Math.max(8, -eye.y / f.y)) : 16;
    var p = [eye.x + f.x * d, 0, eye.z + f.z * d];
    if (T.navigation && T.navigation.nearest) { var q = T.navigation.nearest(p, { x: 4, y: 6, z: 4 }); if (q) p = q; }
    return p;
  }
  function randomPoint() { var c = aim(), a = Math.random() * 6.283, r = Math.random() * 14; return [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]; }
  FX.aim = aim;
  // --- FX panel: F8 anywhere; open at start with ?fxPanel=1 / ?explosionTest=1 / ?smokeTest=1 ---
  FX.fireAll6 = function (c) {
    c = c || aim(); var six = shuffle(FX.all.filter(function (v) { return !v.failed; }).slice()).slice(0, 6);
    six.forEach(function (v, k) { FX.spawn([c[0] + (k % 3 - 1) * 10, c[1], c[2] + (k < 3 ? -6 : 6)], 7, { variant: v }); });
    return six.map(function (v) { return v.name; });
  };
  FX.fire = function (variant, p) { return FX.spawn(p || aim(), 7, variant ? { variant: variant } : { wait: true }); };
  FX.showPanel = function (on) { var el = document.getElementById('explosion-test'); if (!el) return; FX.panelVisible = on == null ? !FX.panelVisible : !!on; el.style.display = FX.panelVisible ? 'block' : 'none'; };
  function panelInit() {
    if (document.getElementById('explosion-test')) return;
    var panel = document.createElement('div'); panel.id = 'explosion-test';
    panel.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:10020;background:#102129ed;color:#e4f2f2;border:1px solid #648b91;border-radius:8px;padding:10px;font:12px system-ui;max-width:460px;display:none';
    var eo = '<option value="">Random (all ' + FX.all.length + ')</option>' + FX.all.map(function (v) { return '<option value="' + v.num + '">' + pad2(v.num) + '</option>'; }).join('');
    var so = FX.allSmoke.map(function (v) { var bad = CFG.smokeAvoid[v.name]; return '<option value="' + v.name + '"' + (v === FX.smokeVariant ? ' selected' : '') + '>' +
      v.name.replace('smoke_', '') + (v.name === 'smoke_ns01' ? ' (Cody, default)' : bad ? ' (' + bad + ')' : '') + '</option>'; }).join('');
    panel.innerHTML = '<b>DREADING · FX</b> <span style="opacity:.7">F8 shows / hides · ' + (CFG.lite ? 'lite' : 'full') + '</span>' +
      '<div style="margin:6px 0">Explosion <select id="xfx-var">' + eo + '</select> <button id="xfx-one">Fire</button> <button id="xfx-six">Fire all 6</button> ' +
      '<button id="xfx-blast">Real blast (damage)</button> <label><input type="checkbox" id="xfx-loop"> Repeat</label></div>' +
      '<div style="margin:6px 0">Smoke <select id="xfx-svar">' + so + '</select> <button id="xfx-smoke">Smoke plume</button> <button id="xfx-smoke3">Burning block (3)</button> ' +
      '<button id="xfx-clear">Clear</button></div><div id="xfx-status">Ready</div>';
    document.body.appendChild(panel);
    panel.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    panel.addEventListener('wheel', function (e) { e.stopPropagation(); });
    panel.addEventListener('keydown', function (e) { if (e.code !== 'F8') e.stopPropagation(); });
    var on = function (id, f) { var el = document.getElementById(id); if (el) el.onclick = f; };
    var sel = function () { var v = document.getElementById('xfx-var').value; return v === '' ? null : +v; };
    var ssel = function () { return document.getElementById('xfx-svar').value; };
    on('xfx-one', function () { FX.fire(sel()); });
    on('xfx-six', function () { FX.fireAll6(); });
    on('xfx-blast', function () { var s = window.dreadingSandbox, p = aim(); if (s && s.blast) s.blast(p, 7, false, false); else FX.spawn(p, 7); });
    on('xfx-smoke', function () { FX.smoke(aim(), { scale: 1.2, variant: ssel() }); });
    on('xfx-smoke3', function () { var c = aim(); for (var k = 0; k < 3; k++) FX.smoke([c[0] + (k - 1) * 7, c[1], c[2] + (k % 2) * 4], { scale: 0.9 + k * 0.25, variant: ssel() }); });
    on('xfx-clear', function () { FX.loop = false; var l = document.getElementById('xfx-loop'); if (l) l.checked = false; FX.clear(); });
    var lp = document.getElementById('xfx-loop'); if (lp) lp.onchange = function (e) { FX.loop = e.target.checked; };
    var fv = resolveVar(CFG.forceVariant), xv = document.getElementById('xfx-var'); if (fv && xv) xv.value = String(fv.num);
    if (showPanel) FX.showPanel(true);
  }
  if (window.addEventListener) window.addEventListener('keydown', function (e) { if (e.code === 'F8' && !e.repeat) { e.preventDefault(); FX.showPanel(); } });
  return true;
}
function status(s) { var el = document.getElementById('xfx-status'); if (el) el.textContent = s; }
var timer = setInterval(function () { try { if (init()) clearInterval(timer); } catch (e) { clearInterval(timer); FX.error = String(e); console.error('[ExplosionFX] init failed', e); } }, 250);
})();
