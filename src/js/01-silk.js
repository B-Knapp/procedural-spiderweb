// The silk: a graph of nodes and edges with rope physics (edges pull, never push).
// Edges split when something attaches mid-thread; old references follow the split via resolve().
// ============================================================ sim state
let simTime = 0, DT = 1 / 60;
let nodes = [], edges = [], radii = [], auxBySector = new Map();
let hub = null, floatL = null, sc = null, geom = {};
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
  if (e.type === 'sub') n.sub = true;
  if (a.rest && b.rest) n.rest = { x: lerp(a.rest.x, b.rest.x, t), y: lerp(a.rest.y, b.rest.y, t) };
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
const STIFFT = { rim: 1, band: 1, bridge: 1, frame: 1, anchor: 1, sub: 1, glue: 1, stub: 0.6, radius: 0.7, loose: 0.9, carry: 0.9, hub: 0.5, aux: 0.5, capture: 0.35 };
const wind = { x: 0, y: 0, t: rand(0, 1000) };
function updateWind(dt) {
  wind.t += dt;
  wind.x = 40 * (noise1(wind.t * 0.045) + 0.45 * noise1(wind.t * 0.21 + 77));
  wind.y = 10 * noise1(wind.t * 0.33 + 13);
}
function physics(dt) {
  if (geom.stylized) return stylizedPhysics(dt);
  const wx = wind.x * 2.2, wy = wind.y, dt2 = dt * dt;
  for (const n of nodes) {
    if (n.fixed || !n.alive) { n.fx = n.fy = 0; continue; }
    const vx = (n.x - n.px) * DAMP, vy = (n.y - n.py) * DAMP; n.px = n.x; n.py = n.y;
    const g = n.heavy ? 900 : n.light ? 0 : GRAV, wf = n.heavy ? 0.25 : n.light ? 0.15 : 1;
    n.x += vx + (n.fx + wx * wf) * dt2; n.y += vy + (g + n.fy + wy * wf) * dt2; n.fx = n.fy = 0;
    if (sc && !n.noClamp) { n.x = clamp(n.x, sc.xL + 1, sc.xR - 1); n.y = clamp(n.y, sc.yT + 1, sc.yB - 1); }
  }
  for (let it = 0; it < ITER; it++) for (let i = 0; i < edges.length; i++) {
    const e = edges[i]; if (!e.alive) continue;
    const a = e.a, b = e.b, w = a.im + b.im; if (w === 0) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
    if ((d <= e.rest && !e.rod) || d < 1e-6) continue;   // threads only pull; letter ribbons (rods) also push
    const k = (d - e.rest) / (d * w) * e.k;
    a.x += dx * k * a.im; a.y += dy * k * a.im; b.x -= dx * k * b.im; b.y -= dy * k * b.im;
  }
  updateFastened();
}
// Writes-words mode only: the web keeps the shape it had when the spider started writing, and
// sways gently around it, so carving letters can't make it collapse. Natural mode never uses this.
function stylizedPhysics(dt) {
  const t = simTime, sp = S.mode === 'walk' || S.mode === 'perch' ? { x: S.x, y: S.y } : null;
  for (const n of nodes) {
    if (!n.alive || n.sub || n.tip) { n.fx = n.fy = 0; continue; }
    if (n.isBug && n.bug) {   // a stuck insect stays on its threads, twitching while it struggles
      const g = n.edges.filter(e => e.alive && e.type === 'glue'); n.fx = n.fy = 0;
      if (!g.length || n.fixed) continue;
      let x = 0, y = 0; for (const e of g) { const o = e.other(n); x += o.x; y += o.y; }
      const str = n.bug.T.strength * (1 - n.bug.para), j = Math.sin(t * 23 + n.id) * 1.2 * str;
      n.x = n.px = x / g.length + j; n.y = n.py = y / g.length + Math.cos(t * 19 + n.id) * 1.2 * str; continue;
    }
    if (n.fixed && !n.follow) { n.fx = n.fy = 0; continue; }
    if (!n.rest) n.rest = { x: n.x, y: n.y };
    const r = n.rest;
    // sway: none where the web meets the fence, most in the middle
    const edge = sc ? clamp(Math.min(r.x - sc.xL, sc.xR - r.x, r.y - sc.yT, sc.yB - r.y) / 160, 0, 1) : 1;
    const amp = edge * (1.6 + Math.abs(wind.x) * 0.06);
    let x = r.x + amp * noise1(t * 0.45 + r.x * 0.004 + r.y * 0.002) + wind.x * 0.05 * edge;
    let y = r.y + amp * 0.7 * noise1(t * 0.4 + r.y * 0.004 + 40);
    if (sp) { const d = Math.hypot(r.x - sp.x, r.y - sp.y); if (d < 40) y += 2.2 * (1 - d / 40) * edge; }   // gives a little under the spider
    n.x = n.px = x; n.y = n.py = y; n.fx = n.fy = 0;
  }
}
function compact() { edges = edges.filter(e => e.alive); nodes = nodes.filter(n => n.alive); }

// ------------------------------------------------------------ substrate (the fence opening)
function buildSubstrate() {
  const c1 = new Node(sc.xL, sc.yT, true), c2 = new Node(sc.xR, sc.yT, true), c3 = new Node(sc.xR, sc.yB, true), c4 = new Node(sc.xL, sc.yB, true);
  for (const c of [c1, c2, c3, c4]) c.sub = true;
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
