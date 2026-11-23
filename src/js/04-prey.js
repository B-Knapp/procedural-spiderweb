// Insects, web damage and makeshift repair, and the spider tending its finished web.
// ============================================================ prey, damage & repair
let bugs = [], damage = [], webUp = false, nextBugT = 0, lastDamageT = -1e9;
const BUGT = {
  gnat:   { name: 'gnat',   size: 5, base: 5,  speed: 55,  strength: 0.15, tear: 0.02, through: 0,    flap: 70, wrap: false },
  fly:    { name: 'fly',    size: 12, base: 12, speed: 120, strength: 0.6,  tear: 0.25, through: 0,    flap: 60, wrap: true },
  moth:   { name: 'moth',   size: 30, base: 30, speed: 70,  strength: 1.0,  tear: 0.6,  through: 0.05, flap: 18, wrap: true },
  beetle: { name: 'beetle', size: 17, base: 17, speed: 115, strength: 1.4,  tear: 0.9,  through: 0.35, flap: 45, wrap: true },
};
function applyScale() {
  BL = CFG.bigSpider ? 46 : 33; SS = BL / 382;
  for (const k in BUGT) BUGT[k].size = BUGT[k].base * BL / 33;
}
function pickBugType() {
  const day = hour >= 6.5 && hour < 19.2, r = Math.random();
  if (day) return r < 0.3 ? 'gnat' : r < 0.8 ? 'fly' : r < 0.9 ? 'beetle' : 'moth';
  return r < 0.3 ? 'gnat' : r < 0.42 ? 'fly' : r < 0.52 ? 'beetle' : 'moth';
}
function spawnBug(type) {
  if (!hub || !geom.env) return;
  type = type || pickBugType(); const T = BUGT[type];
  const a = rand(0, TAU), rr = geom.env.Rb * (1 + 0.2 * Math.sin(a)) * Math.sqrt(rand(0.0, 0.95));
  const tgt = { x: hub.x + Math.cos(a) * rr, y: hub.y + Math.sin(a) * rr * 1.1 };
  // come in from the side, a little above or below
  const fromLeft = Math.random() < 0.5;
  const sx = fromLeft ? -60 : W + 60, sy = clamp(tgt.y + rand(-260, 260), 120, 1000);
  const d = Math.hypot(tgt.x - sx, tgt.y - sy);
  bugs.push({ type, T, x: sx, y: sy, px: sx, py: sy, vx: (tgt.x - sx) / d * T.speed, vy: (tgt.y - sy) / d * T.speed, tgt,
    z: rand(220, 420), d0: d,
    state: 'fly', node: null, glue: [], para: 0, wrap: 0, rot: 0, heading: 0, ph: rand(0, TAU), feed: 0, alpha: 1, t: 0, bit: -1 });
}
function breakEdge(e) {
  if (!e.alive) return;
  if (e.type !== 'glue' && e.type !== 'stub') {
    damage.push({ type: e.type, a: e.a, b: e.b, rid: e.rid, sector: e.sector, rpos: e.rpos, stroke: e.stroke });
    if (e.type === 'capture') geom.broken = (geom.broken || 0) + 1;
    lastDamageT = simTime;
  }
  const a = e.a, b = e.b, L = e.len(); const typ = e.type; killEdge(e);
  if (typ === 'glue' || typ === 'stub') return;
  for (const [n, o] of [[a, b], [b, a]]) {           // broken ends recoil and dangle
    if (!n.alive || n.isBug) continue; const l = L * rand(0.15, 0.4); if (l < 4) continue;
    const dx = (o.x - n.x) / (L || 1), dy = (o.y - n.y) / (L || 1);
    const m = new Node(n.x + dx * l, n.y + dy * l, false); m.px = n.x + dx * l * 1.6; m.py = n.y + dy * l * 1.6;
    new Edge(n, m, l, 'stub');
  }
}
function stickBug(b, e, t) {
  const n = splitEdge(e, t);
  const B = new Node(b.x, b.y, false); B.im = 0.35; B.keep = true; B.isBug = true;
  B.px = b.x - b.vx * DT * 0.7; B.py = b.y - b.vy * DT * 0.7;     // momentum bulges the web
  b.node = B; b.glue = [new Edge(B, n, 1.5, 'glue')];
  // tangled in a couple of neighbouring sticky threads too
  const r = b.T.size * 0.9;
  for (let k = 0; k < 2; k++) {
    let best = null, bd = r * r;
    for (const f of edges) {
      if (!f.alive || f.type !== 'capture' || f === e || f.a === n || f.b === n) continue;
      const ax = f.a.x, ay = f.a.y, ex = f.b.x - ax, ey = f.b.y - ay, l2 = ex * ex + ey * ey; if (l2 < 1) continue;
      const tt = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / l2, 0.05, 0.95), d2 = (ax + ex * tt - b.x) ** 2 + (ay + ey * tt - b.y) ** 2;
      if (d2 < bd && !b.glue.some(g => g.b.edges.includes(f))) { bd = d2; best = { f, tt }; }
    }
    if (!best) break;
    const m = splitEdge(best.f, best.tt); b.glue.push(new Edge(B, m, Math.sqrt(bd) * 0.8 + 1, 'glue'));
  }
  B.bug = b; b.state = 'stuck'; b.stuckAt = simTime; b.heading = Math.atan2(b.vy, b.vx);
}
function updateBugs(dt) {
  if (webUp && simTime > nextBugT) {
    if (bugs.filter(b => b.state === 'stuck').length < 2) spawnBug();
    nextBugT = simTime + rand(50, 170);
  }
  for (const b of bugs) {
    b.t += dt;
    if (b.state === 'fly' || b.state === 'leave') {
      b.px = b.x; b.py = b.y;
      const wob = noise1(b.t * 1.3 + b.ph * 10) * 1.2;
      let sp = Math.hypot(b.vx, b.vy) || 1; const ang = Math.atan2(b.vy, b.vx) + wob * dt * 2;
      if (b.slowT > 0) b.slowT -= dt; else if (sp < b.T.speed) sp = Math.min(b.T.speed, sp + b.T.speed * 0.6 * dt);
      let want = ang;
      if (b.state === 'fly' && b.tgt) want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
      const near = b.state === 'fly' && b.tgt ? clamp(1 - dist(b, b.tgt) / 300, 0, 1) : 0;
      // close in: home straight onto the target so it can't orbit it
      const na = b.state === 'fly' && b.tgt && dist(b, b.tgt) < 90 ? want : ang + angDiff(ang, want) * Math.min(1, dt * (0.8 + near * 5));
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp + noise1(b.t * 3 + b.ph) * 20 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;

      if (b.state === 'fly' && b.tgt && b.z > 0) {
        // approaching the web from in front: depth closes as it nears its target point
        // depth closes over time (it can't hover in front of the web forever)
        const rem = dist(b, b.tgt);
        if (b.z0 == null) { b.z0 = b.z; b.tz = b.d0 / b.T.speed; }
        b.z = Math.min(b.z, b.z0 * rem / b.d0, b.z0 * (1 - b.t / (b.tz * 1.7)));
        if (rem < Math.max(b.T.size * 0.5, b.T.speed * dt * 1.5) || b.z <= 0) b.z = 0;
      }
      if (b.state === 'fly' && b.z <= 0 && !b.crossed) {
        b.crossed = true;   // it reaches the plane of the web here
        const r = b.T.size * 0.85;   // body plus wingspan
        let best = null, bd = r * r, dry = false;
        for (const e of edges) {
          if (!e.alive || e.type === 'sub' || e.type === 'carry' || e.type === 'glue' || e.type === 'stub' || e.eat >= 0) continue;
          const ax = e.a.x, ay = e.a.y, ex = e.b.x - ax, ey = e.b.y - ay, l2 = ex * ex + ey * ey; if (l2 < 1e-6) continue;
          if (Math.min(ax, e.b.x) > b.x + r || Math.max(ax, e.b.x) < b.x - r || Math.min(ay, e.b.y) > b.y + r || Math.max(ay, e.b.y) < b.y - r) continue;
          const t = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / l2, 0.02, 0.98), d2 = (ax + ex * t - b.x) ** 2 + (ay + ey * t - b.y) ** 2;
          if (d2 > r * r) continue;
          if (e.type !== 'capture') { dry = true; if (e.type === 'band' && Math.random() < 0.25 * b.T.strength) breakEdge(e); continue; }
          if (d2 < bd) { bd = d2; best = { e, t }; }
        }
        if (best) {
          if (Math.random() < b.T.through) {   // punches straight through
            breakEdge(best.e);
            for (const f of edges) if (f.alive && f.type === 'capture' && Math.hypot((f.a.x + f.b.x) / 2 - b.x, (f.a.y + f.b.y) / 2 - b.y) < b.T.size * 1.2 && Math.random() < 0.6) breakEdge(f);
            b.vx *= 0.6; b.vy *= 0.6; b.state = 'leave'; b.tgt = null;
          } else stickBug(b, best.e, best.t);
        } else {
          if (dry) { b.vx *= 0.6; b.vy *= 0.6; b.slowT = 1.2; }   // brushed dry silk: slowed, flies on
          b.tgt = null; b.z = -1;
        }
      }
      if ((b.state === 'leave' || (b.state === 'fly' && b.z < 0)) && b.z > -400) b.z -= dt * 120;   // flying off behind the web
      if (b.x < -200 || b.x > W + 200 || b.y < -200 || b.y > H + 200) b.dead = true;
    } else if (b.state === 'stuck') {
      const B = b.node; b.x = B.x; b.y = B.y;
      if (b.bit >= 0) b.para = Math.min(1, (simTime - b.bit) / 1.6);
      const str = b.T.strength * (1 - b.para);
      if (str > 0.01) {
        if (Math.random() < dt * 6) { const a = rand(0, TAU), f = str * rand(0.5, 2.2) * 2.2; B.x += Math.cos(a) * f; B.y += Math.sin(a) * f; }
        b.rot = Math.sin(b.t * 9) * 0.25 * str;
        if (Math.random() < dt * b.T.tear * (1 - b.para) * 0.35) {     // struggling tears silk
          if (Math.random() < 0.4 && b.glue.some(g => g.alive)) { const g = b.glue.filter(g => g.alive); breakEdge(g[randi(0, g.length - 1)]); }
          else {
            const near = edges.filter(f => f.alive && f.eat < 0 && (f.type === 'capture' || (f.type === 'band' && Math.random() < 0.15 * b.T.strength) || (f.type === 'radius' && Math.random() < 0.08 * b.T.strength)) && Math.hypot((f.a.x + f.b.x) / 2 - B.x, (f.a.y + f.b.y) / 2 - B.y) < b.T.size * 2);
            if (near.length) breakEdge(near[randi(0, near.length - 1)]);
          }
          b.glue = b.glue.filter(g => g.alive);
          if (!b.glue.length) { // free! flies off
            B.keep = false; B.alive = false; b.node = null; b.state = 'leave'; b.tgt = null;
            const a = rand(0, TAU); b.vx = Math.cos(a) * b.T.speed; b.vy = Math.sin(a) * b.T.speed - 30; b.escaped = true;
          }
        }
      } else b.rot *= 0.95;
    } else if (b.state === 'held' || b.state === 'hung' || b.state === 'falling') {
      if (b.node) { b.x = b.node.x; b.y = b.node.y; }
      if (b.state === 'falling') { b.alpha -= dt * 0.25; if (b.y > sc.yB + 60 || b.alpha <= 0) { b.dead = true; if (b.node) { b.node.keep = false; b.node.alive = false; } } }
    }
  }
  bugs = bugs.filter(b => !b.dead);
}
const preyWaiting = () => bugs.filter(b => b.state === 'stuck' && simTime - b.stuckAt > 0.6).sort((a, b) => dist(a, hub) - dist(b, hub))[0] || null;
function nearestRefTypes(x, y, types, rmax = 600) {
  let best = null, bd = rmax * rmax;
  for (const e of edges) {
    if (!walkable(e) || !types.includes(e.type)) continue;
    const ax = e.a.x, ay = e.a.y, ex = e.b.x - ax, ey = e.b.y - ay, l2 = ex * ex + ey * ey; if (l2 < 1e-6) continue;
    const t = clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1), d2 = (ax + ex * t - x) ** 2 + (ay + ey * t - y) ** 2;
    if (d2 < bd) { bd = d2; best = { e, t }; }
  }
  return best;
}
function* moveFree(fn, speed) {
  S.ref = null;
  for (let g = 0; g < 2000; g++) {
    const p = fn(); if (!p) return false;
    const dx = p.x - S.x, dy = p.y - S.y, d = Math.hypot(dx, dy), st = speed * DT;
    if (d <= st) { S.x = p.x; S.y = p.y; S.mvx += dx; S.mvy += dy; return true; }
    S.x += dx / d * st; S.y += dy / d * st; S.mvx += dx / d * st; S.mvy += dy / d * st; yield;
  }
  return false;
}
function* backOnSilk() {
  const r = nearestRefTypes(S.x, S.y, ['radius', 'hub', 'aux', 'frame', 'bridge', 'capture'], 400);
  if (r) yield* reachTo(r, REACH);
}
function* handlePrey(b) {
  const nm = b.T.name;
  say('Prey!', `a ${nm} hit the web — plucking the radii to find it`);
  S.face = Math.atan2(b.y - S.y, b.x - S.x); yield* pause(0.7); S.face = null;
  const r = nearestRefTypes(b.x, b.y, ['radius', 'hub', 'aux', 'frame', 'bridge']);
  say('Prey!', `running out along a radius toward the ${nm}`);
  if (r) yield* walkTo({ ref: r }, WALK * 1.8);
  if (b.state !== 'stuck') { say('It got away', `the ${nm} tore free`); yield* pause(1); return; }
  // close in, head first
  yield* moveFree(() => { if (b.state !== 'stuck') return null; const a = Math.atan2(b.y - S.y, b.x - S.x); return { x: b.x - Math.cos(a) * BL * 1.1, y: b.y - Math.sin(a) * BL * 1.1 }; }, REACH * 1.4);
  if (b.state !== 'stuck') { say('It got away', `the ${nm} tore free`); yield* backOnSilk(); return; }
  S.face = Math.atan2(b.y - S.y, b.x - S.x);
  say('Bite', `injecting venom to paralyze the ${nm}`);
  S.eating++; yield* pause(0.9); S.eating--; b.bit = simTime;
  yield* pause(1.2);
  if (b.T.wrap) {
    // hold it with the jaws and front legs, rolling it, while the hind legs
    // alternately comb silk from the spinnerets and lay it over the prey in bands
    say('Wrapping', `rolling the ${nm} with its front legs while the hind legs comb silk over it`);
    const a = Math.atan2(b.y - S.y, b.x - S.x);
    S.face = a; S.wrapping = b; b.bands = []; b.comb = { u: 0, side: 1, laid: false };
    const need = Math.round(10 + b.T.base * 0.45);
    while (b.bands.length < need) {
      S.x = b.x - Math.cos(a) * BL * 1.1; S.y = b.y - Math.sin(a) * BL * 1.1;
      b.rot += DT * 1.6;                                   // turned by the front legs
      b.comb.u += DT / 0.55;
      if (b.comb.u >= 0.5 && !b.comb.laid) { b.comb.laid = true; b.bands.push({ a: rand(-0.7, 0.7) + (b.bands.length % 2) * 0.35, w: rand(0.14, 0.24) }); }
      if (b.comb.u >= 1) { b.comb.u = 0; b.comb.side = -b.comb.side; b.comb.laid = false; }
      b.wrap = Math.min(1, b.bands.length / need);
      yield;
    }
    S.wrapping = null; b.comb = null;
  }
  // cut it free and carry it to the hub on a short line from the spinnerets
  if (!b.node || b.state !== 'stuck') { S.wrapping = null; S.holding = null; say('It got away', `the ${nm} tore free`); yield* pause(1); return; }
  say('Cutting it free', 'snipping the threads that hold the parcel');
  S.face = null;
  for (const g of b.glue) if (g.alive) { const m = g.other(b.node); for (const f of m.edges.slice()) if (f.type === 'capture') breakEdge(f); killEdge(g); }
  b.glue = []; b.state = 'held'; b.node.fixed = true; b.node.im = 0; S.holding = b;
  yield* pause(0.4);
  say('Carrying the prey', 'back to the hub to feed');
  yield* backOnSilk();
  yield* walkTo({ node: hub });
  // hang it at the hub
  S.holding = null; b.node.fixed = false; b.node.im = 0.35; b.state = 'hung'; b.feed = 0;
  b.glue = [new Edge(hub, b.node, BL * 0.35, 'glue')];
}
function* eatStubsNear(x, y, r) {
  const l = edges.filter(e => e.alive && e.type === 'stub' && Math.hypot(e.a.x - x, e.a.y - y) < r);
  if (l.length) yield* eatEdges(l, 0.2);
}
function* repairWeb() {
  const D = damage.splice(0); if (!D.length || !hub) return;
  const s = geom.s || 10;
  // 1. broken radii first: they carry the load
  for (const d of D) {
    if ((d.type !== 'radius' && d.type !== 'rim') || !d.a.alive || !d.b.alive || edgeBetween(d.a, d.b)) continue;
    say('Repairing the web', 'replacing a broken radius');
    if (!(yield* walkTo({ node: d.a }, WALK * 1.2))) continue;
    yield* eatStubsNear(d.a.x, d.a.y, 6);
    startCarry('taut');
    const rb = refAtNode(d.b); if (!rb) { dropCarry(); continue; }
    yield* reachTo(rb, REACH);
    yield* eatStubsNear(d.b.x, d.b.y, 6);
    const L = layLine(d.type, 0.004, d.type === 'rim' ? { strands: 2 } : {}, false);
    if (L.line && d.rid != null && d.type === 'radius') {
      for (const e of L.line.edges) { e.rid = d.rid; e.k = STIFFT.radius; }
      const R = radii[d.rid], ia = R.nodes.indexOf(d.a), ib = R.nodes.indexOf(d.b), mids = L.line.nodes.slice(1, -1);
      mids.forEach(n => n.rid = d.rid);
      if (ia >= 0 && ib >= 0 && mids.length) { if (ia < ib) R.nodes.splice(ib, 0, ...mids); else R.nodes.splice(ia, 0, ...mids.reverse()); }
    }
  }
  // 1b. torn letters: re-sew each damaged stroke
  const torn = [...new Set(D.filter(d => d.type === 'band' && d.stroke != null).map(d => d.stroke))];
  for (const id of torn) yield* resewStroke(id);
  // 2. holes in the sticky spiral: irregular zig-zag patches between the two radii
  const bySec = new Map();
  for (const d of D) if (d.type === 'capture' && d.sector) { if (!bySec.has(d.sector)) bySec.set(d.sector, []); bySec.get(d.sector).push(d.rpos); }
  for (const [key, list] of bySec) {
    const [i1, i2] = key.split('_').map(Number); const R1 = radii[i1], R2 = radii[i2]; if (!R1 || !R2) continue;
    const hi = Math.min(Math.max(...list) + s * 0.4, radiusLen(R1) - 4, radiusLen(R2) - 4), lo = Math.max(Math.min(...list) - s * 0.4, geom.Z || 0);
    if (hi - lo < s * 0.5) continue;
    const r1 = radiusPoint(R1, hi); if (!r1) continue;
    say('Repairing the web', 'clearing broken ends and patching the hole with sticky silk');
    if (!(yield* walkTo({ ref: r1 }, WALK * 1.2))) continue;
    const sp = ptOf(resolve(r1) || r1);
    yield* eatStubsNear(sp.x, sp.y, (hi - lo) + s * 3);
    startCarry('taut');
    let p = hi, side = 1;
    for (let g = 0; g < 40 && p > lo; g++) {
      p -= s * rand(0.8, 1.9);
      const rr = radiusPoint(side ? R2 : R1, Math.max(p, lo)); if (!rr) break;
      { const q = ptOf(resolve(rr) || rr); if (inCarvedLetter(q.x, q.y)) { side = 1 - side; continue; } }   // keep the letters open
      if (!(yield* reachTo(rr, REACH))) break;
      layLine('capture', 0, { sector: key, rpos: p });
      yield* pause(0.15); side = 1 - side;
    }
    dropCarry();
  }
  yield* eatStubsNear(S.x, S.y, 80);
}
function damageFrac() { return (geom.broken || 0) / Math.max(1, geom.capTotal || 1); }
function rebuildDue(t0) {
  const age = simTime - t0;
  if (damageFrac() > 0.3) return 'damaged';
  const day = hour >= 6.5 && hour < 18.6;
  return day ? age > 3600 : age > 700;
}
function* tendWeb() {
  const t0 = simTime; webUp = true; nextBugT = simTime + rand(20, 60); damage = [];
  yield* walkTo({ node: hub });
  for (let guard = 0; guard < 500; guard++) {
    S.mode = 'perch'; S.perch = hub; S.ref = null; S.face = Math.PI / 2; S.perchT = simTime;
    let why = null;
    for (;;) {
      const hung = bugs.find(b => b.state === 'hung');
      if (hung) {
        hung.feed += DT / 90;
        say('Feeding at the hub', `the wrapped ${hung.T.name} hangs beneath it`);
        if (hung.feed >= 1) {
          say('Feeding at the hub', 'dropping the drained husk');
          for (const g of hung.glue) killEdge(g); hung.glue = []; hung.state = 'falling'; hung.node.noClamp = true;
        }
      } else say('Waiting at the hub', 'head down, legs on the radii, feeling for vibrations');
      if (preyWaiting()) { why = 'prey'; break; }
      if (damage.length && simTime - lastDamageT > 4) { why = 'repair'; break; }
      if (rebuildDue(t0)) { why = 'done'; break; }
      yield;
    }
    S.mode = 'walk'; S.face = null; S.perch = null;
    if (why === 'done') break;
    yield* reachTo(refAtNode(hub, 'radius'), REACH * 0.5);
    if (why === 'prey') { const b = preyWaiting(); if (b) yield* handlePrey(b); }
    if (damage.length) yield* repairWeb();
    if (!resolve(S.ref)) yield* backOnSilk();
    yield* walkTo({ node: hub });
  }
  webUp = false;
  if (damageFrac() > 0.3) say('Too damaged', 'the spider will recycle it and spin a new one');
  if (!S.ref) yield* reachTo(refAtNode(hub, 'radius'), REACH * 0.5);
  for (const b of bugs) if (b.state === 'hung') { for (const g of b.glue) killEdge(g); b.glue = []; b.state = 'falling'; b.node.noClamp = true; }
}
