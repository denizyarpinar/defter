import { describe, expect, it, vi, beforeEach } from 'vitest';
import { YerDisi } from '../../drive/pdfOlustur';
import { duzeltmeYaz, kaydirmaYaz, kayitOkuDrive, sayfaYaz, MAX_TUR, OcrKayitCakisma, OcrKayitYok, OcrOrnekYazmaYok, type OcrDrive, type OcrKaynakDosya } from './kayitDrive';
import { kelimeDegistir, OcrSayfaDegisti, type DuzeltmeHedefi } from './elleDuzelt';
import { ocrKaydir } from '../../kitap/sayfaKaydir';
import { bosKayit, OcrKayitBozuk, OcrKayitYeniSurum, type OcrKayit, type OcrSayfa } from './sema';

// Task 6.4c-1: a fake Drive in memory. There is no delete / trash in OcrDrive at all; the tests also check
// that only the main file is written.

const K: OcrKaynakDosya = { id: 'pdf1', ad: 'ozet.pdf', klasorId: 'konu1' };
const s = (sayfa: number, parmakIzi: string, okunma = '2026-10-24T10:00:00.000Z'): OcrSayfa =>
  ({ sayfa, parmakIzi, model: 'deneme', okunma, dondurme: 0, satirlar: [{ girinti: 0, parcalar: [{ metin: parmakIzi, renk: 'mavi' }] }] });
const kayit = (...sayfalar: OcrSayfa[]): OcrKayit => ({ ...bosKayit(K), sayfalar });

interface Dosya { id: string; createdTime: string; metin: string; surum: number }

function sahte(o: { yerDisi?: boolean; aramadaGecikme?: boolean } = {}) {
  const dosyalar: Dosya[] = [];
  let sayac = 0;
  let aramaGecik = o.aramadaGecikme ?? false;
  const yazilan: string[] = [];
  let araSonrasi: (() => void) | null = null;   // a hook after each durum answer: "another device" acts
  const drive: OcrDrive = {
    ara: vi.fn(async () => {
      const r = dosyalar.filter(d => !(aramaGecik && d.id === 'yeni1')).map(d => ({ id: d.id, createdTime: d.createdTime }));
      aramaGecik = false;
      return r;
    }),
    durum: vi.fn(async (id: string) => {
      const d = dosyalar.find(x => x.id === id)!;
      const r = { modifiedTime: `t${d.surum}`, headRevisionId: `h${d.surum}` };
      araSonrasi?.();
      return r;
    }),
    oku: vi.fn(async (id: string) => dosyalar.find(x => x.id === id)!.metin),
    yaz: vi.fn(async (id: string, k: OcrKayit) => {
      const d = dosyalar.find(x => x.id === id)!;
      d.metin = JSON.stringify(k); d.surum++; yazilan.push(id);
    }),
    olustur: vi.fn(async (_k, k: OcrKayit) => {
      const id = `yeni${++sayac}`;
      dosyalar.push({ id, createdTime: `2026-10-24T12:00:0${sayac}.000Z`, metin: JSON.stringify(k), surum: 1 });
      return id;
    }),
    yerKontrol: vi.fn(async () => { if (o.yerDisi) throw new YerDisi(); })
  };
  const ekle = (id: string, createdTime: string, k: unknown) => dosyalar.push({ id, createdTime, metin: typeof k === 'string' ? k : JSON.stringify(k), surum: 1 });
  const icerik = (id: string) => JSON.parse(dosyalar.find(x => x.id === id)!.metin) as OcrKayit;
  return { drive, dosyalar, yazilan, ekle, icerik, kanca: (f: (() => void) | null) => { araSonrasi = f; } };
}

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

