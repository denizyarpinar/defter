import { DriveError, FOLDER_MIME } from './drive';
import type { IcindekilerDrive, IcindekilerSecenek } from './icindekilerYaz';
import type { YeniOgeMeta } from './kurulum';
import type { ReadingDrive } from './okumaKaydi';
import { IdZatenVar } from './pdfOlustur';

// Task 6.K5a-2: a made-up Drive for the contents' tests (icindekilerYaz.test.ts, ui/icindekilerBaglami.test.ts).
// No request goes anywhere.

export interface Item { name: string; parent: string; mimeType: string; appProperties: Record<string, string>; icerik?: string; trashed?: boolean }
export type Davranis = 'ok' | 'ag' | 'agAmaOlustu' | '403';

export const KITAP = {
  surum: 2, baslik: 'Deneme 1', kapak: { renk: '#24476b', stil: 'kumas' }, sonAcilis: null, kurdele: null, bilinmeyen: 7,
  uniteler: [
    { baslik: 'Logik', klasor: 'Unite-01-Logik', konular: [
      { baslik: 'Aussagen', klasor: 'Unite-01-Logik/Konu-01-Aussagen', durum: 'okundu', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 } } },
      { baslik: 'Beweisen', klasor: 'Unite-01-Logik/Konu-02-Beweisen', durum: 'okunmadi' }
    ] },
    { baslik: 'Leer', konular: [] }   // an old empty unit: its folder is not in kitap.json
  ]
};

// kok → kitaplar → deneme-1 (kb) → Unite-01-Logik (u1: Konu-01, Konu-02), Unite-02-Leer (u2) + kitap.json (kj)
export function fakeDrive(opts: { items?: Record<string, Partial<Item> & { name: string; parent: string }>; sil?: string[]; davranis?: Davranis[]; yazHata?: Davranis[]; mtimeDegis?: number; kitap?: unknown } = {}) {
  const k = (name: string, parent: string, defter = true): Item => ({ name, parent, mimeType: FOLDER_MIME, appProperties: defter ? { defter: '1' } : {} });
  const items = new Map<string, Item>([
    ['kok', k('Defter Library', 'root')],
    ['kitaplar', k('kitaplar', 'kok')],
    ['kb', k('deneme-1', 'kitaplar')],
    ['u1', k('Unite-01-Logik', 'kb')],
    ['t1', k('Konu-01-Aussagen', 'u1')],
    ['t2', k('Konu-02-Beweisen', 'u1')],
    ['u2', k('Unite-02-Leer', 'kb')],
    ['kj', { name: 'kitap.json', parent: 'kb', mimeType: 'application/json', appProperties: { defter: '1' }, icerik: JSON.stringify(opts.kitap ?? KITAP) }]
  ]);
  for (const [id, it] of Object.entries(opts.items ?? {})) items.set(id, { mimeType: FOLDER_MIME, appProperties: { defter: '1' }, ...it });
  for (const id of opts.sil ?? []) items.delete(id);
  const davranis = [...(opts.davranis ?? [])];
  const yazHata = [...(opts.yazHata ?? [])];
  let mtime = 1, mtimeDegis = opts.mtimeDegis ?? 0, n = 0;
  const calls: string[] = [];
  const canli = (id: string) => { const i = items.get(id); return i && !i.trashed ? i : undefined; };
  const drive: IcindekilerDrive = {
    async yeniIdler(c) { calls.push('yeniIdler:' + c); return Array.from({ length: c }, () => 'id' + ++n); },
    async oge(id) {
      calls.push('oge');
      const i = items.get(id);
      return i ? { id, name: i.name, parents: [i.parent], appProperties: i.appProperties, trashed: !!i.trashed } : null;
    },
    async islemAra(islemId) {
      calls.push('islemAra');
      return [...items].filter(([id, i]) => canli(id) && i.appProperties.defterIslem === islemId).map(([id, i]) => ({ id, name: i.name }));
    },
    async olustur(meta: YeniOgeMeta) {
      calls.push('olustur:' + meta.name);
      if (meta.id && items.has(meta.id)) throw new IdZatenVar();
      const d = davranis.shift() ?? 'ok';
      if (d === 'ag') throw new TypeError('Failed to fetch');
      if (d === '403') throw new DriveError(403, 'x');
      const id = meta.id ?? 'auto' + ++n;
      items.set(id, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, appProperties: meta.appProperties });
      if (d === 'agAmaOlustu') throw new TypeError('Failed to fetch');
      return { id };
    },
    async kokCocuklari(id) {
      calls.push('kokCocuklari');
      return [...items].filter(([cid, i]) => i.parent === id && canli(cid)).map(([cid, i]) => ({ id: cid, name: i.name, mimeType: i.mimeType }));
    },
    async klasorler(ebeveynler) {
      calls.push('klasorler');
      return [...items].filter(([id, i]) => ebeveynler.includes(i.parent) && i.mimeType === FOLDER_MIME && canli(id))
        .map(([id, i]) => ({ id, name: i.name, parents: [i.parent], appProperties: i.appProperties }));
    },
    async jsonOku(id) {
      calls.push('jsonOku');
      if (mtimeDegis > 0) { mtimeDegis--; mtime++; }   // another device writes while it is read
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
  // the reading saver on the same file (ribbon / status)
  const okuma: ReadingDrive = {
    async modifiedTime() { return 't' + mtime; },
    async read(id) { calls.push('okuma:read'); return JSON.parse(items.get(id)!.icerik!); },
    async write(id, json) { calls.push('okuma:write'); items.get(id)!.icerik = JSON.stringify(json); mtime++; }
  };
  const kitap = () => JSON.parse(items.get('kj')!.icerik!) as typeof KITAP & { uniteler: { baslik: string; klasor?: string; konular: { baslik: string; klasor: string; durum: string; kurdeleler?: unknown }[] }[] };
  const olusturmalar = () => calls.filter(c => c.startsWith('olustur:'));
  const yazmalar = () => calls.filter(c => c === 'jsonYaz' || c.startsWith('olustur:') || c === 'okuma:write');
  return { drive, items, calls, kitap, olusturmalar, yazmalar, okuma };
}

export const sec = (o: Partial<IcindekilerSecenek> = {}): IcindekilerSecenek => ({
  kilitAcik: true, kokKaynagi: 'defterKok', kokId: 'kok', yazabilir: () => true, surum: 2,
  kitapKlasorId: 'kb', kitapJsonId: 'kj', bekleMs: 0, ...o
});
