import { boyutMetni, turMetni } from './dosyaEklemeMetin';
import { pdfAdi } from './dosyaHazirla';
import type { DosyaTuruSonucu } from './dosyaTuru';

// Task 5.10g: "Dosya ekle" with several images → one PDF (no DOM, so it can be tested).
// What the chosen files lead to, the default name, the panel's info line, the size text.
// Order / remove: tasi / cikar of fotoPanelDurumu.ts.

export const KARISIK_METIN = 'PDF\'i tek başına ekle. Görselleri ayrı seç.';
export const COK_PDF_METIN = 'PDF\'leri tek tek ekle.';

export interface SecilenDosya { ad: string; tur: DosyaTuruSonucu }

// tek: one non-image file, dosyaHazirla's way (PDF, or its own refusal); gorseller: the image list
export type SecimKarari = { tur: 'tek' } | { tur: 'gorseller' } | { tur: 'ret'; metin: string };

export function secimKarari(secilen: readonly SecilenDosya[]): SecimKarari {
  if (!secilen.length) return { tur: 'ret', metin: 'Dosya seçilmedi.' };
  if (secilen.every(s => s.tur.tur === 'gorsel')) return { tur: 'gorseller' };
  if (secilen.length === 1) return { tur: 'tek' };
  // several: an Office / unsupported one first (its own text says what to do), then the PDFs
  const kotu = secilen.find(s => turMetni(s.tur));
  if (kotu) return { tur: 'ret', metin: `${kotu.ad}: ${turMetni(kotu.tur)}` };
  return { tur: 'ret', metin: secilen.every(s => s.tur.tur === 'pdf') ? COK_PDF_METIN : KARISIK_METIN };
}

// Not changed by hand: the first image's name + .pdf (follows the order); changed: what was typed
export function listeAdi(ilkAd: string | undefined, girilen: string, elleDegisti: boolean): string {
  if (elleDegisti) return girilen;
  return ilkAd === undefined ? '' : pdfAdi(ilkAd);
}

export const listeBilgisi = (n: number): string => `Görsel → PDF · ${n} sayfa`;

// The limit is on the whole prepared PDF; within it: null
export function listeBoyutMetni(bayt: number): string | null {
  const m = boyutMetni(bayt);
  return m && `${m}. Birkaç görseli çıkar.`;
}
