import { describe, expect, it } from 'vitest';
import { InputRouter } from './girdi';

// Task 4.6: which input draws

describe('InputRouter', () => {
  it('no pen seen: mouse and one finger draw', () => {
    const r = new InputRouter();
    expect(r.down('mouse', 1)).toEqual({ route: 'ciz', cancel: false });
    expect(r.down('touch', 2)).toEqual({ route: 'ciz', cancel: false });
    expect(r.penSeen).toBe(false);
  });

  it('no pen seen: the second finger zooms / scrolls and cancels the stroke', () => {
    const r = new InputRouter();
    expect(r.down('touch', 1).route).toBe('ciz');
    expect(r.down('touch', 2)).toEqual({ route: 'gezin', cancel: true });
    expect(r.touchCount).toBe(2);
    // both lift, a new single finger draws again
    r.up(1); r.up(2);
    expect(r.down('touch', 3)).toEqual({ route: 'ciz', cancel: false });
  });

  it('pen always draws; once seen, fingers never draw (palm rejection)', () => {
    const r = new InputRouter();
    expect(r.down('pen', 1)).toEqual({ route: 'ciz', cancel: false });
    expect(r.penSeen).toBe(true);
    r.up(1);
    expect(r.down('touch', 2)).toEqual({ route: 'gezin', cancel: false });
    expect(r.down('touch', 3)).toEqual({ route: 'gezin', cancel: false });   // two fingers: zoom, nothing to cancel
    expect(r.down('pen', 4).route).toBe('ciz');
    expect(r.down('mouse', 5).route).toBe('ciz');
  });

  it('pen seen and drawing: a touch (the hand) is ignored, the stroke stays', () => {
    const r = new InputRouter();
    r.down('pen', 1);
    expect(r.down('touch', 2, 0, true)).toEqual({ route: 'yoksay', cancel: false });
    expect(r.down('touch', 3, 0, true)).toEqual({ route: 'yoksay', cancel: false });
  });

  it('pen seen while a finger draws: the finger was before the pen', () => {
    const r = new InputRouter();
    expect(r.down('touch', 1).route).toBe('ciz');
    expect(r.down('pen', 2).route).toBe('ciz');
    r.up(1);
    expect(r.down('touch', 3).route).toBe('gezin');
  });

  it('other mouse buttons and unknown types do nothing', () => {
    const r = new InputRouter();
    expect(r.down('mouse', 1, 2).route).toBe('yoksay');
    expect(r.down('mouse', 1, 1).route).toBe('yoksay');
    expect(r.down('', 2).route).toBe('yoksay');
  });
});
