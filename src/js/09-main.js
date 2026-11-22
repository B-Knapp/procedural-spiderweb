// Main loop, keyboard controls, boot.
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
// test hooks (tools/smoke-test.js), only with ?debug in the URL
if (qs.has('debug')) window.__ow = {
  S, view, CFG, stats, wind, step, render, spawnBug: t => spawnBug(t), reset: () => { newScene(); brain = lifeCycle(); },
  get edges() { return edges; }, get nodes() { return nodes; }, get radii() { return radii; }, get bugs() { return bugs; },
  get caption() { return caption; }, get simTime() { return simTime; }, geom: () => geom,
  get hour() { return hour; }, set hour(v) { hour = v; lastTintT = -1; },
};
requestAnimationFrame(frame);
