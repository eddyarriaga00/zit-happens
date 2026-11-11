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
  }
  if (style === 'pony') { x.fillStyle = hair; x.beginPath(); x.ellipse(X(1.02), Y(0.1), hw * 0.26, hh * 0.9, -0.2, 0, Math.PI * 2); x.fill(); }
  if (style === 'bun') { x.fillStyle = hair; x.beginPath(); x.arc(cx, Y(-1.22), hw * 0.42, 0, Math.PI * 2); x.fill(); }
  if (hasHair && style !== 'balding') {     // volume around the skull
    const k = style === 'buzz' ? 1.02 : 1.09;
    x.fillStyle = hairFill;
    x.beginPath(); x.ellipse(cx, Y(-0.3), hw * k, hh * (style === 'buzz' ? 0.76 : 0.8), 0, Math.PI, Math.PI * 2); x.fill();
    soft(X(-0.15), Y(-0.98), hw * 0.8, hh * 0.09, 'rgba(255,255,255,0.14)');     // light on the crown
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

  // ---- ears
  for (const d of [-1, 1]) {
    x.fillStyle = tone.bump;
    x.beginPath(); x.ellipse(X(d * 1.0), Y(0.02), hw * 0.13, hh * 0.19, d * 0.12, 0, Math.PI * 2); x.fill();
    soft(X(d * 0.98), Y(0.03), hw * 0.07, hh * 0.11, rgba(tone.pore, 0.45));
    soft(X(d * 1.02), Y(0.06), hw * 0.1, hh * 0.14, rgba(tone.blush, 0.4));     // ears glow a little red
  }

  // ---- the head
  const jaw = look.fem ? 0.6 : 0.72;
  const head = new Path2D();
  head.moveTo(cx, Y(-1));
  head.bezierCurveTo(X(0.95), Y(-1), X(1.06), Y(-0.2), X(0.98), Y(0.15));
  head.bezierCurveTo(X(0.92), Y(0.62), X(jaw), Y(0.98), cx, Y(1));
  head.bezierCurveTo(X(-jaw), Y(0.98), X(-0.92), Y(0.62), X(-0.98), Y(0.15));
  head.bezierCurveTo(X(-1.06), Y(-0.2), X(-0.95), Y(-1), cx, Y(-1));
  head.closePath();

  const ey = -0.06, ex = 0.42;                      // eye line / spacing (head units)
  const erx = hw * 0.2, ery = hh * 0.075;
  const mouthY = 0.6, noseY = 0.36;

  x.save();
  x.clip(head);
  x.drawImage(renderSkin(w, h, dpr, tone, seed), 0, 0, w, h);    // real pores and texture
  // form: light from the upper left, the face turning away at the sides
  const side = x.createLinearGradient(X(-1), 0, X(1), 0);
  side.addColorStop(0, rgba(tone.shade, 0.75)); side.addColorStop(0.2, rgba(tone.shade, 0.08));
  side.addColorStop(0.72, rgba(tone.shade, 0.12)); side.addColorStop(1, rgba(tone.shade, 0.9));
  x.fillStyle = side; x.fillRect(X(-1.1), Y(-1.1), s * 1.1, hh * 2.2);
  soft(X(-0.12), Y(-0.5), hw * 0.55, hh * 0.22, 'rgba(255,255,255,0.16)');          // forehead
  soft(cx, Y(1.14), hw * 1.0, hh * 0.3, rgba(tone.shade, 0.75));                    // under the jaw
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey - 0.02), hw * 0.32, hh * 0.16, rgba(tone.pore, 0.3));      // eye sockets
    soft(X(d * 0.55), Y(0.3), hw * 0.34, hh * 0.24, rgba(tone.blush, 0.36));        // cheeks
    soft(X(d * 0.5 - 0.06), Y(0.14), hw * 0.2, hh * 0.1, 'rgba(255,255,255,0.13)'); // cheekbones
    soft(X(d * 0.17), Y(0.2), hw * 0.08, hh * 0.22, rgba(tone.pore, 0.22));         // sides of the nose
    if (look.age >= 35) {                                                           // smile lines
      x.strokeStyle = rgba(tone.pore, look.age >= 55 ? 0.16 : 0.08); x.lineWidth = s * 0.012;
      x.beginPath(); x.moveTo(X(d * 0.24), Y(0.36)); x.quadraticCurveTo(X(d * 0.42), Y(0.5), X(d * 0.4), Y(0.68)); x.stroke();
    }
  }
  for (const d of [-1, 1]) {
    soft(X(d * 0.86), Y(-0.3), hw * 0.22, hh * 0.32, rgba(tone.shade, 0.4));           // temples
    soft(X(d * 0.64), Y(0.48), hw * 0.2, hh * 0.17, rgba(tone.shade, 0.34));           // hollow under the cheekbone
    soft(X(d * 0.5 - 0.05), Y(0.1), hw * 0.13, hh * 0.045, 'rgba(255,255,255,0.2)');   // sheen on the cheekbone
    soft(X(d * ex), Y(ey - 0.13), hw * 0.26, hh * 0.05, rgba(tone.pore, 0.2));         // shadow under the brow
  }
  soft(X(-0.05), Y(-0.36), hw * 0.2, hh * 0.08, 'rgba(255,255,255,0.14)');             // oily centre of the forehead
  const ridge = x.createLinearGradient(X(-0.09), 0, X(0.09), 0);
  ridge.addColorStop(0, 'rgba(255,255,255,0)'); ridge.addColorStop(0.45, 'rgba(255,255,255,0.2)'); ridge.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = ridge; x.fillRect(X(-0.09), Y(-0.1), hw * 0.18, hh * 0.4);
  soft(cx, Y(0.31), hw * 0.15, hh * 0.09, rgba(tone.blush, 0.3));                    // warmth in the nose
  soft(X(-0.02), Y(0.3), hw * 0.1, hh * 0.07, 'rgba(255,255,255,0.3)');             // tip of the nose
  soft(cx, Y(noseY + 0.07), hw * 0.2, hh * 0.04, 'rgba(50,16,12,0.4)');             // under the nose
  soft(cx, Y(mouthY + 0.14), hw * 0.26, hh * 0.05, 'rgba(60,20,15,0.3)');           // under the lip
  soft(X(-0.03), Y(0.84), hw * 0.26, hh * 0.1, 'rgba(255,255,255,0.14)');           // chin

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
      // strands sweeping across, plus a few stray baby hairs
      strands(1700, () => {
        const u = R() * 2.1 - 1.05, part = -0.3;
        return [X(part + (u - part) * 0.35), Y(-1.04), X(u), Y(edge(Math.max(-1, Math.min(1, u))) - R() * 0.12), (u - part) * hw * 0.22, hairCol()];
      }, 0.8);
      soft(X(-0.1), Y(-0.86), hw * 0.75, hh * 0.06, 'rgba(255,255,255,0.13)');   // shine band
      strands(90, () => { const u = R() * 1.6 - 0.8; return [X(u), Y(edge(u) - 0.01), X(u) + (R() - 0.3) * 8, Y(edge(u) + 0.02 + R() * 0.04), 2, rgba(hair, 0.45)]; }, 0.8);
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
      x.fillStyle = R() < 0.5 ? hair : hairLo;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = hairHi; x.lineWidth = 1.4;
      x.beginPath(); x.arc(px, py, r * 0.55, R() * 6, R() * 6 + 2.6); x.stroke();
    }
  }

  // ---- eyebrows: individual hairs following the arch
  const browCol = grey ? '#8a8a8a' : tint(hair, 0.8);
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey - 0.21), hw * 0.26, hh * 0.035, rgba(browCol.startsWith('#') ? browCol : hair, 0.25));
    strands(look.fem ? 150 : 210, () => {
      const k = R();                         // 0 = inner end, 1 = tail
      const bx = X(d * (ex - 0.24 + k * 0.5)), by = Y(ey - 0.19 - Math.sin(k * Math.PI * 0.8) * 0.05 + k * 0.03) + (R() - 0.5) * hh * (look.fem ? 0.03 : 0.045);
      const a = (d > 0 ? -0.25 : Math.PI + 0.25) + (0.6 - k) * (d > 0 ? -0.9 : 0.9);
      const len = hw * (0.05 + R() * 0.04);
      return [bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len, 0, rgba(grey ? '#8a8a8a' : hair, 0.85)];
    }, look.fem ? 1.1 : 1.5);
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
    const ir = ery * 1.02;
    const ig = x.createRadialGradient(px, py, ir * 0.2, px, py, ir);
    ig.addColorStop(0, tint(look.eye, 1.5)); ig.addColorStop(0.7, look.eye); ig.addColorStop(1, tint(look.eye, 0.45));
    x.fillStyle = ig; x.beginPath(); x.arc(px, py, ir, 0, Math.PI * 2); x.fill();
    x.strokeStyle = tint(look.eye, 0.6); x.lineWidth = 0.6;
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; x.beginPath(); x.moveTo(px + Math.cos(a) * ir * 0.4, py + Math.sin(a) * ir * 0.4); x.lineTo(px + Math.cos(a) * ir * 0.92, py + Math.sin(a) * ir * 0.92); x.stroke(); }
    x.fillStyle = '#0c0807'; x.beginPath(); x.arc(px, py, ir * 0.42, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(px - ir * 0.3, py - ir * 0.35, ir * 0.17, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(px + ir * 0.3, py + ir * 0.3, ir * 0.1, 0, Math.PI * 2); x.fill();
    // shadow cast by the upper lid, pink inner corner
    const lidSh = x.createLinearGradient(0, py - ery * 1.2, 0, py + ery * 0.3);
    lidSh.addColorStop(0, 'rgba(40,15,12,0.55)'); lidSh.addColorStop(1, 'rgba(40,15,12,0)');
    x.fillStyle = lidSh; x.fillRect(px - erx * 1.2, py - ery * 1.3, erx * 2.4, ery * 1.7);
    soft(px - d * erx * 0.92, py + ery * 0.2, erx * 0.2, ery * 0.4, 'rgba(214,120,120,0.8)');
    x.restore();
    // lids, crease, lashes
    x.strokeStyle = '#2a1712'; x.lineWidth = s * (look.fem ? 0.011 : 0.008);
    x.beginPath(); x.moveTo(px - d * erx, py + ery * 0.25); x.quadraticCurveTo(px - d * erx * 0.2, py - ery * 1.25, px + d * erx * 1.04, py - ery * 0.14); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.55); x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(px + d * erx, py - ery * 0.1); x.quadraticCurveTo(px + d * erx * 0.1, py + ery * 1.05, px - d * erx, py + ery * 0.25); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.4); x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(px - d * erx * 0.85, py - ery * 0.8); x.quadraticCurveTo(px, py - ery * 2.0, px + d * erx * 1.05, py - ery * 0.75); x.stroke();
    if (look.fem) {
      strands(20, () => {
        const k = 0.25 + R() * 0.75;                              // mostly toward the outer corner
        const t = k, lx = (1 - t) * (1 - t) * (px - d * erx) + 2 * (1 - t) * t * (px - d * erx * 0.2) + t * t * (px + d * erx * 1.04);
        const ly = (1 - t) * (1 - t) * (py + ery * 0.25) + 2 * (1 - t) * t * (py - ery * 1.25) + t * t * (py - ery * 0.14);
        const len = ery * 0.34 * (0.5 + k * 0.7);
        return [lx, ly, lx + d * len * (0.3 + k), ly - len, d * 1, 'rgba(25,14,10,0.85)'];
      }, 1);
    }
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
    x.strokeStyle = rgba(tone.pore, 0.28); x.lineWidth = 1.3;
    x.beginPath(); x.arc(X(d * 0.14), Y(noseY - 0.015), hw * 0.06, d > 0 ? -1.3 : Math.PI - 0.9, d > 0 ? 0.9 : Math.PI + 1.3); x.stroke();
  }

  // ---- lips
  const my = Y(mouthY), mw = hw * 0.36;
  const lipBase = look.fem ? '#b8506a' : tint(tone.blush, 0.82);
  const upper = new Path2D();
  upper.moveTo(cx - mw, my);
  upper.quadraticCurveTo(cx - mw * 0.45, my - hh * 0.055, cx - mw * 0.12, my - hh * 0.05);
  upper.quadraticCurveTo(cx, my - hh * 0.03, cx + mw * 0.12, my - hh * 0.05);
  upper.quadraticCurveTo(cx + mw * 0.45, my - hh * 0.055, cx + mw, my);
  upper.quadraticCurveTo(cx, my + hh * 0.012, cx - mw, my);
  x.fillStyle = tint(lipBase, 0.82); x.fill(upper);
  const lower = new Path2D();
  lower.moveTo(cx - mw, my);
  lower.quadraticCurveTo(cx, my + hh * 0.012, cx + mw, my);
  lower.quadraticCurveTo(cx + mw * 0.55, my + hh * 0.095, cx, my + hh * 0.1);
  lower.quadraticCurveTo(cx - mw * 0.55, my + hh * 0.095, cx - mw, my);
  const lg = x.createLinearGradient(0, my, 0, my + hh * 0.1);
  lg.addColorStop(0, tint(lipBase, 0.85)); lg.addColorStop(0.5, lipBase); lg.addColorStop(1, tint(lipBase, 1.15));
  x.fillStyle = lg; x.fill(lower);
  soft(cx - mw * 0.1, my + hh * 0.05, mw * 0.5, hh * 0.025, 'rgba(255,255,255,0.32)');
  x.strokeStyle = 'rgba(70,22,26,0.85)'; x.lineWidth = 1.8;
  x.beginPath(); x.moveTo(cx - mw * 1.03, my + hh * 0.008); x.quadraticCurveTo(cx, my + hh * 0.014, cx + mw * 1.03, my + hh * 0.008); x.stroke();
  x.strokeStyle = 'rgba(90,30,36,0.2)'; x.lineWidth = 0.8;
  for (let i = 0; i < 14; i++) { const u = (R() - 0.5) * 1.5; x.beginPath(); x.moveTo(cx + u * mw, my + hh * 0.012); x.lineTo(cx + u * mw * 0.95, my + hh * 0.085); x.stroke(); }
  soft(cx, Y(noseY + 0.14), hw * 0.05, hh * 0.05, rgba(tone.pore, 0.2));     // philtrum

  // ---- the small things that make a face read as a person: soft planes of light and
  // shadow, tired little under-eye hollows, smile lines, lid creases, fine skin grain
  for (const d of [-1, 1]) {
    soft(X(d * ex), Y(ey + 0.125), hw * 0.21, hh * 0.035, 'rgba(110,60,90,0.08)');        // under-eye hollow
    soft(X(d * (ex - 0.16)), Y(ey + 0.09), hw * 0.07, hh * 0.04, 'rgba(110,60,90,0.07)');   // tear trough
    soft(X(d * 0.62), Y(0.09), hw * 0.2, hh * 0.06, 'rgba(255,255,255,0.13)');            // cheekbone catches the light
    soft(X(d * 0.8), Y(0.42), hw * 0.16, hh * 0.22, rgba(tone.shade, 0.16));              // hollow of the cheek
    soft(X(d * 0.86), Y(-0.3), hw * 0.14, hh * 0.2, rgba(tone.shade, 0.14));              // temples
    const lines = (look.age || 25) >= 40 ? 1 : 0.35;                                       // deeper with age
    x.strokeStyle = rgba(tone.pore, 0.1 * lines); x.lineWidth = 3.2;                               // smile lines
    x.beginPath(); x.moveTo(X(d * 0.21), Y(noseY - 0.01)); x.quadraticCurveTo(X(d * 0.34), Y(noseY + 0.07), X(d * 0.38), Y(mouthY - 0.07)); x.stroke();
    x.strokeStyle = rgba(tone.pore, 0.07 * lines); x.lineWidth = 1.4; x.stroke();
    x.strokeStyle = 'rgba(80,40,34,0.3)'; x.lineWidth = 1.1;                               // crease above the lid
    x.beginPath(); x.ellipse(X(d * ex), Y(ey + 0.02), erx * 1.12, ery * 1.75, 0, Math.PI * 1.14, Math.PI * 1.86); x.stroke();
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
  const lids = eyes.map((e) => ({ x: e.x, y: e.y - ery * 1.75, rx: erx * 1.15, ry: ery * 0.95 }));
  const onSkin = (px, py) => inHead(px, py) && (py - cy) / hh >= edgeV((px - cx) / hw);   // face, not hair
  const geo = { cx, cy, hw, hh, eyes, inHead, onSkin, blocked, anyPoint, zonePoint, strayPoint,
    lipsPath, inLips, lipsBox, cheeks, lids, onHair, hairlineY: Y(hairline), browY: Y(ey - 0.2), lid: tone.base, lidShade: tone.shade, lash: '#2a1712' };
  return { canvas: c, geo };
}

