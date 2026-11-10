// Pimple types, their squeeze/drain state machine, and drawing.

import { drawWorm, drawStar } from './fx.js';
import { rgba } from './skin.js';
import * as audio from './audio.js';
import { buzz } from './haptics.js';

// Timing for releasing after a pimple is empty
export const PERFECT_WINDOW = 0.3;  // seconds
export const NICE_WINDOW = 0.7;     // after this it starts bleeding

export const TYPES = {
  white: {
    name: 'Whitehead', r: [11, 16], fill: [0.9, 1.3], pus: [0.8, 1.3], drain: 0.95,
    head: '#fbf1cf', headRim: '#eedb95', pusColor: '#f3e2a0', stages: 1, popPts: 100,
    wormW: 0.55, lenPerMl: 70, squirt: 14,
  },
  black: {
    name: 'Blackhead', r: [6, 9], fill: [0.35, 0.55], pus: [0.35, 0.55], drain: 0.8,
    head: '#3b2a20', headRim: '#21160f', pusColor: '#eadca5', tipColor: '#2e2018', stages: 1, popPts: 60,
    wormW: 0.85, lenPerMl: 55, squirt: 3, plug: 0.35,
  },
  cyst: {
    name: 'Cyst', r: [19, 24], fill: [1.4, 1.8], pus: [1.2, 1.6], drain: 0.85,
    head: '#f2e3a6', headRim: '#d9c16b', pusColor: '#e6d27c', stages: 3, popPts: 120,
    wormW: 0.42, lenPerMl: 62, squirt: 22,
  },
  gold: {
    name: 'Golden', r: [12, 14], fill: [1.0, 1.1], pus: [1.0, 1.2], drain: 1.0,
    head: '#fff1a8', headRim: '#f4c430', pusColor: '#ffd84d', stages: 1, popPts: 400,
    wormW: 0.55, lenPerMl: 70, squirt: 18, golden: true,
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

let nextId = 1;

export class Pimple {
  constructor(type, x, y, scale) {
    const T = TYPES[type];
    this.id = nextId++;
    this.type = type;
    this.T = T;
    this.x = x;
    this.y = y;
    this.scale = scale;
    this.r = rand(T.r[0], T.r[1]) * scale;
    this.fillTime = rand(T.fill[0], T.fill[1]);
    this.stagePus = rand(T.pus[0], T.pus[1]);
    this.stage = 0;
    this.state = 'spawn';   // spawn → idle → pressing → popped → empty → done
    this.spawnT = 0;
    this.pressure = 0;
    this.pusLeft = 0;
    this.held = null;       // pointerId holding it
    this.emptyT = 0;
    this.bled = false;
    this.rating = null;
    this.heal = 0;
    this.worm = null;
    this.seed = Math.random() * 1000;
    this.time = 0;
    this.lastTick = 0;
    this.bloodT = 0;
    this.pusDrained = 0;
  }

  get active() { return this.state !== 'done'; }
  get grabbable() { return this.state !== 'done' && this.state !== 'spawn' || (this.state === 'spawn' && this.spawnT > 0.5); }

  hitRadius() { return this.r * 1.6 + 16; }

  press(id) {
    if (this.state === 'spawn') this.state = 'idle';
    this.held = id;
    if (this.state === 'idle') this.state = 'pressing';
    if (this.state === 'popped') audio.oozeStart();
    buzz('light');
    audio.squish(this.pressure);
  }

  release(game) {
    this.held = null;
    if (this.state === 'popped') audio.oozeStop();
    if (this.state === 'empty') this.finish(game);
    else if (this.state === 'pressing' && this.pressure < 0.02) this.state = 'idle';
  }

  newWorm() {
    const T = this.T;
    const sc = this.scale;
    const len = this.stagePus * T.lenPerMl * sc + 10;
    const angle = Math.random() * Math.PI * 2;
    const curl = (Math.random() < 0.5 ? -1 : 1) * rand(0.012, 0.03);
    const step = 1.5;
    const pts = [{ x: this.x, y: this.y }];
    let a = angle, x = this.x, y = this.y;
    const n = Math.ceil(len / step);
    for (let i = 1; i <= n; i++) {
      const d = i * step;
      a += curl * step * (1 + d / 90) + Math.sin(d * 0.08 + this.seed) * 0.02;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push({ x, y });
    }
    const w = Math.max(3, this.r * T.wormW * 1.1);
    this.worm = { pts, n: 1, total: pts.length, w, angle };
  }

  pop(game) {
    const T = this.T;
    this.state = 'popped';
    this.pusLeft = this.stagePus;
    this.pressure = 1;
    this.newWorm();
    const a = this.worm.angle;
    game.fx.squirt(this.x, this.y, a, T.squirt, {
      color: T.pusColor, speed: 160 + this.r * 9, spread: 0.45, size: Math.max(1.6, this.r * 0.2), lift: 120 + this.r * 6,
    });
    if (T.golden) game.fx.sparkleBurst(this.x, this.y, 16);
    audio.pop(this.r / (13 * this.scale));
    buzz('heavy');
    game.onPop(this);
    if (this.held != null) audio.oozeStart();
  }

  detachWorm(game) {
    const wm = this.worm;
    if (!wm || wm.n < 2) { this.worm = null; return; }
    const pts = wm.pts.slice(0, wm.n);
    const plug = this.T.plug ? Math.floor(wm.total * this.T.plug) : 0;
    game.fx.wormSplat(pts, wm.w, this.T.pusColor, this.T.tipColor, plug);
    this.worm = null;
  }

  finish(game) {
    let rating;
    if (this.bled) rating = 'ouch';
    else if (this.emptyT <= PERFECT_WINDOW) rating = 'perfect';
    else rating = 'nice';
    this.rating = rating;
    this.state = 'done';
    this.heal = 0;
    this.detachWorm(game);
    game.onFinish(this, rating);
  }

  update(dt, game) {
    this.time += dt;
    const T = this.T;
    if (this.state === 'spawn') {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
      if (this.spawnT >= 1) this.state = 'idle';
      return;
    }

    if (this.state === 'pressing' || this.state === 'idle') {
      if (this.held != null) {
        this.state = 'pressing';
        // pressure builds slowly at first, then rushes
        this.pressure = Math.min(1, this.pressure + dt / this.fillTime * (0.6 + this.pressure * 0.9));
        audio.squish(this.pressure);
        if (this.pressure - this.lastTick > 0.2) { this.lastTick = this.pressure; buzz('light'); }
        if (this.pressure >= 1) this.pop(game);
      } else {
        this.pressure = Math.max(0, this.pressure - dt * 0.35);
        this.lastTick = Math.min(this.lastTick, this.pressure);
      }
    } else if (this.state === 'popped') {
      if (this.held != null) {
        const flow = T.drain * dt * (0.6 + 0.6 * Math.min(1, this.pusLeft / this.stagePus + 0.3));
        const amt = Math.min(this.pusLeft, flow);
        this.pusLeft -= amt;
        this.pusDrained += amt;
        game.onDrain(this, amt);
        const wm = this.worm;
        const frac = 1 - this.pusLeft / this.stagePus;
        wm.n = Math.max(2, Math.floor(wm.total * frac));
        audio.oozeSet(this.pusLeft / this.stagePus);
        if (Math.random() < dt * 3) buzz('light');
        if (this.pusLeft <= 0.0001) {
          audio.oozeStop();
          this.stage++;
          if (this.stage < T.stages) {
            // cysts: another pocket of pus underneath
            this.detachWorm(game);
            this.state = 'pressing';
            this.pressure = 0.25;
            this.lastTick = 0.25;
            this.stagePus = rand(T.pus[0], T.pus[1]);
            this.fillTime *= 0.8;
            game.fx.text(this.x, this.y - this.r * 2.5, 'there\'s more…', '#ffe7a8', 16);
            buzz('medium');
          } else {
            this.state = 'empty';
            this.emptyT = 0;
            buzz('medium');
            audio.plip();
          }
        }
      }
    } else if (this.state === 'empty') {
      if (this.held != null) {
        this.emptyT += dt;
        if (this.emptyT > NICE_WINDOW) {
          if (!this.bled) {
            this.bled = true;
            audio.ouch();
            buzz('heavy');
          }
          this.bloodT += dt;
          if (this.bloodT > 0.12) {
            this.bloodT = 0;
            game.fx.squirt(this.x, this.y, Math.random() * Math.PI * 2, 2, {
              color: '#b3121f', speed: 50, spread: 3, size: Math.max(1.5, this.r * 0.18), lift: 60,
            });
          }
        }
      }
    } else if (this.state === 'done') {
      this.heal = Math.min(1, this.heal + dt * 0.12);
    }
  }

  draw(ctx, t) {
    const T = this.T;
    const r0 = this.r;
    let swell = 1;
    let x = this.x, y = this.y;
    let appear = 1;

    if (this.state === 'spawn') {
      const s = this.spawnT;
      appear = s < 1 ? 1 - Math.pow(1 - s, 3) : 1;
    }
    if (this.state === 'pressing' || this.state === 'idle') {
      swell = 1 + this.pressure * 0.35;
      if (this.pressure > 0.55) {
        const j = (this.pressure - 0.55) * 3.2 * this.scale;
        x += (Math.random() - 0.5) * j;
        y += (Math.random() - 0.5) * j;
      }
    } else if (this.state === 'popped') {
      swell = 0.85 + 0.45 * (this.pusLeft / this.stagePus);
    } else if (this.state === 'empty') {
      swell = 0.8;
    } else if (this.state === 'done') {
      swell = lerp(0.75, 0.3, this.heal);
    }
    // idle throb
    if (this.state === 'idle') swell *= 1 + Math.sin(this.time * 3 + this.seed) * 0.03;

    const r = r0 * swell * appear;
    const inflame = this.state === 'done' ? (1 - this.heal) * 0.5 : 0.45 + this.pressure * 0.35;

    // 1. inflamed halo
    const haloR = r0 * (2.4 + (this.type === 'cyst' ? 0.6 : 0)) * appear;
    const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
    halo.addColorStop(0, `rgba(214,58,58,${0.5 * inflame})`);
    halo.addColorStop(0.5, `rgba(214,70,70,${0.25 * inflame})`);
    halo.addColorStop(1, 'rgba(214,70,70,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, haloR, 0, Math.PI * 2);
    ctx.fill();

    if (this.state === 'done') {
      // healing mark
      const a = 1 - this.heal;
      ctx.fillStyle = `rgba(150,30,35,${0.55 * a + 0.1})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.5, r0 * 0.22), 0, Math.PI * 2);
      ctx.fill();
      if (this.bled && this.heal < 0.6) {
        ctx.fillStyle = `rgba(140,10,20,${0.7 * (1 - this.heal / 0.6)})`;
        ctx.beginPath();
        ctx.arc(x, y, r0 * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // 2. the bump (fake 3D with offset highlight + shadow)
    const bumpR = r * 1.25;
    ctx.fillStyle = 'rgba(90,20,20,0.18)';
    ctx.beginPath();
    ctx.arc(x + bumpR * 0.12, y + bumpR * 0.18, bumpR, 0, Math.PI * 2);
    ctx.fill();
    const bump = ctx.createRadialGradient(x - bumpR * 0.35, y - bumpR * 0.4, bumpR * 0.05, x, y, bumpR);
    bump.addColorStop(0, 'rgba(255,215,205,0.95)');
    bump.addColorStop(0.45, `rgba(232,${Math.round(120 - this.pressure * 40)},${Math.round(115 - this.pressure * 40)},0.95)`);
    bump.addColorStop(1, 'rgba(205,85,85,0)');
    ctx.fillStyle = bump;
    ctx.beginPath();
    ctx.arc(x, y, bumpR, 0, Math.PI * 2);
    ctx.fill();

    // 3. head / opening
    if (this.state === 'popped' || this.state === 'empty') {
      ctx.fillStyle = this.bled ? '#8d0f1a' : '#7a2320';
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2, r0 * 0.3), 0, Math.PI * 2);
      ctx.fill();
      if (this.bled) {
        ctx.fillStyle = 'rgba(179,18,31,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, r0 * (0.45 + Math.min(this.emptyT - NICE_WINDOW, 2) * 0.2), 0, Math.PI * 2);
        ctx.fill();
      }
      if (this.worm) drawWorm(ctx, this.worm.pts, this.worm.n, this.worm.w, T.pusColor, T.tipColor,
        T.plug ? Math.floor(this.worm.total * T.plug) : 0);
    } else {
      let hr;
      if (this.type === 'black') hr = r0 * 0.55;
      else if (this.type === 'cyst') hr = r0 * (0.18 + this.pressure * 0.32);
      else hr = r0 * (0.42 + this.pressure * 0.28);
      hr *= appear;
      const hg = ctx.createRadialGradient(x - hr * 0.35, y - hr * 0.4, hr * 0.1, x, y, hr);
      if (this.type === 'black') {
        hg.addColorStop(0, '#6b5444');
        hg.addColorStop(0.6, T.head);
        hg.addColorStop(1, T.headRim);
      } else {
        hg.addColorStop(0, '#ffffff');
        hg.addColorStop(0.45, T.head);
        hg.addColorStop(1, T.headRim);
      }
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y, hr, 0, Math.PI * 2);
      ctx.fill();
      // glint
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(x - hr * 0.35, y - hr * 0.4, hr * 0.28, hr * 0.18, -0.6, 0, Math.PI * 2);
      ctx.fill();
      if (T.golden) {
        const s = 0.5 + 0.5 * Math.sin(t * 5 + this.seed);
        drawStar(ctx, x + r * 1.1, y - r * 0.9, 3 + s * 4, `rgba(255,240,160,${0.5 + s * 0.5})`);
        drawStar(ctx, x - r * 1.2, y + r * 0.6, 2 + (1 - s) * 3, `rgba(255,240,160,${0.4 + (1 - s) * 0.5})`);
      }
    }
  }

  /** Progress ring shown while you're working on a pimple. */
  drawRing(ctx, t) {
    if (this.state === 'done' || this.state === 'spawn') return;
    const showing = this.held != null || this.state === 'popped' || (this.state === 'pressing' && this.pressure > 0.02);
    if (!showing) return;
    const R = this.r * 1.9 + 14;
    const x = this.x, y = this.y;
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(40,10,20,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.stroke();

    let frac, color;
    if (this.state === 'pressing' || this.state === 'idle') {
      frac = this.pressure;
      color = this.pressure > 0.75 ? '#ff6f91' : '#ffffff';
    } else if (this.state === 'popped') {
      frac = this.pusLeft / this.stagePus;
      color = this.T.pusColor;
    } else {
      frac = 1;
      color = this.bled ? '#e0283a' : (this.emptyT <= PERFECT_WINDOW ? '#7dff9a' : '#c6f27a');
    }
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.stroke();

    if (this.state === 'empty' && !this.bled) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 20);
      ctx.strokeStyle = `rgba(125,255,154,${0.3 + pulse * 0.4})`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(x, y, R + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = '900 15px ui-rounded, -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(30,60,30,0.7)';
      ctx.strokeText('LET GO!', x, y - R - 16);
      ctx.fillStyle = '#b8ffc6';
      ctx.fillText('LET GO!', x, y - R - 16);
    }

    // stage pips for cysts
    if (this.T.stages > 1) {
      for (let i = 0; i < this.T.stages; i++) {
        ctx.fillStyle = i < this.stage ? '#ffe17a' : 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(x + (i - (this.T.stages - 1) / 2) * 12, y + R + 12, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function pusColorRgba(type, a) { return rgba(TYPES[type].pusColor, a); }
