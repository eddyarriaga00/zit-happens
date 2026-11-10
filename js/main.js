import { Pimple, TYPES } from './pimple.js';
import { FX } from './fx.js';
import { SKIN_TONES, renderSkin } from './skin.js';
import * as audio from './audio.js';
import { buzz, setHapticsEnabled } from './haptics.js';
import * as store from './storage.js';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

let save = store.load();
audio.setSoundEnabled(save.settings.sound);
setHapticsEnabled(save.settings.haptics);

const G = {
  mode: 'demo',          // 'demo' (behind menu) | 'level' | 'zen'
  level: 1,
  score: 0,
  combo: 0,
  pimples: [],
  fx: new FX(),
  skin: null,
  seed: 1,
  W: 0, H: 0, dpr: 1, scale: 1,
  safeTop: 0, safeBottom: 0,
  paused: false,
  shake: 0,
  time: 0,
  spawnQueue: [],        // [{t, type}]
  zenTimer: 0,
  allDone: false,
  ended: false,
  stats: null,
  // callbacks used by pimples
  onPop, onDrain, onFinish,
};

function freshStats() {
  return { pops: 0, perfects: 0, nices: 0, ouches: 0, pus: 0, total: 0 };
}

// ---------------------------------------------------------------- sizing
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
document.body.appendChild(probe);

