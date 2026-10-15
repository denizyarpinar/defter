import type { DriveLoad } from '../drive/driveLibrary';
import { newArrivals, shelfBooks } from '../model/library';
import type { Book } from '../model/types';
import { buildBookPages } from './kitapSayfalari';
import { closePdf, openPdf } from './pdf';
import { getPdf } from './pdfOnbellek';

// Dev only (task 3.1): ?test=pdf prints a book's page list and draws its first PDF page.
// ?test=pdf&kitap=PG uses the book whose "kod" is PG; otherwise the first book with sources.

const sameCode = (a: string, b: string) => a.trim().toLocaleUpperCase('tr') === b.trim().toLocaleUpperCase('tr');

function pickBook(load: DriveLoad, code: string | null): Book | null {
  const { library, books } = load;
  const ordered = [...library.raflar.flatMap((_, i) => shelfBooks(library, books, i)), ...newArrivals(library, books)]
    .map(id => books.get(id)!);
  if (code) return ordered.find(b => sameCode(b.kod, code)) ?? null;
  return ordered.find(b => b.bolumler.some(c => c.kaynaklar.length)) ?? null;
}

export async function runPdfTest(load: DriveLoad): Promise<void> {
  const code = new URLSearchParams(location.search).get('kitap');
  const book = pickBook(load, code);
  if (!book) {
    const codes = [...load.books.values()].map(b => b.kod).filter(Boolean);
    console.warn(code
      ? `[test=pdf] Kodu "${code}" olan kitap yok. Var olan kodlar: ${codes.join(', ') || '(yok)'}`
      : '[test=pdf] Kaynağı olan kitap bulunamadı. Bir kitap.json\'a bolumler[].kaynaklar ekle.');
    return;
  }
  const folderId = load.loc.bookFolderIds.get(book.id)!;

  console.log(`[test=pdf] Kitap: ${book.baslik} (${book.id}${book.kod ? ', ' + book.kod : ''})`);
  const t0 = performance.now();
  const pages = await buildBookPages(book, folderId);
  console.log(`[test=pdf] ${pages.length} sayfa, ${Math.round(performance.now() - t0)} ms`);
  console.table(pages);

  const first = pages.find(p => p.tur === 'pdf' && p.dosyaId && p.modifiedTime && p.pdfSayfa);
  if (!first) { console.warn('[test=pdf] Çizilecek PDF sayfası yok.'); return; }

  const doc = await openPdf(await getPdf(first.dosyaId!, first.modifiedTime!));   // from the cache now
  const page = await doc.getPage(first.pdfSayfa!);

  const cssWidth = 500;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: cssWidth / page.getViewport({ scale: 1 }).width * dpr });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  Object.assign(canvas.style, {
    position: 'fixed', top: '12px', left: '12px', zIndex: '9999', width: `${cssWidth}px`,
    maxWidth: 'calc(100vw - 24px)', background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,.4)', cursor: 'pointer'
  });
  canvas.title = 'Kapatmak için tıkla';
  canvas.addEventListener('click', () => { canvas.width = canvas.height = 0; canvas.remove(); });
  document.body.append(canvas);
  await page.render({ canvas, viewport }).promise;
  await closePdf(doc);
  console.log(`[test=pdf] Çizildi: bölüm ${first.bolumIndex + 1}, PDF sayfası ${first.pdfSayfa}`);
}
