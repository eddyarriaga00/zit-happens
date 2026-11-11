// Ear cleaning mode. Scoop: hold a lump to loosen it (wiggling helps), then drag it out.
// Drops soften rock-hard wax, Tweezers grab stuck objects and bugs, Flush washes crumbs out.
// Don't poke the eardrum in the middle.

import * as audio from './audio.js';
import { drawTweezers, drawExtractor, drawSyringe } from './tools.js';
import { buzz } from './haptics.js';
import { rgba } from './skin.js';

const WAX = [
  ['#f6d277', '#cf9226'],
  ['#e8a840', '#a9621a'],
  ['#bf7a2c', '#6f3e12'],
  ['#8d5522', '#4b2a0c'],
];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Every ear is a different person with a different problem. The problem cycles through
// five kinds, so no two levels in a row play the same.
export const EAR_CASES = [
  { id: 'wax', title: 'Waxy build-up', tip: 'Hold a lump to loosen it, then drag it out', say: "I can't hear a thing!" },
  { id: 'hard', title: 'Rock-hard wax', tip: 'Soften the dark lumps with Drops, then scoop them out', say: "It's been years. It's like concrete." },
  { id: 'object', title: "Something's stuck", tip: 'Grab the stuck things with Tweezers', say: 'My little brother put something in there…' },
  { id: 'crumbs', title: 'Crumbly flakes', tip: 'Hold Flush to wash the flakes out', say: 'It itches and it crackles!' },
  { id: 'bug', title: "There's a bug in there!", tip: 'Catch the bug with Tweezers. It runs!', say: 'SOMETHING IS MOVING IN MY EAR' },
];
const HAIRS = ['#3a2218', '#1a1310', '#c9a45c', '#8a3b1e', '#5a3825', '#7d55c7', '#b9b9b9'];
const OBJECTS = ['bead', 'pebble', 'cotton', 'kernel', 'bead'];

export class Ear {
  constructor(G, level, top, bottom, tone) {
    this.G = G;
    this.tone = tone;
    this.level = level;
    this.case = EAR_CASES[(level - 1) % EAR_CASES.length];
    // who this ear belongs to: hair, which side, jewellery
    this.hair = HAIRS[(level * 3 + 1) % HAIRS.length];
    this.flip = level % 2 === 0;                           // left ear on even levels
    this.earring = (level * 5 + 2) % 4;                    // 0 none, 1 stud, 2 hoop, 3 stud + cuff
    // the outer ear, drawn in "ear units": u, v in -1..1 across its width/height
    this.ew = Math.min(G.W * 1.25, (bottom - top) * 1.05 / 1.5);
    this.eh = this.ew * 1.5;
    this.ex = G.W / 2 - 0.175 * this.ew / 2;
    this.ey = (top + bottom) / 2 + 6;
    this.cx = this.ex - 0.02 * this.ew / 2;
    if (this.flip) this.cx = G.W - this.cx;
    this.cy = this.ey + 0.1 * this.eh / 2;
    this.R = this.ew * 0.24;                                // canal opening
    this.Rd = this.R * 0.25;                                // eardrum
    this.chunks = [];
    this.ouches = 0;
    this.pulled = 0;
    this.total = 0;
    this.cooldown = 0;
    this.flash = 0;
    this.time = 0;
    this.flush = null;       // { id, x, y } while water is spraying
    this.spray = [];
    this.wetT = 0;
    this.hintT = 0;

    // little hairs around the rim
    this.hairs = [];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      this.hairs.push({ a, len: rand(0.12, 0.3) * this.R, bend: rand(-0.5, 0.5) });
    }

