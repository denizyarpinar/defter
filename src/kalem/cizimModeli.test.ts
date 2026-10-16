import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';
import type { PageStrokes, Stroke } from './cizgi';
import { PenModel } from './cizimModeli';
import { PdfYazilamaz } from './pdfNotlari';

// Task 4.6: the pen mode's strokes in memory

const penTestUrl = Object.values(import.meta.glob<string>('/public/demo/kalem-testi.pdf', { eager: true, query: '?inline', import: 'default' }))[0];
const penTestBytes = () => Uint8Array.from(atob(penTestUrl.split(',')[1]), c => c.charCodeAt(0));

const stroke = (id: string, over: Partial<Stroke> = {}): Stroke =>
  ({ id, arac: 'kalem', renk: '#222222', kalinlik: 2.2, opaklik: 1, noktalar: [10, 10, 20, 30], ...over });

const empty = async () => new Uint8Array();
const ready = async (pages: PageStrokes = new Map()) => {
  const m = new PenModel(async () => pages);
  await m.ensure('f@1', empty);
  return m;
};

describe('kalem-testi.pdf → the model', () => {
  it('the Defter strokes come with exact ids and tools', async () => {
    const m = new PenModel();
    await m.ensure('kalem-testi@1', async () => penTestBytes());
    expect(m.state('kalem-testi@1')).toBe('hazir');
    expect(m.takeError('kalem-testi@1')).toBeNull();
    // pages 1–2: the three strokes of task 4.4
    expect(m.strokes('kalem-testi@1', 0).map(s => [s.id, s.arac, s.opaklik])).toEqual([
      ['demo-kalem-1', 'kalem', 1],
      ['demo-fosforlu-1', 'fosforlu', 0.4]
    ]);
    expect(m.strokes('kalem-testi@1', 1).map(s => [s.id, s.arac])).toEqual([['demo-kalem-2', 'kalem']]);
    expect(m.strokes('kalem-testi@1', 0)[0]).toMatchObject({ renk: '#d32f2f', kalinlik: 3, noktalar: [80, 520, 120, 490, 160, 525, 200, 485, 240, 520, 270, 500] });
    // pages 3–6: three alignment strokes each (task 4.5) → 15 in all
    let all = 0;
    for (let i = 0; i < 6; i++) all += m.strokes('kalem-testi@1', i).length;
    expect(all).toBe(15);
    expect(m.dirty).toBe(false);
    // task 4.7c: page 2's stroke has the Pencil's pressure; the layer gets it, the others have none
    expect(m.strokes('kalem-testi@1', 1)[0].basinc).toEqual([0.1, 0.4, 1, 0.4, 0.1]);
    expect(m.inks('kalem-testi@1', 1)[0].pressure).toEqual([0.1, 0.4, 1, 0.4, 0.1]);
    expect(m.inks('kalem-testi@1', 0).map(i => i.pressure)).toEqual([undefined, undefined]);
  });
});

