// ?fps=1 (task 3.7): errors on screen, because the iPad has no console. The last 5, closable.
// Without ?fps=1 nothing is added, not even the listeners.

export const MAX_ERRORS = 5;

export function pushError(list: string[], msg: string, max = MAX_ERRORS): string[] {
  return [...list, msg].slice(-max);
}

// An error / rejection reason → one short line.
export function errorText(e: unknown): string {
  if (e instanceof Error) return `${e.name === 'Error' ? '' : e.name + ': '}${e.message}`.slice(0, 300);
  if (typeof e === 'string') return e.slice(0, 300);
  try { return JSON.stringify(e).slice(0, 300); } catch { return String(e); }
}

export function installErrorBox(): void {
  if (new URLSearchParams(location.search).get('fps') !== '1') return;
  let list: string[] = [];
  const box = document.createElement('div');
  box.id = 'hataKutusu';
  box.hidden = true;
  const ul = document.createElement('ol');
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Hataları kapat');
  close.addEventListener('click', () => { list = []; box.hidden = true; });
  box.append(close, ul);
  document.body.append(box);

  const add = (e: unknown, where?: string) => {
    const time = new Date().toTimeString().slice(0, 8);
    list = pushError(list, `${time} ${errorText(e)}${where ? ` (${where})` : ''}`);
    ul.replaceChildren(...list.map(t => { const li = document.createElement('li'); li.textContent = t; return li; }));
    box.hidden = false;
  };
  addEventListener('error', e => add(e.error ?? e.message, e.filename ? `${e.filename.split('/').pop()}:${e.lineno}` : undefined));
  addEventListener('unhandledrejection', e => add(e.reason));
}
