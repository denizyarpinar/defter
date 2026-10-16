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
