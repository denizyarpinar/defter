// TEMPORARY (Faz 2.4, dev only): flips the room between day and evening to test the lightmap blend.
// Doesn't change the mode buttons and saves nothing to Drive.
export function initDevToggle(isNight: () => boolean, setNight: (night: boolean) => void): void {
  if (!import.meta.env.DEV) return;
  const b = document.createElement('button');
  b.className = 'devToggle';
  b.textContent = 'test: akşam ↔ gündüz';
  b.addEventListener('click', () => setNight(!isNight()));
  document.querySelector('#app')!.appendChild(b);
}
