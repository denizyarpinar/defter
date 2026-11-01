import { describe, expect, it, vi } from 'vitest';
import { KAPSAM_DAR, KAPSAM_TAM } from './kapsam';
import { OTURUM_ANAHTARI, oturumCoz, oturumOku, oturumSil, oturumYaz, tokenSaklamaAcik, type StoredSession } from './oturumSakla';

const NOW = 1_800_000_000_000;
const session: StoredSession = { value: 'fake-unit-session', expiresAt: NOW + 3_600_000, aktif: 'dar', scopes: [KAPSAM_DAR] };

describe('session persistence validation', () => {
  it.each(['dar', 'tam'] as const)('round-trips a valid %s session', aktif => {
    const saved = { ...session, aktif, scopes: [aktif === 'dar' ? KAPSAM_DAR : KAPSAM_TAM] };
    expect(oturumCoz(JSON.stringify(saved), NOW)).toEqual({ sonuc: 'gecerli', oturum: saved });
  });
  it('distinguishes absent records from malformed ones', () => {
    expect(oturumCoz(null, NOW)).toEqual({ sonuc: 'yok', oturum: null });
  });
  it.each(['', '{broken', 'null', '[]', 'true', '42', '{}'])('rejects malformed JSON/shape (%s)', raw => {
    expect(oturumCoz(raw, NOW)).toEqual({ sonuc: 'bozuk', oturum: null });
  });
  it.each([
    { value: '' }, { value: 'contains spaces' }, { value: 3 }, { expiresAt: 'later' }, { expiresAt: null },
    { expiresAt: -1 }, { actif: 'tam', aktif: null }, { scopes: [] }, { scopes: [4] },
    { scopes: [KAPSAM_DAR + ' ' + KAPSAM_TAM] }, { scopes: [KAPSAM_TAM] }, { scopes: ['unrelated'] },
  ])('rejects invalid fields or inconsistent permissions (%j)', patch => {
    expect(oturumCoz(JSON.stringify({ ...session, ...patch }), NOW).sonuc).toBe('bozuk');
  });
  it.each([-1000, 0, 59_999, 60_000])('does not restore with %i ms remaining', remaining => {
    expect(oturumCoz(JSON.stringify({ ...session, expiresAt: NOW + remaining }), NOW)).toEqual({ sonuc: 'suresiDolmus', oturum: null });
  });
  it('restores when more than one minute remains', () => {
    expect(oturumCoz(JSON.stringify({ ...session, expiresAt: NOW + 60_001 }), NOW).sonuc).toBe('gecerli');
  });
  it('only saves the four session fields and removes the same key', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
    oturumYaz({ ...session, ignored: 'not-saved' } as StoredSession, store);
    expect([...data.keys()]).toEqual([OTURUM_ANAHTARI]);
    expect(JSON.parse(data.get(OTURUM_ANAHTARI)!)).toEqual(session);
    expect(oturumOku(store, NOW)).toEqual({ sonuc: 'gecerli', oturum: session });
    oturumSil(store);
    expect(oturumOku(store, NOW).sonuc).toBe('yok');
  });
  it('swallows blocked and unavailable storage', () => {
    const blocked = { getItem: vi.fn(() => { throw new Error('blocked'); }), setItem: vi.fn(() => { throw new Error('full'); }), removeItem: vi.fn(() => { throw new Error('blocked'); }) };
    expect(oturumOku(blocked, NOW).sonuc).toBe('bozuk');
    expect(() => oturumYaz(session, blocked)).not.toThrow();
    expect(() => oturumSil(blocked)).not.toThrow();
    expect(oturumOku(null, NOW).sonuc).toBe('yok');
    expect(() => oturumYaz(session, null)).not.toThrow();
    expect(() => oturumSil(null)).not.toThrow();
  });
  it('the rollback constant overrides any query and the query can disable storage independently', () => {
    for (const search of ['', '?tokenSakla=1', '?tokenSakla=0']) expect(tokenSaklamaAcik(false, search)).toBe(false);
    expect(tokenSaklamaAcik(true, '')).toBe(true);
    expect(tokenSaklamaAcik(true, '?olcum=1&tokenSakla=0')).toBe(false);
  });
});
