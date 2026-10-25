import { describe, expect, it } from 'vitest';
import type { BookPage } from '../okuma/kitapSayfalari';
import { bosKayit, type OcrKayit, type OcrSayfa } from './kayit/sema';
import { KAYIT_OMRU_MS, OkuyucuOcrKaynak, sayfaMetinleri, type OcrKaynakBagimlilik } from './okuyucuOcrKaynak';

const s = (sayfa: number, parmakIzi: string, metin: string, duzeltme?: string): OcrSayfa => ({
  sayfa, parmakIzi, model: 'm', okunma: '2026-10-24T10:00:00.000Z', dondurme: 0,
  satirlar: [{ girinti: 0, parcalar: [{ metin, renk: 'mavi', ...(duzeltme ? { duzeltme } : {}) }] }],
});
const kayit = (id: string, ...sayfalar: OcrSayfa[]): OcrKayit => ({ ...bosKayit({ id, ad: 'ozet.pdf' }), sayfalar });
const sayfa = (dosyaId: string, pdfSayfa: number, modifiedTime = 'mt1'): BookPage =>
  ({ bolumIndex: 0, tur: 'pdf', dosyaId, modifiedTime, pdfSayfa, ad: 'ozet.pdf' });

function sahte(o: { izler: Record<string, string[]>; kayitlar: Record<string, OcrKayit | null>; hata?: string[] }) {
  const sayac = { izler: 0, klasor: 0, kayit: 0 };
  let zaman = 0;
  const d: OcrKaynakBagimlilik = {
    async izler(id) { sayac.izler++; if (o.hata?.includes(id)) throw new Error('ağ'); return o.izler[id]; },
    async klasor(id) { sayac.klasor++; return `kl-${id}`; },
    async kayit(k) { sayac.kayit++; expect(k.klasorId).toBe(`kl-${k.id}`); return o.kayitlar[k.id] ?? null; },
    simdi: () => zaman,
  };
  return { k: new OkuyucuOcrKaynak(d), sayac, ilerle: (ms: number) => { zaman += ms; } };
}

describe('sayfaMetinleri', () => {
  it('as written and corrected, in search form; the same text once', () => {
    expect(sayfaMetinleri(s(1, 'a', 'Bewies', 'Beweis'))).toEqual(['bewies', 'beweis']);
    expect(sayfaMetinleri(s(1, 'a', 'Größe'))).toEqual(['groesse']);
  });
});

describe('OkuyucuOcrKaynak', () => {
  // the list: ozet.pdf pages 1–3 (2 and 3 photos), sorular.pdf page 1 (photo)
  const pages = [sayfa('ozet', 1), sayfa('ozet', 2), sayfa('ozet', 3), sayfa('sorular', 1)];

  it('the record is tied to the pages by fingerprint; an "eski" entry is never searched', async () => {
    const { k } = sahte({
      izler: { ozet: ['i:1', 'g:foto2', 'g:foto3'], sorular: ['g:s1'] },
      kayitlar: {
        ozet: kayit('ozet', s(2, 'g:foto2', 'Induktion'), s(3, 'g:silinmis', 'Eskimetin')),   // page 3's photo changed
        sorular: kayit('sorular', s(1, 'g:s1', 'Frage')),
      },
    });
    const r = await k.ara(pages, [1, 2, 3]);
    expect(r.sayfalar).toEqual([{ sayfa: 1, metinler: ['induktion'] }, { sayfa: 3, metinler: ['frage'] }]);
  });

  it('no record: no pages (they count as not read)', async () => {
    const { k } = sahte({ izler: { ozet: ['i:1', 'g:2', 'g:3'] }, kayitlar: {} });
    expect((await k.ara(pages.slice(0, 3), [1, 2])).sayfalar).toEqual([]);
  });

  it('one file fails: the others are searched; every file fails: the error', async () => {
    const { k } = sahte({ izler: { sorular: ['g:s1'] }, kayitlar: { sorular: kayit('sorular', s(1, 'g:s1', 'Frage')) }, hata: ['ozet'] });
    expect((await k.ara(pages, [1, 3])).sayfalar).toEqual([{ sayfa: 3, metinler: ['frage'] }]);
    await expect(k.ara(pages, [1, 2])).rejects.toThrow('ağ');
  });

  it('sample files and pages without a file are skipped', async () => {
    const { k, sayac } = sahte({ izler: {}, kayitlar: {} });
    const r = await k.ara([{ bolumIndex: 0, tur: 'pdf', dosyaId: 'ornek:demo.pdf', modifiedTime: 'x', pdfSayfa: 1 }, { bolumIndex: 0, tur: 'pdf', dosyaId: null }], [0, 1]);
    expect(r.sayfalar).toEqual([]);
    expect(sayac.izler + sayac.kayit).toBe(0);
  });

  it('memory: fingerprints per version, the record KAYIT_OMRU_MS long, unut forgets the record', async () => {
    const { k, sayac, ilerle } = sahte({ izler: { ozet: ['i:1', 'g:2', 'g:3'] }, kayitlar: { ozet: kayit('ozet', s(2, 'g:2', 'x')) } });
    const p = pages.slice(0, 3);
    await k.ara(p, [1, 2]);
    await k.ara(p, [1, 2]);
    expect(sayac).toEqual({ izler: 1, klasor: 1, kayit: 1 });
    ilerle(KAYIT_OMRU_MS);
    await k.ara(p, [1, 2]);
    expect(sayac).toEqual({ izler: 1, klasor: 1, kayit: 2 });
    k.unut('ozet');
    await k.ara(p, [1, 2]);
    expect(sayac.kayit).toBe(3);
    await k.ara([sayfa('ozet', 2, 'mt2')], [0]);   // a new version: its fingerprints again
    expect(sayac.izler).toBe(2);
  });
});

