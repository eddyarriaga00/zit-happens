import { Pimple, TYPES, tuning, setPusStyle } from './pimple.js';
import { CHAPTERS, LEVELS, levelDef, goalLabel, goalMet, timeGoal, UPGRADES, PUS_STYLES, ALL_ZONES, rewardFor, TOOL_LEVEL } from './levels.js';
import { lookFor, portraitURL } from './faces.js';
import { renderFaceScene, drawLids } from './facescene.js';
import { FX } from './fx.js';
import { Ear } from './ear.js';
import { Treatment } from './steps.js';
import { Supplies } from './supplies.js';
import { ToolFX } from './tools.js';
import { SKIN_TONES, renderSkin, zoneBlocked, ZONE_NAMES } from './skin.js';
import * as audio from './audio.js';
import { buzz, setHapticsEnabled } from './haptics.js';
import * as store from './storage.js';

// ---------------------------------------------------------------- setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const toolfx = new ToolFX();

let save = store.load();
audio.setSoundEnabled(save.settings.sound);
setHapticsEnabled(save.settings.haptics);

const up = (id) => save.upgrades[id] || 0;       // shop upgrade level
const tone = () => G.tone || SKIN_TONES[save.settings.skin] || SKIN_TONES[1];
// (re)paint the close-up skin for the current patient, body area and screen size
const FACE_ZONES = ['forehead', 'nose', 'cheek', 'chin'];
const FACE_SCALE = 0.72;      // pimples are smaller when the whole face is on screen
function paintSkin() {
  if (FACE_ZONES.includes(G.zone)) {
    // the whole face, with the breakout mostly in one area of it
    const scene = renderFaceScene(G.W, G.H, G.dpr, tone(), G.seed, G.look, playTop(), playBottom());
    G.skin = scene.canvas;
    G.geo = scene.geo;
  } else {
    G.geo = null;
    G.skin = renderSkin(G.W, G.H, G.dpr, tone(), G.seed, G.zone, G.look);
  }
  G.scale = G.baseScale * (G.geo ? FACE_SCALE : 1);
}

// ---- a reward for every level: tools first, then patches, upgrades, coins, pus styles
const toolUnlocked = (id) => save.level > (TOOL_LEVEL[id] || 0);
function grantReward(n) {
  if (save.rewards[n]) return null;
  save.rewards[n] = true;
  const r = rewardFor(n);
  let note = r.desc;
  if (r.kind === 'coins') save.coins += r.n;
  else if (r.kind === 'upgrade') {
    const u = UPGRADES.find((x) => x.id === r.id);
    if (up(r.id) < u.costs.length) save.upgrades[r.id] = up(r.id) + 1;
    else { save.coins += 300; note = 'Already maxed, so here are 300 coins instead'; }
  } else if (r.kind === 'pus' && !save.pusOwned.includes(r.id)) save.pusOwned.push(r.id);
  return { ...r, desc: note };
}
// players from before rewards existed get the ones they already earned
for (let n = 1; n < save.level; n++) grantReward(n);
store.save(save);

