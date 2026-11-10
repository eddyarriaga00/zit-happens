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
  tone(t, 0.12, { freq: 260 / size + 80, freqEnd: 60, gain: 0.55, type: 'sine' });
  noise(t, 0.09, { type: 'highpass', freq: 1800, q: 0.7, gain: 0.5 });
  noise(t + 0.01, 0.25 + size * 0.1, { type: 'lowpass', freq: 1400, freqEnd: 200, q: 3, gain: 0.45 });
  // wet splat tail
  noise(t + 0.04, 0.32, { type: 'bandpass', freq: 700, freqEnd: 160, q: 7, gain: 0.35 });
  tone(t + 0.05, 0.1, { freq: 150, freqEnd: 420, gain: 0.16 });
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

export function perfect() {
  if (!ready()) return;
  const t = ctx.currentTime;
  tone(t, 0.18, { freq: 880, gain: 0.18, type: 'triangle' });
  tone(t + 0.08, 0.3, { freq: 1320, gain: 0.18, type: 'triangle' });
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

export function click() {
  if (!ready()) return;
  tone(ctx.currentTime, 0.04, { freq: 900, gain: 0.08, type: 'sine' });
}
