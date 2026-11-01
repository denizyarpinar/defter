import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

const KEY = 'defter-auth-gunluk';
let storage: Map<string, string>;
let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;
async function load(search = '?olcum=1') {
  vi.stubGlobal('location', { search });
  vi.resetModules();
  return import('./authGunlugu');
}
beforeEach(() => {
  storage = new Map();
  getItem = vi.fn((key: string) => storage.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => { storage.set(key, value); });
  vi.stubGlobal('sessionStorage', { getItem, setItem, removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('auth diagnosis', () => {
  it.each(['', '?olcum=0', '?olcum=true'])('does not read or write storage when disabled (%s)', async search => {
    const log = await load(search);
    const listener = vi.fn();
    log.gunlukDinle(listener);
    log.gunlukYaz('page.open', { dil: 'en' });
    log.gunlukTemizle();
    expect(log.gunlukOku()).toEqual([]);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
  it('keeps the latest 80 entries with wall-clock timestamps', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1793550000123);
    const log = await load();
    for (let i = 0; i < 85; i++) log.gunlukYaz('authorized.401', { deneme: i });
    const saved = JSON.parse(storage.get(KEY)!);
    expect(saved).toHaveLength(80);
    expect(saved[0]).toEqual({ t: 1793550000123, sayfa: 1, olay: 'authorized.401', ayrinti: { deneme: 5 } });
    expect(saved[79].ayrinti.deneme).toBe(84);
  });
  it('preserves records and increments the page counter across reloads, including after clear', async () => {
    let log = await load();
    log.gunlukYaz('dilSec', { kaynak: 'kullanici', hedef: 'tr' });
    log = await load();
    log.gunlukYaz('page.open', { dil: 'tr' });
    expect(log.gunlukOku().map(e => e.sayfa)).toEqual([1, 2]);
    log.gunlukTemizle();
    expect(storage.has(KEY)).toBe(false);
    log = await load();
    log.gunlukYaz('page.open');
    expect(log.gunlukOku()[0].sayfa).toBe(3);
  });
  it('swallows storage access, write and remove errors and still works in memory', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); },
    });
    const log = await load();
    expect(() => log.gunlukYaz('page.open')).not.toThrow();
    expect(log.gunlukOku()[0].sayfa).toBe(1);
    expect(() => log.gunlukTemizle()).not.toThrow();
    expect(log.gunlukOku()).toEqual([]);
    vi.stubGlobal('sessionStorage', undefined);
    expect(() => log.gunlukYaz('page.open')).not.toThrow();
  });
  it('recovers from malformed or wrong-shape stored records', async () => {
    storage.set(KEY, '{broken');
    storage.set('defter-auth-gunluk-sayfa', 'bad');
    let log = await load();
    log.gunlukYaz('page.open');
    expect(log.gunlukOku()[0].sayfa).toBe(1);
    storage.set(KEY, JSON.stringify([null, 'invalid', { t: 1, sayfa: 1, olay: 'page.open', ayrinti: { dil: 'en' } }]));
    log = await load();
    expect(log.gunlukOku()).toHaveLength(1);
  });
  it('accepts only primitive detail values in its public type and redacts accidental private strings', async () => {
    const log = await load();
    expectTypeOf<Parameters<typeof log.gunlukYaz>[1]>().toEqualTypeOf<Record<string, string | number | boolean | null> | undefined>();
    log.gunlukYaz('page.open', { dil: 'test@example.invalid', mesaj: 'Bearer fake-private-value', kaynak: 'private-file-id', hint: true, donus: null, expires_in: 3600, email: 'test@example.invalid' });
    log.gunlukYaz('private-person-name', { mesaj: log.gunlukHatasi(new Error('Private Name private-file-id')) });
    const saved = storage.get(KEY)!;
    for (const value of ['test@example', 'Bearer', 'fake-private', 'private-file-id', 'Private Name', 'private-person-name', 'email']) expect(saved).not.toContain(value);
    expect(log.gunlukOku()[0].ayrinti).toMatchObject({ hint: true, donus: null, expires_in: 3600, dil: '[gizlendi]' });
    expect(log.gunlukHatasi(new Error('timeout'))).toBe('timeout');
  });
  it('notifies the UI, isolates listener failures and returns independent snapshots', async () => {
    const log = await load();
    const listener = vi.fn();
    log.gunlukDinle(() => { throw new Error('UI failed'); });
    log.gunlukDinle(listener);
    log.gunlukYaz('page.open', { dil: 'en' });
    log.gunlukOku()[0].ayrinti.dil = 'tr';
    expect(log.gunlukOku()[0].ayrinti.dil).toBe('en');
    log.gunlukTemizle();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
