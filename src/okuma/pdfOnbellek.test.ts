import { describe, expect, it, vi } from 'vitest';

// Task 6.4e-2b: the reader and the clean view's fingerprints ask for the same version together → one download
const indirmeler: string[] = [];
vi.mock('../drive/drive', () => ({
  driveFetch: async (yol: string) => { indirmeler.push(yol); await new Promise(r => setTimeout(r, 5)); return new Response(new Uint8Array([1, 2, 3])); },
  ok: async (r: Response) => r,
}));
const { getPdf } = await import('./pdfOnbellek');

describe('getPdf', () => {
  it('the same version at the same time: one download, the same bytes; later again (no IndexedDB in Node)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b1 = {}, b2 = {};
    const [a, b] = await Promise.all([getPdf('f', 'mt', b1), getPdf('f', 'mt', b2)]);
    expect(indirmeler.length).toBe(1);
    expect(new Uint8Array(a)).toEqual(new Uint8Array([1, 2, 3]));
    expect(b).toBe(a);
    expect(b1).toEqual({ kaynak: 'indirme' });
    expect(b2).toEqual({ kaynak: 'indirme' });
    await getPdf('f', 'mt');
    expect(indirmeler.length).toBe(2);   // not kept after it ended: the device cache is the memory
    await Promise.all([getPdf('f', 'mt2'), getPdf('g', 'mt')]);
    expect(indirmeler.length).toBe(4);
  });
});
