import { Pimple, TYPES, tuning, setPusStyle } from './pimple.js';
import { CHAPTERS, LEVELS, levelDef, goalLabel, goalMet, timeGoal, UPGRADES, PUS_STYLES, ALL_ZONES, rewardFor, TOOL_LEVEL, AWARDS, rankFor } from './levels.js';
import { lookFor, portraitURL } from './faces.js';
import { renderFaceScene, drawLids } from './facescene.js';
import { Makeup, Haircut, LIP_SHADES } from './salon.js';
import { HairService, STATIONS, WALLS, salonLevel, salonTitle, salonPicture, salonBackdrop } from './hairsalon.js';
import { Strip, Brows } from './extras.js';
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

// ---- awards: checked whenever something is finished; each pays out once
function checkAwards() {
  const s = {
    ...save,
    starTotal: Object.values(save.stars).reduce((a, b) => a + b, 0),
    upgradeTotal: Object.values(save.upgrades).reduce((a, b) => a + b, 0),
    threeStars: Object.values(save.stars).filter((v) => v >= 3).length,
    salonLevel: salonLevel(save.salon),
  };
  const earned = [];
  for (const a of AWARDS) {
    if (save.awards[a.id] || !a.test(s)) continue;
    save.awards[a.id] = true;
    save.coins += a.coins;
    earned.push(a);
  }
  if (earned.length) store.save(save);
  return earned;
}
const awardsHtml = (list) => (list.length && setTimeout(() => audio.award(), 1300), list).map((a) => `<div class="reward award"><b>🏆 Award: ${a.name}</b><span>${a.desc} · +${a.coins} coins</span></div>`).join('');
const awardCount = () => Object.keys(save.awards).length;

// ---- you: your name, your salon's name, your colour
const THEMES = {
  violet: ['#7b61ff', '123, 97, 255'], teal: ['#12a89d', '18, 168, 157'], coral: ['#ff6b57', '255, 107, 87'],
  rose: ['#e8548c', '232, 84, 140'], sky: ['#3d8bf0', '61, 139, 240'],
};
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const myName = () => save.profile.name || 'Doc';
const mySalon = () => save.profile.salon || 'The Glow Room';
function applyTheme() {
  const t = THEMES[save.profile.theme] || THEMES.violet;
  document.documentElement.style.setProperty('--accent', t[0]);
  document.documentElement.style.setProperty('--accent-rgb', t[1]);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t[0]);
}
function renderThemes() {
  document.querySelectorAll('[data-themes]').forEach((wrap) => {
    wrap.innerHTML = '';
    for (const [id, t] of Object.entries(THEMES)) {
      const b = document.createElement('button');
      b.className = 'theme' + (save.profile.theme === id ? ' active' : '');
      b.style.background = t[0];
      b.setAttribute('aria-label', id);
      b.onclick = () => { audio.unlock(); audio.click(); save.profile.theme = id; store.save(save); applyTheme(); renderThemes(); };
      wrap.appendChild(b);
    }
  });
}
function greeting() {
  const h = new Date().getHours();
  return `${h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, ${myName()}`;
}

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
  onPop, onDrain, onFinish, onEarPull, onSalonStage,
  ear: null,
  salon: null,           // the Makeup or Haircut mini-mode in play
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);   // 2x is plenty and keeps iPhones at 60fps
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
const playBottom = () => G.H - G.safeBottom - 108;  // leave room for the tool bar

