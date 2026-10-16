import { fotograflardanPdf } from '../defter/sayfaEkle';
import type { DriveLocation } from './driveLibrary';
import { AyniIsimVar, createPdf, drivePdfOlusturApi } from './pdfOlustur';

// Task 5.5, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// window.defterDosyaDene(kitapAdi) creates a 1-page test PDF "deneme-5.5.pdf" in that book's folder.
// A second call shows the "same name" error. createPdf itself needs ?dosyaOlustur=1 in the URL.

const AD = 'deneme-5.5.pdf';
const link = (id: string) => `https://drive.google.com/file/d/${id}/view`;

// A JPEG with a short text on it (the photo of a notebook page, in a test).
async function denemeJpeg(): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 1600;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2a2a2a'; g.font = '700 64px sans-serif';
  g.fillText('Defter 5.5 deneme', 80, 200);
  g.font = '40px sans-serif';
  g.fillText(new Date().toLocaleString('tr-TR'), 80, 280);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Deneme görseli üretilemedi.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function installDosyaDene(activeLocation: () => DriveLocation | null): void {
  (window as unknown as { defterDosyaDene: (kitap: string) => Promise<void> }).defterDosyaDene = async (kitapAdi: string) => {
    const loc = activeLocation();
    const folderId = loc?.bookFolderIds.get(kitapAdi);
    if (loc && !folderId) {
      console.warn(`defterDosyaDene: "${kitapAdi}" adlı kitap klasörü yok. Var olanlar: ${[...loc.bookFolderIds.keys()].join(', ')}`);
      return;
    }
    try {
      const bytes = await fotograflardanPdf([{ bytes: await denemeJpeg() }]);
      const r = await createPdf(drivePdfOlusturApi, loc, folderId ?? '', AD, bytes);
      console.log(`defterDosyaDene: oluşturuldu ${kitapAdi}/${AD} · id = ${r.id} · ${bytes.byteLength} bayt · modifiedTime = ${r.modifiedTime} · headRevisionId = ${r.headRevisionId}`);
      console.log(link(r.id));
    } catch (e) {
      console.error(`defterDosyaDene: ${e instanceof Error ? e.message : String(e)}`);
      if (e instanceof AyniIsimVar) console.log(`Var olan dosya: id = ${e.mevcutId} · ${link(e.mevcutId)}`);
    }
  };
}
