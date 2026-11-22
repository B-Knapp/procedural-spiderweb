/* Orb Weaver — a web-weaving screensaver
   Every thread exists only because the spider physically laid it.
   Architecture:
     - graph:   nodes + edges (silk), rope physics (tension only)
     - motor:   walkTo / reachTo / startCarry / layLine / dropDown / eat  (the spider's body)
     - brain:   generator programs that sequence motor primitives (natural orb weaving now;
                a "drawing" brain can reuse the same motor layer later)
     - render:  farm scene, lighting by time of day, clean / pixel modes
*/
(() => {
'use strict';

// ============================================================ config
const W = 1920, H = 1080, HZ = 640, SEG = 48;
const qs = new URLSearchParams(location.search);
const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const CFG = {
  speedIdx: SPEEDS.indexOf(+qs.get('speed')) >= 0 ? SPEEDS.indexOf(+qs.get('speed')) : 2,
  pixel: false, captions: true, bigSpider: false, dayMinutes: 60, PX: 3,
};
try { const s = JSON.parse(localStorage.getItem('orbweaver') || '{}'); if (s.pixel != null) CFG.pixel = s.pixel; if (s.captions != null) CFG.captions = s.captions; if (s.bigSpider != null) CFG.bigSpider = s.bigSpider; } catch (e) {}
if (qs.get('big') != null) CFG.bigSpider = qs.get('big') === '1';
if (qs.get('pixel') != null) CFG.pixel = qs.get('pixel') === '1';
const saveCfg = () => { try { localStorage.setItem('orbweaver', JSON.stringify({ pixel: CFG.pixel, captions: CFG.captions, bigSpider: CFG.bigSpider })); } catch (e) {} };

// ============================================================ math
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a), randi = (a, b) => Math.floor(rand(a, b + 1));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const NT = new Float32Array(4096); for (let i = 0; i < 4096; i++) NT[i] = Math.random() * 2 - 1;
const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return NT[i & 4095] * (1 - u) + NT[(i + 1) & 4095] * u; };
const hash1 = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1]; };
const smooth = t => t * t * (3 - 2 * t);

// ============================================================ sim state
let simTime = 0, DT = 1 / 60;
let nodes = [], edges = [], radii = [], auxBySector = new Map();
let floatL_reason = '', hub = null, floatL = null, sc = null, geom = {};
let NID = 0, EID = 0;

class Node {
  constructor(x, y, fixed) {
    this.id = NID++; this.x = x; this.y = y; this.px = x; this.py = y;
    this.fixed = !!fixed; this.im = fixed ? 0 : 1; this.edges = []; this.alive = true;
    this.fx = 0; this.fy = 0; this.rid = null; this.remnant = false; this.keep = false; this.heavy = false;
    nodes.push(this);
  }
}
class Edge {
  constructor(a, b, rest, type) {
    this.id = EID++; this.a = a; this.b = b; this.rest = rest; this.type = type; this.alive = true;
    this.strands = 1; this.rid = null; this.sector = null; this.rpos = 0; this.born = simTime; this.eat = -1; this.side = null;
    this.h = hash1(this.id + 1); this.k = STIFFT[type] || 0.8;
    a.edges.push(this); b.edges.push(this); edges.push(this);
  }
  len() { return Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y); }
  other(n) { return n === this.a ? this.b : this.a; }
}
const COPYK = ['strands', 'rid', 'sector', 'rpos', 'born', 'side', 'h'];

function killEdge(e) {
  if (!e.alive) return; e.alive = false;
  for (const n of [e.a, e.b]) {
    const i = n.edges.indexOf(e); if (i >= 0) n.edges.splice(i, 1);
    if (n.edges.length === 0 && !n.fixed && !n.keep) n.alive = false;
  }
}
function splitEdge(e, t) {
  const a = e.a, b = e.b;
  const n = new Node(lerp(a.x, b.x, t), lerp(a.y, b.y, t), e.type === 'sub');
  n.px = lerp(a.px, b.px, t); n.py = lerp(a.py, b.py, t);
  const e1 = new Edge(a, n, e.rest * t, e.type), e2 = new Edge(n, b, e.rest * (1 - t), e.type);
  for (const k of COPYK) { e1[k] = e[k]; e2[k] = e[k]; }
  e2.h = hash1(e2.id + 7);
  killEdge(e); e.split = { t, e1, e2, n };
  if (e.rid != null) {
    const R = radii[e.rid]; const ia = R.nodes.indexOf(a), ib = R.nodes.indexOf(b);
    if (ia >= 0 && ib >= 0) R.nodes.splice(Math.max(ia, ib), 0, n);
    n.rid = e.rid;
  }
  if (e.type === 'aux' && e.sector) { const arr = auxBySector.get(e.sector); if (arr) arr.push(e1, e2); }
  return n;
}
function resolve(r) {
  if (!r) return null; let e = r.e, t = r.t, g = 0;
  while (!e.alive && e.split && g++ < 400) {
    const s = e.split;
    if (t <= s.t) { t = s.t > 1e-9 ? t / s.t : 0; e = s.e1; } else { t = s.t < 1 - 1e-9 ? (t - s.t) / (1 - s.t) : 1; e = s.e2; }
  }
  return e.alive ? { e, t } : null;
}
const ptOf = r => ({ x: r.e.a.x + (r.e.b.x - r.e.a.x) * r.t, y: r.e.a.y + (r.e.b.y - r.e.a.y) * r.t });
const walkable = e => e.alive && e.type !== 'carry' && e.type !== 'glue' && e.type !== 'stub' && e.eat < 0;
function edgeBetween(a, b) { for (const e of a.edges) if (walkable(e) && e.other(a) === b) return e; return null; }
function refAtNode(n, pref) {
  let best = null;
  for (const e of n.edges) { if (!walkable(e)) continue; if (!best || (pref && e.type === pref && best.type !== pref)) best = e; }
  return best ? { e: best, t: best.a === n ? 0 : 1 } : null;
}
function nodeAtRef(ref, snap = 2.5) {
  const r = resolve(ref); const L = r.e.len();
  if (r.t * L < snap) return r.e.a; if ((1 - r.t) * L < snap) return r.e.b;
  return splitEdge(r.e, r.t);
}
// a line laid from a to b with given rest length, subdivided so it can sag and flex
function makeLine(a, b, rest, type) {
  const d = dist(a, b); const n = Math.max(1, Math.ceil(Math.max(d, rest) / SEG));
  const sag = rest > d * 1.005 ? Math.sqrt(3 * d * (rest - d) / 8) : 0;
  let prev = a; const es = [], ns = [a];
  for (let i = 1; i <= n; i++) {
    let cur;
    if (i === n) cur = b; else { const t = i / n; cur = new Node(lerp(a.x, b.x, t), lerp(a.y, b.y, t) + 4 * sag * t * (1 - t), false); }
    const e = new Edge(prev, cur, rest / n, type); es.push(e); ns.push(cur); prev = cur;
  }
  return { edges: es, nodes: ns };
}

// ------------------------------------------------------------ physics (rope: tension only)
const GRAV = 70, DAMP = 0.982, ITER = 12;
const STIFFT = { bridge: 1, frame: 1, anchor: 1, sub: 1, glue: 1, stub: 0.6, radius: 0.7, loose: 0.9, carry: 0.9, hub: 0.5, aux: 0.5, capture: 0.35 };
const wind = { x: 0, y: 0, t: rand(0, 1000) };
function updateWind(dt) {
  wind.t += dt;
  wind.x = 40 * (noise1(wind.t * 0.045) + 0.45 * noise1(wind.t * 0.21 + 77));
  wind.y = 10 * noise1(wind.t * 0.33 + 13);
}
function physics(dt) {
  const wx = wind.x * 2.2, wy = wind.y, dt2 = dt * dt;
  for (const n of nodes) {
    if (n.fixed || !n.alive) { n.fx = n.fy = 0; continue; }
    const vx = (n.x - n.px) * DAMP, vy = (n.y - n.py) * DAMP; n.px = n.x; n.py = n.y;
    const g = n.heavy ? 900 : GRAV, wf = n.heavy ? 0.25 : 1;
    n.x += vx + (n.fx + wx * wf) * dt2; n.y += vy + (g + n.fy + wy * wf) * dt2; n.fx = n.fy = 0;
    if (sc && !n.noClamp) { n.x = clamp(n.x, sc.xL + 1, sc.xR - 1); n.y = clamp(n.y, sc.yT + 1, sc.yB - 1); }
  }
  for (let it = 0; it < ITER; it++) for (let i = 0; i < edges.length; i++) {
    const e = edges[i]; if (!e.alive) continue;
    const a = e.a, b = e.b, w = a.im + b.im; if (w === 0) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= e.rest || d < 1e-6) continue;
    const k = (d - e.rest) / (d * w) * e.k;
    a.x += dx * k * a.im; a.y += dy * k * a.im; b.x -= dx * k * b.im; b.y -= dy * k * b.im;
  }
}
function compact() { edges = edges.filter(e => e.alive); nodes = nodes.filter(n => n.alive); }

// ------------------------------------------------------------ substrate (the fence opening)
function buildSubstrate() {
  const c1 = new Node(sc.xL, sc.yT, true), c2 = new Node(sc.xR, sc.yT, true), c3 = new Node(sc.xR, sc.yB, true), c4 = new Node(sc.xL, sc.yB, true);
  for (const [a, b, s] of [[c1, c2, 'T'], [c2, c3, 'R'], [c4, c3, 'B'], [c1, c4, 'L']]) { const e = new Edge(a, b, 0, 'sub'); e.side = s; }
}
function subRefAt(side, v) {
  let best = null, bd = 1e9;
  for (const e of edges) {
    if (!e.alive || e.type !== 'sub' || e.side !== side) continue;
    const horiz = side === 'T' || side === 'B';
    const a = horiz ? e.a.x : e.a.y, b = horiz ? e.b.x : e.b.y;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const vv = clamp(v, lo, hi), dd = Math.abs(vv - v);
    if (dd < bd) { bd = dd; best = { e, t: hi - lo < 1e-6 ? 0 : (vv - a) / (b - a) }; }
  }
  return best;
}

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
  const tip = new Node(S.x, S.y, true); tip.keep = true;
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
  stats.lines++;
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
const COST = { sub: 1.15, bridge: 1, frame: 1, radius: 1, loose: 1.1, hub: 1.8, aux: 1.4, capture: 9 };
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
    let budget = speed * DT * (S.slow || 1);
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
  S.bend = lerp(S.bend || 0, S.spiral ? (S.bendT || 0) : 0, 1 - Math.exp(-20 * DT));
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

// ============================================================ the brain: natural orb weaving
const stats = { lines: 0, webs: 0 };
let caption = { t: '', s: '' };
function say(t, s = '') { caption = { t, s }; }

function* buildOrb() {
  // ---------- 1. bridge line ----------
  const br = yield* phaseBridge();
  const A = br.A, Fn = br.F;
  // ---------- 2. reinforce + loose line + Y ----------
  say('Bridge line', 'crossing to reinforce it with a second strand');
  yield* walkTo({ node: A });
  startCarry('taut');
  yield* walkTo({ node: Fn });
  dropCarry();
  for (const e of edges) if (e.alive && e.type === 'bridge') e.strands = 2;
  yield* pause(0.8);

  const span = Math.abs(Fn.x - A.x), left = A.x < Fn.x ? A : Fn, right = left === A ? Fn : A;
  const hx = (left.x + right.x) / 2 + rand(-0.06, 0.06) * span;
  const byAt = lerp(left.y, right.y, (hx - left.x) / (right.x - left.x));
  const Hp = { x: hx, y: byAt + (sc.yB - byAt) * rand(0.37, 0.45) };
  geom.H = Hp;
  const looseLen = dist(A, Hp) + dist(Hp, Fn);

  say('Loose thread', 'laying a slack line back across the bridge');
  startCarry('loose'); S.carry.ratio = looseLen / dist(A, Fn);
  yield* walkTo({ node: A });
  const lres = layLine('loose', 0, {}, false, looseLen);
  // the point on the slack line that will become the hub
  const chain = lres.line.nodes.slice().reverse(); // A ... Fn
  let want = dist(A, Hp), cum = 0, hubRef = null;
  for (let i = 0; i < chain.length - 1; i++) {
    const L = dist(chain[i], chain[i + 1]);
    if (cum + L >= want) { const e = edgeBetween(chain[i], chain[i + 1]); const f = (want - cum) / L; hubRef = { e, t: e.a === chain[i] ? f : 1 - f }; break; }
    cum += L;
  }
  say('Proto-hub', 'walking out onto the slack line');
  yield* walkTo({ ref: hubRef }, WALK * 0.6);
  yield* pause(0.6);
  const M = hereNode(); hub = M; hub.keep = true;
  say('Proto-hub', 'dropping on a dragline to pull the slack line into a Y');
  yield* dropDown(M, sc.yB);
  yield* walkTo({ ref: subRefAt('B', clamp(Hp.x + rand(-20, 20), sc.xL + 40, sc.xR - 40)) }, WALK * 0.7);
  say('Proto-hub', 'reeling in — the Y pulls tight; its centre becomes the hub');
  const target = dist(Hp, { x: S.x, y: S.y });
  S.carry.mode = 'hold';
  while (S.carry.edge.rest > target) { S.carry.edge.rest = Math.max(target, S.carry.edge.rest - 40 * DT); yield; }
  yield* pause(0.6);
  const r3 = layLine('radius', 0.01, {}, false);
  registerRadius(r3.line.nodes);
  for (const e of M.edges.slice()) if (e.alive && e.type === 'loose') {
    const ns = followType(M, e, 'loose'); for (let i = 0; i < ns.length - 1; i++) { const ee = edgeBetween(ns[i], ns[i + 1]); if (ee) ee.type = 'radius'; }
    registerRadius(ns);
  }
  say('Proto-hub', 'climbing back up to the hub');
  yield* walkTo({ node: hub });

  // ---------- 3. frame threads ----------
  yield* phaseFrames(left, right);
  // ---------- 4. radii ----------
  yield* phaseRadii();
  // ---------- 5. hub loops + temporary spiral ----------
  yield* phaseAux();
  // ---------- 6. sticky capture spiral ----------
  yield* phaseCapture();
  // ---------- 7. free zone + settle at hub ----------
  yield* phaseFinish();
  stats.webs++;
}

