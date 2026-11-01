import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Renewal, tokenOmru, yenilemeAcik, yenilemeZamani, type BannerState } from './yenileme';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture() {
  let visible = true;
  const signIn = vi.fn<() => Promise<string>>(() => Promise.resolve('test-only'));
  const banner = vi.fn<(state: BannerState) => void>();
  const cancelRequest = vi.fn();
  const renewal = new Renewal({ now: Date.now, later: setTimeout, clear: clearTimeout,
    visible: () => visible, signIn, banner, cancelRequest, log: vi.fn() });
  return { renewal, signIn, banner, cancelRequest, hide: () => { visible = false; }, show: () => { visible = true; } };
}
const blocked = () => Promise.reject({ code: 'popup-blocked' });

describe('renewal state machine', () => {
  it.each([[3_600_000, 3_300_000], [120_000, 80_000]])('schedules lifetime %i at %i', (life, due) => {
    expect(yenilemeZamani(life, 0)).toBe(due);
  });
  it('timer fires once; success never shows a banner', async () => {
    const f = fixture(); f.renewal.accept(120_000, 0);
    await vi.advanceTimersByTimeAsync(80_000);
    f.renewal.check(); f.renewal.check();
    expect(f.signIn).toHaveBeenCalledOnce();
    expect(f.banner.mock.calls.flat()).toEqual(['hidden']);
  });
  it('hidden timer waits until visible/focus check', async () => {
    const f = fixture(); f.hide(); f.renewal.accept(120_000, 0);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(f.signIn).not.toHaveBeenCalled();
    f.show(); f.renewal.check(); f.renewal.check();
    await Promise.resolve(); expect(f.signIn).toHaveBeenCalledOnce();
  });
  it('three concurrent requests share the exact Promise and one signIn', async () => {
    const f = fixture();
    const a = f.renewal.renew('freshToken');
    const b = f.renewal.renew('freshToken'); const c = f.renewal.renew('401');
    expect(a).toBe(b); expect(b).toBe(c);
    expect(await Promise.all([a, b, c])).toEqual(['test-only', 'test-only', 'test-only']);
    expect(f.signIn).toHaveBeenCalledOnce();
  });
  it('blocked attempt keeps requests pending; touch starts signIn synchronously before any microtask', async () => {
    const f = fixture(); f.signIn.mockImplementationOnce(blocked);
    const done = vi.fn(); const p = f.renewal.renew('freshToken').then(done);
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    expect(f.banner).toHaveBeenLastCalledWith('continue');
    f.renewal.touch();
    // This assertion deliberately precedes await: catches deferred popup opening.
    expect(f.signIn).toHaveBeenCalledTimes(2);
    await p; expect(done).toHaveBeenCalledWith('test-only');
  });
  it('closed/denied popup on touch keeps banner in retry state', async () => {
    const f = fixture(); f.signIn.mockImplementation(blocked);
    const p = f.renewal.renew('freshToken');
    await Promise.resolve(); f.renewal.touch(); await Promise.resolve();
    expect(f.banner).toHaveBeenLastCalledWith('retry');
    const assertion = expect(p).rejects.toThrow('exit'); f.renewal.cancel(new Error('exit')); await assertion;
  });
  it('timeout shows banner after 15 seconds and ignores a late successful result', async () => {
    const f = fixture(); let resolve!: (token: string) => void;
    f.signIn.mockImplementation(() => new Promise(yes => { resolve = yes; }));
    const p = f.renewal.renew('freshToken');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.banner).toHaveBeenLastCalledWith('continue');
    resolve('stale'); await Promise.resolve(); expect(f.banner).toHaveBeenLastCalledWith('continue');
    const assertion = expect(p).rejects.toThrow(); f.renewal.cancel(new Error('exit')); await assertion;
  });
  it('new token replaces the previous timer', async () => {
    const f = fixture(); f.renewal.accept(120_000, 0); f.renewal.accept(3_600_000, 0);
    await vi.advanceTimersByTimeAsync(120_000); expect(f.signIn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_180_000); expect(f.signIn).toHaveBeenCalledOnce();
  });
  it('signOut cancels both timers, hides banner and rejects waiters', async () => {
    const f = fixture(); f.signIn.mockImplementation(blocked); f.renewal.accept(120_000, 0);
    const p = f.renewal.renew('freshToken'); await Promise.resolve();
    const assertion = expect(p).rejects.toThrow('exit'); f.renewal.cancel(new Error('exit')); await assertion;
    await vi.advanceTimersByTimeAsync(4_000_000); f.renewal.check();
    expect(f.signIn).toHaveBeenCalledOnce(); expect(f.banner).toHaveBeenLastCalledWith('hidden');
  });
  it('tokenSure only shortens a real lifetime and validates range', () => {
    expect(tokenOmru(3600, '?tokenSure=120')).toBe(120);
    expect(tokenOmru(90, '?tokenSure=120')).toBe(90);
    for (const value of ['119', '3601', 'NaN', '']) expect(tokenOmru(3599, `?tokenSure=${value}`)).toBe(3599);
  });
  it('both rollback switches disable renewal', () => {
    expect(yenilemeAcik(true, '')).toBe(true);
    expect(yenilemeAcik(false, '')).toBe(false);
    expect(yenilemeAcik(true, '?yenile=0')).toBe(false);
  });
});
