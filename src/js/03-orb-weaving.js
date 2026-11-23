// Behaviour: natural orb-web construction (Araneus), stage by stage.
// ============================================================ the brain: natural orb weaving
const stats = { webs: 0 };
let caption = { t: '', s: '' };
function say(t, s = '') { caption = { t, s }; }

function* buildOrb() {
  geom.words = CFG.writing;   // writes-words webs are built a little differently; natural webs are untouched
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
  if (geom.words) {   // writes-words: anchor low on the nearer post, so the web stays clear of the bottom rail
    geom.lowY = sc.yB - rand(55, 95);
    const sd = Hp.x < (sc.xL + sc.xR) / 2 ? 'L' : 'R'; yield* walkTo({ ref: subRefAt(sd, geom.lowY + rand(-15, 15)) }, WALK * 0.7);
  } else yield* walkTo({ ref: subRefAt('B', clamp(Hp.x + rand(-20, 20), sc.xL + 40, sc.xR - 40)) }, WALK * 0.7);
  say('Proto-hub', 'reeling in — the Y pulls tight; its centre becomes the hub');
  const target = dist(Hp, { x: S.x, y: S.y });
  S.carry.mode = 'hold';
  if (geom.words) {   // reel in until tight (an anchor off to the side can't pull the hub all the way to Hp)
    for (let tt = 0; S.carry.edge.rest > target && tt < 12; tt += DT) {
      const e = S.carry.edge; if (e.rest > dist(e.a, e.b) + 30) break;
      e.rest = Math.max(target, e.rest - 40 * DT); yield;
    }
  } else while (S.carry.edge.rest > target) { S.carry.edge.rest = Math.max(target, S.carry.edge.rest - 40 * DT); yield; }
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
      break;   // caught too low to make a usable bridge
    }
    if (F.pts.some(p => p.y > sc.yB - 6) || F.total > span * 2.6 || t > 70) break;   // hit the grass, too long, or no luck
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
    if (job.side && !geom.words) {
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
    } else if (job.side) {
      const side = job.side;
      // a line from the hub down to a low anchor on this post; the second one is then
      // joined to the first by a bottom frame line strung post to post above the rail
      const ay = (geom.lowY || sc.yB - 75) + rand(-25, 10);
      say('Frame threads', 'carrying a new line from the hub down to an anchor on the post');
      yield* walkTo({ node: hub });
      startCarry('taut');
      yield* walkTo({ ref: subRefAt(side < 0 ? 'L' : 'R', ay) });
      const rr = layLine('radius', 0.006, {}, false); registerRadius(rr.line.nodes);
      const low = rr.node;
      if (geom.lowAnchor && geom.lowAnchor.alive) {
        say('Frame threads', 'running the bottom frame line across to the other post');
        startCarry('taut');
        yield* walkTo({ node: geom.lowAnchor });
        layLine('frame', 0.004, {}, false);
      } else geom.lowAnchor = low;
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
  const s = Rm / (geom.words ? rand(50, 56) : rand(24, 29)); geom.s = s;   // writing mode: a finer spiral, so carved letters can be slimmer
  const Z = geom.rh + Rm * rand(0.1, 0.13); geom.Z = Z;
  const ang0 = Rs.map(radAngle), lens = Rs.map(radiusLen);
  const sl = [...lens].sort((a, b) => a - b);
  // writes-words: the spiral reaches out toward the frame, to leave room for big letters
  const Rb = geom.words ? sl[Math.floor(sl.length * 0.75)] * rand(0.92, 1.0) : sl[Math.floor(sl.length * 0.22)] * rand(0.92, 1.0);
  const squash = geom.words ? rand(0.12, 0.22) : rand(0.2, 0.34);
  geom.env = { Rb, squash };
  const O = Rs.map((R, i) => Math.min(geom.words ? lens[i] - Math.max(s * 1.5, lens[i] * 0.07) : lens[i] - s * 0.8, Rb * (1 + squash * Math.sin(ang0[i])) * (1 + 0.04 * Math.cos(ang0[i] * 2 + 1))));
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
    const ok = yield* reachTo(radiusPoint(Rs[k], q), REACH); if (!ok) break;
    const key = sectorKey(Rs[j], Rs[k]);
    layLine('capture', 0.0, { sector: key, rpos: (p + q) / 2 });
    f[k] = q; c[k]--; geom.capTotal = (geom.capTotal || 0) + 1;
    const arr = auxBySector.get(key);
    if (arr) { const eat = arr.filter(e => e.alive && e.eat < 0 && e.rpos > q - 0.7 * s); if (eat.length) yield* eatEdges(eat, 0.22); }
    yield* pause(0.1);
    j = k; p = q;
  }
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
