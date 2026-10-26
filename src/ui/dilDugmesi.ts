import { dil, t, type Dil } from '../dil';

// Task 6.5-1: the language buttons — the top bar's short one (#dilBtn: the language it goes to, "TR" / "EN"),
// and the sign-in card's "English · Türkçe" ([data-dil]). One click listener for all. Measured (320–1280 px, en and tr):
// #dilBtn adds no row and no overflow to the top bar, so it stays there on every width (no Özelleştir row).
// While something is being saved they are off (title says why); the current language's button is always off.

export interface DilDugmeleri {
  sec(d: Dil): void;
  mesgul(): boolean;
}

let h: DilDugmeleri | null = null;

export const digerDil = (): Dil => dil() === 'tr' ? 'en' : 'tr';

export function dilDugmeleriKur(x: DilDugmeleri): void {
  h = x;
  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('#dilBtn, button[data-dil]');
    if (!b || b.disabled || !h) return;
    const d = b.id === 'dilBtn' ? digerDil() : b.dataset.dil as Dil;
    if (d === dil()) return;
    if (h.mesgul()) { dilDugmeleriGuncelle(); return; }
    h.sec(d);
  });
  dilDugmeleriGuncelle();
  // cheap (a few flags); the saving states have no single event to listen to
  setInterval(() => dilDugmeleriGuncelle(), 1500);
}

export function dilDugmeleriGuncelle(kok: ParentNode = document): void {
  const m = h?.mesgul() ?? false;
  const not = m ? t('dil.mesgul') : '';
  const ust = kok.querySelector<HTMLButtonElement>('#dilBtn');
  if (ust) { ust.disabled = m; ust.title = not; }
  kok.querySelectorAll<HTMLButtonElement>('button[data-dil]').forEach(b => {
    const bu = b.dataset.dil === dil();
    b.disabled = bu || m;
    b.title = bu ? '' : not;
    b.classList.toggle('on', bu);
    if (bu) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
  });
}

