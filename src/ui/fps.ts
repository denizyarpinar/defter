// Faz 2.5: small FPS counter, only with ?fps=1 in the address.
// Counts frames that were actually drawn: the loop skips frames while nothing changes,
// so an idle room shows "beklemede". Also shows the slowest frame of the last second.

const IDLE_GAP_MS = 250;

export interface FpsCounter {
  tick(now: number): void;
}

export function createFpsCounter(): FpsCounter | null {
  if (new URLSearchParams(location.search).get('fps') !== '1') return null;
  const el = document.createElement('div');
  el.id = 'fps';
  el.textContent = '… fps';
  document.body.appendChild(el);

  let frames = 0, worst = 0, last = 0;
  const show = () => {
    el.textContent = frames ? `${frames} fps · en yavaş ${worst.toFixed(0)} ms` : '0 fps · beklemede';
    frames = 0; worst = 0;
  };
  // updates once a second on its own timer, so an idle scene still shows 0
  setInterval(show, 1000);
  return {
    tick(now) {
      // a longer gap means the scene was idle, not that the frame was slow
      const dt = now - last;
      if (dt < IDLE_GAP_MS) worst = Math.max(worst, dt);
      last = now;
      frames++;
    }
  };
}
