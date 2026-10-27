import { t } from '../dil';
import type { DriveFile } from '../drive/drive';
import { AyniIsimVar, PdfDegil } from '../drive/pdfOlustur';
import { gercekOzet, MATERIAL_LABEL, type MaterialKind, type TopicMaterials } from '../okuma/konuKesfi';
import { BOS_DOSYA_METIN, boyutMetni } from './dosyaEklemeMetin';
import type { HazirKaynak } from './dosyaHazirla';
import type { DosyaTuruSonucu } from './dosyaTuru';
import { boyutYazi } from './fotoPanelDurumu';
import { kisaNeden } from './fotoEklemeMetin';
import { HedefOzetDegil } from './konuyaEkle';
import { DosyaBulunamadi, EkPdfYazilamaz, SayfaEklemeAgHatasi, SayfaEklemeCakisma } from './ozeteEkle';
import { PdfYazilamaz } from '../kalem/pdfNotlari';
import { AltKlasorAcilamadi, AltKlasorAdiFarkli, AltKlasorAgHatasi, AltKlasorIzinYok } from '../drive/altKlasorAc';
import {
  AdCozumGibi, AdGecersiz, cozumAdi, dosyaAdiHazirla, EklemeSuruyor, HedefBulunamadi, KlasorYok, OzetZatenVar, PdfHazirlanamadi,
  type DosyaHedefi
} from './konuyaDosyaEkle';

// Task 5.10e: the pure part of the "Dosya ekle" panel (no DOM, so it can be tested):
// which target can be chosen and why not, the name box, whether "Ekle" can be pressed, the texts.
// Uses what the reader already knows about the topic; the real checks stay in konuyaDosyaEkle.
// Task 6.S-3: the topic has a summary → "Özet" adds the file's pages at the END of it (ozetSonu, no name box);
// two summary files (brifing + sorular): the one on screen, else the one chosen in the panel.
// Task 6.EK-1: a summary addition shown as the summary (gercekOzet) is never a target: "Özet" makes a new ozet.pdf.

export type PanelHedef = 'uebungen' | 'oedevler' | 'cozum' | 'orijinal' | 'ozet';
export const PANEL_HEDEFLERI: readonly PanelHedef[] = ['uebungen', 'oedevler', 'cozum', 'orijinal', 'ozet'];
export const HEDEF_ETIKETI: Record<PanelHedef, string> = {
  get orijinal() { return MATERIAL_LABEL.orijinal; }, get ozet() { return MATERIAL_LABEL.ozet; },
  get uebungen() { return MATERIAL_LABEL.uebungen; }, get oedevler() { return MATERIAL_LABEL.oedevler; },
  get cozum() { return t('materyal.cozum'); }
};

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

export const KLASOR_ACILIR_METIN = (): string => t('dosya.klasorAcilir');

// Task 6.S-3: the "Özet" row when the topic has a summary (ad: the target file; not chosen yet: without it)
export const ozetSonuEtiketi = (ad: string | null): string => ad ? t('dosya.ozetSonuAdli', { ad }) : t('dosya.ozetSonu');

// Task 6.K6a: klasorAcabilir (validated Drive context): a missing Uebungen / Oedevler can be chosen, the folder is made with the
// first file (a note says so); locked: grey as before
// Task 6.S-3: ozetSonu: the summary file the pages would go to (ozetHedefi), only for the label
export function hedefSecenekleri(m: TopicMaterials, klasor: KlasorBilgisi | null, klasorAcabilir = false, ozetSonu: DriveFile | null = null): Secenek[] {
  const s = (hedef: PanelHedef, neden: string | null, not: string | null = null): Secenek =>
    ({ hedef, etiket: hedef === 'ozet' && gercekOzet(m).length ? ozetSonuEtiketi(ozetSonu?.name ?? null) : HEDEF_ETIKETI[hedef], secilebilir: !neden, neden: neden ?? not });
  // a folder with files in it exists; an empty list may mean "no folder" or "empty folder"
  const yok = (k: 'uebungen' | 'oedevler') => !m[k].length && klasor !== null && !klasor[k === 'uebungen' ? 'Uebungen' : 'Oedevler'];
  const alt = (k: 'uebungen' | 'oedevler') => !yok(k) ? s(k, null) : klasorAcabilir ? s(k, null, KLASOR_ACILIR_METIN()) : s(k, t('dosya.klasorYok'));
  return [
    alt('uebungen'),
    alt('oedevler'),
    s('cozum', cozumAdaylari(m).length ? null : t('dosya.cozumsuzYok')),
    s('orijinal', m.orijinal.length ? t('dosya.orijinalVar') : null),
    s('ozet', null),
  ];
}

