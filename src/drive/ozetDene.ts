import { konuyaFotografEkle, ozetDurumu, type KonuEklemeOrtami } from '../defter/konuyaEkle';
import type { Book } from '../model/types';
import { bookUnits, usesUnits } from '../model/units';
import { SourceResolver } from '../okuma/kaynakCoz';
import type { DriveLocation } from './driveLibrary';
import { drivePdfOlusturApi } from './pdfOlustur';
import { denemeJpeg } from './sayfaDene';

// Task 5.7, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// - window.defterOzetDurum(kitapAdi): every topic of the book: has it a summary, which files. Reads only.
// - window.defterOzetDene(kitapAdi, konuYolu): 2 test photos into that topic (konuyaFotografEkle):
//   a new ozet.pdf, or added to the summary that is there. Needs ?dosyaOlustur=1 in the URL.

const link = (id: string) => `https://drive.google.com/file/d/${id}/view`;

type Ortam = Pick<KonuEklemeOrtami, 'deps' | 'sirada' | 'degisti' | 'yeniDosya' | 'konuDegisti'>;

export function installOzetDene(
  activeLocation: () => DriveLocation | null,
  books: () => Map<string, Book> | null,
  ortam: () => Ortam
): void {
  const w = window as unknown as {
    defterOzetDurum: (kitap: string) => Promise<void>;
    defterOzetDene: (kitap: string, konu: string) => Promise<void>;
  };

  // the book's folder and data, or a warning (null)
  const kitap = (adi: string, ne: string) => {
    const loc = activeLocation();
    const folderId = loc?.bookFolderIds.get(adi);
    const book = books()?.get(adi);
    if (!loc || !folderId || !book) {
      console.warn(`${ne}: "${adi}" adlı Drive kitabı yok (giriş yapıp kitaplığın yüklenmesini bekle). Var olanlar: ${[...(loc?.bookFolderIds.keys() ?? [])].join(', ')}`);
      return null;
    }
    if (!usesUnits(book)) { console.warn(`${ne}: "${adi}" surum 1 kitabı; konu klasörü yok.`); return null; }
    return { loc, book, resolver: new SourceResolver(folderId) };
  };

  w.defterOzetDurum = async (kitapAdi: string) => {
    const k = kitap(kitapAdi, 'defterOzetDurum');
    if (!k) return;
    const satirlar: { konu: string; durum: string; ozet: string }[] = [];
    try {
      for (const u of bookUnits(k.book)) {
        for (const t of u.konular) {
          const klasor = t.klasor ?? '';
          const id = klasor.trim() ? await k.resolver.resolveFolder(klasor) : null;
          if (!id) { satirlar.push({ konu: klasor || `(${t.baslik})`, durum: 'klasör yok', ozet: '' }); continue; }
          const d = await ozetDurumu(id);
          satirlar.push({ konu: klasor, durum: d.durum, ozet: d.dosyalar.map(f => f.name).join(', ') });
        }
      }
      console.table(satirlar);
    } catch (e) {
      console.error(`defterOzetDurum: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  w.defterOzetDene = async (kitapAdi: string, konuYolu: string) => {
    const k = kitap(kitapAdi, 'defterOzetDene');
    if (!k) return;
    try {
      const konuId = await k.resolver.resolveFolder(konuYolu);
      if (!konuId) { console.warn(`defterOzetDene: ${kitapAdi}/${konuYolu} klasörü yok.`); return; }
      const jpegler = [await denemeJpeg(1200, 1600, '5.7 dik'), await denemeJpeg(1600, 1200, '5.7 yatay')];
      const r = await konuyaFotografEkle(konuId, jpegler, { yer: k.loc, dosyaDrive: drivePdfOlusturApi, olusturDrive: drivePdfOlusturApi, ...ortam() });
      console.log(r.tur === 'yeni'
        ? `defterOzetDene: yeni ozet.pdf oluşturuldu · ${konuYolu} · ${r.yeniSayfa} sayfa`
        : `defterOzetDene: var olan ${r.ad}'e eklendi · ${konuYolu} · sayfa ${r.eskiSayfa} → ${r.yeniSayfa}${r.zatenVardi ? ' (zaten eklenmişti, yüklenmedi)' : ''}`);
      console.log(link(r.fileId));
    } catch (e) {
      console.error(`defterOzetDene: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
}
