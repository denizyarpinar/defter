import type { View } from '../scene';
import { toast } from './toast';

export type LightMode = 'auto' | 'day' | 'night';

interface TopBarHandlers {
  onModeChange: (m: LightMode) => void;
  onGoRoom: () => void;
}

export function initTopBar(h: TopBarHandlers): void {
  const seg = document.querySelector<HTMLElement>('#modeSeg')!;
  seg.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-mode]');
    if (b) h.onModeChange(b.dataset.mode as LightMode);
  });
  document.querySelector('#crumb')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-go="room"]');
    if (b) h.onGoRoom();
  });
  // the panel comes in a later task
  document.querySelector('#custBtn')!.addEventListener('click', () => toast('Özelleştir paneli yakında geliyor.'));
}

export function updateModeButtons(mode: LightMode): void {
  document.querySelectorAll<HTMLButtonElement>('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
}

// "Çalışma odası › Kitaplık"
export function updateCrumb(view: View): void {
  const crumb = document.querySelector<HTMLElement>('#crumb')!;
  crumb.replaceChildren();
  const room = document.createElement('button');
  room.textContent = 'Çalışma odası';
  if (view !== 'room') room.dataset.go = 'room'; else room.disabled = true;
  crumb.append(room);
  if (view !== 'room') {
    const sep = document.createElement('span'); sep.textContent = '›';
    const shelf = document.createElement('button'); shelf.textContent = 'Kitaplık'; shelf.disabled = true;
    crumb.append(sep, shelf);
  }
}