// ---------------------------------------------------------------- spawning
function placePimple(type) {
  if (type === 'stray') {
    if (!G.geo) return {};          // nothing to pluck on a back or shoulder
    const sp = G.geo.strayPoint();
    const hairP = new Pimple(type, sp.x, sp.y, G.scale);
    hairP.hairAngle = sp.a;
    G.pimples.push(hairP);
    if (G.stats) G.stats.total++;
    return hairP;
  }
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
  if (level >= 6) types = types.map((t) => (t === 'white' && Math.random() < 0.18 ? 'milia' : t));   // hard little pearls: needle first
  types.sort(() => Math.random() - 0.5);
  types.sort((a, b) => (b === 'boss') - (a === 'boss'));   // the big one gets first pick of space
  // too many to fit at once: the rest break out as space frees up
  const later = types.splice(MAX_AT_ONCE);
  // a few stray hairs to tidy up with the tweezers (once you own them)
  if (FACE_ZONES.includes(def.zone) && level >= 4) for (let i = 0; i < 3 + (level % 3); i++) types.push('stray');
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
  G.zone = (G.mode === 'level' || G.mode === 'makeup' || G.mode === 'haircut' || G.mode === 'hair' || G.mode === 'strip' || G.mode === 'brows') && def ? def.zone : G.mode === 'zen' ? ALL_ZONES[Math.floor(Math.random() * ALL_ZONES.length)] : null;
  G.look = lookFor(def || { name: `zen${seed}` });
  G.popTime = 0;
  G.maxCombo = 0;
  // let-go timing: Steady Hands upgrade widens it, sensitive skin narrows it
  const k = def && def.sensitive ? 0.6 : 1;
  tuning.perfect = (0.45 + 0.08 * up('steady')) * k;
  tuning.nice = (1.0 + 0.08 * up('steady')) * k;
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
  G.salon = null;
  G.finishing = false;
  G.say = null;
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

const toolHint = (n) => (n === 1 ? 'Two fingers either side of a pimple, then squeeze 🤏' : n === 2 ? 'Blackheads: try the Loop tool' : n === 3 ? 'Cysts are deep — Needle them first' : n === 4 ? 'Ingrown hairs: pull with Tweezers' : n === 5 ? 'Spray disinfects popped spots' : n === 6 ? 'Milia are hard: nick them with the Needle first' : `Patient #${n}`);

function queueBreakouts() {
  G.plan.later.forEach((t, i) => G.spawnQueue.push({ t: G.time + 3 + i * 2.5 + Math.random(), type: t, breakout: true }));
}

// grime to wash off in the first step
function addDirt() {
  for (let i = 0; i < 18; i++) {
    const r = (3 + Math.random() * 5) * G.scale;
    G.fx.addSplat({
      kind: 'drop', ...(G.geo ? G.geo.anyPoint() : { x: 20 + Math.random() * (G.W - 40), y: playTop() + Math.random() * (G.H - playTop() - 40) }),
      rx: r * (1 + Math.random()), ry: r, rot: Math.random() * 3, bx: r * 2,
      color: Math.random() < 0.6 ? '#6f5340' : '#3d3a37', alpha: 0.14 + Math.random() * 0.16, mass: 1,
    });
  }
}

const STEP_BONUS = 100;
function onStepDone(phase) {
  G.score += STEP_BONUS;
  say('step', true);
  G.fx.text(G.W / 2, G.H * 0.4, `step done! +${STEP_BONUS}`, '#8dffa8', 22);
  G.fx.sparkleBurst(G.W / 2, G.H * 0.4, 12);
  audio.perfect();
  buzz('medium');
  if (phase === 'lather') {
    G.treat.start('rinse');
    toast('Now open the wipes, pull one out and wipe the foam off 💦', 3400);
  } else if (phase === 'rinse') {
    G.fx.reset();
    G.treat.wet();
    G.treat.start('steam');
    toast('Step 2: Switch the steamer on, then press and hold ♨️', 3400);
  } else if (phase === 'steam') {
    G.treat.start('pop');
    queueBreakouts();
    refreshTools();
    toast(`Step 3: Pop! ${toolHint(G.level)}`, 3000);
  } else if (phase === 'mask') {
    G.treat.start('dry');
    toast('Fan it dry — wave your finger over the mask 💨', 3000);
  } else if (phase === 'dry') {
    G.treat.start('peel');
    toast('It\'s set. Peel it off! 🤌', 2600);
  } else if (phase === 'soothe' || phase === 'peel') {
    if (phase === 'peel') save.masks++;
    toast('Glowing ✨', 1500);
    setTimeout(endLevel, 1000);
  }
}

// after the popping (and wiping): on to the soothing gel, or straight to results
function afterWipe() {
  if (!G.treat) return endLevel();
  if (G.finishing || G.ended) return;
  G.finishing = true;
  $('btn-finish').classList.add('hidden');
  releaseAll();
  G.cleanAtWipe = G.fx.cleanliness();
  G.fx.fading = true;        // any last traces melt away as you move on
  // even-numbered patients get the peel-off charcoal mask, the others the cooling gel
  const peel = G.level % 2 === 0;
  G.treat.start(peel ? 'mask' : 'soothe');
  refreshTools();
  toast(peel ? 'Step 5: Open the charcoal mask, scoop it on, spread it 🖤' : 'Step 5: Open the gel, squeeze some out, spread it 🌿', 3400);
}

function startZen() {
  G.mode = 'zen';
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(Math.floor(Math.random() * 1e9));
  for (let i = 0; i < 6; i++) G.spawnQueue.push({ t: 0.2 + i * 0.15, type: rollType(6, { cyst: 0 }) });
  G.zenTimer = 0;
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast('Zen mode — no rush 🌿', 1800);
}

function startEar(n, vipDef = null) {
  G.mode = 'ear';
  G.level = n;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  // a different person each time: their own skin tone, hair, jewellery, and problem
  const who = LEVELS[(n * 7 + 3) % LEVELS.length];
  newScene(n * 104729 + 7, vipDef ? { ...vipDef } : { name: who.name, age: who.age, mix: {}, skin: (n * 2 + 1) % 5, goals: [] });
  G.earTool = 'scoop';
  document.querySelectorAll('#ear-tools .tool').forEach((b) => b.classList.toggle('active', b.dataset.ear === 'scoop'));
  G.ear = new Ear(G, n, playTop(), playBottom(), tone());
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  G.say = { text: G.ear.case.say, t: 4.5 };
  toast(`${G.ear.case.title}: ${G.ear.case.tip}`, 4200);
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
  $('res-goals').innerHTML = `<div class="coins-won">+${earCoins} 🪙</div>${awardsHtml(checkAwards())}`;
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

// ---- Makeup and Haircut: quick side modes on a random client's face
function startSalon(kind, vip = null) {
  G.mode = kind;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  const client = { ...(vip ? vip.def : LEVELS[Math.floor(Math.random() * LEVELS.length)]), zone: 'forehead' };
  newScene(vip ? vip.seed : Math.floor(Math.random() * 1e9), client);
  if (kind === 'haircut') { G.look = { ...G.look, style: 'long' }; paintSkin(); }   // needs a fringe to trim
  if (kind === 'hair') {
    // your salon: its walls follow the Decor level, its stations decide the services
    G.salonLv = save.salon;
    const styles = ['long', 'pony', 'bun', 'curly', 'short'];
    G.look = { ...G.look, wall: WALLS[save.salon.decor] || WALLS[0], backdrop: (cx2, w2, h2) => salonBackdrop(cx2, w2, h2, save.salon), style: styles.includes(G.look.style) ? G.look.style : 'long' };
    paintSkin();
  }
  G.salon = kind === 'makeup' ? new Makeup(G, Math.min(LIP_SHADES.length, 3 + save.makeupDone))
    : kind === 'hair' ? new HairService(G, save.salon, paintSkin) : kind === 'strip' ? new Strip(G, toast) : kind === 'brows' ? new Brows(G, toast) : new Haircut(G);
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  if (kind === 'makeup') {
    // she has a look in mind: the starred shade of each product earns a bigger tip
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    G.salon.want = { lips: pick(G.salon.shades.lips), blush: pick(G.salon.shades.blush), shadow: pick(G.salon.shades.shadow) };
    G.salon.intro = 'She starred the shades she wants ⭐ Pick a product, then swipe it on';
    G.say = { text: 'I\'d love the starred shades!', t: 4.5 };
    renderMakeupBar();
  }
  if (kind === 'hair') {
    audio.doorbell();
    G.say = { text: G.salon.request(), t: 5 };
    toast(G.salon.hint(), 3400);
  } else toast(G.salon.intro ? G.salon.intro : kind === 'makeup' ? 'Pick a product and a shade, then swipe it on 💄' : 'Swipe across each lock to snip it at the dashed line ✂️', 3400);
}

// colour / style choices during a hair visit; the one she asked for wears a star
function renderHairBar() {
  const b = G.salon.bar && G.salon.bar();
  $('makeup-bar').querySelector('.mk-products').classList.add('hidden');
  const wrap = $('mk-shades');
  wrap.innerHTML = '';
  if (!b) return;
  for (const o of b.options) {
    const value = b.kind === 'colors' ? o : o[0];
    const el = document.createElement('button');
    el.className = (b.kind === 'colors' ? 'shade' : 'style-btn') + (b.value === value ? ' active' : '') + (b.want === value ? ' want' : '');
    if (b.kind === 'colors') el.style.background = o; else el.textContent = o[1];
    el.onclick = () => { audio.unlock(); audio.click(); G.salon.choose(value); renderHairBar(); };
    wrap.appendChild(el);
  }
}
function onSalonStage(sv) {
  renderHairBar();
  refreshTools();
  if (!sv.ready) toast(sv.hint(), 3000);
  say('step', true);
}

// the salon hub: your stations, what they do, and what the next level costs
function showSalon() {
  const lv = save.salon;
  let html = `<div class="lv-top"><span>${salonTitle(lv)} · level ${salonLevel(lv)}</span><span>🪙 ${save.coins.toLocaleString()}</span></div>
    <img class="salon-view" alt="Your salon" src="${salonPicture(lv, 340, 220, mySalon())}">
    <p class="salon-note">${save.salonClients} client${save.salonClients === 1 ? '' : 's'} served. Upgrade stations to offer more and earn bigger tips.</p>`;
  for (const st of STATIONS) {
    const cur = lv[st.id] ?? st.start, max = st.start + st.costs.length, cost = st.costs[cur - st.start];
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < cur ? 'on' : ''}"></i>`).join('');
    html += `<div class="shop-item"><div><b>${st.name}</b><small>${st.desc[cur]}</small><div class="pips">${pips}</div></div>
      <button class="buy" data-st="${st.id}" ${cost == null || save.coins < cost ? 'disabled' : ''}>${cost == null ? 'MAX' : `${cur === 0 ? 'Buy' : 'Up'} ${cost} 🪙`}</button></div>`;
  }
  $('salon-name').textContent = mySalon();
  $('salon-body').innerHTML = html;
  $('salon-body').querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => {
    const st = STATIONS.find((q) => q.id === b.dataset.st), cur = save.salon[st.id] ?? st.start, cost = st.costs[cur - st.start];
    if (cost == null || save.coins < cost) return;
    save.coins -= cost;
    save.salon[st.id] = cur + 1;
    store.save(save);
    audio.unlock(); audio.sparkle(); buzz('medium');
    const got = checkAwards();
    if (got.length) toast(`🏆 ${got.map((a) => a.name).join(', ')}`, 3000);
    showSalon();
  }));
  showScreen('salon');
}

