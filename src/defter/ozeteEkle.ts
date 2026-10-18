import { DriveError } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import { tekrarlanabilir, YerDisi, yerBellegiBoyutu, yerBellegiDurumu, yerKontrol, type PdfOlusturDrive } from '../drive/pdfOlustur';
import { PdfConflict, PdfSampleNoWrite, uploadPdf, type YuklemeDinleyici } from '../drive/pdfYazici';
import type { UploadDeps } from '../kalem/pdfKayit';
import { SAVE_OPTIONS, yazilabilirAc } from '../kalem/pdfNotlari';
import { isSampleId } from '../okuma/ornekKaynak';
import { MESAJLAR, sayfalariEkle, type Jpeg } from './sayfaEkle';
import { mb, olc, zamanliDrive, type Olcum, type PdfKaynakBilgisi } from './sureOlcum';

// Task 5.6: photos as new pages at the END of a PDF that is already in Drive (CLAUDE.md → Faz 5).
// - The same queue as the pen (DriveUploader.sirada): the file's pending strokes first, then the pages.
//   Never two writes to one file at the same time.
// - Each try: modifiedTime → the bytes of that version → pages added → uploadPdf (canEdit, modifiedTime,
//   headRevisionId, keepForever backup before the first write: as in Faz 4). Same file id, no copy.
// - No double pages: every adding has an id (islemId), written into each new page as /DefterEkId.
//   A try that finds pages with that id in the newest file doesn't add them again (an earlier upload
//   arrived but its answer was lost) and counts as done. A caller trying again later passes the same id.
// - Existing pages, their notes (Defter's and others') and ribbons stay: pages are only added after them.
// - Only with the Drive library open.
// Task 6.2e-1: secenek.olcum (only with ?olcum=1) times each step and each Drive request; without it nothing changes.

export const EK_ID = 'DefterEkId';
export const MAX_DENEME = 3;

export interface EklenenSayfalar {
  fileId: string;
  islemId: string;
  eskiSayfa: number;        // pages before (zatenVardi: pages without this adding)
  yeniSayfa: number;        // pages now
  modifiedTime: string;
  headRevisionId: string;
  bytes: Uint8Array;        // the file as it is in Drive now
  zatenVardi: boolean;      // an earlier try had added them already: nothing was uploaded this time
}

// ---- errors (Turkish, say what to do) ----

export class SayfaEklemeCakisma extends Error {
  constructor() { super('PDF başka bir cihazda değişip duruyor; sayfalar eklenmedi. Biraz sonra tekrar dene.'); }
}

export class SayfaEklemeAgHatasi extends Error {
  constructor() { super('Sayfalar Drive\'a yüklenemedi (bağlantı ya da Drive sorunu). İnternet bağlantını kontrol edip tekrar dene; tekrar denemede sayfalar iki kez eklenmez.'); }
}

export class DosyaBulunamadi extends Error {
  constructor() { super('PDF Drive\'da bulunamadı (silinmiş ya da taşınmış olabilir). Kitaplığı yenileyip tekrar dene.'); }
}

export class SayfaYazmaYok extends Error {
  constructor() { super('Drive kitaplığı açık değil, sayfa eklenmedi. Google ile giriş yap ve kitaplığın yüklenmesini bekle.'); }
}

export class PdfDosyasiDegil extends Error {
  constructor() { super('Sayfalar sadece PDF dosyalarına eklenebilir. Konunun PDF dosyasını seçip tekrar dene.'); }
}

// ---- pure: pages + their mark ----

type Hazir = { bytes: Uint8Array; eskiSayfa: number; yeniSayfa: number } | { zatenVar: true; sayfa: number; eskiSayfa: number };

