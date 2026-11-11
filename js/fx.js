// Particles (flying droplets), splats left on the skin, floating text and the wipe trail.

import * as audio from './audio.js';

const MAX_SPLATS = 450;

export class FX {
  constructor() { this.reset(); }

  reset() {
    this.drops = [];
    this.splats = [];
    this.texts = [];
    this.trail = [];
    this.sparkles = [];
    this.messMade = 0;   // total "mass" of mess ever made this level
    this.fading = false; // once wiping is finished, the last traces melt away
  }

  // ---- droplets ----
  squirt(x, y, angle, count, { color, speed = 260, spread = 0.5, size = 3, lift = 160 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = angle + (Math.random() - 0.5) * spread * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.drops.push({
        x, y, z: 4,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: lift * (0.5 + Math.random()),
        r: size * (0.5 + Math.random() * 0.9),
        color,
      });
    }
  }

  // ---- splats ----
  addSplat(s) {
    s.alpha = s.alpha ?? 1;
    s.mass = s.mass ?? 1;
    this.messMade += s.mass;
    this.splats.push(s);
    if (this.splats.length > MAX_SPLATS) {
      const old = this.splats.shift();
      this.messMade -= old.mass * old.alpha;
    }
  }

  dropSplat(x, y, r, color, vx = 0, vy = 0) {
    const sp = Math.hypot(vx, vy);
    const stretch = 1 + Math.min(sp / 300, 1.2);
    this.addSplat({
      kind: 'drop', x, y, rx: r * stretch, ry: r, rot: Math.atan2(vy, vx), color,
      mass: r * r * stretch * 0.05, bx: r * stretch,
    });
  }

  wormSplat(pts, width, color, tipColor, plugLen, hair = false) {
    if (pts.length < 2) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    this.addSplat({
      kind: 'worm', hair, pts, w: width, color, tipColor, plugLen,
      box: [minX - width, minY - width, maxX + width, maxY + width],
      mass: pts.length * width * 0.06,
    });
  }

  messLeft() {
    let m = 0;
    for (const s of this.splats) m += s.mass * s.alpha;
    return m;
  }

  cleanliness() {
    if (this.messMade <= 0.01) return 1;
    return Math.max(0, Math.min(1, 1 - this.messLeft() / this.messMade));
  }

