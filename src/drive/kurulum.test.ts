import { describe, expect, it } from 'vitest';
import { parseLibrary } from '../model/parse';
import { DriveError, FOLDER_MIME } from './drive';
import { KOK_ADI } from './kok';
import {
  bosKitaplikJson, kitaplikKur, KurulumAgHatasi, KurulumBeklenmedik, KurulumIzinYok, KurulumKilitli, KurulumYazmaYok,
  type KitaplikKurSecenek, type KurulumDrive, type YeniOgeMeta
} from './kurulum';
import { IdZatenVar } from './pdfOlustur';

interface Item { name: string; parent: string; mimeType: string; createdTime: string; appProperties: Record<string, string>; icerik?: string }
type Davranis = 'ok' | 'ag' | 'agAmaOlustu' | '500' | '403';

// An in-memory Drive. 'root' is My Drive's root. Every call is recorded in `calls`.
function fakeDrive(opts: { items?: Record<string, Partial<Item> & { name: string; parent: string }>; davranis?: Davranis[]; idHata?: boolean } = {}) {
  const items = new Map<string, Item>();
  for (const [id, it] of Object.entries(opts.items ?? {})) items.set(id, { mimeType: FOLDER_MIME, createdTime: '2026-01-01T00:00:00Z', appProperties: {}, ...it });
  const davranis = [...(opts.davranis ?? [])];
  const calls: string[] = [];
  let n = 0, saat = 0;
  const yaz = (m: YeniOgeMeta, icerik?: string) => {
    const id = m.id ?? 'auto' + ++n;
    items.set(id, { name: m.name, parent: m.parents[0], mimeType: m.mimeType, createdTime: `2026-10-19T10:00:${String(saat++).padStart(2, '0')}Z`, appProperties: m.appProperties, icerik });
    return id;
  };
  const drive: KurulumDrive = {
    async adlaAra() {
      calls.push('adlaAra');
      return [...items].filter(([, i]) => i.parent === 'root' && i.name === 'Kitaplık' && i.mimeType === FOLDER_MIME).map(([id, i]) => ({ id, name: i.name, createdTime: i.createdTime }));
    },
    async defterKokAra() {
      calls.push('defterKokAra');
      return [...items].filter(([, i]) => i.appProperties.defterKok === '1' && i.mimeType === FOLDER_MIME).map(([id, i]) => ({ id, name: i.name, createdTime: i.createdTime }));
    },
    async kokCocuklari(id) {
      calls.push('kokCocuklari');
      return [...items.values()].filter(i => i.parent === id).map(i => ({ name: i.name, mimeType: i.mimeType }));
    },
    async yeniId() {
      calls.push('yeniId');
      if (opts.idHata) throw new DriveError(403, 'id');
      return 'id' + ++n;
    },
    async olustur(meta, icerik) {
      calls.push('olustur:' + meta.name);
      if (meta.id && items.has(meta.id)) throw new IdZatenVar();
      const d = davranis.shift() ?? 'ok';
      if (d === 'ag') throw new TypeError('Failed to fetch');
      if (d === 'agAmaOlustu') { yaz(meta, icerik); throw new TypeError('Failed to fetch'); }
      if (d === '500') throw new DriveError(500, 'x');
      if (d === '403') throw new DriveError(403, 'x');
      return { id: yaz(meta, icerik) };
    },
    async islemleAra(ebeveynId, ad, islemId) {
      calls.push('islemleAra:' + ad);
      return [...items].filter(([, i]) => i.parent === ebeveynId && i.name === ad && i.appProperties.defterIslem === islemId).map(([id, i]) => ({ id, name: i.name }));
    },
    async ogeBilgisi(id) {
      calls.push('ogeBilgisi');
      const i = items.get(id)!;
      return { id, name: i.name, parents: [i.parent], appProperties: i.appProperties };
    }
  };
  const olusturmalar = () => calls.filter(c => c.startsWith('olustur:'));
  return { drive, items, calls, olusturmalar };
}

const sec = (o: Partial<KitaplikKurSecenek> = {}): KitaplikKurSecenek => ({ islemId: 'islem-1', mod: 'dar', kilitAcik: true, yazabilir: () => true, bekleMs: 0, ...o });
const bul = (items: Map<string, Item>, name: string) => [...items].filter(([, i]) => i.name === name);

