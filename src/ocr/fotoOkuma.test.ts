import { beforeAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { yeniKayit, type BekleyenJpeg } from '../defter/bekleyenFotoKayit';
import { isaretliYeniPdf, type KonuyaEklendi } from '../defter/konuyaEkle';
import { fotograflardanPdf, sonaSayfaEkle } from '../defter/sayfaEkle';
import { OkumaHatasi } from './claudeMotor';
import { BEKLE_429_MS, FotoOkumaKuyrugu, jpegParmakIzi, OKUNAMADI, temizYaziyaCevir, type FotoOkumaDeps } from './fotoOkuma';
import type { OcrKaynakDosya } from './kayit/kayitDrive';
import { sayfaParmakIzleri } from './kayit/parmakIzi';
import type { OcrSayfa } from './kayit/sema';

// Task 6.4c-2: reading photos after the adding (fake engine + fake record)

const jpeg = async (renk: string, w = 300, h = 400) =>
  new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: renk } }).jpeg({ quality: 85 }).toBuffer());
let a: Uint8Array, b: Uint8Array, c: Uint8Array;
beforeAll(async () => { [a, b, c] = await Promise.all([jpeg('#d8c9a3'), jpeg('#a3c9d8', 400, 300), jpeg('#c9d8a3')]); });

describe('the fingerprint without downloading the PDF', () => {
  it('pages added at the end: SHA-256 of the embedded JPEG = parmakIzi from the PDF', async () => {
    const eski = await fotograflardanPdf([{ bytes: c }]);
    const pdf = await sonaSayfaEkle(eski, [{ bytes: a }, { bytes: b }]);
    const izler = await sayfaParmakIzleri(pdf);
    expect(izler).toHaveLength(3);
    expect(izler[1]).toBe(await jpegParmakIzi(a));
    expect(izler[2]).toBe(await jpegParmakIzi(b));
    expect(izler[0]).toBe(await jpegParmakIzi(c));
  });
  it('a new ozet.pdf (marked pages) gives the same', async () => {
    const izler = await sayfaParmakIzleri(await isaretliYeniPdf([{ bytes: a }, { bytes: b }], 'islem-1'));
    expect(izler).toEqual([await jpegParmakIzi(a), await jpegParmakIzi(b)]);
  });
});

const sonuc = (x: Partial<KonuyaEklendi> = {}): KonuyaEklendi =>
  ({ tur: 'eklendi', fileId: 'F', ad: 'ozet.pdf', eskiSayfa: 24, yeniSayfa: 26, zatenVardi: false, islemId: 'i', ...x });
const kayit = (jpegler: BekleyenJpeg[]) =>
  yeniKayit({ kitapAdi: 'b', konuKlasorId: 'K', konuBaslik: 'Konu', hedefAd: 'ozet.pdf', jpegler }, 't0', 'is');
const satirlar = [{ girinti: 0, parcalar: [{ metin: 'der Knoten', renk: 'kirmizi' as const }] }];

function deps(over: Partial<FotoOkumaDeps> = {}) {
  const yazilan: { k: OcrKaynakDosya; s: OcrSayfa }[] = [];
  const bildirim: string[] = [];
  const okunan: Uint8Array[] = [];
  const d: FotoOkumaDeps = {
    async oku(j) { okunan.push(j); return { satirlar, model: 'claude-haiku-5-5' }; },
    async yaz(k, s) { yazilan.push({ k, s }); },
    async kayitliIzler() { return new Set(); },
    bildir: m => bildirim.push(m),
    bekle: async () => {},
    simdi: () => '2026-10-24T20:00:00.000Z',
    ...over
  };
  return { d, yazilan, bildirim, okunan };
}