  /** Wipe at a point. Returns how much mess got cleaned. */
  wipe(x, y, radius, strength = 0.3) {
    let cleaned = 0;
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const s = this.splats[i];
      let hit = false;
      if (s.kind === 'drop') {
        hit = Math.hypot(s.x - x, s.y - y) < radius + s.bx;
      } else {
        const b = s.box;
        if (x + radius < b[0] || x - radius > b[2] || y + radius < b[1] || y - radius > b[3]) continue;
        const rr = (radius + s.w) * (radius + s.w);
        for (let k = 0; k < s.pts.length; k += 3) {
          const dx = s.pts[k].x - x, dy = s.pts[k].y - y;
          if (dx * dx + dy * dy < rr) { hit = true; break; }
        }
      }
      if (hit) {
        const before = s.alpha;
        s.alpha = Math.max(0, s.alpha - strength);
        // smear: nudge toward wipe direction a little
        cleaned += (before - s.alpha) * s.mass;
        if (s.alpha <= 0.04) {
          this.splats.splice(i, 1);
          cleaned += s.alpha * s.mass;
        }
      }
    }
    return cleaned;
  }

  addTrail(x, y, r = 26) { this.trail.push({ x, y, r, t: 0 }); }

  text(x, y, str, color = '#fff', size = 22) {
    this.texts.push({ x, y, str, color, size, t: 0, life: 1.1 });
  }

  sparkleBurst(x, y, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 110;
      this.sparkles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.6 + Math.random() * 0.5, bow: Math.random() < 0.45, rot: Math.random() - 0.5 });
    }
  }

  update(dt) {
    if (this.fading) {
      for (let i = this.splats.length - 1; i >= 0; i--) {
        this.splats[i].alpha -= dt * 2.5;
        if (this.splats[i].alpha <= 0) this.splats.splice(i, 1);
      }
    }
    const G = 900;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vz -= G * dt;
      d.z += d.vz * dt;
      d.vx *= 0.985; d.vy *= 0.985;
      if (d.z <= 0) {
        this.dropSplat(d.x, d.y, d.r * 1.25, d.color, d.vx, d.vy);
        if (Math.random() < 0.25) audio.plip();
        this.drops.splice(i, 1);
      }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > t.life) this.texts.splice(i, 1);
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].t += dt;
      if (this.trail[i].t > 0.35) this.trail.splice(i, 1);
    }
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.94; s.vy *= 0.94;
      if (s.t > s.life) this.sparkles.splice(i, 1);
    }
  }

  drawSplats(ctx) {
    for (const s of this.splats) {
      ctx.globalAlpha = s.alpha;
      if (s.kind === 'drop') {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        // a blob with a tail and a darker wet edge, not a neat oval
        const hex = s.color[0] === '#';
        if (hex) {
          // it sits on the skin: a soft shadow underneath, toward the lower right
          ctx.fillStyle = 'rgba(60,24,16,0.2)';
          ctx.beginPath(); ctx.ellipse(s.rx * 0.14, s.ry * 0.34, s.rx * 1.12, s.ry * 1.1, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = shade(s.color);
          ctx.beginPath();
          ctx.ellipse(0, 0, s.rx * 1.08, s.ry * 1.12, 0, 0, Math.PI * 2);
          ctx.ellipse(s.rx * 0.75, s.ry * 0.15, s.rx * 0.5, s.ry * 0.62, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2);
        ctx.ellipse(s.rx * 0.72, s.ry * 0.14, s.rx * 0.42, s.ry * 0.52, 0, 0, Math.PI * 2);
        ctx.fill();
        // thicker in the middle, so it is paler there; two flecks that landed beside it
        ctx.fillStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath(); ctx.ellipse(s.rx * 0.05, s.ry * 0.05, s.rx * 0.62, s.ry * 0.58, 0, 0, Math.PI * 2); ctx.fill();
        if (s.rx > 3) {
          ctx.fillStyle = s.color;
          ctx.beginPath();
          ctx.ellipse(-s.rx * 1.55, s.ry * 0.7, s.rx * 0.2, s.ry * 0.17, 0.4, 0, Math.PI * 2);
          ctx.ellipse(s.rx * 0.35, -s.ry * 1.65, s.rx * 0.14, s.ry * 0.13, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.ellipse(-s.rx * 0.25, -s.ry * 0.32, s.rx * 0.28, s.ry * 0.2, 0, 0, Math.PI * 2);
        ctx.ellipse(s.rx * 0.5, -s.ry * 0.1, s.rx * 0.09, s.ry * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (s.hair) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.pts[0].x, s.pts[0].y);
        for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
        ctx.stroke();
      } else {
        drawWorm(ctx, s.pts, s.pts.length, s.w, s.color, s.tipColor, s.plugLen);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawAir(ctx) {
    // flying droplets (with ground shadow, higher = bigger)
    for (const d of this.drops) {
      ctx.fillStyle = 'rgba(60,20,10,0.18)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
      const s = 1 + d.z / 120;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x, d.y - d.z * 0.5, d.r * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.3 * s, d.y - d.z * 0.5 - d.r * 0.3 * s, d.r * 0.35 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // cotton wipe trail
    for (const p of this.trail) {
      const a = 1 - p.t / 0.35;
      ctx.fillStyle = `rgba(255,255,255,${0.35 * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.8 + 0.2 * a), 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of this.sparkles) {
      const a = 1 - s.t / s.life;
      drawStar(ctx, s.x, s.y, 5 * a + 1, `rgba(255,230,140,${a})`);
    }

    // floating text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.t / t.life;
      const pop = p < 0.15 ? 0.6 + (p / 0.15) * 0.5 : 1.1 - Math.min(p, 0.3) * 0.33;
      ctx.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      ctx.font = `900 ${t.size * pop}px ui-rounded, -apple-system, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(40,10,20,0.75)';
      ctx.lineJoin = 'round';
      const y = t.y - p * 50;
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;
  }
}

export function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/**
 * Draws a squeezed-out "worm" of pus along pts[0..n). pts[0] is at the pimple, the
 * last point is the tip (the stuff that came out first). plugLen > 0 tints the tip
 * (for blackheads, where the dark oxidized plug comes out first).
 */
export function drawWorm(ctx, pts, n, w, color, tipColor, plugLen = 0) {
  if (n < 2) return;
  // thickness wobbles along its length and tapers at the tip, like the real thing
  const rad = (i) => w * 0.5 * (0.84 + 0.18 * Math.sin(i * 0.31) + 0.07 * Math.sin(i * 1.3)) * (i > n - 5 ? 0.5 + 0.1 * (n - i) : 1);
  const pass = (from, dx, dy, k, style) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    for (let i = from; i < n; i += 2) {
      const p = pts[i], r = rad(i) * k;
      ctx.moveTo(p.x + dx + r, p.y + dy);
      ctx.arc(p.x + dx, p.y + dy, r, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  pass(0, 1.5, 2.5, 1.06, 'rgba(70,25,10,0.22)');          // shadow
  pass(0, 0, 0, 1, shade(color));                           // darker edge
  pass(0, -w * 0.04, -w * 0.05, 0.86, color);               // body
  if (plugLen > 0 && tipColor) pass(Math.max(0, n - plugLen), 0, 0, 0.97, tipColor);   // dark plug at the tip
  pass(0, -w * 0.16, -w * 0.2, 0.28, 'rgba(255,255,255,0.42)');   // wet gloss
}

const shadeCache = new Map();
function shade(hex) {
  if (shadeCache.has(hex)) return shadeCache.get(hex);
  const n = parseInt(hex.slice(1), 16);
  const f = 0.78;
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  const out = `rgb(${r},${g},${b})`;
  shadeCache.set(hex, out);
  return out;
}
