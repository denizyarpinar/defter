// Task 6.K6a: the reader's wiring for a topic without materials (Okuyucu.ts has the DOM; checked in its source,
// scripts/bos-konu-kontrol.mjs shows the result). Run: npx vitest run scripts/bos-konu-kaynak.test.ts

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('the reader: a topic without materials', () => {
  const src = readFileSync(new URL('../src/okuma/Okuyucu.ts', import.meta.url), 'utf-8');
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf-8');
  it('pen, search and Kitap/PDF hidden; the add buttons stay in the bar', () => {
    expect(css).toMatch(/#okuyucu\.o-materyalsiz #oPenBtn, #okuyucu\.o-materyalsiz #oAraBtn, #okuyucu\.o-materyalsiz #oMode \{ display: none \}/);
    expect(css).not.toMatch(/o-materyalsiz #oFoto|o-materyalsiz #oDosya|o-materyalsiz #oBar/);
  });
  it('"girildi" only once there is a material; recordReading writes nothing without one', () => {
    const openTopic = src.slice(src.indexOf('async function openTopic('), src.indexOf('// The ribbon of the open topic'));
    expect(openTopic.indexOf("autoTopicStatus(book, unit, topicIndex, 'girildi')")).toBeGreaterThan(openTopic.indexOf('if (!kind) {'));
    expect(src).toMatch(/if \(!okumaKaydiYazilsinMi\(topic\.kind\)\) return;/);
  });
});
