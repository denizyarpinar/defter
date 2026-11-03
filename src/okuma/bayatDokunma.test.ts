import { describe, expect, it } from 'vitest';
import { staleTouchEnabled, staleTouchIds, startsTouchSequence } from './bayatDokunma';

describe('stale contact decisions without DOM', () => {
  it('starts a new sequence only for a primary touch', () => {
    expect(startsTouchSequence('touch', true)).toBe(true);
    expect(startsTouchSequence('touch', false)).toBe(false);
    expect(startsTouchSequence('pen', true)).toBe(false);
    expect(startsTouchSequence('mouse', true)).toBe(false);
  });
  it('removes only idle contacts at 1500 ms when an extra contact blocks the gesture', () => {
    const pts = new Map([[1, { last: 0 }], [2, { last: 1 }], [3, { last: 1500 }]]);
    expect(staleTouchIds(pts, 1499, false)).toEqual([]);
    expect(staleTouchIds(pts, 1500, false)).toEqual([1]);
    expect(staleTouchIds(pts, 1500, true)).toEqual([]);
    pts.delete(3);
    expect(staleTouchIds(pts, 3000, false)).toEqual([]);
  });
  it('supports the explicit rollback parameter', () => {
    expect(staleTouchEnabled('')).toBe(true);
    expect(staleTouchEnabled('?bayat=0&olcum=1')).toBe(false);
    expect(staleTouchEnabled('?bayat=1')).toBe(true);
  });
});
