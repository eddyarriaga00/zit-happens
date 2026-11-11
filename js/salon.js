// Two small side modes played on the same face: Makeup and Haircut.
// Both expose: down / move / up, update, draw, progress (0..1), ready, score().

import * as audio from './audio.js';
import { buzz } from './haptics.js';

export const LIP_SHADES = ['#c2185b', '#e53935', '#d81b60', '#ff7043', '#8e244d', '#b56576', '#6d1b3b', '#7b61ff'];
export const BLUSH_SHADES = ['#ff8fa3', '#ffab91', '#f48fb1', '#e57373'];
export const SHADOW_SHADES = ['#8e6bbf', '#b08968', '#4f8fbf', '#e0a3c8', '#5f7a61', '#c9a227'];

const STEP = 7;   // coverage is measured on a 7px grid inside each area

// ---------------------------------------------------------------- makeup
export class Makeup {
  constructor(G, lipCount) {
    this.G = G;
    const g = G.geo;
    this.product = 'lips';
    this.shades = { lips: LIP_SHADES.slice(0, lipCount), blush: BLUSH_SHADES, shadow: SHADOW_SHADES };
    this.color = { lips: LIP_SHADES[0], blush: BLUSH_SHADES[0], shadow: SHADOW_SHADES[0] };
    const ell = (e) => { const p = new Path2D(); p.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, Math.PI * 2); return p; };
    const inEll = (e, x, y) => ((x - e.x) / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2 < 1;
    const many = (list) => { const p = new Path2D(); for (const e of list) p.addPath(ell(e)); return p; };
    // each area: a clip path, a hit test, and the grid cells inside it
    this.areas = {
      lips: { path: g.lipsPath, has: (x, y) => g.inLips(x, y), box: g.lipsBox },
      blush: { path: many(g.cheeks), has: (x, y) => g.cheeks.some((e) => inEll(e, x, y)), box: boxOf(g.cheeks) },
      shadow: { path: many(g.lids), has: (x, y) => g.lids.some((e) => inEll(e, x, y)), box: boxOf(g.lids) },
    };
    for (const a of Object.values(this.areas)) {
      a.cells = new Map();
      const [x0, y0, x1, y1] = a.box;
      for (let y = y0; y <= y1; y += STEP) for (let x = x0; x <= x1; x += STEP) if (a.has(x, y)) a.cells.set(`${Math.round(x)},${Math.round(y)}`, false);
      a.done = 0;
      a.dabs = [];
    }
    this.tick = 0;
    this.hintT = 0;
  }

  setProduct(p) { this.product = p; }
  setColor(c) {
    this.color[this.product] = c;
    // recolour what is already on, so trying shades is instant
    for (const d of this.areas[this.product].dabs) d.c = c;
  }

  coverage(name) { const a = this.areas[name]; return a.cells.size ? a.done / a.cells.size : 1; }
  get progress() { return (this.coverage('lips') + this.coverage('blush') + this.coverage('shadow')) / 3; }
  get ready() { return ['lips', 'blush', 'shadow'].every((n) => this.coverage(n) >= 0.8); }
  score() { return Math.round(this.progress * 100); }

  dab(x, y) {
    const a = this.areas[this.product];
    const r = this.product === 'lips' ? 13 : this.product === 'blush' ? 30 : 15;
    const [x0, y0, x1, y1] = a.box;
    if (x < x0 - r || x > x1 + r || y < y0 - r || y > y1 + r) {
      if (this.hintT <= 0) {
        this.hintT = 1.5;
        this.G.fx.text(x, y - 30, { lips: 'lipstick goes on the lips', blush: 'blush goes on the cheeks', shadow: 'shadow goes on the eyelids' }[this.product], '#ffe7a8', 15);
      }
      return;
    }
    a.dabs.push({ x, y, r, c: this.color[this.product] });
    if (a.dabs.length > 260) a.dabs.shift();
    for (const [key, on] of a.cells) {
      if (on) continue;
      const [cx, cy] = key.split(',').map(Number);
      if ((cx - x) ** 2 + (cy - y) ** 2 < (r + 3) ** 2) { a.cells.set(key, true); a.done++; }
    }
    if (++this.tick % 5 === 0) { audio.wipe(0.3); buzz('light'); }
  }

