import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { PdfConflict, type PdfDrive } from '../drive/pdfYazici';
import { remainingDiff, type PenDiff, type PendingRecord } from './bekleyenFark';
import type { PageStrokes, Stroke } from './cizgi';
import { DriveUploader, MAX_TRIES, uploadRecord, type UploadStatus, type Uploaded } from './pdfKayit';
import { readDefterStrokes, writeDefterStrokes } from './pdfNotlari';

// Task 4.8b: pending strokes → the PDF on Drive. A fake Drive in memory; no request goes anywhere.

const stroke = (id: string): Stroke => ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2.2, opaklik: 1, noktalar: [100, 100, 200, 150] });

// 3 pages; page 2 (index 1) has a note from another app
async function samplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([595.28, 841.89]);
  const ctx = doc.context;
  doc.getPage(1).node.set(PDFName.of('Annots'), ctx.obj([ctx.register(ctx.obj({
    Type: 'Annot', Subtype: 'Text', Rect: [50, 700, 70, 720], Contents: PDFString.of('Merhaba'), T: PDFString.of('Ali')
  }))]));
  return doc.save();
}

// One PDF on a fake Drive. modifiedTime is a counter; `changeBeforeCheck` makes it change right before
// uploadPdf compares it (another device writing), that many times.
function fakeDrive(start: Uint8Array) {
  const file = { bytes: start, mt: 't1', n: 1, canEdit: true, changeBeforeCheck: 0, offline: 0 };
  const log: string[] = [];
  const hooks = { duringUpload: null as null | (() => void) };
  let checks = 0;
  const net = () => { if (file.offline > 0) { file.offline--; throw new TypeError('Failed to fetch'); } };
  const drive: PdfDrive = {
    async canEdit() { net(); log.push('canEdit'); return file.canEdit; },
    async listRevisions() { return { revisions: [{ id: 'r1', keepForever: true }] }; },
    async headRevisionId() { return `r${file.n}`; },
    async keepRevision() {},
    async modifiedTime() {
      net();
      log.push('modifiedTime');
      // the second read of a round is uploadPdf's check
      if (++checks % 2 === 0 && file.changeBeforeCheck > 0) { file.changeBeforeCheck--; file.mt = `t${++file.n}`; }
      return file.mt;
    },
    async uploadMedia(id, bytes) {
      log.push('upload');
      hooks.duringUpload?.();
      file.bytes = bytes; file.mt = `t${++file.n}`;
      return { id, modifiedTime: file.mt, headRevisionId: `r${file.n}` };
    },
    async uploadResumable(id, bytes) { return this.uploadMedia(id, bytes); }
  };
  const deps = { drive, bytes: async (_id: string, mt: string) => { log.push(`bytes:${mt}`); return file.bytes; } };
  return { file, log, drive, deps, hooks };
}

const rec = (d: Partial<PenDiff>, mt = 't1'): PendingRecord =>
  ({ fileId: 'f', kaynakModifiedTime: mt, dosyaAdi: 'a.pdf', eklenen: [], silinenIdler: [], guncelleme: 'x', ...d });

const idsOf = (pages: PageStrokes) => Object.fromEntries([...pages].map(([p, l]) => [p, l.map(s => s.id)]));

async function pageText(bytes: Uint8Array, i: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(i);
  return [page.node.get(PDFName.of('Contents'))?.toString(), ...(page.node.Annots()?.asArray() ?? []).map(r => doc.context.lookup(r)!.toString())].join('\n');
}

afterEach(() => { vi.useRealTimers(); });

describe('uploadRecord', () => {
  it('writes the difference; another device\'s strokes and other pages stay', async () => {
    const start = await writeDefterStrokes(await samplePdf(), new Map([[0, [stroke('o')]]]));
    const { file, deps, log } = fakeDrive(start);
    const u = await uploadRecord(deps, rec({ eklenen: [{ sayfa: 0, stroke: stroke('a') }, { sayfa: 2, stroke: stroke('b') }] }));
    expect(u.modifiedTime).toBe('t2');
    expect(u.kaynakModifiedTime).toBe('t1');
    expect(idsOf(await readDefterStrokes(file.bytes))).toEqual({ 0: ['o', 'a'], 2: ['b'] });
    expect(idsOf(u.pages)).toEqual({ 0: ['o', 'a'], 2: ['b'] });
    // page 2 (not touched): exactly as before, its other note too
    expect(await pageText(file.bytes, 1)).toBe(await pageText(start, 1));
    expect(log).toEqual(['modifiedTime', 'bytes:t1', 'canEdit', 'modifiedTime', 'upload']);
  });

  it('deletes by id; gives back what it removed (for an undo during the upload)', async () => {
    const start = await writeDefterStrokes(await samplePdf(), new Map([[2, [stroke('x'), stroke('y')]]]));
    const { file, deps } = fakeDrive(start);
    const u = await uploadRecord(deps, rec({ silinenIdler: [{ sayfa: 2, id: 'x' }, { sayfa: 2, id: 'gone' }] }));
    expect(idsOf(await readDefterStrokes(file.bytes))).toEqual({ 2: ['y'] });
    expect(u.removed.map(r => [r.sayfa, r.stroke.id])).toEqual([[2, 'x']]);
  });

  it('PdfConflict: from the start again (newest bytes), at most 3 tries', async () => {
    const { file, deps, log } = fakeDrive(await samplePdf());
    file.changeBeforeCheck = MAX_TRIES - 1;
    const u = await uploadRecord(deps, rec({ eklenen: [{ sayfa: 0, stroke: stroke('a') }] }));
    expect(log.filter(l => l.startsWith('bytes'))).toEqual(['bytes:t1', 'bytes:t2', 'bytes:t3']);
    expect(log.filter(l => l === 'upload')).toHaveLength(1);
    expect(u.modifiedTime).toBe('t4');
  });

  it('PdfConflict 3 times: error, nothing uploaded', async () => {
    const { file, deps, log } = fakeDrive(await samplePdf());
    file.changeBeforeCheck = MAX_TRIES;
    await expect(uploadRecord(deps, rec({ eklenen: [{ sayfa: 0, stroke: stroke('a') }] }))).rejects.toBeInstanceOf(PdfConflict);
    expect(log).not.toContain('upload');
  });

  it('a page the file no longer has: PdfYazilamaz, nothing uploaded', async () => {
    const { deps, log } = fakeDrive(await samplePdf());
    await expect(uploadRecord(deps, rec({ eklenen: [{ sayfa: 7, stroke: stroke('a') }] }))).rejects.toThrow(/sayfaları değişmiş/);
    expect(log).not.toContain('upload');
  });
});

