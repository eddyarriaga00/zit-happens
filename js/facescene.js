// The play scene for face levels: the patient's whole face, painted once per level
// with real skin texture, shading, eyes, nose, lips and hair. Returns the canvas plus
// "geo": where the features are, so pimples land on skin and the eyes can blink.

import { renderSkin, rgba } from './skin.js';

function tint(col, k) {   // k < 1 darker, k > 1 lighter. Takes #rrggbb or rgb(r,g,b).
  let r, g, b;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
  else [r, g, b] = col.match(/\d+/g).map(Number);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function renderFaceScene(w, h, dpr, tone, seed, look, top, bottom) {
  const c = document.createElement('canvas');
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  let sd = (seed >>> 0) || 1;
  const R = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };

  const s = Math.min(w * 0.98, (bottom - top) / 1.36);    // head width
  const hw = s / 2, hh = s * 0.66;
  const cx = w / 2, cy = top + (bottom - top) * 0.47;
  const X = (u) => cx + u * hw, Y = (v) => cy + v * hh;
  const hair = /^#[0-9a-f]{6}$/i.test(look.hair || '') ? look.hair : '#3a2618';
  const grey = ['#cfcfcf', '#b9b9b9', '#8f8f8f'].includes(hair);
  const hairLo = tint(hair, 0.72), hairHi = tint(hair, 1.16);
  // shine takes the hair's own colour, and dark hair shows far less of it than fair hair
  const hch = [0, 1, 2].map((i) => parseInt(hair.slice(1 + 2 * i, 3 + 2 * i), 16));
  const hlum = (hch[0] + hch[1] + hch[2]) / 765;
  const shine = (a) => `rgba(${hch.map((v) => Math.round(v + (255 - v) * 0.55)).join(',')},${(a * Math.min(1, 0.25 + hlum * 1.6)).toFixed(3)})`;
  const style = look.style || 'short';
  const hasHair = style !== 'bald';
  const hairline = style === 'bald' ? -2 : style === 'balding' ? -2 : style === 'buzz' ? -0.7 : -0.68;      // a proper forehead
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
  else {
  // an out-of-focus room: window light, a shelf, a few soft glints
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.roundRect(w * 0.02, h * 0.1, w * 0.2, h * 0.34, 14); x.fill();
  x.fillStyle = 'rgba(150,110,130,0.18)';
  x.fillRect(w * 0.7, h * 0.3, w * 0.32, h * 0.012);
  for (let i = 0; i < 9; i++) soft(R() * w, R() * h * 0.6, 10 + R() * 26, 10 + R() * 26, `rgba(255,${235 + Math.floor(R() * 20)},${225 + Math.floor(R() * 30)},0.22)`);
  }

  // ---- hair behind the head
  if (style === 'long' || style === 'curly') {
    const wide = style === 'curly' ? 1.5 : 1.22;
    x.fillStyle = hairFill;
    x.beginPath(); x.ellipse(cx, Y(0.35), hw * wide, hh * (style === 'curly' ? 1.25 : 1.75), 0, 0, Math.PI * 2); x.fill();
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
  if (style === 'pony') {
    x.fillStyle = hairFill; x.beginPath(); x.ellipse(X(1.02), Y(0.1), hw * 0.26, hh * 0.9, -0.2, 0, Math.PI * 2); x.fill();
    strands(420, () => { const k = R() * 2 - 1; return [X(0.9 + k * 0.1), Y(-0.7), X(1.08 + k * 0.2), Y(0.3 + R() * 0.65), k * 14 + 10, hairCol()]; }, 0.8);
  }
  if (style === 'bun') {
    x.fillStyle = hairFill; x.beginPath(); x.arc(cx, Y(-1.22), hw * 0.42, 0, Math.PI * 2); x.fill();
    x.lineWidth = 0.8;
    for (let i = 0; i < 260; i++) {      // strands wound round the bun
      const r = hw * 0.42 * (0.15 + R() * 0.83), a0 = R() * Math.PI * 2;
      x.strokeStyle = hairCol(); x.beginPath(); x.arc(cx + (R() - 0.5) * 4, Y(-1.22) + (R() - 0.5) * 4, r, a0, a0 + 0.8 + R() * 1.6); x.stroke();
    }
    soft(X(-0.12), Y(-1.36), hw * 0.2, hh * 0.07, 'rgba(255,255,255,0.14)');
  }
  if (hasHair && style !== 'balding') {     // volume around the skull
    const k = style === 'buzz' ? 1.02 : 1.09;
    x.fillStyle = hairFill;
    x.beginPath(); x.ellipse(cx, Y(-0.3), hw * k, hh * (style === 'buzz' ? 0.76 : 0.8), 0, Math.PI, Math.PI * 2); x.fill();
    soft(X(-0.15), Y(-0.98), hw * 0.8, hh * 0.09, shine(0.26));     // light on the crown
    x.fillRect(cx - hw * k, Y(-0.31), hw * 2 * k, hh * (style === 'long' || style === 'curly' ? 0.9 : 0.32));
    if (style !== 'buzz') {
      // strands combed over the crown from the parting, so the top isn't a flat helmet
      strands(1100, () => {
        const u = R() * 2 - 1, part = -0.3;
        const x1 = X(u * k * 1.02), y1 = Y(-0.3 - Math.sqrt(Math.max(0, 1 - u * u)) * 0.76 + 0.1 + R() * 0.5);
        return [X(part + (u - part) * 0.3), Y(-1.06 - R() * 0.03), x1, y1, (u - part) * hw * 0.3, hairCol()];
      }, 0.8);
      // flyaways breaking the outline
      strands(46, () => {
        const a = Math.PI + R() * Math.PI, px = cx + Math.cos(a) * hw * k, py = Y(-0.3) + Math.sin(a) * hh * 0.8;
        return [px, py, px + Math.cos(a) * (6 + R() * 16) + (R() - 0.5) * 12, py + Math.sin(a) * (6 + R() * 14), (R() - 0.5) * 12, rgba(hair, 0.55)];
      }, 0.7);
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
  x.quadraticCurveTo(X(-1.7), Y(1.28), X(-0.55), Y(1.2));
  x.lineTo(X(0.55), Y(1.2));
  x.quadraticCurveTo(X(1.7), Y(1.28), X(2.2), h + 10);
  x.closePath(); x.fill();
  x.fillStyle = tone.shade;
  x.beginPath();
  x.moveTo(X(-0.5), Y(0.55)); x.lineTo(X(-0.56), Y(1.24));
  x.quadraticCurveTo(cx, Y(1.5), X(0.56), Y(1.24));
  x.lineTo(X(0.5), Y(0.55));
  x.closePath(); x.fill();
  // open neckline: skin down to a soft V, with the hollow of the throat
  x.fillStyle = tone.shade;
  x.beginPath(); x.moveTo(X(-0.58), Y(1.2)); x.quadraticCurveTo(cx, Y(1.78), X(0.58), Y(1.2)); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.14)'; x.lineWidth = 5;
  x.beginPath(); x.moveTo(X(-0.6), Y(1.2)); x.quadraticCurveTo(cx, Y(1.8), X(0.6), Y(1.2)); x.stroke();
  for (const d of [-1, 1]) {
    soft(X(d * 0.3), Y(1.18), hw * 0.07, hh * 0.3, rgba(tone.pore, 0.2));              // neck tendons
    soft(X(d * 1.1), Y(1.55), hw * 0.5, hh * 0.12, 'rgba(255,255,255,0.14)');           // light on the shoulders
    x.strokeStyle = rgba(tone.pore, 0.25); x.lineWidth = 3;                             // collarbones
    x.beginPath(); x.moveTo(X(d * 0.08), Y(1.5)); x.quadraticCurveTo(X(d * 0.3), Y(1.42), X(d * 0.52), Y(1.36)); x.stroke();
  }
  soft(cx, Y(1.5), hw * 0.07, hh * 0.05, rgba(tone.pore, 0.35));
  soft(cx, Y(1.02), hw * 0.75, hh * 0.2, 'rgba(50,18,12,0.5)');   // shadow under the chin

  // ---- ears: rim, inner fold, the dark bowl, a soft lobe
  for (const d of [-1, 1]) {
    const ew = hw * 0.17, eh = hh * 0.215;
    x.save();
    x.translate(X(d * 0.99), Y(0.03)); x.scale(d, 1); x.rotate(0.08);
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

  // ---- the head
  const jaw = look.fem ? 0.6 : 0.7;
  const head = new Path2D();
  head.moveTo(cx, Y(-1));
  head.bezierCurveTo(X(0.8), Y(-1.02), X(1.03), Y(-0.55), X(0.975), Y(-0.02));        // skull down to the cheekbone
  head.bezierCurveTo(X(0.95), Y(0.34), X(0.86), Y(0.6), X(jaw), Y(0.8));              // cheek to the angle of the jaw
  head.bezierCurveTo(X(jaw - 0.2), Y(0.97), X(0.22), Y(1.02), cx, Y(1.02));           // along the jaw to the chin
  head.bezierCurveTo(X(-0.22), Y(1.02), X(-(jaw - 0.2)), Y(0.97), X(-jaw), Y(0.8));
  head.bezierCurveTo(X(-0.86), Y(0.6), X(-0.95), Y(0.34), X(-0.975), Y(-0.02));
  head.bezierCurveTo(X(-1.03), Y(-0.55), X(-0.8), Y(-1.02), cx, Y(-1));
  head.closePath();

  // highlights on dark skin are warm and subtle; white patches there read as chalk
  const skinLum = /^#[0-9a-f]{6}$/i.test(tone.base) ? [1, 3, 5].reduce((a, i) => a + parseInt(tone.base.slice(i, i + 2), 16), 0) / 765 : 0.7;
  const hiK = Math.max(0.22, Math.min(1, (skinLum - 0.25) / 0.5));
  const hi = (a) => `rgba(255,${Math.round(225 + 30 * hiK)},${Math.round(200 + 55 * hiK)},${(a * hiK).toFixed(3)})`;
  const ey = -0.06, ex = 0.42;                      // eye line / spacing (head units)
  const erx = hw * 0.215, ery = hh * 0.084;
  const mouthY = 0.6, noseY = 0.36;

  x.save();
  x.clip(head);
  x.drawImage(renderSkin(w, h, dpr, tone, seed), 0, 0, w, h);    // real pores and texture
  // form: light from the upper left, the face turning away at the sides
  const side = x.createLinearGradient(X(-1), 0, X(1), 0);
  side.addColorStop(0, rgba(tone.shade, 0.75)); side.addColorStop(0.2, rgba(tone.shade, 0.08));
  side.addColorStop(0.72, rgba(tone.shade, 0.12)); side.addColorStop(1, rgba(tone.shade, 0.9));
  x.fillStyle = side; x.fillRect(X(-1.1), Y(-1.1), s * 1.1, hh * 2.2);
  soft(X(-0.12), Y(-0.5), hw * 0.55, hh * 0.22, hi(0.16));          // forehead
  soft(cx, Y(1.14), hw * 1.0, hh * 0.3, rgba(tone.shade, 0.75));                    // under the jaw
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey - 0.02), hw * 0.32, hh * 0.16, rgba(tone.pore, 0.3));      // eye sockets
    soft(X(d * 0.55), Y(0.3), hw * 0.34, hh * 0.24, rgba(tone.blush, 0.36));        // cheeks
    soft(X(d * 0.5 - 0.06), Y(0.14), hw * 0.2, hh * 0.1, hi(0.13)); // cheekbones
    soft(X(d * 0.17), Y(0.2), hw * 0.08, hh * 0.22, rgba(tone.pore, 0.22));         // sides of the nose
    if (look.age >= 35) {                                                           // smile lines
      x.strokeStyle = rgba(tone.pore, look.age >= 55 ? 0.09 : 0.04); x.lineWidth = s * 0.014;      // a soft fold, not a drawn line
      x.beginPath(); x.moveTo(X(d * 0.23), Y(0.35)); x.quadraticCurveTo(X(d * 0.37), Y(0.44), X(d * 0.39), Y(0.56)); x.stroke();
    }
  }
  for (const d of [-1, 1]) {
    soft(X(d * 0.86), Y(-0.3), hw * 0.22, hh * 0.32, rgba(tone.shade, 0.4));           // temples
    soft(X(d * 0.64), Y(0.48), hw * 0.2, hh * 0.17, rgba(tone.shade, 0.34));           // hollow under the cheekbone
    soft(X(d * 0.5 - 0.05), Y(0.1), hw * 0.13, hh * 0.045, hi(0.2));   // sheen on the cheekbone
    soft(X(d * ex), Y(ey - 0.13), hw * 0.26, hh * 0.05, rgba(tone.pore, 0.2));         // shadow under the brow
  }
  soft(X(-0.05), Y(-0.36), hw * 0.2, hh * 0.08, hi(0.14));             // oily centre of the forehead
  const ridge = x.createLinearGradient(X(-0.09), 0, X(0.09), 0);
  ridge.addColorStop(0, 'rgba(255,255,255,0)'); ridge.addColorStop(0.45, 'rgba(255,255,255,0.2)'); ridge.addColorStop(1, 'rgba(255,255,255,0)');
  soft(cx, Y(0.31), hw * 0.15, hh * 0.09, rgba(tone.blush, 0.3));                    // warmth in the nose
  soft(X(-0.02), Y(0.3), hw * 0.1, hh * 0.07, hi(0.3));             // tip of the nose
  soft(cx, Y(noseY + 0.07), hw * 0.2, hh * 0.04, 'rgba(50,16,12,0.4)');             // under the nose
  soft(cx, Y(mouthY + 0.14), hw * 0.26, hh * 0.05, 'rgba(60,20,15,0.3)');           // under the lip
  soft(X(-0.03), Y(0.84), hw * 0.26, hh * 0.1, hi(0.14));           // chin

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

  // hair growing from the hairline
  if (hasHair && style !== 'balding') {
    const edge = (u) => hairline + 0.05 * Math.abs(u) + 0.02 * Math.sin(u * 9 + seed % 7) + (style === 'buzz' ? 0 : 0.1 * Math.max(0, u * 0.9));
    for (let u = -0.9; u <= 0.9; u += 0.15) soft(X(u), Y(edge(u) + 0.035), hw * 0.16, hh * 0.05, 'rgba(40,15,10,0.2)');   // shadow the fringe casts
    x.fillStyle = style === 'buzz' ? rgba(hair, 0.82) : hairFill;
    x.beginPath(); x.moveTo(X(-1.2), Y(-1.2)); x.lineTo(X(1.2), Y(-1.2));
    x.lineTo(X(1.2), Y(-0.12));
    x.quadraticCurveTo(X(0.9), Y(edge(0.9) + 0.12), X(0.8), Y(edge(0.8)));
    for (let i = 16; i >= -16; i--) x.lineTo(X(i / 20), Y(edge(i / 20)));
    x.quadraticCurveTo(X(-0.9), Y(edge(-0.9) + 0.12), X(-1.2), Y(-0.12));
    x.closePath(); x.fill();
    if (style === 'buzz') {
      strands(1500, () => { const u = R() * 2 - 1, v = -1 + R() * (edge(u) + 1.02); return [X(u), Y(v), X(u) + 1, Y(v) + 3, 0, rgba(hairLo.startsWith('rgb') ? hair : hair, 0.5)]; }, 1);
    } else {
      // hair is thousands of strands in several tones, clumped into locks, with shine that follows them
      const part = -0.3;
      const eC = (u) => edge(Math.max(-1, Math.min(1, u)));
      const fringe = (u, v0, v1, bendK, col) => [X(part + (u - part) * (0.35 + 0.65 * v0)), Y(-1.04 + (eC(u) + 1.04) * v0), X(part + (u - part) * (0.35 + 0.65 * v1)), Y(-1.04 + (eC(u) + 1.04) * v1), (u - part) * hw * 0.22 * bendK, col];
      for (let i = 0; i < 56; i++) {       // the fringe is built from overlapping locks, then strands on top
        const j = (i * 17) % 56, u = -1.05 + 2.1 * (j + R()) / 56;
        const q = fringe(u, 0, 1 + R() * 0.05, 1, '');
        lock(q[0], q[1], q[2], q[3], q[4], hw * (0.05 + R() * 0.04));
      }
      strands(260, () => fringe(R() * 2.1 - 1.05, 0, 1 - R() * 0.1, 1, 'rgba(0,0,0,0.16)'), 2.6);          // depth between locks
      strands(1500, () => fringe(R() * 2.1 - 1.05, 0, 1 - R() * 0.12, 1, rgba(hair, 0.55)), 0.6);
      strands(900, () => { const v = 0.22 + R() * 0.14; return fringe(R() * 2.1 - 1.05, v, v + 0.1 + R() * 0.08, 0.25, shine(0.2)); }, 0.9);   // shine band
      strands(500, () => { const v = 0.6 + R() * 0.1; return fringe(R() * 2.1 - 1.05, v, v + 0.07, 0.15, shine(0.13)); }, 0.8);
      // the ends: uneven, wispy, a few falling past the line
      strands(420, () => { const u = R() * 1.8 - 0.9; return [X(u) - (u - part) * 3, Y(edge(u) - 0.05), X(u) + (R() - 0.5) * 4, Y(edge(u) + R() * 0.045), 1.5, R() < 0.5 ? hair : hairLo]; }, 0.75);
      strands(90, () => { const u = R() * 1.6 - 0.8; return [X(u), Y(edge(u) - 0.01), X(u) + (R() - 0.3) * 8, Y(edge(u) + 0.03 + R() * 0.05), 2, rgba(hair, 0.4)]; }, 0.6);
    }
  }
  x.restore();

  // head outline: only a soft edge, like a real face against a wall
  x.strokeStyle = rgba(tone.pore, 0.35); x.lineWidth = 1.5; x.stroke(head);

  // curls piled on top
  if (style === 'curly') {
    for (let i = 0; i < 46; i++) {
      const a = Math.PI + R() * Math.PI, d = 0.86 + R() * 0.32;
      const px = cx + Math.cos(a) * hw * 1.05 * d, py = Y(-0.3) + Math.sin(a) * hh * 0.84 * d, r = hw * (0.1 + R() * 0.07);
      x.fillStyle = hairLo;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      soft(px + r * 0.2, py + r * 0.25, r * 0.9, r * 0.9, 'rgba(0,0,0,0.25)');
      for (let j = 0; j < 9; j++) {
        const rr = r * (0.25 + R() * 0.75), a0 = R() * 6.3;
        x.strokeStyle = j % 3 === 0 ? hairHi : hair; x.lineWidth = 0.9 + R() * 0.8;
        x.beginPath(); x.arc(px + (R() - 0.5) * r * 0.2, py + (R() - 0.5) * r * 0.2, rr, a0, a0 + 1.6 + R() * 2.4); x.stroke();
      }
    }
  }

  // ---- eyebrows: individual hairs following the arch
  const browCol = grey ? '#8a8a8a' : tint(hair, 0.8);
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey - 0.21), hw * 0.26, hh * 0.035, rgba(browCol.startsWith('#') ? browCol : hair, 0.42));
    strands(look.fem ? 320 : 400, () => {
      const k = R();                         // 0 = inner end, 1 = tail
      const bx = X(d * (ex - 0.24 + k * 0.5)), by = Y(ey - 0.19 - Math.sin(k * Math.PI * 0.8) * 0.05 + k * 0.03) + (R() - 0.5) * hh * (look.fem ? 0.034 : 0.046) * (1 - k * 0.65);
      const a = (d > 0 ? -0.25 : Math.PI + 0.25) + (0.6 - k) * (d > 0 ? -0.9 : 0.9);
      const len = hw * (0.04 + R() * 0.035);
      return [bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 0, rgba(grey ? '#8a8a8a' : hair, 0.5 + R() * 0.35)];
    }, look.fem ? 0.75 : 0.95);
  }

  // ---- eyes
  const eyes = [];
  for (const d of [-1, 1]) {
    const px = X(d * ex), py = Y(ey);
    eyes.push({ x: px, y: py, rx: erx, ry: ery });
    const almond = new Path2D();
    almond.moveTo(px - d * erx, py + ery * 0.25);
    almond.quadraticCurveTo(px - d * erx * 0.2, py - ery * 1.25, px + d * erx, py - ery * 0.1);
    almond.quadraticCurveTo(px + d * erx * 0.1, py + ery * 1.05, px - d * erx, py + ery * 0.25);
    x.save();
    x.clip(almond);
    const sc = x.createRadialGradient(px, py, erx * 0.2, px, py, erx * 1.1);
    sc.addColorStop(0, '#f8f4f0'); sc.addColorStop(1, '#d9c9c6');
    x.fillStyle = sc; x.fillRect(px - erx * 1.2, py - ery * 1.5, erx * 2.4, ery * 3);
    // iris with fibers, dark rim, pupil, wet highlight
    const ir = ery * 1.14, iy = py - ery * 0.06;
    const ig = x.createRadialGradient(px, iy, ir * 0.15, px, iy, ir);
    ig.addColorStop(0, tint(look.eye, 1.55)); ig.addColorStop(0.45, tint(look.eye, 1.15)); ig.addColorStop(0.8, look.eye); ig.addColorStop(1, tint(look.eye, 0.3));
    x.fillStyle = ig; x.beginPath(); x.arc(px, iy, ir, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 0.55; x.lineWidth = 0.5;
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2, r0 = ir * (0.36 + R() * 0.15), r1 = ir * (0.7 + R() * 0.26);
      x.strokeStyle = i % 3 ? tint(look.eye, 0.62) : tint(look.eye, 1.7);
      x.beginPath(); x.moveTo(px + Math.cos(a) * r0, iy + Math.sin(a) * r0); x.lineTo(px + Math.cos(a) * r1, iy + Math.sin(a) * r1); x.stroke();
    }
    x.globalAlpha = 1;
    x.strokeStyle = 'rgba(20,12,10,0.55)'; x.lineWidth = ir * 0.12; x.beginPath(); x.arc(px, iy, ir * 0.95, 0, Math.PI * 2); x.stroke();   // dark rim of the iris
    x.fillStyle = '#080505'; x.beginPath(); x.arc(px, iy, ir * 0.38, 0, Math.PI * 2); x.fill();
    soft(px, iy + ir * 0.5, ir * 0.7, ir * 0.35, 'rgba(255,255,255,0.14)');           // light pooling low in the iris
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.ellipse(px - ir * 0.32, iy - ir * 0.34, ir * 0.16, ir * 0.2, -0.4, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.arc(px + ir * 0.34, iy + ir * 0.3, ir * 0.08, 0, Math.PI * 2); x.fill();
    soft(px + d * erx * 0.8, py, erx * 0.35, ery * 0.6, 'rgba(200,150,150,0.28)');     // the white is pinker toward the corner
    // shadow cast by the upper lid, pink inner corner
    const lidSh = x.createLinearGradient(0, py - ery * 1.2, 0, py + ery * 0.3);
    lidSh.addColorStop(0, 'rgba(40,15,12,0.55)'); lidSh.addColorStop(1, 'rgba(40,15,12,0)');
    x.fillStyle = lidSh; x.fillRect(px - erx * 1.2, py - ery * 1.3, erx * 2.4, ery * 1.7);
    soft(px - d * erx * 0.92, py + ery * 0.2, erx * 0.2, ery * 0.4, 'rgba(214,120,120,0.8)');
    x.restore();
    // upper lash line: darkest and thickest toward the outer corner, never a hard outline
    const P0 = [px - d * erx, py + ery * 0.25], P1 = [px - d * erx * 0.2, py - ery * 1.25], P2 = [px + d * erx * 1.04, py - ery * 0.14];
    const onLid = (t) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
    for (let i = 0; i < 24; i++) {
      const a = onLid(i / 24), b = onLid((i + 1) / 24);
      x.strokeStyle = `rgba(34,18,14,${0.5 + 0.45 * (i / 24)})`; x.lineWidth = s * (look.fem ? 0.0048 : 0.0036) * (0.6 + 1.2 * (i / 24));
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke();
    }
    // lower lid: a pale wet rim with the faintest shadow beneath, not a drawn line
    x.strokeStyle = 'rgba(240,200,190,0.55)'; x.lineWidth = 1.1;
    x.beginPath(); x.moveTo(px + d * erx * 0.96, py - ery * 0.08); x.quadraticCurveTo(px + d * erx * 0.1, py + ery * 1.0, px - d * erx * 0.9, py + ery * 0.26); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.3); x.lineWidth = 0.9;
    x.beginPath(); x.moveTo(px + d * erx, py - ery * 0.06); x.quadraticCurveTo(px + d * erx * 0.1, py + ery * 1.12, px - d * erx, py + ery * 0.27); x.stroke();
    // the fold of the lid, and the lid itself catching a little light
    x.strokeStyle = rgba(tone.pore, 0.42); x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(px - d * erx * 0.85, py - ery * 0.75); x.quadraticCurveTo(px, py - ery * 1.95, px + d * erx * 1.05, py - ery * 0.7); x.stroke();
    soft(px, py - ery * 1.2, erx * 0.7, ery * 0.3, 'rgba(255,255,255,0.12)');
    strands(look.fem ? 38 : 18, () => {
      const k = 0.12 + R() * 0.88;
      const [lx, ly] = onLid(k);
      const len = ery * (look.fem ? 0.42 : 0.22) * (0.45 + k * 0.75);
      return [lx, ly, lx + d * len * (0.15 + k * 0.9), ly - len * (1 - k * 0.25), d * len * 0.35, 'rgba(22,12,9,0.8)'];
    }, 0.7);
    strands(10, () => {
      const k = 0.3 + R() * 0.65;
      const lx = px - d * erx + d * erx * 2 * k, ly = py + ery * (0.25 + Math.sin(k * Math.PI) * 0.55 - k * 0.3);
      return [lx, ly, lx + d * ery * 0.1, ly + ery * 0.18, 0, 'rgba(40,22,16,0.4)'];
    }, 0.6);
    soft(px, py + ery * 2.1, erx * 1.0, ery * 0.7, rgba(tone.pore, look.age > 40 ? 0.26 : 0.12));    // under-eye
    if (look.age >= 55) {
      x.strokeStyle = rgba(tone.pore, 0.35); x.lineWidth = 1;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(px + d * erx * 1.1, py + (i - 1) * ery * 0.5); x.lineTo(px + d * erx * 1.5, py + (i - 1) * ery * 1.1); x.stroke(); }
    }
  }
  if (look.age >= 55) {
    x.strokeStyle = rgba(tone.pore, 0.3); x.lineWidth = 1.5;
    for (const v of [-0.52, -0.42, -0.33]) { x.beginPath(); x.moveTo(X(-0.5), Y(v)); x.quadraticCurveTo(cx, Y(v - 0.03), X(0.5), Y(v)); x.stroke(); }
  }

  // ---- nose: nostrils and the curl of each wing
  for (const d of [-1, 1]) {
    x.save();
    x.translate(X(d * 0.085), Y(noseY + 0.015)); x.rotate(d * -0.35); x.scale(1, 0.5);
    const ng = x.createRadialGradient(0, 0, 0, 0, 0, hw * 0.06);
    ng.addColorStop(0, 'rgba(25,8,8,0.95)'); ng.addColorStop(0.7, 'rgba(50,16,14,0.8)'); ng.addColorStop(1, 'rgba(50,16,14,0)');
    x.fillStyle = ng; x.beginPath(); x.arc(0, 0, hw * 0.06, 0, Math.PI * 2); x.fill();
    x.restore();
    // the wing: a rounded bulb with a crease curling round it and a shadow where it meets the cheek
    soft(X(d * 0.235), Y(noseY - 0.02), hw * 0.05, hh * 0.07, rgba(tone.shade, 0.3));
    soft(X(d * 0.16), Y(noseY - 0.025), hw * 0.06, hh * 0.045, 'rgba(255,255,255,0.1)');
    for (const [al, lw] of [[0.12, 3], [0.3, 1.1]]) {
      x.strokeStyle = rgba(tone.pore, al); x.lineWidth = lw;
      x.beginPath(); x.moveTo(X(d * 0.125), Y(noseY - 0.095));
      x.bezierCurveTo(X(d * 0.2), Y(noseY - 0.09), X(d * 0.24), Y(noseY - 0.01), X(d * 0.175), Y(noseY + 0.03));
      x.stroke();
    }
  }

  // the wings of the nose, its shaded side, and the line where the tip meets the lip
  for (const d of [-1, 1]) {
    soft(X(d * 0.2), Y(noseY - 0.03), hw * 0.045, hh * 0.06, rgba(tone.pore, 0.3));
    soft(X(d * 0.15), Y(noseY - 0.05), hw * 0.06, hh * 0.05, 'rgba(255,255,255,0.1)');
  }
  soft(X(0.1), Y(0.12), hw * 0.05, hh * 0.2, rgba(tone.shade, 0.22));
  x.strokeStyle = rgba(tone.pore, 0.32); x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(X(-0.15), Y(noseY + 0.02)); x.quadraticCurveTo(X(-0.07), Y(noseY + 0.05), cx, Y(noseY + 0.035)); x.quadraticCurveTo(X(0.07), Y(noseY + 0.05), X(0.15), Y(noseY + 0.02)); x.stroke();

  // ---- lips
  const my = Y(mouthY), mw = hw * 0.36;
  const mixHex = (a, b, t) => {
    if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return b;
    const p = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
  };
  const lipBase = mixHex(tone.base, look.fem ? '#b04a5c' : '#a8545a', look.fem ? 0.68 : 0.5);   // her own lip colour, not lipstick
  const upper = new Path2D();
  upper.moveTo(cx - mw, my);
  upper.quadraticCurveTo(cx - mw * 0.45, my - hh * 0.055, cx - mw * 0.12, my - hh * 0.05);
  upper.quadraticCurveTo(cx, my - hh * 0.03, cx + mw * 0.12, my - hh * 0.05);
  upper.quadraticCurveTo(cx + mw * 0.45, my - hh * 0.055, cx + mw, my);
  upper.quadraticCurveTo(cx, my + hh * 0.012, cx - mw, my);
  x.shadowColor = tint(lipBase, 0.82); x.shadowBlur = hh * 0.014;
  x.fillStyle = tint(lipBase, 0.82); x.fill(upper);
  const lower = new Path2D();
  lower.moveTo(cx - mw, my);
  lower.quadraticCurveTo(cx, my + hh * 0.012, cx + mw, my);
  lower.quadraticCurveTo(cx + mw * 0.55, my + hh * 0.095, cx, my + hh * 0.1);
  lower.quadraticCurveTo(cx - mw * 0.55, my + hh * 0.095, cx - mw, my);
  const lg = x.createLinearGradient(0, my, 0, my + hh * 0.1);
  lg.addColorStop(0, tint(lipBase, 0.85)); lg.addColorStop(0.5, lipBase); lg.addColorStop(1, tint(lipBase, 1.15));
  x.shadowColor = lipBase; x.fillStyle = lg; x.fill(lower);
  x.shadowColor = 'transparent'; x.shadowBlur = 0;
  soft(cx - mw * 0.1, my + hh * 0.05, mw * 0.5, hh * 0.025, 'rgba(255,255,255,0.32)');
  for (const d of [-1, 1]) soft(cx + d * mw * 1.04, my + hh * 0.006, hw * 0.035, hh * 0.022, 'rgba(60,20,20,0.35)');   // corners of the mouth
  // where the lips meet: a soft wavy line, darkest in the middle, fading into the corners
  const seam = (k) => {
    x.beginPath(); x.moveTo(cx - mw * 1.02 * k, my + hh * 0.004);
    x.quadraticCurveTo(cx - mw * 0.5 * k, my - hh * 0.003, cx - mw * 0.13, my + hh * 0.011);
    x.quadraticCurveTo(cx, my + hh * 0.019, cx + mw * 0.13, my + hh * 0.011);
    x.quadraticCurveTo(cx + mw * 0.5 * k, my - hh * 0.003, cx + mw * 1.02 * k, my + hh * 0.004);
    x.stroke();
  };
  x.strokeStyle = 'rgba(70,22,26,0.3)'; x.lineWidth = 1; seam(1);
  x.strokeStyle = 'rgba(60,18,22,0.5)'; x.lineWidth = 1.5; seam(0.62);
  // lip texture: faint short creases fanning from the centre, kept inside the lips
  x.save(); x.clip(lower);
  x.lineWidth = 0.6;
  for (let i = 0; i < 26; i++) {
    const u = (R() - 0.5) * 1.6, v0 = 0.02 + R() * 0.02, v1 = v0 + 0.02 + R() * 0.035;
    x.strokeStyle = i % 3 ? 'rgba(90,30,36,0.09)' : 'rgba(255,255,255,0.1)';
    x.beginPath(); x.moveTo(cx + u * mw * 0.9, my + hh * v0); x.quadraticCurveTo(cx + u * mw * 0.96, my + hh * (v0 + v1) / 2, cx + u * mw * 0.98, my + hh * v1); x.stroke();
  }
  x.restore();
  x.save(); x.clip(upper);
  for (let i = 0; i < 14; i++) {
    const u = (R() - 0.5) * 1.5;
    x.strokeStyle = 'rgba(90,30,36,0.08)';
    x.beginPath(); x.moveTo(cx + u * mw, my - hh * 0.005); x.lineTo(cx + u * mw * 0.94, my - hh * 0.045); x.stroke();
  }
  x.restore();
  soft(cx, Y(noseY + 0.14), hw * 0.05, hh * 0.05, rgba(tone.pore, 0.2));     // philtrum

  // ---- the small things that make a face read as a person: soft planes of light and
  // shadow, tired little under-eye hollows, smile lines, lid creases, fine skin grain
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey + 0.125), hw * 0.21, hh * 0.035, 'rgba(110,60,90,0.08)');        // under-eye hollow
    soft(X(d * (ex - 0.16)), Y(ey + 0.09), hw * 0.07, hh * 0.04, 'rgba(110,60,90,0.07)');   // tear trough
    soft(X(d * 0.62), Y(0.09), hw * 0.2, hh * 0.06, 'rgba(255,255,255,0.06)');            // cheekbone catches the light
    soft(X(d * 0.8), Y(0.42), hw * 0.16, hh * 0.22, rgba(tone.shade, 0.16));              // hollow of the cheek
    soft(X(d * 0.86), Y(-0.3), hw * 0.14, hh * 0.2, rgba(tone.shade, 0.14));              // temples
    const lines = (look.age || 25) >= 55 ? 0.9 : (look.age || 25) >= 40 ? 0.55 : 0.3;                                       // deeper with age
    x.strokeStyle = rgba(tone.pore, 0.1 * lines); x.lineWidth = 3.2;                               // smile lines
    x.beginPath(); x.moveTo(X(d * 0.21), Y(noseY - 0.01)); x.quadraticCurveTo(X(d * 0.34), Y(noseY + 0.07), X(d * 0.38), Y(mouthY - 0.07)); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.07 * lines); x.lineWidth = 1.4; x.stroke();
    soft(X(d * (ex + 0.02)), Y(ey - 0.115), hw * 0.16, hh * 0.022, 'rgba(255,255,255,0.14)'); // brow bone
  }
  soft(cx, Y(0.08), hw * 0.035, hh * 0.2, 'rgba(255,255,255,0.17)');                       // bridge of the nose
  soft(cx, Y(-0.42), hw * 0.42, hh * 0.13, 'rgba(255,255,255,0.1)');                       // forehead
  soft(cx, Y(mouthY + 0.155), hw * 0.2, hh * 0.03, 'rgba(70,24,24,0.16)');                 // shadow under the lower lip
  soft(cx, Y(0.84), hw * 0.16, hh * 0.06, 'rgba(255,255,255,0.11)');                       // chin
  soft(cx, Y(1.0), hw * 0.7, hh * 0.1, rgba(tone.shade, 0.22));                            // jaw turning under
  x.save();
  x.clip(head);
  for (let i = 0; i < 2600; i++) {
    const u = (R() * 2 - 1), v = R() * 2.1 - 1.05;
    x.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : rgba(tone.pore, 0.06);
    x.fillRect(X(u), Y(v), 0.9 + R() * 0.8, 0.9 + R() * 0.8);
  }
  x.restore();

  // ---- glasses
  if (look.glasses) {
    x.strokeStyle = '#27212b'; x.lineWidth = s * 0.014;
    for (const d of [-1, 1]) {
      x.beginPath(); x.roundRect(X(d * ex) - erx * 1.5, Y(ey) - ery * 2.1, erx * 3, ery * 4.2, ery * 1.4); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.08)'; x.fill();
      x.beginPath(); x.moveTo(X(d * ex) + d * erx * 1.5, Y(ey - 0.03)); x.lineTo(X(d * 1.02), Y(ey - 0.05)); x.stroke();
    }
    x.beginPath(); x.moveTo(X(-ex) + erx * 1.5, Y(ey)); x.quadraticCurveTo(cx, Y(ey - 0.04), X(ex) - erx * 1.5, Y(ey)); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(X(d * ex) - erx * 1.0, Y(ey) - ery * 1.5); x.lineTo(X(d * ex) - erx * 0.3, Y(ey) - ery * 1.7); x.stroke(); }
  }

  // a couple of moles
  for (let i = 0; i < 3; i++) {
    const u = (R() - 0.5) * 1.3, v = -0.3 + R() * 1.1;
    x.fillStyle = 'rgba(85,48,34,0.7)';
    x.beginPath(); x.arc(X(u), Y(v), 0.8 + R() * 1.3, 0, Math.PI * 2); x.fill();
  }

  soft(cx, my - hh * 0.062, hw * 0.05, hh * 0.012, 'rgba(255,255,255,0.4)');             // cupid's bow catches the light
  // the room falls away into soft shadow at the edges
  const vg = x.createRadialGradient(cx, cy, Math.min(w, h) * 0.45, cx, cy, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(20,18,40,0)'); vg.addColorStop(1, 'rgba(20,18,40,0.3)');
  x.fillStyle = vg; x.fillRect(0, 0, w, h);

  // ---- where things are, for the game
  const ell = (px, py, ox, oy, rx, ry) => ((px - ox) / rx) ** 2 + ((py - oy) / ry) ** 2 < 1;
  const inHead = (px, py) => x.isPointInPath(head, px * dpr, py * dpr);
  const edgeV = (u) => (hasHair && style !== 'balding' ? hairline + 0.05 * Math.abs(u) + (style === 'buzz' ? 0 : 0.1 * Math.max(0, u * 0.9)) + 0.03 : -0.92);
  const blocked = (px, py, r = 0) => {
    const u = (px - cx) / hw, v = (py - cy) / hh;
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (!inHead(px + ox * 1.3, py + oy * 1.3)) return true;
    if ((py - r - cy) / hh < edgeV(u)) return true;                                           // hair
    for (const e of eyes) if (ell(px, py, e.x, e.y - ery * 1.2, erx * 1.7 + r, ery * 4.2 + r)) return true;   // eyes + brows
    if (ell(px, py, cx, my + hh * 0.02, mw * 1.25 + r, hh * 0.11 + r)) return true;           // lips
    if (ell(px, py, cx, Y(noseY + 0.02), hw * 0.2 + r * 0.6, hh * 0.05 + r * 0.6)) return true;   // nostrils
    if (look.beard && v > 0.38) return true;                                                  // full beard
    return false;
  };
  const ZONE = {
    forehead: () => [X((R() * 2 - 1) * 0.6), Y(-0.42 + (R() * 2 - 1) * 0.15)],
    nose: () => [X((R() * 2 - 1) * 0.14), Y(0.12 + (R() * 2 - 1) * 0.2)],
    cheek: () => { const d = R() < 0.5 ? -1 : 1; return [X(d * (0.55 + (R() * 2 - 1) * 0.24)), Y(0.3 + (R() * 2 - 1) * 0.2)]; },
    chin: () => [X((R() * 2 - 1) * 0.4), Y(0.84 + (R() * 2 - 1) * 0.11)],
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
    return { x: X(j() * 0.5), y: Y(0.86 + j() * 0.1), a: Math.PI / 2 + j() };
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
  const inLips = (px, py) => x.isPointInPath(lipsPath, px * dpr, py * dpr);
  const lipsBox = [cx - mw, my - hh * 0.06, cx + mw, my + hh * 0.105];
  const cheeks = [-1, 1].map((d) => ({ x: X(d * 0.56), y: Y(0.3), rx: hw * 0.27, ry: hh * 0.16 }));
  const lids = eyes.map((e) => ({ x: e.x, y: e.y - ery * 1.42, rx: erx * 1.12, ry: ery * 0.72 }));
  const onSkin = (px, py) => inHead(px, py) && (py - cy) / hh >= edgeV((px - cx) / hw);   // face, not hair
  const geo = { cx, cy, hw, hh, eyes, inHead, onSkin, blocked, anyPoint, zonePoint, strayPoint,
    lipsPath, inLips, lipsBox, cheeks, lids, onHair, hairlineY: Y(hairline), browY: Y(ey - 0.2), lid: tone.base, lidShade: tone.shade, lash: '#2a1712' };
  return { canvas: c, geo };
}

/** Eyelids drawn live over the painted eyes: closed = 0 (open) .. 1 (shut). */
export function drawLids(ctx, geo, closed) {
  if (closed <= 0.02) return;
  for (const e of geo.eyes) {
    // a real lid: skin sliding down from the upper lash line, its edge curving with the eyeball
    const d = Math.sign(e.x - geo.cx) || 1, rx = e.rx * 1.03, ry = e.ry;
    const ax = e.x - d * rx, ay = e.y + ry * 0.25, bx = e.x + d * rx * 1.02, by = e.y - ry * 0.12;
    const mx = e.x + d * rx * 0.1, my = e.y + ry * (-1.3 + 2.45 * closed);
    ctx.save();
    const g = ctx.createLinearGradient(0, e.y - ry * 1.3, 0, e.y + ry * 0.9);
    g.addColorStop(0, geo.lidShade); g.addColorStop(0.5, geo.lid); g.addColorStop(1, geo.lidShade);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(e.x - d * rx * 0.2, e.y - ry * 1.38, bx, by);
    ctx.quadraticCurveTo(mx, my, ax, ay);
    ctx.fill();
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
    ctx.beginPath(); ctx.moveTo(e.x - d * rx * 0.85, e.y - ry * 0.75); ctx.quadraticCurveTo(e.x, e.y - ry * 1.95, e.x + d * rx * 1.05, e.y - ry * 0.7); ctx.stroke();
    ctx.restore();
  }
}