const applyPus = () => setPusStyle((PUS_STYLES.find((p) => p.id === save.pus) || PUS_STYLES[0]).color);

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
  onPop, onDrain, onFinish, onEarPull,
  ear: null,
  sup: null,             // the supplies on the tray (bottles, wipes, pads, bin)
  treat: null,           // spa steps (lather, rinse, steam, soothe) when enabled
  plan: null,
  onStepDone,
  spawnNow: (type) => placePimple(type) || G.spawnQueue.push({ t: G.time + 1, type }),   // no room yet: retry
  zone: null,            // which body area this close-up is
  geo: null,             // face levels: where the eyes, lips, hair are
  baseScale: 1,
  blinkT: 2, blinkA: 0, wince: 0,
  look: null,            // the patient's hair, brows, stubble...
  tool: 'finger',        // finger | extractor | needle | tweezers | pad | spray | patch
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
  G.baseScale = Math.max(1.05, Math.min(2, Math.min(W, H) / 390 * 1.3)); // pimple size; bigger = easier to hit
  G.scale = G.baseScale * (G.geo ? FACE_SCALE : 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  if (changed) paintSkin();
  for (const p of G.pimples) {
    p.x = Math.min(Math.max(p.x, p.r * 2), W - p.r * 2);
    p.y = Math.min(Math.max(p.y, playTop() + p.r * 2), playBottom() - p.r * 2);
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

const playTop = () => G.safeTop + 80;
const playBottom = () => G.H - G.safeBottom - (G.mode === 'ear' ? 40 : 108);  // leave room for the tool bar

// ---------------------------------------------------------------- spawning
function placePimple(type) {
  const T = TYPES[type];
  const rMax = T.r[1] * G.scale;
  const margin = rMax * 2.6 + 10;
  for (let tries = 0; tries < 80; tries++) {
    let x, y;
    if (G.geo) {
      // mostly in the trouble area, the rest scattered over the face
      const spot = tries < 55 && Math.random() < 0.7 ? G.geo.zonePoint(G.zone) : G.geo.anyPoint();
      x = spot.x; y = spot.y;
    } else {
      x = margin + Math.random() * (G.W - margin * 2);
      y = playTop() + margin + Math.random() * (playBottom() - playTop() - margin * 2);
    }
    // keep the bottom corners free for the pad jar and the bin
    let ok = !(y > playBottom() - 100 && (x < 100 || x > G.W - 104)) && !(G.geo ? G.geo.blocked(x, y, rMax * 0.9) : G.zone && zoneBlocked(G.zone, x, y, G.W, G.H));
    for (const o of G.pimples) {
      if (o.state === 'done') continue;
      const need = (o.r + rMax) * (G.geo ? 1.7 : 2.0) + (G.geo ? 14 : 22);
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
  if (level >= 2 && r < 0.06 + 0.03 * up('lucky')) return 'gold';
  if (level >= 4 && Math.random() < 0.14) return 'hair';
  const maxCysts = level >= 3 ? 1 + Math.floor((level - 3) / 3) : 0;
  if (counts.cyst < maxCysts && Math.random() < 0.22) return 'cyst';
  if (level >= 2 && Math.random() < 0.35) return 'black';
  return 'white';
}

const MAX_AT_ONCE = 10;
function levelPlan(level) {
  const def = levelDef(level);
  if (!def.mix) return randomPlan(Math.min(level, 20));
  let types = [];
  for (const [t, c] of Object.entries(def.mix)) for (let i = 0; i < c; i++) types.push(t);
  types = types.map((t) => (t === 'white' && Math.random() < 0.04 * up('lucky') ? 'gold' : t));
  types.sort(() => Math.random() - 0.5);
  types.sort((a, b) => (b === 'boss') - (a === 'boss'));   // the big one gets first pick of space
  // too many to fit at once: the rest break out as space frees up
  const later = types.splice(MAX_AT_ONCE);
  for (let i = 0; i < (def.later || 0); i++) later.push(rollType(Math.min(level, 8), { cyst: 99 }));
  return { types, later };
}

function randomPlan(level) {
  const count = Math.min(4 + level, MAX_AT_ONCE);
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
  if (level === 4 && !types.includes('hair')) types[0] = 'hair';
  const breakouts = level >= 4 ? Math.min(5, Math.floor((level - 2) / 2)) : 0;
  const later = [];
  for (let i = 0; i < breakouts; i++) later.push(rollType(level, counts));
  return { types, later };
}

function newScene(seed, def = null) {
  G.def = def;
  G.tone = def && def.mix ? SKIN_TONES[def.skin] : null;
  G.zone = G.mode === 'level' && def ? def.zone : G.mode === 'zen' ? ALL_ZONES[Math.floor(Math.random() * ALL_ZONES.length)] : null;
  G.look = lookFor(def || { name: `zen${seed}` });
  G.popTime = 0;
  G.maxCombo = 0;
  // let-go timing: Steady Hands upgrade widens it, sensitive skin narrows it
  const k = def && def.sensitive ? 0.6 : 1;
  tuning.perfect = (0.3 + 0.08 * up('steady')) * k;
  tuning.nice = (0.7 + 0.08 * up('steady')) * k;
  G.spaMult = 1 + 0.25 * up('spa');
  G.seed = seed;
  G.pimples = [];
  G.fx.reset();
  paintSkin();
  G.allDone = false;
  G.ended = false;
  G.spawnQueue = [];
  G.time = 0;
  G.ear = null;
  G.treat = null;
  G.sup = new Supplies(G);
}

function startLevel(n) {
  G.mode = 'level';
  G.level = n;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(n * 7919 + 13, levelDef(n));
  const plan = levelPlan(n);
  G.plan = plan;
  if (save.settings.steps) {
    // full treatment: wash first, the pimples come up during the steam
    G.treat = new Treatment(G);
    G.treat.start('lather');
    addDirt();
  } else {
    plan.types.forEach((t, i) => G.spawnQueue.push({ t: 0.25 + i * 0.12, type: t }));
    queueBreakouts();
  }
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  if (G.treat) toast('Step 1: Open the cleanser, pump it, then rub 🫧', 3400);
  else toast(toolHint(n), 2800);
}

const toolHint = (n) => (n === 1 ? 'Hold a pimple — or pinch it with 2 fingers 🤏' : n === 2 ? 'Blackheads: try the Loop tool' : n === 3 ? 'Cysts are deep — Needle them first' : n === 4 ? 'Ingrown hairs: pull with Tweezers' : n === 5 ? 'New tool: Spray disinfects popped spots' : n === 6 ? 'New tool: stick a Patch on popped spots' : `Patient #${n}`);

function queueBreakouts() {
  G.plan.later.forEach((t, i) => G.spawnQueue.push({ t: G.time + 3 + i * 2.5 + Math.random(), type: t, breakout: true }));
}

// grime to wash off in the first step
function addDirt() {
  for (let i = 0; i < 18; i++) {
    const r = (4 + Math.random() * 8) * G.scale;
    G.fx.addSplat({
      kind: 'drop', ...(G.geo ? G.geo.anyPoint() : { x: 20 + Math.random() * (G.W - 40), y: playTop() + Math.random() * (G.H - playTop() - 40) }),
      rx: r * (1 + Math.random()), ry: r, rot: Math.random() * 3, bx: r * 2,
      color: Math.random() < 0.6 ? '#6f5340' : '#3d3a37', alpha: 0.2 + Math.random() * 0.2, mass: 1,
    });
  }
}

const STEP_BONUS = 100;
function onStepDone(phase) {
  G.score += STEP_BONUS;
  G.fx.text(G.W / 2, G.H * 0.4, `step done! +${STEP_BONUS}`, '#8dffa8', 22);
  G.fx.sparkleBurst(G.W / 2, G.H * 0.4, 12);
  audio.perfect();
  buzz('medium');
  if (phase === 'lather') {
    G.treat.start('rinse');
    toast('Now open the wipes, pull one out and wipe the foam off 💦', 3400);
  } else if (phase === 'rinse') {
    G.fx.reset();
    G.treat.start('steam');
    toast('Step 2: Switch the steamer on, then press and hold ♨️', 3400);
  } else if (phase === 'steam') {
    G.treat.start('pop');
    queueBreakouts();
    refreshTools();
    toast(`Step 3: Pop! ${toolHint(G.level)}`, 3000);
  } else if (phase === 'soothe') {
    toast('Glowing ✨', 1500);
    setTimeout(endLevel, 1000);
  }
}

// after the popping (and wiping): on to the soothing gel, or straight to results
function afterWipe() {
  if (!G.treat) return endLevel();
  if (G.treat.phase === 'soothe' || G.ended) return;
  $('btn-finish').classList.add('hidden');
  releaseAll();
  G.cleanAtWipe = G.fx.cleanliness();
  G.treat.start('soothe');
  refreshTools();
  toast('Step 5: Open the gel, squeeze some out, spread it 🌿', 3400);
}

function startZen() {
  G.mode = 'zen';
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(Math.floor(Math.random() * 1e9));
  for (let i = 0; i < 6; i++) G.spawnQueue.push({ t: 0.2 + i * 0.15, type: rollType(Math.min(6, save.level), { cyst: 0 }) });
  G.zenTimer = 0;
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast('Zen mode — no rush 🌿', 1800);
}

function startEar(n) {
  G.mode = 'ear';
  G.level = n;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(n * 104729 + 7);
  G.ear = new Ear(G, n, playTop(), playBottom(), tone());
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast(n === 1 ? 'Hold wax to loosen it, then drag it out 👂' : n === 2 ? 'Careful — don\'t poke the eardrum!' : `Ear #${n}`, 2600);
}

function onEarPull() {
  save.earWax++;
  store.save(save);
  if (G.ear.left > 0 || G.allDone) return;
  G.allDone = true;
  if (G.fx.cleanliness() >= 0.985) {
    setTimeout(endEar, 900);
  } else {
    $('btn-finish').textContent = 'All done ✨ Finish';
    $('btn-finish').classList.remove('hidden');
    toast('All out! Swipe to wipe up the flakes ✨', 2600);
  }
}

function endEar() {
  if (G.ended || G.mode !== 'ear') return;
  G.ended = true;
  $('btn-finish').classList.add('hidden');
  const e = G.ear;
  const clean = G.fx.cleanliness();
  const cleanBonus = Math.round(clean * 300);
  G.score += cleanBonus;
  const stars = 1 + (clean >= 0.85 ? 1 : 0) + (e.ouches === 0 ? 1 : 0);
  const score = Math.round(G.score);
  save.earLevel = Math.max(save.earLevel, G.level + 1);
  save.bestScore = Math.max(save.bestScore, score);
  save.earsCleaned++;
  const earCoins = earnCoins(score, stars);
  $('res-goals').innerHTML = `<div class="coins-won">+${earCoins} 🪙</div>`;
  save.earStars[G.level] = Math.max(save.earStars[G.level] || 0, stars);
  store.save(save);
  $('res-title').textContent = ['', 'Hear that?', 'Clean ears!', 'Crystal clear!'][stars];
  [...$('res-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  $('res-grid').innerHTML = [
    stat(score.toLocaleString(), 'score'),
    stat(`${e.pulled}/${e.total}`, 'wax pulled'),
    stat(e.ouches, 'eardrum pokes'),
    stat(`${Math.round(clean * 100)}%`, `clean (+${cleanBonus})`),
  ].join('');
  $('btn-next').firstChild.textContent = 'Next ear';
  audio.fanfare();
  buzz('medium');
  setTimeout(() => showScreen('results'), 400);
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
  G.wince = Math.max(G.wince, 0.28);
  G.shake = Math.min(10, 3 + p.r * 0.25);
  const pts = Math.round(p.T.popPts * mult());
  G.score += pts;
  G.fx.text(p.x, p.y - p.r * 2.2, p.T.golden ? `LUCKY +${pts}` : `+${pts}`, p.T.golden ? '#ffd84d' : '#fff', p.T.golden ? 26 : 20);
  if (p.T.golden) audio.sparkle();
  if (save.pus === 'glitter') G.fx.sparkleBurst(p.x, p.y, 8);
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
    G.maxCombo = Math.max(G.maxCombo, G.combo);
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
    G.wince = 1.1;
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
      setTimeout(afterWipe, 900);
    } else {
      $('btn-finish').textContent = G.treat ? 'Next step →' : 'All done ✨ Finish';
      $('btn-finish').classList.remove('hidden');
      document.querySelector('#tools [data-tool="pad"]').click();   // hand them the cotton pads
      toast(G.treat ? 'Step 4: Open the cotton pads and wipe up ✨' : 'All popped! Grab a cotton pad and wipe up ✨', 3200);
    }
  }
}

function endLevel() {
  if (G.ended || G.mode !== 'level') return;
  G.ended = true;
  $('btn-finish').classList.add('hidden');
  const s = G.stats;
  const clean = G.treat ? (G.cleanAtWipe ?? 1) : G.fx.cleanliness();
  const cleanBonus = Math.round(clean * 300);
  G.score += cleanBonus;
  const def = G.def || levelDef(G.level);
  const result = { ouches: s.ouches, perfects: s.perfects, clean, popTime: G.popTime, maxCombo: G.maxCombo };
  const met = def.goals.map((g) => goalMet(g, result));
  const stars = 1 + met.filter(Boolean).length;
  const score = Math.round(G.score);
  const coins = earnCoins(score, stars);

  save.level = Math.max(save.level, G.level + 1);
  save.bestScore = Math.max(save.bestScore, score);
  save.levelsCleared++;
  save.stars[G.level] = Math.max(save.stars[G.level] || 0, stars);
  const reward = grantReward(G.level);
  store.save(save);

  $('btn-next').firstChild.textContent = 'Next patient';
  $('res-title').textContent = ['', 'Patient survived', 'Lookin\' good!', 'Squeaky clean!'][stars];
  [...$('res-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  $('res-grid').innerHTML = [
    stat(score.toLocaleString(), 'score'),
    stat(`${s.perfects}/${s.total}`, 'perfect pops'),
    stat(`${Math.round(clean * 100)}%`, `clean (+${cleanBonus})`),
    stat(`+${coins} 🪙`, 'coins earned'),
  ].join('');
  $('res-goals').innerHTML = `<img class="portrait small" alt="" src="${portraitURL(def, { mood: 'happy', clear: true }, 120)}">
  ${reward ? `<div class="reward"><b>🎁 New: ${reward.name}</b><span>${reward.desc}</span></div>` : ''}
  <ul class="goals">
    <li class="met"><span>★</span>Clear every pimple</li>
    ${def.goals.map((g, i) => `<li class="${met[i] ? 'met' : 'missed'}"><span>${met[i] ? '★' : '☆'}</span>${goalLabel(g)}</li>`).join('')}
  </ul>`;
  audio.fanfare();
  buzz('medium');
  setTimeout(() => showScreen('results'), 400);
}

function earnCoins(score, stars) {
  const coins = Math.round((score / 20 + stars * 20) * (1 + 0.15 * up('magnet')));
  save.coins += coins;
  store.save(save);
  return coins;
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
  const hit = G.sup.down(x, y, e.pointerId);   // a bottle, pack, jar, the bin, or a close-up
  if (hit === 'grab') {
    // pulled out a fresh wipe/pad: this finger carries on wiping with it
    G.sup.hand = { x, y };
    if (G.treat && G.treat.active) { pointers.set(e.pointerId, { kind: 'treat', x, y }); G.treat.holding++; }
    else pointers.set(e.pointerId, { kind: 'wipe', x, y, big: true });
    return;
  }
  if (hit) return idle(e.pointerId, x, y);
  if (G.treat && G.treat.active) {
    pointers.set(e.pointerId, { kind: 'treat', x, y });
    G.treat.down(x, y);
    return;
  }
  if (G.mode === 'ear') {
    if (G.ear.down(e.pointerId, x, y)) {
      pointers.set(e.pointerId, { kind: 'ear', x, y });
    } else {
      pointers.set(e.pointerId, { kind: 'wipe', x, y });
      wipeAt(x, y, 0);
    }
    return;
  }
  toolDown(e.pointerId, x, y);
});

function hint(p, msg) { G.fx.text(p.x, p.y - p.r * 2.4, msg, '#ffe7a8', 15); }
const idle = (id, x, y) => pointers.set(id, { kind: 'none', x, y });

function toolDown(id, x, y) {
  const p = pimpleAt(x, y);
  const tool = G.tool;
  if (tool === 'pad') {
    pointers.set(id, { kind: 'wipe', x, y, big: true });
    wipeAt(x, y, 0, true);
    return;
  }
  if (tool === 'spray') { spray(x, y); return idle(id, x, y); }
  if (tool === 'patch') { patchAt(x, y); return idle(id, x, y); }
  if (tool === 'needle') {
    toolfx.stab(x, y);
    if (p) hint(p, p.T.hair ? 'use the tweezers' : p.lance(G) ? 'lanced — now squeeze' : 'already open');
    return idle(id, x, y);
  }
  if (tool === 'tweezers') {
    if (p && p.T.hair) {
      p.held = id; p.fx = x; p.fy = y;
      buzz('light');
      pointers.set(id, { kind: 'tweeze', p, x, y });
      return;
    }
    if (p) hint(p, 'tweezers are for hairs');
    return idle(id, x, y);
  }
  if (p && p.T.hair) { hint(p, 'ingrown hair — use tweezers'); return idle(id, x, y); }
  if (tool === 'extractor') {
    if (!p) { pointers.set(id, { kind: 'wipe', x, y }); wipeAt(x, y, 0); return; }
    if ((p.type === 'cyst' || p.type === 'boss') && !p.lanced && p.state !== 'popped' && p.state !== 'empty') {
      hint(p, 'too deep — needle it first');
      return idle(id, x, y);
    }
    p.boost = (p.type === 'black' ? 5 : 2) * (1 + 0.25 * up('loop'));
    p.clean = true;
    p.tool = 'extractor';
    p.press(id);
    pointers.set(id, { kind: 'pimple', p, x, y });
    return;
  }
  // fingers
  if (p) { p.press(id); pointers.set(id, { kind: 'pimple', p, x, y }); return; }
  if (tryPinch(id, x, y)) return;
  pointers.set(id, { kind: 'wipe', x, y });
  wipeAt(x, y, 0);
}

// ---- aftercare tools
function spray(x, y) {
  toolfx.mist(x, y);
  audio.spritz();
  buzz('light');
  let n = 0;
  for (const p of G.pimples) {
    if (p.state !== 'done' || p.sanitized || Math.hypot(p.x - x, p.y - y) > 80) continue;
    p.sanitized = true;
    p.heal = Math.max(p.heal, 0.45);     // calms the redness right down
    G.score += 20;
    G.fx.text(p.x, p.y - p.r * 2 - n * 18, 'disinfected +20', '#bfe9ff', 15);
    n++;
  }
  if (n) audio.plip();
}

function patchAt(x, y) {
  let best = null, bestD = Infinity;
  for (const p of G.pimples) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < p.r * 1.3 + 26 && d < bestD) { best = p; bestD = d; }
  }
  if (!best) return;
  if (best.state !== 'done') return hint(best, 'pop it first');
  if (best.patch) return hint(best, 'already patched');
  const shapes = ['dot', ...(save.level > 6 ? ['heart'] : []), ...(save.level > 7 ? ['star'] : [])];
  best.patch = { shape: shapes[Math.floor(Math.random() * shapes.length)], rot: (Math.random() - 0.5) * 0.7, born: best.time };
  const pts = best.sanitized ? 50 : 30;
  G.score += pts;
  G.fx.text(best.x, best.y - best.r * 2.2, best.sanitized ? `clean & patched +${pts}` : `patched +${pts}`, '#ffd6e6', 16);
  audio.cap();
  buzz('medium');
}

// ---- two-finger squeeze
function tryPinch(id, x, y) {
  // a second finger landing beside a pimple that is already being pressed
  for (const [oid, o] of pointers) {
    if (o.kind === 'pimple' && !o.p.tool && Math.hypot(o.p.x - x, o.p.y - y) < o.p.r * 2 + 130) {
      return makePinch(o.p, oid, id, o.x, o.y, x, y, true);
    }
  }
  // two fingers on the skin either side of a pimple
  for (const [oid, o] of pointers) {
    if (o.kind !== 'wipe' || o.big) continue;
    if (Math.hypot(o.x - x, o.y - y) > 300) continue;
    const p = pimpleAt((o.x + x) / 2, (o.y + y) / 2);
    if (p && !p.T.hair) return makePinch(p, oid, id, o.x, o.y, x, y, false);
  }
  return false;
}

function makePinch(p, a, b, ax, ay, bx, by, already) {
  const pin = { p, a, b, d0: Math.max(40, Math.hypot(ax - bx, ay - by)), last: null };
  if (already) p.held = 'pinch'; else p.press('pinch');
  pointers.set(a, { kind: 'pinch', pin, x: ax, y: ay });
  pointers.set(b, { kind: 'pinch', pin, x: bx, y: by });
  updatePinch(pin);
  G.fx.text(p.x, p.y - p.r * 2.6, 'squeeze!', '#ffe7a8', 16);
  return true;
}

function updatePinch(pin) {
  const A = pointers.get(pin.a), B = pointers.get(pin.b);
  if (!A || !B) return;
  const d = Math.hypot(A.x - B.x, A.y - B.y);
  // actively pinching inward gives a burst of extra pressure
  if (pin.last != null && d < pin.last) pin.p.pump = Math.min(1, pin.p.pump + (pin.last - d) * 0.03);
  pin.last = d;
  pin.d0 = Math.max(pin.d0, d);
  const rel = 1 - d / pin.d0;                 // how far the fingers have closed
  const abs = 1 - (d - 60) / 160;             // how close together they are
  const amt = Math.max(0, Math.min(1, Math.max(rel, abs)));
  pin.p.boost = 1.3 + 1.2 * amt;
  pin.p.pinch = { angle: Math.atan2(B.y - A.y, B.x - A.x), amt: Math.max(0.3, amt) };
}

canvas.addEventListener('pointermove', (e) => {
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  const x = e.clientX, y = e.clientY;
  if (ptr.kind === 'pinch') { ptr.x = x; ptr.y = y; updatePinch(ptr.pin); return; }
  if (ptr.kind === 'tweeze') { ptr.p.fx = x; ptr.p.fy = y; }
  if (ptr.kind === 'treat') G.treat?.move(ptr.x, ptr.y, x, y);
  if (ptr.kind === 'ear') G.ear?.move(e.pointerId, x, y);
  if (ptr.kind === 'wipe') {
    const dist = Math.hypot(x - ptr.x, y - ptr.y);
    const steps = Math.max(1, Math.ceil(dist / 8));
    for (let i = 1; i <= steps; i++) {
      wipeAt(ptr.x + (x - ptr.x) * (i / steps), ptr.y + (y - ptr.y) * (i / steps), dist, ptr.big);
    }
  }
  ptr.x = x; ptr.y = y;
});

function endPointer(e) {
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  pointers.delete(e.pointerId);
  if (ptr.kind === 'treat') G.treat?.up();
  if ((ptr.kind === 'treat' || (ptr.kind === 'wipe' && ptr.big)) && G.sup.dropAt(ptr.x, ptr.y)) { /* dropped it in the bin */ }
  if (ptr.kind === 'treat' || ptr.kind === 'wipe') G.sup.hand = null;
  if (ptr.kind === 'ear') G.ear?.up(e.pointerId);
  if (ptr.kind === 'pinch') {
    const pin = ptr.pin;
    const other = pin.a === e.pointerId ? pin.b : pin.a;
    if (pointers.has(other)) idle(other, 0, 0);
    if (pin.p.held === 'pinch') { pin.p.release(G); checkLevelDone(); }
  }
  if (ptr.kind === 'tweeze') {
    if (ptr.p.held === e.pointerId) ptr.p.held = null;
    checkLevelDone();
  }
  if (ptr.kind === 'pimple' && ptr.p.held === e.pointerId) {
    ptr.p.release(G);
    checkLevelDone();
  }
}
// the supplies' close-ups track the finger directly
canvas.addEventListener('pointermove', (e) => G.sup?.move(e.pointerId, e.clientX, e.clientY));
for (const t of ['pointerup', 'pointercancel']) canvas.addEventListener(t, (e) => G.sup?.up(e.pointerId));
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

function releaseAll() {
  for (const [id, ptr] of pointers) {
    if (ptr.kind === 'pimple' && ptr.p.held === id) ptr.p.release(G);
    if (ptr.kind === 'pinch' && ptr.pin.p.held === 'pinch') ptr.pin.p.release(G);
    if (ptr.kind === 'tweeze') ptr.p.held = null;
  }
  pointers.clear();
  if (G.ear) G.ear.releaseAll();
  if (G.treat) G.treat.holding = 0;
  G.sup.hand = null;
  audio.oozeStop();
}

function wipeAt(x, y, speed, big = false) {
  let cleaned = 0;
  if (big) {
    // the Wipe tool needs a cotton pad from the jar, and pads fill up
    const pad = G.sup.useCloth('pads');
    if (!pad) return;
    G.sup.hand = { x, y };
    const k = 1 + 0.2 * up('pad');
    cleaned = G.fx.wipe(x, y, 44 * k * G.scale, 0.45);
    pad.dirt = Math.min(1, pad.dirt + cleaned / Math.max(45 * k, G.fx.messMade * 0.34 * k));   // ~3 pads per face
  } else if (G.mode === 'ear') {
    G.fx.addTrail(x, y, 26);
    cleaned = G.fx.wipe(x, y, 22 * G.scale, 0.22);
  } else {
    // a bare finger only smears it around
    G.fx.addTrail(x, y, 18);
    cleaned = G.fx.wipe(x, y, 20 * G.scale, 0.04);
  }
  if (cleaned > 0) {
    audio.wipe(Math.min(1, speed / 40));
    if (Math.random() < 0.3) buzz('light');
  }
  if (G.allDone && !G.ended && G.fx.cleanliness() >= (G.treat ? 0.92 : 0.985)) {
    G.fx.sparkleBurst(x, y, 14);
    audio.sparkle();
    (G.mode === 'ear' ? endEar : afterWipe)();
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
      if (!p) { s.t = G.time + 1; G.spawnQueue.push(s); }   // no room yet: try again shortly
      if (p && s.breakout) G.fx.text(p.x, p.y - 40, 'breakout!', '#ffb3c1', 16);
    }
  }

  if (G.mode === 'zen') {
    const active = G.pimples.filter((p) => p.state !== 'done').length;
    G.zenTimer += dt;
    if (active < 6 && G.zenTimer > 1.4 && !G.spawnQueue.length) {
      G.zenTimer = 0;
      placePimple(rollType(Math.min(6, save.level), { cyst: G.pimples.filter((p) => p.type === 'cyst' && p.state !== 'done').length }));
    }
    // fully healed pimples fade away in zen
    G.pimples = G.pimples.filter((p) => !(p.state === 'done' && p.heal >= 1));
  }

  for (const p of G.pimples) p.update(dt, G);
  if (G.ear) G.ear.update(dt);
  // the patient blinks now and then, and screws their eyes shut when it hurts
  G.wince = Math.max(0, G.wince - dt);
  G.blinkA = Math.max(0, G.blinkA - dt);
  G.blinkT -= dt;
  if (G.blinkT <= 0) { G.blinkT = 2.2 + Math.random() * 3.5; G.blinkA = 0.16; }
  G.sup.sync();
  G.sup.update(dt);
  toolfx.update(dt);
  if (G.treat) { G.treat.update(dt); G.treat.updatePuffs(dt); }
  G.fx.update(dt);
  G.shake *= Math.pow(0.001, dt);
  if (G.shake < 0.2) G.shake = 0;

  if (G.mode === 'level' && !G.allDone && !G.ended && !(G.treat && G.treat.active)) G.popTime += dt;
  updateHud();
}

