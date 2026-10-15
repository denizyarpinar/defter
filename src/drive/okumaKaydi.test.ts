import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveError } from './drive';
import { ReadingSaver, type ReadingDrive } from './okumaKaydi';
import type { SaveUi } from './save';

// A fake Drive with one kitap.json; every call is logged.
function fakeDrive(content: Record<string, unknown>) {
  const file = { content: structuredClone(content), modifiedTime: 't1' };
  const log: string[] = [];
  let version = 1;
  const hooks = { onSecondTimeCheck: null as null | (() => void), failWrite: null as unknown };
  let timeChecks = 0;
  const drive: ReadingDrive = {
    async modifiedTime() {
      log.push('modifiedTime');
      if (++timeChecks === 2 && hooks.onSecondTimeCheck) hooks.onSecondTimeCheck();
      return file.modifiedTime;
    },
    async read() { log.push('read'); return structuredClone(file.content); },
    async write(_id, json) {
      log.push('write');
      if (hooks.failWrite) { const e = hooks.failWrite; hooks.failWrite = null; throw e; }
      file.content = structuredClone(json) as Record<string, unknown>;
      file.modifiedTime = 't' + ++version;
    }
  };
  // another device writes kitap.json
  const otherDevice = (change: (c: any) => void) => { change(file.content); file.modifiedTime = 't' + ++version; };
  return { drive, file, log, hooks, otherDevice };
}

const ui = () => ({ saving: vi.fn(), saved: vi.fn(), failed: vi.fn<SaveUi['failed']>() });

const book = () => ({
  surum: 2, baslik: 'PG', kapak: { renk: '#123456', stil: 'kumas' }, bilinmeyen: 42, sonAcilis: null, kurdele: null,
  uniteler: [{ baslik: 'U1', konular: [{ baslik: 'K1', klasor: 'U1/K1', durum: 'okunmadi' }, { baslik: 'K2', klasor: 'U1/K2', durum: 'okunmadi' }] }]
});

const opts = { delay: 5000, retry: 30000 };

describe('ReadingSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('waits 5 s after the last change, then writes once with PATCH on the same file', async () => {
    const d = fakeDrive(book());
    const s = new ReadingSaver(() => 'file-1', d.drive, ui(), opts);
    s.change('pg', { konular: { 'U1/K1': { baslik: 'K1', durum: 'okunuyor' } } });
    await vi.advanceTimersByTimeAsync(3000);
    s.change('pg', { kurdele: { konu: 'U1/K1', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 2 } });
    await vi.advanceTimersByTimeAsync(4999);
    expect(d.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await s.flush();
    expect(d.log.filter(x => x === 'write')).toHaveLength(1);
    expect(d.file.content.bilinmeyen).toBe(42);
    expect(d.file.content.kapak).toEqual({ renk: '#123456', stil: 'kumas' });
    expect((d.file.content.uniteler as any)[0].konular[0].durum).toBe('okunuyor');
    expect(d.file.content.kurdele).toEqual({ konu: 'U1/K1', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 2 });
    expect(s.hasUnsaved).toBe(false);
  });

  it('nothing changed → no write', async () => {
    const d = fakeDrive(book());
    const s = new ReadingSaver(() => 'file-1', d.drive, ui(), opts);
    s.change('pg', { konular: { 'U1/K1': { baslik: 'K1', durum: 'okunmadi' } } });
    await s.flush();
    expect(d.log).toEqual(['modifiedTime', 'read']);
  });

  it('no kitap.json (no file id) → nothing is read or written', async () => {
    const d = fakeDrive(book());
    const s = new ReadingSaver(() => undefined, d.drive, ui(), opts);
    s.change('pg', { sonAcilis: '2026-10-15T10:00:00.000Z' });
    await s.flush();
    expect(d.log).toEqual([]);
    expect(s.hasUnsaved).toBe(false);
  });

  it('another device wrote between read and write → reads again and keeps its change', async () => {
    const d = fakeDrive(book());
    d.hooks.onSecondTimeCheck = () => d.otherDevice(c => { c.uniteler[0].konular[1].durum = 'calisildi'; });
    const s = new ReadingSaver(() => 'file-1', d.drive, ui(), opts);
    s.change('pg', { konular: { 'U1/K1': { baslik: 'K1', durum: 'okundu' } } });
    await s.flush();
    expect(d.log).toEqual(['modifiedTime', 'read', 'modifiedTime', 'modifiedTime', 'read', 'modifiedTime', 'write']);
    const k = (d.file.content.uniteler as any)[0].konular;
    expect(k[0].durum).toBe('okundu');
    expect(k[1].durum).toBe('calisildi');   // the other device's change is still there
  });

  it('keeps conflicting twice → no write, stays waiting, tried again later', async () => {
    const d = fakeDrive(book());
    let n = 0;
    const real = d.drive.modifiedTime;
    d.drive.modifiedTime = async (...a) => { n++; if (n === 2 || n === 4) d.otherDevice(() => {}); return real(...a); };
    const u = ui();
    const s = new ReadingSaver(() => 'file-1', d.drive, u, opts);
    s.change('pg', { konular: { 'U1/K1': { baslik: 'K1', durum: 'okundu' } } });
    await s.flush();
    expect(d.log).not.toContain('write');
    expect(u.failed).toHaveBeenCalledTimes(1);
    expect(s.hasUnsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    await s.flush();
    expect(d.log).toContain('write');
    expect((d.file.content.uniteler as any)[0].konular[0].durum).toBe('okundu');
    expect(u.saved).toHaveBeenCalled();
  });

  it('offline: the change waits and is written when it works again, with newer changes', async () => {
    const d = fakeDrive(book());
    d.hooks.failWrite = new TypeError('Failed to fetch');
    const u = ui();
    const s = new ReadingSaver(() => 'file-1', d.drive, u, opts);
    s.change('pg', { konular: { 'U1/K1': { baslik: 'K1', durum: 'okunuyor' } } });
    await s.flush();
    expect(u.failed).toHaveBeenCalledTimes(1);
    expect(u.failed.mock.calls[0][0]).toMatch(/internet/);
    s.change('pg', { konular: { 'U1/K2': { baslik: 'K2', durum: 'okunuyor' } } });
    await s.flush();
    const k = (d.file.content.uniteler as any)[0].konular;
    expect(k.map((t: any) => t.durum)).toEqual(['okunuyor', 'okunuyor']);
    expect(s.hasUnsaved).toBe(false);
  });

  it('403: no automatic retry (only the button)', async () => {
    const d = fakeDrive(book());
    d.hooks.failWrite = new DriveError(403, 'pg/kitap.json kaydedilirken');
    const u = ui();
    const s = new ReadingSaver(() => 'file-1', d.drive, u, opts);
    s.change('pg', { sonAcilis: '2026-10-15T10:00:00.000Z' });
    await s.flush();
    const writes = () => d.log.filter(x => x === 'write').length;
    expect(writes()).toBe(1);
    await vi.advanceTimersByTimeAsync(120000);
    expect(writes()).toBe(1);
    u.failed.mock.calls[0][1]();   // "Tekrar dene"
    await s.flush();
    expect(writes()).toBe(2);
  });

  it('a file that is not a JSON object is never written over', async () => {
    const d = fakeDrive(book());
    d.drive.read = async () => 'bozuk';
    const u = ui();
    const s = new ReadingSaver(() => 'file-1', d.drive, u, opts);
    s.change('pg', { sonAcilis: '2026-10-15T10:00:00.000Z' });
    await s.flush();
    expect(d.log).not.toContain('write');
    expect(u.failed.mock.calls[0][0]).toMatch(/bozuk/);
  });
});
