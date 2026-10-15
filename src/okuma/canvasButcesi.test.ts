import { describe, expect, it } from 'vitest';
import { CanvasBudget, DESKTOP_LIMITS, MIN_SHARE, TOUCH_LIMITS, allowance, deviceLimits, shareBudget, toFree, type CanvasEntry } from './canvasButcesi';
import { canvasSize } from './sanalListe';
import { detailRect } from './yakinlastirma';

const MP = 1_000_000;
const e = (page: number, kind: CanvasEntry['kind'], mp: number, visible: boolean): CanvasEntry => ({ page, kind, px: mp * MP, visible });

describe('deviceLimits', () => {
  it('touch devices (iPad says it is a Mac, but has touch points) get the lower limits', () => {
    expect(deviceLimits(5)).toEqual({ perCanvas: 8 * MP, total: 24 * MP });
    expect(deviceLimits(0)).toEqual({ perCanvas: 16 * MP, total: Infinity });
    expect(deviceLimits(1)).toBe(DESKTOP_LIMITS);   // a pen / single touch point isn't a touch screen
  });
});

describe('toFree', () => {
  const entries: [string, CanvasEntry][] = [
    ['ana3', e(3, 'ana', 4, true)],
    ['ana4', e(4, 'ana', 4, true)],
    ['ana1', e(1, 'ana', 4, false)],
    ['ana5', e(5, 'ana', 4, false)],
    ['ana6', e(6, 'ana', 4, false)],
    ['detay6', e(6, 'detay', 3, false)],
  ];

  it('frees off-screen canvases only, zoom details first, then the farthest page', () => {
    expect(toFree(entries, 3 * MP, 3)).toEqual(['detay6']);
    expect(toFree(entries, 6 * MP, 3)).toEqual(['detay6', 'ana6']);
    expect(toFree(entries, 9 * MP, 3)).toEqual(['detay6', 'ana6', 'ana1']);   // 1 and 5 are both 2 away: order kept
  });

  it('never frees a visible page, even if that is not enough', () => {
    const out = toFree(entries, 100 * MP, 3);
    expect(out).not.toContain('ana3');
    expect(out).not.toContain('ana4');
    expect(out).toHaveLength(4);
  });

  it('nothing needed → nothing freed', () => {
    expect(toFree(entries, 0, 3)).toEqual([]);
  });
});

describe('allowance / shareBudget', () => {
  it('a new canvas gets at most one canvas worth, and never more than what is left', () => {
    expect(allowance(0, TOUCH_LIMITS)).toBe(8 * MP);
    expect(allowance(20 * MP, TOUCH_LIMITS)).toBe(4 * MP);
    expect(allowance(30 * MP, TOUCH_LIMITS)).toBe(0);
    expect(allowance(500 * MP, DESKTOP_LIMITS)).toBe(16 * MP);
  });

  it('two zoomed pages share what is left in proportion', () => {
    expect(shareBudget(10 * MP, [4 * MP, 4 * MP])).toEqual([4 * MP, 4 * MP]);     // fits: unchanged
    expect(shareBudget(10 * MP, [8 * MP, 8 * MP])).toEqual([5 * MP, 5 * MP]);
    expect(shareBudget(9 * MP, [8 * MP, 4 * MP])).toEqual([6 * MP, 3 * MP]);
    expect(shareBudget(-1, [8 * MP])).toEqual([0]);
    expect(shareBudget(Infinity, [8 * MP, 8 * MP])).toEqual([8 * MP, 8 * MP]);  // desktop
  });
});

