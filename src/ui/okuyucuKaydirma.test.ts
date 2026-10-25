import { describe, expect, it } from 'vitest';
import { DOKUNMA_PAYI_PX, kaymaIptalMi, kaymaSerbestMi, type OgeBilgisi } from './okuyucuKaydirma';

// Task 6.K5b-4: in the reader a finger may move only over something that scrolls (else iPad Safari moves the page).

const oge = (o: Partial<OgeBilgisi> = {}): OgeBilgisi => ({
  tagName: 'DIV', overflowX: 'visible', overflowY: 'visible', scrollWidth: 300, clientWidth: 300, scrollHeight: 500, clientHeight: 500, ...o
});

describe('kaymaSerbestMi', () => {
  it('nothing under the finger scrolls (scrim, bars, the message): no', () => {
    expect(kaymaSerbestMi([oge()])).toBe(false);
    expect(kaymaSerbestMi([])).toBe(false);
  });
  it('the empty page list (no topic): overflow auto but nothing to scroll → no', () => {
    expect(kaymaSerbestMi([oge(), oge({ overflowY: 'auto', scrollHeight: 0, clientHeight: 800 })])).toBe(false);
  });
  it('the pages / the contents list with more than fits: yes, also from a child', () => {
    expect(kaymaSerbestMi([oge({ tagName: 'CANVAS' }), oge(), oge({ overflowY: 'auto', scrollHeight: 4000, clientHeight: 800 })])).toBe(true);
    expect(kaymaSerbestMi([oge({ overflowY: 'scroll', scrollHeight: 900, clientHeight: 600 })])).toBe(true);
  });
  it('a 1 px rounding is not scrolling', () => {
    expect(kaymaSerbestMi([oge({ overflowY: 'auto', scrollHeight: 601, clientHeight: 600 })])).toBe(false);
  });
  it('the tab row scrolling sideways: yes; overflow hidden: no', () => {
    expect(kaymaSerbestMi([oge({ overflowX: 'auto', scrollWidth: 900, clientWidth: 400 })])).toBe(true);
    expect(kaymaSerbestMi([oge({ overflowX: 'hidden', overflowY: 'hidden', scrollWidth: 900, clientWidth: 400, scrollHeight: 900, clientHeight: 400 })])).toBe(false);
  });
  it('form fields (name box, page slider, file select): yes', () => {
    expect(kaymaSerbestMi([oge({ tagName: 'INPUT' })])).toBe(true);
    expect(kaymaSerbestMi([oge({ tagName: 'textarea' })])).toBe(true);
    expect(kaymaSerbestMi([oge({ tagName: 'SELECT' })])).toBe(true);
  });
});

// Task 6.S-1b: a pen tap on a button sends tiny moves; within the margin they are not cancelled (Safari makes the click).
describe('kaymaIptalMi', () => {
  const g = (o: Partial<Parameters<typeof kaymaIptalMi>[0]> = {}) => ({ serbest: false, kontrolde: false, dx: 0, dy: 0, ...o });
  it('on a control, 3 px: not cancelled', () => {
    expect(kaymaIptalMi(g({ kontrolde: true, dx: 3 }))).toBe(false);
    expect(kaymaIptalMi(g({ kontrolde: true, dx: -2, dy: 2 }))).toBe(false);
  });
  it('on a control, 15 px: cancelled (as today)', () => {
    expect(kaymaIptalMi(g({ kontrolde: true, dy: 15 }))).toBe(true);
  });
  it('the margin edge: 9.9 px free, 10 px cancelled', () => {
    expect(kaymaIptalMi(g({ kontrolde: true, dx: 9.9 }))).toBe(false);
    expect(kaymaIptalMi(g({ kontrolde: true, dx: 6, dy: 8 }))).toBe(true);
    expect(DOKUNMA_PAYI_PX).toBe(10);
  });
  it('once past the margin, back to 3 px: still cancelled', () => {
    expect(kaymaIptalMi(g({ kontrolde: true, dx: 3, payAsildi: true }))).toBe(true);
  });
  it('not on a control, 3 px: cancelled (as today)', () => {
    expect(kaymaIptalMi(g({ dx: 3 }))).toBe(true);
    expect(kaymaIptalMi(g())).toBe(true);
  });
  it('something scrolls under it: never cancelled, on a control or not', () => {
    expect(kaymaIptalMi(g({ serbest: true, dy: 300 }))).toBe(false);
    expect(kaymaIptalMi(g({ serbest: true, kontrolde: true, dy: 300, payAsildi: true }))).toBe(false);
  });
});
