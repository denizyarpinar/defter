// Diagnosis only: no auth/language dependencies, so importing from dil/index cannot create a cycle.
type Detail = Record<string, string | number | boolean | null>;
export interface AuthLogEntry { t: number; sayfa: number; olay: string; ayrinti: Detail }
const KEY = 'defter-auth-gunluk';
const PAGE_KEY = 'defter-auth-gunluk-sayfa';
const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).get('olcum') === '1';
export const gunlukAcik = (): boolean => enabled;
let page = 0;
let entries: AuthLogEntry[] = [];
const listeners = new Set<() => void>();

// Only diagnostic vocabulary can enter the log. Arbitrary strings (including personal data,
// server errors, tokens and file ids) are redacted even if a caller accidentally supplies them.
const words = new Set([
  'en', 'tr', 'invalid', 'kullanici', 'freshToken', 'tamErisim', 'drive', 'select_account', '',
  'popup_failed_to_open', 'popup_closed', 'unknown', 'files', 'about', 'other',
  'girisYok', 'giriliyor', 'yukleniyor', 'demo', 'hata', 'kurulum', 'girisBasladi', 'girisBasarili',
  'girisHata', 'driveGeldi', 'driveHata', 'kurulumGerekli', 'kurulumBasladi', 'kurulumHata',
  'kurulumIlerleme', 'kurulumBitti', 'tekrarDene', 'demoSecildi', 'demoHata', 'cikis', 'oturumDoldu',
  'tamErisimGerekli', 'tamErisimBasladi', 'tamErisimVerildi', 'tamErisimHata',
  'hicbir', 'yenile', 'driveYaz', 'writerYok', 'fileYok', 'yazildi', 'timeout', '401', '401-2',
  'Failed to fetch', 'Load failed', 'NetworkError', '[gizlendi]',
]);
const safe = (value: unknown): string | number | boolean | null => {
  if (typeof value === 'string') return words.has(value) ? value : '[gizlendi]';
  return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : null;
};
function details(input: Detail): Detail {
  const out: Detail = {};
  // Keys are vocabulary too: never persist arbitrary user-supplied field names.
  for (const key of ['dil', 'rememberedUser', 'donus', 'neden', 'prompt', 'hint', 'pendingIptal', 'expires_in',
    'tur', 'kaynak', 'path', 'deneme', 'oturumDoldu', 'once', 'sonra', 'hedef', 'sonuc', 'mesaj',
    'driveDil', 'yerelDil', 'yerelAcikSecim', 'bekleyen', 'fileEsit', 'buOturumdaYenilendi', 'eylem', 'adresteLang']) {
    if (Object.hasOwn(input, key)) out[key] = safe(input[key]);
  }
  return out;
}

const events = new Set(['page.open', 'signIn.start', 'gis.success', 'gis.denied', 'gis.error', 'dropToken', 'signOut',
  'authorized.refresh', 'authorized.401', 'onExpired', 'state', 'googleSignIn', 'loadFromDrive',
  'dilDegistir', 'dilDriveYaz', 'dilTercihiUygula', 'dilSec']);

if (enabled) {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(saved)) entries = saved.filter((e): e is AuthLogEntry =>
      !!e && typeof e === 'object' && Number.isFinite(e.t) && Number.isInteger(e.sayfa)
      && typeof e.olay === 'string' && events.has(e.olay) && !!e.ayrinti && typeof e.ayrinti === 'object'
    ).slice(-80).map(e => ({ t: e.t, sayfa: e.sayfa, olay: e.olay, ayrinti: details(e.ayrinti) }));
  } catch { /* blocked or invalid storage: keep an in-memory log */ }
  try {
    const previous = Number(sessionStorage.getItem(PAGE_KEY));
    page = (Number.isSafeInteger(previous) && previous >= 0 ? previous : 0) + 1;
    sessionStorage.setItem(PAGE_KEY, String(page));
  } catch { page = 1; }
}

export function gunlukYaz(olay: string, ayrinti: Detail = {}): void {
  if (!enabled) return;
  entries.push({ t: Date.now(), sayfa: page, olay: events.has(olay) ? olay : '[gizlendi]', ayrinti: details(ayrinti) });
  entries = entries.slice(-80);
  try { sessionStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* diagnosis must never interrupt the app */ }
  for (const listener of listeners) { try { listener(); } catch { /* diagnosis only */ } }
}

export const gunlukOku = (): AuthLogEntry[] => enabled ? entries.map(e => ({ ...e, ayrinti: { ...e.ayrinti } })) : [];
export function gunlukTemizle(): void {
  if (!enabled) return;
  entries = [];
  try { sessionStorage.removeItem(KEY); } catch { /* memory still cleared */ }
  for (const listener of listeners) { try { listener(); } catch { /* diagnosis only */ } }
}
export function gunlukDinle(listener: () => void): void { if (enabled) listeners.add(listener); }

// Unknown messages may contain names or ids; only known, anonymous network errors are retained.
export function gunlukHatasi(error: unknown): string {
  return safe(error instanceof Error ? error.message.slice(0, 60) : null) as string | null ?? '[gizlendi]';
}
