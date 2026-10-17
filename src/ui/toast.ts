let timer: number | undefined;

// Task 5.8g: a toast may have one button ("Göster"); it then stays a bit longer and can be tapped.
export interface ToastEylem { etiket: string; calistir: () => void }

const SURE_MS = 3600;
const EYLEMLI_SURE_MS = 8000;

// Short message at the top of the screen; disappears after a few seconds.
export function toast(msg: string, eylem?: ToastEylem): void {
  const t = document.querySelector<HTMLElement>('#toast');
  if (!t) return;
  const gizle = () => t.classList.remove('show');
  if (eylem) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = eylem.etiket;
    b.onclick = () => { clearTimeout(timer); gizle(); eylem.calistir(); };
    t.replaceChildren(document.createTextNode(msg), b);
  } else t.textContent = msg;
  t.classList.toggle('eylemli', !!eylem);
  t.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(gizle, eylem ? EYLEMLI_SURE_MS : SURE_MS);
}
