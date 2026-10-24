import { describe, expect, it, vi } from 'vitest';
import { ReaderOcrSearch, type SearchIO } from './okuyucuArama';

function fixture(texts: string[] = ['', 'Basılı mevcut kelime']) {
  let valid = true;
  const read = vi.fn(async (_image: Blob) => 'el yazısı aranan kelime');
  const io: SearchIO = { valid: () => valid, verify: vi.fn(async () => {}), text: vi.fn(async p => texts[p.number - 1] ?? ''),
    image: vi.fn(async () => ({ blob: new Blob(['same']), hash: 'same-image' })), read };
  return { search: new ReaderOcrSearch(io), io, read, invalidate: () => { valid = false; } };
}
const selection = [{ number: 1, index: 7 }, { number: 2, index: 9 }];

describe('limited reader OCR search', () => {
  it('counts before consent; no image/OCR on prepare; mixed text pages skip OCR', async () => {
    const { search, io, read } = fixture();
    expect(await search.prepare(selection)).toBe(1);
    expect(io.image).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    await search.start(); expect(read).toHaveBeenCalledTimes(1);
    const matches = await search.matches('kelime');
    expect(matches.map(m => [m.page.number, m.page.index, m.ocr])).toEqual([[1, 7, true], [2, 9, false]]);
    expect(matches[0].excerpt).toContain('el yazısı');
    expect(matches[0]).not.toHaveProperty('coordinates');
  });
  it.each([{ pages: [] }, { pages: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, index: i })) }, { pages: [selection[0], selection[0]] }])('rejects empty, >5 or duplicate pages before any IO ($pages)', async ({ pages }) => {
    const { search, io } = fixture(); await expect(search.prepare(pages)).rejects.toThrow('1–5');
    expect(io.verify).not.toHaveBeenCalled(); expect(io.text).not.toHaveBeenCalled();
  });
  it('all text pages perform no image preparation or OCR', async () => {
    const { search, io, read } = fixture(['text', 'text']); expect(await search.prepare(selection)).toBe(0);
    await search.start(); expect(io.image).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it('text inspection errors stop preparation rather than sending a possibly text page', async () => {
    const { search, io, read } = fixture(); vi.mocked(io.text).mockRejectedValue(new Error('pdf failed'));
    await expect(search.prepare(selection)).rejects.toThrow('pdf failed'); expect(search.pages).toEqual([]); expect(read).not.toHaveBeenCalled();
  });
  it('remote version change rejects cached search and new OCR', async () => {
    const { search, io, read } = fixture(); await search.prepare(selection); await search.start();
    vi.mocked(io.verify).mockRejectedValue(new Error('version changed'));
    await expect(search.matches('kelime')).rejects.toThrow('version changed');
    await expect(search.start()).rejects.toThrow('version changed'); expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(['logout', 'account change', 'file change'])('rejects late responses and clears transcripts on %s', async () => {
    const { search, read, invalidate } = fixture(['', '']); await search.prepare(selection);
    let finish!: () => void;
    read.mockImplementationOnce(async () => { await new Promise<void>(r => { finish = r; }); return 'old private text'; });
    const running = search.start(); while (!finish) await new Promise(r => setTimeout(r, 0));
    invalidate(); search.forget(); finish();
    await expect(running).rejects.toThrow('Eski sonuç');
    expect(search.pages.every(p => p.text === undefined)).toBe(true);
    await expect(search.matches('private')).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('cancel stops remaining pages; concurrent start cannot duplicate work', async () => {
    const { search, read } = fixture(['', '']); await search.prepare(selection);
    read.mockImplementationOnce(async () => { search.cancel(); return 'late'; });
    const running = search.start(); await expect(search.start()).rejects.toThrow('aynı anda');
    await expect(running).rejects.toThrow('iptal'); expect(read).toHaveBeenCalledTimes(1);
    expect(search.pages[0].text).toBeUndefined();
  });
  it('retrying Start does not resend an already recognized page', async () => {
    const { search, read } = fixture(['', '']); await search.prepare(selection);
    read.mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('network'));
    await expect(search.start()).rejects.toThrow('network');
    await search.start();
    expect(read).toHaveBeenCalledTimes(3); expect(search.pages.map(p => p.text)).toEqual(['first', 'el yazısı aranan kelime']);
  });
  it('cancel during inspection never prepares an image or starts OCR', async () => {
    const { search, io, read } = fixture();
    vi.mocked(io.text).mockImplementationOnce(async () => { search.cancel(); return ''; });
    await expect(search.prepare(selection)).rejects.toThrow('iptal');
    expect(search.pages).toEqual([]); expect(io.image).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
});
