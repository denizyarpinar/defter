import type { DriveFile } from '../drive/drive';
import type { BekleyenJpeg } from './bekleyenFotoKayit';
import { OZET_ADI, ozetKarari } from './konuyaEkle';
import { t } from '../dil';
import { boyut } from '../dil/bicim';

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
  if (durum === 'yok') {
    const metin = n ? t('foto.hedef.yeniSayfali', { ad: OZET_ADI, n }) : t('foto.hedef.yeni', { ad: OZET_ADI });
    return { tur: 'yok', dosyalar: [], hedef: null, eskiSayfa: 0, metin };
  }
  const bul = (id?: string | null) => id ? dosyalar.find(f => f.id === id) : undefined;
  const hedef = dosyalar.length === 1 ? dosyalar[0] : bul(g.seciliId) ?? bul(g.acikDosyaId) ?? dosyalar[0];
  const eski = g.sayfaSayisi(hedef.id);
  const metin = !n ? t('foto.hedef.sona', { ad: hedef.name })
    : eski === undefined ? t('foto.hedef.sonaSayfali', { ad: hedef.name, n })
    : t('foto.hedef.sonaEskiYeni', { ad: hedef.name, eski, n: eski + n });
  return { tur: dosyalar.length === 1 ? 'tek' : 'secim', dosyalar, hedef, eskiSayfa: eski, metin };
}

export interface EkleDurumGirdi {
  ornek: boolean;          // sample library: never writes
  hazirSayisi: number;     // prepared photos
  hazirlaniyor: boolean;   // photos are still being prepared
}

export function ekleDurumu(g: EkleDurumGirdi): { aktif: boolean; aciklama: string | null } {
  if (g.ornek) return { aktif: false, aciklama: t('ekleme.ornekTaslak') };
  return { aktif: g.hazirSayisi > 0 && !g.hazirlaniyor, aciklama: null };
}

// "412 KB", "1,2 MB" (tr) / "1.2 MB" (en): bicim.ts
export const boyutYazi = (bayt: number): string => boyut(bayt);

// Task 6.2c: the thumbnail's "Renk düzelt" toggle (no: the photo's number in the panel)
export function renkEtiketi(acik: boolean, no: number): string {
  return t(acik ? 'foto.renkAcik' : 'foto.renkKapali', { no });
}

// Task 6.4c-2: "Temiz yazıya çevir" per photo; off by default (reading costs money: only when asked)
export const TEMIZ_YAZI_VARSAYILAN = false;

export function temizEtiketi(acik: boolean, no: number): string {
  return t(acik ? 'foto.temizAcik' : 'foto.temizKapali', { no });
}

// The flag goes into the record only when on (records stay as before when the trial is off)
export function temizYaziIsareti(j: BekleyenJpeg, acik: boolean): BekleyenJpeg {
  return acik ? { ...j, temizYazi: true } : j;
}
