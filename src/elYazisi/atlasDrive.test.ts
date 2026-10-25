import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import { atlasYukle, sha256Hex, AtlasAdDolu, AtlasKokYok, type AtlasDosyasi, type AtlasDrive, type AtlasOge } from './atlasDrive';

// A fake Drive: items by id; every write is logged
interface Oge extends AtlasOge { parent: string; bytes?: Uint8Array }

function sahteDrive(o: { kok?: boolean; ogeler?: Oge[]; bozukIndir?: string } = {}) {
  const ogeler = new Map<string, Oge>((o.ogeler ?? []).map(x => [x.id, x]));
  const yazilar: string[] = [];
  let n = 0, saat = 100;
  const yeni = (parent: string, name: string, mimeType: string, bytes?: Uint8Array) => {
    const id = `y${++n}`;
    ogeler.set(id, { id, name, mimeType, parent, bytes, createdTime: `2026-10-25T00:00:${saat++}Z`, appProperties: { defter: '1', defterSistem: '1' } });
    return id;
  };
  const drive: AtlasDrive = {
    kok: async () => (o.kok ?? true) ? { id: 'KOK', name: 'Defter Library' } : null,
    cocuklar: async (eb, ad) => [...ogeler.values()].filter(x => x.parent === eb && x.name === ad),
    klasorOlustur: async (eb, ad) => { yazilar.push(`klasor ${ad}`); return yeni(eb, ad, FOLDER_MIME); },
    dosyaOlustur: async (eb, ad, mime, bytes) => { yazilar.push(`olustur ${ad}`); return yeni(eb, ad, mime, bytes); },
    dosyaGuncelle: async (id, _mime, bytes) => { yazilar.push(`guncelle ${id}`); ogeler.get(id)!.bytes = bytes; },
    indir: async id => id === o.bozukIndir ? new Uint8Array([1, 2]) : ogeler.get(id)!.bytes ?? new Uint8Array()
  };
  return { drive, ogeler, yazilar };
}

const bayt = (s: string) => new TextEncoder().encode(s);
const dosyalar: AtlasDosyasi[] = [
  { ad: 'el-yazisi-atlas.png', mime: 'image/png', bytes: bayt('PNG-veri') },
  { ad: 'el-yazisi-atlas.json', mime: 'application/json', bytes: bayt('{"tur":"defter-el-yazisi"}') }
];
const isaret = { defter: '1', defterSistem: '1' };
const klasor = (id: string, name: string, parent: string, createdTime = '2026-10-01T00:00:00Z', appProperties: Record<string, string> = isaret): Oge =>
  ({ id, name, parent, mimeType: FOLDER_MIME, createdTime, appProperties });
const dosya = (id: string, name: string, parent: string, createdTime = '2026-10-01T00:00:00Z', appProperties: Record<string, string> = isaret): Oge =>
  ({ id, name, parent, mimeType: 'image/png', createdTime, appProperties, bytes: bayt('eski') });

