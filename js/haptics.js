// Haptics.
// Android/Chrome: navigator.vibrate works.
// iPhone (iOS 18+ Safari / home-screen app): there is no vibrate API, but toggling a
// native <input type="checkbox" switch> plays the system "tick" haptic. We click a hidden
// one. It is a best-effort trick and works most reliably inside touch handlers.

let enabled = true;
let label = null;
let last = 0;

export function setHapticsEnabled(on) { enabled = on; }

function iosTick() {
  if (!label) label = document.getElementById('haptic-label');
  if (label) label.click();
}

/** strength: 'light' | 'medium' | 'heavy' */
export function buzz(strength = 'light') {
  if (!enabled) return;
  const now = performance.now();
  const minGap = strength === 'light' ? 60 : 30;
  if (now - last < minGap) return;
  last = now;
  if (navigator.vibrate) {
    navigator.vibrate(strength === 'heavy' ? 40 : strength === 'medium' ? 20 : 8);
  } else {
    iosTick();
    if (strength === 'heavy') setTimeout(iosTick, 70);
  }
}
