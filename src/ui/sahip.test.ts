import { afterEach, describe, expect, it } from 'vitest';
import { dilAyarla } from '../dil';
import { genitive, kitapligindan } from './sahip';

// 6.5-2a: the title page's owner line in both languages

afterEach(() => dilAyarla('tr'));

describe('kitapligindan', () => {
  it('tr: Turkish genitive', () => {
    expect(kitapligindan('Deniz Yarpinar')).toBe("Deniz'in kitaplığından");
    expect(['Ayşe', 'Umut', 'Gül', 'Ali'].map(genitive)).toEqual(["Ayşe'nin", "Umut'un", "Gül'ün", "Ali'nin"]);
    expect(kitapligindan(null)).toBe('Örnek kitaplıktan');
  });
  it("en: 's, or only ' after s", () => {
    dilAyarla('en');
    expect(kitapligindan('Deniz Yarpinar')).toBe("From Deniz's library");
    expect(kitapligindan('James Smith')).toBe("From James' library");
    expect(kitapligindan(null)).toBe('From the sample library');
  });
});
