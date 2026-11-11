// The Hair Salon: a full visit for one client, and the stations you upgrade over time.
//
// A visit runs through stages. Which ones depend on what your salon has:
//   shampoo → rinse → cut → (dye, if you own the Colour Bar) → blow-dry (+ restyle, if
//   you own the Styling Station).
// The client asks for a colour and a style; matching them earns a bigger tip.

import * as audio from './audio.js';
import { buzz } from './haptics.js';
import { Haircut } from './salon.js';

// ---- the salon itself: stations you buy and level up (levels saved in save.salon)
export const STATIONS = [
  { id: 'wash', name: 'Shampoo Station', start: 1, costs: [60, 120], desc: ['', 'Wash and rinse', 'Bigger lather, quicker wash', 'Luxury wash: fastest lather'] },
  { id: 'chair', name: 'Cutting Chair', start: 1, costs: [60, 120], desc: ['', 'Fringe trims', 'Sharper scissors: more forgiving cuts', 'Pro scissors: very forgiving cuts'] },
  { id: 'colour', name: 'Colour Bar', start: 0, costs: [80, 120, 180], desc: ['Buy to offer hair dye', '4 hair colours', '8 hair colours', 'All 12 hair colours'] },
  { id: 'style', name: 'Styling Station', start: 0, costs: [100, 150, 200], desc: ['Buy to restyle hair', '2 hairstyles', '4 hairstyles', 'All 5 hairstyles'] },
  { id: 'decor', name: 'Decor', start: 0, costs: [80, 160, 240], desc: ['Plain walls', 'Fresh mint walls: +25% tips', 'Lilac lounge: +50% tips', 'Golden suite: +75% tips'] },
];
export const SALON_TITLES = ['Corner Chair', 'Corner Chair', 'Cosy Salon', 'Cosy Salon', 'Busy Salon', 'Busy Salon', 'Chic Studio', 'Chic Studio', 'Style House', 'Style House', 'Luxury Salon', 'Luxury Salon', 'Legendary Salon'];
export const WALLS = [['#eef1f6', '#cfd6e4'], ['#e4f5ee', '#b9dccd'], ['#efe6fa', '#cdb8ea'], ['#fff3d6', '#f0cf8a']];
export const salonLevel = (lv) => STATIONS.reduce((n, s) => n + (lv[s.id] ?? s.start), 0);
export const salonTitle = (lv) => SALON_TITLES[Math.min(SALON_TITLES.length - 1, salonLevel(lv))];

export const DYES = ['#e2c078', '#8a3b1e', '#1c1412', '#a8421c', '#d6679f', '#7d55c7', '#3f8fd6', '#3aa893', '#e53935', '#f4a340', '#b9b9b9', '#ff8fc0'];
const DYE_NAMES = ['blonde', 'auburn', 'black', 'copper', 'pink', 'purple', 'blue', 'teal', 'red', 'orange', 'silver', 'candy pink'];
export const STYLES = [['long', 'Long'], ['pony', 'Ponytail'], ['bun', 'Bun'], ['curly', 'Curly'], ['short', 'Bob']];
const STYLE_COUNT = [0, 2, 4, 5];
const CELL = 22;
const NAMES = { shampoo: 'Shampoo', rinse: 'Rinse', cut: 'Cut', dye: 'Colour', dry: 'Blow-dry' };

export class HairService {
  /** lv = save.salon (station levels). repaint() redraws the client after a colour/style change. */
  constructor(G, lv, repaint) {
    this.G = G;
    this.lv = lv;
    this.repaint = repaint;
    this.stages = ['shampoo', 'rinse', 'cut', ...(lv.colour ? ['dye'] : []), 'dry'];
    this.i = 0;
    this.dyes = DYES.slice(0, 4 * (lv.colour || 0));
    this.styles = STYLES.slice(0, STYLE_COUNT[lv.style || 0]);
    // what she asks for
    const other = (list, cur) => { const o = list.filter((v) => v !== cur); return o[Math.floor(Math.random() * o.length)]; };
    this.wantDye = this.dyes.length ? other(this.dyes, G.look.hair) : null;
    this.wantStyle = this.styles.length ? other(this.styles.map((s) => s[0]), G.look.style) : null;
    this.pick = { dye: this.dyes[0] || null, style: this.styles.length ? this.styles[0][0] : null };
    this.cut = null;
    this.wet = false;
    this.hand = null;
    this.tick = 0;
    this.pause = 0;          // a beat between stages
    this.drops = [];
    this.buildGrid();
  }

