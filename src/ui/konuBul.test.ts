import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOLDER_MIME } from '../drive/drive';
import { fakeDrive, KITAP, sec } from '../drive/icindekilerSahte';
import { tasiDepo, type TasiIsi } from '../drive/konuTasiYaz';
import { kitaptaTasi, yolCevir } from '../kitap/konuTasi';
import { tasiKilitle } from '../kitap/konuTasiKilit';
import { parseBook } from '../model/parse';
import type { Book } from '../model/types';
import { icindekilerBaglamiKur } from './icindekilerBaglami';
import { konuTasiBagla } from './konuTasiAkisi';

// Task 6.6-3c: konuBul (ui/konuTasiAkisi.ts) on the made-up Drive: Konu-01-Aussagen (t1) is under u2 in Drive.
const old = 'Unite-01-Logik/Konu-01-Aussagen', target = 'Unite-02-Leer', moved = target + '/Konu-01-Aussagen';

// main.ts konuYoluYerel, the memory part
const yerelTasi = (book: Book) => async (is: TasiIsi, esnek = false) => {
  try { kitaptaTasi(book, is.eskiYol, is.hedefAnahtar ?? 'k:' + is.yeniYol.split('/')[0], is.hedefSira, is.yeniYol); return true; }
  catch (e) { if (!esnek) throw e; for (const u of book.uniteler) for (const k of u.konular) k.klasor = yolCevir(k.klasor, is.eskiYol, is.yeniYol); return false; }
};

const setup = (o: { jsonYeni?: boolean; sil?: string[]; items?: NonNullable<Parameters<typeof fakeDrive>[0]>['items'] } = {}) => {
  const raw = structuredClone(KITAP); Object.assign(raw.uniteler[1], { klasor: target });
  const book = parseBook('deneme-1', raw);
  if (o.jsonYeni) {   // another tab moved it: kitap.json in Drive already shows the new path
    const k = raw.uniteler[0].konular.shift()!; k.klasor = moved; (raw.uniteler[1].konular as unknown[]).push(k);
  }
  const f = fakeDrive({ kitap: raw, sil: o.sil, items: o.items });
  f.items.get('t1')!.parent = 'u2';
  const drive = { ...f.drive, tasi: vi.fn(async () => {}) };
  const yerel = yerelTasi(book);
  const ctx = icindekilerBaglamiKur({ drive, secenek: () => sec({ tasiYerel: async is => { await yerel(is); } }), kilitAcik: true, hasJson: () => true,
    uniteKlasorleri: async () => ['Unite-01-Logik', target], kitap: () => book, yenile: () => {}, jsonOku: async () => f.kitap(), girisYap: () => {} });
  const ara = vi.fn(async (ad: string, ebeveynler: readonly string[]) => [...f.items]
    .filter(([id, i]) => i.name === ad && ebeveynler.includes(i.parent) && i.mimeType === FOLDER_MIME && !f.copte(id))
    .map(([id, i]) => ({ id, name: i.name, parents: [i.parent] })));
  const duzeltildi = vi.fn();
  konuTasiBagla({ baglam: ctx.baglam, kuyruk: ctx.kuyruk, drive, secenek: () => sec(), kontrol: async () => {}, bildirim: () => {},
    yerel: is => yerel(is, true), ara, duzeltildi, haber: ctx.haber });
  const done = () => vi.waitFor(() => expect(ctx.kuyruk.hasUnsaved).toBe(false));
  const yer = () => book.uniteler.map(u => u.konular.map(k => k.klasor));
  return { f, drive, ctx, book, ara, duzeltildi, done, yer, bul: () => ctx.baglam.konuBul!(book, old) };
};

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('location', { search: '?konuTasi=1' });
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
});
afterEach(() => { tasiKilitle('t1', old, moved, false); vi.unstubAllGlobals(); });

