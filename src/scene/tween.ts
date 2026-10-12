import { requestRender } from './frame';

interface Tween {
  t0: number;
  dur: number;
  fn: (eased: number, linear: number) => void;
  done?: () => void;
  key?: string;
}

const tweens: Tween[] = [];

const ease = (k: number) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

// A new tween with the same key replaces the running one.
export function tween(dur: number, fn: Tween['fn'], done?: () => void, key?: string): void {
  if (key) for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1);
  tweens.push({ t0: performance.now(), dur, fn, done, key });
  requestRender();
}

export function hasTweens(): boolean {
  return tweens.length > 0;
}

export function runTweens(now: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    const k = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur));
    tw.fn(ease(k), k);
    if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
  }
}
