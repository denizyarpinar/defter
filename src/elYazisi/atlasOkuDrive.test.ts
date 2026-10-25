import kaynak from './atlasOkuDrive.ts?raw';
import { describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import type { AtlasOge } from './atlasDrive';
import { atlasBellekTemizle, atlasOku, atlasOkuBellekli, atlasTazelemesi, kopyaCoz, okunacakSec, type AtlasKopya, type AtlasOkuDrive, type AtlasOnbellegi } from './atlasOkuDrive';

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

// ---- task 6.4e-2b: one search, the copy on the device ----

const mt = (o: Oge, modifiedTime: string): Oge => ({ ...o, modifiedTime });
const tamMt = (pngMt = 'p1', jsonMt = 'j1'): Oge[] => { const o = tam(); return [o[0], o[1], mt(o[2], pngMt), mt(o[3], jsonMt)]; };

function topluDrive(ogeler: Oge[], o: { cok?: boolean } = {}) {
  const d = sahteDrive(ogeler);
  d.drive.toplu = async adlar => {
    d.istekler.push('toplu');
    return o.cok ? null : ogeler.filter(x => adlar.includes(x.name)).map(x => ({ ...x, parents: [x.parent] }));
  };
  return d;
}

function sahteOnbellek(ilk: unknown = null) {
  const durum = { deger: ilk, yazilan: 0, silinen: 0 };
  const onbellek: AtlasOnbellegi = {
    oku: async () => durum.deger,
    yaz: async k => { durum.deger = k; durum.yazilan++; },
    sil: async () => { durum.deger = null; durum.silinen++; },
  };
  return { onbellek, durum };
}

describe('atlasOku: one search (6.4e-2b)', () => {
  it('toplu: one search instead of folder by folder; the same choice and warnings', async () => {
    const yabanci = dosya('P0', 'el-yazisi-atlas.png', 'E', png(1, 1), '2026-09-01T00:00:00Z', {});
    const baska = klasor('S2', '_sistem', 'BASKA');   // another _sistem elsewhere in Drive: not ours
    const d = topluDrive([...tam(), yabanci, baska]);
    const r = await atlasOku(d.drive);
    expect(r!.png).toEqual(png(30, 40));
    expect(r!.uyarilar.length).toBe(1);
    expect(d.istekler.filter(x => !x.startsWith('indir'))).toEqual(['kok', 'toplu']);
  });

  it('toplu says too many → folder by folder as before', async () => {
    const d = topluDrive(tam(), { cok: true });
    expect((await atlasOku(d.drive))!.atlas.xh).toBe(40);
    expect(d.istekler.filter(x => x.startsWith('cocuklar')).length).toBe(4);
  });
});

describe('atlasOkuBellekli: the copy on the device (6.4e-2b)', () => {
  it('no copy → Drive, then copied; a copy → no Drive request before the answer', async () => {
    atlasBellekTemizle();
    const c = sahteOnbellek();
    const d1 = topluDrive(tamMt());
    const ilk = await atlasOkuBellekli(d1.drive, c.onbellek);
    expect(ilk!.nereden).toBe('drive');
    expect(c.durum.yazilan).toBe(1);

    atlasBellekTemizle();   // a new session (the page reloaded)
    const d2 = topluDrive(tamMt());
    const ikinci = await atlasOkuBellekli(d2.drive, c.onbellek);
    expect(ikinci!.nereden).toBe('cihaz');
    expect(ikinci!.atlas.xh).toBe(40);
    expect(d2.istekler.filter(x => x.startsWith('indir'))).toEqual([]);
    await atlasTazelemesi();
    expect(d2.istekler).toEqual(['kok', 'toplu']);   // the check behind it: one search, nothing downloaded
    expect(c.durum.yazilan).toBe(1);
    atlasBellekTemizle();
  });

  it('changed on Drive → read behind the copy into the device (used next time)', async () => {
    atlasBellekTemizle();
    const c = sahteOnbellek();
    await atlasOkuBellekli(topluDrive(tamMt()).drive, c.onbellek);
    atlasBellekTemizle();
    const d = topluDrive(tamMt('p1', 'j2'));
    expect((await atlasOkuBellekli(d.drive, c.onbellek))!.nereden).toBe('cihaz');
    await atlasTazelemesi();
    expect(d.istekler.filter(x => x.startsWith('indir')).sort()).toEqual(['indir J', 'indir P']);
    expect((c.durum.deger as AtlasKopya).kimlik.jsonMt).toBe('j2');
    atlasBellekTemizle();
  });

  it('gone from Drive → the copy removed (the next session finds no atlas)', async () => {
    atlasBellekTemizle();
    const c = sahteOnbellek();
    await atlasOkuBellekli(topluDrive(tamMt()).drive, c.onbellek);
    atlasBellekTemizle();
    await atlasOkuBellekli(topluDrive([]).drive, c.onbellek);
    await atlasTazelemesi();
    expect(c.durum.deger).toBeNull();
    atlasBellekTemizle();
  });

  it('a broken copy / the device failing → Drive as before', async () => {
    for (const bozuk of [{ png: 'x' }, { ...{ png: png(30, 40), json: '{', kimlik: { pngId: 'P', jsonId: 'J', pngMt: '', jsonMt: '' } } }, 'hata']) {
      atlasBellekTemizle();
      const c = sahteOnbellek(bozuk);
      if (bozuk === 'hata') c.onbellek.oku = async () => { throw new Error('IndexedDB'); };
      const d = topluDrive(tamMt());
      expect((await atlasOkuBellekli(d.drive, c.onbellek))!.nereden).toBe('drive');
      expect(d.istekler.filter(x => x.startsWith('indir')).length).toBe(2);
    }
    atlasBellekTemizle();
  });

  it('kopyaCoz: only a whole, checked copy', () => {
    expect(kopyaCoz(null)).toBeNull();
    expect(kopyaCoz({ png: png(30, 40), json, kimlik: { pngId: 'P' } })).toBeNull();
    expect(kopyaCoz({ png: png(31, 40), json, kimlik: { pngId: 'P', jsonId: 'J', pngMt: 'a', jsonMt: 'b' } })).toBeNull();   // wrong size
    expect(kopyaCoz({ png: png(30, 40), json, kimlik: { pngId: 'P', jsonId: 'J', pngMt: 'a', jsonMt: 'b' } })!.nereden).toBe('cihaz');
  });
});

describe('atlasOkuBellekli: the copy stays when Drive could not answer (6.4e-2b)', () => {
  it('network error / 401 / offline behind the copy → the copy is kept (only a successful empty search removes it)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const hata of [new TypeError('Failed to fetch'), Object.assign(new Error('401'), { status: 401 }), new Error('çevrimdışı')]) {
      atlasBellekTemizle();
      const c = sahteOnbellek();
      await atlasOkuBellekli(topluDrive(tamMt()).drive, c.onbellek);
      atlasBellekTemizle();
      const d = topluDrive([]);
      d.drive.toplu = async () => { throw hata; };
      d.drive.kok = async () => { throw hata; };
      expect((await atlasOkuBellekli(d.drive, c.onbellek))!.nereden).toBe('cihaz');
      await atlasTazelemesi();
      expect(c.durum.silinen).toBe(0);
      expect((c.durum.deger as AtlasKopya).kimlik.pngId).toBe('P');
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    atlasBellekTemizle();
  });

  it('no copy and Drive fails → the error (nothing removed, tried again next time)', async () => {
    atlasBellekTemizle();
    const c = sahteOnbellek();
    const d = topluDrive(tamMt());
    d.drive.indir = async () => { throw new TypeError('Failed to fetch'); };
    await expect(atlasOkuBellekli(d.drive, c.onbellek)).rejects.toThrow();
    expect(c.durum.silinen + c.durum.yazilan).toBe(0);
    atlasBellekTemizle();
  });
});