describe('sayfaYaz', () => {
  it('dosya yok: yer kontrolü → oluştur (içinde sayfa) → tekrar ara; ikinci çağrı aynı dosyayı günceller', async () => {
    const f = sahte();
    const r1 = await sayfaYaz(f.drive, K, s(1, 'a'));
    expect(r1).toMatchObject({ dosyaId: 'yeni1', yeni: true, kopyaSayisi: 1 });
    expect(f.drive.yerKontrol).toHaveBeenCalledWith('konu1');
    expect(f.drive.ara).toHaveBeenCalledTimes(2);
    expect(f.icerik('yeni1').sayfalar.map(x => x.parmakIzi)).toEqual(['a']);

    const r2 = await sayfaYaz(f.drive, K, s(2, 'b'));
    expect(r2).toMatchObject({ dosyaId: 'yeni1', yeni: false, kopyaSayisi: 1 });
    expect(f.drive.olustur).toHaveBeenCalledTimes(1);
    expect(f.dosyalar).toHaveLength(1);
    expect(f.icerik('yeni1').sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'b']);
  });

  it('aynı parmak izi tekrar okunursa yeni okuma yerini alır', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(s(1, 'a', '2026-10-24T09:00:00Z')));
    const yeni = { ...s(1, 'a', '2026-10-24T11:00:00Z'), model: 'claude-haiku-5-5' };
    await sayfaYaz(f.drive, K, yeni);
    expect(f.icerik('o1').sayfalar).toEqual([yeni]);
  });

  it('bilinmeyen alanlar korunur', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', { ...kayit(s(1, 'a')), gelecek: { x: 1 } });
    await sayfaYaz(f.drive, K, s(2, 'b'));
    expect((f.icerik('o1') as unknown as { gelecek: unknown }).gelecek).toEqual({ x: 1 });
  });

  it('arada başka cihaz yazarsa baştan; sonunda onun sayfası da kalır', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(s(1, 'a')));
    let kez = 0;
    f.kanca(() => {
      // right after the first durum of round 1: another device writes page c
      if (++kez === 1) { const d = f.dosyalar[0]; d.metin = JSON.stringify(kayit(s(1, 'a'), s(3, 'c'))); d.surum++; }
    });
    await sayfaYaz(f.drive, K, s(2, 'b'));
    expect(f.drive.oku).toHaveBeenCalledTimes(2);
    expect(f.icerik('o1').sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'b', 'c']);
  });

  it(`hep değişirse ${MAX_TUR} denemeden sonra OcrKayitCakisma, yazma yok`, async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit());
    let kez = 0;
    f.kanca(() => { if (++kez % 2 === 1) f.dosyalar[0].surum++; });   // after every round's first durum
    await expect(sayfaYaz(f.drive, K, s(1, 'a'))).rejects.toThrow(OcrKayitCakisma);
    expect(f.drive.oku).toHaveBeenCalledTimes(MAX_TUR);
    expect(f.yazilan).toEqual([]);
  });

  it('iki dosya: en eski asıl; diğerinin sayfaları asıla birleşir; diğerine yazılmaz, silinmez', async () => {
    const f = sahte();
    f.ekle('genc', '2026-10-20T00:00:00Z', kayit(s(5, 'e')));
    f.ekle('yasli', '2026-10-01T00:00:00Z', kayit(s(1, 'a')));
    const r = await sayfaYaz(f.drive, K, s(2, 'b'));
    expect(r).toMatchObject({ dosyaId: 'yasli', yeni: false, kopyaSayisi: 2 });
    expect(f.yazilan).toEqual(['yasli']);
    expect(f.icerik('yasli').sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'b', 'e']);
    expect(f.dosyalar.map(d => d.id)).toEqual(['genc', 'yasli']);
    expect(f.icerik('genc').sayfalar.map(x => x.parmakIzi)).toEqual(['e']);
  });

  it('oluşturunca başka cihazın dosyası da çıkarsa: en eski asıl, bizim sayfamız ona da yazılır', async () => {
    const f = sahte();
    (f.drive.olustur as ReturnType<typeof vi.fn>).mockImplementationOnce(async (_k, k: OcrKayit) => {
      f.ekle('baska', '2026-10-24T11:59:00.000Z', kayit(s(9, 'z')));   // created a moment earlier
      f.ekle('bizim', '2026-10-24T12:00:00.000Z', k);
      return 'bizim';
    });
    const r = await sayfaYaz(f.drive, K, s(1, 'a'));
    expect(r).toMatchObject({ dosyaId: 'baska', yeni: true, kopyaSayisi: 2 });
    expect(f.yazilan).toEqual(['baska']);
    expect(f.icerik('baska').sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'z']);
    expect(f.dosyalar).toHaveLength(2);
  });

  it('oluşturulan dosya aramada henüz görünmüyorsa yine o dosya kullanılır, ikinci dosya açılmaz', async () => {
    const f = sahte({ aramadaGecikme: true });
    // the first search (before creating) is empty anyway; the delay hides yeni1 in the second
    (f.drive.ara as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => []);
    const r = await sayfaYaz(f.drive, K, s(1, 'a'));
    expect(r).toMatchObject({ dosyaId: 'yeni1', yeni: true, kopyaSayisi: 1 });
    expect(f.drive.olustur).toHaveBeenCalledTimes(1);
  });

  it('bozuk JSON, başka PDF’in kaydı, yeni sürüm: hata, yazma yok', async () => {
    for (const [icerik, hata] of [['{ yarım', OcrKayitBozuk], [{ ...kayit(), kaynak: { id: 'baska', ad: 'x.pdf' } }, OcrKayitBozuk], [{ ...kayit(), surum: 2 }, OcrKayitYeniSurum]] as const) {
      const f = sahte();
      f.ekle('o1', '2026-10-01T00:00:00Z', icerik);
      await expect(sayfaYaz(f.drive, K, s(1, 'a'))).rejects.toThrow(hata);
      expect(f.yazilan).toEqual([]);
    }
  });

  it('bozuk kopya atlanır (uyarı), asıl yine yazılır', async () => {
    const f = sahte();
    f.ekle('yasli', '2026-10-01T00:00:00Z', kayit(s(1, 'a')));
    f.ekle('bozuk', '2026-10-02T00:00:00Z', 'değil json');
    await sayfaYaz(f.drive, K, s(2, 'b'));
    expect(f.yazilan).toEqual(['yasli']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('yer kitaplar/<kitap>/ dışında: YerDisi, dosya oluşmaz', async () => {
    const f = sahte({ yerDisi: true });
    await expect(sayfaYaz(f.drive, K, s(1, 'a'))).rejects.toThrow(YerDisi);
    expect(f.drive.olustur).not.toHaveBeenCalled();
  });

  it('örnek kitaplık: hiç istek yok', async () => {
    const f = sahte();
    await expect(sayfaYaz(f.drive, { ...K, id: 'ornek:x' }, s(1, 'a'))).rejects.toThrow(OcrOrnekYazmaYok);
    expect(f.drive.ara).not.toHaveBeenCalled();
    expect(await kayitOkuDrive(f.drive, { ...K, id: 'ornek:x' })).toEqual({ dosyaId: null, kayit: null, kopyaSayisi: 0 });
    expect(f.drive.ara).not.toHaveBeenCalled();
  });

  it('geçersiz sayfa kaydı: istek yok', async () => {
    const f = sahte();
    await expect(sayfaYaz(f.drive, K, { ...s(1, 'a'), parmakIzi: '' })).rejects.toThrow(OcrKayitBozuk);
    expect(f.drive.ara).not.toHaveBeenCalled();
  });

  it('navigator.locks varsa PDF başına kilit adıyla çalışır', async () => {
    const request = vi.fn((_ad: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    try {
      const f = sahte();
      await sayfaYaz(f.drive, K, s(1, 'a'));
      expect(request).toHaveBeenCalledWith('defter-ocr-pdf1', expect.any(Function));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('sayfaYaz sonucu', () => {
  it('yazılan kayıt döner (yeni dosyada da)', async () => {
    const f = sahte();
    const r1 = await sayfaYaz(f.drive, K, s(1, 'a'));
    expect(r1.kayit).toEqual(f.icerik('yeni1'));
    const r2 = await sayfaYaz(f.drive, K, s(2, 'b'));
    expect(r2.kayit).toEqual(f.icerik('yeni1'));
  });
});

// Task 6.4e-3: a hand correction on the existing record
describe('duzeltmeYaz', () => {
  const sa = s(1, 'a');   // one part: metin 'a'
  const ok = (o: Partial<DuzeltmeHedefi> = {}): DuzeltmeHedefi =>
    ({ parmakIzi: 'a', okunma: sa.okunma, satir: 0, parca: 0, metin: 'a', gosterilen: 'a', ...o });
  const degistir = (x: Parameters<typeof kelimeDegistir>[0]) => kelimeDegistir(x, 0, 'b');

  it('son hali okur, sadece o parçayı yazar; metin korunur, elle: true; diğer sayfalar aynen', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', { ...kayit(sa, s(2, 'z')), gelecek: 1 });
    const r = await duzeltmeYaz(f.drive, K, ok(), degistir);
    const k = f.icerik('o1');
    expect(r).toMatchObject({ dosyaId: 'o1', yeni: false, kopyaSayisi: 1 });
    expect(r.kayit).toEqual(k);
    expect(k.sayfalar[0].satirlar[0]).toEqual({ girinti: 0, parcalar: [{ metin: 'a', renk: 'mavi', duzeltme: 'b', elle: true }] });
    expect(k.sayfalar[1]).toEqual(s(2, 'z'));
    expect((k as unknown as { gelecek: number }).gelecek).toBe(1);
    expect(f.drive.olustur).not.toHaveBeenCalled();
  });

  it('sayfa bu arada yeniden okunmuş: OcrSayfaDegisti, yazma yok', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(s(1, 'a', '2026-10-24T12:00:00.000Z')));
    await expect(duzeltmeYaz(f.drive, K, ok(), degistir)).rejects.toThrow(OcrSayfaDegisti);
    expect(f.yazilan).toEqual([]);
  });

  it('turda başka cihaz sayfayı yeniden okursa baştan; yeni okumada parça yok → OcrSayfaDegisti', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(sa));
    // round 1 reads the old content; right after it another device writes a new reading of page 1
    (f.drive.oku as ReturnType<typeof vi.fn>).mockImplementationOnce(async (id: string) => {
      const d = f.dosyalar.find(x => x.id === id)!, eski = d.metin;
      d.metin = JSON.stringify(kayit(s(1, 'a', '2026-10-24T13:00:00.000Z'))); d.surum++;
      return eski;
    });
    await expect(duzeltmeYaz(f.drive, K, ok(), degistir)).rejects.toThrow(OcrSayfaDegisti);
    expect(f.drive.oku).toHaveBeenCalledTimes(2);
    expect(f.yazilan).toEqual([]);
  });

  it(`hep değişirse ${MAX_TUR} denemeden sonra OcrKayitCakisma`, async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(sa));
    let kez = 0;
    f.kanca(() => { if (++kez % 2 === 1) f.dosyalar[0].surum++; });
    await expect(duzeltmeYaz(f.drive, K, ok(), degistir)).rejects.toThrow(OcrKayitCakisma);
    expect(f.yazilan).toEqual([]);
  });

  it('kayıt dosyası yok: OcrKayitYok, hiçbir şey oluşturulmaz', async () => {
    const f = sahte();
    await expect(duzeltmeYaz(f.drive, K, ok(), degistir)).rejects.toThrow(OcrKayitYok);
    expect(f.drive.olustur).not.toHaveBeenCalled();
    expect(f.drive.yerKontrol).not.toHaveBeenCalled();
  });

  it('değişiklik yoksa yazılmaz; örnek kitaplıkta istek yok; kilit adı aynı', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(sa));
    await duzeltmeYaz(f.drive, K, ok(), x => x);
    expect(f.yazilan).toEqual([]);
    await expect(duzeltmeYaz(f.drive, { ...K, id: 'ornek:x' }, ok(), degistir)).rejects.toThrow(OcrOrnekYazmaYok);
    const request = vi.fn((_ad: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal('navigator', { locks: { request } });
    try {
      await duzeltmeYaz(f.drive, K, ok(), degistir);
      expect(request).toHaveBeenCalledWith('defter-ocr-pdf1', expect.any(Function));
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('kaydirmaYaz (6.S-4)', () => {
  it('kayıt yok: null, hiçbir şey oluşturulmaz', async () => {
    const f = sahte();
    expect(await kaydirmaYaz(f.drive, K, x => ocrKaydir(x, 0, 1).kayit)).toBeNull();
    expect(f.drive.olustur).not.toHaveBeenCalled();
    expect(f.yazilan).toEqual([]);
  });

  it('son hali okur, sayfa numaralarını kaydırıp ana dosyaya yazar; değişiklik yoksa yazmaz', async () => {
    const f = sahte();
    f.ekle('o1', '2026-10-01T00:00:00Z', kayit(s(1, 'a'), s(2, 'b')));
    const r = await kaydirmaYaz(f.drive, K, x => ocrKaydir(x, 1, 1).kayit);
    expect(f.icerik('o1').sayfalar.map(x => x.sayfa)).toEqual([1, 3]);
    expect(r?.kayit).toEqual(f.icerik('o1'));
    await kaydirmaYaz(f.drive, K, x => ocrKaydir(x, 9, 1).kayit);
    expect(f.yazilan).toEqual(['o1']);
  });

  it('örnek kitaplık: istek yok', async () => {
    const f = sahte();
    await expect(kaydirmaYaz(f.drive, { ...K, id: 'ornek:x' }, x => x)).rejects.toThrow(OcrOrnekYazmaYok);
    expect(f.drive.ara).not.toHaveBeenCalled();
  });
});

describe('kayitOkuDrive', () => {
  it('dosya yok → null; iki dosya → birleşik görünüm, en eski id', async () => {
    const f = sahte();
    expect(await kayitOkuDrive(f.drive, K)).toEqual({ dosyaId: null, kayit: null, kopyaSayisi: 0 });
    f.ekle('genc', '2026-10-20T00:00:00Z', kayit(s(2, 'b')));
    f.ekle('yasli', '2026-10-01T00:00:00Z', kayit(s(1, 'a')));
    const r = await kayitOkuDrive(f.drive, K);
    expect(r.dosyaId).toBe('yasli');
    expect(r.kopyaSayisi).toBe(2);
    expect(r.kayit?.sayfalar.map(x => x.parmakIzi)).toEqual(['a', 'b']);
    expect(f.yazilan).toEqual([]);
  });
});
