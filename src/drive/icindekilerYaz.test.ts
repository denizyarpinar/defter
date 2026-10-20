import { describe, expect, it } from 'vitest';
import { FOLDER_MIME } from './drive';
import { fakeDrive, KITAP, sec } from './icindekilerSahte';
import {
  IcindekilerAgHatasi, IcindekilerBeklenmedik, IcindekilerCakisma, IcindekilerIzinYok, IcindekilerKilitli, IcindekilerKuyrugu, icindekilerYaz,
  IcindekilerYazmaYok, KitapJsonYok, Surum1Duzenlenemez, uniteKlasorDurumu, UniteKlasoruYok, yeniIs,
  type IcindekilerSecenek, type KayitDurumu
} from './icindekilerYaz';
import { ReadingSaver } from './okumaKaydi';

describe('icindekilerYaz: adding', () => {
  it('a unit: its folder in the book folder (marked, id taken beforehand), then kitap.json; the number counts Drive\'s folders', async () => {
    const f = fakeDrive({ items: { yarim: { name: 'Unite-05-Yarim', parent: 'kb' } } });   // half-made, not in kitap.json
    const is = yeniIs('islem-1', 'deneme-1', { tur: 'uniteEkle', baslik: 'Graphen & Bäume' });
    const islem = await icindekilerYaz(f.drive, is, sec());
    expect(islem).toEqual({ tur: 'uniteEkle', baslik: 'Graphen & Bäume', klasor: 'Unite-06-Graphen-Baeume' });
    expect(f.yazmalar()).toEqual(['olustur:Unite-06-Graphen-Baeume', 'jsonYaz']);
    const [id, yeni] = [...f.items].find(([, i]) => i.name === 'Unite-06-Graphen-Baeume')!;
    expect(id).toBe('id1');
    expect(yeni).toMatchObject({ parent: 'kb', mimeType: FOLDER_MIME, appProperties: { defter: '1', defterIslem: 'islem-1' } });
    const k = f.kitap();
    expect(k.uniteler.at(-1)).toEqual({ baslik: 'Graphen & Bäume', klasor: 'Unite-06-Graphen-Baeume', konular: [] });
    expect(k.bilinmeyen).toBe(7);
    expect(k.uniteler[0]).toEqual(KITAP.uniteler[0]);
  });

  it('a topic: into its unit\'s folder; the number counts on through the book (a Drive folder not in kitap.json too)', async () => {
    const f = fakeDrive({ items: { yarim: { name: 'Konu-07-Yarim', parent: 'u2' } } });
    const is = yeniIs('islem-2', 'deneme-1', { tur: 'konuEkle', unite: 'k:Unite-01-Logik', uniteSira: 0, baslik: 'Induktion' });
    await icindekilerYaz(f.drive, is, sec());
    expect(f.yazmalar()).toEqual(['olustur:Konu-08-Induktion', 'jsonYaz']);
    expect([...f.items.values()].find(i => i.name === 'Konu-08-Induktion')!.parent).toBe('u1');
    expect(f.kitap().uniteler[0].konular.at(-1)).toEqual({ baslik: 'Induktion', klasor: 'Unite-01-Logik/Konu-08-Induktion', durum: 'okunmadi' });
  });

  it('an old empty unit: the one matching folder of ours is used and goes into kitap.json as its klasor', async () => {
    const f = fakeDrive();
    const is = yeniIs('islem-3', 'deneme-1', { tur: 'konuEkle', unite: 'b:Leer#0', uniteSira: 1, baslik: 'Erstes' });
    await icindekilerYaz(f.drive, is, sec());
    expect([...f.items.values()].find(i => i.name === 'Konu-03-Erstes')!.parent).toBe('u2');
    expect(f.kitap().uniteler[1]).toEqual({ baslik: 'Leer', klasor: 'Unite-02-Leer', konular: [{ baslik: 'Erstes', klasor: 'Unite-02-Leer/Konu-03-Erstes', durum: 'okunmadi' }] });
  });

  it('an old empty unit without exactly one matching folder → UniteKlasoruYok, nothing is written', async () => {
    // none (the folder is gone) / two with that name
    for (const o of [{ sil: ['u2'] }, { items: { u2b: { name: 'Unite-02-Leer', parent: 'kb' } } }]) {
      const f = fakeDrive(o);
      const is = yeniIs('islem-4', 'deneme-1', { tur: 'konuEkle', unite: 'b:Leer#0', uniteSira: 1, baslik: 'X' });
      await expect(icindekilerYaz(f.drive, is, sec())).rejects.toThrow(UniteKlasoruYok);
      expect(f.yazmalar()).toEqual([]);
    }
    // not ours (no defter mark): not used either
    const f = fakeDrive({ items: { u2: { name: 'Unite-02-Leer', parent: 'kb', appProperties: {} } } });
    await expect(icindekilerYaz(f.drive, yeniIs('i', 'deneme-1', { tur: 'konuEkle', unite: 'b:Leer#0', uniteSira: 1, baslik: 'X' }), sec())).rejects.toThrow(UniteKlasoruYok);
  });

  it('a name there already (any case) → the next number; the existing folder is never written into', async () => {
    const f = fakeDrive({ items: { ayni: { name: 'unite-03-neu', parent: 'kb', appProperties: {} } } });
    const islem = await icindekilerYaz(f.drive, yeniIs('i', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' }), sec());
    expect(islem).toMatchObject({ klasor: 'Unite-04-Neu' });
    expect([...f.items.values()].filter(i => i.parent === 'ayni')).toEqual([]);
  });
});

describe('icindekilerYaz: Tekrar dene, no doubles', () => {
  it('network error before the folder → the same islemId and id next time, one folder', async () => {
    const f = fakeDrive({ davranis: ['ag'] });
    const is = yeniIs('islem-5', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' });
    await expect(icindekilerYaz(f.drive, is, sec({ deneme: 1 }))).rejects.toThrow(IcindekilerAgHatasi);
    expect(f.kitap().uniteler).toHaveLength(2);
    await icindekilerYaz(f.drive, is, sec({ deneme: 1 }));
    expect([...f.items.values()].filter(i => i.name === 'Unite-03-Neu')).toHaveLength(1);
    expect(f.calls.filter(c => c.startsWith('yeniIdler'))).toEqual(['yeniIdler:1']);
    expect(f.kitap().uniteler).toHaveLength(3);
  });

  it('the folder arrived but the answer was lost → found by islemId / id, not made again', async () => {
    const f = fakeDrive({ davranis: ['agAmaOlustu'] });
    const is = yeniIs('islem-6', 'deneme-1', { tur: 'konuEkle', unite: 'k:Unite-01-Logik', uniteSira: 0, baslik: 'Neu' });
    await expect(icindekilerYaz(f.drive, is, sec({ deneme: 1 }))).rejects.toThrow(IcindekilerAgHatasi);
    await icindekilerYaz(f.drive, is, sec());
    expect(f.olusturmalar()).toEqual(['olustur:Konu-03-Neu']);
    expect(f.kitap().uniteler[0].konular.map(t => t.klasor)).toEqual(['Unite-01-Logik/Konu-01-Aussagen', 'Unite-01-Logik/Konu-02-Beweisen', 'Unite-01-Logik/Konu-03-Neu']);
  });

  it('kitap.json failed after the folder → the retry writes only kitap.json', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const is = yeniIs('islem-7', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' });
    await expect(icindekilerYaz(f.drive, is, sec())).rejects.toThrow(IcindekilerAgHatasi);
    await icindekilerYaz(f.drive, is, sec());
    expect(f.olusturmalar()).toEqual(['olustur:Unite-03-Neu']);
    expect(f.kitap().uniteler.map(u => u.baslik)).toEqual(['Logik', 'Leer', 'Neu']);
  });

  it('Drive says 409 for our id: a trashed one of ours is not taken as done', async () => {
    const f = fakeDrive({ items: { id1: { name: 'Unite-03-Neu', parent: 'kb', appProperties: { defter: '1', defterIslem: 'islem-8' }, trashed: true } } });
    await expect(icindekilerYaz(f.drive, yeniIs('islem-8', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' }), sec())).rejects.toThrow(IcindekilerBeklenmedik);
  });
});

describe('icindekilerYaz: kitap.json', () => {
  it('rename: only baslik changes; the order follows the keys', async () => {
    const f = fakeDrive();
    await icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagenlogik' }), sec());
    await icindekilerYaz(f.drive, yeniIs('b', 'deneme-1', { tur: 'uniteSirasi', sira: ['b:Leer#0', 'k:Unite-01-Logik'] }), sec());
    const k = f.kitap();
    expect(k.uniteler.map(u => u.baslik)).toEqual(['Leer', 'Logik']);
    expect(k.uniteler[1].konular[0]).toEqual({ ...KITAP.uniteler[0].konular[0], baslik: 'Aussagenlogik' });
    expect(f.olusturmalar()).toEqual([]);
  });

  it('changed meanwhile: once more from the start; again → IcindekilerCakisma, nothing written', async () => {
    const f = fakeDrive({ mtimeDegis: 1 });
    await icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'L' }), sec());
    expect(f.calls.filter(c => c === 'jsonYaz')).toHaveLength(1);
    const g = fakeDrive({ mtimeDegis: 2 });
    await expect(icindekilerYaz(g.drive, yeniIs('a', 'deneme-1', { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'L' }), sec())).rejects.toThrow(IcindekilerCakisma);
    expect(g.calls).not.toContain('jsonYaz');
  });

  it('a waiting ribbon write goes first (oncesi); both changes stay', async () => {
    const f = fakeDrive();
    const reading = new ReadingSaver(() => 'kj', f.okuma, { saving() {}, saved() {}, failed() {} }, { delay: 60_000, retry: 60_000 });
    reading.change('deneme-1', { kurdele: { konu: 'Unite-01-Logik/Konu-02-Beweisen', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 5 } });
    await icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'Logik 2' }), sec({ oncesi: () => reading.flush() }));
    reading.dispose();
    expect(f.yazmalar()).toEqual(['okuma:write', 'jsonYaz']);
    const k = f.kitap();
    expect(k.kurdele).toEqual({ konu: 'Unite-01-Logik/Konu-02-Beweisen', materyal: 'ozet', dosya: 'ozet.pdf', sayfa: 5 });
    expect(k.uniteler[0].baslik).toBe('Logik 2');
  });

  it('after a topic rename the reading saver still finds the topic (by its folder); its ribbons stay', async () => {
    const f = fakeDrive();
    await icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'konuAdi', konu: 'Unite-01-Logik/Konu-01-Aussagen', baslik: 'Aussagenlogik' }), sec());
    const reading = new ReadingSaver(() => 'kj', f.okuma, { saving() {}, saved() {}, failed() {} }, { delay: 60_000, retry: 60_000 });
    reading.change('deneme-1', { konular: { 'Unite-01-Logik/Konu-01-Aussagen': { baslik: 'Aussagenlogik', durum: 'tekrar', kurdeleler: { orijinal: { dosya: 'orijinal.pdf', sayfa: 9 } } } } });
    await reading.flush();
    reading.dispose();
    expect(f.kitap().uniteler[0].konular[0]).toEqual({
      baslik: 'Aussagenlogik', klasor: 'Unite-01-Logik/Konu-01-Aussagen', durum: 'tekrar',
      kurdeleler: { ozet: { dosya: 'ozet.pdf', sayfa: 3 }, orijinal: { dosya: 'orijinal.pdf', sayfa: 9 } }
    });
  });
});