function resize() {
  const W = window.innerWidth, H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cs = getComputedStyle(probe);
  G.safeTop = parseFloat(cs.paddingTop) || 0;
  G.safeBottom = parseFloat(cs.paddingBottom) || 0;
  const changed = W !== G.W || H !== G.H || dpr !== G.dpr;
  G.W = W; G.H = H; G.dpr = dpr;
  G.scale = Math.max(1.05, Math.min(2, Math.min(W, H) / 390 * 1.3)); // pimple size; bigger = easier to hit
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (changed) G.skin = renderSkin(W, H, dpr, SKIN_TONES[save.settings.skin] || SKIN_TONES[1], G.seed);
  for (const p of G.pimples) {
    p.x = Math.min(Math.max(p.x, p.r * 2), W - p.r * 2);
    p.y = Math.min(Math.max(p.y, playTop() + p.r * 2), playBottom() - p.r * 2);
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const playTop = () => G.safeTop + 80;
const playBottom = () => G.H - G.safeBottom - 40;

// ---------------------------------------------------------------- spawning
function placePimple(type) {
  const T = TYPES[type];
  const rMax = T.r[1] * G.scale;
  const margin = rMax * 2.6 + 10;
  for (let tries = 0; tries < 80; tries++) {
    const x = margin + Math.random() * (G.W - margin * 2);
    const y = playTop() + margin + Math.random() * (playBottom() - playTop() - margin * 2);
    let ok = true;
    for (const o of G.pimples) {
      if (o.state === 'done' && o.heal > 0.7) continue;
      const need = (o.r + rMax) * 2.4 + 28;
      if (Math.hypot(o.x - x, o.y - y) < need) { ok = false; break; }
    }
    if (ok) {
      const p = new Pimple(type, x, y, G.scale);
      G.pimples.push(p);
      if (G.stats) G.stats.total++;
      return p;
    }
  }
  return null;
}

function rollType(level, counts) {
  const r = Math.random();
  if (level >= 2 && r < 0.06) return 'gold';
  const maxCysts = level >= 3 ? 1 + Math.floor((level - 3) / 3) : 0;
  if (counts.cyst < maxCysts && Math.random() < 0.22) return 'cyst';
  if (level >= 2 && Math.random() < 0.35) return 'black';
  return 'white';
}

function levelPlan(level) {
  const count = Math.min(4 + level, 14);
  const counts = { cyst: 0 };
  const types = [];
  for (let i = 0; i < count; i++) {
    const t = rollType(level, counts);
    if (t === 'cyst') counts.cyst++;
    types.push(t);
  }
  // make sure a new type shows up on the level it is introduced
  if (level === 2 && !types.includes('black')) types[0] = 'black';
  if (level === 3 && !types.includes('cyst')) types[0] = 'cyst';
  const breakouts = level >= 4 ? Math.min(5, Math.floor((level - 2) / 2)) : 0;
  const later = [];
  for (let i = 0; i < breakouts; i++) later.push(rollType(level, counts));
  return { types, later };
}

function newScene(seed) {
  G.seed = seed;
  G.pimples = [];
  G.fx.reset();
  G.skin = renderSkin(G.W, G.H, G.dpr, SKIN_TONES[save.settings.skin] || SKIN_TONES[1], seed);
  G.allDone = false;
  G.ended = false;
  G.spawnQueue = [];
  G.time = 0;
}

function startLevel(n) {
  G.mode = 'level';
  G.level = n;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(n * 7919 + 13);
  const plan = levelPlan(n);
  plan.types.forEach((t, i) => G.spawnQueue.push({ t: 0.25 + i * 0.12, type: t }));
  plan.later.forEach((t, i) => G.spawnQueue.push({ t: 6 + i * 4 + Math.random() * 2, type: t, breakout: true }));
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast(n === 1 ? 'Press & hold a pimple 👆' : n === 2 ? 'Blackheads are quick!' : n === 3 ? 'Cysts need 3 squeezes' : `Patient #${n}`, 2200);
}

function startZen() {
  G.mode = 'zen';
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(Math.floor(Math.random() * 1e9));
  for (let i = 0; i < 6; i++) G.spawnQueue.push({ t: 0.2 + i * 0.15, type: rollType(5, { cyst: 0 }) });
  G.zenTimer = 0;
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast('Zen mode — no rush 🌿', 1800);
}

function startDemo() {
  G.mode = 'demo';
  G.stats = null;
  newScene(Math.floor(Math.random() * 1e9));
  ['white', 'white', 'black', 'cyst', 'white', 'gold'].forEach((t, i) => G.spawnQueue.push({ t: 0.3 + i * 0.2, type: t }));
  $('hud').classList.add('hidden');
  $('btn-finish').classList.add('hidden');
}

// ---------------------------------------------------------------- scoring callbacks
const mult = () => Math.min(3, 1 + G.combo * 0.25);

function onPop(p) {
  if (G.mode === 'demo') return;
  G.stats.pops++;
  G.shake = Math.min(10, 3 + p.r * 0.25);
  const pts = Math.round(p.T.popPts * mult());
  G.score += pts;
  G.fx.text(p.x, p.y - p.r * 2.2, p.T.golden ? `LUCKY +${pts}` : `+${pts}`, p.T.golden ? '#ffd84d' : '#fff', p.T.golden ? 26 : 20);
  if (p.T.golden) audio.sparkle();
}

function onDrain(p, amt) {
  if (G.mode === 'demo') return;
  G.stats.pus += amt;
  G.score += amt * 40;
}

function onFinish(p, rating) {
  if (G.mode === 'demo') return;
  const y = p.y - p.r * 2.6;
  if (rating === 'perfect') {
    G.combo++;
    G.stats.perfects++;
    const pts = Math.round(150 * mult());
    G.score += pts;
    G.fx.text(p.x, y, `PERFECT! +${pts}`, '#8dffa8', 24);
    G.fx.sparkleBurst(p.x, p.y, 10);
    audio.perfect();
  } else if (rating === 'nice') {
    G.stats.nices++;
    G.score += 50;
    G.fx.text(p.x, y, 'Nice +50', '#d7f59a', 20);
  } else {
    G.combo = 0;
    G.stats.ouches++;
    G.score = Math.max(0, G.score - 50);
    G.fx.text(p.x, y, 'OUCH! −50', '#ff6b78', 24);
  }
  save.totalPops++;
  save.totalPus += p.pusDrained;
  if (rating === 'perfect') save.perfects++;
  if (rating === 'ouch') save.ouches++;
  if (G.mode === 'zen') save.zenPops++;
  store.save(save);
}

// ---------------------------------------------------------------- level flow
function checkLevelDone() {
  if (G.mode !== 'level' || G.allDone || G.ended) return;
  if (G.spawnQueue.length) return;
  if (G.pimples.every((p) => p.state === 'done')) {
    G.allDone = true;
    if (G.fx.cleanliness() >= 0.985) {
      setTimeout(endLevel, 900);
    } else {
      $('btn-finish').classList.remove('hidden');
      toast('All popped! Swipe to wipe up for a bonus ✨', 2600);
    }
  }
}

function endLevel() {
  if (G.ended || G.mode !== 'level') return;
  G.ended = true;
  $('btn-finish').classList.add('hidden');
  const s = G.stats;
  const clean = G.fx.cleanliness();
  const cleanBonus = Math.round(clean * 300);
  G.score += cleanBonus;
  const perfectRatio = s.total ? s.perfects / s.total : 0;
  const stars = 1 + (clean >= 0.85 ? 1 : 0) + (perfectRatio >= 0.6 && s.ouches === 0 ? 1 : 0);
  const score = Math.round(G.score);

  save.level = Math.max(save.level, G.level + 1);
  save.bestScore = Math.max(save.bestScore, score);
  save.levelsCleared++;
  save.stars[G.level] = Math.max(save.stars[G.level] || 0, stars);
  store.save(save);

  $('res-title').textContent = ['', 'Patient survived', 'Lookin\' good!', 'Squeaky clean!'][stars];
  [...$('res-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  $('res-grid').innerHTML = [
    stat(score.toLocaleString(), 'score'),
    stat(`${s.perfects}/${s.total}`, 'perfect pops'),
    stat(`${s.pus.toFixed(1)} ml`, 'pus drained'),
    stat(`${Math.round(clean * 100)}%`, `clean (+${cleanBonus})`),
  ].join('');
  audio.fanfare();
  buzz('medium');
  setTimeout(() => showScreen('results'), 400);
}

function stat(v, label) { return `<div class="stat"><b>${v}</b><span>${label}</span></div>`; }

// ---------------------------------------------------------------- input
const pointers = new Map(); // pointerId → { kind, p?, x, y }

function pimpleAt(x, y) {
  let best = null, bestD = Infinity;
  for (const p of G.pimples) {
    if (!p.grabbable || p.held != null) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < p.hitRadius() && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audio.unlock();
  if (G.mode === 'demo' || G.paused || G.ended) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  const x = e.clientX, y = e.clientY;
  const p = pimpleAt(x, y);
  if (p) {
    p.press(e.pointerId);
    pointers.set(e.pointerId, { kind: 'pimple', p, x, y });
  } else {
    pointers.set(e.pointerId, { kind: 'wipe', x, y });
    wipeAt(x, y, 0);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  const x = e.clientX, y = e.clientY;
  if (ptr.kind === 'wipe') {
    const dist = Math.hypot(x - ptr.x, y - ptr.y);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i <= steps; i++) {
      wipeAt(ptr.x + (x - ptr.x) * (i / steps), ptr.y + (y - ptr.y) * (i / steps), dist);
    }
  }
  ptr.x = x; ptr.y = y;
});

function endPointer(e) {
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  pointers.delete(e.pointerId);
  if (ptr.kind === 'pimple' && ptr.p.held === e.pointerId) {
    ptr.p.release(G);
    checkLevelDone();
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

function releaseAll() {
  for (const [id, ptr] of pointers) {
    if (ptr.kind === 'pimple' && ptr.p.held === id) ptr.p.release(G);
  }
  pointers.clear();
  audio.oozeStop();
}

function wipeAt(x, y, speed) {
  G.fx.addTrail(x, y);
  const cleaned = G.fx.wipe(x, y, 24 * G.scale, 0.22);
  if (cleaned > 0) {
    audio.wipe(Math.min(1, speed / 40));
    if (Math.random() < 0.3) buzz('light');
  }
  if (G.allDone && !G.ended && G.fx.cleanliness() >= 0.985) {
    G.fx.sparkleBurst(x, y, 14);
    audio.sparkle();
    endLevel();
  }
}

// iOS: block pinch-zoom & double-tap zoom gestures
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseAll();
    if (G.mode !== 'demo' && !G.ended && currentScreen === null) pause();
  }
});

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.paused) update(dt);
  render();
  requestAnimationFrame(frame);
}