// The photos as pages at the end, each marked with islemId. Already there (same islemId) → zatenVar.
// Encrypted / signed / unreadable → PdfYazilamaz (5.4's wording).
export async function isaretliEkle(pdfBytes: Uint8Array, jpegler: readonly Jpeg[], islemId: string): Promise<Hazir> {
  const { L, doc } = await yazilabilirAc(pdfBytes, MESAJLAR);
  const key = L.PDFName.of(EK_ID);
  const pages = doc.getPages();
  const isaretli = pages.filter(p => {
    const v = doc.context.lookup(p.node.get(key));
    return (v instanceof L.PDFString || v instanceof L.PDFHexString) && v.decodeText() === islemId;
  }).length;
  if (isaretli) return { zatenVar: true, sayfa: pages.length, eskiSayfa: pages.length - isaretli };
  await sayfalariEkle(doc, jpegler);
  const yeni = doc.getPages().slice(pages.length);
  for (const p of yeni) p.node.set(key, L.PDFString.of(islemId));
  return { bytes: await doc.save(SAVE_OPTIONS), eskiSayfa: pages.length, yeniSayfa: pages.length + yeni.length };
}

// ---- one adding, with its tries (runs inside the queue) ----

const bekle = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function ekleVeYukle(
  deps: UploadDeps, fileId: string, jpegler: readonly Jpeg[], islemId: string,
  secenek: { bekleMs?: number; deneme?: number; olcum?: Olcum; yukleme?: YuklemeDinleyici } = {}
): Promise<EklenenSayfalar> {
  const max = secenek.deneme ?? MAX_DENEME;
  const om = secenek.olcum;
  const drive = om ? zamanliDrive(deps.drive, om) : deps.drive;
  for (let deneme = 1; ; deneme++) {
    try {
      if (om) om.bilgi.deneme = deneme;
      const mt = await drive.modifiedTime(fileId);
      const bilgi: PdfKaynakBilgisi = {};
      const bytes = await olc(om, 'PDF baytları (önbellek ya da indirme)', () => om ? deps.bytes(fileId, mt, bilgi) : deps.bytes(fileId, mt), {
        grup: () => bilgi.kaynak === 'indirme' ? 'aktarim' : 'cihaz',
        ek: b => ({ boyut: mb(b.byteLength), kaynak: bilgi.kaynak ?? '?' }),
      });
      const h = await olc(om, 'pdf-lib: aç + sayfa ekle + kaydet', () => isaretliEkle(bytes, jpegler, islemId), {
        grup: 'pdf',
        ek: x => 'zatenVar' in x ? { zatenVardi: true } : { once: mb(bytes.byteLength), sonra: mb(x.bytes.byteLength), sayfa: `${x.eskiSayfa}→${x.yeniSayfa}` },
      });
      if ('zatenVar' in h) {
        // an earlier try arrived: done, nothing uploaded (no second copy of the pages)
        return { fileId, islemId, eskiSayfa: h.eskiSayfa, yeniSayfa: h.sayfa, modifiedTime: mt,
          headRevisionId: await drive.headRevisionId(fileId), bytes, zatenVardi: true };
      }
      const r = await olc(om, '= uploadPdf (kontroller + yükleme)', () => uploadPdf(drive, fileId, h.bytes, mt, secenek.yukleme), { grup: 'toplam' });
      return { fileId, islemId, eskiSayfa: h.eskiSayfa, yeniSayfa: h.yeniSayfa, modifiedTime: r.modifiedTime,
        headRevisionId: r.headRevisionId, bytes: h.bytes, zatenVardi: false };
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) throw new DosyaBulunamadi();
      const cakisma = e instanceof PdfConflict, ag = tekrarlanabilir(e);
      if (!cakisma && !ag) throw e;
      if (deneme >= max) throw cakisma ? new SayfaEklemeCakisma() : new SayfaEklemeAgHatasi();
      if (ag) await olc(om, 'ağ hatası: tekrar öncesi bekleme', () => bekle(secenek.bekleMs ?? 2000), { grup: 'sira' });   // a conflict: the newest file at once
    }
  }
}

// ---- what the app calls ----

