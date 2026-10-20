import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { AyniIsimVar, createPdf, DosyaYazmaYok, PdfDegil, type CreatePdfSecenek, type PdfOlusturDrive } from '../drive/pdfOlustur';
import { PdfSampleNoWrite } from '../drive/pdfYazici';
import { PdfYazilamaz, SAVE_OPTIONS, yazilabilirAc } from '../kalem/pdfNotlari';
import { isSampleId } from '../okuma/ornekKaynak';
import { dosyaTuru, ILK_BAYT_SAYISI } from './dosyaTuru';
import { ozetKarari } from './konuyaEkle';
import { mb, olc, zamanliDrive, type Olcum } from './sureOlcum';

// Task 5.10c: "Dosya ekle" without UI: a ready PDF into the right place of one topic (CLAUDE.md → Faz 5 → Yeni dosya).
// - orijinal → orijinal.pdf in the topic folder; ozet → ozet.pdf there (only if the topic has no summary at all)
// - uebungen / oedevler → Uebungen/<ad>, Oedevler/<ad>; { cozumOf: X } → <X>_cozum.pdf next to X
// - Same name → AyniIsimVar (createPdf checks it): nothing written over, nothing renamed.
// - Task 6.K6a: a missing Uebungen / Oedevler is made by o.altKlasorAc (drive/altKlasorAc.ts, only with ?kurulum=1)
//   before the file; without it (locked) → KlasorYok, no folder created.
// - The bytes go as they are. Only a PDF with bytes before %PDF- is saved again with pdf-lib (a clean file).
//   Encrypted / signed / unreadable PDFs are added, but the pen can't write them later: uyari 'kalemYazamaz'.
// - islemId goes into appProperties.defterIslem: a later try with the same id that finds "its" file counts as done.

export type DosyaHedefi = 'orijinal' | 'ozet' | 'uebungen' | 'oedevler' | { cozumOf: DriveFile };
export type AltKlasor = 'Uebungen' | 'Oedevler';

const key = (name: string) => name.trim().toLowerCase();   // as konuKesfi.ts
const COZUM = '_cozum.pdf';

// ---- errors (Turkish, say what to do) ----

export class AdGecersiz extends Error {
  constructor() { super('Dosya adı boş. Dosyaya bir ad verip tekrar dene.'); }
}

export class AdCozumGibi extends Error {
  constructor(ad: string) { super(`"${ad}" adı _cozum ile bitiyor; böyle bir dosya çözüm sayılır ve listede görünmez. Çözüm eklemek için "Çözüm ekle"yi seç ya da adı değiştir.`); }
}

export class KlasorYok extends Error {
  readonly klasor: AltKlasor;
  constructor(klasor: AltKlasor) {
    super(`Bu konuda ${klasor} klasörü yok, dosya eklenmedi. Klasörü Drive'da konunun içinde oluşturup tekrar dene.`);
    this.klasor = klasor;
  }
}

export class OzetZatenVar extends Error {
  constructor(dosyalar: readonly DriveFile[]) {
    super(`Bu konunun zaten bir özeti var (${dosyalar.map(f => f.name).join(', ')}); yeni ozet.pdf eklenmedi. Özete sayfa eklemek için fotoğraf eklemeyi kullan.`);
  }
}

export class HedefBulunamadi extends Error {
  constructor(ad: string) { super(`"${ad}" bu konuda bulunamadı, çözümü eklenmedi. Konuyu yeniden açıp tekrar dene.`); }
}

export class EklemeSuruyor extends Error {
  constructor() { super('Bu dosya şu an ekleniyor, bitmesini bekle.'); }
}

export class PdfHazirlanamadi extends Error {
  constructor() { super('Bu PDF\'in başında fazladan veri var ve şifreli, imzalı ya da bozuk olduğu için düzeltilemiyor. Dosyayı bir PDF programında yeniden kaydedip tekrar dene.'); }
}

// ---- pure: the name ----

// Control characters, / and \ out; spaces trimmed; .pdf added if missing (any case). Empty → AdGecersiz.
export function dosyaAdiHazirla(ad: string): string {
  let temiz = ad.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim();
  if (!/\.pdf$/i.test(temiz)) temiz += '.pdf';
  if (!temiz.slice(0, -4).trim()) throw new AdGecersiz();
  return temiz;
}

// ---- pure: where it goes ----

// Uebungen / Oedevler missing and no folder may be made (locked, task 6.K6a): an error, nothing written
export function altKlasorYok(klasor: AltKlasor): never {
  throw new KlasorYok(klasor);
}

export const altKlasorBul = (kok: readonly DriveFile[], klasor: AltKlasor) =>
  kok.find(f => f.mimeType === FOLDER_MIME && key(f.name) === key(klasor));

export type HedefYeri = { klasor: 'kok'; ad: string } | { klasor: AltKlasor; ad: string };