describe('atlasYukle', () => {
  it('klasör yok → _sistem ve el-yazisi oluşturulur, iki dosya oluşturulur, geri okunan aynı', async () => {
    const d = sahteDrive();
    const r = await atlasYukle(d.drive, dosyalar);
    expect(d.yazilar).toEqual(['klasor _sistem', 'klasor el-yazisi', 'olustur el-yazisi-atlas.png', 'olustur el-yazisi-atlas.json']);
    const sistem = [...d.ogeler.values()].find(x => x.name === '_sistem')!;
    expect(sistem.parent).toBe('KOK');
    expect([...d.ogeler.values()].find(x => x.name === 'el-yazisi')!.parent).toBe(sistem.id);
    expect(r.tamam).toBe(true);
    expect(r.dosyalar.map(x => x.islem)).toEqual(['olusturuldu', 'olusturuldu']);
    expect(r.dosyalar[0].sha256).toBe(await sha256Hex(dosyalar[0].bytes));
    expect(r.dosyalar[0].driveBoyut).toBe(dosyalar[0].bytes.length);
  });

  it('dosya var → içeriği güncellenir, yeni dosya oluşmaz', async () => {
    const d = sahteDrive({ ogeler: [klasor('S', '_sistem', 'KOK'), klasor('E', 'el-yazisi', 'S'), dosya('P', 'el-yazisi-atlas.png', 'E')] });
    const r = await atlasYukle(d.drive, dosyalar);
    expect(d.yazilar).toEqual(['guncelle P', 'olustur el-yazisi-atlas.json']);
    expect(r.dosyalar[0]).toMatchObject({ id: 'P', islem: 'guncellendi', esit: true });
    expect(d.ogeler.get('P')!.bytes).toEqual(dosyalar[0].bytes);
  });

  it('çift klasör ve çift dosya → en eskisi kullanılır, diğerlerine dokunulmaz, uyarı', async () => {
    const d = sahteDrive({ ogeler: [
      klasor('S2', '_sistem', 'KOK', '2026-10-05T00:00:00Z'), klasor('S1', '_sistem', 'KOK', '2026-10-02T00:00:00Z'),
      klasor('E', 'el-yazisi', 'S1'),
      dosya('P2', 'el-yazisi-atlas.png', 'E', '2026-10-09T00:00:00Z'), dosya('P1', 'el-yazisi-atlas.png', 'E', '2026-10-03T00:00:00Z')
    ] });
    const r = await atlasYukle(d.drive, dosyalar);
    expect(d.yazilar).toEqual(['guncelle P1', 'olustur el-yazisi-atlas.json']);
    expect(d.ogeler.get('P2')!.bytes).toEqual(bayt('eski'));
    expect(r.uyarilar).toHaveLength(2);
    expect(r.uyarilar[0]).toMatch(/_sistem.*en eskisi/);
  });

  it('işaretsiz aynı adlı klasör → AtlasAdDolu, hiçbir şey yazılmaz', async () => {
    const d = sahteDrive({ ogeler: [klasor('S', '_sistem', 'KOK', undefined, {})] });
    await expect(atlasYukle(d.drive, dosyalar)).rejects.toThrow(AtlasAdDolu);
    expect(d.yazilar).toEqual([]);
  });

  it('işaretsiz aynı adlı dosya → AtlasAdDolu, iki dosyadan hiçbiri yazılmaz', async () => {
    const d = sahteDrive({ ogeler: [klasor('S', '_sistem', 'KOK'), klasor('E', 'el-yazisi', 'S'), dosya('J', 'el-yazisi-atlas.json', 'E', undefined, {})] });
    await expect(atlasYukle(d.drive, dosyalar)).rejects.toThrow(/el-yazisi-atlas\.json.*dokunulmadı/);
    expect(d.yazilar).toEqual([]);
  });

  it('aynı adlı klasör yerine dosya → AtlasAdDolu', async () => {
    const d = sahteDrive({ ogeler: [dosya('S', '_sistem', 'KOK')] });
    await expect(atlasYukle(d.drive, dosyalar)).rejects.toThrow(AtlasAdDolu);
    expect(d.yazilar).toEqual([]);
  });

  it('kök yok → AtlasKokYok, hiç istek yok', async () => {
    const d = sahteDrive({ kok: false });
    await expect(atlasYukle(d.drive, dosyalar)).rejects.toThrow(AtlasKokYok);
    expect(d.yazilar).toEqual([]);
  });

  it('geri okunan farklı → esit false, tamam false', async () => {
    const d = sahteDrive({ bozukIndir: 'y3' });
    const r = await atlasYukle(d.drive, dosyalar);
    expect(r.tamam).toBe(false);
    expect(r.dosyalar[0]).toMatchObject({ esit: false, driveBoyut: 2 });
    expect(r.dosyalar[1].esit).toBe(true);
  });
});