describe('icindekilerYaz: guards (no request)', () => {
  const cases: [string, Partial<IcindekilerSecenek>, new (...a: never[]) => Error][] = [
    ['locked', { kilitAcik: false }, IcindekilerKilitli],
    ['no root', { kokKaynagi: null }, IcindekilerKilitli],
    ['sample library / signed out', { yazabilir: () => false }, IcindekilerYazmaYok],
    ['surum 1', { surum: 1 }, Surum1Duzenlenemez],
    ['no kitap.json', { kitapJsonId: undefined }, KitapJsonYok]
  ];
  for (const [ad, o, hata] of cases) {
    it(ad, async () => {
      const f = fakeDrive();
      await expect(icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteEkle', baslik: 'X' }), sec(o))).rejects.toThrow(hata);
      expect(f.calls).toEqual([]);
    });
  }

  it('surum 1 in the file (the memory said 2) → nothing written', async () => {
    const f = fakeDrive({ kitap: { surum: 1, baslik: 'Alt', bolumler: [] } });
    await expect(icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteEkle', baslik: 'X' }), sec())).rejects.toThrow(Surum1Duzenlenemez);
    expect(f.yazmalar()).toEqual([]);
  });

  it('the book folder is not in the root\'s kitaplar/ → nothing written', async () => {
    const f = fakeDrive({ items: { kb: { name: 'deneme-1', parent: 'baska' } } });
    await expect(icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteEkle', baslik: 'X' }), sec())).rejects.toThrow(IcindekilerBeklenmedik);
    expect(f.yazmalar()).toEqual([]);
  });

  it('403 → IcindekilerIzinYok', async () => {
    const f = fakeDrive({ yazHata: ['403'] });
    await expect(icindekilerYaz(f.drive, yeniIs('a', 'deneme-1', { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'L' }), sec())).rejects.toThrow(IcindekilerIzinYok);
  });
});

describe('uniteKlasorDurumu', () => {
  it('known folders without a request; the old empty unit by the matching folder', async () => {
    const f = fakeDrive();
    expect(await uniteKlasorDurumu(f.drive, 'kb', KITAP.uniteler)).toEqual(['Unite-01-Logik', 'Unite-02-Leer']);
    const g = fakeDrive();
    expect(await uniteKlasorDurumu(g.drive, 'kb', [KITAP.uniteler[0]])).toEqual(['Unite-01-Logik']);
    expect(g.calls).toEqual([]);
  });
});

describe('IcindekilerKuyrugu', () => {
  it('one at a time, in order; a failed one stops the rest until Tekrar dene; adding reports its folder names', async () => {
    const f = fakeDrive({ yazHata: ['ag'] });
    const durumlar: KayitDurumu['tur'][] = [];
    const biten: string[] = [];
    const k = new IcindekilerKuyrugu({
      drive: f.drive, secenek: () => sec(), durum: d => durumlar.push(d.tur),
      basarili: (_is, islem) => biten.push(islem.tur + (islem.tur === 'uniteEkle' ? ':' + islem.klasor : ''))
    });
    const a = k.ekle(yeniIs('a', 'deneme-1', { tur: 'uniteAdi', unite: 'k:Unite-01-Logik', baslik: 'L' }));
    void k.ekle(yeniIs('b', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' }));
    await a;
    expect(durumlar.at(-1)).toBe('hata');
    expect(k.hasUnsaved).toBe(true);
    expect(k.bekleyenler).toHaveLength(2);
    expect(f.olusturmalar()).toEqual([]);   // the second one waits
    await k.tekrarDene();
    expect(biten).toEqual(['uniteAdi', 'uniteEkle:Unite-03-Neu']);
    expect(durumlar.at(-1)).toBe('kaydedildi');
    expect(k.hasUnsaved).toBe(false);
  });

  it('Vazgeç drops the failed one', async () => {
    const f = fakeDrive({ davranis: ['ag', 'ag', 'ag'] });
    const durumlar: KayitDurumu['tur'][] = [];
    const k = new IcindekilerKuyrugu({ drive: f.drive, secenek: () => sec(), durum: d => durumlar.push(d.tur), basarili: () => {} });
    await k.ekle(yeniIs('a', 'deneme-1', { tur: 'uniteEkle', baslik: 'Neu' }));
    expect(durumlar.at(-1)).toBe('hata');
    k.vazgec();
    expect(k.hasUnsaved).toBe(false);
    expect(durumlar.at(-1)).toBe('bos');
  });
});