function renderMakeupBar() {
  $('makeup-bar').querySelector('.mk-products').classList.remove('hidden');
  const m = G.salon;
  document.querySelectorAll('#makeup-bar [data-mk]').forEach((b) => b.classList.toggle('active', b.dataset.mk === m.product));
  const wrap = $('mk-shades');
  wrap.innerHTML = '';
  for (const c of m.shades[m.product]) {
    const b = document.createElement('button');
    b.className = 'shade' + (m.color[m.product] === c ? ' active' : '') + (m.want && m.want[m.product] === c ? ' want' : '');
    b.style.background = c;
    b.onclick = () => { audio.unlock(); audio.click(); m.setColor(c); renderMakeupBar(); };
    wrap.appendChild(b);
  }
}

function endSalon() {
  if (G.ended || !G.salon) return;
  G.ended = true;
  $('btn-finish').classList.add('hidden');
  const kind = G.mode, sc = G.salon.score();
  const stars = sc >= 90 ? 3 : sc >= 70 ? 2 : 1;
  let coins = earnCoins(sc * 6, stars);
  let unlock = '';
  if (kind === 'hair') {
    // tips grow with your decor, and again if she got exactly what she asked for
    const happy = G.salon.matched();
    const tip = Math.round((40 + sc) * (1 + 0.25 * save.salon.decor) * (happy ? 1.5 : 1));
    save.coins += tip;
    coins += tip;
    setTimeout(() => audio.chaChing(), 500);
    save.salonClients++;
    save.haircutDone++;
    if (happy) save.salonHappy++;
    unlock = `<div class="reward"><b>${happy ? `💖 “Exactly what I asked for, ${esc(myName())}!”` : 'She\'s happy enough'}</b><span>Tip: +${tip} coins${save.salon.decor ? ` (decor bonus +${save.salon.decor * 25}%)` : ''}</span></div>`;
  }
  if (kind === 'hair') { /* counted above */ } else if (kind === 'makeup') {
    save.makeupDone++;
    if (2 + save.makeupDone < LIP_SHADES.length) unlock = '<div class="reward"><b>🎁 New lipstick shade unlocked</b><span>Try it on your next client</span></div>';
    const hit = G.salon.want ? ['lips', 'blush', 'shadow'].filter((p) => G.salon.color[p] === G.salon.want[p]).length : 0;
    if (hit) { save.coins += hit * 25; coins += hit * 25; unlock += `<div class="reward"><b>${hit === 3 ? '💖 Exactly the look she wanted!' : `⭐ ${hit} of 3 shades she asked for`}</b><span>Tip: +${hit * 25} coins</span></div>`; }
  } else if (kind === 'strip') save.stripsDone++; else if (kind === 'brows') save.browsDone++; else save.haircutDone++;
  if (G.salon.summary) unlock = `<div class="reward"><b>${G.salon.summary()}</b></div>`;
  store.save(save);
  $('btn-next').firstChild.textContent = 'Another client';
  $('res-title').textContent = (kind === 'hair' ? ['', 'A bit uneven', 'Lovely hair!', 'Salon perfect!'] : kind === 'makeup' ? ['', 'A bit smudged', 'Looking lovely', 'Flawless glam!'] : G.salon.titles || ['', 'It\'ll grow back', 'Neat trim', 'Salon perfect!'])[stars];
  [...$('res-stars').children].forEach((el, i) => el.classList.toggle('on', i < stars));
  $('res-grid').innerHTML = [stat(`${sc}%`, G.salon.statLabel || (kind === 'hair' ? 'happiness' : kind === 'makeup' ? 'coverage' : 'precision')), stat(`+${coins} 🪙`, 'coins earned')].join('');
  $('res-goals').innerHTML = unlock + awardsHtml(checkAwards());
  audio.fanfare();
  buzz('medium');
  setTimeout(() => showScreen('results'), 500);
}

