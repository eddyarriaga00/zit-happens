// Game content: the patients (levels), their goals, and the shop.
// Edit freely: add a patient to LEVELS and it shows up on the map.

export const CHAPTERS = [
  { name: 'Chapter 1 · Fresh Faces', from: 1, to: 10 },
  { name: 'Chapter 2 · Stubborn Spots', from: 11, to: 20 },
  { name: 'Chapter 3 · The Deep End', from: 21, to: 30 },
];

// Goals (each one met = one extra star, on top of the star for clearing the face):
//   'noOuch'         no bleeding at all
//   ['perfect', n]   at least n Perfect releases
//   ['clean', pct]   wipe the face at least pct% clean
//   ['time', sec]    finish the popping step within sec seconds
//   ['combo', n]     reach a combo of n Perfects in a row
// mix: how many of each pimple. skin: 0 (lightest) .. 4 (deepest).
// later: surprise breakouts mid-level. sensitive: bleeds sooner.
const P = (name, age, blurb, skin, mix, goals, opt = {}) => ({ name, age, blurb, skin, mix, goals, ...opt });

export const LEVELS = [
  // ---- Chapter 1
  P('Mia', 16, 'Prom is tomorrow. Help!', 1, { white: 5 }, [['perfect', 2], ['clean', 85]]),
  P('Jade', 17, "These dots on my nose won't budge.", 0, { white: 4, black: 3 }, ['noOuch', ['perfect', 4]]),
  P('Priya', 19, "There's a deep one that really hurts.", 3, { white: 4, black: 2, cyst: 1 }, [['clean', 90], ['perfect', 4]]),
  P('Lea', 22, 'Waxed my lip in a hurry. Regret it.', 2, { white: 4, black: 2, hair: 2 }, ['noOuch', ['time', 45]]),
  P('Sofia', 15, 'School photos on Friday!!', 1, { white: 6, black: 3, gold: 1 }, [['perfect', 6], ['combo', 4]]),
  P('Maya', 28, 'Gym towel. Bad idea.', 4, { white: 5, cyst: 2, hair: 1 }, ['noOuch', ['clean', 90]], { later: 2 }),
  P('Hana', 20, "I've been stress-snacking.", 1, { white: 7, black: 4 }, [['time', 50], ['perfect', 7]]),
  P('Dani', 24, 'My chin hairs are fighting back.', 2, { hair: 4, white: 4, black: 2 }, ['noOuch', ['perfect', 7]]),
  P('Chloe', 18, 'Sensitive skin. Please be gentle.', 0, { white: 6, black: 3, cyst: 1 }, ['noOuch', ['clean', 92]], { sensitive: true }),
  P('Big Toni', 35, "I've had this thing for years.", 2, { boss: 1, white: 5, black: 3 }, [['perfect', 6], 'noOuch']),

  // ---- Chapter 2
  P('Aisha', 21, 'Maskne is real.', 3, { white: 6, black: 4, cyst: 1 }, ['noOuch', ['perfect', 7]], { later: 2 }),
  P('Bea', 30, 'Bike helmet, all summer.', 1, { white: 5, hair: 3, cyst: 2 }, [['clean', 92], ['time', 60]]),
  P('Yuki', 17, 'Big date. BIG pimple.', 0, { cyst: 3, white: 4, gold: 1 }, ['noOuch', ['combo', 5]]),
  P('Olive', 26, "I tried a 'home remedy'.", 2, { white: 7, black: 3 }, ['noOuch', ['perfect', 8]], { later: 2, sensitive: true }),
  P('Luna', 19, 'Festival glitter never came off.', 1, { white: 6, black: 5, gold: 2 }, [['perfect', 9], ['clean', 92]], { later: 2 }),
  P('Greta', 41, 'Never wax your own back.', 1, { hair: 6, white: 3, cyst: 1 }, ['noOuch', ['time', 55]]),
  P('Zoe', 16, 'Chocolate. So much chocolate.', 4, { white: 9, black: 2 }, [['combo', 6], ['perfect', 9]], { later: 3 }),
  P('Riya', 23, 'Swim team chlorine face.', 3, { black: 7, white: 3, cyst: 2 }, [['time', 60], 'noOuch']),
  P('Nina', 27, "Please don't judge.", 0, { cyst: 3, hair: 3, white: 3 }, ['noOuch', ['clean', 94]], { sensitive: true }),
  P('Grandma Jo', 71, "Had this beauty since '89.", 1, { boss: 1, cyst: 2, white: 4, black: 3 }, ['noOuch', ['perfect', 7]], { later: 2 }),

  // ---- Chapter 3
  P('Tess', 18, 'Finals week destroyed me.', 0, { white: 8, black: 4, cyst: 2 }, [['perfect', 10], ['time', 75]], { later: 3 }),
  P('Andrea', 33, 'Chef life: grease everywhere.', 4, { black: 8, white: 4, hair: 2 }, ['noOuch', ['clean', 94]], { later: 2 }),
  P('Mei', 25, 'It has its own heartbeat.', 1, { cyst: 4, white: 4, gold: 1 }, ['noOuch', ['combo', 6]]),
  P('Vika', 38, 'Home waxing kit. Never again.', 0, { hair: 7, cyst: 2, white: 2 }, [['time', 65], ['perfect', 9]]),
  P('Poppy', 20, "Yes, that's my real name.", 2, { white: 7, black: 4, cyst: 2, gold: 2 }, [['perfect', 12], ['clean', 94]], { later: 3 }),
  P('Sami', 29, 'Marathon sweat. 26 miles of it.', 3, { white: 8, hair: 3, black: 3 }, ['noOuch', ['time', 80]], { later: 3, sensitive: true }),
  P('Ivy', 22, 'I picked at it. I know. I KNOW.', 1, { cyst: 4, white: 5 }, ['noOuch', ['perfect', 9]], { later: 2, sensitive: true }),
  P('Bruna', 45, 'My sister sent me.', 2, { hair: 4, black: 6, cyst: 3 }, [['combo', 7], ['clean', 95]], { later: 3 }),
  P('Kira', 19, 'Everything at once, apparently.', 4, { white: 5, black: 4, cyst: 3, hair: 3, gold: 1 }, ['noOuch', ['perfect', 12]], { later: 3 }),
  P('Dr. Squeeze', 50, 'Even doctors need a doctor.', 1, { boss: 2, cyst: 2, white: 4, black: 3, hair: 2 }, ['noOuch', ['perfect', 10]], { later: 3 }),
];

