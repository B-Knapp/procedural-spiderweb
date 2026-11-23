// Behaviour: writes-words mode. After finishing an orb, the spider writes a band name into it as
// negative space: each thread crossing a letter is cut at the letter's edge and laid back round
// the outline, so the letters read as clear holes ringed by bunched silk. The word stays until
// the next web.

// famous bands, 1967-2010 (names with punctuation or digits are left out for now)
const BANDS = [
  'THE BEATLES', 'THE ROLLING STONES', 'THE DOORS', 'THE WHO', 'THE KINKS', 'THE BYRDS', 'PINK FLOYD', 'CREAM', 'THE BAND',
  'THE STOOGES', 'LED ZEPPELIN', 'BLACK SABBATH', 'JEFFERSON AIRPLANE', 'CREEDENCE CLEARWATER REVIVAL', 'THE VELVET UNDERGROUND',
  'STEPPENWOLF', 'DEEP PURPLE', 'FLEETWOOD MAC',
  'QUEEN', 'KISS', 'EAGLES', 'ABBA', 'RUSH', 'YES', 'GENESIS', 'BOSTON', 'JOURNEY', 'AEROSMITH', 'STEELY DAN', 'LYNYRD SKYNYRD',
  'THE RAMONES', 'THE CLASH', 'SEX PISTOLS', 'TALKING HEADS', 'THE POLICE', 'BLONDIE', 'DEVO', 'VAN HALEN', 'TOTO', 'CHICAGO',
  'HEART', 'THE CARS', 'JOY DIVISION', 'TELEVISION', 'THIN LIZZY', 'BEE GEES', 'THE JAM', 'BAD COMPANY',
  'THE CURE', 'THE SMITHS', 'DEPECHE MODE', 'DURAN DURAN', 'NEW ORDER', 'TEARS FOR FEARS', 'DEF LEPPARD', 'BON JOVI', 'METALLICA',
  'MOTLEY CRUE', 'PIXIES', 'SONIC YOUTH', 'THE REPLACEMENTS', 'HUSKER DU', 'INXS', 'THE PRETENDERS', 'EURYTHMICS', 'BEASTIE BOYS',
  'PUBLIC ENEMY', 'DEAD KENNEDYS', 'MINOR THREAT',
  'NIRVANA', 'PEARL JAM', 'SOUNDGARDEN', 'ALICE IN CHAINS', 'RADIOHEAD', 'OASIS', 'BLUR', 'PULP', 'WEEZER', 'GREEN DAY',
  'THE SMASHING PUMPKINS', 'NINE INCH NAILS', 'RAGE AGAINST THE MACHINE', 'FOO FIGHTERS', 'PAVEMENT', 'PORTISHEAD', 'MASSIVE ATTACK',
  'DAFT PUNK', 'TOOL', 'KORN', 'NO DOUBT', 'THE CRANBERRIES', 'HOLE', 'BUSH', 'SUBLIME', 'THE ROOTS',
  'THE STROKES', 'THE WHITE STRIPES', 'THE KILLERS', 'ARCTIC MONKEYS', 'COLDPLAY', 'MUSE', 'INTERPOL', 'ARCADE FIRE', 'YEAH YEAH YEAHS',
  'LINKIN PARK', 'QUEENS OF THE STONE AGE', 'MODEST MOUSE', 'THE SHINS', 'VAMPIRE WEEKEND', 'KINGS OF LEON', 'THE BLACK KEYS',
  'FRANZ FERDINAND', 'GORILLAZ', 'MGMT', 'PHOENIX', 'BLOC PARTY', 'THE NATIONAL', 'FLEET FOXES',
];
let lastBand = null;
const pickWord = () => { let w; do { w = BANDS[randi(0, BANDS.length - 1)]; } while (w === lastBand && BANDS.length > 1); lastBand = w; return w; };

