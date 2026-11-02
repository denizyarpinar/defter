import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeDrive, KITAP, sec } from '../drive/icindekilerSahte';
import { parseBook } from '../model/parse';
import { kitaptaTasi } from '../kitap/konuTasi';
import { TASI_ANAHTARI, tasiDepo } from '../drive/konuTasiYaz';
import { t } from '../dil';
import { icindekilerBaglamiKur } from './icindekilerBaglami';
import { konuTasiBagla } from './konuTasiAkisi';
import { tasiKilitli, tasiKilitle } from '../kitap/konuTasiKilit';

const old = 'Unite-01-Logik/Konu-01-Aussagen', target = 'Unite-02-Leer';
const setup = (failFlush = false) => {
  const raw = structuredClone(KITAP); Object.assign(raw.uniteler[1], { klasor: target });
  const f = fakeDrive({ kitap: raw }), book = parseBook('deneme-1', raw);
  let undo = () => {};
  const control = vi.fn(async () => {});
  const drive = { ...f.drive, tasi: vi.fn(async (id: string, to: string) => { f.items.get(id)!.parent = to; }) };
  const ctx = icindekilerBaglamiKur({ drive, secenek: () => sec({
    tasiOncesi: async () => { if (failFlush) throw new Error('reading still pending'); },
    tasiYerel: async is => { kitaptaTasi(book, is.eskiYol, is.hedefAnahtar ?? 'k:' + is.yeniYol.split('/')[0], is.hedefSira, is.yeniYol); }
  }), kilitAcik: true, hasJson: () => true, uniteKlasorleri: async () => ['Unite-01-Logik', target], kitap: () => book,
    yenile: () => {}, jsonOku: async () => f.kitap(), girisYap: () => {} });
  const reload = vi.fn(async () => {});
  konuTasiBagla({ baglam: ctx.baglam, kuyruk: ctx.kuyruk, drive, secenek: () => sec(), kontrol: control, bildirim: fn => { undo = fn; },
    yenidenYukle: reload, haber: ctx.haber });
  const move = () => ctx.baglam.konuTasi!(book, old, target, 0);
  const done = () => vi.waitFor(() => expect(ctx.kuyruk.hasUnsaved).toBe(false));
  return { f, drive, ctx, book, move, done, control, reload, undo: () => undo() };
};
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('location', { search: '?konuTasi=1' });
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
});
afterEach(() => { tasiKilitle('t1', old, target + '/Konu-01-Aussagen', false); vi.unstubAllGlobals(); });

