import { sayfaKaymasiniSifirla } from './klavyeKaydirma';

// Task 5.10g-ek: iPad Safari sometimes leaves the page moved up after the keyboard or the photo picker
// (the reader ~60 px under Safari's bar, an empty beige strip at the bottom). #app / #reader are
// position: fixed; inset: 0, so they follow Safari's layout viewport, which may stay stale.
// Here, whenever the keyboard is closed: the page scroll goes back to 0 and the visible part
// (visualViewport) is written to --gorunur-ust / --gorunur-h, which the fixed roots use.
// Runs several times after each event (iOS ends its own animation later than the event).

export interface AlanGirdi {
  vv: { offsetTop: number; height: number; scale: number } | null;
  innerHeight: number;
  klavyeAcik: boolean;
}

// null: keyboard open, keep what is there (the panels follow the keyboard themselves)
export function alanHesapla(g: AlanGirdi): { ust: number; yukseklik: number } | null {
  if (g.klavyeAcik) return null;
  // no visualViewport, or a page zoom (sayfaZoom.ts): the layout height
  if (!g.vv || !(g.vv.height > 0) || Math.abs(g.vv.scale - 1) > 0.01) return { ust: 0, yukseklik: Math.round(g.innerHeight) };
  return { ust: Math.max(0, Math.round(g.vv.offsetTop)), yukseklik: Math.round(g.vv.height) };
}

// Task 5.10g-ek: the iPad keyboard can be closed with its own key while the field keeps the focus;
// so "open" = a text field has the focus AND the visible height is clearly below the tallest seen
// (for this width). enBuyuk 0: not known yet → the focus alone.
export const KLAVYE_PAYI = 120;   // px; Safari's bars moving are less than this
export function klavyeAcikMi(g: { odakYazi: boolean; vvH: number | null; enBuyukH: number }): boolean {
  if (!g.odakYazi) return false;
  if (g.vvH == null || !g.enBuyukH) return true;
  return g.vvH < g.enBuyukH - KLAVYE_PAYI;
}

// A text field has the focus: the iOS keyboard is (or is about to be) open
export function yaziAlaniMi(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'file', 'range', 'color', 'submit', 'reset', 'image', 'hidden'].includes((el.type ?? 'text').toLowerCase());
}

// ms after an event (besides the next frame): iOS ends its own scrolling later than the event
export const DUZELTME_ARALARI = [120, 300, 800];

export interface AlanDurumu {
  sonOlay: string; duzeltme: number; sifirlama: number; ust: number | null; yukseklik: number | null;
  klavyeAcik: boolean; enBuyukH: number; kilit: boolean;
}
export const alanDurumu: AlanDurumu = { sonOlay: '-', duzeltme: 0, sifirlama: 0, ust: null, yukseklik: null, klavyeAcik: false, enBuyukH: 0, kilit: false };

let enBuyukGenislik = 0;   // the tallest visible height is per width (portrait / landscape)

function duzelt(): void {
  const vv = window.visualViewport;
  const scale1 = !vv || Math.abs(vv.scale - 1) <= 0.01;
  if (innerWidth !== enBuyukGenislik) { enBuyukGenislik = innerWidth; alanDurumu.enBuyukH = 0; }
  if (vv && scale1) alanDurumu.enBuyukH = Math.max(alanDurumu.enBuyukH, vv.height);
  const klavyeAcik = klavyeAcikMi({ odakYazi: yaziAlaniMi(document.activeElement as HTMLElement | null), vvH: vv && scale1 ? vv.height : null, enBuyukH: alanDurumu.enBuyukH });
  alanDurumu.klavyeAcik = klavyeAcik;
  alanDurumu.duzeltme++;
  if (!klavyeAcik) {
    // window, <html> and <body>: whichever iOS moved
    if (sayfaKaymasiniSifirla(window)) alanDurumu.sifirlama++;
    if (document.documentElement.scrollTop) { document.documentElement.scrollTop = 0; alanDurumu.sifirlama++; }
    if (document.body.scrollTop) { document.body.scrollTop = 0; alanDurumu.sifirlama++; }
  }
  const a = alanHesapla({ vv: vv ? { offsetTop: vv.offsetTop, height: vv.height, scale: vv.scale } : null, innerHeight, klavyeAcik });
  if (!a) return;
  const s = document.documentElement.style;
  s.setProperty('--gorunur-ust', `${a.ust}px`);
  s.setProperty('--gorunur-h', `${a.yukseklik}px`);
  alanDurumu.ust = a.ust;
  alanDurumu.yukseklik = a.yukseklik;
}

let zamanlar: number[] = [];

// Fix now and a few times more (the old batch is dropped)
export function gorunurAlaniDuzelt(olay = 'elle'): void {
  alanDurumu.sonOlay = olay;
  for (const z of zamanlar) clearTimeout(z);
  zamanlar = DUZELTME_ARALARI.map(ms => window.setTimeout(duzelt, ms));
  requestAnimationFrame(duzelt);
}

// Task 5.10g-ek: while a panel is open the page behind it can't move (html/body overflow hidden,
// body fixed at the saved scroll); the returned function puts it back and fixes the page once more.
let kilitSayisi = 0;
let kayitliY = 0;
export function arkaSayfayiKilitle(): () => void {
  if (kilitSayisi++ === 0) {
    kayitliY = scrollY;
    const h = document.documentElement.style, b = document.body.style;
    h.overflow = 'hidden';
    b.overflow = 'hidden';
    b.position = 'fixed';
    b.top = `${-kayitliY}px`;
    b.left = '0';
    b.right = '0';
    alanDurumu.kilit = true;
  }
  let acik = false;
  return () => {
    if (acik) return;
    acik = true;
    if (--kilitSayisi > 0) return;
    const h = document.documentElement.style, b = document.body.style;
    h.overflow = '';
    for (const k of ['overflow', 'position', 'top', 'left', 'right'] as const) b[k] = '';
    alanDurumu.kilit = false;
    scrollTo(0, 0);   // the app never scrolls: back to the top, not to kayitliY
    gorunurAlaniDuzelt('kilit açıldı');
  };
}

let kuruldu = false;

export function installGorunurAlan(): void {
  if (kuruldu) return;
  kuruldu = true;
  const vv = window.visualViewport;
  vv?.addEventListener('resize', () => {
    // the keyboard went away: the height is back at the tallest seen
    const geri = alanDurumu.klavyeAcik && vv.height >= alanDurumu.enBuyukH - KLAVYE_PAYI;
    gorunurAlaniDuzelt(geri ? 'klavye kapandı' : 'vv resize');
  });
  vv?.addEventListener('scroll', () => gorunurAlaniDuzelt('vv scroll'));
  addEventListener('resize', () => gorunurAlaniDuzelt('resize'));
  addEventListener('orientationchange', () => gorunurAlaniDuzelt('orientationchange'));
  addEventListener('pageshow', () => gorunurAlaniDuzelt('pageshow'));
  document.addEventListener('focusout', () => gorunurAlaniDuzelt('focusout'));
  document.addEventListener('focusin', () => gorunurAlaniDuzelt('focusin'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) gorunurAlaniDuzelt('visible'); });
  // the photo / file picker closed (a file was chosen; on cancel iOS gives "cancel")
  document.addEventListener('change', e => { if ((e.target as HTMLInputElement | null)?.type === 'file') gorunurAlaniDuzelt('dosya seçildi'); }, true);
  document.addEventListener('cancel', e => { if ((e.target as HTMLInputElement | null)?.type === 'file') gorunurAlaniDuzelt('seçici kapandı'); }, true);
  duzelt();
}
