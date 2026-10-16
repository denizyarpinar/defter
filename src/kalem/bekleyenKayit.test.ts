import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingStore } from './bekleyenDepo';
import type { PenDiff, PendingRecord } from './bekleyenFark';
import { PendingSaver, SAVE_DELAY_MS } from './bekleyenKayit';
import type { Stroke } from './cizgi';

// Task 4.8a: the writer (debounce, one write at a time)

const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2, opaklik: 1, noktalar: [1, 2] });

// A store in memory; each operation can be held (to see the order)
class FakeStore implements PendingStore {
  ok = true;
  recs = new Map<string, PendingRecord>();
  log: string[] = [];
  hold: (() => void) | null = null;
  holding = false;
  private async step(name: string): Promise<void> {
    this.log.push(`${name}:basla`);
    if (this.holding) await new Promise<void>(r => { this.hold = r; });
    this.log.push(`${name}:bitti`);
  }
  async get(id: string) { return this.recs.get(id) ?? null; }
  async put(r: PendingRecord) { await this.step(`put ${r.fileId} ${r.eklenen.map(e => e.stroke.id).join(',')}`); this.recs.set(r.fileId, r); }
  async delete(id: string) { await this.step(`delete ${id}`); this.recs.delete(id); }
  async listIds() { return [...this.recs.keys()]; }
}

const rec = (fileId: string, d: Partial<PenDiff>, mt = '1'): PendingRecord =>
  ({ fileId, kaynakModifiedTime: mt, dosyaAdi: 'a.pdf', eklenen: [], silinenIdler: [], guncelleme: 't', ...d });

describe('PendingSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('writes 300 ms after the last change, once for many changes', async () => {
    const store = new FakeStore();
    let now: string[] = [];
    const snap = vi.fn((id: string) => rec(id, { eklenen: now.map(s => ({ sayfa: 0, stroke: stroke(s) })) }));
    const saver = new PendingSaver(store, snap);
    now = ['a']; saver.changed('f');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    now = ['a', 'b']; saver.changed('f');
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(snap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await saver.idle();
    expect(snap).toHaveBeenCalledTimes(1);
    expect(store.log).toEqual(['put f a,b:basla', 'put f a,b:bitti']);
  });

  it('flush takes the records at once (the model may be cleared right after)', async () => {
    const store = new FakeStore();
    let model: string[] | null = ['a'];
    const saver = new PendingSaver(store, id => model ? rec(id, { eklenen: model.map(s => ({ sayfa: 0, stroke: stroke(s) })) }) : null);
    saver.changed('f');
    const p = saver.flush();
    model = null;   // the reader closed
    await p;
    expect(store.recs.get('f')?.eklenen.map(e => e.stroke.id)).toEqual(['a']);
  });

  it('an empty difference removes the record', async () => {
    const store = new FakeStore();
    store.recs.set('f', rec('f', { eklenen: [{ sayfa: 0, stroke: stroke('a') }] }));
    const written = vi.fn();
    const saver = new PendingSaver(store, id => rec(id, {}), written);
    saver.changed('f');
    await saver.flush();
    expect(store.recs.has('f')).toBe(false);
    expect(written).toHaveBeenCalledWith('f', false);
  });

  it('a file the model does not have is skipped', async () => {
    const store = new FakeStore();
    const saver = new PendingSaver(store, () => null);
    saver.changed('f');
    await saver.flush();
    expect(store.log).toEqual([]);
  });

  it('the next write waits for the one before (never two at the same time)', async () => {
    const store = new FakeStore();
    let now = ['a'];
    const saver = new PendingSaver(store, id => rec(id, { eklenen: now.map(s => ({ sayfa: 0, stroke: stroke(s) })) }));
    store.holding = true;
    saver.changed('f');
    void saver.flush();
    await vi.waitFor(() => expect(store.hold).not.toBeNull());
    now = ['a', 'b'];
    saver.changed('f');
    void saver.flush();
    await Promise.resolve();
    expect(store.log).toEqual(['put f a:basla']);   // the second one hasn't started
    store.holding = false;
    store.hold!();
    await saver.idle();
    expect(store.log).toEqual(['put f a:basla', 'put f a:bitti', 'put f a,b:basla', 'put f a,b:bitti']);
    expect(store.recs.get('f')?.eklenen).toHaveLength(2);
  });

  it('a store that fails does not stop the queue', async () => {
    const store = new FakeStore();
    store.put = async () => { throw new Error('dolu'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saver = new PendingSaver(store, id => rec(id, { eklenen: [{ sayfa: 0, stroke: stroke('a') }] }));
    saver.changed('f');
    await saver.flush();
    store.put = async r => { store.recs.set(r.fileId, r); };
    saver.changed('f');
    await saver.flush();
    expect(store.recs.has('f')).toBe(true);
    warn.mockRestore();
  });

  it('uploaded (task 4.8b): removes a record that went whole, keeps one against the new version', async () => {
    const store = new FakeStore();
    const saver = new PendingSaver(store, () => null);
    const sent = { eklenen: [{ sayfa: 0, stroke: stroke('a') }], silinenIdler: [] };
    store.recs.set('f', rec('f', sent, 'eski'));
    store.recs.set('g', rec('g', { eklenen: [{ sayfa: 0, stroke: stroke('b') }] }, 'yeni'));
    await saver.uploaded('f', 'yeni', sent);
    await saver.uploaded('g', 'yeni', { eklenen: [], silinenIdler: [] });
    expect([...store.recs.keys()]).toEqual(['g']);
  });

  it('uploaded: what was drawn / erased during the upload stays, against the new version', async () => {
    const store = new FakeStore();
    const written: [string, boolean][] = [];
    const saver = new PendingSaver(store, () => null, (id, has) => written.push([id, has]));
    const sent = { eklenen: [{ sayfa: 0, stroke: stroke('a') }, { sayfa: 1, stroke: stroke('b') }], silinenIdler: [] };
    // meanwhile: 'b' erased, 'c' drawn (the record is still against the old version)
    store.recs.set('f', { ...rec('f', { eklenen: [{ sayfa: 0, stroke: stroke('a') }, { sayfa: 0, stroke: stroke('c') }] }, 'eski'), baskaSurum: { oncekiModifiedTime: '0' } });
    await saver.uploaded('f', 'yeni', sent);
    const r = store.recs.get('f')!;
    expect(r.kaynakModifiedTime).toBe('yeni');
    expect(r.baskaSurum).toBeUndefined();
    expect(r.eklenen.map(e => e.stroke.id)).toEqual(['c']);
    expect(r.silinenIdler).toEqual([{ sayfa: 1, id: 'b' }]);
    expect(written).toEqual([['f', true]]);
  });
});
