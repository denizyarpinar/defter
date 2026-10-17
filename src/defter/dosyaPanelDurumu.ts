import type { DriveFile } from '../drive/drive';
import { AyniIsimVar, PdfDegil } from '../drive/pdfOlustur';
import { MATERIAL_LABEL, type MaterialKind, type TopicMaterials } from '../okuma/konuKesfi';
import { BOS_DOSYA_METIN, boyutMetni } from './dosyaEklemeMetin';
import type { HazirKaynak } from './dosyaHazirla';
import type { DosyaTuruSonucu } from './dosyaTuru';
import { boyutYazi } from './fotoPanelDurumu';
import { kisaNeden } from './fotoEklemeMetin';
import {
  AdCozumGibi, AdGecersiz, cozumAdi, dosyaAdiHazirla, EklemeSuruyor, HedefBulunamadi, KlasorYok, OzetZatenVar, PdfHazirlanamadi,
  type DosyaHedefi
} from './konuyaDosyaEkle';

// Task 5.10e: the pure part of the "Dosya ekle" panel (no DOM, so it can be tested):
// which target can be chosen and why not, the name box, whether "Ekle" can be pressed, the texts.
// Uses what the reader already knows about the topic; the real checks stay in konuyaDosyaEkle.

export type PanelHedef = 'uebungen' | 'oedevler' | 'cozum' | 'orijinal' | 'ozet';
export const PANEL_HEDEFLERI: readonly PanelHedef[] = ['uebungen', 'oedevler', 'cozum', 'orijinal', 'ozet'];
export const HEDEF_ETIKETI: Record<PanelHedef, string> = { ...MATERIAL_LABEL, cozum: 'Çözüm' };

// Does the topic folder have Uebungen / Oedevler? null: not known (yet, or the listing failed)
export interface KlasorBilgisi { Uebungen: boolean; Oedevler: boolean }

export interface Secenek { hedef: PanelHedef; etiket: string; secilebilir: boolean; neden: string | null }

export interface CozumAdayi { file: DriveFile; etiket: string }

const key = (name: string) => name.trim().toLowerCase();   // as konuKesfi.ts

// Übungen / Ödevler files without a solution, in the reader's order
export function cozumAdaylari(m: TopicMaterials): CozumAdayi[] {
  return (['uebungen', 'oedevler'] as const).flatMap(k =>
    m[k].filter(x => !x.cozum).map(x => ({ file: x.file, etiket: `${MATERIAL_LABEL[k]} · ${x.file.name.replace(/\.pdf$/i, '')}` })));
}

export function hedefSecenekleri(m: TopicMaterials, klasor: KlasorBilgisi | null): Secenek[] {
  const s = (hedef: PanelHedef, neden: string | null): Secenek => ({ hedef, etiket: HEDEF_ETIKETI[hedef], secilebilir: !neden, neden });
  // a folder with files in it exists; an empty list may mean "no folder" or "empty folder"
  const klasorYok = (k: 'uebungen' | 'oedevler') =>
    !m[k].length && klasor !== null && !klasor[k === 'uebungen' ? 'Uebungen' : 'Oedevler'] ? '(klasör yok)' : null;
  return [
    s('uebungen', klasorYok('uebungen')),
    s('oedevler', klasorYok('oedevler')),
    s('cozum', cozumAdaylari(m).length ? null : 'Çözümü olmayan dosya yok'),
    s('orijinal', m.orijinal.length ? 'Bu konuda orijinal var' : null),
    s('ozet', m.ozet.length ? 'Bu konuda özet var' : null),
  ];
}

// The open tab if it can be chosen, else the first one that can; none: null
export function varsayilanHedef(secenekler: readonly Secenek[], acikSekme: MaterialKind | null): PanelHedef | null {
  const ac = secenekler.find(x => x.hedef === acikSekme && x.secilebilir);
  return (ac ?? secenekler.find(x => x.secilebilir))?.hedef ?? null;
}

export interface AdDurumu { duzenlenebilir: boolean; ad: string; hata: string | null }

export const AYNI_AD_METIN = 'Bu adda dosya var, adı değiştir';

// girilen: the name box (Übungen / Ödevler); cozumOf: the file chosen for "Çözüm"
export function adDurumu(m: TopicMaterials, hedef: PanelHedef, girilen: string, cozumOf: DriveFile | null): AdDurumu {
  if (hedef === 'orijinal') return { duzenlenebilir: false, ad: 'orijinal.pdf', hata: null };
  if (hedef === 'ozet') return { duzenlenebilir: false, ad: 'ozet.pdf', hata: null };
  if (hedef === 'cozum') return { duzenlenebilir: false, ad: cozumOf ? cozumAdi(cozumOf) : '', hata: null };
  let ad: string;
  try {
    ad = dosyaAdiHazirla(girilen);
  } catch (e) {
    if (e instanceof AdGecersiz) return { duzenlenebilir: true, ad: '', hata: e.message };
    throw e;
  }
  if (key(ad).endsWith('_cozum.pdf')) return { duzenlenebilir: true, ad, hata: new AdCozumGibi(ad).message };
  const ayni = m[hedef].some(x => [x.file, x.cozum].some(f => f && key(f.name) === key(ad)));
  return { duzenlenebilir: true, ad, hata: ayni ? AYNI_AD_METIN : null };
}

