let timer: number | undefined;

// Short message at the top of the screen; disappears after a few seconds.
export function toast(msg: string): void {
  const t = document.querySelector<HTMLElement>('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => t.classList.remove('show'), 3600);
}