describe('move queue integration', () => {
  it('commits memory only after Drive, updates the old-key redirect; undo reverses', async () => {
    const f = setup(); await f.move(); await f.done();
    expect(f.book.uniteler[1].konular[0].klasor).toBe(target + '/Konu-01-Aussagen');
    expect(f.ctx.baglam.yonlendir(old)).toBe(target + '/Konu-01-Aussagen');
    f.undo(); await f.done(); expect(f.book.uniteler[0].konular[0].klasor).toBe(old);
    expect(tasiDepo.oku()).toBeNull(); expect(tasiKilitli('t1')).toBe(false);
  });
  it('failed reading flush prevents both parent and JSON mutation', async () => {
    const f = setup(true); await f.move();
    await vi.waitFor(() => expect(f.ctx.kuyruk.hataVar).toBe(true));
    expect(f.drive.tasi).not.toHaveBeenCalled(); expect(f.f.yazmalar()).toEqual([]);
    await f.ctx.vazgec(); await f.done(); expect(tasiKilitli('t1')).toBe(false);
  });
  it.each(['page job', 'file adding', 'status unavailable'])('preflight %s blocks', async reason => {
    const f = setup(); f.control.mockRejectedValueOnce(new Error(reason));
    await expect(f.move()).rejects.toThrow(reason); expect(f.drive.tasi).not.toHaveBeenCalled(); expect(tasiDepo.oku()).toBeNull();
  });
  it('flag off rejects before any request', async () => {
    const f = setup(); vi.stubGlobal('location', { search: '' });
    await expect(f.move()).rejects.toThrow(); expect(f.f.calls).toEqual([]);
  });
  it('an existing queue operation prevents starting another move', async () => {
    const f = setup(); f.ctx.baglam.gonder(f.book, { tur: 'konuAdi', konu: old, baslik: 'new' });
    await expect(f.move()).rejects.toThrow(); expect(f.drive.tasi).not.toHaveBeenCalled(); await f.done();
  });
  it('failed parent update leaves memory and journal; Retry completes', async () => {
    const f = setup(); f.drive.tasi.mockRejectedValueOnce(new TypeError('offline'));
    await f.move(); await vi.waitFor(() => expect(f.ctx.kuyruk.hataVar).toBe(true));
    expect(f.book.uniteler[0].konular[0].klasor).toBe(old); expect(tasiDepo.oku()).not.toBeNull();
    f.ctx.baglam.tekrarDene(); await f.done(); expect(tasiDepo.oku()).toBeNull();
  });
  it('Cancel after failed JSON restores parent through the same queue', async () => {
    const f = setup(); const write = f.drive.jsonYaz;
    f.drive.jsonYaz = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementation(write);
    await f.move(); await vi.waitFor(() => expect(f.ctx.kuyruk.hataVar).toBe(true));
    expect(f.f.items.get('t1')!.parent).toBe('u2');
    await f.ctx.vazgec(); await f.done(); expect(f.f.items.get('t1')!.parent).toBe('u1'); expect(tasiDepo.oku()).toBeNull();
  });
  it('recovery after reload waits for JSON and memory completion', async () => {
    const f = setup(); const write = f.drive.jsonYaz;
    f.drive.jsonYaz = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementation(write);
    await f.move(); await vi.waitFor(() => expect(f.ctx.kuyruk.hataVar).toBe(true));
    const journal = tasiDepo.oku()!;
    const fresh = setup(); fresh.f.items.get('t1')!.parent = 'u2'; tasiDepo.yaz(journal);
    await fresh.ctx.baglam.toparla!(fresh.book);
    expect(fresh.book.uniteler[1].konular[0].klasor).toBe(journal.yeniYol); expect(tasiDepo.oku()).toBeNull();
  });
  it('broken record on open: no lock; status line problem + Vazgeç drops only the record and reloads', async () => {
    const f = setup(); localStorage.setItem(TASI_ANAHTARI, '{}');
    await expect(f.ctx.baglam.toparla!(f.book)).resolves.toBeUndefined();
    expect(f.ctx.baglam.tasiSorun!()).toBe(t('tasi.depo'));
    await f.ctx.baglam.tasiVazgec!();
    expect(localStorage.getItem(TASI_ANAHTARI)).toBeNull(); expect(f.ctx.baglam.tasiSorun!()).toBeNull();
    expect(f.reload).toHaveBeenCalledWith('deneme-1'); expect(f.f.yazmalar()).toEqual([]); expect(f.drive.tasi).not.toHaveBeenCalled();
  });
  it('failed recovery (mismatch): Vazgeç does not compensate in Drive, drops the record, reloads', async () => {
    const f = setup(); const write = f.drive.jsonYaz;
    f.drive.jsonYaz = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementation(write);
    await f.move(); await vi.waitFor(() => expect(f.ctx.kuyruk.hataVar).toBe(true));
    const journal = tasiDepo.oku()!;
    const fresh = setup(); tasiDepo.yaz(journal);
    fresh.f.items.get('u2')!.name = 'Unite-02-Anders';   // the target no longer matches the record
    await expect(fresh.ctx.baglam.toparla!(fresh.book)).resolves.toBeUndefined();
    expect(fresh.ctx.kuyruk.hataVar).toBe(true);
    await fresh.ctx.vazgec(); await fresh.done();
    expect(tasiDepo.oku()).toBeNull(); expect(fresh.reload).toHaveBeenCalledWith('deneme-1');
    expect(fresh.drive.tasi).not.toHaveBeenCalled(); expect(fresh.f.yazmalar()).toEqual([]);
    expect(tasiKilitli('t1')).toBe(false);
  });
});
