import { t, type Anahtar } from '../dil';
import type { View } from '../scene';

const HINTS: Record<View, Anahtar> = { room: 'ipucu.oda', shelf: 'ipucu.raf', desk: 'ipucu.masa' };

// Hidden while a book is open (the reader covers the screen).
export function updateHint(view: View, bookOpen: boolean): void {
  const h = document.querySelector<HTMLElement>('#hint');
  if (!h) return;
  h.textContent = t(HINTS[view]);
  h.hidden = bookOpen;
}
