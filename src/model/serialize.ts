import type { Book, Library } from './types';

// Back to JSON. Unknown fields (extra) come first, so they are kept as they were.
// Used from task 1.5 on (writing to Drive).

export function libraryToJson(l: Library): Record<string, unknown> {
  return {
    ...l.extra,
    surum: l.surum,
    raflar: l.raflar.map(s => ({ ...s.extra, id: s.id, ad: s.ad, kitaplar: [...s.kitaplar] })),
    oda: { ...l.oda.extra, duvar: l.oda.duvar, zemin: l.oda.zemin, mod: l.oda.mod }
  };
}

export function bookToJson(b: Book): Record<string, unknown> {
  return {
    ...b.extra,
    surum: b.surum,
    baslik: b.baslik,
    sirt: b.sirt,
    kod: b.kod,
    ders: b.ders,
    ...(b.dil !== undefined ? { dil: b.dil } : {}),
    kapak: { ...b.kapak.extra, renk: b.kapak.renk, stil: b.kapak.stil },
    sonAcilis: b.sonAcilis,
    kurdele: b.kurdele !== null && typeof b.kurdele === 'object' ? { ...b.kurdele } : b.kurdele,
    bolumler: b.bolumler.map(c => ({
      ...c.extra,
      baslik: c.baslik,
      durum: c.durum,
      kaynaklar: c.kaynaklar.map(s => ({ ...s.extra, tur: s.tur, dosya: s.dosya, ...(s.sayfalar !== undefined ? { sayfalar: s.sayfalar } : {}) }))
    })),
    ...(b.uniteler.length ? {
      uniteler: b.uniteler.map(u => ({
        ...u.extra,
        baslik: u.baslik,
        konular: u.konular.map(t => ({
          ...t.extra, baslik: t.baslik, klasor: t.klasor, durum: t.durum,
          ...(Object.keys(t.kurdeleler).length ? { kurdeleler: { ...t.kurdeleler } } : {})
        }))
      }))
    } : {})
  };
}
