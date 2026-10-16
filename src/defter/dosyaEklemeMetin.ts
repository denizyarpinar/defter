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