describe('PenModel.ensure', () => {
  it('each file is read once, also when asked twice at the same time', async () => {
    const read = vi.fn(async () => new Map() as PageStrokes);
    const bytes = vi.fn(empty);
    const m = new PenModel(read);
    const a = m.ensure('f@1', bytes), b = m.ensure('f@1', bytes);
    expect(m.state('f@1')).toBe('yukleniyor');
    expect(m.loading).toBe(true);
    await Promise.all([a, b]);
    await m.ensure('f@1', bytes);
    expect(bytes).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(m.state('f@1')).toBe('hazir');
    expect(m.loading).toBe(false);
  });

  it('a signed or encrypted file fails alone; its error is given once; it is not tried again', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    doc.catalog.set(PDFName.of('AcroForm'), doc.context.register(doc.context.obj({ Fields: [], SigFlags: 3 })));
    const signed = await doc.save();
    const enc = await PDFDocument.create();
    enc.addPage();
    enc.context.trailerInfo.Encrypt = enc.context.register(enc.context.obj({ Filter: 'Standard', V: 2, R: 3, Length: 128, P: -4 }));
    const encrypted = await enc.save({ useObjectStreams: false });

    const m = new PenModel();
    const bytes = vi.fn(async () => signed);
    await Promise.all([m.ensure('imzali@1', bytes), m.ensure('sifreli@1', async () => encrypted), m.ensure('demo@1', async () => penTestBytes())]);
    expect(m.state('imzali@1')).toBe('hata');
    expect(m.state('sifreli@1')).toBe('hata');
    expect(m.state('demo@1')).toBe('hazir');   // the others go on
    const err = m.takeError('imzali@1');
    expect(err).toBeInstanceOf(PdfYazilamaz);
    expect((err as Error).message).toMatch(/imzalı/);
    expect(m.takeError('imzali@1')).toBeNull();   // one message per file
    expect((m.takeError('sifreli@1') as Error).message).toMatch(/şifreli/);
    // the PDF itself is the problem: turning the pen on again doesn't read it again
    m.retryFailed();
    await m.ensure('imzali@1', bytes);
    expect(bytes).toHaveBeenCalledTimes(1);
    expect(m.state('imzali@1')).toBe('hata');
    expect(() => m.add('imzali@1', 0, stroke('x'))).toThrow(/hazır değil/);
  });

  it('a network error is tried again when the pen is turned on again', async () => {
    let fail = true;
    const m = new PenModel(async () => new Map());
    const bytes = async () => { if (fail) throw new TypeError('Failed to fetch'); return new Uint8Array(); };
    await m.ensure('f@1', bytes);
    expect(m.state('f@1')).toBe('hata');
    expect(m.takeError('f@1')).toBeInstanceOf(TypeError);
    fail = false;
    m.retryFailed();
    expect(m.state('f@1')).toBeUndefined();
    await m.ensure('f@1', bytes);
    expect(m.state('f@1')).toBe('hazir');
  });

  it('clear() while loading: the late answer is dropped', async () => {
    let done!: (p: PageStrokes) => void;
    const m = new PenModel(() => new Promise(r => { done = r; }));
    const p = m.ensure('f@1', empty);
    await Promise.resolve();
    m.clear();
    done(new Map([[0, [stroke('a')]]]));
    await p;
    expect(m.state('f@1')).toBeUndefined();
    expect(m.strokes('f@1', 0)).toEqual([]);
  });
});

describe('PenModel.add', () => {
  it('adds a valid stroke to its page, the model is dirty', async () => {
    const m = await ready(new Map([[0, [stroke('eski')]]]));
    m.add('f@1', 0, stroke('yeni'));
    m.add('f@1', 3, stroke('nokta', { noktalar: [5, 5] }));   // a single tap: one point
    expect(m.strokes('f@1', 0).map(s => s.id)).toEqual(['eski', 'yeni']);
    expect(m.strokes('f@1', 3).map(s => s.id)).toEqual(['nokta']);
    expect(m.dirty).toBe(true);
    m.clear();
    expect(m.dirty).toBe(false);
  });

  it('goes through validateStroke', async () => {
    const m = await ready();
    expect(() => m.add('f@1', 0, stroke('a', { opaklik: 0.5 }))).toThrow(/kalem opaklığı/);
    expect(() => m.add('f@1', 0, stroke('b', { arac: 'fosforlu', opaklik: 1 }))).toThrow(/fosforlu/);
    expect(() => m.add('f@1', 0, stroke('c', { noktalar: [] }))).toThrow(/nokta/);
    expect(() => m.add('f@1', 0, stroke('d', { renk: 'red' }))).toThrow(/renk/);
    expect(m.strokes('f@1', 0)).toEqual([]);
    expect(m.dirty).toBe(false);
  });

  it('inks: what the SVG layer draws', async () => {
    const m = await ready();
    m.add('f@1', 0, stroke('h', { arac: 'fosforlu', renk: '#f5d33a', kalinlik: 14, opaklik: 0.35, noktalar: [1, 2, 3, 4] }));
    expect(m.inks('f@1', 0)).toEqual([{ lines: [[1, 2, 3, 4]], color: '#f5d33a', width: 14, opacity: 0.35 }]);
    expect(m.inks('f@1', 1)).toEqual([]);
    expect(m.inks('yok@1', 0)).toEqual([]);
  });
});