function* phaseBridge() {
  const side = wind.x >= 0 ? 'L' : 'R';          // launch from the upwind post
  const dir = side === 'L' ? 1 : -1;
  say('Bridge line', 'climbing the post to find a launch point');
  const ly = sc.yT + rand(35, 120);
  yield* walkTo({ ref: subRefAt(side, ly) });
  S.face = -Math.PI / 2;
  for (let attempt = 0; attempt < 4; attempt++) {
    say('Bridge line', 'waiting for a breeze toward the far post');
    let waited = 0;
    while (wind.x * dir < 10 && waited < 25) { waited += DT; yield; }
    say('Bridge line', 'abdomen raised — letting silk drift on the breeze');
    const res = yield* floatLine(dir);
    stats.attempts = (stats.attempts || 0) + 1; stats.fail = stats.fail || {}; if (!res) stats.fail[floatL_reason] = (stats.fail[floatL_reason] || 0) + 1;
    if (res) { S.face = null; return res; }
    say('Bridge line', 'no snag — reeling the silk back in to try again');
    yield* pause(rand(1.5, 3.5));
  }
  // fallback (also a real method): walk the dragline across along the rail
  S.face = null;
  say('Bridge line', 'no luck with the wind — carrying a line across by foot');
  const A = hereNode(); startCarryAt(A, 'hold');
  yield* walkTo({ ref: subRefAt(side === 'L' ? 'R' : 'L', ly + rand(-30, 30)) });
  const res = layLine('bridge', 0.002, {}, false);
  return { A, F: res.node };
}

function* floatLine(dir) {
  const P = (x, y) => ({ x, y, px: x, py: y });
  const F = { pts: [P(S.x, S.y)], seg: 6, total: 0, snag: null, reel: 0 }; floatL = F;
  const farX = dir > 0 ? sc.xR : sc.xL, span = Math.abs(sc.xR - sc.xL);
  let t = 0, ok = false;
  const simulate = (pinTail) => {
    const base = F.pts[0], bp = F.toMouth ? mouthPos() : S; base.x = base.px = bp.x; base.y = base.py = bp.y;
    const wvx = wind.x * 2.5, wvy = wind.y * 1.6 - 6;
    for (let i = 1; i < F.pts.length; i++) {
      const p = F.pts[i]; if (pinTail && i === F.pts.length - 1) continue;
      const vx = p.x - p.px, vy = p.y - p.py; p.px = p.x; p.py = p.y;
      const turb = noise1(simTime * 0.8 + i * 0.23) * 34;
      const ax = (wvx - vx / DT) * 1.3, ay = (wvy + turb - vy / DT) * 1.3 + 14;
      p.x += vx + ax * DT * DT; p.y += vy + ay * DT * DT;
    }
    for (let k = 0; k < 5; k++) for (let i = 1; i < F.pts.length; i++) {
      const a = F.pts[i - 1], b = F.pts[i], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= F.seg || d < 1e-6) continue;
      const wa = i - 1 === 0 ? 0 : 1, wb = (pinTail && i === F.pts.length - 1) ? 0 : 1, ws = wa + wb; if (!ws) continue;
      const k2 = (d - F.seg) / d / ws;
      a.x += dx * k2 * wa; a.y += dy * k2 * wa; b.x -= dx * k2 * wb; b.y -= dy * k2 * wb;
    }
    for (const p of F.pts) { if (p.y < sc.yT + 2) p.y = sc.yT + 2; if (dir > 0 ? p.x > farX : p.x < farX) p.x = farX; }
  };
  for (;;) {
    t += DT;
    F.total += (Math.max(0, wind.x * dir) * 2.4 + 10) * DT;
    while ((F.pts.length - 1) * F.seg < F.total) { const b = F.pts[0], p1 = F.pts[1] || b; F.pts.splice(1, 0, P(lerp(b.x, p1.x, 0.3), lerp(b.y, p1.y, 0.3))); }
    simulate(false);
    const tail = F.pts[F.pts.length - 1];
    const atFar = dir > 0 ? tail.x >= farX - 0.5 : tail.x <= farX + 0.5;
    if (atFar) {
      if (tail.y > sc.yT + 10 && tail.y < sc.yT + (sc.yB - sc.yT) * 0.42) { F.snag = { x: farX, y: tail.y }; ok = true; break; }
      floatL_reason = 'lowsnag'; break;
    }
    if (F.pts.some(p => p.y > sc.yB - 6)) { floatL_reason = 'ground'; break; } if (F.total > span * 2.6) { floatL_reason = 'long'; break; } if (t > 70) { floatL_reason = 'time'; break; }
    yield;
  }
  if (!ok) { // reel it back in with the legs and eat it
    F.toMouth = true;
    while (F.pts.length > 1) {
      const n = Math.max(1, Math.round(60 * DT / F.seg)); F.pts.splice(1, n); F.total = (F.pts.length - 1) * F.seg; simulate(false); yield;
    }
    floatL = null; return null;
  }
  say('Bridge line', 'it snagged the far post — pulling it taut');
  const tail = F.pts[F.pts.length - 1]; tail.x = tail.px = F.snag.x; tail.y = tail.py = F.snag.y;
  for (;;) {
    F.seg *= Math.pow(0.6, DT); simulate(true);
    const D = Math.hypot(F.snag.x - S.x, F.snag.y - S.y);
    if (F.seg * (F.pts.length - 1) <= D * 1.03) break;
    yield;
  }
  yield* pause(0.4);
  const A = hereNode();
  const Fn = nodeAtRef(subRefAt(dir > 0 ? 'R' : 'L', F.snag.y));
  makeLine(A, Fn, dist(A, Fn) * 1.004, 'bridge');
  floatL = null;
  S.ref = refAtNode(A, 'bridge');
  return { A, F: Fn };
}

function* phaseFrames(left, right) {
  const span = sc.xR - sc.xL;
  // frame jobs: two lower frame lines (hub -> bottom anchor -> bridge end) and
  // 2-3 upper frame lines tying the bridge up to the top rail, in a natural order
  const nA = randi(2, 3), fr = nA === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
  const sides = Math.random() < 0.5 ? [-1, 1] : [1, -1];
  if (sides[0] > 0) fr.reverse();                       // work across from the first side
  const jobs = [{ side: sides[0] }, ...fr.map(f => ({ top: f })), { side: sides[1] }];
  for (const job of jobs) {
    if (job.side) {
      const side = job.side, end = side < 0 ? left : right;
      const ax = side < 0 ? sc.xL + rand(0.07, 0.2) * span : sc.xR - rand(0.07, 0.2) * span;
      say('Frame threads', 'carrying a new line from the hub down to an anchor');
      yield* walkTo({ node: hub });
      startCarry('taut');
      yield* walkTo({ ref: subRefAt('B', ax) });
      const rr = layLine('radius', 0.006, {}, false); registerRadius(rr.line.nodes);
      say('Frame threads', 'running a frame line up to the bridge end');
      startCarry('taut');
      yield* walkTo({ node: end });
      layLine('frame', 0.006, {}, false);
    } else {
      const bx = lerp(left.x, right.x, job.top + rand(-0.06, 0.06));
      const ref = bridgeRefAtX(bx); if (!ref) continue;
      say('Frame threads', 'tying the top frame up to the rail');
      yield* walkTo({ ref });
      yield* pause(0.3);
      startCarry('taut');
      yield* walkTo({ ref: subRefAt('T', clamp(bx + rand(-50, 50), sc.xL + 25, sc.xR - 25)) });
      yield* pause(0.3);
      layLine('frame', 0.04, {}, false);
    }
  }
  yield* walkTo({ node: hub });
}
function bridgeRefAtX(x) {
  let best = null, bd = 1e9;
  for (const e of edges) {
    if (!e.alive || e.type !== 'bridge') continue;
    const lo = Math.min(e.a.x, e.b.x), hi = Math.max(e.a.x, e.b.x);
    const dd = x < lo ? lo - x : x > hi ? x - hi : 0;
    if (dd < bd) { bd = dd; const t = hi - lo < 1e-6 ? 0.5 : clamp((x - e.a.x) / (e.b.x - e.a.x), 0, 1); best = { e, t }; }
  }
  return best;
}

function* phaseRadii() {
  const N = randi(24, 33); let last = null;
  for (let guard = 0; guard < 90; guard++) {
    const Rs = sortedRadii(); const n = Rs.length, angs = Rs.map(radAngle);
    let maxG = 0; const gaps = [];
    for (let i = 0; i < n; i++) { let g = angs[(i + 1) % n] - angs[i]; if (g <= 0) g += TAU; gaps.push(g); if (g > maxG) maxG = g; }
    if ((n >= N && maxG < TAU / N * 1.6) || n >= N + 3 || maxG < TAU / N * 1.12) break;
    // big gaps, preferring the side opposite the last radius (spiders alternate)
    let bi = -1, bs = -1;
    for (let i = 0; i < n; i++) {
      if (gaps[i] < maxG * 0.72) continue;
      const mid = angs[i] + gaps[i] / 2; const opp = last == null ? 1 : Math.abs(angDiff(mid, last)) / Math.PI;
      const sc_ = gaps[i] / maxG + opp * 0.8 + Math.random() * 0.3; if (sc_ > bs) { bs = sc_; bi = i; }
    }
    const th = angs[bi] + gaps[bi] * rand(0.42, 0.58);
    const hit = castRay(hub, th, ['bridge', 'frame', 'sub']); if (!hit) continue;
    say('Radii', `spoke ${n + 1} — out along a neighbour, across the frame, and back`);
    yield* walkTo({ node: hub });
    startCarry('taut');
    yield* walkTo({ ref: { e: hit.e, t: hit.t } });
    yield* pause(0.15);
    const rr = layLine('radius', 0.004, {}, false); const R = registerRadius(rr.line.nodes);
    yield* walkTo({ node: hub });
    for (let i = 0; i < R.nodes.length - 1; i++) { const e = edgeBetween(R.nodes[i], R.nodes[i + 1]); if (e) e.strands = 2; }
    last = th;
    yield* pause(0.2);
  }
}

function* phaseAux() {
  const Rs = sortedRadii(), n = Rs.length, lens = Rs.map(radiusLen), Rm = median(lens);
  const rh0 = Math.max(6, Rm * 0.022), rh = Rm * 0.085, hubTurns = randi(3, 5), K = rand(4.2, 6.0), Rend = Rm * 0.86;
  Object.assign(geom, { rh, Rm });
  let j = randi(0, n - 1); const d = Math.random() < 0.5 ? 1 : -1; let phi = 0, phase = 'hub';
  yield* walkTo({ node: hub });
  say('Hub', 'tying the hub together with tight loops');
  let prevR = rh0;
  yield* reachTo(radiusPoint(Rs[j], rh0), REACH * 0.5);
  startCarry('taut');
  const hubPhi = hubTurns * TAU; S.spiral = d;
  for (let guard = 0; guard < 4000; guard++) {
    const k = (j + d + n) % n; phi += Math.abs(angDiff(radAngle(Rs[j]), radAngle(Rs[k])));
    let rr;
    if (phi <= hubPhi) rr = rh0 + (rh - rh0) * phi / hubPhi;
    else {
      const u = (phi - hubPhi) / (K * TAU); if (u > 1) break;
      if (phase === 'hub') { phase = 'aux'; say('Temporary spiral', 'a wide, non-sticky scaffold spiralling outward'); }
      rr = rh + (Rend - rh) * Math.pow(u, 0.85);
    }
    rr = Math.min(rr, radiusLen(Rs[k]) * 0.9);
    const ok = yield* reachTo(radiusPoint(Rs[k], rr), phase === 'hub' ? REACH * 0.5 : REACH);
    if (!ok) break;
    const key = sectorKey(Rs[j], Rs[k]);
    const res = layLine(phase, 0, { sector: key, rpos: (prevR + rr) / 2 });
    if (phase === 'aux' && res.line) { let arr = auxBySector.get(key); if (!arr) { arr = []; auxBySector.set(key, arr); } arr.push(...res.line.edges); }
    yield* pause(phase === 'hub' ? 0.04 : 0.14);
    j = k; prevR = rr;
  }
  dropCarry(); S.spiral = 0;
  geom.auxJ = j;
}

function* phaseCapture() {
  const Rs = sortedRadii(), n = Rs.length; const Rm = geom.Rm;
  const s = Rm / rand(24, 29); geom.s = s;
  const Z = geom.rh + Rm * rand(0.1, 0.13); geom.Z = Z;
  const ang0 = Rs.map(radAngle), lens = Rs.map(radiusLen);
  const sl = [...lens].sort((a, b) => a - b);
  const Rb = sl[Math.floor(sl.length * 0.22)] * rand(0.92, 1.0), squash = rand(0.2, 0.34);
  geom.env = { Rb, squash };
  const O = Rs.map((R, i) => Math.min(lens[i] - s * 0.8, Rb * (1 + squash * Math.sin(ang0[i])) * (1 + 0.04 * Math.cos(ang0[i] * 2 + 1))));
  const N = O.map(o => Math.max(1, Math.floor((o - Z) / s)));      // turns this radius can hold
  const sj = O.map((o, i) => (o - Z) / N[i]);                        // its own spacing (≈ s)
  const c = N.slice();                                               // turns still to lay
  const f = new Array(n).fill(Infinity);                             // last laid position
  const ang = Rs.map(radAngle);
  let j = 0; for (let i = 1; i < n; i++) if (N[i] > N[j]) j = i;
  const th0 = ang[j];
  let d = c[(j + 1) % n] >= c[(j - 1 + n) % n] ? 1 : -1;
  const posOf = (k, dir) => {
    const frac = ((((th0 - ang[k]) * dir) % TAU) + TAU) % TAU / TAU;
    let q = Z + (c[k] - 1 + frac) * sj[k];
    q = Math.min(q, f[k] - 0.55 * s, O[k]);
    return q;
  };
  let p = posOf(j, d);
  say('Capture spiral', 'heading out to the edge to begin the sticky spiral');
  yield* walkTo({ ref: radiusPoint(Rs[j], p) });
  startCarry('taut'); f[j] = p; c[j]--;
  let turnbacks = 0; S.spiral = d;
  for (let guard = 0; guard < 6000; guard++) {
    const kf = (j + d + n) % n, kb = (j - d + n) % n;
    let k;
    if (c[kf] > 0 && c[kf] >= c[j]) k = kf;
    else if (c[kb] > 0 && c[kb] >= c[j]) { k = kb; d = -d; turnbacks++; }
    else if (c[kf] > 0 && c[kf] >= c[kb]) k = kf;
    else if (c[kb] > 0) { k = kb; d = -d; turnbacks++; }
    else break;
    const q = posOf(k, d); S.spiral = d;
    if (q < Z - s * 0.5) { c[k] = 0; continue; }
    const uneven = Math.max(...c) - Math.min(...c) > 1;
    say('Capture spiral', uneven ? `sticky silk; turnbacks fill the larger lower half (${turnbacks})`
      : 'sticky silk, spiralling inward and eating the scaffold');
    const ok = yield* reachTo(radiusPoint(Rs[k], q), REACH); if (!ok) { geom.capEnd = 'reachfail'; break; }
    const key = sectorKey(Rs[j], Rs[k]);
    layLine('capture', 0.0, { sector: key, rpos: (p + q) / 2 });
    f[k] = q; c[k]--; geom.capTotal = (geom.capTotal || 0) + 1;
    const arr = auxBySector.get(key);
    if (arr) { const eat = arr.filter(e => e.alive && e.eat < 0 && e.rpos > q - 0.7 * s); if (eat.length) yield* eatEdges(eat, 0.22); }
    yield* pause(0.1);
    j = k; p = q;
  }
  geom.capEnd = { turnbacks, left: c.reduce((a, b) => a + b, 0) };
  dropCarry(); S.spiral = 0;
}

