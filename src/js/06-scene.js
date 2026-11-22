// The farm: palette by time of day, painted landscape, barn, fence, grass, sky.
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
