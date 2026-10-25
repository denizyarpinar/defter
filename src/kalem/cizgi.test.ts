import { describe, expect, it } from 'vitest';
import { inView, roundPressure, strokeBounds, strokeView, validateStroke, type Stroke } from './cizgi';
import { penOutline } from './cizgiSekli';

// Task 4.4: the pen is always opaque, the highlighter never is (the reader tells them apart by opacity)

const s = (over: Partial<Stroke>): Stroke => ({ id: 'a', arac: 'kalem', renk: '#000000', kalinlik: 2, opaklik: 1, noktalar: [0, 0, 1, 1], ...over });

describe('validateStroke: opacity per tool', () => {
  it('opaque pen and see-through highlighter are fine', () => {
    expect(() => validateStroke(s({}))).not.toThrow();
    expect(() => validateStroke(s({ arac: 'fosforlu', opaklik: 0.4 }))).not.toThrow();
  });

  it('a see-through pen is an error', () => {
    expect(() => validateStroke(s({ opaklik: 0.8 }))).toThrow(/kalem opaklığı/);
  });

  it('an opaque highlighter is an error', () => {
    expect(() => validateStroke(s({ arac: 'fosforlu', opaklik: 1 }))).toThrow(/fosforlu opaklığı/);
  });
});

// Task 4.7c: the Apple Pencil's pressure
describe('validateStroke: pressure', () => {
  it('none, or one 0–1 value per point on a pen stroke', () => {
    expect(() => validateStroke(s({}))).not.toThrow();
    expect(() => validateStroke(s({ basinc: [0, 1] }))).not.toThrow();
  });

  it('a count that is not the point count, a value outside 0–1, or pressure on a highlighter is an error', () => {
    expect(() => validateStroke(s({ basinc: [0.5] }))).toThrow(/basınç sayısı/);
    expect(() => validateStroke(s({ basinc: [0.5, -0.1] }))).toThrow(/0–1/);
    expect(() => validateStroke(s({ basinc: [0.5, NaN] }))).toThrow(/0–1/);
    expect(() => validateStroke(s({ arac: 'fosforlu', opaklik: 0.4, basinc: [0.5, 0.5] }))).toThrow(/fosforluda/);
  });

  it('roundPressure: 2 decimals, inside 0–1', () => {
    expect(roundPressure(0.123456)).toBe(0.12);
    expect(roundPressure(1.3)).toBe(1);
    expect(roundPressure(-0.2)).toBe(0);
  });
});

describe('strokeBounds', () => {
  it('a pen stroke at full pressure still fits (1.5 × the width)', () => {
    const noktalar: number[] = [];
    for (let i = 0; i <= 100; i++) noktalar.push(100 + i, 200 + 30 * Math.sin(i / 8));
    const pen = s({ kalinlik: 6, noktalar, basinc: Array.from({ length: 101 }, (_, i) => i % 2 ? 1 : 0.97) });
    const [x0, y0, x1, y1] = strokeBounds(pen);
    const c = penOutline(pen);
    const pts = [c.start[0], c.start[1], ...c.segs];
    for (let i = 0; i < pts.length; i += 2) {
      expect(pts[i]).toBeGreaterThanOrEqual(x0);
      expect(pts[i]).toBeLessThanOrEqual(x1);
      expect(pts[i + 1]).toBeGreaterThanOrEqual(y0);
      expect(pts[i + 1]).toBeLessThanOrEqual(y1);
    }
  });

  it('highlighter: half its width plus 1', () => {
    expect(strokeBounds(s({ arac: 'fosforlu', opaklik: 0.4, kalinlik: 10, noktalar: [0, 0, 10, 0] }))).toEqual([-6, -6, 16, 6]);
  });
});

describe('6.4e-4: inView / strokeView', () => {
  const s0: Stroke = { id: 'a', arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar: [1, 2, 3, 4] };

  it('a new stroke takes the view its page shows; the original one stays as it is (no key)', () => {
    expect(inView(s0, 'temiz')).toEqual({ ...s0, gorunum: 'temiz' });
    expect(inView(s0, 'orijinal')).toBe(s0);
    const back = inView({ ...s0, gorunum: 'temiz' }, 'orijinal');
    expect('gorunum' in back).toBe(false);
    expect(strokeView(s0)).toBe('orijinal');
    expect(strokeView(inView(s0, 'temiz'))).toBe('temiz');
  });

  it('validateStroke: only temiz (or none)', () => {
    expect(() => validateStroke({ ...s0, gorunum: 'temiz' })).not.toThrow();
    expect(() => validateStroke({ ...s0, gorunum: 'orijinal' as 'temiz' })).toThrow(/görünüm/);
  });
});
