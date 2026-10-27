import { describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive';
import { bantKarari, ekIslemId, pdfLibYuklensinMi, type BantGirdisi } from './ozetEkBandi';

// Task 6.EK-1: the pure part of the summary addition band.

const MD5 = '0123456789abcdef0123456789abcdef', MD5_YENI = 'fedcba9876543210fedcba9876543210';
const ek = (id: string, md5: string | null = MD5, name = 'ozet-ek.pdf'): DriveFile =>
  ({ id, name, mimeType: 'application/pdf', modifiedTime: '2026-10-27T10:00:00.000Z', ...(md5 && { md5Checksum: md5 }) });

const girdi = (o: Partial<BantGirdisi> = {}): BantGirdisi =>
  ({ ekler: [ek('A')], ozetVarMi: true, yazmaVar: true, ornek: false, isaretler: new Set(), sonraDenilenler: new Set(), ...o });
const durumlar = (g: BantGirdisi) => bantKarari(g).map(k => k.durum);

describe('ekIslemId', () => {
  it('id + md5; without md5 the modifiedTime', () => {
    expect(ekIslemId(ek('A'))).toBe(`ozet-ek-A-${MD5}`);
    expect(ekIslemId(ek('A', null))).toBe('ozet-ek-A-2026-10-27T10:00:00.000Z');
  });
});

describe('bantKarari', () => {
  it('not added yet → goster, with its fixed islemId', () => {
    expect(bantKarari(girdi())).toEqual([{ file: ek('A'), islemId: `ozet-ek-A-${MD5}`, durum: 'goster' }]);
  });

  it('its mark in the summary → gizli (on every device)', () => {
    expect(durumlar(girdi({ isaretler: new Set([`ozet-ek-A-${MD5}`]) }))).toEqual(['gizli']);
  });

  it('a mark of the same file with another content → guncellendi; with the modifiedTime form too', () => {
    expect(durumlar(girdi({ ekler: [ek('A', MD5_YENI)], isaretler: new Set([`ozet-ek-A-${MD5}`]) }))).toEqual(['guncellendi']);
    expect(durumlar(girdi({ ekler: [ek('A', MD5_YENI)], isaretler: new Set(['ozet-ek-A-2026-10-20T08:00:00Z']) }))).toEqual(['guncellendi']);
  });

  it('another file\'s mark, even one whose id starts with this id → goster', () => {
    expect(durumlar(girdi({ isaretler: new Set([`ozet-ek-B-${MD5}`, `ozet-ek-A-x-${MD5}`, 'photos-uuid']) }))).toEqual(['goster']);
  });

  it('several additions: each on its own', () => {
    const g = girdi({ ekler: [ek('A'), ek('B', MD5_YENI, 'ozet-ek-2.pdf'), ek('C', MD5, 'ozet-ek-3.pdf')], isaretler: new Set([`ozet-ek-A-${MD5}`, `ozet-ek-B-${MD5}`]) });
    expect(durumlar(g)).toEqual(['gizli', 'guncellendi', 'goster']);
  });

  it('"Sonra" this session → gizli', () => {
    expect(durumlar(girdi({ sonraDenilenler: new Set([`ozet-ek-A-${MD5}`]) }))).toEqual(['gizli']);
    // new content: asked again
    expect(durumlar(girdi({ ekler: [ek('A', MD5_YENI)], sonraDenilenler: new Set([`ozet-ek-A-${MD5}`]) }))).toEqual(['goster']);
  });

  it('encrypted / signed summary → yazilamaz (grey + reason); "Sonra" still hides it', () => {
    expect(durumlar(girdi({ isaretler: 'yazilamaz' }))).toEqual(['yazilamaz']);
    expect(durumlar(girdi({ isaretler: 'yazilamaz', sonraDenilenler: new Set([`ozet-ek-A-${MD5}`]) }))).toEqual(['gizli']);
  });

  it('sample library, no write context, no summary (K3), marks not read yet → all hidden', () => {
    for (const o of [{ ornek: true }, { yazmaVar: false }, { ozetVarMi: false }, { isaretler: null }, { ornek: true, isaretler: 'yazilamaz' as const }]) {
      expect(durumlar(girdi({ ekler: [ek('A'), ek('B')], ...o }))).toEqual(['gizli', 'gizli']);
    }
  });

  it('no additions → nothing', () => {
    expect(bantKarari(girdi({ ekler: [] }))).toEqual([]);
  });
});

describe('pdfLibYuklensinMi (K1)', () => {
  it('only with an addition, a summary, Drive and the first page drawn', () => {
    const tam = { ekVar: true, ozetVarMi: true, drive: true, ozetIlkSayfaCizildi: true };
    expect(pdfLibYuklensinMi(tam)).toBe(true);
    for (const k of Object.keys(tam) as (keyof typeof tam)[]) expect(pdfLibYuklensinMi({ ...tam, [k]: false })).toBe(false);
  });
});
