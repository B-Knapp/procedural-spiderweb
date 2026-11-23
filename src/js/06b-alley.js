// The rainy alley: the second setting (A key). Always night, lit by a wall lamp and a neon sign,
// always raining. The web hangs in a big frame that fills most of the screen: a drainpipe on
// the left, a fire-escape ladder on the right, the fire-escape landing above and a pipe below.
// ============================================================ alley
let alleyBack = null, alleyFront = null, rainFar = [], rainNear = [], drips = [], splashes = [], ripples = [], steam = [], glowPink = null, glowCyan = null, glowWarm = null;

function alleyGeometry() {
  const vpx = rand(880, 1040), vpy = rand(560, 600);
  return {
    alley: true,
    xL: Math.round(rand(150, 185)), xR: Math.round(W - rand(150, 185)), yT: Math.round(rand(112, 128)), yB: Math.round(rand(958, 978)),
    postW: 44, railH: 30, seed: Math.random() * 1000,
    vp: { x: vpx, y: vpy }, Zf: 7,
    lampSide: Math.random() < 0.5 ? 'L' : 'R', neonPink: Math.random() < 0.6,
  };
}

// --- perspective on the alley walls: z = 1 at the screen edge, Zf at the far end.
// yw is the height a point would have at the screen edge; it runs straight toward the vanishing point.
function alleyFar(side) { const f = sc.vp, w = 150; return side === 'L' ? f.x - w : f.x + w; }
function wallPt(side, z, yw) {
  const f = (1 - 1 / z) / (1 - 1 / sc.Zf), vp = sc.vp;
  if (side === 'L') { const x = alleyFar('L') * f; return { x, y: yw + (vp.y - yw) * x / vp.x }; }
  const x = W - (W - alleyFar('R')) * f; return { x, y: yw + (vp.y - yw) * (W - x) / (W - vp.x) };
}
const GROUND0 = 1010;   // where the walls meet the ground at the screen edge
function groundPt(u, z) {   // u: 0 left wall .. 1 right wall
  const a = wallPt('L', z, GROUND0), b = wallPt('R', z, GROUND0); return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
}
function quad(g, pts) { g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); }

