import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import { AyniIsimVar, createPdf, DosyaOlusturKilitli, urlKilidiAcik, type PdfOlusturDrive } from '../drive/pdfOlustur';
import { PdfSampleNoWrite } from '../drive/pdfYazici';
import { pdfLib, SAVE_OPTIONS } from '../kalem/pdfNotlari';
import { classifyTopic } from '../okuma/konuKesfi';
import { isSampleId } from '../okuma/ornekKaynak';
import { EK_ID, ozeteSayfaEkle, SayfaYazmaYok, type SayfaEklemeOrtami, type SayfaEklemeSecenek } from './ozeteEkle';
import { sayfalariEkle, type Jpeg } from './sayfaEkle';

// Task 5.7: photos for one topic, one entry point (CLAUDE.md → Faz 5 → Yeni dosya).
// - The topic has a summary (ozet.pdf, or brifing.pdf / sorular.pdf): the pages go at its end (5.6).
// - It has none: a new ozet.pdf in the topic folder (createPdf, 5.5), its pages marked with /DefterEkId.
// - createPdf says "ozet.pdf is there already" (another device, or our own earlier try whose answer was
//   lost): the same adding goes to that file with the same islemId; pages already there are not added again.
// The reader finds the materials by listing the topic folder (konuKesfi.ts), not from kitap.json:
// the new ozet.pdf shows up by itself once the reader's topic cache is cleared (konuDegisti).

export const OZET_ADI = 'ozet.pdf';

export interface OzetDurumu { durum: 'yok' | 'var'; dosyalar: DriveFile[] }

// The same rule as the reader (classifyTopic): ozet.pdf, else brifing.pdf and sorular.pdf; any case.
// Folders and files in the trash don't count.
export function ozetKarari(dosyalar: readonly (DriveFile & { trashed?: boolean })[]): OzetDurumu {
  const gecerli = dosyalar.filter(f => !f.trashed && f.mimeType !== FOLDER_MIME);
  const ozet = classifyTopic(gecerli, [], []).ozet.map(m => m.file);
  return { durum: ozet.length ? 'var' : 'yok', dosyalar: ozet };
}

export async function ozetDurumu(konuKlasorId: string, liste: (id: string) => Promise<DriveFile[]> = listChildren): Promise<OzetDurumu> {
  return ozetKarari(await liste(konuKlasorId));
}

// ---- errors ----

export class OzetSecilmeli extends Error {
  readonly dosyalar: DriveFile[];
  constructor(dosyalar: DriveFile[]) {
    super(`Bu konuda birden çok özet dosyası var (${dosyalar.map(f => f.name).join(', ')}). Hangisine ekleneceğini seç.`);
    this.dosyalar = dosyalar;
  }
}

export class HedefOzetDegil extends Error {
  constructor() { super('Seçilen dosya bu konunun özeti değil, sayfa eklenmedi. Konunun özet dosyalarından birini seç.'); }
}

// ---- a new PDF from the photos, its pages marked ----

export async function isaretliYeniPdf(jpegler: readonly Jpeg[], islemId: string): Promise<Uint8Array> {
  const L = await pdfLib();
  const doc = await L.PDFDocument.create();
  await sayfalariEkle(doc, jpegler);
  for (const p of doc.getPages()) p.node.set(L.PDFName.of(EK_ID), L.PDFString.of(islemId));
  return doc.save(SAVE_OPTIONS);
}

// ---- the entry point ----

export interface KonuEklemeOrtami extends SayfaEklemeOrtami {
  olusturDrive: PdfOlusturDrive;
  liste?(parentId: string): Promise<DriveFile[]>;   // default: listChildren
  // a new file was created: its bytes into the PDF cache (no download at the first open)
  yeniDosya?(f: { id: string; modifiedTime: string; bytes: Uint8Array }): void | Promise<void>;
  konuDegisti?(): void;                              // the reader lists the topic folders again
}

export interface KonuEklemeSecenek extends SayfaEklemeSecenek {
  hedefFileId?: string;   // which summary file (needed when there are several)
}

export interface KonuyaEklendi {
  tur: 'yeni' | 'eklendi';
  fileId: string;
  ad: string;
  eskiSayfa: number;
  yeniSayfa: number;
  zatenVardi: boolean;    // an earlier try had added the pages already: nothing new was written
  islemId: string;
}

export async function konuyaFotografEkle(
  konuKlasorId: string, jpegler: readonly Jpeg[], o: KonuEklemeOrtami, secenek: KonuEklemeSecenek = {}
): Promise<KonuyaEklendi> {
  // checks without any request
  if (!(secenek.kilitAcik ?? urlKilidiAcik)()) throw new DosyaOlusturKilitli();
  if (isSampleId(konuKlasorId) || (secenek.hedefFileId && isSampleId(secenek.hedefFileId))) throw new PdfSampleNoWrite();
  if (!o.yer) throw new SayfaYazmaYok();
  const islemId = secenek.islemId ?? crypto.randomUUID();
  const s = { ...secenek, islemId };

  const ekle = async (fileId: string, ad: string): Promise<KonuyaEklendi> => {
    const r = await ozeteSayfaEkle(fileId, jpegler, o, s);
    return { tur: 'eklendi', fileId, ad, eskiSayfa: r.eskiSayfa, yeniSayfa: r.yeniSayfa, zatenVardi: r.zatenVardi, islemId };
  };

  const { durum, dosyalar } = await ozetDurumu(konuKlasorId, id => (o.liste ?? listChildren)(id));
  if (durum === 'var') {
    const hedef = secenek.hedefFileId ? dosyalar.find(f => f.id === secenek.hedefFileId)
      : dosyalar.length === 1 ? dosyalar[0] : undefined;
    if (secenek.hedefFileId && !hedef) throw new HedefOzetDegil();
    if (!hedef) throw new OzetSecilmeli(dosyalar);
    return ekle(hedef.id, hedef.name);
  }
  if (secenek.hedefFileId) throw new HedefOzetDegil();

  const bytes = await isaretliYeniPdf(jpegler, islemId);
  let yeni;
  try {
    yeni = await createPdf(o.olusturDrive, o.yer, konuKlasorId, OZET_ADI, bytes, secenek);
  } catch (e) {
    // ozet.pdf appeared meanwhile (another device / our own earlier try): add to it, same islemId
    if (e instanceof AyniIsimVar) {
      const r = await ekle(e.mevcutId, OZET_ADI);
      o.konuDegisti?.();
      return r;
    }
    throw e;
  }
  try { await o.yeniDosya?.({ id: yeni.id, modifiedTime: yeni.modifiedTime, bytes }); } catch (e) { console.warn('Yeni PDF önbelleğe yazılamadı.', e); }
  o.konuDegisti?.();
  return { tur: 'yeni', fileId: yeni.id, ad: OZET_ADI, eskiSayfa: 0, yeniSayfa: jpegler.length, zatenVardi: false, islemId };
}
