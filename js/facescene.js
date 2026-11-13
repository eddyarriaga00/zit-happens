// The play scene for face levels: the patient's whole face, painted once per level
// with real skin texture, shading, eyes, nose, lips and hair. Returns the canvas plus
// "geo": where the features are, so pimples land on skin and the eyes can blink.

import { renderSkin, rgba, SKIN_TONES } from './skin.js';

// Painted portraits. When one is loaded for her skin tone, the face on screen is the painting and the
// geometry below (eyes, nose, lips, chin) is fitted to it, so every tool still lands in the right place.
// Landmarks are fractions of the image: eyeY, eL/eR (iris centres), nose (its base), mouth (the seam), chin.
export const PHOTOS = [
  { src: 'faces/girl1.jpg', tone: [1], hair: '#4a2e1f', eyeY: 0.370, eL: 0.365, eR: 0.640, nose: 0.495, mouth: 0.560, chin: 0.667 },
  { src: 'faces/girl2.jpg', tone: [0], hair: '#b5673a', eyeY: 0.368, eL: 0.369, eR: 0.641, nose: 0.495, mouth: 0.554, chin: 0.658 },
  { src: 'faces/girl3.jpg', tone: [2], hair: '#1c1412', eyeY: 0.365, eL: 0.365, eR: 0.631, nose: 0.495, mouth: 0.551, chin: 0.662 },
  { src: 'faces/girl4.jpg', tone: [3], hair: '#2a1a14', eyeY: 0.363, eL: 0.369, eR: 0.635, nose: 0.493, mouth: 0.551, chin: 0.654 },
  { src: 'faces/girl5.jpg', tone: [4], hair: '#17110f', eyeY: 0.363, eL: 0.369, eR: 0.638, nose: 0.491, mouth: 0.549, chin: 0.641 },
  { src: 'faces/girl6.jpg', tone: [0, 1], hair: '#2a1c16', eyeY: 0.359, eL: 0.369, eR: 0.638, nose: 0.487, mouth: 0.553, chin: 0.652 },
  { src: 'faces/girl7.jpg', tone: [0], hair: '#d9b87a', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.548, chin: 0.650 },
  { src: 'faces/girl8.jpg', tone: [1], hair: '#5a1f26', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.548, chin: 0.650 },
  { src: 'faces/girl9.jpg', tone: [1], hair: '#6b4a32', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.548, chin: 0.650 },
  { src: 'faces/girl10.jpg', tone: [2], hair: '#7a5234', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.548, chin: 0.650 },
  { src: 'faces/girl11.jpg', tone: [3], hair: '#17110f', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.545, chin: 0.650 },
  { src: 'faces/girl12.jpg', tone: [4], hair: '#120d0c', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.543, chin: 0.650 },
  { src: 'faces/girl13.jpg', tone: [2], hair: '#7a5234', eyeY: 0.357, eL: 0.368, eR: 0.636, nose: 0.483, mouth: 0.548, chin: 0.650 },
];
if (typeof Image !== 'undefined') for (const ph of PHOTOS) {
  ph.img = new Image(); ph.img.src = ph.src;
  // the same painting with her eyes closed, for blinking and for when her face is being washed
  ph.shut = new Image(); ph.shut.src = ph.src.replace('.jpg', 'c.jpg');
  // and with a soft smile, for when she is pleased
  ph.smile = new Image(); ph.smile.src = ph.src.replace('.jpg', 's.jpg');
  // unpacked ahead of time, so the first level that shows her does not stall while the picture decodes
  ph.img.addEventListener('load', () => { try { const d = ph.img.decode && ph.img.decode(); if (d && d.catch) d.catch(() => {}); } catch { /* fine */ } });
}
export const photosReady = typeof Image === 'undefined' ? Promise.resolve() : Promise.all(PHOTOS.map((ph) => new Promise((res) => { if (ph.img.complete) res(); else { ph.img.onload = res; ph.img.onerror = res; } })));
const loaded = (ph) => ph.img && ph.img.complete && ph.img.naturalWidth;
const pickPhoto = (tone, seed) => {
  const ti = SKIN_TONES.indexOf(tone);
  let list = PHOTOS.filter((ph) => ph.tone.includes(ti) && loaded(ph));
  if (!list.length) list = PHOTOS.filter(loaded);          // never fall back to a drawn face while any painting is there
  return list.length ? list[(seed >>> 4) % list.length] : null;
};
export const photosLoaded = () => PHOTOS.some(loaded);
// her skin colours, read off the painting once: lit cheek, the shaded side of her face, a warm in-between
const photoSkin = (ph) => {
  if (ph.skin) return ph.skin;
  try {
    const t = document.createElement('canvas'); t.width = t.height = 2;
    const tx = t.getContext('2d', { willReadFrequently: true }), iw = ph.img.naturalWidth, ih = ph.img.naturalHeight;
    const at = (fx, fy) => { tx.drawImage(ph.img, fx * iw - 12, fy * ih - 12, 24, 24, 0, 0, 2, 2); const d = tx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
    const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const lit = at(ph.eL + 0.02, ph.eyeY + 0.085), side = at(ph.eL - 0.085, ph.eyeY + 0.07);
    ph.skin = { base: hex(lit), shade: hex(side), bump: hex(lit.map((v, i) => (v + side[i]) / 2)) };
    // her eyelid colours (for blinking) and the backdrop above her head, read here once so the big
    // canvas never has to be read back from (reading it back makes every later frame slower)
    const up = (m) => ph.eyeY - m * (ph.eR - ph.eL) * iw / ih;
    ph.lid = hex(at(ph.eL, up(0.193))); ph.lidShade = hex(at(ph.eL, up(0.147)));
    tx.drawImage(ph.img, 0, 0, iw, 10, 0, 0, 2, 2); const b = tx.getImageData(0, 0, 1, 1).data;
    ph.bg = `${b[0]},${b[1]},${b[2]}`;
    // where her hair runs off the top edge of the picture (as fractions of its width), if it does
    const row = document.createElement('canvas'); row.width = 64; row.height = 1;
    const rq = row.getContext('2d', { willReadFrequently: true }); rq.drawImage(ph.img, 0, 0, iw, 6, 0, 0, 64, 1);
    const px = rq.getImageData(0, 0, 64, 1).data; let lo = -1, hi2 = -1;
    for (let c2 = 0; c2 < 64; c2++) { const dd = Math.abs(px[c2 * 4] - b[0]) + Math.abs(px[c2 * 4 + 1] - b[1]) + Math.abs(px[c2 * 4 + 2] - b[2]); if (c2 > 14 && c2 < 50 && dd > 60) { if (lo < 0) lo = c2; hi2 = c2; } }     // only the middle: the corners are backdrop or loose curls
    ph.cap = lo >= 0 && hi2 - lo > 6 ? [lo / 64, (hi2 + 1) / 64] : null;
  } catch { ph.skin = {}; }
  return ph.skin;
};
// a stand-in drawing surface that does nothing at all: every call and every property is swallowed
const NOOP = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : NOOP), set: () => true, apply: () => NOOP });
const scratch = () => NOOP;

function tint(col, k) {   // k < 1 darker, k > 1 lighter. Takes #rrggbb or rgb(r,g,b).
  let r, g, b;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else [r, g, b] = col.match(/\d+/g).map(Number);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

// The opening of an eye: the upper lid peaks toward the nose, the outer corner sits a little
// higher than the inner one, the lower lid is flatter.
function eyePath(px, py, d, erx, ery) {
  const p = new Path2D();
  p.moveTo(px - d * erx, py + ery * 0.3);
  p.bezierCurveTo(px - d * erx * 0.6, py - ery * 1.05, px + d * erx * 0.3, py - ery * 1.3, px + d * erx, py - ery * 0.12);
  p.bezierCurveTo(px + d * erx * 0.5, py + ery * 0.98, px - d * erx * 0.45, py + ery * 1.02, px - d * erx, py + ery * 0.3);
  p.closePath();
  return p;
}

// The eyeball inside that opening; gx, gy = where she is looking, -1..1.
function paintEye(ctx, px, py, d, erx, ery, col, gx, gy) {
  ctx.save();
  ctx.clip(eyePath(px, py, d, erx, ery));
  // the white of an eye is never white: a cream ball, greyer toward its corners
  const sc = ctx.createRadialGradient(px, py + ery * 0.2, erx * 0.1, px, py, erx * 1.15);
  sc.addColorStop(0, '#ebe3de'); sc.addColorStop(0.55, '#dacdc7'); sc.addColorStop(1, '#a8908b');
  ctx.fillStyle = sc; ctx.fillRect(px - erx * 1.2, py - ery * 1.6, erx * 2.4, ery * 3.2);
  const ir = ery * 0.96, ix = px + gx * erx * 0.28, iy = py - ery * 0.12 + gy * ery * 0.25;   // the lid only just covers the top of the iris: bright, awake eyes
  const ig = ctx.createRadialGradient(ix, iy, ir * 0.3, ix, iy, ir);
  ig.addColorStop(0, tint(col, 1.28)); ig.addColorStop(0.5, tint(col, 1.06)); ig.addColorStop(0.84, tint(col, 0.66)); ig.addColorStop(0.96, tint(col, 0.26)); ig.addColorStop(1, 'rgba(30,18,16,0)');
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, ir * 1.03, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.4; ctx.lineWidth = Math.max(0.4, ir * 0.035);
  for (let i = 0; i < 40; i++) {                       // fibres running out from the pupil
    const a = i * 2.39996, r0 = ir * (0.4 + (i * 7 % 5) * 0.02), r1 = ir * (0.66 + (i * 3 % 7) * 0.04);
    ctx.strokeStyle = i % 3 ? tint(col, 0.6) : tint(col, 1.6);
    ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0); ctx.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const cg = ctx.createRadialGradient(ix, iy, ir * 0.3, ix, iy, ir * 0.62);     // the paler ring round the pupil
  cg.addColorStop(0, 'rgba(255,214,150,0.2)'); cg.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.62, 0, Math.PI * 2); ctx.fill();
  const pg = ctx.createRadialGradient(ix, iy, ir * 0.3, ix, iy, ir * 0.43);
  pg.addColorStop(0, '#060404'); pg.addColorStop(1, 'rgba(6,4,4,0)');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.43, 0, Math.PI * 2); ctx.fill();
  const low = ctx.createRadialGradient(ix + ir * 0.2, iy + ir * 0.5, 0, ix + ir * 0.2, iy + ir * 0.5, ir * 0.6);   // light pooling low in the iris
  low.addColorStop(0, 'rgba(255,255,255,0.1)'); low.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = low; ctx.beginPath(); ctx.arc(ix + ir * 0.2, iy + ir * 0.5, ir * 0.6, 0, Math.PI * 2); ctx.fill();
  // the upper lid and its lashes throw a shadow across the top of the eye
  const lidSh = ctx.createLinearGradient(0, py - ery * 1.3, 0, py + ery * 0.25);
  lidSh.addColorStop(0, 'rgba(36,14,12,0.7)'); lidSh.addColorStop(0.5, 'rgba(36,14,12,0.24)'); lidSh.addColorStop(1, 'rgba(36,14,12,0)');
  ctx.fillStyle = lidSh; ctx.fillRect(px - erx * 1.2, py - ery * 1.4, erx * 2.4, ery * 1.8);
  for (const [k, c, r] of [[-0.93, '214,124,120,0.7', 0.17], [0.92, '150,96,96,0.4', 0.3]]) {      // pink inner corner, shaded outer one
    const qx = px + d * erx * k, qy = py + ery * (k < 0 ? 0.28 : 0), g = ctx.createRadialGradient(qx, qy, 0, qx, qy, erx * r);
    g.addColorStop(0, `rgba(${c})`); g.addColorStop(1, `rgba(${c.replace(/[\d.]+$/, '0')})`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(qx, qy, erx * r, 0, Math.PI * 2); ctx.fill();
  }
  // the wet rim of the lower lid
  ctx.strokeStyle = 'rgba(232,184,174,0.6)'; ctx.lineWidth = ery * 0.22;
  ctx.beginPath(); ctx.moveTo(px + d * erx, py - ery * 0.12); ctx.bezierCurveTo(px + d * erx * 0.5, py + ery * 0.98, px - d * erx * 0.45, py + ery * 1.02, px - d * erx, py + ery * 0.3); ctx.stroke();
  // the catchlights stay where the light is, so they slide across the eye as it turns
  const hx = px - ir * 0.3 + gx * erx * 0.1, hy = py - ery * 0.2 - ir * 0.3 + gy * ery * 0.08;
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(hx, hy, ir * 0.28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.beginPath(); ctx.ellipse(hx, hy, ir * 0.2, ir * 0.16, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(hx + ir * 0.26, hy + ir * 0.18, ir * 0.06, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc(ix + ir * 0.36, iy + ir * 0.34, ir * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---- Her own portrait in each salon hairstyle (hair/gN_style.jpg): the same girl painted with long
// hair, a ponytail, a bun, curls and a bob, always in plain silver. In the salon the whole picture is
// used: the pink backdrop is cut away so the salon shows behind her, and only her hair (the one thing
// with no colour in it) is tinted to the shade she has or asks for. STYLE_FIT says where her eyes are
// in each picture (worked out once by lining the picture up with her portrait).
const STYLE_FIT = {
  g1_long: [0.37, 0.3624, 0.6374], g1_pony: [0.3695, 0.3651, 0.6346], g1_bun: [0.3691, 0.3679, 0.6319], g1_curly: [0.3263, 0.3696, 0.6198], g1_short: [0.3695, 0.3651, 0.6346],
  g2_long: [0.3647, 0.3676, 0.6424], g2_pony: [0.368, 0.369, 0.641], g2_bun: [0.398, 0.372, 0.6276], g2_curly: [0.368, 0.369, 0.641], g2_short: [0.3717, 0.3676, 0.6424],
  g3_long: [0.3646, 0.3703, 0.6309], g3_pony: [0.361, 0.3664, 0.6244], g3_bun: [0.4016, 0.3743, 0.6164], g3_curly: [0.3648, 0.3637, 0.6271], g3_short: [0.3615, 0.3624, 0.6284],
  g4_long: [0.363, 0.3664, 0.6324], g4_pony: [0.363, 0.3664, 0.6324], g4_bun: [0.3655, 0.3744, 0.6245], g4_curly: [0.3232, 0.3798, 0.6192], g4_short: [0.363, 0.3664, 0.6324],
  g5_long: [0.363, 0.3664, 0.6354], g5_pony: [0.3515, 0.3705, 0.6207], g5_bun: [0.3764, 0.3704, 0.6313], g5_curly: [0.363, 0.3664, 0.6354], g5_short: [0.3628, 0.3677, 0.634],
  g6_long: [0.359, 0.3664, 0.6354], g6_pony: [0.359, 0.3664, 0.6354], g6_bun: [0.3792, 0.3731, 0.6286], g6_curly: [0.3443, 0.3757, 0.6259], g6_short: [0.3413, 0.3704, 0.6313],
  g7_long: [0.3255, 0.3694, 0.6294], g7_pony: [0.3569, 0.3667, 0.6321], g7_bun: [0.3569, 0.3667, 0.6321], g7_curly: [0.3569, 0.3667, 0.6321], g7_short: [0.357, 0.3654, 0.6334],
  g8_long: [0.3535, 0.3654, 0.6334], g8_pony: [0.3568, 0.3681, 0.6307], g8_bun: [0.3741, 0.3694, 0.6294], g8_curly: [0.357, 0.3654, 0.6334], g8_short: [0.357, 0.3654, 0.6334],
  g9_long: [0.357, 0.3654, 0.6334], g9_pony: [0.357, 0.3654, 0.6334], g9_bun: [0.3775, 0.3694, 0.6294], g9_curly: [0.357, 0.3654, 0.6334],
  g10_long: [0.357, 0.3654, 0.6334], g10_pony: [0.3567, 0.3694, 0.6294], g10_bun: [0.357, 0.3654, 0.6334], g10_curly: [0.3568, 0.3681, 0.6307],
  g11_long: [0.3287, 0.3721, 0.6267], g11_pony: [0.357, 0.3654, 0.6334], g11_bun: [0.3704, 0.3721, 0.6267], g11_curly: [0.357, 0.3654, 0.6334],
  g12_long: [0.357, 0.3654, 0.6334], g12_pony: [0.3426, 0.3721, 0.6267], g12_bun: [0.3569, 0.3667, 0.6321], g12_curly: [0.357, 0.3654, 0.6334],
  g13_long: [0.357, 0.3654, 0.6334], g13_pony: [0.357, 0.3654, 0.6334], g13_bun: [0.3569, 0.3667, 0.6321], g13_curly: [0.3286, 0.3735, 0.6254],
};
const STYLED = new Map();
let styledCb = null;
/** The salon hairstyles that have been painted for the girl this client will be (null: she has no portrait). */
export function styledList(tone, seed) {
  const ph = pickPhoto(tone, seed);
  if (!ph) return null;
  const n = PHOTOS.indexOf(ph) + 1;
  const have = ['long', 'pony', 'bun', 'curly', 'short'].filter((st) => STYLE_FIT[`g${n}_${st}`]);
  if (typeof Image !== 'undefined') for (const st of have) styledEntry(`g${n}_${st}`, STYLE_FIT[`g${n}_${st}`]);   // start fetching them now
  return have;
}
/** A strip of her own painted hair in this colour (from her long-hair painting): what the salon's
 *  fringe is made of. Null until that painting has arrived. */
export function styledSwatch(tone, seed, hairHex, wet = false) {
  const ph = pickPhoto(tone, seed);
  if (!ph || !STYLE_FIT[`g${PHOTOS.indexOf(ph) + 1}_long`]) return null;
  const own = styledFor(ph, 'long', hairHex, wet);
  if (!own) return null;
  const W = own.canvas.width, H = own.canvas.height, wd = 0.07;
  // a narrow strip of the lengths hanging beside her face: wherever it is most purely hair
  let best = null;
  for (let x0 = 0.03; x0 < 0.9; x0 += 0.01) {
    if (x0 > 0.26 && x0 < 0.67) continue;
    let hit = 0, all = 0;
    for (let y = 0.54; y < 0.9; y += 0.02) for (let x = x0; x < x0 + wd; x += 0.01) { all++; if (own.hairA[Math.floor(y * own.HH) * own.HW + Math.floor(x * own.HW)] > 230) hit++; }
    if (!best || hit / all > best.k) best = { k: hit / all, x0 };
  }
  if (!best || best.k < 0.97) return null;
  return { canvas: own.canvas, sx: best.x0 * W, sy: 0.54 * H, sw: wd * W, sh: 0.36 * H };
}
/** Called when a hairstyle picture finishes loading, so whoever is showing her can repaint. */
export function onStyledArt(fn) { styledCb = fn; }
function styledEntry(key, fit) {
  let e = STYLED.get(key);
  if (!e) {
    if (STYLED.size > 9) STYLED.clear();                    // one girl's set at a time is plenty
    const im = new Image();
    e = { img: im, tints: new Map(), fit };
    STYLED.set(key, e);
    im.onload = () => { if (styledCb) styledCb(); };
    im.src = `hair/${key}.jpg`;
  }
  return e;
}
function styledFor(photo, style, hairHex, wet = false) {
  const key = `g${PHOTOS.indexOf(photo) + 1}_${style}`, fit = STYLE_FIT[key];
  if (!fit || typeof hairHex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hairHex) || typeof Image === 'undefined') return null;
  const e = styledEntry(key, fit), im = e.img;
  if (!im.complete || !im.naturalWidth) return null;
  const tkey = hairHex + (wet ? 'w' : '');
  if (e.tints.has(tkey)) return e.tints.get(tkey);
  const FW = im.naturalWidth, FH = im.naturalHeight;
  if (!e.base) {
    // masks are worked out at half size (quicker, and they are soft anyway), then stretched back up
    const HW = Math.round(FW / 2), HH = Math.round(FH / 2), n = HW * HH;
    const hc = document.createElement('canvas'); hc.width = HW; hc.height = HH;
    const hq = hc.getContext('2d', { willReadFrequently: true }); hq.imageSmoothingQuality = 'high'; hq.drawImage(im, 0, 0, HW, HH);
    const id = hq.getImageData(0, 0, HW, HH), d = id.data;
    const al = new Float32Array(n), pink = new Uint8Array(n);
    const fcx = (fit[1] + fit[2]) / 2, ed = fit[2] - fit[1], frx = ed * 0.73, fcy = fit[0] + 0.055, fry = 0.145;
    // how strongly coloured her skin is (her cheeks, under the eyes): hair counts as anything well short
    // of that, so silver hair that picks up a warm glow from brown skin is still hair
    const cheek = [];
    for (let y = Math.round((fit[0] + 0.05) * HH); y < (fit[0] + 0.1) * HH; y += 2) for (let x = Math.round(fit[1] * HW); x < fit[2] * HW; x += 2) {
      const i = y * HW + x, mx = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), mn = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      cheek.push(mx ? (mx - mn) / mx : 0);
    }
    cheek.sort((p2, q2) => p2 - q2);
    const skinSat = cheek[Math.floor(cheek.length / 2)] || 0.3, base = Math.max(0.125, skinSat * 0.52);
    const weak = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx ? (mx - mn) / mx : 0, L = (r + g + b) / 765;
      pink[i] = b > g + 5 && r > 205 && sat > 0.1 ? 1 : 0;
      const lim = base + 0.4 * Math.max(0, 0.72 - L);
      const fx = (i % HW) / HW - fcx, fy = Math.floor(i / HW) / HH - fcy;
      // nothing on her face is hair: the oval of it, and the band her eyebrows sit in (dark and not
      // very colourful, they would be dyed along with her hair otherwise)
      if ((fx / frx) ** 2 + (fy / fry) ** 2 < 1) continue;
      if (Math.abs(fx) < ed * 0.78 && fy + fcy > fit[0] - 0.085 && fy + fcy < fit[0] + 0.03) continue;
      al[i] = Math.max(0, Math.min(1, (lim - sat) / 0.055)) * 255;
      weak[i] = sat < Math.min(lim * 1.45, skinSat * 0.8) ? 1 : 0;
    }
    // the backdrop is whatever pink is joined to the edge of the picture (so nothing pink on her counts)
    const bg = new Uint8Array(n), stack = [];
    const push = (i) => { if (pink[i] && !bg[i]) { bg[i] = 1; stack.push(i); } };
    for (let x = 0; x < HW; x++) { push(x); push((HH - 1) * HW + x); }
    for (let y = 0; y < HH; y++) { push(y * HW); push(y * HW + HW - 1); }
    while (stack.length) {
      const i = stack.pop(), x = i % HW;
      if (x > 0) push(i - 1); if (x < HW - 1) push(i + 1); if (i >= HW) push(i - HW); if (i < n - HW) push(i + HW);
    }
    const blur = (src, rad, passes) => {
      const tmp = new Float32Array(n);
      for (let p2 = 0; p2 < passes; p2++) {
        for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) { let sum = 0, c = 0; for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < HW) { sum += src[y * HW + xx]; c++; } } tmp[y * HW + x] = sum / c; }
        for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) { let sum = 0, c = 0; for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < HH) { sum += tmp[yy * HW + x]; c++; } } src[y * HW + x] = sum / c; }
      }
      return src;
    };
    // doubtful pixels (a bit of colour in them) are hair when they sit among hair, or right at the cut-out
    // edge, where the backdrop has bled a little pink into the strands
    const near = blur(Float32Array.from(al), 4, 2), edge = blur(Float32Array.from(bg, (v) => (v ? 255 : 0)), 3, 1);
    for (let i = 0; i < n; i++) if (weak[i] && (near[i] > 64 || edge[i] > 12)) al[i] = Math.max(al[i], 255);
    blur(al, 2, 2);
    // the cut-out is pulled in a pixel or two, so no rim of backdrop comes with her
    const solid = blur(Float32Array.from(bg, (v) => (v ? 0 : 255)), 2, 1);
    const hairA = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      hairA[i] = Math.max(0, Math.min(1, (al[i] / 255 - 0.3) / 0.4)) * 255;
      d[i * 4] = hairA[i]; d[i * 4 + 1] = Math.max(0, Math.min(1, (solid[i] / 255 - 0.62) / 0.3)) * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
    }
    hq.putImageData(id, 0, 0);
    const fc = document.createElement('canvas'); fc.width = FW; fc.height = FH;
    const fq = fc.getContext('2d', { willReadFrequently: true }); fq.imageSmoothingQuality = 'high'; fq.drawImage(hc, 0, 0, FW, FH);
    const md = fq.getImageData(0, 0, FW, FH).data, N = FW * FH;
    const mh = new Uint8Array(N), ms = new Uint8Array(N);
    for (let i = 0; i < N; i++) { mh[i] = md[i * 4]; ms[i] = md[i * 4 + 1]; }
    fq.drawImage(im, 0, 0);
    e.base = { src: fq.getImageData(0, 0, FW, FH), mh, ms, hairA, HW, HH };
  }
  const { src, mh, ms, hairA, HW, HH } = e.base, N = FW * FH, sd = src.data;
  const hv = parseInt(hairHex.slice(1), 16), hr = hv >> 16, hg = (hv >> 8) & 255, hb = hv & 255;
  const dark = 1 - (hr + hg + hb) / 765;
  const cv = document.createElement('canvas'); cv.width = FW; cv.height = FH;
  const q = cv.getContext('2d'), out = q.createImageData(FW, FH), o = out.data;
  for (let i = 0; i < N; i++) {
    const j = i * 4, r = sd[j], g = sd[j + 1], b = sd[j + 2], a = mh[i];
    if (a) {
      const t = Math.max(0, Math.min(1, ((r + g + b) / 765 - 0.3) / 0.65)), k = a / 255;
      // wet hair is darker and clumps into sharper, brighter streaks
      const body = wet ? 0.27 + 0.6 * t * t : 0.4 + 0.72 * t, spec = wet ? (70 + 70 * dark) * t ** 7 : (40 + 60 * dark) * t * t * t * t;
      o[j] = r + (hr * body + spec - r) * k; o[j + 1] = g + (hg * body + spec - g) * k; o[j + 2] = b + (hb * body + spec - b) * k;
    } else { o[j] = r; o[j + 1] = g; o[j + 2] = b; }
    o[j + 3] = ms[i];
  }
  q.putImageData(out, 0, 0);
  const res = { canvas: cv, hairA, HW, HH, fit };
  if (e.tints.size > 1) e.tints.clear();                   // each is a big picture: keep two shades at most
  e.tints.set(tkey, res);
  return res;
}