// single-stroke capitals: polylines in a box of height 1 (y down); w = advance width
const GLYPHS = (() => {
  const O = [[0.3, 0.02], [0.08, 0.12], [0.02, 0.5], [0.08, 0.88], [0.3, 0.98], [0.52, 0.88], [0.58, 0.5], [0.52, 0.12], [0.3, 0.02]];
  const P = [[0, 1], [0, 0], [0.4, 0], [0.54, 0.12], [0.54, 0.4], [0.4, 0.52], [0, 0.52]];
  const C = [[0.58, 0.15], [0.45, 0.02], [0.18, 0.02], [0.03, 0.2], [0.03, 0.8], [0.18, 0.98], [0.45, 0.98], [0.58, 0.85]];
  return {
    A: { w: 0.6, s: [[[0, 1], [0.3, 0], [0.6, 1]], [[0.12, 0.62], [0.48, 0.62]]] },
    B: { w: 0.58, s: [[[0, 1], [0, 0], [0.4, 0], [0.52, 0.1], [0.52, 0.38], [0.4, 0.48], [0, 0.48]], [[0.4, 0.48], [0.56, 0.6], [0.56, 0.88], [0.42, 1], [0, 1]]] },
    C: { w: 0.6, s: [C] },
    D: { w: 0.58, s: [[[0, 0], [0, 1], [0.35, 1], [0.55, 0.8], [0.55, 0.2], [0.35, 0], [0, 0]]] },
    E: { w: 0.54, s: [[[0.52, 0], [0, 0], [0, 1], [0.52, 1]], [[0, 0.5], [0.4, 0.5]]] },
    F: { w: 0.52, s: [[[0.52, 0], [0, 0], [0, 1]], [[0, 0.5], [0.4, 0.5]]] },
    G: { w: 0.62, s: [[...C, [0.58, 0.55], [0.34, 0.55]]] },
    H: { w: 0.55, s: [[[0, 0], [0, 1]], [[0.55, 0], [0.55, 1]], [[0, 0.5], [0.55, 0.5]]] },
    I: { w: 0.3, s: [[[0, 0], [0.3, 0]], [[0.15, 0], [0.15, 1]], [[0, 1], [0.3, 1]]] },
    J: { w: 0.52, s: [[[0.5, 0], [0.5, 0.78], [0.42, 0.94], [0.26, 1], [0.1, 0.95], [0.02, 0.82]]] },
    K: { w: 0.58, s: [[[0, 0], [0, 1]], [[0.55, 0], [0.3, 0.3], [0, 0.58]], [[0.18, 0.42], [0.34, 0.62], [0.46, 0.88], [0.6, 1]]] },
    L: { w: 0.5, s: [[[0, 0], [0, 1], [0.5, 1]]] },
    M: { w: 0.66, s: [[[0, 1], [0, 0], [0.33, 0.6], [0.66, 0], [0.66, 1]]] },
    N: { w: 0.56, s: [[[0, 1], [0, 0], [0.56, 1], [0.56, 0]]] },
    O: { w: 0.6, s: [O] },
    P: { w: 0.56, s: [P] },
    Q: { w: 0.62, s: [O, [[0.36, 0.72], [0.62, 1.02]]] },
    R: { w: 0.6, s: [P, [[0.28, 0.52], [0.4, 0.6], [0.47, 0.8], [0.54, 0.95], [0.64, 1]]] },
    S: { w: 0.57, s: [[[0.55, 0.12], [0.42, 0.02], [0.14, 0.02], [0.03, 0.14], [0.03, 0.36], [0.15, 0.47], [0.42, 0.53], [0.55, 0.64], [0.55, 0.86], [0.42, 0.98], [0.13, 0.98], [0.02, 0.88]]] },
    T: { w: 0.56, s: [[[0, 0], [0.56, 0]], [[0.28, 0], [0.28, 1]]] },
    U: { w: 0.56, s: [[[0, 0], [0, 0.8], [0.15, 0.98], [0.41, 0.98], [0.56, 0.8], [0.56, 0]]] },
    V: { w: 0.6, s: [[[0, 0], [0.3, 1], [0.6, 0]]] },
    W: { w: 0.76, s: [[[0, 0], [0.18, 1], [0.38, 0.35], [0.58, 1], [0.76, 0]]] },
    X: { w: 0.56, s: [[[0, 0], [0.56, 1]], [[0.56, 0], [0, 1]]] },
    Y: { w: 0.6, s: [[[0, 0], [0.08, 0.28], [0.3, 0.52], [0.52, 0.28], [0.6, 0]], [[0.3, 0.52], [0.3, 1]]] },
    Z: { w: 0.56, s: [[[0, 0], [0.56, 0], [0, 1], [0.56, 1]]] },
    ' ': { w: 0.35, s: [] },
  };
})();
let TRACK = 0.2;   // letter spacing, in letter heights
const lineWidth = t => [...t].reduce((a, ch) => a + (GLYPHS[ch] ? GLYPHS[ch].w : 0.5) + TRACK, -TRACK);

