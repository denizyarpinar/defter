import type { OcrSatir } from './kayit/sema';

// Task 6.4c-2: one page image (JPEG, long edge ≤ 2000) → /api/oku → the lines in the record's shape.
// The model is the 6.4b decision (Haiku 5.5). The Google token goes only in the Authorization header.

export const OKU_MODEL = 'claude-haiku-5-5';

export interface OkunanSayfa { satirlar: OcrSatir[]; model: string }

export class OkumaHatasi extends Error {
  constructor(message: string, readonly durum: number | null) {
    super(message);
    this.name = 'OkumaHatasi';
  }
}

function base64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const DURUM_METNI: Record<number, string> = {
  401: 'Google girişi doğrulanamadı. Tekrar giriş yap.',
  403: 'Okuma sadece sahip hesabıyla kullanılabilir.',
  404: 'Okuma servisi bu adreste yok (yerelde "vercel dev" ile aç).',
  413: 'Sayfa görseli çok büyük.',
  415: 'Sayfa görseli JPEG değil.',
  429: 'Dakikada en fazla 10 okuma. Bir dakika bekle.'
};

export interface OkuSecenek { token: string | null; signal?: AbortSignal; fetch?: typeof fetch }

export async function okuApi(jpeg: Uint8Array, o: OkuSecenek): Promise<OkunanSayfa> {
  if (!o.token) throw new OkumaHatasi('Google girişi yok. Tekrar giriş yap.', null);
  let r: Response;
  try {
    r = await (o.fetch ?? fetch)('/api/oku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.token}` },
      body: JSON.stringify({ model: OKU_MODEL, gorsel: base64(jpeg) }),
      signal: o.signal
    });
  } catch (e) {
    if (o.signal?.aborted) throw e;
    throw new OkumaHatasi('Okuma servisine ulaşılamadı. Bağlantını kontrol et ve tekrar dene.', null);
  }
  type Govde = { hata?: unknown; satirlar?: unknown; model?: unknown };
  let govde: Govde | null;
  try { govde = await r.json() as Govde; } catch { govde = null; }
  if (!r.ok) {
    // the server's own Turkish text first (it never carries the key or the token)
    const metin = typeof govde?.hata === 'string' && r.status !== 404 ? govde.hata : DURUM_METNI[r.status] ?? `Okuma başarısız (durum ${r.status}). Tekrar dene.`;
    throw new OkumaHatasi(metin, r.status);
  }
  if (!govde || !Array.isArray(govde.satirlar)) throw new OkumaHatasi('Okuma yanıtı beklenen biçimde değil. Tekrar dene.', r.status);
  return { satirlar: govde.satirlar as OcrSatir[], model: typeof govde.model === 'string' ? govde.model : OKU_MODEL };
}
