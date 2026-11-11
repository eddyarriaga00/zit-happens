// The spa steps around the popping: lather → rinse → steam → (pop, wipe) → soothe.
// Foam and gel are painted onto a coarse grid covering the screen.

import * as audio from './audio.js';
import { buzz } from './haptics.js';

const CELL = 26;
// How much of the face must be done before a step counts. High, so nothing is left
// half-covered; the big brush and the missed-spot hints keep it easy.
const GOALS = { lather: 0.94, rinse: 0.97, steam: 1, soothe: 0.94, mask: 0.94, dry: 1, peel: 0.97 };
const FILM = ['soothe', 'mask', 'dry', 'peel'];   // phases that show a layer over the skin

export class Treatment {
  constructor(G) {
    this.G = G;
    this.cols = Math.ceil(G.W / CELL);
    this.rows = Math.ceil(G.H / CELL);
    const n = this.cols * this.rows;
    this.foam = new Float32Array(n);
    this.gel = new Float32Array(n);
    // per-cell random offsets so bubbles don't sit on a visible grid
    this.jit = new Float32Array(n * 4);
    for (let i = 0; i < this.jit.length; i++) this.jit[i] = Math.random();
    // on face levels only the cells over skin count (no lathering the wall or the hair)
    this.mask = new Uint8Array(n);
    this.cells = 0;        // how many grid cells are over skin
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const on = G.geo ? G.geo.onSkin((col + 0.5) * CELL, (row + 0.5) * CELL) : true;
        this.mask[row * this.cols + col] = on ? 1 : 0;
        if (on) this.cells++;
      }
    }
    this.cells = Math.max(1, this.cells);
    // masks and gel are kept off the eyes, brows and lips, so those cells never need covering
    this.hole = new Uint8Array(n);
    this.holeN = 0;
    if (G.geo && G.geo.eyes) {
      const g = G.geo, lb = g.lipsBox, lx = (lb[0] + lb[2]) / 2, ly = (lb[1] + lb[3]) / 2;
      const inE = (x, y, ox, oy, rx, ry) => ((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2 < 1;
      for (let i = 0; i < n; i++) {
        if (!this.mask[i]) continue;
        const x = (i % this.cols + 0.5) * CELL, y = (Math.floor(i / this.cols) + 0.5) * CELL;
        const h = y < g.hairlineY + g.hh * 0.04 || inE(x, y, lx, ly, (lb[2] - lb[0]) * 0.56, (lb[3] - lb[1]) * 0.66)
          || g.eyes.some((e) => inE(x, y, e.x, e.y - e.ry * 0.2, e.rx * 1.3, e.ry * 2.0) || inE(x, y, e.x, g.browY - g.hh * 0.012, g.hw * 0.31, g.hh * 0.045));
        if (h) { this.hole[i] = 1; this.holeN++; }
      }
    }
    this.phase = 'pop';
    this.progress = 0;
    this.holding = 0;
    this.done = false;
    this.puffs = [];
    this.spawned = 0;
    this.time = 0;
    this.foamStart = 1;
    this.tick = 0;
    this.fan = 0;           // fanning the mask dry
    this.peelStart = 1;
    this.bits = [];         // peeled-off scraps of mask falling away
    this.beads = [];        // water beads left after rinsing
  }

  get active() { return this.phase !== 'pop'; }

  start(phase) {
    this.phase = phase;
    this.fresh = true;
    this.progress = 0;
    this.done = false;
    this.holding = 0;
    if (phase === 'peel') this.peelStart = Math.max(0.01, this.filmMean());
    if (phase === 'rinse') {
      this.foamStart = Math.max(0.01, this.mean(this.foam));
      this.foamSum = this.foamStart * this.cells;
    }
  }

  /** How much of the face the gel or mask covers, ignoring the parts it is kept off. */
  filmMean() {
    let s = 0;
    for (let i = 0; i < this.gel.length; i++) if (!this.hole[i]) s += this.gel[i];
    return s / Math.max(1, this.cells - this.holeN);
  }

  mean(arr) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / this.cells;
  }

  /** Returns the total amount added (negative if removed). */
  paint(arr, x, y, r, amt) {
    let delta = 0;
    const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const cx = (col + 0.5) * CELL, cy = (row + 0.5) * CELL;
        if ((cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r) {
          const i = row * this.cols + col;
          if (!this.mask[i]) continue;
          const v = Math.max(0, Math.min(1, arr[i] + amt));
          delta += v - arr[i];
          arr[i] = v;
        }
      }
    }
    return delta;
  }

  // ---- input ----
  down(x, y) { this.holding++; this.fresh = false; this.apply(x, y); }
  up() { this.holding = Math.max(0, this.holding - 1); if (!this.holding) audio.loop('steam', false); }
  move(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(d / 12));
    for (let i = 1; i <= steps; i++) this.apply(x0 + (x1 - x0) * (i / steps), y0 + (y1 - y0) * (i / steps));
  }

  apply(x, y) {
    if (this.fresh) return;     // a new step needs a new touch: one long drag can't run through several
    const G = this.G, sup = G.sup;
    // brush size is for a thumb, whatever size the pimples are drawn at
    const s = (G.baseScale || 1) * 1.15 * Math.sqrt(G.spaMult || 1);
    if (this.phase === 'lather') {
      if (!sup.ready('soap')) { sup.nag('soap', 'open the cleanser & pump it'); return; }
      const d = sup.hitDollops(x, y);
      this.paint(this.foam, x, y, (d ? 70 : 38) * s, d ? 1 : 0.5);
      audio.scrub();
      if (Math.random() < 0.15) audio.bloop();
    } else if (this.phase === 'rinse') {
      const c = sup.useCloth('wipes');
      if (!c) return;
      sup.hand = { x, y };
      const removed = -this.paint(this.foam, x, y, 42 * s, -1);
      c.dirt = Math.min(1, c.dirt + removed / (this.foamSum * 0.55 + 1));   // about 2 wipes per face
      G.fx.wipe(x, y, 42 * s, 1);
      audio.wipe(0.8);
    } else if (this.phase === 'soothe') {
      if (!sup.ready('gel')) { sup.nag('gel', 'open the gel & squeeze some out'); return; }
      const d = sup.hitDollops(x, y);
      this.paint(this.gel, x, y, (d ? 70 : 38) * s, d ? 1 : 0.6);
      audio.squish(0.1);
    } else if (this.phase === 'mask') {
      if (!sup.ready('mask')) { sup.nag('mask', 'open the mask & scoop some out'); return; }
      const d = sup.hitDollops(x, y);
      this.paint(this.gel, x, y, (d ? 70 : 38) * s, d ? 1 : 0.6);
      audio.squish(0.15);
    } else if (this.phase === 'dry') {
      this.fan += 0.0025;                       // waving a finger over it fans it dry
      if (this.tick % 5 === 0) audio.wipe(0.2);
    } else if (this.phase === 'peel') {
      const removed = -this.paint(this.gel, x, y, 40 * s, -1);
      if (removed > 0.2) {
        audio.squish(0.9);
        if (this.tick % 2 === 0) audio.wipe(1);
        for (let i = 0; i < (Math.random() < 0.5 ? 1 : 0); i++) {
          this.bits.push({ x: x + (Math.random() - 0.5) * 40, y: y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 60, rot: Math.random() * 6, w: 14 + Math.random() * 22, t: 0 });
        }
      }
    } else return;
    this.tick++;
    if (this.tick % 6 === 0) buzz('light');
  }

  // ---- sim ----
  update(dt) {
    const G = this.G;
    this.time += dt;
    if (!this.active) return;

    if (this.phase === 'lather') this.progress = this.mean(this.foam) / GOALS.lather;
    else if (this.phase === 'rinse') this.progress = (1 - this.mean(this.foam) / this.foamStart) / GOALS.rinse;
    else if (this.phase === 'soothe') this.progress = this.filmMean() / GOALS.soothe;
    else if (this.phase === 'mask') this.progress = this.filmMean() / GOALS.mask;
    else if (this.phase === 'peel') this.progress = (1 - this.filmMean() / this.peelStart) / GOALS.peel;
    else if (this.phase === 'dry') { this.progress += dt / 4.5 + this.fan; this.fan = 0; }
    else if (this.phase === 'steam') {
      if (this.holding > 0 && !G.sup.ready('steamer')) G.sup.nag('steamer', 'switch the steamer on');
      if (this.holding > 0 && G.sup.ready('steamer')) {
        this.progress += dt / 3.2 * (G.spaMult || 1);
        audio.loop('steam', true);
        if (Math.random() < dt * 4) buzz('light');
        for (let k = 0; k < 2; k++) {
          if (Math.random() < dt * 14) {
            this.puffs.push({
              x: Math.random() * G.W, y: G.H * (0.35 + Math.random() * 0.65),
              r: 30 + Math.random() * 50, t: 0, life: 1.4 + Math.random(), vx: (Math.random() - 0.5) * 30,
            });
          }
        }
      }
      // pores open: the pimples surface as it steams
      const types = G.plan.types;
      while (this.spawned < types.length && this.progress >= (this.spawned + 0.5) / types.length) {
        G.spawnNow(types[this.spawned++]);
        audio.plip();
      }
    }
    this.progress = Math.max(0, Math.min(1, this.progress));

    if (this.progress >= 1 && !this.done) {
      this.done = true;
      // finish the job properly: no bare patch of skin, no last fleck of foam or mask
      const fill = (arr, v) => { for (let i = 0; i < arr.length; i++) if (this.mask[i]) arr[i] = v; };
      if (this.phase === 'lather') fill(this.foam, 1);
      else if (this.phase === 'rinse') this.foam.fill(0);
      else if (this.phase === 'soothe' || this.phase === 'mask') fill(this.gel, 1);
      else if (this.phase === 'peel') this.gel.fill(0);
      G.onStepDone(this.phase);
    }
  }

  /** Leave the freshly rinsed face beaded with water. */
  wet() {
    const G = this.G;
    this.beads = [];
    for (let i = 0; i < 46; i++) {
      const p = G.geo ? G.geo.anyPoint() : { x: Math.random() * G.W, y: G.H * (0.15 + Math.random() * 0.7) };
      this.beads.push({ x: p.x, y: p.y, r: 1.5 + Math.random() * 3.2, t: 5 + Math.random() * 6, v: 2 + Math.random() * 9 });
    }
  }

  updatePuffs(dt) {
    for (let i = this.beads.length - 1; i >= 0; i--) {
      const b = this.beads[i];
      b.t -= dt * (this.phase === 'steam' && this.holding ? 0.6 : 1);
      b.y += b.v * dt * (b.r > 3 ? 1 : 0.2);       // the fat ones trickle down
      if (b.t <= 0) this.beads.splice(i, 1);
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.t += dt; b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 5;
      if (b.t > 0.9) this.bits.splice(i, 1);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      p.y -= 70 * dt;
      p.x += p.vx * dt;
      p.r += 25 * dt;
      if (p.t > p.life) this.puffs.splice(i, 1);
    }
  }

  // ---- drawing (on top of the skin and pimples) ----
  draw(ctx) {
    const G = this.G;
    const { cols, rows, foam, gel, jit } = this;

    // steam flush + puffs
    if (this.phase === 'steam' && this.progress > 0) {
      ctx.fillStyle = `rgba(255,110,110,${0.09 * this.progress})`;
      ctx.fillRect(0, 0, G.W, G.H);
    }
    for (const p of this.puffs) {
      const a = Math.sin(Math.PI * Math.min(1, p.t / p.life)) * 0.22;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // soothing gel: glossy mint film
    if (FILM.includes(this.phase)) {
      // mint gel, or a charcoal mask that goes from wet and glossy to dry and matte
      const dryK = this.phase === 'dry' ? this.progress : this.phase === 'peel' ? 1 : 0;
      // a mask or gel goes on the skin of the face only: it stops at the jaw and hairline,
      // and leaves the eyes, brows and lips bare, the way a real one is applied
      ctx.save();
      const g = G.geo;
      if (g && g.headPath) {
        ctx.clip(g.headPath);
        ctx.beginPath(); ctx.rect(0, g.hairlineY + g.hh * 0.04, G.W, G.H); ctx.clip();
        ctx.beginPath(); ctx.rect(0, 0, G.W, G.H);
        for (const e of g.eyes) {
          ctx.moveTo(e.x + e.rx * 1.3, e.y - e.ry * 0.2); ctx.ellipse(e.x, e.y - e.ry * 0.2, e.rx * 1.3, e.ry * 2.0, 0, 0, Math.PI * 2);
          ctx.moveTo(e.x + g.hw * 0.31, g.browY); ctx.ellipse(e.x, g.browY - g.hh * 0.012, g.hw * 0.31, g.hh * 0.045, 0, 0, Math.PI * 2);
        }
        const lb = g.lipsBox, lx = (lb[0] + lb[2]) / 2, ly = (lb[1] + lb[3]) / 2;
        ctx.moveTo(lx + (lb[2] - lb[0]) * 0.56, ly); ctx.ellipse(lx, ly, (lb[2] - lb[0]) * 0.56, (lb[3] - lb[1]) * 0.66, 0, 0, Math.PI * 2);
        ctx.clip('evenodd');
      }
      const v = Math.round(36 + 44 * dryK);
      ctx.fillStyle = this.phase === 'soothe' ? 'rgba(140,225,195,0.42)' : `rgba(${v},${v},${v + 8},0.95)`;
      ctx.beginPath();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          if (gel[i] <= 0.05) continue;
          const x = (col + 0.3 + jit[i * 4] * 0.4) * CELL, y = (row + 0.3 + jit[i * 4 + 1] * 0.4) * CELL;
          const r = CELL * (0.55 + 0.4 * gel[i]);
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${this.phase === 'soothe' ? 0.35 : 0.3 * (1 - dryK)})`;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let row = 0; row < rows; row += 2) {
        for (let col = 0; col < cols; col += 2) {
          const i = row * cols + col;
          if (gel[i] <= 0.5) continue;
          const x = (col + jit[i * 4 + 2]) * CELL, y = (row + jit[i * 4 + 3]) * CELL;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 10, y - 5);
        }
      }
      ctx.stroke();      ctx.restore();
    }

    // "you missed a spot": bare patches glow once most of the face is done
    if ((this.phase === 'lather' || this.phase === 'soothe' || this.phase === 'mask') && this.progress > 0.5 && !this.done) {
      const arr = this.phase === 'lather' ? foam : gel;
      const p = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.strokeStyle = `rgba(123,97,255,${0.45 + p * 0.45})`;
      ctx.fillStyle = `rgba(255,255,255,${0.18 + p * 0.2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          if (!this.mask[i] || arr[i] > 0.3 || (arr === gel && this.hole[i])) continue;
          const x = (col + 0.5) * CELL, y = (row + 0.5) * CELL;
          ctx.moveTo(x + CELL * 0.42, y);
          ctx.arc(x, y, CELL * 0.42, 0, Math.PI * 2);
        }
      }
      ctx.fill();
      ctx.stroke();
    }

    // scraps of peeled mask curling away
    for (const b of this.bits) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, 1 - b.t / 0.9);
      ctx.fillStyle = 'rgb(74,74,84)';
      ctx.beginPath(); ctx.ellipse(0, 0, b.w, b.w * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(108,108,118)';
      ctx.beginPath(); ctx.ellipse(b.w * 0.2, -b.w * 0.1, b.w * 0.6, b.w * 0.2, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // water left on the skin after rinsing: beads that catch the light and slowly run
    for (const b of this.beads) {
      const a = Math.min(1, b.t / 1.5);
      ctx.fillStyle = `rgba(255,255,255,${0.16 * a})`;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 1.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(60,30,25,${0.22 * a})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(b.x, b.y + b.r * 0.15, b.r, 0.25, Math.PI - 0.25); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.85 * a})`;
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.45, Math.max(0.7, b.r * 0.26), 0, Math.PI * 2); ctx.fill();
    }

    // lather: a creamy white layer with soft shading and a scatter of glossy bubbles
    if (this.phase === 'lather' || this.phase === 'rinse') {
      const wob = this.time * 2;
      const pass = (dx, dy, k, style) => {
        ctx.fillStyle = style;
        ctx.beginPath();
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const i = row * cols + col;
            const f = foam[i];
            if (f <= 0.05) continue;
            for (let n = 0; n < 3; n++) {
              const jx = jit[i * 4 + n], jy = jit[i * 4 + ((n + 1) & 3)];
              const x = (col + jx) * CELL + dx, y = (row + jy) * CELL + Math.sin(wob + jx * 20) * 1.2 + dy;
              const r = CELL * (0.3 + 0.42 * jy) * (0.5 + 0.5 * f) * k;
              ctx.moveTo(x + r, y);
              ctx.arc(x, y, r, 0, Math.PI * 2);
            }
          }
        }
        ctx.fill();
      };
      pass(2, 3.5, 1.04, 'rgba(70,90,120,0.16)');          // soft shadow on the skin
      pass(0, 0, 1, 'rgba(226,235,246,0.92)');             // cool underside
      pass(-1.5, -2, 0.86, 'rgba(255,255,255,0.96)');      // lit top
      // a few distinct bubbles: thin rim, bright glint
      ctx.lineWidth = 1;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          if (foam[i] <= 0.4 || jit[i * 4 + 3] > 0.55) continue;
          const x = (col + jit[i * 4 + 2]) * CELL, y = (row + jit[i * 4 + 3]) * CELL + Math.sin(wob + i) * 1.2;
          const r = CELL * (0.12 + 0.2 * jit[i * 4]);
          ctx.strokeStyle = 'rgba(150,180,215,0.5)';
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, Math.max(0.8, r * 0.22), 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}
