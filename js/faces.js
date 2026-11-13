// 2D patient portraits. Every patient gets a face built from a few traits:
// hair style and color, eyes, brows, facial hair, glasses, age.
// The same traits color the close-up scene (hairline, eyebrows, stubble).

import { renderFaceScene, drawMood } from './facescene.js';
import { SKIN_TONES, rgba } from './skin.js';

// name: [hair style, hair color, extras]
// styles: short | long | pony | bun | curly | buzz | bald | balding
// extras: f (softer features, lashes) · beard · stubble · stache · glasses
const LOOKS = {
  'Mia': ['long', '#5a3825', 'f'],
  'Jade': ['pony', '#c9a45c', 'f'],
  'Priya': ['long', '#1c1412', 'f'],
  'Lea': ['short', '#3a2618', 'f'],
  'Sofia': ['pony', '#8a3b1e', 'f'],
  'Maya': ['curly', '#15100e', 'f'],
  'Hana': ['bun', '#1a1310', 'f'],
  'Dani': ['long', '#1d1512', 'f'],
  'Chloe': ['long', '#e2c078', 'f'],
  'Big Toni': ['bun', '#2a1d16', 'f'],
  'Aisha': ['curly', '#17110f', 'f'],
  'Bea': ['short', '#6b4a2e', 'f glasses'],
  'Yuki': ['bun', '#191210', 'f'],
  'Olive': ['pony', '#17110e', 'f'],
  'Luna': ['long', '#d6679f', 'f'],
  'Greta': ['bun', '#6e4b30', 'f'],
  'Zoe': ['curly', '#15100d', 'f'],
  'Riya': ['long', '#17110e', 'f'],
  'Nina': ['long', '#a8421c', 'f glasses'],
  'Grandma Jo': ['bun', '#cfcfcf', 'f glasses'],
  'Tess': ['pony', '#d8b56a', 'f'],
  'Andrea': ['pony', '#15100e', 'f'],
  'Mei': ['long', '#17110f', 'f'],
  'Vika': ['short', '#c8a55e', 'f'],
  'Poppy': ['curly', '#c8622a', 'f'],
  'Sami': ['pony', '#5c3d26', 'f'],
  'Ivy': ['bun', '#5a3a24', 'f glasses'],
  'Bruna': ['curly', '#8f8f8f', 'f'],
  'Kira': ['long', '#7d55c7', 'f'],
  'Dr. Squeeze': ['bun', '#b9b9b9', 'f glasses'],
};

const STYLES = ['short', 'long', 'pony', 'bun', 'curly', 'long'];
const HAIRS = ['#1c1412', '#3a2618', '#5a3825', '#8a3b1e', '#c9a45c', '#17110f'];
const EYES = ['#5b3a21', '#3f2a18', '#4a6b8a', '#5a7d4f', '#2e2019'];
const SHIRTS = ['#7fb8e6', '#f2a7c3', '#9ad1b0', '#c7b1ec', '#f4d58a', '#ee9f8c', '#9aa7b8'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The traits for a patient definition (from levels.js). */
export function lookFor(def) {
  const name = (def && def.name) || 'walk-in';
  const h = hash(name);
  const L = LOOKS[name];
  const style = L ? L[0] : STYLES[h % STYLES.length];
  const hair = L ? L[1] : HAIRS[(h >>> 3) % HAIRS.length];
  const ex = L ? L[2] : ['f', 'f', 'f glasses', 'f', 'f', 'f glasses'][(h >>> 6) % 6];
  const age = (def && def.age) || 25;
  return {
    name, style, hair, age,
    fem: /\bf\b/.test(ex),
    beard: ex.includes('beard'), stubble: ex.includes('stubble'), stache: ex.includes('stache'),
    glasses: ex.includes('glasses'),
    // deeper skin tones almost always come with brown eyes
    eye: ((def && def.skin != null ? def.skin : h % 5) >= 3 ? ['#5b3a21', '#3f2a18', '#2e2019'] : EYES)[(h >>> 9) % ((def && def.skin != null ? def.skin : h % 5) >= 3 ? 3 : EYES.length)],
    shirt: SHIRTS[(h >>> 12) % SHIRTS.length],
    tone: SKIN_TONES[(def && def.skin != null ? def.skin : h % 5)] || SKIN_TONES[1],
    seed: h,
  };
}

const hashName = (t) => { let h = 7; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h || 1; };

export function portraitURL(def, opts = {}, size = 240) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  c.width = c.height = size * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const look = lookFor(def);
  try {
    // framed like a passport photo: the whole head with a little room above the hair
    const w = size * 1.39, k = 0.8, xo = -(w * k - size) / 2, yo = size * 0.52 - 0.5336 * w * k;
    const scene = renderFaceScene(w, w, Math.min(2, dpr * k + 0.5), SKIN_TONES[def.skin] || SKIN_TONES[1], hashName(def.name), look, w * 0.12, w);
    x.drawImage(scene.canvas, xo, yo, w * k, w * k);
    // she looks how she feels: worried before, pleased after
    x.save(); x.translate(xo, yo); x.scale(k, k);
    drawMood(x, scene.geo, opts.mood === 'happy' ? 1 : opts.mood === 'worried' ? -0.8 : 0);
    x.restore();
    if (!opts.clear && ['forehead', 'nose', 'cheek', 'chin'].includes(opts.zone)) {     // a back or shoulder breakout doesn't show on her face
      // before: an angry little breakout where the trouble is
      x.save(); x.translate(xo, yo); x.scale(k, k);
      const g = scene.geo;
      for (let i = 0; i < 9; i++) {
        const pt = g.zonePoint(opts.zone), r = g.hw * (0.04 + 0.02 * ((i * 7) % 3));
        const gr = x.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r * 2.2);
        gr.addColorStop(0, 'rgba(214,60,60,0.85)'); gr.addColorStop(1, 'rgba(214,60,60,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(pt.x, pt.y, r * 2.2, 0, 7); x.fill();
        x.fillStyle = '#fff3c4'; x.beginPath(); x.arc(pt.x, pt.y, r * 0.5, 0, 7); x.fill();
      }
      x.restore();
    }
  } catch {
    x.fillStyle = '#f6dfe8'; x.fillRect(0, 0, size, size);     // a soft blank card, never a drawn face
  }
  return c.toDataURL('image/jpeg', 0.9);
}
