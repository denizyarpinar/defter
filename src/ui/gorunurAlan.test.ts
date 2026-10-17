import { describe, expect, it } from 'vitest';
import { klavyeAcikMi, klavyeKapandiMi, KLAVYE_PAYI, yaziAlaniMi } from './gorunurAlan';

// Task 5.10g-ek / ek2: when is the iPad keyboard open / closed (the page goes back to the top after it).

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

describe('klavyeKapandiMi', () => {
  it('was open, height back at the tallest: closed now', () => {
    expect(klavyeKapandiMi({ oncekiAcik: true, vvH: 1180, enBuyukH: 1180 })).toBe(true);
    expect(klavyeKapandiMi({ oncekiAcik: true, vvH: 1128, enBuyukH: 1180 })).toBe(true);   // Safari's bar shown again
  });
  it('still small, or was not open: no', () => {
    expect(klavyeKapandiMi({ oncekiAcik: true, vvH: 760, enBuyukH: 1180 })).toBe(false);
    expect(klavyeKapandiMi({ oncekiAcik: false, vvH: 1180, enBuyukH: 1180 })).toBe(false);
    expect(klavyeKapandiMi({ oncekiAcik: true, vvH: 1180, enBuyukH: 0 })).toBe(false);
  });
});
