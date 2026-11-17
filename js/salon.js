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
      shadow: { path: many(this.lidEll()), has: (x, y) => this.lidEll().some((e) => inEll(e, x, y)), box: boxOf(this.lidEll()) },
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

  /** Half-height of her open eye (from the distance between her eyes, which fits every painting). */
  eyeOpen() { const e = this.G.geo.eyes; return Math.abs(e[1].x - e[0].x) * 0.085; }
  /** Her eyelids: from the lash line up to just under the brow. */
  lidEll() {
    const g = this.G.geo, ed = Math.abs(g.eyes[1].x - g.eyes[0].x);
    return g.photo ? g.eyes.map((e) => ({ x: e.x, y: e.y - ed * 0.07, rx: ed * 0.3, ry: ed * 0.1 })) : g.lids;
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
    const G = this.G, g = G.geo, dpr = G.dpr || 2;
    // each product is laid down on its own layer, then blended into the painting the way real
    // make-up sits on skin: the colour soaks in and her own lip lines, shading and texture show through
    if (!this.layer || this.layer.width !== Math.round(G.W * dpr)) { this.layer = document.createElement('canvas'); this.layer.width = Math.round(G.W * dpr); this.layer.height = Math.round(G.H * dpr); }
    const L = this.layer, x = L.getContext('2d');
    for (const name of ['blush', 'shadow', 'lips']) {
      const a = this.areas[name];
      if (!a.dabs.length) continue;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, L.width, L.height); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      if (name === 'lips') {
        for (const d of a.dabs) { x.fillStyle = d.c; x.beginPath(); x.arc(d.x, d.y, d.r, 0, Math.PI * 2); x.fill(); }
        x.globalCompositeOperation = 'destination-in';
        if (g.lipsMask) { x.imageSmoothingQuality = 'high'; x.drawImage(g.lipsMask.canvas, 0, 0, g.lipsMask.w, g.lipsMask.h); } else x.fill(a.path);
      } else {
        // powder has no edge: each dab fades the further it lands from the middle of the cheek or lid
        const ells = name === 'blush' ? g.cheeks : this.lidEll();
        for (const d of a.dabs) {
          let e = 9;
          for (const q of ells) e = Math.min(e, ((d.x - q.x) / q.rx) ** 2 + ((d.y - q.y) / q.ry) ** 2);
          const k = Math.max(0, Math.min(1, 1.15 - e));
          if (k <= 0) continue;
          const gr = x.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
          gr.addColorStop(0, hexA(d.c, (name === 'blush' ? 0.11 : 0.34) * k));
          gr.addColorStop(1, hexA(d.c, 0));
          x.fillStyle = gr;
          x.beginPath(); x.arc(d.x, d.y, d.r, 0, Math.PI * 2); x.fill();
        }
        // eyeshadow goes on the closed lid; once her eyes are open it only shows above them
        if (name === 'shadow' && (G.lidK || 0) < 0.6) {
          x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
          for (const e of g.eyes) { x.beginPath(); x.ellipse(e.x, e.y + this.eyeOpen() * 0.1, this.eyeOpen() * 0.27 / 0.1, this.eyeOpen(), 0, 0, Math.PI * 2); x.fill(); }
        }
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (name === 'lips') {
        // the shade's colour, with the lips' own light and dark kept, then a touch of depth
        ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.85; ctx.drawImage(L, 0, 0);
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.45; ctx.drawImage(L, 0, 0);
        ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.35; ctx.drawImage(L, 0, 0);
      } else {
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.drawImage(L, 0, 0);
        ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.6; ctx.drawImage(L, 0, 0);
      }
      ctx.restore();
    }
    if (this.hand) this.applicator(ctx, this.hand.x, this.hand.y);
    // show where the current product goes until it is mostly on
    const cur = this.areas[this.product];
    if (this.coverage(this.product) < 0.8) {
      // a soft glow where it goes, not a dashed line
      const p = 0.5 + 0.5 * Math.sin(this.G.time * 4);
      ctx.save();
      ctx.fillStyle = `rgba(255,240,250,${0.08 + 0.08 * p})`; ctx.fill(cur.path);
      ctx.shadowColor = 'rgba(255,200,230,0.9)'; ctx.shadowBlur = 10;
      ctx.lineWidth = 1.2; ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.25 * p})`;
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
    this.y0 = g.hairlineY - (g.own ? 44 : 8);  // where the fringe hangs from (up inside her painted hair, so its top is lost in it)
    this.target = g.browY - 10;                // the line to cut to: just above the brows
    this.locks = [];
    const n = g.own ? 16 : 13, span = g.hw * (g.own ? 1.5 : 1.62);
    for (let i = 0; i < n; i++) {
      const x = g.cx - span / 2 + (i + 0.5) * (span / n);
      const u = (x - g.cx) / (span / 2);
      // a fringe falls from the crown: longer in the middle, curving toward the temples
      this.locks.push({ x, u, w: span / n, len: this.target - this.y0 + 22 + Math.random() * 34 + (1 - u * u) * 14 - u * u * 18, seed: Math.random() * 9, cut: false });
    }
    this.bits = [];
    this.snip = { x: g.cx, y: this.target, t: 0, show: false };
    if (g.own && G.hairLayer) this.setupEnds();
  }

  /** On her painted hair the job is a trim: the lengths hanging past her shoulders are cut level at
   *  a line. Where hair is cut away, her bare neck and shoulders show, taken from her own painting
   *  with her hair up. False (and the fringe instead) when there are no lengths to trim. */
  setupEnds() {
    const G = this.G, g = G.geo, own = g.own;
    const behind = G.hairLayer('bun', this.hair) || G.hairLayer('short', this.hair);
    if (!own || !behind) return false;
    const toImg = (x, y) => [Math.floor((x - own.ox) / own.sk / 2), Math.floor((y - own.oy) / own.sk / 2)];
    const isHair = (x, y) => { const [ix, iy] = toImg(x, y); return ix >= 0 && iy >= 0 && ix < own.HW && iy < own.HH && own.hairA[iy * own.HW + ix] > 170; };
    const bottom = G.H - G.safeBottom - 120;
    const line = Math.min(bottom - 50, g.cy + g.hh * 1.12);
    // the hair crossing the line, cut into narrow locks
    const cols = [];
    for (let x = 4; x < G.W - 4; x += 3) {
      let below = 0;
      for (let y = line; y < bottom; y += 6) if (isHair(x, y)) below++;
      if (isHair(x, line) && below >= 3) cols.push(x);
    }
    if (cols.length < 8) return false;
    const locks = [];
    let start = cols[0], prev = cols[0];
    const flush = () => { for (let x = start; x < prev; x += 14) locks.push({ x: Math.min(prev, x + 7), w: Math.min(14, prev - x + 3), cut: false, cutY: null, seed: Math.random() * 9 }); };
    for (const x of cols.slice(1)) { if (x - prev > 6) { flush(); start = x; } prev = x; }
    flush();
    if (locks.length < 3) return false;
    this.ends = { behind, line, bottom };
    this.style = G.look.style;
    this.locks = locks;
    this.target = line;
    this.tol = 16 + 7 * (((G.salonLv && G.salonLv.chair) || 1) - 1);
    // where her hair is, as a soft mask over the screen (the cut only ever reveals what was under hair)
    const dpr = G.dpr || 2, m = document.createElement('canvas');
    m.width = Math.round(G.W * dpr); m.height = Math.round(G.H * dpr);
    const mc = document.createElement('canvas'); mc.width = own.HW; mc.height = own.HH;
    const mq = mc.getContext('2d'), md = mq.createImageData(own.HW, own.HH);
    for (let i = 0; i < own.HW * own.HH; i++) { md.data[i * 4 + 3] = own.hairA[i]; }
    mq.putImageData(md, 0, 0);
    const mx = m.getContext('2d'); mx.setTransform(dpr, 0, 0, dpr, 0, 0); mx.imageSmoothingQuality = 'high';
    mx.drawImage(mc, own.ox, own.oy, own.HW * 2 * own.sk, own.HH * 2 * own.sk);
    this.ends.mask = m;
    return true;
  }

  /** A strip of her own painted hair to make the fringe from, once that painting is in. */
  swatch() {
    const key = this.hair + (this.G.look && this.G.look.wet ? 'w' : '');
    if (this.sw && this.swKey === key) return this.sw;
    const sw = this.G.hairSwatch ? this.G.hairSwatch(this.hair) : null;
    if (sw) { this.sw = sw; this.swKey = key; }
    return sw;
  }

  end(l) { return this.ends ? (l.cut ? l.cutY : this.ends.bottom + 40) : this.y0 + l.len; }
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
    if (this.ends) return this.cutEnds(x, y, px, py);
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

  cutEnds(x, y, px, py) {
    const E = this.ends;
    for (const l of this.locks) {
      if (Math.min(px, x) > l.x + l.w / 2 || Math.max(px, x) < l.x - l.w / 2) continue;      // the blades crossed this lock
      if (y < E.line - 90 || y > E.bottom - 4 || (l.cut && y >= l.cutY - 2)) continue;
      this.bits.push({ x: l.x, y, len: Math.min(90, (l.cut ? l.cutY : E.bottom) - y), w: l.w, vy: 40, vx: (Math.random() - 0.5) * 60, rot: 0, vr: (Math.random() - 0.5) * 5, t: 0 });
      l.cut = true; l.cutY = y;
      this.snip.t = 0.12;
      audio.snip();
      buzz('light');
      if (y < this.target - this.tol) this.G.fx.text(l.x, y - 16, 'too short!', '#ff6b78', 15);
      else if (this.ok(l)) this.G.fx.text(l.x, y - 16, 'nice', '#8dffa8', 14);
    }
  }

  /** The trimmed ends: where hair was cut away, her bare neck and shoulders (and the salon) show. */
  drawEnds(ctx) {
    const G = this.G, E = this.ends, g = G.geo, dpr = G.dpr || 2;
    if (G.look.style !== this.style) return;           // restyled since: the new painting has its own length
    if (this.locks.some((l) => l.cut)) {
      if (!E.layer) { E.layer = document.createElement('canvas'); E.layer.width = E.mask.width; E.layer.height = E.mask.height; }
      const x = E.layer.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, E.layer.width, E.layer.height); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.save();
      x.beginPath();
      for (const l of this.locks) if (l.cut) x.rect(l.x - l.w / 2 - 0.6, l.cutY, l.w + 1.2, G.H - l.cutY);
      x.clip();
      if (g.room) x.drawImage(g.room, 0, 0, G.W, G.H);
      const b = E.behind, f = b.fit, ex = g.eyes, sw2 = b.canvas.width, sh2 = b.canvas.height;
      const sk = (ex[1].x - ex[0].x) / ((f[2] - f[1]) * sw2), ox = g.cx - (f[1] + f[2]) / 2 * sw2 * sk, oy = ex[0].y - f[0] * sh2 * sk;
      x.drawImage(b.canvas, ox, oy, sw2 * sk, sh2 * sk);
      x.restore();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(E.mask, 0, 0);
      x.globalCompositeOperation = 'source-over';
      ctx.drawImage(E.layer, 0, 0, E.layer.width, E.layer.height, 0, 0, G.W, G.H);
      // a fresh, blunt edge on each cut lock
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const l of this.locks) if (l.cut) { ctx.moveTo(l.x - l.w / 2, l.cutY + 0.5); ctx.lineTo(l.x + l.w / 2, l.cutY + 0.5); }
      ctx.stroke();
    }
    if (!this.ready) {
      ctx.save();
      ctx.setLineDash([9, 7]); ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 3;
      // one dashed line across each run of hair
      let runStart = this.locks[0], prev = this.locks[0];
      const seg = (a, b) => { ctx.beginPath(); ctx.moveTo(a.x - a.w / 2 - 6, E.line); ctx.lineTo(b.x + b.w / 2 + 6, E.line); ctx.stroke(); };
      for (const l of this.locks.slice(1)) { if (l.x - prev.x > 20) { seg(runStart, prev); runStart = l; } prev = l; }
      seg(runStart, prev);
      ctx.restore();
    }
  }

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

  /** Where a lock starts: high up inside her hair, following the curve of her head. */
  rootY(l) { return this.y0 + (l.u || 0) ** 2 * 26; }

  /** One lock as a shape: wide at the root, narrowing, ending in a soft point or a blunt cut. */
  lockPath(l, k = 1) {
    const top = this.rootY(l) - 10, end = this.end(l), w = l.w * 0.95 * k, lean = (l.u || 0) * 0.16;
    const p = new Path2D();
    const tipX = l.x + lean * (end - top) + Math.sin(l.seed) * 2;
    p.moveTo(l.x - w, top);
    p.lineTo(l.x + w, top);
    if (l.cut) {
      // a blunt, freshly cut end with a little texture
      p.quadraticCurveTo(l.x + w * 0.95 + lean * (end - top) * 0.5, (top + end) / 2, tipX + w * 0.72, end - 1);
      for (let i = 3; i >= -3; i--) p.lineTo(tipX + w * 0.72 * i / 3, end + ((i + Math.floor(l.seed * 3)) % 2 ? 1.5 : -1));
      p.quadraticCurveTo(l.x - w * 0.95 + lean * (end - top) * 0.5, (top + end) / 2, l.x - w, top);
    } else {
      // uncut: tapers into a few wispy points
      p.quadraticCurveTo(l.x + w * 0.9 + lean * (end - top) * 0.5, top + (end - top) * 0.6, tipX + w * 0.35, end - 8);
      p.lineTo(tipX + w * 0.2, end - 2); p.lineTo(tipX, end + 4); p.lineTo(tipX - w * 0.25, end - 3); p.lineTo(tipX - w * 0.4, end - 9);
      p.quadraticCurveTo(l.x - w * 0.9 + lean * (end - top) * 0.5, top + (end - top) * 0.6, l.x - w, top);
    }
    p.closePath();
    return p;
  }

  draw(ctx) {
    const g = this.G.geo, G = this.G, dpr = G.dpr || 2;
    ctx.lineCap = 'round';
    if (this.ends) { this.drawEnds(ctx); this.drawBitsAndScissors(ctx); return; }
    const sw = this.swatch();
    // the whole fringe is drawn on its own layer first, so it can melt into her hair at the top
    if (!this.layer || this.layer.width !== Math.round(G.W * dpr) || this.layer.height !== Math.round(G.H * dpr)) {
      this.layer = document.createElement('canvas'); this.layer.width = Math.round(G.W * dpr); this.layer.height = Math.round(G.H * dpr);
    }
    const L = this.layer, x = L.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, L.width, L.height); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = 'source-over';
    // one continuous sheet of hair: its top is lost in her hair, its bottom edge is each lock's
    // length, pointed and wispy where uncut and blunt where the scissors went through
    const locks = this.locks, w0 = locks[0].w, xL = locks[0].x - w0 * 0.6, xR = locks[locks.length - 1].x + w0 * 0.6;
    const edge = (px) => {
      let best = locks[0], bd = 1e9;
      for (const l of locks) { const d = Math.abs(px - l.x); if (d < bd) { bd = d; best = l; } }
      const t = (px - best.x) / (best.w / 2);                                   // -1..1 across the lock
      return best.cut ? this.end(best) + Math.sin(px * 1.7 + best.seed) * 0.9 : this.end(best) - 5 * Math.min(1, Math.abs(t)) ** 1.6 + Math.sin(px * 1.3 + best.seed) * 2.5;
    };
    const sheet = new Path2D();
    sheet.moveTo(xL, this.rootY(locks[0]) - 12);
    for (let px = xL; px <= xR; px += 4) sheet.lineTo(px, this.y0 + ((px - g.cx) / (xR - xL) * 2) ** 2 * 26 - 12);
    for (let px = xR; px >= xL; px -= 1.5) sheet.lineTo(px, edge(px));
    sheet.closePath();
    const hv = parseInt((this.hair || '#3a2618').slice(1), 16), hr = hv >> 16, hg = (hv >> 8) & 255, hb = hv & 255;
    const shade = (k, a = 1) => `rgba(${Math.round(Math.min(255, hr * k))},${Math.round(Math.min(255, hg * k))},${Math.round(Math.min(255, hb * k))},${a})`;
    const wet = this.G.look && this.G.look.wet;
    const yMax = Math.max(...locks.map((l) => this.end(l))) + 6;
    x.save();
    x.clip(sheet);
    const bg = x.createLinearGradient(0, this.y0 - 12, 0, yMax);
    bg.addColorStop(0, shade(0.55)); bg.addColorStop(0.5, shade(wet ? 0.6 : 0.82)); bg.addColorStop(1, shade(wet ? 0.5 : 0.7));
    x.fillStyle = bg; x.fillRect(xL - 4, this.y0 - 40, xR - xL + 8, yMax - this.y0 + 50);
    // hundreds of fine strands in lighter and darker shades of her colour, falling from the crown
    x.lineCap = 'round';
    let seed = 7;
    const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const n = Math.round((xR - xL) * 3);
    for (let i = 0; i < n; i++) {
      const px = xL + R() * (xR - xL), u = (px - g.cx) / ((xR - xL) / 2), k = R();
      const y1 = edge(px) + 2, y0 = this.y0 + u * u * 26 - 14, lean = u * 0.16 * (y1 - y0);
      x.strokeStyle = k < 0.35 ? shade(0.5, 0.35) : k < 0.8 ? shade(wet ? 0.8 : 1.02, 0.32) : shade(wet ? 1.2 : 1.4, 0.4);
      x.lineWidth = 0.4 + R() * 0.6;
      x.beginPath(); x.moveTo(px - lean * 0.6, y0); x.quadraticCurveTo(px + (R() - 0.5) * 4, (y0 + y1) / 2, px + lean * 0.4, y1); x.stroke();
    }
    // a band of shine across the fringe, and shade where the pieces part
    const sy0 = this.y0 + 18, sh = x.createLinearGradient(0, sy0, 0, sy0 + 26);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, `rgba(255,255,255,${wet ? 0.28 : 0.16})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fillRect(xL, sy0, xR - xL, 26);
    for (const l of locks) {
      if (R() < 0.5) continue;
      const gx = l.x + l.w / 2, gg = x.createLinearGradient(gx - 3, 0, gx + 3, 0);
      gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(0.5, 'rgba(0,0,0,0.18)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gg; x.fillRect(gx - 3, this.y0 + 10, 6, yMax - this.y0);
    }
    x.restore();
    void sw;
    // melt into her hair: nothing at the very top, fully there a little way down
    x.globalCompositeOperation = 'destination-in';
    const fade = x.createLinearGradient(0, this.y0 - 6, 0, this.y0 + 58);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = fade; x.fillRect(0, 0, G.W, G.H);
    // and at each side, where the fringe runs back into the hair at her temples
    const sideL = this.locks[0].x - this.locks[0].w * 0.6, sideR = this.locks[this.locks.length - 1].x + this.locks[0].w * 0.6, fw = (sideR - sideL) * 0.12;
    const sf = x.createLinearGradient(sideL, 0, sideR, 0);
    sf.addColorStop(0, 'rgba(0,0,0,0)'); sf.addColorStop(fw / (sideR - sideL), 'rgba(0,0,0,1)'); sf.addColorStop(1 - fw / (sideR - sideL), 'rgba(0,0,0,1)'); sf.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sf; x.fillRect(0, 0, G.W, G.H);
    x.globalCompositeOperation = 'source-over';
    // the fringe casts a soft shadow on her forehead
    ctx.save();
    ctx.globalAlpha = 0.22; ctx.filter = 'none';
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(L, 0, 0, L.width, L.height, 1.5, 5, G.W, G.H);
    ctx.restore();
    ctx.drawImage(L, 0, 0, L.width, L.height, 0, 0, G.W, G.H);
    this.drawBitsAndScissors(ctx, true);
  }

  drawBitsAndScissors(ctx, fringe = false) {
    const g = this.G.geo;
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
    if (fringe && !this.ready) {
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