  /** What she says when she sits down. */
  request() {
    const bits = ['a wash', 'a trim'];
    if (this.wantDye) bits.push(`${DYE_NAMES[DYES.indexOf(this.wantDye)]} hair`);
    if (this.wantStyle) bits.push({ long: 'it left long', pony: 'a ponytail', bun: 'a bun', curly: 'curls', short: 'a bob' }[this.wantStyle]);
    return `${bits.slice(0, -1).join(', ')} and ${bits[bits.length - 1]}, please!`;
  }

  buildGrid() {
    const G = this.G;
    this.cells = [];
    // hair you can actually reach: not the bits hidden behind her ears or lying under her top
    const gq = G.geo;
    const reach = (x, y) => gq.onHair(x, y) && y < gq.cy + gq.hh * 1.1
      && !(Math.abs(x - gq.cx) > gq.hw * 0.92 && Math.abs(x - gq.cx) < gq.hw * 1.22 && Math.abs(y - (gq.cy + gq.hh * 0.03)) < gq.hh * 0.25);
    for (let y = CELL / 2; y < G.H; y += CELL) for (let x = CELL / 2; x < G.W; x += CELL) if (reach(x, y)) this.cells.push({ x, y, j: Math.random(), k: Math.random() });
    const n = Math.max(1, this.cells.length);
    this.foam = new Float32Array(n);
    this.coat = new Float32Array(n);
    this.dry = new Float32Array(n);
  }

