import { describe, expect, it } from 'vitest';
import { applyPatch, autoStatus, mergePatch, nextStatus, topicKey } from './okumaYamasi';

const v2 = () => ({
  surum: 2, baslik: 'Programmiergrundlagen', kod: 'PG1', bilinmeyen: { a: 1 },
  kapak: { renk: '#24476b', stil: 'kumas', parlak: true },
  sonAcilis: null, kurdele: null,
  uniteler: [{
    baslik: 'Logik', notlar: 'x',
    konular: [
      { baslik: 'Aussagenlogik', klasor: 'Unite-01/Konu-01', durum: 'okunmadi', renk: 'mavi' },
      { baslik: 'Prädikatenlogik', klasor: 'Unite-01/Konu-02', durum: 'calisildi',
        kurdeleler: { orijinal: { dosya: 'orijinal.pdf', sayfa: 4, not: 'x' } } }
    ]
  }]
});

describe('applyPatch (surum 2)', () => {
  it('changes only our fields and keeps unknown ones', () => {
    const latest = v2();
    const { json, changed } = applyPatch(latest, {
      sonAcilis: '2026-10-15T10:00:00.000Z',
      kurdele: { konu: 'Unite-01/Konu-01', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3 },
      konular: { 'Unite-01/Konu-01': { baslik: 'Aussagenlogik', durum: 'okunuyor', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 } } } }
    });
    expect(changed).toBe(true);
    expect(json.bilinmeyen).toEqual({ a: 1 });
    expect(json.kapak).toEqual({ renk: '#24476b', stil: 'kumas', parlak: true });
    expect(json.baslik).toBe('Programmiergrundlagen');
    expect(json.sonAcilis).toBe('2026-10-15T10:00:00.000Z');
    expect(json.kurdele).toEqual({ konu: 'Unite-01/Konu-01', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3 });
    const u = (json.uniteler as any[])[0];
    expect(u.notlar).toBe('x');
    expect(u.konular[0]).toEqual({ baslik: 'Aussagenlogik', klasor: 'Unite-01/Konu-01', durum: 'okunuyor', renk: 'mavi',
      kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 } } });
    expect(u.konular[1]).toEqual(v2().uniteler[0].konular[1]);   // not touched
  });

  it('keeps the marks of other materials and unknown sub-fields', () => {
    const { json } = applyPatch(v2(), { konular: { 'Unite-01/Konu-02': { baslik: 'Prädikatenlogik', kurdeleler: { uebungen: { dosya: 'Blatt01.pdf', sayfa: 2 } } } } });
    expect((json.uniteler as any[])[0].konular[1].kurdeleler).toEqual({
      orijinal: { dosya: 'orijinal.pdf', sayfa: 4, not: 'x' },
      uebungen: { dosya: 'Blatt01.pdf', sayfa: 2 }
    });
    expect((json.uniteler as any[])[0].konular[1].durum).toBe('calisildi');
  });

  it('does not change the input', () => {
    const latest = v2();
    applyPatch(latest, { konular: { 'Unite-01/Konu-01': { baslik: 'Aussagenlogik', durum: 'okundu' } } });
    expect(latest).toEqual(v2());
  });

  it('same values → changed = false', () => {
    const latest = v2();
    expect(applyPatch(latest, { konular: { 'Unite-01/Konu-02': { baslik: 'Prädikatenlogik', durum: 'calisildi', kurdeleler: { orijinal: { dosya: 'orijinal.pdf', sayfa: 4 } } } } }).changed).toBe(false);
    expect(applyPatch(latest, {}).changed).toBe(false);
  });

  it('a topic that is not in the file any more is skipped', () => {
    const { changed } = applyPatch(v2(), { konular: { 'Unite-09/Yok': { baslik: 'Yok', durum: 'okundu' } } });
    expect(changed).toBe(false);
  });

  it('a new ribbon replaces the other format but keeps unknown fields', () => {
    const latest = { ...v2(), kurdele: { bolum: 2, sayfa: 5, renk: 'kirmizi' } };
    const { json } = applyPatch(latest, { kurdele: { konu: 'k', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 1 } });
    expect(json.kurdele).toEqual({ renk: 'kirmizi', konu: 'k', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 1 });
  });
});

describe('applyPatch (surum 1)', () => {
  const v1 = () => ({
    surum: 1, baslik: 'Lineer Cebir', kurdele: 12,
    bolumler: [
      { baslik: 'Matrisler', durum: 'okunmadi', kaynaklar: [{ tur: 'pdf', dosya: 'a.pdf', sayfalar: '1-3' }] },
      { baslik: 'Determinant', durum: 'tekrar', kaynaklar: [] }
    ]
  });

  it('writes durum and kurdele, keeps the sources', () => {
    const { json, changed } = applyPatch(v1(), { kurdele: { bolum: 0, sayfa: 2 }, bolumler: { 0: { baslik: 'Matrisler', durum: 'okunuyor' } } });
    expect(changed).toBe(true);
    expect(json.kurdele).toEqual({ bolum: 0, sayfa: 2 });
    expect((json.bolumler as any[])[0]).toEqual({ ...v1().bolumler[0], durum: 'okunuyor' });
    expect((json.bolumler as any[])[1]).toEqual(v1().bolumler[1]);
  });

  it('finds the chapter by its title when the order changed', () => {
    const latest = { ...v1(), bolumler: [...v1().bolumler].reverse() };
    const { json } = applyPatch(latest, { bolumler: { 0: { baslik: 'Matrisler', durum: 'okundu' } } });
    expect((json.bolumler as any[])[0].durum).toBe('tekrar');
    expect((json.bolumler as any[])[1].durum).toBe('okundu');
  });
});

describe('mergePatch', () => {
  it('newer values win, marks of different materials are combined', () => {
    const m = mergePatch(
      { sonAcilis: 'a', konular: { k: { baslik: 'K', durum: 'okunuyor', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 1 } } } } },
      { konular: { k: { baslik: 'K', kurdeleler: { orijinal: { dosya: 'orijinal.pdf', sayfa: 7 } } } }, kurdele: { bolum: 0, sayfa: 1 } }
    );
    expect(m).toEqual({
      sonAcilis: 'a', kurdele: { bolum: 0, sayfa: 1 },
      konular: { k: { baslik: 'K', durum: 'okunuyor', kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 1 }, orijinal: { dosya: 'orijinal.pdf', sayfa: 7 } } } }
    });
  });
});

describe('status', () => {
  it('a tap goes through all five and back', () => {
    expect(['okunmadi', 'okunuyor', 'okundu', 'calisildi', 'tekrar'].map(s => nextStatus(s as any)))
      .toEqual(['okunuyor', 'okundu', 'calisildi', 'tekrar', 'okunmadi']);
  });
  it('the reader only moves forward', () => {
    expect(autoStatus('okunmadi', 'girildi')).toBe('okunuyor');
    expect(autoStatus('okundu', 'girildi')).toBe('okundu');
    expect(autoStatus('okunuyor', 'bitti')).toBe('okundu');
    expect(autoStatus('okunmadi', 'bitti')).toBe('okundu');
    for (const s of ['calisildi', 'tekrar'] as const) {
      expect(autoStatus(s, 'girildi')).toBe(s);
      expect(autoStatus(s, 'bitti')).toBe(s);
    }
  });
  it('topicKey: folder, else title', () => {
    expect(topicKey(' A/B ', 'x')).toBe('A/B');
    expect(topicKey('', 'Giriş')).toBe('baslik:Giriş');
  });
});
