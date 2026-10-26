import { describe, expect, it } from 'vitest';
import { parseBook, parseLibrary } from '../model/parse';
import { DriveError, FOLDER_MIME } from './drive';
import { KOK_ADI } from './kok';
import {
  bosKitaplikJson, kitaplikKur, KurulumAgHatasi, KurulumBeklenmedik, KurulumIzinYok, KurulumKilitli, KurulumYazmaYok,
  ORNEK_KITAP, ornekPlani, type KitaplikKurSecenek, type KurulumDrive, type OrnekKaynak, type YeniOgeMeta
} from './kurulum';
import { IdZatenVar } from './pdfOlustur';
import indeksHam from '../../public/ornek/index.json?raw';
import ornekKitapHam from '../../public/ornek/kitaplar/programlamaya-giris/kitap.json?raw';

interface Item { name: string; parent: string; mimeType: string; createdTime: string; appProperties: Record<string, string>; icerik?: string | Uint8Array }
type Davranis = 'ok' | 'ag' | 'agAmaOlustu' | '500' | '403';

// An in-memory Drive. 'root' is My Drive's root. Every call is recorded in `calls`.
function fakeDrive(opts: { items?: Record<string, Partial<Item> & { name: string; parent: string }>; davranis?: Davranis[]; idHata?: boolean } = {}) {
  const items = new Map<string, Item>();
  for (const [id, it] of Object.entries(opts.items ?? {})) items.set(id, { mimeType: FOLDER_MIME, createdTime: '2026-01-01T00:00:00Z', appProperties: {}, ...it });
  const davranis = [...(opts.davranis ?? [])];
  const calls: string[] = [];
  let n = 0, saat = 0;
  const yaz = (m: YeniOgeMeta, icerik?: string | Uint8Array) => {
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
      return [...items].filter(([, i]) => i.parent === id).map(([cid, i]) => ({ id: cid, name: i.name, mimeType: i.mimeType }));
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
    async cocukAra(ebeveynId, ad) {
      calls.push('cocukAra:' + ad);
      return [...items].filter(([, i]) => i.parent === ebeveynId && i.name === ad).map(([id, i]) => ({ id, name: i.name, appProperties: i.appProperties }));
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
    expect(JSON.parse(json.icerik as string)).toEqual(bosKitaplikJson());
  });

  it('6.5-2b: with a language, the new kitaplik.json has ayarlar.dil (only that is added)', async () => {
    const f = fakeDrive();
    await kitaplikKur(f.drive, { ...sec(), dil: 'tr' });
    const json = JSON.parse(bul(f.items, 'kitaplik.json')[0][1].icerik as string) as Record<string, unknown>;
    expect(json.ayarlar).toEqual({ dil: 'tr' });
    const { ayarlar: _, ...geri } = json;
    expect(geri).toEqual(bosKitaplikJson());
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

  it('unavailable context: KurulumKilitli, no request at all', async () => {
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

// ---- task 6.K3: the sample book ----

// The real sample library files (public/ornek); the PDFs: small fake bytes, every request recorded
const indeks = JSON.parse(indeksHam) as { klasorler: Record<string, Record<string, Record<string, string>>> };
function fakeKaynak(o: { pdfHata?: boolean } = {}) {
  const istenen: string[] = [];
  const kaynak: OrnekKaynak = {
    async kitapJson() { istenen.push('kitapJson'); return JSON.parse(ornekKitapHam); },
    async klasorler() { istenen.push('klasorler'); return indeks.klasorler[ORNEK_KITAP]; },
    async pdf(yol) {
      istenen.push(yol);
      if (o.pdfHata) throw new Error('pdf yok');
      return new TextEncoder().encode('%PDF-1.4 ' + yol);
    }
  };
  return { kaynak, istenen };
}
const ornekli = (k: OrnekKaynak, o: Partial<KitaplikKurSecenek> = {}, ilerleme?: (i: number, n: number) => void) =>
  sec({ ornek: { kaynak: k, ilerleme }, ...o });
const PLAN_N = ornekPlani(indeks.klasorler[ORNEK_KITAP]).length;
const ornekOgeleri = (items: Map<string, Item>) => [...items.values()].filter(i => i.appProperties.defterOrnek === '1');
const kitaplikJsonu = (items: Map<string, Item>) => parseLibrary(JSON.parse(bul(items, 'kitaplik.json')[0][1].icerik as string));

describe('kitaplikKur with the sample book (6.K3)', () => {
  it('the plan: book folder, folders (parents first), 9 PDFs, kitap.json last', () => {
    const plan = ornekPlani(indeks.klasorler[ORNEK_KITAP]);
    expect(plan.length).toBe(18);
    expect(plan[0]).toEqual({ tur: 'klasor', yol: '' });
    expect(plan.at(-1)).toEqual({ tur: 'json' });
    expect(plan.filter(p => p.tur === 'pdf').length).toBe(9);
    const klasorler = plan.flatMap(p => p.tur === 'klasor' ? [p.yol] : []);
    for (const k of klasorler.slice(1)) {
      const ust = k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '';
      expect(klasorler.indexOf(ust)).toBeLessThan(klasorler.indexOf(k));
    }
  });

  it('order: root → kitaplar → sample (folders, PDFs, kitap.json) → kitaplik.json', async () => {
    const f = fakeDrive();
    const r = await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    expect(r).toMatchObject({ ornek: 'eklendi', olusturulan: [KOK_ADI, 'kitaplar', 'kitaplik.json'], zatenVardi: false });
    expect(r.ornekHata).toBeUndefined();
    const o = f.olusturmalar();
    expect(o.slice(0, 3)).toEqual([`olustur:${KOK_ADI}`, 'olustur:kitaplar', `olustur:${ORNEK_KITAP}`]);
    expect(o.at(-2)).toBe('olustur:kitap.json');
    expect(o.at(-1)).toBe('olustur:kitaplik.json');
    expect(o.length).toBe(3 + PLAN_N);
    const ilkPdf = o.findIndex(c => c.endsWith('.pdf'));
    expect(o.slice(ilkPdf, -2).every(c => c.endsWith('.pdf'))).toBe(true);
  });

  it('the box off: no sample request at all, kitaplik.json with 5 empty shelves', async () => {
    const f = fakeDrive();
    const k = fakeKaynak();
    const r = await kitaplikKur(f.drive, sec());
    expect(r.ornek).toBeUndefined();
    expect(k.istenen).toEqual([]);
    expect(f.calls.filter(c => c.startsWith('cocukAra'))).toEqual([]);
    expect(ornekOgeleri(f.items)).toEqual([]);
    expect(JSON.parse(bul(f.items, 'kitaplik.json')[0][1].icerik as string)).toEqual(bosKitaplikJson());
  });

  it.each([
    ['a PDF cannot be fetched', { pdfHata: true }, []],
    ['Drive refuses a sample item (403)', {}, ['ok', 'ok', 'ok', '403']]
  ] as const)('sample fails (%s): kitaplik.json is still written, without the book; ornekHata', async (_, k, davranis) => {
    const f = fakeDrive({ davranis: [...davranis] });
    const r = await kitaplikKur(f.drive, ornekli(fakeKaynak(k).kaynak));
    expect(r.ornek).toBeUndefined();
    expect(r.ornekHata).toBeTruthy();
    expect(r.olusturulan).toEqual([KOK_ADI, 'kitaplar', 'kitaplik.json']);
    expect(kitaplikJsonu(f.items).raflar.every(raf => raf.kitaplar.length === 0)).toBe(true);
  });

  it('run again (same or new islemId): no duplicates, nothing downloaded', async () => {
    const f = fakeDrive();
    await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    const boyut = f.items.size;
    for (const islemId of ['islem-1', 'islem-2']) {
      // a root without kitaplik.json again ("Kurulumu tamamla"), the sample whole
      const [[jsonId, json]] = bul(f.items, 'kitaplik.json');
      f.items.delete(jsonId);
      const k = fakeKaynak();
      const r = await kitaplikKur(f.drive, ornekli(k.kaynak, { islemId }));
      expect(r).toMatchObject({ ornek: 'zatenVardi', olusturulan: ['kitaplik.json'] });
      expect(k.istenen.filter(y => y.endsWith('.pdf'))).toEqual([]);
      expect(f.items.size).toBe(boyut);
      expect(bul(f.items, 'kitaplik.json')[0][1].icerik).toBe(json.icerik);
    }
    expect(bul(f.items, ORNEK_KITAP).length).toBe(1);
  });

  it('tamamla: a half made sample (no kitap.json) is finished, made items stay single', async () => {
    // the network goes away after the first 3 sample folders
    const f = fakeDrive({ davranis: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ag', 'ag', 'ag'] });
    const r1 = await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    expect(r1.ornekHata).toBeTruthy();
    expect(bul(f.items, 'kitap.json')).toEqual([]);
    expect(ornekOgeleri(f.items).length).toBe(4);
    // a root without kitaplik.json → "Kurulumu tamamla" with a new islemId
    for (const [id] of bul(f.items, 'kitaplik.json')) f.items.delete(id);
    const r2 = await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak, { islemId: 'islem-2' }));
    expect(r2).toMatchObject({ ornek: 'eklendi', olusturulan: ['kitaplik.json'] });
    expect(ornekOgeleri(f.items).length).toBe(PLAN_N);
    expect(bul(f.items, ORNEK_KITAP).length).toBe(1);
    expect(bul(f.items, 'Unite-01-Temeller').length).toBe(1);
    expect(kitaplikJsonu(f.items).raflar[0].kitaplar).toEqual([ORNEK_KITAP]);
  });

  it('every sample item: defter=1, defterIslem, defterOrnek=1; PDFs as application/pdf bytes', async () => {
    const f = fakeDrive();
    await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    const ornek = ornekOgeleri(f.items);
    expect(ornek.length).toBe(PLAN_N);
    for (const i of ornek) expect(i.appProperties).toMatchObject({ defter: '1', defterIslem: 'islem-1', defterOrnek: '1' });
    const pdfler = [...f.items.values()].filter(i => i.name.endsWith('.pdf'));
    expect(pdfler.length).toBe(9);
    for (const p of pdfler) {
      expect(p.mimeType).toBe('application/pdf');
      expect(p.icerik).toBeInstanceOf(Uint8Array);
      expect(p.appProperties.defterOrnek).toBe('1');
    }
  });

  it('kitap.json parses (surum 2, nothing read yet) and shelf 1 holds the book', async () => {
    const f = fakeDrive();
    await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    const [[kitapKlasoru]] = bul(f.items, ORNEK_KITAP);
    const [[, kj]] = bul(f.items, 'kitap.json');
    expect(kj.parent).toBe(kitapKlasoru);
    const book = parseBook(ORNEK_KITAP, JSON.parse(kj.icerik as string));
    expect(book).toMatchObject({ hasJson: true, surum: 2, baslik: 'Programlamaya Giriş', kurdele: null, sonAcilis: null });
    expect(book.uniteler.length).toBe(2);
    expect(book.uniteler.flatMap(u => u.konular).every(k => k.durum === 'okunmadi')).toBe(true);
    const lib = kitaplikJsonu(f.items);
    expect(lib.raflar[0].kitaplar).toEqual([ORNEK_KITAP]);
    expect(lib.raflar.length).toBe(5);
    // the PDFs sit in their topic folders
    const [[konu1]] = bul(f.items, 'Konu-01-Degiskenler');
    const [[ueb]] = bul(f.items, 'Uebungen');
    expect(bul(f.items, 'blatt-01_cozum.pdf')[0][1].parent).toBe(ueb);
    expect(f.items.get(ueb)!.parent).toBe(konu1);
  });

  it('a folder with the same name in kitaplar, not ours: untouched, ornekHata', async () => {
    const f = fakeDrive({ items: {
      D: { name: KOK_ADI, parent: 'root', appProperties: { defterKok: '1' } },
      K: { name: 'kitaplar', parent: 'D' },
      X: { name: ORNEK_KITAP, parent: 'K' }
    } });
    const r = await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak));
    expect(r.ornekHata).toContain(ORNEK_KITAP);
    expect(r.olusturulan).toEqual(['kitaplik.json']);
    expect(ornekOgeleri(f.items)).toEqual([]);
    expect(f.items.get('X')!.appProperties).toEqual({});
  });

  it('progress: 1..n, n = the length of the plan', async () => {
    const f = fakeDrive();
    const adimlar: Array<[number, number]> = [];
    await kitaplikKur(f.drive, ornekli(fakeKaynak().kaynak, {}, (i, n) => adimlar.push([i, n])));
    expect(adimlar.map(a => a[0])).toEqual(Array.from({ length: PLAN_N }, (_, i) => i + 1));
    expect(adimlar.every(a => a[1] === PLAN_N)).toBe(true);
  });

  it('locked / no writing: KurulumKilitli / KurulumYazmaYok before any request, also with the box', async () => {
    const f = fakeDrive();
    const k = fakeKaynak();
    await expect(kitaplikKur(f.drive, ornekli(k.kaynak, { kilitAcik: false }))).rejects.toBeInstanceOf(KurulumKilitli);
    await expect(kitaplikKur(f.drive, ornekli(k.kaynak, { yazabilir: () => false }))).rejects.toBeInstanceOf(KurulumYazmaYok);
    expect(f.calls).toEqual([]);
    expect(k.istenen).toEqual([]);
  });
});