// (The first try at painted salon hair, one shared silver wig per style fitted over every girl, is gone:
// it never sat right on anyone but the girl it was painted on. Its hooks below stay switched off.)
const wigFor = () => null, WIG = { eL: 0, eR: 1, eyeY: 0, fit: 1 }, WIG_W = 1, WIG_H = 1;
/** True while her own hairstyle painting exists but has not arrived yet (asking for it starts the download). */
function styledWaiting(photo, style, hairHex) {
  const key = `g${PHOTOS.indexOf(photo) + 1}_${style}`;
  if (!STYLE_FIT[key] || typeof Image === 'undefined') return false;
  const im = styledEntry(key, STYLE_FIT[key]).img;
  return !(im.complete && im.naturalWidth);
}

export function renderFaceScene(w, h, dpr, tone, seed, look, top, bottom, fit = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const xr = c.getContext('2d');
  xr.scale(dpr, dpr);
  const photo = pickPhoto(tone, seed);
  // Every face is a painting. The scene below is still worked out in full, because it is the map of
  // where her eyes, lips, cheeks and hairline are, but when the whole painting covers it, it is drawn
  // onto a stand-in surface that does nothing, so no time is spent on pixels nobody sees. In the salon only her face
  // is painted in and the hair around it is drawn live, so there the scene draws for real.
  // in the salon she is shown in her plain portrait for the moment it takes her hairstyle painting to arrive
  const full = !!photo && (!look.photoFace || styledWaiting(photo, look.style || 'short', /^#[0-9a-f]{6}$/i.test(look.hair || '') ? look.hair : '#3a2618'));
  // in the salon her ears and neck are drawn, so they take their colours from her own painted skin
  if (photo) photoSkin(photo);
  if (photo && look.photoFace) tone = { ...tone, ...photo.skin };
  const x = full ? scratch(dpr) : xr;
  let sd = (seed >>> 0) || 1;
  const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };

  const s = Math.min(w * 0.98, (bottom - top) / 1.36) * fit;    // head width
  const hw = s * 0.415, hh = s * 0.6;      // proportions measured from makeover-game art (face ~1.15x as tall as wide)
  const cx = w / 2, cy = top + (bottom - top) * 0.47;
  const X = (u) => cx + u * hw, Y = (v) => cy + v * hh;
  // how far below her eyes a landmark of the painting sits, in face half-widths (eyes are one half-width apart)
  const pdown = (f) => (f - photo.eyeY) * photo.img.naturalHeight / ((photo.eR - photo.eL) * photo.img.naturalWidth);
  const vr = (i) => (((seed >>> (i * 3 + 2)) & 15) / 15 - 0.5) * (look.fixed || photo ? 0 : 1);     // -0.5..0.5, hers alone
  const hair = /^#[0-9a-f]{6}$/i.test(look.hair || '') ? look.hair : '#3a2618';
  const grey = ['#cfcfcf', '#b9b9b9', '#8f8f8f'].includes(hair);
  const hairLo = tint(hair, 0.72), hairHi = tint(hair, 1.16);
  // shine takes the hair's own colour, and dark hair shows far less of it than fair hair
  const hch = [0, 1, 2].map((i) => parseInt(hair.slice(1 + 2 * i, 3 + 2 * i), 16));
  const hlum = (hch[0] + hch[1] + hch[2]) / 765;
  const shine = (a) => `rgba(${hch.map((v) => Math.round(v + (255 - v) * 0.55)).join(',')},${(a * Math.min(1, 0.25 + hlum * 1.6)).toFixed(3)})`;
  const style = look.style || 'short';
  const hasHair = style !== 'bald';
  // a painted hairstyle replaces the drawn one outright (salon only)
  const drawHair = hasHair && !(photo && look.photoFace && wigFor(style, hair));
  const hairline = style === 'bald' ? -2 : style === 'balding' ? -2 : style === 'buzz' ? -0.66 : -0.68;      // a proper forehead
  // the line the hair grows from. Drawn back for a ponytail or a bun it is an even arch, highest in the middle;
  // worn down it sits lower on the side the hair sweeps toward.
  const tiedBack = style === 'pony' || style === 'bun';
  // on a painted portrait her hair is held back by the band, so the hairline is an even arch: highest at the parting
  // and drops at the temples, where her hair comes forward under the band
  const hl = (u) => hairline + (photo && !look.photoFace ? -0.02 + 0.13 * u * u + 0.5 * Math.max(0, Math.abs(u) - 0.62) : tiedBack ? 0.02 + 0.15 * u * u : 0.05 * Math.abs(u) + (style === 'buzz' ? 0 : 0.1 * Math.max(0, u * 0.9)));
  x.lineCap = 'round';
  x.lineJoin = 'round';

  const soft = (px, py, rx, ry, color) => {
    x.save();
    x.translate(px, py);
    x.scale(1, ry / rx);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = g;
    x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill();
    x.restore();
  };
  const strands = (n, gen, lw = 1.2) => {
    x.lineWidth = lw;
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1, bend, col] = gen(i / n);
      x.strokeStyle = col;
      x.beginPath();
      x.moveTo(x0, y0);
      x.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
      x.stroke();
    }
  };
  // a lock: a tapered ribbon of hair, dark at the root, lit along its length, dark again at the tip
  const lock = (x0, y0, x1, y1, bend, wd) => {
    const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    const g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, hairLo); g.addColorStop(0.3, hair); g.addColorStop(0.55, hairHi); g.addColorStop(0.8, hair); g.addColorStop(1, hairLo);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(x0 - wd, y0);
    x.quadraticCurveTo(mx - wd * 0.8, my, x1, y1);
    x.quadraticCurveTo(mx + wd * 0.8, my, x0 + wd, y0);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.2)'; x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(x0 + wd, y0); x.quadraticCurveTo(mx + wd * 0.8, my, x1, y1); x.stroke();
  };
  // a ringlet: a corkscrew of hair hanging down. The turns that face us catch the light.
  const ringlet = (px, py, len, amp, wl, wd, drift) => {
    const ph = R() * 6.3, n = Math.max(8, Math.round(len / wl * 10));
    const pt = (i) => { const t = i / n, k = t * len / wl * Math.PI * 2 + ph; return [px + drift * t + Math.sin(k) * amp * (0.55 + 0.45 * t), py + t * len, Math.cos(k)]; };
    const path = (i0, i1) => { x.beginPath(); for (let i = i0; i <= i1; i++) { const [qx, qy] = pt(i); if (i === i0) x.moveTo(qx, qy); else x.lineTo(qx, qy); } x.stroke(); };
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = wd * 1.7; path(0, n);
    x.strokeStyle = hairLo; x.lineWidth = wd * 1.15; path(0, n);
    x.strokeStyle = hair; x.lineWidth = wd * 0.8; path(0, n);
    x.strokeStyle = hairHi; x.lineWidth = wd * 0.34;
    for (let i = 0; i < n; i++) if (pt(i)[2] > 0.25) path(i, i + 1);       // the near side of each turn
    x.strokeStyle = shine(0.16); x.lineWidth = Math.max(0.5, wd * 0.14);
    for (let i = 0; i < n; i++) if (pt(i)[2] > 0.7) path(i, i + 1);
    x.lineCap = 'butt';
  };
  // a coil seen end on: a curl sitting on the head
  const coil = (px, py, r) => {
    const a0 = R() * 6.3, turns = 1.25 + R() * 0.7, n = 22, dir = R() < 0.5 ? 1 : -1;
    const path = (i0, i1, ox, oy) => { x.beginPath(); for (let i = i0; i <= i1; i++) { const t = i / n, a = a0 + dir * t * turns * Math.PI * 2, rr = r * (1 - 0.72 * t); const qx = px + ox + Math.cos(a) * rr, qy = py + oy + Math.sin(a) * rr * 0.9; if (i === i0) x.moveTo(qx, qy); else x.lineTo(qx, qy); } x.stroke(); };
    soft(px + r * 0.12, py + r * 0.2, r * 1.25, r * 1.25, 'rgba(0,0,0,0.3)');
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = hairLo; x.lineWidth = r * 0.5; path(0, n, 0, 0);
    x.strokeStyle = hair; x.lineWidth = r * 0.34; path(0, n, 0, 0);
    x.strokeStyle = hairHi; x.lineWidth = r * 0.13;
    for (let i = 0; i < n; i++) { const a = a0 + dir * (i + 0.5) / n * turns * Math.PI * 2; if (Math.sin(a) < -0.2 && Math.cos(a) < 0.6) path(i, i + 1, -r * 0.04, -r * 0.05); }   // lit from above left
    x.lineCap = 'butt';
  };
  // hair isn't one flat colour: darker at the roots and underneath, lit across the crown
  const hairFill = x.createLinearGradient(0, Y(-1.15), 0, Y(1.4));
  hairFill.addColorStop(0, hairLo); hairFill.addColorStop(0.16, hair); hairFill.addColorStop(0.45, hair); hairFill.addColorStop(1, tint(hair, 0.55));
  const hairCol = () => { const k = R(); return k < 0.22 ? hairHi : k < 0.5 ? hair : hairLo; };

  // ---- the room behind
  const wall = x.createLinearGradient(0, 0, w, h);
  wall.addColorStop(0, (look.wall && look.wall[0]) || '#eef1f6'); wall.addColorStop(1, (look.wall && look.wall[1]) || '#cfd6e4');
  x.fillStyle = wall; x.fillRect(0, 0, w, h);
  soft(w * 0.2, h * 0.2, w * 0.5, h * 0.3, 'rgba(255,255,255,0.5)');
  if (look.backdrop) look.backdrop(x, w, h);     // e.g. the hair salon's mirror
  // the empty room, kept for when her own painted portrait stands in it instead of the drawn person
  let room = null;
  if (photo && look.photoFace) { room = document.createElement('canvas'); room.width = c.width; room.height = c.height; room.getContext('2d').drawImage(c, 0, 0); }
  else {
  // an out-of-focus room: window light, a shelf, a few soft glints
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.roundRect(w * 0.02, h * 0.1, w * 0.2, h * 0.34, 14); x.fill();
  x.fillStyle = 'rgba(150,110,130,0.18)';
  x.fillRect(w * 0.7, h * 0.3, w * 0.32, h * 0.012);
  for (let i = 0; i < 9; i++) soft(R() * w, R() * h * 0.6, 10 + R() * 26, 10 + R() * 26, `rgba(255,${235 + Math.floor(R() * 20)},${225 + Math.floor(R() * 30)},0.22)`);
  }

  // ---- hair behind the head
  if (hasHair && (style === 'long' || style === 'curly')) {      // kept under a painted style too: it fills in behind her ears
    const wide = style === 'curly' ? 1.5 : 1.22;
    x.fillStyle = hairFill;
    const fb = style === 'curly' ? 1.3 : 1.8;
    x.beginPath(); x.moveTo(X(-1.1), Y(-0.3));
    x.bezierCurveTo(X(-1.14), Y(-1.46), X(1.14), Y(-1.46), X(1.1), Y(-0.3));
    x.bezierCurveTo(X(wide * 1.04), Y(0.25), X(wide * 1.02), Y(fb - 0.6), X(wide * 0.9), Y(fb));
    x.quadraticCurveTo(cx, Y(fb + 0.18), X(-wide * 0.9), Y(fb));
    x.bezierCurveTo(X(-wide * 1.02), Y(fb - 0.6), X(-wide * 1.04), Y(0.25), X(-1.1), Y(-0.3));
    x.closePath(); x.fill();
    if (style === 'curly') {
      // a soft mass first, then corkscrews over it, the back ones darker and thinner
      for (let i = 0; i < 26; i++) soft(X((R() * 2 - 1) * wide * 0.9), Y(-0.2 + R() * (fb + 0.1)), hw * 0.3, hh * 0.22, 'rgba(0,0,0,0.16)');
      for (let i = 0; i < 64; i++) {
        const u = (i < 40 ? (R() * 2 - 1) : (R() < 0.5 ? -1 : 1) * (0.8 + R() * 0.25)) * wide * 0.94, d = Math.sign(u) || 1;
        const v0 = -0.55 + R() * 0.7 + (i < 40 ? 0 : 0.2), v1 = Math.min(fb + 0.1, v0 + 0.7 + R() * 0.9);
        ringlet(X(u * 0.86), Y(v0), (v1 - v0) * hh, hw * (0.045 + R() * 0.035), hh * (0.13 + R() * 0.06), hw * (0.05 + R() * 0.03), d * hw * 0.1 * R());
      }
    } else {
      strands(700, () => {
        const u = (R() * 2 - 1) * wide * 0.95, d = Math.sign(u) || 1;
        return [X(u * 0.7), Y(-0.9), X(u), Y(0.6 + R() * 1.2), d * (style === 'curly' ? 30 * Math.sin(R() * 9) : 18), hairCol()];
      }, 0.9);
      for (let i = 0; i < 40; i++) {         // long locks falling past the shoulders
        const u = (R() * 2 - 1) * wide * 0.95, d = Math.sign(u) || 1;
        lock(X(u * 0.78), Y(-0.5), X(u) + d * R() * 8, Y(0.9 + R() * 0.9), d * (style === 'curly' ? 26 * Math.sin(R() * 9) : 16), hw * (0.05 + R() * 0.04));
      }
      strands(140, () => { const u = (R() * 2 - 1) * wide * 0.95, d = Math.sign(u) || 1; return [X(u * 0.8), Y(-0.4), X(u), Y(0.9 + R() * 0.9), d * 16, 'rgba(0,0,0,0.2)']; }, 3);
      strands(900, () => { const u = (R() * 2 - 1) * wide * 0.95, d = Math.sign(u) || 1; return [X(u * 0.75), Y(-0.6), X(u), Y(0.7 + R() * 1.2), d * (style === 'curly' ? 30 * Math.sin(R() * 9) : 18), hairCol()]; }, 0.6);
      strands(360, () => { const u = (R() * 2 - 1) * wide * 0.95, d = Math.sign(u) || 1, v = 0.25 + R() * 0.2; return [X(u * 0.97), Y(v), X(u), Y(v + 0.22), d * 3, shine(0.2)]; }, 0.9);
    }
  }
  if (drawHair && style === 'pony') {
    x.fillStyle = hairFill; x.beginPath(); x.ellipse(X(1.04), Y(0.0), hw * 0.24, hh * 0.78, -0.16, 0, Math.PI * 2); x.fill();
    strands(520, () => { const k = R() * 2 - 1, L = R(); return [X(0.9 + k * 0.1), Y(-0.7), X(1.1 + k * 0.2 * (1 - L * 0.85)), Y(0.25 + L * 0.8), k * 14 + 10, hairCol()]; }, 0.8);     // it tapers to a point
  }
  if (drawHair && style === 'bun') {
    x.fillStyle = hairFill; x.beginPath(); x.arc(cx, Y(-1.22), hw * 0.42, 0, Math.PI * 2); x.fill();
    x.lineWidth = 0.8;
    for (let i = 0; i < 260; i++) {      // strands wound round the bun
      const r = hw * 0.42 * (0.15 + R() * 0.83), a0 = R() * Math.PI * 2;
      x.strokeStyle = hairCol(); x.beginPath(); x.arc(cx + (R() - 0.5) * 4, Y(-1.22) + (R() - 0.5) * 4, r, a0, a0 + 0.8 + R() * 1.6); x.stroke();
    }
    soft(X(-0.12), Y(-1.36), hw * 0.2, hh * 0.07, 'rgba(255,255,255,0.14)');
  }
  if (drawHair && style !== 'balding') {     // volume around the skull
    const k = style === 'buzz' ? 1.02 : tiedBack ? 1.04 : 1.09;      // pulled back, it lies close to the skull
    x.fillStyle = hairFill;
    x.beginPath(); x.ellipse(cx, Y(-0.3), hw * k, hh * (style === 'buzz' ? 0.76 : 0.87), 0, Math.PI, Math.PI * 2); x.fill();
    soft(X(-0.15), Y(-1.04), hw * 0.8, hh * 0.09, shine(0.26));     // light on the crown
    x.beginPath(); x.ellipse(cx, Y(-0.31), hw * k, hh * (tiedBack ? 0.22 : 0.4), 0, 0, Math.PI); x.fill();     // it tucks in behind the ears
    if (style !== 'buzz') {
      // strands combed over the crown from the parting, so the top isn't a flat helmet
      strands(1100, () => {
        const u = R() * 2 - 1, part = -0.3;
        const x1 = X(u * k * 1.02), y1 = Y(-0.3 - Math.sqrt(Math.max(0, 1 - u * u)) * 0.76 + 0.1 + R() * 0.5);
        const us = style === 'pony' || style === 'bun' ? u * 0.25 : part + (u - part) * 0.3;
        return [X(us), Y(-0.3 - Math.sqrt(Math.max(0, 1 - us * us)) * 0.85), x1, y1, (u - part) * hw * 0.3, hairCol()];
      }, 0.8);
      // flyaways breaking the outline
      strands(46, () => {
        const a = Math.PI + 0.45 + R() * (Math.PI - 0.9), px = cx + Math.cos(a) * hw * k, py = Y(-0.3) + Math.sin(a) * hh * 0.87;     // over the crown only: at the sides they read as spikes
        const fs = s / 380;     // flyaways scale with the head, so small portraits don't get a spiky halo
        return [px, py, px + (Math.cos(a) * (6 + R() * 16) + (R() - 0.5) * 12) * fs, py + Math.sin(a) * (6 + R() * 14) * fs, (R() - 0.5) * 12 * fs, rgba(hair, 0.55)];
      }, Math.max(0.3, 0.7 * Math.min(1, s / 380)));
    }
  }
  if (style === 'balding') {
    x.fillStyle = hair;
    for (const d of [-1, 1]) { x.beginPath(); x.ellipse(X(d * 1.0), Y(-0.28), hw * 0.2, hh * 0.42, 0, 0, Math.PI * 2); x.fill(); }
  }

  // ---- shoulders and neck
  x.fillStyle = look.shirt || '#9ad1b0';
  x.beginPath();
  x.moveTo(X(-2.2), h + 10);
  x.quadraticCurveTo(X(-1.7), Y(1.28), X(-0.67), Y(1.2));
  x.lineTo(X(0.67), Y(1.2));
  x.quadraticCurveTo(X(1.7), Y(1.28), X(2.2), h + 10);
  x.closePath(); x.fill();
  // the top is cloth, not a flat shape: it rounds over the shoulders, falls into shadow lower
  // down, and creases where it pulls toward the neck
  x.save(); x.clip();
  const drape = x.createLinearGradient(0, Y(1.2), 0, Math.max(h, Y(2.2)));
  drape.addColorStop(0, 'rgba(255,255,255,0.16)'); drape.addColorStop(0.35, 'rgba(255,255,255,0)'); drape.addColorStop(1, 'rgba(0,0,0,0.22)');
  x.fillStyle = drape; x.fillRect(0, Y(1.1), w, h);
  for (const d of [-1, 1]) {
    soft(X(d * 1.25), Y(1.42), hw * 0.55, hh * 0.14, 'rgba(255,255,255,0.16)');        // the round of the shoulder
    soft(X(d * 0.75), Y(1.7), hw * 0.3, hh * 0.4, 'rgba(0,0,0,0.1)');                  // hollow beside the chest
    for (let i = 0; i < 4; i++) {                                                      // creases fanning from the neckline
      const u0 = d * (0.76 + i * 0.13), u1 = d * (0.95 + i * 0.3), v1 = 1.75 + i * 0.12 + R() * 0.1;
      x.strokeStyle = 'rgba(0,0,0,0.09)'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(X(u0), Y(1.27 + i * 0.02)); x.quadraticCurveTo(X((u0 + u1) / 2 + d * 0.1), Y(1.45 + i * 0.05), X(u1), Y(v1)); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.1)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(X(u0 + d * 0.03), Y(1.27 + i * 0.02)); x.quadraticCurveTo(X((u0 + u1) / 2 + d * 0.14), Y(1.45 + i * 0.05), X(u1 + d * 0.04), Y(v1)); x.stroke();
    }
  }
  x.restore();
  // the neck and the open neckline are one piece of skin: a column lit down the middle,
  // darker at its sides, with the chin's shadow lying across the top of it
  const neck = new Path2D();
  neck.moveTo(X(-0.5), Y(0.5));                       // a real neck is most of the width of the jaw, and widens into the shoulders
  neck.bezierCurveTo(X(-0.47), Y(0.9), X(-0.5), Y(1.08), X(-0.66), Y(1.2));
  neck.quadraticCurveTo(cx, Y(1.8), X(0.66), Y(1.2));
  neck.bezierCurveTo(X(0.5), Y(1.08), X(0.47), Y(0.9), X(0.5), Y(0.5));
  neck.closePath();
  x.fillStyle = tone.base; x.fill(neck);
  x.save(); x.clip(neck);
  x.globalCompositeOperation = 'multiply';
  const nside = x.createLinearGradient(X(-0.68), 0, X(0.68), 0);
  nside.addColorStop(0, 'rgba(158,98,86,0.7)'); nside.addColorStop(0.3, 'rgba(158,98,86,0.16)'); nside.addColorStop(0.45, 'rgba(158,98,86,0.1)');
  nside.addColorStop(0.72, 'rgba(158,98,86,0.3)'); nside.addColorStop(1, 'rgba(158,98,86,0.8)');
  x.fillStyle = nside; x.fillRect(X(-0.85), Y(0.4), hw * 1.7, hh * 1.5);
  const chinSh = x.createLinearGradient(0, Y(0.9), 0, Y(1.42));
  chinSh.addColorStop(0, 'rgba(120,66,58,0.75)'); chinSh.addColorStop(0.45, 'rgba(140,82,72,0.4)'); chinSh.addColorStop(1, 'rgba(158,98,86,0)');
  x.fillStyle = chinSh; x.fillRect(X(-0.85), Y(0.4), hw * 1.7, hh * 1.1);
  x.restore();
  x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(X(-0.72), Y(1.2)); x.quadraticCurveTo(cx, Y(1.82), X(0.72), Y(1.2)); x.stroke();
  // a stitched hem round the neckline
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 1.2; x.setLineDash([3, 3]);
  x.beginPath(); x.moveTo(X(-0.78), Y(1.215)); x.quadraticCurveTo(cx, Y(1.92), X(0.78), Y(1.215)); x.stroke();
  x.setLineDash([]);
  for (const d of [-1, 1]) {
    soft(X(d * 0.36), Y(1.18), hw * 0.08, hh * 0.3, rgba(tone.pore, 0.2));              // neck tendons
    soft(X(d * 1.1), Y(1.55), hw * 0.5, hh * 0.12, 'rgba(255,255,255,0.14)');           // light on the shoulders
    x.strokeStyle = rgba(tone.pore, 0.25); x.lineWidth = 3;                             // collarbones
    x.beginPath(); x.moveTo(X(d * 0.08), Y(1.5)); x.quadraticCurveTo(X(d * 0.3), Y(1.42), X(d * 0.52), Y(1.36)); x.stroke();
  }
  soft(cx, Y(1.5), hw * 0.07, hh * 0.05, rgba(tone.pore, 0.35));

  // ---- the shape of her face. Real faces sort into a handful of outlines by comparing four things:
  // the width at the temples, at the cheekbones and at the jaw, and the length. A woman's jaw turns
  // in a long soft curve, not a corner, and her chin is narrower than her mouth.
  //   T temple width, C cheekbone width, full how far the cheek holds its width, jaw/jv the angle of
  //   the jaw, a/b/bv how it turns there, cw the breadth of the chin, chinV where it ends,
  //   hol the hollow under the cheekbone
  const SHAPES = {
    oval:    { T: 1.0,   C: 0.965, full: 0,     jaw: 0.60, jv: 0.70, a: 0.20, b: 0.17, bv: 0.21, cw: 0.26, chinV: 1.035, hol: 0.2 },
    round:   { T: 1.0,   C: 0.985, full: 0.02,  jaw: 0.64, jv: 0.66, a: 0.18, b: 0.15, bv: 0.22, cw: 0.26, chinV: 1.0,   hol: 0.07 },
    square:  { T: 1.0,   C: 0.965, full: 0.01,  jaw: 0.68, jv: 0.66, a: 0.11, b: 0.14, bv: 0.20, cw: 0.23, chinV: 1.03, hol: 0.16 },
    heart:   { T: 1.0,   C: 0.965, full: -0.02, jaw: 0.53, jv: 0.68, a: 0.24, b: 0.17, bv: 0.23, cw: 0.17, chinV: 1.05,  hol: 0.27 },
    diamond: { T: 0.93,  C: 0.98,  full: -0.03, jaw: 0.54, jv: 0.70, a: 0.23, b: 0.17, bv: 0.21, cw: 0.20, chinV: 1.04,  hol: 0.3 },
    oblong:  { T: 0.985, C: 0.95,  full: 0.01,  jaw: 0.62, jv: 0.72, a: 0.15, b: 0.17, bv: 0.22, cw: 0.24, chinV: 1.085, hol: 0.22 },
  };
  const shape = photo ? 'oval' : SHAPES[look.shape] ? look.shape : look.fixed ? 'oval'
    : ['oval', 'oval', 'oval', 'round', 'round', 'heart', 'heart', 'square', 'diamond', 'oblong'][((seed >>> 13) ^ (seed >>> 22)) % 10];
  const SH = SHAPES[shape];
  const earX = SH.C + 0.025;

  // ---- ears: rim, inner fold, the dark bowl, a soft lobe
  for (const d of [-1, 1]) {
    const ew = hw * 0.17, eh = hh * 0.215;
    x.save();
    x.translate(X(d * earX), Y(0.03)); x.scale(d, 1); x.rotate(0.08);
    const ear = new Path2D();
    ear.moveTo(-ew * 0.3, -eh * 0.95);
    ear.bezierCurveTo(ew * 0.75, -eh * 1.2, ew * 1.15, -eh * 0.2, ew * 0.62, eh * 0.42);
    ear.bezierCurveTo(ew * 0.48, eh * 0.95, -ew * 0.05, eh * 1.08, -ew * 0.3, eh * 0.72);
    ear.closePath();
    const eg = x.createLinearGradient(-ew * 0.2, 0, ew, 0);
    eg.addColorStop(0, tone.shade); eg.addColorStop(0.55, tone.bump); eg.addColorStop(1, tone.base);
    x.fillStyle = eg; x.fill(ear);
    x.save(); x.clip(ear);
    soft(ew * 0.18, eh * 0.02, ew * 0.42, eh * 0.4, 'rgba(70,24,18,0.5)');               // the bowl of the ear
    soft(ew * 0.3, eh * 0.72, ew * 0.4, eh * 0.28, rgba(tone.blush, 0.45));              // lobe, warm with blood
    soft(ew * 0.5, -eh * 0.1, ew * 0.5, eh * 0.9, rgba(tone.blush, 0.22));
    x.strokeStyle = rgba(tone.pore, 0.55); x.lineWidth = Math.max(1.2, ew * 0.07);       // inside edge of the rim
    x.beginPath(); x.moveTo(-ew * 0.1, -eh * 0.72); x.bezierCurveTo(ew * 0.6, -eh * 0.9, ew * 0.85, -eh * 0.15, ew * 0.48, eh * 0.38); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.4); x.lineWidth = Math.max(1, ew * 0.06);          // the inner fold
    x.beginPath(); x.moveTo(ew * 0.1, -eh * 0.5); x.quadraticCurveTo(ew * 0.58, -eh * 0.15, ew * 0.22, eh * 0.36); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = Math.max(1, ew * 0.06);      // light along the rim
    x.beginPath(); x.moveTo(ew * 0.05, -eh * 0.88); x.bezierCurveTo(ew * 0.72, -eh * 1.0, ew * 0.98, -eh * 0.2, ew * 0.58, eh * 0.36); x.stroke();
    x.restore();
    x.strokeStyle = rgba(tone.pore, 0.4); x.lineWidth = 1.1; x.stroke(ear);
    x.restore();
  }

  // ---- the head, in her own shape
  const jaw = SH.jaw + (look.fem ? 0 : 0.08) + vr(1) * 0.05;
  // Below the cheekbone the outline follows a width profile measured from professional makeover-game
  // art: full cheeks that ease in gently, a jaw that curves rather than angles, and a small but rounded
  // chin (never a point). k = distance below the eyes in face half-widths; P = width as a share of the
  // cheekbones. Each face shape bends the lower half of the profile a little.
  const K_EYE = -0.05, HWHH = hw / hh;
  const PROF = [[0, 1], [0.25, 0.98], [0.5, 0.94], [0.75, 0.86], [0.97, 0.745], [1.1, 0.65], [1.25, 0.51], [1.35, 0.39], [1.42, 0.285], [1.48, 0.165], [1.515, 0.07], [1.525, 0]];
  const MOD = { oval: [0, 0, 1], round: [0.05, 0.02, 0.97], square: [0.06, 0.04, 1], heart: [-0.05, -0.03, 1.01], diamond: [-0.03, -0.01, 1.01], oblong: [0, 0, 1.06] }[shape] || [0, 0, 1];
  const kLen = photo ? pdown(photo.chin) / 1.525 : MOD[2] * 0.95 + vr(9) * 0.03;      // eyes to chin ~1.45 face half-widths (average of two reference faces)
  const prof = (k) => {
    k /= kLen;
    let i = 0; while (i < PROF.length - 2 && PROF[i + 1][0] < k) i++;
    const [k0, p0] = PROF[i], [k1, p1] = PROF[i + 1];
    const pm = PROF[Math.max(0, i - 1)][1], pp = PROF[Math.min(PROF.length - 1, i + 2)][1];
    const t = Math.max(0, Math.min(1, (k - k0) / (k1 - k0))), t2 = t * t, t3 = t2 * t;      // Catmull-Rom between samples
    let p = 0.5 * (2 * p0 + (-pm + p1) * t + (2 * pm - 5 * p0 + 4 * p1 - pp) * t2 + (-pm + 3 * p0 - 3 * p1 + pp) * t3);
    const lo = Math.max(0, Math.min(1, (k - 0.6) / 0.4)), ch = Math.max(0, Math.min(1, (k - 1.25) / 0.2));
    p += MOD[0] * lo * (1 - ch) * (k < 1.45 ? 1 : 0) + MOD[1] * ch * (k < 1.5 ? 1 : 0);
    return Math.max(0, p);
  };
  const kEnd = 1.525 * kLen;
  const chinV = K_EYE + kEnd * HWHH;
  const chinW = SH.C * prof(1.42 * kLen);
  const segs = [[0, -1, 0.74, -1.02, SH.T, -0.6, SH.C, -0.06]];                          // skull down to the cheekbone
  const gs = (t) => Math.exp(-0.5 * t * t);
  const outline = [];
  for (const q of segs) for (let i = 0; i < 30; i++) {
    const t = i / 30, m = 1 - t;
    let u = m * m * m * q[0] + 3 * m * m * t * q[2] + 3 * m * t * t * q[4] + t * t * t * q[6];
    const v = m * m * m * q[1] + 3 * m * m * t * q[3] + 3 * m * t * t * q[5] + t * t * t * q[7];
    const k = Math.max(0, Math.min(1, (u - 0.45) / 0.25));
    u += k * -(shape === 'diamond' ? 0.02 : 0.036) * gs((v + 0.3) / 0.13);               // the temple dips in
    outline.push([u, v]);
  }
  for (let i = 0; i <= 60; i++) {
    const k = (K_EYE - 0.06 > 0 ? 0 : (-0.06 - K_EYE) / HWHH) + (kEnd - (-0.06 - K_EYE) / HWHH) * i / 60;
    const v = K_EYE + k * HWHH;
    outline.push([SH.C * prof(Math.max(0, k)) - SH.hol * 0.03 * gs((v - 0.42) / 0.15), v]);
  }
  outline.push([0, chinV]);
  const head = new Path2D();
  outline.forEach(([u, v], i) => (i ? head.lineTo(X(u), Y(v)) : head.moveTo(X(u), Y(v))));
  for (let i = outline.length - 2; i > 0; i--) head.lineTo(X(-outline[i][0]), Y(outline[i][1]));
  head.closePath();
  // one side of the face from the cheekbone round to the chin, for shading that follows her own jaw
  const jawLine = (d) => { const pth = new Path2D(); let on = false; for (const [u, v] of outline) if (v > -0.12) { if (on) pth.lineTo(X(d * u), Y(v)); else { pth.moveTo(X(d * u), Y(v)); on = true; } } return pth; };
  // her jaw throws its own shadow on her neck, in its own shape
  x.save();
  x.clip(neck);
  const notHead = new Path2D(); notHead.rect(0, 0, w, h); notHead.addPath(head);
  x.clip(notHead, 'evenodd');
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = 'rgba(140,82,72,0.065)';
  for (let i = 1; i <= 14; i++) { x.save(); x.translate(hw * 0.02, hh * (0.012 * i + 0.0006 * i * i)); x.fill(head); x.restore(); }
  x.restore();

  // highlights on dark skin are warm and subtle; white patches there read as chalk
  const skinLum = /^#[0-9a-f]{6}$/i.test(tone.base) ? [1, 3, 5].reduce((a, i) => a + parseInt(tone.base.slice(i, i + 2), 16), 0) / 765 : 0.7;
  const hiK = Math.max(0.22, Math.min(1, (skinLum - 0.25) / 0.5));
  const hi = (a) => `rgba(255,${Math.round(225 + 30 * hiK)},${Math.round(200 + 55 * hiK)},${(a * hiK).toFixed(3)})`;
  // shadows are multiplied in, so they deepen whatever skin is under them instead of greying it
  const sh = (a) => `rgba(168,98,94,${(a * 0.95).toFixed(3)})`;
  const mul = (fn) => { x.save(); x.globalCompositeOperation = 'multiply'; fn(); x.restore(); };
  const ey = -0.05, ex = 0.5;                      // eye line / spacing (head units)
  const erx = hw * (photo ? 0.21 : 0.255 + vr(2) * 0.02), ery = hh * (photo ? 0.058 : 0.071 + vr(3) * 0.007);   // big, bright eyes
  const mouthY = photo ? ey + pdown(photo.mouth) * hw / hh : 0.6, noseY = photo ? ey + pdown(photo.nose) * hw / hh - 0.05 : 0.32;
  const old = (look.age || 25) >= 55 ? 1 : (look.age || 25) >= 40 ? 0.55 : (look.age || 25) >= 32 ? 0.25 : 0.08;

  x.save();
  x.clip(head);
  if (!full) x.drawImage(renderSkin(w, h, dpr, tone, seed), 0, 0, w, h);    // real pores and texture
  // form. One soft light, high and a little to our left: the head is a ball that turns away
  // from it at the sides, the far side more, and falls into shade under the jaw
  mul(() => {
    const side = x.createLinearGradient(X(-1), 0, X(1), 0);
    side.addColorStop(0, sh(0.55)); side.addColorStop(0.14, sh(0.16)); side.addColorStop(0.32, sh(0)); side.addColorStop(0.6, sh(0.03));
    side.addColorStop(0.82, sh(0.3)); side.addColorStop(1, sh(0.75));
    x.fillStyle = side; x.fillRect(X(-1.1), Y(-1.1), hw * 2.2, hh * 2.3);
    const under = x.createLinearGradient(0, Y(0.5), 0, Y(chinV + 0.015));
    under.addColorStop(0, sh(0)); under.addColorStop(0.65, sh(0.1)); under.addColorStop(1, sh(0.5));
    x.fillStyle = under; x.fillRect(X(-1.1), Y(0.5), hw * 2.2, hh * 0.7);
    x.lineCap = 'round'; x.lineJoin = 'round';
    for (const d of [-1, 1]) {                                                         // the face turns away at its edge, most along the jaw
      const jl = jawLine(d);
      for (const [wd, al] of [[0.3, 0.035], [0.22, 0.045], [0.15, 0.055], [0.09, 0.07], [0.045, 0.09]]) {
        x.strokeStyle = sh(al * (d > 0 ? 1.25 : 0.7)); x.lineWidth = hw * wd; x.stroke(jl);
      }
    }
    for (const d of [-1, 1]) {
      const far = d > 0 ? 1 : 0;
      soft(X(d * 0.9), Y(-0.34), hw * 0.22, hh * 0.36, sh(0.26));                    // temples
      soft(X(d * 0.76), Y(0.5), hw * 0.3, hh * 0.3, sh(SH.hol + far * 0.1));           // hollow under the cheekbone
      soft(X(d * (chinW + 0.16)), Y(chinV - 0.15), hw * 0.11, hh * 0.07, sh(0.1));       // the chin stands out from the jaw beside it
      soft(X(d * ex), Y(ey - 0.03), hw * 0.31, hh * 0.15, sh(0.3));                   // eye sockets
      soft(X(d * (ex - 0.21)), Y(ey - 0.02), hw * 0.11, hh * 0.12, sh(0.36));         // deepest beside the bridge
      soft(X(d * ex), Y(ey - 0.135), hw * 0.27, hh * 0.05, sh(0.2));                 // under the brow
      soft(X(d * (ex + 0.2)), Y(ey + 0.0), hw * 0.09, hh * 0.08, sh(0.2));            // outer corner
      soft(X(d * (ex - 0.04)), Y(ey + 0.135), hw * 0.2, hh * 0.04, `rgba(150,112,140,${0.2 + old * 0.2})`);   // under-eye, a little blue
      soft(X(d * (ex - 0.17)), Y(ey + 0.1), hw * 0.07, hh * 0.05, `rgba(150,112,140,${0.16 + old * 0.14})`);  // tear trough
      soft(X(d * 0.125), Y(0.13), hw * 0.055, hh * 0.21, sh(0.15 + far * 0.2));       // side planes of the nose
      soft(X(d * 0.22), Y(noseY - 0.005), hw * 0.06, hh * 0.065, sh(0.18));            // where the wing meets the cheek
      soft(X(d * 0.34), Y(0.5), hw * 0.09, hh * 0.15, sh(0.07 + old * 0.2));          // the fold from nose to mouth
      soft(X(d * 0.4), Y(mouthY + 0.02), hw * 0.06, hh * 0.05, sh(0.2));              // corners of the mouth
    }
    soft(X(0.02), Y(noseY + 0.085), hw * 0.15, hh * 0.035, sh(0.32));                   // under the nose
    soft(X(0.01), Y(noseY + 0.15), hw * 0.04, hh * 0.05, sh(0.2));                    // philtrum
    soft(cx, Y(mouthY + 0.175), hw * 0.2, hh * 0.04, sh(0.42));                       // under the lower lip
  });
  // blood under the skin: cheeks, nose, chin and ears run warmer than the forehead
  for (const d of [-1, 1]) soft(X(d * 0.56), Y(0.27), hw * 0.32, hh * 0.21, rgba(tone.blush, 0.34));
  if (look.fem) for (const d of [-1, 1]) soft(X(d * 0.5), Y(0.24), hw * 0.2, hh * 0.12, `rgba(255,128,140,${(0.1 + 0.06 * hiK).toFixed(3)})`);   // a natural flush on the apples of her cheeks
  soft(cx, Y(noseY - 0.04), hw * 0.16, hh * 0.1, rgba(tone.blush, 0.3));
  soft(cx, Y(chinV - 0.175), hw * 0.2, hh * 0.09, rgba(tone.blush, 0.12));
  // where the light lands
  soft(X(-0.1), Y(-0.46), hw * 0.52, hh * 0.2, hi(0.2));                              // forehead
  soft(X(-0.06), Y(-0.38), hw * 0.2, hh * 0.08, hi(0.12));
  soft(X(-0.015), Y(0.04), hw * 0.034, hh * 0.2, hi(0.3));                            // bridge of the nose
  soft(X(-0.025), Y(noseY - 0.055), hw * 0.075, hh * 0.05, hi(0.36));                         // the ball of the tip
  soft(X(-0.035), Y(noseY - 0.065), hw * 0.025, hh * 0.016, hi(0.5));
  for (const d of [-1, 1]) {
    soft(X(d * 0.52 - 0.06), Y(0.13), hw * 0.21, hh * 0.085, hi(d < 0 ? 0.2 : 0.11));  // cheekbones
    soft(X(d * (ex + 0.02)), Y(ey - 0.14), hw * 0.15, hh * 0.022, hi(0.16));           // brow bone
  }
  soft(X(-0.02), Y(chinV - 0.185), hw * Math.min(0.17, 0.07 + chinW * 0.27), hh * 0.07, hi(0.17));    // chin
  if (shape === 'round') for (const d of [-1, 1]) soft(X(d * 0.6 - 0.05), Y(0.36), hw * 0.2, hh * 0.13, hi(d < 0 ? 0.1 : 0.05));   // full cheeks catch the light lower down
  x.save(); x.globalCompositeOperation = 'soft-light';
  const glow = x.createRadialGradient(X(-0.08), Y(0.05), hw * 0.1, cx, Y(0.1), hw * 1.25);
  glow.addColorStop(0, rgba(tone.blush, 0.32)); glow.addColorStop(0.6, rgba(tone.blush, 0.22)); glow.addColorStop(1, rgba(tone.shade, 0.15));
  x.fillStyle = glow; x.fillRect(X(-1.2), Y(-1.2), hw * 2.4, hh * 2.6);
  x.restore();
  for (const d of [-1, 1]) soft(X(d * 0.45 - 0.05), Y(0.08), hw * 0.13, hh * 0.05, hi(d < 0 ? 0.2 : 0.1));   // a dewy glow high on the cheekbones
  if (shape === 'square' || shape === 'oblong') soft(X(-(jaw - 0.14)), Y(SH.jv - 0.05), hw * 0.1, hh * 0.08, hi(0.08));          // the angle of the jaw

  // skin is not airbrushed: faint mottling, pores that are denser on the nose and inner cheeks,
  // and on some fair faces a scatter of freckles over the nose
  {
    let s2 = ((seed ^ 0x9e3779b9) >>> 0) || 7;
    const Q = () => { s2 = (s2 * 1664525 + 1013904223) >>> 0; return s2 / 4294967296; };
    const px1 = Math.max(0.6, s / 380);                       // one "pore" at this size
    mul(() => {
      for (let i = 0; i < 46; i++) soft(X(Q() * 1.8 - 0.9), Y(Q() * 1.7 - 0.7), hw * (0.05 + Q() * 0.07), hh * (0.03 + Q() * 0.04), sh(0.02 + Q() * 0.02));
      x.fillStyle = sh(0.2);
      for (let i = 0; i < 2600; i++) {
        let u = Q() * 1.9 - 0.95, v = Q() * 1.75 - 0.72;
        if (i % 3 === 0) { u = (Q() + Q() - 1) * 0.5; v = 0.2 + (Q() + Q() - 1) * 0.28; }      // the nose and the cheeks beside it
        x.globalAlpha = 0.12 + Q() * 0.3;
        x.beginPath(); x.arc(X(u), Y(v), px1 * (0.35 + Q() * 0.4), 0, 6.3); x.fill();
      }
      x.globalAlpha = 1;
      if (skinLum > 0.62 && vr(8) > 0.05) {
        for (let i = 0; i < 150; i++) {
          const u = (Q() + Q() + Q() - 1.5) * 0.62, v = 0.12 + (Q() + Q() - 1) * 0.2 - Math.abs(u) * 0.08;
          x.fillStyle = `rgba(176,112,74,${(0.16 + Q() * 0.26).toFixed(2)})`;
          x.beginPath(); x.ellipse(X(u), Y(v), px1 * (0.9 + Q() * 1.3), px1 * (0.7 + Q() * 1.0), Q() * 3, 0, 6.3); x.fill();
        }
      }
    });
    // and the tiny glints that make skin look alive rather than matte
    x.fillStyle = hi(0.5);
    for (let i = 0; i < 420; i++) {
      const k = i % 2, u = k ? (Q() + Q() - 1) * 0.16 - 0.02 : (Q() < 0.5 ? -1 : 1) * 0.5 + (Q() + Q() - 1) * 0.22 - 0.05, v = k ? -0.1 + Q() * 0.42 : 0.13 + (Q() + Q() - 1) * 0.09;
      x.globalAlpha = 0.12 + Q() * 0.22;
      x.beginPath(); x.arc(X(u), Y(v), px1 * (0.3 + Q() * 0.35), 0, 6.3); x.fill();
    }
    x.globalAlpha = 1;
  }


  // beard / stubble: thousands of little hairs, thinner on the cheeks
  if (look.beard || look.stubble || look.stache) {
    const full = look.beard, col = grey ? '#9a9a9a' : hair;
    const inBeard = (u, v) => {
      if (Math.abs(u) < 0.36 && v > mouthY - 0.07 && v < mouthY + 0.1) return false;      // lips
      if (look.stache && !full && !look.stubble) return v > noseY + 0.07 && v < mouthY - 0.03 && Math.abs(u) < 0.42;
      if (v > noseY + 0.07 && v < mouthY - 0.02 && Math.abs(u) < 0.42) return true;        // moustache
      return v > 0.2 + 0.25 * (1 - Math.abs(u)) && v > 0.3;
    };
    if (full) { x.fillStyle = rgba(col, 0.35); x.fillRect(X(-1), Y(0.42), s, hh * 0.7); }
    strands(full ? 4200 : look.stubble ? 2600 : 900, () => {
      for (let t = 0; t < 6; t++) {
        const u = R() * 2 - 1, v = 0.25 + R() * 0.8;
        if (!inBeard(u, v)) continue;
        const len = full ? 5 + R() * 8 : look.stache && !look.stubble ? 5 + R() * 5 : 1.5 + R() * 2.5;
        const a = Math.PI / 2 + u * 0.5 + (R() - 0.5) * 0.6;
        return [X(u), Y(v), X(u) + Math.cos(a) * len, Y(v) + Math.sin(a) * len, 0, rgba(col, full ? 0.8 : 0.5)];
      }
      return [0, 0, 0, 0, 0, 'rgba(0,0,0,0)'];
    }, full ? 1.4 : 1);
  }

  x.strokeStyle = rgba(tone.pore, 0.3); x.lineWidth = 2.4; x.stroke(head);     // only a soft edge, like a real face against a wall

  // hair growing from the hairline: no blunt fringe. It leaves a parting and sweeps over the
  // skull to the sides, or is drawn straight back for a ponytail or a bun.
  if (drawHair && style !== 'balding') {
    const edge = (u) => hl(u) + 0.012 * Math.sin(u * 9 + seed % 7);
    mul(() => { for (let u = -0.9; u <= 0.9; u += 0.12) soft(X(u), Y(edge(u) + 0.05), hw * 0.16, hh * 0.07, sh(0.3)); });   // the hair shades the top of the forehead
    x.fillStyle = style === 'buzz' ? rgba(hair, 0.82) : hairFill;
    x.beginPath(); x.moveTo(X(-1.2), Y(-1.2)); x.lineTo(X(1.2), Y(-1.2));
    const side = tiedBack ? -0.2 : -0.12, dip = 0.12;
    x.lineTo(X(1.2), Y(side));
    // tied back, the hair hugs the skull: the hairline runs down the temple to in front of the ear,
    // and nothing stands out from the head as a flap
    if (tiedBack) x.quadraticCurveTo(X(0.85), Y(-0.27), X(0.8), Y(edge(0.8))); else x.quadraticCurveTo(X(0.9), Y(edge(0.9) + dip), X(0.8), Y(edge(0.8)));
    for (let i = 16; i >= -16; i--) x.lineTo(X(i / 20), Y(edge(i / 20)));
    if (tiedBack) x.quadraticCurveTo(X(-0.85), Y(-0.27), X(-1.2), Y(side)); else x.quadraticCurveTo(X(-0.9), Y(edge(-0.9) + dip), X(-1.2), Y(side));
    x.closePath();
    x.save();
    if (tiedBack) { const sk = new Path2D(); sk.ellipse(cx, Y(-0.3), hw * 1.06, hh * 0.8, 0, 0, Math.PI * 2); x.clip(sk); }
    x.fill();
    x.restore();
    if (style === 'buzz') {
      strands(1500, () => { const u = R() * 2 - 1, v = -1 + R() * (edge(u) + 1.02); return [X(u), Y(v), X(u) + 1, Y(v) + 3, 0, rgba(hair, 0.5)]; }, 1);
    } else {
      const back = style === 'pony' || style === 'bun';
      const part = style === 'curly' ? 0.06 : -0.3;
      const eC = (u) => { const c = Math.max(-1, Math.min(1, u)); return edge(c) + Math.max(0, Math.abs(u) - 0.8) * 0.9; };   // the hairline drops to the temples
      const skull = (u) => -0.08 - Math.sqrt(Math.max(0, 1 - u * u / 1.1)) * 0.98;
      // where a hair is: t = how far back from the hairline it lies (0..1), q = how far along its length
      const at = back
        ? (u0, t, q) => { const v0 = eC(u0), k = q * q * 0.2 + q * 0.8; return [X(u0 * (1 - k * 0.8)), Y(v0 + (-1.08 - v0) * k)]; }
        : (sgn, t, q) => { const u = part + (sgn * 1.06 - part) * q; return [X(u), Y(eC(u) * (1 - t) + skull(u) * t - Math.sin(q * Math.PI) * 0.035 * (1 - t))]; };
      const wavy = style === 'curly', seg = wavy ? 18 : 7;
      const run = (a, t, q0, q1, col, lw) => {
        const ph = wavy ? R() * 6.3 : 0, fr = wavy ? 26 + R() * 14 : 0;
        x.strokeStyle = col; x.lineWidth = lw; x.beginPath();
        for (let i = 0; i <= seg; i++) {
          const q = q0 + (q1 - q0) * i / seg; let [px, py] = at(a, t, q);
          if (wavy) py += Math.sin(q * fr + ph) * hh * 0.012 * Math.min(1, q * 5);
          if (i) x.lineTo(px, py); else x.moveTo(px, py);
        }
        x.stroke();
      };
      const pick = () => (back ? R() * 2.1 - 1.05 : (R() < (1 - part) / 2 ? 1 : -1));
      for (let i = 0; i < 150; i++) run(pick(), R(), 0.05 + R() * 0.08, 1, 'rgba(0,0,0,0.13)', 2.4 + R() * 2);                 // depth between the locks
      for (let i = 0; i < 1700; i++) run(pick(), R(), R() * 0.08, 1, hairCol(), 0.75);
      for (let i = 0; i < 700; i++) run(pick(), R(), R() * 0.2, 0.55 + R() * 0.45, rgba(hair, 0.6), 0.55);
      for (let i = 0; i < 520; i++) { const q = 0.3 + R() * 0.16; run(pick(), 0.15 + R() * 0.8, q, q + 0.1 + R() * 0.08, shine(0.2), 0.85); }   // shine follows the curve of the skull
      for (let i = 0; i < 260; i++) { const q = 0.66 + R() * 0.1; run(pick(), 0.2 + R() * 0.7, q, q + 0.07, shine(0.1), 0.8); }
      // roots sit in the shade of the hair above them, so the hairline reads as roots, not as cut ends
      mul(() => { for (let u = -1; u <= 1; u += 0.1) if (!back || Math.abs(u) < 0.82) soft(X(u), Y(eC(u) - 0.05), hw * 0.16, hh * 0.085, sh(back ? 0.38 : 0.42)); });
      if (!back) {
        // the parting: a thin line of scalp with the roots lifting away on either side
        // it fades in above the hairline, so it never reads as a dark nick at the front
        const pg = (a) => { const g = x.createLinearGradient(0, Y(eC(part)), 0, Y(eC(part) - 0.14)); g.addColorStop(0, `rgba(0,0,0,0)`); g.addColorStop(1, a); return g; };
        x.strokeStyle = rgba(hair, 0.8); x.lineWidth = 3;           // smooth over where the strands start
        x.beginPath(); x.moveTo(X(part), Y(eC(part) - 0.01)); x.quadraticCurveTo(X(part * 0.95), Y(-0.9), X(part * 0.8), Y(-1.06)); x.stroke();
        x.strokeStyle = pg(rgba(tone.base, 0.5)); x.lineWidth = 1.1;      // a thin line of scalp
        x.beginPath(); x.moveTo(X(part), Y(eC(part) - 0.01)); x.quadraticCurveTo(X(part * 0.95), Y(-0.9), X(part * 0.8), Y(-1.06)); x.stroke();
        x.strokeStyle = pg('rgba(0,0,0,0.05)'); x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(X(part), Y(eC(part) - 0.01)); x.quadraticCurveTo(X(part * 0.95), Y(-0.9), X(part * 0.8), Y(-1.06)); x.stroke();
        x.strokeStyle = pg(rgba(tone.shade, 0.22)); x.lineWidth = 0.7;
        x.beginPath(); x.moveTo(X(part), Y(eC(part) + 0.005)); x.quadraticCurveTo(X(part * 0.95), Y(-0.9), X(part * 0.8), Y(-1.06)); x.stroke();
      }
      if (back) {
        // pulled tight, the scalp shows between the roots: slivers of skin running up into the hair
        strands(420, () => {
          const u = R() * 1.9 - 0.95, v = edge(u) + 0.01, len = hh * (0.025 + R() * 0.05), a = -Math.PI / 2 - u * 0.5 + (R() - 0.5) * 0.3;
          return [X(u), Y(v), X(u) + Math.cos(a) * len, Y(v) + Math.sin(a) * len, 0, rgba(tone.base, 0.2 + R() * 0.3)];
        }, 0.8);
      }
      // a real hairline is not an edge: fine roots thin out onto the forehead, with a few baby hairs
      strands(900, () => {
        let u = R() * 1.9 - 0.95; if (!back && Math.abs(u - part) < 0.05) u += (u < part ? -0.05 : 0.05);   // none lying across the parting
        const v = edge(u) - 0.02 + R() * 0.05, len = hh * (0.03 + R() * 0.04) * (back ? 1.7 : 1);
        const a = back ? -Math.PI / 2 - u * 0.5 + (R() - 0.5) * 0.4 : (u > part ? -0.5 : Math.PI + 0.5) + (R() - 0.5) * 0.5;
        return [X(u), Y(v), X(u) + Math.cos(a) * len, Y(v) + Math.sin(a) * len, 0, rgba(hair, 0.28 + R() * 0.3)];
      }, 0.6);
      strands(70, () => {
        const u = (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.42), v = edge(u) + R() * 0.02, len = hh * (0.04 + R() * 0.05);
        const a = Math.PI / 2 + Math.sign(u) * (0.5 + R() * 0.7);
        return [X(u), Y(v), X(u) + Math.cos(a) * len, Y(v) + Math.sin(a) * len, Math.sign(u) * 2, rgba(hair, 0.22 + R() * 0.2)];
      }, 0.5);
    }
  }
  x.restore();

  // face-framing locks: worn down, the hair falls from the parting over the temples and on down past
  // the cheeks, so her face sits inside her hair the way it does in makeover-game art
  if (drawHair && (style === 'long' || style === 'short')) {
    const len = style === 'long' ? 1.3 : 0.8;
    // a lock that follows the head: out from the parting over the top, round the temple, then down
    const lockC = (p0, p1, p2, p3, wd) => {
      const g = x.createLinearGradient(X(p0[0]), Y(p0[1]), X(p3[0]), Y(p3[1]));
      g.addColorStop(0, hair); g.addColorStop(0.25, hairHi); g.addColorStop(0.5, hair); g.addColorStop(0.85, hair); g.addColorStop(1, hairLo);
      x.fillStyle = g;
      const o = (p, k) => [X(p[0]) - wd * k, Y(p[1])], q = (p, k) => [X(p[0]) + wd * k, Y(p[1])];
      x.beginPath(); x.moveTo(...o(p0, 1));
      x.bezierCurveTo(...o(p1, 1), ...o(p2, 0.8), X(p3[0]), Y(p3[1]));
      x.bezierCurveTo(...q(p2, 0.8), ...q(p1, 1), ...q(p0, 1));
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 1;
      x.beginPath(); x.moveTo(...q(p0, 1)); x.bezierCurveTo(...q(p1, 1), ...q(p2, 0.8), X(p3[0]), Y(p3[1])); x.stroke();
    };
    const path = (d, t, j) => {
      const u0 = -0.3 + d * (0.06 + t * 0.5), v0 = -1.02 + t * 0.22 + j * 0.03;
      const u3 = d * (0.96 + t * 0.12 + j * 0.04), v3 = -0.1 + len * (0.6 + 0.4 * t) + j * 0.1;
      return [[u0, v0], [d * (0.75 + t * 0.2), v0 - 0.05], [d * (1.04 + t * 0.06), -0.5 + t * 0.1], [u3, v3]];
    };
    for (const d of [-1, 1]) {
      mul(() => soft(X(d * 0.86), Y(0.05), hw * 0.13, hh * 0.5, sh(0.2)));          // the shade it casts on her cheek
      for (let i = 0; i < 7; i++) { const [a, b, c, e] = path(d, i / 6, R()); lockC(a, b, c, e, hw * (0.07 + R() * 0.025)); }
      x.lineWidth = 0.7;
      for (let i = 0; i < 200; i++) {
        const [a, b, c, e] = path(d, R(), R()), dx = (R() - 0.5) * 0.06;
        x.strokeStyle = R() < 0.3 ? shine(0.3) : hairCol();
        x.beginPath(); x.moveTo(X(a[0] + dx), Y(a[1])); x.bezierCurveTo(X(b[0] + dx), Y(b[1]), X(c[0] + dx * 0.8), Y(c[1]), X(e[0]), Y(e[1])); x.stroke();
      }
    }
  }

  // pulled back, a few soft wisps always slip loose at the temples and curl down beside the face
  if (drawHair && tiedBack) {
    x.lineCap = 'round';
    for (const d of [-1, 1]) for (let i = 0; i < 3; i++) {
      const u0 = d * (0.66 + i * 0.09 + R() * 0.04), v0 = hl(u0) + 0.01, L = 0.85 + R() * 0.3 - i * 0.12;
      const ph = R() * 6.3, n = 26, amp = 0.025 + R() * 0.02;
      const pt = (t) => [X(u0 + d * (0.2 * t + 0.1 * Math.sin(t * Math.PI)) + Math.sin(t * 8 + ph) * amp * t), Y(v0 + L * t)];
      for (const [col, k] of [['rgba(0,0,0,0.18)', 1.5], [hair, 1], [shine(0.35), 0.35]]) {
        x.strokeStyle = col;
        for (let j = 0; j < n; j++) {
          const t0 = j / n, t1 = (j + 1) / n, [ax, ay] = pt(t0), [bx, by] = pt(t1);
          x.lineWidth = Math.max(0.5, hw * 0.034 * k * (1 - t0 * 0.8));
          x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
        }
      }
    }
  }

  // curls: coils sitting all over the crown, getting bigger toward the outside, with ringlets
  // falling in front of the ears
  if (drawHair && style === 'curly') {
    const cs = [];
    for (let i = 0; i < 150; i++) {
      const a = Math.PI + R() * Math.PI, d = 0.5 + R() * 0.68;
      const uu = Math.cos(a) * 1.05 * d, py = Y(-0.3) + Math.sin(a) * hh * 0.84 * d, vv = (py - Y(0)) / (Y(1) - Y(0));
      if (Math.abs(uu) < 0.97 && vv > hl(uu) - 0.05) continue;    // not on the forehead
      cs.push([X(uu), py, hw * (0.05 + d * 0.05 + R() * 0.03), d]);
    }
    cs.sort((p, q) => q[3] - p[3]);            // the outline first, the crown over it
    for (const [px, py, r] of cs) coil(px, py, r);
    for (const d of [-1, 1]) for (let i = 0; i < 5; i++) {
      const u = d * (0.98 + R() * 0.3), v0 = -0.35 + R() * 0.35;
      ringlet(X(u), Y(v0), hh * (0.55 + R() * 0.55), hw * (0.05 + R() * 0.03), hh * (0.13 + R() * 0.05), hw * (0.055 + R() * 0.025), d * hw * 0.08);
    }
  }

  // ---- eyebrows: a soft shape underneath, then hairs that stand up at the inner end and
  // lie over toward the tail
  const browHair = grey ? '#8a8a8a' : tint(hair, hlum > 0.5 ? 0.62 : 0.85);
  for (const d of [-1, 1]) {
    const bu = (k) => d * (ex - 0.27 + k * 0.57);
    const bv = (k) => ey - 0.215 - Math.sin(Math.min(1, k / 0.66) * Math.PI / 2) * (0.05 + vr(7) * 0.03) + Math.max(0, k - 0.66) * 0.16;
    const bt = (k) => hh * (look.fem ? 0.05 : 0.036) * (1 + vr(6) * 0.5) * (k < 0.14 ? 0.7 + k * 2.1 : 1 - (k - 0.14) * 0.92);
    x.save();
    x.shadowColor = browHair; x.shadowBlur = hh * 0.02;
    x.fillStyle = browHair.replace('rgb(', 'rgba(').replace(')', ',0.3)');
    if (browHair[0] === '#') x.fillStyle = rgba(browHair, 0.55);
    x.beginPath();
    for (let i = 0; i <= 12; i++) { const k = i / 12; x.lineTo(X(bu(k)), Y(bv(k)) - bt(k)); }
    for (let i = 12; i >= 0; i--) { const k = i / 12; x.lineTo(X(bu(k)), Y(bv(k)) + bt(k)); }
    x.closePath(); x.fill();
    x.restore();
    strands(look.fem ? 560 : 520, () => {
      const k = R() ** 0.85, o = R() * 2 - 1;                 // along the brow; above or below its middle
      const bx = X(bu(k)), by = Y(bv(k)) + o * bt(k) * 1.05;
      const th = Math.atan2((bv(k + 0.02) - bv(k)) * hh, (bu(k + 0.02) - bu(k)) * hw);
      // hairs from the lower edge lean up and out, hairs from the upper edge lean down and out: they meet along the middle
      let a = th - d * (o > 0 ? 0.6 : -0.3) * Math.abs(o) + (R() - 0.5) * 0.3;
      if (k < 0.16) a = -Math.PI / 2 + d * (0.3 + k * 3.5) + (R() - 0.5) * 0.25;
      const len = hw * (0.03 + R() * 0.03) * (k > 0.8 || k < 0.16 ? 0.65 : 1);
      return [bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, d * 0.6, browHair.replace('rgb(', 'rgba(').replace(')', `,${(0.4 + R() * 0.4).toFixed(2)})`)];
    }, look.fem ? 0.65 : 0.85);
  }

  // ---- eyes
  const eyes = [], eyePaths = [];
  for (const d of [-1, 1]) {
    const px = X(d * ex), py = Y(ey);
    eyes.push({ x: px, y: py, rx: erx, ry: ery });
    eyePaths.push(eyePath(px, py, d, erx, ery));
    // the upper lid is a little hood of skin: lit on its dome, creased where it folds under the brow bone
    mul(() => { soft(px + d * erx * 0.35, py - ery * 1.4, erx * 0.75, ery * 0.7, sh(0.26)); });
    soft(px - d * erx * 0.1, py - ery * 1.2, erx * 0.5, ery * 0.32, hi(0.18));
    for (const [al, lw] of [[0.28, s * 0.01], [0.7, s * 0.003]]) {
      x.strokeStyle = rgba(tone.pore, al); x.lineWidth = lw;
      x.beginPath(); x.moveTo(px - d * erx * 0.86, py - ery * 0.6);
      x.bezierCurveTo(px - d * erx * 0.45, py - ery * 2.0, px + d * erx * 0.45, py - ery * 2.15, px + d * erx * 1.1, py - ery * 0.7);
      x.stroke();
    }
    paintEye(x, px, py, d, erx, ery, look.eye, 0, 0);
    // upper lash line: darkest and thickest toward the outer corner, never a hard outline
    const B = [[px - d * erx, py + ery * 0.3], [px - d * erx * 0.6, py - ery * 1.05], [px + d * erx * 0.3, py - ery * 1.3], [px + d * erx * 1.03, py - ery * 0.15]];
    const onLid = (t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * B[0][i] + 3 * u * u * t * B[1][i] + 3 * u * t * t * B[2][i] + t * t * t * B[3][i]); };
    for (let i = 1; i < 28; i++) {
      const k = i / 28, a = onLid(k), b = onLid((i + 1) / 28);
      x.strokeStyle = `rgba(26,13,10,${0.5 + 0.45 * k})`; x.lineWidth = s * (look.fem ? 0.0062 : 0.0028) * (0.45 + 1.1 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.6));
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    // lashes: short, fine, in little clumps, sweeping outward
    strands(look.fem ? 96 : 30, () => {
      const k = 0.14 + Math.floor(R() * 14) / 14 * 0.84 + R() * 0.03;
      const [lx, ly] = onLid(k);
      const len = ery * (look.fem ? 0.43 : 0.22) * (0.35 + Math.sin(k * Math.PI * 0.75) * 0.75) * (0.75 + R() * 0.4);
      const lean = -0.35 + k * 1.15 + (R() - 0.5) * 0.25;
      return [lx, ly, lx + d * Math.sin(lean) * len, ly - Math.cos(lean) * len * 0.9, d * len * 0.22, `rgba(24,13,10,${0.5 + R() * 0.3})`];
    }, Math.max(0.4, s * 0.0013));
    // lower lid: its rim catches a little light, with a faint shadow and a few fine lashes below
    x.strokeStyle = rgba(tone.pore, 0.38); x.lineWidth = Math.max(0.8, s * 0.003);
    x.beginPath(); x.moveTo(px + d * erx * 1.0, py - ery * 0.1); x.bezierCurveTo(px + d * erx * 0.5, py + ery * 1.05, px - d * erx * 0.45, py + ery * 1.1, px - d * erx * 0.92, py + ery * 0.4); x.stroke();
    strands(9, () => {
      const k = 0.35 + R() * 0.55;
      const lx = px - d * erx + d * erx * 2 * k, ly = py + ery * (0.32 + Math.sin(k * Math.PI) * 0.62 - k * 0.38);
      return [lx, ly, lx + d * ery * 0.09, ly + ery * 0.15, 0, 'rgba(40,22,16,0.3)'];
    }, 0.5);
    if (old > 0.5) {
      x.strokeStyle = rgba(tone.pore, 0.2 * old); x.lineWidth = 1;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(px + d * erx * 1.12, py + (i - 1) * ery * 0.5); x.lineTo(px + d * erx * 1.5, py + (i - 1) * ery * 1.1); x.stroke(); }
    }
  }
  if (old >= 1) {
    x.strokeStyle = rgba(tone.pore, 0.22); x.lineWidth = 1.5;
    for (const v of [-0.5, -0.41, -0.33]) { x.beginPath(); x.moveTo(X(-0.5), Y(v)); x.quadraticCurveTo(cx, Y(v - 0.03), X(0.5), Y(v)); x.stroke(); }
  }

  // ---- nose: made of shadow and light, not of outline
  for (const d of [-1, 1]) {
    x.save();
    x.translate(X(d * 0.085), Y(noseY + 0.022)); x.rotate(d * -0.42); x.scale(1, 0.42);
    const ng = x.createRadialGradient(0, 0, 0, 0, 0, hw * 0.05);
    ng.addColorStop(0, 'rgba(60,22,20,0.62)'); ng.addColorStop(0.55, 'rgba(80,30,26,0.38)'); ng.addColorStop(1, 'rgba(70,26,22,0)');
    x.fillStyle = ng; x.beginPath(); x.arc(0, 0, hw * 0.05, 0, Math.PI * 2); x.fill();
    x.restore();
    // the wing: a rounded bulb, with the crease that curls round it kept soft
    for (const [al, lw] of [[0.07, s * 0.013], [0.11, s * 0.005], [0.13, s * 0.002]]) {
      x.strokeStyle = rgba(tone.pore, al); x.lineWidth = lw;
      x.beginPath(); x.moveTo(X(d * 0.15), Y(noseY - 0.085));
      x.bezierCurveTo(X(d * 0.215), Y(noseY - 0.085), X(d * 0.24), Y(noseY - 0.02), X(d * 0.2), Y(noseY + 0.015));
      x.stroke();
    }
    soft(X(d * 0.165 - 0.01), Y(noseY - 0.03), hw * 0.045, hh * 0.035, hi(0.15));
  }
  soft(cx, Y(noseY + 0.05), hw * 0.09, hh * 0.015, 'rgba(70,26,22,0.16)');             // the tip turning under, between the nostrils

  // ---- lips
  const my = Y(mouthY), mw = hw * (photo ? 0.37 : 0.35 + vr(4) * 0.03), lh = hh * (photo ? 1.0 : 1.3 + vr(5) * 0.2);     // how wide her mouth is, how full her lips
  const mixHex = (a, b, t) => {
    if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
    const p = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
  };
  const lipBase = mixHex(tone.blush, look.fem ? '#b8455c' : '#96484e', look.fem ? 0.5 : 0.3);   // her own lip colour, not lipstick
  const seamTo = (pth, dir) => {      // where the lips meet: a shallow M, dipping at the middle
    const pts = [[-1, 0.004], [-0.5, -0.006], [-0.14, 0.01], [0, 0.016], [0.14, 0.01], [0.5, -0.006], [1, 0.004]];
    if (dir < 0) pts.reverse();
    for (let i = 1; i < pts.length; i += 2) pth.quadraticCurveTo(cx + mw * pts[i][0], my + lh * pts[i][1], cx + mw * pts[i + 1][0], my + lh * pts[i + 1][1]);
  };
  const upper = new Path2D();
  upper.moveTo(cx - mw, my + lh * 0.004);
  upper.bezierCurveTo(cx - mw * 0.7, my - lh * 0.024, cx - mw * 0.42, my - lh * 0.066, cx - mw * 0.19, my - lh * 0.064);
  upper.quadraticCurveTo(cx - mw * 0.07, my - lh * 0.062, cx, my - lh * 0.044);
  upper.quadraticCurveTo(cx + mw * 0.07, my - lh * 0.062, cx + mw * 0.19, my - lh * 0.064);
  upper.bezierCurveTo(cx + mw * 0.42, my - lh * 0.066, cx + mw * 0.7, my - lh * 0.024, cx + mw, my + lh * 0.004);
  seamTo(upper, -1);
  upper.closePath();
  const lower = new Path2D();
  lower.moveTo(cx - mw, my + lh * 0.004);
  seamTo(lower, 1);
  lower.bezierCurveTo(cx + mw * 0.74, my + lh * 0.072, cx + mw * 0.36, my + lh * 0.112, cx, my + lh * 0.112);
  lower.bezierCurveTo(cx - mw * 0.36, my + lh * 0.112, cx - mw * 0.74, my + lh * 0.072, cx - mw, my + lh * 0.004);
  lower.closePath();
  // the edge of a lip is a soft change of colour, so both are filled with a little bleed
  const ug = x.createLinearGradient(0, my - lh * 0.066, 0, my + lh * 0.016);
  ug.addColorStop(0, tint(lipBase, 0.96)); ug.addColorStop(1, tint(lipBase, 0.7));       // the upper lip faces down, away from the light
  x.shadowColor = tint(lipBase, 0.9); x.shadowBlur = hh * 0.012;
  x.fillStyle = ug; x.fill(upper);
  const lg = x.createLinearGradient(0, my, 0, my + lh * 0.112);
  lg.addColorStop(0, tint(lipBase, 0.74)); lg.addColorStop(0.35, lipBase); lg.addColorStop(0.7, tint(lipBase, 1.1)); lg.addColorStop(1, tint(lipBase, 0.92));
  x.shadowColor = lipBase; x.fillStyle = lg; x.fill(lower);
  x.shadowColor = 'transparent'; x.shadowBlur = 0;
  // lip texture: fine creases fanning from the centre, kept inside the lips
  x.save(); x.clip(lower);
  x.lineWidth = Math.max(0.5, s * 0.0016);
  for (let i = 0; i < 34; i++) {
    const u = (R() - 0.5) * 1.7, v0 = 0.012 + R() * 0.02, v1 = v0 + 0.03 + R() * 0.045;
    x.strokeStyle = i % 3 ? 'rgba(90,30,36,0.1)' : 'rgba(255,255,255,0.1)';
    x.beginPath(); x.moveTo(cx + u * mw * 0.86, my + lh * v0); x.quadraticCurveTo(cx + u * mw * 0.95, my + lh * (v0 + v1) / 2, cx + u * mw * 0.99, my + lh * v1); x.stroke();
  }
  soft(cx - mw * 0.2, my + lh * 0.056, mw * 0.3, hh * 0.022, 'rgba(255,255,255,0.42)');
  soft(cx - mw * 0.16, my + lh * 0.05, mw * 0.1, hh * 0.008, 'rgba(255,255,255,0.4)');   // the lower lip is full and wet: two soft lights on it
  soft(cx + mw * 0.22, my + lh * 0.058, mw * 0.22, hh * 0.018, 'rgba(255,255,255,0.16)');
  for (const d of [-1, 1]) soft(cx + d * mw * 0.92, my + lh * 0.03, mw * 0.3, hh * 0.05, 'rgba(60,18,22,0.22)');
  x.restore();
  x.save(); x.clip(upper);
  x.lineWidth = Math.max(0.5, s * 0.0016);
  for (let i = 0; i < 18; i++) {
    const u = (R() - 0.5) * 1.5;
    x.strokeStyle = 'rgba(90,30,36,0.09)';
    x.beginPath(); x.moveTo(cx + u * mw, my); x.lineTo(cx + u * mw * 0.93, my - lh * 0.055); x.stroke();
  }
  soft(cx, my - lh * 0.03, mw * 0.2, hh * 0.018, 'rgba(255,255,255,0.1)');
  for (const d of [-1, 1]) soft(cx + d * mw * 0.92, my - lh * 0.01, mw * 0.3, hh * 0.04, 'rgba(60,18,22,0.2)');
  x.restore();
  // the seam: darkest in the middle, fading into the corners
  const seam = (k) => {
    x.beginPath(); x.moveTo(cx - mw * 0.94 * k, my + lh * 0.004);
    x.quadraticCurveTo(cx - mw * 0.5 * k, my - lh * 0.006, cx - mw * 0.14, my + lh * 0.01);
    x.quadraticCurveTo(cx, my + lh * 0.016, cx + mw * 0.14, my + lh * 0.01);
    x.quadraticCurveTo(cx + mw * 0.5 * k, my - lh * 0.006, cx + mw * 0.94 * k, my + lh * 0.004);
    x.stroke();
  };
  x.strokeStyle = 'rgba(64,20,24,0.26)'; x.lineWidth = Math.max(1, s * 0.0032); seam(1);
  x.strokeStyle = 'rgba(48,14,18,0.34)'; x.lineWidth = Math.max(1.1, s * 0.004); seam(0.6);
  for (const d of [-1, 1]) soft(cx + d * mw * 1.05, my + lh * 0.008, hw * 0.035, hh * 0.022, 'rgba(60,20,20,0.36)');   // corners of the mouth
  // the ridge above the bow of the lip is paler than the skin round it
  x.strokeStyle = hi(0.1); x.lineWidth = Math.max(1.5, s * 0.008);
  x.beginPath(); x.moveTo(cx - mw * 0.42, my - lh * 0.07); x.quadraticCurveTo(cx - mw * 0.19, my - lh * 0.078, cx, my - lh * 0.054); x.quadraticCurveTo(cx + mw * 0.19, my - lh * 0.078, cx + mw * 0.42, my - lh * 0.07); x.stroke();

  // ---- lines that come with age, and the last soft turn of the jaw
  for (const d of [-1, 1]) {
    x.strokeStyle = rgba(tone.pore, 0.12 * old); x.lineWidth = s * 0.009;
    x.beginPath(); x.moveTo(X(d * 0.22), Y(noseY - 0.01)); x.quadraticCurveTo(X(d * 0.35), Y(noseY + 0.07), X(d * 0.4), Y(mouthY - 0.06)); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.1 * old); x.lineWidth = s * 0.0035; x.stroke();
  }
  mul(() => { soft(cx, Y(chinV - 0.005), hw * 0.75, hh * 0.1, sh(0.3)); });
  x.save();
  x.clip(head);
  for (let i = 0; i < 2600; i++) {
    const u = (R() * 2 - 1), v = R() * 2.1 - 1.05;
    x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : rgba(tone.pore, 0.06);
    x.fillRect(X(u), Y(v), 0.9 + R() * 0.8, 0.9 + R() * 0.8);
  }
  x.restore();

  // ---- jewellery: most women wear a little something
  const jewel = (seed >>> 3) % 5, chain = (seed >>> 5) % 3 === 0;
  const metal = (seed >>> 7) % 2 ? ['#fff3c4', '#e9c46a', '#a9822a'] : ['#ffffff', '#cfd6df', '#7f8794'];
  if (jewel && !photo && style !== 'long' && style !== 'short') {          // worn down, her hair covers her ears
    for (const d of [-1, 1]) {
      const lx = X(d * (earX + 0.045)), ly = Y(0.19), r = hw * 0.028;
      if (jewel === 3) {                                   // a small hoop
        x.strokeStyle = metal[2]; x.lineWidth = r * 0.75;
        x.beginPath(); x.ellipse(lx, ly + r * 2.2, r * 1.3, r * 2.2, 0, 0, Math.PI * 2); x.stroke();
        x.strokeStyle = metal[0]; x.lineWidth = r * 0.3;
        x.beginPath(); x.ellipse(lx - r * 0.15, ly + r * 2.1, r * 1.3, r * 2.2, 0, Math.PI * 0.9, Math.PI * 1.6); x.stroke();
      } else {                                             // a stud, a pearl or a little gem
        soft(lx + r * 0.3, ly + r * 0.5, r * 1.8, r * 1.8, 'rgba(40,15,10,0.3)');
        const jg = x.createRadialGradient(lx - r * 0.35, ly - r * 0.4, 0, lx, ly, r);
        const cols = jewel === 1 ? metal : jewel === 2 ? ['#ffffff', '#f3ece4', '#c9bfb4'] : ['#ffffff', '#ff9fc0', '#c2185b'];
        jg.addColorStop(0, cols[0]); jg.addColorStop(0.5, cols[1]); jg.addColorStop(1, cols[2]);
        x.fillStyle = jg; x.beginPath(); x.arc(lx, ly, r, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(lx - r * 0.35, ly - r * 0.38, r * 0.25, 0, Math.PI * 2); x.fill();
      }
    }
  }
  if (chain) {                                             // a fine chain with a tiny pendant in the hollow of the throat
    x.strokeStyle = 'rgba(40,15,10,0.2)'; x.lineWidth = 2.2;
    x.beginPath(); x.moveTo(X(-0.47), Y(1.14)); x.quadraticCurveTo(cx, Y(1.5), X(0.47), Y(1.14)); x.stroke();
    x.strokeStyle = metal[1]; x.lineWidth = 1.1; x.setLineDash([1.6, 1.2]);
    x.beginPath(); x.moveTo(X(-0.47), Y(1.13)); x.quadraticCurveTo(cx, Y(1.49), X(0.47), Y(1.13)); x.stroke();
    x.setLineDash([]);
    const pr = hw * 0.03, py2 = Y(1.325);
    const pg = x.createRadialGradient(cx - pr * 0.3, py2 - pr * 0.3, 0, cx, py2, pr);
    pg.addColorStop(0, metal[0]); pg.addColorStop(0.6, metal[1]); pg.addColorStop(1, metal[2]);
    x.fillStyle = pg; x.beginPath(); x.arc(cx, py2, pr, 0, Math.PI * 2); x.fill();
  }

  // ---- glasses (the painted portraits have none, and arms poking out past a painted face look wrong)
  if (look.glasses && !photo) {
    x.strokeStyle = '#27212b'; x.lineWidth = s * 0.014;
    for (const d of [-1, 1]) {
      x.beginPath(); x.roundRect(X(d * ex) - erx * 1.5, Y(ey) - ery * 2.6, erx * 3, ery * 5.2, ery * 1.7); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fill();
      x.beginPath(); x.moveTo(X(d * ex) + d * erx * 1.5, Y(ey - 0.03)); x.lineTo(X(d * 1.02), Y(ey - 0.05)); x.stroke();
    }
    x.beginPath(); x.moveTo(X(-ex) + erx * 1.5, Y(ey)); x.quadraticCurveTo(cx, Y(ey - 0.04), X(ex) - erx * 1.5, Y(ey)); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(X(d * ex) - erx * 1.0, Y(ey) - ery * 1.85); x.lineTo(X(d * ex) - erx * 0.3, Y(ey) - ery * 2.1); x.stroke(); }
  }

  // a couple of moles, never on the lips or the eyes
  for (let i = 0; i < 3; i++) {
    const u = (R() - 0.5) * 1.3, v = -0.3 + R() * 1.1;
    // a beauty mark sits out on the cheek or near the lip, never on the nose or between the eyes
    if (i > 0 || Math.abs(u) < 0.42 || (Math.abs(v - mouthY) < 0.16 && Math.abs(u) < 0.45) || (Math.abs(v - ey) < 0.16 && Math.abs(Math.abs(u) - ex) < 0.3)) continue;
    x.fillStyle = 'rgba(85,48,34,0.5)';
    x.beginPath(); x.arc(X(u), Y(v), (0.8 + R() * 1.3) * Math.max(0.3, Math.min(1, s / 380)), 0, Math.PI * 2); x.fill();
  }

  soft(cx, my - lh * 0.072, hw * 0.05, hh * 0.014, hi(0.16));             // cupid's bow catches the light
  // the room falls away into soft shadow at the edges
  const vg = x.createRadialGradient(cx, cy, Math.min(w, h) * 0.45, cx, cy, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(20,18,40,0)'); vg.addColorStop(1, 'rgba(20,18,40,0.3)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);

  // ---- where things are, for the game
  const ell = (px, py, ox, oy, rx, ry) => ((px - ox) / rx) ** 2 + ((py - oy) / ry) ** 2 < 1;
  const inHead = (px, py) => xr.isPointInPath(head, px * dpr, py * dpr);
  const edgeV = (u) => (hasHair && style !== 'balding' ? hl(u) + 0.03 : -0.92);
  const blocked = (px, py, r = 0) => {
    const u = (px - cx) / hw, v = (py - cy) / hh;
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (!inHead(px + ox * 1.3, py + oy * 1.3)) return true;
    if ((py - r - cy) / hh < edgeV(u)) return true;                                           // hair
    for (const e of eyes) if (ell(px, py, e.x, e.y - ery * 1.5, erx * 1.7 + r, ery * 5.2 + r)) return true;   // eyes + brows
    if (ell(px, py, cx, my + lh * 0.02, mw * 1.25 + r, lh * 0.12 + r)) return true;           // lips
    if (ell(px, py, cx, Y(noseY + 0.02), hw * 0.2 + r * 0.6, hh * 0.05 + r * 0.6)) return true;   // nostrils
    if (look.beard && v > 0.38) return true;                                                  // full beard
    return false;
  };
  const ZONE = {
    // on a painting the brows are fuller and sit higher, so the forehead zone stays clear of them
    forehead: () => (photo ? [X((R() * 2 - 1) * 0.52), Y(-0.47 + (R() * 2 - 1) * 0.1)] : [X((R() * 2 - 1) * 0.6), Y(-0.42 + (R() * 2 - 1) * 0.15)]),
    nose: () => [X((R() * 2 - 1) * 0.14), Y(0.12 + (R() * 2 - 1) * 0.2)],
    cheek: () => { const d = R() < 0.5 ? -1 : 1; return [X(d * (0.55 + (R() * 2 - 1) * 0.24)), Y(0.3 + (R() * 2 - 1) * 0.2)]; },
    chin: () => [X((R() * 2 - 1) * Math.min(0.4, chinW + 0.08)), Y(chinV - (photo ? 0.17 : 0.19) + (R() * 2 - 1) * (photo ? 0.075 : 0.1))],
  };
  const anyPoint = () => {
    for (let i = 0; i < 60; i++) {
      const px = X(Math.random() * 2 - 1), py = Y(Math.random() * 2 - 1);
      if (!blocked(px, py, 4)) return { x: px, y: py };
    }
    return { x: cx, y: Y(0.5) };
  };
  const zonePoint = (zone) => { const f = ZONE[zone]; if (!f) return anyPoint(); const [px, py] = f(); return { x: px, y: py }; };
  // random source for gameplay should not replay the paint seed
  // stray hairs: between and under the brows, on the upper lip, on the chin
  const strayPoint = () => {
    const k = Math.random(), j = () => (Math.random() - 0.5);
    if (k < 0.35) return { x: X(j() * 0.2), y: Y(ey - 0.2 + j() * 0.06), a: -Math.PI / 2 + j() };
    if (k < 0.6) { const d = Math.random() < 0.5 ? -1 : 1; return { x: X(d * (ex + j() * 0.3)), y: Y(ey - 0.11 + j() * 0.03), a: Math.PI / 2 + j() * 0.6 }; }
    if (k < 0.82) return { x: X(j() * 0.5), y: Y(mouthY - 0.085 + j() * 0.03), a: Math.PI / 2 + j() * 0.8 };
    return { x: X(j() * 0.5), y: Y(chinV - 0.175 + j() * 0.1), a: Math.PI / 2 + j() };
  };
  // everything that is hair: the top of the head above the hairline, the volume around
  // the skull, and the lengths hanging at the sides
  const onHair = (px, py) => {
    if (!hasHair) return false;
    const u = (px - cx) / hw, v = (py - cy) / hh;
    if (inHead(px, py)) return v < edgeV(u) - 0.03;
    if (v < -0.28 && (u / 1.09) ** 2 + ((v + 0.3) / 0.8) ** 2 < 1) return true;
    if ((style === 'long' || style === 'curly') && Math.abs(u) > 0.9 && Math.abs(u) < (style === 'curly' ? 1.45 : 1.2) && v > -0.4 && v < 1.5) return true;
    if (style === 'bun' && Math.hypot(u, (v + 1.22) * (hh / hw)) < 0.42) return true;
    return false;
  };
  const lipsPath = new Path2D();
  lipsPath.addPath(upper); lipsPath.addPath(lower);
  const inLips = (px, py) => xr.isPointInPath(lipsPath, px * dpr, py * dpr);
  const lipsBox = [cx - mw, my - lh * 0.066, cx + mw, my + lh * 0.112];
  const cheeks = [-1, 1].map((d) => ({ x: X(d * 0.56), y: Y(0.3), rx: hw * 0.27, ry: hh * 0.16 }));
  const lids = eyes.map((e) => ({ x: e.x, y: e.y - ery * 1.0, rx: erx * 1.12, ry: ery * 1.6 }));     // the whole lid, lash line to crease: she shuts her eyes for it
  const onSkin = (px, py) => inHead(px, py) && (py - cy) / hh >= edgeV((px - cx) / hw);   // face, not hair
  // the same thing as a shape, for clipping whatever is put on her face (foam, masks, mess) so that
  // none of it lands on her hair, ears, neck or the wall
  const below = new Path2D();
  below.moveTo(X(-1.4), Y(1.4));
  for (let i = -28; i <= 28; i++) below.lineTo(X(i / 20), Y(edgeV(Math.max(-1, Math.min(1, i / 20))) + Math.max(0, Math.abs(i / 20) - 0.8) * 0.9));
  below.lineTo(X(1.4), Y(1.4)); below.closePath();
  const clipSkin = (ctx) => { ctx.clip(head); ctx.clip(below); };
  const geo = { cx, cy, hw, hh, eyes, inHead, onSkin, blocked, anyPoint, zonePoint, strayPoint,
    lipsPath, inLips, lipsBox, cheeks, lids, onHair, clipSkin, headPath: head, shape, eyeCol: look.eye, eyePaths, hairlineY: Y(hairline), browY: Y(ey - 0.215), lid: tone.base, lidShade: tone.shade, lash: '#2a1712' };
  if (photo) {
    // the painting, scaled and placed so its eyes sit exactly on the geometry's eyes
    const im = photo.img, iw = im.naturalWidth, ih = im.naturalHeight;
    const k = (2 * ex * hw) / ((photo.eR - photo.eL) * iw);
    const x0 = cx - (photo.eL + photo.eR) / 2 * iw * k, y0 = Y(ey) - photo.eyeY * ih * k;
    xr.setTransform(dpr, 0, 0, dpr, 0, 0);
    xr.globalAlpha = 1; xr.globalCompositeOperation = 'source-over'; xr.shadowColor = 'transparent'; xr.filter = 'none';
    xr.imageSmoothingQuality = 'high';
    const own = look.photoFace && hasHair && !full ? styledFor(photo, style, hair, !!look.wet) : null;
    if (own) {
      // the salon, with her own portrait in this hairstyle: the room, then the whole painting of her
      const sw2 = own.canvas.width, sh2 = own.canvas.height, f = own.fit;
      const sk = (2 * ex * hw) / ((f[2] - f[1]) * sw2), ox = cx - (f[1] + f[2]) / 2 * sw2 * sk, oy = Y(ey) - f[0] * sh2 * sk;
      if (room) { xr.save(); xr.setTransform(1, 0, 0, 1, 0, 0); xr.drawImage(room, 0, 0); xr.restore(); }
      xr.drawImage(own.canvas, ox, oy, sw2 * sk, sh2 * sk);
      if (oy + sh2 * sk < h) xr.drawImage(own.canvas, 0, sh2 - 3, sw2, 3, ox, oy + sh2 * sk - 1, sw2 * sk, h - (oy + sh2 * sk) + 1);   // her top carries on below
      geo.onHair = (px, py) => {
        const ix = Math.round((px - ox) / sk / 2), iy = Math.round((py - oy) / sk / 2);
        return ix >= 0 && iy >= 0 && ix < own.HW && iy < own.HH && own.hairA[iy * own.HW + ix] > 110;
      };
      geo.wig = true; geo.own = true;
    } else if (look.photoFace && !full) {
      // in the salon her hair is drawn live (washed, cut, dyed, restyled), so only her painted face and
      // neck are laid in, feathered at the edges so they melt into the hair and skin drawn around them
      const D = (W) => { const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; const cx2 = cv.getContext('2d'); cx2.setTransform(dpr, 0, 0, dpr, 0, 0); return [cv, cx2]; };
      const wig = hasHair ? wigFor(style, hair) : null;      // her painted hairstyle, when there is one
      let foreheadBlend = null;
      // her drawn hair is made to sit with the painting: the fine strands are softened into painted
      // masses, then given the gloss and depth a painter would add
      {
        const sm = document.createElement('canvas'); sm.width = Math.ceil(c.width / 3); sm.height = Math.ceil(c.height / 3);
        const sq = sm.getContext('2d'); sq.imageSmoothingQuality = 'high'; sq.drawImage(c, 0, 0, sm.width, sm.height);
        xr.save(); xr.setTransform(1, 0, 0, 1, 0, 0); xr.imageSmoothingQuality = 'high'; xr.globalAlpha = 0.62; xr.drawImage(sm, 0, 0, c.width, c.height); xr.restore();
        xr.save();
        xr.globalCompositeOperation = 'soft-light'; xr.lineCap = 'round';
        const arc = (ox, oy, rx, ry, a0, a1, lw, al, col = '255,255,255') => { xr.strokeStyle = `rgba(${col},${al})`; xr.lineWidth = lw; xr.beginPath(); xr.ellipse(ox, oy, rx, ry, 0, a0, a1); xr.stroke(); };
        if (hasHair && style !== 'buzz' && style !== 'curly' && !wig) {
          xr.save();
          const dome = new Path2D(); dome.ellipse(cx, Y(-0.3), hw * 1.06, hh * 0.85, 0, Math.PI, Math.PI * 2); xr.clip(dome);
          for (const [lw, al] of [[0.2, 0.14], [0.13, 0.2], [0.07, 0.3], [0.03, 0.4]]) arc(X(-0.06), Y(-0.2), hw * 0.86, hh * 0.6, Math.PI * 1.18, Math.PI * 1.8, hh * lw, al);   // a band of shine over the crown
          for (const [lw, al] of [[0.3, 0.16], [0.18, 0.2]]) arc(cx, Y(-0.3), hw * 1.06, hh * 0.85, Math.PI * 1.02, Math.PI * 1.98, hh * lw, al, '20,8,12');                        // the head turns away at its edge
          xr.restore();
        }
        if (!wig && (style === 'long' || style === 'short')) {
          const y1 = style === 'long' ? 1.05 : 0.5;
          for (const d of [-1, 1]) for (const [lw, al] of [[0.16, 0.12], [0.09, 0.2], [0.04, 0.28]]) {      // light running down the lengths
            xr.strokeStyle = `rgba(255,255,255,${al * (d < 0 ? 1 : 0.7)})`; xr.lineWidth = hw * lw;
            xr.beginPath(); xr.moveTo(X(d * 1.02), Y(-0.25)); xr.quadraticCurveTo(X(d * 1.12), Y(y1 * 0.4), X(d * 1.06), Y(y1)); xr.stroke();
          }
          for (const d of [-1, 1]) for (const [lw, al] of [[0.2, 0.2], [0.1, 0.25]]) {                         // and shade where it falls behind her jaw
            xr.strokeStyle = `rgba(20,8,12,${al})`; xr.lineWidth = hw * lw;
            xr.beginPath(); xr.moveTo(X(d * 0.86), Y(0.45)); xr.quadraticCurveTo(X(d * 0.8), Y(0.8), X(d * 0.72), Y(y1 + 0.1)); xr.stroke();
          }
        }
        xr.restore();
      }
      const [shp, sx] = D();
      sx.fillStyle = '#000';
      // from a little below the hairline down, so none of her painted hair comes with it
      sx.save(); sx.clip(head); sx.clip(below);
      if (wig) {
        // under painted hair the face starts lower, and lower still toward her temples, where the
        // portrait has her own hair pulled back under the band
        sx.beginPath(); sx.moveTo(X(-1.3), Y(1.6));
        for (let i = -26; i <= 26; i++) { const u = i / 20; sx.lineTo(X(u), Y(hairline + 0.13 + 0.62 * Math.max(0, Math.abs(u) - 0.4) ** 1.3)); }
        sx.lineTo(X(1.3), Y(1.6)); sx.closePath(); sx.fill();
      } else sx.fillRect(0, Y(hairline + 0.055), w, h);
      sx.restore();
      sx.save(); sx.clip(neck); sx.fillRect(0, Y(chinV - 0.2), w, Y(1.5) - Y(chinV - 0.2)); sx.restore();
      const [mask, mx] = D();
      mx.setTransform(1, 0, 0, 1, 0, 0);
      const fe = Math.max(1.5, hw * 0.045) * dpr;
      // feathered without canvas blur filters (iPhone Safari has none): the shape is stamped many times
      // in a small ring at low strength, at a third of the size, then stretched back smoothly
      const half = document.createElement('canvas'); half.width = Math.ceil(shp.width / 3); half.height = Math.ceil(shp.height / 3);
      const hq = half.getContext('2d'); hq.imageSmoothingQuality = 'high'; hq.drawImage(shp, 0, 0, half.width, half.height);
      const acc = document.createElement('canvas'); acc.width = half.width; acc.height = half.height;
      const aq = acc.getContext('2d'); aq.globalCompositeOperation = 'lighter';
      const fr = fe / 3, stamps = [[0, 0]];
      for (const [rad, n] of [[0.5, 8], [1, 14]]) for (let q = 0; q < n; q++) stamps.push([Math.cos(q / n * 6.283) * fr * rad, Math.sin(q / n * 6.283) * fr * rad]);
      aq.globalAlpha = 1 / stamps.length;
      // shrunk a little, so the feather eats into her face rather than spilling past it
      for (const [ox, oy] of stamps) aq.drawImage(half, ox + fr * 0.8, oy + fr * 0.8, half.width - fr * 1.6, half.height - fr * 1.6);
      mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high';
      mx.drawImage(acc, 0, 0, shp.width, shp.height);
      if (wig) {
        // the headband in her portrait hid the top of her forehead; with painted hair it shows, so the
        // skin just under the band is carried upward to meet the new hairline
        const v0 = hairline + 0.2, sy = (Y(v0) - y0) / k;
        // her own skin, taken from just under the band (through a few-pixel-wide copy, so it is a smooth
        // wash and not streaks of every freckle), shaded like the forehead in the hair painting and cut
        // to the exact opening that hairstyle leaves
        const tiny = document.createElement('canvas'); tiny.width = 7; tiny.height = 1;
        const sx0 = (X(-0.8) - x0) / k, sx1 = (X(0.8) - x0) / k;
        tiny.getContext('2d').drawImage(im, sx0, sy, sx1 - sx0, Math.max(2, ih * 0.012), 0, 0, 7, 1);
        const wk = (2 * ex * hw) / ((WIG.eR - WIG.eL) * WIG_W) * WIG.fit;
        const wx = cx - (WIG.eL + WIG.eR) / 2 * WIG_W * wk, wy = Y(ey) - WIG.eyeY * WIG_H * wk;
        const [fh, fx2] = D();
        fx2.imageSmoothingEnabled = true; fx2.imageSmoothingQuality = 'high';
        fx2.drawImage(tiny, 0.5, 0, 6, 1, X(-1.2), wy, X(1.2) - X(-1.2), WIG_H * wk);
        fx2.globalCompositeOperation = 'multiply'; fx2.drawImage(wig.forehead, wx, wy, WIG_W * wk, WIG_H * wk);
        fx2.globalCompositeOperation = 'destination-in'; fx2.drawImage(wig.forehead, wx, wy, WIG_W * wk, WIG_H * wk);
        xr.save(); xr.setTransform(1, 0, 0, 1, 0, 0); xr.drawImage(fh, 0, 0); xr.restore();
        // kept for after her face is laid in: the same forehead, fading out downward, so the join
        // between it and her painted face is a soft blend and not a line
        const fade = fx2.createLinearGradient(0, Y(hairline + 0.1), 0, Y(hairline + 0.3));
        fade.addColorStop(0, '#000'); fade.addColorStop(1, 'rgba(0,0,0,0)');
        fx2.globalCompositeOperation = 'destination-in'; fx2.fillStyle = fade; fx2.fillRect(0, 0, w, h);
        foreheadBlend = fh;
      }
      const [lay, lx] = D();
      lx.imageSmoothingQuality = 'high';
      lx.drawImage(im, x0, y0, iw * k, ih * k);
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.globalCompositeOperation = 'destination-in'; lx.drawImage(mask, 0, 0);
      xr.setTransform(1, 0, 0, 1, 0, 0); xr.drawImage(lay, 0, 0); xr.setTransform(dpr, 0, 0, dpr, 0, 0);
      // her painted hairstyle, tinted, over the drawn one and the edges of her face
      if (wig) {
        if (foreheadBlend) { xr.save(); xr.setTransform(1, 0, 0, 1, 0, 0); xr.drawImage(foreheadBlend, 0, 0); xr.restore(); }
        xr.setTransform(dpr, 0, 0, dpr, 0, 0);
        const wk = (2 * ex * hw) / ((WIG.eR - WIG.eL) * WIG_W) * WIG.fit;
        const wx = cx - (WIG.eL + WIG.eR) / 2 * WIG_W * wk, wy = Y(ey) - WIG.eyeY * WIG_H * wk;
        xr.imageSmoothingQuality = 'high';
        xr.save(); xr.shadowColor = 'rgba(40,15,20,0.3)'; xr.shadowBlur = 7 * dpr; xr.shadowOffsetY = 2 * dpr;      // it lifts off her skin a little
        xr.drawImage(wig.canvas, wx, wy, WIG_W * wk, WIG_H * wk);
        xr.restore();
        const drawn = geo.onHair;
        geo.onHair = (px, py) => {
          if (onSkin(px, py)) return false;
          const ix = Math.round((px - wx) / wk), iy = Math.round((py - wy) / wk);
          if (ix < 0 || iy < 0 || ix >= WIG_W || iy >= WIG_H) return drawn(px, py) && iy < 0;
          return wig.alpha[iy * WIG_W + ix] > 110;
        };
        geo.wig = true;
      }
    } else {
    if (y0 > 0) { xr.fillStyle = `rgb(${photo.bg || '244,190,205'})`; xr.fillRect(0, 0, w, y0 + 1); }      // the plain backdrop carries on above
    const seamTop = y0 > 0 ? y0 : null;
    if (y0 + ih * k < h) xr.drawImage(im, 0, ih - 3, iw, 3, 0, y0 + ih * k - 1, w, h - (y0 + ih * k) + 1);   // and her top below
    if (x0 > 0) { xr.drawImage(im, 0, 0, 3, ih, 0, y0, x0 + 1, ih * k); xr.drawImage(im, iw - 3, 0, 3, ih, x0 + iw * k - 1, y0, w - (x0 + iw * k) + 1, ih * k); }
    xr.drawImage(im, x0, y0, iw * k, ih * k);
    if (seamTop != null) {
      // the pictures are cropped through the top of her hair, so above the picture the hair is rounded
      // off: a dome over the span where hair meets the edge, filled by carrying its top rows upward
      const q = photo.bg || '244,190,205';
      xr.fillStyle = `rgb(${q})`; xr.fillRect(0, 0, w, seamTop + 0.5);
      const sg = xr.createLinearGradient(0, seamTop, 0, seamTop + 40);        // the backdrop melts into the picture's own
      sg.addColorStop(0, `rgba(${q},1)`); sg.addColorStop(1, `rgba(${q},0)`);
      const cap = photo.cap;
      for (const [a, b] of cap ? [[0, cap[0] - 0.03], [cap[1] + 0.03, 1]] : [[0, 1]]) if (b > a) { xr.fillStyle = sg; xr.fillRect(x0 + a * iw * k, seamTop - 0.5, (b - a) * iw * k, 41); }
      if (cap) {
        // the top of her hair is part of a circle about 0.43 picture-widths across its radius: carry that same curve on
        const mx = x0 + (cap[0] + cap[1]) / 2 * iw * k, rx = (cap[1] - cap[0]) / 2 * iw * k, Rr = Math.max(rx * 1.02, 0.43 * iw * k), ry = Math.min(seamTop - 4, Rr - Math.sqrt(Rr * Rr - rx * rx));
        if (ry > 2) {
          xr.save();
          // a low arc that tapers to nothing at each end (a half-ellipse stands up straight at its ends and read as a block)
          xr.beginPath(); xr.moveTo(mx - rx, seamTop + 1); xr.quadraticCurveTo(mx, seamTop - ry * 2, mx + rx, seamTop + 1); xr.closePath(); xr.clip();
          xr.drawImage(im, 0, 0, iw, 3, x0, seamTop - ry - 1, iw * k, ry + 3);
          const dg = xr.createLinearGradient(0, seamTop - ry, 0, seamTop);        // it turns away from the light at the top
          dg.addColorStop(0, 'rgba(0,0,0,0.22)'); dg.addColorStop(0.5, 'rgba(0,0,0,0.07)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
          xr.fillStyle = dg; xr.fillRect(mx - rx, seamTop - ry - 1, rx * 2, ry + 2);
          xr.restore();
        }
      }
    }
    }
    // eyelids are drawn live when she blinks, so they take their colour from the painting itself
    geo.lid = photo.lid || tone.base;
    geo.lidShade = photo.lidShade || tone.shade;
    // her closed eyes come from a second painting of her: just the two eyes are cut out of it, feathered,
    // and faded in over the open ones when she blinks or shuts her eyes
    if (photo.shut && photo.shut.complete && photo.shut.naturalWidth) {
      const pad = erx * 2.1, px0 = eyes[0].x - pad, py0 = eyes[0].y - ery * 3.2, pw = eyes[1].x - eyes[0].x + pad * 2, phh = ery * 6.4;
      const pc = document.createElement('canvas'); pc.width = Math.ceil(pw * dpr); pc.height = Math.ceil(phh * dpr);
      const pq = pc.getContext('2d');
      pq.setTransform(dpr, 0, 0, dpr, -px0 * dpr, -py0 * dpr);
      pq.imageSmoothingQuality = 'high';
      pq.drawImage(photo.shut, x0, y0, iw * k, ih * k);
      const mc = document.createElement('canvas'); mc.width = pc.width; mc.height = pc.height;
      const mq = mc.getContext('2d');
      mq.setTransform(dpr, 0, 0, dpr, -px0 * dpr, -py0 * dpr);
      for (const e of eyes) {
        mq.save(); mq.translate(e.x, e.y + ery * 0.25); mq.scale(1, (ery * 2.7) / (erx * 1.8));
        const g = mq.createRadialGradient(0, 0, 0, 0, 0, erx * 1.8);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.62, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        mq.fillStyle = g; mq.beginPath(); mq.arc(0, 0, erx * 1.8, 0, Math.PI * 2); mq.fill();
        mq.restore();
      }
      pq.setTransform(1, 0, 0, 1, 0, 0); pq.globalCompositeOperation = 'destination-in'; pq.drawImage(mc, 0, 0);
      geo.shut = { canvas: pc, x: px0, y: py0, w: pw, h: phh };
    }
    // her smile comes from a third painting: the lower face (mouth, and the cheeks that lift with it)
    // is cut out, feathered, and faded in when she is pleased
    if (photo.smile && photo.smile.complete && photo.smile.naturalWidth) {
      const srx = hw * 0.8, sry = hh * 0.3, scx = cx, scy = Y(mouthY - 0.03);
      const px0 = scx - srx, py0 = scy - sry, pw = srx * 2, phh = sry * 2;
      const pc = document.createElement('canvas'); pc.width = Math.ceil(pw * dpr); pc.height = Math.ceil(phh * dpr);
      const pq = pc.getContext('2d');
      pq.setTransform(dpr, 0, 0, dpr, -px0 * dpr, -py0 * dpr);
      pq.imageSmoothingQuality = 'high';
      pq.drawImage(photo.smile, x0, y0, iw * k, ih * k);
      pq.globalCompositeOperation = 'destination-in';
      pq.translate(scx, scy); pq.scale(1, sry / srx);
      const g = pq.createRadialGradient(0, 0, 0, 0, 0, srx);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      pq.fillStyle = g; pq.fillRect(-srx, -srx, srx * 2, srx * 2);
      geo.smile = { canvas: pc, x: px0, y: py0, w: pw, h: phh };
    }
    geo.eyeCol = null;            // her painted eyes stay as painted
    geo.photo = true;
    geo.photoHair = look.photoFace ? null : photo.hair;
  }
  return { canvas: c, geo };
}