// where the sticky spiral actually reaches at height y (so words sit inside the real web)
function spiralSpan(y0, y1) {
  let lo = -Infinity, hi = Infinity, any = false;
  for (let y = y0; y <= y1 + 0.1; y += Math.max(4, (y1 - y0) / 6)) {
    let mn = Infinity, mx = -Infinity;
    for (const e of edges) {
      if (!e.alive || e.type !== 'capture') continue;
      const my = (e.a.y + e.b.y) / 2; if (Math.abs(my - y) > 14) continue;
      const mx_ = (e.a.x + e.b.x) / 2; if (mx_ < mn) mn = mx_; if (mx_ > mx) mx = mx_;
    }
    if (mn === Infinity) return null;
    any = true; lo = Math.max(lo, mn); hi = Math.min(hi, mx);
  }
  return any && hi > lo ? { lo, hi } : null;
}
// turn the layout into world-space strokes, finely resampled
function wordStrokes(L) {
  const out = [];
  let letter = 0;
  for (const ln of L.lines) {
    let x = ln.x0;
    for (const ch of ln.text) {
      const g = GLYPHS[ch] || GLYPHS[' '];
      if (g.s.length) letter++;
      for (const poly of g.s) {
        const pts = poly.map(([gx, gy]) => ({ x: x + gx * L.h, y: ln.y + gy * L.h }));
        const free = [0, poly.length - 1].map(i => !g.s.some(q => q.some(([qx, qy], k) => !(q === poly && k === i) && Math.hypot(qx - poly[i][0], qy - poly[i][1]) < 0.03)));
        const startI = out.length;
        // split at sharp corners (N, M, V, W, Z...) so widths are worked out per straight run
        let run = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          run.push(pts[i]);
          if (i < pts.length - 1) {
            const a1 = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x), a2 = Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x);
            if (Math.abs(angDiff(a1, a2)) > 1.05) { out.push({ id: out.length, ch, letter, pts: resample(run, Math.max(2.4, L.h * 0.045)) }); run = [pts[i]]; }
          }
        }
        if (run.length > 1) out.push({ id: out.length, ch, letter, pts: resample(run, Math.max(2.4, L.h * 0.045)) });
        if (L.widths) {
          const ends = [0, poly.length - 1].filter((_, k) => free[k]).map(i => pts[i]);
          for (const st of out.slice(startI)) {
            const P = st.pts; st.rs = P.map((q, k) => {
              const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
              const vert = Math.abs(dy) / l, stress = dx * dy > 0 ? Math.max(vert, 0.9) : vert * 0.85;
              let r = L.thin + (L.R - L.thin) * stress;
              for (const E of ends) { const d = dist(q, E) / L.h; if (d < 0.16) r *= 1 + 0.32 * (1 - d / 0.16) ** 2; }
              return r;
            });
          }
        }
        // serifs: a short foot across every free, mostly-vertical stroke end at the top or bottom
        if (L.serif) for (const [i, j] of [[0, 1], [poly.length - 1, poly.length - 2]]) {
          const [gx, gy] = poly[i], [hx, hy] = poly[j];
          if (Math.abs(gy) > 0.05 && Math.abs(gy - 1) > 0.05) continue;
          if (Math.abs(hy - gy) < 1.8 * Math.abs(hx - gx)) continue;
          const joint = g.s.some(q => q.some(([qx, qy], k) => !(q === poly && k === i) && Math.hypot(qx - gx, qy - gy) < 0.03));
          if (joint) continue;
          const sw = 0.14, py = ln.y + gy * L.h;
          out.push({ id: out.length, ch, letter, rf: 0.5, pts: resample([{ x: x + (gx - sw) * L.h, y: py }, { x: x + (gx + sw) * L.h, y: py }], Math.max(2.4, L.h * 0.045)) });
        }
      }
      x += (g.w + TRACK) * L.h;
    }
  }
  return out;
}
function resample(pts, step) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = dist(a, b), n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) out.push({ x: lerp(a.x, b.x, k / n), y: lerp(a.y, b.y, k / n) });
  }
  return out;
}
const segDist = (p, a, b) => { const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey; const t = l2 ? clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / l2, 0, 1) : 0; return Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y); };
// fasten a letter node to the nearest few web nodes, so it follows the web as it sways
function fasten(n) {
  const cand = [];
  for (const m of nodes) {
    if (!m.alive || m === n || m.follow || m.edges.length === 0) continue;
    if (!(m.rid != null || m === hub || m.edges.some(e => e.type === 'radius' || e.type === 'frame' || e.type === 'bridge'))) continue;   // steady points only
    const d = dist(m, n); if (d > 160) continue;
    cand.push([d, m]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  n.follow = cand.slice(0, 6).map(([d, m]) => ({ m, dx: n.x - m.x, dy: n.y - m.y, w: 1 / (d + 20) }));
}
function updateFastened() {
  for (const n of nodes) {
    if (!n.follow || !n.alive) continue;
    let sx = 0, sy = 0, sw = 0;
    for (const f of n.follow) if (f.m.alive) { sx += (f.m.x + f.dx) * f.w; sy += (f.m.y + f.dy) * f.w; sw += f.w; }
    if (sw > 0) { n.x = n.px = sx / sw; n.y = n.py = sy / sw; }
  }
}
// ============================================================ negative-space lettering
// Letter shapes are distance fields round stroke centrelines (with per-point widths). Threads
// crossing a letter are re-laid round it (wrapLetter); any that can't be are cut and tied off
// (cutLetter), and a rim thread lines whatever stretch of the edge nothing else does (rimLetter).
const segT = (p, a, b) => { const ex = b.x - a.x, ey = b.y - a.y, l2 = ex * ex + ey * ey; return l2 ? clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / l2, 0, 1) : 0; };
function letterField(strokes, R = 0) { return p => { let m = 1e9; for (const st of strokes) { const P = st.pts, rs = st.rs, add = R * (1 - (st.rf || 1)); for (let i = 1; i < P.length; i++) { let d; if (rs) { const a = P[i - 1], b = P[i], t = segT(p, a, b); d = Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y) + R - lerp(rs[i - 1], rs[i], t); } else d = segDist(p, P[i - 1], P[i]) + add; if (d < m) m = d; } } return m; }; }
function lerpP(a, b, t) { return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
function boundaryT(a, b, inside) { let lo = 0, hi = 1; const ia = inside(a); for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (inside(lerpP(a, b, m)) === ia) lo = m; else hi = m; } return (lo + hi) / 2; }
// a cut end is held where it was cut (the tension around it keeps it in place)
function pin(n, id) { n.boundary = id; if (!n.fixed) { n.fixed = true; n.im = 0; fasten(n); } }
// cut the silk crossing one letter's region: sticky spiral inside is eaten, radii are kept;
// every crossing of the edge becomes a node the rim will tie to
function* cutLetter(letter) {
  const inside = p => letter.field(p) < letter.R;
  // a point already cut on this letter's edge counts as the edge, never as in or out,
  // so each crossing is cut exactly once
  const cls = n => n.boundary === letter.id ? 'B' : inside(n) ? 'I' : 'O';
  const passes = (a, b) => { for (let k = 1; k < 8; k++) if (inside(lerpP(a, b, k / 8))) return true; return false; };
  const todo = e => {
    if (!e.alive || e.eat >= 0) return null;
    const ca = cls(e.a), cb = cls(e.b);
    if (e.type === 'radius') return (ca === 'I' && cb === 'O') || (ca === 'O' && cb === 'I') ? 'split' : null;
    if (e.type !== 'capture') return null;
    if (ca === 'I' || cb === 'I') return ca === 'O' || cb === 'O' ? 'cut' : 'eat';
    if (ca === 'B' && cb === 'B') return inside(lerpP(e.a, e.b, 0.5)) ? 'eat' : null;
    if (ca === 'O' && cb === 'O') return passes(e.a, e.b) ? 'cut2' : null;
    return null;   // edge-to-outside: already trimmed
  };
  for (let guard = 0; guard < 3000; guard++) {
    let best = null, bd = 1e9, act = null;
    for (const e of edges) {
      const a = todo(e); if (!a) continue;
      const d = dist({ x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }, S);
      if (d < bd) { bd = d; best = e; act = a; }
    }
    if (!best) break;
    const e = best, m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
    if (dist(mouthPos(), m) > BL * 0.9) yield* moveFree(() => { const a = Math.atan2(m.y - S.y, m.x - S.x); return { x: m.x - Math.cos(a) * BL * 0.95, y: m.y - Math.sin(a) * BL * 0.95 }; }, REACH * 1.2);
    if (todo(e) !== act) continue;
    const a = e.a, b = e.b;
    if (act === 'split') { const n = splitEdge(e, boundaryT(a, b, inside)); pin(n, letter.id); continue; }   // one pinned point per crossing keeps the edge crisp
    if (act === 'eat') { yield* eatEdges([e], 0.12); continue; }
    if (act === 'cut') {
      const n = splitEdge(e, boundaryT(a, b, inside)); pin(n, letter.id);
      yield* eatEdges([cls(a) === 'I' ? e.split.e1 : e.split.e2], 0.12); continue;
    }
    // passes through: cut at both crossings, eat the middle
    let tin = 0.5; for (let k = 1; k < 8; k++) if (inside(lerpP(a, b, k / 8))) { tin = k / 8; break; }
    const n1 = splitEdge(e, boundaryT(a, lerpP(a, b, tin), inside) * tin); pin(n1, letter.id);
    const rest = e.split.e2, n2 = splitEdge(rest, 1 - boundaryT(rest.b, rest.a, inside)); pin(n2, letter.id);
    yield* eatEdges([rest.split.e1], 0.12);
  }
}

