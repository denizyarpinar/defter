import type { View } from '../scene';

const HINTS: Record<View, string> = {
  room: 'Kitaplığa dokun, yakından bak',
  shelf: 'Kitaba dokun: aç · Sürükle: başka rafa taşı · Boşluğa dokun: odaya dön',
  desk: 'Kitap masaya geliyor…'
};

// Hidden while a book is open (the reader covers the screen).
export function updateHint(view: View, bookOpen: boolean): void {
  const h = document.querySelector<HTMLElement>('#hint');
  if (!h) return;
  h.textContent = HINTS[view];
  h.hidden = bookOpen;
}