// kok: the topic folder's children. Fixed names for orijinal / ozet; ad (already prepared) for the subfolders.
// The solution's place needs the subfolder listings: see konuyaDosyaEkle.
export function hedefYeri(hedef: Exclude<DosyaHedefi, { cozumOf: DriveFile }>, ad: string, kok: readonly DriveFile[]): HedefYeri {
  if (hedef === 'orijinal') return { klasor: 'kok', ad: 'orijinal.pdf' };
  if (hedef === 'ozet') {
    // ozet.pdf there: the same-name path (AyniIsimVar, or our own earlier try); brifing / sorular: no new ozet.pdf
    const ozet = ozetKarari(kok);
    if (ozet.durum === 'var' && !ozet.dosyalar.some(f => key(f.name) === 'ozet.pdf')) throw new OzetZatenVar(ozet.dosyalar);
    return { klasor: 'kok', ad: 'ozet.pdf' };
  }
  if (key(ad).endsWith(COZUM)) throw new AdCozumGibi(ad);
  return { klasor: hedef === 'uebungen' ? 'Uebungen' : 'Oedevler', ad };
}

export const cozumAdi = (x: DriveFile) => x.name.trim().slice(0, -'.pdf'.length) + COZUM;

// ---- the bytes ----

export interface HazirPdf { bytes: Uint8Array; uyari?: 'kalemYazamaz' }

export async function pdfHazirla(ad: string, bytes: Uint8Array): Promise<HazirPdf> {
  const tur = dosyaTuru(ad, '', bytes.subarray(0, ILK_BAYT_SAYISI));
  if (tur.tur !== 'pdf') throw new PdfDegil('seçilen dosya bir PDF değil');
  if (tur.alt === 'onEkli') {
    let doc;
    try { ({ doc } = await yazilabilirAc(bytes)); } catch (e) { throw e instanceof PdfYazilamaz ? new PdfHazirlanamadi() : e; }
    return { bytes: await doc.save(SAVE_OPTIONS) };
  }
  // the pen's own check (encrypted, signed, unreadable): added anyway, but with a warning
  try {
    await yazilabilirAc(bytes);
    return { bytes };
  } catch (e) {
    if (e instanceof PdfYazilamaz) return { bytes, uyari: 'kalemYazamaz' };
    throw e;
  }
}

// ---- the entry point ----

export interface DosyaEklemeOrtami {
  yer: DriveLocation | null;                          // main.ts: writer() ? driveLoc : null
  olusturDrive: PdfOlusturDrive;
  liste?(parentId: string): Promise<DriveFile[]>;   // default: listChildren
  yeniDosya?(f: { id: string; modifiedTime: string; bytes: Uint8Array }): void | Promise<void>;
  konuDegisti?(): void;
  // task 6.K6a: makes the missing subfolder (or finds it) and gives its id; missing → KlasorYok
  altKlasorAc?(konuId: string, klasor: AltKlasor, islemId: string): Promise<string>;
}

export interface DosyaEkleIstek {
  konu: string;           // the topic folder's id
  hedef: DosyaHedefi;
  ad: string;             // the chosen file's name (orijinal / ozet / solution: not used)
  bytes: Uint8Array;
  islemId: string;
}

export interface DosyaEklendi {
  kind: 'yeni' | 'zatenVardi';   // zatenVardi: an earlier try with this islemId had created it
  fileId: string;
  ad: string;
  bytes: Uint8Array;             // what is in Drive (the clean file for a PDF with bytes before %PDF-)
  uyari?: 'kalemYazamaz';
}

// secenek.olcum: task 6.2e-1, only with ?olcum=1 (each step and Drive request timed); never passed to createPdf
export type DosyaEkleSecenek = Omit<CreatePdfSecenek, 'defterIslem'> & { olcum?: Olcum };

export async function konuyaDosyaEkle(
  istek: DosyaEkleIstek, o: DosyaEklemeOrtami, secenek: DosyaEkleSecenek = {}
): Promise<DosyaEklendi> {
  const { konu, hedef } = istek;
  // checks without any request
  if (isSampleId(konu) || (typeof hedef === 'object' && isSampleId(hedef.cozumOf.id))) throw new PdfSampleNoWrite();
  const yer = o.yer;
  if (!yer) throw new DosyaYazmaYok();
  // the name first: a wrong one costs no request
  const altAd = hedef === 'uebungen' || hedef === 'oedevler' ? dosyaAdiHazirla(istek.ad) : '';
  if (key(altAd).endsWith(COZUM)) throw new AdCozumGibi(altAd);

  // one adding per target at a time (5.10c-ek): the same-name check of two calls could both see "no file"
  const kilit = kilitAnahtari(konu, hedef, altAd);
  if (surenler.has(kilit)) throw new EklemeSuruyor();
  surenler.add(kilit);
  try {
    return await ekle(istek, { ...o, yer }, secenek, altAd);
  } finally {
    surenler.delete(kilit);
  }
}

