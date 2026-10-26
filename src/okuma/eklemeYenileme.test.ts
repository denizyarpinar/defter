import { describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive';
import {
  acikIndeks, dosyaEklemeKarari, dosyaGosterHedefi, eklenenMateryal, GOSTER_OTOMATIK, gosterIndeksi, konuBirlestir, sayfaListesiniGenislet, yeniIndeks,
  yenilemeKarari, type EklemeSonucu, type EklenenDosya, type OkuyucuDurumu
} from './eklemeYenileme';
import type { Material, TopicMaterials } from './konuKesfi';

// Task 5.8g: what the open reader refreshes after photos were added, and where "Göster" goes.

const sonuc = (x: Partial<EklemeSonucu> = {}): EklemeSonucu => ({ tur: 'eklendi', fileId: 'OZ', ad: 'ozet.pdf', eskiSayfa: 27, yeniSayfa: 29, ...x });
const durum = (x: Partial<OkuyucuDurumu> = {}): OkuyucuDurumu => ({ acik: true, ayniKonu: true, odakDosyaId: 'OZ', konuOzetIdleri: ['OZ'], ...x });

describe('yenilemeKarari', () => {
  it('no automatic jump by default', () => {
    expect(GOSTER_OTOMATIK).toBe(false);
  });
  it('reader closed or another topic: nothing, no Göster', () => {
    expect(yenilemeKarari(sonuc(), durum({ acik: false }))).toEqual({ yenile: 'yok', goster: null });
    expect(yenilemeKarari(sonuc(), durum({ ayniKonu: false }))).toEqual({ yenile: 'yok', goster: null });
    expect(yenilemeKarari(sonuc({ tur: 'yeni' }), durum({ ayniKonu: false })).goster).toBeNull();
  });
  it('summary on screen: its list grows, Göster → first new page', () => {
    expect(yenilemeKarari(sonuc(), durum())).toEqual({ yenile: 'liste', goster: { fileId: 'OZ', ad: 'ozet.pdf', sayfa: 28 } });
  });
  it('another material on screen (Orijinal): the list stays, Göster still there', () => {
    expect(yenilemeKarari(sonuc(), durum({ odakDosyaId: 'OR' }))).toEqual({ yenile: 'yok', goster: { fileId: 'OZ', ad: 'ozet.pdf', sayfa: 28 } });
    expect(yenilemeKarari(sonuc(), durum({ odakDosyaId: null })).yenile).toBe('yok');
  });
  it('brifing on screen, pages went to sorular.pdf: brifing is not touched', () => {
    const r = yenilemeKarari(sonuc({ fileId: 'SO', ad: 'sorular.pdf', eskiSayfa: 4, yeniSayfa: 5 }), durum({ odakDosyaId: 'BR', konuOzetIdleri: ['BR', 'SO'] }));
    expect(r).toEqual({ yenile: 'yok', goster: { fileId: 'SO', ad: 'sorular.pdf', sayfa: 5 } });
  });
  it('brifing on screen, pages went to brifing: its list grows', () => {
    expect(yenilemeKarari(sonuc({ fileId: 'BR', ad: 'brifing.pdf' }), durum({ odakDosyaId: 'BR', konuOzetIdleri: ['BR', 'SO'] })).yenile).toBe('liste');
  });
  it('new ozet.pdf: the tabs are listed again, Göster → its first page', () => {
    const r = yenilemeKarari(sonuc({ tur: 'yeni', fileId: 'N', eskiSayfa: 0, yeniSayfa: 2 }), durum({ odakDosyaId: 'OR', konuOzetIdleri: [] }));
    expect(r).toEqual({ yenile: 'konu', goster: { fileId: 'N', ad: 'ozet.pdf', sayfa: 1 } });
  });
  it('a summary the topic does not know (made on another device meanwhile): tabs again', () => {
    expect(yenilemeKarari(sonuc({ fileId: 'X' }), durum({ odakDosyaId: 'OR', konuOzetIdleri: [] })).yenile).toBe('konu');
  });
  it('already added before: same rules, Göster stays inside the file', () => {
    expect(yenilemeKarari(sonuc({ eskiSayfa: 27, yeniSayfa: 27 }), durum()).goster?.sayfa).toBe(27);
  });
});

interface P { dosyaId: string | null; pdfSayfa?: number; v?: string }
const pdf = (id: string, n: number, v = 'a'): P[] => Array.from({ length: n }, (_, i) => ({ dosyaId: id, pdfSayfa: i + 1, v }));
const yap = (pdfSayfa: number, o: P): P => ({ ...o, pdfSayfa });

describe('sayfaListesiniGenislet', () => {
  it('one file: the new pages at the end, the old ones the same objects', () => {
    const list = pdf('OZ', 27);
    const g = sayfaListesiniGenislet(list, 'OZ', 29, yap)!;
    expect(g).toMatchObject({ ekYeri: 27, eklenen: 2, sonaMi: true });
    expect(g.pages.length).toBe(29);
    expect(g.pages[0]).toBe(list[0]);
    expect(g.pages.slice(27).map(p => p.pdfSayfa)).toEqual([28, 29]);
    expect(yeniIndeks(22, g)).toBe(22);
  });
  it('brifing + sorular: pages go after brifing, sorular moves down', () => {
    const list = [...pdf('BR', 3), ...pdf('SO', 2)];
    const g = sayfaListesiniGenislet(list, 'BR', 5, yap)!;
    expect(g).toMatchObject({ ekYeri: 3, eklenen: 2, sonaMi: false });
    expect(g.pages.map(p => `${p.dosyaId}${p.pdfSayfa}`)).toEqual(['BR1', 'BR2', 'BR3', 'BR4', 'BR5', 'SO1', 'SO2']);
    expect(yeniIndeks(1, g)).toBe(1);   // brifing page: same place
    expect(yeniIndeks(3, g)).toBe(5);   // sorular page 1 moved
  });
  it('nothing to add (already as many pages, file not in the list)', () => {
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'OZ', 5, yap)).toBeNull();
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'OZ', 3, yap)).toBeNull();
    expect(sayfaListesiniGenislet(pdf('OZ', 5), 'X', 9, yap)).toBeNull();
  });
});

