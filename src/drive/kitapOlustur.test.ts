import { describe, expect, it } from 'vitest';
import { kitapPlani } from '../kitap/kitapPlani';
import { DriveError, FOLDER_MIME } from './drive';
import {
  AyniKitapVar, ebeveynGecerliMi, islemOzeti, kitapOlustur, KitapOlusturAgHatasi, KitapOlusturBeklenmedik, KitapOlusturIzinYok,
  KitapOlusturKilitli, KitapOlusturYazmaYok, KitaplikYapisiBeklenmedik, rafaEkle, RafKaydiCakisma, YarimKitapVar, yeniKitapIslemi, type KitapOlusturDrive, type KitapOlusturSecenek
} from './kitapOlustur';
import type { YeniOgeMeta } from './kurulum';
import { IdZatenVar } from './pdfOlustur';

interface Item { name: string; parent: string; mimeType: string; appProperties: Record<string, string>; icerik?: string; trashed?: boolean }
type Davranis = 'ok' | 'ag' | 'agAmaOlustu' | '500' | '403';

// An in-memory Drive with a set-up "Defter Library" (kok) → kitaplar + kitaplik.json. Every call is in `calls`.
function fakeDrive(opts: { items?: Record<string, Partial<Item> & { name: string; parent: string }>; sil?: string[]; davranis?: Davranis[]; raflar?: unknown; yazHata?: Davranis[]; mtimeDegis?: number } = {}) {
  const items = new Map<string, Item>([
    ['kok', { name: 'Defter Library', parent: 'root', mimeType: FOLDER_MIME, appProperties: { defter: '1', defterKok: '1' } }],
    ['kitaplar', { name: 'kitaplar', parent: 'kok', mimeType: FOLDER_MIME, appProperties: { defter: '1' } }],
    ['lib', {
      name: 'kitaplik.json', parent: 'kok', mimeType: 'application/json', appProperties: { defter: '1' },
      icerik: JSON.stringify(opts.raflar ?? { surum: 1, raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: ['eski'] }, { id: 'raf-2', ad: 'Raf 2', kitaplar: [] }], oda: { duvar: '#fff' }, bilinmeyen: 7 })
    }]
  ]);
  for (const [id, it] of Object.entries(opts.items ?? {})) items.set(id, { mimeType: FOLDER_MIME, appProperties: {}, ...it });
  for (const id of opts.sil ?? []) items.delete(id);
  const davranis = [...(opts.davranis ?? [])];
  const yazHata = [...(opts.yazHata ?? [])];
  let mtime = 1, mtimeDegis = opts.mtimeDegis ?? 0;
  const calls: string[] = [];
  let n = 0;
  const canli = (id: string) => { const i = items.get(id); return i && !i.trashed ? i : undefined; };
  const drive: KitapOlusturDrive = {
    async adlaAra() { calls.push('adlaAra'); return []; },
    async defterKokAra() { calls.push('defterKokAra'); return [{ id: 'kok', name: 'Defter Library' }]; },
    async kokCocuklari(id) {
      calls.push('kokCocuklari');
      return [...items].filter(([, i]) => i.parent === id && !i.trashed).map(([cid, i]) => ({ id: cid, name: i.name, mimeType: i.mimeType }));
    },
    async yeniId() { calls.push('yeniId'); return 'id' + ++n; },
    async yeniIdler(k) { calls.push('yeniIdler:' + k); return Array.from({ length: k }, () => 'id' + ++n); },
    async olustur(meta: YeniOgeMeta, icerik) {
      calls.push('olustur:' + meta.name);
      if (meta.id && items.has(meta.id)) throw new IdZatenVar();
      const d = davranis.shift() ?? 'ok';
      if (d === 'ag') throw new TypeError('Failed to fetch');
      if (d === '500') throw new DriveError(500, 'x');
      if (d === '403') throw new DriveError(403, 'x');
      const id = meta.id ?? 'auto' + ++n;
      items.set(id, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, appProperties: meta.appProperties, icerik: icerik as string | undefined });
      if (d === 'agAmaOlustu') throw new TypeError('Failed to fetch');
      return { id };
    },
    async islemleAra(ebeveynId, ad, islemId) {
      calls.push('islemleAra');
      return [...items].filter(([, i]) => i.parent === ebeveynId && i.name === ad && i.appProperties.defterIslem === islemId).map(([id, i]) => ({ id, name: i.name }));
    },
    async cocukAra(ebeveynId, ad) {
      calls.push('cocukAra:' + ad);
      return [...items].filter(([, i]) => i.parent === ebeveynId && i.name === ad && !i.trashed).map(([id, i]) => ({ id, name: i.name, appProperties: i.appProperties }));
    },
    async ogeBilgisi(id) {
      const i = items.get(id)!;
      return { id, name: i.name, parents: [i.parent], appProperties: i.appProperties };
    },
    async oge(id) {
      calls.push('oge');
      const i = items.get(id);
      return i ? { id, name: i.name, parents: [i.parent], appProperties: i.appProperties, trashed: !!i.trashed } : null;
    },
    async islemAra(islemId) {
      calls.push('islemAra');
      return [...items].filter(([id, i]) => canli(id) && i.appProperties.defterIslem === islemId).map(([id, i]) => ({ id, name: i.name }));
    },
    async jsonOku(id) {
      calls.push('jsonOku');
      // another device writes kitaplik.json while it is read (mtimeDegis times)
      if (mtimeDegis > 0) { mtimeDegis--; mtime++; }
      return JSON.parse(items.get(id)!.icerik!);
    },
    async degisimZamani() { calls.push('degisimZamani'); return 't' + mtime; },
    async jsonYaz(id, obj) {
      calls.push('jsonYaz');
      const d = yazHata.shift() ?? 'ok';
      if (d === 'ag') throw new TypeError('Failed to fetch');
      if (d === '403') throw new DriveError(403, 'x');
      items.get(id)!.icerik = JSON.stringify(obj);
      mtime++;
    }
  };
  const olusturmalar = () => calls.filter(c => c.startsWith('olustur:'));
  const kitaplik = () => JSON.parse(items.get('lib')!.icerik!) as { raflar: { id: string; kitaplar: string[] }[]; [k: string]: unknown };
  return { drive, items, calls, olusturmalar, kitaplik };
}