// Which part of the body each patient's breakout is on (the close-up scene).
const ZONES = ('forehead nose cheek chin forehead back cheek chin cheek back '
  + 'chin forehead nose cheek forehead back cheek shoulder chin back '
  + 'forehead nose shoulder chin cheek back chin shoulder forehead nose').split(' ');
LEVELS.forEach((l, i) => { l.zone = ZONES[i]; });
export const ALL_ZONES = ['forehead', 'nose', 'cheek', 'chin', 'back', 'shoulder'];

/** Definition for any level number; past the hand-made ones it's an endless walk-in. */
export function levelDef(n) {
  return LEVELS[n - 1] || {
    name: `Walk-in #${n - LEVELS.length}`, age: 16 + (n * 7) % 40, blurb: 'Surprise me, doc.',
    skin: n % 5, mix: null, goals: ['noOuch', ['clean', 92]], endless: true, zone: ALL_ZONES[n % 6],
  };
}

export function goalLabel(g) {
  if (g === 'noOuch') return 'No ouches (no bleeding)';
  const [k, v] = g;
  if (k === 'perfect') return `${v} Perfect pops`;
  if (k === 'clean') return `Wipe ${v}% clean`;
  if (k === 'time') return `Pop them all in ${v}s`;
  if (k === 'combo') return `Combo of ${v} Perfects in a row`;
  return '';
}

/** r = { ouches, perfects, clean (0..1), popTime, maxCombo } */
export function goalMet(g, r) {
  if (g === 'noOuch') return r.ouches === 0;
  const [k, v] = g;
  if (k === 'perfect') return r.perfects >= v;
  if (k === 'clean') return Math.round(r.clean * 100) >= v;
  if (k === 'time') return r.popTime <= v;
  if (k === 'combo') return r.maxCombo >= v;
  return false;
}

