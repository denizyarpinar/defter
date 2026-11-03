import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputRouter } from './girdi';

afterEach(() => vi.unstubAllGlobals());
describe('E-1 finger writing', () => {
  it('draws with one finger and cancels with the second despite a remembered pen', () => {
    const r = new InputRouter(true); r.setElModu(true);
    expect(r.penSeen).toBe(true); expect(r.penMode).toBe(false);
    expect(r.down('touch', 1)).toEqual({ route: 'ciz', cancel: false });
    expect(r.down('touch', 2)).toEqual({ route: 'gezin', cancel: true });
  });
  it('accepts a 104 px contact, growth and pen cooldown in finger mode', () => {
    const r = new InputRouter(true);
    r.down('pen', 9); r.up(9, 100); r.setElModu(true);
    expect(r.ignoreTouch(104, 200, true)).toBe(false);
    expect(r.down('touch', 1, 0, false, 104, 200).route).toBe('ciz');
    expect(r.move(1, 130)).toBe(null);
  });
  it('returns to pen mode once and draws the arriving pen', () => {
    const ended = vi.fn(); const r = new InputRouter(true, () => {}, ended);
    r.setElModu(true);
    expect(r.down('pen', 1)).toEqual({ route: 'ciz', cancel: false });
    expect(r.elModu).toBe(false); expect(r.penMode).toBe(true);
    r.down('pen', 2); expect(ended).toHaveBeenCalledTimes(1);
  });
  it('ignores the toggle with ?elModu=0', () => {
    vi.stubGlobal('location', { search: '?elModu=0' });
    const r = new InputRouter(true); r.setElModu(true);
    expect(r.elModu).toBe(false); expect(r.penMode).toBe(true);
    expect(r.down('touch', 1).route).toBe('gezin');
  });
});

// Task 4.6: which input draws

describe('InputRouter', () => {
  it('rejects the first palm after reload when the host remembers a pen', () => {
    const r = new InputRouter(true);
    expect(r.down('touch', 1, 0, false, 104, 0)).toEqual({ route: 'yoksay', cancel: false });
  });

  it('lets a 63 px finger navigate, and rejects initial contacts from 100 px upwards', () => {
    const r = new InputRouter(true);
    expect(r.down('touch', 1, 0, false, 63, 0).route).toBe('gezin');
    expect(r.down('touch', 2, 0, false, 100, 0).route).toBe('yoksay');
    expect(r.down('touch', 3, 0, false, 104, 0).route).toBe('yoksay');
  });

  it('latches a growing palm until it lifts, without cancelling the pen', () => {
    const r = new InputRouter(true);
    r.down('touch', 1, 0, false, 63, 0);
    expect(r.move(1, 104)).toBe('gezin');
    expect(r.move(1, 119)).toBe('gezin');
    expect(r.move(1, 120)).toBe('yoksay');
    expect(r.move(1, 130)).toBe('yoksay');
    expect(r.move(1, 63)).toBe('yoksay');
    expect(r.down('pen', 2).cancel).toBe(false);
    r.up(1);
    expect(r.ignores(1)).toBe(false);
  });

  it('rejects contacts starting 200 ms after the pen, but allows them at 300 and 400 ms', () => {
    const r = new InputRouter();
    r.down('pen', 1, 0, false, 1, 0);
    r.up(1, 100);
    expect(r.down('touch', 2, 0, false, 63, 300).route).toBe('yoksay');
    expect(r.move(2, 63)).toBe('yoksay');
    expect(r.down('touch', 3, 0, false, 63, 400).route).toBe('gezin');
    expect(r.down('touch', 4, 0, false, 63, 500).route).toBe('gezin');
  });

  it('notifies the host once when a pen is first seen, and does not filter pen-mode-off input', () => {
    let remembered = 0;
    const r = new InputRouter(false, () => { remembered++; });
    r.down('pen', 1); r.up(1, 100);
    r.down('pen', 2); r.up(2, 200);
    expect(remembered).toBe(1);
    expect(r.down('touch', 3, 0, false, 272, 201, false).route).toBe('gezin');
    expect(r.down('mouse', 4, 0, false, 272, 201).route).toBe('ciz');
  });

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
