import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// PDF.js in one place: the worker is a separate file that Vite copies to the build.
GlobalWorkerOptions.workerSrc = workerUrl;

// PDF.js moves the data to the worker (the buffer becomes empty), so it gets a copy:
// the cached buffer stays usable.
export function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  return getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

// Free the document's memory in the worker (PDF.js 6: through its loading task).
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy();
}