function update(dt) {
  G.time += dt;

  for (let i = G.spawnQueue.length - 1; i >= 0; i--) {
    const s = G.spawnQueue[i];
    if (G.time >= s.t) {
      G.spawnQueue.splice(i, 1);
      const p = placePimple(s.type);
      if (p && s.breakout) G.fx.text(p.x, p.y - 40, 'breakout!', '#ffb3c1', 16);
    }
  }

  if (G.mode === 'zen') {
    const active = G.pimples.filter((p) => p.state !== 'done').length;
    G.zenTimer += dt;
    if (active < 6 && G.zenTimer > 1.4 && !G.spawnQueue.length) {
      G.zenTimer = 0;
      placePimple(rollType(6, { cyst: G.pimples.filter((p) => p.type === 'cyst' && p.state !== 'done').length }));
    }
    // fully healed pimples fade away in zen
    G.pimples = G.pimples.filter((p) => !(p.state === 'done' && p.heal >= 1));
  }

  for (const p of G.pimples) p.update(dt, G);
  G.fx.update(dt);
  G.shake *= Math.pow(0.001, dt);
  if (G.shake < 0.2) G.shake = 0;

  updateHud();
}

function render() {
  const { dpr, W, H } = G;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.skin) ctx.drawImage(G.skin, 0, 0, W, H);
  else { ctx.fillStyle = '#eec1a2'; ctx.fillRect(0, 0, W, H); }

  ctx.save();
  if (G.shake) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  // healed/done pimples first so active ones draw on top
  for (const p of G.pimples) if (p.state === 'done') p.draw(ctx, G.time);
  G.fx.drawSplats(ctx);
  for (const p of G.pimples) if (p.state !== 'done') p.draw(ctx, G.time);
  for (const p of G.pimples) p.drawRing(ctx, G.time);
  G.fx.drawAir(ctx);
  ctx.restore();
}