describe('konuBul', () => {
  it('(a) another tab: kitap.json read again shows the path; memory only, no query, no write, no toast', async () => {
    const x = setup({ jsonYeni: true });
    expect(await x.bul()).toBe(moved);
    expect(x.yer()).toEqual([['Unite-01-Logik/Konu-02-Beweisen'], [moved]]);
    expect(x.ara).not.toHaveBeenCalled(); expect(x.f.yazmalar()).toEqual([]); expect(x.duzeltildi).not.toHaveBeenCalled();
  });
  it('(b) after a dropped recovery: found by one query; kitap.json fixed without any move; toast once', async () => {
    const x = setup();
    expect(await x.bul()).toBe(moved);
    expect(x.ara).toHaveBeenCalledTimes(1); expect(x.yer()).toEqual([['Unite-01-Logik/Konu-02-Beweisen'], [moved]]);
    await x.done(); await vi.waitFor(() => expect(x.duzeltildi).toHaveBeenCalledTimes(1));
    expect(x.f.kitap().uniteler[1].konular.map(k => k.klasor)).toEqual([moved]);
    expect(x.f.yazmalar()).toEqual(['jsonYaz']); expect(x.drive.tasi).not.toHaveBeenCalled();
    expect(x.f.items.get('t1')!.parent).toBe('u2'); expect(tasiDepo.oku()).toBeNull();
  });
  it('move flag off: memory only, kitap.json not written, no toast', async () => {
    vi.stubGlobal('location', { search: '' });
    const x = setup();
    expect(await x.bul()).toBe(moved); expect(x.yer()[1]).toEqual([moved]);
    await x.done(); expect(x.f.yazmalar()).toEqual([]); expect(x.duzeltildi).not.toHaveBeenCalled();
  });
  it("the old unit's folder not in Drive: memory only, no write, no error", async () => {
    const x = setup({ sil: ['u1', 't2', 'f3'] });
    expect(await x.bul()).toBe(moved);
    await x.done(); expect(x.f.yazmalar()).toEqual([]); expect(x.ctx.kuyruk.hataVar).toBe(false); expect(x.duzeltildi).not.toHaveBeenCalled();
  });
  it('a pending move record: no second write', async () => {
    const x = setup(); localStorage.setItem('defter-konu-tasi', '{}');
    expect(await x.bul()).toBe(moved); await x.done(); expect(x.f.yazmalar()).toEqual([]);
  });
  it('none or two folders with the name: null, nothing changes', async () => {
    const none = setup(); none.f.items.get('t1')!.name = 'Konu-09-Other';
    expect(await none.bul()).toBeNull(); expect(none.yer()[0][0]).toBe(old);
    const two = setup({ items: { t9: { name: 'Konu-01-Aussagen', parent: 'u1' } } });
    expect(await two.bul()).toBeNull(); expect(two.f.yazmalar()).toEqual([]);
  });
  it('does not search a backup folder or a hidden folder, even if the hidden name is in the book', async () => {
    const x = setup({ items: {
      backup: { name: 'Yedek', parent: 'kb' },
      hidden: { name: '_sistem', parent: 'kb' },
      hiddenTopic: { name: 'Konu-01-Aussagen', parent: 'hidden' }
    } });
    x.book.uniteler.push({ baslik: 'Hidden', klasor: '_sistem', konular: [], extra: {} });
    x.f.items.get('t1')!.parent = 'backup';
    expect(await x.bul()).toBeNull();
    expect(x.ara).toHaveBeenCalledWith('Konu-01-Aussagen', ['u1', 'u2']);
    expect(x.yer()[0][0]).toBe(old);
    expect(x.f.yazmalar()).toEqual([]);
    expect(x.drive.tasi).not.toHaveBeenCalled();
  });
  it('ignores a backup duplicate when the real topic is in a book unit', async () => {
    const x = setup({ items: {
      backup: { name: 'Yedek', parent: 'kb' },
      backupTopic: { name: 'Konu-01-Aussagen', parent: 'backup' }
    } });
    expect(await x.bul()).toBe(moved);
    await x.done();
    expect(x.f.yazmalar()).toEqual(['jsonYaz']);
    expect(x.drive.tasi).not.toHaveBeenCalled();
  });
  it('network error: rejects, memory unchanged', async () => {
    const x = setup(); x.ara.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(x.bul()).rejects.toThrow(); expect(x.yer()[0][0]).toBe(old); expect(x.f.yazmalar()).toEqual([]);
  });
  it('?konuAra=0: no request at all', async () => {
    vi.stubGlobal('location', { search: '?konuTasi=1&konuAra=0' });
    const x = setup();
    expect(await x.bul()).toBeNull(); expect(x.f.calls).toEqual([]); expect(x.ara).not.toHaveBeenCalled();
  });
});
