import { describe, expect, it } from 'vitest';
import { validateStroke } from './cizgi';
import { COLORS, DEFAULT_PREFS, HL_OPACITY, SIZES, parsePrefs, strokeStyle } from './kalemCubugu';

// Task 4.6: the remembered pen choice

describe('parsePrefs', () => {
  it('nothing saved or broken JSON → the default', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{bozuk')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
  });

  it('a saved choice comes back', () => {
    const p = { arac: 'fosforlu', renk: { kalem: '#b5523b', fosforlu: '#f59ac0' }, boy: { kalem: 2, fosforlu: 0 } };
    expect(parsePrefs(JSON.stringify(p))).toEqual(p);
  });

  it('unknown colour, size or tool → that field only falls back', () => {
    const p = parsePrefs(JSON.stringify({ arac: 'silgi', renk: { kalem: '#ff0000', fosforlu: '#8fd16a' }, boy: { kalem: 7, fosforlu: 1.5 } }));
    expect(p).toEqual({ arac: 'kalem', renk: { kalem: DEFAULT_PREFS.renk.kalem, fosforlu: '#8fd16a' }, boy: DEFAULT_PREFS.boy });
  });

  it('missing fields → the default for them', () => {
    expect(parsePrefs(JSON.stringify({ arac: 'fosforlu' }))).toEqual({ ...DEFAULT_PREFS, arac: 'fosforlu' });
    expect(parsePrefs(JSON.stringify({ renk: 'mavi', boy: null }))).toEqual(DEFAULT_PREFS);
  });

  it('a pen colour is not taken for the highlighter', () => {
    expect(parsePrefs(JSON.stringify({ renk: { fosforlu: '#222222' } })).renk.fosforlu).toBe(DEFAULT_PREFS.renk.fosforlu);
  });
});

describe('strokeStyle', () => {
  it('every choice makes a stroke validateStroke accepts', () => {
    for (const arac of ['kalem', 'fosforlu'] as const) {
      for (const [renk] of COLORS[arac]) {
        for (let boy = 0; boy < SIZES[arac].length; boy++) {
          const p = { arac, renk: { ...DEFAULT_PREFS.renk, [arac]: renk }, boy: { ...DEFAULT_PREFS.boy, [arac]: boy } };
          const s = strokeStyle(p);
          expect(s).toEqual({ arac, renk, kalinlik: SIZES[arac][boy], opaklik: arac === 'kalem' ? 1 : HL_OPACITY });
          expect(() => validateStroke({ id: 'x', ...s, noktalar: [1, 2] })).not.toThrow();
        }
      }
    }
  });

  it('4 pen colours, 3 highlighter colours, 3 sizes each', () => {
    expect(COLORS.kalem.map(c => c[1])).toEqual(['Siyah', 'Mavi', 'Kırmızı', 'Yeşil']);
    expect(COLORS.fosforlu.map(c => c[1])).toEqual(['Sarı', 'Yeşil', 'Pembe']);
    expect(SIZES.kalem).toHaveLength(3);
    expect(SIZES.fosforlu).toHaveLength(3);
  });
});
