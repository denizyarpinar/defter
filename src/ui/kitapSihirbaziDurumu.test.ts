import { describe, expect, it } from 'vitest';
import { listeAyristir } from '../kitap/kitapListesi';
import { AyniKitapVar, KitapOlusturAgHatasi, KitapOlusturIzinYok, YarimKitapVar } from '../drive/kitapOlustur';
import { kitapPlani } from '../kitap/kitapPlani';
import {
  agacIslemi, kilitMetni, OlusturAkisi, olusturHatasi, satirAraligi, sihirbazDurumu, type SihirbazGirdisi
} from './kitapSihirbaziDurumu';

const g = (metin: string, ad = 'Mathe 2'): SihirbazGirdisi => ({ ad, rafId: 'raf-1', renk: '#24476b', metin });
const satirlar = (metin: string, ad?: string) => sihirbazDurumu(g(metin, ad), ['mathe-1']).agac
  .map(s => `${s.tur === 'unite' ? '#' : '-'} ${s.ad} [${s.klasor}] @${s.satir}${s.rozetler.map(r => ` !${r.metin}`).join('')}${s.yukari ? ' ↑' : ''}${s.asagi ? ' ↓' : ''}`);

describe('sihirbazDurumu', () => {
  it('the tree with folder names, lines and moves', () => {
    expect(satirlar('# Logik\nAussagenlogik\nBeweisen\n# Mengen\nRelationen')).toEqual([
      '# Logik [Unite-01-Logik] @1 ↓',
      '- Aussagenlogik [Konu-01-Aussagenlogik] @2 ↓',
      '- Beweisen [Konu-02-Beweisen] @3 ↑ ↓',
      '# Mengen [Unite-02-Mengen] @4 ↑',
      '- Relationen [Konu-03-Relationen] @5 ↑'
    ]);
  });

  it('warnings at their rows; "Genel": the unit row shows its warning, the topic row its own', () => {
    const uzun = 'u'.repeat(81);
    const s = satirlar(`${uzun}\nb\n# B\n# C\nx\nX`);
    expect(s[0]).toBe('# Genel [Unite-01-Genel] @1 !İlk “#” satırından önceki konular “Genel” ünitesine konuldu. ↓');
    expect(s[1]).toMatch(/^- u+ \[Konu-01-u+\] @1 !Ad en fazla 80 karakter olabilir\. ↓$/);
    expect(s[3]).toBe('# B [Unite-02-B] @3 !Bu ünitede henüz konu yok. ↑ ↓');
    expect(s[6]).toBe('- X [Konu-04-X] @6 !Bu ünitede aynı adlı bir konu daha var. ↑');
  });

  it('Oluştur is closed without the lock (the default), with the reason', () => {
    expect(sihirbazDurumu(g('# A\nx'), [])).toMatchObject({ olusturAcik: false, neden: kilitMetni() });
    expect(sihirbazDurumu(g('# A\nx'), [], 'kilitli')).toMatchObject({ olusturAcik: false, neden: kilitMetni() });
    // a blocking warning says more than the lock
    expect(sihirbazDurumu(g('# A\nx', ''), [], 'kilitli').neden).toBe('Kitap adı gerekli.');
  });

  it('without the lock: open only without a blocking warning', () => {
    expect(sihirbazDurumu(g('# A\nx'), [], 'acik')).toMatchObject({ olusturAcik: true, neden: '' });
    expect(sihirbazDurumu(g('# A\n# B'), [], 'acik').olusturAcik).toBe(true);           // warnings only
    expect(sihirbazDurumu(g(''), [], 'acik')).toMatchObject({ olusturAcik: false, neden: 'En az bir ünite gerekli (“# Ünite adı” satırı).' });
    expect(sihirbazDurumu(g('# A\nx', ''), [], 'acik')).toMatchObject({ olusturAcik: false, neden: 'Kitap adı gerekli.' });
    expect(sihirbazDurumu(g('# A\nx', 'Mathe 1'), ['mathe-1'], 'acik').neden).toMatch(/zaten var/);
    // 6.K4b-2: a half made book is not in the library → no plan block; Drive's check says YarimKitapVar
    expect(sihirbazDurumu(g('# A\nx', 'Deneme 6'), ['mathe-1'], 'acik')).toMatchObject({ olusturAcik: true, neden: '' });
    expect(sihirbazDurumu(g(`# A\n${'x'.repeat(81)}`), [], 'acik').neden).toBe('Ad en fazla 80 karakter olabilir.');
  });

  it('the list\'s warnings by line, for under the text box', () => {
    expect(sihirbazDurumu(g('# A\n# B\nx\nx'), []).uyarilar.map(u => `${u.satir}:${u.engel}`)).toEqual(['1:false', '4:false']);
  });
});

