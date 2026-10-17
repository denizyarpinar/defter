import type { Book } from '../model/types';
import { usesUnits } from '../model/units';
import { SourceResolver } from '../okuma/kaynakCoz';
import type { DriveLocation } from './driveLibrary';
import { ofisuPdfeCevir } from './ofisCevir';

// Task 6.1b, development only (loaded from main.ts under import.meta.env.DEV with ?ofisCevir=1, not in the build):
// window.defterOfisCevirDene(kitapAdi, konuYolu) — converts a Word/PowerPoint file with ofisuPdfeCevir:
// the temporary Google file goes into that topic folder and then to the trash. The PDF is NOT added to the topic;
// bytes, page count (pdf-lib), time and copeAtildi go to the console, a button opens the PDF in a new tab.
// The topic is given by name (as defterDosyaEkleDene): the reader's open topic is not exported.
// The browser opens a file chooser only after a tap: a "Ofis dosyası seç" button shows up in the corner.

const ne = 'defterOfisCevirDene';
const ACCEPT = '.doc,.docx,.odt,.rtf,.ppt,.pptx,.odp,.key,.pages';
const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

// A box in the corner with buttons; removed by ✕ or by the next call
function kutu(): HTMLDivElement {
  document.getElementById(ne)?.remove();
  const k = document.createElement('div');
  k.id = ne;
  k.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;gap:8px;font:14px sans-serif';
  document.body.append(k);
  return k;
}

function dugme(metin: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = metin;
  b.style.cssText = 'padding:10px 14px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer';
  return b;
}

// null: the user closed it
function dosyaSec(): Promise<File | null> {
  return new Promise(resolve => {
    const k = kutu();
    const sec = dugme('Ofis dosyası seç (6.1b)');
    const kapat = dugme('✕');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.style.display = 'none';
    const bitir = (f: File | null) => { k.remove(); resolve(f); };
    input.addEventListener('change', () => bitir(input.files?.[0] ?? null));
    sec.addEventListener('click', () => input.click());
    kapat.addEventListener('click', () => bitir(null));
    k.append(sec, kapat, input);
  });
}

// window.open after the async work would be stopped by the popup blocker: open on a tap instead
function pdfDugmesi(url: string): void {
  const k = kutu();
  const ac = dugme('PDF\'i yeni sekmede aç');
  const kapat = dugme('✕');
  ac.addEventListener('click', () => window.open(url, '_blank'));
  kapat.addEventListener('click', () => { k.remove(); URL.revokeObjectURL(url); });
  k.append(ac, kapat);
}

export function installOfisCevirDene(activeLocation: () => DriveLocation | null, books: () => Map<string, Book> | null): void {
  (window as unknown as { defterOfisCevirDene: (kitap: string, konu: string) => Promise<void> })
    .defterOfisCevirDene = async (kitapAdi, konuYolu) => {
      const loc = activeLocation();
      const folderId = loc?.bookFolderIds.get(kitapAdi);
      const book = books()?.get(kitapAdi);
      if (!loc || !folderId || !book) {
        console.warn(`${ne}: "${kitapAdi}" adlı Drive kitabı yok (giriş yapıp kitaplığın yüklenmesini bekle). Var olanlar: ${[...(loc?.bookFolderIds.keys() ?? [])].join(', ')}`);
        return;
      }
      if (!usesUnits(book)) { console.warn(`${ne}: "${kitapAdi}" surum 1 kitabı; konu klasörü yok.`); return; }
      try {
        console.log(`${ne}: sağ alttaki "Ofis dosyası seç" düğmesine bas.`);
        const dosya = await dosyaSec();
        if (!dosya) { console.log(`${ne}: vazgeçildi.`); return; }
        const klasorId = await new SourceResolver(folderId).resolveFolder(konuYolu);
        if (!klasorId) { console.warn(`${ne}: ${kitapAdi}/${konuYolu} klasörü yok.`); return; }

        const r = await ofisuPdfeCevir({ dosya, ad: dosya.name, klasorId, islemId: crypto.randomUUID() }, activeLocation());

        let sayfa = '?';
        try {
          const { PDFDocument } = await import('pdf-lib');
          sayfa = String((await PDFDocument.load(r.bytes, { updateMetadata: false })).getPageCount());
        } catch (e) { console.warn(`${ne}: pdf-lib sayfa sayısını okuyamadı: ${e}`); }

        console.log(`${ne}: ${dosya.name} (${mb(dosya.size)}) → PDF ${mb(r.bytes.byteLength)} (${r.bytes.byteLength} bayt), ${sayfa} sayfa · ${(r.sureMs / 1000).toFixed(1)} sn`);
        console.log(`${ne}: geçici dosya ${r.geciciId} · ${r.copeAtildi ? 'çöpe atıldı' : 'ÇÖPE ATILAMADI (bir sonraki çeviride süpürülür)'} · konuya eklenmedi`);
        pdfDugmesi(URL.createObjectURL(new Blob([r.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })));
      } catch (e) {
        console.error(`${ne}: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
      }
    };
}
