import { describe, expect, it, vi } from 'vitest';
import { parseBook } from '../model/parse';
import { icindekilerBaglamiKur } from '../ui/icindekilerBaglami';
import { CopCakisma, CopIzinYok, CopYeriBeklenmedik } from './copeAt';
import { yeniCopIsi } from './icindekilerCop';
import { fakeDrive, KITAP, sec } from './icindekilerSahte';
import { IcindekilerKilitli, IcindekilerKuyrugu, IcindekilerYazmaYok, icindekilerYaz, yeniIs, type IcindekilerSecenek } from './icindekilerYaz';

// Task 6.K5b: a topic / unit to the trash and "Geri al", with a made-up Drive (no request goes anywhere).

const K1 = 'Unite-01-Logik/Konu-01-Aussagen', K2 = 'Unite-01-Logik/Konu-02-Beweisen';
const KURDELELI = { ...structuredClone(KITAP), kurdele: { konu: K1, materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 3 } };

const konu = (klasorId: string | null = null, uniteKlasorId: string | null = null) => yeniCopIsi({ tur: 'konu', konu: K1 }, 'Aussagen', klasorId, uniteKlasorId);
const yaz = (f: ReturnType<typeof fakeDrive>, c: ReturnType<typeof konu>, s: Partial<IcindekilerSecenek> = {}) =>
  icindekilerYaz(f.drive, yeniIs('i', 'deneme-1', { tur: 'cop', cop: c }), sec(s));

