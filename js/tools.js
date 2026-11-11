// The tools as you see them in your hand: needle jab, tweezers gripping a hair,
// finger pressure dents while squeezing, and the antiseptic spray mist.

export class ToolFX {
  constructor() {
    this.stabs = [];
    this.mists = [];
  }

  stab(x, y) { this.stabs.push({ x, y, t: 0 }); }

  mist(x, y) {
    const dots = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 70;
      dots.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: 1.5 + Math.random() * 3 });
    }
    this.mists.push({ x, y, t: 0, dots });
  }

  update(dt) {
    for (let i = this.stabs.length - 1; i >= 0; i--) {
      this.stabs[i].t += dt;
      if (this.stabs[i].t > 0.42) this.stabs.splice(i, 1);
    }
    for (let i = this.mists.length - 1; i >= 0; i--) {
      this.mists[i].t += dt;
      if (this.mists[i].t > 0.7) this.mists.splice(i, 1);
    }
  }

  draw(ctx, pointers, tool) {
    // finger pressure dents while pinching, and tweezers on a hair
    for (const [, p] of pointers) {
      if (p.kind === 'pinch') {
        const q = p.pin.p;
        const g = ctx.createRadialGradient(p.x, p.y, 6, p.x, p.y, 50);
        g.addColorStop(0, 'rgba(150,50,40,0.34)');
        g.addColorStop(0.7, 'rgba(150,50,40,0.12)');
        g.addColorStop(1, 'rgba(150,50,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 50, 0, Math.PI * 2); ctx.fill();
        // your gloved fingertip, pressing in toward the pimple
        const fa = Math.atan2(q.y - p.y, q.x - p.x);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(fa); ctx.scale(1 / (this.k || 1), 1 / (this.k || 1));   // your finger stays finger-sized however far in the camera is
        ctx.fillStyle = 'rgba(30,15,15,0.16)'; ctx.beginPath(); ctx.roundRect(-76, -17, 100, 44, 22); ctx.fill();
        const gl = ctx.createLinearGradient(0, -22, 0, 22);
        gl.addColorStop(0, 'rgba(176,216,240,0.72)'); gl.addColorStop(0.5, 'rgba(120,176,220,0.7)'); gl.addColorStop(1, 'rgba(84,138,190,0.72)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.roundRect(-80, -21, 104, 42, 21); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-66, -12); ctx.lineTo(6, -12); ctx.stroke();
        ctx.strokeStyle = 'rgba(60,110,160,0.35)'; ctx.lineWidth = 1;
        for (const k of [-34, -30]) { ctx.beginPath(); ctx.moveTo(k, -16); ctx.quadraticCurveTo(k + 3, 0, k, 16); ctx.stroke(); }   // creases at the knuckle
        ctx.restore();
        // skin bunching up toward the pimple
        const a = Math.atan2(q.y - p.y, q.x - p.x);
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        ctx.strokeStyle = 'rgba(120,40,30,0.3)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 1; i <= 3; i++) {
          const k = 0.35 + i * 0.15;
          if (d * k < q.r) continue;
          const cx = q.x - Math.cos(a) * d * (1 - k) * 0.0 - Math.cos(a) * (q.r * 1.3 + i * 7);
          const cy = q.y - Math.sin(a) * (q.r * 1.3 + i * 7);
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 30, a + Math.PI - 0.5, a + Math.PI + 0.5);
          ctx.stroke();
        }
      } else if (p.kind === 'pimple' && tool === 'extractor' && p.p && p.p.state !== 'done') {
        drawExtractor(ctx, p.p.x, p.p.y, p.p.r * 0.9);
      } else if (p.kind === 'tweeze' && p.p.state !== 'done') {
        const q = p.p;
        const a = q.hairAngle, L = Math.max(10, q.hairOut * q.hairLen);
        this.tweezers(ctx, q.x + Math.cos(a) * L, q.y + Math.sin(a) * L, a);
      }
    }

    for (const s of this.stabs) this.needle(ctx, s);

    for (const m of this.mists) {
      const k = m.t / 0.7;
      const grow = 1 - Math.pow(1 - Math.min(1, k * 2.2), 2);
      ctx.fillStyle = `rgba(200,235,255,${0.16 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 74 * grow, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(235,248,255,${0.85 * (1 - k)})`;
      ctx.beginPath();
      for (const d of m.dots) {
        const x = m.x + d.dx * grow, y = m.y + d.dy * grow;
        ctx.moveTo(x + d.r, y);
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
      }
      ctx.fill();
      if (k < 0.5) this.sprayBottle(ctx, m.x + 46, m.y - 62, k < 0.18);
    }
  }

  needle(ctx, s) {
    // jabs in from the top right, pauses, pulls back
    const k = s.t < 0.1 ? s.t / 0.1 : s.t < 0.22 ? 1 : 1 - (s.t - 0.22) / 0.2;
    const off = (1 - k) * 46;
    drawLancet(ctx, s.x + UX * off, s.y + UY * off);
  }

  tweezers(ctx, x, y, a) { drawTweezers(ctx, x, y, a); }

  sprayBottle(ctx, x, y, squeezing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.5);
    ctx.fillStyle = 'rgba(40,20,20,0.22)';
    ctx.beginPath(); ctx.roundRect(-10, -2, 28, 50, 9); ctx.fill();
    // clear bottle, liquid inside, a label
    const body = ctx.createLinearGradient(-14, 0, 14, 0);
    body.addColorStop(0, 'rgba(170,215,240,0.95)'); body.addColorStop(0.25, 'rgba(235,248,255,0.98)'); body.addColorStop(0.6, 'rgba(190,226,246,0.95)'); body.addColorStop(1, 'rgba(120,175,210,0.95)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-14, -8, 28, 52, 9); ctx.fill();
    ctx.fillStyle = 'rgba(90,170,220,0.45)';
    ctx.beginPath(); ctx.roundRect(-12, 8, 24, 34, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.roundRect(-11, 14, 22, 18, 3); ctx.fill();
    ctx.fillStyle = '#3c8dbc'; ctx.fillRect(-8, 18, 16, 2.5); ctx.fillStyle = '#9aa7b5'; ctx.fillRect(-8, 23, 11, 1.6); ctx.fillRect(-8, 26.5, 14, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.roundRect(-10, -3, 3.5, 40, 2); ctx.fill();
    // collar, pump head and nozzle
    const head = ctx.createLinearGradient(0, -30, 0, -8);
    head.addColorStop(0, '#ffffff'); head.addColorStop(1, '#cfd6df');
    ctx.fillStyle = '#aeb7c2'; ctx.beginPath(); ctx.roundRect(-8, -13, 16, 6, 2); ctx.fill();
    ctx.fillStyle = head;
    ctx.beginPath(); ctx.roundRect(-7, squeezing ? -22 : -25, 14, squeezing ? 10 : 13, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-24, squeezing ? -27 : -30, 31, 8, 3); ctx.fill();
    ctx.fillStyle = '#6f7885'; ctx.beginPath(); ctx.arc(-24, squeezing ? -23 : -26, 1.6, 0, 7); ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the instruments
const UX = 0.64, UY = -0.77;      // tools come in from the top right, clear of the finger

/** A polished steel rod: cast shadow, dark edge, bright band, specular line. */
function rod(ctx, x0, y0, x1, y1, w, shadow = true) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  ctx.lineCap = 'round';
  const pass = (col, lw, o, sx = 0, sy = 0) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0 + nx * o + sx, y0 + ny * o + sy); ctx.lineTo(x1 + nx * o + sx, y1 + ny * o + sy); ctx.stroke();
  };
  if (shadow) pass('rgba(30,15,15,0.26)', w + 1, 0, 3, 4);
  pass('#667080', w, 0);
  pass('#aeb7c3', w * 0.74, -w * 0.05);
  pass('#e9eef3', w * 0.36, -w * 0.15);
  pass('rgba(255,255,255,0.95)', Math.max(0.6, w * 0.1), -w * 0.24);
}
/** The same rod with a knurled grip cut into it. */
function grip(ctx, x0, y0, x1, y1, w) {
  rod(ctx, x0, y0, x1, y1, w);
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  ctx.lineCap = 'butt'; ctx.lineWidth = 0.8;
  for (let d = 6; d < L - 6; d += 3.2) {
    const px = x0 + dx / L * d, py = y0 + dy / L * d;
    ctx.strokeStyle = 'rgba(50,56,66,0.5)';
    ctx.beginPath(); ctx.moveTo(px - nx * w * 0.46, py - ny * w * 0.46); ctx.lineTo(px + nx * w * 0.46, py + ny * w * 0.46); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(px - nx * w * 0.4 + 0.8, py - ny * w * 0.4 + 0.8); ctx.lineTo(px + 0.8, py + 0.8); ctx.stroke();
  }
  ctx.lineCap = 'round';
}

