import { describe, expect, it } from 'vitest';
import { KITAP_KAGIT_PAYI, ilkCift, sagdaMi, PAGE_AR, fitPage, isSingle, keepRange, slotSize, spreadStart, visiblePages, yenidenDuzenGerekir } from './kitapDuzen';

describe('isSingle', () => {
  it('is one page on a portrait screen', () => {
    expect(isSingle(820, 1180)).toBe(true);
    expect(isSingle(1180, 820)).toBe(false);
  });
});

describe('slotSize', () => {
  it('two pages share the width', () => {
    const s = slotSize(1200, 2000, false);
    expect(s.w).toBe(570);
    expect(s.h).toBe(Math.round(570 * PAGE_AR));
  });
  it('is limited by the height', () => {
    const s = slotSize(2000, 734, false);
    expect(s.w).toBe(Math.floor(700 / PAGE_AR));
  });
  it('one page uses the width minus margins', () => {
    expect(slotSize(400, 2000, true).w).toBe(360);
  });
});

describe('fitPage', () => {
  it('an A4 page fills the slot', () => {
    expect(fitPage(PAGE_AR, 100, 141)).toEqual({ x: 0, y: 0, w: 100, h: 141 });
  });
  it('a landscape slide is centred, not cut', () => {
    expect(fitPage(0.75, 100, 141)).toEqual({ x: 0, y: 33, w: 100, h: 75 });
  });
  it('a tall page is narrowed', () => {
    const f = fitPage(2, 100, 141);
    expect(f.h).toBe(141);
    expect(f.w).toBe(71);
    expect(f.x).toBe(15);
  });
  it('pay 0 is the same as no pay', () => {
    for (const r of [PAGE_AR, 0.75, 2]) expect(fitPage(r, 100, 141, 0)).toEqual(fitPage(r, 100, 141));
  });
  it('with KITAP_KAGIT_PAYI the content is inside the slot by the pay, centred, its shape kept', () => {
    for (const [sw, sh] of [[100, 141], [360, 509], [590, 834]]) {
      const p = Math.round(sw * KITAP_KAGIT_PAYI);
      for (const r of [PAGE_AR, 0.75, 2, 1400 / 595]) {
        const f = fitPage(r, sw, sh, KITAP_KAGIT_PAYI);
        const sol = f.x, sag = sw - f.x - f.w, ust = f.y, alt = sh - f.y - f.h;
        expect(Math.min(sol, sag, ust, alt)).toBeGreaterThanOrEqual(p);
        expect(Math.abs(sol - sag)).toBeLessThanOrEqual(1);
        expect(Math.abs(ust - alt)).toBeLessThanOrEqual(1);
        expect(Math.abs(f.h - f.w * r)).toBeLessThanOrEqual(1 * Math.max(1, r));
      }
    }
  });
  it('an A4 page with the pay: 4 px of 100 on each side', () => {
    expect(fitPage(PAGE_AR, 100, 141, KITAP_KAGIT_PAYI)).toEqual({ x: 4, y: 6, w: 92, h: 130 });
  });
});

describe('spreads', () => {
  it('left page is even with two pages', () => {
    expect(spreadStart(5, false)).toBe(4);
    expect(spreadStart(5, true)).toBe(5);
  });
  it('visible pages stay inside the book', () => {
    expect(visiblePages(4, false, 5)).toEqual([4]);
    expect(visiblePages(2, false, 5)).toEqual([2, 3]);
    expect(visiblePages(2, true, 5)).toEqual([2]);
  });
  it('keeps visible ±2', () => {
    expect(keepRange(4, false, 20)).toEqual([2, 7]);
    expect(keepRange(0, true, 20)).toEqual([0, 2]);
    expect(keepRange(18, false, 20)).toEqual([16, 19]);
    expect(keepRange(0, true, 0)).toEqual([0, -1]);
  });
});

describe('yenidenDuzenGerekir', () => {
  it('the same size or less than 1 px: no new layout', () => {
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1180, h: 700 })).toBe(false);
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1180.5, h: 699.5 })).toBe(false);
  });
  it('1 px in the width or the height: a new layout', () => {
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1181, h: 700 })).toBe(true);
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1180, h: 699 })).toBe(true);
  });
  it('the page slider shown: the area got shorter', () => {
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1180, h: 652 })).toBe(true);
  });
  it('not before the first layout, not while hidden', () => {
    expect(yenidenDuzenGerekir(null, { w: 1180, h: 700 })).toBe(false);
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 0, h: 0 })).toBe(false);
    expect(yenidenDuzenGerekir({ w: 1180, h: 700 }, { w: 1180, h: 0 })).toBe(false);
  });
});

describe('spreadStart ofset (6.S-4b)', () => {
  it('ofset 0: çift indeks solda; ofset 1: tek indeks solda, ilk çift −1', () => {
    expect([0, 1, 2, 3].map(i => spreadStart(i, false))).toEqual([0, 0, 2, 2]);
    expect([0, 1, 2, 3, 4].map(i => spreadStart(i, false, 1))).toEqual([-1, 1, 1, 3, 3]);
    expect(spreadStart(3, true, 1)).toBe(3);
    expect(ilkCift(0)).toBe(0);
    expect(ilkCift(1)).toBe(-1);
  });
  it('sağ / sol taraf', () => {
    expect([0, 1, 2].map(i => sagdaMi(i, 0))).toEqual([false, true, false]);
    expect([-1, 0, 1, 2].map(i => sagdaMi(i, 1))).toEqual([false, true, false, true]);
  });
});
