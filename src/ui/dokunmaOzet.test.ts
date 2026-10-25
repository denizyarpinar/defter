import { describe, expect, it } from 'vitest';
import { dokunmaMetni, dokunmaSatirlari, dokunuslariAyir, dokunusSatiri, type DokunmaOlayi } from './dokunmaOzet';

// Task 6.S-1a: the touch log's events → one line per touch (who cancelled, did a click come).

const KAYDET = 'button#oKaydet "Kaydet"';
const o = (t: number, tur: DokunmaOlayi['tur'], x: Partial<DokunmaOlayi> = {}): DokunmaOlayi =>
  ({ t, tur, hedef: 'button#oKaydet', kontrol: KAYDET, ...x });

// a tap: pointerdown, touchstart, n touchmoves (iptal: who cancelled each), up, touchend, click?
function dokunus(t: number, pointerType: string, touchType: string, n: number, iptal: string | null, click: boolean): DokunmaOlayi[] {
  const out: DokunmaOlayi[] = [
    o(t, 'pointerdown', { pointerType, pointerId: t }),
    o(t + 1, 'touchstart', { touchType, kalan: 1 }),
  ];
  for (let i = 0; i < n; i++) {
    out.push(o(t + 2 + i, 'touchmove', { touchType, kalan: 1, iptal: !!iptal }));
    if (iptal) out.push(o(t + 2 + i, 'iptal', { kaynak: iptal as DokunmaOlayi['kaynak'], olayTuru: 'touchmove', hedef: '', kontrol: null }));
  }
  out.push(o(t + 140, 'pointerup', { pointerType, pointerId: t }), o(t + 141, 'touchend', { touchType, kalan: 0 }));
  if (click) out.push(o(t + 142, 'click'));
  return out;
}

