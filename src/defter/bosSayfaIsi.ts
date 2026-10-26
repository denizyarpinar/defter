import { t } from '../dil';
import type { Delta, KurdeleHedefi } from '../kitap/sayfaKaydir';
import type { Desen, Yon } from './bosSayfa';
import type { GeriAlIstek, YapistirIstek } from './yapistir';
import type { EklenenSayfalar } from './ozeteEkle';

// Task 6.S-4: one blank page in / out as one job, in this order (CLAUDE.md → 6.S-4):
//   1. the PDF (ozeteSayfaEkle → the pen's queue → ekleVeYukle: tries, conflict, backup, progress)
//   2. kitap.json: the ribbons pointing into this PDF follow (sayfaKaydir.ts)
//   3. .ocr.json: its page numbers follow (only when there is one; never created)
// The job goes to the device only once the PDF step worked (before that nothing changed in Drive, or a retry with
// the same islemId finds the page: no double page). Each later step is marked done when it worked; a job with
// steps left is run again (Tekrar dene, back online, the reader opening) and never does a done step twice.
// A PDF step that fails is not stored: the user decides ("Tekrar dene" in the toast, same islemId).
// Task 6.S-4c: "Deftere yapıştır" and its undo are jobs too, but only the PDF step: the page count stays, so the
// ribbons and the reading record don't move (their steps start done).
// Task 6.S-4d: any page out ('sil', delta −1) and back with "Geri al" ('geriKoy', delta +1, the removal's islemId).
// The deleted page's ribbons and reading entries are kept for the undo (sayfaKaydir.ts: ocrSil / ocrGeriKoy,
// silinenKurdeleler / kurdeleGeriKoy); the backup itself is on the device (okuma/silinenSayfaDepo.ts).
// 'kaldir' (6.S-4's blank page) is no longer started: only jobs left on a device finish their steps.

export interface SayfaIsi {
  tur: 'ekle' | 'kaldir' | 'yapistir' | 'yapistirGeriAl' | 'sil' | 'geriKoy';
  islemId: string;          // ekle: the new page's id; kaldir: the blank page's id (its /DefterBosSayfa); yapistir(GeriAl): the paste's
  fileId: string;
  dosyaAdi: string;         // the ribbons' `dosya`
  klasorId: string | null;  // the PDF's folder (the reading record is next to it); null: asked when needed
  kitapId: string;
  konu: string;             // the topic's key (topicKey) in kitap.json
  ekle?: { komsu: number; yon: Yon; desen: Desen; komsuIzi?: string };
  kaldir?: { indeks: number; iz?: string };   // iz: the blank page's fingerprint (its reading entry goes)
  yapistir?: Omit<YapistirIstek, 'islemId'>;
  yapistirGeriAl?: Omit<GeriAlIstek, 'islemId'>;
  sil?: { indeks: number; iz?: string; taraf?: 'sol' | 'sag' };   // 6.S-4d: the page (in the reader's version), its fingerprint, its side (book mode)
  geriKoy?: { indeks: number; komsuIz?: string; komsuYon: 'once' | 'sonra' };   // 6.S-4d: where it was; the bytes: the device's backup
  ayniIzVar?: boolean;      // 6.S-4d sil: another page has its fingerprint (known after the PDF step)
  sonaEklendi?: boolean;    // 6.S-4d geriKoy: its place wasn't found, it went to the end
  indeks?: number;          // where the page went in / came out, known after the PDF step
  adimlar: { pdf: boolean; kitapJson: boolean; ocr: boolean };
  zaman: string;            // ISO, when the job started
}

export const isAnahtari = (is: Pick<SayfaIsi, 'tur' | 'islemId'>) => `${is.tur}:${is.islemId}`;
export const isDeltasi = (is: Pick<SayfaIsi, 'tur'>): Delta => is.tur === 'ekle' || is.tur === 'geriKoy' ? 1 : -1;

export function yeniEklemeIsi(o: Omit<SayfaIsi, 'tur' | 'adimlar' | 'zaman' | 'kaldir' | 'indeks'> & { ekle: NonNullable<SayfaIsi['ekle']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'ekle', adimlar: { pdf: false, kitapJson: false, ocr: false }, zaman: simdi.toISOString() };
}

export function yeniKaldirmaIsi(o: Omit<SayfaIsi, 'tur' | 'adimlar' | 'zaman' | 'ekle' | 'indeks'> & { kaldir: NonNullable<SayfaIsi['kaldir']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'kaldir', adimlar: { pdf: false, kitapJson: false, ocr: false }, zaman: simdi.toISOString() };
}

