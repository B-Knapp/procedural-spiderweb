// Config (URL params, saved settings) and small math helpers.
// ============================================================ config
const W = 1920, H = 1080, HZ = 640, SEG = 48;
const qs = new URLSearchParams(location.search);
const SPEEDS = [0.5, 1, 2, 4, 8, 16];
const CFG = {
  speedIdx: SPEEDS.indexOf(+qs.get('speed')) >= 0 ? SPEEDS.indexOf(+qs.get('speed')) : 2,
  pixel: false, captions: true, bigSpider: false, dayMinutes: 60, PX: 3,
};
try { const s = JSON.parse(localStorage.getItem('orbweaver') || '{}'); if (s.pixel != null) CFG.pixel = s.pixel; if (s.captions != null) CFG.captions = s.captions; if (s.bigSpider != null) CFG.bigSpider = s.bigSpider; } catch (e) {}
if (qs.get('big') != null) CFG.bigSpider = qs.get('big') === '1';
if (qs.get('pixel') != null) CFG.pixel = qs.get('pixel') === '1';
const saveCfg = () => { try { localStorage.setItem('orbweaver', JSON.stringify({ pixel: CFG.pixel, captions: CFG.captions, bigSpider: CFG.bigSpider })); } catch (e) {} };

// ============================================================ math
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a), randi = (a, b) => Math.floor(rand(a, b + 1));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const NT = new Float32Array(4096); for (let i = 0; i < 4096; i++) NT[i] = Math.random() * 2 - 1;
const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return NT[i & 4095] * (1 - u) + NT[(i + 1) & 4095] * u; };
const hash1 = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const median = arr => { const s = [...arr].sort((a, b) => a - b); return s[s.length >> 1]; };
const smooth = t => t * t * (3 - 2 * t);
