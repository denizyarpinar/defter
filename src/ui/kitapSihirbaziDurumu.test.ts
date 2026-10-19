import { describe, expect, it } from 'vitest';
import { listeAyristir } from '../kitap/kitapListesi';
import { agacIslemi, KILIT_METNI, satirAraligi, sihirbazDurumu, type SihirbazGirdisi } from './kitapSihirbaziDurumu';

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

  it('Oluştur is closed in K4a, with the reason', () => {
    const d = sihirbazDurumu(g('# A\nx'), []);
    expect(d.olusturAcik).toBe(false);
    expect(d.neden).toBe(KILIT_METNI);
  });

  it('without the lock: open only without a blocking warning', () => {
    expect(sihirbazDurumu(g('# A\nx'), [], false)).toMatchObject({ olusturAcik: true, neden: '' });
    expect(sihirbazDurumu(g('# A\n# B'), [], false).olusturAcik).toBe(true);           // warnings only
    expect(sihirbazDurumu(g(''), [], false)).toMatchObject({ olusturAcik: false, neden: 'En az bir ünite gerekli (“# Ünite adı” satırı).' });
    expect(sihirbazDurumu(g('# A\nx', ''), [], false)).toMatchObject({ olusturAcik: false, neden: 'Kitap adı gerekli.' });
    expect(sihirbazDurumu(g('# A\nx', 'Mathe 1'), ['mathe-1'], false).neden).toMatch(/zaten var/);
    expect(sihirbazDurumu(g(`# A\n${'x'.repeat(81)}`), [], false).neden).toBe('Ad en fazla 80 karakter olabilir.');
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
