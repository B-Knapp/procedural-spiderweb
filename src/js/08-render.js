// Drawing each frame: sky, landscape, silk and droplets, spider, insects, particles.
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
  const bandP = new Path2D();
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
    if (e.type === 'band') { if (e.hidden || e.stroke != null && !e.tie) continue; bandP.moveTo(ax, ay); bandP.lineTo(bx, by); continue; }
    const thin = e.type === 'capture' || e.type === 'rim' || e.type === 'aux' || e.type === 'hub' || e.type === 'carry' || e.type === 'stub' || e.type === 'glue';
    const p = paths[(thin ? nb : 0) + Math.floor(gl * nb)];
    p.moveTo(ax, ay);
    if (e.rest > d * 1.003 && e.eat < 0) { // slack: sag
      const sag = Math.min(80, Math.sqrt(3 * d * (e.rest - d) / 8)); let nx = -dy / d, ny = dx / d; if (ny < 0) { nx = -nx; ny = -ny; }
      const f = 0.3 + 0.7 * ny; p.quadraticCurveTo((ax + bx) / 2 + nx * sag * 2 * f, (ay + by) / 2 + ny * sag * 2 * f, bx, by);
    } else p.lineTo(bx, by);
    if ((e.type === 'capture' || e.type === 'rim') && e.eat < 0) capture.push(e);   // letter edges look just like sticky thread
  }
  const hl = [255, 252, 240];
  for (let i = 0; i < nb * 2; i++) {
    const g = ((i % nb) + 0.5) / nb, thin = i >= nb;
    c.strokeStyle = rgb(mix(base, hl, g), clamp(A * (0.42 + 0.9 * g) * (thin ? 0.8 : 1) * (CFG.pixel ? 0.8 : 1), 0, 1));
    c.lineWidth = unit * (thin ? 0.75 : 1.1) * (CFG.pixel ? 0.55 : 1);
    c.stroke(paths[i]);
  }
  // letters: tie-down threads, then each stroke as a cord of parallel strands
  c.strokeStyle = rgb(mix(base, hl, 0.5), clamp(A * 0.9, 0, 1)); c.lineWidth = unit * 0.7; c.stroke(bandP);
  if (geom.writing) drawWebLetters(c, unit, base, hl, A);

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


function drawBugs(c, unit) {
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

// letters made of web: each stroke is a band of loose, wandering strands braced by short
// cross-threads, wider on downstrokes, fraying into stray threads at the ends
function drawWebLetters(c, unit, base, hl, A) {
  const strands = new Path2D(), mesh = new Path2D(), fray = new Path2D();
  const NS = CFG.pixel ? 3 : 5;
  for (const st of geom.writing.strokes) {
    const N = st.nodes; if (!N || N.length < 4) continue;
    const pairs = Math.floor(N.length / 2);
    // centre line and half-width vector per pair; width follows the stroke direction
    const C = [], Hv = [], ok = [];
    for (let k = 0; k < pairs; k++) {
      const ev = N[2 * k], od = N[2 * k + 1];
      const segOK = ev.alive && od.alive && (k === 0 || ((st.rail[2 * k] || {}).alive && (st.rail[2 * k + 1] || {}).alive));
      const cx = (ev.x + od.x) / 2, cy = (ev.y + od.y) / 2;
      const k2 = Math.min(pairs - 1, k + 1), k0 = Math.max(0, k - 1);
      const ax = (N[2 * k2].x + N[2 * k2 + 1].x) / 2 - (N[2 * k0].x + N[2 * k0 + 1].x) / 2, ay = (N[2 * k2].y + N[2 * k2 + 1].y) / 2 - (N[2 * k0].y + N[2 * k0 + 1].y) / 2;
      const dirA = Math.atan2(ay, ax);
      const w = 0.55 + 0.75 * Math.abs(Math.sin(dirA - 0.25));       // calligraphic: thick downstrokes
      C.push({ x: cx, y: cy }); Hv.push({ x: (od.x - ev.x) / 2 * w * 1.25, y: (od.y - ev.y) / 2 * w * 1.25 }); ok.push(segOK);
    }
    const P = (k, f) => ({ x: C[k].x + Hv[k].x * f, y: C[k].y + Hv[k].y * f });
    const sid = st.id * 7.13;
    // wandering strands
    const fOf = (s_, k) => -1 + 2 * (s_ + 0.5) / NS + noise1(k * 0.15 + s_ * 13.7 + sid) * 0.4;
    for (let s_ = 0; s_ < NS; s_++) {
      let pen = false;
      for (let k = 0; k < pairs; k++) {
        if (!ok[k]) { pen = false; continue; }
        const p = P(k, fOf(s_, k));
        if (pen) strands.lineTo(p.x, p.y); else { strands.moveTo(p.x, p.y); pen = true; }
      }
    }
    // short diagonal cross-threads between neighbouring strands: the web texture
    for (let k = 1; k < pairs - 1; k++) {
      const h = hash1(st.id * 977 + k);
      if (h > 0.8 || !ok[k] || !ok[k + 1]) continue;
      const s1 = Math.floor(h / 0.8 * (NS - 1)), s2 = s1 + 1;
      const a = P(k, fOf(s1, k)), b = P(Math.min(pairs - 1, k + 1 + (h > 0.3 ? 1 : 0)), fOf(s2, k + 1));
      mesh.moveTo(a.x, a.y); mesh.lineTo(b.x, b.y);
    }
    // frayed ends: strands fan out and trail off past the end of the stroke
    for (const end of [0, pairs - 1]) {
      if (!ok[end]) continue;
      const nb = end === 0 ? 1 : pairs - 2; if (nb < 0 || nb >= pairs) continue;
      const dx = C[end].x - C[nb].x, dy = C[end].y - C[nb].y, d = Math.hypot(dx, dy) || 1;
      for (let s_ = 0; s_ < NS; s_++) {
        const h = hash1(st.id * 31 + end * 7 + s_); if (h > 0.45) continue;
        const p = P(end, fOf(s_, end)), L = geom.writing.band * (0.5 + h * 2.2), spread = (s_ - (NS - 1) / 2) * 0.28;
        const ux = dx / d, uy = dy / d, ca = Math.cos(spread), sa = Math.sin(spread);
        fray.moveTo(p.x, p.y); fray.lineTo(p.x + (ux * ca - uy * sa) * L, p.y + (ux * sa + uy * ca) * L);
      }
    }
  }
  const col = rgb(mix(base, hl, 0.85), clamp(A * 1.4 + 0.25, 0, 1));
  c.strokeStyle = col; c.lineWidth = unit * (CFG.pixel ? 0.8 : 0.95); c.stroke(strands);
  c.strokeStyle = rgb(mix(base, hl, 0.6), clamp(A * 1.0 + 0.1, 0, 1)); c.lineWidth = unit * 0.55; c.stroke(mesh); c.stroke(fray);
}
