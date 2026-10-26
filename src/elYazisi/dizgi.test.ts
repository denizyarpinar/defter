import { describe, expect, it } from 'vitest';
import type { OcrSatir } from '../ocr/kayit/sema';
import { devamiMetni, GIRINTI, NOKTA_R, KARE, KENAR_ORAN, MIN_OLCEK, SATIR_ARALIGI, VARSAYILAN_KAGIT, XH_BOLEN, dizgi, latexDuz, oynamaDegeri, type DizgiAyar, type DizgiOge } from './dizgi';

const ornek = (w = 20) => ({ x: 0, y: 0, w, h: 30, taban: 25 });
const karakterler: DizgiAyar['atlas']['karakterler'] = Object.fromEntries([...'bcdefghijklmnoprstuvwxyzK→'].map(k => [k, [ornek()]]));
karakterler.a = [ornek(18), ornek(22)];   // two samples: they take turns
const atlas: DizgiAyar['atlas'] = {
  xh: 40, aralik: { harf: 0.1, kelime: 1.5 }, karakterler,
  renkler: { siyah: { p: [0.58, 0.58, 0.58], yogunluk: 1 }, mavi: { p: [0.75, 0.56, 0.34], yogunluk: 1.2 } }
};
const ayar = (o: Partial<DizgiAyar> = {}): DizgiAyar => ({ en: 900, boy: 1270, atlas, ...o });
const satir = (metin: string, o: Partial<{ girinti: number; renk: string; ustuCizili: boolean; duzeltme: string; tur: 'formul' }> = {}): OcrSatir =>
  ({ girinti: o.girinti ?? 0, parcalar: [{ metin, renk: (o.renk ?? 'mavi') as 'mavi', ustuCizili: o.ustuCizili, duzeltme: o.duzeltme, tur: o.tur }] });
const sayfa = (...satirlar: OcrSatir[]) => ({ satirlar });
const glifler = (oo: DizgiOge[]) => oo.filter((o): o is Extract<DizgiOge, { tur: 'glif' }> => o.tur === 'glif');