function* phaseFinish() {
  say('Free zone', 'clearing the last of the scaffold near the hub');
  for (let guard = 0; guard < 200; guard++) {
    const rest = edges.filter(e => e.alive && e.type === 'aux' && e.eat < 0); if (!rest.length) break;
    let best = null, bd = 1e9;
    for (const e of rest) { const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }; const dd = dist(m, S); if (dd < bd) { bd = dd; best = e; } }
    const nd = best.a.rid != null ? best.a : best.b;
    const r = refAtNode(nd, 'radius');
    if (r && dist(nd, S) > 3) yield* reachTo(r, REACH);
    yield* eatEdges([best], 0.2);
    if (!S.ref || !resolve(S.ref)) S.ref = refAtNode(nd, 'radius');
  }
  if (!resolve(S.ref)) S.ref = nearestWalkRef();
  say('Finished', 'returning to the hub');
  yield* walkTo({ node: hub });
}
function nearestWalkRef() { const nr = nearestThread(S.x, S.y, 400, S.x, S.y, 400); return nr; }

function* perchAtHub(dur) {
  yield* walkTo({ node: hub });
  S.mode = 'perch'; S.perch = hub; S.ref = null; S.face = Math.PI / 2; S.perchT = simTime;
  let t = 0;
  while (t < dur) {
    t += DT;
    say('Waiting at the hub', 'head down, legs on the radii, feeling for vibrations');
    yield;
  }
  S.mode = 'walk'; S.face = null;
  yield* reachTo(refAtNode(hub, 'radius'), REACH * 0.5);
}

function* takeDown() {
  say('Taking the web down', 'orb weavers eat their old silk and recycle it');
  const Rs = sortedRadii(); if (!Rs.length) return;
  // start with the radius nearest straight down, sweep around
  let atHub = true;
  const todo = Rs.slice();
  const eatAt = function* (nd) {
    const l = nd.edges.filter(e => e.alive && e.eat < 0 && (e.type === 'capture' || e.type === 'aux' || e.type === 'hub' || e.type === 'stub' || e.type === 'glue'));
    if (l.length) yield* eatEdges(l, 0.1);
  };
  while (todo.length) {
    const R = todo.shift();
    let seq = liveNodes(R);
    if (seq.length < 2) continue;
    if (!atHub) {
      yield* walkTo({ node: seq[seq.length - 1] });
      if (todo.length === 0) { yield* walkTo({ node: seq[0] }); atHub = true; }
    }
    if (atHub) { // out
      yield* walkTo({ node: seq[0] });
      for (let i = 1; i < seq.length; i++) {
        if (!seq[i].alive) continue;
        yield* walkTo({ node: seq[i] }, WALK * 1.3);
        yield* eatAt(seq[i]);
        const e = edgeBetween(seq[i - 1], seq[i]); if (e) yield* eatEdges([e], 0.05);
      }
      atHub = false;
    } else { // in
      for (let i = seq.length - 2; i >= 0; i--) {
        if (!seq[i].alive) continue;
        yield* walkTo({ node: seq[i] }, WALK * 1.3);
        yield* eatAt(seq[i]);
        const e = edgeBetween(seq[i + 1], seq[i]); if (e) yield* eatEdges([e], 0.05);
      }
      atHub = true;
    }
  }
  // the rest: frames, bridge, leftovers — walk each strand and eat it
  say('Taking the web down', 'rolling up the frame and bridge lines');
  for (let guard = 0; guard < 600; guard++) {
    if (!resolve(S.ref)) { yield* emergencyDrop(); }
    let found = null;
    const res = dijkstra(S.ref, n => { const e = n.edges.find(x => walkable(x) && x.type !== 'sub'); if (e) { found = { n, e }; return true; } return false; });
    if (!found) break;
    yield* walkTo({ node: found.n });
    const other = found.e.other(found.n);
    if (found.e.alive) yield* walkTo({ node: other }, WALK * 0.9);
    yield* eatEdges([found.e], 0.1);
    const r = resolve(S.ref);
    if (!r) { S.ref = refAtNode(other); if (!S.ref) yield* emergencyDrop(); }
  }
  { const rest = edges.filter(e => e.alive && e.eat < 0 && (e.type === 'stub' || e.type === 'glue' || (e.type !== 'sub' && e.type !== 'carry'))); if (rest.length) yield* eatEdges(rest, 0.4); }
  compact();
}
function* emergencyDrop() {
  say('Taking the web down', 'dropping on a safety line');
  const anchor = new Node(S.x, S.y, true); anchor.keep = true;
  yield* dropDown(anchor, sc.yB);
  dropCarry(); anchor.alive = false; anchor.keep = false;
}

function* enter() {
  say('An orb weaver arrives', 'climbing onto the fence');
  yield* pause(1);
}
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
    damage.push({ type: e.type, a: e.a, b: e.b, rid: e.rid, sector: e.sector, rpos: e.rpos });
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
  b.state = 'stuck'; b.stuckAt = simTime; b.heading = Math.atan2(b.vy, b.vx);
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
      const na = ang + angDiff(ang, want) * Math.min(1, dt * (0.8 + near * 5));
      b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp + noise1(b.t * 3 + b.ph) * 20 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;

      if (b.state === 'fly' && b.tgt && b.z > 0) {
        // approaching the web from in front: depth closes as it nears its target point
        const rem = dist(b, b.tgt);
        b.z = Math.min(b.z, b.z0 != null ? b.z0 * rem / b.d0 : b.z);
        if (b.z0 == null) b.z0 = b.z;
        if (rem < Math.max(b.T.size * 0.5, b.T.speed * dt * 1.5)) b.z = 0;
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
          if (e.type !== 'capture') { dry = true; continue; }
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
            const near = edges.filter(f => f.alive && f.eat < 0 && (f.type === 'capture' || (f.type === 'radius' && Math.random() < 0.08 * b.T.strength)) && Math.hypot((f.a.x + f.b.x) / 2 - B.x, (f.a.y + f.b.y) / 2 - B.y) < b.T.size * 2);
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
function radialPos(R, n) { const l = liveNodes(R); let c = 0; for (let i = 0; i < l.length; i++) { if (l[i] === n) return c; if (i < l.length - 1) c += dist(l[i], l[i + 1]); } return -1; }
function* eatStubsNear(x, y, r) {
  const l = edges.filter(e => e.alive && e.type === 'stub' && Math.hypot(e.a.x - x, e.a.y - y) < r);
  if (l.length) yield* eatEdges(l, 0.2);
}
function* repairWeb() {
  const D = damage.splice(0); if (!D.length || !hub) return;
  const s = geom.s || 10;
  // 1. broken radii first: they carry the load
  for (const d of D) {
    if (d.type !== 'radius' || !d.a.alive || !d.b.alive || edgeBetween(d.a, d.b)) continue;
    say('Repairing the web', 'replacing a broken radius');
    if (!(yield* walkTo({ node: d.a }, WALK * 1.2))) continue;
    yield* eatStubsNear(d.a.x, d.a.y, 6);
    startCarry('taut');
    const rb = refAtNode(d.b); if (!rb) { dropCarry(); continue; }
    yield* reachTo(rb, REACH);
    yield* eatStubsNear(d.b.x, d.b.y, 6);
    const L = layLine('radius', 0.004, {}, false);
    if (L.line && d.rid != null) {
      for (const e of L.line.edges) { e.rid = d.rid; e.k = STIFFT.radius; }
      const R = radii[d.rid], ia = R.nodes.indexOf(d.a), ib = R.nodes.indexOf(d.b), mids = L.line.nodes.slice(1, -1);
      mids.forEach(n => n.rid = d.rid);
      if (ia >= 0 && ib >= 0 && mids.length) { if (ia < ib) R.nodes.splice(ib, 0, ...mids); else R.nodes.splice(ia, 0, ...mids.reverse()); }
    }
  }
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
function drawBugs(c, unit, top = false) {
  const tn = P.tint, col = (r, g, b, a = 1) => `rgba(${r * tn[0] | 0},${g * tn[1] | 0},${b * tn[2] | 0},${a})`;
  for (const b of bugs) {
    const zs = b.z > 0 ? 1 + b.z / 500 : b.z < 0 && b.state !== 'stuck' ? Math.max(0.6, 1 + b.z / 900) : 1;
    const s = b.T.size * (1 - 0.3 * b.feed) * zs;
    c.save(); c.translate(b.x, b.y); c.globalAlpha = clamp(b.alpha, 0, 1) * (b.z < 0 && b.state !== 'stuck' && b.state !== 'held' && b.state !== 'hung' ? 0.75 : 1);
    const flying = b.state === 'fly' || b.state === 'leave';
    const head = flying ? Math.atan2(b.vy, b.vx) : b.heading;
    c.rotate(head + b.rot);
    if (b.wrap < 0.98) {
      const str = b.state === 'stuck' ? b.T.strength * (1 - b.para) : 0;
      const flap = flying ? Math.abs(Math.sin(b.t * b.T.flap)) : 0.15 + 0.85 * Math.abs(Math.sin(b.t * b.T.flap * 0.25)) * Math.min(1, str);
      if (b.type === 'moth') {
        c.fillStyle = col(176, 150, 112, 0.95);
        for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(s * 0.15, 0); c.lineTo(-s * 0.25, sg * s * (0.35 + 0.55 * flap)); c.lineTo(-s * 0.6, sg * s * (0.2 + 0.4 * flap)); c.closePath(); c.fill(); }
        c.fillStyle = col(120, 96, 70, 0.9); for (const sg of [-1, 1]) { c.beginPath(); c.arc(-s * 0.2, sg * s * (0.25 + 0.3 * flap), s * 0.07, 0, TAU); c.fill(); }
        c.fillStyle = col(150, 124, 92); c.beginPath(); c.ellipse(-s * 0.1, 0, s * 0.38, s * 0.13, 0, 0, TAU); c.fill();
        c.strokeStyle = col(110, 90, 70); c.lineWidth = unit * 0.8; c.beginPath(); c.moveTo(s * 0.25, 0); c.lineTo(s * 0.5, -s * 0.18); c.moveTo(s * 0.25, 0); c.lineTo(s * 0.5, s * 0.18); c.stroke();
      } else {
        const wc = b.type === 'beetle' ? 'rgba(210,200,190,0.35)' : 'rgba(225,235,245,0.45)';
        c.fillStyle = wc;
        for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(-s * 0.15, sg * s * (0.15 + 0.3 * flap), s * 0.45, s * 0.16, sg * (0.5 - flap * 0.4), 0, TAU); c.fill(); }
        if (b.type === 'beetle') {
          c.fillStyle = col(60, 72, 40); c.beginPath(); c.ellipse(-s * 0.05, 0, s * 0.5, s * 0.32, 0, 0, TAU); c.fill();
          c.strokeStyle = col(160, 190, 120, 0.6); c.lineWidth = unit; c.beginPath(); c.moveTo(-s * 0.4, -s * 0.12); c.lineTo(s * 0.2, -s * 0.12); c.stroke();
          c.fillStyle = col(30, 30, 24); c.beginPath(); c.arc(s * 0.48, 0, s * 0.14, 0, TAU); c.fill();
        } else {
          c.fillStyle = col(34, 36, 38); c.beginPath(); c.ellipse(-s * 0.12, 0, s * 0.36, s * 0.16, 0, 0, TAU); c.fill();
          c.fillStyle = col(50, 60, 58); c.beginPath(); c.arc(s * 0.18, 0, s * 0.15, 0, TAU); c.fill();
          if (b.type === 'fly') { c.fillStyle = col(150, 40, 30); c.beginPath(); c.arc(s * 0.3, -s * 0.08, s * 0.07, 0, TAU); c.arc(s * 0.3, s * 0.08, s * 0.07, 0, TAU); c.fill(); }
        }
      }
    }
    if (b.bands && b.bands.length) { // bands of combed silk laid over the prey
      c.save(); c.beginPath(); c.ellipse(0, 0, s * 0.64, s * 0.42, 0, 0, TAU); c.clip();
      c.fillStyle = col(242, 240, 232, 0.5);
      for (const bd of b.bands) { c.save(); c.rotate(Math.PI / 2 + bd.a); c.fillRect(-s * 0.8, -bd.w * s / 2, s * 1.6, bd.w * s); c.restore(); }
      c.restore();
    }
    if (b.wrap > 0 && (!b.bands || b.wrap >= 0.55)) { // the silk parcel
      const wa = b.bands ? (b.wrap - 0.55) / 0.45 : 1;
      c.globalAlpha = clamp(b.alpha, 0, 1) * Math.min(1, b.wrap * 1.2) * wa;
      c.fillStyle = col(236, 232, 222, 0.92); c.beginPath(); c.ellipse(0, 0, s * 0.62, s * 0.38, 0, 0, TAU); c.fill();
      c.strokeStyle = col(255, 255, 250, 0.7); c.lineWidth = unit * 0.7; c.beginPath();
      for (let i = 0; i < 6; i++) { const x = -s * 0.5 + i * s * 0.2; c.moveTo(x, -s * 0.34); c.quadraticCurveTo(x + s * 0.12, 0, x - s * 0.05, s * 0.34); } c.stroke();
    }
    c.restore();
  }
  // the swathe of silk the hind leg combs from the spinnerets
  if (S.wrapping && S.wrapping.comb) {
    const b = S.wrapping, L = S.legs.find(l => l.i === 3 && l.s === b.comb.side); if (L) {
      const u = b.comb.u, dx = L.fx - S.x, dy = L.fy - S.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
      c.strokeStyle = rgb(mix(P.silk, [255, 255, 255], 0.6), clamp(0.35 + P.silkA * 0.5, 0, 0.9)); c.lineWidth = unit * 0.5; c.beginPath();
      for (let i = -2; i <= 2; i++) {
        const o = i * 0.9 * unit;
        c.moveTo(S.x, S.y); c.lineTo(L.fx + nx * o * 2, L.fy + ny * o * 2);
        if (u > 0.4 && u < 0.62) { c.lineTo(b.x + nx * o * 3 + (b.x - L.fx) * 0.1, b.y + ny * o * 3 + (b.y - L.fy) * 0.1); }
      }
      c.stroke();
    }
  }
}

