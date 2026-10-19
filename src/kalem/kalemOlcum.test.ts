import { describe, expect, it } from 'vitest';
import { hamUzunluk, KalemOlcer, MAX_KAYIT, MAX_OLAY, noktaUzunlugu, ozet, toplam, type OlayGirdi } from './kalemOlcum';

// Task 6.H2: the pen stroke measurement (diagnosis only)

const ev = (x: number, y: number, t: number, p = 0.3, id = 1): OlayGirdi =>
  ({ clientX: x, clientY: y, timeStamp: t, pressure: p, pointerType: 'pen', pointerId: id });

describe('KalemOlcer', () => {
  it('a tap with no move: one kept point, a dot, the up\'s distance is lost', () => {
    const o = new KalemOlcer(() => 0);
    o.basla(ev(10, 10, 100, 0.2), 'kalem', 1.5);
    o.bitir(ev(10, 22, 140, 0), 'u', [50, 50]);
    const k = o.son()!;
    expect(k.sonuc).toBe('up');
    expect(k.sayilar).toEqual({ down: 1, move: 0, coalesced: 0, predicted: 0, up: 1, cancel: 0 });
    expect(k.sureMs).toBe(40);
    expect(k.ilkMoveMs).toBeNull();
    expect(k.hamUzunlukPx).toBe(12);
    expect(k.upKayipPx).toBe(12);
    expect(k.saklananNokta).toBe(1);
    expect(k.nokta).toBe(true);
    expect(k.basinc).toEqual({ min: 0.2, max: 0.2, ilk: 0.2, up: 0 });
    expect(k.olaylar.map(e => e[0])).toEqual(['d', 'u']);
    expect(k.saklanan).toEqual([50, 50]);
    expect(ozet(k)).toContain('NOKTA');
  });

  it('moves with coalesced events: counts, first move delay, length through the coalesced points', () => {
    const o = new KalemOlcer(() => 0);
    o.basla(ev(0, 0, 0), 'kalem', 1.5);
    o.hareket(ev(0, 8, 30), [ev(0, 4, 26), ev(0, 8, 30)], 0);
    o.hareket(ev(6, 8, 46), [], 2);
    o.bitir(ev(6, 8, 50), 'u', [0, 0, 0, 2, 0, 4, 3, 4]);
    const k = o.son()!;
    expect(k.sayilar).toMatchObject({ move: 2, coalesced: 2, predicted: 2 });
    expect(k.ilkMoveMs).toBe(30);
    expect(k.hamUzunlukPx).toBe(14);   // 0→4→8 down, then 6 across; the up adds nothing
    expect(k.upKayipPx).toBe(0);
    expect(k.denenen).toBe(5);         // down + 2 coalesced + 1 move without coalesced + the up (6.H2b: kept)
    expect(k.atilanYakin).toBe(1);     // the up: on the last point (it takes its place)
    expect(k.uzunlukPt).toBe(7);
    expect(k.nokta).toBe(false);
    expect(k.olaylar.map(e => e[0])).toEqual(['d', 'm', 'c', 'c', 'm', 'u']);
  });

  it('6.H2b: dropped repeats (cift), the same event object again, untrusted, which listener', () => {
    const o = new KalemOlcer(() => 0);
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.kimlik(false, 'oScroll', true); o.hareket(ev(0, 4, 10), [], 0);
    o.kimlik(true, 'oScroll', true); o.cift(); o.hareket(ev(0, 4, 10), [], 0);
    o.kimlik(false, 'oKitap', false);
    o.bitir(ev(0, 6, 20), 'u', [0, 0, 0, 4, 0, 6]);
    const k = o.son()!;
    expect(k).toMatchObject({ cift: 1, ayniNesne: 1, guvenilmez: 1, hedefler: ['oScroll', 'oKitap'] });
    expect(k.denenen).toBe(4);       // down, 2 moves, the up
    expect(k.atilanYakin).toBe(0);   // 4 offered − 1 repeat − 3 kept
    expect(ozet(k)).toContain('çift 1');
    expect(ozet(k)).toContain('aynı olay 1');
  });

  it('another pointer\'s moves are not counted', () => {
    const o = new KalemOlcer(() => 0);
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.hareket(ev(5, 5, 10, 0.3, 2), [], 0);
    o.bitir(ev(0, 0, 20), 'u', [0, 0]);
    expect(o.son()!.sayilar.move).toBe(0);
  });

  it('cancel: by the browser, by a second finger, from outside', () => {
    const o = new KalemOlcer(() => 500);
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.bitir(ev(1, 1, 5), 'x', [0, 0]);
    expect(o.son()!.sonuc).toBe('cancel');
    expect(o.son()!.sayilar.cancel).toBe(1);

    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.neden('iptal-ikinci-parmak');
    o.bitir(null, null, [0, 0]);
    expect(o.son()!.sonuc).toBe('iptal-ikinci-parmak');

    o.basla(ev(0, 0, 100), 'kalem', 1);
    o.bitir(null, null, [0, 0]);
    expect(o.son()!.sonuc).toBe('iptal-dis');
    expect(o.son()!.sureMs).toBe(400);
  });

  it('rejected downs, palm touches, stylus touchstarts', () => {
    let t = 0;
    const o = new KalemOlcer(() => t);
    o.reddet(ev(0, 0, 0), 'cizim-suruyor (id 3)');
    expect(o.son()).toMatchObject({ sonuc: 'reddedildi', neden: 'cizim-suruyor (id 3)' });
    expect(ozet(o.son())).toContain('REDDEDİLDİ');

    o.touchstart(false);          // just before the down: belongs to the stroke
    t = 50;
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.touchstart(true);
    o.avuc(); o.avuc();
    o.bitir(ev(0, 0, 10), 'u', [0, 0]);
    expect(o.son()).toMatchObject({ stylusTouchstart: 2, cancelableDegil: 1, avuc: 2 });

    o.touchstart(true);           // long before the next down: not counted
    t = 1000;
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.bitir(ev(0, 0, 10), 'u', [0, 0]);
    expect(o.son()!.stylusTouchstart).toBe(0);
  });

  it('keeps the last 50 records and at most 300 events / point pairs per stroke', () => {
    const o = new KalemOlcer(() => 0);
    for (let i = 0; i < MAX_KAYIT + 5; i++) o.reddet(ev(i, 0, 0), 'sayfa-yok');
    expect(o.kayitlar()).toHaveLength(MAX_KAYIT);
    expect(o.kayitlar()[0].olaylar[0][1]).toBe(5);

    o.basla(ev(0, 0, 0), 'kalem', 1);
    const pdf: number[] = [];
    for (let i = 1; i <= 400; i++) { o.hareket(ev(i, 0, i), [], 0); pdf.push(i, 0); }
    o.bitir(ev(401, 0, 401), 'u', pdf);
    const k = o.son()!;
    expect(k.olaylar).toHaveLength(MAX_OLAY);
    expect(k.saklanan).toHaveLength(2 * MAX_OLAY);
    expect(k.hamUzunlukPx).toBe(401);   // the length still uses every event
    expect(k.sayilar.move).toBe(400);

    o.sifirla();
    expect(o.kayitlar()).toEqual([]);
  });

  it('tells its listener about each record', () => {
    const o = new KalemOlcer(() => 0);
    const seen: string[] = [];
    o.dinle(k => seen.push(k.sonuc));
    o.reddet(ev(0, 0, 0), 'dugme');
    o.basla(ev(0, 0, 0), 'kalem', 1);
    o.bitir(ev(0, 0, 1), 'u', [0, 0]);
    expect(seen).toEqual(['reddedildi', 'up']);
  });
});

