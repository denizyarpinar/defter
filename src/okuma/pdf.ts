import type { PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// PDF.js in one place. It is loaded only when the first PDF opens (task 3.6): the room starts
// without it, and the build keeps it in its own chunk. The worker is a separate file as before.
let lib: Promise<typeof import('pdfjs-dist')> | null = null;
export function pdfjs(): Promise<typeof import('pdfjs-dist')> {
  lib ??= import('pdfjs-dist').then(m => {
    m.GlobalWorkerOptions.workerSrc = workerUrl;
    return m;
  });
  lib.catch(() => { lib = null; });   // e.g. offline: try again next time
  return lib;
}

// PDF.js moves the data to the worker (the buffer becomes empty), so it gets a copy:
// the cached buffer stays usable.
export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const { getDocument } = await pdfjs();
  return getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

// Free the document's memory in the worker (PDF.js 6: through its loading task).
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy();
}
