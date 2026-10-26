import { describe, expect, it } from 'vitest';
import { budanacaklar } from './silinenSayfaDepo';

// Task 6.S-4d: which backups of deleted pages go

describe('budanacaklar', () => {
  const simdi = Date.parse('2026-10-26T12:00:00Z');
  const k = (islemId: string, gunOnce: number) => ({ islemId, zaman: new Date(simdi - gunOnce * 24 * 3600 * 1000).toISOString() });

  it('7 günden eskiler gider', () => {
    expect(budanacaklar([k('a', 1), k('b', 6.9), k('c', 7), k('d', 30)], simdi).sort()).toEqual(['c', 'd']);
  });
  it('en yeni 5 kalır', () => {
    expect(budanacaklar([k('a', 1), k('b', 2), k('c', 3), k('d', 4), k('e', 5), k('f', 6), k('g', 0.5)], simdi).sort()).toEqual(['e', 'f']);
  });
  it('bozuk zaman: gider', () => {
    expect(budanacaklar([{ islemId: 'x', zaman: 'yok' }, k('a', 1)], simdi)).toEqual(['x']);
  });
});