const plan = (kitapAdi = 'Mathe 2', rafId = 'raf-2') => kitapPlani({
  kitapAdi, rafId, renk: '#24476b', mevcutIdler: [],
  uniteler: [{ ad: 'Logik', konular: ['Aussagenlogik', 'Beweisen'] }, { ad: 'Mengen', konular: ['Relationen'] }]
});
const sec = (o: Partial<KitapOlusturSecenek> = {}): KitapOlusturSecenek =>
  ({ kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, bekleMs: 0, ...o });
const ad = (items: Map<string, Item>, name: string) => [...items].find(([, i]) => i.name === name)!;

const SIRA = [
  'olustur:mathe-2', 'olustur:Unite-01-Logik', 'olustur:Unite-02-Mengen',
  'olustur:Konu-01-Aussagenlogik', 'olustur:Konu-02-Beweisen', 'olustur:Konu-03-Relationen', 'olustur:kitap.json'
];

describe('kitapOlustur', () => {
  it('in order: book folder → units → topics → kitap.json → the shelf; all marked, ids taken beforehand', async () => {
    const f = fakeDrive();
    const islem = yeniKitapIslemi('islem-1', plan());
    const ilerleme: string[] = [];
    const r = await kitapOlustur(f.drive, islem, sec({ ilerleme: (i, n) => ilerleme.push(`${i}/${n}`) }));
    expect(f.olusturmalar()).toEqual(SIRA);
    expect(f.calls.filter(c => c.startsWith('yeniIdler'))).toEqual(['yeniIdler:7']);
    expect(r).toEqual({ kitapId: 'mathe-2', olusturulan: 7, vardi: [], rafa: 'raf-2', kitaplikYok: false });
    expect(ilerleme.at(-1)).toBe('8/8');
    expect(ilerleme).toHaveLength(8);   // after every item and the shelf

    const [kitapId, kitap] = ad(f.items, 'mathe-2');
    expect(kitapId).toBe(islem.idler![0]);
    expect(kitap).toMatchObject({ parent: 'kitaplar', mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: 'islem-1' } });
    const [uniteId] = ad(f.items, 'Unite-01-Logik');
    expect(ad(f.items, 'Unite-01-Logik')[1].parent).toBe(kitapId);
    expect(ad(f.items, 'Konu-02-Beweisen')[1].parent).toBe(uniteId);
    expect(ad(f.items, 'Konu-03-Relationen')[1].parent).toBe(ad(f.items, 'Unite-02-Mengen')[0]);
    for (const [id, i] of f.items) if (islem.idler!.includes(id)) expect(i.appProperties).toEqual({ defter: '1', defterIslem: 'islem-1' });

    const json = ad(f.items, 'kitap.json')[1];
    expect(json).toMatchObject({ parent: kitapId, mimeType: 'application/json' });
    expect(JSON.parse(json.icerik!)).toEqual(plan().kitapJson);
    // the shelf entry: only added, everything else as it was
    expect(f.kitaplik()).toEqual({ surum: 1, raflar: [{ id: 'raf-1', ad: 'Raf 1', kitaplar: ['eski'] }, { id: 'raf-2', ad: 'Raf 2', kitaplar: ['mathe-2'] }], oda: { duvar: '#fff' }, bilinmeyen: 7 });
    expect(islemOzeti(islem)).toBe('işlem: islem-1\ndurum: 8/8\nvardı: yok\nraf: raf-2');
  });

  it('no connection at item 3 (3 tries) → KitapOlusturAgHatasi; "Tekrar dene" goes on where it stopped, nothing twice', async () => {
    const f = fakeDrive({ davranis: ['ok', 'ok', 'ag', 'ag', 'ag'] });
    const islem = yeniKitapIslemi('islem-1', plan());
    await expect(kitapOlustur(f.drive, islem, sec())).rejects.toBeInstanceOf(KitapOlusturAgHatasi);
    expect(f.olusturmalar()).toEqual([...SIRA.slice(0, 2), ...Array(3).fill(SIRA[2])]);
    const once = f.olusturmalar().length;

    const r = await kitapOlustur(f.drive, islem, sec());
    expect(f.calls.filter(c => c === 'oge')).toEqual(['oge']);   // item 3 was tried: asked by id first
    expect(f.olusturmalar().slice(once)).toEqual(SIRA.slice(2));
    expect(r.vardi).toEqual(['kitaplar/mathe-2', 'kitaplar/mathe-2/Unite-01-Logik']);
    for (const name of ['mathe-2', 'Unite-01-Logik', 'Unite-02-Mengen', 'kitap.json']) expect([...f.items.values()].filter(i => i.name === name)).toHaveLength(1);
    expect(f.kitaplik().raflar[1].kitaplar).toEqual(['mathe-2']);
  });

  it('a lost answer with a retry inside one try: Drive\'s 409 on the same id = ours', async () => {
    const f = fakeDrive({ davranis: ['agAmaOlustu'] });
    await kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec());
    expect(f.olusturmalar().slice(0, 2)).toEqual(['olustur:mathe-2', 'olustur:mathe-2']);
    expect([...f.items.values()].filter(i => i.name === 'mathe-2')).toHaveLength(1);
  });

  it('made-up error (window.defterSihirbazHata): n before, -n after writing item n; once', async () => {
    const f = fakeDrive();
    const islem = yeniKitapIslemi('islem-1', plan());
    let hata: number | undefined = 3;
    const yapayHata = () => { const n = hata; hata = undefined; return n; };
    await expect(kitapOlustur(f.drive, islem, sec({ yapayHata }))).rejects.toBeInstanceOf(KitapOlusturAgHatasi);
    expect(f.olusturmalar()).toEqual(SIRA.slice(0, 2));
    expect(islemOzeti(islem)).toMatch(/durum: 2\/8/);
    await kitapOlustur(f.drive, islem, sec({ yapayHata }));
    expect(f.olusturmalar()).toEqual(SIRA);

    const g = fakeDrive();
    const islem2 = yeniKitapIslemi('islem-2', plan());
    hata = -2;
    await expect(kitapOlustur(g.drive, islem2, sec({ yapayHata }))).rejects.toBeInstanceOf(KitapOlusturAgHatasi);
    expect(g.olusturmalar()).toEqual(SIRA.slice(0, 2));
    const r = await kitapOlustur(g.drive, islem2, sec({ yapayHata }));
    expect(r.vardi).toEqual(['kitaplar/mathe-2', 'kitaplar/mathe-2/Unite-01-Logik']);
    expect(g.olusturmalar()).toEqual(SIRA);
  });

  it('a page reload: a new operation finds the half made book → YarimKitapVar, nothing written', async () => {
    const f = fakeDrive();
    let hata: number | undefined = 4;
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec({ yapayHata: () => hata }))).rejects.toBeInstanceOf(KitapOlusturAgHatasi);
    hata = undefined;
    const once = f.olusturmalar().length;
    const e = await kitapOlustur(f.drive, yeniKitapIslemi('islem-2', plan()), sec()).catch(x => x);
    expect(e).toBeInstanceOf(YarimKitapVar);
    expect(e.message).toMatch(/^Yarım kalmış bir kitap var: mathe-2\./);
    expect(e.message).toMatch(/Başka bir ad seç; yarım klasör daha sonra çöpe atılabilir\.$/);
    expect(f.olusturmalar().length).toBe(once);
    expect(f.calls).not.toContain('jsonYaz');
  });

  it('a folder with the book\'s name (not ours, or a whole book of ours) → AyniKitapVar, no request that writes', async () => {
    for (const appProperties of [{}, { defter: '1', defterIslem: 'baska' }] as Record<string, string>[]) {
      const items = { x: { name: 'mathe-2', parent: 'kitaplar', appProperties }, xj: { name: 'kitap.json', parent: 'x', mimeType: 'application/json' } };
      const f = fakeDrive({ items });
      await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec())).rejects.toBeInstanceOf(AyniKitapVar);
      expect(f.olusturmalar()).toEqual([]);
      expect(f.calls).not.toContain('jsonYaz');
      expect(f.calls).not.toContain('yeniIdler:7');
    }
    // a foreign folder without kitap.json is not "ours half made": AyniKitapVar
    const f = fakeDrive({ items: { x: { name: 'mathe-2', parent: 'kitaplar' } } });
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec())).rejects.toBeInstanceOf(AyniKitapVar);
    // in the trash: not there
    const t = fakeDrive({ items: { x: { name: 'mathe-2', parent: 'kitaplar', trashed: true } } });
    await kitapOlustur(t.drive, yeniKitapIslemi('islem-1', plan()), sec());
    expect(t.olusturmalar()).toEqual(SIRA);
  });

  it('the shelf step fails: the folders and kitap.json stay, "Tekrar dene" only writes the shelf', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const islem = yeniKitapIslemi('islem-1', plan());
    await expect(kitapOlustur(f.drive, islem, sec())).rejects.toBeInstanceOf(KitapOlusturAgHatasi);
    expect(f.olusturmalar()).toEqual(SIRA);
    expect(f.kitaplik().raflar[1].kitaplar).toEqual([]);
    const r = await kitapOlustur(f.drive, islem, sec());
    expect(f.olusturmalar()).toEqual(SIRA);                    // nothing made again
    expect(f.calls.filter(c => c === 'oge')).toEqual([]);     // all known from this session
    expect(r).toMatchObject({ olusturulan: 0, rafa: 'raf-2' });
    expect(f.kitaplik().raflar[1].kitaplar).toEqual(['mathe-2']);
    // once more: on the shelf already → no write
    const yazma = f.calls.filter(c => c === 'jsonYaz').length;
    await kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec());
    expect(f.calls.filter(c => c === 'jsonYaz').length).toBe(yazma);
  });

  it('kitaplik.json changed while it was read: once more from the start; twice → RafKaydiCakisma', async () => {
    const f = fakeDrive({ mtimeDegis: 1 });
    await kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec());
    expect(f.calls.filter(c => c === 'jsonOku')).toHaveLength(2);
    expect(f.kitaplik().raflar[1].kitaplar).toEqual(['mathe-2']);

    const g = fakeDrive({ mtimeDegis: 2 });
    const islem = yeniKitapIslemi('islem-1', plan());
    await expect(kitapOlustur(g.drive, islem, sec())).rejects.toBeInstanceOf(RafKaydiCakisma);
    expect(g.calls).not.toContain('jsonYaz');
    await kitapOlustur(g.drive, islem, sec());
    expect(g.kitaplik().raflar[1].kitaplar).toEqual(['mathe-2']);
  });

  it('locked (no ?kurulum=1 — the owner\'s "Kitaplık" too —, no root, not signed in): no request at all', async () => {
    for (const [o, hata] of [
      [{ kilitAcik: false }, KitapOlusturKilitli],
      [{ kilitAcik: false, kokKaynagi: 'ad' as const }, KitapOlusturKilitli],
      [{ kokKaynagi: null }, KitapOlusturKilitli],
      [{ yazabilir: () => false }, KitapOlusturYazmaYok]
    ] as const) {
      const f = fakeDrive();
      await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec(o))).rejects.toBeInstanceOf(hata);
      expect(f.calls).toEqual([]);
    }
  });

  it('no permission (403) → KitapOlusturIzinYok', async () => {
    const f = fakeDrive({ davranis: ['403'] });
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec())).rejects.toBeInstanceOf(KitapOlusturIzinYok);
    const g = fakeDrive({ yazHata: ['403'] });
    await expect(kitapOlustur(g.drive, yeniKitapIslemi('islem-1', plan()), sec())).rejects.toBeInstanceOf(KitapOlusturIzinYok);
  });
});

