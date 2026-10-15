import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Debouncer, SingleFlight } from './cizimKuyrugu';

const timers = { set: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number, clear: (id: number | undefined) => clearTimeout(id) };

describe('Debouncer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('no drawing while the fingers move; one drawing 250 ms after the last move', () => {
    const run = vi.fn();
    const d = new Debouncer(250, run, timers);
    for (let k = 0; k < 20; k++) { d.poke(); vi.advanceTimersByTime(16); }   // a 320 ms pinch, a move every frame
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(233);   // 16 + 233 = 249 ms since the last move
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(d.waiting).toBe(false);
  });

  it('cancel(): nothing runs (reader closed, zoom reset)', () => {
    const run = vi.fn();
    const d = new Debouncer(250, run, timers);
    d.poke();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });

  it('poking from inside run (fingers still down) waits another round', () => {
    let busy = true;
    const run = vi.fn(() => { if (busy) d.poke(); });
    const d = new Debouncer(250, run, timers);
    d.poke();
    vi.advanceTimersByTime(250);
    expect(run).toHaveBeenCalledTimes(1);
    expect(d.waiting).toBe(true);
    busy = false;
    vi.advanceTimersByTime(250);
    expect(run).toHaveBeenCalledTimes(2);
    expect(d.waiting).toBe(false);
  });
});

describe('SingleFlight', () => {
  const job = () => ({ cancel: vi.fn() });

  it('a new drawing of the same page cancels the one still running', () => {
    const f = new SingleFlight<number>();
    const a = f.start(3, job());
    const b = f.start(3, job());
    expect(a.cancel).toHaveBeenCalledTimes(1);
    expect(b.cancel).not.toHaveBeenCalled();
    expect(f.isCurrent(3, a)).toBe(false);
    expect(f.isCurrent(3, b)).toBe(true);
    expect(f.size).toBe(1);
  });

  it('different pages draw side by side', () => {
    const f = new SingleFlight<number>();
    const a = f.start(3, job()), b = f.start(4, job());
    expect(a.cancel).not.toHaveBeenCalled();
    expect(b.cancel).not.toHaveBeenCalled();
    expect(f.size).toBe(2);
  });

  it('done() of an old job does not forget the new one', () => {
    const f = new SingleFlight<number>();
    const a = f.start(3, job()), b = f.start(3, job());
    f.done(3, a);
    expect(f.isCurrent(3, b)).toBe(true);
    f.done(3, b);
    expect(f.size).toBe(0);
  });

  it('cancelAll(): reader closed', () => {
    const f = new SingleFlight<number>();
    const a = f.start(1, job()), b = f.start(2, job());
    f.cancelAll();
    expect(a.cancel).toHaveBeenCalled();
    expect(b.cancel).toHaveBeenCalled();
    expect(f.size).toBe(0);
  });
});