export interface EkleGirdi {
  ornek: boolean;            // sample library: never writes
  secenek: Secenek | null;   // the chosen target
  ad: AdDurumu;
  ekleniyor: boolean;
  hataVar: boolean;          // the last try failed
  hazirDegil?: boolean;      // task 5.10g: no image yet, or images still being prepared
}

export const ORNEK_METIN = 'Örnek kitaplıkta Drive\'a ekleme yok. Bu sadece taslağın görünümü.';

export function ekleDurumu(g: EkleGirdi): { aktif: boolean; metin: string; aciklama: string | null } {
  const metin = g.ekleniyor ? 'Ekleniyor…' : g.hataVar ? 'Tekrar dene' : 'Ekle';
  if (g.ornek) return { aktif: false, metin, aciklama: ORNEK_METIN };
  const aktif = !!g.secenek?.secilebilir && !!g.ad.ad && !g.ad.hata && !g.ekleniyor && !g.hazirDegil;
  return { aktif, metin, aciklama: null };
}

// What konuyaDosyaEkle takes; cozum without a chosen file: null
export function dosyaHedefi(hedef: PanelHedef, cozumOf: DriveFile | null): DosyaHedefi | null {
  if (hedef !== 'cozum') return hedef;
  return cozumOf ? { cozumOf } : null;
}

// The same target + name = the same adding: "Tekrar dene" keeps its islemId, a change gets a new one
export const islemAnahtari = (hedef: PanelHedef, ad: string, cozumOf: DriveFile | null): string =>
  `${hedef}|${hedef === 'cozum' ? cozumOf?.id ?? '' : key(ad)}`;

export const kaynakEtiketi = (k: HazirKaynak): string => k === 'pdf' ? 'PDF' : 'Görsel → PDF';

export const sayfaYazi = (n: number | null | undefined): string => n == null ? '? sayfa' : `${n} sayfa`;

export function eklendiMetni(ad: string, uyari?: 'kalemYazamaz'): string {
  return uyari === 'kalemYazamaz' ? `Eklendi: ${ad} · Kalem bu dosyaya çizim yazamaz (şifreli ya da imzalı PDF).` : `Eklendi: ${ad}`;
}

// konuyaDosyaEkle's own errors already say what to do; the others get the photo flow's short reason
export function hataMetni(e: unknown): string {
  const kendi = [AdGecersiz, AdCozumGibi, KlasorYok, OzetZatenVar, HedefBulunamadi, EklemeSuruyor, PdfHazirlanamadi, AyniIsimVar, PdfDegil];
  if (kendi.some(c => e instanceof c)) return (e as Error).message;
  return `Dosya eklenemedi: ${kisaNeden(e)}.`;
}

// ---- task 6.1c: one Word / PowerPoint file → converted in the panel (lock ?ofisCevir=1) ----

export type OfisCeviriAlt = 'word' | 'powerpoint';

// ofis: the panel opens at once and converts; hazirla: today's way (dosyaHazirla: PDF, image, or its own
// refusal, e.g. Keynote/Pages or Word with the lock closed); ret: a toast.
export type TekDosyaYolu = { yol: 'ofis'; alt: OfisCeviriAlt } | { yol: 'hazirla' } | { yol: 'ret'; metin: string };

// drive: the Drive library is open (not the sample library). Empty / too big: checked first, as dosyaHazirla does.
export function tekDosyaYolu(tur: DosyaTuruSonucu, o: { kilitAcik: boolean; drive: boolean; bayt: number }): TekDosyaYolu {
  if (tur.tur !== 'ofis' || !tur.cevrilebilir || !o.kilitAcik || !o.drive) return { yol: 'hazirla' };
  if (tur.alt !== 'word' && tur.alt !== 'powerpoint') return { yol: 'hazirla' };
  if (o.bayt === 0) return { yol: 'ret', metin: BOS_DOSYA_METIN };
  const boyut = boyutMetni(o.bayt);
  if (boyut) return { yol: 'ret', metin: boyut };
  return { yol: 'ofis', alt: tur.alt };
}

export const OFIS_ETIKETI: Record<OfisCeviriAlt, string> = { word: 'Word → PDF', powerpoint: 'PowerPoint → PDF' };

export type CeviriDurumu = 'cevriliyor' | 'hazir' | 'hata';

// "ders-notu.docx · 123 KB · Word → PDF · Çevriliyor… 12 sn"; ready: "… · 3 sayfa"; error: "… · Çevrilemedi"
// sayfa (hazir): undefined = being counted, null = not readable
export function ofisBilgi(g: { ad: string; bayt: number; alt: OfisCeviriAlt; durum: CeviriDurumu; sn?: number; sayfa?: number | null }): string {
  const son = g.durum === 'cevriliyor' ? `Çevriliyor… ${g.sn ?? 0} sn`
    : g.durum === 'hata' ? 'Çevrilemedi'
    : g.sayfa === undefined ? 'sayfa sayılıyor…' : sayfaYazi(g.sayfa);
  return [g.ad, boyutYazi(g.bayt), OFIS_ETIKETI[g.alt], son].join(' · ');
}
