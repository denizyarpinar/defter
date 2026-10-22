import { beforeEach, describe, expect, it } from 'vitest';
import { KlasorYok } from '../defter/konuyaDosyaEkle';
import {
  AltKlasorAcilamadi, AltKlasorAdiFarkli, AltKlasorAgHatasi, altKlasorAc, altKlasorBelleginiSifirla, type AltKlasorDrive, type AltKlasorIstek
} from './altKlasorAc';
import { FOLDER_MIME } from './drive';
import { IdZatenVar } from './pdfOlustur';

// Task 6.K6a: a topic's Uebungen / Oedevler made with its first file. A fake Drive in memory:
//   R (root) → K "kitaplar" → B (book) → U "Unite-01" → C "Konu-01";  B2 (another book) → U2 → X;  D (outside: R → D → E → Y)

interface Item { name: string; parent: string; mimeType: string; trashed?: boolean; appProperties?: Record<string, string> }

function sahte(ek: Record<string, Item> = {}) {
  const items = new Map<string, Item>(Object.entries({
    K: { name: 'kitaplar', parent: 'R', mimeType: FOLDER_MIME },
    J: { name: 'kitaplik.json', parent: 'R', mimeType: 'application/json' },
    B: { name: 'mat-1', parent: 'K', mimeType: FOLDER_MIME },
    U: { name: 'Unite-01', parent: 'B', mimeType: FOLDER_MIME },
    C: { name: 'Konu-01', parent: 'U', mimeType: FOLDER_MIME },
    B2: { name: 'mat-2', parent: 'K', mimeType: FOLDER_MIME },
    U2: { name: 'Unite-01', parent: 'B2', mimeType: FOLDER_MIME },
    X: { name: 'Konu-01', parent: 'U2', mimeType: FOLDER_MIME },
    D: { name: 'baska', parent: 'R', mimeType: FOLDER_MIME },
    E: { name: 'Unite-01', parent: 'D', mimeType: FOLDER_MIME },
    Y: { name: 'Konu-01', parent: 'E', mimeType: FOLDER_MIME },
    ...ek,
  }));
  const log: string[] = [];
  const ayar = { agYok: 0, kayip: 0 };   // agYok: the next n creates fail; kayip: the next n arrive, the answer is lost
  let n = 0;
  const drive: AltKlasorDrive = {
    async yeniIdler(k) { log.push('yeniIdler'); return Array.from({ length: k }, () => `yeni${++n}`); },
    async islemAra(islemId) {
      log.push('islemAra');
      return [...items].filter(([, it]) => !it.trashed && it.appProperties?.defterIslem === islemId).map(([id, it]) => ({ id, name: it.name, parents: [it.parent], appProperties: it.appProperties }));
    },
    async olustur(meta) {
      log.push(`olustur:${meta.parents[0]}/${meta.name}`);
      if (ayar.agYok > 0) { ayar.agYok--; throw new TypeError('Failed to fetch'); }
      if (items.has(meta.id!)) throw new IdZatenVar();
      items.set(meta.id!, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, appProperties: meta.appProperties });
      if (ayar.kayip > 0) { ayar.kayip--; throw new TypeError('Failed to fetch'); }
      return { id: meta.id! };
    },
    async kokCocuklari(id) { log.push('kokCocuklari'); return [...items].filter(([, it]) => it.parent === id).map(([i, it]) => ({ id: i, name: it.name, mimeType: it.mimeType })); },
    async oge(id) {
      log.push(`oge:${id}`);
      const it = items.get(id);
      return it ? { id, name: it.name, mimeType: it.mimeType, parents: [it.parent], trashed: !!it.trashed, appProperties: it.appProperties } : null;
    },
    async cocuklar(id) {
      log.push(`cocuklar:${id}`);
      return [...items].filter(([, it]) => it.parent === id && !it.trashed).map(([i, it]) => ({ id: i, name: it.name, mimeType: it.mimeType, modifiedTime: 't' }));
    },
  };
  const olusturmalar = () => log.filter(l => l.startsWith('olustur:'));
  const klasorleri = (parent: string) => [...items].filter(([, it]) => it.parent === parent && it.mimeType === FOLDER_MIME && !it.trashed).map(([id, it]) => `${id}:${it.name}`);
  return { items, log, ayar, drive, olusturmalar, klasorleri };
}

const istek = (o: Partial<AltKlasorIstek> = {}): AltKlasorIstek =>
  ({ konuId: 'C', konuYolu: 'Unite-01/Konu-01', kitapKlasorId: 'B', kokId: 'R', klasor: 'Uebungen', islemId: 'is-1', ...o });
const ACIK = { kilitAcik: true, bekleMs: 0 };

beforeEach(() => altKlasorBelleginiSifirla());