function render() {
  const { dpr, W, H } = G;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (G.skin) ctx.drawImage(G.skin, 0, 0, W, H);
  if (G.geo) drawLids(ctx, G.geo, G.wince > 0 ? Math.min(1, G.wince * 6) : G.blinkA > 0 ? Math.sin(Math.PI * (1 - G.blinkA / 0.16)) : 0);
  else { ctx.fillStyle = '#eec1a2'; ctx.fillRect(0, 0, W, H); }

  ctx.save();
  if (G.shake) ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  if (G.ear) G.ear.drawBack(ctx);
  // healed/done pimples first so active ones draw on top
  for (const p of G.pimples) if (p.state === 'done') p.draw(ctx, G.time);
  G.fx.drawSplats(ctx);
  for (const p of G.pimples) p.drawPatch(ctx);
  for (const p of G.pimples) if (p.state !== 'done') p.draw(ctx, G.time);
  for (const p of G.pimples) p.drawRing(ctx, G.time);
  if (G.ear) G.ear.drawChunks(ctx);
  if (G.treat) G.treat.draw(ctx);
  G.sup.draw(ctx);
  toolfx.draw(ctx, pointers);
  G.fx.drawAir(ctx);
  ctx.restore();
  G.sup.drawCloseup(ctx);
}

