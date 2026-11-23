// The spider's body: what it can physically do. Walk the silk (path planning), reach between
// threads, carry a line from its spinnerets and attach it, drop on a dragline, eat silk.
// Behaviours (03-05) are generator programs built only from these moves.
// ============================================================ the spider (motor layer)
let BL = 33;                   // body length in world px (true scale)
let SS = BL / 382;             // sprite px -> world px
const WALK = 90, REACH = 70, DROP = 55, SW = 900;
const S = { x: 0, y: 0, ang: -Math.PI / 2, face: null, ref: null, mode: 'walk', carry: null, legs: [], mvx: 0, mvy: 0, perch: null, eating: 0 };

function syncPos() {
  const r = resolve(S.ref); if (!r) return; S.ref = r;
  const p = ptOf(r); S.mvx += p.x - S.x; S.mvy += p.y - S.y; S.x = p.x; S.y = p.y;
}
function hereNode() {
  const r = resolve(S.ref); const e = r.e, L = e.len();
  if (r.t * L < 2.5) { S.ref = { e, t: 0 }; return e.a; }
  if ((1 - r.t) * L < 2.5) { S.ref = { e, t: 1 }; return e.b; }
  const n = splitEdge(e, r.t); S.ref = { e: e.split.e1, t: 1 }; return n;
}
function startCarryAt(from, mode = 'taut') {
  const tip = new Node(S.x, S.y, true); tip.keep = true; tip.tip = true;
  const e = new Edge(from, tip, dist(from, tip), 'carry');
  S.carry = { from, tip, edge: e, mode };
  return from;
}
const startCarry = (mode) => startCarryAt(hereNode(), mode);
function dropCarry() { const c = S.carry; if (!c) return; killEdge(c.edge); c.tip.alive = false; S.carry = null; }
function layLine(type, tension = 0, props = {}, cont = true, restOverride = null) {
  const c = S.carry; const n = hereNode(); const from = c.from, mode = c.mode; dropCarry();
  let L = null;
  if (n !== from) {
    const d = dist(from, n); const rest = restOverride != null ? restOverride : Math.max(0.5, d * (1 - tension));
    L = makeLine(from, n, rest, type); for (const e of L.edges) Object.assign(e, props);
  }
  if (cont) startCarryAt(n, mode);
  return { line: L, node: n };
}
function registerRadius(ns) {
  const R = { id: radii.length, nodes: ns.slice() }; radii.push(R);
  for (let i = 0; i < ns.length - 1; i++) { const e = edgeBetween(ns[i], ns[i + 1]); if (e) { e.rid = R.id; e.type = 'radius'; e.k = STIFFT.radius; } }
  for (let i = 1; i < ns.length - 1; i++) ns[i].rid = R.id;
  return R;
}
const liveNodes = R => R.nodes.filter(n => n.alive);
const outerOf = R => { const l = liveNodes(R); return l[l.length - 1]; };
const radAngle = R => { const o = outerOf(R); return Math.atan2(o.y - hub.y, o.x - hub.x); };
function radiusLen(R) { const l = liveNodes(R); let s = 0; for (let i = 0; i < l.length - 1; i++) s += dist(l[i], l[i + 1]); return s; }
function radiusPoint(R, p) {
  const l = liveNodes(R); let cum = 0;
  for (let i = 0; i < l.length - 1; i++) {
    const a = l[i], b = l[i + 1], L = dist(a, b);
    if (cum + L >= p || i === l.length - 2) {
      const e = edgeBetween(a, b); if (!e) return null;
      const f = clamp((p - cum) / Math.max(L, 1e-6), 0, 1);
      return { e, t: e.a === a ? f : 1 - f };
    }
    cum += L;
  }
  return null;
}
const sortedRadii = () => radii.filter(R => liveNodes(R).length >= 2 && outerOf(R) !== hub).sort((A, B) => radAngle(A) - radAngle(B));
const sectorKey = (A, B) => A.id < B.id ? A.id + '_' + B.id : B.id + '_' + A.id;

