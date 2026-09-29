/**
 * Short alarm chimes made with Web Audio (no audio files to ship).
 * Browsers only allow sound after a user gesture, so unlockAudio() is called
 * from the Start button; later chimes then play on their own.
 */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

export type Chime = 'focusEnd' | 'breakEnd' | 'done';

const PATTERNS: Record<Chime, number[]> = {
  focusEnd: [880, 660],
  breakEnd: [660, 880],
  done: [523, 659, 784, 1047],
};

export function playChime(kind: Chime): void {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    /* ignore */
  }
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  let t = ctx.currentTime + 0.05;
  for (let round = 0; round < 3; round++) {
    for (const freq of PATTERNS[kind]) {
      beep(ctx, freq, t, 0.18);
      t += 0.22;
    }
    t += 0.35;
  }
}

function beep(c: AudioContext, freq: number, at: number, dur: number): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}
