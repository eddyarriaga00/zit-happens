// Saved progress and settings live in localStorage on the phone.
const KEY = 'zit-happens-v1';

const DEFAULTS = {
  level: 1,
  bestScore: 0,
  totalPops: 0,
  totalPus: 0,      // in "ml"
  perfects: 0,
  ouches: 0,
  levelsCleared: 0,
  zenPops: 0,
  earLevel: 1,
  earWax: 0,
  earsCleaned: 0,
  earStars: {},
  coins: 0,
  profile: { name: '', salon: '', theme: 'violet' },   // who you are, what your salon is called, your colour
  salon: { wash: 1, chair: 1, colour: 0, style: 0, decor: 0 },   // hair salon station levels
  salonClients: 0,
  salonHappy: 0,    // clients who got exactly what they asked for
  awards: {},       // id -> true
  byType: {},       // pimple type -> how many finished
  patches: 0,
  sprays: 0,
  masks: 0,
  spaDays: 0,       // full treatments given
  bestCombo: 0,
  flawless: 0,      // patients finished without bleeding
  bossPops: 0,
  makeupDone: 0,
  haircutDone: 0,
  stripsDone: 0,
  browsDone: 0,
  visits: 0,        // VIP clients seen all the way through
  fiveStars: 0,
  reviews: [],      // newest first: { n, s, t }
  regulars: {},     // VIP clients who have been before: name -> { v: visits, s: her last rating }
  dailyDone: '',    // day today's VIP was finished
  lastDay: '',      // YYYY-MM-DD of the last day played
  streak: 0,
  rewards: {},      // level -> true once its reward has been collected
  upgrades: {},     // id -> level bought
  pus: 'classic',
  pusOwned: ['classic'],
  stars: {},        // level -> best stars
  settings: { sound: true, haptics: true, skin: 1, steps: true },
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const data = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) }, salon: { ...DEFAULTS.salon, ...(data.salon || {}) }, profile: { ...DEFAULTS.profile, ...(data.profile || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode etc. */ }
}

export function reset() {
  const fresh = structuredClone(DEFAULTS);
  save(fresh);
  return fresh;
}
