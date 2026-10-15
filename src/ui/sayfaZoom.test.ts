import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP_MS, barTransform, blockTouch, isPageZoomed } from './sayfaZoom';

describe('blockTouch', () => {
  it('two or more fingers moving are cancelled (no browser pinch zoom)', () => {
    expect(blockTouch('move', 2, 1, Infinity, false)).toBe(true);
    expect(blockTouch('move', 3, 1, Infinity, false)).toBe(true);
  });

  it('one finger moving is left alone (scrolling, dragging, swipes)', () => {
    expect(blockTouch('move', 1, 1, Infinity, false)).toBe(false);
  });

  it('the second tap of a double tap on a surface is cancelled', () => {
    expect(blockTouch('end', 1, 1, 120, false)).toBe(true);
    expect(blockTouch('end', 1, 1, DOUBLE_TAP_MS + 1, false)).toBe(false);
    expect(blockTouch('end', 1, 1, Infinity, false)).toBe(false);
  });

  it('a fast second tap on a button still clicks', () => {
    expect(blockTouch('end', 1, 1, 120, true)).toBe(false);
  });

  it('when the page is already zoomed, nothing is cancelled: fingers can zoom back out', () => {
    expect(blockTouch('move', 2, 1.6, Infinity, false)).toBe(false);
    expect(blockTouch('end', 1, 1.6, 120, false)).toBe(false);
  });

  it('no visualViewport (old browser) counts as not zoomed', () => {
    expect(blockTouch('move', 2, undefined, Infinity, false)).toBe(true);
  });
});

describe('isPageZoomed', () => {
  it('only a real zoom counts, not rounding', () => {
    expect(isPageZoomed(1)).toBe(false);
    expect(isPageZoomed(1.005)).toBe(false);
    expect(isPageZoomed(1.5)).toBe(true);
    expect(isPageZoomed(undefined)).toBe(false);
  });
});

describe('barTransform', () => {
  it('puts the bar at the top left of what is on screen, at normal size', () => {
    // page zoomed 2×, the visible part is 410 css px wide and starts at (300, 500)
    const t = barTransform({ scale: 2, width: 410, offsetLeft: 300, offsetTop: 500 });
    expect(t.width).toBe(820);   // × 1/2 → 410 css px = the whole visible width
    expect(t.transform).toBe('translate(300px, 500px) scale(0.5)');
  });
});
