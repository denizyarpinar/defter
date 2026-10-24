import { describe, expect, it } from 'vitest';
import { adimEtiketi, listeSatirlari, varsayilanKonu, type DeneAday } from './kayitDeneSec';

const a = (kitap: string, konu: string, ozetVar = true, ornek = false): DeneAday => ({ kitap, ornek, konu, ozetVar });

describe('varsayilanKonu', () => {
  it('örnek kitabı ve ozet.pdf’siz konuyu atlar, ilk gerçek konuyu seçer', () => {
    expect(varsayilanKonu([a('programlamaya-giris', 'U1/K1', true, true), a('mathe-1', 'U1/K1', false), a('mathe-1', 'U1/K2')])).toEqual(a('mathe-1', 'U1/K2'));
  });
  it('adında "test" geçen konu ya da kitap önce gelir (büyük/küçük harf duyarsız)', () => {
    expect(varsayilanKonu([a('mathe-1', 'U1/K1'), a('mathe-1', 'U9/Konu-99-Test')])?.konu).toBe('U9/Konu-99-Test');
    expect(varsayilanKonu([a('mathe-1', 'U1/K1'), a('test-kitap', 'U1/K1')])?.kitap).toBe('test-kitap');
    expect(varsayilanKonu([a('ornek', 'U1/Test', true, true), a('mathe-1', 'U1/K1')])?.kitap).toBe('mathe-1');
  });
  it('uygun konu yoksa null', () => {
    expect(varsayilanKonu([])).toBeNull();
    expect(varsayilanKonu([a('ornek', 'U1/K1', true, true), a('mathe-1', 'U1/K1', false)])).toBeNull();
  });
});

describe('listeSatirlari ve adım', () => {
  it('her kitap; ozet.pdf’li konular, yoksa tek satır; id ya da e-posta yok', () => {
    const satirlar = listeSatirlari(
      [{ kitap: 'mathe-1', ornek: false }, { kitap: 'programlamaya-giris', ornek: true }],
      [a('mathe-1', 'U1/K1'), a('mathe-1', 'U1/K2', false), a('mathe-1', 'U2/K3')]
    );
    expect(satirlar).toEqual([
      { kitap: 'mathe-1', ornek: '', konu: 'U1/K1' },
      { kitap: 'mathe-1', ornek: '', konu: 'U2/K3' },
      { kitap: 'programlamaya-giris', ornek: 'evet', konu: "(ozet.pdf'li konu yok)" }
    ]);
  });
  it('adım etiketleri', () => {
    expect(['kitaplik', 'kitap', 'konu', 'ozet'].map(x => adimEtiketi(x as never))).toEqual(['[adım 1/4 kitaplık]', '[adım 2/4 kitap]', '[adım 3/4 konu]', '[adım 4/4 ozet.pdf]']);
  });
});
