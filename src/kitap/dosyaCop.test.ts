import { describe, expect, it } from 'vitest';
import type { DriveFile } from '../drive/drive';
import { dosyaEbeveyniGecerliMi } from '../drive/ebeveyn';
import { FOLDER_MIME } from '../drive/drive';
import { emptyMaterials, type TopicMaterials } from '../okuma/konuKesfi';
import {
  copDugmesiGorunur, copSonrasiSecim, dosyaCopHedefi, dosyaCopSayimi, geriGelenSecim, jsonaKurdeleGeriKoy, jsondanKurdeleCikar,
  kitabaKurdeleGeriKoy, kitaptanKurdeleCikar, materyallerdenCikar
} from './dosyaCop';

// Task 6.K6b: the open file to the trash — the pure part.

const K = 'U1/K1';
const f = (id: string, name: string): DriveFile => ({ id, name, mimeType: 'application/pdf', modifiedTime: 't' });
const mat = (o: Partial<TopicMaterials>): TopicMaterials => ({ ...emptyMaterials(), ...o });

const json = () => ({
  surum: 2, kurdele: { konu: K, materyal: 'uebungen', dosya: 'b1.pdf', sayfa: 2 }, x: 1,
  uniteler: [{ baslik: 'U', konular: [
    { baslik: 'K', klasor: K, durum: 'okundu', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 }, uebungen: { dosya: 'b1_cozum.pdf', sayfa: 1 } } },
    { baslik: 'L', klasor: 'U1/K2', kurdeleler: { uebungen: { dosya: 'b1.pdf', sayfa: 5 } } }
  ] }]
});

describe('ribbons', () => {
  it('the topic\'s mark and the book\'s ribbon on the files go; others stay; the input is not changed', () => {
    const j = json();
    const r = jsondanKurdeleCikar(j, K, 'uebungen', ['b1.pdf', 'b1_cozum.pdf']);
    expect(r.degisti).toBe(true);
    expect(r.json.kurdele).toBeNull();
    const k = (r.json.uniteler as ReturnType<typeof json>['uniteler'])[0].konular;
    expect(k[0].kurdeleler).toEqual({ ozet: { dosya: 'ozet.pdf', sayfa: 3 } });
    expect(k[1].kurdeleler).toEqual({ uebungen: { dosya: 'b1.pdf', sayfa: 5 } });   // another topic: same name, stays
    expect(r.json.x).toBe(1);
    expect(j).toEqual(json());
  });

  it('only the solution: the book\'s ribbon on X stays', () => {
    const r = jsondanKurdeleCikar(json(), K, 'uebungen', ['b1_cozum.pdf']);
    expect(r.json.kurdele).toEqual(json().kurdele);
    expect(r.cikan).toEqual({ konu: { dosya: 'b1_cozum.pdf', sayfa: 1 }, kitap: undefined });
  });

  it('another material with the same name is not touched', () => {
    const r = jsondanKurdeleCikar(json(), K, 'oedevler', ['b1.pdf', 'b1_cozum.pdf']);
    expect(r.degisti).toBe(false);
    expect(r.cikan).toBeNull();
  });

  it('back where nothing took the place', () => {
    const r = jsondanKurdeleCikar(json(), K, 'uebungen', ['b1.pdf', 'b1_cozum.pdf']);
    expect(jsonaKurdeleGeriKoy(r.json, K, 'uebungen', r.cikan!).json).toEqual(json());
    const yeni = { konu: K, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 9 };
    const g = jsonaKurdeleGeriKoy({ ...r.json, kurdele: yeni }, K, 'uebungen', r.cikan!);
    expect(g.json.kurdele).toEqual(yeni);
  });

  it('the book in memory: the same', () => {
    const b = json();
    const c = kitaptanKurdeleCikar(b, K, 'uebungen', ['b1.pdf', 'b1_cozum.pdf'])!;
    expect(b.kurdele).toBeNull();
    expect(kitabaKurdeleGeriKoy(b, K, 'uebungen', c)).toBe(true);
    expect(b).toEqual(json());
  });
});