// ---- VIP visits: one client, four treatments in a row, then her review and a tip
const STAGE_NAMES = { pop: 'Pimples', strip: 'Pore strip', brows: 'Brows', ear: 'Ears', makeup: 'Makeup' };
const todayKey = () => new Date().toLocaleDateString('en-CA');
const dailyDef = () => LEVELS[Math.floor(Date.now() / 864e5) % LEVELS.length];
const vipTitle = (base) => (G.chain ? `${G.chain.def.name} · ${G.chain.i + 1}/${G.chain.stages.length} ${STAGE_NAMES[G.chain.stages[G.chain.i]]}` : base);
function startVisit(daily) {
  const base = daily ? dailyDef() : LEVELS[Math.floor(Math.random() * LEVELS.length)];
  const def = { ...base, zone: FACE_ZONES.includes(base.zone) ? base.zone : 'cheek', later: 0 };
  const extra = ['strip', 'brows', 'ear'].sort(() => Math.random() - 0.5).slice(0, 2);
  G.chain = { def, seed: Math.floor(Math.random() * 1e9), stages: ['pop', ...extra, 'makeup'], i: 0, stars: [], daily };
  startVisitStage();
  audio.doorbell();
  G.say = { text: `Hi ${myName()}! The full works please`, t: 4.5 };
}
function startVisitStage() {
  const c = G.chain, kind = c.stages[c.i];
  if (kind === 'ear') return startEar(save.earLevel, c.def);
  if (kind !== 'pop') return startSalon(kind, c);
  G.mode = 'level';
  G.level = 0;
  G.score = 0;
  G.combo = 0;
  G.stats = freshStats();
  G.paused = false;
  newScene(c.seed, c.def);
  G.plan = randomPlan(4);
  G.plan.types.forEach((t, i) => G.spawnQueue.push({ t: 0.25 + i * 0.12, type: t }));
  showScreen(null);
  $('hud').classList.remove('hidden');
  $('btn-finish').classList.add('hidden');
  toast(`${c.def.name} is here for the full works: pimples first 🤏`, 3200);
}
function visitNext() {
  const c = G.chain;
  if (c.review) return startVisit(false);
  c.i++;
  if (c.i < c.stages.length) startVisitStage(); else showReview();
}
const REVIEWS = {
  5: ['Best visit of my life. {me} has magic hands!', 'I walked out of {salon} glowing. Booking again tomorrow.', 'Gentle, fast and SO satisfying. Five stars, obviously.', 'My skin has never looked this good. Thank you {me}!'],
  4: ['Really lovely visit, I feel brand new.', '{salon} is my new favourite place. Nearly perfect!', 'Great job {me}, just a tiny bit rushed.'],
  3: ['Pretty good! A couple of ouch moments though.', 'Decent visit. My skin is clearer than when I came in.'],
  2: ['It was okay... I think {me} was having a day.', 'I left clean-ish. Could have been gentler.'],
  1: ['Ow. Just... ow.', 'I am telling my friends about this. Not in a good way.'],
};
function showReview() {
  const c = G.chain;
  c.review = true;
  const avg = c.stars.reduce((a, b) => a + b, 0) / c.stars.length;
  const five = Math.max(1, Math.min(5, Math.round((avg - 1) * 2) + 1));
  const pool = REVIEWS[five];
  const text = pool[Math.floor(Math.random() * pool.length)].replace('{me}', myName()).replace('{salon}', mySalon());
  const tip = Math.round((40 + 45 * five) * (c.daily ? 2 : 1));
  save.coins += tip;
  save.visits++;
  if (five === 5) save.fiveStars++;
  save.reviews.unshift({ n: c.def.name, s: five, t: text });
  save.reviews.length = Math.min(save.reviews.length, 20);
  if (c.daily) save.dailyDone = todayKey();
  store.save(save);
  $('res-title').textContent = five === 5 ? 'Five-star visit!' : five === 4 ? 'She loved it' : five === 3 ? 'Not bad at all' : 'Could be better';
  [...$('res-stars').children].forEach((el, i) => el.classList.toggle('on', i < Math.round(avg)));
  $('res-grid').innerHTML = [stat(`<span class="five">${'★'.repeat(five)}<i>${'★'.repeat(5 - five)}</i></span>`, 'her rating'), stat(`+${tip} 🪙`, c.daily ? 'VIP tip ×2' : 'her tip')].join('');
  $('res-goals').innerHTML = `<div class="before-after"><figure><img class="portrait small" alt="" src="${portraitURL(c.def, { mood: 'worried', zone: c.def.zone }, 120)}"><figcaption>before</figcaption></figure><span>→</span><figure><img class="portrait small" alt="" src="${portraitURL(c.def, { mood: 'happy', clear: true }, 120)}"><figcaption>after</figcaption></figure></div>
  <div class="review">“${esc(text)}”<small>${esc(c.def.name)}</small></div>${awardsHtml(checkAwards())}`;
  $('btn-next').firstChild.textContent = 'Next VIP client';
  audio.fanfare();
  setTimeout(() => audio.chaChing(), 500);
  buzz('medium');
  showScreen('results');
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
  if (!p.T.stray) say('pop');
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
    save.bestCombo = Math.max(save.bestCombo, G.combo);
    say('good');
    G.stats.perfects++;
    const pts = Math.round(150 * mult());
    G.score += pts;
    G.fx.text(p.x, y, `PERFECT! +${pts}`, '#8dffa8', 24);
    G.fx.sparkleBurst(p.x, p.y, 10);
    audio.perfect(G.combo);
  } else if (rating === 'nice') {
    G.stats.nices++;
    G.score += 50;
    G.fx.text(p.x, y, 'Nice +50', '#d7f59a', 20);
  } else {
    G.combo = 0;
    G.wince = 1.1;
    say('ouch', true);
    G.stats.ouches++;
    G.score = Math.max(0, G.score - 50);
    G.fx.text(p.x, y, 'OUCH! −50', '#ff6b78', 24);
  }
  save.totalPops++;
  save.byType[p.type] = (save.byType[p.type] || 0) + 1;
  if (p.type === 'boss') save.bossPops++;
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
    if (G.fx.cleanliness() >= cleanTarget()) {
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

  if (!G.chain) {
    save.level = Math.max(save.level, G.level + 1);
    save.stars[G.level] = Math.max(save.stars[G.level] || 0, stars);
  }
  save.bestScore = Math.max(save.bestScore, score);
  save.levelsCleared++;
  if (s.ouches === 0) save.flawless++;
  if (G.treat) save.spaDays++;
  const reward = G.chain ? null : grantReward(G.level);
  const newAwards = checkAwards();
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
  $('res-goals').innerHTML = `<div class="before-after"><figure><img class="portrait small" alt="" src="${portraitURL(def, { mood: 'worried', zone: def.zone }, 120)}"><figcaption>before</figcaption></figure><span>→</span><figure><img class="portrait small" alt="" src="${portraitURL(def, { mood: 'happy', clear: true }, 120)}"><figcaption>after</figcaption></figure></div>
  ${reward ? `<div class="reward"><b>🎁 New: ${reward.name}</b><span>${reward.desc}</span></div>` : ''}${awardsHtml(newAwards)}
  <ul class="goals">
    <li class="met"><span>★</span>Clear every pimple</li>
    ${def.goals.map((g, i) => `<li class="${met[i] ? 'met' : 'missed'}"><span>${met[i] ? '★' : '☆'}</span>${goalLabel(g)}</li>`).join('')}
  </ul>`;
  audio.fanfare();
  buzz('medium');
  setTimeout(() => showScreen('results'), 400);
}

