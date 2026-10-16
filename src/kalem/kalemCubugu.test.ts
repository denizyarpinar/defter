import { describe, expect, it } from 'vitest';
import { validateStroke } from './cizgi';
import { COLORS, DEFAULT_PREFS, HL_OPACITY, SIZES, parsePrefs, saveButton, saveStatus, strokeStyle, type SaveView, type ToolbarState } from './kalemCubugu';

// Task 4.6: the remembered pen choice

describe('parsePrefs', () => {
  it('nothing saved or broken JSON → the default', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{bozuk')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_PREFS);
  });

  it('a saved choice comes back', () => {
    const p = { arac: 'fosforlu', renk: { kalem: '#e02020', fosforlu: '#f59ac0' }, boy: { kalem: 2, fosforlu: 0 } };
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

  it('6 pen colours, 5 highlighter colours, 3 sizes each', () => {
    expect(COLORS.kalem.map(c => c[1])).toEqual(['Siyah', 'Mavi', 'Kırmızı', 'Yeşil', 'Turuncu', 'Mor']);
    expect(COLORS.fosforlu.map(c => c[1])).toEqual(['Sarı', 'Yeşil', 'Pembe', 'Mavi', 'Turuncu']);
    expect(SIZES.kalem).toHaveLength(3);
    expect(SIZES.fosforlu).toHaveLength(3);
  });
});

describe('the eraser (task 4.7)', () => {
  it('is not remembered', () => {
    expect(parsePrefs(JSON.stringify({ arac: 'silgi' })).arac).toBe('kalem');
  });
});

describe('the new palette (task 4.7b)', () => {
  it('the old red saved before becomes the new red; other saved colours stay', () => {
    expect(parsePrefs(JSON.stringify({ renk: { kalem: '#b5523b', fosforlu: '#7cc4f5' } })).renk).toEqual({ kalem: '#e02020', fosforlu: '#7cc4f5' });
    expect(parsePrefs(JSON.stringify({ renk: { kalem: '#7b2fbf' } })).renk.kalem).toBe('#7b2fbf');
    // the old red is not a highlighter colour: there it falls back to the default
    expect(parsePrefs(JSON.stringify({ renk: { fosforlu: '#b5523b' } })).renk.fosforlu).toBe(DEFAULT_PREFS.renk.fosforlu);
  });

  it('the exact colours', () => {
    expect(COLORS.kalem.map(c => c[0])).toEqual(['#222222', '#1d3a8a', '#e02020', '#2f7a46', '#f07a00', '#7b2fbf']);
    expect(COLORS.fosforlu.map(c => c[0])).toEqual(['#f5d33a', '#8fd16a', '#f59ac0', '#7cc4f5', '#ffb347']);
  });
});

// Task 4.8b: saving to Drive in the tool bar
describe('saveStatus / saveButton', () => {
  const st = (over: Partial<ToolbarState> = {}, kayit: Partial<SaveView> = {}): ToolbarState => ({
    preparing: false, dirty: true, onDevice: true, canUndo: true, canRedo: false,
    ...over, kayit: { kilit: 'acik', durum: { tur: 'bos' }, ...kayit }
  });
  const disabled = (html: string) => html.includes(' disabled');

  it('lock closed: the hint, Kaydet disabled', () => {
    const s = st({}, { kilit: 'kapali' });
    expect(saveStatus(s)).toContain("Drive'a yazma kapalı (test)");
    expect(saveStatus(s)).toContain('Kaydedilmedi');
    expect(disabled(saveButton(s))).toBe(true);
  });

  it('sample library: never saved, Kaydet disabled', () => {
    const s = st({}, { kilit: 'ornek' });
    expect(saveStatus(s)).toContain('Örnek kitaplık');
    expect(disabled(saveButton(s))).toBe(true);
  });

  it('lock open: Kaydet only with something to save, not while saving', () => {
    expect(disabled(saveButton(st()))).toBe(false);
    expect(disabled(saveButton(st({ dirty: false })))).toBe(true);
    expect(disabled(saveButton(st({}, { durum: { tur: 'kaydediliyor' } })))).toBe(true);
    expect(saveStatus(st({}, { durum: { tur: 'kaydediliyor' } }))).toContain('Kaydediliyor…');
  });

  it('saved, offline, error', () => {
    expect(saveStatus(st({ dirty: false }, { durum: { tur: 'kaydedildi' } }))).toContain('Kaydedildi');
    expect(saveStatus(st({}, { durum: { tur: 'kaydedildi' } }))).toContain('Kaydedilmedi');   // drawn again since
    expect(saveStatus(st({}, { durum: { tur: 'cevrimdisi' } }))).toContain('Çevrimdışı');
    const err = st({}, { durum: { tur: 'hata', mesaj: 'Bu PDF\'e yazma iznin yok; "x"', tekrar: false } });
    expect(saveStatus(err)).toContain('Kaydedilemedi');
    expect(saveStatus(err)).toContain('&quot;x&quot;');
    expect(saveButton(err)).toContain('Tekrar dene');
    expect(disabled(saveButton(err))).toBe(false);
  });
});