// Task 6.S-3: which summary file the pages go to. One file → it; several (brifing + sorular) → the one on screen
// (odakDosyaId), else the one chosen in the panel (secilenId); none → null (the panel asks). No summary → null.
export function ozetHedefi(m: TopicMaterials, odakDosyaId: string | null, secilenId: string | null): DriveFile | null {
  const dosyalar = gercekOzet(m).map(x => x.file);
  if (dosyalar.length === 1) return dosyalar[0];
  return dosyalar.find(f => f.id === odakDosyaId) ?? dosyalar.find(f => f.id === secilenId) ?? null;
}

// The panel shows "Hangi özet dosyasının sonuna?" only when the reader's page doesn't decide it
export const ozetSecimiGerekli = (m: TopicMaterials, odakDosyaId: string | null): boolean =>
  gercekOzet(m).length > 1 && !gercekOzet(m).some(x => x.file.id === odakDosyaId);

// The open tab if it can be chosen, else the first one that can; none: null.
// Task 6.K6a: no tab open (a topic without materials) → Orijinal first.
export function varsayilanHedef(secenekler: readonly Secenek[], acikSekme: MaterialKind | null): PanelHedef | null {
  const ac = secenekler.find(x => x.hedef === (acikSekme ?? 'orijinal') && x.secilebilir);
  return (ac ?? secenekler.find(x => x.secilebilir))?.hedef ?? null;
}

export interface AdDurumu { duzenlenebilir: boolean; ad: string; hata: string | null; gizli?: boolean }   // gizli: no name box (6.S-3)

export const AYNI_AD_METIN = (): string => t('dosya.ayniAd');

// girilen: the name box (Übungen / Ödevler); cozumOf: the file chosen for "Çözüm"; ozetSonu: ozetHedefi (6.S-3)
export function adDurumu(m: TopicMaterials, hedef: PanelHedef, girilen: string, cozumOf: DriveFile | null, ozetSonu: DriveFile | null = null): AdDurumu {
  if (hedef === 'orijinal') return { duzenlenebilir: false, ad: 'orijinal.pdf', hata: null };
  // pages at the end of the summary: no new name (not chosen yet: no name, "Ekle" stays off)
  if (hedef === 'ozet' && gercekOzet(m).length) return { duzenlenebilir: false, gizli: true, ad: ozetSonu?.name ?? '', hata: null };
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
  return { duzenlenebilir: true, ad, hata: ayni ? AYNI_AD_METIN() : null };
}

export interface EkleGirdi {
  ornek: boolean;            // sample library: never writes
  secenek: Secenek | null;   // the chosen target
  ad: AdDurumu;
  ekleniyor: boolean;
  hataVar: boolean;          // the last try failed
  hazirDegil?: boolean;      // task 5.10g: no image yet, or images still being prepared
  yuzde?: number | null;     // task 6.S-3: the upload's progress (pages at the end of a summary)
}

export const ORNEK_METIN = (): string => t('ekleme.ornekTaslak');

export function ekleDurumu(g: EkleGirdi): { aktif: boolean; metin: string; aciklama: string | null } {
  const metin = g.ekleniyor ? (g.yuzde != null ? t('dosya.ekleniyorYuzde', { yuzde: g.yuzde }) : t('dosya.ekleniyor')) : g.hataVar ? t('genel.tekrarDene') : t('ekleme.ekle');
  if (g.ornek) return { aktif: false, metin, aciklama: ORNEK_METIN() };
  const aktif = !!g.secenek?.secilebilir && !!g.ad.ad && !g.ad.hata && !g.ekleniyor && !g.hazirDegil;
  return { aktif, metin, aciklama: null };
}

// What konuyaDosyaEkle takes; cozum without a chosen file: null.
// Task 6.S-3: ozet in a topic with a summary → { ozetSonu } (not chosen yet: null); without one: a new ozet.pdf
export function dosyaHedefi(hedef: PanelHedef, cozumOf: DriveFile | null, m?: TopicMaterials, ozetSonu: DriveFile | null = null): DosyaHedefi | null {
  if (hedef === 'ozet' && m && gercekOzet(m).length) return ozetSonu ? { ozetSonu } : null;
  if (hedef !== 'cozum') return hedef;
  return cozumOf ? { cozumOf } : null;
}

