import { konuyaDosyaEkle, type DosyaEklemeOrtami, type DosyaHedefi } from '../defter/konuyaDosyaEkle';
import type { Book } from '../model/types';
import { usesUnits } from '../model/units';
import { SourceResolver } from '../okuma/kaynakCoz';
import { FOLDER_MIME, listChildren, type DriveFile } from './drive';
import type { DriveLocation } from './driveLibrary';
import { drivePdfOlusturApi } from './pdfOlustur';
import { RESUMABLE_LIMIT } from './pdfYazici';

// Task 5.10c, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// window.defterDosyaEkleDene(kitapAdi, konuYolu, hedef, ad?) — a PDF from the computer into that topic (konuyaDosyaEkle).
//   hedef: 'orijinal' | 'ozet' | 'uebungen' | 'oedevler' | 'cozum:<file name>' (the file whose solution it is)
// The browser opens a file chooser only after a tap, not from the console: a "PDF seç" button shows up
// in the corner; tapping it opens the chooser. Aim: the 14 MB PDF (POST + resumable) in real Drive, without UI.

const link = (id: string) => `https://drive.google.com/file/d/${id}/view`;
const key = (s: string) => s.trim().toLowerCase();

type Ortam = Pick<DosyaEklemeOrtami, 'yeniDosya' | 'konuDegisti'>;

// A button that opens the file chooser on tap; null: the user closed it
function pdfSec(): Promise<File | null> {
  return new Promise(resolve => {
    document.getElementById('defterDosyaEkleDene')?.remove();
    const kutu = document.createElement('div');
    kutu.id = 'defterDosyaEkleDene';
    kutu.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;gap:8px;font:14px sans-serif';
    const sec = document.createElement('button');
    sec.textContent = 'PDF seç (5.10c deneme)';
    const kapat = document.createElement('button');
    kapat.textContent = '✕';
    for (const b of [sec, kapat]) b.style.cssText = 'padding:10px 14px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.style.display = 'none';
    const bitir = (f: File | null) => { kutu.remove(); resolve(f); };
    input.addEventListener('change', () => bitir(input.files?.[0] ?? null));
    sec.addEventListener('click', () => input.click());
    kapat.addEventListener('click', () => bitir(null));
    kutu.append(sec, kapat, input);
    document.body.append(kutu);
  });
}

// 'cozum:<name>' → that file, from the topic folder, Uebungen or Oedevler
async function cozumHedefi(konuId: string, ad: string): Promise<DriveFile | null> {
  const kok = await listChildren(konuId);
  const bul = (l: DriveFile[]) => l.find(f => f.mimeType !== FOLDER_MIME && key(f.name) === key(ad));
  const x = bul(kok);
  if (x) return x;
  for (const k of ['uebungen', 'oedevler']) {
    const klasor = kok.find(f => f.mimeType === FOLDER_MIME && key(f.name) === k);
    const y = klasor && bul(await listChildren(klasor.id));
    if (y) return y;
  }
  return null;
}

export function installDosyaEkleDene(
  activeLocation: () => DriveLocation | null,
  books: () => Map<string, Book> | null,
  ortam: () => Ortam
): void {
  (window as unknown as { defterDosyaEkleDene: (kitap: string, konu: string, hedef: string, ad?: string) => Promise<void> })
    .defterDosyaEkleDene = async (kitapAdi, konuYolu, hedefYazi, ad) => {
      const ne = 'defterDosyaEkleDene';
      const loc = activeLocation();
      const folderId = loc?.bookFolderIds.get(kitapAdi);
      const book = books()?.get(kitapAdi);
      if (!loc || !folderId || !book) {
        console.warn(`${ne}: "${kitapAdi}" adlı Drive kitabı yok (giriş yapıp kitaplığın yüklenmesini bekle). Var olanlar: ${[...(loc?.bookFolderIds.keys() ?? [])].join(', ')}`);
        return;
      }
      if (!usesUnits(book)) { console.warn(`${ne}: "${kitapAdi}" surum 1 kitabı; konu klasörü yok.`); return; }
      try {
        const konuId = await new SourceResolver(folderId).resolveFolder(konuYolu);
        if (!konuId) { console.warn(`${ne}: ${kitapAdi}/${konuYolu} klasörü yok.`); return; }
        let hedef: DosyaHedefi;
        if (hedefYazi.startsWith('cozum:')) {
          const x = await cozumHedefi(konuId, hedefYazi.slice('cozum:'.length));
          if (!x) { console.warn(`${ne}: ${hedefYazi.slice(6)} bu konuda yok.`); return; }
          hedef = { cozumOf: x };
        } else if (['orijinal', 'ozet', 'uebungen', 'oedevler'].includes(hedefYazi)) {
          hedef = hedefYazi as DosyaHedefi;
        } else {
          console.warn(`${ne}: hedef 'orijinal' | 'ozet' | 'uebungen' | 'oedevler' | 'cozum:<dosya adı>' olmalı.`);
          return;
        }
        console.log(`${ne}: sağ alttaki "PDF seç" düğmesine bas.`);
        const dosya = await pdfSec();
        if (!dosya) { console.log(`${ne}: vazgeçildi.`); return; }
        const bytes = new Uint8Array(await dosya.arrayBuffer());
        const t0 = performance.now();
        const r = await konuyaDosyaEkle(
          { konu: konuId, hedef, ad: ad ?? dosya.name, bytes, islemId: crypto.randomUUID() },
          { yer: loc, olusturDrive: drivePdfOlusturApi, ...ortam() }
        );
        const mb = (r.bytes.byteLength / 1e6).toFixed(1);
        console.log(`${ne}: ${r.kind === 'yeni' ? 'oluşturuldu' : 'zaten vardı (önceki deneme)'} · ${konuYolu} · ${r.ad} · ${mb} MB · ${r.bytes.byteLength > RESUMABLE_LIMIT ? 'resumable' : 'multipart'} · ${((performance.now() - t0) / 1000).toFixed(1)} sn${r.bytes !== bytes ? ' · başındaki fazla veri temizlendi' : ''}`);
        if (r.uyari) console.warn(`${ne}: uyarı ${r.uyari} (şifreli, imzalı ya da pdf-lib açamadı: kalem bu dosyaya çizim yazamaz).`);
        console.log(link(r.fileId));
      } catch (e) {
        console.error(`${ne}: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
      }
    };
}
