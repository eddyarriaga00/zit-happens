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
    return { ...structuredClone(DEFAULTS), ...data, settings: { ...DEFAULTS.settings, ...(data.settings || {}) } };
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