describe('kitaplikKur', () => {
  it('empty Drive: root → kitaplar → kitaplik.json, in this order, all marked', async () => {
    const f = fakeDrive();
    const r = await kitaplikKur(f.drive, sec());
    expect(r).toMatchObject({ kaynak: 'defterKok', zatenVardi: false, olusturulan: [KOK_ADI, 'kitaplar', 'kitaplik.json'] });
    expect(f.olusturmalar()).toEqual([`olustur:${KOK_ADI}`, 'olustur:kitaplar', 'olustur:kitaplik.json']);
    const [[kokId, kok]] = bul(f.items, KOK_ADI);
    expect(r.kokId).toBe(kokId);
    expect(kok).toMatchObject({ parent: 'root', mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: 'islem-1', defterKok: '1' } });
    const kitaplar = bul(f.items, 'kitaplar')[0][1];
    expect(kitaplar).toMatchObject({ parent: kokId, mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: 'islem-1' } });
    expect(kitaplar.appProperties.defterKok).toBeUndefined();
    const json = bul(f.items, 'kitaplik.json')[0][1];
    expect(json).toMatchObject({ parent: kokId, mimeType: 'application/json', appProperties: { defter: '1', defterIslem: 'islem-1' } });
    expect(JSON.parse(json.icerik!)).toEqual(bosKitaplikJson());
  });

  it('run again (same or new islemId): nothing created', async () => {
    const f = fakeDrive();
    await kitaplikKur(f.drive, sec());
    const once = f.olusturmalar().length;
    expect(await kitaplikKur(f.drive, sec())).toMatchObject({ zatenVardi: true, olusturulan: [] });
    expect(await kitaplikKur(f.drive, sec({ islemId: 'islem-2' }))).toMatchObject({ zatenVardi: true, olusturulan: [] });
    expect(f.olusturmalar().length).toBe(once);
    expect(f.items.size).toBe(3);
  });

  it('yarim (defterKok root without kitaplik.json): only the missing one', async () => {
    const f = fakeDrive({ items: {
      D: { name: KOK_ADI, parent: 'root', appProperties: { defter: '1', defterKok: '1', defterIslem: 'eski' } },
      K: { name: 'kitaplar', parent: 'D' }
    } });
    const r = await kitaplikKur(f.drive, sec());
    expect(r).toMatchObject({ kokId: 'D', zatenVardi: false, olusturulan: ['kitaplik.json'] });
    expect(f.olusturmalar()).toEqual(['olustur:kitaplik.json']);
  });

  it('yarim without kitaplar: kitaplar, then kitaplik.json', async () => {
    const f = fakeDrive({ items: { D: { name: KOK_ADI, parent: 'root', appProperties: { defterKok: '1' } } } });
    expect((await kitaplikKur(f.drive, sec())).olusturulan).toEqual(['kitaplar', 'kitaplik.json']);
  });

  it('two defterKok roots: the oldest is used, warning in the result', async () => {
    const f = fakeDrive({ items: {
      Y: { name: KOK_ADI, parent: 'root', createdTime: '2026-10-19T12:00:00Z', appProperties: { defterKok: '1' } },
      E: { name: KOK_ADI, parent: 'root', createdTime: '2026-10-19T08:00:00Z', appProperties: { defterKok: '1' } }
    } });
    const r = await kitaplikKur(f.drive, sec());
    expect(r.kokId).toBe('E');
    expect(r.uyari).toContain('en eskisi');
    expect(bul(f.items, 'kitaplar')[0][1].parent).toBe('E');
  });

  describe('the owner\'s old "Kitaplık" (tam mode)', () => {
    const eskiItems = (tamMi: boolean): Record<string, Partial<Item> & { name: string; parent: string }> => ({
      L: { name: 'Kitaplık', parent: 'root' },
      LK: { name: 'kitaplar', parent: 'L' },
      ...(tamMi ? { LJ: { name: 'kitaplik.json', parent: 'L', mimeType: 'application/json' } } : {})
    });
    it.each([true, false])('whole=%s: no writing at all, zatenVardi + kaynak ad', async tamMi => {
      const f = fakeDrive({ items: eskiItems(tamMi) });
      const once = f.items.size;
      expect(await kitaplikKur(f.drive, sec({ mod: 'tam' }))).toEqual({ kokId: 'L', kaynak: 'ad', zatenVardi: true, olusturulan: [] });
      expect(f.calls.filter(c => /^(olustur|yeniId|islemleAra|ogeBilgisi)/.test(c))).toEqual([]);
      expect(f.items.size).toBe(once);
      expect(f.items.get('L')!.appProperties).toEqual({});   // not marked
    });
    it('tam mode with "Kitaplık" and a defterKok root: still no second root, nothing written', async () => {
      const f = fakeDrive({ items: { ...eskiItems(false), D: { name: KOK_ADI, parent: 'root', appProperties: { defterKok: '1' } } } });
      expect(await kitaplikKur(f.drive, sec({ mod: 'tam' }))).toMatchObject({ kokId: 'L', kaynak: 'ad', zatenVardi: true });
      expect(f.olusturmalar()).toEqual([]);
    });
    it('dar mode on the same Drive: the name is ignored, the app\'s own root is made', async () => {
      const f = fakeDrive({ items: eskiItems(true) });
      const r = await kitaplikKur(f.drive, sec({ mod: 'dar' }));
      expect(r).toMatchObject({ kaynak: 'defterKok', olusturulan: [KOK_ADI, 'kitaplar', 'kitaplik.json'] });
      expect(f.calls).not.toContain('adlaAra');
      expect(f.items.get('L')!.appProperties).toEqual({});
    });
  });

  it('locked (no ?kurulum=1): KurulumKilitli, no request at all', async () => {
    const f = fakeDrive();
    await expect(kitaplikKur(f.drive, sec({ kilitAcik: false }))).rejects.toBeInstanceOf(KurulumKilitli);
    expect(f.calls).toEqual([]);
  });

  it('not signed in / sample library: KurulumYazmaYok, no request at all', async () => {
    const f = fakeDrive();
    await expect(kitaplikKur(f.drive, sec({ yazabilir: () => false }))).rejects.toBeInstanceOf(KurulumYazmaYok);
    expect(f.calls).toEqual([]);
  });

  it('network error and 500: retried with the same id, one root only', async () => {
    const f = fakeDrive({ davranis: ['ag', '500'] });
    const r = await kitaplikKur(f.drive, sec());
    expect(r.olusturulan).toEqual([KOK_ADI, 'kitaplar', 'kitaplik.json']);
    expect(f.olusturmalar().filter(c => c === `olustur:${KOK_ADI}`).length).toBe(3);
    expect(bul(f.items, KOK_ADI).length).toBe(1);
  });

  it('arrived but the answer was lost: 409 with the same id → counted as there, no duplicate', async () => {
    const f = fakeDrive({ davranis: ['agAmaOlustu'] });
    await kitaplikKur(f.drive, sec());
    expect(bul(f.items, KOK_ADI).length).toBe(1);
    expect(f.calls).toContain('ogeBilgisi');
  });

  it('409 for an id that is someone else\'s: KurulumBeklenmedik', async () => {
    const f = fakeDrive({ items: { id1: { name: 'baska', parent: 'x' } } });
    await expect(kitaplikKur(f.drive, sec())).rejects.toBeInstanceOf(KurulumBeklenmedik);
  });

  it('generateIds not allowed: created without id; after a lost answer the islemId search finds it', async () => {
    const f = fakeDrive({ idHata: true, davranis: ['agAmaOlustu'] });
    const r = await kitaplikKur(f.drive, sec());
    expect(r.olusturulan).toEqual([KOK_ADI, 'kitaplar', 'kitaplik.json']);
    expect(bul(f.items, KOK_ADI).length).toBe(1);
    expect(f.olusturmalar().filter(c => c === `olustur:${KOK_ADI}`).length).toBe(1);
  });

  it('an earlier half try with the same islemId: found by islemId, not created again', async () => {
    const f = fakeDrive({ items: { D: { name: KOK_ADI, parent: 'root', appProperties: { defterKok: '1', defterIslem: 'islem-1' } } } });
    // the earlier kitaplar try did arrive, but Drive's list (kokCocuklari) doesn't show it yet
    const cocuklar = f.drive.kokCocuklari;
    f.drive.kokCocuklari = async id => (await cocuklar(id)).filter(c => c.name !== 'kitaplar');
    f.items.set('K', { name: 'kitaplar', parent: 'D', mimeType: FOLDER_MIME, createdTime: '', appProperties: { defter: '1', defterIslem: 'islem-1' } });
    const r = await kitaplikKur(f.drive, sec());
    expect(r.olusturulan).toEqual(['kitaplar', 'kitaplik.json']);
    expect(f.olusturmalar()).toEqual(['olustur:kitaplik.json']);
    expect(bul(f.items, 'kitaplar').length).toBe(1);
  });

  it('403: KurulumIzinYok', async () => {
    const f = fakeDrive({ davranis: ['403'] });
    await expect(kitaplikKur(f.drive, sec())).rejects.toBeInstanceOf(KurulumIzinYok);
  });

  it('network down for every try: KurulumAgHatasi; the next run finishes without a duplicate', async () => {
    const f = fakeDrive({ davranis: ['ok', 'ag', 'ag', 'ag'] });
    await expect(kitaplikKur(f.drive, sec())).rejects.toBeInstanceOf(KurulumAgHatasi);
    const r = await kitaplikKur(f.drive, sec());
    expect(r.olusturulan).toEqual(['kitaplar', 'kitaplik.json']);
    expect(bul(f.items, KOK_ADI).length).toBe(1);
  });

  it('kitaplik.json content reads back as 5 empty shelves', () => {
    const lib = parseLibrary(bosKitaplikJson());
    expect(lib.raflar.length).toBe(5);
    expect(lib.raflar.every(r => r.kitaplar.length === 0)).toBe(true);
    expect(lib.raflar.map(r => r.ad)).toEqual(['Raf 1', 'Raf 2', 'Raf 3', 'Raf 4', 'Raf 5']);
  });
});
