import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ekranMetni, hazirlikAl, hazirlikEkle, kb, mb, olc, Olcum, olcumAcik, olcumAl, olcumBaslat, olcumBitir, olcumDinle,
  sure, zamanla, zamanlaA, zamanliDrive
} from './sureOlcum';

// a clock that moves only when told
function saat(t = 0) {
  const s = { t, simdi: () => s.t, ilerle: (ms: number) => { s.t += ms; } };
  return s;
}

const sessiz = () => ({ log: vi.fn(), table: vi.fn() });

afterEach(() => { olcumDinle(null); hazirlikAl(); });

describe('Olcum.olc', () => {
  it('writes the time, the group and the details of a step', async () => {
    const c = saat(100);
    const o = new Olcum('Fotoğraf ekleme', c.simdi);
    const r = await o.olc('yükleme', async () => { c.ilerle(250); return new Uint8Array(3); }, { grup: 'aktarim', ek: b => ({ n: b.length }) });
    expect(r).toHaveLength(3);
    expect(o.adimlar).toEqual([{ ad: 'yükleme', ms: 250, grup: 'aktarim', ek: { n: 3 } }]);
  });

  it('a failing step is written too and its error goes on unchanged', async () => {
    const c = saat();
    const o = new Olcum('x', c.simdi);
    const hata = new Error('ağ');
    await expect(o.olc('istek', async () => { c.ilerle(40); throw hata; }, { grup: 'istek' })).rejects.toBe(hata);
    expect(o.adimlar).toEqual([{ ad: 'istek', ms: 40, grup: 'istek', hata: true }]);
  });

  it('the group can depend on the result', async () => {
    const o = new Olcum('x', saat().simdi);
    await o.olc('bayt', async () => 'onbellek', { grup: r => r === 'indirme' ? 'aktarim' : 'cihaz' });
    expect(o.adimlar[0].grup).toBe('cihaz');
  });
});

