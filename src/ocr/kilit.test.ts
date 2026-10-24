import { describe, expect, it } from 'vitest';
import { CANLI_ADRES, ocrKayitAcik } from './kilit';

// Task 6.4c-2: the trial lock; never open on the live site
describe('ocrKayitAcik', () => {
  const yerel = { ortam: '', host: 'localhost' };
  it('without the parameter: shut', () => {
    expect(ocrKayitAcik('', yerel)).toBe(false);
    expect(ocrKayitAcik('?olcum=1', yerel)).toBe(false);
    expect(ocrKayitAcik('?ocrKayit=0', yerel)).toBe(false);
  });
  it('with it locally and on a preview: open', () => {
    expect(ocrKayitAcik('?ocrKayit=1', yerel)).toBe(true);
    expect(ocrKayitAcik('?olcum=1&ocrKayit=1', { ortam: 'preview', host: 'defter-git-faz-6-x.vercel.app' })).toBe(true);
  });
  it('production: shut even with the parameter', () => {
    expect(ocrKayitAcik('?ocrKayit=1', { ortam: 'production', host: 'localhost' })).toBe(false);
    expect(ocrKayitAcik('?ocrKayit=1', { ortam: '', host: CANLI_ADRES })).toBe(false);
    expect(ocrKayitAcik('?ocrKayit=1', { ortam: 'preview', host: CANLI_ADRES.toUpperCase() })).toBe(false);
  });
});
