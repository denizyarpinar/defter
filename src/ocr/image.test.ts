import { afterEach, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ openPdf: vi.fn(), closePdf: vi.fn() }));
vi.mock('../okuma/pdf', () => fake);
import { prepare } from './image';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('inspects and renders only PDF page 1, preserving existing text and closing resources', async () => {
  const canvas = { width: 0, height: 0, getContext: () => ({}), toBlob: (cb: (b: Blob) => void) => cb(new Blob(['rendered'], { type: 'image/jpeg' })) };
  vi.stubGlobal('document', { createElement: () => canvas });
  const page = { rotate: 0, streamTextContent: () => new ReadableStream({ start(c) { c.enqueue({ items: [{ str: 'Existing searchable text', hasEOL: true }] }); c.close(); } }),
    getViewport: ({ rotation = 0 }: { rotation?: number }) => ({ width: rotation === 270 ? 900 : 600, height: rotation === 270 ? 600 : 900 }), render: vi.fn((_options: unknown) => ({ promise: Promise.resolve() })) };
  const doc = { getPage: vi.fn(async () => page) }; fake.openPdf.mockResolvedValue(doc);
  const file = new File(['%PDF-control'], 'control.pdf', { type: 'application/pdf' });
  const r = await prepare(file, 270);
  expect(r.text).toBe('Existing searchable text');
  expect(doc.getPage).toHaveBeenCalledExactlyOnceWith(1);
  expect(page.render.mock.calls[0][0]).toMatchObject({ annotationMode: 0 });
  expect(fake.closePdf).toHaveBeenCalledWith(doc);
  expect(canvas.width + canvas.height).toBe(0);
});
it('closes a failed PDF render without modifying the source file', async () => {
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0 }) });
  const doc = { getPage: vi.fn(async () => { throw new Error('broken page'); }) }; fake.openPdf.mockResolvedValue(doc);
  const file = new File(['%PDF-broken'], 'broken.pdf', { type: 'application/pdf' });
  await expect(prepare(file, 0)).rejects.toThrow('broken page');
  expect(fake.closePdf).toHaveBeenCalledWith(doc);
  expect(await file.text()).toBe('%PDF-broken');
});
