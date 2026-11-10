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

export function renderSkin(w, h, dpr, tone, seed) {
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
  x.strokeStyle = rgba(tone.shade, 0.18);
  x.lineWidth = 0.6;
  for (let i = 0; i < (w * h) / 900; i++) {
    const cx = R() * w, cy = R() * h, len = 4 + R() * 8, a = R() * Math.PI;
    x.beginPath();
    x.moveTo(cx - Math.cos(a) * len, cy - Math.sin(a) * len);
    x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    x.stroke();
  }

  // Pores
  const pores = Math.floor((w * h) / 260);
  for (let i = 0; i < pores; i++) {
    const px = R() * w, py = R() * h, pr = 0.6 + R() * 1.1;
    x.fillStyle = rgba(tone.pore, 0.18 + R() * 0.2);
    x.beginPath();
    x.ellipse(px, py, pr, pr * (0.7 + R() * 0.3), R() * 3, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.beginPath();
    x.arc(px - pr * 0.5, py - pr * 0.6, pr * 0.5, 0, Math.PI * 2);
    x.fill();
  }

  // A few freckles / old marks
  for (let i = 0; i < 12; i++) {
    const fx = R() * w, fy = R() * h, fr = 1.5 + R() * 3;
    x.fillStyle = rgba(tone.pore, 0.12 + R() * 0.12);
    x.beginPath();
    x.arc(fx, fy, fr, 0, Math.PI * 2);
    x.fill();
  }

  // Soft vignette
  const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(40,10,10,0.28)');
  x.fillStyle = v;
  x.fillRect(0, 0, w, h);

  return c;
}