// 6.K4c: the owner's "Kitaplık" (found by name): nothing in it is marked
describe('kitapOlustur in the owner\'s "Kitaplık"', () => {
  const sahip = {
    kok: { name: 'Kitaplık', parent: 'root' },
    kitaplar: { name: 'kitaplar', parent: 'kok' },
    eski: { name: 'eski', parent: 'kitaplar' }
  };
  const sahipSec = (o: Partial<KitapOlusturSecenek> = {}) => sec({ kokKaynagi: 'ad', ...o });

  it('with ?kurulum=1: the same order, everything under its kitaplar/, the shelf entry written', async () => {
    const f = fakeDrive({ items: sahip });
    const islem = yeniKitapIslemi('islem-1', plan());
    const r = await kitapOlustur(f.drive, islem, sahipSec());
    expect(f.olusturmalar()).toEqual(SIRA);
    expect(r).toEqual({ kitapId: 'mathe-2', olusturulan: 7, vardi: [], rafa: 'raf-2', kitaplikYok: false });
    expect(ad(f.items, 'mathe-2')[1].parent).toBe('kitaplar');
    // every new item is inside the book folder, the book folder in kitaplar/
    const yeni = new Set(islem.idler);
    for (const id of yeni) {
      let p = f.items.get(id)!.parent;
      while (yeni.has(p)) p = f.items.get(p)!.parent;
      expect(p).toBe('kitaplar');
    }
    expect(f.kitaplik().raflar[1].kitaplar).toEqual(['mathe-2']);
    expect(f.items.get('eski')!.appProperties).toEqual({});   // untouched, no mark
  });

  it('no kitaplar/ → KitaplikYapisiBeklenmedik; only the root listed, nothing else asked or written', async () => {
    const f = fakeDrive({ items: sahip, sil: ['kitaplar'] });
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sahipSec())).rejects.toBeInstanceOf(KitaplikYapisiBeklenmedik);
    expect(f.calls).toEqual(['kokCocuklari']);
  });

  it('no kitaplik.json → the book without the shelf entry; the file is not created ("Yeni gelenler")', async () => {
    const f = fakeDrive({ items: sahip, sil: ['lib'] });
    const islem = yeniKitapIslemi('islem-1', plan());
    const r = await kitapOlustur(f.drive, islem, sahipSec());
    expect(f.olusturmalar()).toEqual(SIRA);
    expect(f.calls.filter(c => c === 'jsonYaz' || c === 'jsonOku' || c === 'degisimZamani')).toEqual([]);
    expect([...f.items.values()].some(i => i.name === 'kitaplik.json')).toBe(false);
    expect(r).toMatchObject({ rafa: null, kitaplikYok: true });
    expect(islemOzeti(islem)).toMatch(/raf: yok \(kitaplik\.json yok, Yeni gelenler\)$/);
  });

  it('our own root without kitaplik.json: an error, as before', async () => {
    const f = fakeDrive({ sil: ['lib'] });
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sec())).rejects.toBeInstanceOf(KitapOlusturBeklenmedik);
    expect(f.olusturmalar()).toEqual([]);
  });

  it('an old, unmarked folder with the book\'s name → AyniKitapVar, nothing written', async () => {
    const f = fakeDrive({ items: { ...sahip, m: { name: 'mathe-2', parent: 'kitaplar' } } });
    await expect(kitapOlustur(f.drive, yeniKitapIslemi('islem-1', plan()), sahipSec())).rejects.toBeInstanceOf(AyniKitapVar);
    expect(f.olusturmalar()).toEqual([]);
    expect(f.calls).not.toContain('jsonYaz');
  });
});

