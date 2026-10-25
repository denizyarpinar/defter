import { describe, expect, it, vi } from 'vitest';
import type { DriveFile } from '../drive/drive';

// Task 6.4e-2b: the folder a file was listed in goes with its pages (the handwriting record is read there)
vi.mock('./pdfOnbellek', () => ({ getPdf: async () => new ArrayBuffer(1) }));
vi.mock('./pdf', () => ({ openPdf: async () => ({ numPages: 2 }), closePdf: async () => {} }));
const { buildTopicPages } = await import('./kitapSayfalari');

const f = (id: string, klasorId?: string): DriveFile => ({ id, name: `${id}.pdf`, mimeType: 'application/pdf', modifiedTime: 'mt', ...(klasorId ? { klasorId } : {}) });
const m = (file: DriveFile) => ({ file, cozum: null });

describe('buildTopicPages: klasorId', () => {
  it('known folder → on every page; unknown → not there', async () => {
    const p = await buildTopicPages({ orijinal: [], ozet: [m(f('brifing', 'KONU')), m(f('sorular'))], uebungen: [], oedevler: [] }, 'ozet');
    expect(p.map(x => [x.dosyaId, x.pdfSayfa, x.klasorId])).toEqual([
      ['brifing', 1, 'KONU'], ['brifing', 2, 'KONU'], ['sorular', 1, undefined], ['sorular', 2, undefined],
    ]);
  });
});
