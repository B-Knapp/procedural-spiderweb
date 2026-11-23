// The daily loop: build, tend, take the web down (eating it), new scene, repeat.
// ============================================================ the spider's day: build, tend, take down, repeat
// writes-words: letters cut some radii into pieces, so the spider crosses the web directly
function* tdWalk(goal, sp) {
  if (!geom.carved) return yield* walkTo(goal, sp);
  yield* moveFree(() => goal.node, REACH * 1.1); yield* backOnSilk(); return true;
}
function* takeDown() {
  say('Taking the web down', 'orb weavers eat their old silk and recycle it');
  if (geom.carved) {   // writes-words: unpin the lettering so it goes with the rest
    for (const n of nodes) if (n.alive && (n.wrapPt || n.rimPt || n.boundary != null)) { n.fixed = false; n.im = 1; n.follow = null; if (!n.edges.length) n.alive = false; }
    const deco = edges.filter(e => e.alive && e.type === 'rim');
    if (!resolve(S.ref) || deco.some(e => resolve(S.ref).e === e)) yield* backOnSilk();
    yield* eatEdges(deco, 0.4);
    if (!resolve(S.ref)) yield* backOnSilk();
  }
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
    if (!resolve(S.ref)) yield* backOnSilk();
    let seq = liveNodes(R).filter(n => n.edges.length);
    if (seq.length < 2) continue;
    if (!atHub) {
      yield* tdWalk({ node: seq[seq.length - 1] });
      if (todo.length === 0) { yield* tdWalk({ node: seq[0] }); atHub = true; }
    }
    if (atHub) { // out
      yield* tdWalk({ node: seq[0] });
      for (let i = 1; i < seq.length; i++) {
        if (!seq[i].alive) continue;
        yield* tdWalk({ node: seq[i] }, WALK * 1.3);
        yield* eatAt(seq[i]);
        const e = edgeBetween(seq[i - 1], seq[i]); if (e) yield* eatEdges([e], 0.05);
      }
      atHub = false;
    } else { // in
      for (let i = seq.length - 2; i >= 0; i--) {
        if (!seq[i].alive) continue;
        yield* tdWalk({ node: seq[i] }, WALK * 1.3);
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
function* lifeCycle() {
  for (;;) {
    yield* enter();
    yield* buildOrb();
    if (geom.words) yield* carveWord();
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