export interface SayfaEklemeOrtami {
  yer: DriveLocation | null;        // main.ts: writer() ? driveLoc : null; null → nothing is written
  deps: UploadDeps;                 // the pen's: drivePdfApi + the PDF cache
  dosyaDrive: Pick<PdfOlusturDrive, 'klasorBilgisi'>;
  sirada<T>(fileId: string, job: () => Promise<T>): Promise<T>;   // the pen's queue (DriveUploader.sirada)
  degisti?(s: EklenenSayfalar): void | Promise<void>;             // caches follow the new version
}

export interface SayfaEklemeSecenek {
  islemId?: string;             // the same id when trying again later (5.8: stored with the photos)
  bekleMs?: number;
  deneme?: number;
  olcum?: Olcum;                // task 6.2e-1: only with ?olcum=1
  yukleme?: YuklemeDinleyici;   // task 6.2e-2: the upload started / its progress (the status strip)
}

// The PDF must be in Drive, not in the trash, inside Kitaplık/kitaplar/<kitap>/ (or a subfolder).
async function dosyaKontrol(o: SayfaEklemeOrtami, yer: DriveLocation, fileId: string, om?: Olcum): Promise<void> {
  let f;
  try { f = await o.dosyaDrive.klasorBilgisi(fileId); } catch (e) {
    if (e instanceof DriveError && e.status === 404) throw new DosyaBulunamadi();
    throw e;
  }
  if (f.trashed) throw new DosyaBulunamadi();
  if (f.mimeType !== 'application/pdf') throw new PdfDosyasiDegil();
  if (f.parents.length !== 1) throw new YerDisi();
  // task 6.2e-2: the folder's place was checked this session: no more requests (a trashed folder makes
  // the file's own `trashed` true, checked above)
  const bellek = yerBellegiDurumu(yer, f.parents[0]);
  if (om) {
    // ?olcum=1: why the place was (not) known; the page load time shows a reload between two addings
    om.bilgi.yerBellegi = `${bellek} (${yerBellegiBoyutu()} klasör)`;
    om.bilgi.sayfaYuklendi = typeof performance === 'undefined' ? undefined : new Date(performance.timeOrigin).toLocaleTimeString('tr-TR');
  }
  if (bellek !== 'var') await yerKontrol(o.dosyaDrive as PdfOlusturDrive, yer, f.parents[0]);
}

export async function ozeteSayfaEkle(
  fileId: string, jpegler: readonly Jpeg[], o: SayfaEklemeOrtami, secenek: SayfaEklemeSecenek = {}
): Promise<EklenenSayfalar> {
  // checks without any request
  if (isSampleId(fileId)) throw new PdfSampleNoWrite();
  if (!o.yer) throw new SayfaYazmaYok();
  const yer = o.yer;
  const islemId = secenek.islemId ?? crypto.randomUUID();
  const om = secenek.olcum;
  try {
    await olc(om, '= dosya kontrolü (yer zinciri)', () => dosyaKontrol(om ? { ...o, dosyaDrive: zamanliDrive(o.dosyaDrive, om) } : o, yer, fileId, om), { grup: 'toplam' });
    const t0 = om?.zaman() ?? 0;
    const s = await o.sirada(fileId, () => {
      // the file's pending strokes (and other files' uploads) went first
      if (om) om.adim('kalem kuyruğu bekleme', om.zaman() - t0, 'sira');
      return ekleVeYukle(o.deps, fileId, jpegler, islemId, secenek);
    });
    try { await olc(om, 'önbelleğe yaz + okuyucu sürümü', async () => { await o.degisti?.(s); }, { grup: 'cihaz', ek: { boyut: mb(s.bytes.byteLength) } }); } catch (e) { console.warn('Önbellek güncellenemedi; dosya bir sonraki açılışta indirilir.', e); }
    return s;
  } catch (e) {
    throw e instanceof TypeError ? new SayfaEklemeAgHatasi() : e;   // fetch failed: no connection
  }
}
