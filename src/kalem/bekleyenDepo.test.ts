import { describe, expect, it, vi } from 'vitest';
import { IdbPendingStore } from './bekleyenDepo';

// Task 4.8a: without IndexedDB (Node has none; a private tab, an old browser) nothing breaks

describe('IdbPendingStore without IndexedDB', () => {
  it('reads nothing, writes nowhere, does not throw; ok = false, warned once', async () => {
    expect(typeof indexedDB).toBe('undefined');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = new IdbPendingStore();
    expect(await s.get('f')).toBeNull();
    await s.put({ fileId: 'f', kaynakModifiedTime: '1', dosyaAdi: 'a.pdf', eklenen: [], silinenIdler: [], guncelleme: 't' });
    await s.delete('f');
    expect(await s.listIds()).toEqual([]);
    expect(s.ok).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