    const more = Math.min(4, Math.floor(level / 5));        // later ears are a bit fuller
    const id = this.case.id;
    if (id === 'wax') { for (let i = 0; i < 6 + more * 2; i++) this.addChunk('wax'); if (level >= 2) this.addChunk('wax', true); }
    if (id === 'hard') { for (let i = 0; i < 4 + more; i++) this.addChunk('hard'); for (let i = 0; i < 2; i++) this.addChunk('wax'); this.addChunk('hard', true); }
    if (id === 'object') { for (let i = 0; i < 3 + Math.min(2, more); i++) this.addChunk('object'); for (let i = 0; i < 4; i++) this.addChunk('wax'); }
    if (id === 'crumbs') { for (let i = 0; i < 20 + more * 3; i++) this.addChunk('crumb'); for (let i = 0; i < 3; i++) this.addChunk('wax'); }
    if (id === 'bug') { for (let i = 0; i < 5 + more; i++) this.addChunk('wax'); for (let i = 0; i < (level > 10 ? 2 : 1); i++) this.addChunk('bug'); }
    this.total = this.chunks.length;
  }

  addChunk(kind, big = false) {
    const { R, Rd, cx, cy } = this;
    let x, y, r;
    if (big) {
      r = Rd * 1.25;
      x = cx + rand(-6, 6);
      y = cy + rand(-6, 6);
    } else {
      r = (kind === 'crumb' ? rand(0.05, 0.085) : kind === 'object' ? rand(0.13, 0.17) : kind === 'bug' ? 0.13 : rand(0.15, 0.25)) * R;
      for (let t = 0; t < 40; t++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(Rd * 1.5 + r * 0.5, R * 0.86);
        x = cx + Math.cos(a) * d;
        y = cy + Math.sin(a) * d;
        if (kind === 'crumb' || this.chunks.every((c) => Math.hypot(c.x - x, c.y - y) > (c.r + r) * 0.7)) break;
      }
    }
    const shape = [];
    const n = big ? 11 : 8;
    for (let i = 0; i < n; i++) shape.push(rand(0.72, 1.15));
    const depth = 1 - clamp(Math.hypot(x - cx, y - cy) / R, 0, 1);  // 1 = deep
    const col = kind === 'hard' ? ['#7a5026', '#33200c'] : kind === 'crumb' ? ['#f7e2a0', '#d9b45a']
      : WAX[big ? 3 : Math.min(3, Math.floor(depth * 3 + Math.random() * 1.4))];
    const c = {
      kind, x, y, hx: x, hy: y, r, shape, col, big,
      rot: Math.random() * 6,
      stick: kind === 'crumb' ? 0.15 : big ? 2.4 : rand(0.45, 1.1) + depth * 0.5,
      soft: kind !== 'hard', softT: 0,
      what: OBJECTS[this.chunks.length % OBJECTS.length], tint: ['#e8548c', '#3d8bf0', '#12a89d', '#ff9f1c'][this.chunks.length % 4],
      prog: 0, state: 'stuck', held: null,
      fx: x, fy: y, gx: 0, gy: 0, t: 0, vy: 0, vx: 0, tick: 0,
      dir: Math.random() * 6.28, turn: 0,        // bugs wander
    };
    // big plug sits underneath everything else
    if (big) this.chunks.unshift(c); else this.chunks.push(c);
  }

  get left() { return this.chunks.filter((c) => c.state !== 'out').length; }
  get tool() { return this.G.earTool || 'scoop'; }

  scaleOf(c) {
    return 0.62 + 0.38 * clamp(Math.hypot(c.x - this.cx, c.y - this.cy) / this.R, 0, 1);
  }

  say(c, msg) {
    if (this.hintT > 0) return;
    this.hintT = 1.4;
    this.G.fx.text(clamp(c.x, 90, this.G.W - 90), c.y - c.r - 20, msg, '#ffe7a8', 15);
    buzz('light');
  }

  at(x, y, pad = 12) {
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.state === 'out' || c.held != null) continue;
      if (Math.hypot(c.x - x, c.y - y) < c.r * this.scaleOf(c) + pad) return c;
    }
    return null;
  }

  grab(c, id, x, y) {
    c.held = id;
    c.fx = x; c.fy = y;
    c.gx = x - c.x; c.gy = y - c.y;
    buzz('light');
  }

  // ---- input ----
  down(id, x, y) {
    const tool = this.tool;
    if (tool === 'flush') {                       // water goes anywhere, even on the eardrum
      this.flush = { id, x, y };
      return true;
    }
    const c = this.at(x, y, tool === 'tweezers' ? 20 : 12);
    if (tool === 'drops') {
      // a drop of oil: softens hard wax after a moment
      this.spray.push({ x, y: y - 60, ty: y, t: 0, drop: true });
      audio.bloop();
      if (c && c.kind === 'hard' && !c.soft) { if (!c.softT) c.softT = 0.01; }
      else if (c) this.say(c, c.kind === 'hard' ? 'already softening' : 'that one is soft already');
      return true;
    }
    if (c) {
      const needsTweezers = c.kind === 'object' || c.kind === 'bug';
      if (tool === 'tweezers') {
        if (!needsTweezers) { this.say(c, 'too soft for tweezers: use the scoop'); return true; }
        c.state = 'loose';                        // pinched: it comes straight away
        this.grab(c, id, x, y);
        c.gx = 0; c.gy = 0;
        audio.cap();
        return true;
      }
      if (needsTweezers) { this.say(c, c.kind === 'bug' ? 'catch it with tweezers!' : 'it just rolls: use tweezers'); return true; }
      this.grab(c, id, x, y);
      return true;
    }
    if (Math.hypot(x - this.cx, y - this.cy) < this.Rd) {
      this.poke();
      return true;
    }
    return false;
  }

  move(id, x, y) {
    if (this.flush && this.flush.id === id) { this.flush.x = x; this.flush.y = y; return; }
    const c = this.chunks.find((k) => k.held === id);
    if (!c) return;
    if (c.state === 'stuck') c.prog += Math.hypot(x - c.fx, y - c.fy) * 0.006;  // wiggle to loosen faster
    c.fx = x; c.fy = y;
  }

  up(id) {
    if (this.flush && this.flush.id === id) { this.flush = null; audio.loop('water', false); return; }
    const c = this.chunks.find((k) => k.held === id);
    if (!c) return;
    c.held = null;
    if (c.state !== 'loose') return;
    if (Math.hypot(c.x - this.cx, c.y - this.cy) > this.R * 1.02) this.remove(c);
    else if (c.kind === 'bug') { c.state = 'stuck'; this.say(c, 'it wriggled free!'); }   // dropped inside: off it goes again
    else { c.hx = c.x; c.hy = c.y; }
  }

  releaseAll() {
    for (const c of this.chunks) if (c.held != null) this.up(c.held);
    this.flush = null;
    audio.loop('water', false);
  }

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
    if (c.kind === 'crumb') { audio.plip(); return; }
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
    if (c.kind !== 'crumb') G.combo++;
    const mult = Math.min(3, 1 + G.combo * 0.25);
    const base = c.big ? 500 : c.kind === 'bug' ? 300 : c.kind === 'object' ? 150 : c.kind === 'crumb' ? 15 : 60 + c.r * 3;
    const pts = Math.round(base * mult);
    G.score += pts;
    if (c.kind === 'crumb') { if (Math.random() < 0.3) audio.plip(); G.onEarPull(c); return; }
    const label = c.big ? `THE BIG ONE! +${pts}` : c.kind === 'bug' ? `GOT IT! +${pts}` : c.kind === 'object' ? `a ${c.what === 'kernel' ? 'popcorn kernel' : c.what === 'cotton' ? 'bit of cotton' : c.what}! +${pts}` : `+${pts}`;
    G.fx.text(clamp(c.x, 90, G.W - 90), c.y - c.r - 14, label, c.big || c.kind === 'bug' ? '#ffd84d' : '#fff', c.big || c.kind === 'bug' ? 24 : 19);
    if (c.big || c.kind === 'bug') { G.fx.sparkleBurst(c.x, c.y, 20); audio.sparkle(); } else audio.perfect(G.combo);
    buzz('medium');
    G.onEarPull(c);
  }

  // ---- sim ----
  update(dt) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.hintT = Math.max(0, this.hintT - dt);
    this.wetT = Math.max(0, this.wetT - dt);
    const { cx, cy, R } = this;

    // water: washes loose bits and crumbs outward, and out of the ear
    if (this.flush) {
      const f = this.flush;
      audio.loop('water', true);
      this.wetT = 4;
      for (let k = 0; k < 3; k++) this.spray.push({ x: f.x + rand(-26, 26), y: f.y + rand(-26, 26), t: 0, a: Math.atan2(f.y - cy, f.x - cx) + rand(-0.8, 0.8) });
      if (Math.random() < dt * 8) buzz('light');
    }
    for (let i = this.spray.length - 1; i >= 0; i--) {
      const s = this.spray[i];
      s.t += dt;
      if (s.drop) { s.y += (s.ty - s.y) * Math.min(1, dt * 14); if (s.t > 0.5) this.spray.splice(i, 1); continue; }
      s.x += Math.cos(s.a) * 160 * dt; s.y += Math.sin(s.a) * 160 * dt;
      if (s.t > 0.45) this.spray.splice(i, 1);
    }

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
      // softening under the drops
      if (c.softT > 0 && !c.soft) {
        c.softT += dt;
        if (Math.random() < dt * 9) audio.bloop();
        if (c.softT > 1.6) { c.soft = true; c.stick = c.big ? 1.2 : 0.5; c.prog = 0; c.col = ['#b9803a', '#6a3f14']; this.G.fx.text(c.x, c.y - c.r - 16, 'softened!', '#8dffa8', 15); audio.plip(); }
      }
      // carried by the water
      if (this.flush && c.held == null && (c.kind === 'crumb' || c.state === 'loose')) {
        const f = this.flush, d = Math.hypot(c.x - f.x, c.y - f.y);
        if (d < 80) {
          const out = Math.atan2(c.y - cy, c.x - cx), away = Math.atan2(c.y - f.y, c.x - f.x);
          const push = (1 - d / 80) * 900 * dt;
          c.vx += (Math.cos(out) * 0.7 + Math.cos(away) * 0.3) * push;
          c.vy += (Math.sin(out) * 0.7 + Math.sin(away) * 0.3) * push;
          c.state = 'loose';
        }
      }
      if (c.kind === 'crumb' || (c.state === 'loose' && c.held == null && c.kind !== 'bug')) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.vx *= Math.pow(0.02, dt); c.vy *= Math.pow(0.02, dt);
        c.hx = c.x; c.hy = c.y;
        if (c.state === 'loose' && Math.hypot(c.x - cx, c.y - cy) > R * 1.02) { c.vy = -40; this.remove(c); continue; }
      }
      // a bug has a mind of its own
      if (c.kind === 'bug' && c.held == null) {
        c.turn -= dt;
        if (c.turn <= 0) { c.turn = rand(0.3, 1.1); c.dir += rand(-1.6, 1.6); }
        let speed = 26;
        for (const [, p] of this.G.pointersNear || []) { if (Math.hypot(p.x - c.x, p.y - c.y) < 90) { speed = 95; c.dir = Math.atan2(c.y - p.y, c.x - p.x) + rand(-0.5, 0.5); } }
        c.x += Math.cos(c.dir) * speed * dt; c.y += Math.sin(c.dir) * speed * dt;
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (d > R * 0.82 || d < this.Rd * 1.6) c.dir = Math.atan2(cy - c.y, cx - c.x) + (d < this.Rd * 1.6 ? Math.PI : 0) + rand(-0.6, 0.6);
        c.rot = c.dir + Math.PI / 2;
        c.hx = c.x; c.hy = c.y;
        continue;
      }
      if (c.state === 'stuck') {
        if (c.held != null) {
          c.prog += dt;
          // hard wax won't budge until it has been softened
          if (!c.soft) { c.prog = Math.min(c.prog, c.stick * 0.3); this.say(c, c.softT ? 'still softening…' : 'rock hard: use the Drops'); }
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
        if (c.kind === 'bug') c.rot += dt * 14;          // wriggling in the tweezers
      }
    }
  }

  /** Objects, crumbs and bugs (wax lumps are drawn in drawChunks). */
  drawThing(ctx, c) {
    const s = this.scaleOf(c), r = c.r * s;
    ctx.save();
    ctx.translate(c.x, c.y);
    if (c.state === 'out') ctx.globalAlpha = Math.max(0, 1 - c.t / 0.7);
    ctx.rotate(c.rot);
    ctx.fillStyle = 'rgba(20,5,5,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 4, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    if (c.kind === 'crumb') {
      ctx.fillStyle = c.col[1]; this.blob(ctx, c, r * 1.1); ctx.fill();
      ctx.fillStyle = c.col[0]; this.blob(ctx, c, r * 0.8); ctx.fill();
    } else if (c.kind === 'bug') {
      // a ladybird: legs first, then shell, spots and head
      const wig = Math.sin(this.time * 22) * 0.35;
      ctx.strokeStyle = '#1a1210'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.lineCap = 'round';
      for (const d of [-1, 1]) for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(d * r * 0.5, k * r * 0.45); ctx.lineTo(d * r * 1.2, k * r * 0.6 + wig * r * (k || 1) * d); ctx.stroke(); }
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ff6a5a'); g.addColorStop(1, '#b3121f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1210'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, -r * 0.8); ctx.lineTo(0, r * 1.05); ctx.stroke();
      ctx.fillStyle = '#1a1210';
      for (const [px, py] of [[-0.4, -0.1], [0.4, -0.1], [-0.35, 0.55], [0.35, 0.55]]) { ctx.beginPath(); ctx.arc(px * r, py * r, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, -r * 0.85, r * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.25, r * 0.2, r * 0.1, -0.6, 0, Math.PI * 2); ctx.fill();
    } else if (c.what === 'bead') {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, c.tint); g.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = c.tint; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = g; ctx.globalAlpha *= 0.75; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha /= 0.75;
      ctx.fillStyle = 'rgba(30,10,10,0.7)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
    } else if (c.what === 'pebble') {
      const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#c9c9c4'); g.addColorStop(1, '#6f6d68');
      ctx.fillStyle = g; this.blob(ctx, c, r); ctx.fill();
      ctx.fillStyle = 'rgba(50,50,50,0.35)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 2.2) * r * 0.5, Math.sin(i * 1.7) * r * 0.5, r * 0.07, 0, Math.PI * 2); ctx.fill(); }
    } else if (c.what === 'cotton') {
      ctx.fillStyle = '#f7f5f0';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.05) * r * 0.45, Math.sin(i * 1.05) * r * 0.45, r * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(200,170,90,0.4)'; ctx.beginPath(); ctx.arc(r * 0.2, r * 0.2, r * 0.4, 0, Math.PI * 2); ctx.fill();
    } else {                                       // popcorn kernel
      const g = ctx.createRadialGradient(-r * 0.2, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#fff0b3'); g.addColorStop(1, '#d08a1e');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 1.1, -r * 0.2, r * 0.5, r); ctx.quadraticCurveTo(0, r * 1.2, -r * 0.5, r); ctx.quadraticCurveTo(-r * 1.1, -r * 0.2, 0, -r); ctx.fill();
      ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.ellipse(0, r * 0.75, r * 0.35, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** Water spray, falling drops, and tweezers on whatever is pinched. */
  drawTools(ctx) {
    ctx.lineCap = 'round';
    for (const s of this.spray) {
      if (s.drop) {
        ctx.fillStyle = 'rgba(255,214,120,0.9)';
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 9); ctx.quadraticCurveTo(s.x + 7, s.y + 3, s.x, s.y + 6); ctx.quadraticCurveTo(s.x - 7, s.y + 3, s.x, s.y - 9); ctx.fill();
        continue;
      }
      ctx.strokeStyle = `rgba(200,232,255,${0.8 * (1 - s.t / 0.45)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - Math.cos(s.a) * 9, s.y - Math.sin(s.a) * 9); ctx.stroke();
    }
    if (this.flush) {
      const f = this.flush;
      ctx.fillStyle = 'rgba(200,232,255,0.25)';
      ctx.beginPath(); ctx.arc(f.x, f.y, 34, 0, Math.PI * 2); ctx.fill();
      drawSyringe(ctx, f.x, f.y);
    }
    // the instrument in your hand: tweezers on things and bugs, a steel curette on wax
    for (const c of this.chunks) {
      if (c.held == null) continue;
      if (c.kind === 'object' || c.kind === 'bug') drawTweezers(ctx, c.x, c.y, -0.9);
      else drawExtractor(ctx, c.x, c.y, 6);
    }
  }

  // ---- drawing ----
  drawBack(ctx) {
    const { cx, cy, R, Rd } = this;

    // even-numbered patients show their other ear
    ctx.save();
    if (this.flip) { ctx.translate(this.G.W, 0); ctx.scale(-1, 1); }
    this.drawOuterEar(ctx);
    ctx.restore();

    // canal
    const g = ctx.createRadialGradient(cx, cy, Rd * 0.5, cx, cy, R * 1.08);
    g.addColorStop(0, '#2b0e0e');
    g.addColorStop(0.45, '#5e2620');
    g.addColorStop(0.8, '#a85a4e');
    g.addColorStop(0.93, rgba(this.tone.blush, 0.9));
    g.addColorStop(1, rgba(this.tone.bump, 0));
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
    ctx.save();
    if (this.flip) { ctx.translate(this.G.W, 0); ctx.scale(-1, 1); }
    this.drawFlaps(ctx);
    ctx.restore();
    // freshly rinsed: the canal glistens
    if (this.wetT > 0) {
      ctx.fillStyle = `rgba(210,235,255,${0.1 * Math.min(1, this.wetT)})`;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * Math.min(1, this.wetT)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.82, -2.4, -1.5); ctx.stroke();
    }
  }

  drawOuterEar(ctx) {
    const { ex, ey, ew, eh, tone } = this;
    const G = this.G;
    const X = (u) => ex + u * ew / 2, Y = (v) => ey + v * eh / 2;
    const bez = (a, b, c, d, e, f) => ctx.bezierCurveTo(X(a), Y(b), X(c), Y(d), X(e), Y(f));

    // hair tucked behind the ear
    ctx.fillStyle = this.hair;
    ctx.beginPath();
    ctx.moveTo(G.W * 0.2, 0);
    ctx.lineTo(G.W, 0);
    ctx.lineTo(G.W, G.H * 0.8);
    ctx.bezierCurveTo(G.W * 0.9, G.H * 0.62, G.W * 0.98, G.H * 0.4, G.W * 0.8, G.H * 0.22);
    ctx.bezierCurveTo(G.W * 0.62, G.H * 0.06, G.W * 0.4, G.H * 0.1, G.W * 0.2, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const k = i / 15;
      ctx.beginPath();
      ctx.moveTo(G.W * (0.35 + k * 0.6), 0);
      ctx.bezierCurveTo(G.W * (0.75 + k * 0.25), G.H * 0.12, G.W * (0.9 + k * 0.1), G.H * 0.35, G.W * (0.93 + k * 0.07), G.H * (0.55 + k * 0.2));
      ctx.stroke();
    }

    // ear silhouette
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(X(-0.58), Y(-0.42));
      bez(-0.62, -0.85, -0.2, -1.02, 0.2, -1.0);
      bez(0.7, -0.98, 1.0, -0.6, 0.95, -0.15);
      bez(0.9, 0.3, 0.62, 0.5, 0.45, 0.72);
      bez(0.32, 0.92, 0.1, 1.03, -0.12, 1.0);
      bez(-0.38, 0.97, -0.5, 0.75, -0.5, 0.55);
      bez(-0.5, 0.35, -0.62, 0.2, -0.6, -0.05);
      bez(-0.58, -0.2, -0.56, -0.3, -0.58, -0.42);
      ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = 'rgba(50,15,8,0.5)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 9;
    const body = ctx.createRadialGradient(X(-0.1), Y(-0.2), ew * 0.1, X(0.1), Y(0), eh * 0.62);
    body.addColorStop(0, tone.base);
    body.addColorStop(0.7, tone.bump);
    body.addColorStop(1, tone.blush);
    ctx.fillStyle = body;
    outline();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(tone.pore, 0.45);
    ctx.lineWidth = 2;
    outline();
    ctx.stroke();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // helix: the curled outer rim, drawn as the groove on its inside
    const helix = () => {
      ctx.beginPath();
      ctx.moveTo(X(-0.36), Y(-0.5));
      bez(-0.3, -0.82, 0.1, -0.84, 0.3, -0.8);
      bez(0.68, -0.74, 0.8, -0.4, 0.74, -0.08);
      bez(0.7, 0.2, 0.55, 0.38, 0.42, 0.52);
    };
    ctx.strokeStyle = rgba(tone.pore, 0.22);
    ctx.lineWidth = ew * 0.1;
    helix(); ctx.stroke();
    ctx.strokeStyle = rgba(tone.pore, 0.55);
    ctx.lineWidth = ew * 0.03;
    helix(); ctx.stroke();
    ctx.save();
    ctx.translate(ew * 0.012, -ew * 0.02);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = ew * 0.014;
    helix(); ctx.stroke();
    ctx.restore();

    // antihelix: the Y-shaped ridge inside the rim
    const anti = () => {
      ctx.beginPath();
      ctx.moveTo(X(0.34), Y(0.44));
      bez(0.58, 0.18, 0.58, -0.2, 0.4, -0.38);
      bez(0.3, -0.5, 0.2, -0.6, 0.04, -0.62);
      ctx.moveTo(X(0.4), Y(-0.38));
      bez(0.22, -0.44, 0.0, -0.42, -0.22, -0.44);
    };
    ctx.save();
    ctx.translate(ew * 0.014, ew * 0.02);
    ctx.strokeStyle = rgba(tone.pore, 0.35);
    ctx.lineWidth = ew * 0.085;
    anti(); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba(tone.base, 0.95);
    ctx.lineWidth = ew * 0.075;
    anti(); ctx.stroke();
    ctx.save();
    ctx.translate(-ew * 0.01, -ew * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = ew * 0.02;
    anti(); ctx.stroke();
    ctx.restore();

    // soft lobe highlight + a little gold stud
    const lg = ctx.createRadialGradient(X(-0.12), Y(0.78), 2, X(-0.12), Y(0.78), ew * 0.16);
    lg.addColorStop(0, 'rgba(255,255,255,0.3)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(X(-0.12), Y(0.78), ew * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // jewellery: none, a stud, a hoop, or a stud with a cuff higher up
    const gold = (px, py, pr) => {
      ctx.fillStyle = 'rgba(60,20,10,0.3)';
      ctx.beginPath(); ctx.arc(px + 1.5, py + 2, pr, 0, Math.PI * 2); ctx.fill();
      const sg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 0.5, px, py, pr);
      sg.addColorStop(0, '#fff6c2'); sg.addColorStop(0.5, '#f4c430'); sg.addColorStop(1, '#b8860b');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    };
    const lx = X(-0.14), ly = Y(0.84);
    if (this.earring === 1 || this.earring === 3) gold(lx, ly, ew * 0.02);
    if (this.earring === 2) {
      ctx.strokeStyle = 'rgba(60,20,10,0.3)'; ctx.lineWidth = ew * 0.014;
      ctx.beginPath(); ctx.arc(lx + 2, ly + ew * 0.05 + 3, ew * 0.055, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e9bd3a';
      ctx.beginPath(); ctx.arc(lx, ly + ew * 0.05, ew * 0.055, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(lx, ly + ew * 0.05, ew * 0.055, 3.6, 4.6); ctx.stroke();
    }
    if (this.earring === 3) {
      ctx.strokeStyle = '#d0d5dd'; ctx.lineWidth = ew * 0.018; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(X(0.86), Y(-0.3), ew * 0.035, -1.2, 1.2); ctx.stroke();
    }
  }

  /** Flaps that sit in front of the canal opening (drawn after the canal). */
  drawFlaps(ctx) {
    const { ex, ey, ew, eh, tone } = this;
    const X = (u) => ex + u * ew / 2, Y = (v) => ey + v * eh / 2;
    const flap = (u, v, rx, ry, rot) => {
      const x = X(u), y = Y(v);
      ctx.fillStyle = 'rgba(40,10,8,0.4)';
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 5, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.35, 1, x, y, Math.max(rx, ry));
      g.addColorStop(0, tone.base);
      g.addColorStop(1, tone.bump);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.25, y - ry * 0.35, rx * 0.4, ry * 0.25, rot, 0, Math.PI * 2);
      ctx.fill();
    };
    flap(-0.5, 0.1, ew * 0.07, eh * 0.065, 0.1);    // tragus (front flap)
    flap(0.14, 0.5, ew * 0.1, ew * 0.05, -0.35);      // antitragus
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
      if (c.kind === 'object' || c.kind === 'bug' || c.kind === 'crumb') { this.drawThing(ctx, c); continue; }
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
      if (c.kind === 'hard' && !c.soft) {
        // dry and cracked, no shine; it fizzes while the drops work
        ctx.strokeStyle = 'rgba(20,10,4,0.55)'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.05); ctx.lineTo(r * 0.1, -r * 0.4); ctx.moveTo(-r * 0.1, r * 0.05); ctx.lineTo(r * 0.35, r * 0.5); ctx.moveTo(r * 0.1, -r * 0.4); ctx.lineTo(r * 0.6, -r * 0.1);
        ctx.stroke();
        if (c.softT > 0) {
          ctx.fillStyle = 'rgba(255,236,170,0.8)';
          for (let i = 0; i < 6; i++) { const k = (this.time * 1.5 + i / 6) % 1; ctx.beginPath(); ctx.arc(Math.cos(i * 2.4) * r * 0.6, Math.sin(i * 1.9) * r * 0.6 - k * 6, 1.5 + k * 2.5, 0, Math.PI * 2); ctx.fill(); }
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.38, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
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
