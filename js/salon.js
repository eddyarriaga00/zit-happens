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
    // each product is laid down once per spot, so going over one cheek again and again never pushes
    // the first strokes (or the other cheek) out of the picture
    const gap = r * (this.product === 'shadow' ? 0.5 : this.product === 'lips' ? 0.4 : 0.25);
    const near = a.dabs.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < gap * gap);
    if (!near) a.dabs.push({ x, y, r, c: this.color[this.product] });
    if (a.dabs.length > 420) a.dabs.shift();
    for (const [key, on] of a.cells) {
      if (on) continue;
      const [cx, cy] = key.split(',').map(Number);
      if ((cx - x) ** 2 + (cy - y) ** 2 < (r + 3) ** 2) { a.cells.set(key, true); a.done++; }
    }
    if (++this.tick % 5 === 0) { audio.wipe(0.3); buzz('light'); }
  }

  down(id, x, y) { this.hand = { x, y }; this.dab(x, y); }
  move(id, x, y, px, py) {
    this.hand = { x, y };
    const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 6));
    for (let i = 1; i <= n; i++) this.dab(px + (x - px) * i / n, py + (y - py) * i / n);
  }
  up() { this.hand = null; }
  update(dt) { this.hintT = Math.max(0, this.hintT - dt); }

  /** What you are holding: a lipstick, a fluffy blush brush or a small shadow brush, tip at the finger. */
  applicator(ctx, x, y) {
    const col = this.color[this.product];
    const lg = (x0, x1, stops) => { const g = ctx.createLinearGradient(x0, 0, x1, 0); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(0.62);                       // comes in from the upper right, clear of the finger
    if (this.product === 'lips') {
      ctx.fillStyle = 'rgba(30,15,15,0.2)'; ctx.beginPath(); ctx.roundRect(-7, -70, 20, 62, 4); ctx.fill();
      ctx.fillStyle = col;                                                                   // the bullet, cut on a slant
      ctx.beginPath(); ctx.moveTo(-6, -16); ctx.lineTo(-6, -6); ctx.quadraticCurveTo(-5, 0, 2, 1); ctx.lineTo(6, -8); ctx.lineTo(6, -16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.roundRect(-4, -15, 2.5, 11, 1); ctx.fill();
      ctx.fillStyle = lg(-8, 8, [[0, '#b98f2f'], [0.3, '#fbe6a2'], [0.6, '#e9c46a'], [1, '#9c7422']]);
      ctx.beginPath(); ctx.roundRect(-8, -30, 16, 15, 2); ctx.fill();                          // gold collar
      ctx.fillStyle = lg(-9, 9, [[0, '#3a3f49'], [0.35, '#5d646f'], [1, '#15171c']]);
      ctx.beginPath(); ctx.roundRect(-9, -72, 18, 43, 3); ctx.fill();                          // the case
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-6, -68, 2.5, 34);
    } else {
      const big = this.product === 'blush', hw2 = big ? 15 : 6, len = big ? 30 : 15;
      ctx.fillStyle = 'rgba(30,15,15,0.18)'; ctx.beginPath(); ctx.roundRect(-1, -104, 9, 100, 4); ctx.fill();
      // bristles: a soft dome dusted with the colour at the tip
      const bg = ctx.createLinearGradient(0, -len, 0, 2);
      bg.addColorStop(0, '#5b4636'); bg.addColorStop(0.55, '#8a6c56'); bg.addColorStop(1, col);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(-hw2 * 0.55, -len); ctx.quadraticCurveTo(-hw2 * 1.25, -len * 0.3, -hw2 * 0.5, 0); ctx.quadraticCurveTo(0, big ? 5 : 3, hw2 * 0.5, 0); ctx.quadraticCurveTo(hw2 * 1.25, -len * 0.3, hw2 * 0.55, -len); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,25,15,0.25)'; ctx.lineWidth = 0.6;
      for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * hw2 * 0.16, -len); ctx.quadraticCurveTo(k * hw2 * 0.34, -len * 0.4, k * hw2 * 0.16, 0); ctx.stroke(); }
      ctx.fillStyle = lg(-hw2 * 0.6, hw2 * 0.6, [[0, '#f4f6f9'], [0.45, '#aeb7c3'], [1, '#6b7482']]);
      ctx.beginPath(); ctx.roundRect(-hw2 * 0.6, -len - 12, hw2 * 1.2, 13, 2); ctx.fill();     // steel ferrule
      ctx.fillStyle = lg(-4, 4, [[0, '#4a4f59'], [0.4, '#262a31'], [1, '#111317']]);
      ctx.beginPath(); ctx.moveTo(-hw2 * 0.5, -len - 11); ctx.lineTo(hw2 * 0.5, -len - 11); ctx.lineTo(2.2, -len - 78); ctx.lineTo(-2.2, -len - 78); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    for (const name of ['blush', 'shadow', 'lips']) {
      const a = this.areas[name];
      if (!a.dabs.length) continue;
      ctx.save();
      if (name === 'lips') ctx.clip(a.path);
      // eyeshadow goes on the closed lid; once her eyes are open it only shows above them
      if (name === 'shadow' && (this.G.lidK || 0) < 0.6 && this.G.geo.eyePaths) {
        const hole = new Path2D();
        hole.rect(0, 0, this.G.W, this.G.H);
        for (const ep of this.G.geo.eyePaths) hole.addPath(ep);
        ctx.clip(hole, 'evenodd');
      }
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
          g.addColorStop(0, hexA(d.c, (name === 'blush' ? 0.06 : 0.2) * k));
          g.addColorStop(1, hexA(d.c, 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    if (this.hand) this.applicator(ctx, this.hand.x, this.hand.y);
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
    this.y0 = g.hairlineY - (g.own ? 30 : 8);  // where the fringe hangs from (up inside her painted hair, so its top is lost in it)
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

  /** A strip of her own painted hair to make the fringe from, once that painting is in. */
  swatch() {
    const key = this.hair + (this.G.look && this.G.look.wet ? 'w' : '');
    if (this.sw && this.swKey === key) return this.sw;
    const sw = this.G.hairSwatch ? this.G.hairSwatch(this.hair) : null;
    if (sw) { this.sw = sw; this.swKey = key; }
    return sw;
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
      // each lock is a ribbon of hair: dark at the root, lit across the middle, and ending either
      // in a wispy point (uncut) or a clean blunt edge with a little texture (cut)
      const top = this.y0 - 6, end = this.end(l) - 4, hw2 = l.w * 0.52, x = l.x;
      ctx.beginPath();
      ctx.moveTo(x - hw2, top); ctx.lineTo(x + hw2, top);
      if (l.cut) {
        ctx.lineTo(x + hw2, end - 2);
        for (let k = 4; k >= -4; k--) ctx.lineTo(x + hw2 * k / 4, end + ((k + Math.floor(l.seed * 3)) % 2 ? 1.6 : -1));
        ctx.lineTo(x - hw2, end - 2);
      } else {
        ctx.quadraticCurveTo(x + hw2 * 1.05, top + (end - top) * 0.75, x + Math.sin(l.seed) * hw2 * 0.5, end + 6);
        ctx.quadraticCurveTo(x - hw2 * 1.05, top + (end - top) * 0.75, x - hw2, top);
      }
      ctx.closePath();
      ctx.fillStyle = this.hair; ctx.fill();
      const sw = this.swatch();
      if (sw) {
        // painted hair: each lock shows its own slice of the strip, so no two look the same
        const part = sw.sw * 0.5, off = (l.seed / 9) * (sw.sw - part);
        ctx.save(); ctx.clip();
        ctx.drawImage(sw.canvas, sw.sx + off, sw.sy, part, sw.sh, x - hw2 - 1, top, l.w * 1.04 + 2, Math.max(60, end - top + 10));
        ctx.restore();
      }
      const lg = ctx.createLinearGradient(0, top, 0, end);
      lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.1, 'rgba(0,0,0,0.14)'); lg.addColorStop(0.25, 'rgba(0,0,0,0.04)'); lg.addColorStop(0.42, 'rgba(255,255,255,0.14)'); lg.addColorStop(0.6, 'rgba(0,0,0,0.02)'); lg.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = lg; ctx.fill();
      const sg = ctx.createLinearGradient(x - hw2, 0, x + hw2, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0.16)'); sg.addColorStop(0.3, 'rgba(0,0,0,0)'); sg.addColorStop(0.7, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = sg; ctx.fill();
      ctx.lineWidth = 1;
      if (!sw) this.strands(ctx, l.x, l.w, top, this.end(l) - (l.cut ? 3 : 0), l.seed);
    }
    for (const b of this.bits) {
      // the offcut: a little tuft tumbling away
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - b.t / 1.4);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      const bl = Math.max(6, b.len - 5), bw = b.w * 0.45;
      ctx.fillStyle = this.hair;
      ctx.beginPath(); ctx.moveTo(-bw, 0); ctx.lineTo(bw, 0); ctx.quadraticCurveTo(bw, bl * 0.7, 0, bl); ctx.quadraticCurveTo(-bw, bl * 0.7, -bw, 0); ctx.fill();
      const bs = this.swatch();
      if (bs) { ctx.save(); ctx.clip(); ctx.drawImage(bs.canvas, bs.sx, bs.sy + bs.sh * 0.5, bs.sw * 0.3, bs.sh * 0.3, -bw - 1, 0, bw * 2 + 2, bl + 2); ctx.restore(); }
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8;
      for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(bw * k, 1); ctx.lineTo(bw * k * 0.4, bl - 2); ctx.stroke(); }
      ctx.restore();
    }
    // the line to cut along, until the fringe is done
    if (!this.ready) {
      ctx.save();
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.moveTo(g.cx - g.hw * 0.95, this.target); ctx.lineTo(g.cx + g.hw * 0.95, this.target); ctx.stroke();
      ctx.restore();
    }
    // scissors under the finger, snapping shut on each cut
    if (this.snip.show) {
      const open = this.snip.t > 0 ? 0.08 : 0.45;
      ctx.save();
      ctx.translate(this.snip.x, this.snip.y);
      for (const d of [-1, 1]) {
        // a steel blade tapering to a point, with a black finger ring behind the pivot
        ctx.save();
        ctx.rotate(d * open);
        ctx.fillStyle = 'rgba(30,15,15,0.22)';
        ctx.beginPath(); ctx.moveTo(-40, 5); ctx.lineTo(-2, 6); ctx.lineTo(-2, 9); ctx.closePath(); ctx.fill();
        const bg = ctx.createLinearGradient(0, -4, 0, 4);
        bg.addColorStop(0, '#f4f6f9'); bg.addColorStop(0.5, '#aeb7c3'); bg.addColorStop(1, '#6b7482');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.moveTo(-42, d * 0.5); ctx.lineTo(-4, -3.2); ctx.lineTo(20, -2.4); ctx.lineTo(20, 2.4); ctx.lineTo(-4, 3.2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-38, d * 0.3 - 0.8); ctx.lineTo(16, -1.6); ctx.stroke();
        ctx.strokeStyle = '#22252b'; ctx.lineWidth = 4.5;
        ctx.beginPath(); ctx.ellipse(31, d * 7, 10, 7.5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(31, d * 7, 10, 7.5, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
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