// Task 4.7: eraser, undo / redo, "Kaydedilmedi"

const ids = (m: PenModel, key = 'f@1', page = 0) => m.strokes(key, page).map(s => s.id);
const at = (x: number, y: number) => [x, y] as const;

describe('PenModel eraser', () => {
  it('one drag that erases several strokes is one operation; they come back together, in their place', async () => {
    const m = await ready(new Map([[0, [stroke('a', { noktalar: [0, 0, 100, 0] }), stroke('b', { noktalar: [0, 50, 100, 50] }), stroke('c', { noktalar: [0, 100, 100, 100] })]]]));
    expect(m.eraseAt('f@1', 0, at(50, -10), at(50, 10), 2)).toBe(1);    // a
    expect(m.eraseAt('f@1', 0, at(50, 10), at(50, 110), 2)).toBe(2);    // b and c, crossed between two events
    expect(ids(m)).toEqual([]);
    m.eraseEnd();
    expect(m.dirty).toBe(true);
    expect(m.undo()).toEqual({ tur: 'sil', places: [{ key: 'f@1', page: 0 }] });
    expect(ids(m)).toEqual(['a', 'b', 'c']);
    expect(m.canUndo).toBe(false);
    expect(m.dirty).toBe(false);
  });

  it('the middle stroke erased and undone keeps the drawing order', async () => {
    const m = await ready(new Map([[0, [stroke('a', { noktalar: [0, 0] }), stroke('b', { noktalar: [50, 0] }), stroke('c', { noktalar: [100, 0] })]]]));
    m.eraseAt('f@1', 0, at(50, 0), at(50, 0), 1);
    m.eraseEnd();
    expect(ids(m)).toEqual(['a', 'c']);
    m.undo();
    expect(ids(m)).toEqual(['a', 'b', 'c']);
  });

  it('a drag that erases nothing is no operation', async () => {
    const m = await ready(new Map([[0, [stroke('a')]]]));
    expect(m.eraseAt('f@1', 0, at(500, 500), at(510, 510), 2)).toBe(0);
    m.eraseEnd();
    expect(m.canUndo).toBe(false);
    expect(m.dirty).toBe(false);
  });

  it('a cancelled drag (second finger) puts back what it erased, no operation', async () => {
    const m = await ready(new Map([[0, [stroke('a'), stroke('b', { noktalar: [300, 300, 310, 310] })]]]));
    m.eraseAt('f@1', 0, at(10, 10), at(10, 10), 2);
    expect(ids(m)).toEqual(['b']);
    expect(m.eraseCancel()).toEqual([{ key: 'f@1', page: 0 }]);
    expect(ids(m)).toEqual(['a', 'b']);
    expect(m.canUndo).toBe(false);
    expect(m.dirty).toBe(false);
    expect(m.eraseCancel()).toEqual([]);
  });

  it('only the strokes in the model: a file not loaded throws, nothing else is touched', async () => {
    const m = await ready();
    expect(() => m.eraseAt('yok@1', 0, at(0, 0), at(0, 0), 2)).toThrow(/hazır değil/);
  });
});

