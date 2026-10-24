import { describe, expect, it, vi } from 'vitest';
import type { OcrSayfa } from './kayit/sema';
import { ReaderOcrSearch, type SearchIO, type SearchPage } from './okuyucuArama';

// 6.4c-0 (Codex) + 6.4c-2: fake engine (read) and fake record (recorded / save)
const okuma = (sayfa: number, metin: string): OcrSayfa =>
  ({ sayfa, parmakIzi: `g:${sayfa}`, model: 'claude-haiku-5-5', okunma: '2026-10-24T20:00:00.000Z', dondurme: 0, satirlar: [{ girinti: 0, parcalar: [{ metin, renk: 'mavi' }] }] });

function fixture(texts: string[] = ['', 'Basılı mevcut kelime'], kayitli: Record<number, OcrSayfa> = {}) {
  let valid = true;
  const saved: { page: number; reading: OcrSayfa }[] = [];
  const progress: string[] = [];
  const read = vi.fn(async (p: SearchPage, _s: AbortSignal) => okuma(p.number, 'el yazısı aranan kelime'));
  const io: SearchIO = {
    valid: () => valid, verify: vi.fn(async () => {}), text: vi.fn(async p => texts[p.number - 1] ?? ''),
    recorded: vi.fn(async p => kayitli[p.number] ?? null), read,
    save: vi.fn(async (p, reading) => { saved.push({ page: p.number, reading }); }),
    progress: (d, t) => progress.push(`${d}/${t}`)
  };
  return { search: new ReaderOcrSearch(io), io, read, saved, progress, invalidate: () => { valid = false; } };
}
const selection = [{ number: 1, index: 7 }, { number: 2, index: 9 }];