describe('ebeveynGecerliMi', () => {
  it('only the root\'s kitaplar/ or a folder this operation made', () => {
    const izinli = new Set(['id1', 'id2']);
    expect(ebeveynGecerliMi('kitaplar', 'kitaplar', izinli)).toBe(true);
    expect(ebeveynGecerliMi('id2', 'kitaplar', izinli)).toBe(true);
    expect(ebeveynGecerliMi('kok', 'kitaplar', izinli)).toBe(false);
    expect(ebeveynGecerliMi('eski', 'kitaplar', izinli)).toBe(false);
    expect(ebeveynGecerliMi('id1', 'kitaplar', new Set())).toBe(false);
  });
});

describe('rafaEkle', () => {
  const lib = { raflar: [{ id: 'a', kitaplar: ['x'] }, { id: 'b', ad: 'B', ozel: 1 }], oda: { mod: 'auto' } };
  it('on the chosen shelf, the other fields as they were', () => {
    expect(rafaEkle(lib, 'b', 'y')).toEqual({ degisti: true, rafa: 'b', json: { raflar: [{ id: 'a', kitaplar: ['x'] }, { id: 'b', ad: 'B', ozel: 1, kitaplar: ['y'] }], oda: { mod: 'auto' } } });
  });
  it('a shelf that is gone → the first shelf; on a shelf already → no change; no shelves → no change', () => {
    expect(rafaEkle(lib, 'yok', 'y')).toMatchObject({ degisti: true, rafa: 'a', json: { raflar: [{ id: 'a', kitaplar: ['x', 'y'] }, lib.raflar[1]] } });
    expect(rafaEkle(lib, 'b', 'x')).toMatchObject({ degisti: false, rafa: 'a' });
    expect(rafaEkle({ raflar: [] }, 'b', 'y')).toMatchObject({ degisti: false, rafa: null });
  });
});