// ---------------------------------------------------------------- HUD & screens
let hudCache = {};
function setText(id, v) {
  if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; }
}
function timeLeft() {
  const t = timeGoal(G.def);
  if (!t) return '';
  const left = Math.ceil(t - G.popTime);
  return left > 0 ? ` · ⏱${left}s` : ' · ⏱ over';
}

function updateHud() {
  if (G.mode === 'demo') return;
  setText('hud-score', Math.round(G.score).toLocaleString());
  setText('hud-combo', G.combo >= 2 ? `combo ×${mult().toFixed(2).replace(/\.?0+$/, '')}` : '');
  if (G.mode === 'level') {
    setText('hud-title', `Level ${G.level}`);
    const left = G.pimples.filter((p) => p.state !== 'done').length + G.spawnQueue.length;
    if (G.treat) {
      const t = G.treat, pct = `${Math.round(t.progress * 100)}%`;
      const label = t.phase === 'lather' ? `1/5 Lather ${pct}` : t.phase === 'rinse' ? `1/5 Rinse ${pct}`
        : t.phase === 'steam' ? `2/5 Steam ${pct}` : t.phase === 'soothe' ? `5/5 Soothe ${pct}`
        : G.allDone ? `4/5 Wipe ${Math.round(G.fx.cleanliness() * 100)}%` : `3/5 Pop · ${left} left${timeLeft()}`;
      setText('hud-sub', label);
    } else {
      setText('hud-sub', G.allDone ? `${Math.round(G.fx.cleanliness() * 100)}% clean` : `${left} left${timeLeft()}`);
    }
  } else if (G.mode === 'ear') {
    setText('hud-title', `Ear ${G.level}`);
    setText('hud-sub', G.allDone ? `${Math.round(G.fx.cleanliness() * 100)}% clean` : `${G.ear.left} left`);
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

const SCREENS = ['menu', 'howto', 'stats', 'settings', 'pause', 'results', 'levels', 'intro', 'shop'];
let currentScreen = 'menu';
let screenReturn = 'menu';
function showScreen(name) {
  currentScreen = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  refreshTools();
  if (name === 'menu') {
    $('play-level').textContent = `Level ${save.level} · ${levelDef(save.level).name}`;
    $('menu-coins').textContent = `🪙 ${save.coins.toLocaleString()}`;
    $('ear-level').textContent = `Level ${save.earLevel}`;
  }
}

function refreshTools() {
  const show = currentScreen === null && (G.mode === 'level' || G.mode === 'zen') && !(G.treat && G.treat.active);
  document.querySelectorAll('#tools .tool').forEach((b) => b.classList.toggle('locked', !toolUnlocked(b.dataset.tool)));
  if (!toolUnlocked(G.tool)) document.querySelector('#tools [data-tool="finger"]').click();
  $('tools').classList.toggle('hidden', !show);
}

// ---- level map, patient card, shop
function showLevels() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  let html = `<div class="lv-top"><span>★ ${total} / ${LEVELS.length * 3}</span><span>🪙 ${save.coins.toLocaleString()}</span></div>`;
  for (const ch of CHAPTERS) {
    html += `<h3>${ch.name}</h3><div class="lv-grid">`;
    for (let n = ch.from; n <= ch.to; n++) {
      const locked = n > save.level, st = save.stars[n] || 0;
      const cls = ['lv', locked ? 'locked' : '', LEVELS[n - 1].mix.boss ? 'boss' : '', n === save.level ? 'current' : ''].join(' ');
      html += `<button class="${cls}" data-n="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n}</b><i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i></button>`;
    }
    html += '</div>';
  }
  const open = save.level > LEVELS.length;
  html += `<h3>Endless clinic</h3><button class="big alt lv-endless" data-n="${Math.max(LEVELS.length + 1, save.level)}" ${open ? '' : 'disabled'}>${open ? `Walk-in patient <small>Level ${save.level}</small>` : 'Finish Chapter 3 to unlock'}</button>`;
  $('levels-body').innerHTML = html;
  $('levels-body').querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
    audio.unlock(); audio.click();
    openIntro(+b.dataset.n);
  }));
  showScreen('levels');
  $('levels-body').querySelector('.current')?.scrollIntoView({ block: 'center' });
}