export const timeGoal = (def) => {
  const g = def && def.goals.find((x) => Array.isArray(x) && x[0] === 'time');
  return g ? g[1] : 0;
};

// ---- shop
export const UPGRADES = [
  { id: 'steady', name: 'Steady Hands', desc: 'More time to let go for a Perfect', costs: [150, 350, 700] },
  { id: 'loop', name: 'Power Loop', desc: 'The Loop tool extracts faster', costs: [120, 300, 600] },
  { id: 'pad', name: 'Mega Pad', desc: 'The Wipe pad covers more', costs: [100, 250, 500] },
  { id: 'spa', name: 'Spa Pro', desc: 'Faster washing, steaming and gel', costs: [120, 300, 600] },
  { id: 'lucky', name: 'Lucky Charm', desc: 'More golden pimples', costs: [200, 450, 900] },
  { id: 'magnet', name: 'Coin Magnet', desc: '+15% coins from every patient', costs: [250, 500, 1000] },
];

export const PUS_STYLES = [
  { id: 'classic', name: 'Classic', color: null, swatch: '#f3e2a0', cost: 0 },
  { id: 'berry', name: 'Strawberry', color: '#ff9ec4', swatch: '#ff9ec4', cost: 300 },
  { id: 'slime', name: 'Slime', color: '#a8e06a', swatch: '#a8e06a', cost: 300 },
  { id: 'glitter', name: 'Glitter', color: '#ffd84d', swatch: '#ffd84d', cost: 600 },
];

// ---- what you earn for clearing each level (index 0 = level 1). One per level.
//   tool: unlocks a tool · patch: a new patch shape · upgrade: a free upgrade level
//   pus: a pus style · coins: a bag of coins
const T = (id, name, desc) => ({ kind: 'tool', id, name, desc });
const U = (id, name) => ({ kind: 'upgrade', id, name: `${name} upgrade`, desc: 'A free upgrade level' });
const C = (n) => ({ kind: 'coins', n, name: `${n} coins`, desc: 'A bonus from a grateful patient' });
export const REWARDS = [
  T('extractor', 'Loop tool', 'Pops blackheads in a flash, with less mess'),
  T('needle', 'Needle', 'Opens deep cysts so they squeeze out fast'),
  T('tweezers', 'Tweezers', 'Pull out ingrown hairs'),
  T('spray', 'Antiseptic spray', 'Disinfects popped spots for bonus points'),
  T('patch', 'Pimple patches', 'Stick one on a popped spot for bonus points'),
  { kind: 'patch', id: 'heart', name: 'Heart patches', desc: 'A new patch shape' },
  { kind: 'patch', id: 'star', name: 'Star patches', desc: 'A new patch shape' },
  C(200), U('pad', 'Mega Pad'),
  { kind: 'pus', id: 'berry', name: 'Strawberry pus', desc: 'A new pus style (pick it in the Shop)' },
  U('steady', 'Steady Hands'), U('loop', 'Power Loop'), U('spa', 'Spa Pro'), C(250), U('lucky', 'Lucky Charm'),
  U('magnet', 'Coin Magnet'), U('pad', 'Mega Pad'), C(300), U('steady', 'Steady Hands'),
  { kind: 'pus', id: 'slime', name: 'Slime pus', desc: 'A new pus style (pick it in the Shop)' },
  U('loop', 'Power Loop'), U('spa', 'Spa Pro'), C(400), U('lucky', 'Lucky Charm'), U('magnet', 'Coin Magnet'),
  U('pad', 'Mega Pad'), C(500), U('steady', 'Steady Hands'), U('loop', 'Power Loop'),
  { kind: 'pus', id: 'glitter', name: 'Glitter pus', desc: 'A new pus style (pick it in the Shop)' },
];
/** Reward for clearing level n (endless levels pay coins). */
export const rewardFor = (n) => REWARDS[n - 1] || C(150);
/** The level you must clear to unlock each tool (0 = yours from the start). */
export const TOOL_LEVEL = { finger: 0, pad: 0, extractor: 1, needle: 2, tweezers: 3, spray: 4, patch: 5 };