/** A sterile lancet: needle point, slim shaft, knurled handle. Tip at (x, y). */
export function drawLancet(ctx, x, y) {
  const at = (d) => [x + UX * d, y + UY * d];
  const [a0, a1] = at(15), [b0, b1] = at(56), [c0, c1] = at(112);
  ctx.fillStyle = 'rgba(30,15,15,0.22)';
  ctx.beginPath(); ctx.moveTo(x + 3, y + 4); ctx.lineTo(a0 + 4.2, a1 + 4.6); ctx.lineTo(a0 + 1.8, a1 + 3.4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9d0d9';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a0 - UY * 1.2, a1 + UX * 1.2); ctx.lineTo(a0 + UY * 1.2, a1 - UX * 1.2); ctx.closePath(); ctx.fill();
  rod(ctx, a0, a1, b0, b1, 2.4);
  grip(ctx, b0, b1, c0, c1, 7.5);
}

/** Slant-tip steel tweezers. Tips meet at (x, y); the body runs off along angle a. */
export function drawTweezers(ctx, x, y, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  for (const sgn of [-1, 1]) {
    rod(ctx, -1, sgn * 0.6, 14, sgn * 3.4, 2.6);
    rod(ctx, 14, sgn * 3.4, 40, sgn * 9, 4.6);
    rod(ctx, 40, sgn * 9, 96, sgn * 3.5, 5.2);
  }
  rod(ctx, 94, 0, 110, 0, 9, false);
  ctx.restore();
}

/** Comedone extractor (or an ear curette when r is small): a wire loop on a knurled handle. */
export function drawExtractor(ctx, x, y, r) {
  const R = Math.max(5, r);
  ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(30,15,15,0.26)';
  ctx.beginPath(); ctx.arc(x + 3, y + 4, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#667080'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#dfe5ec'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.arc(x, y, R + 0.4, Math.PI * 0.9, Math.PI * 1.5); ctx.stroke();
  const at = (d) => [x + UX * d, y + UY * d];
  const [a0, a1] = at(R), [b0, b1] = at(R + 30), [c0, c1] = at(R + 118);
  rod(ctx, a0, a1, b0, b1, 2.8);
  grip(ctx, b0, b1, c0, c1, 7.5);
}

/** An irrigation syringe squirting at (x, y). */
export function drawSyringe(ctx, x, y) {
  ctx.save();
  ctx.translate(x + UX * 18, y + UY * 18);
  ctx.rotate(Math.atan2(UY, UX));
  rod(ctx, 0, 0, 16, 0, 3);                                   // nozzle
  ctx.fillStyle = 'rgba(30,15,15,0.2)'; ctx.beginPath(); ctx.roundRect(18, -7, 74, 22, 5); ctx.fill();
  const g = ctx.createLinearGradient(0, -11, 0, 11);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(225,240,250,0.9)'); g.addColorStop(1, 'rgba(160,195,220,0.92)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(15, -11, 74, 22, 5); ctx.fill();
  ctx.fillStyle = 'rgba(110,190,235,0.55)'; ctx.beginPath(); ctx.roundRect(17, -9, 44, 18, 4); ctx.fill();   // water
  ctx.fillStyle = '#39424e'; ctx.fillRect(60, -9.5, 5, 19);                                                 // plunger seal
  ctx.strokeStyle = 'rgba(70,90,110,0.55)'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(24 + i * 9, -11); ctx.lineTo(24 + i * 9, -5); ctx.stroke(); }
  ctx.fillStyle = '#dfe5ec'; ctx.fillRect(65, -2.5, 44, 5);
  ctx.fillStyle = '#c3cbd5'; ctx.beginPath(); ctx.roundRect(86, -15, 5, 30, 2); ctx.fill(); ctx.beginPath(); ctx.roundRect(108, -11, 5, 22, 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(19, -8, 66, 2.5);
  ctx.restore();
}
