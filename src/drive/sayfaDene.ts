import { ozeteSayfaEkle, type SayfaEklemeOrtami } from '../defter/ozeteEkle';
import type { DriveLocation } from './driveLibrary';
import { drivePdfOlusturApi } from './pdfOlustur';

// Task 5.6, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// window.defterSayfaDene(kitapAdi, dosyaAdi) adds 2 test pages (1 portrait, 1 landscape photo) at the end
// of that PDF in the book's folder. Needs ?dosyaOlustur=1 in the URL (ozeteSayfaEkle's lock).
// Prints the page count before / after, the new version and the file's Drive revisions (defterSurumler).

const link = (id: string) => `https://drive.google.com/file/d/${id}/view`;

// A "photo" with a short text on it
async function denemeJpeg(w: number, h: number, yazi: string): Promise<{ bytes: Uint8Array }> {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c9b98f'; g.lineWidth = 8; g.strokeRect(20, 20, w - 40, h - 40);
  g.fillStyle = '#2a2a2a'; g.font = '700 72px sans-serif';
  g.fillText(yazi, 80, 200);
  g.font = '44px sans-serif';
  g.fillText(new Date().toLocaleString('tr-TR'), 80, 290);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Deneme görseli üretilemedi.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export function installSayfaDene(
  activeLocation: () => DriveLocation | null,
  ortam: () => Pick<SayfaEklemeOrtami, 'deps' | 'sirada' | 'degisti'>
): void {
  const w = window as unknown as {
    defterSayfaDene: (kitap: string, dosya: string) => Promise<void>;
    defterSurumler?: (id?: string) => Promise<void>;
  };
  w.defterSayfaDene = async (kitapAdi: string, dosyaAdi: string) => {
    const loc = activeLocation();
    const folderId = loc?.bookFolderIds.get(kitapAdi);
    if (loc && !folderId) {
      console.warn(`defterSayfaDene: "${kitapAdi}" adlı kitap klasörü yok. Var olanlar: ${[...loc.bookFolderIds.keys()].join(', ')}`);
      return;
    }
    try {
      let fileId = '';
      if (folderId) {
        const f = (await drivePdfOlusturApi.cocuklar(folderId)).find(x => x.name.toLowerCase() === dosyaAdi.toLowerCase());
        if (!f) { console.warn(`defterSayfaDene: ${kitapAdi}/ içinde "${dosyaAdi}" yok.`); return; }
        fileId = f.id;
      }
      const jpegler = [await denemeJpeg(1200, 1600, '5.6 dik'), await denemeJpeg(1600, 1200, '5.6 yatay')];
      const s = await ozeteSayfaEkle(fileId, jpegler, { yer: loc, dosyaDrive: drivePdfOlusturApi, ...ortam() });
      console.log(`defterSayfaDene: ${kitapAdi}/${dosyaAdi} · sayfa ${s.eskiSayfa} → ${s.yeniSayfa}${s.zatenVardi ? ' (zaten eklenmişti, yüklenmedi)' : ''}`
        + ` · modifiedTime = ${s.modifiedTime} · headRevisionId = ${s.headRevisionId} · işlem = ${s.islemId}`);
      console.log(link(s.fileId));
      await w.defterSurumler?.(s.fileId);   // installed by the reader (dev only)
    } catch (e) {
      console.error(`defterSayfaDene: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
