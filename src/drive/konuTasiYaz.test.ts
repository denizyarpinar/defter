import { describe, expect, it, vi } from 'vitest';
import { fakeDrive, KITAP } from './icindekilerSahte';
import { konuTasiYaz, tasiCoz, tersTasi, type TasiDepo, type TasiIsi, type TasiDrive } from './konuTasiYaz';
import { DriveError } from './drive';

const fixture = () => {
  const raw = structuredClone(KITAP); Object.assign(raw.uniteler[1], { klasor: 'Unite-02-Leer' });
  const f = fakeDrive({ kitap: raw });
  const is: TasiIsi = { islemId: 'move', kitapId: 'deneme-1', kokId: 'kok', kitapKlasorId: 'kb', kitapJsonId: 'kj', konuKlasorId: 't1', kaynakId: 'u1', hedefId: 'u2', eskiYol: 'Unite-01-Logik/Konu-01-Aussagen', yeniYol: 'Unite-02-Leer/Konu-01-Aussagen', eskiSira: 0, hedefSira: 0, yon: 'ileri', klasorTamam: false, jsonTamam: false };
  let saved: TasiIsi | null = null;
  const depo: TasiDepo = { oku: () => saved, yaz: v => { saved = structuredClone(v); }, sil: () => { saved = null; } };
  const moves: string[] = [];
  const drive: TasiDrive = { ...f.drive, tasi: async (id, to, from) => { expect(saved).not.toBeNull(); expect(f.items.get(id)!.parent).toBe(from); moves.push(to); f.items.get(id)!.parent = to; } };
  return { ...f, is, depo, drive, moves, saved: () => saved };
};

