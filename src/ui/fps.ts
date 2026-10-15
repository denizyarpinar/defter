// Faz 2.5: small FPS counter, only with ?fps=1 in the address. Task 3.6: also in the reader.
// Counts frames that were actually drawn: the loop skips frames while nothing changes,
// so an idle room shows "beklemede". Also shows the slowest frame of the last second.
// Task 3.7: a second line with the reader's canvases and the slowest page drawing (ui/tani.ts).

import { canvasLine } from './tani';

const IDLE_GAP_MS = 250;

export interface FpsCounter {
  tick(now: number): void;
}

// One counter for the room and the reader (task 3.6): both tick the same box.
let counter: FpsCounter | null | undefined;
export function fpsCounter(): FpsCounter | null {
  if (counter === undefined) counter = createFpsCounter();
  return counter;
}

function createFpsCounter(): FpsCounter | null {
  if (new URLSearchParams(location.search).get('fps') !== '1') return null;
  const el = document.createElement('div');
  el.id = 'fps';
  el.textContent = '… fps';
  document.body.appendChild(el);

  let frames = 0, worst = 0, last = 0;
  const show = () => {
    el.textContent = (frames ? `${frames} fps · en yavaş kare ${worst.toFixed(0)} ms` : '0 fps · beklemede') + '\n' + canvasLine();
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
