import { describe, expect, it } from 'vitest';
import { atlasJsonOku, atlasOku, pngBilgisi, pngKontrol, AtlasBozuk, AtlasYeniSurum } from './atlasSema';

const atlas = (o: Record<string, unknown> = {}) => ({
  tur: 'defter-el-yazisi', surum: 1, xh: 40, kodlama: 'karekok', olcek: 38.49,
  sayfa: { w: 100, h: 60 }, aralik: { harf: 0.118, kelime: 1.492 },
  stiller: { varsayilan: 'tukenmez', kagit: [247, 246, 241] },
  renkler: { mavi: { p: [0.75, 0.56, 0.34], yogunluk: 1.25 } },
  karakterler: { a: [{ x: 4, y: 4, w: 20, h: 30, taban: 28.5 }], 'Ğ': [{ x: 28, y: 4, w: 25, h: 50, taban: 40, turetilmis: true }] },
  eksikler: ['q', 'J'],
  ...o
});

// a PNG header (signature + IHDR) with the given size, bit depth and colour type
function png(w: number, h: number, bit = 8, renk = 0): Uint8Array {
  const b = new Uint8Array(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w); v.setUint32(20, h);
  b[24] = bit; b[25] = renk;
  return b;
}

describe('atlasOku', () => {
  it('geçerli atlas aynı nesne olarak döner, bilinmeyen alanlar korunur', () => {
    const x = atlas({ ekAlan: { z: 1 } });
    (x.karakterler.a[0] as Record<string, unknown>).ek = true;
    expect(atlasOku(x)).toBe(x);
    expect(atlasJsonOku(JSON.stringify(x))).toEqual(x);
  });

  it('iki kodlama da geçer', () => {
    expect(atlasOku(atlas({ kodlama: 'dogrusal' })).kodlama).toBe('dogrusal');
  });

  it('bozuk alanlar → AtlasBozuk', () => {
    const k = (o: Record<string, unknown>) => atlas({ karakterler: { a: [{ x: 4, y: 4, w: 20, h: 30, taban: 28, ...o }] } });
    const bozuklar: unknown[] = [
      null, [], 'x', atlas({ tur: 'defter-ocr' }), atlas({ surum: 0 }), atlas({ surum: '1' }), atlas({ xh: 0 }),
      atlas({ kodlama: 'log' }), atlas({ olcek: -1 }), atlas({ sayfa: { w: 0, h: 10 } }), atlas({ sayfa: { w: 2049, h: 10 } }),
      atlas({ aralik: { harf: 'x', kelime: 1 } }), atlas({ stiller: null }), atlas({ renkler: {} }),
      atlas({ renkler: { mavi: { p: [1, 2], yogunluk: 1 } } }), atlas({ renkler: { mavi: { p: [1, 2, 3], yogunluk: 0 } } }),
      atlas({ karakterler: { ab: [{ x: 0, y: 0, w: 1, h: 1, taban: 0 }] } }), atlas({ karakterler: { a: [] } }),
      k({ x: -1 }), k({ w: 0 }), k({ x: 1.5 }), k({ x: 90 }), k({ y: 40 }), k({ taban: 'x' }), k({ turetilmis: 1 }),
      atlas({ eksikler: [1] }), atlas({ eksikler: 'q' })
    ];
    for (const b of bozuklar) expect(() => atlasOku(b), JSON.stringify(b)).toThrow(AtlasBozuk);
  });

  it('yeni sürüm → AtlasYeniSurum (anlaşılır mesaj)', () => {
    expect(() => atlasOku(atlas({ surum: 2 }))).toThrow(AtlasYeniSurum);
    expect(() => atlasOku(atlas({ surum: 2 }))).toThrow(/surum 2.*yenile/);
  });

  it('JSON olmayan metin → AtlasBozuk', () => {
    expect(() => atlasJsonOku('{x')).toThrow(/geçerli JSON değil/);
  });
});

describe('PNG başlığı', () => {
  it('boyut, bit derinliği, renk türü okunur', () => {
    expect(pngBilgisi(png(2043, 389))).toEqual({ w: 2043, h: 389, bit: 8, renkTuru: 0 });
    expect(pngBilgisi(new Uint8Array(40))).toBeNull();
  });

  it('pngKontrol: 8 bit gri ve JSON boyutu', () => {
    const a = atlasOku(atlas());
    expect(pngKontrol(png(100, 60), a).w).toBe(100);
    expect(() => pngKontrol(new Uint8Array(40), a)).toThrow(/PNG değil/);
    expect(() => pngKontrol(png(100, 60, 16), a)).toThrow(/8 bit gri değil/);
    expect(() => pngKontrol(png(100, 60, 8, 2), a)).toThrow(/8 bit gri değil/);
    expect(() => pngKontrol(png(101, 60), a)).toThrow(/aynı paketten/);
  });
});