// ---------------------------------------------------------------- HUD & screens
let hudCache = {};
function setText(id, v) {
  if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; }
}
function updateHud() {
  if (G.mode === 'demo') return;
  setText('hud-score', Math.round(G.score).toLocaleString());
  setText('hud-combo', G.combo >= 2 ? `combo ×${mult().toFixed(2).replace(/\.?0+$/, '')}` : '');
  if (G.mode === 'level') {
    setText('hud-title', `Level ${G.level}`);
    const left = G.pimples.filter((p) => p.state !== 'done').length + G.spawnQueue.length;
    setText('hud-sub', G.allDone ? `${Math.round(G.fx.cleanliness() * 100)}% clean` : `${left} left`);
  } else {
    setText('hud-title', 'Zen');
    setText('hud-sub', `${G.stats.pops} popped`);
  }
}

let toastTimer = null;
function toast(msg, ms = 1600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

const SCREENS = ['menu', 'howto', 'stats', 'settings', 'pause', 'results'];
let currentScreen = 'menu';
let screenReturn = 'menu';
function showScreen(name) {
  currentScreen = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  if (name === 'menu') {
    $('play-level').textContent = `Level ${save.level}`;
  }
}

function pause() {
  G.paused = true;
  releaseAll();
  showScreen('pause');
}

function goMenu() {
  releaseAll();
  G.paused = false;
  startDemo();
  showScreen('menu');
}

function renderStats() {
  const starsTotal = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('stats-grid').innerHTML = [
    stat(save.totalPops.toLocaleString(), 'pimples popped'),
    stat(`${save.totalPus.toFixed(1)} ml`, 'pus drained'),
    stat(save.perfects.toLocaleString(), 'perfect pops'),
    stat(save.ouches.toLocaleString(), 'ouchies'),
    stat(save.level - 1, 'levels cleared'),
    stat(starsTotal, 'stars earned'),
    stat(save.bestScore.toLocaleString(), 'best score'),
    stat(save.zenPops.toLocaleString(), 'zen pops'),
  ].join('');
}

function renderSettings() {
  $('set-sound').checked = save.settings.sound;
  $('set-haptics').checked = save.settings.haptics;
  const wrap = $('skin-tones');
  wrap.innerHTML = '';
  SKIN_TONES.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === save.settings.skin ? ' active' : '');
    b.style.background = `radial-gradient(circle at 35% 30%, ${t.base}, ${t.shade})`;
    b.setAttribute('aria-label', t.name);
    b.onclick = () => {
      save.settings.skin = i;
      store.save(save);
      G.skin = renderSkin(G.W, G.H, G.dpr, t, G.seed);
      renderSettings();
    };
    wrap.appendChild(b);
  });
}

function on(id, fn) {
  $(id).addEventListener('click', (e) => {
    audio.unlock();
    audio.click();
    fn(e);
  });
}

on('btn-play', () => startLevel(save.level));
on('btn-zen', () => startZen());
on('btn-stats', () => { renderStats(); showScreen('stats'); });
on('btn-howto', () => { screenReturn = currentScreen; showScreen('howto'); });
on('btn-settings', () => { renderSettings(); showScreen('settings'); });
on('btn-pause', () => pause());
on('btn-resume', () => { G.paused = false; showScreen(null); });
on('btn-restart', () => (G.mode === 'zen' ? startZen() : startLevel(G.level)));
on('btn-quit', () => goMenu());
on('btn-next', () => startLevel(save.level));
on('btn-res-menu', () => goMenu());
on('btn-finish', () => endLevel());
document.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => {
  audio.click();
  showScreen(currentScreen === 'howto' ? screenReturn : 'menu');
}));

$('set-sound').addEventListener('change', (e) => {
  save.settings.sound = e.target.checked;
  audio.setSoundEnabled(save.settings.sound);
  store.save(save);
});
$('set-haptics').addEventListener('change', (e) => {
  save.settings.haptics = e.target.checked;
  setHapticsEnabled(save.settings.haptics);
  store.save(save);
  if (e.target.checked) buzz('medium');
});
on('btn-reset', () => {
  if (confirm('Reset all progress and stats?')) {
    const settings = save.settings;
    save = store.reset();
    save.settings = settings;
    store.save(save);
    renderSettings();
    toast('Progress reset');
  }
});

// ---------------------------------------------------------------- boot
resize();
startDemo();
showScreen('menu');
if (!localStorage.getItem('zit-seen-howto')) {
  try { localStorage.setItem('zit-seen-howto', '1'); } catch {}
  screenReturn = 'menu';
  showScreen('howto');
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console
window.__zit = G;
G.step = (dt) => { update(dt); render(); }; // advance one frame by hand (testing)
