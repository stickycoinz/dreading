if(new URLSearchParams(location.search).get("hordeTest")!=="1"){
/* DREADING objectives v2 (2026-11-19). Host-authoritative capture points, generators, research and reinforcement credits.
   Rules (values live in DreadingObjectives.config; F12 console edits apply live on the host):
   - 20 points spread over reachable navmesh: 5 REINFORCEMENT, 5 AMMO, 5 MEDICAL, 5 RESEARCH.
   - Capture: stand within 9 m for 8 s. A side's FIRST capture of a point pays +1 troop credit (4 credits = basic 4-person squad).
     Recaptures and contested time never pay again.
   - Power is deliberate: every point has 3 generators at the surrounding buildings. Start one by holding E next to it in first person
     (3 s) or by parking a commanded soldier on it (6 s). Each generator pays +1 RESEARCH once per side (carried by the soldier who started it).
     A point is POWERED for its owner when the owner holds the point and all 3 of its generators are switched on by that side.
     Enemies can take a generator over the same way (it then counts for them).
   - Research must be DELIVERED: a carrier who enters an owned, uncontested RESEARCH point cashes in 1 credit per research
     (2 per research if that research point is powered). A carrier who dies drops the research on the ground for 90 s; anyone can pick it up.
   - Powered benefits: REINFORCEMENT +1 credit every 45 s per side (not per point) and squads deploy there (forward deploy);
     AMMO full reserves + frag grenade restock (unpowered: +1 magazine/s); MEDICAL 12 HP/s (unpowered 4 HP/s); RESEARCH pays double.
   - Power is loud and bright: nearby idle zombies are drawn to powered points every 8 s and 6-runner waves are requested on activation
     and every 60 s, through the same bounded queue / alive cap / one-spawn-per-tick limit as before. */
(function () {
  "use strict";
  const CONTROL=new URLSearchParams(location.search).get("mode")==="control";
  const CFG = {
    unlimitedFunds: !CONTROL, points: CONTROL?3:20, captureRadius: 9, captureDy: 4, captureSeconds: CONTROL?10:8,
    genRadiusFP: 2.4, genRadiusAI: 3, genDy: 2.5, genSecondsFP: 3, genSecondsAI: 6, genResearch: 1,
    researchCredit: 1, researchCreditPowered: 2, dropSeconds: 90, pickupRadius: 2.5,
    incomeSeconds: 45, medHps: 4, medHpsPowered: 12, ammoMagsPerSec: 1, fragEvery: 20, fragMax: 2,
    attractRadius: 90, humEvery: 8, raidEvery: 60, raidSize: 6, raidQueueMax: 24, squadSize: 4,
  };
  const O = (window.DreadingObjectives = {
    version: 2, config: CFG, ready: false, feedback: [],
    state: { v: 2, points: [], credits: CONTROL?[4,4]:[1000000,1000000], research: [0, 0], carry: {}, drops: [], message: ["", ""], events: [], seq: 0 },
  });
  const KIND = {
    reinforcement: { label: "REINFORCEMENT", short: "REINF", icon: "⚑", benefit: "Powered: +1 credit / 45 s and squads deploy here" },
    ammo: { label: "AMMO SUPPLY", short: "AMMO", icon: "▤", benefit: "Refills ammo · powered: full reserves + frag grenades" },
    medical: { label: "MEDICAL", short: "MED", icon: "✚", benefit: "Heals 4 HP/s · powered: 12 HP/s" },
    research: { label: "RESEARCH LAB", short: "RSCH", icon: "◆", benefit: "Deliver research here: 1 credit each · powered: 2" },
  };
  O.kindInfo = KIND;
  let T, N, acc = 0, supply = 0;
  O.presets = DreadingCatalogue.presets;
  O.kits = DreadingCatalogue.kits;
  const hyp = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const live = (s) => s && s.alive && !s.disabled;
  function event(type, side, o, extra) {
    const S = O.state, e = { seq: ++S.seq, type, side, point: o ? o.name : null, at: +(T?.elapsed || 0).toFixed(2), ...(extra || {}) };
    S.events.push(e);
    if (S.events.length > 24) S.events.shift();
    return e;
  }
  O.receive = (s) => {
    if (s && !N?.isHost && s.v === 2) O.state = s;
  };
  /* ---------------- host: point + generator placement ---------------- */
  function pathOk(a, b, tol = 2) {
    try {
      const path = T.navigation.path(a, b), e = path && path[path.length - 1];
      return !!e && Math.hypot(e[0] - b[0], e[2] - b[2]) < tol && Math.abs(e[1] - b[1]) < 1.5;
    } catch (err) {
      return false;
    }
  }
  function snap(p, h = 4) {
    const q = T.navigation.nearest(p, { x: h, y: 4, z: h });
    return q ? [q[0], q[1], q[2]] : null;
  }
  function placeGenerators(o, taken) {
    const B = (T.town?.buildings || []).filter((b) => b && b.type !== "park" && b.state !== "collapsed" && b.id !== o.buildingId && b.rect);
    const cands = B.map((b) => ({ b, d: Math.hypot(b.x - o.p[0], b.z - o.p[2]) })).filter((c) => c.d > 9 && c.d < 48).sort((a, b) => a.d - b.d);
    const out = [];
    const good = (p) => p && hyp(p, o.p) > 7 && taken.every((q) => hyp(q, p) > 6) && out.every((g) => hyp(g.p, p) > 8) && pathOk(o.p, p, 1.5);
    const spread = (p) => out.every((g) => {
      const a = Math.atan2(g.p[2] - o.p[2], g.p[0] - o.p[0]), c = Math.atan2(p[2] - o.p[2], p[0] - o.p[0]);
      return Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) > 0.8;
    });
    for (const pass of [true, false])
      for (const { b } of cands) {
        if (out.length >= 3) break;
        if (out.some((g) => g.buildingId === b.id)) continue;
        const r = b.rect, cx = Math.max(r[0], Math.min(r[2], o.p[0])), cz = Math.max(r[1], Math.min(r[3], o.p[2]));
        let dx = o.p[0] - cx, dz = o.p[2] - cz, L = Math.hypot(dx, dz) || 1;
        const p = snap([cx + (dx / L) * 1.8, b.padY || o.p[1], cz + (dz / L) * 1.8], 3);
        if (!good(p) || (pass && !spread(p))) continue;
        out.push({ p, buildingId: b.id, label: (b.name || b.type) });
      }
    for (let ring = 18; out.length < 3 && ring <= 34; ring += 8)
      for (let k = 0; k < 12 && out.length < 3; k++) {
        const a = (k / 12) * Math.PI * 2 + o.p[0] * 0.01, p = snap([o.p[0] + Math.cos(a) * ring, o.p[1], o.p[2] + Math.sin(a) * ring], 4);
        if (good(p) && spread(p)) out.push({ p, buildingId: null, label: "street" });
      }
    return out.map((g, i) => ({ id: o.name + (i + 1), p: g.p.map((v) => +v.toFixed(2)), buildingId: g.buildingId, label: g.label, on: -1, by: -1, progress: 0, paid: [false, false] }));
  }
  function initialize() {
    const all = T.strategy?.objectives.filter((o) => o.valid && !o.home && o.kind !== "extraction") || [];
    if (all.length < 6 || !T.navigation?.nearest) return false;
    const starts = N.api.spawnPoints, sides = [0, 1].map((s) => starts[N.api.units.findIndex((u) => u._netOwner === s)]);
    const mid = starts.reduce((p, x) => p.map((v, i) => v + x[i] / starts.length), [0, 0, 0]);
    // Only points that sit on the navmesh and that BOTH starting positions can walk to.
    let pool = [];
    for (const o of all) {
      const p = snap(o.p, 8) || snap(o.p, 14);
      if (!p || Math.hypot(p[0] - o.p[0], p[2] - o.p[2]) > 14) continue;
      if (!sides.every((s) => pathOk(s, p))) continue;
      if (sides.some((s) => hyp(s, p) < 25)) continue;
      pool.push({ ...o, p });
    }
    O.rejected = all.length - pool.length;
    if(CONTROL)pool=pool.filter(o=>hyp(o.p,mid)<65);
    const chosen = [];
    while (chosen.length < CFG.points && pool.length) {
      const score = (o) => (chosen.length ? Math.min(...chosen.map((x) => hyp(o.p, x.p)))-(CONTROL?hyp(o.p,mid)*.7:0) : -hyp(o.p, mid));
      pool.sort((a, b) => score(b) - score(a));
      const o = pool.shift();
      chosen.push(o);
      pool = pool.filter((x) => hyp(x.p, o.p) > 14);
    }
    if (chosen.length < (CONTROL?3:8)) return false;
    const kinds = ["reinforcement", "ammo", "medical", "research"], taken = [];
    O.state.points = chosen.map((o, i) => {
      const pt = {
        id: o.id, buildingId: o.buildingId ?? null, name: String.fromCharCode(65 + i), kind: kinds[i % 4], p: o.p.map((v) => +v.toFixed(2)),
        owner: -1, capturing: -1, progress: 0, contested: false, present: [false, false], paid: [false, false], powered: false, gens: [],
      };
      return pt;
    });
    for (const pt of O.state.points) taken.push(pt.p);
    for (const pt of O.state.points) {
      pt.gens = CONTROL?[]:placeGenerators(pt, taken);
      for (const g of pt.gens) taken.push(g.p);
    }
    return true;
  }
  /* ---------------- host: capture ---------------- */
  const lastEvt = new Map();
  function throttled(key, sec = 4) {
    const now = T.elapsed || 0;
    if (now - (lastEvt.get(key) ?? -99) < sec) return false;
    lastEvt.set(key, now);
    return true;
  }
  function inZone(p, o) {
    return hyp(p, o.p) <= CFG.captureRadius && Math.abs(p[1] - o.p[1]) < CFG.captureDy;
  }
  O.captureTick = function (dt) {
    for (const o of O.state.points) {
      const present = [false, false];
      for (const s of T.squad) if (live(s) && inZone(s.pos(), o)) present[s._netOwner] = true;
      o.present = present;
      const was = o.contested;
      o.contested = present[0] && present[1];
      if (o.contested && !was && throttled("c" + o.name)) event("contested", -1, o, { owner: o.owner });
      const side = o.contested ? -1 : present[0] ? 0 : present[1] ? 1 : -1;
      if (side < 0) {
        if (!o.contested) {
          o.progress = Math.max(0, o.progress - dt);
          if (!o.progress) o.capturing = -1;
        }
        continue;
      }
      if (side === o.owner) {
        o.progress = 0;
        o.capturing = -1;
        continue;
      }
      if (o.capturing !== side) {
        o.capturing = side;
        o.progress = 0;
        if (throttled("s" + o.name + side)) event("capStart", side, o, { owner: o.owner });
      }
      o.progress = Math.min(CFG.captureSeconds, o.progress + dt);
      if (o.progress >= CFG.captureSeconds) {
        const prev = o.owner, earned = !o.paid[side];
        o.owner = side;
        o.progress = 0;
        o.capturing = -1;
        if (earned) {
          o.paid[side] = true;
          O.state.credits[side]++;
        }
        O.state.message[side] = "Captured " + o.name + " · " + KIND[o.kind].label + (earned ? " · +1 troop credit" : " · ownership restored (no credit)");
        if (prev >= 0) O.state.message[prev] = "Lost " + o.name + " · " + KIND[o.kind].label;
        event("captured", side, o, { earned, prev });
      }
    }
  };
  /* ---------------- host: generators ---------------- */
  function fpHolders() {
    const m = new Map(), I = T.input, R = N.api?.remote;
    if (I?.fps?.s) m.set(I.fps.s, !!I.keys?.KeyE);
    if (R?.fps?.s) m.set(R.fps.s, !!R.keys?.KeyE);
    return m;
  }
  O.genTick = function (dt) {
    const fp = fpHolders(), sq = T.squad.filter(live).map((s) => [s, s.pos()]);
    for (const o of O.state.points)
      for (const g of o.gens) {
        if (sq.every(([, p]) => hyp(p, g.p) > CFG.genRadiusAI + 1)) {
          if (g.progress) g.progress = Math.max(0, g.progress - dt * 0.5);
          if (!g.progress) g.by = -1;
          g.jam = false;
          continue;
        }
        const work = [[], []];
        for (const [s, p] of sq) {
          if (Math.abs(p[1] - g.p[1]) > CFG.genDy) continue;
          const d = hyp(p, g.p);
          if (fp.has(s)) {
            if (fp.get(s) && d <= CFG.genRadiusFP) work[s._netOwner].push({ s, rate: 1 / CFG.genSecondsFP });
          } else if (!s.controlled && d <= CFG.genRadiusAI) work[s._netOwner].push({ s, rate: 1 / CFG.genSecondsAI });
        }
        g.jam = !!(work[0].length && work[1].length);
        const side = g.jam ? -1 : work[0].length ? 0 : work[1].length ? 1 : -1;
        if (side < 0 || g.on === side) {
          if (!g.jam) g.progress = Math.max(0, g.progress - dt * 0.5);
          if (!g.progress || g.on === side) (g.by = -1), (g.progress = 0);
          continue;
        }
        if (g.by !== side) {
          g.by = side;
          g.progress = 0;
          if (throttled("g" + g.id + side, 3)) event("genStart", side, o, { gen: g.id, p: g.p });
        }
        const best = work[side].sort((a, b) => b.rate - a.rate)[0];
        g.progress = Math.min(1, g.progress + dt * best.rate);
        if (g.progress >= 1) {
          const prev = g.on, reward = !g.paid[side];
          g.on = side;
          g.by = -1;
          g.progress = 0;
          if (reward) {
            g.paid[side] = true;
            O.state.carry[best.s.uid] = (O.state.carry[best.s.uid] || 0) + CFG.genResearch;
          }
          O.state.message[side] =
            "Generator " + g.id + " online (" + o.gens.filter((x) => x.on === side).length + "/3)" + (reward ? " · +" + CFG.genResearch + " research carried by " + (best.s.soldierName || "soldier") : "");
          event("genOn", side, o, { gen: g.id, p: g.p, rp: reward ? CFG.genResearch : 0, uid: best.s.uid, prev });
        }
      }
  };
  /* ---------------- host: research carry / drop / deliver ---------------- */
  O.researchTick = function () {
    const S = O.state, now = T.elapsed || 0;
    for (const uid of Object.keys(S.carry)) {
      const s = T.squad.find((u) => String(u.uid) === uid);
      if (live(s)) continue;
      const rp = S.carry[uid];
      delete S.carry[uid];
      if (rp > 0 && s) {
        const p = s.pos().map((v) => +v.toFixed(2));
        S.drops.push({ id: ++S.seq, p, rp, t: now });
        event("dropped", s._netOwner, null, { rp, p });
        S.message[s._netOwner] = (s.soldierName || "Carrier") + " died · " + rp + " research dropped (90 s to recover)";
      }
    }
    S.drops = S.drops.filter((d) => {
      if (now - d.t > CFG.dropSeconds) {
        event("dropLost", -1, null, { rp: d.rp, p: d.p });
        return false;
      }
      const s = T.squad.find((u) => live(u) && hyp(u.pos(), d.p) <= CFG.pickupRadius && Math.abs(u.pos()[1] - d.p[1]) < 3);
      if (!s) return true;
      S.carry[s.uid] = (S.carry[s.uid] || 0) + d.rp;
      event("pickup", s._netOwner, null, { rp: d.rp, p: d.p });
      S.message[s._netOwner] = (s.soldierName || "Soldier") + " picked up " + d.rp + " research";
      return false;
    });
    for (const o of S.points) {
      if (o.kind !== "research" || o.owner < 0 || o.contested) continue;
      let rp = 0;
      for (const uid of Object.keys(S.carry)) {
        const s = T.squad.find((u) => String(u.uid) === uid);
        if (!live(s) || s._netOwner !== o.owner || !inZone(s.pos(), o)) continue;
        rp += S.carry[uid];
        delete S.carry[uid];
      }
      if (!rp) continue;
      const credits = rp * (o.powered ? CFG.researchCreditPowered : CFG.researchCredit);
      S.credits[o.owner] += credits;
      S.research[o.owner] += rp;
      S.message[o.owner] = "Research delivered at " + o.name + ": " + rp + " → +" + credits + " credit" + (credits === 1 ? "" : "s");
      event("delivered", o.owner, o, { rp, credits });
    }
  };
  O.carried = function (side) {
    let rp = 0, n = 0;
    for (const [uid, v] of Object.entries(O.state.carry)) {
      const s = T?.squad.find((u) => String(u.uid) === uid);
      if (s && s._netOwner === side) (rp += v), n++;
    }
    return { rp, carriers: n };
  };
  /* ---------------- host: resupply ---------------- */
  O.resupply = function (dt) {
    for (const o of O.state.points) {
      if (o.owner < 0 || o.contested || !["ammo", "medical"].includes(o.kind)) continue;
      for (const s of T.squad) {
        if (!live(s) || s._netOwner !== o.owner || !inZone(s.pos(), o)) continue;
        if (o.kind === "medical") s.health = Math.min(TacticalCombat.TUNING.health, s.health + (o.powered ? CFG.medHpsPowered : CFG.medHps) * dt);
        else {
          for (const a of s.loadout || []) {
            const cap = a.def.reserve || a.def.mag * 5;
            a.reserve = o.powered ? Math.max(a.reserve, cap) : Math.min(Math.max(a.reserve, cap), a.reserve + Math.ceil(a.def.mag * CFG.ammoMagsPerSec * dt));
          }
          if (o.powered && s.nadeInv) {
            s._objFrag = (s._objFrag || 0) + dt;
            if (s._objFrag >= CFG.fragEvery && (s.nadeInv.frag || 0) < CFG.fragMax) {
              s._objFrag = 0;
              s.nadeInv.frag = (s.nadeInv.frag || 0) + 1;
            }
          }
        }
      }
    }
  };
  /* ---------------- host: deploy ---------------- */
  O.slots = function (side) {
    const mine = (T?.squad || []).filter((s) => s._netOwner === side), active = mine.filter(live).length;
    return { total: mine.length, active, free: mine.length - active };
  };
  O.forwardPoint = function (side) {
    const f = O.state.points.filter((o) => o.kind === "reinforcement" && o.owner === side && o.powered && !o.contested);
    if (!f.length) return null;
    const mine = T.squad.filter((s) => live(s) && s._netOwner === side);
    if (!mine.length) return f[0];
    const c = mine.reduce((a, s) => a.map((v, i) => v + s.pos()[i] / mine.length), [0, 0, 0]);
    return f.sort((a, b) => hyp(a.p, c) - hyp(b.p, c))[0];
  };
  const handled = [new Set(), new Set()];
  O.request = function (side, tier, req) {
    if (req != null) {
      const key = String(req).slice(0, 64), seen = handled[side];
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > 64) seen.delete(seen.values().next().value);
    }
    return O.deploy(side, tier);
  };
  O.deploy = function (side, tier = "recruits") {
    if (!Object.hasOwn(O.presets, tier)) return false;
    const preset = O.presets[tier], unitCount = preset.guns.length;
    if (!N.isHost || ![0, 1].includes(side) || !DreadingMPPrep.state.plans[side]) return false;
    const free = T.squad.filter((s) => s._netOwner === side && (s.disabled || !s.alive));
    if (O.state.credits[side] < preset.cost || free.length < unitCount) {
      O.state.message[side] =
        free.length < unitCount
          ? "No room: " + (T.squad.filter((s) => s._netOwner === side).length) + " troops max per side, " + free.length + " slot(s) free; this purchase needs " + unitCount + "."
          : "Need " + preset.cost + " credits for " + preset.name + " (have " + O.state.credits[side] + ").";
      return false;
    }
    const kits = O.kits(tier).map(u=>({...u,packageId:tier})), fwd = O.forwardPoint(side);
    const base = fwd ? fwd.p : N.api.spawnPoints[N.api.units.findIndex((s) => s._netOwner === side)];
    for (let i = 0; i < unitCount; i++) {
      const s = free[i], u = kits[i];
      delete O.state.carry[s.uid];
      if (window.DreadingFireSupport) delete DreadingFireSupport.operators[s.uid];
      s.disabled = false;
      s.entity.enabled = true;
      s.reset();
      const pos = T.navigation.nearest([base[0] + i * 1.5, base[1], base[2] + 3], { x: 6, y: 6, z: 6 }) || base;
      s.entity.setPosition(...pos);
      s.role = u.cls;
      s.soldierName = u.name;
      s.prepKit = u;
      s.loadout = [TacticalNS.makeArms(TacticalNS.WEAPONS[u.primary]), TacticalNS.makeArms(TacticalNS.WEAPONS[u.secondary])];
      s.armsIdx = 0;
      s.arms = s.loadout[0];
      s.nadeInv = { ...u.grenades };
      if (tier === "elite") s.loadout[0].def = { ...s.loadout[0].def, noise: 22, loud: false, suppressed: true };
    }
    const key = "reinforcement-" + side + "-" + free[0].uid;
    free.slice(0, unitCount).forEach((s) => (s.squadKey = key));
    DreadingPrep.applyLocalKits({ squad: free.slice(0, unitCount) }, { squad: kits });
    if (!CFG.unlimitedFunds) O.state.credits[side] -= preset.cost;
    O.state.message[side] = preset.name + " deployed " + (fwd ? "at powered point " + fwd.name : "at your starting position") + ".";
    event("deployed", side, fwd, { tier });
    return true;
  };
  /* ---------------- host: power + zombie pressure ---------------- */
  const raids = [], lastRaid = new Map(), income = [0, 0], objBuildings = new Set();
  let hum = 0, allowPower = false;
  O.debug = { raids, lastRaid, income };
  function guardPower() {
    const P = T.power;
    if (!P || P._objGuard) return;
    const set = P.set;
    P._objGuard = true;
    // Objective buildings are powered only by their generators (no auto power from standing inside, no L-key toggle).
    P.set = function (id, on, team, why) {
      if (objBuildings.has(id) && !allowPower && !(on === false && /collapsed|new match/.test(why || ""))) return false;
      return set.apply(this, arguments);
    };
  }
  function syncBuildingPower(o) {
    if (o.buildingId == null || !T.power) return;
    const want = o.powered, team = o.owner === 0 ? "friendly" : "enemy";
    if (!!T.power.on[o.buildingId] === want && (!want || T.power.team[o.buildingId] === team)) return;
    allowPower = true;
    try {
      T.power.set(o.buildingId, want, want ? team : null, want ? "generators online" : "generators lost");
    } finally {
      allowPower = false;
    }
  }
  O.powerTick = function (dt) {
    const powered = [];
    for (const o of O.state.points) {
      const now = o.owner >= 0 && o.gens.length > 0 && o.gens.every((g) => g.on === o.owner);
      if (now !== o.powered) {
        o.powered = now;
        event(now ? "powered" : "unpowered", o.owner, o, {});
        if (now) O.state.message[o.owner] = o.name + " " + KIND[o.kind].label + " POWERED · " + KIND[o.kind].benefit + " · lights and noise will draw zombies";
      }
      syncBuildingPower(o);
      if (o.powered) powered.push(o);
    }
    for (let side = 0; side < 2; side++) {
      if (powered.some((o) => o.owner === side && o.kind === "reinforcement" && !o.contested)) income[side] += dt;
      else income[side] = Math.min(income[side], CFG.incomeSeconds - 1);
      if (income[side] >= CFG.incomeSeconds) {
        income[side] -= CFG.incomeSeconds;
        O.state.credits[side]++;
        O.state.message[side] = "Powered reinforcement point delivered +1 credit.";
        event("income", side, null, {});
      }
    }
    O.state.income = income.map((v) => +v.toFixed(1));
    hum += dt;
    if (hum >= CFG.humEvery && powered.length) {
      hum = 0;
      for (const z of T.zombies || []) {
        if (!z.alive || z.target?.alive || (z.packRole === "follower" && !z.free)) continue;
        const p = z.pos();
        let o = null, best = CFG.attractRadius;
        for (const q of powered) {
          const d = hyp(q.p, p);
          if (d < best) (best = d), (o = q);
        }
        if (!o) continue;
        T.zombieMgr.releaseFeed?.(z);
        z.noisePos = T.navigation.nearest(o.p, { x: 4, y: 4, z: 4 }) || o.p.slice();
        z.noiseT = T.elapsed;
        z.state = "investigate";
        z.repathT = 0;
      }
    }
    for (const o of powered) {
      if (!lastRaid.has(o.id) || T.elapsed - lastRaid.get(o.id) > CFG.raidEvery) {
        lastRaid.set(o.id, T.elapsed);
        if (raids.length < CFG.raidQueueMax) for (let i = 0; i < CFG.raidSize && raids.length < CFG.raidQueueMax; i++) raids.push(o.p.slice());
      }
    }
    O.raidQueue = raids.length;
    if (!raids.length || !T.zombieMgr) return;
    if (T.zombies.filter((z) => z.alive).length >= Math.min(TacticalZombies.CONFIG.maxAlive, TacticalZombies.CONFIG.timerMaxAlive || 40)) return;
    const rawTarget = raids.shift(), target = T.navigation.nearest(rawTarget, { x: 4, y: 4, z: 4 }) || rawTarget;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2, d = 35 + Math.random() * 15,
        p = T.navigation.nearest([target[0] + Math.cos(a) * d, target[1], target[2] + Math.sin(a) * d], { x: 6, y: 8, z: 6 });
      if (!p || T.squad.some((s) => live(s) && hyp(s.pos(), p) < 20) || !T.zombieMgr.reachable(p, target)) continue;
      const z = T.zombieMgr.spawn(p, "run");
      if (z) {
        z.noisePos = target;
        z.noiseT = T.elapsed;
        z.state = "investigate";
        O.raidSpawned = (O.raidSpawned || 0) + 1;
      }
      break;
    }
  };

  /* =============================== CLIENT PRESENTATION (host and guest) =============================== */
  const css = document.createElement("style");
  css.textContent = `
#capture-objectives{position:fixed;left:50%;bottom:142px;transform:translateX(-50%);z-index:45;padding:6px 10px;color:var(--tlh-text,#e7e9df);font:12px var(--tlh-font,system-ui);display:flex;flex-direction:column;gap:5px;max-width:min(980px,94vw)}
#capture-objectives .dob-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#capture-objectives .dob-credits{font:700 20px var(--tlh-font-mono,monospace);color:var(--tlh-acid,#c6e600);letter-spacing:.04em}
#capture-objectives .dob-sub{font:10.5px var(--tlh-font-mono,monospace);color:var(--tlh-muted,#9aa39a);line-height:1.35}
#capture-objectives .dob-chips{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px}
#capture-objectives .dob-chip{height:30px;min-width:54px;background:transparent;color:var(--tlh-text,#e7e9df);border:1px solid var(--tlh-edge,#3a463d);font:600 12px var(--tlh-font-mono,monospace);cursor:pointer;padding:0 3px;white-space:nowrap;position:relative;overflow:hidden}
#capture-objectives .dob-chip i{font-style:normal;font-weight:400;font-size:10px;opacity:.85}
#capture-objectives .dob-chip b{position:absolute;left:0;bottom:0;height:3px;background:#c6e600;transition:width .15s linear}
#capture-objectives select{background:#172126;color:#e7e9df;padding:6px;max-width:240px}
#capture-objectives .dob-buy{padding:6px 10px;background:transparent;color:var(--tlh-acid,#c6e600);border:1px solid var(--tlh-edge,#3a463d);font:600 12px var(--tlh-font,system-ui);letter-spacing:.08em;white-space:nowrap;cursor:pointer}
#capture-objectives.dob-fp{bottom:16px;padding:4px 10px;max-width:46vw}
#capture-objectives.dob-fp .dob-chips,#capture-objectives.dob-fp select,#capture-objectives.dob-fp .dob-buy,#capture-objectives.dob-fp .dob-help{display:none}
#capture-objectives.dob-fp .dob-credits{font-size:15px}
#dob-bar{position:fixed;left:50%;top:142px;transform:translateX(-50%);z-index:46;width:min(560px,64vw);pointer-events:none;display:none;background:rgba(8,12,10,.78);border:1px solid #3a463d;padding:7px 12px 8px;color:#ecebe4;font:12px var(--tlh-font,system-ui);text-align:center;box-shadow:0 2px 14px rgba(0,0,0,.5)}
#dob-bar .t{font:700 18px var(--tlh-font-mono,monospace);letter-spacing:.12em}
#dob-bar .track{position:relative;height:16px;margin:6px 0 4px;background:#1b221e;border:1px solid #56645a;overflow:hidden}
#dob-bar .fill{position:absolute;left:0;top:0;bottom:0;width:0;background:#c6e600;transition:width .16s linear}
#dob-bar .pct{position:absolute;inset:0;font:700 12px/16px var(--tlh-font-mono,monospace);color:#fff;text-shadow:0 0 3px #000}
#dob-bar .s{font:11px var(--tlh-font-mono,monospace);color:#c9cec4;letter-spacing:.04em}
#dob-bar.contested .track{background:repeating-linear-gradient(45deg,#4a2a10 0 8px,#2b1a0c 8px 16px)}
#dob-bar.contested .fill{background:#ff9d2e}
#dob-bar.enemy .fill{background:#e0524c}
#dob-banner{position:fixed;left:50%;top:30vh;transform:translateX(-50%);z-index:47;pointer-events:none;text-align:center;opacity:0;transition:opacity .25s;color:#c6e600;text-shadow:0 0 12px rgba(0,0,0,.9),0 0 3px #000}
#dob-banner .t{font:800 38px var(--tlh-font-mono,monospace);letter-spacing:.18em}
#dob-banner .s{font:600 15px var(--tlh-font,system-ui);letter-spacing:.08em;color:#ecebe4}
.capture-world-marker{position:fixed;z-index:35;pointer-events:none;background:rgba(10,14,12,.72);border:1px solid #3a463d;padding:2px 4px;font:11px/1.25 var(--tlh-font-mono,monospace);width:118px;text-align:center;transform:translate(-50%,-100%);white-space:nowrap;overflow:hidden;font-variant-numeric:tabular-nums;transition:opacity .18s}
.capture-world-marker .k{font-weight:700;font-size:12px}
.dob-gen-marker{position:fixed;z-index:34;pointer-events:none;font:10px/1.2 var(--tlh-font-mono,monospace);background:rgba(10,14,12,.65);border:1px solid #3a463d;padding:1px 3px;width:64px;text-align:center;transform:translate(-50%,-100%);white-space:nowrap;transition:opacity .18s}
/* 2026-11-19 RTS command-screen HUD (command view only; every rule is scoped to RTS so the first-person HUD keeps its layout) */
#dob-strip{position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:44;display:flex;align-items:center;height:24px;box-sizing:border-box;padding:0 3px;white-space:nowrap;pointer-events:auto}
#dob-strip .dob-s{display:inline-flex;align-items:center;height:16px;padding:0 9px;border-left:1px solid rgba(150,230,110,.18)}
#dob-strip .dob-s:first-child{border-left:0}
#dob-strip [data-k=cr]{color:#c6e600}
#dob-strip .dob-s-btn{background:none;border:0;border-left:1px solid rgba(150,230,110,.18);color:#b9cdb0;font:10px/16px var(--tlh-font-mono,monospace);letter-spacing:.1em;text-transform:uppercase;cursor:pointer;gap:5px}
#dob-strip .dob-s-btn:hover{color:#fff;background:rgba(198,230,0,.08)}
#dob-strip .dob-s-btn.on{color:#c6e600;background:rgba(198,230,0,.1)}
#dob-strip .dob-s-btn .dh-key{margin-right:0}
#dob-strip [data-k=dep] .dh-led{color:#ffb020}
#dob-strip [data-k=dep].ready .dh-led{color:#c6e600}
#dob-strip #tlh-res{position:static;transform:none;background:none;border:0;box-shadow:none;padding:0 9px 0 6px;font:9.5px/16px var(--tlh-font-mono,monospace);letter-spacing:.14em;text-shadow:none}
#dob-strip #tlh-res .v{font:13px/1 var(--tlh-font-mono,monospace);margin-left:5px}
#dob-side{position:fixed;left:10px;top:30px;z-index:44;width:236px;pointer-events:auto}
#dob-side .dob-sh{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:6px;width:100%;padding:3px 6px;cursor:pointer;font:10px/14px var(--tlh-font-mono,monospace);letter-spacing:.1em;color:#b9cdb0}
#dob-side .dob-sh:hover{color:#fff}
#dob-side .dob-sum{margin-left:auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#eaf4de;letter-spacing:.04em}
#dob-side.alert .dob-sh .dh-led{color:#ffb020;animation:dobblink 1s steps(2) infinite}
#dob-side .dob-sh .dh-led{color:#c6e600}
@keyframes dobblink{50%{opacity:.25}}
#dob-side .dob-list{display:none;max-height:calc(100vh - 290px);overflow:auto;border-top:1px solid rgba(150,230,110,.18);padding:2px 0}
#dob-side.open .dob-list{display:block}
#dob-side .dob-row{all:unset;box-sizing:border-box;position:relative;display:grid;grid-template-columns:8px 12px 14px 1fr 26px 12px;align-items:center;gap:4px;width:100%;padding:0 6px;font:10px/15px var(--tlh-font-mono,monospace);color:#b9cdb0;cursor:pointer}
#dob-side .dob-row:hover,#dob-side .dob-row.sel{background:rgba(198,230,0,.1);color:#fff}
#dob-side .dob-row .dh-led{width:5px;height:5px}
#dob-side .dob-row .g{color:#7c8d74;text-align:right}
#dob-side .dob-row .bar{position:absolute;left:0;bottom:0;height:1px;width:0;background:#c6e600}
/* RTS HUD pass 4 */
#tl-strategy{display:none!important}
#capture-objectives:not(.dob-fp) .dob-why{color:#9fb396}
body:not(.tl-fp) .capture-world-marker{border-left:2px solid currentColor;box-shadow:0 0 0 1px rgba(0,0,0,.5)}
body:not(.tl-fp) .capture-world-marker .d{color:#c9d8bf}
#capture-objectives:not(.dob-fp) .dob-top select,#capture-objectives:not(.dob-fp) .dob-top .dob-buy{display:none}
#capture-objectives .dob-rows{display:flex;flex-direction:column;gap:4px}
#capture-objectives.dob-fp .dob-rows{display:none}
#capture-objectives .dob-sq{display:grid;grid-template-columns:1fr auto;gap:1px 10px;align-items:center;padding:4px 6px;border:1px solid rgba(150,230,110,.2);background:rgba(150,230,110,.04)}
#capture-objectives .dob-sq.ok{border-color:rgba(198,230,0,.55)}
#capture-objectives .dob-sq .nm{font:11.5px/1.2 var(--tlh-font-mono,monospace);color:#eaf4de;letter-spacing:.08em;text-transform:uppercase}
#capture-objectives .dob-sq .gn{font:9.5px/1.25 var(--tlh-font-mono,monospace);color:#9fb396;grid-column:1}
#capture-objectives .dob-sq .rs{font:9.5px/1.25 var(--tlh-font-mono,monospace);color:#ffb020;grid-column:1/3}
#capture-objectives .dob-sq.ok .rs{color:#c6e600}
#capture-objectives .dob-sq button{grid-row:1/3;grid-column:2;font:10.5px/1 var(--tlh-font-mono,monospace);padding:6px 9px;background:transparent;color:#c6e600;border:1px solid rgba(198,230,0,.6);cursor:pointer;letter-spacing:.06em;white-space:nowrap}
#capture-objectives .dob-sq button:disabled{color:#7c8d74;border-color:rgba(150,230,110,.2);cursor:not-allowed}
body:not(.tl-fp) #mp-panel.dh-warn{border-color:#ffb020!important;color:#ffb020!important}
/* RTS HUD pass 2 */ /* RTS HUD pass 3 */
#dob-side:not(.open) .dob-hint{display:none}
#dob-side .dob-hint{padding:2px 6px 3px;font:9px/1.3 var(--tlh-font-mono,monospace);color:#7c8d74;border-top:1px solid rgba(150,230,110,.12)}
#capture-objectives:not(.dob-fp){left:auto;right:10px;bottom:66px;transform:none;width:372px;max-width:calc(100vw - 20px);box-sizing:border-box;padding:6px 10px 8px;gap:6px;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);font:10.5px/1.35 var(--tlh-font-mono,monospace)}
#capture-objectives:not(.dob-fp):not(.dob-open){display:none}
#capture-objectives:not(.dob-fp) .dob-chips{display:none}
#capture-objectives:not(.dob-fp) .dob-top{gap:6px 8px}
#capture-objectives:not(.dob-fp) .dob-credits{font:16px/1 var(--tlh-font-mono,monospace)}
#capture-objectives:not(.dob-fp) .dob-info{flex-basis:100%;order:5;color:#9fb396}
#capture-objectives:not(.dob-fp) select{flex:1;min-width:0;background:#06100c;color:#d3e4c8;border:1px solid rgba(150,230,110,.35);font:10.5px var(--tlh-font-mono,monospace);padding:3px 4px}
#capture-objectives:not(.dob-fp) .dob-buy{font:10.5px var(--tlh-font-mono,monospace);padding:4px 8px;border-color:rgba(198,230,0,.6);letter-spacing:.06em}
#capture-objectives:not(.dob-fp) .dob-help{font-size:9.5px;color:#7c8d74}
#capture-objectives .dob-mh{display:flex;justify-content:space-between;align-items:center;gap:8px;border-bottom:1px solid rgba(150,230,110,.2);padding-bottom:4px;color:#c6e600;letter-spacing:.16em;font:10px/14px var(--tlh-font-mono,monospace);text-transform:uppercase}
#capture-objectives .dob-mh button{background:none;border:1px solid rgba(150,230,110,.35);color:#b9cdb0;font:10px/13px var(--tlh-font-mono,monospace);cursor:pointer;padding:0 6px}
#capture-objectives .dob-why{font:10.5px/1.35 var(--tlh-font-mono,monospace);color:#ffb020}
#capture-objectives .dob-why.ok{color:#c6e600}
#capture-objectives.dob-fp .dob-mh,#capture-objectives.dob-fp .dob-why{display:none}
body:not(.tl-fp) #dob-bar{top:36px;width:420px;padding:3px 10px 4px;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}
body:not(.tl-fp) #dob-bar .t{font:12px/1.25 var(--tlh-font-mono,monospace);letter-spacing:.14em}
body:not(.tl-fp) #dob-bar .track{height:9px;margin:3px 0 2px}
body:not(.tl-fp) #dob-bar .pct{font:9px/9px var(--tlh-font-mono,monospace)}
body:not(.tl-fp) #dob-bar .s{font:9.5px/1.25 var(--tlh-font-mono,monospace);color:#9fb396;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}
body:not(.tl-fp) #dob-banner{top:118px;padding:4px 16px;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}
body:not(.tl-fp) #dob-banner .t{font:18px/1.2 var(--tlh-font-mono,monospace);letter-spacing:.24em}
body:not(.tl-fp) #dob-banner .s{font:10.5px/1.3 var(--tlh-font-mono,monospace);letter-spacing:.1em;text-transform:uppercase}
body:not(.tl-fp) .capture-world-marker{background:rgba(4,10,8,.8);border-color:rgba(150,230,110,.3);font:10px/1.2 var(--tlh-font-mono,monospace);width:108px;padding:1px 3px}
body:not(.tl-fp) .capture-world-marker .k{font-size:10.5px}
body:not(.tl-fp) .capture-world-marker.dob-c{width:auto;padding:0 4px}
body:not(.tl-fp) .capture-world-marker.dob-c .d{display:none}
body:not(.tl-fp) .dob-gen-marker{background:rgba(4,10,8,.72);border-color:rgba(150,230,110,.25);font-size:9px;width:56px;padding:0 2px}
body:not(.tl-fp) #mp-panel{left:10px!important;top:6px!important;padding:2px 8px 3px!important;font:9.5px/1.35 var(--tlh-font-mono,monospace)!important;max-width:330px!important;color:#b9cdb0!important;text-transform:uppercase;letter-spacing:.05em;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}
body:not(.tl-fp) #mp-panel b{display:none;font:9px/1.3 var(--tlh-font-mono,monospace);letter-spacing:.2em;color:#c6e600}
body:not(.tl-fp) #mp-panel small{display:none}
body:not(.tl-fp) #audio-control{top:calc(min(180px,11vw) + 30px)!important;right:10px!important;width:calc(min(180px,11vw) + 14px);box-sizing:border-box;padding:2px 5px!important;font:9px/1.4 var(--tlh-font-mono,monospace)!important;color:#b9cdb0!important;text-transform:uppercase;display:flex;flex-wrap:wrap;align-items:center;gap:2px 5px;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}
body:not(.tl-fp) #audio-control button{font:9px/12px var(--tlh-font-mono,monospace);background:transparent;color:#c6e600;border:1px solid rgba(198,230,0,.5);padding:0 4px;text-transform:uppercase;cursor:pointer}
body:not(.tl-fp) #audio-control input[type=range]{width:54px;height:10px;margin:0 0 0 3px;accent-color:#c6e600;vertical-align:middle}
body:not(.tl-fp) #audio-control input[type=checkbox]{accent-color:#c6e600;margin:0 2px 0 0;width:10px;height:10px;vertical-align:middle}
body:not(.tl-fp):not(.dh-dev) #tl-perf{top:auto!important;bottom:50px!important;right:10px!important;max-height:12px!important;max-width:200px!important;opacity:.5!important;background:none!important;font-size:9px!important;padding:0!important}
body:not(.tl-fp) #dreading-cctv>div:nth-child(4){left:auto!important;top:auto!important;right:10px!important;bottom:36px!important;font:9px/1.2 var(--tlh-font-mono,monospace)!important;letter-spacing:.12em!important;opacity:.6}
body:not(.tl-fp) .dh-tool{bottom:8px!important;padding:2px 8px!important;font:9.5px/1.4 var(--tlh-font-mono,monospace)!important;text-transform:uppercase;letter-spacing:.08em;background:rgba(4,10,8,.76)!important;color:#b9cdb0!important;border:1px solid rgba(150,230,110,.3)!important}
body:not(.tl-fp) .dh-tool:hover{color:#fff!important;border-color:#c6e600!important}
body:not(.tl-fp) .dh-tool-ed{right:10px!important}
body:not(.tl-fp) .dh-tool-anim{right:150px!important}
body:not(.tl-fp) #fire-support-panel{left:10px!important;bottom:80px!important;padding:5px 8px!important;font:10px/1.4 var(--tlh-font-mono,monospace)!important;color:#d3e4c8!important;text-transform:uppercase;background-color:var(--dh-bgc,rgba(4,10,8,.76));background-image:var(--dh-img,none);background-size:var(--dh-size,auto);background-position:var(--dh-pos,0 0);background-repeat:var(--dh-rep,no-repeat);border:1px solid var(--dh-line,rgba(150,230,110,.26));border-radius:0;box-shadow:0 0 0 1px rgba(0,0,0,.45),inset 0 0 14px rgba(120,220,120,.05);}
body:not(.tl-fp) #fire-support-panel button{font:10px var(--tlh-font-mono,monospace);background:transparent;color:#c6e600;border:1px solid rgba(198,230,0,.5);padding:1px 6px;cursor:pointer;text-transform:uppercase}
`;
  document.head.append(css);
  const panel = document.createElement("section");
  panel.id = "capture-objectives";
  panel.className = "tlh tlh-panel";
  panel.innerHTML =
    '<div class="dob-top"><b style="font:11px var(--tlh-font-mono,monospace);letter-spacing:.12em;color:var(--tlh-muted,#9aa39a)">CONTROL</b><span class="dob-credits">0 CR</span><div class="dob-sub dob-info"></div><select aria-label="Reinforcement squad"></select><button class="dob-buy">DEPLOY</button></div><div class="dob-sub dob-help"></div><div class="dob-chips"></div>';
  document.body.append(panel);
  const $ = (q) => panel.querySelector(q),
    creditsEl = $(".dob-credits"), info = $(".dob-info"), help = $(".dob-help"), rows = $(".dob-chips"), choice = $("select"), buy = $(".dob-buy");
  for (const [id, p] of Object.entries(O.presets)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = p.name + " · " + p.cost + " credits";
    choice.append(o);
  }
  const bar = document.createElement("div");
  bar.id = "dob-bar";
  bar.innerHTML = '<div class="t"></div><div class="track"><div class="fill"></div><div class="pct"></div></div><div class="s"></div>';
  const banner = document.createElement("div");
  banner.id = "dob-banner";
  banner.innerHTML = '<div class="t"></div><div class="s"></div>';
  document.body.append(bar, banner);

  /* ---------- 2026-11-19 RTS command-screen HUD: slim top strip, collapsible objectives list (N), reinforcement menu on demand (M) ---------- */
  const RH = (O.rtsHud = { menu: false, list: false, sel: -1, hover: -1, rects: [] });
  const strip = document.createElement("div");
  strip.id = "dob-strip";
  strip.className = "tlh dh";
  strip.innerHTML =
    '<span class="dob-s"><span class="dh-l">CR</span><b class="dh-v" data-k="cr">0</b></span><span class="dob-s" title="Living troops / troop slots"><span class="dh-l">TROOPS</span><b class="dh-v" data-k="tr">0/0</b></span><span class="dob-s" title="Research your soldiers are carrying (deliver to an owned ◆ point)"><span class="dh-l">RSCH</span><b class="dh-v" data-k="rp">0</b></span><span class="dob-s" title="Powered points / points you own"><span class="dh-l">PWR</span><b class="dh-v" data-k="pw">0/0</b></span><button class="dob-s dob-s-btn" data-k="obj" title="Objectives list (N)"><span class="dh-key">N</span>OBJ</button><button class="dob-s dob-s-btn" data-k="dep" title="Reinforcements (M)"><i class="dh-led"></i><span class="dh-key">M</span><span data-k="dept">DEPLOY</span></button>';
  const side = document.createElement("section");
  side.id = "dob-side";
  side.className = "tlh dh";
  side.innerHTML = '<button class="dob-sh" title="Objectives (N)"><i class="dh-led"></i><span class="dh-key">N</span><span>OBJECTIVES</span><span class="dob-sum"></span><span class="dob-car">▸</span></button><div class="dob-list"></div>';
  const listEl = side.querySelector(".dob-list"), sumEl = side.querySelector(".dob-sum");
  const SV = {};
  for (const el of strip.querySelectorAll("[data-k]")) SV[el.dataset.k] = el;
  const mh = document.createElement("div");
  mh.className = "dob-mh";
  mh.innerHTML = '<span><span class="dh-key">M</span>REINFORCEMENTS</span><button title="Close (M / Esc)">✕</button>';
  const why = document.createElement("div");
  why.className = "dob-why";
  panel.prepend(mh);
  panel.querySelector(".dob-top").after(why);
  const sqRows = document.createElement("div");
  sqRows.className = "dob-rows";
  why.before(sqRows);
  for (const [id, p] of Object.entries(O.presets)) {
    const r = document.createElement("div");
    r.className = "dob-sq";
    r.dataset.tier = id;
    r.innerHTML = '<span class="nm"></span><span class="gn"></span><span class="rs"></span><button data-buy="' + id + '"></button>';
    r.querySelector(".nm").textContent = p.name + " · " + p.cost + " CR";
    r.querySelector(".gn").textContent = p.guns.map((g) => g.replace(/_/g, " ")).join(" / ");
    r.querySelector("button").onclick = () => { choice.value = id; buy.onclick(); };
    sqRows.append(r);
  }
  document.body.append(strip, side);
  const setMenu = (v) => { RH.menu = !!v; panel.classList.toggle("dob-open", RH.menu); SV.dep.classList.toggle("on", RH.menu); };
  const setList = (v) => { RH.list = !!v; side.classList.toggle("open", RH.list); side.querySelector(".dob-car").textContent = RH.list ? "▾" : "▸"; SV.obj.classList.toggle("on", RH.list); };
  RH.setMenu = setMenu;
  RH.setList = setList;
  SV.obj.onclick = () => setList(!RH.list);
  SV.dep.onclick = () => setMenu(!RH.menu);
  side.querySelector(".dob-sh").onclick = () => setList(!RH.list);
  mh.querySelector("button").onclick = () => setMenu(false);
  for (const el of [strip, side, panel]) el.addEventListener("mousedown", (e) => e.stopPropagation());
  side.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  function focusPoint(idx) {
    const o = O.state.points[idx], I = T?.input;
    if (!o || !I || I.fps) return;
    RH.sel = idx;
    const off = Math.max(10, I.cam.pos.y * 0.6), yaw = I.cam.yaw || 0;
    I.cam.pos.x = o.p[0] + Math.sin(yaw) * off;
    I.cam.pos.z = o.p[2] + Math.cos(yaw) * off;
    I.apply();
  }
  RH.focus = focusPoint;
  let mx = -1e4, my = -1e4;
  addEventListener("mousemove", (e) => ((mx = e.clientX), (my = e.clientY)), { passive: true });
  if (/[?&]dev=1/.test(location.search)) document.body.classList.add("dh-dev");
  // capture phase on window so no later handler can swallow it; only real typing fields block the hotkeys (a focused volume slider / checkbox / button must not)
  addEventListener("keydown", (e) => {
    if (!N || !T || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.code === "F9" && !e.shiftKey) return void document.body.classList.toggle("dh-dev");
    const el = e.target, tg = el && el.tagName, typing = tg === "TEXTAREA" || (el && el.isContentEditable) || (tg === "INPUT" && !/^(range|checkbox|radio|button|submit|color)$/i.test(el.type || ""));
    if (T.input?.fps || typing) return;
    const code = window.DreadingSettings?.codeFor(e, false) || e.code;
    if (code === "KeyN" || code === "KeyO") setList(!RH.list);
    else if (code === "KeyM") {
      setMenu(!RH.menu);
      if (tg === "SELECT" || tg === "INPUT" || tg === "BUTTON") el.blur?.();
      e.preventDefault();
    } else if (e.code === "Escape" && RH.menu) setMenu(false);
  }, true);
  function tagTools() {
    for (const b of document.body.children) {
      if (b.tagName !== "BUTTON" || b.classList.contains("dh-tool")) continue;
      const t = b.textContent || "";
      if (/^Game editor/.test(t)) b.classList.add("dh-tool", "dh-tool-ed");
      else if (/^Animation editor/.test(t)) b.classList.add("dh-tool", "dh-tool-anim");
    }
  }
  const setT = (el, v) => el.textContent !== v && (el.textContent = v);
  let tagN = 0;
  function rtsDraw(S, me, fp, sl, carry, preset, cant, fwd) {
    if (strip._fp !== fp) {
      strip._fp = fp;
      strip.style.display = side.style.display = fp ? "none" : "";
    }
    if (tagN < 80 && tagN++ % 8 === 0) tagTools();
    const res = document.getElementById("tlh-res");
    if (res && res.parentNode !== strip) strip.insertBefore(res, strip.firstChild);
    if (fp) return void (RH.rects.length = 0);
    const mine = S.points.filter((o) => o.owner === me), enemy = S.points.filter((o) => o.owner >= 0 && o.owner !== me).length;
    setT(SV.cr, CFG.unlimitedFunds ? "∞" : String(S.credits[me]));
    setT(SV.tr, sl.active + "/" + sl.total);
    setT(SV.rp, String(carry.rp));
    setT(SV.pw, mine.filter((o) => o.powered).length + "/" + mine.length);
    setT(SV.dept, "DEPLOY " + preset.cost);
    SV.dep.classList.toggle("ready", !cant);
    SV.dep.title = "Reinforcements (M) · " + (cant ? "locked: " + cant : "ready");
    const alertPts = S.points.filter((o) => o.contested && (o.owner === me || o.present?.[me]) || (o.capturing >= 0 && o.capturing !== me && o.owner === me));
    const kinds = ["reinforcement", "ammo", "medical", "research"].map((k) => KIND[k].icon + mine.filter((o) => o.kind === k).length).join(" ");
    setT(sumEl, (alertPts.length ? "! " + alertPts.map((o) => o.name).join(" ") + " · " : "") + "YOU " + mine.length + " · ENY " + enemy + (RH.list ? " · " + kinds : ""));
    side.classList.toggle("alert", alertPts.length > 0);
    if (RH.list) {
      while (listEl.children.length < S.points.length) {
        const b = document.createElement("button"), idx = listEl.children.length;
        b.className = "dob-row";
        b.innerHTML = '<i class="dh-led"></i><b class="n"></b><span class="k"></span><span class="s"></span><span class="g"></span><span class="p"></span><i class="bar"></i>';
        b.onclick = () => focusPoint(idx);
        b.onmouseenter = () => (RH.hover = idx);
        b.onmouseleave = () => RH.hover === idx && (RH.hover = -1);
        b._n = [...b.children];
        listEl.append(b);
      }
      if (!listEl._hint) {
        listEl._hint = document.createElement("div");
        listEl._hint.className = "dob-hint";
        listEl._hint.textContent = CONTROL ? "Click A, B or C to view it. Capture: 10 seconds. Hold two uncontested points to score." : "Click a point to jump the camera · ⚑ reinf ▤ ammo ✚ med ◆ research · capture 8 s = +1 cr first time · 3/3 ⚙ = power (draws zombies)";
        side.append(listEl._hint);
      }
      S.points.forEach((o, i) => {
        const b = listEl.children[i], [led, n, k, s, g, p, bar] = b._n, ownGen = o.gens.filter((x) => x.on >= 0 && x.on === (o.owner >= 0 ? o.owner : me)).length;
        const st = o.contested ? "CONTESTED" : o.capturing >= 0 ? (o.capturing === me ? "CAPTURING" : "ENEMY CAP") : ownerWord(o.owner);
        setT(n, o.name);
        setT(k, KIND[o.kind].icon);
        setT(s, st);
        setT(g, CONTROL ? "" : "⚙" + ownGen + "/3");
        setT(p, o.powered ? "⚡" : "");
        const c = hex[o.contested ? "contested" : rel(o.owner)];
        if (led.style.color !== c) (led.style.color = c), (n.style.color = c);
        bar.style.width = (o.capturing >= 0 ? Math.round((o.progress / CFG.captureSeconds) * 100) : 0) + "%";
        b.classList.toggle("sel", i === RH.sel);
        b.title = o.name + " · " + KIND[o.kind].label + " · " + ownerWord(o.owner) + (CONTROL ? " · capture 10 s · majority earns score" : " · power " + (o.powered ? "ON" : "OFF") + " · " + KIND[o.kind].benefit);
      });
    }
    const mpp = document.getElementById("mp-panel");
    if (mpp) mpp.classList.toggle("dh-warn", /disconnect|reload/i.test(mpp.textContent || ""));
    if (RH.menu) {
      for (const r of sqRows.children) {
        const p = O.presets[r.dataset.tier], short = p.cost - S.credits[me], b = r.lastChild;
        const rs = short > 0 ? "need " + short + " more credit" + (short === 1 ? "" : "s") : sl.free < p.guns.length ? "needs " + p.guns.length + " free slot" + (p.guns.length === 1 ? "" : "s") + " (you have " + sl.free + ")" : "ready · deploys at " + (fwd ? fwd.name : "your start");
        const okk = !(short > 0) && sl.free >= p.guns.length;
        setT(r.children[2], rs);
        setT(b, "DEPLOY · " + p.cost);
        b.disabled = !okk;
        r.classList.toggle("ok", okk);
      }
      setT(why, sl.free + " free troop slots of " + sl.total + " · " + S.credits[me] + (CONTROL?" CR · +2 credits / 20 s; majority +1 bonus":" CR · earn credits: first capture +1; deliver research; powered point income"));
      why.classList.remove("ok");
    }
    // HUD rectangles world labels must never sit under (read once per HUD tick, not per frame)
    RH.rects.length = 0;
    for (const el of [strip, side, RH.menu && panel, bar.style.display === "block" && bar, document.getElementById("tlh-cards"), document.getElementById("tlh-mmf"), document.getElementById("audio-control"), document.getElementById("fire-support-panel"), document.getElementById("mp-panel")]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.height > 2) RH.rects.push([r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]);
    }
  }
  function hudBlock(m, x, y) {
    const w = m.classList.contains("dob-gen-marker") ? 56 : m._full === false ? 46 : 110, h = m.classList.contains("dob-gen-marker") ? 14 : m._full === false ? 16 : 32;
    const a = x - w / 2, b = y - h, c = x + w / 2;
    for (const r of RH.rects) if (a < r[2] && c > r[0] && b < r[3] && y > r[1]) return true;
    return false;
  }
  // RTS label detail: icon chip at distance; full text when hovered, selected, being captured/contested, or the camera is low and looking at it
  function rtsFull(o, i, m, cp) {
    if (i === RH.sel || i === RH.hover || o.contested || o.capturing >= 0) return true;
    if (m._x == null) return false;
    if (Math.abs(m._x - mx) < 70 && Math.abs(m._y - my) < 40) return true;
    return cp.y - o.p[1] < 32 && Math.hypot(m._x - innerWidth / 2, m._y - innerHeight / 2) < innerWidth * 0.22;
  }
  function rtsGen(o, i, g, ref, cp) {
    if (g.by >= 0 || i === RH.sel || i === RH.hover || o.present?.[N.slot]) return true;
    return cp.y - g.p[1] < 30 && hyp(ref, g.p) < 42;
  }
  const markers = [], genMarkers = [];
  let reqN = 0;
  buy.onclick = () => {
    const req = N.slot + "-" + Date.now() + "-" + ++reqN;
    if (N.isHost) O.request(0, choice.value, req);
    else N.api.send({ type: "command", method: "reinforce", args: [choice.value, req] });
  };
  const COL = { mine: [0.78, 0.9, 0], enemy: [0.9, 0.3, 0.27], neutral: [0.85, 0.85, 0.8], contested: [1, 0.6, 0.15] };
  const hex = { mine: "#c6e600", enemy: "#e0524c", neutral: "#ecebe4", contested: "#ff9d2e" };
  const rel = (side) => (side < 0 ? "neutral" : side === N.slot ? "mine" : "enemy");
  const ownerWord = (side) => (side < 0 ? "NEUTRAL" : side === N.slot ? "YOURS" : "ENEMY");
  /* ---------- sound (synthesized through DreadingAudio's public chain; no new assets) ---------- */
  function tone(name, notes, opt = {}) {
    const A = window.DreadingAudio;
    let played = false;
    try {
      const r = A?.ready && A.chain(opt.p || null, opt.gain ?? 0.22, opt.p ? opt.max || 70 : 1e9, { direct: !opt.p, bus: opt.p ? "effects" : "ui", name: "objective-" + name });
      if (r) {
        const ctx = r.input.context, t0 = ctx.currentTime;
        let end = t0;
        for (const [f, d, type = "triangle", at = 0, f2] of notes) {
          const osc = ctx.createOscillator(), g = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(f, t0 + at);
          if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t0 + at + d);
          g.gain.setValueAtTime(0.0001, t0 + at);
          g.gain.exponentialRampToValueAtTime(1, t0 + at + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + d);
          osc.connect(g);
          g.connect(r.input);
          osc.start(t0 + at);
          osc.stop(t0 + at + d + 0.03);
          osc.onended = () => (osc.disconnect(), g.disconnect());
          end = Math.max(end, t0 + at + d + 0.05);
        }
        setTimeout(() => r.release(), (end - t0) * 1000 + 120);
        played = true;
      }
      if (opt.mech && A?.ready) A.mechanical?.("pump", opt.p, false);
    } catch (e) {}
    return played;
  }
  const SND = {
    capStart: () => tone("capture-start", [[440, 0.12, "square", 0, 660], [660, 0.16, "square", 0.13, 880]], { gain: 0.16 }),
    underAttack: () => tone("under-attack", [[330, 0.18, "sawtooth"], [262, 0.24, "sawtooth", 0.22]], { gain: 0.16 }),
    contested: () => tone("contested", [[220, 0.12, "square"], [220, 0.12, "square", 0.18], [220, 0.12, "square", 0.36]], { gain: 0.16 }),
    captured: () => tone("captured", [[523, 0.16, "triangle"], [659, 0.16, "triangle", 0.15], [784, 0.34, "triangle", 0.3], [1047, 0.42, "sine", 0.3]], { gain: 0.28 }),
    lost: () => tone("lost", [[392, 0.2, "sawtooth"], [294, 0.22, "sawtooth", 0.2], [196, 0.45, "sawtooth", 0.42]], { gain: 0.2 }),
    gen: (p) => tone("generator", [[55, 1.4, "sawtooth", 0, 110], [110, 1.2, "square", 0.2, 120]], { p, gain: 0.35, max: 70, mech: true }),
    genMine: () => tone("generator-ui", [[600, 0.1, "square"], [900, 0.18, "square", 0.1]], { gain: 0.14 }),
    powered: () => tone("powered", [[110, 0.5, "sawtooth", 0, 220], [440, 0.2, "triangle", 0.45], [880, 0.4, "triangle", 0.62]], { gain: 0.25 }),
    delivered: () => tone("delivered", [[880, 0.1, "sine"], [1175, 0.1, "sine", 0.1], [1568, 0.3, "sine", 0.2]], { gain: 0.25 }),
    dropped: () => tone("dropped", [[300, 0.25, "triangle", 0, 150]], { gain: 0.2 }),
  };
  let bannerT = 0;
  function showBanner(title, sub, color) {
    banner.querySelector(".t").textContent = title;
    banner.querySelector(".s").textContent = sub || "";
    banner.style.color = color || hex.mine;
    banner.style.opacity = "1";
    bannerT = performance.now() + (T?.input?.fps ? 2600 : 1800);
    O.lastBanner = { title, sub, at: Date.now() };
  }
  let lastSeq = null;
  function feedback() {
    const S = O.state, me = N.slot;
    if (lastSeq === null) {
      lastSeq = S.seq || 0;
      return;
    }
    for (const e of S.events) {
      if (e.seq <= lastSeq) continue;
      lastSeq = e.seq;
      const o = S.points.find((x) => x.name === e.point), K = o && KIND[o.kind], entry = { type: e.type, seq: e.seq, side: e.side, point: e.point, sound: false, banner: null };
      if (e.type === "capStart") {
        if (e.side === me) entry.sound = SND.capStart();
        else if (e.owner === me) (entry.sound = SND.underAttack()), (entry.banner = "UNDER ATTACK"), showBanner("POINT UNDER ATTACK", o.name + " · " + K.label, hex.enemy);
      } else if (e.type === "contested") {
        if (o?.present?.[me] || e.owner === me) entry.sound = SND.contested();
      } else if (e.type === "captured") {
        if (e.side === me) {
          entry.sound = SND.captured();
          showBanner("POINT CAPTURED", o.name + " · " + K.label + (e.earned ? " · +1 TROOP CREDIT" : " · retaken (no credit)"), hex.mine);
          entry.banner = "POINT CAPTURED";
        } else if (e.prev === me) {
          entry.sound = SND.lost();
          showBanner("POINT LOST", o.name + " · " + K.label, hex.enemy);
          entry.banner = "POINT LOST";
        }
      } else if (e.type === "genStart") {
        if (e.side === me) entry.sound = SND.genMine();
      } else if (e.type === "genOn") {
        entry.sound = SND.gen(e.p);
        if (e.side === me) {
          SND.genMine();
          const n = o.gens.filter((g) => g.on === me).length;
          showBanner("GENERATOR ONLINE", e.gen + " · " + n + "/3 for " + o.name + (e.rp ? " · +" + e.rp + " RESEARCH (deliver it)" : ""), hex.mine);
          entry.banner = "GENERATOR ONLINE";
        }
      } else if (e.type === "powered") {
        if (e.side === me) {
          entry.sound = SND.powered();
          showBanner(o.name + " POWERED", K.benefit + " · zombies are coming", hex.mine);
          entry.banner = "POWERED";
        } else entry.sound = tone("enemy-power", [[150, 0.6, "sawtooth", 0, 90]], { p: o.p, gain: 0.3, max: 120 });
      } else if (e.type === "delivered") {
        if (e.side === me) {
          entry.sound = SND.delivered();
          showBanner("RESEARCH DELIVERED", e.rp + " research → +" + e.credits + " credit" + (e.credits === 1 ? "" : "s"), hex.mine);
          entry.banner = "RESEARCH DELIVERED";
        }
      } else if (e.type === "dropped") {
        if (e.side === me) entry.sound = SND.dropped();
      } else if (e.type === "deployed" || e.type === "income") {
        if (e.side === me) entry.sound = SND.genMine();
      }
      O.feedback.push(entry);
      if (O.feedback.length > 60) O.feedback.shift();
    }
  }
  /* ---------- world visuals: emissive unlit meshes, no dynamic lights ---------- */
  const vis = [];
  O.visuals = vis;
  O.showWorld = true; // false hides rings/beacons/generators/markers (A/B perf checks)
  let shown = true;
  let genBody = null, ringMesh = null, genRing = null;
  function mat(c, k, additive = true) {
    const m = new pc.StandardMaterial();
    m.diffuse = new pc.Color(0, 0, 0);
    m.emissive = new pc.Color(c[0] * k, c[1] * k, c[2] * k);
    m.useLighting = false;
    m.useFog = false;
    if (additive) {
      m.blendType = pc.BLEND_ADDITIVE;
      m.depthWrite = false;
    }
    m.cull = pc.CULLFACE_NONE;
    m.update();
    return m;
  }
  function tint(m, c, k) {
    const r = c[0] * k, g = c[1] * k, b = c[2] * k;
    if (Math.abs(m.emissive.r - r) + Math.abs(m.emissive.g - g) + Math.abs(m.emissive.b - b) < 0.01) return;
    m.emissive.set(r, g, b);
    m.update();
  }
  function prim(type, m, parent) {
    const e = new pc.Entity("objective-" + type);
    e.addComponent("render", { type, material: m, castShadows: false, receiveShadows: false });
    parent.addChild(e);
    return e;
  }
  function buildVisual(o) {
    const app = tactical.app, root = new pc.Entity("Objective " + o.name);
    (T.root || app.root).addChild(root);
    root.setPosition(o.p[0], o.p[1], o.p[2]);
    const v = { o: o.name, root, m: { zone: mat(COL.neutral, 0.05), prog: mat(COL.mine, 0.25), ring: mat(COL.neutral, 0.6), beam: mat(COL.neutral, 0.15) } };
    const R = CFG.captureRadius;
    v.zone = prim("cylinder", v.m.zone, root);
    v.zone.setLocalScale(R * 2, 0.02, R * 2);
    v.zone.setLocalPosition(0, 0.06, 0);
    v.prog = prim("cylinder", v.m.prog, root);
    v.prog.setLocalPosition(0, 0.09, 0);
    v.prog.setLocalScale(0.01, 0.02, 0.01);
    try {
      if (!ringMesh) ringMesh = pc.Mesh.fromGeometry ? pc.Mesh.fromGeometry(app.graphicsDevice, new pc.TorusGeometry({ tubeRadius: 0.14, ringRadius: R, segments: 64, sides: 5 })) : pc.createTorus(app.graphicsDevice, { tubeRadius: 0.14, ringRadius: R, segments: 64, sides: 5 });
      v.ring = new pc.Entity("objective-ring");
      v.ring.addComponent("render", { meshInstances: [new pc.MeshInstance(ringMesh, v.m.ring)], castShadows: false, receiveShadows: false });
      v.ring.setLocalPosition(0, 0.22, 0);
      root.addChild(v.ring);
    } catch (e) {
      v.ring = null;
    }
    v.beam = prim("cylinder", v.m.beam, root);
    v.beam.setLocalScale(0.45, 18, 0.45);
    v.beam.setLocalPosition(0, 9, 0);
    v.gens = o.gens.map((g) => {
      if (!genBody) genBody = (() => { const m = new pc.StandardMaterial(); m.diffuse = new pc.Color(0.3, 0.31, 0.26); m.emissive = new pc.Color(0.05, 0.05, 0.04); m.metalness = 0.4; m.useMetalness = true; m.gloss = 0.4; m.update(); return m; })();
      const gr = new pc.Entity("Generator " + g.id);
      (T.root || app.root).addChild(gr);
      gr.setPosition(g.p[0], g.p[1], g.p[2]);
      const body = prim("box", genBody, gr);
      body.setLocalScale(1.0, 1.0, 0.7);
      body.setLocalPosition(0, 0.5, 0);
      const lm = mat(COL.enemy, 0.5, false), bm = mat(COL.neutral, 0.0), rm = mat(COL.neutral, 0.3);
      const lamp = prim("box", lm, gr);
      lamp.setLocalScale(0.42, 0.24, 0.42);
      lamp.setLocalPosition(0, 1.12, 0);
      const beam = prim("cylinder", bm, gr);
      beam.setLocalScale(0.2, 6, 0.2);
      beam.setLocalPosition(0, 4.2, 0);
      let pad = null;
      try {
        if (!genRing) genRing = pc.Mesh.fromGeometry ? pc.Mesh.fromGeometry(app.graphicsDevice, new pc.TorusGeometry({ tubeRadius: 0.06, ringRadius: CFG.genRadiusFP, segments: 32, sides: 4 })) : pc.createTorus(app.graphicsDevice, { tubeRadius: 0.06, ringRadius: CFG.genRadiusFP, segments: 32, sides: 4 });
        pad = new pc.Entity("generator-pad");
        pad.addComponent("render", { meshInstances: [new pc.MeshInstance(genRing, rm)], castShadows: false, receiveShadows: false });
        pad.setLocalPosition(0, 0.12, 0);
        gr.addChild(pad);
      } catch (e) {}
      return { id: g.id, root: gr, lm, bm, rm, beam };
    });
    vis.push(v);
    return v;
  }
  function paintWorld(t) {
    const S = O.state;
    S.points.forEach((o, i) => {
      const v = vis[i] && vis[i].o === o.name ? vis[i] : null;
      if (!v) return;
      const own = rel(o.owner), cap = o.contested ? "contested" : o.capturing >= 0 ? rel(o.capturing) : own;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6), f = o.capturing >= 0 ? o.progress / CFG.captureSeconds : 0;
      tint(v.m.zone, COL[own], o.powered ? 0.09 : 0.05);
      tint(v.m.ring, COL[cap], o.contested || o.capturing >= 0 ? 0.6 + 0.6 * pulse : o.powered ? 1.1 : 0.7);
      tint(v.m.prog, COL[o.contested ? "contested" : rel(o.capturing)], 0.28);
      const cur = v.prog.getLocalScale().x, want = Math.max(0.01, f * CFG.captureRadius * 2), s = cur + (want - cur) * 0.25;
      v.prog.setLocalScale(s, 0.02, s);
      v.prog.enabled = f > 0.01;
      tint(v.m.beam, COL[cap], o.powered ? 0.8 + 0.4 * pulse : o.capturing >= 0 || o.contested ? 0.45 + 0.4 * pulse : own === "neutral" ? 0.22 : 0.38);
      o.gens.forEach((g, j) => {
        const gv = v.gens[j];
        if (!gv) return;
        const working = g.by >= 0 || g.jam;
        tint(gv.lm, g.jam ? COL.contested : g.on >= 0 ? COL[rel(g.on)] : working ? COL.contested : [0.55, 0.12, 0.1], working ? 0.5 + 0.8 * pulse : g.on >= 0 ? 1.4 : 0.6);
        tint(gv.bm, COL[rel(g.on)], g.on >= 0 ? 0.6 : 0);
        tint(gv.rm, g.jam || working ? COL.contested : g.on >= 0 ? COL[rel(g.on)] : [0.7, 0.2, 0.15], working ? 0.5 + 0.5 * pulse : 0.55);
        gv.beam.enabled = g.on >= 0;
      });
    });
  }
  /* ---------- HUD ---------- */
  function focus() {
    const S = O.state, me = N.slot, fs = T.input?.fps?.s;
    if (fs && live(fs)) {
      const p = fs.pos();
      for (const o of S.points)
        for (const g of o.gens) if (hyp(p, g.p) <= CFG.genRadiusFP + 0.6 && Math.abs(p[1] - g.p[1]) < CFG.genDy) return { o, g };
      const o = S.points.find((o) => inZone(p, o));
      if (o) return { o, inside: true };
    }
    let best = null, score = -1;
    for (const o of S.points) {
      let sc = -1;
      if (o.contested && (o.present?.[me] || o.owner === me)) sc = 3 + o.progress;
      else if (o.capturing === me) sc = 2 + o.progress / CFG.captureSeconds;
      else if (o.capturing === 1 - me && o.owner === me) sc = 2.5 + o.progress / CFG.captureSeconds;
      if (sc > score) (score = sc), (best = { o });
      for (const g of o.gens) if (g.by === me && 1 + g.progress > score) (score = 1 + g.progress), (best = { o, g });
    }
    return best;
  }
  function drawBar() {
    const f = focus(), me = N.slot;
    O.lastFocus = f ? { point: f.o.name, gen: f.g?.id || null } : null;
    if (!f) return void (bar.style.display = "none");
    const { o, g } = f, K = KIND[o.kind], gensOn = o.gens.filter((x) => x.on === o.owner && o.owner >= 0).length;
    let title, pct = 0, sub, cls = "";
    if (g) {
      const mineOn = g.on === me;
      if (g.jam) (title = "GENERATOR " + g.id + " CONTESTED"), (cls = "contested"), (pct = g.progress);
      else if (g.by === me) (title = "STARTING GENERATOR " + g.id), (pct = g.progress);
      else if (g.by >= 0) (title = "ENEMY STARTING " + g.id), (cls = "enemy"), (pct = g.progress);
      else if (mineOn) (title = "GENERATOR " + g.id + " ONLINE"), (pct = 1);
      else (title = (T.input?.fps ? "HOLD [E] · " : "STAND HERE · ") + (g.on >= 0 ? "TAKE OVER " : "START ") + "GENERATOR " + g.id), (pct = 0);
      sub = o.name + " " + K.label + " · generators " + o.gens.filter((x) => x.on === me).length + "/3 yours" + (g.paid[me] ? " · research already collected" : " · +" + CFG.genResearch + " research") + " · " + g.label;
    } else {
      const capping = o.capturing >= 0 && !o.contested;
      if (o.contested) (title = "CONTESTED · " + o.name), (cls = "contested"), (pct = o.progress / CFG.captureSeconds);
      else if (capping && o.capturing === me) (title = "CAPTURING " + o.name + " · " + K.short), (pct = o.progress / CFG.captureSeconds);
      else if (capping) (title = "ENEMY CAPTURING " + o.name), (cls = "enemy"), (pct = o.progress / CFG.captureSeconds);
      else (title = o.name + " · " + K.label + " · " + ownerWord(o.owner)), (pct = o.owner === me ? 1 : 0), (cls = o.owner >= 0 && o.owner !== me ? "enemy" : "");
      sub = "Owner " + ownerWord(o.owner) + " · power " + (o.powered ? "ON" : "OFF") + " (" + gensOn + "/3 generators) · " + K.benefit + (o.paid[me] ? "" : " · first capture +1 credit");
    }
    bar.className = cls;
    bar.style.display = "block";
    bar.querySelector(".t").textContent = title;
    bar.querySelector(".t").style.color = cls === "enemy" ? hex.enemy : cls === "contested" ? hex.contested : hex.mine;
    bar.querySelector(".fill").style.width = Math.round(pct * 100) + "%";
    bar.querySelector(".pct").textContent = Math.round(pct * 100) + "%";
    bar.querySelector(".s").textContent = sub;
  }
  function chipText(o) {
    const me = N.slot, n = o.gens.filter((g) => g.on >= 0 && g.on === (o.owner >= 0 ? o.owner : me)).length;
    return o.name + " " + KIND[o.kind].icon + (o.powered ? "⚡" : " " + n + "/3");
  }
  function draw() {
    const S = O.state, me = N.slot, fp = !!T.input?.fps;
    feedback();
    const sl = O.slots(me), carry = O.carried(me), preset = O.presets[choice.value];
    creditsEl.textContent = (CFG.unlimitedFunds ? "∞" : S.credits[me]) + " CR";
    panel.classList.toggle("dob-fp", fp);
    info.textContent = CONTROL ? "Troops " + sl.active + "/" + sl.total + " · Reinforcements deploy at your start" : fp
      ? "Research carried " + carry.rp + (carry.rp ? " → deliver to an owned ◆ RESEARCH point" : "") + " · troops " + sl.active + "/" + sl.total + " · T: command view to deploy"
      : "Troops " + sl.active + "/" + sl.total + " · " + sl.free + " free slots (mortar: 1 / squad: 4) · research carried " + carry.rp + (carry.carriers ? " by " + carry.carriers : "");
    const fwd = O.forwardPoint(me);
    help.textContent =
      (CONTROL?"Hold two of A, B, C to score. Stand inside a point for 10 seconds to capture. First to 300 wins. Reinforcements: +2 credits every 20 seconds." : "Capture (stand 8 s): +1 credit first time · 4 credits = basic squad · Generators ⚙ (hold E / park a soldier): +1 research each — deliver to your ◆ point for credits · 3/3 generators on your point = POWER: bonus, but draws zombies") +
      (fwd ? " · squads deploy at " + fwd.name : (CONTROL ? " · squads deploy at your start" : " · squads deploy at your start (power a ⚑ point to deploy forward)"));
    const cant = S.credits[me] < preset.cost ? "need " + (preset.cost - S.credits[me]) + " more" : sl.free < preset.guns.length ? "no free slots" : "";
    buy.disabled = !!cant;
    buy.textContent = "DEPLOY · " + preset.cost + (cant ? " (" + cant + ")" : "");
    buy.style.opacity = cant ? ".5" : "1";
    choice.title = preset.guns.join(" / ");
    if (O._msg !== S.message[me]) {
      O._msg = S.message[me];
      if (O._msg) T.input.toast?.(O._msg);
    }
    while (rows.children.length < S.points.length) {
      const b = document.createElement("button"), idx = rows.children.length;
      b.className = "dob-chip";
      b.innerHTML = "<span></span><b></b>";
      b.onclick = () => {
        const o = O.state.points[idx], I = T.input;
        if (I.fps) I.exitControl("objective");
        I.cam.pos.x = o.p[0];
        I.cam.pos.z = o.p[2];
        I.apply();
      };
      rows.append(b);
    }
    S.points.forEach((o, i) => {
      const b = rows.children[i], t = chipText(o);
      if (b.firstChild.textContent !== t) b.firstChild.textContent = t;
      b.title = o.name + " · " + KIND[o.kind].label + " · " + ownerWord(o.owner) + " · power " + (o.powered ? "ON" : "OFF") + " · " + KIND[o.kind].benefit + " — click to view";
      b.style.color = hex[rel(o.owner)];
      b.style.borderColor = o.contested ? hex.contested : o.powered ? hex[rel(o.owner)] : "";
      b.style.background = o.contested ? "#5c1b20" : "transparent";
      b.lastChild.style.width = (o.capturing >= 0 ? Math.round((o.progress / CFG.captureSeconds) * 100) : 0) + "%";
      b.lastChild.style.background = hex[o.contested ? "contested" : rel(o.capturing)];
    });
    rtsDraw(S, me, fp, sl, carry, preset, cant, fwd);
    drawBar();
    // marker text at the HUD rate (fixed-width boxes so changing numbers never shift the box)
    const cp = T.camera.getPosition(), fs = T.input?.fps?.s, ref = fs ? fs.pos() : [cp.x, cp.y, cp.z];
    while (markers.length < S.points.length) {
      const m = document.createElement("div");
      m.className = "capture-world-marker";
      m.innerHTML = '<div class="k"></div><div class="d"></div>';
      document.body.append(m);
      markers.push(m);
    }
    S.points.forEach((o, i) => {
      const m = markers[i], own = rel(o.owner), d = Math.round(hyp(ref, o.p));
      const full = true; // RTS HUD pass 4: RTS shows the full objective label again (Cody liked them); declutter is only for generator labels
      if (m._full !== full) (m._full = full), m.classList.toggle("dob-c", !full);
      const k = full ? o.name + " " + KIND[o.kind].icon + " " + KIND[o.kind].short + (o.powered ? " ⚡" : "") : o.name + " " + KIND[o.kind].icon + (o.powered ? "⚡" : "");
      const line = (o.contested ? "CONTESTED" : o.capturing >= 0 ? (o.capturing === me ? "CAPTURING " : "ENEMY ") + Math.floor((o.progress / CFG.captureSeconds) * 100) + "%" : ownerWord(o.owner)) + " · " + (fp ? d + "m" : "gen " + o.gens.filter((g) => g.on >= 0 && g.on === (o.owner >= 0 ? o.owner : me)).length + "/3");
      if (m.firstChild.textContent !== k) m.firstChild.textContent = k;
      if (m.lastChild.textContent !== line) m.lastChild.textContent = line;
      m.style.color = hex[o.contested ? "contested" : own];
      m.style.borderColor = o.powered ? hex[own] : "";
      m._d = d;
    });
    const nearGens = [];
    S.points.forEach((o, i) => { for (const g of o.gens) if (fp ? hyp(ref, g.p) < 40 : rtsGen(o, i, g, ref, cp)) nearGens.push([o, g]); });
    while (genMarkers.length < nearGens.length) {
      const m = document.createElement("div");
      m.className = "dob-gen-marker";
      document.body.append(m);
      genMarkers.push(m);
    }
    genMarkers.forEach((m, i) => {
      const pair = nearGens[i];
      m._g = pair ? pair[1] : null;
      if (!pair) return void (m.style.display = "none");
      const g = pair[1], t = "⚙ " + g.id + " " + (g.on >= 0 ? (g.on === me ? "ON" : "ENEMY") : g.by >= 0 ? Math.round(g.progress * 100) + "%" : "OFF");
      if (m.textContent !== t) m.textContent = t;
      m.style.color = g.on >= 0 ? hex[rel(g.on)] : g.by >= 0 ? hex.contested : "#b9b9b0";
    });
    if (performance.now() > bannerT) banner.style.opacity = "0";
  }
  function positionMarkers() {
    if (!N || !DreadingMPPrep.canPlay()) return;
    const S = O.state, fp = !!T.input?.fps, me = N.slot;
    while (vis.length < S.points.length && S.points[vis.length]?.gens) buildVisual(S.points[vis.length]);
    if (shown !== (O.showWorld !== false)) {
      shown = O.showWorld !== false;
      for (const v of vis) {
        v.root.enabled = shown;
        v.gens.forEach((g) => (g.root.enabled = shown));
      }
      if (!shown) [...markers, ...genMarkers].forEach((m) => (m.style.display = "none"));
    }
    if (!shown) return;
    paintWorld(performance.now() / 1000);
    const canvas = tactical.app.graphicsDevice.canvas, r = canvas.getBoundingClientRect(), cp = T.camera.getPosition(), fw = T.camera.forward;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, tmp = new pc.Vec3(), out = new pc.Vec3();
    // FP: only the 5 nearest points (plus any you are fighting over), never inside the aim area.
    let allow = null;
    if (fp) {
      allow = new Set(S.points.map((o, i) => [i, markers[i]?._d ?? 1e9]).filter(([, d]) => d < 160).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([i]) => i));
      S.points.forEach((o, i) => (o.capturing === me || o.contested) && allow.add(i));
    }
    const place = (m, p, lift, show) => {
      tmp.set(p[0], p[1] + lift, p[2]);
      T.camera.camera.worldToScreen(tmp, out);
      const front = tmp.sub(cp).dot(fw) > 0, x = Math.round(out.x + r.left), y = Math.round(out.y + r.top);
      m.style.left = x + "px";
      m.style.top = y + "px";
      const onScreen = front && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
      m._x = x;
      m._y = y;
      m.style.display = onScreen && show && (fp || !hudBlock(m, x, y)) ? "block" : "none";
      const aim = fp && Math.abs(x - cx) < r.width * 0.16 && Math.abs(y - 10 - cy) < r.height * 0.2;
      const o = aim ? "0" : "1";
      if (m.style.opacity !== o) m.style.opacity = o;
    };
    S.points.forEach((o, i) => markers[i] && place(markers[i], o.p, 2.5, !allow || allow.has(i)));
    for (const m of genMarkers) if (m._g) place(m, m._g.p, 1.6, true);
  }
  /* ---------------- boot ---------------- */
  const wait = setInterval(() => {
    if (!window.DreadingMPPrep?.installed || !window.tactical?.T?.strategy || !window.DreadingMultiplayer?.api) return;
    T = tactical.T;
    N = DreadingMultiplayer;
    if (N.isHost && !initialize()) return;
    clearInterval(wait);
    O.ready = true;
    guardPower();
    tactical.app.on("frameend", positionMarkers);
    if (N.isHost) {
      const previous = N.api.onCommand;
      N.api.onCommand = (m, side = 1) => {
        if (m.method === "reinforce") {
          const tier = typeof m.args?.[0] === "string" ? m.args[0] : "recruits", req = m.args?.[1];
          O.request(side, tier, typeof req === "string" || typeof req === "number" ? req : null);
          return true;
        }
        return previous?.(m, side);
      };
    }
    if (T.strategy.panel) T.strategy.panel.style.display = "none";
    T.strategy.hud = false;
    tactical.app.on("update", (dt) => {
      if (!DreadingMPPrep.canPlay()) return;
      for (const o of O.state.points) if (o.buildingId != null) objBuildings.add(o.buildingId);
      if (T.paused) return;
      acc += dt;
      supply += dt;
      if (acc < 0.15) return;
      const step = Math.min(acc, 0.3);
      acc = 0;
      if (N.isHost) {
        O.captureTick(step);
        O.genTick(step);
        O.powerTick(step);
        O.researchTick(step);
        if (supply >= 1) {
          O.resupply(Math.min(supply, 1.5));
          supply = 0;
        }
      }
      draw();
    });
  }, 200);
})();

}
