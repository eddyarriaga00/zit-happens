// Ear cleaning mode: hold a chunk of wax to loosen it (wiggling helps), then drag it
// out of the ear canal. Don't poke the eardrum in the middle.

import * as audio from './audio.js';
import { buzz } from './haptics.js';

const WAX = [
  ['#f6d277', '#cf9226'],
  ['#e8a840', '#a9621a'],
  ['#bf7a2c', '#6f3e12'],
  ['#8d5522', '#4b2a0c'],
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Ear {
  constructor(G, level, top, bottom) {
    this.G = G;
    this.cx = G.W / 2;
    this.cy = (top + bottom) / 2 + 10;
    this.R = Math.min(G.W * 0.43, (bottom - top) * 0.37);   // canal opening
    this.Rd = this.R * 0.25;                                // eardrum
    this.chunks = [];
    this.ouches = 0;
    this.pulled = 0;
    this.total = 0;
    this.cooldown = 0;
    this.flash = 0;
    this.time = 0;

    // little hairs around the rim
    this.hairs = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.hairs.push({ a, len: rand(0.12, 0.3) * this.R, bend: rand(-0.5, 0.5) });
    }

    const count = Math.min(5 + level, 14);
    for (let i = 0; i < count; i++) this.addChunk(false);
    if (level >= 2) this.addChunk(true);   // the big plug over the eardrum
    this.total = this.chunks.length;
  }

  addChunk(big) {
    const { R, Rd, cx, cy } = this;
    let x, y, r;
    if (big) {
      r = Rd * 1.25;
      x = cx + rand(-6, 6);
      y = cy + rand(-6, 6);
    } else {
      r = rand(0.13, 0.22) * R;
      for (let t = 0; t < 40; t++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(Rd * 1.5 + r * 0.5, R * 0.86);
        x = cx + Math.cos(a) * d;
        y = cy + Math.sin(a) * d;
        if (this.chunks.every((c) => Math.hypot(c.x - x, c.y - y) > (c.r + r) * 0.7)) break;
      }
    }
    const shape = [];
    const n = big ? 11 : 8;
    for (let i = 0; i < n; i++) shape.push(rand(0.72, 1.15));
    const depth = 1 - clamp(Math.hypot(x - cx, y - cy) / R, 0, 1);  // 1 = deep
    const col = WAX[big ? 3 : Math.min(3, Math.floor(depth * 3 + Math.random() * 1.4))];
    const c = {
      x, y, hx: x, hy: y, r, shape, col, big,
      rot: Math.random() * 6,
      stick: big ? 2.4 : rand(0.45, 1.1) + depth * 0.5,
      prog: 0, state: 'stuck', held: null,
      fx: x, fy: y, gx: 0, gy: 0, t: 0, vy: 0, tick: 0,
    };
    // big plug sits underneath everything else
    if (big) this.chunks.unshift(c); else this.chunks.push(c);
  }

  get left() { return this.chunks.filter((c) => c.state !== 'out').length; }

  scaleOf(c) {
    return 0.62 + 0.38 * clamp(Math.hypot(c.x - this.cx, c.y - this.cy) / this.R, 0, 1);
  }

  // ---- input ----
  down(id, x, y) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.state === 'out' || c.held != null) continue;
      if (Math.hypot(c.x - x, c.y - y) < c.r * this.scaleOf(c) + 12) {
        c.held = id;
        c.fx = x; c.fy = y;
        c.gx = x - c.x; c.gy = y - c.y;
        buzz('light');
        return true;
      }
    }
    if (Math.hypot(x - this.cx, y - this.cy) < this.Rd) {
      this.poke();
      return true;
    }
    return false;
  }

  move(id, x, y) {
    const c = this.chunks.find((k) => k.held === id);
    if (!c) return;
    if (c.state === 'stuck') c.prog += Math.hypot(x - c.fx, y - c.fy) * 0.006;  // wiggle to loosen faster
    c.fx = x; c.fy = y;
  }

  up(id) {
    const c = this.chunks.find((k) => k.held === id);
    if (!c) return;
    c.held = null;
    if (c.state !== 'loose') return;
    if (Math.hypot(c.x - this.cx, c.y - this.cy) > this.R * 1.02) this.remove(c);
    else { c.hx = c.x; c.hy = c.y; }
  }

  releaseAll() { for (const c of this.chunks) if (c.held != null) this.up(c.held); }

  poke() {
    if (this.cooldown > 0) return;
    const G = this.G;
    this.cooldown = 1;
    this.flash = 0.5;
    this.ouches++;
    G.combo = 0;
    G.score = Math.max(0, G.score - 30);
    G.shake = 8;
    G.fx.text(this.cx, this.cy - this.Rd - 24, 'OUCH! not the eardrum', '#ff6b78', 20);
    audio.ouch();
    buzz('heavy');
  }

  loosen(c) {
    const G = this.G;
    c.state = 'loose';
    c.gx *= 0.3; c.gy *= 0.3;
    audio.pop(c.r / 16);
    buzz('heavy');
    G.shake = c.big ? 9 : 4;
    G.fx.squirt(c.x, c.y, Math.random() * 6.28, c.big ? 16 : 6, {
      color: c.col[0], speed: 110, spread: 3.2, size: Math.max(1.5, c.r * 0.12), lift: 110,
    });
    G.fx.text(c.x, c.y - c.r - 18, c.big ? 'IT\'S LOOSE! pull!' : 'drag it out →', '#ffe7a8', 16);
  }

  remove(c) {
    const G = this.G;
    c.state = 'out';
    c.t = 0;
    c.vy = -120;
    this.pulled++;
    G.combo++;
    const mult = Math.min(3, 1 + G.combo * 0.25);
    const pts = Math.round((c.big ? 500 : 60 + c.r * 3) * mult);
    G.score += pts;
    G.fx.text(c.x, c.y - c.r - 14, c.big ? `THE BIG ONE! +${pts}` : `+${pts}`, c.big ? '#ffd84d' : '#fff', c.big ? 26 : 20);
    if (c.big) { G.fx.sparkleBurst(c.x, c.y, 20); audio.sparkle(); } else audio.perfect();
    buzz('medium');
    G.onEarPull(c);
  }

  // ---- sim ----
  update(dt) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.state === 'out') {
        c.t += dt;
        c.vy += 1400 * dt;
        c.y += c.vy * dt;
        c.rot += dt * 4;
        if (c.t > 0.7) this.chunks.splice(i, 1);
        continue;
      }
      if (c.state === 'stuck') {
        if (c.held != null) {
          c.prog += dt;
          // stretch toward the finger while it resists
          const dx = c.fx - c.gx - c.hx, dy = c.fy - c.gy - c.hy;
          const d = Math.hypot(dx, dy) || 1;
          const pull = Math.min(d, 6 + 10 * (c.prog / c.stick));
          c.x = c.hx + (dx / d) * pull + (Math.random() - 0.5) * 1.5;
          c.y = c.hy + (dy / d) * pull + (Math.random() - 0.5) * 1.5;
          audio.squish(clamp(c.prog / c.stick, 0, 1));
          c.tick += dt;
          if (c.tick > 0.18) { c.tick = 0; buzz('light'); }
          if (c.prog >= c.stick) this.loosen(c);
        } else {
          c.prog = Math.max(0, c.prog - dt * 0.3);
          c.x += (c.hx - c.x) * Math.min(1, dt * 14);
          c.y += (c.hy - c.y) * Math.min(1, dt * 14);
        }
      } else if (c.held != null) {
        const k = Math.min(1, dt * 28);
        c.x += (c.fx - c.gx - c.x) * k;
        c.y += (c.fy - c.gy - c.y) * k;
      }
    }
  }

  // ---- drawing ----
  drawBack(ctx) {
    const { cx, cy, R, Rd } = this;

    // outer ear folds
    ctx.lineCap = 'round';
    for (const [k, w, a] of [[1.55, 26, 0.16], [1.22, 18, 0.2]]) {
      ctx.strokeStyle = `rgba(120,50,40,${a})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * k, R * k * 1.12, 0, Math.PI * 0.75, Math.PI * 2.35);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,235,225,${a})`;
      ctx.lineWidth = w * 0.3;
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 5, R * k, R * k * 1.12, 0, Math.PI * 0.9, Math.PI * 1.9);
      ctx.stroke();
    }

    // canal
    const g = ctx.createRadialGradient(cx, cy, Rd * 0.5, cx, cy, R * 1.08);
    g.addColorStop(0, '#2b0e0e');
    g.addColorStop(0.45, '#5e2620');
    g.addColorStop(0.8, '#a85a4e');
    g.addColorStop(0.93, 'rgba(190,110,95,0.9)');
    g.addColorStop(1, 'rgba(200,120,105,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
    ctx.fill();
    // depth rings
    for (const k of [0.75, 0.52]) {
      ctx.strokeStyle = 'rgba(30,5,5,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx + 2, cy + 3, R * k, R * k * 0.96, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // eardrum
    const e = ctx.createRadialGradient(cx - Rd * 0.3, cy - Rd * 0.3, 1, cx, cy, Rd);
    e.addColorStop(0, '#f1d5cf');
    e.addColorStop(0.6, '#c99a93');
    e.addColorStop(1, '#7d4a45');
    ctx.fillStyle = e;
    ctx.beginPath();
    ctx.arc(cx, cy, Rd, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Rd * 0.5, cy + Rd * 0.6);
    ctx.stroke();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230,30,50,${this.flash * 1.4})`;
      ctx.beginPath();
      ctx.arc(cx, cy, Rd * 1.15, 0, Math.PI * 2);
      ctx.fill();
    }

    // hairs
    ctx.strokeStyle = 'rgba(60,30,20,0.45)';
    ctx.lineWidth = 1;
    for (const h of this.hairs) {
      const x0 = cx + Math.cos(h.a) * R, y0 = cy + Math.sin(h.a) * R;
      const x1 = cx + Math.cos(h.a + h.bend * 0.3) * (R - h.len), y1 = cy + Math.sin(h.a + h.bend * 0.3) * (R - h.len);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + h.bend * 14, (y0 + y1) / 2 + h.bend * 14, x1, y1);
      ctx.stroke();
    }
  }

  blob(ctx, c, r) {
    const n = c.shape.length;
    const pt = (i) => {
      const a = (i % n) / n * Math.PI * 2;
      const rr = r * c.shape[i % n];
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    };
    ctx.beginPath();
    let [px, py] = pt(0);
    let [qx, qy] = pt(1);
    ctx.moveTo((px + qx) / 2, (py + qy) / 2);
    for (let i = 1; i <= n; i++) {
      [px, py] = pt(i);
      [qx, qy] = pt(i + 1);
      ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    }
    ctx.closePath();
  }

  drawChunks(ctx) {
    for (const c of this.chunks) {
      const s = this.scaleOf(c);
      const r = c.r * s;
      const depth = c.state === 'stuck' ? 1 - clamp(Math.hypot(c.x - this.cx, c.y - this.cy) / this.R, 0, 1) : 0;
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.state === 'out') ctx.globalAlpha = Math.max(0, 1 - c.t / 0.7);
      ctx.rotate(c.rot);
      // shadow
      ctx.save();
      ctx.translate(2, 4);
      ctx.fillStyle = 'rgba(20,5,5,0.35)';
      this.blob(ctx, c, r);
      ctx.fill();
      ctx.restore();
      // body
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, 0, 0, r * 1.15);
      g.addColorStop(0, c.col[0]);
      g.addColorStop(1, c.col[1]);
      ctx.fillStyle = g;
      this.blob(ctx, c, r);
      ctx.fill();
      // lumps + gloss
      ctx.fillStyle = 'rgba(70,35,5,0.22)';
      ctx.beginPath();
      ctx.arc(r * 0.25, r * 0.2, r * 0.28, 0, Math.PI * 2);
      ctx.arc(-r * 0.3, r * 0.35, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -r * 0.38, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fill();
      // deeper = darker
      if (depth > 0.05) {
        ctx.fillStyle = `rgba(30,8,8,${depth * 0.45})`;
        this.blob(ctx, c, r);
        ctx.fill();
      }
      ctx.restore();

      // loosen ring
      if (c.state === 'stuck' && c.prog > 0.02) {
        const R = r + 12;
        ctx.lineCap = 'round';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(40,10,20,0.4)';
        ctx.beginPath();
        ctx.arc(c.hx, c.hy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#ffe17a';
        ctx.beginPath();
        ctx.arc(c.hx, c.hy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(c.prog / c.stick, 0, 1));
        ctx.stroke();
      }
    }

    // hint: glow the rim while something loose is being dragged
    if (this.chunks.some((c) => c.state === 'loose' && c.held != null)) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.strokeStyle = `rgba(125,255,154,${0.25 + p * 0.35})`;
      ctx.lineWidth = 6;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.R * 1.04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