function* lifeCycle() {
  for (;;) {
    yield* enter();
    yield* buildOrb();
    yield* tendWeb();
    yield* takeDown();
    yield* transition();
  }
}
let fade = 1;
function* transition() {
  say('', '');
  let t = 0; while (t < 1.2) { t += DT; fade = Math.min(1, t / 1.2); yield; }
  newScene(); fade = 1;
}

// ============================================================ scene
let spiderCanvas2, landCanvas, landBlur, fenceCanvas, cloudCanvas, landTint, fenceTint, cloudTint, grass = [], stars = [], motes = [], flies = [], birds = [], spiderCanvas;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function newScene() {
  nodes = []; edges = []; radii = []; auxBySector = new Map(); hub = null; floatL = null; geom = {};
  S.carry = null; S.mode = 'walk'; S.face = null; S.perch = null; S.eating = 0; S.holding = null; S.wrapping = null; S.spiral = 0; S.bend = 0; S.bendT = 0; S.lineHold = null; bugs = []; damage = []; webUp = false;
  const span = rand(700, 860), cx = W / 2 + rand(-60, 60);
  sc = {
    xL: Math.round(cx - span / 2), xR: Math.round(cx + span / 2), yT: Math.round(rand(205, 245)), yB: Math.round(rand(855, 885)),
    postW: 52, railH: 44, barnX: rand(360, 640), barnS: rand(0.85, 1.05), millX: rand(1450, 1700), vpX: rand(820, 1100),
    seed: Math.random() * 1000,
  };
  buildSubstrate();
  const side = Math.random() < 0.5 ? 'L' : 'R';
  S.ref = subRefAt(side, sc.yB - 6); syncPos(); S.ang = -Math.PI / 2;
  S.legs.forEach(L => { L.ref = null; L.step = null; L.air = true; L.fx = S.x; L.fy = S.y; });
  paintLandscape(); paintFence(); makeGrass();
  lastTintT = -1;
}

// ------------------------------------------------------------ palette by hour
const K = [
  { h: 0, top: [6, 9, 24], mid: [12, 17, 42], hor: [28, 34, 66], tint: [0.2, 0.24, 0.42], silk: [175, 195, 245], silkA: 0.32, dark: 1, dew: 0.3, rim: 0 },
  { h: 4.6, top: [10, 14, 34], mid: [24, 28, 58], hor: [56, 52, 90], tint: [0.24, 0.26, 0.44], silk: [180, 195, 240], silkA: 0.34, dark: 0.95, dew: 0.7, rim: 0 },
  { h: 5.6, top: [34, 44, 86], mid: [96, 88, 128], hor: [214, 138, 122], tint: [0.5, 0.45, 0.56], silk: [235, 212, 222], silkA: 0.55, dark: 0.45, dew: 1, rim: 0.2 },
  { h: 6.5, top: [64, 100, 158], mid: [160, 158, 178], hor: [255, 186, 124], tint: [0.95, 0.8, 0.66], silk: [255, 236, 212], silkA: 0.78, dark: 0.05, dew: 1, rim: 0.7 },
  { h: 8.2, top: [80, 132, 205], mid: [152, 192, 232], hor: [236, 222, 204], tint: [1, 0.95, 0.88], silk: [246, 246, 240], silkA: 0.62, dark: 0, dew: 0.35, rim: 0.3 },
  { h: 12, top: [52, 112, 210], mid: [118, 170, 232], hor: [198, 224, 246], tint: [1, 1, 1], silk: [250, 250, 255], silkA: 0.48, dark: 0, dew: 0, rim: 0 },
  { h: 16, top: [62, 118, 202], mid: [140, 180, 226], hor: [236, 226, 202], tint: [1, 0.96, 0.88], silk: [252, 246, 232], silkA: 0.56, dark: 0, dew: 0, rim: 0.25 },
  { h: 17.8, top: [78, 112, 180], mid: [206, 178, 168], hor: [255, 196, 118], tint: [1, 0.84, 0.62], silk: [255, 232, 182], silkA: 0.88, dark: 0, dew: 0, rim: 1 },
  { h: 18.9, top: [48, 62, 120], mid: [186, 108, 108], hor: [255, 128, 66], tint: [0.86, 0.58, 0.47], silk: [255, 196, 150], silkA: 0.84, dark: 0.1, dew: 0, rim: 1 },
  { h: 19.7, top: [22, 28, 64], mid: [72, 50, 92], hor: [164, 82, 92], tint: [0.45, 0.38, 0.52], silk: [222, 184, 206], silkA: 0.5, dark: 0.55, dew: 0.05, rim: 0.3 },
  { h: 20.8, top: [8, 11, 30], mid: [16, 20, 46], hor: [34, 36, 72], tint: [0.22, 0.25, 0.43], silk: [178, 198, 245], silkA: 0.33, dark: 1, dew: 0.15, rim: 0 },
  { h: 24, top: [6, 9, 24], mid: [12, 17, 42], hor: [28, 34, 66], tint: [0.2, 0.24, 0.42], silk: [175, 195, 245], silkA: 0.32, dark: 1, dew: 0.3, rim: 0 },
];
function paletteAt(h) {
  let i = 0; while (i < K.length - 2 && K[i + 1].h <= h) i++;
  const a = K[i], b = K[i + 1], t = smooth(clamp((h - a.h) / (b.h - a.h), 0, 1));
  const o = {};
  for (const k in a) { if (k === 'h') continue; o[k] = Array.isArray(a[k]) ? a[k].map((v, j) => lerp(v, b[k][j], t)) : lerp(a[k], b[k], t); }
  // sun
  const u = (h - 5.9) / (19.45 - 5.9);
  o.sunUp = u > -0.02 && u < 1.02;
  o.sun = { x: lerp(-380, 1330, u), y: HZ - Math.sin(Math.PI * clamp(u, 0, 1)) * 980 + 10 };
  o.sunLow = o.sunUp ? clamp(1 - (HZ - o.sun.y) / 520, 0, 1) : 0;
  const mu = ((h - 19.6 + 24) % 24) / 10.6;
  o.moonUp = mu > 0 && mu < 1;
  o.moon = { x: lerp(260, 1700, mu), y: HZ - Math.sin(Math.PI * clamp(mu, 0, 1)) * 520 };
  return o;
}
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

