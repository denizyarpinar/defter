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

// Task 4.9b: the sample library's first summary has a few hand-drawn Defter notes
const summaryUrl = Object.values(import.meta.glob<string>('/public/demo/demo-ozet-notlu.pdf', { eager: true, query: '?inline', import: 'default' }))[0];
const summaryBytes = () => Uint8Array.from(atob(summaryUrl.split(',')[1]), c => c.charCodeAt(0));

describe('demo-ozet-notlu.pdf', () => {
  it('the slides with 7 Defter notes (pen with pressure, highlighter), nothing else', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: summaryBytes() }).promise;
    try {
      expect(doc.numPages).toBe(pages(read('demo-slayt.pdf')));
      const annots = (await Promise.all(Array.from({ length: doc.numPages }, async (_, i) => (await doc.getPage(i + 1)).getAnnotations()))).flat();
      expect(annots.length).toBe(7);
      for (const a of annots) { expect(isDefterAnnotation(a)).toBe(true); expect(a.hasAppearance).toBe(true); }
    } finally {
      await doc.loadingTask.destroy();
    }
    const { readDefterStrokes } = await import('../kalem/pdfNotlari');
    const strokes = await readDefterStrokes(summaryBytes());
    expect([...strokes.keys()]).toEqual([2, 3]);   // slides 3 and 4
    const all = [...strokes.values()].flat();
    const pens = all.filter(s => s.arac === 'kalem'), hls = all.filter(s => s.arac === 'fosforlu');
    expect([pens.length, hls.length]).toEqual([4, 3]);
    for (const s of pens) {
      expect(s.basinc?.length).toBe(s.noktalar.length / 2);
      expect(new Set(s.basinc).size).toBeGreaterThan(3);   // the pressure changes along the line
    }
    for (const s of hls) expect(s.opaklik).toBeLessThan(1);
  });
});

// Task 4.9b: the sample library points only at files that exist; the pen test file is for tests only
const sampleIndex = Object.values(import.meta.glob<string>('/public/ornek/index.json', { eager: true, query: '?raw', import: 'default' }))[0];

describe('public/ornek/index.json', () => {
  it('every demo file exists, kalem-testi.pdf is not listed, the first summary has notes', () => {
    const index = JSON.parse(sampleIndex) as { klasorler: Record<string, Record<string, Record<string, string>>> };
    const targets = Object.values(index.klasorler).flatMap(book => Object.values(book).flatMap(topic => Object.values(topic)));
    for (const t of targets) expect(files[`/public/${t}`], t).toBeDefined();
    expect(targets).not.toContain('demo/kalem-testi.pdf');
    expect(index.klasorler['programlamaya-giris']['Unite-01-Temeller/Konu-01-Degiskenler']['ozet.pdf']).toBe('demo/demo-ozet-notlu.pdf');
  });
});