describe('temizYaziyaCevir', () => {
  it('off by default: nothing is read, nothing said', async () => {
    const { d, yazilan, bildirim, okunan } = deps();
    const r = await temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1 }, { bytes: b, width: 1, height: 1, temizYazi: false }]), sonuc(), d);
    expect(r).toEqual({ okunan: 0, atlanan: 0, hata: 0 });
    expect([okunan, yazilan, bildirim]).toEqual([[], [], []]);
  });

  it('only the chosen photos, each on its new page, written one by one', async () => {
    const { d, yazilan, bildirim, okunan } = deps();
    const r = await temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1 }, { bytes: b, width: 1, height: 1, temizYazi: true }]), sonuc(), d);
    expect(r.okunan).toBe(1);
    expect(okunan).toEqual([b]);
    expect(yazilan).toEqual([{ k: { id: 'F', ad: 'ozet.pdf', klasorId: 'K' },
      s: { sayfa: 26, parmakIzi: await jpegParmakIzi(b), model: 'claude-haiku-5-5', okunma: '2026-10-24T20:00:00.000Z', dondurme: 0, satirlar } }]);
    expect(bildirim).toEqual(['Temiz yazı kaydedildi: 1 sayfa (ozet.pdf)']);
  });

  it('a failing reading or record: no throw, the others go on, one notice', async () => {
    let n = 0;
    const { d, yazilan, bildirim } = deps({
      async oku() { if (n++ === 0) throw new OkumaHatasi('Model isteği başarısız (durum 502).', 502); return { satirlar, model: 'm' }; }
    });
    const r = await temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1, temizYazi: true }, { bytes: b, width: 1, height: 1, temizYazi: true }]), sonuc(), d);
    expect(r).toEqual({ okunan: 1, atlanan: 0, hata: 1 });
    expect(yazilan.map(x => x.s.sayfa)).toEqual([26]);
    expect(bildirim).toEqual([`${OKUNAMADI} (s.25: Model isteği başarısız (durum 502).)`]);

    const yazHata = deps({ async yaz() { throw new Error('Drive'); } });
    await expect(temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1, temizYazi: true }]), sonuc(), yazHata.d)).resolves.toEqual({ okunan: 0, atlanan: 0, hata: 1 });
    expect(yazHata.bildirim[0]).toContain(OKUNAMADI);
  });

  it('429: waits a minute, tries once more', async () => {
    let n = 0;
    const bekle = vi.fn(async () => {});
    const { d, yazilan } = deps({ bekle, async oku() { if (n++ === 0) throw new OkumaHatasi('çok', 429); return { satirlar, model: 'm' }; } });
    await temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1, temizYazi: true }]), sonuc(), d);
    expect(bekle).toHaveBeenCalledWith(BEKLE_429_MS);
    expect(yazilan).toHaveLength(1);
  });

  it('pages already there (zatenVardi): a page read before is not read again', async () => {
    const izA = await jpegParmakIzi(a);
    const { d, okunan } = deps({ async kayitliIzler() { return new Set([izA]); } });
    const r = await temizYaziyaCevir(kayit([{ bytes: a, width: 1, height: 1, temizYazi: true }, { bytes: b, width: 1, height: 1, temizYazi: true }]), sonuc({ zatenVardi: true }), d);
    expect(r).toEqual({ okunan: 1, atlanan: 1, hata: 0 });
    expect(okunan).toEqual([b]);
  });

  it('the queue: one adding after the other', async () => {
    const sira: string[] = [];
    let bitir!: () => void;
    const ilk = new Promise<void>(r => { bitir = r; });
    let n = 0;
    const { d } = deps({ async oku() { const i = n++; sira.push(`bas${i}`); if (i === 0) await ilk; sira.push(`son${i}`); return { satirlar, model: 'm' }; } });
    const q = new FotoOkumaKuyrugu(() => d);
    const k = kayit([{ bytes: a, width: 1, height: 1, temizYazi: true }]);
    const p1 = q.ekle(k, sonuc()), p2 = q.ekle(k, sonuc());
    await new Promise(r => setTimeout(r, 10));
    expect(sira).toEqual(['bas0']);
    bitir();
    await Promise.all([p1, p2]);
    expect(sira).toEqual(['bas0', 'son0', 'bas1', 'son1']);
  });
});
