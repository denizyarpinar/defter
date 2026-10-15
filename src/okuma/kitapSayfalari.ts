import { SessionExpired } from '../drive/drive';
import type { Book, SourceType } from '../model/types';
import { SourceResolver } from './kaynakCoz';
import { closePdf, openPdf } from './pdf';
import { getPdf } from './pdfOnbellek';
import { parsePageRange } from './sayfaAraligi';

// A book's chapters and sources → one flat list of pages (see CLAUDE.md → Faz 3).
// Every PDF page is one page of the book (also a "claude"/"defter" source that is a PDF);
// a notebook photo / link is one page.
// A missing file doesn't break the book: it becomes one "Dosya bulunamadı" page.

export interface BookPage {
  bolumIndex: number;
  tur: SourceType;
  dosyaId: string | null;    // Drive file id (null: link, or the file is missing)
  modifiedTime?: string;     // with dosyaId: the version, part of the PDF cache key
  mimeType?: string;         // with dosyaId: what the file is (PDF, image, …)
  ad?: string;               // with dosyaId: the file name as written in kitap.json
  pdfSayfa?: number;        // 1-based page inside the PDF
  eksik?: string;            // name of the file that couldn't be found or read
  link?: string;             // tur "link": the address
}

export const PDF_MIME = 'application/pdf';

export async function buildBookPages(book: Book, bookFolderId: string): Promise<BookPage[]> {
  const resolver = new SourceResolver(bookFolderId);
  const pages: BookPage[] = [];

  // one source after the other: several downloads at once would be too much for the iPad
  for (const [bolumIndex, chapter] of book.bolumler.entries()) {
    for (const src of chapter.kaynaklar) {
      const missing = (): BookPage => ({ bolumIndex, tur: src.tur, dosyaId: null, eksik: src.dosya || '(adsız)' });

      if (src.tur === 'link') { pages.push({ bolumIndex, tur: src.tur, dosyaId: null, link: src.dosya }); continue; }

      try {
        const file = src.dosya ? await resolver.resolve(src.dosya) : null;
        if (!file) { pages.push(missing()); continue; }
        const found = { bolumIndex, tur: src.tur, dosyaId: file.id, modifiedTime: file.modifiedTime, mimeType: file.mimeType, ad: src.dosya };
        if (src.tur !== 'pdf' && file.mimeType !== PDF_MIME) { pages.push(found); continue; }

        const doc = await openPdf(await getPdf(file.id, file.modifiedTime));
        const numbers = parsePageRange(src.sayfalar, doc.numPages);
        await closePdf(doc);
        for (const pdfSayfa of numbers) pages.push({ ...found, pdfSayfa });
      } catch (e) {
        if (e instanceof SessionExpired) throw e;
        console.warn(`${book.id}: "${src.dosya}" okunamadı.`, e);
        pages.push(missing());
      }
    }
  }
  return pages;
}
