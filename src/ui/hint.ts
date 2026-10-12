import type { View } from '../scene';

const HINTS: Record<View, string> = {
  room: 'Kitaplığa dokun, yakından bak',
  // prototype also says "Kitaba dokun: aç · Sürükle: başka rafa taşı" — added back once books exist
  shelf: 'Boşluğa dokun: odaya dön',
  desk: 'Kitap masaya geliyor…'
};

export function updateHint(view: View): void {
  const h = document.querySelector<HTMLElement>('#hint');
  if (h) h.textContent = HINTS[view];
}