let introLevel = 1;
function openIntro(n) {
  introLevel = n;
  const def = levelDef(n);
  const t = SKIN_TONES[def.skin] || SKIN_TONES[1];
  const best = Math.min(3, save.stars[n] || 0);
  const reward = save.rewards[n] ? null : rewardFor(n);
  const tags = [ZONE_NAMES[def.zone] || '', def.sensitive ? 'Sensitive skin' : '', def.mix && def.mix.boss ? 'Boss pimple' : '', timeGoal(def) ? 'Timed' : '', def.endless ? 'Endless' : ''].filter(Boolean);
  $('intro-body').innerHTML = `
    <div class="patient">
      <img class="portrait" alt="" src="${portraitURL(def, { mood: 'worried', zone: def.zone, ring: true }, 150)}">
      <div><div class="p-name">${def.name}, ${def.age}</div><div class="p-level">Level ${n} ${'★'.repeat(best)}${'☆'.repeat(3 - best)}</div></div>
    </div>
    <p class="blurb">“${def.blurb}”</p>
    ${reward ? `<div class="reward"><b>🎁 Reward: ${reward.name}</b><span>${reward.desc}</span></div>` : ''}
    ${tags.length ? `<div class="tags">${tags.map((x) => `<span>${x}</span>`).join('')}</div>` : ''}
    <ul class="goals">
      <li><span>★</span>Clear every pimple</li>
      ${def.goals.map((g) => `<li><span>★</span>${goalLabel(g)}</li>`).join('')}
    </ul>`;
  showScreen('intro');
}

