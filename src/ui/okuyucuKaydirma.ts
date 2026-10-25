import { dokunmaIptal } from './dokunmaIz';
import { gorunurAlaniDuzelt } from './gorunurAlan';
import { isPageZoomed, KONTROLLER } from './sayfaZoom';

// Task 6.K5b-4: iPad Safari moved the whole page (79 px, a beige strip at the bottom) when a finger was dragged over
// a part of the reader that doesn't scroll: the scrim beside the contents panel, the bars, the message of the reader
// without a topic. The page there is taller than what is on screen (html.clientHeight 1048, innerHeight 969) and iOS
// moves it in spite of html/body's touch-action: none and overflow: hidden. While the reader is open, a finger move
// is cancelled unless something under it can scroll (the pages, the contents list, the tab row) or it is a form
// field (the name box, the page slider). The file / photo / trash panels are on <body>, outside the reader.
// Task 6.S-1b: a pen tap on a button sends 2–5 tiny moves; cancelling them, Safari made no click. A touch that began
// on a control (KONTROLLER) is not cancelled while it stays within DOKUNMA_PAYI_PX; past that, the rule above.

export interface OgeBilgisi {
  tagName: string;
  overflowX: string;
  overflowY: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

const FORM = ['INPUT', 'SELECT', 'TEXTAREA'];
const kayar = (o: string) => o === 'auto' || o === 'scroll';

// zincir: the element under the finger first, up to (not with) the reader
export function kaymaSerbestMi(zincir: OgeBilgisi[]): boolean {
  return zincir.some(o => FORM.includes(o.tagName.toUpperCase())
    || (kayar(o.overflowY) && o.scrollHeight > o.clientHeight + 1)
    || (kayar(o.overflowX) && o.scrollWidth > o.clientWidth + 1));
}

export const DOKUNMA_PAYI_PX = 10;

// serbest: kaymaSerbestMi; kontrolde: the touch began on a control; dx, dy: from where it began;
// payAsildi: it already went past the margin once (it doesn't become a tap again)
export function kaymaIptalMi(g: { serbest: boolean; kontrolde: boolean; dx: number; dy: number; payAsildi?: boolean }): boolean {
  if (g.serbest) return false;
  if (g.kontrolde && !g.payAsildi && Math.hypot(g.dx, g.dy) < DOKUNMA_PAYI_PX) return false;
  return true;
}

function zincir(hedef: EventTarget | null, kok: HTMLElement): OgeBilgisi[] {
  const out: OgeBilgisi[] = [];
  for (let el = hedef instanceof Element ? hedef : null; el && el !== kok; el = el.parentElement) {
    const s = getComputedStyle(el);
    out.push({ tagName: el.tagName, overflowX: s.overflowX, overflowY: s.overflowY, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
  }
  return out;
}

const sayfaKaymis = () => window.scrollY !== 0 || document.documentElement.scrollTop !== 0 || document.body.scrollTop !== 0;

// The reader is hidden when closed, so the listeners get nothing then (the library and the room as before).
export function installOkuyucuKaydirma(kok: HTMLElement): void {
  let bas = { x: 0, y: 0, kontrolde: false, payAsildi: true };
  kok.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (e.touches.length !== 1 || !t) { bas.payAsildi = true; return; }   // a second finger: no tap margin
    bas = { x: t.clientX, y: t.clientY, kontrolde: !!(e.target as Element | null)?.closest?.(KONTROLLER), payAsildi: false };
  }, { passive: true });
  kok.addEventListener('touchmove', e => {
    if (!e.cancelable || isPageZoomed(window.visualViewport?.scale)) return;   // zoomed: the fingers zoom back out
    const t = e.touches[0];
    const g = { serbest: kaymaSerbestMi(zincir(e.target, kok)), kontrolde: bas.kontrolde, dx: t ? t.clientX - bas.x : Infinity, dy: t ? t.clientY - bas.y : 0, payAsildi: bas.payAsildi || e.touches.length !== 1 };
    if (!kaymaIptalMi(g)) return;
    if (!g.serbest) bas.payAsildi = true;
    dokunmaIptal('okuyucuKaydirma', e); e.preventDefault();
  }, { passive: false });
  const bitti = () => { if (sayfaKaymis()) gorunurAlaniDuzelt('okuyucu dokunma'); };
  kok.addEventListener('touchend', bitti, { passive: true });
  kok.addEventListener('touchcancel', bitti, { passive: true });
}