type YapistirmaGirdisi = Omit<SayfaIsi, 'tur' | 'adimlar' | 'zaman' | 'ekle' | 'kaldir' | 'indeks' | 'yapistir' | 'yapistirGeriAl'>;
const sadecePdf = () => ({ pdf: false, kitapJson: true, ocr: true });

export function yeniYapistirmaIsi(o: YapistirmaGirdisi & { yapistir: NonNullable<SayfaIsi['yapistir']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'yapistir', adimlar: sadecePdf(), zaman: simdi.toISOString() };
}

export function yeniGeriAlIsi(o: YapistirmaGirdisi & { yapistirGeriAl: NonNullable<SayfaIsi['yapistirGeriAl']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'yapistirGeriAl', adimlar: sadecePdf(), zaman: simdi.toISOString() };
}

type IsGirdisi = Omit<SayfaIsi, 'tur' | 'adimlar' | 'zaman' | 'ekle' | 'kaldir' | 'indeks' | 'yapistir' | 'yapistirGeriAl' | 'sil' | 'geriKoy' | 'ayniIzVar' | 'sonaEklendi'>;
const hepsi = () => ({ pdf: false, kitapJson: false, ocr: false });

export function yeniSilmeIsi(o: IsGirdisi & { sil: NonNullable<SayfaIsi['sil']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'sil', adimlar: hepsi(), zaman: simdi.toISOString() };
}

export function yeniGeriKoymaIsi(o: IsGirdisi & { geriKoy: NonNullable<SayfaIsi['geriKoy']> }, simdi = new Date()): SayfaIsi {
  return { ...o, tur: 'geriKoy', adimlar: hepsi(), zaman: simdi.toISOString() };
}

export interface SayfaIsiOrtami {
  pdf(is: SayfaIsi): Promise<EklenenSayfalar>;
  kitapJson(is: SayfaIsi, h: KurdeleHedefi): Promise<void>;
  ocr(is: SayfaIsi, indeks: number, delta: Delta): Promise<void>;
  kaydet(is: SayfaIsi): Promise<void>;   // the device's job store
  sil(is: SayfaIsi): Promise<void>;
}

// The file still has strokes not in Drive (an upload failed): their page numbers would point at the wrong pages
export class KalemKaydiBekliyor extends Error {
  constructor() { super(t('sayfaIsi.kalemBekliyor')); }
}

export class SayfaIsiYarim extends Error {
  constructor(readonly adim: 'kitapJson' | 'ocr', readonly asil: unknown) {
    super(t(adim === 'kitapJson' ? 'sayfaIsi.yarimKurdele' : 'sayfaIsi.yarimOcr'));
  }
}

export interface SayfaIsiSonucu { indeks: number; pdf: EklenenSayfalar | null }

// Runs the steps left (in place on `is`). The PDF step's error is thrown as it is; a later step's as SayfaIsiYarim
// (the job stays on the device).
export async function sayfaIsiCalistir(is: SayfaIsi, o: SayfaIsiOrtami): Promise<SayfaIsiSonucu> {
  let pdf: EklenenSayfalar | null = null;
  if (!is.adimlar.pdf) {
    pdf = await o.pdf(is);
    // removed already by an earlier try whose answer was lost: the index the user saw
    is.indeks = pdf.indeks ?? is.kaldir?.indeks ?? is.sil?.indeks ?? is.yapistirGeriAl?.indeks
      ?? (Array.isArray(is.yapistir?.indeksler) ? is.yapistir.indeksler[0] : undefined);
    if (is.indeks === undefined) throw new Error(t('sayfaIsi.yerBilinmiyor'));
    if (pdf.ayniIzVar !== undefined) is.ayniIzVar = pdf.ayniIzVar;
    if (pdf.sonaEklendi !== undefined) is.sonaEklendi = pdf.sonaEklendi;
    is.adimlar.pdf = true;
    await o.kaydet(is).catch(e => console.warn('Sayfa işi cihaza yazılamadı.', e));
  }
  const indeks = is.indeks!;
  const delta = isDeltasi(is);
  for (const adim of ['kitapJson', 'ocr'] as const) {
    if (is.adimlar[adim]) continue;
    try {
      if (adim === 'kitapJson') await o.kitapJson(is, { konu: is.konu, dosya: is.dosyaAdi, indeks, delta });
      else await o.ocr(is, indeks, delta);
    } catch (e) {
      throw new SayfaIsiYarim(adim, e);
    }
    is.adimlar[adim] = true;
    await o.kaydet(is).catch(e => console.warn('Sayfa işi cihaza yazılamadı.', e));
  }
  await o.sil(is).catch(e => console.warn('Sayfa işi cihazdan silinemedi.', e));
  return { indeks, pdf };
}