describe('dokunuslariAyir / dokunusSatiri', () => {
  it('a finger tap on a button: click VAR, nothing cancelled', () => {
    const [d] = dokunuslariAyir(dokunus(0, 'touch', 'direct', 3, null, true));
    expect(d.cihaz).toBe('parmak');
    expect(d.sureMs).toBe(140);
    expect(d.touchmove).toBe(3);
    expect(d.touchmoveIptal).toBe(0);
    expect(dokunusSatiri(d)).toBe(`#1 parmak (touch/direct) | ${KAYDET} | down→up 140 ms | touchmove 3 | click: VAR`);
  });

  it('the pen: touchmoves cancelled by okuyucuKaydirma, no click', () => {
    const [d] = dokunuslariAyir(dokunus(0, 'touch', 'stylus', 23, 'okuyucuKaydirma', false));
    expect(d.cihaz).toBe('kalem');
    expect(dokunusSatiri(d)).toBe(`#1 kalem (touch/stylus) | ${KAYDET} | down→up 140 ms | touchmove 23 (23 iptal: okuyucuKaydirma 23) | click: YOK`);
  });

  it('pointerType pen is the pen too', () => {
    expect(dokunuslariAyir(dokunus(0, 'pen', 'stylus', 0, null, true))[0].cihaz).toBe('kalem');
    expect(dokunuslariAyir(dokunus(0, 'mouse', '', 0, null, true))[0].cihaz).toBe('fare');
  });

  it('defaultPrevented without a source of ours: bilinmeyen', () => {
    const os = dokunus(0, 'touch', 'stylus', 2, null, false).map(e => e.tur === 'touchmove' ? { ...e, iptal: true } : e);
    expect(dokunusSatiri(dokunuslariAyir(os)[0])).toContain('touchmove 2 (2 iptal: bilinmeyen 2)');
  });

  it('touchend cancelled by sayfaZoom and touchstart by kalemModu are listed', () => {
    const os = dokunus(0, 'touch', 'stylus', 0, null, false);
    const ts = os.findIndex(e => e.tur === 'touchstart');
    os.splice(ts + 1, 0, o(1, 'iptal', { kaynak: 'kalemModu', olayTuru: 'touchstart' }));
    os.push(o(141, 'iptal', { kaynak: 'sayfaZoom', olayTuru: 'touchend' }));
    const s = dokunusSatiri(dokunuslariAyir(os)[0]);
    expect(s).toContain('touchstart iptal: kalemModu');
    expect(s).toContain('touchend iptal: sayfaZoom');
  });

  it('a cancel of an event not logged (gesture) stands on its own', () => {
    const os = dokunus(0, 'touch', 'direct', 0, null, true);
    os.splice(3, 0, o(50, 'iptal', { kaynak: 'sayfaZoom', olayTuru: 'gesturestart' }));
    expect(dokunusSatiri(dokunuslariAyir(os)[0])).toContain('gesturestart iptal: sayfaZoom');
  });

  it('pointercancel / touchcancel are counted; down→up ends with the cancel', () => {
    const os: DokunmaOlayi[] = [
      o(0, 'pointerdown', { pointerType: 'touch', pointerId: 1 }), o(1, 'touchstart', { touchType: 'stylus', kalan: 1 }),
      o(60, 'pointercancel', { pointerType: 'touch', pointerId: 1 }), o(61, 'touchcancel', { kalan: 0 }),
    ];
    const [d] = dokunuslariAyir(os);
    expect(d.sureMs).toBe(60);
    expect(dokunusSatiri(d)).toContain('pointercancel 1 | touchcancel 1 | click: YOK');
  });

  it('two taps are two touches; a click of another control says so', () => {
    const os = [...dokunus(0, 'touch', 'direct', 1, null, true), ...dokunus(500, 'touch', 'stylus', 1, null, false)];
    os.push(o(700, 'click', { hedef: 'div#oKitap', kontrol: null }));
    const ds = dokunuslariAyir(os);
    expect(ds).toHaveLength(2);
    expect(ds[0].click).not.toBeNull();
    expect(dokunusSatiri(ds[1])).toContain('click: VAR (başka: div#oKitap)');
  });

  it('a second finger while the first is down is the same touch', () => {
    const os: DokunmaOlayi[] = [
      o(0, 'pointerdown', { pointerType: 'touch', pointerId: 1 }), o(1, 'touchstart', { kalan: 1 }),
      o(10, 'pointerdown', { pointerType: 'touch', pointerId: 2 }), o(11, 'touchstart', { kalan: 2 }),
      o(50, 'pointerup', { pointerType: 'touch', pointerId: 1 }), o(51, 'touchend', { kalan: 1 }),
      o(60, 'pointerup', { pointerType: 'touch', pointerId: 2 }), o(61, 'touchend', { kalan: 0 }),
    ];
    expect(dokunuslariAyir(os)).toHaveLength(1);
  });

  it('a lost up: a down 2 s later starts a new touch', () => {
    const os: DokunmaOlayi[] = [o(0, 'pointerdown', { pointerType: 'touch', pointerId: 1 }), o(3000, 'pointerdown', { pointerType: 'touch', pointerId: 2 })];
    expect(dokunuslariAyir(os)).toHaveLength(2);
  });

  it('a click before any touch (keyboard, the log started late) is skipped', () => {
    expect(dokunuslariAyir([o(0, 'click')])).toHaveLength(0);
  });

  it('the box: the last 30, newest first; Kopyala adds the raw events', () => {
    const os: DokunmaOlayi[] = [];
    for (let i = 0; i < 35; i++) os.push(...dokunus(i * 1000, 'touch', 'direct', 0, null, true));
    const satirlar = dokunmaSatirlari(os);
    expect(satirlar).toHaveLength(30);
    expect(satirlar[0].startsWith('#35 ')).toBe(true);
    expect(satirlar[29].startsWith('#6 ')).toBe(true);
    const metin = dokunmaMetni(os).split('\n');
    expect(metin[0].startsWith('#6 ')).toBe(true);
    expect(metin[30]).toBe('');
    expect(JSON.parse(metin[31].replace(/^#6 /, ''))[0].tur).toBe('pointerdown');
  });
});