  get stage() { return this.stages[this.i]; }
  get ready() { return this.i >= this.stages.length; }
  mean(arr) { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length; }
  paint(arr, x, y, r, amt) {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if ((c.x - x) ** 2 + (c.y - y) ** 2 < r * r) arr[i] = Math.max(0, Math.min(1, arr[i] + amt));
    }
  }

  stageProgress() {
    const s = this.stage;
    if (s === 'shampoo') return this.mean(this.foam) / 0.93;
    if (s === 'rinse') return (1 - this.mean(this.foam)) / 0.97;
    if (s === 'cut') return this.cut ? this.cut.progress : 0;
    if (s === 'dye') return this.mean(this.coat) / 0.93;
    if (s === 'dry') return this.mean(this.dry) / 0.93;
    return 1;
  }
  get progress() { return this.ready ? 1 : (this.i + Math.min(1, this.stageProgress())) / this.stages.length; }
  label() { return this.ready ? 'All done' : `${this.i + 1}/${this.stages.length} ${NAMES[this.stage]} ${Math.round(Math.min(1, this.stageProgress()) * 100)}%`; }

  /** Choices to show in the bar for this stage (colours or styles), or null. */
  bar() {
    if (this.stage === 'dye') return { kind: 'colors', options: this.dyes, value: this.pick.dye, want: this.wantDye };
    if (this.stage === 'dry' && this.styles.length) return { kind: 'styles', options: this.styles, value: this.pick.style, want: this.wantStyle };
    return null;
  }
  choose(v) { if (this.stage === 'dye') this.pick.dye = v; else this.pick.style = v; }

  hint() {
    return {
      shampoo: 'Rub shampoo all through her hair 🧴',
      rinse: 'Rinse it out with the shower 🚿',
      cut: 'Snip each lock at the dashed line ✂️',
      dye: 'Pick a colour, then brush it through 🎨',
      dry: this.styles.length ? 'Pick a style, then blow-dry it in 💨' : 'Blow-dry her hair 💨',
    }[this.stage];
  }

  next() {
    const G = this.G, s = this.stage;
    if (s === 'rinse') this.wet = true;
    if (s === 'dye') {
      G.look = { ...G.look, hair: this.pick.dye };
      this.repaint();
      if (this.cut) this.cut.hair = this.pick.dye;
      const keepDry = this.dry; this.buildGrid(); if (keepDry.length === this.dry.length) this.dry.set(keepDry);
    }
    if (s === 'dry') {
      this.wet = false;
      if (this.pick.style) { G.look = { ...G.look, style: this.pick.style }; this.repaint(); this.buildGrid(); }
    }
    audio.loop('water', false); audio.loop('dryer', false);
    this.i++;
    this.pause = 0.5;
    if (this.stage === 'cut') this.cut = new Haircut(G);
    G.fx.sparkleBurst(G.W / 2, G.H * 0.3, 12);
    audio.perfect();
    buzz('medium');
    G.onSalonStage(this);
  }

  // ---- input
  apply(x, y) {
    const s = this.stage, r = 34 + 8 * (this.lv.wash || 1);
    this.hand = { x, y };
    if (s === 'shampoo') { this.paint(this.foam, x, y, r, 0.5); audio.scrub(); if (Math.random() < 0.12) audio.bloop(); }
    else if (s === 'rinse') {
      this.paint(this.foam, x, y, r + 6, -1);
      audio.loop('water', true);
      for (let i = 0; i < 2; i++) this.drops.push({ x: x + (Math.random() - 0.5) * 50, y: y + 10, vy: 260 + Math.random() * 160, t: 0 });
    } else if (s === 'dye') { this.paint(this.coat, x, y, 38, 0.6); audio.squish(0.15); }
    else if (s === 'dry') { this.paint(this.dry, x, y, 46, 0.35); audio.loop('dryer', true); }
    if (++this.tick % 6 === 0) buzz('light');
  }
  down(id, x, y) { if (this.pause > 0 || this.ready) return; if (this.stage === 'cut') this.cut.down(id, x, y); else this.apply(x, y); }
  move(id, x, y, px, py) {
    if (this.pause > 0 || this.ready) return;
    if (this.stage === 'cut') return this.cut.move(id, x, y, px, py);
    const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 14));
    for (let k = 1; k <= n; k++) this.apply(px + (x - px) * k / n, py + (y - py) * k / n);
  }
  up(id) { this.hand = null; audio.loop('water', false); audio.loop('dryer', false); if (this.cut) this.cut.up(id); }

  update(dt) {
    this.pause = Math.max(0, this.pause - dt);
    if (this.cut) this.cut.update(dt);
    for (let i = this.drops.length - 1; i >= 0; i--) { const d = this.drops[i]; d.t += dt; d.y += d.vy * dt; if (d.t > 0.5) this.drops.splice(i, 1); }
    if (!this.ready && this.pause <= 0 && this.stageProgress() >= 1) this.next();
  }

  /** Cut quality, plus whether the colour and style are what she asked for. */
  score() {
    const cut = this.cut ? this.cut.score() : 70;
    const dye = !this.wantDye ? 100 : this.G.look.hair === this.wantDye ? 100 : 55;
    const sty = !this.wantStyle ? 100 : this.G.look.style === this.wantStyle ? 100 : 55;
    return Math.round(cut * 0.5 + dye * 0.25 + sty * 0.25);
  }
  matched() { return (this.wantDye ? this.G.look.hair === this.wantDye : true) && (this.wantStyle ? this.G.look.style === this.wantStyle : true); }

  draw(ctx) {
    const t = this.G.time;
    // wet hair sits darker until it is blown dry
    if (this.wet) {
      ctx.fillStyle = 'rgba(10,10,25,0.2)';
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i++) { if (this.dry[i] > 0.5) continue; const c = this.cells[i]; ctx.moveTo(c.x + CELL * 0.75, c.y); ctx.arc(c.x, c.y, CELL * 0.75, 0, Math.PI * 2); }
      ctx.fill();
      // wet strands catch the light in thin streaks
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i += 2) { if (this.dry[i] > 0.5) continue; const c = this.cells[i]; ctx.moveTo(c.x + (c.j - 0.5) * CELL, c.y - CELL * 0.4); ctx.lineTo(c.x + (c.j - 0.5) * CELL + (c.k - 0.5) * 3, c.y + CELL * 0.4); }
      ctx.stroke();
    }
    // dye paste
    if (this.stage === 'dye' && this.pick.dye) {
      ctx.fillStyle = this.pick.dye;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i++) { const v = this.coat[i]; if (v < 0.05) continue; const c = this.cells[i], r = CELL * (0.5 + 0.35 * v); ctx.moveTo(c.x + r, c.y); ctx.arc(c.x + (c.j - 0.5) * 6, c.y + (c.k - 0.5) * 6, r, 0, Math.PI * 2); }
      ctx.fill();
      ctx.globalAlpha = 1;
      // the paste is thick and wet: a darker edge underneath and glossy streaks on top
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i += 2) { const v = this.coat[i]; if (v < 0.3) continue; const c = this.cells[i]; ctx.moveTo(c.x + CELL * 0.3, c.y + CELL * 0.32); ctx.ellipse(c.x, c.y + CELL * 0.32, CELL * 0.42, CELL * 0.16, 0, 0, Math.PI * 2); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i += 3) { const v = this.coat[i]; if (v < 0.3) continue; const c = this.cells[i]; ctx.moveTo(c.x, c.y); ctx.ellipse(c.x - CELL * 0.15, c.y - CELL * 0.2, CELL * 0.28, CELL * 0.08, -0.5, 0, Math.PI * 2); }
      ctx.fill();
    }
    if (this.cut) this.cut.draw(ctx);
    // shampoo lather
    if (this.stage === 'shampoo' || this.stage === 'rinse') {
      for (const [dx, dy, k, col] of [[2, 3, 1.05, 'rgba(70,90,120,0.16)'], [0, 0, 1, 'rgba(226,235,246,0.93)'], [-1.5, -2, 0.85, 'rgba(255,255,255,0.97)']]) {
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < this.cells.length; i++) {
          const v = this.foam[i]; if (v < 0.05) continue;
          const c = this.cells[i];
          for (let n = 0; n < 2; n++) {
            const x = c.x + (n ? c.j - 0.5 : c.k - 0.5) * CELL + dx, y = c.y + (n ? c.k - 0.5 : c.j - 0.5) * CELL + Math.sin(t * 2 + c.j * 20) + dy;
            const r = CELL * (0.3 + 0.35 * (n ? c.j : c.k)) * (0.5 + 0.5 * v) * k;
            ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        ctx.fill();
      }
      // real suds: clear bubbles riding on the foam, each with a rim, a glint and a hint of rainbow
      for (let i = 0; i < this.cells.length; i += 3) {
        const v = this.foam[i]; if (v < 0.35) continue;
        const c = this.cells[i];
        const x = c.x + (c.k - 0.5) * CELL * 1.2, y = c.y + (c.j - 0.5) * CELL * 1.2 + Math.sin(t * 1.6 + c.k * 30) * 1.5, r = CELL * (0.16 + 0.22 * c.j);
        ctx.fillStyle = i % 2 ? 'rgba(210,235,255,0.25)' : 'rgba(255,225,245,0.25)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(120,150,190,0.35)'; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0.3, 1.8); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, Math.max(0.6, r * 0.2), 0, Math.PI * 2); ctx.fill();
      }
    }
    // rinse water
    ctx.strokeStyle = 'rgba(190,225,255,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const d of this.drops) { ctx.globalAlpha = 1 - d.t / 0.5; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + 12); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // "missed a bit" rings once most of it is done
    const arr = { shampoo: this.foam, dye: this.coat, dry: this.dry }[this.stage];
    if (arr && this.stageProgress() > 0.5) {
      ctx.strokeStyle = `rgba(123,97,255,${0.5 + 0.4 * Math.sin(t * 6)})`; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i++) { if (arr[i] > 0.3) continue; const c = this.cells[i]; ctx.moveTo(c.x + 8, c.y); ctx.arc(c.x, c.y, 8, 0, Math.PI * 2); }
      ctx.stroke();
    }
    // the tool in hand
    if (this.hand && this.stage !== 'cut') this.tool(ctx, this.hand.x, this.hand.y, t);
  }

  tool(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x + 34, y - 44);
    ctx.lineCap = 'round';
    const lg = (x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
    const steel = [[0, '#f4f6f9'], [0.45, '#aeb7c3'], [1, '#6b7482']];
    if (this.stage === 'rinse') {           // a chrome hand shower: hose, handle, a round head with jets
      ctx.rotate(0.5);
      ctx.strokeStyle = 'rgba(30,15,15,0.2)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(3, -44); ctx.lineTo(3, 2); ctx.stroke();
      ctx.strokeStyle = lg(-4, 0, 4, 0, steel); ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(80,90,105,0.5)'; ctx.lineWidth = 0.8;
      for (let yy = -44; yy < -22; yy += 3) { ctx.beginPath(); ctx.moveTo(-4, yy); ctx.lineTo(4, yy); ctx.stroke(); }     // ribbed hose
      ctx.fillStyle = lg(-22, 0, 22, 0, steel); ctx.beginPath(); ctx.ellipse(0, 4, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#39424e'; ctx.beginPath(); ctx.ellipse(0, 7, 18, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9fb0c2';
      for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, 7 + Math.sin(a) * 4, 0.9, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(-8, 0, 7, 2, -0.2, 0, Math.PI * 2); ctx.fill();
    } else if (this.stage === 'dry') {      // a salon dryer: barrel, nozzle, grille, handle, with air streaks
      ctx.rotate(-0.6);
      ctx.fillStyle = 'rgba(30,15,15,0.2)'; ctx.beginPath(); ctx.roundRect(-20, -8, 46, 26, 11); ctx.fill();
      ctx.fillStyle = lg(0, 8, 0, 40, [[0, '#3a3f49'], [0.5, '#23262d'], [1, '#15171c']]);
      ctx.beginPath(); ctx.roundRect(-5, 6, 13, 32, 5); ctx.fill();                                   // handle
      ctx.fillStyle = '#e94f7a'; ctx.beginPath(); ctx.roundRect(-3.5, 14, 4, 8, 2); ctx.fill();          // switch
      ctx.fillStyle = lg(0, -13, 0, 13, [[0, '#5d646f'], [0.3, '#30343c'], [1, '#17191e']]);
      ctx.beginPath(); ctx.roundRect(-22, -13, 46, 26, 11); ctx.fill();                                // barrel
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.roundRect(-16, -10, 32, 4, 2); ctx.fill();
      ctx.fillStyle = lg(0, -10, 0, 10, steel); ctx.beginPath(); ctx.roundRect(-33, -9.5, 12, 19, 3); ctx.fill();   // nozzle
      ctx.fillStyle = '#0f1013'; ctx.beginPath(); ctx.ellipse(-33, 0, 2.2, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a929e'; ctx.lineWidth = 1;                                                  // rear grille
      for (const r of [3, 6.5, 10]) { ctx.beginPath(); ctx.ellipse(23, 0, 1.4, r, 0, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { const o = (t * 90 + i * 9) % 26; ctx.beginPath(); ctx.moveTo(-38 - o, i * 7); ctx.lineTo(-48 - o, i * 9); ctx.stroke(); }
    } else if (this.stage === 'dye') {      // a tint brush: slim black handle, steel ferrule, bristles loaded with colour
      ctx.rotate(0.7);
      ctx.fillStyle = 'rgba(30,15,15,0.2)'; ctx.beginPath(); ctx.roundRect(-1, -40, 8, 44, 3); ctx.fill();
      ctx.fillStyle = lg(-4, 0, 4, 0, [[0, '#4a4f59'], [0.4, '#262a31'], [1, '#111317']]);
      ctx.beginPath(); ctx.moveTo(-1.5, -46); ctx.lineTo(1.5, -46); ctx.lineTo(4, -6); ctx.lineTo(-4, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = lg(-9, 0, 9, 0, steel); ctx.beginPath(); ctx.roundRect(-9, -7, 18, 7, 1.5); ctx.fill();
      const dye = this.pick.dye || '#e9e4da';
      ctx.fillStyle = '#d9d2c4'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(8, 18); ctx.lineTo(-8, 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = dye; ctx.beginPath(); ctx.moveTo(-8.6, 6); ctx.lineTo(8.6, 6); ctx.lineTo(8, 18); ctx.quadraticCurveTo(0, 21, -8, 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.6;
      for (let xx = -6; xx <= 6; xx += 2) { ctx.beginPath(); ctx.moveTo(xx, 1); ctx.lineTo(xx * 0.92, 18); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-3, 13, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
    } else {                                // shampoo: a soft handful of suds on the fingertips
      for (const [bx, by, br] of [[-30, 40, 9], [-22, 46, 6], [-36, 47, 5], [-27, 33, 4]]) {
        const sg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, 0, bx, by, br);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.7, 'rgba(236,243,250,0.95)'); sg.addColorStop(1, 'rgba(190,205,225,0.9)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ================================================================= salon artwork
// Two views of the same place, both driven by your station levels so every
// upgrade is something you can see.

const rrect = (x, a, b, w, h, r) => { x.beginPath(); x.roundRect(a, b, w, h, r); };
function glow(x, cx, cy, r, color) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
}
function plant(x, px, py, s) {
  x.fillStyle = '#c98b5e';
  x.beginPath(); x.moveTo(px - 13 * s, py); x.lineTo(px + 13 * s, py); x.lineTo(px + 9 * s, py + 22 * s); x.lineTo(px - 9 * s, py + 22 * s); x.closePath(); x.fill();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.33;
    x.fillStyle = i % 2 ? '#4f9d69' : '#3b8457';
    x.save(); x.translate(px, py); x.rotate(a + Math.PI / 2);
    x.beginPath(); x.ellipse(0, -24 * s, 6.5 * s, 24 * s, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }
}

/** The whole salon, for the hub screen. Returns an image URL. */
export function salonPicture(lv, w = 340, h = 220, name = '') {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr; c.height = h * dpr;
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const decor = lv.decor || 0, wall = WALLS[decor] || WALLS[0];
  const floorY = h * 0.7;
  const gold = decor >= 3;
  const metal = gold ? '#d9b24c' : '#b9c0cc';

  // walls, skirting, floor
  const wg = x.createLinearGradient(0, 0, 0, floorY);
  wg.addColorStop(0, wall[0]); wg.addColorStop(1, wall[1]);
  x.fillStyle = wg; x.fillRect(0, 0, w, floorY);
  if (decor >= 2) {            // panelled wall
    x.strokeStyle = 'rgba(255,255,255,0.4)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) { rrect(x, 8 + i * (w - 16) / 5 + 4, 12, (w - 16) / 5 - 8, floorY - 30, 4); x.stroke(); }
  }
  x.fillStyle = decor >= 1 ? '#c9a27a' : '#b8b1ac'; x.fillRect(0, floorY, w, h - floorY);
  x.strokeStyle = 'rgba(0,0,0,0.08)'; x.lineWidth = 1;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * w / 8, floorY); x.lineTo(i * w / 8 - 30, h); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.75)'; x.fillRect(0, floorY - 5, w, 6);
  if (decor >= 3) { x.fillStyle = 'rgba(180,60,90,0.5)'; x.beginPath(); x.ellipse(w * 0.5, h * 0.9, w * 0.28, 15, 0, 0, Math.PI * 2); x.fill(); }   // rug

  // ---- mirror station (centre), lit when the decor allows
  const mx = w * 0.5, mw = 78, mh = 96, my = floorY - 34 - mh;
  x.fillStyle = metal; rrect(x, mx - mw / 2 - 5, my - 5, mw + 10, mh + 10, 16); x.fill();
  const mg = x.createLinearGradient(mx - mw / 2, my, mx + mw / 2, my + mh);
  mg.addColorStop(0, '#f4fbff'); mg.addColorStop(0.5, '#cfe3f0'); mg.addColorStop(1, '#eaf5fb');
  x.fillStyle = mg; rrect(x, mx - mw / 2, my, mw, mh, 12); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(mx - 22, my + 14); x.lineTo(mx - 6, my + mh - 20); x.stroke();
  if (decor >= 1) {
    for (let i = 0; i < 7; i++) {
      const bx = mx - mw / 2 - 5 + i * (mw + 10) / 6;
      glow(x, bx, my - 8, 14, 'rgba(255,236,170,0.75)');
      x.fillStyle = '#fff6cf'; x.beginPath(); x.arc(bx, my - 8, 4, 0, Math.PI * 2); x.fill();
    }
  }
  x.fillStyle = decor >= 2 ? '#f7f2ee' : '#e6dfda'; rrect(x, mx - 62, floorY - 34, 124, 10, 4); x.fill();   // counter
  x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(mx - 56, floorY - 24, 112, 22);

  // ---- cutting chair: plainer to plusher with each level
  const ch = lv.chair || 1, cx0 = mx, seatY = floorY - 4;
  const seat = ['#8fb3d9', '#7b61ff', '#c0395a'][ch - 1];
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.beginPath(); x.ellipse(cx0, h * 0.86, 40, 8, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = ch >= 3 ? '#d9b24c' : '#9aa3b0';
  x.fillRect(cx0 - 4, seatY, 8, 26); rrect(x, cx0 - 26, seatY + 24, 52, 7, 3); x.fill();
  x.fillStyle = seat;
  rrect(x, cx0 - 26, seatY - 50, 52, 46, 12); x.fill();          // back
  rrect(x, cx0 - 30, seatY - 12, 60, 16, 7); x.fill();           // seat
  if (ch >= 2) { x.fillStyle = ch >= 3 ? '#d9b24c' : '#c9ced6'; rrect(x, cx0 - 36, seatY - 24, 8, 22, 4); x.fill(); rrect(x, cx0 + 28, seatY - 24, 8, 22, 4); x.fill(); }
  if (ch >= 3) { x.fillStyle = 'rgba(255,255,255,0.3)'; for (let r = 0; r < 2; r++) for (let q = 0; q < 3; q++) { x.beginPath(); x.arc(cx0 - 14 + q * 14, seatY - 38 + r * 14, 2.2, 0, Math.PI * 2); x.fill(); } }

  // ---- shampoo station (left)
  const wl = lv.wash || 1, bx = w * 0.16;
  x.fillStyle = wl >= 3 ? '#efe9e2' : '#e3e7ee'; rrect(x, bx - 22, floorY - 44, 44, 44, 6); x.fill();       // pedestal
  x.fillStyle = '#ffffff'; x.beginPath(); x.ellipse(bx, floorY - 46, 30, 12, 0, 0, Math.PI * 2); x.fill();    // basin
  x.fillStyle = '#bfe3f5'; x.beginPath(); x.ellipse(bx, floorY - 46, 22, 7, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = wl >= 2 ? '#d9b24c' : '#9aa3b0'; x.lineWidth = 4; x.lineCap = 'round';
  x.beginPath(); x.moveTo(bx + 18, floorY - 50); x.quadraticCurveTo(bx + 20, floorY - 78, bx + 2, floorY - 70); x.stroke();   // tap
  if (wl >= 2) { x.fillStyle = '#c9ced6'; x.beginPath(); x.ellipse(bx, floorY - 68, 7, 4, 0, 0, Math.PI * 2); x.fill(); }      // shower head
  for (let i = 0; i < wl; i++) {                                                                                             // shampoo bottles
    x.fillStyle = ['#7b61ff', '#2ec4b6', '#ff9f6b'][i]; rrect(x, bx - 26 + i * 11, floorY - 104, 8, 18, 3); x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,0.8)'; x.fillRect(bx - 30, floorY - 86, 40, 3);                                              // shelf
  if (wl >= 3) { x.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) { rrect(x, bx - 18, floorY - 6 - i * 6 - 52 + 46, 30, 5, 2); x.fill(); } }   // towels

  // ---- colour bar (right): one bottle per dye you can offer
  const cl = lv.colour || 0, sx = w * 0.72;
  if (cl) {
    for (let row = 0; row < 3; row++) {
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(sx, floorY - 112 + row * 30, 84, 4);
      for (let i = 0; i < 4; i++) {
        const n = row * 4 + i;
        if (n >= cl * 4) continue;
        x.fillStyle = DYES[n]; rrect(x, sx + 6 + i * 19, floorY - 134 + row * 30, 12, 22, 3); x.fill();
        x.fillStyle = '#f4f4f6'; x.fillRect(sx + 9 + i * 19, floorY - 139 + row * 30, 6, 6);
      }
    }
  } else ghost(x, sx, floorY - 134, 84, 86, 'Colour Bar');

  // ---- styling station (far left wall): tools on hooks
  const sl = lv.style || 0, tx = w * 0.33;
  if (sl) {
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(tx - 22, floorY - 122, 44, 4);
    x.fillStyle = '#7b61ff'; rrect(x, tx - 20, floorY - 116, 22, 12, 5); x.fill(); x.fillRect(tx - 10, floorY - 106, 6, 14);          // dryer
    if (sl >= 2) { x.strokeStyle = '#5a5560'; x.lineWidth = 4; x.beginPath(); x.moveTo(tx + 10, floorY - 116); x.lineTo(tx + 10, floorY - 88); x.stroke(); }   // curling iron
    if (sl >= 3) { x.fillStyle = '#ff9f6b'; rrect(x, tx + 16, floorY - 116, 5, 26, 2); x.fill(); x.fillStyle = '#3b3640'; x.fillRect(tx + 14, floorY - 116, 9, 9); }   // brush
  } else ghost(x, tx - 22, floorY - 124, 44, 40, 'Styling');

  // ---- decor extras
  if (decor >= 1) plant(x, w * 0.93, floorY - 22, 0.8);
  if (decor >= 2) {
    for (const lx of [w * 0.2, w * 0.5, w * 0.8]) {
      x.strokeStyle = 'rgba(60,50,70,0.5)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(lx, 0); x.lineTo(lx, 20); x.stroke();
      glow(x, lx, 28, 26, 'rgba(255,230,160,0.6)');
      x.fillStyle = gold ? '#d9b24c' : '#f4f1f6'; x.beginPath(); x.arc(lx, 26, 8, Math.PI, 0); x.fill();
    }
  }
  if (decor >= 3) { x.fillStyle = '#d9b24c'; rrect(x, w * 0.86, 40, 34, 42, 4); x.fill(); x.fillStyle = '#f7e9c8'; x.fillRect(w * 0.86 + 4, 44, 26, 34); }   // framed art
  if (name) {            // the sign over the door
    x.font = '800 12px ui-rounded, -apple-system, system-ui, sans-serif';
    const tw = Math.min(w - 40, x.measureText(name).width + 22);
    x.fillStyle = 'rgba(43,37,64,0.85)'; rrect(x, (w - tw) / 2, 6, tw, 20, 10); x.fill();
    x.fillStyle = '#fff6cf'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(name, w / 2, 16.5, w - 60);
  }
  return c.toDataURL('image/png');
}

function ghost(x, a, b, w, h, label) {       // a spot where a station you don't own yet would go
  x.save();
  x.setLineDash([5, 5]); x.strokeStyle = 'rgba(60,50,90,0.35)'; x.lineWidth = 1.5;
  rrect(x, a, b, w, h, 8); x.stroke();
  x.fillStyle = 'rgba(60,50,90,0.45)'; x.font = '700 9px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(label, a + w / 2, b + h / 2 - 5); x.fillText('for sale', a + w / 2, b + h / 2 + 6);
  x.restore();
}

/** What sits behind the client during a visit: her mirror, softly out of focus. */
export function salonBackdrop(x, w, h, lv) {
  const decor = lv.decor || 0, gold = decor >= 3;
  // the big mirror she is sitting at
  const mw = w * 0.86, mh = h * 0.62, mx = (w - mw) / 2, my = h * 0.06;
  x.fillStyle = gold ? 'rgba(217,178,76,0.85)' : 'rgba(190,196,208,0.85)';
  rrect(x, mx - 8, my - 8, mw + 16, mh + 16, 46); x.fill();
  const mg = x.createLinearGradient(mx, my, mx + mw, my + mh);
  mg.addColorStop(0, 'rgba(244,251,255,0.9)'); mg.addColorStop(0.55, 'rgba(206,224,238,0.9)'); mg.addColorStop(1, 'rgba(232,244,250,0.9)');
  x.fillStyle = mg; rrect(x, mx, my, mw, mh, 40); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 14; x.lineCap = 'round';
  x.beginPath(); x.moveTo(mx + mw * 0.12, my + mh * 0.1); x.lineTo(mx + mw * 0.26, my + mh * 0.5); x.stroke();
  // bulbs round the mirror once the decor is upgraded
  if (decor >= 1) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      for (const bx of [mx - 8, mx + mw + 8]) {
        const by = my + 20 + i * (mh - 40) / (n - 1);
        glow(x, bx, by, 26, 'rgba(255,238,180,0.7)');
        x.fillStyle = '#fff7d6'; x.beginPath(); x.arc(bx, by, 6, 0, Math.PI * 2); x.fill();
      }
    }
  }
  // shelf of dyes off to one side, a plant on the other
  const cl = lv.colour || 0;
  x.fillStyle = 'rgba(255,255,255,0.7)'; x.fillRect(w * 0.72, h * 0.74, w * 0.3, 5);
  for (let i = 0; i < Math.min(5, cl * 4); i++) { x.fillStyle = DYES[i]; rrect(x, w * 0.74 + i * 19, h * 0.74 - 26, 13, 26, 3); x.fill(); }
  if (decor >= 1) plant(x, w * 0.1, h * 0.72, 1.3);
  if (decor >= 2) for (const lx of [w * 0.25, w * 0.75]) glow(x, lx, 6, 60, 'rgba(255,230,160,0.45)');
}