describe('gosterIndeksi', () => {
  it('finds the page by file and page number', () => {
    const list = [...pdf('BR', 3), ...pdf('SO', 2)];
    expect(gosterIndeksi(list, { fileId: 'SO', ad: 'sorular.pdf', sayfa: 2 })).toBe(4);
    expect(gosterIndeksi(list, { fileId: 'SO', ad: 'sorular.pdf', sayfa: 3 })).toBe(-1);
  });
});

// Task 5.10f: a whole file was added; the topic is read again, "Göster" goes to the new file.

const f = (id: string, name = `${id}.pdf`): DriveFile => ({ id, name, mimeType: 'application/pdf', modifiedTime: 't1' } as DriveFile);
const mat = (file: DriveFile, cozum: DriveFile | null = null): Material => ({ file, cozum });
const konu = (x: Partial<TopicMaterials> = {}): TopicMaterials => ({ orijinal: [], ozet: [], uebungen: [], oedevler: [], ...x });

describe('eklenenMateryal', () => {
  const r = { fileId: 'N', ad: 'yeni.pdf' };
  it('the target is the material', () => {
    for (const k of ['orijinal', 'ozet', 'uebungen', 'oedevler'] as const) {
      expect(eklenenMateryal(k, r, konu())).toEqual({ kind: k, fileId: 'N', ad: 'yeni.pdf', cozumOf: null });
    }
  });
  it('a solution: the material of its X (Übungen or Ödevler)', () => {
    const m = konu({ uebungen: [mat(f('U1'))], oedevler: [mat(f('O1'))] });
    expect(eklenenMateryal({ cozumOf: f('O1') }, r, m)).toEqual({ kind: 'oedevler', fileId: 'N', ad: 'yeni.pdf', cozumOf: 'O1' });
    expect(eklenenMateryal({ cozumOf: f('U1') }, r, m).kind).toBe('uebungen');
  });
  it('task 6.S-3: pages at the end of a summary file: Özet', () => {
    expect(eklenenMateryal({ ozetSonu: f('Z') }, { fileId: 'Z', ad: 'ozet.pdf' }, konu())).toEqual({ kind: 'ozet', fileId: 'Z', ad: 'ozet.pdf', cozumOf: null });
  });
  it('X not in the topic: kind null', () => {
    expect(eklenenMateryal({ cozumOf: f('X') }, r, konu()).kind).toBeNull();
  });
});

