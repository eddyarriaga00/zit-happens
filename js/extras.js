// Two close-up modes played on a zoomed-in part of the face: Pore Strip (nose) and Brows.
// Both follow the salon interface: down / move / up, update, draw, progress, ready, score().

import * as audio from './audio.js';
import { buzz } from './haptics.js';
import { drawTweezers } from './tools.js';
import { drawLids, drawMood } from './facescene.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const probe = document.createElement('canvas').getContext('2d');   // for point-in-path tests

/** A magnified view of the painted face, centred on one feature. */
class Zoom {
  constructor(G, fx, fy, k) {
    this.G = G; this.fx = fx; this.fy = fy; this.k = k;
    this.sx = G.W / 2;
    this.sy = (G.safeTop + 80 + G.H - G.safeBottom - 108) / 2;
  }
  toFace(x, y) { return [this.fx + (x - this.sx) / this.k, this.fy + (y - this.sy) / this.k]; }
  toScreen(x, y) { return [this.sx + (x - this.fx) * this.k, this.sy + (y - this.fy) * this.k]; }
  begin(ctx) {
    const G = this.G;
    ctx.save();
    ctx.translate(this.sx, this.sy);
    ctx.scale(this.k, this.k);
    ctx.translate(-this.fx, -this.fy);
    ctx.imageSmoothingQuality = 'high';
    if (G.skin) ctx.drawImage(G.skin, 0, 0, G.W, G.H);
    // she is alive in close-up too: blinking, wincing, smiling
    if (G.geo) { drawLids(ctx, G.geo, G.lidK || 0); drawMood(ctx, G.geo, G.moodK || 0); }
  }
}

// ---------------------------------------------------------------- pore strip
export class Strip {
  constructor(G, toast) {
    this.G = G; this.toast = toast;
    const g = G.geo;
    this.title = 'Pore Strip';
    this.statLabel = 'pores cleared';
    this.titles = ['', 'Half of them stayed', 'Nice and clear', 'So satisfying!'];
    this.intro = 'Rub the nose to wet it first 💧';
    this.cx = g.cx;
    this.y0 = g.cy + 0.03 * g.hh;
    this.y1 = g.cy + 0.365 * g.hh;
    this.a = 0.1 * g.hw;       // half width at the bridge
    this.b = 0.275 * g.hw;     // half width over the wings
    this.z = new Zoom(G, g.cx, (this.y0 + this.y1) / 2, clamp((0.6 * G.W) / (2 * this.b), 1.6, 2.7));
    const { cx, y0, y1, a, b } = this, ym = y0 + (y1 - y0) * 0.55, r = b * 0.3;
    const p = new Path2D();
    p.moveTo(cx - a, y0);
    p.lineTo(cx + a, y0);
    p.bezierCurveTo(cx + a * 1.1, ym, cx + b, ym - r, cx + b, y1 - r);
    p.quadraticCurveTo(cx + b, y1, cx + b - r, y1);
    p.lineTo(cx - b + r, y1);
    p.quadraticCurveTo(cx - b, y1, cx - b, y1 - r);
    p.bezierCurveTo(cx - b, ym - r, cx - a * 1.1, ym, cx - a, y0);
    p.closePath();
    this.path = p;
    const inside = (x, y) => probe.isPointInPath(p, x, y);
    this.cells = [];
    for (let y = y0; y <= y1; y += 4.5) for (let x = cx - b; x <= cx + b; x += 4.5) if (inside(x, y)) this.cells.push({ x, y, wet: false, press: false });
    this.plugs = [];
    const want = 30 + Math.floor(Math.random() * 12);
    for (let i = 0; i < 900 && this.plugs.length < want; i++) {
      const x = cx + rnd(-b, b), y = rnd(y0 + 3, y1 - 2);
      if (!inside(x, y) || !inside(x, y + 2) || this.plugs.some((q) => (q.x - x) ** 2 + (q.y - y) ** 2 < 9)) continue;
      this.plugs.push({ x, y, r: rnd(0.7, 1.5), state: 'in', lean: rnd(-0.5, 0.5) });
    }
    this.stage = 'wet';
    this.done = { wet: 0, press: 0 };
    this.drag = null;          // finger carrying the strip
    this.holding = 0;
    this.dry = 0;
    this.peel = 0;
    this.peelId = null;
    this.v = 0;
    this.ouches = 0;
    this.warnT = 0;
    this.showT = 0;
    this.t = 0;
    this.pops = [];            // little flecks as plugs come out
  }

