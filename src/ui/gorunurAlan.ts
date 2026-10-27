import { sayfaKaymasiniSifirla } from './klavyeKaydirma';

// Task 5.10g-ek / ek2: iPad Safari left the page moved up after typing in the file panel's name box
// (the reader under Safari's bar). #app / #reader stay position: fixed; inset: 0 (ek2: the page lock
// and the --gorunur-h fallback made it worse and were removed). What stays: when the keyboard closes
// (focusout, or the visible height back at the tallest seen), the page scroll goes back to 0,
// in the next frame and once more 300 ms later (iOS ends its own scrolling after the event).
// The file panel itself sits at the top on touch screens, so iOS shouldn't need to scroll at all.

// The iPad keyboard can be closed with its own key while the field keeps the focus;
// so "open" = a text field has the focus AND the visible height is clearly below the tallest seen
// (for this width). enBuyuk 0: not known yet → the focus alone.
export const KLAVYE_PAYI = 120;   // px; Safari's bars moving are less than this
export function klavyeAcikMi(g: { odakYazi: boolean; vvH: number | null; enBuyukH: number }): boolean {
  if (!g.odakYazi) return false;
  if (g.vvH == null || !g.enBuyukH) return true;
  return g.vvH < g.enBuyukH - KLAVYE_PAYI;
}

// The keyboard was open and the visible height is back (near) the tallest seen
export function klavyeKapandiMi(g: { oncekiAcik: boolean; vvH: number; enBuyukH: number }): boolean {
  return g.oncekiAcik && g.enBuyukH > 0 && g.vvH >= g.enBuyukH - KLAVYE_PAYI;
}

// A text field has the focus
export function yaziAlaniMi(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el?.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'file', 'range', 'color', 'submit', 'reset', 'image', 'hidden'].includes((el.type ?? 'text').toLowerCase());
}

export const IKINCI_DENEME_MS = 300;   // after the next frame

export interface AlanDurumu { sonOlay: string; duzeltme: number; sifirlama: number; klavyeAcik: boolean; enBuyukH: number }
export const alanDurumu: AlanDurumu = { sonOlay: '-', duzeltme: 0, sifirlama: 0, klavyeAcik: false, enBuyukH: 0 };

let enBuyukGenislik = 0;   // the tallest visible height is per width (portrait / landscape)

// the keyboard state from the visible height (and the tallest height seen for this width)
function klavyeDurumu(): boolean {
  const vv = window.visualViewport;
  const scale1 = !vv || Math.abs(vv.scale - 1) <= 0.01;
  if (innerWidth !== enBuyukGenislik) { enBuyukGenislik = innerWidth; alanDurumu.enBuyukH = 0; }
  if (vv && scale1) alanDurumu.enBuyukH = Math.max(alanDurumu.enBuyukH, vv.height);
  alanDurumu.klavyeAcik = klavyeAcikMi({ odakYazi: yaziAlaniMi(document.activeElement as HTMLElement | null), vvH: vv && scale1 ? vv.height : null, enBuyukH: alanDurumu.enBuyukH });
  return alanDurumu.klavyeAcik;
}

function duzelt(): void {
  alanDurumu.duzeltme++;
  if (klavyeDurumu()) return;
  // window, <html> and <body>: whichever iOS moved
  if (sayfaKaymasiniSifirla(window)) alanDurumu.sifirlama++;
  if (document.documentElement.scrollTop) { document.documentElement.scrollTop = 0; alanDurumu.sifirlama++; }
  if (document.body.scrollTop) { document.body.scrollTop = 0; alanDurumu.sifirlama++; }
}

let zaman: number | undefined;

// The page back to the top: in the next frame and once more a bit later
export function gorunurAlaniDuzelt(olay = 'elle'): void {
  alanDurumu.sonOlay = olay;
  clearTimeout(zaman);
  requestAnimationFrame(duzelt);
  zaman = window.setTimeout(duzelt, IKINCI_DENEME_MS);
}

let kuruldu = false;

export function installGorunurAlan(): void {
  if (kuruldu) return;
  kuruldu = true;
  const vv = window.visualViewport;
  vv?.addEventListener('resize', () => {
    const oncekiAcik = alanDurumu.klavyeAcik;
    klavyeDurumu();
    if (klavyeKapandiMi({ oncekiAcik, vvH: vv.height, enBuyukH: alanDurumu.enBuyukH })) gorunurAlaniDuzelt('klavye kapandı');   // dil-kontrol: yoksay
  });
  document.addEventListener('focusout', () => gorunurAlaniDuzelt('focusout'));
  addEventListener('pageshow', () => gorunurAlaniDuzelt('pageshow'));
  klavyeDurumu();
}
