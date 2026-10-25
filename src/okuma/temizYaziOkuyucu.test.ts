import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Eslesmeler } from '../ocr/okuyucuOcrKaynak';
import type { OcrSayfa } from '../ocr/kayit/sema';
import type { BookPage } from './kitapSayfalari';
import { TemizYaziOkuyucu, type TemizBagimlilik, type TemizBildirim } from './temizYaziOkuyucu';

const s = (iz: string): OcrSayfa => ({ sayfa: 1, parmakIzi: iz, model: 'm', okunma: '2026-10-25T10:00:00.000Z', dondurme: 0, satirlar: [] });
const sayfa = (n: number): BookPage => ({ bolumIndex: 0, tur: 'pdf', dosyaId: 'ozet', modifiedTime: 'mt', pdfSayfa: n });
const pages = [sayfa(1), sayfa(2), sayfa(3)];
const eslesme = (okunmus: Record<number, string>, izler: Record<number, string> = {}): Eslesmeler => ({
  sayfalar: new Map(Object.entries(okunmus).map(([i, iz]) => [Number(i), s(iz)])),
  izler: new Map(Object.entries({ ...izler, ...okunmus }).map(([i, iz]) => [Number(i), iz])),
});

function kur(o: { eslesme?: () => Promise<Eslesmeler>; yazici?: () => Promise<string | null> } = {}) {
  const sayac = { eslesme: 0, yazici: 0, ciz: [] as { iz: string; stil: string; rect?: unknown }[] };
  const bildirimler: TemizBildirim[] = [];
  const d: TemizBagimlilik<string> = {
    eslesmeler: async () => { sayac.eslesme++; return o.eslesme ? o.eslesme() : eslesme({ 1: 'g:b' }, { 0: 'i:a', 2: 'g:c' }); },
    yazici: async () => { sayac.yazici++; return o.yazici ? o.yazici() : 'yazici'; },
    boyut: async () => ({ width: 595, height: 842 }),
    ciz: (_c, x, _b, _y, stil, rect) => { sayac.ciz.push({ iz: x.parmakIzi, stil, rect }); },
    simdi: () => 0,
  };
  const t = new TemizYaziOkuyucu(d, { acik: true, stil: 'tukenmez' }, b => bildirimler.push(b));
  return { t, sayac, bildirimler };
}
const canvas = {} as HTMLCanvasElement;

afterEach(() => vi.restoreAllMocks());

describe('TemizYaziOkuyucu', () => {
  it('eşleşen sayfa + atlas: düğme görünür, sayaç, sadece okunmuş sayfa temiz', async () => {
    const { t, bildirimler } = kur();
    await t.degerlendir(pages);
    expect(t.gorunur(true)).toBe(true);
    expect(t.gorunur(false)).toBe(false);   // the sample library
    expect(t.sayac()).toEqual({ okunmus: 1, fotograf: 2 });
    expect(t.sayfa(pages, 1)?.parmakIzi).toBe('g:b');
    expect(t.sayfa(pages, 0)).toBeNull();
    expect(t.sayfa(pages, 2)).toBeNull();     // a photo page not read: the original
    expect(bildirimler).toEqual([{ sure: 0, eslesen: 1 }]);
  });

  it('okunmuş sayfa yoksa atlas hiç istenmez', async () => {
    const { t, sayac } = kur({ eslesme: async () => eslesme({}) });
    await t.degerlendir(pages);
    expect(sayac.yazici).toBe(0);
    expect(t.gorunur(true)).toBe(false);
  });

  it('atlas yok (başka kullanıcı): gizli; oturumda bir kez sorulur', async () => {
    const { t, sayac } = kur({ yazici: async () => null });
    await t.degerlendir(pages);
    await t.degerlendir(pages);
    expect(t.gorunur(true)).toBe(false);
    expect(t.sayfa(pages, 1)).toBeNull();
    expect(sayac.yazici).toBe(1);
    t.oturumDegisti();
    await t.degerlendir(pages);
    expect(sayac.yazici).toBe(2);
  });

  it('atlas hatası: gizli + uyarı, okuyucu bozulmaz; sonraki denemede tekrar sorulur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let kez = 0;
    const { t, sayac } = kur({ yazici: async () => { if (kez++ === 0) throw new Error('ağ'); return 'yazici'; } });
    await expect(t.degerlendir(pages)).resolves.toBeUndefined();
    expect(t.gorunur(true)).toBe(false);
    expect(warn).toHaveBeenCalled();
    await t.degerlendir(pages);
    expect(t.gorunur(true)).toBe(true);
    expect(sayac.yazici).toBe(2);
  });

  it('kayıt okuma hatası: gizli + uyarı, hata dışarı çıkmaz', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { t } = kur({ eslesme: async () => { throw new Error('ağ'); } });
    await expect(t.degerlendir(pages)).resolves.toBeUndefined();
    expect(t.gorunur(true)).toBe(false);
  });

  it('yeniden değerlendirme: yeni okunan sayfa okuyucu kapanmadan temiz olur; eski cevap yenisini ezmez', async () => {
    let okunmus: Record<number, string> = { 1: 'g:b' };
    const bekle: (() => void)[] = [];
    let yavas = false;
    const { t } = kur({ eslesme: () => {
      const e = eslesme({ ...okunmus });
      return yavas ? new Promise(r => bekle.push(() => r(e))) : Promise.resolve(e);
    } });
    await t.degerlendir(pages);
    yavas = true;
    const eski = t.degerlendir(pages);       // slow, answers last
    yavas = false;
    okunmus = { 1: 'g:b', 2: 'g:c' };
    await t.degerlendir(pages);
    bekle.forEach(f => f()); await eski;
    expect(t.sayfa(pages, 2)?.parmakIzi).toBe('g:c');
    expect(t.sayac().okunmus).toBe(2);
  });

  it('başka liste: eski eşleşme kullanılmaz', async () => {
    const { t } = kur();
    await t.degerlendir(pages);
    expect(t.sayfa([...pages], 1)).toBeNull();
    t.bosalt();
    expect(t.sayfa(pages, 1)).toBeNull();
  });

  it('kalem açık ya da tercih kapalı: orijinal; kalem kapanınca tercih geri gelir', async () => {
    const { t } = kur();
    await t.degerlendir(pages);
    t.kalem = true;
    expect(t.etkin).toBe(false);
    expect(t.ciz(pages, 1, pages[1], canvas)).toBeNull();
    t.kalem = false;
    expect(t.sayfa(pages, 1)).not.toBeNull();
    t.tercih = { acik: false, stil: 'tukenmez' };
    expect(t.sayfa(pages, 1)).toBeNull();
  });

  it('ciz: seçili stil ve görünen bölge (zoom) ile çizer; iptal edilen iş çizmez', async () => {
    const { t, sayac } = kur();
    await t.degerlendir(pages);
    t.tercih = { acik: true, stil: 'yumusak' };
    const r = { x: 0.25, y: 0.5, w: 0.5 };
    await t.ciz(pages, 1, pages[1], canvas, r)!.promise;
    expect(sayac.ciz).toEqual([{ iz: 'g:b', stil: 'yumusak', rect: r }]);
    const is = t.ciz(pages, 1, pages[1], canvas)!;
    is.cancel();
    await is.promise;
    expect(is.cancelled()).toBe(true);
    expect(sayac.ciz).toHaveLength(1);
  });
});
