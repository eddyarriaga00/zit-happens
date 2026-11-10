// The things on the tray: cleanser bottle, wet wipes, cotton pad jar, gel tube,
// steamer and the bin. Each one has to be opened / switched on and used by hand.
//
//   bottle / tube : tap to open, tap to pump dollops onto the face (3 pumps)
//   wipes / pads  : tap to open, tap to pull one out; it gets dirty as you wipe
//   bin           : tap to throw the dirty one away
//   steamer       : tap to switch on

import * as audio from './audio.js';
import { buzz } from './haptics.js';

const PUMPS = 3;
// How each container opens: drag direction and the instruction shown in the close-up.
const OPEN = {
  pads: { dx: 0, dy: -1, text: 'Lift the lid off' },
  wipes: { dx: 1, dy: 0, text: 'Peel the seal back' },
  soap: { dx: 1, dy: 0, text: 'Twist the pump to unlock' },
  gel: { dx: 0, dy: 1, text: 'Pull the cap off' },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const HIT = 46;

const lerp = (a, b, t) => a + (b - a) * t;
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export class Supplies {
  constructor(G) {
    this.G = G;
    this.items = [];
    this.key = '';
    this.cloth = null;      // { kind: 'wipes' | 'pads', dirt: 0..1 }
    this.hand = null;       // where the finger holding the cloth is
    this.dollops = [];
    this.flying = [];       // cloths arcing into the bin
    this.opened = {};       // containers stay open for the rest of the patient
    this.nagT = 0;
    this.time = 0;
    this.closeup = null;    // a container held up close while you open it by hand
  }

  /** Which supplies belong on the tray right now. */
  wanted() {
    const G = this.G;
    if (G.mode !== 'level' && G.mode !== 'zen') return 'none';
    if (G.ended) return 'none';
    if (G.treat && G.treat.active) return G.treat.phase;
    return G.tool === 'pad' ? 'pads' : 'none';
  }

  sync() {
    const key = this.wanted();
    if (key === this.key) return;
    this.key = key;
    const G = this.G;
    const toolbar = key === 'pads';
    const y = G.H - G.safeBottom - (toolbar ? 152 : 70);
    const L = 50, R = G.W - 54;
    const make = (type, x) => ({ type, x, y, open: !!this.opened[type], pumps: 0, on: false, bounce: 0, press: 0 });
    this.closeup = null;
    this.items = [];
    this.dollops = [];
    if (key === 'lather') this.items.push(make('soap', R));
    if (key === 'rinse') this.items.push(make('wipes', R), make('bin', L));
    if (key === 'steam') this.items.push(make('steamer', G.W / 2));
    if (key === 'pads') this.items.push(make('pads', R), make('bin', L));
    if (key === 'soothe') this.items.push(make('gel', R));
    // a cloth from another step doesn't carry over
    const kind = key === 'rinse' ? 'wipes' : key === 'pads' ? 'pads' : null;
    if (this.cloth && key !== 'none' && this.cloth.kind !== kind) this.cloth = null;
    this.hand = null;
  }

  item(type) { return this.items.find((i) => i.type === type); }

  ready(type) {
    const it = this.item(type);
    if (!it) return true;   // nothing to operate (shouldn't block play)
    return type === 'steamer' ? it.on : it.pumps >= PUMPS;
  }

  /** Floating reminder next to the thing that needs doing. */
  nag(type, msg) {
    if (this.nagT > 0) return;
    this.nagT = 1.6;
    const it = this.item(type);
    if (!it) return;
    it.bounce = 1;
    const x = Math.max(110, Math.min(this.G.W - 110, it.x));
    this.G.fx.text(x, it.y - 64, msg, '#ffe7a8', 15);
    buzz('light');
  }

  /** The cloth in hand, if it can still clean. Nags otherwise. */
  useCloth(kind) {
    const c = this.cloth;
    const name = kind === 'pads' ? 'cotton pad' : 'wipe';
    if (!c) {
      const it = this.item(kind);
      this.nag(kind, it && !it.open ? `open the ${kind === 'pads' ? 'cotton pads' : 'wipes'}` : `grab a ${name}`);
      return null;
    }
    if (c.dirt >= 1) { this.nag('bin', `that ${name} is dirty — bin it`); return null; }
    return c;
  }

  // ---- input
  // Returns false (not ours), true (handled), or 'grab' (a fresh wipe/pad is now in
  // this finger: keep wiping with it).
  down(x, y, id) {
    const c = this.closeup;
    if (c) {
      if (!c.done) { c.id = id; c.sx = x; c.sy = y; c.p0 = c.p; }
      return true;
    }
    for (const it of this.items) {
      if (Math.hypot(it.x - x, it.y - y) > HIT) continue;
      it.bounce = 1;
      return this.tap(it) === 'grab' ? 'grab' : true;
    }
    return false;
  }

  move(id, x, y) {
    const c = this.closeup;
    if (!c || c.done || c.id !== id) return;
    const g = OPEN[c.it.type];
    const before = c.p;
    c.p = clamp01(c.p0 + ((x - c.sx) * g.dx + (y - c.sy) * g.dy) / 110);
    if (c.p > before) { audio.squish(c.p); if (Math.floor(c.p * 6) > Math.floor(before * 6)) buzz('light'); }
    if (c.p >= 1) {
      c.done = 0.001;
      c.it.open = true;
      this.opened[c.it.type] = true;
      audio.cap();
      audio.sparkle();
      buzz('heavy');
      this.G.fx.sparkleBurst(this.G.W / 2, this.G.H * 0.46, 16);
    }
  }

  up(id) {
    if (this.closeup && this.closeup.id === id) this.closeup.id = null;
  }

  /** Letting go of a wipe/pad over the bin throws it away. */
  dropAt(x, y) {
    const bin = this.item('bin');
    if (!this.cloth || !bin || Math.hypot(bin.x - x, bin.y - y) > HIT + 12) return false;
    this.toss(bin, x, y);
    return true;
  }

  toss(bin, fromX = this.parkX(), fromY = this.parkY()) {
    this.flying.push({ ...this.cloth, x: fromX, y: fromY, t: 0, bx: bin.x, by: bin.y });
    this.cloth = null;
    this.hand = null;
    bin.bounce = 1;
    audio.wipe(0.3);
  }

  tap(it) {
    const G = this.G;
    const t = it.type;
    if (t === 'soap' || t === 'gel') {
      if (!it.open) return this.startCloseup(it);
      if (it.pumps >= PUMPS) return;
      it.pumps++;
      it.press = 1;
      audio.squish(0.8); audio.bloop(); buzz('medium');
      // a dollop flies out and lands on the face
      const top = G.safeTop + 130, bottom = G.H - G.safeBottom - 190;
      this.dollops.push({
        x: it.x, y: it.y - 40,
        ...(() => { const p = G.geo ? G.geo.anyPoint() : { x: 50 + Math.random() * (G.W - 100), y: top + Math.random() * Math.max(60, bottom - top) }; return { tx: p.x, ty: p.y }; })(),
        t: 0, r: (16 + Math.random() * 8) * G.scale, color: t === 'soap' ? '#ffffff' : '#8fe3c2',
      });
      if (it.pumps === PUMPS) G.fx.text(G.W / 2, G.H * 0.42, t === 'soap' ? 'now rub it in!' : 'now spread it!', '#8dffa8', 20);
    } else if (t === 'wipes' || t === 'pads') {
      if (!it.open) return this.startCloseup(it);
      const name = t === 'pads' ? 'pad' : 'wipe';
      if (this.cloth && this.cloth.dirt >= 0.6) return this.nag('bin', `bin the dirty ${name} first`);
      if (this.cloth) return;
      this.cloth = { kind: t, dirt: 0, pull: 1 };
      audio.wipe(1); audio.plip(); buzz('light');
      return 'grab';
    } else if (t === 'bin') {
      if (this.cloth) this.toss(it);
    } else if (t === 'steamer') {
      it.on = !it.on;
      audio.click(); audio.cap(); buzz('medium');
    }
  }

  startCloseup(it) {
    this.closeup = { it, p: 0, p0: 0, id: null, sx: 0, sy: 0, t: 0, done: 0 };
    audio.click();
    buzz('light');
  }

  /** Rubbing over a dollop works it into the skin. */
  hitDollops(x, y) {
    for (let i = this.dollops.length - 1; i >= 0; i--) {
      const d = this.dollops[i];
      if (d.t >= 1 && Math.hypot(d.tx - x, d.ty - y) < d.r + 34) {
        this.dollops.splice(i, 1);
        audio.bloop();
        return d;
      }
    }
    return null;
  }

  parkX() { const p = this.item('pads') || this.item('wipes'); return p ? p.x - 4 : this.G.W - 54; }
  parkY() { const p = this.item('pads') || this.item('wipes'); return p ? p.y - 84 : this.G.H - 200; }

  update(dt) {
    this.time += dt;
    this.nagT = Math.max(0, this.nagT - dt);
    for (const it of this.items) {
      it.bounce = Math.max(0, it.bounce - dt * 4);
      it.press = Math.max(0, it.press - dt * 5);
    }
    const c = this.closeup;
    if (c) {
      c.t = Math.min(1, c.t + dt * 6);
      if (c.done) { c.done += dt; if (c.done > 0.55) this.closeup = null; }
      else if (c.id == null) c.p = Math.max(0, c.p - dt * 0.9);   // let go early and it eases shut
    }
    for (const d of this.dollops) d.t = Math.min(1, d.t + dt * 2.6);
    if (this.cloth) this.cloth.pull = Math.min(1, this.cloth.pull + dt * 5);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt * 2.4;
      if (f.t >= 1) {
        this.flying.splice(i, 1);
        audio.thud();
        buzz('light');
        const bin = this.item('bin');
        if (bin) bin.bounce = 1;
      }
    }
  }

  /** Which item should pulse to show "do this next". */
  nextUp() {
    const k = this.key;
    if (k === 'lather' && !this.ready('soap')) return 'soap';
    if (k === 'soothe' && !this.ready('gel')) return 'gel';
    if (k === 'steam' && !this.ready('steamer')) return 'steamer';
    if (k === 'rinse' || k === 'pads') {
      if (!this.cloth) return k === 'rinse' ? 'wipes' : (this.G.fx.messLeft() > 0.5 ? 'pads' : null);
      if (this.cloth.dirt >= 1) return 'bin';
    }
    return null;
  }

  // ---- drawing
  draw(ctx) {
    const next = this.nextUp();
    for (const it of this.items) {
      const s = 1 + Math.sin(it.bounce * Math.PI) * 0.14;
      ctx.save();
      ctx.translate(it.x, it.y);
      // tray plate
      ctx.fillStyle = 'rgba(255,120,178,0.62)';
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.fill();
      if (it.type === next) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(255,225,122,${0.45 + p * 0.5})`;
        ctx.lineWidth = 3 + p * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 44 + p * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.scale(s, s);
      this['draw_' + it.type](ctx, it, it.open ? 1 : 0);
      if (!it.open && OPEN[it.type]) this.lock(ctx);
      ctx.restore();
    }

    // dollops on the face
    for (const d of this.dollops) {
      const k = d.t, e = 1 - (1 - k) * (1 - k);
      const x = lerp(d.x, d.tx, e), y = lerp(d.y, d.ty, e) - Math.sin(k * Math.PI) * 90;
      const r = d.r * (k < 1 ? 0.6 : 1);
      ctx.fillStyle = 'rgba(60,20,10,0.18)';
      ctx.beginPath(); ctx.ellipse(lerp(d.x, d.tx, e) + 2, lerp(d.y, d.ty, e) + 4, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.7, y + r * 0.25, r * 0.6, 0, Math.PI * 2);
      ctx.arc(x - r * 0.6, y + r * 0.35, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.4, r * 0.3, r * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
    }

    // cloths on their way to the bin
    for (const f of this.flying) {
      const x = lerp(f.x, f.bx, f.t), y = lerp(f.y, f.by - 20, f.t) - Math.sin(f.t * Math.PI) * 80;
      this.drawCloth(ctx, f, x, y, 1 - f.t * 0.6, f.t * 5);
    }

    // the cloth in hand: under the finger while wiping, parked by its pack otherwise
    if (this.cloth && this.item(this.cloth.kind)) {
      const c = this.cloth;
      const px = this.parkX(), py = lerp(this.parkY() + 70, this.parkY(), c.pull);
      if (this.hand) this.drawCloth(ctx, c, this.hand.x, this.hand.y, 1.15, 0);
      else {
        this.drawCloth(ctx, c, px, py, 0.85, 0);
        // how dirty it is
        ctx.lineCap = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(40,10,20,0.35)';
        ctx.beginPath(); ctx.arc(px, py, 36, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = c.dirt >= 1 ? '#ff6b78' : '#ffe17a';
        ctx.beginPath(); ctx.arc(px, py, 36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, c.dirt)); ctx.stroke();
      }
    }
  }

  /** The container held up close, with its lid/seal/cap following your finger. */
  drawCloseup(ctx) {
    const c = this.closeup;
    if (!c) return;
    const G = this.G, g = OPEN[c.it.type];
    const out = c.done ? clamp01((c.done - 0.3) / 0.25) : 0;
    const e = (1 - Math.pow(1 - c.t, 3)) * (1 - out);
    const cx = G.W / 2, cy = G.H * 0.46;
    ctx.fillStyle = `rgba(120,20,70,${0.72 * e})`;
    ctx.fillRect(0, 0, G.W, G.H);
    ctx.save();
    ctx.translate(lerp(c.it.x, cx, e), lerp(c.it.y, cy, e));
    ctx.scale(1 + 2.6 * e, 1 + 2.6 * e);
    this['draw_' + c.it.type](ctx, c.it, c.done ? 1 : c.p);
    ctx.restore();
    if (c.done) return;
    ctx.globalAlpha = e;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 22px ui-rounded, -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#fff4ef';
    ctx.fillText(g.text, cx, cy - 225);
    // drifting chevrons showing which way to drag
    const ang = Math.atan2(g.dy, g.dx);
    for (let i = 0; i < 3; i++) {
      const k = ((this.time * 1.4 + i / 3) % 1);
      const d = -40 + k * 80;
      const ax = cx + g.dx * d + (g.dy ? 0 : 0), ay = cy + 165 + g.dy * d;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.globalAlpha = e * Math.sin(k * Math.PI);
      ctx.strokeStyle = '#ffe17a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(6, 0); ctx.lineTo(-8, 10); ctx.stroke();
      ctx.restore();
    }
    // progress bar
    ctx.globalAlpha = e;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    rr(ctx, cx - 70, cy + 205, 140, 8, 4); ctx.fill();
    ctx.fillStyle = '#8dffa8';
    rr(ctx, cx - 70, cy + 205, 140 * c.p, 8, 4); ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawCloth(ctx, c, x, y, scale, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    const d = Math.min(1, c.dirt);
    ctx.fillStyle = 'rgba(40,15,10,0.22)';
    if (c.kind === 'pads') {
      ctx.beginPath(); ctx.arc(2, 4, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = mix('#ffffff', '#cdb45a', d);
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      // quilted stitching
      ctx.strokeStyle = 'rgba(120,100,80,0.28)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      rr(ctx, -32, -26, 68, 60, 8); ctx.fill();
      ctx.fillStyle = mix('#f4fbff', '#a39683', d);
      rr(ctx, -34, -30, 68, 60, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(90,110,130,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-34, -6); ctx.quadraticCurveTo(0, 2, 34, -8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, -30); ctx.quadraticCurveTo(2, 0, -6, 30); ctx.stroke();
    }
    // grime blotches as it fills up
    if (d > 0.15) {
      ctx.fillStyle = c.kind === 'pads' ? `rgba(190,150,40,${d * 0.55})` : `rgba(90,70,55,${d * 0.4})`;
      ctx.beginPath();
      ctx.arc(-8, 5, 11 * d + 3, 0, Math.PI * 2);
      ctx.arc(10, -8, 8 * d + 2, 0, Math.PI * 2);
      ctx.arc(6, 12, 6 * d + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Containers take p = how far open (0 shut .. 1 open), so the close-up can
  // show the lid, seal or cap moving under your finger.
  draw_soap(ctx, it, p) {
    ctx.fillStyle = '#ffa9cd';
    rr(ctx, -17, -14, 34, 44, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    rr(ctx, -12, -8, 7, 30, 4); ctx.fill();
    ctx.fillStyle = '#ffffff';
    rr(ctx, -11, 2, 22, 16, 4); ctx.fill();
    ctx.fillStyle = '#ff4f9a';
    ctx.beginPath(); ctx.arc(0, 10, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9f4fb';
    rr(ctx, -6, -22, 12, 9, 2); ctx.fill();
    // pump head: twists out and pops up when unlocked, dips when pressed
    const hy = lerp(-23, -30, p) + Math.sin(it.press * Math.PI) * 6;
    const len = lerp(4, 20, p);
    ctx.fillStyle = '#c9dbe8';
    rr(ctx, -2, hy + 2, 4, -hy - 20, 1); ctx.fill();
    ctx.fillStyle = '#ffffff';
    rr(ctx, -5, hy - 4, 10, 8, 2); ctx.fill();
    rr(ctx, -len, hy - 8, len + 5, 6, 3); ctx.fill();
    this.pips(ctx, it);
  }

  draw_gel(ctx, it, p) {
    ctx.fillStyle = '#7fd9b8';
    ctx.beginPath();
    ctx.moveTo(-16, -26); ctx.lineTo(16, -26); ctx.lineTo(11, 14); ctx.lineTo(-11, 14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5cc09c';
    rr(ctx, -17, -30, 34, 6, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    rr(ctx, -9, -20, 6, 28, 3); ctx.fill();
    ctx.fillStyle = '#eafff7';
    rr(ctx, -5, 14, 10, 5, 2); ctx.fill();            // nozzle
    ctx.fillStyle = '#ffffff';
    if (p >= 1) { rr(ctx, 16, 16, 14, 10, 3); ctx.fill(); }   // cap set down beside it
    else {
      rr(ctx, -9, 14 + p * 16, 18, 12, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(120,160,150,0.5)';
      ctx.lineWidth = 1;
      for (const x of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(x, 16 + p * 16); ctx.lineTo(x, 24 + p * 16); ctx.stroke(); }
    }
    this.pips(ctx, it);
  }

  draw_wipes(ctx, it, p) {
    ctx.fillStyle = '#ff9ec4';
    rr(ctx, -30, -18, 60, 40, 9); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    rr(ctx, -30, -18, 60, 9, 5); ctx.fill();
    ctx.fillStyle = '#d8438a';
    rr(ctx, -15, -6, 30, 14, 6); ctx.fill();          // the opening
    if (p > 0.4) {
      ctx.globalAlpha *= clamp01((p - 0.4) / 0.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-4, -22, 2, -14); ctx.quadraticCurveTo(8, -24, 9, 2);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha /= clamp01((p - 0.4) / 0.4);
    }
    // sticky seal peeling off to the right
    const fx = lerp(-18, 14, p), fw = lerp(36, 9, p);
    ctx.fillStyle = '#fff0f6';
    rr(ctx, fx, -9, fw, 20, 5); ctx.fill();
    if (p > 0.02 && p < 1) {
      ctx.fillStyle = '#ffc9de';
      ctx.beginPath(); ctx.ellipse(fx, 1, 4, 10, 0, 0, Math.PI * 2); ctx.fill();   // curled edge
    }
  }

  draw_pads(ctx, it, p) {
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    rr(ctx, -22, -18, 44, 46, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    rr(ctx, -22, -18, 44, 46, 10); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(150,150,160,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.ellipse(0, 20 - i * 9, 17, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#f0b8c8';
    if (p >= 1) { rr(ctx, 12, 20, 26, 8, 4); ctx.fill(); return; }   // lid set down beside it
    ctx.save();
    ctx.translate(12 * p, -34 * p);
    ctx.rotate(0.45 * p);
    rr(ctx, -24, -26, 48, 11, 5); ctx.fill();
    ctx.fillStyle = '#e0709a';
    ctx.beginPath(); ctx.arc(0, -29, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  draw_bin(ctx, it) {
    ctx.fillStyle = '#e89bbd';
    ctx.beginPath();
    ctx.moveTo(-19, -12); ctx.lineTo(19, -12); ctx.lineTo(14, 26); ctx.lineTo(-14, 26);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (const x of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x * 0.8, 20); ctx.stroke(); }
    // swing lid
    ctx.save();
    ctx.translate(0, -15);
    ctx.rotate(-Math.sin(it.bounce * Math.PI) * 0.5);
    ctx.fillStyle = '#f6bfd6';
    rr(ctx, -23, -5, 46, 8, 4); ctx.fill();
    ctx.restore();
  }

  draw_steamer(ctx, it) {
    ctx.fillStyle = '#f4f1f6';
    rr(ctx, -24, -8, 48, 34, 12); ctx.fill();
    ctx.fillStyle = '#d7d1de';
    rr(ctx, -12, -28, 24, 22, 8); ctx.fill();       // nozzle
    ctx.fillStyle = '#b8b0c2';
    rr(ctx, -8, -31, 16, 6, 3); ctx.fill();
    // power light
    ctx.fillStyle = it.on ? '#5dff8f' : '#ff5a6a';
    ctx.beginPath(); ctx.arc(0, 10, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(-2, 8, 2, 0, Math.PI * 2); ctx.fill();
    if (it.on) {
      const p = this.time * 3;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 3; i++) {
        const k = (p + i / 3) % 1;
        ctx.beginPath(); ctx.arc(Math.sin(k * 6 + i) * 6, -34 - k * 34, 5 + k * 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /** "tap to open" badge */
  lock(ctx) {
    ctx.fillStyle = '#ff4f9a';
    rr(ctx, -22, 30, 44, 15, 7); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 9.5px ui-rounded, -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OPEN ME', 0, 38);
  }

  /** pump counter under a bottle */
  pips(ctx, it) {
    if (!it.open) return;
    for (let i = 0; i < PUMPS; i++) {
      ctx.fillStyle = i < it.pumps ? '#8dffa8' : 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc((i - 1) * 11, 37, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}