describe('PenModel undo / redo', () => {
  it('add → erase → undo → undo → redo', async () => {
    const m = await ready(new Map([[0, [stroke('eski', { noktalar: [0, 200, 100, 200] })]]]));
    m.add('f@1', 0, stroke('yeni'));
    m.eraseAt('f@1', 0, at(0, 200), at(100, 200), 2);   // the old one
    m.eraseAt('f@1', 0, at(15, 20), at(15, 20), 2);     // the new one
    m.eraseEnd();
    expect(ids(m)).toEqual([]);
    expect(m.undo()?.tur).toBe('sil');
    expect(ids(m)).toEqual(['eski', 'yeni']);
    expect(m.undo()?.tur).toBe('ekle');
    expect(ids(m)).toEqual(['eski']);
    expect(m.dirty).toBe(false);
    expect(m.undo()).toBeNull();
    expect(m.redo()).toEqual({ tur: 'ekle', places: [{ key: 'f@1', page: 0 }] });
    expect(ids(m)).toEqual(['eski', 'yeni']);
    expect(m.dirty).toBe(true);
    expect(m.redo()?.tur).toBe('sil');
    expect(ids(m)).toEqual([]);
    expect(m.redo()).toBeNull();
  });

  it('a new operation clears redo', async () => {
    const m = await ready();
    m.add('f@1', 0, stroke('a'));
    m.undo();
    expect(m.canRedo).toBe(true);
    m.add('f@1', 0, stroke('b'));
    expect(m.canRedo).toBe(false);
    expect(m.redo()).toBeNull();
    expect(ids(m)).toEqual(['b']);
  });

  it('one history across files; each file is dirty on its own', async () => {
    const m = new PenModel(async () => new Map());
    await m.ensure('a@1', empty);
    await m.ensure('b@1', empty);
    m.add('a@1', 0, stroke('a1'));
    m.add('b@1', 4, stroke('b1'));
    m.add('a@1', 2, stroke('a2'));
    expect(m.undo()).toEqual({ tur: 'ekle', places: [{ key: 'a@1', page: 2 }] });
    expect(m.undo()).toEqual({ tur: 'ekle', places: [{ key: 'b@1', page: 4 }] });
    expect(m.isDirty('a@1')).toBe(true);
    expect(m.isDirty('b@1')).toBe(false);
    expect(m.undo()).toEqual({ tur: 'ekle', places: [{ key: 'a@1', page: 0 }] });
    expect(m.dirty).toBe(false);
    expect(m.redo()?.places[0].key).toBe('a@1');
    expect(m.redo()?.places[0].key).toBe('b@1');
    expect(m.strokes('b@1', 4).map(s => s.id)).toEqual(['b1']);
  });

  it('back at the start: not dirty; undo + a new stroke: dirty (a new revision)', async () => {
    const m = await ready();
    expect(m.revision('f@1')).toBe(0);
    m.add('f@1', 0, stroke('a'));
    const r1 = m.revision('f@1');
    m.undo();
    expect(m.revision('f@1')).toBe(0);
    expect(m.dirty).toBe(false);
    m.add('f@1', 0, stroke('b'));
    expect(m.revision('f@1')).not.toBe(r1);
    expect(m.dirty).toBe(true);
  });

  it('task 4.8: markSaved makes that revision the clean one', async () => {
    const m = await ready();
    m.add('f@1', 0, stroke('a'));
    m.markSaved('f@1', m.revision('f@1'));
    expect(m.dirty).toBe(false);
    m.undo();                     // the file has "a" now: going back is a change
    expect(m.dirty).toBe(true);
    m.redo();
    expect(m.dirty).toBe(false);
  });

  it('over 200 operations: the oldest can not be undone, the file stays dirty', async () => {
    const m = await ready();
    for (let i = 0; i < 205; i++) m.add('f@1', 0, stroke(`s${i}`));
    let n = 0;
    while (m.undo()) n++;
    expect(n).toBe(200);
    expect(ids(m)).toEqual(['s0', 's1', 's2', 's3', 's4']);
    expect(m.dirty).toBe(true);
  });

  it('undo during an eraser drag: the drag is cancelled first', async () => {
    const m = await ready();
    m.add('f@1', 0, stroke('a'));
    m.add('f@1', 0, stroke('b', { noktalar: [300, 300] }));
    m.eraseAt('f@1', 0, at(10, 10), at(10, 10), 2);   // a goes
    m.undo();                                         // a back, then "b" undone
    expect(ids(m)).toEqual(['a']);
  });

  it('clear() drops the history', async () => {
    const m = await ready();
    m.add('f@1', 0, stroke('a'));
    m.clear();
    expect(m.canUndo).toBe(false);
    expect(m.undo()).toBeNull();
  });
});