// ------------------------------------------------------------ wrapped letters (writes-words only)
// Every thread that crosses a letter is cut where it meets the edge and re-laid around the
// letter instead, hugging its outline. Short detours go on first and sit closest; longer ones
// stack outside them, so the outlines build up into dark bands and the web bends around the
// letters. A thread that can't go around neatly is just cut and tied off, as before.
function fieldGrad(f, p) { const e = 0.8, gx = f({ x: p.x + e, y: p.y }) - f({ x: p.x - e, y: p.y }), gy = f({ x: p.x, y: p.y + e }) - f({ x: p.x, y: p.y - e }), l = Math.hypot(gx, gy) || 1; return { x: gx / l, y: gy / l }; }
function letterChains(letter) {
  const inside = p => letter.field(p) < letter.R;
  const passes = (a, b) => { for (let k = 1; k < 10; k++) if (inside(lerpP(a, b, k / 10))) return true; return false; };
  const live = edges.filter(e => e.alive && e.eat < 0 && (e.type === 'capture' || e.type === 'radius'));
  const seen = new Set(), chains = [];
  const cont = (node, prev) => {
    const d0 = { x: node.x - prev.other(node).x, y: node.y - prev.other(node).y }, l0 = Math.hypot(d0.x, d0.y) || 1;
    let best = null, bc = -2;
    for (const f of node.edges) {
      if (f === prev || !f.alive || f.eat >= 0 || f.type !== prev.type || seen.has(f)) continue;
      const o = f.other(node), c = ((o.x - node.x) * d0.x + (o.y - node.y) * d0.y) / (l0 * (dist(o, node) || 1));
      if (c > bc) { bc = c; best = f; }
    }
    return bc > -0.3 ? best : null;
  };
  for (const e of live) {
    if (seen.has(e)) continue;
    const ia = inside(e.a), ib = inside(e.b);
    if (!ia && !ib) { if (passes(e.a, e.b)) { seen.add(e); chains.push({ type: e.type, entry: e, exit: e, u: e.a, w: e.b, mid: [] }); } continue; }
    if (ia && ib) continue;
    const u = ia ? e.b : e.a; let cur = ia ? e.a : e.b, prev = e; seen.add(e);
    const ch = { type: e.type, entry: e, exit: null, u, w: null, mid: [] };
    for (let g = 0; g < 300; g++) {
      const f = cont(cur, prev); if (!f) break;
      seen.add(f); const x = f.other(cur);
      if (!inside(x)) { ch.exit = f; ch.w = x; break; }
      ch.mid.push(f); prev = f; cur = x;
    }
    chains.push(ch);
  }
  // silk left wholly inside (loops, stubs) is simply eaten
  const orphans = live.filter(e => !seen.has(e) && inside(e.a) && inside(e.b));
  return { chains, orphans, inside };
}
function* wrapLetter(letter, letters) {
  const { chains, orphans, inside } = letterChains(letter);
  const loops = letterContours(letter), cnt = loops.map(l => new Uint8Array(l.length));
  const near = (p) => { let bl = -1, bi = -1, bd = 7; for (let l = 0; l < loops.length; l++) { const L = loops[l]; for (let i = 0; i < L.length; i++) { const d = dist(p, L[i]); if (d < bd) { bd = d; bl = l; bi = i; } } } return bl < 0 ? null : { l: bl, i: bi }; };
  const others = letters.filter(g => g !== letter);
  // where each chain meets the edge, and the shorter way round between the two points
  for (const c of chains) {
    const e = c.entry;
    if (c.exit === e) {
      let tin = 0.5; for (let k = 1; k < 10; k++) if (inside(lerpP(e.a, e.b, k / 10))) { tin = k / 10; break; }
      c.tA = boundaryT(e.a, lerpP(e.a, e.b, tin), inside) * tin;
      const tb = boundaryT(e.b, lerpP(e.b, e.a, 1 - tin), inside) * (1 - tin); c.tB = 1 - tb;
      c.A = lerpP(e.a, e.b, c.tA); c.B = lerpP(e.a, e.b, c.tB);
    } else {
      c.tA = boundaryT(e.a, e.b, inside); c.A = lerpP(e.a, e.b, c.tA);
      if (c.exit) { const x = c.exit; c.tB = boundaryT(x.a, x.b, inside); c.B = lerpP(x.a, x.b, c.tB); }
    }
    c.wrap = false;
    if (!c.B) continue;
    const pa = near(c.A), pb = near(c.B); if (!pa || !pb || pa.l !== pb.l) continue;
    const L = loops[pa.l], n = L.length, fw = (pb.i - pa.i + n) % n, bw = n - fw;
    c.loop = pa.l; c.i0 = pa.i; c.dir = fw <= bw ? 1 : -1; c.steps = Math.min(fw, bw);
    c.arc = c.steps * 2.2;
    c.wrap = c.arc <= geom.carved.h * 1.35 + letter.R * 2 && c.steps > 2;
  }
  // stack: shortest detours innermost
  const lay = chains.filter(c => c.wrap).sort((a, b) => a.arc - b.arc);
  for (const c of lay) {
    const L = loops[c.loop], C = cnt[c.loop], n = L.length, idx = [];
    for (let k = 0; k <= c.steps; k++) idx.push((c.i0 + c.dir * k + n * 4) % n);
    let lvl = 0; for (const i of idx.slice(2, -2)) lvl = Math.max(lvl, C[i]);
    if (lvl >= 4) { c.wrap = false; continue; }
    const o = 1.6 + lvl * 2.1, rl = Math.min(c.arc * 0.35, o * 3 + 6);
    const pts = [];
    for (let k = 0; k < idx.length; k++) {
      const sA = k * 2.2, f = smooth01(sA / rl) * smooth01((c.arc - sA) / rl);
      let q = L[idx[k]]; const g = fieldGrad(letter.field, q); q = { x: q.x + g.x * o * f, y: q.y + g.y * o * f };
      pts.push(q);
    }
    if (pts.some(q => others.some(g2 => g2.field(q) < g2.R + 3))) { c.wrap = false; continue; }
    for (const i of idx) C[i] = Math.max(C[i], lvl + 1);
    c.path = resample([c.A, ...pts.filter((_, k) => k % 3 === 0 && k > 0 && k < pts.length - 1), c.B], 8);
  }
  // now do it, working outward from the shortest
  const todo = [...lay.filter(c => c.wrap), ...chains.filter(c => !c.wrap)];
  for (const c of todo) {
    if (!c.entry.alive && !c.entry.split) continue;
    yield* moveFree(() => c.A, REACH * 1.1);
    const e = c.entry, eat = [...c.mid];
    let nA = null, nB = null;
    if (c.exit === e) {
      if (!e.alive) continue;
      nA = splitEdge(e, c.tA); const rest = e.split.e2; nB = splitEdge(rest, (c.tB - c.tA) / (1 - c.tA)); eat.push(rest.split.e1);
    } else {
      if (e.alive) { nA = splitEdge(e, c.tA); eat.push(c.u === e.a ? e.split.e2 : e.split.e1); }
      if (c.exit && c.exit.alive) { const x = c.exit; nB = splitEdge(x, c.tB); eat.push(c.w === x.a ? x.split.e2 : x.split.e1); }
    }
    if (nA) pin(nA, letter.id); if (nB) pin(nB, letter.id);
    yield* eatEdges(eat, 0.12);
    if (!c.wrap || !nA || !nB) continue;
    // lay the thread back round the outline
    const ref = c.entry.split ? c.entry.split.e1 : c.entry, mids = [];
    let prev = nA;
    for (let k = 1; k < c.path.length - 1; k++) {
      const q = c.path[k], m = new Node(q.x, q.y, true); m.wrapPt = true; fasten(m); mids.push(m);
      yield* moveFree(() => m, REACH * 0.9);
      const ne = new Edge(prev, m, dist(prev, m), c.type); for (const k2 of COPYK) ne[k2] = ref[k2]; ne.h = hash1(ne.id + 3); ne.born = simTime; ne.letter = letter.id;
      if (c.type === 'radius') { ne.k = STIFFT.radius; m.rid = ref.rid; }
      prev = m;
    }
    yield* moveFree(() => nB, REACH * 0.9);
    const ne = new Edge(prev, nB, dist(prev, nB), c.type); for (const k2 of COPYK) ne[k2] = ref[k2]; ne.h = hash1(ne.id + 3); ne.born = simTime; ne.letter = letter.id;
    if (c.type === 'radius' && ref.rid != null && mids.length) {
      const R = radii[ref.rid], ia = R.nodes.indexOf(nA), ib = R.nodes.indexOf(nB);
      if (ia >= 0 && ib >= 0) { if (ia < ib) R.nodes.splice(ib, 0, ...mids); else R.nodes.splice(ia, 0, ...mids.slice().reverse()); }
    }
  }
  yield* eatEdges(orphans.filter(e => e.alive), 0.12);
  // anything still crossing (threads cut by earlier work) is tidied with the old cutter
  yield* cutLetter(letter);
  return { loops, cnt };
}
const smooth01 = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// trace the letter's outline (marching squares on its distance field)
function letterContours(letter) {
  const { x0, y0, x1, y1 } = letter.box, cs = 2.5, nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = letter.field({ x: x0 + i * cs, y: y0 + j * cs }) - letter.R;
  const pt = (i, j, i2, j2) => { const a = v[j * nx + i], b = v[j2 * nx + i2], t = a / (a - b); return { x: x0 + lerp(i, i2, t) * cs, y: y0 + lerp(j, j2, t) * cs }; };
  const segs = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = (v[j * nx + i] < 0 ? 1 : 0) | (v[j * nx + i + 1] < 0 ? 2 : 0) | (v[(j + 1) * nx + i + 1] < 0 ? 4 : 0) | (v[(j + 1) * nx + i] < 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const T = ['t', i, j], R = ['r', i, j], B = ['b', i, j], L = ['l', i, j];
    const E = { t: () => pt(i, j, i + 1, j), r: () => pt(i + 1, j, i + 1, j + 1), b: () => pt(i, j + 1, i + 1, j + 1), l: () => pt(i, j, i, j + 1) };
    const key = (s) => s === 't' ? `h${i},${j}` : s === 'b' ? `h${i},${j + 1}` : s === 'l' ? `v${i},${j}` : `v${i + 1},${j}`;
    const pairs = { 1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']], 5: [['l', 't'], ['r', 'b']], 6: [['t', 'b']], 7: [['l', 'b']], 8: [['b', 'l']], 9: [['b', 't']], 10: [['t', 'r'], ['b', 'l']], 11: [['b', 'r']], 12: [['r', 'l']], 13: [['r', 't']], 14: [['t', 'l']] }[c];
    for (const [p, q] of pairs) segs.push({ k1: key(p), k2: key(q), p1: E[p](), p2: E[q]() });
  }
  // chain segments into loops
  const byKey = new Map(); for (const s of segs) for (const k of [s.k1, s.k2]) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s); }
  const used = new Set(), loops = [];
  for (const s0 of segs) {
    if (used.has(s0)) continue;
    const loop = [s0.p1]; let s = s0, k = s0.k2, pnt = s0.p2;
    for (let g = 0; g < 20000; g++) {
      used.add(s); loop.push(pnt);
      const nx_ = (byKey.get(k) || []).find(t => !used.has(t)); if (!nx_) break;
      if (nx_.k1 === k) { k = nx_.k2; pnt = nx_.p2; } else { k = nx_.k1; pnt = nx_.p1; }
      s = nx_;
    }
    if (loop.length > 6) loops.push(loop);
  }
  return loops;
}
// walk each outline laying the rim thread, tied to every cut end and radius crossing on the way
function* rimLetter(letter, cover) {
  const loops = cover ? cover.loops : letterContours(letter);
  const bnodes = nodes.filter(n => n.alive && n.boundary === letter.id);
  for (let li = 0; li < loops.length; li++) {
    const loop = loops[li], cnt = cover ? cover.cnt[li] : null;
    // arclength along the loop, and where each boundary node sits on it
    const cum = [0]; for (let i = 1; i < loop.length; i++) cum.push(cum[i - 1] + dist(loop[i - 1], loop[i]));
    const total = cum[cum.length - 1]; if (total < 10) continue;
    const at = [];
    for (const n of bnodes) {
      let bi = -1, bd = 6; for (let i = 0; i < loop.length; i++) { const d = dist(n, loop[i]); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) at.push({ s: cum[bi], n, i: bi });
    }
    // fill long gaps with points that follow the web, so the rim keeps the letter's shape
    for (let s = 0; s < total; s += 10) if (!at.some(a => Math.abs(a.s - s) < 7 || Math.abs(a.s - s) > total - 7)) {
      let i = 0; while (i < cum.length - 1 && cum[i + 1] < s) i++;
      const q = lerpP(loop[i], loop[Math.min(i + 1, loop.length - 1)], (s - cum[i]) / Math.max(1e-6, cum[Math.min(i + 1, cum.length - 1)] - cum[i]));
      const n = new Node(q.x, q.y, true); fasten(n); n.rimPt = true; at.push({ s, n, i });
    }
    at.sort((a, b) => a.s - b.s);
    if (at.length < 3) continue;
    // lay it: the spider travels the outline, attaching as it goes
    let prev = null, prevI = 0;
    for (const a of [...at, at[0]]) {
      yield* moveFree(() => a.n, REACH * 0.9);
      const covered = cnt && prev && Math.abs(a.i - prevI) < loop.length / 2 && cnt[(a.i + prevI) >> 1] > 0;   // already lined by threads pulled round it
      if (prev && prev !== a.n && !covered) { const e = new Edge(prev, a.n, dist(prev, a.n), 'rim'); e.letter = letter.id; e.strands = 2; e.born = simTime; }
      prev = a.n; prevI = a.i;
      if (!a.n.rimPt) yield* pause(0.06);
    }
  }
}
// place the word anywhere in the web: two words go above and below the hub, one word goes in
// whichever half gives the biggest letters (the open zone around the hub has no spiral to carve)
function layoutCarved(text) {
  const caps = edges.filter(e => e.alive && e.type === 'capture'); if (!caps.length) return null;
  let topY = 1e9, botY = -1e9; for (const e of caps) { const y = (e.a.y + e.b.y) / 2; topY = Math.min(topY, y); botY = Math.max(botY, y); }
  const Rb = geom.env ? geom.env.Rb : geom.Rm, gapZ = (geom.Z || Rb * 0.2) + Rb * 0.04;
  const above = { y0: topY + 6, y1: hub.y - gapZ }, below = { y0: hub.y + gapZ, y1: botY - 6 };
  const words = text.split(' '), sp = geom.s || 10;
  const strokeR = h => Math.max(h * 0.14, sp * 1.35);       // holes must be well wider than the spiral gaps
  // every way to break the name into lines at word boundaries (whole words only)
  const parts = [];
  for (let mask = 0; mask < 1 << (words.length - 1); mask++) {
    const lines = []; let cur = [words[0]];
    for (let i = 1; i < words.length; i++) { if (mask & (1 << (i - 1))) { lines.push(cur.join(' ')); cur = [words[i]]; } else cur.push(words[i]); }
    lines.push(cur.join(' ')); if (lines.length <= 4) parts.push(lines);
  }
  // stack some lines in a region and check each fits the spiral at its height
  // a letter reaches past its line box: stroke width, flared ends and serifs, then the threads
  // wrapped round it; keep all of that inside the sticky spiral
  const stack = (lines, r, h) => {
    if (!lines.length) return [];
    const ext = strokeR(h) * 1.45 + 12 + sp * 1.5;
    const gap = h * 0.32, need = lines.length * h + (lines.length - 1) * gap;
    if (r.y1 - r.y0 < need + 2 * ext) return null;
    const y0 = (r.y0 + r.y1) / 2 - need / 2, out = [];
    for (let i = 0; i < lines.length; i++) {
      const ya = y0 + i * (h + gap), span = spiralSpan(ya - ext, ya + h + ext), w = lineWidth(lines[i]) * h;
      if (!span || w + 2 * ext > span.hi - span.lo) return null;
      out.push({ text: lines[i], x0: (span.lo + span.hi) / 2 - w / 2, y: ya });
    }
    return out;
  };
  for (let h = Rb * 0.6; h >= 22; h *= 0.95) {
    TRACK = 2.2 * strokeR(h) / h + 0.34;
    const fits = [];
    for (const lines of parts) for (let m = 0; m <= lines.length; m++) {   // first m lines above the hub, the rest below
      const a = stack(lines.slice(0, m), above, h), b = stack(lines.slice(m), below, h);
      if (a && b) fits.push([...a, ...b]);
    }
    if (fits.length) {
      // prefer fewer lines, then a random pick among equals
      const best = Math.min(...fits.map(f => f.length)), pool = fits.filter(f => f.length === best);
      return { h, R: strokeR(h), thin: Math.max(strokeR(h) * 0.55, sp * 1.2), widths: true, track: TRACK, serif: true, lines: pool[randi(0, pool.length - 1)] };
    }
  }
  return null;
}
function* carveWord() {
  if (!hub || !geom.env) return;
  let L = null, word = '';
  for (let t = 0; t < 12 && !L; t++) { word = pickWord(); L = layoutCarved(word); }
  if (!L) { TRACK = 0.2; return; }
  TRACK = L.track; const strokes = wordStrokes(L); TRACK = 0.2;
  const R = L.R;
  const letters = [];
  for (const st of strokes) { let g = letters.find(l => l.id === st.letter); if (!g) { g = { id: st.letter, ch: st.ch, strokes: [], R }; letters.push(g); } g.strokes.push(st); }
  for (const g of letters) {
    g.field = letterField(g.strokes, R);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const st of g.strokes) for (const q of st.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    g.box = { x0: x0 - R - 6, y0: y0 - R - 6, x1: x1 + R + 6, y1: y1 + R + 6 };
  }
  geom.carved = { word, letters, R, h: L.h };
  geom.stylized = true;   // from here on the web holds its shape (writes-words mode only)
  yield* walkTo({ node: hub });
  for (const g of letters) {
    say('Writing', `clearing letter ${letters.indexOf(g) + 1} of ${letters.length} and pulling the threads around its edge`);
    const cover = yield* wrapLetter(g, letters);
    say('Writing', `reinforcing the edge of letter ${letters.indexOf(g) + 1}`);
    yield* rimLetter(g, cover);
  }
  say('Writing', 'finished');
  yield* moveFree(() => hub, REACH * 1.2);   // straight back over the web (some radii now detour round letters)
  yield* backOnSilk();
}
const inCarvedLetter = (x, y) => { const C = geom.carved; if (!C) return false; for (const g of C.letters) if (g.field({ x, y }) < g.R + 3) return true; return false; };
