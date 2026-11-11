// Procedural close-up skin texture, rendered once per level into an offscreen canvas.

export const SKIN_TONES = [
  { name: 'Porcelain', base: '#f6d7c8', shade: '#e3b5a2', pore: '#b9806c', blush: '#f0a39a', bump: '#f4b8aa' },
  { name: 'Peach',     base: '#eec1a2', shade: '#d69f80', pore: '#a8705a', blush: '#e88e7f', bump: '#eea592' },
  { name: 'Honey',     base: '#d9a37a', shade: '#bb8459', pore: '#8e5b3e', blush: '#cf7a62', bump: '#d98f74' },
  { name: 'Caramel',   base: '#b47b52', shade: '#93603d', pore: '#6a4129', blush: '#b0604a', bump: '#b8735a' },
  { name: 'Cocoa',     base: '#7d5038', shade: '#603b28', pore: '#3f2618', blush: '#8a4636', bump: '#8a5641' },
];

// Small deterministic RNG so a level's skin looks the same after a resize.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

let noiseTile = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

export function renderSkin(w, h, dpr, tone, seed, zone = null, look = null) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const R = rng(seed);

  // Base + soft lighting
  x.fillStyle = tone.base;
  x.fillRect(0, 0, w, h);
  const light = x.createRadialGradient(w * 0.4, h * 0.3, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
  light.addColorStop(0, 'rgba(255,255,255,0.16)');
  light.addColorStop(0.6, 'rgba(255,255,255,0)');
  light.addColorStop(1, rgba(tone.shade, 0.55));
  x.fillStyle = light;
  x.fillRect(0, 0, w, h);

  // Uneven tone blotches
  for (let i = 0; i < 40; i++) {
    const bx = R() * w, by = R() * h, br = 30 + R() * 120;
    const g = x.createRadialGradient(bx, by, 0, bx, by, br);
    const col = R() < 0.5 ? tone.blush : tone.shade;
    g.addColorStop(0, rgba(col, 0.08 + R() * 0.08));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(bx - br, by - br, br * 2, br * 2);
  }

  // Fine grain
  x.save();
  x.globalAlpha = 0.05;
  x.globalCompositeOperation = 'overlay';
  x.fillStyle = x.createPattern(getNoiseTile(), 'repeat');
  x.fillRect(0, 0, w, h);
  x.restore();

  // Skin texture: tiny cross-hatch creases
  x.strokeStyle = rgba(tone.shade, 0.12);
  x.lineWidth = 0.5;
  for (let i = 0; i < (w * h) / 900; i++) {
    const cx = R() * w, cy = R() * h, len = 4 + R() * 8, a = R() * Math.PI;
    x.beginPath();
    x.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
    x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    x.stroke();
  }

  // Pores
  // seen from a whole-face distance pores are a fine even grain, not dots; close-ups keep them big
  const fine = !zone;
  const pores = Math.floor((w * h) / (fine ? 110 : 260));
  for (let i = 0; i < pores; i++) {
    const px = R() * w, py = R() * h, pr = fine ? 0.3 + R() * 0.5 : 0.6 + R() * 1.1;
    x.fillStyle = rgba(tone.pore, fine ? 0.1 + R() * 0.12 : 0.18 + R() * 0.2);
    x.beginPath();
    x.ellipse(px, py, pr, pr * (0.7 + R() * 0.3), R() * 3, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = fine ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.12)';
    x.beginPath();
    x.arc(px - pr * 0.5, py - pr * 0.6, pr * 0.5, 0, Math.PI * 2);
    x.fill();
  }

  // A few freckles / old marks
  for (let i = 0; i < 12; i++) {
    const fx = R() * w, fy = R() * h, fr = fine ? 0.8 + R() * 1.4 : 1.5 + R() * 3;
    x.fillStyle = rgba(tone.pore, fine ? 0.1 + R() * 0.1 : 0.12 + R() * 0.12);
    x.beginPath();
    x.arc(fx, fy, fr, 0, Math.PI * 2);
    x.fill();
  }

  // Fine vellus hairs catching the light
  x.lineWidth = 0.5;
  for (let i = 0; i < (w * h) / 1400; i++) {
    const hx = R() * w, hy = R() * h, a = 1.2 + R() * 0.7, len = 3 + R() * 5;
    x.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,0.10)' : rgba(tone.pore, 0.10);
    x.beginPath();
    x.moveTo(hx, hy);
    x.quadraticCurveTo(hx + Math.cos(a) * len * 0.5 + 1, hy + Math.sin(a) * len * 0.5, hx + Math.cos(a) * len, hy + Math.sin(a) * len);
    x.stroke();
  }
  // Oily sheen band
  const sheen = x.createLinearGradient(0, h * 0.2, w, h * 0.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0.07)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = sheen;
  x.fillRect(0, 0, w, h);

  if (zone) drawZone(x, w, h, zone, tone, look || {}, R);

  // Soft vignette
  const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,10,10,0.28)');
  x.fillStyle = v;
  x.fillRect(0, 0, w, h);

  return c;
}

