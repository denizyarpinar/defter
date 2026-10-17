// Task 5.10g: iPad Safari moves the page up when the keyboard opens and does not always move it back
// when it closes (the reader's tabs stay under Safari's bar). The page itself never scrolls, so after
// the keyboard / a panel it is put back to 0. Pure parts, given the window, so they can be tested.

export interface KaydirmaPenceresi {
  scrollX: number;
  scrollY: number;
  scrollTo(x: number, y: number): void;
  document: { scrollingElement: { scrollTop: number; scrollLeft: number } | null };
}

// true: it was moved and is put back
export function sayfaKaymasiniSifirla(w: KaydirmaPenceresi): boolean {
  const se = w.document.scrollingElement;
  const kaymis = w.scrollX !== 0 || w.scrollY !== 0 || !!se?.scrollTop || !!se?.scrollLeft;
  if (!kaymis) return false;
  w.scrollTo(0, 0);
  if (se) { se.scrollTop = 0; se.scrollLeft = 0; }
  return true;
}

export interface GorunenAlan { offsetTop: number; height: number }

// Where a fixed panel should be while the keyboard is open: the visible part of the page
// (no visualViewport: null, the CSS inset: 0 stays)
export function panelAlani(vv: GorunenAlan | null | undefined): { top: number; height: number } | null {
  if (!vv || !(vv.height > 0)) return null;
  return { top: Math.max(0, vv.offsetTop), height: vv.height };
}

// For a fixed panel (.fp): follows the visual viewport while it is open; durdur() puts the page back.
export function panelKlavyeTakibi(kok: HTMLElement): { durdur(): void; sifirla(): void } {
  const vv = window.visualViewport;
  const uygula = () => {
    const a = panelAlani(vv);
    kok.style.top = a ? `${a.top}px` : '';
    kok.style.height = a ? `${a.height}px` : '';
    kok.style.bottom = a ? 'auto' : '';
  };
  vv?.addEventListener('resize', uygula);
  vv?.addEventListener('scroll', uygula);
  // after the keyboard closed (blur comes before Safari's own scrolling ends)
  const sifirla = () => requestAnimationFrame(() => { sayfaKaymasiniSifirla(window); uygula(); });
  return {
    sifirla,
    durdur() {
      vv?.removeEventListener('resize', uygula);
      vv?.removeEventListener('scroll', uygula);
      sayfaKaymasiniSifirla(window);
    },
  };
}