describe('OkuyucuOcrKaynak.eslesmeler (6.4e-2)', () => {
  const pages = [sayfa('ozet', 1), sayfa('ozet', 2), sayfa('ozet', 3), sayfa('sorular', 1)];

  it('by fingerprint: the order of the pages changed → the entry goes with its photo, not its page number', async () => {
    // read when the photos were pages 2 and 3; now the file's pages 2 and 3 swapped
    const { k } = sahte({
      izler: { ozet: ['i:1', 'g:foto3', 'g:foto2'], sorular: ['g:s1'] },
      kayitlar: { ozet: kayit('ozet', s(2, 'g:foto2', 'Zwei'), s(3, 'g:foto3', 'Drei')) },
    });
    const e = await k.eslesmeler(pages);
    expect([...e.sayfalar].map(([i, x]) => [i, x.satirlar[0]])).toEqual([
      [1, expect.objectContaining({ parcalar: [expect.objectContaining({ metin: 'Drei' })] })],
      [2, expect.objectContaining({ parcalar: [expect.objectContaining({ metin: 'Zwei' })] })],
    ]);
    // every file's fingerprints (sorular without a record: its photo page counts, not read)
    expect([...e.izler]).toEqual([[0, 'i:1'], [1, 'g:foto3'], [2, 'g:foto2'], [3, 'g:s1']]);
  });

  it('no record in the list: no fingerprints (pdf-lib not loaded)', async () => {
    const { k, sayac } = sahte({ izler: { ozet: ['i:1', 'g:2', 'g:3'], sorular: ['g:s1'] }, kayitlar: { ozet: kayit('ozet') } });
    const e = await k.eslesmeler(pages);
    expect(e.sayfalar.size + e.izler.size).toBe(0);
    expect(sayac.izler).toBe(0);
    expect(sayac.kayit).toBe(2);
  });

  it('a failing file is skipped, never throws', async () => {
    const { k } = sahte({ izler: { sorular: ['g:s1'] }, kayitlar: { ozet: kayit('ozet', s(2, 'g:2', 'x')), sorular: kayit('sorular', s(1, 'g:s1', 'Frage')) }, hata: ['ozet'] });
    const e = await k.eslesmeler(pages);
    expect([...e.sayfalar.keys()]).toEqual([3]);
  });

  it('opened again: from memory (KAYIT_OMRU_MS); unut → the new record (a page read meanwhile)', async () => {
    const kayitlar: Record<string, OcrKayit | null> = { ozet: kayit('ozet', s(2, 'g:2', 'x')) };
    const { k, sayac } = sahte({ izler: { ozet: ['i:1', 'g:2', 'g:3'] }, kayitlar });
    const p = pages.slice(0, 3);
    expect([...(await k.eslesmeler(p)).sayfalar.keys()]).toEqual([1]);
    expect([...(await k.eslesmeler(p)).sayfalar.keys()]).toEqual([1]);
    expect(sayac).toEqual({ izler: 1, klasor: 1, kayit: 1 });
    kayitlar.ozet = kayit('ozet', s(2, 'g:2', 'x'), s(3, 'g:3', 'yeni'));
    k.unut('ozet');
    expect([...(await k.eslesmeler(p)).sayfalar.keys()]).toEqual([1, 2]);
    expect(sayac).toEqual({ izler: 1, klasor: 1, kayit: 2 });
  });
});

