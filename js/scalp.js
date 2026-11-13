// Scalp Check: a close-up of the top of her head, parted down the middle.
// Stage 1: scrub the dandruff loose with a silicone scalp brush.
// Stage 2: comb out the lice and their nits with a fine metal nit comb. Lice crawl away from
// the comb; nits are glued on and only come off with a slow, steady stroke; yanking hurts.
// Follows the salon interface: down / move / up, update, draw, progress, ready, score().

import * as audio from './audio.js';
import { buzz } from './haptics.js';
import { SKIN_TONES } from './skin.js';

// Painted partings (fair scalp with brown hair, medium and deep with black hair). The parting runs
// straight down the middle of each picture; part: its half-width as a share of the picture's width.
const SCALP_ART = { files: ['body/scalp1.jpg', 'body/scalp2.jpg', 'body/scalp3.jpg'], hair: ['#5a3122', '#16110f', '#16110f'], part: 0.036 };
if (typeof Image !== 'undefined') SCALP_ART.imgs = SCALP_ART.files.map((src) => { const im = new Image(); im.src = src; return im; });

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
/** k < 0 darkens toward black, k > 0 lightens toward white. */
const mix = (c, k, a = 1) => {
  const [r, g, b] = hex(c), t = k < 0 ? 0 : 255, m = Math.abs(k);
  return `rgba(${Math.round(r + (t - r) * m)},${Math.round(g + (t - g) * m)},${Math.round(b + (t - b) * m)},${a})`;
};

const COMB_W = 124;   // width of the comb's teeth
const TOO_FAST = 1900; // px/s: faster than this tugs her hair
const NIT_SPEED = 1150; // px/s: nits only slide off below this

export class Scalp {
  constructor(G, toast) {
    this.G = G; this.toast = toast;
    this.title = 'Scalp Check';
    this.statLabel = 'clean scalp';
    this.titles = ['', 'Still a bit itchy', 'Fresh and clean', 'Squeaky clean scalp!'];
    this.intro = 'Flaky scalp! Scrub the flakes loose with the brush 🫧';
    const W = G.W, H = G.H;
    this.top = G.safeTop + 74;
    this.bot = H - G.safeBottom - 40;
    const hair = G.look && typeof G.look.hair === 'string' && /^#[0-9a-f]{6}$/i.test(G.look.hair) ? G.look.hair : '#3a2418';
    this.hair = hair;
    this.skin = G.tone && G.tone.base ? G.tone : { base: '#eec1a2', shade: '#d69f80', pore: '#a8705a', blush: '#e88e7f' };
    this.bw = Math.min(21, W * 0.055);           // half-width of bare scalp along the part
    this.wob = rnd(0, 6);
    const ti = SKIN_TONES.indexOf(G.tone), ai = ti < 0 ? 0 : ti <= 1 ? 0 : ti <= 3 ? 1 : 2;
    const art = SCALP_ART.imgs && SCALP_ART.imgs[ai];
    this.art = art && art.complete && art.naturalWidth ? art : null;
    if (this.art) this.hair = SCALP_ART.hair[ai];   // strands drawn over the lice match the painting
    this.paintLayer();

    // dandruff: most of it on the bare part, some caught in the hair near the roots
    this.flakes = [];
    const clusters = Array.from({ length: 5 }, () => ({ y: rnd(this.top + 40, this.bot - 40) }));
    for (let i = 0; i < 78; i++) {
      const c = Math.random() < 0.65 ? clusters[i % clusters.length] : null;
      const y = clamp(c ? c.y + rnd(-45, 45) : rnd(this.top + 10, this.bot - 10), this.top, this.bot);
      const inHair = Math.random() < 0.28, s = Math.random() < 0.5 ? -1 : 1;
      const x = this.px(y) + (inHair ? s * (this.bw + rnd(2, 50)) : rnd(-0.9, 0.9) * this.bw);
      const big = Math.random() < 0.2;
      const r = big ? rnd(3.6, 6.2) : rnd(1.3, 3);
      const n = 5 + Math.floor(Math.random() * 3);
      this.flakes.push({
        x, y, r, rot: rnd(0, 7), lift: 0, need: big ? 1.9 : 1, gone: false, wig: 0,
        pts: Array.from({ length: n }, (_, k) => [Math.cos(k / n * 6.283), Math.sin(k / n * 6.283), rnd(0.55, 1)]),
        col: Math.random() < 0.3 ? '#efe2b2' : '#f7f4ec',
      });
    }
    // itchy pink patches under the worst of it; they calm down as you scrub
    this.patches = clusters.map((c) => ({ x: this.px(c.y) + rnd(-6, 6), y: c.y, r: rnd(22, 34), k: 1 }));
    this.falling = [];

    // lice and their eggs
    this.lice = [];
    for (let i = 0; i < 7; i++) {
      const y = rnd(this.top + 30, this.bot - 30), s = Math.random() < 0.5 ? -1 : 1;
      this.lice.push({ x: this.px(y) + s * rnd(0, this.bw + 60), y, a: rnd(0, 6.283), sp: 0, phase: rnd(0, 7), size: rnd(0.85, 1.12), fed: rnd(0.3, 1), rest: rnd(0, 2), caught: false });
    }
    this.nits = [];
    for (let i = 0; i < 14; i++) {
      const y = rnd(this.top + 16, this.bot - 16), s = Math.random() < 0.5 ? -1 : 1;
      this.nits.push({ x: this.px(y) + s * (this.bw + rnd(3, 34)), y, a: s > 0 ? rnd(0.15, 0.45) : Math.PI - rnd(0.15, 0.45), s, empty: Math.random() < 0.3, caught: false });
    }

    this.stage = 'flakes';
    this.brush = null;      // { x, y }
    this.comb = null;       // { id, x, y, t, v, load: [] }
    this.mistakes = 0;
    this.coolT = 0;
    this.slowT = 0;
    this.idle = 0;
    this.t = 0;
    this.sndT = 0;
    this.gotLice = 0;
    this.gotNits = 0;
  }

