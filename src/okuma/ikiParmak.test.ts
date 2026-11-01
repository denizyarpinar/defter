import { describe, expect, it } from 'vitest';
import { decideFingerGesture, fingerFrame, startFingerGesture } from './ikiParmak';

const frame = (distance = 200, x = 100, y = 0) => ({ distance, center: { x, y } });

describe('two-finger pan / pinch decision', () => {
  it('waits below 8 px and then scrolls by the whole initial displacement', () => {
    const first = decideFingerGesture(startFingerGesture(frame()), frame(200, 100, 7));
    expect(first.state.mode).toBe('waiting');
    expect(first.dy).toBe(0);
    const next = decideFingerGesture(first.state, frame(200, 100, 8));
    expect(next.state.mode).toBe('pan');
    expect(next.dy).toBe(-8);
    expect(decideFingerGesture(next.state, frame(200, 100, 18)).dy).toBe(-10);
  });

  it('requires both 12 px and 8 percent before pinching', () => {
    expect(decideFingerGesture(startFingerGesture(frame(100)), frame(111)).state.mode).toBe('waiting');
    expect(decideFingerGesture(startFingerGesture(frame(200)), frame(215)).state.mode).toBe('waiting');
    expect(decideFingerGesture(startFingerGesture(frame(100)), frame(112)).state.mode).toBe('pinch');
    expect(decideFingerGesture(startFingerGesture(frame(200)), frame(216)).scale).toBe(1.08);
  });

  it('keeps parallel motion at the same zoom and changes pan to pinch without double movement', () => {
    const initial = fingerFrame({ x: 0, y: 0 }, { x: 200, y: 0 });
    const pan = decideFingerGesture(startFingerGesture(initial), fingerFrame({ x: 20, y: 0 }, { x: 220, y: 0 }));
    expect(pan).toMatchObject({ dx: -20, dy: 0, scale: 1, state: { mode: 'pan' } });
    const pinch = decideFingerGesture(pan.state, frame(230, 120));
    expect(pinch).toMatchObject({ dx: 0, dy: 0, scale: 1.15, state: { mode: 'pinch' } });
    expect(decideFingerGesture(pinch.state, frame(200, 150)).state.mode).toBe('pinch');
  });

  it('starts fresh after release: a new gesture can pan after a pinch', () => {
    const pinch = decideFingerGesture(startFingerGesture(frame()), frame(240));
    expect(pinch.state.mode).toBe('pinch');
    const next = decideFingerGesture(startFingerGesture(frame(240)), frame(240, 100, 10));
    expect(next).toMatchObject({ dy: -10, scale: 1, state: { mode: 'pan' } });
  });
});