describe('OkuyucuOcrKaynak: the last record at once, Drive behind it (6.4e-2b)', () => {
  const pages = [sayfa('ozet', 1), sayfa('ozet', 2), sayfa('ozet', 3)];
  const izler = { ozet: ['i:1', 'g:2', 'g:3'] };

  // Drive answers when `cevapla` is called; the device copy is a map
  function kur(cihaz: Record<string, OcrKayit | 'bozuk'>, drive: OcrKayit | null) {
    let zaman = 0;
    const cevaplar: (() => void)[] = [];
    const yazilan: [string, OcrKayit][] = [];
    const silinen: string[] = [];
    const yenilenen: string[] = [];
    const sayac = { kayit: 0 };
    const d: OcrKaynakBagimlilik = {
      izler: async id => izler[id as 'ozet'],
      klasor: async id => `kl-${id}`,
      kayit: () => { sayac.kayit++; return new Promise(r => cevaplar.push(() => r(drive))); },
      simdi: () => zaman,
      onbellek: {
        oku: async id => { const x = cihaz[id]; if (x === 'bozuk') throw new Error('bozuk'); return x ?? null; },
        yaz: async (id, k) => { yazilan.push([id, k]); },
        sil: async id => { silinen.push(id); },
      },
      yenilendi: id => yenilenen.push(id),
    };
    const k = new OkuyucuOcrKaynak(d);
    const bekle = () => new Promise(r => setTimeout(r, 0));
    return { k, cevapla: async () => { cevaplar.splice(0).forEach(f => f()); await bekle(); }, yazilan, silinen, yenilenen, sayac, ilerle: (ms: number) => { zaman += ms; }, bekle };
  }

  it('a device copy: shown at once, without waiting for Drive; Drive the same → written to the device anyway, no yenilendi', async () => {
    const r = kayit('ozet', s(2, 'g:2', 'x'));
    const t = kur({ ozet: r }, r);
    const e = await t.k.eslesmeler(pages);   // Drive has not answered yet
    expect([...e.sayfalar.keys()]).toEqual([1]);
    expect(t.k.sonKayitIzi?.kaynak).toBe('cihaz');
    await t.cevapla();
    expect(t.yazilan.map(([id]) => id)).toEqual(['ozet']);
    expect(t.yenilenen).toEqual([]);
  });

  it('Drive differs → yenilendi; the next look gives Drive\'s record (from memory)', async () => {
    const t = kur({ ozet: kayit('ozet', s(2, 'g:2', 'eski')) }, kayit('ozet', s(2, 'g:2', 'eski'), s(3, 'g:3', 'yeni')));
    expect([...(await t.k.eslesmeler(pages)).sayfalar.keys()]).toEqual([1]);
    await t.cevapla();
    expect(t.yenilenen).toEqual(['ozet']);
    expect([...(await t.k.eslesmeler(pages)).sayfalar.keys()]).toEqual([1, 2]);
    expect(t.k.sonKayitIzi?.kaynak).toBe('bellek');
    expect(t.sayac.kayit).toBe(1);
  });

  it('no copy / a broken copy: Drive is waited for, then copied', async () => {
    for (const cihaz of [{}, { ozet: 'bozuk' }] as Record<string, OcrKayit | 'bozuk'>[]) {
      const t = kur(cihaz, kayit('ozet', s(3, 'g:3', 'x')));
      let bitti = false;
      const p = t.k.eslesmeler(pages).then(e => { bitti = true; return e; });
      await t.bekle();
      expect(bitti).toBe(false);
      await t.cevapla();
      expect([...(await p).sayfalar.keys()]).toEqual([2]);
      expect(t.k.sonKayitIzi?.kaynak).toBe('drive');
      expect(t.yazilan.length).toBe(1);
    }
  });

  it('Drive has no record any more → the copy removed; unut → the copy removed and Drive waited for', async () => {
    const t = kur({ ozet: kayit('ozet', s(2, 'g:2', 'x')) }, null);
    await t.k.eslesmeler(pages);
    await t.cevapla();
    expect(t.silinen).toEqual(['ozet']);
    expect(t.yenilenen).toEqual(['ozet']);
    t.k.unut('ozet');
    expect(t.silinen).toEqual(['ozet', 'ozet']);
  });

  it('memory past KAYIT_OMRU_MS: the last record at once again, Drive read once more behind it', async () => {
    const r = kayit('ozet', s(2, 'g:2', 'x'));
    const t = kur({}, r);
    const p = t.k.eslesmeler(pages);
    await t.bekle();   // the request is on its way
    await t.cevapla();
    await p;
    t.ilerle(KAYIT_OMRU_MS);
    expect([...(await t.k.eslesmeler(pages)).sayfalar.keys()]).toEqual([1]);   // Drive not answered
    expect(t.sayac.kayit).toBe(2);
    expect(t.k.sonKayitIzi?.kaynak).toBe('bellek');
  });
});

describe('OkuyucuOcrKaynak: the folder the reader knows (6.4e-2b)', () => {
  it('a page with klasorId: no parents request, the record searched in that folder; without: as before', async () => {
    const klasorler: string[] = [];
    const sayac = { klasor: 0 };
    const d: OcrKaynakBagimlilik = {
      izler: async () => ['i:1', 'g:2'],
      klasor: async id => { sayac.klasor++; return `kl-${id}`; },
      kayit: async k => { klasorler.push(k.klasorId); return kayit(k.id, s(2, 'g:2', 'x')); },
    };
    const k = new OkuyucuOcrKaynak(d);
    const bilinen = [1, 2].map(n => ({ ...sayfa('ozet', n), klasorId: 'KONU' }));
    expect([...(await k.eslesmeler(bilinen)).sayfalar.keys()]).toEqual([1]);
    expect(sayac.klasor).toBe(0);
    expect(klasorler).toEqual(['KONU']);

    await k.eslesmeler([sayfa('sorular', 1), sayfa('sorular', 2)]);   // not known: the old way
    expect(sayac.klasor).toBe(1);
    expect(klasorler).toEqual(['KONU', 'kl-sorular']);
  });
});
