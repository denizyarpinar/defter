import { describe, expect, it } from 'vitest';
import { hideDefterNotes, isDefterAnnotation, penLayerMode } from './defterNotu';

// Task 4.4: which pdf.js annotations are Defter's own notes

describe('isDefterAnnotation', () => {
  it('Ink + Defter: yes', () => {
    expect(isDefterAnnotation({ annotationType: 15, titleObj: { str: 'Defter' } })).toBe(true);
  });

  it('Ink by another author: no', () => {
    expect(isDefterAnnotation({ annotationType: 15, titleObj: { str: 'GoodNotes' } })).toBe(false);
    expect(isDefterAnnotation({ annotationType: 15, titleObj: { str: 'defter' } })).toBe(false);
  });

  it('Ink without an author: no', () => {
    expect(isDefterAnnotation({ annotationType: 15 })).toBe(false);
    expect(isDefterAnnotation({ annotationType: 15, titleObj: { str: '' } })).toBe(false);
  });

  it('Square (or another type) by Defter: no', () => {
    expect(isDefterAnnotation({ annotationType: 5, titleObj: { str: 'Defter' } })).toBe(false);
    expect(isDefterAnnotation({ titleObj: { str: 'Defter' } })).toBe(false);
  });
});

describe('hideDefterNotes', () => {
  it('?defterNot=goster shows them, anything else hides them', () => {
    expect(hideDefterNotes('?defterNot=goster')).toBe(false);
    expect(hideDefterNotes('?demo&defterNot=goster')).toBe(false);
    expect(hideDefterNotes('')).toBe(true);
    expect(hideDefterNotes('?demo')).toBe(true);
    expect(hideDefterNotes('?defterNot=gizle')).toBe(true);
  });

  it('?cizimKontrol=1 shows them too (task 4.5)', () => {
    expect(hideDefterNotes('?cizimKontrol=1')).toBe(false);
    expect(hideDefterNotes('?cizimKontrol=0')).toBe(true);
  });
});

describe('penLayerMode', () => {
  it('normal, kontrol (?cizimKontrol=1), kapali (?defterNot=goster)', () => {
    expect(penLayerMode('')).toBe('normal');
    expect(penLayerMode('?demo')).toBe('normal');
    expect(penLayerMode('?cizimKontrol=0')).toBe('normal');
    expect(penLayerMode('?demo&cizimKontrol=1')).toBe('kontrol');
    expect(penLayerMode('?defterNot=goster')).toBe('kapali');
    // both: pdf.js already draws them, a second drawing would only double them
    expect(penLayerMode('?defterNot=goster&cizimKontrol=1')).toBe('kapali');
  });
});
