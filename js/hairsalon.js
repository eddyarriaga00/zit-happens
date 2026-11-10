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
export const WALLS = [['#ece6e9', '#cfc3ca'], ['#e4f5ee', '#b9dccd'], ['#efe6fa', '#cdb8ea'], ['#fff3d6', '#f0cf8a']];
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
    for (let y = CELL / 2; y < G.H; y += CELL) for (let x = CELL / 2; x < G.W; x += CELL) if (G.geo.onHair(x, y)) this.cells.push({ x, y, j: Math.random(), k: Math.random() });
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
    if (s === 'shampoo') { this.paint(this.foam, x, y, r, 0.5); audio.squish(0.2 + Math.random() * 0.3); if (Math.random() < 0.12) audio.bloop(); }
    else if (s === 'rinse') {
      this.paint(this.foam, x, y, r + 6, -1);
      audio.wipe(0.9);
      for (let i = 0; i < 2; i++) this.drops.push({ x: x + (Math.random() - 0.5) * 50, y: y + 10, vy: 260 + Math.random() * 160, t: 0 });
    } else if (s === 'dye') { this.paint(this.coat, x, y, 38, 0.6); audio.squish(0.15); }
    else if (s === 'dry') { this.paint(this.dry, x, y, 46, 0.35); audio.wipe(0.15); }
    if (++this.tick % 6 === 0) buzz('light');
  }
  down(id, x, y) { if (this.pause > 0 || this.ready) return; if (this.stage === 'cut') this.cut.down(id, x, y); else this.apply(x, y); }
  move(id, x, y, px, py) {
    if (this.pause > 0 || this.ready) return;
    if (this.stage === 'cut') return this.cut.move(id, x, y, px, py);
    const d = Math.hypot(x - px, y - py), n = Math.max(1, Math.ceil(d / 14));
    for (let k = 1; k <= n; k++) this.apply(px + (x - px) * k / n, py + (y - py) * k / n);
  }
  up(id) { this.hand = null; if (this.cut) this.cut.up(id); }

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
    }
    // dye paste
    if (this.stage === 'dye' && this.pick.dye) {
      ctx.fillStyle = this.pick.dye;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      for (let i = 0; i < this.cells.length; i++) { const v = this.coat[i]; if (v < 0.05) continue; const c = this.cells[i], r = CELL * (0.5 + 0.35 * v); ctx.moveTo(c.x + r, c.y); ctx.arc(c.x + (c.j - 0.5) * 6, c.y + (c.k - 0.5) * 6, r, 0, Math.PI * 2); }
      ctx.fill();
      ctx.globalAlpha = 1;
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
    }
    // rinse water
    ctx.strokeStyle = 'rgba(190,225,255,0.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const d of this.drops) { ctx.globalAlpha = 1 - d.t / 0.5; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y + 12); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // "missed a bit" rings once most of it is done
    const arr = { shampoo: this.foam, dye: this.coat, dry: this.dry }[this.stage];
    if (arr && this.stageProgress() > 0.5) {
      ctx.strokeStyle = `rgba(255,79,154,${0.5 + 0.4 * Math.sin(t * 6)})`; ctx.lineWidth = 2;
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
    if (this.stage === 'rinse') {           // shower head
      ctx.rotate(0.5);
      ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = '#e3e7ee'; ctx.beginPath(); ctx.ellipse(0, 6, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
    } else if (this.stage === 'dry') {      // hair dryer, with air streaks
      ctx.rotate(-0.6);
      ctx.fillStyle = '#ff7fb8'; ctx.beginPath(); ctx.roundRect(-22, -12, 44, 24, 10); ctx.fill();
      ctx.fillStyle = '#e0569a'; ctx.beginPath(); ctx.roundRect(-4, 8, 12, 28, 5); ctx.fill();
      ctx.fillStyle = '#5a5560'; ctx.beginPath(); ctx.roundRect(-30, -9, 10, 18, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) { const o = (t * 90 + i * 9) % 26; ctx.beginPath(); ctx.moveTo(-34 - o, i * 7); ctx.lineTo(-44 - o, i * 9); ctx.stroke(); }
    } else if (this.stage === 'dye') {      // tint brush
      ctx.rotate(0.7);
      ctx.fillStyle = '#5a5560'; ctx.beginPath(); ctx.roundRect(-4, -34, 8, 34, 3); ctx.fill();
      ctx.fillStyle = this.pick.dye || '#fff'; ctx.beginPath(); ctx.roundRect(-9, 0, 18, 16, 4); ctx.fill();
    } else {                                // shampoo: a blob of suds on the fingertips
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(-30, 40, 9, 0, Math.PI * 2); ctx.arc(-22, 46, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