/** Eyelids drawn live over the painted eyes: closed = 0 (open) .. 1 (shut). */
export function drawLids(ctx, geo, closed) {
  if (closed <= 0.02) return;
  for (const e of geo.eyes) {
    const rx = e.rx * 1.08, ry = e.ry * 1.3;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(e.x, e.y - e.ry * 0.05, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    const yb = e.y - ry + ry * 2 * closed;
    const g = ctx.createLinearGradient(0, e.y - ry, 0, yb);
    g.addColorStop(0, geo.lidShade);
    g.addColorStop(1, geo.lid);
    ctx.fillStyle = g;
    ctx.fillRect(e.x - rx, e.y - ry - 2, rx * 2, yb - (e.y - ry) + 2);
    ctx.strokeStyle = geo.lash;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(e.x - rx, yb - 1);
    ctx.quadraticCurveTo(e.x, yb + ry * 0.35 * closed, e.x + rx, yb - 1);
    ctx.stroke();
    // lashes along the closed edge, and the fold above it
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const k = i / 8, lx = e.x - rx + rx * 2 * k, ly = yb - 1 + Math.sin(k * Math.PI) * ry * 0.3 * closed;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + (k - 0.5) * 5, ly + 4 * closed); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(70,30,25,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x - rx * 0.8, e.y - ry * 0.55); ctx.quadraticCurveTo(e.x, e.y - ry * 1.05, e.x + rx * 0.8, e.y - ry * 0.55); ctx.stroke();
    ctx.restore();
  }
}