describe('altKlasorAc', () => {
  it('locked: KlasorYok, no request at all', async () => {
    const d = sahte();
    await expect(altKlasorAc(d.drive, istek(), { kilitAcik: false })).rejects.toThrow(KlasorYok);
    expect(d.log).toEqual([]);
  });

  it('a new folder: the chain first, then the create, marked { defter, defterIslem }, inside the topic', async () => {
    const d = sahte();
    const id = await altKlasorAc(d.drive, istek(), ACIK);
    expect(d.items.get(id)).toMatchObject({ name: 'Uebungen', parent: 'C', mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: 'is-1' } });
    expect(d.olusturmalar()).toEqual(['olustur:C/Uebungen']);
    // the chain before anything is written
    const ilkOlustur = d.log.findIndex(l => l.startsWith('olustur:'));
    expect(d.log.slice(0, ilkOlustur)).toEqual(expect.arrayContaining(['kokCocuklari', 'oge:C', 'oge:U', 'oge:B', 'cocuklar:C']));
    const od = await altKlasorAc(d.drive, istek({ klasor: 'Oedevler', islemId: 'is-2' }), ACIK);
    expect(d.items.get(od)!.name).toBe('Oedevler');
  });

  it('remembered for the session: the second adding uses it, no second folder', async () => {
    const d = sahte();
    const a = await altKlasorAc(d.drive, istek(), ACIK);
    const b = await altKlasorAc(d.drive, istek({ islemId: 'is-2' }), ACIK);
    expect(b).toBe(a);
    expect(d.olusturmalar()).toHaveLength(1);
    expect(d.klasorleri('C')).toEqual([`${a}:Uebungen`]);
  });

  it('a folder already there (any case: the reader\'s matcher) is used, nothing created', async () => {
    for (const ad of ['Uebungen', 'uebungen', 'UEBUNGEN', ' Uebungen ']) {
      altKlasorBelleginiSifirla();
      const d = sahte({ V: { name: ad, parent: 'C', mimeType: FOLDER_MIME } });
      expect(await altKlasorAc(d.drive, istek(), ACIK)).toBe('V');
      expect(d.olusturmalar()).toEqual([]);
    }
    // a file (not a folder) with that name doesn't count; one in the trash neither
    const d = sahte({ F: { name: 'Uebungen', parent: 'C', mimeType: 'application/pdf' }, T: { name: 'Uebungen', parent: 'C', mimeType: FOLDER_MIME, trashed: true } });
    expect(await altKlasorAc(d.drive, istek(), ACIK)).not.toMatch(/^[FT]$/);
    expect(d.olusturmalar()).toHaveLength(1);
  });

  it('Übungen / Ödevler there (the reader doesn\'t know them): AltKlasorAdiFarkli, no create — even with an old model', async () => {
    for (const [klasor, ad] of [['Uebungen', 'Übungen'], ['Uebungen', 'ÜBUNGEN'], ['Oedevler', 'ödevler'], ['Oedevler', 'Ödevler']] as const) {
      altKlasorBelleginiSifirla();
      const d = sahte({ V: { name: ad, parent: 'C', mimeType: FOLDER_MIME } });
      const e = await altKlasorAc(d.drive, istek({ klasor }), ACIK).catch(x => x);
      expect(e).toBeInstanceOf(AltKlasorAdiFarkli);
      expect(e.message).toContain(`adını ${klasor} yap`);
      expect(d.olusturmalar()).toEqual([]);
      expect(d.log).not.toContain('yeniIdler');
    }
  });

  it('a wrong parent: nothing created', async () => {
    const durumlar: Partial<AltKlasorIstek>[] = [
      { konuId: 'X' },                                        // a topic of another book
      { konuId: 'Y', kitapKlasorId: 'D' },                    // a "book" outside kitaplar/
      { konuId: 'U', konuYolu: 'Unite-01/Konu-01' },          // the unit, not the topic (one step short)
      { konuId: 'C', konuYolu: 'Konu-01' },                   // the path says one step: U is not the book
      { konuId: 'B', konuYolu: '' },                          // the book's folder itself
      { kokId: 'D' },                                         // a root without kitaplar/
      { konuId: 'yok' },                                      // not in Drive
    ];
    for (const o of durumlar) {
      const d = sahte();
      await expect(altKlasorAc(d.drive, istek(o), ACIK)).rejects.toThrow(AltKlasorAcilamadi);
      expect(d.olusturmalar()).toEqual([]);
    }
    // the topic folder in the trash
    const d = sahte();
    d.items.get('C')!.trashed = true;
    await expect(altKlasorAc(d.drive, istek(), ACIK)).rejects.toThrow(AltKlasorAcilamadi);
    expect(d.olusturmalar()).toEqual([]);
  });

  it('a network error: "Tekrar dene" with the same islemId gets the same id, one folder', async () => {
    const d = sahte();
    d.ayar.kayip = 1;   // it arrives, the answer is lost; then the connection stays off for the retries
    d.ayar.agYok = 2;
    await expect(altKlasorAc(d.drive, istek(), { ...ACIK, deneme: 3 })).rejects.toThrow(AltKlasorAgHatasi);
    const ilk = d.olusturmalar().length;
    // the retry: found by islemId, no create
    const id = await altKlasorAc(d.drive, istek(), ACIK);
    expect(d.olusturmalar()).toHaveLength(ilk);
    expect(d.klasorleri('C')).toEqual([`${id}:Uebungen`]);
    expect(d.log.filter(l => l === 'yeniIdler')).toHaveLength(1);
  });

  it('Drive says 409 (an earlier try arrived): ours by name + islemId → done; someone else\'s → an error', async () => {
    const d = sahte();
    d.ayar.agYok = 1;   // the first create fails before it arrives
    d.drive.islemAra = async () => [];   // the search doesn't see it yet
    const orijinal = d.drive.olustur;
    let ilk = true;
    d.drive.olustur = async meta => {
      if (ilk) { ilk = false; d.items.set(meta.id!, { name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType, appProperties: meta.appProperties }); throw new TypeError('Failed to fetch'); }
      return orijinal(meta);
    };
    const id = await altKlasorAc(d.drive, istek(), ACIK);
    expect(d.klasorleri('C')).toEqual([`${id}:Uebungen`]);

    const b = sahte();
    b.drive.islemAra = async () => [];
    b.drive.olustur = async meta => { b.items.set(meta.id!, { name: 'baska', parent: 'C', mimeType: FOLDER_MIME }); throw new IdZatenVar(); };
    await expect(altKlasorAc(b.drive, istek(), ACIK)).rejects.toThrow(AltKlasorAcilamadi);
  });
});
