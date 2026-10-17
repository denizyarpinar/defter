import { describe, expect, it } from 'vitest';
import { DOSYA_ACCEPT, ILK_BAYT_SAYISI, dosyaTuru } from './dosyaTuru';

// bytes from numbers and ASCII strings, e.g. b(0, 0, 0, 24, 'ftypheic')
const b = (...parts: (number | string)[]) =>
  new Uint8Array(parts.flatMap(p => typeof p === 'number' ? [p] : [...p].map(c => c.charCodeAt(0))));
const dolgu = (u: Uint8Array, n = 64) => { const o = new Uint8Array(Math.max(n, u.length)).fill(0x20); o.set(u); return o; };

const PDF = dolgu(b('%PDF-1.7\n'));
const JPEG = dolgu(b(0xff, 0xd8, 0xff, 0xe0));
const PNG = dolgu(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const heic = (marka: string) => dolgu(b(0, 0, 0, 24, 'ftyp', marka));
const WEBP = dolgu(b('RIFF', 1, 2, 3, 4, 'WEBPVP8 '));
const ZIP = dolgu(b(0x50, 0x4b, 0x03, 0x04));
const OLE = dolgu(b(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1));
const RASTGELE = dolgu(b(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13));

describe('dosyaTuru: PDF', () => {
  it('%PDF- at the start', () => {
    expect(dosyaTuru('ders.pdf', 'application/pdf', PDF)).toEqual({ tur: 'pdf' });
  });

  it('wrong extension and empty MIME: the bytes decide', () => {
    expect(dosyaTuru('ders.jpg', 'image/jpeg', PDF)).toEqual({ tur: 'pdf' });
    expect(dosyaTuru('indirilen', '', PDF)).toEqual({ tur: 'pdf' });
  });

  it('%PDF- after some junk, within the first 1024 bytes → onEkli', () => {
    const u = new Uint8Array(2048).fill(0x0a);
    u.set(b('%PDF-1.4'), 100);
    expect(dosyaTuru('a.pdf', '', u)).toEqual({ tur: 'pdf', alt: 'onEkli' });
    const sinir = new Uint8Array(2048).fill(0x0a);
    sinir.set(b('%PDF-'), ILK_BAYT_SAYISI - 5);
    expect(dosyaTuru('a.pdf', '', sinir)).toEqual({ tur: 'pdf', alt: 'onEkli' });
  });

  it('%PDF- after the first 1024 bytes is not a PDF', () => {
    const u = new Uint8Array(2048).fill(0x0a);
    u.set(b('%PDF-'), ILK_BAYT_SAYISI - 4);
    expect(dosyaTuru('a.txt', '', u)).toEqual({ tur: 'desteklenmeyen' });
  });

  it('.pdf name or PDF MIME, but not PDF bytes → bozukPdf', () => {
    expect(dosyaTuru('ders.pdf', 'application/pdf', RASTGELE)).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(dosyaTuru('ders.pdf', '', RASTGELE)).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(dosyaTuru('ders', 'application/pdf', RASTGELE)).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(dosyaTuru('ders.pdf', '', new Uint8Array())).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
  });

  it('.pdf name with image bytes is an image', () => {
    expect(dosyaTuru('ders.pdf', 'application/pdf', JPEG)).toEqual({ tur: 'gorsel', alt: 'jpeg' });
  });
});

describe('dosyaTuru: images', () => {
  it('JPEG, PNG, WebP, GIF', () => {
    expect(dosyaTuru('a.jpg', 'image/jpeg', JPEG)).toEqual({ tur: 'gorsel', alt: 'jpeg' });
    expect(dosyaTuru('a.png', 'image/png', PNG)).toEqual({ tur: 'gorsel', alt: 'png' });
    expect(dosyaTuru('a.webp', 'image/webp', WEBP)).toEqual({ tur: 'gorsel', alt: 'webp' });
    expect(dosyaTuru('a.gif', 'image/gif', dolgu(b('GIF89a')))).toEqual({ tur: 'gorsel', alt: 'gif' });
    expect(dosyaTuru('a.gif', 'image/gif', dolgu(b('GIF87a')))).toEqual({ tur: 'gorsel', alt: 'gif' });
  });

  it('HEIC: all four brands', () => {
    for (const m of ['heic', 'heix', 'mif1', 'msf1']) {
      expect(dosyaTuru('IMG_1.HEIC', 'image/heic', heic(m))).toEqual({ tur: 'gorsel', alt: 'heic' });
    }
  });

  it('other ftyp brands (AVIF, MP4) are not supported', () => {
    expect(dosyaTuru('a.avif', 'image/avif', heic('avif'))).toEqual({ tur: 'desteklenmeyen' });
    expect(dosyaTuru('a.mp4', 'video/mp4', heic('isom'))).toEqual({ tur: 'desteklenmeyen' });
  });

  it('empty MIME, upper-case extension', () => {
    expect(dosyaTuru('FOTO.JPG', '', JPEG)).toEqual({ tur: 'gorsel', alt: 'jpeg' });
    expect(dosyaTuru('NOT.PDF', '', PDF)).toEqual({ tur: 'pdf' });
  });

  it('MIME or extension alone does not make an image', () => {
    expect(dosyaTuru('foto.jpg', 'image/jpeg', RASTGELE)).toEqual({ tur: 'desteklenmeyen' });
    expect(dosyaTuru('a.bmp', 'image/bmp', dolgu(b('BM')))).toEqual({ tur: 'desteklenmeyen' });
  });
});

describe('dosyaTuru: Office', () => {
  it('docx (ZIP) and old doc (OLE) → word', () => {
    expect(dosyaTuru('odev.docx', '', ZIP)).toEqual({ tur: 'ofis', alt: 'word' });
    expect(dosyaTuru('odev.doc', '', OLE)).toEqual({ tur: 'ofis', alt: 'word' });
    expect(dosyaTuru('odev.odt', '', ZIP)).toEqual({ tur: 'ofis', alt: 'word' });
    expect(dosyaTuru('odev.rtf', '', dolgu(b('{\\rtf1')))).toEqual({ tur: 'ofis', alt: 'word' });
  });

  it('pptx, ppt, odp → powerpoint; upper case', () => {
    expect(dosyaTuru('SUNUM.PPTX', '', ZIP)).toEqual({ tur: 'ofis', alt: 'powerpoint' });
    expect(dosyaTuru('sunum.ppt', '', OLE)).toEqual({ tur: 'ofis', alt: 'powerpoint' });
    expect(dosyaTuru('sunum.odp', '', ZIP)).toEqual({ tur: 'ofis', alt: 'powerpoint' });
  });

  it('Keynote and Pages', () => {
    expect(dosyaTuru('sunum.key', '', ZIP)).toEqual({ tur: 'ofis', alt: 'keynote' });
    expect(dosyaTuru('not.pages', '', ZIP)).toEqual({ tur: 'ofis', alt: 'pages' });
  });

  it('by MIME only', () => {
    expect(dosyaTuru('dosya', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP))
      .toEqual({ tur: 'ofis', alt: 'word' });
    expect(dosyaTuru('dosya', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ZIP))
      .toEqual({ tur: 'ofis', alt: 'powerpoint' });
    expect(dosyaTuru('dosya', 'application/msword', OLE)).toEqual({ tur: 'ofis', alt: 'word' });
  });

  it('a plain ZIP is not Office', () => {
    expect(dosyaTuru('arsiv.zip', 'application/zip', ZIP)).toEqual({ tur: 'desteklenmeyen' });
  });

  it('a PDF saved with a .docx name is a PDF', () => {
    expect(dosyaTuru('odev.docx', '', PDF)).toEqual({ tur: 'pdf' });
  });
});

describe('dosyaTuru: everything else', () => {
  it('.txt', () => {
    expect(dosyaTuru('not.txt', 'text/plain', dolgu(b('merhaba')))).toEqual({ tur: 'desteklenmeyen' });
  });

  it('empty and short byte arrays do not throw', () => {
    expect(dosyaTuru('a', '', new Uint8Array())).toEqual({ tur: 'desteklenmeyen' });
    expect(dosyaTuru('a.jpg', '', b(0xff, 0xd8))).toEqual({ tur: 'desteklenmeyen' });
    expect(dosyaTuru('a.jpg', '', b(0xff, 0xd8, 0xff))).toEqual({ tur: 'gorsel', alt: 'jpeg' });
    expect(dosyaTuru('a.heic', '', b(0, 0, 0, 24, 'ftyp'))).toEqual({ tur: 'desteklenmeyen' });
    expect(dosyaTuru('a.pdf', '', b('%PDF'))).toEqual({ tur: 'desteklenmeyen', alt: 'bozukPdf' });
    expect(dosyaTuru('a.pdf', '', b('%PDF-'))).toEqual({ tur: 'pdf' });
  });

  it('no extension tricks: "constructor" is not an Office type', () => {
    expect(dosyaTuru('a.constructor', '', RASTGELE)).toEqual({ tur: 'desteklenmeyen' });
  });
});

describe('DOSYA_ACCEPT', () => {
  it('PDF, images and Office extensions (so they can be chosen and explained)', () => {
    const liste = DOSYA_ACCEPT.split(',');
    for (const x of ['.pdf', 'application/pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif',
      '.doc', '.docx', '.ppt', '.pptx', '.odt', '.odp', '.key', '.pages', '.rtf']) {
      expect(liste).toContain(x);
    }
    expect(liste).not.toContain('image/*');
  });
});
