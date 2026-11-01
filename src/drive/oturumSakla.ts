import { kapsamOku, type AktifKapsam } from './kapsam';

export const OTURUM_ANAHTARI = 'defter-oturum';
export interface StoredSession { value: string; expiresAt: number; aktif: AktifKapsam; scopes: string[] }
export type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type RestoreStatus = 'yok' | 'bozuk' | 'suresiDolmus';
export type SessionResult = { sonuc: 'gecerli'; oturum: StoredSession } | { sonuc: RestoreStatus; oturum: null };

export const tokenSaklamaAcik = (enabled: boolean, search: string): boolean =>
  enabled && new URLSearchParams(search).get('tokenSakla') !== '0';

// Pure validation: restore only the token's own coherent permissions, with >1 minute left.
export function oturumCoz(raw: string | null, now: number): SessionResult {
  if (raw === null) return { sonuc: 'yok', oturum: null };
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return { sonuc: 'bozuk', oturum: null }; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { sonuc: 'bozuk', oturum: null };
  const o = input as Record<string, unknown>;
  if (typeof o.value !== 'string' || !o.value || /\s/.test(o.value)
    || typeof o.expiresAt !== 'number' || !Number.isFinite(o.expiresAt) || o.expiresAt <= 0
    || (o.aktif !== 'dar' && o.aktif !== 'tam')
    || !Array.isArray(o.scopes) || !o.scopes.every(s => typeof s === 'string' && !!s && !/\s/.test(s))
    || kapsamOku(o.scopes.join(' ')) !== o.aktif) return { sonuc: 'bozuk', oturum: null };
  if (now >= o.expiresAt - 60_000) return { sonuc: 'suresiDolmus', oturum: null };
  return { sonuc: 'gecerli', oturum: { value: o.value, expiresAt: o.expiresAt, aktif: o.aktif, scopes: [...o.scopes] as string[] } };
}

export function oturumOku(store: SessionStore | null, now: number): SessionResult {
  try { return oturumCoz(store?.getItem(OTURUM_ANAHTARI) ?? null, now); }
  catch { return { sonuc: 'bozuk', oturum: null }; }
}

export function oturumYaz(session: StoredSession, store: SessionStore | null): void {
  try {
    const { value, expiresAt, aktif, scopes } = session;
    store?.setItem(OTURUM_ANAHTARI, JSON.stringify({ value, expiresAt, aktif, scopes }));
  } catch { /* blocked/full storage: the in-memory session still works */ }
}

export function oturumSil(store: SessionStore | null): void {
  try { store?.removeItem(OTURUM_ANAHTARI); } catch { /* blocked storage: never interrupt sign-out */ }
}
