import { describe, expect, it } from 'vitest';

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
