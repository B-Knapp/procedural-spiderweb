// Smoke test: runs a full web cycle headlessly, fast-forwarded, and checks each stage.
//   npm install playwright && npx playwright install chromium
//   node tools/smoke-test.js            (set CHROME=/path/to/chrome to use an installed browser)
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?debug&hour=12' + (process.env.WRITE ? '&write=1' : ''));
  await page.waitForTimeout(500);
  await page.keyboard.press('Space'); // pause the page's own clock; the test drives the simulation

  const r = await page.evaluate(() => {
    const o = window.__ow, seen = new Set(), out = {};
    const run = (until, maxSim) => { const t0 = o.simTime; while (o.simTime - t0 < maxSim) { o.step(0.5); seen.add(o.caption.t); if (until()) return true; } return false; };
    out.built = run(() => o.caption.t.startsWith('Waiting'), 4000);
    out.stages = [...seen];
    out.radii = o.radii.length;
    out.capture = o.edges.filter(e => e.alive && e.type === 'capture').length;
    out.aux = o.edges.filter(e => e.alive && e.type === 'aux').length;
    let wrapped = false;
    for (let i = 0; i < 6 && !wrapped; i++) {
      o.spawnBug(i % 2 ? 'moth' : 'fly');
      const t0 = o.simTime;
      while (o.simTime - t0 < 120 && !wrapped) { o.step(0.1); if (o.bugs.some(b => b.state === 'hung')) wrapped = true; }
    }
    out.wrapped = wrapped;
    out.rebuilt = run(() => o.caption.t.startsWith('Bridge'), 8000);
    return out;
  });

  const need = ['Bridge line', 'Loose thread', 'Proto-hub', 'Frame threads', 'Radii', 'Hub', 'Temporary spiral', 'Capture spiral', 'Waiting at the hub'];
  const checks = [
    ['web finished', r.built],
    ['every stage ran', need.every(s => r.stages.includes(s))],
    ['20+ radii', r.radii >= 20],
    ['sticky spiral laid (300+ segments)', r.capture >= 300],
    ['temporary spiral eaten', r.aux === 0],
    ['prey caught, wrapped and hung at the hub', r.wrapped],
    ['web taken down and a new one started', r.rebuilt],
    ['no errors or warnings', errors.length === 0],
  ];
  for (const [name, ok] of checks) console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (errors.length) console.log(errors.slice(0, 10).join('\n'));
  console.log(JSON.stringify({ radii: r.radii, capture: r.capture, stages: r.stages }));
  await browser.close();
  process.exit(checks.every(c => c[1]) ? 0 : 1);
})();
