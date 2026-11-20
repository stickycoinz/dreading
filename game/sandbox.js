/* DREADING QC - additive, opt-in performance laboratory.
   Uses the EXISTING PlayCanvas scene, town, zombie manager, soldier decision/animation, combat, and RTS/FPS input.
   NOT a network load test: the uploaded export contains no match server or replicated client transport.
   No existing game script is patched. Open stress.html to opt in. */
(function () {
'use strict';
if (!window.DREADING_SANDBOX && !/[?&]stress=1(?:&|$)/.test(location.search)) return;
var attempts = 0, poll = setInterval(function () {
    if (!(window.tactical && window.tactical.T && window.tactical.T.ready)) {
        if (++attempts > 180) { clearInterval(poll); console.warn('[DREADING STRESS] Base game did not become ready'); }
        return;
    }
    clearInterval(poll);
    try { init(window.tactical); } catch (err) { console.error('[DREADING STRESS] Failed:', err); }
}, 500);

function init(api) {
    var app = api.app, T = api.T, PC = window.pc, Z = T.zombieMgr, town = api.town && api.town.script,
        input = T.input, managed = [], traps = [], bursts = [], pauseTasks = [], statuses = [],
        testStart = performance.now(), firstFrame = 0, lastFrame = 0, frameTimes = [], samples = [], events = [],
        metrics = { spikes33: 0, spikes50: 0, spikes100: 0, worst: 0, frameN: 0 },
        scenario = 'manual', runStart = 0, runUntil = 0, isRunning = false, lastSeconds = 0,
        drawTotal = 0, drawN = 0, navBusy = false, navOperations = [], armedPick = false, extraCamera = null,
        previousSandbox = T.sandbox, baselineNames = T.squad.map(function (s) { return s.soldierName; }),
        baselineSizes = { squads: T.squad.length, buildings: town ? town.buildings.length : 0 },
        maxAdditionalSquads = 10, maxTraps = 48, maxBursts = 8;
    T.sandbox = true; // Stress runs should continue even when a team is defeated. This tab only.

    var style = document.createElement('style');
    style.textContent = '#ds-panel{position:fixed;right:10px;top:58px;width:292px;max-height:calc(100vh - 76px);overflow:auto;box-sizing:border-box;z-index:9000;background:rgba(12,20,25,.91);border:1px solid #56818e;border-radius:7px;color:#deece9;font:12px/1.45 ui-monospace,Consolas,monospace;padding:12px;box-shadow:0 9px 30px #0008}#ds-panel h2{font:700 16px/1.2 system-ui;margin:0 0 6px;color:#d9fff0}#ds-panel .ds-small{font-size:11px;color:#a9c2be}#ds-panel button,#ds-panel select{font:12px system-ui;background:#213943;color:#ebf6f4;border:1px solid #567983;padding:5px 8px;margin:3px 3px 3px 0;border-radius:4px;cursor:pointer}#ds-panel button:disabled{opacity:.45;cursor:not-allowed}#ds-panel button:hover{background:#385966}#ds-panel .ds-warn{color:#ffce89}#ds-panel .ds-grid{display:flex;flex-wrap:wrap;gap:1px}#ds-panel .ds-row{border-top:1px solid #39505b;padding-top:7px;margin-top:7px}#ds-panel pre{white-space:pre-wrap;margin:5px 0;font:11px/1.5 monospace}#ds-panel details summary{cursor:pointer}#ds-panel .ds-num{font-variant-numeric:tabular-nums}#ds-panel button.ds-primary{background:#2b5441}#ds-panel .ds-error{color:#ff8b8b}#ds-panel.ds-compact .ds-body{display:none}#ds-panel.ds-compact{max-height:50px;width:200px}';
    document.head.appendChild(style);
    var panel = document.createElement('aside'); panel.id = 'ds-panel';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>DREADING / SANDBOX</h2><button id="ds-fold" title="Collapse panel">−</button></div>' +
        '<div class="ds-body"><div class="ds-small">Development-only extension. The original map and game code are unchanged. FPS/RTS remain controlled by the original game.</div>' +
        '<div class="ds-row"><strong>Sim match</strong><div class="ds-grid"><select id="ds-simpreset"><option value="light">Light</option><option value="medium" selected>Medium</option><option value="heavy">Heavy</option></select><button id="ds-sim" class="ds-primary">Run sim match</button></div><span class="ds-small">Hands-off match on a fresh reload: scout 20 s (zombies calm, no shooting) &gt; setup 15 s &gt; fight (assault, enemy patrols, zombie waves drawn by noise) until a team is wiped, the base match rules end it, or the time limit.</span><div id="ds-simwrap"></div><pre id="ds-score" class="ds-num"></pre></div>' +
        '<div class="ds-row"><strong>Scripted load</strong><div class="ds-grid"><button id="ds-low" class="ds-primary">Light</button><button id="ds-mid" class="ds-primary">Medium</button><button id="ds-heavy" class="ds-primary">Heavy</button></div><span class="ds-small">Each starts from a fresh reload for comparable results. Default benchmark: 60 seconds.</span></div>' +
        '<div class="ds-row"><strong>Live spawning</strong><div class="ds-grid"><button id="ds-friendly">+4 friendly AI</button><button id="ds-enemy">+4 enemy AI</button><button id="ds-enemyhunt">+4 enemy hunters</button><button id="ds-z10">+10 zombies</button><button id="ds-z30">+30 zombies</button></div><div class="ds-grid"><button id="ds-rmsel">Remove selected</button><button id="ds-rmlast">Remove last squad</button><button id="ds-rmall">Clear spawned soldiers</button><button id="ds-rmz">Clear zombies</button></div><span class="ds-small">Spawned soldiers use the game&#39;s own soldier AI. Each group stays a separate four-person squad. Click a soldier to select their squad; Shift-click adds another squad. Enemy squads alternate: defenders hold angles in a building near the objective, hunters patrol toward your squad. Only spawned units can be removed.</span></div>' +
        '<div class="ds-row"><strong>Traps / destruction</strong><div class="ds-grid"><button id="ds-place">Place trap (map click)</button><button id="ds-pack">+6 traps</button><button id="ds-detonate">Detonate traps</button><button id="ds-blast">Explode near building</button><button id="ds-breach">Breach nearest</button><button id="ds-collapse">Collapse nearest</button></div><span class="ds-small">Buildings use the original intact → breached → collapsed replacement and navmesh rebuild. Debris is limited visual FX, not rigid-body fracture.</span></div>' +
        '<div class="ds-row"><strong>View / test</strong><div class="ds-grid"><button id="ds-rts">RTS view</button><button id="ds-fps">FPS view</button><button id="ds-dual">Dual camera OFF</button><button id="ds-record">Record 60 s</button><button id="ds-reset">Reset lab (reload)</button></div><span class="ds-small">Dual camera renders a second spectator viewport in the same browser to test GPU overhead, not actual online multiplayer.</span></div>' +
        '<div class="ds-row"><strong>Measured on this browser</strong><pre id="ds-metrics" class="ds-num">Warming up...</pre><div id="ds-status" class="ds-small"></div></div>' +
        '<div class="ds-row"><strong>Reports</strong><div class="ds-grid"><button id="ds-json">Save JSON</button><button id="ds-csv">Save CSV</button></div><span class="ds-small">Includes frame times, spikes, counts, draw calls, events and browser metadata. Leave the game tab in the foreground during benchmarks.</span></div>' +
        '<div class="ds-row ds-small ds-warn">Not measured: network latency, server tick, state replication, or four separate clients. This uploaded PlayCanvas export is a local client build.</div></div>';
    document.body.appendChild(panel);
    function $(id) { return document.getElementById('ds-' + id); }
    function log(kind, details) {
        var e = {sec: +((performance.now() - testStart) / 1000).toFixed(2), kind: kind, details: details || ''};
        events.push(e); if (events.length > 2000) events.shift();
        statuses.push(kind + ': ' + details); if (statuses.length > 5) statuses.shift();
        $('status').textContent = statuses.slice(-3).join(' | ');
    }
    function warn(err) { log('ERROR', String(err && (err.stack || err.message) || err)); console.warn('[DREADING STRESS]', err); }
    function hook(id, cb) { $(id).addEventListener('click', function (e) { e.preventDefault(); e.currentTarget.blur(); try { var ret = cb(); if (ret && ret.catch) ret.catch(warn); } catch(err) { warn(err); } }); }
    hook('fold', function () { panel.classList.toggle('ds-compact'); $('fold').textContent = panel.classList.contains('ds-compact') ? '+' : '−'; });

    var serial = 0, sim = null;
    /* ---------- SANDBOX: spawning that plugs into the real squad AI ---------- */
    var ORD = T.orders, squads = [], squadSeq = 0, uidMax = T.squad.reduce(function (a, s) { return Math.max(a, s.uid || 0); }, 0);
    var palette = { friendly: [[.36,.89,.74],[.95,.69,.29],[.32,.73,1],[.83,.55,1]], enemy: [[1,.35,.3]] }, mat = {};
    ['friendly','enemy'].forEach(function (team) {
        var m = new PC.StandardMaterial(); m.diffuse = new PC.Color(0,0,0);
        m.emissive = team === 'friendly' ? new PC.Color(.25,.6,1) : new PC.Color(1,.25,.2);
        m.useLighting = false; m.opacity = 0.75; m.blendType = PC.BLEND_NORMAL; m.depthWrite = false; m.update(); mat[team] = m;
    });
    function d2(a, b) { return Math.hypot(a[0]-b[0], a[2]-b[2]); }
    function aliveTeam(t) { return T.squad.filter(function (s) { return s.team === t && s.alive && !s.disabled; }); }
    function navNearest(p, ext) {
        if (!(T.navigation && T.navigation.nearest)) return null;
        try { return T.navigation.nearest(p, ext || {x: 2, y: 2.5, z: 2}) || null; } catch (err) { return null; }
    }
    function reachable(a, b) { if (d2(a, b) < 3) return true; try { var p = T.navigation.path(a, b); return !!(p && p.length > 1); } catch (e) { return false; } }
    function freeSpot(p, ref, taken) {
        var q = navNearest(p); if (!q) return null;
        if (ref && Math.abs(q[1] - ref[1]) > 1.2) return null;
        if (T.squad.some(function (o) { return o.alive && d2(o.pos(), q) < 1.1; })) return null;
        if (taken.some(function (t) { return d2(t, q) < 1.1; })) return null;
        return q;
    }
    function ringSpots(anchor, n) {
        var out = [], r, k;
        for (r = 0; r <= 4.5 && out.length < n; r += 1.5) for (k = 0; k < (r ? 8 : 1) && out.length < n; k++) {
            var a = k * Math.PI / 4 + r, q = freeSpot([anchor[0] + Math.sin(a) * r, anchor[1], anchor[2] + Math.cos(a) * r], anchor, out);
            if (q) out.push(q);
        }
        return out.length >= n ? out : null;
    }
    /* enemy side = around the objective and the editor enemy posts / cover near it; never near living friendlies;
       each squad gets a different anchor (>= 9 m apart) that has a nav path to the objective */
    function enemyAnchors() {
        var obj = ORD.objective(), c = [];
        (T.spawnPoints || []).forEach(function (sp) { if (sp.team === 'enemy') c.push(sp.position.slice()); });
        ORD.searchPoints().forEach(function (q) { if (q.p[1] < 1) c.push(q.p.slice()); });
        T.cover.usable().forEach(function (cv) { if (d2(cv.position, obj) < 45) c.push(cv.position.slice()); });
        if (T.town && T.town.buildings) T.town.buildings.forEach(function (b) { if (b && b.type !== 'park' && b.state !== 'collapsed' && Math.hypot(b.x - obj[0], b.z - obj[2]) < 55) c.push([b.x, obj[1], b.z]); });
        return c.map(function (p) { return {p: p, d: d2(p, obj)}; }).sort(function (a, b) { return a.d - b.d; }).map(function (x) { return x.p; });
    }
    function pickAnchor(team) {
        var fr = aliveTeam('friendly'), en = aliveTeam('enemy'), used = squads.filter(function (q) { return q.team === team; }).map(function (q) { return q.anchor; }), obj = ORD.objective();
        var cands;
        if (team === 'enemy') cands = enemyAnchors();
        else { var base = fr.length ? ORD.bCentroid(fr) : basePointFallback(), away = [base[0] - obj[0], 0, base[2] - obj[2]], L = Math.hypot(away[0], away[2]) || 1; cands = [];
            for (var k = 0; k < 10; k++) { var a = Math.atan2(away[2], away[0]) + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.35, r = 6 + (k % 3) * 2; cands.push([base[0] + Math.cos(a) * r, base[1], base[2] + Math.sin(a) * r]); } }
        for (var pass = 0; pass < 2; pass++) for (var i = 0; i < cands.length; i++) {
            var p = navNearest(cands[i], {x: 3, y: 3, z: 3}); if (!p) continue;
            if (team === 'enemy' && fr.some(function (s) { return d2(s.pos(), p) < (pass ? 18 : 28); })) continue;
            if (team === 'friendly' && en.some(function (s) { return d2(s.pos(), p) < 25; })) continue;
            if (used.some(function (u) { return d2(u, p) < (pass ? 5 : 9); })) continue;
            if (!reachable(p, obj)) continue;
            var spots = ringSpots(p, 4); if (spots) return {anchor: p, spots: spots};
        }
        return null;
    }
    function basePointFallback() { var s = T.squad.find(function (s) { return s.team === 'friendly'; }); return s ? s.start.slice() : [-10, 0, -10]; }
    function newSoldier(team, q, idx) {
        var glb = T.soldierGlb;
        if (!(glb && glb.resource && glb.resource.animations)) throw new Error('Original soldier GLB is not ready');
        var name = (team === 'friendly' ? 'F' : 'E') + '-' + (++serial), e = new PC.Entity(name);
        e.setPosition(q[0], q[1], q[2]); T.root.addChild(e);
        var model = glb.resource.instantiateRenderEntity(); e.addChild(model);
        model.addComponent('anim', {activate: true});
        glb.resource.animations.forEach(function (a) { model.anim.assignAnimation(a.resource.name, a.resource, undefined, 1, !/death|hit_react/.test(a.resource.name)); });
        var disc = new PC.Entity('team disc'); disc.addComponent('render', {type: 'cylinder', material: mat[team], castShadows: false, receiveShadows: false});
        disc.setLocalScale(.7, .01, .7); disc.setLocalPosition(0, .02, 0); e.addChild(disc);
        e.addComponent('script');
        var s = e.script.create('tacticalSoldierDecision', {attributes: {soldierName: name, role: team === 'friendly' ? 'Rifleman' : 'Defender', team: team, advanceIndex: idx % 2}});
        e.script.create('tacticalSoldierAnimation');
        s.uid = ++uidMax; /* unique even after removals (the base game uses squad length) */
        var col = team === 'friendly' ? palette.friendly[idx % 4] : palette.enemy[0];
        s.color = new PC.Color(col[0], col[1], col[2]); s.css = 'rgb(' + col.map(function (x) { return Math.round(x * 255); }).join(',') + ')';
        s.model = model; s.sandbox = true;
        s.label = document.createElement('div'); s.label.className = 'label'; document.body.appendChild(s.label);
        if (team === 'friendly') {
            var roster = document.getElementById('squad');
            s.row = document.createElement('div'); s.row.className = 'row';
            s.row.onclick = function (ev) { if (T.input && T.input.select) T.input.select([s], !!ev.shiftKey); };
            if (roster) roster.appendChild(s.row);
        }
        managed.push({s: s, e: e});
        return s;
    }
    function threatFor(team) { try { return T.perception.threatPoint(team); } catch (e) { return ORD.objective(); } }
    /* enemy roles: even squads defend a building near their anchor with M7 angles (same holdAngles the base defenders use),
       odd squads patrol/hunt with pair bounds toward known (else last reported) friendly positions */
    function setupEnemySquad(q) {
        var th = threatFor('enemy'), m = q.members;
        if (q.role === 'defend') {
            var bn = ORD.buildingNear(q.anchor, 25), asg = [];
            if (bn) { var BI = ORD.docInfo(bn.ref, q.anchor); if (BI && BI.ok) { var used = T.squad.filter(function (o) { return o.team === 'enemy' && o.alive && o.order && o.order.angle; }).map(function (o) { return o.order.dest; });
                asg = ORD.holdAngles(BI, m, false, th, used) || []; q.building = bn.name; } }
            asg.forEach(function (a) { var s = a.s; s.order = {type: 'defend', dest: a.spot.p, face: a.spot.face, by: 'ai', angle: a.op.id}; s.moveTo(a.spot.p, 'Defend: holding an angle on the ' + a.op.kind); });
            var rest = m.filter(function (s) { return !asg.some(function (a) { return a.s === s; }); });
            var cov = T.cover.usable().filter(function (c) { return d2(c.position, q.anchor) < 14; }).sort(function (a, b) { return d2(a.position, q.anchor) - d2(b.position, q.anchor); });
            rest.forEach(function (s, i) { var c = cov.find(function (c) { return !T.squad.some(function (o) { return o !== s && o.alive && d2(o.goal || o.pos(), c.position) < 1.2; }); });
                var p = c ? c.position.slice() : s.pos(); s.order = {type: 'defend', dest: p, face: th, by: 'ai'}; if (c) s.moveTo(p, 'Defend: taking a post'); });
        } else {
            m.forEach(function (s) { var p = s.pos(); s.order = {type: 'defend', dest: p, face: th, by: 'ai'}; });
        }
        TacticalCommon.log && m.forEach(function (s) { TacticalCommon.log(s.app, s, q.role === 'defend' ? 'Defending ' + (q.building || 'post') : 'Patrol: hunting the friendly squad'); });
    }
    var huntOn = true;
    function huntTick(now) {
        if (!huntOn) return;
        squads.forEach(function (q) {
            if (q.team !== 'enemy' || q.role !== 'hunt') return;
            var m = q.members.filter(function (s) { return s.alive && !s.disabled; }); if (!m.length) return;
            var fighting = m.some(function (s) { return s.target && !s.target.isZombie && s.target.alive && now - (s.lastSeenT || -99) < 2; });
            if (fighting) { q.contactT = now; return; }
            if (now - (q.contactT || -99) < 3) return;
            var moving = m.some(function (s) { return s.path && s.path.length && s.index < s.path.length; });
            if (moving && now - (q.boundT || -99) < 6) return; if (now - (q.boundT || -99) < 1.5) return;
            var lead = m[0].pos(), tgt = null, bd = 1e9;
            T.perception.known(m[0], true).forEach(function (r) { if (r.entity.isZombie || !r.entity.alive) return; var dd = d2(r.lastSensedPosition, lead); if (dd < bd) { bd = dd; tgt = r.lastSensedPosition.slice(); } });
            if (!tgt) aliveTeam('friendly').forEach(function (s) { var dd = d2(s.pos(), lead); if (dd < bd) { bd = dd; tgt = s.pos(); } }); /* radio report of the friendly squad */
            if (!tgt) return;
            var pairs = [m.filter(function (_, i) { return i % 2 === 0; }), m.filter(function (_, i) { return i % 2 === 1; })].filter(function (p) { return p.length; });
            q.active = ((q.active || 0) + 1) % pairs.length; var mover = pairs[q.active], path = null;
            try { path = T.navigation.path(mover[0].pos(), tgt); } catch (e) { path = null; }
            var dest = tgt; if (path && path.length > 1) { var acc = 0; dest = path[path.length - 1]; for (var i = 1; i < path.length; i++) { var a = path[i-1], b = path[i], L = Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]); if (acc + L >= 8) { var t = (8 - acc) / L; dest = [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; break; } acc += L; } }
            var sp = ORD.spots(mover, dest); q.boundT = now; q.bounds = (q.bounds || 0) + 1;
            mover.forEach(function (s) { var p = sp.get(s) || dest; T.cover.release(s); s.inCover = false; s.order = {type: 'defend', dest: p, face: tgt, by: 'ai'}; s.moveTo(p, 'Patrol: bounding toward the friendly squad'); });
            pairs.forEach(function (p, i) { if (i !== q.active) p.forEach(function (s) { if (s.order) s.order.face = tgt; }); });
        });
    }
    function spawnSquad(team, quiet, role) {
        if (squads.length >= maxAdditionalSquads) { if (!quiet) log('LIMIT', maxAdditionalSquads + ' added squads maximum'); return 0; }
        var pick = pickAnchor(team);
        if (!pick) { log('NO ROOM', 'No free navmesh spot on the ' + team + ' side'); return 0; }
        var q = {id: ++squadSeq, team: team, anchor: pick.anchor, members: []};
        q.role = team === 'enemy' ? (role || (squads.filter(function (x) { return x.team === 'enemy'; }).length % 2 ? 'hunt' : 'defend')) : 'squad';
        pick.spots.forEach(function (p, i) { var s=newSoldier(team, p, i); s.squadKey=team+':spawn:'+q.id; q.members.push(s); });
        squads.push(q);
        if (team === 'enemy') setupEnemySquad(q);
        else { var fr = aliveTeam('friendly'); ORD.assignSectors(fr, threatFor('friendly'));
            if (ORD.brain && ORD.brain.kind === 'assault' && ORD.brain.status === 'run' && sim && sim.phase === 'fight') {} }
        if (!quiet) log('SPAWN SQUAD', team + ' x4 ' + q.role + ' (' + q.members.map(function (s) { return s.soldierName; }).join(',') + ')');
        return 4;
    }
    /* ---------- SANDBOX: clean removal ---------- */
    function removeSoldier(s) {
        if (!s) return false;
        if (T.input && T.input.fps && (s.controlled || T.input.controlled === s)) try { T.input.exitControl('removed'); } catch (e) {}
        s.alive = false; s.health = 0; s.disabled = true; s.path = []; s.target = null; s.focus = null;
        try { T.cover.release(s); } catch (e) {}
        var i = T.squad.indexOf(s); if (i >= 0) T.squad.splice(i, 1);
        if (T.selection) { var j = T.selection.indexOf(s); if (j >= 0) T.selection.splice(j, 1); }
        T.squad.forEach(function (o) {
            if (o.target === s) o.target = null; if (o.focus === s) o.focus = null; if (o.lastAttacker === s) o.lastAttacker = null;
            if (o.memory && o.memory.hasRecord(s)) o.memory.deleteRecord(s);
            if (o.suppress && o.suppress.target === s) o.suppress = null;
        });
        (T.zombies || []).forEach(function (z) { if (z.target === s) { z.target = null; if (z.state === 'chase' || z.state === 'attack') { z.state = 'wander'; z.path = []; z.repathT = 0; } } });
        if (Z && Z.corpses && Z.corpses.get(s)) { Z.corpses.get(s).slots.forEach(function (z) { if (z) { Z.releaseFeed(z); z.state = 'wander'; z.path = []; } }); Z.corpses.delete(s); }
        ['brain', 'hunt', 'assault', 'follow'].forEach(function (k) { var o = ORD[k]; if (!o) return;
            if (o.members) { var x = o.members.indexOf(s); if (x >= 0) o.members.splice(x, 1); }
            if (o.pairs) o.pairs = o.pairs.map(function (p) { return p.filter(function (m) { return m !== s; }); }).filter(function (p) { return p.length; });
            if (o.leader === s) { try { ORD.stopFollow(); } catch (e) { ORD.follow = null; } } });
        if (T.noise && T.noise.who === s.soldierName) T.noise = null;
        if (s.label && s.label.parentNode) s.label.parentNode.removeChild(s.label);
        if (s.row && s.row.parentNode) s.row.parentNode.removeChild(s.row);
        var e = s.entity; managed = managed.filter(function (m) { return m.s !== s; });
        squads.forEach(function (q) { q.members = q.members.filter(function (m) { return m !== s; }); }); squads = squads.filter(function (q) { return q.members.length; });
        if (e && !e._destroyed) e.destroy();
        return true;
    }
    function removeLastSquad() { var q = squads[squads.length - 1]; if (!q) { log('REMOVE', 'No spawned squad'); return; } q.members.slice().forEach(removeSoldier); squads = squads.filter(function (x) { return x !== q; }); log('REMOVE', q.team + ' squad #' + q.id + ' removed'); }
    function clearSoldiers() { var n = managed.length; managed.slice().forEach(function (m) { removeSoldier(m.s); }); squads = []; log('REMOVE', n + ' spawned soldiers removed'); }
    function clearZombies() { if (!Z) return; var n = 0; Z.queue = null; (Z.pool || []).forEach(function (z) { if (z.active) { Z.despawn(z); n++; } }); (T.zombies || []).length = 0; Z.packs = []; if (Z.corpses) Z.corpses.forEach(function (c) { c.slots.fill(null); });
        T.squad.forEach(function (o) { if (o.target && o.target.isZombie) o.target = null; if (o.memory) o.memory.records.slice().forEach(function (r) { if (r.entity.isZombie) o.memory.deleteRecord(r.entity); }); }); log('REMOVE', n + ' zombies cleared'); }
    function removeSelected() { var sel = (T.selection || []).slice(), n = 0, kept = 0; sel.forEach(function (s) { if (s.sandbox) { removeSoldier(s); n++; } else kept++; }); log('REMOVE', n + ' selected removed' + (kept ? ' (' + kept + ' original soldiers kept - only spawned units can be removed)' : '')); }
    hook('friendly', function () { spawnSquad('friendly'); }); hook('enemy', function () { spawnSquad('enemy'); });
    hook('enemyhunt', function () { spawnSquad('enemy', false, 'hunt'); });
    hook('rmlast', removeLastSquad); hook('rmall', clearSoldiers); hook('rmz', clearZombies); hook('rmsel', removeSelected);
    function basePoint(team) {
        var ss = T.squad.filter(function (s) { return baselineNames.indexOf(s.soldierName)>=0 && s.team===team; });
        if (ss.length) return ss[0].start.slice();
        return team==='enemy' ? ORD.objective() : basePointFallback();
    }
    function zombies(n) {
        if (!(Z && Z.ready)) { log('UNAVAILABLE','Base zombie manager is not ready'); return 0; }
        Z.on = true;
        var count = Z.queueWave(n,'stress');
        log('ZOMBIE WAVE', n+' requested, '+count+' admitted to base queue (game pool/cap applies)');
        return count;
    }
    hook('z10',function(){zombies(10);}); hook('z30',function(){zombies(30);});

    // Temporary trap visualisation only. A trap checks proximity in the original game loop, then feeds the base combat API.
    var trapMat = new PC.StandardMaterial();trapMat.diffuse = new PC.Color(.76,.28,.12);trapMat.emissive = new PC.Color(.18,.04,.015);trapMat.update();
    var flashMat = new PC.StandardMaterial();flashMat.diffuse = new PC.Color(.96,.65,.22);flashMat.emissive = new PC.Color(.8,.34,.05);
    flashMat.opacity = .42;flashMat.blendType = PC.BLEND_ADDITIVE;flashMat.depthWrite=false;flashMat.useLighting=false;flashMat.update();
    function trapAt(p,quiet) {
        if(traps.length>=maxTraps)return null;
        var q=navNearest(p), e=new PC.Entity('STRESS explosive trap');
        e.addComponent('render',{type:'box',material:trapMat,castShadows:false,receiveShadows:false});
        e.setLocalScale(.9,.16,.9);e.setPosition(q[0],q[1]+.1,q[2]);T.root.addChild(e);
        var trap={e:e,p:q,armedAt:performance.now()+750,active:true};traps.push(trap);
        if(!quiet)log('PLACE TRAP', q.map(function(a){return a.toFixed(1);}).join(', '));
        return trap;
    }
    function focus() {
        if (town && town.focusPoint) return town.focusPoint();
        if (T.selection && T.selection[0]) return T.selection[0].pos();
        return basePoint('enemy');
    }
    function blastFx(p,radius) {
        /* AI-MERGE: real flipbook explosion (explosion-fx.js, pooled particle system). The old sphere flash is only a fallback. */
        var XF=window.DreadingExplosionFX;if(XF&&XF.ready&&XF.spawn(p,radius))return;
        if (bursts.length>=maxBursts) {var old=bursts.shift();old.e.destroy();}
        var e=new PC.Entity('STRESS explosion flash');e.addComponent('render',{type:'sphere',material:flashMat,castShadows:false,receiveShadows:false});
        e.setPosition(p[0],p[1]+1,p[2]);e.setLocalScale(.1,.1,.1);T.root.addChild(e);
        bursts.push({e:e,start:performance.now()});
    }
    function blast(p,radius,building,quiet) {
        radius=radius||8;blastFx(p,radius);
        var damageN=0;
        if(T.combat && T.combat.applyDamage){T.squad.concat(T.zombies||[]).forEach(function (v) {
            if (!v.alive || !v.pos) return;
            var q=v.pos(),d=Math.hypot(q[0]-p[0],q[2]-p[2]);
            if (d>radius || Math.abs(q[1]-p[1])>5) return;
            T.combat.applyDamage(v,Math.round(65*(1-d/radius))+4,null,'explosion',[0,1,0]);damageN++;
        });}
        if(Z&&Z.hear) try {Z.hear(p,null,T.elapsed,Math.max(24,radius*3));} catch(e) {warn(e);}
        if (!quiet)log('EXPLOSION','radius '+radius+' m, '+damageN+' targets hit'+(building?', building change queued':''));
        if (building) damageBuilding(p);
        return damageN;
    }
    function damageBuilding(p) {
        if(!(town&&town.nearest))return;
        var nearest=town.nearest(p);if(!nearest||nearest.distance>18)return;
        var b=town.buildings[nearest.id];if (!b) return;
        var state=b.state==='intact'?'breached':b.state==='breached'?'collapsed':null;
        if(state) setBuilding(nearest.id,state);
    }
    function setBuilding(id,state) {
        if (!town) {log('UNAVAILABLE','Existing tacticalTown not ready');return Promise.resolve();}
        if(navBusy){log('NAV BUSY','Existing building state/navmesh rebuild still running');return Promise.resolve();}
        navBusy=true;var start=performance.now();
        return town.setState(id,state).then(function(res){
            var ms=Math.round(performance.now()-start);navOperations.push({t:+((start-testStart)/1000).toFixed(2),id:id,state:state,ms:ms,navMs:res&&res.navMs});
            log('BUILDING '+state.toUpperCase(),'#'+id+' full state swap + nav rebuild '+ms+'ms');
        }).catch(warn).finally(function(){navBusy=false;});
    }
    function nearestBuilding() {if(!(town&&town.nearest))return null;return town.nearest(focus());}
    hook('breach',function(){var n=nearestBuilding();if(n)return setBuilding(n.id,'breached');log('NO BUILDING','Town missing');});
    hook('collapse',function(){var n=nearestBuilding();if(n)return setBuilding(n.id,'collapsed');log('NO BUILDING','Town missing');});
    hook('blast',function(){var n=nearestBuilding();var p=n&&town.buildings[n.id]?[town.buildings[n.id].x,0,town.buildings[n.id].z]:focus();blast(p,8,true);});
    hook('pack',function(){var p=focus();for(var i=0;i<6;i++){var a=i*Math.PI/3;trapAt([p[0]+Math.cos(a)*7,p[1],p[2]+Math.sin(a)*7],true);}log('PLACE TRAPS','Placed up to 6 around command position');});
    hook('detonate',function(){var count=0;traps.slice().forEach(function(t){if(t.active){detonate(t,true);count++;}});log('DETONATE',count+' test traps');});
    function detonate(t,quiet){if(!t.active)return;t.active=false;t.e.destroy();blast(t.p,7,false,quiet);}
    function onPick(e){
        if(!armedPick)return;
        e.preventDefault();e.stopImmediatePropagation();armedPick=false;
        app.graphicsDevice.canvas.style.cursor='';
        try{if(T.input.fps){log('PLACE TRAP','Exit FPS to pick a location');return;}
            var rect=app.graphicsDevice.canvas.getBoundingClientRect(),px=e.clientX-rect.left,py=e.clientY-rect.top;
            var h=T.input.pickWorld(px,py);if(!h){log('PLACE TRAP','No ground at click');return;}
            trapAt(h.point);
        } catch(err){warn(err);}
    }
    app.graphicsDevice.canvas.addEventListener('mousedown',onPick,true);
    hook('place',function(){if(input.fps){log('PLACE TRAP','Switch to RTS before placing');return;}armedPick=true;app.graphicsDevice.canvas.style.cursor='crosshair';log('PLACE TRAP','Click a ground position in the world');});

    // A second in-engine camera draws another viewport into the same WebGL canvas. No extra DOM WebGL context.
    function toggleDual() {
        if(extraCamera){extraCamera.destroy();extraCamera=null;$('dual').textContent='Dual camera OFF';log('VIEW','Second camera off');return;}
        extraCamera=new PC.Entity('STRESS alternate-view camera');
        extraCamera.addComponent('camera',{rect:new PC.Vec4(.70,.56,.29,.32),priority:5,
            clearColor:new PC.Color(.06,.1,.12),farClip:300,nearClip:0.06,fov:60});
        T.root.addChild(extraCamera);
        $('dual').textContent='Dual camera ON';log('VIEW','Second in-engine FPS/RTS render active');
    }
    hook('dual',toggleDual);
    hook('rts',function(){if(input.fps)input.exitControl('stress lab');else input.home();log('VIEW','Existing RTS view');});
    hook('fps',function(){var s=T.selection&&T.selection[0] || T.squad.find(function(s){return s.team==='friendly'&&s.alive;});
        if(input.fps){log('VIEW','Already first-person');return;}
        if(!s||!s.alive){log('VIEW','No living friendly selected');return;}
        input.enterControl(s);log('VIEW','Existing FPS control of '+s.soldierName);
    });
    function frameOverlay(now) {
        if(extraCamera){
            if(input.fps){var c=input.cam;extraCamera.setPosition(c.pos);extraCamera.setEulerAngles(c.pitch*180/Math.PI,c.yaw*180/Math.PI,0);}
            else{var s=T.squad.find(function(s){return s.team==='friendly'&&s.alive;});if(s){var p=s.pos(),f=TacticalNS.fwd(s.lookYaw,s.pitch||0);extraCamera.setPosition(p[0],p[1]+1.62,p[2]);extraCamera.lookAt(p[0]+f[0]*20,p[1]+1.62+f[1]*20,p[2]+f[2]*20);}}
        }
        for(var i=bursts.length-1;i>=0;i--){var v=bursts[i],t=(now-v.start)/400;
            if(t>=1){v.e.destroy();bursts.splice(i,1);}else{var size=.3+t*14;v.e.setLocalScale(size,size,size);}}
        if(!T.paused && T.running){for(var j=traps.length-1;j>=0;j--){var t0=traps[j];if(!t0.active){traps.splice(j,1);continue;}if(now<t0.armedAt)continue;
            // Evaluate against existing live entities. Neither navmesh nor player controller is replaced.
            var movers=(T.zombies||[]).concat(T.squad||[]);for(var k=0;k<movers.length;k++){
                var m=movers[k];if(!m.alive||!m.pos)continue;var p0=m.pos();
                if(Math.hypot(p0[0]-t0.p[0],p0[2]-t0.p[2])<1.35&&Math.abs(p0[1]-t0.p[1])<2){detonate(t0,false);traps.splice(j,1);break;}
            }
        }}
    }

    function percentile(a,p){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y;});return b[Math.min(b.length-1,Math.floor((b.length-1)*p))];}
    app.on('frameend',function(){if(!T.ready)return;var c=app.stats&&app.stats.drawCalls?app.stats.drawCalls.total:0;drawTotal+=c||0;drawN++;});
    var savedInfo={gameBuild:window.TacticalController&&TacticalController.BUILD||'unknown',playcanvas:PC.version,
        userAgent:navigator.userAgent,devicePixelRatio:window.devicePixelRatio||1,startAt:new Date().toISOString(),
        width:app.graphicsDevice.width,height:app.graphicsDevice.height,baseline:baselineSizes,
        mode:'single local PlayCanvas client; 2nd view is an extra GPU camera (NOT multiplayer)'};
    function summarize(frames){var n=frames.length,avg=n?frames.reduce(function(a,b){return a+b;},0)/n:0;
        return {fps:avg?1000/avg:0,meanMs:avg,p50Ms:percentile(frames,.5),p95Ms:percentile(frames,.95),p99Ms:percentile(frames,.99),worstMs:frames.length?Math.max.apply(null,frames):0};}
    function snapshot(windowFrames,timeNow){
        var f=summarize(windowFrames),alive=T.squad.filter(function(s){return s.alive;}).length,
            zn=(T.zombies||[]).filter(function(z){return z.alive;}).length,dc=drawN?Math.round(drawTotal/drawN):0,
            mem=performance.memory?Math.round(performance.memory.usedJSHeapSize/1024/1024):null;
        return {sec:+((timeNow-testStart)/1000).toFixed(1),scenario:scenario,
            fps:+f.fps.toFixed(1),meanMs:+f.meanMs.toFixed(2),p50Ms:+f.p50Ms.toFixed(2),p95Ms:+f.p95Ms.toFixed(2),p99Ms:+f.p99Ms.toFixed(2),worstMs:+f.worstMs.toFixed(2),
            activeSoldiers:alive,allSoldiers:T.squad.length,friendly:T.squad.filter(function(s){return s.alive&&s.team==='friendly';}).length,
            enemy:T.squad.filter(function(s){return s.alive&&s.team==='enemy';}).length,zombies:zn,pooledZombies:Z?Z.pool.length:0,
            pendingZombies:Z&&Z.queue?Z.queue.left:0,traps:traps.length,buildingStates:town?town.buildings.map(function(b){return b.state;}):[],
            drawCalls:dc,aiZombieMs:Z?+(Z.ms||0).toFixed(2):null,heapMB:mem,
            dualCamera:!!extraCamera,mainCamera:input.fps?'FPS':'RTS',navBusy:navBusy,phase:sim?sim.phase:'manual',zombiesKilled:zKilled};
    }
    function tick(now){
        if(!firstFrame)firstFrame=lastFrame=now;
        var dt=now-lastFrame;lastFrame=now;
        if(dt>0&&dt<30000){metrics.frameN++;metrics.worst=Math.max(metrics.worst,dt);
            if(dt>33.3)metrics.spikes33++;if(dt>50)metrics.spikes50++;if(dt>100)metrics.spikes100++;
            frameTimes.push(+dt.toFixed(3));if(frameTimes.length>30000)frameTimes.shift();
            thisSecond.push(dt);if(thisSecond.length>500)thisSecond.shift();}
        frameOverlay(now);
        if(now-lastSeconds>=1000){
            var sample=snapshot(thisSecond,now);samples.push(sample);if(samples.length>3600)samples.shift();
            $('metrics').textContent=sample.fps.toFixed(0)+' FPS  mean '+sample.meanMs.toFixed(1)+'ms  p99 '+sample.p99Ms.toFixed(0)+'ms\n'+
                'worst: '+metrics.worst.toFixed(0)+'ms   spikes >50ms: '+metrics.spikes50+'\n'+
                'soldiers: '+sample.activeSoldiers+' ('+sample.friendly+'F/'+sample.enemy+'E)  zombies: '+sample.zombies+'\n'+
                'traps '+sample.traps+'  draw calls '+sample.drawCalls+'\n'+
                'zombie update '+(sample.aiZombieMs==null?'n/a':sample.aiZombieMs.toFixed(1)+'ms')+'   heap '+(sample.heapMB==null?'n/a':sample.heapMB+'MB')+'\n'+
                'view '+sample.mainCamera+(sample.dualCamera?' + second camera':'')+
                (isRunning?'\nRECORDING '+Math.max(0,Math.ceil((runUntil-now)/1000))+'s':'');
            drawTotal=0;drawN=0;thisSecond=[];lastSeconds=now;
            if(isRunning&&now>=runUntil){isRunning=false;log('BENCHMARK COMPLETE','60s elapsed; save JSON/CSV.');}
        }
        requestAnimationFrame(tick);
    }
    var thisSecond=[];requestAnimationFrame(tick);
    function scenarioSetup(which) {
        // A fresh stress.html reload ensures there are no leftover soldiers, corpses, traps or building state changes.
        var url = new URL(location.href);url.searchParams.set('scenario',which);url.searchParams.set('stress','1');
        location.assign(url.href);
    }
    function applyScenario(which) {
        var load={light:{f:0,e:0,z:20,t:2},medium:{f:1,e:2,z:50,t:8},heavy:{f:3,e:4,z:100,t:16}}[which];
        if(!load)return;
        scenario=which;log('SCENARIO',which+' preset: +'+load.f+' friendly / +'+load.e+' enemy squads, '+load.z+' zombies, '+load.t+' traps');
        var actions=[];
        for(var i=0;i<load.f;i++)actions.push(function(){spawnSquad('friendly',true);});
        for(var j=0;j<load.e;j++)actions.push(function(){spawnSquad('enemy',true);});
        actions.push(function(){zombies(load.z);});
        actions.push(function(){var f=basePoint('enemy');for(var k=0;k<load.t;k++){
            var th=(k*137.50776)*Math.PI/180,rad=5+(k%4)*4;
            trapAt([f[0]+Math.cos(th)*rad,f[1],f[2]+Math.sin(th)*rad],true);
        }});
        actions.forEach(function(fn,k){pauseTasks.push(setTimeout(function(){try{fn();}catch(e){warn(e);}},500+k*750));});
        // Run after spawn/asset warm-up; one gameplay+render measurement window.
        pauseTasks.push(setTimeout(function(){
            // Record while the actual combat AI, 2nd camera and existing building nav rebuilds are active.
            if (which!=='light' && !extraCamera) toggleDual();
            startRecording(60);
            if (which!=='light') {
                pauseTasks.push(setTimeout(function(){var n=town&&town.buildings&&town.buildings[0];if(n)blast([n.x,0,n.z],8,true);else blast(focus(),8,false);},8000));
                pauseTasks.push(setTimeout(function(){blast(basePoint('enemy'),10,false);},16000));
                pauseTasks.push(setTimeout(function(){var n=town&&town.buildings&&town.buildings[1];if(n)blast([n.x,0,n.z],9,true);},30000));
            } else pauseTasks.push(setTimeout(function(){blast(basePoint('enemy'),7,false);},14000));
        },500+actions.length*750+1000));
    }
    function startRecording(seconds){
        isRunning=true;scenario=scenario||'manual';runStart=performance.now();runUntil=runStart+(seconds||60)*1000;
        metrics={spikes33:0,spikes50:0,spikes100:0,worst:0,frameN:0};frameTimes.length=0;samples.length=0;
        log('RECORD','Started '+seconds+'s browser benchmark');
    }
    hook('record',function(){scenario='manual';startRecording(60);});
    hook('low',function(){scenarioSetup('light');});hook('mid',function(){scenarioSetup('medium');});hook('heavy',function(){scenarioSetup('heavy');});
    hook('reset',function(){location.assign(location.pathname);});
    function report(){var now=performance.now();return {title:'DREADING sandbox results',metadata:savedInfo,
        scenario:scenario,recording:isRunning,reportedAt:new Date().toISOString(),elapsedSec:+((now-testStart)/1000).toFixed(1),
        summary:Object.assign(summarize(frameTimes),metrics),samples:samples.slice(),frameTimesMs:frameTimes.slice(),
        buildingNavOperations:navOperations.slice(),events:events.slice(),zombieManager:Z?Z.stats:null,
        gameCombat:T.combat?T.combat.counters:null,sim:sim?{preset:sim.preset,phase:sim.phase,timeline:sim.timeline,result:sim.result}:null,kills:kills,deaths:deaths.slice(),spawnedSquads:squads.map(function(q){return {id:q.id,team:q.team,role:q.role,anchor:q.anchor,alive:q.members.filter(function(s){return s.alive;}).length};}),validation:{multiplayer:'not included in this local export',buildingDamage:'original 3-state mesh swaps + navmesh rebuild',traps:'added only in stress test',dualCamera:'2 camera passes in same client, not networking'}};}
    function save(name,body,mime){var b=new Blob([body],{type:mime}),url=URL.createObjectURL(b),a=document.createElement('a');
        a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
    hook('json',function(){save('dreading-stress-'+scenario+'-'+Date.now()+'.json',JSON.stringify(report(),null,2),'application/json');});
    hook('csv',function(){var rows=samples.slice(),cols=['sec','scenario','fps','meanMs','p50Ms','p95Ms','p99Ms','worstMs','activeSoldiers','friendly','enemy','zombies','pooledZombies','pendingZombies','traps','drawCalls','aiZombieMs','heapMB','dualCamera','mainCamera','navBusy','phase','zombiesKilled'];
        var csv=[cols.join(',')].concat(rows.map(function(r){return cols.map(function(c){return JSON.stringify(r[c]==null?'':r[c]);}).join(',');})).join('\r\n');save('dreading-stress-'+scenario+'-'+Date.now()+'.csv',csv,'text/csv');});
    /* ---------- SANDBOX: kill accounting (wraps the real damage path, read-only) ---------- */
    var kills = {friendlyKilledEnemy: 0, enemyKilledFriendly: 0, friendlyKilledZombie: 0, enemyKilledZombie: 0, zombieKilledFriendly: 0, zombieKilledEnemy: 0, other: 0}, zKilled = 0, deaths = [];
    if (T.combat && T.combat.applyDamage && !T.combat._sbWrapped) {
        var ad = T.combat.applyDamage; T.combat._sbWrapped = true;
        T.combat.applyDamage = function (v, dmg, a, part, dir) {
            var was = v && v.alive, r = ad.apply(this, arguments);
            if (was && v && !v.alive) {
                var at = a ? (a.isZombie ? 'zombie' : a.team) : null, vt = v.isZombie ? 'zombie' : v.team, key = null;
                if (vt === 'zombie') { zKilled++; key = at === 'friendly' ? 'friendlyKilledZombie' : at === 'enemy' ? 'enemyKilledZombie' : null; }
                else if (at === 'zombie') key = vt === 'friendly' ? 'zombieKilledFriendly' : 'zombieKilledEnemy';
                else if (at === 'friendly' && vt === 'enemy') key = 'friendlyKilledEnemy';
                else if (at === 'enemy' && vt === 'friendly') key = 'enemyKilledFriendly';
                kills[key || 'other']++;
                if (vt !== 'zombie') deaths.push({t: +T.elapsed.toFixed(1), who: v.soldierName, team: vt, by: a ? (a.soldierName || 'zombie') : '?', phase: sim ? sim.phase : 'manual'});
            }
            return r;
        };
    }
    /* ---------- SANDBOX: hands-off sim match ---------- */
    var SIMP = {light: {f: 0, e: 1, wave: 10, waveEvery: 50, cap: 40}, medium: {f: 1, e: 2, wave: 20, waveEvery: 45, cap: 80}, heavy: {f: 2, e: 4, wave: 30, waveEvery: 40, cap: 150}};
    var PH = {scout: 20, setup: 15, limit: +(new URLSearchParams(location.search).get('limit')) || 420};
    var origHear = Z && Z.hear, origInit = T.initiative;
    function simStart(preset) {
        var P = SIMP[preset] || SIMP.medium; scenario = 'sim-' + preset;
        sim = {preset: preset, P: P, t0: T.elapsed, phase: 'scout', result: null, lastWave: 0, waves: 0, timeline: [], startF: 0, startE: 0};
        for (var i = 0; i < P.f; i++) spawnSquad('friendly', true);
        for (var j = 0; j < P.e; j++) spawnSquad('enemy', true, j % 2 ? 'hunt' : 'defend');
        sim.startF = aliveTeam('friendly').length; sim.startE = aliveTeam('enemy').length;
        T.sandbox = true; T.initiative = false; huntOn = false;
        if (Z) { Z.on = false; Z.hear = function () {}; }
        var fr = aliveTeam('friendly'), obj = ORD.objective(), c = ORD.bCentroid(fr), sp = navNearest([c[0] + (obj[0] - c[0]) * 0.4, c[1], c[2] + (obj[2] - c[2]) * 0.4], {x: 4, y: 3, z: 4});
        if (sp) ORD.moveGroup(fr, sp, obj);
        phaseLog('scout', 'friendlies scout forward, zombies calm, weapons tight');
        startRecording(PH.limit + 30);
        $('simwrap').style.display = 'block';
    }
    function phaseLog(ph, text) { sim.phase = ph; sim.timeline.push({t: +(T.elapsed - sim.t0).toFixed(1), phase: ph, text: text}); log('PHASE ' + ph.toUpperCase(), text); }
    function simTick() {
        if (!sim || sim.result) return;
        var t = T.elapsed - sim.t0, fr = aliveTeam('friendly'), en = aliveTeam('enemy');
        if (sim.phase === 'scout' && t >= PH.scout) {
            phaseLog('setup', 'defenders on their angles, friendlies take cover; still no shooting');
            ORD.assignSectors(fr, threatFor('friendly'));
            squads.forEach(function (q) { if (q.team === 'enemy' && q.role === 'defend') setupEnemySquad({members: q.members.filter(function (s) { return s.alive; }), anchor: q.anchor, role: 'defend'}); });
        } else if (sim.phase === 'setup' && t >= PH.scout + PH.setup) {
            phaseLog('fight', 'weapons free: friendly assault, enemy patrols hunt, zombie waves drawn by noise');
            if (Z) { Z.hear = origHear; Z.on = true; }
            T.sandbox = false; T.initiative = true; huntOn = true; /* the base game's own match rules (wipe / objective held / time limit) now apply */
            try { ORD.order(); } catch (e) { warn(e); }
            sim.lastWave = t;
            queueSimWave();
        } else if (sim.phase === 'fight') {
            if (t - sim.lastWave >= sim.P.waveEvery) { sim.lastWave = t; queueSimWave(); }
            if (T.outcome) return simEnd(T.outcome.winner, T.outcome.text);
            if (!en.length) return simEnd('friendly', 'Enemy wiped out');
            if (!fr.length) return simEnd('enemy', 'Friendly squad wiped out');
            if (t >= PH.limit) return simEnd('draw', 'Sandbox time limit (' + PH.limit + ' s)');
        }
    }
    function queueSimWave() { if (!Z || !Z.ready) return; var alive = (T.zombies || []).filter(function (z) { return z.alive; }).length, n = Math.min(sim.P.wave, sim.P.cap - alive); if (n > 0) { Z.queueWave(n, 'sim'); sim.waves++; log('ZOMBIE WAVE', n + ' (sim wave ' + sim.waves + ')'); } }
    function simEnd(winner, text) {
        var t = +(T.elapsed - sim.t0).toFixed(1);
        sim.result = {winner: winner, text: text, simTime: t, friendlyAlive: aliveTeam('friendly').length + '/' + sim.startF, enemyAlive: aliveTeam('enemy').length + '/' + sim.startE, zombiesKilled: zKilled, kills: Object.assign({}, kills), perf: Object.assign(summarize(frameTimes), {spikes50: metrics.spikes50})};
        phaseLog('done', winner.toUpperCase() + ': ' + text);
        T.sandbox = true; T.initiative = origInit;
        setTimeout(function () { T.paused = true; }, 3000);
        if (isRunning) { isRunning = false; }
        console.log('SANDBOX_SIM_RESULT', JSON.stringify(sim.result));
    }
    function scoreText() {
        var fr = aliveTeam('friendly').length, en = aliveTeam('enemy').length, zn = (T.zombies || []).filter(function (z) { return z.alive; }).length, k = kills;
        var s = (sim ? 'SIM ' + sim.preset + '  phase ' + sim.phase.toUpperCase() + '  t ' + (T.elapsed - sim.t0).toFixed(0) + ' s / ' + PH.limit + '\n' : 'manual sandbox  t ' + T.elapsed.toFixed(0) + ' s\n') +
            'alive  friendly ' + fr + (sim ? '/' + sim.startF : '') + '   enemy ' + en + (sim ? '/' + sim.startE : '') + '\n' +
            'zombies alive ' + zn + '   killed ' + zKilled + '\n' +
            'kills  F>E ' + k.friendlyKilledEnemy + '  E>F ' + k.enemyKilledFriendly + '  Z>F ' + k.zombieKilledFriendly + '  Z>E ' + k.zombieKilledEnemy + '\n' +
            'zombies shot  by F ' + k.friendlyKilledZombie + '  by E ' + k.enemyKilledZombie;
        if (sim && sim.result) s += '\n\nRESULT: ' + sim.result.winner.toUpperCase() + ' - ' + sim.result.text + ' at ' + sim.result.simTime + ' s\nperf: ' + sim.result.perf.fps.toFixed(0) + ' fps avg, p99 ' + sim.result.perf.p99Ms.toFixed(0) + ' ms, frames >50 ms: ' + sim.result.perf.spikes50;
        return s;
    }
    var simAcc = 0;
    app.on('update', function (dt) {
        if (!T.ready) return;
        if (sim && (sim.phase === 'scout' || sim.phase === 'setup')) for (var i = 0; i < T.squad.length; i++) { var o = T.squad[i].order; if (o) o.holdFire = true; }
        if (sim && sim.phase === 'fight' && !sim.released) { sim.released = true; T.squad.forEach(function (s) { if (s.order) s.order.holdFire = false; }); }
        simAcc += dt; if (simAcc < 0.5) return; simAcc = 0;
        if (!T.paused && T.running) { try { huntTick(T.elapsed); simTick(); } catch (e) { warn(e); } }
        var el = $('score'); if (el) el.textContent = scoreText();
    });
    hook('sim', function () { var p = $('simpreset').value; var url = new URL(location.href); url.search = '?sim=' + p; location.assign(url.href); });
    window.dreadingStress=window.dreadingSandbox={removeSoldier:removeSoldier,removeLastSquad:removeLastSquad,clearSoldiers:clearSoldiers,clearZombies:clearZombies,removeSelected:removeSelected,simStart:simStart,sim:function(){return sim;},squads:function(){return squads;},kills:kills,spawnSquad:spawnSquad,queueZombies:zombies,trapAt:trapAt,blast:blast,setBuilding:setBuilding,
        report:report,metrics:metrics,startRecording:startRecording,app:app};
    window.addEventListener('beforeunload',function(){T.sandbox=previousSandbox;pauseTasks.forEach(clearTimeout);});
    log('READY','Additive mode attached to original game; default gameplay preserved in index.html');
    var qs=new URLSearchParams(location.search),desired=qs.get('scenario');if(desired)applyScenario(desired);
    var simP=qs.get('sim');if(simP){$('simpreset').value=simP;pauseTasks.push(setTimeout(function(){try{simStart(simP);}catch(e){warn(e);}},1500));}
}
})();