function earnCoins(score, stars) {
  setTimeout(() => audio.coin(), 900);
  const coins = Math.round((score / 20 + stars * 20) * (1 + 0.15 * up('magnet')));
  save.coins += coins;
  store.save(save);
  return coins;
}

function stat(v, label) { return `<div class="stat"><b>${v}</b><span>${label}</span></div>`; }

// ---------------------------------------------------------------- input
const pointers = new Map(); // pointerId → { kind, p?, x, y }
G.pointersNear = pointers;  // the ear's bug runs from nearby fingers

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
  if (G.salon) {
    pointers.set(e.pointerId, { kind: 'salon', x, y });
    G.salon.down(e.pointerId, x, y);
    return;
  }
  const hit = G.sup.down(x, y, e.pointerId);   // a bottle, pack, jar, the bin, or a close-up
  if (hit === 'grab') {
    // pulled out a fresh wipe/pad: this finger carries on wiping with it
    G.sup.hand = { x, y };
    if (G.treat && G.treat.active) { pointers.set(e.pointerId, { kind: 'treat', x, y }); G.treat.holding++; G.treat.fresh = false; }
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
    if (p.type !== 'black') {
      hint(p, 'the Loop is for blackheads — pinch this one');
      p.guide = 1.8;
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
  // popping takes two fingers: one finger only shows where to pinch
  if (tryPinch(id, x, y)) return;
  if (p) { p.guide = 2.2; buzz('light'); pointers.set(id, { kind: 'touch', p, x, y }); return; }
  pointers.set(id, { kind: 'wipe', x, y });
  wipeAt(x, y, 0);
}

// ---- the patient reacts out loud
const LINES = {
  pop: ['eek!', 'ooh!', 'ow ow', 'was that it?', 'gross…', 'oof'],
  good: ['ahh, better', 'that\'s the spot', 'so satisfying', 'do another!', 'yesss', 'thanks, {n}!', 'you\'re good, {n}'],
  ouch: ['OW! careful!', 'hey!! gentle!', 'that HURT', 'too hard!'],
  step: ['so fresh', 'mmm, nice', 'I needed this', 'that tingles', '{n}, you\'re the best'],
};
let sayCool = 0;
function say(kind, always = false) {
  if (G.mode !== 'level' && G.mode !== 'zen') return;
  if (!always && (sayCool > 0 || Math.random() > 0.45)) return;
  const list = LINES[kind];
  G.say = { text: list[Math.floor(Math.random() * list.length)].replace('{n}', myName()), t: 1.9 };
  sayCool = 3;
}
function drawSay(ctx) {
  const sy = G.say;
  if (!sy || sy.t <= 0) return;
  const a = Math.min(1, sy.t * 3, (1.9 - sy.t) * 8);
  ctx.save();
  ctx.globalAlpha = a;
  // long lines shrink to fit rather than running off the screen
  let size = 15;
  ctx.font = `800 ${size}px ui-rounded, -apple-system, system-ui, sans-serif`;
  while (ctx.measureText(sy.text).width + 26 > G.W - 20 && size > 10) { size -= 0.5; ctx.font = `800 ${size}px ui-rounded, -apple-system, system-ui, sans-serif`; }
  const tw = ctx.measureText(sy.text).width, bw = tw + 26, bh = 34;
  const bx = Math.max(8, G.W - bw - 12), by = playTop() - 4 - (1 - a) * 6;
  ctx.fillStyle = 'rgba(40,30,80,0.25)';
  ctx.beginPath(); ctx.roundRect(bx + 2, by + 3, bw, bh, 15); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 15); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx + 18, by + bh - 2); ctx.lineTo(bx + 10, by + bh + 12); ctx.lineTo(bx + 34, by + bh - 2); ctx.fill();
  ctx.fillStyle = '#2b2540';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(sy.text, bx + bw / 2, by + bh / 2 + 1);
  ctx.restore();
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
    save.sprays++;
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
  const shapes = ['dot', 'heart', 'star'];
  best.patch = { shape: shapes[Math.floor(Math.random() * shapes.length)], rot: (Math.random() - 0.5) * 0.7, born: best.time };
  save.patches++;
  const pts = best.sanitized ? 50 : 30;
  G.score += pts;
  G.fx.text(best.x, best.y - best.r * 2.2, best.sanitized ? `clean & patched +${pts}` : `patched +${pts}`, '#ffd6e6', 16);
  audio.cap();
  buzz('medium');
}

