import { describe, expect, it, vi } from 'vitest';
import { depoOku, depoSil, depoTemizle, depoYaz } from './temizDepo';

// Task 6.4e-2b: without IndexedDB (Node has none; a private tab) nothing breaks: nothing kept, warned once
describe('temizDepo without IndexedDB', () => {
  it('reads nothing, writes nowhere, does not throw; warned once', async () => {
    expect(typeof indexedDB).toBe('undefined');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await depoOku('kayit', 'a|f')).toBeNull();
    await depoYaz('atlas', 'a', { png: new Uint8Array(1) });
    await depoSil('kayit', 'a|f');
    await depoTemizle();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