  get out() { return this.plugs.filter((q) => q.state === 'out').length; }
  get progress() {
    const s = this.stage;
    return s === 'wet' ? this.frac('wet') : s === 'place' ? 0 : s === 'press' ? this.frac('press') : s === 'set' ? this.dry : this.peel;
  }
  frac(k) { return this.done[k] / this.cells.length; }
  get ready() { return this.stage === 'show' && this.showT > 1.1; }
  score() {
    if (this.stage !== 'show') return Math.round(this.out / this.plugs.length * 100);
    return clamp(Math.round(this.out / this.plugs.length * 100) - this.ouches * 4, 10, 100);
  }
  summary() { return `🧲 ${this.out} of ${this.plugs.length} plugs came out`; }
  label() {
    const pct = `${Math.round(this.progress * 100)}%`;
    return { wet: `1/5 Wet the nose ${pct}`, place: '2/5 Put the strip on', press: `3/5 Smooth it down ${pct}`, set: `4/5 Let it set ${pct}`, peel: `5/5 Peel ${pct}`, show: `${this.out} plugs out` }[this.stage];
  }
  hint() { return this.intro; }

  trayPos() { return [this.G.W / 2, this.G.H - this.G.safeBottom - 96]; }

  rub(x, y) {
    const key = this.stage === 'wet' ? 'wet' : 'press';
    const [fx, fy] = this.z.toFace(x, y), R = 10;
    let hit = 0;
    for (const c of this.cells) {
      if (c[key]) continue;
      if ((c.x - fx) ** 2 + (c.y - fy) ** 2 < R * R) { c[key] = true; this.done[key]++; hit++; }
    }
    if (hit && this.t - (this.sndT || 0) > 0.09) { this.sndT = this.t; key === 'wet' ? audio.plip() : audio.wipe(40); }
    if (this.frac(key) >= 0.93) {
      for (const c of this.cells) c[key] = true;
      this.done[key] = this.cells.length;
      if (key === 'wet') { this.stage = 'place'; this.toast('Now drag a strip from the pack onto the nose', 3000); audio.sparkle(); } else { this.stage = 'set'; this.toast('Hold anywhere to blow it dry 💨', 3000); audio.sparkle(); }
      buzz('medium');
    }
  }

  down(id, x, y) {
    const s = this.stage;
    if (s === 'wet' || s === 'press') this.rub(x, y);
    else if (s === 'place') {
      const [tx, ty] = this.trayPos();
      if (Math.abs(x - tx) < 100 && Math.abs(y - ty) < 70) { this.drag = { id, x, y }; audio.cap(); buzz('light'); }
    } else if (s === 'set') this.holding++;
    else if (s === 'peel' && this.peelId == null) {
      const [fx, fy] = this.z.toFace(x, y), L = this.line();
      if (Math.abs(fx - this.cx) < this.b * 1.6 && fy > L - 16 && fy < L + 30) {
        this.peelId = id; this.grab = fy - L; this.lastT = performance.now(); this.v = 0;
        buzz('light');
      } else if (this.warnT <= 0) { this.warnT = 1.2; this.G.fx.text(x, y - 30, 'grab the bottom edge', '#ffe7a8', 15); }
    }
  }

  line() { return this.y1 - this.peel * (this.y1 - this.y0); }

