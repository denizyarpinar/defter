import { describe, expect, it } from 'vitest';
import { alanHesapla, klavyeAcikMi, KLAVYE_PAYI, yaziAlaniMi } from './gorunurAlan';

// Task 5.10g-ek: the visible part the fixed roots use (iPad Safari after the keyboard / photo picker).

const vv = (offsetTop: number, height: number, scale = 1) => ({ offsetTop, height, scale });

describe('alanHesapla', () => {
  it('normal: the whole screen', () => {
    expect(alanHesapla({ vv: vv(0, 1180), innerHeight: 1180, klavyeAcik: false })).toEqual({ ust: 0, yukseklik: 1180 });
  });
  it('stale layout after the keyboard (moved 60 px, smaller): follows the visible part', () => {
    expect(alanHesapla({ vv: vv(60.4, 1049.6), innerHeight: 1180, klavyeAcik: false })).toEqual({ ust: 60, yukseklik: 1050 });
  });
  it('keyboard open: nothing changes (null)', () => {
    expect(alanHesapla({ vv: vv(300, 700), innerHeight: 1180, klavyeAcik: true })).toBeNull();
  });
  it('no visualViewport, or a page zoom: the layout height, at the top', () => {
    expect(alanHesapla({ vv: null, innerHeight: 900, klavyeAcik: false })).toEqual({ ust: 0, yukseklik: 900 });
    expect(alanHesapla({ vv: vv(200, 450, 2), innerHeight: 900, klavyeAcik: false })).toEqual({ ust: 0, yukseklik: 900 });
    expect(alanHesapla({ vv: vv(0, 0), innerHeight: 900, klavyeAcik: false })).toEqual({ ust: 0, yukseklik: 900 });
  });
  it('a negative offset (rubber band) is not used', () => {
    expect(alanHesapla({ vv: vv(-12, 1180), innerHeight: 1180, klavyeAcik: false })).toEqual({ ust: 0, yukseklik: 1180 });
  });
});

describe('yaziAlaniMi', () => {
  it('text fields: yes', () => {
    expect(yaziAlaniMi({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'input' })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'TEXTAREA' })).toBe(true);
    expect(yaziAlaniMi({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('buttons, radios, file inputs, nothing: no', () => {
    expect(yaziAlaniMi({ tagName: 'BUTTON' })).toBe(false);
    expect(yaziAlaniMi({ tagName: 'INPUT', type: 'radio' })).toBe(false);
    expect(yaziAlaniMi({ tagName: 'INPUT', type: 'file' })).toBe(false);
    expect(yaziAlaniMi({ tagName: 'BODY' })).toBe(false);
    expect(yaziAlaniMi(null)).toBe(false);
  });
});

describe('klavyeAcikMi', () => {
  it('no text field in focus: closed', () => {
    expect(klavyeAcikMi({ odakYazi: false, vvH: 500, enBuyukH: 1180 })).toBe(false);
  });
  it('focus + visible height clearly smaller: open', () => {
    expect(klavyeAcikMi({ odakYazi: true, vvH: 760, enBuyukH: 1180 })).toBe(true);
  });
  it('focus kept but the keyboard closed with its own key (height back): closed', () => {
    expect(klavyeAcikMi({ odakYazi: true, vvH: 1180, enBuyukH: 1180 })).toBe(false);
    expect(klavyeAcikMi({ odakYazi: true, vvH: 1180 - KLAVYE_PAYI + 1, enBuyukH: 1180 })).toBe(false);
  });
  it('height not known: the focus alone', () => {
    expect(klavyeAcikMi({ odakYazi: true, vvH: null, enBuyukH: 1180 })).toBe(true);
    expect(klavyeAcikMi({ odakYazi: true, vvH: 1180, enBuyukH: 0 })).toBe(true);
  });
});