describe('agacIslemi', () => {
  const metin = 'önce\n# B\n1. b1\n\n# C\nc1';
  it('+ topic: the text is written again, the new line is given', () => {
    const r = agacIslemi(metin, { tur: 'konuEkle', u: 1 });
    expect(r.metin).toBe('# Genel\n- önce\n\n# B\n- b1\n- Yeni konu\n\n# C\n- c1');
    expect(r.metin.split('\n')[r.satir - 1]).toBe('- Yeni konu');
  });
  it('+ unit', () => {
    const r = agacIslemi(metin, { tur: 'uniteEkle' });
    expect(r.metin.split('\n')[r.satir - 1]).toBe('# Yeni ünite');
    expect(listeAyristir(r.metin).uniteler).toHaveLength(4);
  });
  it('↓ at the edge of a unit = into the next unit', () => {
    const r = agacIslemi(metin, { tur: 'konuTasi', u: 1, k: 0, yon: 1 });
    expect(listeAyristir(r.metin).uniteler.slice(1)).toEqual([{ ad: 'B', konular: [] }, { ad: 'C', konular: ['b1', 'c1'] }]);
    expect(r.metin.split('\n')[r.satir - 1]).toBe('- b1');
  });
  it('↑ a unit', () => {
    const r = agacIslemi(metin, { tur: 'uniteTasi', u: 2, yon: -1 });
    expect(listeAyristir(r.metin).uniteler.map(u => u.ad)).toEqual(['Genel', 'C', 'B']);
    expect(r.metin.split('\n')[r.satir - 1]).toBe('# C');
  });
});

describe('satirAraligi', () => {
  it('start and end of a line', () => {
    const m = 'ab\ncde\n\nf';
    expect(satirAraligi(m, 1)).toEqual([0, 2]);
    expect(satirAraligi(m, 2)).toEqual([3, 6]);
    expect(satirAraligi(m, 4)).toEqual([8, 9]);
  });
});

describe('OlusturAkisi (6.K4b)', () => {
  const plan = kitapPlani({ kitapAdi: 'Mathe 2', rafId: 'raf-1', renk: '#24476b', uniteler: [{ ad: 'A', konular: ['x'] }], mevcutIdler: [] });
  let n = 0;
  const akis = () => new OlusturAkisi(() => 'islem-' + ++n);

  it('one operation: running once, "Tekrar dene" uses the same one', () => {
    const a = akis();
    expect(a.alanlarKilitli).toBe(false);
    const i1 = a.basla(plan)!;
    expect(a.basla(plan)).toBeNull();             // running: no second start
    expect(a.mesgul && a.alanlarKilitli).toBe(true);
    a.bitti();
    expect(a.alanlarKilitli).toBe(true);           // failed: the fields stay as they were
    expect(a.basla(plan)).toBe(i1);                // the same islemId and ids
    a.bitti();
    a.sifirla();
    expect(a.alanlarKilitli).toBe(false);
    expect(a.basla(plan)!.islemId).not.toBe(i1.islemId);
  });

  it('errors: retry, sign in again, or a new name when nothing was written', () => {
    const a = akis();
    const i = a.basla(plan)!;
    expect(olusturHatasi(new KitapOlusturAgHatasi(), i)).toMatchObject({ tekrarDene: true, girisYap: false, duzenlenebilir: false });
    expect(olusturHatasi(new TypeError('Failed to fetch'), i)).toMatchObject({ tekrarDene: true, mesaj: expect.stringMatching(/bağlanılamadı/) });
    expect(olusturHatasi(new KitapOlusturIzinYok(), i)).toMatchObject({ tekrarDene: false, girisYap: true });
    expect(olusturHatasi(new AyniKitapVar('mathe-2'), i)).toMatchObject({ tekrarDene: false, girisYap: false, duzenlenebilir: true });
    // 6.K4b-2: a half made book: its message, a new name can be typed
    expect(olusturHatasi(new YarimKitapVar('mathe-2'), i)).toMatchObject({
      tekrarDene: false, girisYap: false, duzenlenebilir: true,
      mesaj: expect.stringMatching(/^Yarım kalmış bir kitap var: mathe-2\..*Başka bir ad seç; yarım klasör daha sonra çöpe atılabilir\.$/)
    });
    i.denenen.add(0);                             // something went to Drive: no new name
    expect(olusturHatasi(new AyniKitapVar('mathe-2'), i).duzenlenebilir).toBe(false);
  });

  it('6.K4b-3: only a folder already in Drive is the name\'s fault (red frame)', () => {
    const i = akis().basla(plan)!;
    expect(olusturHatasi(new AyniKitapVar('mathe-2'), i).adHatasi).toBe(true);
    expect(olusturHatasi(new YarimKitapVar('mathe-2'), i).adHatasi).toBe(true);
    expect(olusturHatasi(new KitapOlusturAgHatasi(), i).adHatasi).toBe(false);
    expect(olusturHatasi(new KitapOlusturIzinYok(), i).adHatasi).toBe(false);
    expect(olusturHatasi(new TypeError('Failed to fetch'), i).adHatasi).toBe(false);
  });
});

describe('adHatali (6.K4b-3)', () => {
  it('a book already there or a too long name; not an empty name, not the list\'s warnings', () => {
    expect(sihirbazDurumu(g('# A\nx', 'Mathe 1'), ['mathe-1'], 'acik').adHatali).toBe(true);
    expect(sihirbazDurumu(g('# A\nx', 'm'.repeat(81)), [], 'acik').adHatali).toBe(true);
    expect(sihirbazDurumu(g('# A\nx', ''), [], 'acik').adHatali).toBe(false);
    expect(sihirbazDurumu(g('# A\nx', '   '), [], 'acik').adHatali).toBe(false);
    expect(sihirbazDurumu(g(`# A\n${'x'.repeat(81)}`), [], 'acik').adHatali).toBe(false);
    expect(sihirbazDurumu(g('# A\nx', 'Mathe 2'), ['mathe-1'], 'kilitli').adHatali).toBe(false);
  });
});
