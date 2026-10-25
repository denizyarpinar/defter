import { describe, expect, it } from 'vitest';
import { PAGE_AR, fitPage, isSingle, keepRange, slotSize, spreadStart, visiblePages, yenidenDuzenGerekir } from './kitapDuzen';

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