describe('CanvasBudget', () => {
  // a budget whose free() callbacks behave like the reader's (they delete their entry)
  function setup(limits = TOUCH_LIMITS) {
    const freed: string[] = [];
    const b = new CanvasBudget(limits);
    const add = (key: string, entry: CanvasEntry) => b.set(key, entry, () => { freed.push(key); b.delete(key); });
    return { b, add, freed };
  }

  it('a visible page makes room by freeing off-screen ones; the total stays ≤ 24 MP', () => {
    const { b, add, freed } = setup();
    add('ana2', e(2, 'ana', 8, false));
    add('ana3', e(3, 'ana', 8, true));
    add('ana5', e(5, 'ana', 8, false));
    const cap = b.reserve(8 * MP, true, 4);
    expect(freed).toEqual(['ana2']);   // 2 and 5 are both off screen; 2 is farther from page 4
    expect(cap).toBe(8 * MP);
    expect(b.used + cap).toBeLessThanOrEqual(TOUCH_LIMITS.total);
  });

  it('an off-screen page gets no canvas when too little is left, and frees nothing', () => {
    const { b, add, freed } = setup();
    add('ana3', e(3, 'ana', 8, true));
    add('ana4', e(4, 'ana', 8, true));
    add('ana5', e(5, 'ana', 7, false));
    expect(b.reserve(8 * MP, false, 3)).toBe(0);   // 1 MP left < 25 % of 8
    expect(freed).toEqual([]);
    expect(b.reserve(3 * MP, false, 3)).toBe(1 * MP >= 3 * MP * MIN_SHARE ? 1 * MP : 0);
  });

  it('only visible pages left: the new canvas gets a lower resolution, never more than the rest', () => {
    const { b, add } = setup();
    add('ana3', e(3, 'ana', 8, true));
    add('ana4', e(4, 'ana', 8, true));
    add('detay3', e(3, 'detay', 6, true));
    expect(b.reserve(8 * MP, true, 3)).toBe(2 * MP);
  });

  it('keeps count and total for the ?fps=1 box', () => {
    const seen: [number, number][] = [];
    const b = new CanvasBudget(TOUCH_LIMITS, (n, px) => seen.push([n, px]));
    b.set('a', e(1, 'ana', 2, true), () => {});
    b.set('b', e(2, 'detay', 3, true), () => {});
    b.delete('a');
    expect(seen).toEqual([[1, 2 * MP], [2, 5 * MP], [1, 3 * MP]]);
    expect(b.usedBy('detay')).toBe(3 * MP);
  });
});

describe('two pages zoomed on an iPad stay inside the budget', () => {
  it('book mode, 4×: pages + sharp parts ≤ 24 MP and each canvas ≤ 8 MP', () => {
    const L = TOUCH_LIMITS;
    // iPad landscape: two A4 pages of 470 × 665 css px at devicePixelRatio 2
    const page = canvasSize(470, 665, 2, L.perCanvas);
    const pagesPx = 2 * page.w * page.h;
    // zoomed 4×: each page is 1880 × 2660 on screen, about half of each is visible
    const vis = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const want = detailRect(vis, 1880, 2660, 2, L.perCanvas);
    const caps = shareBudget(L.total - pagesPx, [want.pw * want.ph, want.pw * want.ph]);
    const parts = caps.map(c => detailRect(vis, 1880, 2660, 2, Math.min(c, L.perCanvas)));
    for (const p of parts) expect(p.pw * p.ph).toBeLessThanOrEqual(L.perCanvas);
    expect(pagesPx + parts.reduce((s, p) => s + p.pw * p.ph, 0)).toBeLessThanOrEqual(L.total);
  });

  it('on a desktop nothing changes: 16 MP per canvas, no total', () => {
    expect(canvasSize(470, 665, 2, DESKTOP_LIMITS.perCanvas)).toEqual(canvasSize(470, 665, 2));
    const vis = { x: 0, y: 0, w: 1, h: 1 };
    expect(detailRect(vis, 1880, 2660, 2, DESKTOP_LIMITS.perCanvas)).toEqual(detailRect(vis, 1880, 2660, 2));
  });

  it('a smaller allowance lowers the resolution (a bit blurry), the part shown stays the same', () => {
    const vis = { x: 0.1, y: 0.1, w: 0.3, h: 0.3 };
    const full = detailRect(vis, 1880, 2660, 2, 8 * MP);
    const half = detailRect(vis, 1880, 2660, 2, 2 * MP);
    expect(half.pw * half.ph).toBeLessThanOrEqual(2 * MP);
    expect(half.pw).toBeLessThan(full.pw);
  });
});

describe('makeRoom', () => {
  it('frees only as much as needed, and nothing on a desktop (no total)', () => {
    const freed: string[] = [];
    const mk = (limits: typeof TOUCH_LIMITS) => {
      const b = new CanvasBudget(limits);
      for (const [k, v] of [['ana1', e(1, 'ana', 6, false)], ['ana2', e(2, 'ana', 6, false)], ['ana3', e(3, 'ana', 6, true)]] as const) {
        b.set(k, v, () => { freed.push(k); b.delete(k); });
      }
      return b;
    };
    mk(DESKTOP_LIMITS).makeRoom(Infinity, 3);
    mk(DESKTOP_LIMITS).makeRoom(50 * MP, 3);
    expect(freed).toEqual([]);
    mk(TOUCH_LIMITS).makeRoom(8 * MP, 3);   // 18 + 8 = 26 > 24: one page is enough
    expect(freed).toEqual(['ana1']);
  });
});
