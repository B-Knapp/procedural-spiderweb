// The spider's look: sprites from the rig sheet, leg IK, gait, poses (hub stance, wrapping).
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