function showShop() {
  let html = `<div class="lv-top"><span>Shop</span><span>🪙 ${save.coins.toLocaleString()}</span></div>`;
  for (const u of UPGRADES) {
    const lv = up(u.id), cost = u.costs[lv];
    const pips = u.costs.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    html += `<div class="shop-item"><div><b>${u.name}</b><small>${u.desc}</small><div class="pips">${pips}</div></div>
      <button class="buy" data-up="${u.id}" ${cost == null || save.coins < cost ? 'disabled' : ''}>${cost == null ? 'MAX' : `${cost} 🪙`}</button></div>`;
  }
  html += '<h3>Pus style</h3><div class="pus-row">';
  for (const p of PUS_STYLES) {
    const owned = save.pusOwned.includes(p.id);
    html += `<button class="pus ${save.pus === p.id ? 'active' : ''}" data-pus="${p.id}" ${!owned && save.coins < p.cost ? 'disabled' : ''}>
      <i style="background:${p.swatch}"></i><span>${p.name}</span><small>${owned ? (save.pus === p.id ? 'using' : 'owned') : `${p.cost} 🪙`}</small></button>`;
  }
  html += '</div>';
  $('shop-body').innerHTML = html;
  $('shop-body').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => {
    const u = UPGRADES.find((x) => x.id === b.dataset.up), cost = u.costs[up(u.id)];
    if (cost == null || save.coins < cost) return;
    save.coins -= cost;
    save.upgrades[u.id] = up(u.id) + 1;
    store.save(save);
    audio.unlock(); audio.sparkle(); buzz('medium');
    showShop();
  }));
  $('shop-body').querySelectorAll('[data-pus]').forEach((b) => b.addEventListener('click', () => {
    const p = PUS_STYLES.find((x) => x.id === b.dataset.pus);
    if (!save.pusOwned.includes(p.id)) {
      if (save.coins < p.cost) return;
      save.coins -= p.cost;
      save.pusOwned.push(p.id);
      audio.unlock(); audio.sparkle();
    }
    save.pus = p.id;
    store.save(save);
    applyPus();
    buzz('light');
    showShop();
  }));
  showScreen('shop');
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
    stat(save.earWax.toLocaleString(), 'ear wax pulled'),
    stat(save.earsCleaned.toLocaleString(), 'ears cleaned'),
  ].join('');
}