describe('reader OCR (Claude engine)', () => {
  it('counts before consent; no reading on prepare; a page with text is skipped', async () => {
    const { search, read, saved } = fixture();
    expect(await search.prepare(selection)).toBe(1);
    expect(read).not.toHaveBeenCalled();
    expect(search.pages.map(p => p.state)).toEqual(['okunacak', 'metin']);
    await search.start(); expect(read).toHaveBeenCalledTimes(1);
    expect(saved.map(s => s.page)).toEqual([1]);
    const matches = await search.matches('kelime');
    expect(matches.map(m => [m.page.number, m.page.index, m.ocr])).toEqual([[1, 7, true], [2, 9, false]]);
    expect(matches[0].excerpt).toContain('el yazısı');
  });
  it.each([{ pages: [] }, { pages: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, index: i })) }, { pages: [selection[0], selection[0]] }])('rejects empty, >5 or duplicate pages before any IO ($pages)', async ({ pages }) => {
    const { search, io } = fixture(); await expect(search.prepare(pages)).rejects.toThrow('1–5');
    expect(io.verify).not.toHaveBeenCalled(); expect(io.text).not.toHaveBeenCalled();
  });
  it('a recorded page is "okundu" (its text from the record) and not read again', async () => {
    const { search, read } = fixture(['', ''], { 2: okuma(2, 'önceden okunan') });
    expect(await search.prepare(selection)).toBe(1);
    expect(search.pages.map(p => p.state)).toEqual(['okunacak', 'okundu']);
    expect(search.pages[1].text).toBe('önceden okunan');
    await search.start();
    expect(read.mock.calls.map(c => c[0].number)).toEqual([1]);
  });
  it('"Tekrar oku": a recorded page is read and saved again; a page with text never', async () => {
    const { search, read, saved } = fixture(['', 'basılı'], { 1: okuma(1, 'eski') });
    expect(await search.prepare(selection)).toBe(0);
    await search.start(); expect(read).not.toHaveBeenCalled();
    await search.start([1, 2]);
    expect(read.mock.calls.map(c => c[0].number)).toEqual([1]);
    expect(saved.map(s => s.page)).toEqual([1]);
    expect(search.pages[0].text).toBe('el yazısı aranan kelime');
  });
  it('each page is saved the moment it is read; progress 1/2, 2/2', async () => {
    const { search, read, saved, progress } = fixture(['', '']);
    await search.prepare(selection);
    read.mockImplementation(async p => { expect(saved.length).toBe(p.number - 1); return okuma(p.number, 'x'); });
    await search.start();
    expect(saved.map(s => s.page)).toEqual([1, 2]);
    expect(progress).toEqual(['1/2', '2/2']);
  });
  it('a failing second page keeps the first one saved; Start again reads only the second', async () => {
    const { search, read, saved } = fixture(['', '']); await search.prepare(selection);
    read.mockResolvedValueOnce(okuma(1, 'first')).mockRejectedValueOnce(new Error('network'));
    await expect(search.start()).rejects.toThrow('network');
    expect(saved.map(s => s.page)).toEqual([1]);
    await search.start();
    expect(read).toHaveBeenCalledTimes(3); expect(search.pages.map(p => p.text)).toEqual(['first', 'el yazısı aranan kelime']);
  });
  it('text inspection errors stop preparation rather than sending a possibly text page', async () => {
    const { search, io, read } = fixture(); vi.mocked(io.text).mockRejectedValue(new Error('pdf failed'));
    await expect(search.prepare(selection)).rejects.toThrow('pdf failed'); expect(search.pages).toEqual([]); expect(read).not.toHaveBeenCalled();
  });
  it('remote version change rejects cached search and new reading', async () => {
    const { search, io, read } = fixture(); await search.prepare(selection); await search.start();
    vi.mocked(io.verify).mockRejectedValue(new Error('version changed'));
    await expect(search.matches('kelime')).rejects.toThrow('version changed');
    await expect(search.start([1])).rejects.toThrow('version changed'); expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(['logout', 'account change', 'file change'])('a late answer after %s is neither saved nor kept', async () => {
    const { search, read, saved, invalidate } = fixture(['', '']); await search.prepare(selection);
    let finish!: () => void;
    read.mockImplementationOnce(async p => { await new Promise<void>(r => { finish = r; }); return okuma(p.number, 'old private text'); });
    const running = search.start(); while (!finish) await new Promise(r => setTimeout(r, 0));
    invalidate(); search.forget(); finish();
    await expect(running).rejects.toThrow('Eski sonuç');
    expect(saved).toEqual([]);
    expect(search.pages.every(p => p.text === undefined)).toBe(true);
    await expect(search.matches('private')).rejects.toThrow();
  });
  it('cancel: the request is aborted, no further page is started; concurrent start refused', async () => {
    const { search, read, saved } = fixture(['', '']); await search.prepare(selection);
    let signal!: AbortSignal;
    read.mockImplementationOnce(async (_p, s) => { signal = s; search.cancel(); throw new DOMException('iptal', 'AbortError'); });
    const running = search.start(); await expect(search.start()).rejects.toThrow('aynı anda');
    await expect(running).rejects.toThrow();
    expect(signal.aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(1); expect(saved).toEqual([]);
    expect(search.pages[0].state).toBe('okunacak');
  });
  it('cancel while a finished reading is being saved: that page counts as read, the next one is not started', async () => {
    const { search, io, read } = fixture(['', '']); await search.prepare(selection);
    vi.mocked(io.save).mockImplementationOnce(async () => { search.cancel(); });
    await expect(search.start()).rejects.toThrow('iptal');
    expect(read).toHaveBeenCalledTimes(1);
    expect(search.pages.map(p => p.state)).toEqual(['okundu', 'okunacak']);
  });
  it('cancel during inspection never starts a reading', async () => {
    const { search, io, read } = fixture();
    vi.mocked(io.text).mockImplementationOnce(async () => { search.cancel(); return ''; });
    await expect(search.prepare(selection)).rejects.toThrow('iptal');
    expect(search.pages).toEqual([]); expect(read).not.toHaveBeenCalled();
  });
});
