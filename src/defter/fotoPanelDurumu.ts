import type { DriveFile } from '../drive/drive';
import { OZET_ADI, ozetKarari } from './konuyaEkle';

// Task 5.8a: the pure part of the "Fotoğraf ekle" panel (no DOM, so it can be tested):
// order of the photos, which file the pages would go to, whether "Ekle" can be pressed.
// The target uses the files the reader already knows; no Drive request.

// Move item i one place left (-1) or right (+1). At the edge: the same order (a new array).
export function tasi<T>(liste: readonly T[], i: number, yon: -1 | 1): T[] {
  const out = [...liste];
  const j = i + yon;
  if (i < 0 || i >= out.length || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function cikar<T>(liste: readonly T[], i: number): T[] {
  return liste.filter((_, k) => k !== i);
}

export interface HedefGirdi {
  ozetDosyalari: readonly (DriveFile & { trashed?: boolean })[];   // the topic's summary files as the reader knows them
  acikDosyaId?: string | null;    // the file of the page on screen (only when the Özet tab is open)
  seciliId?: string | null;       // chosen in the panel (several summaries)
  sayfaSayisi: (fileId: string) => number | undefined;   // pages of that file, when the reader knows it
  yeniSayfa: number;              // photos in the panel
}

export interface Hedef {
  tur: 'yok' | 'tek' | 'secim';   // no summary: new ozet.pdf; one summary; several (brifing + sorular)
  dosyalar: DriveFile[];          // the summary files (empty for 'yok')
  hedef: DriveFile | null;        // where the pages go (null: a new ozet.pdf)
  eskiSayfa: number | undefined;  // pages of the target now (0 for a new file; undefined: not known)
  metin: string;
}

export function hedefHesapla(g: HedefGirdi): Hedef {
  const { durum, dosyalar } = ozetKarari(g.ozetDosyalari);
  const n = g.yeniSayfa;
  const kac = (k: number) => `${k} sayfa`;
  if (durum === 'yok') {
    const metin = n ? `Bu konuda özet yok: yeni ${OZET_ADI} oluşturulacak (${kac(n)})` : `Bu konuda özet yok: fotoğraflardan yeni ${OZET_ADI} oluşturulacak`;
    return { tur: 'yok', dosyalar: [], hedef: null, eskiSayfa: 0, metin };
  }
  const bul = (id?: string | null) => id ? dosyalar.find(f => f.id === id) : undefined;
  const hedef = dosyalar.length === 1 ? dosyalar[0] : bul(g.seciliId) ?? bul(g.acikDosyaId) ?? dosyalar[0];
  const eski = g.sayfaSayisi(hedef.id);
  const metin = !n ? `${hedef.name} dosyasının sonuna eklenecek`
    : eski === undefined ? `${hedef.name} dosyasının sonuna eklenecek (${kac(n)})`
    : `${hedef.name} dosyasının sonuna eklenecek: ${eski} → ${eski + n} sayfa`;
  return { tur: dosyalar.length === 1 ? 'tek' : 'secim', dosyalar, hedef, eskiSayfa: eski, metin };
}

export interface EkleDurumGirdi {
  ornek: boolean;          // sample library: never writes
  hazirSayisi: number;     // prepared photos
  hazirlaniyor: boolean;   // photos are still being prepared
}

export function ekleDurumu(g: EkleDurumGirdi): { aktif: boolean; aciklama: string | null } {
  if (g.ornek) return { aktif: false, aciklama: 'Örnek kitaplıkta Drive\'a ekleme yok. Bu sadece taslağın görünümü.' };
  return { aktif: g.hazirSayisi > 0 && !g.hazirlaniyor, aciklama: null };
}

// "412 KB", "1,2 MB" (Turkish decimal comma)
export function boyutYazi(bayt: number): string {
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  return `${(bayt / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
