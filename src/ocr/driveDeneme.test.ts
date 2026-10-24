import { describe, expect, it, vi } from 'vitest';
import { DriveOcrTrial, OCR_MARK, type OcrOperation } from './driveDeneme';

const blob = new Blob(['trial-image'], { type: 'image/jpeg' });
async function operation(): Promise<OcrOperation> {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
  return { operation: 'same-operation', parent: 'topic', fingerprint: hash, language: 'tr', sent: false, busy: false, cleanup: '' };
}
function mock(op: OcrOperation, lost = false) {
  let file: Record<string, unknown> | null = null;
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      expect(await (init.body as Blob).text()).not.toContain('defterGecici');
      file = { id: 'ocr-temp', parents: ['topic'], mimeType: 'application/vnd.google-apps.document', trashed: false,
        appProperties: { [OCR_MARK]: '1', ocrIslem: op.operation, ocrGirdi: op.fingerprint, ocrDil: 'tr' } };
      if (lost) throw new TypeError('Lost response');
      return Response.json(file);
    }
    if (path.startsWith('files?')) return Response.json({ files: file ? [file] : [] });
    if (init?.method === 'PATCH') { expect(JSON.parse(init.body as string)).toEqual({ trashed: true }); file!.trashed = true; return Response.json(file); }
    if (path.includes('/export?')) return new Response('Türkçe und Deutsch');
    return Response.json(file);
  });
  return fetcher;
}
describe('OCR temporary file lifecycle', () => {
  it('production refuses every call without network', async () => {
    const op = await operation(), fetcher = vi.fn();
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => false);
    await expect(trial.run(op, blob)).rejects.toThrow('yalnız geliştirmede');
    await expect(trial.cleanup(op)).rejects.toThrow('yalnız geliştirmede');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([false, true])('normal/lost response: exports and confirms trash, retry never recreates (%s)', async lost => {
    const op = await operation(), fetcher = mock(op, lost);
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => true);
    expect(await trial.run(op, blob)).toBe('Türkçe und Deutsch');
    expect(op.cleanup).toBe('Çöpte doğrulandı: ocr-temp');
    expect(op.createMs).toBeGreaterThanOrEqual(0);
    expect(op.exportMs).toBeGreaterThanOrEqual(0);
    expect(op.cleanupMs).toBeGreaterThanOrEqual(0);
    expect(op.preflightMs).toBeGreaterThanOrEqual(0);
    expect(op.processingMs!).toBeGreaterThanOrEqual(op.createMs! + op.exportMs!);
    expect(await trial.run(op, blob)).toBe('Türkçe und Deutsch');
    expect(op.cacheHit).toBe(true);
    expect(op.createMs).toBe(0);
    expect(op.exportMs).toBe(0);
    expect(fetcher.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  });
  it('unknown response and delayed listing never cause a second POST', async () => {
    const op = await operation();
    const fetcher = vi.fn(async (_: string, i?: RequestInit) => {
      if (i?.method === 'POST') throw new TypeError('lost');
      return Response.json({ files: [] });
    });
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => true);
    await expect(trial.run(op, blob)).rejects.toThrow('BULUNAMADI');
    await expect(trial.run(op, blob)).rejects.toThrow('BULUNAMADI');
    expect(op.cleanup).toContain('BULUNAMADI');
    expect(fetcher.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  });
  it('same operation cannot be started twice concurrently', async () => {
    const op = await operation(), fetcher = mock(op);
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => true);
    const r = await Promise.allSettled([trial.run(op, blob), trial.run(op, blob)]);
    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  });
  it('foreign markers/parent refuse cleanup and export', async () => {
    const op = await operation();
    const fetcher = vi.fn(async (_path: string) => Response.json({ files: [{ id: 'foreign', parents: ['another-topic'], mimeType: 'application/vnd.google-apps.document', appProperties: { defterGecici: '1' } }] }));
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => true);
    await expect(trial.run(op, blob)).rejects.toThrow('uyuşmuyor');
    op.sent = true; await trial.cleanup(op);
    expect(op.cleanup).toContain('TEMİZLENEMEDİ');
    expect(fetcher.mock.calls.every(([p]) => p.startsWith('files?'))).toBe(true);
  });
  it('cleanup failure is explicit and retry cleans the same file', async () => {
    const op = await operation(), normal = mock(op); let fail = true;
    const fetcher = vi.fn(async (p: string, i?: RequestInit) => i?.method === 'PATCH' && fail ? new Response('', { status: 403 }) : normal(p, i));
    const trial = new DriveOcrTrial(fetcher, vi.fn(), () => true);
    await trial.run(op, blob); expect(op.cleanup).toContain('TEMİZLENEMEDİ: ocr-temp');
    fail = false; await trial.cleanup(op); expect(op.cleanup).toContain('Çöpte doğrulandı');
    expect(normal.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  });
  it('invalid input and parent rejection do not upload', async () => {
    const op = await operation(), fetcher = vi.fn();
    const trial = new DriveOcrTrial(fetcher, async () => { throw new Error('parent denied'); }, () => true);
    await expect(trial.run(op, blob)).rejects.toThrow('parent denied');
    await expect(trial.run(op, new Blob(['different'], { type: 'image/jpeg' }))).rejects.toThrow('görüntüsü');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