// ---- awards: earned from lifetime stats, each pays coins once.
// s = the save data plus starTotal and upgradeTotal.
const A = (id, name, desc, test, coins) => ({ id, name, desc, test, coins });
export const AWARDS = [
  A('pop1', 'First Pop', 'Pop your first pimple', (s) => s.totalPops >= 1, 30),
  A('pop50', 'Popper', 'Pop 50 pimples', (s) => s.totalPops >= 50, 100),
  A('pop200', 'Pop Star', 'Pop 200 pimples', (s) => s.totalPops >= 200, 250),
  A('pop500', 'Pop Legend', 'Pop 500 pimples', (s) => s.totalPops >= 500, 500),
  A('perf10', 'Steady Hands', '10 Perfect pops', (s) => s.perfects >= 10, 60),
  A('perf100', 'Surgeon', '100 Perfect pops', (s) => s.perfects >= 100, 250),
  A('perf300', 'Untouchable', '300 Perfect pops', (s) => s.perfects >= 300, 500),
  A('combo5', 'On a Roll', 'A combo of 5 Perfects', (s) => s.bestCombo >= 5, 80),
  A('combo10', 'Unstoppable', 'A combo of 10 Perfects', (s) => s.bestCombo >= 10, 200),
  A('gentle1', 'Gentle Touch', 'Finish a patient with no bleeding', (s) => s.flawless >= 1, 80),
  A('gentle10', 'Painless', '10 patients with no bleeding', (s) => s.flawless >= 10, 250),
  A('boss1', 'Giant Slayer', 'Drain a boss pimple', (s) => s.bossPops >= 1, 150),
  A('lvl5', 'Getting Busy', 'Clear 5 patients', (s) => s.level > 5, 100),
  A('lvl10', 'Chapter One', 'Finish Chapter 1', (s) => s.level > 10, 200),
  A('lvl20', 'Chapter Two', 'Finish Chapter 2', (s) => s.level > 20, 300),
  A('lvl30', 'Clinic Hero', 'Finish Chapter 3', (s) => s.level > 30, 500),
  A('star30', 'Star Collector', 'Earn 30 stars', (s) => s.starTotal >= 30, 150),
  A('star60', 'Shining', 'Earn 60 stars', (s) => s.starTotal >= 60, 300),
  A('star90', 'Perfectionist', 'Earn all 90 stars', (s) => s.starTotal >= 90, 600),
  A('ear5', 'Ear Whisperer', 'Clean 5 ears', (s) => s.earsCleaned >= 5, 100),
  A('wax50', 'Wax Museum', 'Pull out 50 lumps of wax', (s) => s.earWax >= 50, 150),
  A('zen50', 'Zen Master', '50 pops in Zen mode', (s) => s.zenPops >= 50, 100),
  A('glam1', 'Glam Squad', 'Finish a makeup look', (s) => s.makeupDone >= 1, 60),
  A('glam5', 'Makeup Artist', 'Finish 5 makeup looks', (s) => s.makeupDone >= 5, 200),
  A('trim1', 'First Trim', 'Finish a haircut', (s) => s.haircutDone >= 1, 60),
  A('trim5', 'Stylist', 'Finish 5 haircuts', (s) => s.haircutDone >= 5, 200),
  A('day3', 'Regular', 'Play 3 days in a row', (s) => s.streak >= 3, 100),
  A('day7', 'Devoted', 'Play 7 days in a row', (s) => s.streak >= 7, 300),
  A('shop6', 'Kitted Out', 'Own 6 upgrade levels', (s) => s.upgradeTotal >= 6, 150),
  A('shop18', 'Top of the Line', 'Max out every upgrade', (s) => s.upgradeTotal >= 18, 600),
];
// your title, from how many awards you hold
export const RANKS = ['Trainee', 'Assistant', 'Esthetician', 'Specialist', 'Expert', 'Master', 'Legend'];
export const rankFor = (count) => RANKS[Math.min(RANKS.length - 1, Math.floor(count / 4))];