function paintAlley() {
  const s0 = sc.seed;
  const c = mk(W, H), g = c.getContext('2d');
  const vp = sc.vp, fL = alleyFar('L'), fR = alleyFar('R');
  const farTop = wallPt('L', sc.Zf, -40).y, farBot = wallPt('L', sc.Zf, GROUND0).y;
  // sky: a wedge of rain-hazed city glow above the walls
  const sk = g.createLinearGradient(0, 0, 0, farBot);
  sk.addColorStop(0, '#0b0d16'); sk.addColorStop(0.55, '#1d1a2a'); sk.addColorStop(1, '#4a3238');
  g.fillStyle = sk; g.fillRect(0, 0, W, H);
  // across the street at the far end: a building front with lit windows and a shop glow
  g.fillStyle = '#17161f'; g.fillRect(fL - 10, farTop - 60, fR - fL + 20, farBot - farTop + 70);
  for (let r = 0; r < 7; r++) for (let q = 0; q < 6; q++) {
    if (Math.random() < 0.45) continue;
    const x = lerp(fL + 14, fR - 30, q / 5), y = farTop - 40 + r * 34, warm = Math.random() < 0.75;
    g.fillStyle = warm ? `rgba(255,${rand(170, 210) | 0},${rand(90, 130) | 0},${rand(0.45, 0.9)})` : 'rgba(150,190,255,0.5)'; g.fillRect(x, y, 14, 20);
  }
  const shop = g.createLinearGradient(0, farBot - 90, 0, farBot); shop.addColorStop(0, 'rgba(255,190,110,0)'); shop.addColorStop(1, 'rgba(255,190,110,0.75)');
  g.fillStyle = shop; g.fillRect(fL - 10, farBot - 90, fR - fL + 20, 90);
  for (let i = 0; i < 14; i++) { const x = rand(fL, fR), y = rand(farBot - 60, farBot - 4), r = rand(4, 14); const gr = g.createRadialGradient(x, y, 0, x, y, r); const col = Math.random() < 0.7 ? '255,210,150' : '255,90,80'; gr.addColorStop(0, `rgba(${col},0.9)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }

  // the two walls: brick in perspective
  const wall = side => {
    const near = side === 'L' ? 0 : W, far = side === 'L' ? fL : fR;
    const top0 = side === 'L' ? rand(-20, 60) : rand(-40, 40);
    g.save();
    quad(g, [{ x: near, y: top0 }, wallPt(side, sc.Zf, top0), wallPt(side, sc.Zf, GROUND0), { x: near, y: GROUND0 }]); g.clip();
    const wg = g.createLinearGradient(near, 0, far, 0); wg.addColorStop(0, side === 'L' ? '#3b2420' : '#33211f'); wg.addColorStop(1, '#1a1418');
    g.fillStyle = wg; g.fillRect(0, -100, W, H + 200);
    // bricks
    const rows = 46;
    for (let r = 0; r < rows; r++) {
      const y0 = lerp(top0, GROUND0, r / rows), y1 = lerp(top0, GROUND0, (r + 1) / rows), off = (r % 2) * 0.5;
      for (let z = 1 - off * 0.06; z < sc.Zf; z += 0.06 * z * 0.55 + 0.02) {
        const z2 = z + 0.06 * z * 0.55 + 0.012;
        const a = wallPt(side, z, y0), b = wallPt(side, z2, y0), cc = wallPt(side, z2, y1), d = wallPt(side, z, y1);
        const v = noise1(r * 0.7 + z * 3 + s0) * 0.5 + Math.random() * 0.5, dim = 1 / (0.6 + z * 0.4);
        g.fillStyle = `rgba(${(90 + v * 50) * dim | 0},${(44 + v * 22) * dim | 0},${(36 + v * 16) * dim | 0},0.85)`;
        quad(g, [a, b, cc, d]); g.fill();
      }
    }
    // grime and wet streaks running down
    for (let i = 0; i < 90; i++) {
      const z = rand(1, sc.Zf * 0.8), yw = rand(top0, GROUND0 - 100), p = wallPt(side, z, yw), len = rand(60, 320) / z;
      const sg = g.createLinearGradient(0, p.y, 0, p.y + len); sg.addColorStop(0, 'rgba(10,8,12,0.35)'); sg.addColorStop(1, 'rgba(10,8,12,0)');
      g.fillStyle = sg; g.fillRect(p.x - 4 / z, p.y, rand(4, 14) / z, len);
    }
    // windows: a few lit, most dark and reflecting
    for (let i = 0; i < 5; i++) {
      const z0 = rand(1.3, sc.Zf * 0.85), z1 = z0 + rand(0.12, 0.2) * z0, yw0 = rand(120, 520), yw1 = yw0 + rand(140, 200);
      const pts = [wallPt(side, z0, yw0), wallPt(side, z1, yw0), wallPt(side, z1, yw1), wallPt(side, z0, yw1)];
      const lit = Math.random() < 0.4;
      g.fillStyle = lit ? `rgba(255,${rand(160, 200) | 0},100,0.75)` : 'rgba(20,24,36,0.95)'; quad(g, pts); g.fill();
      g.strokeStyle = 'rgba(8,6,8,0.9)'; g.lineWidth = 6 / z0; quad(g, pts); g.stroke();
      if (!lit) { g.strokeStyle = 'rgba(120,140,180,0.15)'; g.lineWidth = 2; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); g.lineTo(pts[2].x, pts[2].y); g.stroke(); }
    }
    // a pipe running along the wall
    const pw = rand(200, 420);
    g.strokeStyle = 'rgba(30,32,36,0.9)'; g.lineWidth = 10;
    g.beginPath(); const p0 = wallPt(side, 1, pw), p1 = wallPt(side, sc.Zf, pw); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    g.restore();
    return top0;
  };
  wall('L'); wall('R');
  // fire escapes on the far walls, in silhouette
  for (const side of ['L', 'R']) {
    const z0 = rand(2.4, 3.6), z1 = z0 * 1.35;
    g.strokeStyle = 'rgba(6,6,10,0.85)'; g.lineWidth = 2.2;
    for (let lv = 0; lv < 4; lv++) {
      const yw = 180 + lv * 190, a = wallPt(side, z0, yw), b = wallPt(side, z1, yw);
      const out = (side === 'L' ? 1 : -1) * 34 / z0;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x + out, a.y + 4); g.lineTo(b.x + out * 0.75, b.y + 3); g.lineTo(b.x, b.y); g.stroke();
      g.beginPath(); g.moveTo(a.x + out, a.y - 30 / z0); g.lineTo(b.x + out * 0.75, b.y - 22 / z0); g.stroke();
      const c0 = wallPt(side, z0 * 1.05, yw), c1 = wallPt(side, z1 * 0.97, yw + 190);
      if (lv < 3) { g.beginPath(); g.moveTo(c0.x + out, c0.y); g.lineTo(c1.x + out * 0.8, c1.y); g.stroke(); }
    }
  }
  // ground: wet asphalt, darker near, puddles that hold the light
  g.save();
  quad(g, [{ x: 0, y: GROUND0 }, wallPt('L', sc.Zf, GROUND0), wallPt('R', sc.Zf, GROUND0), { x: W, y: GROUND0 }, { x: W, y: H }, { x: 0, y: H }]); g.clip();
  const gg = g.createLinearGradient(0, farBot, 0, H); gg.addColorStop(0, '#2a2530'); gg.addColorStop(0.3, '#16151c'); gg.addColorStop(1, '#0c0c10'); g.fillStyle = gg; g.fillRect(0, farBot, W, H - farBot);
  // reflection of the far street light running toward us
  const rg = g.createLinearGradient(0, farBot, 0, H); rg.addColorStop(0, 'rgba(255,190,120,0.45)'); rg.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = rg; quad(g, [{ x: fL + 10, y: farBot }, { x: fR - 10, y: farBot }, { x: vp.x + 260, y: H }, { x: vp.x - 260, y: H }]); g.fill();
  sc.puddles = [];
  for (let i = 0; i < 9; i++) {
    const z = rand(1.15, 4.5), u = rand(0.18, 0.82), p = groundPt(u, z), rx = rand(90, 220) / z, ry = rx * 0.18;
    const pg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx); pg.addColorStop(0, 'rgba(90,96,130,0.45)'); pg.addColorStop(0.7, 'rgba(50,54,80,0.35)'); pg.addColorStop(1, 'rgba(30,30,44,0)');
    g.fillStyle = pg; g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); g.fill();
    sc.puddles.push({ x: p.x, y: p.y, rx, ry });
  }
  // a dumpster and some bags against one wall
  {
    const side = Math.random() < 0.5 ? 'L' : 'R', z = rand(1.9, 2.5), s = 1 / z, p = wallPt(side, z, GROUND0), dir = side === 'L' ? 1 : -1;
    const w = 260 * s, h = 150 * s, x = side === 'L' ? p.x + 6 * s : p.x - 6 * s - w;
    g.fillStyle = '#1d3326'; g.fillRect(x, p.y - h, w, h);
    g.fillStyle = '#142419'; g.fillRect(x - 6 * s, p.y - h - 12 * s, w + 12 * s, 14 * s);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2 * s; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(x + w * i / 6, p.y - h); g.lineTo(x + w * i / 6, p.y); g.stroke(); }
    g.fillStyle = 'rgba(150,200,170,0.12)'; g.fillRect(x, p.y - h, w, 4 * s);
    for (let i = 0; i < 4; i++) { const bx = x + (dir > 0 ? w + rand(10, 60) * s : -rand(10, 60) * s), r = rand(28, 44) * s; g.fillStyle = '#0d0d10'; g.beginPath(); g.ellipse(bx, p.y - r * 0.7, r, r * 0.75, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(140,150,190,0.15)'; g.beginPath(); g.ellipse(bx - r * 0.3, p.y - r * 1.1, r * 0.35, r * 0.15, -0.4, 0, TAU); g.fill(); }
  }
  // a storm grate in the middle (it steams)
  { const p = groundPt(rand(0.4, 0.6), rand(1.6, 2.2)); sc.grate = p; g.fillStyle = '#08080b'; g.beginPath(); g.ellipse(p.x, p.y, 70 / 2, 12, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(90,90,110,0.4)'; g.lineWidth = 1.5; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(p.x + i * 8, p.y - 10); g.lineTo(p.x + i * 8, p.y + 10); g.stroke(); } }
  g.restore();
  // the lamp over a door, and the neon sign, on the walls
  { const side = sc.lampSide, z = rand(1.5, 1.9), p = wallPt(side, z, rand(300, 360)), s = 1 / z;
    sc.lamp = { x: p.x + (side === 'L' ? 34 : -34) * s, y: p.y + 10 * s, s };
    const d0 = wallPt(side, z * 0.96, p.y + 40), d1 = wallPt(side, z * 1.12, p.y + 40), d2 = wallPt(side, z * 1.12, GROUND0), d3 = wallPt(side, z * 0.96, GROUND0);
    g.fillStyle = '#120e10'; quad(g, [d0, d1, d2, d3]); g.fill();   // the door under it
    g.strokeStyle = '#0a0a0c'; g.lineWidth = 5 * s; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(sc.lamp.x, sc.lamp.y - 6 * s); g.stroke();
    g.fillStyle = '#16161a'; g.beginPath(); g.moveTo(sc.lamp.x - 22 * s, sc.lamp.y); g.lineTo(sc.lamp.x + 22 * s, sc.lamp.y); g.lineTo(sc.lamp.x + 10 * s, sc.lamp.y - 14 * s); g.lineTo(sc.lamp.x - 10 * s, sc.lamp.y - 14 * s); g.closePath(); g.fill();
  }
  { const side = sc.lampSide === 'L' ? 'R' : 'L', z = rand(1.6, 2.4), p = wallPt(side, z, rand(380, 470)), s = 1 / z;
    sc.neon = { x: p.x + (side === 'L' ? 56 : -56) * s, y: p.y, s, h: 320 * s, col: sc.neonPink ? [255, 70, 160] : [60, 225, 255], seed: rand(0, 100) };
    g.fillStyle = '#0c0b10'; g.fillRect(sc.neon.x - 30 * s, sc.neon.y - 18 * s, 60 * s, sc.neon.h + 36 * s);
  }
  // haze: the far end disappears into wet air
  const hz = g.createRadialGradient(vp.x, vp.y, 20, vp.x, vp.y, 900); hz.addColorStop(0, 'rgba(120,110,130,0.32)'); hz.addColorStop(0.5, 'rgba(70,70,95,0.12)'); hz.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hz; g.fillRect(0, 0, W, H);
  // depth of field
  alleyBack = mk(W, H); const bg = alleyBack.getContext('2d');
  if ('filter' in bg) bg.filter = 'blur(2.4px)';
  bg.drawImage(c, 0, 0); bg.filter = 'none';

  paintAlleyFront();
  // rain, drips, steam
  rainFar = []; for (let i = 0; i < 520; i++) rainFar.push({ x: rand(-100, W + 100), y: rand(-50, H), v: rand(900, 1300), l: rand(10, 26), a: rand(0.08, 0.22) });
  rainNear = []; for (let i = 0; i < 120; i++) rainNear.push({ x: rand(-100, W + 100), y: rand(-50, H), v: rand(1700, 2300), l: rand(40, 80), a: rand(0.1, 0.28) });
  drips = []; splashes = []; ripples = []; steam = [];
  makeAlleyGlows();
}

// the things the web hangs from, in focus and close
function paintAlleyFront() {
  alleyFront = mk(W, H); const g = alleyFront.getContext('2d');
  const metal = (x0, x1, horiz, base, hi) => {   // a cylinder's shading across x0..x1
    const gr = horiz ? g.createLinearGradient(0, x0, 0, x1) : g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, '#0b0c0e'); gr.addColorStop(0.25, base); gr.addColorStop(0.42, hi); gr.addColorStop(0.5, base); gr.addColorStop(0.85, '#141619'); gr.addColorStop(1, '#060708');
    return gr;
  };
  // fire-escape landing across the top: a steel channel with a grated floor above it
  const yT = sc.yT, lh = 34;
  g.fillStyle = '#0d0e11'; g.fillRect(0, 0, W, yT - lh);
  g.strokeStyle = 'rgba(70,80,96,0.35)'; g.lineWidth = 3;
  for (let x = -20; x < W + 20; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, yT - lh); g.stroke(); }
  for (let x = 40; x < W; x += rand(260, 340)) { g.fillStyle = '#16181c'; g.fillRect(x, 0, 10, yT - lh); }   // railing posts up to the next floor
  const cg = g.createLinearGradient(0, yT - lh, 0, yT); cg.addColorStop(0, '#2a2d33'); cg.addColorStop(0.35, '#5a606b'); cg.addColorStop(0.5, '#3a3e45'); cg.addColorStop(1, '#121317');
  g.fillStyle = cg; g.fillRect(0, yT - lh, W, lh);
  g.fillStyle = 'rgba(160,175,200,0.5)'; g.fillRect(0, yT - lh + 10, W, 1.5);
  for (let x = 30; x < W; x += 90) { g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(x, yT - lh / 2, 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(180,190,210,0.4)'; g.beginPath(); g.arc(x - 0.8, yT - lh / 2 - 0.8, 1.2, 0, TAU); g.fill(); }
  // rust bleeding down the channel
  for (let i = 0; i < 26; i++) { const x = rand(0, W), l = rand(6, 26); const rg = g.createLinearGradient(0, yT - 8, 0, yT + l); rg.addColorStop(0, 'rgba(120,60,30,0.5)'); rg.addColorStop(1, 'rgba(120,60,30,0)'); g.fillStyle = rg; g.fillRect(x, yT - 8, rand(2, 6), l + 8); }
  // drainpipe down the left
  const px0 = sc.xL - sc.postW, px1 = sc.xL;
  g.fillStyle = metal(px0, px1, false, '#3a4642', '#93a6a0'); g.fillRect(px0, yT - lh, px1 - px0, H);
  for (let y = yT + 140; y < H; y += rand(240, 320)) {   // joints and wall brackets
    g.fillStyle = metal(px0 - 4, px1 + 4, false, '#2c3532', '#7d8f89'); g.fillRect(px0 - 4, y, px1 - px0 + 8, 14);
    g.fillStyle = '#121416'; g.fillRect(0, y + 2, px0 - 4, 10);
  }
  for (let i = 0; i < 18; i++) { const y = rand(yT, H), l = rand(20, 120); const rg = g.createLinearGradient(0, y, 0, y + l); rg.addColorStop(0, 'rgba(110,70,40,0.45)'); rg.addColorStop(1, 'rgba(110,70,40,0)'); g.fillStyle = rg; g.fillRect(rand(px0 + 4, px1 - 8), y, rand(2, 5), l); }
  g.fillStyle = 'rgba(200,230,240,0.35)'; g.fillRect(px0 + (px1 - px0) * 0.36, yT, 2, H);   // the wet highlight
  // fire-escape ladder on the right: two rails and rungs
  const r0 = sc.xR, rw = 14, r1 = Math.min(W - 10, sc.xR + 120);
  for (const rx of [r0, r1]) { g.fillStyle = metal(rx, rx + rw, false, '#25282d', '#6c7480'); g.fillRect(rx, yT - lh, rw, H); }
  for (let y = yT + 30; y < H; y += 40) { g.fillStyle = metal(y, y + 8, true, '#25282d', '#6c7480'); g.fillRect(r0 + rw, y, r1 - r0 - rw, 8); }
  g.fillStyle = 'rgba(190,210,235,0.35)'; g.fillRect(r0 + 4, yT, 1.5, H); g.fillRect(r1 + 4, yT, 1.5, H);
  // a pipe along the bottom
  const yB = sc.yB, bh = 30;
  g.fillStyle = metal(yB, yB + bh, true, '#353b40', '#8c98a2'); g.fillRect(0, yB, W, bh);
  for (let x = 60; x < W; x += rand(280, 380)) { g.fillStyle = metal(yB - 3, yB + bh + 3, true, '#272b30', '#727d87'); g.fillRect(x, yB - 3, 16, bh + 6); g.fillStyle = '#0e0f11'; g.fillRect(x + 4, yB + bh + 3, 8, H); }
  g.fillStyle = 'rgba(210,230,245,0.45)'; g.fillRect(0, yB + 7, W, 1.5);
  g.fillStyle = '#08080a'; g.fillRect(0, yB + bh, W, H - yB - bh);
  const cg2 = g.createLinearGradient(0, yB + bh, 0, H); cg2.addColorStop(0, 'rgba(40,44,60,0.6)'); cg2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = cg2; g.fillRect(0, yB + bh, W, H - yB - bh);
}
function makeAlleyGlows() {
  const one = col => { const c = mk(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.25, `rgba(${col},0.45)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; };
  glowPink = one('255,70,160'); glowCyan = one('60,225,255'); glowWarm = one('255,196,120');
}

// fixed night light, so the web glints from the lamp
function alleyPalette() {
  return { top: [11, 13, 22], mid: [29, 26, 42], hor: [74, 50, 56], tint: [1, 1, 1], spTint: [0.6, 0.64, 0.8], silk: [196, 208, 236], silkA: 0.52, dark: 1, dew: 1, rim: 0,
    sunUp: false, moonUp: false, sunLow: 0, sun: { x: -999, y: -999 }, moon: { x: -999, y: -999 }, lamp: sc.lamp, lampGlow: 0.85 };
}
const neonLevel = () => { const n = sc.neon, t = realT + n.seed, f = noise1(t * 3.1); return (f < -0.62 && Math.sin(t * 40) > 0) ? 0.25 : 0.88 + 0.12 * Math.sin(t * 60); };   // buzz, and the odd flicker

// --- per frame: the background, its light, rain behind the web
function drawAlleyBack(tc, unit, pix) {
  tc.drawImage(alleyBack, 0, 0, W, H);
  const n = sc.neon, lv = neonLevel(), ng = sc.neonPink ? glowPink : glowCyan, L = sc.lamp;
  tc.globalCompositeOperation = 'lighter';
  // lamp: glow, and a cone of light down through the rain
  tc.globalAlpha = 0.9; tc.drawImage(glowWarm, L.x - 70 * L.s, L.y - 50 * L.s, 140 * L.s, 100 * L.s);
  tc.globalAlpha = 0.35; tc.drawImage(glowWarm, L.x - 300, L.y - 160, 600, 420);
  const cone = tc.createLinearGradient(0, L.y, 0, GROUND0 + 40); cone.addColorStop(0, 'rgba(255,200,130,0.16)'); cone.addColorStop(1, 'rgba(255,200,130,0.02)');
  tc.globalAlpha = 1; tc.fillStyle = cone; tc.beginPath(); tc.moveTo(L.x - 18 * L.s, L.y); tc.lineTo(L.x + 18 * L.s, L.y); tc.lineTo(L.x + 240, GROUND0 + 40); tc.lineTo(L.x - 240, GROUND0 + 40); tc.closePath(); tc.fill();
  const pool = tc.createRadialGradient(L.x, GROUND0 + 20, 10, L.x, GROUND0 + 20, 300); pool.addColorStop(0, 'rgba(255,190,120,0.22)'); pool.addColorStop(1, 'rgba(255,190,120,0)');
  tc.fillStyle = pool; tc.fillRect(L.x - 300, GROUND0 - 120, 600, 240);
  // neon sign: tubes, halo, and its smeared reflection on the wet ground
  tc.globalAlpha = 0.95 * lv; tc.drawImage(ng, n.x - 120 * n.s, n.y - 60 * n.s, 240 * n.s, n.h + 120 * n.s);
  tc.globalAlpha = 0.34 * lv; tc.drawImage(ng, n.x - 380, n.y - 160, 760, n.h + 360);
  tc.globalAlpha = 0.5 * lv; tc.drawImage(ng, n.x - 60 * n.s, GROUND0 - 20, 100 * n.s, H - GROUND0 + 40);
  tc.globalAlpha = 1; tc.globalCompositeOperation = 'source-over';
  drawNeonWord(tc, n, lv);
  // steam from the grate
  if (Math.random() < frameDT * 3) steam.push({ x: sc.grate.x + rand(-20, 20), y: sc.grate.y, r: rand(14, 24), a: 0, t: 0 });
  for (const p of steam) { p.t += frameDT; p.y -= 26 * frameDT; p.x += (wind.x * 0.2 + Math.sin(p.t + p.r) * 6) * frameDT; p.r += 9 * frameDT; }
  steam = steam.filter(p => p.t < 7);
  for (const p of steam) { tc.globalAlpha = 0.07 * Math.sin(Math.PI * p.t / 7); tc.drawImage(glowSprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
  tc.globalAlpha = 1;
  // ripples in the puddles
  if (Math.random() < frameDT * 14 && sc.puddles.length) { const q = sc.puddles[randi(0, sc.puddles.length - 1)]; ripples.push({ x: q.x + rand(-q.rx, q.rx) * 0.7, y: q.y + rand(-q.ry, q.ry) * 0.6, t: 0, s: q.rx / 120 }); }
  tc.lineWidth = 1;
  for (const r of ripples) { r.t += frameDT; const k = r.t / 0.9; tc.strokeStyle = `rgba(180,190,220,${0.35 * (1 - k)})`; tc.beginPath(); tc.ellipse(r.x, r.y, (4 + 40 * k) * r.s, (1 + 7 * k) * r.s, 0, 0, TAU); tc.stroke(); }
  ripples = ripples.filter(r => r.t < 0.9);
  // far rain
  drawRain(tc, rainFar, unit, 0.6);
}
function drawNeonWord(tc, n, lv) {
  // a vertical sign: H O T E L in glowing tubes
  const word = 'HOTEL', h = n.h / word.length, w = 30 * n.s, col = n.col;
  tc.save(); tc.lineCap = 'round'; tc.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    tc.strokeStyle = pass ? rgb(mix(col, [255, 255, 255], 0.6), lv) : rgb(col, 0.5 * lv); tc.lineWidth = (pass ? 3.2 : 9) * n.s;
    tc.beginPath();
    [...word].forEach((ch, i) => {
      const x = n.x - w / 2, y = n.y + i * h + h * 0.15, hh = h * 0.7;
      const S_ = GLYPHS[ch].s, gw = GLYPHS[ch].w;
      for (const poly of S_) poly.forEach(([gx, gy], k) => { const px = x + gx / gw * w, py = y + gy * hh; k ? tc.lineTo(px, py) : tc.moveTo(px, py); });
    });
    tc.stroke();
  }
  tc.restore();
}
function drawRain(tc, list, unit, scale) {
  const sl = wind.x * 0.004 * scale + 0.06;
  tc.lineWidth = (scale > 1 ? 1.6 : 1) * unit; tc.lineCap = 'round';
  tc.strokeStyle = 'rgba(190,205,235,1)';
  const L = sc.lamp;
  for (const d of list) {
    d.y += d.v * frameDT; d.x += d.v * sl * frameDT;
    if (d.y > H + 40) { d.y = rand(-120, -20); d.x = rand(-100, W + 100); if (scale < 1 && Math.random() < 0.15) splashes.push({ x: d.x, y: rand(GROUND0, H), t: 0 }); }
    const inLamp = Math.abs(d.x - L.x - (d.y - L.y) * 0.25) < 60 + (d.y - L.y) * 0.25 && d.y > L.y;   // drops crossing the lamp's cone light up
    tc.globalAlpha = d.a * (inLamp ? 2.6 : 1);
    tc.beginPath(); tc.moveTo(d.x, d.y); tc.lineTo(d.x - d.l * sl, d.y - d.l); tc.stroke();
  }
  tc.globalAlpha = 1;
}
// --- per frame: the anchors, then (after the web and spider) the near rain and drips
function drawAlleyMid(tc) { tc.drawImage(alleyFront, 0, 0, W, H); }
function drawAlleyFront(tc, unit, pix) {
  // drips gather under the landing and fall
  if (Math.random() < frameDT * 2.2) drips.push({ x: rand(0, W), y: sc.yT + 2, v: 0, hang: rand(0.4, 1.6) });
  tc.fillStyle = 'rgba(210,225,250,0.75)';
  for (const d of drips) {
    if (d.hang > 0) { d.hang -= frameDT; const r = 2.2 * (1 - Math.max(0, d.hang) / 1.6) + 1; tc.beginPath(); tc.ellipse(d.x, d.y + r, r * 0.8, r * 1.2, 0, 0, TAU); tc.fill(); continue; }
    d.v += 1400 * frameDT; d.y += d.v * frameDT;
    tc.fillRect(d.x - 0.9, d.y - 6, 1.8, 7);
    if (d.y > sc.yB && d.y < sc.yB + 20) { splashes.push({ x: d.x, y: sc.yB, t: 0 }); d.dead = true; }
    else if (d.y > H) d.dead = true;
  }
  drips = drips.filter(d => !d.dead);
  // splashes on the bottom pipe and the ground
  tc.strokeStyle = 'rgba(200,215,240,0.6)'; tc.lineWidth = unit;
  for (const s of splashes) { s.t += frameDT; const k = s.t / 0.25; tc.globalAlpha = 1 - k; tc.beginPath(); tc.ellipse(s.x, s.y, 2 + 9 * k, 1 + 4 * k, 0, Math.PI, TAU); tc.stroke(); }
  tc.globalAlpha = 1; splashes = splashes.filter(s => s.t < 0.25);
  if (Math.random() < frameDT * 18) splashes.push({ x: rand(0, W), y: sc.yB, t: 0 });   // rain hitting the pipe
  // near rain, big and fast, in front of everything
  drawRain(tc, rainNear, unit, 1.6);
}