describe('dosyaEklemeKarari', () => {
  const e: EklenenDosya = { kind: 'uebungen', fileId: 'N', ad: 'a.pdf', cozumOf: null };
  it('reader open on the topic: read again + Göster', () => {
    expect(dosyaEklemeKarari(e, { acik: true, ayniKonu: true })).toEqual({ yenile: true, goster: true });
  });
  it('closed or another topic: only the toast', () => {
    expect(dosyaEklemeKarari(e, { acik: false, ayniKonu: true })).toEqual({ yenile: false, goster: false });
    expect(dosyaEklemeKarari(e, { acik: true, ayniKonu: false })).toEqual({ yenile: false, goster: false });
  });
  it('unknown X: read again, no Göster', () => {
    expect(dosyaEklemeKarari({ ...e, kind: null }, { acik: true, ayniKonu: true })).toEqual({ yenile: true, goster: false });
  });
});

describe('konuBirlestir', () => {
  it('a new file sorted in; the known files keep their objects (their version)', () => {
    const b = f('B'), c = f('C'), oz = f('OZ');
    const eski = konu({ ozet: [mat(oz)], uebungen: [mat(b), mat(c)] });
    const fresh = (x: DriveFile) => ({ ...x, modifiedTime: 't2' });
    const yeni = konu({ ozet: [mat(fresh(oz))], uebungen: [mat(f('A')), mat(fresh(b)), mat(fresh(c))] });
    const r = konuBirlestir(eski, yeni);
    expect(r.uebungen.map(m => m.file.id)).toEqual(['A', 'B', 'C']);
    expect(r.uebungen[1].file).toBe(b);
    expect(r.ozet[0].file).toBe(oz);
    expect(r.uebungen[0].file.id).toBe('A');
  });
  it('a new solution is paired; a new orijinal tab comes', () => {
    const x = f('X');
    const r = konuBirlestir(konu({ oedevler: [mat(x)] }), konu({ orijinal: [mat(f('OR'))], oedevler: [mat({ ...x }, f('XC', 'X_cozum.pdf'))] }));
    expect(r.oedevler[0].file).toBe(x);
    expect(r.oedevler[0].cozum?.id).toBe('XC');
    expect(r.orijinal.map(m => m.file.id)).toEqual(['OR']);
  });
});

describe('acikIndeks', () => {
  const eski = [mat(f('B')), mat(f('C'))];
  it('the open file keeps its file, not its number', () => {
    expect(acikIndeks(eski, [mat(f('A')), mat(f('B')), mat(f('C'))], 1)).toBe(2);
    expect(acikIndeks(eski, [mat(f('A')), mat(f('B')), mat(f('C'))], 0)).toBe(1);
    expect(acikIndeks(eski, [mat(f('B')), mat(f('C')), mat(f('D'))], 1)).toBe(1);
  });
  it('gone or nothing open: the first one', () => {
    expect(acikIndeks(eski, [mat(f('A'))], 1)).toBe(0);
    expect(acikIndeks([], [mat(f('A'))], 0)).toBe(0);
  });
});

describe('dosyaGosterHedefi', () => {
  const m = konu({ orijinal: [mat(f('OR'))], uebungen: [mat(f('A')), mat(f('B'), f('BC', 'B_cozum.pdf'))] });
  it('a new Übungen file: its tab and its place', () => {
    expect(dosyaGosterHedefi({ kind: 'uebungen', fileId: 'A', ad: 'A.pdf', cozumOf: null }, m)).toEqual({ kind: 'uebungen', fileIndex: 0, solution: false });
  });
  it('a solution: X with "Çözümü göster" on', () => {
    expect(dosyaGosterHedefi({ kind: 'uebungen', fileId: 'BC', ad: 'B_cozum.pdf', cozumOf: 'B' }, m)).toEqual({ kind: 'uebungen', fileIndex: 1, solution: true });
  });
  it('orijinal / ozet: the tab', () => {
    expect(dosyaGosterHedefi({ kind: 'orijinal', fileId: 'OR', ad: 'orijinal.pdf', cozumOf: null }, m)).toEqual({ kind: 'orijinal', fileIndex: 0, solution: false });
  });
  it('not in the topic (yet): null', () => {
    expect(dosyaGosterHedefi({ kind: 'uebungen', fileId: 'Z', ad: 'Z.pdf', cozumOf: null }, m)).toBeNull();
    expect(dosyaGosterHedefi({ kind: 'uebungen', fileId: 'AC', ad: 'A_cozum.pdf', cozumOf: 'A' }, m)).toBeNull();
    expect(dosyaGosterHedefi({ kind: null, fileId: 'N', ad: 'n.pdf', cozumOf: 'X' }, m)).toBeNull();
  });
});