/** Eyelids drawn live over the painted eyes: closed = 0 (open) .. 1 (shut). */
export function drawLids(ctx, geo, closed) {
  if (closed <= 0.02) return;
  if (geo.shut) {
    // painted closed eyes, faded in. Quick at first, so a blink reads as a blink
    const a = Math.min(1, closed * 1.7);
    ctx.save(); ctx.globalAlpha = a * a * (3 - 2 * a); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(geo.shut.canvas, geo.shut.x, geo.shut.y, geo.shut.w, geo.shut.h);
    ctx.restore();
    return;
  }
  if (geo.photo) {
    // over a painting: a soft patch of her own lid colour melts over the painted eye, then the closed
    // lash line and its lashes are drawn where the lids meet
    const k = Math.min(1, closed * 1.6), hex = (c, al) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`; };
    for (const e of geo.eyes) {
      const d = Math.sign(e.x - geo.cx) || 1, rx = e.rx, ry = e.ry;
      ctx.save();
      ctx.translate(e.x, e.y + ry * 0.15); ctx.scale(1, (ry * 2.5) / (rx * 1.5));
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.5);
      g.addColorStop(0, hex(geo.lid, k)); g.addColorStop(0.62, hex(geo.lid, k)); g.addColorStop(0.82, hex(geo.lid, k * 0.55)); g.addColorStop(1, hex(geo.lid, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = k; ctx.lineCap = 'round';
      const ax = e.x - d * rx * 1.02, ay = e.y + ry * 0.35, bx = e.x + d * rx * 1.08, by = e.y + ry * 0.05, mx = e.x + d * rx * 0.05, my = e.y + ry * 1.5;
      // the dome of the lid catches a little light, and the crease above it stays
      const hl = ctx.createRadialGradient(e.x, e.y - ry * 0.2, 0, e.x, e.y - ry * 0.2, rx * 0.7);
      hl.addColorStop(0, 'rgba(255,240,225,0.16)'); hl.addColorStop(1, 'rgba(255,240,225,0)');
      ctx.fillStyle = hl; ctx.beginPath(); ctx.ellipse(e.x, e.y - ry * 0.2, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hex(geo.lidShade, 0.55); ctx.lineWidth = Math.max(0.8, rx * 0.045);
      ctx.beginPath(); ctx.moveTo(e.x - d * rx * 0.85, e.y - ry * 0.75); ctx.quadraticCurveTo(e.x, e.y - ry * 1.75, e.x + d * rx * 0.95, e.y - ry * 0.7); ctx.stroke();
      ctx.strokeStyle = 'rgba(38,20,14,0.9)'; ctx.lineWidth = Math.max(1, rx * 0.075);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
      ctx.lineWidth = Math.max(0.5, rx * 0.03);
      for (let i = 1; i < 16; i++) {
        const t = i / 16, u = 1 - t;
        const lx = u * u * ax + 2 * u * t * mx + t * t * bx, ly = u * u * ay + 2 * u * t * my + t * t * by;
        const len = ry * 0.55 * (0.45 + t * 0.7);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + d * len * 0.25, ly + len * 0.7, lx + d * len * (0.3 + t * 0.6), ly + len * 0.85); ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }
  for (const e of geo.eyes) {
    // a real lid: skin sliding down from the upper lash line, its edge curving with the eyeball
    const d = Math.sign(e.x - geo.cx) || 1, rx = e.rx * 1.03, ry = e.ry;
    const ax = e.x - d * rx, ay = e.y + ry * 0.3, bx = e.x + d * rx * 1.02, by = e.y - ry * 0.12;
    const mx = e.x + d * rx * 0.1, my = e.y + ry * (-1.3 + 2.8 * closed);     // shut, it reaches right down over the lower rim
    ctx.save();
    const g = ctx.createLinearGradient(0, e.y - ry * 2.2, 0, e.y + ry * 0.9);
    g.addColorStop(0, geo.lid); g.addColorStop(0.3, geo.lidShade); g.addColorStop(0.62, geo.lid); g.addColorStop(1, geo.lidShade);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    // as it closes, the lid also covers the open eye's upper lashes, which would otherwise float above it
    const c3 = Math.min(1, closed * 3), up = 1.38 + 1.3 * c3;
    ctx.lineTo(ax - d * rx * 0.06 * c3, ay - ry * 0.6 * c3);
    ctx.quadraticCurveTo(e.x - d * rx * 0.1, e.y - ry * up, bx + d * rx * 0.14 * c3, by - ry * 0.9 * c3);
    ctx.lineTo(bx, by);
    ctx.quadraticCurveTo(mx, my, ax, ay);
    ctx.fill();
    ctx.globalCompositeOperation = 'multiply';          // the lid sits in the shade of the socket, like the skin round it
    const mg = ctx.createLinearGradient(0, e.y - ry * 2.5, 0, e.y + ry * 0.4);       // fading out upward, so the lid has no top edge
    mg.addColorStop(0, 'rgba(158,98,86,0.08)'); mg.addColorStop(0.55, 'rgba(158,98,86,0.3)'); mg.addColorStop(1, 'rgba(158,98,86,0.36)');
    ctx.fillStyle = mg; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (closed > 0.5) {
      const hl = ctx.createRadialGradient(e.x, e.y - ry * 0.1, 0, e.x, e.y - ry * 0.1, rx * 0.6);
      hl.addColorStop(0, 'rgba(255,255,255,0.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hl; ctx.beginPath(); ctx.ellipse(e.x, e.y - ry * 0.1, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = geo.lash; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
    ctx.lineWidth = 0.8;
    for (let i = 1; i < 18; i++) {
      const t = i / 18, u = 1 - t;
      const lx = u * u * ax + 2 * u * t * mx + t * t * bx, ly = u * u * ay + 2 * u * t * my + t * t * by;
      const len = ry * 0.34 * (0.5 + t * 0.6);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + d * len * (0.2 + t * 0.7), ly + len * (2 * closed - 1)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,30,25,0.28)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(e.x - d * rx * 0.86, e.y - ry * 0.6); ctx.bezierCurveTo(e.x - d * rx * 0.45, e.y - ry * 2.0, e.x + d * rx * 0.45, e.y - ry * 2.15, e.x + d * rx * 1.1, e.y - ry * 0.7); ctx.stroke();
    ctx.restore();
  }
}

/** A passing expression drawn live over the painted face: k = 1 pleased .. -1 pained. */
export function drawMood(ctx, geo, k) {
  if (Math.abs(k) < 0.03 || !geo.lipsBox) return;
  if (k > 0 && geo.smile && !geo.noSmile) {
    // a painted smile, eased in
    const a = Math.min(1, k);
    ctx.save(); ctx.globalAlpha = a * a * (3 - 2 * a); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(geo.smile.canvas, geo.smile.x, geo.smile.y, geo.smile.w, geo.smile.h);
    ctx.restore();
    return;
  }
  // on a painted portrait the expression is only hinted at; line weights follow the size she is drawn at
  const [x0, y0, x1, y1] = geo.lipsBox, sy = y0 + (y1 - y0) * 0.36, len = geo.hw * 0.075, a = Math.abs(k) * (geo.photo ? 0.45 : 1), lwK = Math.min(1, geo.hw / 150);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [cxm, d] of [[x0, -1], [x1, 1]]) {
    // the corner of the mouth turns up or down, with the little crease that comes with it
    const ex = cxm + d * len, ey = sy - len * 0.85 * k;
    ctx.strokeStyle = `rgba(70,22,26,${0.6 * a})`; ctx.lineWidth = 1.8 * lwK;
    ctx.beginPath(); ctx.moveTo(cxm - d * 2, sy); ctx.quadraticCurveTo(cxm + d * len * 0.6, sy - len * 0.1 * k, ex, ey); ctx.stroke();
    const g = ctx.createRadialGradient(ex + d * 3, ey, 0, ex + d * 3, ey, len * 1.1);
    g.addColorStop(0, `rgba(70,30,26,${0.22 * a})`); g.addColorStop(1, 'rgba(70,30,26,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex + d * 3, ey, len * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  if (k > 0) {
    // pleased: the cheeks lift and flush a little
    for (const c of geo.cheeks) {
      const g = ctx.createRadialGradient(c.x, c.y - c.ry * 0.3, 0, c.x, c.y - c.ry * 0.3, c.rx * 0.9);
      g.addColorStop(0, `rgba(255,120,120,${0.13 * a})`); g.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y - c.ry * 0.3, c.rx * 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(90,45,40,${0.1 * a})`; ctx.lineWidth = 1.2 * lwK;      // the eyes crinkle from below
      const e = geo.eyes[c.x < geo.cx ? 0 : geo.eyes.length - 1];
      if (e) { ctx.beginPath(); ctx.moveTo(e.x - e.rx * 0.55, e.y + e.ry * 1.05); ctx.quadraticCurveTo(e.x, e.y + e.ry * (1.05 - 0.35 * a), e.x + e.rx * 0.55, e.y + e.ry * 1.05); ctx.stroke(); }
    }
  } else {
    // pained: the brows pinch together
    ctx.strokeStyle = `rgba(80,40,30,${0.5 * a})`; ctx.lineWidth = 1.6 * lwK;
    for (const d of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(geo.cx + d * geo.hw * 0.05, geo.browY - geo.hh * 0.03); ctx.quadraticCurveTo(geo.cx + d * geo.hw * 0.075, geo.browY + geo.hh * 0.01, geo.cx + d * geo.hw * 0.055, geo.browY + geo.hh * 0.05); ctx.stroke();
    }
  }
  ctx.restore();
}

/** Her eyes, repainted live so they can follow your finger: gx, gy = where she is looking, -1..1. */
export function drawEyes(ctx, geo, gx, gy) {
  if (!geo.eyeCol) return;
  for (const e of geo.eyes) paintEye(ctx, e.x, e.y, Math.sign(e.x - geo.cx) || 1, e.rx, e.ry, geo.eyeCol, gx, gy);
}