describe('topic parent writes and recovery', () => {
  it('moves before JSON; repeats do not move or write twice', async () => {
    const f = fixture(); await konuTasiYaz(f.drive, f.is, f.depo);
    expect(f.moves).toEqual(['u2']); expect(f.kitap().uniteler[1].konular[0].klasor).toBe(f.is.yeniYol); expect(f.saved()).toBeNull();
    await konuTasiYaz(f.drive, f.is, f.depo); expect(f.moves).toEqual(['u2']); expect(f.yazmalar()).toEqual(['jsonYaz']);
  });
  it('inverse restores Drive, JSON, ribbons and fields', async () => {
    const f = fixture(), original = f.kitap(); await konuTasiYaz(f.drive, f.is, f.depo);
    await konuTasiYaz(f.drive, tersTasi(f.is), f.depo);
    expect(f.kitap()).toEqual(original); expect(f.items.get('t1')!.parent).toBe('u1');
  });
  it('lost parent response retries without second parent mutation', async () => {
    const f = fixture(), move = f.drive.tasi!;
    f.drive.tasi = async (...args) => { await move(...args); throw new TypeError('lost'); };
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow();
    await konuTasiYaz(f.drive, f.is, f.depo);
    expect(f.moves).toEqual(['u2']); expect(f.saved()).toBeNull();
  });
  it.each(['oge', 'kokCocuklari', 'jsonOku', 'degisimZamani', 'jsonYaz', 'tasi'] as const)('failure at %s can retry', async method => {
    const f = fixture(); const original = f.drive[method];
    Object.assign(f.drive, { [method]: vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockImplementation(original!) });
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow();
    await konuTasiYaz(f.drive, f.is, f.depo); expect(f.items.get('t1')!.parent).toBe('u2'); expect(f.saved()).toBeNull();
  });
  it('JSON response lost: retry sees updated JSON, performs no duplicate write', async () => {
    const f = fixture(), write = f.drive.jsonYaz;
    f.drive.jsonYaz = async (...args) => { await write(...args); throw new TypeError('lost'); };
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow();
    await konuTasiYaz(f.drive, f.is, f.depo); expect(f.moves.length).toBe(1); expect(f.yazmalar()).toEqual(['jsonYaz']);
  });
  it.each([false, true])('reload recovery, real destination=%s', async moved => {
    const f = fixture(); f.depo.yaz(f.is); if (moved) f.items.get('t1')!.parent = 'u2';
    const recovered = structuredClone(f.saved()!); recovered.toparla = true;
    await konuTasiYaz(f.drive, recovered, f.depo);
    expect(f.moves).toEqual([]); expect(f.saved()).toBeNull();
    expect(f.yazmalar()).toEqual(moved ? ['jsonYaz'] : []);
  });
  it.each([false, true])('Cancel compensates even if JSON already written=%s', async jsonDone => {
    const f = fixture();
    if (jsonDone) await konuTasiYaz(f.drive, f.is, f.depo);
    else { f.items.get('t1')!.parent = 'u2'; f.depo.yaz(f.is); }
    f.is.iptal = true; await konuTasiYaz(f.drive, f.is, f.depo);
    expect(f.items.get('t1')!.parent).toBe('u1'); expect(f.kitap().uniteler[0].konular[0].klasor).toBe(f.is.eskiYol);
  });
  it.each(['u1', 'u2', 't1', 'kj'])('missing %s: no write', async id => {
    const f = fixture(); f.items.delete(id);
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow(); expect(f.moves).toEqual([]); expect(f.yazmalar()).toEqual([]);
  });
  it.each(['u1', 'u2', 't1', 'kj', 'kb'])('trashed %s: no write', async id => {
    const f = fixture(); f.items.get(id)!.trashed = true;
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow(); expect(f.moves).toEqual([]);
  });
  it('another book destination: no writes', async () => {
    const f = fixture(); f.items.get('u2')!.parent = 'other';
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow(); expect(f.moves).toEqual([]);
  });
  it.each([403, 404])('permission %i stops before writes', async status => {
    const f = fixture(); f.drive.oge = async () => { throw new DriveError(status, 'denied'); };
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow(); expect(f.moves).toEqual([]); expect(f.yazmalar()).toEqual([]);
  });
  it('storage failure prevents parent write', async () => {
    const f = fixture(); f.depo.yaz = () => { throw new Error('storage'); };
    await expect(konuTasiYaz(f.drive, f.is, f.depo)).rejects.toThrow(); expect(f.moves).toEqual([]);
  });
  it('local update failure leaves journal for reload recovery', async () => {
    const f = fixture(); await expect(konuTasiYaz(f.drive, f.is, f.depo, async () => { throw new Error('idb'); })).rejects.toThrow();
    expect(f.saved()).not.toBeNull(); const local = vi.fn(async () => {});
    await konuTasiYaz(f.drive, { ...f.saved()!, toparla: true }, f.depo, local);
    expect(local).toHaveBeenCalledOnce(); expect(f.moves).toEqual(['u2']); expect(f.saved()).toBeNull();
  });
  it('legacy empty target remains recoverable after its JSON gained a folder key', async () => {
    const f = fixture(), raw = f.kitap(); delete raw.uniteler[1].klasor;
    f.items.get('kj')!.icerik = JSON.stringify(raw); f.is.hedefAnahtar = 'b:Leer#0';
    await expect(konuTasiYaz(f.drive, f.is, f.depo, async () => { throw new Error('idb'); })).rejects.toThrow();
    await konuTasiYaz(f.drive, { ...f.saved()!, toparla: true }, f.depo);
    expect(f.kitap().uniteler[1].klasor).toBe('Unite-02-Leer'); expect(f.moves).toEqual(['u2']); expect(f.saved()).toBeNull();
  });
  it('recovery: folder in target and JSON already moved → journal dropped silently, no write', async () => {
    const f = fixture(); await konuTasiYaz(f.drive, f.is, f.depo); f.moves.length = 0;
    const before = f.yazmalar().length;
    f.items.get('u1')!.trashed = true;   // the strict path would stop with a mismatch
    f.depo.yaz(f.is);
    await konuTasiYaz(f.drive, { ...f.is, toparla: true }, f.depo);
    expect(f.saved()).toBeNull(); expect(f.moves).toEqual([]); expect(f.yazmalar().length).toBe(before);
  });
  it.each([null, {}, { islemId: 'x' }])('broken journal %j is rejected', value => expect(() => tasiCoz(value)).toThrow());
});