// ------------------------------------------------------------ landscape painting (daylight, tinted at runtime)
function paintLandscape() {
  landCanvas = mk(W, H); const g = landCanvas.getContext('2d');
  const s0 = sc.seed;
  // far hills
  const hill = (base, amp, fr, off, col) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, base - amp * (0.5 + 0.5 * noise1(x * fr + off)) - amp * 0.35 * (0.5 + 0.5 * noise1(x * fr * 3.1 + off + 9)));
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  hill(HZ - 18, 70, 0.0026, s0, '#93a9bf');
  hill(HZ - 6, 45, 0.004, s0 + 40, '#8aa08f');
  hill(HZ + 2, 22, 0.007, s0 + 80, '#7d9670');
  // tree line with gaps
  for (let x = -20; x < W + 20; x += rand(6, 16)) {
    const dens = noise1(x * 0.006 + s0 + 3); if (dens < -0.15) continue;
    if (Math.abs(x - sc.barnX) < 120 * sc.barnS) continue;
    const r = rand(7, 18) * (0.8 + dens * 0.5), y = HZ - 4 + rand(-3, 3);
    g.fillStyle = Math.random() < 0.5 ? '#3d5733' : '#46643a'; g.beginPath(); g.arc(x, y - r * 0.6, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(120,150,90,0.35)'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.9, r * 0.55, 0, TAU); g.fill();
  }
  // a few big trees near the barn
  for (let i = 0; i < 3; i++) { const x = sc.barnX + (i - 1) * 190 * sc.barnS + rand(-30, 30) + (i === 1 ? 260 : 0), y = HZ + 6; drawTree(g, x, y, rand(0.8, 1.3)); }
  drawWindmill(g, sc.millX, HZ + 8, 0.9);
  // field
  const fg = g.createLinearGradient(0, HZ, 0, H); fg.addColorStop(0, '#d6b768'); fg.addColorStop(0.5, '#c39a4a'); fg.addColorStop(1, '#9c7a34');
  g.fillStyle = fg; g.fillRect(0, HZ, W, H - HZ);
  g.save(); g.beginPath(); g.rect(0, HZ, W, H - HZ); g.clip();
  g.strokeStyle = 'rgba(120,86,36,0.28)';
  for (let i = -70; i <= 70; i++) { g.lineWidth = 1 + Math.abs(i) * 0.02; g.beginPath(); g.moveTo(sc.vpX + i * 2.2, HZ + 1); g.lineTo(sc.vpX + i * 70, H + 40); g.stroke(); }
  for (let k = 0; k < 14000; k++) {
    const yy = HZ + (H - HZ) * Math.pow(Math.random(), 1.7), depth = (yy - HZ) / (H - HZ), x = Math.random() * W, sz = 1 + depth * 5;
    const c = Math.random(); g.strokeStyle = c < 0.4 ? 'rgba(236,206,120,0.55)' : c < 0.75 ? 'rgba(170,124,52,0.45)' : 'rgba(110,84,40,0.35)';
    g.lineWidth = 0.6 + depth * 1.4; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + rand(-1, 1) * sz * 0.3, yy - sz * 2.4); g.stroke();
  }
  g.restore();
  drawBarn(g, sc.barnX, HZ + 16, sc.barnS);
  // hay bales
  for (let i = 0; i < 7; i++) { const y = HZ + 20 + Math.pow(Math.random(), 1.5) * 110, s = 0.3 + (y - HZ) / 120; drawBale(g, rand(80, W - 80), y, s); }
  // Queen Anne's lace / chicory dots in the near meadow
  // near meadow
  const mg = g.createLinearGradient(0, 880, 0, H); mg.addColorStop(0, 'rgba(110,128,58,0)'); mg.addColorStop(0.25, 'rgba(104,122,54,0.9)'); mg.addColorStop(1, '#3f4f24');
  g.fillStyle = mg; g.fillRect(0, 860, W, H - 860);
  for (let k = 0; k < 2600; k++) {
    const x = Math.random() * W, y = 900 + Math.random() * 190, h = 6 + (y - 900) * 0.18;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(70,92,38,0.7)' : 'rgba(150,160,80,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + rand(-3, 3), y - h * 0.6, x + rand(-6, 6), y - h); g.stroke();
  }
  for (let k = 0; k < 90; k++) {
    const x = Math.random() * W, y = 905 + Math.random() * 90; const white = Math.random() < 0.7;
    g.fillStyle = white ? 'rgba(245,242,230,0.85)' : 'rgba(120,150,230,0.85)';
    for (let q = 0; q < (white ? 7 : 3); q++) { g.beginPath(); g.arc(x + rand(-3, 3), y + rand(-1.5, 1.5), white ? 1.4 : 1.6, 0, TAU); g.fill(); }
  }
  // depth of field: soften the distance
  landBlur = mk(W, H); const bg = landBlur.getContext('2d');
  if ('filter' in bg) bg.filter = 'blur(1.6px)';
  bg.drawImage(landCanvas, 0, 0); bg.filter = 'none';
  landTint = mk(W, H);
}
function drawTree(g, x, y, s) {
  g.fillStyle = '#3a2c22'; g.fillRect(x - 3 * s, y - 40 * s, 6 * s, 40 * s);
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), r = rand(0, 26) * s, cx = x + Math.cos(a) * r, cy = y - 58 * s + Math.sin(a) * r * 0.75, rr = rand(12, 22) * s;
    g.fillStyle = Math.random() < 0.5 ? '#3b5631' : '#47663a'; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fill();
  }
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(140,170,100,0.3)'; g.beginPath(); g.arc(x - 10 * s + rand(-10, 10) * s, y - 72 * s + rand(-8, 8) * s, rand(6, 12) * s, 0, TAU); g.fill(); }
}
function drawBarn(g, x, y, s) {
  const w = 150 * s, h = 72 * s, rh = 58 * s;
  // silo
  const sx = x + w / 2 + 26 * s, sw = 36 * s, sh = 138 * s;
  const sg = g.createLinearGradient(sx - sw / 2, 0, sx + sw / 2, 0); sg.addColorStop(0, '#a49c90'); sg.addColorStop(0.4, '#cfc8bb'); sg.addColorStop(1, '#8c857a');
  g.fillStyle = sg; g.fillRect(sx - sw / 2, y - sh, sw, sh);
  g.strokeStyle = 'rgba(80,70,60,0.35)'; g.lineWidth = 1; for (let i = 1; i < 9; i++) { g.beginPath(); g.moveTo(sx - sw / 2, y - sh * i / 9); g.lineTo(sx + sw / 2, y - sh * i / 9); g.stroke(); }
  g.fillStyle = '#7f868e'; g.beginPath(); g.ellipse(sx, y - sh, sw / 2, sw * 0.42, 0, Math.PI, TAU); g.fill();
  // barn body
  g.fillStyle = '#a3302a'; g.beginPath();
  g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - h); g.lineTo(x - w * 0.36, y - h - rh * 0.62); g.lineTo(x, y - h - rh); g.lineTo(x + w * 0.36, y - h - rh * 0.62); g.lineTo(x + w / 2, y - h); g.lineTo(x + w / 2, y); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(60,12,10,0.35)'; g.lineWidth = 1;
  for (let i = 1; i < 22; i++) { const xx = x - w / 2 + w * i / 22; g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y - h - rh * (1 - Math.abs(xx - x) / (w / 2)) * 0.95); g.stroke(); }
  // roof edge + trim
  g.strokeStyle = '#efe9dc'; g.lineWidth = 2.6 * s; g.beginPath();
  g.moveTo(x - w / 2 - 4 * s, y - h + 2); g.lineTo(x - w * 0.36, y - h - rh * 0.62); g.lineTo(x, y - h - rh - 2); g.lineTo(x + w * 0.36, y - h - rh * 0.62); g.lineTo(x + w / 2 + 4 * s, y - h + 2); g.stroke();
  // doors
  const dw = w * 0.38, dh = h * 0.72;
  g.fillStyle = '#8d2621'; g.fillRect(x - dw / 2, y - dh, dw, dh);
  g.strokeStyle = '#efe9dc'; g.lineWidth = 2 * s; g.strokeRect(x - dw / 2, y - dh, dw, dh);
  g.beginPath(); g.moveTo(x, y - dh); g.lineTo(x, y);
  g.moveTo(x - dw / 2, y - dh); g.lineTo(x, y); g.moveTo(x, y - dh); g.lineTo(x - dw / 2, y);
  g.moveTo(x, y - dh); g.lineTo(x + dw / 2, y); g.moveTo(x + dw / 2, y - dh); g.lineTo(x, y); g.stroke();
  // hayloft
  const lw = w * 0.2, lh = h * 0.42, ly = y - h - rh * 0.25;
  g.fillStyle = '#8d2621'; g.fillRect(x - lw / 2, ly - lh / 2, lw, lh); g.strokeRect(x - lw / 2, ly - lh / 2, lw, lh);
  g.beginPath(); g.moveTo(x - lw / 2, ly - lh / 2); g.lineTo(x + lw / 2, ly + lh / 2); g.moveTo(x + lw / 2, ly - lh / 2); g.lineTo(x - lw / 2, ly + lh / 2); g.stroke();
  // windows for night glow
  sc.barnWin = [{ x: x - w * 0.36, y: y - h * 0.55, w: 12 * s, h: 14 * s }, { x: x + w * 0.36, y: y - h * 0.55, w: 12 * s, h: 14 * s }];
  g.fillStyle = '#3a1512'; for (const wi of sc.barnWin) { g.fillRect(wi.x - wi.w / 2, wi.y - wi.h / 2, wi.w, wi.h); g.strokeRect(wi.x - wi.w / 2, wi.y - wi.h / 2, wi.w, wi.h); }
  sc.lamp = { x: x - w / 2 - 14 * s, y: y - h - 6 * s };
  g.strokeStyle = '#3b3530'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(sc.lamp.x, y); g.lineTo(sc.lamp.x, sc.lamp.y); g.stroke();
}
function drawWindmill(g, x, y, s) {
  g.strokeStyle = 'rgba(70,72,78,0.9)'; g.lineWidth = 1.4 * s;
  const top = y - 120 * s;
  g.beginPath(); g.moveTo(x - 14 * s, y); g.lineTo(x - 2 * s, top); g.moveTo(x + 14 * s, y); g.lineTo(x + 2 * s, top);
  for (let i = 1; i < 7; i++) { const yy = lerp(y, top, i / 7), ww = lerp(14, 2, i / 7) * s; g.moveTo(x - ww, yy); g.lineTo(x + ww, yy - 16 * s / 7 * 0); }
  g.stroke();
  sc.mill = { x, y: top - 4 * s, r: 22 * s };
}
function drawBale(g, x, y, s) {
  const r = 14 * s, l = 22 * s;
  g.fillStyle = '#b8954a'; g.fillRect(x - l / 2, y - 2 * r, l, 2 * r);
  g.fillStyle = '#d2b064'; g.beginPath(); g.ellipse(x + l / 2, y - r, r * 0.45, r, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(120,90,40,0.6)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(x + l / 2, y - r, r * 0.25, r * 0.55, 0, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(60,45,20,0.25)'; g.beginPath(); g.ellipse(x + 3, y, l * 0.7, r * 0.25, 0, 0, TAU); g.fill();
}

function woodRect(g, x, y, w, h, vertical, seed) {
  const base = g.createLinearGradient(vertical ? x : 0, vertical ? 0 : y, vertical ? x + w : 0, vertical ? 0 : y + h);
  base.addColorStop(0, '#5f5446'); base.addColorStop(0.18, '#8c7e6a'); base.addColorStop(0.55, '#9a8b74'); base.addColorStop(0.85, '#7d705e'); base.addColorStop(1, '#4e4539');
  g.fillStyle = base; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const L = vertical ? h : w, T = vertical ? w : h;
  for (let i = 0; i < T * 1.4; i++) {
    const o = rand(0, T), dark = Math.random() < 0.6;
    g.strokeStyle = dark ? `rgba(50,42,34,${rand(0.08, 0.3)})` : `rgba(200,190,170,${rand(0.05, 0.18)})`; g.lineWidth = rand(0.5, 1.6);
    g.beginPath();
    for (let k = 0; k <= L; k += 12) { const wob = noise1(k * 0.01 + o * 0.7 + seed) * 2.2; const px = vertical ? x + o + wob : x + k, py = vertical ? y + k : y + o + wob; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  }
  // knots
  for (let i = 0; i < L / 260; i++) {
    const k = rand(30, L - 30), o = rand(T * 0.25, T * 0.75), kx = vertical ? x + o : x + k, ky = vertical ? y + k : y + o;
    for (let r = 7; r > 1; r -= 2) { g.strokeStyle = `rgba(55,40,30,${0.15 + (7 - r) * 0.06})`; g.lineWidth = 1; g.beginPath(); g.ellipse(kx, ky, vertical ? r * 0.7 : r * 1.6, vertical ? r * 1.6 : r * 0.7, 0, 0, TAU); g.stroke(); }
  }
  // cracks
  for (let i = 0; i < L / 300; i++) {
    const o = rand(4, T - 4), k0 = rand(0, L * 0.7), kl = rand(40, 160);
    g.strokeStyle = 'rgba(30,24,20,0.6)'; g.lineWidth = rand(0.8, 1.8); g.beginPath();
    for (let k = 0; k <= kl; k += 6) { const wob = noise1((k0 + k) * 0.05 + seed + o) * 1.5; const px = vertical ? x + o + wob : x + k0 + k, py = vertical ? y + k0 + k : y + o + wob; k ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  }
  // lichen
  for (let i = 0; i < L / 120; i++) {
    const k = rand(0, L), o = rand(0, T), cx = vertical ? x + o : x + k, cy = vertical ? y + k : y + o;
    for (let q = 0; q < 10; q++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(176,186,140,0.45)' : 'rgba(205,200,150,0.35)'; g.beginPath(); g.arc(cx + rand(-6, 6), cy + rand(-6, 6), rand(1, 3), 0, TAU); g.fill(); }
  }
  g.restore();
  g.strokeStyle = 'rgba(30,25,20,0.5)'; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
function paintFence() {
  fenceCanvas = mk(W, H); const g = fenceCanvas.getContext('2d');
  const pw = sc.postW, rh = sc.railH, span = sc.xR - sc.xL;
  const posts = [sc.xL - pw, sc.xR, sc.xL - pw - span - pw, sc.xR + pw + span];
  // shadows of rails on posts are cheap: draw posts first
  for (const px of posts) { if (px > W || px + pw < 0) continue; woodRect(g, px, sc.yT - rh - 70, pw, H - (sc.yT - rh - 70), true, px * 0.01); // post cap
    g.fillStyle = 'rgba(40,34,28,0.55)'; g.beginPath(); g.moveTo(px, sc.yT - rh - 70); g.lineTo(px + pw / 2, sc.yT - rh - 84); g.lineTo(px + pw, sc.yT - rh - 70); g.closePath(); g.fill(); }
  woodRect(g, 0, sc.yT - rh, W, rh, false, 3.3);
  woodRect(g, 0, sc.yB, W, rh, false, 7.7);
  // shadow under rails
  for (const yy of [sc.yT, sc.yB + rh]) { const sg = g.createLinearGradient(0, yy, 0, yy + 10); sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sg; for (const px of posts) g.fillRect(px, yy, pw, 10); }
  // nails
  for (const px of posts) for (const yy of [sc.yT - rh / 2, sc.yB + rh / 2]) for (const dy of [-9, 9]) {
    g.fillStyle = '#2c2621'; g.beginPath(); g.arc(px + pw / 2, yy + dy, 2.6, 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,90,50,0.6)'; g.beginPath(); g.arc(px + pw / 2 + 1, yy + dy + 2, 1.8, 0, TAU); g.fill();
  }
  fenceTint = mk(W, H);
}
function makeGrass() {
  grass = [];
  for (let i = 0; i < 260; i++) {
    const x = rand(-40, W + 40), base = rand(1020, 1110), near = Math.random();
    grass.push({ x, base, h: rand(60, 200) * (0.6 + near), w: rand(2.5, 7) * (0.7 + near), lean: rand(-0.35, 0.35), ph: rand(0, TAU), c: Math.random(), seed: Math.random() < 0.12 });
  }
  for (let i = 0; i < 40; i++) {   // tall stems near the posts, in focus
    const x = Math.random() < 0.5 ? sc.xL + rand(-80, 60) : sc.xR + rand(-60, 80);
    grass.push({ x, base: rand(1040, 1100), h: rand(160, 260), w: rand(1.6, 3), lean: rand(-0.2, 0.2), ph: rand(0, TAU), c: Math.random(), seed: Math.random() < 0.5 });
  }
  grass.sort((a, b) => a.base - b.base);
}
function makeSky() {
  stars = []; for (let i = 0; i < 380; i++) stars.push({ x: rand(0, W), y: Math.pow(Math.random(), 1.4) * (HZ - 30), b: Math.random(), p: rand(0, TAU) });
  cloudCanvas = mk(2600, 520); const g = cloudCanvas.getContext('2d');
  for (let c = 0; c < 9; c++) {
    const cx = rand(100, 2500), cy = rand(80, 400), sw = rand(140, 360), shH = rand(30, 70);
    for (let i = 0; i < 60; i++) {
      const x = cx + rand(-sw / 2, sw / 2), y = cy + rand(-shH, shH * 0.3) * (1 - Math.abs(x - cx) / sw), r = rand(18, 46) * (1 - Math.abs(x - cx) / sw * 0.8);
      const gr = g.createRadialGradient(x, y - r * 0.3, 1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(236,236,242,0.55)'); gr.addColorStop(1, 'rgba(200,205,220,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(150,160,185,0.18)'; g.beginPath(); g.ellipse(cx, cy + shH * 0.35, sw * 0.5, shH * 0.35, 0, 0, TAU); g.fill();
  }
  { const tmp = mk(2600, 520), tg = tmp.getContext('2d'); if ('filter' in tg) tg.filter = 'blur(7px)'; tg.drawImage(cloudCanvas, 0, 0); cloudCanvas = tmp; }
  cloudTint = mk(2600, 520);
  motes = []; for (let i = 0; i < 90; i++) motes.push({ x: rand(0, W), y: rand(150, 1000), z: rand(0.3, 1), p: rand(0, TAU) });
  flies = []; for (let i = 0; i < 46; i++) flies.push({ x: rand(0, W), y: rand(560, 1040), vx: 0, vy: 0, p: rand(0, TAU), per: rand(3, 7), z: rand(0.4, 1) });
}
let glowSprite, flyGlow;
function makeGlow() {
  glowSprite = mk(64, 64); const g = glowSprite.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  flyGlow = mk(64, 64); const f = flyGlow.getContext('2d');
  const fr = f.createRadialGradient(32, 32, 0, 32, 32, 32); fr.addColorStop(0, 'rgba(230,255,140,1)'); fr.addColorStop(0.25, 'rgba(190,240,90,0.45)'); fr.addColorStop(1, 'rgba(150,220,60,0)');
  f.fillStyle = fr; f.fillRect(0, 0, 64, 64);
}
function tintInto(dst, src, tint, alpha = 1) {
  const g = dst.getContext('2d');
  g.globalCompositeOperation = 'copy'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = rgb(tint.map(v => clamp(v, 0, 1) * 255)); g.fillRect(0, 0, dst.width, dst.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
}

// ============================================================ spider art (from the rig sheet)
const ASSETS = window.SPIDER_ASSETS; const IMG = {}; const META = ASSETS.meta;
for (const k in ASSETS.img) { const im = new Image(); im.src = ASSETS.img[k]; IMG[k] = im; }
const LEGDEF = [
  { hx: 283, hy: 30, rest: 0.52, len: 1.45, imgs: ['fem_a', 'tib_b', 'tar_b'] },
  { hx: 264, hy: 40, rest: 1.12, len: 1.30, imgs: ['fem_b', 'tib_a', 'tar_a'] },
  { hx: 246, hy: 40, rest: 1.95, len: 0.88, imgs: ['fem_c', 'tib_c', 'tar_d'] },
  { hx: 229, hy: 31, rest: 2.55, len: 1.18, imgs: ['fem_a', 'tib_a', 'tar_c'] },
];
for (let i = 0; i < 4; i++) for (const s of [-1, 1]) S.legs.push({ def: LEGDEF[i], s, i, group: (i + (s > 0 ? 1 : 0)) % 2, ref: null, step: null, air: true, fx: 0, fy: 0, cool: 0 });
const PERCH_ANG = [0.42, 1.0, 1.85, 2.6];
const PERCH_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
const ABD = () => 208 * SS;
const mouthPos = () => toWorld((350 - 2) * SS, 0);   // chelicerae, just behind the palps
function bodyOrigin() { // where the spinnerets would be with the abdomen straight
  const b = S.bend || 0; if (!b) return { x: S.x, y: S.y };
  const a = ABD(), px = S.x + Math.cos(S.ang + b) * a, py = S.y + Math.sin(S.ang + b) * a;
  return { x: px - Math.cos(S.ang) * a, y: py - Math.sin(S.ang) * a };
}
const toLocal = (x, y) => { const o = bodyOrigin(), c = Math.cos(S.ang), s = Math.sin(S.ang), dx = x - o.x, dy = y - o.y; return { x: c * dx + s * dy, y: -s * dx + c * dy }; };
const toWorld = (lx, ly) => { const o = bodyOrigin(), c = Math.cos(S.ang), s = Math.sin(S.ang); return { x: o.x + c * lx - s * ly, y: o.y + s * lx + c * ly }; };
function legGeom(L) {
  const d = L.def, len = d.len * BL;
  const hip = toWorld((d.hx - 2) * SS, L.s * d.hy * SS);
  const dangle = S.mode === 'dangle';
  const perch = S.mode === 'perch';
  const ra = L.s * (dangle ? d.rest * 0.55 + 0.25 : perch ? PERCH_ANG[L.i] : d.rest), rf = dangle ? 0.55 : perch ? 0.88 : 0.8;
  const ideal = toWorld((d.hx - 2) * SS + Math.cos(ra) * len * rf, L.s * d.hy * SS + Math.sin(ra) * len * rf);
  const ta = L.s * (d.rest * 0.8 + 0.35), tf = 0.5;
  const tuck = toWorld((d.hx - 2) * SS + Math.cos(ta) * len * tf, L.s * d.hy * SS + Math.sin(ta) * len * tf);
  return { len, hip, ideal, tuck };
}
function updateLegs(dt) {
  dt = Math.min(dt, 0.08);
  // gait clock: driven by distance travelled (plus turning), so the rhythm follows the body
  const mv = S.lx == null ? 0 : Math.min(BL, Math.hypot(S.x - S.lx, S.y - S.ly) + Math.abs(angDiff(S.la, S.ang)) * BL * 0.5);
  S.lx = S.x; S.ly = S.y; S.la = S.ang;
  S.travel = (S.travel || 0) + mv;
  S.vel = lerp(S.vel || 0, mv / Math.max(dt, 1e-4), 1 - Math.exp(-8 * dt));
  const stride = BL * 0.6, swingF = 0.45, gp = S.travel / stride;
  const walking = S.vel > 10 && S.mode !== 'dangle' && S.mode !== 'perch' && !S.wrapping;
  // a hind leg hooks the new thread: it runs from the last attachment, over the leg tip, to the spinnerets
  S.lineHold = null; let holdLeg = null; const cc = S.carry;
  if (cc && cc.mode === 'taut' && S.mode !== 'dangle' && !S.wrapping && cc.from.alive) {
    const dd = Math.hypot(cc.from.x - S.x, cc.from.y - S.y), fl = toLocal(cc.from.x, cc.from.y);
    if (dd > BL * 0.35 && fl.x < (229 - 2) * SS) holdLeg = S.legs.find(L => L.i === 3 && L.s === (fl.y >= 0 ? 1 : -1));
  }
  const stepping = [0, 0]; for (const L of S.legs) if (L.step) stepping[L.group]++;
  const fast = S.speedNow || 0;
  let planted = 0; for (const L of S.legs) if (L.ref && !L.step) planted++;
  for (const L of S.legs) {
    const { len, hip, ideal, tuck } = legGeom(L);
    if (S.wrapping && wrapLeg(L, len, hip, dt)) continue;
    if (L === holdLeg) {
      const dx = cc.from.x - S.x, dy = cc.from.y - S.y, dd = Math.hypot(dx, dy) || 1, ux = dx / dd, uy = dy / dd;
      const rr = Math.min(dd * 0.55, len * 0.75);
      let tx = S.x + ux * rr - uy * L.s * BL * 0.06, ty = S.y + uy * rr + ux * L.s * BL * 0.06;
      const hx = tx - hip.x, hy = ty - hip.y, hd = Math.hypot(hx, hy);
      if (hd > len * 0.95) { tx = hip.x + hx / hd * len * 0.95; ty = hip.y + hy / hd * len * 0.95; }
      const f = L.ref || L.step ? 1 - Math.exp(-18 * dt) : 1 - Math.exp(-30 * dt);
      L.fx = lerp(L.fx, tx, f); L.fy = lerp(L.fy, ty, f); L.ref = null; L.step = null; L.air = false; L.plant = null;
      S.lineHold = { x: L.fx, y: L.fy };
      continue;
    }
    if (L.step) {
      if (L.step.g0 != null && walking) L.step.u = Math.max(L.step.u, (gp - L.step.g0) / swingF);
      else L.step.u += dt / L.step.dur;
      const r = L.step.ref ? resolve(L.step.ref) : null; const tp = r ? ptOf(r) : tuck;
      const u = Math.min(1, L.step.u), sm = smooth(u);
      const ox = (tp.x - hip.x), oy = (tp.y - hip.y), ol = Math.hypot(ox, oy) || 1;
      const lift = Math.sin(Math.PI * u) * len * 0.1;
      L.fx = lerp(L.step.x0, tp.x, sm) + ox / ol * lift; L.fy = lerp(L.step.y0, tp.y, sm) + oy / ol * lift;
      if (u >= 1) { L.ref = r; L.air = !r; L.step = null; stepping[L.group]--; L.plant = toLocal(tp.x, tp.y); }
      continue;
    }
    let fp = null;
    if (L.ref) { const r = resolve(L.ref); if (r && walkable(r.e)) { L.ref = r; fp = ptOf(r); } else L.ref = null; }
    if (!fp) { const tg = S.mode === 'dangle' ? ideal : tuck; if (L.air || S.mode === 'dangle') fp = { x: lerp(L.fx, tg.x, 1 - Math.exp(-14 * dt)), y: lerp(L.fy, tg.y, 1 - Math.exp(-14 * dt)) }; else fp = { x: L.fx, y: L.fy }; }
    L.fx = fp.x; L.fy = fp.y;
    if (S.mode === 'dangle') { if (L.ref) { L.ref = null; L.air = true; } continue; }
    const off = Math.hypot(fp.x - ideal.x, fp.y - ideal.y), fromHip = Math.hypot(fp.x - hip.x, fp.y - hip.y);
    // settling at the hub: re-plant each foot, one at a time, on a radius on its own side
    if (S.mode === 'perch' && L.perchDone !== S.perchT && simTime - S.perchT > 0.5 + PERCH_ORDER[S.legs.indexOf(L)] * 0.13 && Math.abs(angDiff(S.ang, Math.PI / 2)) < 0.15) {
      L.perchDone = S.perchT;
      const sideOK = (r) => { if (!r) return false; const p = ptOf(r), lp = toLocal(p.x, p.y); return lp.y * L.s > BL * 0.12; };
      let nr = nearestThread(ideal.x, ideal.y, len * 0.35, hip.x, hip.y, len * 0.95, len * 0.45);
      if (!sideOK(nr)) nr = nearestThread(ideal.x, ideal.y, len * 0.7, hip.x, hip.y, len * 0.95, len * 0.45);
      if (sideOK(nr)) { if (L.ref) planted--; L.step = { x0: fp.x, y0: fp.y, ref: nr, u: 0, dur: 0.16 }; stepping[L.group]++; continue; }
    }
    L.cool -= dt;
    if (walking) {   // alternating tetrapod: L1 R2 L3 R4 swing together, then R1 L2 R3 L4
      const ph = gp + (L.group ? 0.5 : 0), cyc = Math.floor(ph), fr = ph - cyc;
      const lp0 = toLocal(fp.x, fp.y);
      const bad = fromHip > len * 1.0 || (L.ref && lp0.y * L.s < -BL * 0.1);
      if ((fr < swingF && L.cyc !== cyc) || bad || (L.air && L.cool <= 0)) {
        L.cyc = cyc;
        const hd = { x: Math.cos(S.ang), y: Math.sin(S.ang) };
        const tx = ideal.x + hd.x * stride * 0.5, ty = ideal.y + hd.y * stride * 0.5;
        const nr = nearestThread(tx, ty, len * 1.05, hip.x, hip.y, len * 0.95, len * 0.5, L);
        if (!nr && L.air) { L.cool = 0.08; continue; }
        if (L.ref) planted--;
        const gaitStep = fr < swingF && !bad && !L.air;
        L.step = { x0: fp.x, y0: fp.y, ref: nr, u: gaitStep ? fr / swingF : 0, dur: 0.1, g0: gaitStep ? gp - fr : null };
        stepping[L.group]++;
      }
      continue;   // stance: the foot stays planted while the body moves over it
    }
    const lp = toLocal(fp.x, fp.y), drift = L.plant ? Math.hypot(lp.x - L.plant.x, lp.y - L.plant.y) : off;
    if (S.mode === 'perch' && L.perchDone === S.perchT && L.ref) continue;
    const wrongSide = L.ref && lp.y * L.s < -BL * 0.1;
    const need = wrongSide || drift > len * 0.42 || fromHip > len * 0.97 || fromHip < len * 0.4 || (L.air && L.cool <= 0);
    if (need && (L.air || stepping[1 - L.group] === 0 || planted >= 5 || off > len * 0.85 || fromHip > len * 1.1)) {
      const lead = Math.min(1, fast / 120) * len * 0.25;
      const hd = { x: Math.cos(S.ang), y: Math.sin(S.ang) };
      const tx = ideal.x + hd.x * lead, ty = ideal.y + hd.y * lead;
      const nr = nearestThread(tx, ty, len * 1.05, hip.x, hip.y, len * 0.95, len * 0.5, L);
      if (!nr && L.air) { L.cool = 0.08; continue; }
      if (L.ref) planted--;
      L.step = { x0: fp.x, y0: fp.y, ref: nr, u: 0, dur: 0.1 };
      stepping[L.group]++;
    }
  }
}
function wrapLeg(L, len, hip, dt) {
  const b = S.wrapping, fw = { x: Math.cos(S.ang), y: Math.sin(S.ang) }, lat = { x: -fw.y * L.s, y: fw.x * L.s }, sz = b.T.size;
  let tx, ty;
  if (L.i <= 1) {               // front legs hold and roll the prey
    const ang = L.i === 0 ? 0.75 : 1.55, r = sz * (L.i === 0 ? 0.42 : 0.5) + Math.sin(simTime * 9 + L.i * 1.7 + (L.s > 0 ? 0 : 2)) * sz * 0.07;
    const dx = fw.x * Math.cos(ang) + lat.x * Math.sin(ang), dy = fw.y * Math.cos(ang) + lat.y * Math.sin(ang);
    tx = b.x + dx * r; ty = b.y + dy * r;
  } else if (L.i === 3 && b.comb && b.comb.side === L.s) {   // the combing hind leg
    const u = b.comb.u, spx = S.x + lat.x * BL * 0.06, spy = S.y + lat.y * BL * 0.06;
    const gx = b.x + lat.x * sz * 0.45 - fw.x * sz * 0.15, gy = b.y + lat.y * sz * 0.45 - fw.y * sz * 0.15;
    let k, bow;
    if (u < 0.42) { k = smooth(u / 0.42); bow = Math.sin(Math.PI * k) * BL * 0.18; }
    else if (u < 0.58) { k = 1; bow = 0; }
    else { k = 1 - smooth((u - 0.58) / 0.42); bow = Math.sin(Math.PI * k) * BL * 0.32; }
    tx = lerp(spx, gx, k) + lat.x * bow; ty = lerp(spy, gy, k) + lat.y * bow;
    L.combing = true;
  } else { L.combing = false; return false; }
  const f = 1 - Math.exp(-30 * dt);
  L.fx = lerp(L.fx, tx, f); L.fy = lerp(L.fy, ty, f); L.ref = null; L.step = null; L.air = false; L.plant = null;
  return true;
}
function drawSeg(c, key, x0, y0, x1, y1, flipPref) {
  const m = META[key], im = IMG[key]; if (!im.complete) return;
  const ang = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const side = (-uy * flipPref.x + ux * flipPref.y) >= 0 ? 1 : -1;
  const flip = side * (m.curve || 1);
  c.save(); c.translate(x0, y0); c.rotate(ang);
  c.scale(L * 1.1 / (m.fx - m.px), SS * 1.12 * flip);
  c.drawImage(im, -m.px - 2, -m.py);
  c.restore();
}
function drawSpider(c) {
  const fw = { x: Math.cos(S.ang), y: Math.sin(S.ang) };
  for (let pass = 3; pass >= 0; pass--) for (const L of S.legs) {
    if (L.i !== pass) continue;
    const { len, hip } = legGeom(L);
    let tx = L.fx, ty = L.fy, dx = tx - hip.x, dy = ty - hip.y, d = Math.hypot(dx, dy) || 1;
    const maxD = len * 0.97, minD = len * 0.32;
    if (d > maxD) { tx = hip.x + dx / d * maxD; ty = hip.y + dy / d * maxD; d = maxD; }
    if (d < minD) { tx = hip.x + dx / d * minD; ty = hip.y + dy / d * minD; d = minD; }
    const b1 = len * 0.36, b2 = len * 0.6;
    const base = Math.atan2(ty - hip.y, tx - hip.x), al = Math.acos(clamp((b1 * b1 + d * d - b2 * b2) / (2 * b1 * d), -1, 1));
    const k1 = { x: hip.x + Math.cos(base + al) * b1, y: hip.y + Math.sin(base + al) * b1 }, k2 = { x: hip.x + Math.cos(base - al) * b1, y: hip.y + Math.sin(base - al) * b1 };
    const lat = { x: -fw.y * L.s, y: fw.x * L.s };
    const p1 = (k1.x - hip.x) * lat.x + (k1.y - hip.y) * lat.y, p2 = (k2.x - hip.x) * lat.x + (k2.y - hip.y) * lat.y;
    const knee = p1 > p2 ? k1 : k2, ks = p1 > p2 ? 1 : -1;
    const ta = Math.atan2(ty - knee.y, tx - knee.x) + ks * 0.2;
    const j2 = { x: knee.x + Math.cos(ta) * len * 0.3, y: knee.y + Math.sin(ta) * len * 0.3 };
    const inward = { x: -lat.x, y: -lat.y };
    drawSeg(c, L.def.imgs[0], hip.x, hip.y, knee.x, knee.y, inward);
    drawSeg(c, L.def.imgs[1], knee.x, knee.y, j2.x, j2.y, inward);
    drawSeg(c, L.def.imgs[2], j2.x, j2.y, tx, ty, inward);
  }
  if (IMG.body_abd.complete && IMG.body_ceph.complete) {
    const a = ABD(), b = S.bend || 0, h = META.body_abd.h * SS;
    const pdx = S.x + Math.cos(S.ang + b) * a, pdy = S.y + Math.sin(S.ang + b) * a;   // pedicel
    const bob = S.eating ? Math.sin(simTime * 40) * 0.6 : 0;
    c.save(); c.translate(pdx, pdy); c.rotate(S.ang + b);
    c.drawImage(IMG.body_abd, -210 * SS + bob, -h / 2, META.body_abd.w * SS, h); c.restore();
    c.save(); c.translate(pdx, pdy); c.rotate(S.ang);
    c.drawImage(IMG.body_ceph, (204 - 210) * SS, -h / 2, META.body_ceph.w * SS, h); c.restore();
  }
}

// ============================================================ rendering
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let lowCv = mk(10, 10), lowCtx = lowCv.getContext('2d');
let view = { k: 1, ox: 0, oy: 0, dpr: 1, cw: 0, ch: 0 };
let vignette = null;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  view.dpr = dpr; vignette = null;
}
addEventListener('resize', resize);

let hour = qs.get('hour') != null ? +qs.get('hour') : 17.2;
let realT = 0, lastTintT = -1, P = null;

function drawWeb(c, unit) {
  const pal = P, hot = pal.sunUp ? pal.sun : (pal.moonUp ? pal.moon : null);
  const lightAng = hot ? Math.atan2((hub ? hub.y : 600) - hot.y, (hub ? hub.x : 960) - hot.x) : -Math.PI / 2;
  const base = pal.silk, A = pal.silkA, glow = hot ? (pal.sunUp ? 1 : 0.5) : 0.2;
  const nb = 5, paths = []; for (let i = 0; i < nb * 2; i++) paths.push(new Path2D());
  const capture = [], MO = mouthPos();
  for (const e of edges) {
    if (!e.alive || e.type === 'sub') continue;
    let ax = e.a.x, ay = e.a.y, bx = e.b.x, by = e.b.y;
    if (e.eat >= 0) { const k = smooth(e.eat); ax = lerp(ax, MO.x, k); ay = lerp(ay, MO.y, k); bx = lerp(bx, MO.x, k); by = lerp(by, MO.y, k); }   // gathered into the jaws
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy); if (d < 0.05) continue;
    const ea = Math.atan2(dy, dx);
    let gl = Math.abs(Math.sin(ea - lightAng)); gl = gl * gl * gl;
    if (hot) { const mx = (ax + bx) / 2 - hot.x, my = (ay + by) / 2 - hot.y; gl *= 0.45 + 0.55 * Math.exp(-(mx * mx + my * my) / (2 * 520 * 520)); }
    gl = clamp(gl * glow + 0.08 * Math.sin(simTime * 0.7 + e.h * 20) + 0.04, 0, 0.999);
    const thin = e.type === 'capture' || e.type === 'aux' || e.type === 'hub' || e.type === 'carry' || e.type === 'stub' || e.type === 'glue';
    const p = paths[(thin ? nb : 0) + Math.floor(gl * nb)];
    p.moveTo(ax, ay);
    if (e.rest > d * 1.003 && e.eat < 0) { // slack: sag
      const sag = Math.min(80, Math.sqrt(3 * d * (e.rest - d) / 8)); let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
      const f = 0.3 + 0.7 * ny; p.quadraticCurveTo((ax + bx) / 2 + nx * sag * 2 * f, (ay + by) / 2 + ny * sag * 2 * f, bx, by);
    } else p.lineTo(bx, by);
    if (e.type === 'capture' && e.eat < 0) capture.push(e);
  }
  const hl = [255, 252, 240];
  for (let i = 0; i < nb * 2; i++) {
    const g = ((i % nb) + 0.5) / nb, thin = i >= nb;
    c.strokeStyle = rgb(mix(base, hl, g), clamp(A * (0.42 + 0.9 * g) * (thin ? 0.8 : 1) * (CFG.pixel ? 0.8 : 1), 0, 1));
    c.lineWidth = unit * (thin ? 0.75 : 1.1) * (CFG.pixel ? 0.55 : 1);
    c.stroke(paths[i]);
  }
  // glue droplets on the capture spiral (they bead up a few seconds after laying)
  if (!CFG.pixel) {
    const dew = pal.dew;
    const spacing = dew > 0.3 ? 4.2 : 3.2;
    const bands = [new Path2D(), new Path2D(), new Path2D()];
    for (const e of capture) {
      const age = clamp((simTime - e.born) / 3, 0, 1); if (age < 0.2) continue;
      const ax = e.a.x, ay = e.a.y, dx = e.b.x - ax, dy = e.b.y - ay, d = Math.hypot(dx, dy);
      if (!e.drops || Math.abs(e.dropsLen - d) > spacing * 1.5) {
        const n = Math.floor(d / spacing); e.drops = []; e.dropsLen = d;
        for (let i = 1; i < n; i++) { const h = hash1(e.id * 131 + i); e.drops.push((i + (h - 0.5) * 0.6) / n, 0.32 + h * 0.3, Math.floor(h * 3)); }
      }
      const D = e.drops;
      for (let i = 0; i < D.length; i += 3) { const t = D[i], r = (D[i + 1] + dew * 0.8) * age * unit; bands[D[i + 2]].rect(ax + dx * t - r, ay + dy * t - r, r * 2, r * 2); }
    }
    for (let b = 0; b < 3; b++) { c.fillStyle = rgb(mix(base, hl, 0.3 + b * 0.3), clamp(A * (0.5 + b * 0.25), 0, 1)); c.fill(bands[b]); }
    // sparkle near the light
    if (hot) {
      c.globalCompositeOperation = 'lighter';
      for (const e of capture) {
        const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2, h = e.h;
        const tw = Math.sin(simTime * 1.3 + h * 50 + realT * 1.1); if (tw < 0.985 || h > 0.35) continue;
        const near = Math.exp(-((mx - hot.x) ** 2 + (my - hot.y) ** 2) / (2 * 600 * 600));
        const a = (tw - 0.985) * 40 * near * A * glow; if (a < 0.02) continue;
        c.globalAlpha = clamp(a, 0, 0.8); const s = (3 + dew * 3) * unit;
        c.drawImage(glowSprite, mx - s, my - s, s * 2, s * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    // dew on structural threads at dawn
    if (dew > 0.15) {
      c.fillStyle = rgb(hl, A * dew);
      for (const e of edges) {
        if (!e.alive || e.type === 'sub' || e.type === 'carry' || e.type === 'capture') continue;
        const ax = e.a.x, ay = e.a.y, dx = e.b.x - ax, dy = e.b.y - ay, d = Math.hypot(dx, dy), n = Math.floor(d / 9);
        for (let i = 0; i < n; i++) { const h = hash1(e.id * 97 + i); if (h > dew * 0.8) continue; const t = (i + h) / n, r = (0.6 + h * 1.4) * unit; c.fillRect(ax + dx * t - r, ay + dy * t - r, r * 2, r * 2); }
      }
    }
  }
  if (S.carry && S.lineHold) {
    c.beginPath(); c.moveTo(S.lineHold.x, S.lineHold.y); c.lineTo(S.x, S.y);
    c.strokeStyle = rgb(mix(base, hl, 0.5), clamp(A * 0.9, 0, 1)); c.lineWidth = unit * 0.75 * (CFG.pixel ? 0.55 : 1); c.stroke();
  }
  // remnants of the eaten scaffold
  c.fillStyle = rgb(base, A * 0.8);
  for (const n of nodes) if (n.alive && n.remnant) c.fillRect(n.x - unit * 0.9, n.y - unit * 0.9, unit * 1.8, unit * 1.8);
  // the floating bridge line
  if (floatL && floatL.pts.length > 1) {
    c.beginPath(); c.moveTo(floatL.pts[0].x, floatL.pts[0].y);
    for (let i = 1; i < floatL.pts.length; i++) c.lineTo(floatL.pts[i].x, floatL.pts[i].y);
    c.strokeStyle = rgb(mix(base, hl, 0.7), clamp(A * 1.1, 0, 1)); c.lineWidth = unit * 0.9; c.stroke();
  }
}

function render() {
  const cw = cv.width, ch = cv.height;
  const pix = CFG.pixel, PX = CFG.PX * view.dpr;
  let tc = ctx, tw = cw, th = ch;
  if (pix) { tw = Math.ceil(cw / PX); th = Math.ceil(ch / PX); if (lowCv.width !== tw || lowCv.height !== th) { lowCv.width = tw; lowCv.height = th; } tc = lowCtx; }
  const k = Math.max(tw / W, th / H), ox = (tw - W * k) / 2, oy = (th - H * k) / 2;
  view.k = k; view.ox = ox; view.oy = oy;
  const unit = 1 / k * (pix ? 1 : view.dpr);  // ~1 screen px in world units
  tc.imageSmoothingEnabled = true;
  tc.setTransform(k, 0, 0, k, ox, oy);
  P = paletteAt(hour);
  // tints at ~10 Hz
  if (realT - lastTintT > 0.1 || lastTintT < 0) {
    lastTintT = realT;
    tintInto(landTint, landBlur, P.tint);
    tintInto(fenceTint, fenceCanvas, P.tint.map(v => Math.min(1, v * 1.04)));
    tintInto(cloudTint, cloudCanvas, mix(P.tint, P.hor.map(v => v / 255), 0.45).map(v => Math.min(1, v * 1.08) * (1 - 0.62 * P.dark)));
  }
  // sky
  const sg = tc.createLinearGradient(0, 0, 0, HZ); sg.addColorStop(0, rgb(P.top)); sg.addColorStop(0.55, rgb(P.mid)); sg.addColorStop(1, rgb(P.hor));
  tc.fillStyle = sg; tc.fillRect(-10, -10, W + 20, HZ + 20);
  // stars
  if (P.dark > 0.05) {
    tc.fillStyle = '#fff';
    for (const s of stars) { const a = P.dark * (0.3 + 0.7 * s.b) * (0.6 + 0.4 * Math.sin(realT * (1 + s.b * 3) + s.p)); if (a < 0.05) continue; tc.globalAlpha = a; const r = (0.5 + s.b) * unit; tc.fillRect(s.x - r / 2, s.y - r / 2, r, r); }
    tc.globalAlpha = 1;
  }
  // moon
  if (P.moonUp && P.dark > 0.1) {
    const m = P.moon; tc.globalCompositeOperation = 'lighter'; tc.globalAlpha = 0.35 * P.dark; tc.drawImage(glowSprite, m.x - 120, m.y - 120, 240, 240); tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
    tc.fillStyle = `rgba(240,238,225,${0.95 * P.dark})`; tc.beginPath(); tc.arc(m.x, m.y, 18, 0, TAU); tc.fill();
    const sk = m.y / HZ < 0.55 ? mix(P.top, P.mid, m.y / HZ / 0.55) : mix(P.mid, P.hor, (m.y / HZ - 0.55) / 0.45); tc.fillStyle = rgb(sk, 0.94 * P.dark); tc.beginPath(); tc.arc(m.x + 8, m.y - 4, 16, 0, TAU); tc.fill();
  }
  // sun
  if (P.sunUp) {
    const s = P.sun, warm = P.sunLow;
    const col = mix([255, 250, 230], [255, 150, 70], warm * warm);
    tc.globalCompositeOperation = 'lighter';
    const gr = tc.createRadialGradient(s.x, s.y, 0, s.x, s.y, 520); gr.addColorStop(0, rgb(col, 0.55)); gr.addColorStop(0.15, rgb(col, 0.25)); gr.addColorStop(1, rgb(col, 0));
    tc.fillStyle = gr; tc.fillRect(s.x - 520, s.y - 520, 1040, 1040);
    tc.globalCompositeOperation = 'source-over';
    tc.fillStyle = rgb(mix(col, [255, 255, 255], 0.5)); tc.beginPath(); tc.arc(s.x, s.y, 26, 0, TAU); tc.fill();
  }
  // clouds
  const cx0 = -((realT * 5 + sc.seed * 10) % 2600);
  tc.globalAlpha = 0.85 - 0.35 * P.dark; tc.drawImage(cloudTint, cx0, 0); tc.drawImage(cloudTint, cx0 + 2600, 0); tc.globalAlpha = 1;
  // landscape
  tc.drawImage(landTint, 0, 0, W, H);
  // horizon haze
  const hg = tc.createLinearGradient(0, HZ - 120, 0, HZ + 160); hg.addColorStop(0, rgb(P.hor, 0)); hg.addColorStop(0.45, rgb(P.hor, 0.38)); hg.addColorStop(1, rgb(P.hor, 0));
  tc.fillStyle = hg; tc.fillRect(0, HZ - 120, W, 280);
  // dawn mist
  if (P.dew > 0.2) {
    tc.globalAlpha = (P.dew - 0.2) * 0.5;
    for (let i = 0; i < 6; i++) { const y = HZ + 15 + i * 24, x = ((realT * (6 + i * 2) + i * 400) % (W + 1200)) - 600; tc.fillStyle = rgb(mix(P.hor, [255, 255, 255], 0.4), 0.5); tc.beginPath(); tc.ellipse(x, y, 520, 20, 0, 0, TAU); tc.fill(); tc.beginPath(); tc.ellipse(x + 900, y + 8, 420, 16, 0, 0, TAU); tc.fill(); }
    tc.globalAlpha = 1;
  }
  // barn lights at night
  if (P.dark > 0.25 && sc.barnWin) {
    const a = clamp((P.dark - 0.25) * 1.5, 0, 1);
    tc.fillStyle = `rgba(255,196,110,${a})`; for (const w of sc.barnWin) tc.fillRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h);
    tc.globalCompositeOperation = 'lighter'; tc.globalAlpha = a * 0.7;
    tc.drawImage(glowSprite, sc.lamp.x - 40, sc.lamp.y - 40, 80, 80); tc.globalAlpha = a * 0.25; tc.drawImage(glowSprite, sc.lamp.x - 140, sc.lamp.y - 100, 280, 200);
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
  }
  // windmill wheel
  if (sc.mill) {
    const m = sc.mill, rot = realT * (0.4 + Math.abs(wind.x) * 0.02);
    tc.strokeStyle = rgb(mix([70, 72, 78], [20, 22, 30], P.dark), 0.9); tc.lineWidth = 1.2;
    tc.beginPath(); for (let i = 0; i < 14; i++) { const a = rot + i * TAU / 14; tc.moveTo(m.x, m.y); tc.lineTo(m.x + Math.cos(a) * m.r, m.y + Math.sin(a) * m.r); } tc.stroke();
    tc.beginPath(); tc.moveTo(m.x, m.y); tc.lineTo(m.x + 30, m.y + 2); tc.stroke();
  }
  // birds
  drawBirds(tc);
  // god rays
  if (P.sunUp && P.sunLow > 0.05 && !pix) {
    const s = P.sun; tc.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * 0.5 + (i - 7) * 0.11 + Math.sin(realT * 0.05 + i) * 0.03, wdt = 0.025 + 0.02 * Math.sin(i * 7.3);
      const L = 2200, gr = tc.createRadialGradient(s.x, s.y, 0, s.x, s.y, L);
      const al = 0.05 * P.sunLow * (0.5 + 0.5 * Math.sin(i * 3.1 + realT * 0.1));
      gr.addColorStop(0, `rgba(255,220,160,${al})`); gr.addColorStop(1, 'rgba(255,220,160,0)');
      tc.fillStyle = gr; tc.beginPath(); tc.moveTo(s.x, s.y); tc.lineTo(s.x + Math.cos(a - wdt) * L, s.y + Math.sin(a - wdt) * L); tc.lineTo(s.x + Math.cos(a + wdt) * L, s.y + Math.sin(a + wdt) * L); tc.closePath(); tc.fill();
    }
    tc.globalCompositeOperation = 'source-over';
  }
  // fence
  tc.drawImage(fenceTint, 0, 0, W, H);
  if (P.rim > 0.05 && P.sunUp) { // rim light on post edges facing the sun
    tc.globalCompositeOperation = 'lighter';
    const col = `rgba(255,200,130,${0.35 * P.rim})`; tc.fillStyle = col;
    for (const px of [sc.xL - sc.postW, sc.xR]) { const edge = P.sun.x > px + sc.postW / 2 ? px + sc.postW - 3 : px; tc.fillRect(edge, sc.yT - sc.railH - 70, 3, H); }
    tc.fillRect(0, sc.yT - sc.railH, W, 2.5); tc.fillRect(0, sc.yB, W, 2.5);
    tc.globalCompositeOperation = 'source-over';
  }
  // web + spider
  drawWeb(tc, unit);
  drawBugs(tc, unit);
  drawSpiderLit(tc, k, ox, oy, pix);
  // foreground grass
  drawGrass(tc, unit);
  // motes / fireflies
  drawParticles(tc, unit, pix);
  tc.setTransform(1, 0, 0, 1, 0, 0);
  if (pix) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(lowCv, 0, 0, tw * PX, th * PX); }
  // vignette (screen space)
  if (!vignette || vignette.width !== cw) {
    vignette = mk(cw, ch); const g = vignette.getContext('2d');
    const gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
  }
  ctx.drawImage(vignette, 0, 0);
  if (fade < 1 || fadeIn < 1) { ctx.fillStyle = `rgba(0,0,0,${Math.max(fadeIn < 1 ? 1 - fadeIn : 0, fade < 1 ? fade : 0)})`; ctx.fillRect(0, 0, cw, ch); }
}
let fadeIn = 0;
function drawSpiderLit(tc, k, ox, oy, pix) {
  const size = BL * 4.6, px = Math.ceil(size * k);
  if (!spiderCanvas || spiderCanvas.width !== px) { spiderCanvas = mk(px, px); spiderCanvas2 = mk(px, px); }
  const g = spiderCanvas.getContext('2d');
  const BO_ = bodyOrigin(), cxW = BO_.x + Math.cos(S.ang) * BL * 0.5, cyW = BO_.y + Math.sin(S.ang) * BL * 0.5;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px);
  g.imageSmoothingEnabled = true;
  g.setTransform(k, 0, 0, k, px / 2 - cxW * k, px / 2 - cyW * k);
  drawSpider(g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  tintInto(spiderCanvas2, spiderCanvas, P.tint.map(v => Math.min(1, v * 1.08 + 0.05)));
  const outC = spiderCanvas2;
  tc.save(); tc.setTransform(1, 0, 0, 1, 0, 0);
  // soft shadow-ish contact darkness when backlit
  tc.drawImage(outC, Math.round(cxW * k + ox - px / 2), Math.round(cyW * k + oy - px / 2));
  tc.restore();
  // rim light on the spider at golden hour
  if (P.rim > 0.2 && P.sunUp && !pix) {
    tc.globalCompositeOperation = 'lighter'; tc.globalAlpha = 0.18 * P.rim;
    tc.drawImage(glowSprite, cxW - BL * 0.9, cyW - BL * 0.9, BL * 1.8, BL * 1.8);
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
  }
}
function drawGrass(tc, unit) {
  const t = realT, tint = P.tint;
  const dark = [32, 52, 20].map((v, i) => v * tint[i]), mid = [78, 104, 40].map((v, i) => v * tint[i]), tipC = [168, 170, 86].map((v, i) => v * tint[i]);
  const gust = noise1(t * 0.3) * 0.12 + Math.sin(t * 0.9) * 0.03;
  const tones = [0, 1, 2, 3].map(i => rgb(mix(mix(dark, mid, 0.75), tipC, i * 0.17)));
  for (const b of grass) {
    const sway = b.lean + gust * (b.h / 150) + Math.sin(t * 1.3 + b.ph) * 0.05;
    const tx = b.x + Math.sin(sway) * b.h, ty = b.base - Math.cos(sway) * b.h;
    const cxp = b.x + Math.sin(sway * 0.5) * b.h * 0.5, cyp = b.base - b.h * 0.55;
tc.fillStyle = tones[Math.min(3, (b.c * 4) | 0)]; tc.beginPath(); tc.moveTo(b.x - b.w / 2, b.base); tc.quadraticCurveTo(cxp - b.w * 0.3, cyp, tx, ty); tc.quadraticCurveTo(cxp + b.w * 0.3, cyp, b.x + b.w / 2, b.base); tc.closePath(); tc.fill();
    if (b.seed) { tc.fillStyle = rgb(mix(tipC, [200, 170, 110], 0.5)); tc.beginPath(); tc.ellipse(tx, ty, b.w * 0.9 + 1.5, b.w * 3 + 6, sway, 0, TAU); tc.fill(); }
    if (P.rim > 0.2 && P.sunUp) { tc.strokeStyle = `rgba(255,210,140,${0.3 * P.rim})`; tc.lineWidth = unit; tc.beginPath(); tc.moveTo(cxp, cyp); tc.quadraticCurveTo((cxp + tx) / 2 + b.w * 0.3, (cyp + ty) / 2, tx, ty); tc.stroke(); }
  }
}
function drawParticles(tc, unit, pix) {
  // pollen / dust in sunbeams
  if (P.sunUp && P.sunLow > 0.1) {
    tc.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      m.x += (wind.x * 0.4 * m.z + Math.sin(realT * 0.5 + m.p) * 6) * frameDT; m.y += (Math.cos(realT * 0.4 + m.p) * 5 - 2) * frameDT;
      if (m.x > W + 20) m.x = -20; if (m.x < -20) m.x = W + 20; if (m.y < 100) m.y = 1000; if (m.y > 1040) m.y = 120;
      const near = Math.exp(-((m.x - P.sun.x) ** 2) / (2 * 700 * 700));
      tc.globalAlpha = clamp(0.5 * P.sunLow * near * m.z * (0.6 + 0.4 * Math.sin(realT * 2 + m.p)), 0, 1);
      const s = (pix ? 2 : 3 + m.z * 4) * unit; tc.drawImage(glowSprite, m.x - s, m.y - s, s * 2, s * 2);
    }
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
  }
  // fireflies
  if (P.dark > 0.3) {
    tc.globalCompositeOperation = 'lighter';
    for (const f of flies) {
      f.vx += (noise1(realT * 0.4 + f.p * 10) * 30 - f.vx) * frameDT; f.vy += (noise1(realT * 0.4 + f.p * 10 + 50) * 18 - f.vy) * frameDT;
      f.x += f.vx * frameDT; f.y += f.vy * frameDT; if (f.x < -20) f.x = W + 20; if (f.x > W + 20) f.x = -20; f.y = clamp(f.y, 560, 1060);
      const ph = ((realT + f.p * f.per) % f.per) / f.per; const on = ph < 0.12 ? Math.sin(ph / 0.12 * Math.PI) : 0;
      if (on <= 0.01) continue;
      const a = on * clamp((P.dark - 0.3) * 1.6, 0, 1) * f.z;
      tc.globalAlpha = a * 0.7; const s = (pix ? 10 : 18) * f.z; tc.drawImage(flyGlow, f.x - s, f.y - s, s * 2, s * 2);
      tc.globalAlpha = a; tc.fillStyle = 'rgb(220,255,120)'; tc.fillRect(f.x - 1.2, f.y - 1.2, 2.4, 2.4);
    }
    tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
  }
}
function drawBirds(tc) {
  if (P.dark > 0.7) return;
  if (Math.random() < frameDT * 0.02 && birds.length < 8) {
    const n = randi(3, 7), dir = Math.random() < 0.5 ? 1 : -1, y = rand(120, 420), x0 = dir > 0 ? -60 : W + 60;
    for (let i = 0; i < n; i++) birds.push({ x: x0 - dir * i * 26, y: y + Math.abs(i - n / 2) * 12, v: dir * rand(55, 70), p: rand(0, TAU), s: rand(0.7, 1) });
  }
  tc.strokeStyle = rgb(mix([40, 40, 50], [10, 10, 20], P.dark), 0.8); tc.lineWidth = 1.4;
  tc.beginPath();
  for (const b of birds) {
    b.x += b.v * frameDT; const f = Math.sin(realT * 9 + b.p) * 4 * b.s;
    tc.moveTo(b.x - 7 * b.s, b.y - f); tc.quadraticCurveTo(b.x - 3 * b.s, b.y - 2, b.x, b.y); tc.quadraticCurveTo(b.x + 3 * b.s, b.y - 2, b.x + 7 * b.s, b.y - f);
  }
  tc.stroke();
  birds = birds.filter(b => b.x > -200 && b.x < W + 200);
}

// ============================================================ loop & UI
let brain = null, paused = false, frameDT = 0.016;
const capEl = document.getElementById('cap'), helpEl = document.getElementById('help'), hudEl = document.getElementById('hud');
let lastCap = '';
function step(dtSim) {
  const n = Math.min(48, Math.max(1, Math.ceil(dtSim / (1 / 60))));
  const dt = dtSim / n;
  for (let i = 0; i < n; i++) {
    DT = dt; simTime += dt; updateWind(dt);
    try { const r = brain.next(); if (r.done) brain = lifeCycle(); }
    catch (err) { console.error(err); newScene(); brain = lifeCycle(); }
    updateBugs(dt);
    spiderKinematics();
    physics(dt);
  }
  updateLegs(dtSim);
  if ((simTime | 0) % 3 === 0 && Math.random() < 0.05) compact();
}
let last = performance.now();
function frame(now) {
  const dtR = Math.min(0.05, (now - last) / 1000); last = now; frameDT = dtR; realT += dtR;
  if (!paused) {
    step(dtR * SPEEDS[CFG.speedIdx]);
    hour = (hour + dtR * 24 / (CFG.dayMinutes * 60)) % 24;
  }
  if (fadeIn < 1) fadeIn = Math.min(1, fadeIn + dtR * 0.6);
  render();
  const c = CFG.captions && caption.t ? caption.t + '|' + caption.s : '';
  if (c !== lastCap) { lastCap = c; capEl.innerHTML = c ? `<b>${caption.t}</b><span>${caption.s}</span>` : ''; }
  requestAnimationFrame(frame);
}
function hud(msg) { hudEl.textContent = msg; hudEl.style.opacity = 1; clearTimeout(hud.t); hud.t = setTimeout(() => hudEl.style.opacity = 0, 1400); }
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'p') { CFG.pixel = !CFG.pixel; saveCfg(); hud(CFG.pixel ? 'Pixel' : 'Clean'); }
  else if (k === ' ') { paused = !paused; hud(paused ? 'Paused' : 'Playing'); e.preventDefault(); }
  else if (k === ']' || k === '+' || k === '=') { CFG.speedIdx = Math.min(SPEEDS.length - 1, CFG.speedIdx + 1); hud('Speed ×' + SPEEDS[CFG.speedIdx]); }
  else if (k === '[' || k === '-') { CFG.speedIdx = Math.max(0, CFG.speedIdx - 1); hud('Speed ×' + SPEEDS[CFG.speedIdx]); }
  else if (k === 't') { hour = (hour + 1) % 24; lastTintT = -1; hud('Time ' + String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor(hour % 1 * 60)).padStart(2, '0')); }
  else if (k === 'i') { CFG.captions = !CFG.captions; saveCfg(); hud(CFG.captions ? 'Captions on' : 'Captions off'); }
  else if (k === 's') { CFG.bigSpider = !CFG.bigSpider; saveCfg(); applyScale(); hud(CFG.bigSpider ? 'Enlarged spider & prey' : 'True-to-life scale'); }
  else if (k === 'b') { if (webUp) { spawnBug(); hud('Here comes a bug'); } else hud('Bugs come once the web is finished'); }
  else if (k === 'n') { newScene(); brain = lifeCycle(); hud('New web'); }
  else if (k === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); }
  else if (k === 'h' || k === '?') { helpEl.classList.toggle('show'); }
});
addEventListener('dblclick', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); });
let idleT; addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2500); });
setTimeout(() => helpEl.classList.remove('show'), 7000);

