import { describe, expect, it } from 'vitest';
import { validateStroke, type Stroke } from './cizgi';

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
