let timer: number | undefined;

// Task 5.8g: a toast may have one button ("Göster"); it then stays a bit longer and can be tapped.
export interface ToastEylem { etiket: string; calistir: () => void }

const SURE_MS = 3600;
const EYLEMLI_SURE_MS = 8000;

// Task 6.K5b: a protected toast ("Çöpe atıldı · Geri al") is not replaced: toasts coming while it shows wait and
// follow it (the newest few). toastUzat keeps it at least that long from now (e.g. after the library is loaded again).
let korunan = false;
let bitis = 0;
const sira: { msg: string; eylem?: ToastEylem; sureMs?: number }[] = [];
const SIRA_EN_COK = 3;

function gizle(): void {
  const t = document.querySelector<HTMLElement>('#toast');
  t?.classList.remove('show');
  clearTimeout(timer);
  const k = korunan;
  korunan = false;
  if (k && sira.length) { const s = sira.shift()!; toast(s.msg, s.eylem, s.sureMs); }
}

// Short message at the top of the screen; disappears after a few seconds (sureMs: another time, task 6.H1).
export function toast(msg: string, eylem?: ToastEylem, sureMs?: number, korumali = false): void {
  const t = document.querySelector<HTMLElement>('#toast');
  if (!t) return;
  if (korunan && !korumali) {
    sira.push({ msg, eylem, sureMs });
    if (sira.length > SIRA_EN_COK) sira.shift();
    return;
  }
  if (eylem) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = eylem.etiket;
    b.onclick = () => { gizle(); eylem.calistir(); };
    t.replaceChildren(document.createTextNode(msg), b);
  } else t.textContent = msg;
  t.classList.toggle('eylemli', !!eylem);
  t.classList.add('show');
  clearTimeout(timer);
  korunan = korumali;
  const sure = sureMs ?? (eylem ? EYLEMLI_SURE_MS : SURE_MS);
  bitis = Date.now() + sure;
  timer = window.setTimeout(gizle, sure);
}

// The protected toast on screen stays at least `ms` more (nothing changes when none is showing)
export function toastUzat(ms: number): void {
  if (!korunan) return;
  const kalan = bitis - Date.now();
  if (kalan >= ms) return;
  clearTimeout(timer);
  bitis = Date.now() + ms;
  timer = window.setTimeout(gizle, ms);
}
