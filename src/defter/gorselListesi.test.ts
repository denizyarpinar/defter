import { describe, expect, it } from 'vitest';
import { MAX_DOSYA_MB } from './ayarlar';
import { BOZUK_PDF_METIN, ofisMetni } from './dosyaEklemeMetin';
import type { DosyaTuruSonucu } from './dosyaTuru';
import { tasi, cikar } from './fotoPanelDurumu';
import { COK_PDF_METIN, KARISIK_METIN, listeAdi, listeBilgisi, listeBoyutMetni, secimKarari } from './gorselListesi';

// Task 5.10g: several images → one PDF, the pure part.

const s = (ad: string, tur: DosyaTuruSonucu['tur'], alt?: string) => ({ ad, tur: { tur, alt } });
const jpg = (ad: string) => s(ad, 'gorsel', 'jpeg');

describe('secimKarari', () => {
  it('only images (one or many): the image list', () => {
    expect(secimKarari([jpg('a.jpg')])).toEqual({ tur: 'gorseller' });
    expect(secimKarari([jpg('a.jpg'), s('b.png', 'gorsel', 'png'), s('c.heic', 'gorsel', 'heic')])).toEqual({ tur: 'gorseller' });
  });
  it('one file that is not an image: the single-file way (dosyaHazirla decides)', () => {
    expect(secimKarari([s('a.pdf', 'pdf')])).toEqual({ tur: 'tek' });
    expect(secimKarari([s('a.docx', 'ofis', 'word')])).toEqual({ tur: 'tek' });
    expect(secimKarari([s('a.pdf', 'desteklenmeyen', 'bozukPdf')])).toEqual({ tur: 'tek' });
  });
  it('PDF + images: "add the PDF alone"', () => {
    expect(secimKarari([jpg('a.jpg'), s('b.pdf', 'pdf')])).toEqual({ tur: 'ret', metin: KARISIK_METIN() });
    expect(secimKarari([s('b.pdf', 'pdf', 'onEkli'), jpg('a.jpg')])).toEqual({ tur: 'ret', metin: KARISIK_METIN() });
  });
  it('several PDFs: one at a time', () => {
    expect(secimKarari([s('a.pdf', 'pdf'), s('b.pdf', 'pdf')])).toEqual({ tur: 'ret', metin: COK_PDF_METIN() });
  });
  it('an Office / broken / unknown file among several: its name + its own text', () => {
    expect(secimKarari([jpg('a.jpg'), s('not.docx', 'ofis', 'word')])).toEqual({ tur: 'ret', metin: `not.docx: ${ofisMetni('word')}` });
    expect(secimKarari([s('a.pdf', 'pdf'), s('x.pdf', 'desteklenmeyen', 'bozukPdf')])).toEqual({ tur: 'ret', metin: `x.pdf: ${BOZUK_PDF_METIN()}` });
  });
  it('6.1c: a convertible Word file among several is still refused (conversion: one file only)', () => {
    const docx = { ad: 'not.docx', tur: { tur: 'ofis' as const, alt: 'word', cevrilebilir: true } };
    expect(secimKarari([s('a.pdf', 'pdf'), docx])).toEqual({ tur: 'ret', metin: `not.docx: ${ofisMetni('word')}` });
    expect(secimKarari([docx])).toEqual({ tur: 'tek' });
  });
  it('nothing chosen', () => {
    expect(secimKarari([]).tur).toBe('ret');
  });
});

describe('listeAdi', () => {
  it('the first image\'s name + .pdf, following the order', () => {
    let l = ['tahta.jpg', 'defter.png'];
    expect(listeAdi(l[0], '', false)).toBe('tahta.pdf');
    l = tasi(l, 1, -1);
    expect(listeAdi(l[0], 'tahta.pdf', false)).toBe('defter.pdf');
    l = cikar(l, 0);
    expect(listeAdi(l[0], 'defter.pdf', false)).toBe('tahta.pdf');
  });
  it('a name changed by hand stays (also when the order changes)', () => {
    expect(listeAdi('defter.png', 'Blatt 3', true)).toBe('Blatt 3');
  });
  it('empty list: no name', () => {
    expect(listeAdi(undefined, 'x.pdf', false)).toBe('');
  });
});

describe('listeBilgisi / listeBoyutMetni', () => {
  it('info line', () => {
    expect(listeBilgisi(3)).toBe('Görsel → PDF · 3 sayfa');
  });
  it('size limit on the whole PDF', () => {
    expect(listeBoyutMetni(MAX_DOSYA_MB * 1_000_000)).toBeNull();
    expect(listeBoyutMetni(MAX_DOSYA_MB * 1_000_000 + 1)).toMatch(/^Dosya çok büyük: .* Birkaç görseli çıkar\.$/);
  });
});