describe('dizgi', () => {
  it('xh = en/45, kenar %7, varsayılan kâğıt kareli (satır = 2 kare)', () => {
    const d = dizgi(sayfa(satir('abc')), ayar());
    expect(d.xh).toBeCloseTo(900 / XH_BOLEN);
    expect(d.kenar).toBeCloseTo(900 * KENAR_ORAN);
    expect(d.kagit).toBe(VARSAYILAN_KAGIT);
    expect(VARSAYILAN_KAGIT).toBe('kareli');
    expect(d.satirAraligi).toBeCloseTo(2 * d.kare);
    expect(d.kare).toBeCloseTo(KARE * d.xh);
    expect(d.satirAraligi).toBeCloseTo(SATIR_ARALIGI * d.xh);
  });

  it('taban çizgisi: glifin tabanı satırın tabanında', () => {
    const d = dizgi(sayfa(satir('bb')), ayar({ oynama: false }));
    const [g] = glifler(d.ogeler);
    expect(g.y + 25 * g.olcek).toBeCloseTo(d.ilkTaban);
  });

  it('kelime kaydırma: satır kenarı aşılmaz, satırlar alt alta', () => {
    const metin = Array(30).fill('bcd efg').join(' ');
    const d = dizgi(sayfa(satir(metin)), ayar({ oynama: false }));
    const gg = glifler(d.ogeler);
    for (const g of gg) expect(g.x + 20 * g.olcek).toBeLessThanOrEqual(900 - d.kenar + 1e-6);
    const tabanlar = new Set(gg.map(g => Math.round(g.y + 25 * g.olcek)));
    expect(tabanlar.size).toBeGreaterThan(2);
    expect(d.satirSayisi).toBe(tabanlar.size);
  });

  it('satırdan uzun kelime harflerden bölünür', () => {
    const d = dizgi(sayfa(satir('b'.repeat(80))), ayar({ oynama: false }));
    expect(d.satirSayisi).toBeGreaterThan(1);
    for (const g of glifler(d.ogeler)) expect(g.x + 20 * g.olcek).toBeLessThanOrEqual(900 - d.kenar + 1e-6);
  });

  it('girinti seviyesi 3·xh', () => {
    const d = dizgi(sayfa(satir('b'), satir('b', { girinti: 2 })), ayar());
    const [a, b] = glifler(d.ogeler);
    expect(a.x).toBeCloseTo(d.kenar);
    expect(b.x - a.x).toBeCloseTo(2 * GIRINTI * d.xh);
  });

  it('sığmayan sayfa küçülür; %60 da yetmezse son satır "devamı"', () => {
    const uzun = (n: number) => sayfa(...Array.from({ length: n }, () => satir('bcd')));
    const az = dizgi(uzun(5), ayar());
    expect(az.xh).toBeCloseTo(20);
    const orta = dizgi(uzun(22), ayar());
    expect(orta.xh).toBeLessThan(20);
    expect(orta.xh).toBeGreaterThanOrEqual(20 * MIN_OLCEK - 1e-9);
    expect(orta.kesildi).toBe(false);
    const cok = dizgi(uzun(200), ayar());
    expect(cok.xh).toBeCloseTo(20 * MIN_OLCEK);
    expect(cok.kesildi).toBe(true);
    const son = cok.ogeler[cok.ogeler.length - 1];
    expect(son).toMatchObject({ tur: 'not', metin: devamiMetni() });
    expect(son.tur === 'not' && son.taban).toBeLessThanOrEqual(1270 - cok.kenar);
  });

  it('üstü çizili parça atlanır, düzeltme kullanılır, diger → siyah', () => {
    const s: OcrSatir = { girinti: 0, parcalar: [
      { metin: 'xyz', renk: 'mavi', ustuCizili: true },
      { metin: 'Kantn', renk: 'mavi', duzeltme: 'Kante' },
      { metin: 'bb', renk: 'diger' }
    ] };
    const d = dizgi(sayfa(s), ayar());
    const gg = glifler(d.ogeler);
    expect(gg.map(g => g.karakter).join('')).toBe('Kantebb');
    expect(gg.slice(0, 5).every(g => g.renk === 'mavi')).toBe(true);
    expect(gg.slice(5).every(g => g.renk === 'siyah')).toBe(true);
  });

  it('6.4e-3: elle düzeltilmiş parça düzeltmesiyle dizilir (yazıldığı gibi değil)', () => {
    const s: OcrSatir = { girinti: 0, parcalar: [{ metin: 'das anzi', renk: 'mavi', duzeltme: 'das anki', elle: true }] };
    const gg = glifler(dizgi(sayfa(s), ayar()).ogeler);
    expect(gg.map(g => g.karakter).join('')).toBe('dasanki');
  });

  it('örnekler karakter başına sırayla döner', () => {
    const d = dizgi(sayfa(satir('a a a')), ayar());
    expect(glifler(d.ogeler).map(g => g.ornek)).toEqual([0, 1, 0]);
  });

  it('atlasta olmayan karakter → yedek, eksik listesi', () => {
    const d = dizgi(sayfa(satir('bQZb 7')), ayar());
    const yedek = d.ogeler.filter(o => o.tur === 'yedek');
    expect(yedek.map(o => o.tur === 'yedek' && o.metin)).toEqual(['QZ', '7']);
    expect(yedek.every(o => o.tur === 'yedek' && o.renk === 'mavi')).toBe(true);
    expect(d.eksik).toEqual(['Q', 'Z', '7']);
  });

  it('yan yana yedek kelimeler: yazı tipinin boşluğu, tek metin', () => {
    const olc = (m: string, xh: number) => m.length * xh;
    const d = dizgi(sayfa(satir('b Q Z b')), ayar({ olc, oynama: false }));
    const yedek = d.ogeler.filter(o => o.tur === 'yedek');
    expect(yedek).toHaveLength(1);
    expect(yedek[0]).toMatchObject({ metin: 'Q Z', w: 3 * d.xh });
    const [b1, b2] = glifler(d.ogeler);
    expect(yedek[0].x - (b1.x + 20 * b1.olcek)).toBeCloseTo(1.5 * d.xh);   // glyph ↔ fallback: the atlas gap
    expect(b2.x - (yedek[0].x + 3 * d.xh)).toBeCloseTo(1.5 * d.xh);
  });

  it('çizim satırı: gri italik not, eksik sayılmaz', () => {
    const d = dizgi(sayfa({ girinti: 1, cizim: 'üç düğümlü graf' }), ayar());
    const c = d.ogeler.filter(o => o.tur === 'cizim');
    expect(c.map(o => o.tur === 'cizim' && o.metin)).toEqual(['[çizim: üç düğümlü graf]']);   // one text, the font's spaces
    expect(d.ogeler.some(o => o.tur === 'glif')).toBe(false);
    expect(d.eksik).toEqual([]);
  });

  it('formül: düz metne çevrilip aynı kurallarla dizilir', () => {
    const d = dizgi(sayfa(satir('a^2', { tur: 'formul' })), ayar({ oynama: false }));
    const [a] = glifler(d.ogeler);
    const iki = d.ogeler.find(o => o.tur === 'yedek');
    expect(a.karakter).toBe('a');
    expect(iki).toMatchObject({ metin: '2' });
    expect(iki!.xh).toBeCloseTo(d.xh * 0.7);
    expect(iki!.taban).toBeLessThan(d.ilkTaban);
  });

  it('oynama deterministik; kapalıyken yok', () => {
    const s = sayfa(satir('bcdefghijk lmnoprstuv'));
    const a = dizgi(s, ayar()), b = dizgi(s, ayar()), c = dizgi(s, ayar({ oynama: false }));
    expect(a.ogeler).toEqual(b.ogeler);
    const farklar = glifler(a.ogeler).map((g, i) => Math.round((g.y - glifler(c.ogeler)[i].y) / (20 / 40) * 1000) / 1000);
    expect(new Set(farklar).size).toBeGreaterThan(1);
    for (const f of farklar) expect([-1, 0, 1]).toContain(f);
    expect(oynamaDegeri(3, 7, 'a')).toBe(oynamaDegeri(3, 7, 'a'));
  });
});