describe('summaries', () => {
  it('lengths', () => {
    expect(hamUzunluk([['d', 0, 0, 0, 0], ['m', 3, 4, 1, 0]])).toBe(5);
    expect(noktaUzunlugu([0, 0, 3, 4, 3, 10])).toBe(11);
    expect(noktaUzunlugu([1, 1])).toBe(0);
  });

  it('toplam counts dots, strokes without moves, cancels, rejected downs', () => {
    const o = new KalemOlcer(() => 0);
    o.basla(ev(0, 0, 0), 'kalem', 1); o.bitir(ev(0, 5, 10), 'u', [0, 0]);
    o.basla(ev(0, 0, 0), 'kalem', 1); o.hareket(ev(0, 5, 5), [], 0); o.bitir(ev(0, 5, 10), 'u', [0, 0, 0, 5]);
    o.basla(ev(0, 0, 0), 'kalem', 1); o.bitir(ev(0, 0, 3), 'x', [0, 0]);
    o.reddet(ev(0, 0, 0), 'perde');
    expect(toplam(o.kayitlar())).toBe("son 4: 3 çizgi · 2 nokta · 2 move'suz · 1 cancel · 0 çift · 0 iptal · 1 reddedildi · 0 avuç");
    expect(ozet(undefined)).toBe('–');
  });
});