describe('olc without a measurement', () => {
  it('returns fn()\'s own promise and calls fn once', () => {
    const p = Promise.resolve(7);
    const fn = vi.fn(() => p);
    expect(olc(undefined, 'adım', fn)).toBe(p);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('zamanla / zamanlaA without z: the value itself, nothing written', async () => {
    expect(zamanla(null, 'a', () => 5)).toBe(5);
    const p = Promise.resolve(1);
    expect(zamanlaA(undefined, 'a', () => p)).toBe(p);
  });

  it('zamanla with z adds up the same step', async () => {
    const z: Record<string, number> = {};
    zamanla(z, 'renk', () => 1);
    await zamanlaA(z, 'renk', async () => 2);
    expect(Object.keys(z)).toEqual(['renk']);
    expect(z.renk).toBeGreaterThanOrEqual(0);
  });
});

describe('zamanliDrive', () => {
  it('passes arguments and results through, times each call, uploads with size and kind', async () => {
    const c = saat();
    const o = new Olcum('x', c.simdi);
    const drive = {
      ad: 'drive',
      async modifiedTime(id: string) { c.ilerle(120); return `mt-${id}`; },
      async uploadMedia(id: string, b: Uint8Array) { c.ilerle(900); return { id, n: b.length }; },
      async uploadResumable(id: string, b: Uint8Array) { c.ilerle(2000); return { id, n: b.length }; },
    };
    const z = zamanliDrive(drive, o);
    expect(z.ad).toBe('drive');
    expect(await z.modifiedTime('f1')).toBe('mt-f1');
    expect(await z.uploadMedia('f1', new Uint8Array(1048576))).toEqual({ id: 'f1', n: 1048576 });
    expect(await z.uploadResumable('f1', new Uint8Array(10))).toEqual({ id: 'f1', n: 10 });
    expect(o.adimlar).toEqual([
      { ad: 'drive modifiedTime', ms: 120, grup: 'istek' },
      { ad: 'drive uploadMedia', ms: 900, grup: 'aktarim', ek: { boyut: '1.00 MB', tur: 'media' } },
      { ad: 'drive uploadResumable', ms: 2000, grup: 'aktarim', ek: { boyut: '0.00 MB', tur: 'resumable' } },
    ]);
  });

  it('the wrapped object is not changed (the pen\'s uploads use the original)', async () => {
    const drive = { async canEdit() { return true; } };
    const f = drive.canEdit;
    zamanliDrive(drive, new Olcum('x', saat().simdi));
    expect(drive.canEdit).toBe(f);
  });
});

describe('summary and table', () => {
  it('summary: Ekle→toast, total and the groups added up ("toplam" steps are not)', () => {
    const c = saat(1000);
    const o = new Olcum('Fotoğraf ekleme', c.simdi);
    o.bilgi.foto = 3;
    o.adim('foto a.jpg', 1500, 'hazirlik');
    o.adim('foto b.jpg', 500, 'hazirlik');
    o.adim('drive canEdit', 200, 'istek');
    o.adim('drive modifiedTime', 300, 'istek');
    o.adim('drive uploadMedia', 2500, 'aktarim');
    o.adim('= uploadPdf', 3000, 'toplam');
    c.ilerle(4200);
    o.isaret('toast');
    c.ilerle(300);
    o.bitir();
    c.ilerle(9999);   // after bitir the total stays
    expect(o.ozetSatiri()).toBe('[ölçüm] Fotoğraf ekleme · foto 3 · Ekle→toast 4.2 sn · toplam 4.5 sn · hazırlama 2.0 sn (2) · Drive istekleri 500 ms (2) · aktarım 2.5 sn (1)');
  });

  it('table rows and the screen text line by line', () => {
    const o = new Olcum('Dosya ekle', saat().simdi);
    o.adim('drive cocuklar', 180.4, 'istek');
    o.adim('pdfHazirla', 12, 'pdf', { boyut: '1.20 MB', yok: undefined });
    o.adimlar.push({ ad: 'createPdf', ms: 30, grup: 'toplam', hata: true });
    expect(o.tablo()).toEqual([
      { adım: 'drive cocuklar', ms: 180, grup: 'istek', ayrıntı: '' },
      { adım: 'pdfHazirla', ms: 12, grup: 'pdf', ayrıntı: 'boyut 1.20 MB' },
      { adım: 'createPdf', ms: 30, grup: 'toplam', ayrıntı: 'HATA' },
    ]);
    expect(ekranMetni(o).split('\n')).toEqual([
      '[ölçüm] Dosya ekle',
      '  toplam 0 ms',
      '  Drive istekleri 180 ms (1)',
      '  pdf-lib 12 ms',
      '  hatalı adım 1',
      '',
      'drive cocuklar — 180 ms (istek)',
      'pdfHazirla — 12 ms (pdf)',
      '    boyut 1.20 MB',
      'createPdf — 30 ms (toplam)',
      '    HATA',
    ]);
  });
});

describe('the measurements going on', () => {
  it('olcumBitir: console line + table, the box listener, then forgotten', () => {
    const goren = vi.fn();
    olcumDinle(goren);
    const o = olcumBaslat('islem-1', 'Fotoğraf ekleme', 0, saat(0).simdi);
    expect(olcumAl('islem-1')).toBe(o);
    const cikti = sessiz();
    expect(olcumBitir('islem-1', cikti)).toBe(o);
    expect(cikti.log).toHaveBeenCalledWith(o.ozetSatiri());
    expect(cikti.table).toHaveBeenCalledWith(o.tablo());
    expect(goren).toHaveBeenCalledWith(o);
    expect(olcumAl('islem-1')).toBeUndefined();
    expect(olcumBitir('islem-1', cikti)).toBeUndefined();
    expect(cikti.log).toHaveBeenCalledTimes(1);
  });

  it('a failing listener does not break the end', () => {
    olcumDinle(() => { throw new Error('kutu'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    olcumBaslat('islem-2', 'x');
    expect(() => olcumBitir('islem-2', sessiz())).not.toThrow();
    warn.mockRestore();
  });

  it('hazirlik: taken once, at most the last 50', () => {
    for (let i = 0; i < 55; i++) hazirlikEkle({ ad: `foto ${i}`, ms: i, grup: 'hazirlik' });
    const a = hazirlikAl();
    expect(a).toHaveLength(50);
    expect(a[0].ad).toBe('foto 5');
    expect(hazirlikAl()).toEqual([]);
  });
});

describe('olcumAcik and formats', () => {
  it('only ?olcum=1', () => {
    expect(olcumAcik('?olcum=1')).toBe(true);
    expect(olcumAcik('?a=2&olcum=1')).toBe(true);
    expect(olcumAcik('?olcum=0')).toBe(false);
    expect(olcumAcik('')).toBe(false);
    expect(olcumAcik()).toBe(false);   // tests: no ?olcum=1
  });

  it('ms / sn, kB, MB', () => {
    expect(sure(12.6)).toBe('13 ms');
    expect(sure(999)).toBe('999 ms');
    expect(sure(1250)).toBe('1.3 sn');
    expect(kb(2048)).toBe('2 kB');
    expect(mb(5 * 1048576)).toBe('5.00 MB');
  });
});
