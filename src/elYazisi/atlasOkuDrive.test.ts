import kaynak from './atlasOkuDrive.ts?raw';
import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import type { AtlasOge } from './atlasDrive';
import { atlasBellekTemizle, atlasOku, atlasOkuBellekli, okunacakSec, type AtlasOkuDrive } from './atlasOkuDrive';

interface Oge extends AtlasOge { parent: string; bytes?: Uint8Array }

const isaret = { defter: '1', defterSistem: '1' };
const json = JSON.stringify({
  tur: 'defter-el-yazisi', surum: 1, xh: 40, kodlama: 'karekok', olcek: 38.49,
  sayfa: { w: 30, h: 40 }, aralik: { harf: 0.1, kelime: 1.5 }, stiller: { kagit: [247, 246, 241] },
  renkler: { mavi: { p: [0.75, 0.56, 0.34], yogunluk: 1.25 } },
  karakterler: { a: [{ x: 1, y: 1, w: 10, h: 20, taban: 18 }] }, eksikler: []
});
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w); v.setUint32(20, h);
  b[24] = 8; b[25] = 0;
  return b;
}
const klasor = (id: string, name: string, parent: string, createdTime = '2026-10-01T00:00:00Z', appProperties: Record<string, string> = isaret): Oge =>
  ({ id, name, parent, mimeType: FOLDER_MIME, createdTime, appProperties });
const dosya = (id: string, name: string, parent: string, bytes: Uint8Array, createdTime = '2026-10-01T00:00:00Z', appProperties: Record<string, string> = isaret): Oge =>
  ({ id, name, parent, mimeType: name.endsWith('.png') ? 'image/png' : 'application/json', createdTime, appProperties, bytes });

const tam = (): Oge[] => [
  klasor('S', '_sistem', 'KOK'), klasor('E', 'el-yazisi', 'S'),
  dosya('P', 'el-yazisi-atlas.png', 'E', png(30, 40)),
  dosya('J', 'el-yazisi-atlas.json', 'E', new TextEncoder().encode(json))
];

// Only the three read methods exist: a write cannot even be called
function sahteDrive(ogeler: Oge[], kok = true) {
  const istekler: string[] = [];
  const drive: AtlasOkuDrive = {
    kok: async () => { istekler.push('kok'); return kok ? { id: 'KOK', name: 'Defter Library' } : null; },
    cocuklar: async (eb, ad) => { istekler.push(`cocuklar ${ad}`); return ogeler.filter(x => x.parent === eb && x.name === ad); },
    indir: async id => { istekler.push(`indir ${id}`); return ogeler.find(x => x.id === id)!.bytes!; }
  };
  return { drive, istekler };
}

describe('atlasOku (salt okuma)', () => {
  it('kök / klasör / dosya yok → null, hata değil', async () => {
    expect(await atlasOku(sahteDrive([], false).drive)).toBeNull();
    expect(await atlasOku(sahteDrive([]).drive)).toBeNull();
    expect(await atlasOku(sahteDrive([klasor('S', '_sistem', 'KOK')]).drive)).toBeNull();
    expect(await atlasOku(sahteDrive(tam().filter(o => o.id !== 'J')).drive)).toBeNull();
  });

  it('iki dosya okunur ve kontrol edilir', async () => {
    const d = sahteDrive(tam());
    const r = await atlasOku(d.drive);
    expect(r!.atlas.xh).toBe(40);
    expect(r!.png.length).toBe(33);
    expect(r!.uyarilar).toEqual([]);
    expect(d.istekler.filter(x => x.startsWith('indir')).sort()).toEqual(['indir J', 'indir P']);
  });

  it('çift → en eski; işaretsiz aynı ad okunmaz', async () => {
    const yeni = dosya('P2', 'el-yazisi-atlas.png', 'E', png(99, 99), '2026-10-20T00:00:00Z');
    const yabanci = dosya('P0', 'el-yazisi-atlas.png', 'E', png(1, 1), '2026-09-01T00:00:00Z', {});
    const d = sahteDrive([...tam(), yeni, yabanci]);
    const r = await atlasOku(d.drive);
    expect(r!.png).toEqual(png(30, 40));
    expect(r!.uyarilar.length).toBe(2);
  });

  it('okunacakSec: yanlış tür (klasör yerine dosya) sayılmaz', () => {
    const u: string[] = [];
    expect(okunacakSec([dosya('X', '_sistem', 'KOK', png(1, 1))], '_sistem', true, u)).toBeNull();
    expect(u.length).toBe(1);
  });

  it('bozuk JSON → hata (kullanıcıya ne yapacağı söylenir)', async () => {
    const o = tam();
    o[3].bytes = new TextEncoder().encode('{');
    await expect(atlasOku(sahteDrive(o).drive)).rejects.toThrow(/uret.py paket/);
  });

  it('bellek: aynı anda iki çağrı tek indirme; hata unutulur', async () => {
    atlasBellekTemizle();
    const d = sahteDrive(tam());
    const [a, b] = await Promise.all([atlasOkuBellekli(d.drive), atlasOkuBellekli(d.drive)]);
    expect(a).toBe(b);
    expect(d.istekler.filter(x => x.startsWith('indir')).length).toBe(2);
    await atlasOkuBellekli(d.drive);
    expect(d.istekler.filter(x => x === 'kok').length).toBe(1);

    atlasBellekTemizle();
    const bozuk = tam(); bozuk[3].bytes = new TextEncoder().encode('{');
    await expect(atlasOkuBellekli(sahteDrive(bozuk).drive)).rejects.toThrow();
    const r = await atlasOkuBellekli(sahteDrive(tam()).drive);
    expect(r!.atlas.xh).toBe(40);
    atlasBellekTemizle();
  });

  it('gerçek Drive kodu sadece saltOkunurFetch kullanır (yazma isteği yok)', () => {
    expect(kaynak).not.toMatch(/driveFetch\(|updateJson|method:/);
    expect(kaynak).toMatch(/saltOkunurFetch\(/);
  });
});