describe('the reader', () => {
  const ue = mat({ orijinal: [{ file: f('o', 'orijinal.pdf'), cozum: null }], uebungen: [
    { file: f('a', 'a.pdf'), cozum: f('ac', 'a_cozum.pdf') }, { file: f('b', 'b.pdf'), cozum: null }
  ] });

  it('the file on screen; the solution\'s page in focus → only the solution', () => {
    const t = { materials: ue, kind: 'uebungen' as const, fileIndex: 0, solution: true };
    expect(dosyaCopHedefi(t, 'a', 1, 4)).toMatchObject({ dosya: { id: 'a' }, cozum: { id: 'ac' }, sadeceCozum: false, etiket: 'Übung · Uebungen/a.pdf' });
    expect(dosyaCopHedefi(t, 'ac', 5, 4)).toMatchObject({ dosya: { id: 'ac' }, cozum: null, sadeceCozum: true, etiket: 'Çözüm · Uebungen/a_cozum.pdf' });
    expect(dosyaCopHedefi({ ...t, kind: 'orijinal' }, 'o', 0, 3)).toMatchObject({ dosya: { id: 'o' }, etiket: 'Orijinal · orijinal.pdf' });
    expect(dosyaCopHedefi({ ...t, kind: null }, null, 0, 0)).toBeNull();
  });

  it('brifing + sorular: the file of the page in focus', () => {
    const m = mat({ ozet: [{ file: f('br', 'brifing.pdf'), cozum: null }, { file: f('so', 'sorular.pdf'), cozum: null }] });
    expect(dosyaCopHedefi({ materials: m, kind: 'ozet', fileIndex: 0, solution: false }, 'so', 7, 9)?.dosya.id).toBe('so');
  });

  it('after the trash: the neighbour, another kind, or the empty topic', () => {
    const kalan = materyallerdenCikar(ue, ['a', 'ac']);
    expect(kalan.uebungen.map(x => x.file.id)).toEqual(['b']);
    expect(copSonrasiSecim('uebungen', 0, kalan)).toEqual({ kind: 'uebungen', fileIndex: 0 });
    expect(copSonrasiSecim('uebungen', 1, materyallerdenCikar(ue, ['b']))).toEqual({ kind: 'uebungen', fileIndex: 0 });   // the one before
    expect(copSonrasiSecim('uebungen', 0, materyallerdenCikar(ue, ['a', 'b']))).toEqual({ kind: 'orijinal', fileIndex: 0 });
    expect(copSonrasiSecim('orijinal', 0, materyallerdenCikar(ue, ['o', 'a', 'b']))).toBeNull();
    expect(materyallerdenCikar(ue, ['ac']).uebungen[0]).toMatchObject({ file: { id: 'a' }, cozum: null });   // only the solution
  });

  it('after Geri al: the file that came back', () => {
    expect(geriGelenSecim(ue, ['b'])).toEqual({ kind: 'uebungen', fileIndex: 1, solution: false });
    expect(geriGelenSecim(ue, ['ac'])).toEqual({ kind: 'uebungen', fileIndex: 0, solution: true });
    expect(geriGelenSecim(ue, ['o'])).toEqual({ kind: 'orijinal', fileIndex: 0, solution: false });
    expect(geriGelenSecim(ue, ['yok'])).toBeNull();
  });

  it('the count: a summary with photos waiting in its topic → blocked; pen records / uploads → a warning', () => {
    const oz = { materyal: 'ozet' as const, dosya: f('oz', 'ozet.pdf'), cozum: null, sadeceCozum: false, etiket: '' };
    const yok = () => false;
    expect(dosyaCopSayimi({ hedef: oz, konuKlasorId: 'k', kalemIdleri: [], fotoKonulari: ['k'], yukleniyor: yok })).toEqual({ engel: true, bekleyen: 0 });
    expect(dosyaCopSayimi({ hedef: oz, konuKlasorId: 'k', kalemIdleri: [], fotoKonulari: ['baska'], yukleniyor: yok })).toEqual({ engel: false, bekleyen: 0 });
    const ub = { ...oz, materyal: 'uebungen' as const, dosya: f('a', 'a.pdf'), cozum: f('ac', 'a_cozum.pdf') };
    expect(dosyaCopSayimi({ hedef: ub, konuKlasorId: 'k', kalemIdleri: ['ac', 'x'], fotoKonulari: ['k'], yukleniyor: id => id === 'a' })).toEqual({ engel: false, bekleyen: 2 });
  });

  it('the button: only unlocked, Drive, surum 2, a material, pen off', () => {
    const ok = { kilitAcik: true, drive: true, surum2: true, materyal: true, kalem: false };
    expect(copDugmesiGorunur(ok)).toBe(true);
    expect(copDugmesiGorunur({ ...ok, kilitAcik: false })).toBe(false);
    expect(copDugmesiGorunur({ ...ok, drive: false })).toBe(false);   // the sample library
    expect(copDugmesiGorunur({ ...ok, surum2: false })).toBe(false);
    expect(copDugmesiGorunur({ ...ok, materyal: false })).toBe(false);
    expect(copDugmesiGorunur({ ...ok, kalem: true })).toBe(false);
  });
});

describe('dosyaEbeveyniGecerliMi', () => {
  const pdf = (name: string, parent: string) => ({ name, mimeType: 'application/pdf', parents: [parent] });
  const ue = (name = 'Uebungen', parent = 'k') => ({ id: 'u', name, mimeType: FOLDER_MIME, parents: [parent] });
  it('right in the topic, or in its Uebungen / Oedevler', () => {
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'k'), 'a.pdf', 'k', null)).toBe(true);
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'u'), 'a.pdf', 'k', ue())).toBe(true);
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'u'), 'a.pdf', 'k', ue('oedevler'))).toBe(true);
  });
  it('anything else: no', () => {
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'x'), 'a.pdf', 'k', null)).toBe(false);
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'u'), 'a.pdf', 'k', ue('Übungen'))).toBe(false);
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'u'), 'a.pdf', 'k', ue('Uebungen', 'k2'))).toBe(false);
    expect(dosyaEbeveyniGecerliMi(pdf('a.pdf', 'k'), 'b.pdf', 'k', null)).toBe(false);
    expect(dosyaEbeveyniGecerliMi(pdf('a.txt', 'k'), 'a.txt', 'k', null)).toBe(false);
    expect(dosyaEbeveyniGecerliMi({ ...pdf('a.pdf', 'k'), mimeType: FOLDER_MIME }, 'a.pdf', 'k', null)).toBe(false);
    expect(dosyaEbeveyniGecerliMi({ ...pdf('a.pdf', 'k'), parents: ['k', 'x'] }, 'a.pdf', 'k', null)).toBe(false);
  });
});
