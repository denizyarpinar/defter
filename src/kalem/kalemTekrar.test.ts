import { describe, expect, it } from 'vitest';
import { eskiKurallar, kayitlariAyikla, olcekBul, ornekKayitlar, yeniKurallar } from './kalemTekrar';

// Task 6.H2b: replaying a ?olcum=1 record with the old and the new point rules (comparison page)

describe('kalemTekrar', () => {
  const ornek = ornekKayitlar();

  it('the old rules give back the kept points, at the scale found', () => {
    for (const { kayit } of ornek) {
      const o = olcekBul(kayit);
      expect(o.tutuyor).toBe(true);
      expect(o.s).toBeCloseTo(3, 1);
      expect(eskiKurallar(kayit, o.s).noktalar.length).toBe(kayit.saklanan.length);
    }
  });

  it('the new rules drop the repeated moves; the flat pressure of the pen is kept; the up point ends the stroke', () => {
    const s = ornek.find(o => o.ad.includes('iki kez'))!.kayit;
    const y = yeniKurallar(s, 3);
    expect(y.cift).toBe(8);   // two moves of 4 coalesced events came twice
    expect(y.basinc).toBeDefined();
    expect(new Set(y.basinc)).toEqual(new Set([0.12]));
    expect(y.basinc!.length).toBe(y.noktalar.length / 2);
    // no going back: no point equals the one two before it
    for (let i = 4; i + 1 < y.noktalar.length; i += 2) {
      expect(y.noktalar[i] === y.noktalar[i - 4] && y.noktalar[i + 1] === y.noktalar[i - 3]).toBe(false);
    }
    const up = s.olaylar[s.olaylar.length - 1];
    const [x0, y0] = s.saklanan, d = s.olaylar[0];
    expect(y.noktalar.slice(-2)).toEqual([+(x0 + (up[1] - d[1]) / 3).toFixed(2), +(y0 - (up[2] - d[2]) / 3).toFixed(2)]);
  });

  it('the JSON array is found in pasted text; rejected downs are left out', () => {
    const k = ornek[0].kayit;
    const text = `kopyalandı:\n${JSON.stringify([k, { ...k, sonuc: 'reddedildi' }])}\n`;
    expect(kayitlariAyikla(text)).toHaveLength(1);
    expect(() => kayitlariAyikla('boş')).toThrow(/bulunamadı/);
  });
});
