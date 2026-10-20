import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf-8');
const reader = read('../src/ui/reader.ts');
const measure = read('../src/ui/icindekilerOlcum.ts');
const css = read('../src/styles.css');

describe('desk contents measurement wiring', () => {
  it('waits for fonts and schedules layout again for font, size and orientation changes', () => {
    expect(reader).toContain('document.fonts.ready.then');
    expect(reader).toContain("document.fonts.addEventListener('loadingdone', requestLayout)");
    expect(reader).toContain("addEventListener('orientationchange', requestLayout)");
    expect(reader).toContain('new ResizeObserver');
    expect(reader).toContain('ticket !== layoutTicket');
  });
  it('measures real row boxes and reserves the footer and folio', () => {
    expect(measure).toContain('getBoundingClientRect()');
    expect(measure).toContain('[...list.children].map(height)');
    expect(measure).toContain("page.querySelector('.folio')");
    expect(measure).toContain("page.querySelector('.legend')");
    expect(css).toMatch(/\.toc-measure \{[^}]*visibility: hidden/);
    expect(reader).toContain('probe.remove()');
  });
  it('counts only desk pages and moves wide-screen controls by one spread', () => {
    expect(reader).toContain('const pageCount = () => 1 + contents.length');
    expect(reader).toContain('const pageStep = () => single ? 1 : 2');
    expect(reader).toContain("classList.toggle('no-turn', !single && n <= 2)");
    expect(reader).not.toContain('buildTopicPages');
    expect(reader).not.toContain('buildBookPages');
  });
});
