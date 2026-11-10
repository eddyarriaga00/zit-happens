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

  draw(ctx, pointers) {
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
    const ux = 0.64, uy = -0.77;
    const tx = s.x + ux * off, ty = s.y + uy * off;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40,20,20,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx + 3, ty + 4); ctx.lineTo(tx + ux * 96 + 3, ty + uy * 96 + 4); ctx.stroke();
    ctx.strokeStyle = '#d9dee6';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ux * 60, ty + uy * 60); ctx.stroke();
    ctx.strokeStyle = '#ff8fb0';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(tx + ux * 60, ty + uy * 60); ctx.lineTo(tx + ux * 104, ty + uy * 104); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tx + ux * 64 - 2, ty + uy * 64 - 2); ctx.lineTo(tx + ux * 98 - 2, ty + uy * 98 - 2); ctx.stroke();
  }

  tweezers(ctx, x, y, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [col, w, o] of [['rgba(40,20,20,0.3)', 6, 3], ['#c5cbd6', 5, 0], ['#ffffff', 1.5, -1]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(-2, o); ctx.lineTo(34, -9 + o); ctx.lineTo(92, -4 + o);
      ctx.moveTo(-2, o); ctx.lineTo(34, 9 + o); ctx.lineTo(92, 4 + o);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff8fb0';
    ctx.beginPath(); ctx.roundRect(84, -8, 22, 16, 6); ctx.fill();
    ctx.restore();
  }

  sprayBottle(ctx, x, y, squeezing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.5);
    ctx.fillStyle = 'rgba(40,20,20,0.25)';
    ctx.beginPath(); ctx.roundRect(-11, -4, 26, 42, 8); ctx.fill();
    ctx.fillStyle = '#ffc2dc';
    ctx.beginPath(); ctx.roundRect(-13, -8, 26, 42, 8); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.roundRect(-9, -2, 6, 28, 3); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(-7, -18, 14, 11, 3); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-22, -24, 24, 8, 3); ctx.fill();
    ctx.fillStyle = '#ff8fb0';
    ctx.beginPath(); ctx.roundRect(2, squeezing ? -16 : -13, 9, 6, 2); ctx.fill();
    ctx.restore();
  }
}