describe('latexDuz', () => {
  const duz = (s: string) => latexDuz(s).map(x => x.k).join('');
  it('komutlar', () => {
    expect(duz('a \\cdot b \\times c')).toBe('a · b × c');
    expect(duz('\\frac{a+1}{b}')).toBe('a+1/b');
    expect(duz('\\sqrt{x}')).toBe('√x');
    expect(duz('\\alpha\\beta\\Omega')).toBe('αβΩ');
    expect(duz('\\foo{x}')).toBe('foox');
    expect(duz('\\sum_{v} \\deg(v) = 2|E|')).toBe('Σv deg(v) = 2|E|');
  });
  it('üst ve alt simge küçük, kaymalı', () => {
    const x = latexDuz('x^{2}_i');
    expect(x.map(h => [h.k, h.boyut, h.kayma])).toEqual([['x', 1, null], ['2', 0.7, 'ust'], ['i', 0.7, 'alt']]);
  });
  it('\\vec: harf ve üstünde ok', () => {
    const x = latexDuz('\\vec{a}');
    expect(x.map(h => h.k)).toEqual(['a', '→']);
    expect(x[1].ustOk).toBe(true);
  });
  it('vec oku glif ise harfin üstünde ortalanır, yer kaplamaz', () => {
    const d = dizgi(sayfa(satir('\\vec{a}b', { tur: 'formul' })), ayar({ oynama: false }));
    const [a, ok, b] = glifler(d.ogeler);
    expect(ok.karakter).toBe('→');
    expect(ok.y).toBeLessThan(a.y);
    expect(b.x - (a.x + 18 * a.olcek)).toBeCloseTo(0.1 * d.xh);
  });
});

describe('nokta (6.4e-2)', () => {
  it('atlasta olmayan "·" (\\cdot) mürekkep renginde nokta: x-yüksekliğinin ortasında, yarıçap 0.1·xh, eksik değil', () => {
    const d = dizgi(sayfa(satir('a \\cdot b',{ tur: 'formul' })), ayar({ oynama: false }));
    const n = d.ogeler.filter((o): o is Extract<DizgiOge, { tur: 'nokta' }> => o.tur === 'nokta');
    expect(n).toHaveLength(1);
    expect(n[0].renk).toBe('mavi');
    expect(n[0].r).toBeCloseTo(NOKTA_R * d.xh);
    expect(n[0].y).toBeCloseTo(d.ilkTaban - d.xh / 2);
    expect(d.eksik).toEqual([]);
    expect(d.ogeler.some(o => o.tur === 'yedek')).toBe(false);
    const [a, b] = glifler(d.ogeler);
    expect(n[0].x).toBeGreaterThan(a.x + 18 * a.olcek);
    expect(n[0].x).toBeLessThan(b.x);
  });
  it('metindeki "·" de nokta; atlasta "·" varsa glif', () => {
    expect(dizgi(sayfa(satir('a·b')), ayar()).ogeler.some(o => o.tur === 'nokta')).toBe(true);
    const ile = { ...atlas, karakterler: { ...karakterler, '·': [ornek(8)] } };
    const d = dizgi(sayfa(satir('a·b')), ayar({ atlas: ile }));
    expect(d.ogeler.some(o => o.tur === 'nokta')).toBe(false);
    expect(glifler(d.ogeler).map(g => g.karakter)).toEqual(['a', '·', 'b']);
  });
});