// The same target + name = the same adding: "Tekrar dene" keeps its islemId, a change gets a new one
// (6.S-3: pages at the end of a summary: the same file)
export const islemAnahtari = (hedef: PanelHedef, ad: string, cozumOf: DriveFile | null, ozetSonu: DriveFile | null = null): string =>
  `${hedef}|${hedef === 'cozum' ? cozumOf?.id ?? '' : hedef === 'ozet' && ozetSonu ? `sonu:${ozetSonu.id}` : key(ad)}`;

export const kaynakEtiketi = (k: HazirKaynak): string => k === 'pdf' ? 'PDF' : t('dosya.gorselPdf');

export const sayfaYazi = (n: number | null | undefined): string => n == null ? t('dosya.sayfaBilinmiyor') : t('genel.sayfaSayisi', { n });

// Task 6.S-3: n pages went at the end of the summary file ad
export const sonaEklendiMetni = (n: number, ad: string): string => t('dosya.sonaEklendi', { n, ad });

export function eklendiMetni(ad: string, uyari?: 'kalemYazamaz'): string {
  return uyari === 'kalemYazamaz' ? t('dosya.eklendiKalemYok', { ad }) : t('dosya.eklendi', { ad });
}

// konuyaDosyaEkle's own errors already say what to do; the others get the photo flow's short reason
export function hataMetni(e: unknown): string {
  const kendi = [AdGecersiz, AdCozumGibi, KlasorYok, OzetZatenVar, HedefBulunamadi, EklemeSuruyor, PdfHazirlanamadi, AyniIsimVar, PdfDegil,
    AltKlasorAdiFarkli, AltKlasorAcilamadi, AltKlasorAgHatasi, AltKlasorIzinYok,
    EkPdfYazilamaz, HedefOzetDegil, SayfaEklemeCakisma, SayfaEklemeAgHatasi, DosyaBulunamadi, PdfYazilamaz];   // 6.S-3: at the end of a summary
  if (kendi.some(c => e instanceof c)) return (e as Error).message;
  return t('dosya.eklenemedi', { neden: kisaNeden(e) });
}

// ---- task 6.1c: one Word / PowerPoint file → converted in the panel (no lock since 6.1e) ----

export type OfisCeviriAlt = 'word' | 'powerpoint';

// ofis: the panel opens at once and converts; hazirla: today's way (dosyaHazirla: PDF, image, or its own
// refusal, e.g. Keynote/Pages or Word in the sample library); ret: a toast.
export type TekDosyaYolu = { yol: 'ofis'; alt: OfisCeviriAlt } | { yol: 'hazirla' } | { yol: 'ret'; metin: string };

// drive: the Drive library is open (not the sample library). Empty / too big: checked first, as dosyaHazirla does.
export function tekDosyaYolu(tur: DosyaTuruSonucu, o: { drive: boolean; bayt: number }): TekDosyaYolu {
  if (tur.tur !== 'ofis' || !tur.cevrilebilir || !o.drive) return { yol: 'hazirla' };
  if (tur.alt !== 'word' && tur.alt !== 'powerpoint') return { yol: 'hazirla' };
  if (o.bayt === 0) return { yol: 'ret', metin: BOS_DOSYA_METIN() };
  const boyut = boyutMetni(o.bayt);
  if (boyut) return { yol: 'ret', metin: boyut };
  return { yol: 'ofis', alt: tur.alt };
}

export const OFIS_ETIKETI: Record<OfisCeviriAlt, string> = { word: 'Word → PDF', powerpoint: 'PowerPoint → PDF' };

export type CeviriDurumu = 'cevriliyor' | 'hazir' | 'hata';

// "ders-notu.docx · 123 KB · Word → PDF · Çevriliyor… 12 sn"; ready: "… · 3 sayfa"; error: "… · Çevrilemedi"
// sayfa (hazir): undefined = being counted, null = not readable
export function ofisBilgi(g: { ad: string; bayt: number; alt: OfisCeviriAlt; durum: CeviriDurumu; sn?: number; sayfa?: number | null }): string {
  const son = g.durum === 'cevriliyor' ? t('dosya.cevriliyor', { sn: g.sn ?? 0 })
    : g.durum === 'hata' ? t('dosya.cevrilemedi')
    : g.sayfa === undefined ? t('dosya.sayfaSayiliyor') : sayfaYazi(g.sayfa);
  return [g.ad, boyutYazi(g.bayt), OFIS_ETIKETI[g.alt], son].join(' · ');
}