  down(id, x, y) { this.dab(x, y); }
  move(id, x, y, px, py) {
    const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i <= n; i++) this.dab(px + (x - px) * i / n, py + (y - py) * i / n);
  }
  up() {}
  update(dt) { this.hintT = Math.max(0, this.hintT - dt); }

  draw(ctx) {
    for (const name of ['blush', 'shadow', 'lips']) {
      const a = this.areas[name];
      if (!a.dabs.length) continue;
      ctx.save();
      if (name === 'lips') ctx.clip(a.path);
      if (name === 'lips') {
        // lipstick is a stain, not paint: the lip's own creases and shape show through it
        ctx.globalAlpha = 0.74;
        for (const d of a.dabs) { ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
        const b = a.box, cov = this.coverage('lips'), bw = b[2] - b[0], bh = b[3] - b[1], mx = (b[0] + b[2]) / 2, seamY = b[1] + bh * 0.36;
        if (cov > 0.4) {
          ctx.globalAlpha = Math.min(1, (cov - 0.4) / 0.4);
          // the upper lip turns away from the light, the lower one catches it
          const sh = ctx.createLinearGradient(0, b[1], 0, b[3]);
          sh.addColorStop(0, 'rgba(30,0,10,0.3)'); sh.addColorStop(0.36, 'rgba(30,0,10,0.16)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(30,0,10,0.14)');
          ctx.fillStyle = sh; ctx.fillRect(b[0], b[1], bw, bh);
          ctx.strokeStyle = 'rgba(50,8,18,0.5)'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(b[0], seamY - 1);
          ctx.quadraticCurveTo(mx - bw * 0.25, seamY - 2, mx - bw * 0.07, seamY + 1.5);
          ctx.quadraticCurveTo(mx, seamY + 3, mx + bw * 0.07, seamY + 1.5);
          ctx.quadraticCurveTo(mx + bw * 0.25, seamY - 2, b[2], seamY - 1);
          ctx.stroke();
          // gloss: a soft pool of light on the fullest part of the lower lip, and a glint on the bow
          const gy = b[1] + bh * 0.66, gr = bw * 0.24;
          ctx.save(); ctx.translate(mx - bw * 0.04, gy); ctx.scale(1, 0.28);
          const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
          gg.addColorStop(0, 'rgba(255,255,255,0.6)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath(); ctx.ellipse(mx, b[1] + bh * 0.16, bw * 0.05, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        // soft, buildable powder
        // powder has no edge: each dab fades the further it lands from the middle of the cheek or lid
        const ells = name === 'blush' ? this.G.geo.cheeks : this.G.geo.lids;
        for (const d of a.dabs) {
          let e = 9;
          for (const q of ells) e = Math.min(e, ((d.x - q.x) / q.rx) ** 2 + ((d.y - q.y) / q.ry) ** 2);
          const k = Math.max(0, Math.min(1, 1.15 - e));
          if (k <= 0) continue;
          const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
          g.addColorStop(0, hexA(d.c, (name === 'blush' ? 0.075 : 0.2) * k));
          g.addColorStop(1, hexA(d.c, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    // show where the current product goes until it is mostly on
    const cur = this.areas[this.product];
    if (this.coverage(this.product) < 0.8) {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(this.G.time * 6)})`;
      ctx.stroke(cur.path);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- haircut
export class Haircut {
  constructor(G) {
    this.G = G;
    const g = G.geo;
    this.hair = G.look.hair;
    this.tol = 14 + 7 * (((G.salonLv && G.salonLv.chair) || 1) - 1);   // how close to the line counts
    this.y0 = g.hairlineY - 8;                 // where the fringe hangs from
    this.target = g.browY - 10;                // the line to cut to: just above the brows
    this.locks = [];
    const n = 13, span = g.hw * 1.62;
    for (let i = 0; i < n; i++) {
      const x = g.cx - span / 2 + (i + 0.5) * (span / n);
      this.locks.push({ x, w: span / n, len: this.target - this.y0 + 45 + Math.random() * 120, seed: Math.random() * 9, cut: false });
    }
    this.bits = [];
    this.snip = { x: g.cx, y: this.target, t: 0, show: false };
  }

  end(l) { return this.y0 + l.len; }
  ok(l) { return this.end(l) <= this.target + this.tol; }
  get progress() { return this.locks.filter((l) => this.ok(l)).length / this.locks.length; }
  get ready() { return this.progress >= 1; }
  /** 100 for every lock cut right on the line; too short hurts more than too long. */
  score() {
    let s = 0;
    for (const l of this.locks) {
      const d = this.end(l) - this.target;
      const e = Math.max(0, Math.abs(d) - (this.tol - 14));      // better scissors forgive more
      s += Math.max(0, 100 - (d < 0 ? e * 4 : e * 2.5));
    }
    return Math.round(s / this.locks.length);
  }

  down(id, x, y) { this.snip = { x, y, t: 0, show: true }; }
  move(id, x, y, px, py) {
    this.snip.x = x; this.snip.y = y; this.snip.show = true;
    for (const l of this.locks) {
      // the blades crossed this lock
      if ((px - l.x) * (x - l.x) > 0 && Math.abs(x - l.x) > l.w * 0.5) continue;
      if (y < this.y0 + 12 || y > this.end(l) - 4) continue;
      this.bits.push({ x: l.x, y, len: this.end(l) - y, w: l.w, vy: 40, vx: (Math.random() - 0.5) * 60, rot: 0, vr: (Math.random() - 0.5) * 5, t: 0 });
      l.len = y - this.y0;
      l.cut = true;
      this.snip.t = 0.12;
      audio.snip();
      buzz('light');
      if (this.end(l) < this.target - this.tol) this.G.fx.text(l.x, y - 16, 'too short!', '#ff6b78', 15);
      else if (this.ok(l)) this.G.fx.text(l.x, y - 16, 'nice', '#8dffa8', 14);
    }
  }
  up() { this.snip.show = false; }

  update(dt) {
    this.snip.t = Math.max(0, this.snip.t - dt);
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt; b.vy += 700 * dt; b.y += b.vy * dt; b.x += b.vx * dt; b.rot += b.vr * dt;
      if (b.t > 1.4) this.bits.splice(i, 1);
    }
  }

  strands(ctx, x, w, yTop, yEnd, seed) {
    const t = this.G.time;
    for (let k = 0; k < 11; k++) {
      const off = (k / 10 - 0.5) * w * 0.98;
      const sway = Math.sin(t * 1.3 + seed + k) * 1.5;
      ctx.strokeStyle = k % 4 === 0 ? 'rgba(255,255,255,0.16)' : k % 2 ? this.hair : 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.moveTo(x + off, yTop);
      ctx.quadraticCurveTo(x + off + Math.sin(seed + k) * 5, (yTop + yEnd) / 2, x + off * 0.8 + sway, yEnd - (k % 3) * 3);
      ctx.stroke();
    }
  }

  draw(ctx) {
    const g = this.G.geo;
    ctx.lineCap = 'round';
    for (const l of this.locks) {
      // body of the lock, then individual strands on top
      ctx.lineCap = 'butt';            // locks sit flush side by side, like one fringe
      ctx.strokeStyle = this.hair;
      ctx.lineWidth = l.w * 1.02;
      ctx.beginPath(); ctx.moveTo(l.x, this.y0 - 6); ctx.lineTo(l.x, this.end(l) - 6); ctx.stroke();
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3;
      this.strands(ctx, l.x, l.w, this.y0 - 6, this.end(l), l.seed);
    }
    for (const b of this.bits) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - b.t / 1.4);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.strokeStyle = this.hair;
      ctx.lineWidth = b.w * 0.9;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, b.len - 5); ctx.stroke();
      ctx.restore();
    }
    // the line to cut along
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(g.cx - g.hw * 0.95, this.target); ctx.lineTo(g.cx + g.hw * 0.95, this.target); ctx.stroke();
    ctx.restore();
    // scissors under the finger, snapping shut on each cut
    if (this.snip.show) {
      const open = this.snip.t > 0 ? 0.08 : 0.45;
      ctx.save();
      ctx.translate(this.snip.x, this.snip.y);
      for (const d of [-1, 1]) {
        ctx.save();
        ctx.rotate(d * open);
        ctx.strokeStyle = '#d7dbe2'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(26, 0); ctx.stroke();
        ctx.strokeStyle = '#7b61ff'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(34, d * 7, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#8a8f99';
      ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

function boxOf(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of list) { x0 = Math.min(x0, e.x - e.rx); y0 = Math.min(y0, e.y - e.ry); x1 = Math.max(x1, e.x + e.rx); y1 = Math.max(y1, e.y + e.ry); }
  return [x0, y0, x1, y1];
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