describe('a topic / unit to the trash', () => {
  it('a topic: first out of kitap.json, then its folder trashed=true; the ribbon on it → null; nothing deleted', async () => {
    const f = fakeDrive({ kitap: KURDELELI });
    await yaz(f, konu());
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true']);
    expect(f.items.get('t1')!.trashed).toBe(true);
    expect(f.copte('f1') && f.copte('f2')).toBe(true);   // its files go with it (Drive's trash)
    expect(f.copte('t2')).toBe(false);
    const k = f.kitap();
    expect(k.uniteler[0].konular.map(t => t.klasor)).toEqual([K2]);
    expect(k.kurdele).toBeNull();
    expect(k.bilinmeyen).toBe(7);
    expect(k.kapak).toEqual(KITAP.kapak);
    expect(f.calls.some(c => /delete|empty/i.test(c))).toBe(false);
  });

  it('a unit: with its topics out of kitap.json, then the unit folder', async () => {
    const f = fakeDrive();
    await yaz(f, yeniCopIsi({ tur: 'unite', klasor: 'Unite-01-Logik' }, 'Logik'));
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Unite-01-Logik:true']);
    expect(f.kitap().uniteler.map(u => u.baslik)).toEqual(['Leer']);
    expect(f.copte('t1') && f.copte('t2')).toBe(true);
  });

  it('a wrong folder (the root, kitaplar/, kitaplik.json, a file, another book\'s folder) → CopYeriBeklenmedik, nothing written', async () => {
    for (const [id, ust] of [['kok', 'u1'], ['kitaplar', 'u1'], ['kl', 'u1'], ['f1', 'u1'], ['t1', 'u2'], ['yabanci', 'u1']] as const) {
      const f = fakeDrive({ items: { yabanci: { name: 'Konu-01-Aussagen', parent: 'kb2' }, kb2: { name: 'baska', parent: 'kitaplar' } } });
      await expect(yaz(f, konu(id, ust))).rejects.toBeInstanceOf(CopYeriBeklenmedik);
      expect(f.yazmalar()).toEqual([]);
    }
    // the book's folder not in kitaplar/
    const f = fakeDrive({ items: { kb: { name: 'deneme-1', parent: 'kok' } } });
    await expect(yaz(f, konu())).rejects.toBeInstanceOf(CopYeriBeklenmedik);
    expect(f.yazmalar()).toEqual([]);
  });

  it('locked / not signed in or the sample library → no request at all', async () => {
    for (const [s, hata] of [[{ kilitAcik: false }, IcindekilerKilitli], [{ kokKaynagi: null }, IcindekilerKilitli], [{ yazabilir: () => false }, IcindekilerYazmaYok]] as const) {
      const f = fakeDrive();
      await expect(yaz(f, konu(), s)).rejects.toBeInstanceOf(hata);
      expect(f.calls).toEqual([]);
    }
  });

  it('the folder in the trash already = done (only kitap.json is written)', async () => {
    const f = fakeDrive({ items: { t1: { name: 'Konu-01-Aussagen', parent: 'u1', trashed: true } } });
    await yaz(f, konu('t1', 'u1'));
    expect(f.yazmalar()).toEqual(['jsonYaz']);
  });

  it('kitap.json changed while it was read: once more from the start; twice → CopCakisma, nothing written', async () => {
    const f = fakeDrive({ mtimeDegis: 2 });
    await expect(yaz(f, konu())).rejects.toBeInstanceOf(CopCakisma);
    expect(f.yazmalar()).toEqual([]);
    const g = fakeDrive({ mtimeDegis: 1 });
    await yaz(g, konu());
    expect(g.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true']);
  });

  it('no permission (403) → CopIzinYok; the queue says izin', async () => {
    const f = fakeDrive({ copHata: ['403'] });
    const durum: unknown[] = [];
    const k = new IcindekilerKuyrugu({ drive: f.drive, secenek: () => sec(), durum: d => durum.push(d), basarili: () => {} });
    const is = yeniIs('i', 'deneme-1', { tur: 'cop', cop: konu() });
    const hata = vi.fn();
    is.bitti = hata;
    await k.ekle(is);
    expect(hata.mock.calls[0][0]).toBeInstanceOf(CopIzinYok);
    expect(durum.at(-1)).toMatchObject({ tur: 'hata', izin: true });
    expect(durum[0]).toEqual({ tur: 'kaydediliyor', ekleme: false, cop: 'at' });
  });
});

// The queue and the context (as the dialog and the toast use them)
function kur(f: ReturnType<typeof fakeDrive>) {
  const b = parseBook('deneme-1', structuredClone(f.kitap()));
  const yenile = vi.fn();
  let n = 0;
  const k = icindekilerBaglamiKur({
    drive: f.drive, secenek: () => sec(), kilitAcik: true, hasJson: () => true, uniteKlasorleri: async () => [],
    kitap: id => id === 'deneme-1' ? b : undefined, yenile, jsonOku: async () => f.kitap(), girisYap() {}, islemId: () => 'islem-' + ++n
  });
  return { b, k, yenile };
}

describe('Tekrar dene, Geri al, Vazgeç', () => {
  it('Tekrar dene goes on where it stopped: kitap.json written once, the folder on the retry', async () => {
    const f = fakeDrive({ copHata: ['ag'] });
    const t = kur(f);
    const c = konu();
    await expect(t.k.copCalistir('deneme-1', c)).rejects.toThrow();
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true']);   // the cop request failed
    expect(t.b.uniteler[0].konular).toHaveLength(2);                          // memory: only when Drive took it all
    await t.k.copCalistir('deneme-1', c);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true', 'cop:Konu-01-Aussagen:true']);
    expect(t.b.uniteler[0].konular.map(x => x.klasor)).toEqual([K2]);
    expect(t.yenile).toHaveBeenCalled();
  });

  it('kitap.json fails: no trash request; the retry writes both', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const t = kur(f);
    const c = konu();
    await expect(t.k.copCalistir('deneme-1', c)).rejects.toThrow();
    expect(f.yazmalar()).toEqual(['jsonYaz']);
    await t.k.copCalistir('deneme-1', c);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'jsonYaz', 'cop:Konu-01-Aussagen:true']);
  });

  it('the reader is told where to go; "Çöpe atılıyor…" while it runs', async () => {
    const f = fakeDrive();
    const t = kur(f);
    const p = t.k.copCalistir('deneme-1', konu());
    expect(t.k.baglam.copBekleyenler(t.b)).toEqual([{ tur: 'konu', konu: K1 }]);
    await p;
    expect(t.k.baglam.copBekleyenler(t.b)).toEqual([]);
    expect(t.k.baglam.yonlendir(K1)).toBe(K2);
    expect(t.k.baglam.yonlendir(K2)).toBeUndefined();
  });

  it('Geri al: the folder first, then kitap.json; the topic at its place with status and ribbons, the book ribbon back; memory too', async () => {
    const f = fakeDrive({ kitap: KURDELELI });
    const t = kur(f);
    const nesne = t.b.uniteler[0].konular[0];
    const c = konu();
    await t.k.copCalistir('deneme-1', c);
    expect(t.b.kurdele).toBeNull();
    await t.k.copGeriAl('deneme-1', c);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true', 'cop:Konu-01-Aussagen:false', 'jsonYaz']);
    expect(f.kitap()).toEqual(KURDELELI);
    expect(f.copte('t1')).toBe(false);
    expect(t.b.uniteler[0].konular[0]).toBe(nesne);
    expect(t.b.kurdele).toMatchObject({ konu: K1 });
  });

  it('a unit back with its topics', async () => {
    const f = fakeDrive();
    const t = kur(f);
    const c = yeniCopIsi({ tur: 'unite', klasor: 'Unite-01-Logik' }, 'Logik');
    await t.k.copCalistir('deneme-1', c);
    await t.k.copGeriAl('deneme-1', c);
    expect(f.kitap()).toEqual(KITAP);
    expect(t.b.uniteler.map(u => u.baslik)).toEqual(['Logik', 'Leer']);
    expect(f.copte('t2')).toBe(false);
  });

  it('Geri al fails at kitap.json: Tekrar dene writes only kitap.json (the folder is not asked again)', async () => {
    const f = fakeDrive({ yazHata: ['ok', 'ag'] });
    const t = kur(f);
    const c = konu();
    await t.k.copCalistir('deneme-1', c);
    await expect(t.k.copGeriAl('deneme-1', c)).rejects.toThrow();
    expect(f.copte('t1')).toBe(false);
    await t.k.copGeriAl('deneme-1', c);
    expect(f.yazmalar().filter(x => x.endsWith(':false'))).toHaveLength(1);
    expect(f.kitap()).toEqual(KITAP);
  });

  it('Vazgeç after a failed trash request: kitap.json gets the topic back; the folder was never in the trash', async () => {
    const f = fakeDrive({ copHata: ['ag'] });
    const t = kur(f);
    const c = konu();
    await expect(t.k.copCalistir('deneme-1', c)).rejects.toThrow();
    await t.k.copGeriAl('deneme-1', c);
    expect(f.kitap()).toEqual(KITAP);
    expect(f.yazmalar()).toEqual(['jsonYaz', 'cop:Konu-01-Aussagen:true', 'jsonYaz']);
    expect(t.k.kuyruk.hasUnsaved).toBe(false);
    expect(t.b.uniteler[0].konular).toHaveLength(2);
  });

  it('the status line\'s Vazgeç on a failed trash runs the same Geri al', async () => {
    const f = fakeDrive({ copHata: ['ag'] });
    const t = kur(f);
    await expect(t.k.copCalistir('deneme-1', konu())).rejects.toThrow();
    await t.k.vazgec();
    await vi.waitFor(() => expect(t.k.kuyruk.hasUnsaved).toBe(false));
    expect(f.kitap()).toEqual(KITAP);
  });
});
