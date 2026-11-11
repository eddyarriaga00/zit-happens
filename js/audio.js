// All sounds are synthesized with WebAudio, so there are no audio files to load.
// iOS only allows audio after a user gesture, so call unlock() from a touch handler.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
let oozeNodes = null;
let lastSquish = 0;

export function setSoundEnabled(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.9 : 0;
}

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    // a little room reverb makes every pop and squish feel closer and wetter
    const len = Math.floor(ctx.sampleRate * 1.1);
    const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    const verb = ctx.createConvolver();
    verb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    master.connect(verb).connect(wet).connect(comp);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function ready() { return ctx && enabled && ctx.state === 'running'; }

function noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, freqEnd = null, attack = 0.005 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(t, dur, { freq = 440, freqEnd = null, type = 'sine', gain = 0.3, attack = 0.005 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Little creaky squish while pressure builds. p = 0..1 */
export function squish(p) {
  if (!ready()) return;
  const now = ctx.currentTime;
  if (now - lastSquish < 0.07) return;
  lastSquish = now;
  noise(now, 0.06 + p * 0.04, { type: 'bandpass', freq: 300 + p * 900, q: 6, gain: 0.05 + p * 0.12 });
}

/** The big moment. size ~ 0.5..2 */
export function pop(size = 1) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const v = 0.9 + Math.random() * 0.25;                     // no two pops quite alike
  noise(t, 0.012, { type: 'highpass', freq: 5000, q: 0.7, gain: 0.35 });           // skin giving way
  tone(t + 0.004, 0.14, { freq: (260 / size + 80) * v, freqEnd: 55, gain: 0.6, type: 'sine' });   // the thump
  noise(t + 0.004, 0.09, { type: 'highpass', freq: 1800, q: 0.7, gain: 0.45 });
  noise(t + 0.015, 0.25 + size * 0.1, { type: 'lowpass', freq: 1400 * v, freqEnd: 200, q: 3, gain: 0.45 });
  noise(t + 0.045, 0.34, { type: 'bandpass', freq: 700 * v, freqEnd: 160, q: 7, gain: 0.36 });     // wet splat tail
  tone(t + 0.055, 0.1, { freq: 150, freqEnd: 420 * v, gain: 0.16 });
  tone(t + 0.12, 0.08, { freq: 300 * v, freqEnd: 700, gain: 0.07 });               // a last little blip
}

/** Wet squelch loop while pus is coming out. */
export function oozeStart() {
  if (!ready() || oozeNodes) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 400;
  f.Q.value = 8;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220;
  lfo.connect(lfoGain).connect(f.frequency);
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  g.gain.exponentialRampToValueAtTime(0.26, ctx.currentTime + 0.05);
  src.connect(f).connect(g).connect(master);
  src.start();
  lfo.start();
  oozeNodes = { src, lfo, g, f };
}

export function oozeSet(level) {
  if (!oozeNodes) return;
  oozeNodes.f.frequency.setTargetAtTime(250 + level * 350, ctx.currentTime, 0.05);
  oozeNodes.lfo.frequency.setTargetAtTime(5 + level * 7, ctx.currentTime, 0.08);
}

export function oozeStop() {
  if (!oozeNodes) return;
  const { src, lfo, g } = oozeNodes;
  const t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setTargetAtTime(0.0001, t, 0.03);
  src.stop(t + 0.2);
  lfo.stop(t + 0.2);
  oozeNodes = null;
}

/** Little bubbly "bloop" as pus pushes out. */
export function bloop() {
  if (!ready()) return;
  const t = ctx.currentTime;
  const f = 170 + Math.random() * 230;
  tone(t, 0.07, { freq: f, freqEnd: f * 2.3, gain: 0.1 });
  noise(t, 0.05, { type: 'bandpass', freq: 500 + Math.random() * 500, q: 9, gain: 0.08 });
}

/** The last wet slurp when a pimple runs dry. */
export function schlorp() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.3, { type: 'bandpass', freq: 950, freqEnd: 170, q: 6, gain: 0.4 });
  tone(t + 0.02, 0.22, { freq: 330, freqEnd: 85, gain: 0.2 });
}

/** Needle prick. */
export function prick() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.035, { freq: 2600, freqEnd: 1300, gain: 0.14, type: 'triangle' });
  noise(t, 0.05, { type: 'highpass', freq: 4200, q: 0.7, gain: 0.12 });
  noise(t + 0.03, 0.12, { type: 'bandpass', freq: 600, q: 6, gain: 0.12 });
}

/** A hair finally coming free. */
export function pluck() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.1, { freq: 800, freqEnd: 1900, gain: 0.2, type: 'triangle' });
  noise(t, 0.05, { type: 'highpass', freq: 3000, q: 0.7, gain: 0.2 });
  tone(t + 0.03, 0.16, { freq: 150, freqEnd: 70, gain: 0.3 });
}

/** The reward chime. It climbs a note with each Perfect in a row. */
export function perfect(streak = 0) {
  if (!ready()) return;
  const t = ctx.currentTime;
  const k = Math.pow(2, Math.min(streak, 10) / 12);
  tone(t, 0.18, { freq: 880 * k, gain: 0.17, type: 'triangle' });
  tone(t + 0.08, 0.32, { freq: 1320 * k, gain: 0.17, type: 'triangle' });
  tone(t + 0.08, 0.5, { freq: 2640 * k, gain: 0.04, type: 'sine' });
}