function renderSettings() {
  $('set-sound').checked = save.settings.sound;
  $('set-haptics').checked = save.settings.haptics;
  $('set-steps').checked = save.settings.steps;
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
      paintSkin();
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

document.querySelectorAll('#tools .tool').forEach((b) => b.addEventListener('click', () => {
  audio.unlock();
  audio.click();
  buzz('light');
  G.tool = b.dataset.tool;
  document.querySelectorAll('#tools .tool').forEach((o) => o.classList.toggle('active', o === b));
}));

on('btn-play', () => showLevels());
on('btn-shop', () => showShop());
on('btn-intro-start', () => startLevel(introLevel));
on('btn-intro-back', () => showLevels());
on('btn-zen', () => startZen());
on('btn-ear', () => startEar(save.earLevel));
on('btn-stats', () => { renderStats(); showScreen('stats'); });
on('btn-howto', () => { screenReturn = currentScreen; showScreen('howto'); });
on('btn-settings', () => { renderSettings(); showScreen('settings'); });
on('btn-pause', () => pause());
on('btn-resume', () => { G.paused = false; showScreen(null); });
on('btn-restart', () => (G.mode === 'zen' ? startZen() : G.mode === 'ear' ? startEar(G.level) : startLevel(G.level)));
on('btn-quit', () => goMenu());
on('btn-next', () => (G.mode === 'ear' ? startEar(save.earLevel) : openIntro(G.level + 1)));
on('btn-res-menu', () => goMenu());
on('btn-finish', () => (G.mode === 'ear' ? endEar : afterWipe)());
document.querySelectorAll('.back').forEach((b) => b.addEventListener('click', () => {
  audio.click();
  showScreen(currentScreen === 'howto' ? screenReturn : 'menu');
}));

$('set-sound').addEventListener('change', (e) => {
  save.settings.sound = e.target.checked;
  audio.setSoundEnabled(save.settings.sound);
  store.save(save);
});
$('set-steps').addEventListener('change', (e) => {
  save.settings.steps = e.target.checked;
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
applyPus();
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
