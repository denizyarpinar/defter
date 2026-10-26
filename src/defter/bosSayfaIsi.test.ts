import { describe, expect, it, vi } from 'vitest';
import type { EklenenSayfalar } from './ozeteEkle';
import { sayfaIsiCalistir, SayfaIsiYarim, yeniEklemeIsi, yeniGeriAlIsi, yeniKaldirmaIsi, yeniYapistirmaIsi, type SayfaIsi, type SayfaIsiOrtami } from './bosSayfaIsi';

// Task 6.S-4: the job's order and what is left after a failure

const sonuc = (o: Partial<EklenenSayfalar> = {}): EklenenSayfalar => ({ fileId: 'f', islemId: 'i', eskiSayfa: 3, yeniSayfa: 4, modifiedTime: 't2', headRevisionId: 'h2', bytes: new Uint8Array(), zatenVardi: false, indeks: 2, ...o });
const ekleme = () => yeniEklemeIsi({ islemId: 'i', fileId: 'f', dosyaAdi: 'ozet.pdf', klasorId: 'k', kitapId: 'b', konu: 'U/K', ekle: { komsu: 1, yon: 'sonra', desen: 'kareli' } });

function ortam(o: Partial<SayfaIsiOrtami> = {}) {
  const sira: string[] = [];
  const kayitlar: SayfaIsi[] = [];
  const m: SayfaIsiOrtami = {
    pdf: vi.fn(async () => { sira.push('pdf'); return sonuc(); }),
    kitapJson: vi.fn(async (_is, h) => { sira.push(`json ${h.indeks} ${h.delta} ${h.dosya} ${h.konu}`); }),
    ocr: vi.fn(async (_is, i, d) => { sira.push(`ocr ${i} ${d}`); }),
    kaydet: vi.fn(async is => { kayitlar.push(structuredClone(is)); }),
    sil: vi.fn(async () => { sira.push('sil'); }),
    ...o,
  };
  return { m, sira, kayitlar };
}

describe('sayfaIsiCalistir', () => {
  it('6.S-4c deftere yapıştır ve geri al: sadece PDF (sayfa kaymaz, kurdele / .ocr.json çağrılmaz)', async () => {
    const o = { islemId: 'y', fileId: 'f', dosyaAdi: 'ozet.pdf', klasorId: 'k', kitapId: 'b', konu: 'U/K' };
    for (const is of [
      yeniYapistirmaIsi({ ...o, yapistir: { indeksler: [4], desen: 'kareli' } }),
      yeniGeriAlIsi({ ...o, yapistirGeriAl: { indeks: 4, notlariSil: false } }),
    ]) {
      const f = ortam({ pdf: vi.fn(async () => { f.sira.push('pdf'); return sonuc({ indeks: undefined, eskiSayfa: 6, yeniSayfa: 6, zatenVardi: true }); }) });
      expect(await sayfaIsiCalistir(is, f.m)).toMatchObject({ indeks: 4 });
      expect(f.sira).toEqual(['pdf', 'sil']);
      expect(f.m.kitapJson).not.toHaveBeenCalled();
      expect(f.m.ocr).not.toHaveBeenCalled();
    }
  });

  it('sıra: PDF → kitap.json → .ocr.json → cihazdan sil; iş PDF\'ten sonra cihaza yazılır', async () => {
    const f = ortam();
    const is = ekleme();
    expect(await sayfaIsiCalistir(is, f.m)).toMatchObject({ indeks: 2 });
    expect(f.sira).toEqual(['pdf', 'json 2 1 ozet.pdf U/K', 'ocr 2 1', 'sil']);
    expect(f.kayitlar[0].adimlar).toEqual({ pdf: true, kitapJson: false, ocr: false });
    expect(f.kayitlar.at(-1)!.adimlar).toEqual({ pdf: true, kitapJson: true, ocr: true });
  });

  it('PDF hatası: aynen fırlar, cihaza hiçbir şey yazılmaz', async () => {
    const f = ortam({ pdf: async () => { throw new Error('ağ'); } });
    await expect(sayfaIsiCalistir(ekleme(), f.m)).rejects.toThrow('ağ');
    expect(f.m.kaydet).not.toHaveBeenCalled();
  });

  it('kitap.json hatası: SayfaIsiYarim, iş cihazda; tekrar denemede PDF tekrar yapılmaz', async () => {
    let hata = true;
    const f = ortam({ kitapJson: vi.fn(async () => { if (hata) throw new Error('çakışma'); }) });
    const is = ekleme();
    const e = await sayfaIsiCalistir(is, f.m).catch(x => x);
    expect(e).toBeInstanceOf(SayfaIsiYarim);
    expect((e as SayfaIsiYarim).adim).toBe('kitapJson');
    expect(f.m.sil).not.toHaveBeenCalled();
    hata = false;
    await sayfaIsiCalistir(is, f.m);
    expect(f.m.pdf).toHaveBeenCalledTimes(1);
    expect(f.m.ocr).toHaveBeenCalledTimes(1);
  });

  it('ocr hatası: kitap.json tekrar yazılmaz', async () => {
    let hata = true;
    const f = ortam({ ocr: vi.fn(async () => { if (hata) throw new Error('x'); }) });
    const is = ekleme();
    await expect(sayfaIsiCalistir(is, f.m)).rejects.toMatchObject({ adim: 'ocr' });
    hata = false;
    await sayfaIsiCalistir(is, f.m);
    expect(f.m.kitapJson).toHaveBeenCalledTimes(1);
  });

  it('kaldırma: delta −1; zaten kaldırılmış (cevap kaybolmuş) → kullanıcının gördüğü indeks', async () => {
    const f = ortam({ pdf: async () => sonuc({ zatenVardi: true, indeks: undefined }) });
    const is = yeniKaldirmaIsi({ islemId: 'b1', fileId: 'f', dosyaAdi: 'ozet.pdf', klasorId: null, kitapId: 'b', konu: 'U/K', kaldir: { indeks: 4, iz: 'i:x' } });
    expect((await sayfaIsiCalistir(is, f.m)).indeks).toBe(4);
    expect(f.sira).toEqual(['json 4 -1 ozet.pdf U/K', 'ocr 4 -1', 'sil']);
  });
});
