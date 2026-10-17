import { SessionExpired } from '../drive/drive';
import { OfisCevrilemedi, OfisCokBuyuk, OfisDesteklenmiyor, OfisIptal, OfisYuklenemedi } from '../drive/ofisCevir';
import { DosyaYazmaYok, YerDisi, YetkiYok } from '../drive/pdfOlustur';
import { MAX_DOSYA_MB } from './ayarlar';
import type { DosyaTuruSonucu } from './dosyaTuru';
import { hataMesaji } from './gorselHesap';

// Task 5.10b: the texts of "Dosya ekle" (no DOM, so it can be tested).

const OFIS_ADI = new Map([['word', 'Word'], ['powerpoint', 'PowerPoint'], ['keynote', 'Keynote'], ['pages', 'Pages']]);

export function ofisMetni(alt?: string): string {
  const adi = (alt && OFIS_ADI.get(alt)) || 'Word/PowerPoint';
  return `${adi} dosyaları eklenemiyor. Dosyayı PDF olarak kaydedip ekle.`;
}

export const DESTEKLENMEYEN_METIN = 'Bu dosya türü desteklenmiyor. PDF ya da görsel (JPEG, PNG) seç.';
// "Dosya ekle"'s own text (the photo flow keeps hataMesaji('bos'))
export const BOS_DOSYA_METIN = 'Dosya boş. Başka bir dosya seç.';
export const BOZUK_PDF_METIN = 'Bu PDF açılamıyor, dosya bozuk olabilir.';

// Why the file can't be added; pdf and gorsel: null (they can)
export function turMetni(s: DosyaTuruSonucu): string | null {
  if (s.tur === 'ofis') return ofisMetni(s.alt);
  if (s.tur === 'desteklenmeyen') return s.alt === 'bozukPdf' ? BOZUK_PDF_METIN : DESTEKLENMEYEN_METIN;
  return null;
}

// A HEIC the browser can't decode: the photo flow's text, not a copy of it
export const heicAcilamadiMetni = (): string => hataMesaji('heic');

const MB = 1_000_000;
// one decimal, Turkish comma; rounded up so an oversized file never shows the limit itself
const mbYazi = (n: number) => String(Math.ceil(n * 10 - 1e-9) / 10).replace('.', ',');

// "Dosya çok büyük: 62,4 MB, sınır 50 MB"; within the limit: null
export function boyutMetni(bayt: number, maxMb = MAX_DOSYA_MB): string | null {
  if (bayt <= maxMb * MB) return null;
  return `Dosya çok büyük: ${mbYazi(bayt / MB)} MB, sınır ${mbYazi(maxMb)} MB`;
}

// ---- task 6.1c: Word / PowerPoint conversion in the panel ----

export const CEVIRI_BEKLENMEYEN_METIN = 'Dosya çevrilemedi: beklenmeyen bir hata oldu. Tekrar çevir; olmazsa sayfayı yenileyip dene.';

export interface OfisHataMetni { metin: string; tekrarCevir: boolean }

// The note under the panel; null: cancelled (Vazgeç / Esc / the reader closed), nothing is shown.
// tekrarCevir: "Tekrar çevir" can help (Drive / connection); too big, not allowed, no library: it can't.
export function ofisHataMetni(e: unknown): OfisHataMetni | null {
  if (e instanceof OfisIptal) return null;
  if (e instanceof OfisYuklenemedi && e.neden === 'izin') return { metin: e.message, tekrarCevir: false };   // a retry can't help
  if (e instanceof OfisCevrilemedi || e instanceof OfisYuklenemedi || e instanceof SessionExpired) return { metin: e.message, tekrarCevir: true };
  if ([OfisCokBuyuk, OfisDesteklenmiyor, DosyaYazmaYok, YerDisi, YetkiYok].some(c => e instanceof c)) {
    return { metin: (e as Error).message, tekrarCevir: false };
  }
  if (e instanceof TypeError) return { metin: new OfisYuklenemedi().message, tekrarCevir: true };   // fetch failed: no connection
  return { metin: CEVIRI_BEKLENMEYEN_METIN, tekrarCevir: true };
}