// ------------------------------------------------------------ path planning
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n, p) { const a = this.a; a.push([p, n]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}
const COST = { band: 1.3, sub: 1.15, bridge: 1, frame: 1, radius: 1, loose: 1.1, hub: 1.8, aux: 1.4, capture: 9 };
function dijkstra(fromRef, visit) {
  const r = resolve(fromRef); if (!r) return null;
  const dist_ = new Map(), prev = new Map(), h = new Heap(); const L = r.e.len() * (COST[r.e.type] || 1);
  dist_.set(r.e.a, r.t * L); prev.set(r.e.a, null); h.push(r.e.a, r.t * L);
  const db = (1 - r.t) * L; dist_.set(r.e.b, db); prev.set(r.e.b, null); h.push(r.e.b, db);
  while (h.size) {
    const [d, n] = h.pop(); if (d > dist_.get(n)) continue;
    if (visit(n, d)) return { prev, end: n };
    for (const e of n.edges) {
      if (!walkable(e)) continue; const m = e.other(n); const nd = d + e.len() * (COST[e.type] || 1);
      if (!dist_.has(m) || nd < dist_.get(m) - 1e-9) { dist_.set(m, nd); prev.set(m, n); h.push(m, nd); }
    }
  }
  return { prev, end: null };
}
const pathTo = (prev, end) => { const l = []; let n = end; while (n) { l.push(n); n = prev.get(n); } return l.reverse(); };
function plan(goal) {
  const r = resolve(S.ref); if (!r) return null;
  if (goal.node) {
    if (r.e.a === goal.node || r.e.b === goal.node) return { list: [goal.node], goalRef: null };
    const res = dijkstra(r, n => n === goal.node); if (!res || !res.end) return null;
    return { list: pathTo(res.prev, res.end), goalRef: null };
  }
  const tg = resolve(goal.ref); if (!tg) return null;
  if (tg.e === r.e) return { list: [], goalRef: tg };
  let best = Infinity, bestN = null; const Lt = tg.e.len() * (COST[tg.e.type] || 1);
  const res = dijkstra(r, (n, d) => {
    if (d >= best) return true;
    if (n === tg.e.a && d + tg.t * Lt < best) { best = d + tg.t * Lt; bestN = n; }
    if (n === tg.e.b && d + (1 - tg.t) * Lt < best) { best = d + (1 - tg.t) * Lt; bestN = n; }
    return false;
  });
  if (!bestN) return null;
  return { list: pathTo(res.prev, bestN), goalRef: tg };
}
function* followPath(list, goalRef, speed) {
  let i = 0;
  for (;;) {
    let budget = speed * DT;
    while (budget > 1e-6) {
      const r = resolve(S.ref); if (!r) return false; S.ref = r;
      let targetT, nextNode = null;
      if (i < list.length) { const N = list[i]; targetT = r.e.a === N ? 0 : r.e.b === N ? 1 : -1; if (targetT < 0) return false; nextNode = N; }
      else { if (!goalRef) { syncPos(); return true; } const g = resolve(goalRef); if (!g || g.e !== r.e) return false; targetT = g.t; }
      const L = Math.max(r.e.len(), 1e-3), need = Math.abs(targetT - r.t) * L;
      if (need <= budget) {
        budget -= need; S.ref = { e: r.e, t: targetT };
        if (nextNode) {
          i++; const nn = i < list.length ? list[i] : null;
          if (nn) { const e2 = edgeBetween(nextNode, nn); if (!e2) return false; S.ref = { e: e2, t: e2.a === nextNode ? 0 : 1 }; }
          else if (goalRef) { const g = resolve(goalRef); if (!g) return false; if (g.e.a === nextNode) S.ref = { e: g.e, t: 0 }; else if (g.e.b === nextNode) S.ref = { e: g.e, t: 1 }; else return false; }
          else { syncPos(); return true; }
        } else { syncPos(); return true; }
      } else { S.ref = { e: r.e, t: r.t + Math.sign(targetT - r.t) * budget / L }; budget = 0; }
    }
    syncPos(); yield;
  }
}
function* walkTo(goal, speed = WALK) {
  for (let tries = 0; tries < 8; tries++) {
    const p = plan(goal);
    if (p) { const ok = yield* followPath(p.list, p.goalRef, speed); if (ok) return true; }
    yield;
  }
  // writes-words only: letters split some radii into pieces the planner can't link up,
  // so the spider steps straight across the web instead
  if (geom.carved) {
    if (goal.node && goal.node.alive) { yield* moveFree(() => goal.node, REACH * 1.1); yield* backOnSilk(); return true; }
    if (goal.ref && resolve(goal.ref)) { const r = resolve(goal.ref); yield* reachTo(goal.ref, REACH * 1.1); return true; }
  }
  console.warn('walkTo failed', caption.t, goal.node ? ('node ' + goal.node.id + ' alive=' + goal.node.alive + ' deg=' + goal.node.edges.filter(walkable).length) : 'ref', 'spider on', S.ref && resolve(S.ref) ? resolve(S.ref).e.type : 'none', S.mode); return false;
}
function* reachTo(ref, speed = REACH) {
  if (!ref) return false;
  S.ref = null; let d0 = null;
  for (;;) {
    const r = resolve(ref); if (!r) return false; const p = ptOf(r);
    const dx = p.x - S.x, dy = p.y - S.y, d = Math.hypot(dx, dy), st = speed * DT;
    if (d0 == null) d0 = Math.max(d, 1e-3);
    // laying spiral: the abdomen lifts away, then swings down to touch the radius
    if (S.spiral) S.bendT = -S.spiral * 0.6 * Math.sin(Math.PI * clamp(1 - d / d0, 0, 1));
    if (d <= st) { S.mvx += dx; S.mvy += dy; S.x = p.x; S.y = p.y; S.ref = r; S.bendT = 0; return true; }
    S.x += dx / d * st; S.y += dy / d * st; S.mvx += dx / d * st; S.mvy += dy / d * st;
    yield;
  }
}
function* pause(sec) { let t = 0; while (t < sec) { t += DT; yield; } }
function* eatEdges(list, dur = 0.25) {
  list = list.filter(e => e.alive && e.eat < 0); if (!list.length) return;
  for (const e of list) e.eat = 0;
  S.eating++;
  let t = 0; while (t < dur) { t += DT; for (const e of list) e.eat = Math.min(1, t / dur); yield; }
  for (const e of list) {
    if (e.type === 'aux') for (const n of [e.a, e.b]) if (n.rid != null) n.remnant = true;
    killEdge(e);
  }
  if (S.mode === 'walk' && S.ref && !resolve(S.ref)) {
    let best = null, bd = 1e9;
    for (const e of list) for (const n of [e.a, e.b]) { const d = dist(n, S); if (d < bd && n.edges.some(walkable)) { bd = d; best = n; } }
    S.ref = best ? refAtNode(best) : null;
  }
  S.eating--;
}
function* dropDown(anchor, yLand) {
  const body = new Node(S.x, S.y, false); body.im = 0.12; body.heavy = true; body.keep = true;
  const e = new Edge(anchor, body, dist(anchor, body) + 2, 'carry');
  S.carry = { from: anchor, tip: body, edge: e, mode: 'drop' }; S.ref = null; S.mode = 'dangle';
  let t = 0;
  for (;;) {
    t += DT; e.rest += DROP * DT;
    body.fx += wind.x * 2;
    S.x = body.x; S.y = body.y;
    if (body.y + BL * 0.95 >= yLand || t > 40) break;
    yield;
  }
  body.fixed = true; body.im = 0; body.heavy = false;
  S.mode = 'walk';
  yield* reachTo(subRefAt('B', clamp(body.x, sc.xL + 30, sc.xR - 30)), REACH);
  S.carry.mode = 'hold';
}
// carried line bookkeeping, spider weight, kinematic sync — once per sim step
function spiderKinematics() {
  if (S.mode === 'walk' && S.ref) {
    const r = resolve(S.ref);
    if (r) { S.ref = r; const p = ptOf(r); S.x = p.x; S.y = p.y; if (r.e.type !== 'sub') { r.e.a.fy += SW * (1 - r.t); r.e.b.fy += SW * r.t; } }
  }
  if (S.holding && S.holding.node) { const n = S.holding.node, bk = BL * 0.12; n.x = n.px = S.x - Math.cos(S.ang) * bk; n.y = n.py = S.y - Math.sin(S.ang) * bk; }
  if (S.mode === 'perch' && S.perch) { const h = S.perch; S.x = h.x; S.y = h.y - BL * 0.5; h.fy += SW; }
  S.bend = lerp(S.bend || 0, S.spiral || S.sewing ? (S.bendT || 0) : 0, 1 - Math.exp(-20 * DT));
  const c = S.carry;
  if (c) {
    if (c.tip.fixed) { const h = S.lineHold; c.tip.x = c.tip.px = h ? h.x : S.x; c.tip.y = c.tip.py = h ? h.y : S.y; }
    const d = dist(c.from, c.tip);
    if (c.mode === 'taut') c.edge.rest = d;
    else if (c.mode === 'hold') c.edge.rest = Math.max(c.edge.rest, d);
    else if (c.mode === 'loose') c.edge.rest = Math.max(d, d * c.ratio);
  }
  // heading
  const m = Math.hypot(S.mvx, S.mvy);
  let target = null;
  if (S.face != null) target = S.face;
  else if (S.spiral && hub) target = Math.atan2(S.y - hub.y, S.x - hub.x) + S.spiral * Math.PI / 2;
  else if (S.mode === 'dangle' && c) target = Math.atan2(S.y - c.from.y, S.x - c.from.x);
  else if (m > 0.02) target = Math.atan2(S.mvy, S.mvx);
  if (target != null) S.ang += angDiff(S.ang, target) * (1 - Math.exp(-14 * DT));
  S.speedNow = m / Math.max(DT, 1e-4);
  S.mvx = S.mvy = 0;
}

// ============================================================ geometry helpers
function castRay(o, th, types) {
  const dx = Math.cos(th), dy = Math.sin(th); let best = null, bs = 1e9;
  for (const e of edges) {
    if (!e.alive || !types.includes(e.type)) continue;
    const ax = e.a.x, ay = e.a.y, bx = e.b.x, by = e.b.y, ex = bx - ax, ey = by - ay;
    const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const s = ((ax - o.x) * ey - (ay - o.y) * ex) / den, t = ((ax - o.x) * dy - (ay - o.y) * dx) / den;
    if (s > 8 && t >= 0 && t <= 1 && s < bs) { bs = s; best = { e, t, s }; }
  }
  return best;
}
function nearestThread(x, y, rmax, hx, hy, maxReach, minReach = 0, leg = null) {
  const cA = Math.cos(S.ang), sA = Math.sin(S.ang), BO = bodyOrigin();
  let best = null, bd = rmax * rmax;
  for (const e of edges) {
    if (!e.alive || e.type === 'carry' || e.eat >= 0) continue;
    const ax = e.a.x, ay = e.a.y, bx = e.b.x, by = e.b.y;
    if (Math.min(ax, bx) > x + rmax || Math.max(ax, bx) < x - rmax || Math.min(ay, by) > y + rmax || Math.max(ay, by) < y - rmax) continue;
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    let t = l2 > 1e-9 ? clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1) : 0;
    let px = ax + ex * t, py = ay + ey * t, h2 = (px - hx) ** 2 + (py - hy) ** 2;
    if (minReach > 0 && h2 < minReach * minReach && l2 > 1e-9) {
      // too close to the hip: slide along the thread to the nearest point the leg can grip
      const L = Math.sqrt(l2), th = ((hx - ax) * ex + (hy - ay) * ey) / l2, dh2 = (ax + ex * th - hx) ** 2 + (ay + ey * th - hy) ** 2;
      const off = Math.sqrt(Math.max(0, minReach * minReach - dh2)) / L;
      const t1 = th - off, t2 = th + off, tc = Math.abs(t1 - t) < Math.abs(t2 - t) ? t1 : t2;
      const tt = (tc >= 0 && tc <= 1) ? tc : ((t1 >= 0 && t1 <= 1) ? t1 : t2);
      if (tt < 0 || tt > 1) continue;
      t = tt; px = ax + ex * t; py = ay + ey * t; h2 = minReach * minReach;
    }
    if (leg) { // keep each foot on its own side, front legs forward, back legs back
      const dx = px - BO.x, dy = py - BO.y, lx = cA * dx + sA * dy, ly = -sA * dx + cA * dy;
      if (ly * leg.s < -BL * 0.06) continue;
      const hxl = (leg.def.hx - 2) * SS, len = leg.def.len * BL;
      if (leg.i <= 1 && lx < hxl - len * 0.25) continue;
      if (leg.i >= 2 && lx > hxl + len * 0.3) continue;
    }
    const d2 = (px - x) ** 2 + (py - y) ** 2;
    if (d2 < bd && h2 <= maxReach * maxReach && h2 >= minReach * minReach * 0.98) { bd = d2; best = { e, t }; }
  }
  return best;
}
function followType(start, firstEdge, type) {
  const list = [start]; let cur = start, pe = null, e = firstEdge;
  while (e) { cur = e.other(cur); list.push(cur); pe = e; e = cur.edges.find(x => x.alive && x.type === type && x !== pe) || null; }
  return list;
}