describe('DriveUploader', () => {
  function setup(start: Uint8Array, opts: { record?: PendingRecord | null } = {}) {
    const d = fakeDrive(start);
    const statuses: UploadStatus[] = [];
    const done: Uploaded[] = [];
    let record = opts.record === undefined ? rec({ eklenen: [{ sayfa: 0, stroke: stroke('a') }] }) : opts.record;
    const up = new DriveUploader(d.deps, {
      record: async () => record,
      done: u => { done.push(u); record = null; },
      status: s => statuses.push(s),
    }, { idle: 30_000, retry: 60_000 });
    return { ...d, up, statuses, done, setRecord: (r: PendingRecord | null) => { record = r; } };
  }

  it('sample library: Drive is never asked', async () => {
    const s = setup(await samplePdf());
    await s.up.request(['ornek:kitap#x/ozet.pdf']);
    s.up.soon('ornek:kitap#x/ozet.pdf');
    expect(s.up.canUpload('ornek:kitap#x/ozet.pdf')).toBe(false);
    expect(s.up.canUpload('f')).toBe(true);
    expect(s.log).toEqual([]);
    expect(s.statuses).toEqual([]);
  });

  it('success: kaydediliyor → kaydedildi, done gets the new version', async () => {
    const s = setup(await samplePdf());
    await s.up.request(['f']);
    expect(s.statuses.map(x => x.tur)).toEqual(['kaydediliyor', 'kaydedildi']);
    expect(s.done[0].modifiedTime).toBe('t2');
  });

  it('nothing pending: no request', async () => {
    const s = setup(await samplePdf(), { record: rec({}) });
    await s.up.request(['f']);
    expect(s.log).toEqual([]);
  });

  it('read-only PDF: Turkish message, no retry, done not called', async () => {
    const s = setup(await samplePdf());
    s.file.canEdit = false;
    await s.up.request(['f']);
    expect(s.statuses.at(-1)).toEqual({ tur: 'hata', mesaj: 'Bu PDF\'e yazma iznin yok; çizimler cihazda kaldı.', tekrar: false });
    expect(s.done).toEqual([]);
  });

  it('offline: cevrimdisi, tried again after 60 s', async () => {
    vi.useFakeTimers();
    const s = setup(await samplePdf());
    s.file.offline = 1;
    await s.up.request(['f']);
    expect(s.statuses.at(-1)).toEqual({ tur: 'cevrimdisi' });
    expect(s.done).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    await s.up.idle();
    expect(s.statuses.at(-1)).toEqual({ tur: 'kaydedildi' });
    expect(s.done).toHaveLength(1);
    s.up.dispose();
  });

  it('30 s after the last change', async () => {
    vi.useFakeTimers();
    const s = setup(await samplePdf());
    s.up.soon('f');
    await vi.advanceTimersByTimeAsync(20_000);
    s.up.soon('f');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    await s.up.idle();
    expect(s.done).toHaveLength(1);
  });

  it('a sent stroke erased during the upload: left as a deletion, removed from Drive by the next upload', async () => {
    const s = setup(await samplePdf());
    const sent = rec({ eklenen: [{ sayfa: 0, stroke: stroke('a') }, { sayfa: 0, stroke: stroke('b') }] });
    s.setRecord(sent);
    let now: PenDiff = sent;
    s.hooks.duringUpload = () => { now = { eklenen: [{ sayfa: 0, stroke: stroke('b') }], silinenIdler: [] }; };   // 'a' erased
    await s.up.request(['f']);
    const u = s.done[0];
    const rest = remainingDiff(u.sent, now, u.removed);
    expect(rest).toEqual({ eklenen: [], silinenIdler: [{ sayfa: 0, id: 'a' }] });
    expect(idsOf(await readDefterStrokes(s.file.bytes))).toEqual({ 0: ['a', 'b'] });
    // the next upload (the record moved to the new version)
    s.hooks.duringUpload = null;
    s.setRecord(rec(rest, u.modifiedTime));
    await s.up.request(['f']);
    expect(idsOf(await readDefterStrokes(s.file.bytes))).toEqual({ 0: ['b'] });
  });
});
