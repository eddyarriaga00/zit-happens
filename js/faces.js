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

/**
 * Draw a head-and-shoulders portrait centered at (cx, cy); s = head width in px.
 * opts.mood: 'worried' | 'happy'. opts.zone: where the breakout is (adds spots there
 * and circles it). opts.clear: no spots (after treatment).
 */
export function drawFace(ctx, cx, cy, s, look, opts = {}) {
  const { tone } = look;
  const mood = opts.mood || 'worried';
  let seed = look.seed || 1;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hw = s / 2, hh = s * 0.66;           // head half-width / half-height
  const hairDark = look.hair;
  const old = look.age >= 55;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // long hair falls behind the shoulders
  if (look.style === 'long' || look.style === 'curly') {
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    const wide = look.style === 'curly' ? 1.45 : 1.18;
    ctx.ellipse(0, hh * 0.25, hw * wide, hh * (look.style === 'curly' ? 1.15 : 1.5), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (look.style === 'pony') {
    ctx.fillStyle = hairDark;
    ctx.beginPath(); ctx.ellipse(hw * 0.95, -hh * 0.2, hw * 0.3, hh * 0.75, -0.35, 0, Math.PI * 2); ctx.fill();
  }
  if (look.style === 'bun') {
    ctx.fillStyle = hairDark;
    ctx.beginPath(); ctx.arc(0, -hh * 1.18, hw * 0.4, 0, Math.PI * 2); ctx.fill();
  }

  // shoulders + neck
  ctx.fillStyle = look.shirt;
  ctx.beginPath();
  ctx.moveTo(-hw * 1.75, hh * 2.1);
  ctx.quadraticCurveTo(-hw * 1.6, hh * 1.3, -hw * 0.5, hh * 1.18);
  ctx.lineTo(hw * 0.5, hh * 1.18);
  ctx.quadraticCurveTo(hw * 1.6, hh * 1.3, hw * 1.75, hh * 2.1);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = tone.shade;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.42, hh * 0.6); ctx.lineTo(-hw * 0.46, hh * 1.2);
  ctx.quadraticCurveTo(0, hh * 1.5, hw * 0.46, hh * 1.2);
  ctx.lineTo(hw * 0.42, hh * 0.6);
  ctx.closePath(); ctx.fill();

  // ears
  for (const d of [-1, 1]) {
    ctx.fillStyle = tone.bump;
    ctx.beginPath(); ctx.ellipse(d * hw * 0.98, hh * 0.02, hw * 0.14, hh * 0.2, d * 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(tone.pore, 0.5);
    ctx.lineWidth = s * 0.012;
    ctx.beginPath(); ctx.arc(d * hw * 0.99, hh * 0.02, hw * 0.07, d > 0 ? -1.2 : Math.PI - 1.2 + 2.4 - 2.4, d > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
  }

  // head: wider at the cheekbones, narrowing to the chin
  const jaw = look.fem ? 0.6 : 0.72;
  const head = () => {
    ctx.beginPath();
    ctx.moveTo(0, -hh);
    ctx.bezierCurveTo(hw * 0.95, -hh, hw * 1.06, -hh * 0.2, hw * 0.98, hh * 0.15);
    ctx.bezierCurveTo(hw * 0.92, hh * 0.62, hw * jaw, hh * 0.98, 0, hh);
    ctx.bezierCurveTo(-hw * jaw, hh * 0.98, -hw * 0.92, hh * 0.62, -hw * 0.98, hh * 0.15);
    ctx.bezierCurveTo(-hw * 1.06, -hh * 0.2, -hw * 0.95, -hh, 0, -hh);
    ctx.closePath();
  };
  const g = ctx.createRadialGradient(-hw * 0.25, -hh * 0.3, s * 0.05, 0, 0, hh * 1.25);
  g.addColorStop(0, tone.base);
  g.addColorStop(0.75, tone.base);
  g.addColorStop(1, tone.shade);
  ctx.fillStyle = g;
  head(); ctx.fill();

  ctx.save();
  head(); ctx.clip();
  // jaw shadow, cheek color
  ctx.fillStyle = rgba(tone.shade, 0.5);
  ctx.beginPath(); ctx.ellipse(0, hh * 1.25, hw * 1.1, hh * 0.42, 0, 0, Math.PI * 2); ctx.fill();
  for (const d of [-1, 1]) {
    const b = ctx.createRadialGradient(d * hw * 0.55, hh * 0.3, 0, d * hw * 0.55, hh * 0.3, hw * 0.34);
    b.addColorStop(0, rgba(tone.blush, 0.45));
    b.addColorStop(1, rgba(tone.blush, 0));
    ctx.fillStyle = b;
    ctx.fillRect(-hw, -hh, s, hh * 2);
  }
  // beard / stubble shading
  if (look.beard || look.stubble) {
    ctx.fillStyle = rgba(hairDark === '#cfcfcf' ? '#9a9a9a' : hairDark, look.beard ? 0.92 : 0.28);
    ctx.beginPath();
    ctx.moveTo(-hw, hh * 0.1);
    ctx.quadraticCurveTo(-hw * 0.7, hh * 0.45, -hw * 0.32, hh * 0.42);
    ctx.quadraticCurveTo(0, hh * 0.3, hw * 0.32, hh * 0.42);
    ctx.quadraticCurveTo(hw * 0.7, hh * 0.45, hw, hh * 0.1);
    ctx.lineTo(hw, hh * 1.1); ctx.lineTo(-hw, hh * 1.1);
    ctx.closePath(); ctx.fill();
  }
  // hair on top (clipped to the skull so the hairline looks right)
  if (look.style !== 'bald') {
    ctx.fillStyle = hairDark;
    ctx.beginPath();
    if (look.style === 'balding') {
      for (const d of [-1, 1]) { ctx.moveTo(d * hw * 1.1, -hh * 0.75); ctx.ellipse(d * hw * 1.0, -hh * 0.3, hw * 0.3, hh * 0.5, 0, 0, Math.PI * 2); }
    } else if (look.style === 'buzz') {
      ctx.ellipse(0, -hh * 0.98, hw * 1.05, hh * 0.5, 0, 0, Math.PI * 2);
    } else {
      // fringe swept to one side
      ctx.moveTo(-hw * 1.1, -hh * 1.1);
      ctx.lineTo(hw * 1.1, -hh * 1.1);
      ctx.lineTo(hw * 1.1, -hh * 0.2);
      ctx.quadraticCurveTo(hw * 0.75, -hh * 0.55, hw * 0.3, -hh * 0.62);
      ctx.quadraticCurveTo(-hw * 0.4, -hh * 0.7, -hw * 0.72, -hh * 0.42);
      ctx.quadraticCurveTo(-hw * 0.95, -hh * 0.3, -hw * 1.1, -hh * 0.1);
      ctx.closePath();
    }
    ctx.fill();
    if (look.style === 'buzz') { ctx.fillStyle = rgba(tone.base, 0.25); ctx.beginPath(); ctx.ellipse(0, -hh * 0.98, hw * 1.05, hh * 0.5, 0, 0, Math.PI * 2); ctx.fill(); }
    // strand highlights
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = s * 0.012;
    for (let i = 0; i < 9; i++) {
      const x0 = -hw * 0.8 + R() * s * 0.8;
      ctx.beginPath(); ctx.moveTo(x0, -hh * 1.0); ctx.quadraticCurveTo(x0 + s * 0.06, -hh * 0.8, x0 + s * 0.1, -hh * (0.56 + R() * 0.1)); ctx.stroke();
    }
  }
  ctx.restore();

  // curly volume on top
  if (look.style === 'curly') {
    ctx.fillStyle = hairDark;
    for (let i = 0; i < 16; i++) {
      const a = Math.PI + (i / 15) * Math.PI;
      ctx.beginPath(); ctx.arc(Math.cos(a) * hw * 1.05, -hh * 0.35 + Math.sin(a) * hh * 0.8, hw * (0.2 + R() * 0.1), 0, Math.PI * 2); ctx.fill();
    }
  }

  // eyes
  const ey = -hh * 0.05, ex = hw * 0.42, ew = hw * 0.2, eh = hh * (mood === 'happy' ? 0.07 : 0.1);
  for (const d of [-1, 1]) {
    const x = d * ex;
    ctx.fillStyle = '#fbf7f2';
    ctx.beginPath(); ctx.ellipse(x, ey, ew, eh, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, ey, ew, eh, 0, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = look.eye;
    ctx.beginPath(); ctx.arc(x, ey, eh * 0.95, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#120c0a';
    ctx.beginPath(); ctx.arc(x, ey, eh * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x - eh * 0.3, ey - eh * 0.35, eh * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // upper lid + lashes
    ctx.strokeStyle = '#2a1a14';
    ctx.lineWidth = s * (look.fem ? 0.022 : 0.014);
    ctx.beginPath(); ctx.ellipse(x, ey, ew, eh, 0, Math.PI, Math.PI * 2); ctx.stroke();
    if (look.fem) {
      ctx.lineWidth = s * 0.012;
      ctx.beginPath(); ctx.moveTo(x + d * ew, ey); ctx.lineTo(x + d * ew * 1.3, ey - eh * 0.7); ctx.stroke();
    }
    // brows: pinched up in the middle when worried
    ctx.strokeStyle = rgba(hairDark === '#cfcfcf' || hairDark === '#b9b9b9' || hairDark === '#8f8f8f' ? '#8a8a8a' : hairDark, 0.95);
    ctx.lineWidth = s * (look.fem ? 0.028 : 0.04);
    const lift = mood === 'worried' ? -hh * 0.07 : 0;
    ctx.beginPath();
    ctx.moveTo(x - d * ew * 1.1, ey - hh * 0.2 + lift);
    ctx.quadraticCurveTo(x, ey - hh * 0.27, x + d * ew * 1.25, ey - hh * 0.18 - lift * 0.4);
    ctx.stroke();
    if (old) {
      ctx.strokeStyle = rgba(tone.pore, 0.4);
      ctx.lineWidth = s * 0.008;
      ctx.beginPath(); ctx.moveTo(x + d * ew * 1.2, ey + eh * 0.5); ctx.lineTo(x + d * ew * 1.6, ey + eh * 1.4); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, ey + eh * 1.9, ew * 0.9, 0.3, Math.PI - 0.3); ctx.stroke();
    }
  }
  if (old) {
    ctx.strokeStyle = rgba(tone.pore, 0.35);
    ctx.lineWidth = s * 0.008;
    for (const k of [0.5, 0.62]) { ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * k); ctx.quadraticCurveTo(0, -hh * (k + 0.04), hw * 0.5, -hh * k); ctx.stroke(); }
  }

  // nose
  ctx.strokeStyle = rgba(tone.pore, 0.55);
  ctx.lineWidth = s * 0.014;
  ctx.beginPath();
  ctx.moveTo(-hw * 0.06, hh * 0.02);
  ctx.quadraticCurveTo(-hw * 0.14, hh * 0.3, -hw * 0.15, hh * 0.34);
  ctx.quadraticCurveTo(0, hh * 0.43, hw * 0.15, hh * 0.34);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.ellipse(hw * 0.02, hh * 0.24, hw * 0.05, hh * 0.1, 0, 0, Math.PI * 2); ctx.fill();

  // mouth
  const my = hh * 0.6, mw = hw * 0.36;
  const lip = look.fem ? '#c9566c' : rgba(tone.blush, 1);
  ctx.strokeStyle = '#6b2a2a';
  ctx.lineWidth = s * 0.016;
  ctx.fillStyle = lip;
  if (mood === 'happy') {
    ctx.beginPath(); ctx.moveTo(-mw, my - hh * 0.03); ctx.quadraticCurveTo(0, my + hh * 0.2, mw, my - hh * 0.03); ctx.quadraticCurveTo(0, my + hh * 0.05, -mw, my - hh * 0.03); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-mw * 0.75, my); ctx.quadraticCurveTo(0, my + hh * 0.08, mw * 0.75, my); ctx.quadraticCurveTo(0, my + hh * 0.04, -mw * 0.75, my); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-mw, my - hh * 0.03); ctx.quadraticCurveTo(0, my + hh * 0.2, mw, my - hh * 0.03); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.ellipse(0, my + hh * 0.02, mw * 0.8, hh * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-mw * 0.85, my + hh * 0.045); ctx.quadraticCurveTo(0, my - hh * 0.03, mw * 0.85, my + hh * 0.045); ctx.stroke();
  }
  if (look.stache || look.beard) {
    ctx.strokeStyle = rgba(hairDark === '#cfcfcf' ? '#9a9a9a' : hairDark, 0.95);
    ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.moveTo(-mw * 1.05, my - hh * 0.02); ctx.quadraticCurveTo(0, my - hh * 0.16, mw * 1.05, my - hh * 0.02); ctx.stroke();
  }

  // glasses
  if (look.glasses) {
    ctx.strokeStyle = '#2b2530';
    ctx.lineWidth = s * 0.022;
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.roundRect(d * ex - ew * 1.45, ey - eh * 2, ew * 2.9, eh * 4, eh * 1.4); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-ex + ew * 1.45, ey); ctx.lineTo(ex - ew * 1.45, ey); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.roundRect(d * ex - ew * 1.45, ey - eh * 2, ew * 2.9, eh * 4, eh * 1.4); ctx.fill(); }
  }

  // the breakout, and a ring around where we'll be working
  const spots = {
    forehead: [0, -hh * 0.55, hw * 0.6, hh * 0.2],
    nose: [0, hh * 0.22, hw * 0.2, hh * 0.2],
    cheek: [hw * 0.55, hh * 0.3, hw * 0.3, hh * 0.22],
    chin: [0, hh * 0.82, hw * 0.4, hh * 0.13],
  }[opts.zone];
  if (!opts.clear) {
    const area = spots || [0, hh * 0.1, hw * 0.75, hh * 0.7];
    const n = spots ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R());
      const x = area[0] + Math.cos(a) * d * area[2], y = area[1] + Math.sin(a) * d * area[3];
      const r = s * (0.012 + R() * 0.014);
      ctx.fillStyle = 'rgba(205,50,55,0.55)';
      ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = R() < 0.6 ? '#f6ecc6' : '#c23a3f';
      ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (spots && opts.ring) {
    ctx.strokeStyle = '#7b61ff';
    ctx.lineWidth = s * 0.02;
    ctx.setLineDash([s * 0.05, s * 0.04]);
    ctx.beginPath(); ctx.ellipse(spots[0], spots[1], spots[2] * 1.25, spots[3] * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/** Portrait as an image URL, for cards in the menus. */
const hashName = (t) => { let h = 7; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h || 1; };
/** A head-and-shoulders photo of the client, painted by the same renderer as the in-game face. */
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
    x.fillStyle = '#e4dcff'; x.fillRect(0, 0, size, size);
    drawFace(x, size / 2, size * 0.44, size * 0.5, look, opts);
  }
  return c.toDataURL('image/jpeg', 0.9);
}