// ---- the lock (this tab only: two tabs or devices can still race, Drive has no lock on names) ----

const surenler = new Set<string>();

// Known without any request: one topic has one Uebungen / Oedevler folder and X has one solution name,
// so this means the same as "target folder id + name".
export function kilitAnahtari(konu: string, hedef: DosyaHedefi, altAd: string): string {
  if (typeof hedef === 'object') return `${konu}/cozum/${hedef.cozumOf.id}`;
  if (hedef === 'orijinal' || hedef === 'ozet') return `${konu}/kok/${hedef}.pdf`;
  return `${konu}/${hedef}/${key(altAd)}`;
}

async function ekle(
  istek: DosyaEkleIstek, o: DosyaEklemeOrtami & { yer: DriveLocation }, tumSecenek: DosyaEkleSecenek, altAd: string
): Promise<DosyaEklendi> {
  const { olcum: om, ...secenek } = tumSecenek;
  const { konu, hedef, islemId } = istek;
  const liste = (id: string) => olc(om, 'drive klasör listesi', () => (o.liste ?? listChildren)(id), { grup: 'istek' });
  const hazir = await olc(om, 'pdfHazirla (PDF kontrolü)', () => pdfHazirla(istek.ad, istek.bytes), { grup: 'pdf', ek: h => ({ boyut: mb(h.bytes.byteLength) }) });

  const kok = await liste(konu);
  let parentId: string, ad: string;
  if (typeof hedef === 'object') {
    // the solution goes next to X: the topic folder, Uebungen or Oedevler
    const x = hedef.cozumOf;
    if (key(x.name).endsWith(COZUM) || !key(x.name).endsWith('.pdf')) throw new HedefBulunamadi(x.name);
    ad = cozumAdi(x);
    if (kok.some(f => f.id === x.id)) parentId = konu;
    else {
      const altId = await alt(kok, liste, x);
      if (!altId) throw new HedefBulunamadi(x.name);
      parentId = altId;
    }
  } else {
    const y = hedefYeri(hedef, altAd, kok);
    ad = y.ad;
    if (y.klasor === 'kok') parentId = konu;
    else {
      const k = y.klasor, ac = o.altKlasorAc, mevcut = altKlasorBul(kok, k);
      if (mevcut) parentId = mevcut.id;
      else if (ac) {
        // the folder first, then the file; a retry (same islemId) finds the folder, never a second one
        parentId = await olc(om, 'alt klasör aç', () => ac(konu, k, islemId), { grup: 'istek' });
        o.konuDegisti?.();
      } else altKlasorYok(y.klasor);
    }
  }

  let yeni;
  try {
    const drive = om ? zamanliDrive(o.olusturDrive, om) : o.olusturDrive;
    yeni = await olc(om, '= createPdf (kontroller + yükleme)', () => createPdf(drive, o.yer, parentId, ad, hazir.bytes, { ...secenek, defterIslem: islemId }), { grup: 'toplam' });
  } catch (e) {
    // the same name: our own earlier try (answer lost) → done; anybody else's file → the error
    if (e instanceof AyniIsimVar && await bizimMi(o.olusturDrive, e.mevcutId, islemId, hazir.bytes)) {
      return { kind: 'zatenVardi', fileId: e.mevcutId, ad, bytes: hazir.bytes, ...(hazir.uyari && { uyari: hazir.uyari }) };
    }
    throw e;
  }
  const y = yeni;
  try { await olc(om, 'önbelleğe yaz', async () => { await o.yeniDosya?.({ id: y.id, modifiedTime: y.modifiedTime, bytes: hazir.bytes }); }, { grup: 'cihaz' }); } catch (e) { console.warn('Yeni PDF önbelleğe yazılamadı.', e); }
  o.konuDegisti?.();
  return { kind: 'yeni', fileId: yeni.id, ad, bytes: hazir.bytes, ...(hazir.uyari && { uyari: hazir.uyari }) };
}

// Which subfolder (Uebungen / Oedevler) holds X; null: none
async function alt(kok: readonly DriveFile[], liste: (id: string) => Promise<DriveFile[]>, x: DriveFile): Promise<string | null> {
  for (const k of ['Uebungen', 'Oedevler'] as const) {
    const klasor = altKlasorBul(kok, k);
    if (klasor && (await liste(klasor.id)).some(f => f.id === x.id)) return klasor.id;
  }
  return null;
}

async function bizimMi(drive: PdfOlusturDrive, id: string, islemId: string, bytes: Uint8Array): Promise<boolean> {
  const f = await drive.dosyaBilgisi(id);
  return f.appProperties?.defterIslem === islemId && Number(f.size) === bytes.byteLength;
}
