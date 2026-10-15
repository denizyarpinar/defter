// Recognising Defter's own notes in pdf.js (Faz 4, task 4.4). No pdf.js or pdf-lib import here:
// the reader uses it on getAnnotations() data, the writer (pdfNotlari.ts) uses the title.
// pdf.js doesn't pass on /DefterId or /NM, so a Defter note is an Ink note whose author (/T) is 'Defter'.

export const TITLE = 'Defter';

const INK = 15;   // pdf.js AnnotationType.INK (pdf.js is loaded lazily, so the number is written here)

export function isDefterAnnotation(a: { annotationType?: number; titleObj?: { str?: string } }): boolean {
  return a.annotationType === INK && a.titleObj?.str === TITLE;
}

// The reader leaves Defter notes out of the pdf.js canvas (the pen layer draws them).
// ?defterNot=goster turns that off, to compare both (debugging).
export function hideDefterNotes(search = location.search): boolean {
  return new URLSearchParams(search).get('defterNot') !== 'goster';
}