// ---- sounds that run for as long as you keep doing something
const loops = {};
const LOOPS = {
  water: { type: 'highpass', freq: 1800, q: 0.6, gain: 0.2, lfo: 11, depth: 500 },
  dryer: { type: 'bandpass', freq: 520, q: 1.1, gain: 0.26, lfo: 38, depth: 60, hum: 118 },
  steam: { type: 'highpass', freq: 3600, q: 0.5, gain: 0.12, lfo: 3, depth: 800 },
};
/** Turn a running sound ('water', 'dryer', 'steam') on or off. Safe to call every frame. */
export function loop(name, on) {
  if (!on) {
    const n = loops[name];
    if (!n) return;
    const t = ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setTargetAtTime(0.0001, t, 0.06);
    for (const node of n.all) node.stop(t + 0.35);
    delete loops[name];
    return;
  }
  if (!ready() || loops[name]) return;
  const o = LOOPS[name], t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type; f.frequency.value = o.freq; f.Q.value = o.q;
  const lfo = ctx.createOscillator(); lfo.frequency.value = o.lfo;
  const lg = ctx.createGain(); lg.gain.value = o.depth;
  lfo.connect(lg).connect(f.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + 0.12);
  src.connect(f).connect(g).connect(master);
  const all = [src, lfo];
  if (o.hum) {                       // the motor under the rush of air
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = o.hum;
    const hg = ctx.createGain(); hg.gain.value = 0.05;
    hum.connect(hg).connect(g);
    hum.start(); all.push(hum);
  }
  src.start(); lfo.start();
  loops[name] = { g, all };
}
export function loopStopAll() { for (const name of Object.keys(loops)) loop(name, false); }

/** Soft foamy scrub. */
export function scrub() {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (t - lastSquish < 0.06) return;
  lastSquish = t;
  noise(t, 0.09, { type: 'bandpass', freq: 2200 + Math.random() * 1800, q: 1.4, gain: 0.07 });
  if (Math.random() < 0.3) tone(t, 0.05, { freq: 700 + Math.random() * 900, freqEnd: 1800, gain: 0.03 });
}

/** A coin dropping in. */
export function coin() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.09, { freq: 1568, gain: 0.14, type: 'square' });
  tone(t + 0.07, 0.35, { freq: 2093, gain: 0.14, type: 'square' });
}

/** Cash register: the big payout. */
export function chaChing() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.05, { type: 'highpass', freq: 3000, q: 0.7, gain: 0.25 });
  tone(t + 0.05, 0.12, { freq: 1175, gain: 0.16, type: 'triangle' });
  [1568, 2093, 2637].forEach((f, i) => tone(t + 0.16 + i * 0.05, 0.5, { freq: f, gain: 0.13, type: 'triangle' }));
}

/** Ding-dong: a client walks in. */
export function doorbell() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.7, { freq: 659, gain: 0.2, type: 'sine' });
  tone(t, 0.7, { freq: 1318, gain: 0.05, type: 'sine' });
  tone(t + 0.32, 0.9, { freq: 523, gain: 0.2, type: 'sine' });
  tone(t + 0.32, 0.9, { freq: 1046, gain: 0.05, type: 'sine' });
}

/** A proud little flourish for an award. */
export function award() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(t + i * 0.07, 0.45, { freq: f, gain: 0.13, type: 'triangle' }));
  tone(t + 0.36, 0.9, { freq: 2349, gain: 0.07, type: 'sine' });
}

export function ouch() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.3, { freq: 220, freqEnd: 110, gain: 0.25, type: 'square' });
}

export function plip() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.06, { freq: 500 + Math.random() * 400, freqEnd: 200, gain: 0.08 });
}

let lastWipe = 0;
export function wipe(speed) {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (t - lastWipe < 0.09) return;
  lastWipe = t;
  noise(t, 0.12, { type: 'bandpass', freq: 2500 + speed * 2000, q: 1.2, gain: 0.04 });
}

export function sparkle() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [1568, 2093, 2637].forEach((f, i) => tone(t + i * 0.06, 0.25, { freq: f, gain: 0.1, type: 'sine' }));
}

export function fanfare() {
  if (!ready()) return;
  const t = ctx.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.11, 0.35, { freq: f, gain: 0.16, type: 'triangle' }));
}

/** A lid / cap popping open. */
export function cap() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.06, { freq: 420, freqEnd: 1100, gain: 0.22, type: 'sine' });
  noise(t, 0.04, { type: 'highpass', freq: 2500, q: 0.7, gain: 0.18 });
}

/** Something soft landing in the bin. */
export function thud() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.12, { freq: 130, freqEnd: 60, gain: 0.3 });
  noise(t, 0.06, { type: 'lowpass', freq: 500, q: 1, gain: 0.15 });
}

/** Antiseptic spritz. */
export function spritz() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.22, { type: 'highpass', freq: 3200, q: 0.7, gain: 0.28, attack: 0.02 });
  noise(t, 0.1, { type: 'bandpass', freq: 1400, q: 3, gain: 0.1 });
}

/** Scissors. */
export function snip() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.035, { type: 'highpass', freq: 5000, q: 0.7, gain: 0.3 });
  tone(t + 0.02, 0.03, { freq: 3200, freqEnd: 1800, gain: 0.12, type: 'triangle' });
  noise(t + 0.035, 0.03, { type: 'highpass', freq: 6000, q: 0.7, gain: 0.2 });
}

export function click() {
  if (!ready()) return;
  tone(ctx.currentTime, 0.04, { freq: 900, gain: 0.08, type: 'sine' });
}

/** One tiny crackle: a strip peeling, a plug letting go. */
export function crackle() {
  if (!ready()) return;
  const t = ctx.currentTime;
  noise(t, 0.03, { type: 'highpass', freq: 2400 + Math.random() * 2600, q: 0.8, gain: 0.17 });
}
