import { SessionExpired, type DriveFile } from '../drive/drive';
import type { Book, SourceType } from '../model/types';
import { SourceResolver } from './kaynakCoz';
import type { MaterialKind, TopicMaterials } from './konuKesfi';
import { closePdf, openPdf } from './pdf';
import { getPdf } from './pdfOnbellek';
import { parsePageRange } from './sayfaAraligi';

// surum 1: a book's chapters and sources → one flat list of pages (see CLAUDE.md → Faz 3).
// surum 2: one material of a topic → its pages (buildTopicPages).
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
  klasorId?: string;         // task 6.4e-2b: with dosyaId, the folder the file was listed in (when known)
}

export const PDF_MIME = 'application/pdf';

export async function buildBookPages(book: Book, bookFolderId: string): Promise<BookPage[]> {
  const resolver = new SourceResolver(bookFolderId);
  const pages: BookPage[] = [];

  // one source after the other: several downloads at once would be too much for the iPad
  for (const [bolumIndex, chapter] of book.bolumler.entries()) {
    for (const src of chapter.kaynaklar) {
      const missing = (): BookPage => ({ bolumIndex, tur: src.tur, dosyaId: null, eksik: src.dosya });   // 6.5-3: an empty name is shown as "(adsız)" by the reader

      if (src.tur === 'link') { pages.push({ bolumIndex, tur: src.tur, dosyaId: null, link: src.dosya }); continue; }

      try {
        const file = src.dosya ? await resolver.resolve(src.dosya) : null;
        if (!file) { pages.push(missing()); continue; }
        const found = { bolumIndex, tur: src.tur, dosyaId: file.id, modifiedTime: file.modifiedTime, mimeType: file.mimeType, ad: src.dosya, ...(file.klasorId ? { klasorId: file.klasorId } : {}) };
        if (src.tur !== 'pdf' && file.mimeType !== PDF_MIME) { pages.push(found); continue; }

        pages.push(...await pdfPages(found, src.sayfalar));
      } catch (e) {
        if (e instanceof SessionExpired) throw e;
        console.warn(`${book.id}: "${src.dosya}" okunamadı.`, e);
        pages.push(missing());
      }
    }
  }
  return pages;
}

// The PDF's pages (all, or the ones in sayfalar).
async function pdfPages(found: BookPage, sayfalar?: string | number): Promise<BookPage[]> {
  const doc = await openPdf(await getPdf(found.dosyaId!, found.modifiedTime!));
  const numbers = parsePageRange(sayfalar, doc.numPages);
  await closePdf(doc);
  return numbers.map(pdfSayfa => ({ ...found, pdfSayfa }));
}

// surum 2: Orijinal / Özet → all their files in order; Übungen / Ödevler → the chosen file only.
// Solutions are not included (buildSolutionPages, when "Çözümü göster" is on).
export function buildTopicPages(m: TopicMaterials, kind: MaterialKind, fileIndex = 0): Promise<BookPage[]> {
  const items = kind === 'uebungen' || kind === 'oedevler' ? m[kind].slice(fileIndex, fileIndex + 1) : m[kind];
  return filesToPages(items.map(i => i.file));
}

export function buildSolutionPages(cozum: DriveFile): Promise<BookPage[]> {
  return filesToPages([cozum]);
}

async function filesToPages(files: DriveFile[]): Promise<BookPage[]> {
  const pages: BookPage[] = [];
  for (const file of files) {   // one after the other (iPad)
    const found: BookPage = { bolumIndex: 0, tur: 'pdf', dosyaId: file.id, modifiedTime: file.modifiedTime, mimeType: file.mimeType, ad: file.name, ...(file.klasorId ? { klasorId: file.klasorId } : {}) };
    try {
      pages.push(...await pdfPages(found));
    } catch (e) {
      if (e instanceof SessionExpired) throw e;
      console.warn(`"${file.name}" okunamadı.`, e);
      pages.push({ bolumIndex: 0, tur: 'pdf', dosyaId: null, eksik: file.name });
    }
  }
  return pages;
}