// Task 4.7b: one eraser drag across pages and files

describe('PenModel eraser across pages', () => {
  const two = async () => {
    const m = new PenModel(async () => new Map());
    await m.ensure('a@1', empty);
    await m.ensure('b@1', empty);
    m.add('a@1', 0, stroke('a0', { noktalar: [10, 10] }));
    m.add('a@1', 0, stroke('a0-kalan', { noktalar: [400, 400] }));
    m.add('a@1', 1, stroke('a1', { noktalar: [10, 10] }));
    m.add('b@1', 3, stroke('b3', { noktalar: [10, 10] }));
    m.markSaved('a@1', m.revision('a@1'));   // as if this were the file
    m.markSaved('b@1', m.revision('b@1'));
    return m;
  };
  const dot = at(10, 10);

  it('pages 1 and 2 of one file and a page of another: one operation, one undo brings all back', async () => {
    const m = await two();
    m.eraseAt('a@1', 0, dot, dot, 2);
    m.eraseAt('a@1', 1, dot, dot, 2);
    m.eraseAt('b@1', 3, dot, dot, 2);
    m.eraseEnd();
    expect([ids(m, 'a@1', 0), ids(m, 'a@1', 1), ids(m, 'b@1', 3)]).toEqual([['a0-kalan'], [], []]);
    expect(m.isDirty('a@1') && m.isDirty('b@1')).toBe(true);

    expect(m.undo()).toEqual({ tur: 'sil', places: [{ key: 'a@1', page: 0 }, { key: 'a@1', page: 1 }, { key: 'b@1', page: 3 }] });
    expect([ids(m, 'a@1', 0), ids(m, 'a@1', 1), ids(m, 'b@1', 3)]).toEqual([['a0', 'a0-kalan'], ['a1'], ['b3']]);
    expect(m.dirty).toBe(false);

    expect(m.redo()?.places).toHaveLength(3);
    expect([ids(m, 'a@1', 0), ids(m, 'a@1', 1), ids(m, 'b@1', 3)]).toEqual([['a0-kalan'], [], []]);
    expect(m.isDirty('a@1') && m.isDirty('b@1')).toBe(true);
    m.undo();
    // the adds before it are separate operations, still there to undo
    expect(m.undo()).toEqual({ tur: 'ekle', places: [{ key: 'b@1', page: 3 }] });
  });

  it('a cancelled drag puts back what it erased on every page', async () => {
    const m = await two();
    m.eraseAt('a@1', 0, dot, dot, 2);
    m.eraseAt('b@1', 3, dot, dot, 2);
    m.eraseAt('a@1', 1, dot, dot, 2);
    expect(m.eraseCancel()).toEqual([{ key: 'a@1', page: 0 }, { key: 'b@1', page: 3 }, { key: 'a@1', page: 1 }]);
    expect([ids(m, 'a@1', 0), ids(m, 'a@1', 1), ids(m, 'b@1', 3)]).toEqual([['a0', 'a0-kalan'], ['a1'], ['b3']]);
    expect(m.dirty).toBe(false);
    m.eraseEnd();
    expect(m.undo()).toEqual({ tur: 'ekle', places: [{ key: 'b@1', page: 3 }] });   // no erase operation was made
  });

  it('back and forth over the same page border: each stroke once, all come back in order', async () => {
    const m = await two();
    m.eraseAt('a@1', 0, dot, dot, 2);
    m.eraseAt('a@1', 1, dot, dot, 2);
    m.eraseAt('a@1', 0, at(400, 400), at(400, 400), 2);   // back on page 1
    m.eraseEnd();
    expect(ids(m, 'a@1', 0)).toEqual([]);
    m.undo();
    expect(ids(m, 'a@1', 0)).toEqual(['a0', 'a0-kalan']);
    expect(ids(m, 'a@1', 1)).toEqual(['a1']);
  });
});
