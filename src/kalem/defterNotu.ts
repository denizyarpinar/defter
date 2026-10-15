// Recognising Defter's own notes in pdf.js (Faz 4, task 4.4). No pdf.js or pdf-lib import here:
// the reader uses it on getAnnotations() data, the writer (pdfNotlari.ts) uses the title.
// pdf.js doesn't pass on /DefterId or /NM, so a Defter note is an Ink note whose author (/T) is 'Defter'.

export const TITLE = 'Defter';

const INK = 15;   // pdf.js AnnotationType.INK (pdf.js is loaded lazily, so the number is written here)

export function isDefterAnnotation(a: { annotationType?: number; titleObj?: { str?: string } }): boolean {
  return a.annotationType === INK && a.titleObj?.str === TITLE;
}

// The reader leaves Defter notes out of the pdf.js canvas (the pen layer draws them).
// ?defterNot=goster turns that off, to compare both (debugging); so does ?cizimKontrol=1 (task 4.5).
export function hideDefterNotes(search = location.search): boolean {
  return penLayerMode(search) === 'normal';
}

// Task 4.5: the SVG pen layer over each page.
// normal: Defter's strokes as they are; kontrol (?cizimKontrol=1): thin dashed cyan over pdf.js's
// own drawing of them, to check they line up; kapali (?defterNot=goster): pdf.js draws them, no layer.
export type PenLayerMode = 'normal' | 'kontrol' | 'kapali';

export function penLayerMode(search = location.search): PenLayerMode {
  const q = new URLSearchParams(search);
  if (q.get('defterNot') === 'goster') return 'kapali';
  if (q.get('cizimKontrol') === '1') return 'kontrol';
  return 'normal';
}