// boot
resize(); applyScale(); makeSky(); makeGlow(); newScene(); brain = lifeCycle();
window.__ow = { get eating() { return edges.some(e => e.alive && e.eat > 0.35 && e.eat < 0.7); }, get lineHold() { return S.lineHold; }, get bend() { return S.bend; }, legDbg: () => S.legs.filter(L => L.i === 2).map(L => { const g = legGeom(L); const nr = nearestThread(g.ideal.x, g.ideal.y, g.len * 1.05, g.hip.x, g.hip.y, g.len * 0.95, g.len * 0.38); const nr0 = nearestThread(g.hip.x, g.hip.y, g.len * 2, g.hip.x, g.hip.y, 999, 0); return { air: L.air, step: !!L.step, len: g.len | 0, hip: [g.hip.x | 0, g.hip.y | 0], ideal: [g.ideal.x | 0, g.ideal.y | 0], found: !!nr, nearestAny: nr0 ? [nr0.e.type, ptOf(nr0).x | 0, ptOf(nr0).y | 0] : null, S: [S.x | 0, S.y | 0, S.ang.toFixed(2)], mode: S.mode, ref: S.ref ? resolve(S.ref).e.type : null }; }), spawnBug: t => spawnBug(t), get bugs() { return bugs; }, get damage() { return damage; }, S, view, reset: () => { newScene(); brain = lifeCycle(); }, wind, get edges() { return edges; }, get nodes() { return nodes; }, get radii() { return radii; }, get caption() { return caption; }, get hour() { return hour; }, set hour(v) { hour = v; lastTintT = -1; }, CFG, stats, get simTime() { return simTime; }, step, render, geom: () => geom };
requestAnimationFrame(frame);
})();
