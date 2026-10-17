import { describe, expect, it, vi } from 'vitest';
import { panelAlani, sayfaKaymasiniSifirla, type KaydirmaPenceresi } from './klavyeKaydirma';

// Task 5.10g: putting the page back after the iPad keyboard.

function pencere(scrollY: number, seTop = scrollY) {
  return { scrollX: 0, scrollY, scrollTo: vi.fn<(x: number, y: number) => void>(), document: { scrollingElement: { scrollTop: seTop, scrollLeft: 0 } as { scrollTop: number; scrollLeft: number } | null } } satisfies KaydirmaPenceresi;
}

describe('sayfaKaymasiniSifirla', () => {
  it('moved page: back to 0', () => {
    const w = pencere(212);
    expect(sayfaKaymasiniSifirla(w)).toBe(true);
    expect(w.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(w.document.scrollingElement!.scrollTop).toBe(0);
  });
  it('only the scrolling element moved (iOS): also back', () => {
    const w = pencere(0, 90);
    expect(sayfaKaymasiniSifirla(w)).toBe(true);
    expect(w.document.scrollingElement!.scrollTop).toBe(0);
  });
  it('not moved: nothing is done', () => {
    const w = pencere(0);
    expect(sayfaKaymasiniSifirla(w)).toBe(false);
    expect(w.scrollTo).not.toHaveBeenCalled();
  });
  it('no scrolling element: still scrollTo', () => {
    const w = { ...pencere(40), document: { scrollingElement: null } };
    expect(sayfaKaymasiniSifirla(w)).toBe(true);
    expect(w.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('panelAlani', () => {
  it('the visible part while the keyboard is open', () => {
    expect(panelAlani({ offsetTop: 120, height: 610 })).toEqual({ top: 120, height: 610 });
  });
  it('no visualViewport or no height: null (CSS stays)', () => {
    expect(panelAlani(null)).toBeNull();
    expect(panelAlani(undefined)).toBeNull();
    expect(panelAlani({ offsetTop: 0, height: 0 })).toBeNull();
  });
  it('a negative offset (rubber band) is not used', () => {
    expect(panelAlani({ offsetTop: -8, height: 700 })).toEqual({ top: 0, height: 700 });
  });
});
