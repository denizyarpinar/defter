import { describe, expect, it } from 'vitest';
import { dCoz, ornekD } from './atlasCoz';

describe('dCoz', () => {
  it('dogrusal: D = px / olcek (float32)', () => {
    const D = dCoz([0, 51, 255], 25.5, 'dogrusal');
    expect(Array.from(D)).toEqual([0, Math.fround(51 / Math.fround(25.5)), Math.fround(10)]);
  });
  it('karekok: D = (px/255)² · 255 / olcek', () => {
    const D = dCoz([0, 128, 255], 38.490566, 'karekok');
    expect(D[0]).toBe(0);
    expect(D[1]).toBeCloseTo((128 / 255) ** 2 * 255 / 38.490566, 5);
    expect(D[2]).toBeCloseTo(255 / 38.490566, 5);
  });
  it('RGBA görüntü verisinden (her 4. bayt)', () => {
    expect(Array.from(dCoz([10, 0, 0, 255, 20, 9, 9, 255], 10, 'dogrusal', 4))).toEqual([1, 2]);
  });
});

describe('ornekD', () => {
  it('örneğin kutusunu sayfadan keser', () => {
    const sayfa = { w: 4, h: 3, D: Float32Array.from({ length: 12 }, (_, i) => i) };
    const o = ornekD(sayfa, { x: 1, y: 1, w: 2, h: 2 });
    expect([o.w, o.h, ...o.D]).toEqual([2, 2, 5, 6, 9, 10]);
  });
});
