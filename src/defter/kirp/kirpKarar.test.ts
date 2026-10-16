import { describe, expect, it } from 'vitest';
import { KIRP_MIN_GUVEN, KIRP_VARSAYILAN, MAX_KENAR } from '../ayarlar';
import type { Kose4 } from './kirpHesap';
import { ilkKarar, kipDegistir, kirpPenceresi, kirpYazi, koseleriBuyut } from './kirpKarar';

// Task 5.8c: crop or whole photo in the photo panel, pure part.

// slightly tilted page in a 4000×3000 photo
const SAYFA: Kose4 = [{ x: 900, y: 300 }, { x: 3100, y: 380 }, { x: 3200, y: 2800 }, { x: 800, y: 2700 }];

describe('settings', () => {
  it('crop by default, threshold 0–1', () => {
    expect(KIRP_VARSAYILAN).toBe(true);
    expect(KIRP_MIN_GUVEN).toBeGreaterThan(0);
    expect(KIRP_MIN_GUVEN).toBeLessThan(1);
  });
});

describe('ilkKarar', () => {
  it('no corners → whole photo, "kırpılamadı"', () => {
    expect(ilkKarar(null)).toEqual({ kip: 'tumu', koseler: null, guven: null, kirpilamadi: true });
  });

  it('low confidence → whole photo, "kırpılamadı", corners kept', () => {
    const r = ilkKarar({ koseler: SAYFA, guven: 0.3 }, true, 0.5);
    expect(r).toEqual({ kip: 'tumu', koseler: SAYFA, guven: 0.3, kirpilamadi: true });
  });

  it('good confidence → crop; exactly at the threshold counts as good', () => {
    expect(ilkKarar({ koseler: SAYFA, guven: 0.9 }, true, 0.5)).toMatchObject({ kip: 'kirp', kirpilamadi: false, guven: 0.9 });
    expect(ilkKarar({ koseler: SAYFA, guven: 0.5 }, true, 0.5).kip).toBe('kirp');
  });

  it('default off → whole photo, but not "kırpılamadı"', () => {
    expect(ilkKarar({ koseler: SAYFA, guven: 0.9 }, false, 0.5)).toMatchObject({ kip: 'tumu', kirpilamadi: false, koseler: SAYFA });
  });
});

describe('kipDegistir', () => {
  it('crop ⇄ whole', () => {
    expect(kipDegistir('kirp', SAYFA)).toBe('tumu');
    expect(kipDegistir('tumu', SAYFA)).toBe('kirp');
  });

  it('without corners the toggle does nothing', () => {
    expect(kipDegistir('tumu', null)).toBe('tumu');
  });
});

describe('kirpYazi', () => {
  it('log text', () => {
    expect(kirpYazi('kirp', false)).toBe('kırpıldı');
    expect(kirpYazi('kirp', true)).toBe('kırpıldı');
    expect(kirpYazi('tumu', false)).toBe('tümü');
    expect(kirpYazi('tumu', true)).toBe('tümü (kırpılamadı)');
    expect(kirpYazi('kirp', false, true)).toBe('kırpıldı (elle)');
    expect(kirpYazi('tumu', false, true)).toBe('tümü');
  });
});

describe('koseleriBuyut', () => {
  it('800×600 copy → 4000×3000 photo', () => {
    const k = koseleriBuyut([{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 400, y: 300 }], { width: 800, height: 600 }, { width: 4000, height: 3000 });
    expect(k).toEqual([{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 2000, y: 1500 }]);
  });

  it('x and y scale separately (rounded small size)', () => {
    const [p] = koseleriBuyut([{ x: 800, y: 451 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }], { width: 800, height: 451 }, { width: 4032, height: 2268 });
    expect(p.x).toBeCloseTo(4032);
    expect(p.y).toBeCloseTo(2268);
  });
});

describe('kirpPenceresi', () => {
  it('bounding box of the page, long edge about MAX_KENAR, corners moved into the window', () => {
    const p = kirpPenceresi(SAYFA, { width: 4000, height: 3000 });
    expect(p).toMatchObject({ sx: 800, sy: 300, sw: 2400, sh: 2500 });
    // the page is about 2400 px tall in the photo → scaled to about 2000
    const s = p.height / p.sh;
    expect(s).toBeGreaterThan(0.8);
    expect(s).toBeLessThan(0.87);
    expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(Math.ceil(2500 * s));
    for (const q of p.koseler) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(p.width);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(p.height);
    }
    expect(p.koseler[3].x).toBeCloseTo(0);
    expect(p.koseler[0].y).toBeCloseTo(0);
  });

  it('never outside the photo', () => {
    const k: Kose4 = [{ x: -20, y: -5 }, { x: 1030, y: 0 }, { x: 1010, y: 820 }, { x: 0, y: 790 }];
    const p = kirpPenceresi(k, { width: 1000, height: 800 });
    expect(p.sx).toBe(0);
    expect(p.sy).toBe(0);
    expect(p.sx + p.sw).toBeLessThanOrEqual(1000);
    expect(p.sy + p.sh).toBeLessThanOrEqual(800);
  });

  it('a small page is not enlarged', () => {
    const k: Kose4 = [{ x: 100, y: 100 }, { x: 700, y: 100 }, { x: 700, y: 900 }, { x: 100, y: 900 }];
    const p = kirpPenceresi(k, { width: 1000, height: 1000 }, MAX_KENAR);
    expect(p).toMatchObject({ sw: 600, sh: 800, width: 600, height: 800 });
  });

  it('canvas stays under the pixel limit', () => {
    // 48 MP photo, page almost all of it, big maxKenar so only the pixel limit decides
    const k: Kose4 = [{ x: 10, y: 10 }, { x: 7990, y: 10 }, { x: 7990, y: 5990 }, { x: 10, y: 5990 }];
    const p = kirpPenceresi(k, { width: 8000, height: 6000 }, 100_000, 16_000_000);
    expect(p.width * p.height).toBeLessThanOrEqual(16_000_000);
    expect(p.width * p.height).toBeGreaterThan(15_000_000);
  });
});