  move(id, x, y, px, py) {
    const s = this.stage;
    if (s === 'wet' || s === 'press') {
      const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 10));
      for (let i = 1; i <= n; i++) if (this.stage === s) this.rub(px + (x - px) * i / n, py + (y - py) * i / n);
    } else if (s === 'place' && this.drag && this.drag.id === id) { this.drag.x = x; this.drag.y = y; }
    else if (s === 'peel' && this.peelId === id) {
      const [, fy] = this.z.toFace(x, y);
      const np = clamp((this.y1 - (fy - this.grab)) / (this.y1 - this.y0), 0, 1);
      if (np <= this.peel) return;
      const now = performance.now(), dtm = Math.max(0.004, (now - this.lastT) / 1000);
      this.lastT = now;
      this.v += ((np - this.peel) / dtm - this.v) * 0.35;
      const fast = this.v > 1.5;
      this.peel = np;
      const L = this.line();
      let got = 0;
      for (const q of this.plugs) {
        if (q.state !== 'in' || q.y < L) continue;
        q.state = fast && Math.random() < 0.75 ? 'missed' : 'out';
        if (q.state === 'out') { got++; this.pops.push({ x: q.x, y: q.y, t: 0 }); }
      }
      if (got) { audio.crackle(); buzz('light'); }
      if (this.t - (this.ripT || 0) > 0.05) { this.ripT = this.t; audio.crackle(); }
      if (fast && this.warnT <= 0) {
        this.warnT = 0.9; this.ouches++;
        this.G.fx.text(x, y - 40, 'ow! slower', '#ffb3c1', 18);
        this.G.wince = 0.5; this.G.mood = { k: -1, t: 0, len: 1.6 };
        audio.ouch(); buzz('heavy');
      }
      if (this.peel >= 0.985) this.finish();
    }
  }

  finish() {
    this.peel = 1; this.peelId = null; this.stage = 'show'; this.showT = 0;
    for (const q of this.plugs) if (q.state === 'in') q.state = 'out';
    audio.sparkle(); buzz('medium');
    this.G.mood = { k: 1, t: 0, len: 3 };
    this.toast(`${this.out} plugs on the strip!`, 2600);
  }

  up(id) {
    if (this.stage === 'set') this.holding = Math.max(0, this.holding - 1);
    if (this.peelId === id) this.peelId = null;
    if (this.drag && this.drag.id === id) {
      const [nx, ny] = this.z.toScreen(this.cx, (this.y0 + this.y1) / 2);
      if (Math.hypot(this.drag.x - nx, this.drag.y - 34 - ny) < 120) {
        this.stage = 'press';
        audio.thud(); buzz('medium');
        this.toast('Rub all over the strip to smooth it down', 3000);
      }
      this.drag = null;
    }
  }

  update(dt) {
    this.t += dt;
    this.warnT -= dt;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.4);
    if (this.stage === 'set') {
      audio.loop('dryer', this.holding > 0);
      this.dry = Math.min(1, this.dry + dt * (this.holding > 0 ? 0.42 : 0.07));
      if (this.dry >= 1) {
        audio.loop('dryer', false);
        this.stage = 'peel'; this.holding = 0;
        this.toast('Grab the bottom edge and peel UP, slowly', 3400);
        buzz('medium');
      }
    }
    if (this.stage === 'show') this.showT += dt;
  }

  stripFill(ctx, under) {
    const d = this.dry;
    ctx.fillStyle = under ? '#ece6d6' : `rgba(${Math.round(232 + 20 * d)},${Math.round(236 + 16 * d)},${Math.round(240 + 12 * d)},${0.84 + 0.14 * d})`;
    ctx.fill(this.path);
  }
  spikes(ctx, list, k = 1) {
    for (const q of list) {
      const h = q.r * 3.2 * k, bx = q.x, by = q.y;
      ctx.strokeStyle = '#d9b860'; ctx.lineWidth = q.r * 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + q.lean * h * 0.4, by - h); ctx.stroke();
      ctx.fillStyle = '#2e2018';
      ctx.beginPath(); ctx.arc(bx + q.lean * h * 0.4, by - h, q.r * 0.8, 0, 7); ctx.fill();
    }
  }

  draw(ctx) {
    const G = this.G, z = this.z, s = this.stage, { cx, y0, y1, b } = this;
    z.begin(ctx);
    const L = this.line();
    // the peeled skin is a touch pink
    if (this.peel > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(cx - b - 4, L, 2 * b + 8, y1 - L + 4); ctx.clip();
      ctx.fillStyle = 'rgba(255,110,110,0.10)'; ctx.fill(this.path); ctx.restore();
    }
    // blackheads still in the skin
    for (const q of this.plugs) {
      if (q.state === 'out') continue;
      ctx.fillStyle = 'rgba(40,26,20,0.85)';
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(120,70,50,0.35)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 0.7, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';      // an oily glint on each plug
      ctx.beginPath(); ctx.arc(q.x - q.r * 0.3, q.y - q.r * 0.35, q.r * 0.3, 0, 7); ctx.fill();
    }
    if (s === 'wet' || s === 'place') {
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      for (const c of this.cells) if (c.wet) { ctx.beginPath(); ctx.arc(c.x, c.y, 3.6, 0, 7); ctx.fill(); }
      // beads of water standing on the wet skin
      this.cells.forEach((c, i) => {
        if (!c.wet || i % 6) return;
        const j = Math.sin(i * 12.9898) * 43758.5453, r = 0.9 + (j - Math.floor(j)) * 1.1;
        ctx.fillStyle = 'rgba(60,40,40,0.16)'; ctx.beginPath(); ctx.ellipse(c.x + 0.3, c.y + 0.5, r, r * 1.15, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(225,240,255,0.5)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, r * 0.9, r * 1.05, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(c.x - r * 0.3, c.y - r * 0.4, r * 0.28, 0, 7); ctx.fill();
      });
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      if (s === 'wet') {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * Math.sin(this.t * 4)})`; ctx.lineWidth = 1.2;
        ctx.stroke(this.path); ctx.setLineDash([]);
      } else {
        ctx.setLineDash([4, 4]); ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.35 * Math.sin(this.t * 5)})`; ctx.lineWidth = 1.6;
        ctx.stroke(this.path); ctx.setLineDash([]);
      }
    }
    if (s === 'press' || s === 'set' || s === 'peel') {
      // the part still stuck down
      ctx.save();
      ctx.beginPath(); ctx.rect(cx - b - 6, y0 - 6, 2 * b + 12, L - y0 + 6); ctx.clip();
      ctx.shadowColor = 'rgba(60,30,20,0.35)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 1.5;
      this.stripFill(ctx, false);
      ctx.shadowColor = 'transparent';
      // the strip is a woven fabric: a fine crosshatch you can just make out
      ctx.save(); ctx.clip(this.path);
      ctx.strokeStyle = 'rgba(120,125,140,0.11)'; ctx.lineWidth = 0.35;
      ctx.beginPath();
      for (let d = -(y1 - y0); d < 2 * b + (y1 - y0); d += 2.2) {
        ctx.moveTo(cx - b + d, y0); ctx.lineTo(cx - b + d - (y1 - y0), y1);
        ctx.moveTo(cx - b + d - (y1 - y0), y0); ctx.lineTo(cx - b + d, y1);
      }
      ctx.stroke(); ctx.restore();
      // air pockets where it hasn't been pressed yet
      for (const c of this.cells) if (!c.press) {
        ctx.fillStyle = 'rgba(110,90,80,0.2)'; ctx.beginPath(); ctx.arc(c.x + 0.8, c.y + 1, 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(c.x, c.y, 2.3, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(150,150,160,0.5)'; ctx.lineWidth = 0.6; ctx.stroke(this.path);
      ctx.restore();
      // the flap folded back over it, underside up, plugs standing on it
      if (this.peel > 0) {
        ctx.save();
        ctx.translate(0, L); ctx.scale(1, -1); ctx.translate(0, -L);
        ctx.beginPath(); ctx.rect(cx - b - 6, L, 2 * b + 12, y1 - L + 6); ctx.clip();
        ctx.shadowColor = 'rgba(40,20,10,0.45)'; ctx.shadowBlur = 7;
        this.stripFill(ctx, true);
        ctx.shadowColor = 'transparent';
        ctx.restore();
        ctx.save();
        // spikes drawn unflipped so they stand upright, at their mirrored spots
        this.spikes(ctx, this.plugs.filter((q) => q.state === 'out' && q.y >= L).map((q) => ({ ...q, y: 2 * L - q.y })));
        const fold = ctx.createLinearGradient(0, L - 5, 0, L + 3);
        fold.addColorStop(0, 'rgba(0,0,0,0)'); fold.addColorStop(0.7, 'rgba(60,40,30,0.3)'); fold.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fold; ctx.fillRect(cx - b, L - 5, 2 * b, 8);
        ctx.restore();
      }
    }
    for (const p of this.pops) {
      ctx.strokeStyle = `rgba(255,240,190,${1 - p.t / 0.4})`; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5 + p.t * 14, 0, 7); ctx.stroke();
    }
    ctx.restore();

    // ---- screen-space extras
    if (s === 'place') {
      const [tx, ty] = this.trayPos();
      ctx.save();
      ctx.fillStyle = '#2ec4b6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(tx - 84, ty - 26, 168, 62, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '800 15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('PORE STRIPS', tx, ty + 12);
      ctx.restore();
      const at = this.drag ? [this.drag.x, this.drag.y - 34] : [tx, ty - 44 + Math.sin(this.t * 3) * 3];
      this.drawLoose(ctx, at[0], at[1], this.drag ? z.k : z.k * 0.55, 0, false);
    }
    if (s === 'peel' && this.peelId == null) {
      const [ax, ay] = z.toScreen(cx, L);
      const bob = Math.sin(this.t * 5) * 6;
      ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(70,50,160,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ax, ay - 34 + bob); ctx.lineTo(ax - 14, ay - 12 + bob); ctx.lineTo(ax + 14, ay - 12 + bob); ctx.closePath();
      ctx.stroke(); ctx.fill(); ctx.restore();
    }
    if (s === 'set') {
      // moving air while the dryer runs
      if (this.holding > 0) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
          const yy = z.sy - 90 + i * 36, xx = ((this.t * 260 + i * 97) % (G.W + 80)) - 40;
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 20, yy - 8, xx + 44, yy); ctx.stroke();
        }
        ctx.restore();
      }
    }
    if (s === 'show') {
      const e = clamp(this.showT / 0.6, 0, 1), ease = 1 - (1 - e) ** 3;
      ctx.fillStyle = `rgba(24,14,40,${0.5 * ease})`; ctx.fillRect(0, 0, G.W, G.H);
      this.drawLoose(ctx, z.sx, z.sy - 10 + (1 - ease) * 60, z.k * (0.8 + 0.4 * ease), -0.1 * ease, true);
      ctx.save(); ctx.globalAlpha = ease; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = '900 26px system-ui'; ctx.fillText(`${this.out} plugs out`, z.sx, z.sy + (this.y1 - this.y0) * z.k * 0.72 + 30);
      const left = this.plugs.length - this.out;
      ctx.font = '700 15px system-ui'; ctx.fillText(left ? `${left} stayed behind` : 'every single one!', z.sx, z.sy + (this.y1 - this.y0) * z.k * 0.72 + 54);
      ctx.restore();
    }
  }

  /** The strip on its own (in the hand, or held up at the end). */
  drawLoose(ctx, x, y, k, rot, under) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.scale(k, k); ctx.translate(-this.cx, -(this.y0 + this.y1) / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    const keep = this.dry; if (!under) this.dry = 1;
    this.stripFill(ctx, under);
    this.dry = keep;
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(150,140,130,0.6)'; ctx.lineWidth = 0.6; ctx.stroke(this.path);
    if (under) this.spikes(ctx, this.plugs.filter((q) => q.state === 'out'), 1.15);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- brows
export class Brows {
  constructor(G, toast) {
    this.G = G; this.toast = toast;
    const g = G.geo;
    this.title = 'Brows';
    this.statLabel = 'neatness';
    this.titles = ['', 'A bit patchy', 'Tidy brows', 'Brows on fleek!'];
    this.intro = 'Grab each stray hair and pull it out. Leave the brows alone!';
    const by = g.browY - g.hh * 0.02;
    this.zones = g.eyes.map((e) => ({ x: e.x, y: by, rx: g.hw * 0.29, ry: g.hh * 0.05, d: Math.sign(e.x - g.cx) || 1 }));
    const span = Math.max(...this.zones.map((b) => Math.abs(b.x - g.cx) + b.rx)) + g.hw * 0.1;
    this.z = new Zoom(G, g.cx, by + g.hh * 0.03, clamp((G.W / 2 - 8) / span, 1.3, 2.2));
    this.col = (G.look && typeof G.look.hair === 'string' && G.look.hair) || g.lash || '#2a1712';
    this.hairs = [];
    const add = (x, y, a) => this.hairs.push({ x, y, a, len: rnd(10, 15), bend: rnd(-0.8, 0.8), gone: false });
    for (const b of this.zones) {
      for (let i = 0; i < 5; i++) add(b.x + rnd(-0.24, 0.24) * g.hw, by + rnd(0.066, 0.085) * g.hh, Math.PI / 2 + b.d * rnd(0.2, 1));
      for (let i = 0; i < 3; i++) add(b.x + rnd(-0.22, 0.22) * g.hw, by - rnd(0.068, 0.095) * g.hh, -Math.PI / 2 + b.d * rnd(0.2, 1));
      add(b.x + b.d * rnd(0.33, 0.39) * g.hw, by + rnd(-0.005, 0.04) * g.hh, b.d > 0 ? rnd(-0.3, 0.6) : Math.PI + rnd(-0.6, 0.3));
    }
    for (let i = 0; i < 4; i++) add(g.cx + rnd(-0.1, 0.1) * g.hw, by + rnd(-0.035, 0.04) * g.hh, -Math.PI / 2 + rnd(-0.8, 0.8));
    this.cells = [];
    for (const b of this.zones) for (let y = b.y - b.ry; y <= b.y + b.ry; y += 3.5) for (let x = b.x - b.rx; x <= b.x + b.rx; x += 3.5) {
      if (((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 < 1) this.cells.push({ x, y, on: false });
    }
    this.filled = 0;
    this.strokes = [];
    this.bald = [];
    this.fly = [];
    this.spots = [];           // little pink marks where a hair just came out
    this.grabs = new Map();    // pointer -> { h, sx, sy, x, y }
    this.stage = 'pluck';
    this.mistakes = 0;
    this.plucked = 0;
    this.coolT = 0;
    this.idle = 0;
    this.t = 0;
  }

  get left() { return this.hairs.length - this.plucked; }
  get fillCov() { return this.filled / this.cells.length; }
  get progress() { return this.stage === 'pluck' ? this.plucked / this.hairs.length : this.fillCov; }
  get ready() { return this.stage === 'fill' && this.fillCov >= 0.85; }
  score() { return clamp(Math.round(100 * (0.6 * this.plucked / this.hairs.length + 0.4 * Math.min(1, this.fillCov / 0.85))) - this.mistakes * 7, 10, 100); }
  summary() { return this.mistakes ? `${this.plucked} strays plucked · ${this.mistakes} slip${this.mistakes === 1 ? '' : 's'}` : `${this.plucked} strays plucked, not one slip`; }
  label() { return this.stage === 'pluck' ? `1/2 Pluck · ${this.left} left` : `2/2 Fill in ${Math.round(Math.min(1, this.fillCov / 0.85) * 100)}%`; }
  hint() { return this.intro; }

  inBrow(fx, fy) { return this.zones.some((b) => ((fx - b.x) / b.rx) ** 2 + ((fy - b.y) / b.ry) ** 2 < 1); }

  down(id, x, y) {
    const [fx, fy] = this.z.toFace(x, y);
    this.idle = 0;
    if (this.stage === 'fill') return this.pencil(x, y);
    let best = null, bd = 34 / this.z.k;
    for (const h of this.hairs) {
      if (h.gone || [...this.grabs.values()].some((q) => q.h === h)) continue;
      const mx = h.x + Math.cos(h.a) * h.len * 0.5, my = h.y + Math.sin(h.a) * h.len * 0.5;
      const d = Math.hypot(mx - fx, my - fy);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) { this.grabs.set(id, { h: best, sx: x, sy: y, x, y }); audio.click(); buzz('light'); return; }
    if (this.inBrow(fx, fy) && this.coolT <= 0) {
      this.coolT = 0.7; this.mistakes++;
      this.bald.push({ x: fx, y: fy });
      this.G.fx.text(x, y - 34, 'not the brow!', '#ffb3c1', 17);
      this.G.wince = 0.5; this.G.mood = { k: -1, t: 0, len: 1.6 };
      audio.ouch(); buzz('heavy');
    }
  }

  move(id, x, y, px, py) {
    this.idle = 0;
    if (this.stage === 'fill') {
      const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 6));
      for (let i = 1; i <= n; i++) this.pencil(px + (x - px) * i / n, py + (y - py) * i / n);
      return;
    }
    const gr = this.grabs.get(id);
    if (!gr) return;
    gr.x = x; gr.y = y;
    if (Math.hypot(x - gr.sx, y - gr.sy) > 36) {
      const h = gr.h;
      h.gone = true; this.plucked++;
      this.spots.push({ x: h.x, y: h.y, t: 0 });
      this.grabs.delete(id);
      const a = Math.atan2(y - gr.sy, x - gr.sx);
      this.fly.push({ x: h.x, y: h.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30, rot: h.a, vr: rnd(-8, 8), len: h.len, t: 0 });
      audio.pluck(); buzz('medium');
      this.G.wince = 0.14; this.G.mood = this.left ? { k: -0.4, t: 0, len: 0.6 } : { k: 1, t: 0, len: 2.5 };
      this.G.fx.text(x, y - 30, this.left ? 'plink!' : 'all out!', '#fff', 15);
      if (!this.left) {
        this.stage = 'fill';
        this.grabs.clear();
        audio.sparkle();
        this.toast('Now swipe along each brow to fill it in ✏️', 3200);
      }
    }
  }

  pencil(x, y) {
    const [fx, fy] = this.z.toFace(x, y);
    const zb = this.zones.find((b) => ((fx - b.x) / (b.rx + 6)) ** 2 + ((fy - b.y) / (b.ry + 6)) ** 2 < 1);
    if (!zb) return;
    let hit = 0;
    for (const c of this.cells) if (!c.on && (c.x - fx) ** 2 + (c.y - fy) ** 2 < 36) { c.on = true; this.filled++; hit++; }
    if (hit) {
      this.strokes.push({ x: fx, y: fy, d: zb.d, j: Math.random() });
      if (this.strokes.length > 400) this.strokes.shift();
      if (this.t - (this.sndT || 0) > 0.1) { this.sndT = this.t; audio.wipe(30); }
    }
  }

  up(id) { this.grabs.delete(id); }

  update(dt) {
    this.t += dt; this.coolT -= dt; this.idle += dt;
    for (const f of this.fly) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 160 * dt; f.rot += f.vr * dt; }
    this.fly = this.fly.filter((f) => f.t < 0.8);
    for (const s of this.spots) s.t += dt;
    this.spots = this.spots.filter((s) => s.t < 7);
  }

  draw(ctx) {
    const z = this.z;
    z.begin(ctx);
    // pencil: soft strokes clipped to the brow shapes
    if (this.strokes.length) {
      ctx.save();
      ctx.beginPath();
      for (const b of this.zones) { ctx.moveTo(b.x + b.rx, b.y); ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); }
      ctx.clip();
      ctx.fillStyle = this.col; ctx.globalAlpha = 0.09;
      for (const s of this.strokes) { ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, 7); ctx.fill(); }
      // the pencil lays down fine hair-like strokes in the direction the brow grows
      ctx.strokeStyle = this.col; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const s of this.strokes) for (let k = -1; k <= 1; k++) {
        const ox = k * 2.3 + (s.j - 0.5) * 2;
        ctx.moveTo(s.x + ox, s.y + 1.8 + k * 0.6); ctx.lineTo(s.x + ox + s.d * (3 + s.j * 2), s.y - 2.2 + (s.j - 0.5) * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    // slips leave a little gap
    for (const b of this.bald) {
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 5);
      g.addColorStop(0, 'rgba(255,170,160,0.75)'); g.addColorStop(1, 'rgba(255,170,160,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 7); ctx.fill();
    }
    if (this.stage === 'pluck') {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.9;
      for (const b of this.zones) { ctx.beginPath(); ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.3 * Math.sin(this.t * 4)})`; ctx.lineWidth = 0.9;
      for (const b of this.zones) { ctx.beginPath(); ctx.ellipse(b.x, b.y, b.rx, b.ry, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    ctx.lineCap = 'round';
    const held = new Map([...this.grabs.values()].map((q) => [q.h, q]));
    for (const h of this.hairs) {
      if (h.gone) continue;
      let tx = h.x + Math.cos(h.a) * h.len, ty = h.y + Math.sin(h.a) * h.len;
      const gr = held.get(h);
      if (gr) {
        // stretched toward the tweezers, skin tenting up under it
        const [gx, gy] = z.toFace(gr.x, gr.y), [ox, oy] = z.toFace(gr.sx, gr.sy);
        const pull = Math.min(1, Math.hypot(gx - ox, gy - oy) * z.k / 36);
        tx += (gx - ox) * 0.5; ty += (gy - oy) * 0.5;
        ctx.fillStyle = `rgba(255,150,140,${0.5 * pull})`; ctx.beginPath(); ctx.arc(h.x, h.y, 2 + 2 * pull, 0, 7); ctx.fill();
      }
      const qx = (h.x + tx) / 2 + h.bend * 2, qy = (h.y + ty) / 2 + h.bend * 2;
      ctx.strokeStyle = this.col; ctx.lineWidth = 0.9;                       // fine along its length
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(qx, qy, tx, ty); ctx.stroke();
      ctx.lineWidth = 1.7;                                                   // thicker toward the root
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo((h.x + qx) / 2, (h.y + qy) / 2, (h.x + 2 * qx + tx) / 4, (h.y + 2 * qy + ty) / 4); ctx.stroke();
      ctx.fillStyle = 'rgba(120,60,50,0.45)'; ctx.beginPath(); ctx.arc(h.x, h.y, 1.1, 0, 7); ctx.fill();   // the follicle
    }
    for (const s of this.spots) {
      const a = 0.55 * (1 - s.t / 7);
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 4);
      g.addColorStop(0, `rgba(230,90,90,${a})`); g.addColorStop(1, 'rgba(230,90,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill();
    }
    for (const f of this.fly) {
      ctx.save(); ctx.globalAlpha = 1 - f.t / 0.8; ctx.translate(f.x, f.y); ctx.rotate(f.rot);
      ctx.strokeStyle = this.col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(f.len, 0); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, 7); ctx.fill();   // the root
      ctx.restore();
    }
    // nudge toward one that is still left
    if (this.stage === 'pluck' && this.idle > 3.5) {
      const h = this.hairs.find((q) => !q.gone);
      if (h) { ctx.strokeStyle = `rgba(255,231,168,${0.6 + 0.4 * Math.sin(this.t * 6)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(h.x + Math.cos(h.a) * h.len / 2, h.y + Math.sin(h.a) * h.len / 2, 7 + Math.sin(this.t * 6), 0, 7); ctx.stroke(); }
    }
    ctx.restore();
    // tweezers at each finger holding a hair
    for (const gr of this.grabs.values()) drawTweezers(ctx, gr.x, gr.y, -2.1);
  }
}
