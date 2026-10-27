import type { OcrSatir } from './kayit/sema';
import { t, type Anahtar } from '../dil';

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

// Task 6.5-4a: api/oku's fixed error codes → this page's language. An unknown code: the server's text (Turkish),
// no code (an older server): the server's text, else the HTTP status below.
const KOD_METNI: Record<string, Anahtar> = {
  giris_yok: 'ocrApi.giris_yok', giris_gecersiz: 'ocrApi.giris_gecersiz', google_ulasilamadi: 'ocrApi.google_ulasilamadi',
  giris_baska: 'ocrApi.giris_baska', sahip_degil: 'ocrApi.sahip_degil', drive_ulasilamadi: 'ocrApi.drive_ulasilamadi',
  yontem: 'ocrApi.yontem', ayar_eksik: 'ocrApi.ayar_eksik', hiz_siniri: 'ocrApi.hiz_siniri', cok_buyuk: 'ocrApi.cok_buyuk',
  json_degil: 'ocrApi.json_degil', model_bilinmiyor: 'ocrApi.model_bilinmiyor', gorsel_yok: 'ocrApi.gorsel_yok',
  base64_degil: 'ocrApi.base64_degil', jpeg_degil: 'ocrApi.jpeg_degil', kenar_buyuk: 'ocrApi.kenar_buyuk',
  model_ulasilamadi: 'ocrApi.model_ulasilamadi', model_hata: 'ocrApi.model_hata', model_bozuk: 'ocrApi.model_bozuk',
  model_reddetti: 'ocrApi.model_reddetti', model_yarida: 'ocrApi.model_yarida', model_bicim: 'ocrApi.model_bicim'
};
const DURUM_METNI: Record<number, Anahtar> = {
  401: 'ocrApi.d401', 403: 'ocrApi.d403', 404: 'ocrApi.d404', 413: 'ocrApi.d413', 415: 'ocrApi.d415', 429: 'ocrApi.d429'
};

type HataGovdesi = { hata?: unknown; kod?: unknown; eksik?: unknown; sinir?: unknown; kenar?: unknown; durum?: unknown };

// The text for a failed answer (exported for the tests)
export function hataMetni(status: number, g: HataGovdesi | null): string {
  const kod = typeof g?.kod === 'string' && Object.hasOwn(KOD_METNI, g.kod) ? KOD_METNI[g.kod] : null;
  if (kod) {
    const deger = (x: unknown, yedek: string | number) => typeof x === 'string' || typeof x === 'number' ? x : yedek;
    return t(kod, {
      eksik: Array.isArray(g!.eksik) ? g!.eksik.join(', ') : '', sinir: deger(g!.sinir, 10),
      kenar: deger(g!.kenar, 2000), durum: deger(g!.durum, status)
    });
  }
  // the server's own text first (it never carries the key or the token); a 404 is a missing api, not its answer
  if (typeof g?.hata === 'string' && status !== 404) return g.hata;
  return DURUM_METNI[status] ? t(DURUM_METNI[status]) : t('ocrApi.durum', { durum: status });
}

export interface OkuSecenek { token: string | null; signal?: AbortSignal; fetch?: typeof fetch }

export async function okuApi(jpeg: Uint8Array, o: OkuSecenek): Promise<OkunanSayfa> {
  if (!o.token) throw new OkumaHatasi(t('ocrApi.giris_yok'), null);
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
    throw new OkumaHatasi(t('ocrApi.servisYok'), null);
  }
  type Govde = HataGovdesi & { satirlar?: unknown; model?: unknown };
  let govde: Govde | null;
  try { govde = await r.json() as Govde; } catch { govde = null; }
  if (!r.ok) throw new OkumaHatasi(hataMetni(r.status, govde), r.status);
  if (!govde || !Array.isArray(govde.satirlar)) throw new OkumaHatasi(t('ocrApi.model_bicim'), r.status);
  return { satirlar: govde.satirlar as OcrSatir[], model: typeof govde.model === 'string' ? govde.model : OKU_MODEL };
}
