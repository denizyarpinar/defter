import { describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive';
import { BOS_KONU_METIN, bosKonuDurumu, KLASOR_YOK_NOT, konuKurdelesi, kurdeleSecimi, okumaKaydiYazilsinMi } from './bosKonu';
import { emptyMaterials, type TopicMaterials } from './konuKesfi';

// Task 6.K6a: a topic without materials in the reader.

const f = (name: string): DriveFile => ({ id: `id-${name}`, name, mimeType: 'application/pdf', modifiedTime: 't' });

describe('bosKonuDurumu', () => {
  it('a folder: both add buttons on, the text says how to start', () => {
    expect(bosKonuDurumu({ klasorVar: true })).toEqual({
      foto: { aktif: true, not: null }, dosya: { aktif: true, not: null }, metin: 'Henüz materyal yok. Dosya ekle ile başla.',
    });
    expect(BOS_KONU_METIN).toBe('Henüz materyal yok. Dosya ekle ile başla.');
  });
  it('no folder: both grey with a short note; Drive\'s missing folder keeps its own text', () => {
    const d = bosKonuDurumu({ klasorVar: false });
    expect(d.foto).toEqual({ aktif: false, not: KLASOR_YOK_NOT });
    expect(d.dosya).toEqual({ aktif: false, not: 'Bu konunun Drive klasörü yok' });
    expect(d.metin).toMatch(/Drive klasörü yok/);
    expect(bosKonuDurumu({ klasorVar: false, klasorYokMetni: 'Konu klasörü bulunamadı: X.' }).metin).toBe('Konu klasörü bulunamadı: X.');
  });
});

describe('nothing of the reading state for a topic without materials', () => {
  it('okumaKaydiYazilsinMi: only with a material on screen', () => {
    expect(okumaKaydiYazilsinMi(null)).toBe(false);
    for (const k of ['orijinal', 'ozet', 'uebungen', 'oedevler'] as const) expect(okumaKaydiYazilsinMi(k)).toBe(true);
  });
  it('konuKurdelesi: no material → no ribbon (even if kitap.json has one)', () => {
    const kurdeleler = { ozet: { dosya: 'ozet.pdf', sayfa: 3 } };
    expect(konuKurdelesi(kurdeleler, null)).toBeNull();
    expect(konuKurdelesi(kurdeleler, 'ozet')).toEqual({ dosya: 'ozet.pdf', sayfa: 3 });
    expect(konuKurdelesi(kurdeleler, 'orijinal')).toBeNull();
    expect(konuKurdelesi(undefined, 'ozet')).toBeNull();
  });
  it('kurdeleSecimi: no material → no mark; Übungen: the file and its solution chosen by the mark', () => {
    const m: TopicMaterials = { ...emptyMaterials(), uebungen: [{ file: f('A.pdf'), cozum: null }, { file: f('B.pdf'), cozum: f('B_cozum.pdf') }] };
    expect(kurdeleSecimi(m, null, { dosya: 'B.pdf', sayfa: 1 })).toEqual({ mark: null });
    expect(kurdeleSecimi(m, 'uebungen', { dosya: 'B_cozum.pdf', sayfa: 2 })).toEqual({ mark: { dosya: 'B_cozum.pdf', sayfa: 2 }, fileIndex: 1, solution: true });
    expect(kurdeleSecimi(m, 'uebungen', { dosya: 'A.pdf', sayfa: 1 })).toEqual({ mark: { dosya: 'A.pdf', sayfa: 1 }, fileIndex: 0, solution: false });
    expect(kurdeleSecimi(m, 'uebungen', { dosya: 'gone.pdf', sayfa: 1 })).toEqual({ mark: null });
    expect(kurdeleSecimi(m, 'ozet', { dosya: 'ozet.pdf', sayfa: 4 })).toEqual({ mark: { dosya: 'ozet.pdf', sayfa: 4 } });
  });
});