// ---- two-finger squeeze: the only way to pop with bare fingers
const PINCH_REACH = 150;      // how far from the pimple a finger can be and still count
function nearestPimple(x, y, reach) {
  let best = null, bestD = Infinity;
  for (const p of G.pimples) {
    if (!p.grabbable || p.held != null || p.T.hair) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < reach + p.r && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

function tryPinch(id, x, y) {
  for (const [oid, o] of pointers) {
    if ((o.kind !== 'touch' && o.kind !== 'wipe') || o.big) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d > 2 * PINCH_REACH + 40 || d < 20) continue;
    // the pimple the first finger is on, or else whichever sits between the two fingers
    let p = o.kind === 'touch' ? o.p : null;
    if (p && (p.held != null || !p.grabbable || Math.hypot(p.x - x, p.y - y) > PINCH_REACH + p.r)) p = null;
    if (!p) p = nearestPimple((o.x + x) / 2, (o.y + y) / 2, 56);
    if (p) return makePinch(p, oid, id, o.x, o.y, x, y);
  }
  return false;
}

function makePinch(p, a, b, ax, ay, bx, by) {
  const pin = { p, a, b, d0: Math.max(40, Math.hypot(ax - bx, ay - by)), last: null };
  p.guide = 0;
  p.press('pinch');
  pointers.set(a, { kind: 'pinch', pin, x: ax, y: ay });
  pointers.set(b, { kind: 'pinch', pin, x: bx, y: by });
  updatePinch(pin);
  G.fx.text(p.x, p.y - p.r * 2.6 - 24, 'squeeze!', '#ffe7a8', 16);
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
  const abs = 1 - (d - 95) / 115;             // fingertips ~95px apart is a full squeeze on a phone             // how close together they are
  const amt = Math.max(0, Math.min(1, Math.max(rel, abs)));
  pin.p.boost = 0.25 + 2.2 * amt;      // resting fingers barely do anything: you have to squeeze
  pin.p.pinch = { angle: Math.atan2(B.y - A.y, B.x - A.x), amt: Math.max(0.3, amt) };
}

canvas.addEventListener('pointermove', (e) => {
  const ptr = pointers.get(e.pointerId);
  if (!ptr) return;
  const x = e.clientX, y = e.clientY;
  if (ptr.kind === 'pinch') { ptr.x = x; ptr.y = y; updatePinch(ptr.pin); return; }
  if (ptr.kind === 'tweeze') { ptr.p.fx = x; ptr.p.fy = y; }
  if (ptr.kind === 'salon') G.salon?.move(e.pointerId, x, y, ptr.x, ptr.y);
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
  if (ptr.kind === 'salon') G.salon?.up(e.pointerId);
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
  audio.loopStopAll();
  if (G.ear) G.ear.releaseAll();
  if (G.treat) G.treat.holding = 0;
  G.sup.hand = null;
  audio.oozeStop();
}

// How clean counts as "done wiping": comfortably past this patient's own clean goal.
function cleanTarget() {
  const g = G.def && G.def.goals.find((q) => Array.isArray(q) && q[0] === 'clean');
  return Math.max(0.95, g ? g[1] / 100 + 0.015 : 0);
}

function wipeAt(x, y, speed, big = false) {
  let cleaned = 0;
  if (big) {
    // the Wipe tool needs a cotton pad from the jar, and pads fill up
    const pad = G.sup.useCloth('pads');
    if (!pad) return;
    G.sup.hand = { x, y };
    const k = 1 + 0.2 * up('pad');
    cleaned = G.fx.wipe(x, y, 58 * k, 0.75);       // a thumb-sized swipe, clean in a pass or two
    pad.dirt = Math.min(1, pad.dirt + cleaned / Math.max(60 * k, G.fx.messMade * 0.5 * k));   // about 2 pads per face   // ~3 pads per face
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
  if (G.allDone && !G.ended && G.fx.cleanliness() >= cleanTarget()) {
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
      placePimple(rollType(6, { cyst: G.pimples.filter((p) => p.type === 'cyst' && p.state !== 'done').length }));
    }
    // fully healed pimples fade away in zen
    G.pimples = G.pimples.filter((p) => !(p.state === 'done' && p.heal >= 1));
  }

  for (const p of G.pimples) p.update(dt, G);
  if (G.ear) G.ear.update(dt);
  if (G.salon) G.salon.update(dt);
  // the patient blinks now and then, and screws their eyes shut when it hurts
  G.wince = Math.max(0, G.wince - dt);
  sayCool = Math.max(0, sayCool - dt);
  if (G.say) G.say.t -= dt;
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
  if (G.ear) { G.ear.drawChunks(ctx); G.ear.drawTools(ctx); }
  if (G.salon) G.salon.draw(ctx);
  if (G.treat) G.treat.draw(ctx);
  G.sup.draw(ctx);
  toolfx.draw(ctx, pointers);
  G.fx.drawAir(ctx);
  ctx.restore();
  drawSay(ctx);
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

function hudProgress() {
  if (G.salon) return G.salon.progress;
  if (G.treat && G.treat.active) return G.treat.progress;
  if (G.mode === 'ear' && G.ear) return G.allDone ? G.fx.cleanliness() : 1 - G.ear.left / Math.max(1, G.ear.total);
  if (G.mode === 'level') {
    if (G.allDone) return G.fx.cleanliness();
    const all = G.pimples.length + G.spawnQueue.length;
    return all ? G.pimples.filter((p) => p.state === 'done').length / all : 0;
  }
  return 0;
}
let barCache = -1;
function updateHud() {
  if (G.mode === 'demo') return;
  const bar = G.mode === 'zen' ? -1 : Math.round(Math.max(0, Math.min(1, hudProgress() || 0)) * 100);
  if (bar !== barCache) { barCache = bar; $('hud-bar').style.display = bar < 0 ? 'none' : ''; $('hud-bar').firstChild.style.width = `${Math.max(0, bar)}%`; }
  if (G.salon) {
    setText('hud-title', vipTitle(G.salon.title || (G.mode === 'makeup' ? 'Makeup' : G.mode === 'hair' ? 'Hair Salon' : 'Haircut')));
    setText('hud-sub', G.salon.label ? G.salon.label() : `${Math.round(G.salon.progress * 100)}% done`);
    setText('hud-score', `${G.salon.score()}%`);
    setText('hud-combo', '');
    const ready = G.salon.ready && !G.ended;
    if (ready && $('btn-finish').classList.contains('hidden')) { $('btn-finish').textContent = 'Done ✨'; $('btn-finish').classList.remove('hidden'); }
    return;
  }
  setText('hud-score', Math.round(G.score).toLocaleString());
  setText('hud-combo', G.combo >= 2 ? `combo ×${mult().toFixed(2).replace(/\.?0+$/, '')}` : '');
  if (G.mode === 'level') {
    setText('hud-title', vipTitle(`Level ${G.level}`));
    const left = G.pimples.filter((p) => p.state !== 'done').length + G.spawnQueue.length;
    if (G.treat) {
      const t = G.treat, pct = `${Math.round(t.progress * 100)}%`;
      const label = t.phase === 'lather' ? `1/5 Lather ${pct}` : t.phase === 'rinse' ? `1/5 Rinse ${pct}`
        : t.phase === 'steam' ? `2/5 Steam ${pct}` : t.phase === 'soothe' ? `5/5 Soothe ${pct}` : t.phase === 'mask' ? `5/5 Mask ${pct}` : t.phase === 'dry' ? `5/5 Dry ${pct}` : t.phase === 'peel' ? `5/5 Peel ${pct}`
        : G.allDone ? `4/5 Wipe ${Math.round(G.fx.cleanliness() * 100)}%` : `3/5 Pop · ${left} left${timeLeft()}`;
      setText('hud-sub', label);
    } else {
      setText('hud-sub', G.allDone ? `${Math.round(G.fx.cleanliness() * 100)}% clean` : `${left} left${timeLeft()}`);
    }
  } else if (G.mode === 'ear') {
    setText('hud-title', vipTitle(`Ear ${G.level} · ${G.def ? G.def.name : ''}`));
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

const SCREENS = ['menu', 'howto', 'stats', 'settings', 'pause', 'results', 'levels', 'intro', 'shop', 'salon', 'welcome'];
let currentScreen = 'menu';
let screenReturn = 'menu';
function showScreen(name) {
  currentScreen = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  refreshTools();
  if (name === 'results' && G.chain && !G.chain.review) {
    const c = G.chain, nxt = c.stages[c.i + 1];
    if (c.stars.length === c.i) c.stars.push($('res-stars').querySelectorAll('.on').length);
    $('btn-next').firstChild.textContent = nxt ? `Next: ${STAGE_NAMES[nxt]} →` : 'See her review 💌';
  }
  if (name === 'menu') {
    const vd = dailyDef(), vdone = save.dailyDone === todayKey();
    if ($('vip-face').dataset.who !== vd.name) { $('vip-face').dataset.who = vd.name; $('vip-face').src = portraitURL(vd, { mood: 'happy', clear: true }, 120); }
    $('vip-title').textContent = vdone ? 'VIP walk-in' : `Today's VIP: ${vd.name}`;
    $('vip-sub').textContent = vdone ? `${vd.name} is done for today ✓ · take another` : 'Full visit · 4 treatments · double tip';
    $('play-level').textContent = `Level ${save.level} · ${levelDef(save.level).name}`;
    $('menu-coins').textContent = `🪙 ${save.coins.toLocaleString()}`;
    $('hello').textContent = greeting();
    $('streak').textContent = `${rankFor(awardCount())} · 🏆 ${awardCount()}/${AWARDS.length}${save.streak > 1 ? ` · 🔥 ${save.streak} days` : ''}`;
    $('ear-level').textContent = `Level ${save.earLevel}`;
  }
}

function refreshTools() {
  const show = currentScreen === null && (G.mode === 'level' || G.mode === 'zen') && !(G.treat && G.treat.active);
  document.querySelectorAll('#tools .tool').forEach((b) => b.classList.toggle('locked', !toolUnlocked(b.dataset.tool)));
  if (!toolUnlocked(G.tool)) document.querySelector('#tools [data-tool="finger"]').click();
  $('tools').classList.toggle('hidden', !show);
  $('ear-tools').classList.toggle('hidden', !(currentScreen === null && G.mode === 'ear'));
  const mk = currentScreen === null && (G.mode === 'makeup' || (G.mode === 'hair' && G.salon && !!G.salon.bar()));
  $('makeup-bar').classList.toggle('hidden', !mk);
  document.body.classList.toggle('mk', mk);
}

// ---- level map, patient card, shop
function showLevels() {
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  let html = `<div class="lv-top"><span>★ ${total} / ${LEVELS.length * 3}</span><span>🪙 ${save.coins.toLocaleString()}</span></div>`;
  for (const ch of CHAPTERS) {
    html += `<h3>${ch.name}</h3><div class="lv-grid">`;
    for (let n = ch.from; n <= ch.to; n++) {
      const locked = false, st = save.stars[n] || 0;      // every patient is open from the start
      const cls = ['lv', locked ? 'locked' : '', LEVELS[n - 1].mix.boss ? 'boss' : '', n === save.level ? 'current' : ''].join(' ');
      html += `<button class="${cls}" data-n="${n}" ${locked ? 'disabled' : ''}><b>${locked ? '🔒' : n}</b><i>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i></button>`;
    }
    html += '</div>';
  }
  const open = true;
  html += `<h3>Endless clinic</h3><button class="big alt lv-endless" data-n="${Math.max(LEVELS.length + 1, save.level)}" ${open ? '' : 'disabled'}>${open ? `Walk-in patient <small>Level ${save.level}</small>` : 'Finish Chapter 3 to unlock'}</button>`;
  $('clinic-name').textContent = `${myName()}'s Clinic`;
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
  G.chain = null;
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
    stat(save.makeupDone.toLocaleString(), 'makeup looks'),
    stat(save.haircutDone.toLocaleString(), 'haircuts'),
    stat(save.stripsDone.toLocaleString(), 'pore strips'),
    stat(save.browsDone.toLocaleString(), 'brows shaped'),
    stat(save.visits.toLocaleString(), 'VIP visits'),
    stat(save.fiveStars.toLocaleString(), '5-star reviews'),
  ].join('');
  $('guest-book').innerHTML = save.reviews.length ? '<h3>Guest book</h3>' + save.reviews.map((r) => `<div class="award-row got"><span>💌</span><div><b>${esc(r.n)} · ${'★'.repeat(r.s)}</b><small>“${esc(r.t)}”</small></div></div>`).join('') : '';
  $('awards-list').innerHTML = `<h3>Awards ${awardCount()} / ${AWARDS.length} · ${rankFor(awardCount())}</h3>`
    + AWARDS.map((a) => `<div class="award-row ${save.awards[a.id] ? 'got' : ''}"><span>${save.awards[a.id] ? '🏆' : '🔒'}</span><div><b>${a.name}</b><small>${a.desc} · ${a.coins} coins</small></div></div>`).join('');
}

function renderSettings() {
  $('set-name').value = save.profile.name;
  $('set-salon').value = save.profile.salon;
  renderThemes();
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

// names: typed on the welcome screen the first time, editable later in Settings
const clean = (v, max) => v.replace(/\s+/g, ' ').trim().slice(0, max);
for (const [id, key, max] of [['set-name', 'name', 14], ['set-salon', 'salon', 20]]) {
  $(id).addEventListener('input', (e) => { save.profile[key] = clean(e.target.value, max); store.save(save); });
}
on('btn-welcome', () => {
  save.profile.name = clean($('wel-name').value, 14) || 'Doc';
  save.profile.salon = clean($('wel-salon').value, 20) || 'The Glow Room';
  store.save(save);
  if (document.activeElement) document.activeElement.blur();
  if (firstRun) { screenReturn = 'menu'; showScreen('howto'); } else showScreen('menu');
});

on('btn-play', () => showLevels());
on('btn-shop', () => showShop());
on('btn-intro-start', () => startLevel(introLevel));
on('btn-intro-back', () => showLevels());
on('btn-zen', () => startZen());
document.querySelectorAll('#ear-tools .tool').forEach((b) => b.addEventListener('click', () => {
  audio.unlock(); audio.click(); buzz('light');
  G.earTool = b.dataset.ear;
  if (G.ear) G.ear.releaseAll();
  document.querySelectorAll('#ear-tools .tool').forEach((o) => o.classList.toggle('active', o === b));
}));
on('btn-makeup', () => startSalon('makeup'));
on('btn-strip', () => startSalon('strip'));
on('btn-brows', () => startSalon('brows'));
on('btn-vip', () => startVisit(save.dailyDone !== todayKey()));
on('btn-haircut', () => showSalon());
on('btn-salon-go', () => startSalon('hair'));
document.querySelectorAll('#makeup-bar [data-mk]').forEach((b) => b.addEventListener('click', () => {
  audio.unlock(); audio.click();
  if (G.salon && G.salon.setProduct) { G.salon.setProduct(b.dataset.mk); renderMakeupBar(); }
}));
on('btn-ear', () => startEar(save.earLevel));
on('btn-stats', () => { renderStats(); showScreen('stats'); });
on('btn-howto', () => { screenReturn = currentScreen; showScreen('howto'); });
on('btn-settings', () => { renderSettings(); showScreen('settings'); });
on('btn-pause', () => pause());
on('btn-resume', () => { G.paused = false; showScreen(null); });
on('btn-restart', () => (G.chain ? startVisitStage() : G.salon ? startSalon(G.mode) : G.mode === 'zen' ? startZen() : G.mode === 'ear' ? startEar(G.level) : startLevel(G.level)));
on('btn-quit', () => goMenu());
on('btn-next', () => (G.chain ? visitNext() : G.salon ? startSalon(G.mode) : G.mode === 'ear' ? startEar(save.earLevel) : openIntro(G.level + 1)));
on('btn-res-menu', () => { const wasHair = G.mode === 'hair'; goMenu(); if (wasHair) showSalon(); });
on('btn-finish', () => (G.salon ? endSalon : G.mode === 'ear' ? endEar : afterWipe)());
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
applyTheme();
// daily bonus: playing on consecutive days builds a streak worth more coins
let dailyNote = '';
{
  const day = (d) => d.toLocaleDateString('en-CA');
  const today = day(new Date()), yesterday = day(new Date(Date.now() - 864e5));
  if (save.lastDay !== today) {
    save.streak = save.lastDay === yesterday ? save.streak + 1 : 1;
    save.lastDay = today;
    const bonus = Math.min(250, 50 * save.streak);
    save.coins += bonus;
    store.save(save);
    dailyNote = save.streak > 1 ? `Day ${save.streak} streak! +${bonus} coins 🔥` : `Daily bonus: +${bonus} coins`;
  }
}
resize();
startDemo();
showScreen('menu');
const firstRun = !localStorage.getItem('zit-seen-howto');
if (firstRun) {
  try { localStorage.setItem('zit-seen-howto', '1'); } catch {}
  screenReturn = 'menu';
  showScreen('howto');
}
// the very first thing: who are you, and what's your salon called?
if (!save.profile.name) { renderThemes(); showScreen('welcome'); }
requestAnimationFrame(frame);
{
  const got = checkAwards();
  $('streak').textContent = `${rankFor(awardCount())} · 🏆 ${awardCount()}/${AWARDS.length}${save.streak > 1 ? ` · 🔥 ${save.streak} days` : ''}`;
  if (got.length) dailyNote = `${got.length} award${got.length > 1 ? 's' : ''} earned 🏆 ${dailyNote ? '· ' + dailyNote : ''}`;
}
if (dailyNote) setTimeout(() => toast(dailyNote, 3600), 700);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console
window.__zit = G;
G.step = (dt) => { update(dt); render(); }; // advance one frame by hand (testing)
