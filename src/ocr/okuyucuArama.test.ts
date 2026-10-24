import { describe, expect, it, vi } from 'vitest';
import { ReaderOcrSearch, type SearchIO } from './okuyucuArama';
import { DriveOcrTrial } from './driveDeneme';

function fixture(texts: string[] = ['', 'Basılı mevcut kelime']) {
  let valid = true;
  const trial = { run: vi.fn(async op => { op.sent = true; op.text = 'el yazısı aranan kelime'; op.cleanup = 'Çöpte doğrulandı: temp'; return op.text; }), cleanup: vi.fn(async op => { op.cleanup = 'Çöpte doğrulandı: temp'; }) };
  const io: SearchIO = { valid: () => valid, verify: vi.fn(async () => {}), text: vi.fn(async p => texts[p.number - 1] ?? ''),
    image: vi.fn(async () => ({ blob: new Blob(['same']), hash: 'same-image' })), trial: trial as unknown as DriveOcrTrial, parent: 'topic' };
  return { search: new ReaderOcrSearch(io), io, trial, invalidate: () => { valid = false; } };
}
const selection = [{ number: 1, index: 7 }, { number: 2, index: 9 }];

describe('limited reader OCR search', () => {
  it('counts before consent; no image/OCR upload on prepare; mixed text pages skip OCR', async () => {
    const { search, io, trial } = fixture();
    expect(await search.prepare(selection)).toBe(1);
    expect(io.image).not.toHaveBeenCalled(); expect(trial.run).not.toHaveBeenCalled();
    await search.start(); expect(trial.run).toHaveBeenCalledTimes(1);
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
    const { search, io, trial } = fixture(['text', 'text']); expect(await search.prepare(selection)).toBe(0);
    await search.start(); expect(io.image).not.toHaveBeenCalled(); expect(trial.run).not.toHaveBeenCalled();
  });
  it('text inspection errors stop preparation rather than uploading a possibly text page', async () => {
    const { search, io, trial } = fixture(); vi.mocked(io.text).mockRejectedValue(new Error('pdf failed'));
    await expect(search.prepare(selection)).rejects.toThrow('pdf failed'); expect(search.pages).toEqual([]); expect(trial.run).not.toHaveBeenCalled();
  });
  it('remote version change rejects cached search and new uploads', async () => {
    const { search, io, trial } = fixture(); await search.prepare(selection); await search.start();
    vi.mocked(io.verify).mockRejectedValue(new Error('version changed'));
    await expect(search.matches('kelime')).rejects.toThrow('version changed');
    await expect(search.start()).rejects.toThrow('version changed'); expect(trial.run).toHaveBeenCalledTimes(1);
  });
  it.each(['logout', 'account change', 'file change'])('rejects late responses and clears transcripts on %s', async () => {
    const { search, trial, invalidate } = fixture(['', '']); await search.prepare(selection);
    let finish!: () => void;
    trial.run.mockImplementationOnce(async op => { op.sent = true; await new Promise<void>(r => { finish = r; }); op.text = 'old private text'; op.cleanup = 'TEMİZLENEMEDİ'; return op.text; });
    const running = search.start(); while (!finish) await new Promise(r => setTimeout(r, 0));
    invalidate(); search.forget(); finish();
    await expect(running).rejects.toThrow('Eski sonuç');
    expect(search.pages.every(p => p.text === undefined && p.operation?.text === undefined)).toBe(true);
    expect(search.pending).toBe(true); await expect(search.matches('private')).rejects.toThrow();
    expect(trial.run).toHaveBeenCalledTimes(1);
  });
  it('cancel stops remaining pages; concurrent start cannot duplicate work', async () => {
    const { search, trial } = fixture(['', '']); await search.prepare(selection);
    trial.run.mockImplementationOnce(async op => { search.cancel(); op.sent = true; op.cleanup = 'Çöpte doğrulandı: temp'; return 'late'; });
    const running = search.start(); await expect(search.start()).rejects.toThrow('aynı anda');
    await expect(running).rejects.toThrow('iptal'); expect(trial.run).toHaveBeenCalledTimes(1);
    expect(search.pending).toBe(false); expect(search.pages[0].text).toBeUndefined();
  });
  it('cleanup failures stay pending and retry the original operation', async () => {
    const { search, trial } = fixture(['']); await search.prepare([selection[0]]);
    trial.run.mockImplementationOnce(async op => { op.sent = true; op.cleanup = 'TEMİZLENEMEDİ'; return 'text'; });
    await search.start(); const original = search.pages[0].operation;
    expect(search.pending).toBe(true); await expect(search.prepare(selection)).rejects.toThrow('temizliği');
    await search.cleanup(); expect(trial.cleanup).toHaveBeenCalledWith(original); expect(search.pending).toBe(false);
    expect(trial.run).toHaveBeenCalledTimes(1);
  });
  it('retrying Start rechecks pending cleanup without resending an already recognized page', async () => {
    const { search, trial } = fixture(['']); await search.prepare([selection[0]]);
    trial.run.mockImplementationOnce(async op => { op.sent = true; op.cleanup = 'TEMİZLENEMEDİ'; return 'text'; });
    await search.start(); expect(search.pending).toBe(true);
    await search.start(); expect(search.pending).toBe(false);
    expect(trial.run).toHaveBeenCalledTimes(1); expect(trial.cleanup).toHaveBeenCalledTimes(1);
  });
  it('cancel during inspection never prepares an image or starts OCR', async () => {
    const { search, io, trial } = fixture();
    vi.mocked(io.text).mockImplementationOnce(async () => { search.cancel(); return ''; });
    await expect(search.prepare(selection)).rejects.toThrow('iptal');
    expect(search.pages).toEqual([]); expect(io.image).not.toHaveBeenCalled(); expect(trial.run).not.toHaveBeenCalled();
  });
});