// ---------------------------------------------------------------- scenarios
// Each level is a close-up of one area. These draw the landmarks of that area
// (hairline, eyebrows, nostrils, lips...) and say where pimples must not go.

export const ZONE_NAMES = { forehead: 'Forehead', nose: 'Nose', cheek: 'Cheek', chin: 'Chin', back: 'Back', shoulder: 'Shoulder' };

/** True where a pimple should not be placed in this scene. */
export function zoneBlocked(zone, px, py, w, h) {
  const u = px / w, v = py / h;
  if (zone === 'forehead') return v < 0.21 || v > 0.72;
  if (zone === 'nose') return v > 0.7 || u < 0.14 || u > 0.86;
  if (zone === 'chin') return v < 0.31;
  if (zone === 'cheek') return v < 0.26 || u > 0.86 || u < 0.1;
  if (zone === 'back') return Math.abs(u - 0.2) < 0.06 || Math.abs(u - 0.8) < 0.06;     // not under the straps
  if (zone === 'shoulder') {
    const strap = u > 0.05 + 0.1 * v && u < 0.26 + 0.1 * v;
    return strap || Math.hypot(px - w * 0.25, py - h * 1.05) > h * 0.95 - 46;
  }
  return false;
}

function hairs(x, R, n, color, alpha, lw, gen) {
  x.lineWidth = lw;
  for (let i = 0; i < n; i++) {
    const [hx, hy, a, len, bend] = gen(i / n);
    x.strokeStyle = rgba(color, alpha * (0.6 + R() * 0.4));
    x.beginPath();
    x.moveTo(hx, hy);
    x.quadraticCurveTo(hx + Math.cos(a) * len * 0.5 + bend, hy + Math.sin(a) * len * 0.5, hx + Math.cos(a) * len, hy + Math.sin(a) * len);
    x.stroke();
  }
}

function soft(x, cx, cy, rx, ry, color) {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color);
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g;
  x.beginPath(); x.arc(0, 0, rx, 0, Math.PI * 2); x.fill();
  x.restore();
}

