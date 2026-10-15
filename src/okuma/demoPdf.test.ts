import { describe, expect, it } from 'vitest';
import { isDefterAnnotation } from '../kalem/defterNotu';

// Task 3.6: the generated demo PDFs (npm run demo-pdf). The page objects are not compressed,
// so their count and size can be read from the file as text.

// ?raw reads the bytes as UTF-8 text; the binary streams get garbled, the ASCII dictionaries don't
const files = import.meta.glob<string>('/public/demo/*.pdf', { eager: true, query: '?raw', import: 'default' });
const read = (name: string) => files[`/public/demo/${name}`];
const pages = (pdf: string) => pdf.match(/\/Type \/Page(?!s)/g)?.length ?? 0;
const boxes = (pdf: string) => [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map(m => [Number(m[1]), Number(m[2])]);

describe('demo PDFs', () => {
  it('demo-dikey.pdf: 60+ portrait A4 pages', () => {
    const pdf = read('demo-dikey.pdf');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pages(pdf)).toBeGreaterThanOrEqual(60);
    for (const [w, h] of boxes(pdf)) { expect(w).toBeCloseTo(595.28, 1); expect(h).toBeCloseTo(841.89, 1); }
  });

  it('demo-slayt.pdf: 20+ landscape 16:9 pages', () => {
    const pdf = read('demo-slayt.pdf');
    expect(pages(pdf)).toBeGreaterThanOrEqual(20);
    for (const [w, h] of boxes(pdf)) expect(w / h).toBeCloseTo(16 / 9, 3);
  });

  it('the page count in the file matches its page objects', () => {
    for (const name of ['demo-dikey.pdf', 'demo-slayt.pdf']) {
      const pdf = read(name);
      expect(Number(pdf.match(/\/Type \/Pages .*?\/Count (\d+)/)?.[1])).toBe(pages(pdf));
    }
  });
});

// Task 4.4: kalem-testi.pdf has Defter's own notes and notes from "other apps", all with appearances
// ?inline gives the file as a base64 data URL (binary-safe, unlike ?raw)
const penTestUrl = Object.values(import.meta.glob<string>('/public/demo/kalem-testi.pdf', { eager: true, query: '?inline', import: 'default' }))[0];
const penTestBytes = () => Uint8Array.from(atob(penTestUrl.split(',')[1]), c => c.charCodeAt(0));

describe('kalem-testi.pdf', () => {
  it('15 Defter notes (hidden by the reader) and 2 foreign notes (shown)', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: penTestBytes() }).promise;
    try {
      expect(doc.numPages).toBe(6);
      const annots = (await Promise.all([1, 2, 3, 4, 5, 6].map(async n => (await doc.getPage(n)).getAnnotations()))).flat();
      const ours = annots.filter(isDefterAnnotation), others = annots.filter(a => !isDefterAnnotation(a));
      expect(ours.length).toBe(3 + 4 * 3);   // pages 1–2, then pen + highlighter + dot on pages 3–6 (task 4.5)
      expect(others.map(a => `${a.subtype}/${a.titleObj?.str}`).sort()).toEqual(['Ink/GoodNotes', 'Square/Baska program']);
      for (const a of annots) expect(a.hasAppearance).toBe(true);
    } finally {
      await doc.loadingTask.destroy();
    }
  });
});