  /** Where the part runs at height y. */
  px(y) { return this.art ? this.G.W / 2 : this.G.W / 2 + Math.sin(y * 0.011 + this.wob) * 7 + Math.sin(y * 0.031) * 2; }

  // ------------------------------------------------------------- the painted scalp and hair
  paintLayer() {
    const G = this.G, W = G.W, H = G.H, d = G.dpr || 1;
    const c = document.createElement('canvas');
    c.width = Math.round(W * d); c.height = Math.round(H * d);
    const x = c.getContext('2d');
    x.scale(d, d);
    const hair = this.hair, sk = this.skin, bw = this.bw;
    x.fillStyle = mix(hair, -0.45); x.fillRect(0, 0, W, H);

    // bare scalp along the part, shaded where the hair rises off it
    const band = new Path2D();
    const ys = []; for (let y = -20; y <= H + 20; y += 6) ys.push(y);
    ys.forEach((y, i) => { const xx = this.px(y) - bw * (1.08 + Math.sin(y * 0.09) * 0.06); i ? band.lineTo(xx, y) : band.moveTo(xx, y); });
    for (let i = ys.length - 1; i >= 0; i--) { const y = ys[i]; band.lineTo(this.px(y) + bw * (1.08 + Math.cos(y * 0.08) * 0.06), y); }
    band.closePath();
    this.band = band;
    if (this.art) {
      // the painting, scaled so its parting is as wide as the strip the flakes and lice live on
      const im = this.art, k = Math.max(bw * 1.08 / (SCALP_ART.part * im.naturalWidth), W / im.naturalWidth, H / im.naturalHeight);
      x.imageSmoothingQuality = 'high';
      x.drawImage(im, W / 2 - im.naturalWidth * k / 2, H / 2 - im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k);
      this.paintClips(x);
      this.layer = c;
      return;
    }
    x.save();
    x.clip(band);
    x.fillStyle = sk.base; x.fillRect(0, 0, W, H);
    x.fillStyle = mix(sk.blush || sk.base, 0, 0.18); x.fillRect(0, 0, W, H);   // scalp skin is a little pinker than the face
    for (let y = -20; y < H + 20; y += 4) {
      const g = x.createLinearGradient(this.px(y) - bw * 1.1, 0, this.px(y) + bw * 1.1, 0);
      g.addColorStop(0, mix(sk.shade, -0.25, 0.9)); g.addColorStop(0.22, mix(sk.shade, 0, 0.35));
      g.addColorStop(0.5, mix(sk.base, 0.12, 0.25)); g.addColorStop(0.78, mix(sk.shade, 0, 0.35)); g.addColorStop(1, mix(sk.shade, -0.25, 0.9));
      x.fillStyle = g; x.fillRect(this.px(y) - bw * 1.2, y, bw * 2.4, 4.5);
    }
    // follicles and a little stubble of new growth
    for (let i = 0; i < 520; i++) {
      const y = rnd(-10, H + 10), o = rnd(-1, 1), xx = this.px(y) + o * bw;
      x.fillStyle = mix(sk.pore, -0.1, rnd(0.25, 0.5));
      x.beginPath(); x.arc(xx, y, rnd(0.45, 0.9), 0, 7); x.fill();
      if (Math.random() < 0.35) {
        x.strokeStyle = mix(hair, -0.1, 0.7); x.lineWidth = 0.6;
        x.beginPath(); x.moveTo(xx, y); x.lineTo(xx + Math.sign(o || 1) * rnd(2, 5), y + rnd(-1, 2)); x.stroke();
      }
    }
    x.restore();

    // hair combed out to each side of the part
    x.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (const s of [-1, 1]) {
        for (let y = -80; y < H + 80; y += pass ? 2.6 : 1.1) {
          const rx = this.px(y) + s * bw * rnd(0.8, 1.06), L = rnd(110, W * 0.72), a = rnd(0.12, 0.5);
          const ex = rx + s * L * Math.cos(a), ey = y + L * Math.sin(a);
          x.strokeStyle = pass ? mix(hair, rnd(0.18, 0.4), rnd(0.12, 0.22)) : mix(hair, rnd(-0.38, 0.12), rnd(0.45, 0.75));
          x.lineWidth = pass ? rnd(0.5, 1) : rnd(0.6, 1.4);
          x.beginPath(); x.moveTo(rx, y);
          x.bezierCurveTo(rx + s * L * 0.18, y - rnd(3, 9), rx + s * L * 0.55, y + L * Math.sin(a) * 0.4, ex, ey);
          x.stroke();
        }
      }
    }
    // shadow where the hair lifts off the scalp, so the part reads as a little valley
    for (let y = -20; y < H + 20; y += 5) for (const s of [-1, 1]) {
      const e = this.px(y) + s * bw;
      const g = x.createLinearGradient(e, 0, e + s * 16, 0);
      g.addColorStop(0, 'rgba(20,10,8,0.35)'); g.addColorStop(1, 'rgba(20,10,8,0)');
      x.fillStyle = g; x.fillRect(Math.min(e, e + s * 16), y, 16, 5.5);
    }
    // a few flyaways crossing the part
    for (let i = 0; i < 22; i++) {
      const y = rnd(0, H), s = Math.random() < 0.5 ? -1 : 1, rx = this.px(y) + s * bw;
      x.strokeStyle = mix(hair, rnd(-0.1, 0.25), 0.7); x.lineWidth = 0.7;
      x.beginPath(); x.moveTo(rx, y); x.quadraticCurveTo(this.px(y), y - rnd(4, 12), rx - s * bw * rnd(1.4, 2.6), y + rnd(-6, 14)); x.stroke();
    }
    // glossy hair: a soft band of shine running down each side, the way healthy hair catches the light
    x.save(); x.globalCompositeOperation = 'screen';
    for (let y = -20; y < H + 20; y += 6) for (const s of [-1, 1]) {
      const e = this.px(y) + s * bw, a = e + s * 40, b = e + s * 120;
      const g = x.createLinearGradient(a, 0, b, 0);
      g.addColorStop(0, mix(hair, 0.6, 0)); g.addColorStop(0.45, mix(hair, 0.6, 0.22)); g.addColorStop(1, mix(hair, 0.6, 0));
      x.fillStyle = g; x.fillRect(Math.min(a, b), y, 80, 6.5);
    }
    x.restore();
    this.paintClips(x);
    this.layer = c;
  }

  /** Pastel snap clips holding the sections back, and a soft vignette. */
  paintClips(x) {
    const G = this.G, W = G.W, H = G.H, bw = this.bw;
    // a flat teardrop of metal with an open centre
    const clips = [['#ffc2d8', '#ff86b3'], ['#d9c8ff', '#a58df3'], ['#b4ecdc', '#62c7aa'], ['#ffe0ad', '#f4b45e']];
    [[-1, 0.2], [1, 0.36], [-1, 0.62], [1, 0.8]].forEach(([s, f], i) => {
      const y = this.top + (this.bot - this.top) * f, cxp = this.px(y) + s * (bw + 66), [c1, c2] = clips[i];
      x.save(); x.translate(cxp, y); x.rotate(s > 0 ? 0.28 : Math.PI - 0.28);
      const clip = new Path2D();
      clip.moveTo(-30, 0); clip.bezierCurveTo(-30, -9, -10, -11, 4, -10); clip.bezierCurveTo(22, -9, 30, -5, 30, 0);
      clip.bezierCurveTo(30, 5, 22, 9, 4, 10); clip.bezierCurveTo(-10, 11, -30, 9, -30, 0); clip.closePath();
      const hole = new Path2D(); hole.ellipse(-8, 0, 13, 4.2, 0, 0, 7);
      x.save(); x.translate(2, 3); x.fillStyle = 'rgba(40,10,30,0.28)'; const sr = new Path2D(clip); sr.addPath(hole); x.fill(sr, 'evenodd'); x.restore();
      const g = x.createLinearGradient(0, -10, 0, 10); g.addColorStop(0, c1); g.addColorStop(1, c2);
      const ring = new Path2D(clip); ring.addPath(hole);
      x.fillStyle = g; x.fill(ring, 'evenodd');
      x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-24, -5.5); x.quadraticCurveTo(0, -9, 22, -5); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(22, 0, 2, 0, 7); x.fill();
      x.restore();
    });
    // a soft vignette keeps the eye on the middle
    const v = x.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H * 0.48, Math.max(W, H) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,20,40,0.28)');
    x.fillStyle = v; x.fillRect(0, 0, W, H);
  }

  // ------------------------------------------------------------- state
  get flakesLeft() { return this.flakes.filter((f) => !f.gone).length; }
  get flakeFrac() { return 1 - this.flakesLeft / this.flakes.length; }
  get liceLeft() { return this.lice.length - this.gotLice; }
  get nitsLeft() { return this.nits.length - this.gotNits; }
  get progress() {
    if (this.stage === 'flakes') return 0.5 * Math.min(1, this.flakeFrac / 0.92);
    return 0.5 + 0.5 * (this.gotLice + this.gotNits) / (this.lice.length + this.nits.length);
  }
  get ready() { return this.stage === 'lice' && !this.liceLeft && !this.nitsLeft; }
  score() {
    const f = Math.min(1, this.flakeFrac / 0.92), l = this.gotLice / this.lice.length, n = this.gotNits / this.nits.length;
    return clamp(Math.round(100 * (0.3 * f + 0.4 * l + 0.3 * n)) - this.mistakes * 6, 10, 100);
  }
  summary() {
    const base = `🪮 ${this.gotLice} lice and ${this.gotNits} nits combed out`;
    return this.mistakes ? `${base} · ${this.mistakes} tug${this.mistakes === 1 ? '' : 's'}` : `${base}, not one tug`;
  }
  label() {
    return this.stage === 'flakes' ? `1/2 Flakes ${Math.round(Math.min(1, this.flakeFrac / 0.92) * 100)}%` : `2/2 Lice ${this.liceLeft} · nits ${this.nitsLeft}`;
  }
  hint() { return this.intro; }

  /** The comb's teeth, for a finger at (x, y): a strip above the finger so you can see it. */
  teeth(x, y) { return { x0: x - COMB_W / 2, x1: x + COMB_W / 2, y0: y - 68, y1: y - 46 }; }

  // ------------------------------------------------------------- input
  down(id, x, y) {
    this.idle = 0;
    if (this.stage === 'flakes') { this.brush = { id, x, y }; audio.click(); return; }
    if (this.comb) return;
    this.comb = { id, x, y, t: performance.now(), v: 0, load: [] };
    audio.click(); buzz('light');
    this.sweep(x, y, x, y);
  }

  move(id, x, y, px, py) {
    this.idle = 0;
    if (this.stage === 'flakes') {
      if (!this.brush || this.brush.id !== id) return;
      this.brush.x = x; this.brush.y = y;
      this.scrub(px, py, x, y);
      return;
    }
    const cb = this.comb;
    if (!cb || cb.id !== id) return;
    const now = performance.now(), dt = Math.max(8, now - cb.t) / 1000;
    const v = Math.hypot(x - cb.x, y - cb.y) / dt;
    cb.v = cb.v * 0.6 + v * 0.4;
    cb.t = now;
    this.sweep(cb.x, cb.y, x, y);
    cb.x = x; cb.y = y;
    if (cb.v > TOO_FAST && this.coolT <= 0) {
      // yanked through a tangle
      this.coolT = 1.1; this.mistakes++;
      this.G.fx.text(x, y - 90, 'ouch, gently!', '#ffb3c1', 17);
      this.G.wince = 0.5; this.G.mood = { k: -1, t: 0, len: 1.4 };
      audio.ouch(); buzz('heavy');
    }
  }

  up(id) {
    if (this.brush && this.brush.id === id) this.brush = null;
    const cb = this.comb;
    if (cb && cb.id === id) {
      if (cb.load.length) {
        // tap the comb clean: what it caught drops away
        for (const it of cb.load) this.falling.push({ kind: it.kind, x: cb.x + it.ox, y: cb.y + it.oy, vx: rnd(-30, 30), vy: rnd(10, 40), rot: rnd(0, 7), vr: rnd(-6, 6), t: 0, it: it.ref });
        audio.plip();
      }
      this.comb = null;
    }
  }

  scrub(x0, y0, x1, y1) {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    if (!dist) return;
    const n = Math.max(1, Math.ceil(dist / 8));
    let freed = 0;
    for (let i = 1; i <= n; i++) {
      const bx = x0 + (x1 - x0) * i / n, by = y0 + (y1 - y0) * i / n - 6;
      for (const f of this.flakes) {
        if (f.gone) continue;
        const d = Math.hypot(f.x - bx, f.y - by);
        if (d > 34) continue;
        f.lift += (dist / n) * 0.022 * (1 - d / 40) / f.need;
        f.wig = 1;
        if (f.lift >= 1) {
          f.gone = true; freed++;
          this.falling.push({ kind: 'flake', f, x: f.x, y: f.y, vx: rnd(-40, 40), vy: rnd(-50, -10), rot: f.rot, vr: rnd(-4, 4), t: 0 });
        }
      }
      for (const p of this.patches) if (Math.hypot(p.x - bx, p.y - by) < p.r + 20) p.k = Math.max(0.15, p.k - (dist / n) * 0.0016);
    }
    if (this.t - this.sndT > 0.12) { this.sndT = this.t; audio.scrub(); }
    if (freed && Math.random() < 0.3) buzz('light');
    if (this.flakeFrac >= 0.92) this.toLice();
  }

  toLice() {
    if (this.stage !== 'flakes') return;
    for (const f of this.flakes) if (!f.gone) { f.gone = true; this.falling.push({ kind: 'flake', f, x: f.x, y: f.y, vx: rnd(-30, 30), vy: rnd(-30, 0), rot: f.rot, vr: rnd(-4, 4), t: 0 }); }
    for (const p of this.patches) p.k = Math.min(p.k, 0.25);
    this.stage = 'lice';
    this.brush = null;
    this.intro = 'Lice! Drag the nit comb over them. Go slow to catch the nits 🪮';
    this.G.fx.sparkleBurst(this.G.W / 2, this.G.H * 0.4, 14);
    audio.sparkle(); buzz('medium');
    this.toast(this.intro, 3600);
  }

  /** Sweep the teeth from one finger position to the next and catch what they pass over. */
  sweep(x0, y0, x1, y1) {
    const cb = this.comb, fast = cb.v > NIT_SPEED;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6));
    for (let i = 0; i <= n; i++) {
      const fx = x0 + (x1 - x0) * i / n, fy = y0 + (y1 - y0) * i / n, r = this.teeth(fx, fy);
      const inside = (o) => o.x > r.x0 && o.x < r.x1 && o.y > r.y0 - 3 && o.y < r.y1 + 3;
      for (const l of this.lice) if (!l.caught && inside(l)) this.grab(l, 'louse', x1, y1);
      for (const t of this.nits) {
        if (t.caught || !inside(t)) continue;
        if (fast) {
          if (this.slowT <= 0) { this.slowT = 1.6; this.G.fx.text(x1, y1 - 96, 'slower for nits', '#fff3c4', 15); }
          continue;
        }
        this.grab(t, 'nit', x1, y1);
      }
    }
  }

  grab(o, kind, x, y) {
    const cb = this.comb;
    o.caught = true;
    const r = this.teeth(x, y);
    cb.load.push({ kind, ref: o, ox: clamp(o.x - x, -COMB_W / 2 + 4, COMB_W / 2 - 4), oy: rnd(r.y0, r.y1) - y });
    if (kind === 'louse') { this.gotLice++; audio.pluck(); buzz('medium'); this.G.fx.text(x, y - 92, this.liceLeft ? 'got one!' : 'no more lice!', '#fff', 16); }
    else { this.gotNits++; audio.prick(); buzz('light'); }
    if (this.ready) { audio.perfect(); this.G.fx.sparkleBurst(this.G.W / 2, this.G.H * 0.4, 18); this.G.mood = { k: 1, t: 0, len: 2.5 }; }
  }

  // ------------------------------------------------------------- time
  update(dt) {
    this.t += dt; this.coolT -= dt; this.slowT -= dt; this.idle += dt;
    for (const f of this.flakes) f.wig = Math.max(0, f.wig - dt * 4);
    for (const p of this.falling) {
      p.t += dt; p.vy += (p.kind === 'flake' ? 140 : 420) * dt; p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt + (p.kind === 'flake' ? Math.sin(p.t * 7 + p.rot) * 18 * dt : 0); p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    this.falling = this.falling.filter((p) => p.t < 1.4);
    // lice: wander along the scalp, rest now and then, scuttle away from an approaching comb
    const cb = this.comb, W = this.G.W;
    for (const l of this.lice) {
      if (l.caught) continue;
      let want = l.a, speed = 10;
      if (l.rest > 0) { l.rest -= dt; speed = 0; } else if (Math.random() < dt * 0.25) l.rest = rnd(0.6, 2.2);
      l.a += rnd(-2, 2) * dt;
      // they keep close to the warm scalp
      const off = l.x - this.px(l.y);
      if (Math.abs(off) > this.bw + 55) want = off > 0 ? Math.PI : 0;
      if (cb && this.stage === 'lice') {
        const r = this.teeth(cb.x, cb.y), mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
        const dx = l.x - mx, dy = l.y - my, d = Math.hypot(dx / 1.6, dy);
        if (d < 80) { want = Math.atan2(dy, dx); speed = 42; l.rest = 0; }
      }
      if (l.y < this.top + 10) want = Math.PI / 2;
      if (l.y > this.bot - 10) want = -Math.PI / 2;
      if (l.x < 16) want = 0;
      if (l.x > W - 16) want = Math.PI;
      let da = want - l.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      l.a += da * Math.min(1, dt * 5);
      l.sp += (speed - l.sp) * Math.min(1, dt * 6);
      l.x += Math.cos(l.a) * l.sp * dt; l.y += Math.sin(l.a) * l.sp * dt;
      l.phase += l.sp * dt * 0.9;
    }
  }

  // ------------------------------------------------------------- drawing
  draw(ctx) {
    const G = this.G;
    ctx.save();
    ctx.drawImage(this.layer, 0, 0, G.W, G.H);
    // irritated skin under the flakes
    ctx.save();
    ctx.clip(this.band);
    for (const p of this.patches) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(226,92,92,${0.32 * p.k})`); g.addColorStop(1, 'rgba(226,92,92,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.restore();
    for (const t of this.nits) if (!t.caught) this.drawNit(ctx, t.x, t.y, t.a, t.empty, true);
    for (const f of this.flakes) if (!f.gone) this.drawFlake(ctx, f, f.x, f.y + (f.wig ? Math.sin(this.t * 60) * f.wig * 0.8 : 0), f.rot, f.lift);
    for (const l of this.lice) if (!l.caught) {
      this.drawLouse(ctx, l.x, l.y, l.a, l.size, l.phase, l.fed, l.sp > 1);
      // nestled in the hair: a couple of strands lie over it
      const off = l.x - this.px(l.y);
      if (Math.abs(off) > this.bw * 0.9) {
        const s = Math.sign(off);
        ctx.strokeStyle = mix(this.hair, -0.05, 0.75); ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(l.x - s * 11, l.y - 4); ctx.quadraticCurveTo(l.x, l.y - 2.5, l.x + s * 12, l.y + 1.5);
        ctx.moveTo(l.x - s * 10, l.y + 3); ctx.quadraticCurveTo(l.x + s, l.y + 4.5, l.x + s * 11, l.y + 7.5); ctx.stroke();
      }
    }
    for (const p of this.falling) {
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.t / 1.4);
      if (p.kind === 'flake') this.drawFlake(ctx, p.f, p.x, p.y, p.rot, 0);
      else if (p.kind === 'louse') this.drawLouse(ctx, p.x, p.y, p.rot, p.it.size, p.t * 20, p.it.fed, true);
      else this.drawNit(ctx, p.x, p.y, p.rot, p.it.empty, false);
      ctx.restore();
    }
    // nudge toward something still left after a while
    if (this.idle > 4) {
      const tg = this.stage === 'flakes' ? this.flakes.find((f) => !f.gone) : this.lice.find((l) => !l.caught) || this.nits.find((n) => !n.caught);
      if (tg) {
        ctx.strokeStyle = `rgba(255,231,168,${0.6 + 0.4 * Math.sin(this.t * 6)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, 16 + 2 * Math.sin(this.t * 6), 0, 7); ctx.stroke();
      }
    }
    if (this.stage === 'flakes' && this.brush) this.drawBrush(ctx, this.brush.x, this.brush.y - 6);
    if (this.comb) this.drawComb(ctx, this.comb);
    ctx.restore();
  }

  drawFlake(ctx, f, x, y, rot, lift) {
    ctx.save();
    ctx.translate(x, y - lift * 1.5); ctx.rotate(rot);
    const path = new Path2D();
    f.pts.forEach(([cx, cy, k], i) => (i ? path.lineTo(cx * f.r * k, cy * f.r * k * 0.8) : path.moveTo(cx * f.r * k, cy * f.r * k * 0.8)));
    path.closePath();
    ctx.save(); ctx.translate(0.5 + lift, 0.8 + lift * 1.4); ctx.fillStyle = `rgba(40,20,15,${0.18 + lift * 0.15})`; ctx.fill(path); ctx.restore();
    ctx.fillStyle = f.col; ctx.globalAlpha *= 0.94; ctx.fill(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.5; ctx.stroke(path);
    if (f.r > 3.4) { ctx.strokeStyle = 'rgba(190,170,130,0.45)'; ctx.beginPath(); ctx.moveTo(-f.r * 0.4, -f.r * 0.1); ctx.lineTo(f.r * 0.3, f.r * 0.25); ctx.stroke(); }
    ctx.restore();
  }

  drawNit(ctx, x, y, a, empty, strand) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a);
    if (strand) {   // the hair it is glued to
      ctx.strokeStyle = mix(this.hair, 0.05, 0.9); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-14, 0.3); ctx.lineTo(14, -0.3); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,15,10,0.25)'; ctx.beginPath(); ctx.ellipse(0.6, 1.2, 4.2, 2, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(0, -2, 0, 2);
    g.addColorStop(0, empty ? '#fffdf6' : '#f1e6c2'); g.addColorStop(1, empty ? '#d8d2c4' : '#b9a578');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-4.4, 0); ctx.bezierCurveTo(-3.6, -2.3, 2.8, -2.2, 3.6, -0.6); ctx.lineTo(3.6, 0.6); ctx.bezierCurveTo(2.8, 2.2, -3.6, 2.3, -4.4, 0); ctx.fill();
    ctx.fillStyle = empty ? 'rgba(200,190,170,0.9)' : '#9c875c';   // the little cap it hatches through
    ctx.beginPath(); ctx.ellipse(3.8, 0, 0.8, 1.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.ellipse(-0.8, -0.9, 1.8, 0.5, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawLouse(ctx, x, y, a, size, phase, fed, walking) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(a); ctx.scale(size * 1.35, size * 1.35);
    ctx.fillStyle = 'rgba(25,12,8,0.28)'; ctx.beginPath(); ctx.ellipse(-1.5, 1.4, 7, 3.6, 0, 0, 7); ctx.fill();
    // six legs from the thorax, each ending in a claw that grips the hair
    ctx.strokeStyle = '#5c4330'; ctx.lineWidth = 0.75; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const sw = walking ? Math.sin(phase + i * 2.1 + (s > 0 ? Math.PI : 0)) * 1.1 : 0;
      const bx = 2.4 - i * 1.1, kx = bx + 1.2 - i * 1.3 + sw, ky = s * 3.6, tx = kx + 1.4 - i * 0.6 + sw * 0.5, ty = s * 5.4;
      ctx.beginPath(); ctx.moveTo(bx, s * 1.4); ctx.lineTo(kx, ky); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(tx, ty, 0.45, 0, 7); ctx.fillStyle = '#3b2a1d'; ctx.fill();
    }
    // abdomen: translucent, segmented, a dark gut if she has fed
    const ab = ctx.createRadialGradient(-4, -1, 0.5, -4, 0, 5.5);
    ab.addColorStop(0, '#c9a77c'); ab.addColorStop(1, '#7e5d3d');
    ctx.fillStyle = ab; ctx.beginPath(); ctx.ellipse(-4, 0, 5.2, 3.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(90,22,14,${0.35 + 0.45 * fed})`; ctx.beginPath(); ctx.ellipse(-3.6, 0, 2.7 * (0.6 + fed * 0.4), 1.3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(70,45,28,0.55)'; ctx.lineWidth = 0.4;
    for (let k = 0; k < 4; k++) { const sx = -7 + k * 1.6; ctx.beginPath(); ctx.moveTo(sx, -2.6 + Math.abs(k - 1.5) * 0.4); ctx.quadraticCurveTo(sx + 0.5, 0, sx, 2.6 - Math.abs(k - 1.5) * 0.4); ctx.stroke(); }
    // thorax and head
    ctx.fillStyle = '#8a6745'; ctx.beginPath(); ctx.ellipse(1.6, 0, 1.9, 2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a5a3b'; ctx.beginPath(); ctx.ellipse(4.3, 0, 1.8, 1.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140c'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(4.4, s * 1.2, 0.35, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#5c4330'; ctx.lineWidth = 0.55;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(5.6, s * 0.7); ctx.lineTo(6.6, s * 1.6); ctx.lineTo(7.6, s * 1.9); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-4.6, -1.3, 2.4, 0.7, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawBrush(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(30,10,20,0.25)'; ctx.beginPath(); ctx.ellipse(3, 5, 31, 29, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, 32);
    g.addColorStop(0, '#ffd3e3'); g.addColorStop(1, '#ea7fa8');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 29, 0, 7); ctx.fill();
    // soft silicone bristles
    for (let ring = 0; ring < 3; ring++) {
      const r = 8 + ring * 7.5, n = 6 + ring * 6;
      for (let i = 0; i < n; i++) {
        const an = i / n * 6.283 + ring * 0.3 + Math.sin(this.t * 30) * 0.03;
        ctx.fillStyle = 'rgba(255,240,246,0.9)'; ctx.beginPath(); ctx.arc(Math.cos(an) * r, Math.sin(an) * r, 2.1, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(190,70,110,0.35)'; ctx.beginPath(); ctx.arc(Math.cos(an) * r + 0.6, Math.sin(an) * r + 0.8, 1.4, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawComb(ctx, cb) {
    const r = this.teeth(cb.x, cb.y), x = cb.x;
    ctx.save();
    // what it has caught, stuck between the teeth
    for (const it of cb.load) {
      if (it.kind === 'louse') this.drawLouse(ctx, x + it.ox, cb.y + it.oy, -Math.PI / 2, it.ref.size, this.t * 8, it.ref.fed, true);
      else this.drawNit(ctx, x + it.ox, cb.y + it.oy, -Math.PI / 2, it.ref.empty, false);
    }
    ctx.fillStyle = 'rgba(20,10,10,0.25)'; ctx.fillRect(r.x0 + 3, r.y0 + 4, COMB_W, r.y1 - r.y0 + 10);
    // fine steel teeth
    const tg = ctx.createLinearGradient(0, r.y0, 0, r.y1);
    tg.addColorStop(0, '#e8edf2'); tg.addColorStop(1, '#8e98a3');
    ctx.fillStyle = tg;
    for (let tx = r.x0; tx <= r.x1; tx += 3.4) ctx.fillRect(tx, r.y0, 1.4, r.y1 - r.y0);
    // spine and handle
    const sg = ctx.createLinearGradient(0, r.y1, 0, r.y1 + 8);
    sg.addColorStop(0, '#f4f7fa'); sg.addColorStop(0.5, '#a9b3bd'); sg.addColorStop(1, '#6d7680');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.roundRect(r.x0 - 3, r.y1, COMB_W + 6, 8, 3); ctx.fill();
    const hg = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    hg.addColorStop(0, '#2f9e86'); hg.addColorStop(0.4, '#6fd8bd'); hg.addColorStop(1, '#22806b');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.roundRect(x - 14, r.y1 + 6, 28, 64, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 9, r.y1 + 12, 3, 50);
    ctx.restore();
  }
}