function drawZone(x, w, h, zone, tone, look, R) {
  const hair = /^#[0-9a-f]{6}$/i.test(look.hair || '') ? look.hair : '#3a2618';
  const dark = (a) => rgba(tone.pore, a), shade = (a) => rgba(tone.shade, a);
  x.lineCap = 'round';

  if (zone === 'forehead') {
    // hairline across the top
    const edge = (u) => h * (0.115 + 0.022 * Math.sin(u * 7 + 1) + 0.03 * Math.abs(u - 0.5));
    if (look.style !== 'bald') {
      x.fillStyle = hair;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0);
      for (let i = 20; i >= 0; i--) x.lineTo(w * i / 20, edge(i / 20));
      x.closePath(); x.fill();
      hairs(x, R, 260, hair, 0.9, 1.3, (t) => [R() * w, edge(R()) + 10 - R() * 26, -1.4 + R() * 0.5, 14 + R() * 20, 4]);
      hairs(x, R, 90, '#ffffff', 0.12, 1, () => [R() * w, R() * h * 0.11, 1.2 + R() * 0.4, 20 + R() * 20, 5]);
      hairs(x, R, 120, hair, 0.3, 0.7, () => { const u = R(); return [u * w, edge(u) + R() * 16, 1.3 + R() * 0.6, 5 + R() * 9, 2]; });
    }
    // faint forehead lines
    x.strokeStyle = dark(0.07); x.lineWidth = 2;
    for (const v of [0.36, 0.5]) { x.beginPath(); x.moveTo(w * 0.1, h * v); x.quadraticCurveTo(w * 0.5, h * (v - 0.02), w * 0.9, h * v); x.stroke(); }
    // eyebrows and the top of the nose between them
    soft(x, w * 0.5, h * 0.9, w * 0.2, h * 0.12, shade(0.4));
    for (const d of [-1, 1]) {
      const cx = w * (0.5 + d * 0.25);
      soft(x, cx, h * 0.83, w * 0.2, h * 0.03, dark(0.2));
      hairs(x, R, 220, hair, 0.85, 1.4, (t) => {
        const k = R();
        return [cx + (k - 0.5) * w * 0.36, h * 0.815 - Math.sin(k * Math.PI) * h * 0.016 + (R() - 0.5) * h * 0.022,
          (d > 0 ? -0.35 : Math.PI + 0.35) + (R() - 0.5) * 0.5, 8 + R() * 8, 0];
      });
    }
  } else if (zone === 'nose') {
    // the sides fall away into shadow, the ridge catches light
    const lg = x.createLinearGradient(0, 0, w, 0);
    lg.addColorStop(0, shade(0.75)); lg.addColorStop(0.24, shade(0)); lg.addColorStop(0.76, shade(0)); lg.addColorStop(1, shade(0.75));
    x.fillStyle = lg; x.fillRect(0, 0, w, h);
    const ridge = x.createLinearGradient(w * 0.38, 0, w * 0.62, 0);
    ridge.addColorStop(0, 'rgba(255,255,255,0)'); ridge.addColorStop(0.5, 'rgba(255,255,255,0.16)'); ridge.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = ridge; x.fillRect(w * 0.38, 0, w * 0.24, h * 0.62);
    soft(x, w * 0.5, h * 0.6, w * 0.24, w * 0.2, 'rgba(255,255,255,0.2)');
    soft(x, w * 0.5, h * 0.8, w * 0.42, h * 0.07, 'rgba(40,12,10,0.45)');
    // wings of the nose
    for (const d of [-1, 1]) {
      x.strokeStyle = dark(0.35); x.lineWidth = 5;
      x.beginPath(); x.arc(w * (0.5 + d * 0.27), h * 0.69, w * 0.15, d > 0 ? -1.9 : Math.PI - 1.0, d > 0 ? 1.0 : Math.PI + 1.9); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.10)'; x.lineWidth = 3;
      x.beginPath(); x.arc(w * (0.5 + d * 0.25), h * 0.685, w * 0.13, d > 0 ? -1.6 : Math.PI + 0.2, d > 0 ? -0.2 : Math.PI + 1.6); x.stroke();
      // nostril
      x.save();
      x.translate(w * (0.5 + d * 0.135), h * 0.775); x.rotate(d * -0.3);
      const ng = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.085);
      ng.addColorStop(0, 'rgba(20,6,6,0.95)'); ng.addColorStop(0.7, 'rgba(45,14,12,0.9)'); ng.addColorStop(1, 'rgba(45,14,12,0)');
      x.fillStyle = ng; x.scale(1, 0.42);
      x.beginPath(); x.arc(0, 0, w * 0.085, 0, Math.PI * 2); x.fill();
      x.restore();
    }
    // noses have big, obvious pores
    for (let i = 0; i < 700; i++) {
      const px = w * (0.2 + R() * 0.6), py = h * (0.12 + R() * 0.62), pr = 0.8 + R() * 1.7;
      x.fillStyle = dark(0.16 + R() * 0.2);
      x.beginPath(); x.ellipse(px, py, pr, pr * 0.75, R() * 3, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.10)';
      x.beginPath(); x.arc(px - pr * 0.6, py - pr * 0.7, pr * 0.5, 0, Math.PI * 2); x.fill();
    }
  } else if (zone === 'chin') {
    // lower lip along the top
    const lipCol = look.fem ? '#c25a70' : tone.blush;
    soft(x, w * 0.5, h * 0.27, w * 0.36, h * 0.05, 'rgba(60,20,15,0.35)');
    const lg = x.createLinearGradient(0, h * 0.12, 0, h * 0.225);
    lg.addColorStop(0, rgba('#7a2a33', 0.95)); lg.addColorStop(0.35, lipCol); lg.addColorStop(1, rgba(tone.blush, 0.9));
    x.fillStyle = lg;
    x.beginPath();
    x.moveTo(w * 0.14, h * 0.125);
    x.quadraticCurveTo(w * 0.5, h * 0.105, w * 0.86, h * 0.125);
    x.quadraticCurveTo(w * 0.72, h * 0.225, w * 0.5, h * 0.228);
    x.quadraticCurveTo(w * 0.28, h * 0.225, w * 0.14, h * 0.125);
    x.fill();
    x.strokeStyle = 'rgba(70,20,25,0.85)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(w * 0.12, h * 0.123); x.quadraticCurveTo(w * 0.5, h * 0.1, w * 0.88, h * 0.123); x.stroke();
    soft(x, w * 0.5, h * 0.165, w * 0.2, h * 0.025, 'rgba(255,255,255,0.3)');
    x.strokeStyle = 'rgba(90,30,35,0.25)'; x.lineWidth = 1;
    for (let i = 0; i < 16; i++) { const u = 0.26 + R() * 0.48; x.beginPath(); x.moveTo(w * u, h * 0.13); x.lineTo(w * (u + (R() - 0.5) * 0.02), h * 0.21); x.stroke(); }
    // crease under the lip, the ball of the chin, the jaw falling away
    x.strokeStyle = dark(0.16); x.lineWidth = 6;
    x.beginPath(); x.moveTo(w * 0.24, h * 0.34); x.quadraticCurveTo(w * 0.5, h * 0.31, w * 0.76, h * 0.34); x.stroke();
    soft(x, w * 0.46, h * 0.55, w * 0.3, w * 0.26, 'rgba(255,255,255,0.14)');
    soft(x, 0, h, w * 0.6, h * 0.42, shade(0.8));
    soft(x, w, h, w * 0.6, h * 0.42, shade(0.8));
    if (look.beard || look.stubble) {
      const n = look.beard ? 2600 : 1500;
      hairs(x, R, n, hair, look.beard ? 0.85 : 0.5, look.beard ? 1.5 : 1, () => {
        const hx = R() * w, hy = h * (0.26 + R() * 0.74);
        if (hy < h * 0.3 && hx > w * 0.2 && hx < w * 0.8) return [hx, h * 0.3, 1.5, 2, 0];
        return [hx, hy, 1.3 + R() * 0.5, look.beard ? 6 + R() * 9 : 2 + R() * 3, look.beard ? 2 : 0];
      });
    }
  } else if (zone === 'cheek') {
    // lower eyelid and lashes along the top
    soft(x, w * 0.3, h * 0.2, w * 0.34, h * 0.05, 'rgba(90,50,70,0.2)');
    x.strokeStyle = 'rgba(50,25,20,0.8)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(-10, h * 0.135); x.quadraticCurveTo(w * 0.28, h * 0.175, w * 0.6, h * 0.125); x.stroke();
    hairs(x, R, 34, '#20120e', 0.85, 1.3, () => { const u = R() * 0.58; return [u * w, h * (0.137 + 0.03 * Math.sin(u / 0.6 * Math.PI)), 1.2 + u, 7 + R() * 6, 2]; });
    x.strokeStyle = dark(0.14); x.lineWidth = 4;
    x.beginPath(); x.moveTo(0, h * 0.22); x.quadraticCurveTo(w * 0.3, h * 0.255, w * 0.62, h * 0.2); x.stroke();
    // side of the nose, smile line
    const lg = x.createLinearGradient(0, 0, w * 0.22, 0);
    lg.addColorStop(0, shade(0.7)); lg.addColorStop(1, shade(0));
    x.fillStyle = lg; x.fillRect(0, h * 0.2, w * 0.22, h * 0.6);
    x.strokeStyle = dark(0.2); x.lineWidth = 6;
    x.beginPath(); x.moveTo(w * 0.1, h * 0.4); x.quadraticCurveTo(w * 0.2, h * 0.6, w * 0.14, h * 0.82); x.stroke();
    soft(x, w * 0.56, h * 0.48, w * 0.46, w * 0.42, rgba(tone.blush, 0.28));
    soft(x, w * 0.5, h * 0.4, w * 0.2, w * 0.14, 'rgba(255,255,255,0.12)');
    // sideburn / hair at the edge
    if (look.style !== 'bald') hairs(x, R, 320, hair, 0.9, 1.5, () => [w * (0.9 + R() * 0.12), h * (0.05 + R() * 0.75), 1.75 + R() * 0.4, 24 + R() * 40, -6]);
  } else if (zone === 'back') {
    // a back seen from behind: it turns away at both sides, the spine runs down a soft groove
    // with its row of bumps, the shoulder blades catch the light, and two thin straps cross it
    const edge = x.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, shade(0.6)); edge.addColorStop(0.17, shade(0)); edge.addColorStop(0.83, shade(0)); edge.addColorStop(1, shade(0.65));
    x.fillStyle = edge; x.fillRect(0, 0, w, h);
    soft(x, w * 0.5, h * 0.03, w * 0.55, h * 0.07, shade(0.35));                         // under the hairline at the base of the neck
    soft(x, w * 0.5, h * 0.5, w * 0.07, h * 0.62, shade(0.42));                          // the groove of the spine
    soft(x, w * 0.41, h * 0.55, w * 0.06, h * 0.5, 'rgba(255,255,255,0.09)');            // the long muscles either side of it
    soft(x, w * 0.59, h * 0.55, w * 0.06, h * 0.5, 'rgba(255,255,255,0.06)');
    for (let i = 0; i < 9; i++) soft(x, w * 0.5, h * (0.09 + i * 0.1), w * 0.024, h * 0.02, 'rgba(255,255,255,0.11)');   // vertebrae
    x.lineCap = 'round';
    for (const d of [-1, 1]) {
      soft(x, w * (0.5 + d * 0.27), h * 0.27, w * 0.18, h * 0.12, 'rgba(255,255,255,0.12)');     // the blade itself
      x.beginPath(); x.moveTo(w * (0.5 + d * 0.13), h * 0.17); x.quadraticCurveTo(w * (0.5 + d * 0.09), h * 0.31, w * (0.5 + d * 0.25), h * 0.41);
      x.strokeStyle = shade(0.1); x.lineWidth = 22; x.stroke();                                   // its inner edge, soft then sharper
      x.strokeStyle = shade(0.16); x.lineWidth = 8; x.stroke();
      soft(x, w * (0.5 + d * 0.3), h * 0.45, w * 0.2, h * 0.05, shade(0.2));                      // shadow beneath it
      soft(x, w * (0.5 + d * 0.33), h * 0.7, w * 0.12, h * 0.2, shade(0.12));                     // the waist curving in
      soft(x, w * (0.5 + d * 0.11), h * 0.88, w * 0.036, h * 0.018, shade(0.34));                 // dimples of the lower back
    }
    for (let i = 0; i < 4; i++) {
      const mx = w * (0.26 + R() * 0.48), my = h * (0.12 + R() * 0.7), mr = 1 + R() * 1.4;
      soft(x, mx, my, mr * 2.2, mr * 2.2, 'rgba(80,45,30,0.3)');
      x.fillStyle = 'rgba(80,45,30,0.6)';
      x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2); x.fill();
    }
    // thin straps of her top, with a little shadow on the skin beside each
    for (const u of [0.2, 0.8]) {
      soft(x, w * (u + 0.035), h * 0.5, w * 0.05, h * 0.6, 'rgba(60,20,15,0.12)');
      const sg = x.createLinearGradient(w * (u - 0.04), 0, w * (u + 0.04), 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.16)'); sg.addColorStop(0.3, 'rgba(255,255,255,0.18)'); sg.addColorStop(1, 'rgba(0,0,0,0.2)');
      x.fillStyle = look.shirt || '#f2a7c3'; x.fillRect(w * (u - 0.04), 0, w * 0.08, h);
      x.fillStyle = sg; x.fillRect(w * (u - 0.04), 0, w * 0.08, h);
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1.2; x.setLineDash([5, 5]);
      x.beginPath(); x.moveTo(w * (u - 0.028), 0); x.lineTo(w * (u - 0.028), h); x.moveTo(w * (u + 0.028), 0); x.lineTo(w * (u + 0.028), h); x.stroke();
      x.setLineDash([]);
    }
    if (look.beard || look.stubble || look.stache) hairs(x, R, 700, hair, 0.35, 0.8, () => [R() * w, R() * h, 1.2 + R() * 0.8, 6 + R() * 10, 3]);
  } else if (zone === 'shoulder') {
    // the room behind, the curve of the shoulder, a top strap
    const cx = w * 0.25, cy = h * 1.05, rad = h * 0.95;
    const wall = x.createLinearGradient(0, 0, w, h * 0.6);
    wall.addColorStop(0, '#e6ecf5'); wall.addColorStop(1, '#c9d3e6');
    x.fillStyle = wall;
    x.beginPath(); x.rect(0, 0, w, h); x.arc(cx, cy, rad, 0, Math.PI * 2, true); x.fill('evenodd');
    x.save();
    x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.clip();
    x.strokeStyle = shade(0.5); x.lineWidth = 70;
    x.beginPath(); x.arc(cx, cy, rad + 10, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 26;
    x.beginPath(); x.arc(cx, cy, rad - 70, -1.5, -0.4); x.stroke();
    x.restore();
    // strap
    x.fillStyle = look.shirt || '#f2a7c3';
    x.beginPath();
    x.moveTo(w * 0.07, 0); x.lineTo(w * 0.24, 0); x.lineTo(w * 0.34, h); x.lineTo(w * 0.17, h);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(w * 0.24, 0); x.lineTo(w * 0.34, h); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.5; x.setLineDash([6, 6]);
    x.beginPath(); x.moveTo(w * 0.09, 0); x.lineTo(w * 0.19, h); x.moveTo(w * 0.22, 0); x.lineTo(w * 0.32, h); x.stroke();
    x.setLineDash([]);
    soft(x, w * 0.4, h * 0.5, w * 0.1, h * 0.5, 'rgba(60,20,15,0.12)');
  }
}
